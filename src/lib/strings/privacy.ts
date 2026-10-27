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
  | 'collectRequests'
  | 'purposeTitle'
  | 'purposeAccount'
  | 'purposeFeatures'
  | 'purposeNotifications'
  | 'purposeImprovement'
  | 'purposeRequests'
  | 'retentionTitle'
  | 'retentionBody'
  | 'thirdPartyTitle'
  | 'thirdPartyBody'
  | 'adsTitle'
  | 'adsBody'
  | 'adsOptOut'
  | 'rightsTitle'
  | 'rightsBody'
  | 'contactTitle'
  | 'contactLabel'
  | 'backToSignup';

export const privacyStrings: Dict<PrivacyKey> = {
  ko: {
    title: '개인정보처리방침',
    lastUpdated: '최종 업데이트: 2026-10-27',
    intro:
      '주간랩스가 운영하는 CertNote(이하 “서비스”)는 이용자의 개인정보를 중요하게 생각하며, 아래와 같이 수집·이용합니다. 방침이 바뀌면 이 페이지에 변경 내용과 날짜를 알립니다.',

    collectTitle: '1. 수집하는 항목',
    collectRequired: '필수: 이메일, 비밀번호(암호화 저장), 이름, 생년월일, 목표 자격증',
    collectOptional: '선택: 직업, 학습 목적, 현재 수준/경력',
    collectAutomatic: '자동 수집: 학습 기록(진도·정답·복습), 접속 로그, 알림 구독 정보',
    collectBehavior: '이용 행태: 페이지 방문·클릭·체류 등 사용 통계(제품 분석 도구 PostHog를 통해 수집)',
    collectRequests:
      '자격증 요청(선택): 출시 알림을 원할 때 남긴 이메일. 알림을 보낸 뒤 파기합니다. 문제 오류 신고에는 연락처를 받지 않습니다.',

    purposeTitle: '2. 이용 목적',
    purposeAccount: '회원 식별 및 로그인·계정 관리',
    purposeFeatures: '학습 진도·복습·통계 등 서비스 기능 제공',
    purposeNotifications: '학습 알림 발송(동의한 경우)',
    purposeImprovement: '이용 행태 분석을 통한 콘텐츠·서비스 개선(PostHog 등 분석 도구 활용)',
    purposeRequests: '요청받은 자격증의 노트 출시 알림, 신고받은 문제의 오류 수정',

    retentionTitle: '3. 보유 및 이용 기간',
    retentionBody:
      '회원 탈퇴 시 지체 없이 파기합니다. 관계 법령에 따라 별도 보관이 필요한 경우 해당 기간 동안만 보관합니다.',

    thirdPartyTitle: '4. 제3자 제공 및 처리 위탁',
    thirdPartyBody:
      '이용자의 개인정보를 외부에 판매하거나 제공하지 않습니다. 서비스 운영에 필요한 범위에서 인프라·메일·분석 등 처리 위탁이 발생할 수 있으며, 이 경우 수탁자에게 안전조치를 요구합니다.',

    adsTitle: '5. 쿠키와 광고',
    adsBody:
      '서비스는 로그인 유지와 이용 통계를 위해 쿠키를 사용합니다. 또한 Google을 포함한 제3자 광고 사업자가 서비스에 광고를 게재할 수 있으며, 이들 사업자는 쿠키를 사용해 이용자가 이 사이트나 다른 사이트를 방문한 기록을 바탕으로 광고를 보여줄 수 있습니다. Google은 광고 쿠키를 사용해 자사와 파트너가 이용자의 방문 기록에 맞는 광고를 게재합니다.',
    adsOptOut:
      '이용자는 Google 광고 설정에서 맞춤 광고를 끌 수 있고, 브라우저 설정에서 쿠키 저장을 거부할 수 있습니다. 쿠키를 거부하면 로그인 등 일부 기능을 쓸 수 없습니다.',

    rightsTitle: '6. 이용자의 권리',
    rightsBody:
      '이용자는 언제든 본인의 개인정보를 조회·수정하거나(마이페이지), 회원 탈퇴를 통해 삭제를 요청할 수 있습니다.',

    contactTitle: '7. 문의',
    contactLabel: '개인정보 관련 문의:',
    backToSignup: '← 회원가입으로 돌아가기',
  },
  en: {
    title: 'Privacy Policy',
    lastUpdated: 'Last updated: 2026-10-27',
    intro:
      'CertNote (the “Service”), operated by Jugan Labs (주간랩스), treats your personal information as something worth protecting, and collects and uses it as described below. Changes to this policy are posted on this page with their date.',

    collectTitle: '1. What we collect',
    collectRequired: 'Required: email, password (stored encrypted), name, date of birth, target certification',
    collectOptional: 'Optional: occupation, study goals, current level or experience',
    collectAutomatic:
      'Collected automatically: study records (progress, answers, reviews), access logs, notification subscription details',
    collectBehavior:
      'Usage behavior: page views, clicks, time on page, and similar usage statistics (collected through the product analytics tool PostHog)',
    collectRequests:
      'Certification requests (optional): the email you leave for a launch notice. We delete it after sending the notice. Error reports on questions do not ask for contact details.',

    purposeTitle: '2. How we use it',
    purposeAccount: 'Identifying members and handling login and account management',
    purposeFeatures: 'Delivering service features such as progress tracking, review, and statistics',
    purposeNotifications: 'Sending study reminders (where you have opted in)',
    purposeImprovement:
      'Improving content and the service through usage analysis (using analytics tools such as PostHog)',
    purposeRequests: 'Sending launch notices for requested certifications, and fixing reported question errors',

    retentionTitle: '3. Retention period',
    retentionBody:
      'We delete your data without delay when you close your account. Where applicable law requires separate retention, we keep it only for the period that law requires.',

    thirdPartyTitle: '4. Third-party sharing and processing',
    thirdPartyBody:
      'We do not sell or hand your personal information to outside parties. Running the service may require entrusting processing to infrastructure, email, or analytics providers; in those cases we require the processor to maintain appropriate safeguards.',

    adsTitle: '5. Cookies and advertising',
    adsBody:
      'The Service uses cookies to keep you signed in and to measure usage. Third-party vendors, including Google, may also serve ads on the Service, and they may use cookies to show ads based on your prior visits to this site or other sites. Google’s use of advertising cookies enables it and its partners to serve ads based on your visits to this and other sites.',
    adsOptOut:
      'You can turn off personalized advertising in Google Ads Settings, and you can refuse cookies in your browser settings. If you refuse cookies, some features such as sign-in will not work.',

    rightsTitle: '6. Your rights',
    rightsBody:
      'You can view or correct your personal information at any time from My Account, or request its deletion by closing your account.',

    contactTitle: '7. Contact',
    contactLabel: 'Privacy inquiries:',
    backToSignup: '← Back to sign up',
  },
};
