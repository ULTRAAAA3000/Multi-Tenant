# Multi-Tenant SaaS — Mobile Showcase/Menu Platform

Edge-native multi-tenant SaaS на Cloudflare Workers + D1 + R2.
Мобильные витрины/меню для заведений и шопов с заказом через Telegram.

## Статус: Фаза 2 — Backend Core & Multi-Tenant Routing ✅

### Фаза 1 — Архитектура БД & Модель подписок ✅
- Схема D1 (`migrations/0001_core_tenancy.sql`): `tenants`, `subscriptions`,
  `plan_limits`, `categories`, `products`, `orders`, `order_items`, `settings`.
- `wrangler.toml` с bindings для D1 и R2 (production + staging).
- Базовая структура TypeScript-проекта, строгий `tsconfig.json`.
- Типы DTO (`src/types/`) и репозитории для tenants/subscriptions (`src/db/`).

### Фаза 2 — Backend Core & Multi-Tenant Routing ✅
- **`src/middleware/tenant-resolver.ts`** — определяет `tenant_id` по заголовку
  `Host`: поддомен (`{slug}.{BASE_DOMAIN}`) или custom domain. Проверяет,
  что tenant активен и что custom domain разрешён тарифом владельца.
- **`src/middleware/plan-limits.ts`** — enforcement лимитов тарифа:
  - `enforceProductLimit` — блокирует создание товара сверх `max_products` (free = 20)
  - `enforceTenantLimit` — блокирует создание нового заведения сверх `max_tenants`
  - `enforceOnlinePaymentsAllowed`, `enforceCustomDomainAllowed` — для Pro-фич
- **CRUD API** (`src/routes/`), все роуты tenant-scoped (фильтр по `tenant_id`
  на уровне SQL, без возможности утечки данных между tenants):
  - `GET/POST/PATCH/DELETE /api/categories`
  - `GET/POST/PATCH/DELETE /api/products` (POST проверяет лимит тарифа)
  - `GET/POST /api/orders`, `PATCH /api/orders/:id/status`
    (создание заказа валидирует существование и доступность товаров,
    считает `total_cents` на бэкенде, не доверяя клиенту)
  - `GET/PUT/DELETE /api/settings`
- Репозитории для `categories`, `products`, `orders`+`order_items`, `settings`.
- Единый формат ошибок API (`src/utils/api.ts`) и валидация входных данных
  (`src/utils/validation.ts`), без внешних зависимостей.

### Тарифы (заложены в `plan_limits`)
| Plan     | Tenants | Products  | Custom domain | Online payments | Branding off | Analytics | Priority support | Custom themes | Price     |
|----------|---------|-----------|----------------|------------------|--------------|-----------|-------------------|----------------|-----------|
| free     | 1       | 20        | ❌             | ❌               | ❌           | ❌        | ❌                | ❌             | $0        |
| pro      | 1       | ∞         | ✅             | ✅               | ✅           | ✅        | ❌                | ❌             | $9/mo     |
| business | 5       | ∞         | ✅             | ✅               | ✅           | ✅        | ✅                | ✅             | $29/mo    |

## Установка и запуск (локально)

```bash
npm install

# Создать D1 базу (один раз)
npx wrangler d1 create multi-tenant-db
# -> скопировать полученный database_id в wrangler.toml

# Применить миграции локально
npm run db:migrate:local

# Применить миграции на удалённую D1 (после привязки database_id)
npm run db:migrate:remote

# Запустить dev-сервер
npm run dev
```

## Переменные окружения / секреты

Задаются через `wrangler secret put <NAME>`, никогда не коммитятся:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN_ENCRYPTION_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put MONOPAY_TOKEN
```

## Следующая фаза

**Фаза 3**: Интеграция с Telegram Bot, R2 Storage & Payment Gateway
Abstraction — загрузка изображений товаров в R2, push-уведомления о
заказах в Telegram владельца, абстрактный слой для Stripe/Monopay.
