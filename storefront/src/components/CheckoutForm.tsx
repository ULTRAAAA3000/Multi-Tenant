import { useState, type FormEvent } from "react";
import { useCart } from "../lib/cart";
import { api, ApiRequestError } from "../lib/api";
import { formatPrice } from "../lib/format";
import "./CheckoutForm.css";

interface CheckoutFormProps {
  onSuccess: (orderId: string) => void;
  onBack: () => void;
}

export function CheckoutForm({ onSuccess, onBack }: CheckoutFormProps) {
  const { lines, totalCents, clear } = useCart();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (customerName.trim().length === 0) {
      setError("Please enter your name so we know who the order is for.");
      return;
    }

    setIsSubmitting(true);
    try {
      const order = await api.createOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
        comment: comment.trim() || undefined,
        items: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      });
      clear();
      onSuccess(order.id);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError("Couldn't place your order. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="checkout-form" onSubmit={handleSubmit}>
      <button type="button" className="back-link" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to cart
      </button>

      <h2>Delivery details</h2>

      <div className="form-field">
        <label htmlFor="customerName">Your name</label>
        <input
          id="customerName"
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Jane Smith"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="customerPhone">Phone number</label>
        <input
          id="customerPhone"
          type="tel"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="+1 555 000 0000"
        />
      </div>

      <div className="form-field">
        <label htmlFor="deliveryAddress">Delivery address</label>
        <input
          id="deliveryAddress"
          type="text"
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
          placeholder="Leave blank for pickup"
        />
      </div>

      <div className="form-field">
        <label htmlFor="comment">Order notes</label>
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Anything we should know?"
          rows={3}
        />
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="checkout-summary">
        <span>Total</span>
        <span className="mono">{formatPrice(totalCents)}</span>
      </div>

      <button type="submit" className="place-order-btn" disabled={isSubmitting}>
        {isSubmitting ? "Placing order…" : "Place order"}
      </button>
    </form>
  );
}
