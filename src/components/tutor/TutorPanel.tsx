'use client';

import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Send } from 'lucide-react';

interface TutorPanelProps {
  questionId: string;
  selected: string; // 사용자가 고른(틀린) 답
}

function detectLanguage(pathname: string): 'ko' | 'en' {
  return pathname.startsWith('/en') ? 'en' : 'ko';
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

const ERR: Record<string, string> = {
  rate_limited: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
  tutor_unavailable: 'AI 튜터가 아직 준비 중이에요.',
  question_not_found: '문제 정보를 찾지 못했어요.',
};

// 오답 직후 노출되는 AI 설명 패널. Pro 전용(서버 게이팅) — 무료/미설정은 안내로 수렴.
export function TutorPanel({ questionId, selected }: TutorPanelProps) {
  const pathname = usePathname();
  const language = detectLanguage(pathname);
  const [turns, setTurns] = useState<Turn[]>([]); // 합성 프롬프트 이후의 대화
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [needPro, setNeedPro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followup, setFollowup] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(history: Turn[]) {
    setBusy(true);
    setError(null);
    setStreaming('');
    try {
      const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, selected, history, language }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'pro_required') {
          setNeedPro(true);
          return;
        }
        setError(ERR[data.error] ?? data.message ?? '설명을 불러오지 못했어요.');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreaming(acc);
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
      setTurns((prev) => [...prev, { role: 'assistant', text: acc }]);
      setStreaming('');
    } catch {
      setError('네트워크 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  }

  function start() {
    setStarted(true);
    void ask([]);
  }

  function sendFollowup() {
    const q = followup.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: 'user', text: q }];
    setTurns(next);
    setFollowup('');
    void ask(next);
  }

  if (!started) {
    return (
      <button
        type="button"
        onClick={start}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-accent/40 px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/10"
      >
        <Sparkles className="h-4 w-4" /> AI 설명 보기
      </button>
    );
  }

  if (needPro) {
    return (
      <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-4 text-sm">
        <p className="flex items-center gap-1.5 font-medium text-fg"><Sparkles className="h-4 w-4 text-accent" />
          {language === 'en' ? 'AI tutor is Pro-only' : 'AI 오답 튜터는 Pro 전용이에요'}
        </p>
        <p className="mt-1 text-fg-muted">
          {language === 'en'
            ? 'AI explains wrong questions and answers follow-up questions in English.'
            : '틀린 문제를 AI가 풀어 설명하고, 추가 질문에도 답해드려요.'}
        </p>
        <Link href="/pricing" className="mt-2 inline-block rounded-md border border-accent/40 px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/10">
          {language === 'en' ? 'See Pro plans' : 'Pro 업그레이드 보기'}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-elevated p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-fg"><Sparkles className="h-4 w-4 text-accent" />
        {language === 'en' ? 'AI Explanation' : 'AI 설명'}
      </p>
      <div ref={scrollRef} className="max-h-80 space-y-3 overflow-y-auto">
        {turns.map((t, i) =>
          t.role === 'assistant' ? (
            <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{t.text}</p>
          ) : (
            <p key={i} className="rounded-md bg-bg-subtle px-3 py-1.5 text-sm text-fg-muted">{t.text}</p>
          ),
        )}
        {streaming && <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{streaming}</p>}
        {busy && !streaming && <p className="text-sm text-fg-faint">{language === 'en' ? 'Thinking…' : '생각 중…'}</p>}
      </div>
      {error && <p className="mt-2 text-sm text-red-500" role="alert">{error}</p>}

      {/* 후속 질문 */}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={followup}
          onChange={(e) => setFollowup(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendFollowup(); }}
          placeholder={language === 'en' ? 'Ask a follow-up question' : '추가로 궁금한 점을 물어보세요'}
          disabled={busy}
          className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-border-strong disabled:opacity-50"
        />
        <button
          type="button"
          onClick={sendFollowup}
          disabled={busy || !followup.trim()}
          aria-label={language === 'en' ? 'Send question' : '질문 보내기'}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-strong text-fg-muted transition hover:bg-fg/5 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
