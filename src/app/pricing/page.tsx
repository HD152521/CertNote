import { PricingContent } from './PricingContent';

// 메타데이터는 한국어로 고정한다. /pricing은 영어 URL이 따로 없어 색인되는 HTML이
// 한국어여야 하고, 본문 언어는 쿠키에 따라 클라이언트에서 갈린다.
export const metadata = {
  title: '요금제 · CertNote',
  description: 'CertNote 무료 플랜과 Pro 플랜 비교. 경쟁사보다 60% 저렴하고 한국어 + SRS 복습.',
};

export default function PricingPage() {
  return <PricingContent />;
}
