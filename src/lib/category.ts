// 콘텐츠 최상위 카테고리(content/<category>/<slug>/...). URL 경로 세그먼트로도 쓰인다.
// 현재는 단일 카테고리(IT 자격증 모음). 비-AWS 자격증을 추가하거나 카테고리를 분리할 때
// 이 상수를 기준으로 확장하면 라우팅·네비·대시보드가 한 곳에서 따라온다.
// (자격증 슬러그는 이 카테고리 아래 폴더로 추가하면 콘텐츠 레이어가 자동 인식한다.)
export const DEFAULT_CATEGORY = 'aws-certs';

// 영어판 콘텐츠 카테고리(content/en/<slug>/...). URL이 /en/<slug>/weekN/dayM 이 된다.
// 무료 구간(Week1)만 번역해 두는 실험적 트랙 — 문항 id는 한국어판을 재사용한다(같은 문제의 번역).
export const EN_CATEGORY = 'en';
export const SUPPORTED_CATEGORIES = [DEFAULT_CATEGORY, EN_CATEGORY] as const;

export function isSupportedCategory(category: string): boolean {
  return (SUPPORTED_CATEGORIES as readonly string[]).includes(category);
}

export type Lang = 'ko' | 'en';
export function langOfCategory(category: string): Lang {
  return category === EN_CATEGORY ? 'en' : 'ko';
}

import type { CertLevel } from './content';

// 레벨 표시 라벨(영문 티어 명칭). fs 비의존이라 클라이언트 컴포넌트에서도 안전하게 import.
export function certLevelLabel(level: CertLevel): string {
  switch (level) {
    case 'foundational': return 'Foundational';
    case 'associate': return 'Associate';
    case 'professional': return 'Professional';
    case 'specialty': return 'Specialty';
  }
}
