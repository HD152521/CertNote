import { DEFAULT_CATEGORY } from '@/lib/category';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { CertMeta } from '@/lib/content';
import { cn } from '@/lib/cn';
import type { Language } from '@/lib/i18n';
import { pick } from '@/lib/strings/dict';
import { chromeStrings, formatCertLength } from '@/lib/strings/chrome';

// 서버 컴포넌트라 훅을 못 쓴다. 현재는 한국어 홈(/)에서만 쓰이므로 기본값은 ko다.
interface CertCardProps { cert: CertMeta; lang?: Language; }

export function CertCard({ cert, lang = 'ko' }: CertCardProps) {
  const s = pick(chromeStrings, lang);
  const isPro = cert.level === 'professional';
  return (
    <Link href={`/${DEFAULT_CATEGORY}/${cert.slug}`}
      className={cn('group flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-5', 'transition hover:border-border-strong')}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-fg-faint">{cert.code}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider', isPro ? 'bg-accent/10 text-accent' : 'border border-border text-fg-muted')}>
          {isPro ? 'Pro' : 'Associate'}
        </span>
      </div>
      <h3 className="text-base font-semibold leading-snug">{cert.name}</h3>
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span>{formatCertLength(lang, cert.weeks, cert.dayCount)}</span>
        <span className="flex items-center gap-1 text-fg group-hover:text-accent transition">{s.certCardStart} <ArrowRight className="h-3.5 w-3.5" /></span>
      </div>
    </Link>
  );
}
