import "./StateMessage.css";

interface StateMessageProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function StateMessage({ title, description, actionLabel, onAction }: StateMessageProps) {
  return (
    <div className="state-message">
      <div className="state-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && onAction && (
        <button className="btn btn-secondary btn-sm" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
