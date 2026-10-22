import Anthropic from "@anthropic-ai/sdk";
import { coverage, MAX } from "./score.js";
import type { RunState, Tokens } from "./types.js";

// USD per million tokens, hard-coded tonight. cacheRead at a tenth of input.
const PRICE: Record<string, { in: number; out: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01 },
};
const USD_TO_GBP = 0.76;
const WRITER_MODEL = "claude-sonnet-5-5";

const SYSTEM = `You write the verdict of a technical due-diligence review of a code repository.
You receive JSON: the score per dimension, the findings (file, line, quote, note, severity), the README claims and the build and run results.
Write exactly one sentence per dimension, in this order: claims, runs, compiles, quality, architecture, tests, dead_code, security, docs.
Format each as a markdown bullet: "- **<dimension>**: <sentence>".
Every sentence must cite at least one repository file path in backticks, taken from the input, for example \`src/api/auth.ts:42\`.
Plain, specific, no hype. State what the evidence shows. Never invent a file, number or claim that is not in the input.
Output the nine bullets and nothing else.`;

export function costGbp(s: RunState, extra?: { model: string; tokens: Tokens }): number {
  let usd = 0;
  const add = (model: string | undefined, t?: Tokens) => {
    if (!t) return;
    const p = PRICE[model ?? ""] ?? PRICE["claude-haiku-5-5"];
    usd += (t.in * p.in + t.out * p.out + t.cacheRead * p.cacheRead) / 1e6;
  };
  for (const a of s.agents) add(a.model, a.tokens);
  if (extra) add(extra.model, extra.tokens);
  return Math.round(usd * USD_TO_GBP * 10000) / 10000;
}

function input(s: RunState) {
  const findings = s.findings
    .filter((f) => f.valid !== false)
    .map(({ id, dimension, severity, file, line, quote, note }) => ({ id, dimension, severity, file, line, quote, note }));
  return {
    repo: s.profile.name ?? s.repoUrl,
    score: s.score,
    findings: findings.slice(0, 150),
    claims: s.claims,
    compile: s.compile,
    run: s.run,
    install: { ok: s.install.ok, manager: s.install.manager },
    profile: { languages: s.profile.languages, framework: s.profile.framework, hasTests: s.profile.hasTests },
  };
}

// Keep a bullet only if it cites a path the repo actually has.
function citedOnly(text: string, s: RunState): string[] {
  const known = new Set<string>([...(s.profile.files ?? []), ...s.findings.map((f) => f.file), ...s.claims.map((c) => c.evidenceFile ?? "")]);
  known.add("README.md");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .filter((l) => [...l.matchAll(/`([^`]+)`/g)].some((m) => known.has(m[1].replace(/:\d+(-\d+)?$/, ""))));
}

function templateBullets(s: RunState): string[] {
  const out: string[] = [];
  for (const dim of Object.keys(MAX)) {
    const d = s.score.dimensions[dim];
    if (!d) continue;
    const f = s.findings.find((x) => x.id === d.top[0]);
    const c = s.claims.find((x) => x.id === d.top[0]);
    if (f) out.push(`- **${dim}**: ${f.note} (\`${f.file}:${f.line}\`).`);
    else if (c) out.push(`- **${dim}**: "${c.text}" is ${c.status}${c.evidenceFile ? ` (\`${c.evidenceFile}\`)` : ""}.`);
    else if (d.note) out.push(`- **${dim}**: ${d.note}.`);
  }
  return out;
}

export async function writeReport(s: RunState): Promise<{ markdown: string; usage: Tokens; tokens: Tokens }> {
  let bullets: string[] = [];
  const usage: Tokens = { in: 0, out: 0, cacheRead: 0 };
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    try {
      const client = new Anthropic();
      const r = await client.messages.create({
        model: WRITER_MODEL,
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: JSON.stringify(input(s)) }],
      } as any);
      usage.in = r.usage.input_tokens;
      usage.out = r.usage.output_tokens;
      usage.cacheRead = r.usage.cache_read_input_tokens ?? 0;
      if (r.stop_reason !== "refusal") {
        const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
        bullets = citedOnly(text, s);
      }
    } catch (err) {
      console.error(JSON.stringify({ severity: "ERROR", msg: "writer call failed", err: String(err) }));
    }
  }
  if (bullets.length === 0) bullets = templateBullets(s);

  const tokens: Tokens = {
    in: s.tokens.in + usage.in,
    out: s.tokens.out + usage.out,
    cacheRead: s.tokens.cacheRead + usage.cacheRead,
  };
  tokens.costGbp = costGbp(s, { model: WRITER_MODEL, tokens: usage });

  const cov = coverage(s);
  const rows = Object.keys(MAX)
    .map((k) => {
      const d = s.score.dimensions[k];
      return `| ${k} | ${d?.points ?? 0} / ${MAX[k]} | ${d?.note ?? ""} |`;
    })
    .join("\n");
  const cacheShare = tokens.in + tokens.cacheRead > 0 ? Math.round((100 * tokens.cacheRead) / (tokens.in + tokens.cacheRead)) : 0;
  const markdown = [
    `# ${s.profile.name ?? s.repoUrl}: ${s.score.total} / 100`,
    "",
    s.profile.commit ? `Commit \`${String(s.profile.commit).slice(0, 7)}\`. ` : "",
    cov.sampled > 0 ? `Sampled ${cov.chunks - cov.sampled} of ${cov.chunks} chunks.` : `${cov.chunks} chunks explored.`,
    "",
    "| Dimension | Points | Note |",
    "|---|---|---|",
    rows,
    "",
    ...bullets,
    "",
    `${Math.round(tokens.in / 1000)}k in, ${Math.round(tokens.out / 1000)}k out, ${cacheShare}% cache hits, ${Math.round((tokens.costGbp ?? 0) * 100)}p`,
  ].join("\n");
  return { markdown, usage, tokens };
}
