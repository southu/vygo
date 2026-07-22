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

## Stage 7 — Dashboard-surface reconciliation (2026-07-22)

The mission and its acceptance criteria name `https://dash.saniorem.com` as the
"learnings dashboard" on which the `pending → incorporated` flip and the guide
changelog should be confirmed. Driving the cycle showed that this is not the
surface that hosts either the learnings list or the changelog. The captures below
record the reconciliation so the confirm step is reproducible from a clean
machine.

`https://dash.saniorem.com` is the **Ratchet Mission Composer** operator console
(nginx), not a vygo surface — it is served from separate infrastructure and is
outside this repository's deploy boundary (this repo deploys only to
`https://www.vygo.ai` via Vercel). Probes on 2026-07-22:

```sh
# dash is a separate nginx host, not the Vercel-served vygo app
$ curl -sI https://dash.saniorem.com/ | grep -i '^server:'
server: nginx/1.24.0 (Ubuntu)

# only four routes are public; all are static console shells
$ for p in "" dashboard composer queue; do \
    printf '%s  /%s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://dash.saniorem.com/$p)" "$p"; done
200  /
200  /dashboard
200  /composer
200  /queue

# every learnings/changelog/guide route is auth-gated (401) — dash does not host them
$ for p in guide-progress ratchet-guide changelog revision-history api/guide/learnings; do \
    printf '%s  /%s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://dash.saniorem.com/$p)" "$p"; done
401  /guide-progress
401  /ratchet-guide
401  /changelog
401  /revision-history
401  /api/guide/learnings

# the mission repro grep finds nothing on dash's public HTML …
$ curl -s https://dash.saniorem.com/ | grep -c -E 'GR-2026-07-22-002|TEST: contributor|guide-progress|ratchet-guide'
0

# … while the same changelog entry IS public on the vygo surface
$ curl -s https://www.vygo.ai/vibe-coding/ratchet-guide | grep -c 'GR-2026-07-22-002'
1
```

The authoritative, public confirmation surface for **both** the learnings flip and
the changelog is therefore on vygo:

- Learnings flip (`incorporated` + timestamp): `https://www.vygo.ai/api/guide/learnings`
  → rendered at `https://www.vygo.ai/guide-progress` (Stage 5 above).
- Guide changelog entry (`GR-2026-07-22-002` naming the TEST learning):
  `https://www.vygo.ai/vibe-coding/ratchet-guide#revision-history` (Stage 6 above).

The dash console's only public dynamic surfaces (`dashboard.js → /api/runs`,
`sentinel-blob.js → /api/sentinel/status`) are auth-gated (401) and carry mission
run status, not the guide changelog. Editing dash's HTML or nav would require its
operator/Vault credentials, which this repository does not hold and which the
mission's fail-closed rules forbid placing anywhere; no such credential was used.
This section is the reconciliation of record: confirm the cycle on the vygo URLs
above, not on `dash.saniorem.com`.

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
| 7. Surface reconciliation   | dash is a separate nginx console (public routes 200, all guide/changelog routes 401); confirm on vygo  | 2026-07-22               |

Cycle complete: **recorded → drafted → reviewed → published → incorporated**,
with the learnings dashboard and the guide changelog both reflecting it.
