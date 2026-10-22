"use client";
import { QRCodeSVG } from "qrcode.react";

export function StickyNote({ url, stage, onCopy }: { url: string; stage: boolean; onCopy: () => void }) {
  return (
    <aside className="note">
      <b>note to self</b>
      <div>run URL on every phone</div>
      <div className="url">{url.replace(/^https?:\/\//, "")}</div>
      {stage && url && <div className="qr" data-tip="scan to open this run on your phone"><QRCodeSVG value={url} size={120} level="M" /></div>}
      <button type="button" onClick={onCopy} data-tip="copies the run URL">copy link</button>
    </aside>
  );
}
