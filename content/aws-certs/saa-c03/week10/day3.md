# Day 48 - 네트워크 비용: 데이터 전송 함정

📅 날짜: Week 10 (Day 3)
🎯 주제: 데이터 전송 비용 절감
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 인터넷/리전/AZ 간 비용 흐름을 그림으로 그린다
- NAT GW / VPC Endpoint / CloudFront 같은 도구로 절감한다

---

## 🧩 사전 지식 (CS 기초)

- **데이터 전송 = 비용의 숨은 거대 부분**. 청구서에서 종종 30%+.
- **Inbound 무료 / Outbound 유료**가 기본 (예외 있음).
- **글로벌 vs 리전 vs AZ**: 비용 단계가 다르다.

---

## 📖 이론 내용

### 1. 비용 구조 (대략)

| 방향 | 비용 |
|------|------|
| 인터넷 → AWS | 무료 |
| AWS → 인터넷 (DTO) | $0.09/GB ~ (첫 GB는 무료) |
| **같은 리전 / 같은 AZ** | 무료 |
| 같은 리전 / 다른 AZ | $0.01/GB (왕복) |
| **다른 리전** | 비싸 (~$0.02/GB+) |
| CloudFront → 인터넷 | 더 싼 ↓ + 글로벌 가격 |

### 2. 절감 패턴

| 시나리오 | 해결 |
|----------|------|
| NAT GW 비용 폭증 | **S3/DDB Gateway Endpoint 무료** |
| AZ 간 트래픽 ↑ | 같은 AZ 내 서비스 배치 + LB Cross-zone 검토 |
| 인터넷 다운로드 ↑ | **CloudFront**로 캐시 + 글로벌 단가 |
| 리전 간 복제 ↑ | Replication 정말 필요한 것만 |
| 다른 계정 / 다른 VPC | PrivateLink / TGW 비용 vs 인터넷 |

### 3. CloudFront 가격 클래스

- All / 200 / 100. 일부 엣지만 사용 → 비용 ↓ (성능 ↓).

### 4. ELB / NAT / VPC Endpoint 비용

- **NAT GW**: 시간당 + 처리량 GB당.
- **VPC Endpoint Interface**: 시간당 ENI + GB.
- **Gateway Endpoint (S3/DDB)**: 무료.
- **ALB/NLB**: 시간당 + LCU.

### 5. Data Transfer 시험 키워드

- "데이터 전송 비용 최소화" → CloudFront, Gateway Endpoint, 같은 AZ 배치.
- "데이터를 인터넷으로 안 보내고 사설" → VPC Endpoint / PrivateLink.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **CloudFront free tier** | 매월 무료 TB | 작은 사이트 |
| **Same-AZ communication** | 무료 | 토폴로지 설계 |
| **Inter-Region VPC Peering** | 리전 간 단가 | 멀티 리전 |
| **VPC Endpoint Policy** | Endpoint별 추가 제한 | 보안 |
| **DTO 통합 청구** | Org 단위 합산으로 단가 ↓ | 통합 결제 |

> ⚠️ **함정**: "VPC Endpoint 사용 시 항상 비용 절감" → Interface Endpoint는 시간당 비용 있음. 단순 NAT보다 비싸질 수도. **사용량 큰 서비스에만**.

> 💡 **암기 팁**: S3 / DDB만 무료 Gateway. 나머지는 사용량 큰 거에 한해 Interface.

### 관련 서비스 Cross-Reference

- VPC Endpoint → Week 2
- CloudFront → Week 4
- TGW → Week 2

---

## 🏗️ 아키텍처 다이어그램

```
[ 비용 절감 후 ]

  Users (Global) → CloudFront Edge (캐시) → S3 (Origin)
                    │                          ↑ Gateway Endpoint (무료)
                    └─→ ALB (Region) → ECS → DDB (Gateway EP)

  VPC ── NAT GW (필수만) ── IGW ── Internet
   ├─ S3 Gateway EP (무료)
   ├─ DDB Gateway EP (무료)
   └─ SSM/ECR Interface EP (사설 운영)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **인바운드는 거의 무료, 아웃바운드는 유료**.
2. ⭐ **S3/DDB Gateway Endpoint 무료**가 NAT 절감 정답.
3. ⭐ CloudFront로 글로벌 단가 + 캐시 히트.
4. ⭐ 같은 AZ 내 통신 무료. 토폴로지 신경.
5. ⭐ **Interface Endpoint는 사용량 클 때만** 절감.

---

## 💻 실제 예시 - AWS CLI

```bash
# S3 Gateway Endpoint (무료)
aws ec2 create-vpc-endpoint --vpc-id vpc-aaa \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-private-a rtb-private-b \
  --vpc-endpoint-type Gateway

# DDB Gateway Endpoint
aws ec2 create-vpc-endpoint --vpc-id vpc-aaa \
  --service-name com.amazonaws.ap-northeast-2.dynamodb \
  --route-table-ids rtb-private-a rtb-private-b \
  --vpc-endpoint-type Gateway
```

---

## 📝 연습 문제

**문제 1.** NAT GW로 S3 트래픽이 많이 나가서 비용 ↑:

A) Interface EP B) S3 Gateway EP C) PrivateLink D) DX

**정답: B**.

---

**문제 2.** 글로벌 사용자에게 정적 파일 인터넷 다운로드 비용 ↓:

A) S3 Direct B) CloudFront C) DX D) Storage Gateway

**정답: B**.

---

**문제 3.** AZ 간 비용 ↓:

A) Same-AZ 배치 + Cross-zone LB 검토 B) DX C) 인터넷 통한 우회 D) NAT 추가

**정답: A**.

---

**문제 4.** Inbound 인터넷 비용:

A) 비쌈 B) 무료 C) GB당 0.05 D) GB당 0.09

**정답: B**.

---

**문제 5.** Interface Endpoint가 NAT보다 비쌀 수 있는 이유:

A) ENI 시간당 비용 + GB B) IP 제한 C) 대역폭 한계 D) 보안 그룹 부재

**정답: A**.

---

## 📌 오늘의 요약

1. Outbound는 비싸, Inbound는 거의 무료.
2. S3/DDB Gateway Endpoint 무료 = NAT 절감 정답.
3. CloudFront로 글로벌 단가 + 캐시.
4. Interface Endpoint는 사용량 클 때만.
5. Same-AZ 토폴로지로 cross-AZ 비용 줄이기.
