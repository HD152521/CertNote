# Day 1 - CloudFormation 고급 - Nested Stack, Cross-Stack

📅 날짜: Week 8 (Day 1)
🎯 주제: 대규모 IaC를 위한 CFN의 모듈화·재사용·연결 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Nested Stack과 Cross-Stack의 차이를 구분
- Outputs/Exports/ImportValue 사용 시 주의점
- Pseudo Parameter, Intrinsic Function, Conditions
- DeletionPolicy, UpdateReplacePolicy, UpdatePolicy

---

## 🧩 사전 지식 (CS 기초)

- **Tight coupling / Loose coupling**: 결합도. Cross-Stack은 결합도가 높음.
- **Modular IaC**: 작은 단위로 분리해 재사용.
- **Stack drift**: 실제 리소스가 템플릿과 다른 상태.
- **Change Set**: 변경 미리보기. 실제 적용 전 검증.

---

## 📖 이론 내용

### 1. Nested Stack vs Cross-Stack

| 항목 | Nested Stack | Cross-Stack |
|------|--------------|-------------|
| 정의 | 부모 Stack 내에 자식 Stack 포함 | 별도 Stack 간 값 공유 |
| 결합도 | 강함 (부모-자식) | 약함 |
| 업데이트 | 부모 업데이트가 자식 트리거 | 독립적 |
| 사용 사례 | 재사용 모듈 (VPC 등) | 공통 자원 공유 (S3 버킷 ARN) |
| 정의 방식 | `AWS::CloudFormation::Stack` | `Outputs.Export` + `ImportValue` |

**Nested Stack 예:**
```yaml
Resources:
  VpcStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.../vpc.yaml
      Parameters:
        VpcCidr: 10.0.0.0/16
        Environment: !Ref Environment

  AppStack:
    Type: AWS::CloudFormation::Stack
    DependsOn: VpcStack
    Properties:
      TemplateURL: https://s3.../app.yaml
      Parameters:
        VpcId: !GetAtt VpcStack.Outputs.VpcId
        SubnetIds: !GetAtt VpcStack.Outputs.SubnetIds
```

**Cross-Stack 예:**
```yaml
# Stack A (네트워크)
Outputs:
  VpcId:
    Value: !Ref Vpc
    Export:
      Name: !Sub '${AWS::StackName}-VpcId'

# Stack B (앱)
Resources:
  Sg:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !ImportValue Network-VpcId   # Stack A의 Export 이름
```

> ⚠️ **함정**: Export가 다른 Stack에서 ImportValue로 사용되는 동안에는 **소스 Stack 삭제·Output 변경 불가**.

### 2. Pseudo Parameters

| 변수 | 의미 |
|------|------|
| `AWS::AccountId` | 현재 계정 ID |
| `AWS::Region` | 현재 리전 |
| `AWS::StackName` | Stack 이름 |
| `AWS::StackId` | Stack ARN |
| `AWS::Partition` | aws / aws-cn / aws-us-gov |
| `AWS::URLSuffix` | amazonaws.com 등 |
| `AWS::NoValue` | 속성 제거 (조건부) |
| `AWS::NotificationARNs` | 알림 ARN 목록 |

### 3. Intrinsic Functions

| 함수 | 용도 |
|------|------|
| `!Ref` | 리소스/파라미터 참조 |
| `!GetAtt` | 리소스 속성 |
| `!Sub` | 문자열 보간 |
| `!Join` | 문자열 결합 |
| `!Split` | 문자열 분리 |
| `!Select` | 배열 인덱스 |
| `!FindInMap` | Mappings 조회 |
| `!ImportValue` | Cross-Stack Export 가져오기 |
| `!If` / `!Equals` / `!And` / `!Or` / `!Not` | 조건 |
| `!Cidr` | CIDR 분할 |
| `!GetAZs` | 가용 영역 목록 |
| `!Base64` | Base64 인코딩 |
| `!Transform` | 매크로/SAM 변환 |

### 4. Conditions

```yaml
Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]

Conditions:
  IsProd: !Equals [!Ref Environment, prod]
  IsNotDev: !Not [!Equals [!Ref Environment, dev]]

Resources:
  ProdOnlyBackup:
    Type: AWS::Backup::BackupPlan
    Condition: IsProd
    Properties:
      ...

  Db:
    Type: AWS::RDS::DBInstance
    Properties:
      DBInstanceClass: !If [IsProd, db.m6i.4xlarge, db.t4g.medium]
      MultiAZ: !If [IsProd, true, !Ref AWS::NoValue]
```

### 5. DeletionPolicy / UpdateReplacePolicy

| Policy | 값 | 의미 |
|--------|-----|------|
| `DeletionPolicy` | `Delete` (기본) | 리소스 삭제 |
| | `Retain` | Stack 삭제 시에도 리소스 유지 |
| | `Snapshot` | RDS/EBS/Redshift 등 스냅샷 후 삭제 |
| `UpdateReplacePolicy` | 동일 옵션 | 업데이트로 인한 교체 시 동작 |

```yaml
Db:
  Type: AWS::RDS::DBInstance
  DeletionPolicy: Snapshot
  UpdateReplacePolicy: Snapshot
  Properties: ...
```

> ⚠️ Stateful 리소스(DB, S3 데이터)는 반드시 Retain/Snapshot 권장. 실수로 prod DB 삭제 사고 방지.

### 6. UpdatePolicy (ASG 등)

```yaml
Asg:
  Type: AWS::AutoScaling::AutoScalingGroup
  UpdatePolicy:
    AutoScalingRollingUpdate:
      MinInstancesInService: 2
      MaxBatchSize: 1
      PauseTime: PT5M
      WaitOnResourceSignals: true
  Properties: ...
```

Rolling update 정책. WaitOnResourceSignals은 `cfn-signal`로 인스턴스 준비 신호.

### 7. CFN Helper Scripts

- `cfn-init`: cloudinit 메타데이터 기반 자동 설정
- `cfn-hup`: 메타데이터 변경 감지 후 재실행
- `cfn-signal`: 리소스 준비 신호
- `cfn-get-metadata`: 메타데이터 조회

```yaml
UserData: !Base64 |
  #!/bin/bash
  /opt/aws/bin/cfn-init -s ${AWS::StackName} -r Instance --region ${AWS::Region}
  /opt/aws/bin/cfn-signal --exit-code $? --stack ${AWS::StackName} --resource Asg --region ${AWS::Region}
```

---

## 🧠 알아두면 좋은 심화 이론

### Stack Policy

```json
{
  "Statement": [{
    "Effect": "Deny",
    "Action": "Update:*",
    "Principal": "*",
    "Resource": "LogicalResourceId/ProdDatabase"
  }]
}
```

특정 리소스의 변경 보호. Stack 수준 IAM 같은 역할.

### Drift Detection

```bash
aws cloudformation detect-stack-drift --stack-name my-stack
aws cloudformation describe-stack-resource-drifts --stack-name my-stack
```

실제 리소스가 템플릿과 다른지 탐지. **자동 수정 X** — 결과 확인 후 사람이 처리.

### Change Set

```bash
aws cloudformation create-change-set --stack-name my-stack \
  --change-set-name new-features \
  --template-body file://template.yaml

aws cloudformation describe-change-set --change-set-name new-features
# 검토 후
aws cloudformation execute-change-set --change-set-name new-features
```

변경 미리보기 → 실제 영향 파악 후 적용.

### Rollback Configuration

```yaml
RollbackConfiguration:
  RollbackTriggers:
    - Arn: !GetAtt HealthAlarm.Arn
      Type: AWS::CloudWatch::Alarm
  MonitoringTimeInMinutes: 5
```

Stack 업데이트 중 알람 발생 시 자동 롤백.

### Termination Protection

```bash
aws cloudformation update-termination-protection \
  --stack-name prod-vpc \
  --enable-termination-protection
```

prod Stack 실수 삭제 방지.

### 관련 서비스 Cross-Reference

- **StackSets** → Week 8 Day 2
- **Custom Resource** → Week 8 Day 3
- **CDK** → Week 8 Day 4
- **Drift / Config Rules** → Week 14 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
CloudFormation Modular Patterns
==================================================

  Pattern 1: Nested Stack
  ┌──────────────────────────┐
  │ Parent Stack             │
  │  ├─ AWS::CFN::Stack ───► VPC.yaml (S3)
  │  ├─ AWS::CFN::Stack ───► App.yaml
  │  └─ AWS::CFN::Stack ───► DB.yaml
  │   Update parent → update all children
  └──────────────────────────┘

  Pattern 2: Cross-Stack
  Network Stack             App Stack
  ┌──────────────┐         ┌──────────────┐
  │ Outputs:     │         │ ImportValue: │
  │  VpcId       │ ◄──────►│  Network-    │
  │  Export      │         │  VpcId       │
  └──────────────┘         └──────────────┘
   Independent lifecycle
   Export locked while imported

  Pattern 3: Dynamic References
  ┌──────────────────────────┐
  │ Resource                 │
  │  Properties:             │
  │    Pass: '{{resolve:    │
  │     secretsmanager:     │
  │     prod/db:password}}'│
  └──────────────────────────┘
   No plain text in template
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Nested(부모-자식, 강결합) vs Cross-Stack(독립, Export/ImportValue)
2. ⭐ Export 사용 중 소스 Stack 삭제 불가 — Drift 함정
3. ⭐ DeletionPolicy: Retain/Snapshot으로 Stateful 리소스 보호
4. ⭐ Change Set으로 변경 미리보기 필수
5. ⭐ `{{resolve:secretsmanager:...}}` 동적 참조로 시크릿 안전 주입

---

## 💻 실제 예시 - 종합 CFN

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Modular VPC + App + DB

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
    Default: dev

Conditions:
  IsProd: !Equals [!Ref Environment, prod]

Resources:
  VpcStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.amazonaws.com/templates/vpc.yaml
      Parameters:
        Environment: !Ref Environment
        VpcCidr: 10.0.0.0/16

  AppStack:
    Type: AWS::CloudFormation::Stack
    DependsOn: VpcStack
    Properties:
      TemplateURL: https://s3.amazonaws.com/templates/app.yaml
      Parameters:
        VpcId: !GetAtt VpcStack.Outputs.VpcId
        Environment: !Ref Environment

  ProdBackup:
    Type: AWS::Backup::BackupPlan
    Condition: IsProd
    Properties:
      BackupPlan:
        BackupPlanName: prod-daily
        BackupPlanRule:
          - RuleName: Daily
            TargetBackupVault: Default
            ScheduleExpression: cron(0 5 * * ? *)
            Lifecycle:
              DeleteAfterDays: 30

  Db:
    Type: AWS::RDS::DBInstance
    DeletionPolicy: !If [IsProd, Snapshot, Delete]
    UpdateReplacePolicy: !If [IsProd, Snapshot, Delete]
    Properties:
      DBInstanceClass: !If [IsProd, db.m6i.4xlarge, db.t4g.medium]
      MasterUserPassword: '{{resolve:secretsmanager:prod/db:SecretString:password}}'
      MultiAZ: !If [IsProd, true, !Ref AWS::NoValue]
      Engine: postgres
      AllocatedStorage: 100

Outputs:
  AppEndpoint:
    Value: !GetAtt AppStack.Outputs.AppUrl
    Export:
      Name: !Sub '${AWS::StackName}-AppEndpoint'
```

---

## 📝 연습 문제

**문제 1.** Cross-Stack Export가 사용 중인 동안 가능한 작업은?

A) 소스 Stack 삭제
B) Output Export 이름 변경
C) Export를 가리키는 리소스만 업데이트
D) 모두 가능

**정답: C**
해설: Export는 잠겨있어 변경/삭제 불가. 가리키는 측만 자유.

---

**문제 2.** Stateful 리소스(RDS, DynamoDB)를 실수로 삭제하지 않으려면?

A) IAM 정책
B) DeletionPolicy: Retain 또는 Snapshot
C) Termination Protection만
D) Backup만

**정답: B**
해설: DeletionPolicy가 가장 직접적.

---

**문제 3.** CloudFormation 템플릿에 DB 비밀번호를 평문 없이 주입하려면?

A) Parameter NoEcho
B) `{{resolve:secretsmanager:...}}` 동적 참조
C) UserData 안에 환경 변수
D) S3 객체

**정답: B**
해설: 동적 참조가 표준 — 평문 미저장.

---

**문제 4.** Nested Stack의 단점은?

A) 부모-자식 강결합 — 부모 업데이트가 자식 트리거, 큰 Stack에서 변경 영향 광범위
B) 더 비싸다
C) Region 제한
D) IAM 추가 필요

**정답: A**
해설: 결합도가 트레이드오프.

---

**문제 5.** Change Set의 효과는?

A) 자동 적용
B) 변경 미리보기 (어떤 리소스가 추가/수정/삭제되는지 사전 확인)
C) Rollback
D) 비용 절감

**정답: B**
해설: Change Set은 검증용.

---

**문제 6.** Stack Rollback Configuration의 효과는?

A) Stack 업데이트 중 지정 알람 발생 시 자동 롤백
B) IAM 자동 회수
C) DR
D) Cross-Region 복제

**정답: A**
해설: 알람 기반 자동 롤백.

---

**문제 7.** `AWS::NoValue` Pseudo Parameter는?

A) 빈 문자열
B) 속성을 완전히 제거 (Condition 결과로 속성 자체를 없앰)
C) null
D) Region

**정답: B**
해설: 조건부 속성 제거의 정석.

---

## 📌 오늘의 요약

1. Nested(강결합) vs Cross-Stack(독립, Export/ImportValue)
2. DeletionPolicy/UpdateReplacePolicy로 Stateful 리소스 보호
3. `{{resolve:secretsmanager:...}}` 동적 참조로 시크릿 보안
4. Change Set + Rollback Configuration으로 안전 업데이트
5. Conditions + `AWS::NoValue`로 환경별 조건부 리소스
