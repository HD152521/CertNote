# Day 2 - 멀티 계정 파이프라인: Cross-Account IAM이 필요한 이유

엔터프라이즈 AWS 환경에서 가장 흔한 구조는 "Tooling 계정 하나 + 여러 Spoke 계정"이다. 개발, 스테이징, 프로덕션이 각각 별도 계정에 있고, 파이프라인은 중앙 Tooling 계정에서 실행된다. 이 구조는 보안 격리(Prod 계정에 개발자 콘솔 접근 없음), 비용 분리(각 계정별 청구), 폭발 반경 제한(Prod 계정의 침해가 Dev에 영향 없음)을 동시에 달성한다.

문제는 이 구조가 파이프라인 엔지니어에게 상당한 IAM/S3/KMS 설정을 요구한다는 점이다. 잘못 설정하면 "S3는 되는데 복호화가 안 된다", "AssumeRole이 안 된다", "배포는 됐는데 권한이 너무 넓다" 같은 문제가 생긴다. 오늘은 이 설정의 정확한 구조와 각 요소가 왜 필요한지를 파악한다.

> 💡 **관련 이론**: AWS의 보안 모델에서 계정(Account)은 가장 강력한 격리 경계다. IAM Policy는 같은 계정 내 Principal이 무엇을 할 수 있는지 정의하지만, 계정 경계를 넘는 행동에는 반드시 **양방향 신뢰**가 필요하다. A 계정의 Principal이 B 계정 리소스에 접근하려면 (1) A 계정 IAM Policy에서 해당 행동을 허용하고, (2) B 계정 리소스 정책에서 A 계정 Principal을 허용해야 한다—두 조건이 모두 AND로 충족되어야 한다. 이것이 Cross-Account의 근본 원리이며, 이 구조를 이해하지 못하면 4종 권한 체인 중 어느 하나를 빠뜨리게 된다.

## Hub-Spoke 패턴: 책임 분리의 원칙

2017년 이전, 기업들은 단일 AWS 계정 안에서 IAM 정책으로 개발/스테이징/프로덕션 환경을 분리했다. 문제는 IAM 정책 실수 한 번이 전체 환경에 영향을 미쳤고, "프로덕션 리소스를 개발자가 실수로 삭제"하는 사고가 반복됐다. AWS Organizations 출범(2017년 11월)과 함께 계정 경계를 격리 수단으로 사용하는 Hub-Spoke 패턴이 업계 표준이 됐다.

```
Tooling Account (Hub) — 파이프라인 실행 책임
├── CodePipeline (오케스트레이터)
├── CodeBuild (빌드 실행)
├── ECR (이미지 레지스트리)
├── Artifact S3 버킷 + KMS CMK
└── Pipeline Service Role (Pipeline이 쓰는 IAM Role)

Dev Account (Spoke) — 개발 환경 리소스 소유
├── ECS / Lambda / CloudFormation 스택
├── CrossAccountDeployRole (Tooling이 AssumeRole)
└── CloudFormationExecutionRole (CFN이 리소스 생성에 사용)

Staging Account (Spoke)
└── (동일 구조)

Prod Account (Spoke) — 가장 엄격한 제어
├── (동일 구조)
├── SCP: DenyCreateUser, RequireMFA
└── CloudTrail 중앙 수집
```

> 💡 **관련 이론**: SCP(Service Control Policy)는 계정 수준의 최대 권한 상한(Permission Ceiling)을 설정하는 메커니즘이다. Prod OU에 `DenyCreateIAMUser` SCP를 붙이면 Prod 계정 내에서는 IAM User를 아무도 만들 수 없다—루트 계정조차도. IAM Policy는 SCP가 허용한 범위 내에서만 권한을 부여할 수 있다. "SCP = 계정의 헌법, IAM Policy = 개별 법률"이라는 비유가 정확하다. IAM Policy가 아무리 광범위해도 SCP가 막으면 실행되지 않는다.

이 구조의 운영 비용도 있다. Spoke 계정마다 CrossAccountDeployRole과 CloudFormationExecutionRole을 생성해야 하고, Tooling 계정의 S3 버킷 정책과 KMS Key Policy에 각 Spoke 계정 Role을 명시해야 한다. 계정이 10개를 넘어가면 이 설정을 StackSets로 자동화하지 않으면 관리가 불가능해진다. AWS Control Tower와 Account Factory가 이 자동화를 담당한다.

## 필수 4종 권한 구성: 정확한 체인

Cross-Account 파이프라인이 동작하려면 정확히 4곳에 권한이 있어야 한다. 하나라도 빠지면 배포가 실패한다. 이 체인은 순서대로 따라가야 이해된다.

**권한 체인의 흐름**: CodePipeline → (AssumeRole) → CrossAccountDeployRole → (S3 GetObject) → Artifact → (KMS Decrypt) → 암호화 해제 → CloudFormation Deploy

### 1. Tooling 계정 — Pipeline Service Role이 AssumeRole 가능해야 함

```json
{
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": [
    "arn:aws:iam::DEV-ACCT-ID:role/CrossAccountDeployRole",
    "arn:aws:iam::STG-ACCT-ID:role/CrossAccountDeployRole",
    "arn:aws:iam::PRD-ACCT-ID:role/CrossAccountDeployRole"
  ]
}
```

이것은 Pipeline Service Role의 **Permission Policy(Identity Policy)**에 들어간다. "이 Role이 다른 계정의 Role을 흉내낼 수 있는 권한"을 부여한다. 이것만으로는 AssumeRole이 성공하지 않는다—Spoke 계정이 이 Trust를 수락해야 한다(2번).

### 2. Spoke 계정 — CrossAccountDeployRole의 Trust Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::TOOLING-ACCT-ID:role/CodePipelineServiceRole"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "aws:PrincipalTag/Pipeline": "checkout-pipeline"
      }
    }
  }]
}
```

이것은 **Resource Policy(Trust Policy)**다. "내(CrossAccountDeployRole)를 누가 AssumeRole할 수 있는가"를 정의한다. `aws:PrincipalTag/Pipeline` 조건이 핵심이다—Pipeline Service Role에 태그 `Pipeline=checkout-pipeline`이 있을 때만 AssumeRole이 허용된다. 여러 파이프라인이 동일 Service Role을 공유할 때 파이프라인별로 권한을 분리하는 메커니즘이다.

### 3. Tooling 계정 — Artifact S3 버킷 정책

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowSpokeAccountsReadArtifact",
    "Effect": "Allow",
    "Principal": {
      "AWS": [
        "arn:aws:iam::DEV-ACCT-ID:role/CrossAccountDeployRole",
        "arn:aws:iam::STG-ACCT-ID:role/CrossAccountDeployRole",
        "arn:aws:iam::PRD-ACCT-ID:role/CrossAccountDeployRole"
      ]
    },
    "Action": [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:PutObject"
    ],
    "Resource": [
      "arn:aws:s3:::tooling-artifacts-bucket",
      "arn:aws:s3:::tooling-artifacts-bucket/*"
    ]
  }]
}
```

S3 버킷은 Tooling 계정에 있다. Spoke 계정의 Role이 이 버킷에서 Artifact를 꺼내려면 버킷 정책이 Spoke Role을 명시적으로 허용해야 한다. 1번과 2번으로 AssumeRole에 성공했더라도 S3 버킷 정책이 없으면 GetObject가 403으로 거부된다.

### 4. Tooling 계정 — KMS Key Policy

```json
{
  "Sid": "AllowSpokeAccountsDecrypt",
  "Effect": "Allow",
  "Principal": {
    "AWS": [
      "arn:aws:iam::DEV-ACCT-ID:role/CrossAccountDeployRole",
      "arn:aws:iam::PRD-ACCT-ID:role/CrossAccountDeployRole"
    ]
  },
  "Action": [
    "kms:Decrypt",
    "kms:DescribeKey",
    "kms:GenerateDataKey"
  ],
  "Resource": "*"
}
```

> ⚠️ **함정**: S3 버킷 정책(3번)은 주면서 KMS Key Policy(4번)를 빠뜨리는 것이 가장 흔한 실수다. 에러 메시지가 "S3 Access Denied"처럼 보이지 않고 Artifact 추출 단계에서 불명확한 오류로 나타나서 원인을 찾기 어렵다. KMS Key Policy는 S3 버킷 정책과 완전히 별개의 정책 문서다—S3 버킷 정책을 아무리 잘 써도 KMS 복호화 권한이 없으면 암호화된 객체는 열 수 없다. KMS는 Envelope Encryption을 사용하는데, S3 객체 자체가 Data Key로 암호화되어 있고 이 Data Key가 다시 KMS CMK로 암호화되어 있다. 객체를 읽으려면 반드시 KMS CMK로 Data Key를 복호화해야 한다.

> 💡 **관련 이론**: KMS Envelope Encryption 원리. 큰 데이터를 직접 KMS API로 암호화하면 API 호출 크기 제한(4KB)에 걸린다. 그래서 KMS는 두 단계로 암호화한다: (1) KMS CMK로 임시 Data Key를 생성(GenerateDataKey), (2) Data Key로 실제 데이터를 로컬 암호화. S3에 저장되는 것은 암호화된 데이터 + 암호화된 Data Key다. 복호화 시 암호화된 Data Key를 KMS CMK로 복호화(Decrypt)하고, 그 결과로 실제 데이터를 복호화한다. Cross-Account에서 `kms:Decrypt`와 `kms:GenerateDataKey` 모두 필요한 이유가 이 두 단계 때문이다.

## 두 개의 Role: Action Role과 CFN Execution Role

CloudFormation Deploy Action에서 두 가지 Role이 동시에 등장한다. 이 둘의 역할이 다르다.

```json
{
  "name": "DeployToProd",
  "actionTypeId": {
    "category": "Deploy",
    "owner": "AWS",
    "provider": "CloudFormation",
    "version": "1"
  },
  "roleArn": "arn:aws:iam::PRD-ACCT:role/CrossAccountDeployRole",
  "configuration": {
    "ActionMode": "CREATE_UPDATE",
    "StackName": "checkout-service-prod",
    "TemplatePath": "BuildArtifact::cloudformation/template.yaml",
    "ParameterOverrides": "{\"ImageTag\": \"#{BuildVariables.IMAGE_TAG}\"}",
    "RoleArn": "arn:aws:iam::PRD-ACCT:role/CloudFormationExecutionRole",
    "Capabilities": "CAPABILITY_IAM,CAPABILITY_NAMED_IAM"
  },
  "inputArtifacts": [{"name": "BuildArtifact"}]
}
```

**`roleArn` (Action 수준)**: CodePipeline이 이 Action을 실행하기 위해 AssumeRole하는 Role. "누가 CloudFormation API를 호출하는가"의 주체. Prod 계정의 CrossAccountDeployRole이 여기 들어간다.

**`Configuration.RoleArn` (CFN 수준)**: CloudFormation이 실제 리소스(ECS, IAM Role, Security Group 등)를 생성/수정할 때 사용하는 Role. "CloudFormation이 어떤 권한으로 리소스를 만드는가"의 주체. 이 Role은 Prod 계정의 리소스를 생성할 수 있는 권한이 있어야 한다.

두 Role을 분리하는 이유는 최소 권한 원칙이다. CrossAccountDeployRole은 `cloudformation:CreateStack`, `cloudformation:UpdateStack` 같은 CFN API만 호출할 수 있으면 된다. ECS, EC2, IAM 같은 실제 리소스 생성 권한은 CloudFormationExecutionRole에만 있으면 된다. 이 분리가 없으면 Tooling 계정에서 Prod 계정의 모든 리소스를 직접 조작할 수 있는 광범위한 Role이 필요해진다.

> 🔍 **더 깊이**: AWS CloudFormation의 Role 체계는 OAuth 2.0의 Authorization Code Flow와 구조적으로 유사한 이중 Delegation 패턴이다. CodePipeline(클라이언트)이 CrossAccountDeployRole(access token)을 받아 CloudFormation API를 호출하고, CloudFormation은 다시 CloudFormationExecutionRole(서비스 계정)을 사용해 실제 리소스를 조작한다. 이 이중 Delegation이 "누가 어떤 리소스를 변경했는지"를 CloudTrail에서 정확하게 추적할 수 있게 한다. CloudTrail의 이벤트를 보면 `assumedBy`와 `invokedBy` 필드가 각각 어느 Role이 어떤 행동을 했는지 기록한다. 이 추적성이 보안 감사에서 필수다.

> ⚠️ **함정**: `CAPABILITY_IAM`과 `CAPABILITY_NAMED_IAM`을 혼동하는 실수. CloudFormation 스택이 IAM 리소스를 생성할 때 `CAPABILITY_IAM`이 필요하다. 그런데 **명시적 이름**이 있는 IAM 리소스(이름이 고정된 Role, User)를 생성할 때는 `CAPABILITY_NAMED_IAM`이 필요하다. 이름이 없는 IAM 리소스는 `CAPABILITY_IAM`만으로 충분하다. 두 개를 모두 넣어두면 실패하지 않지만, `CAPABILITY_IAM`만 넣고 명시적 이름의 Role을 생성하려 하면 `InsufficientCapabilitiesException`으로 실패한다.

## CloudFormation StackSets와 CodePipeline 통합

StackSets는 단일 CloudFormation 템플릿을 여러 계정/리전에 동시에 배포하는 서비스다. CodePipeline과 통합되면 "모든 계정의 Security Baseline 업데이트"를 단일 파이프라인 실행으로 처리할 수 있다.

```json
{
  "name": "DeployGuardrailsAllOUs",
  "actionTypeId": {
    "category": "Deploy",
    "owner": "AWS",
    "provider": "CloudFormationStackSet",
    "version": "1"
  },
  "configuration": {
    "StackSetName": "OrgBaselineGuardrails",
    "TemplatePath": "BuildArtifact::guardrails/baseline.yaml",
    "DeploymentTargets": "OrganizationalUnitIds=ou-security-prod,ou-workloads",
    "Regions": "ap-northeast-2,us-east-1,eu-west-1",
    "PermissionModel": "SERVICE_MANAGED",
    "OrganizationsAutoDeployment": "Enabled",
    "MaxConcurrentPercentage": "50",
    "FailureTolerancePercentage": "20"
  }
}
```

**SELF_MANAGED vs SERVICE_MANAGED** 두 가지 Permission Model이 있다.

`SELF_MANAGED`는 StackSets를 배포하는 계정에 `AWSCloudFormationStackSetAdministrationRole`을, 각 대상 계정에 `AWSCloudFormationStackSetExecutionRole`을 수동으로 생성해야 한다. Organizations 없이도 작동하지만 계정이 많으면 Role 설정이 번거롭다.

`SERVICE_MANAGED`는 Organizations 관리 계정 또는 Delegated Admin 계정에서만 사용 가능하다. Organizations가 자동으로 필요한 Role을 생성해주므로 수동 Role 설정이 필요 없다. `OrganizationsAutoDeployment: Enabled`와 함께 사용하면 새 계정이 OU에 추가될 때 자동으로 StackSet 인스턴스를 생성한다—Landing Zone 자동화의 핵심이다.

> 💡 **관련 이론**: StackSets의 배포 전략은 카나리 배포의 조직 수준 버전이다. 단일 서비스의 Canary 배포(트래픽의 1% → 10% → 100%)처럼, StackSets는 "계정의 10% → 50% → 100%" 순서로 배포를 확산시킬 수 있다. `MaxConcurrentPercentage`는 동시에 몇 %의 계정에 배포할지(속도 제어), `FailureTolerancePercentage`는 몇 %가 실패해도 계속 진행할지(안전 제어)다. 100개 계정에서 `MaxConcurrentPercentage=50, FailureTolerancePercentage=20`이면: 동시에 50개 배포, 20개까지 실패해도 계속 진행, 21개 실패 시 전체 중단. AWS Control Tower도 내부적으로 이 메커니즘을 사용한다.

> 📚 **사례**: Goldman Sachs의 Account Factory 자동화. 2021년 re:Invent에서 공개된 사례로, 1,000개 이상의 AWS 계정에 IAM Password Policy, CloudTrail, Config Rules, S3 Block Public Access를 자동 배포하는 "Account Baseline Pipeline"을 구축했다. CodePipeline + StackSets(SERVICE_MANAGED) + Organizations AutoDeployment 조합으로 신규 계정 온보딩 시간을 2-3일에서 30분 이내로 단축했다. 핵심은 Security OU에 `OrganizationsAutoDeployment: Enabled`로 설정한 StackSet—새 계정이 Security OU에 들어오는 순간 Baseline이 자동 적용된다.

## 멀티 리전 파이프라인: 각 리전에 Artifact Store가 필요한 이유

CodePipeline Action은 `region` 속성으로 Tooling 계정의 기본 리전과 다른 리전에서 실행될 수 있다. 한국에서 빌드하고 미국과 유럽에 배포하는 글로벌 서비스에 사용되는 패턴이다.

```yaml
ArtifactStores:
  - Region: ap-northeast-2
    ArtifactStore:
      Type: S3
      Location: tooling-artifacts-kr
      EncryptionKey:
        Id: arn:aws:kms:ap-northeast-2:TOOLING:key/kr-key-id
        Type: KMS
  - Region: us-east-1
    ArtifactStore:
      Type: S3
      Location: tooling-artifacts-use1
      EncryptionKey:
        Id: arn:aws:kms:us-east-1:TOOLING:key/use1-key-id
        Type: KMS
  - Region: eu-west-1
    ArtifactStore:
      Type: S3
      Location: tooling-artifacts-euw1
      EncryptionKey:
        Id: arn:aws:kms:eu-west-1:TOOLING:key/euw1-key-id
        Type: KMS
```

각 리전에 S3 버킷과 KMS 키가 별도로 필요한 이유는 **KMS의 리전 범위** 특성 때문이다. KMS 키는 생성된 리전에서만 작동한다. 서울(ap-northeast-2) KMS 키로 암호화된 Artifact는 반드시 서울 KMS 엔드포인트로 복호화 API를 호출해야 한다—버지니아(us-east-1) KMS 엔드포인트로는 불가능하다.

> 🔍 **더 깊이**: KMS가 리전 범위인 이유는 HSM(Hardware Security Module)의 물리적 보안 요구사항과 관련이 있다. KMS 키 자료는 해당 리전의 데이터 센터에 있는 HSM에서만 처리된다. 키가 리전을 넘나들면 GDPR(유럽), 개인정보보호법(한국), FIPS 140-2(미국 정부) 등의 데이터 레지던시 요구사항을 충족하기 어려워진다. "이 데이터가 어느 리전에서 암호화/복호화됐는가"는 보안 감사에서 필수 추적 정보이며, KMS의 리전 범위가 이 추적성을 보장한다. 멀티 리전 파이프라인에서 리전별 KMS 키를 별도로 관리하는 것은 단순한 기술 제약이 아니라 컴플라이언스 아키텍처 결정이다. KMS Multi-Region Keys(2021년 출시)는 Primary/Replica 구조로 동일한 키 자료를 여러 리전에 복제할 수 있게 해주지만, 이 경우에도 각 리전에 별도의 Replica Key ARN이 존재한다.

멀티 리전 파이프라인 Action 정의 예시:

```json
{
  "name": "DeployToUSEast1",
  "region": "us-east-1",
  "actionTypeId": {
    "category": "Deploy",
    "owner": "AWS",
    "provider": "CloudFormation",
    "version": "1"
  },
  "roleArn": "arn:aws:iam::PRD-ACCT:role/CrossAccountDeployRole",
  "configuration": {
    "ActionMode": "CREATE_UPDATE",
    "StackName": "checkout-service-use1",
    "TemplatePath": "BuildArtifact::cloudformation/template.yaml"
  }
}
```

`region: us-east-1`이 있으면 CodePipeline은 자동으로 `us-east-1` 리전의 Artifact Store에서 BuildArtifact를 찾는다. 이 버킷은 `ArtifactStores` 설정에서 `us-east-1`에 대응하는 버킷이다.

## Confused Deputy 문제와 방어 패턴

Cross-Account에서 자주 언급되는 보안 취약점이 **Confused Deputy(혼란스러운 대리인)** 문제다. 한 Role이 여러 고객/파이프라인을 위해 Spoke 계정에 접근할 수 있다면, 악의적인 파이프라인이 자신이 접근할 수 없는 Spoke 계정의 Role을 "착각하게" 만들 수 있다.

**공격 시나리오**: Pipeline A(team-a)와 Pipeline B(team-b)가 같은 Pipeline Service Role을 공유한다. Spoke 계정의 Trust Policy가 Pipeline Service Role ARN만 조건으로 하면, team-a가 자신의 파이프라인을 수정해 team-b의 Spoke Role ARN을 Action의 roleArn으로 지정할 수 있다.

**방어 방법 3가지**:

방법 1 — aws:SourceArn 조건 (내부 서비스):
```json
{
  "Condition": {
    "ArnLike": {
      "aws:SourceArn": "arn:aws:codepipeline:ap-northeast-2:TOOLING-ACCT:checkout-pipeline"
    }
  }
}
```

방법 2 — PrincipalTag 조건 (내부 멀티팀):
```json
{
  "Condition": {
    "StringEquals": {
      "aws:PrincipalTag/Pipeline": "checkout-pipeline",
      "aws:PrincipalTag/Environment": "prod"
    }
  }
}
```

방법 3 — ExternalId (외부 서드파티):
```json
{
  "Condition": {
    "StringEquals": {
      "sts:ExternalId": "unique-secret-id-from-tooling"
    }
  }
}
```

> 💡 **관련 이론**: Confused Deputy 문제는 1988년 Norm Hardy의 논문에서 처음 기술된 보안 패턴이다. 원래 예시는 OS의 파일 시스템—프로그램이 컴파일러를 통해 자신이 접근할 수 없는 파일을 열게 되는 문제였다. AWS에서는 "신뢰된 서비스(CodePipeline)를 통해 실제로는 권한이 없는 리소스에 접근하는" 시나리오가 이 패턴과 동일하다. `aws:SourceArn`이 AWS의 공식 해결책이다—"이 신뢰받은 서비스가 어떤 특정 리소스(파이프라인 ARN)의 요청을 처리하는 경우에만 허용"이라는 의미다. ExternalId는 서드파티 시스템이 Principal인 경우의 표준 해결책으로, OIDC를 지원하는 외부 CI/CD(GitHub Actions)는 OIDC subject claim 조건이 더 강력한 방어다.

> 🔍 **더 깊이**: IAM Condition Key 선택 기준. `aws:SourceArn`은 AWS 서비스가 다른 계정의 리소스에 접근할 때 "이 서비스가 처리하는 구체적인 리소스 ARN"을 검증한다. `aws:PrincipalTag`는 IAM Role에 붙은 태그를 조건으로 써서 "어떤 태그를 가진 Role인가"를 검증한다. `sts:ExternalId`는 AssumeRole 호출 시 제공된 비밀 값을 검증한다. 세 방법 중 `aws:SourceArn`이 가장 구체적이고 위조가 어렵지만 AWS 서비스가 Principal인 경우에만 유효하다. 서드파티 도구나 자체 서버가 Principal이면 ExternalId 또는 OIDC를 사용해야 한다.

## 실전 구현: Spoke 계정 Role 생성 자동화

```bash
# Spoke(Prod) 계정에서 실행
TOOLING_ACCOUNT_ID="111111111111"
PIPELINE_NAME="checkout-pipeline"

# 1. CrossAccountDeployRole 생성
aws iam create-role \
  --role-name CrossAccountDeployRole \
  --assume-role-policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Principal\": {
        \"AWS\": \"arn:aws:iam::${TOOLING_ACCOUNT_ID}:role/CodePipelineServiceRole\"
      },
      \"Action\": \"sts:AssumeRole\",
      \"Condition\": {
        \"StringEquals\": {
          \"aws:PrincipalTag/Pipeline\": \"${PIPELINE_NAME}\"
        }
      }
    }]
  }"

# 2. Permission Policy 첨부 (최소 권한: CFN API만)
aws iam put-role-policy \
  --role-name CrossAccountDeployRole \
  --policy-name CrossAccountDeployPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "cloudformation:CreateStack",
          "cloudformation:UpdateStack",
          "cloudformation:DeleteStack",
          "cloudformation:DescribeStacks",
          "cloudformation:CreateChangeSet",
          "cloudformation:ExecuteChangeSet",
          "cloudformation:DescribeChangeSet"
        ],
        "Resource": "arn:aws:cloudformation:ap-northeast-2:*:stack/checkout-*/*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ],
        "Resource": "arn:aws:s3:::tooling-artifacts-bucket/*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "kms:Decrypt",
          "kms:DescribeKey"
        ],
        "Resource": "arn:aws:kms:ap-northeast-2:111111111111:key/KMS-KEY-ID"
      },
      {
        "Effect": "Allow",
        "Action": "iam:PassRole",
        "Resource": "arn:aws:iam::*:role/CloudFormationExecutionRole",
        "Condition": {
          "StringEquals": {
            "iam:PassedToService": "cloudformation.amazonaws.com"
          }
        }
      }
    ]
  }'
```

`iam:PassRole`에 `iam:PassedToService` 조건이 있는 이유: CrossAccountDeployRole이 임의의 서비스에 Role을 Pass하는 것을 막는다. CloudFormation에만 Role을 넘길 수 있도록 제한한다. 이 조건이 없으면 Role을 EC2, Lambda 등 다른 서비스에 Pass해 권한을 확장하는 공격이 가능하다.

> 🎯 **시나리오**: 한 금융 회사가 "파이프라인이 Prod 계정에 배포할 수 있는데, 배포 과정에서 IAM User를 생성하거나 S3 Block Public Access를 해제하는 것을 원천 차단해야 한다"는 보안 요구사항이 있다. 두 레이어를 모두 사용해야 한다. 첫째, CrossAccountDeployRole의 Permission Policy와 CloudFormationExecutionRole의 Permission Policy에서 해당 권한을 배제한다. 둘째(더 강력한 방어), Prod 계정 OU에 SCP로 `DenyCreateIAMUser`와 `DenyS3PublicAccess`를 적용한다. Permission Policy는 Role 담당자가 실수로 권한을 추가할 수 있지만, SCP는 계정 단위로 적용되어 어떤 Role도, 심지어 계정 루트도 이를 우회할 수 없다. 규정 감사에서 "이 계정에서 IAM User를 생성하는 것이 기술적으로 불가능한가?"라고 물을 때, IAM Policy만으로는 "불가능"을 증명하기 어렵지만 SCP가 있으면 명확하게 증명할 수 있다.

## 비교: AWS CodePipeline vs 다른 CI/CD의 Cross-Account 방식

| 특성 | CodePipeline | Jenkins | GitHub Actions |
|------|-------------|---------|----------------|
| **Cross-Account 인증** | IAM AssumeRole (네이티브) | Credentials Plugin + 수동 설정 | OIDC Provider + AssumeRole |
| **Artifact 격리** | S3 + KMS CMK (자동) | 공유 워크스페이스 (직접 관리) | Actions Cache (공유) |
| **권한 체인** | Service Role → Action Role (명시적) | 서버 자체 자격 증명 | GitHub App Token → AWS Role |
| **감사 추적** | CloudTrail (자동) | 젠킨스 로그 (직접 보관) | GitHub Actions 로그 + CloudTrail |
| **Confused Deputy 방어** | aws:SourceArn, PrincipalTag | External ID (수동 구성) | OIDC sub claim 조건 |
| **멀티 리전** | ArtifactStores 설정으로 네이티브 지원 | 플러그인 + 수동 구성 | matrix strategy |

GitHub Actions의 OIDC 방식은 주목할 만하다. GitHub은 OIDC(OpenID Connect) Provider로 동작하고, AWS는 이 Provider를 신뢰하도록 설정한다. GitHub Actions 워크플로우가 실행될 때 GitHub은 JWT 토큰을 발급하고, AWS STS는 이 토큰을 검증해 IAM Role로 교환한다. 장기 자격증명(Access Key) 없이 AssumeRole이 가능한 구조다.

> 📚 **사례**: Netflix의 멀티 계정 배포 아키텍처. Netflix는 100개 이상의 AWS 계정을 운영하면서 Spinnaker(오픈소스 CD 도구)를 Tooling 계정에서 실행한다. 각 Spoke 계정에 SpinnakerDeployRole을 두고 Trust Policy에 Spinnaker의 IAM Role ARN을 명시한다. Netflix가 CodePipeline 대신 Spinnaker를 선택한 이유는 멀티 클라우드 지원과 정교한 Canary 분석(Kayenta) 때문이었다. 그러나 IAM Cross-Account 패턴 자체는 CodePipeline과 동일하다—AssumeRole, S3 버킷 정책, KMS Key Policy의 4종 체인이 필요하다. 도구가 달라도 AWS의 Cross-Account 메커니즘은 동일하게 적용된다.

## 정리하며

Cross-Account 파이프라인의 핵심은 **4종 권한 체인의 완전한 구성**이다. Tooling 계정의 Pipeline Service Role이 AssumeRole할 수 있어야 하고(1번), Spoke 계정의 Trust Policy가 이를 허용해야 하며(2번), S3 버킷 정책(3번)과 KMS Key Policy(4번) 모두에 Spoke 계정 Role이 명시되어야 한다. 이 4종 중 하나라도 빠지면 배포가 실패한다. 가장 자주 빠지는 것이 KMS Key Policy다—S3 접근은 성공하지만 암호화된 Artifact 복호화에서 실패한다.

CloudFormation Deploy Action에는 두 Role이 등장한다. Action의 `roleArn`(CrossAccountDeployRole)은 CFN API를 호출하는 주체이고, Configuration의 `RoleArn`(CloudFormationExecutionRole)은 실제 리소스를 생성하는 주체다. 이 분리가 최소 권한 원칙을 실현한다.

StackSets(SERVICE_MANAGED + OrganizationsAutoDeployment)와 CodePipeline 통합으로 전체 Organization의 Baseline을 자동 배포할 수 있다. 멀티 리전 배포는 KMS의 리전 범위 특성 때문에 각 리전에 독립된 S3 버킷과 KMS 키가 필요하다. Confused Deputy 방어는 내부 시스템에 `aws:SourceArn`/`aws:PrincipalTag`, 외부 서드파티에 `sts:ExternalId`/OIDC를 사용한다.

---

## 📝 연습 문제

**문제 1.** Tooling 계정의 CodePipeline이 Prod 계정에 CloudFormation 스택을 배포한다. "CloudFormation API 호출은 성공하지만 스택 내 ECS Task Definition 생성이 실패한다"는 문제의 원인으로 가장 가능성 높은 것은?

A) CrossAccountDeployRole에 CloudFormation API 권한 부족  
B) CloudFormationExecutionRole에 ECS Task Definition 생성 권한(ecs:RegisterTaskDefinition, iam:PassRole) 부족  
C) KMS 복호화 실패  
D) S3 버킷 정책 오류  

**정답: B**  
해설: CloudFormation API 호출은 CrossAccountDeployRole이 담당하고, 실제 리소스 생성은 CloudFormationExecutionRole이 담당한다. CloudFormation API가 성공했다는 것은 CrossAccountDeployRole의 권한은 충분하다는 뜻이다. 스택 내 리소스 생성 실패는 CloudFormationExecutionRole에 해당 리소스(ECS Task Definition, 필요한 경우 iam:PassRole)를 생성할 권한이 없기 때문이다. 두 Role의 역할 분리를 명확히 이해해야 한다.

---

**문제 2.** StackSets의 OrganizationsAutoDeployment 옵션의 정확한 기능은?

A) 새 StackSet 인스턴스가 생성될 때 자동으로 배포를 시작한다  
B) 지정된 OU에 새 멤버 계정이 추가되면 자동으로 StackSet 인스턴스를 그 계정에 생성한다  
C) CloudFormation 스택 드리프트를 자동으로 복구한다  
D) SCP를 자동으로 적용한다  

**정답: B**  
해설: OrganizationsAutoDeployment는 OU 멤버십 변화(계정 추가)를 감지해 자동으로 StackSet 인스턴스를 생성하는 기능이다. Landing Zone 자동화의 핵심이다. 반대로 계정이 OU에서 제거되면 StackSet 인스턴스를 자동 삭제하는 옵션도 있다. 드리프트 복구(C)는 StackSets의 기능이 아니고, SCP 적용(D)은 Organizations의 별도 기능이다. SERVICE_MANAGED 모드에서만 사용 가능하고 SELF_MANAGED 모드에서는 이 옵션이 없다.

---

**문제 3.** 멀티 리전 CodePipeline에서 각 리전에 별도 Artifact S3 버킷과 KMS 키가 필요한 이유는?

A) 비용 분산을 위해  
B) KMS 키는 리전 범위 서비스이므로 다른 리전의 KMS 키로 암호화된 Artifact를 복호화할 수 없다  
C) S3 버킷은 글로벌이라서 필요 없지만 KMS는 리전별로 필요하다  
D) CodePipeline 서비스 제한으로 단일 S3 버킷은 여러 리전에서 사용 불가  

**정답: B**  
해설: KMS 키는 리전 범위 서비스다. 서울(ap-northeast-2) KMS 키로 암호화한 Artifact는 반드시 서울 KMS 키로만 복호화할 수 있다. 버지니아(us-east-1)의 CodeBuild가 서울 S3의 Artifact를 가져와도 복호화 API 호출은 서울 KMS 엔드포인트에 해야 한다. 이 레이턴시와 비용을 피하려면 각 리전에 S3 버킷과 KMS 키를 두는 것이 표준이다. S3는 리전 서비스지만 Cross-Region 읽기는 가능하다—그래서 기술적으로는 단일 S3 버킷도 가능하지만 KMS 레이턴시 문제로 각 리전 버킷을 권장한다.

---

**문제 4.** 여러 팀의 파이프라인이 단일 Pipeline Service Role을 공유한다. 팀 A의 파이프라인이 팀 B의 Prod 계정 Role을 AssumeRole하는 것을 방지하려면?

A) 팀별로 별도 Pipeline Service Role을 생성한다  
B) Spoke 계정의 Trust Policy에 PrincipalTag 조건을 추가해 특정 파이프라인 태그가 있는 경우에만 AssumeRole을 허용한다  
C) VPC 엔드포인트로 접근을 제한한다  
D) S3 버킷을 팀별로 분리한다  

**정답: B**  
해설: 두 방법 모두 유효하지만 B가 더 실용적이다. A(별도 Service Role)는 파이프라인이 많을수록 관리 부담이 증가한다. B의 PrincipalTag 방식은 단일 Service Role을 유지하면서 파이프라인별로 세분화된 접근 제어가 가능하다. Pipeline Service Role에 `Pipeline=teamA-checkout` 태그를 붙이고 Spoke의 Trust Policy에 `aws:PrincipalTag/Pipeline`을 조건으로 넣으면, 태그가 다른 파이프라인은 해당 Spoke Role을 AssumeRole할 수 없다.

---

**문제 5.** CloudFormation 스택에서 명시적 이름이 있는 IAM Role을 생성하려 한다. CodePipeline Action Configuration에 추가해야 하는 설정은?

A) `Capabilities: CAPABILITY_IAM`  
B) `Capabilities: CAPABILITY_NAMED_IAM`  
C) `Capabilities: CAPABILITY_AUTO_EXPAND`  
D) 별도 설정 불필요  

**정답: B**  
해설: CloudFormation이 명시적 이름이 있는 IAM 리소스(예: `RoleName: MySpecificRole`)를 생성할 때는 `CAPABILITY_NAMED_IAM`이 필요하다. 이름이 없는(자동 생성 이름) IAM 리소스는 `CAPABILITY_IAM`만으로 충분하다. `CAPABILITY_AUTO_EXPAND`는 nested stack이나 SAM Transform을 사용할 때 필요하다. 이 Capability를 누락하면 `InsufficientCapabilitiesException`이 발생하고 스택 배포가 실패한다. 실무에서는 보통 `CAPABILITY_IAM,CAPABILITY_NAMED_IAM`을 모두 넣어 둔다.

---

**문제 6.** Cross-Account 배포에서 외부 서드파티 CI/CD 시스템이 Spoke 계정 Role을 AssumeRole하는 Trust Policy에 Confused Deputy 방어를 위해 추가해야 하는 조건은?

A) aws:PrincipalTag  
B) sts:ExternalId  
C) aws:SourceIp  
D) aws:RequestedRegion  

**정답: B**  
해설: 서드파티 CI/CD(외부 시스템)가 Spoke 계정 Role을 AssumeRole하는 패턴에서 Confused Deputy 방어의 표준은 ExternalId다. ExternalId는 서드파티 시스템과 사전 합의한 비밀 값으로, Role을 AssumeRole할 때 이 값을 제공해야만 허용된다. 내부 멀티팀 환경에서는 PrincipalTag(A)가 더 적합하지만, 외부 시스템이 Principal인 경우 PrincipalTag를 강제하기 어렵다. aws:SourceIp(C)는 IP 주소 기반 제한으로 CI 서버 IP가 변하면 깨진다. OIDC를 지원하는 외부 CI(GitHub Actions)는 sub claim 조건이 ExternalId보다 더 강력하다.

---

**문제 7.** CloudFormation StackSet의 `MaxConcurrentPercentage: 50`과 `FailureTolerancePercentage: 20`이 100개 계정에 적용될 때의 동작은?

A) 전체를 50개씩 두 번 배포하고, 실패 계정이 20%를 초과하면 즉시 전체 중단한다  
B) 동시에 50개 계정에 배포하고, 최대 20개 계정이 실패해도 나머지 계정에 계속 배포한다  
C) 20개 계정에 먼저 배포 후 50개로 확대한다  
D) 50개 완료 시 수동 승인을 요청한다  

**정답: B**  
해설: MaxConcurrentPercentage는 동시에 배포하는 계정의 비율(속도 제어), FailureTolerancePercentage는 얼마나 많은 계정이 실패해도 계속 진행할지의 허용치(안정성 제어)다. 100개 계정에서: 동시에 50개 계정에 배포 시작, 20개 계정(20%)이 실패해도 나머지 계정에 계속 배포, 21개 계정이 실패하면 배포를 중단하고 실패로 표시. 두 파라미터는 독립적으로 작동한다—MaxConcurrentPercentage는 "얼마나 빠르게", FailureTolerancePercentage는 "얼마나 관대하게"를 제어한다.
