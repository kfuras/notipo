import { lookup } from "node:dns/promises";

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((re) => re.test(ip));
}

/** Returns true if the URL resolves to a private/internal IP address. */
export async function isPrivateUrl(urlString: string): Promise<boolean> {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname;

    // Block common internal hostnames
    if (hostname === "localhost" || hostname === "metadata.google.internal") {
      return true;
    }

    // Cloud metadata endpoints (AWS, GCP, Azure)
    if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
      return true;
    }

    // Check if hostname is already an IP
    if (isPrivateIp(hostname)) return true;

    // Resolve DNS and check the resulting IP
    const { address } = await lookup(hostname);
    return isPrivateIp(address);
  } catch {
    // If DNS resolution fails, block by default
    return true;
  }
}
