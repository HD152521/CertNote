// 광고 슬롯의 위치별 설정(docs/P3-adsense-readiness-plan.md Step 10).
//
// 어느 화면의 어느 자리에 어떤 크기로 두는지, 그 자리의 광고 단위 ID 를 어느 환경변수에서 읽는지를
// 이 파일 한 곳에 모은다. 광고 단위 ID 는 애드센스 승인 뒤에야 생기므로 전부 환경변수로 받는다 —
// 값이 없는 위치는 null 을 돌려주고, 호출부는 그 자리에 아무것도 렌더하지 않는다.
//
// 높이를 고정하는 이유(레이아웃 밀림 방지): 반응형 단위(data-ad-format="auto" +
// data-full-width-responsive)는 구글이 화면마다 높이를 정해 모바일에서 250~280px 까지 커진다.
// 한 값으로 예약하면 모자라거나 남는다. 여기서는 <ins> 의 폭은 컨테이너에 맡기고 높이만 못 박으며
// data-ad-format 을 내지 않는다 — 애드센스는 push 시점의 요소 크기에 맞는 광고만 요청하므로, 광고가
// 늦게 뜨든 안 뜨든 자리의 높이가 변하지 않는다. 애드센스 도움말 "How to modify your responsive ad
// code"(support.google.com/adsense/answer/9183363)가 허용하는 수정이고, 같은 문서가 외부 스타일시트로
// 크기를 정하는 것은 공식 지원하지 않는다고 하므로 높이는 px 숫자로 들고 AdSlot 이 인라인 style 로 낸다.
// 인라인 style 에는 미디어쿼리를 쓸 수 없어 폭별로 높이를 달리하지 않는다.
// 콘솔에서는 "디스플레이 광고 · 반응형" 단위로 만든다.
//
// 광고가 채워지지 않았을 때(ins[data-ad-status="unfilled"]):
// - 화면 위쪽 슬롯(dayTop, hub)은 자리를 유지한다. 첫 화면 근처에서 접으면 그 접힘이 곧 본문 밀림이다.
// - 본문 끝 슬롯(dayBottom)은 접는다. 280px 빈 칸을 남기는 것보다 낫고, 접히는 시점(페이지 로드
//   직후)에 독자는 대개 글 위쪽에 있어 화면 밖에서 일어난다.
// - 광고 차단기로 스크립트 자체가 막히면 data-ad-status 가 붙지 않아 어느 슬롯도 접히지 않는다
//   (빈 자리가 남는다). 차단 여부를 탐지해 접는 로직은 두지 않았다. "광고" 표기는 채워졌을 때만
//   보이므로 이때 표기만 덩그러니 남지는 않는다.
//
// 떠 있는 버튼과의 겹침: 화면에 고정된 버튼(모바일 이전/다음 화살표, 피드백 버튼)은 스크롤에 따라
// 광고 위로 올라올 수 있다. 그 버튼들이 useOverlapsAd 로 광고와 겹치는 동안 스스로 숨는다.
// 고정 위치 버튼을 새로 만들면 같은 훅을 붙일 것.
//
// 운영 메모:
// - 자동 광고(Auto ads)는 켜지 않는 것을 기본으로 한다. 로더는 "찾을 수 없음" 화면
//   (/aws/saa-c03/week1/day99 처럼 200 + noindex 로 나가는 소프트 404)에도 실리는데, 자동 광고는
//   로더만 있으면 구글이 알아서 광고를 끼워 넣는다 — 본문 없는 화면의 광고는 정책 위반 소지가 있다.
//   수동 슬롯은 DayView·허브가 렌더될 때만 생기므로 그런 화면에 뜨지 않는다.
// - Vercel 환경변수는 Production 에만 넣는다. Preview 에 넣으면 미리보기 배포에서 실제 광고 요청이
//   나가 무효 트래픽으로 잡힐 수 있다.
import { isIndexableDay } from '@/lib/day/indexPolicy';
import { getAdSenseClient, parseAdSlotId } from './adsense';

export type AdPlacement = 'dayTop' | 'dayBottom' | 'hub';

export interface ResolvedAdPlacement {
  /** 검증을 통과한 광고 단위 ID. */
  slot: string;
  /** <ins> 의 높이(px). 폭은 컨테이너를 따른다. */
  height: number;
  /** 광고가 채워지지 않으면 슬롯을 접을지. */
  collapseWhenUnfilled: boolean;
}

/** 위치별 환경변수 이름(.env.example 과 같은 목록). 문서·오류 메시지용이고 값 읽기는 아래 함수가 한다. */
export const AD_SLOT_ENV_NAMES: Readonly<Record<AdPlacement, string>> = {
  dayTop: 'NEXT_PUBLIC_ADSENSE_SLOT_DAY_TOP',
  dayBottom: 'NEXT_PUBLIC_ADSENSE_SLOT_DAY_BOTTOM',
  hub: 'NEXT_PUBLIC_ADSENSE_SLOT_HUB',
};

// 가로 배너: 모든 폭에서 100px. 모바일의 320×100 과 넓은 화면의 728×90 이 모두 들어간다.
// 본문 위에 두므로 낮게 잡는다.
const BANNER_HEIGHT_PX = 100;
// 사각형: 300×250·336×280 이 들어가는 높이. 본문을 다 읽은 자리라 크게 둬도 읽기를 방해하지 않는다.
const RECTANGLE_HEIGHT_PX = 280;

const AD_PLACEMENT_LAYOUT: Readonly<Record<AdPlacement, Omit<ResolvedAdPlacement, 'slot'>>> = {
  dayTop: { height: BANNER_HEIGHT_PX, collapseWhenUnfilled: false },
  dayBottom: { height: RECTANGLE_HEIGHT_PX, collapseWhenUnfilled: true },
  hub: { height: BANNER_HEIGHT_PX, collapseWhenUnfilled: false },
};

// `process.env.NEXT_PUBLIC_…` 를 통째로 적어야 빌드 때 인라인된다(동적 키 `process.env[name]` 금지).
function readSlotEnv(placement: AdPlacement): string | undefined {
  switch (placement) {
    case 'dayTop':
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_DAY_TOP;
    case 'dayBottom':
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_DAY_BOTTOM;
    case 'hub':
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_HUB;
  }
}

/**
 * 이 위치에 광고 슬롯을 둘 수 있으면 설정을, 아니면 null 을 돌려준다.
 * 게시자 ID 가 없으면 슬롯 ID 가 있어도 null — 로더 없이 빈 자리만 남는 상태를 막는다.
 * 게시자 ID 는 있는데 이 위치의 슬롯 ID 만 없거나 형식이 틀리면 이 위치만 null 이다.
 */
export function resolveAdPlacement(placement: AdPlacement): ResolvedAdPlacement | null {
  if (!getAdSenseClient()) return null;
  const slot = parseAdSlotId(readSlotEnv(placement));
  if (!slot) return null;
  return { slot, ...AD_PLACEMENT_LAYOUT[placement] };
}

interface DayAdContext {
  category: string;
  week: number;
  /** 잠겨서 미리보기만 보이는 화면인가. */
  locked: boolean;
}

/**
 * day 페이지에 광고 슬롯을 둘지. DayView 는 두 라우트와 영어판이 공유하므로 여기서 가른다.
 * 색인에 내보내지 않는 문서(영어판 2주차 이상 — 번역 전이라 noindex)와 본문이 잘린 잠금 화면에는
 * 두지 않는다. 색인 판정의 단일 출처(isIndexableDay)를 그대로 따라 엇갈림이 없다.
 */
export function shouldShowDayAds({ category, week, locked }: DayAdContext): boolean {
  return !locked && isIndexableDay(category, week);
}
