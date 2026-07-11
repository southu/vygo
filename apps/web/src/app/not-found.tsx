import { CtaLink } from "@/components/CtaLink";

export default function NotFound() {
  return (
    <main id="main-content" className="section-pad">
      <div className="container-page max-w-xl">
        <p className="eyebrow">404</p>
        <h1 className="mt-4 font-display text-4xl font-bold">Page not found</h1>
        <p className="mt-4 text-muted">
          That page is unavailable. It may be unpublished, moved, or never existed.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <CtaLink href="/">Back to home</CtaLink>
          <CtaLink href="/waitlist" variant="secondary">
            Apply for the next opening
          </CtaLink>
        </div>
      </div>
    </main>
  );
}
