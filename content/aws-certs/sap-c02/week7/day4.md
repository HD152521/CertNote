# Day 34 - App Mesh, Service Connect, Cloud Map

📅 날짜: Week 7 (Day 4)
🎯 주제: 서비스 메시·서비스 디스커버리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 서비스 메시의 본질(사이드카 프록시)을 이해한다
- AWS App Mesh, ECS Service Connect, Cloud Map의 차이를 안다
- mTLS·트래픽 미러링·카나리 배포가 메시에서 어떻게 구현되는지 안다
- ALB·NLB·API Gateway와 서비스 메시의 역할 분담 정리

---

## 🧩 사전 지식 (CS 기초)

- **Service Mesh**: 서비스 간 통신 인프라(라우팅·관찰성·보안)를 애플리케이션 코드 밖에서 처리. 보통 사이드카 프록시(Envoy)가 담당.
- **East-West vs North-South 트래픽**: 내부 서비스 간(East-West) vs 외부 진입(North-South). ALB는 N-S, 메시는 E-W.
- **mTLS(Mutual TLS)**: 서버뿐 아니라 클라이언트도 인증서로 인증. Zero Trust 핵심.
- **Service Discovery**: 서비스 이름 → IP 매핑. DNS 또는 Registry 기반.

---

## 📖 이론 내용

### 1. 세 서비스 한 줄

| 서비스 | 역할 |
|--------|------|
| **AWS App Mesh** | 풀 서비스 메시 (Envoy 사이드카, mTLS, 트래픽 정책) |
| **ECS Service Connect** | ECS 전용 가벼운 서비스 디스커버리 + 부분 메시 기능 |
| **AWS Cloud Map** | 순수 서비스 레지스트리 (DNS + API) |

### 2. AWS Cloud Map

- 서비스 이름 → 리소스 매핑 레지스트리
- DNS Namespace(공개·프라이빗) + HTTP Namespace
- ECS Service가 자동 등록 가능
- 사용 예: `service-a.local` → ECS Task IP 목록 자동 갱신

### 3. ECS Service Connect (2022 GA)

- ECS의 새 표준 서비스 디스커버리 + 클라이언트 사이드 로드밸런싱
- Envoy 프록시를 사이드카로 자동 주입
- 트래픽 메트릭·재시도·타임아웃 기본 제공
- 별도 Cloud Map 설정 거의 필요 없음
- 단점: 풀 메시는 아님(트래픽 미러링·세분화 정책은 App Mesh)

### 4. AWS App Mesh

- Envoy 기반 풀 서비스 메시
- **Mesh → Virtual Service → Virtual Router → Virtual Node** 추상화
- 기능: 가중치 라우팅(카나리), 재시도·서킷 브레이커, mTLS, X-Ray 통합
- **운영 부담**: ECS Service Connect보다 큼. 2026년 EOL 예정으로 신규는 Service Connect 또는 Istio 권장 (시험 출제 시점 기준으로는 여전히 다뤄짐)

### 5. Istio·Linkerd on EKS

- App Mesh 외 오픈소스 메시 선택지
- EKS Marketplace에서 매니지드 Istio 사용 가능 (EKS Anywhere 등)

### 6. ALB·NLB·API Gateway와의 분담

| 트래픽 | 권장 |
|--------|-----|
| 외부 진입 HTTPS | ALB / API Gateway |
| 외부 진입 TCP/UDP·정적 IP | NLB |
| 내부 East-West HTTP | App Mesh / Service Connect |
| 외부+내부 인증·인가 통합 | API Gateway + Cognito |

### 7. 카나리 배포 패턴

- App Mesh Virtual Router의 가중치 라우팅: v1=90, v2=10
- 단계적으로 v2 가중치를 올려가며 모니터링
- ECS Service Connect는 직접 가중치 지원 X → CodeDeploy Blue/Green과 결합

---

## 🧠 알아두면 좋은 심화 이론

### Envoy 사이드카

- 모든 서비스 컨테이너 옆에 Envoy 프록시 컨테이너 추가
- 사이드카가 In/Out 트래픽을 가로채 정책 적용
- 사이드카는 컨테이너 CPU/메모리 일부 사용

### Zero Trust 구현

- mTLS + 짧은 인증서 회전(ACM Private CA + App Mesh)
- 모든 서비스 간 통신에 인증서 검증

### App Mesh EOL 영향

- 2026년 9월 EOL 발표 (변경 가능성 있음)
- 신규 워크로드는 Service Connect/Istio 검토 권장
- 시험 출제 관점은 여전히 유효하므로 동작 원리 학습 필요

---

## 🏗️ 다이어그램 — ECS Service Connect

```
[Client Service]
   │ HTTP service-b:80
   ▼
[Envoy 사이드카]   ← Service Connect 자동 주입
   │ → 자동 디스커버리 + 클라이언트 로드밸런싱
   ▼
[Service B (다수 Task)]
   │ Cloud Map 자동 등록·갱신
```

---

## ⭐ 핵심 포인트

1. ⭐ Cloud Map = 레지스트리 / Service Connect = ECS 표준 / App Mesh = 풀 메시
2. ⭐ Service Connect는 Envoy 자동 주입·메트릭 기본
3. ⭐ App Mesh로 카나리 가중치·mTLS·서킷 브레이커
4. ⭐ East-West는 메시·N-S는 ALB/API GW
5. ⭐ App Mesh는 EOL 예고 — 신규는 Service Connect/Istio 검토
6. ⭐ ACM Private CA로 mTLS 인증서 발급·회전

---

## 💻 실제 예시 - ECS Service Connect 활성화

```bash
aws ecs update-service \
  --cluster prod --service myapp \
  --service-connect-configuration '{
    "enabled": true,
    "namespace": "prod.local",
    "services": [
      { "portName":"http", "clientAliases":[{"port":80,"dnsName":"myapp"}] }
    ]
  }'
```

---

## 📝 연습 문제

**문제 1.** ECS 마이크로서비스 간 mTLS·카나리 배포·서킷 브레이커가 모두 필요하다.

A) ALB만
B) App Mesh
C) Cloud Map만
D) Route 53

**정답: B**
해설: 풀 메시 기능 = App Mesh (Envoy).

---

**문제 2.** 단순 서비스 디스커버리만 필요한 ECS Cluster. 운영 부담 최소.

A) App Mesh
B) ECS Service Connect
C) ALB Target Group
D) Route 53 Private Hosted Zone 수동 등록

**정답: B**
해설: Service Connect가 ECS 표준 디스커버리 + 메트릭 자동.

---

**문제 3.** 외부 진입 HTTPS + JWT 인증 + 내부 East-West는 메시. 외부 진입에 적합한 서비스는?

A) App Mesh
B) API Gateway
C) Cloud Map
D) NLB

**정답: B**
해설: 외부 진입 + 인증·인가 = API Gateway.

---

**문제 4.** App Mesh의 V-Router 가중치 100/0 → 90/10. 무슨 패턴인가?

A) Blue/Green
B) 카나리
C) A/B Test
D) Shadow

**정답: B**
해설: 가중치 점진 증가 = 카나리.

---

**문제 5.** Cloud Map Private DNS Namespace 사용 시 결과는?

A) 공개 인터넷에서 조회
B) VPC 내부에서만 조회 (Route 53 Private Hosted Zone 활용)
C) IPv6만
D) 전 세계 모든 VPC

**정답: B**
해설: Private DNS Namespace = VPC 내부.

---

**문제 6.** 마이크로서비스 통신을 모두 mTLS로. 인증서 회전 자동화. 어떤 조합?

A) ACM Public Certificate
B) ACM Private CA + App Mesh
C) Self-signed cert 수동
D) IAM Access Key

**정답: B**
해설: ACM Private CA에서 단명 인증서 발급·자동 회전, App Mesh가 사이드카에 주입.

---

## 📌 오늘의 요약

1. Cloud Map = 레지스트리, Service Connect = ECS 표준, App Mesh = 풀 메시
2. East-West는 메시, N-S는 ALB/API GW
3. mTLS = ACM Private CA + App Mesh
4. 카나리는 가중치 라우팅 점진 증가
5. App Mesh EOL 예고 — Istio·Service Connect 검토
