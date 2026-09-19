export interface Category {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  customerName: string;
  customerPhone?: string;
  customerTelegram?: string;
  deliveryAddress?: string;
  comment?: string;
  items: OrderItemInput[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  unitPriceCents: number;
  quantity: number;
}

export type OrderStatus = "new" | "confirmed" | "preparing" | "completed" | "canceled";
export type PaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export interface Order {
  id: string;
  tenantId: string;
  customerName: string;
  customerPhone: string | null;
  customerTelegram: string | null;
  deliveryAddress: string | null;
  comment: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentProvider: string | null;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}

export interface TenantInfo {
  name: string;
  logoUrl: string | null;
  themeColor: string;
  currency: string;
  showBranding: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
