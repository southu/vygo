# The learning cycle — contributor runbook

This is the complete, self-contained procedure for taking one **learning** (a
thing we discovered about how Ratchet is built/operated) all the way from
"jotted down" to "incorporated into the published guide and shown on the
learnings dashboard".

You do **not** need to ask anyone for help to run this — every step below names
the exact file, command, or URL. Reading time to first recorded learning: under
a minute.

**The surfaces involved:**

| What                                            | Where                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| Canonical learnings store (edit this to record) | `data/ratchet-learnings.json`                                     |
| Guide-revisions store (written by the workflow) | `data/guide-revisions.json`                                       |
| Workflow CLI                                    | `pnpm guide-update <command>` (source: `scripts/guide-update.ts`) |
| Public learnings JSON (dashboard backing data)  | <https://www.vygo.ai/api/guide/learnings>                         |
| Learnings dashboard (renders the JSON above)    | <https://www.vygo.ai/guide-progress>                              |
| Operator console (Ratchet Mission Composer)     | <https://dash.saniorem.com>                                       |
| Published guide + changelog                     | <https://www.vygo.ai/vibe-coding/ratchet-guide#revision-history>  |
| Deploy gate (serves the deployed git SHA)       | <https://www.vygo.ai/version>                                     |

The whole cycle is five stages: **record → run the workflow → review → publish →
confirm**. Prerequisite (once per checkout): `pnpm install`.

---

## Stage 1 — Record a new learning (under a minute)

A learning is one object appended to the `entries` array in
`data/ratchet-learnings.json`. The store is **strictly append-only**: never
delete an entry, never rewrite an immutable field, and never move a status
backward (the write helpers reject all three).

### The learning schema — exact fields

Field order does not matter; the field **names** do. Fields are validated by
`packages/validation/src/learnings-log.ts` (`learningEntrySchema`).

| Field               | Required               | Type / format         | Notes                                                                                                 |
| ------------------- | ---------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`                | yes                    | string                | Stable, unique. Convention: `L-YYYY-MM-DD-<slug>`.                                                    |
| `summary`           | yes                    | string                | What was learned, in prose.                                                                           |
| `title`             | optional               | string                | Short name used to label the learning in the changelog / revision history. Recommended.               |
| `date`              | yes                    | string `YYYY-MM-DD`   | Calendar date the learning was captured.                                                              |
| `source_link`       | yes                    | string (URL)          | Commit / PR / doc / experiment link.                                                                  |
| `affected_sections` | yes                    | array of strings (≥1) | Guide section id(s) the learning touches, e.g. `["overview"]`, `["core-workflow"]`.                   |
| `status`            | yes                    | enum                  | One of `pending-in-guide` \| `draft` \| `incorporated`. **A new entry is always `pending-in-guide`.** |
| `created`           | yes                    | string ISO 8601       | Timestamp you first recorded it, e.g. `2026-07-22T06:10:00.000Z`.                                     |
| `updated`           | yes                    | string ISO 8601       | Same value as `created` at record time; the workflow bumps it later.                                  |
| `incorporated_date` | do **not** set by hand | string `YYYY-MM-DD`   | Present **only** when `status` is `incorporated`; stamped for you at publish.                         |

`status` moves forward only: `pending-in-guide → draft → incorporated`. `draft`
and `incorporated_date` are managed by the workflow — you only ever write a
`pending-in-guide` entry.

### Example entry

Append a comma after the previous last entry, then paste an object like this
into the `entries` array:

```json
{
  "id": "L-2026-07-22-example-slug",
  "summary": "One or two sentences describing exactly what we learned and why it matters.",
  "title": "Short label for the changelog",
  "date": "2026-07-22",
  "source_link": "https://github.com/southu/vygo/commit/<sha>",
  "affected_sections": ["overview"],
  "status": "pending-in-guide",
  "created": "2026-07-22T06:10:00.000Z",
  "updated": "2026-07-22T06:10:00.000Z"
}
```

To make it appear on the dashboard as **pending**, commit and push it to `main`
(this deploys via the normal pipeline):

```sh
git add data/ratchet-learnings.json
git commit -m "learnings: record <id>"
git push origin HEAD:main
```

Wait for the deploy, then confirm it is live and pending (see the confirm
helper at the bottom):

```sh
curl -s https://www.vygo.ai/api/guide/learnings | grep -o '"id":"<id>"[^}]*"status":"pending"'
```

The same entry is what the learnings dashboard at
<https://www.vygo.ai/guide-progress> reads, so it shows there as **pending** too.

---

## Stage 2 — Run the guide-update workflow

The workflow selects one or more pending learnings, builds a **held draft
revision** of the guide (nothing is published yet), and flips the selected
learnings to `draft` in your working tree (the review area — uncommitted).

```sh
pnpm guide-update draft \
  --learning <id> \
  --title "Human-readable revision title" \
  --summary "One line describing this revision."
```

- Repeat `--learning <id>` to bundle several learnings into one revision.
- `--date YYYY-MM-DD` is optional (defaults to today, UTC).

It prints the assigned revision id (shape `GR-YYYY-MM-DD-NNN`) and writes two
review files under `guide-drafts/` (a gitignored review area):
`guide-drafts/<revision-id>.md` (human-readable) and `<revision-id>.json`.

Check state at any time with:

```sh
pnpm guide-update status
```

---

## Stage 3 — Human review of the generated draft

This is the approval gate. Before publishing, read both of these:

1. The generated review file — it contains the proposed changelog entry and the
   ready-to-paste guide section edits:

   ```sh
   cat guide-drafts/<revision-id>.md
   ```

2. The working-tree change to the learnings log (the selected learnings should
   now show `"status": "draft"`, and nothing else should have changed):

   ```sh
   git diff data/ratchet-learnings.json
   ```

If the draft is wrong, discard it and start over (this reverts the working-tree
flip and removes the review files):

```sh
git checkout data/ratchet-learnings.json && rm -rf guide-drafts
```

If it is good, you have **approved** it — proceed to publish.

---

## Stage 4 — Publish

Publishing flips the drafted learnings to `incorporated` (stamping
`incorporated_date`) and appends the revision to `data/guide-revisions.json`.
Run the approve step **without** `--commit` so you can format the stores before
committing (the workflow writes them with `JSON.stringify`, so a one-line
Prettier pass is needed to keep CI's `format:check` green — see the note below):

```sh
pnpm guide-update approve <revision-id>
pnpm exec prettier --write data/ratchet-learnings.json data/guide-revisions.json
git add data/ratchet-learnings.json data/guide-revisions.json
git commit -m "docs(ratchet-guide): publish revision <revision-id>"
git push origin HEAD:main
```

The guide page's **Revision history** renders from `data/guide-revisions.json`
automatically, so no manual page edit is needed — only the two data stores are
committed. (If instead the guide was published by hand through a CMS, record
that with `pnpm guide-update record-publish <revision-id>` — no git.)

> **Why the Prettier pass:** the workflow writes both JSON stores with
> `JSON.stringify(…, null, 2)`, which expands short arrays onto multiple lines;
> the repo's Prettier config collapses them. `approve --commit` would commit the
> unformatted stores and turn CI's `format:check` red, so approve without
> `--commit` and format the two files yourself before committing.

No publish/deploy credentials are read or printed by the workflow, and the
generated copy is scanned for credential-like material before it is written.

---

## Stage 5 — Confirm it flipped to `incorporated`

Wait for the push to deploy — the deploy gate serves the deployed git SHA, so
poll it until it matches what you pushed:

```sh
git rev-parse HEAD
curl -s https://www.vygo.ai/version    # repeat until this equals the SHA above
```

Then confirm on the **dashboard backing JSON** that the entry is now
`incorporated` with an incorporation date:

```sh
curl -s https://www.vygo.ai/api/guide/learnings \
  | grep -o '"id":"<id>"[^}]*"incorporated_date":"[0-9-]*"'
```

You should see `"status":"incorporated"` and an `"incorporated_date"` for your
`<id>`. This is the exact data the learnings dashboard at
<https://www.vygo.ai/guide-progress> renders, so the entry shows there as
**incorporated** with that date too.

> **Which surface is which (reconciliation).** The **learnings dashboard** is
> <https://www.vygo.ai/guide-progress>, backed by
> <https://www.vygo.ai/api/guide/learnings> — that is where you confirm the
> `pending → incorporated` flip. <https://dash.saniorem.com> is the **Ratchet
> Mission Composer** operator console (it queues and tracks builds); it is
> reachable but does not itself render the learnings list, so confirm on the
> `guide-progress` dashboard above. Earlier drafts of this runbook called
> `dash.saniorem.com` the learnings dashboard; the accurate surface is
> `www.vygo.ai/guide-progress`.

Finally, confirm the **guide changelog** gained a matching entry — the Revision
history lists your revision id, its date, and every learning it incorporated:

- In a browser: <https://www.vygo.ai/vibe-coding/ratchet-guide#revision-history>
- Or from the store: `git show HEAD:data/guide-revisions.json` (your
  `<revision-id>` names your learning under `learnings[].id`).

That completes the cycle: recorded → drafted → reviewed → published →
incorporated, with the dashboard and the guide changelog both reflecting it.
