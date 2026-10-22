export function MacFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="macwrap" aria-label="A compact Macintosh. Its screen shows the sandbox: a treemap of the repo and the agents working on it.">
      <svg viewBox="0 0 400 480" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="40" y="10" width="320" height="372" fill="#c9bca1" />
        <rect x="46" y="16" width="308" height="360" fill="#e4d9c3" />
        <rect x="52" y="46" width="296" height="236" fill="#2a2724" />
        <rect x="58" y="52" width="284" height="222" fill="#0b0d0b" />
        <rect x="70" y="300" width="60" height="14" fill="#c9bca1" />
        <rect x="250" y="300" width="90" height="10" fill="#2a2724" />
        <rect x="254" y="303" width="82" height="4" fill="#0b0d0b" />
        <rect x="70" y="330" width="40" height="22" fill="#c9bca1" />
        <rect x="74" y="334" width="32" height="14" fill="#e4d9c3" />
        <rect x="46" y="376" width="308" height="22" fill="#c9bca1" />
        <rect x="60" y="398" width="280" height="26" fill="#e4d9c3" />
        <rect x="60" y="424" width="280" height="6" fill="#c9bca1" />
        <rect x="120" y="440" width="160" height="12" fill="#a99d85" />
        <rect x="100" y="452" width="200" height="18" fill="#e4d9c3" />
        <rect x="100" y="470" width="200" height="4" fill="#c9bca1" />
        <rect x="314" y="20" width="30" height="12" fill="#c9bca1" />
      </svg>
      {children}
    </div>
  );
}
