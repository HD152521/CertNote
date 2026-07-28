import type { Dict } from './dict';

/**
 * `/pricing` 화면 전용 문자열.
 *
 * 가격(₩0 · ₩9,900)과 ✅/❌ 기호는 두 언어에서 같은 글자라 사전에 넣지 않고
 * 컴포넌트에 그대로 둔다. 언어에 따라 달라지는 셀만 여기에 있다.
 */
export type PricingKey =
  | 'headline'
  | 'sublineA'
  | 'sublineB'
  | 'freePriceNote'
  | 'freeDesc'
  | 'freeCta'
  | 'freeWeek1'
  | 'freeQuiz'
  | 'freeProgress'
  | 'freeDashboard'
  | 'freeAllWeeks'
  | 'freeMockExams'
  | 'freeSrs'
  | 'proBadge'
  | 'proPricePeriod'
  | 'proPriceNote'
  | 'proSavings'
  | 'proCurriculum'
  | 'proMockExams'
  | 'proSrs'
  | 'proStats'
  | 'proNewCerts'
  | 'waitlistNote'
  | 'comparisonHeading'
  | 'comparisonFeature'
  | 'cmpPrice'
  | 'cmpKorean'
  | 'cmpSrs'
  | 'cmpCurriculum'
  | 'cmpCurriculumFree'
  | 'cmpCurriculumPro'
  | 'cmpMockExam'
  | 'cmpMockExamUdemy'
  | 'faqHeading'
  | 'faqDurationQ'
  | 'faqDurationA'
  | 'faqFreeQ'
  | 'faqFreeA'
  | 'faqCertsQ'
  | 'faqCertsA'
  | 'faqUpgradeQ'
  | 'faqUpgradeA'
  | 'faqCancelQ'
  | 'faqCancelA'
  | 'ctaHeading'
  | 'ctaBody'
  | 'ctaButton'
  | 'haveAccount'
  | 'loginLink';

export const pricingStrings: Dict<PricingKey> = {
  ko: {
    headline: '경쟁사보다 60% 저렴합니다',
    sublineA: 'Coursera는 ₩40-49K, CertNote는 ₩9,900.',
    sublineB: '한국어 + SRS 복습은 덤입니다.',

    freePriceNote: '영원히 무료',
    freeDesc: 'Week 1 전체 콘텐츠로 기초를 다지세요.',
    freeCta: '무료로 시작',
    freeWeek1: '각 자격증 Week 1 전체 학습 자료',
    freeQuiz: 'Week 1 인터랙티브 퀴즈',
    freeProgress: '학습 진도 저장',
    freeDashboard: '기본 대시보드',
    freeAllWeeks: '전체 자료 (Week 2~16)',
    freeMockExams: '모의고사 8회',
    freeSrs: 'SRS 무제한 복습',

    proBadge: '추천',
    proPricePeriod: ' / 월',
    proPriceNote: '언제든 해지 가능',
    proSavings: '💰 Coursera(₩40-49K)보다 75% 저렴',
    proCurriculum: 'AWS 11종 + 리눅스마스터 전체 학습 자료',
    proMockExams: '실전 모의고사 8회 (타이머 · 합/불 채점)',
    proSrs: '무제한 간격반복 복습 (SRS) · 오답노트',
    proStats: '자격증별 진척 · 정답률 상세 통계',
    proNewCerts: '출시되는 신규 자격증 자동 포함',
    waitlistNote: '결제 기능은 준비 중이에요. 출시되면 가장 먼저 알려드릴게요.',

    comparisonHeading: '경쟁사 vs CertNote',
    comparisonFeature: '기능',
    cmpPrice: '가격 (월)',
    cmpKorean: '한국어',
    cmpSrs: 'SRS 복습',
    cmpCurriculum: '주차별 커리큘럼',
    cmpCurriculumFree: 'Week 1만',
    cmpCurriculumPro: '✅ 전체',
    cmpMockExam: '실전 모의고사',
    cmpMockExamUdemy: '별도',

    faqHeading: '자주 묻는 질문',
    faqDurationQ: 'SAA-C03 합격까지 몇 주 걸려요?',
    faqDurationA:
      '평균 12주입니다. CertNote의 주차별 커리큘럼을 따르면 주당 5-7시간 학습으로 12주 안에 완료 가능합니다. 더 빨리 진도를 나가거나 느리게 진도를 나갈 수 있습니다.',
    faqFreeQ: 'Week 1 무료로도 충분히 배울 수 있나요?',
    faqFreeA:
      '네, Week 1은 AWS의 핵심 개념(EC2, S3, IAM, RDS 등)을 다룹니다. 기초를 잘 이해하고 싶다면 Week 1만으로도 의미 있습니다. 하지만 실제 시험 합격을 목표라면 Week 2~16 Pro 콘텐츠가 필수입니다.',
    faqCertsQ: '다른 자격증도 포함되나요?',
    faqCertsA:
      '네, Pro 구독으로 AWS 자격증 11종(Cloud Practitioner·SAA·SOA·DVA·SAP·DOP·Security·ML·Data Engineer 등) + 리눅스마스터 1급 모두 접근 가능합니다.',
    faqUpgradeQ: 'Free에서 Pro로 전환하면 진도가 초기화되나요?',
    faqUpgradeA:
      '아니요, 학습 진도, 오답, 모든 기록이 유지됩니다. Free에서 Week 1을 공부하다가 Pro로 전환하면 바로 Week 2부터 시작할 수 있습니다.',
    faqCancelQ: '구독 취소는 언제든 가능한가요?',
    faqCancelA: '네, 언제든 해지 가능합니다. 구독료는 다음 갱신일 전에 해지하면 청구되지 않습니다.',

    ctaHeading: '아직 결정이 안 섰나요?',
    ctaBody: 'Week 1 무료로 시작해보세요. 신용카드 불필요합니다.',
    ctaButton: '지금 무료로 시작 →',
    haveAccount: '이미 계정이 있나요?',
    loginLink: '로그인',
  },
  en: {
    headline: '60% cheaper than the alternatives',
    sublineA: 'Coursera runs ₩40-49K a month. CertNote is ₩9,900.',
    sublineB: 'Spaced-repetition review comes with it.',

    freePriceNote: 'Free forever',
    freeDesc: 'Get your fundamentals down with all of Week 1.',
    freeCta: 'Start for free',
    freeWeek1: 'Every Week 1 lesson, for every certification',
    freeQuiz: 'Week 1 interactive quizzes',
    freeProgress: 'Saved study progress',
    freeDashboard: 'Basic dashboard',
    freeAllWeeks: 'Full curriculum (Weeks 2-16)',
    freeMockExams: '8 mock exams',
    freeSrs: 'Unlimited spaced-repetition review',

    proBadge: 'Popular',
    proPricePeriod: ' / month',
    proPriceNote: 'Cancel anytime',
    proSavings: '💰 75% cheaper than Coursera (₩40-49K)',
    proCurriculum: 'Full curriculum for 11 AWS certifications + Linux Master',
    proMockExams: '8 full mock exams (timed, pass/fail scored)',
    proSrs: 'Unlimited spaced-repetition review and a missed-question notebook',
    proStats: 'Per-certification progress and accuracy breakdowns',
    proNewCerts: 'New certifications included the day they launch',
    waitlistNote: "Checkout isn't live yet. Leave your email and you'll be the first to know.",

    comparisonHeading: 'CertNote vs. the alternatives',
    comparisonFeature: 'Feature',
    cmpPrice: 'Price (monthly)',
    cmpKorean: 'Korean',
    cmpSrs: 'Spaced repetition',
    cmpCurriculum: 'Week-by-week curriculum',
    cmpCurriculumFree: 'Week 1 only',
    cmpCurriculumPro: '✅ All weeks',
    cmpMockExam: 'Full mock exams',
    cmpMockExamUdemy: 'Sold separately',

    faqHeading: 'Frequently asked questions',
    faqDurationQ: 'How many weeks does it take to pass SAA-C03?',
    faqDurationA:
      'Twelve weeks on average. Following the week-by-week curriculum at 5-7 hours a week gets you through it in 12 weeks — and nothing stops you from moving faster or slower.',
    faqFreeQ: 'Can I learn enough from the free Week 1 alone?',
    faqFreeA:
      "Yes — Week 1 covers the core AWS concepts (EC2, S3, IAM, RDS, and more), so it's genuinely useful if you just want the fundamentals. If you're aiming to pass the exam, though, the Pro content in Weeks 2-16 is essential.",
    faqCertsQ: 'Are other certifications included?',
    faqCertsA:
      'Yes. One Pro subscription covers all 11 AWS certifications (Cloud Practitioner, SAA, SOA, DVA, SAP, DOP, Security, ML, Data Engineer, and more) plus Linux Master Level 1.',
    faqUpgradeQ: 'Does upgrading from Free to Pro reset my progress?',
    faqUpgradeA:
      'No. Your progress, missed questions, and full history all carry over. If you studied Week 1 on Free, you pick up right at Week 2 after upgrading.',
    faqCancelQ: 'Can I cancel anytime?',
    faqCancelA:
      "Yes, cancel whenever you like. Cancel before your next renewal date and you won't be charged again.",

    ctaHeading: 'Still deciding?',
    ctaBody: 'Start with Week 1 for free. No credit card needed.',
    ctaButton: 'Start free now →',
    haveAccount: 'Already have an account?',
    loginLink: 'Log in',
  },
};
