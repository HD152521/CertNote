# Day 4 - Synthetics·RUM·Evidently: Three Lenses Measuring User Experience

So far all observability pointed inward—CPU, memory, error rates, cold starts. Yet every metric green while users complain "site is slow." Specific CDN edge slow, JavaScript breaks in certain browser, DNS hiccups in region, backend fast but frontend render slow—possible. System metrics show "server healthy" but not "user actually experiences quality." Today: bridging that gap.

Three tools measuring user experience deep-dive. **Synthetics** (external simulation traffic active measurement), **RUM** (real browser passive collection), **Evidently** (compare two variants A/B test). Not just "tools exist," but why both active and passive monitoring need each other, how RUM safely collects from anonymous browsers, what statistical foundation backs A/B testing. In DOP-C02, distinguishing these three ("external availability," "real user LCP," "feature A/B") is standard fare; tool matching alone wins points.

## Active vs Passive — Two Monitoring Paradigms

Fundamentally different approaches to user experience measurement. **Active monitoring (synthetic)**: system generates fake traffic directly measuring. **Passive monitoring (real user)**: observe actual user traffic.

These aren't competitors—complementary. Synthetics is **proactive**—bots run even at 3am with no users, finding outages first. Passive monitoring becomes **representative**—real users' diverse devices, networks, regions show experience robots can't mimic. Need both: Synthetics endlessly confirm "site up now," RUM observe "what real users actually experience."

> 💡 **Related Theory**: Active/passive split is decades-old in network ops. Active: ICMP ping, traceroute, iperf send probes directly. Passive: NetFlow, sFlow, packet capture observe real traffic. Active advantage: **controlled repeatability** (same measurement at intervals even without traffic). Passive advantage: **reality representativeness** (patterns real load can't fake). SRE's **black-box (user view) vs white-box (internals)** overlap here. Synthetics is black-box (outside like user), system metrics white-box (inside like components), RUM is real black-box (actual user). Good observability uses all three.

## CloudWatch Synthetics — Robots Mimicking Users

Synthetics runs **Canary** scripts periodically checking site/API externally. Canary runs on Lambda, uses Puppeteer (Node.js) or Selenium (Python) spinning real browsers acting like users.

```python
import urllib3
from aws_synthetics.common import synthetics_logger as logger

def heart():
    http = urllib3.PoolManager()
    r = http.request("GET", "https://api.example.com/health")
    if r.status != 200:
        raise Exception(f"Status {r.status}")
    if b'"status":"ok"' not in r.data:
        raise Exception("Body mismatch")
    logger.info(f"OK: {r.data}")

def handler(event, context):
    return heart()
```

Canary types are exam points:

- **Heartbeat**: single URL responds
- **API**: REST endpoint call/validate
- **Broken Link Checker**: crawl site links finding dead ones
- **Visual Monitoring**: screenshot pixel-diff against baseline detecting UI change/break
- **GUI Workflow Builder**: multi-step simulation (login→cart→checkout)

Canary failure notifies via SNS to Slack/PagerDuty.

> 🔍 **Deeper**: Synthetics' **Visual Monitoring** uses computer vision **image diffing**. Compare baseline screenshot and current pixel-by-pixel, not for exact identity but allowance threshold (e.g., fail if >5% difference) and ignore regions (ads, timestamps change every time). Same lineage as frontend test visual regression—Percy, Chromatic, Playwright screenshot comparison. CSS one-liner breaks layout but HTTP returns 200—functional test misses but Visual Monitoring catches. "Response normal but screen broke" is exactly Visual Monitoring's domain.

> 📚 **Case Study**: E-commerce company monitored API health (Heartbeat) only, missed checkout failure. Homepage, product page, login all responded, but cart→checkout multi-step payment widget failed to load. Single-URL Heartbeat couldn't catch this. Fix: GUI Workflow Canary simulating "login→add product→proceed checkout" end-to-end 5-minute intervals. Lesson: critical user journeys (CUJ) need multi-step Canary, not single endpoints. Users experience the full journey, not the sum of parts.

## Synthetics Cost — Economics of Frequency

Canary runs cost Lambda per execution. 1-minute interval = ~43,200/month/Canary. Dozens of Canaries become non-trivial.

Principle: **scale frequency to importance**. Critical path (checkout, login) get 1-minute tight watching. General pages 5/15-minute. Not all 1-minute is cost-justified.

> 🔍 **Deeper**: Canary frequency is **trade-off between MTTD (mean time to detect) and cost**. 1-minute = detect failure within 1 minute but 5x cost vs 5-minute. Add alarms' "M out of N" (Day 1)—don't fire on one miss but "3 of 3 failures"—MTTD becomes period × debounce count (1-min + 3 evaluation = max 3 min). Set SLO MTTD goal first, then reverse-engineer frequency and debounce. "Always 1-minute" misses the point that MTTD is cost/benefit trade-off.

## CloudWatch RUM — Real User Browser

RUM (Real User Monitoring) opposite direction: **real user browser telemetry**. JS snippet in page; when user loads, browser sends load time, JS errors, HTTP errors, clickstream to AWS RUM service.

```html
<script>
(function(n,i,v,r,s,c,x,z){
  x=window.AwsRumClient={q:[],n:n,i:i,v:v,r:r,c:c};
  // ...AWS RUM client code...
})(
  'app-monitor-id','identity-pool-id','1.0.0','ap-northeast-2',
  'https://client.rum.us-east-1.amazonaws.com/1.x/cwr.js',
  {sessionSampleRate:1, guestRoleArn:'arn:aws:iam::...:role/RUM-Unauth',
   identityPoolId:'ap-northeast-2:abc'}
);
</script>
```

Two core things. First, **auth**. Anonymous web visitor browser—how does it get permission to send AWS data? **Cognito Identity Pool** issues guest credentials. Unauthenticated user gets limited-permission (RUM events only) temporary credentials. Second, **sampling**. `sessionSampleRate` controls collection rate—1.0=100%, 0.1=10%. High traffic dials down for cost control.

RUM collects **Web Vitals**—Google-defined user-experienced performance standard: LCP (Largest Contentful Paint, main content loading), INP/FID (interactivity responsiveness), CLS (layout stability). Flows to CloudWatch Metrics for alarming ("LCP p99 > 3s → alert").

> 💡 **Related Theory**: RUM using Cognito Identity Pool's **unauthenticated identity** solves "grant minimum permission to untrusted client safely." Browser JS is inherently untrusted (code visible, modifiable to anyone)—never embed long-lived IAM keys. Identity Pool via STS issues short-lived, extremely limited (RUM PutRumEvents only) temporary credentials. OAuth token delegation, mobile apps reaching AWS without backend keys—same pattern. Core: **long-lived secrets never to client, short-lived minimum-permission tokens via delegation**. Standard for all client trust-boundary problems.

> ⚠️ **Trap**: Setting `sessionSampleRate` to 1.0 (100%) on high-traffic site explodes costs. RUM charges per event collected; millions-daily-visitor 100% collection is unsustainable. Too low (1%) rare-browser/region bugs disappear statistically. Standard compromise: segment sampling—normal traffic 10%, post-deploy or VIP 100%, biasing value-weighted. Not "all-or-1%" extremes but intentional sample design.

## CloudWatch Evidently — Testing Hypotheses Statistically

Synthetics and RUM "measure now." Evidently: "does change improve experience"—testing hypotheses not guessing. New checkout UI truly raise conversion or just prettier? Data, not hunches.

Evidently structure: **Project → Feature → Variation → Launch / Experiment**:

- **Feature**: on/off or multi-variation feature flag
- **Launch**: gradual rollout (10% → 50% → 100%)—canary deploy concept
- **Experiment**: split traffic between two variations statistically comparing metrics

```bash
aws evidently create-project --name myapp
aws evidently create-feature \
  --project myapp --name new-checkout \
  --variations 'control={boolValue=false},treatment={boolValue=true}'
aws evidently start-launch \
  --project myapp --launch '...' \
  --groups 'control=10,treatment=10' \
  --metric-monitors '...'
```

Launch (gradual, risk-managed) vs Experiment (statistics, hypothesis test) differ in goal. Launch "safely roll out." Experiment "prove which is better."

> 🔍 **Deeper**: Evidently's Experiment uses **Bayesian statistics** internally. Traditional A/B tests use frequentist p-value + fixed sample size (can't peek mid-test—peeking problem). Bayesian updates probability "treatment beats control" continuously as data arrives, answering "treatment winning now 95%" mid-test. Observability's Anomaly Detection (Day 1) uses statistical models too—AWS wraps statistical decision-making as managed services freeing ops from being statisticians. A/B testing pitfalls (sample size, exposure bias, multiple comparisons) still need careful design though—tool doesn't auto-solve it all.

> ⚠️ **2024 deprecation**: Evidently is deprecated; new adoption discouraged, integrating into AWS AppConfig Feature Flags direction. Yet still exam-tested, so concept (Launch=gradual, Experiment=statistical comparison) and purpose (A/B testing) must be known. Production path trending: AppConfig Feature Flag + separate analytics.

## Three Tools Distinction — Test's Core

DOP tests scenario-match these three. Matching table clear:

| Scenario | Tool |
|----------|------|
| External API availability 5-minute check | **Synthetics** (Heartbeat/API) |
| Real user page load time (LCP) by region/device/browser | **RUM** |
| Multi-step checkout simulation | **Synthetics** (GUI Workflow) |
| Dead links on site | **Synthetics** (Broken Link) |
| UI pixel difference/breakage | **Synthetics** (Visual) |
| Feature A rollout 10% users, compare conversion | **Evidently** (or AppConfig + analysis) |
| Simple feature on/off + gradual release | **AppConfig Feature Flag** |
| Region/ISP internet path issues | **Internet Monitor** |

Plus 2023-24 diagnosis tools: **Internet Monitor** (specific city/ISP reaching service, BGP/route change visualization) and **Network Monitor** (VPC internal network health/reachability) worth knowing.

> 🎯 **Scenario**: "Global service but specific country users say 'slow.' Our server metrics (CPU, latency) all green." Diagnose how? Server green means application-external problem (network path/CDN/DNS likely). (1) RUM region-split data reveals which region/device/browser slow (real measurement). (2) Internet Monitor shows that region's ISP·path status and service reachability problems. (3) Deploy Synthetics Canary that region (multi-region execution) to reproduce externally. Core: "server green but users slow" means system metrics aren't the answer—user/network-view tools (RUM/Synthetics/Internet Monitor).

## Summary

Today's four takeaways. First, **active (Synthetics) and passive (RUM) monitoring complement**—Synthetics black-box probe proactively checking without traffic, RUM real black-box (actual users). Second, **Synthetics' five Canary types** (Heartbeat/API/Broken Link/Visual/GUI Workflow) simulate users; frequency trades MTTD and cost on critical paths. Third, **RUM uses Cognito Identity Pool unauthenticated credentials** granting untrusted browser minimum-permission safely, collects Web Vitals, samples for cost control. Fourth, **Evidently A/B tests (Bayesian stats)** verify hypotheses but deprecated toward AppConfig Feature Flag.

Next: Week 10 synthesis. How these tools weave—detecting (Synthetics, alarms) → notifying (Composite, SNS) → diagnosing (Insights, X-Ray) timeline, tying all week's concepts into real incidents.

---

## 📝 Practice Questions

**Question 1.** Which tool measures "the API's availability every 5 minutes from outside, regardless of whether there is traffic"?

A) CloudWatch Synthetics Canary
B) RUM
C) Evidently
D) Container Insights

**Answer: A**

Explanation: A Synthetics Canary is active monitoring in which the system generates simulated traffic and checks from the outside, so it proactively verifies availability even at times when there are no real users. RUM (B) is passive monitoring that collects data only when real user traffic exists, Evidently (C) is for A/B experiments, and Container Insights (D) provides container resource metrics.

---

**Question 2.** How can you measure the page load time (LCP) that real users actually experience, broken down by region, device, and browser?

A) Synthetics
B) RUM — collect Web Vitals from real users' browsers
C) X-Ray
D) Logs Insights

**Answer: B**

Explanation: RUM measures Web Vitals such as LCP/INP/CLS from real users' browsers using a JS snippet embedded in the page, and lets you view them separated by region, device, and browser. It is passive monitoring that captures the experience of real users in diverse environments that a robot cannot imitate. Synthetics (A) is an external probe and does not reflect what real users experience, X-Ray (C) is backend distributed tracing, and Logs Insights (D) is log search.

---

**Question 3.** The API heartbeat is healthy, but failures occur only at the last step of the "login → cart → checkout" flow. How can you verify this multi-step journey?

A) A single-URL Heartbeat Canary
B) Simulate the entire journey with a Synthetics GUI Workflow Canary
C) 100% RUM sampling
D) Metric Filter

**Answer: B**

Explanation: A single-endpoint Heartbeat only checks whether each step responds individually and cannot catch transitions between steps (such as the checkout widget loading). A GUI Workflow Canary simulates the entire multi-step flow of login → add to cart → checkout end to end in a real browser, detecting failures in the middle of the journey. A critical user journey must be verified not as the sum of its steps but as a workflow that runs all the way through.

---

**Question 4.** What is the mechanism by which RUM safely receives data from anonymous web visitors' browsers?

A) Hardcode an IAM access key in the page
B) Issue least-privilege, short-lived temporary credentials with anonymous access through a Cognito Identity Pool
C) Expose an API Key in the JS
D) Force OIDC login

**Answer: B**

Explanation: Browser JS is an untrusted environment, so long-lived secrets (IAM keys, API Keys) must never be embedded in it. A Cognito Identity Pool issues, through STS, anonymous (guest) temporary credentials that are short-lived and restricted to sending RUM events only, so even visitors who are not logged in can safely send telemetry. Exposing an IAM key (A) or an API Key (C) is a serious security risk, and forcing OIDC (D) prevents measuring anonymous users.

---

**Question 5.** You want to expose a new checkout UI to 10% of users and statistically compare whether it actually increases the conversion rate. How?

A) Synthetics
B) An Evidently Experiment (or an AppConfig Feature Flag + custom analysis)
C) RUM only
D) Lambda Insights

**Answer: B**

Explanation: An Evidently Experiment splits traffic between control and treatment and compares metrics using Bayesian statistics, deciding "which side is better" based on data rather than guesswork. Unlike RUM (C), which merely measures exposure, or Synthetics (A), an external probe, it tests the hypothesis about the effect of the change. Because Evidently has been announced for deprecation, in practice the trend is to replace it with an AppConfig Feature Flag + separate analysis.

---

**Question 6.** Server metrics (CPU, latency) are normal, but users in a specific country report that the service is "slow." What combination of diagnostics should you use?

A) Monitor server CPU more
B) RUM split by region + Internet Monitor for ISP and internet path reachability + a Synthetics Canary in that region
C) Increase Lambda memory
D) Shorten retention

**Answer: B**

Explanation: When the server is healthy but only a specific region is slow, the problem is likely outside the application (network path, CDN, or DNS). Use RUM regional data to measure which environments are slow, use Internet Monitor to check ISP and path reachability issues in that region, and reproduce the issue externally with a Synthetics Canary in that Region. When users feel slowness, you must look through tools that take the user and network perspective, not system metrics.

---

**Question 7.** What is the problem with running a Synthetics Canary at a 1-minute interval for every check, and what is the correct approach?

A) No problem — 1 minute for everything is best
B) Execution cost of about 43,200 runs per Canary per month — use 1 minute only for critical paths and 5/15 minutes for the rest, differentiated according to the MTTD target
C) A 1-minute interval is not possible
D) The interval is unrelated to cost

**Answer: B**

Explanation: A Canary incurs Lambda cost on every run, so a 1-minute interval means about 43,200 runs per month. The interval is a trade-off between detection time (MTTD) and cost, so only critical paths such as checkout and login are checked densely at 1 minute, while general pages are relaxed to 5/15 minutes, set by working backward from the SLO's detection-delay target. "Always 1 minute" is excessive cost.

---

## 📌 Today's Summary

There are four key takeaways today. First, active (Synthetics) and passive (RUM) monitoring are complementary — Synthetics is a black-box probe that proactively checks availability without traffic, while RUM is the true black box that looks at real users' real experience. Second, the five Synthetics Canary types (Heartbeat/API/Broken Link/Visual/GUI Workflow) imitate users, and the interval is a trade-off between MTTD and cost, so only critical paths are checked densely. Third, RUM collects Web Vitals by delegating short-lived, least-privilege credentials to untrusted browsers through Cognito Identity Pool anonymous access, and controls cost through sampling. Fourth, Evidently validates hypotheses through A/B experiments (Bayesian statistics), but with its deprecation announced the direction is consolidation into AppConfig Feature Flags, and Internet Monitor/Network Monitor are additional diagnostic tools added in 2023-24.
