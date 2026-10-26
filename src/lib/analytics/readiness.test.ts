import { describe, expect, test } from 'vitest';
import { predictPass, type PassPredictorInput } from './passPredictor';
import {
  MIN_ATTEMPTS_FOR_PREDICTION,
  accuracyLeverGoal,
  buildFactors,
  buildLevers,
  newQuestionsPerDay,
  projectCoverage,
  readinessState,
} from './readiness';

// 980문제 중 418문제(43%)를 풀었고 최근 정답률 75%, 시험까지 49일, 목표 정답률 70%.
const base: PassPredictorInput = {
  coverage: 43,
  accuracy: 75,
  recentAccuracy: 75,
  totalQuestions: 980,
  attemptedQuestions: 418,
  dday: 49,
  targetAccuracy: 70,
};

describe('readinessState', () => {
  test(`${MIN_ATTEMPTS_FOR_PREDICTION}문제 미만이면 예측 전`, () => {
    const p = predictPass(base);
    expect(readinessState(p, MIN_ATTEMPTS_FOR_PREDICTION - 1)).toBe('pending');
    expect(readinessState(p, MIN_ATTEMPTS_FOR_PREDICTION)).toBe(p.verdict);
  });
});

describe('buildFactors', () => {
  test('진도·정답률·남은 시간을 목표와 함께 돌려준다', () => {
    const f = buildFactors(base, predictPass(base));
    expect(f.coverage).toEqual({ now: 43, goal: 90, ok: false });
    expect(f.accuracy).toEqual({ now: 75, goal: 70, ok: true, isRecent: true });
    expect(f.time).toEqual({ dday: 49, requiredDaily: 10, requiredMinutes: 20, feasible: 20, ok: true });
  });

  test('시험일이 없으면 time 은 null, 최근 기록이 없으면 전체 정답률', () => {
    const input = { ...base, dday: null, recentAccuracy: null, accuracy: 64 };
    const f = buildFactors(input, predictPass(input));
    expect(f.time).toBeNull();
    expect(f.accuracy).toEqual({ now: 64, goal: 70, ok: false, isRecent: false });
  });
});

describe('buildLevers', () => {
  test('효과 큰 순서, 가장 큰 단일 레버에 best, 둘 다 하기는 마지막', () => {
    const current = predictPass(base);
    const levers = buildLevers(base, current);
    expect(levers.map((l) => l.kind)).toEqual(['coverage', 'accuracy', 'both']);
    expect(levers.map((l) => l.probability)).toEqual([82, 63, 85]);
    expect(levers.map((l) => l.delta)).toEqual([82 - current.probability, 63 - current.probability, 85 - current.probability]);
    expect(levers.map((l) => l.best)).toEqual([true, false, false]);
  });

  test('이미 목표 진도·정답률을 넘었으면 레버가 없다', () => {
    const done = { ...base, coverage: 95, attemptedQuestions: 931, accuracy: 92, recentAccuracy: 92 };
    expect(buildLevers(done, predictPass(done))).toEqual([]);
  });

  test('정답률 목표는 목표+10 과 80 중 큰 값, 최대 95', () => {
    expect(accuracyLeverGoal(60)).toBe(80);
    expect(accuracyLeverGoal(75)).toBe(85);
    expect(accuracyLeverGoal(90)).toBe(95);
    expect(accuracyLeverGoal(undefined)).toBe(80);
  });
});

describe('newQuestionsPerDay', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const day = (n: number) => new Date(now - n * 86_400_000).toISOString();
  test('최근 14일 안에 처음 푼 문제만, 같은 문제를 다시 푼 건 세지 않는다', () => {
    const attempts = [
      { questionId: 'a', attemptedAt: day(1) },
      { questionId: 'a', attemptedAt: day(2) },
      { questionId: 'b', attemptedAt: day(3) },
      { questionId: 'c', attemptedAt: day(1) },
      { questionId: 'c', attemptedAt: day(20) }, // 처음 푼 날이 14일 전보다 앞
      { questionId: 'x', attemptedAt: day(1) }, // 범위 밖 자격증
    ];
    expect(newQuestionsPerDay(attempts, (id) => id !== 'x', now)).toBe(Math.round((2 / 14) * 10) / 10);
  });

  test('시작한 지 14일이 안 됐으면 실제 기간으로 나눈다', () => {
    const attempts = Array.from({ length: 42 }, (_, i) => ({ questionId: `q${i}`, attemptedAt: day(i % 3) }));
    // 가장 이른 풀이가 2일 전 → 기간 2일
    expect(newQuestionsPerDay(attempts, () => true, now)).toBe(21);
  });

  test('기록이 없으면 0', () => {
    expect(newQuestionsPerDay([], () => true, now)).toBe(0);
  });
});

describe('projectCoverage', () => {
  test('지금 속도로 시험일 진도, 목표까지 하루 필요량과 부족분', () => {
    expect(projectCoverage({ attemptedQuestions: 418, totalQuestions: 980, newPerDay: 8, dday: 49 })).toEqual({
      atExamCurrentPace: 83,
      requiredPerDay: 10,
      extraPerDay: 2,
      goal: 90,
    });
  });

  test('이미 목표 진도면 필요량 0, 진도는 100% 를 넘지 않는다', () => {
    expect(projectCoverage({ attemptedQuestions: 970, totalQuestions: 980, newPerDay: 5, dday: 30 })).toEqual({
      atExamCurrentPace: 100,
      requiredPerDay: 0,
      extraPerDay: 0,
      goal: 90,
    });
  });
});
