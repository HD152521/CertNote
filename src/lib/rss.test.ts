import { describe, expect, test } from 'vitest';
import { buildRss, escapeXml, sortByRecent, type RssItem } from './rss';

const item = (title: string, date?: string): RssItem => ({
  title,
  link: `https://example.com/${title}`,
  description: `${title} 설명`,
  ...(date ? { pubDate: new Date(date) } : {}),
});

describe('escapeXml', () => {
  test('escapes the five XML special characters', () => {
    expect(escapeXml(`A&B <c> "d" 'e'`)).toBe('A&amp;B &lt;c&gt; &quot;d&quot; &apos;e&apos;');
  });
});

describe('sortByRecent', () => {
  test('puts the newest first and undated items last in original order', () => {
    const sorted = sortByRecent([item('none1'), item('old', '2026-01-01'), item('none2'), item('new', '2026-10-01')]);
    expect(sorted.map((i) => i.title)).toEqual(['new', 'old', 'none1', 'none2']);
  });
});

describe('buildRss', () => {
  const xml = buildRss({
    title: 'Site & Notes',
    link: 'https://example.com',
    description: '설명',
    language: 'ko',
    items: sortByRecent([item('a', '2026-10-01T00:00:00Z'), item('b')]),
  });

  test('declares RSS 2.0 with an escaped channel title', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">')).toBe(true);
    expect(xml).toContain('<title>Site &amp; Notes</title>');
  });

  test('uses the newest item date as lastBuildDate', () => {
    expect(xml).toContain('<lastBuildDate>Thu, 01 Oct 2026 00:00:00 GMT</lastBuildDate>');
  });

  test('omits pubDate for an item without a known date', () => {
    const b = xml.slice(xml.indexOf('<title>b</title>'));
    expect(b.slice(0, b.indexOf('</item>'))).not.toContain('<pubDate>');
  });

  test('uses the link as a permalink guid', () => {
    expect(xml).toContain('<guid isPermaLink="true">https://example.com/a</guid>');
  });

  test('omits lastBuildDate when no item has a date', () => {
    const undated = buildRss({ title: 't', link: 'l', description: 'd', language: 'ko', items: [item('x')] });
    expect(undated).not.toContain('lastBuildDate');
  });
});
