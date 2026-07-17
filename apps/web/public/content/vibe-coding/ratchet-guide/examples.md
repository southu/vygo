# Examples

← [Footguns](./footguns.md) · [Index](./README.md)

Paths use the placeholder root `RATCHET_ROOT`.

---

## 1. Mock loop (zero API cost)

Proves orchestration without Claude/Grok spend.

```bash
cd RATCHET_ROOT/harness   # or your harness root
bin/ratchet run missions/mock-loop.yaml --scenario fixtures/scenarios/happy.txt
```

Scenario files script tester verdicts (line N = iteration N). Expect exit 0 when the scenario reaches the required streak.

Other scenarios under `fixtures/scenarios/` intentionally FAIL or thrash — useful for adapter tests.

---

## 2. Full real loop on local fixture

From the harness README pattern:

```bash
fixtures/make-target-repo.sh          # broken static site
fixtures/fake-deploy.sh start         # serves site + /version
export RATCHET_ENV_LIVE_URL="$(cat tmp-target/fake-deploy/url)"
bin/ratchet run missions/full-loop.yaml
```

- Builder (Claude) fixes links and pushes
- Fake deployer publishes content + SHA
- Tester (Grok) verifies live site
- Loop continues until consecutive PASS

Only external dependency: the two AI CLIs.

---

## 3. Minimal mission YAML (product-shaped)

```yaml
name: fix-homepage-cta
repo: https://git.example.com/you/app.git
live_url: https://www.example.com
version_endpoint: /version

deploy:
  branch: main
  strategy: version-endpoint
  wait_timeout_seconds: 600
  poll_interval_seconds: 10

mission: |
  Change the homepage CTA label to "Get started".
  Do not change pricing or auth.

acceptance:
  - GET / returns 200 with visible text "Get started"
  - /version returns the deployed git SHA

limits:
  max_iterations: 8
  consecutive_passes_required: 2
  max_budget_usd: 25

adapters:
  builder: real
  tester: real
  deploy: real
```

---

## 4. project.json (product shell)

```json
{
  "slug": "acme",
  "name": "Acme",
  "repo": {
    "url": "https://git.example.com/you/acme.git",
    "default_branch": "main",
    "local_path": "RATCHET_ROOT/projects/acme"
  },
  "deploy": {
    "live_url": "https://www.acme.example",
    "version_url": "https://www.acme.example/version",
    "provider": "railway",
    "railway_project": "PUT-UUID-HERE"
  },
  "defaults": {
    "lazy_babysit": false
  }
}
```

---

## 5. Reference product campaign (shape, not secrets)

A typical multi-iteration campaign looks like:

| Step | What happened                                               |
| ---- | ----------------------------------------------------------- |
| 1    | Project shell for product repo + live URL + `/version`      |
| 2    | Mission: change homepage CTA + related copy on live site    |
| 3    | Builder (Claude) several iterations; cloud deploy           |
| 4    | Deploy gate waited until `/version` advanced                |
| 5    | Tester (Grok) checked acceptance text on live URL           |
| 6    | Exit 0 after consecutive PASSes; cost in `shared/cost.json` |

The product details are incidental — the **system** is the loop + control plane.

---

## 6. Composer restart seatbelt (concept)

Detached harness workers must survive Composer restarts (Admin Apply, model update). Configure your process manager so a Composer bounce does **not** reap the whole process tree.

---

## 7. Product version path (edge sketch)

Products should leave deploy-gate probes open without control-plane auth:

```nginx
location = /version {
    auth_basic off;
    # proxy or serve the product app
}
location = /version.txt {
    auth_basic off;
}
```

Adapt to your edge and product host. The gate only needs a public SHA body at the configured `version_url`.

---

## 8. What to open-source vs keep private

| Share freely                              | Keep private                                |
| ----------------------------------------- | ------------------------------------------- |
| Harness, mission schema, mock adapters    | `secrets.env`, vault `data/`, consumer keys |
| Composer UI patterns, queue builder tests | Basic-auth passwords, API tokens            |
| This guide pack                           | Master passwords, cloud account tokens      |
| Architecture diagrams                     | Install-specific hostnames if you care      |

---

Back to [Index](./README.md)
