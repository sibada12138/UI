import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';

const FALLBACK_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DEFAULT_IMG_SIZE = 640;
const DEFAULT_CONF = 0.25;
const DEFAULT_NMS = 0.45;
const DEFAULT_PROVIDER = 'cpu';
const DEFAULT_REG_MAX = 16;
const DEFAULT_STRIDES = [8, 16, 32] as const;

type NumericArrayLike = {
  readonly length: number;
  [index: number]: number | bigint;
};

type GridCell = {
  x: number;
  y: number;
  stride: number;
};

type CandidateDetection = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  clsId: number;
};

type PreprocessMeta = {
  width: number;
  height: number;
  scale: number;
  padX: number;
  padY: number;
};

type TensorView = {
  dims: number[];
  data: Float32Array;
};

export type CaptchaDetection = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  cls_id: number;
};

export type CaptchaRecognizeResult = {
  success: true;
  text: string;
  detections: CaptchaDetection[];
};

export type CaptchaRecognizeOptions = {
  imgSize?: number;
  conf?: number;
  nms?: number;
  provider?: string;
};

export class CaptchaOnnxService {
  private static sessionCache = new Map<string, Promise<ort.InferenceSession>>();
  private static charsetCache = new Map<string, Promise<string[]>>();

  private resolveResourcePath(configuredPath: string) {
    const normalized = configuredPath.trim();
    if (path.isAbsolute(normalized)) {
      return path.resolve(normalized);
    }

    const baseDirs = [
      process.cwd(),
      path.resolve(process.cwd(), '..'),
      path.resolve(process.cwd(), '..', '..'),
      __dirname,
      path.resolve(__dirname, '..'),
      path.resolve(__dirname, '..', '..'),
      path.resolve(__dirname, '..', '..', '..'),
      path.resolve(__dirname, '..', '..', '..', '..'),
      path.resolve(__dirname, '..', '..', '..', '..', '..'),
    ];
    const candidates = Array.from(
      new Set(baseDirs.map((baseDir) => path.resolve(baseDir, normalized))),
    );
    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  }

  private resolveModelPath() {
    const configured =
      process.env.CAPTCHA_MODEL_PATH?.trim() ||
      process.env.CAPTCHA_OCR_MODEL_PATH?.trim() ||
      './best.onnx';
    return this.resolveResourcePath(configured);
  }

  private resolveCharsetPath() {
    const configured =
      process.env.CAPTCHA_CHARSET_PATH?.trim() ||
      process.env.CAPTCHA_OCR_CLASSES_PATH?.trim() ||
      './classes.txt';
    return this.resolveResourcePath(configured);
  }

  private normalizeProvider(provider?: string) {
    const raw = String(provider ?? DEFAULT_PROVIDER)
      .trim()
      .toLowerCase();
    return raw || DEFAULT_PROVIDER;
  }

  private normalizeImgSize(value?: number) {
    const parsed = Number(value ?? DEFAULT_IMG_SIZE);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_IMG_SIZE;
    }
    const rounded = Math.round(parsed);
    return Math.max(64, Math.min(2048, rounded));
  }

  private normalizeThreshold(
    value: number | undefined,
    fallback: number,
    min: number,
    max: number,
  ) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  private toProbability(value: number) {
    if (Number.isFinite(value) && value >= 0 && value <= 1) {
      return value;
    }
    const clamped = Math.max(-60, Math.min(60, value));
    return 1 / (1 + Math.exp(-clamped));
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private isLikelyBase64(input: string) {
    return /^[A-Za-z0-9+/=]+$/.test(input);
  }

  private normalizeImageInput(input: Buffer | string) {
    if (Buffer.isBuffer(input)) {
      if (input.length === 0) {
        throw new Error('IMAGE_PAYLOAD_EMPTY');
      }
      return input;
    }

    const raw = String(input ?? '').trim();
    if (!raw) {
      throw new Error('IMAGE_PAYLOAD_EMPTY');
    }

    const base64Part = raw.startsWith('data:image')
      ? raw.split(',').slice(1).join(',')
      : raw;
    const sanitized = base64Part.replace(/\s+/g, '');
    if (!sanitized || !this.isLikelyBase64(sanitized)) {
      throw new Error('IMAGE_BASE64_INVALID');
    }

    const buffer = Buffer.from(sanitized, 'base64');
    if (buffer.length === 0) {
      throw new Error('IMAGE_BASE64_INVALID');
    }
    return buffer;
  }

  private toFloat32Array(source: unknown) {
    if (source instanceof Float32Array) {
      return source;
    }
    if (Array.isArray(source)) {
      return Float32Array.from(source.map((item) => Number(item)));
    }
    if (source && ArrayBuffer.isView(source)) {
      const view = source as unknown as NumericArrayLike;
      const out = new Float32Array(view.length);
      for (let i = 0; i < view.length; i += 1) {
        out[i] = Number(view[i]);
      }
      return out;
    }
    throw new Error('CAPTCHA_OCR_OUTPUT_TYPE_UNSUPPORTED');
  }

  private readNchw(
    data: Float32Array,
    channels: number,
    height: number,
    width: number,
    channel: number,
    y: number,
    x: number,
  ) {
    const index = ((channel * height + y) * width + x) % data.length;
    if (channel < 0 || channel >= channels || index < 0) {
      return 0;
    }
    return data[index] ?? 0;
  }

  private dflExpectationNchw(
    data: Float32Array,
    channels: number,
    height: number,
    width: number,
    channelOffset: number,
    y: number,
    x: number,
    regMax = DEFAULT_REG_MAX,
  ) {
    let maxLogit = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < regMax; i += 1) {
      const value = this.readNchw(
        data,
        channels,
        height,
        width,
        channelOffset + i,
        y,
        x,
      );
      if (value > maxLogit) {
        maxLogit = value;
      }
    }

    let denominator = 0;
    let numerator = 0;
    for (let i = 0; i < regMax; i += 1) {
      const value = this.readNchw(
        data,
        channels,
        height,
        width,
        channelOffset + i,
        y,
        x,
      );
      const weight = Math.exp(value - maxLogit);
      denominator += weight;
      numerator += weight * i;
    }

    if (!Number.isFinite(denominator) || denominator <= 0) {
      return 0;
    }
    return numerator / denominator;
  }

  private dflExpectationFlat(
    getValue: (channel: number) => number,
    channelOffset: number,
    regMax = DEFAULT_REG_MAX,
  ) {
    let maxLogit = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < regMax; i += 1) {
      const value = getValue(channelOffset + i);
      if (value > maxLogit) {
        maxLogit = value;
      }
    }

    let denominator = 0;
    let numerator = 0;
    for (let i = 0; i < regMax; i += 1) {
      const value = getValue(channelOffset + i);
      const weight = Math.exp(value - maxLogit);
      denominator += weight;
      numerator += weight * i;
    }
    if (!Number.isFinite(denominator) || denominator <= 0) {
      return 0;
    }
    return numerator / denominator;
  }

  private decodeDirectBox(
    rawX: number,
    rawY: number,
    rawW: number,
    rawH: number,
    imgSize: number,
    gridCell?: GridCell,
  ) {
    let cx = rawX;
    let cy = rawY;
    let bw = Math.abs(rawW);
    let bh = Math.abs(rawH);

    const normalized =
      cx >= 0 &&
      cx <= 1 &&
      cy >= 0 &&
      cy <= 1 &&
      bw > 0 &&
      bw <= 1 &&
      bh > 0 &&
      bh <= 1;
    if (normalized) {
      cx *= imgSize;
      cy *= imgSize;
      bw *= imgSize;
      bh *= imgSize;
    } else if (gridCell) {
      const stride = gridCell.stride;
      if (Math.abs(cx) <= 4 && Math.abs(cy) <= 4) {
        cx = (gridCell.x + cx) * stride;
        cy = (gridCell.y + cy) * stride;
      } else if (Math.abs(cx) <= 1 && Math.abs(cy) <= 1) {
        cx = (gridCell.x + 0.5 + cx) * stride;
        cy = (gridCell.y + 0.5 + cy) * stride;
      }
      if (bw <= 4) {
        bw *= stride;
      }
      if (bh <= 4) {
        bh *= stride;
      }
    }

    if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
      return null;
    }
    if (!Number.isFinite(bw) || !Number.isFinite(bh) || bw <= 0 || bh <= 0) {
      return null;
    }

    const x1 = cx - bw / 2;
    const y1 = cy - bh / 2;
    const x2 = cx + bw / 2;
    const y2 = cy + bh / 2;
    if (!Number.isFinite(x1) || !Number.isFinite(y1)) {
      return null;
    }
    if (!Number.isFinite(x2) || !Number.isFinite(y2)) {
      return null;
    }
    return { x1, y1, x2, y2 };
  }

  private buildGridMap(totalCells: number, imgSize: number) {
    const cells: GridCell[] = [];
    for (const stride of DEFAULT_STRIDES) {
      const grid = Math.round(imgSize / stride);
      for (let y = 0; y < grid; y += 1) {
        for (let x = 0; x < grid; x += 1) {
          cells.push({ x, y, stride });
        }
      }
    }
    if (cells.length === totalCells) {
      return cells;
    }

    const sqrt = Math.sqrt(totalCells);
    if (Number.isInteger(sqrt) && sqrt > 0) {
      const grid = Number(sqrt);
      const stride = imgSize / grid;
      const fallback: GridCell[] = [];
      for (let y = 0; y < grid; y += 1) {
        for (let x = 0; x < grid; x += 1) {
          fallback.push({ x, y, stride });
        }
      }
      if (fallback.length === totalCells) {
        return fallback;
      }
    }

    return null;
  }

  private restoreFromLetterbox(
    box: CandidateDetection,
    meta: PreprocessMeta,
  ): CandidateDetection | null {
    const x1 = this.clamp((box.x1 - meta.padX) / meta.scale, 0, meta.width - 1);
    const y1 = this.clamp((box.y1 - meta.padY) / meta.scale, 0, meta.height - 1);
    const x2 = this.clamp((box.x2 - meta.padX) / meta.scale, 0, meta.width - 1);
    const y2 = this.clamp((box.y2 - meta.padY) / meta.scale, 0, meta.height - 1);

    if (!Number.isFinite(x1) || !Number.isFinite(y1)) {
      return null;
    }
    if (!Number.isFinite(x2) || !Number.isFinite(y2)) {
      return null;
    }
    if (x2 <= x1 || y2 <= y1) {
      return null;
    }
    return {
      ...box,
      x1,
      y1,
      x2,
      y2,
    };
  }

  private iou(a: CandidateDetection, b: CandidateDetection) {
    const x1 = Math.max(a.x1, b.x1);
    const y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2);
    const y2 = Math.min(a.y2, b.y2);
    const interW = Math.max(0, x2 - x1);
    const interH = Math.max(0, y2 - y1);
    const interArea = interW * interH;
    if (interArea <= 0) {
      return 0;
    }
    const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
    const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
    const union = areaA + areaB - interArea;
    if (union <= 0) {
      return 0;
    }
    return interArea / union;
  }

  private applyNms(items: CandidateDetection[], threshold: number) {
    const sorted = [...items].sort((a, b) => b.score - a.score);
    const kept: CandidateDetection[] = [];

    while (sorted.length > 0) {
      const current = sorted.shift();
      if (!current) {
        break;
      }
      kept.push(current);
      for (let i = sorted.length - 1; i >= 0; i -= 1) {
        if (this.iou(current, sorted[i]) > threshold) {
          sorted.splice(i, 1);
        }
      }
    }
    return kept;
  }

  private roundNumber(value: number, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  private toTensorView(tensor: ort.Tensor): TensorView {
    return {
      dims: tensor.dims.map((item) => Number(item)),
      data: this.toFloat32Array(tensor.data),
    };
  }

  private decodeCombinedDflNchw(
    tensor: TensorView,
    classCount: number,
    confThreshold: number,
    imgSize: number,
  ) {
    const [, channels, height, width] = tensor.dims;
    const stride = imgSize / width;
    const output: CandidateDetection[] = [];
    const clsOffset = DEFAULT_REG_MAX * 4;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let bestClass = -1;
        let bestScore = 0;
        for (let cls = 0; cls < classCount; cls += 1) {
          const rawScore = this.readNchw(
            tensor.data,
            channels,
            height,
            width,
            clsOffset + cls,
            y,
            x,
          );
          const score = this.toProbability(rawScore);
          if (score > bestScore) {
            bestScore = score;
            bestClass = cls;
          }
        }

        if (bestClass < 0 || bestScore < confThreshold) {
          continue;
        }

        const l =
          this.dflExpectationNchw(
            tensor.data,
            channels,
            height,
            width,
            0,
            y,
            x,
          ) * stride;
        const t =
          this.dflExpectationNchw(
            tensor.data,
            channels,
            height,
            width,
            DEFAULT_REG_MAX,
            y,
            x,
          ) * stride;
        const r =
          this.dflExpectationNchw(
            tensor.data,
            channels,
            height,
            width,
            DEFAULT_REG_MAX * 2,
            y,
            x,
          ) * stride;
        const b =
          this.dflExpectationNchw(
            tensor.data,
            channels,
            height,
            width,
            DEFAULT_REG_MAX * 3,
            y,
            x,
          ) * stride;

        const cx = (x + 0.5) * stride;
        const cy = (y + 0.5) * stride;
        const x1 = cx - l;
        const y1 = cy - t;
        const x2 = cx + r;
        const y2 = cy + b;
        if (x2 <= x1 || y2 <= y1) {
          continue;
        }

        output.push({
          x1,
          y1,
          x2,
          y2,
          score: bestScore,
          clsId: bestClass,
        });
      }
    }
    return output;
  }

  private decodeDirectNchw(
    tensor: TensorView,
    classCount: number,
    confThreshold: number,
    imgSize: number,
  ) {
    const [, channels, height, width] = tensor.dims;
    const stride = imgSize / width;
    const output: CandidateDetection[] = [];

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let bestClass = -1;
        let bestScore = 0;
        for (let cls = 0; cls < classCount; cls += 1) {
          const raw = this.readNchw(
            tensor.data,
            channels,
            height,
            width,
            4 + cls,
            y,
            x,
          );
          const score = this.toProbability(raw);
          if (score > bestScore) {
            bestScore = score;
            bestClass = cls;
          }
        }
        if (bestClass < 0 || bestScore < confThreshold) {
          continue;
        }

        const rawX = this.readNchw(tensor.data, channels, height, width, 0, y, x);
        const rawY = this.readNchw(tensor.data, channels, height, width, 1, y, x);
        const rawW = this.readNchw(tensor.data, channels, height, width, 2, y, x);
        const rawH = this.readNchw(tensor.data, channels, height, width, 3, y, x);
        const box = this.decodeDirectBox(rawX, rawY, rawW, rawH, imgSize, {
          x,
          y,
          stride,
        });
        if (!box) {
          continue;
        }
        output.push({
          ...box,
          score: bestScore,
          clsId: bestClass,
        });
      }
    }

    return output;
  }

  private guessFlatLayout(dims: number[], classCount: number) {
    if (dims.length === 2) {
      const [first, second] = dims;
      if (second >= classCount + 4 && second <= first) {
        return { n: first, c: second, nlc: true };
      }
      if (first >= classCount + 4 && first < second) {
        return { n: second, c: first, nlc: false };
      }
      return { n: first, c: second, nlc: true };
    }

    if (dims.length === 3 && dims[0] === 1) {
      const first = dims[1];
      const second = dims[2];
      const minChannel = classCount + 4;
      const maxChannel = classCount + DEFAULT_REG_MAX * 4 + 64;
      const firstLooksLikeChannel =
        first >= minChannel && first <= Math.max(maxChannel, first);
      const secondLooksLikeChannel =
        second >= minChannel && second <= Math.max(maxChannel, second);

      if (secondLooksLikeChannel && !firstLooksLikeChannel) {
        return { n: first, c: second, nlc: true };
      }
      if (firstLooksLikeChannel && !secondLooksLikeChannel) {
        return { n: second, c: first, nlc: false };
      }
      if (second <= first) {
        return { n: first, c: second, nlc: true };
      }
      return { n: second, c: first, nlc: false };
    }

    return null;
  }

  private decodeFlatTensor(
    tensor: TensorView,
    classCount: number,
    confThreshold: number,
    imgSize: number,
  ) {
    const layout = this.guessFlatLayout(tensor.dims, classCount);
    if (!layout) {
      return [];
    }

    const { n, c, nlc } = layout;
    if (n <= 0 || c <= 0) {
      return [];
    }

    const readValue = (index: number, channel: number) => {
      const flatIndex = nlc ? index * c + channel : channel * n + index;
      if (flatIndex < 0 || flatIndex >= tensor.data.length) {
        return 0;
      }
      return tensor.data[flatIndex] ?? 0;
    };

    const output: CandidateDetection[] = [];
    const gridMap = this.buildGridMap(n, imgSize);

    if (c >= classCount + DEFAULT_REG_MAX * 4) {
      if (!gridMap) {
        return output;
      }

      for (let i = 0; i < n; i += 1) {
        let bestClass = -1;
        let bestScore = 0;
        for (let cls = 0; cls < classCount; cls += 1) {
          const raw = readValue(i, DEFAULT_REG_MAX * 4 + cls);
          const score = this.toProbability(raw);
          if (score > bestScore) {
            bestScore = score;
            bestClass = cls;
          }
        }

        if (bestClass < 0 || bestScore < confThreshold) {
          continue;
        }

        const cell = gridMap[i];
        const l =
          this.dflExpectationFlat((channel) => readValue(i, channel), 0) *
          cell.stride;
        const t =
          this.dflExpectationFlat(
            (channel) => readValue(i, channel),
            DEFAULT_REG_MAX,
          ) * cell.stride;
        const r =
          this.dflExpectationFlat(
            (channel) => readValue(i, channel),
            DEFAULT_REG_MAX * 2,
          ) * cell.stride;
        const b =
          this.dflExpectationFlat(
            (channel) => readValue(i, channel),
            DEFAULT_REG_MAX * 3,
          ) * cell.stride;
        const cx = (cell.x + 0.5) * cell.stride;
        const cy = (cell.y + 0.5) * cell.stride;
        const x1 = cx - l;
        const y1 = cy - t;
        const x2 = cx + r;
        const y2 = cy + b;
        if (x2 <= x1 || y2 <= y1) {
          continue;
        }

        output.push({
          x1,
          y1,
          x2,
          y2,
          score: bestScore,
          clsId: bestClass,
        });
      }
      return output;
    }

    const hasObjectness = c >= classCount + 5;
    const clsStart = hasObjectness ? 5 : 4;
    if (c < clsStart + classCount) {
      return output;
    }

    for (let i = 0; i < n; i += 1) {
      const objectness = hasObjectness ? this.toProbability(readValue(i, 4)) : 1;
      let bestClass = -1;
      let bestScore = 0;
      for (let cls = 0; cls < classCount; cls += 1) {
        const score = objectness * this.toProbability(readValue(i, clsStart + cls));
        if (score > bestScore) {
          bestScore = score;
          bestClass = cls;
        }
      }
      if (bestClass < 0 || bestScore < confThreshold) {
        continue;
      }

      const box = this.decodeDirectBox(
        readValue(i, 0),
        readValue(i, 1),
        readValue(i, 2),
        readValue(i, 3),
        imgSize,
        gridMap?.[i],
      );
      if (!box) {
        continue;
      }

      output.push({
        ...box,
        score: bestScore,
        clsId: bestClass,
      });
    }

    return output;
  }

  private decodeDetections(
    tensors: TensorView[],
    classCount: number,
    confThreshold: number,
    imgSize: number,
  ) {
    if (tensors.length === 0) {
      return [];
    }

    const by4d = tensors.filter(
      (tensor) =>
        tensor.dims.length === 4 &&
        tensor.dims[0] === 1 &&
        tensor.dims[2] > 0 &&
        tensor.dims[3] > 0,
    );

    if (tensors.length === 3 && by4d.length === 3) {
      const detections: CandidateDetection[] = [];
      const sorted = [...by4d].sort(
        (a, b) => (b.dims[3] ?? 0) - (a.dims[3] ?? 0),
      );

      for (const tensor of sorted) {
        const channels = tensor.dims[1] ?? 0;
        if (channels >= classCount + DEFAULT_REG_MAX * 4) {
          detections.push(
            ...this.decodeCombinedDflNchw(
              tensor,
              classCount,
              confThreshold,
              imgSize,
            ),
          );
          continue;
        }
        if (channels >= classCount + 4) {
          detections.push(
            ...this.decodeDirectNchw(tensor, classCount, confThreshold, imgSize),
          );
        }
      }
      if (detections.length > 0) {
        return detections;
      }
    }

    const decoded: CandidateDetection[] = [];
    for (const tensor of tensors) {
      if (tensor.dims.length === 4 && tensor.dims[0] === 1) {
        const channels = tensor.dims[1] ?? 0;
        if (channels >= classCount + DEFAULT_REG_MAX * 4) {
          decoded.push(
            ...this.decodeCombinedDflNchw(
              tensor,
              classCount,
              confThreshold,
              imgSize,
            ),
          );
          continue;
        }
        if (channels >= classCount + 4) {
          decoded.push(
            ...this.decodeDirectNchw(tensor, classCount, confThreshold, imgSize),
          );
          continue;
        }
      }

      decoded.push(
        ...this.decodeFlatTensor(tensor, classCount, confThreshold, imgSize),
      );
    }

    return decoded;
  }

  private async loadCharset() {
    const charsetPath = this.resolveCharsetPath();
    const cached = CaptchaOnnxService.charsetCache.get(charsetPath);
    if (cached) {
      return cached;
    }

    const loadingPromise = (async () => {
      try {
        const raw = await fs.readFile(charsetPath, 'utf8');
        const chars = raw
          .split(/[\r\n,]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        if (chars.length > 0) {
          return chars;
        }
      } catch {
        // fall back to built-in charset
      }
      return FALLBACK_CHARSET;
    })();

    CaptchaOnnxService.charsetCache.set(charsetPath, loadingPromise);
    return loadingPromise;
  }

  private async createSession(provider: string, modelPath: string) {
    await fs.access(modelPath);
    const modelBytes = new Uint8Array(await fs.readFile(modelPath));

    const preferred = this.normalizeProvider(provider);
    const options = (
      executionProviders: string[],
    ): ort.InferenceSession.SessionOptions => ({
      executionProviders:
        executionProviders as ort.InferenceSession.SessionOptions['executionProviders'],
      graphOptimizationLevel: 'all',
    });

    if (preferred !== 'cpu') {
      try {
        return await ort.InferenceSession.create(modelBytes, options([preferred, 'cpu']));
      } catch {
        return await ort.InferenceSession.create(modelBytes, options(['cpu']));
      }
    }
    return ort.InferenceSession.create(modelBytes, options(['cpu']));
  }

  private async getSession(provider?: string) {
    const modelPath = this.resolveModelPath();
    const normalizedProvider = this.normalizeProvider(
      provider ?? process.env.CAPTCHA_PROVIDER ?? DEFAULT_PROVIDER,
    );
    const cacheKey = `${modelPath}|${normalizedProvider}`;
    const cached = CaptchaOnnxService.sessionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const creating = this.createSession(normalizedProvider, modelPath);
    CaptchaOnnxService.sessionCache.set(cacheKey, creating);
    try {
      return await creating;
    } catch (error) {
      CaptchaOnnxService.sessionCache.delete(cacheKey);
      throw error;
    }
  }

  private async preprocess(image: Buffer, imgSize: number) {
    const instance = sharp(image, { failOn: 'none' })
      .removeAlpha()
      .toColourspace('rgb');
    const metadata = await instance.metadata();
    const width = Number(metadata.width ?? 0);
    const height = Number(metadata.height ?? 0);
    if (!width || !height) {
      throw new Error('IMAGE_DECODE_FAILED');
    }

    const scale = Math.min(imgSize / width, imgSize / height);
    const resizedWidth = Math.max(1, Math.round(width * scale));
    const resizedHeight = Math.max(1, Math.round(height * scale));
    const padX = Math.floor((imgSize - resizedWidth) / 2);
    const padY = Math.floor((imgSize - resizedHeight) / 2);

    const resizedRgb = await instance
      .resize(resizedWidth, resizedHeight, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
      })
      .raw()
      .toBuffer();

    const paddedRgb = Buffer.alloc(imgSize * imgSize * 3, 114);
    for (let y = 0; y < resizedHeight; y += 1) {
      const srcStart = y * resizedWidth * 3;
      const srcEnd = srcStart + resizedWidth * 3;
      const dstStart = ((y + padY) * imgSize + padX) * 3;
      resizedRgb.copy(paddedRgb, dstStart, srcStart, srcEnd);
    }

    const plane = imgSize * imgSize;
    const nchw = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i += 1) {
      const base = i * 3;
      nchw[i] = (paddedRgb[base] ?? 0) / 255;
      nchw[plane + i] = (paddedRgb[base + 1] ?? 0) / 255;
      nchw[plane * 2 + i] = (paddedRgb[base + 2] ?? 0) / 255;
    }

    return {
      tensor: new ort.Tensor('float32', nchw, [1, 3, imgSize, imgSize]),
      meta: {
        width,
        height,
        scale,
        padX,
        padY,
      } satisfies PreprocessMeta,
    };
  }

  async recognize(
    input: Buffer | string,
    options: CaptchaRecognizeOptions = {},
  ): Promise<CaptchaRecognizeResult> {
    const imgSize = this.normalizeImgSize(options.imgSize);
    const confThreshold = this.normalizeThreshold(
      options.conf,
      DEFAULT_CONF,
      0.01,
      0.99,
    );
    const nmsThreshold = this.normalizeThreshold(
      options.nms,
      DEFAULT_NMS,
      0.05,
      0.99,
    );

    const imageBuffer = this.normalizeImageInput(input);
    const charset = await this.loadCharset();
    const session = await this.getSession(options.provider);
    const { tensor, meta } = await this.preprocess(imageBuffer, imgSize);

    const inputName = session.inputNames[0];
    if (!inputName) {
      throw new Error('CAPTCHA_OCR_MODEL_INPUT_MISSING');
    }
    const outputs = await session.run({ [inputName]: tensor });
    const tensorViews = Object.values(outputs).map((tensor) =>
      this.toTensorView(tensor),
    );
    const rawDetections = this.decodeDetections(
      tensorViews,
      charset.length,
      confThreshold,
      imgSize,
    );

    const restored = rawDetections
      .map((item) => this.restoreFromLetterbox(item, meta))
      .filter((item): item is CandidateDetection => Boolean(item))
      .filter((item) => item.clsId >= 0 && item.clsId < charset.length);
    const nmsResult = this.applyNms(restored, nmsThreshold).sort(
      (a, b) => (a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2,
    );
    const text = nmsResult
      .slice(0, 4)
      .map((item) => charset[item.clsId] ?? '')
      .join('');

    return {
      success: true,
      text,
      detections: nmsResult.map((item) => ({
        x1: this.roundNumber(item.x1),
        y1: this.roundNumber(item.y1),
        x2: this.roundNumber(item.x2),
        y2: this.roundNumber(item.y2),
        score: this.roundNumber(item.score, 4),
        cls_id: item.clsId,
      })),
    };
  }
}
