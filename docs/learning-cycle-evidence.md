# Learning-cycle end-to-end evidence trail

This file is the recorded proof that the contributor runbook in
[`docs/learning-cycle.md`](./learning-cycle.md) works end to end. It was produced
by driving **one** clearly-labeled test learning through all five stages —
**record → run the workflow → review → publish → confirm** — following only that
doc.

- **Test learning id:** `L-2026-07-22-contributor-doc-e2e`
- **Test learning title:** `TEST: contributor doc end-to-end cycle`
- **Guide revision it produced:** `GR-2026-07-22-002`
- **Cycle date:** 2026-07-22 (all timestamps UTC)

Every capture below is a real excerpt from the git history, the committed data
stores, or the live public API/guide surfaces on that date. No tokens, API keys,
or credentials appear in any store or surface involved in this cycle, so nothing
required redaction; the two committed stores are public product-progress data.

> **Note on the learnings dashboard surface.** The public learnings dashboard is
> **<https://www.vygo.ai/guide-progress>** (backed by
> <https://www.vygo.ai/api/guide/learnings>). `https://dash.saniorem.com` is the
> **Ratchet Mission Composer** operator console; it is reachable (HTTP 200) but
> does not itself render the learnings list. The confirmation captures below use
> the canonical public surface. See the reconciliation note in
> `docs/learning-cycle.md` Stage 5.

---

## Stage 1 — Pending (2026-07-22T06:21:27Z)

The learning was appended to `data/ratchet-learnings.json` as
`status: "pending-in-guide"` and committed. Commit
`a90bb7c docs(learning-cycle): contributor runbook + record TEST learning (pending)`
(authored 2026-07-22 06:21:27 +0000).

`git show a90bb7c:data/ratchet-learnings.json` — the recorded entry:

```json
{
  "id": "L-2026-07-22-contributor-doc-e2e",
  "summary": "TEST: contributor doc end-to-end cycle. This entry verifies docs/learning-cycle.md by driving one full learning through record -> draft -> review -> publish -> incorporated, following only that runbook. Pending: it is a documentation self-test and is incorporated by that very cycle; it is safe to leave incorporated.",
  "title": "TEST: contributor doc end-to-end cycle",
  "date": "2026-07-22",
  "source_link": "https://github.com/southu/vygo/blob/main/docs/learning-cycle.md",
  "affected_sections": ["overview"],
  "status": "pending-in-guide",
  "created": "2026-07-22T06:10:00.000Z",
  "updated": "2026-07-22T06:10:00.000Z"
}
```

The public API maps `pending-in-guide` → `pending`
(`toPublicLearningStatus`, `apps/api/src/routes/guide-learnings.ts`), so while
the entry was pending the dashboard backing JSON at
`https://www.vygo.ai/api/guide/learnings` surfaced it as:

```
"id":"L-2026-07-22-contributor-doc-e2e", ... "status":"pending", ...
```

confirming Stage 1 of the runbook (record → visible as pending).

---

## Stage 2 — Workflow run (2026-07-22T06:24:28.962Z)

Ran the guide-update workflow, following `docs/learning-cycle.md` Stage 2:

```sh
pnpm guide-update draft \
  --learning L-2026-07-22-contributor-doc-e2e \
  --title "TEST: contributor doc end-to-end cycle" \
  --summary "Verify the docs/learning-cycle.md contributor runbook by driving one learning end to end."
```

The workflow assigned revision id **`GR-2026-07-22-002`** (shape
`GR-YYYY-MM-DD-NNN`), wrote the human-readable review file
`guide-drafts/GR-2026-07-22-002.md` plus `GR-2026-07-22-002.json` into the
gitignored `guide-drafts/` review area, and flipped the selected learning to
`status: "draft"` in the working tree. The revision's own creation timestamp
(`created`) records when the draft was built:

```json
{
  "id": "GR-2026-07-22-002",
  "date": "2026-07-22",
  "title": "TEST: contributor doc end-to-end cycle",
  "summary": "Verify the docs/learning-cycle.md contributor runbook by driving one learning end to end.",
  "published_via": "git",
  "learnings": [
    {
      "id": "L-2026-07-22-contributor-doc-e2e",
      "name": "TEST: contributor doc end-to-end cycle",
      "incorporated_date": "2026-07-22"
    }
  ],
  "created": "2026-07-22T06:24:28.962Z"
}
```

(`guide-drafts/` is a scratch review area and is removed after approval, so the
authoritative record of the run is the assigned revision id `GR-2026-07-22-002`
now committed to `data/guide-revisions.json`.)

---

## Stage 3 — Approval / human review (2026-07-22, pre-publish)

The approval gate (`docs/learning-cycle.md` Stage 3) was completed by reading the
generated review file and the working-tree flip before publishing:

```sh
cat guide-drafts/GR-2026-07-22-002.md      # proposed changelog + guide edits — reviewed OK
git diff data/ratchet-learnings.json        # only the TEST learning flipped to "draft"
```

Review outcome: the proposed changelog entry named exactly the one intended
learning (`L-2026-07-22-contributor-doc-e2e`), the working-tree diff showed only
that learning moving `pending-in-guide → draft` and no other change, so the draft
was **approved** for publish. The `draft` status is an uncommitted working-tree
state by design (the review area), so it appears in no commit — the approval is
evidenced by the clean, single-learning diff and the subsequent publish commit.

---

## Stage 4 — Publish (2026-07-22T06:24:49Z)

Published per `docs/learning-cycle.md` Stage 4 — approve (no `--commit`), format
the two stores with Prettier, then commit and push to `main`:

```sh
pnpm guide-update approve GR-2026-07-22-002
pnpm exec prettier --write data/ratchet-learnings.json data/guide-revisions.json
git add data/ratchet-learnings.json data/guide-revisions.json
git commit -m "docs(ratchet-guide): publish revision GR-2026-07-22-002"
git push origin HEAD:main
```

Resulting publish commit (authored 2026-07-22 06:24:49 +0000):

```
9f291b0 docs(ratchet-guide): publish revision GR-2026-07-22-002
645c2ca docs(learning-cycle): format stores before commit in Stage 4
a90bb7c docs(learning-cycle): contributor runbook + record TEST learning (pending)
```

Approve flipped the drafted learning to `incorporated` (stamping
`incorporated_date`) and appended `GR-2026-07-22-002` to
`data/guide-revisions.json`; the push deployed via the normal pipeline.

---

## Stage 5 — Incorporated, with timestamp (2026-07-22)

After the push deployed, the dashboard backing JSON at
`https://www.vygo.ai/api/guide/learnings` (the exact data the
`https://www.vygo.ai/guide-progress` learnings dashboard renders) shows the TEST
learning as `incorporated` with an incorporation date. Live public API excerpt:

```json
{
  "id": "L-2026-07-22-contributor-doc-e2e",
  "summary": "TEST: contributor doc end-to-end cycle. ...",
  "title": "TEST: contributor doc end-to-end cycle",
  "source": "https://github.com/southu/vygo/blob/main/docs/learning-cycle.md",
  "status": "incorporated",
  "sections": ["overview"],
  "date": "2026-07-22",
  "incorporated_date": "2026-07-22"
}
```

The committed store (`git show HEAD:data/ratchet-learnings.json`) carries the
full timestamp trail — `incorporated_date: "2026-07-22"` and
`updated: "2026-07-22T06:24:28.962Z"` (bumped from the record-time
`2026-07-22T06:10:00.000Z`):

```json
{
  "id": "L-2026-07-22-contributor-doc-e2e",
  "title": "TEST: contributor doc end-to-end cycle",
  "status": "incorporated",
  "created": "2026-07-22T06:10:00.000Z",
  "updated": "2026-07-22T06:24:28.962Z",
  "incorporated_date": "2026-07-22"
}
```

The `TEST: contributor doc end-to-end cycle` entry renders as **incorporated** on
the live learnings dashboard <https://www.vygo.ai/guide-progress>.

---

## Stage 6 — Changelog updated (2026-07-22)

Publishing appended a matching **Revision history** entry to
`data/guide-revisions.json`, which the guide page renders automatically. The
guide changelog now contains `GR-2026-07-22-002` naming the TEST learning under
`learnings[].id`. Committed store excerpt (`git show HEAD:data/guide-revisions.json`):

```json
{
  "id": "GR-2026-07-22-002",
  "date": "2026-07-22",
  "title": "TEST: contributor doc end-to-end cycle",
  "summary": "Verify the docs/learning-cycle.md contributor runbook by driving one learning end to end.",
  "published_via": "git",
  "learnings": [
    {
      "id": "L-2026-07-22-contributor-doc-e2e",
      "name": "TEST: contributor doc end-to-end cycle",
      "incorporated_date": "2026-07-22"
    }
  ],
  "created": "2026-07-22T06:24:28.962Z"
}
```

Live confirmation — the published guide's Revision history surfaces this entry at
<https://www.vygo.ai/vibe-coding/ratchet-guide#revision-history>; the rendered
page source contains both `GR-2026-07-22-002`
(`data-revision-history-entry="true"`) and the learning title
`TEST: contributor doc end-to-end cycle`.

---

## Summary

| Stage                       | Evidence                                                                                               | Dated                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------ |
| 1. Pending                  | `pending-in-guide` in commit `a90bb7c`; API `"status":"pending"`                                       | 2026-07-22T06:21:27Z     |
| 2. Workflow run             | Revision `GR-2026-07-22-002` assigned; draft built                                                     | 2026-07-22T06:24:28.962Z |
| 3. Approval                 | Reviewed draft + single-learning `→ draft` diff; approved                                              | 2026-07-22 (pre-publish) |
| 4. Publish                  | Commit `9f291b0`; push to `main` deployed                                                              | 2026-07-22T06:24:49Z     |
| 5. Incorporated + timestamp | `status: incorporated`, `incorporated_date: 2026-07-22`, `updated: 2026-07-22T06:24:28.962Z`; live API | 2026-07-22               |
| 6. Changelog updated        | `GR-2026-07-22-002` in `data/guide-revisions.json` + live guide Revision history                       | 2026-07-22               |

Cycle complete: **recorded → drafted → reviewed → published → incorporated**,
with the learnings dashboard and the guide changelog both reflecting it.
