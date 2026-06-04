# Day 2 - StackSets: 수천 계정에 IaC를 뿌리는 거버넌스의 깊은 이야기

엔터프라이즈에서 AWS Organizations를 도입하는 순간 운영자의 시간 인식이 바뀐다. 어제까지는 "한 계정에 CloudFormation Stack을 띄우는 게 5분"이었다면, 오늘부터는 "200개 멤버 계정에 똑같은 보안 베이스라인을 깔아야 하는데 콘솔로는 1700분(28시간)이 걸린다"는 계산이 시작된다. 그 28시간 안에 누군가는 한 계정의 IAM Role 이름을 오타 내고, 누군가는 ap-northeast-2 대신 ap-northeast-1에 배포하고, 누군가는 마지막 50개 계정을 까먹는다. **드리프트가 시작되는 지점이 곧 사람이 같은 일을 반복하기 시작하는 지점이다.** StackSets는 정확히 이 28시간을 한 명령으로 줄이려고 만들어진 도구다.

오늘은 StackSets의 두 권한 모델이 왜 동시에 존재하는지, Organizations Trusted Access의 내부 신뢰 체인은 어떻게 동작하는지, Operation Preferences의 동시성과 실패 허용 숫자를 어떻게 정하는지, 그리고 1000+ 계정 운영에서 자주 마주치는 실제 함정을 본다. 시험에서는 StackSets와 Control Tower / Account Factory / Config Conformance Pack의 경계가 자주 흐려져 출제되므로 그 경계도 명확히 짚는다.

## StackSets가 풀려는 문제 — Fan-out의 어려움

분산 시스템에서 fan-out은 "한 소스의 명령을 N개 타겟에 동시 전파"하는 패턴이다. 메시지 큐의 pub/sub, Kubernetes의 DaemonSet, Ansible의 multi-host playbook이 모두 같은 패턴이다. StackSets도 같은 fan-out인데 차이는 (1) 타겟이 **AWS 계정**이라는 보안 경계라는 점, (2) 각 타겟에 IAM 신뢰 관계를 사전 구축해야 한다는 점, (3) 부분 실패를 어떻게 처리할지 정책이 필요하다는 점이다. 이 세 가지가 StackSets의 모든 복잡성을 만든다.

```
StackSet (Administration 계정에 정의)
   │ Template + Parameters + Operation Preferences
   ▼
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Stack       │ Stack       │ Stack       │ Stack       │
│ Instance    │ Instance    │ Instance    │ Instance    │
│ (계정 A,    │ (계정 A,    │ (계정 B,    │ (계정 B,    │
│  ap-ne-2)   │  us-east-1) │  ap-ne-2)   │  us-east-1) │
└─────────────┴─────────────┴─────────────┴─────────────┘
   각 Stack Instance는 멤버 계정 안의 평범한 CloudFormation Stack
   StackSet은 그들의 정의를 동기화하는 상위 메타데이터
```

Stack Instance가 결국 평범한 Stack이라는 게 중요하다. 멤버 계정 안에서는 일반 CloudFormation Stack으로 보이고 콘솔에서 동일하게 다룰 수 있다. **단 멤버 계정의 운영자가 Stack을 임의로 수정하면 곧바로 drift가 발생하고, 다음 StackSet update가 그 변경을 덮어쓴다**. StackSet은 단일 진실의 원천(single source of truth)을 강제하는 동기화 도구이지 협업 도구가 아니다.

> 💡 **관련 이론**: fan-out과 single source of truth의 결합은 GitOps의 핵심 원칙이다. Flux와 ArgoCD가 Git을 진실의 원천으로 두고 N개 Kubernetes 클러스터에 manifest를 reconcile하는 모델이 StackSet과 정확히 같다. 차이는 GitOps가 pull 모델(에이전트가 풀)이고 StackSets는 push 모델(중앙에서 푸시)이라는 점. push 모델은 즉시성이 강한 대신 중앙 장애에 약하고, pull 모델은 분산 회복성이 강한 대신 전파 지연이 있다.

## 두 권한 모델 — Self-managed의 닭과 달걀

StackSets에는 Self-managed와 Service-managed 두 권한 모델이 있는데, 그 차이는 **IAM Role을 누가 만드냐**다. 처음에는 둘 다 "그냥 권한 모델 차이"로 보이지만, 실제 운영에서 Self-managed는 닭과 달걀(chicken-and-egg) 문제를 만든다.

| 모델 | IAM Role 생성 주체 | 대상 지정 | 신규 계정 자동 적용 |
|------|-------------------|----------|--------------------|
| **Self-managed** | 운영자가 각 계정에 사전 생성 | Account ID 목록 | 불가 (수동) |
| **Service-managed** | AWS가 자동 (Organizations 통합) | OU ID 또는 계정 필터 | 가능 (Auto-deployment) |

Self-managed의 닭과 달걀: "StackSets로 멀티 계정에 IAM Role 배포"가 첫 번째 사용 사례인데, **그 배포를 위한 IAM Role을 각 계정에 미리 만들어야 한다**. 200개 계정에 손으로 IAM Role 만들 거면 StackSets 쓸 이유가 없다. 그래서 **현실에서 Self-managed는 Organizations를 안 쓰는 환경(예: 회사 정책상 Organizations 도입 불가, M&A로 인수된 별도 AWS 계정)에만 의미가 있다**.

Service-managed는 이 모순을 AWS Organizations의 신뢰 체인으로 해결한다. Organizations Management Account가 "StackSets에 Trusted Access"를 부여하면 AWS가 자동으로 모든 멤버 계정에 `AWSCloudFormationStackSetExecutionRole`을 자동 프로비저닝한다. 운영자는 IAM 신뢰 관계를 직접 만지지 않는다.

```bash
# 한 번만: Organizations에서 StackSets Trusted Access 활성화
aws organizations enable-aws-service-access \
  --service-principal stacksets.cloudformation.amazonaws.com

# 이후 Service-managed로 만든 모든 StackSet이 자동으로 멤버 계정에 IAM 자동 생성
```

> 🔍 **더 깊이**: Service-managed의 자동 IAM Role은 **`AWSReservedSSO_*` 패턴이 아닌 AWS 관리형 서비스 연결 역할(Service-Linked Role, SLR)** 메커니즘으로 만들어진다. SLR은 사용자가 삭제할 수 없고(서비스가 의존성 검사), 권한 변경도 제한된다. 이게 보안상 이점인 동시에 제약이다 — 자동 생성된 역할을 임의로 수정하려는 시도는 차단되며, 의도적으로 자체 역할을 쓰려면 Self-managed로 전환해야 한다. 신뢰의 출발점이 Organizations 신뢰 관계(`organizations.amazonaws.com`)에서 시작되므로 Org 외부에서 이 역할로 가장(assume) 불가능.

> ⚠️ **함정**: Self-managed에서 Administration Role의 trust policy에 "Administration 계정 ID"가 박혀 있고, Execution Role의 trust policy에는 "Administration 계정만 신뢰"가 박혀 있다. 회사가 인수합병으로 Administration 계정 자체를 옮기는 순간 모든 멤버 계정의 Execution Role trust를 일괄 갱신해야 한다 — Self-managed의 가장 큰 운영 부담. Service-managed는 Organizations가 신뢰 체인을 추상화해 이 문제가 없다.

## Delegated Administrator — Management Account를 잠그는 이유

AWS Organizations의 Management Account는 모든 멤버 계정에 대한 절대 권한을 갖는다. 이 계정이 침해되면 Org 전체가 위험하므로 **Management Account 사용을 최소화하는 게 AWS Well-Architected Framework Security Pillar의 최우선 권고**다. 실무에서는 이 계정에 사람이 로그인하지 않고, 모든 일상 운영은 별도 계정(Tooling Account, Security Account)에 위임한다.

```bash
# Management Account에서 한 번 실행
aws organizations register-delegated-administrator \
  --account-id 222222222222 \
  --service-principal stacksets.cloudformation.amazonaws.com

# 이제 222222222222 계정에서 StackSets Service-managed 작업 가능
# Management Account는 더 이상 일상 StackSets 운영에 관여하지 않음
```

이 패턴이 StackSets뿐 아니라 GuardDuty(Security Account), Config(Audit Account), Security Hub, IAM Access Analyzer 같은 거의 모든 Org-aware 서비스에 동일하게 적용된다. 결과적으로 운영 책임이 도메인별 계정으로 분산되고 Management Account는 "비상 키" 역할로만 남는다.

> 📚 **사례**: 2019년 한 글로벌 기업이 Management Account의 root credential 키 분실 사건을 겪었다. 다행히 침해는 없었지만 root 복구 과정에서 모든 StackSets 운영이 2주간 중단됐다. 이후 회사 표준이 "Management Account는 SCP 변경과 신규 OU 생성만, 나머지는 모두 Delegated Admin"으로 바뀌었다. AWS Control Tower도 이 패턴을 기본으로 강제한다 — Audit/Log Archive 계정이 Delegated Admin이 된다.

## Operation Preferences — 동시성과 실패 허용의 수학

`MaxConcurrentCount`와 `FailureToleranceCount` 두 숫자가 StackSets 운영의 핵심이다. 단순해 보이지만 그 안에 부분 실패 처리 정책의 깊이가 있다.

```bash
aws cloudformation create-stack-instances \
  --stack-set-name BaselineGuardrails \
  --deployment-targets '{"OrganizationalUnitIds":["ou-workloads-abc"]}' \
  --regions ap-northeast-2 us-east-1 eu-west-1 \
  --operation-preferences '{
    "RegionConcurrencyType":"PARALLEL",
    "MaxConcurrentCount":20,
    "MaxConcurrentPercentage":10,
    "FailureToleranceCount":5,
    "FailureTolerancePercentage":2
  }'
```

- **MaxConcurrentCount**: 동시에 처리할 Stack Instance 개수. 200 계정 × 3 리전 = 600 Instance 중 한 번에 20개씩 진행.
- **MaxConcurrentPercentage**: 비율로 지정(%). Count보다 우선 적용 가능.
- **FailureToleranceCount**: 누적 실패 허용 개수. 이 숫자에 도달하면 전체 operation 중단.
- **FailureTolerancePercentage**: 비율로 실패 허용. 600 Instance 중 2%(12개) 실패 허용.
- **RegionConcurrencyType**: PARALLEL(모든 리전 동시) vs SEQUENTIAL(리전 순차).
- **RegionOrder**: SEQUENTIAL일 때 리전 순서 명시.

이 숫자들을 어떻게 정해야 할까. **너무 크면 CloudFormation API rate limit과 Lambda concurrency가 터지고**, **너무 작으면 1000 계정 배포에 며칠이 걸린다**. 실무 가이드라인:

| 환경 규모 | MaxConcurrentCount | FailureTolerance | Region 전략 |
|----------|---------------------|------------------|------------|
| 소규모 (10~50 계정) | 5~10 | 1~2 | PARALLEL |
| 중규모 (50~200 계정) | 20~30 | 5 (1%) | PARALLEL |
| 대규모 (200~1000 계정) | 50~100 | 1~2% | 처음 prod 리전 SEQUENTIAL, 나머지 PARALLEL |
| 초대규모 (1000+ 계정) | 100+ | 1% | 첫 카나리 리전 SEQUENTIAL, 검증 후 나머지 PARALLEL |

> 🎯 **시나리오**: "500 계정에 보안 베이스라인을 배포하는데 처음 5개 계정에서 실패가 나면 즉시 전체 중단하고, 그 이후 발생하는 실패는 1%까지 허용". — 답은 두 단계 배포: 1단계 카나리 5 계정에 FailureToleranceCount=0 (한 개라도 실패 시 즉시 중단), 2단계 나머지 495개에 FailureTolerancePercentage=1. CloudFormation StackSets 자체에 카나리 단계가 없으므로 운영자가 두 번 create-stack-instances를 호출해 직접 구성.

> 🔍 **더 깊이**: 실패가 FailureToleranceCount에 도달하면 **이미 진행 중인 Stack Instance는 끝까지 진행한다**. 즉 "20개 동시 처리 + 실패 허용 5개"에서 5번째 실패가 나도 진행 중인 나머지 15개는 멈추지 않는다. 새 Instance만 시작되지 않을 뿐. 그래서 실제 최종 실패 수는 FailureToleranceCount보다 클 수 있다는 게 시험 함정. 운영자는 SNS 알람으로 operation status를 추적하면서 필요하면 stop-stack-set-operation으로 강제 중단해야 한다.

## AccountFilterType — 네 가지 집합 연산

Service-managed 모드에서 OU와 Accounts를 함께 지정하면서 집합 연산을 한다.

```bash
--deployment-targets '{
  "OrganizationalUnitIds": ["ou-prod-1234"],
  "AccountFilterType": "DIFFERENCE",
  "Accounts": ["111111111111", "222222222222"]
}'
```

| 필터 | 의미 | 사용 예 |
|------|------|--------|
| **NONE** (default) | OU의 모든 계정 | 일반적인 OU 단위 배포 |
| **INTERSECTION** | OU ∩ Accounts | OU 안에서 특정 계정만 |
| **DIFFERENCE** | OU - Accounts | OU에서 일부 계정 제외 |
| **UNION** | OU ∪ Accounts | OU + 추가 계정 |

DIFFERENCE가 특히 유용한 경우는 "OU 전체에 배포하되 진행 중인 마이그레이션 계정 2개는 제외" 같은 임시 예외 처리다. UNION은 "OU에 속하지 않는 레거시 계정 1개를 잠시 포함" 같은 점진적 마이그레이션에 쓴다. INTERSECTION은 "프로덕션 OU 안에서 카나리 5개 계정만" 같은 단계적 배포에 쓴다.

> ⚠️ **함정**: AccountFilterType의 Accounts 목록은 OU 멤버 여부와 무관하게 명시한 그대로 평가된다. 즉 UNION에서 OU 외부 계정을 명시하면 정말로 그 계정에도 배포한다. 운영 표준에서 이런 OU 외부 배포는 감사 흐름에 잡히지 않으므로 가능하면 OU 자체를 재구성하는 게 낫다. UNION은 "임시"여야 하고 영구화되면 거버넌스 누수가 된다.

## Auto-deployment와 RetainStacksOnAccountRemoval

Service-managed에서 가장 강력한 기능은 Auto-deployment다. 새 멤버 계정이 OU에 가입하는 순간 StackSet에 정의된 모든 Stack Instance가 자동으로 생성된다. 이게 Account Factory(Service Catalog 또는 Control Tower)와 결합되면 **새 계정 프로비저닝 → 자동 baseline 적용 → 자동 보안 가드레일 활성화**의 전 과정이 사람 손 없이 진행된다.

```bash
aws cloudformation create-stack-set \
  --stack-set-name BaselineGuardrails \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --template-url ...
```

`RetainStacksOnAccountRemoval`의 의미가 중요하다. 멤버 계정이 OU를 떠나거나 Org에서 제거될 때 그 계정의 Stack Instance를 어떻게 처리할지의 정책이다.

- `false`: 계정이 OU 떠나면 Stack 자동 삭제 — 가장 일반적, 권한 잔재 제거
- `true`: 계정이 OU 떠나도 Stack 유지 — M&A로 계정 분리, 워크로드 잔존 처리

기본값은 `false`라 보안 관점에서 안전하지만, **계정 분리 시 Stack에 포함된 RDS/S3 데이터가 함께 사라질 위험이 있다**. 그래서 stateful 리소스를 포함한 StackSet은 (1) 리소스마다 `DeletionPolicy: Retain` 설정, (2) RetainStacksOnAccountRemoval=true 사용 중 하나를 골라야 한다.

> 📚 **사례**: 2021년 한 핀테크가 자회사 매각으로 자회사 AWS 계정 5개를 Org에서 제거했더니 StackSets로 배포된 베이스라인 Stack이 자동 삭제되면서 그 안의 CloudTrail Trail이 사라졌다. 그 결과 매각 직전 90일치 감사 로그가 유실됐다. 이후 회사 표준이 "감사/로깅 리소스가 포함된 StackSet은 RetainStacksOnAccountRemoval=true + 리소스 DeletionPolicy=Retain"으로 바뀌었다.

## StackSets와 Control Tower / Conformance Pack의 경계

시험에서 자주 헷갈리는 영역이다. 셋 다 "멀티 계정에 거버넌스 적용"이라는 표면적 목적이 같다.

| 도구 | 무엇을 배포 | 자동 신규 계정 적용 | 자동 수정 |
|------|------------|---------------------|----------|
| **CloudFormation StackSets** | 임의의 CFN 템플릿 | Auto-deployment | ❌ (Drift 감지만) |
| **AWS Control Tower** | 미리 정의된 Landing Zone + Guardrail | Account Factory 자동 | 일부 (강제 가드레일) |
| **Config Conformance Pack** | Config Rules의 묶음 | Org Conformance Pack | ✅ (Remediation Action) |
| **Service Catalog** | 사용자에게 노출되는 제품 카탈로그 | 사용자가 launch | ❌ |

선택 기준:
- 임의의 리소스(IAM, VPC, 알람 등)를 배포 → **StackSets**
- 표준 멀티 계정 환경 + 가드레일 일괄 → **Control Tower** (내부적으로 StackSets 사용)
- 평가/모니터링/자동 수정 규칙 → **Config Conformance Pack**
- 사용자가 self-service로 띄울 표준 제품 → **Service Catalog**

Control Tower는 내부적으로 StackSets를 사용하며 그 결과 멤버 계정에 `AWSControlTower*` 접두사의 Stack이 생성된다. Control Tower가 관리하는 Stack을 직접 수정하면 즉시 drift로 잡히고 다음 Landing Zone update에서 덮어쓰여진다.

> 💡 **관련 이론**: StackSets(범용)→ Control Tower(landing zone 특화) → AWS Organizations(거버넌스) 계층은 클라우드 거버넌스의 정석 3층 구조다. NIST SP 800-204C와 CIS AWS Foundations Benchmark에서 권장하는 multi-account strategy의 구체화. 한 회사가 처음 AWS에 진입할 때 Control Tower로 빠르게 landing zone 구성, 이후 도메인 특화 추가 자원을 StackSets로 보강, 평가/감사를 Config Conformance Pack으로 분리하는 흐름.

## Drift Detection at Scale — 1000 Instance 처리

`detect-stack-set-drift`는 전체 Stack Instance에 대해 일괄 drift 탐지를 트리거한다. 1000 Instance면 작업 자체가 30분~수 시간이 걸리고, 결과는 각 Instance별로 별도 조회해야 한다.

```bash
# 트리거
aws cloudformation detect-stack-set-drift \
  --stack-set-name BaselineGuardrails \
  --operation-preferences MaxConcurrentCount=10

# Operation 상태 추적
aws cloudformation describe-stack-set-operation \
  --stack-set-name BaselineGuardrails \
  --operation-id ...

# 결과 (Instance별)
aws cloudformation list-stack-instances \
  --stack-set-name BaselineGuardrails \
  --filters Name=DRIFT_STATUS,Values=DRIFTED
```

대규모에서는 이걸 EventBridge 스케줄로 매일 자동 실행하고 결과를 Security Hub 또는 Slack으로 보낸다. **Drift는 자동 수정되지 않으므로 운영자가 의도 변경(긴급 패치)과 의도하지 않은 변경(실수/공격)을 판단해야 한다**. 자동 수정이 필요한 영역은 Config Rules + SSM Automation Document 조합으로 분리한다.

> 🎯 **시나리오**: "500 계정의 베이스라인 Stack 중 한 계정의 GuardDuty가 꺼져 있다. 자동으로 감지하고 알람을 띄우려면?" — 답은 (1) StackSets Drift Detection을 매일 EventBridge로 실행 → DRIFTED 목록을 SNS로 (감지 측면), (2) Config Rule `guardduty-enabled-centralized`를 Conformance Pack으로 모든 계정에 배포 → Security Hub로 집계 (실시간 측면), (3) 자동 복원이 필요하면 SSM Automation으로 GuardDuty 재활성화 (자동 수정 측면). 세 도구의 역할 분리.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **StackSets는 fan-out + single source of truth**의 결합이고 GitOps의 push 모델 변형이다. 둘째, **Self-managed의 닭과 달걀 문제**때문에 현실에서는 Service-managed + Organizations가 표준이다. 셋째, **Delegated Administrator로 Management Account를 일상 운영에서 분리**하는 게 Well-Architected의 최우선 보안 권고. 넷째, **Operation Preferences의 동시성/실패 허용은 규모에 따라 다르고**, 카나리 단계는 운영자가 두 단계 호출로 구성. 다섯째, **StackSets와 Control Tower / Config Conformance Pack의 경계**는 시험에서 자주 묻는 영역으로, 임의 리소스/landing zone/평가규칙의 구분이 핵심.

다음 글에서는 CloudFormation의 표현력을 확장하는 Custom Resource와 Module/Hook을 본다. SAM이 Transform Macro로 추상화를 더했다면, Custom Resource는 임의의 Lambda를 CFN의 라이프사이클에 끼워넣는 더 일반적인 메커니즘이다.

---

## 📝 연습 문제

**문제 1.** 새 멤버 계정이 OU에 추가될 때 자동으로 보안 베이스라인이 적용되고, 운영자가 매번 손대지 않게 하려면 가장 적절한 구성은?

A) Self-managed StackSets + 수동 create-stack-instances
B) Service-managed StackSets + AutoDeployment Enabled + Organizations Trusted Access
C) Lambda를 EventBridge로 호출
D) 각 계정에 IAM Role을 사전 생성한 후 stage별 호출

**정답: B**

해설: Service-managed는 Org Trusted Access를 통해 AWS가 자동으로 멤버 계정에 Execution Role(Service-Linked Role)을 프로비저닝한다. AutoDeployment Enabled가 켜지면 OU에 신규 계정이 가입하는 순간 모든 Stack Instance가 자동 생성. Self-managed(A,D)는 사전 IAM 필요로 닭과 달걀 문제. Lambda 직접 호출(C)은 멱등성·실패처리·동시성 정책을 직접 구현해야 해서 비효율.

---

**문제 2.** 200 계정에 StackSet으로 보안 가드레일 업데이트를 배포하는데 "처음 5 계정에서 실패가 나면 즉시 전체 중단, 그 이후엔 1%까지 실패 허용"이 필요하다. 가장 적절한 운영 방식은?

A) FailureToleranceCount=0 한 번에 전체 배포
B) FailureTolerancePercentage=1 한 번에 전체 배포
C) 1단계 카나리 5 계정에 FailureToleranceCount=0 → 검증 후 2단계 나머지 195 계정에 FailureTolerancePercentage=1
D) 자동 스크립트 없이 콘솔로 한 계정씩

**정답: C**

해설: StackSets 자체에 내장 카나리 단계가 없으므로 운영자가 create-stack-instances를 두 번 호출해 직접 단계 구성한다. INTERSECTION 또는 Accounts 명시로 1단계 카나리 계정만 선택, 검증 후 DIFFERENCE로 나머지 계정에 적용. A는 첫 실패에서 전체 중단, B는 카나리 단계 없음, D는 비현실적. 시험에서는 "단계적 배포"라는 키워드와 함께 자주 출제.

---

**문제 3.** Service-managed StackSets에서 AWS가 멤버 계정에 자동 생성하는 IAM Role의 특징으로 가장 정확한 것은?

A) 사용자가 자유롭게 삭제 가능
B) Service-Linked Role 메커니즘으로 만들어져 의존성 검사로 임의 삭제 차단, 신뢰 출발점은 Organizations 신뢰 관계
C) 각 계정의 IAM 관리자가 trust policy를 직접 작성해야 함
D) Cross-account access key 기반

**정답: B**

해설: Service-Linked Role(SLR)은 AWS 관리형 역할로 서비스 의존성 검사 통과 시에만 삭제 가능하고 권한 수정도 제한된다. 신뢰 관계는 `organizations.amazonaws.com`을 출발점으로 하므로 Org 외부에서 가장 불가능 — 보안 격리의 핵심. Self-managed처럼 운영자가 trust를 직접 만지지 않아 회사 계정 구조 변경 시 운영 부담이 작다.

---

**문제 4.** Delegated Administrator 등록을 권장하는 핵심 이유는?

A) 비용 절감
B) Management Account의 일상 사용을 최소화해 침해 시 폭발 반경 축소 — AWS Well-Architected Security Pillar의 최우선 권고
C) 리전 확장 가능
D) IAM 자동 회전 활성화

**정답: B**

해설: Management Account는 모든 멤버 계정에 대한 절대 권한을 갖는 단일 위험점. 사람 로그인을 최소화하고 일상 운영을 Tooling/Security 계정에 위임하는 게 표준. 같은 패턴이 GuardDuty/Config/Security Hub/Access Analyzer에도 적용. Control Tower는 Audit/Log Archive 계정을 자동 Delegated Admin으로 설정해 이 패턴 강제. 2019년 root credential 분실 사고 같은 사례 방지.

---

**문제 5.** StackSet의 한 Stack Instance가 stateful 리소스(RDS, S3 with data)를 포함한다. 자회사 매각으로 그 계정이 OU를 떠날 때 데이터를 보호하려면?

A) AutoDeployment Enabled만 설정
B) RetainStacksOnAccountRemoval=true + 리소스마다 DeletionPolicy=Retain (두 정책 모두)
C) StackSet 삭제 후 재생성
D) AccountFilterType=DIFFERENCE로 계정 제외

**정답: B**

해설: RetainStacksOnAccountRemoval=false(기본)면 OU 이탈 시 Stack 자동 삭제되고 그 안의 RDS/S3가 같이 사라진다. true로 설정해 Stack 자체를 남기고, 추가로 리소스 DeletionPolicy=Retain으로 어떤 경로의 Stack 삭제에도 데이터 보존. 2021년 핀테크 CloudTrail 유실 사례의 교훈. A는 무관, C는 데이터 손실 위험, D는 향후 배포 제외이지 데이터 보호 아님.

---

**문제 6.** AccountFilterType=DIFFERENCE의 사용 예로 가장 적절한 것은?

A) OU 외부 계정 추가 포함
B) OU 안에서 진행 중인 마이그레이션 계정 2개를 임시로 배포 대상에서 제외
C) OU의 모든 계정
D) 특정 리전만

**정답: B**

해설: DIFFERENCE = OU - Accounts. OU 전체를 대상으로 하되 일부를 임시 제외할 때 유용. 마이그레이션/장애/예외 상황에 사용. UNION(A)은 OU + 추가 계정 외부 포함, NONE(C)은 OU 전체, 리전 필터(D)는 별도 --regions 옵션. 시험에서는 네 가지 집합 연산의 의미 자체를 묻는다.

---

**문제 7.** 500 계정 환경에서 GuardDuty 활성화 여부를 실시간으로 평가하고 자동 복원까지 하려면 가장 적절한 조합은?

A) StackSets Drift Detection만
B) StackSets로 GuardDuty 배포 + Config Rule `guardduty-enabled-centralized`를 Conformance Pack으로 평가 + SSM Automation Document를 Config Remediation으로 자동 복원
C) Lambda 한 개로 직접 체크
D) 콘솔에서 매일 수동 점검

**정답: B**

해설: 세 도구의 역할 분리 — StackSets는 자원 배포(예방), Config Rules는 평가(감지), SSM Automation은 자동 복원(수정). StackSets Drift Detection은 비주기/수동 트리거이고 자동 수정도 안 됨 → 실시간 단독 솔루션 안 됨. Conformance Pack은 Org 전체에 Config Rules를 일관 배포하는 묶음이라 멀티 계정 평가의 표준. Security Hub로 집계해 가시성 확보까지 표준 3단 구성.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, StackSets는 fan-out + single source of truth의 결합이고 GitOps push 모델의 AWS 버전. 둘째, Self-managed의 닭과 달걀 문제로 인해 Service-managed + Organizations가 표준. 셋째, Delegated Administrator로 Management Account 일상 사용 차단이 Well-Architected의 최우선 보안 권고. 넷째, Operation Preferences는 규모별로 튜닝하고 카나리는 두 단계 호출로 직접 구성. 다섯째, StackSets/Control Tower/Config Conformance Pack의 경계 — 임의 리소스/landing zone/평가규칙으로 구분.
