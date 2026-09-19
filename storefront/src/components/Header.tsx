import { useCart } from "../lib/cart";
import "./Header.css";

interface HeaderProps {
  tenantName: string;
  onCartClick: () => void;
}

export function Header({ tenantName, onCartClick }: HeaderProps) {
  const { itemCount, totalCents } = useCart();

  return (
    <header className="storefront-header">
      <div className="storefront-header-inner">
        <div className="storefront-brand">
          <span className="brand-led" />
          <span className="storefront-brand-name">{tenantName}</span>
        </div>

        <button className="cart-trigger" onClick={onCartClick} aria-label="Open cart">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {itemCount > 0 && (
            <>
              <span className="cart-count mono">{itemCount}</span>
              <span className="cart-total mono">${(totalCents / 100).toFixed(2)}</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
