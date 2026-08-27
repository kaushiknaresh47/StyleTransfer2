# Cloud deployment plan (AWS / GCP / Azure, free-tier focused)

## What we're deploying

Per [`docs/python-style-transfer-integration-plan.md`](./python-style-transfer-integration-plan.md), the app has (or will have) three pieces plus a database:

1. **`client/`** — static build output (Vite). No server-side rendering, just files behind a CDN/host.
2. **`server/`** — Express API (Node 18+), stateless, talks to Postgres and proxies job submissions to `stylizer/`.
3. **`stylizer/`** — Python FastAPI service wrapping `stylize/styletransfer.py`. **This is the component free tiers fight hardest against**, and now that the script has been read, harder than this doc previously assumed.
4. **Postgres** — currently just a health check; the integration plan gives it a real job (the `stylize_jobs` table).

## What reading the script changed

The earlier version of this doc assumed a feed-forward model: load weights once, infer in milliseconds, and the only question was cold starts. The script is **Gatys-style optimization**, which is a different resource profile in three ways that matter for hosting:

1. **Each request is minutes of pinned compute**, not milliseconds. ~300 forward+backward passes through VGG-19, optimizing the image itself with LBFGS. Timings are unverified (torch isn't installed locally), but CPU at 256px is single-digit minutes.
2. **RAM is the binding constraint, and it's larger than assumed.** The PyTorch CPU runtime alone is typically several hundred MB resident before any model loads. Add VGG-19 features (~20M params, ~80 MB fp32), a **`copy.deepcopy` of that stack per request**, plus activations and LBFGS history for the image being optimized. A realistic floor is well over 1 GB, and that is before the OS and anything else on the box.
3. **Weights are a ~548 MB download** on first use (`models.vgg19(pretrained=True)`), cached under `~/.cache/torch`. On ephemeral/serverless filesystems this re-downloads unless baked into the image.

**The direct casualty is this doc's previous primary recommendation.** GCP's always-free `e2-micro` (1 vCPU, **1 GB RAM**) was recommended as the home for `stylizer/` because it stays warm forever at no cost. Point 2 makes that not viable: PyTorch plus VGG-19 plus a per-request deepcopy will not fit in 1 GB, and even if it were squeezed in, 1 burstable vCPU running a multi-minute optimization would be punishing. Self-hosting Postgres on the same box, as previously suggested, is now clearly out.

Point 1 also softens the argument that cold starts are the main enemy. A 10–30s model load is a real cost, but against a 2–5 minute job it's overhead, not the dominant term. **Since the integration plan makes the API asynchronous (submit → poll → fetch), a cold start is absorbed into a wait the user is already being shown progress for.** That makes scale-to-zero serverless far more acceptable than this doc originally concluded — the trade-off it framed as "always warm vs. free forever" is much less painful once the client is built to wait.

The real constraint is no longer warmth. It is **RAM ceilings and per-request execution time limits.**

## Free-tier building blocks by service

### Static frontend (`client/`)
| Cloud | Free option | Notes |
|---|---|---|
| AWS | S3 (5 GB, 12 months) + CloudFront (1 TB/mo transfer, always free) | CloudFront's free tier doesn't expire; S3's does after 12 months, but a built React app is a few MB. |
| GCP | Firebase Hosting (10 GB storage, 360 MB/day transfer, always free) | Simplest static host of the three. |
| Azure | Static Web Apps — Free plan (100 GB/mo bandwidth, custom domain + SSL, always free) | Purpose-built for SPA + API proxy config. |

Unchanged by the script — the client is static files either way.

### API (`server/`, Node/Express)
| Cloud | Free option | Notes |
|---|---|---|
| AWS | Lambda (1M requests + 400,000 GB-s/month, always free) via Function URLs; or EC2 `t2/t3.micro` (750 hrs/mo, 12 months only) | Express needs `serverless-http`. Cold starts are milliseconds for a thin API. |
| GCP | Cloud Run (2M requests, 360,000 GB-s, 180,000 vCPU-s/month, always free) | Standard container, no code changes. Scale-to-zero is fine here. |
| Azure | Container Apps (180,000 vCPU-s + 360,000 GiB-s + 2M requests/month, always free) or App Service Free (F1) | Comparable to Cloud Run. |

Also largely unchanged — but note the server is now a **job broker**, so it must not hold a request open for the duration of a transfer. Its own timeout limits stop being a concern precisely because the integration plan made the API async.

### Postgres
| Cloud | Free option | Notes |
|---|---|---|
| AWS | RDS `db.t3.micro`/`db.t4g.micro`, 750 hrs/mo + 20 GB — **12 months only** | ~$15+/mo afterwards. |
| GCP | No free Cloud SQL tier | Previously suggested self-hosting on `e2-micro`; that box is now spoken for (and too small), so this means a third-party free tier. |
| Azure | PostgreSQL Flexible Server `B1ms`, 750 hrs/mo + 32 GB — **12 months only** | Same expiry caveat. |

None of the three offers a free-forever managed Postgres. **Supabase or Neon** (no credit card, no expiry) reached over the internet is the pragmatic choice, and more clearly so now that the `e2-micro` self-hosting option is off the table.

### The style-transfer service (`stylizer/`)

This is where the analysis genuinely changes. Requirements are now: **≥2 GB RAM**, several minutes of uninterrupted execution per job, and ~548 MB of weights available at start.

| Cloud | Free option | Fit, given the script |
|---|---|---|
| AWS | Lambda container image (up to 10 GB image, 10 GB RAM) — always-free quota | RAM is fine, but the **15-minute hard execution cap** is the risk: a 300-step job at higher resolution can approach it, and there's no partial result. Weights must be baked into the image. Cost accrues against the 400,000 GB-s grant fast: at 2 GB, that's ~200,000 seconds ≈ 55 hours of compute/month, so roughly 600–1,600 jobs — plenty for personal use. |
| AWS | EC2 `t3.small` (2 GB) | Not free — `t2/t3.micro` (1 GB) is the free-tier size and is too small, same as `e2-micro`. |
| GCP | Cloud Run, configured with **2–4 GB RAM** | Good fit. Up to 8 GB RAM and a 60-minute request timeout, comfortably past the script's needs. Scale-to-zero costs a cold start (container + weights), acceptable under an async API. The always-free grant is **360,000 GB-s**, so at 2 GB that's ~180,000 seconds ≈ 50 hours/month. `min-instances=1` is still available but no longer worth paying for. |
| GCP | `e2-micro` always-free VM | **No longer recommended.** 1 GB RAM will not hold PyTorch + VGG-19 + a per-request deepcopy. This was the previous primary recommendation and is withdrawn. |
| Azure | Container Apps, scaled to 2 GB | Equivalent to Cloud Run; free grant 360,000 GiB-s. Consumption plan supports long-running requests. |
| Any | GPU | No free GPU tier exists on any of the three for sustained use. A GPU would cut runtime ~10–50× and enable the script's 1000px path, but it's a paid decision. |

## Recommendation

**Primary: GCP**, but for a different reason than before — not the free always-on VM (now ruled out), but because **Cloud Run's memory ceiling and 60-minute request timeout are the most forgiving fit for a multi-minute, ~2 GB job inside a free tier.**

- `client/` → Firebase Hosting
- `server/` → Cloud Run, small (512 MB), scale-to-zero
- `stylizer/` → Cloud Run, **2 GB RAM, generous timeout, `min-instances=0`**, weights baked into the container image so cold start is container boot + model load rather than a 548 MB download
- Postgres → Supabase or Neon free tier
- Output images → a small object-storage bucket, or straight back through the API for a personal-scale project

**Second choice: Azure Container Apps**, which is close to equivalent. **AWS Lambda** works too and its RAM ceiling is the highest of the three, but the 15-minute execution cap is a real ceiling on job size rather than a soft cost, so it constrains the resolution/step-count you can offer.

**What to accept:** a cold start on the first request after idle. Because the integration plan already builds submit-and-poll with a live progress indicator, this lands inside a wait the user can see, which is why it's no longer worth contorting the architecture to avoid.

**What would change this:** if runtime proves worse than estimated, or if 1000px output is wanted, the answer stops being a free tier and becomes a paid GPU instance. That decision needs a real measurement first (see open items).

## Non-cloud-giant alternatives

The ask was AWS/GCP/Azure, so this doc stays scoped there, but for a personal project **Render**, **Railway**, and **Fly.io** deploy a containerized Python service with far less ceremony, and **Vercel**/**Netlify** handle the static client. Free tiers there are generally tighter on RAM than Cloud Run's configurable 2–4 GB, which is exactly the axis that matters here — worth checking against the ≥2 GB requirement rather than assuming.

## Open items

- **Measure before committing.** Peak RSS and wall-clock for one job at 256px and at 512px would settle the instance sizing, which drives every recommendation above. The "≥2 GB" figure is reasoned from PyTorch's typical footprint, not measured — torch isn't installed on the dev machine.
- **Target resolution and step count** (open questions 2 and 3 in the integration plan) set the per-job cost, and therefore how many jobs fit in a monthly free grant.
- Whether outputs are retained (and for how long) determines whether object storage is needed or results can be transient.
- Expected traffic: the GB-s grants above allow roughly 50 hours of 2 GB compute per month — fine for personal use, quickly exhausted by a shared demo.
- No CI/CD, custom domain, HTTPS, or secrets management is covered here — follow-up once a target is chosen.
