// 마일스톤 축하 판정(순수). 스트릭·커버리지 임계 도달 시 1회 축하 알림을 고른다.
// 중복 발송 방지: 이미 보낸 코드 집합(last_milestone_sent, CSV)을 제외한 '최고 우선순위' 하나.

export interface MilestoneInput {
  streak: number; // 현재 연속 학습일
  coverage: number; // 전체 문제 커버리지(0~100)
}

export interface Milestone {
  code: string;
  title: string;
  body: string;
}

// 우선순위 순(위가 높음). 여러 개 동시 달성 시 가장 큰 성취를 먼저 축하한다.
const MILESTONES: Array<{ code: string; met: (i: MilestoneInput) => boolean } & Omit<Milestone, 'code'>> = [
  { code: 'cov100', met: (i) => i.coverage >= 100, title: '🏆 전 범위 완주!', body: '모든 문제를 한 번씩 풀었어요. 정말 대단해요!' },
  { code: 'streak30', met: (i) => i.streak >= 30, title: '🔥 30일 연속!', body: '한 달 연속 학습 달성 — 완전히 습관이 됐네요!' },
  { code: 'cov50', met: (i) => i.coverage >= 50, title: '🎯 절반 돌파!', body: '전체 문제의 절반을 풀었어요. 이 페이스 유지해요!' },
  { code: 'streak7', met: (i) => i.streak >= 7, title: '🔥 7일 연속!', body: '일주일 연속 학습! 페이스가 아주 좋아요.' },
];

// 아직 축하하지 않은 것 중 가장 높은 우선순위의 마일스톤. 없으면 null.
export function pickMilestone(input: MilestoneInput, sent: ReadonlySet<string>): Milestone | null {
  for (const m of MILESTONES) {
    if (m.met(input) && !sent.has(m.code)) {
      return { code: m.code, title: m.title, body: m.body };
    }
  }
  return null;
}

// last_milestone_sent(CSV) → 코드 집합.
export function parseSentCodes(csv: string | null): Set<string> {
  return new Set((csv ?? '').split(',').filter(Boolean));
}
