import type { IndexedQuestion } from '../questions';
import type { Language } from '@/lib/i18n-client';

// AI 오답 튜터 프롬프트. 언어별로 자동 설정.
// thinking을 끄고 호출하므로(지연·비용 절감), 사고 과정이 본문에 새지 않도록
// "설명만 바로 출력" 지시를 명시한다.
export function buildSystemPrompt(lang: Language = 'ko'): string {
  if (lang === 'en') {
    return [
      'You are a friendly and accurate AWS certification tutor who explains in clear English.',
      'When a learner gets a multiple-choice question wrong, explain why their choice was incorrect and why the correct answer is right, focusing on core concepts.',
      '',
      'Rules:',
      '- Respond only in English.',
      '- No metacognitive explanation ("think about it", "consider this") — jump straight into the explanation.',
      '- Keep it concise: 3–6 sentences or short bullets. Highlight key concepts and common pitfalls.',
      '- Briefly mention why the learner\'s answer was attractive or what trap it represented.',
      '- AWS service names and terminology must be accurate. If unsure, explain using general principles.',
      '- End with "Key takeaway:" in one line summarizing the core concept.',
      '- Use an encouraging tone, but not overly.',
    ].join('\n');
  }

  // Korean (default)
  return [
    '당신은 AWS 자격증 학습을 돕는 친절하고 정확한 한국어 튜터입니다.',
    '학습자가 방금 틀린 객관식 문제에 대해, 왜 그 선택이 틀렸고 정답이 왜 맞는지 핵심 개념 중심으로 설명합니다.',
    '',
    '규칙:',
    '- 반드시 한국어로 답합니다.',
    '- 사고 과정·메타설명("생각해보면", "분석하면") 없이 설명 본문만 바로 출력합니다.',
    '- 간결하게: 3~6문장 또는 짧은 불릿. 핵심 개념과 헷갈리기 쉬운 포인트를 짚습니다.',
    '- 학습자가 고른 오답이 왜 매력적이었는지/어떤 함정인지 한 줄로 언급하면 좋습니다.',
    '- AWS 서비스명·용어는 정확히. 추측이면 단정하지 말고 일반 원리로 설명합니다.',
    '- 마지막에 "기억할 점:" 한 줄로 핵심을 요약합니다.',
    '- 격려하는 톤, 과하지 않게.',
  ].join('\n');
}

function formatChoices(q: IndexedQuestion): string {
  return q.choices.map((c) => `${c.label}. ${c.text}`).join('\n');
}

export function buildUserPrompt(q: IndexedQuestion, selected: string, lang: Language = 'ko'): string {
  const domain = q.domain ? `\n[Domain] ${q.domain}` : '';
  const sel = selected ? selected : '(Not selected)';

  if (lang === 'en') {
    return [
      `I got this AWS certification question wrong.${domain}`,
      '',
      `[Question]\n${q.prompt}`,
      '',
      `[Choices]\n${formatChoices(q)}`,
      '',
      `[Correct answer] ${q.answer}`,
      `[My answer] ${sel}`,
      q.explanation ? `\n[Official explanation]\n${q.explanation}` : '',
      '',
      'Please explain why I got it wrong and why the correct answer is right.',
    ].join('\n');
  }

  // Korean (default)
  const domainKo = q.domain ? `\n[도메인] ${q.domain}` : '';
  const selKo = selected ? selected : '(미선택)';
  return [
    `다음 AWS 자격증 문제에서 제가 틀렸습니다.${domainKo}`,
    '',
    `[문제]\n${q.prompt}`,
    '',
    `[보기]\n${formatChoices(q)}`,
    '',
    `[정답] ${q.answer}`,
    `[제가 고른 답] ${selKo}`,
    q.explanation ? `\n[공식 해설]\n${q.explanation}` : '',
    '',
    '제가 왜 틀렸는지, 정답이 왜 맞는지 한국어로 설명해 주세요.',
  ].join('\n');
}
