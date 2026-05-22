# Day 59 - 도메인 4 복습: 비용 최적화 (20%)

📅 날짜: Week 12 (Day 4)
🎯 주제: 시험 도메인 4 종합
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 비용 도메인의 키워드 → 서비스 매핑이 즉시 나온다
- 컴퓨팅·스토리지·네트워크·운영 4축 절감 패턴을 외운다

---

## 🧩 사전 지식 (CS 기초)

- **FinOps**: 가시화 + 책임 + 자동화.
- **비용은 설계가 결정**. 정상 운영 후 깎는 건 한계가 있다.

---

## 📖 핵심 정리

### A. 컴퓨팅

| 키워드 | 답 |
|--------|----|
| 24/7 자유 패밀리 | Compute Savings Plan |
| 24/7 특정 패밀리 최대 할인 | EC2 SP |
| 야간 배치 중단 OK | Spot |
| 가성비 ARM | Graviton |
| right-sizing ML | Compute Optimizer |
| RDS·Redshift·ElastiCache 약정 | RI |
| 컨테이너 운영 단순 | Fargate |

### B. 스토리지

| 키워드 | 답 |
|--------|----|
| 패턴 모름 | S3 Intelligent-Tiering |
| 재생성 가능 | One Zone-IA |
| 즉시·자주 안 봄 | Standard-IA |
| 분기 한 번 ms | Glacier Instant |
| 장기 7년+ | Deep Archive |
| EBS 디폴트 | gp3 |
| SSE-KMS 비용 ↓ | Bucket Keys |
| 미사용 자산 | TA / Storage Lens |

### C. 네트워크

| 키워드 | 답 |
|--------|----|
| NAT 비용 ↓ (S3/DDB) | Gateway Endpoint 무료 |
| 글로벌 인터넷 다운 | CloudFront 캐시 |
| AZ 간 트래픽 | Same-AZ 토폴로지 |
| 인바운드 | 무료 |

### D. 거버넌스·운영

| 키워드 | 답 |
|--------|----|
| 가시화·예측·이상 | Cost Explorer |
| 예산·차단 | Budgets + Actions |
| 세분화 분석 | CUR → Athena |
| 부서 분리 | Cost Allocation Tags |
| 통합 결제 | Consolidated Billing |
| 멀티 계정 비용 분배 | Billing Conductor |

### 시나리오 함정 10

1. 30/90/180일 최소 보관 함정.
2. Compute Optimizer는 활성화 필요.
3. Interface Endpoint는 무조건 절감 아님.
4. CUR + Athena가 세분화 분석의 정답.
5. SP는 환불 불가.
6. RDS는 SP 미지원 → RI.
7. Spot은 stateless·중단 OK만.
8. Glacier 검색 비용 함정.
9. Cross-Region·Cross-AZ 데이터 전송 비용.
10. S3 Bucket Keys로 KMS 호출 ↓.

---

## 📝 종합 시나리오 문제 5

**문제 1.** 24/7 EC2 + 자유 패밀리:

A) RI Standard B) Compute SP C) Spot D) On-Demand

**정답: B**.

---

**문제 2.** S3 패턴 모름:

A) Standard B) Intelligent-Tiering C) Glacier D) One Zone-IA

**정답: B**.

---

**문제 3.** NAT 비용 ↓ (S3 다량):

A) Interface EP B) S3 Gateway EP C) PrivateLink D) DX

**정답: B**.

---

**문제 4.** 예산 100% 자동 차단:

A) Budgets Actions B) Lambda 폴링 C) Config D) SCP

**정답: A**.

---

**문제 5.** 부서별 비용 가시화:

A) Cost Allocation Tags B) IAM 키 분리 C) Config D) BPA

**정답: A**.

---

## 📌 오늘의 요약

1. 비용 도메인(20%)은 키워드 매핑이 가장 단순한 영역.
2. 컴퓨팅·스토리지·네트워크·거버넌스 4축.
3. SP/Spot/IT 클래스/Gateway EP/Budgets Actions가 가장 자주.
