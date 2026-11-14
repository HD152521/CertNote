// 화면 언어별 실습 목록 접근자. labCatalog.ts 는 한국어(원본)만 담아 가볍게 유지하고,
// 영어판은 labCatalogEn.ts 에 있다. 두 파일은 엔진을 import 하지 않는다.
import { LAB_CATALOG, LAB_GROUPS, type LabEntry, type LabKind } from './labCatalog';
import { LAB_CATALOG_EN, LAB_GROUPS_EN } from './labCatalogEn';

export type LabLang = 'ko' | 'en';

export function labCatalogFor(lang: LabLang): LabEntry[] {
  return lang === 'en' ? LAB_CATALOG_EN : LAB_CATALOG;
}

export function labGroupsFor(lang: LabLang): { kind: LabKind; title: string; description: string }[] {
  return lang === 'en' ? LAB_GROUPS_EN : LAB_GROUPS;
}

export function labByIdFor(id: string, lang: LabLang): LabEntry | undefined {
  return labCatalogFor(lang).find((l) => l.id === id);
}

/** 실습 허브 경로. */
export function labHubHref(lang: LabLang): string {
  return lang === 'en' ? '/en/lab' : '/lab';
}

/** 실습 상세 경로. */
export function labHref(id: string, lang: LabLang): string {
  return `${labHubHref(lang)}/${id}`;
}
