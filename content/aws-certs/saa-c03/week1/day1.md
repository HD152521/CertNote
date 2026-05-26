# Day 1 - AWS 인프라의 지도: 리전, AZ, 그리고 공동 책임이라는 약속

처음 AWS 콘솔을 열면 우측 상단에 "Seoul" 같은 리전 셀렉터가 박혀 있고, 어떤 서비스는 "Global"이라고 적혀 있는데 다른 서비스는 리전을 골라야만 동작한다. 둘의 차이가 뭔지 한 번이라도 막혔다면, 그게 바로 솔루션 아키텍트가 답해야 할 첫 질문이다.

이 글에서는 AWS의 글로벌 인프라가 어떻게 쌓여 있는지 그 물리적 지도를 그려보고, 그 위에서 "AWS 책임"과 "내 책임"이 어디서 갈리는지를 정리한다. 시험을 위한 키워드 외우기가 아니라, 새벽 3시에 us-east-1이 죽었을 때 우리 서비스가 왜 살아남았는지(또는 안 살아남았는지)를 진짜로 이해하는 것이 목표다. 그 이해가 쌓이면 시험 문제는 자연스럽게 따라온다.

## 리전은 단순한 "지역"이 아니다 — 데이터센터의 클러스터

AWS의 리전(Region)을 "데이터센터가 있는 도시 이름"으로만 이해하면 절반만 본 것이다. 각 리전은 **3개 이상의 가용 영역(AZ)으로 구성된 격리된 인프라 단위**이고, 각 AZ는 다시 1개 이상의 물리적 데이터센터(DC)로 이뤄진다. 즉 `ap-northeast-2`(서울)는 단일 건물이 아니라 4개의 AZ에 분산된 수십 개의 데이터센터 네트워크다.

왜 이렇게 설계됐을까. 2006년 S3가 처음 출시될 때 AWS는 단 하나의 리전(나중에 `us-east-1`으로 명명된 버지니아 북부)으로 시작했다. 당시엔 "리전"이라는 개념조차 모호했고, AZ는 그저 같은 시설 안의 다른 랙이었다. 그런데 2011년 4월 21일, us-east-1에서 EBS 네트워크 장애가 발생해 Reddit, Quora, Foursquare가 며칠간 다운된 사건이 벌어진다. 이 사건이 AWS에게 "물리적 격리"라는 개념을 강제했고, 이후 모든 리전은 **독립된 전력·냉방·네트워크를 가진 AZ가 최소 3개 이상**이라는 원칙 위에 지어진다.

| 구성 요소 | 개수(2025 기준) | 설계 의미 |
|-----------|------|-----------|
| **Region** | 34개 | 데이터 주권 / 가격 / 서비스 가용성의 결정 단위 |
| **Availability Zone (AZ)** | 리전당 3개 이상 | 물리적 격리. HA 설계의 최소 단위 |
| **Edge Location** | 600+ | CloudFront / Route 53 / Global Accelerator |
| **Local Zones** | 30+ | 1-2ms 이내 초저지연 (게임, 미디어, ML 추론) |
| **Wavelength Zone** | 통신사 5G 엣지 | 모바일 5G 디바이스용 |
| **Outposts** | 고객 데이터센터 | 온프레미스 규제 / 하이브리드 |

> 📚 **사례**: 2017년 2월 28일 오전 9시 37분(태평양 시간), S3 us-east-1에서 운영자가 빌링 시스템 디버깅 중 명령어에 타이포를 내며 의도보다 훨씬 많은 서버를 한꺼번에 정지시킨 사건이 있다. 그 결과 인덱스 서브시스템이 완전 재시작에 들어갔고, 4시간 동안 Stripe, Slack, Trello, IFTTT, Coursera, Quora 등이 다운됐다. AWS Status Page 자체도 S3를 의존하고 있어서 "지금 장애 났는데 장애 페이지에는 초록불"인 상황까지 벌어졌다. 단일 리전 의존이 어떻게 인터넷 절반을 흔드는지를 보여준 사건. [AWS 공식 회고](https://aws.amazon.com/message/41926/).

## 가용 영역의 진짜 의미: 격리(Isolation)와 동기 복제의 경계

AZ를 "데이터센터 하나"라고 단순히 이해하면 시험 문제도 틀리고 실무에서도 큰 사고를 낸다. AZ는 **물리적으로 독립된 1개 이상의 DC 집합**이고, 같은 AZ 안의 DC들끼리도 별도 전력·냉방을 쓴다. AZ 간에는 평균 60μs ~ 2ms의 저지연 전용 광섬유로 묶여 있어서 동기 복제(synchronous replication)가 가능한 정도지만, 한 AZ의 화재나 정전이 다른 AZ로 번지지 않을 정도로는 떨어져 있다(보통 수 km ~ 수십 km).

> 🔍 **더 깊이**: AZ 간 latency가 보통 1-2ms라는 사실은 RDS Multi-AZ 설계의 핵심 제약이다. RDS Multi-AZ는 Primary와 Standby 사이에서 **synchronous physical replication**을 한다. 즉 클라이언트가 commit을 받으려면 Primary가 Standby에서 write ack를 받을 때까지 기다린다. AZ 간 RTT가 1-2ms라면 한 트랜잭션당 추가 latency가 그 정도로 끝나지만, 만약 리전 간(예: 서울 ↔ 도쿄, RTT 약 35ms)에 동기 복제를 시도하면 OLTP 워크로드는 사실상 불가능해진다. 이게 "리전 간 복제는 asynchronous(예: Aurora Global Database, RDS Cross-Region Read Replica)"가 기본인 이유다.

> 💡 **관련 이론**: 이 트레이드오프는 분산 시스템의 CAP 정리(Brewer, 2000 PODC keynote; Gilbert & Lynch, 2002 SIGACT News에서 형식화)와 직결된다. Multi-AZ는 "같은 리전 안에서는 CP(Consistency + Partition tolerance)를 선택하되, 리전 간에는 AP(Availability + Partition tolerance)를 선택"하는 명시적인 trade-off다. Aurora Global Database가 리전 간 ~1초 RPO를 약속하면서도 "쓰기는 primary 리전에서만"이라는 제약을 두는 이유가 여기 있다. 또한 PACELC 정리(Abadi, 2012)로 보면 AWS는 "네트워크 분할이 없을 때에도 latency를 위해 consistency를 일부 양보"하는 PA/EL 시스템에 가깝다.

```
                    [ AWS Global Infrastructure ]
                              |
        +---------------------+---------------------+
        |                     |                     |
   [Region: ap-northeast-2 (Seoul)]            [Region: us-east-1]
        |
   +----+----+----+----+
   |    |    |    |
  AZ-a AZ-b AZ-c AZ-d
   |    |    |    |
  DCs  DCs  DCs  DCs  ← 각 AZ는 1개 이상의 물리 DC
                       ← 각 DC는 독립 전력·네트워크
   동기 복제 가능 (1-2ms RTT)
```

다른 클라우드의 격리 모델과 비교해보면 AWS의 설계 철학이 더 잘 보인다.

| 차원 | AWS | GCP | Azure |
|------|-----|-----|-------|
| 지리적 위치 | Region | Region | Geography |
| 격리 단위 | **Availability Zone** (3+ per region) | **Zone** (보통 3 per region) | **Availability Zone** (일부 리전만 3개 보장) |
| 광역 그룹 | (없음) | (없음) | Region Pair (자동 페어링) |
| AZ 명명 | 계정별 매핑 (`ap-northeast-2a` ≠ 옆 계정의 `ap-northeast-2a`) | 모든 계정 동일 (`us-central1-a`) | 일부 리전 숫자 매핑 (`1`, `2`, `3`) |
| 단일 DC API | (제한적) Outposts, Local Zones | (없음) | Availability Set (랙 단위 격리) |

AWS가 AZ를 계정별로 다른 물리 AZ에 매핑하는 이유는 **트래픽 분산**이다. 만약 모든 고객이 "a 영역에 먼저 만들자"고 하면 a로만 부하가 쏠리므로, 계정마다 의도적으로 셔플한다. 그래서 두 계정 간 같은 AZ에 리소스를 두려면 `ZoneName`이 아니라 `ZoneId`(예: `apne2-az1`)를 비교해야 한다.

> ⚠️ **함정**: "AZ는 곧 데이터센터 한 곳"이라는 보기가 시험에 자주 나온다. 틀렸다. AZ는 1개 이상의 DC를 묶은 논리적 격리 단위다. 또 자주 나오는 함정이 ZoneName vs ZoneId. 회사 간 VPC 피어링이나 PrivateLink를 설계할 때 AZ 이름만 보고 매칭하면 실제로는 다른 물리 AZ에 붙어 비용·latency가 튀는 일이 흔하다.

> 📚 **사례**: 2019년 8월 23일, AWS 도쿄 리전(`ap-northeast-1`)의 한 AZ에서 냉방 시스템 제어 소프트웨어 버그로 인해 일부 서버가 과열되며 EC2와 EBS가 영향을 받았다. 이 사건의 교훈은 두 가지였다. 첫째, **Single-AZ 배포는 RDS·EBS도 동시에 죽는다**(스토리지가 한 AZ에 묶여 있기 때문). 둘째, **Auto Scaling Group의 AZ 분산이 곧 보험**이다. 당시 ASG에서 multi-AZ로 설정된 워크로드는 살아남았고, 단일 AZ로 묶어둔 곳들은 모두 다운됐다.

## 엣지 로케이션: 콘텐츠 캐시 그 너머

엣지 로케이션은 단순한 CDN 캐시 지점이 아니다. AWS는 600개가 넘는 엣지 PoP(Point of Presence)를 통해 4가지 다른 일을 한다.

1. **CloudFront**: HTTP/HTTPS 정적·동적 콘텐츠 캐싱. TLS termination도 여기서.
2. **Route 53**: 글로벌 DNS의 권위 응답을 엣지에서 처리.
3. **Global Accelerator**: TCP/UDP 트래픽을 가장 가까운 엣지로 끌어들여 AWS 백본망으로 전달. Anycast IP 2개 제공.
4. **AWS WAF / Shield**: 엣지에서 DDoS·악성 트래픽 필터링.

CloudFront와 Global Accelerator가 자주 헷갈리는데, 본질적으로 동작 레이어가 다르다. CloudFront는 **OSI L7(HTTP 의미를 알고 캐싱)**, Global Accelerator는 **OSI L4(TCP/UDP 패킷 자체를 가속)**. 그래서 게임 서버, MQTT, VoIP, WebRTC 시그널링 같은 비-HTTP 트래픽이 보이면 거의 무조건 Global Accelerator다.

> 🔍 **더 깊이**: CloudFront Functions와 Lambda@Edge는 둘 다 엣지에서 동작하지만 위치가 다르다. **CloudFront Functions**는 600+ 엣지 PoP에서 직접 실행되고 100μs 미만의 콜드 스타트로 응답하지만, 메모리 2MB·실행 시간 1ms 제약이 있다. **Lambda@Edge**는 13개의 Regional Edge Cache에서 실행되며 Node.js·Python 런타임 전체를 쓸 수 있지만 콜드 스타트가 수십 ms 단위다. 이 둘의 차이는 "엣지에서 어디까지 무거운 로직을 돌릴 수 있는가"의 trade-off를 보여준다.

> 💡 **관련 이론**: Global Accelerator가 제공하는 정적 Anycast IP는 BGP Anycast 기반이다. 같은 IP를 여러 엣지에서 광고하면, 클라이언트의 ISP는 BGP의 best-path 알고리즘(AS_PATH 길이, local preference 등)에 따라 가장 가까운 엣지로 라우팅한다. 이 구조 덕분에 DNS TTL을 기다릴 필요 없이 **수 초 안에 트래픽 재라우팅**이 가능하다. Route 53 기반 페일오버는 DNS 캐시 TTL 때문에 분 단위가 걸리는 것과 대비된다.

## 특수 인프라: Outposts, Local Zones, Wavelength의 진짜 용도

이 세 가지는 시험에서 키워드로 구별하면 빠르지만, 왜 이런 게 존재하는지를 이해하면 헷갈릴 일이 없다.

**Outposts**는 AWS 하드웨어 랙을 그대로 고객 데이터센터에 가져다 놓는 서비스다. 왜 필요할까. 한국의 금융권은 「전자금융감독규정」 14조에 의해 일부 데이터를 국내 자체 시설에 보관해야 하고, 유럽은 GDPR Schrems II 판결(2020년 EU 법원)로 미국 클라우드 사용에 제약이 생겼다. 이런 규제 환경에서는 "데이터는 우리 건물 안", 그러면서도 "AWS API로 운영"하고 싶다. 그 답이 Outposts다.

**Local Zones**은 큰 리전과 같은 백본망에 연결되지만 지리적으로는 주요 도시에 가까이 배치된 미니 리전이다. LA, 마이애미, 라스베이거스 같은 도시에 있고, EC2·EBS·ECS 정도의 기본 서비스만 제공한다. 영화 후반 작업(VFX), 클라우드 게임 스트리밍, AR/VR 같이 **지연 시간이 10ms를 넘으면 사용자가 즉시 체감하는** 워크로드를 위해 만들어졌다.

**Wavelength**는 통신사(Verizon, KDDI, Vodafone, SK Telecom 등) 5G 망 내부의 엣지 데이터센터다. 5G 핵심망(Core network)을 지나지 않고 기지국에서 곧바로 컴퓨팅 자원에 닿으므로, 자율주행 차량 인지 처리나 산업용 IoT 같은 "물리 세계와 직접 상호작용하는" 응용에 쓰인다.

> 💡 **암기 팁**: 본사 안 = O(utposts), 도시 = L(ocal Zones), 5G = W(avelength). 단, 시험에선 키워드보다 시나리오의 "지연 시간 요구치"와 "데이터 위치 제약"을 같이 봐야 한다.

## 공동 책임 모델: AWS와 고객 사이의 계약

클라우드를 처음 쓰는 사람의 가장 흔한 오해는 "AWS가 보안까지 다 알아서 해주는 거 아니야?"다. 실제로는 **AWS = Security OF the Cloud / Customer = Security IN the Cloud** 라는 명확한 분담이 있다. 콘크리트 바닥부터 하이퍼바이저까지는 AWS, 그 위는 고객 책임이라고 보면 거의 정확하다.

이 모델이 왜 필요한지부터 보자. 전통적인 온프레미스에서는 모든 게 고객 책임이었다(서버, 네트워크, OS, 앱 전부). SaaS에서는 거의 모든 게 벤더 책임이다(Gmail이 다운되면 Google 잘못). 클라우드는 그 중간이고, **어느 서비스를 쓰느냐에 따라 책임 경계선이 달라진다**. EC2(IaaS)는 OS부터 위가 고객, RDS(PaaS)는 DB 엔진 패치까지 AWS, Lambda나 S3 같은 완전 관리형은 더 위까지 AWS 책임이다.

```
관리형 ↑                                      AWS 책임 ↑
  ┌─────────────────────────────┐
  │ S3 / DynamoDB / Lambda      │  ← 데이터 분류, 권한만 고객 책임
  │ RDS / ECS Fargate           │  ← + 네트워크/방화벽 설정 고객
  │ ECS on EC2 / EKS Self       │  ← + 컨테이너 런타임, 노드 OS 패치 고객
  │ EC2 + EBS (IaaS)            │  ← OS·미들웨어·앱 전부 고객
  └─────────────────────────────┘
관리형 ↓                                      고객 책임 ↑
```

| 책임 영역 | AWS | 고객 |
|-----------|-----|------|
| 물리적 시설 / 하드웨어 | ✅ | - |
| 하이퍼바이저 / 호스트 OS | ✅ | - |
| 게스트 OS 패치 (EC2) | - | ✅ |
| 관리형 서비스 OS / 엔진 패치 (RDS/Lambda) | ✅ | - |
| 네트워크 트래픽 보호 (SG / NACL) | - | ✅ |
| 데이터 분류 / 암호화 키 정책 | - | ✅ |
| IAM 사용자 / 권한 / 정책 | - | ✅ |
| AZ 간 트래픽 암호화 (인프라) | ✅ | - |
| 애플리케이션 코드 취약점 | - | ✅ |

> 📚 **사례**: 2019년 7월, Capital One에서 1억 600만 명의 카드 발급 신청 데이터가 유출되는 사고가 발생했다. 범인은 전직 AWS 직원 Paige Thompson이었지만, 원인은 AWS 자체가 아니라 **Capital One이 운영하던 WAF의 SSRF 취약점 + EC2 인스턴스 메타데이터 서비스(IMDSv1)의 IAM 역할 노출**이었다. 공격자는 SSRF로 `http://169.254.169.254/latest/meta-data/iam/security-credentials/`에 접근해 임시 자격증명을 탈취했고, 그 자격증명으로 S3 버킷을 읽었다. AWS는 자기 인프라 책임을 다했지만, "고객 책임 영역"(WAF 설정, IAM 역할의 권한 범위, IMDSv1 사용)에서 사고가 났다. [DOJ 공소장 PDF](https://www.justice.gov/usao-edva/press-release/file/1188626/download). 이 사건의 직접적 결과로 AWS는 2019년 11월 **IMDSv2**(세션 토큰 기반)를 출시했다.

> 🔍 **더 깊이**: IMDSv2는 두 단계로 동작한다. ① `PUT /latest/api/token` 요청을 `X-aws-ec2-metadata-token-ttl-seconds` 헤더와 함께 보내 세션 토큰을 받음. ② 메타데이터 요청 시 `X-aws-ec2-metadata-token` 헤더로 토큰 제시. SSRF 공격자가 보통 HTTP GET만 가능하므로 PUT을 못 보내 토큰을 못 받고, 결과적으로 메타데이터 접근이 차단된다. 동시에 IMDSv2 요청은 IP TTL을 1(혹은 hop limit 1)로 강제해서, 인스턴스 안에서만 접근 가능하고 컨테이너 네트워크 outside로는 못 빠져나간다.

> 💡 **관련 이론**: 공동 책임 모델은 NIST SP 800-145의 클라우드 서비스 모델(IaaS / PaaS / SaaS) 분류와 정확히 맞물린다. NIST CSF(Cybersecurity Framework)의 5개 함수(Identify, Protect, Detect, Respond, Recover) 중 Identify와 Protect는 거의 고객 영역에 남는다. AWS는 그 위에서 도구(GuardDuty, Inspector, Macie 등)를 제공하지만, 이를 켜고 정책을 세우는 건 고객 몫이다. ISO 27017(클라우드 보안)과 ISO 27018(클라우드 개인정보)도 이 모델 위에 책임 영역을 명문화한다.

## Well-Architected Framework: 단순 체크리스트가 아니다

AWS는 좋은 클라우드 설계를 6개 기둥(Pillar)으로 정리해두었다. 2012년 사내 베스트 프랙티스 문서에서 시작해 2015년 외부에 공개됐고, 2021년 Sustainability가 추가되며 6개가 됐다.

1. **Operational Excellence (운영 우수성)** — IaC, 자동화, 변경 관리, 관찰성(observability)
2. **Security (보안)** — 최소 권한, 모든 계층 보안, 데이터 보호, 사고 대응
3. **Reliability (안정성)** — Self-healing, Multi-AZ, 분산, 백업·DR
4. **Performance Efficiency (성능 효율)** — Right-sizing, 글로벌화, 서버리스, 데이터 패턴
5. **Cost Optimization (비용 최적화)** — 적합한 가격 모델, 미사용 자원 제거, 측정 가능 비용
6. **Sustainability (지속 가능성)** — 탄소 발자국 최소화, 리전 선택, 효율적 워크로드

SAA 시험의 도메인 비중(설계 안정성·복원력 26%, 고성능 24%, 보안 30%, 비용 최적화 20%)과 거의 일치한다. 그래서 시나리오 문제에서 "어떤 답이 맞느냐"보다 "**이 시나리오가 어떤 Pillar를 묻는 거냐**"를 먼저 잡으면 답이 보인다. 예를 들어 "야간에만 사용하는 분석 잡"이라는 시나리오는 Cost Optimization을 묻는 거고, 답은 Spot이나 Scheduled Scaling 쪽이다. "한 AZ가 죽어도 서비스가 유지되어야 한다"면 Reliability를 묻는 것이고 답은 Multi-AZ·ASG·ELB 조합이다.

> 💡 **암기 팁**: 머리글자만 따서 **O-S-R-P-C-S**. 단 외우기보다 "**시나리오 키워드 → Pillar → 솔루션 패턴**"으로 매핑하는 연습이 더 중요하다.

## CLI로 직접 찍어보기 — 머리에 박는 가장 빠른 방법

말로만 외우면 잊어버린다. CLI로 한 번이라도 손으로 쳐보면 다르다.

```bash
# 1) 사용 가능한 모든 리전 조회
aws ec2 describe-regions --output table

# 2) 서울 리전의 AZ 정보 — ZoneName과 ZoneId를 같이 본다
aws ec2 describe-availability-zones \
  --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId,State,ZoneType]' \
  --output table
```

출력은 이렇게 나온다.

```
+-------------------+-----------+-----------+-----------------------+
| ap-northeast-2a   | apne2-az1 | available | availability-zone     |
| ap-northeast-2b   | apne2-az2 | available | availability-zone     |
| ap-northeast-2c   | apne2-az3 | available | availability-zone     |
| ap-northeast-2d   | apne2-az4 | available | availability-zone     |
+-------------------+-----------+-----------+-----------------------+
```

`ZoneName`은 계정별로 셔플되지만 `ZoneId`는 모든 계정에서 동일하다. 따라서 협력사와 VPC를 peering 하면서 "같은 AZ에 배치해서 cross-AZ 비용을 아끼고 싶다"면 ZoneId로 맞춰야 한다. 또 `ZoneType`이 `local-zone`이나 `wavelength-zone`으로 나오면 그 리전이 특수 인프라를 지원한다는 뜻이다.

## 정리하며

오늘 본 그림은 두 가지다. 첫째, AWS는 **Region > AZ > Edge**라는 3층 인프라 위에서 동작하고, 각 계층은 서로 다른 수준의 격리와 latency 특성을 갖는다. 둘째, 그 인프라 위에서 보안과 운영의 책임은 **AWS는 콘크리트 바닥부터 하이퍼바이저까지, 그 위는 고객**이라는 약속으로 갈린다. 관리형 서비스를 쓰면 그 경계선이 위로 올라가는 만큼 고객 책임은 줄지만, 그래도 "데이터 분류와 IAM 권한"만큼은 절대 줄지 않는다.

이 두 그림이 SAA 시험 전 영역의 배경이 된다. 다음 글에서는 이 인프라 지도 위에 "누가 무엇을 할 수 있게 할까"를 결정하는 IAM의 4대 엔터티 — User, Group, Role, Policy — 를 본다. Capital One 사고의 직접적 원인이 IAM 설정이었다는 점을 떠올리면, 이 주제가 왜 중요한지가 자연스럽게 보일 것이다.

---

## 📝 연습 문제

**문제 1.** 한 회사는 본사 데이터센터 내에서 일부 워크로드를 실행해야 하지만 AWS 매니지드 서비스도 함께 쓰고 싶다. 가장 적합한 솔루션은?

A) Wavelength Zone
B) Local Zones
C) Outposts
D) Region 직접 사용

**정답: C**
해설: 고객 데이터센터 안에 AWS 하드웨어를 두고 동일한 API/서비스를 쓸 수 있는 것이 Outposts. 핵심 신호는 "본사 안", "데이터를 외부로 못 보냄" 같은 규제·주권 키워드다. Wavelength는 통신사 5G 엣지(고객 DC 아님), Local Zones는 AWS가 운영하는 도시 단위 미니 리전(고객 DC 아님), Region 직접 사용은 데이터가 AWS 시설로 나가버리므로 규제 요구를 못 맞춘다. 실무에서는 Outposts 도입 전에 **Direct Connect + 본사 데이터센터 유지** 조합이 더 저렴할 수 있다는 점도 같이 검토한다.

---

**문제 2.** 다음 중 EC2 인스턴스를 운영할 때 AWS의 책임에 해당하는 것은?

A) 게스트 OS 패치
B) 보안 그룹 설정
C) 하이퍼바이저 보안
D) 애플리케이션 코드의 취약점 점검

**정답: C**
해설: 하이퍼바이저 및 그 아래는 AWS 책임. 게스트 OS 패치, SG/NACL, 애플리케이션 코드는 모두 고객 책임이다. EC2는 IaaS이므로 OS 패치도 고객 몫이라는 점이 핵심. 만약 같은 워크로드를 ECS Fargate로 바꾸면 컨테이너 호스트 OS 패치까지 AWS 책임으로 넘어가고, Lambda로 바꾸면 런타임까지 AWS가 책임진다. 즉 "서비스 추상화 레벨이 올라갈수록 책임 경계선이 위로 올라간다"는 원칙으로 이해하면 모든 문제가 풀린다.

---

**문제 3.** TCP/UDP 기반 글로벌 게임 서버에 가장 일관된 글로벌 지연시간을 제공하려면?

A) CloudFront + Lambda@Edge
B) Global Accelerator
C) Route 53 Geolocation
D) Direct Connect

**정답: B**
해설: CloudFront는 HTTP/HTTPS L7 캐시 중심이고 비-HTTP 트래픽을 다루지 못한다. Lambda@Edge도 HTTP 컨텍스트에서만 동작한다. Route 53 Geolocation은 DNS 응답을 사용자 지리 위치에 따라 다르게 줄 뿐, **트래픽 자체를 가속하지는 않는다**(게다가 DNS TTL 때문에 페일오버가 분 단위). Direct Connect는 특정 사업장 ↔ AWS 전용선이라 글로벌 사용자 분산 시나리오에 안 맞는다. Global Accelerator는 BGP Anycast로 가장 가까운 엣지에 트래픽을 끌어들이고 AWS 백본망으로 전달해 TCP/UDP 모두에서 일관된 latency를 보장한다.

---

**문제 4.** S3에 대한 설명으로 옳은 것은?

A) S3 버킷은 글로벌 서비스이므로 데이터도 글로벌하게 복제된다
B) S3 버킷 이름은 글로벌 네임스페이스지만 데이터는 특정 리전에 저장된다
C) S3 데이터는 모든 리전에 자동 복제된다
D) S3는 가용 영역에 종속된다

**정답: B**
해설: S3 버킷 이름은 DNS 호스트네임(`bucket-name.s3.region.amazonaws.com`)으로 해석되기 때문에 **이름만 글로벌 유일**이고, 실제 데이터는 생성 시 선택한 리전에 저장된다. 데이터를 다른 리전에 복제하려면 **Cross-Region Replication(CRR)** 또는 **Multi-Region Access Point**를 별도로 설정해야 한다. S3가 한 리전 안에서 자동으로 여러 AZ에 데이터를 분산 저장(11 9's 내구성의 비밀)하지만, AZ에 종속되는 게 아니라 리전 내에서 추상화된 것이다. 참고로 S3는 2020년까지는 read-after-write가 일부 시나리오에서 일관성을 보장하지 않았으나, 2020년 12월부터 **strong read-after-write consistency**를 제공한다.

---

**문제 5.** Well-Architected Framework의 기둥이 아닌 것은?

A) Reliability
B) Sustainability
C) Compliance
D) Operational Excellence

**정답: C**
해설: 6 Pillars는 Operational Excellence / Security / Reliability / Performance Efficiency / Cost Optimization / Sustainability(2021 추가). Compliance는 별도의 거버넌스/감사 영역으로, W-AF에서는 Security Pillar 안에서 데이터 보호와 감사 추적성으로 다뤄질 뿐 독립 기둥은 아니다. 실무에서는 Compliance가 PCI-DSS, HIPAA, SOC 2 같은 외부 표준 준수를 의미하고, AWS는 Artifact·Config·Audit Manager 같은 도구로 이를 지원한다.

---

**문제 6.** 한 회사가 `ap-northeast-2` 리전에서 RDS Multi-AZ를 운영하면서, 별도 리전(`ap-northeast-1`)에 읽기 전용 복제본을 두려고 한다. 이 설계의 주된 이점은?

A) 단일 AZ 장애 복구
B) Region 단위 재해 복구(DR) + 동시 읽기 트래픽 분산
C) IAM 권한 분리
D) CloudFront 캐시 효율 향상

**정답: B**
해설: 두 메커니즘이 다른 차원을 보호한다는 점이 핵심이다. **Multi-AZ는 동일 리전 내 HA**(synchronous replication, 자동 failover로 RTO 1-2분), **Cross-Region Read Replica는 Region 단위 DR + 글로벌 읽기 트래픽 분산**(asynchronous replication, 수동 promote로 RTO 수 분 ~ 수십 분)이다. AZ 격리(HA)와 Region 격리(DR)는 다른 차원의 위험을 다루는 별개의 도구다. 만약 RPO를 1초 수준으로 더 엄격하게 잡고 싶다면 Aurora Global Database 쪽으로 가야 한다. RDS Cross-Region Read Replica는 일반적으로 RPO가 수 초 ~ 수십 초 수준이다.
