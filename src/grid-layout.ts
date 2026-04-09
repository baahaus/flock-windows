export interface GridConfig {
  columns: string;
  rows: string;
  areas: string[]; // per-pane: "row-start / col-start / row-end / col-end"
}

/**
 * Calculate CSS grid template columns/rows and per-pane grid-area values.
 *
 * Layout mirrors macOS Flock:
 *   0-1 pane : 1x1 (single cell fills everything)
 *   2 panes  : 2 cols, 1 row  (side by side)
 *   3 panes  : 2 cols, 2 rows (left spans both rows; right stacked top/bottom)
 *   4 panes  : 2x2 grid
 *   5-6      : 3 cols, 2 rows
 *   7+       : 3x3 grid
 */
export function calculateGrid(count: number): GridConfig {
  if (count <= 0) {
    return {
      columns: "1fr",
      rows: "1fr",
      areas: [],
    };
  }

  if (count === 1) {
    return {
      columns: "1fr",
      rows: "1fr",
      areas: ["1 / 1 / 2 / 2"],
    };
  }

  if (count === 2) {
    return {
      columns: "1fr 1fr",
      rows: "1fr",
      areas: [
        "1 / 1 / 2 / 2", // pane 0: left
        "1 / 2 / 2 / 3", // pane 1: right
      ],
    };
  }

  if (count === 3) {
    // Left pane spans both rows; right two panes stack on right column
    return {
      columns: "1fr 1fr",
      rows: "1fr 1fr",
      areas: [
        "1 / 1 / 3 / 2", // pane 0: left, spans rows 1-2
        "1 / 2 / 2 / 3", // pane 1: top-right
        "2 / 2 / 3 / 3", // pane 2: bottom-right
      ],
    };
  }

  if (count === 4) {
    // 2x2 grid
    return {
      columns: "1fr 1fr",
      rows: "1fr 1fr",
      areas: [
        "1 / 1 / 2 / 2", // top-left
        "1 / 2 / 2 / 3", // top-right
        "2 / 1 / 3 / 2", // bottom-left
        "2 / 2 / 3 / 3", // bottom-right
      ],
    };
  }

  if (count <= 6) {
    // 3 cols x 2 rows -- fill left-to-right, top-to-bottom
    const areas: string[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 3) + 1;
      const col = (i % 3) + 1;
      areas.push(`${row} / ${col} / ${row + 1} / ${col + 1}`);
    }
    return {
      columns: "1fr 1fr 1fr",
      rows: "1fr 1fr",
      areas,
    };
  }

  // 7+: 3x3 grid
  const areas: string[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 3) + 1;
    const col = (i % 3) + 1;
    areas.push(`${row} / ${col} / ${row + 1} / ${col + 1}`);
  }
  return {
    columns: "1fr 1fr 1fr",
    rows: "1fr 1fr 1fr",
    areas,
  };
}
