# Day 4 - Transit Gateway, VPN, Direct Connect, Route 53

📅 날짜: Week 8 (Day 4)
🎯 주제: 멀티 VPC·하이브리드 네트워크 + DNS 운영
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Transit Gateway로 멀티 VPC + 온프레미스 통합한다
- Site-to-Site VPN과 Direct Connect의 차이를 안다
- Route 53의 라우팅 정책과 헬스체크를 운영한다

---

## 🧩 사전 지식 (CS 기초)

- **Hub and Spoke vs Mesh**: 중앙 허브 vs N×N 직접 연결
- **BGP (Border Gateway Protocol)**: 라우터 간 경로 정보 교환
- **DNS 라우팅 정책**: 같은 도메인이 여러 IP를 가질 때 어느 IP를 응답할지
- **TTL (Time To Live)**: DNS 응답 캐싱 시간
- **Active-Active vs Active-Passive**: 양쪽 사용 vs 한쪽 대기

---

## 📖 이론 내용

### 1. Transit Gateway (TGW)

#### 개념
- 멀티 VPC + 온프레미스를 중앙 허브로 연결
- VPC Peering 대체 (N×N → 1 hub)
- BGP 라우팅 지원

#### 연결 가능 대상
- VPC (같은/다른 계정)
- VPN (Site-to-Site)
- Direct Connect Gateway
- 다른 TGW (Cross-Region Peering)

#### Route Table
- TGW에 여러 Route Table 가능
- "어느 VPC가 어느 VPC와 통신할 수 있는지" 라우팅으로 통제
- 예: Prod VPC는 Shared Services VPC와만 통신, Dev VPC와 격리

#### VPC Peering vs Transit Gateway

| 항목 | VPC Peering | Transit Gateway |
|------|-------------|-----------------|
| Topology | N×N | Hub-and-Spoke |
| Transitive | X | O |
| 비용 | 데이터 전송만 | 시간당 attachment + 데이터 전송 |
| 관리 | 복잡 (N개 vpc → N(N-1)/2) | 단순 |
| Cross-Region | O (Inter-Region Peering) | O (TGW Peering) |
| 확장 | 어려움 | 쉬움 |

### 2. Site-to-Site VPN

#### 개념
- 온프레미스와 AWS VPC 간 IPsec VPN
- 인터넷 경유 (암호화 + 인증)
- AWS 측: Virtual Private Gateway (VGW) 또는 Transit Gateway
- 온프레미스 측: Customer Gateway (라우터)

#### Tunnel 구성
- AWS가 자동으로 2개 IPsec 터널 제공 (HA용)
- BGP로 동적 라우팅 권장 (또는 정적)

#### 비용
- VPN Connection 시간당 $0.05
- 데이터 전송 (송신 GB당)
- DX 대비 저렴, 안정성·대역폭 ↓

### 3. Direct Connect (DX)

#### 개념
- 온프레미스 ↔ AWS 전용 회선 (광케이블)
- 인터넷 우회 → 일관된 대역폭·낮은 지연·비용 효율
- 1Gbps / 10Gbps / 100Gbps 선택

#### Connection 종류
- **Dedicated Connection**: 1개 물리 회선 (AWS가 직접 제공)
- **Hosted Connection**: AWS Partner 통해 제공 (50Mbps ~ 10Gbps)

#### Virtual Interface (VIF)

| VIF 종류 | 용도 |
|----------|------|
| **Private VIF** | VPC와 통신 |
| **Public VIF** | AWS public 서비스(S3, DynamoDB)와 통신 |
| **Transit VIF** | Direct Connect Gateway 통해 여러 VPC/리전 |

#### Direct Connect Gateway
- DX 회선 하나로 여러 리전의 VPC 접근
- TGW와 함께 사용 → 멀티 VPC 통합

#### HA 고려
- DX 1개는 SPOF
- 2개 DX 회선 (다른 위치) + VPN backup이 표준 HA 패턴

### 4. VPN vs Direct Connect

| 항목 | Site-to-Site VPN | Direct Connect |
|------|------------------|----------------|
| 매체 | 인터넷 (암호화) | 전용 회선 |
| 대역폭 | 1.25 Gbps(터널) | 1G/10G/100G |
| 지연 | 변동 | 일관·낮음 |
| 설치 | 즉시 (몇 시간) | 수 주 ~ 수 개월 |
| 비용 | 저렴 | 비쌈 (회선 + 포트) |
| 사용 사례 | 임시·소규모·백업 | 일관 성능·대량 |
| 보안 | IPsec 암호화 | 격리 (암호화 별도) |

### 5. Route 53 - DNS

#### 호스팅 영역 종류
- **Public Hosted Zone**: 인터넷용 (예: example.com)
- **Private Hosted Zone**: VPC 내부용 (예: internal.example.com)

#### Routing Policy (⭐ 시험 핵심)

| Policy | 동작 |
|--------|------|
| **Simple** | 단일 IP 반환 |
| **Weighted** | 가중치 비율로 분배 (Canary, Blue-Green) |
| **Latency-based** | 지연 시간 가장 짧은 리전 |
| **Geolocation** | 사용자 위치 기준 |
| **Geoproximity** | 위치 + bias로 미세 조정 (Traffic Flow 필요) |
| **Failover** | Primary 다운 시 Secondary |
| **Multivalue Answer** | 최대 8개 IP 동시 반환 (간단 LB) |
| **IP-based** | CIDR 기반 (특정 ISP 사용자) |

#### Health Check
- HTTP/HTTPS/TCP 엔드포인트 모니터링
- 정상/비정상 판정 → 라우팅 정책에 반영 (Failover 등)
- CloudWatch Alarm과 통합

#### TTL
- 짧으면 변경 빠름, 응답 부하 ↑
- 일반: 300초
- 페일오버용: 60초 이하 권장

### 6. Route 53 + Multi-Region 아키텍처

#### Active-Active Multi-Region
- Latency-based Routing으로 사용자별 가까운 리전
- 양쪽 모두 운영 (비용 2배)

#### Active-Passive (DR)
- Failover Routing
- Primary 정상이면 Primary, 다운 시 Secondary
- Secondary는 비용 절감 위해 Pilot Light 등

#### Route 53 Resolver
- VPC와 온프레미스 DNS 통합
- **Outbound Endpoint**: VPC → 온프레미스 DNS 쿼리
- **Inbound Endpoint**: 온프레미스 → VPC DNS 쿼리

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **TGW Multicast** | TGW로 멀티캐스트 지원 | 특수 워크로드 |
| **DX SiteLink** | DX 간 직접 연결 (AWS Backbone) | 다중 사이트 |
| **VPN CloudHub** | 여러 VPN을 VGW로 연결 | 멀티 지사 |
| **Route 53 Application Recovery Controller** | Multi-Region 페일오버 자동화 | DR 표준 |
| **Network Firewall** | VPC 단위 stateful 방화벽 | 심층 방어 |

> ⚠️ **함정 1**: VPC Peering은 transitive 아님. A↔B, B↔C 있어도 A→C 직접 불가. TGW는 transitive.
>
> ⚠️ **함정 2**: Direct Connect 자체는 암호화 X. 필요 시 MACsec(특정 포트) 또는 VPN over DX.
>
> 💡 **암기 팁**: 멀티 VPC=TGW, 단순 두 VPC=Peering, 임시·저렴=VPN, 일관성=Direct Connect.

### 관련 서비스 Cross-Reference

- **TGW → Week 1 Day 4** (AWS RAM으로 공유)
- **VPN/DX → Week 10 DR** (Multi-Region 복제)
- **Route 53 → Week 7 Day 1** (Blue-Green URL Swap)
- **Resolver → Week 5 SSM** (사설 환경 DNS)

---

## 🏗️ 아키텍처 다이어그램

```
Transit Gateway 멀티 VPC 통합
==========================================================

   온프레미스 DC
       │ VPN or Direct Connect
       ▼
   ┌──────────────────────────────┐
   │     Transit Gateway          │
   │  (Hub-and-Spoke 중심)        │
   │                              │
   │  Route Tables:               │
   │  - Prod RT: Shared만 허용    │
   │  - Dev RT: 모두 격리          │
   │  - Shared RT: 모든 VPC 접근  │
   └─┬───────┬───────┬───────┬───┘
     │       │       │       │
     ▼       ▼       ▼       ▼
  Prod VPC Stage VPC Dev VPC Shared VPC
                              (AD, ECR)
```

```
Route 53 Multi-Region Failover
==========================================================

   [사용자]
       │ DNS 쿼리
       ▼
   ┌──────────────────────────────┐
   │  Route 53                    │
   │  Failover Policy:            │
   │  - Primary:   ALB ap-northeast-2 (Health Check)
   │  - Secondary: ALB us-east-1 (Health Check)
   └────────┬─────────────────────┘
            │
   Primary Healthy → ap-northeast-2
   Primary Unhealthy → us-east-1 (자동 페일오버)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **VPC Peering ≠ Transitive**, **TGW = Transitive** (Hub-and-Spoke)
2. ⭐ **VPN = 인터넷 + IPsec (즉시·저렴), DX = 전용 회선 (일관·고대역폭)**
3. ⭐ **Direct Connect Gateway로 멀티 리전·VPC 통합**
4. ⭐ **Route 53 Routing Policy 8종** 중 시험은 Weighted, Latency, Failover, Geolocation 빈출
5. ⭐ **Route 53 Resolver로 VPC↔온프레미스 DNS 통합**

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Transit Gateway 생성
TGW_ID=$(aws ec2 create-transit-gateway \
  --description "Central hub" \
  --options 'AmazonSideAsn=64512,AutoAcceptSharedAttachments=enable,DefaultRouteTableAssociation=enable,DefaultRouteTablePropagation=enable' \
  --query 'TransitGateway.TransitGatewayId' --output text)

# VPC Attachment
aws ec2 create-transit-gateway-vpc-attachment \
  --transit-gateway-id $TGW_ID \
  --vpc-id vpc-prod \
  --subnet-ids subnet-prod-a subnet-prod-b

# VPC의 라우팅 테이블에 TGW 경로
aws ec2 create-route \
  --route-table-id rtb-prod \
  --destination-cidr-block 10.0.0.0/8 \
  --transit-gateway-id $TGW_ID

# 2. Site-to-Site VPN
# Customer Gateway 등록
CGW_ID=$(aws ec2 create-customer-gateway \
  --bgp-asn 65000 \
  --public-ip 203.0.113.10 \
  --type ipsec.1 \
  --query 'CustomerGateway.CustomerGatewayId' --output text)

# VPN Connection
aws ec2 create-vpn-connection \
  --type ipsec.1 \
  --customer-gateway-id $CGW_ID \
  --transit-gateway-id $TGW_ID \
  --options 'StaticRoutesOnly=false,TunnelOptions=[{Phase2EncryptionAlgorithms=[{Value=AES256}]},{Phase2EncryptionAlgorithms=[{Value=AES256}]}]'

# 3. Direct Connect Gateway
DXGW_ID=$(aws directconnect create-direct-connect-gateway \
  --direct-connect-gateway-name "Central-DXGW" \
  --amazon-side-asn 64513 \
  --query 'directConnectGateway.directConnectGatewayId' --output text)

# DXGW + TGW 연결
aws directconnect create-direct-connect-gateway-association \
  --direct-connect-gateway-id $DXGW_ID \
  --gateway-id $TGW_ID \
  --add-allowed-prefixes-to-direct-connect-gateway 'cidr=10.0.0.0/8'

# 4. Route 53 Failover
HZ_ID=$(aws route53 list-hosted-zones-by-name --dns-name example.com --query 'HostedZones[0].Id' --output text)

# Primary (Health Check 포함)
aws route53 create-health-check \
  --caller-reference "$(date +%s)" \
  --health-check-config 'IPAddress=1.2.3.4,Type=HTTPS,ResourcePath=/health,FullyQualifiedDomainName=primary.example.com'

aws route53 change-resource-record-sets \
  --hosted-zone-id $HZ_ID \
  --change-batch '{
    "Changes":[{
      "Action":"UPSERT",
      "ResourceRecordSet":{
        "Name":"app.example.com",
        "Type":"A",
        "SetIdentifier":"primary",
        "Failover":"PRIMARY",
        "TTL":60,
        "ResourceRecords":[{"Value":"1.2.3.4"}],
        "HealthCheckId":"hc-primary"
      }
    }]
  }'

# Secondary (DR 리전)
aws route53 change-resource-record-sets \
  --hosted-zone-id $HZ_ID \
  --change-batch '{
    "Changes":[{
      "Action":"UPSERT",
      "ResourceRecordSet":{
        "Name":"app.example.com",
        "Type":"A",
        "SetIdentifier":"secondary",
        "Failover":"SECONDARY",
        "TTL":60,
        "ResourceRecords":[{"Value":"5.6.7.8"}]
      }
    }]
  }'

# 5. Latency-based Routing
aws route53 change-resource-record-sets \
  --hosted-zone-id $HZ_ID \
  --change-batch '{
    "Changes":[
      {"Action":"UPSERT","ResourceRecordSet":{
        "Name":"app.example.com","Type":"A",
        "SetIdentifier":"seoul","Region":"ap-northeast-2",
        "TTL":60,"ResourceRecords":[{"Value":"1.2.3.4"}]
      }},
      {"Action":"UPSERT","ResourceRecordSet":{
        "Name":"app.example.com","Type":"A",
        "SetIdentifier":"nvirginia","Region":"us-east-1",
        "TTL":60,"ResourceRecords":[{"Value":"5.6.7.8"}]
      }}
    ]
  }'

# 6. Route 53 Resolver - 온프레미스 DNS 쿼리
aws route53resolver create-resolver-endpoint \
  --name "OutboundToOnprem" \
  --direction OUTBOUND \
  --ip-addresses SubnetId=subnet-priv-a,Ip=10.0.10.5 SubnetId=subnet-priv-b,Ip=10.0.11.5 \
  --security-group-ids sg-resolver

aws route53resolver create-resolver-rule \
  --name "OnpremDomain" \
  --rule-type FORWARD \
  --domain-name "onprem.local" \
  --target-ips Ip=192.168.1.10 Ip=192.168.1.11 \
  --resolver-endpoint-id rslvr-out-abc
```

---

## 📝 연습 문제

**문제 1.** 회사가 20개 VPC + 온프레미스를 통합 네트워크로 운영하려 한다. 가장 효율적인 도구는?

A) VPC Peering N×N
B) Transit Gateway (Hub-and-Spoke) + VPN 또는 Direct Connect
C) VPN만
D) Direct Connect만

**정답: B**
해설: 20×19/2 = 190개 Peering = 관리 지옥. TGW가 Hub-and-Spoke로 단순화 + Transitive 라우팅 + 온프레미스 통합.

---

**문제 2.** 회사가 일관된 대역폭(10Gbps)과 낮은 지연이 필요하다. VPN으로 부족하다면?

A) Direct Connect (전용 회선)
B) VPN 추가
C) Multi-VPN
D) Internet Gateway

**정답: A**
해설: DX는 전용 회선으로 일관된 성능 + 낮은 지연. VPN은 인터넷 경유라 변동성 ↑. 대용량 + SLA 요구사항은 DX.

---

**문제 3.** Multi-Region 환경에서 사용자에게 가까운 리전으로 자동 라우팅하려 한다. 어떤 Route 53 정책?

A) Weighted
B) Latency-based
C) Geolocation
D) Failover

**정답: B**
해설: Latency-based는 AWS의 네트워크 측정으로 지연 최소 리전 응답. Geolocation은 사용자 국가/대륙 기준 (지연과 무관할 수 있음).

---

**문제 4.** Primary 리전 ALB 다운 시 자동으로 Secondary 리전 ALB로 트래픽이 가도록 하려면?

A) Latency-based
B) Failover Routing + Health Check
C) Weighted
D) Simple

**정답: B**
해설: Failover Routing의 정확한 사용 사례. Primary Health Check 실패 시 자동으로 Secondary 응답. TTL을 짧게(60s) 설정해 빠른 전환.

---

**문제 5.** Route 53이 사용자의 ISP에 따라 다른 IP를 반환하게 하려면 (예: KT 사용자는 A, SKT 사용자는 B)?

A) Geolocation
B) IP-based Routing (CIDR 기반)
C) Weighted
D) Latency

**정답: B**
해설: IP-based Routing은 클라이언트 CIDR로 라우팅. ISP별로 CIDR이 다르므로 ISP별 라우팅 가능. 신기능, 시험에 점차 등장.

---

## 📌 오늘의 요약

1. TGW = Hub-and-Spoke + Transitive. VPC Peering(N×N, non-transitive) 대체
2. VPN = 즉시·저렴 (인터넷+IPsec), DX = 일관·고대역폭 (전용 회선)
3. Direct Connect Gateway로 멀티 리전·VPC 통합. DX 자체는 암호화 X
4. Route 53 정책 8종: Simple/Weighted/Latency/Geolocation/Geoproximity/Failover/Multivalue/IP-based
5. Route 53 Resolver = VPC ↔ 온프레미스 DNS 통합 (Inbound/Outbound Endpoint)
