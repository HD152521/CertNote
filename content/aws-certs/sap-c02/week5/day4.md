# Day 4 - Route 53 심화: Health Check 알고리즘, DNSSEC, Geoproximity 수학, Resolver 하이브리드 DNS

SAP-C02 시험에서 Route 53은 단순 "DNS 서비스"가 아니다. 글로벌 트래픽 라우팅의 두뇌, 하이브리드 DNS의 연결 고리, 그리고 DNSSEC을 통한 보안 레이어까지 담당한다. Day 22에서 7가지 라우팅 정책의 키워드 매핑을 다뤘다면, 오늘은 그 안에서 실제로 일어나는 알고리즘 — Health Check 판정 로직, Geoproximity Bias 수학, Resolver 엔드포인트 내부 동작 — 을 해부한다. 시험에서 "왜 이 정책인가"를 물을 때 알고리즘 수준의 이해가 없으면 유사한 보기 두 개 사이에서 흔들린다.

## Route 53 Health Check: 세 가지 유형과 내부 판정 로직

Route 53의 Health Check는 겉으로 보면 단순하다. 엔드포인트를 폴링해서 응답이 좋으면 Healthy, 나쁘면 Unhealthy. 그러나 SAP 시험은 그 내부 알고리즘을 묻는다.

### Endpoint Health Check

가장 기본 유형이다. Route 53의 전 세계 Health Checker 위치(us-east-1, eu-west-1, ap-southeast-1 등 약 15개 리전)에서 대상 엔드포인트(IP 또는 도메인)로 직접 요청을 보낸다.

판정 로직:
- 각 Health Checker가 독립적으로 요청을 보낸다
- 기본 설정에서 Health Checker의 **18% 이상**이 Healthy로 판단하면 전체 상태가 Healthy로 집계된다
- 임계치(threshold)는 1~10 사이 설정 가능

```
Health Checker 위치 (15개):
us-east-1, us-west-1, us-west-2, eu-west-1, eu-west-2,
eu-west-3, eu-central-1, ap-southeast-1, ap-southeast-2,
ap-northeast-1, ap-northeast-2, ap-northeast-3,
sa-east-1, ca-central-1, ap-south-1

기본 판정:
Healthy Checker 수 >= 3 (15의 18%) → 전체 Healthy
Healthy Checker 수 < 3 → 전체 Unhealthy
```

> 💡 **관련 이론**: 분산 Health Check 설계는 **Byzantine Fault Tolerance**의 경량 버전이다. 단일 모니터가 장애를 보고하면 모니터 자체의 네트워크 문제일 수 있다. 다수결(quorum)로 판정하면 "모니터 장애"와 "실제 서비스 장애"를 구분할 수 있다. 18% 임계치는 "대부분의 리전에서 접근 불가"일 때만 Unhealthy로 판정해 오탐(false positive)을 줄이는 설계다.

**Private Endpoint Health Check의 제약**: Route 53 Health Checker는 퍼블릭 인터넷에서 온다. VPC 내 private 리소스(프라이빗 IP, 인터넷 비연결 인스턴스)에는 직접 도달할 수 없다.

해결책: **CloudWatch Alarm과 연동**한다. CloudWatch가 내부 메트릭을 수집하고, Alarm 상태(OK/ALARM)를 Health Check의 판정 기준으로 사용한다.

```
[VPC 내 Private EC2]
    │
    │ CloudWatch Agent → CW Metric
    ▼
CloudWatch Alarm (CPU > 90% → ALARM)
    │
    ▼
Route 53 Health Check (CloudWatch Alarm 연동)
    │ ALARM = Unhealthy, OK = Healthy
    ▼
Route 53 Failover 라우팅 작동
```

> ⚠️ **함정**: Private Endpoint에서 Health Check 없이 Failover 라우팅 레코드를 만들면, Route 53이 상태를 알 수 없어 Primary가 실제로 죽어도 Failover가 발동하지 않는다. Private 환경에서 반드시 CloudWatch Alarm 연동을 써야 한다.

### Calculated Health Check (계산형)

여러 하위 Health Check의 상태를 논리 연산으로 조합해 상위 상태를 결정한다.

```
Calculated HC (전체 서비스 판정)
    ├── HC-A: API 서버 (AND 필수)
    ├── HC-B: DB 서버 (AND 필수)
    └── HC-C: CDN 서버 (OR 중 하나만 살아있어도 됨)

설정: "HC-A AND HC-B가 Healthy이고, HC-C 중 1개 이상 Healthy면 전체 Healthy"
```

**최대 256개 하위 Health Check** 조합 가능. AND/OR/NOT 연산 지원.

SAP 시나리오에서 Calculated Health Check는 "다계층 애플리케이션에서 모든 계층이 정상일 때만 Route 53이 트래픽을 보내게 하라"는 요구에 매핑된다.

> 🔍 **더 깊이**: Calculated HC를 쓰면 Failover 라우팅에서 "트래픽을 일부러 다른 리전으로 전환하고 싶을 때" 상위 HC를 강제로 Unhealthy로 만드는 트릭을 쓸 수 있다. 실제 서비스는 살아있지만 Calculated HC에서 하나의 자식 HC를 비활성화해 상위를 Unhealthy로 만들면, Route 53이 Secondary로 전환한다. 계획된 유지보수에서 서비스를 내리지 않고 트래픽만 전환하는 패턴이다.

### CloudWatch Alarm Health Check

Health Checker가 엔드포인트에 직접 도달하는 대신, CloudWatch Alarm의 상태(OK, ALARM, INSUFFICIENT_DATA)를 읽어 판정한다.

| CloudWatch Alarm 상태 | Health Check 결과 |
|----------------------|------------------|
| OK | Healthy |
| ALARM | Unhealthy |
| INSUFFICIENT_DATA | 기본: Healthy (설정으로 변경 가능) |

INSUFFICIENT_DATA 상태를 Unhealthy로 설정하면 CloudWatch 에이전트가 죽었을 때도 Failover가 발동한다. 더 보수적인 설정이다.

## DNSSEC: RFC 4033-4035의 실체

DNSSEC(DNS Security Extensions)은 DNS 응답에 디지털 서명을 추가해 **DNS 스푸핑(Cache Poisoning)**을 방지하는 프로토콜이다. RFC 4033(2005)이 전체 프레임워크를, RFC 4034가 레코드 형식을, RFC 4035가 프로토콜 동작을 정의한다.

### DNSSEC이 필요한 이유: Kaminsky 공격

2008년 Dan Kaminsky가 발견한 DNS Cache Poisoning 공격은 DNS의 근본 취약점을 드러냈다. 공격자가 DNS 캐시 서버에 위조된 응답을 주입하면 사용자가 피싱 사이트로 리다이렉트된다. HTTPS를 써도 DNS 수준에서 잘못된 IP로 연결되면 인증서 오류 전에 이미 연결이 시작된다.

```
일반 DNS (DNSSEC 없음):
클라이언트 → DNS 리졸버 → 권한 NS
              ↑
              공격자가 위조 응답 주입 가능

DNSSEC 적용:
클라이언트 → DNS 리졸버 → 권한 NS (서명된 응답)
              리졸버가 서명 검증 → 위조 감지 시 SERVFAIL
```

### Route 53 DNSSEC 동작 구조

Route 53은 두 가지 DNSSEC 역할을 담당한다.

**1. DNSSEC 서명 (Hosted Zone 보호)**

Route 53이 호스팅하는 도메인의 DNS 레코드에 서명을 추가한다.

구성 요소:
- **KSK (Key Signing Key)**: Zone의 ZSK를 서명하는 최상위 키. AWS KMS 고객 관리형 키(CMK)로 생성. `ECC_NIST_P256` 알고리즘 사용
- **ZSK (Zone Signing Key)**: 실제 DNS 레코드(A, CNAME 등)를 서명하는 키. Route 53이 자동 관리
- **DS Record**: 부모 도메인(도메인 등록기관)에 등록하는 KSK 해시. 신뢰 체인 연결

```bash
# Route 53 DNSSEC 서명 활성화
aws route53 create-key-signing-key \
  --caller-reference "ksk-2026-01" \
  --hosted-zone-id Z1234567890ABC \
  --key-management-service-arn arn:aws:kms:us-east-1:111122223333:key/mrk-abc123 \
  --name "MyKSK" \
  --status ACTIVE

aws route53 enable-hosted-zone-dnssec \
  --hosted-zone-id Z1234567890ABC

# DS 레코드를 부모 도메인에 등록 (도메인 등록기관 콘솔에서)
aws route53 get-dnssec \
  --hosted-zone-id Z1234567890ABC
```

> 📚 **사례**: 2020년 Amazon Route 53 DNSSEC 서명 GA. AWS는 KMS와 통합해 KSK를 하드웨어 보안 모듈(HSM) 레벨에서 보호한다. CloudTrail로 모든 KSK 사용이 감사된다. 실제 운영에서 DNSSEC을 잘못 설정하면(DS 레코드가 부모에 등록됐는데 서명이 비활성화되면) 도메인 전체가 SERVFAIL이 돼 모든 사용자가 접근 불가가 된다. 이를 방지하기 위해 Route 53 콘솔은 "먼저 활성화, 그다음 DS 등록" 순서를 강제한다.

**2. DNSSEC 검증 (리졸버 레벨)**

Route 53 Resolver가 외부 도메인 쿼리 시 DNSSEC 서명을 검증한다. `DO (DNSSEC OK)` 비트를 설정하면 검증 결과가 `AD (Authenticated Data)` 비트로 응답된다.

> 💡 **관련 이론**: DNSSEC의 신뢰 체인(Chain of Trust)은 PKI의 인증서 체인과 같은 개념이다. 루트 DNS(IANA가 DNSSEC 서명)부터 TLD(.com, .kr), 권한 NS까지 각 레벨의 DS 레코드가 하위 ZSK를 검증한다. 이 체인 중 하나라도 끊기면 검증 실패(BOGUS)가 되어 SERVFAIL이 반환된다. "DNSSEC이 도입됐는데 갑자기 일부 도메인이 안 열린다"는 사고의 원인이다.

## Geolocation vs Geoproximity: 바이어스 수학

두 정책 모두 "사용자 위치 기반 라우팅"이지만 작동 방식이 근본적으로 다르다.

### Geolocation: 규칙 기반 매핑

```
클라이언트 IP → 국가/대륙 판별 → 미리 정의된 매핑 테이블 적용

설정 예시:
KR → ap-northeast-2 ALB
DE → eu-central-1 ALB
US → us-east-1 ALB
Default → us-east-1 ALB (매핑 없는 모든 국가)
```

**작동 원칙**: 완전히 결정론적(deterministic). 같은 국가의 사용자는 항상 같은 엔드포인트로 간다. 성능이 아닌 **정책(Policy)**이다.

Default 레코드가 없으면 매핑되지 않은 국가 사용자는 NODATA 응답을 받는다.

> ⚠️ **함정**: Geolocation은 사용자의 DNS 리졸버 IP 기반으로 국가를 판별한다. VPN 사용자는 VPN 엔드포인트 국가로 분류된다. 한국 사용자가 미국 VPN을 쓰면 us-east-1로 라우팅된다. 이는 성능 저하는 있지만 Route 53 입장에서는 정상 동작이다.

### Geoproximity: 거리 + 바이어스 수학

Geoproximity는 사용자와 엔드포인트 간의 **지리적 거리**를 기반으로 라우팅하되, **Bias** 값으로 각 엔드포인트의 "영향 반경"을 조정한다.

```
기본 (Bias = 0):
  사용자는 지리적으로 가장 가까운 엔드포인트로 라우팅

Bias + (1~99): 해당 엔드포인트의 영향 반경 확장
  Bias +50이면 반경이 약 50% 증가

Bias - (1~99): 해당 엔드포인트의 영향 반경 축소
  Bias -50이면 반경이 약 50% 감소
```

**Bias의 수학적 의미**: Bias는 엔드포인트의 "지리적 중력"을 조절한다. 서울(ap-northeast-2)에 Bias +50을 주면, 지리적으로는 도쿄(ap-northeast-1)가 더 가까운 일본 동부 사용자도 서울로 라우팅될 수 있다. Bias는 직선 거리에 가산/감산하는 편향값이 아니라, 보로노이 다이어그램(Voronoi Diagram)의 경계선을 이동시키는 개념이다.

```
Bias 없음 (기본):
──────────────────
서울  │  도쿄
      │ (경계는 두 엔드포인트의 수직 이등분선)

서울 Bias +50:
────────────────────────
    서울     │  도쿄
             │ (경계가 도쿄 방향으로 이동)
```

> 💡 **관련 이론**: 보로노이 다이어그램(Georgy Voronoy, 1908)은 평면을 n개 점의 가장 가까운 구역으로 분할하는 기하학적 구조다. Geoproximity에서 Bias 없이 여러 리전이 있으면 각 사용자는 가장 가까운 리전으로 분류된다 — 이것이 가장 단순한 보로노이 분할이다. Bias는 각 리전의 "중심 가중치"를 변경해 경계선을 이동시키는 가중 보로노이(Weighted Voronoi)를 만든다.

**Geoproximity 전제 조건**: Route 53 **Traffic Flow**를 반드시 사용해야 한다. 일반 레코드 편집 UI에서는 Geoproximity를 설정할 수 없다.

**AWS 리전 엔드포인트 vs 커스텀 좌표**:
- AWS 리전(ap-northeast-2 등)은 Route 53이 좌표를 자동 설정
- 온프레미스 데이터센터는 위도·경도를 직접 입력

> 🔍 **더 깊이**: Geolocation과 Geoproximity를 동시에 쓸 수 있는가? 같은 Hosted Zone에서 두 정책을 혼합하는 것은 권장하지 않는다. 그러나 실무에서 "대부분은 Geoproximity(거리 기반 최적화), 특정 국가는 데이터 주권으로 강제 Geolocation"이 필요할 때 Traffic Flow에서 복합 정책을 구성할 수 있다. 이 경우 Geolocation이 먼저 평가되고 매핑이 없으면 Geoproximity로 넘어가는 순서로 구성한다.

## Route 53 Resolver: 하이브리드 DNS 아키텍처

온프레미스와 AWS VPC가 연결된 하이브리드 환경에서 DNS 해석은 양방향 문제다. "AWS에서 온프레 도메인을 해석"하고 "온프레에서 AWS VPC 도메인을 해석"해야 한다. Route 53 Resolver가 이 양방향을 해결하는 관리형 서비스다.

### Inbound Endpoint: 온프레 → AWS 방향

온프레미스의 DNS 서버가 AWS 내 도메인(예: `app.internal.example.com`)을 해석하려 할 때, 온프레미스 DNS 서버가 Route 53 Resolver로 쿼리를 전달한다(DNS Forwarding).

```
[온프레미스 서버]
    DNS 쿼리: app.internal.example.com
        │
        ▼ (Direct Connect / VPN)
[Route 53 Resolver Inbound Endpoint]
    VPC 내 ENI (Subnet별 IP 할당)
    예: 10.0.1.254 (AZ-a), 10.0.2.254 (AZ-b)
        │
        ▼
[Route 53 Private Hosted Zone]
    app.internal.example.com → 10.0.5.100
        │
        ▼ 응답
[온프레미스 서버]
```

Inbound Endpoint 구성:
- VPC 내 최소 2개 AZ에 ENI가 생성된다 (고가용성)
- 온프레미스 DNS 서버에서 이 IP로 조건부 포워딩(Conditional Forwarding) 설정

### Outbound Endpoint: AWS → 온프레 방향

VPC 내 EC2가 온프레미스 도메인(예: `db.corp.internal`)을 해석하려 할 때, Route 53 Resolver가 온프레미스 DNS 서버로 쿼리를 전달한다.

```
[VPC 내 EC2]
    DNS 쿼리: db.corp.internal
        │
        ▼
[Route 53 Resolver] (기본 VPC DNS: 169.254.169.253)
    Resolver Rule 확인:
    corp.internal → 온프레미스 DNS 10.100.0.53으로 포워딩
        │
        ▼ (Direct Connect / VPN)
[Route 53 Resolver Outbound Endpoint]
    VPC 내 ENI를 소스로 쿼리 발신
        │
        ▼
[온프레미스 DNS 서버 10.100.0.53]
        │
        ▼ 응답
[VPC 내 EC2] → db.corp.internal = 10.100.50.30
```

**Resolver Rule의 종류**:
- **Forwarding Rule**: 특정 도메인을 지정된 DNS 서버로 전달
- **System Rule**: AWS 내장 도메인(amazonaws.com, ec2.internal) 처리
- **Recursive Rule**: 위 두 가지에 해당하지 않는 도메인을 퍼블릭 DNS로 재귀 해석

```bash
# Outbound Endpoint + Forwarding Rule 생성
aws route53resolver create-resolver-endpoint \
  --creator-request-id "outbound-ep-2026" \
  --direction OUTBOUND \
  --security-group-ids sg-0123456789abcdef0 \
  --ip-addresses \
    SubnetId=subnet-aaa,Ip=10.0.1.100 \
    SubnetId=subnet-bbb,Ip=10.0.2.100 \
  --name "CorpDNS-Outbound"

# Forwarding Rule: corp.internal → 온프레미스 DNS
aws route53resolver create-resolver-rule \
  --creator-request-id "rule-corp-internal" \
  --rule-type FORWARD \
  --name "forward-corp-internal" \
  --domain-name "corp.internal" \
  --target-ips Ip=10.100.0.53,Port=53 Ip=10.100.0.54,Port=53 \
  --resolver-endpoint-id rslvr-out-XXXXXXXXXX

# Rule을 VPC에 연결
aws route53resolver associate-resolver-rule \
  --resolver-rule-id rslvr-rr-XXXXXXXXXX \
  --vpc-id vpc-XXXXXXXXXX
```

> 📚 **사례**: 금융권 하이브리드 클라우드 설계 사례. 국내 한 대형 금융그룹은 온프레미스 Active Directory(AD DS)를 유지하면서 AWS 계정 30개를 운영한다. AD 도메인(finance.corp.internal)은 온프레미스에서만 해석 가능하고, AWS VPC 내 RDS, ElastiCache 등의 엔드포인트는 AWS Private Hosted Zone에서만 해석 가능하다. Route 53 Resolver Inbound + Outbound Endpoint + Forwarding Rule 조합으로 양방향 DNS 해석을 구성했다. Direct Connect Transit Gateway로 연결돼 DNS 쿼리 경로가 인터넷을 경유하지 않는다.

> 🔍 **더 깊이**: Resolver Endpoint는 고가용성을 위해 최소 2개 AZ에 생성하는 것이 표준이지만, DNS 쿼리 자체는 상태 비저장(stateless)이므로 단일 AZ 장애 시 자동으로 다른 AZ ENI로 전환된다. Outbound Endpoint의 소스 IP는 ENI에 할당된 프라이빗 IP다. 온프레미스 방화벽에서 이 IP를 DNS(UDP/TCP 53) 허용 목록에 추가해야 한다. 많은 하이브리드 환경에서 방화벽 룰 누락으로 DNS 포워딩이 안 되는 사고가 발생한다.

## 완전한 Hybrid DNS 설계 패턴

실제 엔터프라이즈에서 권장하는 풀 스택 패턴:

```
[온프레미스 Active Directory DNS]
    corp.internal 권한 서버
    ├── VPC 도메인(*.internal.aws)은 Route 53 Inbound EP로 포워딩
    └── 나머지는 자체 재귀 해석

[Direct Connect / VPN]

[Route 53 Resolver]
    ├── Inbound Endpoint (2 AZ): 온프레미스가 쿼리하는 타겟
    ├── Outbound Endpoint (2 AZ): VPC가 온프레미스로 쿼리 발신
    └── Resolver Rules:
        corp.internal → 온프레미스 DNS IP
        (default) → 퍼블릭 재귀

[Route 53 Private Hosted Zone]
    internal.aws (VPC 연결)
    ├── app.internal.aws → 10.0.5.100
    └── db.internal.aws → rds.ap-northeast-2.rds.amazonaws.com (CNAME)

[Route 53 Public Hosted Zone]
    example.com (인터넷 사용자용)
    ├── Geolocation 라우팅
    ├── Health Check 연동
    └── DNSSEC 서명 활성화
```

> 🎯 **시나리오**: 한 글로벌 제조회사가 서울 온프레미스 데이터센터와 AWS ap-northeast-2(VPC 3개)를 Direct Connect로 연결했다. 요구사항: (1) 온프레미스 Linux 서버가 AWS 내 ECS 서비스 디스커버리 도메인을 해석해야 한다. (2) AWS VPC 내 EC2가 온프레미스 Oracle RAC(rac01.mfg.corp)를 해석해야 한다. (3) 인터넷 사용자는 CloudFront를 통해 접근한다. 설계: Inbound Endpoint(온프레→AWS 방향), Outbound Endpoint + Forwarding Rule(AWS→온프레), Public Hosted Zone + CloudFront(인터넷 사용자). 모든 DNS 경로가 Direct Connect를 통해 인터넷을 우회한다.

## Multi-Value Answer 심화: 왜 ELB의 대안이 아닌가

Multi-Value Answer(MVA)는 ELB가 없는 환경에서 여러 IP에 트래픽을 분산하는 것처럼 보이지만, 실제로는 클라이언트 측 로드 밸런싱이다.

```
클라이언트 DNS 쿼리:
app.example.com (Multi-Value Answer)
    ↓
Route 53 응답:
10.0.1.100 (Healthy)
10.0.1.101 (Healthy)
10.0.1.102 (Unhealthy — 제외)
= 최대 8개 IP 반환 (Unhealthy는 제외)

클라이언트 동작:
받은 IP 목록에서 랜덤으로 하나 선택 → 연결
```

**왜 ELB 대안이 아닌가**:
1. 클라이언트 DNS 캐시가 TTL 동안 하나의 IP를 고집할 수 있다
2. 세션 지속성(Sticky Session)이 없다
3. L7 기능(헤더 변경, SSL 종료, 경로 기반 라우팅)이 없다
4. 서버 과부하 시 연결을 막는 Circuit Breaker가 없다

MVA는 "간단한 DNS 라운드로빈 + 비정상 서버 자동 제외"다. ELB보다 기능이 훨씬 적지만, 비용과 운영 복잡도도 훨씬 낮다.

> ⚠️ **함정**: MVA는 Health Check와 연동해야 비정상 서버를 제외할 수 있다. Health Check 없이 MVA를 구성하면 죽은 서버 IP도 반환된다. 시험에서 "ELB 없이 비정상 인스턴스 제외 + 여러 IP 분산"이라면 반드시 "MVA + Health Check 조합"을 확인해야 한다.

## TTL 전략: 변경 전 낮추고, 변경 후 높이기

Route 53 레코드의 TTL은 DNS 캐시 지속 시간이다. 변경 계획이 있을 때 TTL을 미리 낮추는 전략이 SAP 시험에 자주 등장한다.

```
평상시:
  TTL = 300초 (5분) — DNS 서버 부하 감소, 캐시 히트율 높음

변경 예정 24~48시간 전:
  TTL → 60초로 낮춤 (기존 TTL인 300초가 만료될 때까지 기다림)

변경 실행:
  DNS 레코드 변경 (IP 교체, 리전 전환 등)
  → 60초 이내 대부분 클라이언트가 새 레코드를 받음

변경 안정 후:
  TTL → 300초로 복원
```

DR 시나리오에서 "Route 53 Failover 후 전환 속도가 느리다"면, TTL을 낮추지 않은 상태에서 DNS 변경이 이루어진 케이스가 대부분이다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 Route 53 Failover 라우팅으로 Primary(us-east-1 ALB)와 Secondary(us-west-2 ALB)를 구성했다. Primary가 죽으면 Secondary로 자동 전환되어야 한다. 그런데 ALB는 VPC 내부에 있고 퍼블릭 IP가 없다. Route 53 Health Check를 어떻게 구성하는가?

A) Route 53 Health Checker가 ALB의 DNS를 직접 폴링한다
B) CloudWatch Alarm(ALB Target Group Unhealthy Host Count > 0)을 Health Check에 연동한다
C) ALB에 퍼블릭 IP를 붙이고 Health Check를 구성한다
D) 내부 ALB는 Health Check가 불필요하다

**정답: B**
해설: Route 53 Health Checker는 퍼블릭 인터넷에서 엔드포인트를 폴링한다. 하지만 ALB가 인터넷에서 접근 가능한 도메인을 가진다면 A도 작동한다. 단 문제에서 "VPC 내부, 퍼블릭 IP 없음"이라면 Health Checker가 도달할 수 없다. CloudWatch Alarm(ALB의 HealthyHostCount 또는 UnhealthyHostCount)을 Health Check에 연동하는 것이 Private 엔드포인트의 표준 패턴이다.

---

**문제 2.** 한 다국적 기업이 한국 사용자는 반드시 ap-northeast-2에서, 독일 사용자는 반드시 eu-central-1에서 데이터를 처리해야 한다(GDPR + K-ISMS 데이터 주권). 어떤 Route 53 라우팅 정책을 써야 하는가?

A) Latency-Based Routing (가장 빠른 리전으로)
B) Geolocation (국가 기반 강제 매핑)
C) Geoproximity (거리 기반 + Bias 조정)
D) Weighted (50:50 분배)

**정답: B**
해설: 데이터 주권은 "가장 빠른 리전"이 아니라 "법적으로 허용된 리전"을 강제한다. Geolocation은 국가/대륙 기반으로 완전히 결정론적으로 라우팅한다. Latency-Based는 성능 기반이라 한국 사용자가 일본 리전으로 갈 수 있다. Geoproximity도 거리 기반이라 데이터 주권 강제에 부적합하다. Geolocation에 Default 레코드를 추가해 매핑 없는 국가 사용자의 폴백을 설정해야 완전하다.

---

**문제 3.** Route 53 Geoproximity 정책에서 ap-northeast-2(서울)에 Bias +50을 설정했다. 일본 동부(도쿄 근처)의 사용자가 어디로 라우팅되는가?

A) 항상 ap-northeast-1(도쿄)으로 — 지리적으로 더 가깝기 때문
B) 서울로 — Bias +50으로 영향 반경이 확장돼 일본 동부까지 커버할 수 있다
C) 두 리전을 50:50으로 분배한다
D) Default 레코드로 폴백한다

**정답: B**
해설: Geoproximity의 Bias는 엔드포인트의 지리적 영향 반경을 조정한다. ap-northeast-2에 Bias +50을 설정하면 서울 리전의 "중력"이 커져 인접한 일본 동부 사용자도 서울로 라우팅될 수 있다. 반대로 ap-northeast-1에 Bias -50을 설정해도 같은 효과를 얻을 수 있다. Geoproximity 설정에는 Route 53 Traffic Flow가 필수다.

---

**문제 4.** 한 회사가 Route 53 DNSSEC를 example.com 호스팅 존에 활성화하려 한다. 활성화 절차의 올바른 순서는?

A) 도메인 등록기관에 DS 레코드 등록 → Route 53에서 KSK 생성 및 서명 활성화
B) Route 53에서 KSK 생성 및 서명 활성화 → 도메인 등록기관에 DS 레코드 등록
C) DNSSEC는 Route 53 콘솔에서 토글 하나로 자동 완료된다
D) DS 레코드는 자동으로 부모 도메인에 전파된다

**정답: B**
해설: 반드시 Route 53에서 서명을 먼저 활성화하고 그다음 DS 레코드를 등록해야 한다. 반대 순서로 하면 DS 레코드를 등록한 순간 검증기가 서명을 찾지만 없어서 SERVFAIL이 발생한다. KSK는 KMS CMK로 생성하고, `enable-hosted-zone-dnssec` 후 콘솔에서 DS 레코드 값을 확인해 도메인 등록기관에 수동으로 입력해야 한다. Route 53에서 도메인도 등록했다면 Route 53이 DS 등록을 자동으로 처리해준다.

---

**문제 5.** 온프레미스 Linux 서버(10.100.1.50)가 AWS VPC 내 RDS 인스턴스의 프라이빗 DNS(mydb.cluster-xyz.ap-northeast-2.rds.amazonaws.com)를 해석해야 한다. 어떤 구성이 필요한가?

A) 온프레미스 DNS 서버에 AWS RDS의 IP를 정적으로 입력
B) Route 53 Resolver Inbound Endpoint 생성 → 온프레미스 DNS에서 `.rds.amazonaws.com` 도메인을 Inbound EP IP로 조건부 포워딩 설정
C) Route 53 Resolver Outbound Endpoint 생성
D) AWS는 프라이빗 DNS를 온프레미스에서 해석할 수 없다

**정답: B**
해설: 온프레미스 → AWS 방향의 DNS 해석은 Inbound Endpoint가 담당한다. Inbound EP가 VPC 내 ENI를 생성하고, 온프레미스 DNS 서버가 `.rds.amazonaws.com` 도메인을 Inbound EP의 IP로 조건부 포워딩한다. 온프레미스 서버 → 온프레미스 DNS → Inbound EP → Route 53 Private Hosted Zone 또는 AWS 내부 DNS → RDS 프라이빗 IP 응답. Direct Connect 또는 VPN이 네트워크 경로로 존재해야 한다.

---

**문제 6.** Route 53 Multi-Value Answer와 ALB 중 어느 것이 "실시간 서버 부하에 따라 연결을 분배하고, 세션을 유지(Sticky Session)"하는 데 적합한가?

A) Multi-Value Answer — Route 53이 서버 부하를 인식해 분배
B) ALB — L7 기능 + Sticky Session + 서버 부하 인식 로드 밸런싱
C) Multi-Value Answer + CloudWatch 연동으로 세션 유지 가능
D) 두 가지 모두 동일한 기능을 제공한다

**정답: B**
해설: Multi-Value Answer는 DNS 레벨에서 여러 IP를 반환하는 것이며, 클라이언트가 랜덤으로 하나를 선택한다. 서버 부하 인식, Sticky Session, 실시간 연결 분배, L7 경로 기반 라우팅 모두 ALB의 기능이다. MVA는 ELB의 대안이 아니라 "ELB 없이 간단한 분산이 필요할 때"의 DNS 수준 해결책이다. SAP 시험에서 두 보기가 나오면 요구사항에 Sticky Session이나 실시간 부하 인식이 포함되면 ALB가 정답이다.

---

**문제 7.** 한 회사의 Calculated Health Check가 갑자기 Unhealthy로 전환됐다. 하위 Health Check 3개 중 2개는 Healthy, 1개는 Unhealthy다. 현재 Calculated HC의 임계치는 "3개 중 3개 모두 Healthy"로 설정돼 있다. 서비스는 실제로 정상 운영 중이다. 무엇이 문제인가?

A) Route 53의 버그다
B) 임계치가 너무 높다 — "3 중 3 모두"를 "3 중 2"로 낮춰야 한다
C) Calculated HC는 최대 2개 하위 HC만 지원한다
D) Unhealthy 하위 HC를 먼저 수동으로 Healthy로 바꿔야 한다

**정답: B**
해설: Calculated Health Check의 임계치가 "3 중 3"이면 하위 HC 하나라도 Unhealthy가 되면 전체가 Unhealthy가 된다. 실제 서비스가 정상 운영 중이라면 임계치를 "3 중 2"로 낮춰 다수결 방식으로 판정하는 것이 적합하다. 어떤 Health Checker 자체의 네트워크 문제로 하나가 간헐적으로 Unhealthy가 될 수 있고, 이때 전체 Failover가 발동하면 false positive다. 임계치 설계가 Health Check 설정에서 가장 중요한 결정 중 하나다.
