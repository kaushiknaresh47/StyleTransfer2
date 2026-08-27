# Integrate Python style-transfer code as a microservice

## Context

StyleTransfer is a PERN-stack app (React/Vite client, Express server, Postgres for a health check). The "Apply style" button in `client/src/App.jsx` is a no-op placeholder (enabled once an image and style are chosen, but with no handler), and the README still describes a synchronous `POST /api/stylize` that returns an image. There is no Python or subprocess infrastructure in the repo today.

The Python code exists at `stylize/styletransfer.py` (kept untracked at the user's request — it must be available locally before this work starts, and the refactored copy lands in-repo under `stylizer/`). Reading it changes several assumptions this plan previously made, so the design below is written against what the script actually does.

## What the script actually does

It is **Gatys-style optimization-based neural style transfer** — not a feed-forward model that maps an image to a stylized image in one pass.

- `models.vgg19(pretrained=True).features` is loaded once, frozen (`.eval()`), and used purely as a **fixed feature extractor**. Its weights are never updated.
- Content loss is MSE against VGG activations at `conv_4`; style loss is MSE between Gram matrices at `conv_1`–`conv_5`. `get_style_model_and_losses` walks the VGG children, re-numbers them (`conv_1`, `relu_1`, `pool_1`, …), and splices `ContentLoss`/`StyleLoss` modules into an `nn.Sequential` right after the layers of interest, then truncates everything after the last loss module.
- **The thing being optimized is the image itself**, not any network weights: `input_img = content_img.clone()`, `optim.LBFGS([input_img.requires_grad_()])`, and each closure does a full forward + `loss.backward()` through VGG.
- The loop runs until a counter reaches `num_steps=300`. Note that the counter increments **once per closure evaluation**, and `torch.optim.LBFGS` defaults to `max_iter=20` evaluations per `optimizer.step()` — so this is ~300 full forward+backward passes through VGG-19 (roughly 15 outer `step()` calls), not 300 cheap iterations.
- Total loss is `style_weight * style_score + content_weight * content_score` with `style_weight=1e8`, `content_weight=1e1`.

### The consequence that drives this whole design

**A request costs minutes of pinned CPU/GPU, not milliseconds.** Each of ~300 iterations is a forward and backward pass through VGG-19. Exact timings are unverified (torch isn't installed on this machine), but the order of magnitude on CPU at 256px is **single-digit minutes**, and the work is CPU-saturating throughout.

This invalidates the request/response shape the earlier draft of this plan assumed ("returns the stylized image", "may take a few seconds"). A synchronous HTTP call would blow past browser, proxy, and load-balancer idle timeouts, and there'd be no way to show progress. **The API has to be asynchronous: submit a job, poll for status, fetch the result.**

### Other specifics that affect integration

| Detail in the script | Why it matters |
|---|---|
| `imsize = 1000 if torch.cuda.is_available() else 256` | Output resolution silently depends on the host. A CPU box produces 256×256; a GPU box produces 1000×1000, and the cost scales with the square of that. This must become an explicit request/config parameter, not a hardware side effect. |
| `transforms.Resize((imsize, imsize))` | Forces a **square**, so a non-square upload is stretched. Aspect ratio is not preserved and the output is not the input's shape. A product decision is needed: letterbox, center-crop, or accept the distortion. |
| `assert style_img.size() == content_img.size()` | Trivially satisfied, since both images go through the same fixed-size loader. It's not a real safeguard and can be dropped once sizing is explicit. |
| Module-level execution | Importing the file today loads `style.jpg` and `image.jpg` from the CWD, downloads/loads VGG, **runs a full 300-step transfer**, and calls `plt.show()`. It cannot be imported as a library as-is. |
| Hardcoded paths | `"style.jpg"`, `"image.jpg"`, `"output.png"`, `"stylized_output.jpg"` — all relative to CWD. |
| `matplotlib` / `imshow` | Interactive display, useless and blocking in a server. Drop it from the service path. |
| Globals read inside functions | `run_style_transfer` closes over module-level `style_weight`, `content_weight`, and `device`. These must become parameters. |
| `models.vgg19(pretrained=True)` | Deprecated in current torchvision (`weights=VGG19_Weights.DEFAULT`), and it downloads **~548 MB** of weights to `~/.cache/torch` on first use. In a container this must be baked into the image or mounted on a volume — otherwise the first request after every deploy stalls on a half-gigabyte download. |
| `copy.deepcopy(cnn)` per call | "Load the model once" helps less than assumed: the weights stay resident, but every request still deep-copies the VGG feature stack and builds a fresh `nn.Sequential`. Warm-loading avoids disk/network, not per-request allocation. |
| `run[0] % 50 == 0` print block | Already a natural progress hook — swap the `print` for a callback. Cadence is every 50 steps (~6 updates over a 300-step run), so the UI should tolerate long quiet gaps (or the callback should fire more often, e.g. every step). |

## Approach

Add a third top-level component, `stylizer/` (a Python FastAPI service), alongside `client/` and `server/`. Express calls it over HTTP internally; the browser never talks to it directly.

```
client (React) --HTTP--> server (Express, :4000) --HTTP--> stylizer (FastAPI, :8000)
     ^                         |
     |    poll job status      |
     +-------------------------+
```

### Job ownership (decide this up front)

Two layers will both talk about "jobs." Be explicit so IDs and lifetimes don't diverge:

- **`stylizer/` owns runtime job state** — the queue, step/total progress, and the result bytes live here (in-memory for local/dev). Its job id is the one Express stores and proxies.
- **`server/` is a thin broker** — it resolves `styleId` → style image, forwards to the stylizer, returns the stylizer's job id to the client (or its own UUID that maps 1:1 to `remote_job_id`), and never runs the optimization.
- **Postgres is phase 2**, not part of the first vertical slice. An in-memory map on each process is enough to prove submit → poll → result end to end. Persist to `stylize_jobs` once restart-survival or a history UI matters. Coupling a migration into the first PR delays the path that unblocks everything else.

This also keeps local/dev honest about a constraint the cloud plan has to solve later: an in-memory stylizer job map does not survive multi-instance or scale-to-zero (see the cloud plan's Cloud Run notes).

### 1. `stylizer/` — new Python microservice

- **`stylizer/style_transfer.py`** — the user's script, refactored into an importable module. This is the bulk of the work, and it is a real refactor rather than a drop-in:
  - Delete the module-level driver code (image loads, the `run_style_transfer` call, both `imshow` calls, the `save_image` call) and the `matplotlib` import.
  - Load VGG-19 once at import/startup into a module-level singleton, using the modern `weights=` API.
  - Expose one entry point, roughly:
    ```python
    def stylize(content: Image.Image, style: Image.Image, *,
                imsize: int = 256, num_steps: int = 300,
                style_weight: float = 1e8, content_weight: float = 1e1,
                device: torch.device | None = None,
                on_progress: Callable[[int, int, float], None] | None = None) -> Image.Image
    ```
  - Take PIL images in and return a PIL image out — no file paths, so the caller owns I/O.
  - Thread `style_weight`, `content_weight`, and `device` through as parameters instead of reading globals.
  - Call `on_progress(step, total, loss)` where the script currently prints (and prefer every step, or at least more often than every 50, so a 1s poll actually moves).
  - Keep `ContentLoss`, `StyleLoss`, `gram_matrix`, `Normalization`, and `get_style_model_and_losses` essentially as written — that logic is correct and shouldn't be rewritten.
  - **Aspect ratio default for v1:** center-crop to square before resize (see [Recommended defaults](#recommended-defaults-for-open-questions)). Do not silently stretch.
- **`stylizer/app.py`** — FastAPI app:
  - Startup hook that loads VGG-19 once and (worthwhile, given the cost) runs one tiny warm-up transfer to force lazy CUDA/MPS init.
  - `POST /stylize` — accepts multipart (content image + style image) plus optional `num_steps`/`imsize`/weights, enqueues the job, returns a job id immediately.
  - `GET /jobs/{id}` — status: `queued` | `running` | `done` | `error`, plus `step`/`total` for progress.
  - `GET /jobs/{id}/result` — the finished PNG/JPEG.
  - `GET /health` — readiness, and whether the model is loaded.
  - **Serialize the work.** A single job saturates the device, so run a worker with a concurrency of one (an `asyncio.Queue` plus one worker task, or a `ProcessPoolExecutor(max_workers=1)`) and keep the optimization off the event loop so `/health` and `/jobs/{id}` stay responsive. Do not let two transfers run concurrently.
  - **Result cleanup.** Results in a temp dir need a TTL or max-age sweep; otherwise every job leaves a PNG forever.
- **`stylizer/requirements.txt`** — `fastapi`, `uvicorn[standard]`, `python-multipart`, `pillow`, `torch`, `torchvision`. No `matplotlib` (display-only in the original). Pin torch to a CPU wheel index for CPU deployments; the CUDA build is much larger.
- **`stylizer/.env.example`** — `PORT`, `HOST`, `DEVICE` (`cpu`/`cuda`/`mps`), `IMSIZE`, `NUM_STEPS`, `TORCH_HOME` (so the weight cache lands somewhere predictable).
- Run with `uvicorn app:app --host 0.0.0.0 --port 8000`.

### 2. `server/` — job-oriented proxy endpoints

- New route file `server/src/routes/stylize.js`, mounted in `server/src/routes/index.js` alongside `health`/`styles`.
- `POST /api/stylize` — accepts the uploaded content image (multipart; add `multer`) and a `styleId`. Resolves the style image via the same `STYLE_PRESETS` lookup `/api/styles/:id/image` uses (extract a small shared helper if that keeps the two routes honest). Forwards both images to the stylizer, and returns **`202 Accepted` with a job id** — not an image.
- `GET /api/stylize/:jobId` — proxies job status/progress.
- `GET /api/stylize/:jobId/result` — streams the finished image back with the right `Content-Type`.
- Enforce the upload limits the client already advertises (JPG/PNG/WebP, ≤10 MB) server-side too; the client-side check in `ImageUploader.jsx` is a UX affordance, not a control.
- If the stylizer is unreachable, return a clear 502 through the existing error-handler pattern in `server/src/app.js`.
- Add `STYLIZER_URL` (default `http://localhost:8000`) to `server/.env.example`. Node 18+ has built-in `fetch`, so no HTTP-client dependency is needed.

### 3. Postgres — later, when persistence earns it

The database is currently wired up but unused. Job tracking is a genuine use for it eventually: a `stylize_jobs` table (`id`, `style_id`, `status`, `step`, `total_steps`, `error`, `remote_job_id`, `output_path`, `created_at`, `finished_at`) survives an Express restart, gives a history of past results, and is the natural place to hang per-job parameters.

**Do not block the first working submit/poll/result path on a migration.** Ship the broker with an in-memory map (or just proxy the stylizer id through). Add the table in a follow-up once the async flow works and you know whether outputs live on disk, in object storage, or only ephemerally on the stylizer.

If/when filesystem `output_path` is used, remember that breaks a multi-instance Express deploy — object storage (or always streaming through the stylizer) is the cloud-shaped answer. See the cloud plan.

### 4. `client/` — a long-running action, not a click-and-wait

- `client/src/api/styles.js`: add `startStylize(contentFile, styleId)` → job id, `getStylizeStatus(jobId)`, and a helper that polls until terminal.
- `client/src/App.jsx`: replace the placeholder button with a handler that submits, then polls (~1s) and renders a **progress indicator driven by the real step count**, followed by the result with a download link. Remove the "Styling isn't wired up yet" note.
- The UI must communicate that this takes minutes — a spinner with no numbers will read as broken. Show step/total (and ideally an elapsed-time hint). Expect sparse updates if progress stays on the script's every-50-steps cadence.
- **Cancellation for v1 means abandon the UI, not abort the compute.** Stopping LBFGS mid-run needs a cooperative flag checked inside the closure, plus a `POST /jobs/{id}/cancel` (or equivalent). Until that exists, navigating away or changing style should stop polling and forget the job id in the client; the stylizer may still finish the work. Say so in the UI copy if a second job is submitted while one is running (and rely on the concurrency-1 queue).

### 5. Dev/run experience

- Update root `README.md`: document `stylizer/`, `pip install -r stylizer/requirements.txt`, and how to run all three processes. Replace the "Not built yet" / synchronous-return wording with the async job flow.
- Note the first-run weight download (~548 MB) so it isn't mistaken for a hang.
- No Docker/orchestration unless asked — three separately-run local processes, consistent with the project's current simplicity.

## Files to touch/add

**Phase 1 (vertical slice)**

- New: `stylizer/app.py`, `stylizer/style_transfer.py` (refactored from `stylize/styletransfer.py`), `stylizer/requirements.txt`, `stylizer/.env.example`
- New: `server/src/routes/stylize.js`
- Edit: `server/src/routes/index.js` (mount), `server/package.json` (add `multer`), `server/.env.example` (add `STYLIZER_URL`)
- Edit: `client/src/api/styles.js` (job submit + poll), `client/src/App.jsx` (progress, result, error states)
- Edit: root `README.md` (architecture, run instructions, remove "not built yet")

**Phase 2 (persistence / history)**

- New: migration/schema for `stylize_jobs` (include `remote_job_id`)
- Optional: shared style-lookup helper extracted from `server/src/routes/styles.js`

## Open questions

1. **Aspect ratio.** The script squares every image. Letterbox to preserve shape, center-crop, or accept the stretch? This is a visible product decision, not an implementation detail.
2. **Output resolution.** 256px is fast and visibly low-res; 1000px is ~15× the pixels and correspondingly slower. What's the target, and is it fixed or user-selectable?
3. **Quality vs. wait.** `num_steps=300` is the script's default; fewer steps trade fidelity for latency. Worth exposing as a "draft / full" toggle?
4. **Deployment target.** Whether a GPU is available changes the runtime by an order of magnitude and is the main input to the cloud plan.
5. **Concurrency expectations.** With one job at a time, a second user waits behind the first. Acceptable for a personal project; needs a real queue with visible position if not.

### Recommended defaults for open questions

Implement against these unless overridden, so the first PR isn't blocked on product debate:

| # | Default for v1 | Rationale |
|---|---|---|
| 1 | **Center-crop** to square | Avoids stretch artifacts; letterboxing paints black bars into the style. Revisit if users complain about lost edges. |
| 2 | **Fixed 256px** (`IMSIZE` env, not user-facing) | Matches the script's CPU path; keeps free-tier jobs in the minutes range. Expose a selector only after measuring. |
| 3 | **Fixed 300 steps** (no draft/full toggle) | One less control; use `num_steps` only as a server/dev escape hatch for fast smoke tests (e.g. 20). |
| 4 | **CPU / Option A** in the cloud plan | Measure wall-clock before paying for a GPU. |
| 5 | **Single-flight queue, no position UI** | Fine for personal use; show a simple "waiting behind another job…" if status stays `queued`. |

## Verification

- Start all three processes (`stylizer` via uvicorn, `server` and `client` via their npm scripts).
- `curl http://localhost:8000/health` — service up, weights loaded (first run downloads ~548 MB).
- Submit directly to the stylizer with a small `imsize` and `num_steps` (e.g. 128/20) to exercise the path in seconds rather than minutes, before testing real settings.
- `curl -F "image=@sample.jpg" -F "styleId=starry-night" http://localhost:4000/api/stylize` → expect `202` and a job id; poll `GET /api/stylize/<id>` and watch `step` climb; fetch the result.
- Confirm the stylizer stays responsive on `/health` while a job runs (proves the optimization isn't blocking the event loop).
- Submit two jobs back to back and confirm they serialize rather than thrashing.
- In the browser: upload, pick a style, click "Apply style", watch progress advance, confirm the result renders and downloads.
