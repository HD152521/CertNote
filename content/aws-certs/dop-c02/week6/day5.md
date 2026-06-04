# Day 5 - Week 6 복습 + 시나리오 문제 12개

📅 날짜: Week 6 (Day 5)  
주제: 컨테이너 CI/CD 통합 시나리오 복습

---

## Week 6 핵심 개념 지도

Week 6는 컨테이너 이미지 관리(ECR)부터 오케스트레이터 배포(ECS/EKS), 그리고 완전 추상화 플랫폼(App Runner)까지 컨테이너 CI/CD의 전 스택을 다룬다. 핵심 흐름은 "빌드 → 저장 → 배포 → 스케일 → 관찰"이며, 각 레이어에서 AWS가 제공하는 서비스 선택 기준이 시험의 핵심이다.

```
코드 변경
  ↓
CodeBuild (빌드 + 이미지 생성)
  ↓
ECR (저장 + 스캔 + 라이프사이클)
  ↓
┌──────────────────────────────────────┐
│  배포 대상 선택                      │
│  ECS Rolling     → imagedefinitions  │
│  ECS Blue/Green  → taskdef+appspec   │
│  EKS GitOps      → manifests repo    │
│  App Runner      → 소스/이미지 직접  │
└──────────────────────────────────────┘
  ↓
Auto Scaling (Capacity Provider / HPA / Karpenter)
  ↓
관찰 (Container Insights / Prometheus / Security Hub)
```

> 💡 **관련 이론: 추상화 스펙트럼 (Abstraction Spectrum)**
>
> 컨테이너 플랫폼은 추상화 수준에 따라 다음과 같이 배열된다.
>
> ```
> 낮은 추상화 (높은 제어)        높은 추상화 (낮은 운영 부담)
> EC2 → ECS EC2 → ECS Fargate → App Runner → Lightsail Containers
> ```
>
> 시험에서 "운영 팀이 적다", "인프라 지식이 없다", "빠른 출시" 키워드가 나오면 스펙트럼의 오른쪽을 선택한다. 반대로 "세밀한 네트워크 제어", "커스텀 런타임", "GPU 워크로드"는 왼쪽으로 간다.
>
> **함정**: Lightsail Containers는 스펙트럼 맨 오른쪽처럼 보이지만 **Auto Scaling이 없다**. 트래픽이 변동하는 서비스에는 App Runner를 선택해야 한다.

---

## Week 6 핵심 비교 요약표

### 1. ECR 스캔 방식 비교

| 항목 | Basic Scanning | Enhanced Scanning |
|------|---------------|-------------------|
| 엔진 | AWS 자체 | Amazon Inspector |
| 대상 | OS 패키지 | OS + 언어 의존성 (npm/pip/gem) |
| 트리거 | Push 시 1회 | Push + CONTINUOUS_SCAN (지속) |
| Security Hub | 미통합 | 통합 (Finding 자동 생성) |
| SBOM | 미지원 | 지원 |
| 비용 | 무료 | Inspector 요금 |
| 시험 키워드 | "간단한 취약점 점검" | "의존성 CVE", "지속 모니터링", "Security Hub" |

### 2. ECS 배포 방식별 필수 파일

| 배포 방식 | CodePipeline 산출물 | 핵심 파일 | 선택 기준 |
|-----------|-------------------|-----------|-----------|
| Rolling (CodePipeline ECS) | imagedefinitions.json | `[{"name":"app","imageUri":"..."}]` | 단순, downtime 허용 |
| Blue/Green (CodeDeploy) | taskdef.json + appspec.yaml + imageDetail.json | `<IMAGE1_NAME>` placeholder | Zero-downtime, 트래픽 이전 제어 |

> 💡 **관련 이론: Rolling vs Blue/Green 내부 메커니즘**
>
> Rolling 배포는 CodePipeline이 ECS Service의 `desired count`를 조작하는 방식으로, 단일 오케스트레이터(ECS)가 직접 Task를 교체한다. 반면 Blue/Green은 CodeDeploy가 ALB Target Group 전환을 제어하는 별도 오케스트레이터 레이어가 존재한다.
>
> ```
> Rolling:   CodePipeline → ECS Service API (직접)
> Blue/Green: CodePipeline → CodeDeploy → ALB (Target Group 전환) → ECS
> ```
>
> Blue/Green에서 `appspec.yaml`의 `TaskDefinition: <TASK_DEFINITION>`은 CodeDeploy가 새 Task Definition ARN을 주입하는 자리표시자이고, `imageDetail.json`의 이미지 URI는 CodeBuild가 `<IMAGE1_NAME>` placeholder에 실제 이미지 URI를 치환하는 데 사용된다. 이 두 단계 치환 메커니즘을 이해하지 못하면 파일 내용 문제에서 실수한다.

### 3. ECS Auto Scaling 메커니즘

| 방식 | API | 지표 | 사용 시나리오 |
|------|-----|------|--------------|
| Target Tracking | Application Auto Scaling | CPU/메모리/ALBRequestCountPerTarget | 일반적인 웹 API |
| Step Scaling | Application Auto Scaling | CloudWatch Alarm | 비선형 트래픽 패턴 |
| Scheduled Action | Application Auto Scaling | 시간 기반 | 예측 가능한 피크 (Black Friday) |
| Capacity Provider | ECS 전용 | FARGATE/FARGATE_SPOT | 비용 최적화 (Spot 혼합) |

### 4. EKS vs ECS 배포 비교

| 항목 | ECS | EKS |
|------|-----|-----|
| CodeDeploy 지원 | 지원 (Blue/Green) | 미지원 |
| 선호 배포 방식 | CodePipeline + CodeDeploy | GitOps (ArgoCD/Flux) |
| 권한 관리 | Task Role (IAM) | IRSA / Pod Identity |
| 오토스케일링 노드 | ECS Capacity Provider | Cluster Autoscaler / Karpenter |
| 설정 파일 형식 | imagedefinitions / taskdef | Kubernetes Manifest YAML |

### 5. App Runner 핵심 구분

| 역할 | IAM Role | 용도 |
|------|----------|------|
| ECR 이미지 pull | Access Role | ECR 인증, AWS가 assume |
| 앱 코드에서 AWS API 호출 | Instance Role | S3/DynamoDB 등 앱 런타임 |

> 💡 **관련 이론: App Runner 두 IAM Role의 분리 원칙**
>
> Access Role은 App Runner 서비스 자체(AWS의 컨트롤 플레인)가 ECR에서 이미지를 내려받을 때 사용한다. 이는 ECS의 Task Execution Role과 동일한 개념이다. Instance Role은 컨테이너 내부에서 실행되는 애플리케이션 코드가 AWS SDK를 호출할 때 사용하며, ECS의 Task Role에 해당한다.
>
> 이 분리는 최소 권한 원칙(Principle of Least Privilege)의 실천이다. ECR pull 권한이 앱 코드 실행 권한과 분리되므로, 앱 코드가 취약점에 노출되어도 ECR 접근 권한은 영향받지 않는다.

### 6. GitOps 도구 비교

| 항목 | ArgoCD | Flux |
|------|--------|------|
| 동작 방식 | Git → Cluster (Pull) | Git → Cluster (Pull) |
| selfHeal | syncPolicy.automated.selfHeal | 기본 활성화 |
| UI | 웹 대시보드 제공 | CLI 중심 |
| Image 자동 업데이트 | argocd-image-updater | Flux Image Automation |
| 시험 선호 | 시나리오 문제 빈출 | 비교 문제 빈출 |

> 🔍 **더 깊이: GitOps Pull 모델의 보안 이점**
>
> 전통적인 Push 배포(CI/CD → kubectl apply)에서 파이프라인은 클러스터 API Server에 대한 접근 자격(kubeconfig)을 직접 보유해야 한다. 이는 자격 노출 위험이 있고, 파이프라인 인프라가 침해되면 클러스터 전체가 위험해진다.
>
> GitOps Pull 모델에서는 ArgoCD/Flux가 클러스터 내부에서 실행되며, Git 저장소를 주기적으로 폴링한다. 파이프라인은 Git에만 커밋할 권한이 필요하며, 클러스터 자격이 외부에 노출되지 않는다. 또한 Git 커밋 히스토리가 곧 배포 감사 로그(Audit Trail)가 된다.
>
> ```
> Push 모델: CI/CD → [kubeconfig 필요] → Kubernetes API
> Pull 모델: CI/CD → Git Repo ← ArgoCD (클러스터 내부)
> ```
>
> IRSA(IAM Roles for Service Accounts)는 이 모델에서 ArgoCD나 Flux가 ECR에 접근하거나 AWS 리소스를 조작할 때 사용하는 Pod 레벨 IAM 권한이다. OIDC 공급자를 EKS 클러스터와 IAM 사이에 연결하여 Service Account → IAM Role 매핑을 구현한다.

---

## 핵심 트리거 패턴 정리

> ⚠️ **함정: ECR Image Tag Mutability**
>
> ECR에서 `imageTagMutability: IMMUTABLE`을 설정하면 동일한 태그로 이미지를 재푸시할 수 없다. 이는 의도된 보안 정책이지만, CI/CD 파이프라인에서 `latest` 태그나 브랜치명을 태그로 사용하는 경우 푸시가 실패한다.
>
> 올바른 패턴: **IMMUTABLE + 고유 태그 사용** (commit SHA, build number, timestamp)
>
> ```
> # 잘못된 패턴 (IMMUTABLE 환경에서 실패)
> docker tag myapp:latest 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:latest
>
> # 올바른 패턴
> docker tag myapp:latest 123456789.dkr.ecr.ap-northeast-2.amazonaws.com/myapp:${CODEBUILD_RESOLVED_SOURCE_VERSION}
> ```
>
> 시험 함정: "이미지를 재배포했는데 ECS가 최신 이미지를 가져오지 않는다" → `force-new-deployment`가 필요할 수 있지만, 근본 원인은 태그가 변경되지 않았기 때문이다. IMMUTABLE + 고유 태그가 근본 해결책이다.

> 💡 **관련 이론: ECR Lifecycle Policy와 저장 비용 최적화**
>
> ECR은 GiB당 월 $0.10를 청구한다. CI/CD 파이프라인이 활발한 팀은 매일 수십 개의 이미지를 푸시하므로, Lifecycle Policy 없이는 저장 비용이 선형으로 증가한다.
>
> Lifecycle Policy의 우선순위(priority) 규칙:
> - 낮은 숫자가 먼저 평가됨 (priority 1 → 2 → ...)
> - `tagStatus: tagged` + `tagPrefixList`로 특정 태그 패턴만 보존 가능
> - `countType: sinceImagePushed`로 일수 기반 삭제
> - `countType: imageCountMoreThan`으로 개수 기반 유지
>
> ```json
> {
>   "rules": [
>     {
>       "rulePriority": 1,
>       "description": "production 태그 영구 보존",
>       "selection": {"tagStatus": "tagged", "tagPrefixList": ["prod-"]},
>       "action": {"type": "expire"}
>     },
>     {
>       "rulePriority": 2,
>       "description": "untagged 이미지 1일 후 삭제",
>       "selection": {"tagStatus": "untagged", "countType": "sinceImagePushed", "countNumber": 1},
>       "action": {"type": "expire"}
>     }
>   ]
> }
> ```

> 🔍 **더 깊이: Karpenter vs Cluster Autoscaler 선택 기준**
>
> Cluster Autoscaler는 ASG(Auto Scaling Group)를 단위로 노드를 추가/제거한다. ASG는 사전에 정의된 인스턴스 타입과 가용 영역 조합으로 구성되므로, Pod의 요청이 ASG의 인스턴스 타입과 맞지 않으면 스케일아웃이 실패하거나 비효율적이다.
>
> Karpenter는 pending Pod의 resource request를 분석하여 **그 요청에 최적인 인스턴스 타입을 실시간으로 선택**한다. ASG 없이 EC2 RunInstances를 직접 호출하며, 평균 스케일 속도는 Cluster Autoscaler의 2-4분 대비 약 30-60초다.
>
> ```
> Cluster Autoscaler:
>   Pod pending → ASG 조회 → Launch Template 기반 인스턴스 타입 (고정)
>
> Karpenter:
>   Pod pending → Pod resource/selector 분석 → 최적 인스턴스 타입 계산 → EC2 직접 프로비저닝
> ```
>
> **시험 선택 기준**: "다양한 인스턴스 타입", "빠른 스케일", "Spot 최적화" → Karpenter. "기존 ASG 재사용", "단순한 구성" → Cluster Autoscaler.

> 📚 **사례: Netflix의 배포 전략 분리**
>
> Netflix는 마이크로서비스의 중요도에 따라 배포 전략을 달리한다. 결제, 사용자 인증 등 Critical Path 서비스는 Blue/Green 배포를 사용하여 롤백 시간을 수 초 이내로 보장한다. 반면 추천 엔진, A/B 테스트 서비스 등 백그라운드 서비스는 Rolling 배포로 비용을 절약한다.
>
> 이 전략은 "모든 서비스에 동일한 배포 정책을 적용하는 것은 과도한 비용이나 과소한 안전 중 하나를 선택하는 것"이라는 트레이드오프 분석에서 나온 것이다. 시험에서 "롤백 속도가 중요하다"는 키워드가 보이면 Blue/Green, "비용 절감"이 우선이면 Rolling을 선택한다.

> 📚 **사례: Notion의 App Runner 마이그레이션**
>
> Notion은 ECS Fargate에서 App Runner로 일부 내부 마이크로서비스를 이전했다. 이전 동기는 "새 서비스 배포 시 Task Definition, Service, Load Balancer, Target Group, 보안 그룹 등 수십 개의 리소스를 수동으로 구성해야 했던 운영 부담"이었다.
>
> App Runner 이전 후 새 서비스 추가 시간이 1-2일에서 1-2시간으로 단축되었다. 다만 VPC Connector를 통한 아웃바운드 연결과 Private Ingress를 통한 인바운드 연결 설정이 별도로 필요했으며, 이 설정을 혼동하지 않는 것이 운영 핵심이었다.

> ⚠️ **함정: VPC Connector vs Private Ingress 혼동**
>
> App Runner의 VPC 연결에는 두 가지 독립적인 설정이 있으며, 이를 혼동하면 시험에서 틀린다.
>
> ```
> VPC Connector (아웃바운드):
>   App Runner → VPC 리소스 (RDS, ElastiCache, 내부 ALB 등)
>   설정: VpcConnectorConfiguration
>   용도: 앱이 VPC 내부 DB에 접근
>
> Private Ingress (인바운드):
>   VPC 내부 → App Runner 서비스
>   설정: IngressConfiguration.IsPubliclyAccessible = false
>   용도: VPC 내부에서만 접근 가능한 비공개 API
> ```
>
> 시험 함정 패턴: "VPC 내부 클라이언트만 접근 가능하게 하려면?" → Private Ingress 설정 (VPC Connector가 아님). "App Runner가 VPC 내 RDS에 접근하려면?" → VPC Connector (Private Ingress가 아님).

> 🎯 **시나리오: 스타트업 초기 인프라 선택**
>
> 상황: 개발자 3명의 스타트업, 백엔드 API 5개, 운영 전담 인원 없음, 6개월 내 출시 목표.
>
> 최적 구성:
> - App Runner (배포 대상) — ECS/EKS 운영 지식 불필요
> - ECR (이미지 저장) — App Runner와 네이티브 통합
> - Access Role (ECR pull) + Instance Role (DynamoDB 접근) 분리
> - VPC Connector로 RDS 접근, RDS Proxy로 연결 풀링
> - Enhanced Scanning으로 의존성 CVE 자동 감지
>
> 선택하지 말아야 할 것:
> - EKS: 쿠버네티스 운영 전문가 필요
> - Lightsail Containers: Auto Scaling 없음 — 트래픽 급증 시 장애
> - EC2: AMI 관리, 패치, 스케일링 모두 수동

> 🎯 **시나리오: 대규모 EKS 멀티팀 환경 GitOps**
>
> 상황: 팀 20개, EKS 클러스터 3개(dev/staging/prod), 각 팀이 독립적으로 배포하되 prod 배포는 승인 필요.
>
> 최적 구성:
> - ArgoCD ApplicationSet으로 팀별 Application 자동 생성
> - dev/staging: syncPolicy.automated.selfHeal: true (자동 동기화)
> - prod: manual sync + Slack 알림 (수동 승인 후 ArgoCD UI에서 Sync)
> - IRSA로 각 팀 ServiceAccount별 최소 권한 IAM Role 매핑
> - ECR Repository Policy로 각 팀 계정의 cross-account pull 허용
> - argocd-image-updater로 dev 환경 이미지 태그 자동 갱신
>
> 이 구성에서 prod 환경은 Git이 유일한 변경 소스(Single Source of Truth)이고, ArgoCD가 selfHeal로 drift를 자동 수정하며, 모든 변경이 Git 커밋으로 감사 가능하다.

---

## Week 6 핵심 키워드 → 정답 매핑

> 💡 **관련 이론: DOP-C02 시험 키워드 인식 패턴**
>
> DOP-C02 시험은 키워드 패턴 인식이 핵심이다. 지문에서 특정 단어가 보이면 정답 서비스/설정을 즉시 매핑할 수 있어야 한다.
>
> | 지문 키워드 | 정답 서비스/설정 |
> |------------|----------------|
> | "npm/pip 의존성 CVE" | ECR Enhanced Scanning |
> | "지속 모니터링", "Security Hub" | Enhanced Scanning + CONTINUOUS_SCAN |
> | "Docker Hub Rate Limit" | ECR Pull Through Cache |
> | "동일 태그 재푸시 방지" | imageTagMutability: IMMUTABLE |
> | "ECS zero-downtime" | Blue/Green (CodeDeploy) |
> | "imagedefinitions.json" | ECS Rolling 배포 |
> | "appspec.yaml", "taskdef.json" | ECS Blue/Green 배포 |
> | "self-healing", "Git 소스 진실" | ArgoCD/Flux GitOps |
> | "클러스터 운영자 임의 변경 자동 복구" | selfHeal: true |
> | "ECR 이미지 → EKS 자동 배포" | argocd-image-updater |
> | "Pod별 최소 권한" | IRSA |
> | "Spot 80% + On-Demand 보장" | Capacity Provider Strategy (base/weight) |
> | "운영팀 1명, 빠른 출시" | App Runner |
> | "Lightsail 자동 스케일링" | 불가 — 시험 함정 |
> | "VPC → App Runner 접근" | Private Ingress (VPC Connector 아님) |
> | "App Runner → VPC DB" | VPC Connector |
> | "ECR pull + 앱 코드 권한 분리" | Access Role + Instance Role |

---

## Week 6 핵심 체크리스트

**ECR**
- [ ] Basic vs Enhanced Scanning 차이 (OS전용 vs 의존성+지속)
- [ ] SBOM, Security Hub 통합은 Enhanced만
- [ ] Lifecycle Policy 우선순위 평가 순서 (낮은 숫자 우선)
- [ ] imageTagMutability: IMMUTABLE → 동일 태그 재푸시 불가
- [ ] Pull Through Cache → Docker Hub Rate Limit 해결
- [ ] Cross-Region Replication: 리전별 ECR 독립 (자동 복제 설정 필요)

**ECS 배포**
- [ ] Rolling: `imagedefinitions.json` → `[{"name":"컨테이너명","imageUri":"이미지URI"}]`
- [ ] Blue/Green: `taskdef.json` + `appspec.yaml` + `imageDetail.json`
- [ ] imageDetail.json의 이미지 URI → taskdef.json의 `<IMAGE1_NAME>` 치환
- [ ] `force-new-deployment` → 동일 태그 이미지 강제 재배포
- [ ] ECS Exec: Task Definition enableExecuteCommand + Task Role + Service update (3요소)

**ECS Auto Scaling**
- [ ] Application Auto Scaling API (Target Tracking / Step / Scheduled)
- [ ] ALBRequestCountPerTarget → CPU보다 선행 지표 (웹 API 권장)
- [ ] Capacity Provider: base = 최소 보장 수, weight = 비율
- [ ] FARGATE_SPOT: 2분 경고 후 회수 → Spot 허용 워크로드에만

**EKS GitOps**
- [ ] EKS는 CodeDeploy 미지원 → GitOps 또는 helm upgrade
- [ ] ArgoCD: syncPolicy.automated.selfHeal: true, prune: true
- [ ] argocd-image-updater: ECR push → manifests repo 자동 commit → ArgoCD sync
- [ ] IRSA: EKS OIDC + IAM Role → Service Account 매핑 (Pod별 권한)
- [ ] Karpenter: ASG 없이 최적 인스턴스 타입 직접 프로비저닝

**App Runner**
- [ ] Access Role: ECR pull (Task Execution Role 상당)
- [ ] Instance Role: 앱 코드 AWS API (Task Role 상당)
- [ ] MaxConcurrency: 동시 요청 수 기반 스케일 (CPU 기반 아님)
- [ ] VPC Connector: 아웃바운드 (App Runner → VPC)
- [ ] Private Ingress: 인바운드 (VPC → App Runner)
- [ ] Lightsail Containers: Auto Scaling 없음

---

## 실전 시나리오 문제 12개

### 문제 1

EKS 클러스터에서 ECR Private 이미지를 pull하려는데 Pod가 `ImagePullBackOff` 상태다. 원인과 해결 방법으로 가장 적절한 것은?

A) EKS Node IAM Role에 `ecr:GetAuthorizationToken`, `ecr:BatchGetImage` 권한 추가 또는 IRSA로 ServiceAccount에 ECR 권한 부여. Cross-Account ECR인 경우 ECR Repository Policy에 소스 계정 허용 추가

B) Pod CPU/메모리 Limit 증가

C) Karpenter NodePool에 GPU 인스턴스 추가

D) Helm Chart의 values.yaml 수정

**정답: A**

해설: `ImagePullBackOff`는 이미지 pull 권한 부족이 1순위 원인이다. EKS에서 ECR 접근은 Node IAM Role(모든 Pod 공유) 또는 IRSA(Pod별 개별 권한) 방식을 사용한다. Cross-Account ECR의 경우 추가로 ECR Repository Policy에서 소스 계정을 명시적으로 허용해야 한다. 이미지 이름 오타나 태그 미존재도 같은 증상이 나타나므로 URI 확인도 병행한다.

---

### 문제 2

GitHub manifests 저장소에 commit이 발생하면 EKS에 자동으로 반영되고, 클러스터 운영자가 임의로 변경한 리소스도 자동 복구되어야 한다. 가장 적절한 구성은?

A) CodePipeline → `helm upgrade` 자동 실행

B) ArgoCD Application에 `syncPolicy.automated: {selfHeal: true, prune: true}` 설정

C) EventBridge + Lambda → `kubectl apply`

D) CodeDeploy EC2 배포 그룹

**정답: B**

해설: Git을 Single Source of Truth로 유지하고, 클러스터 상태가 Git과 drift될 때 자동 복구하려면 GitOps Pull 모델이 필요하다. ArgoCD의 `selfHeal: true`는 클러스터 상태가 Git과 달라질 때 자동으로 재동기화하고, `prune: true`는 Git에서 삭제된 리소스를 클러스터에서도 삭제한다. CodePipeline/Lambda 방식은 Push 모델로, 지속적인 drift 감지 및 자동 복구 기능이 없다.

---

### 문제 3

ECR에 이미지가 푸시되면 자동으로 EKS Pod가 새 이미지로 교체되어야 한다. 완전 자동화된 GitOps 파이프라인 구성은?

A) ECR push → `argocd-image-updater`가 manifests 저장소에 새 이미지 태그 commit → ArgoCD가 자동 sync → Pod 교체

B) Lambda가 1분마다 ECR API 폴링 → 새 이미지 감지 시 `kubectl set image` 실행

C) CodeBuild에서 `helm upgrade` 직접 실행

D) ECR Event → SNS → CodeDeploy 트리거

**정답: A**

해설: `argocd-image-updater`는 ECR 저장소를 모니터링하다가 새 이미지 태그를 감지하면 Kubernetes manifests 저장소에 이미지 태그를 업데이트하는 커밋을 자동으로 생성한다. 이후 ArgoCD가 커밋을 감지하고 자동 sync하여 Pod를 교체한다. 이 방식은 Git이 유일한 진실의 원천으로 유지되며, 배포 히스토리가 Git 커밋으로 감사 가능하다.

---

### 문제 4

ECS Cluster Autoscaler가 특정 인스턴스 타입만 사용하여 Pod 스케줄링 실패가 잦다. 가장 적절한 해결 방법은?

A) ASG에 추가 인스턴스 타입을 포함한 Mixed Instances Policy 구성 또는 Karpenter로 교체하여 Pod 요청에 최적인 인스턴스 타입을 동적 선택

B) Fargate만 사용하도록 강제 마이그레이션

C) Lambda로 EC2 `RunInstances` API 직접 호출

D) Spot Instance Block 사용

**정답: A**

해설: ECS에서 EC2 기반 Cluster Auto Scaling의 인스턴스 타입 제한은 ASG Mixed Instances Policy로 다양한 타입을 허용하거나, EKS라면 Karpenter로 교체하는 것이 최선이다. Karpenter는 pending Pod의 resource request를 분석하여 최적 인스턴스 타입을 ASG 없이 직접 프로비저닝한다. 스케일 속도도 Cluster Autoscaler 대비 약 2-4배 빠르다.

---

### 문제 5

npm 의존성의 CVE를 지속적으로 모니터링하고 발견 시 AWS Security Hub에 Finding을 자동 생성해야 한다. ECR 구성으로 가장 적절한 것은?

A) Enhanced Scanning 활성화, `scanFrequency: CONTINUOUS_SCAN`, Inspector와 Security Hub 통합

B) Basic Scanning 활성화, 매주 수동 검토

C) Lambda로 `describe-image-scan-findings` 폴링 후 Security Hub에 수동 전송

D) Amazon GuardDuty 단독 사용

**정답: A**

해설: ECR Enhanced Scanning은 Amazon Inspector를 엔진으로 사용하여 OS 패키지뿐 아니라 npm, pip, gem 등 언어 의존성 CVE를 감지한다. `CONTINUOUS_SCAN`은 이미지 push 시뿐만 아니라 새로운 CVE가 발견될 때마다 기존 이미지를 재스캔하여 지속적으로 모니터링한다. Inspector는 Security Hub와 기본 통합되어 Finding을 자동 전송한다. Basic Scanning은 OS 패키지만 감지하고 Security Hub와 통합되지 않는다.

---

### 문제 6

Docker Hub Rate Limit으로 EKS 노드에서 public 이미지 pull이 실패한다. 가장 적절한 해결책은?

A) ECR Pull Through Cache 구성 — Docker Hub, Quay, Kubernetes Container Registry를 ECR로 프록시하여 내부 pull

B) 이미지 pull 빈도를 줄이는 `imagePullPolicy: Never` 설정

C) 추가 NAT Gateway로 IP 다양화

D) 노드 수를 늘려 pull 요청 분산

**정답: A**

해설: ECR Pull Through Cache는 Docker Hub, Quay, Kubernetes Container Registry, ECR Public 등 외부 레지스트리를 ECR 앞에 캐시하는 기능이다. 첫 pull 시에만 외부 레지스트리에서 가져오고 이후에는 ECR에서 캐시된 이미지를 반환한다. Rate Limit 문제뿐 아니라 네트워크 지연 감소와 IAM 기반 접근 제어 통일이라는 부가 이점도 있다.

---

### 문제 7

EKS Pod이 특정 S3 버킷에만 접근해야 하며, 다른 Pod은 같은 버킷에 접근하면 안 된다. 가장 적절한 구성은?

A) 모든 EKS 노드의 EC2 IAM Role에 S3 전체 접근 권한 부여

B) 특정 ServiceAccount에 IRSA로 해당 S3 버킷만 허용하는 IAM Role 매핑

C) Pod 환경 변수에 IAM User Access Key 주입

D) Lambda를 통한 S3 접근 우회

**정답: B**

해설: IRSA(IAM Roles for Service Accounts)는 Kubernetes ServiceAccount를 IAM Role과 매핑하여 Pod 레벨의 최소 권한을 구현한다. EKS OIDC 공급자를 IAM에 등록하고, IAM Role의 신뢰 정책에 ServiceAccount를 조건으로 설정하면 해당 ServiceAccount를 사용하는 Pod만 그 IAM Role을 assume할 수 있다. 노드 EC2 Role에 권한을 부여하면 같은 노드의 모든 Pod이 권한을 공유하므로 최소 권한 원칙에 위배된다.

---

### 문제 8

단순 REST API 5개를 운영하는 팀의 인원은 개발자 3명이며, 인프라 전문가가 없다. 가장 운영 부담이 낮은 배포 구성은?

A) EKS + Helm + ArgoCD (완전 GitOps)

B) App Runner (소스 저장소 또는 ECR 이미지 기반 자동 배포, 자동 스케일링)

C) ECS EC2 기반 클러스터

D) EC2 Auto Scaling Group + Nginx

**정답: B**

해설: App Runner는 로드 밸런서, Task Definition, 서비스 디스커버리, Auto Scaling 설정 등을 추상화하여 이미지 URI만 지정하면 자동으로 배포하고 트래픽에 따라 자동 스케일링한다. Fargate보다 운영 복잡도가 낮고, EKS는 쿠버네티스 운영 전문 지식이 필요하다. 단, Lightsail Containers는 Auto Scaling이 없으므로 트래픽 변동이 있는 API에는 적합하지 않다.

---

### 문제 9

ECS Service에서 Spot 인스턴스를 최대한 활용하되, 서비스 안정성을 위해 최소 2개의 Task는 항상 On-Demand로 보장해야 한다. Capacity Provider Strategy 구성은?

A) `FARGATE_SPOT`만 사용

B) `[{capacityProvider: "FARGATE", base: 2, weight: 1}, {capacityProvider: "FARGATE_SPOT", base: 0, weight: 4}]`

C) `FARGATE`만 사용 (Spot 미사용)

D) EC2 Capacity Provider만 사용

**정답: B**

해설: Capacity Provider Strategy에서 `base`는 해당 provider로 실행할 최소 Task 수를 의미하고, `weight`는 비율을 결정한다. `FARGATE base: 2`는 반드시 2개의 Task를 On-Demand로 실행하겠다는 의미다. 나머지 Task는 `weight` 비율(FARGATE 1 : FARGATE_SPOT 4)로 배분된다. 예를 들어 전체 10 Task라면 FARGATE 2개(base) + FARGATE 약 2개(weight) + FARGATE_SPOT 약 6개(weight)가 된다.

---

### 문제 10

ECS Service에서 `latest` 태그 이미지를 교체했는데 ECS가 새 이미지를 가져오지 않는다. 가장 적절한 해결 방법은?

A) ECS Service를 삭제하고 재생성

B) `aws ecs update-service --cluster my-cluster --service my-service --force-new-deployment`

C) ECS Task를 수동으로 종료하여 재시작 유도

D) ECR에서 이미지를 삭제하고 재푸시

**정답: B**

해설: ECS는 이미지 태그가 변경되지 않으면 새로운 이미지가 존재하더라도 Task를 교체하지 않는다. `--force-new-deployment`는 이미지 변경 없이도 새 Task를 시작하여 ECS가 ECR에서 최신 이미지를 pull하도록 강제한다. 근본 해결책은 CI/CD 파이프라인에서 commit SHA 등 고유한 태그를 사용하여 `latest` 의존성을 없애는 것이다. ECR `imageTagMutability: IMMUTABLE` 설정도 함께 권장된다.

---

### 문제 11

App Runner 서비스가 VPC 내부의 RDS PostgreSQL에 접근해야 한다. 동시에 이 App Runner 서비스는 인터넷에서는 접근 불가하고, VPC 내부 ALB를 통해서만 접근 가능해야 한다. 올바른 구성은?

A) VPC Connector로 아웃바운드(App Runner → RDS) 설정, Private Ingress로 인바운드(VPC → App Runner) 설정

B) VPC Connector만 설정하면 아웃바운드/인바운드 모두 처리됨

C) 보안 그룹에서 인터넷 소스 차단

D) App Runner를 VPC 서브넷에 직접 배포

**정답: A**

해설: App Runner의 VPC 연결은 방향별로 독립적으로 설정한다. VPC Connector는 아웃바운드 전용으로, App Runner에서 VPC 내 RDS, ElastiCache, 내부 ALB 등에 접근할 때 사용한다. Private Ingress는 인바운드 전용으로, `IngressConfiguration.IsPubliclyAccessible: false`로 설정하면 App Runner 서비스가 인터넷에 노출되지 않고 VPC 내부에서만 접근 가능해진다. 두 설정은 독립적이며 각각 별도로 구성해야 한다.

---

### 문제 12

기존 Java 모놀리식 애플리케이션을 컨테이너화하여 ECS로 마이그레이션하려 한다. 코드 수정 없이 컨테이너 이미지와 ECS Task Definition을 자동 생성하는 가장 적절한 도구는?

A) AWS App2Container (a2c) — 실행 중인 Java 애플리케이션을 분석하여 Dockerfile, ECS Task Definition, CloudFormation 템플릿 자동 생성

B) AWS CDK — 인프라를 코드로 정의하여 ECS 스택 생성

C) Elastic Beanstalk — 레거시 Java 앱 직접 배포

D) AWS Migration Hub — 마이그레이션 추적 대시보드

**정답: A**

해설: App2Container(a2c)는 EC2 또는 온프레미스에서 실행 중인 Java(.war/.jar) 및 .NET 애플리케이션을 분석하여 컨테이너화에 필요한 모든 산출물을 자동 생성한다. 코드 수정 없이 컨테이너화가 가능하며, ECS(Fargate/EC2) 또는 EKS 배포용 CloudFormation 템플릿도 함께 생성된다. ECS Copilot은 새 서비스를 처음부터 개발할 때 사용하고, App2Container는 기존 레거시 앱 마이그레이션에 사용한다.

---

## CloudTrail 기반 컨테이너 CI/CD 트러블슈팅 4단계

> 🔍 **더 깊이: 컨테이너 CI/CD 장애 진단 방법론**
>
> 컨테이너 CI/CD 파이프라인 장애는 대부분 권한(IAM), 이미지(ECR), 배포 설정(Task Definition/Manifest), 네트워크(VPC/Security Group) 4개 레이어 중 하나다.
>
> **4단계 진단 프로세스:**
>
> 1. **CloudTrail 확인** → `AccessDenied` 이벤트 필터링
>    - ECR: `ecr:GetAuthorizationToken`, `ecr:BatchGetImage` 실패
>    - ECS: `ecs:RegisterTaskDefinition`, `ecs:UpdateService` 실패
>    - 권한 오류는 이 단계에서 90% 진단 가능
>
> 2. **ECR 이미지 확인** → 태그 존재 여부, 다이제스트 일치
>    - `aws ecr describe-images --repository-name my-app`
>    - IMMUTABLE 설정 시 동일 태그 재푸시 시도 확인
>
> 3. **ECS Service Events 확인** → 콘솔 Service → Events 탭
>    - `Task failed ELB health checks` → 앱 시작 오류 또는 포트 불일치
>    - `CannotPullContainerError` → ECR 권한 또는 VPC 네트워크 문제
>    - `ResourceInitializationError` → Task Role 권한 또는 Secrets Manager 접근 실패
>
> 4. **Container Insights / CloudWatch Logs** → 앱 레벨 오류 확인
>    - `/ecs/{service-name}` 로그 그룹에서 스택 트레이스 확인
>    - OOMKilled → 메모리 Limit 증가 필요

---

## Week 6 완료 체크

- ECR: 스캔(Basic/Enhanced), Lifecycle Policy, IMMUTABLE 태그, Pull Through Cache, KMS 암호화
- ECS: Rolling vs Blue/Green 파일 형식, Auto Scaling (Application Auto Scaling + Capacity Provider), ECS Exec
- EKS: GitOps (ArgoCD/Flux), IRSA, Karpenter vs Cluster Autoscaler, argocd-image-updater
- App Runner: Access Role vs Instance Role, VPC Connector (아웃바운드) vs Private Ingress (인바운드), MaxConcurrency 스케일
- ECS Copilot: Manifest YAML → CloudFormation 자동 생성 (Infrastructure as Intent)
- App2Container: 레거시 Java/.NET → ECS 컨테이너화 마이그레이션 도구
- Lightsail Containers: Auto Scaling 없음 — 시험 함정

---

다음 주 예고 (Week 7): 서버리스 CI/CD — AWS SAM, Lambda 버전/별칭, CodeDeploy Canary, Step Functions 워크플로 오케스트레이션
