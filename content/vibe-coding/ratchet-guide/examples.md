# Examples

← [Footguns](./footguns.md) · [Index](./README.md)

---

## 1. Mock loop (zero API cost)

Proves orchestration without Claude/Grok spend.

```bash
cd /srv/ratchet/harness   # or your harness root
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
repo: https://github.com/you/app.git
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
    "url": "https://github.com/you/acme.git",
    "default_branch": "main",
    "local_path": "/srv/ratchet/projects/acme"
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

## 6. systemd KillMode snippet

```ini
[Service]
KillMode=process
# Detached ratchet workers must survive Admin Apply / composer restarts.
```

Verify:

```bash
systemctl show ratchet-composer -p KillMode --value
# process
```

---

## 7. nginx open version paths (sketch)

```nginx
location = /version {
    auth_basic off;
    proxy_pass http://127.0.0.1:8377;
}
location = /version.txt {
    auth_basic off;
    proxy_pass http://127.0.0.1:8377;
}
location = /health {
    auth_basic off;
    proxy_pass http://127.0.0.1:8377;
}
```

Adapt upstream per host (dash vs product site).

---

## 8. Health one-liner pack

```bash
systemctl is-active ratchet-composer ratchet-lazy ratchet-vault ratchet-sentinel nginx
curl -sS -o /dev/null -w "composer %{http_code}\n" http://127.0.0.1:8377/health
curl -sS -o /dev/null -w "lazy %{http_code}\n" http://127.0.0.1:8378/health
curl -sS -o /dev/null -w "vault %{http_code}\n" http://127.0.0.1:8379/health
curl -sS https://www.example.com/version; echo
```

---

## 9. What to open-source vs keep private

| Share freely                              | Keep private                                |
| ----------------------------------------- | ------------------------------------------- |
| Harness, mission schema, mock adapters    | `secrets.env`, vault `data/`, consumer keys |
| Composer UI patterns, queue builder tests | Basic-auth passwords, API tokens            |
| This guide pack                           | Master passwords, Railway account tokens    |
| Operator runbook _structure_              | Production-only hostnames if you care       |

---

Back to [Index](./README.md)
