import type { Dict } from './dict';

/**
 * 홈(한국어 `/`, 영어 `/en`) 공용 히어로·자격증 영역 문구.
 *
 * 두 홈이 같은 컴포넌트(HomeHero, HeroSlot, FeaturedCerts)를 쓰므로 문구는 여기 ko/en 쌍으로만 둔다.
 * 키가 한쪽에만 있으면 타입 오류가 난다. `{name}` 자리는 `fmt` 로 채운다.
 *
 * ⚠️ h1Lead·h1Tail·introLead·introStrong 은 SEO 문구다 — 글자를 바꾸면 안 된다(한국어는 기존 Landing,
 * 영어는 기존 en/page 와 같은 글자).
 */
export type HomeKey =
  // 히어로 본문
  | 'eyebrow'
  | 'h1Lead'
  | 'h1Tail'
  | 'introLead'
  | 'introStrong'
  | 'note'
  | 'primaryCta'
  | 'browseCta'
  // 히어로 대표 카드 / 이어서 읽기 자리
  | 'slotFeatured'
  | 'slotResume'
  | 'slotResumeMidway'
  | 'slotStart'
  | 'slotContinue'
  | 'bulletLength'
  | 'bulletDaily'
  | 'bulletAccount'
  | 'resumeMeta'
  // 자격증 영역
  | 'tracksHeading'
  | 'tracksLead'
  | 'tileStart'
  | 'groupAws'
  | 'groupLinux'
  | 'groupData'
  | 'groupOther'
  | 'tracksIndexLabel';

export const homeStrings: Dict<HomeKey> = {
  ko: {
    eyebrow: '한국어 노트 · 연습문제 · 복습으로 준비하는 AWS 자격증 독학 사이트',
    h1Lead: '한국어로 배우는',
    h1Tail: 'AWS 자격증 합격 가이드',
    introLead:
      '주차별 구조화된 커리큘럼 • 매일 {minutes}분 안팎 심화 노트 • 연습문제·모의고사·간격반복 복습까지. 전 과정 무료.',
    introStrong: '',
    note: '✓ 전 주차 노트·연습문제 로그인 없이 열람 • ✓ 모의고사·복습·AI 설명은 무료 가입 후 이용',
    primaryCta: '무료로 시작하기',
    browseCta: '자격증 둘러보기',
    slotFeatured: '대표 트랙',
    slotResume: '이어서 보기',
    slotResumeMidway: '읽던 곳부터 이어서 보기',
    slotStart: 'Week 1부터 시작',
    slotContinue: '이어서 보기',
    bulletLength: '{weeks}주 · 총 {days}일 커리큘럼',
    bulletDaily: '매일 {minutes}분 안팎 심화 노트 + 연습 문제',
    bulletAccount: '실전 모의고사 · 간격반복 복습 (무료 가입 후 이용)',
    resumeMeta: '{code} · {week}주차 {day}일차',
    tracksHeading: '자격증 트랙 {n}개',
    tracksLead: '입문용 Cloud Practitioner와 리눅스마스터 트랙도 같은 구조(주차별 노트, 하루 한 편, 연습 문제)로 열려 있습니다.',
    tileStart: 'Week 1부터 보기',
    groupAws: 'AWS',
    groupLinux: '리눅스마스터',
    groupData: 'SQLD',
    groupOther: '기타',
    tracksIndexLabel: '전체 자격증 트랙',
  },
  en: {
    eyebrow: 'Free certification study notes, fully in English',
    h1Lead: 'Certification prep, ',
    h1Tail: 'one day at a time',
    introLead:
      'In-depth daily study notes for 11 AWS certifications, SQL Developer (SQLD) and Linux Master Level 1 and 2 — written to be read on your commute, with practice questions after every lesson. ',
    introStrong: 'Everything is free to read, and every track is fully available in English.',
    note: 'Notes and practice questions need no sign-up; mock exams and spaced-repetition review are free with an account.',
    primaryCta: 'Start free',
    browseCta: 'Browse all tracks',
    slotFeatured: 'Featured track',
    slotResume: 'Continue reading',
    slotResumeMidway: 'Resume where you stopped',
    slotStart: 'Start with Week 1',
    slotContinue: 'Continue',
    bulletLength: '{weeks} weeks · {days} days of notes',
    bulletDaily: 'About {minutes} minutes a day: one deep note plus practice questions',
    bulletAccount: 'Mock exams and spaced-repetition review (free with an account)',
    resumeMeta: '{code} · Week {week}, Day {day}',
    tracksHeading: 'All {n} tracks',
    tracksLead: 'Every track has the same shape: weekly notes, one lesson a day, practice questions at the end.',
    tileStart: 'Start Week 1',
    groupAws: 'AWS',
    groupLinux: 'Linux Master',
    groupData: 'SQL Developer (SQLD)',
    groupOther: 'Other',
    tracksIndexLabel: 'All certification tracks',
  },
};
