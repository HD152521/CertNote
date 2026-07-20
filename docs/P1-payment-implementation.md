# P1 결제 기능 구현 계획서 (Portone + 카카오페이/토스페이)

> P0 구독 구조(entitlement + 수동 grant) 완성 후, 실제 결제를 연동하는 단계.
> 작성: 2026-07-20 (수정: Portone 기반)

## 개요

**P0** = 대기자 + 관리자 수동 Pro 부여 (결제 제외)
**P1** = Portone 결제 게이트웨이 + 자동 Pro 부여 + 환불/취소 처리

---

## 1. 결제 게이트웨이 선택: Portone

| 항목 | 내용 |
|------|------|
| **선택** | **Portone (구 아임포트)** |
| **지원 결제수단** | 카카오페이 ✅ + 토스페이 ✅ + 신용카드 + 계좌이체 |
| **수수료** | 2.2~2.8% (카카오페이, 토스페이) |
| **장점** | 한국 최적화, 간단한 API, 빠른 셋업, 좋은 문서 |
| **추천 이유** | 한국 사용자 100% → Portone이 최고의 선택 |

**vs 경쟁사:**
| 게이트웨이 | 카카오페이 | 토스페이 | API 복잡도 | 추천 |
|----------|-----------|---------|-----------|------|
| **Portone** | ✅ | ✅ | 낮음 | ⭐⭐⭐ (추천) |
| Stripe | ❌ | ❌ | 높음 | 해외 필요시 |
| 토스페이먼츠 | ❌ | ✅ | 낮음 | 토스만 |

---

## 2. 결제 아키텍처 (Portone)

### 2-1. 결제 흐름

```
사용자 (Frontend)
   ↓ (Pro 구독 선택: 카카오페이/토스페이)
Frontend (Next.js)
   ↓ (1. GET /api/billing/payment-token)
Backend
   ↓ (Portone API: 상품 등록 → merchant_uid + impKey 발급)
Frontend
   ↓ (2. Portone JS SDK 결제창 띄우기)
Portone 결제창 (사용자가 결제)
   ↓ (카카오페이 로그인 + 결제)
Portone
   ↓ (3. Portone Webhook: payment_completed)
Backend (/api/billing/webhook)
   ↓ (4. Portone API로 결제 검증)
   ↓ (5. grantPro(userId, periodEnd))
Database (subscriptions + entitlement update)
   ↓
Frontend (UI refresh via /api/auth/me)
   ↓
✅ Pro 활성화 (제2주 콘텐츠 열림)
```

### 2-2. DB 확장 (P0의 users 테이블에 추가)

```sql
-- P0 마이그레이션 후, 추가:
CREATE TABLE subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  plan TEXT NOT NULL, -- 'monthly' | 'quarterly' | 'annual'
  status TEXT NOT NULL, -- 'active' | 'cancelled' | 'past_due'
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  amount_cents INT NOT NULL, -- 결제액 (센트 단위)
  currency TEXT NOT NULL DEFAULT 'KRW',
  status TEXT NOT NULL, -- 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 사용자 테이블에도 추가
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;
```

---

## 3. 구현 작업 항목

### 3-1. Portone 환경 설정

1. **Portone 가입**
   - https://portone.io → 회원가입 (개발/운영 분리)
   - API 키 확보 (`API Key`, `API Secret`)

2. **환경 변수**
   ```env
   # Portone API 인증
   PORTONE_API_KEY=your_api_key...
   PORTONE_API_SECRET=your_api_secret...
   NEXT_PUBLIC_PORTONE_MERCHANT_CODE=shop_xxxxx  # Portone Dashboard에서 확인
   
   # 결제 수단별 PG 코드
   PORTONE_PG_KAKAOPAY=kakaopay.TC0ONETIME
   PORTONE_PG_TOSSPAY=tosspay
   ```

3. **Portone Dashboard 설정**
   - Merchant Code 확인
   - 결제 수단 활성화:
     - ✅ 카카오페이 활성화
     - ✅ 토스페이 활성화
     - ✅ 신용카드 (선택)
   - Webhook 등록: `https://yourdomain.com/api/billing/webhook`

4. **가격 정책** (Portone 관리 X, 백엔드에서 관리)
   ```
   Monthly: ₩19,000
   Annual: ₩190,000 (월 ~15,833, 연간 3,167 절약)
   ```

### 3-2. 백엔드 구현 (Portone)

#### `src/lib/billing/portone.ts` (신규)
```typescript
// Portone REST API 클라이언트
const PORTONE_API_BASE = 'https://api.portone.io';

export interface PortonePayment {
  imp_uid: string; // Portone 거래 고유 ID
  merchant_uid: string; // CertNote의 거래 ID (user-plan-timestamp)
  paid_amount: number;
  status: 'paid' | 'ready' | 'failed' | 'cancelled';
  paid_at: number; // Unix timestamp
}

export async function getPortonePaymentToken() {
  // Portone API 키로 임시 토큰 발급 (결제창 띄우기용)
  const res = await fetch(`${PORTONE_API_BASE}/users/getToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imp_key: process.env.PORTONE_API_KEY,
      imp_secret: process.env.PORTONE_API_SECRET,
    }),
  });

  const { response } = await res.json();
  return response.access_token;
}

export async function verifyPayment(
  impUid: string,
  merchantUid: string,
): Promise<PortonePayment> {
  const token = await getPortonePaymentToken();

  const res = await fetch(`${PORTONE_API_BASE}/payments/${impUid}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const { response } = await res.json();

  // 금액 검증 (위조 방지)
  if (response.merchant_uid !== merchantUid) {
    throw new Error('Merchant UID mismatch');
  }

  return response;
}

export async function cancelSubscription(impUid: string) {
  const token = await getPortonePaymentToken();

  const res = await fetch(`${PORTONE_API_BASE}/payments/${impUid}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: 'Customer requested cancellation',
    }),
  });

  const { response } = await res.json();
  return response;
}
```

#### `app/api/billing/payment-token/route.ts` (신규)
```typescript
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getPortonePaymentToken } from '@/lib/billing/portone';

export async function GET(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const token = await getPortonePaymentToken();
    return Response.json({ token });
  } catch (error) {
    console.error('Payment token error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
```

#### `app/api/billing/verify/route.ts` (신규)
```typescript
import { getCurrentUser } from '@/lib/auth/currentUser';
import { verifyPayment } from '@/lib/billing/portone';
import { getEntitlementService } from '@/lib/entitlement/factory';

export async function POST(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const { impUid, merchantUid, planType } = await request.json();

    // 1. Portone API로 결제 검증
    const payment = await verifyPayment(impUid, merchantUid);

    if (payment.status !== 'paid') {
      return new Response('Payment not completed', { status: 400 });
    }

    // 2. 가격 검증
    const PLAN_PRICES = { monthly: 19000, annual: 190000 };
    if (payment.paid_amount !== PLAN_PRICES[planType as keyof typeof PLAN_PRICES]) {
      throw new Error('Amount mismatch');
    }

    // 3. Pro 부여 (만료 기한 설정)
    const ent = getEntitlementService();
    const periodEnd = new Date();
    if (planType === 'monthly') periodEnd.setMonth(periodEnd.getMonth() + 1);
    if (planType === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    await ent.grantPro(session.sub, periodEnd);

    return Response.json({ success: true, periodEnd });
  } catch (error) {
    console.error('Payment verification error:', error);
    return new Response('Verification failed', { status: 500 });
  }
}
```

#### `app/api/billing/webhook/route.ts` (신규)
```typescript
// Portone 웹훅 (향후 자동 갱신/취소 처리용)
import { verifyPayment } from '@/lib/billing/portone';
import { getEntitlementService } from '@/lib/entitlement/factory';

export async function POST(request: Request) {
  const body = await request.json();

  // Portone은 웹훅 시 imp_uid를 전달
  if (!body.imp_uid) return new Response('No imp_uid', { status: 400 });

  try {
    const payment = await verifyPayment(body.imp_uid, body.merchant_uid);

    if (payment.status === 'paid') {
      // 결제 성공 → Pro 부여 (클라에서도 이미 처리했지만 안전장치)
      const ent = getEntitlementService();
      // ... Pro 부여 로직
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Webhook error', { status: 500 });
  }
}
```

### 3-3. 프론트엔드 구현 (Portone)

#### `src/components/subscription/PortonePaymentButton.tsx` (신규)
```typescript
'use client';
import React, { useState } from 'react';

declare global {
  interface Window {
    IMP?: {
      init: (merchantCode: string) => void;
      request_pay: (config: any, callback: (response: any) => void) => void;
    };
  }
}

export function PortonePaymentButton({
  planType,
  label,
}: {
  planType: 'monthly' | 'annual';
  label: string;
}) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    if (!window.IMP) {
      // Portone 스크립트 로드
      const script = document.createElement('script');
      script.src = 'https://cdn.iamport.kr/v1/iamport.js';
      document.body.appendChild(script);
      script.onload = () => startPayment();
    } else {
      startPayment();
    }
  };

  const startPayment = async () => {
    setLoading(true);
    try {
      // 1. 백엔드에서 토큰 받기
      const tokenRes = await fetch('/api/billing/payment-token');
      const { token } = await tokenRes.json();

      // 2. Portone 초기화
      window.IMP!.init(process.env.NEXT_PUBLIC_PORTONE_MERCHANT_CODE!);

      // 3. 가격 설정
      const PRICES = { monthly: 19000, annual: 190000 };

      // 4. 결제창 띄우기
      window.IMP!.request_pay(
        {
          pg: 'kakaopay.TC0ONETIME', // 카카오페이 또는 'tosspay' for 토스
          pay_method: 'card', // 또는 'kakaopay', 'tosspay'
          merchant_uid: `CertNote-${Date.now()}-${Math.random()}`,
          name: `CertNote Pro (${planType === 'monthly' ? '월간' : '연간'})`,
          amount: PRICES[planType],
          buyer_email: session?.email,
          buyer_name: session?.name || 'CertNote User',
        },
        async (response) => {
          if (response.success) {
            // 5. 백엔드에서 결제 검증 및 Pro 부여
            const verifyRes = await fetch('/api/billing/verify', {
              method: 'POST',
              body: JSON.stringify({
                impUid: response.imp_uid,
                merchantUid: response.merchant_uid,
                planType,
              }),
            });

            if (verifyRes.ok) {
              // UI 갱신
              window.location.href = '/account/subscription?success=true';
            }
          } else {
            alert(`결제 실패: ${response.error_msg}`);
          }
        },
      );
    } catch (err) {
      console.error('Payment error:', err);
      alert('결제 준비 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePayment}
      disabled={loading}
      className="btn btn-primary"
    >
      {loading ? '결제창 열기 중...' : label}
    </button>
  );
}
```

#### `src/app/pricing/page.tsx` 수정 (대기자 등록 → 결제 버튼)
```typescript
import { PortonePaymentButton } from '@/components/subscription/PortonePaymentButton';

// 기존: WaitlistForm() → Pro 계획 알림
// 신규: PortonePaymentButton으로 교체 (결제 기능 활성화 후)
```

#### HTML에 Portone 스크립트 추가 (`app/layout.tsx`)
```typescript
export default function RootLayout() {
  return (
    <html>
      <head>
        <script src="https://cdn.iamport.kr/v1/iamport.js" async></script>
      </head>
      <body>...</body>
    </html>
  );
}
```

---

## 4. 구현 순서

1. **Portone 계정 + 설정** (1일)
   - https://portone.io 가입
   - API 키 발급
   - 카카오페이, 토스페이 활성화
   - Webhook URL 등록

2. **DB 마이그레이션** (1시간)
   - `scripts/db-migrate.mjs`에 subscriptions, invoices 테이블 추가

3. **백엔드 구현** (2-3일)
   - `src/lib/billing/portone.ts` (Portone API 클라이언트)
   - `/api/billing/payment-token` (토큰 발급)
   - `/api/billing/verify` (결제 검증 + Pro 부여)
   - `/api/billing/webhook` (Portone 웹훅)

4. **프론트엔드 구현** (1-2일)
   - `PortonePaymentButton` 컴포넌트
   - `/app/pricing/page.tsx` 수정 (버튼 추가)
   - 성공 페이지 (`/account/subscription?success=true`)

5. **테스트** (1일)
   - Portone 테스트 모드로 카카오페이/토스페이 결제 검증
   - 결제 후 Pro 자동 부여 확인
   - Webhook 동작 확인

6. **배포** (라이브 키로 전환)

---

## 5. 테스트 (Portone 테스트 모드)

```bash
# Portone 공식 테스트 카드
카카오페이 테스트:
  - PG: kakaopay.TC0ONETIME
  - 금액: 100원 이상 아무거나 가능
  - 결과: 100원 단위로 다르게 처리

토스페이 테스트:
  - PG: tosspay
  - 금액: 1000원 단위 권장
  - 결과: 성공/실패 모두 테스트 가능

신용카드 테스트:
  - 카드번호: 1111-1111-1111-1111
  - 유효기간: 12/25
  - CVC: 123
```

---

## 6. 참고 리소스

- [Portone 공식 문서](https://developers.portone.io/docs)
- [Portone API 레퍼런스](https://api-docs.portone.io)
- [Portone REST API 예제](https://github.com/iamport/iamport-rest-client-nodejs)
- [카카오페이 PG 설정](https://developers.kakao.com/)
- [토스페이먼츠 가이드](https://docs.tosspayments.com)

---

## 7. 나중에 (P2+)

- [ ] 구독 갱신 자동화 (Portone Webhook 활용)
- [ ] 환불 처리 (관리자 대시보드)
- [ ] 결제 내역 다운로드 / 영수증 발급
- [ ] 고급 가격 책정 (특별 할인, 단체 라이선스)
- [ ] 자동 갱신 취소 (구독 5일 전 알림)
- [ ] 결제 실패 시 재시도 (1일 후, 3일 후)
- [ ] 세금 계산 (부가세 처리)

---

## 8. Portone vs Stripe 비교

| 항목 | Portone | Stripe |
|------|---------|--------|
| **카카오페이** | ✅ | ❌ |
| **토스페이** | ✅ | ❌ |
| **한국어 지원** | ✅ | ⚠️ (기술 문서만) |
| **한국 결제** | ✅ 최적화됨 | ⚠️ 복잡함 |
| **가격** | 2.2-2.8% | 2.9%+ |
| **국제 결제** | ❌ | ✅ |
| **API 난이도** | 낮음 | 중간 |
| **추천 대상** | 한국 사용자 중심 | 국제 확장 계획 |

**CertNote 선택**: Portone (현재 한국 사용자 100%)

