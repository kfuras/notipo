import { createHmac } from "crypto";
import { config } from "../config.js";

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SEP = "|";

type TokenPurpose = "reset" | "verify";

function ttlFor(purpose: TokenPurpose): number {
  return purpose === "verify" ? VERIFY_TTL_MS : RESET_TTL_MS;
}

export function createToken(userId: string, purpose: TokenPurpose): string {
  const expiresAt = new Date(Date.now() + ttlFor(purpose)).toISOString();
  const payload = `${purpose}${SEP}${userId}${SEP}${expiresAt}`;
  const signature = createHmac("sha256", config.ENCRYPTION_KEY).update(payload).digest("hex");
  return Buffer.from(`${payload}${SEP}${signature}`).toString("base64url");
}

export function verifyToken(token: string, expectedPurpose: TokenPurpose): { userId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(SEP);
    if (parts.length !== 4) return null;

    const [purpose, userId, expiresAt, signature] = parts;
    if (!purpose || !userId || !expiresAt || !signature) return null;
    if (purpose !== expectedPurpose) return null;

    const payload = `${purpose}${SEP}${userId}${SEP}${expiresAt}`;
    const expected = createHmac("sha256", config.ENCRYPTION_KEY).update(payload).digest("hex");

    if (signature !== expected) return null;
    if (new Date(expiresAt).getTime() < Date.now()) return null;

    return { userId };
  } catch {
    return null;
  }
}
