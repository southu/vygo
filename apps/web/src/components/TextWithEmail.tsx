import { Fragment, type ReactNode } from "react";
import { brand } from "@vygo/ui";
import { EmailText } from "@/components/EmailText";

/**
 * Render a string, swapping any occurrences of the public contact email for
 * the Cloudflare-safe {@link EmailText} component so the edge rewriter has
 * no email pattern to turn into a `/cdn-cgi/l/email-protection` anchor.
 */
/** Used by marketing pages verified in docs/aeo-verification. */
export function TextWithEmail({ text }: { text: string }): ReactNode {
  const parts = text.split(brand.email);
  if (parts.length === 1) {
    return text;
  }
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 ? <EmailText /> : null}
    </Fragment>
  ));
}
