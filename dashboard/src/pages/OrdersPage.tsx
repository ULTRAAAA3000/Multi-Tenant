import { useTenants } from "../lib/tenant-context";
import { useLiveOrders } from "../hooks/useLiveOrders";
import { formatPrice, formatRelativeTime } from "../lib/format";
import { StateMessage } from "../components/StateMessage";
import type { Order, OrderStatus } from "../lib/types";
import "./OrdersPage.css";

const STATUS_FLOW: OrderStatus[] = ["new", "confirmed", "preparing", "completed"];

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  completed: "Completed",
  canceled: "Canceled",
};

function nextStatus(current: OrderStatus): OrderStatus | null {
  const index = STATUS_FLOW.indexOf(current);
  if (index === -1 || index === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[index + 1] ?? null;
}

export function OrdersPage() {
  const { activeTenant, isLoading: tenantLoading } = useTenants();
  const { orders, isLoading, error, soundEnabled, setSoundEnabled, refresh, updateStatus } =
    useLiveOrders(activeTenant?.id ?? null);

  if (tenantLoading) return null;

  if (!activeTenant) {
    return (
      <StateMessage
        title="No storefront yet"
        description="Create a storefront first to start taking orders."
      />
    );
  }

  const activeOrders = orders.filter((o) => o.status !== "completed" && o.status !== "canceled");
  const pastOrders = orders.filter((o) => o.status === "completed" || o.status === "canceled");

  return (
    <div className="orders-page">
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p className="page-subtitle mono">{activeTenant.name}</p>
        </div>
        <button
          className={`sound-toggle ${soundEnabled ? "on" : "off"}`}
          onClick={() => setSoundEnabled(!soundEnabled)}
          aria-pressed={soundEnabled}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {soundEnabled ? (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </>
            ) : (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </>
            )}
          </svg>
          {soundEnabled ? "Alerts on" : "Alerts off"}
        </button>
      </div>

      {error && (
        <StateMessage title="Couldn't load orders" description={error} actionLabel="Retry" onAction={refresh} />
      )}

      {!error && isLoading && orders.length === 0 && (
        <StateMessage title="Loading orders…" description="Just a moment." />
      )}

      {!error && !isLoading && orders.length === 0 && (
        <StateMessage
          title="No orders yet"
          description="New orders from your storefront will show up here — and you'll hear a chime when they do."
        />
      )}

      {activeOrders.length > 0 && (
        <div className="order-list">
          {activeOrders.map((order) => (
            <OrderCard key={order.id} order={order} onAdvance={updateStatus} />
          ))}
        </div>
      )}

      {pastOrders.length > 0 && (
        <details className="past-orders">
          <summary>Past orders ({pastOrders.length})</summary>
          <div className="order-list">
            {pastOrders.map((order) => (
              <OrderCard key={order.id} order={order} onAdvance={updateStatus} isPast />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function OrderCard({
  order,
  onAdvance,
  isPast = false,
}: {
  order: Order;
  onAdvance: (id: string, status: OrderStatus) => Promise<void>;
  isPast?: boolean;
}) {
  const next = nextStatus(order.status);

  return (
    <div className={`order-card ${isPast ? "past" : ""}`}>
      <div className="order-card-header">
        <div>
          <span className="order-id mono">#{order.id.slice(0, 8)}</span>
          <span className={`status-pill status-${order.status}`}>{STATUS_LABELS[order.status]}</span>
        </div>
        <span className="order-time mono">{formatRelativeTime(order.createdAt)}</span>
      </div>

      <div className="order-customer">
        <strong>{order.customerName}</strong>
        {order.customerPhone && <span className="mono"> · {order.customerPhone}</span>}
      </div>
      {order.deliveryAddress && <div className="order-address">{order.deliveryAddress}</div>}

      <ul className="order-items">
        {(order.items ?? []).map((item) => (
          <li key={item.id}>
            {item.productName} × {item.quantity}
            <span className="mono">{formatPrice(item.unitPriceCents * item.quantity)}</span>
          </li>
        ))}
      </ul>

      {order.comment && <div className="order-comment">"{order.comment}"</div>}

      <div className="order-card-footer">
        <span className="order-total mono">{formatPrice(order.totalCents)}</span>
        {!isPast && (
          <div className="order-actions">
            {order.status !== "canceled" && (
              <button className="btn-sm btn-secondary" onClick={() => onAdvance(order.id, "canceled")}>
                Cancel
              </button>
            )}
            {next && (
              <button className="btn-sm btn-primary" onClick={() => onAdvance(order.id, next)}>
                Mark {STATUS_LABELS[next]}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
