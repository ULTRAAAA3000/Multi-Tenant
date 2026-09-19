import "./OrderConfirmation.css";

interface OrderConfirmationProps {
  orderId: string;
  onDone: () => void;
}

export function OrderConfirmation({ orderId, onDone }: OrderConfirmationProps) {
  return (
    <div className="confirmation">
      <div className="confirmation-led">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2>Order sent</h2>
      <p>
        Your order <span className="mono">#{orderId.slice(0, 8)}</span> has been received. The
        shop will reach out to confirm the details.
      </p>
      <button className="done-btn" onClick={onDone}>
        Back to menu
      </button>
    </div>
  );
}
