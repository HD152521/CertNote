// day.md 본문에서 연습 문제 섹션을 추출하고 각 문제를 구조화한다.
// 한국어 원본 양식: **문제 N.** ... A) ... B) ... **정답: X** 해설: ...
// 영어 번역본 양식: **Question N.** ... A) ... B) ... **Answer: X** Explanation: ...
//
// 영어판은 제목·토큰이 번역돼 있어 한국어 토큰만 보던 시절에는 day 파일 129개에서
// 문제가 통째로 렌더링되지 않았다. 두 언어를 모두 받아들이고, 제목이 어떤 형태든
// 문제 스템으로 섹션을 되찾는다.

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

// 번역 과정에서 한글이 중국어·일본어 한자로 치환된 파일이 실제로 존재한다
// (📝 練習 問題 / 📝 연習 問題 / 📝 連習 問題). 콘텐츠를 고치더라도 파서는 관대해야 한다.
const QUIZ_HEADER =
  /^##\s+[^\n]*?(?:(?:연습|練習|連習|연習)\s*(?:문제|問題)|(?:Question|Problem)s?)[^\n]*$/im;

// 문제 스템. 번역본은 Question / Problem / Q 를 섞어 쓴다(실측: Problem 196, Question 96, Q 12).
const STEM_SOURCE = String.raw`\*\*(?:문제|Question|Problem|Q)\s*\d+`;
const STEM_ANYWHERE = new RegExp(`^${STEM_SOURCE}`, 'm');
const STEM_SPLIT = new RegExp(`(?=^${STEM_SOURCE})`, 'm');
const STEM_TEST = new RegExp(`^${STEM_SOURCE}`);
const STEM_HEAD = new RegExp(
  String.raw`^\*\*(?:문제|Question|Problem|Q)\s*(\d+)\.?\*\*\s*([\s\S]*?)(?=\n\s*\*?\*?[A-E][)\.]|\n\s*\*\*(?:정답|Answer))`,
);

const NEXT_SECTION = /^##\s+/m;

export function parseQuiz(body: string): ParsedQuiz {
  const section = locateQuizSection(body);
  if (!section) return { before: body, questions: [], after: '' };

  const questions = parseQuestions(section.quizBody);
  // 문제가 하나도 안 나오면 섹션 추정이 틀렸거나 플레이스홀더다. 본문을 그대로 돌려준다.
  if (questions.length === 0) return { before: body, questions: [], after: '' };

  return { before: section.before, questions, after: section.after };
}

interface QuizSection {
  before: string;
  quizBody: string;
  after: string;
}

/**
 * 퀴즈 구간의 경계를 정한다.
 *
 * 제목을 먼저 찾는 방식은 쓰지 않는다. 본문에 'Common Problems' 같은 제목이 앞서 나오면
 * 그 지점을 잘라 실제 문제를 통째로 잃기 때문이다. 대신 **첫 문제 스템에 앵커를 두고**,
 * 바로 앞 제목이 퀴즈 제목처럼 보일 때만 그 제목까지 거슬러 올라간다.
 */
function locateQuizSection(body: string): QuizSection | null {
  const stemMatch = body.match(STEM_ANYWHERE);
  if (!stemMatch || stemMatch.index === undefined) return null;
  const stemStart = stemMatch.index;

  // 퀴즈 구간의 끝 = 문제 시작 이후 처음 나오는 h2.
  const tail = body.slice(stemStart);
  const nextSection = tail.match(NEXT_SECTION);
  const quizEnd = nextSection?.index !== undefined ? stemStart + nextSection.index : body.length;

  // 문제 앞의 마지막 h2를 찾는다.
  let heading: { start: number; end: number; text: string } | null = null;
  for (const m of body.slice(0, stemStart).matchAll(/^##\s+[^\n]*$/gm)) {
    if (m.index === undefined) continue;
    heading = { start: m.index, end: m.index + m[0].length, text: m[0] };
  }

  // 퀴즈 제목이면 제목째로 삼키고, 아니면(Summary 등) 제목과 산문은 본문에 남긴다.
  const takesHeading = heading !== null && QUIZ_HEADER.test(heading.text);
  const cut = takesHeading ? heading!.start : stemStart;
  const quizStart = takesHeading ? heading!.end : stemStart;

  return {
    // 제목 바로 앞의 --- 구분선은 본문 끝에 남기지 않는다.
    before: body.slice(0, cut).replace(/\n+---\s*\n*$/, '\n').trimEnd() + '\n',
    quizBody: body.slice(quizStart, quizEnd),
    after: body.slice(quizEnd),
  };
}

function parseQuestions(text: string): QuizQuestion[] {
  const blocks = text.split(STEM_SPLIT).filter((b) => STEM_TEST.test(b.trim()));
  const out: QuizQuestion[] = [];
  for (const block of blocks) {
    const q = parseQuestion(block);
    if (q) out.push(q);
  }
  return out;
}

const ANSWER_MARKER = /\*?\*?(?:정답|Answer)\s*:/;

/**
 * 보기 목록을 읽는다.
 *
 * 대부분은 한 줄에 하나씩이지만, 'A) x B) y C) z D) w'처럼 한 줄에 몰아 쓴 파일도 있다.
 * 줄 단위로만 읽으면 보기가 1개로 잡히고, 2개 미만인 문제는 버려지므로 통째로 사라진다.
 */
function parseChoices(afterHead: string): QuizChoice[] {
  // 정답/해설 구간까지 훑지 않도록 먼저 자른다.
  const answerAt = afterHead.match(ANSWER_MARKER);
  const region = answerAt?.index !== undefined ? afterHead.slice(0, answerAt.index) : afterHead;

  const perLine: QuizChoice[] = [];
  const lineRegex = /^\s*\*?\*?([A-E])\*?\*?[)\.]\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(region)) !== null) {
    perLine.push({ label: m[1], text: m[2].trim() });
  }
  if (perLine.length >= 2) return perLine;

  const marks = [...region.matchAll(/(?:^|\s)\*?\*?([A-E])\*?\*?[)\.]\s+/g)];
  const inline: QuizChoice[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    if (mark.index === undefined) continue;
    const start = mark.index + mark[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : region.length;
    const text = region.slice(start, end).trim();
    if (text) inline.push({ label: mark[1], text });
  }
  return inline.length >= 2 ? inline : perLine;
}

function parseQuestion(block: string): QuizQuestion | null {
  const headMatch = block.match(STEM_HEAD);
  if (!headMatch) return null;
  const number = Number.parseInt(headMatch[1], 10);
  const questionText = headMatch[2].trim();

  const choices = parseChoices(block.slice(headMatch[0].length));

  const answerMatch = block.match(/\*\*(?:정답|Answer):?\s*\*?\*?\s*([A-E][A-E,\s/]*?)\s*\*?\*?\*\*/);
  const altAnswerMatch =
    answerMatch ?? block.match(/(?:정답|Answer):\s*\*?\*?\s*([A-E][A-E,\s/]*?)\*?\*?(?:\s|$)/);
  if (!altAnswerMatch) return null;
  const answer = altAnswerMatch[1].trim().replace(/\*+/g, '');

  const explMatch = block.match(
    new RegExp(String.raw`(?:해설|Explanation):\s*([\s\S]+?)(?=\n\s*---|\n\s*${STEM_SOURCE}|$)`),
  );
  const explanation = explMatch ? explMatch[1].trim() : '';

  if (choices.length < 2) return null;
  return { number, text: questionText, choices, answer, explanation };
}
