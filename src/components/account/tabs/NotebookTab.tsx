'use client';

import { useLanguage } from '@/lib/i18n-client';
import { NotebookList } from '@/components/review/NotebookList';

export function NotebookTab() {
  const lang = useLanguage();

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {lang === 'en'
          ? 'Review your incorrect answers and practice challenging questions.'
          : '틀린 문제를 검토하고 연습하세요.'}
      </p>
      <div className="rounded-lg border border-border bg-bg-elevated p-4">
        <NotebookList />
      </div>
    </div>
  );
}
