import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "README vs Reality";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(#8fbfe8, #d9e9f7)", fontFamily: "monospace", color: "#141414" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 44, background: "#f4f1ec", borderBottom: "4px solid #141414", display: "flex", alignItems: "center", padding: "0 28px", fontSize: 22, gap: 36 }}>
          <div style={{ width: 20, height: 20, background: "#141414" }} />
          <span>README vs Reality</span><span>File</span><span>Edit</span><span>Special</span>
        </div>
        <div style={{ position: "absolute", left: 90, top: 120, width: 420, height: 440, background: "#e4d9c3", border: "8px solid #141414", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 36 }}>
          <div style={{ width: 300, height: 210, background: "#0b0d0b", border: "10px solid #2a2724", display: "flex", alignItems: "flex-end", padding: 14, color: "#c9f2c0", fontSize: 22 }}>&gt; scoring 80 / 100</div>
          <div style={{ marginTop: 44, width: 110, height: 14, background: "#2a2724" }} />
        </div>
        <div style={{ position: "absolute", left: 580, top: 140, width: 540, background: "#f4f1ec", border: "6px solid #141414", boxShadow: "10px 10px 0 #141414", padding: "28px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 54, fontWeight: 700, lineHeight: 1.05 }}>Every README is a pitch deck.</div>
          <div style={{ fontSize: 28, lineHeight: 1.3 }}>A crew of agents reads the code, builds it, runs it and scores it out of 100.</div>
          <div style={{ fontSize: 22, color: "#555" }}>readme-vs-reality.vercel.app</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
