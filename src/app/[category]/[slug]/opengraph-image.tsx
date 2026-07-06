import { ImageResponse } from 'next/og';
import { DEFAULT_CATEGORY } from '@/lib/category';
import { getCertMeta } from '@/lib/content';

// 자격증별 OG 카드. 허브와 그 하위(week/day) 페이지의 링크 미리보기에 쓰인다.
// meta.name은 영문이라 기본 폰트로 안전(한글은 폰트 임베딩 필요해 피한다).
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Cert Notes certification study track';

const LEVEL_EN: Record<string, string> = {
  foundational: 'Foundational',
  associate: 'Associate',
  professional: 'Professional',
  specialty: 'Specialty',
};

export default async function OgImage({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  let code = 'Cert Notes';
  let name = 'Certification Study Notes';
  let level = '';
  let weeks = 0;
  try {
    const meta = await getCertMeta(category === DEFAULT_CATEGORY ? category : DEFAULT_CATEGORY, slug);
    code = meta.code;
    name = meta.name;
    level = LEVEL_EN[meta.level] ?? '';
    weeks = meta.weeks;
  } catch {
    // 알 수 없는 slug면 기본 카드로.
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #0a0f1c 0%, #101c36 60%, #16295a 100%)',
          color: '#f3f5f9',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#4f7cff', display: 'flex' }} />
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>Cert Notes</div>
          </div>
          {level ? (
            <div
              style={{
                display: 'flex',
                fontSize: 26,
                color: '#7ea2ff',
                border: '2px solid #33508f',
                borderRadius: 999,
                padding: '10px 26px',
              }}
            >
              {level}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>{code}</div>
          <div style={{ fontSize: 44, fontWeight: 600, color: '#c6d1e6', lineHeight: 1.2 }}>{name}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#8b98b3' }}>
          <div>{weeks > 0 ? `${weeks}-week curriculum · Quizzes · Mock exam` : 'Daily notes · Quizzes · Mock exams'}</div>
          <div>cert-note.vercel.app</div>
        </div>
      </div>
    ),
    size,
  );
}
