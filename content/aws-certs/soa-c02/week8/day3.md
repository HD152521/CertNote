# Day 3 - NAT Gateway, VPC Endpoint, PrivateLink

📅 날짜: Week 8 (Day 3)
🎯 주제: VPC가 외부와 통신하는 모든 방법
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- NAT Gateway / NAT Instance의 차이와 운영 함정을 안다
- VPC Endpoint(Gateway vs Interface)의 사용 사례를 구분한다
- PrivateLink로 서비스를 다른 VPC/계정에 안전하게 노출한다

---

## 🧩 사전 지식 (CS 기초)

- **NAT (Network Address Translation)**: 사설 IP → 공인 IP. 출발은 사설, 외부엔 공인
- **Network namespace**: VPC = 네임스페이스. 같은 IP라도 다른 VPC면 무관
- **East-West vs North-South**: VPC 내부(E-W) vs 외부(N-S) 트래픽
- **Service Mesh**: 마이크로서비스 간 통신을 중간 레이어로 통제
- **Bandwidth scaling**: 처리량의 수평/수직 확장

---

## 📖 이론 내용

### 1. NAT Gateway (관리형)

#### 특징
- Private 서브넷의 사설 IP를 공인 IP로 변환 → 외부 통신 가능
- **AWS 관리형** (HA, scaling 자동)
- AZ에 종속 — Multi-AZ 위해 AZ당 NAT GW 하나씩
- **Elastic IP 필요**

#### 비용 모델
- 시간당 + 데이터 처리량($0.045/GB)
- 비싸다! 대량 트래픽 시 비용 폭증
- VPC Endpoint로 AWS 서비스 트래픽 우회 권장

#### 대역폭
- 시작 5 Gbps → 자동으로 최대 100 Gbps 확장
- 단일 NAT GW는 단일 AZ로 제한 → AZ 장애 시 해당 AZ의 Private 인스턴스 외부 통신 끊김

#### 운영 모범 사례
- AZ당 NAT GW 1개 + 각 AZ의 Private 라우팅 테이블이 자신의 AZ NAT GW로
- Cross-AZ 통신은 비용 + 장애 위험

### 2. NAT Instance (레거시)

#### 특징
- EC2 인스턴스에 NAT 소프트웨어 + 사용자가 직접 관리
- AWS Marketplace AMI 또는 직접 구성
- **Source/Destination Check 비활성화** 필요 (시험 함정)

#### NAT GW vs NAT Instance

| 항목 | NAT Gateway | NAT Instance |
|------|-------------|--------------|
| 관리 | AWS | 사용자 |
| 확장 | 자동 | 수동 |
| 가용성 | AZ HA (AWS) | 사용자 구성 |
| 대역폭 | 최대 100 Gbps | 인스턴스 타입 따라 |
| 보안 그룹 | 부착 X | 부착 가능 |
| 포트 포워딩 | 불가 | 가능 |
| 사용 사례 | 표준 | 특수 (포트 포워딩 필요 등) |

→ 거의 모든 경우 NAT GW 권장. NAT Instance는 레거시.

### 3. VPC Endpoint - Gateway 타입

#### 지원 서비스
- **S3**
- **DynamoDB**

#### 동작
- 라우팅 테이블에 Endpoint 추가 → 해당 서비스 트래픽이 인터넷 거치지 않음
- **무료**
- Endpoint Policy로 접근 통제

#### 사용 이유
- NAT GW 비용 절약 (S3/DDB 트래픽이 가장 많은 경우)
- 보안 (트래픽이 AWS 백본 내부)

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-abc \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-priv-a rtb-priv-b
```

### 4. VPC Endpoint - Interface 타입 (PrivateLink)

#### 지원 서비스
- 대부분의 AWS 서비스 (SSM, SNS, SQS, CloudWatch, Lambda, ECR 등)
- 3rd party SaaS (PrivateLink 통합)
- 자사 서비스

#### 동작
- ENI를 VPC 서브넷에 생성 → 사설 IP가 AWS 서비스 endpoint 역할
- DNS 자동 매핑 (Private DNS 옵션)
- **시간당 + 데이터 처리량** 비용

#### Gateway vs Interface 비교

| 항목 | Gateway | Interface (PrivateLink) |
|------|---------|--------------------------|
| 지원 서비스 | S3, DynamoDB | 거의 모든 AWS + 3rd party |
| 비용 | 무료 | 시간당 + GB당 |
| 라우팅 | Route Table | DNS |
| Cross-Account | X | O |
| Security Group | X | O (ENI에 부착) |

### 5. AWS PrivateLink (서비스 노출)

#### 개념
- 자사 서비스를 다른 VPC/계정에 사설 IP로 노출
- VPN/Peering/IGW 없이 안전한 서비스 간 통신
- Service Provider + Service Consumer 모델

#### 구성
```
Provider VPC:
  NLB (Network Load Balancer)
       │
       ▼
  Endpoint Service (자사 서비스 등록)
       │
       ▼
  Allowed Principals (어느 AWS 계정 허용)

Consumer VPC:
  VPC Endpoint (Interface 타입)
       │ DNS 자동 매핑
       ▼
  Provider의 NLB와 사설 IP로 통신
```

#### 사용 시나리오
- B2B SaaS가 고객 VPC에 서비스 노출
- 대기업의 여러 계정에 중앙 서비스 공유
- 인터넷 거치지 않는 마이크로서비스 통신

### 6. Endpoint Policy

#### 제한 사용 사례
```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["s3:GetObject","s3:PutObject"],
    "Resource": ["arn:aws:s3:::my-bucket/*"],
    "Condition": {
      "StringEquals": {"aws:PrincipalAccount": "123456789012"}
    }
  }]
}
```
- 내 VPC에서 특정 S3 버킷에만 접근 가능
- 다른 계정의 버킷 차단

### 7. NAT GW 트러블슈팅

#### 흔한 문제와 해결

**증상**: Private EC2가 외부 통신 안 됨
1. Public 서브넷에 NAT GW 있나?
2. NAT GW의 Elastic IP 있나?
3. Private 서브넷의 Route Table에 `0.0.0.0/0 → nat-xxx` 있나?
4. SG outbound 허용?
5. NACL 양방향 허용?
6. NAT GW의 SG/NACL? (NAT GW는 SG 없음, NACL은 적용)

**증상**: NAT GW 비용 폭증
- S3/DynamoDB 트래픽이 NAT GW 통과 중일 가능성 → Gateway Endpoint 추가
- ECR 트래픽 → Interface Endpoint
- 외부 SaaS 호출량 검토

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **NAT GW Cross-AZ** | 다른 AZ의 NAT 사용 시 추가 비용 + 장애 위험 | 같은 AZ로 라우팅 |
| **Endpoint Service** | PrivateLink의 Provider 쪽 | 자사 서비스 노출 |
| **VPC Lattice** | 신규 — 서비스 메시 네이티브 | 마이크로서비스 |
| **CloudFront → S3 OAI/OAC** | CloudFront가 S3에 안전 접근 | Web tier 보안 |
| **Egress filtering** | 아웃바운드 필터링 (Network Firewall) | 데이터 유출 방지 |

> ⚠️ **함정 1**: NAT GW는 AZ 종속. Multi-AZ HA 위해 AZ당 1개. 다른 AZ NAT를 쓰면 Cross-AZ 비용 + AZ 장애 위험.
>
> ⚠️ **함정 2**: NAT Instance는 Source/Destination Check 비활성화 필수.
>
> 💡 **암기 팁**: Gateway Endpoint(S3/DDB만, 무료) ↔ Interface Endpoint(거의 모든 AWS, 유료, PrivateLink) ↔ NAT GW(외부 인터넷, 비쌈).

### 관련 서비스 Cross-Reference

- **VPC Endpoint → Week 5 SSM** (ssm/ssmmessages/ec2messages 3개 필요)
- **NAT GW → Week 11 비용 최적화** (Endpoint로 트래픽 우회)
- **PrivateLink → Week 6 Day 4** (Service Catalog Sharing)
- **Endpoint Policy → Week 1 IAM**

---

## 🏗️ 아키텍처 다이어그램

```
VPC 외부 통신 옵션
==========================================================

   [Private 서브넷의 EC2]
              │
   ┌──────────┼──────────┐
   ▼          ▼          ▼
  외부 인터넷  AWS 서비스  자사 서비스
  
   외부 인터넷 → NAT GW (Public 서브넷) → IGW
                  │
                  └ 비쌈 + Cross-AZ 비용 주의
   
   AWS 서비스(S3/DDB) → Gateway Endpoint → AWS 백본
                          │ 무료
                          
   AWS 서비스(나머지) → Interface Endpoint → AWS 백본
                         │ 시간당 + GB당
                         │ PrivateLink
                         
   자사 서비스(다른 VPC) → Interface Endpoint → PrivateLink
                          ↑ Provider VPC의 NLB
```

```
PrivateLink 양면 구조
==========================================================

   [Provider 계정 / VPC]
        ┌───────────────────────┐
        │  NLB                  │ ← 자사 서비스 앞
        │   │                   │
        │   ▼                   │
        │  Endpoint Service     │ ← AWS에 등록
        │  Allowed Principals:  │
        │    111122223333       │
        │    222233334444       │
        └──────────┬────────────┘
                   │ AWS Backbone
   ┌───────────────┴───────────────┐
   ▼                               ▼
   [Consumer 계정 A / VPC]    [Consumer 계정 B / VPC]
   VPC Endpoint                VPC Endpoint
   (Interface, ENI)           (Interface, ENI)
        │                          │
        ▼                          ▼
   사설 DNS로 자동 매핑
   (인터넷 거치지 않음)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **NAT GW = AZ 종속** — Multi-AZ HA 위해 AZ당 1개 + 같은 AZ로 라우팅
2. ⭐ **Gateway Endpoint = S3, DynamoDB만 + 무료** — NAT GW 비용 절감
3. ⭐ **Interface Endpoint = PrivateLink 기반** + 거의 모든 AWS 서비스 + 유료
4. ⭐ **NAT Instance = Source/Destination Check 비활성화** 필수
5. ⭐ **PrivateLink = NLB + Endpoint Service + Consumer Endpoint** 3 컴포넌트

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. NAT Gateway 생성 (Multi-AZ)
EIP_A=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
NATGW_A=$(aws ec2 create-nat-gateway \
  --subnet-id subnet-public-a \
  --allocation-id $EIP_A \
  --query 'NatGateway.NatGatewayId' --output text)

EIP_B=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
NATGW_B=$(aws ec2 create-nat-gateway \
  --subnet-id subnet-public-b \
  --allocation-id $EIP_B \
  --query 'NatGateway.NatGatewayId' --output text)

# Private 라우팅 테이블 (각 AZ의 NAT로)
aws ec2 create-route \
  --route-table-id rtb-priv-a \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id $NATGW_A

aws ec2 create-route \
  --route-table-id rtb-priv-b \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id $NATGW_B

# 2. Gateway Endpoint - S3 (무료, NAT 우회)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-abc \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --vpc-endpoint-type Gateway \
  --route-table-ids rtb-priv-a rtb-priv-b \
  --policy-document '{
    "Statement":[{
      "Effect":"Allow","Principal":"*",
      "Action":["s3:GetObject","s3:PutObject","s3:ListBucket"],
      "Resource":["arn:aws:s3:::my-app-data","arn:aws:s3:::my-app-data/*"]
    }]
  }'

# 3. Interface Endpoint - SSM
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-abc \
  --service-name com.amazonaws.ap-northeast-2.ssm \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-priv-a subnet-priv-b \
  --security-group-ids sg-endpoint \
  --private-dns-enabled

# 4. PrivateLink - Endpoint Service 생성 (Provider 측)
# NLB 생성 후
aws ec2 create-vpc-endpoint-service-configuration \
  --network-load-balancer-arns arn:aws:elasticloadbalancing:ap-northeast-2:123:loadbalancer/net/my-nlb/abc \
  --acceptance-required \
  --tags 'Key=Name,Value=MyServiceEndpoint'

# Consumer 계정 권한 부여
aws ec2 modify-vpc-endpoint-service-permissions \
  --service-id vpce-svc-abc \
  --add-allowed-principals "arn:aws:iam::222233334444:root"

# Consumer 측에서 Endpoint 생성
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-consumer \
  --service-name "com.amazonaws.vpce.ap-northeast-2.vpce-svc-abc" \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-consumer-a \
  --security-group-ids sg-consumer

# 5. 트러블슈팅 - NAT GW 트래픽 측정
aws cloudwatch get-metric-statistics \
  --namespace AWS/NATGateway \
  --metric-name BytesOutToDestination \
  --dimensions Name=NatGatewayId,Value=nat-abc \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

---

## 📝 연습 문제

**문제 1.** 회사가 Private EC2가 S3와 DynamoDB에 접근하면서 NAT GW 비용을 절감하려 한다. 어떤 도구?

A) Interface Endpoint
B) Gateway Endpoint (S3/DDB 전용, 무료)
C) NAT Instance
D) VPN

**정답: B**
해설: Gateway Endpoint는 S3와 DynamoDB만 지원하는 무료 옵션. 트래픽이 AWS 백본 내부 → NAT GW 우회 + 비용 절감.

---

**문제 2.** SSM Session Manager를 사설 VPC(인터넷 차단)에서 사용하려 한다. 필요한 것은?

A) NAT GW
B) Interface Endpoint 3개 (ssm, ssmmessages, ec2messages)
C) Gateway Endpoint
D) VPC Peering

**정답: B**
해설: SSM은 Interface Endpoint 3개 필요. Gateway Endpoint는 S3/DDB만 지원. 사설 환경 SSM 운영의 표준 구성.

---

**문제 3.** Multi-AZ Private 서브넷의 외부 통신을 HA로 구성하려면?

A) NAT GW 1개를 모든 AZ가 공유
B) AZ당 NAT GW 1개 + 각 AZ Private 라우팅 테이블이 자기 AZ의 NAT로
C) NAT Instance + 수동 페일오버
D) IGW만

**정답: B**
해설: NAT GW는 AZ 종속 — Multi-AZ HA 위해 AZ마다 별도. 같은 AZ로 라우팅해야 Cross-AZ 비용 X + AZ 장애 격리.

---

**문제 4.** 회사가 B2B SaaS를 운영하면서 고객 VPC에 인터넷 거치지 않고 서비스를 노출하려 한다. 어떤 기술?

A) VPC Peering
B) AWS PrivateLink (NLB + Endpoint Service + Consumer Endpoint)
C) Transit Gateway
D) Direct Connect

**정답: B**
해설: PrivateLink가 정확한 사용 사례. NLB 앞단에 Endpoint Service 등록 + 고객 계정이 Interface Endpoint로 접근. CIDR 충돌 무관, 인터넷 노출 X.

---

**문제 5.** NAT Instance가 외부 트래픽 전달을 안 한다. 가장 흔한 원인은?

A) 인스턴스 종료
B) Source/Destination Check가 활성 — 비활성화 필요
C) 보안 그룹
D) AMI 종류

**정답: B**
해설: NAT Instance의 표준 함정. EC2의 기본 Source/Dest Check는 자기 IP가 아닌 패킷을 거부. NAT는 다른 인스턴스 트래픽을 포워딩하므로 반드시 비활성화.

---

## 📌 오늘의 요약

1. NAT GW = AZ 종속 관리형. Multi-AZ HA 위해 AZ당 1개. 비쌈 + 데이터 처리 비용
2. Gateway Endpoint = S3/DDB만, 무료. NAT GW 우회 + 비용 절감
3. Interface Endpoint = PrivateLink 기반. 거의 모든 AWS 서비스. ENI 사설 IP
4. PrivateLink = NLB + Endpoint Service + Consumer Endpoint. B2B SaaS 표준
5. NAT Instance는 Source/Destination Check 비활성화 필수. NAT GW가 표준 권장
