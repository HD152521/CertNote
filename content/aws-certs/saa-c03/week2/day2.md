# Day 7 - IGW, NAT Gateway, Bastion Host

📅 날짜: Week 2 (Day 2)
🎯 주제: VPC 인터넷 출구 / 입구 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- IGW와 NAT Gateway 차이를 트래픽 방향 관점에서 안다
- NAT Gateway vs NAT Instance 비교 후 NAT GW가 정답인 이유를 설명한다
- Bastion / Session Manager 비교를 통해 운영 권장안을 안다

---

## 🧩 사전 지식 (CS 기초)

- **SNAT (Source NAT)**: 사설 IP → 공인 IP로 출발지를 바꿔서 인터넷에 나감.
- **포트 포워딩**: 외부에서 안쪽 사설 IP에 도달하기 위해 외부 포트 → 내부 IP/포트 매핑.
- **점프 서버(Bastion)**: 외부에서 직접 닿을 수 있는 단일 진입점. 그 뒤 내부에 SSH/RDP.
- **세션 매니저**: AWS가 제공하는 에이전트 기반 셸. SSH 키 / 22 포트 / Bastion 불필요.

---

## 📖 이론 내용

### 1. IGW (Internet Gateway)

- VPC 단위. 하나 attach.
- 수평 확장·고가용성·관리 불필요.
- 양방향 — Public Subnet 인스턴스가 직접 인터넷에 노출.

### 2. NAT Gateway

- **Private Subnet의 인스턴스가 인터넷 아웃바운드**만 가능하게 함.
- **인바운드는 차단**.
- AZ 단위 리소스. **각 AZ에 하나씩** 두는 것이 HA 표준.
- 시간당 + 데이터 처리량 과금.
- 자동 확장 45 Gbps까지.

### 3. NAT Gateway vs NAT Instance (시험 빈출)

| 항목 | NAT Gateway | NAT Instance |
|------|-------------|---------------|
| 관리 | AWS 완전관리 | 직접 운영 (EC2) |
| HA | AZ 단위, 다중 AZ 권장 | 직접 ASG 필요 |
| 대역폭 | ~45 Gbps | 인스턴스 크기 의존 |
| 보안 그룹 | 적용 안 됨 | 적용 가능 |
| 포트 포워딩 | 불가 | 가능 |
| 비용 | 고정 + 처리량 | EC2 비용 |

> 시험 정답은 **거의 항상 NAT Gateway**. NAT Instance는 "포트 포워딩 필요" 같은 특수 케이스만.

### 4. Egress-Only Internet Gateway

- IPv6 전용. **아웃바운드만** 허용, 인바운드 차단.
- IPv4 NAT의 IPv6 버전.

### 5. Bastion Host vs Session Manager

| 패턴 | Bastion | Session Manager |
|------|---------|-----------------|
| SSH 키 관리 | 필요 | 불필요 |
| 22 포트 노출 | 필요 | 불필요 (HTTPS) |
| IAM 통합 | 부분 | 완전 |
| 감사 로그 | 별도 | CloudTrail + CloudWatch |
| 인스턴스 요건 | - | SSM Agent + IAM Role |

> 💡 SAA에서 "운영 단순화 / 키 관리 제거" 키워드 = **Session Manager** 정답.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **NAT GW는 SG 없음** | 보안은 인스턴스 SG로 | 함정 |
| **NAT GW와 IGW는 다 필요** | NAT GW도 결국 IGW로 나감 | 둘 다 그림에 |
| **AZ별 NAT** | 한 AZ NAT 장애 시 다른 AZ EC2가 외부 못 봄 → 다른 AZ NAT 라우팅 필요 | 비용 vs 가용성 trade-off |
| **NAT Public IP** | EIP 1개 부여. 외부에 노출되는 IP | IP 화이트리스트용 |
| **VPC Reachability Analyzer** | 두 ENI 간 경로 진단 | 디버깅 시 |

> ⚠️ **함정**: "NAT Gateway 비용 줄이려면?" → ① VPC Endpoint(S3/DDB는 Gateway endpoint 무료) ② Cross-AZ 데이터 전송 줄이기.

> 💡 **암기 팁**: IGW = 양방향, NAT = 아웃바운드 전용, Egress-Only IGW = IPv6 아웃바운드.

### 관련 서비스 Cross-Reference

- VPC Endpoint로 NAT 비용 절감 → **Day 4**
- 보안 그룹 적용 → **Day 3**
- Session Manager 운영 → **Week 9 Systems Manager**

---

## 🏗️ 아키텍처 다이어그램

```
[ 표준 NAT 패턴 (2 AZ) ]

  Internet
     |
   IGW
     |
 ┌───┴────────────────────────────────────┐
 │ VPC                                    │
 │                                        │
 │  AZ-a                  AZ-b            │
 │  ┌────────────┐        ┌────────────┐  │
 │  │ Public     │        │ Public     │  │
 │  │  NAT-a EIP │        │  NAT-b EIP │  │
 │  └─────┬──────┘        └─────┬──────┘  │
 │        │ 0.0.0.0/0           │         │
 │  ┌─────▼──────┐        ┌─────▼──────┐  │
 │  │ Private    │        │ Private    │  │
 │  │  EC2 App   │        │  EC2 App   │  │
 │  └────────────┘        └────────────┘  │
 └────────────────────────────────────────┘
   (각 AZ Private 서브넷의 RT는 자기 AZ NAT 가리킴)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **NAT Gateway는 아웃바운드만**. 인바운드 안 됨.
2. ⭐ **NAT GW는 각 AZ에 하나씩**. 그렇지 않으면 AZ 장애 시 다른 AZ가 인터넷 못 봄.
3. ⭐ **NAT Gateway > NAT Instance** — 운영성/HA/대역폭.
4. ⭐ **Session Manager** = SSH 키 / 22포트 / Bastion 불필요.
5. ⭐ **Egress-Only IGW** = IPv6 NAT 등가물.

---

## 💻 실제 예시 - AWS CLI

```bash
# EIP 발급 → NAT Gateway 생성 (각 AZ Public 서브넷)
aws ec2 allocate-address --domain vpc
aws ec2 create-nat-gateway \
  --subnet-id subnet-public-a \
  --allocation-id eipalloc-...

# Private 서브넷의 라우트를 NAT로
aws ec2 create-route \
  --route-table-id rtb-private-a \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id nat-...

# Session Manager로 EC2 접속 (키/Bastion 없이)
aws ssm start-session --target i-0123456789abcdef0
```

---

## 📝 연습 문제

**문제 1.** Private Subnet의 EC2가 OS 패치 다운로드를 위해 인터넷에 나가야 한다. 인바운드는 모두 차단해야 한다. 무엇을 사용하나?

A) IGW B) NAT Gateway C) Egress-Only IGW (IPv4) D) Customer Gateway

**정답: B**.

---

**문제 2.** 한 회사가 NAT Gateway를 단일 AZ에만 두었다. 그 AZ가 장애가 났을 때 결과는?

A) 다른 AZ EC2도 인터넷 단절 B) 영향 없음 C) IGW가 대체 D) 자동 페일오버

**정답: A** — NAT 다중 AZ가 표준.

---

**문제 3.** 운영팀이 EC2에 SSH 키 / Bastion / 22포트 노출 없이 셸 접속을 원한다. 가장 적절한 도구는?

A) EC2 Instance Connect만 사용 B) Session Manager C) NAT Instance에서 점프 D) VPN

**정답: B**.

---

**문제 4.** NAT Gateway와 NAT Instance 비교에서 NAT Instance만의 특징은?

A) AWS 완전 관리 B) 자동 HA C) 포트 포워딩 가능 D) 자동 확장

**정답: C**.

---

**문제 5.** VPC IPv6 인스턴스가 인터넷에 아웃바운드만 가능해야 한다. 무엇을 사용하나?

A) NAT Gateway B) Egress-Only IGW C) IGW D) NAT Instance

**정답: B**.

---

## 📌 오늘의 요약

1. IGW = 양방향, NAT GW = 아웃바운드 전용.
2. NAT Gateway는 AZ 단위 → 각 AZ에 두는 것이 HA 표준.
3. NAT Instance는 거의 항상 NAT Gateway가 우월 (포트 포워딩 제외).
4. Session Manager가 Bastion 운영을 대체.
5. IPv6는 Egress-Only IGW.
