import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, test } from 'vitest';
import { readDayRaw } from '@/lib/content';
import { buildSearchManifest, buildSearchShard, listShardKeys } from './build';
import { expandManifest, type SearchBodyEntry, type SearchManifest, type SearchShard } from './model';
import { createSearcher } from './searcher';
import { encodeTerms, extractSearchTerms, stripKoreanParticle } from './terms';

// 검색창 첫 오픈 때 내려받는 용량 예산(gzip 바이트). 계획서 Step 5 완료 기준.
const FIRST_OPEN_BUDGET_GZIP = 300 * 1024;
// 모든 샤드를 합친 총량 한도(본문 전체 검색을 유지하는 대가). 이를 넘기면 표현을 더 줄여야 한다.
const TOTAL_SHARDS_BUDGET_GZIP = 1.5 * 1024 * 1024;
// 샤드 하나의 한도. 나눠 받는 설계가 의미를 가지려면 한 개가 너무 크면 안 된다.
const SHARD_BUDGET_GZIP = 250 * 1024;
// 입력 한 번(키 입력 하나)에 걸리는 검색 시간 한도(Node). 실측은 중앙값 약 15ms, 최악 약 30ms 다.
// 여유를 두되, 예전의 퍼지 본문 검색(건당 1.9초)을 확실히 잡는 값.
const QUERY_MEDIAN_BUDGET_MS = 60;
const QUERY_WORST_BUDGET_MS = 250;
// 한국어 긴 문장 입력: 키 하나가 4배 CPU 스로틀에서 300ms 를 넘지 않으려면 Node 에서 75ms 이하여야 한다. 실측 약 10ms.
const KO_KEYSTROKE_BUDGET_MS = 75;
// 같은 입력 전체(48키)의 누적 한도. 실측 약 70ms, 퍼지 상한을 지우면 약 260ms.
const KO_TYPING_TOTAL_BUDGET_MS = 180;

const gzipSize = (value: unknown) => gzipSync(JSON.stringify(value)).length;

let manifest: SearchManifest;
let shards: SearchShard[];
let entries: SearchBodyEntry[];
let search: ReturnType<typeof createSearcher>;
// 독립적인 정답 근거: day 원문(소문자)과 href.
let corpus: { href: string; lower: string; tokens: Set<string> }[];

const WORD = /[\p{L}\p{N}][\p{L}\p{N}_.+#-]*/gu;
const trimPunct = (t: string) => t.replace(/[._+#-]+$/, '');

beforeAll(async () => {
  manifest = await buildSearchManifest('ko');
  shards = (await Promise.all((await listShardKeys('ko')).map((k) => buildSearchShard(k, 'ko')))).filter((s): s is SearchShard => s !== null);
  entries = expandManifest(manifest);
  search = createSearcher(entries, shards);
  corpus = await Promise.all(entries.map(async (e) => {
    const lower = ((await readDayRaw(e.category, e.certSlug, e.week, e.day)) ?? '').toLowerCase();
    return { href: e.href, lower, tokens: new Set([...lower.matchAll(WORD)].map((m) => trimPunct(m[0]))) };
  }));
}, 180_000);

describe('용량 예산', () => {
  test('첫 오픈 페이로드(매니페스트)의 gzip 크기가 예산 이하다', () => {
    const size = gzipSize(manifest);
    expect(size, `manifest gzip ${size}B`).toBeLessThanOrEqual(FIRST_OPEN_BUDGET_GZIP);
  });

  test('샤드마다 gzip 크기가 한도 이하다', () => {
    for (const s of shards) expect(gzipSize(s), s.slug).toBeLessThanOrEqual(SHARD_BUDGET_GZIP);
  });

  test('모든 샤드의 gzip 합이 총량 한도 이하다', () => {
    const total = shards.reduce((sum, s) => sum + gzipSize(s), 0);
    expect(total, `total gzip ${total}B`).toBeLessThanOrEqual(TOTAL_SHARDS_BUDGET_GZIP);
  });

  test('전제: 본문을 전부 한 인덱스에 담으면 첫 오픈 예산을 넘는다(분할이 필요했음을 고정)', () => {
    expect(gzipSize({ manifest, shards })).toBeGreaterThan(FIRST_OPEN_BUDGET_GZIP);
  });
});

function entry(over: Partial<SearchBodyEntry>): SearchBodyEntry {
  return {
    category: 'aws', certSlug: 'x', certCode: 'XXX-C01', certName: 'Test', certLevel: 'associate',
    week: 2, day: 1, title: 'Untitled', href: '/aws/x/week2/day1', ...over,
  };
}

// 합성 샤드: [week, day, 본문 텍스트]
function shardOf(slug: string, days: [number, number, string][]): SearchShard {
  const { dict, ids } = encodeTerms(days.map(([, , text]) => extractSearchTerms(text)));
  return { v: 2, slug, dict, days: days.map(([w, d], i) => [w, d, ids[i]]) };
}

describe('순위 - 글자 그대로(제목 > 본문) > 퍼지', () => {
  test('본문 단어가 완벽히 일치해도 제목 일치가 먼저다', () => {
    const bodyOnly = entry({ title: 'Networking basics', href: '/aws/x/week2/day1' });
    const titleHit = entry({ title: 'Kinesis Data Streams', href: '/aws/x/week2/day2', day: 2 });
    const sh = shardOf('x', [[2, 1, 'kinesis kinesis streams'], [2, 2, 'nothing here']]);
    expect(createSearcher([bodyOnly, titleHit], [sh])('kinesis').map((r) => r.href)).toEqual([titleHit.href, bodyOnly.href]);
  });

  test('본문 샤드가 늦게 도착해도 제목 일치가 계속 첫 번째다', () => {
    const a = entry({ title: 'Kinesis Data Streams', href: '/aws/x/week2/day2', day: 2 });
    const b = entry({ title: 'Networking basics', href: '/aws/x/week2/day1' });
    const sh = shardOf('x', [[2, 1, 'kinesis'], [2, 2, 'x']]);
    expect(createSearcher([a, b], [sh])('kinesis')[0].href).toBe(a.href);
    expect(createSearcher([a, b], [])('kinesis')[0].href).toBe(a.href);
  });

  test('글자 그대로 일치가 있으면 제목의 퍼지(오타) 일치는 붙이지 않는다', () => {
    const fuzzyTitle = entry({ title: 'Kinesys Data Streams', href: '/aws/x/week2/day2', day: 2 }); // 'kinesis' 와 한 글자 차이
    const bodyExact = entry({ title: 'Networking basics', href: '/aws/x/week2/day1' });
    const sh = shardOf('x', [[2, 1, 'we use kinesis here'], [2, 2, 'nothing']]);
    expect(createSearcher([fuzzyTitle, bodyExact], [sh])('kinesis').map((r) => r.href)).toEqual([bodyExact.href]);
  });

  test('글자 그대로 일치가 하나도 없을 때만 짧은 한 단어 질의의 오타를 제목 퍼지로 찾는다', () => {
    const fuzzyTitle = entry({ title: 'Kinesis Data Streams', href: '/aws/x/week2/day2', day: 2 });
    expect(createSearcher([fuzzyTitle], [])('kinesys').map((r) => r.href)).toEqual([fuzzyTitle.href]);
  });

  // 퍼지 상한(FUZZY_MAX_QUERY_CHARS)과 한 단어 조건을 지운 변형을 잡는 테스트: 길거나 여러 단어인 질의는 오타가 있어도
  // 제목 퍼지를 돌리지 않는다(한글 긴 문장 입력에서 키마다 약 40ms 를 쓰던 경로).
  test('긴 질의와 여러 단어 질의에는 제목 퍼지를 돌리지 않는다', () => {
    const t = entry({ title: 'Kinesis Data Streams Overview Guide', href: '/aws/x/week2/day2', day: 2 });
    const s = createSearcher([t], []);
    expect(s('kinesisdatastreamz').map((r) => r.href), '17자 초과 한 단어').toEqual([]);
    expect(s('kinesys data streams').map((r) => r.href), '여러 단어').toEqual([]);
    expect(s('kinesys').length, '짧은 한 단어는 찾는다').toBe(1);
  });

  test('본문에서 "단어 그대로" 일치가 단어의 일부 일치보다 먼저다(ike vs like)', () => {
    const partial = entry({ title: 'A', href: '/aws/x/week2/day1' });
    const whole = entry({ title: 'B', href: '/aws/x/week2/day2', day: 2 });
    const sh = shardOf('x', [[2, 1, 'i like this'], [2, 2, 'the ike protocol']]);
    expect(createSearcher([partial, whole], [sh])('ike').map((r) => r.href)).toEqual([whole.href, partial.href]);
  });

  test('같은 단계에서는 지금 보는 자격증(preferSlug)이 먼저다', () => {
    const a = entry({ certSlug: 'a', title: 'A', href: '/aws/a/week2/day1' });
    const b = entry({ certSlug: 'b', title: 'B', href: '/aws/b/week2/day1' });
    const sh = [shardOf('a', [[2, 1, 'kinesis']]), shardOf('b', [[2, 1, 'kinesis']])];
    expect(createSearcher([a, b], sh)('kinesis')[0].href).toBe(a.href);
    expect(createSearcher([a, b], sh, { preferSlug: 'b' })('kinesis')[0].href).toBe(b.href);
  });

  test('여러 단어는 모두 있어야 한다(AND)', () => {
    const both = entry({ title: 'A', href: '/aws/x/week2/day1' });
    const one = entry({ title: 'B', href: '/aws/x/week2/day2', day: 2 });
    const sh = shardOf('x', [[2, 1, 'lambda concurrency limits'], [2, 2, 'lambda only']]);
    expect(createSearcher([both, one], [sh])('lambda concurrency').map((r) => r.href)).toEqual([both.href]);
  });

  test('한국어 조사가 붙은 검색어도 어간으로 찾는다', () => {
    const e = entry({ title: 'A', href: '/aws/x/week2/day1' });
    const sh = shardOf('x', [[2, 1, '람다는 서버리스 함수다']]);
    expect(createSearcher([e], [sh])('람다는').map((r) => r.href)).toEqual([e.href]);
    expect(createSearcher([e], [sh])('람다').map((r) => r.href)).toEqual([e.href]);
  });

  test('짧거나 빈 검색어는 앞의 12개를 그대로 준다', () => {
    expect(search('  ')).toHaveLength(12);
    expect(search('a')).toHaveLength(12);
  });

  test('샤드가 하나도 없어도(전부 실패) 제목 검색은 된다', () => {
    const res = createSearcher(entries, [])('Lambda');
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].title.toLowerCase()).toContain('lambda');
  });

  test('실데이터: 제목에 단어가 있는 day 는 본문에만 있는 day 보다 앞선다', () => {
    const res = search('Lambda');
    const inTitle = (r: SearchBodyEntry) => r.title.toLowerCase().includes('lambda');
    const firstBodyOnly = res.findIndex((r) => !inTitle(r));
    expect(res.findIndex(inTitle)).toBe(0);
    if (firstBodyOnly >= 0) expect(res.slice(firstBodyOnly).some(inTitle)).toBe(false);
  });
});

// 본문(week2+)에만 있는 실제 용어. 전제(제목·week1 본문에 없음)를 테스트가 원문으로 직접 검증한다.
const REAL_QUERIES: { label: string; query: string; href: string }[] = [
  { label: '한국어 용어', query: '슬라이스', href: '/aws/saa-c03/week2/day1' },
  { label: '영문 약어', query: 'NGFW', href: '/aws/saa-c03/week3/day5' },
  { label: '리눅스 트랙 용어', query: 'lilo', href: '/linux/linux-master-2/week2/day4' },
];

describe.each(REAL_QUERIES)('실제 week2+ 전용 검색어 - $label($query)', ({ query, href }) => {
  test('전제: 어떤 제목에도, week1 본문에도 없고 대상 day 본문에는 있다', () => {
    const q = query.toLowerCase();
    expect(entries.filter((e) => e.title.toLowerCase().includes(q))).toEqual([]);
    const week1 = corpus.filter((c, i) => entries[i].week <= 1 && c.lower.includes(q));
    expect(week1.map((c) => c.href)).toEqual([]);
    const target = entries.findIndex((e) => e.href === href);
    expect(entries[target].week).toBeGreaterThanOrEqual(2);
    expect(corpus[target].lower).toContain(q);
  });

  test('제목만 있는 인덱스(샤드 전)에서는 못 찾고, 샤드가 있으면 그 day 가 결과에 나온다', () => {
    expect(createSearcher(entries, [])(query).map((r) => r.href)).not.toContain(href);
    expect(search(query).map((r) => r.href)).toContain(href);
  });

  test('결과 링크는 공개 섹션 URL 이다', () => {
    for (const r of search(query)) expect(r.href).toMatch(/^\/(aws|linux)\/[a-z0-9-]+\/week\d+\/day\d+$/);
  });
});

// 검증 게이트가 지적한 실제 용어들(본문 앞 1,800자 밖이라 예전 방식은 못 찾던 것 포함).
const GATE_TERMS: { query: string; href: string; top?: boolean }[] = [
  { query: '전송료', href: '/aws/saa-c03/week10/day3' },
  { query: '리샘플', href: '/aws/mls-c01/week4/day4' },
  { query: 'Kustomize', href: '/aws/dop-c02/week6/day3' },
  { query: 'mysqld', href: '/linux/linux-master-1/week9/day6' },
  { query: 'IKE', href: '/aws/sap-c02/week3/day3', top: true }, // 회귀: 퍼지 제목 일치에 밀려 44위였다
  { query: '시그모이드', href: '/aws/mls-c01/week8/day4' },
  { query: '채팅방', href: '/aws/dva-c02/week4/day5' },
];

describe('경로·플래그 검색(색인과 같은 토크나이저)', () => {
  test.each([
    { query: '/etc/aliases', term: 'aliases' },
    { query: '--init', term: 'init' },
    { query: '/etc/ld.so.cache', term: 'ld.so.cache' },
  ])('$query 는 결과를 주고 그 결과의 본문에 실제로 들어 있다', ({ query, term }) => {
    const res = search(query);
    expect(res.length).toBeGreaterThan(0);
    const idx = entries.findIndex((e) => e.href === res[0].href);
    expect(corpus[idx].lower).toContain(term);
  });

  test('합성: 경로·플래그·혼합 입력을 담은 문서를 같은 입력으로 다시 찾는다', () => {
    const inputs = ['/etc/aliases', '--init', '/etc/ld.so.cache', 'k8s', 'ap-northeast-2', 'S3://bucket', 'EC2는'];
    inputs.forEach((input, n) => {
      const e = entry({ title: `T${n}`, href: `/aws/x/week2/day${n + 1}`, day: n + 1 });
      const sh = shardOf('x', [[2, n + 1, `설명 ${input} 끝`]]);
      expect(createSearcher([e], [sh])(input).map((r) => r.href), input).toEqual([e.href]);
    });
  });

  test('실데이터: 정확한 일치가 있는 질의(KPU)에는 관련 없는 퍼지 제목 행이 섞이지 않는다', () => {
    const res = search('KPU');
    expect(res.length).toBeGreaterThan(0);
    const idx = new Map(entries.map((e, i) => [e.href, i]));
    for (const r of res) {
      const hay = `${r.title} ${r.certCode} ${r.certName}`.toLowerCase();
      expect(hay.includes('kpu') || corpus[idx.get(r.href)!].lower.includes('kpu'), r.href).toBe(true);
    }
  });
});

describe('전체 본문 검색 - 검증 게이트 용어', () => {
  test.each(GATE_TERMS)('$query 는 $href 를 보여준다', ({ query, href, top }) => {
    const idx = entries.findIndex((e) => e.href === href);
    expect(corpus[idx].lower, '정답 day 원문에 실제로 있다').toContain(query.toLowerCase());
    const hrefs = search(query).map((r) => r.href);
    expect(hrefs).toContain(href);
    if (top) expect(hrefs[0]).toBe(href);
  });
});

// 문서 전체에서 뽑은 구별되는 용어(앞 1,800자만이 아니라)를 검색해 그 day 가 보이는지 본다.
function sampleEvenly<T>(items: T[], n: number): T[] {
  const step = Math.max(1, Math.floor(items.length / n));
  return items.filter((_, i) => i % step === 0).slice(0, n);
}

describe('전체 본문 검색 - 커버리지(데이터 기반)', () => {
  test('문서 어디에 있든 구별되는 용어 150개 이상을 98% 이상 찾는다', () => {
    // 후보: 정확히 1~3개 day 의 토큰 집합에만 있고 길이 3 이상인 토큰, 어간(조사 뗀 형태)도 5개 day 이하에만 있는 것.
    const df = new Map<string, number[]>();
    corpus.forEach((c, i) => c.tokens.forEach((t) => {
      if (t.length < 3 || /^[\d.,-]+$/.test(t)) return;
      (df.get(t) ?? df.set(t, []).get(t)!).push(i);
    }));
    const candidates = [...df].filter(([, days]) => days.length <= 3).sort(([a], [b]) => (a < b ? -1 : 1));
    const picked = sampleEvenly(candidates, 400).filter(([t]) => {
      const stem = stripKoreanParticle(t);
      return corpus.filter((c) => c.lower.includes(stem)).length <= 5;
    });
    expect(picked.length).toBeGreaterThanOrEqual(150);
    // 본문 뒤쪽에서 뽑힌 용어가 충분히 섞여 있는지(앞 1,800자만 보던 방식이 못 찾던 영역).
    const late = picked.filter(([t, days]) => corpus[days[0]].lower.indexOf(t) > 1800);
    expect(late.length).toBeGreaterThanOrEqual(75);
    const hits = picked.filter(([t, days]) => search(t).some((r) => days.some((d) => entries[d].href === r.href)));
    const rate = hits.length / picked.length;
    expect(rate, `hit ${hits.length}/${picked.length}; misses: ${picked.filter((p) => !hits.includes(p)).map((p) => p[0]).slice(0, 10)}`).toBeGreaterThanOrEqual(0.98);
  });

  test('한 day 에만 있는 3글자 약어(대문자 표기)를 95% 이상 보이는 결과에 올린다', () => {
    const acronyms = new Map<string, number[]>();
    return Promise.all(entries.map((e) => readDayRaw(e.category, e.certSlug, e.week, e.day))).then((raws) => {
      raws.forEach((raw, i) => {
        for (const m of (raw ?? '').matchAll(/(?<![A-Za-z0-9])[A-Z]{3}(?![A-Za-z0-9])/g)) {
          const t = m[0].toLowerCase();
          const days = acronyms.get(t) ?? acronyms.set(t, []).get(t)!;
          if (!days.includes(i)) days.push(i);
        }
      });
      // 소문자 토큰 기준으로도 다른 day 에 없어야 "그 day 에만 있는" 약어다.
      const unique = [...acronyms].filter(([t, days]) => days.length === 1 && corpus.filter((c) => c.tokens.has(t)).length === 1)
        .sort(([a], [b]) => (a < b ? -1 : 1));
      const picked = sampleEvenly(unique, 60);
      expect(picked.length).toBeGreaterThanOrEqual(30);
      const hits = picked.filter(([t, [d]]) => search(t).some((r) => r.href === entries[d].href));
      const rate = hits.length / picked.length;
      expect(rate, `hit ${hits.length}/${picked.length}; misses: ${picked.filter((p) => !hits.includes(p)).map((p) => p[0])}`).toBeGreaterThanOrEqual(0.95);
    });
  }, 60_000);
});

// 입력이 멎지 않으려면 검색 한 번이 짧아야 한다(Playwright 가 같은 것을 브라우저 CPU 스로틀 아래에서 본다).
describe('성능 - 입력당 검색 시간', () => {
  const REALISTIC = [
    'lambda concurrency', '전송료', '리샘플', 'Kustomize', 'mysqld', 'IKE', '시그모이드', '채팅방', 'vpc peering', 's3 수명주기',
    'iam policy', 'cloudwatch', 'kinesis data streams', 'rds 다중 az', 'systemd', 'chmod', 'NGFW', '슬라이스', 'lilo',
    'container orchestration platform',
  ];

  test('현실적인 질의 20개: 전체 인덱스에서 중앙값·최악이 한도 이하다', () => {
    search('warmup');
    const times = REALISTIC.map((q) => {
      const t = performance.now();
      search(q);
      return performance.now() - t;
    }).sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const worst = times[times.length - 1];
    expect(median, `median ${median.toFixed(1)}ms`).toBeLessThanOrEqual(QUERY_MEDIAN_BUDGET_MS);
    expect(worst, `worst ${worst.toFixed(1)}ms`).toBeLessThanOrEqual(QUERY_WORST_BUDGET_MS);
  });

  test('긴 질의를 한 글자씩 입력해도 모든 키 입력이 한도 이하다', () => {
    const typed = 'lambda concurrency limits throttling';
    let worst = 0;
    for (let n = 1; n <= typed.length; n++) {
      const t = performance.now();
      search(typed.slice(0, n));
      worst = Math.max(worst, performance.now() - t);
    }
    expect(worst, `worst keystroke ${worst.toFixed(1)}ms`).toBeLessThanOrEqual(QUERY_WORST_BUDGET_MS);
  });

  // 한글은 단어 훑기와 퍼지가 키당 수십 ms 였다(게이트: Pixel 5 4x 에서 42자 입력이 10초). 새 검색기(빈 단어 캐시)로 시작해
  // 키 입력을 처음부터 재생한다 - 캐시가 있는 반복 호출이 아니라 실제 입력 경로의 비용이다.
  test('긴 한국어 질의(42자 이상)를 한 글자씩 입력해도 모든 키 입력이 한도 이하다', () => {
    const typed = '람다 동시성 제한과 스로틀링에 대해서 알아보고 서버리스 아키텍처에서의 비용 최적화 방법';
    expect(typed.length).toBeGreaterThanOrEqual(42);
    const fresh = createSearcher(entries, shards);
    const times: number[] = [];
    for (let n = 1; n <= typed.length; n++) {
      const t = performance.now();
      fresh(typed.slice(0, n));
      times.push(performance.now() - t);
    }
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const worst = sorted[sorted.length - 1];
    expect(median, `ko median ${median.toFixed(1)}ms`).toBeLessThanOrEqual(QUERY_MEDIAN_BUDGET_MS);
    expect(worst, `ko worst ${worst.toFixed(1)}ms`).toBeLessThanOrEqual(KO_KEYSTROKE_BUDGET_MS);
  });

  // 퍼지 상한이 없던 변형(한글 문장에서 키마다 약 40ms)을 잡는다: 문장 입력 전체의 누적 시간으로 본다.
  test('긴 한국어 문장을 처음부터 끝까지 입력하는 총 시간이 한도 이하다', () => {
    const typed = '람다 동시성 제한과 스로틀링에 대해서 알아보고 서버리스 아키텍처에서의 비용 최적화 방법';
    const fresh = createSearcher(entries, shards);
    const t = performance.now();
    for (let n = 1; n <= typed.length; n++) fresh(typed.slice(0, n));
    const total = performance.now() - t;
    expect(total, `ko total ${total.toFixed(0)}ms for ${typed.length} keys`).toBeLessThanOrEqual(KO_TYPING_TOTAL_BUDGET_MS);
  });

  test('모든 샤드를 합친 검색기 생성도 한도 이하다(샤드 도착 때마다 일어난다)', () => {
    const t = performance.now();
    createSearcher(entries, shards);
    expect(performance.now() - t).toBeLessThanOrEqual(QUERY_WORST_BUDGET_MS);
  });
});
