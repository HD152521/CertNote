# Day 13 - ELB: 계층별 로드 밸런싱의 설계 철학과 ALB·NLB·GLB의 선택 기준

로드 밸런서는 1990년대 말 웹 서비스가 단일 서버의 한계를 넘기 시작하면서 등장했다. 초기에는 F5나 Cisco의 물리 장비가 데이터센터 랙 안에서 트래픽을 나눴다. 그런데 클라우드 시대가 되면서 로드 밸런서 자체가 "관리해야 할 인프라"가 되었고, AWS ELB는 그것을 완전 관리형 서비스로 추상화했다.

그러나 ELB는 하나가 아니다. ALB(Application LB), NLB(Network LB), GLB(Gateway LB), 그리고 레거시 CLB가 있고, 각각은 서로 다른 OSI 계층에서 동작하며 근본적으로 다른 문제를 해결한다. 이 차이를 OSI 모델과 로드 밸런싱 알고리즘 이론으로 이해하면 시나리오 문제에서 자동으로 답이 보인다.

## 로드 밸런싱 이론: 어느 계층에서 결정하는가

로드 밸런서의 핵심 역할은 들어오는 요청을 여러 백엔드 서버 중 하나로 분배하는 것이다. "어느 서버로 보낼지"를 결정하는 기준이 OSI 계층에 따라 달라진다.

**L4(전송 계층) 로드 밸런싱**: TCP/UDP 패킷의 소스 IP, 목적지 IP, 포트만 본다. HTTP 헤더 안을 들여다보지 않는다. 결정이 빠르고 레이턴시가 낮다. 단, "이 요청은 `/api/users`로 가야 하고 저 요청은 `/static/`으로 가야 한다"는 구분이 불가능하다.

**L7(응용 계층) 로드 밸런싱**: HTTP 헤더, URL 경로, 쿠키, 쿼리 파라미터를 파싱해서 라우팅을 결정한다. 결정에 더 많은 CPU와 시간이 필요하지만, 컨텐츠 기반 라우팅이 가능해진다. 마이크로서비스 아키텍처에서 필수다.

**L3(네트워크 계층) 처리**: IP 패킷 전체를 다른 어플라이언스로 투명하게 전달한다. 방화벽, IDS/IPS, DPI(Deep Packet Inspection) 장비를 체인으로 연결할 때 필요하다.

> 💡 **관련 이론**: L4 로드 밸런싱의 주요 알고리즘은 Round Robin(순서 분배), Least Connections(가장 적은 연결로), IP Hash(클라이언트 IP 기반 고정 분배) 세 가지다. Nginx, HAProxy, AWS NLB 모두 이 알고리즘들의 변형을 사용한다. L7 로드 밸런싱은 URL 해시나 헤더 매칭이 추가된다. AWS ALB의 라우팅 규칙은 최대 100개의 규칙을 우선순위 순서로 평가한다.

## ALB: 왜 Application이라 부르는가

ALB는 HTTP/HTTPS 프로토콜을 "이해"한다. 단순히 패킷을 전달하는 게 아니라, HTTP 요청의 의미를 파악해서 라우팅 결정을 내린다. 이것이 "Application"이라는 이름의 의미다.

ALB가 실제로 처리하는 라우팅 규칙의 범위:

```
[ ALB 라우팅 조건 ]
1. Host header:     api.example.com vs app.example.com
2. Path:            /api/* vs /v2/* vs /static/*
3. HTTP header:     X-Custom-Header: premium
4. Query string:    ?version=2
5. HTTP method:     GET vs POST (선택적 라우팅)
6. Source IP:       특정 IP 범위만 특정 TG로
7. Weighted:        A/B 테스트 (TG-A 90%, TG-B 10%)
```

이 중 Weighted 라우팅은 카나리 배포(Canary Deployment)나 A/B 테스트에서 핵심이다. 새 버전을 10%의 트래픽에만 노출하다가 문제가 없으면 100%로 올리는 패턴이다.

**ALB의 Target Type**:
- `instance`: EC2 인스턴스 ID로 등록. 인스턴스의 보안 그룹에서 ALB SG를 허용해야 한다.
- `ip`: 특정 IP 주소. VPC 내 IP(ECS 태스크, RDS, 온프레미스 Direct Connect IP)에 라우팅.
- `lambda`: Lambda 함수를 HTTP 엔드포인트로 노출. 서버리스 API에 활용.
- `alb`: ALB를 NLB의 타겟으로 등록 가능 (중첩 구조).

> 🔍 **더 깊이**: ALB는 TLS 종료(Termination)와 재-암호화(Re-encryption)를 지원한다. 클라이언트 ↔ ALB는 HTTPS, ALB ↔ 백엔드는 HTTP(더 단순)로 구성하거나, 양쪽 모두 HTTPS로 구성할 수 있다. ALB에서 ACM(AWS Certificate Manager) 인증서를 사용하면 인증서 갱신이 자동화된다. SNI(Server Name Indication, RFC 6066)를 지원해 하나의 ALB에 여러 도메인의 인증서를 등록할 수 있다. 예전 CLB는 SNI를 지원하지 않아 도메인별 CLB가 필요했다.

```
[ ALB TLS 종료 흐름 ]

Client ─HTTPS(TLS1.3)─→ ALB ─HTTP─→ EC2 Target
               [ACM Certificate]

또는

Client ─HTTPS─→ ALB ─HTTPS(re-encrypt)─→ EC2 Target
              [ACM] [TG 설정에서 HTTPS 선택]
```

**ALB + WAF 통합**: AWS WAF를 ALB에 연결하면 L7 트래픽에서 SQL Injection, XSS, 악성 봇을 필터링할 수 있다. CLB는 WAF와 통합되지 않는다. WAF 규칙은 ALB 앞에서 동작하므로 백엔드 EC2에 도달하기 전에 차단된다.

**gRPC 지원**: ALB는 HTTP/2와 gRPC 프로토콜을 지원한다. 마이크로서비스 간 gRPC 통신을 ALB가 L7에서 라우팅할 수 있다. NLB는 gRPC를 TCP 스트림으로만 보므로 L7 라우팅이 불가능하다.

> 📚 **사례**: Netflix의 Zuul API Gateway는 초기에 자체 운영하는 Java 프로세스였다가, 점차 ALB와 결합한 아키텍처로 진화했다. ALB의 Weighted Target Group을 이용해 서비스 버전 간 A/B 트래픽 분리를 관리하고, Lambda@Edge나 ALB Lambda 타겟을 통해 서버리스 엣지 로직을 구현했다. (Netflix Tech Blog, 2019)

## NLB: 왜 L4인데 L7보다 빠른가

NLB는 TCP/UDP 패킷의 헤더만 본다. HTTP 페이로드를 파싱하지 않으므로 처리 시간이 훨씬 짧다. NLB의 대기 시간은 **수십 마이크로초(μs)** 수준이고, ALB는 수밀리초(ms) 수준이다.

그런데 왜 이 레이턴시 차이가 게임이나 금융 시스템에서 중요한가. 초단타 매매(HFT, High-Frequency Trading) 시스템은 시장 데이터를 받고 주문을 내기까지 100μs 미만을 목표로 한다. 멀티플레이어 게임에서 20ms를 넘으면 사용자가 "렉"을 느낀다. 이 환경에서 ALB의 추가 ms 단위 처리 시간도 용납되지 않는다.

**NLB의 고정 IP**: 각 AZ에 하나의 고정 IP(EIP 할당 가능)를 갖는다. 예를 들어 서울 리전에서 NLB를 3 AZ로 구성하면 3개의 고정 IP가 생긴다. 이 IP들을 파트너사나 보안 팀의 방화벽 화이트리스트에 등록할 수 있다. ALB는 DNS 이름만 있고 IP가 변할 수 있어서 이런 용도로 쓸 수 없다.

```
[ NLB 고정 IP 구조 ]

파트너 방화벽 화이트리스트: 1.2.3.4 (AZ-a), 5.6.7.8 (AZ-b)

인터넷 → 1.2.3.4 또는 5.6.7.8 → NLB → TG (TCP 8080 → EC2)
                               ↗
         Cross-Zone 트래픽 (추가 비용)
```

**NLB의 Source IP 보존**: NLB는 기본적으로 클라이언트의 실제 소스 IP를 백엔드에 그대로 전달한다(Proxy Protocol 또는 TCP 패스스루). ALB는 클라이언트 IP를 `X-Forwarded-For` 헤더에 담아 전달하지만, TCP 레벨 소스 IP는 ALB의 IP로 바뀐다. 이 차이가 보안 그룹 설정이나 로그 분석에서 중요하다.

> ⚠️ **함정**: NLB를 사용하면 보안 그룹을 NLB가 아닌 **타겟 EC2 인스턴스에 적용**해야 한다. NLB 자체에는 보안 그룹이 없다(2023년 이후 NLB에 SG 추가 가능하게 변경됨). ALB는 자체 SG가 있고, 백엔드 EC2의 SG는 ALB SG만 허용하면 된다. 이 구조가 다르므로 혼동하지 말 것.

**NLB TLS 종료**: NLB도 TLS를 종료할 수 있다. TCP 레벨에서 TLS를 해제하고, 백엔드에는 암호화되지 않은 TCP를 전달한다. 단, ALB 달리 HTTP 헤더를 보지 않으므로 경로 기반 라우팅은 불가능하다.

**NLB + Global Accelerator 조합**: 글로벌 사용자에게 낮은 레이턴시를 제공하려면 Global Accelerator(Anycast IP)와 NLB를 결합한다. Global Accelerator가 가장 가까운 AWS 엣지로 트래픽을 끌어들이고, NLB가 최종 백엔드로 분배한다. 단순히 NLB만으로는 DNS 기반 지역 라우팅이 제한적이다.

> 💡 **관련 이론**: NLB의 Connection Tracking은 5-tuple(소스 IP, 소스 포트, 목적지 IP, 목적지 포트, 프로토콜)로 동일 세션의 패킷을 추적한다. TCP 연결이 수립되면 해당 세션의 모든 패킷이 동일 타겟으로 향한다. UDP의 경우 connectionless이므로 Stickiness를 활성화하면 소스 IP + 포트 기반으로 동일 타겟에 보낸다. 이것이 NLB의 "Sticky Session"은 쿠키 기반이 아니라 IP 기반인 이유다.

## GLB: 보안 어플라이언스 체이닝이 왜 필요한가

기업 네트워크에서 방화벽, IDS/IPS, DPI 장비는 물리적으로 트래픽 경로 중간에 삽입된다(Bump-in-the-Wire). 클라우드에서 이 패턴을 재현하는 것이 GLB(Gateway Load Balancer)다.

GLB는 GENEVE(Generic Network Virtualization Encapsulation, RFC 8926) 프로토콜로 패킷을 캡슐화해서 어플라이언스로 보내고, 어플라이언스가 검사 후 반환하면 원래 경로로 전달한다. 클라이언트와 서버는 어플라이언스의 존재를 모른다(투명한 체이닝).

```
[ GLB 트래픽 흐름 ]

인터넷 트래픽
    ↓
GLB Endpoint (VPC B: 보안 VPC)
    ↓  (GENEVE 캡슐화)
Palo Alto / Checkpoint NGFW 클러스터
    ↓  (검사 통과 후)
GLB Endpoint → 원래 목적지 (VPC A: 앱 VPC)

[ GLB의 가치 ]
- 3rd-party 어플라이언스 Auto Scaling (트래픽 증가 시 자동 추가)
- HA (어플라이언스 장애 시 자동 페일오버)
- 어플라이언스 벤더 교체 가능 (구조 변경 불필요)
```

> 💡 **관련 이론**: GENEVE는 VXLAN의 진화형으로, 헤더에 TLV(Type-Length-Value) 형식의 메타데이터를 담을 수 있어 어플라이언스가 원래 패킷 컨텍스트를 유지한 채 처리할 수 있다. RFC 8926(2020년 확정)은 SDN(Software-Defined Networking) 환경에서 가상화된 네트워크 기능(VNF)을 체이닝하는 표준을 정의한다.

> 📚 **사례**: Palo Alto Networks, Fortinet, Check Point 등의 NGFW는 AWS Marketplace에서 GLB 호환 AMI를 제공한다. 금융권에서는 AWS VPC 내 트래픽도 NGFW를 통해 검사해야 한다는 규제 요건이 있어, GLB + Palo Alto 조합이 표준 패턴이 됐다. GLB 출시(2020년 11월) 이전에는 이를 구현하기 위해 매우 복잡한 라우팅 설정이 필요했다.

## Target Group, Health Check, 그리고 Slow Start

Target Group은 ELB가 트래픽을 분배하는 백엔드 서버 집합이다. 하나의 ELB에 여러 Target Group을 연결할 수 있고, 라우팅 규칙에 따라 적절한 TG로 요청이 전달된다.

**Health Check 동작 원리**:

헬스 체크는 ELB가 주기적으로 타겟의 특정 엔드포인트를 호출해 정상 여부를 판단한다. ALB의 경우 HTTP 200 응답을 정상으로 간주하고, NLB는 TCP 연결 성공(또는 HTTP 옵션 선택 가능)을 기준으로 한다.

```
HealhyThresholdCount = 3  (연속 3회 성공 → Healthy)
UnhealthyThresholdCount = 2  (연속 2회 실패 → Unhealthy)
HealthCheckIntervalSeconds = 30  (30초마다 체크)
HealthCheckTimeoutSeconds = 5  (5초 내 응답 없으면 실패)

실패한 타겟은 TG에서 트래픽 분배 제외
성공하면 다시 포함 (자동 복구)
```

**Slow Start 모드**: 새로 추가된 EC2 인스턴스는 애플리케이션이 완전히 워밍업되지 않은 상태에서 갑자기 많은 트래픽을 받으면 성능이 저하될 수 있다. Slow Start는 새 인스턴스에 보내는 트래픽을 30초~900초 동안 점진적으로 증가시킨다. JVM 기반 애플리케이션(JIT 컴파일 필요)이나 ML 모델을 로드하는 서버에 특히 유용하다.

**Deregistration Delay(Connection Draining)**: ASG가 인스턴스를 종료하기 전, 해당 인스턴스에 진행 중인 요청이 완료될 때까지 기다린다. 기본 300초(5분). 이 시간이 지나면 강제 종료한다. 값을 0으로 설정하면 즉시 종료(예: Spot 인터럽션 처리).

> 🔍 **더 깊이**: ALB의 Sticky Session은 두 종류다. `lb_cookie`는 ALB가 자체 생성하는 쿠키(`AWSALB`)로 클라이언트를 특정 타겟에 묶는다. `app_cookie`는 애플리케이션이 설정한 쿠키를 기준으로 스티키니스를 적용한다. Sticky Session은 세션 상태를 서버 메모리에 저장하는 구형 아키텍처에서 필요하지만, 현대 아키텍처는 세션을 ElastiCache나 DynamoDB에 외부화해서 Sticky Session 없이 어느 서버로 가도 동일하게 처리하는 방식을 선호한다.

## Cross-Zone Load Balancing: 왜 기본값이 다른가

| | ALB | NLB | GLB |
|--|-----|-----|-----|
| 기본값 | **활성(ON)** | **비활성(OFF)** | **비활성(OFF)** |
| 추가 비용 | 없음 | Cross-AZ 데이터 전송 비용 | Cross-AZ 데이터 전송 비용 |

Cross-Zone Load Balancing이 비활성일 때, NLB의 각 AZ 노드는 자신의 AZ에 있는 타겟에만 트래픽을 분배한다. AZ-a에 2개, AZ-b에 8개 인스턴스가 있으면, AZ-a 노드는 2개에게만 50/50으로 나누고 AZ-b 노드는 8개에게 12.5%씩 분배한다. 전체적으로 불균등한 분배가 발생한다.

Cross-Zone이 활성이면 모든 AZ의 타겟이 균등하게 트래픽을 받는다. ALB가 이를 기본 활성으로 한 이유는 ALB가 HTTP 워크로드 중심이고, AZ 간 균등 분배가 일반적으로 더 나은 성능을 제공하기 때문이다. NLB가 기본 비활성인 이유는 Cross-AZ 데이터 전송 비용이 발생하고, 금융이나 게임처럼 특정 AZ에 최적화된 아키텍처에서는 의도적으로 AZ 격리를 원하기 때문이다.

> ⚠️ **함정**: "ELB 뒤에서 한 AZ의 인스턴스만 많은 트래픽을 받는다"는 시나리오는 Cross-Zone이 비활성인 NLB/GLB에서 AZ별 타겟 수가 불균등할 때 나타난다. 해결책은 Cross-Zone 활성화 또는 AZ별 타겟 수를 균등하게 맞추는 것이다.

## 다른 클라우드와의 ELB 비교

| 기능 | AWS ALB | GCP Cloud LB | Azure Application GW |
|------|---------|--------------|----------------------|
| L7 HTTP 라우팅 | 호스트/경로/헤더/쿼리/메서드 | URL Map, 헤더 기반 | URL 경로, 멀티 사이트 |
| WAF 통합 | AWS WAF | Cloud Armor | Azure WAF |
| gRPC 지원 | O | O | O |
| WebSocket | O | O | O |
| Lambda 타겟 | O | Cloud Run 연동 | Function App 연동 |

| 기능 | AWS NLB | GCP Network LB | Azure LB (Standard) |
|------|---------|---------------|---------------------|
| L4 프로토콜 | TCP/UDP/TLS | TCP/UDP | TCP/UDP |
| 고정 IP | AZ별 EIP | 글로벌 단일 IP 가능 | Public IP |
| DSR(Direct Server Return) | 제한적 | O | O |
| Cross-Region | N (별도 GA) | 글로벌 LB 통합 | 글로벌 LB 별도 |

GCP의 Cloud Load Balancing은 글로벌 단일 Anycast IP를 기본으로 제공해 Global Accelerator 없이 글로벌 라우팅이 가능하다. AWS는 ALB/NLB가 리전 단위이고 글로벌 라우팅은 Global Accelerator나 CloudFront를 별도로 붙여야 한다.

## 아키텍처 패턴: 실제 설계에서의 ELB 조합

**패턴 1: 전형적인 3계층 웹 아키텍처**
```
인터넷 → ALB (HTTPS, WAF 연결)
           ├─ /api/* → TG-API (ECS Fargate)
           ├─ /static/* → S3 (직접 → CloudFront로 리다이렉트)
           └─ default → TG-WEB (EC2 ASG, Slow Start 90s)
```

**패턴 2: 파트너 API + 고정 IP 요구**
```
파트너 B2B → NLB (EIP 화이트리스트)
               └─ TG (TCP 8443 → EC2)
                   [Deregistration Delay 60s]
```

**패턴 3: 엔터프라이즈 보안 검사 체인**
```
인터넷 → IGW → GLB Endpoint (보안 VPC)
                    ↓ (GENEVE)
               Palo Alto NGFW ASG
                    ↓ (검사 통과)
               GLB Endpoint → TGW → 앱 VPC → ALB → EC2
```

**패턴 4: 글로벌 게임 서버**
```
글로벌 플레이어 → Global Accelerator (Anycast)
                      → us-east-1 NLB (UDP 7000)
                      → ap-northeast-2 NLB (UDP 7000)
                   각 NLB → Game Server EC2 Cluster
```

## CLI로 이해 굳히기

```bash
# ALB 생성 (인터넷 facing, HTTPS)
aws elbv2 create-load-balancer \
  --name prod-alb \
  --subnets subnet-pub-a subnet-pub-b subnet-pub-c \
  --security-groups sg-alb-id \
  --scheme internet-facing \
  --type application

# HTTPS 리스너 + ACM 인증서
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:...:loadbalancer/app/prod-alb/xxx \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=arn:aws:acm:...:certificate/... \
  --default-actions Type=forward,TargetGroupArn=arn:...tg-web

# Path 기반 라우팅 규칙
aws elbv2 create-rule \
  --listener-arn arn:...listener/... \
  --priority 10 \
  --conditions '[{"Field":"path-pattern","Values":["/api/*"]}]' \
  --actions '[{"Type":"forward","TargetGroupArn":"arn:...tg-api"}]'

# Weighted Target Group (A/B 테스트, 10% → 새 버전)
aws elbv2 create-rule \
  --listener-arn arn:... \
  --priority 5 \
  --conditions '[]' \
  --actions '[{
    "Type": "forward",
    "ForwardConfig": {
      "TargetGroups": [
        {"TargetGroupArn": "arn:...tg-v1", "Weight": 90},
        {"TargetGroupArn": "arn:...tg-v2", "Weight": 10}
      ]
    }
  }]'

# NLB 생성 (고정 EIP)
aws elbv2 create-load-balancer \
  --name partner-nlb \
  --subnets subnet-a subnet-b \
  --type network \
  --scheme internet-facing

# NLB에 EIP 할당
aws elbv2 set-subnets \
  --load-balancer-arn arn:...nlb \
  --subnets \
    SubnetId=subnet-a,AllocationId=eipalloc-111 \
    SubnetId=subnet-b,AllocationId=eipalloc-222

# ALB Cross-Zone 비활성화 확인
aws elbv2 describe-load-balancer-attributes \
  --load-balancer-arn arn:... \
  --query 'Attributes[?Key==`load_balancing.cross_zone.enabled`]'
```

## 정리하며

ELB의 세 종류는 OSI 계층에서 서로 다른 레벨의 인텔리전스를 제공한다. ALB는 HTTP의 의미를 이해하고 컨텐츠 기반 라우팅을 한다. NLB는 L4에서 수십 마이크로초의 레이턴시와 고정 IP를 제공한다. GLB는 L3에서 보안 어플라이언스를 투명하게 체이닝한다.

시험 시나리오에서 키워드를 찾는다면: HTTP 경로/호스트/헤더 라우팅이나 WAF가 나오면 ALB, 게임·IoT·금융 트레이딩·UDP·고정 IP·파트너 화이트리스트가 나오면 NLB, NGFW·IPS·DPI·3rd-party 보안 어플라이언스가 나오면 GLB다.

---

## 📝 연습 문제

**문제 1.** 마이크로서비스 아키텍처에서 `api.example.com/users`는 Users 서비스로, `api.example.com/orders`는 Orders 서비스로 라우팅해야 한다. 두 서비스 모두 같은 포트(443)를 사용한다. 가장 적합한 로드 밸런서와 설정은?

A) NLB + TCP 기반 헬스 체크
B) ALB + Path-based 라우팅 규칙
C) GLB + GENEVE 프로토콜
D) CLB + Sticky Session

**정답: B**
해설: URL 경로(`/users`, `/orders`)를 기반으로 다른 백엔드로 라우팅하는 것은 L7 HTTP 이해가 필요한 작업이다. ALB만이 경로 기반 라우팅을 지원한다. NLB는 L4이므로 URL 경로를 볼 수 없다. GLB는 보안 어플라이언스 체이닝 전용이다. CLB는 레거시이고 경로 기반 라우팅이 없다.

---

**문제 2.** 금융 서비스 회사가 외부 파트너에게 B2B API를 제공한다. 파트너 방화벽에서 AWS 로드 밸런서의 IP를 화이트리스트에 등록해야 한다. 또한 TCP 기반 커스텀 프로토콜을 사용한다. 적합한 솔루션은?

A) ALB (HTTPS) + WAF
B) NLB + Elastic IP (각 AZ당 1개)
C) CloudFront + ALB 오리진
D) Global Accelerator + ALB

**정답: B**
해설: 고정 IP 요구 사항은 NLB + EIP(Elastic IP)로 해결한다. NLB는 TCP 프로토콜을 지원한다. ALB는 IP가 동적으로 변해 화이트리스트에 등록이 불안정하다. CloudFront는 DNS 기반이고 IP가 고정되지 않는다. Global Accelerator는 2개의 Anycast IP를 제공하지만 여기서는 NLB에 직접 EIP를 붙이는 것이 더 직접적이고 단순한 해결책이다.

---

**문제 3.** 회사가 AWS에서 Palo Alto Networks NGFW를 사용해 모든 인바운드 트래픽을 검사해야 한다. 트래픽 증가 시 NGFW 클러스터를 자동으로 확장하고, 특정 NGFW 인스턴스가 장애 시 다른 인스턴스로 자동 페일오버해야 한다. 어떤 AWS 서비스를 사용해야 하는가?

A) ALB (NGFW를 Target Group에 등록)
B) NLB (NGFW를 Target Group에 등록)
C) GLB (GENEVE 프로토콜로 NGFW 체이닝)
D) Transit Gateway + 커스텀 라우팅 테이블

**정답: C**
해설: NGFW를 트래픽 경로에 투명하게 삽입하고, NGFW 클러스터를 Auto Scaling으로 관리하며, 장애 시 자동 페일오버하는 것이 GLB의 정확한 용도다. GENEVE 프로토콜로 NGFW가 패킷을 검사하고 반환하면 GLB가 원래 목적지로 전달한다. ALB와 NLB는 HTTP/TCP 레이어 로드 밸런싱이지, 3rd-party 어플라이언스 체이닝 구조를 지원하지 않는다. Transit Gateway는 VPC 간 라우팅이고 어플라이언스 체이닝 자동화가 없다.

---

**문제 4.** Auto Scaling Group에서 인스턴스가 종료될 때 진행 중인 요청이 갑자기 끊어지는 문제가 발생한다. 또한 새로 시작된 JVM 기반 애플리케이션 서버가 처음 몇 분간 성능이 낮은 문제도 있다. 각각의 해결책은?

A) 종료 문제: Termination Protection | 신규 서버 문제: 더 큰 인스턴스
B) 종료 문제: Deregistration Delay 설정 | 신규 서버 문제: ALB Slow Start 설정
C) 종료 문제: Enhanced Monitoring | 신규 서버 문제: User Data로 워밍업 스크립트
D) 종료 문제: Multi-AZ 배포 | 신규 서버 문제: Reserved Instance 사용

**정답: B**
해설: Deregistration Delay(기본 300초)는 인스턴스가 TG에서 제거될 때 진행 중 요청이 완료될 때까지 기다린다. 요청 처리 시간이 길면 300초를 늘리고, Spot 인터럽션처럼 빠른 종료가 필요하면 줄인다. ALB Slow Start는 새 타겟에 보내는 트래픽을 설정한 시간(30-900초) 동안 점진적으로 늘려서 JVM JIT 컴파일 완료를 기다린다. 두 설정 모두 Target Group 레벨에서 설정한다.

---

**문제 5.** ALB와 NLB의 Cross-Zone Load Balancing 기본값 차이에 대한 설명으로 옳은 것은?

A) ALB와 NLB 모두 기본 활성, 추가 비용 없음
B) ALB 기본 활성(추가 비용 없음) / NLB 기본 비활성(활성 시 Cross-AZ 데이터 비용)
C) ALB 기본 비활성 / NLB 기본 활성(추가 비용 없음)
D) 두 LB 모두 기본 비활성, 동일한 추가 비용

**정답: B**
해설: ALB는 HTTP 워크로드에서 균등 분배가 일반적으로 최적이므로 기본 활성이며 추가 비용이 없다. NLB와 GLB는 기본 비활성이며, 활성화 시 AZ 간 데이터 전송에 대해 $0.01/GB 수준의 비용이 발생한다. NLB에서 Cross-Zone을 비활성 상태로 유지할 경우, AZ별 타겟 수를 균등하게 유지해야 불균등 분배를 피할 수 있다.

---

**문제 6.** 멀티 테넌트 SaaS 플랫폼이 고객마다 다른 서브도메인을 제공한다 (`tenant1.saas.com`, `tenant2.saas.com`). 모든 도메인에 대해 단일 ALB를 사용하되 각 도메인에 별도 TLS 인증서를 적용하고 싶다. 어떻게 구성하는가?

A) 도메인마다 별도 ALB를 생성한다
B) 하나의 ALB에 SNI(Server Name Indication)로 여러 ACM 인증서를 등록한다
C) CloudFront를 앞에 두고 각 도메인에 별도 인증서를 적용한다
D) NLB를 사용해 TLS 패스스루로 각 EC2가 자체 인증서를 처리한다

**정답: B**
해설: ALB는 SNI(RFC 6066)를 지원해 하나의 HTTPS 리스너에 여러 ACM 인증서를 등록할 수 있다. 클라이언트가 TLS 핸드셰이크 시 SNI 헤더에 도메인 이름을 포함하면 ALB가 해당 인증서로 응답한다. ALB당 최대 25개 인증서(기본)를 등록할 수 있으며 Limit 증가 요청도 가능하다. 도메인마다 별도 ALB는 비용과 관리 오버헤드가 크다. C도 유효한 패턴이지만 질문은 단일 ALB 사용을 전제로 한다.

---

**문제 7.** UDP 기반 실시간 게임 서버(포트 7000)를 AWS에서 운영한다. 전 세계 플레이어에게 일관된 낮은 레이턴시를 제공하고, 게임 서버가 Scale-in될 때 진행 중인 게임 세션이 끊어지지 않아야 한다. 가장 적합한 아키텍처는?

A) ALB(HTTP/HTTPS) + ASG + WAF
B) Global Accelerator + NLB(UDP) + ASG + Deregistration Delay 300s
C) CloudFront + ALB + ElastiCache 세션 공유
D) Route 53 Geolocation + NLB + ASG

**정답: B**
해설: UDP 프로토콜은 NLB만 지원한다. 전 세계 플레이어에게 일관된 낮은 레이턴시는 Global Accelerator(BGP Anycast)로 가장 가까운 엣지에서 AWS 백본망을 통해 처리한다. Deregistration Delay를 적절히 설정해 Scale-in 시 진행 중 게임 세션이 완료될 때까지 기다린다. Route 53 Geolocation은 DNS TTL 때문에 페일오버나 트래픽 이동이 분 단위로 늦어진다.