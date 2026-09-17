import type { Context } from "hono";

/**
 * Генерация UUID v4. Cloudflare Workers поддерживают Web Crypto API.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Единый формат ошибки для всех эндпоинтов.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function errorResponse(c: Context<any>, err: ApiError) {
  const body: ApiErrorBody = {
    error: { code: err.code, message: err.message },
  };
  return c.json(body, err.status);
}

export const Errors = {
  tenantNotFound: () =>
    new ApiError(404, "TENANT_NOT_FOUND", "Tenant not found for this host"),
  tenantInactive: () =>
    new ApiError(403, "TENANT_INACTIVE", "This tenant account is inactive"),
  productLimitReached: (max: number) =>
    new ApiError(
      409,
      "PRODUCT_LIMIT_REACHED",
      `Free tier allows up to ${max} products. Upgrade to Pro for unlimited products.`
    ),
  tenantLimitReached: (max: number) =>
    new ApiError(
      409,
      "TENANT_LIMIT_REACHED",
      `Your plan allows up to ${max} storefront(s). Upgrade to Business for more.`
    ),
  customDomainNotAllowed: () =>
    new ApiError(
      403,
      "CUSTOM_DOMAIN_NOT_ALLOWED",
      "Custom domains require a Pro or Business plan"
    ),
  onlinePaymentsNotAllowed: () =>
    new ApiError(
      403,
      "ONLINE_PAYMENTS_NOT_ALLOWED",
      "Online payments require a Pro or Business plan"
    ),
  validation: (message: string) => new ApiError(422, "VALIDATION_ERROR", message),
  notFound: (resource: string) =>
    new ApiError(404, "NOT_FOUND", `${resource} not found`),
  unauthorized: () =>
    new ApiError(401, "UNAUTHORIZED", "Missing or invalid authentication"),
};
