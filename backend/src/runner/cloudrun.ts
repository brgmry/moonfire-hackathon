import { JobsClient } from "@google-cloud/run";
import { appendEvent, finishById, getRun } from "../runs.js";
import { memoryJson } from "../memory.js";
import { sandboxEnv, type Runner } from "./index.js";
import type { RunState } from "../types.js";

// One Cloud Run job execution per run, env overridden per execution.
let client: JobsClient | null = null;

function jobName(): string {
  const { GCP_PROJECT, GCP_REGION = "europe-west2", JOB_NAME = "tester" } = process.env;
  if (!GCP_PROJECT) throw new Error("GCP_PROJECT is not set");
  return `projects/${GCP_PROJECT}/locations/${GCP_REGION}/jobs/${JOB_NAME}`;
}

async function execute(run: RunState, extra: Record<string, string> = {}) {
  client ??= new JobsClient();
  const vars: Record<string, string> = { ...sandboxEnv(run, extra), MEMORY_JSON: memoryJson() };
  if (process.env.PUBLIC_API_URL) vars.API_URL = process.env.PUBLIC_API_URL;
  const [operation] = await client.runJob({
    name: jobName(),
    overrides: { containerOverrides: [{ env: Object.entries(vars).map(([name, value]) => ({ name, value })) }] },
  });
  const meta: any = operation.metadata;
  const executionId = meta?.name?.split("/").pop() ?? operation.name ?? "unknown";
  appendEvent(run.id, { type: "sandbox.started", executionId, runner: "cloudrun" });
  operation
    .promise()
    .catch((err: unknown) => console.error(JSON.stringify({ severity: "ERROR", msg: "job execution failed", runId: run.id, err: String(err) })))
    .finally(() =>
      setTimeout(() => {
        const r = getRun(run.id);
        if (r && !["complete", "partial", "failed"].includes(r.state.status)) finishById(run.id, "sandbox exited before every agent finished");
      }, 5000),
    );
}

export const cloudRunRunner: Runner = {
  async start(run) {
    try {
      await execute(run);
    } catch (err) {
      console.error(JSON.stringify({ severity: "ERROR", msg: "runJob failed", runId: run.id, err: String(err) }));
      appendEvent(run.id, { type: "run.finished", status: "failed", reason: `could not start the sandbox: ${String(err).slice(0, 200)}` });
    }
  },
  async rerunChunk(run, chunkId) {
    await execute(run, { RERUN_CHUNK: chunkId, RERUN_CHUNK_JSON: JSON.stringify(run.chunks.find((c) => c.id === chunkId) ?? {}) }).catch((err) =>
      console.error(JSON.stringify({ severity: "ERROR", msg: "rerun failed", runId: run.id, err: String(err) })),
    );
  },
};
