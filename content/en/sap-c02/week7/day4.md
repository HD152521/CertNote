# Day 4 - Service Mesh Anatomy — App Mesh, Service Connect, Cloud Map Divergence

Spin up 10 microservices, new problems begin. How does service-a know service-b's IP? When service-b suddenly returns 5xx, how fast should service-a retry? To encrypt all comms with mTLS, who issues and rotates certificates? For canary-deploying new versions to 10% traffic, where does routing split? Solving all in application code bloats it with infrastructure logic. Service mesh moves this problem to sidecar proxies outside code. SAP exams frequently ask scenarios distinguishing AWS' three options: Cloud Map, ECS Service Connect, App Mesh.

This article examines why service mesh emerged, how sidecar proxies intercept traffic, responsibility division. Then mTLS, canary, circuit breaker implementation; App Mesh EOL announcement (2024) and successor standards. After spinning up 10 microservices on ECS/EKS/Fargate yesterday, the next question naturally asks "how make inter-service communication safe and observable?"—today answers it.

## Why Service Mesh Was Needed — Library Analogy

In monolithic apps, function calls happen in-process. Library calls and business logic blur together. Microservices split via network calls. Same call now traverses DNS lookup, TCP handshake, TLS handshake, HTTP request, retries, timeouts, circuit breaker, metric collection.

Initially, libraries solved all. Netflix Hystrix (2012), Ribbon, Eureka fit this. Problem: reinvent per language; version upgrade means simultaneous service redeployment. Go and Python services on the same mesh require bit-level library behavior alignment.

2016, Lyft unveiled Envoy, flipping the model: **"Spin up a sidecar proxy per container; application calls localhost only."** All policies—retries, metrics—Envoy handles. App code works language-agnostic, identical behavior. This foundation underpins Istio, Linkerd, AWS App Mesh.

```
[Traditional library pattern]
[App] ──Hystrix·Ribbon──► [Network] ──► [Other App]
   Language-specific libs

[Sidecar mesh pattern]
[App] ──localhost──► [Envoy sidecar] ──mTLS·retries·metrics──► [Envoy] ──► [Other App]
   Language-agnostic, sidecar handles all policies
```

> 💡 **Related Theory**: Sidecar pattern applies **separation of concerns** to infrastructure. Separating business logic (app) from cross-cutting concerns (auth, retries, observability), you solve them once and apply everywhere. Same idea appears in Spring AOP, K8s Init Containers, JavaScript middleware. Academically, Gregor Hohpe's *Enterprise Integration Patterns* (2003) formalized it as "Channel Adapter" pattern.

> 🔍 **Deeper Dive**: **xDS API** (Envoy Data Service) standardization made Envoy dominant. Control planes (Istio, App Mesh, Consul) push routing rules, certs, discovery via xDS gRPC to Envoy. Swap control planes while keeping data plane (Envoy)—multi-control-plane migration becomes possible. xDS becomes CNCF standard.

## Three Services' Responsibility Map

AWS offers three service mesh options. Similar names, different responsibilities.

```
[Manual, basic]                    [Automatic, rich]
   │                                  │
   ▼                                  ▼
[Cloud Map]   [ECS Service Connect]    [App Mesh]
Pure registry  ECS standard discovery +  Full service mesh
DNS + API      light mesh              (Envoy sidecar)
               (Envoy auto-injected)    Routing, mTLS, circuit
                                       breaker, observability
```

| Aspect | Cloud Map | Service Connect | App Mesh |
|--------|-----------|-----------------|----------|
| Essence | Service Registry | ECS-integrated mesh (lightweight) | Full Service Mesh |
| Envoy sidecar | None | Auto-injected | Auto-injected |
| Discovery | DNS or HTTP API | Client-side LB | xDS-based routing |
| mTLS | None | None (2024) | ACM Private CA integration |
| Weighted routing (canary) | None | None | Virtual Router weight |
| Circuit breaker | None | Partial (retries, timeout) | Full support |
| Observability | None | CloudWatch metrics auto | X-Ray, CloudWatch integration |
| Use when | Simple discovery only | ECS standard, low ops | Full mesh features needed |
| EOL status | Active | Active (2022 GA) | EOL 2026.9 planned |

Relationship summary: "Cloud Map simplest registry, Service Connect Envoy auto-stacked lightweight mesh, App Mesh full-featured mesh."

## AWS Cloud Map — Discovery's Foundation

Cloud Map (2018) is **service name → resource mapping** basic layer. Two namespace types:

- **DNS Namespace** (Public or Private): Route 53 Hosted Zone integration. Querying `service-a.internal` returns ECS Task IP list. Most common pattern.
- **HTTP Namespace**: No DNS; HTTP API queries instance list. Users poll or SDK-integrate.

Creating ECS Service, add `serviceRegistries` option auto-registering Cloud Map. Task startup registers IP+port; termination auto-deregisters. EKS can match via ExternalDNS controller, but K8s Service' native discovery overshadows Cloud Map's role in EKS.

Cloud Map's limitation: **no functionality beyond that**. Pure name → IP; load-balancing defers to client DNS cache and random selection. Retries, circuit breaker, mTLS—mesh features absent.

> ⚠️ **Trap**: Creating Private DNS Namespace auto-creates internal Route 53 Private Hosted Zone. Must connect to VPC for queries—VPC detail often forgotten. TTL defaults 10s (fast IP propagation), but clients caching DNS can call stale IPs. SDK-level short TTL setting is standard.

## ECS Service Connect — ECS's Standardized Lightweight Mesh

ECS Service Connect (2022 GA) builds on Cloud Map discovery, **auto-injecting Envoy sidecars**, providing client-side load-balancing, CloudWatch metrics, retries, timeouts by default. Enable with single ECS Service block.

```bash
aws ecs update-service \
  --cluster prod --service myapp \
  --service-connect-configuration '{
    "enabled": true,
    "namespace": "prod.local",
    "services": [
      {
        "portName": "http",
        "clientAliases": [{"port": 80, "dnsName": "myapp"}]
      }
    ]
  }'
```

After, other ECS Services in same namespace call `http://myapp/...`, Envoy automatically load-balances service-a → service-b. Microservice comms work without ALB.

```
[Service A Task]
   │
   ├─ App Container (calls localhost:80)
   │     ↓
   └─ Envoy Sidecar (auto-injected)
         │
         ├─ Auto Cloud Map query (Service B Task IPs)
         ├─ Client-side load-balancing
         ├─ Retries, timeouts
         └─ CloudWatch metrics auto-emit
              │
              ▼
        [Service B Tasks (multiple)]
              │ Auto Cloud Map register/deregister
```

Service Connect advantage: **low operational burden**. No need writing Virtual Service, Router, Node manifests like App Mesh; ECS Service option block suffices. Metrics auto-flowing to CloudWatch (traffic, error rate, latency) come as default dashboard.

Downside: **no full-mesh features**. Weighted-canary, circuit breaker, mTLS unsupported (2024). Need them? Switch to App Mesh, or if mixing ECS+EKS, add EKS + Istio.

> 💡 **Related Theory**: Client-side load-balancing has **no extra hop** vs. server-side (ALB). ALB adds hop: client → ALB → server (2 hops); client-side: client → server (1 hop). Deep call chains (5-10 services) accumulate latency. gRPC's Round Robin and xDS resolvers use same thinking. Downside: client knows server list directly. Cloud Map auto-refresh solves this.

## AWS App Mesh — Full-Featured Mesh and Its EOL

App Mesh (2019) is full service mesh using Envoy as data plane. Abstraction model: 4 layers.

```
[Mesh]
  │ Entire mesh unit
  ▼
[Virtual Service]   "Payment Service" logical name
  │
  ▼
[Virtual Router]    Traffic split (weighted, header-based)
  │
  ├──[Virtual Node v1, weight=90]──► [ECS Service v1]
  └──[Virtual Node v2, weight=10]──► [ECS Service v2]
```

This structure enables:

- **Weighted canary**: Virtual Router weight 90:10 → 70:30 → 0:100 gradual shift
- **Header-based routing**: `x-canary: true` header routes to v2
- **Retries, circuit breaker**: Virtual Node policies, Envoy auto-executes
- **mTLS**: ACM Private CA short-lived cert issuance, auto-rotation, Envoy applies all comms
- **X-Ray integration**: Sidecar auto-emits traces

```yaml
# Virtual Router weighted routing (abbreviated)
{
  "spec": {
    "httpRoute": {
      "match": {"prefix": "/"},
      "action": {
        "weightedTargets": [
          {"virtualNode": "checkout-v1", "weight": 90},
          {"virtualNode": "checkout-v2", "weight": 10}
        ]
      }
    }
  }
}
```

**App Mesh EOL**: November 2024, AWS announced App Mesh **EOL September 30, 2026**. New workloads should explore alternatives (Istio on EKS, ECS Service Connect). At test authoring time (SAP-C02 v1.5 ~ 2024 exam), App Mesh remains correct answers, but new adoption not recommended operationally.

> 📚 **Case Study**: App Mesh EOL's causes: First, AWS data showed ECS Service Connect covers 70%+ ECS users' needs. Second, EKS users de facto adopted Istio/Linkerd. App Mesh occupied vague middle ground; new feature investment stalled. Similar pattern: 2023 AWS X-Ray + OpenTelemetry integration—AWS pivoting from proprietary toward CNCF standards.

> 🔍 **Deeper Dive**: Istio's control plane (istiod) tightly integrates K8s; poor ECS fit. EKS users can adopt Istio via Add-on (2024 EKS Marketplace) lightly. Linkerd is lighter but feature-reduced. Multi-cloud standardization priority → Istio; simplicity priority → Linkerd is typical recommendation.

## mTLS and ACM Private CA — Zero Trust Core

Service mesh's largest security value: mTLS (Mutual TLS). Standard TLS, server has cert; mTLS, client+server bilateral verification. Zero Trust model's (distrust network location, authenticate all requests) core implementation.

App Mesh integrates ACM Private CA, implementing mTLS nearly automatic.

```
[ACM Private CA]   ← Company's private authority
       │
       ├─ Every 24h short-lived cert issuance
       │
[Envoy sidecar A] ───mTLS─── [Envoy sidecar B]
         │                       │
         └─ Bilateral cert verify│
         └─ SAN confirms service ID
```

Three value points:

1. **Short-lived cert auto-rotation**: ACM Private CA issues 24h certs, auto-rotate on expiry. Key exposure minimized.
2. **Service ID verification**: Certificate's SAN (Subject Alternative Name) embeds service ID, enabling "only Payment Service calls Order Service" policies.
3. **Application code unchanged**: TLS handled by Envoy sidecar. App calls plain HTTP; sidecar encrypts.

> 💡 **Related Theory**: mTLS trust model uses **PKI (Public Key Infrastructure)** X.509 cert chain validation. CA roots trust at top; issued certs beneath carry CA signature proving authenticity. Private CAs within company: ACM Private CA (AWS), HashiCorp Vault, Google CA (GCP). Short cert lifetime concept mirrors SPIFFE/SPIRE (CNCF) same direction; auto-rotation eliminates manual key management burden.

> 🎯 **Scenario**: "A financial company mTLS-encrypts all 50-microservice comms. Manual cert rotation is ops burden. Fitting combo?" — **App Mesh + ACM Private CA** (test authoring time). App Mesh EOL is operations perspective; SAP asks era-correct answers. New adoption: Istio + cert-manager + ACM Private CA operational standard; SAP still asks App Mesh.

## Canary Deployment — Weighted Routing and CodeDeploy Blue/Green

Routing new versions to partial traffic deploys via mesh, load balancer, or CodeDeploy.

| Option | Weight granularity | Traffic split location |
|--------|---------------------|----------------------|
| **App Mesh Virtual Router** | Arbitrary 1% | Mesh (Envoy sidecar) |
| **ALB Weighted Target Group** | 1% unit | Load balancer |
| **CodeDeploy Blue/Green** | Predefined Linear/Canary ratios | ALB Target Group auto-switch |

App Mesh offers finest control. Combined with header-routing: "internal employees only use v2" patterns. ALB simple 90:10 weighted target group matches roughly; header splits limited. CodeDeploy overlays deploy automation on ALB, auto-executing "10% → 30% → 100%" preset patterns.

ECS Service Connect doesn't directly support weighted routing, so canary needs CodeDeploy Blue/Green + ALB Weighted Target Group.

```
[CodeDeploy Blue/Green + ALB]
   │
[Blue Target Group (v1, 90%)]  ──► ECS Service v1
   │
[Green Target Group (v2, 10%)] ──► ECS Service v2
   │
   ▼ Gradual shift (10% → 50% → 100%)
   ▼ Auto-rollback on alarm
```

> 📚 **Case Study**: 2022, Airbnb standardized payment service canary with Istio weight routing + Prometheus metric-based auto-rollback. New version's 5xx ratio over 2× baseline instantly zeroes weight. Pattern called **Progressive Delivery**, tools like Flagger and Argo Rollouts standardizing it on K8s.

## ALB, NLB, API Gateway and Mesh Responsibility Division

Mesh handles East-West (inter-service), ALB/NLB/API Gateway handle North-South (external ingress). Confusing this division costs SAP wrong answers.

```
[Internet]
   │
   ▼
[CloudFront]            ← Global CDN, edge caching
   │
   ▼
[API Gateway / ALB]    ← N-S ingress, auth, WAF
   │
   ▼
[Service A (Envoy)]   ← Mesh entry
   │ E-W mesh comms (mTLS, canary)
[Service B (Envoy)]
   │
[Service C (Envoy)]
   │
   ▼
[RDS / DynamoDB / S3]
```

| Traffic | Recommended |
|---------|-----------|
| External HTTPS + auth + WAF | **API Gateway + Cognito + WAF** |
| External HTTPS + simple routing | **ALB** |
| External TCP/UDP + static IP + high perf | **NLB** |
| Internal East-West HTTP, gRPC | **Service Mesh** (Service Connect / App Mesh) |
| External + internal mesh both | **API Gateway + mesh combo** |

> ⚠️ **Trap**: "Use ALB Target Group for microservice comms" works small-scale; full mTLS, canary, circuit breaker insufficient. ALB dominates N-S, mesh dominates E-W—remember responsibility division for right answers.

## Service Mesh Comparison Across Clouds

| Dimension | AWS | GCP | Azure |
|-----------|-----|-----|-------|
| Managed mesh | App Mesh (EOL planned), Service Connect | Anthos Service Mesh (Istio-based) | Service Mesh (Open Service Mesh, OSM) |
| Discovery | Cloud Map | Service Directory | Azure Service Fabric |
| Envoy integration | Available (App Mesh, Service Connect) | Standard | Standard |
| Managed Istio | EKS Add-on | Anthos Service Mesh | AKS OSM (Deprecated 2024) |

GCP early-adopted Istio as managed mesh standard (Anthos Service Mesh). AWS built proprietary App Mesh; market adoption insufficient, EOL decided. Azure also deprecated Open Service Mesh 2024, pivoting to Istio Add-on. Cloud mesh market trend: clear **Istio + Envoy single standardization**.

> 🔍 **Deeper Dive**: Service Mesh Interface (SMI) was K8s SIG's attempted mesh standard API; 2023 archived. Standardization attempt failed because Istio became de facto standard, making abstract layers unnecessary. Cloud-native ecosystem "standardization" often happens via one implementation's de facto dominance, not abstract standards. K8s itself follows this pattern, as does Envoy.

## Summary

Service mesh moves microservice comms' cross-cutting concerns (auth, retries, observability, encryption) to sidecar proxies. AWS offers **Cloud Map (registry) / ECS Service Connect (ECS standard mesh) / App Mesh (full mesh)**; each responsibility differs. App Mesh EOL announced; new adoption checks Istio and Service Connect as standard, but SAP exams still accept App Mesh at test authoring.

Tomorrow synthesizes Week 7 with 12-scenario questions. Knowledge accumulated—ECS, EKS, Fargate, Karpenter, IRSA, Service Connect—branches through SAP scenarios. Multi-account, hybrid, cost optimization fused with containers—that's tomorrow's lens.

---

## 📝 연습 문제

**문제 1.** 한 핀테크가 ECS Fargate 위 마이크로서비스 30개를 운영한다. 다음을 모두 만족해야 한다. ① 모든 통신 mTLS ② 새 버전을 5% 트래픽 카나리 ③ 서비스별 서킷 브레이커. 어떤 도구를 쓰는가?

A) ALB Weighted Target Group + ACM Public Certificate
B) AWS App Mesh + ACM Private CA
C) Cloud Map만
D) Route 53 Weighted Routing

**정답: B**
A fintech runs 30 microservices on ECS Fargate. Must satisfy all: ① all comms mTLS ② new versions 5% canary traffic ③ per-service circuit breaker. Which tools?

Three full-mesh features (mTLS, weighted canary, circuit breaker) = App Mesh domain. ACM Private CA short-lived certs auto-rotation, Virtual Router 5% canary weighting, Virtual Node circuit breaker policy. A: ACM Public external-domain-only, ALB lacks circuit breaker. C: discovery only, no mesh features. D: DNS-level weighting—1% granularity/circuit breaker impossible. Operations note: App Mesh EOL (2026.9) → new adoption standard EKS + Istio; SAP exams ask era-correct answers.

---

**문제 2.** ECS Cluster내 마이크로서비스 간 단순 디스커버리·재시도·CloudWatch 메트릭이 자동 제공되고 운영 부담이 최소인 옵션은?

A) AWS App Mesh
B) ECS Service Connect
C) Cloud Map + 수동 클라이언트 LB
D) ALB per Service

**정답: B**
Simple discovery, retries, CloudWatch metrics auto-provided, minimum ops burden for inter-microservice comms in ECS Cluster?

Service Connect: Single ECS Service block enables Envoy auto-inject, Cloud Map auto-register, retries, CloudWatch metrics standard. A: Full mesh bigger ops burden (Virtual Service/Router/Node manifests). C: All manual integration. D: 30 services = 30 ALBs, cost and ops burden high. Trap: "Mesh = App Mesh" simple matching. Service Connect is lightweight standard mesh for ECS.

---

**문제 3.** 외부 사용자가 HTTPS로 진입하고 JWT 인증·rate limiting이 필요. 내부 East-West는 메시. 외부 진입에 가장 적합한 서비스는?

A) AWS App Mesh
B) API Gateway + Cognito
C) Cloud Map Public Namespace
D) NLB

**정답: B**
External HTTPS ingress + JWT auth, rate limiting needed. Internal East-West uses mesh. Most fitting external ingress service?

External ingress + auth + rate-limiting = API Gateway domain. Cognito integration JWT validates, usage plan rate-limits. A: East-West mesh, external ingress unsuitable. C: discovery, not ingress. D: L4 ingress—no HTTP auth, rate-limit. Bonus: API Gateway can act as mesh ingress gateway, substituting service mesh ingress pattern.

---

**문제 4.** App Mesh의 Virtual Router에서 v1=100, v2=0으로 시작해 매시간 v2 비율을 10%씩 올린다. 이 패턴의 이름은?

A) Blue/Green
B) 카나리(Canary)
C) A/B Test
D) Shadow Deployment

**정답: B**
App Mesh Virtual Router: start v1=100, v2=0; hourly increment v2 by 10%. This pattern name?

Gradual weight increase = canary. Blue/Green: 0% → 100% one switch (fast rollback advantage). A/B Test: user segment split (behavioral measurement, not performance). Shadow: traffic replicate (v2 doesn't impact responses, processes same requests for validation). Trap: Blue/Green confused with canary. CodeDeploy "Linear," "Canary" options implement gradual canary pattern.

---

**문제 5.** Cloud Map Private DNS Namespace의 동작은?

A) 공개 인터넷에서 조회 가능
B) Route 53 Private Hosted Zone 자동 생성, 연결된 VPC 내부에서만 조회
C) IPv6 전용
D) AWS 전체 모든 VPC에서 자동 조회

**정답: B**
Cloud Map Private DNS Namespace behavior?

Private Namespace auto-creates internal Route 53 Private Hosted Zone, connected to specified VPC only for queries within. Other VPCs need VPC Peering, Transit Gateway + Private Hosted Zone sharing. A: Public Namespace behavior. C: separate option. D: not auto. Trap: forget VPC connection → query failure hard to debug.

---

**문제 6.** 모든 마이크로서비스 통신을 mTLS로 보호하고 인증서는 24시간 단명으로 자동 회전. 가장 적합한 조합은?

A) ACM Public Certificate + ALB Listener
B) ACM Private CA + App Mesh
C) Self-signed 인증서 수동 회전
D) IAM Access Key

**정답: B**
Protect all microservice comms mTLS, certs 24h short-lived, auto-rotate. Most fitting combo?

ACM Private CA issues short-lived certs with auto-rotation; App Mesh injects Envoy sidecar bilateral mTLS verify. A: Public cert external-domain; no short-lived rotation pattern. C: manual rotation big ops burden, human error risk. D: IAM, mTLS unrelated. Bonus: short cert lifetime core to SPIFFE/SPIRE principles. EKS + cert-manager + ACM Private CA implements same pattern.

---

**문제 7.** ECS Service Connect가 직접 지원하지 **않는** 기능은?

A) Cloud Map 자동 등록
B) Envoy 사이드카 자동 주입
C) 1% 단위 가중치 기반 카나리 라우팅
D) CloudWatch 메트릭 자동 emit

**정답: C**
Which feature does ECS Service Connect NOT directly support?

Service Connect is lightweight mesh: discovery, metrics, retries, timeouts standard; 1% weighted canary routing unsupported. Canary needs CodeDeploy Blue/Green + ALB Weighted Target Group, or App Mesh. A, B, D all Service Connect auto-provides. Trap: "Mesh → must do canary." Lightweight vs. full-mesh distinction exactly here.

---

## 📌 오늘의 요약

1. **Sidecar mesh = cross-cutting concern separation**, language-agnostic, Envoy de facto standard
2. **Cloud Map = registry**, **Service Connect = ECS standard mesh** (Envoy auto), **App Mesh = full mesh** (EOL 2026.9)
3. **East-West = mesh**, **North-South = ALB/API Gateway**, clear responsibility division
4. **mTLS = ACM Private CA + App Mesh**, short-lived auto-rotation core to Zero Trust
5. **Canary = Virtual Router weight** or ALB Weighted Target Group, Service Connect no weight support → CodeDeploy combo
6. **Post-App Mesh EOL**, new adoption = Istio + Envoy + cert-manager operational standard
7. **Cloud mesh trend = Istio single standardization**, GCP·Azure·AWS same direction
