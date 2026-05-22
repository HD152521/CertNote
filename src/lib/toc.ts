// 본문에서 H2/H3 추출 → 우측 TOC.
// rehype-slug와 동일한 슬러그 규칙(영숫자/한글/공백→하이픈)을 흉내냅니다.

export interface TocItem {
  depth: 2 | 3;
  text: string;
  id: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

export function buildToc(markdown: string): TocItem[] {
  const out: TocItem[] = [];
  const lines = markdown.split(/\r?\n/);
  let inCode = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m2 = line.match(/^##\s+(.+?)\s*$/);
    if (m2) {
      const text = m2[1].replace(/^[^\p{L}\p{N}]+/u, '').trim();
      out.push({ depth: 2, text, id: slugify(m2[1]) });
      continue;
    }
    const m3 = line.match(/^###\s+(.+?)\s*$/);
    if (m3) {
      const text = m3[1].replace(/^[^\p{L}\p{N}]+/u, '').trim();
      out.push({ depth: 3, text, id: slugify(m3[1]) });
    }
  }
  return out;
}
