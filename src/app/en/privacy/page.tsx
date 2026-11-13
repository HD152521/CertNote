import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';
import { infoAlternates } from '@/lib/infoAlternates';
import { PrivacyContent } from '@/app/privacy/PrivacyContent';

const TITLE = 'Privacy Policy';
const DESCRIPTION = `The personal information ${SITE_NAME} collects, why we use it, how long we keep it, and your rights.`;
const PATH = '/en/privacy';

// 영어판 개인정보처리방침. 본문은 /privacy 와 같은 PrivacyContent 를 쓰고, /en/* 는 URL 이 언어를 정하므로
// useLanguage() 가 항상 'en' 을 돌려준다(문구는 src/lib/strings/privacy.ts 의 en).
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: infoAlternates(PATH),
  openGraph: { title: TITLE, description: DESCRIPTION, url: PATH, type: 'website' },
};

export default function EnPrivacyPage() {
  return <PrivacyContent />;
}
