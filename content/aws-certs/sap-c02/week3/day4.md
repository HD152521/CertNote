# Day 14 - PrivateLink와 VPC Endpoint: 서비스 추상화 네트워킹

전통적인 네트워크에서 두 시스템이 통신하려면 IP 라우팅이 필요하다. 라우팅 테이블에 경로가 있어야 하고, CIDR이 겹치지 않아야 하며, 방화벽 규칙이 허용해야 한다. AWS PrivateLink는 이 패러다임을 근본적으로 바꾼다. IP 라우팅 대신 **서비스 이름**으로 통신하고, CIDR이 겹쳐도 동작하며, 단방향이기 때문에 서비스를 소비하는 쪽이 서비스를 제공하는 쪽의 내부 네트워크 구조를 전혀 알 수 없다. 오늘은 PrivateLink의 내부 동작 원리부터 Gateway/Interface/GWLB Endpoint의 차이, DNS 해석 메커니즘, 보안 어플라이언스 체인 패턴까지 SAP-C02 수준으로 깊이 다룬다.

## PrivateLink의 설계 철학: 서비스 지향 네트워킹

AWS PrivateLink가 해결하려는 문제는 분명하다. 두 조직이 서비스를 공유하고 싶을 때 기존의 선택지는 크게 두 가지였다. 첫째, 공인 IP를 인터넷에 노출하는 것. 보안 위험과 DDoS 취약성이 따른다. 둘째, VPC Peering이나 TGW로 네트워크 레벨에서 연결하는 것. CIDR 충돌 문제와 과도한 접근 권한 부여가 따른다.

PrivateLink는 세 번째 길을 제시한다. **서비스를 네트워크 레벨이 아닌 Endpoint 레벨에서 노출**한다. Producer는 자신의 VPC에 NLB(Network Load Balancer)를 두고 그 앞에 Endpoint Service를 생성한다. Consumer는 자신의 VPC에 Interface Endpoint를 생성하면 로컬 ENI(Elastic Network Interface)가 만들어지고, 이 ENI가 사설 IP를 갖는다. Consumer가 이 ENI의 IP로 요청을 보내면 AWS PrivateLink 인프라가 Producer의 NLB로 전달한다.

```
[Consumer VPC: 10.0.0.0/16]              [Producer VPC: 10.0.0.0/16]
                                          ← CIDR이 완전히 겹쳐도 동작!
  EC2 (10.0.1.100)
      │
      │ 요청: 10.0.5.20 (로컬 IP처럼 보임)
      ▼
  Interface Endpoint ENI
  (10.0.5.20, AZ-a)   ──── AWS PrivateLink 내부 ────> NLB (Producer)
  Interface Endpoint ENI                                    │
  (10.0.6.20, AZ-b)                                        ▼
                                                      App Server
```

> 💡 **관련 이론**: PrivateLink의 내부 구현은 **서비스 메시(Service Mesh)** 패턴의 AWS 구현이다. 마이크로서비스 아키텍처에서 서비스 디스커버리와 서비스 간 통신을 추상화하는 것처럼, PrivateLink는 VPC 간 서비스 통신을 IP 라우팅에서 분리한다. Consumer가 Producer의 내부 IP 구조를 알 필요가 없고, Producer의 IP가 변경되어도 Consumer는 영향을 받지 않는다. 이는 Martin Fowler가 정의한 "Strangler Fig" 패턴과 결합하면 레거시 시스템을 점진적으로 서비스화하는 데 활용된다.

핵심 특성 세 가지: **단방향**(Consumer → Producer만 가능), **CIDR 겹침 허용**, **서비스 단위 접근 제어**.

> 📚 **사례**: Snowflake는 2019년부터 AWS PrivateLink를 통해 고객이 인터넷을 경유하지 않고 Snowflake 데이터 웨어하우스에 접근할 수 있게 했다. 금융 규제기관이 "데이터가 인터넷을 통과하지 않아야 한다"고 요구하는 환경에서, PrivateLink는 Snowflake SaaS를 사설망에서 사용하는 유일한 방법이다. MongoDB Atlas, Datadog, Elastic Cloud도 동일한 방식으로 PrivateLink 접근을 제공한다.

## VPC Endpoint 3종: 선택 기준

### Gateway Endpoint: S3와 DynamoDB 전용 무료 서비스

Gateway Endpoint는 VPC 라우트 테이블에 특별한 엔트리를 추가해 S3 또는 DynamoDB 트래픽을 AWS 백본으로 직접 보내는 방식이다. ENI가 생성되지 않는다는 점이 Interface Endpoint와 근본적으로 다르다.

```
VPC Route Table:
  pl-xxxxxxxx (S3 프리픽스 리스트) → vpce-xxxxxxxxx (Gateway Endpoint)

EC2 → S3 패킷 → 라우트 테이블 조회 → S3 프리픽스 리스트 매칭
                                      → Gateway Endpoint로 라우팅
                                      → AWS 백본을 통해 S3에 도달
```

> 🔍 **더 깊이**: Gateway Endpoint는 내부적으로 **Managed Prefix List**를 사용한다. AWS가 S3 IP 범위를 관리하는 프리픽스 리스트를 자동으로 유지하고, VPC 라우트 테이블의 Gateway Endpoint 항목이 이 프리픽스 리스트를 참조한다. S3 IP가 변경되면 AWS가 자동으로 프리픽스 리스트를 업데이트하고 라우팅이 자동으로 반영된다. 사용자가 직접 S3 IP 목록을 관리할 필요가 없다. 이 메커니즘 덕분에 추가 비용 없이 운영할 수 있다.

**Gateway Endpoint의 한계**: S3와 DynamoDB만 지원한다. 온프레미스에서는 사용할 수 없다(라우트 테이블 기반이므로 VPC 내부에서만 동작). 다른 리전의 S3에는 동작하지 않는다.

> ⚠️ **함정**: S3 Gateway Endpoint를 생성해도 온프레미스에서 DX 또는 VPN으로 연결된 경우 온프레미스 트래픽은 Gateway Endpoint를 사용할 수 없다. 온프레미스에서 S3에 사설로 접근하려면 S3 **Interface Endpoint**가 필요하다. 이 차이를 모르면 "온프레미스에서 인터넷 없이 S3 접근"이 주제인 시험 문제에서 오답을 선택한다.

### Interface Endpoint (PrivateLink): 범용 사설 서비스 접근

Interface Endpoint는 VPC 서브넷에 ENI를 생성해 AWS 서비스 또는 사용자 정의 서비스에 사설 IP로 접근하는 방식이다. 현재 130개 이상의 AWS 서비스가 Interface Endpoint를 지원한다.

```bash
# Interface Endpoint 지원 서비스 예시
com.amazonaws.ap-northeast-2.secretsmanager
com.amazonaws.ap-northeast-2.kms
com.amazonaws.ap-northeast-2.ecs
com.amazonaws.ap-northeast-2.ecr.api
com.amazonaws.ap-northeast-2.ecr.dkr
com.amazonaws.ap-northeast-2.logs
com.amazonaws.ap-northeast-2.monitoring
com.amazonaws.ap-northeast-2.sqs
com.amazonaws.ap-northeast-2.sns
com.amazonaws.ap-northeast-2.ssm
```

Interface Endpoint의 비용 구조: AZ당 시간당 요금($0.01~) + 데이터 처리 요금(GB당). VPC에 여러 AZ에 걸쳐 Endpoint를 생성하면 각 AZ에 ENI가 생기고 AZ당 시간당 요금이 부과된다.

> 💡 **관련 이론**: Interface Endpoint는 AWS 내부적으로 **Hyperplane**이라는 분산 네트워킹 인프라 위에서 동작한다. Hyperplane은 AWS가 2019년 re:Invent에서 발표한 내부 네트워크 가상화 레이어로, NAT Gateway, PrivateLink, Network Firewall 등의 관리형 네트워크 서비스가 모두 이 위에서 실행된다. Hyperplane은 상태 저장 없이(stateless) 패킷을 처리해 수평 확장이 자동으로 이루어지며, 단일 장애 지점이 없다.

### Gateway Load Balancer Endpoint: 보안 어플라이언스 트래픽 체인

GLB Endpoint는 트래픽을 네트워크 보안 어플라이언스(방화벽, IDS/IPS, DLP)로 우회시키는 특수한 Endpoint다. GENEVE(Generic Network Virtualization Encapsulation, RFC 8926) 프로토콜을 사용해 원본 패킷의 컨텍스트를 보존한 채 어플라이언스로 전달한다.

```
[Spoke VPC 인바운드 트래픽]
     │
     │ IGW에서 도착한 트래픽
     ▼
[VPC Ingress Route Table]
  0.0.0.0/0 → GLB Endpoint ──────────────── GENEVE 캡슐화 ──────────────>
                                                                    [Security VPC]
                                                                    GLB → Firewall
                                                                    Firewall → GLB
<───────────────────── 검사 완료 후 리턴 ─────────────────────────────────
     │
     ▼
[정상 트래픽, 최종 목적지로 전달]
```

> 💡 **관련 이론**: GENEVE(RFC 8926)는 VXLAN(RFC 7348)의 후계 프로토콜로 설계됐다. VXLAN이 고정된 24비트 VNID만 헤더에 포함하는 것과 달리, GENEVE는 가변 길이 헤더와 Type-Length-Value(TLV) 확장을 지원해 네트워크 가상화에 필요한 다양한 메타데이터를 전달할 수 있다. AWS GLB는 GENEVE를 사용해 원본 5-tuple(소스 IP, 목적지 IP, 소스 포트, 목적지 포트, 프로토콜)을 보존한 채 어플라이언스로 전달한다. 어플라이언스는 이 컨텍스트를 기반으로 상태 저장(stateful) 방화벽 규칙을 적용한다.

**GLB Endpoint의 핵심 가치**: 중앙화된 보안 검사. 수십 개의 Spoke VPC가 단일 Security VPC의 어플라이언스를 공유한다. 어플라이언스를 교체하거나 업그레이드해도 Spoke VPC의 구성을 변경할 필요가 없다.

> 🎯 **시나리오**: 대형 금융 지주사가 AWS Organizations로 15개 자회사의 계정을 관리한다. 각 자회사 VPC의 모든 인터넷 인바운드·아웃바운드 트래픽을 보안팀이 운영하는 Palo Alto Networks 방화벽으로 검사해야 한다. 방화벽을 각 VPC에 배포하면 15세트의 방화벽 라이선스와 운영 비용이 필요하다. 대신 Security VPC에 GLB + Palo Alto Networks를 배포하고, 각 자회사 VPC에 GLB Endpoint를 생성해 모든 트래픽을 Security VPC로 우회시킨다. 방화벽 업그레이드는 Security VPC에서만 이루어지고 자회사 VPC는 변경 없다.

## DNS 동작: Private DNS 활성화의 의미

Interface Endpoint를 생성하면 두 종류의 DNS 이름이 제공된다.

**1. 기본 Endpoint DNS 이름** (항상 사용 가능):
```
vpce-0123456789abcdef0-abc12345.secretsmanager.ap-northeast-2.vpce.amazonaws.com
vpce-0123456789abcdef0-abc12345-ap-northeast-2a.secretsmanager.ap-northeast-2.vpce.amazonaws.com
```

**2. Private DNS 활성화 시** (권장):
기존 표준 서비스 URL(`secretsmanager.ap-northeast-2.amazonaws.com`)이 VPC 내에서 ENI의 사설 IP로 해석된다. 애플리케이션 코드를 수정할 필요 없다.

```
VPC 내부 DNS 조회:
secretsmanager.ap-northeast-2.amazonaws.com → 10.0.5.20 (ENI 사설 IP)

VPC 외부(인터넷) DNS 조회:
secretsmanager.ap-northeast-2.amazonaws.com → 52.x.x.x (공인 IP)
```

Private DNS가 동작하려면 VPC의 두 설정이 모두 활성화되어 있어야 한다.
- `enableDnsSupport`: VPC에서 DNS 해석 활성화
- `enableDnsHostnames`: VPC 내 EC2에 DNS 호스트명 할당

> 🔍 **더 깊이**: Private DNS 활성화는 내부적으로 **Route 53 Private Hosted Zone**을 자동으로 생성하고 VPC에 연결한다. 이 Private Hosted Zone이 서비스 도메인(`*.amazonaws.com`)의 VPC 내 DNS 조회를 ENI IP로 오버라이드한다. VPC DNS 해석기(169.254.169.253)가 이 Private Hosted Zone을 먼저 조회하므로 공인 DNS보다 ENI IP가 우선된다. 이 메커니즘은 VPC 외부에서는 영향을 미치지 않아, 동일한 엔드포인트 URL이 VPC 내부에서는 사설 IP로, 인터넷에서는 공인 IP로 해석된다.

> ⚠️ **함정**: 같은 도메인에 대해 이미 커스텀 Route 53 Private Hosted Zone이 있으면 Interface Endpoint의 Private DNS와 충돌할 수 있다. 예를 들어 `amazonaws.com`에 대한 PHZ가 이미 있으면 Endpoint의 Private DNS가 올바르게 동작하지 않을 수 있다. 이를 분리하기 위해 서비스별 세부 도메인(예: `secretsmanager.ap-northeast-2.amazonaws.com`)에만 PHZ를 적용하는 방식이 권장된다.

## Producer 측 구성: Endpoint Service 생성

자체 서비스를 다른 VPC 또는 다른 계정의 Consumer에게 PrivateLink로 노출하려면 **Endpoint Service**를 생성해야 한다.

```bash
# 1. 서비스 앞에 NLB 생성 (TCP 레벨 로드밸런싱)
aws elbv2 create-load-balancer \
  --name my-service-nlb \
  --type network \
  --subnets subnet-aaa subnet-bbb

# 2. Endpoint Service 생성 (NLB 연결)
aws ec2 create-vpc-endpoint-service-configuration \
  --network-load-balancer-arns arn:aws:elasticloadbalancing:...:loadbalancer/net/my-service-nlb/xxx \
  --acceptance-required  # Consumer의 연결 요청을 수동으로 승인

# 3. Consumer 계정/Organization에 서비스 허용
aws ec2 modify-vpc-endpoint-service-permissions \
  --service-id vpce-svc-xxx \
  --add-allowed-principals arn:aws:iam::CONSUMER_ACCT:root

# Consumer 측: Interface Endpoint 생성
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-consumer \
  --service-name com.amazonaws.vpce.ap-northeast-2.vpce-svc-xxx \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-ccc subnet-ddd \
  --security-group-ids sg-yyy \
  --private-dns-enabled
```

`acceptance-required: true`로 설정하면 Consumer가 Endpoint 생성 요청을 보낼 때 Producer가 수동으로 승인해야 한다. 자동 승인(`acceptance-required: false`)도 가능하지만, 허용된 Principal 목록으로만 제한하는 것이 보안상 권장된다.

## Endpoint Policy: 세밀한 접근 제어

Endpoint Policy는 VPC Endpoint를 통해 허용되는 API 액션과 리소스를 제한하는 IAM 정책이다. S3 Gateway Endpoint와 Interface Endpoint 모두에 적용 가능하다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": ["arn:aws:s3:::company-data-bucket/*"]
    },
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:sourceVpce": "vpce-xxxxxxxxx"
        }
      }
    }
  ]
}
```

> 💡 **관련 이론**: Endpoint Policy는 IAM 정책의 **자원 기반 정책(Resource-based Policy)** 의 특수 형태다. IAM의 평가 논리에서 Endpoint Policy는 VPC Endpoint를 통과하는 요청에 추가적인 제한을 가하는 필터 역할을 한다. IAM 사용자 정책이 허용하더라도 Endpoint Policy가 거부하면 접근이 차단된다(AND 논리). S3 버킷 정책에서 `aws:sourceVpce` 조건을 사용하면 특정 Endpoint를 통한 접근만 허용하는 데이터 격리가 가능하다.

## PrivateLink vs Peering vs TGW: 언제 무엇을 쓰는가

| 기준 | PrivateLink | VPC Peering | TGW |
|------|-------------|-------------|-----|
| 연결 모델 | 서비스 단위 | 네트워크 전체 | 네트워크 전체 |
| 방향 | 단방향 (Consumer → Producer) | 양방향 | 양방향 |
| CIDR 겹침 | 허용 | 불가 | 불가 |
| Consumer 측 구성 | Interface Endpoint ENI | 라우트 테이블 | 라우트 테이블 |
| 접근 범위 | 지정된 서비스만 | 상대 VPC 전체 IP | TGW에 연결된 VPC 전체 |
| 멀티 계정 | Endpoint Service 허용 목록 | Peering 요청/승인 | RAM 공유 |
| 비용 | ENI 시간당 + 데이터 | 무료(VPC 내 통신비) | TGW 처리 비용 |
| 확장성 | 서비스 수만큼 독립 | O(N²) Peering 수 | O(N) Attachment |

> 🎯 **시나리오**: 보험사 A가 재보험사 B에게 보험료 계산 API를 제공한다. 두 회사의 VPC CIDR이 동일한 10.0.0.0/8을 사용한다. Peering은 CIDR 충돌로 불가능하다. TGW를 통한 네트워크 연결은 재보험사 B가 보험사 A의 내부 네트워크 전체에 접근 가능해져 보안 우려가 있다. PrivateLink로 계산 API NLB만 노출하면 재보험사 B는 오직 API 엔드포인트에만 접근하고, CIDR 충돌도 없으며, 보험사 A의 내부 구조도 노출되지 않는다.

## Cross-Account, Cross-Region PrivateLink

**Cross-Account**: Endpoint Service를 생성할 때 `add-allowed-principals`에 다른 계정 ARN을 추가하면 해당 계정의 VPC가 Consumer가 될 수 있다. Organizations 전체를 허용할 수도 있다.

**Cross-Region** (2024년 지원 추가): Consumer VPC와 Producer VPC가 다른 리전에 있어도 PrivateLink로 연결 가능하다. Consumer 리전의 Interface Endpoint가 AWS 백본을 통해 다른 리전의 Endpoint Service로 연결된다. 단, 리전 간 데이터 전송 비용이 추가된다.

> 🔍 **더 깊이**: Cross-Region PrivateLink가 추가되기 전에는 다른 리전의 서비스에 사설로 접근하려면 TGW Inter-Region Peering + 로컬 NLB의 복잡한 조합이 필요했다. 2024년부터 Interface Endpoint가 직접 다른 리전 Endpoint Service를 참조할 수 있어 멀티 리전 서비스 아키텍처가 단순해졌다. 이는 글로벌 SaaS 서비스가 단일 리전 PrivateLink 인프라로 전 세계 고객에게 사설 접근을 제공할 수 있게 한다.

## 다른 클라우드의 유사 서비스와 비교

| 항목 | AWS PrivateLink | GCP Private Service Connect | Azure Private Link |
|------|----------------|-----------------------------|--------------------|
| Producer 측 | NLB + Endpoint Service | Service Attachment (NEG) | Standard Load Balancer |
| Consumer 측 | Interface Endpoint (ENI) | PSC Endpoint | Private Endpoint (NIC) |
| CIDR 겹침 | 허용 | 허용 | 허용 |
| 방향 | 단방향 | 단방향 | 단방향 |
| DNS 통합 | Private DNS 자동 | Cloud DNS 수동 구성 | Private DNS Zone |
| 지원 서비스 수 | 130+ AWS 서비스 | 40+ GCP 서비스 | 90+ Azure 서비스 |

> 📚 **사례**: Google Cloud의 Private Service Connect(PSC)는 2021년 출시됐으며 AWS PrivateLink와 동일한 패턴이다. PSC는 NEG(Network Endpoint Group)를 Producer 측에 사용하고, Consumer 측에 PSC Endpoint를 생성한다. GCP VPC가 글로벌 단일 VPC라는 특성상 PSC는 리전 간 연결도 단일 구성으로 처리할 수 있어 AWS보다 구성이 단순하다. Azure Private Link는 2019년 출시돼 세 클라우드 중 가장 먼저 이 패턴을 구현했다.

## 실전: KMS와 Secrets Manager를 사설로 접근하는 패턴

암호화 키 관리(KMS)와 비밀 관리(Secrets Manager)는 보안상 인터넷 경유 없이 VPC 내에서만 접근해야 하는 대표적인 서비스다.

```bash
# KMS Interface Endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxx \
  --service-name com.amazonaws.ap-northeast-2.kms \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-private-a subnet-private-b \
  --security-group-ids sg-kms-endpoint \
  --private-dns-enabled

# Secrets Manager Interface Endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxx \
  --service-name com.amazonaws.ap-northeast-2.secretsmanager \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-private-a subnet-private-b \
  --security-group-ids sg-secretsmanager-endpoint \
  --private-dns-enabled

# KMS Endpoint 정책: 특정 키만 접근 허용
aws ec2 modify-vpc-endpoint \
  --vpc-endpoint-id vpce-xxx \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::ACCT:role/AppRole"},
      "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:ap-northeast-2:ACCT:key/KEY-ID"
    }]
  }'
```

Security Group은 Interface Endpoint의 ENI에 적용된다. EC2 인스턴스가 KMS Endpoint ENI에 접근하려면 해당 Security Group의 인바운드 규칙이 EC2 Security Group 또는 EC2 IP를 허용해야 한다(포트 443).

> ⚠️ **함정**: Interface Endpoint를 생성할 때 Security Group을 지정하지 않으면 **VPC 기본 Security Group**이 자동으로 연결된다. 기본 SG는 동일 SG 내 모든 트래픽을 허용하므로, VPC 기본 SG가 모든 EC2에 적용되어 있다면 Endpoint에 대한 접근이 과도하게 허용될 수 있다. 항상 명시적인 Security Group을 생성하고 필요한 소스만 443 포트를 허용하도록 구성해야 한다.

PrivateLink는 AWS 서비스 접근, 내부 서비스 공유, 서드파티 SaaS 통합, 보안 어플라이언스 체인 모두에서 핵심 패턴이다. SAP-C02에서 "CIDR 겹침", "단방향 서비스 노출", "인터넷 없이 SaaS 접근" 키워드가 나오면 PrivateLink가 정답이다.

---

## 📝 연습 문제

**문제 1.** 금융 회사가 Snowflake 데이터 웨어하우스를 사용한다. 규제 요구사항으로 데이터가 인터넷을 통과하지 않아야 하며, 두 조직의 VPC CIDR이 동일하게 10.0.0.0/8을 사용한다. 적합한 연결 방식은?

A) VPC Peering
B) AWS Transit Gateway + TGW Peering
C) AWS PrivateLink (Interface Endpoint)
D) Direct Connect + Public VIF

**정답: C**
해설: CIDR이 동일하므로 Peering과 TGW는 CIDR 충돌로 불가능하다(A, B 오답). Direct Connect + Public VIF는 S3 같은 AWS 공개 서비스에 사설로 접근하는 용도이며, Snowflake 같은 서드파티 SaaS에는 해당하지 않는다(D 오답). PrivateLink는 CIDR 충돌 상관없이 서비스 단위로 연결하므로 정답이다. Snowflake가 PrivateLink Endpoint Service를 제공하므로 Customer의 VPC에 Interface Endpoint를 생성하면 된다.

---

**문제 2.** EC2 인스턴스(프라이빗 서브넷)가 S3에 접근한다. 데이터가 인터넷을 통과하지 않아야 하고 비용을 최소화해야 한다. 가장 적합한 방법은?

A) NAT Gateway를 통해 인터넷으로 S3 접근
B) S3 Interface Endpoint (PrivateLink)
C) S3 Gateway Endpoint
D) VPN 터널을 통해 온프레미스를 경유해 S3 접근

**정답: C**
해설: S3 Gateway Endpoint는 무료이고 인터넷을 경유하지 않는다. Interface Endpoint(B)도 가능하지만 시간당 + 데이터 요금이 발생한다. "비용 최소화"가 키워드이므로 무료인 Gateway Endpoint가 정답이다. NAT Gateway(A)는 인터넷을 경유하고 비용도 발생한다. VPN 경유(D)는 불필요한 복잡성을 추가한다. 단, 온프레미스에서 S3에 사설로 접근해야 한다면 Gateway Endpoint는 VPC 라우트 테이블 기반이라 온프레미스에서 사용 불가능하므로 Interface Endpoint가 필요하다.

---

**문제 3.** 회사 A의 내부 마이크로서비스(VPC A)를 회사 B(VPC B)에게 제공해야 한다. 회사 B는 서비스만 호출할 수 있어야 하고, 회사 A의 다른 리소스에는 접근하지 못해야 한다. 두 VPC의 CIDR이 겹친다. 적합한 아키텍처는?

A) VPC A와 VPC B를 Peering 연결
B) VPC A에서 Endpoint Service(NLB 기반)를 생성하고 VPC B에서 Interface Endpoint 구성
C) TGW로 두 VPC 연결 후 Security Group으로 제한
D) VPC A에 NAT Gateway를 두고 서비스를 공인 IP로 노출

**정답: B**
해설: PrivateLink Endpoint Service는 단방향 서비스 단위 노출의 표준 패턴이다. CIDR 겹침 허용, 단방향(B → A API 호출만), VPC A의 다른 리소스 접근 불가라는 모든 요구사항을 충족한다. Peering(A)은 CIDR 겹침으로 불가능하고, 연결 시 VPC B가 VPC A 전체 리소스에 접근 가능해질 수 있다. TGW(C)도 CIDR 겹침으로 불가능하며 네트워크 레벨 접근이다. 공인 IP 노출(D)은 인터넷 경유로 보안 요구사항 위반이다.

---

**문제 4.** 여러 VPC의 모든 아웃바운드 인터넷 트래픽을 중앙 Security VPC의 방화벽 어플라이언스로 검사하고 싶다. 어플라이언스가 원본 패킷의 5-tuple 정보를 유지한 채 상태 저장(stateful) 검사를 해야 한다. 적합한 구성은?

A) TGW + Egress VPC + NLB 기반 어플라이언스
B) ALB + Lambda 기반 트래픽 검사
C) Gateway Load Balancer + GLB Endpoint + GENEVE 프로토콜
D) PrivateLink Interface Endpoint + 어플라이언스 VPC

**정답: C**
해설: GLB는 GENEVE 프로토콜(RFC 8926)로 원본 패킷의 5-tuple을 보존하며 어플라이언스로 전달한다. 어플라이언스는 이 정보로 상태 저장 방화벽 규칙을 적용하고 트래픽을 반환한다. GLB Endpoint가 Spoke VPC에 "Bump in the wire" 방식으로 배치된다. NLB(A)는 L4 로드밸런서로 원본 IP 보존이 복잡하고 GENEVE 미지원. ALB + Lambda(B)는 HTTP 레벨 처리라 모든 L3/L4 트래픽 검사에 부적합. Interface Endpoint(D)는 단방향 서비스 노출이지 트래픽 우회 패턴이 아니다.

---

**문제 5.** VPC에 Secrets Manager Interface Endpoint를 생성하고 Private DNS를 활성화했다. 그런데 EC2에서 `secretsmanager.ap-northeast-2.amazonaws.com`으로 호출해도 공인 IP가 반환된다. 원인은?

A) Interface Endpoint Security Group이 443 포트를 차단
B) VPC의 `enableDnsSupport` 또는 `enableDnsHostnames`가 비활성화되어 있음
C) S3 Gateway Endpoint가 DNS 해석을 간섭
D) EC2의 /etc/hosts 파일에 잘못된 항목이 있음

**정답: B**
해설: Private DNS 기능은 VPC의 DNS 지원(`enableDnsSupport=true`)과 DNS 호스트명(`enableDnsHostnames=true`)이 모두 활성화되어 있어야 동작한다. 두 설정 중 하나라도 비활성화되면 Private Hosted Zone이 VPC에 연결되지 않아 표준 도메인이 공인 IP로 해석된다. Security Group(A)은 패킷 필터이지 DNS 해석에 영향을 미치지 않는다. S3 Gateway Endpoint(C)는 Secrets Manager DNS와 무관하다. /etc/hosts(D)는 가능성은 있지만 문제에서 언급된 조건이 아니며 흔한 원인이 아니다.

---

**문제 6.** 멀티 계정 환경에서 공유 서비스 계정의 결제 서비스(NLB 기반)를 다른 50개 워크로드 계정의 VPC에서 사설로 사용해야 한다. 가장 적합한 구성은?

A) 공유 계정 VPC를 모든 워크로드 계정 VPC와 Peering 연결
B) TGW를 RAM으로 공유하고 공유 계정 VPC를 TGW에 연결
C) 공유 계정에 Endpoint Service 생성 + Organizations를 허용 Principal로 추가 + 워크로드 계정에서 Interface Endpoint 생성
D) 공유 계정의 NLB를 인터넷 facing으로 변경

**정답: C**
해설: PrivateLink Endpoint Service에서 `add-allowed-principals`에 Organizations ARN을 추가하면 조직 내 모든 계정이 Interface Endpoint를 생성할 수 있다. 새 계정이 추가되어도 Endpoint Service 구성 변경 없이 바로 Interface Endpoint를 생성하면 된다. Peering(A)은 50개 계정이면 최소 50개 Peering이 필요하고 CIDR 충돌 위험이 있다. TGW(B)는 네트워크 레벨 접근이라 결제 서비스 외 다른 리소스에도 잠재적으로 접근 가능하고 운영 복잡성이 높다. 인터넷 facing NLB(D)는 보안 요구사항 위반이다.

---

**문제 7.** Gateway Endpoint와 Interface Endpoint(PrivateLink) 중 온프레미스 서버가 DX를 통해 S3에 인터넷 없이 접근하는 데 사용할 수 있는 것은?

A) Gateway Endpoint만 가능
B) Interface Endpoint만 가능
C) 둘 다 가능
D) 둘 다 불가능, Public VIF만 가능

**정답: B**
해설: Gateway Endpoint는 VPC 라우트 테이블 기반으로 VPC 내부 트래픽에만 적용된다. 온프레미스에서 DX를 통해 들어오는 트래픽은 VPC 라우트 테이블의 Gateway Endpoint를 거치지 않는다. Interface Endpoint는 ENI를 통해 사설 IP로 접근하므로, 온프레미스에서 DX Private VIF를 통해 VPC의 Interface Endpoint ENI IP로 접근하면 S3에 인터넷 없이 도달할 수 있다. 이를 위해 온프레미스 DNS에서 S3 도메인을 Interface Endpoint의 사설 IP로 해석하도록 Route 53 Resolver 설정이 필요하다.
