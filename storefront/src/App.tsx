import { CartProvider } from "./lib/cart";
import { Storefront } from "./pages/Storefront";

export function App() {
  return (
    <CartProvider>
      <Storefront />
    </CartProvider>
  );
}
