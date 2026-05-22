# Day 3 - VPC·서브넷·라우팅·보안 그룹 복습 심화

📅 날짜: Week 1 (Day 3)
🎯 주제: Pro 수준의 VPC 설계와 트래픽 흐름 완전 이해
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- VPC CIDR 설계 원칙(RFC 1918 + RFC 6598)을 이해한다
- 라우팅 테이블, IGW, NAT GW, VPC Endpoint의 트래픽 흐름을 추적할 수 있다
- Security Group vs NACL을 정확히 구분한다
- 자주 출제되는 VPC 트러블슈팅 패턴을 안다

---

## 🧩 사전 지식 (CS 기초)

- **CIDR (Classless Inter-Domain Routing)**: `10.0.0.0/16` 같이 prefix 길이로 네트워크 표기.
- **RFC 1918 사설 IP 대역**: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
- **RFC 6598**: 100.64.0.0/10 (Carrier-Grade NAT). EKS 보조 CIDR로 자주 사용.
- **Stateful vs Stateless 방화벽**: SG는 stateful(돌아오는 응답 자동 허용), NACL은 stateless(양방향 규칙 필요).
- **Egress Filtering**: 나가는 트래픽 필터링 — Pro 단골.
- **OSI L3/L4/L7**: SG/NACL은 L3-L4, ALB·WAF는 L7.

---

## 📖 이론 내용

### 1. VPC CIDR 설계 원칙 (⭐ Pro 빈출)

- **/16** (65,536 IP)이 표준. 너무 작으면 확장 불가.
- 멀티 계정·멀티 리전에서는 **CIDR 겹치지 않게**. 겹치면 TGW/Peering 불가.
- 미래 확장 + EKS Pod IP까지 고려.

```
회사 전체 CIDR 마스터 플랜 예시
=================================
10.0.0.0/8 (Org 전체)
├── 10.0.0.0/12 (Prod)
│   ├── 10.0.0.0/16 ap-northeast-2
│   ├── 10.1.0.0/16 us-east-1
│   └── 10.2.0.0/16 eu-west-1
├── 10.16.0.0/12 (Dev)
└── 10.32.0.0/12 (Sandbox)
```

### 2. 서브넷 분류와 라우팅

| 종류 | 라우팅 테이블 | 사용 사례 |
|------|---------------|-----------|
| **Public** | `0.0.0.0/0 → IGW` | ALB, NAT GW, Bastion |
| **Private (NAT)** | `0.0.0.0/0 → NAT GW` | App EC2, RDS, Lambda(in VPC) |
| **Private (Isolated)** | 외부 라우팅 없음 | DB, 민감 워크로드 |

**핵심 흐름**:
- IGW 통과 = Public Subnet
- NAT GW = Private에서 인터넷 outbound (inbound 차단)
- Egress-Only IGW = IPv6 전용 outbound

### 3. NAT Gateway vs NAT Instance vs Egress-Only IGW

| 항목 | NAT Gateway | NAT Instance | Egress-Only IGW |
|------|-------------|--------------|------------------|
| 관리 | AWS Managed | 고객(EC2) | AWS Managed |
| 대역폭 | 최대 100Gbps | 인스턴스 크기 | IPv6만 |
| 가용성 | AZ당 1개 (Multi-AZ 권장) | HA 직접 설계 | 글로벌 |
| 비용 | 시간 + 데이터 처리 | EC2 비용 | 무료 |

> ⚠️ **함정**: NAT GW는 **AZ별로 배치**해야 AZ 장애 시 분리 가능. 단일 AZ NAT GW는 SPOF.

### 4. VPC Endpoint — Gateway vs Interface

| 항목 | Gateway Endpoint | Interface Endpoint (PrivateLink) |
|------|-------------------|-----------------------------------|
| 지원 서비스 | S3, DynamoDB만 | 대부분의 AWS 서비스 |
| 동작 방식 | 라우팅 테이블에 prefix 추가 | ENI 배치 (사설 IP) |
| 비용 | 무료 | 시간당 요금 + 데이터 |
| DNS | - | Private DNS 활성화 가능 |

> 💡 **암기 팁**: "S3·DynamoDB만 무료 Gateway, 나머지는 Interface(돈)".

### 5. Security Group vs NACL

| 항목 | Security Group | NACL |
|------|----------------|------|
| 적용 | ENI (인스턴스) | 서브넷 |
| 상태 | Stateful | Stateless |
| 규칙 | Allow만 | Allow + Deny |
| 평가 | 모두 평가 | 번호 순(낮은 번호 우선) |
| 기본값 | Inbound 거부 / Outbound 허용 | Allow All (default NACL) |

> ⚠️ **함정**: NACL은 stateless라 ephemeral port (1024-65535) outbound 허용 필요.

### 6. Pro 시험에 자주 나오는 트러블슈팅 패턴

1. **EC2에서 S3 못 붙음** → Private Subnet인데 S3 Gateway Endpoint 없음, 또는 NAT GW 라우트 누락
2. **VPC Peering 두 개인데 통신 안 됨** → CIDR 겹침 또는 양쪽 라우트 누락
3. **TGW 연결했는데 안 됨** → TGW Route Table + VPC Route Table 둘 다 필요
4. **Site-to-Site VPN 비대칭** → AWS는 두 터널 동시 활성, 온프레 라우터가 ECMP 미지원 시 비대칭

---

## 🧠 알아두면 좋은 심화 이론

### Reachability Analyzer / Network Access Analyzer

- **Reachability Analyzer**: 두 ENI/Subnet/IGW 간 도달성 분석. 트러블슈팅 정답.
- **Network Access Analyzer**: 네트워크 노출 위협 분석 — 의도하지 않은 인터넷 노출 검증.

### Flow Logs

- VPC/Subnet/ENI 단위. S3·CloudWatch Logs·Firehose로 전송.
- **REJECT** 필드로 SG/NACL 차단 디버깅.
- 비용: 데이터 양이 큼. 운영시 샘플링 또는 핵심 ENI만.

### Cross-Reference

- **Week 3**: TGW·Direct Connect·VPN 본격
- **Week 11**: VPC Flow Logs + Security Hub
- **Week 13**: 운영 우수성 — Reachability Analyzer 자동화

---

## 🏗️ 아키텍처 다이어그램 — 3-Tier VPC

```
VPC 10.0.0.0/16
├── AZ-a
│   ├── Public  10.0.1.0/24 → IGW (ALB, NAT-a)
│   ├── App     10.0.11.0/24 → NAT-a (EC2/ECS)
│   └── DB      10.0.21.0/24 (isolated)
├── AZ-b
│   ├── Public  10.0.2.0/24 → IGW (ALB, NAT-b)
│   ├── App     10.0.12.0/24 → NAT-b (EC2/ECS)
│   └── DB      10.0.22.0/24 (isolated)
└── Endpoints
    ├── S3 Gateway (Route Tables의 App, DB에 추가)
    ├── DynamoDB Gateway
    └── KMS Interface (App 서브넷에 ENI)
```

---

## ⭐ 핵심 포인트

1. ⭐ **CIDR은 미래 확장·EKS Pod IP까지 고려**해서 설계
2. ⭐ **NAT GW는 AZ별로** 배치, 단일 AZ NAT는 SPOF
3. ⭐ **S3/DynamoDB만 Gateway Endpoint** (무료), 나머지는 Interface
4. ⭐ **SG = Stateful, NACL = Stateless** (ephemeral port 필요)
5. ⭐ 트러블슈팅엔 **Reachability Analyzer** 가 정답

---

## 💻 실제 예시 - VPC 생성 CLI

```bash
# VPC + 서브넷
aws ec2 create-vpc --cidr-block 10.0.0.0/16
aws ec2 create-subnet --vpc-id vpc-x --cidr-block 10.0.1.0/24 --availability-zone ap-northeast-2a
aws ec2 create-internet-gateway
aws ec2 attach-internet-gateway --vpc-id vpc-x --internet-gateway-id igw-x

# S3 Gateway Endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-x \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-private

# Reachability Analyzer
aws ec2 create-network-insights-path \
  --source eni-aaa --destination eni-bbb --protocol tcp --destination-port 443
```

---

## 📝 연습 문제

**문제 1.** Private Subnet의 EC2가 S3에 접근하지 못한다. 데이터 전송 비용은 최소화해야 한다. 가장 적절한 해결책은?

A) NAT GW 추가
B) EC2를 Public Subnet으로 이동
C) S3 Gateway VPC Endpoint 추가
D) Internet Gateway 부착

**정답: C**
해설: S3는 Gateway Endpoint 무료. NAT GW는 데이터 처리 비용 발생.

---

**문제 2.** 두 VPC를 Peering했는데 통신이 안 된다. 가장 가능성 높은 원인은?

A) IGW 누락
B) CIDR 겹침 또는 라우트 누락
C) NACL 차단
D) SG 누락

**정답: B**
해설: Peering 가장 흔한 원인은 CIDR 겹침 또는 양쪽 라우트 테이블에 상대 CIDR 추가 누락.

---

**문제 3.** NACL이 stateless이기 때문에 outbound 허용 시 함께 고려해야 할 것은?

A) 동일 SG 허용
B) Ephemeral Port(1024-65535) 인바운드 허용
C) IGW 라우트
D) MFA

**정답: B**
해설: 응답 트래픽은 ephemeral port로 돌아오므로 stateless NACL에선 별도 inbound 규칙 필요.

---

**문제 4.** EKS 클러스터 Pod IP가 부족하다. VPC CIDR을 그대로 두면서 확장하려면?

A) VPC 재생성
B) Secondary CIDR로 100.64.0.0/16 추가 후 Pod 전용 서브넷
C) IPv6로 변경
D) NAT GW 추가

**정답: B**
해설: VPC는 보조 CIDR(RFC 6598 권장)을 붙일 수 있고 EKS는 보조 CIDR Pod를 지원.

---

**문제 5.** "복잡한 SG·NACL·라우팅 조합에서 EC2 A→B 도달성 확인" 가장 빠른 방법은?

A) ping
B) tcpdump
C) VPC Reachability Analyzer
D) Flow Logs 수동 분석

**정답: C**
해설: Reachability Analyzer가 정책·라우팅·NACL 전부 시뮬레이션.

---

**문제 6.** 비용을 줄이려 NAT Instance를 t2.micro로 운영 중. 트래픽이 늘면서 병목. 운영 부담 최소로 해결하려면?

A) NAT Instance를 m5.large로 업그레이드
B) NAT Gateway로 교체
C) Public Subnet으로 EC2 이동
D) Squid 프록시 도입

**정답: B**
해설: NAT GW는 Managed·자동 확장(최대 100Gbps). 운영 부담 최소.

---

## 📌 오늘의 요약

1. CIDR 마스터 플랜으로 멀티 계정·리전 충돌 방지
2. NAT GW는 AZ별 배치, S3/DynamoDB는 Gateway Endpoint
3. SG = Stateful, NACL = Stateless (ephemeral port 주의)
4. PrivateLink Interface Endpoint = 대부분 AWS 서비스 사설 접근
5. 도달성·노출 검증은 **Reachability/Network Access Analyzer**
