#!/usr/bin/env python3
import argparse
import base64
import sys
from io import BytesIO


def _load_classes(path: str):
    with open(path, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f.readlines()]
    return [line for line in lines if line]


def _normalize_label(raw: str):
    if raw is None:
        return ""
    text = str(raw).strip().upper()
    text = "".join(ch for ch in text if ch.isalnum())
    return text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--classes", required=True)
    args = parser.parse_args()

    try:
        from PIL import Image
        import numpy as np
        from ultralytics import YOLO
    except Exception:
        print("missing_python_dependencies", file=sys.stderr)
        return 2

    payload = sys.stdin.read().strip()
    if not payload:
        print("empty_payload", file=sys.stderr)
        return 3

    try:
        image_bytes = base64.b64decode(payload)
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        image_np = np.array(image)
    except Exception:
        print("invalid_image", file=sys.stderr)
        return 4

    try:
        model = YOLO(args.model)
        result = model.predict(source=image_np, verbose=False, conf=0.2)[0]
    except Exception:
        print("predict_failed", file=sys.stderr)
        return 5

    classes = _load_classes(args.classes)
    names = getattr(model, "names", {})
    chars = []
    boxes = getattr(result, "boxes", None)
    if boxes is None or len(boxes) == 0:
        print("no_boxes", file=sys.stderr)
        return 6

    for box in boxes:
        xyxy = box.xyxy[0].tolist()
        cls_index = int(box.cls[0].item())
        center_x = (xyxy[0] + xyxy[2]) / 2.0

        label = ""
        if isinstance(names, dict) and cls_index in names:
            label = str(names[cls_index])
        elif isinstance(names, list) and 0 <= cls_index < len(names):
            label = str(names[cls_index])
        elif 0 <= cls_index < len(classes):
            label = classes[cls_index]
        else:
            label = str(cls_index)

        normalized = _normalize_label(label)
        if not normalized:
            continue
        chars.append((center_x, normalized))

    if not chars:
        print("no_chars", file=sys.stderr)
        return 7

    chars.sort(key=lambda item: item[0])
    code = "".join(part for _, part in chars)
    code = _normalize_label(code)
    if len(code) < 4:
        print("code_too_short", file=sys.stderr)
        return 8

    print(code[:6])
    return 0


if __name__ == "__main__":
    sys.exit(main())
