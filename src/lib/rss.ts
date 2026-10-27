// RSS 2.0 피드 본문 생성(/rss.xml). 네이버 서치어드바이저는 사이트맵과 별도로 RSS 를 제출받아
// 새·수정 문서를 수집한다. 라우트(src/app/rss.xml/route.ts)가 항목을 모으고, 여기서는 XML 만 만든다.

export interface RssItem {
  title: string;
  link: string;
  description: string;
  // 알 수 없으면 생략한다. 빌드 시각 같은 가짜 날짜를 넣으면 수집기가 날짜 신호를 불신한다
  // (sitemap.ts 의 lastModified 와 같은 원칙).
  pubDate?: Date;
}

export interface RssChannel {
  title: string;
  link: string;
  description: string;
  language: string;
  items: readonly RssItem[];
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 최근 변경 순. 날짜가 없는 항목은 뒤로 보내고, 그 안에서는 원래 순서를 지킨다.
export function sortByRecent(items: readonly RssItem[]): RssItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ta = a.item.pubDate?.getTime();
      const tb = b.item.pubDate?.getTime();
      if (ta !== undefined && tb !== undefined && ta !== tb) return tb - ta;
      if (ta === undefined && tb !== undefined) return 1;
      if (ta !== undefined && tb === undefined) return -1;
      return a.i - b.i;
    })
    .map(({ item }) => item);
}

function itemXml(item: RssItem): string {
  const lines = [
    `    <title>${escapeXml(item.title)}</title>`,
    `    <link>${escapeXml(item.link)}</link>`,
    `    <guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
    `    <description>${escapeXml(item.description)}</description>`,
  ];
  if (item.pubDate) lines.push(`    <pubDate>${item.pubDate.toUTCString()}</pubDate>`);
  return `  <item>\n${lines.join('\n')}\n  </item>`;
}

export function buildRss(channel: RssChannel): string {
  const newest = channel.items.find((i) => i.pubDate)?.pubDate;
  const head = [
    `  <title>${escapeXml(channel.title)}</title>`,
    `  <link>${escapeXml(channel.link)}</link>`,
    `  <description>${escapeXml(channel.description)}</description>`,
    `  <language>${escapeXml(channel.language)}</language>`,
    ...(newest ? [`  <lastBuildDate>${newest.toUTCString()}</lastBuildDate>`] : []),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    ...head,
    ...channel.items.map(itemXml),
    '</channel>',
    '</rss>',
    '',
  ].join('\n');
}
