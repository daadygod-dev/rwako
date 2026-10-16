# Deploying (all free tier)

## Backend → Render

1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. `render.yaml` is picked up
   automatically (service name, build/start commands, health check `/api/v1/health`).
3. After it builds, note the service URL, e.g. `https://rwanda-compass-api.onrender.com`.
4. In the service **Environment** tab set:
   - `FRONTEND_ORIGINS` = your Vercel URL(s), comma-separated, e.g.
     `https://rwanda-compass.vercel.app,http://localhost:3000`
5. Verify: open `<render-url>/docs` — all endpoints listed; `/api/v1/health` returns 200.

> Free-tier note: the service spins down after ~15 min idle; first request afterwards has a
> ~30–60 s cold start. The frontend shows a loading state during that warmup — acceptable for
> the hackathon. (Optional $0 warm-up: a free uptime monitor pinging `/api/v1/health`.)

## Frontend → Vercel

1. Vercel → **Add New → Project** → import the same repo.
2. Vercel auto-detects Next.js from `web/`. Set:
   - **Root Directory**: `web`
   - Env var: `NEXT_PUBLIC_API_URL` = `https://<your-render-url>` (no trailing slash)
3. Deploy. Add the resulting `*.vercel.app` URL(s) to Render's `FRONTEND_ORIGINS` (step 4 above).

## Lint of the loop (local)

```bash
# backend
pip install -r requirements.txt
uvicorn server.app:app --reload            # http://127.0.0.1:8000

# frontend
cd web
npm install
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" > .env.local
npm run dev                                # http://localhost:3000
```

## Why this layout deploys cleanly

- `web/` is a **self-contained** Next.js app (own package.json) → Vercel "Root Directory" works
  with zero config beyond the env var.
- `render.yaml` lives at the **repo root** (Render Blueprint requirement) and pins the start
  command with `$PORT` + `0.0.0.0` (Render requirements).
- The backend is **stateless** and reads `data/processed/` from the repo — no external storage,
  no migrations, no secrets → blue/green redeploys are trivial.
- `data/processed/` is committed → deploys are reproducible; rebuild locally with
  `python scripts/build_dataset.py` and commit to ship new data.
