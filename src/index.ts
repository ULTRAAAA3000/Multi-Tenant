import { Hono } from "hono";
import type { Env } from "./types/env";
import { tenantResolver } from "./middleware/tenant-resolver";
import { ApiError, errorResponse } from "./utils/api";
import categoriesRoutes from "./routes/categories";
import productsRoutes from "./routes/products";
import ordersRoutes from "./routes/orders";
import settingsRoutes from "./routes/settings";
import mediaRoutes from "./routes/media";
import tenantInfoRoutes from "./routes/tenant-info";
import paymentsRoutes from "./payments/routes";
import authRoutes from "./auth/routes";
import stripeConnectRoutes from "./payments/stripe-connect.routes";
import adminTenantsRoutes from "./admin/tenants";
import billingRoutes from "./admin/billing";

const app = new Hono<{ Bindings: Env }>();

/**
 * Единая обработка ApiError, выброшенных внутри хендлеров/репозиториев,
 * которые не были перехвачены локальным try/catch (защитный слой).
 */
app.onError((err, c) => {
  if (err instanceof ApiError) {
    return errorResponse(c, err);
  }
  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
    500
  );
});

/**
 * Health-check — вне tenant-контекста, не резолвит tenant_id,
 * чтобы мониторинг работал даже если запрос идёт на BASE_DOMAIN.
 */
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    env: c.env.APP_ENV,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Auth (register/login) — публичные роуты, не требуют ни tenant,
 * ни существующей сессии.
 */
app.route("/auth", authRoutes);

/**
 * Stripe Connect OAuth. Смонтирован на /auth/stripe (не /api/auth/stripe
 * — /api зарезервирован под tenant-scoped витрину через tenantResolver,
 * а эти роуты работают по-другому: /connect и /disconnect — от имени
 * авторизованного владельца (requireAuth), /callback — от Stripe без
 * авторизации, доверие устанавливается через OAuth state параметр).
 */
app.route("/auth/stripe", stripeConnectRoutes);

/**
 * Admin API — управление аккаунтом владельца: заведения, биллинг.
 * Защищено requireAuth (JWT), НЕ проходит через tenantResolver —
 * владелец управляет несколькими tenants из одного аккаунта, а не
 * действует в контексте одного tenant, определённого по Host.
 */
app.route("/admin/tenants", adminTenantsRoutes);
app.route("/admin/billing", billingRoutes);

/**
 * Платёжные webhooks регистрируются ОТДЕЛЬНО от /api группы,
 * т.к. провайдеры (Stripe/Monopay) не присылают наш Host-заголовок
 * в ожидаемом формате поддомена — tenantResolver здесь неприменим.
 * Tenant для webhook определяется изнутри payments/routes.ts по
 * orderId, найденному в теле верифицированного события.
 */
app.route("/payments", paymentsRoutes);

/**
 * Все остальные API-роуты каталога/заказов/медиа идут через
 * tenantResolver: он определяет tenant_id по Host-заголовку
 * (поддомен или custom domain), проверяет активность tenant и
 * допустимость custom domain по тарифу, и кладёт результат в
 * контекст для нижестоящих хендлеров. Это публичная витрина —
 * доступна без авторизации, посетители не логинятся.
 */
const api = new Hono<{ Bindings: Env }>();
api.use("*", tenantResolver());
api.route("/categories", categoriesRoutes);
api.route("/products", productsRoutes);
api.route("/orders", ordersRoutes);
api.route("/settings", settingsRoutes);
api.route("/media", mediaRoutes);
api.route("/tenant", tenantInfoRoutes);

app.route("/api", api);

export default app;
