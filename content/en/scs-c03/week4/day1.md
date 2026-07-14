# Day 1 - AWS WAF: Web ACLs, Rules and Rule Groups, Rate-Based Rules, SQLi/XSS Defense

Firewalls sound like "blocking devices," but WAF (Web Application Firewall)''s essence is a "policy evaluation engine inspecting HTTP requests to decide pass/block/count/CAPTCHA." Network firewalls (Security Group, NACL) operate at layer 4 (IP, port, protocol); AWS WAF operates at layer 7, inspecting HTTP headers, body, URI, query strings, methods, cookies. The exam''s key is precisely understanding the decision model: "which request, in which priority, with which action."

AWS WAF (WAFv2) attaches to CloudFront, Application Load Balancer, API Gateway, AppSync GraphQL, Cognito User Pool, App Runner, Verified Access. If attaching to CloudFront, scope is `CLOUDFRONT` (us-east-1 global); otherwise `REGIONAL`. Wrong scope = Web ACL doesn''t attach — first pitfall.

## Web ACL: Evaluation Container

Web ACL (Web Access Control List) is an ordered collection of rules. When a request arrives, WAF evaluates rules in **priority ascending order**. If any rule produces a **terminating action** (Allow/Block), evaluation stops immediately. `Count` and `CAPTCHA`/`Challenge` (unless token not yet issued) are non-terminating so flow to next rule.

```
Request → [Rule prio 0] → [Rule prio 1] → ... → [Default Action]
          ↓ Block           ↓ Count (continue)
         Immediate block    Next rule
```

**Default Action** applies when no rule matched. Two operational philosophies:
- `Allow` default + remove threats via Block rules → **blacklist (negative security)**
- `Block` default + pass good traffic via Allow rules → **whitelist (positive security)**

> 💡 **Related Theory**: Classic security policy clash: *default-deny vs default-allow*. Saltzer & Schroeder''s 1975 security design principles explicitly state: deny except what''s explicitly allowed. WAF''s default Block is safer, but defining all legitimate traffic in whitelist is hard, so default Allow + threat rules is common operationally. Risk-acceptance trade-off.

## Rule: Statement, Action, Priority

Rules have three components: **Statement** (what to match), **Action** (what to do on match), **Priority** (evaluation order).

Statement supports nesting and combination:
- `ByteMatchStatement`: String exists in header/URI/body
- `SqliMatchStatement` / `XssMatchStatement`: Detect SQLi/XSS patterns (managed heuristics)
- `GeoMatchStatement`: Source country code
- `IPSetReferenceStatement`: Reference predefined IP Set
- `RateBasedStatement`: Rate-based (separate section below)
- `RegexPatternSetReferenceStatement`: Regex pattern set
- `LabelMatchStatement`: Match labels set by prior rules
- Logic combination: `AndStatement`, `OrStatement`, `NotStatement`

Action has four types:
- `Allow`: Pass (terminates)
- `Block`: Block (terminates). Custom response (status, body) possible
- `Count`: Record match and continue (shadow/test)
- `CAPTCHA` / `Challenge`: Human/valid client verification. Token issued then passes

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

> ⚠️ **Pitfall**: Omit `TextTransformations` and you''re vulnerable to evasion. Attackers hide `SELECT` as `SeLeCt` or URL (`%53ELECT`) or HTML (`&#83;ELECT`). WAF applies TextTransformation *before* matching to normalize. URL_DECODE, HTML_ENTITY_DECODE, LOWERCASE together are baseline hygiene for SQLi/XSS rules.

## CAPTCHA vs Challenge: Human vs Browser

Two actions appear similar but verify different things:
- **CAPTCHA**: Solve puzzle to verify *human*. High user friction. Good for bot blocking, scraping defense.
- **Challenge**: Client runs JavaScript, gets silent token proving *valid browser capable of executing*. Almost no user friction. Good for blocking automation tools, headless bots.

Both issue token (cookie) on pass; immunity time skips re-verification. If API/machine clients hit CAPTCHA'd endpoints, legitimate automation breaks too — use carefully.

## Rate-Based Rules: L7 DDoS, Brute Force Mitigation

`RateBasedStatement` dynamically blocks sources exceeding request count by key over a time window (default 5 min; choose 1/2/5/10 min), limit minimum 100.

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

Key options:
- `AggregateKeyType`: `IP` (source IP), `FORWARDED_IP` (X-Forwarded-For behind CloudFront/proxy), `CUSTOM_KEYS` (header/cookie/query/method combinations), `CONSTANT` (single bucket for entire endpoint)
- `ScopeDownStatement`: Narrow rate scope. Example above counts only requests starting with `/login` to mitigate login brute force.

> 🎯 **Scenario**: "Mitigate login credential stuffing" — common exam question. Correct: rate-based rule + ScopeDownStatement(`/login`) + AggregateKey as `CUSTOM_KEYS` (IP + username field) catches both one-IP-many-accounts and many-IPs-one-account patterns. IP-only aggregate misses distributed attacks.

> 💡 **Related Theory**: Rate-based lifts network token bucket/leaky bucket to L7, but WAF blocking isn''t "once over, permanently blocked." After blocking, once rate drops below limit, *that key auto-unblocks* — dynamic model with state, self-healing. Contrast with hard IP bans.

## AWS Managed Rules: Borrow Heuristics

Instead of writing regex, use **Managed Rule Group** from AWS/marketplace.

| Managed Rule Group | Defends Against |
|--------------------|-----------|
| `AWSManagedRulesCommonRuleSet` (Core/CRS) | Broad OWASP threats, large bodies, suspicious URIs |
| `AWSManagedRulesSQLiRuleSet` | SQL injection |
| `AWSManagedRulesKnownBadInputsRuleSet` | Known exploit payloads (Log4j, etc.) |
| `AWSManagedRulesLinuxRuleSet` / `UnixRuleSet` | LFI, command injection |
| `AWSManagedRulesAmazonIpReputationList` | AWS threat intel IP reputation |
| `AWSManagedRulesBotControlRuleSet` | Bot classification (extra fee) |
| `AWSManagedRulesATPRuleSet` | Account Takeover Prevention |

Operations pattern:
- When introducing new managed group, first **override entire group to Count** to measure legitimate traffic false positives, then switch to Block.
- To disable specific rule in group, **rule action override** that rule only to Count (don''t disable whole group).

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

> ⚠️ **Pitfall**: Don''t confuse `OverrideAction` (rule group level) with `Action` (individual rule level). Rule group statements have internal actions, so use `OverrideAction` not `Action`. `OverrideAction: Count` means "entire group in count mode."

## WAF Capacity Unit (WCU): Complexity Budget

Each rule costs WCU. Base Web ACL = 1,500 WCU (scalable on-request). Rate-based, regex, managed groups consume large WCU. Unlimited rule addition isn''t possible; WCU budget discipline required in rule design.

## Logging and Visibility: Proving Blocks

WAF logs go to **CloudWatch Logs, S3, Kinesis Data Firehose** (log group must start with `aws-waf-logs-`). Logs contain matched rules, terminatingRuleId, labels, actions for forensics/tuning. **RedactedFields** masks Authorization headers/password fields from logs, preventing logs themselves becoming credential leak path.

```bash
aws wafv2 put-logging-configuration \
  --logging-configuration \
    ResourceArn=arn:aws:wafv2:us-east-1:111122223333:global/webacl/MyACL/abc,\
LogDestinationConfigs=arn:aws:firehose:us-east-1:111122223333:deliverystream/aws-waf-logs-stream,\
RedactedFields=''[{SingleHeader={Name=authorization}}]''
```

> 🔍 **Deeper**: WAF evaluates synchronously before passing request (adds minimal <1ms latency typically), but importantly evaluation happens *at attachment point*. Web ACL on CloudFront evaluates at edge location — malicious traffic blocked before reaching origin. Web ACL on ALB evaluates at regional ALB. Same rule''s defense line position depends on attachment point — key to day 4 edge integration.

## Firewall Manager Relationship

In multi-account (Organizations) environments, enforce Web ACL consistently via **AWS Firewall Manager** deploying WAF policies centrally. New ALB/CloudFront auto-apply policy-defined rule groups; noncompliant resources detected/remediated. Single account needs only WAF, but "force common baseline WAF across organization" = Firewall Manager.

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
