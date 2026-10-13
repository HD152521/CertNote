import { DEFAULT_CATEGORY } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { Landing } from './Landing';

// 학습 페이지/연습 문항 총량(빌드 시점 스냅샷). 큰 questions.json을 root에 import하지 않기 위한 상수.
// 자격증 추가로 크게 바뀌면 갱신.
const PAGE_COUNT = 555;
const QUESTION_COUNT = 3410;

// 비로그인 방문자용 홈 본문. 정적 홈(src/app/page.tsx)과, 세션이 무효로 판정된 학습 홈
// (src/app/home/page.tsx)이 같은 화면을 쓴다. 쿠키·세션·DB 를 읽지 않는다(홈 정적 캐시 조건).
export async function HomeLanding() {
  const certs = await listCerts(DEFAULT_CATEGORY);
  return <Landing certCount={certs.length} pageCount={PAGE_COUNT} questionCount={QUESTION_COUNT} certs={certs} />;
}
