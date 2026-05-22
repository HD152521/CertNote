# Day 35 - Week 7 복습 + 시나리오 10문항

📅 날짜: Week 7 (Day 5)
🎯 주제: 컨테이너 종합
⏱️ 학습 시간: 약 90분

---

## 📖 Week 7 핵심 정리

1. **ECS vs EKS vs Fargate**: ECS는 AWS 독자·무료, EKS는 K8s·시간당 요금, Fargate는 데이터 플레인 옵션
2. **App Runner**: 더 단순한 PaaS, 기능·VPC 제약
3. **Anywhere**: ECS Anywhere(컨트롤 플레인 AWS) vs EKS Anywhere(컨트롤 플레인 온프레)
4. **Capacity Provider**: Fargate + Fargate Spot 혼합 → 비용↓
5. **EKS Node Group**: Managed/Self-Managed/Fargate Profile
6. **IRSA & Pod Identity**: Pod별 IAM (IRSA=OIDC, Pod Identity=후속)
7. **Karpenter**: ASG 없이 직접 EC2, Bin Packing, Spot 자동
8. **EKS Addons**: VPC CNI, CoreDNS, EBS/EFS CSI, AWS Load Balancer Controller
9. **Fargate 과금**: vCPU·메모리·초 단위, Compute SP·Graviton로 절감
10. **Cloud Map = 레지스트리 / Service Connect = ECS 표준 / App Mesh = 풀 메시**

---

## 🔄 비교표

| A | B | 핵심 차이 |
|---|---|----------|
| **ECS** vs **EKS** | AWS 독자 vs K8s 표준 | 이식성 |
| **Fargate** vs **EC2 Launch Type** | 서버리스 vs 노드 관리 | 운영 부담 |
| **Cluster Autoscaler** vs **Karpenter** | ASG 의존 vs 직접 EC2 | 속도·Bin Packing |
| **IRSA** vs **Pod Identity** | OIDC per cluster vs 간소화 신뢰 | 다중 클러스터 |
| **Cloud Map** vs **Service Connect** | 단순 레지스트리 vs 메트릭·Envoy | 기능 깊이 |
| **Service Connect** vs **App Mesh** | ECS 가벼움 vs 풀 메시 | 카나리·mTLS |
| **App Runner** vs **ECS Fargate** | PaaS 자동 vs 세밀 제어 | 운영 부담 |

---

## 📝 시나리오 10문항

---

**문제 1.** 멀티 클라우드 이식성 + K8s 표준 + 컨트롤 플레인 운영 부담 최소 = ?

A) ECS Fargate
B) EKS
C) App Runner
D) Beanstalk

**정답: B**

---

**문제 2.** EKS Pod이 DynamoDB에 접근. 최소 권한 표준 방법은?

A) Node IAM Role에 권한
B) Pod Identity (또는 IRSA)
C) Access Key Secret
D) Cognito

**정답: B**

---

**문제 3.** 가변 트래픽 EKS — 빠른 스케일·Bin Packing·Spot 자동.

A) Cluster Autoscaler + ASG
B) Karpenter
C) HPA만
D) Manual Scaling

**정답: B**

---

**문제 4.** 비용 효율 + 가변 ECS Fargate. 어떻게 구성?

A) Fargate On-Demand 100%
B) Capacity Provider — Fargate + Fargate Spot 가중치
C) EC2 Reserved Instance
D) Lambda 변환

**정답: B**

---

**문제 5.** 작은 백엔드 1개 — GitHub Push → 자동 배포 → 운영 0.

A) ECS Fargate
B) App Runner
C) EKS
D) Beanstalk

**정답: B**

---

**문제 6.** 마이크로서비스 간 카나리(가중치)·mTLS·서킷 브레이커 = ?

A) ALB만
B) AWS App Mesh
C) Cloud Map
D) Route 53

**정답: B**

---

**문제 7.** ECS Service 간 단순 디스커버리 + 메트릭 + 운영 부담 최소.

A) App Mesh
B) ECS Service Connect
C) Cloud Map 수동
D) ALB Target Group

**정답: B**

---

**문제 8.** 온프레 서버를 ECS 컨트롤 플레인에 연결해 통합 관리. (컨트롤 플레인은 AWS)

A) ECS Anywhere
B) EKS Anywhere
C) Outposts
D) VMC

**정답: A**

---

**문제 9.** EKS 1.23+ EBS 영구 볼륨 동적 프로비저닝에 필요한 것?

A) 추가 작업 없음
B) EBS CSI Driver Addon
C) EFS만 가능
D) FSx for Lustre

**정답: B**

---

**문제 10.** Fargate Task에 추가 100GB 임시 스토리지. 가능한 방법?

A) EBS 직접 부착
B) Ephemeral Storage 100GB 설정
C) EFS만 가능
D) 불가

**정답: B**

---

## 📌 Week 7 한눈에

```
오케스트레이션 ──► ECS(AWS) / EKS(K8s)
데이터 플레인  ──► EC2 / Fargate / Fargate Spot
스케일러       ──► HPA / Karpenter / Cluster Autoscaler
권한           ──► IRSA / Pod Identity / Task Role
디스커버리     ──► Cloud Map / Service Connect / App Mesh
하이브리드     ──► ECS Anywhere / EKS Anywhere / Outposts
간소화 PaaS    ──► App Runner / Beanstalk
```

다음 주(Week 8): **서버리스 심화** — Lambda 고급·Step Functions·EventBridge·이벤트 기반 아키텍처.
