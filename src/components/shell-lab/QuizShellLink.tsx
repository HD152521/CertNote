'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { TerminalSquare } from 'lucide-react';
import { LAB_CATALOG } from '@/lib/labCatalog';
import { quizShellPlan, type QuizShellInput } from '@/lib/quizShellLink';

// 셸 엔진은 무거워서 버튼을 눌렀을 때만 불러온다.
const QuizShell = dynamic(() => import('./QuizShell'), {
  ssr: false,
  loading: () => <p className="mt-3 text-xs text-fg-faint">셸을 준비하는 중…</p>,
});

const BUTTON =
  'mt-3 inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg px-2.5 py-1.5 text-xs font-medium text-fg transition hover:border-accent hover:text-accent';

interface QuizShellLinkProps {
  question: QuizShellInput;
  /** 틀렸을 때는 보기를 직접 쳐 보라고 더 분명히 권한다 */
  wrong: boolean;
}

// 리눅스 문항의 해설 아래: 명령이 있는 문항은 셸을 펼치고, 없으면 같은 주제의 단계별 실습으로 보낸다.
// 리눅스가 아닌 문항이나 관련 실습이 없는 문항이면 아무것도 그리지 않는다.
export function QuizShellLink({ question, wrong }: QuizShellLinkProps) {
  const [open, setOpen] = useState(false);
  const plan = useMemo(() => quizShellPlan(question), [question]);
  if (!plan) return null;
  if (open) return <QuizShell commands={plan.commands} labId={plan.labId} />;

  if (plan.commands.length > 0) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BUTTON}>
        <TerminalSquare className="h-3.5 w-3.5" aria-hidden />
        {wrong ? '보기의 명령을 셸에서 직접 쳐 보기' : '셸에서 직접 쳐 보기'}
      </button>
    );
  }
  const lab = LAB_CATALOG.find((l) => l.id === plan.labId);
  if (!lab) return null;
  return (
    <Link href={`/lab/${lab.id}`} className={BUTTON}>
      <TerminalSquare className="h-3.5 w-3.5" aria-hidden />
      {lab.code} 실습으로 손에 익히기: {lab.title}
    </Link>
  );
}
