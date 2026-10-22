"use client";
import { QRCodeSVG } from "qrcode.react";

export function StickyNote({ url, stage }: { url: string; stage: boolean }) {
  return (
    <aside className="note">
      <b>note to self</b>
      <div>run URL on every phone</div>
      <div className="url">{url.replace(/^https?:\/\//, "")}</div>
      {stage && url && <div className="qr"><QRCodeSVG value={url} size={120} level="M" /></div>}
      <button type="button" onClick={() => { navigator.clipboard?.writeText(url).catch(() => {}); }}>copy link</button>
    </aside>
  );
}
