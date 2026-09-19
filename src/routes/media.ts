import { Hono } from "hono";
import type { Env } from "../types/env";
import { requireTenant } from "../middleware/tenant-resolver";
import { MediaService, MediaUploadError } from "../services/media.service";
import { errorResponse, Errors, ApiError } from "../utils/api";

const media = new Hono<{ Bindings: Env }>();

/**
 * Загрузка файла: multipart/form-data с полем "file".
 * Worker принимает бинарные данные напрямую, без прохождения
 * через промежуточный сервис — файл идёт клиент -> Worker -> R2.
 */
media.post("/upload", async (c) => {
  const tenant = requireTenant(c);
  const mediaService = new MediaService(
    c.env.MEDIA_BUCKET,
    `https://${c.env.BASE_DOMAIN}/media`
  );

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string" || typeof (file as Blob).arrayBuffer !== "function") {
    return errorResponse(
      c,
      Errors.validation('Request must be multipart/form-data with a "file" field')
    );
  }

  const uploadedFile = file as File;

  try {
    const arrayBuffer = await uploadedFile.arrayBuffer();
    const result = await mediaService.upload(tenant.tenantId, {
      data: arrayBuffer,
      mimeType: uploadedFile.type,
    });

    return c.json({ data: result }, 201);
  } catch (err) {
    if (err instanceof MediaUploadError) {
      return errorResponse(c, new ApiError(422, err.code, err.message));
    }
    throw err;
  }
});

/**
 * Раздача файла по ключу. В продакшене логичнее отдавать R2 через
 * custom domain с публичным R2 bucket binding напрямую (без Worker
 * посредника, для снижения нагрузки/latency) — этот роут работает
 * как универсальный fallback и для локальной разработки.
 */
media.get("/:key{.+}", async (c) => {
  const tenant = requireTenant(c);
  const key = c.req.param("key");
  const mediaService = new MediaService(
    c.env.MEDIA_BUCKET,
    `https://${c.env.BASE_DOMAIN}/media`
  );

  if (!mediaService.keyBelongsToTenant(key, tenant.tenantId)) {
    return errorResponse(c, Errors.notFound("File"));
  }

  const object = await mediaService.get(key);
  if (!object) {
    return errorResponse(c, Errors.notFound("File"));
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
});

/**
 * Удаление файла. Проверяет владение tenant перед удалением —
 * защита от того, чтобы один tenant удалил медиа другого, зная
 * только его ключ.
 */
media.delete("/:key{.+}", async (c) => {
  const tenant = requireTenant(c);
  const key = c.req.param("key");
  const mediaService = new MediaService(
    c.env.MEDIA_BUCKET,
    `https://${c.env.BASE_DOMAIN}/media`
  );

  if (!mediaService.keyBelongsToTenant(key, tenant.tenantId)) {
    return errorResponse(c, Errors.notFound("File"));
  }

  await mediaService.delete(key);
  return c.body(null, 204);
});

export default media;
