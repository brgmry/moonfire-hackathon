import { readJson, writeJson } from "./store.js";

// Our three Anthropic keys, one per person, balanced by credit left.
// ANTHROPIC_API_KEYS="allen:sk-ant-...,bergen:sk-ant-...,akshay:sk-ant-..."  (one secret)
// ANTHROPIC_KEY_BUDGETS="allen:25,bergen:25,akshay:10"  (USD credit each started the night with)
// No public API reports a key's balance, so spend is tracked here from token usage and kept in keys.json.

export const PRICE: Record<string, { in: number; out: number; cacheRead: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01 },
};

const DEFAULT_BUDGET_USD = 20;
const EXHAUSTED_FOR_MS = 60 * 60 * 1000;
const COOLDOWN_MS = 30 * 1000;

type Key = { name: string; key: string; budgetUsd: number; spentUsd: number; exhaustedAt?: number; coolUntil?: number };

const pool: Key[] = [];
let saveTimer: NodeJS.Timeout | undefined;

function parsePairs(s: string | undefined): [string, string][] {
  return (s ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(":");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as [string, string];
    })
    .filter(([n, v]) => n && v);
}

export async function loadKeys() {
  const budgets = Object.fromEntries(parsePairs(process.env.ANTHROPIC_KEY_BUDGETS).map(([n, v]) => [n, Number(v)]));
  const pairs = parsePairs(process.env.ANTHROPIC_API_KEYS);
  if (pairs.length === 0 && process.env.ANTHROPIC_API_KEY) pairs.push(["default", process.env.ANTHROPIC_API_KEY]);
  const saved = (await readJson("keys.json")) ?? {};
  for (const [name, key] of pairs) {
    pool.push({
      name,
      key,
      budgetUsd: Number.isFinite(budgets[name]) ? budgets[name] : DEFAULT_BUDGET_USD,
      spentUsd: Number(saved.spentUsd?.[name]) || 0,
      exhaustedAt: saved.exhaustedAt?.[name],
    });
  }
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () =>
      writeJson("keys.json", {
        spentUsd: Object.fromEntries(pool.map((k) => [k.name, Math.round(k.spentUsd * 10000) / 10000])),
        exhaustedAt: Object.fromEntries(pool.filter((k) => k.exhaustedAt).map((k) => [k.name, k.exhaustedAt])),
      }),
    1000,
  );
}

const remaining = (k: Key) => Math.max(0, k.budgetUsd - k.spentUsd);

function healthy(k: Key, now = Date.now()): boolean {
  if (k.exhaustedAt && now - k.exhaustedAt < EXHAUSTED_FOR_MS) return false;
  if (k.coolUntil && now < k.coolUntil) return false;
  return remaining(k) > 0;
}

// Healthy keys, most credit left first. If every key looks spent, still try them rather than stop the demo.
export function ranked(): Key[] {
  const ok = pool.filter((k) => healthy(k)).sort((a, b) => remaining(b) - remaining(a));
  return ok.length > 0 ? ok : [...pool].sort((a, b) => remaining(b) - remaining(a));
}

// "allen:0.52,bergen:0.31,akshay:0.17" for the sandbox, share of the credit left on healthy keys.
export function weights(): string {
  const ks = ranked();
  const total = ks.reduce((t, k) => t + remaining(k), 0);
  return ks.map((k) => `${k.name}:${total > 0 ? (remaining(k) / total).toFixed(3) : (1 / ks.length).toFixed(3)}`).join(",");
}

export function primaryKeyName(): string | undefined {
  return ranked()[0]?.name;
}

export function allKeysEnv(): string {
  return pool.map((k) => `${k.name}:${k.key}`).join(",");
}

export function record(name: string | undefined, model: string | undefined, t?: { in?: number; out?: number; cacheRead?: number }) {
  const k = pool.find((x) => x.name === name);
  if (!k || !t) return;
  const p = PRICE[model ?? ""] ?? PRICE["claude-haiku-5-5"];
  k.spentUsd += ((t.in ?? 0) * p.in + (t.out ?? 0) * p.out + (t.cacheRead ?? 0) * p.cacheRead) / 1e6;
  save();
}

export function markExhausted(name: string, reason: string) {
  const k = pool.find((x) => x.name === name);
  if (!k) return;
  k.exhaustedAt = Date.now();
  console.error(JSON.stringify({ severity: "WARNING", msg: "key exhausted", key: name, reason }));
  save();
}

export function coolDown(name: string) {
  const k = pool.find((x) => x.name === name);
  if (k) k.coolUntil = Date.now() + COOLDOWN_MS;
}

export function publicView() {
  return pool.map((k) => ({
    name: k.name,
    budgetUsd: k.budgetUsd,
    spentUsd: Math.round(k.spentUsd * 100) / 100,
    remainingUsd: Math.round(remaining(k) * 100) / 100,
    status: healthy(k) ? "ok" : k.exhaustedAt ? "exhausted" : k.coolUntil && Date.now() < k.coolUntil ? "cooling" : "spent",
  }));
}

export function keyByName(name: string): string | undefined {
  return pool.find((k) => k.name === name)?.key;
}
