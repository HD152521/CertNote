'use client';

// 문제를 하나라도 풀었다는 신호. Quiz(문항)와 QuizSignupPrompt(문항 목록 아래)는 서로 모르는 사이라 window 이벤트로 잇는다.
const EVENT = 'certnote:quiz-answered';

export function announceQuizAnswered(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onQuizAnswered(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
