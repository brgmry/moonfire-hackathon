import type { RunState } from "@rvr/contract";
import { Window } from "./Window";

export function Leaderboard({ state }: { state: RunState }) {
  const c = state.contributors;
  const pathOf = (id: string) => state.chunks.find((x) => x.id === id)?.path ?? id;
  const majors = (id: string) => state.findings.filter((f) => f.valid && f.chunkId === id && f.severity === "major").length;
  return (
    <Window title="Leaderboard" className="board">
      {!c && <div className="empty">git blame runs after the explorers land</div>}
      {c && (
        <>
          <table>
            <thead><tr><th>author</th><th>commits</th><th>lines</th><th>owns</th></tr></thead>
            <tbody>
              {c.authors.slice().sort((a, b) => b.lines - a.lines).map((a) => (
                <tr key={a.email || a.name}>
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
