// 전체 콘텐츠의 연습 문제를 모아 안정적 ID와 함께 src/data/questions.json 생성.
// 파싱 규칙은 src/lib/parseQuiz.ts 와 동일하게 유지해야 한다(런타임 ID 일치).
// ID 규칙은 src/lib/questionId.ts 와 동일: `${slug}-w${week}-d${day}-q${index}` (index = 1-based 위치).
import { promises as fs } from 'node:fs';
import path from 'node:path';

const CONTENT_ROOT = path.join(process.cwd(), 'content');
const OUTPUT = path.join(process.cwd(), 'src', 'data', 'questions.json');

const QUIZ_HEADER = /^##\s+(?:[^\w\s]*\s*)?연습\s*문제[^\n]*$/m;
const NEXT_SECTION = /^##\s+/m;

function sliceQuizBody(body) {
  const headerMatch = body.match(QUIZ_HEADER);
  if (!headerMatch || headerMatch.index === undefined) return '';
  const rest = body.slice(headerMatch.index + headerMatch[0].length);
  const nextMatch = rest.match(NEXT_SECTION);
  return nextMatch && nextMatch.index !== undefined ? rest.slice(0, nextMatch.index) : rest;
}

function parseQuestion(block) {
  const headMatch = block.match(/^\*\*문제\s*(\d+)\.?\*\*\s*([\s\S]*?)(?=\n\s*\*?\*?[A-E][)\.]|\n\s*\*\*정답)/);
  if (!headMatch) return null;
  const number = Number.parseInt(headMatch[1], 10);
  const text = headMatch[2].trim();

  const choices = [];
  const choiceRegex = /^\s*\*?\*?([A-E])\*?\*?[)\.]\s+(.+?)\s*$/gm;
  const afterHead = block.slice(headMatch[0].length);
  let m;
  while ((m = choiceRegex.exec(afterHead)) !== null) {
    choices.push({ label: m[1], text: m[2].trim() });
  }
  if (choices.length < 2) return null;

  const answerMatch =
    block.match(/\*\*정답:?\s*\*?\*?\s*([A-E][A-E,\s/]*?)\s*\*?\*?\*\*/) ??
    block.match(/정답:\s*\*?\*?\s*([A-E][A-E,\s/]*?)\*?\*?(?:\s|$)/);
  if (!answerMatch) return null;
  const answer = answerMatch[1].trim().replace(/\*+/g, '');

  const explMatch = block.match(/해설:\s*([\s\S]+?)(?=\n\s*---|\n\s*\*\*문제\s*\d+|$)/);
  const explanation = explMatch ? explMatch[1].trim() : '';

  return { number, text, choices, answer, explanation };
}

function parseQuestions(quizBody) {
  return quizBody
    .split(/(?=^\*\*문제\s*\d+)/m)
    .filter((b) => /^\*\*문제\s*\d+/.test(b.trim()))
    .map(parseQuestion)
    .filter((q) => q !== null);
}

async function listDirs(p) {
  const entries = await fs.readdir(p, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function main() {
  const out = [];
  const categories = await listDirs(CONTENT_ROOT);
  for (const category of categories) {
    // 영어판(en)은 한국어 문항의 '번역'이라 같은 문항 id를 재사용한다.
    // 인덱스에 넣으면 id가 중복되므로 제외 — 채점·SRS는 한국어 엔트리로 동작한다.
    if (category === 'en') continue;
    const categoryDir = path.join(CONTENT_ROOT, category);
    const slugs = await listDirs(categoryDir);
    for (const slug of slugs) {
      const slugDir = path.join(categoryDir, slug);
      const weeks = (await listDirs(slugDir)).filter((w) => /^week\d+$/.test(w));
      for (const weekName of weeks) {
        const week = Number.parseInt(weekName.slice(4), 10);
        for (let day = 1; day <= 5; day++) {
          const file = path.join(slugDir, weekName, `day${day}.md`);
          let body;
          try {
            body = await fs.readFile(file, 'utf8');
          } catch {
            continue; // 없는 day는 건너뜀
          }
          const questions = parseQuestions(sliceQuizBody(body));
          questions.forEach((q, i) => {
            const index = i + 1; // 1-based 위치 인덱스
            out.push({
              id: `${slug}-w${week}-d${day}-q${index}`,
              category,
              slug,
              section: slug === 'linux-master-1' ? 'linux' : 'aws', // P0-8: 섹션 스탬프
              week,
              day,
              number: q.number,
              prompt: q.text,
              choices: q.choices,
              answer: q.answer,
              explanation: q.explanation,
            });
          });
        }
      }
    }
  }

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

  // 요약 출력
  const byCert = {};
  for (const q of out) byCert[q.slug] = (byCert[q.slug] ?? 0) + 1;
  console.log(`✓ 문제 인덱스 생성: ${out.length}문항 → ${path.relative(process.cwd(), OUTPUT)}`);
  for (const [slug, n] of Object.entries(byCert).sort()) console.log(`  ${slug}: ${n}`);
}

main().catch((err) => {
  console.error('문제 인덱스 생성 실패:', err);
  process.exit(1);
});
