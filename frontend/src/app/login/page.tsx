"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MacFrame } from "@/components/Mac";
import { Window } from "@/components/Window";

function Form() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) { router.replace(/^\/(?![/\\])/.test(next) ? next : "/"); router.refresh(); } else setErr("wrong password");
  };
  return (
    <form className="login" onSubmit={submit}>
      <label htmlFor="pw">Password</label>
      <input id="pw" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <button type="submit" disabled={busy || !pw}>{busy ? "…" : "Open"}</button>
      {err && <div className="err" role="alert">{err}</div>}
    </form>
  );
}

export default function Login() {
  return (
    <div className="desk">
      <div className="menubar"><span className="logo" aria-hidden="true" /><span>README vs Reality</span></div>
      <div className="loginwrap">
        <div className="loginmac"><MacFrame><div className="screen off locked" aria-hidden="true">🔒</div></MacFrame></div>
        <Window title="Private build" className="home" tip="for the team: unlocks real runs. Everything else on the site is open.">
          <Suspense><Form /></Suspense>
        </Window>
      </div>
    </div>
  );
}
