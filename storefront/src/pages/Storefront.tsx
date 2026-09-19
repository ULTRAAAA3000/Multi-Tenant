import { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { CategoryTabs } from "../components/CategoryTabs";
import { ProductCard, ProductCardSkeleton } from "../components/ProductCard";
import { CartDrawer } from "../components/CartDrawer";
import { CheckoutForm } from "../components/CheckoutForm";
import { OrderConfirmation } from "../components/OrderConfirmation";
import { StateMessage } from "../components/StateMessage";
import { BrandingFooter } from "../components/BrandingFooter";
import { useCart } from "../lib/cart";
import { api, ApiRequestError } from "../lib/api";
import type { Category, Product } from "../lib/types";
import "./Storefront.css";

type DrawerView = "cart" | "checkout" | "confirmation";

export function Storefront() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState<DrawerView>("cart");
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);

  const { itemCount } = useCart();

  const loadData = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [categoriesData, productsData] = await Promise.all([
        api.getCategories(),
        api.getProducts({ onlyAvailable: false }),
      ]);
      setCategories(categoriesData);
      setProducts(productsData);
    } catch (err) {
      setLoadError(
        err instanceof ApiRequestError
          ? err.message
          : "Couldn't load the menu. Check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleProducts = activeCategory
    ? products.filter((p) => p.categoryId === activeCategory)
    : products;

  const openCart = () => {
    setDrawerView("cart");
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => setIsDrawerOpen(false);

  const handleCheckoutSuccess = (orderId: string) => {
    setCompletedOrderId(orderId);
    setDrawerView("confirmation");
  };

  const handleDone = () => {
    setIsDrawerOpen(false);
    setCompletedOrderId(null);
  };

  return (
    <div className="storefront">
      <Header tenantName="Storefront" onCartClick={openCart} />

      <main className="storefront-main">
        {categories.length > 0 && (
          <CategoryTabs
            categories={categories}
            activeId={activeCategory}
            onSelect={setActiveCategory}
          />
        )}

        {isLoading && (
          <div className="product-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!isLoading && loadError && (
          <StateMessage
            title="Something went wrong"
            description={loadError}
            actionLabel="Try again"
            onAction={loadData}
          />
        )}

        {!isLoading && !loadError && visibleProducts.length === 0 && (
          <StateMessage
            title="Nothing here yet"
            description={
              activeCategory
                ? "No items in this category right now."
                : "This menu doesn't have any items yet. Check back soon."
            }
          />
        )}

        {!isLoading && !loadError && visibleProducts.length > 0 && (
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>

      <BrandingFooter showBranding={true} />

      {itemCount > 0 && !isDrawerOpen && (
        <button className="mobile-cart-bar" onClick={openCart}>
          <span>
            {itemCount} item{itemCount > 1 ? "s" : ""} in cart
          </span>
          <span className="mobile-cart-bar-arrow">View cart →</span>
        </button>
      )}

      <CartDrawer
        isOpen={isDrawerOpen && drawerView === "cart"}
        onClose={closeDrawer}
        onCheckout={() => setDrawerView("checkout")}
      />

      {isDrawerOpen && drawerView === "checkout" && (
        <>
          <div className="drawer-backdrop open" onClick={closeDrawer} />
          <aside className="cart-drawer open">
            <div className="drawer-header">
              <h2>Checkout</h2>
              <button className="drawer-close" onClick={closeDrawer} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <CheckoutForm onSuccess={handleCheckoutSuccess} onBack={() => setDrawerView("cart")} />
          </aside>
        </>
      )}

      {isDrawerOpen && drawerView === "confirmation" && completedOrderId && (
        <>
          <div className="drawer-backdrop open" onClick={handleDone} />
          <aside className="cart-drawer open">
            <div className="drawer-header">
              <h2>Order confirmed</h2>
              <button className="drawer-close" onClick={handleDone} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <OrderConfirmation orderId={completedOrderId} onDone={handleDone} />
          </aside>
        </>
      )}
    </div>
  );
}
