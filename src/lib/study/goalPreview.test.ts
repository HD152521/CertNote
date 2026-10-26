import { describe, expect, test } from 'vitest';
import { previewGoal, type CertSnapshot } from './goalPreview';

// 노트 60개 중 13개, 문제 980개 중 418개. 남은 일: 노트 47개(12분) + 목표 진도 90%까지 문제 464개(2분) = 1,492분.
const cert: CertSnapshot = {
  slug: 'saa-c03',
  totalDays: 60,
  completedDays: 13,
  totalQuestions: 980,
  attemptedQuestions: 418,
  accuracy: 75,
};

describe('previewGoal', () => {
  test('하루 45분이면 34일에 끝나고 15일 남아 여유', () => {
    const p = previewGoal(cert, { daysUntilExam: 49, dailyMinutes: 45, targetAccuracy: 70 });
    expect(p.daysNeeded).toBe(34);
    expect(p.spareDays).toBe(15);
    expect(p.fit).toBe('comfortable');
    expect(p.notesPerDay).toBe(1.4);
    expect(p.questionsPerDay).toBe(14);
    expect(p.coverageAtExam).toBe(90);
  });

  test('하루 30분이면 50일이 걸려 하루 모자란다', () => {
    const p = previewGoal(cert, { daysUntilExam: 49, dailyMinutes: 30, targetAccuracy: 70 });
    expect(p.daysNeeded).toBe(50);
    expect(p.spareDays).toBe(-1);
    expect(p.fit).toBe('short');
    expect(p.coverageAtExam).toBeLessThan(90);
  });

  test('여유가 7일 미만이면 빠듯함', () => {
    const p = previewGoal(cert, { daysUntilExam: 38, dailyMinutes: 45, targetAccuracy: 70 });
    expect(p.fit).toBe('tight');
  });

  test('목표 정답률이 지금 정답률보다 높으면 예상 준비도가 낮아진다', () => {
    const easy = previewGoal(cert, { daysUntilExam: 49, dailyMinutes: 45, targetAccuracy: 70 });
    const hard = previewGoal(cert, { daysUntilExam: 49, dailyMinutes: 45, targetAccuracy: 90 });
    expect(easy.readyAtExam).toBe(82);
    expect(hard.readyAtExam!).toBeLessThan(easy.readyAtExam!);
  });

  test('풀이 기록이 부족하면 예상 준비도는 null', () => {
    const fresh = { ...cert, completedDays: 0, attemptedQuestions: 5, accuracy: 80 };
    expect(previewGoal(fresh, { daysUntilExam: 60, dailyMinutes: 30, targetAccuracy: 70 }).readyAtExam).toBeNull();
    expect(previewGoal({ ...cert, accuracy: null }, { daysUntilExam: 60, dailyMinutes: 30, targetAccuracy: 70 }).readyAtExam).toBeNull();
  });

  test('중간 목표 4개는 끝나는 날과 시험일 중 이른 쪽까지 나눠 날짜·진도가 커진다', () => {
    const p = previewGoal(cert, { daysUntilExam: 49, dailyMinutes: 45, targetAccuracy: 70 });
    expect(p.milestones.map((m) => m.kind)).toEqual(['firstMock', 'weakReview', 'mockTarget', 'finalReview']);
    expect(p.milestones.map((m) => m.dayOffset)).toEqual([9, 17, 26, 34]);
    expect(p.milestones[3].coverage).toBe(90);
    for (let i = 1; i < 4; i++) expect(p.milestones[i].coverage).toBeGreaterThan(p.milestones[i - 1].coverage);
  });

  test('다 끝낸 자격증은 0일, 분량 0', () => {
    const done = { ...cert, completedDays: 60, attemptedQuestions: 900 };
    const p = previewGoal(done, { daysUntilExam: 10, dailyMinutes: 30, targetAccuracy: 70 });
    expect(p.daysNeeded).toBe(0);
    expect(p.notesPerDay).toBe(0);
    expect(p.questionsPerDay).toBe(0);
    expect(p.fit).toBe('comfortable');
  });
});
