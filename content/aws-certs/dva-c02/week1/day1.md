# Day 1 - 개발자 시점에서 본 AWS: 리전, 인프라, 그리고 책임의 경계

새 회사에 입사해서 처음 AWS 콘솔을 받았을 때 가장 먼저 부딪치는 건 보통 두 가지다. 하나는 "어느 리전에 만들어야 하지?", 다른 하나는 "이거 우리가 관리해야 되는 거야, AWS가 알아서 해주는 거야?"다. SAA가 이 질문에 "아키텍트로서 어떻게 설계할 것인가"로 답한다면, DVA는 "개발자로서 어떻게 코드와 빌드를 거기에 얹을 것인가"로 답해야 한다. 같은 인프라 지도지만 시점이 다르다.

이 글에서는 AWS의 글로벌 인프라를 개발자가 알아야 할 만큼만, 그러나 SDK 호출과 endpoint 선택이 깊어지는 지점까지 파고든다. 시험 키워드를 외우는 게 목표가 아니라, `boto3` 클라이언트를 만들 때 `region_name`이 왜 필요한지, IAM 역할이 코드 동작에 어떻게 들어오는지, Lambda 함수가 어느 AZ에서 실행되는지를 진짜로 이해하는 게 목표다.

## 클라우드 컴퓨팅이 만든 개발 패러다임의 전환

2006년 3월 14일, S3가 정식 출시되며 클라우드 컴퓨팅 시대가 시작됐다. 그 전까지 개발자가 새 기능을 출시하려면 ① 서버 견적, ② 데이터센터 콜로케이션 계약, ③ OS·미들웨어 설치, ④ 배포라는 4단계를 거쳐야 했고, 짧아도 수 주가 걸렸다. S3와 그 다음 해(2006년 8월)에 나온 EC2는 이 사이클을 분 단위로 줄였다. AWS가 만든 진짜 변화는 "서버를 빌려준다"가 아니라 "**Infrastructure as API**"라는 모델이었다. 인프라가 코드로 호출 가능한 자원이 되면서, CI/CD·IaC·Auto Scaling 같은 현대 DevOps 관행 전체가 가능해진다.

이걸 학술적으로는 NIST SP 800-145(2011)이 클라우드의 5가지 본질적 특성으로 정리한다. ① 온디맨드 셀프서비스, ② 광범위한 네트워크 접근, ③ 자원 풀링, ④ 빠른 탄력성, ⑤ 측정된 서비스. DVA 시험에서 "비용 모델·확장성·민첩성" 같은 키워드가 보이면 이 5가지 중 어느 측면을 묻는지 식별하면 된다.

> 💡 **관련 이론**: "Infrastructure as API"는 분산 시스템 이론에서 보면 **declarative configuration**(Kubernetes, Terraform, CloudFormation)으로 자연스럽게 이어진다. 명령형으로 "서버 N대를 만들어라"가 아니라 선언형으로 "원하는 최종 상태는 N대다"라고 적으면 시스템이 reconciliation loop를 돌며 그 상태로 수렴시킨다. 이 패턴은 1980년대 Prolog 같은 논리 프로그래밍과 1990년대 Cisco IOS 설정에서 출발해, 2014년 Kubernetes가 산업 표준으로 자리잡게 만든다. DVA에서 만나는 CloudFormation·SAM·CDK는 모두 같은 철학의 다른 구현체다.

세 가지 배포 모델(Public / Private / Hybrid)도 외워야 하지만, 실제 시험에선 거의 항상 시나리오로 등장한다. "온프레미스의 SAP를 그대로 두고 새 마이크로서비스만 클라우드로"라면 Hybrid다. "전자금융감독규정 때문에 일부 데이터는 외부 못 보냄"이라면 Outposts나 Hybrid가 답이다.

## 리전, AZ, Edge: 개발자가 endpoint를 고르는 기준

AWS의 글로벌 인프라는 **Region > AZ > Edge Location** 3층 구조다. 개발자에게 이 구조가 중요한 이유는 SDK 호출 한 줄이 어디로 가는지를 결정하기 때문이다.

```python
import boto3

# 명시적 리전 지정 — endpoint를 결정
s3 = boto3.client('s3', region_name='ap-northeast-2')

# 환경변수 AWS_REGION 또는 ~/.aws/config의 default region 사용
ddb = boto3.client('dynamodb')
```

여기서 `region_name='ap-northeast-2'`라고 적으면 SDK는 `s3.ap-northeast-2.amazonaws.com`이라는 endpoint로 HTTPS 요청을 보낸다. 리전을 잘못 지정하면 그냥 다른 리전에 데이터를 만들거나(비용·법적 문제), 아예 리소스를 못 찾는다(`NoSuchBucket` 에러). 그래서 DVA에서 "왜 우리 코드가 404를 받느냐"는 시나리오가 나오면 `region_name`이나 `endpoint_url`을 먼저 의심해야 한다.

| 인프라 계층 | 개수(2026) | 개발자 관점 의미 |
|-----------|------|-----------|
| **Region** | 34개 | 데이터 위치, 가격, endpoint URL의 결정 단위 |
| **Availability Zone** | 리전당 3개 이상 | EC2/Lambda 실제 실행 위치, Multi-AZ DB의 fail-over 단위 |
| **Edge Location** | 600+ | CloudFront 캐시, Lambda@Edge 실행 지점 |
| **Local Zones** | 30+ | 1-2ms 초저지연. 미디어·게임·실시간 ML 추론 |
| **Wavelength** | 통신사 5G 엣지 | 자율주행, 산업 IoT |
| **Outposts** | 고객 DC 내 AWS 랙 | 데이터 주권 + AWS API 동시 충족 |

> 🔍 **더 깊이**: AWS 서비스의 endpoint는 크게 세 종류다. **Regional endpoint**(예: `dynamodb.ap-northeast-2.amazonaws.com`)는 가장 흔한 형태로 리전별로 다른 인프라에 라우팅된다. **Global endpoint**(예: `iam.amazonaws.com`, `s3.amazonaws.com`)는 리전 없이 글로벌 서비스에 닿는다. **FIPS endpoint**(예: `dynamodb-fips.us-east-1.amazonaws.com`)는 FIPS 140-2 검증된 암호 모듈을 쓰는 endpoint로, 미국 정부·금융 고객용이다. SDK 환경변수 `AWS_USE_FIPS_ENDPOINT=true`로 자동 전환할 수 있다.

2011년 4월 us-east-1 EBS 장애 이후 AWS는 모든 새 리전을 최소 3개 AZ로 짓는다는 원칙을 세웠다. 그 전엔 AZ가 같은 시설 내의 다른 랙 정도였지만, 이 사건으로 "**물리적으로 독립된 전력·냉방·네트워크를 가진 1개 이상의 DC 집합**"이라는 정의가 강제됐다. AZ 간 latency는 보통 1-2ms 이내라서 RDS Multi-AZ 같은 synchronous replication이 가능하지만, 화재나 정전이 번지지는 않을 정도의 거리(수 km ~ 수십 km)를 둔다.

> 📚 **사례**: 2017년 2월 28일 S3 us-east-1 장애. 운영자가 빌링 디버깅 명령에 타이포를 내며 의도보다 많은 서버를 정지시켰고, 인덱스 서브시스템이 완전 재시작에 들어갔다. Stripe·Slack·Trello·IFTTT·Coursera·Quora가 4시간 동안 다운됐고, AWS Status Page 자체도 S3에 의존하고 있어서 "장애 났는데 상태판은 초록불"이라는 상황이 벌어졌다. 이후 AWS는 Status Page를 멀티 리전으로 분리했다. [AWS 공식 회고](https://aws.amazon.com/message/41926/). 개발자 입장에서 교훈은 분명하다. **단일 리전에 의존하는 시스템은 그 리전의 어떤 서비스든 죽으면 같이 죽는다.**

## AZ는 진짜로 어디 있을까: ZoneName과 ZoneId의 차이

이건 시험에 잘 나오고 실무에서도 함정이 많다. 같은 회사 두 AWS 계정이 있을 때, A 계정의 `ap-northeast-2a`와 B 계정의 `ap-northeast-2a`는 **물리적으로 다른 AZ**다. AWS가 의도적으로 계정마다 매핑을 셔플해서 "다들 a부터 만든다"는 부하 쏠림을 막기 때문이다.

```bash
aws ec2 describe-availability-zones \
  --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId]' \
  --output table

# 출력:
# ap-northeast-2a   apne2-az1
# ap-northeast-2b   apne2-az2
# ap-northeast-2c   apne2-az3
# ap-northeast-2d   apne2-az4
```

`ZoneId`(`apne2-az1`)는 모든 계정에서 동일한 물리 AZ를 가리킨다. 협력사와 VPC peering이나 PrivateLink로 연결할 때 cross-AZ 데이터 전송 비용을 아끼고 싶다면 `ZoneId`로 매칭해야 한다. ZoneName만 보고 a-a로 묶으면 실제로는 cross-AZ인 경우가 흔하다.

> ⚠️ **함정**: VPC를 만들 때 subnet을 `ap-northeast-2a`에 만들었다고 협력사 PrivateLink도 같은 a에 두면 자동으로 같은 물리 AZ에 붙는다고 생각하기 쉽다. 틀렸다. PrivateLink의 endpoint network interface는 ENI별로 AZ가 할당되는데, 두 계정의 AZ 매핑이 다르면 트래픽이 cross-AZ로 흘러 GB당 $0.01 비용이 추가로 발생한다. RDS Multi-AZ failover 후에도 client가 다른 AZ에 있으면 비슷한 비용이 든다.

## Edge Location은 단순 캐시가 아니다

엣지 로케이션은 600개 넘는 PoP(Point of Presence)에서 4가지 다른 일을 한다. **CloudFront**(HTTP/HTTPS 캐싱과 TLS termination), **Route 53**(DNS 권위 응답), **Global Accelerator**(TCP/UDP Anycast 가속), **AWS WAF/Shield**(엣지 DDoS 필터링). 개발자가 알아야 할 핵심은 CloudFront와 Global Accelerator의 차이다.

| 차원 | CloudFront | Global Accelerator |
|------|-----------|---------------------|
| OSI 레이어 | L7 (HTTP/HTTPS) | L4 (TCP/UDP) |
| 캐시 | O | X |
| Anycast IP | X (DNS 기반) | O (정적 2개 IP) |
| 적합한 워크로드 | 정적·동적 웹 콘텐츠 | 게임, MQTT, VoIP, WebRTC |
| 페일오버 시간 | 수 분 (DNS TTL) | 수 초 (BGP 재라우팅) |

> 💡 **관련 이론**: Global Accelerator가 제공하는 정적 IP 2개는 **BGP Anycast** 기반이다. 같은 IP를 여러 엣지에서 BGP로 광고하면, 클라이언트의 ISP가 AS_PATH 길이와 local preference 등 BGP best-path 알고리즘(RFC 4271)에 따라 가장 가까운 엣지로 라우팅한다. DNS는 클라이언트 resolver의 TTL 캐시 때문에 변경이 분 단위로 전파되지만, BGP는 router 간 KEEPALIVE/UPDATE로 수 초 안에 전파된다. 이게 Global Accelerator가 "초 단위 페일오버"를 보장하는 메커니즘이다.

CloudFront Functions와 Lambda@Edge도 자주 헷갈린다. **CloudFront Functions**는 600+ 엣지에서 직접 실행되고 콜드 스타트 100μs 미만이지만 메모리 2MB·실행 시간 1ms 제한이 있다. JavaScript ES5.1만 지원하고 외부 API 호출도 못 한다. 단순 viewer request 헤더 수정, A/B 테스트 라우팅 정도가 한계다. **Lambda@Edge**는 13개의 Regional Edge Cache에서 실행되며 Node.js·Python 런타임 전체를 쓸 수 있지만 콜드 스타트가 수십 ms 단위다. DynamoDB 조회나 외부 API 호출이 필요하면 Lambda@Edge로 가야 한다.

## 공동 책임 모델: 개발자가 자기 코드를 어디까지 책임지는가

클라우드를 처음 접한 개발자가 가장 자주 하는 오해가 "AWS가 보안까지 알아서 해주겠지"다. 실제는 **AWS = Security OF the Cloud / Customer = Security IN the Cloud**라는 명확한 분담이 있다. 더 중요한 건, **선택한 서비스 추상화 레벨에 따라 책임 경계선이 위아래로 움직인다**는 점이다.

```
관리형 ↑                                      AWS 책임 ↑
  ┌─────────────────────────────┐
  │ S3 / DynamoDB / Lambda      │  ← 데이터 분류, IAM 권한만 고객
  │ RDS / ECS Fargate           │  ← + 네트워크/SG 설정 고객
  │ ECS on EC2 / EKS Self       │  ← + 컨테이너 런타임, 노드 OS 패치 고객
  │ EC2 + EBS (IaaS)            │  ← OS·미들웨어·앱 전부 고객
  └─────────────────────────────┘
관리형 ↓                                      고객 책임 ↑
```

같은 "DB 쿼리"라도 RDS는 엔진 패치·백업·OS는 AWS, 쿼리 작성·인덱스 설계·SG 설정은 고객이다. EC2에 MySQL을 직접 깐다면 OS 패치까지 고객 책임으로 내려온다. Lambda를 쓰면 런타임 보안 패치까지 AWS 책임이고, 고객은 코드의 취약점과 IAM 권한만 신경 쓰면 된다. **추상화 레벨이 올라갈수록 책임 경계선이 위로 올라간다**는 원칙으로 외우면 시험 문제 절반은 자동으로 풀린다.

> 📚 **사례**: 2019년 7월 Capital One 데이터 유출. 범인은 전직 AWS 직원 Paige Thompson이었지만, 원인은 AWS 인프라가 아니라 **Capital One이 운영하던 WAF의 SSRF 취약점 + EC2 IMDSv1의 IAM 역할 노출**이었다. 공격자는 SSRF로 `http://169.254.169.254/latest/meta-data/iam/security-credentials/`에 접근해 임시 자격증명을 탈취했고, 그 자격증명으로 S3 버킷에서 1억 600만 명의 카드 신청 데이터를 읽었다. 직접적 결과로 AWS는 2019년 11월 **IMDSv2**(세션 토큰 기반)를 출시했다. [DOJ 공소장](https://www.justice.gov/usao-edva/press-release/file/1188626/download).

> 🔍 **더 깊이**: IMDSv2는 두 단계로 동작한다. ① `PUT /latest/api/token` 요청에 `X-aws-ec2-metadata-token-ttl-seconds` 헤더로 세션 토큰을 받음. ② 메타데이터 요청 시 `X-aws-ec2-metadata-token` 헤더로 토큰 제시. SSRF 공격자는 보통 HTTP GET만 가능하므로 PUT을 못 보내 토큰을 못 받는다. 또 IMDSv2는 IP TTL을 1(또는 hop limit 1)로 강제해서 컨테이너 네트워크 outside로는 못 빠져나간다. EC2 인스턴스를 만들 때 `MetadataOptions.HttpTokens=required`로 설정하면 IMDSv1을 강제로 비활성화할 수 있다.

> 💡 **관련 이론**: 공동 책임 모델은 NIST SP 800-145의 서비스 모델(IaaS / PaaS / SaaS)과 정확히 맞물린다. NIST CSF의 5개 함수(Identify, Protect, Detect, Respond, Recover) 중 Identify와 Protect는 거의 고객 영역에 남는다. AWS는 그 위에서 GuardDuty, Inspector, Macie 같은 도구를 제공하지만, 켜고 정책을 세우는 건 고객 몫이다. ISO 27017(클라우드 보안)과 ISO 27018(클라우드 개인정보)도 같은 모델 위에 책임 영역을 명문화한다.

## DVA 시험이 묻는 4개 도메인

DVA-C02는 SAA와 달리 **개발자 시점의 보안·배포·문제 해결**에 무게가 실린다.

| 도메인 | 비중 | 핵심 키워드 |
|--------|------|------|
| 개발 (Development) | 32% | Lambda, API Gateway, DynamoDB, SDK, SAM |
| 보안 (Security) | 26% | IAM, KMS, Cognito, Secrets Manager |
| 배포 (Deployment) | 24% | CodePipeline, CodeBuild, CodeDeploy, Beanstalk, CloudFormation |
| 문제 해결 (Troubleshooting) | 18% | CloudWatch, X-Ray, CloudTrail |

SAA가 "어떻게 설계할 것인가"를 묻는다면, DVA는 "**어떻게 코드로 만들고 배포하고 디버깅할 것인가**"를 묻는다. 예를 들어 "Lambda가 콜드 스타트로 느리다"는 시나리오에 SAA는 "워밍 풀을 잡아라"로 충분하지만, DVA는 "Provisioned Concurrency를 alias에 attach하고, 변경 시 CodeDeploy Canary 10Percent5Minutes로 전환해라"까지 코드와 옵션 이름으로 답해야 한다.

## CLI로 직접 찍어보기

```bash
# 1) 현재 사용 가능한 모든 리전
aws ec2 describe-regions --output table

# 2) 서울 리전의 AZ — ZoneName과 ZoneId 같이 본다
aws ec2 describe-availability-zones \
  --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId,State,ZoneType]' \
  --output table

# 3) 현재 자격증명이 어떤 계정/사용자/역할에 매핑되는지
aws sts get-caller-identity
```

`get-caller-identity`는 디버깅의 시작점이다. "왜 권한이 없다고 나오지?" 싶을 때 가장 먼저 쳐봐야 한다. ARN을 보면 IAM 사용자인지, 어떤 역할로 assume했는지, 어느 계정에 있는지가 한눈에 나온다.

## 정리하며

오늘 본 그림은 두 가지다. 첫째, AWS는 **Region > AZ > Edge** 3층 인프라 위에서 동작하고, 개발자에게 이 구조는 SDK가 어디로 요청을 보내는지와 직결된다. 둘째, 그 위에서 보안·운영의 책임은 **AWS는 콘크리트 바닥부터 하이퍼바이저까지, 그 위는 고객**이고, 어떤 서비스를 선택하느냐에 따라 경계선이 위아래로 움직인다.

다음 글에서는 그 위에서 "누가 무엇을 할 수 있게 할까"를 결정하는 IAM의 4대 엔터티 — User, Group, Role, Policy — 를 본다. Capital One 사고의 직접 원인이 IAM 설정이었다는 점을 떠올리면, 개발자가 IAM을 깊이 이해해야 하는 이유는 자연스럽다.

---

## 📝 연습 문제

**문제 1.** boto3 클라이언트가 `s3 = boto3.client('s3')`로 생성됐을 때, region이 어떻게 결정되는가?

A) 항상 us-east-1으로 고정된다
B) `AWS_REGION` 환경변수 → `AWS_DEFAULT_REGION` → `~/.aws/config`의 default profile 순으로 탐색
C) 가장 가까운 리전이 자동 선택된다
D) S3는 글로벌 서비스이므로 region이 무의미하다

**정답: B**
해설: boto3는 region을 명시하지 않으면 우선순위에 따라 환경변수와 설정 파일을 탐색한다. 정확한 순서는 ① 클라이언트 생성자의 `region_name`, ② `AWS_REGION` 환경변수, ③ `AWS_DEFAULT_REGION` 환경변수, ④ `~/.aws/config`의 활성 profile의 `region` 값. 어디서도 못 찾으면 `NoRegionError`를 던진다. S3 버킷 이름은 글로벌 네임스페이스지만 데이터는 특정 리전에 저장되므로 region 지정이 필요하다(예외적으로 `s3.amazonaws.com` 글로벌 endpoint도 존재하지만, 2020년 이후로는 region-aware endpoint가 권장된다).

---

**문제 2.** 한 회사가 EC2 인스턴스에서 IMDSv1을 통해 IAM 역할을 사용하고 있다. 보안팀이 SSRF 공격에 대응하기 위해 IMDSv2를 강제하라고 요구했다. 가장 정확한 조치는?

A) IAM 역할을 제거한다
B) 인스턴스 메타데이터 옵션을 `HttpTokens=required`로 설정한다
C) 인스턴스를 다른 리전으로 옮긴다
D) Security Group에서 169.254.169.254를 차단한다

**정답: B**
해설: `MetadataOptions.HttpTokens=required`로 설정하면 PUT으로 토큰을 받지 않은 요청은 모두 거부된다. SSRF 공격자가 일반적으로 GET만 가능하므로 메타데이터 접근이 차단된다. A는 애플리케이션이 IAM 권한을 못 쓰게 됨, C는 IMDSv1 문제와 무관, D는 169.254.169.254가 link-local 주소라서 SG로 통제할 수 없다(SG는 ENI에서만 동작). 추가로 `HttpPutResponseHopLimit=1`로 설정하면 컨테이너 네트워크에서의 메타데이터 접근도 차단할 수 있다.

---

**문제 3.** Lambda 함수가 실행되는 AZ는 어떻게 결정되는가?

A) 개발자가 함수 정의 시 AZ를 명시한다
B) AWS가 가용한 AZ에서 자동으로 선택하며 개발자는 통제할 수 없다
C) VPC에 연결된 Lambda는 지정한 subnet의 AZ에서 실행되고, VPC 외부 Lambda는 AWS 내부적으로 분산된다
D) 항상 리전의 첫 번째 AZ에서 실행된다

**정답: C**
해설: Lambda는 함수 생성 시 AZ를 직접 지정하는 옵션이 없다. VPC와 무관한 Lambda(기본)는 AWS가 관리하는 multi-AZ Lambda 환경에서 자동 분산된다. VPC에 연결한 Lambda(`VpcConfig` 설정)는 ENI를 생성한 subnet의 AZ에서 실행되므로, **여러 AZ subnet을 지정해야 단일 AZ 장애에서 살아남는다**. 단일 AZ subnet만 지정하면 그 AZ가 죽을 때 Lambda 호출이 실패한다. 2019년 이전엔 VPC Lambda 콜드 스타트가 ENI 생성으로 10초 이상 걸렸지만, 2019년 9월 Hyperplane ENI 도입으로 첫 호출 때만 ENI를 만들고 이후 재사용하는 구조로 개선됐다.

---

**문제 4.** Global Accelerator와 CloudFront 중 다음 시나리오에 적합한 것은? "전 세계 사용자에게 MQTT 기반 IoT 메시징 서비스를 제공해야 한다."

A) CloudFront (모든 글로벌 트래픽 가속에 적합)
B) Global Accelerator (TCP/UDP 가속, MQTT는 TCP 기반)
C) Route 53 Geolocation (지리 기반 분산)
D) Direct Connect (모든 사용자에게 전용선 제공)

**정답: B**
해설: CloudFront는 HTTP/HTTPS L7 캐시 중심이므로 MQTT(TCP 1883/8883)는 다룰 수 없다. Route 53 Geolocation은 DNS 응답만 분기시킬 뿐 트래픽 자체를 가속하지 않고, DNS TTL 때문에 페일오버가 분 단위다. Direct Connect는 특정 사업장 ↔ AWS 전용선이라 글로벌 사용자 분산에 안 맞는다. Global Accelerator는 BGP Anycast로 가장 가까운 엣지에 트래픽을 끌어들이고 AWS 백본망으로 전달해 TCP/UDP 모두에서 일관된 latency를 보장한다. 정적 IP 2개가 보장되므로 IoT 디바이스 펌웨어에 IP를 박아두기에도 적합하다.

---

**문제 5.** 한 개발자가 us-east-1에 S3 버킷을 만들었는데, ap-northeast-2에서 SDK 호출 시 latency가 200ms를 넘는다. 가장 적절한 개선책은?

A) us-east-1의 S3 버킷을 ap-northeast-2로 옮긴다 (불가능)
B) ap-northeast-2에 같은 이름으로 버킷을 또 만든다 (불가능, 글로벌 unique)
C) S3 Cross-Region Replication으로 ap-northeast-2에 복제본을 만들고, 클라이언트는 가까운 리전의 버킷에 접근한다
D) S3 Transfer Acceleration을 켜면 자동으로 가까운 리전이 선택된다

**정답: C**
해설: S3 버킷은 생성 시 리전이 고정되고 이동 불가, 이름은 글로벌 unique라 같은 이름을 다른 리전에 만들 수 없다. CRR(Cross-Region Replication)으로 별도 이름의 복제본을 만들거나, 2020년 12월 출시된 **Multi-Region Access Point**로 글로벌 endpoint 하나가 가장 가까운 리전 버킷으로 자동 라우팅하게 할 수 있다. D의 S3 Transfer Acceleration은 CloudFront 엣지를 거쳐 백본망으로 전달하는 방식이라 latency는 개선되지만 "리전 자동 선택"은 아니다. 업로드 시 GB당 $0.04 추가 비용도 든다.

---

**문제 6.** 다음 중 "고객 책임" 영역이 아닌 것은?

A) Lambda 함수 코드의 SQL 인젝션 취약점
B) RDS 인스턴스의 MySQL 엔진 보안 패치
C) S3 버킷 정책 설정
D) EC2의 게스트 OS 패치

**정답: B**
해설: RDS는 PaaS이므로 DB 엔진의 패치는 AWS 책임이다. 다만 패치 적용 시점은 maintenance window로 고객이 선택할 수 있다. A는 코드 취약점이라 항상 고객 책임. C는 IAM·리소스 정책이라 항상 고객 책임. D는 EC2가 IaaS이므로 OS 패치는 고객 책임(반대로 같은 워크로드를 ECS Fargate로 옮기면 컨테이너 호스트 OS 패치까지 AWS 책임으로 넘어간다). 이 패턴은 "추상화 레벨이 올라갈수록 책임 경계선이 위로 올라간다"는 원칙으로 외우면 시험에서 변형 문제도 다 풀린다.

---

**문제 7.** 협력사와 VPC peering으로 PrivateLink를 연결하려고 한다. 두 계정 모두 `ap-northeast-2a`에 subnet을 두었는데, 트래픽이 cross-AZ로 흐른다. 원인과 해결책은?

A) AWS의 버그이며 지원 티켓을 열어야 한다
B) `ZoneName`은 계정별로 다른 물리 AZ에 매핑되므로 `ZoneId`(`apne2-az1` 등)로 비교해 일치시켜야 한다
C) VPC peering은 항상 cross-AZ로 동작한다
D) Region을 같게 맞춰야 한다 (이미 같은 리전)

**정답: B**
해설: AWS는 계정마다 의도적으로 AZ 매핑을 셔플해서 "다들 a부터 만든다"는 부하 쏠림을 막는다. A 계정의 `ap-northeast-2a`(`apne2-az1`)와 B 계정의 `ap-northeast-2a`(`apne2-az3`)는 물리적으로 다른 AZ다. `aws ec2 describe-availability-zones`로 ZoneId를 확인하고 같은 ZoneId에 subnet을 두면 같은 물리 AZ에 붙는다. cross-AZ 데이터 전송 비용은 GB당 $0.01($0.02 round-trip)이고, 대용량 트래픽에선 빠르게 누적되므로 이 함정을 인지하는 것이 실무에서 중요하다.
