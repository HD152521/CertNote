#!/usr/bin/env node
// 문체 위반 검사기 (P4 Step 4a). 기준 문서: docs/content-style-guide.md
//
// 가이드 규칙 중 기계적으로 셀 수 있는 것만 센다. 판정이 아니라 "고칠 후보 목록"이다.
// - 범위: day*.md 의 `## 📝 연습 문제` 앞 본문만. 연습 문제(문제·보기·해설)는 세지 않는다.
// - 코드블록(``` / ~~~)과 인라인 코드(`...`) 안은 지운 뒤 센다. 줄 번호는 보존한다.
// - content/en(영어판)은 건너뛴다.
//
// 사용법:
//   node scripts/audit-style.mjs [경로...] [--json] [--summary] [--detail]
//     경로      파일 또는 폴더. 기본값 content/aws-certs
//     --summary 트랙(자격증)별 × 규칙별 합계 표만 출력
//     --json    결과를 JSON 으로 출력(--summary 와 함께 쓰면 합계만)
//     --detail  파일별로 위반 줄 번호와 해당 줄 일부를 함께 출력
//
// ⚠️ 이모지를 정규식 앵커로 쓰지 않는다(docs/content-format.md 경고). 연습 문제 헤딩은 "연습 문제"
//    텍스트로, 콜아웃은 \p{Extended_Pictographic} 속성으로 찾는다.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// 규칙 정의
// ---------------------------------------------------------------------------

/** 출력 순서와 이름. id 는 JSON 키로 쓰인다. */
export const RULES = [
  { id: 'cheer', label: '응원·축하 문구' },
  { id: 'exclaim', label: '감탄 부호(!)' },
  { id: 'honorific', label: '존댓말 종결' },
  { id: 'hortative', label: '권유·명령 종결(~자/~라)' },
  { id: 'callout', label: '이모지 콜아웃 2개 초과분' },
  { id: 'core', label: '"핵심은" 2회째부터' },
  { id: 'frequency', label: '출처 없는 빈도 표현' },
  { id: 'term', label: '용어집 비표준 표기' },
  { id: 'summaryDup', label: '요약 섹션 중복' },
  { id: 'summaryName', label: '요약 섹션 이름 비표준' },
];

export const MAX_CALLOUTS = 2;
const CORE_ALLOWED = 1;

const CHEER_RES = [
  /fighting|화이팅|파이팅/giu,
  /합격을\s*(?:빈다|빕니다|기원|응원)/gu,
  /응원(?:한다|합니다|해요|할게|하겠)/gu,
  /축하(?:한다|합니다|해요|드립니다|드려요)/gu,
  /행운을\s*(?:빈다|빕니다|기원)/gu,
  /수고(?:했다|하셨|했어|많았|많으셨)/gu,
  /고생(?:하셨|했다|했어|많았|많으셨)/gu,
  /힘내(?:자|세요|요|라)?(?![가-힣])/gu,
  /성공하세요|합격하세요/gu,
];

// 한글·영문·숫자·닫는 괄호 바로 뒤의 느낌표. `!=` 같은 연산자는 제외.
const EXCLAIM_RE = /[가-힣A-Za-z0-9)\]]!+(?=[\s*)"”'’]|$)/gu;

// ㅂ니다/습니다/ㅂ니까 는 받침 ㅂ 판정으로 센다(입니다·합니다·됩니다·있습니다 모두 포함).
const NIDA_RE = /([가-힣])니(?:다|까)(?![가-힣])/gu;
const YO_RE =
  /(?:세요|십시오|해요|에요|예요|어요|아요|게요|네요|군요|지요|까요|돼요|봐요|줘요|워요|와요|져요|래요|죠)(?![가-힣])/gu;

// 문장 끝(마침표·느낌표·물음표·콜론, 굵게 닫기, 대시, 줄 끝) 바로 앞의 ~자 / ~라.
// 쉼표는 넣지 않는다 — "사고가 나자, ~" 같은 연결어미 ~자 를 권유형으로 잘못 센다.
const SENT_END = String.raw`(?=\s*(?:\*\*|__)?\s*(?:[.!?…:;)]|$|[—–]))`;
const HORTATIVE_JA_RE = new RegExp(String.raw`([가-힣]+)자${SENT_END}`, 'gmu');
const HORTATIVE_RA_RE = new RegExp(String.raw`([가-힣]+)라${SENT_END}`, 'gmu');
// "~자" 로 끝나는 명사(사용자·숫자 등). 단어 끝이 이 목록과 맞으면 권유형이 아니다.
const JA_NOUN_RE =
  /(?:문자|박자|숫자|글자|상자|그림자|주자|격자|인자|약자|강자|후자|전자|삼자|표시자|남자|여자|환자|투자|이자|의자|모자|감자|한자|정자|왕자|천자|부자|제자|기자|저자|학자|독자|배우자|당사자|관계자|책임자|수혜자|혼자|각자|철자|차자|확장자|(?:관리|식별|사용|연산|연결|생산|소유|지휘|중계|실행|중재|해석|호출|생성|작성|요청|수신|발신|구독|참여|참가|운영|개발|공격|관찰|감시|처리|소비|공급|구현|제공|승인|검토|담당|발행|게시|관측|전달|변환|평가|접근|가입|응시|수험|학습|배포|편집|구성|설계|조정|통제|인증|위임|수탁|위탁|감사|분석|검색|대리|기록|보유|제어|이용|시청|청취|기여|침입|피해|보호|합격|신청|지원|후원|설치|초보|입문|전문|사업|소비|구매|판매|수강|방문|접속|관리|반복|한정|수식|생성|지정|구분|종료|시작|가입|등록|게시|참조|대상|해제|변경|소멸|생존|피고|원고|결정|입력|출력|변수|매개|주최|창시|설립|발명|고안|제안|제작|번역|감독|사회|진행|발표|질문|응답|소유|발급|중개|작업|행위|연구|공유|요구|관측|노동|근로|사용|탐지|위반)자)$/u;
// "아니라·인프라·카메라" 같은 비명령형. 어간 끝이 이것이면 세지 않는다.
const RA_EXEMPT_RE = /(?:아니|인프|카메|오페|시나|코브|울트|이)$/u;
// "~라" 명령형으로 인정할 끝 모양(하라·보라·마라·외워라·떠올려라·읽어라 등).
const RA_COMMAND_RE = /(?:하|보|마|두|[아어여워와져켜쳐혀려러겨꿔가])$/u;

const FREQUENCY_RES = [
  /단골/gu,
  /최?빈출/gu,
  /(?:매년|매회|해마다|거의\s*매번|매번)\s*(?:시험에\s*)?(?:나온|나오|출제|등장)/gu,
  // "얼마나 자주 묻는가"(접근 빈도)·"자주 묻는 질문"(FAQ)은 시험 빈도 주장이 아니다.
  /(?<!얼마나\s*)(?:가장\s*)?(?:자주|많이)\s*(?:출제|나오|나온|등장|묻(?!는\s*질문)|물어)/gu,
  /(?:거의\s*)?(?:항상|언제나|무조건)\s*(?:오답|정답)/gu,
  /가장\s*흔한\s*(?:함정|실수|오답|오해|패턴|문항|유형|착각)/gu,
  /가장\s*(?:자주|많이)\s*(?:틀리|헷갈리|혼동|빠지|뒤바뀌|실수|놓치)/gu,
  /출제\s*(?:1순위|빈도가?\s*(?:높|가장))/gu,
  /(?:문항|문제|보기|수험생|응시자|합격자|장애|사고|유출|침해|프로젝트|기업|조직|회사)(?:들)?(?:의)?\s*(?:절반|대부분|\d+(?:\.\d+)?\s*%)\s*(?:은|는|이|가)(?![가-힣])/gu,
  /대부분의\s*(?:수험생|응시자|사람들?|팀|기업|조직)/gu,
];

// 용어집: 쓰지 않을 표기. 괄호 안(첫 등장 병기)은 세지 않는다.
// 영문 일반명사(Stack·Template·Flag)는 앞에 영단어가 붙은 기능명(Nested Stack, Launch Template,
// Feature Flag)이나 뒤에 대문자 단어가 이어지는 기능명(Stack Policy)이면 세지 않는다.
const EN_STANDALONE = (word) =>
  new RegExp(String.raw`(?<![A-Za-z][ -]?)${word}(?![A-Za-z]| ?Sets?(?![A-Za-z])| [A-Z])`, 'gu');

export const TERMS = [
  { use: 'Lambda', hint: /람다/i, avoid: [/람다(?!\s*(?:\/\s*카파\s*)?아키텍처)/gu] },
  { use: '페일오버', hint: /ail/i, avoid: [/(?<![A-Za-z])(?:failover|fail-over|Fail-over|Fail-Over)(?![A-Za-z])/gu] },
  { use: '스택', hint: /tack/i, avoid: [EN_STANDALONE('[Ss]tacks?')] },
  { use: '템플릿', hint: /emplate/i, avoid: [EN_STANDALONE('[Tt]emplates?')] },
  { use: '플래그', hint: /lag/i, avoid: [EN_STANDALONE('[Ff]lags?')] },
  { use: '퍼블릭 서브넷', hint: /ublic|공용/i, avoid: [/(?<![A-Za-z])[Pp]ublic\s*(?:서브넷|[Ss]ubnets?)|공용 서브넷/gu] },
  { use: '프라이빗 서브넷', hint: /rivate|사설/i, avoid: [/(?<![A-Za-z])[Pp]rivate\s*(?:서브넷|[Ss]ubnets?)|사설 서브넷/gu] },
  { use: 'Active-Active', hint: /액티브|ctive/i, avoid: [/액티브-액티브|Active\/Active|active-active/gu] },
  { use: 'Active-Passive', hint: /액티브|ctive/i, avoid: [/액티브-패시브|Active\/Passive|active-passive/gu] },
  { use: '가용 영역', hint: /가용영역/i, avoid: [/가용영역/gu] },
  { use: '로드 밸런서', hint: /로드밸런서/i, avoid: [/로드밸런서/gu] },
  { use: 'Auto Scaling', hint: /오토|scaling/i, avoid: [/오토\s?스케일링|(?<![A-Za-z])auto[ -]?scaling|autoscaling/gu] },
  { use: '지연 시간', hint: /지연시간|레이턴시/i, avoid: [/지연시간|레이턴시/gu] },
  { use: '파인튜닝', hint: /파인 튜닝|tuning/i, avoid: [/파인 튜닝|(?<![A-Za-z])fine[ -]tuning/gu] },
  { use: '하이퍼파라미터', hint: /하이퍼 |hyperparameter/i, avoid: [/하이퍼 파라미터|(?<![A-Za-z])hyperparameters?(?![A-Za-z])/gu] },
  { use: '셸', hint: /쉘/i, avoid: [/쉘/gu] },
  { use: '디렉터리', hint: /디렉토리/i, avoid: [/디렉토리/gu] },
  { use: '리포지토리', hint: /레포|리포지터리/i, avoid: [/레포지토리|리포지터리|레포지터리/gu] },
  { use: '데이터 레이크', hint: /데이터레이크/i, avoid: [/데이터레이크/gu] },
  { use: '콜드 스타트', hint: /콜드스타트|cold start/i, avoid: [/콜드스타트|(?<![A-Za-z])cold start/gu] },
  { use: '보안 그룹', hint: /보안그룹|security group/i, avoid: [/보안그룹|(?<![A-Za-z])security groups?(?![A-Za-z])/gu] },
  { use: '라우팅 테이블', hint: /라우트 테이블|route table/i, avoid: [/라우트 테이블|(?<![A-Za-z])route tables?(?![A-Za-z])/gu] },
  { use: 'Blue/Green', hint: /lue|블루/i, avoid: [/[Bb]lue-[Gg]reen|blue\/green|블루\s?[/-]?\s?그린/gu] },
  { use: 'Read Replica', hint: /레플리카|복제본/i, avoid: [/리드 레플리카|읽기 (?:전용 )?복제본/gu] },
  { use: '마이크로서비스', hint: /microservice/i, avoid: [/(?<![A-Za-z])microservices?(?![A-Za-z])/gu] },
  { use: '롤백', hint: /롤 백|rollback/i, avoid: [/롤 백|(?<![A-Za-z])rollback(?![A-Za-z])/gu] },
];

// 요약 섹션 판정(H2). 앞쪽 이모지·기호를 떼고, " — 부제" 나 ": 부제" 앞부분만 본다.
const SUMMARY_NAME_RES = [
  /^(?:오늘의\s+|최종\s+|오늘\s+)?(?:핵심\s+)?(?:정리|정리하며|요약|마무리|총정리)$/u,
  /^한\s*(?:줄|문장|장)(?:으로)?\s*(?:요약|정리)/u,
  /^(?:summary|closing thoughts|wrap-?up|recap)$/iu,
];
export const ALLOWED_SUMMARY_NAMES = ['핵심 정리', '정리'];

// ---------------------------------------------------------------------------
// 전처리 (순수 함수)
// ---------------------------------------------------------------------------

/** frontmatter 를 빈 줄로 바꾸고, `## ... 연습 문제` 헤딩 앞까지만 돌려준다. 줄 번호는 유지된다. */
export function extractBody(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let inFront = lines[0] === '---';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFront) {
      out.push('');
      if (i > 0 && line === '---') inFront = false;
      continue;
    }
    if (/^##\s.*연습\s*문제/u.test(line)) break;
    out.push(line);
  }
  return out.join('\n');
}

/** 코드블록·인라인 코드·HTML 주석·링크 URL 을 지운다. 줄 수는 그대로 둔다. */
export function maskCode(body) {
  const lines = body.split('\n');
  let fence = null;
  const out = lines.map((line) => {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      return '';
    }
    if (m) {
      fence = m[1];
      return '';
    }
    return line
      .replace(/(`+)[^`]*?\1/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\]\([^)]*\)/g, ']');
  });
  return out.join('\n').replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ''));
}

/** 따옴표 안(인용한 지문·화면 문구)을 지운다. 존댓말·권유·감탄 판정에만 쓴다. */
export function stripQuotes(line) {
  return line
    .replace(/"[^"\n]*"/g, ' ')
    .replace(/“[^”\n]*”/g, ' ')
    .replace(/‘[^’\n]*’/g, ' ')
    .replace(/「[^」\n]*」/g, ' ')
    .replace(/'[^'\n]*[가-힣][^'\n]*'/g, ' ');
}

/** 같은 줄의 괄호 안을 지운다(첫 등장 병기 허용). 용어 판정에만 쓴다. */
export function stripParens(line) {
  let prev;
  let cur = line;
  do {
    prev = cur;
    cur = cur.replace(/\([^()\n]*\)/g, ' ').replace(/（[^（）\n]*）/g, ' ');
  } while (cur !== prev);
  return cur;
}

// 한글 음절의 받침 번호(종성 인덱스)가 jong 인지. ㅂ=17, ㅆ=20.
function hasJong(ch, jong) {
  const code = ch.codePointAt(0) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 === jong;
}

export function normalizeHeading(text) {
  const head = text
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .split(/\s+[—–-]\s+|\s*:\s*/u)[0]
    .trim();
  return head.replace(/\s+/g, ' ');
}

export function isSummaryHeading(text) {
  const name = normalizeHeading(text);
  return SUMMARY_NAME_RES.some((re) => re.test(name));
}

// ---------------------------------------------------------------------------
// 줄 단위 판정 (순수 함수)
// ---------------------------------------------------------------------------

function collect(re, line) {
  re.lastIndex = 0;
  return [...line.matchAll(re)].map((m) => m[0]);
}

const CHEER_HINT = /fighting|화이팅|파이팅|합격|응원|축하|행운|수고|고생|힘내|성공하세요/iu;

export function findCheer(line) {
  if (!CHEER_HINT.test(line)) return [];
  // "합격을 응원합니다" 처럼 두 패턴이 겹치면 한 건으로 센다.
  const spans = CHEER_RES.flatMap((re) => {
    re.lastIndex = 0;
    return [...line.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const sp of spans) {
    const prev = kept.at(-1);
    if (prev && sp.start < prev.end) {
      if (sp.end > prev.end) {
        prev.text = line.slice(prev.start, sp.end);
        prev.end = sp.end;
      }
    } else kept.push({ ...sp });
  }
  return kept.map((k) => k.text);
}

export function findExclaim(line) {
  return collect(EXCLAIM_RE, stripQuotes(line));
}

export function findHonorific(line) {
  if (!/니다|니까|요|십시오|죠/u.test(line)) return [];
  const s = stripQuotes(line);
  const hits = [];
  for (const m of s.matchAll(NIDA_RE)) if (hasJong(m[1], 17)) hits.push(m[0]);
  hits.push(...collect(YO_RE, s));
  return hits;
}

export function findHortative(line) {
  if (!/[자라]/u.test(line)) return [];
  const s = stripQuotes(line);
  const hits = [];
  for (const m of s.matchAll(HORTATIVE_JA_RE)) {
    // "봤자" 처럼 받침 ㅆ 뒤의 ~자 는 연결어미다.
    const last = m[1].at(-1);
    if (!JA_NOUN_RE.test(m[1] + '자') && !hasJong(last, 20)) hits.push(m[0]);
  }
  for (const m of s.matchAll(HORTATIVE_RA_RE)) {
    if (RA_COMMAND_RE.test(m[1]) && !RA_EXEMPT_RE.test(m[1])) hits.push(m[0]);
  }
  return hits;
}

export function isCallout(line) {
  const m =
    /^\s*>\s*(\p{Extended_Pictographic})/u.exec(line) ||
    /^\s*(\p{Extended_Pictographic})️?\s*\*\*/u.exec(line);
  if (!m) return false;
  return m[1] !== '\u{1F3AF}'; // 🎯 시나리오는 SCS 깊이 보강 계획의 보존 대상이라 세지 않는다
}

const FREQUENCY_HINT = /단골|빈출|매년|매회|해마다|매번|자주|많이|항상|언제나|무조건|흔한|출제|절반|대부분|%/u;

export function findFrequency(line) {
  if (!FREQUENCY_HINT.test(line)) return [];
  return FREQUENCY_RES.flatMap((re) => collect(re, line));
}

export function findTerms(line) {
  const s = stripParens(line);
  const hits = [];
  for (const t of TERMS) {
    if (!t.hint.test(s)) continue;
    for (const re of t.avoid) for (const w of collect(re, s)) hits.push(`${w}→${t.use}`);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 문서 단위 판정
// ---------------------------------------------------------------------------

/**
 * @typedef {{ line: number, match: string, text: string }} Hit
 * @typedef {{ count: number, hits: Hit[] }} RuleResult
 * @returns {Record<string, RuleResult>}
 */
function emptyResult() {
  return Object.fromEntries(RULES.map((r) => [r.id, { count: 0, hits: [] }]));
}

function add(result, id, lineNo, matches, line) {
  if (!matches.length) return;
  result[id].count += matches.length;
  result[id].hits.push({ line: lineNo, match: matches.join(', '), text: line.trim().slice(0, 120) });
}

/**
 * 문서 전체 텍스트를 받아 규칙별 { count, hits } 를 돌려준다.
 * count 는 "고칠 건수" 다. 콜아웃·"핵심은"·요약 중복은 허용치를 뺀 초과분만 센다.
 */
export function auditText(text) {
  const lines = maskCode(extractBody(text)).split('\n');
  const result = emptyResult();
  const callouts = [];
  const cores = [];
  const summaries = [];

  lines.forEach((line, i) => {
    const no = i + 1;
    const h2 = /^##\s+(.+?)\s*#*\s*$/u.exec(line);
    if (h2 && isSummaryHeading(h2[1])) summaries.push({ line: no, text: line });
    if (isCallout(line)) callouts.push({ line: no, text: line });
    for (const m of line.matchAll(/핵심은/gu)) cores.push({ line: no, text: line, at: m.index });

    add(result, 'cheer', no, findCheer(line), line);
    add(result, 'exclaim', no, findExclaim(line), line);
    add(result, 'honorific', no, findHonorific(line), line);
    add(result, 'hortative', no, findHortative(line), line);
    add(result, 'frequency', no, findFrequency(line), line);
    add(result, 'term', no, findTerms(line), line);
  });

  for (const c of callouts.slice(MAX_CALLOUTS)) add(result, 'callout', c.line, ['콜아웃'], c.text);
  for (const c of cores.slice(CORE_ALLOWED)) add(result, 'core', c.line, ['핵심은'], c.text);
  for (const s of summaries.slice(1)) add(result, 'summaryDup', s.line, ['중복 요약'], s.text);
  for (const s of summaries) {
    const name = normalizeHeading(s.text.replace(/^##\s+/, ''));
    if (!ALLOWED_SUMMARY_NAMES.includes(name)) add(result, 'summaryName', s.line, [name], s.text);
  }
  return result;
}

export function totalOf(result) {
  return RULES.reduce((sum, r) => sum + result[r.id].count, 0);
}

/** content/aws-certs/<트랙>/... 이면 <트랙>, 아니면 week 폴더의 부모 이름. */
export function trackOf(filePath) {
  const parts = filePath.split(/[\\/]+/);
  const i = parts.lastIndexOf('aws-certs');
  if (i >= 0 && parts[i + 1]) return parts[i + 1];
  const w = parts.findIndex((p) => /^week\d+$/.test(p));
  return w > 0 ? parts[w - 1] : '(기타)';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function isEnglishEdition(p) {
  return /(^|[\\/])content[\\/]en([\\/]|$)/.test(p);
}

function listFiles(target) {
  if (isEnglishEdition(path.resolve(target))) return [];
  const st = statSync(target);
  if (st.isFile()) return /\.md$/.test(target) ? [target] : [];
  const out = [];
  for (const e of readdirSync(target, { withFileTypes: true })) {
    const p = path.join(target, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (/^day[^/\\]*\.md$/.test(e.name)) out.push(p);
  }
  return out;
}

function sortKey(p) {
  return p.replace(/\d+/g, (d) => d.padStart(4, '0'));
}

function summarize(rows) {
  const tracks = new Map();
  for (const row of rows) {
    const t = tracks.get(row.track) || { track: row.track, files: 0, filesWithIssues: 0, total: 0, rules: {} };
    t.files += 1;
    if (row.total > 0) t.filesWithIssues += 1;
    t.total += row.total;
    for (const r of RULES) t.rules[r.id] = (t.rules[r.id] || 0) + row.result[r.id].count;
    tracks.set(row.track, t);
  }
  const list = [...tracks.values()].sort((a, b) => a.track.localeCompare(b.track));
  const all = { track: '합계', files: 0, filesWithIssues: 0, total: 0, rules: {} };
  for (const t of list) {
    all.files += t.files;
    all.filesWithIssues += t.filesWithIssues;
    all.total += t.total;
    for (const r of RULES) all.rules[r.id] = (all.rules[r.id] || 0) + t.rules[r.id];
  }
  return { tracks: list, all };
}

function printSummary({ tracks, all }) {
  const head = ['트랙', '파일', '위반 파일', '총 위반', ...RULES.map((r) => r.id)];
  console.log(head.join('\t'));
  for (const t of [...tracks, all]) {
    console.log([t.track, t.files, t.filesWithIssues, t.total, ...RULES.map((r) => t.rules[r.id])].join('\t'));
  }
  console.log('\n규칙: ' + RULES.map((r) => `${r.id}=${r.label}`).join(', '));
}

function printFiles(rows, detail) {
  for (const row of rows) {
    if (row.total === 0) continue;
    const parts = RULES.filter((r) => row.result[r.id].count).map((r) => `${r.id}=${row.result[r.id].count}`);
    console.log(`${row.file}\t${row.total}\t${parts.join(' ')}`);
    if (!detail) continue;
    for (const r of RULES) {
      for (const h of row.result[r.id].hits) console.log(`  L${h.line}\t${r.id}\t${h.match}\t| ${h.text}`);
    }
  }
}

export function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const unknown = [...flags].filter((f) => !['--json', '--summary', '--detail'].includes(f));
  if (unknown.length) {
    console.error(`알 수 없는 옵션: ${unknown.join(' ')}\n사용법: node scripts/audit-style.mjs [경로...] [--json] [--summary] [--detail]`);
    return 2;
  }
  const targets = argv.filter((a) => !a.startsWith('--'));
  if (!targets.length) targets.push('content/aws-certs');

  const files = [];
  for (const t of targets) {
    try {
      files.push(...listFiles(t));
    } catch (err) {
      console.error(`경로를 읽을 수 없다: ${t} (${err.code || err.message})`);
      return 2;
    }
  }
  files.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const rows = files.map((file) => {
    const result = auditText(readFileSync(file, 'utf8'));
    return { file: file.split(path.sep).join('/'), track: trackOf(file), total: totalOf(result), result };
  });
  const summary = summarize(rows);

  if (flags.has('--json')) {
    const payload = flags.has('--summary')
      ? summary
      : {
          summary,
          files: rows.map((r) => ({
            file: r.file,
            track: r.track,
            total: r.total,
            counts: Object.fromEntries(RULES.map((x) => [x.id, r.result[x.id].count])),
            ...(flags.has('--detail') ? { hits: Object.fromEntries(RULES.map((x) => [x.id, r.result[x.id].hits])) } : {}),
          })),
        };
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }
  if (flags.has('--summary')) {
    printSummary(summary);
    return 0;
  }
  printFiles(rows, flags.has('--detail'));
  console.log(`\n파일 ${summary.all.files}개 중 위반 ${summary.all.filesWithIssues}개, 총 ${summary.all.total}건`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
