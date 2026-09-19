-- Migration 0002: Users table for account authentication
-- Cloudflare D1 (SQLite)

PRAGMA foreign_keys = ON;

-- ============================================================
-- USERS
-- Владелец аккаунта — тот, кто логинится в админ-панель и
-- управляет одним или несколькими tenants (заведениями).
-- owner_id, использовавшийся в tenants/subscriptions с Фазы 1,
-- это users.id.
-- ============================================================
CREATE TABLE users (
    id            TEXT PRIMARY KEY,              -- uuid, это и есть owner_id везде в системе
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,                  -- PBKDF2 хэш, см. src/auth/password.ts
    name          TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_users_email ON users(email);
