import { Hono } from "hono";
import type { Env } from "../types/env";
import { UsersRepository } from "../db/users.repository";
import { hashPassword, verifyPassword } from "./password";
import { createSessionToken } from "./jwt";
import { generateId, ApiError, errorResponse, Errors } from "../utils/api";
import { requireString } from "../utils/validation";

const auth = new Hono<{ Bindings: Env }>();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: unknown): string {
  const email = requireString(value, "email", 254);
  if (!EMAIL_PATTERN.test(email)) {
    throw Errors.validation('Field "email" must be a valid email address');
  }
  return email.toLowerCase();
}

function validatePassword(value: unknown): string {
  const password = requireString(value, "password", 200);
  if (password.length < 8) {
    throw Errors.validation("Password must be at least 8 characters long");
  }
  return password;
}

auth.post("/register", async (c) => {
  const usersRepo = new UsersRepository(c.env.DB);

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const email = validateEmail(body.email);
    const password = validatePassword(body.password);
    const name = body.name !== undefined ? requireString(body.name, "name", 200) : undefined;

    const existing = await usersRepo.findByEmail(email);
    if (existing) {
      throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }

    const passwordHash = await hashPassword(password);
    const user = await usersRepo.create(generateId(), email, passwordHash, name);

    const token = await createSessionToken(user.id, user.email, c.env.JWT_SECRET);

    return c.json(
      { data: { token, user: { id: user.id, email: user.email, name: user.name } } },
      201
    );
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

auth.post("/login", async (c) => {
  const usersRepo = new UsersRepository(c.env.DB);

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const email = validateEmail(body.email);
    const password = requireString(body.password, "password", 200);

    const user = await usersRepo.findByEmail(email);

    // Одинаковое сообщение об ошибке для "нет такого email" и "неверный
    // пароль" — не даём атакующему через ответ понять, зарегистрирован
    // ли email в системе (защита от user enumeration).
    const invalidCredentials = () =>
      new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");

    if (!user || !user.isActive) {
      throw invalidCredentials();
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw invalidCredentials();
    }

    const token = await createSessionToken(user.id, user.email, c.env.JWT_SECRET);

    return c.json({ data: { token, user: { id: user.id, email: user.email, name: user.name } } });
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(c, err);
    throw err;
  }
});

export default auth;
