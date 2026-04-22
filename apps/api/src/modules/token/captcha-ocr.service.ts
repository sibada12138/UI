import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_TIMEOUT_MS = 25000;

@Injectable()
export class CaptchaOcrService {
  private readonly logger = new Logger(CaptchaOcrService.name);

  private resolvePathByCandidates(candidates: string[]) {
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const resolved = path.resolve(candidate);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
    return '';
  }

  private getScriptPath() {
    const fromEnv = process.env.CAPTCHA_OCR_SCRIPT?.trim();
    const byCwd = process.cwd();
    return this.resolvePathByCandidates([
      fromEnv ? path.resolve(byCwd, fromEnv) : '',
      path.resolve(byCwd, 'apps/api/scripts/yolo11_captcha.py'),
      path.resolve(byCwd, 'scripts/yolo11_captcha.py'),
      path.resolve(byCwd, '../scripts/yolo11_captcha.py'),
    ]);
  }

  private getModelPath() {
    const fromEnv = process.env.CAPTCHA_OCR_MODEL_PATH?.trim();
    const byCwd = process.cwd();
    return this.resolvePathByCandidates([
      fromEnv ? path.resolve(byCwd, fromEnv) : '',
      path.resolve(byCwd, 'best.onnx'),
      path.resolve(byCwd, '../best.onnx'),
      path.resolve(byCwd, '../../best.onnx'),
    ]);
  }

  private getClassesPath() {
    const fromEnv = process.env.CAPTCHA_OCR_CLASSES_PATH?.trim();
    const byCwd = process.cwd();
    return this.resolvePathByCandidates([
      fromEnv ? path.resolve(byCwd, fromEnv) : '',
      path.resolve(byCwd, 'classes.txt'),
      path.resolve(byCwd, '../classes.txt'),
      path.resolve(byCwd, '../../classes.txt'),
    ]);
  }

  async recognizeCaptcha(base64: string): Promise<string> {
    const scriptPath = this.getScriptPath();
    const modelPath = this.getModelPath();
    const classesPath = this.getClassesPath();
    if (!scriptPath || !modelPath || !classesPath) {
      this.logger.error(
        `OCR resources missing: script=${scriptPath || 'N/A'} model=${modelPath || 'N/A'} classes=${classesPath || 'N/A'}`,
      );
      throw new Error('CAPTCHA_AUTO_RECOGNIZE_FAILED');
    }

    const pythonBin =
      process.env.CAPTCHA_OCR_PYTHON?.trim() ||
      (process.platform === 'win32' ? 'python' : 'python3');
    const timeoutMs = Number(process.env.CAPTCHA_OCR_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    const targetCodeLength = Number(process.env.CAPTCHA_OCR_CODE_LENGTH ?? 4);
    const cleanedBase64 = String(base64 ?? '')
      .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
      .trim();
    if (!cleanedBase64) {
      throw new Error('CAPTCHA_AUTO_RECOGNIZE_FAILED');
    }

    const args = [scriptPath, '--model', modelPath, '--classes', classesPath];
    const child = spawn(pythonBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, Math.max(1000, timeoutMs));

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.stdin.write(cleanedBase64);
    child.stdin.end();

    const exitCode = await new Promise<number>((resolve) => {
      child.on('close', (code) => resolve(code ?? 1));
      child.on('error', () => resolve(1));
    });
    clearTimeout(timer);

    const code = stdout.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (exitCode !== 0 || code.length < 4) {
      this.logger.error(
        `OCR failed: exit=${exitCode} stderr=${stderr.trim() || 'N/A'} stdout=${stdout.trim() || 'N/A'} py=${pythonBin} script=${scriptPath}`,
      );
      throw new Error('CAPTCHA_AUTO_RECOGNIZE_FAILED');
    }
    const finalCode = code.slice(0, Math.max(4, Math.min(8, targetCodeLength)));
    this.logger.log(`OCR success: code=${finalCode}`);
    return finalCode;
  }
}
