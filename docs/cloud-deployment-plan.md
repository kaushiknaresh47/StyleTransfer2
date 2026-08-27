# Cloud deployment plan (AWS / GCP / Azure, free-tier focused)

## What we're deploying

Per [`docs/python-style-transfer-integration-plan.md`](./python-style-transfer-integration-plan.md), the app has (or will have) three pieces plus a database:

1. **`client/`** — static build output (Vite). No server-side rendering, just files behind a CDN/host.
2. **`server/`** — Express API (Node 18+), stateless, talks to Postgres and (soon) proxies to `stylizer/`.
3. **`stylizer/`** — planned Python FastAPI microservice that loads an ML model **once** and stays warm in memory. This is the component that free tiers fight hardest against (see below).
4. **Postgres** — currently just a health check, but the app's database of record.

## The core tension

Every major cloud's genuinely-free compute is either:
- **scale-to-zero serverless** (AWS Lambda, GCP Cloud Run, Azure Functions/Container Apps) — free quotas are generous and never expire, but the instance is killed when idle, so the model reloads from disk on the next request (cold start). This directly conflicts with the "load once, stay warm" design goal in the integration plan.
- **a small always-on VM, free forever, but tiny** (GCP `e2-micro`: 1 vCPU burstable, 1 GB RAM) — enough to stay warm, but likely too little RAM for a PyTorch/TensorFlow model plus the OS and Express/Postgres alongside it.
- **a bigger always-on VM, free for 12 months only** (AWS EC2 `t2/t3.micro`, Azure B1s) — fine for a demo, but becomes a paid resource after a year on a new account.

There is no combination of "always warm" + "handles a real ML model" + "free forever" across any of the three clouds. Any plan has to pick two of those three. This doc lays out the free-tier building blocks per cloud, then a recommended trade-off.

## Free-tier building blocks by service

### Static frontend (`client/`)
| Cloud | Free option | Notes |
|---|---|---|
| AWS | S3 (5 GB, 12 months) + CloudFront (1 TB/mo transfer, always free) | CloudFront's free tier doesn't expire; S3 storage free tier does after 12 months, but a built React app is a few MB, well under paid-tier pricing anyway. |
| GCP | Firebase Hosting (10 GB storage, 360 MB/day transfer, always free) | Not "Cloud Run/Compute" but is a first-party GCP product (same Firebase/GCP project, same billing account). Simplest static host of the three. |
| Azure | Static Web Apps — Free plan (100 GB/mo bandwidth, custom domain + SSL, always free) | Purpose-built for exactly this (SPA + API proxy config), arguably the best-fit free static host here. |

### API (`server/`, Node/Express)
| Cloud | Free option | Notes |
|---|---|---|
| AWS | Lambda (1M requests + 400,000 GB-s compute/month, always free) via API Gateway or Lambda Function URLs; or EC2 `t2/t3.micro` (750 hrs/mo, 12 months only) | Express needs a thin adapter (`serverless-http`) to run on Lambda. Cold starts are milliseconds for a small API — much less of a problem than for the model service. |
| GCP | Cloud Run (2M requests, 360,000 GB-s memory, 180,000 vCPU-s/month, always free) | Runs a standard Docker container, no code changes to Express needed. Scales to zero between requests, which is fine for a plain API. |
| Azure | Azure Container Apps (180,000 vCPU-s + 360,000 GiB-s + 2M requests/month, always free) or App Service Free (F1) tier (60 CPU-min/day, sleeps after idle) | Container Apps free grant is comparable to Cloud Run; App Service F1 is more limited (shared CPU, daily quota) but zero-config for a Node app. |

### Postgres
| Cloud | Free option | Notes |
|---|---|---|
| AWS | RDS free tier: `db.t3.micro`/`db.t4g.micro`, 750 hrs/mo + 20 GB storage — **12 months only** on a new account | Becomes a paid resource (~$15+/mo) after the trial year. |
| GCP | No free Cloud SQL tier | Cheapest path is self-hosting Postgres on the always-free `e2-micro` VM (see below), or using a third-party free tier (Supabase/Neon, both have generous permanent free Postgres and are commonly paired with GCP/Vercel-style stacks). |
| Azure | Azure Database for PostgreSQL Flexible Server: `B1ms`, 750 hrs/mo + 32 GB storage — **12 months only**, part of the Azure free account | Same expiry caveat as AWS RDS. |

None of the three clouds offers a managed Postgres that's free forever. For a project meant to stay free indefinitely, either self-host Postgres on a permanently-free VM, or use a non-cloud-giant managed free tier (Supabase, Neon — both have no-credit-card, no-expiry free plans) reached over the public internet from whichever cloud runs `server/`.

### ML microservice (`stylizer/`)
| Cloud | Free option | Fit for "stays warm" |
|---|---|---|
| AWS | Lambda with container image (up to 10 GB, up to 10 GB RAM) — always free quota, but cold start reloads the model (can be 10s+ for a multi-hundred-MB model); or EC2 `t2/t3.micro`/`.small` — 12 months only, and `.micro` (1 GB RAM) is likely too small for the model + PyTorch/TF runtime. | Poor (serverless) / time-limited (VM) |
| GCP | Cloud Run — same always-free quota as the API above, plus `min-instances=1` can be set to avoid cold starts, but that keeps a billed instance running 24/7 (no longer inside the always-free quota once minutes exceed the monthly grant); **or** the always-free `e2-micro` Compute Engine VM (1 vCPU, 1 GB RAM, one instance, `us-west1`/`us-central1`/`us-east1` only, no expiry) | Best fit if the model is small/quantized enough for ~1 GB RAM; otherwise same cold-start trade-off as Lambda |
| Azure | Container Apps (same always-free quota as above, same `min-replicas` trade-off) or Azure Functions Premium/Consumption (cold starts) | Same trade-offs as AWS/GCP equivalents |

**GCP's `e2-micro` is the only genuinely-free-forever always-on compute among the three clouds.** It's the natural home for `stylizer/` *if* the eventual model is small (a distilled/quantized style-transfer model, not a multi-GB checkpoint) — this can't be confirmed until the user's actual Python code and model size are shared (same open item as the integration plan).

## Recommendation

**Primary: GCP**, because it's the only cloud with a permanently-free always-on VM, which best matches the "load the model once, stay warm" requirement:
- `client/` → Firebase Hosting (free, always)
- `server/` → Cloud Run (free tier, scale-to-zero is fine for a thin proxy API)
- `stylizer/` → the always-free `e2-micro` VM, running `uvicorn` directly (systemd service) — model loads once at boot and stays warm indefinitely, no cold starts, no billing risk
- Postgres → self-hosted on the same `e2-micro` VM (if RAM allows once the model is loaded) or a free-forever third-party (Supabase/Neon) reached over the internet

**Fallback if the model turns out too large for 1 GB RAM:** drop the "always warm" requirement and run `stylizer/` on Cloud Run or AWS Lambda (container image) with `min-instances=0`, accepting a cold start (one-time model load) on the first request after idle, then warm responses until the container is reclaimed. This stays entirely inside always-free quotas for hobby-level traffic and requires no VM management, at the cost of occasional slow first-requests — likely an acceptable trade for a personal/demo project.

**Why not AWS or Azure as primary:** both have broadly equivalent serverless free tiers to GCP's Cloud Run, but neither offers a free-forever always-on VM (only 12-month trial VMs), so neither can satisfy "stays warm indefinitely" without eventually incurring cost.

## Non-cloud-giant alternatives (worth flagging, not explored in depth)

Since the ask was specifically AWS/GCP/Azure, this doc stays scoped there, but for a hobby/personal project it's worth knowing that platforms like **Render**, **Railway**, or **Fly.io** (for the API + model service) and **Vercel**/**Netlify** (for the static client) often have simpler free tiers and zero-config deploys than the big three, at the cost of the same "cold start vs. free always-on" trade-off described above. Worth a follow-up doc if the big-three setup proves too much operational overhead for this project's size.

## Open items
- Model size/framework/RAM footprint is unknown until the user's Python style-transfer code is shared (same blocker as the integration plan) — this determines whether the `e2-micro` VM plan is viable or whether the serverless-with-cold-start fallback is required.
- Expected traffic/usage pattern (personal project vs. shared demo) affects whether free-tier request/compute quotas are sufficient.
- No CI/CD, custom domain, HTTPS, or secrets-management setup is covered here — follow-up once a target cloud is chosen.
