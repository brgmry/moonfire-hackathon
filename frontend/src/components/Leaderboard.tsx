import type { RunState } from "@rvr/contract";
import { Window } from "./Window";

export function Leaderboard({ state, onAuthor, onClose }: { state: RunState; onAuthor?: (chunkIds: string[]) => void; onClose?: () => void }) {
  const c = state.contributors;
  const pathOf = (id: string) => state.chunks.find((x) => x.id === id)?.path ?? id;
  const majors = (id: string) => state.findings.filter((f) => f.valid && f.chunkId === id && f.severity === "major").length;
  return (
    <Window title="Leaderboard" className="board" id="win-board" onClose={onClose} tip="git blame, bots dropped, lines that survive in HEAD">
      {!c && <div className="empty">git blame runs after the explorers land</div>}
      {c && (
        <>
          <table>
            <thead><tr><th>author</th><th>commits</th><th>lines</th><th>owns</th></tr></thead>
            <tbody>
              {Object.values(c.authors.reduce<Record<string, typeof c.authors[number]>>((acc, a) => {
                const k = a.name.trim().toLowerCase();
                const prev = acc[k];
                acc[k] = prev ? { ...prev, commits: prev.commits + a.commits, lines: prev.lines + a.lines, chunks: Object.entries(a.chunks).reduce((m, [id, n]) => ({ ...m, [id]: (m[id] ?? 0) + n }), { ...prev.chunks }) } : a;
                return acc;
              }, {})).sort((a, b) => b.lines - a.lines).map((a) => (
                <tr key={a.email || a.name} className="clickable" onClick={() => onAuthor?.(Object.keys(a.chunks))} data-tip={`${a.name}: ${a.commits} commits, ${a.lines} surviving lines. click to see their chunk`}>
                  <td>{a.name}</td><td className="n">{a.commits}</td><td className="n">{a.lines}</td>
                  <td>{Object.keys(a.chunks).map((id) => `${pathOf(id)}${majors(id) ? ` (${majors(id)} major)` : ""}`).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.truncated && <div className="empty" style={{ marginTop: 6 }}>history truncated at clone depth</div>}
          {c.fork && <div className="empty" style={{ marginTop: 6 }}>fork: upstream authors included</div>}
        </>
      )}
    </Window>
  );
}
