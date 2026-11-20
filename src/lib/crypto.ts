import crypto from "node:crypto";

/**
 * Token encryption for provider OAuth credentials (AES-256-GCM).
 * Key: TOKEN_ENCRYPTION_KEY env; dev fallback derived deterministically so the demo runs
 * with no secrets configured. Secrets never leave the server.
 */
const devKey = crypto.createHash("sha256").update("ridgeline-dev-encryption-key").digest();
const key = () => {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return devKey;
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw).digest();
};

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptToken(enc: string): string {
  const buf = Buffer.from(enc, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function hmacSha256Hex(secret: string, raw: string): string {
  return crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("hex");
}
