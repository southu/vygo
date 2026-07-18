import type { ReactNode } from "react";

type CalloutType = "tip" | "warning" | "note";

const CALLOUT_CONFIG: Record<CalloutType, { label: string; icon: ReactNode }> = {
  tip: {
    label: "Tip",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 2a6 6 0 0 0-3.5 10.9c.4.3.6.8.6 1.3v.3a1 1 0 0 0 1 1h3.8a1 1 0 0 0 1-1v-.3c0-.5.2-1 .6-1.3A6 6 0 0 0 10 2Z" />
        <path d="M8 17.5a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1Z" />
      </svg>
    ),
  },
  warning: {
    label: "Warning",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10.9 2.6a1 1 0 0 0-1.8 0l-8 15A1 1 0 0 0 2 19h16a1 1 0 0 0 .9-1.4l-8-15ZM10 8a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm0 7.5a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z" />
      </svg>
    ),
  },
  note: {
    label: "Note",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-11a1.1 1.1 0 1 1 0-2.2A1.1 1.1 0 0 1 10 7Zm1 8H9v-6h2v6Z" />
      </svg>
    ),
  },
};

/**
 * Tip / warning / note callout. Each type gets its own CSS class
 * (callout-tip / callout-warning / callout-note in globals.css) carrying a
 * distinct background, accent color, and icon so it reads apart from body
 * text at a glance.
 */
export function Callout({ type, children }: { type: CalloutType; children: ReactNode }) {
  const config = CALLOUT_CONFIG[type];
  return (
    <div className={`callout callout-${type}`} data-callout={type} role="note">
      <span className="callout-icon" aria-hidden="true">
        {config.icon}
      </span>
      <div className="callout-body">
        <p className="callout-label">{config.label}</p>
        <div className="callout-text">{children}</div>
      </div>
    </div>
  );
}
