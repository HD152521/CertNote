# Day 6 - VPC, 서브넷, 라우팅 테이블

📅 날짜: Week 2 (Day 1)
🎯 주제: VPC 네트워킹 기초
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- VPC / 서브넷 / 라우팅 테이블의 관계를 그림으로 설명한다
- 공인 vs 사설 서브넷의 차이를 라우팅 관점에서 안다
- CIDR 설계 시 고려사항을 설명한다

---

## 🧩 사전 지식 (CS 기초)

- **IP / CIDR**: IPv4 32비트. `/24`는 256개 주소(서브넷 마스크 255.255.255.0).
- **RFC 1918 사설 IP**: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. VPC는 보통 여기서.
- **라우팅 테이블**: 목적지 CIDR → 다음 홉(IGW, NAT, ENI). 가장 구체적인 prefix가 이긴다.
- **NAT (Network Address Translation)**: 사설 IP를 공인 IP로 매핑. 아웃바운드만 열고 인바운드 차단할 때 사용.
- **L3 vs L4**: L3 = IP 라우팅, L4 = TCP/UDP. 서브넷은 L3, SG는 L4까지 본다.

---

## 📖 이론 내용

### 1. VPC 구조

- **VPC**: 리전 단위 가상 네트워크. CIDR `/16` ~ `/28` (예: `10.0.0.0/16`).
- **서브넷**: VPC 안의 AZ 단위 IP 블록. 한 서브넷은 한 AZ에만 속함.
- **라우팅 테이블**: 서브넷에 1:1 연결. 트래픽의 next hop 결정.
- **인터넷 게이트웨이(IGW)**: VPC ↔ 인터넷 양방향 라우터. VPC당 1개 attach.

### 2. Public vs Private Subnet

| 구분 | Public Subnet | Private Subnet |
|------|----------------|------------------|
| 라우팅 | `0.0.0.0/0 → IGW` 있음 | IGW 라우트 없음 |
| 인스턴스 공인 IP | 자동/직접 할당 가능 | 없음 |
| 인터넷 직접 수신 | O | X |
| 사용 사례 | ALB, NAT, Bastion | App/DB |

### 3. 예약 IP

서브넷 안의 IP 중 **5개는 AWS가 예약**한다.
- `.0` 네트워크 주소
- `.1` VPC 라우터
- `.2` AWS DNS
- `.3` 예약(future)
- `.255` 브로드캐스트

> `/28` 서브넷은 16-5=**11개**만 사용 가능.

### 4. CIDR 설계 가이드

- **겹치지 않게**: Peering / VPN / TGW 사용을 위해 회사 전체 VPC CIDR 안 겹치게.
- **여유 있게**: `/16`은 65536 IP. 보통 `/16` 부여 후 서브넷 `/24` 또는 `/22`.
- **AZ당 최소 2개 서브넷**(Public + Private) 표준.
- **3 AZ 권장**: 더 균형 잡힌 HA.

### 5. 보조 CIDR 블록

- VPC에 최대 5개 IPv4 CIDR 추가 가능.
- 부족하면 확장하면 됨.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Default VPC** | 계정마다 자동 생성. 서브넷 모두 Public | 학습용. 운영은 직접 VPC 설계 |
| **DNS Hostnames / DNS Resolution** | VPC에서 켜야 EC2가 퍼블릭 DNS 받음 | `enableDnsHostnames` 옵션 |
| **DHCP Option Set** | VPC의 DNS 서버 / 도메인 지정 | 온프레미스 DNS 통합 시 |
| **IPv6** | 듀얼 스택 가능. Egress-only IGW로 아웃바운드만 | 일부 시험 등장 |
| **Subnet Reservations** | 특정 IP 범위 예약(고정) | 신규 기능 |

> ⚠️ **함정**: "Public Subnet의 EC2가 인터넷 접속 안 됨" → 체크리스트: ① 서브넷 라우팅 테이블에 IGW 있나 ② EC2에 공인 IP 있나 ③ SG/NACL 막혀있나 ④ DNS 설정.

> 💡 **암기 팁**: "**서브넷은 AZ 종속, 라우팅은 서브넷 종속**". 서브넷 옮길 수 없고, 한 서브넷은 한 라우팅 테이블만.

### 관련 서비스 Cross-Reference

- IGW/NAT → **Day 2**
- SG/NACL → **Day 3**
- Peering/TGW/Endpoint → **Day 4**
- Multi-AZ 패턴 → **Week 3, Week 11**

---

## 🏗️ 아키텍처 다이어그램

```
[ 표준 3-Tier VPC (2 AZ) ]

  VPC 10.0.0.0/16
  ─────────────────────────────────────────
   AZ-a                          AZ-b
   ┌───────────────────┐          ┌───────────────────┐
   │ Public 10.0.1.0/24│          │ Public 10.0.2.0/24│
   │  ALB / NAT GW     │          │  ALB / NAT GW     │
   └─────────┬─────────┘          └─────────┬─────────┘
             │                              │
   ┌─────────▼─────────┐          ┌─────────▼─────────┐
   │ Private App 10.0.11.0/24 │   │ Private App 10.0.12.0/24 │
   │  EC2 / ECS                │   │  EC2 / ECS                │
   └─────────┬─────────────────┘   └─────────┬─────────────────┘
             │                              │
   ┌─────────▼─────────────────┐ ┌─────────▼─────────────────┐
   │ Private DB 10.0.21.0/24   │ │ Private DB 10.0.22.0/24   │
   │  RDS / Aurora             │ │  RDS / Aurora             │
   └───────────────────────────┘ └───────────────────────────┘

  IGW → Public 라우팅 테이블 (0.0.0.0/0)
  NAT → Private App 라우팅 테이블 (0.0.0.0/0)
  DB 서브넷은 인터넷 라우트 없음
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **서브넷은 AZ 단위**. VPC는 리전 단위.
2. ⭐ **Public = 라우팅 테이블에 IGW(0.0.0.0/0)** 있음. 단순히 "공인 IP"만으론 부족.
3. ⭐ **5개 IP는 AWS 예약**, `/28` 최소 권장.
4. ⭐ **Multi-AZ 표준**: 각 AZ에 Public + Private + (DB Private) 3쌍.
5. ⭐ **CIDR 겹치지 않게 설계** — 후일 Peering/TGW 위해.

---

## 💻 실제 예시 - AWS CLI

```bash
# VPC 생성
aws ec2 create-vpc --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=saa-vpc}]'

# 서브넷 생성 (Public AZ-a)
aws ec2 create-subnet \
  --vpc-id vpc-aaa --cidr-block 10.0.1.0/24 \
  --availability-zone ap-northeast-2a

# IGW 생성 + VPC attach
aws ec2 create-internet-gateway
aws ec2 attach-internet-gateway --vpc-id vpc-aaa --internet-gateway-id igw-bbb

# 라우팅 테이블 + 디폴트 라우트
aws ec2 create-route-table --vpc-id vpc-aaa
aws ec2 create-route --route-table-id rtb-ccc \
  --destination-cidr-block 0.0.0.0/0 --gateway-id igw-bbb

# 서브넷에 라우팅 테이블 연결
aws ec2 associate-route-table --route-table-id rtb-ccc --subnet-id subnet-ddd
```

---

## 📝 연습 문제

**문제 1.** Public Subnet과 Private Subnet을 구분하는 가장 결정적인 기준은?

A) 서브넷의 이름
B) 라우팅 테이블에 IGW로 향하는 0.0.0.0/0 라우트가 있는지 여부
C) 서브넷의 CIDR 크기
D) 보안 그룹 설정

**정답: B**.

---

**문제 2.** /28 서브넷에서 사용자가 사용할 수 있는 IP 개수는?

A) 16  B) 14  C) 11  D) 13

**정답: C** — 16 - 5(AWS 예약).

---

**문제 3.** 한 회사가 본사 데이터센터 10.0.0.0/16과 AWS VPC 10.0.0.0/16을 VPN으로 연결하려고 한다. 가장 큰 문제는?

A) VPN 처리량 부족
B) IP 대역이 겹쳐 라우팅 충돌
C) IGW 부재
D) 보안 그룹 부재

**정답: B** — CIDR 겹치면 라우팅 불가. 처음부터 다르게 설계해야 함.

---

**문제 4.** Multi-AZ HA를 위해 권장되는 최소 서브넷 구성은?

A) 단일 AZ에 Public 1 + Private 1
B) 2개 AZ에 각각 Public + Private + DB Private
C) 모두 Public
D) AZ 1개에 큰 서브넷 1개

**정답: B**.

---

**문제 5.** Public Subnet의 EC2가 인터넷을 못 본다. 우선 확인할 것은?

A) RDS 백업 설정
B) 라우팅 테이블에 IGW 라우트 / EC2에 공인 IP / SG 인바운드 / NACL
C) S3 버킷 정책
D) IAM Role

**정답: B**.

---

## 📌 오늘의 요약

1. VPC는 리전 단위 가상 네트워크, 서브넷은 AZ 단위.
2. Public/Private 구분은 라우팅 테이블의 IGW 라우트로 결정.
3. 각 서브넷 IP 중 5개는 AWS가 예약.
4. CIDR은 회사 전체 관점에서 겹치지 않게 설계.
5. HA는 Multi-AZ 서브넷 페어가 기본.
