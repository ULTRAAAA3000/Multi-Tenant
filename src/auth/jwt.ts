/**
 * Минимальная JWT (HS256) без внешних зависимостей — jsonwebtoken и
 * аналоги плохо совместимы с Workers runtime. Реализует только то,
 * что нужно: подпись/верификация с HMAC-SHA256 и exp-claim.
 */

export interface JwtPayload {
  sub: string; // user id (owner_id)
  email: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(data: string): string {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

async function sign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return base64UrlEncode(binary);
}

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 дней

export async function createSessionToken(
  userId: string,
  email: string,
  secret: string
): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: userId,
    email,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(`${header}.${encodedPayload}`, secret);
  return `${header}.${encodedPayload}.${signature}`;
}

export async function verifySessionToken(
  token: string,
  secret: string
): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, encodedPayload, signature] = parts;
  const expectedSignature = await sign(`${header}.${encodedPayload}`, secret);

  if (expectedSignature !== signature) return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload as string)) as JwtPayload;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload;
}
