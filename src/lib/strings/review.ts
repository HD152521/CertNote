import type { Language } from '../i18n';
import { fmt, type Dict } from './dict';

export type ReviewKey =
  // ReviewSession
  | 'loadFailed'
  | 'gradeFailed'
  | 'loading'
  | 'emptyTitle'
  | 'emptyBody'
  | 'backToStudy'
  | 'doneTitle'
  | 'doneBody'
  | 'viewNotebook'
  | 'toStudy'
  | 'orderDefault'
  | 'orderWeakFirst'
  | 'mockExam'
  | 'checkAnswer'
  | 'correct'
  | 'mastered'
  | 'nextDue'
  | 'nextQuestion'
  | 'finishReview'
  // NotebookList
  | 'notebookLoadFailed'
  | 'notebookEmptyTitle'
  | 'notebookEmptyBody'
  | 'startStudying'
  | 'badgeMastered'
  | 'badgeDue'
  | 'filterAll'
  | 'filterDue'
  | 'filterMastered'
  // review/notebook page headers
  | 'reviewTitle'
  | 'reviewSubtitle'
  | 'notebookLink'
  | 'notebookSubtitle'
  | 'startReviewLink';

export const reviewStrings: Dict<ReviewKey> = {
  ko: {
    loadFailed: '복습 목록을 불러오지 못했습니다.',
    gradeFailed: '채점에 실패했습니다. 다시 시도해 주세요.',
    loading: '불러오는 중…',
    emptyTitle: '지금 복습할 문제가 없어요',
    emptyBody: '연습 문제를 틀리면 이곳에 자동으로 쌓입니다.',
    backToStudy: '학습으로 돌아가기',
    doneTitle: '오늘 복습 완료! ({count}문제)',
    doneBody: '맞힌 문제는 다음 복습일이 미뤄지고, 틀린 문제는 곧 다시 나옵니다.',
    viewNotebook: '오답노트 보기',
    toStudy: '학습으로',
    orderDefault: '기본순',
    orderWeakFirst: '약점부터',
    mockExam: '모의고사',
    checkAnswer: '정답 확인',
    correct: '✓ 정답!',
    mastered: '· 마스터 🎓',
    nextDue: '다음 복습: {due}',
    nextQuestion: '다음 문제 →',
    finishReview: '복습 끝내기',
    notebookLoadFailed: '오답노트를 불러오지 못했습니다.',
    notebookEmptyTitle: '아직 틀린 문제가 없어요',
    notebookEmptyBody: '연습 문제를 풀다가 틀리면 자동으로 여기 모입니다.',
    startStudying: '학습 시작하기',
    badgeMastered: '마스터 🎓',
    badgeDue: '복습 필요',
    filterAll: '전체',
    filterDue: '복습 필요',
    filterMastered: '마스터',
    reviewTitle: '복습',
    reviewSubtitle: '틀린 문제를 간격 반복(Leitner)으로 다시 풉니다.',
    notebookLink: '오답노트',
    notebookSubtitle: '연습 문제를 틀리면 자동으로 모입니다.',
    startReviewLink: '복습 시작',
  },
  en: {
    loadFailed: "Couldn't load your review queue.",
    gradeFailed: "Couldn't grade that answer. Please try again.",
    loading: 'Loading…',
    emptyTitle: 'Nothing to review right now',
    emptyBody: 'Questions you get wrong in practice collect here automatically.',
    backToStudy: 'Back to studying',
    doneTitle: "Today's review is done! ({count})",
    doneBody: 'Questions you got right come back later; the ones you missed return sooner.',
    viewNotebook: 'Open notebook',
    toStudy: 'To studying',
    orderDefault: 'Default order',
    orderWeakFirst: 'Weakest first',
    mockExam: 'Mock exam',
    checkAnswer: 'Check answer',
    correct: '✓ Correct!',
    mastered: '· Mastered 🎓',
    nextDue: 'Next review: {due}',
    nextQuestion: 'Next question →',
    finishReview: 'Finish review',
    notebookLoadFailed: "Couldn't load your notebook.",
    notebookEmptyTitle: 'No missed questions yet',
    notebookEmptyBody: 'Anything you get wrong in practice lands here automatically.',
    startStudying: 'Start studying',
    badgeMastered: 'Mastered 🎓',
    badgeDue: 'Due',
    filterAll: 'All',
    filterDue: 'Due',
    filterMastered: 'Mastered',
    reviewTitle: 'Review',
    reviewSubtitle: 'Missed questions come back on a Leitner spaced-repetition schedule.',
    notebookLink: 'Notebook',
    notebookSubtitle: 'Questions you miss in practice collect here automatically.',
    startReviewLink: 'Start review',
  },
};

// 아래 헬퍼들은 수를 문장에 끼워 넣어야 해서 단순 문자열로 둘 수 없다.
// 영어는 1과 그 외의 형태가 갈리므로 분기를 언어별로 각각 표현한다.

/** "오늘" / "내일" / "3일 뒤" — the next scheduled review for a card. */
export function formatDue(lang: Language, iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return lang === 'en' ? 'today' : '오늘';
  if (days === 1) return lang === 'en' ? 'tomorrow' : '내일';
  return lang === 'en' ? `in ${days} days` : `${days}일 뒤`;
}

/** Leitner box badge for a card that is neither mastered nor due. */
export function formatBox(lang: Language, box: number): string {
  return lang === 'en' ? `Box ${box}` : `${box}단계`;
}

/** "정답 2개 선택" — how many choices a multi-answer question expects. */
export function formatPickCount(lang: Language, count: number): string {
  return lang === 'en' ? `Select ${count} answers` : `정답 ${count}개 선택`;
}

/** "✗ 정답: B,D" — revealed answer after a wrong attempt. */
export function formatWrong(lang: Language, answer: string): string {
  return lang === 'en' ? `✗ Answer: ${answer}` : `✗ 정답: ${answer}`;
}

/** "복습 시작 (7)" — CTA into the review session from the notebook. */
export function formatStartReview(lang: Language, due: number): string {
  return lang === 'en' ? `Start review (${due})` : `복습 시작 (${due})`;
}

/** Completion headline, which carries the session's question count. */
export function formatDoneTitle(lang: Language, count: number): string {
  if (lang === 'en') {
    return `Today's review is done! (${count} ${count === 1 ? 'question' : 'questions'})`;
  }
  return fmt(reviewStrings.ko.doneTitle, { count });
}
