# Day 1 - CloudFormation 기초 (Stack, Template, Resource)

📅 날짜: Week 6 (Day 1)
🎯 주제: IaC의 표준 도구 CloudFormation 구조와 운영
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudFormation의 Template 구조와 라이프사이클을 이해한다
- Parameters, Mappings, Conditions, Outputs의 역할을 안다
- 운영자가 알아야 할 Stack 상태와 트러블슈팅 기본을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **IaC (Infrastructure as Code)**: 인프라를 코드로 선언. 재현 가능, 버전 관리, 리뷰 가능
- **Declarative vs Imperative**: "무엇을 원함"(CFn, Terraform) vs "어떻게 함"(Shell, Boto3)
- **Idempotency**: 같은 템플릿 여러 번 적용해도 결과 동일
- **Immutable infrastructure**: 변경 대신 새로 만들고 교체. 안정성 ↑
- **State management**: CFn은 AWS 내부 상태(Stack), Terraform은 별도 state 파일

---

## 📖 이론 내용

### 1. CloudFormation 개요

#### 핵심 개념
- **Template**: JSON/YAML로 작성된 인프라 설계도
- **Stack**: Template으로 만든 AWS 리소스 모음 (한 단위로 생성·업데이트·삭제)
- **Change Set**: 변경 사항 미리보기 (Day 2에서 자세히)
- **Drift**: 실제 리소스와 Template 차이 (Day 2)

#### 가격
- CFn 서비스 자체는 무료
- 생성된 AWS 리소스만 청구
- CFn Hooks/Public Extensions은 일부 유료

### 2. Template 10대 섹션

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: My web application stack

Metadata:           # 콘솔에 표시할 도움말
  AWS::CloudFormation::Interface:
    ParameterGroups: [...]

Parameters:         # 입력 변수
  EnvType:
    Type: String
    AllowedValues: [dev, prod]
    Default: dev

Mappings:           # 룩업 테이블 (Region → AMI 등)
  RegionMap:
    ap-northeast-2:
      AMI: ami-0abc
    us-east-1:
      AMI: ami-0xyz

Conditions:         # 조건부 리소스 생성
  IsProd: !Equals [!Ref EnvType, prod]

Transform:          # 매크로 (예: SAM)
  - AWS::Serverless-2016-10-31

Resources:          # 실제 AWS 리소스 (필수)
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub 'my-app-${EnvType}-${AWS::AccountId}'

Outputs:            # 다른 Stack 참조용 출력
  BucketArn:
    Value: !GetAtt MyBucket.Arn
    Export:
      Name: !Sub '${AWS::StackName}-BucketArn'

Rules:              # Parameter 유효성 검사
  ValidEnvironments:
    Assertions:
      - Assert: !Contains [[dev, stage, prod], !Ref EnvType]
```

### 3. Parameters

#### 사용 가능한 Type
- `String`, `Number`, `List<Number>`, `CommaDelimitedList`
- `AWS::EC2::KeyPair::KeyName`, `AWS::EC2::SubnetId`, `AWS::EC2::VPC::Id` 등
- `AWS::SSM::Parameter::Value<...>` (Parameter Store에서 값 가져오기)
- `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>` (최신 AMI ID 자동)

#### 제약 옵션
- `AllowedValues`, `AllowedPattern` (정규식)
- `MinLength/MaxLength`, `MinValue/MaxValue`
- `NoEcho: true` (비밀번호 마스킹)

#### 동적 참조
```yaml
DBPassword: !Sub '{{resolve:secretsmanager:${SecretArn}:SecretString:password}}'
LatestAMI: '{{resolve:ssm:/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2}}'
```

### 4. Intrinsic Functions (내장 함수)

| 함수 | 용도 |
|------|------|
| `!Ref` | Parameter 값 또는 리소스 ID 참조 |
| `!GetAtt` | 리소스 속성 참조 (예: `MyBucket.Arn`) |
| `!Sub` | 문자열 보간 |
| `!Join` | 문자열 연결 |
| `!Split` | 문자열 분할 |
| `!FindInMap` | Mappings에서 값 조회 |
| `!If` / `!And` / `!Or` / `!Not` | 조건 |
| `!ImportValue` | 다른 Stack의 Output 가져오기 |
| `!GetAZs` | 리전의 AZ 목록 |
| `!Cidr` | CIDR 블록 분할 |

### 5. Stack 라이프사이클 (상태)

#### 주요 상태

| 상태 | 의미 |
|------|------|
| `CREATE_IN_PROGRESS` | 생성 중 |
| `CREATE_COMPLETE` | 성공 |
| `CREATE_FAILED` | 실패 (롤백 진행 중) |
| `ROLLBACK_IN_PROGRESS` | 실패 후 롤백 중 |
| `ROLLBACK_COMPLETE` | 롤백 완료 — **이 상태는 업데이트 불가, 삭제만** |
| `UPDATE_IN_PROGRESS` | 업데이트 중 |
| `UPDATE_COMPLETE` | 업데이트 성공 |
| `UPDATE_ROLLBACK_FAILED` | 롤백 실패 — `CONTINUE_UPDATE_ROLLBACK` 시도 |
| `DELETE_IN_PROGRESS` | 삭제 중 |
| `DELETE_COMPLETE` | 삭제 완료 |

> 💡 운영 함정: `ROLLBACK_COMPLETE` 상태인 Stack은 업데이트 불가. 삭제 후 재생성하거나 `CONTINUE_UPDATE_ROLLBACK` 명령.

### 6. 자주 쓰는 Resource 속성

#### DeletionPolicy
- `Delete` (기본): Stack 삭제 시 리소스도 삭제
- `Retain`: 삭제 시 리소스 보존 (데이터 보호)
- `Snapshot`: EBS/RDS의 경우 마지막 스냅샷 후 삭제

#### UpdateReplacePolicy
- 업데이트 시 리소스 교체될 때 기존 리소스 처리 방식
- 값은 DeletionPolicy와 동일

#### CreationPolicy
- 리소스 생성 완료 신호 대기 (예: EC2 부팅 완료)

#### UpdatePolicy
- Auto Scaling Group의 Rolling Update 옵션

```yaml
MyASG:
  Type: AWS::AutoScaling::AutoScalingGroup
  UpdatePolicy:
    AutoScalingRollingUpdate:
      MaxBatchSize: 2
      MinInstancesInService: 1
      PauseTime: PT5M
      WaitOnResourceSignals: true
  CreationPolicy:
    ResourceSignal:
      Count: 2
      Timeout: PT15M
```

### 7. 트러블슈팅 패턴

#### Stack 이벤트 확인
```bash
aws cloudformation describe-stack-events \
  --stack-name my-stack \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`].[Timestamp,LogicalResourceId,ResourceStatusReason]'
```

#### Rollback 비활성화 (디버깅용)
```bash
aws cloudformation create-stack \
  --stack-name debug-stack \
  --template-body file://template.yaml \
  --on-failure DO_NOTHING  # 또는 --disable-rollback
```
→ 실패한 리소스가 남아 있어 콘솔에서 직접 디버깅 가능. 단, 비용 청구됨 주의.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Pseudo Parameters** | `AWS::Region`, `AWS::AccountId`, `AWS::StackName` 등 자동 제공 | Sub와 함께 |
| **Stack Policy** | Stack 업데이트 시 특정 리소스 수정/대체 금지 | 운영 보호 |
| **Custom Resources** | Lambda로 임의 로직 | AWS 미지원 리소스 |
| **CDK** | TypeScript/Python으로 CFn 생성 | 추상화 |
| **Hooks** | CFn 작업 중 검증 (e.g. Guard) | 컴플라이언스 |

> ⚠️ **함정 1**: ROLLBACK_COMPLETE는 업데이트 불가. 삭제 후 재생성. 시험 빈출.
>
> ⚠️ **함정 2**: 일부 리소스는 업데이트 시 **교체(Replacement)** 발생 — 데이터 손실 위험. `UpdateReplacePolicy: Retain`으로 방어.
>
> 💡 **암기 팁**: Parameters(입력) → Mappings(룩업) → Conditions(분기) → Resources(실체) → Outputs(공유). 5단계 흐름.

### 관련 서비스 Cross-Reference

- **CFn → Week 6 Day 2** (Change Set, Drift)
- **CFn → Week 6 Day 3** (Nested, StackSets)
- **CFn → Week 1 Day 4** (Organizations - StackSets 활용)
- **CFn → Week 4 Day 3** (Conformance Pack은 CFn 템플릿)

---

## 🏗️ 아키텍처 다이어그램

```
CloudFormation 라이프사이클
==========================================================

   [개발자]
      │ Template 작성
      ▼
   ┌────────────────────┐
   │  Template (YAML)   │
   │  - Parameters      │
   │  - Resources       │
   │  - Outputs         │
   └────────┬───────────┘
            │ create-stack / update-stack
            ▼
   ┌────────────────────┐
   │  CloudFormation    │
   │  - Dependency 분석  │
   │  - 순서 결정       │
   │  - 병렬 생성       │
   └────────┬───────────┘
            │ AWS API 호출
            ▼
   [AWS 리소스 생성]
   EC2, S3, IAM, ALB...

  Stack 상태 추적:
   CREATE_IN_PROGRESS → CREATE_COMPLETE
                     ↓ (실패 시)
                   ROLLBACK_IN_PROGRESS → ROLLBACK_COMPLETE
                                          (업데이트 불가, 삭제만)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Template 필수 섹션 = Resources만** — 나머지는 선택
2. ⭐ **ROLLBACK_COMPLETE 상태는 업데이트 불가** — 삭제 후 재생성
3. ⭐ **DeletionPolicy = Retain**으로 데이터 보호 (S3, RDS)
4. ⭐ **!Ref vs !GetAtt** — Ref는 ID/값, GetAtt는 속성
5. ⭐ **AWS::SSM::Parameter::Value 타입으로 Parameter Store 자동 참조**

---

## 💻 실제 예시 - AWS CLI / Template

```yaml
# template.yaml - 간단한 웹앱 스택
AWSTemplateFormatVersion: '2010-09-09'
Description: Simple web app

Parameters:
  EnvType:
    Type: String
    AllowedValues: [dev, prod]
    Default: dev
  AmiId:
    Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>
    Default: /aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2
  KeyName:
    Type: AWS::EC2::KeyPair::KeyName

Conditions:
  IsProd: !Equals [!Ref EnvType, prod]

Resources:
  WebSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Web tier SG
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0

  WebInstance:
    Type: AWS::EC2::Instance
    Properties:
      ImageId: !Ref AmiId
      InstanceType: !If [IsProd, t3.medium, t3.micro]
      KeyName: !Ref KeyName
      SecurityGroupIds: [!Ref WebSecurityGroup]
      Tags:
        - Key: Name
          Value: !Sub 'web-${EnvType}'
        - Key: Environment
          Value: !Ref EnvType

  DataBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain          # ← 데이터 보호
    UpdateReplacePolicy: Retain
    Properties:
      BucketName: !Sub 'mydata-${EnvType}-${AWS::AccountId}'

Outputs:
  WebInstanceId:
    Value: !Ref WebInstance
    Export:
      Name: !Sub '${AWS::StackName}-InstanceId'
  BucketName:
    Value: !Ref DataBucket
    Export:
      Name: !Sub '${AWS::StackName}-BucketName'
```

```bash
# 1. Stack 생성
aws cloudformation create-stack \
  --stack-name my-webapp-dev \
  --template-body file://template.yaml \
  --parameters \
    ParameterKey=EnvType,ParameterValue=dev \
    ParameterKey=KeyName,ParameterValue=my-key \
  --capabilities CAPABILITY_NAMED_IAM \
  --on-failure ROLLBACK

# 2. 상태 추적
aws cloudformation describe-stacks --stack-name my-webapp-dev

aws cloudformation describe-stack-events \
  --stack-name my-webapp-dev \
  --max-items 20

# 3. 업데이트
aws cloudformation update-stack \
  --stack-name my-webapp-dev \
  --template-body file://template.yaml \
  --parameters ParameterKey=EnvType,ParameterValue=prod ParameterKey=KeyName,UsePreviousValue=true \
  --capabilities CAPABILITY_NAMED_IAM

# 4. 검증
aws cloudformation validate-template --template-body file://template.yaml

# 5. 삭제
aws cloudformation delete-stack --stack-name my-webapp-dev
aws cloudformation wait stack-delete-complete --stack-name my-webapp-dev
```

---

## 📝 연습 문제

**문제 1.** CloudFormation Template의 필수 섹션은?

A) Parameters, Resources, Outputs
B) Resources만
C) Description, Resources
D) AWSTemplateFormatVersion, Resources

**정답: B**
해설: Resources만 필수. 다른 모든 섹션은 선택. AWSTemplateFormatVersion도 권장이지만 필수는 아님.

---

**문제 2.** Stack이 `ROLLBACK_COMPLETE` 상태다. 업데이트하려면?

A) update-stack 실행
B) 삭제 후 재생성 — ROLLBACK_COMPLETE는 업데이트 불가
C) 시간 기다림
D) Force update

**정답: B**
해설: ROLLBACK_COMPLETE는 초기 create 실패의 종점. 업데이트 불가. 삭제 후 재생성 또는 IAM 권한·템플릿 수정 후 새 Stack.

---

**문제 3.** S3 버킷을 CFn으로 만들었는데 Stack 삭제 시 데이터를 보존하려면?

A) DeletionPolicy: Delete
B) DeletionPolicy: Retain
C) UpdateReplacePolicy: Retain만
D) 별도 백업

**정답: B**
해설: `DeletionPolicy: Retain`이 가장 직접적. 보통 `UpdateReplacePolicy: Retain`과 같이 사용해 업데이트 시 교체 발생 시에도 보존.

---

**문제 4.** EC2 인스턴스가 부팅 후 cfn-signal로 신호 보낼 때까지 Stack이 기다리게 하려면?

A) Implicit
B) `CreationPolicy: ResourceSignal: Count: N, Timeout: PT15M` + 인스턴스 User Data에 cfn-signal 호출
C) `UpdatePolicy`
D) Lambda 폴링

**정답: B**
해설: CreationPolicy의 ResourceSignal은 인스턴스가 명시적으로 cfn-signal 호출할 때까지 대기. EC2 부팅·앱 시작 검증에 표준 패턴.

---

**문제 5.** Template에서 가장 최신의 Amazon Linux 2 AMI ID를 동적으로 사용하려면?

A) 하드코딩
B) `Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>` + `Default: /aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2`
C) Lambda Custom Resource
D) Mapping 사용

**정답: B**
해설: AWS가 SSM Parameter Store에 최신 AMI ID를 자동 발행. Parameter 타입으로 동적 참조 → 매번 최신 AMI 사용. Mapping은 수동 관리 필요.

---

## 📌 오늘의 요약

1. Template 10대 섹션 중 필수는 Resources만. 나머지는 선택
2. ROLLBACK_COMPLETE 상태는 업데이트 불가 → 삭제 후 재생성
3. DeletionPolicy: Retain으로 데이터 리소스(S3/RDS) 보호 — 시험 빈출
4. !Ref(ID), !GetAtt(속성), !Sub(보간), !FindInMap(룩업), !If(조건) 5대 함수
5. AWS::SSM::Parameter::Value 타입으로 Parameter Store 동적 참조 — 최신 AMI 자동
