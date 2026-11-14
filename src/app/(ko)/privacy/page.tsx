import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';
import { infoAlternates } from '@/lib/infoAlternates';
import { PrivacyContent } from './PrivacyContent';
import { withDefaultOgImage } from '@/lib/ogImages';

const TITLE = '개인정보처리방침';
const DESCRIPTION = `${SITE_NAME}가 수집하는 개인정보 항목과 이용 목적, 보관 기간, 이용자 권리를 안내합니다.`;

// 개인정보처리방침(MVP 버전). 회원가입 동의 문구에서 링크된다.
// 한국어판은 /privacy 로 고정(URL 이 언어를 정한다). 영어판은 /en/privacy.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: infoAlternates('/privacy'),
  openGraph: withDefaultOgImage({ title: TITLE, description: DESCRIPTION, url: '/privacy', type: 'website' }),
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
