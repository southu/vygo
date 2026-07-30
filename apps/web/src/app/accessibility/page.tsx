import type { Metadata } from "next";
import { EmailText } from "@/components/EmailText";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: site.metadata.accessibilityTitle,
  description: site.metadata.accessibilityDescription,
};

export default function AccessibilityPage() {
  return (
    <main id="main-content" className="section-pad">
      <div className="container-page max-w-3xl">
        <p className="eyebrow mb-3">Accessibility</p>
        <h1 className="font-display text-4xl font-bold heading-underline">Accessibility at vygo</h1>
        <p className="mt-6 text-lg text-muted">
          vygo aims to make this website usable for everyone, and works toward the Web Content
          Accessibility Guidelines (WCAG) 2.1 Level AA as a practical standard.
        </p>

        <h2 className="mt-10 font-display text-2xl font-bold">How we build for access</h2>
        <ul className="mt-4 space-y-2 text-ink-soft">
          <li>Semantic HTML with a logical heading structure and page landmarks.</li>
          <li>Keyboard-operable controls with visible focus indicators.</li>
          <li>Text and interface colors chosen for readable contrast in light and dark themes.</li>
          <li>Respect for reduced-motion preferences.</li>
          <li>Images with meaningful alternative text and explicit dimensions.</li>
        </ul>

        <h2 className="mt-10 font-display text-2xl font-bold">Feedback</h2>
        <p className="mt-4 text-ink-soft">
          If you encounter an accessibility barrier on this site, please tell us so we can fix it.
          You can reach the team at <EmailText />. We review accessibility feedback alongside our
          other site work.
        </p>
      </div>
    </main>
  );
}
