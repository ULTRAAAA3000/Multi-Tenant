import "./BrandingFooter.css";

/**
 * Free-tier viral loop: every storefront on the free plan shows this
 * footer. The `showBranding` flag is expected to come from the
 * tenant's settings (populated from plan_limits.branding_removable
 * once the admin dashboard in Phase 5 wires it up) — this component
 * renders nothing when branding is disabled, so integrating it is a
 * single boolean prop, no conditional logic needed at the call site.
 */
export function BrandingFooter({ showBranding }: { showBranding: boolean }) {
  if (!showBranding) return null;

  return (
    <a
      className="branding-footer"
      href="https://kiosk.example.com"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="brand-led" />
      Powered by <strong>Kiosk</strong>
    </a>
  );
}
