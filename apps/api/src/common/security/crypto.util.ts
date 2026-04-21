import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const SECRET = process.env.ADMIN_JWT_SECRET ?? 'dev-local-secret';

function getKey() {
  return createHash('sha256').update(SECRET).digest();
}

export function hashPlainText(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function encryptText(value: string) {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptText(payload: string) {
  const [ivHex, encryptedHex] = payload.split(':');
  if (!ivHex || !encryptedHex) {
    return '';
  }
  const decipher = createDecipheriv(
    'aes-256-cbc',
    getKey(),
    Buffer.from(ivHex, 'hex'),
  );
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function normalizePhone(input: string) {
  return input.replace(/\D/g, '');
}

export function maskPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 7) {
    return normalized;
  }
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

export function createRandomToken(prefix = 'tk_') {
  return `${prefix}${randomBytes(16).toString('base64url')}`;
}

