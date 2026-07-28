import type { Section } from './category';
import type { CertLevel } from './content';

// 섹션별 티어(레벨) 정의 — 정렬·라벨·하이라이트의 단일 출처.
// AWS 4티어는 기존 유지(회귀 0). K8s/TF는 콘텐츠 투입(Phase3) 시 확정.
export const SECTION_TIERS: Record<Section, string[]> = {
  aws: ['foundational', 'associate', 'professional', 'specialty'],
  linux: ['grade-2', 'grade-1'],
  kubernetes: ['kcna', 'ckad', 'cka', 'cks'],
  terraform: ['associate', 'professional'],
};

const AWS_LABELS: Record<string, string> = {
  foundational: 'Foundational',
  associate: 'Associate',
  professional: 'Professional',
  specialty: 'Specialty',
};

function titleCase(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// 레벨 표시 라벨. AWS 알려진 값은 기존 라벨, 그 외/미등록은 title-case 폴백(회귀 안전).
// section 생략 시 'aws' 기본 — 기존 호출부(certLevelLabel(level))가 그대로 동작.
export function certLevelLabel(level: CertLevel, section: Section = 'aws'): string {
  if (section === 'aws' && AWS_LABELS[level]) return AWS_LABELS[level];
  return titleCase(level);
}

// 허브에서 강조할 최상위 티어인가(섹션별 마지막 티어).
export function isHighlightLevel(level: CertLevel, section: Section = 'aws'): boolean {
  const tiers = SECTION_TIERS[section] ?? [];
  return tiers.length > 0 && level === tiers[tiers.length - 1];
}

// 자격증을 티어(레벨) 순서로 그룹핑 — 하드코딩 LEVEL_ORDER 대체.
// 미등록 레벨은 뒤로(999), 동레벨은 order 오름차순.
export function groupCertsByLevel<T extends { level: CertLevel; order: number }>(
  certs: T[],
  section: Section = 'aws',
): { level: string; certs: T[] }[] {
  const tiers = SECTION_TIERS[section] ?? [];
  const rank = (lvl: string): number => {
    const i = tiers.indexOf(lvl);
    return i < 0 ? 999 : i;
  };
  const sorted = [...certs].sort((a, b) => rank(a.level) - rank(b.level) || a.order - b.order);
  const out: { level: string; certs: T[] }[] = [];
  for (const c of sorted) {
    let g = out.find((x) => x.level === c.level);
    if (!g) {
      g = { level: c.level, certs: [] };
      out.push(g);
    }
    g.certs.push(c);
  }
  return out;
}
