# Day 39 - WAF·Shield·GuardDuty·Inspector·Macie: 클라우드 보안 관제의 5개 축

클라우드 보안을 설계할 때 가장 먼저 마주치는 깨달음은 "방어 한 가지로는 절대 충분하지 않다"는 것이다. 1990년대 온프레미스 시절에는 외부와 내부를 가르는 단일 perimeter firewall이 "거의 모든" 보안이었지만, 클라우드에서는 그 경계 자체가 흐려졌다. API Gateway는 외부에 노출되지만 그 뒤의 Lambda는 VPC 안에 있을 수 있고, S3는 글로벌 서비스라 perimeter가 없다. 이 환경에서 보안은 **defense in depth** — 여러 계층이 각각 다른 종류의 공격을 막고, 한 계층이 뚫려도 다음 계층이 잡는 구조여야 한다.

AWS는 보안 서비스를 "차단(prevention) ↔ 탐지(detection) ↔ 분석(analysis) ↔ 통합(integration)"의 4개 역할로 나눠 제공한다. **WAF·Shield·Network Firewall** 이 차단을 담당하고, **GuardDuty·Inspector·Macie** 가 탐지를 담당하며, **Detective** 가 사후 분석, **Security Hub** 가 결과 통합과 컴플라이언스 점수를 매긴다. 이 글에서는 이 5개 축이 각각 어떤 공격에 답하는지, 왜 한 가지로 통합되지 않고 분리됐는지, 그리고 실무에서 가장 자주 마주치는 시나리오를 본다.

## WAF: HTTP/HTTPS 응용 계층 공격을 막는 7계층 방화벽

전통적인 방화벽(Security Group, NACL, Network Firewall)은 IP·포트·프로토콜 같은 4계층 이하의 정보로 트래픽을 거른다. 그런데 SQL injection은 합법적인 80/443 포트에서 합법적인 GET/POST 요청 안에 숨어 들어오기 때문에 4계층 방화벽으로는 못 잡는다. 이런 응용 계층 공격을 막는 게 WAF(Web Application Firewall)다.

AWS WAF는 2015년 출시됐고 2019년 WAFv2로 완전히 재설계되면서 지금의 구조가 됐다. 핵심 개념 세 가지는 **Web ACL, Rule, Statement** 다. Web ACL은 보호 대상(CloudFront, ALB, API Gateway, AppSync, Cognito User Pool, App Runner)에 attach되는 정책 컨테이너이고, 그 안에 Rule이 여러 개 있으며, 각 Rule은 statement(조건)와 action(허용/차단/계산/CAPTCHA/Challenge)으로 구성된다.

```
[ WAFv2 평가 흐름 ]

Internet Request
   │
   ▼
CloudFront (또는 ALB / API Gateway)
   │
   ▼
WAF Web ACL
   │
   ├─ Rule #1 (priority 1): Geo block (KR, US, JP만 허용)
   │     └─ Block if country NOT IN [KR, US, JP]
   │
   ├─ Rule #2 (priority 2): IP allowlist (사내 IP)
   │     └─ Allow if source IP in trusted-ips set
   │
   ├─ Rule #3 (priority 3): AWS Managed Rule - SQLi
   │     └─ Block if request matches SQL injection pattern
   │
   ├─ Rule #4 (priority 4): AWS Managed Rule - XSS
   │
   ├─ Rule #5 (priority 5): Rate-based rule
   │     └─ Block if IP > 2000 requests / 5 min
   │
   └─ Default Action: Allow
   │
   ▼
백엔드 (Lambda / EC2 / ECS)
```

Rule의 priority는 평가 순서를 결정하고, 먼저 매치되는 rule의 action이 최종 결정된다. 그래서 "사내 IP는 무조건 통과" 같은 allowlist는 priority를 낮게(우선순위 높게) 두고 그 뒤에 차단 rule을 둔다. 평가 순서를 잘못 잡으면 의도와 반대로 동작한다.

| Rule 유형 | 설명 | 비용 |
|----------|------|------|
| **Managed Rules - AWS** | AWS가 제공하는 OWASP Top 10, Bot, IP reputation 등 | 무료~$10/월 |
| **Managed Rules - Marketplace** | 외부 보안 벤더 제공 | 벤더별 |
| **Custom Rules** | 직접 작성 (Statement DSL) | Web ACL당 $5 + Rule당 $1 |
| **Rate-based Rules** | IP당 5분 윈도우 요청 수 임계값 | Custom Rule로 카운트 |
| **Bot Control** | 좋은 봇/나쁜 봇 자동 분류, CAPTCHA | $10/월 + 추가 비용 |
| **Account Takeover Prevention (ATP)** | 로그인 endpoint 보호 (자격 증명 stuffing 탐지) | $10/월 + 추가 |
| **Fraud Control** | 가입 endpoint 보호 (가짜 가입 탐지) | $10/월 + 추가 |

WAFv2의 강점은 **AWS Managed Rules** 다. AWS가 OWASP Top 10, 봇, IP reputation, Anonymous IP(VPN/Tor) 같은 표준 규칙 세트를 무료(또는 저비용)로 제공하므로, 처음 WAF를 켜는 회사가 직접 모든 규칙을 작성할 필요 없이 권장 Managed Rules만 활성화해도 90% 이상의 표준 공격을 막는다. 시험에 "OWASP 공격 자동 차단" 키워드가 보이면 AWS Managed Rules가 답이다.

**Rate-based Rule** 은 IP당 5분 윈도우 안에 들어온 요청 수가 임계값을 넘으면 자동 차단하는 규칙이다. brute force, scraping, layer-7 DDoS의 1차 방어선이다. 임계값은 정상 트래픽보다 충분히 높되 의심스러운 폭증을 잡을 정도로 설정해야 한다(보통 IP당 5분에 2000~10000).

> 💡 **관련 이론**: WAF는 OSI 7계층(Application)에서 동작하므로 정확한 명칭은 L7 firewall이다. 4계층 firewall(SG, NACL)은 페이로드를 볼 수 없고 5-tuple(src/dst IP, src/dst port, protocol)만 본다. L7 WAF는 HTTP 헤더·메서드·URI·body까지 검사하므로 SQLi, XSS, 경로 traversal, 봇 user-agent 같은 응용 계층 공격을 막을 수 있다. 단 모든 페이로드를 검사하므로 latency가 4계층 방화벽보다 약간 높고(보통 1-2ms), CloudFront 같은 edge에 배치하면 origin 부담을 크게 줄일 수 있다.

> 🔍 **더 깊이**: WAF Web ACL의 scope는 두 가지다 — `CLOUDFRONT`(글로벌, us-east-1에서만 관리)와 `REGIONAL`(ALB/API Gateway/AppSync 등, 각 region별). CloudFront에 attach하는 WAF는 edge에서 검사해 악성 트래픽이 origin에 도달하기 전에 막으므로 가장 효과적이다. ALB에만 WAF를 두면 트래픽이 이미 region에 들어온 뒤 검사하므로 비용·latency가 더 든다. 베스트 프랙티스는 "CloudFront + WAF를 최전방에, ALB는 두 번째 방어선"이다.

## Shield: L3/L4 DDoS 방어와 Shield Advanced의 비용 보호

DDoS(분산 서비스 거부) 공격은 보통 L3/L4(SYN flood, UDP reflection, ICMP)와 L7(HTTP flood) 두 종류로 나뉜다. WAF는 L7만 다루고, Shield는 L3/L4를 다룬다. 둘은 보완 관계이지 대체 관계가 아니다.

**Shield Standard** 는 모든 AWS 고객에게 무료로 적용된다. CloudFront, Route 53, ALB, NLB, AWS Global Accelerator에 자동으로 들어가며, SYN flood, UDP reflection 같은 일반적인 L3/L4 DDoS를 자동 완화한다. 별도 설정이나 비용이 없다.

**Shield Advanced**(월 $3,000 + 데이터 처리비)는 엔터프라이즈용으로 다음 기능이 추가된다.

| 기능 | 설명 |
|------|------|
| **24/7 DDoS Response Team (DRT)** | 대규모 공격 시 AWS 보안 엔지니어와 직접 통화 가능 |
| **Cost Protection** | DDoS로 인한 ELB/CloudFront/R53/EC2 스케일아웃 비용을 AWS가 환불 |
| **Application Layer DDoS (L7) Protection** | WAF Managed Rule이 자동 포함 (Shield Advanced 가입자 무료) |
| **Real-time Notifications** | DDoS 공격 시작/완료를 CloudWatch로 알림 |
| **Health-based Detection** | Route 53/ELB health check 기반 공격 탐지 |
| **Global Threat Dashboard** | AWS 전체 DDoS 트렌드 확인 |

Shield Advanced의 가장 큰 매력은 **cost protection** 이다. DDoS 공격이 들어오면 ALB가 자동 스케일아웃하고 CloudFront 트래픽이 폭증해 AWS 비용이 평소의 100배로 뛸 수 있다. Shield Advanced 가입자는 이 추가 비용을 AWS가 환불해주므로 "DDoS로 인한 청구서 폭탄"을 막을 수 있다. 월 $3,000은 부담스럽지만 페이먼트 처리, 미디어 스트리밍, 게임 같은 "공격받기 쉬운" 워크로드에서는 보험으로 가치가 있다.

```
[ DDoS 방어 계층 ]

L3/L4 SYN flood, UDP reflection
   ▼
Shield Standard (자동, 무료)
   ├─ CloudFront / Route 53 / ALB / NLB / Global Accelerator
   │
   └─ 더 큰 공격 → Shield Advanced
            ├─ DRT 24/7 지원
            └─ Cost Protection

L7 HTTP flood, slowloris, bot scraping
   ▼
WAF Rate-based Rule + AWS Managed Rules
   │
   ▼ (Shield Advanced 가입자)
   └─ Shield Application Layer DDoS Auto-Mitigation
```

> ⚠️ **함정**: 시험에 "대규모 DDoS + 비용 보호"라는 키워드가 보이면 정답은 무조건 Shield Advanced다. Shield Standard는 무료지만 대규모 공격은 일부만 완화하고 cost protection이 없다. Rate-based Rule(WAF)은 L7만 다루므로 L3/L4 단독 솔루션이 아니다.

> 📚 **사례**: 2020년 2월, AWS Shield가 한 고객을 향한 **2.3Tbps** 의 UDP reflection DDoS를 완화했다. 당시까지 공개된 가장 큰 규모의 DDoS 공격이었고 AWS Shield Threat Landscape Report에 공식 기록됐다. 이런 규모의 공격을 자체 인프라로 막는 건 사실상 불가능하므로, perimeter에 CloudFront + Shield를 두는 패턴이 클라우드 보안의 표준이 됐다.

## GuardDuty: 행위 기반 위협 탐지

GuardDuty는 2017년 11월 출시된 ML 기반 위협 탐지 서비스다. CloudTrail logs, VPC Flow Logs, DNS query logs를 입력으로 받아 행위 패턴을 분석하고, 의심스러운 동작이 발견되면 finding을 생성한다. 시그니처 기반 IDS와 다른 점은 "알려진 공격 패턴"이 아니라 "비정상적인 행동"을 탐지한다는 것이다.

GuardDuty가 탐지하는 위협 카테고리는 크게 네 가지다.

| 카테고리 | 예시 |
|----------|------|
| **계정 침해** | 알려진 악성 IP에서 root 로그인, 비정상 region에서 API 호출, IAM 키 누출 의심 |
| **인스턴스 침해** | EC2가 알려진 C&C 서버와 통신, 암호화폐 채굴 패턴, 비정상 outbound 트래픽 |
| **버킷 침해** | S3에 무허가 접근, 비정상 download 패턴 |
| **EKS / Malware** | 컨테이너 escape 시도, EBS의 malware (S3 Malware Protection·EBS Malware Protection 옵션) |

추가 데이터 소스로 **EKS Audit Logs, S3 Data Events, RDS Login Events, Lambda Network Activity, EBS Malware Scan** 이 있는데, 각각 추가 비용이 있지만 보호 범위가 크게 늘어난다. 2023년 출시된 EBS Malware Scan은 GuardDuty가 의심스러운 EC2를 발견하면 자동으로 EBS 스냅샷을 만들고 그 안의 파일을 스캔하는 기능이다.

GuardDuty의 출력은 **finding** 이고 severity가 Low(0.1-3.9), Medium(4.0-6.9), High(7.0-8.9)로 매겨진다. finding이 발생하면 EventBridge에 즉시 publish되므로, 이걸 받아 자동 대응(SNS 알림, Lambda로 인스턴스 격리, SSM으로 패치)을 트리거하는 게 표준 패턴이다.

```
[ GuardDuty + 자동 대응 패턴 ]

CloudTrail / VPC Flow / DNS / EKS Audit / RDS Login
   │
   ▼
GuardDuty (ML 분석)
   │ Finding 생성
   ▼
EventBridge rule (severity >= 7.0)
   │
   ├─ SNS → SecOps Slack / PagerDuty 알림
   ├─ Lambda → 의심 EC2를 격리 SG로 이동
   ├─ Lambda → IAM 키 비활성화
   └─ Step Functions → Detective 분석 워크플로 시작
```

> 🔍 **더 깊이**: GuardDuty는 분석 대상 로그를 직접 활성화하지 않아도 자동으로 받아간다. 사용자가 CloudTrail이나 VPC Flow Logs를 활성화하지 않았어도 GuardDuty 내부에서 별도 stream을 받는다. 이게 GuardDuty의 강점인데, 운영 측면에서 별도 설정이 거의 필요 없고, 데이터 저장 비용도 GuardDuty 가격에 포함된다(분석 후 즉시 폐기). 단 사후 조사용으로 CloudTrail/VPC Flow Logs는 별도 활성화하는 게 표준이다.

> 📚 **사례**: 2019년 한 핀테크 스타트업이 IAM 키가 GitHub에 잘못 커밋된 사건. 30분 만에 봇이 키를 발견하고 us-east-1에서 EC2를 무차별 생성해 암호화폐 채굴을 시작했다. GuardDuty가 "비정상 region에서 RunInstances 폭증"을 5분 안에 finding으로 잡았고, EventBridge → Lambda로 자동으로 IAM 키 비활성화 + 채굴 인스턴스 종료를 실행해 피해를 $200 수준에서 멈출 수 있었다. 자동 대응이 없었으면 보통 수만~수십만 달러 청구서가 나온다.

## Inspector: 취약점 스캔

GuardDuty가 "행동 기반 위협 탐지"라면 Inspector는 "정적 취약점 스캔"이다. EC2 인스턴스, ECR 컨테이너 이미지, Lambda 함수에 설치된 패키지의 CVE 데이터베이스와 대조해 알려진 취약점을 찾는다. 2021년 11월 Inspector v2로 완전히 재설계되어 자동·지속 스캔이 기본이 됐다.

| 스캔 대상 | 방법 | 빈도 |
|----------|------|------|
| **EC2** | SSM Agent를 통해 패키지 인벤토리 수집 | 새 인스턴스 시작 시, 패키지 변경 시, CVE 새로 발견 시 |
| **ECR 이미지** | 푸시 시 자동 스캔 + 보존 기간 동안 재스캔 | 푸시 시 + CVE 새로 발견 시 |
| **Lambda** | 함수의 dependency 패키지 스캔 | 배포 시 + CVE 새로 발견 시 |

Inspector v2의 강점은 "이미 배포된 자원이 새로운 CVE의 영향을 받는지" 를 자동 재평가한다는 점이다. 예를 들어 Log4Shell(CVE-2021-44228)이 공개된 순간 Inspector는 이미 ECR에 있는 모든 이미지를 재스캔해서 영향받는 이미지를 즉시 표시한다. 수동으로 모든 이미지를 다시 스캔할 필요가 없다.

Inspector finding은 severity별로 분류되고 (Critical, High, Medium, Low, Informational), CVSS 점수와 함께 "고친 버전이 있는지", "공격 가능한 네트워크 경로가 있는지" 같은 컨텍스트가 함께 제공된다. **Network Reachability** 분석은 EC2의 경우 "이 인스턴스가 인터넷에서 도달 가능한지"를 자동으로 평가해서, 같은 CVE라도 인터넷 노출 인스턴스가 더 위험하다고 점수를 가중한다.

> ⚠️ **함정**: 시험에 "EC2 OS·패키지 취약점 자동 스캔"이라는 키워드는 Inspector가 답이다. GuardDuty는 행위 기반(예: 악성 IP 통신, 비정상 API 호출)이지 정적 취약점 스캔이 아니다. 둘이 보완 관계이지 대체 관계가 아니라는 점이 시험에 자주 나온다.

## Macie: S3 안의 민감 데이터 자동 탐지

Macie는 S3 버킷에 저장된 객체를 스캔해 **PII(Personally Identifiable Information)** — 신용카드 번호, 주민등록번호, 운전면허, 여권 번호, AWS 자격증명 등 — 가 들어 있는지 ML로 분류한다. 2017년 출시 후 2020년 5월 가격이 90% 인하되면서 본격적으로 보급됐다.

Macie의 동작 모델은 두 단계다.

1. **버킷 인벤토리** : 모든 S3 버킷의 공개 여부, 암호화 여부, 정책을 자동 분석해서 "위험한 버킷"을 식별한다(예: 공개 read인데 PII 가능성 있는 버킷).
2. **객체 콘텐츠 분석** : 사용자가 명시적으로 활성화한 버킷의 객체를 스캔해서 PII 패턴을 ML로 탐지한다.

Macie가 탐지하는 데이터 유형은 100가지가 넘는다(미국 SSN, EU GDPR PII, AWS 키, OAuth 토큰, 의료 코드 등). 커스텀 정규식이나 키워드로 자체 패턴도 추가할 수 있다. finding은 EventBridge로 전달되어 자동 격리·통보·DLP 정책 트리거에 쓸 수 있다.

| 컴플라이언스 | Macie 활용 |
|--------------|-----------|
| GDPR | EU PII가 EU region에만 있는지 확인 |
| PCI DSS | 카드 번호가 PCI scope 안에만 있는지 |
| HIPAA | 의료 정보(MRN, ICD 코드) 위치 추적 |
| 한국 개인정보보호법 | 주민번호 노출 탐지 |

> 🔍 **더 깊이**: Macie의 콘텐츠 스캔은 객체 1GB당 약 $1, 인벤토리는 매우 저렴($0.10/계정/월 + 객체당 작은 비용)이다. 그래서 "모든 객체 매일 스캔"은 비용 폭탄이고, 표준 패턴은 ① 인벤토리는 항상 켜고 ② 콘텐츠 스캔은 "새 객체만" 또는 "주기적 샘플링"으로 운영한다. EventBridge로 "S3에 새 객체 업로드 → 즉시 스캔"을 트리거할 수도 있다.

> 📚 **사례**: 2022년 한 헬스케어 회사가 Macie를 도입해서 "환자 의료 기록이 PCI scope 버킷에 잘못 저장된" 케이스를 발견했다. HIPAA와 PCI DSS는 별도 scope여야 하는데 개발자가 실수로 같은 버킷에 저장한 게 6개월간 발견되지 못했다. Macie가 ICD 코드 + 카드 번호 둘 다 같은 버킷에서 탐지해 알람을 울렸고, 즉시 격리 + 컴플라이언스 보고로 처리됐다.

## Detective와 Security Hub: 분석과 통합

GuardDuty가 finding을 만들면 "이 finding의 근본 원인은 뭔가?"를 파고들어야 하는데, 이 사후 분석을 자동화한 게 **Detective** 다. Detective는 GuardDuty findings, VPC Flow Logs, CloudTrail을 그래프 DB로 통합해서 "이 IAM Role이 언제 처음 등장했나, 어떤 인스턴스에 attach됐나, 어떤 API를 호출했나"를 시각화한다. 보안 사고 분석 시간을 수 시간에서 수 분으로 줄이는 게 목표다.

**Security Hub** 는 AWS의 모든 보안 서비스(GuardDuty, Inspector, Macie, Config, IAM Access Analyzer, Firewall Manager, Health 등)와 3rd party 보안 도구(Splunk, Palo Alto, CrowdStrike 등)의 결과를 통합해 단일 대시보드로 보여준다. 그리고 **CIS AWS Foundations Benchmark, PCI DSS, AWS Foundational Security Best Practices** 같은 표준에 대해 자동 평가해서 컴플라이언스 점수를 매긴다.

```
[ 통합 보안 관제 ]

탐지:
  GuardDuty (위협)
  Inspector (취약점)
  Macie (PII)
  Config (구성 변경)
  IAM Access Analyzer (잘못된 권한)
  Firewall Manager (조직 가드레일)
       │
       ▼
   Security Hub (통합 + 컴플라이언스 점수)
       │
       ├─ EventBridge → SNS / Lambda / Step Functions (자동 대응)
       │
       └─ Detective (사후 분석)
              └─ 그래프 시각화로 근본 원인 추적
```

조직 단위 운영을 위한 **Firewall Manager** 도 빠뜨릴 수 없다. AWS Organizations 전체에 WAF Web ACL, Shield Advanced, Security Group, Network Firewall, Route 53 Resolver DNS Firewall 정책을 일괄 적용하는 도구다. "모든 계정의 ALB에 동일한 WAF Web ACL 강제 적용" 같은 가드레일이 가능하다. 수십~수백 계정을 가진 엔터프라이즈에서 거의 필수다.

> ⚠️ **함정**: 시험에서 "다중 계정 보안 점수 통합"은 Security Hub, "근본 원인 분석"은 Detective, "조직 단위 WAF/Shield 일괄"은 Firewall Manager가 답이다. 세 서비스가 비슷해 보이지만 역할이 다르다.

## CLI로 직접 만져보기

```bash
# WAFv2 Web ACL (CloudFront scope = us-east-1)
aws wafv2 create-web-acl --name saa-acl --scope CLOUDFRONT \
  --default-action Allow={} \
  --visibility-config 'SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=acl' \
  --rules '[{
    "Name":"AWSManagedRulesCommonRuleSet","Priority":1,
    "Statement":{"ManagedRuleGroupStatement":{"VendorName":"AWS","Name":"AWSManagedRulesCommonRuleSet"}},
    "OverrideAction":{"None":{}},
    "VisibilityConfig":{"SampledRequestsEnabled":true,"CloudWatchMetricsEnabled":true,"MetricName":"common"}
  },{
    "Name":"RateLimit","Priority":2,
    "Statement":{"RateBasedStatement":{"Limit":2000,"AggregateKeyType":"IP"}},
    "Action":{"Block":{}},
    "VisibilityConfig":{"SampledRequestsEnabled":true,"CloudWatchMetricsEnabled":true,"MetricName":"rate"}
  }]'

# Shield Advanced에 ALB 등록
aws shield create-protection \
  --name "prod-alb" \
  --resource-arn arn:aws:elasticloadbalancing:...

# GuardDuty 활성화 + 모든 데이터 소스 켜기
aws guardduty create-detector --enable \
  --data-sources '{"S3Logs":{"Enable":true},"Kubernetes":{"AuditLogs":{"Enable":true}},"MalwareProtection":{"ScanEc2InstanceWithFindings":{"EbsVolumes":true}}}'

# Inspector v2 활성화 (EC2 + ECR + Lambda 전체)
aws inspector2 enable \
  --resource-types EC2 ECR LAMBDA

# Macie 활성화 + 콘텐츠 스캔 job
aws macie2 enable-macie
aws macie2 create-classification-job \
  --job-type ONE_TIME \
  --name "prod-bucket-scan" \
  --s3-job-definition '{"bucketDefinitions":[{"accountId":"111","buckets":["my-bucket"]}]}'

# Security Hub 활성화 + CIS/AFSBP 표준
aws securityhub enable-security-hub --enable-default-standards

# Firewall Manager 조직 단위 WAF 정책
aws fms put-policy --policy '{
  "PolicyName":"org-waf",
  "ResourceType":"AWS::ElasticLoadBalancingV2::LoadBalancer",
  "SecurityServicePolicyData":{"Type":"WAFV2","ManagedServiceData":"..."}
}'

# GuardDuty finding → EventBridge → SNS 자동화
aws events put-rule --name guardduty-high \
  --event-pattern '{"source":["aws.guardduty"],"detail-type":["GuardDuty Finding"],"detail":{"severity":[{"numeric":[">=",7]}]}}'
```

## 정리하며

AWS의 보안 서비스 생태계는 "차단 → 탐지 → 분석 → 통합"의 4단 구조를 가진다. **WAF**(L7 응용 계층)와 **Shield**(L3/L4 DDoS)는 차단을, **GuardDuty**(행위)·**Inspector**(취약점)·**Macie**(PII)는 탐지를, **Detective** 는 사후 분석을, **Security Hub** 는 통합·컴플라이언스 점수를 담당한다. 시험에서 가장 자주 헷갈리는 분업은 ① WAF vs Shield(L7 vs L3-L4), ② GuardDuty vs Inspector(행위 vs 취약점), ③ Security Hub vs Detective(통합 점수 vs 근본 원인), ④ Shield Standard vs Advanced(무료 자동 vs 대규모 + cost protection)이고, 키워드 매핑만 정확히 하면 보안 도메인의 시나리오 문제를 빠르게 풀 수 있다. 실무에서는 단일 서비스가 아니라 "탐지(GuardDuty) → EventBridge → 자동 대응(Lambda) → 사후 분석(Detective)"의 파이프라인으로 묶는 게 표준 패턴이다.

다음 글에서는 이번 주에 본 보안 서비스들을 시나리오 기반으로 종합한다. KMS·Secrets Manager·Cognito·WAF·GuardDuty가 한 아키텍처 안에서 어떻게 협력하는지, 그리고 SAA 시험의 보안 도메인(30% 비중)에서 가장 자주 나오는 12가지 시나리오를 풀어본다.

---

## 📝 연습 문제

**문제 1.** 한 회사의 웹 앱이 SQL injection과 XSS 공격을 받고 있다. 가장 적합한 차단 솔루션은?

A) Shield Standard
B) WAF + AWS Managed Rules (CommonRuleSet, SQLi, XSS) on CloudFront/ALB
C) Network Firewall
D) Security Group

**정답: B**

해설: SQLi, XSS는 L7 응용 계층 공격이라 WAF가 답이고, AWS Managed Rules가 OWASP Top 10을 거의 그대로 커버한다. Shield(A)는 L3/L4 DDoS 전용이고 SQLi를 막지 못한다. Network Firewall(C)은 VPC 내 L3-L7 트래픽 검사용이지 표준 웹 공격 방어 도구가 아니다. SG(D)는 4계층 이하 firewall이라 페이로드 검사 불가.

---

**문제 2.** 한 핀테크 회사가 대규모 DDoS 공격을 우려하면서 공격 시 발생할 수 있는 AWS 청구서 폭탄도 걱정된다. 가장 적합한 솔루션은?

A) Shield Standard
B) Shield Advanced (DRT 지원 + Cost Protection + L7 Auto-Mitigation 포함)
C) WAF Rate-based Rule만
D) Route 53 Failover

**정답: B**

해설: Shield Advanced는 cost protection이 핵심 가치다. DDoS로 인한 ELB/CloudFront/Route 53/EC2 스케일아웃 비용을 AWS가 환불해주므로 청구서 폭탄을 막을 수 있다. 24/7 DRT 지원과 자동 L7 mitigation도 포함된다. Standard(A)는 무료지만 cost protection 없음. Rate-based Rule(C)은 L7만 다룸. D는 DDoS 솔루션이 아니다.

---

**문제 3.** 한 회사가 GuardDuty를 활성화했더니 "EC2가 알려진 암호화폐 채굴 풀과 통신"이라는 high severity finding이 발생했다. 5분 내 자동으로 인스턴스를 격리하고 SecOps에 알리고 싶다. 가장 적합한 자동화 패턴은?

A) GuardDuty → 매일 수동 확인
B) GuardDuty → EventBridge rule (severity >= 7) → Lambda (격리 SG로 교체) + SNS (SecOps)
C) GuardDuty 끄고 직접 모니터링
D) CloudTrail만 활성화

**정답: B**

해설: GuardDuty finding은 즉시 EventBridge에 publish되므로 severity 임계값 기반 rule로 Lambda를 트리거해 인스턴스를 격리 SG로 교체(또는 종료)하고 SNS로 SecOps에 알리는 게 표준 패턴이다. 수동 검토(A·C)는 5분 SLA 불가, D는 탐지 자체가 안 됨.

---

**문제 4.** 한 회사가 S3 버킷에 들어 있는 객체 중 신용카드 번호, 주민번호 같은 PII가 들어 있는 것을 자동으로 탐지하고 분류하고 싶다. 가장 적합한 서비스는?

A) GuardDuty
B) Macie
C) Inspector
D) Config

**정답: B**

해설: Macie는 S3 객체의 콘텐츠를 ML로 분석해 100가지 이상의 PII 패턴을 자동 분류한다. GDPR, PCI DSS, HIPAA, 개인정보보호법 컴플라이언스에 활용된다. GuardDuty(A)는 행위 기반 위협 탐지, Inspector(C)는 취약점 스캔, Config(D)는 구성 평가이지 콘텐츠 분류가 아니다.

---

**문제 5.** 한 회사가 EC2 인스턴스 1,000대의 OS 패키지에 새로 공개된 CVE가 영향을 미치는지 자동으로 평가하고 싶다. 가장 적합한 서비스는?

A) GuardDuty
B) Inspector v2 (EC2 + ECR + Lambda 자동/지속 스캔)
C) Macie
D) Security Hub

**정답: B**

해설: Inspector v2는 SSM Agent를 통해 EC2의 패키지 인벤토리를 수집하고 CVE 데이터베이스와 자동 대조한다. 새 CVE가 공개되면 즉시 모든 영향받는 인스턴스를 재평가한다. Network Reachability 분석으로 인터넷 노출 인스턴스에 가중치를 주기도 한다. GuardDuty(A)는 행위 기반이지 정적 취약점 스캔이 아니다.

---

**문제 6.** 한 엔터프라이즈가 50개 AWS 계정을 운영하면서 모든 계정의 ALB에 동일한 WAF Web ACL을 강제 적용하고 싶다. 가장 적합한 서비스는?

A) 각 계정에 수동으로 WAF 설정
B) AWS Firewall Manager로 조직 단위 WAF 정책 일괄 적용
C) Lambda로 매일 점검
D) Security Hub

**정답: B**

해설: Firewall Manager는 AWS Organizations 전체에 WAF Web ACL, Shield Advanced, Security Group, Network Firewall, Route 53 Resolver DNS Firewall 정책을 일괄 적용하는 전용 서비스다. 신규 계정/리소스에도 자동 적용된다. A는 운영 부담 폭증, C는 일관성 보장 어려움, D는 통합 대시보드이지 정책 강제 도구가 아니다.

---

**문제 7.** GuardDuty finding이 발생한 후 "이 IAM Role이 언제 처음 등장했고, 어떤 인스턴스에 attach됐고, 어떤 API를 호출했는지"를 그래프로 시각화해 근본 원인을 추적하고 싶다. 가장 적합한 서비스는?

A) CloudTrail Insights
B) Detective
C) Security Hub
D) Config

**정답: B**

해설: Detective는 GuardDuty findings, VPC Flow Logs, CloudTrail을 그래프 DB로 통합해 보안 사고의 근본 원인을 시각화하는 전용 서비스다. 시간 축, 엔티티 간 관계, API 호출 빈도를 한 화면에서 볼 수 있어 분석 시간을 수 시간에서 수 분으로 줄인다. Security Hub(C)는 통합 점수·대시보드이지 근본 원인 그래프 분석이 아니다.

---

해설 보강: AWS의 5개 보안 축은 "WAF(L7 차단), Shield(L3/L4 DDoS), GuardDuty(행위 탐지), Inspector(취약점), Macie(PII)"로 명확히 분업되어 있고, 시험 키워드만 정확히 매핑하면 빠르게 풀린다. 실무에서는 단일 서비스가 아니라 GuardDuty → EventBridge → Lambda 자동 대응 → Detective 분석 → Security Hub 통합 점수의 파이프라인을 구축하는 게 표준이다. Firewall Manager는 조직 단위 가드레일의 유일한 답이라는 점도 기억해 두자.
