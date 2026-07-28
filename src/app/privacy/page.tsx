import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';
import { PrivacyContent } from './PrivacyContent';

const TITLE = '개인정보처리방침';
const DESCRIPTION = `${SITE_NAME}가 수집하는 개인정보 항목과 이용 목적, 보관 기간, 이용자 권리를 안내합니다.`;

// 개인정보처리방침(MVP 버전). 회원가입 동의 문구에서 링크된다.
// 메타데이터는 한국어로 고정 — 색인되는 HTML은 한국어이고, 본문 언어만 쿠키로 갈린다(PrivacyContent).
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/privacy' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/privacy', type: 'website' },
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
