import type { RunState } from "../types.js";
import { weights } from "../keys.js";
import { mockRunner } from "./mock.js";
import { localRunner } from "./local.js";
import { cloudRunRunner } from "./cloudrun.js";

export type Runner = {
  start(run: RunState): Promise<void>;
  rerunChunk(run: RunState, chunkId: string): Promise<void>;
};

export function pickRunner(): Runner {
  switch (process.env.RUNNER ?? "mock") {
    case "cloudrun":
      return cloudRunRunner;
    case "local":
      return localRunner;
    default:
      return mockRunner;
  }
}

// Env every sandbox gets, whichever runner starts it.
export function sandboxEnv(run: RunState, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = { RUN_ID: run.id, REPO_URL: run.repoUrl, ...extra };
  // Names and weights only; the keys themselves reach the job as the ANTHROPIC_API_KEYS secret.
  const w = weights();
  if (w) env.ANTHROPIC_KEY_WEIGHTS = w;
  return env;
}
