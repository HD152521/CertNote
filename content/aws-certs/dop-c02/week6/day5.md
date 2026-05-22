# Day 5 - Week 6 복습 + 시나리오 문제 10개

📅 날짜: Week 6 (Day 5)
🎯 주제: 컨테이너 CI/CD 통합 시나리오

---

## 📖 Week 6 핵심 요약

### 1줄 요약

1. ECR Enhanced Scanning = 의존성 + 지속 모니터링 + Security Hub
2. ECS Rolling은 imagedefinitions.json, Blue/Green은 taskdef+appspec+imageDetail
3. EKS는 CodeDeploy 미지원 — Helm/kubectl/GitOps
4. ArgoCD/Flux GitOps = 클러스터→Git pull, 보안 + 감사 + selfHeal
5. App Runner = 추상화 최상위, Lightsail은 자동 스케일링 X (함정)

### 헷갈리기 쉬운 비교표

| A | B | 시험 포인트 |
|---|---|-------------|
| Basic Scanning | Enhanced Scanning | 의존성 vs OS 전용 |
| ECS Rolling | ECS Blue/Green | imagedefinitions vs taskdef+appspec |
| ECS Push | EKS GitOps | 자격 노출 vs Pull |
| Cluster Autoscaler | Karpenter | ASG 기반 vs 임의 인스턴스 |
| App Runner | Fargate | 추상화 수준 |
| Helm | Kustomize | 템플릿 엔진 vs YAML overlay |
| IRSA | Pod Identity | OIDC 등록 vs 단순화 |

---

## 🧠 실전 시나리오 문제 10개

### 시나리오 1
EKS 클러스터에 ECR Private 이미지를 pull하려는데 ImagePullBackOff. 가장 가능성 높은 원인은?

A) EKS Node IAM Role 또는 IRSA의 ECR 권한 부족 + 이미지 ARN 오타 + ECR Cross-Account 시 Repository Policy 부재
B) Pod CPU 부족
C) Karpenter 비활성
D) Helm Chart 에러

**정답: A**
해설: Pull 실패는 보통 IAM/Repository Policy. 트러블슈팅 1순위.

---

### 시나리오 2
"GitHub manifests repo에 commit하면 자동으로 EKS에 반영되고, 클러스터 운영자가 임의로 변경한 것도 자동 복구되어야 한다." 가장 적절한 구성은?

A) CodePipeline + helm upgrade
B) ArgoCD Application(syncPolicy.automated.selfHeal: true, prune: true)
C) Lambda + EventBridge
D) CodeDeploy

**정답: B**
해설: GitOps + selfHeal이 표준.

---

### 시나리오 3
"ECR에 이미지 푸시 시 자동으로 EKS Pod 재배포" 완전 자동 GitOps 구성은?

A) ECR push → argocd-image-updater가 manifests repo에 새 tag commit → ArgoCD가 자동 sync → Pod 교체
B) Lambda로 매 분 폴링
C) Helm upgrade 매번 수동
D) CodePipeline 트리거

**정답: A**
해설: Image Updater + ArgoCD가 완전 자동 GitOps의 표준.

---

### 시나리오 4
"EC2 Cluster Autoscaler가 적절한 인스턴스 타입을 빠르게 못 띄운다." 대안은?

A) ASG에 더 많은 인스턴스 타입 추가 + Karpenter로 교체
B) Lambda로 매번 EC2 RunInstances
C) Fargate만 사용 (강제)
D) Spot Block만 사용

**정답: A**
해설: Karpenter가 임의 인스턴스 타입 + 빠른 프로비저닝.

---

### 시나리오 5
"npm 의존성 CVE 자동 모니터링 + Security Hub 통합" ECR 구성은?

A) Enhanced Scanning (Inspector) + scanFrequency: CONTINUOUS_SCAN
B) Basic Scanning
C) Lambda 폴링
D) Trusted Advisor

**정답: A**
해설: Enhanced + Continuous가 표준.

---

### 시나리오 6
"외부 Docker Hub Rate Limit으로 EKS 노드의 이미지 pull 실패." 가장 적절한 해결은?

A) ECR Pull Through Cache + 모든 base image를 ECR에서 pull
B) 빈도 감소
C) 노드 증설
D) NAT 추가

**정답: A**
해설: Pull Through Cache가 표준.

---

### 시나리오 7
"EKS Pod이 S3에 접근해야 한다. 모든 Pod에 동일한 권한을 주고 싶지 않다." 가장 적절한 구성은?

A) 노드 EC2 Role에 S3 권한 (모든 Pod 공유)
B) Pod의 ServiceAccount에 IRSA로 IAM Role 매핑 — Pod별 최소 권한
C) IAM User 액세스 키
D) Lambda 우회

**정답: B**
해설: IRSA가 EKS 권한의 표준.

---

### 시나리오 8
"단순 마이크로서비스 5개 + 운영팀 1명. 가장 운영 부담 적은 구성은?"

A) EKS + ArgoCD
B) AWS App Runner (자동 배포, 자동 스케일링)
C) ECS EC2
D) EC2 Auto Scaling

**정답: B**
해설: App Runner가 추상화 최상.

---

### 시나리오 9
ECS Service의 Spot 사용을 80%까지 늘리되, 처음 2 Task는 안정성 위해 On-Demand 보장. Capacity Provider Strategy는?

A) FARGATE_SPOT만
B) FARGATE base=2 weight=1, FARGATE_SPOT weight=4
C) FARGATE만
D) EC2

**정답: B**
해설: base=보장, weight=비율의 정확한 활용.

---

### 시나리오 10
"새 이미지 태그가 같지만 latest를 갱신했다. ECS Service에 강제 적용하려면?"

A) ECS Service 재생성
B) `aws ecs update-service --force-new-deployment`
C) Task 수동 종료
D) Lambda

**정답: B**
해설: force-new-deployment가 표준.

---

## 📌 Week 6 요약

1. ECR Enhanced Scanning + Lifecycle Policy + Pull Through Cache가 운영 3종
2. ECS Rolling vs Blue/Green 파일 형식 구분
3. EKS는 GitOps(ArgoCD/Flux) + IRSA + Karpenter가 표준 조합
4. App Runner는 추상화 최상위 — 단순 웹 API에 최적
5. Lightsail은 자동 스케일링 X — 시험 함정

---

## 🔜 다음 주 예고 (Week 7)

**서버리스 CI/CD - SAM, Serverless Framework, Lambda**

- Day 1: AWS SAM 심화
- Day 2: Serverless Framework / CDK Lambda
- Day 3: Lambda 버전/별칭 + CodeDeploy Canary
- Day 4: Step Functions 워크플로 오케스트레이션
- Day 5: 시나리오 문제 10개

---

> 💪 Week 6 완료! 컨테이너 운영의 큰 그림이 잡혔습니다.
