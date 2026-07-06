import { DEFAULT_CATEGORY } from '@/lib/category';
import { getAllDays, getCertMeta } from '@/lib/content';
import { query } from '@/lib/db';

export interface StarterDay {
  certCode: string;
  certName: string;
  title: string;
  href: string;
}

// 가입 시 받은 목표 자격증(users.target_cert)의 첫 학습 페이지.
// 온보딩(welcome)·홈 첫 카드에서 "무엇부터 시작할지"를 유저 대신 정해
// 가입 → 첫 학습 도달을 한 클릭으로 줄인다.
// 프로필 없음·슬러그 불일치 등 어떤 실패에도 null — 호출부는 기존 일반 동선으로 폴백.
export async function getStarterDay(userId: string): Promise<StarterDay | null> {
  try {
    const rows = await query<{ target_cert: string | null }>(
      'SELECT target_cert FROM users WHERE id = $1',
      [userId],
    );
    const slug = rows[0]?.target_cert;
    if (!slug) return null;
    const [meta, days] = await Promise.all([
      getCertMeta(DEFAULT_CATEGORY, slug),
      getAllDays(DEFAULT_CATEGORY, slug),
    ]);
    const first = days[0];
    if (!first) return null;
    return { certCode: meta.code, certName: meta.name, title: first.title, href: first.href };
  } catch {
    return null;
  }
}
