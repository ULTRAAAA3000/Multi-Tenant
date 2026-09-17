-- Migration 0001: Core Multi-Tenancy & Subscription schema
-- Cloudflare D1 (SQLite)

PRAGMA foreign_keys = ON;

-- ============================================================
-- TENANTS
-- Каждый заведение/магазин = один tenant.
-- Один аккаунт (owner_id) может владеть несколькими tenants
-- (актуально для Business/Agency плана — до 5 заведений).
-- ============================================================
CREATE TABLE tenants (
    id            TEXT PRIMARY KEY,              -- uuid
    owner_id      TEXT NOT NULL,                 -- uuid владельца аккаунта (auth)
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,           -- поддомен: slug.domain.com
    custom_domain TEXT UNIQUE,                    -- кастомный домен (Pro+), NULL если не подключен
    telegram_bot_token TEXT,                      -- токен бота для уведомлений (шифруется на уровне приложения)
    telegram_chat_id   TEXT,                      -- chat_id владельца для push-уведомлений
    logo_url      TEXT,
    theme_color   TEXT DEFAULT '#000000',
    currency      TEXT NOT NULL DEFAULT 'UAH',
    is_active     INTEGER NOT NULL DEFAULT 1,     -- 0/1 (soft-disable при неоплате)
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_tenants_owner_id ON tenants(owner_id);
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_custom_domain ON tenants(custom_domain);

-- ============================================================
-- PLAN_LIMITS
-- Справочник тарифов и их лимитов. Не привязан к tenant —
-- это статическая конфигурация планов (free / pro / business).
-- ============================================================
CREATE TABLE plan_limits (
    plan_id             TEXT PRIMARY KEY,          -- 'free' | 'pro' | 'business'
    max_tenants         INTEGER NOT NULL,          -- сколько заведений доступно на аккаунт
    max_products        INTEGER,                   -- NULL = безлимит
    custom_domain_allowed INTEGER NOT NULL DEFAULT 0,
    online_payments_allowed INTEGER NOT NULL DEFAULT 0,
    branding_removable  INTEGER NOT NULL DEFAULT 0,
    analytics_enabled   INTEGER NOT NULL DEFAULT 0,
    priority_support    INTEGER NOT NULL DEFAULT 0,
    custom_themes       INTEGER NOT NULL DEFAULT 0,
    price_usd_cents     INTEGER NOT NULL DEFAULT 0
);

INSERT INTO plan_limits (
    plan_id, max_tenants, max_products, custom_domain_allowed,
    online_payments_allowed, branding_removable, analytics_enabled,
    priority_support, custom_themes, price_usd_cents
) VALUES
    ('free',     1, 20,   0, 0, 0, 0, 0, 0, 0),
    ('pro',      1, NULL, 1, 1, 1, 1, 0, 0, 900),
    ('business', 5, NULL, 1, 1, 1, 1, 1, 1, 2900);

-- ============================================================
-- SUBSCRIPTIONS
-- Активная подписка аккаунта (owner_id), НЕ привязана к tenant_id
-- напрямую, т.к. Business-план распределяется на несколько tenants
-- одного владельца. Проверка лимитов идет через owner_id -> subscription -> plan_limits.
-- ============================================================
CREATE TABLE subscriptions (
    id                  TEXT PRIMARY KEY,          -- uuid
    owner_id            TEXT NOT NULL UNIQUE,       -- один активный план на владельца
    plan_id             TEXT NOT NULL DEFAULT 'free',
    status              TEXT NOT NULL DEFAULT 'active', -- active | past_due | canceled | trialing
    payment_provider    TEXT,                       -- 'stripe' | 'paddle' | 'monopay' | NULL
    provider_customer_id TEXT,
    provider_subscription_id TEXT,
    current_period_end  TEXT,                       -- ISO8601, NULL для free
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (plan_id) REFERENCES plan_limits(plan_id)
);

CREATE INDEX idx_subscriptions_owner_id ON subscriptions(owner_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE categories (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_categories_tenant_id ON categories(tenant_id);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE products (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL,
    category_id   TEXT,
    name          TEXT NOT NULL,
    description   TEXT,
    price_cents   INTEGER NOT NULL,               -- храним в минимальных единицах валюты
    image_url     TEXT,                            -- R2 public URL / key
    is_available  INTEGER NOT NULL DEFAULT 1,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_tenant_available ON products(tenant_id, is_available);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
    id                TEXT PRIMARY KEY,
    tenant_id         TEXT NOT NULL,
    customer_name     TEXT NOT NULL,
    customer_phone    TEXT,
    customer_telegram TEXT,                        -- @username или chat_id клиента (если через бота)
    delivery_address  TEXT,
    comment           TEXT,
    status            TEXT NOT NULL DEFAULT 'new',  -- new | confirmed | preparing | completed | canceled
    payment_status    TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | paid | failed | refunded
    payment_provider  TEXT,
    total_cents       INTEGER NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX idx_orders_tenant_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- ============================================================
-- ORDER_ITEMS
-- Снимок товара на момент заказа (цена/название не должны
-- меняться ретроактивно при редактировании продукта).
-- ============================================================
CREATE TABLE order_items (
    id           TEXT PRIMARY KEY,
    order_id     TEXT NOT NULL,
    product_id   TEXT,                             -- может быть NULL, если товар удалён
    product_name TEXT NOT NULL,                     -- снимок названия
    unit_price_cents INTEGER NOT NULL,               -- снимок цены
    quantity     INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- ============================================================
-- SETTINGS
-- Гибкое key-value хранилище настроек на tenant (тема, соц. сети,
-- часы работы и т.п.) без необходимости миграций под каждую фичу.
-- ============================================================
CREATE TABLE settings (
    tenant_id  TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT,                                -- JSON-строка при сложных значениях
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (tenant_id, key),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
