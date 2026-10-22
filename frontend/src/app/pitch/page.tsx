"use client";
import { useRouter } from "next/navigation";
import { ROLES, type Role } from "@rvr/contract";
import { MenuBar, type Menus } from "@/components/MenuBar";
import { Window } from "@/components/Window";
import { Sprite } from "@/components/Sprite";

const CREW: Record<Role, { model: string; where: string; does: string }> = {
  orchestrator: { model: "Sonnet 5.5", where: "Cloud Run job", does: "clones the repo, installs it, splits it into chunks, spawns everyone else" },
  explorer: { model: "Haiku 5.5, up to 24 at once", where: "Cloud Run job", does: "reads one chunk, returns findings as file, line, verbatim quote, no prose" },
  claims: { model: "Haiku 5.5", where: "Cloud Run job", does: "lists every README claim, marks it delivered, partial or missing against the code" },
  compiler: { model: "Sonnet 5.5", where: "Cloud Run job", does: "builds it, reports time, size and warnings" },
  runner: { model: "Sonnet 5.5", where: "Cloud Run job", does: "runs the tests or hits the documented endpoints" },
  git: { model: "no model", where: "Cloud Run job", does: "git blame and shortlog, bots dropped, who wrote which chunk" },
  classifier: { model: "Haiku 5.5", where: "Cloud Run job", does: "re-labels every finding from fixed enums, drops any the quote does not support" },
  writer: { model: "Sonnet 5.5", where: "Cloud Run service", does: "one sentence per dimension, each must cite a file or it is cut" },
};

export default function Pitch() {
  const router = useRouter();
  const menus: Menus = {
    File: [{ label: "Run it live", onClick: () => router.push("/") }, { label: "Run the demo", onClick: () => router.push("/run/demo") }],
    Edit: [{ label: "Copy site URL", onClick: () => { navigator.clipboard?.writeText(window.location.origin).catch(() => {}); } }],
    Special: [{ label: "About README vs Reality", onClick: () => router.push("/") }],
  };
  return (
    <div className="desk">
      <MenuBar menus={menus} title="README vs Reality" />
      <div className="pitch">
        <Window title="01 · The goal" className="p1" tip="explain the problem and who benefits">
          <p className="big">Every README is a pitch deck.</p>
          <p>A VC gets a repo link and a README full of claims. The associate has two days and no way to tell shipped from promised, or good code from generated code.</p>
          <p><b>Who benefits.</b> Investors doing technical diligence: call the bullshit on the tech before the term sheet. Anyone hiring or acquiring engineers: the repo is the only honest signal left, and in the AI age you cannot tell good from plausible by reading it. The engineer who actually did the work: the leaderboard says so.</p>
          <p><b>The result is a number with receipts.</b> A score out of 100 where every point traces to a file, a line and a quote, and a leaderboard of who wrote what.</p>
        </Window>

        <Window title="02 · The crew" className="p2" tip="the agents, their roles, and where they actually run">
          <p>One Cloud Run job per repo. The orchestrator spawns the crew inside it; every agent streams events to a Cloud Run service that holds the run, computes the score and fans it out to every phone with the URL.</p>
          <div className="crew">
            {ROLES.map((r) => (
              <div key={r} className="crewrow" data-tip={CREW[r].does}>
                <Sprite role={r} frame="idle" scale={r === "orchestrator" ? 1.5 : 2} />
                <div>
                  <div className="role">{r} <span className="empty">{CREW[r].model} · {CREW[r].where}</span></div>
                  <div className="does">{CREW[r].does}</div>
                </div>
              </div>
            ))}
            <div className="crewrow" data-tip="no model, pure arithmetic">
              <div className="scorer" aria-hidden="true">100</div>
              <div>
                <div className="role">scorer <span className="empty">no model · Cloud Run service</span></div>
                <div className="does">computes the 100 from findings with a fixed rubric. No agent is ever asked for a number.</div>
              </div>
            </div>
          </div>
        </Window>

        <Window title="03 · The result" className="p3" tip="open the deliverable and show it works">
          <p>Paste a repo. Watch the crew in the Mac. Tap any score row and read the evidence: the README line, the file, the quote. Then the leaderboard: who wrote the best chunk and who wrote the dead code.</p>
          <div className="ctas">
            <button type="button" onClick={() => router.push("/")} data-tip="a real run on Cloud Run">run it live</button>
            <button type="button" onClick={() => router.push("/run/demo")} data-tip="a recorded run, replayed in the browser">run the demo</button>
          </div>
        </Window>

        <Window title="04 · The autonomy" className="p4" tip="what ran automatically, and where a human touched it">
          <p><b>Ran automatically:</b> everything after the URL. Clone, install, chunking, exploration, compile, run, claims, blame, scoring, the report, and the second run of the same repo from memory. Nobody approves anything.</p>
          <p><b>Human intervention, disclosed:</b> a person pastes the URL. We chose three demo repos in advance and tested them. &ldquo;Run the demo&rdquo; replays a recorded run in the browser and never touches the backend.</p>
          <p><b>Still running when we close the laptops.</b> The service keeps the run; reopen the URL and it is there.</p>
        </Window>
      </div>
    </div>
  );
}
