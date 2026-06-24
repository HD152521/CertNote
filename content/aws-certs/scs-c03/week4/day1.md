# Day 1 - AWS WAF: 웹 ACL, 규칙·규칙 그룹, 속도 기반 규칙, SQLi/XSS 방어

방화벽은 "막는 장치"처럼 들리지만, WAF(Web Application Firewall)의 본질은 "HTTP 요청을 검사해 통과/차단/카운트/CAPTCHA를 결정하는 정책 평가 엔진"이다. 네트워크 방화벽(Security Group, NACL)이 IP·포트·프로토콜의 4계층에서 동작한다면, AWS WAF는 7계층에서 HTTP 헤더·바디·URI·쿼리스트링·메서드·쿠키를 들여다본다. 보안 시험의 관점에서 핵심은 "어떤 요청이, 어떤 우선순위로, 어떤 액션으로 평가되는가"의 결정 모델을 정확히 이해하는 것이다.

AWS WAF(WAFv2)는 CloudFront, Application Load Balancer, API Gateway, AppSync GraphQL, Cognito User Pool, App Runner, Verified Access에 연결(associate)할 수 있다. 연결 지점이 CloudFront면 리소스는 `CLOUDFRONT` 스코프(us-east-1 글로벌), 그 외 리전 리소스면 `REGIONAL` 스코프다. 스코프를 잘못 고르면 Web ACL이 대상에 붙지 않는다 — 이것이 첫 번째 함정이다.

## Web ACL: 평가의 컨테이너

Web ACL(Web Access Control List)은 규칙(Rule)들의 정렬된 집합이다. 요청 하나가 들어오면 WAF는 규칙을 **우선순위(priority) 오름차순**으로 평가한다. 어떤 규칙이 **terminating action**(Allow/Block)을 내리면 평가는 즉시 종료된다. `Count`와 `CAPTCHA`/`Challenge`(아직 토큰 미발급 시 제외)는 비종료 액션이라 다음 규칙으로 계속 흐른다.

```
요청 → [Rule prio 0] → [Rule prio 1] → ... → [Default Action]
        ↓ Block               ↓ Count (계속)
       즉시 차단              다음 규칙으로
```

**Default Action**은 어떤 규칙도 매칭되지 않았을 때 적용된다. 두 가지 운영 철학이 갈린다:
- `Allow` 기본 + 위협을 Block 규칙으로 제거 → **블랙리스트(negative security)** 모델
- `Block` 기본 + 정상 트래픽만 Allow 규칙으로 통과 → **화이트리스트(positive security)** 모델

> 💡 **관련 이론**: 이것은 보안 정책 설계의 고전적 대립인 *default-deny vs default-allow*다. Saltzer & Schroeder의 1975년 보안 설계 원칙 중 "Fail-safe defaults"는 명시적으로 허용된 것 외에는 모두 거부하라고 권한다. WAF의 default Block 모델이 더 안전하지만, 정상 트래픽을 빠짐없이 화이트리스트로 정의하기 어려워 실무에서는 default Allow + 위협 규칙 조합이 흔하다. 위험 수용 수준에 따른 트레이드오프다.

## Rule: Statement, Action, Priority

규칙은 세 가지로 구성된다. **Statement**(무엇을 매칭할지), **Action**(매칭 시 무엇을 할지), **Priority**(평가 순서).

Statement는 중첩·결합이 가능하다:
- `ByteMatchStatement`: 특정 문자열이 헤더/URI/바디 등에 존재하는지
- `SqliMatchStatement` / `XssMatchStatement`: SQLi/XSS 패턴 탐지(관리형 휴리스틱)
- `GeoMatchStatement`: 출발지 국가 코드
- `IPSetReferenceStatement`: 사전 정의한 IP Set 참조
- `RateBasedStatement`: 속도 기반(아래 별도 섹션)
- `RegexPatternSetReferenceStatement`: 정규식 패턴 집합
- `LabelMatchStatement`: 앞선 규칙이 붙인 라벨 매칭
- 논리 결합: `AndStatement`, `OrStatement`, `NotStatement`

Action은 4가지:
- `Allow`: 통과(종료)
- `Block`: 차단(종료). 커스텀 응답(상태코드, 바디) 지정 가능
- `Count`: 매칭 기록만 하고 계속(섀도/테스트용)
- `CAPTCHA` / `Challenge`: 사람/정상 클라이언트 검증. 토큰 발급 후 통과

```json
{
  "Name": "BlockSQLi",
  "Priority": 10,
  "Statement": {
    "SqliMatchStatement": {
      "FieldToMatch": { "AllQueryArguments": {} },
      "TextTransformations": [
        { "Priority": 0, "Type": "URL_DECODE" },
        { "Priority": 1, "Type": "HTML_ENTITY_DECODE" },
        { "Priority": 2, "Type": "LOWERCASE" }
      ],
      "SensitivityLevel": "HIGH"
    }
  },
  "Action": { "Block": {} },
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "BlockSQLi"
  }
}
```

> ⚠️ **함정**: `TextTransformations`를 빠뜨리면 우회 공격에 취약하다. 공격자는 `SELECT`를 `SeLeCt`나 URL 인코딩(`%53ELECT`), HTML 엔티티(`&#83;ELECT`)로 숨긴다. WAF는 매칭 *전에* TextTransformation을 적용해 정규화한다. URL_DECODE, HTML_ENTITY_DECODE, LOWERCASE를 함께 적용하는 것이 SQLi/XSS 규칙의 기본 위생이다.

## CAPTCHA vs Challenge: 사람 vs 정상 클라이언트

두 액션은 비슷해 보이지만 검증 대상이 다르다.
- **CAPTCHA**: 퍼즐을 풀게 해 *사람*임을 검증. 사용자 마찰(friction)이 크다. 봇 차단·스크래핑 방어에 적합.
- **Challenge**: 클라이언트가 JavaScript를 실행하고 silent 토큰을 받을 수 있는 *정상 브라우저*인지 검증. 사용자 마찰이 거의 없다. 자동화 도구·헤드리스 봇 차단에 적합.

둘 다 통과하면 토큰(쿠키)이 발급되고, 토큰 유효기간(immunity time) 동안 재검증을 건너뛴다. API/머신 클라이언트가 많은 엔드포인트에 CAPTCHA를 걸면 정상 자동화까지 막히므로 신중해야 한다.

## 속도 기반 규칙(Rate-Based Rule): L7 DDoS·브루트포스 완화

`RateBasedStatement`는 지정 시간 창(기본 5분, 1분·2분·5분·10분 선택 가능) 동안 특정 키별 요청 수가 한계(limit, 최소 100)를 초과한 소스를 동적으로 차단한다.

```json
{
  "Name": "RateLimitPerIP",
  "Priority": 5,
  "Statement": {
    "RateBasedStatement": {
      "Limit": 2000,
      "EvaluationWindowSec": 300,
      "AggregateKeyType": "IP",
      "ScopeDownStatement": {
        "ByteMatchStatement": {
          "FieldToMatch": { "UriPath": {} },
          "PositionalConstraint": "STARTS_WITH",
          "SearchString": "/login",
          "TextTransformations": [{ "Priority": 0, "Type": "NONE" }]
        }
      }
    }
  },
  "Action": { "Block": {} }
}
```

핵심 옵션:
- `AggregateKeyType`: `IP`(소스 IP), `FORWARDED_IP`(X-Forwarded-For 등 헤더 — CloudFront/프록시 뒤일 때), `CUSTOM_KEYS`(헤더·쿠키·쿼리·HTTP 메서드 등을 조합한 키), `CONSTANT`(전체를 단일 버킷으로 — 엔드포인트 전역 한도)
- `ScopeDownStatement`: 속도 계산 대상을 좁힘. 위 예시는 `/login`으로 시작하는 요청만 카운트해 로그인 브루트포스를 완화한다.

> 🎯 **시나리오**: "로그인 엔드포인트 무차별 대입 공격(credential stuffing)을 완화"는 시험 빈출이다. 올바른 답: Rate-based rule + ScopeDownStatement(`/login`) + AggregateKey를 `CUSTOM_KEYS`로 잡아 IP뿐 아니라 `username` 쿼리/헤더별로도 집계 → 한 IP가 여러 계정을 돌려 시도하는 패턴까지 잡는다. 단순 IP 집계만으로는 분산 IP 공격을 놓친다.

> 💡 **관련 이론**: Rate-based rule은 네트워크의 token bucket/leaky bucket 레이트 리미팅을 L7로 끌어올린 것이다. 다만 WAF의 차단은 "초과한 순간 영구 차단"이 아니라, 차단 후 *해당 키의 요청률이 한계 아래로 다시 내려가면 자동 해제*되는 동적 모델이다. 즉 상태(state)를 가진 슬라이딩 평가이며, 정상화되면 스스로 회복한다.

## AWS Managed Rules: 휴리스틱을 빌려 쓰기

직접 정규식을 짜는 대신 AWS·마켓플레이스가 관리하는 **Managed Rule Group**을 규칙 그룹으로 끌어 쓸 수 있다.

| Managed Rule Group | 방어 대상 |
|--------------------|-----------|
| `AWSManagedRulesCommonRuleSet` (Core/CRS) | 광범위한 OWASP 위협, 큰 바디, 의심 URI |
| `AWSManagedRulesSQLiRuleSet` | SQL 인젝션 |
| `AWSManagedRulesKnownBadInputsRuleSet` | 알려진 익스플로잇 페이로드(Log4j 등) |
| `AWSManagedRulesLinuxRuleSet` / `UnixRuleSet` | LFI, 명령 인젝션 |
| `AWSManagedRulesAmazonIpReputationList` | AWS 위협 인텔 IP 평판 |
| `AWSManagedRulesBotControlRuleSet` | 봇 분류(추가 요금) |
| `AWSManagedRulesATPRuleSet` | 계정 탈취 방지(Account Takeover Prevention) |

운영 패턴:
- 새 관리형 그룹을 도입할 때는 먼저 **그룹 전체를 Count로 override**해 정상 트래픽 false positive를 측정한 뒤 Block으로 전환한다.
- 그룹 안의 특정 규칙만 끄려면 **rule action override**로 해당 규칙만 Count로 내린다(그룹 전체를 끄지 않음).

```json
{
  "Name": "AWS-Common",
  "Priority": 1,
  "OverrideAction": { "None": {} },
  "Statement": {
    "ManagedRuleGroupStatement": {
      "VendorName": "AWS",
      "Name": "AWSManagedRulesCommonRuleSet",
      "RuleActionOverrides": [
        { "Name": "SizeRestrictions_BODY", "ActionToUse": { "Count": {} } }
      ]
    }
  },
  "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "AWSCommon" }
}
```

> ⚠️ **함정**: `OverrideAction`(규칙 그룹 레벨)과 `Action`(개별 규칙 레벨)을 혼동하면 안 된다. 규칙 그룹 statement는 그룹이 내부적으로 액션을 가지므로, 컨테이너 규칙에는 `Action`이 아니라 `OverrideAction`을 쓴다. `OverrideAction: Count`는 "그룹 전체를 카운트 모드로" 의미한다.

## WAF Capacity Unit(WCU): 복잡도 예산

각 규칙은 평가 비용을 WCU로 환산한다. 기본 Web ACL은 1,500 WCU(요청 시 상향 가능). Rate-based, regex, managed group은 WCU 소모가 크다. 규칙을 무한정 추가할 수 없게 만드는 비용 모델이며, 규칙 설계 시 WCU 예산을 의식해야 한다.

## 로깅과 가시성: 차단을 증명하기

WAF 로그는 **CloudWatch Logs, S3, Kinesis Data Firehose**로 보낼 수 있다(로그 그룹 이름은 반드시 `aws-waf-logs-`로 시작). 로그에는 매칭된 규칙, terminatingRuleId, 라벨, 액션이 담겨 포렌식·튜닝의 근거가 된다. **RedactedFields**로 Authorization 헤더·비밀번호 필드를 로그에서 마스킹할 수 있어, 로그 자체가 자격증명 유출 경로가 되지 않게 한다.

```bash
aws wafv2 put-logging-configuration \
  --logging-configuration \
    ResourceArn=arn:aws:wafv2:us-east-1:111122223333:global/webacl/MyACL/abc,\
LogDestinationConfigs=arn:aws:firehose:us-east-1:111122223333:deliverystream/aws-waf-logs-stream,\
RedactedFields='[{SingleHeader={Name=authorization}}]'
```

> 🔍 **더 깊이**: WAF는 요청을 *동기적으로* 평가한 뒤 통과시키므로 약간의 지연을 추가하지만(보통 1ms 미만 수준), 의미상 중요한 점은 *연결 지점에서* 평가된다는 것이다. CloudFront에 붙은 Web ACL은 엣지 로케이션에서 평가되어 악성 트래픽이 오리진에 도달하기 전에 차단된다. ALB에 붙은 Web ACL은 리전 ALB에서 평가된다. 같은 규칙이라도 어디에 붙느냐가 "방어선이 얼마나 앞에 서는가"를 결정한다 — 이것이 4일차 엣지 통합으로 이어진다.

## Firewall Manager와의 관계

다계정(Organizations) 환경에서 Web ACL을 일관되게 강제하려면 **AWS Firewall Manager**로 WAF 정책을 중앙에서 배포한다. 새 ALB/CloudFront가 생성되면 정책에 정의된 규칙 그룹이 자동 적용되고, 비준수 리소스를 탐지·교정한다. 단일 계정에서는 WAF만으로 충분하지만, "조직 전체에 공통 베이스라인 WAF 규칙 강제"는 Firewall Manager가 정답이다.

---

## 📝 연습 문제

**문제 1.** Web ACL의 규칙들이 평가되는 방식으로 옳은 것은?

A) 모든 규칙을 동시에 평가해 가장 엄격한 액션을 적용한다  
B) 규칙을 priority 오름차순으로 평가하며, terminating action(Allow/Block)을 만나면 즉시 평가를 종료한다  
C) Block 규칙을 먼저, Allow 규칙을 나중에 평가한다  
D) Default Action을 먼저 적용한 뒤 규칙으로 예외를 만든다  

**정답: B**  
해설: WAF는 규칙을 priority 오름차순으로 순차 평가하고, Allow 또는 Block 같은 terminating action을 만나는 순간 평가를 멈춘다. Count와 (토큰 발급 후의) 비종료 액션은 다음 규칙으로 흐른다. 동시 평가(모든 규칙을 한꺼번에)는 동작 모델이 아니며, Block/Allow의 평가 순서가 고정돼 있지도 않다. Default Action은 어떤 규칙도 매칭되지 않았을 때 마지막에 적용된다.

---

**문제 2.** SQLi 탐지 규칙을 만들었는데 공격자가 `%53ELECT`처럼 URL 인코딩으로 우회한다. 가장 적절한 보완은?

A) 규칙을 Block에서 Count로 변경  
B) Rate-based rule로 전환  
C) FieldToMatch에 TextTransformation(URL_DECODE, HTML_ENTITY_DECODE, LOWERCASE)을 추가해 매칭 전 정규화  
D) Geo match로 해당 국가를 차단  

**정답: C**  
해설: WAF는 매칭 *전에* TextTransformation을 적용해 페이로드를 정규화한다. URL_DECODE는 `%53`을 `S`로 디코딩하고, HTML_ENTITY_DECODE는 엔티티를, LOWERCASE는 대소문자 변형을 무력화한다. 이를 누락하면 인코딩·케이스 변형 우회에 취약하다. Count 전환은 차단을 약화시키고, rate-based나 geo match는 인코딩 우회와 무관한 다른 차원의 통제다.

---

**문제 3.** 로그인 엔드포인트(`/login`)에 대한 credential stuffing을 완화하려 한다. 가장 정밀한 설계는?

A) 전체 Web ACL에 IP 집계 rate-based rule 하나만 적용  
B) `/login`을 ScopeDownStatement로 지정하고, AggregateKey를 CUSTOM_KEYS(IP + username)로 구성한 rate-based rule  
C) Default Action을 Block으로 바꾼다  
D) CAPTCHA를 모든 경로에 적용  

**정답: B**  
해설: ScopeDownStatement로 속도 계산 대상을 `/login`에 한정하면 다른 정상 트래픽이 영향받지 않는다. CUSTOM_KEYS로 IP와 username을 함께 집계하면, 한 IP가 여러 계정을 돌려 시도하거나 분산 IP가 한 계정을 노리는 패턴을 모두 포착한다. 전역 IP 집계만으로는 분산 공격을 놓치고, 전체 경로 CAPTCHA는 정상 사용자 마찰을 과도하게 키운다. Default Block은 전체 앱을 막아버린다.

---

**문제 4.** AWS Managed Rule Group을 새로 도입하면서 정상 트래픽 차단(false positive)을 사전에 측정하려 한다. 첫 단계로 가장 적절한 것은?

A) 규칙 그룹을 OverrideAction을 Count로 설정해 매칭만 기록하고 차단하지 않게 한다  
B) Web ACL Default Action을 Count로 설정  
C) 규칙 그룹을 일단 제거하고 나중에 추가  
D) WCU를 최대로 올린다  

**정답: A**  
해설: 관리형 규칙 그룹 도입의 모범 패턴은 먼저 `OverrideAction: Count`로 그룹 전체를 카운트 모드로 두고 CloudWatch 메트릭·샘플 요청으로 어떤 정상 트래픽이 매칭되는지 측정한 뒤, 안전이 확인되면 Block(None override)으로 전환하는 것이다. Default Action에는 Count가 없으며(Allow/Block만), 그룹을 제거하면 측정 자체가 불가능하고, WCU 상향은 false positive와 무관하다.

---

**문제 5.** CloudFront 배포에 WAF를 연결하려는데 Web ACL이 목록에 보이지 않는다. 가장 가능성 높은 원인은?

A) Web ACL이 REGIONAL 스코프로 생성되어 CLOUDFRONT(us-east-1 글로벌) 스코프 대상에 붙지 않는다  
B) WCU가 부족하다  
C) 로깅이 비활성화되어 있다  
D) Default Action이 Allow다  

**정답: A**  
해설: WAFv2 Web ACL은 스코프가 `CLOUDFRONT`(us-east-1에서 생성되는 글로벌 스코프)와 `REGIONAL`(ALB/API Gateway 등 리전 리소스)로 나뉜다. CloudFront에 연결하려면 반드시 CLOUDFRONT 스코프로 만들어야 하며, REGIONAL ACL은 CloudFront 대상 목록에 나타나지 않는다. WCU, 로깅, Default Action은 연결 가능 여부와 무관하다.

---
