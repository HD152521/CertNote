import { DEFAULT_CATEGORY } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { buildHomeStats } from '@/lib/homeStats';
import { Landing } from './Landing';

// 비로그인 방문자용 홈 본문. 정적 홈(src/app/page.tsx)과, 세션이 무효로 판정된 학습 홈
// (src/app/home/page.tsx)이 같은 화면을 쓴다. 쿠키·세션·DB 를 읽지 않는다(홈 정적 캐시 조건).
export async function HomeLanding() {
  const certs = await listCerts(DEFAULT_CATEGORY);
  return <Landing {...buildHomeStats(certs)} certs={certs} />;
}
