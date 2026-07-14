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

## 📝 연습 문제

**문제 1.** "외부에서 API의 5분 단위 가용성을 트래픽 유무와 무관하게 측정"하려는 도구는?

A) CloudWatch Synthetics Canary
B) RUM
C) Evidently
D) Container Insights

**정답: A**

해설: Synthetics Canary는 시스템이 직접 시뮬레이션 트래픽을 만들어 외부에서 점검하는 능동(active) 모니터링이라, 실제 사용자가 없는 시간에도 가용성을 선제적으로 확인한다. RUM(B)은 실사용자 트래픽이 있어야 데이터가 모이는 수동 모니터링이고, Evidently(C)는 A/B 실험, Container Insights(D)는 컨테이너 자원 메트릭이다.

---

**문제 2.** 실제 사용자가 페이지 로딩에 체감하는 시간(LCP)을 지역·디바이스·브라우저별로 측정하려면?

A) Synthetics
B) RUM — 실사용자 브라우저에서 Web Vitals 수집
C) X-Ray
D) Logs Insights

**정답: B**

해설: RUM은 실사용자 브라우저에 심은 JS 스니펫으로 LCP/INP/CLS 같은 Web Vitals를 실측하고 지역·디바이스·브라우저별로 분리해 본다. 로봇이 흉내 못 내는 실제 사용자의 다양한 환경 경험을 포착하는 수동 모니터링이다. Synthetics(A)는 외부 프로브라 실사용자 체감이 아니고, X-Ray(C)는 백엔드 분산 추적, Logs Insights(D)는 로그 검색이다.

---

**문제 3.** API Heartbeat는 정상인데 "로그인→장바구니→결제" 마지막 단계에서만 장애가 난다. 이 멀티스텝 여정을 검증하려면?

A) 단일 URL Heartbeat Canary
B) Synthetics GUI Workflow Canary로 전체 여정을 시뮬레이션
C) RUM 샘플링 100%
D) Metric Filter

**정답: B**

해설: 단일 엔드포인트 Heartbeat는 각 단계가 개별적으로 응답하는지만 보고 단계 간 전이(결제 위젯 로드 등)를 못 잡는다. GUI Workflow Canary는 로그인→담기→결제의 전체 멀티스텝 플로를 실제 브라우저로 끝까지 시뮬레이션해 여정 중간의 장애를 탐지한다. critical user journey는 단계의 합이 아니라 끝까지 가는 워크플로로 검증해야 한다.

---

**문제 4.** RUM이 익명 웹 방문자 브라우저에서 안전하게 데이터를 전송받는 메커니즘은?

A) 페이지에 IAM 액세스 키 하드코딩
B) Cognito Identity Pool의 익명 자격으로 최소권한·단기 임시 자격 발급
C) API Key를 JS에 노출
D) OIDC 로그인 강제

**정답: B**

해설: 브라우저 JS는 신뢰할 수 없는 환경이라 장기 비밀(IAM 키·API Key)을 절대 박으면 안 된다. Cognito Identity Pool은 STS를 통해 수명이 짧고 권한이 RUM 이벤트 전송으로만 제한된 익명(guest) 임시 자격을 발급해, 로그인 없는 방문자도 안전하게 텔레메트리를 보낸다. IAM 키(A)·API Key(C) 노출은 심각한 보안 위험이고, OIDC 강제(D)는 익명 사용자 측정을 막는다.

---

**문제 5.** 새 체크아웃 UI가 전환율을 실제로 높이는지 10% 사용자에 노출해 통계적으로 비교하려면?

A) Synthetics
B) Evidently의 Experiment (또는 AppConfig Feature Flag + 자체 분석)
C) RUM만
D) Lambda Insights

**정답: B**

해설: Evidently Experiment는 control/treatment에 트래픽을 나눠 지표를 베이지안 통계로 비교해 "어느 쪽이 더 나은지"를 추측이 아닌 데이터로 판단한다. 단순 노출 측정인 RUM(C)이나 외부 프로브 Synthetics(A)와 달리, 변경의 효과를 가설 검증한다. Evidently가 deprecation 예고라 실무에서는 AppConfig Feature Flag + 별도 분석으로 대체하는 흐름이다.

---

**문제 6.** 서버 메트릭(CPU·지연)은 정상인데 특정 국가 사용자만 "느리다"고 한다. 진단 조합은?

A) 서버 CPU를 더 모니터링
B) RUM 지역별 분리 + Internet Monitor로 ISP·인터넷 경로 도달성 + 해당 지역 Synthetics Canary
C) Lambda 메모리 증설
D) retention 단축

**정답: B**

해설: 서버는 정상인데 특정 지역만 느린 건 애플리케이션 밖(네트워크 경로·CDN·DNS) 문제일 가능성이 높다. RUM 지역별 데이터로 어느 환경이 느린지 실측하고, Internet Monitor로 그 지역 ISP·경로 도달성 문제를 확인하며, 해당 리전에서 Synthetics Canary로 외부 재현한다. 사용자가 느낄 때는 시스템 메트릭이 아니라 사용자·네트워크 관점 도구로 봐야 한다.

---

**문제 7.** Synthetics Canary를 모든 검사에 1분 주기로 두는 것의 문제와 올바른 접근은?

A) 문제없다 — 전부 1분이 최선
B) 월 약 43,200회/Canary 실행 비용 — critical path만 1분, 일반은 5/15분으로 MTTD 목표에 맞춰 차등
C) 1분 주기는 불가능
D) 주기는 비용과 무관

**정답: B**

해설: Canary는 실행마다 Lambda 비용이 들어 1분 주기면 월 약 43,200회다. 주기는 탐지 시간(MTTD)과 비용의 트레이드오프이므로, 결제·로그인 같은 critical path만 1분으로 촘촘히 보고 일반 페이지는 5/15분으로 늘려 SLO의 탐지 지연 목표에서 역산해 정한다. "무조건 1분"은 과잉 비용이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, 능동(Synthetics)과 수동(RUM) 모니터링은 보완 관계로 — Synthetics는 트래픽 없이 선제적으로 가용성을 보는 블랙박스 프로브, RUM은 실사용자의 현실 경험을 보는 진짜 블랙박스다. 둘째, Synthetics Canary 5종(Heartbeat/API/Broken Link/Visual/GUI Workflow)은 사용자를 흉내 내며, 주기는 MTTD와 비용의 트레이드오프라 critical path만 촘촘히 본다. 셋째, RUM은 Cognito Identity Pool 익명 자격으로 신뢰 없는 브라우저에 단기·최소권한을 위임해 Web Vitals를 수집하고 샘플링으로 비용을 통제한다. 넷째, Evidently는 A/B 실험(베이지안 통계)으로 가설을 검증하지만 deprecation 예고로 AppConfig Feature Flag로 통합되는 방향이며, Internet Monitor/Network Monitor가 2023-24 추가 진단 도구다.
