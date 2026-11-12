import { describe, expect, test } from 'vitest';
import { getExamInfo } from '../examInfo';
import { PENDING_STYLE_SLUGS } from './examStyleRollout';
import { getExamCertSlugs, getExamQuestionsByCert, type ExamBankQuestion } from './examBank';

// 모의고사 "실제 시험 방식" 회귀 테스트. 기준은 docs/exam-style-guide.md.
// 상황 → 제약 → 한정어 질문, 복수 선택 형식, 해설 길이 같은 기계로 확인할 수 있는 것만 막는다.
// 정답이 맞는지, 오답이 그럴듯한지는 사람이 아니라 "정답 가리고 풀기" 검수 단계에서 본다.

type Level = 'foundational' | 'associate' | 'specialty' | 'professional';

interface Target {
  medianPromptMin: number; // 문제 길이 중앙값 하한(공백 포함 글자 수)
  multiMin: number; // 복수 선택 비율 하한
  multiMax: number; // 복수 선택 비율 상한
  qualifierMin: number; // 한정어(가장·최소·운영 부담…)가 있는 문제 비율 하한
  choiceAvgMin: number; // 보기 평균 길이 하한
}

const TARGETS: Record<Level, Target> = {
  foundational: { medianPromptMin: 80, multiMin: 0.05, multiMax: 0.2, qualifierMin: 0.4, choiceAvgMin: 18 },
  associate: { medianPromptMin: 170, multiMin: 0.1, multiMax: 0.22, qualifierMin: 0.6, choiceAvgMin: 28 },
  specialty: { medianPromptMin: 200, multiMin: 0.08, multiMax: 0.22, qualifierMin: 0.6, choiceAvgMin: 30 },
  professional: { medianPromptMin: 250, multiMin: 0.08, multiMax: 0.22, qualifierMin: 0.6, choiceAvgMin: 38 },
};

const MIN_PROMPT_CHARS = 40; // 어떤 문제도 이보다 짧으면 개념 한 줄 묻기다
const SHORT_PROMPT_RATIO = 0.7; // 문제의 80% 는 중앙값 하한의 70% 이상이어야 한다
const MIN_EXPLANATION_SINGLE = 150;
const MIN_EXPLANATION_MULTI = 200;
const MAX_ABSOLUTE_CHOICE_RATIO = 0.03; // "항상·절대" 같은 단서 보기 비율 상한

const QUALIFIER = /가장|최소|최대|최선|운영 부담|비용 효율|비용을|최소한|우선|충족/;
const ABSOLUTE = /항상|절대|무조건|모든 경우|어떤 경우에도/;
const ALL_OF_ABOVE = /위의? 모두|모두 맞|모두 해당|전부 맞/;
const MULTI_HINT = /\((\d)개 선택\)\s*$/;

const AWS_SLUGS = getExamCertSlugs().filter((slug) => !slug.startsWith('linux-') && slug !== 'sqld');
const SLUGS = AWS_SLUGS.filter((slug) => !PENDING_STYLE_SLUGS.has(slug));

const len = (s: string): number => [...s].length;
const labelsOf = (q: ExamBankQuestion): string[] => q.answer.split(',').map((s) => s.trim()).filter(Boolean);
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

describe('모의고사 틀 — AWS 자격증 은행', () => {
  test('틀을 적용할 자격증이 하나 이상 있다', () => {
    expect(SLUGS.length).toBeGreaterThan(0);
  });

  describe.each(SLUGS)('%s', (slug) => {
    const questions = getExamQuestionsByCert(slug);
    const info = getExamInfo(slug);
    const level = (info?.level ?? 'associate') as Level;
    const target = TARGETS[level];

    test(`수준(${level}): 문제 길이 중앙값이 ${target.medianPromptMin}자 이상이고 개념 한 줄 문제가 없다`, () => {
      const lengths = questions.map((q) => len(q.prompt));
      expect(median(lengths)).toBeGreaterThanOrEqual(target.medianPromptMin);
      const tooShort = questions.filter((q) => len(q.prompt) < MIN_PROMPT_CHARS);
      expect(tooShort.map((q) => q.number), '너무 짧은 문제').toEqual([]);
      const floor = target.medianPromptMin * SHORT_PROMPT_RATIO;
      const okRatio = lengths.filter((n) => n >= floor).length / lengths.length;
      expect(okRatio, `${Math.round(floor)}자 이상인 문제 비율`).toBeGreaterThanOrEqual(0.8);
    });

    test('한정어(가장·최소·운영 부담…)로 기준을 주는 문제가 충분하다', () => {
      const ratio = questions.filter((q) => QUALIFIER.test(q.prompt)).length / questions.length;
      expect(ratio).toBeGreaterThanOrEqual(target.qualifierMin);
    });

    test('복수 선택 비율이 수준에 맞고, 개수 표기와 정답 수가 일치한다', () => {
      const multi = questions.filter((q) => labelsOf(q).length > 1);
      const ratio = multi.length / questions.length;
      expect(ratio, `복수 ${multi.length}/${questions.length}`).toBeGreaterThanOrEqual(target.multiMin);
      expect(ratio, `복수 ${multi.length}/${questions.length}`).toBeLessThanOrEqual(target.multiMax);
      for (const q of questions) {
        const hint = q.prompt.match(MULTI_HINT);
        const count = labelsOf(q).length;
        if (count > 1) {
          expect(hint, `#${q.number} 복수 정답인데 끝에 "(N개 선택)" 이 없다`).not.toBeNull();
          expect(Number(hint![1]), `#${q.number} 표기 개수`).toBe(count);
        } else {
          expect(hint, `#${q.number} 단일 정답인데 "(N개 선택)" 이 있다`).toBeNull();
        }
      }
    });

    test('보기: 평균 길이, 빈 보기·중복 보기·"위 모두"·단서 단어 점검', () => {
      const all = questions.flatMap((q) => q.choices);
      const avg = all.reduce((sum, c) => sum + len(c.text), 0) / all.length;
      expect(avg, '보기 평균 길이').toBeGreaterThanOrEqual(target.choiceAvgMin);
      for (const q of questions) {
        const texts = q.choices.map((c) => c.text.trim());
        expect(texts.every((t) => t.length > 0), `#${q.number} 빈 보기`).toBe(true);
        expect(new Set(texts).size, `#${q.number} 중복 보기`).toBe(texts.length);
        expect(texts.some((t) => ALL_OF_ABOVE.test(t)), `#${q.number} "위 모두" 보기`).toBe(false);
      }
      const absolute = all.filter((c) => ABSOLUTE.test(c.text)).length / all.length;
      expect(absolute, '"항상·절대" 단서 보기 비율').toBeLessThanOrEqual(MAX_ABSOLUTE_CHOICE_RATIO);
    });

    test('해설: 단일 150자·복수 200자 이상이고 문제 번호·prompt 가 겹치지 않는다', () => {
      for (const q of questions) {
        const min = labelsOf(q).length > 1 ? MIN_EXPLANATION_MULTI : MIN_EXPLANATION_SINGLE;
        expect(len(q.explanation), `#${q.number} 해설 길이`).toBeGreaterThanOrEqual(min);
      }
      const prompts = questions.map((q) => q.prompt.trim());
      expect(new Set(prompts).size, 'prompt 중복').toBe(prompts.length);
    });
  });
});
