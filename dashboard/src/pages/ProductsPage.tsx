import { useEffect, useState, type FormEvent } from "react";
import { useTenants } from "../lib/tenant-context";
import { api, ApiRequestError } from "../lib/api";
import { formatPrice } from "../lib/format";
import { StateMessage } from "../components/StateMessage";
import { Modal } from "../components/Modal";
import type { Category, Product } from "../lib/types";
import "./ProductsPage.css";

export function ProductsPage() {
  const { activeTenant, isLoading: tenantLoading } = useTenants();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingProduct, setEditingProduct] = useState<Product | "new" | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  const load = async () => {
    if (!activeTenant) return;
    setIsLoading(true);
    setError(null);
    try {
      const [cats, prods] = await Promise.all([
        api.listCategories(activeTenant.id),
        api.listProducts(activeTenant.id),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load your catalog.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenant?.id]);

  if (tenantLoading) return null;

  if (!activeTenant) {
    return (
      <StateMessage title="No storefront yet" description="Create a storefront first to add products." />
    );
  }

  const productsByCategory = new Map<string | null, Product[]>();
  for (const product of products) {
    const key = product.categoryId;
    const list = productsByCategory.get(key) ?? [];
    list.push(product);
    productsByCategory.set(key, list);
  }

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This can't be undone.`)) return;
    await api.deleteProduct(activeTenant.id, product.id);
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
  };

  return (
    <div className="products-page">
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p className="page-subtitle mono">{activeTenant.name}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setIsAddingCategory(true)}>
            + Category
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditingProduct("new")}>
            + Product
          </button>
        </div>
      </div>

      {error && <StateMessage title="Something went wrong" description={error} actionLabel="Retry" onAction={load} />}

      {!error && isLoading && <StateMessage title="Loading your catalog…" description="Just a moment." />}

      {!error && !isLoading && products.length === 0 && (
        <StateMessage
          title="No products yet"
          description="Add your first product to get your storefront ready to take orders."
          actionLabel="Add a product"
          onAction={() => setEditingProduct("new")}
        />
      )}

      {!error && !isLoading && products.length > 0 && (
        <div className="category-sections">
          {categories.map((category) => {
            const items = productsByCategory.get(category.id) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={category.id} className="category-section">
                <h2>{category.name}</h2>
                <div className="product-table">
                  {items.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      onEdit={() => setEditingProduct(product)}
                      onDelete={() => handleDeleteProduct(product)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {(productsByCategory.get(null) ?? []).length > 0 && (
            <div className="category-section">
              <h2>Uncategorized</h2>
              <div className="product-table">
                {(productsByCategory.get(null) ?? []).map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    onEdit={() => setEditingProduct(product)}
                    onDelete={() => handleDeleteProduct(product)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editingProduct && (
        <ProductFormModal
          tenantId={activeTenant.id}
          categories={categories}
          product={editingProduct === "new" ? null : editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={(saved) => {
            setProducts((prev) => {
              const exists = prev.some((p) => p.id === saved.id);
              return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
            });
            setEditingProduct(null);
          }}
        />
      )}

      {isAddingCategory && (
        <CategoryFormModal
          tenantId={activeTenant.id}
          onClose={() => setIsAddingCategory(false)}
          onSaved={(saved) => {
            setCategories((prev) => [...prev, saved]);
            setIsAddingCategory(false);
          }}
        />
      )}
    </div>
  );
}

function ProductRow({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`product-row ${!product.isAvailable ? "unavailable" : ""}`}>
      <div className="product-row-image">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        )}
      </div>
      <div className="product-row-info">
        <span className="product-row-name">{product.name}</span>
        {!product.isAvailable && <span className="product-row-badge mono">Sold out</span>}
      </div>
      <span className="product-row-price mono">{formatPrice(product.priceCents)}</span>
      <div className="product-row-actions">
        <button className="btn-sm btn-secondary" onClick={onEdit}>
          Edit
        </button>
        <button className="btn-sm btn-danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function ProductFormModal({
  tenantId,
  categories,
  product,
  onClose,
  onSaved,
}: {
  tenantId: string;
  categories: Category[];
  product: Product | null;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? (product.priceCents / 100).toFixed(2) : "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [isAvailable, setIsAvailable] = useState(product?.isAvailable ?? true);
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const result = await api.uploadMedia(tenantId, file);
      setImageUrl(result.url);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const priceCents = Math.round(parseFloat(price) * 100);
    if (!name.trim() || Number.isNaN(priceCents) || priceCents < 0) {
      setError("Please enter a name and a valid price.");
      return;
    }

    setIsSubmitting(true);
    try {
      const input = {
        name: name.trim(),
        description: description.trim() || undefined,
        priceCents,
        categoryId: categoryId || undefined,
        imageUrl: imageUrl || undefined,
        isAvailable,
      };
      const saved = product
        ? await api.updateProduct(tenantId, product.id, input)
        : await api.createProduct(tenantId, input);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save this product.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title={product ? "Edit product" : "Add product"} onClose={onClose}>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="p-name">Name</label>
          <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="p-desc">Description</label>
          <textarea
            id="p-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="p-price">Price</label>
            <input
              id="p-price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="p-category">Category</label>
            <select id="p-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-image">Photo</label>
          <input id="p-image" type="file" accept="image/*" onChange={handleFileChange} disabled={isUploading} />
          {isUploading && <div className="field-hint">Uploading…</div>}
          {imageUrl && !isUploading && (
            <div className="image-preview">
              <img src={imageUrl} alt="Preview" />
            </div>
          )}
        </div>
        <label className="checkbox-field">
          <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
          Available for order
        </label>
        <button type="submit" className="btn btn-primary modal-submit" disabled={isSubmitting || isUploading}>
          {isSubmitting ? "Saving…" : "Save product"}
        </button>
      </form>
    </Modal>
  );
}

function CategoryFormModal({
  tenantId,
  onClose,
  onSaved,
}: {
  tenantId: string;
  onClose: () => void;
  onSaved: (category: Category) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a category name.");
      return;
    }
    setIsSubmitting(true);
    try {
      const saved = await api.createCategory(tenantId, { name: name.trim() });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't create this category.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Add category" onClose={onClose}>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="c-name">Name</label>
          <input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Coffee, Pastries, …"
            autoFocus
            required
          />
        </div>
        <button type="submit" className="btn btn-primary modal-submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create category"}
        </button>
      </form>
    </Modal>
  );
}
