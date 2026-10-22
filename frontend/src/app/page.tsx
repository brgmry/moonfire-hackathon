"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MenuBar } from "@/components/MenuBar";
import { MacFrame } from "@/components/Mac";
import { Window } from "@/components/Window";
import { createRun } from "@/lib/api";

export default function Home() {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!/^https?:\/\/github\.com\/[^/]+\/[^/]+/.test(url.trim())) { setErr("paste a github.com/owner/repo URL"); return; }
    setBusy(true); setErr("");
    try { router.push(`/run/${await createRun(url.trim())}`); }
    catch (x) { setErr(`backend unreachable: ${(x as Error).message}`); setBusy(false); }
  }
  return (
    <div className="desk">
      <MenuBar />
      <div className="grid">
        <MacFrame>
          <div className="screen"><div className="boot">README vs Reality 1.0<br />&gt; waiting for a repo <span className="cur" /></div></div>
        </MacFrame>
        <Window title="Paste a GitHub repo" className="home score">
          <form onSubmit={go}>
            <label htmlFor="repo" className="empty">every README is a pitch deck. we read the code, build it, run it, score it.</label>
            <input id="repo" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" autoComplete="off" />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={busy}>{busy ? "cloning…" : "go"}</button>
              <button type="button" onClick={() => router.push("/run/demo")}>run the demo</button>
            </div>
            {err && <div className="err">{err}</div>}
          </form>
        </Window>
      </div>
    </div>
  );
}
