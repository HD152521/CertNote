'use client';

import { useEffect, useState } from 'react';
import { onQuizAnswered } from '@/lib/quiz/answeredEvent';
import { SignupPrompt } from './SignupPrompt';

// 문제를 하나라도 푼 뒤에만, 문항 목록 아래에 나타난다(풀기 전에는 아무것도 없다).
export function QuizSignupPrompt() {
  const [answered, setAnswered] = useState(false);
  useEffect(() => onQuizAnswered(() => setAnswered(true)), []);
  return <SignupPrompt placement="quiz_answered" message="quizAnswered" active={answered} />;
}
