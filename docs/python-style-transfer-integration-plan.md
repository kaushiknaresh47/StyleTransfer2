# Integrate Python style-transfer code as a microservice

## Context

StyleTransfer2 is a PERN-stack app (React/Vite client, Express server, Postgres for a health check). The "Apply style" button in `client/src/App.jsx` is currently a disabled/no-op placeholder, and the README explicitly calls out the missing piece: a `POST /api/stylize` endpoint that takes an uploaded content image + a style id and returns the stylized image. There is no Python or subprocess infrastructure in the repo today.

The user has existing Python code that performs the actual style transfer, and it loads a heavy ML model (PyTorch/TF/ONNX). Since model load time is significant, the Python code should run as a long-lived process that loads the model once, not be re-invoked per-request via a subprocess. The chosen approach: run the Python code as its own small HTTP microservice, and have Express's new `/api/stylize` route proxy to it.

## Approach

Add a third top-level component, `stylizer/` (a Python FastAPI service), alongside `client/` and `server/`. Express calls it over HTTP internally; the browser never talks to it directly.

```
client (React) --HTTP--> server (Express, :4000) --HTTP--> stylizer (FastAPI, :8000)
```

### 1. `stylizer/` — new Python microservice
- `stylizer/app.py`: FastAPI app with:
  - Startup hook that loads the user's model once into a module-level/global variable (so it's warm for all requests).
  - `POST /stylize`: accepts multipart form data (content image file + style id, or style image), runs the user's existing style-transfer function against the loaded model, returns the resulting image (as bytes/base64 or a temp file streamed back).
  - `GET /health`: simple readiness check (used by Express and for manual verification).
- Drop the user's existing Python style-transfer code in as `stylizer/style_transfer.py` (or similar), imported by `app.py`, with minimal changes — just adapt its entry point to a callable `stylize(content_img, style_img_or_id) -> image` function if it isn't already shaped that way.
- `stylizer/requirements.txt`: fastapi, uvicorn, python-multipart, pillow, plus whatever ML framework the user's code needs (torch/tensorflow/onnxruntime, etc. — confirm with user once code is shared).
- `stylizer/.env.example` and a `PORT`/`HOST` config, mirroring the pattern already used in `server/.env.example`.
- Run with `uvicorn app:app --host 0.0.0.0 --port 8000`.

### 2. `server/` — wire up the proxy endpoint
- New route file `server/src/routes/stylize.js`, mounted in `server/src/routes/index.js` alongside the existing `health`/`styles` routes.
- `POST /api/stylize`:
  - Accepts the uploaded content image (multipart — add `multer` as a new server dependency for upload handling) and a `styleId` field.
  - Looks up the style reference image via the existing `server/src/data/stylePresets.js` catalogue (already used by `/api/styles/:id/image`), reusing that lookup logic rather than duplicating it.
  - Forwards the content image + resolved style image (or style id, if the Python service is given access to the same style assets) to the stylizer service at `STYLIZER_URL` (new env var, default `http://localhost:8000`) via an HTTP client (`fetch`/`undici`, no new dependency needed since Node 18+ has built-in `fetch`).
  - Streams/returns the stylized image back to the client with the appropriate `Content-Type`.
  - Basic error handling: if the stylizer service is unreachable or errors, return a clear 502/500 with a message — reuse the existing error-handler pattern in `server/src/app.js`.
- Update `server/.env.example` with `STYLIZER_URL`.

### 3. `client/` — wire up the "Apply style" button
- `client/src/api/styles.js`: add a `stylizeImage(contentFile, styleId)` function that POSTs multipart form data to `/api/stylize` and returns the resulting image (blob URL).
- `client/src/App.jsx`: replace the placeholder button with a real `onClick` handler that calls `stylizeImage`, shows a loading state while waiting (model inference may take a few seconds), and displays the returned stylized image. Remove the "Styling isn't wired up yet" note.

### 4. Dev/run experience
- Update root `README.md`: document the new `stylizer/` service, how to install its Python deps (`pip install -r stylizer/requirements.txt`), and how to run all three processes locally (client, server, stylizer).
- No Docker/orchestration setup unless the user asks — keep it to three separately-run local processes for now, consistent with the project's current simplicity.

## Files to touch/add
- New: `stylizer/app.py`, `stylizer/style_transfer.py` (from user's code), `stylizer/requirements.txt`, `stylizer/.env.example`
- New: `server/src/routes/stylize.js`
- Edit: `server/src/routes/index.js` (mount new route), `server/package.json` (add `multer`), `server/.env.example` (add `STYLIZER_URL`)
- Edit: `client/src/api/styles.js` (add `stylizeImage`), `client/src/App.jsx` (wire button, loading/result state)
- Edit: root `README.md` (update architecture + run instructions, remove "not built yet" note)

## Open item
The user's actual Python style-transfer code hasn't been shared yet — it needs to be provided (pasted or added to the repo) so `stylizer/style_transfer.py` and `requirements.txt` can be filled in accurately (exact model framework, function signature, input/output image format).

## Verification
- Start all three processes locally (`stylizer` via uvicorn, `server` via its existing npm script, `client` via Vite dev server).
- `curl http://localhost:8000/health` to confirm the Python service is up and the model loaded without error.
- `curl -F "image=@sample.jpg" -F "styleId=starry-night" http://localhost:4000/api/stylize -o out.jpg` to confirm the full Express→Python round trip.
- In the browser, upload an image, pick a style, click "Apply style", and confirm the stylized result renders.
