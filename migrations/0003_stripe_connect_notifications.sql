-- Migration 0003: Stripe Connect + Notification Engine fields
-- Cloudflare D1 (SQLite)

PRAGMA foreign_keys = ON;

-- ============================================================
-- TENANTS: Stripe Connect
-- stripe_user_id — Connected Account ID (acct_...), НЕ секрет,
-- безопасно хранить в открытом виде (это публичный идентификатор
-- аккаунта, используется как stripe_account параметр в API-вызовах).
-- stripe_access_token — OAuth access token коннекшена, ЧУВСТВИТЕЛЬНЫЙ,
-- шифруется тем же механизмом, что и telegram_bot_token
-- (см. src/utils/crypto.ts) перед записью.
-- ============================================================
ALTER TABLE tenants ADD COLUMN stripe_user_id TEXT;
ALTER TABLE tenants ADD COLUMN stripe_access_token TEXT;
ALTER TABLE tenants ADD COLUMN stripe_connected_at TEXT;

-- ============================================================
-- TENANTS: Notification Engine
-- notification_email — основной канал уведомлений о заказах (Европа).
-- notification_channels — JSON-массив активных каналов, например
-- '["email"]' или '["email","telegram"]'. Email всегда доступен как
-- канал (не требует внешней настройки, в отличие от Telegram-бота),
-- поэтому онбординг не блокируется отсутствием Telegram.
-- ============================================================
ALTER TABLE tenants ADD COLUMN notification_email TEXT;
ALTER TABLE tenants ADD COLUMN notification_channels TEXT NOT NULL DEFAULT '["email"]';

-- ============================================================
-- TENANTS: Onboarding / Payment mode
-- payment_mode — режим приёма оплаты по умолчанию для нового tenant.
-- 'cash_on_pickup' не требует Stripe Connect и ничего не блокирует —
-- витрина принимает заказы сразу после создания. 'online' включается
-- отдельным тумблером после подключения Stripe Connect.
-- ============================================================
ALTER TABLE tenants ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'cash_on_pickup';

CREATE INDEX idx_tenants_stripe_user_id ON tenants(stripe_user_id);
