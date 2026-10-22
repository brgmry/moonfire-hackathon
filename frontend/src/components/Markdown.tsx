/* Tiny markdown: headings, pipe tables, paragraphs. Enough for the writer's report. */
export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith("#")) { const level = Math.min(3, l.match(/^#+/)![0].length); const t = l.replace(/^#+\s*/, ""); out.push(level === 1 ? <h3 key={i}>{t}</h3> : <h4 key={i}>{t}</h4>); i++; continue; }
    if (l.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()); if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells); i++; }
      out.push(<table key={`t${i}`} className="md"><thead><tr>{rows[0]?.map((c, k) => <th key={k}>{c}</th>)}</tr></thead><tbody>{rows.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].trim().startsWith("|")) para.push(lines[i++]);
    out.push(<p key={`p${i}`}>{para.join(" ").replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1")}</p>);
  }
  return <>{out}</>;
}
