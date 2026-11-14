'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LabTerminal } from '@/components/cli-lab/LabTerminal';
import { useLanguage } from '@/lib/i18n-client';
import { LAB_CATALOG } from '@/lib/labCatalog';
import { quizSandboxState, SANDBOX_DIR } from '@/lib/shell-lab/quizSandbox';
import { prompt } from '@/lib/shell-lab/run';
import { session } from '@/lib/shell-lab/state';
import { shellStrings } from './i18n';
import { useShell } from './useShell';

interface QuizShellProps {
  commands: string[];
  labId: string | null;
}

// 퀴즈 해설 아래에 펼치는 작은 셸. 정답 보기와 오답 보기를 나란히 쳐 보며 차이를 눈으로 확인한다.
// 셸 엔진이 무거워서 Quiz 가 버튼을 눌렀을 때만 이 컴포넌트를 불러온다.
export default function QuizShell({ commands, labId }: QuizShellProps) {
  const lang = useLanguage();
  const str = shellStrings(lang);
  const { sim, log, input, setInput, inputRef, onKeyDown, putInTerminal } = useShell({
    initial: () => quizSandboxState(commands),
    banner: str.quizBanner(SANDBOX_DIR),
  });
  const lab = labId ? LAB_CATALOG.find((l) => l.id === labId) : undefined;

  return (
    <div className="not-prose mt-3 overflow-hidden rounded-lg border border-border-strong bg-bg">
      {commands.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
          <span className="mr-1 text-[11.5px] text-fg-faint">{str.clickToType}</span>
          {commands.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => putInTerminal(c)}
              className="rounded border border-border bg-bg-elevated px-2 py-1 font-mono text-[12px] text-fg transition hover:border-accent hover:text-accent"
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <LabTerminal
        cwd={session(sim).cwd}
        headerRight={<span className="text-[#5eead4]">{str.practiceTag}</span>}
        prompt={prompt(sim)}
        inputLabel={str.inputLabel}
        placeholder={str.quizPlaceholder}
        compact
        log={log}
        input={input}
        onInput={setInput}
        onKeyDown={onKeyDown}
        inputRef={inputRef}
      />
      {lab && (
        <Link
          href={lang === 'en' ? `/en/lab/${lab.id}` : `/lab/${lab.id}`}
          className="group flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-[13px] text-fg-muted transition hover:text-fg"
        >
          <span className="min-w-0 truncate">
            <span className="mr-1.5 font-mono text-[11px] text-fg-faint">{lab.code}</span>
            {lang === 'en' ? str.stepByStep : `${str.stepByStep}: ${lab.title}`}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
