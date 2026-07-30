// 사용자 합격 후기 도메인 타입(SRS '복습' review와 무관 — 그래서 별도 디렉터리 reviews/).

export interface Review {
  id: string;
  section: string;
  certSlug: string;
  rating: number; // 1~5
  passed: boolean | null; // 합격 여부(선택)
  title: string | null;
  body: string;
  authorName: string; // 마스킹된 표시 이름(원본 미노출)
  createdAt: string; // 'YYYY-MM-DD' (KST)
}

// 관리자 목록용(숨김 포함).
export interface AdminReview extends Review {
  hidden: boolean;
}

export interface CreateReviewInput {
  userId: string;
  section: string;
  certSlug: string;
  rating: number;
  passed: boolean | null;
  title: string | null;
  body: string;
}

// AggregateRating JSON-LD·요약 표시용. count=0이면 평점 미표기(스팸 방지).
export interface ReviewAggregate {
  count: number;
  average: number; // 소수 1자리
}
