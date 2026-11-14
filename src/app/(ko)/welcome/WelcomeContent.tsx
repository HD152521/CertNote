'use client';

import Link from 'next/link';
import { BookOpen, PlayCircle, RefreshCw, Trophy, Share, MoreVertical, ArrowRight } from 'lucide-react';
import type { StarterDay } from '@/lib/study/starter';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { shellStrings } from '@/lib/strings/shell';

interface WelcomeContentProps {
  starter: StarterDay | null;
}

// 온보딩 본문. 서버 페이지는 세션·첫 학습 페이지만 조회하고, 언어에 따라 갈리는 마크업은
// 여기(클라이언트)에서 렌더한다 — /welcome은 URL이 아니라 lang 쿠키가 언어를 정하는 화면이다.
export function WelcomeContent({ starter }: WelcomeContentProps) {
  const lang = useLanguage();
  const s = pick(shellStrings, lang);

  const steps = [
    { icon: BookOpen, title: s.welcomeStep1Title, body: s.welcomeStep1Body },
    { icon: PlayCircle, title: s.welcomeStep2Title, body: s.welcomeStep2Body },
    { icon: RefreshCw, title: s.welcomeStep3Title, body: s.welcomeStep3Body },
    { icon: Trophy, title: s.welcomeStep4Title, body: s.welcomeStep4Body },
  ];

  // 홈 화면 추가(PWA 설치) 안내 — 기기별 짧은 단계.
  const install = [
    {
      icon: Share,
      device: s.installIosDevice,
      steps: [s.installIosStep1, s.installIosStep2, s.installIosStep3],
    },
    {
      icon: MoreVertical,
      device: s.installAndroidDevice,
      steps: [s.installAndroidStep1, s.installAndroidStep2, s.installAndroidStep3],
    },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-8 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{s.welcomeTitle}</h1>
        <p className="text-sm text-fg-muted">{s.welcomeSubtitle}</p>
      </header>

      <ol className="space-y-3">
        {steps.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3 rounded-xl border border-border p-4">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm text-fg-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* 홈 화면 추가 안내: 앱처럼 쓰면 편하다는 점 + 기기별 짧은 단계 */}
      <section className="space-y-3 rounded-xl border border-border bg-bg-subtle p-4">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">{s.installTitle}</p>
          <p className="text-xs text-fg-muted">{s.installBody}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {install.map(({ icon: Icon, device, steps: deviceSteps }) => (
            <div key={device} className="rounded-lg border border-border bg-bg p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                <Icon className="h-3.5 w-3.5 text-accent" /> {device}
              </p>
              <ol className="space-y-1 text-xs text-fg-muted">
                {deviceSteps.map((step, i) => (
                  <li key={step} className="flex gap-1.5">
                    <span className="font-mono text-fg-faint">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {starter ? (
        <Link
          href={starter.href}
          className="block w-full rounded-md bg-accent px-5 py-3 text-center text-sm font-medium text-accent-fg transition hover:opacity-90"
        >
          <span className="block font-mono text-[11px] uppercase tracking-wider opacity-80">
            {starter.certCode} · Week 1 · Day 1
          </span>
          <span className="mt-0.5 flex items-center justify-center gap-1">
            <span className="truncate">{starter.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}</span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </span>
        </Link>
      ) : (
        <Link
          href="/"
          className="block w-full rounded-md bg-accent px-5 py-2.5 text-center text-sm font-medium text-accent-fg transition hover:opacity-90"
        >
          {s.welcomeStart}
        </Link>
      )}
    </div>
  );
}
