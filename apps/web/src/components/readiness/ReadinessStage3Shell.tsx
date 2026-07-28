"use client";

import { useEffect, useState } from "react";
import { readinessContent } from "@/content/readiness";

/**
 * Static, inert Stage 3 paste-back shell rendered into the initial /readiness
 * HTML so GET /readiness always ships a large paste textarea in page source (a
 * no-JS/source acceptance). It shares the readiness-stage3 / readiness-paste-*
 * testids with the live flow.
 *
 * After hydration the interactive ReadinessFlow OWNS the live Stage 3 UI (same
 * testids), so this shell must not linger: left mounted, its readiness-stage3 /
 * readiness-paste-textarea nodes read as a stale, stray paste panel on the
 * project-selection start step — exactly the leak seen on /readiness?new=1 and
 * after the in-page "New analysis" reset, where the step must show project
 * selection ONLY. So it renders identically on the server and the first client
 * render (hydration match), then REMOVES itself in an effect: the raw document
 * still contains the textarea, but no post-hydration client view ever shows a
 * second, stale Stage 3.
 */
export function ReadinessStage3Shell() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  if (hydrated) return null;

  const s3 = readinessContent.stage3;
  return (
    <div
      className="sr-only"
      aria-hidden="true"
      data-readiness-stage3-shell="true"
      data-testid="readiness-stage3"
    >
      <h2>{s3.title}</h2>
      <p>{s3.body}</p>
      <p>{s3.noSendHelper}</p>
      <form
        action="/api/readiness/submit"
        method="post"
        data-submit-url="/api/readiness/submit"
        data-testid="readiness-paste-form"
      >
        <label htmlFor="readiness-paste-shell">{s3.textareaLabel}</label>
        <textarea
          id="readiness-paste-shell"
          name="paste"
          rows={16}
          readOnly
          tabIndex={-1}
          placeholder={s3.textareaPlaceholder}
          data-testid="readiness-paste-textarea"
          defaultValue=""
        />
        <button type="submit" disabled tabIndex={-1} data-testid="readiness-paste-submit">
          {s3.submit}
        </button>
      </form>
    </div>
  );
}
