import { createHmac } from "crypto";
import { config } from "../config.js";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SEP = "|";

export function createResetToken(userId: string): string {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const payload = `${userId}${SEP}${expiresAt}`;
  const signature = createHmac("sha256", config.ENCRYPTION_KEY).update(payload).digest("hex");
  return Buffer.from(`${payload}${SEP}${signature}`).toString("base64url");
}

export function verifyResetToken(token: string): { userId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const [userId, expiresAt, signature] = decoded.split(SEP);

    if (!userId || !expiresAt || !signature) return null;

    const payload = `${userId}${SEP}${expiresAt}`;
    const expected = createHmac("sha256", config.ENCRYPTION_KEY).update(payload).digest("hex");

    if (signature !== expected) return null;
    if (new Date(expiresAt).getTime() < Date.now()) return null;

    return { userId };
  } catch {
    return null;
  }
}
