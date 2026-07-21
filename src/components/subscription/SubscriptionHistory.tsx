'use client';

import { useEffect, useState } from 'react';
import { useLanguage, t } from '@/lib/i18n-client';

interface PaymentRecord {
  id: string;
  amount: number;
  status: 'pending' | 'success' | 'failed';
  createdAt: string;
}

interface SubscriptionHistoryProps {
  userId: string;
}

export function SubscriptionHistory({ userId }: SubscriptionHistoryProps) {
  const lang = useLanguage();
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // TODO: /api/payment/history 엔드포인트 구현 후
    // async function fetchHistory() {
    //   const res = await fetch('/api/payment/history');
    //   const data = await res.json();
    //   setRecords(data);
    //   setIsLoading(false);
    // }
    // fetchHistory();

    setIsLoading(false);
  }, [userId]);

  const dateFormat = lang === 'en' ? 'en-US' : 'ko-KR';

  if (isLoading) {
    return <div className="text-center text-sm text-fg-secondary">{t(lang, 'loading')}</div>;
  }

  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-border-secondary bg-bg-elevated p-6 text-center">
        <p className="text-sm text-fg-secondary">{t(lang, 'noPaymentHistory')}</p>
      </div>
    );
  }

  const getStatusLabel = (status: string) => {
    if (status === 'success') return t(lang, 'success');
    if (status === 'failed') return t(lang, 'failed');
    return t(lang, 'pending');
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t(lang, 'billingHistory')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-secondary">
              <th className="text-left py-2 font-semibold">{t(lang, 'date')}</th>
              <th className="text-right py-2 font-semibold">{t(lang, 'amount')}</th>
              <th className="text-center py-2 font-semibold">{t(lang, 'status')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-b border-border-tertiary hover:bg-bg-subtle">
                <td className="py-3">{new Date(record.createdAt).toLocaleDateString(dateFormat)}</td>
                <td className="text-right">₩{record.amount.toLocaleString()}</td>
                <td className="text-center">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    record.status === 'success'
                      ? 'bg-green-500/20 text-green-600'
                      : record.status === 'failed'
                      ? 'bg-red-500/20 text-red-600'
                      : 'bg-yellow-500/20 text-yellow-600'
                  }`}>
                    {getStatusLabel(record.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
