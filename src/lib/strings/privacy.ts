import type { Dict } from './dict';

/**
 * `/privacy` 화면 전용 문자열.
 *
 * 법적 고지 문안이라 영문판도 의미가 그대로 보존돼야 한다. 다만 한국 개인정보보호법
 * 기준으로 작성된 원문이므로, 영문은 같은 내용의 안내이지 별도의 법적 효력을 갖는
 * 번역본이 아니다.
 */
export type PrivacyKey =
  | 'title'
  | 'lastUpdated'
  | 'intro'
  | 'collectTitle'
  | 'collectRequired'
  | 'collectOptional'
  | 'collectAutomatic'
  | 'collectBehavior'
  | 'purposeTitle'
  | 'purposeAccount'
  | 'purposeFeatures'
  | 'purposeNotifications'
  | 'purposeImprovement'
  | 'retentionTitle'
  | 'retentionBody'
  | 'thirdPartyTitle'
  | 'thirdPartyBody'
  | 'rightsTitle'
  | 'rightsBody'
  | 'contactTitle'
  | 'contactLabel'
  | 'backToSignup';

export const privacyStrings: Dict<PrivacyKey> = {
  ko: {
    title: '개인정보처리방침',
    lastUpdated: '최종 업데이트: 2026-06-25',
    intro:
      'CertNote(이하 “서비스”)는 이용자의 개인정보를 중요하게 생각하며, 아래와 같이 수집·이용합니다. 본 방침은 서비스 개선을 위한 베타 테스트 단계 기준이며, 정식 출시 시 갱신될 수 있습니다.',

    collectTitle: '1. 수집하는 항목',
    collectRequired: '필수: 이메일, 비밀번호(암호화 저장), 이름, 생년월일, 목표 자격증',
    collectOptional: '선택: 직업, 학습 목적, 현재 수준/경력',
    collectAutomatic: '자동 수집: 학습 기록(진도·정답·복습), 접속 로그, 알림 구독 정보',
    collectBehavior: '이용 행태: 페이지 방문·클릭·체류 등 사용 통계(제품 분석 도구 PostHog를 통해 수집)',

    purposeTitle: '2. 이용 목적',
    purposeAccount: '회원 식별 및 로그인·계정 관리',
    purposeFeatures: '학습 진도·복습·통계 등 서비스 기능 제공',
    purposeNotifications: '학습 알림 발송(동의한 경우)',
    purposeImprovement: '이용 행태 분석을 통한 콘텐츠·서비스 개선(PostHog 등 분석 도구 활용)',

    retentionTitle: '3. 보유 및 이용 기간',
    retentionBody:
      '회원 탈퇴 시 지체 없이 파기합니다. 관계 법령에 따라 별도 보관이 필요한 경우 해당 기간 동안만 보관합니다.',

    thirdPartyTitle: '4. 제3자 제공 및 처리 위탁',
    thirdPartyBody:
      '이용자의 개인정보를 외부에 판매하거나 제공하지 않습니다. 서비스 운영에 필요한 범위에서 인프라·메일·결제 등 처리 위탁이 발생할 수 있으며, 이 경우 수탁자에게 안전조치를 요구합니다.',

    rightsTitle: '5. 이용자의 권리',
    rightsBody:
      '이용자는 언제든 본인의 개인정보를 조회·수정하거나(마이페이지), 회원 탈퇴를 통해 삭제를 요청할 수 있습니다.',

    contactTitle: '6. 문의',
    contactLabel: '개인정보 관련 문의:',
    backToSignup: '← 회원가입으로 돌아가기',
  },
  en: {
    title: 'Privacy Policy',
    lastUpdated: 'Last updated: 2026-06-25',
    intro:
      'CertNote (the “Service”) treats your personal information as something worth protecting, and collects and uses it as described below. This policy reflects the beta testing phase and may be updated at general release.',

    collectTitle: '1. What we collect',
    collectRequired: 'Required: email, password (stored encrypted), name, date of birth, target certification',
    collectOptional: 'Optional: occupation, study goals, current level or experience',
    collectAutomatic:
      'Collected automatically: study records (progress, answers, reviews), access logs, notification subscription details',
    collectBehavior:
      'Usage behavior: page views, clicks, time on page, and similar usage statistics (collected through the product analytics tool PostHog)',

    purposeTitle: '2. How we use it',
    purposeAccount: 'Identifying members and handling login and account management',
    purposeFeatures: 'Delivering service features such as progress tracking, review, and statistics',
    purposeNotifications: 'Sending study reminders (where you have opted in)',
    purposeImprovement:
      'Improving content and the service through usage analysis (using analytics tools such as PostHog)',

    retentionTitle: '3. Retention period',
    retentionBody:
      'We delete your data without delay when you close your account. Where applicable law requires separate retention, we keep it only for the period that law requires.',

    thirdPartyTitle: '4. Third-party sharing and processing',
    thirdPartyBody:
      'We do not sell or hand your personal information to outside parties. Running the service may require entrusting processing to infrastructure, email, or payment providers; in those cases we require the processor to maintain appropriate safeguards.',

    rightsTitle: '5. Your rights',
    rightsBody:
      'You can view or correct your personal information at any time from My Account, or request its deletion by closing your account.',

    contactTitle: '6. Contact',
    contactLabel: 'Privacy inquiries:',
    backToSignup: '← Back to sign up',
  },
};
