import { PrivacyContent } from './PrivacyContent';

// 개인정보처리방침(MVP 버전). 회원가입 동의 문구에서 링크된다.
// 메타데이터는 한국어로 고정 — 색인되는 HTML은 한국어이고, 본문 언어만 쿠키로 갈린다.
export const metadata = {
  title: '개인정보처리방침 · CertNote',
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
