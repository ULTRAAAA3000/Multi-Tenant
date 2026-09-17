# Multi-Tenant SaaS — Mobile Showcase/Menu Platform

Edge-native multi-tenant SaaS на Cloudflare Workers + D1 + R2.
Мобильные витрины/меню для заведений и шопов с заказом через Telegram.

## Статус: Фаза 1 — Архитектура БД & Модель подписок ✅

### Что сделано
- Схема D1 (`migrations/0001_core_tenancy.sql`): `tenants`, `subscriptions`,
  `plan_limits`, `categories`, `products`, `orders`, `order_items`, `settings`.
- `wrangler.toml` с bindings для D1 и R2 (production + staging).
- Базовая структура TypeScript-проекта, строгий `tsconfig.json`.
- Типы DTO (`src/types/`) и репозитории для tenants/subscriptions (`src/db/`).
- Health-check эндпоинт на Hono (`src/index.ts`).

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

**Фаза 2**: Backend Core & Multi-Tenant Routing — middleware резолвинга
`tenant_id` по поддомену/custom domain, enforcement лимитов тарифа,
CRUD API для products/categories/orders/settings.
