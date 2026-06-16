import Link from 'next/link';
import { BookOpen, Timer, RefreshCw } from 'lucide-react';
import { WaitlistForm } from './WaitlistForm';

const HIGHLIGHTS = [
  {
    icon: BookOpen,
    title: '깊이 있는 학습 자료',
    body: '시험용 정답 암기가 아니라, 내부 동작·사고 사례·표준까지 짚는 기술 블로그형 자료.',
  },
  {
    icon: Timer,
    title: '실전 모의고사',
    body: '실제 시험처럼 타이머와 합/불 채점. 약점을 데이터로 확인하고 보완하세요.',
  },
  {
    icon: RefreshCw,
    title: '틀린 문제는 자동 복습',
    body: '간격반복(SRS)으로 오답을 잊을 때쯤 다시 보여줘 장기 기억으로 굳힙니다.',
  },
];

// 비로그인 방문자용 마케팅 랜딩.
export function Landing() {
  return (
    <div className="mx-auto max-w-3xl space-y-16 py-8">
      <section className="space-y-5">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">AWS · 리눅스마스터 · 6 tracks</p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          출퇴근 15분,<br />자격증 한 권을 끝내는 가장 빠른 길
        </h1>
        <p className="max-w-xl text-lg text-fg-muted">
          AWS 5종 + 리눅스마스터 1급. 매일 한 페이지씩 읽고, 2,696문항으로 실전 감각을 채우세요.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/signup" className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90">
            무료로 시작하기
          </Link>
          <Link href="/pricing" className="rounded-md border border-border px-5 py-2.5 text-sm font-medium transition hover:border-border-strong">
            요금제 보기
          </Link>
        </div>
        <p className="text-xs text-fg-faint">Week 1은 누구나 무료 · 신용카드 불필요</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-border p-5">
            <Icon className="h-5 w-5 text-accent" />
            <h2 className="mt-3 text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-fg-muted">{body}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-3 gap-4 rounded-xl border border-border bg-bg-subtle p-6 text-center">
        <div><p className="text-2xl font-bold">6</p><p className="text-xs text-fg-faint">자격증 트랙</p></div>
        <div><p className="text-2xl font-bold">415</p><p className="text-xs text-fg-faint">학습 페이지</p></div>
        <div><p className="text-2xl font-bold">2,696</p><p className="text-xs text-fg-faint">연습 문항</p></div>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold">Pro 출시 알림 받기</h2>
        <p className="text-sm text-fg-muted">전체 자료·모의고사·무제한 복습이 곧 열립니다. 이메일을 남기면 가장 먼저 알려드릴게요.</p>
        <WaitlistForm />
      </section>
    </div>
  );
}
