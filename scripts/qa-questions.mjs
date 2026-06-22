// 모의고사 문제 정확도 검수. 각 문제를 Claude가 독립적으로 풀어 표시된 정답·해설과
// 비교하고, 불일치/오류 의심 문항을 리포트로 남긴다. 1회성 품질 점검용(호출당 과금).
//
// 실행: npm run qa:questions              (전체)
//       npm run qa:questions -- --limit 10 --cert dop-c02   (일부만 시험 실행)
// 필요한 env: ANTHROPIC_API_KEY  (TUTOR_MODEL/QA_MODEL로 모델 교체 가능, 기본 opus-4-8)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.QA_MODEL || 'claude-opus-4-8';
const CONCURRENCY = Number(process.env.QA_CONCURRENCY || 6);

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const limit = flag('limit') ? Number(flag('limit')) : Infinity;
const certFilter = flag('cert');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY 환경변수가 필요합니다. (npm run qa:questions 는 --env-file=.env 로 실행)');
  process.exit(1);
}

const all = JSON.parse(readFileSync('src/data/exam-questions.json', 'utf8'));
let items = all;
if (certFilter) items = items.filter((q) => q.slug === certFilter);
items = items.slice(0, limit);

const client = new Anthropic();

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correct_answer: { type: 'string', description: '독립적으로 판단한 정답 라벨(복수면 알파벳순으로 붙임, 예: AC)' },
    matches_marked: { type: 'boolean', description: '표시된 정답과 일치하는가' },
    explanation_ok: { type: 'boolean', description: '해설이 정확하고 오해를 주지 않는가' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    issue: { type: 'string', description: '문제가 있으면 한국어로 한두 문장, 없으면 빈 문자열' },
  },
  required: ['correct_answer', 'matches_marked', 'explanation_ok', 'confidence', 'issue'],
};

const SYSTEM = [
  '당신은 AWS/IT 자격증 시험 문제를 검수하는 엄정한 전문가입니다.',
  '주어진 객관식 문제를 스스로 풀어 정답을 독립적으로 판단하고, 표시된 정답·해설과 비교합니다.',
  '표시된 정답이 틀렸다고 의심되거나 해설이 부정확/오해소지가 있으면 명확히 지적합니다.',
  '확신이 없으면 confidence를 낮추고 issue에 이유를 적습니다. 추측으로 단정하지 않습니다.',
].join('\n');

function buildPrompt(q) {
  const choices = q.choices.map((c) => `${c.label}. ${c.text}`).join('\n');
  return [
    `[문제]\n${q.prompt}`,
    `\n[보기]\n${choices}`,
    `\n[표시된 정답] ${q.answer}`,
    q.explanation ? `\n[표시된 해설]\n${q.explanation}` : '',
    '\n이 문제의 정답을 독립적으로 판단하고, 표시된 정답·해설이 맞는지 검수하세요.',
  ].join('\n');
}

function norm(a) {
  return (a || '').toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
}

async function review(q) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: buildPrompt(q) }],
  });
  const text = res.content.find((b) => b.type === 'text')?.text ?? '{}';
  const v = JSON.parse(text);
  const answerMismatch = norm(v.correct_answer) !== norm(q.answer);
  const flagged = !v.matches_marked || !v.explanation_ok || answerMismatch;
  return {
    id: q.id,
    slug: q.slug,
    domain: q.domain ?? '',
    marked: q.answer,
    modelAnswer: v.correct_answer,
    answerMismatch,
    matchesMarked: v.matches_marked,
    explanationOk: v.explanation_ok,
    confidence: v.confidence,
    issue: v.issue ?? '',
    flagged,
  };
}

// 동시성 제한 풀.
async function runPool(list, worker, concurrency) {
  const out = new Array(list.length);
  let next = 0;
  let done = 0;
  async function lane() {
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      try {
        out[i] = await worker(list[i]);
      } catch (err) {
        out[i] = { id: list[i].id, slug: list[i].slug, error: String(err?.message || err), flagged: true };
      }
      done++;
      if (done % 10 === 0 || done === list.length) process.stdout.write(`\r검수 ${done}/${list.length}…`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, lane));
  return out;
}

console.log(`모델 ${MODEL} 로 ${items.length}문항 검수 시작 (동시성 ${CONCURRENCY})`);
const results = await runPool(items, review, CONCURRENCY);
process.stdout.write('\n');

const flagged = results.filter((r) => r.flagged);
mkdirSync('qa', { recursive: true });
writeFileSync('qa/qa-report.json', JSON.stringify(results, null, 2));

const lines = [];
lines.push(`# 모의고사 검수 리포트`);
lines.push('');
lines.push(`- 모델: ${MODEL}`);
lines.push(`- 검수: ${results.length}문항`);
lines.push(`- 의심 문항: **${flagged.length}개**`);
lines.push('');
if (flagged.length === 0) {
  lines.push('의심 문항이 없습니다. ✅');
} else {
  lines.push('| id | 표시정답 | 모델정답 | 정답불일치 | 해설OK | 확신 | 비고 |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of flagged) {
    if (r.error) {
      lines.push(`| ${r.id} | | | | | | ⚠️ 오류: ${r.error} |`);
      continue;
    }
    lines.push(
      `| ${r.id} | ${r.marked} | ${r.modelAnswer} | ${r.answerMismatch ? '❗' : ''} | ${r.explanationOk ? 'O' : '❗X'} | ${r.confidence} | ${r.issue.replace(/\n/g, ' ').slice(0, 200)} |`,
    );
  }
}
writeFileSync('qa/qa-report.md', lines.join('\n'));
console.log(`완료. 의심 ${flagged.length}/${results.length}개. → qa/qa-report.md, qa/qa-report.json`);
