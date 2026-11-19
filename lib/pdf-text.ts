/**
 * Rebuild readable lines from a PDF's positioned text pieces. PDFs store
 * text as pieces placed on the page; joining them in file order runs
 * columns together ("PSTAT 8Transition4.0A-"). Grouping by line and
 * spacing by gap keeps the "code  title  units  grade" layout the
 * transcript reader expects.
 */
export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

export function itemsToLines(items: TextItem[]): string {
  const rows: { y: number; items: TextItem[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const tol = Math.max(2, it.fontSize * 0.4);
    const row = rows.find((r) => Math.abs(r.y - it.y) <= tol);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  // PDF y grows upward, so higher y is earlier on the page.
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => {
      const sorted = r.items.sort((a, b) => a.x - b.x);
      let line = "";
      let end = -Infinity;
      for (const it of sorted) {
        const gap = it.x - end;
        const size = it.fontSize || 10;
        if (line) line += gap > size * 1.2 ? "  " : gap > size * 0.15 ? " " : "";
        line += it.str.trim();
        end = it.x + it.width;
      }
      return line;
    })
    .join("\n");
}
