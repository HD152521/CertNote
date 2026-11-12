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

## 📝 Practice Questions

**Question 1.** Which description of how the rules in a Web ACL are evaluated is correct?

A) All rules are evaluated simultaneously and the strictest action is applied  
B) Rules are evaluated in ascending priority order, and evaluation ends immediately upon encountering a terminating action (Allow/Block)  
C) Block rules are evaluated first and Allow rules later  
D) The Default Action is applied first, and exceptions are made with rules  

**Answer: B**  
Explanation: WAF evaluates rules sequentially in ascending priority order and stops evaluation the moment it meets a terminating action such as Allow or Block. Count and non-terminating actions (after issuing a token) flow on to the next rule. Simultaneous evaluation (all rules at once) is not the operating model, nor is the evaluation order of Block/Allow fixed. The Default Action is applied last when no rule has matched.

---

**Question 2.** You created an SQLi detection rule, but attackers bypass it with URL encoding such as `%53ELECT`. What is the most appropriate supplement?

A) Change the rule from Block to Count  
B) Switch to a Rate-based rule  
C) Add TextTransformation (URL_DECODE, HTML_ENTITY_DECODE, LOWERCASE) to FieldToMatch to normalize before matching  
D) Block the country with Geo match  

**Answer: C**  
Explanation: WAF applies TextTransformation *before* matching to normalize the payload. URL_DECODE decodes `%53` to `S`, HTML_ENTITY_DECODE neutralizes entities, and LOWERCASE neutralizes case variations. If these are missing, it is vulnerable to encoding and case variation bypasses. Switching to Count weakens blocking, and rate-based or geo match are controls of a different dimension unrelated to encoding bypass.

---

**Question 3.** We want to mitigate credential stuffing against the login endpoint (`/login`). What is the most precise design?

A) Apply just one IP-aggregated rate-based rule to the entire Web ACL  
B) A rate-based rule that specifies `/login` as the ScopeDownStatement and configures the AggregateKey as CUSTOM_KEYS (IP + username)  
C) Change the Default Action to Block  
D) Apply CAPTCHA to all paths  

**Answer: B**  
Explanation: Limiting the rate calculation target to `/login` with a ScopeDownStatement leaves other legitimate traffic unaffected. Aggregating IP and username together with CUSTOM_KEYS captures both patterns in which one IP cycles through many accounts and in which distributed IPs target one account. Global IP aggregation alone misses distributed attacks, and CAPTCHA on all paths raises friction for legitimate users excessively. Default Block blocks the entire app.

---

**Question 4.** While introducing an AWS Managed Rule Group, we want to measure legitimate traffic being blocked (false positives) in advance. What is the most appropriate first step?

A) Set the rule group's OverrideAction to Count so it only records matches and does not block  
B) Set the Web ACL Default Action to Count  
C) Remove the rule group for now and add it later  
D) Raise the WCU to the maximum  

**Answer: A**  
Explanation: The best-practice pattern for introducing a managed rule group is to first put the entire group in count mode with `OverrideAction: Count`, measure which legitimate traffic matches using CloudWatch metrics and sampled requests, and then switch to Block (None override) once safety is confirmed. The Default Action has no Count (only Allow/Block), removing the group makes measurement itself impossible, and raising WCU has nothing to do with false positives.

---

**Question 5.** You are trying to associate WAF with a CloudFront distribution but the Web ACL does not appear in the list. What is the most likely cause?

A) The Web ACL was created with REGIONAL scope and so cannot be attached to a CLOUDFRONT (us-east-1 global) scope target  
B) The WCU is insufficient  
C) Logging is disabled  
D) The Default Action is Allow  

**Answer: A**  
Explanation: WAFv2 Web ACL scope is divided into `CLOUDFRONT` (a global scope created in us-east-1) and `REGIONAL` (Regional resources such as ALB/API Gateway). To associate with CloudFront, you must create it with the CLOUDFRONT scope, and a REGIONAL ACL does not appear in the CloudFront target list. WCU, logging, and Default Action have nothing to do with whether it can be associated.

---
