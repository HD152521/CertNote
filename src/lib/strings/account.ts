import type { Dict } from './dict';

/**
 * 계정 / 프로필 / 온보딩 / 알림 설정 화면 전용 문자열.
 *
 * 이름·생년월일·저장·취소처럼 다른 화면과 공유하는 문구는 `COMMON_STRINGS`(`../i18n`)에
 * 이미 있으므로 여기 두지 않는다. 여기 있는 건 이 네 화면에서만 쓰이는 것들이다.
 */
export type AccountStringKey =
  // 온보딩 프로필 보완 폼
  | 'onboardingTitle'
  | 'onboardingSubtitle'
  | 'showExtraInfo'
  | 'hideExtraInfo'
  | 'saveAndStart'
  | 'saveFailedRetry'
  | 'doThisLater'
  | 'doThisLaterHint'
  // 마이페이지 프로필 섹션
  | 'personalInfo'
  | 'studyInfo'
  | 'studyInfoHint'
  | 'optionalTag'
  | 'saveFailed'
  | 'profileSaved'
  | 'saveProfile'
  // 비밀번호 변경 / 계정 삭제
  | 'currentPasswordPlaceholder'
  | 'newPasswordPlaceholder'
  | 'passwordChangeFailed'
  | 'passwordUpdated'
  | 'deleteAccount'
  | 'deleteAccountWarning'
  | 'deleteAccountCta'
  | 'deleteConfirmPlaceholder'
  | 'deleteFailed'
  | 'deleting'
  | 'deletePermanently'
  // 알림 설정
  | 'studyNotifications'
  | 'studyNotificationsDesc'
  | 'pushUnsupportedDetail'
  | 'enablingNotifications'
  | 'enableOnThisDevice'
  | 'disableOnThisDevice'
  | 'enableFailed'
  | 'reviewReminder'
  | 'reviewReminderHint'
  | 'comebackReminder'
  | 'comebackReminderHint'
  | 'reminderTime'
  | 'reasonUnsupported'
  | 'reasonDenied'
  | 'reasonNoKey'
  | 'reasonSaveFailed'
  | 'reasonSubscribeFailed'
  | 'amLabel'
  | 'pmLabel'
  /** `{hour}` / `{period}` 자리표시자를 포함한다. 언어마다 어순이 달라 조각을 이어붙이지 않는다. */
  | 'hourPattern';

export const accountStrings: Dict<AccountStringKey> = {
  ko: {
    onboardingTitle: '거의 다 왔어요',
    onboardingSubtitle:
      '학습 추천과 D-day 플랜에 쓰이는 기본 정보예요. 지금 등록하면 대시보드가 바로 목표에 맞춰집니다.',
    showExtraInfo: '추가 정보 입력 (선택)',
    hideExtraInfo: '추가 정보 접기',
    saveAndStart: '저장하고 시작하기',
    saveFailedRetry: '저장에 실패했습니다. 다시 시도해 주세요.',
    doThisLater: '나중에 하기',
    doThisLaterHint: '— 계정 설정에서 언제든 등록할 수 있어요.',

    personalInfo: '개인정보',
    studyInfo: '학습 정보',
    studyInfoHint: '맞춤 추천에 사용됩니다',
    optionalTag: '선택',
    saveFailed: '저장에 실패했습니다.',
    profileSaved: '저장되었습니다.',
    saveProfile: '프로필 저장',

    currentPasswordPlaceholder: '현재 비밀번호',
    newPasswordPlaceholder: '새 비밀번호 (8자 이상)',
    passwordChangeFailed: '변경에 실패했습니다.',
    passwordUpdated: '비밀번호가 변경되었습니다.',
    deleteAccount: '계정 삭제',
    deleteAccountWarning: '계정을 삭제하면 학습 기록과 복습 데이터가 모두 영구 삭제되며 복구할 수 없습니다.',
    deleteAccountCta: '계정 삭제하기',
    deleteConfirmPlaceholder: '확인을 위해 비밀번호를 입력하세요',
    deleteFailed: '삭제에 실패했습니다.',
    deleting: '삭제 중…',
    deletePermanently: '영구 삭제',

    studyNotifications: '학습 알림',
    studyNotificationsDesc: '복습할 카드가 쌓이면, 또는 한동안 안 들어오면 알려드려요.',
    pushUnsupportedDetail: '이 브라우저는 푸시 알림을 지원하지 않습니다. iPhone은 홈 화면에 추가한 뒤 사용할 수 있어요.',
    enablingNotifications: '설정 중…',
    enableOnThisDevice: '이 기기에서 알림 켜기',
    disableOnThisDevice: '이 기기에서 알림 끄기',
    enableFailed: '알림을 켜지 못했습니다.',
    reviewReminder: '복습 리마인더',
    reviewReminderHint: '복습할 카드가 있는 날 알림',
    comebackReminder: '복귀 알림',
    comebackReminderHint: '3일 이상 안 들어오면 알림',
    reminderTime: '알림 받을 시각',
    reasonUnsupported: '이 브라우저는 알림을 지원하지 않습니다.',
    reasonDenied: '브라우저에서 알림 권한이 차단되어 있어요. 사이트 설정에서 허용해 주세요.',
    reasonNoKey: '서버 알림 설정이 누락되었습니다. 잠시 후 다시 시도해 주세요.',
    reasonSaveFailed: '구독 저장에 실패했습니다. 다시 시도해 주세요.',
    reasonSubscribeFailed: '알림 구독에 실패했습니다. 다시 시도해 주세요.',
    amLabel: '오전',
    pmLabel: '오후',
    hourPattern: '{period} {hour}시',
  },
  en: {
    onboardingTitle: "You're almost set",
    onboardingSubtitle:
      'Just the basics behind your study recommendations and D-day plan. Fill them in now and your dashboard lines up with your goal right away.',
    showExtraInfo: 'Add more details (optional)',
    hideExtraInfo: 'Hide extra details',
    saveAndStart: 'Save and get started',
    saveFailedRetry: "Couldn't save your profile. Please try again.",
    doThisLater: 'Do this later',
    doThisLaterHint: '— you can add this anytime from account settings.',

    personalInfo: 'Personal details',
    studyInfo: 'Study details',
    studyInfoHint: 'Used for personalized recommendations',
    optionalTag: 'Optional',
    saveFailed: "Couldn't save your profile.",
    profileSaved: 'Saved.',
    saveProfile: 'Save profile',

    currentPasswordPlaceholder: 'Current password',
    newPasswordPlaceholder: 'New password (at least 8 characters)',
    passwordChangeFailed: "Couldn't change your password.",
    passwordUpdated: 'Your password has been changed.',
    deleteAccount: 'Delete account',
    deleteAccountWarning:
      'Deleting your account permanently erases your study history and review data. This cannot be undone.',
    deleteAccountCta: 'Delete my account',
    deleteConfirmPlaceholder: 'Enter your password to confirm',
    deleteFailed: "Couldn't delete your account.",
    deleting: 'Deleting…',
    deletePermanently: 'Delete permanently',

    studyNotifications: 'Study reminders',
    studyNotificationsDesc: "We'll nudge you when review cards pile up, or if you've been away for a while.",
    pushUnsupportedDetail:
      'This browser does not support push notifications. On iPhone, add this site to your Home Screen first.',
    enablingNotifications: 'Setting up…',
    enableOnThisDevice: 'Turn on notifications for this device',
    disableOnThisDevice: 'Turn off notifications on this device',
    enableFailed: "Couldn't turn on notifications.",
    reviewReminder: 'Review reminder',
    reviewReminderHint: 'Notifies you on days you have cards to review',
    comebackReminder: 'Comeback reminder',
    comebackReminderHint: "Notifies you if you haven't visited in 3 days",
    reminderTime: 'Reminder time',
    reasonUnsupported: 'This browser does not support notifications.',
    reasonDenied: 'Notifications are blocked in your browser. Please allow them in your site settings.',
    reasonNoKey: 'Notification settings are missing on the server. Please try again shortly.',
    reasonSaveFailed: "Couldn't save your subscription. Please try again.",
    reasonSubscribeFailed: "Couldn't subscribe to notifications. Please try again.",
    amLabel: 'AM',
    pmLabel: 'PM',
    hourPattern: '{hour} {period}',
  },
};
