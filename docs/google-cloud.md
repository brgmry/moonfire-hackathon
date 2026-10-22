# Google Cloud for Build Night

A temporary `@gcplab.me` account (username `devstar4231@gcplab.me`, credentials shared by the organisers, never put them in the repo) with one pre-assigned Google Cloud project, Gemini models via Vertex AI (now branded "Gemini Enterprise Agent Platform") and AI Studio. The whole environment is decommissioned at the end of the event (48-hour expiry): copy anything you want to keep out first.

## Login and setup

From the organiser README ("Frictionless accounts - participant README - Oct 22"):

1. Log in at https://console.cloud.google.com in an incognito window or a fresh Chrome profile (not your normal Google session).
2. Select the project from the picker. Only one is assigned. The README gives no project id (unverified: read it from the picker or `gcloud projects list`).
3. The same login works for AI Studio (ai.studio): "Get API key", and if none shows, "Import Projects" and pick the single project. A key is already provisioned.
4. Antigravity (2.0, IDE, CLI `agy`) also accepts the account. Give your project id at login so you get the Agent Platform (Business) plan. If it says "Starter Quota", log out and retry.
5. Cloud Shell and Cloud Shell Editor (ide.cloud.google.com) are available if the laptop setup fights you.

Laptop commands:

```
gcloud auth login            # use the gcplab.me account
gcloud projects list         # find the project id
gcloud config set project PROJECT_ID
gcloud auth application-default login
gcloud services enable aiplatform.googleapis.com run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

The README does not say which APIs are pre-enabled, what the quotas are, or whether there are credits (all unverified). The enable command may be refused if the account lacks permission; the README's rules are no abuse, no leaked API keys, secure any open ports.

## Gemini via Vertex AI

Env vars (current docs; the older `GOOGLE_GENAI_USE_VERTEXAI=True` appears in the JS sample, so set both if one fails):

```
export GOOGLE_CLOUD_PROJECT=PROJECT_ID
export GOOGLE_CLOUD_LOCATION=global
export GOOGLE_GENAI_USE_ENTERPRISE=True   # legacy name: GOOGLE_GENAI_USE_VERTEXAI=True
```

Python (`pip install --upgrade google-genai`), from the SDK page:

```python
from google import genai
from google.genai.types import HttpOptions
client = genai.Client(http_options=HttpOptions(api_version="v1"))
r = client.models.generate_content(model="gemini-3.5-flash", contents="How does AI work?")
print(r.text)
```

TypeScript (`npm i @google/genai`). The docs sample is split across files; this is the same client shape, not copied verbatim (unverified, test it):

```ts
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION ?? 'global',
});
const r = await ai.models.generateContent({ model: 'gemini-3.5-flash', contents: 'How does AI work?' });
console.log(r.text);
```

Model ids:

- Fast: `gemini-3.5-flash` (GA, released 19 May 2026).
- Strong: `gemini-3.1-pro-preview` (preview, usable commercially). `gemini-3.1-pro-preview-customtools` is the variant tuned for custom tools and bash, relevant for agent loops.
- The model list also shows Gemini 3.8 Flash, 3.7, 3.6 and "Gemini 4 Argon". I could not verify their API id strings or status, so check https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models before relying on them.

Pricing and quotas: the model pages only link out to the pricing and "Quotas and system limits" pages. Not verified. On a 429, see the retry strategy page in the docs.

## Sandbox options

| Option | What it is | Setup time | Network for installs | Fit for "clone repo, run tests" | Link |
|---|---|---|---|---|---|
| Agent Platform shell sandbox (Agent Engine) | Managed sandbox; `execute_bash()` returns stdout, stderr, returncode. Runs as `appuser`, no sudo, workdir `/workspace`, each command a fresh shell, ~20s to start, TTL set per sandbox. Needs `google-cloud-aiplatform[agent_engines]`, `roles/aiplatform.user`. | 15 to 25 min | Outbound internet is OFF unless the sandbox template enables it. How to enable it is not documented on the page (unverified) | Best on paper, but git clone and pip install both need egress | shell-sandbox-quickstart |
| Agent Platform code execution sandbox | Same service, `execute_code()` for Python or JavaScript only, 100MB file I/O, default 2 vCPU 1.5GB (4 vCPU 4GB option), state persists between calls | 15 min | Not stated (unverified) | Poor: code only, no shell, no documented git | code-execution-quickstart |
| Agent Sandbox on GKE | Kubernetes SIG project (gVisor or Kata isolation), Python/Go SDK, sandboxes from a warm pool. Google's GKE concept page returned 404 for me, so GKE specifics are unverified | 45+ min (cluster plus controller install plus warm pool) | Cluster egress, normally open | Good isolation, wrong tool for a 3-hour sprint | agent-sandbox.sigs.k8s.io |
| Cloud Run jobs | One container per execution. `gcloud run jobs execute JOB --args=... --update-env-vars=... --task-timeout=... --wait`; per-run overrides, logs via `--tail` | 20 to 30 min (build an image with git, python, node; deploy; execute) | Egress not covered on the fetched page; Cloud Run default is open internet (unverified here) | Strong: real container, clone, install, test, logs back | execute/jobs |
| Gemini CLI sandbox | Sandboxes the CLI itself (Seatbelt, Docker/Podman, gVisor). Not a remote runner. Docs say Gemini CLI was replaced by Antigravity CLI on 18 Jun 2026 | n/a | n/a | No | geminicli.com sandbox |

## Memory Bank and Sessions

Memory Bank (Agent Platform) stores lasting facts extracted from sessions so an agent can personalise across conversations. You can generate memories, ingest events, define memory profiles, fetch memories and inspect revisions, with access via IAM Conditions. Memory generation calls a Gemini model. The overview page states no release stage (unverified).

Sessions store individual user and agent exchanges so an agent keeps conversation state, managed through the Agent Development Kit, console or API. Both need the Agent Platform API and Agent Engine. For a 3-hour hack a plain JSON file or SQLite is likely faster; the managed route only pays off if the demo story is Google-native.

## Links

- Organiser README: https://docs.google.com/document/d/159NVIiZ5jx7D8STlxHLjaG-iIP8JQTipFTiDCN2jQ20/edit
- SDK overview: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/sdks/overview
- Quickstart: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstarts/quickstart-multimodal
- Models: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models
- Gemini 3.5 Flash: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash
- Gemini 3.1 Pro: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-pro
- Code execution overview: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/code-execution/overview
- Code execution quickstart: https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/sandbox/code-execution-quickstart
- Shell sandbox quickstart: https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/sandbox/shell-sandbox-quickstart
- GKE Agent Sandbox (404): https://docs.cloud.google.com/kubernetes-engine/docs/concepts/agent-sandbox
- Agent Sandbox project: https://agent-sandbox.sigs.k8s.io/
- Cloud Run execute jobs: https://docs.cloud.google.com/run/docs/execute/jobs
- Cloud Run create jobs (not fetched): https://cloud.google.com/run/docs/create-jobs
- Gemini CLI sandbox: https://geminicli.com/docs/cli/sandbox
- Memory Bank and Sessions: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/memory-bank/overview
