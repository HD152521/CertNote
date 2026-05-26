// day.md 본문에서 '## 📝 연습 문제' 섹션을 추출하고 각 문제를 구조화한다.
// 양식: **문제 N.** ... A) ... B) ... **정답: X** 해설: ...

export interface QuizChoice {
  label: string;
  text: string;
}

export interface QuizQuestion {
  number: number;
  text: string;
  choices: QuizChoice[];
  answer: string;
  explanation: string;
}

export interface ParsedQuiz {
  before: string;
  questions: QuizQuestion[];
  after: string;
}

const QUIZ_HEADER = /^##\s+(?:[^\w\s]*\s*)?연습\s*문제[^\n]*$/m;
const NEXT_SECTION = /^##\s+/m;

export function parseQuiz(body: string): ParsedQuiz {
  const headerMatch = body.match(QUIZ_HEADER);
  if (!headerMatch || headerMatch.index === undefined) {
    return { before: body, questions: [], after: '' };
  }
  const headerStart = headerMatch.index;
  const before = body.slice(0, headerStart).replace(/\n+---\s*\n*$/, '\n').trimEnd() + '\n';
  const headerEnd = headerStart + headerMatch[0].length;
  const rest = body.slice(headerEnd);
  const nextMatch = rest.match(NEXT_SECTION);
  const quizBody = nextMatch && nextMatch.index !== undefined ? rest.slice(0, nextMatch.index) : rest;
  const after = nextMatch && nextMatch.index !== undefined ? rest.slice(nextMatch.index) : '';
  const questions = parseQuestions(quizBody);
  if (questions.length === 0) {
    return { before: body, questions: [], after: '' };
  }
  return { before, questions, after };
}

function parseQuestions(text: string): QuizQuestion[] {
  const blockSplit = text.split(/(?=^\*\*문제\s*\d+)/m);
  const blocks = blockSplit.filter((b) => /^\*\*문제\s*\d+/.test(b.trim()));
  const out: QuizQuestion[] = [];
  for (const block of blocks) {
    const q = parseQuestion(block);
    if (q) out.push(q);
  }
  return out;
}

function parseQuestion(block: string): QuizQuestion | null {
  const headMatch = block.match(/^\*\*문제\s*(\d+)\.?\*\*\s*([\s\S]*?)(?=\n\s*\*?\*?[A-E][)\.]|\n\s*\*\*정답)/);
  if (!headMatch) return null;
  const number = Number.parseInt(headMatch[1], 10);
  const questionText = headMatch[2].trim();

  const choices: QuizChoice[] = [];
  const choiceRegex = /^\s*\*?\*?([A-E])\*?\*?[)\.]\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  const afterHead = block.slice(headMatch[0].length);
  while ((m = choiceRegex.exec(afterHead)) !== null) {
    choices.push({ label: m[1], text: m[2].trim() });
  }

  const answerMatch = block.match(/\*\*정답:?\s*\*?\*?\s*([A-E][A-E,\s/]*?)\s*\*?\*?\*\*/);
  const altAnswerMatch = answerMatch ?? block.match(/정답:\s*\*?\*?\s*([A-E][A-E,\s/]*?)\*?\*?(?:\s|$)/);
  if (!altAnswerMatch) return null;
  const answer = altAnswerMatch[1].trim().replace(/\*+/g, '');

  const explMatch = block.match(/해설:\s*([\s\S]+?)(?=\n\s*---|\n\s*\*\*문제\s*\d+|$)/);
  const explanation = explMatch ? explMatch[1].trim() : '';

  if (choices.length < 2) return null;
  return { number, text: questionText, choices, answer, explanation };
}
