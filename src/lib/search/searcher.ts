import Fuse, { type IFuseOptions } from 'fuse.js';
import type { SearchBodyEntry, SearchShard } from './model';
import { decodeIds, tokenizeTerms } from './terms';

export const SEARCH_RESULT_LIMIT = 25;
const EMPTY_QUERY_RESULTS = 12;
const MIN_QUERY_CHARS = 2;
// 오타 허용(퍼지) 일치는 제목에만, 한 단어짜리 짧은 검색어에만 쓴다(오타는 단어 하나의 문제이고, 긴 문장에 퍼지를 돌리면
// 한글에서는 키마다 약 40ms 였다). Fuse 는 검색어가 길수록 급격히 느려져(실측: 6자 29ms,
// 18자 67ms, 33자 275ms) 긴 문장 입력 중에 메인 스레드를 막았다. 긴 검색어는 글자 그대로 일치로 충분하다.
const FUZZY_MAX_QUERY_CHARS = 16;
const WORD_CACHE_MAX = 64;
const FUZZY: IFuseOptions<{ hay: string; i: number }> = { threshold: 0.4, ignoreLocation: true, minMatchCharLength: 2, keys: ['hay'] };

// 샤드를 검색 가능한 형태로 푼 것. 단어 사전은 하나의 문자열로 두고(네이티브 indexOf 로 훑는다) 각 단어의 시작 위치를
// 따로 둔다. 단어 -> day 목록(역색인)을 CSR 배열로 만들어 두어, 검색어에 맞는 단어들의 day 만 모은다
// (day 마다 모든 단어를 훑지 않는다).
interface DecodedShard {
  dict: string; // ' ' + 단어들 + ' '
  starts: Int32Array; // 단어 i 가 dict 에서 시작하는 위치
  dayIndex: Map<string, number>; // "week/day" -> 샤드 안의 day 순번
  dayCount: number;
  postingStart: Int32Array; // 단어 i 의 day 목록이 postings 에서 시작하는 위치(길이 단어수+1)
  postings: Int32Array; // day 순번들
}

const decodedCache = new WeakMap<SearchShard, DecodedShard>();

// 샤드가 도착할 때 한 번 풀어 둔다(WeakMap 캐시). 검색창을 다시 열 때 이미 푼 상태라 메인 스레드를 막지 않는다.
export function prepareShard(shard: SearchShard): void {
  decodeShard(shard);
}

function decodeShard(shard: SearchShard): DecodedShard {
  const hit = decodedCache.get(shard);
  if (hit) return hit;
  const terms = shard.dict === '' ? [] : shard.dict.split(' ');
  const starts = new Int32Array(terms.length);
  let pos = 1;
  for (let i = 0; i < terms.length; i++) { starts[i] = pos; pos += terms[i].length + 1; }
  const perDay = shard.days.map(([, , ids]) => decodeIds(ids));
  const postingStart = new Int32Array(terms.length + 1);
  for (const ids of perDay) for (const id of ids) postingStart[id + 1]++;
  for (let i = 0; i < terms.length; i++) postingStart[i + 1] += postingStart[i];
  const fill = postingStart.slice(0, terms.length);
  const postings = new Int32Array(postingStart[terms.length]);
  perDay.forEach((ids, day) => { for (const id of ids) postings[fill[id]++] = day; });
  const dayIndex = new Map(shard.days.map(([w, d], i) => [`${w}/${d}`, i]));
  const decoded = { dict: ` ${shard.dict} `, starts, dayIndex, dayCount: shard.days.length, postingStart, postings };
  decodedCache.set(shard, decoded);
  return decoded;
}

// starts 에서 position 이하인 마지막 단어 인덱스.
function termAt(starts: Int32Array, position: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= position) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function markDays(shard: DecodedShard, term: number, flags: Uint8Array): void {
  for (let i = shard.postingStart[term]; i < shard.postingStart[term + 1]; i++) flags[shard.postings[i]] = 1;
}

// 한 검색어 단어(와 그 조사 뗀 형태)가 이 샤드의 어느 day 에 있는지.
interface WordMatch { sub: Uint8Array; exact: Uint8Array } // day 순번별 플래그

// 영문·숫자 2글자('ec', 's3')는 거의 모든 단어에 부분 일치해 입력 중간마다 무거운 훑기가 되므로 단어 그대로만 본다.
// 한글은 2글자 단어가 흔해('서버', '람다') 부분 일치를 허용한다.
const SUBSTRING_MIN_CHARS = 3;
const HANGUL = /[가-힣]/;
const allowsSubstring = (word: string) => word.length >= SUBSTRING_MIN_CHARS || HANGUL.test(word);

function matchWord(shard: DecodedShard, variants: string[]): WordMatch {
  const exact = new Uint8Array(shard.dayCount);
  for (const v of variants) {
    const e = shard.dict.indexOf(` ${v} `);
    if (e !== -1) markDays(shard, termAt(shard.starts, e + 1), exact);
  }
  if (!variants.some(allowsSubstring)) return { sub: exact, exact };
  const sub = new Uint8Array(shard.dayCount);
  for (const v of variants) {
    if (!allowsSubstring(v)) continue;
    let last = -1;
    for (let p = shard.dict.indexOf(v); p !== -1; p = shard.dict.indexOf(v, p + 1)) {
      const term = termAt(shard.starts, p);
      if (term !== last) { markDays(shard, term, sub); last = term; }
    }
  }
  for (let i = 0; i < exact.length; i++) if (exact[i]) sub[i] = 1;
  return { sub, exact };
}

export interface SearchOptions { preferSlug?: string | null }

// 순위 규칙(앞이 위):
//  1) 제목·코드·자격증명에 검색어가 글자 그대로(대소문자 무시) 들어 있는 결과
//  2) 본문에 검색어가 "단어 그대로" 있는 결과
//  3) 본문 단어의 일부로 들어 있는 결과(예: 'ike' → 'like')
//  4) 제목의 퍼지(오타 허용) 일치 - 1~3 단계 결과가 하나도 없을 때만
// 색인과 같은 토크나이저로 나눈 단어는 모두 있어야 한다(AND). 본문은 퍼지로 보지 않는다 — 긴 본문 전체에 퍼지를 돌리면 입력마다
// 수 초가 걸려 입력이 멎었고, 짧은 약어는 퍼지 제목 일치에 밀려 보이지 않았다. 글자 그대로 검색은 입력당 수십 ms 다.
// 같은 단계 안에서는 preferSlug(지금 보고 있는 자격증)의 결과가 먼저다.
// 제목 쪽 색인은 매니페스트(entries)가 같으면 같다 - 샤드가 도착할 때마다 다시 만들지 않는다.
const titleIndexCache = new WeakMap<SearchBodyEntry[], { titleHay: string[]; fuzzy: Fuse<{ hay: string; i: number }> }>();
function titleIndex(entries: SearchBodyEntry[]) {
  const hit = titleIndexCache.get(entries);
  if (hit) return hit;
  const titleHay = entries.map((e) => `${e.title} ${e.certCode} ${e.certName}`.toLowerCase());
  const built = { titleHay, fuzzy: new Fuse(titleHay.map((hay, i) => ({ hay, i })), FUZZY) };
  titleIndexCache.set(entries, built);
  return built;
}

export function createSearcher(
  entries: SearchBodyEntry[],
  shards: readonly SearchShard[] = [],
  opts: SearchOptions = {},
): (query: string, limit?: number) => SearchBodyEntry[] {
  const { titleHay, fuzzy } = titleIndex(entries);
  const bySlug = new Map(shards.map((s) => [s.slug, decodeShard(s)]));
  const dayOf = entries.map((e) => bySlug.get(e.certSlug)?.dayIndex.get(`${e.week}/${e.day}`) ?? -1);
  const prefer = opts.preferSlug ?? null;

  // 단어별 사전 훑기 결과 캐시. 입력 중에는 마지막 단어만 바뀌므로 앞 단어들은 다시 훑지 않는다
  // (한글 긴 문장 입력에서 키마다 모든 단어를 13개 사전에 대해 훑던 것이 입력을 멎게 했다).
  const wordCache = new Map<string, Map<string, WordMatch>>();
  const matchesFor = (word: string): Map<string, WordMatch> => {
    const hit = wordCache.get(word);
    if (hit) return hit;
    const m = new Map<string, WordMatch>();
    for (const [slug, shard] of bySlug) m.set(slug, matchWord(shard, [word]));
    if (wordCache.size >= WORD_CACHE_MAX) wordCache.clear();
    wordCache.set(word, m);
    return m;
  };

  return (query, limit = SEARCH_RESULT_LIMIT) => {
    const q = query.trim().toLowerCase();
    if (q.length < MIN_QUERY_CHARS) return entries.slice(0, EMPTY_QUERY_RESULTS);
    // 색인과 같은 토크나이저를 쓴다: '/etc/aliases' -> etc, aliases / '--init' -> init / 'EC2는' -> ec2.
    const words = tokenizeTerms(q);
    if (words.length === 0) return [];
    const perWord = words.map(matchesFor);
    const matches = new Map<string, WordMatch[]>();
    for (const slug of bySlug.keys()) matches.set(slug, perWord.map((m) => m.get(slug)!));

    const tiers: SearchBodyEntry[][] = [[], [], []];
    const preferred: SearchBodyEntry[][] = [[], [], []];
    entries.forEach((e, i) => {
      let tier = -1;
      if (words.every((w) => titleHay[i].includes(w))) tier = 0;
      else {
        const day = dayOf[i];
        const ms = matches.get(e.certSlug);
        if (day >= 0 && ms && ms.every((m) => m.sub[day] === 1)) {
          tier = ms.every((m) => m.exact[day] === 1) ? 1 : 2;
        }
      }
      if (tier >= 0) (e.certSlug === prefer ? preferred : tiers)[tier].push(e);
    });

    const out: SearchBodyEntry[] = [];
    const seen = new Set<string>();
    const push = (e: SearchBodyEntry) => { if (!seen.has(e.href)) { seen.add(e.href); out.push(e); } };
    for (let t = 0; t < tiers.length; t++) { preferred[t].forEach(push); tiers[t].forEach(push); }
    // 글자 그대로 일치가 하나라도 있으면 퍼지 제목 일치는 붙이지 않는다(관련 없는 제목이 정확한 본문 결과 밑에 섞이던 문제).
    // 정확한 결과가 없을 때만 오타 허용 제목 검색을 한다.
    if (out.length === 0 && words.length === 1 && q.length <= FUZZY_MAX_QUERY_CHARS) fuzzy.search(q, { limit }).forEach((r) => push(entries[r.item.i]));
    return out.slice(0, limit);
  };
}
