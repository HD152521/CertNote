# Day 9 - VPC Peering, Transit Gateway, VPC Endpoint

📅 날짜: Week 2 (Day 4)
🎯 주제: VPC 간 / 외부 서비스 간 연결 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- VPC Peering vs Transit Gateway 선택 기준을 안다
- Gateway Endpoint vs Interface Endpoint를 구분한다
- PrivateLink로 SaaS 서비스 사설 노출 패턴을 설명한다

---

## 🧩 사전 지식 (CS 기초)

- **풀 메시 vs 허브 앤 스포크**: N개 VPC 풀 메시 = N(N-1)/2 연결. 허브를 두면 N개.
- **전이적 라우팅(Transitive routing)**: A↔B, B↔C일 때 A↔C 자동? Peering은 X, TGW는 O.
- **사설 DNS(Private DNS)**: VPC 내부에서만 도는 도메인. PrivateLink의 핵심.
- **DX (Direct Connect)**: 전용선. VPN보다 안정적, 비싸고 구축 시간 ↑.

---

## 📖 이론 내용

### 1. VPC Peering

- 두 VPC의 1:1 사설 연결.
- **Cross-region / Cross-account** 가능.
- **CIDR 겹치면 안 됨**.
- **전이적 라우팅 안됨**: A-B, B-C 있다고 A-C 자동 X.
- 라우팅 테이블 / SG / NACL 별도 설정 필요.

### 2. Transit Gateway (TGW)

- **허브 앤 스포크**. 수천 개 VPC / VPN / DX 한 점에 연결.
- **전이적 라우팅 O**.
- 라우팅 도메인 분리(Route Table per attachment).
- Multicast 지원, Inter-region peering 지원.
- VPC 1개 attach마다 시간당 + 데이터 처리 비용.

### 3. VPC Endpoint — AWS 서비스에 사설 접근

| 종류 | 대상 | 비용 | 특징 |
|------|------|------|------|
| **Gateway Endpoint** | S3, DynamoDB | **무료** | 라우팅 테이블에 추가. 같은 리전만 |
| **Interface Endpoint (PrivateLink)** | 대부분의 AWS 서비스 | 시간당 + 처리량 | ENI + 사설 DNS |

> 💡 NAT Gateway 비용을 줄이고 싶다면 → S3/DDB는 Gateway Endpoint(무료) 사용.

### 4. PrivateLink

- 제공자 VPC의 서비스를 소비자 VPC가 **인터넷 거치지 않고 사설**로 접근.
- 소비자는 Interface Endpoint(ENI)로 호출, NLB가 뒤에서 받음.
- **SaaS 마켓플레이스 / 사내 공유 서비스** 패턴.

### 5. Site-to-Site VPN vs Direct Connect

| 항목 | VPN | Direct Connect |
|------|-----|-----------------|
| 매체 | 인터넷 | 전용선 |
| 대역폭 | ~1.25Gbps × 터널 | 1/10/100 Gbps |
| 지연 | 가변(인터넷) | 일관 |
| 보안 | IPSec 암호화 (자동) | 별도 (MACsec 옵션) |
| 구축 | 수십 분 | 수주~수개월 |
| 사용 사례 | 임시·소규모 | 대용량·일관성 |

**Hybrid 모범**: DX 메인 + VPN 백업 (DX 단선 시 VPN으로 페일오버).

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Peering 전이성 X** | A-B + B-C ≠ A-C | 시나리오 정답 키워드 |
| **TGW + DX/VPN** | 한 TGW에 온프레미스도 연결 | 하이브리드 허브 |
| **Cloud WAN** | 전 세계 글로벌 메시 자동 구성 | 신규 |
| **VPC Endpoint Policy** | 엔드포인트별 IAM-like 정책 | "특정 버킷만" 제한 |
| **Privatelink vs VPC Peering** | PL은 단일 서비스 노출 / Peering은 전체 네트워크 노출 | 보안 분리 시 PL |

> ⚠️ **함정**: 시나리오에서 "수많은 VPC + 온프레미스 합쳐 라우팅" → Peering 풀메시 답 ❌, TGW 답 ✅.

> 💡 **암기 팁**: "**S3/DDB만 무료 Gateway, 나머지는 Interface 유료**".

### 관련 서비스 Cross-Reference

- S3 + Gateway Endpoint → Week 4 S3
- API Gateway 사설 → Week 6
- Route 53 Resolver → 하이브리드 DNS
- Cloud WAN → Pro 시험에서 깊이 다룸

---

## 🏗️ 아키텍처 다이어그램

```
[ 풀메시 Peering vs TGW ]

  Peering 풀메시 (4 VPC = 6 peering)
    A ── B    문제: 전이성 없음, 운영 폭발
    │ \/ │
    │ /\ │
    D ── C

  TGW 허브 (1개 허브, N개 attach)
    A ─┐
    B ─┼── TGW ── VPN/DX 온프레미스
    C ─┤
    D ─┘


[ Gateway vs Interface Endpoint ]

  Gateway Endpoint (S3/DynamoDB만, 무료)
    EC2 → Route Table prefix list → S3

  Interface Endpoint (PrivateLink, 유료)
    EC2 → ENI (사설 IP) → AWS 서비스
                     (사설 DNS로 동일 도메인 그대로)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Peering은 1:1, 전이성 없음**. VPC 많아지면 TGW.
2. ⭐ **TGW는 허브, 전이적 라우팅 가능**. VPN/DX도 한 점에 연결.
3. ⭐ **S3 / DynamoDB만 Gateway Endpoint(무료)**. 그 외는 Interface(유료).
4. ⭐ **PrivateLink** = 사설로 단일 서비스 노출 (SaaS·사내 공유).
5. ⭐ **DX는 일관·고대역폭, VPN은 즉시·저렴**. 보통 DX + VPN 백업.

---

## 💻 실제 예시 - AWS CLI

```bash
# VPC Peering 만들기
aws ec2 create-vpc-peering-connection \
  --vpc-id vpc-aaa --peer-vpc-id vpc-bbb --peer-region ap-northeast-2

# S3용 Gateway Endpoint
aws ec2 create-vpc-endpoint --vpc-id vpc-aaa \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-private-a rtb-private-b \
  --vpc-endpoint-type Gateway

# SSM용 Interface Endpoint (Session Manager에 필수)
aws ec2 create-vpc-endpoint --vpc-id vpc-aaa \
  --service-name com.amazonaws.ap-northeast-2.ssm \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-priv-a subnet-priv-b \
  --security-group-ids sg-endpoint
```

---

## 📝 연습 문제

**문제 1.** 수십 개 VPC와 온프레미스를 단일 허브로 연결하고 전이 라우팅이 필요하다. 가장 적합한 솔루션은?

A) VPC Peering 풀메시 B) Transit Gateway C) Direct Connect만 D) NAT Gateway

**정답: B**.

---

**문제 2.** NAT Gateway 사용량이 크고 대부분 S3에 나가는 트래픽이다. 비용 절감 방법은?

A) S3 Interface Endpoint B) S3 Gateway Endpoint C) PrivateLink D) Direct Connect

**정답: B** — Gateway Endpoint 무료.

---

**문제 3.** 회사가 SaaS 형태로 사내 서비스를 다른 VPC에 노출하되, 두 VPC 간 전체 네트워크는 노출하고 싶지 않다.

A) Peering B) TGW C) PrivateLink (Interface Endpoint) D) VPN

**정답: C** — 단일 서비스만 사설 노출.

---

**문제 4.** 안정적·고대역폭·예측 가능한 하이브리드 연결이 필요하다. 비용보다 안정성 우선.

A) Site-to-Site VPN B) Direct Connect C) Client VPN D) Internet Gateway

**정답: B**.

---

**문제 5.** Peering 연결이 있는 VPC A-B, B-C 사이. A에서 C로의 트래픽은?

A) 자동 라우팅 (전이성) B) 라우팅 안됨 — A-C 별도 Peering 필요 C) NAT 통해 D) IGW로

**정답: B** — Peering은 전이 X. TGW가 해결책.

---

## 📌 오늘의 요약

1. Peering = 1:1, 전이성 없음 / TGW = 허브, 전이성 있음.
2. S3/DDB는 무료 Gateway Endpoint, 나머지는 유료 Interface Endpoint.
3. PrivateLink는 단일 서비스 사설 노출 — SaaS/사내 공유 패턴.
4. DX는 안정·고대역폭, VPN은 즉시·저렴. 백업으로 조합.
5. VPC Endpoint Policy로 엔드포인트별 추가 제한.
