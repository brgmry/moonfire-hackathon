# 04. Sandbox, infrastructure and the build/run agents (Akshay)

Google Cloud lab account (`docs/google-cloud.md`), region `europe-west2`. Six chunks of work. K1 and K2 unblock everyone else; do them first and announce each.

## K1. Project and plumbing (5:00 to 5:20)
```
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com aiplatform.googleapis.com
gcloud artifacts repositories create crew --repository-format=docker --location=europe-west2
gcloud storage buckets create gs://<PROJECT_ID>-crew --location=europe-west2
printf '%s' "$ANTHROPIC_API_KEY" | gcloud secrets create anthropic-key --data-file=-
openssl rand -hex 24 | gcloud secrets create internal-token --data-file=-
```
Put `PROJECT_ID`, bucket name and the Artifact Registry path in `infra/env.sh` (no secrets) and commit it. Everyone sources it. Done when the three of us can `gcloud run jobs list` on the project.

## K2. Sandbox image and job (5:20 to 6:00)
`infra/sandbox/Dockerfile`:
```
FROM python:3.12-slim
RUN apt-get update && apt-get install -y git curl build-essential nodejs npm && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm corepack && pip install uv claude-agent-sdk playwright && playwright install --with-deps chromium
COPY sandbox/ /app/sandbox/
WORKDIR /work
ENTRYPOINT ["python", "/app/sandbox/main.py"]
```
Build and the job:
```
gcloud builds submit --tag europe-west2-docker.pkg.dev/<PROJECT_ID>/crew/tester:latest .
gcloud run jobs create tester --image europe-west2-docker.pkg.dev/<PROJECT_ID>/crew/tester:latest --region europe-west2 \
  --task-timeout 600 --cpu 2 --memory 4Gi --max-retries 0 --tasks 1 \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest,INTERNAL_TOKEN=internal-token:latest \
  --set-env-vars API_URL=http://placeholder,MAX_CHUNKS=24,MAX_PARALLEL=8,GCS_BUCKET=<bucket>
gcloud run jobs execute tester --region europe-west2 --update-env-vars RUN_ID=test1,REPO_URL=https://github.com/<tiny repo> --wait
```
Until Allen's `main.py` exists, ship a stub `main.py` that clones the repo, runs `ls`, and POSTs three fake events (`repo.profile`, `agent.spawned`, `agent.done`) to `API_URL`. That proves egress, secrets, timing and the event path. Record: time from `execute` to first event, and from first event to exit. Run 4 at once and note whether all 4 start. Done when the stub's events show up in Allen's local backend (expose it with `cloudflared tunnel --url http://localhost:8080` for the test).

Service account: grant the backend's runtime account `roles/run.developer` and `roles/iam.serviceAccountUser` so `JobsClient.runJob` works from the service.

## K3. Repo profile helpers, compile agent, run agent (6:00 to 7:00)
These live in `sandbox/` next to Allen's agents and import `events.emit`.

`sandbox/compiler.py`, Sonnet 5.5 with `Bash` only. Prompt: the profile, the install result, the instruction to find and run the build (`npm run build`, `pnpm build`, `cargo build --release`, `go build ./...`, `python -m compileall -q .`, `tsc --noEmit` when there is no build script), with a 180s timeout, then report `{ compiles, command, durationMs, buildSizeBytes, warnings, errorsTail }` as JSON. `buildSizeBytes` from `du -sb` of `dist`, `build`, `.next`, `target/release` or the binary. Emits `compile.done`, plus `agent.spawned` / `agent.working` / `agent.done`.

`sandbox/runner.py`, Sonnet 5.5 with `Bash`. Picks the kind from the profile:
- `lib` or `cli`: run the test suite (`pnpm test`, `pytest -q`, `cargo test`, `go test ./...`) with a 180s timeout, parse passed and failed counts from the output; then run the first code block in the README's usage section and record whether it exits 0.
- `api`: start the server in the background (`npm start`, `uvicorn`, from the README), wait for the port, `curl` every path mentioned in the README, count 2xx. Kill it.
- `web`: start the dev server, wait for the port, `curl -s -o /dev/null -w '%{http_code}' localhost:<port>` for a 200. Stretch: `playwright` screenshot of the root at 1280x800, upload to `gs://<bucket>/shots/<runId>.png`, make it public, emit `app.screenshot`.
Emits `run.done` with the fields in the contract.

`sandbox/gitstats.py`, no LLM. `git shortlog -sne --no-merges`, drop authors matching `bot|dependabot|renovate|actions`. Per chunk: `git blame --line-porcelain <file> | grep '^author ' | sort | uniq -c` summed over the chunk's files, 2s timeout per file, skip the rest if the chunk blows 20s. `truncated: true` when `git rev-list --count HEAD` equals the clone depth. `fork: true` when the GitHub API says so. Emits `contributors`.

Done: the three demo repos produce `compile.done`, `run.done` and `contributors` locally by 7:00.

## K4. Deploy the backend and wire the frontend (6:15 to 6:45)
```
gcloud run deploy api --source ./backend --region europe-west2 --min-instances 1 --max-instances 1 \
  --no-cpu-throttling --timeout 3600 --allow-unauthenticated --port 8080 \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest,INTERNAL_TOKEN=internal-token:latest \
  --set-env-vars GCS_BUCKET=<bucket>,RUNNER=cloudrun,GCP_PROJECT=<PROJECT_ID>,GCP_REGION=europe-west2,JOB_NAME=tester,CORS_ORIGIN=https://<vercel-app>.vercel.app
gcloud run jobs update tester --region europe-west2 --update-env-vars API_URL=https://api-<hash>-ew.a.run.app
```
Give Bergen the URL for `NEXT_PUBLIC_API_URL`. Test from a phone on 4G: `/healthz`, then open a run. Redeploy is the same command; put both in `infra/deploy.sh`.

## K5. Demo repos (6:30 to 7:00, with Bergen)
Three plus a backup, pinned by commit sha in `infra/demo-repos.md`: one CLI or library with tests (Python or TypeScript, installs under 60s), one API server with documented endpoints, one website with a dev server. At least one must have a README claim that is honestly missing. Each run end to end from the Cloud Run job, timings noted. The backup is the smallest of the three.

## K6. Screenshot world (cherry, after 7:20 only)
The Playwright branch in `runner.py`. Only if K1 to K5 are green. Otherwise it is one line in the pitch.

## Done means
Stub job round-trips events by 6:00. Backend on Cloud Run by 6:30. Three demo repos green through the real job by 7:00. `infra/` holds every command so a redeploy after the lab account dies is five minutes.
