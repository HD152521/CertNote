// --output json | text | table 렌더러. AWS CLI v2 의 모양을 따르되, 연습에 필요한 경우만 다룬다
// (중첩 표는 한 단계까지, 객체 안의 빈 배열·중첩 객체는 표에서 생략).

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type OutputFormat = 'json' | 'text' | 'table';
export const OUTPUT_FORMATS: readonly OutputFormat[] = ['json', 'text', 'table'];

function isScalar(v: unknown): v is string | number | boolean | null {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function isPlainObject(v: unknown): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function scalarText(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return String(v);
}

export function formatOutput(value: unknown, format: OutputFormat, title: string): string {
  if (value === undefined) return '';
  if (format === 'json') return JSON.stringify(value, null, 4);
  if (format === 'text') return textLines(value).join('\n');
  return renderTable(value, title);
}

// ---------- text ----------

function textLines(value: unknown, label?: string): string[] {
  if (isScalar(value)) return [scalarText(value)];
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return [value.map(scalarText).join('\t')];
    return value.flatMap((item) => textLines(item, label));
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const scalars = keys.filter((k) => isScalar(value[k]));
    const lines: string[] = [];
    if (scalars.length) {
      const row = scalars.map((k) => scalarText(value[k]));
      lines.push(label ? [label.toUpperCase(), ...row].join('\t') : row.join('\t'));
    }
    for (const k of keys) {
      if (!isScalar(value[k])) lines.push(...textLines(value[k], k));
    }
    return lines;
  }
  return [];
}

// ---------- table ----------

interface TableNode {
  title?: string;
  header?: string[];
  rows: string[][];
  children: TableNode[];
}

function buildNode(value: unknown, title?: string): TableNode {
  if (isScalar(value)) return { title, rows: [[scalarText(value)]], children: [] };
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return { title, rows: value.map((v) => [scalarText(v)]), children: [] };
    if (value.every(Array.isArray)) {
      return { title, rows: value.map((row) => (row as unknown[]).map(scalarText)), children: [] };
    }
    const objects = value.filter(isPlainObject);
    const keys = [...new Set(objects.flatMap((o) => Object.keys(o).filter((k) => isScalar(o[k]))))].sort();
    return { title, header: keys, rows: objects.map((o) => keys.map((k) => (k in o ? scalarText(o[k]) : ''))), children: [] };
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const scalarKeys = keys.filter((k) => isScalar(value[k]));
    const children = keys
      .filter((k) => !isScalar(value[k]) && !(Array.isArray(value[k]) && (value[k] as Json[]).length === 0))
      .map((k) => buildNode(value[k], k));
    if (!scalarKeys.length) return { title, rows: [], children };
    return { title, header: scalarKeys, rows: [scalarKeys.map((k) => scalarText(value[k]))], children };
  }
  return { title, rows: [], children: [] };
}

const CELL_PAD = 4; // 칸 양옆 두 칸씩

function columnWidths(node: TableNode): number[] {
  const cols = Math.max(node.header?.length ?? 0, ...node.rows.map((r) => r.length), 0);
  return Array.from({ length: cols }, (_, i) =>
    Math.max(node.header?.[i]?.length ?? 0, ...node.rows.map((r) => r[i]?.length ?? 0)) + CELL_PAD,
  );
}

function naturalWidth(node: TableNode): number {
  const widths = columnWidths(node);
  const grid = widths.length ? widths.reduce((a, b) => a + b, 0) + widths.length + 1 : 0;
  const titleW = node.title ? node.title.length + 4 : 0;
  const childW = node.children.map((c) => naturalWidth(c) + 2);
  return Math.max(titleW, grid, ...childW, 0);
}

function center(text: string, width: number): string {
  const left = Math.floor((width - text.length) / 2);
  return ' '.repeat(Math.max(left, 0)) + text + ' '.repeat(Math.max(width - text.length - left, 0));
}

function renderNode(node: TableNode, width: number, isRoot: boolean): string[] {
  const lines: string[] = [];
  if (isRoot) lines.push('-'.repeat(width));
  if (node.title) lines.push(`|${center(node.title, width - 2)}|`);

  const widths = columnWidths(node);
  if (widths.length) {
    const used = widths.reduce((a, b) => a + b, 0) + widths.length + 1;
    widths[widths.length - 1] += width - used;
    const sep = `+${widths.map((w) => '-'.repeat(w)).join('+')}+`;
    lines.push(sep);
    if (node.header) {
      lines.push(`|${node.header.map((h, i) => center(h, widths[i])).join('|')}|`);
      lines.push(sep);
    }
    for (const row of node.rows) {
      lines.push(`|${widths.map((w, i) => `  ${(row[i] ?? '').padEnd(w - 2)}`).join('|')}|`);
    }
    lines.push(sep);
  } else if (node.title) {
    lines.push(`+${'-'.repeat(width - 2)}+`);
  }

  for (const child of node.children) {
    lines.push(...renderNode(child, width - 2, false).map((l) => `|${l}|`));
  }
  return lines;
}

function renderTable(value: unknown, title: string): string {
  const root = buildNode(value, title);
  return renderNode(root, naturalWidth(root), true).join('\n');
}
