import type { CertMeta } from '@/lib/content';
import type { Language } from '@/lib/i18n';
import { HERO_SLUG, certLink } from '@/components/marketing/FeaturedCerts';
import type { FeaturedSummary } from '@/components/marketing/HeroSlot';

// 홈 히어로에 넘길 값. 서버에서 만들어 클라이언트 HeroSlot 에 plain props 로 건넨다.
export function heroFeatured(certs: CertMeta[], lang: Language): FeaturedSummary | null {
  const cert = certs.find((c) => c.slug === HERO_SLUG);
  if (!cert) return null;
  return { code: cert.code, name: cert.name, weeks: cert.weeks, dayCount: cert.dayCount, href: certLink(cert, lang) };
}

export function certCodes(certs: CertMeta[]): Record<string, string> {
  return Object.fromEntries(certs.map((c) => [c.slug, c.code]));
}
