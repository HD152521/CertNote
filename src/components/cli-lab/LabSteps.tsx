'use client';

import { Check, Lightbulb, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';

// 과제 틀의 가운데: 단계 막대, 현재 단계 설명·힌트·정답, 시험 포인트. AWS·리눅스 연습장이 같이 쓴다.
// 노트 본문(.article) 안에서도 본문 규칙에 휘말리지 않도록 텍스트는 div/span 으로만 그린다.

export interface StepView {
  id: string;
  title: string;
  task: string;
  hint: string;
  takeaway: string;
}

interface LabStepsProps {
  steps: StepView[];
  done: string[];
  /** 지금 풀어야 할 단계(모두 통과했으면 undefined) */
  current?: StepView;
  /** 화면에 보이는 단계(지난 단계를 눌러 다시 볼 수 있다) */
  shown?: StepView;
  lastPassed?: StepView;
  reveal: 'hint' | 'answer' | null;
  answerLines: string[];
  commands: number;
  errors: number;
  onView: (id: string | null) => void;
  onReveal: (r: 'hint' | 'answer' | null) => void;
  onPutInTerminal: (line: string) => void;
  onReset: () => void;
}

export function LabSteps(props: LabStepsProps) {
  const { steps, done, current, shown, lastPassed, reveal, answerLines } = props;
  const finished = !current;
  return (
    <>
      {/* 단계 막대: 누르면 그 단계 설명을 다시 본다 */}
      <div className="flex gap-1 px-4 sm:px-5" role="tablist" aria-label="단계">
        {steps.map((s, i) => {
          const passed = done.includes(s.id);
          const active = s.id === shown?.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${i + 1}단계 ${s.title}${passed ? ' (통과)' : ''}`}
              onClick={() => {
                props.onView(s.id === current?.id ? null : s.id);
                props.onReveal(null);
              }}
              className="group flex-1 py-2 focus-visible:outline-none"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-full transition-colors',
                  passed ? 'bg-accent' : active ? 'bg-fg' : 'bg-border group-hover:bg-border-strong',
                  'group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-bg',
                )}
              />
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 px-4 pb-4 pt-2 sm:px-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        {finished ? (
          <div className="md:col-span-2">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">완료</div>
            <div className="mt-1 text-[15px] font-semibold text-fg">
              {steps.length}단계를 모두 통과했어요 · 명령 {props.commands}개 · 오류 {props.errors}번
            </div>
            <div className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">
              오류를 만난 횟수는 감점이 아니에요. 실제 시스템에서 같은 메시지를 다시 보면 바로 알아볼 수 있게 된 거예요.
            </div>
            <button
              type="button"
              onClick={props.onReset}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-[13px] text-fg hover:border-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> 처음부터 다시
            </button>
          </div>
        ) : (
          shown && (
            <div className="min-w-0">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted">
                Step {steps.indexOf(shown) + 1} / {steps.length}
                {done.includes(shown.id) && <span className="ml-2 text-accent">통과</span>}
              </div>
              <div className="mt-1 text-[15.5px] font-semibold text-fg">{shown.title}</div>
              <div className="mt-1 text-[14px] leading-relaxed text-fg-muted">{shown.task}</div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-expanded={reveal === 'hint'}
                  onClick={() => props.onReveal(reveal === 'hint' ? null : 'hint')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12.5px] text-fg-muted hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Lightbulb className="h-3.5 w-3.5" aria-hidden /> 힌트
                </button>
                <button
                  type="button"
                  aria-expanded={reveal === 'answer'}
                  onClick={() => props.onReveal(reveal === 'answer' ? null : 'answer')}
                  className="rounded-md border border-border px-2.5 py-1 text-[12.5px] text-fg-muted hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  정답 보기
                </button>
              </div>

              {reveal === 'hint' && <div className="mt-3 text-[13.5px] leading-relaxed text-fg">{shown.hint}</div>}
              {reveal === 'answer' && (
                <div className="mt-3 space-y-1.5">
                  {answerLines.map((line) => (
                    <div key={line} className="flex items-start gap-2 rounded-md bg-code-bg px-2.5 py-2">
                      <span className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-fg">{line}</span>
                      <button
                        type="button"
                        onClick={() => props.onPutInTerminal(line)}
                        className="shrink-0 rounded border border-border-strong px-1.5 text-[11.5px] leading-5 text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        입력창에 넣기
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {!finished && (
          <div
            className={cn(
              'min-w-0 border-l-2 pl-3.5 text-[13.5px] leading-relaxed',
              lastPassed ? 'border-accent' : 'border-border',
            )}
          >
            <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-muted">
              {lastPassed && <Check className="h-3.5 w-3.5 text-accent" aria-hidden />}
              시험 포인트
            </div>
            {lastPassed ? (
              <div className="mt-1 text-fg">{lastPassed.takeaway}</div>
            ) : (
              <div className="mt-1 text-fg-faint">
                단계를 통과하면 그 명령이 시험에서 어떻게 나오는지 여기에 정리돼요.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
