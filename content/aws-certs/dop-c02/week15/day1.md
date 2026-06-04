# Day 1 - 멀티 계정 엔터프라이즈 CI/CD: 50+ 계정을 떠받치는 거버넌스·플랫폼 엔지니어링의 원리

조직이 한 계정에서 시작해 두 계정, 다섯 계정을 거쳐 수십 개 계정으로 자라는 과정을 지켜보면 어느 순간 같은 질문에 부딪힌다. "개발자가 새 서비스를 만들 때마다 플랫폼 팀이 계정을 깎고, 파이프라인을 짜고, 보안 베이스라인을 손으로 심어야 한다면, 팀은 곧 자기 시간의 전부를 '남의 인프라 셋업'에 쓰게 된다. 어떻게 표준을 강제하면서도 개발자를 기다리게 하지 않을 것인가." 이 긴장 — 거버넌스(통제)와 셀프서비스(속도) 사이의 줄다리기 — 이 멀티 계정 엔터프라이즈 CI/CD의 본질이다. 오늘은 50개 마이크로서비스, 60개 넘는 AWS 계정, 100명 개발자에 플랫폼 엔지니어 5명이라는 현실적인 비율의 조직을 놓고, 그 줄다리기를 어떤 구조로 푸는지 — Landing Zone과 Account Factory, Tooling 계정 중심의 Hub-Spoke, Service Catalog 셀프서비스, Permission Boundary와 SCP의 권한 봉투 — 를 그 밑에 깔린 분산 시스템·조직 이론과 함께 판다.

DOP 시험에서 이 영역은 "수백 개 계정에 동일 베이스라인을 자동 적용하려면", "개발자가 만든 IAM Role이 회사 정책을 넘지 못하게 하려면", "50개 서비스에 표준 파이프라인을 셀프서비스로 제공하려면" 같은 시나리오로 반복 등장한다. 각 선택지가 StackSets·AFT·Service Catalog·Permission Boundary·SCP 중 무엇을 건드리는지, 그리고 "동작은 하지만 운영 부담이 큰" 안티패턴이 무엇인지 읽어내면 답이 보인다.

## 왜 계정을 쪼개는가 — 격벽(bulkhead)과 폭발 반경의 조직 이론

멀티 계정 전략의 출발점은 "AWS 계정은 IAM·결제·서비스 한도·보안의 가장 강력한 격리 경계"라는 사실이다. 한 계정 안의 두 워크로드는 IAM 정책으로 분리할 수 있지만, 그 분리는 사람이 정책을 정확히 쓴다는 전제에 의존한다. 계정을 쪼개면 분리가 **기본값(default-deny by boundary)**이 된다 — 다른 계정의 리소스는 명시적 cross-account 신뢰가 없으면 애초에 보이지도 않는다.

이것은 분산 시스템의 **격벽 패턴(bulkhead pattern)**의 조직 단위 적용이다. 배가 침수돼도 격벽이 한 구획만 잠기게 막듯, prod 계정이 침해되거나 한 팀이 서비스 한도를 다 써버려도 그 영향이 다른 계정으로 번지지 않는다. 보안 용어로는 **폭발 반경(blast radius) 축소**다. 한 계정의 IAM 자격 증명이 노출돼도, 그 자격 증명이 닿을 수 있는 범위가 그 계정 안으로 한정된다.

> 💡 **관련 이론**: 계정 경계는 **장애 격리(fault isolation)**의 정수다. Netflix가 2010년대에 정립한 마이크로서비스 회복성 원칙 — 회로 차단기(circuit breaker), 격벽, 백프레셔 — 중 격벽이 인프라 계층으로 내려온 것이 멀티 계정이다. CS 관점에서 이는 **공유 상태 최소화(shared-nothing architecture)**와 같은 사상이다. 데이터베이스 샤딩이 한 샤드의 장애를 다른 샤드와 격리하듯, 계정 샤딩은 한 워크로드의 보안·한도·비용 폭발을 격리한다. 다만 trade-off가 있다: 격리가 강할수록 cross-account 통신·관찰·배포에 명시적 신뢰 관계(AssumeRole, Resource Policy)를 일일이 세워야 한다. 멀티 계정 CI/CD의 복잡성 대부분이 바로 이 "격리해 놓고 다시 안전하게 연결하는" 작업에서 나온다.

> 🔍 **더 깊이**: AWS의 멀티 계정 권고는 2018년 **Landing Zone** 솔루션으로 처음 코드화됐고, 2019년 **Control Tower**가 이를 관리형 서비스로 흡수했다. 그 이전엔 각 조직이 "AWS 계정을 몇 개로, 어떻게 나눌까"를 매번 처음부터 설계했고, 그 결과 일관성 없는 계정 구조가 양산됐다. Control Tower가 제시한 표준 — Management(결제·조직), Log Archive(중앙 로그), Audit(보안 운영) 세 계정을 핵심으로 하고 워크로드를 OU(Organizational Unit)로 묶는 구조 — 은 사실상 업계 de facto 표준이 됐다. 시험에서 "Log Archive 계정은 무엇을 하는가", "Audit 계정이 GuardDuty/Security Hub 위임 관리자인 이유는?" 같은 질문은 모두 이 표준 구조를 전제로 한다.

## 계정 구조 — OU로 정책을 상속시키는 트리

수십 개 계정을 평평하게 늘어놓으면 정책을 계정마다 따로 붙여야 한다. 대신 **OU(Organizational Unit) 트리**로 묶으면 SCP(Service Control Policy)가 트리를 따라 상속된다 — 파일 시스템의 디렉터리 권한 상속과 같은 발상이다.

```
Root
├─ Security OU
│   ├─ Log Archive Account      ← 모든 CloudTrail/Config 로그 중앙 보관 (불변)
│   ├─ Audit Account            ← Security Hub/GuardDuty 위임 관리자
│   └─ Forensics Account        ← 침해 인스턴스 격리·조사 전용
├─ Infrastructure OU
│   └─ Tooling/CICD Account     ← 파이프라인 Hub
├─ Workloads OU
│   ├─ Dev OU      → {service}-dev accounts
│   ├─ Staging OU  → {service}-staging accounts
│   ├─ PreProd OU
│   └─ Prod OU     → {service}-prod accounts (규제 워크로드 격리)
├─ Sandbox OU                   ← 개발자 실험용, 강한 SCP 가드레일
└─ Suspended OU                 ← 폐기 예정 계정, 전체 Deny
```

핵심은 **정책의 위치**다. "prod에서는 ap-northeast-2 외 region 금지"는 Prod OU에 SCP로 한 번 붙이면 그 아래 모든 prod 계정에 강제된다. 새 prod 계정이 OU에 들어오는 순간 자동으로 상속받으므로, 사람이 계정마다 정책을 거는 누락 사고가 사라진다.

> ⚠️ **함정**: SCP는 **권한을 부여하지 않는다 — 권한의 상한(ceiling)을 정할 뿐이다.** SCP에 `Allow *`를 써도 IAM 정책이 별도로 허용하지 않으면 아무 일도 안 일어난다. SCP의 진짜 역할은 Deny 가드레일 — "Root 사용 금지", "CloudTrail 비활성화 금지", "특정 region 외 금지" — 다. 시험에서 "SCP로 개발자에게 S3 권한을 줬는데 왜 안 되는가"의 답은 "SCP는 권한을 주지 못하고, IAM 정책이 실제 권한을 줘야 한다"이다. SCP(상한)와 IAM 정책(실제 부여)의 교집합이 유효 권한이다. 또 하나: SCP는 Management 계정 자체에는 적용되지 않는다 — 그래서 Management 계정은 일상 워크로드에서 비워 두고 결제·조직 구조만 다뤄야 한다.

## Landing Zone과 Account Factory — 계정을 코드로 찍어낸다

100명 개발자가 50개 서비스를 만들고 각 서비스가 5개 환경(sandbox·dev·staging·pre-prod·prod) 계정을 가진다면 수백 개 계정이 필요하고, 이를 손으로 만드는 건 불가능하다. **Account Factory**가 계정 생성 자체를 자동화한다.

Control Tower의 내장 Account Factory는 Service Catalog 기반이고, 더 강력한 IaC 제어가 필요하면 **AFT(Account Factory for Terraform)**를 쓴다. AFT는 새 계정 요청(예: ServiceNow 티켓 → CodeCommit의 `request.json`)을 받아 파이프라인으로 계정을 프로비저닝하고, 그 위에 표준 베이스라인 — VPC, IAM Role, Config, CloudTrail, GuardDuty, Backup, KMS CMK — 을 자동으로 심는다.

> 💡 **관련 이론**: Account Factory는 **불변 인프라(immutable infrastructure)** 사상을 계정 수준으로 끌어올린 것이다. 서버를 수정하지 않고 새로 찍어내듯, 계정도 "표준 템플릿에서 찍어낸 산출물"로 다룬다. 이는 **선언적(declarative) vs 명령적(imperative)** 패러다임의 문제이기도 하다. 명령적 접근("계정을 만들고, VPC를 만들고, Config를 켜라")은 순서·실패 처리·드리프트를 사람이 챙겨야 하지만, 선언적 접근("이 계정은 이 표준 상태여야 한다")은 도구가 현재 상태와 목표 상태의 차이를 계산해 수렴시킨다(reconciliation loop). Terraform·CloudFormation의 핵심이 이 수렴 루프이며, AFT는 그것을 계정 생성에 적용한다. 결과적으로 "계정의 표준 상태"가 Git에 코드로 남아, 감사·재현·롤백이 가능해진다.

## Tooling 계정 Hub-Spoke — 파이프라인을 중앙에 두고 권한만 빌려준다

50개 서비스가 각자 자기 계정에서 CodePipeline을 돌리면, 파이프라인 정의·아티팩트·ECR·CodeArtifact가 계정마다 흩어지고 표준화가 무너진다. 엔터프라이즈 표준은 **Tooling(CICD) 계정에 파이프라인을 집중**하고, 실제 배포는 cross-account로 워크로드 계정(Spoke)에서 수행하는 Hub-Spoke 구조다.

```
Tooling Account (Hub)
├─ CodePipeline × 50 (서비스별)
├─ CodeBuild (빌드/테스트)
├─ ECR (모든 컨테이너 이미지 중앙)
├─ CodeArtifact Domain (모든 패키지 중앙)
├─ Artifact S3 + KMS Multi-Region Key
└─ Cross-Account Deploy Roles (Spoke로 신뢰 관계)
        │
        │ sts:AssumeRole
        ▼
각 Spoke (Workload Account)
├─ CrossAccountDeployRole   ← Tooling을 신뢰
├─ CloudFormationExecutionRole ← 실제 리소스 생성 권한
└─ Application resources (ECS/Lambda/RDS/...)
```

여기서 권한 설계가 미묘하다. Tooling 계정의 파이프라인은 Spoke의 `CrossAccountDeployRole`을 AssumeRole하고, 그 Role이 다시 `CloudFormationExecutionRole`에 배포를 넘긴다. 이 **이중 Role 구조**가 핵심이다 — 파이프라인 자체는 강력한 배포 권한을 직접 들고 있지 않고, 필요한 순간에만 Spoke의 한정된 Role을 빌린다.

> 🔍 **더 깊이**: KMS 키를 **Multi-Region Key**로 두는 이유가 cross-account 아티팩트 공유의 함정과 직결된다. Tooling 계정의 S3에 KMS로 암호화된 아티팩트를 두면, Spoke 계정의 CloudFormation이 그걸 읽으려면 (1) S3 버킷 정책이 Spoke를 허용하고, (2) KMS 키 정책도 Spoke의 복호화를 허용해야 한다. 둘 중 하나라도 빠지면 "Access Denied"가 나는데, 초심자는 S3 정책만 고치고 KMS를 잊어 배포가 깨진다. 시험에서 "cross-account 파이프라인 배포가 KMS 관련 오류로 실패한다"의 답은 거의 항상 "아티팩트 암호화 키(KMS) 정책에 배포 대상 계정/Role의 복호화 권한을 추가하라"이다. 멀티 리전 DR까지 고려하면 Multi-Region Key로 같은 키 ID를 양쪽 region에서 참조하게 해 정책 관리를 단순화한다.

> 📚 **사례**: 2017년 **Atlassian**, 2020년대 다수 핀테크 기업이 모놀리식 단일 계정에서 멀티 계정 Hub-Spoke로 이전하며 공통적으로 겪은 교훈은 "파이프라인 계정의 권한을 너무 강하게 주면, 그 계정이 침해될 때 모든 워크로드 계정에 배포 가능한 슈퍼 채널이 된다"였다. 그래서 성숙한 조직은 Tooling 계정의 파이프라인 Role에 **배포 대상 계정 목록을 명시적으로 제한**하고(특정 Spoke Role만 AssumeRole 가능), Spoke 쪽 신뢰 정책에도 `aws:PrincipalArn` 조건으로 "이 특정 파이프라인 Role만 신뢰"를 건다. CI/CD 계정 침해는 공급망 공격(supply chain attack)의 대표 표적이며 — 2020년 SolarWinds 사건이 빌드 파이프라인 침해의 파괴력을 보여줬다 — Tooling 계정의 권한 최소화가 그 방어선이다.

## Service Catalog — 셀프서비스와 표준화를 동시에

거버넌스와 속도의 줄다리기를 푸는 핵심 도구가 **Service Catalog**다. 플랫폼 팀이 검증된 파이프라인 템플릿(CDK Pipelines, 언어별·배포 유형별)을 Portfolio로 묶어 게시하면, 개발자는 콘솔에서 Product를 골라 자기 서비스의 파이프라인을 **셀프서비스로 자동 생성**한다. 개발자는 빠르고, 플랫폼 팀은 "승인된 템플릿만 쓰인다"는 표준을 지킨다.

| 영역 | 셀프서비스 | 거버넌스 |
|------|-----------|----------|
| 새 계정 | AFT 자동 프로비저닝 | SCP 자동 상속 |
| 새 파이프라인 | Service Catalog Product | 템플릿 검증·서명 |
| 시크릿 추가 | Secrets Manager | KMS Key Policy 표준 |
| 새 IAM Role | 개발자 자유 생성 | Permission Boundary 강제 |
| Console Write 접근 | Just-In-Time 승급 | 기본은 Read-only |

> 💡 **관련 이론**: 이 표가 곧 **Platform Engineering**과 **Golden Path** 개념의 구현이다. Golden Path란 "가장 권장되고, 가장 잘 닦여 있고, 따라가면 보안·관찰성·배포가 공짜로 따라오는 경로"다. 핵심 통찰은 "강제(mandate)보다 유인(incentive)이 강하다"는 것 — 개발자에게 표준을 강요하는 대신, 표준 경로가 가장 쉽고 빠르도록 만들면 개발자가 자발적으로 그 길을 택한다. 이는 행동경제학의 **넛지(nudge)** 이론과 같다. Service Catalog는 Golden Path를 클릭 한 번으로 만들고, Permission Boundary·SCP는 그 경로를 벗어나려는 시도에 가드레일을 친다. "유인 + 가드레일"의 조합이 셀프서비스 거버넌스의 정수다.

## Permission Boundary — 권한 위임의 안전장치

셀프서비스의 가장 위험한 부분은 "개발자가 자기 IAM Role을 만들 수 있게" 허용하는 것이다. 그냥 허용하면 개발자가 자기 자신에게 AdministratorAccess를 붙인 Role을 만들어 권한 상승(privilege escalation)을 할 수 있다. **Permission Boundary**가 이 구멍을 막는다.

Permission Boundary는 "이 Role/User가 가질 수 있는 권한의 최대치"를 정하는 관리형 정책이다. IAM 정책으로 `Allow *`를 붙여도 Boundary를 넘는 권한은 무효가 된다 — SCP가 계정·OU 수준의 상한이라면, Permission Boundary는 개별 주체(principal) 수준의 상한이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringEquals": {"aws:RequestedRegion": ["ap-northeast-2"]}
    }
  }]
}
```

핵심 트릭: 개발자에게 "Role 생성 권한"을 줄 때, IAM 정책의 Condition으로 **"새로 만드는 Role에 반드시 이 Boundary를 붙여야만 생성 가능"**을 강제한다(`iam:PermissionsBoundary` 조건 키). 이렇게 하면 개발자가 만드는 모든 Role이 Boundary를 넘을 수 없으므로, 셀프서비스 Role 생성을 안전하게 위임할 수 있다.

> ⚠️ **함정**: SCP, Permission Boundary, IAM 정책, Resource 정책, Session 정책의 **평가 순서와 관계**를 헷갈리면 시험에서 무너진다. 핵심 원칙: (1) 명시적 Deny는 어디서든 최우선으로 차단한다. (2) 같은 계정 내 작업의 유효 권한은 **SCP ∩ Permission Boundary ∩ Identity 정책**의 교집합이다 — 셋 모두가 Allow해야 통과한다. (3) cross-account는 Resource 정책도 Allow해야 한다. 즉 Permission Boundary를 붙였는데 권한이 안 먹는 가장 흔한 원인은 "Boundary는 Allow했지만 Identity 정책이 그 액션을 Allow 안 함" 또는 그 반대다 — Boundary는 권한을 **주지 않고 제한만** 하므로, Boundary에 `Allow *`가 있어도 Identity 정책이 별도로 허용해야 실제 권한이 생긴다.

## 보안·컴플라이언스 베이스라인 — StackSets로 모든 계정에 자동 배포

수백 개 계정에 GuardDuty·Config·CloudTrail·Backup을 일일이 켜는 건 불가능하고, 누락은 곧 컴플라이언스 구멍이다. **CloudFormation StackSets**가 하나의 템플릿을 여러 계정·여러 region에 동시 배포한다.

특히 **Service-Managed StackSets + Auto-Deployment**가 멀티 계정의 정답이다. OU를 대상으로 지정하고 Auto-Deployment를 켜면, **그 OU에 새로 들어오는 계정에도 자동으로 베이스라인이 배포**된다 — 새 계정마다 사람이 베이스라인을 까는 누락을 원천 차단한다.

```bash
aws cloudformation create-stack-set \
  --stack-set-name SecurityBaseline \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false \
  --template-body file://baseline.yaml
```

여기에 GuardDuty·Security Hub·Config는 각각 **위임 관리자(Delegated Administrator)** 패턴으로 Audit 계정에 집계한다 — StackSets로 각 계정에 켜고, Audit 계정에서 모든 Finding을 한눈에 본다. "모든 계정에 동일 보안 도구 + 중앙 집계"의 표준 조합이다.

> 🔍 **더 깊이**: StackSets에는 두 권한 모델이 있다. **Self-Managed**는 각 대상 계정에 `AWSCloudFormationStackSetExecutionRole`을, 관리 계정에 `AWSCloudFormationStackSetAdministrationRole`을 사람이 직접 만들어 신뢰 관계를 세워야 한다 — Organizations를 안 쓰거나 외부 계정에 배포할 때다. **Service-Managed**는 Organizations와 통합해 이 Role들을 AWS가 자동 관리하고, OU 타깃팅과 Auto-Deployment를 지원한다. 시험에서 "Organizations 환경에서 새 계정에도 자동 적용"이라는 단서가 나오면 답은 항상 Service-Managed + Auto-Deployment다. Self-Managed는 비(非)Organizations·레거시·세밀한 Role 제어가 필요할 때만 고른다.

## 거버넌스 게이트 — 파이프라인에 박힌 통제점

표준 파이프라인은 코드가 prod에 닿기까지 여러 거버넌스 게이트를 통과한다. 각 게이트가 어떤 위험을 막는지 보는 것이 핵심이다.

```
PR open
  └─ CodeGuru Reviewer + SAST(Snyk/Inspector)   ← 머지 전 코드 품질·취약점
PR merged to main
  └─ CodeBuild 단위/통합 테스트
Build artifact
  └─ Inspector 컨테이너/패키지 스캔 + Signer 서명  ← 공급망 무결성
Deploy to dev (auto)
Deploy to staging (auto + smoke test)
Deploy to pre-prod (manual approval)
  └─ SSM Change Calendar 체크 (freeze 기간 차단)
Deploy to prod
  └─ Canary (CodeDeploy/Lambda Alias) + 자동 롤백(CloudWatch Alarm)
```

> 🎯 **시나리오**: "규제 산업의 핀테크가 50개 마이크로서비스를 운영한다. 요구사항: ①개발자가 새 서비스 파이프라인을 직접 만들되 회사 표준을 벗어나면 안 됨 ②모든 계정에 GuardDuty/Config가 자동 적용되고 신규 계정도 포함 ③개발자가 만드는 IAM Role이 정책 상한을 못 넘게 ④prod 배포는 freeze 기간에 차단." → ① Service Catalog Portfolio에 CDK Pipelines 템플릿을 게시해 셀프서비스 + 표준 검증. ② Service-Managed StackSets(Auto-Deployment Enabled)를 Workloads OU에 배포 + GuardDuty/Security Hub/Config 위임 관리자를 Audit 계정에. ③ Role 생성 권한에 `iam:PermissionsBoundary` 조건으로 Boundary 부착을 강제. ④ 파이프라인 prod 단계 앞에 SSM Change Calendar 게이트. 추가로 Prod OU에 SCP로 region·Root 가드레일, Tooling 계정의 cross-account 배포 Role은 대상 Spoke만 명시적 허용.

## 비용 가시화 — 태그가 곧 회계 단위

60개 계정에서 누가 얼마를 쓰는지 모르면 비용 통제가 불가능하다. 핵심은 **태그 강제 → Cost Allocation Tag → Cost Categories**의 사슬이다. Config Rule로 필수 태그(`team`, `service`, `env`)가 없는 리소스를 비준수로 잡고 Auto-Remediation으로 차단하거나 알린다. 태그가 보장되면 Cost Explorer + Cost Categories로 팀·서비스별 비용을 분류하고, Cost Anomaly Detection이 갑작스러운 비용 급증을 ML로 잡아 알린다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **계정을 쪼개는 것은 격벽·폭발 반경 축소**라는 분산 시스템 회복성 원칙의 조직 적용이며, OU 트리로 SCP를 상속시켜 정책을 한 번에 강제한다. 둘째, **Landing Zone/Account Factory(AFT)가 계정을 코드로 찍어내** 선언적·불변 인프라 사상을 계정 수준으로 끌어올린다. 셋째, **Tooling 계정 Hub-Spoke**가 파이프라인을 중앙화하고 cross-account AssumeRole로 권한만 빌려주며, KMS 키 정책 누락이 가장 흔한 함정이다. 넷째, **Service Catalog(Golden Path) + Permission Boundary + SCP**가 셀프서비스와 거버넌스를 동시에 만족시킨다 — 유인과 가드레일의 조합. 다섯째, **Service-Managed StackSets + Auto-Deployment + 위임 관리자**가 "모든 계정 + 신규 계정"에 보안 베이스라인을 자동 적용하는 정답이다.

다음 글에서는 이 표준을 온프레미스 데이터센터까지 확장하는 **하이브리드 CI/CD**를 깊이 본다.

---

## 📝 연습 문제

**문제 1.** 조직이 단일 계정에서 수십 개 계정으로 분리하는 가장 근본적인 보안·운영상 이유는?

A) 계정이 많을수록 AWS 할인율이 높아져서

B) AWS 계정이 IAM·결제·서비스 한도·보안의 가장 강력한 격리 경계이므로, 계정 분리가 격벽(bulkhead)·폭발 반경 축소를 기본값으로 만들어 한 워크로드의 침해·한도 고갈이 다른 워크로드로 번지지 않게 하기 때문

C) 계정마다 다른 region을 강제로 쓰게 하려고

D) 단일 계정은 CloudFormation을 쓸 수 없어서

**정답: B**

해설: 한 계정 안의 분리는 사람이 IAM 정책을 정확히 쓴다는 전제에 의존하지만, 계정을 쪼개면 분리가 기본값이 된다 — 다른 계정 리소스는 명시적 cross-account 신뢰 없이는 보이지도 않는다. 이는 분산 시스템의 격벽 패턴과 shared-nothing 사상의 조직 단위 적용으로, 폭발 반경(blast radius)을 한 계정 안으로 한정한다. 할인율(A)·region 강제(C)·CloudFormation(D)은 근거가 없다.

---

**문제 2.** SCP(Service Control Policy)에 대한 설명으로 가장 정확한 것은?

A) SCP는 계정에 직접 권한을 부여한다

B) SCP는 권한을 부여하지 않고 권한의 상한(ceiling)만 정하는 Deny 가드레일이며, 유효 권한은 SCP ∩ Permission Boundary ∩ Identity 정책의 교집합이고, Management 계정에는 적용되지 않는다

C) SCP는 IAM 정책을 대체한다

D) SCP는 Management 계정에 가장 먼저 적용된다

**정답: B**

해설: SCP는 권한을 주지 못하고 상한만 정한다 — `Allow *`를 써도 IAM 정책이 별도로 허용하지 않으면 아무 권한도 생기지 않는다. 진짜 역할은 Root 사용 금지·CloudTrail 비활성화 금지 같은 Deny 가드레일이다. 같은 계정 내 유효 권한은 SCP·Permission Boundary·Identity 정책 셋 모두가 Allow해야 하는 교집합이며, Management 계정에는 SCP가 적용되지 않으므로 그 계정은 결제·조직 구조만 다뤄야 한다. 권한 직접 부여(A)·IAM 대체(C)·Management 우선 적용(D)은 모두 틀리다.

---

**문제 3.** 100명 개발자가 수백 개 계정을 필요로 하는 환경에서, 신규 계정을 표준 베이스라인(VPC/Config/CloudTrail/GuardDuty)과 함께 자동 프로비저닝하려면?

A) 플랫폼 팀이 콘솔에서 계정마다 수동 생성

B) Landing Zone/Control Tower + Account Factory(AFT)로 요청을 받아 파이프라인이 계정을 선언적으로 프로비저닝하고 표준 베이스라인을 자동 부착

C) 각 개발자가 자기 신용카드로 계정 가입

D) Lambda로 매일 계정을 무작위 생성

**정답: B**

해설: Account Factory(특히 AFT)는 계정 생성 요청을 받아 파이프라인으로 계정을 프로비저닝하고 그 위에 표준 베이스라인을 자동으로 심는다. 이는 불변 인프라·선언적 패러다임을 계정 수준으로 끌어올린 것으로, "계정의 표준 상태"가 Git에 코드로 남아 감사·재현·롤백이 가능하다. 수동 생성(A)은 누락·확장 불가, 개발자 개별 가입(C)·무작위 생성(D)은 거버넌스 붕괴다.

---

**문제 4.** Tooling 계정 Hub-Spoke 구조에서 cross-account 파이프라인 배포가 "Access Denied (KMS)" 오류로 실패한다. 가장 흔한 원인과 해결은?

A) S3 버킷 정책만 수정하면 된다

B) 아티팩트가 KMS로 암호화돼 있는데 배포 대상(Spoke) 계정/Role의 복호화 권한이 KMS 키 정책에 없어서다 — S3 버킷 정책과 KMS 키 정책 둘 다 Spoke를 허용해야 한다

C) 파이프라인을 재시작하면 해결된다

D) ECR을 비활성화하면 된다

**정답: B**

해설: Tooling 계정의 암호화된 S3 아티팩트를 Spoke의 CloudFormation이 읽으려면 S3 버킷 정책과 KMS 키 정책 둘 다 Spoke의 접근/복호화를 허용해야 한다. 초심자는 S3만 고치고 KMS를 잊어 배포가 깨진다. 멀티 리전 DR까지 고려하면 Multi-Region Key로 같은 키 ID를 양쪽 region에서 참조하게 해 정책을 단순화한다. S3만 수정(A)·재시작(C)·ECR 비활성화(D)는 근본 원인을 못 짚는다.

---

**문제 5.** 개발자에게 IAM Role 생성을 셀프서비스로 위임하되, 만든 Role이 회사 정책 상한(예: 특정 region만)을 넘지 못하게 안전하게 강제하려면?

A) 개발자에게 AdministratorAccess를 준다

B) Permission Boundary 정책을 정의하고, Role 생성 권한에 `iam:PermissionsBoundary` 조건으로 새 Role에 반드시 그 Boundary를 부착해야만 생성 가능하도록 강제한다

C) 모든 Role 생성을 금지한다

D) SCP만으로 개별 Role을 제어한다

**정답: B**

해설: Permission Boundary는 주체(principal) 수준의 권한 상한이다. Role 생성 권한을 줄 때 `iam:PermissionsBoundary` 조건으로 새 Role에 Boundary 부착을 강제하면, 개발자가 만드는 모든 Role이 Boundary를 넘을 수 없어 권한 상승이 차단된다 — 셀프서비스 위임을 안전하게 만든다. Admin 부여(A)는 권한 상승 구멍, 전면 금지(C)는 셀프서비스 포기, SCP(D)는 계정·OU 상한이지 개별 Role 생성 시점의 강제 메커니즘이 아니다.

---

**문제 6.** Organizations 환경에서 GuardDuty·Config 베이스라인을 모든 계정에 배포하고, 앞으로 OU에 새로 들어올 계정에도 자동 적용되게 하려면?

A) Self-Managed StackSets로 각 계정에 Role을 수동 생성

B) Service-Managed StackSets + Auto-Deployment(Enabled)를 OU 타깃으로 배포하면 신규 계정에도 자동 적용되며, GuardDuty/Security Hub/Config는 위임 관리자(Audit 계정)로 집계

C) Lambda 스크립트로 매일 신규 계정을 스캔

D) 각 계정 관리자가 콘솔에서 수동으로 켠다

**정답: B**

해설: Service-Managed StackSets는 Organizations와 통합해 실행 Role을 AWS가 자동 관리하고, OU 타깃팅과 Auto-Deployment를 지원한다 — OU에 새 계정이 들어오면 자동으로 베이스라인이 배포된다. 거기에 위임 관리자 패턴으로 Audit 계정에 Finding을 집계한다. "신규 계정에도 자동 적용"이라는 단서가 나오면 답은 항상 Service-Managed + Auto-Deployment다. Self-Managed(A)는 Role 수동 셋업 필요, 스크립트(C)·수동(D)은 누락 위험의 안티패턴이다.

---

**문제 7.** Platform Engineering의 "Golden Path" 개념과 Service Catalog의 관계로 가장 정확한 것은?

A) Golden Path는 개발자에게 표준을 강제로 막는 차단 장치다

B) Golden Path는 "가장 쉽고 빠른 권장 경로"로, 따라가면 보안·관찰성·배포가 공짜로 따라오게 만들어 개발자가 자발적으로 표준을 택하게 하는 넛지(nudge)이며, Service Catalog가 그 경로를 클릭 한 번으로 제공하고 Permission Boundary·SCP가 이탈에 가드레일을 친다

C) Golden Path는 비용 최적화 전용 기능이다

D) Golden Path는 Service Catalog 없이는 존재할 수 없다

**정답: B**

해설: Golden Path의 핵심 통찰은 "강제보다 유인이 강하다"이다 — 표준 경로가 가장 쉽고 빠르면 개발자가 자발적으로 그 길을 택한다(행동경제학의 넛지). Service Catalog는 검증된 파이프라인 템플릿을 셀프서비스로 제공해 Golden Path를 구현하고, Permission Boundary·SCP는 경로를 벗어나려는 시도에 가드레일을 친다. "유인 + 가드레일"이 셀프서비스 거버넌스의 정수다. 강제 차단(A)·비용 전용(C)·Service Catalog 종속(D)은 개념을 좁게 오해한 것이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 계정 분리는 격벽·폭발 반경 축소라는 분산 시스템 회복성 원칙의 조직 적용이며, OU 트리로 SCP(권한 상한·Deny 가드레일)를 상속시킨다. 둘째, Landing Zone/Account Factory(AFT)가 계정을 코드로 찍어내 선언적·불변 인프라 사상을 계정 수준으로 끌어올리고 표준 베이스라인을 자동 부착한다. 셋째, Tooling 계정 Hub-Spoke가 파이프라인을 중앙화하고 cross-account AssumeRole로 권한만 빌려주며, KMS 키 정책 누락(SolarWinds류 공급망 위험과 함께)이 핵심 함정이다. 넷째, Service Catalog(Golden Path)·Permission Boundary(`iam:PermissionsBoundary` 강제)·SCP가 셀프서비스와 거버넌스를 동시에 만족시킨다. 다섯째, Service-Managed StackSets + Auto-Deployment + 위임 관리자가 "모든 계정 + 신규 계정"에 보안 베이스라인을 자동 적용하는 정답이다.
