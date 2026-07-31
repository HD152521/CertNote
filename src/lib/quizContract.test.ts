import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseQuiz } from './parseQuiz';

// 콘텐츠 전수 퀴즈 계약 테스트.
//
// 왜 필요한가: day.md 를 편집(특히 대량 보강)하다 퀴즈 블록의 양식이 어긋나면 parseQuiz 가
// 문제를 **조용히** 버린다. 화면에서 문제가 통째로 사라지는데 빌드는 성공하므로 아무도 모른다.
// 실제 파손 경로(파서 구조상):
//   1) 문제 스템 이후에 h2(`## `)가 삽입되면 그 지점에서 퀴즈 구간이 끊겨 이후 문제 전부 소실
//   2) 본문에 `**문제 N.` 같은 문구가 생기면 앵커가 앞으로 당겨져 경계가 붕괴
//   3) 보기가 2개 미만으로 파싱되거나 정답 마커가 변형되면 그 문제만 드롭
//
// 이 테스트는 **프로덕션과 동일한 parseQuiz** 로 전 콘텐츠를 파싱해 기준선(baseline)과 대조한다.
// 정규식을 재구현하지 않는 것이 핵심 — 재구현하면 테스트는 통과하는데 화면은 깨지는 상황이 생긴다.
//
// 기준선 갱신(문제를 의도적으로 추가/수정했을 때):
//   UPDATE_QUIZ_BASELINE=1 npx vitest run src/lib/quizContract.test.ts

const CONTENT_ROOT = path.join(process.cwd(), 'content');
const BASELINE_PATH = path.join(process.cwd(), 'src', 'data', 'quiz-baseline.json');

interface FileQuiz {
  /** 파싱된 문제 수 */
  count: number;
  /** 원문에 존재하는 문제 스템 수 — count 와 벌어지면 파서가 조용히 버린 것 */
  rawStems: number;
  /** 문제 '번호' → 정답. 배열 위치가 아니라 번호로 대조한다 —
   *  중간 문항이 복구되면 뒤 문항이 밀려 위치 비교는 오탐한다(실측). */
  byNumber: Record<string, { answer: string; choices: number }>;
}

/** 원문 문제 스템 수. parseQuiz 가 몇 개를 버렸는지 대조하는 기준. */
const STEM_COUNT_RE = /^\*\*(?:문제|Question|Problem|Q)\s*\d+/gm;

type Baseline = Record<string, FileQuiz>;

async function walkDayFiles(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkDayFiles(full, out);
    else if (/^day\d+\.md$/.test(e.name)) out.push(full);
  }
  return out;
}

function relKey(abs: string): string {
  return path.relative(process.cwd(), abs).split(path.sep).join('/');
}

async function collect(): Promise<Baseline> {
  const files = await walkDayFiles(CONTENT_ROOT);
  files.sort();
  const out: Baseline = {};
  for (const f of files) {
    const body = await fs.readFile(f, 'utf8');
    const { questions } = parseQuiz(body);
    const byNumber: FileQuiz['byNumber'] = {};
    for (const q of questions) byNumber[String(q.number)] = { answer: q.answer, choices: q.choices.length };
    out[relKey(f)] = {
      count: questions.length,
      rawStems: (body.match(STEM_COUNT_RE) ?? []).length,
      byNumber,
    };
  }
  return out;
}

describe('콘텐츠 퀴즈 계약(전수)', () => {
  test(
    '모든 day.md 의 문제가 기준선 대비 유실·변경되지 않는다',
    async () => {
      const current = await collect();

      if (process.env.UPDATE_QUIZ_BASELINE) {
        await fs.writeFile(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
        // 갱신 모드에선 대조하지 않는다(의도적 변경을 기록하는 용도).
        expect(Object.keys(current).length).toBeGreaterThan(0);
        return;
      }

      const raw = await fs.readFile(BASELINE_PATH, 'utf8').catch(() => null);
      expect(raw, `기준선이 없다. UPDATE_QUIZ_BASELINE=1 로 먼저 생성할 것: ${BASELINE_PATH}`).not.toBeNull();
      const baseline = JSON.parse(raw as string) as Baseline;

      const lost: string[] = [];
      const changed: string[] = [];

      for (const [file, base] of Object.entries(baseline)) {
        const cur = current[file];
        if (!cur) {
          // 파일 삭제·이동은 기준선 갱신이 필요한 의도적 변경이므로 별도로 보고한다.
          lost.push(`${file}: 파일 없음(기준선에는 문제 ${base.count}개)`);
          continue;
        }
        // 문제 추가는 허용(보강 시 5→7문항 등), 유실은 금지.
        if (cur.count < base.count) {
          lost.push(`${file}: 문제 ${base.count} → ${cur.count} (${base.count - cur.count}개 유실)`);
          continue;
        }
        // 기존 문제가 '번호 기준'으로 그대로인지 확인(문항 추가·중간 복구는 허용).
        for (const [num, b] of Object.entries(base.byNumber)) {
          const c = cur.byNumber[num];
          if (!c) {
            changed.push(`${file}#${num}: 문항 사라짐(정답 ${b.answer})`);
            break;
          }
          if (c.answer !== b.answer) {
            changed.push(`${file}#${num}: 정답 ${b.answer} → ${c.answer}`);
            break;
          }
          if (c.choices !== b.choices) {
            changed.push(`${file}#${num}: 보기수 ${b.choices} → ${c.choices}`);
            break;
          }
        }
      }

      expect(lost, `문제 유실 발생:\n${lost.join('\n')}`).toEqual([]);
      expect(changed, `기존 문제 변경 발생:\n${changed.join('\n')}`).toEqual([]);
    },
    120_000,
  );

  // 원문에는 문제가 있는데 파서가 버리는 '조용한 유실'을 감시한다.
  //
  // 기준선 생성 시점(2026-07-31)에 이미 39개 파일에서 97문항이 유실된 상태였다(전량 화면 미노출).
  // 이 부채를 지금 한 번에 고치는 것과 별개로, **유실이 더 늘어나는 것은 즉시 막아야** 한다.
  // 그래서 "0이어야 한다"가 아니라 "기준선보다 나빠지면 실패"로 판정한다.
  test(
    '조용한 문제 유실이 기준선보다 늘지 않는다',
    async () => {
      const current = await collect();
      const raw = await fs.readFile(BASELINE_PATH, 'utf8').catch(() => null);
      if (!raw) return; // 기준선 생성 모드에서는 건너뛴다.
      const baseline = JSON.parse(raw) as Baseline;

      const worse: string[] = [];
      for (const [file, cur] of Object.entries(current)) {
        const base = baseline[file];
        const curLost = cur.rawStems - cur.count;
        // 신규 파일은 유실 0이어야 한다.
        const baseLost = base ? base.rawStems - base.count : 0;
        if (curLost > baseLost) {
          worse.push(`${file}: 유실 ${baseLost} → ${curLost} (원문 ${cur.rawStems} / 파싱 ${cur.count})`);
        }
      }
      expect(worse, `조용한 문제 유실 악화:\n${worse.join('\n')}`).toEqual([]);
    },
    120_000,
  );
});
