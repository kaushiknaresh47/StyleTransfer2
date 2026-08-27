# Cloud deployment plan (AWS / GCP / Azure, free-tier focused)

## What we're deploying

Per [`docs/python-style-transfer-integration-plan.md`](./python-style-transfer-integration-plan.md), the app has (or will have) three pieces plus a database:

1. **`client/`** — static build output (Vite). No server-side rendering, just files behind a CDN/host.
2. **`server/`** — Express API (Node 18+), talks to Postgres (eventually) and proxies job submissions to `stylizer/`. Treat it as a **job broker**, not a long-running compute process.
3. **`stylizer/`** — Python FastAPI service wrapping `stylize/styletransfer.py`. **This is the component free tiers fight hardest against**, and now that the script has been read, harder than this doc previously assumed.
4. **Postgres** — currently just a health check; the integration plan gives it a real job (the `stylize_jobs` table) in a later phase, not the first local vertical slice.

## What reading the script changed

The earlier version of this doc assumed a feed-forward model: load weights once, infer in milliseconds, and the only question was cold starts. The script is **Gatys-style optimization**, which is a different resource profile in three ways that matter for hosting:

1. **Each request is minutes of pinned compute**, not milliseconds. ~300 forward+backward passes through VGG-19, optimizing the image itself with LBFGS. Timings are unverified (torch isn't installed locally), but CPU at 256px is single-digit minutes.
2. **RAM is the binding constraint, and it's larger than assumed.** The PyTorch CPU runtime alone is typically several hundred MB resident before any model loads. Add VGG-19 features (~20M params, ~80 MB fp32), a **`copy.deepcopy` of that stack per request**, plus activations and LBFGS history for the image being optimized. A realistic floor is well over 1 GB, and that is before the OS and anything else on the box.
3. **Weights are a ~548 MB download** on first use (`models.vgg19(pretrained=True)`), cached under `~/.cache/torch`. On ephemeral/serverless filesystems this re-downloads unless baked into the image.

**The direct casualty is this doc's previous primary recommendation.** GCP's always-free `e2-micro` (1 vCPU, **1 GB RAM**) was recommended as the home for `stylizer/` because it stays warm forever at no cost. Point 2 makes that not viable: PyTorch plus VGG-19 plus a per-request deepcopy will not fit in 1 GB, and even if it were squeezed in, 1 burstable vCPU running a multi-minute optimization would be punishing. Self-hosting Postgres on the same box, as previously suggested, is now clearly out.

Point 1 also softens the argument that cold starts are the main enemy. A 10–30s model load is a real cost, but against a 2–5 minute job it's overhead, not the dominant term. **Since the integration plan makes the API asynchronous (submit → poll → fetch), a cold start is absorbed into a wait the user is already being shown progress for.** That makes scale-to-zero serverless far more acceptable than this doc originally concluded — the trade-off it framed as "always warm vs. free forever" is much less painful once the client is built to wait.

The real constraint is no longer warmth. It is **RAM ceilings and per-request execution time limits** — plus a platform-specific gotcha for "return 202, keep working in the background" that the free-tier picks have to respect (see below).

## Free-tier building blocks by service

### Static frontend (`client/`)
| Cloud | Free option | Notes |
|---|---|---|
| AWS | S3 (5 GB, 12 months) + CloudFront (1 TB/mo transfer, always free) | CloudFront's free tier doesn't expire; S3's does after 12 months, but a built React app is a few MB. |
| GCP | Firebase Hosting (10 GB storage, 360 MB/day transfer, always free) | Simplest static host of the three. |
| Azure | Static Web Apps — Free plan (100 GB/mo bandwidth, custom domain + SSL, always free) | Purpose-built for SPA + API proxy config. |

Unchanged by the script — the client is static files either way.

**Same-origin note.** The client talks to **relative** `/api/...` paths today (Vite proxies in dev). Splitting `client/` onto Firebase/S3 and `server/` onto Cloud Run creates a cross-origin split unless you add Firebase/CloudFront **rewrites** to the API, or teach the client an API base URL + CORS. Option A below assumes rewrites (or a single front door), not raw cross-origin `fetch`.

### API (`server/`, Node/Express)
| Cloud | Free option | Notes |
|---|---|---|
| AWS | Lambda (1M requests + 400,000 GB-s/month, always free) via Function URLs; or EC2 `t2/t3.micro` (750 hrs/mo, 12 months only) | Express needs `serverless-http`. Fine for a thin broker; **do not** run the transfer inside the Lambda. |
| GCP | Cloud Run (2M requests, 360,000 GB-s, 180,000 vCPU-s/month, always free) | Standard container, no code changes. Scale-to-zero is fine here. |
| Azure | Container Apps (180,000 vCPU-s + 360,000 GiB-s + 2M requests/month, always free) or App Service Free (F1) | Comparable to Cloud Run. |

The server is a **job broker**, so it must not hold a request open for the duration of a transfer. Its own timeout limits stop being a concern precisely because the integration plan made the API async. Prefer keeping result bytes on the stylizer (or object storage) rather than a local `output_path` on Express — a filesystem path makes multi-instance Express lying about being "stateless."

### Postgres
| Cloud | Free option | Notes |
|---|---|---|
| AWS | RDS `db.t3.micro`/`db.t4g.micro`, 750 hrs/mo + 20 GB — **12 months only** | ~$15+/mo afterwards. |
| GCP | No free Cloud SQL tier | Previously suggested self-hosting on `e2-micro`; that box is too small for the stylizer and isn't in either option now, so this means a third-party free tier. |
| Azure | PostgreSQL Flexible Server `B1ms`, 750 hrs/mo + 32 GB — **12 months only** | Same expiry caveat. |

None of the three offers a free-forever managed Postgres. **Supabase or Neon** (no credit card, no expiry) reached over the internet is the pragmatic choice, and more clearly so now that the `e2-micro` self-hosting option is off the table. Not required for the first local integration (see the integration plan's phase split).

### The style-transfer service (`stylizer/`)

This is where the analysis genuinely changes. Requirements are now: **≥2 GB RAM**, several minutes of uninterrupted execution per job, and ~548 MB of weights available at start.

| Cloud | Free option | Fit, given the script |
|---|---|---|
| AWS | Lambda container image (up to 10 GB image, 10 GB RAM) — always-free quota | RAM is fine, but the model fights the async design: **Lambda dies when the invocation returns**, so a 202-then-background-worker pattern does not work. You'd need the transfer to run *inside* one long invoke (hitting the **15-minute hard cap**) or an extra queue + worker (Step Functions / SQS). Weights must be baked into the image. Cost accrues against the 400,000 GB-s grant fast: at 2 GB, that's ~200,000 seconds ≈ 55 hours of compute/month, so roughly 600–1,600 jobs — plenty for personal use if the orchestration exists. |
| AWS | EC2 `t3.small` (2 GB) | Not free — `t2/t3.micro` (1 GB) is the free-tier size and is too small, same as `e2-micro`. |
| GCP | Cloud Run, configured with **2–4 GB RAM** | Good fit on RAM/timeout paper (up to 8 GB, 60-minute request timeout). See **[Cloud Run + background jobs](#cloud-run--background-jobs-required-reading-for-option-a)** before treating this as drop-in. Free grant **360,000 GB-s** ≈ 50 hours/month at 2 GB. |
| GCP | `e2-micro` always-free VM | **No longer recommended.** 1 GB RAM will not hold PyTorch + VGG-19 + a per-request deepcopy. This was the previous primary recommendation and is withdrawn. |
| Azure | Container Apps, scaled to 2 GB | Equivalent class of problem to Cloud Run (CPU allocation / background work after the HTTP response). Free grant 360,000 GiB-s. |
| Any | GPU | No free GPU tier exists on any of the three for sustained use, but a **Spot** GPU is cheap enough to be worth costing out properly — see [Costed alternative](#costed-alternative-a-t4-spot-vm) below. |

### Cloud Run + background jobs (required reading for Option A)

The integration plan's stylizer returns **202 immediately** and runs LBFGS on an in-process worker. That is correct for a long-lived local process. On Cloud Run it is easy to get wrong:

1. **CPU is throttled between requests by default.** After `POST /stylize` returns, a background `asyncio` worker may receive little or no CPU. Fix: enable **CPU always allocated** for the stylizer service (billed for the instance's lifetime while it is up), or keep a request open for the duration (which reintroduces proxy timeouts and defeats the point), or move the work to **Cloud Run jobs** / a task queue.
2. **In-memory job state + scale-to-zero / multi-instance.** `GET /jobs/{id}` must hit the same instance that accepted the job, and that instance must stay alive until the job finishes. `min-instances=0` is fine *between* jobs, but not if the platform replaces the instance mid-run. Mitigations: `--max-instances=1` (serialize at the platform too), sticky routing (fragile), or externalize job state + results (Redis/Postgres + object storage) — which is more machinery than Option A admits at first glance.
3. **Cold start still includes model load** unless weights are in the image; that is acceptable under async UX, but the first poll after a cold start should expect `queued`/`running` with step 0 for a while.

None of this kills Option A; it means the stylizer Cloud Run service is configured deliberately (always-on CPU while instances exist, max instances 1, weights baked in), not "deploy the local FastAPI app unchanged."

### Costed alternative: a T4 Spot VM

Everything above chases a free tier, which forces the CPU path and a multi-minute job. Attaching a GPU changes the product rather than just the hosting: a T4 turns a ~300-step VGG-19 optimization from minutes into seconds, which is the difference between "come back later" and "wait a moment."

Priced on the GCP calculator (`us-central1`, Spot, no commitment) — **spot prices move; treat these as an order-of-magnitude snapshot, not a quote**:

| Component | Config | Rate | 24 h/month |
|---|---|---|---|
| GPU | 1× NVIDIA T4, Spot | ~$0.20/hr | ~$4.80 |
| Machine | `n1-standard-1` (1 vCPU, 3.75 GB), Spot | ~$0.0246/hr | ~$0.59 |
| Boot disk | 10 GiB balanced PD | — | ~$1.00/mo |
| OS | Ubuntu LTS | free | $0.00 |
| | | | **≈ $6–7/mo** |

**Two constraints on that number, and they matter more than the number itself:**

1. **It assumes ~24 hours of uptime per month.** Run the same VM continuously and it is **~$165/mo** — the GPU alone is ~$146. The boot disk bills continuously either way. This price is a claim about usage discipline, not about hardware.
2. **It requires start/stop orchestration that doesn't exist yet.** Something always-on must receive the job and boot the VM: Cloud Run (`server/`) calls the Compute API to start the instance, polls for readiness, submits, then stops it after an idle timeout. Cold start becomes VM boot + model load — worse than a Cloud Run cold start, but the async job model already absorbs it. **This is the real cost of this option: not $6, but the orchestration and the risk of leaving the box running.**

Other notes specific to this configuration:

- **`n1-standard-1` is the floor.** T4 attaches to **N1 only**; shared-core types (`f1-micro`, `g1-small`) are explicitly excluded, so the cheapest-looking VM on the calculator is not a legal GPU host. 3.75 GB also clears the ≥2 GB requirement with room to spare.
- **Ubuntu Pro is a paid license** (~$0.88/mo) with no benefit here — use plain Ubuntu LTS.
- **Spot means preemption**, 30 seconds' notice. On a GPU a job is short enough that losing one is cheap, but the VM stays down until something restarts it (a MIG with auto-restart, or the same orchestration above). The job queue makes retries cheap.
- **Avoid a committed use discount.** A 1-year CUD is billed for its full term "regardless of whether or not you use those resources," which destroys the intermittent-usage premise this price depends on. Commitments only pay off for always-on workloads, and they don't stack with Spot.
- **The script jumps to 1000px on a GPU.** `imsize = 1000 if torch.cuda.is_available() else 256` means attaching a T4 silently multiplies the pixel count ~15×, spending much of the speedup on resolution. Probably desirable, but it should become an explicit parameter (open question 2 in the integration plan) rather than a hardware side effect.
- **The $300 new-customer credit** covers many months of this without any commitment — the sane way to find out whether the GPU is worth it.

## Recommendation

There are two defensible answers, and they differ on a single axis: **do you pay to make the wait short?**

### Option A — free, slow (Cloud Run, CPU)

- `client/` → Firebase Hosting **with rewrites** to the API (keep relative `/api` paths), or an explicit API base URL
- `server/` → Cloud Run, 512 MB, scale-to-zero (broker only)
- `stylizer/` → Cloud Run, **2 GB RAM**, **CPU always allocated**, **`max-instances=1`**, generous timeout, `min-instances=0` between jobs, weights baked into the container image so cold start is container boot + model load rather than a 548 MB download
- Postgres → Supabase or Neon free tier (when phase-2 job persistence lands)
- Output images → stay on the stylizer (or object storage); do not rely on Express-local paths

Stays inside always-free grants (~360,000 GB-s ≈ 50 hours of 2 GB compute/month), with the caveat that **always-allocated CPU** changes how that grant burns while an instance is up idle — shut instances down when the queue is empty (`min-instances=0`) so idle time is actually free.

Cloud Run is the pick over AWS Lambda mainly because Lambda cannot host the integration plan's 202-and-background-worker shape without extra queue infrastructure, and its **15-minute hard execution cap** would otherwise ceiling job size. Azure Container Apps is close to Cloud Run if configured with the same background-CPU awareness.

### Option B — ~$6/month, fast (T4 Spot VM)

- `client/`, `server/`, Postgres → as in Option A
- `stylizer/` → `n1-standard-1` + 1× T4, **Spot**, Ubuntu LTS, started and stopped around usage (see [Costed alternative](#costed-alternative-a-t4-spot-vm))

Jobs finish in seconds instead of minutes, and the script's 1000px path becomes usable. The price holds **only** with start/stop automation; left running it's ~$165/mo. Requires building that orchestration, and accepting Spot preemption. A long-lived VM also sidesteps the Cloud Run background-CPU issue — the process just keeps running.

### Which to build first

**Start with Option A**, after the local three-process integration works. It's free, it's less work than GPU orchestration, and the async submit/poll/progress design the integration plan specifies is required either way — that work is not wasted if you later switch. Once it runs end to end you'll have a real measurement of how bad the CPU wait actually is, which is the only honest input to whether the GPU is worth ~$6/mo and an orchestration layer.

Option B is the right answer if the measured CPU wait turns out to be intolerable, or if 1000px output is a goal. Deciding that *before* measuring is guessing.

## Non-cloud-giant alternatives

The ask was AWS/GCP/Azure, so this doc stays scoped there, but for a personal project **Render**, **Railway**, and **Fly.io** deploy a containerized Python service with far less ceremony, and **Vercel**/**Netlify** handle the static client. Free tiers there are generally tighter on RAM than Cloud Run's configurable 2–4 GB, which is exactly the axis that matters here — worth checking against the ≥2 GB requirement rather than assuming. A single small always-on VM on those platforms can also be simpler than Cloud Run's background-CPU rules for a personal queue of one.

## Open items

- **Measure before committing.** Peak RSS and wall-clock for one job at 256px and at 512px would settle the instance sizing, which drives every recommendation above. The "≥2 GB" figure is reasoned from PyTorch's typical footprint, not measured — torch isn't installed on the dev machine.
- **Target resolution and step count** (open questions 2 and 3 in the integration plan; defaults recommended there) set the per-job cost, and therefore how many jobs fit in a monthly free grant.
- Whether outputs are retained (and for how long) determines whether object storage is needed or results can be transient — and whether Express may stream-through only.
- Expected traffic: the GB-s grants above allow roughly 50 hours of 2 GB compute per month — fine for personal use, quickly exhausted by a shared demo. **A public URL with no auth is an easy way to burn the grant**; a shared secret or basic rate limit belongs in the first public deploy.
- **Cloud Run stylizer config** (CPU always allocated, max-instances 1, weights in image) must be part of Option A, not an afterthought — see [above](#cloud-run--background-jobs-required-reading-for-option-a).
- **If Option B is chosen**, the start/stop orchestration (Cloud Run → Compute API, plus an idle shutdown) is a work item in its own right, and the failure mode is a GPU left running at ~$165/mo. A budget alert is not optional.
- No CI/CD, custom domain, HTTPS, or secrets management is covered here — follow-up once a target is chosen.
