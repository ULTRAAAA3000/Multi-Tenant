import { useCart } from "../lib/cart";
import { formatPrice } from "../lib/format";
import "./CartDrawer.css";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export function CartDrawer({ isOpen, onClose, onCheckout }: CartDrawerProps) {
  const { lines, setQuantity, removeItem, totalCents } = useCart();

  return (
    <>
      <div
        className={`drawer-backdrop ${isOpen ? "open" : ""}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <aside className={`cart-drawer ${isOpen ? "open" : ""}`} aria-hidden={!isOpen}>
        <div className="drawer-header">
          <h2>Your order</h2>
          <button className="drawer-close" onClick={onClose} aria-label="Close cart">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="drawer-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <p>Nothing in your cart yet</p>
          </div>
        ) : (
          <>
            <div className="drawer-lines">
              {lines.map((line) => (
                <div className="drawer-line" key={line.product.id}>
                  <div className="drawer-line-info">
                    <span className="drawer-line-name">{line.product.name}</span>
                    <span className="drawer-line-unit mono">
                      {formatPrice(line.product.priceCents)} each
                    </span>
                  </div>
                  <div className="drawer-line-controls">
                    <div className="qty-stepper">
                      <button
                        aria-label={`Decrease quantity of ${line.product.name}`}
                        onClick={() => setQuantity(line.product.id, line.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="mono">{line.quantity}</span>
                      <button
                        aria-label={`Increase quantity of ${line.product.name}`}
                        onClick={() => setQuantity(line.product.id, line.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      className="remove-line"
                      onClick={() => removeItem(line.product.id)}
                      aria-label={`Remove ${line.product.name} from cart`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="drawer-footer">
              <div className="drawer-total">
                <span>Total</span>
                <span className="mono">{formatPrice(totalCents)}</span>
              </div>
              <button className="checkout-btn" onClick={onCheckout}>
                Checkout
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
