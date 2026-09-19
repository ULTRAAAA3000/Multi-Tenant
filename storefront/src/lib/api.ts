import type {
  Category,
  Product,
  Order,
  CreateOrderInput,
  ApiErrorBody,
} from "./types";

/**
 * The Worker resolves tenant_id from the Host header of the request,
 * so the storefront calls relative /api paths — it's always served
 * from the tenant's own subdomain or custom domain, meaning the
 * browser's Host header IS the tenant identity. No tenant slug is
 * ever passed explicitly from the frontend.
 */
const API_BASE = "/api";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // response had no JSON body — fall through to generic error
    }
    throw new ApiRequestError(
      body?.error.message ?? "Something went wrong. Please try again.",
      body?.error.code ?? "UNKNOWN_ERROR",
      response.status
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const json = (await response.json()) as { data: T };
  return json.data;
}

export const api = {
  getCategories: () => request<Category[]>("/categories"),

  getProducts: (opts?: { categoryId?: string; onlyAvailable?: boolean }) => {
    const params = new URLSearchParams();
    if (opts?.categoryId) params.set("category_id", opts.categoryId);
    if (opts?.onlyAvailable) params.set("only_available", "true");
    const qs = params.toString();
    return request<Product[]>(`/products${qs ? `?${qs}` : ""}`);
  },

  createOrder: (input: CreateOrderInput) =>
    request<Order>("/orders", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getOrder: (id: string) => request<Order>(`/orders/${id}`),
};
