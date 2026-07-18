"use client";

import { useState } from "react";

/**
 * Command/code snippet with a one-click copy button. Falls back to a
 * hidden-textarea + execCommand copy when the async Clipboard API throws
 * (e.g. insecure context), matching the pattern used by the readiness
 * prompt copy button in ReadinessFlow.
 */
export function CodeBlock({ code, language = "text" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const showCopied = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showCopied();
      return;
    } catch {
      // fall through to the execCommand fallback below
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showCopied();
    } catch {
      // clipboard truly unavailable — leave button in its default state
    }
  };

  return (
    <div className="code-block" data-code-block>
      <div className="code-block-header">
        <span className="code-block-lang">{language}</span>
        <button
          type="button"
          onClick={onCopy}
          className="code-block-copy"
          data-testid="code-copy-button"
          data-copied={copied ? "true" : "false"}
          aria-live="polite"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
