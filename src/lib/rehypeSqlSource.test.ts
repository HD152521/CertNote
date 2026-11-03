import { describe, expect, test } from 'vitest';
import { rehypeSqlSource } from './rehypeSqlSource';

type Node = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Node[] };

const line = (text: string): Node => ({ type: 'element', tagName: 'span', properties: { 'data-line': '' }, children: [{ type: 'text', value: text }] });
const figure = (lang: string, lines: string[], kebab = true): Node => ({
  type: 'element',
  tagName: 'figure',
  properties: kebab ? { 'data-rehype-pretty-code-figure': '' } : { dataRehypePrettyCodeFigure: '' },
  children: [
    {
      type: 'element',
      tagName: 'pre',
      properties: kebab ? { 'data-language': lang } : { dataLanguage: lang },
      children: [{ type: 'element', tagName: 'code', children: lines.flatMap((l, i) => (i ? [{ type: 'text', value: '\n' }, line(l)] : [line(l)])) }],
    },
  ],
});

describe('rehypeSqlSource', () => {
  test('sql 블록의 원문을 data-sql 에 남긴다(속성 이름 두 형태 모두)', () => {
    for (const kebab of [true, false]) {
      const fig = figure('sql', ['SELECT ENAME', 'FROM EMP;'], kebab);
      rehypeSqlSource()({ type: 'root', children: [{ type: 'element', tagName: 'div', children: [fig] }] });
      expect(fig.properties?.['data-sql']).toBe('SELECT ENAME\nFROM EMP;');
    }
  });

  test('sql 이 아닌 블록은 건드리지 않는다', () => {
    const fig = figure('bash', ['ls -l']);
    rehypeSqlSource()({ type: 'root', children: [fig] });
    expect(fig.properties?.['data-sql']).toBeUndefined();
  });
});
