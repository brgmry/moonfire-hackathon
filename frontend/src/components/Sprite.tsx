"use client";
import { ROLE_ACCENT, type Role } from "@rvr/contract";

/* Placeholder pixel figures, one hat per role. Swapped for assets/avatars sprites when they land. */
const BODY: [number, number][] = [[2,4],[4,4],[6,4],[8,4],[2,6],[4,6],[6,6],[8,6],[2,8],[4,8],[6,8],[8,8],[2,10],[8,10],[4,12],[6,12]];
const EYES: [number, number][] = [[4,6],[8,6]];
const HAT: Record<Role, [number, number][]> = {
  orchestrator: [[2,0],[6,0],[10,0],[2,2],[4,2],[6,2],[8,2],[10,2]],
  explorer: [[10,2],[12,0]],
  compiler: [[2,2],[4,2],[6,2],[8,2],[10,2]],
  runner: [[10,8],[12,8]],
  claims: [[0,2],[0,4],[0,6]],
  git: [[4,2],[6,2]],
  classifier: [[4,2],[6,2],[8,2],[10,4]],
  writer: [[10,2],[12,2]],
};

export function Sprite({ role, className = "", style, title }: { role: Role; className?: string; style?: React.CSSProperties; title?: string }) {
  return (
    <div className={`av ${className}`} style={{ ...style, ["--acc" as string]: ROLE_ACCENT[role] }} title={title} aria-label={title}>
      {BODY.map(([x, y]) => <i key={`b${x}${y}`} className="px" style={{ left: x, top: y }} />)}
      {EYES.map(([x, y]) => <i key={`e${x}${y}`} className="eye" style={{ left: x, top: y }} />)}
      {HAT[role].map(([x, y]) => <i key={`h${x}${y}`} className="hat" style={{ left: x, top: y }} />)}
    </div>
  );
}
