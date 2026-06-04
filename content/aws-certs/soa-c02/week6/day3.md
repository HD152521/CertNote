# Day 3 - Nested Stack, Cross-Stack Reference, StackSets: 대규모 IaC 운영

Amazon 내부에서는 2000년대 중반 "두 피자 팀"(Two-Pizza Team) 원칙이 나왔다. 팀 규모는 피자 두 판을 먹을 수 있는 인원(5~8명)으로 제한하고, 각 팀은 독립적으로 서비스를 소유하고 배포한다. 이 원칙이 마이크로서비스 아키텍처의 씨앗이 됐다.

CloudFormation에서도 같은 고민이 있다. 수천 줄짜리 단일 Template는 "한 팀이 전부 소유하고 이해하는" 범위를 넘어선다. 팀 경계에 따라 IaC를 분리하고, 팀 간에 필요한 정보를 안전하게 공유하며, 조직 전체에 표준을 배포하는 방법이 필요하다. Nested Stack, Cross-Stack Reference, StackSets가 이 문제를 해결한다. 이 세 가지는 각각 "하나의 애플리케이션 내 모듈화", "팀 간 리소스 공유", "조직 전체 표준 배포"라는 서로 다른 규모의 문제를 다룬다.

## Nested Stack: "레고 블록처럼 조합하는 인프라"

Nested Stack은 하나의 Stack 안에 다른 Stack을 리소스(`AWS::CloudFormation::Stack`)로 포함하는 패턴이다. 큰 Template를 작은 컴포넌트로 분리해 재사용성을 높이고, 각 컴포넌트의 변경 영향 범위를 제한한다.

**Nested Stack의 기술적 동작:**

부모 Stack이 `AWS::CloudFormation::Stack` 타입의 리소스를 생성하면, CloudFormation은 해당 S3 URL의 Template를 가져와 별도의 Stack을 생성한다. 부모와 자식 Stack은 별도의 Stack ID를 갖지만, 부모의 라이프사이클에 종속된다. 부모 Stack이 삭제되면 자식 Stack이 역순(의존성의 반대)으로 삭제된다.

**계층 구조 설계 예시:**

```
Root Stack (parent.yaml)
├── NetworkStack (network.yaml) - VPC, Subnet, IGW, NAT, RouteTables
│   └── Outputs: VpcId, PublicSubnetIds, PrivateSubnetIds, NatGwEips
│
├── SecurityStack (security.yaml) - Security Groups 표준 세트
│   └── Outputs: WebSgId, AppSgId, DbSgId
│
├── DatabaseStack (database.yaml) - RDS, ElastiCache
│   └── Inputs: VpcId, PrivateSubnetIds, DbSgId
│   └── Outputs: DbEndpoint, CacheEndpoint
│
└── AppStack (app.yaml) - ALB, ECS, Auto Scaling
    └── Inputs: VpcId, PublicSubnetIds, WebSgId, AppSgId, DbEndpoint
```

**실전 부모 Template:**

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Root Stack - Production Web Application

Parameters:
  TemplateBucket:
    Type: String
    Default: my-cfn-templates-123456789012

Resources:
  NetworkStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: !Sub 'https://s3.${AWS::URLSuffix}/${TemplateBucket}/network.yaml'
      Parameters:
        VpcCidr: 10.0.0.0/16
        Environment: prod
      TimeoutInMinutes: 20
      Tags:
        - Key: Component
          Value: Network

  SecurityStack:
    Type: AWS::CloudFormation::Stack
    DependsOn: NetworkStack      # !GetAtt로 의존성 표현되므로 사실 불필요하지만 명확성 위해
    Properties:
      TemplateURL: !Sub 'https://s3.${AWS::URLSuffix}/${TemplateBucket}/security.yaml'
      Parameters:
        VpcId: !GetAtt NetworkStack.Outputs.VpcId

  DatabaseStack:
    Type: AWS::CloudFormation::Stack
    DeletionPolicy: Retain       # 자식 Stack의 RDS가 실수 삭제되지 않도록
    Properties:
      TemplateURL: !Sub 'https://s3.${AWS::URLSuffix}/${TemplateBucket}/database.yaml'
      Parameters:
        VpcId: !GetAtt NetworkStack.Outputs.VpcId
        SubnetIds: !GetAtt NetworkStack.Outputs.PrivateSubnetIds
        DbSgId: !GetAtt SecurityStack.Outputs.DbSgId

  AppStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: !Sub 'https://s3.${AWS::URLSuffix}/${TemplateBucket}/app.yaml'
      Parameters:
        VpcId: !GetAtt NetworkStack.Outputs.VpcId
        PublicSubnetIds: !GetAtt NetworkStack.Outputs.PublicSubnetIds
        WebSgId: !GetAtt SecurityStack.Outputs.WebSgId
        DbEndpoint: !GetAtt DatabaseStack.Outputs.DbEndpoint

# 부모가 자식 Output에 접근해 외부로 노출
Outputs:
  AppUrl:
    Value: !GetAtt AppStack.Outputs.AlbDnsName
```

**Template 크기 한도:**

| 방식 | 한도 |
|------|------|
| `--template-body` (직접 업로드) | 51,200 bytes (50KB) |
| `--template-url` (S3 URL) | 1 MB |
| S3 파일 자체 | 최대 1 MB |

Template가 1 MB를 초과하면 Nested Stack으로 분리하거나 CDK로 생성한다.

```bash
# Template를 S3에 업로드하고 URL 사용
aws s3 sync ./templates/ s3://my-cfn-templates-123456789012/

aws cloudformation create-stack \
  --stack-name webapp-root \
  --template-url "https://s3.ap-northeast-2.amazonaws.com/my-cfn-templates-123456789012/parent.yaml" \
  --parameters ParameterKey=TemplateBucket,ParameterValue=my-cfn-templates-123456789012 \
  --capabilities CAPABILITY_NAMED_IAM

# 자식 Stack 직접 업데이트 (부모 없이)
aws cloudformation update-stack \
  --stack-name webapp-root-NetworkStack-XXXX \
  --template-url "https://s3.ap-northeast-2.amazonaws.com/my-cfn-templates-123456789012/network.yaml" \
  --parameters ParameterKey=VpcCidr,ParameterValue=10.0.0.0/16
```

> 💡 **관련 이론**: Nested Stack은 소프트웨어 공학의 "모듈화"(Modularization) 원칙을 인프라에 적용한 것이다. David Parnas가 1972년 논문 "On the Criteria To Be Used in Decomposing Systems into Modules"에서 정의한 "변경이 일어날 가능성이 높은 부분을 한 모듈에 숨긴다"는 원칙이 핵심이다. 네트워크 팀이 VPC CIDR을 변경해도 애플리케이션 팀의 Template에 영향을 주지 않도록, 변경 범위를 NetworkStack 안으로 캡슐화하는 것이다. 이는 객체지향의 정보 은닉(Information Hiding)과 동일한 개념이다. Nested Stack의 `Outputs`는 외부에 공개할 인터페이스이고, 내부 구현(서브넷 분할 방식, NAT GW 개수)은 숨긴다.

> 🔍 **더 깊이**: Nested Stack의 부모-자식 관계는 의존성 역전 없이 **직접적인 계층 구조**다. 부모가 자식의 Outputs에 접근하는 구조이므로, 자식 Stack의 Output 이름을 변경하면 부모 Template도 수정해야 한다. 이를 방지하려면 자식 Stack의 Output 이름을 "안정적인 인터페이스"로 정의하고 가급적 변경하지 않아야 한다. 실제 배포에서는 S3에 버전 디렉터리를 두는 패턴을 사용한다: `s3://my-bucket/templates/v1.2.0/network.yaml`. 이렇게 하면 Blue-Green 방식으로 새 버전 Template를 배포 전에 S3에 올려두고, 테스트 후 부모 Stack만 업데이트해 전환할 수 있다.

> ⚠️ **함정**: Nested Stack의 `DeletionPolicy`는 Stack 자체에 적용되는 것이 아니라 자식 Stack 내 리소스에 적용된다. 즉, `DatabaseStack` 리소스에 `DeletionPolicy: Retain`을 설정해도 자식 Stack 자체가 보존되는 것이지, 자식 Stack 내부 리소스(RDS, ElastiCache)가 자동으로 보존되는 것이 아니다. 자식 Stack 내부의 RDS를 보호하려면 자식 Template의 RDS 리소스에도 별도로 `DeletionPolicy: Snapshot`을 설정해야 한다.

## Cross-Stack Reference: "독립적이지만 연결된"

Cross-Stack Reference는 완전히 독립된 Stack들 사이에서 값을 공유하는 방식이다. Nested Stack과 달리 부모-자식 관계가 없고, 각 Stack이 독립적으로 생성/업데이트/삭제된다. 팀 경계를 넘나드는 리소스 공유에 적합하다.

**Export/Import 메커니즘:**

```yaml
# Stack A (network-stack): VPC 생성 후 Export
Outputs:
  VpcId:
    Value: !Ref MyVpc
    Description: Shared VPC ID for all application stacks
    Export:
      Name: !Sub '${AWS::StackName}-VpcId'  # → network-stack-VpcId

  PrivateSubnetIds:
    Value: !Join [',', [!Ref PrivateSubnetA, !Ref PrivateSubnetB, !Ref PrivateSubnetC]]
    Export:
      Name: !Sub '${AWS::StackName}-PrivateSubnetIds'
    # → network-stack-PrivateSubnetIds = "subnet-aaa,subnet-bbb,subnet-ccc"

  DbSubnetGroupName:
    Value: !Ref DbSubnetGroup
    Export:
      Name: !Sub '${AWS::StackName}-DbSubnetGroupName'
```

```yaml
# Stack B (web-app-stack): network-stack의 Export 가져오기
Resources:
  WebServer:
    Type: AWS::EC2::Instance
    Properties:
      # 쉼표 구분 목록에서 첫 번째 서브넷 선택
      SubnetId: !Select [0, !Split [',', !ImportValue 'network-stack-PrivateSubnetIds']]

  AppDatabase:
    Type: AWS::RDS::DBInstance
    Properties:
      DBSubnetGroupName: !ImportValue 'network-stack-DbSubnetGroupName'
      VpcSecurityGroupIds:
        - !ImportValue 'security-stack-DbSgId'
```

**Cross-Stack의 핵심 제약과 운영 영향:**

| 제약 | 영향 |
|------|------|
| Export name은 계정+리전 단위로 유일해야 함 | 네이밍 규칙 필요 (`stackname-exportname` 패턴 권장) |
| Import 사용 중인 Export는 값 변경 불가 | Stack B가 살아있는 한 Stack A에서 해당 Output 값 변경 불가 |
| Import 사용 중인 Stack A를 삭제 불가 | Stack B를 먼저 수정(ImportValue 제거)해야 Stack A 삭제 가능 |
| `!ImportValue`는 다른 함수와 중첩 불가 | `!Sub '${!ImportValue ...}'` 불가, 중간 변수 없음 |
| 같은 Template 내 `!If`와 `!ImportValue` 중첩 불가 | 조건부 Import 불가 |

```bash
# 어떤 Stack들이 특정 Export를 사용하는지 확인
aws cloudformation list-imports \
  --export-name "network-stack-VpcId"

# 모든 Export 목록 조회
aws cloudformation list-exports \
  --query 'Exports[*].[Name,ExportingStackId,Value]' \
  --output table

# Export 변경이 필요한 경우: 먼저 Import 중인 Stack 파악
IMPORTERS=$(aws cloudformation list-imports \
  --export-name "network-stack-VpcId" \
  --query 'Imports[]' --output text)
echo "이 Export를 사용하는 Stack: $IMPORTERS"
# 이 Stack들을 먼저 수정해야 network-stack의 VpcId Export를 변경할 수 있다
```

> 🔍 **더 깊이**: Cross-Stack의 "Import 사용 중인 Export 변경 불가" 제약은 분산 시스템의 "breaking change" 문제와 동일하다. API 서버가 클라이언트가 사용 중인 엔드포인트를 변경하지 못하는 것과 같다. 이를 우회하는 방법은 **"버전이 있는 Export 이름" 패턴**이다. `network-stack-VpcId-v1`, `network-stack-VpcId-v2`처럼 버전을 붙이면, 마이그레이션 기간 동안 두 버전을 동시에 Export하고 Consumer Stack들이 새 버전으로 이전한 후 구 버전을 삭제할 수 있다. 이 패턴은 API 버전 관리에서 "Sunset Date" 방식과 동일하다: 새 버전을 공개하고, 구 버전 사용자에게 이전 기간을 주고, 기간 후 구 버전 삭제.

**Nested Stack vs Cross-Stack 선택 기준:**

| 상황 | 권장 방식 | 이유 |
|------|-----------|------|
| 하나의 애플리케이션을 컴포넌트로 분리 | Nested Stack | 단일 배포 단위, 부모가 전체 조율 |
| 여러 팀이 공유하는 인프라(VPC, IAM 등) | Cross-Stack Reference | 각 팀 Stack이 독립적 라이프사이클 |
| 라이프사이클이 다른 리소스 분리 | Cross-Stack Reference | VPC(영구) vs 앱(주기적 배포) |
| 재사용 가능한 표준 컴포넌트 라이브러리 | Nested Stack (S3 공용 Template) | 단일 Template 소스, 재사용 용이 |
| 배포 팀이 여럿이고 독립적으로 릴리스 | Cross-Stack Reference | Stack 간 결합도 최소화 |

## StackSets: "조직 전체에 한 번에"

StackSets는 하나의 Template를 여러 AWS 계정의 여러 리전에 동시에 배포한다. Landing Zone, 보안 Baseline, 모니터링 표준화 같은 조직 전체 표준을 구현할 때 핵심 도구다.

**StackSets 아키텍처:**

```
관리 계정(Management Account)
    │
    └── StackSet "OrgSecurityBaseline"
            │ (한 Template, 여러 대상)
            │
    ┌───────┼───────┬──────────┐
    ▼       ▼       ▼          ▼
 계정A     계정B   계정C    계정D
 (서울,    (서울,  (서울만) (서울,
  버지니아) 버지니아)        버지니아,
                             도쿄)
    │
    └── Stack Instance (각 계정+리전 조합에 하나씩)
        계정A/서울: Stack Instance 1
        계정A/버지니아: Stack Instance 2
        ...
```

**권한 모델: Self-Managed vs Service-Managed**

| 특성 | Self-Managed | Service-Managed |
|------|--------------|-----------------|
| 설정 | Administration/ExecutionRole 수동 생성 | Organizations Trusted Access 활성화만 |
| 대상 | 임의 계정 ID 지정 | Organizations OU 지정 |
| Auto-deployment | 없음 | 새 계정 자동 포함 가능 |
| 권장 사용 | Organizations 미사용 환경 | Organizations 환경 (강력 권장) |

**Self-Managed Permissions:**

```bash
# 1. 관리 계정에 AdministrationRole 생성
aws iam create-role \
  --role-name AWSCloudFormationStackSetAdministrationRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "cloudformation.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# 2. AdministrationRole에 권한 부여 (ExecutionRole Assume)
aws iam attach-role-policy \
  --role-name AWSCloudFormationStackSetAdministrationRole \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# 3. 각 Target 계정에 ExecutionRole 생성
# (관리 계정의 AdministrationRole이 이 Role을 Assume)
aws iam create-role \
  --role-name AWSCloudFormationStackSetExecutionRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::MANAGEMENT_ACCOUNT_ID:root"},
      "Action": "sts:AssumeRole"
    }]
  }'
```

**Service-Managed Permissions (Organizations 통합, 권장):**

```bash
# Organizations에서 StackSets Trusted Access 활성화 (관리 계정에서 한 번만)
aws organizations enable-aws-service-access \
  --service-principal stacksets.cloudformation.amazonaws.com

# StackSet 생성 (SERVICE_MANAGED)
aws cloudformation create-stack-set \
  --stack-set-name "OrgSecurityBaseline" \
  --template-body file://security-baseline.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment 'Enabled=true,RetainStacksOnAccountRemoval=false' \
  --capabilities CAPABILITY_NAMED_IAM \
  --description "Org-wide: CloudTrail, GuardDuty, Config, SecurityHub"
```

`AutoDeployment=true`가 핵심이다. 새 AWS 계정이 OU에 추가되면 자동으로 Stack Instance가 생성된다. `RetainStacksOnAccountRemoval=false`이면 계정이 OU에서 제거될 때 Stack Instance도 삭제된다.

**Stack Instance 배포:**

```bash
# OU 전체에 배포 (멀티 리전, 병렬)
aws cloudformation create-stack-instances \
  --stack-set-name "OrgSecurityBaseline" \
  --deployment-targets '{
    "OrganizationalUnitIds": ["ou-root-abc123", "ou-workloads-xyz456"]
  }' \
  --regions ap-northeast-2 us-east-1 eu-west-1 \
  --operation-preferences '{
    "RegionConcurrencyType": "PARALLEL",
    "MaxConcurrentPercentage": 25,
    "FailureTolerancePercentage": 10
  }'

# 특정 계정만 제외하여 배포
aws cloudformation create-stack-instances \
  --stack-set-name "OrgSecurityBaseline" \
  --deployment-targets '{
    "OrganizationalUnitIds": ["ou-workloads-xyz"],
    "AccountFilterType": "DIFFERENCE",
    "Accounts": ["111122223333"]
  }' \
  --regions ap-northeast-2

# StackSet 업데이트 (모든 Stack Instance에 새 Template 적용)
aws cloudformation update-stack-set \
  --stack-set-name "OrgSecurityBaseline" \
  --template-body file://security-baseline-v2.yaml \
  --operation-preferences '{
    "MaxConcurrentPercentage": 10,
    "FailureTolerancePercentage": 5,
    "RegionOrder": ["ap-northeast-2", "us-east-1", "eu-west-1"]
  }'
```

**Operation Preferences 옵션:**

| 옵션 | 설명 | 권장값 |
|------|------|--------|
| `MaxConcurrentCount` | 동시 실행 계정 수 (절대값) | 10~20 |
| `MaxConcurrentPercentage` | 동시 실행 계정 비율 | 10~25% |
| `FailureToleranceCount` | 허용 실패 계정 수 | 계정 수의 10% |
| `FailureTolerancePercentage` | 허용 실패 비율 | 5~10% |
| `RegionConcurrencyType` | 리전 배포 방식 | `SEQUENTIAL` (안전) 또는 `PARALLEL` (빠름) |
| `RegionOrder` | 리전 배포 순서 | 먼저 시범 리전, 후에 주요 리전 |

> 📚 **사례**: 2022년 핀테크 H사가 AWS Organizations로 계정 구조를 개편하면서 StackSets로 "조직 보안 기준선"을 구축했다. 내용은 CloudTrail(모든 API 로깅), Config(기본 규칙 세트), GuardDuty(위협 감지), SecurityHub(통합 보안 대시보드)를 모든 계정에 자동 배포하는 것이었다. Organizations + Service-Managed StackSets + AutoDeployment=true 조합으로, 신규 AWS 계정이 생성되는 즉시 보안 Baseline이 자동 적용됐다. 이전에는 새 계정 보안 설정에 수동으로 1~2일이 소요됐던 것이 0분으로 줄었다. SOC2 Type II 감사에서 "모든 계정에 동일한 보안 통제가 적용됨"을 StackSets 운영 기록으로 증명했다.

**StackSet 운영 관리:**

```bash
# Stack Instance 상태 조회
aws cloudformation list-stack-instances \
  --stack-set-name "OrgSecurityBaseline" \
  --query 'Summaries[*].[Account,Region,Status,StatusReason]' \
  --output table

# Stack Instance 상태 의미:
# CURRENT: 최신 StackSet과 동기화됨
# OUTDATED: StackSet이 업데이트됐지만 이 Instance는 아직 미적용
# INOPERABLE: 복구 불가 상태 (수동 정리 필요)

# StackSet Drift Detection (전체 Stack Instance 동시)
aws cloudformation detect-stack-set-drift \
  --stack-set-name "OrgSecurityBaseline" \
  --operation-preferences 'MaxConcurrentPercentage=10'

# 실패한 Stack Instance만 재시도
aws cloudformation update-stack-instances \
  --stack-set-name "OrgSecurityBaseline" \
  --deployment-targets 'Accounts=["111122223333"]' \
  --regions ap-northeast-2 \
  --operation-preferences 'MaxConcurrentCount=1,FailureToleranceCount=0'

# StackSet 삭제 순서: Stack Instance 먼저 삭제 후 StackSet 삭제
aws cloudformation delete-stack-instances \
  --stack-set-name "OrgSecurityBaseline" \
  --deployment-targets 'OrganizationalUnitIds=["ou-workloads-xyz"]' \
  --regions ap-northeast-2 us-east-1 \
  --no-retain-stacks  # Stack Instance의 실제 Stack도 삭제

aws cloudformation delete-stack-set \
  --stack-set-name "OrgSecurityBaseline"
# 오류: Stack Instance가 남아있으면 삭제 불가
```

## DependsOn: 명시적 의존 관계

CFn은 `!Ref`나 `!GetAtt`로 의존 관계를 자동으로 감지한다. 하지만 논리적으로는 A가 B 이후에 생성되어야 하지만 코드상 참조가 없는 경우 `DependsOn`을 사용한다.

```yaml
# VPC Endpoint가 생성된 후에 EC2 인스턴스 생성
# (EC2가 SSM과 통신하려면 VPC Endpoint가 먼저 있어야 함)
WebServer:
  Type: AWS::EC2::Instance
  DependsOn:
    - S3GatewayEndpoint
    - SSMInterfaceEndpoint
  Properties:
    ImageId: !Ref AmiId
    SubnetId: !Ref PrivateSubnet

S3GatewayEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    ServiceName: !Sub 'com.amazonaws.${AWS::Region}.s3'
    VpcId: !Ref MyVpc
    RouteTableIds: [!Ref PrivateRouteTable]

SSMInterfaceEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    ServiceName: !Sub 'com.amazonaws.${AWS::Region}.ssm'
    VpcId: !Ref MyVpc
    VpcEndpointType: Interface
    SubnetIds: [!Ref PrivateSubnet]
    PrivateDnsEnabled: true
```

> ⚠️ **함정**: `DependsOn`을 남용하면 병렬 생성이 직렬화되어 Stack 생성 시간이 늘어난다. CloudFormation은 의존 관계가 없는 리소스들을 기본적으로 병렬로 생성한다. 불필요한 `DependsOn`은 이 병렬성을 깨뜨린다. `!Ref`나 `!GetAtt`로 표현 가능한 의존성은 `DependsOn`이 불필요하다. 예를 들어 `SecurityGroup` ID를 `!GetAtt SG.GroupId`로 참조하면 CFn이 자동으로 SG 생성 후 EC2를 생성한다. 그 위에 `DependsOn: SG`를 추가로 쓰는 것은 중복이다.

## StackSets와 SCP 상호작용: 중요 운영 함정

Organizations에서 SCP(Service Control Policy)와 StackSets가 함께 사용될 때 주의해야 한다.

**시나리오:** SCP로 특정 리전에서 리소스 생성을 금지했는데(`aws:RequestedRegion` 조건), StackSets가 그 리전에 배포를 시도하면?

답: StackSets가 ExecutionRole을 Assume해도 SCP의 제한이 적용된다. SCP는 계정 루트에서 모든 IAM 엔티티에 적용되므로, ExecutionRole을 통한 CloudFormation 작업도 SCP의 영향을 받는다. Stack Instance 생성이 실패하고 `FailureTolerancePercentage`에 따라 전체 배포가 중단될 수 있다.

**SCP + StackSets 안전 체크리스트:**

```bash
# 배포 전: 대상 리전이 SCP에서 허용되는지 확인
# SCP에서 ap-northeast-2가 허용되는지 시뮬레이션
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::TARGET_ACCOUNT_ID:role/AWSCloudFormationStackSetExecutionRole \
  --action-names cloudformation:CreateStack \
  --resource-arns "*" \
  --context-entries 'ContextKeyName=aws:RequestedRegion,ContextKeyValues=["ap-northeast-2"],ContextKeyType=string'
```

> 💡 **관련 이론**: SCP와 IAM 정책의 조합은 AWS 권한 평가의 "최소 교집합" 원칙을 따른다. 유효 권한 = (SCP가 Allow하는 것) ∩ (Permission Boundary가 Allow하는 것) ∩ (Identity Policy가 Allow하는 것). 이 구조는 집합론의 교집합(Intersection)으로, 어느 하나라도 Deny하면 최종 결과는 Deny다. StackSets 설계 시 배포 대상 리전과 작업이 SCP의 허용 범위 안에 있는지 사전에 시뮬레이션으로 확인하는 것이 필수다. AWS IAM Policy Simulator가 이 교집합 계산을 수행한다.

> 📚 **사례**: 2023년 금융기관 I사는 Organizations SCP로 ap-northeast-2(서울)와 us-east-1(버지니아) 이외 리전에서의 모든 리소스 생성을 금지했다. 이후 StackSets로 유럽 규제 요구사항을 충족하기 위해 eu-west-1(아일랜드) 배포를 시도했는데, SCP 제약으로 모든 Stack Instance 생성이 실패했다. 수백 개 계정에 배포 시도→실패가 반복되며 CloudTrail 이벤트가 폭발적으로 증가했다. 해결책: eu-west-1 사용이 필요한 계정들을 별도 OU로 분리하고, 해당 OU의 SCP에만 eu-west-1 허용 조건을 추가했다.

## CloudFormation Modules와 Registry: 조직 표준 타입

AWS CloudFormation Modules는 여러 리소스를 하나의 재사용 가능한 단위로 패키징하는 기능이다. 조직의 보안 표준을 모듈로 만들어 모든 팀이 `Type: MyOrg::Security::HardenedEC2`처럼 사용할 수 있게 한다.

```yaml
# 모듈 사용 예시 (사용자 정의 타입)
Resources:
  WebServer:
    Type: MyOrg::Security::HardenedEC2Instance  # 사용자 정의 모듈
    Properties:
      InstanceType: t3.medium
      SubnetId: !Ref PrivateSubnet
      # 내부적으로 IMDSv2 강제, CW Agent 설치, 표준 SG, 암호화 EBS 등이 자동 포함
```

모듈은 CloudFormation Registry에 등록하고, StackSets로 조직 전체 계정에 모듈을 배포한 후 각 팀이 사용한다. 이것이 "코드로 거버넌스"(Governance as Code)의 실현이다.

## 전체 그림: 언제 무엇을?

```
CloudFormation 패턴 선택 가이드
============================================================

Q1: 하나의 애플리케이션 인프라를 팀 내에서 모듈화하고 싶다
    └── Nested Stack (S3에 컴포넌트 Template 저장)
        ★ 부모가 전체 라이프사이클 통제

Q2: 여러 팀이 공유하는 리소스(VPC, IAM)를 공유하고 싶다
    └── Cross-Stack Reference (Outputs.Export / !ImportValue)
        ★ 각 Stack 독립적 라이프사이클, 느슨한 결합

Q3: 조직의 모든 계정에 보안/모니터링 표준을 배포하고 싶다
    └── StackSets (Service-Managed + Auto-deployment)
        ★ Organizations 통합, 신규 계정 자동 포함

Q4: 같은 패턴을 여러 팀이 표준 타입으로 쉽게 재사용하게 하고 싶다
    └── CFn Modules + Registry (타입 레지스트리)
        ★ 거버넌스 as Code

Q5: 개발자에게 표준 인프라를 자가 서비스로 제공하고 싶다
    └── Service Catalog (CFn Template를 제품화)
        ★ 카탈로그 기반 셀프 서비스 (Week 6 Day 4에서 상세)
```

## 📝 연습 문제

**문제 1.** 회사가 AWS Organizations로 50개 계정을 관리한다. 모든 계정에 CloudTrail과 GuardDuty를 자동으로 활성화하고, 앞으로 새로 추가되는 계정도 자동으로 포함되길 원한다. 가장 적합한 솔루션은?

A) 50개 계정에 각각 CloudFormation Stack을 수동으로 배포한다
B) StackSets with Service-Managed Permissions + `AutoDeployment=true`를 설정한다
C) Lambda 함수로 Organizations API를 폴링해 새 계정을 감지하고 CloudFormation을 실행한다
D) Control Tower를 사용한다

**정답: B**
해설: StackSets with Service-Managed Permissions는 Organizations와 네이티브로 통합된다. `AutoDeployment=true`를 설정하면 새 계정이 OU에 추가될 때 EventBridge 이벤트가 발생하고 CloudFormation이 자동으로 Stack Instance를 생성한다. D(Control Tower)도 유사한 기능을 제공하지만 전체 AWS 환경 구조를 Control Tower로 전환해야 하는 더 큰 작업이다. B가 현재 조직 구조를 유지하면서 가장 최소 변경으로 구현 가능하다.

---

**문제 2.** Stack A(네트워크 Stack)가 VPC ID를 Export하고 Stack B가 `!ImportValue`로 사용 중이다. 운영자가 Stack A의 다른 속성(NAT Gateway 수)을 변경하는 업데이트를 시도한다. 이 업데이트는 VPC ID Export 값을 변경하지 않는다. 어떻게 되는가?

A) Stack B가 ImportValue를 사용 중이라 Stack A를 전혀 수정할 수 없다
B) Stack A 업데이트가 정상적으로 허용된다. Export 값 자체가 변경되지 않으므로 제약이 없다
C) Stack B도 함께 자동으로 업데이트된다
D) Stack A를 업데이트하기 전에 Stack B를 먼저 삭제해야 한다

**정답: B**
해설: Cross-Stack의 제약은 "Import 중인 Export의 값(Value) 또는 Export 자체를 변경/삭제할 수 없다"는 것이다. NAT Gateway 수 변경은 VPC ID Export 값에 영향을 주지 않으므로 허용된다. 제약은 Export 이름이나 Export 값 자체를 변경하거나, Export를 출력에서 제거하려 할 때 적용된다.

---

**문제 3.** Nested Stack을 사용할 때 부모 Stack을 삭제하면 어떻게 되는가?

A) 부모 Stack만 삭제되고 자식 Stack은 독립적으로 남는다
B) 자식 Stack들이 역순으로 삭제되고 그 다음 부모 Stack이 삭제된다 (cascade)
C) 자식 Stack들의 DeletionPolicy에 따라 결정된다
D) 삭제가 거부된다

**정답: B**
해설: Nested Stack에서 부모가 자식의 라이프사이클을 제어한다. 부모 Stack 삭제 시 자식 Stack들이 역순으로(의존성의 반대 순서) 삭제된다. 자식 Stack 내 리소스의 `DeletionPolicy`는 Stack 간 cascade 삭제에도 적용된다. 즉, `DeletionPolicy: Retain`이 설정된 S3 버킷이 자식 Stack에 있다면, 그 버킷은 Stack이 삭제되어도 보존된다.

---

**문제 4.** StackSets를 배포하는 중 100개 계정 중 8개에서 IAM 권한 오류로 실패했다. `FailureToleranceCount: 5`로 설정되어 있다. 어떻게 되는가?

A) 8개 실패는 무시되고 나머지 92개에 계속 배포된다
B) 5개를 초과했으므로 전체 배포 작업이 중단된다. 이미 배포된 것들은 유지되고 아직 미배포 계정들은 진행되지 않는다
C) 이미 배포된 계정들 포함 전체 롤백이 시작된다
D) 실패한 8개만 자동으로 재시도된다

**정답: B**
해설: FailureToleranceCount=5는 5개 계정 실패까지 허용한다는 의미다. 8개가 실패하면 임계값(5)을 초과하므로 StackSets 작업이 중단된다. 이미 성공적으로 배포된 Stack Instance들은 롤백되지 않고 유지된다. 나머지 배포 예정 계정들은 작업이 실행되지 않는다. 운영자는 IAM 권한 문제를 해결한 후 `update-stack-instances`로 실패한 계정들만 재시도해야 한다.

---

**문제 5.** Nested Stack과 Cross-Stack Reference를 비교할 때, VPC와 서브넷 같은 공유 네트워크 인프라를 관리하기 위해 어떤 방식을 사용해야 하는가? 그 이유는?

A) Nested Stack - 부모가 라이프사이클을 통제하므로 더 안전하다
B) Cross-Stack Reference - VPC는 애플리케이션보다 수명이 길고, 여러 팀의 독립적인 Stack이 참조해야 하므로 각 Stack의 독립적인 라이프사이클이 중요하다
C) 두 방식 모두 동일하게 적합하다
D) 직접 Template에 복제하는 것이 가장 안전하다

**정답: B**
해설: VPC는 애플리케이션 Stack들보다 훨씬 수명이 길고 안정적인 리소스다. Nested Stack을 사용하면 VPC가 특정 애플리케이션 Stack의 "자식"이 되어 그 애플리케이션 Stack 삭제 시 VPC도 삭제될 위험이 있다. Cross-Stack으로 분리하면 여러 팀의 애플리케이션 Stack이 독립적으로 동일한 VPC를 참조할 수 있다. Import를 사용하는 Stack들이 있는 한 VPC Stack 삭제가 불가능하므로 오히려 실수 삭제 방지 효과도 있다.

---

**문제 6.** Organizations SCP로 ap-northeast-2와 us-east-1만 허용하고 다른 모든 리전의 리소스 생성을 거부했다. StackSets로 eu-west-1에 새 Stack Instance를 배포하려 하면?

A) Service-Managed StackSets는 SCP를 우회할 수 있으므로 정상 배포된다
B) ExecutionRole은 관리 계정의 권한을 상속하므로 SCP 제약 없이 배포된다
C) SCP가 ExecutionRole에도 적용되므로 eu-west-1 배포가 거부되고 Stack Instance 생성이 실패한다
D) StackSets는 SCP 이전에 평가되므로 정상 배포된다

**정답: C**
해설: SCP는 계정 내 모든 IAM 엔티티(사용자, 역할)에 적용된다. StackSets의 ExecutionRole도 예외가 없다. eu-west-1이 SCP에서 허용되지 않으면 ExecutionRole이 eu-west-1에서 CloudFormation API를 호출할 수 없다. `FailureTolerancePercentage` 설정에 따라 이 실패가 전체 배포를 중단시킬 수 있다. 해결책: eu-west-1 사용이 필요한 계정들을 별도 OU로 분리하고 해당 OU의 SCP에 eu-west-1을 허용하는 조건을 추가한다.
