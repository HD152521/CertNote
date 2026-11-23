import Link from 'next/link';
import { BookOpen, Timer, RefreshCw, ListChecks, Lock, Unlock } from 'lucide-react';
import type { CertMeta } from '@/lib/content';
import { JsonLd } from '@/components/JsonLd';
import { buildFaqPageLd, type FaqEntry } from '@/lib/structuredData';
import { DAILY_STUDY_MINUTES } from '@/lib/studyTime';
import { HomeHero } from '@/components/marketing/HomeHero';
import { FeaturedCerts } from '@/components/marketing/FeaturedCerts';
import { certCodes, heroFeatured } from '@/components/marketing/homeData';

interface WeekSpan {
  min: number;
  max: number;
}

// 주차 범위는 meta.json 에서 파생한다(자격증이 늘거나 커리큘럼이 바뀌면 문구가 따라온다).
// section 미기재 메타는 aws 로 본다(Phase0 이전 데이터 하위호환 — category.ts 와 동일 규칙).
function spanOf(list: CertMeta[]): WeekSpan | null {
  if (list.length === 0) return null;
  const weeks = list.map((c) => c.weeks);
  return { min: Math.min(...weeks), max: Math.max(...weeks) };
}

function formatSpan(span: WeekSpan): string {
  return span.min === span.max ? `${span.min}주` : `${span.min}~${span.max}주`;
}

// 하이라이트는 사이트의 **전 트랙**(AWS + 리눅스마스터) 범위를 쓰고, FAQ 의 주차 답변은 문구 그대로
// "AWS 트랙" 범위만 쓴다. 홈 hero 는 AWS 중심이지만 '자격증 트랙 N개' 통계가 전 트랙 기준이라
// 하이라이트도 같은 모수를 따른다. 두 범위는 같은 certs 에서 나오므로 어느 한쪽만 낡을 수 없다.
function buildHighlights(trackSpan: WeekSpan | null) {
  const curriculumBody = trackSpan
    ? `트랙마다 ${formatSpan(trackSpan)} 분량으로 나뉘어 있고, 하루에 노트 한 편을 읽는 속도로 짰습니다. 오늘 읽을 분량과 마지막 날이 정해져 있어 끝을 가늠하며 공부할 수 있습니다.`
    : '트랙마다 주차 단위로 나뉘어 있고, 하루에 노트 한 편을 읽는 속도로 짰습니다. 오늘 읽을 분량과 마지막 날이 정해져 있어 끝을 가늠하며 공부할 수 있습니다.';
  return [
    {
      icon: BookOpen,
      title: '주차별로 끝이 정해진 커리큘럼',
      body: curriculumBody,
    },
    {
      icon: RefreshCw,
      title: '간격반복 복습 (SRS)',
      body: '틀린 문제를 잊을 때쯤 다시 보여주는 간격반복 방식으로 오답을 모아 복습합니다. 무료 회원가입 후 쓸 수 있습니다.',
    },
    {
      icon: Timer,
      title: '실전 모의고사',
      body: '실제 시험처럼 타이머를 두고 풀고, 제출하면 합격/불합격으로 채점합니다. 무료 회원가입 후 쓸 수 있습니다.',
    },
  ];
}

interface LandingProps {
  certCount: number;
  pageCount: number;
  questionCount: number;
  certs: CertMeta[];
}

// "무엇을 받나" 카드. 수치는 props 에서만 온다 — 모의고사·복습처럼 props 로 셀 수 없는 항목에는 숫자를 쓰지 않는다.
// access: open = 로그인 없이, account = 무료 가입 필요. 접근 정책(policy.ts PAYWALL_ENABLED=false) 기준이며
// 페이월을 되살리면 FAQ 와 함께 고쳐야 한다.
type Access = 'open' | 'account';

interface OfferCard {
  title: string;
  figure: string | null;
  body: string;
  access: Access;
}

function buildOffers(nf: (n: number) => string, p: Pick<LandingProps, 'certCount' | 'pageCount' | 'questionCount'>): OfferCard[] {
  return [
    {
      title: '심화 노트',
      figure: `${nf(p.pageCount)}편+`,
      body: `${nf(p.certCount)}개 트랙의 모든 주차 노트를 로그인 없이 읽을 수 있습니다. 하루 분량마다 개념 설명과 연습 문제를 한 편에 담아 한국어로 정리했습니다.`,
      access: 'open',
    },
    {
      title: '일일 연습 문제',
      figure: `${nf(p.questionCount)}문항+`,
      body: '노트 끝에 그날 배운 내용을 확인하는 문제가 붙어 있습니다. 읽고 바로 풀어 보고 정답과 해설을 확인하는 흐름이며, 로그인 없이 풀 수 있습니다.',
      access: 'open',
    },
    {
      title: '실전 모의고사',
      figure: null,
      body: '타이머를 두고 실제 시험 형식으로 풀고, 제출하면 합격/불합격으로 채점합니다. 모의고사 문제은행이 준비된 트랙에서 응시할 수 있습니다.',
      access: 'account',
    },
    {
      title: '간격반복 복습',
      figure: null,
      body: '틀린 문제는 오답 복습 목록에 쌓이고, 잊을 때쯤 다시 나옵니다. 오답 복습과 학습 기록은 계정에 저장됩니다.',
      access: 'account',
    },
  ];
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
// ⚠️ 접근 정책 정직성: 구독제 보류(policy.ts PAYWALL_ENABLED=false) 기준 문구다 — 노트는 전부
// 로그인 없이 열려 있고, 모의고사·AI 설명·복습은 무료 회원가입이 필요하다. 페이월을 되살리면
// 아래 두 답변부터 고쳐야 한다(문구가 조용히 거짓이 된다).
function codesAtWeeks(list: CertMeta[], weeks: number): string {
  return list.filter((c) => c.weeks === weeks).map((c) => c.code).join('·');
}

function buildFaq(weekSpan: WeekSpan | null, awsCerts: CertMeta[]): FaqEntry[] {
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
      a: `자격증마다 다릅니다. CertNote의 AWS 트랙은 ${weekSpan.min}주에서 ${weekSpan.max}주 분량으로 구성되어 있고, 하루 한 편(${DAILY_STUDY_MINUTES}분 안팎)을 기준으로 짜여 있습니다. 가장 짧은 트랙은 ${codesAtWeeks(awsCerts, weekSpan.min)}(${weekSpan.min}주), 가장 긴 트랙은 ${codesAtWeeks(awsCerts, weekSpan.max)}(${weekSpan.max}주)입니다.`,
    });
  }
  faq.push(
    {
      q: '무료로 어디까지 볼 수 있나요?',
      a: '모든 자격증 트랙의 전 주차 노트가 로그인 없이 열려 있습니다. 심화 노트와 그 안의 연습 문제까지 포함됩니다. 실전 모의고사, AI 오답 설명, 오답 복습과 학습 기록은 무료 회원가입 후 이용할 수 있습니다.',
    },
    {
      q: '연습 문제와 실전 모의고사는 어떻게 다른가요?',
      a: '연습 문제는 매일 노트 끝에 붙어 있어 그날 배운 내용을 바로 확인하는 용도이고, 로그인 없이 풀 수 있습니다. 실전 모의고사는 실제 시험처럼 타이머와 합·불 채점으로 진행되는 별도 기능이며 무료 회원가입 후 이용할 수 있습니다.',
    },
  );
  return faq;
}

export function Landing({ certCount, pageCount, questionCount, certs }: LandingProps) {
  const nf = (n: number) => n.toLocaleString('ko-KR');
  const awsCerts = certs.filter((c) => (c.section ?? 'aws') === 'aws');
  const linuxCount = certs.filter((c) => c.section === 'linux').length;
  const dataCount = certs.filter((c) => c.section === 'data').length;
  const highlights = buildHighlights(spanOf(certs));
  const offers = buildOffers(nf, { certCount, pageCount, questionCount });
  const faq = buildFaq(spanOf(awsCerts), awsCerts);

  return (
    <div data-home-page className="mx-auto max-w-5xl space-y-16 py-8 lg:py-12">
      {/* 첫 화면: 제목·행동 + 대표 자격증/이어서 읽기(영어 홈과 같은 컴포넌트). 홈 본문이 있다는 표식(data-home-page)은
          바깥 div 에 있어 AppShell 이 CSS 로 왼쪽 사이드바를 접는다(globals.css). */}
      <HomeHero lang="ko" featured={heroFeatured(certs, 'ko')} codes={certCodes(certs)} browseHref="/aws" />

      {/* 숫자 줄: 박스 대신 가는 선으로 나눠 본문 위계를 해치지 않게 한다. */}
      <ul className="grid grid-cols-2 gap-y-6 border-y border-border py-6 sm:grid-cols-4 sm:divide-x sm:divide-border">
        {[
          [nf(certCount), '자격증 트랙'],
          [`${nf(pageCount)}+`, '심화 노트'],
          [`${nf(questionCount)}+`, '연습 문항'],
          ['₩0', '전 과정 무료'],
        ].map(([figure, label]) => (
          <li key={label} className="flex flex-col-reverse px-4 first:pl-0">
            <span className="mt-1 text-sm text-fg-muted">{label}</span>
            <span className="font-mono text-3xl font-bold tracking-tight">{figure}</span>
          </li>
        ))}
      </ul>

      <FeaturedCerts lang="ko" certs={certs} />

      {/* Features */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">CertNote의 학습 방식</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {highlights.map(({ icon: Icon, title, body }) => (
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

      {/* What you get — 경쟁사 가격표를 대체. 수치는 props 에서만 온다. */}
      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">CertNote에서 받을 수 있는 것</h2>
          <p className="text-fg-muted">
            {nf(certCount)}개 트랙 중 AWS 자격증 {nf(awsCerts.length)}개{linuxCount > 0 ? `, 리눅스마스터 ${nf(linuxCount)}개` : ''}{dataCount > 0 ? `, 데이터 자격증 ${nf(dataCount)}개` : ''}.
            노트와 연습 문제는 로그인 없이 열려 있고, 모의고사와 복습은 무료 계정이 있으면 쓸 수 있습니다.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {offers.map((o) => (
            <div key={o.title} className="space-y-3 rounded-xl border border-border p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ListChecks className="h-5 w-5 shrink-0 text-accent" />
                  <h3 className="font-semibold">{o.title}</h3>
                </div>
                {o.figure && <span className="shrink-0 font-mono text-sm font-semibold text-accent">{o.figure}</span>}
              </div>
              <p className="text-sm text-fg-muted">{o.body}</p>
              <p className="flex items-center gap-1.5 text-xs font-medium text-fg-faint">
                {o.access === 'open' ? (
                  <><Unlock className="h-3.5 w-3.5" /> 로그인 없이</>
                ) : (
                  <><Lock className="h-3.5 w-3.5" /> 무료 가입 필요</>
                )}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-fg-muted">
          AI 오답 설명은 이메일 인증을 마친 계정에서 하루 3번까지 쓸 수 있습니다. 모든 기능이 무료입니다.
        </p>
      </section>

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
          에서 확인하세요. 읽은 내용을 손으로 익히려면{' '}
          <Link href="/lab" className="font-medium text-accent hover:underline">
            실습
          </Link>
          을, 다른 분야는{' '}
          <Link href="/linux" className="font-medium text-accent hover:underline">
            리눅스마스터
          </Link>
          ·{' '}
          <Link href="/data" className="font-medium text-accent hover:underline">
            SQLD
          </Link>{' '}
          노트를 보세요.
        </p>
      </section>
      <JsonLd data={buildFaqPageLd(faq)} />
    </div>
  );
}
