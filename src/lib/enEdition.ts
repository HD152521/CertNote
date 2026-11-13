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
