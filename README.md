# Multi-Tenant SaaS — Mobile Showcase/Menu Platform

Edge-native multi-tenant SaaS на Cloudflare Workers + D1 + R2.
Мобильные витрины/меню для заведений и шопов с заказом через Telegram.

## Статус: Фаза 3 — Telegram Bot, R2 Storage & Payment Abstraction ✅

### Фаза 3 — Telegram Bot, R2 Storage & Payment Abstraction ✅
- **`src/services/media.service.ts` + `src/routes/media.ts`** — загрузка
  изображений товаров напрямую в R2 через Worker (`POST /api/media/upload`,
  multipart/form-data). Ключи объектов префиксуются `tenants/{tenant_id}/`
  для логической изоляции; удаление проверяет владение tenant перед delete.
  Лимит 8MB, разрешены JPEG/PNG/WEBP/GIF.
- **`src/services/telegram.service.ts`** — форматирует и отправляет заказ
  в Telegram-чат владельца через Bot API (`sendMessage`, MarkdownV2).
  Отправка "best effort": сбой доставки не откатывает уже созданный заказ.
- **`src/utils/crypto.ts`** — AES-GCM шифрование `telegram_bot_token`
  перед записью в D1 (D1 не шифрует столбцы на уровне БД). Расшифровка
  происходит только непосредственно перед вызовом Telegram API.
- **`src/payments/`** — Payment Abstraction Layer:
  - `provider.interface.ts` — общий контракт `PaymentProviderAdapter`
    (`createPaymentIntent`, `verifyWebhook`)
  - `stripe.adapter.ts` — Stripe Checkout Sessions + ручная верификация
    webhook-подписи (HMAC-SHA256 через Web Crypto, без stripe-node SDK)
  - `monopay.adapter.ts` — Monobank Acquiring API (invoice/create)
  - `factory.ts` — выбор адаптера по имени провайдера
  - `routes.ts` — `POST /payments/checkout` (создание сессии оплаты,
    защищено `enforceOnlinePaymentsAllowed`) и
    `POST /payments/webhook/:provider` (вне tenantResolver — провайдеры
    не знают о нашей поддоменной схеме; tenant резолвится по `order_id`
    из верифицированного события)

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

**Фаза 4**: Клиентский Frontend (Mobile-First Showcase/Menu) — React/Vite
витрина для покупателей, "Powered by" футер для free-тарифа, форма
оформления заказа с интеграцией checkout из Фазы 3.

## Переменные окружения, нужные для Фазы 3

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN_ENCRYPTION_KEY  # любая случайная строка 32+ символов
npx wrangler secret put STRIPE_SECRET_KEY                   # опционально, если используете Stripe
npx wrangler secret put MONOPAY_TOKEN                        # опционально, если используете Monobank
```

Подключение Telegram-бота для tenant делается через `PATCH` на tenant-admin
эндпоинт (появится в Фазе 5) с полями `telegramBotToken` (сырой токен —
шифруется автоматически перед сохранением) и `telegramChatId`.

## Фаза 4 — Клиентский Frontend (Mobile-First Showcase/Menu) ✅

React 18 + Vite, папка `storefront/`. Обращается к тому же Worker'у по
относительным путям `/api/*` — резолвинг tenant происходит на бэкенде
по Host-заголовку, фронтенд не передаёт tenant явно.

- **`src/pages/Storefront.tsx`** — главный экран: категории, сетка
  товаров (skeleton при загрузке, empty/error состояния), корзина,
  чекаут, подтверждение заказа — один компонент-оркестратор
- **`src/lib/cart.tsx`** — состояние корзины через React Context,
  без внешних библиотек
- **`src/lib/api.ts`** — тонкий fetch-клиент к Worker API
- **`src/components/`** — Header, CategoryTabs, ProductCard,
  CartDrawer, CheckoutForm, OrderConfirmation, BrandingFooter,
  StateMessage
- **`src/components/BrandingFooter.tsx`** — "Powered by" футер для
  free-тарифа, управляется булевым пропом (готово для подключения к
  `plan_limits.branding_removable` в Фазе 5)
- Дизайн: та же индустриальная неоморфная система, что и в лендинге
  (`/landing`) — общий визуальный язык между маркетингом и продуктом

### Запуск локально

```bash
cd storefront
npm install
npm run dev       # http://localhost:5173, проксирует /api на прод по умолчанию — настройте dev-прокси при необходимости
npm run build      # dist/ — статические файлы для Cloudflare Pages
```

Деплой: отдельный Cloudflare Pages проект, build output directory `storefront/dist`,
build command `npm run build`, root directory `storefront`.

## Фаза 5 — Админ-панель (API) & Billing Module ✅

Весь бэкенд для дашборда владельца. UI дашборда не входит в эту фазу
(план описывал только "веб-кабинет" концептуально) — это готовый API,
на который можно посадить фронтенд аналогично `storefront/`.

### Новая миграция

```bash
npx wrangler d1 migrations apply multi-tenant-db --remote
```

Добавляет таблицу `users` (`migrations/0002_users.sql`) — владельцы
аккаунтов, которых раньше не было: `owner_id` использовался в
`tenants`/`subscriptions` с Фазы 1, но некого было авторизовывать.

### Новый секрет

```bash
npx wrangler secret put JWT_SECRET   # любая случайная строка 32+ символов
```

### Аутентификация (`src/auth/`)
- `POST /auth/register` — создание аккаунта, возвращает JWT
- `POST /auth/login` — вход, возвращает JWT
- Пароли хэшируются PBKDF2 100 000 итераций (Web Crypto API — bcrypt/argon2
  несовместимы с Workers runtime без полифиллов)
- Сессии — самописный JWT (HS256, без внешних зависимостей), 30 дней,
  передаётся как `Authorization: Bearer <token>`
- Одинаковое сообщение об ошибке для "нет email" и "неверный пароль"
  (защита от user enumeration)

### Admin API — заведения (`src/admin/tenants.ts`)
Защищено `requireAuth` (JWT), scoped по `ownerId`, НЕ через tenantResolver
(владелец управляет несколькими tenants, не находится "внутри" одного):
- `GET /admin/tenants` — список своих заведений
- `POST /admin/tenants` — создание нового (проверяет `enforceTenantLimit`)
- `PATCH /admin/tenants/:id` — обновление (логотип, цвет, Telegram-бот —
  `telegramBotToken` шифруется на этом уровне перед сохранением)
- `PATCH /admin/tenants/:id/domain` — привязка custom domain
  (защищено проверкой `customDomainAllowed` по тарифу)

### Billing Module (`src/admin/billing.ts`)
- `GET /admin/billing` — текущий тариф + фактическое использование
  (`N / max` заведений, товаров — данные для "плашек с лимитами")
- `GET /admin/billing/plans` — все тарифы с лимитами (для страницы выбора плана)
- `POST /admin/billing/change-plan` — смена тарифа; блокирует даунгрейд,
  если он тут же нарушит текущие данные (например, 3 заведения на Free)

**Важно**: `change-plan` меняет план напрямую, без реального биллинг-цикла.
Полная интеграция Stripe Subscriptions/Billing Portal (recurring charges,
Stripe Customer Portal, обработка неудачных платежей) требует настройки
конкретных Price ID в Stripe Dashboard — это внешняя конфигурация
аккаунта, а не код, и является следующим шагом перед реальным запуском
платных тарифов.

## Проект завершён по всем 5 фазам плана

Что не входило в исходный план и стоит держать в голове перед продакшеном:
- Полная ECDSA-верификация Monopay webhook (сейчас упрощена, см. комментарий в `src/payments/monopay.adapter.ts`)
- Реальная Stripe Subscriptions интеграция для `change-plan` (см. выше)
- UI дашборда владельца (Фаза 5 дала только API)
- Rate limiting на `/auth/login` (защита от брутфорса)
