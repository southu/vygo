/**
 * Lightweight, honest mid-flow callouts that echo the prospect's actual input.
 * Never claims scores, completed analysis, or results.
 */
import { extractNamedTools } from "@vygo/validation";

export type AnswerCalloutPayload = {
  /** Stable key for animation remount + test selectors */
  id: string;
  /** Visible callout copy — must reflect entered data only */
  text: string;
};

/** Split free-text platform/tool lists (comma / and / newline). */
export function parseListedItems(text: string): string[] {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return [];
  // Prefer known tool catalog hits (order preserved).
  const named = extractNamedTools(raw);
  if (named.length >= 2) return named;
  if (named.length === 1) return named;

  // Fallback: only treat as a list when separators look list-like (comma/semicolon/
  // newline/bullet), not prose joined by "and" alone (avoids "We need X and Y").
  const hasListSeparator = /[,;\n•]|&/.test(raw) || /\s+and\s+/i.test(raw);
  if (!hasListSeparator) return [];

  const parts = raw
    .split(/,|;|\n|\band\b|&/i)
    .map((s) => s.replace(/^[\s\-•*]+|[\s\-•*.]+$/g, "").trim())
    .filter((s) => s.length >= 2 && s.length <= 48);
  // Prefer multi-item lists of short name-like tokens; long phrases are not platforms.
  if (parts.length >= 2 && parts.every((p) => p.split(/\s+/).length <= 4)) {
    return parts;
  }
  return [];
}

function clip(value: string, max = 80): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Product / free-text description callout; elevates tool lists when present. */
export function calloutForProductDescription(value: string): AnswerCalloutPayload | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const platforms = parseListedItems(trimmed);
  if (platforms.length >= 2) {
    const names = platforms.slice(0, 6).join(", ");
    const n = platforms.length;
    return {
      id: "product-tools",
      text: `Got it — we'll assess your readiness across those ${n} platform${n === 1 ? "" : "s"} (${names}).`,
    };
  }
  if (platforms.length === 1) {
    return {
      id: "product-tool-one",
      text: `Got it — noted ${platforms[0]} in your product context. We'll keep that in the readiness picture.`,
    };
  }
  return {
    id: "product-description",
    text: `Got it — noted “${clip(trimmed, 100)}”.`,
  };
}

export function calloutForWhoUses(value: string): AnswerCalloutPayload | null {
  const v = value.trim();
  if (!v) return null;
  return {
    id: "who-uses",
    text: `Got it — users today: ${v}.`,
  };
}

export function calloutForBuiltWith(value: string): AnswerCalloutPayload | null {
  const v = value.trim();
  if (!v) return null;
  if (/mixed|multiple tools/i.test(v)) {
    return {
      id: "built-with-mixed",
      text: `Got it — primarily built with mixed / multiple tools.`,
    };
  }
  return {
    id: "built-with",
    text: `Got it — primarily built with ${v}.`,
  };
}

export function calloutForBlockers(blockers: readonly string[]): AnswerCalloutPayload | null {
  if (!blockers.length) return null;
  const securityRelated = blockers.filter((b) =>
    /security|questionnaire|IT won't approve|approve rollout/i.test(b),
  );
  if (securityRelated.length > 0) {
    const quoted = securityRelated.map((b) => `“${clip(b, 60)}”`).join("; ");
    return {
      id: "blockers-security",
      text: `This answer feeds the security dimension — noted ${quoted}.`,
    };
  }
  const listed = blockers.map((b) => clip(b, 50)).join("; ");
  return {
    id: "blockers",
    text: `Got it — blocking factors noted: ${listed}.`,
  };
}

export function calloutForDeadline(deadline: string, detail?: string): AnswerCalloutPayload | null {
  const d = deadline.trim();
  if (!d) return null;
  const extra = detail?.trim() ? ` (${clip(detail.trim(), 60)})` : "";
  return {
    id: "deadline",
    text: `Noted — timeline: ${d}${extra}.`,
  };
}

/** Generic free-text callout with optional tools / security awareness. */
export function calloutForFreeText(
  fieldId: string,
  value: string,
  opts?: { securityRelated?: boolean; toolsLabel?: string },
): AnswerCalloutPayload | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Security-marked fields (auth, secrets, concerns) always surface the security
  // dimension — even when a tool name like Auth0 is also present.
  const securityCue =
    opts?.securityRelated ||
    /security|secret|auth|sso|saml|hipaa|soc\s*2|encrypt|password|vault|pii|compliance/i.test(
      trimmed,
    );
  if (securityCue) {
    return {
      id: `${fieldId}-security`,
      text: `This answer feeds the security dimension — noted “${clip(trimmed, 90)}”.`,
    };
  }

  const platforms = parseListedItems(trimmed);
  if (platforms.length >= 2) {
    const names = platforms.slice(0, 6).join(", ");
    const n = platforms.length;
    const label = opts?.toolsLabel ?? "platforms";
    return {
      id: `${fieldId}-tools`,
      text: `Got it — we'll assess your readiness across those ${n} ${label} (${names}).`,
    };
  }
  if (platforms.length === 1) {
    return {
      id: `${fieldId}-tool`,
      text: `Got it — noted ${platforms[0]}.`,
    };
  }

  return {
    id: fieldId,
    text: `Got it — noted “${clip(trimmed, 100)}”.`,
  };
}

export function calloutForSingleChoice(
  fieldId: string,
  value: string,
  opts?: { securityRelated?: boolean },
): AnswerCalloutPayload | null {
  const v = value.trim();
  if (!v) return null;
  if (
    opts?.securityRelated ||
    /security|secret|auth|sso|saml|hipaa|soc|password|compliance/i.test(v)
  ) {
    return {
      id: `${fieldId}-security`,
      text: `This answer feeds the security dimension — noted “${clip(v, 90)}”.`,
    };
  }
  return {
    id: fieldId,
    text: `Got it — ${clip(v, 100)}.`,
  };
}

/** Map manual questionnaire field → callout. */
export function calloutForManualField(
  questionId: string,
  value: string,
): AnswerCalloutPayload | null {
  const v = value.trim();
  if (!v) return null;

  // Tools / platforms style free-text fields
  if (
    questionId === "languages" ||
    questionId === "frontend" ||
    questionId === "backend" ||
    questionId === "database" ||
    questionId === "deploys"
  ) {
    return calloutForFreeText(questionId, v, { toolsLabel: "platforms" });
  }

  // Security-adjacent fields
  if (questionId === "auth" || questionId === "secrets_pattern" || questionId === "concerns") {
    return calloutForFreeText(questionId, v, { securityRelated: true });
  }

  if (questionId === "summary") {
    return calloutForProductDescription(v);
  }

  if (questionId === "size" || questionId === "tenancy" || questionId === "tests") {
    return calloutForSingleChoice(questionId, v);
  }

  return calloutForFreeText(questionId, v);
}
