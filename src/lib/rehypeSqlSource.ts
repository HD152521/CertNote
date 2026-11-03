// rehype-pretty-code 가 ```sql 블록을 색칠한 뒤, 원래 SQL 문장을 figure 의 data-sql 속성에 남긴다.
// Article 이 SQLD 노트에서 이 속성을 보고 "실습장에서 실행" 버튼을 붙인다(SqlRunBlock).
// 색칠된 줄(span)에서 글자만 모으면 원문과 같다 — 줄 사이는 rehype-pretty-code 가 넣은 줄바꿈 글자다.

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

// rehype-pretty-code 는 속성 이름을 'data-language' 처럼 그대로 쓰고, 다른 플러그인은 dataLanguage 로 쓴다. 둘 다 본다.
const prop = (n: HastNode | undefined, kebab: string, camel: string) => n?.properties?.[kebab] ?? n?.properties?.[camel];

function visit(node: HastNode) {
  for (const child of node.children ?? []) {
    if (child.type === 'element' && child.tagName === 'figure' && prop(child, 'data-rehype-pretty-code-figure', 'dataRehypePrettyCodeFigure') !== undefined) {
      const pre = child.children?.find((c) => c.tagName === 'pre');
      if (prop(pre, 'data-language', 'dataLanguage') === 'sql') {
        const code = pre?.children?.find((c) => c.tagName === 'code');
        if (code && child.properties) child.properties['data-sql'] = textOf(code).replace(/\n+$/, '');
      }
      continue;
    }
    visit(child);
  }
}

export function rehypeSqlSource() {
  return (tree: HastNode) => visit(tree);
}
