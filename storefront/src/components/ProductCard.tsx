import { useCart } from "../lib/cart";
import { formatPrice } from "../lib/format";
import type { Product } from "../lib/types";
import "./ProductCard.css";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem, lines, setQuantity } = useCart();
  const line = lines.find((l) => l.product.id === product.id);

  return (
    <div className={`product-card ${!product.isAvailable ? "unavailable" : ""}`}>
      <div className="product-image-slot">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <div className="product-image-placeholder" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
        {!product.isAvailable && <span className="unavailable-badge mono">Sold out</span>}
      </div>

      <div className="product-info">
        <h3>{product.name}</h3>
        {product.description && <p className="product-desc">{product.description}</p>}
      </div>

      <div className="product-footer">
        <span className="product-price mono">{formatPrice(product.priceCents)}</span>

        {product.isAvailable &&
          (line ? (
            <div className="qty-stepper">
              <button
                aria-label={`Decrease quantity of ${product.name}`}
                onClick={() => setQuantity(product.id, line.quantity - 1)}
              >
                −
              </button>
              <span className="mono">{line.quantity}</span>
              <button
                aria-label={`Increase quantity of ${product.name}`}
                onClick={() => setQuantity(product.id, line.quantity + 1)}
              >
                +
              </button>
            </div>
          ) : (
            <button className="add-btn" onClick={() => addItem(product)}>
              Add
            </button>
          ))}
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="product-card skeleton">
      <div className="product-image-slot skeleton-block" />
      <div className="product-info">
        <div className="skeleton-line" style={{ width: "70%" }} />
        <div className="skeleton-line" style={{ width: "90%" }} />
      </div>
      <div className="product-footer">
        <div className="skeleton-line" style={{ width: "40px" }} />
      </div>
    </div>
  );
}
