import { useEffect, useState } from "react";
import { api, ApiRequestError } from "../lib/api";
import { StateMessage } from "../components/StateMessage";
import type { BillingInfo, PlanId, PlanLimits } from "../lib/types";
import "./BillingPage.css";

const PLAN_LABELS: Record<PlanId, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

export function BillingPage() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [plans, setPlans] = useState<PlanLimits[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changingTo, setChangingTo] = useState<PlanId | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [billingInfo, planList] = await Promise.all([api.getBilling(), api.getPlans()]);
      setBilling(billingInfo);
      setPlans(planList);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't load billing info.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChangePlan = async (planId: PlanId) => {
    setChangeError(null);
    setChangingTo(planId);
    try {
      await api.changePlan(planId);
      await load();
    } catch (err) {
      setChangeError(err instanceof ApiRequestError ? err.message : "Couldn't change your plan.");
    } finally {
      setChangingTo(null);
    }
  };

  if (isLoading) return <StateMessage title="Loading billing…" description="Just a moment." />;
  if (error) return <StateMessage title="Something went wrong" description={error} actionLabel="Retry" onAction={load} />;
  if (!billing) return null;

  return (
    <div className="billing-page">
      <div className="page-header">
        <div>
          <h1>Billing</h1>
          <p className="page-subtitle mono">Current plan: {PLAN_LABELS[billing.plan.planId]}</p>
        </div>
      </div>

      <div className="usage-card">
        <div className="usage-row">
          <span>Storefronts</span>
          <span className="mono">
            {billing.usage.tenants} / {billing.plan.maxTenants}
          </span>
        </div>
        <div className="usage-row">
          <span>Products</span>
          <span className="mono">
            {billing.usage.products} / {billing.plan.maxProducts ?? "∞"}
          </span>
        </div>
      </div>

      {changeError && <div className="form-error">{changeError}</div>}

      <div className="plan-grid">
        {plans.map((plan) => {
          const isCurrent = plan.planId === billing.plan.planId;
          return (
            <div key={plan.planId} className={`plan-card ${isCurrent ? "current" : ""}`}>
              {isCurrent && <span className="current-tag">Current plan</span>}
              <h3>{PLAN_LABELS[plan.planId]}</h3>
              <div className="plan-price mono">
                ${(plan.priceUsdCents / 100).toFixed(0)}
                <span>/mo</span>
              </div>
              <ul>
                <li>{plan.maxTenants} storefront{plan.maxTenants > 1 ? "s" : ""}</li>
                <li>{plan.maxProducts === null ? "Unlimited products" : `Up to ${plan.maxProducts} products`}</li>
                {plan.customDomainAllowed && <li>Custom domain</li>}
                {plan.onlinePaymentsAllowed && <li>Online payments</li>}
                {plan.brandingRemovable && <li>No branding badge</li>}
                {plan.analyticsEnabled && <li>Sales analytics</li>}
                {plan.prioritySupport && <li>Priority support</li>}
              </ul>
              {!isCurrent && (
                <button
                  className="btn btn-primary plan-select"
                  onClick={() => handleChangePlan(plan.planId)}
                  disabled={changingTo !== null}
                >
                  {changingTo === plan.planId ? "Switching…" : `Switch to ${PLAN_LABELS[plan.planId]}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
