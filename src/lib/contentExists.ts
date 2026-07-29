import { isSection } from './category';
import { getAllDays, getCertMeta } from './content';

// docs/SEO-indexing-fix-plan.md Step6 소프트 404 수정용 존재 검증.
//
// 왜 proxy(src/proxy.ts)에서 이 함수가 필요한가: root loading.tsx가 전역 스트리밍을 켜놓아
// page.tsx 내부의 notFound()는 헤더가 이미 200으로 나간 뒤 호출되므로 상태코드를 바꿀 수 없다
// (Next.js 16.2.6 loading.md "Status Codes" 절 실측 확인 — 스트리밍 시작 후에는 상태코드
// 변경 불가). 존재 여부를 렌더 시작 "전"인 proxy 단계에서 판정해 진짜 라우트 불일치로 만들면
// (src/proxy.ts가 3세그먼트 마커로 rewrite) Next가 프리렌더된 not-found를 그대로 내보내
// 실제 404가 나간다 — 렌더 자체를 시작하지 않으므로 스트리밍 문제가 애초에 발생하지 않는다.
//
// day(week1) 존재 여부는 검증하지 않는다 — [category]/[slug]/week1/[day]/page.tsx의 주석과
// 동일한 이유(신규 day 콘텐츠가 재배포 전에도 즉시 열람 가능해야 함). 유료 [week]/[day] 라우트는
// 애초에 force-dynamic(캐시 없음)이라 이 함수가 매 요청 fresh하게 검증해도 신선도 문제가 없다.
export async function contentPathExists(pathname: string): Promise<boolean> {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return true; // /aws-certs, /en 자체는 카테고리 라우트가 별도로 처리.

  const [category, slug, weekSeg, daySeg] = segments;
  let meta;
  try {
    meta = await getCertMeta(category, slug);
  } catch {
    return false; // 존재하지 않는 자격증 slug.
  }
  // 교차 섹션 URL 차단: aws·linux가 같은 폴더에 공존하므로 getCertMeta는 섹션을 안 가린다.
  // /linux/{aws-slug}/... 같은 조합이 aws 콘텐츠를 렌더하는 중복 색인 구멍을 여기서 막는다.
  if (isSection(category) && meta.section !== category) return false;

  if (segments.length === 2) return true; // 자격증 허브 — slug 존재만 검증.
  if (segments.length !== 4) return true; // 그 외 깊이는 애초에 어떤 라우트도 매칭하지 않는다.

  if (!weekSeg.startsWith('week') || !daySeg.startsWith('day')) return false;
  if (weekSeg === 'week1') return true; // day 번호는 검증하지 않음(위 주석).

  const week = Number.parseInt(weekSeg.slice('week'.length), 10);
  const day = Number.parseInt(daySeg.slice('day'.length), 10);
  if (!Number.isFinite(week) || !Number.isFinite(day)) return false;

  const days = await getAllDays(category, slug);
  return days.some((d) => d.week === week && d.day === day);
}
