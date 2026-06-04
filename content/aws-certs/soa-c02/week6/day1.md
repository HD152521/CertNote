# Day 1 - CloudFormation: 인프라를 코드로, 운영자의 시각으로

2011년 Netflix는 "Chaos Monkey"를 공개했다. 프로덕션 환경에서 무작위로 인스턴스를 종료시키는 도구다. 이 도구가 존재할 수 있었던 이유는 Netflix가 인프라를 코드로 관리했기 때문이다. 인스턴스가 죽어도 CloudFormation(또는 그 당시의 IaC 도구)이 자동으로 동일한 인스턴스를 다시 만들어냈다. 수동으로 구성된 인프라라면 Chaos Monkey는 재앙이었을 것이다.

CloudFormation은 AWS의 공식 IaC(Infrastructure as Code) 서비스다. 2011년 2월 출시됐으며, JSON 템플릿으로 시작해 현재는 YAML을 기본 형식으로 사용한다. SOA-C02에서 CloudFormation은 단순히 "인프라 생성 도구"가 아니라 "운영자가 변경을 안전하게 관리하고, 상태 drift를 감지하고, 실패 시 자동 복구하는" 운영 플랫폼으로 다뤄진다.

## IaC의 역사와 CloudFormation의 위치

IaC 개념은 2006년 Mark Burgess(CFEngine 저자)의 논문 "In Search of Certainty"에서 체계화됐다. "시스템의 원하는 상태를 선언적으로 기술하라"는 원칙이 핵심이다. 2009년 Chef, 2011년 Puppet 엔터프라이즈, 2012년 Ansible, 2014년 Terraform이 등장했다. Terraform은 2014년 HashiCorp의 Mitchell Hashimoto가 "Write, Plan, Apply" 워크플로로 발표했는데, 이 패턴이 이후 IaC 업계의 표준이 됐다.

CloudFormation의 독특한 위치는 **AWS에 완전히 네이티브**라는 것이다. 다른 IaC 도구들이 AWS를 하나의 provider로 지원하는 반면, CloudFormation은 AWS 서비스 그 자체다. AWS가 새 서비스를 출시하면 해당 일 또는 수 주 내에 CloudFormation 리소스 타입이 추가된다. Terraform에서 신규 서비스를 지원하려면 커뮤니티 또는 HashiCorp의 Provider 업데이트가 필요하다.

**IaC 도구 심화 비교:**

| 특성 | CloudFormation | Terraform | Pulumi | CDK | Ansible |
|------|---------------|-----------|--------|-----|---------|
| 언어 | JSON/YAML | HCL | Python/TS/Go/C# | TS/Python/Java/Go | YAML + Jinja2 |
| 상태 관리 | AWS 내부 (Stack) | S3+DynamoDB 파일 | Pulumi Cloud / S3 | CFn으로 변환 | 없음(멱등 실행) |
| AWS 통합 | 완전 네이티브 | Provider 경유 | Provider 경유 | CFn으로 변환 | boto3/module |
| 멀티 클라우드 | X | O | O | X | O |
| 드리프트 감지 | 기본 내장 | `terraform plan` | `pulumi refresh` | CDK Drift | X |
| 롤백 | 자동 | 수동 | 수동 | 자동(CFn 경유) | X |
| 출시 연도 | 2011 | 2014 | 2018 | 2019 | 2012 |
| 오픈소스 | X | O(BSL) | O | O | O |

> 💡 **관련 이론**: CloudFormation의 "Declarative" 방식은 수학의 집합론과 유사하다. "이 집합(인프라)에 이런 원소(리소스)들이 있어야 한다"고 선언하면, 현재 상태와 목표 상태의 차이를 시스템이 계산해 수렴시킨다. 명령형(Imperative) 방식인 Shell 스크립트가 "Step 1: EC2 생성, Step 2: SG 생성..."처럼 절차를 기술하는 것과 대조된다. 선언적 방식의 핵심은 **멱등성(Idempotency)**: 같은 템플릿을 여러 번 적용해도 결과가 동일하다. 이 개념은 Dijkstra의 "분리 가능한 추상화(Separable Abstraction)" 원칙까지 거슬러 올라가며, 1970년대 하드웨어 기술 독립성(machine independence) 논쟁의 소프트웨어 버전이기도 하다.

> 🔍 **더 깊이**: CloudFormation 엔진은 내부적으로 **DAG(Directed Acyclic Graph)** 기반으로 리소스 의존성을 분석한다. `!Ref`와 `!GetAtt`로 리소스 간 의존성이 정의되면 CFn이 자동으로 위상 정렬(Topological Sort)을 수행해 어떤 리소스를 먼저 만들고 병렬로 처리할 수 있는지 결정한다. `DependsOn`을 명시적으로 추가하면 CFn이 자동 감지하지 못하는 암묵적 의존성(예: IAM 권한 전파 지연)을 수동으로 표현할 수 있다. 이 DAG 접근법은 GNU Make의 Makefile 의존성 분석, Apache Airflow의 DAG 스케줄링과 동일한 CS 이론 기반이다.

## CloudFormation 엔진 내부 작동 원리

CloudFormation이 `create-stack`을 받으면 내부적으로 다음 과정을 거친다.

**1단계: Template 파싱과 검증**
- JSON/YAML 파싱 → 내부 표현으로 변환
- 10개 섹션 구조 검증
- Intrinsic Functions 해석 (재귀적 평가)
- 순환 참조 탐지 (A → B → A 구조 차단)

**2단계: 의존성 그래프 구성**
- `!Ref`와 `!GetAtt`에서 암묵적 의존성 추출
- `DependsOn`에서 명시적 의존성 추가
- DAG 유효성 검사 (순환 없는지)
- 위상 정렬로 생성 순서 결정

**3단계: 병렬 리소스 생성**
- 의존성 없는 리소스들을 동시에 생성 (최대 병렬 처리)
- 의존 관계에 있는 리소스는 선행 리소스 완료 대기
- 각 리소스 생성 API 호출 → 폴링으로 완료 확인
- CloudWatch Events로 이벤트 스트림 방출

**4단계: CreationPolicy 신호 대기 (있는 경우)**
- Count 수만큼 cfn-signal 수신 대기
- Timeout 초과 시 실패 처리
- 성공 신호 수신 시 다음 단계 진행

**5단계: Stack 상태 최종화**
- 모든 리소스 성공 → `CREATE_COMPLETE`
- 어느 리소스라도 실패 → `ROLLBACK_IN_PROGRESS` 시작

```
CloudFormation 내부 처리 흐름:

Template YAML
    │
    ▼
┌─────────────────────────────────────────┐
│  CFn Parser                             │
│  - JSON/YAML → IR (Internal Repr.)      │
│  - Intrinsic Function 평가              │
│  - Pseudo Parameter 치환                │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Dependency Analyzer (DAG Builder)      │
│  !Ref / !GetAtt → 암묵 의존성           │
│  DependsOn → 명시 의존성               │
│  Topological Sort → 실행 계획          │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Resource Executor (병렬)               │
│  ┌─────────┐  ┌─────────┐             │
│  │ IAM Role│  │  VPC    │  (병렬)      │
│  └────┬────┘  └────┬────┘             │
│       └─────┬──────┘                   │
│             ▼                          │
│        ┌─────────┐                     │
│        │EC2 inst │  (위 둘 완료 후)     │
│        └─────────┘                     │
└─────────────────────────────────────────┘
```

## Template 10대 섹션: 운영자가 알아야 할 것만

CloudFormation Template은 최대 10개 섹션으로 구성된다. 필수는 `Resources`만이고 나머지는 선택이다. 이 사실이 시험에서 반복 출제된다.

```yaml
AWSTemplateFormatVersion: '2010-09-09'  # 선택 (현재 유일한 값)
Description: 'My application stack'     # 선택

Metadata:           # 선택 - 콘솔 UI 힌트, 파라미터 그룹화
  AWS::CloudFormation::Interface:
    ParameterGroups:
      - Label:
          default: "Database Configuration"
        Parameters: [DBInstanceClass, DBPassword]

Parameters:         # 선택 - 스택 생성 시 입력값
  EnvType:
    Type: String
    AllowedValues: [dev, staging, prod]
    Default: dev
    Description: "Deployment environment"

Mappings:           # 선택 - 룩업 테이블 (Region → AMI 등)
  RegionAMIMap:
    ap-northeast-2:
      AMI: ami-0c9c942bd7bf113a2
    us-east-1:
      AMI: ami-0c55b159cbfafe1f0

Conditions:         # 선택 - 조건부 리소스/속성
  IsProd: !Equals [!Ref EnvType, prod]
  IsNotDev: !Not [!Equals [!Ref EnvType, dev]]

Transform:          # 선택 - SAM, 매크로 변환
  - AWS::Serverless-2016-10-31

Resources:          # 필수 - 실제 AWS 리소스 정의
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub 'myapp-${EnvType}-${AWS::AccountId}'

Outputs:            # 선택 - 다른 스택에 노출하거나 콘솔에서 확인
  BucketArn:
    Value: !GetAtt MyBucket.Arn
    Export:
      Name: !Sub '${AWS::StackName}-BucketArn'

Rules:              # 선택 - Parameter 간 교차 유효성 검사
  MustUseProdDB:
    RuleCondition: !Equals [!Ref EnvType, prod]
    Assertions:
      - Assert: !Equals [!Ref DBInstanceClass, db.r5.large]
        AssertDescription: "Production must use db.r5.large"
```

## Parameters: 입력값의 정교한 제어

Parameters는 Template를 재사용 가능하게 만드는 핵심이다. 동일한 Template로 dev, staging, prod 환경을 만들 수 있다.

**Parameter 타입 전체 목록:**

| 타입 | 설명 | 예시 |
|------|------|------|
| `String` | 일반 문자열 | `"t3.medium"` |
| `Number` | 정수 또는 부동소수점 | `3306` |
| `List<Number>` | 숫자 목록 | `[80, 443]` |
| `CommaDelimitedList` | 쉼표 구분 문자열 | `"a,b,c"` |
| `AWS::EC2::KeyPair::KeyName` | 계정의 기존 키 페어 이름 | `my-key` |
| `AWS::EC2::SecurityGroup::Id` | 계정의 기존 SG ID | `sg-abc123` |
| `AWS::EC2::Subnet::Id` | 계정의 기존 서브넷 ID | `subnet-abc` |
| `AWS::EC2::VPC::Id` | 계정의 기존 VPC ID | `vpc-abc` |
| `AWS::SSM::Parameter::Value<String>` | SSM 파라미터에서 값 가져오기 | `/myapp/config` |
| `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>` | SSM에서 최신 AMI ID | `/aws/service/ami-amazon-linux-latest/...` |

**동적 참조 (Parameter 없이 외부 값 직접 참조):**

```yaml
# Secrets Manager에서 직접 참조
DBPassword:
  !Sub '{{resolve:secretsmanager:prod/db/password:SecretString:password}}'

# Parameter Store에서 직접 참조
DBHost:
  !Sub '{{resolve:ssm:/myapp/prod/database/host}}'

# Parameter Store에서 암호화된 값 참조
DBPassword2:
  !Sub '{{resolve:ssm-secure:/myapp/prod/database/password}}'
```

> 🔍 **더 깊이**: `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>` 타입은 AWS가 공식적으로 운영하는 SSM 파라미터 경로(`/aws/service/ami-amazon-linux-latest/...`)에서 최신 AMI ID를 자동으로 가져온다. 이 경로의 값은 AWS가 새 AMI를 출시할 때마다 자동으로 업데이트한다. 즉, 같은 Template를 1년 후에 배포해도 항상 최신 Amazon Linux 2 AMI가 사용된다. 하드코딩이나 Mapping으로 AMI ID를 관리할 때 발생하는 "AMI ID가 deprecated됐다" 문제가 사라진다. 주의할 점은 Stack 업데이트 없이 SSM 파라미터 값이 바뀐 경우, Stack을 다시 배포하기 전까지 반영되지 않는다는 것이다. 이는 Drift Detection에서 파라미터 변경이 감지되지 않는 맹점이기도 하다.

## 내장 함수 (Intrinsic Functions): 운영자 필수

| 함수 | 문법 | 용도 |
|------|------|------|
| `!Ref` | `!Ref MyBucket` | 파라미터 값, 리소스의 기본 식별자 (EC2면 Instance ID, S3면 버킷 이름) |
| `!GetAtt` | `!GetAtt MyBucket.Arn` | 리소스의 특정 속성 (ARN, DNS 이름 등) |
| `!Sub` | `!Sub 'prefix-${EnvType}'` | 문자열에 변수 삽입 |
| `!FindInMap` | `!FindInMap [RegionAMIMap, !Ref AWS::Region, AMI]` | Mappings에서 값 조회 |
| `!If` | `!If [IsProd, t3.large, t3.micro]` | 조건에 따라 두 값 중 선택 |
| `!ImportValue` | `!ImportValue 'network-stack-VpcId'` | 다른 스택의 Export 값 가져오기 |
| `!Join` | `!Join [':', [a, b, c]]` → `"a:b:c"` | 목록을 구분자로 연결 |
| `!Select` | `!Select [0, !GetAZs '']` | 목록에서 인덱스로 선택 |
| `!GetAZs` | `!GetAZs 'ap-northeast-2'` | 리전의 AZ 목록 |
| `!Cidr` | `!Cidr [10.0.0.0/16, 6, 12]` | CIDR 블록 자동 분할 |
| `!Base64` | `!Base64 '#!/bin/bash ...'` | Base64 인코딩 (UserData용) |
| `!Split` | `!Split [',', 'a,b,c']` → `[a, b, c]` | 문자열을 구분자로 분리 |

**함수 중첩 예시 (실전 패턴):**

```yaml
# AZ 목록에서 첫 번째 AZ의 서브넷 자동 선택
SubnetId: !Select
  - 0
  - !GetAZs ''

# 조건부 인스턴스 타입 + Sub 중첩
InstanceType: !If
  - IsProd
  - !Sub 'r5.${ProdInstanceSize}'
  - t3.micro

# CIDR 자동 분할 (VPC 서브넷 자동 생성)
CidrBlock: !Select
  - 0
  - !Cidr [!GetAtt VPC.CidrBlock, 6, 12]
  # VPC CIDR을 6개 /20 서브넷으로 분할, 첫 번째 선택
```

## Stack 라이프사이클: 모든 상태를 알아야 트러블슈팅이 된다

```
Stack 상태 전이도:

CREATE_IN_PROGRESS ──────────────► CREATE_COMPLETE
        │
        └──(실패)──► ROLLBACK_IN_PROGRESS ──► ROLLBACK_COMPLETE
                                                    │
                                                    └── [업데이트 불가, 삭제만 가능]

CREATE_COMPLETE ──(update-stack)──► UPDATE_IN_PROGRESS ──► UPDATE_COMPLETE
                                            │
                                            └──(실패)──► UPDATE_ROLLBACK_IN_PROGRESS
                                                                │
                                                                ├──(성공)──► UPDATE_ROLLBACK_COMPLETE
                                                                │
                                                                └──(실패)──► UPDATE_ROLLBACK_FAILED
                                                                                    │
                                                                                    └── continue-update-rollback 필요

UPDATE_COMPLETE ──(delete-stack)──► DELETE_IN_PROGRESS ──► DELETE_COMPLETE
                                            │
                                            └──(실패)──► DELETE_FAILED
                                                             │
                                                             └── retain 옵션으로 문제 리소스 제외 후 재삭제
```

**중요 상태 설명:**

| 상태 | 원인 | 운영자 조치 |
|------|------|-------------|
| `ROLLBACK_COMPLETE` | 최초 Stack 생성 실패 후 롤백 완료 | 삭제 후 재생성. `update-stack` 불가 |
| `UPDATE_ROLLBACK_FAILED` | 업데이트 롤백 중 추가 실패 | `continue-update-rollback` + `resources-to-skip` |
| `DELETE_FAILED` | 리소스 삭제 실패 (비어있지 않은 S3, 연결된 ENI 등) | `--retain-resources` 로 문제 리소스 보존 후 재삭제 |
| `IMPORT_ROLLBACK_FAILED` | 기존 리소스 Import 중 실패 | Import 대상 리소스 상태 확인 후 재시도 |

```bash
# ROLLBACK_COMPLETE 상태 Stack 삭제
aws cloudformation delete-stack --stack-name failed-stack
aws cloudformation wait stack-delete-complete --stack-name failed-stack

# UPDATE_ROLLBACK_FAILED 복구
aws cloudformation continue-update-rollback \
  --stack-name my-stack \
  --resources-to-skip LogicalResourceId1 LogicalResourceId2

# DELETE_FAILED 복구: 문제 리소스 보존하며 Stack 삭제
aws cloudformation delete-stack \
  --stack-name my-stack \
  --retain-resources ProblematicS3Bucket ProblematicENI

# Stack 이벤트로 실패 원인 확인
aws cloudformation describe-stack-events \
  --stack-name my-stack \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].[Timestamp,LogicalResourceId,ResourceStatusReason]' \
  --output table
```

> ⚠️ **함정**: `ROLLBACK_COMPLETE` 상태는 **처음 Stack 생성이 실패**한 경우의 최종 상태다. 이 상태에서는 `update-stack`이 불가능하고, 반드시 `delete-stack` 후 재생성해야 한다. 이를 모르고 `update-stack`을 시도하면 "Stack is not in a valid state for UpdateStack" 오류가 발생한다. `continue-update-rollback`은 `UPDATE_ROLLBACK_FAILED` 전용으로, `ROLLBACK_COMPLETE`에는 적용되지 않는다. 시험에서 "Stack을 ROLLBACK_COMPLETE에서 복구하려면?" 문제의 정답은 항상 "삭제 후 재생성"이다.

## Resource 속성: DeletionPolicy, UpdateReplacePolicy, CreationPolicy

**DeletionPolicy: Stack 삭제 시 리소스 처리**

```yaml
MyDatabase:
  Type: AWS::RDS::DBInstance
  DeletionPolicy: Snapshot    # Stack 삭제 전 스냅샷 생성 후 인스턴스 삭제
  Properties: ...

MyBucket:
  Type: AWS::S3::Bucket
  DeletionPolicy: Retain       # Stack 삭제 시 버킷은 그대로 보존
  Properties: ...

MyCacheCluster:
  Type: AWS::ElastiCache::ReplicationGroup
  DeletionPolicy: Delete       # 기본값: Stack 삭제 시 리소스 삭제
  Properties: ...
```

| DeletionPolicy 값 | 동작 | 사용 리소스 |
|-------------------|------|-------------|
| `Delete` (기본) | Stack 삭제 시 리소스 삭제 | 임시 리소스 |
| `Retain` | Stack 삭제 시 리소스 보존 | S3, DynamoDB, 중요 데이터 |
| `Snapshot` | Stack 삭제 전 스냅샷 생성 후 삭제 | RDS, ElastiCache, EBS |

**UpdateReplacePolicy: 업데이트 시 리소스 교체가 발생할 때**

UpdateReplacePolicy는 Stack 업데이트 중 리소스 교체(Replacement)가 발생할 때 기존 리소스를 어떻게 처리할지 결정한다. DeletionPolicy는 Stack **삭제** 시 동작하고, UpdateReplacePolicy는 업데이트 시 **교체** 조건에서 동작한다.

```yaml
MyDatabase:
  Type: AWS::RDS::DBInstance
  DeletionPolicy: Retain
  UpdateReplacePolicy: Snapshot  # 업데이트로 인해 DB가 교체될 때 기존 DB 스냅샷 후 삭제
  Properties:
    DBInstanceClass: db.t3.medium  # → db.r5.large로 변경 시 RDS 교체 발생
    MultiAZ: false                  # → true로 변경 시 RDS 교체 발생
```

**리소스 교체(Replacement)가 발생하는 속성 변경 예시:**

| 리소스 | 변경 속성 | 교체 발생 여부 |
|--------|-----------|----------------|
| AWS::RDS::DBInstance | `DBInstanceClass` | True |
| AWS::RDS::DBInstance | `MultiAZ` (false→true) | True |
| AWS::S3::Bucket | `BucketName` | True |
| AWS::EC2::Instance | `ImageId` (AMI ID) | True |
| AWS::EC2::Instance | `InstanceType` | 조건부 (EBS최적화 여부) |
| AWS::DynamoDB::Table | `TableName` | True |
| AWS::ElastiCache::ReplicationGroup | `NumCacheClusters` | 조건부 |

> 📚 **사례**: 2022년 E커머스 F사에서 CloudFormation 업데이트 중 RDS 인스턴스가 예상치 못하게 교체되는 사고가 발생했다. DB 인스턴스 클래스를 `db.t3.medium`에서 `db.r5.xlarge`로 변경하면서 동시에 `MultiAZ: false`를 `MultiAZ: true`로 변경했다. AWS는 MultiAZ 변경을 Replacement로 처리했고, `UpdateReplacePolicy`가 기본값 `Delete`로 설정되어 있어 기존 DB가 스냅샷 없이 삭제됐다. 최근 수동 스냅샷에서 4시간 치 데이터를 잃었다. 이후 모든 RDS에 `DeletionPolicy: Snapshot`과 `UpdateReplacePolicy: Snapshot`을 표준 정책으로 설정하고, Change Set 검토 시 `Replacement: True` 리소스를 반드시 확인하는 프로세스를 도입했다.

**CreationPolicy: 리소스 생성 완료 신호 대기**

EC2가 User Data 스크립트를 모두 실행하고 애플리케이션이 준비될 때까지 CloudFormation이 기다리게 하는 패턴이다.

```yaml
WebServer:
  Type: AWS::EC2::Instance
  CreationPolicy:
    ResourceSignal:
      Count: 1
      Timeout: PT15M  # ISO 8601 Duration: 15분 대기
  Properties:
    ImageId: !Ref AmiId
    UserData:
      Fn::Base64: !Sub |
        #!/bin/bash
        yum update -y
        yum install -y httpd
        systemctl start httpd
        systemctl enable httpd
        echo "<h1>Hello from ${AWS::StackName}</h1>" > /var/www/html/index.html
        # 설정 완료 후 CloudFormation에 신호 전송
        /opt/aws/bin/cfn-signal \
          --exit-code $? \
          --stack ${AWS::StackName} \
          --resource WebServer \
          --region ${AWS::Region}
```

`cfn-signal`이 `exit-code 0`으로 신호를 보내면 CloudFormation이 CREATE_COMPLETE로 진행한다. `exit-code 1`이거나 Timeout 내에 신호가 오지 않으면 리소스 생성 실패로 처리된다.

**cfn-signal 디버깅 패턴:**

```bash
# cfn-signal 실패 시 EC2 시스템 로그 확인 (콘솔)
aws ec2 get-console-output --instance-id i-xxxx

# UserData 실행 로그 확인 (SSM Session Manager로 접속 후)
cat /var/log/cfn-init.log
cat /var/log/cfn-init-cmd.log
cat /var/log/cloud-init-output.log

# cfn-signal 성공 여부 CloudFormation 이벤트에서 확인
aws cloudformation describe-stack-events \
  --stack-name my-stack \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`].[LogicalResourceId,ResourceStatusReason]'
```

> ⚠️ **함정**: cfn-signal Timeout은 ISO 8601 Duration 형식으로 표기한다. `PT15M`(15분), `PT1H`(1시간), `PT1H30M`(1시간 30분). 가장 많은 실수는 Timeout을 너무 짧게 설정하는 것이다. OS 패키지 업데이트(`yum update -y`)만 해도 리전/네트워크 상태에 따라 5-10분 걸릴 수 있다. 최소 `PT15M`을 권장하며, 무거운 소프트웨어(Java, Node.js 빌드 등)가 포함되면 `PT30M` 이상을 설정해야 한다. Timeout이 발생하면 이벤트에 "WaitCondition timed out" 또는 "Failed to receive N resource signal(s) within the specified duration" 메시지가 표시된다.

**Auto Scaling Group의 UpdatePolicy (Rolling Update):**

```yaml
WebASG:
  Type: AWS::AutoScaling::AutoScalingGroup
  CreationPolicy:
    ResourceSignal:
      Count: !Ref DesiredCapacity
      Timeout: PT20M
  UpdatePolicy:
    AutoScalingRollingUpdate:
      MaxBatchSize: 2              # 한 번에 2개씩 교체
      MinInstancesInService: 1     # 최소 1개는 항상 서비스 중
      PauseTime: PT5M              # 배치 간 5분 대기 (WaitOnResourceSignals=false 시)
      WaitOnResourceSignals: true  # true면 PauseTime 대신 cfn-signal 대기
      SuspendProcesses:            # 롤링 업데이트 중 ASG 자동화 프로세스 일시 중지
        - HealthCheck
        - ReplaceUnhealthy
        - AZRebalance
  Properties:
    MinSize: 2
    MaxSize: 6
    DesiredCapacity: !Ref DesiredCapacity
```

**AutoScalingRollingUpdate 핵심 파라미터 상호작용:**

| 파라미터 | 역할 | 주의사항 |
|----------|------|----------|
| `MaxBatchSize` | 한 번에 교체할 인스턴스 수 | DesiredCapacity보다 작아야 함 |
| `MinInstancesInService` | 항상 유지해야 할 최소 인스턴스 수 | MaxBatchSize + MinInstancesInService ≤ MaxSize 권장 |
| `PauseTime` | WaitOnResourceSignals=false 시 배치 간 대기 | WaitOnResourceSignals=true면 무시됨 |
| `WaitOnResourceSignals` | cfn-signal 대기 여부 | true면 각 인스턴스의 CreationPolicy 신호 대기 |
| `SuspendProcesses` | 롤링 중 일시 중지할 ASG 프로세스 | AZRebalance 없으면 불균형 상태 발생 가능 |

> 💡 **관련 이론**: CreationPolicy와 cfn-signal의 패턴은 분산 시스템의 "readiness probe" 개념과 동일하다. Kubernetes의 `readinessProbe`처럼, 애플리케이션이 준비됐다는 외부 신호를 받기 전까지 트래픽을 전달하지 않는다. CloudFormation에서는 이 신호가 `cfn-signal`이고, 신호를 받기 전까지 Stack은 `CREATE_IN_PROGRESS` 상태를 유지하며 다음 리소스 생성으로 넘어가지 않는다. Rolling Update에서 WaitOnResourceSignals=true는 각 배치마다 이 readiness 체크를 반복해, "이 인스턴스가 정말 트래픽을 받을 준비가 됐는가"를 CloudFormation이 직접 확인하는 구조다. Martin Fowler의 "Blue-Green Deployment" 패턴이 클러스터 전체를 교체하는 반면, AutoScalingRollingUpdate는 인스턴스를 점진적으로 교체하는 "Canary Release"에 가깝다.

## Stack Policy: 핵심 리소스 업데이트 차단

Stack Policy는 Stack 업데이트 시 특정 리소스를 실수로 수정·삭제하는 것을 방지하는 방화벽이다. IAM 정책이 **사람(Principal)**의 API 접근을 제어하는 것과 달리, Stack Policy는 **CloudFormation이 특정 리소스에 수행할 수 있는 작업**을 제어한다.

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "Update:*",
      "Principal": "*",
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": ["Update:Replace", "Update:Delete"],
      "Principal": "*",
      "Resource": "LogicalResourceId/ProdDatabase"
    },
    {
      "Effect": "Deny",
      "Action": "Update:*",
      "Principal": "*",
      "Resource": "LogicalResourceId/ProdCacheCluster"
    }
  ]
}
```

**Stack Policy Action 종류:**

| Action | 의미 |
|--------|------|
| `Update:Modify` | 기존 리소스의 속성을 In-Place로 수정 |
| `Update:Replace` | 기존 리소스를 삭제하고 새로 생성 (Replacement) |
| `Update:Delete` | 리소스를 Stack에서 제거하고 삭제 |
| `Update:*` | 위 세 가지 모두 |

```bash
# Stack Policy 설정
aws cloudformation set-stack-policy \
  --stack-name my-prod-stack \
  --stack-policy-body file://stack-policy.json

# Stack Policy 일시 override (관리자 권한 필요)
aws cloudformation update-stack \
  --stack-name my-prod-stack \
  --template-body file://template.yaml \
  --stack-policy-during-update-body '{"Statement":[{"Effect":"Allow","Action":"Update:*","Principal":"*","Resource":"*"}]}'

# 현재 Stack Policy 확인
aws cloudformation get-stack-policy --stack-name my-prod-stack
```

> 💡 **관련 이론**: Stack Policy의 평가 방식은 IAM 정책과 동일한 **명시적 Deny 우선** 원칙을 따른다. 기본값이 "모든 리소스 업데이트 허용"인 점이 IAM(기본값: 모든 것 거부)과 다르다. Stack Policy가 설정되지 않은 경우 모든 업데이트가 허용된다. 반면 Stack Policy가 한 번 설정되면, 명시적으로 허용(`Effect: Allow`)하지 않은 모든 리소스는 Deny된다. 따라서 특정 리소스만 차단하려면 반드시 "모든 리소스 허용" Statement를 명시적으로 추가해야 한다. 이 패턴은 방화벽 규칙의 "Allow All, Deny Specific"과 동일하다.

## Pseudo Parameters: 항상 사용 가능한 내장 변수

```yaml
# 사용 가능한 Pseudo Parameters
${AWS::AccountId}     # 현재 AWS 계정 ID
${AWS::Region}        # 현재 리전 (예: ap-northeast-2)
${AWS::StackId}       # Stack ARN
${AWS::StackName}     # Stack 이름
${AWS::URLSuffix}     # 도메인 접미사 (amazonaws.com 또는 중국은 amazonaws.com.cn)
${AWS::Partition}     # aws, aws-cn, aws-us-gov
${AWS::NoValue}       # 조건부로 속성을 제거할 때

# 활용 예시
BucketName: !Sub 'myapp-${AWS::AccountId}-${AWS::Region}-${EnvType}'
# → myapp-123456789012-ap-northeast-2-prod

# AWS::NoValue 활용: 조건부 속성 제거
MultiAZ: !If
  - IsProd
  - true
  - !Ref AWS::NoValue  # dev 환경에서는 MultiAZ 속성 자체를 제거 (기본값 false 사용)
```

**Partition 활용 (GovCloud, 중국 리전 지원):**

```yaml
# 리전에 관계없이 올바른 ARN 형식 구성
PolicyArn: !Sub 'arn:${AWS::Partition}:iam::${AWS::AccountId}:policy/MyPolicy'
# us-east-1: arn:aws:iam::123456789012:policy/MyPolicy
# cn-north-1: arn:aws-cn:iam::123456789012:policy/MyPolicy
# us-gov-east-1: arn:aws-us-gov:iam::123456789012:policy/MyPolicy
```

## 트러블슈팅 패턴: 운영자의 일상

**디버깅을 위한 롤백 비활성화:**

```bash
# Stack 생성 시 실패해도 롤백하지 않음 → 실패한 리소스가 남아 직접 확인 가능
aws cloudformation create-stack \
  --stack-name debug-stack \
  --template-body file://template.yaml \
  --on-failure DO_NOTHING \
  --parameters ...

# 업데이트 시 롤백 비활성화
aws cloudformation update-stack \
  --stack-name my-stack \
  --template-body file://template.yaml \
  --disable-rollback
```

**주의**: `DO_NOTHING`/`--disable-rollback`은 비용이 계속 청구되므로 디버깅 후 반드시 정리한다.

**Template 유효성 검사:**

```bash
# Template 문법 검사 (AWS 서버에서 검증)
aws cloudformation validate-template \
  --template-body file://template.yaml

# cfn-lint로 로컬 검사 (더 상세한 검증)
pip install cfn-lint
cfn-lint template.yaml

# cfn-lint 규칙별 검사 (SOA 시험 관련 규칙)
cfn-lint template.yaml --include-checks W  # Warning 포함
cfn-lint template.yaml -r E3002            # 특정 규칙만 검사
```

**CAPABILITY 플래그:**

```bash
# IAM 리소스를 생성하는 Template에 필요
aws cloudformation create-stack \
  --capabilities CAPABILITY_IAM         # IAM 리소스 (이름 없는)
  --capabilities CAPABILITY_NAMED_IAM   # 이름 있는 IAM 리소스
  --capabilities CAPABILITY_AUTO_EXPAND # Transform(SAM/Macro) 사용

# 복수 지정 가능
aws cloudformation create-stack \
  --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND
```

**CAPABILITY가 없을 때 오류 메시지:**
```
InsufficientCapabilities: Requires capabilities : [CAPABILITY_NAMED_IAM]
```
이 오류는 Template에 `AWS::IAM::Role`, `AWS::IAM::Policy` 등 IAM 리소스가 있는데 CAPABILITY 플래그를 지정하지 않은 경우 발생한다.

> 📚 **사례**: 2023년 핀테크 스타트업 G사에서 CI/CD 파이프라인에서 CloudFormation 배포가 갑자기 실패하기 시작했다. 오류는 "InsufficientCapabilities". 원인은 템플릿에 `AWS::IAM::Role`을 추가했는데 파이프라인 스크립트에 `--capabilities CAPABILITY_IAM`이 없었다. 수정은 간단했지만 프로덕션 배포가 30분 지연됐다. 이후 모든 파이프라인 스크립트에 `--capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND`를 기본으로 포함했다. CAPABILITY를 최대한 허용해도 CloudFormation이 실제로 IAM 리소스를 생성할 때만 영향을 미치므로 보안 위험이 없다.

## Termination Protection과 운영 거버넌스

```bash
# Stack 실수 삭제 방지
aws cloudformation update-termination-protection \
  --stack-name my-prod-stack \
  --enable-termination-protection

# Termination Protection 상태 확인
aws cloudformation describe-stacks \
  --stack-name my-prod-stack \
  --query 'Stacks[0].EnableTerminationProtection'

# 삭제 전 해제 필요
aws cloudformation update-termination-protection \
  --stack-name my-prod-stack \
  --no-enable-termination-protection
```

Termination Protection이 활성화된 Stack을 삭제하려 하면 오류가 발생한다:
```
TerminationProtection: Stack [my-prod-stack] cannot be deleted while TerminationProtection is enabled
```

> 💡 **관련 이론**: Termination Protection은 인간 실수(Human Error) 방어 계층이다. 넷플릭스의 "Defense in Depth" 문화에서 단일 실수가 돌이킬 수 없는 결과를 초래하지 않도록 여러 확인 단계를 두는 원칙이다. CloudFormation에서 운영 거버넌스의 3개 레이어: (1) Stack Policy — CFn 엔진 레벨에서 특정 리소스 수정 차단, (2) Termination Protection — Stack 전체 삭제 차단, (3) IAM Permission Boundary — 사용자/역할이 CFn 스택 자체를 삭제하는 API 호출 차단. 세 레이어가 각각 다른 공격 표면을 방어한다.

> 🔍 **더 깊이**: CloudFormation에서 가장 위험한 상황은 Replacement를 모르고 수행하는 것이다. EC2 `ImageId` 변경, RDS `MultiAZ` 변경, DynamoDB `TableName` 변경이 모두 Replacement를 트리거한다. Change Set을 실행하면 각 리소스의 변경 유형이 `Replacement: True / False / Conditional`로 표시된다. `Conditional`은 런타임에 결정되는 경우로, 예를 들어 EC2 `InstanceType` 변경은 EBS 최적화 인스턴스 여부에 따라 Replacement가 결정된다. 운영자는 **반드시 Change Set의 Replacement 필드를 확인하고** RDS나 DynamoDB가 `True`이면 `UpdateReplacePolicy: Snapshot`이 설정됐는지 검토해야 한다.

## 전체 흐름 그림

```
CloudFormation 운영자 워크플로
============================================================

[개발자/운영자]
    │ Template 작성 (YAML)
    ▼
[cfn-lint / validate-template]  ← 로컬+원격 검사
    │
    ▼
[create-change-set]  ← Replacement=True 리소스 확인
    │
    ▼
[execute-change-set]
    │
    ▼
┌─────────────────────────────────────────┐
│         CloudFormation Engine           │
│                                         │
│  1. Template 파싱 및 검증               │
│  2. DAG 의존성 분석                     │
│  3. 병렬 리소스 생성/수정/삭제          │
│  4. Stack Policy 체크                   │
│  5. CreationPolicy 신호 대기            │
│  6. 이벤트 스트림 생성                  │
└─────────────────────────┬───────────────┘
                          │
              ┌───────────┴───────────┐
              │ 성공                  │ 실패
              ▼                       ▼
        UPDATE_COMPLETE         UPDATE_ROLLBACK_IN_PROGRESS
                                      │
                                UPDATE_ROLLBACK_COMPLETE
                                (이전 상태로 복원)

이벤트 추적:
aws cloudformation describe-stack-events --stack-name xxx
  → 각 리소스별 상태 변화를 실시간으로 추적
```

## 📝 연습 문제

**문제 1.** CloudFormation Template에서 반드시 있어야 하는 섹션은?

A) AWSTemplateFormatVersion, Resources, Outputs
B) Parameters, Resources, Conditions
C) Resources
D) Description, Resources, Parameters

**정답: C**
해설: CloudFormation Template에서 유일한 필수 섹션은 `Resources`다. 나머지 모든 섹션(AWSTemplateFormatVersion, Description, Metadata, Parameters, Mappings, Conditions, Transform, Outputs, Rules)은 선택이다. 실제로 `Resources` 섹션 하나만 있는 최소 Template도 유효하다.

---

**문제 2.** Stack이 `ROLLBACK_COMPLETE` 상태에 있다. 이 Stack을 동일한 이름으로 새 Template로 업데이트하려 한다. 어떻게 해야 하는가?

A) `update-stack` 명령을 실행한다
B) `create-change-set`으로 변경 사항을 먼저 확인한다
C) `delete-stack`으로 삭제한 후 `create-stack`으로 재생성한다
D) `continue-update-rollback`을 실행한다

**정답: C**
해설: `ROLLBACK_COMPLETE` 상태는 초기 Stack 생성이 실패하고 롤백이 완료된 최종 상태다. 이 상태에서는 업데이트가 불가능하며 삭제만 가능하다. `update-stack`을 시도하면 "Stack is not in a valid state" 오류가 발생한다. `continue-update-rollback`은 `UPDATE_ROLLBACK_FAILED` 상태 전용이다. 반드시 삭제 후 재생성해야 한다.

---

**문제 3.** EC2 인스턴스의 User Data 스크립트가 완료될 때까지 CloudFormation이 기다리게 하려면 어떤 설정이 필요한가?

A) EC2 리소스에 `UpdatePolicy`를 설정한다
B) EC2 리소스에 `CreationPolicy.ResourceSignal`을 설정하고, User Data에서 스크립트 완료 후 `cfn-signal`을 호출한다
C) EC2 리소스에 `DependsOn`을 설정한다
D) `WaitCondition` 리소스를 별도로 생성한다

**정답: B**
해설: `CreationPolicy.ResourceSignal`이 표준 패턴이다. EC2 리소스에 `CreationPolicy`를 정의하면 CloudFormation이 지정된 수(Count)의 `cfn-signal` 성공 신호를 받을 때까지 대기한다. User Data 스크립트 마지막에 `cfn-signal --exit-code $?`를 호출하면 스크립트 성공/실패 여부가 CloudFormation에 전달된다. `WaitCondition`(D)은 이전 방식으로 현재는 CreationPolicy가 권장된다.

---

**문제 4.** CloudFormation 운영자가 S3 버킷 리소스의 `BucketName`을 `old-bucket`에서 `new-bucket`으로 변경했다. Stack 업데이트 시 어떤 일이 발생하는가?

A) S3 버킷 이름이 인플레이스로 변경된다
B) 기존 S3 버킷이 삭제되고 새 이름으로 버킷이 생성된다 (Replacement)
C) 변경이 거부된다
D) 자동으로 버킷 내용이 새 버킷으로 복사된다

**정답: B**
해설: S3 버킷 이름(`BucketName` 속성)은 변경 불가능한 속성(immutable property)이다. 이 속성을 변경하면 CloudFormation이 기존 버킷을 삭제하고 새 이름으로 버킷을 생성하는 Replacement를 수행한다. `DeletionPolicy`가 `Delete`(기본값)이면 기존 버킷과 그 안의 데이터가 모두 삭제된다. Change Set을 사용하면 `Replacement: True`로 사전에 확인할 수 있다. 중요 데이터가 있다면 반드시 `DeletionPolicy: Retain`을 설정해야 한다.

---

**문제 5.** Template에서 현재 리전에 해당하는 최신 Amazon Linux 2 AMI ID를 자동으로 사용하려 한다. 하드코딩이나 Mapping을 사용하지 않는 방법은?

A) `!GetAZs` 함수로 AMI 목록을 가져온다
B) Lambda Custom Resource로 최신 AMI를 조회한다
C) Parameter의 `Type`을 `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>`로 설정하고 `Default`에 AWS 공식 SSM 경로를 지정한다
D) Mappings에 리전별 최신 AMI ID를 매월 업데이트한다

**정답: C**
해설: AWS는 공식 SSM 파라미터 경로(`/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2` 등)에 최신 AMI ID를 자동으로 업데이트한다. Parameter 타입을 `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>`로 설정하면 CloudFormation이 배포 시점에 자동으로 최신 AMI ID를 가져온다. 이 방법은 수동 업데이트 없이 항상 최신 AMI를 사용하는 운영 모범 사례다.

---

**문제 6.** Auto Scaling Group을 CloudFormation으로 관리할 때 `UpdatePolicy: AutoScalingRollingUpdate`를 사용한다. `WaitOnResourceSignals: true`로 설정했을 때의 동작은?

A) `PauseTime`만큼 대기한 후 다음 배치로 이동한다
B) 각 배치의 인스턴스들이 cfn-signal을 보낼 때까지 대기한 후 다음 배치로 이동한다
C) 모든 배치 교체 후 한 번에 cfn-signal을 대기한다
D) ELB 헬스체크가 통과될 때까지 대기한다

**정답: B**
해설: `WaitOnResourceSignals: true`로 설정하면 각 배치(MaxBatchSize)의 인스턴스들이 `cfn-signal`로 준비 완료를 알릴 때까지 대기한 후 다음 배치를 처리한다. `PauseTime`은 `WaitOnResourceSignals: false`일 때 배치 간 고정 대기 시간으로 사용된다. 즉 두 설정은 상호 배타적이다. WaitOnResourceSignals=true면 PauseTime이 cfn-signal 대기의 최대 타임아웃으로 동작한다.

---

**문제 7.** CloudFormation Stack Policy에 대한 설명으로 올바른 것은?

A) Stack Policy는 IAM 정책과 동일하게 동작하며, Principal에 IAM 사용자 ARN을 지정해야 한다
B) Stack Policy를 설정하지 않으면 모든 리소스 업데이트가 기본으로 거부된다
C) Stack Policy는 CloudFormation이 특정 리소스에 수행할 수 있는 업데이트 작업을 제어하며, 기본적으로 모든 업데이트가 허용된다
D) Stack Policy는 Stack 삭제를 방지하는 용도로 사용된다

**정답: C**
해설: Stack Policy는 CloudFormation 엔진이 Stack 업데이트 시 특정 리소스에 수행할 수 있는 작업(Update:Modify, Update:Replace, Update:Delete)을 제어한다. Stack Policy가 **없으면** 모든 리소스 업데이트가 허용된다. Stack Policy가 **설정되면** 명시적으로 Allow된 작업만 허용되고 나머지는 거부된다. Stack 삭제 방지는 Termination Protection이 담당한다(D). Principal은 항상 `"*"`를 사용하며 특정 IAM 사용자 지정이 아니다(A).
