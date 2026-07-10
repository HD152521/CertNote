# Day 3 - CloudTrail and EventBridge: The Two Axes of Audit and Response

If monitoring asks "is the system healthy now?", audit asks "who did what?" These are fundamentally different questions. CPU at 80% is faceless data; "who deleted the production S3 bucket at 3 AM yesterday?" is responsibility tracking. AWS has CloudWatch for the former and **CloudTrail** — an audit log recording every API call in an account — for the latter. And to *automatically respond* to recorded events is **EventBridge** — AWS's serverless event bus. Combine these two and security automations like "detect root account login, alert instantly" emerge.

In the DVA-C02 exam, CloudTrail appears as the answer to "track who did this" scenarios, while EventBridge is the core of "event-driven architecture." Management vs. Data Events, 90-day retention's meaning, EventBridge pattern matching, and the security automation pattern binding the two are frequent topics. This article examines why CloudTrail can record "everything" (AWS's foundational "all operations are API calls" structure), how EventBridge evolved from CloudWatch Events, and the philosophy behind event-driven architecture.

## Why CloudTrail Records Everything: APIs Are the Control Plane

CloudTrail can record "every action in an account" because of AWS's fundamental design: **all operations are API calls**. Whether you click buttons in console, run CLI commands, or write SDK code, everything ultimately hits AWS control plane APIs (`RunInstances`, `DeleteBucket`, `CreateUser`, ...). The console itself is merely a web frontend internally calling these APIs.

This single-entry-point structure lets CloudTrail intercept all calls at one API gateway. "Who (IAM principal), when (timestamp), from where (sourceIPAddress), what (eventName), with what parameters, success?" — all are already in API call metadata. CloudTrail doesn't invent new tracking; it exploits AWS's "everything is API" architecture by recording at the gateway.

> 💡 **Related theory**: "Control plane vs. data plane separation" is a core networking/distributed systems concept. Control plane is "create resources and change settings" (launch EC2, change security group); data plane is "actual work" (read S3 objects, query DynamoDB). CloudTrail's **Management Events** (control plane) and **Data Events** (data plane) distinction follows exactly this boundary. It explains default differences — control plane work is infrequent (create instances daily) and security-critical, so recorded by default; data plane work (S3 GetObject) happens millions per second, so logging all would explode, hence default OFF.

> ⚠️ **Trap**: "Track who downloaded a specific S3 file" or "when was Lambda invoked" requires **explicitly enabling Data Events**. With default Management Events only, data access isn't recorded. Exam questions about "S3 object GetObject tracking" → Data Events enable (with extra cost). Conversely, "who changed bucket policy" (`PutBucketPolicy`) is Management Event, recorded by default.

## The "90-Day" Number: Splitting Query Cache and Permanent Retention

"Default 90-day retention" is CloudTrail's most-quoted exam number. But misunderstanding this 90 days creates traps. It's **how long CloudTrail console/API direct queries work** — not "logs disappear after 90 days."

CloudTrail separates two things. One is **Event History** — always-on without setup, 90 days of Management Events directly queryable from the console. The other is **Trail** — user-created, forwarding events to S3 *permanently*. For compliance or audit beyond 90 days, create a Trail sending to S3 for unlimited retention.

| Storage | Retention | Purpose |
|--------|------|------|
| Event History (default) | 90 days | Recent activity quick lookup |
| Trail → S3 | Unlimited (user-set) | Permanent audit, Athena analysis |
| CloudTrail Lake | 7 days–10 years | Managed data lake, SQL queries |

> 🔍 **Going deeper**: When creating a Trail, **integrity** matters. Audit logs' value is "unmodified," but if an attacker infiltrates and scrubs CloudTrail logs covering their tracks, audit fails. CloudTrail provides **log file integrity validation** — SHA-256 hash each log file, bundle those hashes into a digest file with RSA signature. Any single-byte log change breaks the hash — modification is detectable. This is hash-chaining like blockchain, cryptographically ensuring "unfixable records after the fact." Audit log S3 buckets add MFA Delete and cross-account isolation as defense-in-depth.

> 📚 **Case study**: CloudTrail Lake (2022) reduces S3 + Athena operational burden. Previously, Trails sent logs to S3; analyzing required manual Athena table setup and partition management. CloudTrail Lake auto-ingests into a managed data lake (ORC format) and provides SQL queries instantly, up to 10 years. "Long-term (years) CloudTrail data SQL analysis" → CloudTrail Lake is the clean answer.

## EventBridge: CloudWatch Events Evolved and Event Bus Thinking

Understanding EventBridge's identity quickest: its history. Originally this was **CloudWatch Events** (2016), a CloudWatch sub-feature — "run Lambda when EC2 state changes" rule tool. In 2019, AWS **rebranded to EventBridge**, adding SaaS partner events (Datadog, Zendesk, Salesforce) and custom event buses, elevating it to independent service. Old CloudWatch Events APIs still work, but EventBridge is the superset. Exam questions "CloudWatch Events and EventBridge relationship?" → **"Same service; EventBridge is backward-compatible upgrade."**

Event bus is an architectural pattern itself. Traditionally, service A told B directly (point-to-point). With many services, direct links explode N×N. Event bus places a "bus" in the middle: A *publishes* "order created" to the bus, not knowing who listens; B, C, D *subscribe* to that event. **Loose coupling** — publishers and subscribers don't know each other — is event-driven architecture's core.

```json
{
  "source": ["aws.s3"],
  "detail-type": ["Object Created"],
  "detail": {
    "bucket": { "name": ["my-bucket"] },
    "object": { "size": [{ "numeric": [">", 1000000] }] }
  }
}
```

> 💡 **Related theory**: Event bus implements the publish-subscribe **pattern** from 1980s distributed systems research. Core value is **temporal and spatial decoupling** — publisher and subscriber needn't exist simultaneously or know each other's location. EventBridge's decisive difference from SNS is **content-based routing**. SNS fans the same message to all topic subscribers; EventBridge *inspects event content* (bucket name is X, object size > 1MB) and routes only to matching targets. This pattern matching makes EventBridge a routing engine, not just a notification tool.

> 🔍 **Going deeper**: EventBridge's pattern operators (`prefix`, `suffix`, `anything-but`, `numeric`, `exists`, `wildcard`, etc.) filter *before* delivery — core insight. If all events went to Lambda first, Lambda checked "this isn't my concern," that Lambda invocation and execution time wastes cost. Bus-level filtering means uninterested events never wake Lambda — "push filters close to the source" is data processing systems' universal optimization. Like SQL query optimizers pushing WHERE into the scan.

## EventBridge Pipes and Scheduler: Decoupling Point-to-Point and Scheduling

EventBridge expanded beyond event buses to absorb two more. **Pipes** (2022) connect source (SQS, Kinesis, DynamoDB Streams, MQ) to target point-to-point with filter/enrichment in between. Previously "transform SQS message and send to Step Functions" meant writing Lambda glue; Pipes replaces that plumbing with declarative config.

```
Source (SQS/Kinesis/DDB Streams) → Filter → Enrichment(Lambda·API) → Target
```

**EventBridge Scheduler** (2022) separates and enhances cron/rate scheduling. Old EventBridge Rules had `schedule` expressions for periodic runs; Scheduler manages million-scale schedules and one-time events.

```
rate(5 minutes)        # Periodic intervals
cron(0 9 * * ? *)      # Specific time — daily 9 AM
```

> ⚠️ **Trap**: cron vs. rate distinction appears on exams. `rate(...)` is *periodic* "N intervals from last run", `cron(...)` is *specific time* like "daily 9 AM". Calendar-based ("Monday 8 AM only") → cron; repeating intervals ("every 5 minutes") → rate. Also EventBridge Scheduler vs. general Rule distinction — large scale, one-time, fine-grained retry → Scheduler; simple periodic → Rule.

> 📚 **Case study**: Most-tested security automation: "root account console login, alert instantly." Root has all permissions and shouldn't be used daily; someone logging in as root is a security signal. Flow: root login → CloudTrail records `ConsoleLogin` event → EventBridge Rule filters `userIdentity.type = "Root"` → Lambda or direct SNS → operator Slack notification. CloudTrail detects, EventBridge responds — "system acts before humans notice" is the pattern. Nearly every AWS security best-practice doc opens with this.

## Wrapping Up

CloudTrail records "everything" because AWS's foundational "all operations are API calls" structure lets it capture at one gate. Management Events (control plane) vs. Data Events (data plane) split reflects frequency and security importance; 90 days is "query cache," not permanent — long audit needs Trail → S3 or Lake. EventBridge evolved from CloudWatch Events into a content-based routing engine for loose coupling. Combining the two — "root login → instant alert" — is prototypical security automation, demonstrating "system responds before humans discover."

Next we explore CloudWatch's advanced capabilities — deeper (container-level monitoring), wider (synthetic monitoring), and predictive (ML anomaly detection).

---

## 📝 연습 문제

**문제 1.** To track *who, when* downloaded a specific S3 object (GetObject), possible with CloudTrail defaults?

A) Possible — recorded by Management Events automatically

B) Impossible — Data Events require explicit enable; extra cost

C) Enable CloudWatch Logs

D) Use X-Ray tracing

**정답: B**

해설: S3 GetObject is **data plane** (Data Event), default OFF. Recording millions of daily data accesses would explode logs; AWS defaults it off. Object access tracking needs **explicit Data Events enable** with extra cost. Conversely, "who changed bucket policy" (`PutBucketPolicy`) is control plane (Management Event), recorded by default. Control/data plane split drives default distinction.

---

**문제 2.** Most accurate statement about CloudTrail's "default 90-day retention":

A) All CloudTrail logs deleted after 90 days

B) Event History (console query cache) is 90 days; permanent needs Trail → S3

C) Data Events only retain 90 days

D) Auto-moves to CloudTrail Lake after 90 days

**정答: B**

해설: 90 days applies only to **Event History** (console quick-query cache), not all logs. Permanent retention requires **Trail** to S3 (unlimited) or CloudTrail Lake (7 days to 10 years). "90-day deletion" and "audit beyond 90 days needs Trail" are key distinctions.

---

**문제 3.** Relationship between CloudWatch Events and Amazon EventBridge:

A) Completely separate services

B) EventBridge is backward-compatible upgrade (rebrand + expand)

C) CloudWatch Events is newer

D) EventBridge is part of X-Ray

**정答: B**

해설: 2016 CloudWatch Events evolved 2019 into **EventBridge** (rebranded + added SaaS partners/custom buses, elevated to independent service). Old APIs still work; EventBridge is the superset. "Same service; EventBridge is the upgrade."

---

**문제 4.** EventBridge's decisive distinction from SNS:

A) EventBridge faster

B) EventBridge inspects event content, routes to matching targets (content-based routing)

C) SNS can't invoke Lambda

D) EventBridge free

**정답: B**

해설: SNS broadcasts same message to all topic subscribers. **EventBridge** inspects event *content* (pattern: bucket name is X, object size > 1MB) and routes only to matching targets — **content-based routing**. Bus-level filtering prevents uninterested targets from waking, saving cost. C) SNS can invoke Lambda.

---

**문제 5.** Standard pattern to detect root console login, alert instantly:

A) IAM policy blocks root login

B) CloudTrail logs ConsoleLogin → EventBridge Rule filters root → SNS alert

C) CloudWatch basic metric alarm

D) GuardDuty alone enough

**정答: B**

해설: root login → CloudTrail records `ConsoleLogin` → **EventBridge Rule** filters `userIdentity.type = "Root"` → Lambda/SNS → notification is standard security automation. CloudTrail detects, EventBridge responds — "system acts before humans check logs." A) Can't IAM-block root (root is above IAM). C) Login is event, not metric.

---

**문제 6.** To run Lambda "every Monday 8 AM only," appropriate scheduling expression type:

A) `rate(...)` — periodic intervals

B) `cron(...)` — specific time/calendar-based

C) CloudWatch alarm

D) SQS delay queue

**정答: B**

해설: "Monday 8 AM" is calendar/specific-time, so **`cron(...)`**. `rate(...)` is "N intervals from last" (periodic). Calendar → cron; intervals → rate. Large scale/one-time/fine retry → EventBridge Scheduler; simple periodic → Rule.

---

**问题 7.** Filter/transform SQS messages and send to Step Functions without Lambda plumbing code, declaratively:

A) EventBridge Pipes

B) SNS fanout

C) CloudWatch Logs Subscription Filter

D) Kinesis Data Analytics

**정답: A**

해설: **EventBridge Pipes** connects source (SQS) to target (Step Functions) point-to-point with filter/enrichment, replacing manual Lambda glue with declarative config. C) Subscription Filter is CloudWatch Logs specific; B) SNS scope/integration different.
