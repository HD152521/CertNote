'use client';

import { useEffect, useState } from 'react';

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

  if (isLoading) {
    return <div className="text-center text-sm text-fg-secondary">로딩 중...</div>;
  }

  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-border-secondary bg-bg-secondary p-6 text-center">
        <p className="text-sm text-fg-secondary">아직 결제 기록이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">결제 내역</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-secondary">
              <th className="text-left py-2 font-semibold">날짜</th>
              <th className="text-right py-2 font-semibold">금액</th>
              <th className="text-center py-2 font-semibold">상태</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-b border-border-tertiary hover:bg-bg-tertiary">
                <td className="py-3">{new Date(record.createdAt).toLocaleDateString('ko-KR')}</td>
                <td className="text-right">₩{record.amount.toLocaleString()}</td>
                <td className="text-center">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    record.status === 'success'
                      ? 'bg-green-500/20 text-green-600'
                      : record.status === 'failed'
                      ? 'bg-red-500/20 text-red-600'
                      : 'bg-yellow-500/20 text-yellow-600'
                  }`}>
                    {record.status === 'success' && '성공'}
                    {record.status === 'failed' && '실패'}
                    {record.status === 'pending' && '대기중'}
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
