# Day 3 - NAT Gateway, VPC Endpoint, PrivateLink — VPC가 외부와 만나는 세 가지 방식

VPC를 만들고 인스턴스를 Private 서브넷에 두면 즉시 새 질문이 생긴다. "그럼 이 인스턴스는 어떻게 외부와 통신하지?" 답이 한 가지가 아니라 세 가지인 게 첫 번째 함정이다. 어디로 가는 트래픽이냐에 따라 NAT Gateway, VPC Endpoint, PrivateLink를 골라야 하고, 잘못 고르면 비용이 10배, 보안이 한 단계 약해진다.

운영자가 가장 자주 받는 청구서 충격이 NAT Gateway 데이터 처리 비용이다. $0.045/GB가 별것 아닌 듯하지만, S3로 일 1TB를 보내는 ETL 환경에선 월 $1,350이 NAT GW로만 빠져나간다. 같은 트래픽을 Gateway Endpoint로 우회하면 그게 0원이 된다. 이 한 가지 사실만 알아도 SOA 시험 시나리오의 30%가 풀린다. 이 글은 세 가지 방식이 왜 각자 존재하는지, 어떤 트래픽이 어디로 가는지, 그리고 비용·보안·운영의 trade-off를 따라간다.

## 외부 통신의 세 갈래 — 트래픽의 목적지로 결정된다

Private 서브넷 EC2가 외부로 나가는 트래픽은 목적지에 따라 셋으로 나뉜다.

| 목적지 | 도구 | 비용 | 보안 |
|--------|------|------|------|
| 외부 인터넷 (임의의 URL) | NAT Gateway → IGW | 시간당 + GB당 (비쌈) | 일반 (SNAT) |
| AWS 서비스 (S3, DynamoDB) | Gateway Endpoint | **무료** | 백본 내부 |
| AWS 서비스 (나머지) | Interface Endpoint (PrivateLink) | 시간당 + GB당 | 백본 내부 |
| 자사/타사 서비스 (다른 VPC/계정) | PrivateLink + Endpoint Service | 시간당 + GB당 | 백본 내부 |

운영의 첫 번째 원칙: **AWS 서비스로 가는 트래픽은 절대 NAT GW를 거치지 않게 한다.** Gateway Endpoint(S3/DDB)나 Interface Endpoint(나머지)로 우회시켜 비용과 보안을 동시에 잡는다. 두 번째 원칙: **다른 VPC/계정의 서비스를 호출할 땐 PrivateLink**. 인터넷 거치지 않고 AWS 백본 내부로만 통신한다.

## NAT Gateway — 관리형이 만든 운영 단순성과 새 함정

NAT Gateway는 2015년 12월에 등장했다. 그 전엔 NAT Instance(EC2에 NAT 소프트웨어 설치)가 유일한 옵션이었고, 운영자가 직접 HA·확장·패치를 해야 했다. NAT GW는 이걸 AWS 관리형으로 바꾸면서 두 가지를 해결했다 — ① 자동 5 Gbps → 100 Gbps 확장, ② AZ 내 가용성(AWS가 책임).

내부 동작은 SNAT(Source NAT) + connection tracking이다. Private 인스턴스(10.0.10.5)가 외부 8.8.8.8로 패킷을 보내면, NAT GW가 source IP를 자기 자신의 Elastic IP(예: 52.0.0.10)로 바꿔서 IGW로 내보낸다. 응답이 8.8.8.8 → 52.0.0.10:43321로 돌아오면 connection tracking 테이블을 보고 원래 인스턴스(10.0.10.5)에 돌려준다.

### AZ 종속의 비밀

NAT GW는 만들 때 서브넷을 지정한다. 그 서브넷이 속한 AZ에 NAT GW가 묶인다. 멀티 AZ Private 서브넷이 있는데 NAT GW를 한 AZ에만 두면 두 가지 문제가 생긴다.

첫째, **AZ 장애 전파**. AZ-a의 NAT GW가 죽으면 AZ-b의 Private 인스턴스도 외부 통신이 끊긴다 — 라우팅 테이블이 AZ-a의 NAT를 가리키고 있으니까. AWS의 "한 AZ가 죽어도 다른 AZ는 살아 있어야 한다"는 다중 AZ 원칙이 깨진다.

둘째, **Cross-AZ 데이터 전송 비용**. AZ-b의 인스턴스가 AZ-a의 NAT GW로 보내는 트래픽은 cross-AZ로 $0.01/GB가 추가 청구된다. NAT GW 자체 처리 비용 $0.045/GB와 합치면 $0.055/GB로 22% 더 비싸진다.

표준 패턴은 **AZ마다 NAT GW 하나 + 각 AZ의 Private 라우팅 테이블이 자기 AZ의 NAT를 가리킨다**. 라우팅 테이블도 AZ당 따로 만들어야 한다(공유하면 안 됨). 이게 시험과 실무 모두에서 가장 자주 확인되는 패턴이다.

> 📚 **사례**: 2020년 Slack의 부분 장애 사후 분석에서 NAT GW의 connection tracking 한계가 화제가 됐다. AWS는 NAT GW의 destination당 동시 연결 수가 약 55,000개로 제한된다고 명시한다(정확히는 source IP × dest IP × dest port 조합 기준 port 사용량 한계). Slack은 단일 NAT GW 뒤에서 같은 외부 서비스로 동시 연결이 너무 많아 한계에 부딪혔고, 새 연결의 SYN이 ENOTCONN 또는 timeout으로 실패했다. 해결은 ① NAT GW를 여러 개로 sharding, ② Multi-IP NAT GW(2021년 도입 — 한 NAT GW에 EIP 여러 개 부여) 사용. 시험에는 이 정도 깊이로 안 나오지만 실무에선 대형 환경의 디버깅 단서가 된다.

> ⚠️ **함정**: NAT GW에는 **Security Group을 부착할 수 없다**. NACL은 NAT GW가 있는 서브넷에 적용되니까 NACL로 통제는 가능하지만 SG는 불가. NAT Instance는 EC2라 SG 가능 — 이 차이가 시험 문제로 자주 나온다.

### NAT Instance — 레거시인데 가끔 답일 때

NAT Instance는 거의 모든 케이스에서 NAT GW로 대체됐지만, 두 가지 시나리오에선 여전히 답이다.

① **포트 포워딩이 필요할 때**. NAT GW는 SNAT만 지원 — 외부에서 들어오는 새 연결을 내부 인스턴스로 포워드하는 DNAT는 못 한다. 운영자가 "사설 서버를 외부에 노출해야 하는데 ALB는 과한 경우" iptables DNAT로 처리하는 NAT Instance가 답.

② **비용 극소화 환경**. NAT GW는 시간당 $0.045 + GB당 $0.045다. 거의 트래픽이 없는 dev/test 환경에서 t3.nano NAT Instance(시간당 $0.005)가 NAT GW(시간당 $0.045)의 1/9 비용이다. 단, 운영 부담을 직접 져야 한다(HA, 패치, AMI 관리).

NAT Instance의 잘 알려진 함정 하나: **Source/Destination Check를 비활성화해야** 한다. EC2의 기본 동작은 "자기 자신이 src/dst가 아닌 패킷은 거부"인데, NAT는 다른 인스턴스의 패킷을 포워딩하므로 이 검사를 꺼야 한다. `aws ec2 modify-instance-attribute --instance-id i-xxx --no-source-dest-check`.

## VPC Endpoint — Gateway vs Interface, 두 발명의 시간차

VPC Endpoint는 두 단계로 도입됐다. 2015년 5월에 **Gateway Endpoint**(S3 전용), 2017년에 **Interface Endpoint**(PrivateLink). 이름이 비슷해서 같은 것으로 오해되지만 내부 구현이 완전히 다르다.

### Gateway Endpoint — 라우팅 테이블 트릭

Gateway Endpoint는 본질적으로 **특별한 라우팅 항목**이다. 라우팅 테이블에 `pl-xxxxx → vpce-xxxxx`(prefix list로 표현된 S3 IP 대역) 같은 항목을 추가하면, 그 대역으로 가는 트래픽이 IGW가 아니라 endpoint를 거치게 된다. endpoint는 AWS 백본 내부로 패킷을 라우팅한다.

지원 서비스: **S3, DynamoDB** 단 둘뿐. 이 두 서비스만 Gateway Endpoint를 갖는 이유는 트래픽 패턴이 워낙 압도적이라(거의 모든 워크로드가 둘 중 하나는 쓴다) AWS가 비용을 무료로 두기로 결정한 것 같다. 다른 서비스에 Gateway를 안 만든 건 prefix list 관리 부담 때문으로 추정된다.

**무료**라는 게 결정적이다. NAT GW로 가던 S3 트래픽이 Gateway Endpoint를 거치면 ① 시간당 NAT GW 비용 없음, ② GB당 NAT GW 처리 비용 없음, ③ Cross-AZ 트래픽 없음, ④ AWS 백본 내부로만 흐름. 단 한 번의 endpoint 생성으로 월 수백·수천 달러가 절약되는 경우가 흔하다.

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-abc \
  --service-name com.amazonaws.ap-northeast-2.s3 \
  --vpc-endpoint-type Gateway \
  --route-table-ids rtb-priv-a rtb-priv-b
```

> 🔍 **더 깊이**: Gateway Endpoint를 만들면 라우팅 테이블에 `Destination: pl-78a54011, Target: vpce-1a2b3c4d` 같은 항목이 자동 추가된다. `pl-xxx`는 prefix list — AWS가 관리하는 IP 대역 집합으로, S3나 DynamoDB의 모든 리전 endpoint IP를 묶은 추상화다. AWS가 새 IP 대역을 추가하면 prefix list가 자동 업데이트되고 라우팅도 자동 반영된다. 이 메커니즘은 BGP의 prefix aggregation과 비슷한 발상이다.

### Interface Endpoint — ENI에 사설 IP를 박는다

Interface Endpoint는 다른 접근이다. **서브넷에 ENI를 만들어 사설 IP를 부여**한다. 그 ENI가 AWS 서비스의 사설 endpoint 역할을 한다. 라우팅 테이블 수정은 없고, DNS resolution을 통해 인스턴스가 서비스 도메인(예: `ssm.ap-northeast-2.amazonaws.com`)을 호출하면 endpoint의 사설 IP로 resolve된다.

**Private DNS** 옵션이 핵심이다. 켜져 있으면 AWS가 Route 53 Private Hosted Zone을 자동 등록해서 표준 서비스 도메인이 endpoint의 사설 IP로 resolve된다. 켜져 있지 않으면 endpoint별 고유 DNS 이름(예: `vpce-xxx.ssm.ap-northeast-2.vpce.amazonaws.com`)을 직접 호출해야 한다 — 코드 수정이 따라온다. 보통 Private DNS를 켜두는 게 표준이다.

지원 서비스가 압도적으로 많다 — SSM, SNS, SQS, CloudWatch Logs, Lambda, ECR, KMS, Secrets Manager 등 사실상 대부분의 AWS 서비스. 비용은 endpoint당 시간당 $0.01(가용 AZ 수에 비례) + GB당 $0.01. NAT GW보다 GB당은 저렴($0.045 vs $0.01)하지만 시간당 기본료가 있어서 트래픽이 적으면 NAT GW가 오히려 쌀 수 있다.

```bash
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-abc \
  --service-name com.amazonaws.ap-northeast-2.ssm \
  --vpc-endpoint-type Interface \
  --subnet-ids subnet-priv-a subnet-priv-b \
  --security-group-ids sg-endpoint \
  --private-dns-enabled
```

### SSM Session Manager — 사설 환경의 표준 구성

사설 VPC(인터넷 차단)에서 SSM Session Manager를 쓰려면 **세 개의 Interface Endpoint**가 필요하다. 이게 SOA 시험 단골이다.

| Endpoint | 역할 |
|----------|------|
| `com.amazonaws.{region}.ssm` | SSM API 호출 (Session 시작/종료) |
| `com.amazonaws.{region}.ssmmessages` | Session Manager의 양방향 메시지 채널 |
| `com.amazonaws.{region}.ec2messages` | SSM Agent ↔ Service 통신 (legacy 채널) |

세 개가 다 필요한 이유는 SSM의 내부 아키텍처가 세 개의 채널로 분리돼 있어서다. 운영자가 흔히 빠지는 함정은 `ssm`만 만들고 끝낸다는 것 — Session이 안 열린다. 거기에 ECR로 컨테이너 이미지를 풀하려면 `ecr.api`와 `ecr.dkr`도, CloudWatch Logs 보내려면 `logs`도 추가해야 한다. 사설 환경의 엔드포인트 리스트는 보통 5-10개로 길어진다.

> 💡 **관련 이론**: Interface Endpoint의 사설 DNS는 Route 53 Private Hosted Zone을 자동 생성해서 동작한다. 그래서 VPC의 `enableDnsHostnames`와 `enableDnsSupport` 둘 다 켜져 있어야 한다 — Day 1에서 본 그 두 토글의 정확한 사용처가 여기다. 새 VPC를 직접 만들면 `enableDnsHostnames`가 기본 꺼져 있어서 Interface Endpoint를 만들고도 DNS resolve가 안 되는 흔한 사고가 발생한다.

## PrivateLink — B2B SaaS의 인터넷 우회

PrivateLink는 같은 메커니즘(Interface Endpoint)을 **자사 서비스 노출**에도 쓸 수 있게 확장한 것이다. 2017년 출시 후 B2B SaaS와 멀티 계정 환경의 표준 패턴이 됐다.

구성은 세 컴포넌트로 이루어진다.

```
[Provider 계정 / VPC]
  ┌─────────────────────────┐
  │  NLB (자사 서비스 앞)    │
  │     │                    │
  │     ▼                    │
  │  Endpoint Service        │ ← AWS에 등록 (vpce-svc-xxx)
  │  Allowed Principals:     │ ← 어느 계정에 허용할지
  │    arn:...:111122223333  │
  │    arn:...:222233334444  │
  └──────────┬──────────────┘
             │ AWS Backbone
  ┌──────────┴──────────────┐
  ▼                          ▼
[Consumer A VPC]      [Consumer B VPC]
  Interface Endpoint    Interface Endpoint
  (사설 IP)             (사설 IP)
  Private DNS 자동
```

각 부분:

1. **NLB**: 자사 서비스 앞단(보통 백엔드 마이크로서비스 클러스터). PrivateLink는 NLB만 지원 — ALB는 안 됨(2023년 ALB도 지원 시작했지만 시험 시점엔 NLB 기준).
2. **Endpoint Service**: NLB를 VPC Endpoint Service로 등록. `vpce-svc-xxx` 식별자가 발급된다.
3. **Allowed Principals**: 어느 AWS 계정/IAM 사용자가 이 endpoint에 연결할 수 있는지 화이트리스트.
4. **Consumer VPC Endpoint**: 고객 계정에서 Interface Endpoint 생성, `service-name`을 `vpce-svc-xxx`로 지정. NLB와 사설 IP로 직접 통신.

### 왜 NLB만 — ALB가 아닌가

처음 PrivateLink가 출시될 때 NLB만 지원한 이유는 **연결의 격리** 때문이다. ALB는 L7 reverse proxy라 TLS termination, 헤더 수정, path 라우팅을 수행한다 — 즉 ALB가 연결의 endpoint다. 그래서 ALB에 도착한 트래픽은 provider 측 ALB IP에서 출발한 새 연결로 백엔드에 도달한다.

NLB는 L4 pass-through에 가까워서 클라이언트 IP가 그대로 보존된다(Proxy Protocol 옵션으로 더 명확히). PrivateLink의 핵심 가치는 "consumer가 provider의 서비스를 자기 사설 IP로 호출하는 것"이고, 이 모델이 L4 NLB와 더 자연스럽게 맞물린다. 2023년 ALB 지원이 추가됐지만 NLB가 여전히 표준이다.

### VPC Peering vs PrivateLink — 무엇이 다른가

같은 "다른 VPC와 통신"이지만 모델이 완전히 다르다.

| 항목 | VPC Peering | PrivateLink |
|------|-------------|-------------|
| 노출 단위 | VPC 전체 (모든 인스턴스) | 단일 서비스 (NLB 뒤) |
| 라우팅 | 양쪽 라우팅 테이블 수정 | DNS 기반, 라우팅 변경 없음 |
| CIDR 충돌 | **충돌 시 연결 불가** | 무관 (각자 사설 IP) |
| 방향성 | 양방향 (둘 다 시작 가능) | 단방향 (Consumer → Provider만) |
| 사용 사례 | 같은 회사 multi-VPC | B2B SaaS, 외부 노출 |
| 비용 | 데이터 전송만 | 시간당 + GB당 |

PrivateLink의 결정적 장점은 **CIDR 충돌에 무관**하다는 점이다. Consumer VPC가 `10.0.0.0/16`, Provider VPC도 `10.0.0.0/16`이어도 정상 동작 — Consumer는 endpoint의 사설 IP(자기 서브넷에서 할당된 IP)로 호출하므로 Provider의 CIDR을 알 필요가 없다. B2B SaaS는 수백 고객의 VPC CIDR을 통제할 수 없으니 이 특성이 결정적이다.

> 📚 **사례**: Snowflake, MongoDB Atlas, Confluent Cloud 같은 대형 SaaS들이 모두 PrivateLink로 고객 VPC와 연결한다. 예전엔 인터넷으로 접근하거나 VPC Peering으로 일일이 연결했는데, 후자는 고객마다 CIDR 충돌 협상이 필요해서 운영이 지옥이었다. PrivateLink 이후 "Endpoint Service 하나 만들고 고객 계정 ID만 화이트리스트에 추가"하면 끝나는 모델이 표준이 됐다. 2024년 기준 PrivateLink 카탈로그에 등록된 서비스가 수천 개에 달한다(AWS Marketplace의 SaaS 통합 표준).

## Endpoint Policy — 마지막 안전망

Gateway Endpoint와 Interface Endpoint 모두 **Endpoint Policy**를 가질 수 있다. IAM Policy와 동일한 JSON 형식인데, "이 endpoint를 통해 가능한 API 호출"을 제한한다.

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": ["arn:aws:s3:::my-app-bucket/*"],
    "Condition": {
      "StringEquals": {"aws:PrincipalAccount": "123456789012"}
    }
  }]
}
```

이 정책의 효과: 이 endpoint를 통해서는 `my-app-bucket`의 객체만, 그것도 우리 계정 자격증명으로만 접근 가능. 다른 계정의 버킷이나 다른 권한은 자동 거부. 데이터 유출 방지에 강력한 도구다.

운영 패턴: ① 기본 Endpoint Policy는 `"Effect":"Allow","Action":"*","Resource":"*"`로 매우 열려 있음, ② 회사 정책상 "우리 계정 외부의 S3 버킷에 데이터 보내지 못하게"가 있다면 endpoint policy로 `aws:PrincipalAccount` 또는 `s3:ResourceAccount` 조건 추가, ③ Bucket Policy의 `aws:SourceVpce` 조건으로 반대 방향(특정 endpoint에서만 접근 허용)도 가능.

> ⚠️ **함정**: Endpoint Policy는 IAM Policy의 **위에 얹는 추가 제약**이다. IAM이 허용 + Endpoint Policy도 허용 = 통과. IAM이 거부면 Endpoint Policy가 허용이어도 거부. 즉 Endpoint Policy로 권한을 늘릴 수는 없다. 시험에 "Endpoint Policy로 IAM에 없는 권한 부여"를 답으로 고르면 함정이다.

## 비용 절감 우선순위 — NAT GW 청구서를 줄이는 순서

운영 환경에서 NAT GW 비용이 폭증하면 이 순서로 점검한다.

1. **S3/DynamoDB 트래픽이 NAT GW를 거치는가** → Gateway Endpoint 추가 (무료). 대부분 이걸로 30-70% 즉시 절감.
2. **ECR 트래픽(컨테이너 이미지 풀)이 NAT GW로 가는가** → ECR Interface Endpoint(`ecr.api`, `ecr.dkr`) + S3 Gateway Endpoint(레이어 다운로드용). 이게 또 큰 비중을 차지하는데 빠뜨리기 쉽다.
3. **CloudWatch Logs ingest가 NAT GW로 가는가** → `logs` Interface Endpoint.
4. **SSM/Secrets Manager 호출** → 해당 Interface Endpoint.
5. **외부 SaaS 호출(많은 데이터)** → PrivateLink로 가능한지 확인, 안 되면 NAT 트래픽으로 받아들임.

ECR 함정이 특히 흔한데, 컨테이너 이미지가 보통 100MB-1GB라 클러스터 100대가 같은 이미지를 풀하면 100GB의 NAT 트래픽이 발생한다. ECR Interface Endpoint(시간당 $0.01)는 즉시 비용 절감.

> 🔍 **더 깊이**: ECR의 이미지 풀 트래픽은 두 부분으로 나뉜다. 메타데이터(manifest)는 ECR API로, 실제 이미지 레이어는 S3에서. 그래서 ECR Interface Endpoint만 만들고 S3 Gateway Endpoint를 안 만들면 레이어 다운로드 트래픽이 여전히 NAT GW로 간다. 둘 다 만들어야 완전히 우회된다. AWS 공식 문서에는 "ECR Endpoint를 쓰려면 S3 Endpoint도 필요"라고 명시돼 있는데 운영자들이 자주 놓친다.

## 다른 클라우드와의 비교

| 항목 | AWS | GCP | Azure |
|------|-----|-----|-------|
| 사설 인스턴스 외부 통신 | NAT Gateway | Cloud NAT | NAT Gateway |
| AWS 서비스로의 사설 연결 | VPC Endpoint (Gateway + Interface) | Private Google Access + PSC | Private Endpoint |
| 자사 서비스 외부 노출 | PrivateLink | Private Service Connect | Private Link Service |
| 무료 endpoint | S3, DynamoDB | 없음 | 없음 |

GCP의 Private Service Connect와 Azure의 Private Link Service는 PrivateLink와 거의 같은 모델로, AWS PrivateLink가 사실상 산업 표준이 됐음을 보여준다. 차이는 AWS만 S3/DynamoDB에 무료 Gateway Endpoint를 제공한다는 점 — 트래픽 비중이 워낙 압도적이라 비용 정책의 차이가 운영 비용 차이로 직결된다.

## 정리하며

VPC가 외부와 만나는 세 방식 — NAT Gateway, VPC Endpoint, PrivateLink — 는 트래픽의 목적지로 결정된다. 외부 인터넷은 NAT GW, AWS 서비스는 Endpoint, 다른 VPC/계정의 서비스는 PrivateLink. 잘못 골라서 NAT GW가 다 받게 두면 비용이 10배가 된다.

세 가지 절대 원칙. ① **NAT GW는 AZ당 하나**, 같은 AZ로 라우팅, ② **S3/DynamoDB는 Gateway Endpoint로 우회**(무료), ③ **SSM 사설 환경엔 3개 Interface Endpoint**. 이 세 가지가 시험과 실무 모두에서 가장 자주 등장한다.

다음 글에선 VPC 여러 개를 묶고 온프레미스와 연결하는 — Transit Gateway, VPN, Direct Connect, Route 53 — 큰 그림을 본다. 단일 VPC의 외부 통신을 풀었다면, 다음은 "여러 VPC를 어떻게 한 네트워크처럼 운영할 것인가"다.

---

## 📝 연습 문제

**문제 1.** Private 서브넷의 EC2가 S3와 DynamoDB에 대량 데이터를 보내면서 NAT GW 비용이 폭증한다. 가장 적절한 해결책은?

A) NAT GW 추가 증설
B) Gateway Endpoint (S3/DDB 전용, 무료) 추가
C) NAT Instance로 교체
D) VPN으로 우회

**정답: B**

해설: Gateway Endpoint는 S3와 DynamoDB만 지원하는 무료 옵션이다. 트래픽이 AWS 백본 내부로만 흐르므로 NAT GW를 우회 — 시간당 비용도, GB당 처리 비용도 0원. 대량 트래픽 환경에선 단 한 번의 endpoint 생성으로 월 수백·수천 달러가 절약되는 경우가 흔하다. NAT GW 증설은 같은 비용을 더 쓰는 것이고, NAT Instance는 운영 부담만 늘 뿐 NAT 자체 비용은 비슷하다. VPN은 S3 접근에 부적합. Gateway Endpoint는 정책(Endpoint Policy)으로 접근 가능 버킷 제한까지 가능해 보안도 강화된다.

---

**문제 2.** 사설 VPC(인터넷 차단)에서 SSM Session Manager를 사용하려 한다. 필요한 구성은?

A) NAT GW 추가
B) Interface Endpoint 3개: ssm, ssmmessages, ec2messages
C) Gateway Endpoint 1개
D) VPC Peering으로 다른 VPC 연결

**정답: B**

해설: SSM Session Manager는 세 채널을 모두 사용한다 — ssm(API 호출), ssmmessages(양방향 메시지), ec2messages(SSM Agent 통신). 세 endpoint 모두 Interface 타입(PrivateLink)으로 만들어야 Session이 정상 동작한다. ssm 하나만 만들고 Session이 안 열린다며 시간 보내는 게 흔한 함정. Gateway Endpoint는 S3/DDB만 지원하므로 SSM엔 불가. 사설 환경에서 CloudWatch Logs로 명령 출력을 보낸다면 logs endpoint도 추가, ECR 이미지 풀하면 ecr.api + ecr.dkr + S3 Gateway Endpoint도 추가 — 사설 환경의 endpoint 리스트는 보통 5-10개로 길어진다.

---

**문제 3.** Multi-AZ Private 서브넷의 외부 통신을 가용성 있게 구성하려면?

A) 한 AZ에 NAT GW 1개 두고 모든 AZ가 공유
B) AZ마다 NAT GW 하나씩, 각 AZ의 Private 라우팅 테이블이 자기 AZ의 NAT를 가리킴
C) NAT Instance 한 대 + 수동 페일오버
D) Internet Gateway만으로 충분

**정답: B**

해설: NAT GW는 AZ에 종속된다. 한 AZ에만 두면 두 가지 문제 — ① 그 AZ가 죽으면 다른 AZ의 Private 인스턴스도 외부 통신 끊김(다중 AZ 원칙 위배), ② Cross-AZ 트래픽이 GB당 $0.01 추가 청구. AZ마다 NAT GW + 라우팅 테이블도 AZ별로 분리해서 자기 AZ NAT를 가리키게 하는 게 표준 — 가용성과 비용 둘 다 해결된다. 단일 NAT GW + Multi-AZ 라우팅은 가장 흔한 안티패턴이다.

---

**문제 4.** B2B SaaS 회사가 고객 VPC에 인터넷 거치지 않고 서비스를 노출하려 한다. 고객사들의 VPC CIDR이 다양해서 일부는 자사 VPC와 겹친다. 어떤 기술?

A) VPC Peering (CIDR 충돌이 문제)
B) AWS PrivateLink: NLB + Endpoint Service + Consumer Endpoint
C) Transit Gateway 공유
D) Site-to-Site VPN per customer

**정답: B**

해설: PrivateLink가 정확한 사용 사례. ① CIDR 충돌 무관 — Consumer는 자기 사설 IP로 endpoint 호출, Provider의 CIDR을 알 필요 없음. ② 인터넷 노출 X — AWS 백본 내부로만 통신. ③ 고객별 화이트리스트(Allowed Principals)로 접근 통제. Snowflake, MongoDB Atlas, Confluent Cloud 모두 같은 패턴. VPC Peering은 CIDR 충돌 시 연결 불가, TGW도 마찬가지. VPN은 고객마다 별도 라우터 설정 협상이 필요해 SaaS 규모에선 비현실적.

---

**문제 5.** NAT Instance를 만들었는데 외부 트래픽 전달이 안 된다. 가장 흔한 원인은?

A) AMI가 손상됨
B) Source/Destination Check가 활성화돼 있음 — 비활성화 필요
C) Security Group 자체 차단
D) Public IP 미부여

**정답: B**

해설: NAT Instance의 클래식 함정. EC2의 기본 동작은 "자기 자신이 src/dst가 아닌 패킷은 거부"인데, NAT는 다른 인스턴스(Private 서브넷의 인스턴스)의 패킷을 자기를 거쳐 외부로 포워딩한다. 그래서 Source/Destination Check를 끄지 않으면 모든 NAT 패킷이 인스턴스 ENI에서 차단된다. `aws ec2 modify-instance-attribute --instance-id i-xxx --no-source-dest-check`로 비활성화. NAT GW는 AWS 관리형이라 이 설정이 내부적으로 처리돼 운영자가 신경 쓸 일이 없다.

---

**문제 6.** 회사 정책상 "VPC 내 EC2가 회사 소유 S3 버킷에만 접근하고, 외부 계정의 버킷에는 접근하지 못하게" 강제하려 한다. 어떤 도구?

A) Security Group으로 S3 IP 제한
B) Gateway Endpoint + Endpoint Policy로 `aws:PrincipalAccount` 또는 `s3:ResourceAccount` 조건 추가
C) NAT GW Policy
D) NACL에 S3 deny

**정답: B**

해설: Endpoint Policy로 endpoint를 통한 API 호출에 추가 제약을 건다. `aws:PrincipalAccount=123456789012` 조건으로 우리 계정 자격증명 호출만 허용, 또는 `s3:ResourceAccount=123456789012`로 우리 계정 소유 리소스만 허용. SG는 IP 기반이라 S3 같은 동적 IP 서비스에 부적합. NAT GW엔 Policy 개념이 없다. NACL의 IP deny도 S3엔 비실용. Endpoint Policy는 IAM Policy 위에 얹는 추가 제약이라 "IAM에 권한이 있어도 endpoint 정책에 부합해야 통과" — 데이터 유출 방지의 강력한 안전망이다.

---

**문제 7.** ECR에서 컨테이너 이미지를 풀하면서 NAT GW 비용이 폭증한다. 가장 완전한 해결책은?

A) ECR Interface Endpoint만 추가
B) ECR Interface Endpoint(`ecr.api`, `ecr.dkr`) **+ S3 Gateway Endpoint** 둘 다 추가
C) NAT GW를 더 큰 대역폭으로 교체
D) ECS Fargate로 전환

**정답: B**

해설: ECR의 이미지 풀은 두 부분으로 나뉜다 — manifest는 ECR API(`ecr.api`)로, 실제 이미지 레이어 데이터는 **S3**에서 다운로드된다. ECR Interface Endpoint만 만들고 S3 Gateway Endpoint를 안 만들면 manifest는 우회되지만 실제 레이어 트래픽(대부분의 바이트)은 여전히 NAT GW를 거친다. AWS 공식 문서에 "ECR Endpoint를 쓰려면 S3 Endpoint도 필요"라고 명시돼 있는데 자주 놓친다. 컨테이너 환경에서 NAT GW 비용 절감 시 가장 큰 효과가 나는 조합 중 하나.

---
