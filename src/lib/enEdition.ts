import type { Section } from './category';

// 영어판(content/en)이 있는 자격증 중 aws 섹션이 아닌 것. aws 섹션은 11개 트랙 모두 영어판이 있어
// 목록 없이 통과시키고, 그 밖의 섹션은 여기에 슬러그 → 섹션으로 적는다.
// fs 비의존 — 클라이언트 컴포넌트(LangToggle)가 import 한다. content/en/index.json 과 어긋나지
// 않는지는 enEdition.test.ts 가 검사한다.
export const EN_EDITION_NON_AWS: Readonly<Record<string, Section>> = {
  sqld: 'data',
  'linux-master-1': 'linux',
  'linux-master-2': 'linux',
};

export function hasEnglishEdition(section: Section, slug: string): boolean {
  return section === 'aws' || EN_EDITION_NON_AWS[slug] === section;
}

// 영어판 자격증의 한국어 짝이 있는 섹션.
export function koSectionOfEnglishSlug(slug: string): Section {
  return EN_EDITION_NON_AWS[slug] ?? 'aws';
}

// ── 정보 페이지(소개·로드맵·수정 기록·문의·약관·개인정보처리방침) 영어판 ─────────────────────
// 한국어 정보 페이지와 /en/... 영어판의 1:1 짝. 푸터·헤더 링크, LangToggle, hreflang, 사이트맵,
// 프록시(존재 검증 우회)가 모두 이 표 하나를 본다. 직무 로드맵 slug 는 content/roadmaps.json 과
// 어긋나지 않는지 enInfoPages.test.ts 가 검사한다.
export const EN_ROADMAP_ROLE_SLUGS: readonly string[] = [
  'solutions-architect',
  'developer',
  'sysops-devops',
  'data-engineer',
  'ml-ai',
  'security',
];

const EN_INFO_ROOTS: readonly string[] = ['/about', '/about/how-we-make', '/roadmap', '/changelog', '/contact', '/terms', '/privacy'];

export const EN_INFO_PAIRS: ReadonlyArray<{ ko: string; en: string }> = [
  ...EN_INFO_ROOTS.map((ko) => ({ ko, en: `/en${ko}` })),
  ...EN_ROADMAP_ROLE_SLUGS.map((slug) => ({ ko: `/roadmap/${slug}`, en: `/en/roadmap/${slug}` })),
];

/** 한국어 정보 페이지의 영어판 경로. 짝이 없으면 undefined. */
export function enInfoPathOf(koPath: string): string | undefined {
  return EN_INFO_PAIRS.find((p) => p.ko === koPath)?.en;
}

/** 영어 정보 페이지의 한국어판 경로. 짝이 없으면 undefined. */
export function koInfoPathOf(enPath: string): string | undefined {
  return EN_INFO_PAIRS.find((p) => p.en === enPath)?.ko;
}

/** 영어 정보 페이지 경로인가(프록시가 콘텐츠 존재 검증 대신 통과시킨다). */
export function isEnInfoPath(pathname: string): boolean {
  return EN_INFO_PAIRS.some((p) => p.en === pathname);
}

/** 한국어 정보 페이지 경로를 화면 언어에 맞는 링크로 바꾼다. 영어판이 없으면 원래 경로. */
export function infoHref(koPath: string, lang: 'ko' | 'en'): string {
  return lang === 'en' ? (enInfoPathOf(koPath) ?? koPath) : koPath;
}
