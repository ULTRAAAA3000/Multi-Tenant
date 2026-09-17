import { Hono } from "hono";
import type { Env } from "./types/env";
import { tenantResolver } from "./middleware/tenant-resolver";
import { ApiError, errorResponse } from "./utils/api";
import categoriesRoutes from "./routes/categories";
import productsRoutes from "./routes/products";
import ordersRoutes from "./routes/orders";
import settingsRoutes from "./routes/settings";

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
 * Все API-роуты каталога/заказов идут через tenantResolver:
 * он определяет tenant_id по Host-заголовку (поддомен или custom
 * domain), проверяет активность tenant и допустимость custom domain
 * по тарифу, и кладёт результат в контекст для нижестоящих хендлеров.
 */
const api = new Hono<{ Bindings: Env }>();
api.use("*", tenantResolver());
api.route("/categories", categoriesRoutes);
api.route("/products", productsRoutes);
api.route("/orders", ordersRoutes);
api.route("/settings", settingsRoutes);

app.route("/api", api);

/**
 * Админ-роуты (создание tenant, billing, авторизация) добавляются
 * в Фазе 5 — они работают НЕ через tenantResolver (владелец управляет
 * несколькими tenants из одного аккаунта), а через отдельный auth
 * middleware, который резолвит ownerId из JWT/сессии.
 */

export default app;
