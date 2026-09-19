const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

export class MediaUploadError extends Error {
  constructor(
    message: string,
    public readonly code: "UNSUPPORTED_TYPE" | "TOO_LARGE" | "EMPTY_FILE"
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

/**
 * Ключи объектов в R2 всегда содержат tenant_id как префикс —
 * это даёт логическую изоляцию медиафайлов между tenants даже
 * при использовании одного bucket, и позволяет легко удалить
 * все файлы tenant одним list+delete по префиксу.
 */
export class MediaService {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly publicBaseUrl: string
  ) {}

  private buildKey(tenantId: string, mimeType: string): string {
    const ext = extensionForMimeType(mimeType);
    const id = crypto.randomUUID();
    return `tenants/${tenantId}/${id}.${ext}`;
  }

  async upload(
    tenantId: string,
    file: { data: ArrayBuffer; mimeType: string }
  ): Promise<{ key: string; url: string }> {
    if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
      throw new MediaUploadError(
        `Unsupported file type: ${file.mimeType}. Allowed: JPEG, PNG, WEBP, GIF`,
        "UNSUPPORTED_TYPE"
      );
    }
    if (file.data.byteLength === 0) {
      throw new MediaUploadError("Uploaded file is empty", "EMPTY_FILE");
    }
    if (file.data.byteLength > MAX_FILE_SIZE_BYTES) {
      throw new MediaUploadError(
        `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
        "TOO_LARGE"
      );
    }

    const key = this.buildKey(tenantId, file.mimeType);

    await this.bucket.put(key, file.data, {
      httpMetadata: { contentType: file.mimeType },
    });

    return { key, url: `${this.publicBaseUrl}/${key}` };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  /**
   * Защита от cross-tenant удаления: проверяет, что ключ объекта
   * действительно принадлежит tenant, прежде чем разрешить delete.
   */
  keyBelongsToTenant(key: string, tenantId: string): boolean {
    return key.startsWith(`tenants/${tenantId}/`);
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    return this.bucket.get(key);
  }
}
