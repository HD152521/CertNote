// 사이트 전역 상수·SEO 공용 헬퍼. 메타데이터·sitemap·robots·OG가 공유하는 canonical 값.
// APP_URL(메일 링크에도 쓰는 env)이 있으면 우선, 없으면 프로덕션 도메인.
// fs 비의존 — 클라 컴포넌트에서 import돼도 안전.
export const SITE_URL = (process.env.APP_URL ?? 'https://cert-note.vercel.app').replace(/\/$/, '');
export const SITE_NAME = 'Cert Notes';
export const SITE_TAGLINE = 'AWS 자격증 한국어 학습 노트';

// 마크다운 본문에서 검색 결과용 요약문(meta description)을 뽑는다.
export function excerptOf(markdown: string, max = 155): string {
  const text = markdown
    .replace(/^---[\s\S]*?---/, '') // frontmatter
    .replace(/```[\s\S]*?```/g, ' ') // 코드블록
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 → 텍스트
    .replace(/^#{1,6}\s+.*$/gm, ' ') // 제목줄 제거(본문 첫 단락을 요약으로)
    .replace(/[*_`>|#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
