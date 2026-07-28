import type { Dict } from './dict';

/**
 * 앱 껍데기(shell)에서 쓰는 문자열 — 헤더 계정 메뉴, 플로팅 피드백 위젯,
 * 오답 AI 튜터 패널, 가입 직후 온보딩(welcome).
 *
 * 화면별 문구는 `COMMON_STRINGS`에 넣지 않는다. 여러 화면이 공유하는 문구
 * (로그인/로그아웃/대시보드/닫기 등)는 `t(lang, ...)`로 그대로 쓰고, 여기에는
 * 이 네 표면에서만 쓰는 문구만 둔다.
 */
type ShellKey =
  // AuthNav — COMMON_STRINGS에 없는 항목만.
  | 'admin'
  | 'accountMenu'
  // FeedbackWidget
  | 'feedbackOpen'
  | 'feedbackButton'
  | 'feedbackTitle'
  | 'feedbackIntro'
  | 'feedbackPhonePlaceholder'
  | 'feedbackMessagePlaceholder'
  | 'feedbackSubmit'
  | 'feedbackSubmitting'
  | 'feedbackSendFailed'
  | 'feedbackThanks'
  | 'feedbackThanksBody'
  // TutorPanel
  | 'tutorOpen'
  | 'tutorHeading'
  | 'tutorThinking'
  | 'tutorProOnlyTitle'
  | 'tutorProOnlyBody'
  | 'tutorSeeProPlans'
  | 'tutorFollowupPlaceholder'
  | 'tutorSendQuestion'
  | 'tutorRateLimited'
  | 'tutorUnavailable'
  | 'tutorQuestionNotFound'
  | 'tutorLoadFailed'
  // TutorPanel + FeedbackWidget 공용 (COMMON_STRINGS의 networkError와 어투가 달라 별도 유지)
  | 'networkError'
  // Welcome
  | 'welcomeTitle'
  | 'welcomeSubtitle'
  | 'welcomeStep1Title'
  | 'welcomeStep1Body'
  | 'welcomeStep2Title'
  | 'welcomeStep2Body'
  | 'welcomeStep3Title'
  | 'welcomeStep3Body'
  | 'welcomeStep4Title'
  | 'welcomeStep4Body'
  | 'installTitle'
  | 'installBody'
  | 'installIosDevice'
  | 'installIosStep1'
  | 'installIosStep2'
  | 'installIosStep3'
  | 'installAndroidDevice'
  | 'installAndroidStep1'
  | 'installAndroidStep2'
  | 'installAndroidStep3'
  | 'welcomeStart'
  | 'welcomeMetaTitle';

export const shellStrings: Dict<ShellKey> = {
  ko: {
    admin: '관리자',
    accountMenu: '계정 메뉴',

    feedbackOpen: '피드백 보내기',
    feedbackButton: '피드백 ☕',
    feedbackTitle: '피드백 주시면 커피 기프티콘 ☕',
    feedbackIntro: '서비스에 바라는 점·불편한 점을 남겨주세요. 연락처로 기프티콘을 보내드립니다.',
    feedbackPhonePlaceholder: '연락처 (예: 010-1234-5678)',
    feedbackMessagePlaceholder: '피드백 내용 (5자 이상)',
    feedbackSubmit: '보내기',
    feedbackSubmitting: '보내는 중…',
    feedbackSendFailed: '전송에 실패했어요.',
    feedbackThanks: '감사합니다! 🙏',
    feedbackThanksBody: '검토 후 입력하신 연락처로 커피 기프티콘을 보내드릴게요.',

    tutorOpen: 'AI 설명 보기',
    tutorHeading: 'AI 설명',
    tutorThinking: '생각 중…',
    tutorProOnlyTitle: 'AI 오답 튜터는 Pro 전용이에요',
    tutorProOnlyBody: '틀린 문제를 AI가 풀어 설명하고, 추가 질문에도 답해드려요.',
    tutorSeeProPlans: 'Pro 업그레이드 보기',
    tutorFollowupPlaceholder: '추가로 궁금한 점을 물어보세요',
    tutorSendQuestion: '질문 보내기',
    tutorRateLimited: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
    tutorUnavailable: 'AI 튜터가 아직 준비 중이에요.',
    tutorQuestionNotFound: '문제 정보를 찾지 못했어요.',
    tutorLoadFailed: '설명을 불러오지 못했어요.',

    networkError: '네트워크 오류가 발생했어요.',

    welcomeTitle: '환영합니다 🎉',
    welcomeSubtitle: 'CertNote는 이렇게 쓰면 가장 효과적이에요.',
    welcomeStep1Title: '① 목표 자격증을 고르세요',
    welcomeStep1Body: '왼쪽 사이드바에서 자격증을 누르면 시험 정보와 주차별 커리큘럼이 열려요.',
    welcomeStep2Title: '② 매일 한 페이지씩',
    welcomeStep2Body: '하루 분량의 학습 자료를 읽고, 끝의 연습 문제로 바로 확인하세요. 출퇴근 15분이면 충분해요.',
    welcomeStep3Title: '③ 틀린 문제는 자동 복습',
    welcomeStep3Body: '틀린 문항은 복습함에 쌓이고, 잊을 때쯤 다시 나타나요. 알림을 켜두면 매일 챙겨드려요.',
    welcomeStep4Title: '④ 모의고사로 실전 점검',
    welcomeStep4Body: '실제 시험처럼 타이머·채점으로 약점을 데이터로 확인하고 보완하세요.',
    installTitle: '📲 홈 화면에 추가하면 앱처럼 써요',
    installBody: '주소창 없이 한 번에 열리고, 알림도 더 잘 받아요. (30초)',
    installIosDevice: '아이폰 (Safari)',
    installIosStep1: '하단 공유 버튼 (□↑) 탭',
    installIosStep2: "'홈 화면에 추가' 선택",
    installIosStep3: "오른쪽 위 '추가' 탭",
    installAndroidDevice: '갤럭시·안드로이드 (Chrome)',
    installAndroidStep1: '오른쪽 위 메뉴 (⋮) 탭',
    installAndroidStep2: "'홈 화면에 추가' 또는 '앱 설치' 선택",
    installAndroidStep3: "'추가' 탭",
    welcomeStart: '시작하기',
    welcomeMetaTitle: '시작하기 · CertNote',
  },
  en: {
    admin: 'Admin',
    accountMenu: 'Account menu',

    feedbackOpen: 'Send feedback',
    feedbackButton: 'Feedback ☕',
    feedbackTitle: 'Send feedback, get a coffee on us ☕',
    feedbackIntro:
      "Tell us what you'd like to see or what's getting in your way. We'll send a coffee gift card to the contact you leave.",
    feedbackPhonePlaceholder: 'Contact (e.g. 010-1234-5678)',
    feedbackMessagePlaceholder: 'Your feedback (5 characters or more)',
    feedbackSubmit: 'Send',
    feedbackSubmitting: 'Sending…',
    feedbackSendFailed: "We couldn't send your feedback.",
    feedbackThanks: 'Thank you! 🙏',
    feedbackThanksBody: "We'll read it and send a coffee gift card to the contact you left.",

    tutorOpen: 'See AI explanation',
    tutorHeading: 'AI explanation',
    tutorThinking: 'Thinking…',
    tutorProOnlyTitle: 'The AI tutor is Pro-only',
    tutorProOnlyBody: 'AI walks you through the questions you missed and answers your follow-ups.',
    tutorSeeProPlans: 'See Pro plans',
    tutorFollowupPlaceholder: 'Ask a follow-up question',
    tutorSendQuestion: 'Send question',
    tutorRateLimited: 'Too many requests right now. Please try again in a moment.',
    tutorUnavailable: 'The AI tutor is not ready yet.',
    tutorQuestionNotFound: "We couldn't find that question.",
    tutorLoadFailed: "We couldn't load the explanation.",

    networkError: 'A network error occurred.',

    welcomeTitle: 'Welcome 🎉',
    welcomeSubtitle: "Here's how to get the most out of CertNote.",
    welcomeStep1Title: '① Pick your target certification',
    welcomeStep1Body:
      'Tap a certification in the left sidebar to open its exam details and week-by-week curriculum.',
    welcomeStep2Title: '② One page a day',
    welcomeStep2Body:
      "Read the day's lesson, then check yourself with the practice questions at the end. Fifteen minutes on your commute is enough.",
    welcomeStep3Title: '③ Missed questions come back on their own',
    welcomeStep3Body:
      "Anything you get wrong lands in your review queue and resurfaces right before you'd forget it. Turn on notifications and we'll remind you every day.",
    welcomeStep4Title: '④ Check yourself with mock exams',
    welcomeStep4Body:
      'Timed and scored like the real exam, so your weak spots show up as data you can act on.',
    installTitle: '📲 Add it to your home screen and it works like an app',
    installBody: 'It opens in one tap with no address bar, and notifications land more reliably. (30 seconds)',
    installIosDevice: 'iPhone (Safari)',
    installIosStep1: 'Tap the Share button (□↑) at the bottom',
    installIosStep2: "Choose 'Add to Home Screen'",
    installIosStep3: "Tap 'Add' in the top right",
    installAndroidDevice: 'Galaxy / Android (Chrome)',
    installAndroidStep1: 'Tap the menu (⋮) in the top right',
    installAndroidStep2: "Choose 'Add to Home screen' or 'Install app'",
    installAndroidStep3: "Tap 'Add'",
    welcomeStart: 'Get started',
    welcomeMetaTitle: 'Get started · CertNote',
  },
};
