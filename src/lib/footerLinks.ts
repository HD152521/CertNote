import { EN_CATEGORY } from './category';
import { infoHref } from './enEdition';
import { labHubHref } from './labCatalogLang';
import type { Language } from './i18n';

export interface FooterLink {
  href: string;
  label: string;
}

// 푸터 링크의 단일 출처. 서버 렌더 HTML 에 일반 <a href> 로 실려 크롤러가 JS 없이 따라갈 수 있다.
// 영어 화면은 영어 URL 만, 한국어 화면은 한국어 URL 만 건다(언어 토글만 예외).
// 로그인·가입·모의고사 같은 비공개 경로는 넣지 않는다.
const INFO = [
  { href: '/about', ko: '소개', en: 'About' },
  { href: '/changelog', ko: '수정 기록', en: 'Changelog' },
  { href: '/contact', ko: '문의', en: 'Contact' },
  { href: '/terms', ko: '이용약관', en: 'Terms' },
  { href: '/privacy', ko: '개인정보처리방침', en: 'Privacy' },
] as const;

/** 학습 입구: 자격증 허브(섹션), 실습, 로드맵. */
export function footerStudyLinks(lang: Language): FooterLink[] {
  if (lang === 'en') {
    return [
      { href: `/${EN_CATEGORY}`, label: 'Certifications' },
      { href: labHubHref('en'), label: 'Labs' },
      { href: infoHref('/roadmap', 'en'), label: 'Roadmap' },
    ];
  }
  return [
    { href: '/aws', label: 'AWS 자격증' },
    { href: '/linux', label: '리눅스마스터' },
    { href: '/data', label: 'SQLD' },
    { href: labHubHref('ko'), label: '실습' },
    { href: '/roadmap', label: '로드맵' },
  ];
}

/** 소개·정책 문서. */
export function footerInfoLinks(lang: Language): FooterLink[] {
  return INFO.map((l) => ({ href: infoHref(l.href, lang), label: lang === 'en' ? l.en : l.ko }));
}
