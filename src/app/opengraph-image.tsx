import { ImageResponse } from 'next/og';

// 사이트 기본 OG 카드(카톡·트위터 등 링크 미리보기). 하위 세그먼트는 자격증별 카드로 덮어쓴다.
// ImageResponse 기본 폰트는 한글 미지원 → 라틴 텍스트로만 구성한다.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Cert Notes — AWS Certification Study Notes';

export default function OgImage() {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: '#4f7cff',
              display: 'flex',
            }}
          />
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>Cert Notes</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1 }}>
            AWS Certification
          </div>
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1, color: '#7ea2ff' }}>
            Study Notes
          </div>
          <div style={{ fontSize: 30, color: '#aeb9cf', marginTop: 8 }}>
            SAA · DVA · SOA · SAP · DOP · SCS · MLA · MLS · DEA · CLF · AIF
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#8b98b3' }}>
          <div>Daily notes · Quizzes · Mock exams · SRS review</div>
          <div>cert-note.vercel.app</div>
        </div>
      </div>
    ),
    size,
  );
}
