# Examples

← [Footguns](./footguns.md) · [Index](./README.md)

Illustrative **product shapes** only — not host recipes, not install paths, not operator commands.

---

## 1. Mock campaign (zero model spend)

Prove orchestration without model spend by simulating builder, gate, and tester roles.

Expect: the loop still walks setup → build → gate → test, applies streak rules, and ends successfully when the simulated scenario reaches the required consecutive passes.

Other scenarios intentionally fail or thrash — useful for testing adapter contracts, not for production babysitting.

---

## 2. Full loop on a local fixture (shape)

A common educational fixture pattern:

1. A tiny broken static site in a throwaway repo
2. A fake deployer that publishes content and a version signal
3. Real builder and tester CLIs against that fake live URL
4. Loop continues until consecutive passes

Only external dependency: the model CLIs you choose. Exact fixture scripts stay install-private.

---

## 3. Minimal mission shape (product-shaped)

```yaml
name: fix-homepage-cta
repo: https://git.example.com/you/app.git
live_url: https://www.example.com
version_endpoint: /version

mission: |
  Change the homepage CTA label to "Get started".
  Do not change pricing or auth.

acceptance:
  - GET / returns 200 with visible text "Get started"
  - /version returns the deployed git SHA

limits:
  max_iterations: 8
  consecutive_passes_required: 2
```

Field names may vary; the product idea is stable.

---

## 4. Product shell shape

```json
{
  "slug": "acme",
  "name": "Acme",
  "repo": {
    "url": "https://git.example.com/you/acme.git",
    "default_branch": "main"
  },
  "deploy": {
    "live_url": "https://www.acme.example",
    "version_url": "https://www.acme.example/version",
    "provider": "example-host",
    "cloud_project": "PUT-UUID-HERE"
  }
}
```

Bind repo + live URL + version URL together. Prefer a known cloud project identity over create-on-every-run.

---

## 5. Reference product campaign (shape, not secrets)

| Step | What happened                                            |
| ---- | -------------------------------------------------------- |
| 1    | Product shell for repo + live URL + version signal       |
| 2    | Mission: change homepage CTA + related copy on live site |
| 3    | Builder several iterations; host deploy from git         |
| 4    | Deploy gate waited until version signal advanced         |
| 5    | Tester checked acceptance text on live URL               |
| 6    | Success after consecutive passes                         |

The product details are incidental — the **system** is the loop + control plane.

---

## 6. What to open-source vs keep private

| Share freely                                         | Keep private                                          |
| ---------------------------------------------------- | ----------------------------------------------------- |
| Loop design, mission shape, mock role ideas          | Secret config, vault ciphertext, consumer credentials |
| Composer UX patterns and queue-builder product rules | Passwords, API tokens, host topology                  |
| This guide pack                                      | Master passwords, cloud account tokens                |
| Architecture diagrams                                | Install-specific hostnames if you care                |

---

Back to [Index](./README.md)
