import { mkdir, readFile, readdir, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import type { Event } from "./types.js";

// Event log per run: gs://$GCS_BUCKET/runs/<id>.jsonl, or ./data/runs/<id>.jsonl without a bucket.
// GCS objects cannot be appended, so each run's whole log is rewritten at most once a second.

const BUCKET = process.env.GCS_BUCKET;
const DATA_DIR = process.env.DATA_DIR ?? path.resolve("data/runs");
const storage = BUCKET ? new Storage() : null;

const pending = new Map<string, { events: Event[]; timer?: NodeJS.Timeout; writing: boolean; dirty: boolean }>();

export function persist(runId: string, events: Event[], last: Event) {
  if (!storage) {
    mkdir(DATA_DIR, { recursive: true })
      .then(() => appendFile(path.join(DATA_DIR, `${runId}.jsonl`), JSON.stringify(last) + "\n"))
      .catch((e) => console.error(JSON.stringify({ severity: "ERROR", msg: "persist failed", runId, err: String(e) })));
    return;
  }
  let p = pending.get(runId);
  if (!p) pending.set(runId, (p = { events, writing: false, dirty: false }));
  p.events = events;
  p.dirty = true;
  if (!p.timer) p.timer = setTimeout(() => flush(runId), 1000);
}

async function flush(runId: string) {
  const p = pending.get(runId)!;
  p.timer = undefined;
  if (p.writing) {
    p.timer = setTimeout(() => flush(runId), 1000);
    return;
  }
  p.writing = true;
  p.dirty = false;
  try {
    const body = p.events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await storage!.bucket(BUCKET!).file(`runs/${runId}.jsonl`).save(body, { contentType: "application/x-ndjson", resumable: false });
  } catch (e) {
    console.error(JSON.stringify({ severity: "ERROR", msg: "gcs write failed", runId, err: String(e) }));
    p.dirty = true;
  } finally {
    p.writing = false;
    if (p.dirty && !p.timer) p.timer = setTimeout(() => flush(runId), 1000);
  }
}

export async function loadAll(): Promise<Map<string, Event[]>> {
  const out = new Map<string, Event[]>();
  const parse = (id: string, text: string) => {
    const evs = text
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as Event;
        } catch {
          return null;
        }
      })
      .filter((e): e is Event => !!e);
    if (evs.length) out.set(id, evs);
  };
  try {
    if (storage) {
      const [files] = await storage.bucket(BUCKET!).getFiles({ prefix: "runs/" });
      await Promise.all(
        files
          .filter((f) => f.name.endsWith(".jsonl"))
          .map(async (f) => parse(path.basename(f.name, ".jsonl"), (await f.download())[0].toString("utf8"))),
      );
    } else {
      const names = await readdir(DATA_DIR).catch(() => [] as string[]);
      for (const n of names.filter((n) => n.endsWith(".jsonl"))) {
        parse(path.basename(n, ".jsonl"), await readFile(path.join(DATA_DIR, n), "utf8"));
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ severity: "ERROR", msg: "restore failed", err: String(e) }));
  }
  return out;
}

export async function readJson(name: string): Promise<any | null> {
  try {
    if (storage) return JSON.parse((await storage.bucket(BUCKET!).file(name).download())[0].toString("utf8"));
    return JSON.parse(await readFile(path.join(DATA_DIR, "..", name), "utf8"));
  } catch {
    return null;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  const body = JSON.stringify(value, null, 2);
  try {
    if (storage) await storage.bucket(BUCKET!).file(name).save(body, { contentType: "application/json", resumable: false });
    else {
      await mkdir(path.join(DATA_DIR, ".."), { recursive: true });
      await writeFile(path.join(DATA_DIR, "..", name), body);
    }
  } catch (e) {
    console.error(JSON.stringify({ severity: "ERROR", msg: "write json failed", name, err: String(e) }));
  }
}
