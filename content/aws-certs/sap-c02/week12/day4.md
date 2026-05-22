# Day 59 - S3 비용 최적화·데이터 전송·NAT Gateway

📅 Week 12 (Day 4)
🎯 주제: 숨은 비용 잡기
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- S3 Storage Class·Lifecycle·Intelligent-Tiering
- Data Transfer 요금 구조와 절감
- NAT Gateway 비용 함정과 대안

---

## 🧩 사전 지식 (CS 기초)

- **Egress**: AWS → 외부 (보통 과금)
- **Ingress**: 외부 → AWS (대부분 무료)
- **NAT Gateway**: 사설 서브넷의 outbound

---

## 📖 이론 내용

### 1. S3 Storage Class

| 클래스 | 최소 기간 | 검색 비용 | 용도 |
|--------|----------|-----------|------|
| Standard | - | - | 빈번 |
| **Intelligent-Tiering** | - | 모니터링 fee | 패턴 모르는 데이터 |
| Standard-IA | 30일 | $ | 한 달에 몇 번 |
| One Zone-IA | 30일 | $ | 재생성 가능 |
| Glacier Instant Retrieval | 90일 | $ | 즉시 + 드물게 |
| Glacier Flexible Retrieval | 90일 | $$ | 분-시간 |
| Glacier Deep Archive | 180일 | $$$ | 12시간+ |

### 2. Intelligent-Tiering

- 자동 계층 이동 (Frequent → Infrequent → Archive Instant → Archive)
- **128KB 미만 객체 모니터링 fee 없음** (단, 자동 이동 ✗)
- 패턴 모를 때 디폴트

### 3. Lifecycle

- 일정 시간 후 자동 클래스 이동·만료
- **Incomplete Multipart Upload Cleanup** — 잊혀진 멀티파트 정리

### 4. S3 Storage Lens

- 조직 차원 저장소 분석·권고
- 미사용·중복·작은 객체 식별

### 5. 데이터 전송 요금

| 경로 | 요금 |
|------|------|
| AZ 내부 (사설 IP) | 무료 |
| 같은 리전·다른 AZ | $ (편도/양방) |
| 같은 리전·다른 서비스 (VPC ↔ S3/DDB Gateway Endpoint) | 무료 |
| 같은 리전·VPC Peering | $ (AZ 같으면 무료) |
| **Internet Egress** | $$ |
| Cross-Region | $$ |

### 6. NAT Gateway 비용 함정

- **$0.045/시간 + $0.045/GB 처리** (리전마다 상이)
- **VPC Endpoint로 우회** (S3·DDB Gateway = 무료, 나머지 Interface = 시간당)
- AZ별 NAT GW 1개 → 대형 트래픽은 큰 비용

### 7. 전송 비용 절감 패턴

- **CloudFront** 통해 외부 전송 (Origin Shield + Free Tier)
- **VPC Endpoint** (PrivateLink)로 NAT 우회
- **Direct Connect**: 큰 양 전송 시 인터넷보다 저렴
- **S3 Transfer Acceleration**: 전송 가속 (요금↑)

---

## 🧠 심화 이론

### 함정 포인트

- **"NAT GW가 비싸다"** → VPC Endpoint로 S3·DDB·KMS 등 우회
- **"같은 리전 ALB → 다른 VPC EC2"** → Peering AZ 같으면 무료
- **"Glacier에서 자주 꺼낸다"** → Retrieval 비용 ↑ → IA 검토
- **"Intelligent-Tiering 단점"** → 객체당 모니터링 fee + 128KB 미만 미동작

### 트레이드오프

- IA/Glacier 이동은 **최소 보관 기간** 위반 시 조기 삭제 요금

---

## 🏗️ 아키텍처 — NAT GW 절감

```
[Private Subnet]
   │
   ├─▶ [S3 Gateway Endpoint] (무료)
   ├─▶ [DDB Gateway Endpoint] (무료)
   ├─▶ [Interface Endpoint: KMS·Logs·SQS] (시간당, 데이터 ↓↓)
   └─▶ [NAT Gateway] → Internet (꼭 필요한 트래픽만)
```

---

## ⭐ 핵심 포인트

1. ⭐ Intelligent-Tiering = 패턴 모르는 데이터 디폴트
2. ⭐ Lifecycle로 IA·Glacier·만료 자동
3. ⭐ S3·DDB Gateway Endpoint = 무료
4. ⭐ NAT GW는 시간 + 데이터 처리 둘 다 과금
5. ⭐ CloudFront로 외부 egress 절감
6. ⭐ AZ 내부 사설 IP 통신 무료

---

## 💻 CLI 예시

```bash
# S3 Lifecycle (90일 IA, 365일 Glacier)
aws s3api put-bucket-lifecycle-configuration \
  --bucket mybucket \
  --lifecycle-configuration file://lifecycle.json

# VPC S3 Gateway Endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxx --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-xxx
```

---

## 📝 연습 문제

**문제 1.** 액세스 패턴 불확실·자동 비용 최적화.

A) Standard-IA
B) Intelligent-Tiering
C) Glacier
D) One Zone-IA

**정답: B**

---

**문제 2.** Private 서브넷 Lambda가 S3 호출 — NAT 비용 ↓.

A) NAT GW 추가
B) S3 Gateway Endpoint
C) PrivateLink Interface (가능하나 Gateway가 무료)
D) Internet GW

**정답: B**

---

**문제 3.** 같은 리전 ALB → 다른 VPC EC2 — 비용 최소.

A) Peering, 같은 AZ
B) Peering, 다른 AZ
C) TGW
D) PrivateLink

**정답: A** — 같은 리전·같은 AZ Peering 무료

---

**문제 4.** Glacier Deep Archive에서 12시간 내 회수 + 5년 보관.

A) Glacier Deep Archive (Bulk)
B) Glacier Flexible (Expedited)
C) Standard-IA
D) Glacier Instant Retrieval

**정답: A**

---

**문제 5.** 인터넷 사용자에게 정적 자산 전송 비용 ↓.

A) S3 직접 공개
B) CloudFront 캐싱
C) Direct Connect
D) Global Accelerator

**정답: B**

---

**문제 6.** 잊혀진 멀티파트 업로드 정리.

A) Lambda 수동 스크립트
B) Lifecycle Rule (Incomplete Multipart Upload Cleanup)
C) CLI 매일 실행
D) S3 Storage Lens

**정답: B**

---

## 📌 오늘의 요약

1. Intelligent-Tiering = 패턴 모르면 디폴트
2. S3·DDB Gateway Endpoint = 무료
3. NAT GW 비용은 VPC Endpoint로 우회
4. CloudFront로 외부 egress↓
5. AZ 내부 사설 통신 무료
