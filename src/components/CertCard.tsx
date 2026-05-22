import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { CertMeta } from '@/lib/content';
import { cn } from '@/lib/cn';

interface CertCardProps { cert: CertMeta; }

export function CertCard({ cert }: CertCardProps) {
  const isPro = cert.level === 'professional';
  return (
    <Link href={`/aws-certs/${cert.slug}`}
      className={cn('group flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-5', 'transition hover:border-border-strong')}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-fg-faint">{cert.code}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider', isPro ? 'bg-accent/10 text-accent' : 'border border-border text-fg-muted')}>
          {isPro ? 'Pro' : 'Associate'}
        </span>
      </div>
      <h3 className="text-base font-semibold leading-snug">{cert.name}</h3>
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span>{cert.weeks}주 · {cert.dayCount}일</span>
        <span className="flex items-center gap-1 text-fg group-hover:text-accent transition">시작 <ArrowRight className="h-3.5 w-3.5" /></span>
      </div>
    </Link>
  );
}
