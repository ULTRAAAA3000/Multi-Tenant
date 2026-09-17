import { Errors } from "./api";

export function requireString(value: unknown, fieldName: string, maxLength = 500): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw Errors.validation(`Field "${fieldName}" is required and must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw Errors.validation(`Field "${fieldName}" must be at most ${maxLength} characters`);
  }
  return value.trim();
}

export function optionalString(value: unknown, fieldName: string, maxLength = 2000): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw Errors.validation(`Field "${fieldName}" must be a string`);
  }
  if (value.length > maxLength) {
    throw Errors.validation(`Field "${fieldName}" must be at most ${maxLength} characters`);
  }
  return value;
}

export function requirePositiveInt(value: unknown, fieldName: string): number {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isInteger(num) || num < 0) {
    throw Errors.validation(`Field "${fieldName}" must be a non-negative integer`);
  }
  return num;
}

export function optionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw Errors.validation(`Field "${fieldName}" must be a boolean`);
  }
  return value;
}

/**
 * Валидация slug для tenant: только латиница, цифры и дефис,
 * чтобы гарантированно быть валидным поддоменом.
 */
export function requireSlug(value: unknown): string {
  const str = requireString(value, "slug", 63);
  const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (!slugPattern.test(str)) {
    throw Errors.validation(
      "Field \"slug\" must contain only lowercase letters, numbers and hyphens"
    );
  }
  return str;
}
