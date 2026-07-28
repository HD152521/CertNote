// 콘텐츠 최상위 카테고리(content/<category>/<slug>/...). URL 경로 세그먼트로도 쓰인다.
// 현재는 단일 카테고리(IT 자격증 모음). 비-AWS 자격증을 추가하거나 카테고리를 분리할 때
// 이 상수를 기준으로 확장하면 라우팅·네비·대시보드가 한 곳에서 따라온다.
// (자격증 슬러그는 이 카테고리 아래 폴더로 추가하면 콘텐츠 레이어가 자동 인식한다.)
export const DEFAULT_CATEGORY = 'aws-certs';

// 영어판 콘텐츠 카테고리(content/en/<slug>/...). URL이 /en/<slug>/weekN/dayM 이 된다.
// 무료 구간(Week1)만 번역해 두는 실험적 트랙 — 문항 id는 한국어판을 재사용한다(같은 문제의 번역).
export const EN_CATEGORY = 'en';
export const SUPPORTED_CATEGORIES = [DEFAULT_CATEGORY, EN_CATEGORY] as const;

// ── 섹션(주제) 축 — Phase0 추가(순수 추가, 아직 라우팅/콘텐츠 미배선) ──────────
// category(주제+언어 혼재)를 Section(주제) × Language(언어)로 분리하기 위한 단일 출처.
// 실제 라우팅/콘텐츠 배선은 Phase1(P1-1/P1-3)에서. 여기선 타입·매핑만 도입해 하위호환 유지.
export type Section = 'aws' | 'kubernetes' | 'terraform' | 'linux';

// 현재 콘텐츠가 존재해 라우팅 활성인 섹션. kubernetes·terraform은 콘텐츠 투입(Phase3) 시 추가.
export const SECTIONS: readonly Section[] = ['aws', 'linux'];

// 섹션+언어 → 콘텐츠 디렉터리명(=기존 category 폴더). aws는 폴더 이동 없이 'aws-certs' 유지,
// linux는 Phase1(P1-2)에서 content/linux로 이동 예정. en 트리는 현재 aws Week1만 보유.
export function contentDirOfSection(section: Section, lang: Lang = 'ko'): string {
  if (lang === 'en') return EN_CATEGORY; // Phase3(D4)에서 섹션별 en 재편
  return section === 'aws' ? DEFAULT_CATEGORY : section;
}

// 레거시 category → Section (역매핑). 'aws-certs'·'en'은 모두 aws 주제.
export function sectionOfCategory(category: string): Section {
  if (category === DEFAULT_CATEGORY || category === EN_CATEGORY) return 'aws';
  return category as Section;
}

export function sectionLabel(section: Section): string {
  switch (section) {
    case 'aws': return 'AWS';
    case 'kubernetes': return 'Kubernetes';
    case 'terraform': return 'Terraform';
    case 'linux': return 'Linux';
  }
}

export function isSupportedCategory(category: string): boolean {
  return (SUPPORTED_CATEGORIES as readonly string[]).includes(category);
}

export type Lang = 'ko' | 'en';
export function langOfCategory(category: string): Lang {
  return category === EN_CATEGORY ? 'en' : 'ko';
}

// 레벨 라벨/티어 로직은 levels.ts로 이관(섹션별 티어). 하위호환 위해 여기서 re-export.
// (fs 비의존 유지 — SidebarNav 등 클라이언트 컴포넌트가 안전하게 import)
export { certLevelLabel } from './levels';
