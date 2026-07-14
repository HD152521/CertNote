# 결제 정책 문서 (P0)

> 구독형 SaaS로 전환하는 CertNote의 결제 정책 정의.
> 작성: 2026-07-14
> 상태: **기획 중** (결제 프로바이더 선택 대기)

---

## 1. 가격 책정

### 플랜 구성
| 플랜 | 가격 | 청구 주기 | 포함 내용 |
|-----|------|---------|---------|
| **Free** | ₩0 | - | 각 자격증 Week1 전체 |
| **Pro** (월간) | ₩9,900 | 매월 | 전체 주차 + 모의고사 + 무제한 SRS |
| **Pro** (연간) | ₩99,000 | 연 1회 | 월간과 동일 (17% 할인) |

### 할인 정책
- 학생: 30% 할인 (학생증 인증 필요) → Pro 월 ₩6,930 / 년 ₩69,300
- 그룹 구매: 5인 이상 20% 할인
- 프로모션 코드: 운영진이 수동으로 관리

---

## 2. 프로비저닝 정책

### 2-1. 신규 가입 (Mid-cycle Join)
**규칙**: 가입일로부터 다음 청구일까지 일할 계산 (일 단위)

**예시**:
- 월간 Pro ₩9,900 (30일 기준 ₩330/일)
- 7월 15일 가입 → 7월 31일까지 17일 = **₩5,610 청구**
- 8월 1일부터 정상 청구 (₩9,900)

**구현**: 결제 프로바이더 `proration_behavior: 'prorated'`

### 2-2. 연간→월간 전환
- 남은 기간을 월간 가격 기준 크레딧으로 환산
- 예: 연간 가입 후 3개월 후 월간 전환
  - 남은 9개월 = ₩82,500 크레딧
  - 월간 ₩9,900 자동 갱신 설정

### 2-3. 월간→연간 전환 (업그레이드)
- 남은 월수를 연간 가격에 포함
- 예: 월간 가입 후 8개월 후 연간 전환
  - 남은 4개월 = ₩39,600 크레딧
  - 연간 ₩99,000에서 크레딧 차감 → **₩59,400 청구**

---

## 3. 환불 정책

### 3-1. 취소 규칙
| 상황 | 환불 | 비고 |
|-----|-----|------|
| **무료 기간 내 취소** | 100% | 첫 7일 |
| **청구 후 취소** | ✗ 환불 없음 | 중도해제 시 즉시 이용 중단, 남은 기간 환급 안 함 |
| **기술 오류로 중복 청구** | 100% | 관리자 수동 처리 |

### 3-2. 환불 미지원 이유
- 저가 구독 모델 (한계 수익성)
- 콘텐츠 즉시 이용 가능 → 역청구 리스크
- Pro 사용 증거 있으면 환불 거부

---

## 4. 결제 실패 처리

### 4-1. 자동 재시도
```
일자별 재시도 스케줄 (최대 3회):
- Day 1 (결제 실패): 1회 자동 재시도 (즉시)
- Day 3: 2회 재시도 + 알림 (앱 푸시 + 이메일)
- Day 5: 3회 재시도 + 알림
- Day 7: 구독 자동 취소 (접근 차단)
```

### 4-2. 사용자 알림
- **실패 직후**: 앱 푸시 알림 "결제 실패. 재시도 예정"
- **Day 3**: 이메일 "결제 정보 업데이트 필요"
- **Day 5**: 이메일 + 앱 배너 "구독 만료 예정"
- **Day 7**: 이메일 + 앱 내 차단 UI "구독 만료됨"

### 4-3. 구현
- 결제 웹훅: 실패 이벤트 저장 (`payment_failures` 테이블)
- 크론 작업: `/api/cron/payment-retry` (Daily 05:00 KST)
  - 실패 2일 이상 기록 → 결제 게이트웨이 재호출
  - 성공 → 상태 갱신, 알림 초기화
  - 3회 모두 실패 → plan='free'로 강등, 알림 발송

---

## 5. 기능 차단 (Feature Cutoff)

### 5-1. 구독 만료 상황
```
구독 활성 → Day 7 결제 실패 → plan 강등 (free)
```

### 5-2. 접근 제어
| 기능 | 만료 전 | 만료 후 |
|-----|--------|--------|
| Week1 본문 | ✓ 읽기 가능 | ✓ 읽기 가능 |
| Week2+ 본문 | ✓ 읽기 가능 | ✗ Paywall + "재구독" CTA |
| 모의고사 | ✓ 응시 가능 | ✗ 403 + 가격 페이지 링크 |
| SRS/복습 | ✓ 전체 | ✗ Week1만 |

### 5-3. 만료 예고
- **구독 만료 3일 전**: 이메일 "구독이 3일 후 만료됩니다"
- **구독 만료 1일 전**: 앱 배너 (해제 가능)
- **만료 당일**: 자동 강등, 배너 → "재구독" 버튼

### 5-4 구현
- `current_period_end < now()` → 자동 강등 (`plan='free'`)
- 크론 `/api/cron/subscription-alerts` (Daily 08:00 KST)
  - 3일/1일 남은 사용자 찾기 → 이메일 발송

---

## 6. 결제 프로바이더 선택

### 후보
| 프로바이더 | 장점 | 단점 | 한국 지원 |
|----------|------|------|---------|
| **Tosspay** | 한국 로컬, 낮은 수수료(2.2%) | 국제 카드 미지원 | ✓ 우수 |
| **Portone (구 아임포트)** | 멀티 게이트웨이, 자동화 | 복잡한 통합 | ✓ 우수 |
| **Stripe** | 국제 표준, 문서 우수 | 높은 수수료(2.9%), 한국 미공식 지원 | △ 부분 |

**권장**: **Tosspay** (한국 단일 시장 → 로컬 최적화)

---

## 7. 데이터 구조

### users 테이블 확장
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  payment_provider TEXT,          -- 'tosspay', 'portone', ...
  subscription_id TEXT,           -- 결제 프로바이더 구독 ID
  payment_method_key TEXT,        -- 보안 토큰 (민감도: 높음)
  failed_payment_count INT DEFAULT 0,  -- 연속 실패 횟수
  last_payment_failed_at TIMESTAMPTZ;
```

### 신규 테이블
```sql
CREATE TABLE payment_records (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  amount INT NOT NULL,           -- 금액 (센트 단위, ₩100 = 10000)
  currency TEXT DEFAULT 'KRW',
  status TEXT NOT NULL,          -- 'pending', 'success', 'failed', 'refunded'
  provider_transaction_id TEXT,  -- 결제사 거래번호
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payment_failures (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  reason TEXT,                   -- 'card_declined', 'expired_card', 'insufficient_funds' ...
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)  -- 사용자당 1개만
);
```

---

## 8. 구현 우선순위

### Phase 1 (필수)
- [ ] 결제 프로바이더 결정 (Tosspay 권장)
- [ ] 결제 API 통합 (`/api/payment/subscribe`, `/cancel`)
- [ ] 웹훅 핸들러 (`/api/webhooks/payment`)
- [ ] DB 마이그레이션 (`payment_records`, `payment_failures`)
- [ ] UI: 결제 페이지 (`/checkout`) + 구독 관리 (`/account/subscription`)

### Phase 2 (자동화)
- [ ] 결제 재시도 크론 (`/api/cron/payment-retry`)
- [ ] 만료 알림 크론 (`/api/cron/subscription-alerts`)
- [ ] 자동 강등 로직 (getEntitlement에 이미 있음)

### Phase 3 (개선)
- [ ] 결제 실패 복구 UI (결제 정보 업데이트)
- [ ] 구독 일시 중지 (resume 기능)
- [ ] 학생 할인 인증 (학생증 업로드)

---

## 9. 비용 예측

### Tosspay 수수료 (2.2%)
- 월간 결제액 ₩1,000,000
- 수수료: ₩22,000

### 예상 MRR (1000 사용자 기준, 30% 전환율)
- 300명 × ₩9,900 = **₩2,970,000**
- 수수료: ₩65,340
- 순이익: ₩2,904,660

---

## 10. 다음 단계

1. **Tosspay 계정 개설** (사업자등록증 필요)
2. **결제 프로바이더 API 문서 검토**
3. **결제 페이지 UI/UX 디자인** (라우팅: `/checkout`, `/account/subscription`)
4. **결제 통합 테스트** (테스트 카드 사용)
5. **법무 검수** (약관, 개인정보 처리방침 개정)

