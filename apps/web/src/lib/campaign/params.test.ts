import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALLOWLISTED_CAMPAIGN_PARAMS,
  appendParamsToHref,
  mergeParams,
  readAllowlistedParams,
  type CampaignParams,
} from "./params";

// --- allowlisting -----------------------------------------------------------

test("readAllowlistedParams keeps only allowlisted, non-empty values", () => {
  const parsed = readAllowlistedParams(
    "?utm_source=google&utm_medium=cpc&utm_campaign=fall&utm_term=vygo&utm_content=hero&gclid=ABC123&fbclid=FB1&junk=evil&sessionid=leak",
  );
  assert.deepEqual(parsed, {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "fall",
    utm_term: "vygo",
    utm_content: "hero",
    gclid: "ABC123",
    fbclid: "FB1",
  });
  assert.ok(!("junk" in parsed));
  assert.ok(!("sessionid" in parsed));
});

test("readAllowlistedParams supports all documented paid-media click ids", () => {
  const search = "?gclid=g&wbraid=w&gbraid=b&fbclid=f&msclkid=m&ttclid=t&twclid=tw&li_fat_id=li";
  const parsed = readAllowlistedParams(search);
  for (const key of [
    "gclid",
    "wbraid",
    "gbraid",
    "fbclid",
    "msclkid",
    "ttclid",
    "twclid",
    "li_fat_id",
  ]) {
    assert.ok(key in parsed, `${key} should be preserved`);
    assert.ok(ALLOWLISTED_CAMPAIGN_PARAMS.includes(key as never));
  }
});

test("readAllowlistedParams drops blank/whitespace values and works without leading ?", () => {
  assert.deepEqual(readAllowlistedParams("utm_source=&utm_medium=%20%20"), {});
});

test("readAllowlistedParams clips over-long values to 120 chars", () => {
  const long = "x".repeat(300);
  const parsed = readAllowlistedParams(`?gclid=${long}`);
  assert.equal(parsed.gclid?.length, 120);
});

// --- precedence -------------------------------------------------------------

test("mergeParams: newer explicit values override older session values", () => {
  const stored: CampaignParams = { utm_source: "old", utm_campaign: "spring" };
  const incoming: CampaignParams = { utm_source: "new", gclid: "G" };
  assert.deepEqual(mergeParams(stored, incoming), {
    utm_source: "new", // explicit wins
    utm_campaign: "spring", // preserved from session
    gclid: "G",
  });
});

test("mergeParams: older session values never overwrite newer explicit ones", () => {
  const stored: CampaignParams = { utm_source: "old" };
  const incoming: CampaignParams = { utm_source: "new" };
  assert.equal(mergeParams(stored, incoming).utm_source, "new");
});

test("mergeParams: an empty new URL preserves the whole stored set", () => {
  const stored: CampaignParams = { utm_source: "google", utm_medium: "cpc" };
  assert.deepEqual(mergeParams(stored, {}), stored);
});

test("mergeParams ignores non-allowlisted keys defensively", () => {
  const merged = mergeParams(
    { junk: "x" } as unknown as CampaignParams,
    { evil: "y" } as unknown as CampaignParams,
  );
  assert.deepEqual(merged, {});
});

// --- href propagation -------------------------------------------------------

test("appendParamsToHref adds preserved params to a same-origin path", () => {
  const out = appendParamsToHref("/waitlist", { utm_source: "google", gclid: "G" });
  const url = new URL(out, "https://vygo.ai");
  assert.equal(url.pathname, "/waitlist");
  assert.equal(url.searchParams.get("utm_source"), "google");
  assert.equal(url.searchParams.get("gclid"), "G");
});

test("appendParamsToHref never overwrites an explicit param already on the link", () => {
  const out = appendParamsToHref("/waitlist?utm_source=explicit", { utm_source: "session" });
  const url = new URL(out, "https://vygo.ai");
  assert.equal(url.searchParams.get("utm_source"), "explicit");
});

test("appendParamsToHref preserves an existing hash fragment", () => {
  const out = appendParamsToHref("/apply#form", { utm_source: "google" });
  assert.equal(out, "/apply?utm_source=google#form");
});

test("appendParamsToHref leaves hash-only, external, and mailto hrefs untouched", () => {
  const params: CampaignParams = { utm_source: "google" };
  assert.equal(appendParamsToHref("#lead", params), "#lead");
  assert.equal(appendParamsToHref("https://example.com/x", params), "https://example.com/x");
  assert.equal(appendParamsToHref("mailto:hi@vygo.ai", params), "mailto:hi@vygo.ai");
  assert.equal(appendParamsToHref("//cdn.example.com", params), "//cdn.example.com");
});

test("appendParamsToHref with no params returns the href unchanged", () => {
  assert.equal(appendParamsToHref("/waitlist", {}), "/waitlist");
});
