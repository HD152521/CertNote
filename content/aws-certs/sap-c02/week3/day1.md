# Day 11 - VPC Peering vs Transit Gateway 선택

📅 날짜: Week 3 (Day 1)
🎯 주제: 멀티 VPC 통신 — Peering·TGW·CloudWAN
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- VPC Peering 한계와 적합한 상황을 안다
- Transit Gateway(TGW) 동작 원리와 라우팅 도메인을 이해한다
- TGW Route Table을 활용한 격리 패턴(공유 서비스 격리)을 안다
- AWS Cloud WAN과 TGW의 차이를 안다

---

## 🧩 사전 지식 (CS 기초)

- **Mesh topology**: 모든 노드가 모든 노드와 연결. N개 노드면 N(N-1)/2개 링크. 확장성 X.
- **Hub-and-Spoke**: 중앙 허브가 모든 스포크 연결. 확장성 ↑.
- **Transitive Routing**: A→B→C 경로 라우팅. Peering은 미지원, TGW는 지원.
- **BGP (Border Gateway Protocol)**: 경로 광고 표준 — Direct Connect/VPN의 핵심.

---

## 📖 이론 내용

### 1. VPC Peering 한계

- 두 VPC를 1:1 직접 연결
- 두 VPC만 통신 (Transitive 라우팅 X — A↔B, B↔C 있어도 A↔C 불가)
- CIDR 겹치면 불가
- 100개 VPC라면 4950개 Peering — 관리 불가

### 2. Transit Gateway 동작 원리

```
        ┌─────────────────────────┐
        │   Transit Gateway       │
        │   (리전당 1~수개)        │
        └─────┬───────────┬───────┘
              │           │
        ┌─────┴─┐   ┌────┴────┐  ┌──────────┐
        │ VPC-A │   │ VPC-B   │  │ VPN/DX   │
        └───────┘   └─────────┘  └──────────┘
```

- 리전 내 모든 VPC·VPN·DX·TGW Peer를 허브로 연결
- 최대 5,000 VPC 부착
- 대역폭 50Gbps per VPC attachment
- **TGW Route Table로 라우팅 도메인 분리** (격리)

### 3. TGW Route Table 패턴 (⭐ 시험 핵심)

#### 패턴 1: 공유 서비스 격리

```
TGW Route Table: Workload
   ├── VPC-Dev:   Workload RT 연결, Shared RT propagate
   ├── VPC-Prod:  Workload RT 연결, Shared RT propagate
   └── VPC-Shared: Shared RT 연결, Workload RT propagate

→ Dev↔Prod 통신 불가 (라우트 없음)
→ Dev↔Shared, Prod↔Shared 모두 가능
```

#### 패턴 2: 완전 메시
- 모든 VPC가 동일 RT 사용
- 모두 서로 통신

#### 패턴 3: 인터넷 송신 중앙화
- 모든 VPC가 중앙 Egress VPC의 NAT GW를 통과
- 비용 절감(NAT GW 1세트)·중앙 모니터링

### 4. TGW Inter-Region Peering

- 다른 리전 TGW와 peering
- 글로벌 백본 활용 — 빠르고 안정적
- 전이적(transitive) 미지원 — TGW A↔B, B↔C 있어도 A↔C 직접 광고 필요

### 5. AWS Cloud WAN (최신 옵션)

- 글로벌 멀티 리전·온프레미스를 단일 정책으로 관리
- "Global Network" 추상화 + 정책 문서
- TGW를 여러 리전에 일일이 연결할 필요 X
- 큰 글로벌 기업이라면 정답

**Cloud WAN vs TGW**:
| 항목 | TGW | Cloud WAN |
|------|-----|-----------|
| 범위 | 리전 | 글로벌 |
| 관리 단위 | 라우트 테이블 직접 | 정책 문서 |
| 통합 | VPC·VPN·DX | TGW·VPN·SD-WAN·DX |

### 6. RAM (Resource Access Manager) 공유

- TGW를 Org/계정 간 **공유**
- 네트워크 계정에서 TGW 1개 만들고, 워크로드 계정들이 attach

---

## 🧠 알아두면 좋은 심화 이론

### TGW Connect (SD-WAN 통합)

- SD-WAN 어플라이언스를 GRE 터널로 TGW에 연결
- BGP로 라우트 광고
- Cisco SD-WAN, Aviatrix 등 통합

### TGW Multicast

- 일부 워크로드(금융 시세 데이터)에서 사용
- TGW가 멀티캐스트 도메인 제공

### Cross-Reference

- **Day 12**: Direct Connect 통합
- **Day 13**: VPN
- **Day 14**: PrivateLink (다른 종류 연결)

---

## 🏗️ 아키텍처 다이어그램 — TGW Hub-and-Spoke

```
                     +----------+
                     | On-Prem  |
                     +-----+----+
                           │ DX/VPN
                           ▼
+-------+   +------+ Transit Gateway +------+   +-------+
|VPC-Dev|---| RT-Workload                RT-Shared |---|VPC-Shared
|10.1/16|   |  Dev, Prod 연결              Dev/Prod  |   |10.99/16
+-------+   |  Shared 광고                광고      |   |(DNS, AD)
            |                                       |
+--------+  |                                       |
|VPC-Prod|--+                                       |
|10.2/16 |     Dev ↔ Prod 통신 차단 (라우트 분리)
+--------+
```

---

## ⭐ 핵심 포인트

1. ⭐ **3개 이상 VPC = TGW**, 2개·정적 = Peering
2. ⭐ TGW Route Table로 **격리·공유 서비스 패턴** 구현
3. ⭐ TGW는 **리전 내 허브**, 다른 리전은 **TGW Peering** 또는 Cloud WAN
4. ⭐ Cloud WAN = 글로벌 정책 관리, TGW = 리전 라우팅 디테일
5. ⭐ RAM으로 TGW를 Org 공유, 네트워크 계정 중앙 관리

---

## 💻 실제 예시 - TGW 생성

```bash
aws ec2 create-transit-gateway \
  --description "Main Hub" \
  --options "AmazonSideAsn=64512,AutoAcceptSharedAttachments=enable,DefaultRouteTableAssociation=disable,DefaultRouteTablePropagation=disable"

# VPC 부착
aws ec2 create-transit-gateway-vpc-attachment \
  --transit-gateway-id tgw-xxx \
  --vpc-id vpc-yyy \
  --subnet-ids subnet-aaa subnet-bbb

# Route Table 연결·전파
aws ec2 associate-transit-gateway-route-table \
  --transit-gateway-attachment-id tgw-attach-xxx \
  --transit-gateway-route-table-id tgw-rtb-workload
```

---

## 📝 연습 문제

**문제 1.** 50개 VPC를 서로 통신시키고 싶다. Best?

A) VPC Peering 1225개
B) Transit Gateway
C) PrivateLink
D) Direct Connect

**정답: B**
해설: 다중 VPC = TGW 허브 모델.

---

**문제 2.** Dev VPC와 Prod VPC가 서로 통신 안 되게 하면서 둘 다 Shared VPC와는 통신 가능하게. Best?

A) NACL로 차단
B) TGW Route Table 분리 + Shared 광고
C) Peering 끊기
D) IAM Policy

**정답: B**
해설: TGW Route Table 디자인 표준 격리 패턴.

---

**문제 3.** 미국·유럽·아시아 멀티 리전 백본 + 온프레미스 + SD-WAN 통합. Best?

A) 각 리전 TGW + 일일이 Peering
B) AWS Cloud WAN
C) Direct Connect만
D) VPN Mesh

**정답: B**
해설: Cloud WAN = 글로벌 정책 기반 관리.

---

**문제 4.** Org 멀티 계정 환경에서 TGW를 네트워크 계정 1곳에 두고 다른 계정이 사용. Best?

A) 각 계정 TGW 별도
B) TGW를 RAM으로 공유
C) Direct Connect만
D) IAM Cross-Account Role

**정답: B**
해설: RAM으로 TGW 공유 — 중앙 관리 표준.

---

**문제 5.** VPC Peering의 한계는?

A) 비용
B) Transitive 라우팅 미지원
C) IPv6 미지원
D) HTTPS 미지원

**정답: B**
해설: Peering은 1:1, 전이적 X.

---

**문제 6.** SD-WAN 어플라이언스를 TGW에 BGP로 통합. Best?

A) Site-to-Site VPN만
B) TGW Connect (GRE)
C) PrivateLink
D) Direct Connect만

**정답: B**
해설: TGW Connect = SD-WAN 통합 표준.

---

## 📌 오늘의 요약

1. 3+ VPC = TGW, 2개 = Peering
2. TGW Route Table로 격리·공유 서비스 패턴
3. 다중 리전 = TGW Peering 또는 Cloud WAN
4. RAM으로 TGW를 Org 공유
5. SD-WAN 통합은 TGW Connect
