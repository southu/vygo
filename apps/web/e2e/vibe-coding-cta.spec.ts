import { test, expect } from "@playwright/test";

// Top hero "Start free" CTA on /vibe-coding must resolve straight to the
// guide zip download, while the lower-page GuideOffer "Start free" CTA keeps
// its pre-existing zip destination — both are plain anchors to the same
// static build artifact, not client-side navigation to /apply.
const GUIDE_ZIP_HREF = "/content/vibe-coding/ratchet-guide-v1.2.zip";

test.describe("/vibe-coding CTA destinations", () => {
  test("home page returns 200", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
  });

  test("/vibe-coding returns 200", async ({ request }) => {
    const res = await request.get("/vibe-coding");
    expect(res.status()).toBe(200);
  });

  test("top hero Start free CTA resolves to the guide zip and downloads", async ({
    page,
    request,
  }) => {
    await page.goto("/vibe-coding");
    const hero = page.locator('section[data-section="hero"]');
    const heroCta = hero.getByRole("link", { name: "Start free" });
    await expect(heroCta).toHaveAttribute("href", GUIDE_ZIP_HREF);

    const res = await request.get(GUIDE_ZIP_HREF);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/zip/);
  });

  test("lower-page GuideOffer Start free CTA keeps its pre-existing zip destination", async ({
    page,
    request,
  }) => {
    await page.goto("/vibe-coding");
    const offerCta = page.locator('a[data-offer-cta="start-free"]');
    await expect(offerCta).toHaveAttribute("href", GUIDE_ZIP_HREF);
    await expect(offerCta).toHaveText("Start free");

    const res = await request.get(GUIDE_ZIP_HREF);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/zip/);
  });

  test("final CTA Start free is untouched and still routes to /apply", async ({ page }) => {
    await page.goto("/vibe-coding");
    const finalCta = page.locator('section[data-section="cta"]');
    const link = finalCta.getByRole("link", { name: "Start free" });
    await expect(link).toHaveAttribute("href", "/apply");
  });
});
