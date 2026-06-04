# Day 22 - Route 53 라우팅 정책 7종: DNS가 아키텍처를 결정한다

DNS를 "도메인을 IP로 바꿔주는 것"으로만 알고 있다면 Route 53의 절반도 이해한 게 아니다. AWS는 Route 53을 단순 DNS 해석기가 아닌 **트래픽 라우팅 엔진**으로 설계했다. 라우팅 정책 7종은 각각 다른 알고리즘으로 어느 엔드포인트에 응답을 내려줄지 결정한다. SAP-C02에서 이 7종의 차이를 정확히 구분하지 못하면, "가장 가까운 리전" 문제에서 Geolocation을 고르거나 "국가별 격리" 문제에서 Latency를 고르는 실수를 저지른다.

오늘은 각 정책이 **왜 그렇게 동작하는지 — 내부 알고리즘과 DNS 프로토콜 수준**에서 이해하고, 시나리오별 판단 근거를 완성한다.

## DNS 프로토콜 기초: Route 53이 작동하는 층

Route 53은 **Authoritative DNS** 역할을 한다. 사용자가 `app.example.com`을 입력하면:

1. 사용자 OS → **Recursive Resolver** (ISP 또는 Google 8.8.8.8)에 쿼리
2. Recursive Resolver → NS(Name Server) 레코드 추적 → **Route 53 Name Server**에 도달
3. Route 53이 라우팅 정책 평가 → 응답 IP 반환
4. Recursive Resolver → 결과를 TTL 동안 캐시 → 사용자에게 반환

여기서 중요한 점: **Route 53의 라우팅 정책은 Recursive Resolver의 캐싱에 의해 실시간이 아니다.** TTL이 300초면 5분 동안 같은 IP를 캐시한다. 페일오버 정책으로 전환하더라도 클라이언트가 TTL 만료 전까지는 구 IP로 계속 간다. 이것이 DNS 기반 페일오버의 근본적인 한계다.

> 💡 **관련 이론**: DNS TTL 최적화는 "안정성 vs 변경 속도"의 트레이드오프다. TTL이 길면(3600초) 쿼리 수가 줄고 캐시 효율이 높지만, 레코드 변경 시 전파가 느리다. TTL이 짧으면(10초) 변경이 빠르지만 모든 클라이언트가 자주 쿼리해 비용·지연이 증가한다. 페일오버를 예상한다면 평소 TTL을 낮게 유지(60~120초)하거나, RFC 8767이 권장하는 "급박한 변경 전 TTL을 낮추고 변경 후 다시 올리는" 2단계 전략을 쓴다.

> 🔍 **더 깊이**: Route 53은 EDNS0 Client Subnet(ECS, RFC 7871)을 지원한다. 일반 DNS 쿼리는 Recursive Resolver의 IP만 전달하지만, ECS는 실제 클라이언트의 서브넷(/24 or /32)까지 Route 53에 알려준다. Latency-Based Routing과 Geolocation이 실제 사용자 위치를 더 정확히 판단하는 기반이 된다. 단 모든 Recursive Resolver가 ECS를 지원하지 않으므로 100% 정확하지는 않다.

## 라우팅 정책 7종: 알고리즘 수준 이해

### 1. Simple (단순)

가장 기본. 하나의 레코드에 하나 또는 여러 IP를 반환한다. 여러 IP를 넣으면 Route 53이 무작위 순서로 반환한다. Health Check 불가(단독으로).

**언제**: 단일 엔드포인트, 헬스 체크 불필요, 로드 분산도 불필요.

### 2. Weighted (가중치)

같은 이름에 여러 레코드를 만들고 각각 **가중치(0~255)**를 부여한다. 요청이 올 때마다 가중치 비율로 IP를 반환한다. 동작 예: 레코드 A(weight=90) + B(weight=10) → 90%:10% 비율.

**내부 알고리즘**: 총 가중치 합계를 구하고 0~합계 범위의 난수를 뽑아 구간에 맞는 레코드 반환. weight=0은 트래픽 전혀 안 받음(하지만 레코드 삭제 없이 차단 가능).

**언제**: A/B 테스트, 카나리 배포, Blue/Green 트래픽 전환.

> ⚠️ **함정**: Weighted 라우팅은 "정확한 비율"이 아니다. DNS 응답을 캐시한 클라이언트는 TTL 동안 같은 IP로 계속 가므로, 실제 서버 도달 트래픽 비율은 설정 가중치와 다를 수 있다. 정확한 트래픽 분배가 필요하다면 ALB의 Target Group Weight나 API Gateway Stage Variable을 쓰는 것이 더 정밀하다.

### 3. Latency-Based Routing (LBR)

Route 53이 **여러 리전의 레이턴시 데이터베이스**를 관리한다. Recursive Resolver의 위치(ECS 사용 시 클라이언트 위치)를 기반으로, 어느 AWS 리전이 가장 지연이 적은지 판단해 해당 리전의 레코드를 반환한다.

**핵심 오해 교정**: LBR은 지리적 거리가 아니라 **실측된 네트워크 지연**을 기준으로 한다. 도쿄보다 물리적으로 먼 싱가포르가 더 빠를 수도 있다. Route 53은 자체 지연 측정 데이터를 주기적으로 업데이트해 라우팅 결정에 사용한다.

**언제**: 글로벌 사용자에게 가장 빠른 리전 자동 라우팅, 데이터 주권 제약이 없는 경우.

### 4. Failover (페일오버)

Primary와 Secondary 두 레코드를 만들고 Health Check를 연결한다. Primary가 실패하면 Secondary로 자동 전환. Active-Passive DR의 핵심.

**Health Check와의 연동**: Route 53 Health Check가 Primary를 지속적으로 폴링한다. 실패 임계치를 넘으면 (기본 3회 연속 실패) Unhealthy로 표시하고 Secondary IP를 반환하기 시작한다.

**페일오버 속도 계산**: Health Check 간격 30초 × 실패 임계치 3회 = 최대 90초 후 전환 시작. TTL이 60초라면 DNS 전파까지 최대 90+60=150초(2.5분) 소요.

> 💡 **관련 이론**: TCP SYN 기반 Health Check vs HTTP Health Check. HTTP는 상태 코드까지 확인하므로 앱 계층 장애(200 OK가 아닌 응답)를 감지한다. TCP는 포트 접속 성공만 확인하므로 앱이 죽어도 TCP 스택이 살면 Healthy로 오탐할 수 있다. 중요 시스템은 반드시 HTTP(S) Health Check + 응답 body 검증(String Match)을 쓴다.

### 5. Geolocation (지리적 위치)

사용자의 **국가 또는 대륙**을 기준으로 라우팅한다. "한국 사용자 → 서울 리전, 독일 사용자 → 아일랜드 리전" 같은 규칙.

**LBR과의 핵심 차이**:
- LBR: "어디가 빠른가" (성능 기준)
- Geolocation: "어느 국가인가" (위치 기준)

한국 사용자가 VPN을 써서 미국 IP처럼 보이면, LBR은 미국 리전으로 보내지만 Geolocation은 여전히 한국으로 분류할 수 있다(ECS 기반 실제 위치).

**Default 레코드 필수**: 매핑되지 않은 국가의 사용자를 위한 Default 레코드를 설정하지 않으면 NXDOMAIN 반환.

**언제**: GDPR 등 데이터 주권, 지역별 컨텐츠·언어 다른 경우, 규제로 특정 리전만 허용.

### 6. Geoproximity (지리적 근접)

지리적 거리를 기반으로 하되 **bias**를 더해 경계를 임의로 조정한다. Traffic Flow에서만 사용 가능.

- Bias +50: 해당 리전의 라우팅 경계를 키움 (더 많은 사용자가 이 리전으로)
- Bias -50: 경계를 줄임

**언제**: 지리적 분배를 조정하되 Geolocation의 "국가 단위" 경계보다 더 유연하게 바이어스를 줘야 할 때. 예: 서울 리전과 도쿄 리전 사이의 경계를 위도 기준으로 조정.

> ⚠️ **함정**: Geoproximity는 Traffic Flow 없이는 설정 불가. Traffic Flow는 월별 과금이 추가된다. 시험에서 "가장 비용 효율적으로 지리적 라우팅"이라면 Geolocation이 Traffic Flow 없이도 쓸 수 있다.

### 7. Multi-Value Answer (다중값 응답)

최대 8개 IP를 반환하고, 각 IP에 Health Check를 연결한다. Unhealthy IP는 자동으로 응답에서 제외된다.

**Simple과의 차이**: Simple은 모든 IP를 항상 반환(Unhealthy도 포함), Multi-Value는 Healthy IP만 반환.
**ELB와의 차이**: Multi-Value는 DNS 레벨 분산이고, ELB는 커넥션 레벨 분산. Multi-Value는 로드 밸런서 없이 간단한 분산을 제공한다.

**언제**: ELB 없이 여러 EC2 IP를 분산하면서 헬스 체크도 필요한 경우. "ELB를 쓰지 않는" 제약이 있는 레거시 시스템.

## 7종 비교표: 시나리오 즉시 판단

| 라우팅 정책 | 결정 기준 | Health Check | 대표 시나리오 |
|-----------|---------|------------|------------|
| Simple | 없음 (단순 반환) | ❌ | 단일 엔드포인트 |
| Weighted | 가중치 비율 | ✅ | 카나리, A/B 테스트 |
| Latency-Based | 실측 지연 | ✅ | 글로벌 성능 최적 |
| Failover | Primary/Secondary Health | ✅ | DR Active-Passive |
| Geolocation | 국가/대륙 | ✅ | 데이터 주권, 지역별 컨텐츠 |
| Geoproximity | 지리 거리 + Bias | ✅ | 세밀한 지리 경계 조정 |
| Multi-Value | 다중 IP (Healthy만) | ✅ | ELB 없이 다중 분산 |

> 🎯 **시나리오**: "회사가 ap-northeast-2와 us-east-1을 운영하며, 동아시아 사용자에게는 서울, 북미 사용자에게는 버지니아를 제공하려 한다. 단, 규제상 한국 사용자 데이터는 서울에만 있어야 한다." — 답: Geolocation. 이유: LBR은 성능 기반이라 한국 사용자라도 순간적으로 us-east-1이 빠르면 거기로 보낼 수 있다. Geolocation은 한국 IP면 반드시 서울으로 보내어 데이터 주권을 보장한다.

## Alias vs CNAME: apex 도메인 문제

DNS 표준(RFC 1034)은 CNAME 레코드를 Zone Apex(루트 도메인, 예: `example.com`)에 사용하는 것을 금지한다. Zone Apex에는 SOA와 NS 레코드가 있어야 하는데, CNAME은 그 도메인의 모든 레코드를 alias 대상으로 override해버리기 때문이다.

AWS는 이 제한을 우회하기 위해 **Alias 레코드**를 만들었다. Alias는 DNS 표준 밖의 AWS 고유 기능이다.

| 항목 | Alias | CNAME |
|-----|-------|-------|
| Zone Apex 사용 | ✅ | ❌ (RFC 금지) |
| AWS 리소스 가리킬 때 | ✅ 무료 쿼리 | ❌ (CNAME 자체는 가능, 근데 apex 불가) |
| 대상 | ALB, CloudFront, S3 Website, API GW, GA 등 | 임의 도메인 |
| TTL | AWS가 자동 관리 | 사용자 설정 |
| Health Check 평가 | ✅ EvaluateTargetHealth | ❌ |

`EvaluateTargetHealth=true`로 설정하면 ALB나 CloudFront가 비정상일 때 Alias가 자동으로 그 레코드를 건너뛴다. Failover 정책과 함께 쓰면 ALB 레벨 장애도 Route 53이 감지할 수 있다.

> 💡 **관련 이론**: RFC 2181에서 DNS는 CNAME이 있는 레코드에 다른 레코드를 추가하는 것을 금지한다("CNAME and other data"). Zone Apex에는 반드시 NS와 SOA가 있어야 하므로 CNAME을 apex에 두면 그 도메인 전체가 broken이 된다. AWS Alias는 이것을 내부적으로 A 레코드처럼 처리해 표준 위반 없이 apex에서 ALB를 가리킬 수 있다.

## Health Check 4종: 알고리즘과 사용법

### Endpoint Health Check

HTTP/HTTPS/TCP로 직접 폴링한다. 설정 옵션:
- **간격**: 10초(빠름, 추가 비용) 또는 30초(기본)
- **실패 임계치**: 1~10 (기본 3)
- **문자열 매칭**: 응답 body 처음 5,120바이트에서 특정 문자열 확인

Route 53 Health Check는 **전 세계 10여 개 PoP에서 동시 폴링**한다. 18개 중 18%가 실패(약 3개 PoP)하면 Unhealthy로 판정한다. 단일 지점 장애가 아닌 분산 판정이므로 네트워크 지역 장애에 더 정확하다.

### Calculated Health Check

다수의 Health Check를 AND/OR 논리로 조합한다. 예: "DB Health Check AND App Health Check AND CDN Health Check 세 개 모두 Healthy면 Healthy".

복잡한 서비스 의존성을 표현할 때 사용한다. 최대 255개 Health Check를 하나의 Calculated로 묶을 수 있다.

### CloudWatch Alarm Health Check

Route 53이 직접 폴링할 수 없는 내부 리소스(예: VPC Private Subnet의 RDS)의 상태를 간접 판단한다. CloudWatch Metric Alarm이 ALARM 상태가 되면 Health Check도 Unhealthy로 간주한다.

### Route 53 ARC Routing Control

수동 온/오프 스위치. 엔지니어가 콘솔이나 API로 직접 전환한다. 앞서 Day 21에서 설명한 ARC의 핵심 구성 요소.

> 📚 **사례**: 2021년 Fastly CDN 글로벌 장애. 단일 설정 오류로 Fastly 엣지의 85%가 약 1시간 다운됐다. 이 사건 이후 많은 기업이 CDN 오리진 직접 접근을 위한 Route 53 Failover를 백업으로 구성하기 시작했다. CloudFront Origin Failover + Route 53 Failover를 계층화해 CDN 장애 시 Origin에서 직접 서빙하는 패턴이다. 교훈: 단일 글로벌 CDN도 장애 포인트가 된다.

## Route 53 Resolver: 하이브리드 DNS 아키텍처

온프레미스와 AWS VPC를 Direct Connect나 VPN으로 연결하면 DNS 해석이 복잡해진다. 온프레미스 DNS 서버(`corp.example.com`)와 AWS Private Hosted Zone(`internal.example.com`)이 서로의 도메인을 해석해야 한다.

```
온프레미스 DNS                    AWS VPC
corp.example.com ──────────────► Route 53 Private Hosted Zone
                                  internal.example.com

Route 53 Resolver
  ├── Inbound Endpoint: 온프레→AWS (corp DNS가 포워딩)
  └── Outbound Endpoint: AWS→온프레 (VPC DNS가 포워딩)
      └── Resolver Rule: corp.example.com → 온프레 DNS IP
```

**Inbound Endpoint**: 온프레미스 DNS 서버가 AWS의 특정 도메인을 해석해야 할 때, Route 53 Resolver의 Inbound Endpoint IP로 쿼리를 포워딩한다. Route 53이 응답.

**Outbound Endpoint**: VPC 내 EC2가 온프레미스 도메인을 해석해야 할 때, Resolver Rule이 "이 도메인은 온프레미스 DNS IP로 포워딩"하도록 설정한다.

> 🔍 **더 깊이**: VPC 내 DNS는 기본적으로 VPC CIDR의 +2 주소(예: 10.0.0.2)를 쓴다. 이것이 Route 53 Resolver의 기본 엔드포인트다. Outbound Endpoint는 이 기본 해석기를 특정 도메인에 대해 재정의한다. 한 VPC에 여러 Resolver Rule을 쌓을 수 있고, 가장 구체적인 도메인 매칭 규칙이 우선한다.

## Route 53 DNS Firewall: DNS 계층 보안

DNS Firewall은 VPC 내 아웃바운드 DNS 쿼리를 필터링한다. 악성 도메인(C2 서버, 피싱 사이트)으로의 연결을 **DNS 단계**에서 차단한다. 전통적인 IDS/IPS가 패킷 레벨에서 차단하는 것과 달리, DNS Firewall은 도메인 이름 자체를 차단한다.

**동작**: EC2 또는 Lambda가 `malware.example.com`을 쿼리 → DNS Firewall Rule Group이 이 도메인을 차단 목록에서 확인 → NXDOMAIN 또는 Redirect 응답 반환 → 연결 시도 전에 차단.

**Managed Domain List**: AWS가 관리하는 위협 인텔리전스 기반 도메인 목록 (자동 업데이트).

> 💡 **관련 이론**: DNS over HTTPS(DoH, RFC 8484)와 DNS over TLS(DoT, RFC 7858)는 DNS 쿼리를 암호화해 중간 관찰을 막는다. 하지만 기업 환경에서는 이 암호화가 DNS Firewall을 우회하는 문제가 생긴다. AWS DNS Firewall은 VPC의 53번 포트 트래픽을 기본 경유하므로, DoH/DoT를 강제 사용하는 앱은 DNS Firewall를 피해갈 수 있다. VPC Security Group이나 Network Firewall로 443(DoH)/853(DoT) 포트를 특정 DNS 서버로만 허용하는 추가 보안 조치가 필요하다.

## 아키텍처 다이어그램: 계층화된 글로벌 라우팅

```
사용자 (서울)
    │ app.example.com 쿼리
    ▼
Recursive Resolver (KT DNS)
    │ ECS 서브넷 포함
    ▼
Route 53 Authoritative
    │
    ├── Geolocation: 한국 → ap-northeast-2 레코드 선택
    │     ├── Failover Primary: ALB-Seoul (Health OK)
    │     └── Failover Secondary: S3 Static (백업 페이지)
    │
    └── Geolocation: Default → us-east-1 레코드
          └── Weighted: 95% v1 + 5% v2 (카나리)

Route 53 Health Check (10초 간격)
    └── Endpoint: ALB-Seoul /health → 200 OK 확인
         └── String Match: "healthy"

Route 53 Resolver (VPC 내)
    ├── Inbound: 온프레미스 → internal.example.com 해석
    └── Outbound Rule: corp.example.com → 192.168.1.53 (온프레 DNS)
```

> 🎯 **시나리오**: 한 글로벌 SaaS 회사가 멀티 리전 Active-Active를 운영 중이다. "KR 사용자는 규제상 반드시 ap-northeast-2만 사용해야 하고, 나머지 사용자는 가장 가까운 리전을 선택하되, 리전 장애 시 자동 페일오버가 필요하다. 카나리 배포도 지원해야 한다." — 구성: KR → Geolocation(ap-northeast-2), 나머지 → Geolocation Default → LBR. 각 리전 내에서 Weighted로 카나리. 각 레코드에 Failover 연결.

## Private Hosted Zone 설계

Private Hosted Zone은 VPC 내부에서만 해석되는 사설 도메인이다. 인터넷에서는 보이지 않는다.

**다중 VPC 공유**: 같은 계정 또는 다른 계정의 여러 VPC를 하나의 Private Hosted Zone에 연결할 수 있다. 이를 통해 `rds.internal.example.com` 하나로 여러 환경(dev/stage/prod VPC)에서 DB 엔드포인트를 관리한다.

**Cross-Account 공유**: RAM(Resource Access Manager)으로 Resolver Rules를 다른 계정에 공유하거나, VPC Peering + Private Hosted Zone 연결로 크로스 계정 DNS를 구성한다.

> 📚 **사례**: Airbnb의 DNS 기반 서비스 디스커버리 (2016). Airbnb는 Route 53 Private Hosted Zone을 서비스 레지스트리로 사용해, 각 마이크로서비스를 `search-service.internal.airbnb.com`처럼 도메인으로 접근했다. 서비스가 EC2에서 ECS로 이전될 때 IP는 바뀌지만 도메인은 유지돼 다른 서비스의 코드 변경이 불필요했다. 교훈: DNS는 서비스 디스커버리의 단순하고 강력한 레이어다.

## Traffic Flow: 복잡한 라우팅의 GUI

Route 53 Traffic Flow는 여러 라우팅 정책을 트리 구조로 조합하는 비주얼 에디터다. 단독으로는 설정하기 어려운 "Geolocation → Latency → Failover" 3단계 중첩 같은 복잡한 규칙을 GUI로 만들고 버전 관리한다.

| Traffic Flow 쓰는 경우 | 직접 라우팅 정책 쓰는 경우 |
|---------------------|----------------------|
| Geoproximity 정책 필요 | 단일 정책으로 충분 |
| 여러 정책 중첩 | 간단한 시나리오 |
| 정책 버전 관리·롤백 | 변경이 드문 설정 |

비용: Traffic Flow 정책 레코드 하나당 월 $50. 복잡한 설정에만 사용한다.

## 📝 연습 문제

**문제 1.** 한 글로벌 미디어 회사가 새 버전 API를 배포하면서 초기에 전체 트래픽의 5%만 새 버전으로 보내려 한다. 구버전은 95%, 신버전은 5%. 어떤 라우팅 정책이 가장 적합한가?

A) Latency-Based Routing
B) Failover
C) Weighted (95:5)
D) Geolocation

**정답: C**
해설: 비율 기반 트래픽 분배 = Weighted. 구버전 weight=95, 신버전 weight=5로 설정한다. LBR은 성능 기준, Failover는 Primary/Secondary, Geolocation은 지역 기준으로 이 시나리오와 맞지 않는다.

---

**문제 2.** GDPR 규제로 EU 사용자 데이터는 eu-west-1에만 저장해야 한다. 한국 사용자는 ap-northeast-2에만 저장해야 한다. 어떤 라우팅 정책이 이 요구를 가장 정확히 충족하는가?

A) Latency-Based Routing
B) Geolocation
C) Geoproximity
D) Multi-Value

**정답: B**
해설: Geolocation은 사용자 국가/대륙을 기준으로 라우팅해 데이터 주권을 보장한다. LBR은 성능 기준이라 EU 사용자가 순간 us-east-1이 빠르면 거기로 보낼 수 있어 데이터 주권 위반 위험. Geoproximity는 Traffic Flow 필요 + bias 조정이지 국가 경계가 아님.

---

**문제 3.** `example.com` (Zone Apex)에 ALB를 연결하려 한다. 어떤 레코드 유형이 적합한가?

A) CNAME example.com → ALB DNS
B) A 레코드 Alias: example.com → ALB
C) MX 레코드
D) AAAA 레코드 (IPv6)

**정답: B**
해설: RFC 1034가 Zone Apex에 CNAME 금지. AWS Alias A 레코드는 DNS 표준을 우회해 apex에서 ALB를 가리킬 수 있다. Alias는 Route 53이 ALB DNS를 내부적으로 해석해 A 레코드처럼 응답하고, EvaluateTargetHealth까지 지원한다.

---

**문제 4.** 온프레미스 Active Directory DNS 서버가 `corp.example.com` 도메인을 관리한다. AWS VPC 내 EC2가 온프레미스 도메인(예: `db.corp.example.com`)을 해석해야 한다. 어떤 구성이 필요한가?

A) Route 53 Inbound Endpoint
B) Route 53 Outbound Endpoint + Resolver Rule
C) Public Hosted Zone 생성
D) VPN + Route 53 Failover

**정답: B**
해설: AWS → 온프레미스 방향 DNS 해석 = Outbound Endpoint. Resolver Rule에 `corp.example.com → 온프레미스 DNS IP`를 설정하면 VPC 내 EC2의 해당 도메인 쿼리가 온프레미스 DNS로 포워딩된다. Inbound Endpoint는 반대(온프레→AWS) 방향.

---

**문제 5.** 다수 Health Check(DB Check, App Check, CDN Check 각각)를 조합해, 셋 중 하나라도 실패하면 전체 페일오버가 발동하도록 설정하려 한다. 어떤 Health Check 유형을 쓰는가?

A) Endpoint Health Check (각각)
B) Calculated Health Check (AND 조건)
C) CloudWatch Alarm Health Check
D) ARC Routing Control

**정답: B**
해설: 여러 Health Check를 AND/OR 논리로 조합하는 것 = Calculated Health Check. 셋 모두 Healthy여야 Healthy(AND), 하나라도 실패하면 Unhealthy가 되어 페일오버 발동. Endpoint는 단일 엔드포인트만 확인.

---

**문제 6.** 한 회사가 여러 EC2 인스턴스 IP(6개)를 Load Balancer 없이 Route 53으로 분산하고 싶다. 비정상 인스턴스로의 트래픽은 자동으로 제외되어야 한다. 어떤 정책이 적합한가?

A) Simple (모든 IP 반환)
B) Weighted (각 IP 동일 weight)
C) Multi-Value Answer
D) Failover

**정답: C**
해설: Multi-Value Answer는 최대 8개 IP를 반환하고 각 IP에 Health Check를 연결해 Unhealthy IP를 자동 제외한다. Simple은 Unhealthy IP도 반환. Weighted는 Health Check 연결 가능하지만 최대 8개 멀티값 반환이 Multi-Value의 고유 기능이다.

---
