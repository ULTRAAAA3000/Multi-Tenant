import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiRequestError } from "../lib/api";
import { useTenants } from "../lib/tenant-context";
import "./OnboardingPage.css";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { refresh, setActiveTenantId } = useTenants();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const slug = slugify(name);
    if (!slug) {
      setError("Please enter a storefront name.");
      return;
    }

    setIsSubmitting(true);
    try {
      const tenant = await api.createTenant({ name: name.trim(), slug });
      await refresh();
      setActiveTenantId(tenant.id);
      navigate("/products");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't create your storefront.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-panel">
        <div className="onboarding-brand">
          <span className="brand-led online" />
          KIOSK
        </div>
        <h1>Name your storefront</h1>
        <p className="onboarding-subtitle">
          You're set up to take orders on cash-or-card-on-pickup by default — no payment
          setup required to get started. Add your first product next.
        </p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="storefront-name">Storefront name</label>
            <input
              id="storefront-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunroom Café"
              autoFocus
              required
            />
            {name && <div className="field-hint">Your link: {slugify(name) || "…"}.kiosk.example.com</div>}
          </div>
          <button type="submit" className="btn btn-primary onboarding-submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create storefront"}
          </button>
        </form>
      </div>
    </div>
  );
}
