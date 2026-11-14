import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SQL_TASK_SETS, SQL_TASK_SETS_EN, runForTask, sqlTaskSetsFor } from './tasks';
import { hasHangul, labStrings, localizeVerdictReason } from '@/components/sql-lab/i18n';

// 영어판은 모범 답안의 별칭·문자열 상수만 영어로 바꾼다(한글 없는 JSON 이어야 해서). 이 항목들만 답안이 다를 수 있다.
const ANSWER_DIFFERS = new Set([
  'annual',
  'case-grade',
  'rollup-label',
  'dense-rank',
  'running-total',
  'prev-sal',
  'regexp-vowels',
  'regexp-mask',
]);

describe('SQL 과제 영어판', () => {
  it('sqlTaskSetsFor 는 언어별 묶음을 돌려준다', () => {
    expect(sqlTaskSetsFor('ko')).toBe(SQL_TASK_SETS);
    expect(sqlTaskSetsFor('en')).toBe(SQL_TASK_SETS_EN);
    expect(sqlTaskSetsFor()).toBe(SQL_TASK_SETS);
  });

  it('tasksEn.json 에는 한글이 한 글자도 없다', () => {
    const raw = readFileSync(new URL('./tasksEn.json', import.meta.url), 'utf8');
    expect(hasHangul(raw)).toBe(false);
  });

  it('id·순서·ordered·check 는 한국어판과 같다', () => {
    expect(SQL_TASK_SETS_EN.map((s) => [s.id, s.code])).toEqual(SQL_TASK_SETS.map((s) => [s.id, s.code]));
    SQL_TASK_SETS.forEach((ko, si) => {
      const en = SQL_TASK_SETS_EN[si];
      expect(en.items.map((i) => i.id)).toEqual(ko.items.map((i) => i.id));
      ko.items.forEach((k, ii) => {
        const e = en.items[ii];
        expect(e.ordered, k.id).toBe(k.ordered);
        expect(e.check, k.id).toBe(k.check);
        if (!ANSWER_DIFFERS.has(k.id)) expect(e.answer, k.id).toBe(k.answer);
        for (const f of ['title', 'prompt', 'hint', 'explain'] as const) expect(e[f].length, `${k.id}.${f}`).toBeGreaterThan(0);
      });
    });
  });

  it('영어 모범 답안은 영어판 채점기를 통과한다', () => {
    for (const set of SQL_TASK_SETS_EN) {
      for (const it of set.items) expect(runForTask(it, it.answer).verdict, `${set.id}/${it.id}`).toEqual({ ok: true });
    }
  });

  it('영어 답안은 한국어 답안과 같은 행 수·열 수를 낸다', () => {
    SQL_TASK_SETS.forEach((ko, si) => {
      ko.items.forEach((k, ii) => {
        const e = SQL_TASK_SETS_EN[si].items[ii];
        const a = runForTask(k, k.answer).results.at(-1);
        const b = runForTask(e, e.answer).results.at(-1);
        expect(a?.kind, k.id).toBe(b?.kind);
        if (a?.kind === 'rows' && b?.kind === 'rows') {
          expect(b.columns.length, k.id).toBe(a.columns.length);
          expect(b.rows.length, k.id).toBe(a.rows.length);
        }
      });
    });
  });
});

describe('SqlLab 화면 문구', () => {
  it('영어 문구에는 한글이 없다', () => {
    const l = labStrings('en');
    const texts = [l.labName, l.oracleBadge, l.pickTask, l.taskOf(1, 8), l.taskAria(2, true, 'T'), l.taskAria(2, false, 'T'), l.taskInputLabel(3), l.solvedTag, l.solvedCount(1, 8), l.hintPrefix, l.verdictOk, l.verdictPrefix, l.showHint, l.showAnswer, l.nextTask];
    for (const t of texts) expect(hasHangul(t), t).toBe(false);
  });

  it('한국어 문구는 기존 그대로다', () => {
    const l = labStrings('ko');
    expect(l.taskOf(1, 8)).toBe('과제 1 / 8');
    expect(l.taskAria(2, true, 'X')).toBe('과제 2 정답: X');
    expect(l.taskInputLabel(3)).toBe('과제 3 SQL 입력');
    expect(l.solvedCount(1, 8)).toBe('1 / 8 과제 정답');
    expect(l.verdictOk).toBe('채점: 정답이에요. 모범 답안과 결과가 같아요.');
    expect([l.showHint, l.showAnswer, l.nextTask, l.hintPrefix]).toEqual(['힌트 보기', '모범 답안 보기', '다음 과제', '힌트:']);
  });

  it('채점기가 만드는 모든 한국어 사유가 영어로 바뀐다', () => {
    const [any] = SQL_TASK_SETS[0].items;
    const reasons = [
      'ORA-00942 오류가 났어요. 오류 문구를 읽고 고쳐서 다시 실행해 보세요.',
      '실습장이 실행하지 못한 문장이에요.',
      '마지막 문장이 SELECT 가 아니에요. 결과를 보여 주는 SELECT 로 끝내 주세요.',
      '모범 답안을 실행하지 못했어요(실습장 오류).',
      '열 개수가 달라요. 기대 2개, 지금 1개.',
      '행 수가 달라요. 기대 14행, 지금 3행.',
      '행 수는 맞지만 값이 다른 행이 있어요. 조건이나 계산식을 다시 확인해 보세요.',
      '값은 모두 맞지만 순서가 달라요. ORDER BY 를 확인해 보세요.',
    ];
    for (const r of reasons) {
      const out = localizeVerdictReason('en', r);
      expect(hasHangul(out), out).toBe(false);
      expect(localizeVerdictReason('ko', r)).toBe(r);
    }
    expect(localizeVerdictReason('en', reasons[4])).toBe('The number of columns differs. Expected 2, got 1.');
    // 실제 채점기 출력으로도 확인
    for (const sql of ['SELECT 1 FROM DUAL', 'SELEC', 'DELETE FROM NOPE']) {
      const v = runForTask(any, sql).verdict;
      if (v && !v.ok) expect(hasHangul(localizeVerdictReason('en', v.reason)), v.reason).toBe(false);
    }
  });

  it('SqlLab.tsx 의 한글은 주석뿐이다(화면 문구는 사전 경유)', () => {
    const src = readFileSync(new URL('../../components/sql-lab/SqlLab.tsx', import.meta.url), 'utf8');
    const code = src
      .split(/\r?\n/)
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(hasHangul(code)).toBe(false);
  });
});
