# Day 1 - 운영자가 보는 AWS 인프라: 리전, AZ, 그리고 책임의 경계선

새벽 3시 12분, 휴대폰이 진동한다. PagerDuty 알람: "us-east-1 API Gateway 5xx 비율 30% 초과, duration 4m." 콘솔에 들어가 리전 셀렉터를 펼친다. us-east-1만 빨갛고 ap-northeast-2는 멀쩡하다. 그런데 우리 회사 서비스 사용자는 99%가 한국에 있다. 왜 미국 리전 장애가 우리 알람을 울렸을까. 답을 찾으려면 우리 인프라의 어느 컴포넌트가 어느 리전에 묶여 있는지, 그리고 콘솔 우측 상단에 "Global"이라고 적혀 있는 IAM·Route 53·CloudFront가 실제로는 어디서 동작하는지를 알아야 한다.

운영자(Operator)의 시험인 SOA-C02는 "어느 서비스가 무엇이다"보다 "장애가 났을 때 어디를 봐야 하느냐", "변경이 잘못됐을 때 어떻게 되돌리느냐", "비용이 튀었을 때 어디부터 파느냐"를 묻는다. 그 출발점이 AWS 인프라 지도와 공동 책임 모델이다. 이 두 그림이 머릿속에 정확히 박혀 있어야, CloudWatch·CloudTrail·Config·Health Dashboard를 어떤 순서로 뒤져야 할지 감이 잡힌다. 12주 동안 같은 사고 흐름을 반복할 것이다. 오늘이 그 첫 그림이다.

## 리전: 데이터 주권·가격·서비스 출시 일정이 갈리는 단위

리전은 단순히 "데이터센터가 있는 도시"가 아니다. **데이터 주권(sovereignty), 시간당 가격, 서비스 가용 시점, 컴플라이언스 인증, 그리고 컨트롤 플레인의 의존 관계**가 전부 리전 단위로 갈린다. 2025년 기준 AWS는 전 세계 34개 상용 리전을 운영하며(이외에 GovCloud 2개, 중국 2개, Secret 1개 별도), 각 리전은 최소 3개의 가용 영역(AZ)을 가진다. 신규 리전 출시는 보통 "원전 한 기를 짓는 것과 비슷한 자본 결정"이라 불릴 만큼 길게 본다(평균 2~3년).

운영자 입장에서 리전을 고를 때 봐야 할 차원은 다섯 가지다.

| 차원 | 운영자 고려사항 |
|------|-----------------|
| **지연시간** | 최종 사용자 ↔ 리전 RTT. CloudPing.info, Route 53 latency record, Global Accelerator dashboard로 측정 |
| **서비스 가용성** | 신규 서비스는 us-east-1 → 다른 리전 순서로 출시(보통 6개월~1년 차이). 출시 일정은 `aws.amazon.com/about-aws/global-infrastructure/regional-product-services/` 비교표 |
| **가격** | 같은 EC2도 리전별 단가가 다름. 서울이 버지니아보다 보통 10-20% 비쌈. 단 Data Transfer Out도 리전별로 다르고 같은 리전 내 AZ 간 전송도 GB당 \$0.01/방향 발생 |
| **컴플라이언스** | GDPR(EU 리전), K-ISMS(서울), PCI-DSS, HIPAA, FedRAMP, IRAP 등 규제별 인증 리전이 다름. AWS Artifact에서 리전별 인증서 다운로드 |
| **데이터 주권** | 「개인정보 보호법」 28조의2(개인정보 국외 이전), GDPR Article 44, 중국 사이버보안법 37조 등은 특정 지역 외 반출을 제한 |

> 📚 **사례**: 2021년 12월 7일 us-east-1 장애. AWS 내부 네트워크 자동 스케일링 시스템이 폭주하면서 us-east-1 컨트롤 플레인(EC2 API, STS, IAM 콘솔, Cognito, Connect)이 9시간 가까이 마비됐다. 흥미로운 점은 **다른 리전의 EC2 인스턴스는 잘 돌아갔는데도** Netflix, Disney+, Slack, Robinhood, Ring(아마존 자회사 IoT)이 다 같이 죽었다는 것이다. 이유는 세 가지. 첫째, **STS의 글로벌 엔드포인트(sts.amazonaws.com)는 사실 us-east-1을 호출하는 alias**였다(현재는 region별 엔드포인트로 강제 가능하지만 SDK 기본값은 여전히 글로벌). 둘째, IAM 콘솔과 Route 53 컨트롤 플레인이 us-east-1에 있어 다른 리전 운영자도 "콘솔에 로그인 못 함"을 겪었다. 셋째, 많은 회사의 CI/CD 파이프라인이 us-east-1 ECR을 caching 없이 호출하고 있었다. [AWS 공식 회고](https://aws.amazon.com/message/12721/). 운영자 교훈: **글로벌 서비스라 적혀 있어도 internal에선 특정 리전에 묶여 있을 수 있다**. 이걸 모르고 "글로벌이니까 안전하겠지"라고 가정하면 사고 난다.

> 🔍 **더 깊이**: IAM, Route 53(public hosted zone), CloudFront, WAF(CloudFront 연결분), Organizations, AWS Account 자체는 "Global"이라고 표시되지만 내부적으로 컨트롤 플레인은 us-east-1에 있고, edge 또는 region별 데이터 플레인이 그 데이터를 캐시·복제하는 구조다. 즉 us-east-1이 죽으면 신규 IAM 사용자 생성·정책 변경·Route 53 레코드 변경 같은 **write 작업이 막힌다**. 반면 이미 발급된 IAM 자격증명으로 다른 리전 EC2를 호출하는 데이터 플레인 작업, 이미 배포된 Route 53 레코드의 DNS 응답, CloudFront 엣지의 캐시 응답은 살아남는다. 이걸 "controlplane/dataplane separation"이라고 하고, Werner Vogels(AWS CTO)가 매년 re:Invent 키노트에서 강조하는 핵심 아키텍처 원칙이다. SOA-C02 시나리오에서 "us-east-1 장애 시에도 운영을 이어가려면?" 같은 문제는 이 분리를 묻는 경우가 많다.

> 💡 **관련 이론**: 리전 간 격리는 **bulkhead pattern**(Michael Nygard, *Release It!*, 2007)의 가장 큰 스케일 구현이다. 한 칸이 침수돼도 배 전체가 가라앉지 않게 격벽을 두는 선박 설계처럼, 한 리전의 controlplane 장애가 다른 리전으로 전파되지 않게 명시적으로 격벽을 둔다. 또한 Google SRE Book(Beyer et al., 2016) 22장 "Addressing Cascading Failures"가 같은 원칙을 다룬다: "failure domain을 명확히 정의하고, 그 위에서 fault tolerance를 설계하라." AWS의 리전 격리는 그 failure domain을 지리적 수준까지 끌어올린 결과물이다.

## 가용 영역(AZ): 운영자의 첫 번째 격리 도구

AZ는 같은 리전 안에서 **물리적·논리적으로 독립된 1개 이상의 데이터센터 묶음**이다. AZ 간에는 1~2ms 이내의 저지연 광섬유로 연결돼 동기 복제(synchronous replication)가 가능하지만, 한 AZ의 전력·냉방·네트워크 장애가 다른 AZ로 번지지 않을 정도로 분리돼 있다(보통 수 km~수십 km, 토네이도·홍수의 영향 반경 밖). 같은 AZ 안의 DC들끼리도 별도 전력·냉방을 쓰며, 각 DC는 디젤 발전기 + UPS + 이중 전력 그리드로 N+1 redundancy를 갖춘다.

운영자 관점에서 AZ를 다루는 세 가지 원칙:

1. **모든 stateful 리소스는 최소 2개 AZ에 분산**: RDS Multi-AZ, Aurora cluster(3 AZ 자동 분산), ElastiCache replication group, MSK broker, OpenSearch domain
2. **모든 stateless 워크로드는 ASG의 AZ 균등 분산**: ASG의 `AvailabilityZones` 파라미터에 3개 이상 지정 + `AZRebalance` 활성화
3. **운영 자체도 AZ에 묶이지 않게**: bastion, 점프 호스트, NAT GW, ALB target group, ECS service 모두 AZ별 배치

```
[리전: ap-northeast-2 (서울)]
   │
   ├─ AZ-a (apne2-az1)  ┐
   ├─ AZ-b (apne2-az2)  ├─ 동기 복제 가능 (RTT 1-2ms)
   ├─ AZ-c (apne2-az3)  │  Multi-AZ RDS / ASG 분산 / NLB Cross-Zone
   └─ AZ-d (apne2-az4)  ┘  Aurora cluster 자동 6-way 복제
```

> ⚠️ **함정**: NAT Gateway는 AZ 단위 리소스다. AZ-a의 NAT GW가 죽으면 AZ-a의 private subnet은 인터넷이 안 된다. 비용 절약한답시고 1개 AZ에만 NAT GW를 만들면 운영자가 가장 자주 만나는 단일 장애점이 된다. **AZ당 1개 NAT GW** 가 정석이고, 그래야 한 AZ 장애 시 다른 AZ private subnet은 정상이다. 같은 이유로 **NAT Instance(EC2 기반 NAT) 시절에는 ASG로 자가 치유를 직접 구성**했어야 했다. NAT GW는 그걸 AWS가 대신해주는 관리형 서비스. 또 다른 함정은 VPC Endpoint를 안 만들어 두면 S3·DynamoDB 트래픽까지 NAT GW를 거치며 GB당 \$0.045 데이터 처리 요금이 붙는다는 것. Gateway Endpoint(S3/DynamoDB)는 무료이므로 켜는 게 정석.

> 🔍 **더 깊이**: AZ 간 트래픽은 **AWS 백본망 위에서 자동 암호화**된다(2022년부터 모든 신규 EC2 인스턴스 타입은 Nitro 기반이라 hardware-accelerated AEAD 암호화). 같은 AZ 안에서도 동일하다. 따라서 운영자가 application-level에서 TLS를 안 걸어도 wire상으로는 평문이 흐르지 않는다. 단, 컴플라이언스 감사(PCI-DSS, HIPAA)는 application-layer 암호화를 별도로 요구하는 경우가 많아 양쪽 다 거는 것이 표준이다.

> 💡 **관련 이론**: AZ 격리 설계는 **failure domain isolation**이라는 분산 시스템 원칙의 구현이다. Google의 "Borg" 논문(Verma et al., 2015 EuroSys)이나 Microsoft의 "Service Fabric" 백서에서도 같은 개념이 나온다. 핵심은 "장애가 전파되는 최소 단위를 명확히 정의하고, 그 위에서 복제·페일오버를 설계"하는 것. AWS의 AZ는 그 최소 단위를 물리 데이터센터 수준으로 끌어올린 결과물이다. CAP 정리(Brewer 2000, Gilbert & Lynch 2002)에서 보면 같은 리전 안의 Multi-AZ는 CP(Consistency + Partition tolerance)를, Cross-Region 비동기 복제는 AP를 선택한 trade-off다. PACELC(Abadi 2012)로 보면 AWS의 Multi-AZ는 "Partition이 없을 때는 latency를 위해 일부 consistency를 양보(PA/EL)"하는 시스템에 가깝다.

> 📚 **사례**: 2019년 8월 23일 도쿄 리전 AZ 장애. ap-northeast-1의 한 AZ에서 냉방 시스템 제어 소프트웨어 버그로 일부 서버가 과열되며 EC2·EBS가 영향받았다. 당시 **ASG로 multi-AZ 분산을 해둔 워크로드는 살아남았고, 단일 AZ에 묶어둔 곳은 모두 다운**됐다. RDS Single-AZ로 운영하던 회사들은 DB까지 같이 죽어 복구에 수 시간이 걸렸다. AWS는 이 사건 후 "AZ 단위 maintenance event"를 PHD로 더 적극적으로 공지하기 시작했다.

## ZoneId vs ZoneName: 운영자만 아는 함정

`describe-availability-zones`를 호출하면 두 식별자가 나온다.

```bash
aws ec2 describe-availability-zones --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId]' --output table
```

```
+-------------------+-----------+
| ap-northeast-2a   | apne2-az1 |
| ap-northeast-2b   | apne2-az2 |
| ap-northeast-2c   | apne2-az3 |
| ap-northeast-2d   | apne2-az4 |
+-------------------+-----------+
```

**ZoneName은 계정별로 셔플된다.** 즉 우리 계정의 `ap-northeast-2a`와 협력사 계정의 `ap-northeast-2a`는 다른 물리 AZ일 수 있다. 반면 **ZoneId(apne2-az1)는 모든 계정에서 동일**하다. 왜 셔플할까. AWS가 모든 계정에 "a 영역에 먼저 만드세요"라고 했을 때 모든 트래픽이 a로만 쏠리는 걸 막기 위해서다. 트래픽 분산을 강제하는 묘수다.

이게 왜 운영자에게 중요한가. **VPC Peering이나 PrivateLink로 다른 계정과 연결**할 때 "같은 AZ에 배치해서 cross-AZ 비용·latency를 아끼자"라면 반드시 ZoneId로 맞춰야 한다. ZoneName만 보고 매칭하면 실제로는 다른 물리 AZ에 붙어 latency가 1ms 더 늘고 데이터 전송 비용이 발생한다. SOA-C02 시나리오 문제에서 "두 계정 간 cross-AZ 비용을 줄이려면?" 같은 문제는 이 ZoneId 매칭을 묻는다.

## 엣지·특수 인프라: 운영자가 알아야 할 4가지

운영자 시험에서 엣지 인프라는 보통 "이 시나리오에서 latency를 줄이려면?" 또는 "어디서 WAF 룰을 적용해야 하느냐?" 같은 형태로 나온다.

| 인프라 | 위치 | 주요 서비스 | 운영자 사용 시점 |
|--------|------|-------------|------------------|
| **Edge Location** | 600+ PoP | CloudFront, Route 53, WAF, Shield, Global Accelerator | 정적·동적 콘텐츠 캐싱, DNS, DDoS 방어 |
| **Regional Edge Cache** | 13개 | CloudFront 2차 캐시, Lambda@Edge | 오리진 부하 감소 |
| **Local Zones** | 30+ 도시 | EC2, EBS, ECS, RDS(일부) | 10ms 미만 초저지연 워크로드(게임, VFX, AR/VR) |
| **Wavelength** | 통신사 5G | EC2, EBS | 모바일 5G 단말 직결(자율주행, 산업 IoT) |
| **Outposts** | 고객 DC | EC2, EBS, S3, RDS, EKS | 데이터 주권·하이브리드(금융, 의료, 정부) |

> 📚 **사례**: 2020년 코로나로 인한 트래픽 폭증 당시, Netflix는 ISP 망 안에 직접 설치된 **Open Connect Appliance(OCA)** 덕분에 트래픽이 ISP backbone을 거의 타지 않았다. AWS도 비슷한 개념으로 **CloudFront 엣지가 ISP 망과 직접 peering**한다(서울에는 KT, LG U+, SKB 모두 직결). 운영자가 CloudFront를 켜는 것만으로 사용자 ↔ origin 트래픽이 ISP backbone을 우회하게 되는 이유다. 동시에 origin shield(2020년 GA)는 모든 엣지 캐시 미스를 단일 Regional Edge Cache로 집결시켜 origin 부하를 또 한 단계 줄인다.

> 🔍 **더 깊이**: CloudFront Functions와 Lambda@Edge는 둘 다 엣지에서 동작하지만 위치가 다르다. **CloudFront Functions**는 600+ 엣지 PoP에서 직접 실행되고 100μs 미만의 콜드 스타트로 응답하지만, 메모리 2MB·실행 시간 1ms·JavaScript ES5만이라는 제약이 있다. **Lambda@Edge**는 13개 Regional Edge Cache에서 실행되며 Node.js·Python 런타임 전체를 쓸 수 있지만 콜드 스타트가 수십 ms 단위다. SOA-C02에서 "URL rewrite, header manipulation은?" → CloudFront Functions, "이미지 리사이즈, 토큰 검증은?" → Lambda@Edge로 답하면 거의 맞는다.

## 공동 책임 모델: 운영자 시점에서 다시 그리기

**AWS = Security OF the Cloud / Customer = Security IN the Cloud**. 이 한 줄은 모두가 외우지만, 운영자가 실제로 "내 책임 영역"에서 매일 해야 하는 일이 뭔지 정리해보면 시험 시나리오를 푸는 감각이 달라진다.

운영자가 실제로 매일·매주·매분기 해야 하는 일:

| 주기 | 작업 | 도구 |
|------|------|------|
| 매일 | CloudWatch alarm 확인, 비용 이상치 확인 | CloudWatch, Cost Anomaly Detection |
| 매주 | IAM 권한 검토(Last Accessed), 보안 그룹 룰 검토 | Access Analyzer, Credential Report |
| 매월 | OS 패치 적용, KMS 키 로테이션 검토 | SSM Patch Manager, KMS |
| 매분기 | 백업 복원 훈련, DR 시뮬레이션 | AWS Backup, Route 53 ARC |
| 연 1회 | 보안 감사, 컴플라이언스 인증 갱신 | Audit Manager, Artifact |

> 📚 **사례**: 2019년 7월 Capital One 사건. 1억 600만 명 카드 신청 데이터 유출. 원인은 AWS 인프라가 아니라 **고객 WAF의 SSRF 취약점 + EC2 메타데이터 v1(IMDSv1)의 IAM 자격증명 노출 + 너무 광범위한 IAM 역할 권한**이었다. 공격자(전직 AWS 직원 Paige Thompson)는 `http://169.254.169.254/latest/meta-data/iam/security-credentials/`에 SSRF로 접근해 임시 자격증명을 탈취하고 S3 버킷 700개 이상에서 30TB의 데이터를 빼냈다. **AWS 책임 영역에선 문제가 없었지만 고객 책임 영역(WAF 설정, IAM 권한 범위, IMDSv1 사용)에서 사고**가 났다는 점이 핵심. [DOJ 공소장](https://www.justice.gov/usao-edva/press-release/file/1188626/download). AWS는 이 사건 직후(2019년 11월) IMDSv2(세션 토큰 기반)를 출시했고, 운영자는 신규 EC2부터 `HttpTokens=required`를 강제 적용하는 게 표준이 됐다. Capital One은 \$1.9억 벌금을 OCC에 납부했다.

> 🔍 **더 깊이**: IMDSv2의 강제는 SSM Document `AWS-EnforceEC2InstanceMetadataServiceV2`나 Launch Template의 `MetadataOptions.HttpTokens=required`로 한다. 더 강하게는 SCP로 `RunInstances`에 `aws:RequestTag/MetadataV2=required` 조건을 강제하거나, Config rule `ec2-imdsv2-check`로 비준수 인스턴스를 탐지한다. 그리고 **hop limit 1**을 같이 설정하면 컨테이너 outside로 메타데이터 트래픽이 못 나간다(Docker 기본 bridge 네트워크의 docker0 인터페이스를 못 건너감). 운영자가 실수로 IMDSv1로 인스턴스를 띄우는 걸 막는 3중 방어 패턴이다.

> ⚠️ **함정**: "관리형 서비스이므로 보안도 AWS가 책임진다"는 함정. Lambda나 RDS를 써도 **데이터 분류, IAM 권한, 암호화 키 정책, 네트워크 접근 제어, 백업 정책**은 항상 고객 책임이다. RDS의 OS·DB 엔진 패치는 AWS가 하지만, 그 패치를 적용할 Maintenance Window를 정하는 것, 그 시간 동안 트래픽 처리 계획을 세우는 것, Standby로 페일오버해도 클라이언트 connection pool이 재연결되는지 확인하는 것은 운영자 몫. 또 RDS Snapshot은 기본 retention 1~35일이라 그 이상 보관하려면 따로 export해야 한다는 점도 자주 놓친다.

> 💡 **관련 이론**: 공동 책임 모델은 NIST SP 800-145의 클라우드 서비스 모델(IaaS / PaaS / SaaS) 분류와 정확히 맞물린다. NIST CSF(Cybersecurity Framework)의 5개 함수(Identify, Protect, Detect, Respond, Recover) 중 Identify·Protect는 거의 고객 영역에 남는다. ISO 27017(클라우드 보안)과 ISO 27018(클라우드 개인정보)도 이 모델 위에 책임 영역을 명문화한다. 한국에서는 KISA의 「클라우드 보안 가이드」(2023 개정판)가 같은 분할을 따르며, K-ISMS-P 인증 심사 시 이 책임 분할표를 제출해야 한다.

## 운영자의 첫 번째 도구: AWS Health Dashboard

us-east-1 장애가 났는지 어떻게 가장 빨리 아는가? Twitter 검색? Downdetector? 동료 슬랙? 모두 빠르지만 신뢰성은 낮다. 운영자의 표준 답은 **AWS Health Dashboard**와 **AWS Health API**다.

Health는 두 레이어로 나뉜다.

- **Service Health Dashboard (health.aws.amazon.com/health/status)**: 모든 사용자에게 동일하게 보이는 리전·서비스 단위 공지. 보통 1-30분 지연. AWS가 "고객에게 영향 있다"고 판단한 시점에 갱신
- **Personal Health Dashboard (PHD) / AWS Health API**: **내 계정 리소스에 영향이 있는** 이벤트만 필터링. EC2 인스턴스 재시작 예정, EBS 볼륨 상태 이상, RDS 유지보수 예고, Certificate Manager 만료 임박이 여기 뜸. 일반적으로 SHD보다 먼저 뜸

운영자는 PHD 이벤트를 EventBridge로 받아 자동화에 연결한다.

```bash
# Health API로 진행 중인 이벤트 조회
aws health describe-events \
  --filter "eventStatusCodes=open,upcoming" \
  --region us-east-1

# Organization 전체 이벤트(관리 계정에서)
aws health describe-events-for-organization \
  --filter "eventStatusCodes=open"
```

> 🔍 **더 깊이**: AWS Health API는 us-east-1과 us-west-2 두 곳에서만 호스팅되며 **자동 페일오버**한다. us-east-1이 죽으면 SDK가 자동으로 us-west-2 endpoint로 재시도한다(2023년부터 SDK에 내장). EventBridge에서 Health 이벤트를 받으려면 `aws.health` source 룰을 us-east-1과 us-west-2 양쪽에 만들어 둬야 빠짐없이 받는다. Organization 단위로 보려면 **AWS Health Organizational View**를 켜야 하고, 이건 management account의 service-linked role(`AWSServiceRoleForHealth_Organizations`)이 필요하다. Health 이벤트를 ServiceNow나 PagerDuty로 보내는 것도 EventBridge → SNS → 외부 webhook 패턴이 표준.

## 시험에 자주 나오는 운영자 시나리오 패턴

SOA-C02는 추상적인 개념보다 **상황 → 어떤 도구로 어떻게 대응?** 패턴이다. 그래서 이 책 전체에서 같은 사고 흐름을 반복할 것이다.

```
[증상]                          [1차 점검]            [2차 점검]
─────────────────────────────────────────────────────────────────
EC2 응답 없음                → CloudWatch metric  → EC2 status check
RDS 쓰기 실패                → RDS 이벤트         → CloudWatch RDS logs
S3 403                       → CloudTrail        → Bucket Policy / IAM
Lambda 타임아웃              → CloudWatch Logs   → X-Ray
비용 급증                    → Cost Explorer     → CloudTrail (writes)
배포 후 장애                 → Deploy 이력       → Config Timeline
보안 사고 의심               → GuardDuty         → CloudTrail Lake
규모 자동 미발생             → ASG activity      → Scaling policy + metric
```

이 표가 운영자 사고 흐름의 기본 골격이다. Week 2부터 각 서비스를 깊이 파면서 이 패턴이 살이 붙어간다. 시험에서 "어떤 도구를 먼저 봐야 하느냐"고 묻는 문제가 나오면 이 표가 답이다.

## 정리하며

오늘 본 그림은 두 개다. 첫째, AWS 인프라는 **Region > AZ > Edge**라는 3층 격리 위에 만들어졌고, 운영자는 어떤 리소스를 어느 층에 배치할지 매일 결정한다. 둘째, 보안과 운영 책임은 **AWS는 하드웨어부터 하이퍼바이저까지, 그 위는 고객**이라는 명확한 경계로 나뉘고, 운영자의 일상은 그 "위" 영역에서 일어난다. Capital One 사건이 보여주듯, AWS가 일을 잘하고 있는데도 우리가 SG·IAM·IMDSv1을 잘못 설정하면 1억 6백만 명의 데이터가 새는 게 클라우드 운영의 현실이다.

내일은 그 위 영역 중에서도 가장 자주 깨지고 가장 자주 사고의 원인이 되는 **IAM**으로 들어간다. Capital One 사건의 원인이 결국 IAM의 권한 범위 + IMDSv1이었듯, 운영자가 안 보고 있다가 사고 나는 곳 1순위가 여기다.

---

## 📝 연습 문제

**문제 1.** SysOps 운영자가 us-east-1 장애 중에도 다른 리전에서 IAM 권한을 변경하고 Route 53 레코드를 수정하려고 한다. 이 운영이 가능한가?

A) 가능. IAM과 Route 53은 글로벌 서비스이므로 어떤 리전 장애와도 무관하다
B) 가능. 단, AWS CLI에 `--region`을 명시해야 한다
C) 불가능. IAM·Route 53의 컨트롤 플레인은 us-east-1에 위치하므로 write 작업이 막힐 수 있다
D) 가능. 단, CloudFront 캐시가 만료될 때까지 기다려야 한다

**정답: C**
해설: IAM, Route 53(public zone), CloudFront, Organizations 같은 "Global" 표시 서비스도 컨트롤 플레인은 us-east-1에 있다. us-east-1 장애 시 IAM 사용자 생성, Route 53 레코드 수정 같은 write 작업이 막힐 수 있다. read 작업과 이미 발급된 자격증명을 이용한 데이터 플레인 호출은 살아남는다. 2021년 12월 장애가 이 구조를 명확히 보여줬다. 운영자가 "글로벌이라 안전"이라 가정하면 사고가 난다.

---

**문제 2.** 운영자가 비용 절감을 위해 한 VPC의 모든 private subnet이 한 AZ의 NAT Gateway 하나만 사용하도록 설정했다. 이 설계의 문제는?

A) NAT GW는 글로벌 리소스이므로 문제없다
B) AZ-a의 NAT GW가 죽으면 다른 AZ private subnet도 인터넷이 안 된다
C) AZ-a의 NAT GW가 죽으면 AZ-a private subnet의 인터넷만 안 된다
D) NAT GW는 자동으로 다른 AZ로 페일오버하므로 문제없다

**정답: B**
해설: NAT GW는 AZ 단위 리소스고 자동 페일오버가 없다. 다른 AZ의 private subnet 라우팅 테이블이 AZ-a의 NAT GW를 가리키고 있으면, AZ-a NAT GW 장애 시 AZ-b·AZ-c의 트래픽도 막힌다. 정석은 **AZ당 1개 NAT GW + 각 private subnet의 라우팅 테이블이 자기 AZ NAT GW를 가리키게** 설정. 비용이 부담되면 Fck-NAT 같은 NAT Instance 자가 호스팅으로 GB당 \$0.045 처리비를 줄이는 선택지도 있지만, 운영 부담이 따라온다.

---

**문제 3.** 다음 중 "고객 책임 영역"에 해당하지 않는 것은?

A) IAM 역할의 권한 범위 최소화
B) Lambda 런타임(Python 3.12) 보안 패치 적용
C) RDS 인스턴스로 가는 보안 그룹 룰 설정
D) Lambda 함수 코드의 취약점 점검

**정답: B**
해설: Lambda 런타임 자체의 보안 패치는 AWS 책임이다. 단, 런타임이 deprecated될 때 새 버전으로 마이그레이션하는 건 고객 책임. 나머지 셋은 전부 고객 책임. RDS의 경우 OS·DB 엔진 패치는 AWS, 그 패치를 언제 적용할지 Maintenance Window를 결정하는 건 고객.

---

**문제 4.** 한 운영팀이 EC2 인스턴스의 메타데이터를 통한 자격증명 탈취(SSRF)를 막으려고 한다. 가장 효과적인 조합은?

A) SG에서 169.254.169.254 차단
B) IMDSv2 강제 + hop limit 1 + Config rule `ec2-imdsv2-check`
C) IAM 역할을 인스턴스에 붙이지 않음
D) NACL에서 메타데이터 IP 차단

**정답: B**
해설: 169.254.169.254는 link-local 주소라 SG·NACL로 막을 수 없다(link-local은 라우팅 테이블이 아닌 hypervisor 레벨에서 처리). IMDSv2는 PUT으로 세션 토큰을 받아야 하는데 SSRF는 보통 GET만 가능. hop limit 1로 컨테이너 outside로 누출 차단. Config rule로 비준수 인스턴스 자동 탐지. IAM 역할을 안 붙이면 SDK가 작동을 못 해 비현실적.

---

**문제 5.** AWS Health 이벤트를 EventBridge로 받아 자동화하려고 한다. 빠짐없이 받기 위한 운영자의 표준 패턴은?

A) us-east-1 한 곳에만 룰을 생성
B) 모든 리전에 룰을 생성
C) us-east-1과 us-west-2 양쪽에 룰을 생성
D) Personal Health Dashboard만 켜면 자동으로 받아진다

**정답: C**
해설: AWS Health API는 us-east-1과 us-west-2 두 곳에서 active-active로 운영되며 자동 페일오버한다. 두 리전 모두에 EventBridge 룰을 만들어야 누락이 없다. Organization 전체를 보려면 management account에서 Organizational View도 켜야 한다.

---

**문제 6.** 두 AWS 계정 간 cross-AZ 데이터 전송 비용(GB당 \$0.01 × 2)을 최소화하기 위해 같은 AZ에 EC2를 배치하려고 한다. 정확한 방법은?

A) 두 계정 모두에서 `ap-northeast-2a`를 선택한다
B) ZoneId(예: `apne2-az1`)를 양쪽에서 동일하게 맞춘다
C) 두 계정을 같은 Organization에 두면 자동 매칭된다
D) AWS Resource Access Manager로 AZ를 공유한다

**정답: B**
해설: ZoneName(예: `ap-northeast-2a`)은 계정별로 셔플되므로 두 계정의 `2a`가 같은 물리 AZ가 아닐 수 있다. **ZoneId(`apne2-az1`)는 모든 계정에서 동일**하므로 ZoneId로 매칭해야 cross-AZ 비용을 피한다. `describe-availability-zones`에서 두 값을 모두 확인할 수 있다.
