import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Tenant } from "./types";
import { api } from "./api";

interface TenantContextValue {
  tenants: Tenant[];
  activeTenant: Tenant | null;
  isLoading: boolean;
  error: string | null;
  setActiveTenantId: (id: string) => void;
  refresh: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

const ACTIVE_TENANT_KEY = "kiosk_active_tenant";

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(
    localStorage.getItem(ACTIVE_TENANT_KEY)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await api.listTenants();
      setTenants(list);

      // If the stored active tenant no longer exists (deleted, or
      // belongs to a stale session), fall back to the first one.
      const stillExists = list.some((t) => t.id === activeTenantId);
      if (!stillExists && list.length > 0) {
        setActiveTenantId(list[0]!.id);
      } else if (list.length === 0) {
        setActiveTenantIdState(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your storefronts.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveTenantId = (id: string) => {
    setActiveTenantIdState(id);
    localStorage.setItem(ACTIVE_TENANT_KEY, id);
  };

  const activeTenant = tenants.find((t) => t.id === activeTenantId) ?? null;

  return (
    <TenantContext.Provider
      value={{ tenants, activeTenant, isLoading, error, setActiveTenantId, refresh: load }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenants(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenants must be used within TenantProvider");
  return ctx;
}
