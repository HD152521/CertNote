# Day 4 - 서비스 메시의 해부 — App Mesh, Service Connect, Cloud Map이 갈리는 지점

마이크로서비스를 10개 띄우는 순간, 새로운 종류의 문제가 시작된다. service-a가 service-b의 IP를 어떻게 알 것인가, service-b가 갑자기 5xx를 뱉으면 service-a는 얼마나 빨리 재시도해야 하는가, 통신을 모두 mTLS로 암호화하려면 인증서는 누가 발급·회전하는가, 새 버전을 10%만 트래픽 받게 하려면 어디서 라우팅을 갈라야 하는가. 이 모든 문제를 애플리케이션 코드 안에서 풀면 코드가 비즈니스 로직보다 인프라 코드로 더 두꺼워진다. 서비스 메시는 이 문제를 코드 밖 사이드카 프록시로 옮긴 답이다. SAP 시험은 AWS의 세 가지 옵션 — Cloud Map·ECS Service Connect·App Mesh — 의 차이를 시나리오로 자주 묻는다.

이 글에서는 서비스 메시가 왜 생겨났는지, 사이드카 프록시가 어떻게 트래픽을 가로채는지, 세 서비스가 책임을 어떻게 나누는지를 본다. 그리고 mTLS·카나리·서킷 브레이커 같은 메시 기능이 실제로 어떻게 구현되는지, App Mesh EOL 발표(2024) 이후 어떤 대안이 표준이 되어가는지를 다룬다. 어제까지 본 ECS·EKS·Fargate 위에 마이크로서비스 10개를 띄웠다면 다음 자연스러운 질문이 "그들 간 통신은 어떻게 안전·관찰 가능하게 만드는가"이고, 오늘이 그 답이다.

## 서비스 메시가 왜 필요했나 — 도서관 비유

모놀리식 애플리케이션에서 함수 호출은 같은 프로세스 안에서 일어난다. 라이브러리 호출과 비즈니스 로직 호출의 차이가 거의 없다. 마이크로서비스는 이걸 네트워크 호출로 쪼갠다. 같은 호출이 이제 DNS lookup·TCP 핸드셰이크·TLS 핸드셰이크·HTTP request·재시도·타임아웃·서킷 브레이커·메트릭 수집을 모두 거쳐야 한다.

처음에는 이 모든 걸 라이브러리로 해결하려 했다. Netflix Hystrix(2012)·Ribbon·Eureka가 같은 흐름이다. 문제는 언어마다 라이브러리를 다 만들어야 하고, 버전 업그레이드가 곧 모든 서비스의 동시 배포로 이어진다는 점이다. Go 서비스와 Python 서비스가 같은 메시 위에서 통신하려면 두 언어의 라이브러리 동작이 비트 단위로 일치해야 한다.

2016년 Lyft가 Envoy를 발표하며 발상이 뒤집혔다. **"사이드카 프록시를 컨테이너 옆에 띄우고, 애플리케이션은 그냥 localhost로 부르라"**. 모든 네트워크 정책·재시도·메트릭은 사이드카(Envoy)가 처리한다. 애플리케이션 코드는 언어를 가리지 않고 동일한 동작을 받는다. 이 발상이 Istio·Linkerd·AWS App Mesh의 공통 토대가 됐다.

```
[전통적 라이브러리 방식]
[App] ──Hystrix·Ribbon──► [Network] ──► [Other App]
   언어별 라이브러리 의존

[사이드카 메시 방식]
[App] ──localhost──► [Envoy 사이드카] ──mTLS·재시도·메트릭──► [Envoy] ──► [Other App]
   언어 무관, 사이드카가 모든 정책 처리
```

> 💡 **관련 이론**: 사이드카 패턴은 **분리(separation of concerns)** 원칙의 인프라 적용이다. 비즈니스 로직(애플리케이션)과 횡단 관심사(인증·재시도·관찰)를 분리하면, 횡단 관심사를 한 번 잘 만들어 모든 서비스에 적용할 수 있다. 같은 발상이 Spring의 AOP, K8s의 Init Container, 자바스크립트의 미들웨어에도 있다. 학술적으로는 Gregor Hohpe의 *Enterprise Integration Patterns* (2003)에서 "Channel Adapter" 패턴으로 정리됐다.

> 🔍 **더 깊이**: Envoy가 표준이 된 이유는 **xDS API**(Envoy Data Service)가 표준화되어 있기 때문이다. 컨트롤 플레인(Istio·App Mesh·Consul)이 xDS gRPC API로 라우팅 규칙·인증서·서비스 디스커버리 정보를 Envoy에 푸시한다. 컨트롤 플레인을 바꿔도 데이터 플레인(Envoy)은 그대로 쓸 수 있는 구조라, 멀티 컨트롤 플레인 환경에서도 마이그레이션이 가능하다. xDS는 CNCF 표준이 되어가는 중이다.

## 세 서비스의 책임 지도

AWS는 서비스 메시 영역에 세 가지 옵션을 가진다. 이름이 비슷해서 헷갈리지만 책임이 다르다.

```
[수동·기본]                              [자동·풍부]
   │                                        │
   ▼                                        ▼
[Cloud Map]        [ECS Service Connect]      [App Mesh]
순수 레지스트리   ECS 표준 디스커버리 +        풀 서비스 메시
DNS + API         가벼운 메시 기능              (Envoy 사이드카)
                  (Envoy 사이드카 자동)         라우팅·mTLS·서킷
                                              브레이커·관찰성 전부
```

| 항목 | Cloud Map | Service Connect | App Mesh |
|------|-----------|-----------------|----------|
| 본질 | Service Registry | ECS 통합 메시 (가벼움) | Full Service Mesh |
| Envoy 사이드카 | 없음 | 자동 주입 | 자동 주입 |
| 디스커버리 방식 | DNS 또는 HTTP API | 클라이언트 사이드 LB | xDS 기반 라우팅 |
| mTLS | 없음 | 없음(2024 기준) | ACM Private CA 통합 |
| 가중치 라우팅 (카나리) | 없음 | 없음 | Virtual Router 가중치 |
| 서킷 브레이커 | 없음 | 일부(재시도·타임아웃) | 완전 지원 |
| 관찰성 | 없음 | CloudWatch 메트릭 자동 | X-Ray·CloudWatch 통합 |
| 사용 시기 | 단순 디스커버리만 | ECS 표준, 운영 부담 작게 | 풀 메시 기능 필요할 때 |
| EOL | 활발 | 활발 (2022 GA) | 2026.9 EOL 예정 |

세 서비스의 관계는 "Cloud Map은 가장 단순한 레지스트리, Service Connect는 그 위에 Envoy를 자동으로 얹은 가벼운 메시, App Mesh는 풀 기능 메시"로 요약할 수 있다.

## AWS Cloud Map — 모든 디스커버리의 토대

Cloud Map(2018)은 **서비스 이름 → 리소스 매핑**의 가장 기본 레이어다. 두 종류의 네임스페이스를 가진다.

- **DNS Namespace** (Public 또는 Private): Route 53 Hosted Zone과 통합. `service-a.internal`로 조회하면 ECS Task IP 목록을 받는다. 가장 흔한 사용 패턴.
- **HTTP Namespace**: DNS 없이 HTTP API로 인스턴스 목록 조회. 사용자가 직접 polling 또는 SDK 통합.

ECS Service를 만들 때 `serviceRegistries` 옵션으로 Cloud Map에 자동 등록하게 할 수 있다. Task가 뜨면 IP·port가 등록되고, 종료되면 자동으로 deregister된다. EKS도 ExternalDNS 컨트롤러를 통해 비슷한 패턴을 쓸 수 있지만, EKS 자체에는 K8s Service라는 내장 디스커버리가 있어서 Cloud Map의 비중이 ECS만큼 크지는 않다.

Cloud Map의 한계는 **그 위 기능이 전혀 없다**는 점이다. 단순 이름 → IP만 알려주고, 로드밸런싱은 클라이언트의 DNS 캐시·랜덤 선택에 맡긴다. 재시도·서킷 브레이커·mTLS 같은 메시 기능은 없다.

> ⚠️ **함정**: Cloud Map의 Private DNS Namespace를 만들면 내부적으로 Route 53 Private Hosted Zone이 생성된다. 이걸 VPC에 직접 연결해야 조회가 가능한데, VPC를 자주 깜빡한다. 또 TTL이 기본 10초라 IP 변경이 빠르게 전파되지만, 클라이언트가 DNS 캐싱을 길게 잡아두면 stale IP로 호출하는 함정이 있다. SDK 레벨에서 DNS TTL을 짧게 설정하는 게 표준.

## ECS Service Connect — ECS가 표준화한 가벼운 메시

ECS Service Connect(2022 GA)는 Cloud Map 기반 디스커버리에 **Envoy 사이드카를 자동 주입**하고, 클라이언트 사이드 로드밸런싱·CloudWatch 메트릭·재시도·타임아웃을 기본 제공한다. ECS Service 정의에서 한 블록만 추가하면 켜진다.

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

이 설정 후 같은 namespace의 다른 ECS Service에서 `http://myapp/...`로 호출하면, Envoy 사이드카가 자동으로 service-a → service-b로 로드밸런싱한다. ALB 없이도 마이크로서비스 통신이 끝난다.

```
[Service A Task]
   │
   ├─ App Container (localhost:80 호출)
   │     ↓
   └─ Envoy Sidecar (자동 주입)
         │
         ├─ Cloud Map 자동 조회 (Service B의 Task IP 목록)
         ├─ 클라이언트 사이드 로드밸런싱
         ├─ 재시도·타임아웃
         └─ CloudWatch 메트릭 자동 emit
              │
              ▼
        [Service B Tasks (다수)]
              │ Cloud Map 자동 등록·deregister
```

Service Connect의 장점은 **운영 부담이 작다**는 점이다. App Mesh처럼 Virtual Service·Virtual Router·Virtual Node를 매니페스트로 작성할 필요 없이, ECS Service 옵션 한 블록으로 끝난다. CloudWatch에 자동으로 흘러가는 메트릭(트래픽량·에러율·지연시간)도 기본 대시보드로 제공된다.

단점은 풀 메시 기능이 없다는 점이다. **가중치 기반 카나리·서킷 브레이커·mTLS는 미지원**(2024 기준). 이게 필요하면 App Mesh로 가거나, ECS와 EKS를 같이 쓴다면 EKS + Istio를 쓰는 게 패턴이다.

> 💡 **관련 이론**: 클라이언트 사이드 로드밸런싱은 서버 사이드(ALB)와 비교하면 **추가 hop이 없다**는 장점이 있다. ALB를 거치면 client → ALB → server로 2 hop이고, 클라이언트 사이드는 client → server 1 hop이다. 마이크로서비스 호출 체인이 깊을수록(5~10 서비스) 누적 지연시간 차이가 커진다. 같은 발상이 gRPC의 Round Robin·xDS resolver에도 있다. 단점은 클라이언트가 서버 목록을 직접 알아야 한다는 점인데, 이걸 Cloud Map이 자동 갱신해서 해결한다.

## AWS App Mesh — 풀 기능 메시와 그 EOL

App Mesh(2019)는 Envoy를 데이터 플레인으로 쓰는 풀 서비스 메시다. 추상화 모델은 4단계다.

```
[Mesh]
  │ 전체 메시 단위
  ▼
[Virtual Service]   "결제 서비스"라는 논리 이름
  │
  ▼
[Virtual Router]    트래픽 분기 (가중치, 헤더 기반)
  │
  ├──[Virtual Node v1, weight=90]──► [ECS Service v1]
  └──[Virtual Node v2, weight=10]──► [ECS Service v2]
```

이 구조 덕에 다음 기능이 가능하다.

- **가중치 기반 카나리**: Virtual Router의 weight를 90:10 → 70:30 → 0:100으로 점진 이동
- **헤더 기반 라우팅**: `x-canary: true` 헤더가 있으면 v2로
- **재시도·서킷 브레이커**: Virtual Node에 정책 정의, Envoy가 자동 실행
- **mTLS**: ACM Private CA에서 단명 인증서 발급·자동 회전, Envoy가 모든 통신에 적용
- **X-Ray 통합**: 사이드카가 trace 자동 emit

```yaml
# Virtual Router 가중치 라우팅 (간략)
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

**App Mesh EOL**: 2024년 11월, AWS는 App Mesh를 **2026년 9월 30일에 EOL** 한다고 발표했다. 신규 워크로드는 다른 메시(Istio on EKS, ECS Service Connect)를 검토하도록 권장하고 있다. 시험 출제 시점(SAP-C02 v1.5 기준 2024 시험판)에는 여전히 App Mesh가 정답으로 출제되지만, 실무에서 새로 도입하는 건 권장되지 않는다.

> 📚 **사례**: App Mesh EOL의 배경은 두 가지다. 첫째, AWS 내부에서도 ECS Service Connect가 ECS 사용자 70% 이상의 needs를 커버한다는 데이터가 모였다. 둘째, EKS 사용자는 사실상 Istio/Linkerd를 표준으로 채택하고 있었다. App Mesh가 ECS와 EKS의 중간에서 모호한 위치를 가졌고, 신규 기능 투자도 정체됐다. 같은 패턴이 2023년 발표된 AWS X-Ray와 OpenTelemetry의 통합 흐름에서도 보인다. AWS는 자체 표준을 고집하기보다 CNCF 표준에 합류하는 방향으로 선회 중이다.

> 🔍 **더 깊이**: Istio는 컨트롤 플레인(istiod)이 K8s에 깊이 통합되어 ECS와는 잘 안 맞는다. EKS 사용자라면 Istio Add-on(2024년 EKS Marketplace)으로 가볍게 도입 가능하다. Linkerd는 Istio보다 가볍지만 기능이 일부 적다. 멀티 클라우드 표준화가 우선이면 Istio, 단순함이 우선이면 Linkerd가 일반적 권장이다.

## mTLS와 ACM Private CA — Zero Trust의 핵심

서비스 메시의 보안 가치 중 가장 큰 게 mTLS(Mutual TLS)다. 일반 TLS는 서버만 인증서를 가지지만, mTLS는 클라이언트도 인증서를 가지고 양방향으로 검증한다. Zero Trust 모델(네트워크 위치를 신뢰하지 않고 모든 요청을 인증)의 핵심 구현 메커니즘이다.

App Mesh는 ACM Private CA와 통합해 mTLS를 거의 자동으로 구현한다.

```
[ACM Private CA]   <-- 회사 전용 인증 기관
       │
       ├─ 매 24시간 단명 인증서 발급
       │
[Envoy 사이드카 A] ───mTLS─── [Envoy 사이드카 B]
         │                       │
         └─ 양방향 cert 검증     │
         └─ Subject Alternative Name으로 서비스 ID 확인
```

핵심 가치 세 가지:

1. **단명 인증서 자동 회전**: ACM Private CA가 24시간 단명 인증서를 발급해 만료 자동 회전. 키 노출 위험 최소화.
2. **서비스 ID 검증**: 인증서의 SAN(Subject Alternative Name)에 서비스 식별자를 넣어, "결제 서비스만 주문 서비스를 호출 가능" 같은 정책 구현.
3. **애플리케이션 코드 무수정**: TLS 처리는 Envoy 사이드카가 전담. 애플리케이션은 평문 HTTP로 호출하고 사이드카가 암호화.

> 💡 **관련 이론**: mTLS의 신뢰 모델은 **PKI(Public Key Infrastructure)**의 X.509 인증서 체인 검증이다. CA가 최상위에서 신뢰의 뿌리(root of trust)가 되고, 그 아래 발급된 인증서들은 CA의 서명으로 진위성이 보장된다. 회사 내부에서만 쓰는 사설 CA는 ACM Private CA(AWS), HashiCorp Vault, GoogleCA(GCP) 등이 제공한다. 인증서 수명을 짧게 잡는 발상은 SPIFFE/SPIRE 프로젝트(CNCF)에서도 같은 방향이고, 만료 회전이 자동이라 키 회전 운영 부담이 0에 가깝다.

> 🎯 **시나리오**: "한 금융사가 마이크로서비스 50개 사이의 모든 통신을 mTLS로 암호화하려 한다. 인증서 수동 회전은 운영 부담이 크다. 어떤 조합이 적합한가?" — 답은 **App Mesh + ACM Private CA**(시험 출제 시점 기준). App Mesh가 EOL 예정이라는 점은 실무 관점이지만, SAP 시험은 출제 시점의 정답을 묻는다. 신규 도입이라면 Istio + cert-manager + ACM Private CA가 실무 표준이지만 SAP가 묻는 정답은 여전히 App Mesh다.

## 카나리 배포 — 가중치 라우팅과 CodeDeploy Blue/Green

새 버전을 일부 트래픽만 받게 하는 카나리 배포는 메시·로드밸런서·CodeDeploy 셋 중 하나로 구현된다.

| 옵션 | 가중치 단위 | 트래픽 분기 위치 |
|------|------------|------------------|
| **App Mesh Virtual Router** | 1% 단위 임의 | 메시(Envoy 사이드카) |
| **ALB Weighted Target Group** | 1% 단위 | 로드밸런서 |
| **CodeDeploy Blue/Green** | Linear/Canary 정해진 비율 | ALB Target Group 자동 전환 |

App Mesh는 가장 세밀한 제어가 가능하다. 헤더 기반 라우팅까지 결합하면 "내부 직원만 v2 사용" 같은 패턴도 만든다. ALB는 단순한 90:10 weighted target group으로 비슷한 패턴을 만들지만 헤더 기반 분기는 제한적이다. CodeDeploy는 ALB 위에 배포 자동화 레이어를 얹어 "10% → 30% → 100%" 같은 정해진 패턴을 자동 실행한다.

ECS Service Connect는 가중치 라우팅을 직접 지원하지 않으므로, 카나리가 필요하면 CodeDeploy Blue/Green과 결합하는 게 표준이다.

```
[CodeDeploy Blue/Green + ALB]
   │
[Blue Target Group (v1, 90%)]  ──► ECS Service v1
   │
[Green Target Group (v2, 10%)] ──► ECS Service v2
   │
   ▼ 단계적 전환 (10% → 50% → 100%)
   ▼ 알람 발생 시 자동 롤백
```

> 📚 **사례**: 2022년 Airbnb는 결제 서비스 카나리 배포에 Istio 가중치 라우팅 + Prometheus 메트릭 기반 자동 롤백을 결합한 시스템을 사내 표준으로 만들었다. 새 버전의 5xx 비율이 baseline 대비 2배 초과하면 가중치를 즉시 0으로 되돌리는 정책. 이 패턴이 **Progressive Delivery**로 불리며, Flagger·Argo Rollouts 같은 K8s 도구가 표준화하는 중이다.

## ALB·NLB·API Gateway와 메시의 책임 분담

서비스 메시는 East-West 트래픽(내부 서비스 간) 전담이고, North-South 트래픽(외부 진입)은 ALB·NLB·API Gateway가 담당한다. 이 분담을 헷갈리면 SAP 문제에서 오답을 고른다.

```
[Internet]
   │
   ▼
[CloudFront]            ← 글로벌 CDN, edge 캐싱
   │
   ▼
[API Gateway / ALB]    ← N-S 진입, 인증·인가, WAF
   │
   ▼
[Service A (Envoy)]   ← 메시 진입
   │ E-W 메시 통신 (mTLS, 카나리)
[Service B (Envoy)]
   │
[Service C (Envoy)]
   │
   ▼
[RDS / DynamoDB / S3]
```

| 트래픽 | 권장 |
|--------|-----|
| 외부 HTTPS + 인증·인가 + WAF | **API Gateway + Cognito + WAF** |
| 외부 HTTPS + 단순 routing | **ALB** |
| 외부 TCP/UDP + 정적 IP + 초고성능 | **NLB** |
| 내부 East-West HTTP·gRPC | **Service Mesh** (Service Connect / App Mesh) |
| 외부 진입 + 내부 메시 모두 | **API Gateway + 메시 조합** |

> ⚠️ **함정**: "마이크로서비스 통신에 ALB Target Group을 쓰겠다"는 보기는 small scale에서 가능하지만 풀 mTLS·카나리·서킷 브레이커가 필요하면 부족하다. ALB는 N-S 우수, 메시는 E-W 우수로 책임 분담을 기억하면 정답이 보인다.

## 다른 클라우드의 서비스 메시와 비교

| 차원 | AWS | GCP | Azure |
|------|-----|-----|-------|
| 매니지드 메시 | App Mesh (EOL 예정), Service Connect | Anthos Service Mesh (Istio 기반) | Service Mesh (Open Service Mesh, OSM) |
| 디스커버리 | Cloud Map | Service Directory | Azure Service Fabric |
| Envoy 통합 | 가능 (App Mesh, Service Connect) | 표준 | 표준 |
| Istio 매니지드 | EKS Add-on | Anthos Service Mesh | AKS Open Service Mesh (Deprecated 2024) |

GCP는 일찍부터 Istio를 매니지드 메시의 표준으로 잡았다(Anthos Service Mesh). AWS는 자체 App Mesh를 만들었지만 시장 채택이 부족해 EOL을 결정했다. Azure도 Open Service Mesh를 2024년 deprecate하며 Istio Add-on으로 선회했다. 클라우드 메시 시장의 흐름은 명확히 **Istio + Envoy의 단일 표준화**다.

> 🔍 **더 깊이**: Service Mesh Interface(SMI)는 K8s SIG가 만들려 한 메시 표준 API였는데, 2023년 archived 됐다. 표준화 시도가 실패한 이유는 Istio가 사실상 표준이 되어 SMI 같은 추상 레이어가 불필요해졌기 때문이다. 클라우드 네이티브 생태계에서 "표준화"는 종종 추상 표준이 아니라 한 구현체의 사실상 점유로 일어난다. K8s 자체도 그런 패턴이고, Envoy도 같은 흐름이다.

## 정리하며

서비스 메시는 마이크로서비스 통신의 횡단 관심사(인증·재시도·관찰·암호화)를 사이드카 프록시로 옮긴 답이다. AWS는 **Cloud Map(레지스트리) / ECS Service Connect(ECS 표준 메시) / App Mesh(풀 메시)** 세 가지 옵션을 가지고, 각각 책임이 다르다. App Mesh는 EOL이 예고된 상태라 신규 도입은 Istio·Service Connect 검토가 표준이지만, SAP 시험은 출제 시점 기준 App Mesh를 여전히 정답으로 인정한다.

내일은 Week 7 전체를 종합한 시나리오 12문항을 본다. ECS·EKS·Fargate·Karpenter·IRSA·Service Connect까지 한 주 동안 쌓은 지식이 SAP 시험 시나리오에서 어떻게 분기되는지를 연습한다. 멀티 계정·하이브리드·비용 최적화 같은 SAP 특화 관점이 컨테이너 영역에 어떻게 결합하는지를 보는 시간이다.

---

## 📝 연습 문제

**문제 1.** 한 핀테크가 ECS Fargate 위 마이크로서비스 30개를 운영한다. 다음을 모두 만족해야 한다. ① 모든 통신 mTLS ② 새 버전을 5% 트래픽 카나리 ③ 서비스별 서킷 브레이커. 어떤 도구를 쓰는가?

A) ALB Weighted Target Group + ACM Public Certificate
B) AWS App Mesh + ACM Private CA
C) Cloud Map만
D) Route 53 Weighted Routing

**정답: B**
해설: 풀 메시 기능 세 가지(mTLS·가중치 카나리·서킷 브레이커)는 App Mesh의 영역이다. ACM Private CA로 단명 mTLS 인증서 발급·자동 회전, Virtual Router로 5% 가중치 카나리, Virtual Node에 서킷 브레이커 정책. A는 ACM Public은 외부 도메인용이고 ALB는 서킷 브레이커 없음. C는 디스커버리만, 메시 기능 없음. D는 DNS 레벨 가중치라 1% 단위 제어·서킷 브레이커 불가. 실무 추가: App Mesh EOL(2026.9) 이후 신규는 EKS + Istio가 표준이지만, SAP 시험은 출제 시점 정답을 묻는다.

---

**문제 2.** ECS Cluster 안에서 마이크로서비스 간 단순 디스커버리·재시도·CloudWatch 메트릭이 자동 제공되고 운영 부담이 최소인 옵션은?

A) AWS App Mesh
B) ECS Service Connect
C) Cloud Map + 수동 클라이언트 LB
D) ALB per Service

**정답: B**
해설: ECS Service Connect는 ECS Service 옵션 한 블록으로 Envoy 사이드카 자동 주입·Cloud Map 자동 등록·재시도·CloudWatch 메트릭을 기본 제공한다. A는 풀 메시로 운영 부담이 더 큼(Virtual Service·Router·Node 매니페스트 작성). C는 모든 통합을 수동. D는 서비스 30개면 ALB 30개로 비용·운영 부담 큼. 함정: "메시 = App Mesh"라는 단순 매칭. Service Connect는 가벼운 메시로 ECS 표준이다.

---

**문제 3.** 외부 사용자가 HTTPS로 진입하고 JWT 인증·rate limiting이 필요. 내부 East-West는 메시. 외부 진입에 가장 적합한 서비스는?

A) AWS App Mesh
B) API Gateway + Cognito
C) Cloud Map Public Namespace
D) NLB

**정답: B**
해설: 외부 진입 + 인증·인가 + rate limiting은 API Gateway의 영역이다. Cognito와 통합해 JWT 검증, usage plan으로 rate limit. A는 East-West 메시로 외부 진입에 부적합. C는 디스커버리이지 진입점 아님. D는 L4 진입으로 HTTP 인증·rate limit 없음. 추가 학습: API Gateway가 메시 진입점 역할도 할 수 있어서 Service Mesh의 ingress gateway 패턴을 대체 가능.

---

**문제 4.** App Mesh의 Virtual Router에서 v1=100, v2=0으로 시작해 매시간 v2 비율을 10%씩 올린다. 이 패턴의 이름은?

A) Blue/Green
B) 카나리(Canary)
C) A/B Test
D) Shadow Deployment

**정답: B**
해설: 가중치를 점진적으로 늘려가는 패턴이 카나리. Blue/Green은 0% → 100%로 한 번에 전환하는 패턴(롤백 빠름이 장점). A/B Test는 사용자 segment로 분기(성능보다 사용자 행동 측정 목적). Shadow는 트래픽 복제(v2가 응답에 영향 없이 같은 요청 처리)로 검증. 함정: Blue/Green을 카나리와 혼동. CodeDeploy의 "Linear"·"Canary" 옵션도 가중치 점진 증가로 카나리 패턴이다.

---

**문제 5.** Cloud Map Private DNS Namespace의 동작은?

A) 공개 인터넷에서 조회 가능
B) Route 53 Private Hosted Zone 자동 생성, 연결된 VPC 내부에서만 조회
C) IPv6 전용
D) AWS 전체 모든 VPC에서 자동 조회

**정답: B**
해설: Private DNS Namespace는 내부적으로 Route 53 Private Hosted Zone을 만들어 지정 VPC에 연결한다. 해당 VPC 내부에서만 조회 가능. 다른 VPC에서 조회하려면 VPC Peering·Transit Gateway + Private Hosted Zone 공유 설정이 추가로 필요. A는 Public Namespace의 동작. C는 별도 옵션. D는 자동 아님. 함정: VPC 연결을 깜빡하면 조회 실패로 디버깅이 어려움.

---

**문제 6.** 모든 마이크로서비스 통신을 mTLS로 보호하고 인증서는 24시간 단명으로 자동 회전. 가장 적합한 조합은?

A) ACM Public Certificate + ALB Listener
B) ACM Private CA + App Mesh
C) Self-signed 인증서 수동 회전
D) IAM Access Key

**정답: B**
해설: ACM Private CA에서 단명 인증서 발급·자동 회전, App Mesh가 Envoy 사이드카에 자동 주입해 mTLS 양방향 검증. A는 Public이라 외부 도메인용이고 단명 회전 패턴이 아님. C는 수동 회전이라 운영 부담 거대·인적 실수 위험. D는 IAM이고 mTLS와 무관. 추가 학습: 인증서 수명을 짧게 잡는 발상은 SPIFFE/SPIRE 프로젝트의 핵심 원리이기도 함. EKS + cert-manager + ACM Private CA 조합으로 같은 패턴 구현 가능.

---

**문제 7.** ECS Service Connect가 직접 지원하지 **않는** 기능은?

A) Cloud Map 자동 등록
B) Envoy 사이드카 자동 주입
C) 1% 단위 가중치 기반 카나리 라우팅
D) CloudWatch 메트릭 자동 emit

**정답: C**
해설: Service Connect는 가벼운 메시로 디스커버리·메트릭·재시도·타임아웃은 기본 제공하지만, 1% 단위 가중치 라우팅·카나리는 미지원. 카나리가 필요하면 CodeDeploy Blue/Green + ALB Weighted Target Group, 또는 App Mesh로 가야 한다. A, B, D는 모두 Service Connect 자동 제공. 함정: "Service Connect가 메시면 카나리도 되겠지" 추측. 가벼운 메시와 풀 메시의 차이가 정확히 이 지점이다.

---

## 📌 오늘의 요약

1. **사이드카 메시 = 횡단 관심사 분리**, 언어 무관, Envoy가 사실상 표준
2. **Cloud Map = 레지스트리**, **Service Connect = ECS 표준 메시**(Envoy 자동), **App Mesh = 풀 메시**(EOL 2026.9)
3. **East-West는 메시**, **North-South는 ALB/API Gateway**, 책임 분담 명확히
4. **mTLS = ACM Private CA + App Mesh**, 단명 인증서 자동 회전이 Zero Trust 핵심
5. **카나리 = Virtual Router 가중치** 또는 ALB Weighted Target Group, ECS Service Connect는 가중치 미지원 → CodeDeploy 결합
6. **App Mesh EOL** 이후 신규 도입은 Istio + Envoy + cert-manager가 실무 표준
7. **클라우드 메시 흐름은 Istio 단일 표준화**, GCP·Azure·AWS 모두 같은 방향
