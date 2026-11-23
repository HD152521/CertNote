import type { Metadata } from 'next';
import Link from 'next/link';
import { EN_CATEGORY } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { hreflangPair } from '@/lib/i18n';
import { SITE_NAME } from '@/lib/site';
import { HomeHero } from '@/components/marketing/HomeHero';
import { FeaturedCerts } from '@/components/marketing/FeaturedCerts';
import { certCodes, heroFeatured } from '@/components/marketing/homeData';
import { SignupPrompt } from '@/components/marketing/SignupPrompt';
import { CertRequestForm } from '@/components/userInput/CertRequestForm';
import { withDefaultOgImage } from '@/lib/ogImages';

// 영어판 홈. 무료 Week1 영어 트랙의 진입점 — 정적 라우트라 /en 이 [category]보다 우선 매칭된다.
// 콘텐츠·역할 면에서 이 페이지의 한국어판은 홈(`/`, 마케팅 랜딩)이 아니라 aws 섹션 허브
// (`/aws`)다 — 둘 다 "전 자격증 트랙을 나열하는 진입 목록" 페이지라는 점에서 같은 역할을 한다.
// hreflang 짝은 `/aws` ↔ `/en`으로 고정(Phase1: 구 `/aws-certs`는 301되므로 신 URL을 가리킨다).
export const metadata: Metadata = {
  title: 'AWS, SQLD and Linux Master Study Notes in English — Free',
  description:
    'Daily in-depth study notes for 11 AWS certifications, plus SQL Developer (SQLD) and Linux Master Level 1 and 2. Free to read, with practice questions built in. Every week of every track is available in English.',
  alternates: {
    canonical: `/${EN_CATEGORY}`,
    languages: hreflangPair('/aws', `/${EN_CATEGORY}`, { xDefault: true }),
  },
  openGraph: withDefaultOgImage({
    title: `${SITE_NAME} — Certification Study Notes`,
    description: 'Free study notes for 14 certification tracks (AWS, SQLD, Linux Master), fully in English.',
    url: `/${EN_CATEGORY}`,
    type: 'website',
  }),
};

export default async function EnHomePage() {
  const certs = await listCerts(EN_CATEGORY).catch(() => []);
  return (
    <div data-home-page className="mx-auto max-w-5xl space-y-16 py-8 lg:py-12">
      <div className="space-y-4">
        <HomeHero lang="en" featured={heroFeatured(certs, 'en')} codes={certCodes(certs)} browseHref="#tracks" />
        <p className="text-xs text-fg-faint">
          <Link href="/" className="underline underline-offset-4 hover:text-fg">Switch to the Korean site</Link> if you prefer Korean.
        </p>
      </div>
      {certs.length > 0 && <FeaturedCerts lang="en" certs={certs} />}
      <SignupPrompt placement="en_home" message="home" reserveSpace />
      {certs.length === 0 && (
        <p className="text-sm text-fg-muted">English tracks are being prepared — check back soon.</p>
      )}
      <section aria-labelledby="en-more-heading" className="space-y-2">
        <h2 id="en-more-heading" className="text-lg font-semibold">More ways to study</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
          <li>
            <Link href="/en/lab" className="text-accent underline underline-offset-4 hover:text-fg">Hands-on labs</Link> — practice Linux, SQL and AWS CLI commands in your browser.
          </li>
          <li>
            <Link href="/en/roadmap" className="text-accent underline underline-offset-4 hover:text-fg">Certification roadmaps</Link> — which exam to take first for your role.
          </li>
          <li>
            <Link href="/en/about" className="text-accent underline underline-offset-4 hover:text-fg">About CertNote</Link> and{' '}
            <Link href="/en/about/how-we-make" className="text-accent underline underline-offset-4 hover:text-fg">how we make the notes</Link>.
          </li>
        </ul>
      </section>
      <CertRequestForm lang="en" />
    </div>
  );
}
