import Link from 'next/link';
import { BookOpen, PlayCircle, RefreshCw, Trophy, Share, MoreVertical, ArrowRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getStarterDay } from '@/lib/study/starter';

export const metadata = {
  title: '시작하기 · CertNote',
};

const STEPS = [
  {
    icon: BookOpen,
    title: '① 목표 자격증을 고르세요',
    body: '왼쪽 사이드바에서 자격증을 누르면 시험 정보와 주차별 커리큘럼이 열려요.',
  },
  {
    icon: PlayCircle,
    title: '② 매일 한 페이지씩',
    body: '하루 분량의 학습 자료를 읽고, 끝의 연습 문제로 바로 확인하세요. 출퇴근 15분이면 충분해요.',
  },
  {
    icon: RefreshCw,
    title: '③ 틀린 문제는 자동 복습',
    body: '틀린 문항은 복습함에 쌓이고, 잊을 때쯤 다시 나타나요. 알림을 켜두면 매일 챙겨드려요.',
  },
  {
    icon: Trophy,
    title: '④ 모의고사로 실전 점검',
    body: '실제 시험처럼 타이머·채점으로 약점을 데이터로 확인하고 보완하세요.',
  },
];

// 홈 화면 추가(PWA 설치) 안내 — 기기별 짧은 단계.
const INSTALL = [
  {
    icon: Share,
    device: '아이폰 (Safari)',
    steps: ['하단 공유 버튼 (□↑) 탭', "'홈 화면에 추가' 선택", "오른쪽 위 '추가' 탭"],
  },
  {
    icon: MoreVertical,
    device: '갤럭시·안드로이드 (Chrome)',
    steps: ['오른쪽 위 메뉴 (⋮) 탭', "'홈 화면에 추가' 또는 '앱 설치' 선택", "'추가' 탭"],
  },
];

// 가입 직후 첫 방문 온보딩. 핵심 사용 흐름 4단계 안내.
// CTA는 가입 시 고른 목표 자격증의 첫 학습 페이지로 직행 — 유저가 이미 알려준
// 목표를 되묻지 않고 첫 학습(first value)까지 한 클릭으로 줄인다.
export default async function WelcomePage() {
  const session = await getCurrentUser();
  const starter = session ? await getStarterDay(session.sub) : null;
  return (
    <div className="mx-auto max-w-lg space-y-8 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">환영합니다 🎉</h1>
        <p className="text-sm text-fg-muted">CertNote는 이렇게 쓰면 가장 효과적이에요.</p>
      </header>

      <ol className="space-y-3">
        {STEPS.map(({ icon: Icon, title, body }) => (
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
          <p className="text-sm font-semibold">📲 홈 화면에 추가하면 앱처럼 써요</p>
          <p className="text-xs text-fg-muted">주소창 없이 한 번에 열리고, 알림도 더 잘 받아요. (30초)</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {INSTALL.map(({ icon: Icon, device, steps }) => (
            <div key={device} className="rounded-lg border border-border bg-bg p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                <Icon className="h-3.5 w-3.5 text-accent" /> {device}
              </p>
              <ol className="space-y-1 text-xs text-fg-muted">
                {steps.map((s, i) => (
                  <li key={s} className="flex gap-1.5">
                    <span className="font-mono text-fg-faint">{i + 1}.</span>
                    <span>{s}</span>
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
          시작하기
        </Link>
      )}
    </div>
  );
}
