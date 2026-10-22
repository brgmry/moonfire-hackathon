"use client";
import { useRouter } from "next/navigation";
import { ROLES, DIMENSIONS, type Role } from "@rvr/contract";
import { MenuBar, type Menus } from "@/components/MenuBar";
import { Window } from "@/components/Window";
import { Sprite } from "@/components/Sprite";

const CREW: Record<Role, { model: string; does: string }> = {
  orchestrator: { model: "sonnet", does: "clones, installs, chunks, spawns the rest" },
  explorer: { model: "haiku ×24", does: "reads one chunk, returns file, line, quote" },
  claims: { model: "haiku", does: "README claim: delivered, partial or missing" },
  compiler: { model: "sonnet", does: "builds it: time, size, warnings" },
  runner: { model: "sonnet", does: "runs the tests, hits the endpoints" },
  git: { model: "no model", does: "git blame: who wrote which chunk" },
  classifier: { model: "haiku", does: "drops any finding the quote does not support" },
  writer: { model: "sonnet", does: "one sentence per dimension, must cite a file" },
};
const SAMPLE: Record<string, number> = { claims: 16, runs: 14, compiles: 7, quality: 13, architecture: 9, tests: 10, dead_code: 4, security: 3, docs: 4 };

export default function Pitch() {
  const router = useRouter();
  const menus: Menus = {
    File: [{ label: "Run it live", onClick: () => router.push("/") }, { label: "Run the demo", onClick: () => router.push("/run/demo") }],
    Edit: [{ label: "Copy site URL", onClick: () => { navigator.clipboard?.writeText(window.location.origin).catch(() => {}); } }],
    Special: [{ label: "About README vs Reality", onClick: () => router.push("/") }],
  };
  const R = 37, C = 2 * Math.PI * R, arc = C * 0.75;
  return (
    <div className="desk">
      <MenuBar menus={menus} title="README vs Reality" />
      <div className="pitch">
        <Window title="01 · The goal" className="p1" tip="the problem, and who benefits">
          <p className="huge">Every README<br />is a pitch deck.</p>
          <div className="vs">
            <div className="readme" data-tip="what the README says">
              <div className="h">README.md</div>
              <div><span className="st delivered">delivered</span> one-command install</div>
              <div><span className="st partial">partial</span> OAuth with Google and GitHub</div>
              <div><span className="st missing">missing</span> plugin system with hot reload</div>
              <div><span className="st partial">partial</span> 100% test coverage</div>
            </div>
            <div className="arrow" aria-hidden="true">→</div>
            <div className="num" data-tip="every point traces to a file, a line and a quote">
              <div className="big">80</div>
              <div className="sub">/100, with receipts</div>
            </div>
          </div>
          <div className="who">
            <div data-tip="technical diligence before the term sheet"><span className="ico">VC</span>diligence</div>
            <div data-tip="the repo is the only honest signal of skill left"><span className="ico">HR</span>hiring</div>
            <div data-tip="the leaderboard says who did the work"><span className="ico">&lt;/&gt;</span>the engineer</div>
          </div>
          <div className="stats">
            <div data-tip="what an associate spends on one repo"><b>2 days</b><span>associate</span></div>
            <div data-tip="one run on Cloud Run"><b>4 min</b><span>the crew</span></div>
            <div data-tip="Haiku explorers, cached prompts, Opus plans the split"><b>&lt;£1</b><span>per repo</span></div>
          </div>
        </Window>

        <Window title="02 · The crew" className="p2" tip="hover a sprite for its job">
          <div className="flow">
            <div className="box job" data-tip="one disposable container per repo">
              <div className="h">Cloud Run job</div>
              <div className="sprites">
                {ROLES.filter((r) => r !== "writer").map((r) => (
                  <div key={r} className="sp" data-tip={`${CREW[r].does} (${CREW[r].model})`}>
                    <Sprite role={r} frame="idle" scale={r === "orchestrator" ? 2 : 2.5} />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="arrow" aria-hidden="true">→</div>
            <div className="box svc" data-tip="always on, holds every run">
              <div className="h">Cloud Run service</div>
              <div className="sprites">
                <div className="sp" data-tip="computes the score from findings with a fixed rubric. No agent is asked for a number"><span className="scorer">100</span><span>scorer</span></div>
                <div className="sp" data-tip={`${CREW.writer.does} (${CREW.writer.model})`}><Sprite role="writer" frame="idle" scale={2.5} /><span>writer</span></div>
              </div>
            </div>
            <div className="arrow" aria-hidden="true">→</div>
            <div className="box phones" data-tip="one URL, every phone sees the same run">
              <div className="h">every phone</div>
              <div className="phone"><div className="pscreen" /></div>
            </div>
          </div>
          <div className="legend">findings only, never a score · file · line · quote</div>
        </Window>

        <Window title="03 · The result" className="p3" tip="open the deliverable">
          <div className="result">
            <svg viewBox="0 0 92 92" aria-hidden="true" className="dial">
              <rect x="1" y="1" width="90" height="90" fill="none" stroke="#141414" strokeWidth="2" />
              <circle cx="46" cy="46" r={R} fill="none" stroke="#fff" strokeWidth="9" strokeDasharray={`${arc} ${C}`} transform="rotate(135 46 46)" />
              <circle cx="46" cy="46" r={R} fill="none" stroke="#141414" strokeWidth="9" strokeDasharray={`${arc * 0.8} ${C}`} transform="rotate(135 46 46)" />
              <text x="46" y="52" textAnchor="middle" fontSize="20" fontFamily="var(--display)" fill="#141414">80</text>
            </svg>
            <div className="bars">
              {DIMENSIONS.map(({ key, max, label }) => (
                <div key={key} className="mini" data-tip={`${label}: ${SAMPLE[key]} of ${max}`}>
                  <span>{label}</span><span className="bar"><i style={{ width: `${(100 * SAMPLE[key]) / max}%` }} /></span>
                </div>
              ))}
            </div>
          </div>
          <div className="receipt" data-tip="this is what a point looks like"><span className="loc">src/api/auth.ts:42</span> <span className="sev major">major</span><div className="q">const token = req.query.token as string</div></div>
          <div className="ctas">
            <button type="button" onClick={() => router.push("/")} data-tip="a real run on Cloud Run">run it live</button>
            <button type="button" onClick={() => router.push("/run/demo")} data-tip="a recorded run, replayed in the browser">run the demo</button>
          </div>
        </Window>

        <Window title="04 · The autonomy" className="p4" tip="what ran itself, where a human touched it">
          <div className="auto">
            <div>
              <div className="h">ran itself</div>
              <ul>{["clone", "install", "chunk", "explore", "compile", "run", "claims", "blame", "score", "report"].map((w) => <li key={w}><span className="tick">✓</span>{w}</li>)}</ul>
            </div>
            <div>
              <div className="h">a human</div>
              <ul>
                <li><span className="hand">✋</span>pastes the URL</li>
                <li><span className="hand">✋</span>picked 3 demo repos</li>
                <li><span className="hand">✋</span>&ldquo;demo&rdquo; = a recording</li>
              </ul>
              <div className="lid" data-tip="close the laptops, the service keeps the run">
                <div className="lap" /><span>lid closed · still running</span>
              </div>
            </div>
          </div>
        </Window>
        <Window title="Why not just hand the repo to an agent?" className="p5" tip="three reasons, hover for the argument">
          <div className="why">
            <div data-tip="one rubric, computed by code from findings. Same 100 for every repo, so a portfolio or a pipeline ranks on the same scale. An agent gives a different essay every time.">
              <div className="fig ruler">
                <div className="r"><span>repo A</span><i style={{ width: "80%" }} /></div>
                <div className="r"><span>repo B</span><i style={{ width: "52%" }} /></div>
                <div className="r"><span>repo C</span><i style={{ width: "67%" }} /></div>
              </div>
              <div className="h">comparable</div>
              <div className="l">one rubric, every repo, same scale</div>
            </div>
            <div data-tip="it clones, builds and runs the code in a sandbox; every finding is a file, a line and a verbatim quote; a validator drops files that do not exist and a second model drops findings the quote does not support. Rerun it and get the same number.">
              <div className="fig receipt2">
                <span className="loc">src/api/auth.ts:42</span>
                <span className="tick">✓</span>
              </div>
              <div className="h">verifiable</div>
              <div className="l">ran it, quoted it, rerunnable</div>
            </div>
            <div data-tip="every run writes memory: install recipes per ecosystem, classifier rejections, scores by repo and commit. The thousandth repo scores faster, cheaper, and against a percentile of everything scored before. An agent chat forgets.">
              <div className="fig stairs" aria-hidden="true"><i /><i /><i /><i /><i /></div>
              <div className="h">compounds</div>
              <div className="l">every run teaches the next</div>
            </div>
          </div>
        </Window>
      </div>
    </div>
  );
}
