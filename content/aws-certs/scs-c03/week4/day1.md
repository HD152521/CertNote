# Day 1 - AWS WAF: 웹 ACL, 규칙·규칙 그룹, 속도 기반 규칙, SQLi/XSS 방어

방화벽은 "막는 장치"처럼 들리지만, WAF(Web Application Firewall)의 본질은 "HTTP 요청을 검사해 통과/차단/카운트/CAPTCHA를 결정하는 정책 평가 엔진"이다. 네트워크 방화벽(Security Group, NACL)이 IP·포트·프로토콜의 4계층에서 동작한다면, AWS WAF는 7계층에서 HTTP 헤더·바디·URI·쿼리스트링·메서드·쿠키를 들여다본다. 보안 시험의 관점에서 핵심은 "어떤 요청이, 어떤 우선순위로, 어떤 액션으로 평가되는가"의 결정 모델을 정확히 이해하는 것이다.

AWS WAF(WAFv2)는 CloudFront, Application Load Balancer, API Gateway, AppSync GraphQL, Cognito User Pool, App Runner, Verified Access에 연결(associate)할 수 있다. 연결 지점이 CloudFront면 리소스는 `CLOUDFRONT` 스코프(us-east-1 글로벌), 그 외 리전 리소스면 `REGIONAL` 스코프다. 스코프를 잘못 고르면 Web ACL이 대상에 붙지 않는다 — 이것이 첫 번째 함정이다.

### WAF는 방화벽 지도의 어디에 있는가

"방화벽"이라는 단어 하나에 AWS는 서로 다른 네 개의 서비스를 담아 두었다. 시험이 반복해서 묻는 것은 각각이 *무엇을 볼 수 있는가*이며, 볼 수 없는 것은 막을 수도 없다.

| 통제 | 동작 계층 | 보는 것 | 상태 추적 | 붙는 방식 | 전형적 방어 |
|------|-----------|---------|-----------|-----------|-------------|
| **Security Group** | L3/L4 | 소스·대상 IP, 포트, 프로토콜, 참조된 SG | 상태 저장(응답 자동 허용) | ENI에 부착 | 서비스 노출 최소화, 계층 간 접근 제한 |
| **Network ACL** | L3/L4 | 서브넷 경계의 IP·포트 | 상태 비저장(양방향 규칙 필요) | 서브넷에 부착 | 서브넷 단위 광역 차단(블랙홀) |
| **AWS Network Firewall** | L3~L7 | 패킷 페이로드, TLS SNI, HTTP Host, IPS 시그니처 | 상태 저장/비저장 둘 다 | **라우팅으로 통과 강제** | 아웃바운드 도메인 통제, IPS/IDS |
| **AWS WAF** | L7(HTTP) | 메서드·URI·쿼리·헤더·쿠키·바디·JA3 지문 | 요청 단위(+속도 규칙은 상태 유지) | 리소스에 **연결(associate)** | SQLi/XSS, 봇, L7 flood, 인증 남용 |
| **AWS Shield** | L3/L4(+Advanced는 L7 조율) | 트래픽 볼륨·패킷 패턴 | 해당 없음(완화 엔진) | 자동/보호 리소스 등록 | 체적·상태 고갈 DDoS 흡수 |

이 표에서 읽어야 할 핵심은 **"부착 방식"** 열이다. Security Group은 ENI에 붙으므로 그 ENI를 지나는 트래픽은 예외 없이 평가된다. WAF는 *리소스에 연결*되므로 그 리소스를 거치지 않는 요청은 평가 자체가 일어나지 않는다. Network Firewall은 *라우팅*에 의존하므로 라우트 테이블이 잘못되면 규칙이 아무리 완벽해도 무력하다. 즉 WAF와 Network Firewall은 "규칙이 맞는가"보다 **"트래픽이 그 지점을 반드시 지나는가"**가 먼저 검증되어야 하는 통제다. 4일차의 오리진 잠금(OAC·prefix list·비밀 헤더)이 WAF 이야기의 연장선인 이유가 여기 있다.

> 📚 **사례**: 2019년 공개된 Capital One 침해 사건은 WAF를 "켰다"는 사실이 곧 안전을 뜻하지 않음을 보여 준 대표 사례다. 공격자는 잘못 구성된 웹 애플리케이션 방화벽을 통해 SSRF(서버 측 요청 위조)를 성공시켰고, 그 방화벽이 부여받고 있던 과도한 권한의 자격증명으로 S3 데이터에 접근했다. 여기서 얻을 교훈은 두 가지다. 첫째, **경계 방어는 그 뒤에 있는 권한 설계를 대신하지 못한다** — WAF를 통과한 요청이 곧바로 광범위한 데이터 접근 권한과 만나면 한 겹의 실패가 전체 실패가 된다. 둘째, **보안 장비 자신도 최소 권한의 대상**이다. 이 사건 이후 인스턴스 메타데이터에 대한 SSRF 방어를 강화한 IMDSv2가 널리 권장되게 됐다. WAF는 심층 방어의 한 겹이지 마지막 겹이 아니다.

## Web ACL: 평가의 컨테이너

Web ACL(Web Access Control List)은 규칙(Rule)들의 정렬된 집합이다. 요청 하나가 들어오면 WAF는 규칙을 **우선순위(priority) 오름차순**으로 평가한다. 어떤 규칙이 **terminating action**(Allow/Block)을 내리면 평가는 즉시 종료된다. `Count`와 `CAPTCHA`/`Challenge`(아직 토큰 미발급 시 제외)는 비종료 액션이라 다음 규칙으로 계속 흐른다.

```
[ Web ACL 평가 파이프라인 — 우선순위 오름차순 ]

요청 도착
  │
  ├─ prio 0  IPSet 허용리스트(사내 IP)   ──Allow──→ [즉시 통과, 이후 규칙 평가 안 함]
  │                                     └미매칭─┐
  ├─ prio 1  IPSet 차단리스트(악성 IP)   ──Block─→ [즉시 차단]
  │                                     └미매칭─┐
  ├─ prio 5  RateBased(/login, 키별)     ──Block─→ [즉시 차단]
  │                                     └미매칭─┐
  ├─ prio 10 관리형 그룹 Common          ──Block─→ [즉시 차단]
  │           (그룹 내부도 자기 우선순위로 평가, 라벨을 붙임)
  │                                     └미매칭─┐
  ├─ prio 20 LabelMatch 기반 예외 처리   ──Allow/Count─→ (Count면 계속)
  │                                     └미매칭─┐
  └────────────────────────→ [Default Action: Allow 또는 Block]

  ※ terminating action = Allow / Block  → 평가 즉시 종료
  ※ non-terminating   = Count           → 다음 규칙으로 흐름
  ※ CAPTCHA/Challenge = 토큰 유효하면 비종료(통과 후 계속),
                        토큰 없으면 응답을 반환하며 종료
```

이 그림에서 가장 자주 실수하는 지점은 **"허용리스트를 뒤에 두는 것"**이다. 사내 IP를 예외 처리하는 규칙의 우선순위를 관리형 규칙 그룹보다 뒤에 두면, 관리형 그룹이 먼저 Block으로 종료해 버려 예외가 영영 평가되지 않는다. 반대로 허용리스트를 맨 앞에 두면 그 IP에서 온 요청은 SQLi 검사조차 받지 않는다 — 사내망이 침해되면 그대로 뚫린다. 그래서 실무에서는 "무조건 Allow" 대신 **`Count`로 관측하거나 특정 규칙만 예외 처리하는 라벨 방식**을 쓴다(아래 오탐 대응 절차 참고).

> ⚠️ **함정**: 우선순위 숫자는 **연속일 필요가 없고 유일하기만 하면 된다.** 실무에서 0, 1, 2로 붙여 두면 중간에 규칙 하나를 끼워 넣을 때 전부 재배치해야 하므로, 10·20·30처럼 간격을 두고 매기는 것이 관례다. 또한 우선순위는 규칙 그룹 *안*에도 따로 존재한다 — Web ACL 레벨 우선순위와 그룹 내부 우선순위는 별개의 축이므로, "그룹 안의 특정 규칙만 먼저 평가되게 하겠다"는 조작은 Web ACL 레벨에서는 불가능하다.

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

## 라벨(Label): 규칙 사이에 정보를 전달하는 통로

WAFv2의 설계에서 가장 실무적인 장치가 **라벨**이다. 규칙이 매칭되면 요청에 문자열 라벨을 붙일 수 있고, 뒤에 오는 규칙이 `LabelMatchStatement`로 그 라벨을 읽어 판단에 쓴다. 관리형 규칙 그룹은 자신이 매칭한 규칙마다 표준 라벨을 자동으로 붙여 주므로(`awswaf:managed:aws:<그룹>:<규칙>` 형태), 그룹 내부를 수정하지 못하더라도 **"그룹이 무엇 때문에 걸었는지"를 근거로 예외를 만들 수 있다.**

```json
{
  "Rules": [
    {
      "Name": "AWS-Common-CountOnly",
      "Priority": 10,
      "OverrideAction": { "Count": {} },
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesCommonRuleSet"
        }
      },
      "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "CommonCount" }
    },
    {
      "Name": "BlockCommonExceptAdminUpload",
      "Priority": 11,
      "Statement": {
        "AndStatement": {
          "Statements": [
            { "LabelMatchStatement": { "Scope": "LABEL", "Key": "awswaf:managed:aws:core-rule-set:SizeRestrictions_BODY" } },
            { "NotStatement": {
                "Statement": {
                  "ByteMatchStatement": {
                    "FieldToMatch": { "UriPath": {} },
                    "PositionalConstraint": "STARTS_WITH",
                    "SearchString": "/admin/upload",
                    "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
                  }
                }
            }}
          ]
        }
      },
      "Action": { "Block": {} },
      "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "BlockSizeExceptUpload" }
    }
  ]
}
```

이 두 규칙이 함께 하는 일은 이렇다. 관리형 그룹은 `Count`로 내려 두어 **절대 스스로 차단하지 않게** 만들고(라벨만 붙인다), 바로 뒤의 자체 규칙이 "`SizeRestrictions_BODY` 라벨이 붙었고 **그리고** 그 요청이 `/admin/upload` 경로가 *아닐 때만*" 차단한다. 결과적으로 대용량 업로드가 정당한 관리자 경로 하나만 예외가 되고, 나머지 경로에서는 관리형 규칙의 보호가 그대로 유지된다.

> 💡 **관련 이론**: 라벨은 규칙 엔진에 *상태 없는 파이프라인 사이의 메시지 전달*을 도입한 것이다. 규칙 하나하나는 여전히 요청을 독립적으로 판단하지만, 앞 단계가 남긴 주석을 뒤 단계가 읽을 수 있게 되면서 "탐지(무엇에 걸렸는가)"와 "정책 결정(그래서 어떻게 할 것인가)"이 분리된다. 이 분리가 중요한 이유는, 탐지 로직은 AWS가 관리형으로 계속 개선해 주는 자산인데 정책 결정은 조직마다 다르기 때문이다. 라벨이 없다면 예외 하나 때문에 관리형 그룹 전체를 꺼야 하고, 그 순간 AWS가 제공하는 지속적 위협 인텔의 혜택을 통째로 잃는다. **관리형 그룹을 통째로 끄는 답은 시험에서 거의 항상 오답이다.**

## 오탐 대응 절차: Count → 관측 → 예외 → Block

WAF 운영에서 실제로 시간을 잡아먹는 일은 규칙을 만드는 것이 아니라 *정상 트래픽이 걸렸을 때 안전하게 푸는 것*이다. 절차를 고정해 두지 않으면 "일단 규칙을 꺼서 서비스를 살린다"는 임시 조치가 영구화된다.

```
[ 오탐(false positive) 대응 표준 절차 ]

1) 관측 모드로 배포
   OverrideAction: Count  (그룹 전체) 또는 RuleActionOverrides로 개별 규칙만 Count
   → 차단은 0건. 메트릭과 샘플 요청만 쌓인다.
        │
2) 데이터 수집 (최소 1~2주, 트래픽 주기를 한 바퀴 돌 만큼)
   - CloudWatch 메트릭: 규칙별 CountedRequests 추이
   - Sampled requests(콘솔): 최근 매칭 요청 원문
   - WAF 로그(S3) + Athena: 어떤 URI/UA/고객이 걸리는지 정량 분석
        │
3) 걸린 요청이 정상인지 판정
   정상  → 예외 설계로 진행
   악성  → 그대로 Block 전환 (예외 불필요)
        │
4) 예외는 "가장 좁게" 설계 — 우선순위대로 선호
   (a) LabelMatch + 경로/헤더 조건으로 그 규칙 하나만 무력화  ← 최선
   (b) RuleActionOverrides로 특정 규칙만 Count 유지
   (c) ScopeDownStatement로 그룹 자체의 평가 대상 축소
   (d) IPSet 전면 허용                                        ← 최후, 가급적 피함
        │
5) Block 전환 + 회귀 감시
   OverrideAction: None 으로 되돌리고,
   BlockedRequests 급증 알람을 걸어 재발을 즉시 포착
```

```bash
# 2단계에서 실제로 두드리는 명령들
# 규칙 그룹 안에서 어떤 규칙이 몇 번 매칭됐는지 (관리형 그룹은 Rule 차원 메트릭 제공)
aws cloudwatch get-metric-statistics \
  --namespace AWS/WAFV2 \
  --metric-name CountedRequests \
  --dimensions Name=WebACL,Value=prod-edge-acl Name=Rule,Value=AWS-Common Name=Region,Value=CloudFront \
  --start-time 2026-07-01T00:00:00Z --end-time 2026-07-08T00:00:00Z \
  --period 3600 --statistics Sum

# 최근 매칭 요청 원문을 직접 본다 (규칙 튜닝의 1차 근거)
aws wafv2 get-sampled-requests \
  --web-acl-arn arn:aws:wafv2:us-east-1:111122223333:global/webacl/prod-edge-acl/abc-123 \
  --rule-metric-name AWSCommon \
  --scope CLOUDFRONT \
  --time-window StartTime=2026-07-07T00:00:00Z,EndTime=2026-07-07T01:00:00Z \
  --max-items 100

# 5단계: Count → Block 전환은 Web ACL 전체 업데이트이므로 LockToken이 필요하다
aws wafv2 get-web-acl --name prod-edge-acl --scope CLOUDFRONT --id abc-123 \
  --query '{Token:LockToken}'
aws wafv2 update-web-acl --name prod-edge-acl --scope CLOUDFRONT --id abc-123 \
  --lock-token <위에서 받은 토큰> \
  --default-action Allow={} \
  --rules file://rules.json \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=prodEdgeAcl
```

> ⚠️ **함정**: `update-web-acl`은 **전체 규칙 배열을 통째로 교체**한다. 부분 수정 API가 아니므로, 현재 구성을 `get-web-acl`로 받아 수정한 뒤 전부 다시 보내야 한다. 여기서 실수하면 다른 팀이 추가해 둔 규칙이 조용히 사라진다. 또한 `LockToken`은 낙관적 동시성 제어(optimistic locking) 장치다 — 다른 사람이 그 사이 변경했다면 토큰이 무효화되어 요청이 거부된다. 이 구조 때문에 WAF 규칙은 콘솔 수작업보다 **IaC(CloudFormation/Terraform)로 관리하는 것이 사실상 필수**다.

> 🎯 **시나리오**: "새 관리형 규칙 그룹을 도입했더니 특정 고객사의 API 호출만 차단된다. 그 고객사의 통신은 계속 검사하되 문제가 된 규칙 하나만 풀어야 한다"가 나오면, 정답의 뼈대는 **문제 규칙을 `RuleActionOverrides`로 Count로 내리거나, 라벨 매칭 + 조건(해당 API 경로/헤더)으로 좁은 예외를 만드는 것**이다. "그룹을 제거한다", "그 고객사 IP를 IPSet으로 전면 허용한다"는 보기는 보호 범위를 필요 이상으로 잃으므로 오답이다. 시험은 거의 항상 *가장 좁은 예외*를 정답으로 삼는다.

## IP Set·Geo·정규식: 자체 규칙의 재료들

관리형 그룹이 다루지 않는 조직 고유의 통제는 직접 만든다. 세 가지 재료가 반복해서 등장한다.

```bash
# 1) IP Set: 악성 IP·사내 IP 목록을 규칙과 분리해 관리 (규칙 수정 없이 목록만 갱신 가능)
aws wafv2 create-ip-set \
  --name corp-egress-ips --scope CLOUDFRONT \
  --ip-address-version IPV4 \
  --addresses 203.0.113.0/24 198.51.100.10/32

# 2) 정규식 패턴 집합: 여러 규칙이 공유하는 패턴을 한 곳에서 관리
aws wafv2 create-regex-pattern-set \
  --name sensitive-paths --scope CLOUDFRONT \
  --regular-expression-list '[{"RegexString":"^/(admin|internal|debug)/"}]'

# 3) 현재 연결 상태 확인 — "왜 안 막히지"의 첫 점검
aws wafv2 list-resources-for-web-acl \
  --web-acl-arn arn:aws:wafv2:ap-northeast-2:111122223333:regional/webacl/app-acl/def-456 \
  --resource-type APPLICATION_LOAD_BALANCER
```

지역 차단은 `GeoMatchStatement`로 처리하되, 단독 차단보다 **다른 조건과 결합**하는 편이 실무적이다. 아래는 "관리자 경로에는 지정 국가에서 들어온 요청만 통과"라는, 화이트리스트형 지역 통제다.

```json
{
  "Name": "AdminPathGeoAllowlist",
  "Priority": 3,
  "Statement": {
    "AndStatement": {
      "Statements": [
        {
          "ByteMatchStatement": {
            "FieldToMatch": { "UriPath": {} },
            "PositionalConstraint": "STARTS_WITH",
            "SearchString": "/admin",
            "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
          }
        },
        {
          "NotStatement": {
            "Statement": {
              "GeoMatchStatement": { "CountryCodes": ["KR", "JP"] }
            }
          }
        }
      ]
    }
  },
  "Action": {
    "Block": {
      "CustomResponse": { "ResponseCode": 403 }
    }
  },
  "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "AdminGeoAllowlist" }
}
```

> ⚠️ **함정**: 지역 차단은 **컴플라이언스 통제이지 보안 통제가 아니다.** VPN·프록시·탈취된 국내 호스트를 경유하면 그대로 우회된다. 시험에서 "특정 국가에서만 서비스해야 하는 법적 요구"에는 GeoMatch가 정답이지만, "공격자를 막아야 한다"에 GeoMatch만 제시된 보기는 대개 오답이다. 또한 CloudFront 뒤에서 ALB의 WAF가 지역을 판정하려면 원 클라이언트 IP를 봐야 하므로 `ForwardedIPConfig`를 지정해야 한다 — 이를 빠뜨리면 CloudFront 엣지의 IP를 기준으로 판정해 엉뚱한 국가가 나온다.

## WAF Capacity Unit(WCU): 복잡도 예산

각 규칙은 평가 비용을 WCU로 환산한다. 기본 Web ACL은 1,500 WCU(요청 시 상향 가능). Rate-based, regex, managed group은 WCU 소모가 크다. 규칙을 무한정 추가할 수 없게 만드는 비용 모델이며, 규칙 설계 시 WCU 예산을 의식해야 한다.

WCU를 단순한 쿼터로만 보면 시험에서 놓치는 것이 있다. WCU는 **"이 요청을 판정하는 데 얼마나 많은 연산을 쓰는가"의 대리 지표**이며, 그 연산은 모든 요청마다 실행된다. 관리형 그룹 몇 개를 무심코 얹으면 예산이 순식간에 소진되므로, 실무의 설계 순서는 다음과 같다.

- 관리형 그룹은 **필요한 것만** 얹는다. Linux 규칙 세트를 Windows 워크로드에 붙이는 식의 낭비가 흔하다.
- 그룹에 `ScopeDownStatement`를 걸어 평가 대상 자체를 좁힌다(예: 정적 자산 경로는 관리형 그룹 평가에서 제외).
- 정규식은 개수가 아니라 *복잡도*가 비용이다. 여러 패턴은 RegexPatternSet 하나로 묶는 편이 효율적이다.
- 현재 소비량은 배포 전에 확인할 수 있다.

```bash
# 규칙 묶음이 소비할 WCU를 배포 전에 계산해 본다
aws wafv2 check-capacity \
  --scope CLOUDFRONT \
  --rules file://rules.json

# Web ACL의 현재 용량·규칙 구성 확인
aws wafv2 get-web-acl --name prod-edge-acl --scope CLOUDFRONT --id abc-123 \
  --query 'WebACL.{Capacity:Capacity,Rules:Rules[].{Name:Name,Priority:Priority}}'
```

> 🔍 **더 깊이**: WCU 예산이 존재한다는 사실 자체가 WAF의 성격을 드러낸다. WAF는 *인라인 동기 평가기*이므로, 규칙이 무거워지면 그 비용을 모든 정상 사용자가 지연으로 나눠 낸다. 그래서 WAF는 "모든 위협을 잡는 만능 검사기"가 아니라 **"싸게 잡을 수 있는 위협을 앞단에서 대량으로 걷어 내는 체"**로 설계해야 한다. 정교하지만 비싼 판정 — 예컨대 세션 전체 맥락을 봐야 하는 이상 행위 탐지 — 은 WAF가 아니라 애플리케이션이나 비동기 탐지(GuardDuty·로그 분석)의 몫이다. 통제를 어느 지점에 두느냐는 정확도뿐 아니라 *비용 구조*의 문제이기도 하다.

## Bot Control과 ATP: 요금이 따로 붙는 특수 그룹

`AWSManagedRulesBotControlRuleSet`(봇 제어)과 `AWSManagedRulesATPRuleSet`(계정 탈취 방지)는 일반 관리형 그룹과 성격이 다르다. 추가 요금이 붙고, 단순 패턴 매칭이 아니라 **행위·평판 기반 판정**을 한다.

| 구분 | Bot Control | ATP(Account Takeover Prevention) |
|------|-------------|----------------------------------|
| 목적 | 자동화된 클라이언트 식별·분류 | 로그인 엔드포인트 남용 차단 |
| 보는 것 | UA·TLS 지문·행위 패턴·평판 | 로그인 요청/응답, 자격증명 유출 여부 |
| 대표 라벨 | `bot:category:*`(search_engine, scraper 등), `bot:verified` | `signal:credential_compromised`, `aggregate:volumetric` 등 |
| 전형적 대응 | 검증된 검색엔진 봇은 Allow, 스크래퍼는 Block/CAPTCHA | 유출 자격증명 사용 시 CAPTCHA·Block |
| 요금 | 별도 과금 | 별도 과금 |

Bot Control의 실무 가치는 "봇을 막는다"가 아니라 **"봇을 분류해 차등 대우한다"**는 데 있다. 검색엔진 크롤러를 막으면 SEO가 무너지고, 결제사 콜백을 막으면 매출이 멈춘다. 그래서 Bot Control은 라벨을 붙이는 도구로 쓰고, 그 라벨을 자체 규칙이 읽어 카테고리별로 다른 액션을 준다.

ATP는 로그인 요청의 **응답까지** 본다는 점이 독특하다. 요청만 보는 다른 규칙과 달리 성공/실패 응답을 관찰해 "이 IP가 실패를 반복하다 갑자기 성공했다" 같은 신호를 만든다. 시험에서 "credential stuffing 대응"에는 rate-based rule이 기본 정답이지만, "유출된 자격증명이 사용되는 것을 탐지"가 명시되면 ATP가 답이 된다.

> 🎯 **시나리오**: "가격 정보를 긁어 가는 스크래퍼는 막되, 검색엔진 크롤러는 그대로 통과시켜야 한다"가 나오면 정답은 **Bot Control 활성화 → `bot:category` 라벨로 분기 → verified 크롤러는 Allow, scraper 카테고리는 Block 또는 CAPTCHA**다. User-Agent 문자열만으로 구분하는 답은 오답이다 — UA는 임의로 위조할 수 있고, 실제로 스크래퍼가 가장 먼저 하는 일이 크롤러 UA를 흉내 내는 것이다.

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

Firewall Manager의 WAF 정책이 흥미로운 지점은 **중앙 규칙과 팀 규칙을 공존시키는 방식**이다. 정책은 "이 규칙 그룹들은 항상 맨 앞에(first), 이 규칙 그룹들은 항상 맨 뒤에(last)" 배치하도록 강제하고, 그 사이 구간은 각 팀이 자유롭게 채우게 남겨 둔다. 조직 베이스라인은 우회 불가능하게 유지하면서 팀별 자율성은 보존하는 절충이다. 이 구조를 모르면 "중앙에서 강제하면 팀이 규칙을 못 만든다"는 잘못된 전제로 오답을 고르게 된다.

> 💡 **관련 이론**: 이는 정책 계층화(policy layering)의 전형이다. SCP가 계정 권한의 상한선을 그어 놓고 그 안에서 IAM이 자유롭게 움직이듯, Firewall Manager는 WAF 규칙의 앞뒤를 못 박아 두고 가운데를 위임한다. **"바깥은 강제, 안쪽은 위임"**이라는 같은 형태가 AWS 거버넌스 전반에 반복된다 — SCP·권한 경계·Config Conformance Pack·Firewall Manager가 모두 이 모양이다. 시험에서 "조직 전체에 강제하되 팀의 운영은 막지 말라"는 요구가 보이면 이 계층화 패턴을 떠올리면 된다.

> 📚 **사례**: 2021년 12월 공개된 Log4Shell(Log4j의 원격 코드 실행 취약점)은 관리형 규칙 그룹의 가치를 가장 극적으로 보여 준 사건이다. 취약점이 공개된 직후 전 세계에서 `${jndi:ldap://...}` 형태의 페이로드가 헤더·URI·바디를 가리지 않고 대량으로 쏟아졌고, 각 조직이 자체 정규식을 짜서 대응하기에는 시간이 절대적으로 부족했다. 이때 실효적이었던 대응은 **알려진 악성 입력 계열의 관리형 규칙 그룹을 즉시 적용해 시간을 벌고, 그 사이에 실제 패치를 진행하는 것**이었다. 여기서 얻을 교훈이 WAF의 본질을 요약한다 — **WAF는 취약점을 고치지 않는다. 패치할 시간을 벌어 줄 뿐이다.** 이를 "가상 패치(virtual patching)"라 부르며, 가상 패치를 영구 대책으로 착각하는 순간 그 조직은 우회 페이로드 하나에 다시 뚫린다. 시험에서도 "WAF 규칙으로 취약점을 해결했다"는 보기는 대개 오답이고, "임시 완화 후 근본 수정"이 정답의 형태다.

## 정리하며

AWS WAF를 한 문장으로 줄이면 **"HTTP 요청을 우선순위대로 평가해 통과·차단·관측·검증 중 하나를 고르는 인라인 정책 엔진"**이다. 이 문장에서 시험이 반복해 파고드는 지점은 네 곳이다.

첫째, **평가 모델**이다. 우선순위 오름차순, terminating action(Allow/Block)에서 즉시 종료, Count는 비종료. 이 규칙만 정확히 알면 "허용 예외가 왜 동작하지 않는가", "관리형 그룹과 자체 규칙의 순서를 어떻게 잡는가" 같은 문제가 전부 풀린다.

둘째, **연결 지점**이다. CLOUDFRONT 스코프와 REGIONAL 스코프는 서로 붙지 않고, WAF는 자신이 연결된 리소스를 지나는 요청만 본다. 그래서 WAF 문제는 거의 항상 "오리진 직접 접근을 막았는가"라는 4일차 주제와 한 몸이다.

셋째, **정규화와 좁은 예외**다. TextTransformation 없는 SQLi/XSS 규칙은 인코딩 한 번에 우회되고, 관리형 그룹을 통째로 끄는 예외는 보호를 통째로 잃는다. Count로 관측하고 라벨로 좁게 푸는 절차가 정답의 기본형이다.

넷째, **WAF의 한계를 아는 것**이다. WAF는 L7 HTTP만 본다. 체적 DDoS는 Shield가 흡수하고(2일차), VPC 내부 트래픽과 아웃바운드 도메인은 Network Firewall이 검사하며(3일차), 그 모든 통제가 우회되지 않도록 경계를 한 줄로 정렬하는 일은 CloudFront와 오리진 잠금이 맡는다(4일차). 오늘 배운 규칙 엔진은 그 경계 위에 놓이는 첫 번째 체이며, 체 하나로 모든 것을 거를 수 있다고 믿는 순간 설계가 무너진다.

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
