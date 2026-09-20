export interface Env {
  // Bindings (wrangler.toml)
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;

  // Vars (несекретные)
  APP_ENV: "production" | "staging" | "development";
  BASE_DOMAIN: string;
  STRIPE_CONNECT_CLIENT_ID?: string; // публичный ID Stripe-приложения, не секрет

  // Secrets (wrangler secret put)
  JWT_SECRET: string;
  TELEGRAM_BOT_TOKEN_ENCRYPTION_KEY: string;
  STRIPE_SECRET_KEY?: string;
  PADDLE_API_KEY?: string;
  MONOPAY_TOKEN?: string;
  RESEND_API_KEY?: string;
  NOTIFICATION_FROM_EMAIL?: string; // напр. "orders@yourdomain.com"; дефолт onboarding@resend.dev для теста
}

/**
 * Контекст запроса, обогащённый Middleware резолвером tenant_id.
 * Заполняется в tenantResolver middleware (Фаза 2).
 */
export interface RequestContext {
  tenantId: string;
  ownerId: string;
  planId: "free" | "pro" | "business";
}
