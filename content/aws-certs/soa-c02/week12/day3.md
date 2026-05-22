# Day 3 - 도메인 5·6 복습 (네트워킹·콘텐츠 전송 + 비용·성능)

📅 날짜: Week 12 (Day 3)
🎯 주제: SOA-C02 도메인 5·6 핵심 압축 정리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 도메인 5(네트워킹·콘텐츠 전송 18%)와 도메인 6(비용·성능 12%) 통합 30%를 정리한다
- VPC 트러블슈팅 의사결정 흐름과 비용 도구 매핑을 암기한다
- 도메인 통합 시나리오 5문항으로 점검한다

---

## 🧩 사전 지식 (CS 기초)

- **CIDR**: Classless Inter-Domain Routing. IP 범위 표기
- **Stateful vs Stateless**: SG=Stateful, NACL=Stateless
- **Edge Network**: CloudFront PoP. 사용자 가까이 캐싱
- **Right Sizing**: 실제 사용량 기반 리소스 규모 조정

---

## 📖 이론 내용

### 1. 도메인 5: 네트워킹·콘텐츠 전송 (18%)

#### 1-1. VPC 핵심

| 항목 | 핵심 |
|------|------|
| **Subnet (Public/Private)** | IGW 경로 = Public, NAT 경로 = Private |
| **Route Table** | 트래픽 경로 정의 |
| **SG (Stateful)** | 인스턴스 단위, 응답 자동 허용 |
| **NACL (Stateless)** | 서브넷 단위, in/out 양방향 규칙 |
| **VPC Peering** | 1:1 연결, Transitive X |
| **Transit Gateway** | 허브 (멀티 VPC + VPN + DX) |

SG vs NACL 비교:

| | SG | NACL |
|---|----|------|
| Stateful | O | X |
| 규칙 | Allow만 | Allow + Deny |
| 적용 | 인스턴스 | 서브넷 |
| 평가 | 모든 규칙 | 번호 순 (낮은 번호 우선) |

#### 1-2. NAT / Endpoint / PrivateLink

| 서비스 | 용도 |
|--------|------|
| **NAT Gateway** | Private subnet → 인터넷 (Outbound) |
| **NAT Instance** | 구식 (직접 운영) |
| **VPC Gateway Endpoint** | S3 / DynamoDB만 (무료) |
| **VPC Interface Endpoint (PrivateLink)** | 거의 모든 AWS 서비스 (ENI + 시간당 과금) |

#### 1-3. 연결 옵션

| 옵션 | 용도 | 대역폭 |
|------|------|--------|
| **Site-to-Site VPN** | 빠른 구축, 암호화 | ~1.25 Gbps |
| **Direct Connect** | 전용선, 안정 | 1/10/100 Gbps |
| **DX + VPN** | 백업용 VPN | 안정성 ↑ |
| **Transit Gateway** | 멀티 VPC 허브 | 큰 규모 |

#### 1-4. Route 53 (DNS)

| 정책 | 용도 |
|------|------|
| Simple | 단순 매핑 |
| Failover | Active/Passive |
| Latency-based | 가장 가까운 리전 |
| Geolocation | 지리적 위치 |
| Weighted | A/B, Canary |
| Multi-Value Answer | 기본 분산 + 헬스체크 |
| Geoproximity | Traffic Flow (편향 가능) |

#### 1-5. CloudFront (CDN)

| 항목 | 핵심 |
|------|------|
| Origin | S3 / ALB / EC2 / 외부 |
| Behavior | Path 별 동작 |
| Cache Policy / Origin Request Policy | 캐싱 키 분리 (신규 방식) |
| OAC (Origin Access Control) | S3 origin 인증 (구 OAI 대체) |
| Signed URL / Cookie | 사용자별 액세스 제어 |
| Lambda@Edge / CloudFront Functions | 엣지 로직 |

#### 1-6. 글로벌 가속

| 서비스 | 차이 |
|--------|------|
| **CloudFront** | HTTP/S 콘텐츠 캐싱 |
| **Global Accelerator** | TCP/UDP 모든 트래픽 + Anycast IP + 빠른 failover |

#### 1-7. 트러블슈팅 도구

| 도구 | 역할 |
|------|------|
| **VPC Flow Logs** | 허용/거부 트래픽 기록 |
| **Reachability Analyzer** | 두 리소스 간 경로 정적 분석 |
| **Network Access Analyzer** | 네트워크 정책 위반 탐지 |
| **Traffic Mirroring** | 실시간 패킷 미러 |

### 2. 도메인 6: 비용·성능 최적화 (12%)

#### 2-1. 비용 도구

| 서비스 | 역할 |
|--------|------|
| **Cost Explorer** | 13개월 비용 분석 + 권장 |
| **AWS Budgets** | 예산 알림 + Action (자동 차단) |
| **Cost Anomaly Detection** | ML 이상치 탐지 |
| **Cost Allocation Tag** | 비용 분배 (활성화 필요) |
| **CUR** | 시간별 상세 데이터 (S3) |
| **Cost Optimization Hub** | 권장 통합 |

#### 2-2. 약정 할인

| 종류 | 적용 |
|------|------|
| **Compute SP** | EC2/Fargate/Lambda (가장 유연) |
| **EC2 Instance SP** | 특정 패밀리·리전 (더 큰 할인) |
| **SageMaker SP** | SageMaker 전용 |
| **Standard RI** | 변경 어려움, 큰 할인 |
| **Convertible RI** | 패밀리 변경 가능 |
| **RDS/Redshift RI** | SP 없음 |

#### 2-3. Spot & Capacity

| 항목 | 핵심 |
|------|------|
| **Spot** | 최대 90%, 2분 알림 회수 |
| **Spot Fleet / EC2 Fleet** | 다양한 인스턴스 풀 (capacityOptimized 권장) |
| **Capacity Reservation** | 용량 보장, 할인 X |

#### 2-4. 성능 최적화

| 도구 | 역할 |
|------|------|
| **Compute Optimizer** | EC2/ASG/EBS/Lambda Right Sizing |
| **Trusted Advisor Performance** | 일반 성능 체크 |
| **EBS gp3** | gp2 대비 20% 저렴 + IOPS 분리 |
| **S3 Storage Class Analysis / Intelligent-Tiering** | 자동 계층화 |
| **CloudFront 캐싱** | 오리진 부하 ↓ |

### 3. "키워드 → 정답" 통합표

| 키워드 | 도메인 5·6 정답 |
|--------|-----------------|
| "Stateful 규칙" | Security Group |
| "Deny 규칙 필요" | NACL |
| "S3 / DynamoDB만 사설" | Gateway Endpoint (무료) |
| "다른 AWS 서비스 사설 액세스" | Interface Endpoint (PrivateLink) |
| "두 리소스 경로 분석" | Reachability Analyzer |
| "허용/거부 트래픽 로그" | VPC Flow Logs |
| "TCP/UDP 글로벌 가속" | Global Accelerator |
| "정적 콘텐츠 글로벌 캐싱" | CloudFront |
| "Active/Passive DNS" | Route 53 Failover |
| "약정 할인 가장 유연" | Compute Savings Plans |
| "용량만 보장" | Capacity Reservation |
| "Right Sizing 권장" | Compute Optimizer |
| "비용 이상치 탐지" | Cost Anomaly Detection |
| "비용 알림 + 자동 차단" | Budgets + Budget Action |

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **NAT Gateway 비용** | 시간당 + 데이터 처리 (GB당) | 비싸므로 Endpoint 우선 |
| **VPC Peering Transitive X** | A↔B, B↔C라도 A↔C 안 됨 | TGW 필요 |
| **CloudFront vs S3 Transfer Acceleration** | TA = S3 업로드만, CF = 콘텐츠 배포 | 혼동 주의 |
| **gp3 IOPS/Throughput 분리** | 용량과 무관 설정 가능 | gp2 차이점 |
| **S3 Intelligent-Tiering** | 객체 접근 패턴 자동 분석 | 모니터링비 객체당 |
| **Direct Connect Gateway** | 멀티 VPC + 멀티 리전 연결 | 글로벌 |

> ⚠️ **함정 1**: NACL은 stateless라 응답 트래픽도 명시 허용 필요 (Ephemeral port 1024-65535).
>
> ⚠️ **함정 2**: VPC Peering은 Transitive 아님. 멀티 VPC는 TGW.
>
> ⚠️ **함정 3**: Capacity Reservation = 가용성. SP/RI = 할인. 별개 개념.
>
> 💡 **암기 팁**: 도메인 5 = "트래픽 흐름과 도착", 도메인 6 = "낭비 줄이기"

---

## 🏗️ 아키텍처 다이어그램

```
도메인 5·6 통합: 글로벌 + 비용 효율 배포
==========================================================

  사용자 ──► Route 53 (Latency/Failover)
              │
              ▼
      Global Accelerator ─┐    CloudFront
        (TCP/UDP)         │    (HTTP/S 캐싱)
              │           │       │
              ▼           ▼       ▼
            Region A    Region B  S3 (OAC)
              │
        Public Subnet
              │   ALB
        Private Subnet
              │
       [EC2 + ASG] ◄── Mixed (On-Demand + Spot)
              │
        VPC Endpoint ──► S3/DDB (Gateway, 무료)
        PrivateLink ───► 기타 AWS 서비스

        [관측·비용]
        VPC Flow Logs → Athena 분석
        Cost Explorer + Budgets + Compute Optimizer
```

---

## ⭐ 핵심 포인트 (도메인 5·6 통합)

1. ⭐ **SG = Stateful, NACL = Stateless** (가장 흔한 함정)
2. ⭐ **S3/DDB만 Gateway Endpoint(무료)**, 나머지 = Interface Endpoint(PrivateLink)
3. ⭐ **Reachability Analyzer = 경로 정적 분석**, VPC Flow Logs = 트래픽 기록
4. ⭐ **Compute SP = 가장 유연**, Spot = 90% 할인 + 2분 알림
5. ⭐ **Compute Optimizer = Right Sizing 권장**, Budgets = 알림 + Action

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. VPC Flow Logs 활성화
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-12345 \
  --traffic-type ALL \
  --log-destination-type cloud-watch-logs \
  --log-group-name VPCFlowLogs

# 2. Reachability Analyzer 경로 분석
aws ec2 create-network-insights-path \
  --source eni-aaa --destination eni-bbb \
  --protocol tcp --destination-port 443

aws ec2 start-network-insights-analysis \
  --network-insights-path-id nip-xxx

# 3. Gateway Endpoint (S3) 생성 - 무료
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-12345 \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --route-table-ids rtb-private-a rtb-private-b

# 4. CloudFront + OAC (S3 origin 보호)
aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name":"s3-oac","SigningProtocol":"sigv4",
    "SigningBehavior":"always","OriginAccessControlOriginType":"s3"
  }'

# 5. Route 53 Latency Routing
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123 \
  --change-batch '{"Changes":[{
    "Action":"CREATE",
    "ResourceRecordSet":{
      "Name":"api.example.com","Type":"A",
      "SetIdentifier":"ap-northeast-2",
      "Region":"ap-northeast-2",
      "AliasTarget":{"HostedZoneId":"Z14LCN19Q5QHIC","DNSName":"alb-seoul.elb.amazonaws.com","EvaluateTargetHealth":true}
    }
  }]}'

# 6. Compute Optimizer 권장 (EC2)
aws compute-optimizer get-ec2-instance-recommendations \
  --query 'instanceRecommendations[*].[instanceArn,finding,recommendationOptions[0].instanceType]'

# 7. Budget Action (임계 도달 시 EC2 stop SCP 부착)
aws budgets create-budget-action \
  --account-id 123456789012 \
  --budget-name Monthly1000 \
  --notification-type ACTUAL \
  --action-type APPLY_SCP_POLICY \
  --action-threshold 'ActionThresholdValue=100,ActionThresholdType=PERCENTAGE' \
  --definition '{"ScpActionDefinition":{"PolicyId":"p-xxxx","TargetIds":["ou-xxxx"]}}' \
  --execution-role-arn arn:aws:iam::123:role/BudgetActionRole \
  --approval-model AUTOMATIC \
  --subscribers Address=ops@example.com,Type=EMAIL
```

---

## 📝 도메인 통합 시나리오 5문항

**문제 1.** EC2 Private Subnet 인스턴스가 S3에 접근하는데, NAT Gateway 비용이 부담된다.

A) PrivateLink 추가
B) S3 VPC Gateway Endpoint 추가 (S3는 Gateway, 무료)
C) Public Subnet으로 이동
D) IAM 정책

**정답: B**
해설: S3·DynamoDB만 Gateway Endpoint(무료) 지원. NAT 경유 비용 제거.

---

**문제 2.** ALB에 도달하지 못하는 EC2가 있다. SG/NACL/Route 중 무엇이 문제인지 빠르게 식별하려면?

A) VPC Flow Logs 분석
B) Reachability Analyzer로 두 리소스 간 경로 분석 (정적, 빠름)
C) Traffic Mirroring
D) Ping

**정답: B**
해설: Reachability Analyzer는 SG/NACL/Route 등 설정 기반 정적 분석. 어디가 막혔는지 즉시 보고.

---

**문제 3.** 회사가 게임 서버(UDP) 글로벌 가속 + 빠른 failover가 필요하다.

A) CloudFront
B) Global Accelerator (TCP/UDP + Anycast IP + 빠른 failover)
C) Route 53 Latency
D) ALB Cross-Region

**정답: B**
해설: CloudFront는 HTTP/S만. UDP/TCP는 GA. Anycast IP로 빠른 전환.

---

**문제 4.** EC2 200대 운영 중 over-provisioned 인스턴스 자동 식별 + 권장.

A) CloudWatch 수동
B) Compute Optimizer (ML 기반 Right Sizing)
C) Cost Explorer
D) Trusted Advisor만

**정답: B**
해설: CO는 14일 이상 메트릭으로 인스턴스 단위 권장. TA는 폭이 넓지만 인스턴스 단위 권장은 약함.

---

**문제 5.** 회사가 CloudFront로 S3 정적 사이트 배포 시 S3 직접 접근을 막고 싶다.

A) S3 Public 차단만
B) CloudFront OAC (Origin Access Control) + S3 Bucket Policy
C) Lambda@Edge
D) Signed URL

**정답: B**
해설: OAC가 OAI 대체 표준. CloudFront만 S3 접근 가능하게 강제.

---

## 📌 오늘의 요약

1. **SG(Stateful) vs NACL(Stateless)**, S3/DDB만 Gateway Endpoint
2. **VPC Flow Logs / Reachability Analyzer / Traffic Mirroring** - 트러블슈팅 3종
3. **CloudFront(HTTP/S) vs Global Accelerator(TCP/UDP)**
4. **Compute SP** = 가장 유연, **Spot** = 90% 할인, **Capacity Reservation** = 용량 보장만
5. **Compute Optimizer** = Right Sizing, **Budgets + Action** = 자동 차단
