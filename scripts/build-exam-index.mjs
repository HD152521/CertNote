// content/exams/<slug>.json (오리지널 시험형 문제 은행) → src/data/exam-questions.json 으로 인덱싱.
// day 퀴즈(questions.json)와 완전히 분리된 별도 은행. id는 'exam-<slug>-<번호>'로 충돌 방지.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'content', 'exams');
const OUT = path.join(process.cwd(), 'src', 'data', 'exam-questions.json');

let files = [];
try {
  files = (await fs.readdir(SRC)).filter((f) => f.endsWith('.json'));
} catch {
  // content/exams 가 없으면 빈 인덱스.
}

const out = [];
for (const f of files) {
  const slug = f.replace(/\.json$/, '');
  const arr = JSON.parse(await fs.readFile(path.join(SRC, f), 'utf8'));
  for (const q of arr) {
    out.push({
      id: `exam-${slug}-${q.number}`,
      slug,
      domain: q.domain ?? '',
      number: q.number,
      prompt: q.prompt,
      choices: q.choices,
      answer: q.answer,
      explanation: q.explanation,
    });
  }
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(out, null, 2));
console.log(`✓ exam-questions.json: ${out.length}문항 (${files.length} cert)`);
