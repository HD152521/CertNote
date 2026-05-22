# Day 1 - VPC 기본 (서브넷, 라우팅, NACL vs SG, IPv6)

📅 날짜: Week 8 (Day 1)
🎯 주제: VPC 트러블슈팅의 기초 — 운영자가 매일 헷갈리는 네트워크 개념
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- VPC, 서브넷, 라우팅 테이블의 동작 원리를 이해한다
- 보안 그룹(SG)과 네트워크 ACL(NACL)의 차이를 명확히 안다
- IPv6 지원, 듀얼 스택 VPC 구성을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **CIDR (Classless Inter-Domain Routing)**: IP 주소 범위 표기. `/24`는 256개 IP
- **L3 vs L4**: 네트워크 계층(IP) vs 트랜스포트 계층(TCP/UDP)
- **Stateful vs Stateless 방화벽**: 연결 추적 여부. SG=Stateful, NACL=Stateless
- **NAT (Network Address Translation)**: 사설 IP → 공인 IP 변환
- **DNS resolution**: 도메인 → IP 변환. VPC 내부 + 외부

---

## 📖 이론 내용

### 1. VPC 기본 구조

#### CIDR 블록
- VPC: `/16` ~ `/28` 권장 (10.0.0.0/16 = 65,536개 IP)
- AWS 예약 IP: 각 서브넷의 첫 4개 + 마지막 1개 = 5개
- 서브넷 분할 시 RFC 1918 사설 대역 사용:
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`

#### 서브넷
- AZ에 종속 (서브넷은 AZ 1개에만 속함)
- Public vs Private:
  - **Public**: 라우팅 테이블에 IGW(Internet Gateway) 경로
  - **Private**: IGW 없음, 외부 통신은 NAT Gateway 경유

#### 라우팅 테이블
- 서브넷마다 1개 (Main 또는 명시적)
- 주요 항목:
  - `0.0.0.0/0 → igw-xxx` (Public)
  - `0.0.0.0/0 → nat-xxx` (Private)
  - `10.0.0.0/16 → local` (VPC 내부)

### 2. Security Group (SG)

#### 핵심 특성
- **인스턴스 레벨**: ENI에 적용
- **Stateful**: 인바운드 허용 → 자동으로 아웃바운드 응답 허용
- **Allow rules만**: Deny 규칙 없음 (기본 모두 Deny)
- **여러 SG를 한 ENI에 부여 가능** (최대 5개)
- **SG를 SG로 참조 가능** ("appSG는 webSG에서 오는 트래픽 허용")

#### 자주 쓰는 규칙
```
인바운드:
  HTTP   80    0.0.0.0/0
  HTTPS  443   0.0.0.0/0
  SSH    22    10.0.0.0/16    ← VPC 내부만
  Custom 8080  sg-xyz         ← 특정 SG에서

아웃바운드 (기본 모두 허용):
  All    All   0.0.0.0/0
```

### 3. Network ACL (NACL)

#### 핵심 특성
- **서브넷 레벨**: 서브넷에 적용
- **Stateless**: 인바운드/아웃바운드 별도 명시 필요
- **Allow + Deny 모두 가능**
- **규칙 번호 우선**: 낮은 번호부터 평가, 첫 매칭 적용
- **기본 NACL**: 모든 트래픽 허용
- **Custom NACL**: 모든 트래픽 거부 (명시적 Allow 필요)

#### Ephemeral Ports 함정
- 클라이언트가 외부 서버에 요청 → 응답이 클라이언트의 **임시 포트(1024~65535)**로 옴
- NACL이 Stateless라 인바운드와 아웃바운드 모두 명시 필요

```
인바운드:
  100 ALLOW 80 0.0.0.0/0           ← HTTP 요청 수신
  110 ALLOW 1024-65535 0.0.0.0/0   ← 외부 응답 수신 (ephemeral)
  
아웃바운드:
  100 ALLOW 1024-65535 0.0.0.0/0   ← 응답 보내기 (ephemeral)
  110 ALLOW 80 0.0.0.0/0            ← 외부 HTTP 요청
```

### 4. SG vs NACL 비교 (⭐ 시험 빈출)

| 항목 | Security Group | NACL |
|------|----------------|------|
| 적용 위치 | ENI/인스턴스 | 서브넷 |
| 상태 | Stateful | Stateless |
| 규칙 종류 | Allow만 | Allow + Deny |
| 평가 | 모든 규칙 적용 | 번호 순 첫 매칭 |
| 자동 응답 | 자동 허용 | 명시 필요 (ephemeral) |
| 적용 대상 | 명시적으로 ENI에 | 서브넷의 모든 리소스 |
| 사용 사례 | 세분화된 인스턴스 정책 | 서브넷 전체 차단(예: 악성 IP) |

### 5. IPv6 지원

#### 활성화 방법
- VPC 생성/수정 시 IPv6 CIDR 블록 부여 (AWS 자동 할당)
- 서브넷에 IPv6 CIDR 추가
- 라우팅 테이블에 `::/0 → igw-xxx` 또는 `::/0 → eigw-xxx`

#### Egress-Only Internet Gateway (EIGW)
- IPv6 Private 서브넷용 (NAT IPv6는 없음)
- 아웃바운드 전용 (외부에서 들어오기 X)
- IPv6 인스턴스가 외부로 통신만 가능하게

#### Dual Stack
- IPv4 + IPv6 동시 사용
- 인스턴스에 둘 다 부여
- ALB도 Dual Stack 지원

### 6. DNS 옵션

#### VPC DNS Attributes
- **enableDnsHostnames**: EC2가 DNS 호스트네임 받음 (예: `ec2-1-2-3-4.compute.amazonaws.com`)
- **enableDnsSupport**: AWS DNS 서버 사용 (`AmazonProvidedDNS`)

#### 둘 다 활성화 필요
- VPC Endpoint (Interface) 사용 시 enableDnsSupport + enableDnsHostnames 필수
- Private Hosted Zone 사용 시도 필수

### 7. VPC 운영 함정

#### 비밀의 VPC 1번
- 계정 생성 시 기본 VPC 자동 (172.31.0.0/16)
- 일반적으로 운영용 VPC는 별도 생성 권장

#### CIDR 충돌
- VPC Peering, Transit Gateway 연결 시 CIDR 중복 → 라우팅 불가
- 사전 IP 주소 설계 필수

#### 5개 예약 IP
- `10.0.0.0/24` 서브넷의 예약 IP:
  - `.0` 네트워크
  - `.1` VPC Router
  - `.2` AWS DNS (VPC의 `.2`)
  - `.3` AWS 미래 사용
  - `.255` 브로드캐스트

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **VPC Peering** | 두 VPC 직접 연결. Transitive X | TGW가 더 권장 |
| **Multiple CIDR Block** | VPC에 추가 CIDR 부여 | IP 부족 시 |
| **Secondary IP / IP Prefix** | ENI에 다중 IP | 컨테이너 |
| **AWSSupport-* SSM Docs** | 네트워크 트러블슈팅 자동 | 자동화 |
| **VPC Lattice** | 신규 — 마이크로서비스 네트워킹 | 새 기능 |

> ⚠️ **함정 1**: NACL은 Stateless라 ephemeral ports를 명시해야 함. SG는 Stateful이라 불필요.
>
> ⚠️ **함정 2**: 서브넷 IP 5개 예약 — `/28` 서브넷은 16개 IP 중 11개만 사용 가능.
>
> 💡 **암기 팁**: SG는 "이 인스턴스로 누가 올 수 있나?" (Stateful), NACL은 "이 서브넷에 누가 올 수 있나?" (Stateless).

### 관련 서비스 Cross-Reference

- **VPC → Week 8 Day 2** (Flow Logs로 트래픽 분석)
- **VPC → Week 8 Day 3** (NAT/Endpoint)
- **VPC → Week 5 SSM** (3개 Endpoint 필요)
- **VPC → Week 1 Day 4** (AWS RAM으로 멀티 계정 공유)

---

## 🏗️ 아키텍처 다이어그램

```
VPC 표준 구조 (Multi-AZ)
==========================================================

   VPC 10.0.0.0/16
   ┌───────────────────────────────────────────────────┐
   │   AZ-a                       AZ-b                  │
   │                                                    │
   │  ┌──────────────┐         ┌──────────────┐        │
   │  │ Public       │         │ Public       │         │
   │  │ 10.0.0.0/24  │         │ 10.0.1.0/24  │         │
   │  │  ↑ IGW       │         │  ↑ IGW       │         │
   │  │  ALB / NAT GW│         │  ALB / NAT GW│         │
   │  └──────┬───────┘         └──────┬───────┘         │
   │         │                         │                 │
   │  ┌──────▼───────┐         ┌──────▼───────┐        │
   │  │ Private App  │         │ Private App  │         │
   │  │ 10.0.10.0/24 │         │ 10.0.11.0/24 │         │
   │  │ EC2          │         │ EC2          │         │
   │  └──────┬───────┘         └──────┬───────┘         │
   │         │                         │                 │
   │  ┌──────▼───────┐         ┌──────▼───────┐        │
   │  │ Private DB   │         │ Private DB   │         │
   │  │ 10.0.20.0/24 │         │ 10.0.21.0/24 │         │
   │  │ RDS          │         │ RDS (Standby)│         │
   │  └──────────────┘         └──────────────┘         │
   └───────────────────────────────────────────────────┘
              ↑
        Internet Gateway
              ↑
          Internet
```

```
SG vs NACL 보안 계층
==========================================================

   [Internet]
        │
        ▼
   ┌──────────────────────────────┐
   │  NACL (Subnet level)         │  ← Stateless 1차 방어
   │  Allow 80, 443, 1024-65535   │
   │  Deny 특정 IP                 │
   └────────┬─────────────────────┘
            │
            ▼
   ┌──────────────────────────────┐
   │  Security Group (ENI level)  │  ← Stateful 2차 방어
   │  Allow 80 from 0.0.0.0/0      │
   │  Allow 22 from 10.0.0.0/16    │
   └────────┬─────────────────────┘
            │
            ▼
        [EC2]
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **SG = Stateful (응답 자동), NACL = Stateless (응답 명시)**
2. ⭐ **NACL 순서 평가** (낮은 번호부터, 첫 매칭 적용), SG는 모든 규칙 평가
3. ⭐ **NACL에서 Deny 규칙 사용 가능** — 특정 악성 IP 차단에 유용
4. ⭐ **Egress-Only IGW = IPv6 Private 서브넷의 NAT 역할**
5. ⭐ **각 서브넷에 5개 예약 IP** — `/28`은 사용 가능 IP 11개

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. VPC + 서브넷 생성
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=prod-vpc}]' \
  --query 'Vpc.VpcId' --output text)

# DNS 활성화
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-support

# IPv6 추가 (선택)
aws ec2 associate-vpc-cidr-block --vpc-id $VPC_ID --amazon-provided-ipv6-cidr-block

# 2. IGW + Public Subnet
IGW_ID=$(aws ec2 create-internet-gateway --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID

PUBLIC_A=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.0.0/24 \
  --availability-zone ap-northeast-2a \
  --query 'Subnet.SubnetId' --output text)

aws ec2 modify-subnet-attribute --subnet-id $PUBLIC_A --map-public-ip-on-launch

# Public Route Table
RT_PUB=$(aws ec2 create-route-table --vpc-id $VPC_ID --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id $RT_PUB --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID
aws ec2 associate-route-table --subnet-id $PUBLIC_A --route-table-id $RT_PUB

# 3. Security Group
SG_WEB=$(aws ec2 create-security-group \
  --group-name web-sg \
  --description "Web tier" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $SG_WEB \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_WEB \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# 4. NACL (특정 IP 차단)
NACL_ID=$(aws ec2 create-network-acl --vpc-id $VPC_ID --query 'NetworkAcl.NetworkAclId' --output text)

# 악성 IP 차단 (낮은 번호 = 우선)
aws ec2 create-network-acl-entry \
  --network-acl-id $NACL_ID \
  --rule-number 50 \
  --protocol -1 \
  --cidr-block 203.0.113.0/24 \
  --rule-action deny \
  --ingress

# HTTP 허용 (Deny 다음)
aws ec2 create-network-acl-entry \
  --network-acl-id $NACL_ID \
  --rule-number 100 \
  --protocol tcp \
  --port-range From=80,To=80 \
  --cidr-block 0.0.0.0/0 \
  --rule-action allow \
  --ingress

# ephemeral ports (응답용)
aws ec2 create-network-acl-entry \
  --network-acl-id $NACL_ID \
  --rule-number 110 \
  --protocol tcp \
  --port-range From=1024,To=65535 \
  --cidr-block 0.0.0.0/0 \
  --rule-action allow \
  --ingress

# 5. VPC 정보 점검
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[*].[SubnetId,CidrBlock,AvailabilityZone,MapPublicIpOnLaunch]' \
  --output table

aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'RouteTables[*].[RouteTableId,Associations[0].SubnetId,Routes[?DestinationCidrBlock==`0.0.0.0/0`].GatewayId]' \
  --output table
```

---

## 📝 연습 문제

**문제 1.** Private 서브넷의 EC2가 외부 API를 호출해야 한다. 필요한 구성은?

A) 보안 그룹에 추가
B) Public IP 부여
C) NAT Gateway를 Public 서브넷에 두고 Private 서브넷 라우팅 테이블에 `0.0.0.0/0 → nat-xxx`
D) IGW 직접 연결

**정답: C**
해설: Private = IGW 직접 X. NAT GW는 Public 서브넷에 두고, Private의 RT에 `0.0.0.0/0 → nat-xxx`. NAT가 사설 → 공인 IP 변환 후 응답 전달.

---

**문제 2.** SG와 NACL의 차이로 잘못된 것은?

A) SG는 Stateful, NACL은 Stateless
B) SG는 Allow만, NACL은 Allow+Deny
C) SG는 모든 규칙 평가, NACL은 번호 순 첫 매칭
D) SG는 서브넷에, NACL은 ENI에 적용

**정답: D**
해설: 반대. SG는 ENI에, NACL은 서브넷에 적용. 다른 옵션은 모두 정확.

---

**문제 3.** Custom NACL에서 80번 포트 인바운드만 허용했더니 인스턴스의 HTTP 응답이 안 나간다. 원인은?

A) IGW 누락
B) NACL Stateless라 ephemeral ports(1024-65535) 아웃바운드도 명시해야 함
C) SG 차단
D) 라우팅 테이블

**정답: B**
해설: NACL 함정. Stateless라 응답 트래픽도 별도 명시. 외부 응답이 클라이언트의 ephemeral port로 가는데, 아웃바운드에서 1024-65535 허용 안 하면 차단.

---

**문제 4.** IPv6 Private 서브넷의 EC2가 외부로 통신만 가능하고 외부에서 들어오기는 차단되게 하려면?

A) NAT Gateway (IPv6는 NAT 없음)
B) Egress-Only Internet Gateway (EIGW) — IPv6 전용
C) VPC Endpoint
D) IGW

**정답: B**
해설: IPv6는 NAT 개념 없음 (충분한 주소). EIGW가 IPv6 아웃바운드 전용. IPv4 NAT GW와 비슷한 역할.

---

**문제 5.** `/28` 서브넷에 EC2를 16대 띄울 수 있나?

A) 가능
B) 불가능 — AWS 예약 IP 5개 차감으로 사용 가능 IP는 11개
C) 23대
D) 32대

**정답: B**
해설: 각 서브넷의 .0(네트워크), .1(VPC Router), .2(DNS), .3(예약), 마지막(브로드캐스트) = 5개 예약. /28(16개)에서 11개만 사용 가능.

---

## 📌 오늘의 요약

1. VPC: CIDR 블록 + 서브넷(AZ 종속) + 라우팅 테이블. Public/Private은 IGW 경로 유무
2. SG = Stateful (응답 자동), ENI 레벨, Allow만. NACL = Stateless, 서브넷 레벨, Allow+Deny
3. NACL은 ephemeral ports(1024-65535)를 명시해야 응답 트래픽 통과
4. IPv6 Private의 아웃바운드 전용 = Egress-Only IGW (NAT IPv6 없음)
5. 각 서브넷 5개 예약 IP. /28이면 16-5=11개만 사용 가능
