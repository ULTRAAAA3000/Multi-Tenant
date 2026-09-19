/**
 * bcrypt/argon2 недоступны в Workers runtime без полифиллов и
 * серьёзного оверхеда по CPU-time лимитам. PBKDF2 нативно
 * поддерживается Web Crypto API и достаточно для этой задачи
 * при 100 000+ итераций (текущий стандарт OWASP на 2024+).
 *
 * Формат хранения: base64(salt) + "." + iterations + "." + base64(hash)
 */

const ITERATIONS = 100_000;
const HASH_LENGTH_BITS = 256;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    HASH_LENGTH_BITS
  );
}

export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derivedBits = await deriveBits(plainPassword, salt, ITERATIONS);
  return `${toBase64(salt.buffer)}.${ITERATIONS}.${toBase64(derivedBits)}`;
}

export async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  const [saltB64, iterationsStr, hashB64] = storedHash.split(".");
  if (!saltB64 || !iterationsStr || !hashB64) {
    return false;
  }

  const salt = fromBase64(saltB64);
  const iterations = Number(iterationsStr);
  const derivedBits = await deriveBits(plainPassword, salt, iterations);
  const computedHash = toBase64(derivedBits);

  // Constant-time comparison to avoid timing attacks.
  if (computedHash.length !== hashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHash.length; i++) {
    diff |= computedHash.charCodeAt(i) ^ hashB64.charCodeAt(i);
  }
  return diff === 0;
}
