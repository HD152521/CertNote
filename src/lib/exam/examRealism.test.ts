import { describe, expect, test } from 'vitest';
import { getExamInfo } from '../examInfo';
import { getExamCertSlugs, getExamQuestionsByCert, type ExamBankQuestion } from './examBank';

// 모의고사 실전화 회귀 테스트(P4 Step 3).
// "제일 긴 보기 = 정답", "B만 찍어도 절반" 같은 요령으로 풀리지 않게 하고,
// 문항 수·도메인 비중을 실제 시험(content/exam-info)과 맞춘다.
// 대상은 AWS 자격증 은행. 리눅스마스터는 보기 구성이 달라 별도로 판단한다.

const MAX_LONGEST_CORRECT_RATIO = 0.4; // 정답 보기가 가장 긴(동률 포함) 문항 비율 상한
const MAX_SINGLE_LETTER_RATIO = 0.35; // 정답 글자 하나의 비율 상한
const DOMAIN_TOLERANCE = 1; // 도메인별 문항 수 허용 오차(문항)

// 은행의 domain 문자열(짧은 이름) → exam-info 의 도메인 이름.
const DOMAIN_MAP: Record<string, Record<string, string>> = {
  'aif-c01': {
    'AI 및 ML 기초': 'AI 및 ML 기초',
    '생성형 AI 기초': '생성형 AI 기초',
    '파운데이션 모델 응용': '파운데이션 모델 응용',
    '책임 있는 AI 지침': '책임 있는 AI 지침',
    'AI 솔루션의 보안·규정 준수·거버넌스': 'AI 솔루션의 보안·규정 준수·거버넌스',
  },
  'clf-c02': {
    '클라우드 개념': '클라우드 개념',
    '보안 및 규정 준수': '보안 및 규정 준수',
    '클라우드 기술 및 서비스': '클라우드 기술 및 서비스',
    '청구·요금·지원': '청구·요금·지원',
  },
  'dea-c01': {
    '데이터 수집 및 변환': '데이터 수집 및 변환',
    '데이터 스토어 관리': '데이터 스토어 관리',
    '데이터 운영 및 지원': '데이터 운영 및 지원',
    '데이터 보안 및 거버넌스': '데이터 보안 및 거버넌스',
  },
  'dop-c02': {
    'SDLC 자동화': 'SDLC 자동화',
    '구성 관리 및 IaC': '구성 관리 및 IaC',
    '보안 및 규정 준수': '보안 및 규정 준수',
    '복원력 있는 클라우드 솔루션': '복원력 있는 클라우드 솔루션',
    '모니터링 및 로깅': '모니터링 및 로깅',
    '인시던트 및 이벤트 대응': '인시던트 및 이벤트 대응',
  },
  'dva-c02': {
    개발: 'AWS 서비스를 통한 개발',
    보안: '보안',
    배포: '배포',
    '문제 해결 및 최적화': '문제 해결 및 최적화',
  },
  'mla-c01': {
    'ML을 위한 데이터 준비': 'ML을 위한 데이터 준비',
    'ML 모델 개발': 'ML 모델 개발',
    'ML 워크플로 배포 및 오케스트레이션': 'ML 워크플로 배포 및 오케스트레이션',
    'ML 솔루션 모니터링·유지보수·보안': 'ML 솔루션 모니터링·유지보수·보안',
  },
  'mls-c01': {
    '데이터 엔지니어링': '데이터 엔지니어링',
    '탐색적 데이터 분석': '탐색적 데이터 분석',
    모델링: '모델링',
    '머신러닝 구현 및 운영': '머신러닝 구현 및 운영',
  },
  'saa-c03': {
    '보안 설계': '보안 아키텍처 설계',
    '복원력 설계': '복원력 있는 아키텍처 설계',
    '고성능 설계': '고성능 아키텍처 설계',
    '비용 최적화 설계': '비용 최적화 아키텍처 설계',
  },
  'sap-c02': {
    '새로운 솔루션을 위한 설계': '새 솔루션 설계',
    '복잡한 조직을 위한 솔루션 설계': '조직 복잡성에 대한 솔루션 설계',
    '기존 솔루션의 지속적 개선': '기존 솔루션의 지속적 개선',
    '마이그레이션 및 현대화 가속': '워크로드 마이그레이션 및 현대화',
  },
  'scs-c03': {
    '위협 탐지 및 인시던트 대응': '위협 탐지 및 인시던트 대응',
    '보안 로깅 및 모니터링': '보안 로깅 및 모니터링',
    '인프라 보안': '인프라 보안',
    '자격 증명 및 액세스 관리': '자격 증명 및 액세스 관리',
    '데이터 보호': '데이터 보호',
    '관리 및 보안 거버넌스': '관리 및 보안 거버넌스',
  },
  'soa-c02': {
    '모니터링·로깅·교정': '모니터링·로깅·교정',
    '배포·프로비저닝·자동화': '배포·프로비저닝·자동화',
    '네트워킹·콘텐츠 전송': '네트워킹 및 콘텐츠 전송',
    '안정성·비즈니스 연속성': '안정성 및 비즈니스 연속성',
    '보안·규정 준수': '보안 및 규정 준수',
    '비용·성능 최적화': '비용 및 성능 최적화',
  },
};

const AWS_SLUGS = getExamCertSlugs().filter((slug) => !slug.startsWith('linux-'));

function answerLabels(q: ExamBankQuestion): string[] {
  return q.answer.split(',').map((s) => s.trim()).filter(Boolean);
}

const textLength = (s: string): number => [...s].length;

// 정답 보기 중 최장 길이가 오답 보기 중 최장 길이 이상이면 "정답이 가장 긴 보기"로 센다(동률 포함 — 보수적).
function isCorrectLongest(q: ExamBankQuestion): boolean {
  const labels = answerLabels(q);
  const correct = q.choices.filter((c) => labels.includes(c.label)).map((c) => textLength(c.text));
  const wrong = q.choices.filter((c) => !labels.includes(c.label)).map((c) => textLength(c.text));
  return Math.max(...correct) >= Math.max(...wrong);
}

describe('모의고사 실전화 — AWS 자격증 은행', () => {
  test('검사 대상 자격증이 모두 도메인 매핑을 가진다', () => {
    expect(AWS_SLUGS.length).toBe(11);
    for (const slug of AWS_SLUGS) expect(DOMAIN_MAP[slug], slug).toBeDefined();
  });

  describe.each(AWS_SLUGS)('%s', (slug) => {
    const questions = getExamQuestionsByCert(slug);
    const info = getExamInfo(slug);

    test('문항 구조: 보기 A~D, 정답 라벨이 보기에 있다, number 중복 없음', () => {
      const numbers = questions.map((q) => q.number);
      expect(new Set(numbers).size).toBe(numbers.length);
      for (const q of questions) {
        expect(q.choices.map((c) => c.label).join(''), `#${q.number}`).toBe('ABCD');
        for (const label of answerLabels(q)) expect('ABCD', `#${q.number}`).toContain(label);
      }
    });

    test(`정답 보기가 가장 긴 문항이 ${MAX_LONGEST_CORRECT_RATIO * 100}% 이하다`, () => {
      const longest = questions.filter(isCorrectLongest);
      const ratio = longest.length / questions.length;
      expect(ratio, `정답최장 #${longest.map((q) => q.number).join(',')}`).toBeLessThanOrEqual(MAX_LONGEST_CORRECT_RATIO);
    });

    test(`정답 글자 하나가 ${MAX_SINGLE_LETTER_RATIO * 100}%를 넘지 않는다`, () => {
      const counts = new Map<string, number>();
      for (const q of questions) for (const l of answerLabels(q)) counts.set(l, (counts.get(l) ?? 0) + 1);
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      for (const [label, n] of counts) {
        expect(n / total, `${label} ${n}/${total}`).toBeLessThanOrEqual(MAX_SINGLE_LETTER_RATIO);
      }
    });

    test('문항 수가 exam-info 와 같다', () => {
      expect(info).not.toBeNull();
      expect(questions.length).toBe(info!.questionCount);
    });

    test(`도메인별 문항 수가 exam-info 비중과 ±${DOMAIN_TOLERANCE}문항 이내다`, () => {
      const map = DOMAIN_MAP[slug];
      const counts = new Map<string, number>();
      for (const q of questions) {
        const name = map[q.domain];
        expect(name, `#${q.number} 매핑 없는 도메인 "${q.domain}"`).toBeDefined();
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      for (const d of info!.domains) {
        const expected = ((info!.questionCount ?? 0) * (d.weight ?? 0)) / 100;
        const actual = counts.get(d.name) ?? 0;
        expect(Math.abs(actual - expected), `${d.name}: ${actual} vs ${expected.toFixed(1)}`).toBeLessThanOrEqual(DOMAIN_TOLERANCE);
      }
    });
  });
});
