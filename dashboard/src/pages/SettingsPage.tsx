import { useEffect, useState, type FormEvent } from "react";
import { useTenants } from "../lib/tenant-context";
import { api, ApiRequestError } from "../lib/api";
import { StateMessage } from "../components/StateMessage";
import type { NotificationChannel } from "../lib/types";
import "./SettingsPage.css";

export function SettingsPage() {
  const { activeTenant, isLoading: tenantLoading, refresh } = useTenants();

  // Read Stripe Connect callback status from the URL, if we were just
  // redirected back from Stripe (see backend /auth/stripe/callback).
  const [connectStatus, setConnectStatus] = useState<{ status: "success" | "error"; reason?: string } | null>(
    null
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("stripe_connect");
    if (status === "success" || status === "error") {
      setConnectStatus({ status, reason: params.get("reason") ?? undefined });
      // Clean the URL so refreshing doesn't re-show the banner.
      window.history.replaceState({}, "", window.location.pathname);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (tenantLoading) return null;

  if (!activeTenant) {
    return <StateMessage title="No storefront yet" description="Create a storefront first to configure it." />;
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle mono">{activeTenant.name}</p>
        </div>
      </div>

      {connectStatus?.status === "success" && (
        <div className="form-success">Stripe account connected successfully.</div>
      )}
      {connectStatus?.status === "error" && (
        <div className="form-error">
          Couldn't connect Stripe{connectStatus.reason ? ` (${connectStatus.reason})` : ""}. Please try again.
        </div>
      )}

      <div className="settings-sections">
        <PaymentsSection tenant={activeTenant} onUpdated={refresh} />
        <NotificationsSection tenant={activeTenant} onUpdated={refresh} />
        <DomainSection tenant={activeTenant} onUpdated={refresh} />
      </div>
    </div>
  );
}

function PaymentsSection({
  tenant,
  onUpdated,
}: {
  tenant: NonNullable<ReturnType<typeof useTenants>["activeTenant"]>;
  onUpdated: () => void;
}) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    setIsConnecting(true);
    try {
      const { url } = await api.getStripeConnectUrl(tenant.id);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't start Stripe connection.");
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Stripe? Online payments will turn off and orders will go back to cash/card on pickup.")) {
      return;
    }
    setError(null);
    setIsDisconnecting(true);
    try {
      await api.disconnectStripe(tenant.id);
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't disconnect Stripe.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <section className="settings-section">
      <h2>Payments</h2>
      <p className="settings-section-description">
        By default, orders are cash or card on pickup — no setup required. Connect Stripe to
        accept online payments; money goes directly to your account, not through us.
      </p>

      {error && <div className="form-error">{error}</div>}

      {tenant.stripeUserId ? (
        <div className="stripe-connected">
          <div className="stripe-status">
            <span className="brand-led online" />
            <span>
              Stripe connected <span className="mono">({tenant.stripeUserId})</span>
            </span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleDisconnect} disabled={isDisconnecting}>
            {isDisconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      ) : (
        <button className="stripe-connect-btn" onClick={handleConnect} disabled={isConnecting}>
          <StripeLogo />
          {isConnecting ? "Redirecting…" : "Connect with Stripe"}
        </button>
      )}
    </section>
  );
}

function NotificationsSection({
  tenant,
  onUpdated,
}: {
  tenant: NonNullable<ReturnType<typeof useTenants>["activeTenant"]>;
  onUpdated: () => void;
}) {
  const [email, setEmail] = useState(tenant.notificationEmail ?? "");
  const [channels, setChannels] = useState<Set<NotificationChannel>>(new Set(tenant.notificationChannels));
  const [telegramChatId, setTelegramChatId] = useState(tenant.telegramChatId ?? "");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleChannel = (channel: NotificationChannel) => {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (channels.has("email") && !email.trim()) {
      setError("Enter an email address, or turn off the email channel.");
      return;
    }
    if (channels.has("telegram") && (!telegramChatId.trim() || !tenant.telegramChatId && !telegramBotToken.trim())) {
      setError("Enter both a bot token and chat ID to enable Telegram, or turn it off.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.updateTenant(tenant.id, {
        notificationEmail: email.trim() || undefined,
        notificationChannels: Array.from(channels),
        telegramChatId: telegramChatId.trim() || undefined,
        telegramBotToken: telegramBotToken.trim() || undefined,
      });
      setTelegramBotToken("");
      setSuccess(true);
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't save notification settings.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="settings-section">
      <h2>Order notifications</h2>
      <p className="settings-section-description">
        Email is the primary channel — no setup beyond an address. Telegram is optional, on top of email.
      </p>

      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">Settings saved.</div>}

      <form onSubmit={handleSubmit}>
        <label className="checkbox-field">
          <input type="checkbox" checked={channels.has("email")} onChange={() => toggleChannel("email")} />
          Email notifications
        </label>
        {channels.has("email") && (
          <div className="field indented">
            <label htmlFor="notif-email">Notification email</label>
            <input
              id="notif-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        )}

        <label className="checkbox-field">
          <input type="checkbox" checked={channels.has("telegram")} onChange={() => toggleChannel("telegram")} />
          Telegram notifications (optional)
        </label>
        {channels.has("telegram") && (
          <div className="indented">
            <div className="field">
              <label htmlFor="tg-token">Bot token</label>
              <input
                id="tg-token"
                type="password"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder={tenant.telegramBotToken ? "•••••••• (already set — leave blank to keep)" : "123456:ABC-DEF..."}
              />
            </div>
            <div className="field">
              <label htmlFor="tg-chat">Chat ID</label>
              <input
                id="tg-chat"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="e.g. 123456789"
              />
            </div>
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save notification settings"}
        </button>
      </form>
    </section>
  );
}

function DomainSection({
  tenant,
  onUpdated,
}: {
  tenant: NonNullable<ReturnType<typeof useTenants>["activeTenant"]>;
  onUpdated: () => void;
}) {
  const [domain, setDomain] = useState(tenant.customDomain ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);
    try {
      await api.updateTenantDomain(tenant.id, domain.trim() || null);
      setSuccess(true);
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't update the custom domain.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="settings-section">
      <h2>Custom domain</h2>
      <p className="settings-section-description">
        Available on Pro and Business plans. Point your domain's DNS at Kiosk to use it here.
      </p>

      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">Domain updated.</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="domain">Domain</label>
          <input
            id="domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="menu.yourcafe.com"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save domain"}
        </button>
      </form>
    </section>
  );
}

function StripeLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="6" fill="#635BFF" />
      <path
        d="M14.9 12.9c0-1 0.8-1.4 2.1-1.4 1.9 0 4.3 0.6 6.2 1.6V7.5c-2.1-0.8-4.1-1.2-6.2-1.2-5.1 0-8.5 2.7-8.5 7.1 0 6.9 9.6 5.8 9.6 8.8 0 1.2-1 1.6-2.4 1.6-2.1 0-4.7-0.9-6.8-2v5.7c2.3 1 4.7 1.4 6.8 1.4 5.2 0 8.8-2.6 8.8-7 0-7.4-9.6-6.1-9.6-9z"
        fill="white"
      />
    </svg>
  );
}
