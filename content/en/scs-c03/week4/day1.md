# Day 1 - AWS WAF: Web ACLs, Rules and Rule Groups, Rate-Based Rules, SQLi/XSS Defense

A firewall sounds like "a device that blocks," but the essence of WAF (Web Application Firewall) is "a policy evaluation engine that inspects an HTTP request and decides whether to allow, block, count, or issue a CAPTCHA." Where network firewalls (Security Groups, NACLs) work at layer 4 on IP, port, and protocol, AWS WAF works at layer 7 and looks into HTTP headers, body, URI, query string, method, and cookies. From a security exam's point of view, the key is to understand precisely the decision model of "which request is evaluated, in what priority order, with what action."

AWS WAF (WAFv2) can be associated with CloudFront, Application Load Balancer, API Gateway, AppSync GraphQL, Cognito User Pool, App Runner, and Verified Access. If the association point is CloudFront, the resource has the `CLOUDFRONT` scope (global, in us-east-1); for any other regional resource it has the `REGIONAL` scope. If you pick the wrong scope, the Web ACL does not attach to the target — this is the first pitfall.

### Where WAF Sits on the Firewall Map

AWS packs four different services under the single word "firewall." What the exam asks about again and again is *what each one can see*, and what it cannot see it cannot block.

| Control | Layer of operation | What it sees | State tracking | How it attaches | Typical defense |
|------|-----------|---------|-----------|-----------|-------------|
| **Security Group** | L3/L4 | Source/destination IP, port, protocol, referenced SG | Stateful (responses automatically allowed) | Attached to the ENI | Minimize service exposure, restrict access between tiers |
| **Network ACL** | L3/L4 | IP and port at the subnet boundary | Stateless (rules needed in both directions) | Attached to the subnet | Broad subnet-level blocking (blackhole) |
| **AWS Network Firewall** | L3~L7 | Packet payload, TLS SNI, HTTP Host, IPS signatures | Both stateful and stateless | **Traffic is forced through it by routing** | Outbound domain control, IPS/IDS |
| **AWS WAF** | L7 (HTTP) | Method, URI, query, headers, cookies, body, JA3 fingerprint | Per request (+ rate rules keep state) | **Associated** with a resource | SQLi/XSS, bots, L7 floods, authentication abuse |
| **AWS Shield** | L3/L4 (+ Advanced coordinates L7) | Traffic volume and packet patterns | Not applicable (mitigation engine) | Automatic / protected resource registration | Absorbing volumetric and state-exhaustion DDoS |

What you should read in this table is the **"How it attaches"** column. A Security Group is attached to an ENI, so traffic passing through that ENI is evaluated without exception. WAF is *associated with a resource*, so a request that doesn't pass through that resource is never evaluated at all. Network Firewall depends on *routing*, so if the route tables are wrong, the rules are powerless no matter how perfect they are. In other words, for WAF and Network Firewall, what must be verified first is not "are the rules right" but **"does the traffic necessarily pass through that point."** This is why Day 4's origin lockdown (OAC, prefix list, secret header) is an extension of the WAF story.

The Capital One breach disclosed in 2019 is the classic case showing that having "turned on" WAF does not mean being safe. The attacker succeeded with SSRF (server-side request forgery) through a misconfigured web application firewall, and used the credentials with excessive permissions that the firewall had been granted to access S3 data. There are two lessons here. First, **perimeter defense does not substitute for the permission design behind it** — if a request that gets past WAF immediately meets broad data access permissions, the failure of one layer becomes total failure. Second, **the security appliance itself is also subject to least privilege.** After this incident, IMDSv2, which strengthens SSRF defense for instance metadata, came to be widely recommended. WAF is one layer of defense in depth, not the last layer.

## Web ACL: The Container for Evaluation

A Web ACL (Web Access Control List) is an ordered set of rules. When a request arrives, WAF evaluates the rules in **ascending priority order**. When a rule takes a **terminating action** (Allow/Block), evaluation ends immediately. `Count` and `CAPTCHA`/`Challenge` (except when no token has been issued yet) are non-terminating actions, so flow continues to the next rule.

```
[ Web ACL evaluation pipeline — ascending priority ]

Request arrives
  │
  ├─ prio 0  IPSet allowlist (corporate IPs)  ──Allow──→ [pass immediately, no further rules evaluated]
  │                                     └no match─┐
  ├─ prio 1  IPSet blocklist (malicious IPs)  ──Block─→ [block immediately]
  │                                     └no match─┐
  ├─ prio 5  RateBased(/login, per key)  ──Block─→ [block immediately]
  │                                     └no match─┐
  ├─ prio 10 Managed group Common        ──Block─→ [block immediately]
  │           (inside the group, rules are evaluated by their own priority and attach labels)
  │                                     └no match─┐
  ├─ prio 20 LabelMatch-based exception handling  ──Allow/Count─→ (if Count, continue)
  │                                     └no match─┐
  └────────────────────────→ [Default Action: Allow or Block]

  ※ terminating action = Allow / Block  → evaluation ends immediately
  ※ non-terminating   = Count           → flow continues to the next rule
  ※ CAPTCHA/Challenge = if the token is valid, non-terminating (passes and continues),
                        if there is no token, returns a response and terminates
```

The easy mistake in this picture is **"putting the allowlist later."** If you place the priority of the rule that exempts corporate IPs after the managed rule group, the managed group terminates with Block first, so the exception is never evaluated. Conversely, if you put the allowlist at the very front, requests from those IPs don't even get SQLi inspection — if the corporate network is compromised, the attacker walks straight through. So in practice, instead of "unconditional Allow," you use **the label approach: observe with `Count`, or exempt only specific rules** (see the false-positive response procedure below).

> ⚠️ **Pitfall**: Priority numbers **do not need to be consecutive; they only need to be unique.** If you number them 0, 1, 2 in practice, you have to renumber everything whenever you insert a rule in the middle, so the convention is to leave gaps like 10, 20, 30. Also, priorities exist separately *inside* a rule group — the Web ACL-level priority and the in-group priority are independent axes, so "making only a specific rule inside a group evaluate first" is impossible at the Web ACL level.

The **Default Action** applies when no rule matches. Two operating philosophies split here:
- `Allow` default + remove threats with Block rules → **blacklist (negative security)** model
- `Block` default + let only normal traffic through with Allow rules → **whitelist (positive security)** model

This is the classic opposition in security policy design: *default-deny vs default-allow*. Among Saltzer & Schroeder's 1975 security design principles, "Fail-safe defaults" recommends denying everything except what is explicitly permitted. WAF's default-Block model is safer, but since it is hard to define all normal traffic as a whitelist without gaps, the combination of default Allow + threat rules is common in practice. It is a trade-off according to the level of risk acceptance.

## Rule: Statement, Action, Priority

A rule consists of three parts. **Statement** (what to match), **Action** (what to do on a match), **Priority** (evaluation order).

Statements can be nested and combined:
- `ByteMatchStatement`: whether a particular string exists in the header/URI/body etc.
- `SqliMatchStatement` / `XssMatchStatement`: SQLi/XSS pattern detection (managed heuristics)
- `GeoMatchStatement`: source country code
- `IPSetReferenceStatement`: references a predefined IP Set
- `RateBasedStatement`: rate-based (separate section below)
- `RegexPatternSetReferenceStatement`: a set of regex patterns
- `LabelMatchStatement`: matches a label attached by an earlier rule
- Logical combinations: `AndStatement`, `OrStatement`, `NotStatement`

There are four Actions:
- `Allow`: pass (terminating)
- `Block`: block (terminating). A custom response (status code, body) can be specified
- `Count`: only record the match and continue (for shadow/testing)
- `CAPTCHA` / `Challenge`: verify a human/legitimate client. Pass after a token is issued

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

> ⚠️ **Pitfall**: If you omit `TextTransformations`, you are vulnerable to evasion attacks. Attackers hide `SELECT` as `SeLeCt`, as URL encoding (`%53ELECT`), or as an HTML entity (`&#83;ELECT`). WAF applies TextTransformation *before* matching to normalize. Applying URL_DECODE, HTML_ENTITY_DECODE, and LOWERCASE together is the basic hygiene of SQLi/XSS rules.

## CAPTCHA vs Challenge: Human vs Legitimate Client

The two actions look similar but verify different things.
- **CAPTCHA**: has the user solve a puzzle to verify they are a *human*. User friction is high. Suited to blocking bots and defending against scraping.
- **Challenge**: verifies that the client is a *legitimate browser* that can run JavaScript and receive a silent token. There is almost no user friction. Suited to blocking automation tools and headless bots.

When either passes, a token (cookie) is issued, and re-verification is skipped during the token's validity period (immunity time). If you put CAPTCHA on an endpoint with many API/machine clients, even legitimate automation gets blocked, so be careful.

## Rate-Based Rule: Mitigating L7 DDoS and Brute Force

`RateBasedStatement` dynamically blocks sources whose per-key request count exceeds the limit (minimum 100) within a specified time window (default 5 minutes; 1, 2, 5, or 10 minutes selectable).

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
- `AggregateKeyType`: `IP` (source IP), `FORWARDED_IP` (a header such as X-Forwarded-For — when behind CloudFront/a proxy), `CUSTOM_KEYS` (a key combining headers, cookies, query, HTTP method, etc.), `CONSTANT` (the whole thing as a single bucket — an endpoint-wide limit)
- `ScopeDownStatement`: narrows what is counted toward the rate. The example above counts only requests starting with `/login`, mitigating login brute force.

> 🎯 **Scenario**: "Mitigate a brute-force attack on the login endpoint (credential stuffing)" is a classic scenario. The correct answer: a rate-based rule + ScopeDownStatement (`/login`) + AggregateKey set to `CUSTOM_KEYS` so that it aggregates not only by IP but also per `username` query/header → this catches the pattern where one IP tries many accounts. Simple IP aggregation alone misses distributed-IP attacks.

A rate-based rule lifts the network's token bucket/leaky bucket rate limiting up to L7. However, WAF's block is not "permanent block the moment the limit is exceeded"; it is a dynamic model in which, after blocking, *the block is automatically lifted once the request rate for that key drops back below the limit*. That is, it is a sliding evaluation with state, and it recovers by itself once things return to normal.

## AWS Managed Rules: Borrowing Heuristics

Instead of writing regexes yourself, you can pull in **Managed Rule Groups** maintained by AWS and the Marketplace as rule groups.

| Managed Rule Group | What it defends against |
|--------------------|-----------|
| `AWSManagedRulesCommonRuleSet` (Core/CRS) | Broad OWASP threats, large bodies, suspicious URIs |
| `AWSManagedRulesSQLiRuleSet` | SQL injection |
| `AWSManagedRulesKnownBadInputsRuleSet` | Known exploit payloads (Log4j, etc.) |
| `AWSManagedRulesLinuxRuleSet` / `UnixRuleSet` | LFI, command injection |
| `AWSManagedRulesAmazonIpReputationList` | AWS threat-intelligence IP reputation |
| `AWSManagedRulesBotControlRuleSet` | Bot classification (extra charge) |
| `AWSManagedRulesATPRuleSet` | Account Takeover Prevention |

Operating patterns:
- When introducing a new managed group, first **override the whole group to Count** to measure false positives on normal traffic, then switch to Block.
- To turn off only a specific rule inside a group, use a **rule action override** to drop only that rule to Count (without turning off the whole group).

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

Do not confuse `OverrideAction` (rule group level) with `Action` (individual rule level). Since a rule group statement has actions inside the group, a container rule uses `OverrideAction`, not `Action`. `OverrideAction: Count` means "the whole group in count mode."

## Labels: A Channel for Passing Information Between Rules

The most practical device in WAFv2's design is the **label**. When a rule matches, it can attach a string label to the request, and a later rule can read that label with a `LabelMatchStatement` to make its decision. Managed rule groups automatically attach a standard label for each rule they match (in the form `awswaf:managed:aws:<group>:<rule>`), so even if you can't modify the inside of the group, **you can build exceptions based on "what the group flagged it for."**

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

Here is what these two rules do together. The managed group is dropped to `Count` so that it **never blocks on its own** (it only attaches labels), and the own rule right after it blocks only when "the `SizeRestrictions_BODY` label is attached **and** the request is *not* on the `/admin/upload` path." As a result, only the one legitimate admin path where large uploads are valid becomes an exception, and the managed rule's protection stays intact on all other paths.

Labels introduced *message passing between stateless pipeline stages* into the rule engine. Each rule still judges the request independently, but once later stages can read the annotations that earlier stages left, "detection (what did it trip on)" and "policy decision (so what should we do about it)" get separated. This separation matters because detection logic is an asset that AWS keeps improving as a managed service, while policy decisions differ by organization. Without labels, one exception would force you to turn off the entire managed group, and at that moment you would lose the benefit of the continuous threat intelligence AWS provides, all at once. **An answer that turns off a managed group wholesale is usually wrong on the exam.**

## False-Positive Response Procedure: Count → Observe → Exception → Block

What actually eats time in WAF operations is not creating rules but *safely loosening them when legitimate traffic gets caught*. If the procedure is not fixed in advance, the stopgap of "turn the rule off for now to save the service" becomes permanent.

```
[ Standard procedure for responding to false positives ]

1) Deploy in observation mode
   OverrideAction: Count  (whole group) or only individual rules to Count via RuleActionOverrides
   → Zero blocks. Only metrics and sampled requests accumulate.
        │
2) Collect data (at least 1~2 weeks, long enough to cover one full traffic cycle)
   - CloudWatch metrics: trend of CountedRequests per rule
   - Sampled requests (console): raw recent matching requests
   - WAF logs (S3) + Athena: quantitative analysis of which URIs/UAs/customers get caught
        │
3) Judge whether the caught requests are legitimate
   Legitimate  → proceed to exception design
   Malicious   → switch to Block as is (no exception needed)
        │
4) Design the exception "as narrowly as possible" — preferred in this order
   (a) LabelMatch + path/header condition to neutralize just that one rule  ← best
   (b) RuleActionOverrides to keep only a specific rule at Count
   (c) ScopeDownStatement to narrow what the group itself evaluates
   (d) Blanket IPSet allow                                        ← last resort, avoid if possible
        │
5) Switch to Block + regression monitoring
   Set OverrideAction back to None,
   and set an alarm on a BlockedRequests surge to catch any recurrence immediately
```

```bash
# Commands you actually run at step 2
# How many times each rule inside a rule group matched (managed groups provide Rule-dimension metrics)
aws cloudwatch get-metric-statistics \
  --namespace AWS/WAFV2 \
  --metric-name CountedRequests \
  --dimensions Name=WebACL,Value=prod-edge-acl Name=Rule,Value=AWS-Common Name=Region,Value=CloudFront \
  --start-time 2026-07-01T00:00:00Z --end-time 2026-07-08T00:00:00Z \
  --period 3600 --statistics Sum

# Look directly at the raw recent matching requests (the primary basis for rule tuning)
aws wafv2 get-sampled-requests \
  --web-acl-arn arn:aws:wafv2:us-east-1:111122223333:global/webacl/prod-edge-acl/abc-123 \
  --rule-metric-name AWSCommon \
  --scope CLOUDFRONT \
  --time-window StartTime=2026-07-07T00:00:00Z,EndTime=2026-07-07T01:00:00Z \
  --max-items 100

# Step 5: switching Count → Block is a full Web ACL update, so a LockToken is needed
aws wafv2 get-web-acl --name prod-edge-acl --scope CLOUDFRONT --id abc-123 \
  --query '{Token:LockToken}'
aws wafv2 update-web-acl --name prod-edge-acl --scope CLOUDFRONT --id abc-123 \
  --lock-token <token received above> \
  --default-action Allow={} \
  --rules file://rules.json \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=prodEdgeAcl
```

`update-web-acl` **replaces the entire rules array wholesale.** It is not a partial-update API, so you have to fetch the current configuration with `get-web-acl`, modify it, and send everything back. If you slip here, rules that another team added silently disappear. Also, `LockToken` is an optimistic locking mechanism — if someone else changed it in the meantime, the token is invalidated and the request is rejected. Because of this structure, **managing WAF rules with IaC (CloudFormation/Terraform) is practically mandatory** rather than doing it by hand in the console.

> 🎯 **Scenario**: "After introducing a new managed rule group, only one customer company's API calls are blocked. We must keep inspecting that customer's traffic but release only the problem rule." If this comes up, the skeleton of the correct answer is **to drop the problem rule to Count with `RuleActionOverrides`, or to create a narrow exception with label matching + a condition (that API path/header).** Options such as "remove the group" or "allow that customer's IPs wholesale with an IPSet" lose more protection than necessary and are wrong. The exam almost always takes the *narrowest exception* as the correct answer.

## IP Set, Geo, Regex: Ingredients for Your Own Rules

Controls specific to your organization that managed groups don't cover, you build yourself. Three ingredients appear repeatedly.

```bash
# 1) IP Set: manage malicious/corporate IP lists separately from rules (update just the list without editing rules)
aws wafv2 create-ip-set \
  --name corp-egress-ips --scope CLOUDFRONT \
  --ip-address-version IPV4 \
  --addresses 203.0.113.0/24 198.51.100.10/32

# 2) Regex pattern set: manage patterns shared by multiple rules in one place
aws wafv2 create-regex-pattern-set \
  --name sensitive-paths --scope CLOUDFRONT \
  --regular-expression-list '[{"RegexString":"^/(admin|internal|debug)/"}]'

# 3) Check the current association state — the first check for "why isn't it blocking"
aws wafv2 list-resources-for-web-acl \
  --web-acl-arn arn:aws:wafv2:ap-northeast-2:111122223333:regional/webacl/app-acl/def-456 \
  --resource-type APPLICATION_LOAD_BALANCER
```

Geo blocking is handled with `GeoMatchStatement`, but it is more practical to **combine it with other conditions** than to block on it alone. Below is a whitelist-style geo control: "only requests coming in from designated countries pass to the admin path."

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

Geo blocking is **a compliance control, not a security control.** It is bypassed as is by going through a VPN, a proxy, or a hijacked domestic host. On the exam, GeoMatch is the answer for "a legal requirement to serve only from specific countries," but an option offering only GeoMatch for "we must stop attackers" is usually wrong. Also, for the WAF on an ALB behind CloudFront to determine the country, it must see the original client IP, so you need to specify `ForwardedIPConfig` — if you miss this, it judges based on the CloudFront edge's IP and yields an unrelated country.

## WAF Capacity Unit (WCU): A Complexity Budget

Each rule's evaluation cost is converted into WCU. The default Web ACL is 1,500 WCU (can be raised on request). Rate-based, regex, and managed groups consume a lot of WCU. It is a cost model that keeps you from adding rules without limit, and you must be conscious of the WCU budget when designing rules.

If you see WCU only as a quota, you miss something on the exam. WCU is a **proxy metric for "how much computation it takes to judge this request,"** and that computation runs for every request. Casually stacking a few managed groups exhausts the budget in no time, so the design order in practice is as follows.

- Stack **only the managed groups you need.** Waste such as attaching the Linux rule set to a Windows workload is common.
- Apply a `ScopeDownStatement` to a group to narrow what it evaluates (e.g., exclude static asset paths from managed group evaluation).
- For regexes, the cost is not the count but the *complexity*. Bundling multiple patterns into one RegexPatternSet is more efficient.
- You can check the current consumption before deployment.

```bash
# Calculate the WCU a bundle of rules will consume, before deploying
aws wafv2 check-capacity \
  --scope CLOUDFRONT \
  --rules file://rules.json

# Check the Web ACL's current capacity and rule configuration
aws wafv2 get-web-acl --name prod-edge-acl --scope CLOUDFRONT --id abc-123 \
  --query 'WebACL.{Capacity:Capacity,Rules:Rules[].{Name:Name,Priority:Priority}}'
```

The very fact that a WCU budget exists reveals the nature of WAF. WAF is an *inline synchronous evaluator*, so when rules get heavy, every legitimate user shares that cost as latency. That is why WAF should be designed not as "an all-purpose inspector that catches every threat" but as **"a sieve that skims off in bulk, at the front, the threats that can be caught cheaply."** Sophisticated but expensive judgments — for example, anomaly detection that needs the context of an entire session — belong not to WAF but to the application or to asynchronous detection (GuardDuty, log analysis). Where to place a control is a question of *cost structure* as well as accuracy.

## Bot Control and ATP: Special Groups with Separate Charges

`AWSManagedRulesBotControlRuleSet` (bot control) and `AWSManagedRulesATPRuleSet` (account takeover prevention) differ in nature from ordinary managed groups. They carry extra charges, and they make **behavior- and reputation-based judgments** rather than simple pattern matching.

| Aspect | Bot Control | ATP (Account Takeover Prevention) |
|------|-------------|----------------------------------|
| Purpose | Identify and classify automated clients | Block abuse of the login endpoint |
| What it sees | UA, TLS fingerprint, behavior patterns, reputation | Login requests/responses, whether credentials have leaked |
| Typical labels | `bot:category:*` (search_engine, scraper, etc.), `bot:verified` | `signal:credential_compromised`, `aggregate:volumetric`, etc. |
| Typical response | Allow verified search-engine bots, Block/CAPTCHA scrapers | CAPTCHA/Block when leaked credentials are used |
| Pricing | Billed separately | Billed separately |

The practical value of Bot Control lies not in "blocking bots" but in **"classifying bots and treating them differently."** Block a search-engine crawler and your SEO collapses; block a payment provider's callback and sales stop. So Bot Control is used as a tool that attaches labels, and your own rules read those labels to give different actions per category.

What is unique about ATP is that it looks at **even the response** of a login request. Unlike other rules that see only the request, it observes success/failure responses to produce signals such as "this IP failed repeatedly and then suddenly succeeded." On the exam, a rate-based rule is the default answer for "responding to credential stuffing," but if "detect the use of leaked credentials" is stated explicitly, ATP is the answer.

> 🎯 **Scenario**: "Block scrapers that harvest pricing information, but let search-engine crawlers through unchanged." The correct answer is **enable Bot Control → branch on the `bot:category` label → Allow verified crawlers, Block or CAPTCHA the scraper category.** An answer that distinguishes them only by the User-Agent string is wrong — a UA can be forged at will, and the very first thing scrapers actually do is imitate a crawler's UA.

## Logging and Visibility: Proving the Block

WAF logs can be sent to **CloudWatch Logs, S3, and Kinesis Data Firehose** (the log group name must start with `aws-waf-logs-`). The logs contain the matched rule, terminatingRuleId, labels, and action, forming the basis for forensics and tuning. With **RedactedFields**, you can mask the Authorization header and password fields in the logs, so the logs themselves don't become a path for credential leakage.

```bash
aws wafv2 put-logging-configuration \
  --logging-configuration \
    ResourceArn=arn:aws:wafv2:us-east-1:111122223333:global/webacl/MyACL/abc,\
LogDestinationConfigs=arn:aws:firehose:us-east-1:111122223333:deliverystream/aws-waf-logs-stream,\
RedactedFields='[{SingleHeader={Name=authorization}}]'
```

WAF evaluates the request *synchronously* and then lets it through, which adds slight latency (typically under 1 ms), but the semantically important point is that it is evaluated *at the association point*. A Web ACL attached to CloudFront is evaluated at the edge location, so malicious traffic is blocked before it reaches the origin. A Web ACL attached to an ALB is evaluated at the regional ALB. Even for the same rule, where it is attached determines "how far forward the line of defense stands" — this leads into Day 4's edge integration.

## Relationship with Firewall Manager

To enforce Web ACLs consistently in a multi-account (Organizations) environment, you deploy WAF policies centrally with **AWS Firewall Manager**. When a new ALB/CloudFront is created, the rule groups defined in the policy are applied automatically, and non-compliant resources are detected and remediated. In a single account WAF alone is enough, but "enforcing a common baseline of WAF rules across the whole organization" is where Firewall Manager is the right answer.

What is interesting about Firewall Manager's WAF policy is **how it lets central rules and team rules coexist.** The policy forces "these rule groups always first, these rule groups always last," and leaves the section in between for each team to fill freely. It is a compromise that keeps the organizational baseline impossible to bypass while preserving team autonomy. If you don't know this structure, you pick the wrong answer based on the false premise that "if you enforce centrally, teams can't create rules."

This is a typical case of policy layering. Just as SCPs draw the upper bound of account permissions and IAM moves freely within it, Firewall Manager pins down the front and back of the WAF rules and delegates the middle. The same shape — **"enforce the outside, delegate the inside"** — repeats across AWS governance: SCPs, permissions boundaries, Config Conformance Packs, and Firewall Manager all take this form. When you see a requirement on the exam like "enforce across the whole organization but don't block the teams' operations," recall this layering pattern.

Log4Shell (the remote code execution vulnerability in Log4j), disclosed in December 2021, is the event that most dramatically showed the value of managed rule groups. Right after the vulnerability was disclosed, payloads of the form `${jndi:ldap://...}` poured in worldwide in bulk, with no regard for whether they were in headers, the URI, or the body, and there was absolutely not enough time for each organization to respond by writing its own regexes. The effective response at that time was **to immediately apply the managed rule group for known malicious inputs to buy time, and to carry out the actual patch in the meantime.** The lesson here sums up the essence of WAF — **WAF doesn't fix the vulnerability. It only buys you time to patch.** This is called "virtual patching," and the moment an organization mistakes virtual patching for a permanent countermeasure, it gets breached again by a single evasion payload. On the exam too, an option saying "the vulnerability was resolved with a WAF rule" is usually wrong, and "temporary mitigation followed by a root-cause fix" is the shape of the correct answer.

## Wrapping Up

Reduce AWS WAF to one sentence and it is **"an inline policy engine that evaluates HTTP requests in priority order and picks one of allow, block, observe, or verify."** In this sentence, there are four points the exam keeps digging into.

First, the **evaluation model**. Ascending priority order, immediate termination at a terminating action (Allow/Block), Count is non-terminating. Know only this rule precisely and questions like "why doesn't the allow exception work" and "how do I order managed groups and my own rules" all get solved.

Second, the **association point**. The CLOUDFRONT scope and the REGIONAL scope don't attach to each other, and WAF sees only requests that pass through the resource it is associated with. So a WAF question is almost always one body with Day 4's topic of "did you block direct access to the origin."

Third, **normalization and narrow exceptions.** A SQLi/XSS rule without TextTransformation is bypassed with a single encoding, and an exception that turns off a managed group wholesale loses protection wholesale. The procedure of observing with Count and loosening narrowly with labels is the basic form of the correct answer.

Fourth, **knowing WAF's limits.** WAF sees only L7 HTTP. Volumetric DDoS is absorbed by Shield (Day 2), VPC-internal traffic and outbound domains are inspected by Network Firewall (Day 3), and lining up the perimeter in a single line so that none of those controls can be bypassed is the job of CloudFront and origin lockdown (Day 4). The rule engine we learned today is the first sieve placed on that perimeter, and the moment you believe a single sieve can filter everything, the design collapses.

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
