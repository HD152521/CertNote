import { describe, expect, test } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildExam } from './examService';
import { getExamQuestionsByCert } from './examBank';

// 모의고사 문제은행(content/exams/<slug>.json) 데이터 검증.
//
// - 모든 은행: 스키마, 번호 유일성, 보기 A~D 4개, 정답 유효성, 해설 존재.
// - STRICT_SLUGS: 위에 더해 도메인 ⊆ 시험정보 도메인, 단일 정답, 해설의 보기 글자 참조 금지, 정답 분포 20~30%, 연속 정답 제한.
//   기존 은행 중 일부는 아직 엄격 규칙을 만족하지 못한다(도메인 라벨이 시험정보와 다름 등). 그 내용은 이 단계에서
//   고치지 않고, 새로 만드는 은행부터 STRICT_SLUGS 에 추가해 기준을 올린다.
// - 일일 퀴즈·1급 은행과의 지문 중복 검사는 linux-master-2 에 대해 수행한다.

const ROOT = process.cwd();
const EXAMS_DIR = path.join(ROOT, 'content', 'exams');
const INFO_DIR = path.join(ROOT, 'content', 'exam-info');
const LETTERS = ['A', 'B', 'C', 'D'];
const STRICT_SLUGS = ['linux-master-2'];

interface RawChoice {
  label: string;
  text: string;
}
interface RawQuestion {
  number: number;
  domain: string;
  prompt: string;
  choices: RawChoice[];
  answer: string;
  explanation: string;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

const slugs = readdirSync(EXAMS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();
const banks = new Map<string, RawQuestion[]>(slugs.map((s) => [s, readJson<RawQuestion[]>(path.join(EXAMS_DIR, `${s}.json`))]));

function examDomains(slug: string): string[] {
  const info = readJson<{ domains?: { name: string }[] }>(path.join(INFO_DIR, `${slug}.json`));
  return (info.domains ?? []).map((d) => d.name);
}

// 해설이 보기 글자("A는", "(B)", "보기 C", "A, B" 등)를 가리키는지. 보기 순서가 섞여 표시될 수 있어 금지한다.
// Ctrl+C·fsck -A·A/B 처럼 글자가 다른 토큰의 일부인 경우는 앞뒤 문자로 걸러낸다.
const CHOICE_LETTER_REFS: RegExp[] = [
  /(?<![A-Za-z0-9_+\-/.])[A-E](?:는|은|도|만|가|이|를|을|와|과|의)/,
  /(?:보기|선택지|옵션|항목|choice|option)\s*[A-E](?![A-Za-z0-9_])/i,
  /\([A-E]\)/,
  /(?<![A-Za-z0-9_+\-/.])[A-E]\s*(?:,|와|과|및|또는)\s*[A-E](?![A-Za-z0-9_/])/,
];
function referencesChoiceLetter(text: string): boolean {
  return CHOICE_LETTER_REFS.some((re) => re.test(text));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}
function trigrams(s: string): Set<string> {
  const t = normalize(s);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}
const DUP_THRESHOLD = 0.5;

describe('referencesChoiceLetter(검사기 자체)', () => {
  test('보기 글자를 가리키는 표현을 잡는다', () => {
    for (const t of ['A는 틀렸다.', 'B이다', '보기 B가 정답이다.', '(C)가 맞다', 'A, B 모두 맞다', 'D와 같다']) {
      expect(referencesChoiceLetter(t), t).toBe(true);
    }
  });
  test('명령어·기호 속 글자는 잡지 않는다', () => {
    for (const t of ['Ctrl+C는 인터럽트다', 'fsck -A는 전체를 검사한다', 'A/B 테스트', 'C 클래스 네트워크', 'RAID 구성', 'X.25는 표준이다']) {
      expect(referencesChoiceLetter(t), t).toBe(false);
    }
  });
});

describe('모든 모의고사 은행 — 공통 스키마', () => {
  test('은행이 있고 모든 은행에 시험정보가 있다', () => {
    expect(slugs.length).toBeGreaterThanOrEqual(13);
    for (const slug of slugs) expect(examDomains(slug).length, `${slug} exam-info domains`).toBeGreaterThan(0);
  });

  for (const slug of slugs) {
    describe(slug, () => {
      const bank = banks.get(slug)!;

      test('비어 있지 않고 번호가 1부터 연속이며 유일하다', () => {
        expect(bank.length).toBeGreaterThan(0);
        expect(bank.map((q) => q.number)).toEqual(bank.map((_, i) => i + 1));
      });

      test('각 문항이 스키마를 만족한다', () => {
        for (const q of bank) {
          const tag = `${slug} #${q.number}`;
          expect(typeof q.domain, `${tag} domain`).toBe('string');
          expect(q.domain.trim(), `${tag} domain`).not.toBe('');
          expect(typeof q.prompt, `${tag} prompt`).toBe('string');
          expect(q.prompt.trim(), `${tag} prompt`).not.toBe('');
          expect(typeof q.explanation, `${tag} explanation`).toBe('string');
          expect(q.explanation.trim(), `${tag} explanation`).not.toBe('');
          expect(q.choices.map((c) => c.label), `${tag} labels`).toEqual(LETTERS);
          const texts = q.choices.map((c) => c.text.trim());
          for (const t of texts) expect(t, `${tag} choice text`).not.toBe('');
          expect(new Set(texts).size, `${tag} 보기 텍스트 중복`).toBe(4);
          const answers = q.answer.split(',').map((s) => s.trim());
          expect(answers.length, `${tag} answer`).toBeGreaterThan(0);
          for (const a of answers) expect(LETTERS, `${tag} answer ${a}`).toContain(a);
          expect(new Set(answers).size, `${tag} answer 중복`).toBe(answers.length);
        }
      });
    });
  }
});

describe('엄격 검증 대상 은행', () => {
  for (const slug of STRICT_SLUGS) {
    describe(slug, () => {
      const bank = banks.get(slug)!;
      const domains = examDomains(slug);

      test('도메인이 시험정보의 도메인 이름과 정확히 일치하고 전부 출제된다', () => {
        const used = new Set(bank.map((q) => q.domain));
        for (const d of used) expect(domains, `알 수 없는 도메인 "${d}"`).toContain(d);
        for (const d of domains) expect(used.has(d), `도메인 "${d}" 문항 없음`).toBe(true);
      });

      test('모든 문항이 단일 정답이다', () => {
        for (const q of bank) expect(q.answer, `#${q.number}`).toMatch(/^[A-D]$/);
      });

      test('해설이 보기 글자를 참조하지 않는다', () => {
        const bad = bank.filter((q) => referencesChoiceLetter(q.explanation)).map((q) => q.number);
        expect(bad).toEqual([]);
      });

      test('정답 분포가 보기별 20~30% 범위다', () => {
        for (const letter of LETTERS) {
          const share = bank.filter((q) => q.answer === letter).length / bank.length;
          expect(share, `${letter} 비율`).toBeGreaterThanOrEqual(0.2);
          expect(share, `${letter} 비율`).toBeLessThanOrEqual(0.3);
        }
      });

      test('같은 정답 글자가 4번 이상 연속되지 않는다', () => {
        let run = 1;
        let maxRun = 1;
        for (let i = 1; i < bank.length; i++) {
          run = bank[i].answer === bank[i - 1].answer ? run + 1 : 1;
          maxRun = Math.max(maxRun, run);
        }
        expect(maxRun).toBeLessThanOrEqual(3);
      });

      test('도메인별 문항 수가 시험 구조(1차 50 : 2차 운영 48 : 활용 32)에 맞는 비율이다', () => {
        // 공식 배점 비율은 비공개라 기출 문항 수 비율(리눅스 일반 50 / 운영 및 관리 48 / 활용 32)을 근사한다.
        const total = bank.length;
        const expected: Record<string, number> = { '리눅스 일반': 50 / 130, '리눅스 운영 및 관리': 48 / 130, '리눅스 활용': 32 / 130 };
        for (const [domain, ratio] of Object.entries(expected)) {
          const share = bank.filter((q) => q.domain === domain).length / total;
          expect(Math.abs(share - ratio), domain).toBeLessThanOrEqual(0.05);
        }
      });
    });
  }
});

describe('linux-master-2 — 지문 중복 검사', () => {
  const bank = banks.get('linux-master-2')!;
  const daily = readJson<{ id: string; slug: string; prompt: string }[]>(path.join(ROOT, 'src', 'data', 'questions.json')).filter(
    (q) => q.slug === 'linux-master-2',
  );
  const grade1 = banks.get('linux-master-1')!;

  test('일일 퀴즈 295문항이 비교 대상으로 로드된다', () => {
    expect(daily.length).toBe(295);
  });

  test('일일 퀴즈와 같거나 매우 유사한 지문이 없다', () => {
    const dailyGrams = daily.map((d) => ({ id: d.id, g: trigrams(d.prompt), n: normalize(d.prompt) }));
    const hits: string[] = [];
    for (const q of bank) {
      const g = trigrams(q.prompt);
      const n = normalize(q.prompt);
      for (const d of dailyGrams) {
        if (d.n === n || jaccard(g, d.g) >= DUP_THRESHOLD) hits.push(`#${q.number} ~ ${d.id}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test('1급 은행과 같거나 매우 유사한 지문이 없다', () => {
    const hits: string[] = [];
    for (const q of bank) {
      const g = trigrams(q.prompt);
      for (const o of grade1) {
        if (normalize(o.prompt) === normalize(q.prompt) || jaccard(g, trigrams(o.prompt)) >= DUP_THRESHOLD) hits.push(`#${q.number} ~ 1급 #${o.number}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test('은행 내부에 같거나 매우 유사한 지문이 없다', () => {
    const hits: string[] = [];
    for (let i = 0; i < bank.length; i++) {
      const gi = trigrams(bank[i].prompt);
      for (let j = i + 1; j < bank.length; j++) {
        if (normalize(bank[i].prompt) === normalize(bank[j].prompt) || jaccard(gi, trigrams(bank[j].prompt)) >= DUP_THRESHOLD) hits.push(`#${bank[i].number} ~ #${bank[j].number}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('linux-master-2 — 인덱스 연동', () => {
  test('빌드된 인덱스(exam-questions.json)가 원본 은행과 같은 문항을 담고 있다', () => {
    const bank = banks.get('linux-master-2')!;
    const indexed = getExamQuestionsByCert('linux-master-2');
    expect(indexed.length).toBe(bank.length);
    expect(indexed.map((q) => q.prompt)).toEqual(bank.map((q) => q.prompt));
  });

  test('buildExam 이 도메인 비례로 요청한 개수만큼 문항을 만든다(정답·해설 제외)', () => {
    const exam = buildExam('linux-master-2', 20);
    expect(exam).toHaveLength(20);
    expect(new Set(exam.map((q) => q.questionId)).size).toBe(20);
    for (const q of exam) {
      expect(q.slug).toBe('linux-master-2');
      expect(q.multi).toBe(false);
      expect(q.choices).toHaveLength(4);
      expect(JSON.stringify(q)).not.toContain('explanation');
    }
    expect(new Set(exam.map((q) => q.domain)).size).toBe(3);
  });
});
