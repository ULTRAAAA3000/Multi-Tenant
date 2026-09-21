import type {
  Tenant,
  Category,
  Product,
  Order,
  OrderStatus,
  User,
  BillingInfo,
  PlanLimits,
  PlanId,
  NotificationChannel,
  PaymentMode,
  ApiErrorBody,
} from "./types";

/**
 * API_BASE is relative by default (dashboard served from the same
 * domain as the Worker), matching the convention set by storefront/.
 * Override with window.KIOSK_API_BASE if the dashboard is deployed
 * to a separate Pages project pointing at a different Worker domain.
 */
const API_BASE = (window as unknown as { KIOSK_API_BASE?: string }).KIOSK_API_BASE ?? "";

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

const TOKEN_STORAGE_KEY = "kiosk_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 401) {
    clearStoredToken();
    // Hard redirect rather than throwing — every call site would
    // otherwise need to handle "session expired" individually.
    window.location.href = "/login.html";
    throw new ApiRequestError("Session expired", "UNAUTHORIZED", 401);
  }

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // no JSON body — fall through to generic message
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
  // ---- Auth ----
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, name?: string) =>
    request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  // ---- Tenants (storefronts) ----
  listTenants: () => request<Tenant[]>("/admin/tenants"),
  getTenant: (id: string) => request<Tenant>(`/admin/tenants/${id}`),
  createTenant: (input: { name: string; slug: string; currency?: string }) =>
    request<Tenant>("/admin/tenants", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTenant: (
    id: string,
    input: Partial<{
      name: string;
      logoUrl: string;
      themeColor: string;
      currency: string;
      telegramBotToken: string;
      telegramChatId: string;
      notificationEmail: string;
      notificationChannels: NotificationChannel[];
      paymentMode: PaymentMode;
    }>
  ) =>
    request<Tenant>(`/admin/tenants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  updateTenantDomain: (id: string, domain: string | null) =>
    request<Tenant>(`/admin/tenants/${id}/domain`, {
      method: "PATCH",
      body: JSON.stringify({ domain }),
    }),

  // ---- Stripe Connect ----
  getStripeConnectUrl: (tenantId: string) =>
    request<{ url: string }>(`/auth/stripe/connect?tenant_id=${encodeURIComponent(tenantId)}`),
  disconnectStripe: (tenantId: string) =>
    request<Tenant>("/auth/stripe/disconnect", {
      method: "POST",
      body: JSON.stringify({ tenantId }),
    }),

  // ---- Billing ----
  getBilling: () => request<BillingInfo>("/admin/billing"),
  getPlans: () => request<PlanLimits[]>("/admin/billing/plans"),
  changePlan: (planId: PlanId) =>
    request<unknown>("/admin/billing/change-plan", {
      method: "POST",
      body: JSON.stringify({ planId }),
    }),

  // ---- Categories (tenant-scoped; requires X-Tenant-Id-less approach — see note) ----
  // NOTE: categories/products/orders on the public /api/* group are
  // resolved by Host header (tenantResolver), not by an explicit tenant
  // parameter. The dashboard, served from its own domain, cannot rely
  // on Host to mean "this tenant" the way the storefront can. These
  // calls pass tenantId explicitly via a header the dashboard-facing
  // routes read as a fallback (see backend note in DASHBOARD_API_NOTE.md
  // shipped alongside this app, and the corresponding backend change).
  listCategories: (tenantId: string) =>
    request<Category[]>("/admin/catalog/categories", {
      headers: { "X-Tenant-Id": tenantId },
    }),
  createCategory: (tenantId: string, input: { name: string; sortOrder?: number }) =>
    request<Category>("/admin/catalog/categories", {
      method: "POST",
      headers: { "X-Tenant-Id": tenantId },
      body: JSON.stringify(input),
    }),
  updateCategory: (
    tenantId: string,
    id: string,
    input: Partial<{ name: string; sortOrder: number; isActive: boolean }>
  ) =>
    request<Category>(`/admin/catalog/categories/${id}`, {
      method: "PATCH",
      headers: { "X-Tenant-Id": tenantId },
      body: JSON.stringify(input),
    }),
  deleteCategory: (tenantId: string, id: string) =>
    request<void>(`/admin/catalog/categories/${id}`, {
      method: "DELETE",
      headers: { "X-Tenant-Id": tenantId },
    }),

  listProducts: (tenantId: string) =>
    request<Product[]>("/admin/catalog/products", {
      headers: { "X-Tenant-Id": tenantId },
    }),
  createProduct: (
    tenantId: string,
    input: {
      name: string;
      description?: string;
      priceCents: number;
      categoryId?: string;
      imageUrl?: string;
      isAvailable?: boolean;
    }
  ) =>
    request<Product>("/admin/catalog/products", {
      method: "POST",
      headers: { "X-Tenant-Id": tenantId },
      body: JSON.stringify(input),
    }),
  updateProduct: (
    tenantId: string,
    id: string,
    input: Partial<{
      name: string;
      description: string;
      priceCents: number;
      categoryId: string | null;
      imageUrl: string;
      isAvailable: boolean;
      sortOrder: number;
    }>
  ) =>
    request<Product>(`/admin/catalog/products/${id}`, {
      method: "PATCH",
      headers: { "X-Tenant-Id": tenantId },
      body: JSON.stringify(input),
    }),
  deleteProduct: (tenantId: string, id: string) =>
    request<void>(`/admin/catalog/products/${id}`, {
      method: "DELETE",
      headers: { "X-Tenant-Id": tenantId },
    }),

  uploadMedia: async (tenantId: string, file: File): Promise<{ url: string }> => {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE}/admin/catalog/media/upload`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-Tenant-Id": tenantId,
      },
      body: formData,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      throw new ApiRequestError(
        body?.error.message ?? "Upload failed",
        body?.error.code ?? "UPLOAD_FAILED",
        response.status
      );
    }

    const json = (await response.json()) as { data: { url: string } };
    return json.data;
  },

  // ---- Orders ----
  listOrders: (tenantId: string, opts?: { status?: OrderStatus; sinceIso?: string }) => {
    const params = new URLSearchParams();
    if (opts?.status) params.set("status", opts.status);
    if (opts?.sinceIso) params.set("since", opts.sinceIso);
    const qs = params.toString();
    return request<Order[]>(`/admin/catalog/orders${qs ? `?${qs}` : ""}`, {
      headers: { "X-Tenant-Id": tenantId },
    });
  },
  updateOrderStatus: (tenantId: string, id: string, status: OrderStatus) =>
    request<Order>(`/admin/catalog/orders/${id}/status`, {
      method: "PATCH",
      headers: { "X-Tenant-Id": tenantId },
      body: JSON.stringify({ status }),
    }),
};
