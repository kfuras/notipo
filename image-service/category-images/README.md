# Category Background Images

Place one PNG or JPG per category here. The filename is what you reference in
`SEED_CATEGORIES` (or via `PATCH /api/categories/:id`).

## Naming convention

Use lowercase, hyphens for spaces:

```
automation.png
azure-cloud.png
cybersecurity.png
homelab.png
iac.png
microsoft-365.png
ai.png
```

## How it works

- If `backgroundImage` is a **plain filename** (e.g. `automation.png`), the
  image generator reads the file directly from this directory — no network call.
- If `backgroundImage` is a **full URL** (starts with `http`), it is fetched
  over the network as before (Unsplash, CDN, etc.).

## Recommended image size

1200 × 628 px (16:9 OG image ratio). The generator resizes to this regardless,
but starting at native resolution gives the sharpest result.
