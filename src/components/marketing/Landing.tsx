import Link from 'next/link';
import { BookOpen, Timer, RefreshCw, ArrowRight, Check, TrendingUp } from 'lucide-react';
import { certHref } from '@/lib/content';
import type { CertMeta } from '@/lib/content';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { JsonLd } from '@/components/JsonLd';
import { buildFaqPageLd, type FaqEntry } from '@/lib/structuredData';
import { WaitlistForm } from './WaitlistForm';

const HIGHLIGHTS = [
  {
    icon: BookOpen,
    title: '한국어 유일의 체계적 커리큘럼',
    body: '12주 주차별 구조화된 학습. Udemy의 산만함은 없고, Coursera처럼 명확한 끝이 있습니다.',
  },
  {
    icon: RefreshCw,
    title: '간격반복 복습 (SRS)',
    body: '틀린 문제를 잊을 때쯤 다시 보여주는 간격반복으로 장기 기억에 남깁니다.',
  },
  {
    icon: Timer,
    title: '실전 모의고사',
    body: '실제 시험처럼 타이머와 합/불 채점. 약점을 데이터로 확인하고 보완하세요.',
  },
];

// SAA-C03는 구직공고의 80%에 나타나는 가장 인기있는 자격증. 우선 노출.
const POPULAR_SLUGS = ['saa-c03', 'clf-c02', 'linux-master-1'];

const COMPARISON = [
  { feature: '가격 (월)', certnote: '₩9,900', udemy: '₩15-30K', coursera: '₩40-49K', pluralsight: '₩25K' },
  { feature: '한국어', certnote: '✅', udemy: '❌', coursera: '❌', pluralsight: '❌' },
  { feature: 'SRS 복습', certnote: '✅', udemy: '❌', coursera: '❌', pluralsight: '❌' },
  { feature: '주차별 커리큘럼', certnote: '✅', udemy: '❌', coursera: '✅', pluralsight: '❌' },
  { feature: '실전 모의고사', certnote: '✅', udemy: '별도', coursera: '✅', pluralsight: '✅' },
  { feature: '오답노트 자동복습', certnote: '✅', udemy: '❌', coursera: '❌', pluralsight: '❌' },
];

interface LandingProps {
  certCount: number;
  pageCount: number;
  questionCount: number;
  certs: CertMeta[];
}

// 홈 FAQ.
//
// 왜 홈에 두는가: 홈의 본문이 마케팅 문구 위주라 렌더 텍스트가 1,200자뿐이었고, GSC 에서
// 홈 자체가 '크롤링됨 - 현재 색인이 생성되지 않음' 으로 빠졌다. 홈에 실제 검색 의도
// ("aws 자격증 독학", "얼마나 걸리나", "무료로 어디까지")에 답하는 본문을 채운다.
//
// ⚠️ 중복 회피: 자격증 허브(/aws/<slug>)의 FAQ 는 시험 자체(문항수·응시료·유효기간·한국어 응시)를
// 다루므로 여기서 반복하지 않는다. 여기 질문은 **사이트·학습 방법 층위**로만 고른다.
// 12개 허브가 이미 공통 상수를 공유해 유사도가 높은 상태라, 공통 설명을 더 얹으면 중복만 는다.
//
// ⚠️ 페이월 정직성: 모의고사는 canTakeExam() 이 Pro 전용으로 막는다. 무료 범위를 말할 때
// 반드시 함께 밝힌다. 무료 경계는 FREE_WEEK 에서 파생한다(숫자를 박으면 상수만 바뀌고
// 문구가 조용히 거짓이 된다).
function buildFaq(weekSpan: { min: number; max: number } | null): FaqEntry[] {
  const faq: FaqEntry[] = [
    {
      q: 'AWS 자격증, 독학으로 준비할 수 있나요?',
      a: 'CertNote는 시험 범위를 주차별로 쪼갠 커리큘럼으로 독학을 설계합니다. 매일 심화 노트 한 편을 읽고 그 자리에서 연습 문제를 풀며, 틀린 문제는 간격반복(SRS)으로 잊을 때쯤 다시 나옵니다. 강의 영상을 몰아보는 방식과 달리 하루 분량이 정해져 있고 끝이 보인다는 점이 다릅니다.',
    },
    {
      q: '어떤 자격증부터 시작해야 하나요?',
      a: '목표 직무에 따라 다릅니다. 클라우드가 처음이면 CLF-C02(Cloud Practitioner)로 전체 지형을 잡고, 설계 직무는 SAA-C03, 개발 직무는 DVA-C02로 이어가는 경로가 일반적입니다. 직무별 순서와 각 단계를 밟는 이유는 자격증 로드맵에 단계별로 정리해 두었습니다.',
    },
  ];
  if (weekSpan) {
    faq.push({
      q: '합격까지 얼마나 걸리나요?',
      a: `자격증마다 다릅니다. CertNote의 AWS 트랙은 ${weekSpan.min}주에서 ${weekSpan.max}주 분량으로 구성되어 있고, 하루 한 편(30분 안팎)을 기준으로 짜여 있습니다. 기초 자격증이 짧고 프로페셔널·전문 분야 자격증이 깁니다.`,
    });
  }
  faq.push(
    {
      q: '무료로 어디까지 볼 수 있나요?',
      a: `모든 자격증 트랙의 Week ${FREE_WEEK}은 로그인 없이 전부 열려 있습니다. 심화 노트와 그 안의 연습 문제까지 포함됩니다. Week ${FREE_WEEK + 1} 이후의 노트와 실전 모의고사는 Pro 구독에서 제공됩니다.`,
    },
    {
      q: '연습 문제와 실전 모의고사는 어떻게 다른가요?',
      a: `연습 문제는 매일 노트 끝에 붙어 있어 그날 배운 내용을 바로 확인하는 용도이고, Week ${FREE_WEEK}에서도 무료로 풀 수 있습니다. 실전 모의고사는 실제 시험처럼 타이머와 합·불 채점으로 진행되는 별도 기능이며 Pro 구독에서 제공됩니다.`,
    },
  );
  return faq;
}

export function Landing({ certCount, pageCount, questionCount, certs }: LandingProps) {
  const nf = (n: number) => n.toLocaleString('ko-KR');
  const popular = POPULAR_SLUGS.map((slug) => certs.find((c) => c.slug === slug)).filter(
    (c): c is CertMeta => Boolean(c),
  );
  // 주차 범위는 meta.json 에서 파생한다(자격증이 늘거나 커리큘럼이 바뀌면 문구가 따라온다).
  // section 미기재 메타는 aws 로 본다(Phase0 이전 데이터 하위호환 — category.ts 와 동일 규칙).
  const awsCerts = certs.filter((c) => (c.section ?? 'aws') === 'aws');
  const weekSpan =
    awsCerts.length > 0
      ? { min: Math.min(...awsCerts.map((c) => c.weeks)), max: Math.max(...awsCerts.map((c) => c.weeks)) }
      : null;
  const faq = buildFaq(weekSpan);

  return (
    <div className="mx-auto max-w-4xl space-y-20 py-12">
      {/* Hero Section */}
      <section className="space-y-6">
        <div className="space-y-3">
          <div className="inline-block rounded-full bg-accent/10 px-3 py-1">
            <p className="text-xs font-medium text-accent">AWS 자격증은 재시험이 아니라, 일회 합격을 목표로.</p>
          </div>
          <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
            한국어로 배우는<br />AWS 자격증 합격 가이드
          </h1>
          <p className="max-w-2xl text-xl text-fg-muted">
            주차별 구조화된 커리큘럼 • 매일 30분 심화 노트 • 연습문제·모의고사·간격반복 복습까지. Week {FREE_WEEK}은 무료.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href="/signup"
            className="rounded-lg bg-accent px-6 py-3 font-semibold text-accent-fg transition hover:opacity-90 flex items-center gap-2"
          >
            무료 1주일 시작하기 <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-border px-6 py-3 font-semibold transition hover:border-border-strong"
          >
            가격 보기
          </Link>
        </div>
        <p className="text-sm text-fg-faint">
          ✓ 신용카드 불필요 • ✓ 언제든 취소 가능 • ✓ Week {FREE_WEEK} 무료
        </p>
      </section>

      {/* Trust Section */}
      <section className="grid grid-cols-2 gap-6 sm:grid-cols-4 rounded-2xl border border-border/50 bg-bg-subtle p-8">
        <div className="text-center">
          <p className="text-3xl font-bold">{nf(certCount)}</p>
          <p className="text-sm text-fg-muted mt-1">자격증 트랙</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">{nf(pageCount)}+</p>
          <p className="text-sm text-fg-muted mt-1">강의</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">{nf(questionCount)}+</p>
          <p className="text-sm text-fg-muted mt-1">연습 문항</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">₩0</p>
          <p className="text-sm text-fg-muted mt-1">Week {FREE_WEEK} 무료</p>
        </div>
      </section>

      {/* SAA-C03 Featured */}
      {popular.length > 0 && popular[0] && (
        <section className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-accent" />
              <span className="text-sm font-semibold text-accent">가장 인기있는 자격증</span>
            </div>
            <h2 className="text-3xl font-bold">AWS Solutions Architect Associate (SAA-C03)</h2>
            <p className="text-lg text-fg-muted">클라우드 직군에서 가장 널리 요구되는 어소시에이트 자격증</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href={certHref(popular[0])}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-gradient-to-br from-accent/5 to-transparent p-6 transition hover:border-accent hover:from-accent/10"
            >
              <div className="space-y-2">
                <p className="font-mono text-sm font-semibold text-accent">{popular[0].code}</p>
                <p className="text-lg font-semibold">{popular[0].name}</p>
                <ul className="space-y-1 text-sm text-fg-muted">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-accent" /> {popular[0].weeks}주 · 총 {popular[0].dayCount}일 커리큘럼</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-accent" /> 매일 심화 노트 + 연습 문제</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-accent" /> 실전 모의고사 · 간격반복 복습</li>
                </ul>
              </div>
              <span className="mt-auto flex items-center gap-2 text-sm font-semibold text-accent group-hover:gap-3">
                Week {FREE_WEEK} 무료로 시작 <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
            <div className="space-y-2 rounded-xl border border-border p-6">
              <p className="font-semibold">CertNote로 SAA 준비하면</p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-accent flex-shrink-0" /> <span>한국어 심화 노트로 개념부터 탄탄히</span></li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-accent flex-shrink-0" /> <span>매일 한 페이지씩, 출퇴근 15분 학습</span></li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-accent flex-shrink-0" /> <span>틀린 문제는 간격반복으로 자동 복습</span></li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">경쟁사와 다른 이유</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border p-5 space-y-3">
              <Icon className="h-6 w-6 text-accent" />
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-fg-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Price Comparison */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">가격 비교: CertNote vs 경쟁사</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-subtle">
                <th className="px-4 py-3 text-left font-semibold">기능</th>
                <th className="px-4 py-3 text-center font-semibold text-accent">CertNote</th>
                <th className="px-4 py-3 text-center font-semibold">Udemy</th>
                <th className="px-4 py-3 text-center font-semibold">Coursera</th>
                <th className="px-4 py-3 text-center font-semibold">Pluralsight</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-3 font-medium">{row.feature}</td>
                  <td className="px-4 py-3 text-center font-semibold text-accent">{row.certnote}</td>
                  <td className="px-4 py-3 text-center text-fg-muted">{row.udemy}</td>
                  <td className="px-4 py-3 text-center text-fg-muted">{row.coursera}</td>
                  <td className="px-4 py-3 text-center text-fg-muted">{row.pluralsight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* More Certs */}
      {popular.length > 1 && (
        <section className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">다른 자격증도 준비하세요</h2>
            <p className="text-fg-muted">SAA 합격 후, 다음 단계로: DVA (개발자) → SAP (아키텍트) → 전문 분야별</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {popular.slice(1).map((cert) => (
              <Link
                key={cert.slug}
                href={certHref(cert)}
                className="group flex flex-col gap-2 rounded-xl border border-border p-5 transition hover:border-accent hover:bg-bg-subtle"
              >
                <span className="font-mono text-xs text-fg-faint">{cert.code}</span>
                <span className="font-semibold">{cert.name}</span>
                <span className="mt-auto flex items-center gap-1 text-xs text-fg-muted transition group-hover:text-accent">
                  Week {FREE_WEEK} 미리보기 <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* FAQ — 렌더 텍스트와 아래 JSON-LD 가 같은 배열에서 나온다(구조적 1:1 보장). */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">자주 묻는 질문</h2>
        <dl className="divide-y divide-border rounded-2xl border border-border">
          {faq.map((item) => (
            <div key={item.q} className="space-y-2 p-6">
              <dt className="font-semibold">{item.q}</dt>
              <dd className="leading-relaxed text-fg-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-fg-muted">
          직무별 준비 순서는{' '}
          <Link href="/roadmap" className="font-medium text-accent hover:underline">
            자격증 로드맵
          </Link>
          에서 확인하세요.
        </p>
      </section>
      <JsonLd data={buildFaqPageLd(faq)} />

      {/* Waitlist */}
      <section className="space-y-4 rounded-2xl border border-accent/30 bg-accent/5 p-8">
        <h2 className="text-2xl font-bold">Pro 계획 알림 받기</h2>
        <p className="text-lg text-fg-muted">
          Week 2~16 전체 콘텐츠, 무제한 모의고사, 1:1 코칭이 곧 출시됩니다.<br />
          가장 먼저 접근할 수 있는 조기 할인 알림을 받으세요.
        </p>
        <WaitlistForm />
      </section>
    </div>
  );
}
