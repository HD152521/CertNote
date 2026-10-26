import { beforeEach, describe, expect, it, vi } from 'vitest';

const record = vi.fn();
vi.mock('../quiz/attemptService', () => ({ getAttemptService: () => ({ record }) }));

import { gradeExam, MAX_COUNT } from './examService';
import { getAllExamQuestions } from './examBank';

describe('gradeExam', () => {
  beforeEach(() => record.mockReset());

  it('grades a repeated question id only once', async () => {
    const q = getAllExamQuestions()[0];
    const ids = Array.from({ length: 50 }, () => q.id);
    const result = await gradeExam('u1', ids, { [q.id]: q.answer });
    expect(result.total).toBe(1);
    expect(result.correct).toBe(1);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('grades at most MAX_COUNT questions per submission', async () => {
    const ids = getAllExamQuestions()
      .slice(0, MAX_COUNT + 20)
      .map((q) => q.id);
    const result = await gradeExam('u1', ids, {});
    expect(result.total).toBe(MAX_COUNT);
    expect(record).not.toHaveBeenCalled();
  });
});
