/**
 * Шифрование чувствительных полей (Telegram bot token) перед записью
 * в D1. D1 не шифрует данные на уровне столбцов, поэтому секреты
 * пользователей шифруются на уровне приложения перед INSERT/UPDATE
 * и расшифровываются только в момент фактического использования
 * (отправка сообщения в Telegram API).
 *
 * Формат хранения: base64(iv) + "." + base64(ciphertext)
 * Алгоритм: AES-GCM 256, ключ выводится из секрета через SHA-256.
 */

async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", keyMaterial, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

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

export async function encryptSecret(plaintext: string, appSecret: string): Promise<string> {
  const key = await deriveKey(appSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  return `${toBase64(iv.buffer)}.${toBase64(ciphertext)}`;
}

export async function decryptSecret(encrypted: string, appSecret: string): Promise<string> {
  const [ivB64, ciphertextB64] = encrypted.split(".");
  if (!ivB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted secret: expected format 'iv.ciphertext'");
  }

  const key = await deriveKey(appSecret);
  const iv = fromBase64(ivB64);
  const ciphertext = fromBase64(ciphertextB64);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

  return new TextDecoder().decode(decrypted);
}
