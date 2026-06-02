# Day 3 - Nested Stack, Cross-Stack Reference, StackSets

📅 날짜: Week 6 (Day 3)
🎯 주제: 대규모·멀티 계정 IaC 운영의 핵심 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Nested Stack과 Cross-Stack Reference의 차이를 안다
- StackSets로 멀티 계정·멀티 리전 일괄 배포하는 패턴을 익힌다
- 대형 IaC를 모듈화하는 운영 전략을 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **Modular design**: 큰 시스템을 작은 모듈로 분해. 재사용·테스트 가능
- **Composition over inheritance**: 조립이 상속보다 유연
- **Multi-tenancy**: 여러 고객/계정을 한 시스템에서 운영
- **Centralized governance**: 중앙에서 표준 정책 강제
- **Declarative dependency**: 의존 관계를 선언적으로 표현

---

## 📖 이론 내용

### 1. Nested Stack

#### 개념
- Stack 안에 다른 Stack을 리소스로 포함
- 대형 Template을 작은 컴포넌트로 분리
- 부모 Stack이 자식 Stack 라이프사이클 관리

#### Template 예시
```yaml
Resources:
  NetworkStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.amazonaws.com/my-templates/network.yaml
      Parameters:
        VpcCidr: 10.0.0.0/16
        Environment: !Ref EnvType

  WebStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.amazonaws.com/my-templates/web.yaml
      Parameters:
        VpcId: !GetAtt NetworkStack.Outputs.VpcId
        SubnetIds: !GetAtt NetworkStack.Outputs.PublicSubnetIds
```

#### 장점
- 큰 템플릿(파일 크기 한도)을 분할
- 재사용 가능한 컴포넌트
- 부모 update 시 자식 자동 update

#### 단점
- 부모 Stack 삭제 시 자식도 삭제 (cascade)
- 다른 Stack에서 직접 참조 어려움

### 2. Cross-Stack Reference (Outputs Export/ImportValue)

#### 개념
- 독립된 Stack 간 값 공유
- 한 Stack의 `Outputs.Export` → 다른 Stack의 `!ImportValue`

#### 예시

**Stack A (네트워크)**
```yaml
Outputs:
  VpcId:
    Value: !Ref MyVpc
    Export:
      Name: shared-vpc-id
```

**Stack B (애플리케이션)**
```yaml
Resources:
  WebInstance:
    Type: AWS::EC2::Instance
    Properties:
      SubnetId: !ImportValue shared-vpc-id
```

#### 제약
- Export name은 **계정+리전 단위로 유일**
- Import 사용 중인 Export는 **삭제 불가**
- Stack B가 Import 중이면 Stack A의 해당 Output 변경 불가

#### Nested vs Cross-Stack 비교

| 항목 | Nested Stack | Cross-Stack |
|------|--------------|-------------|
| 라이프사이클 | 부모가 관리 | 독립적 |
| 결합도 | 강함 | 약함 |
| 사용 사례 | 재사용 컴포넌트 | 공유 자원 (VPC, IAM) |
| 삭제 | cascade | 순서 신중 |

### 3. StackSets

#### 개념
- 한 Template을 **여러 계정·여러 리전에 일괄 배포**
- AWS Organizations와 통합 가능
- 신규 계정에 자동 적용 가능 (Auto-deployment)

#### 권한 모델

**Self-Managed Permissions**
- Source 계정에 `AWSCloudFormationStackSetAdministrationRole`
- Target 계정에 `AWSCloudFormationStackSetExecutionRole`
- 사용자가 IAM Role 직접 관리

**Service-Managed Permissions (Organizations)**
- Organizations 자동 관리
- 모든 OU/계정에 자동 권한 위임
- 신규 계정 자동 등록 (Auto-deployment 활성화 시)

#### Deployment 옵션

| 옵션 | 의미 |
|------|------|
| **Concurrency** | 동시에 몇 계정에 배포 |
| **Failure Tolerance** | 몇 계정 실패 허용 (절대값/%) |
| **Region Order** | 리전 배포 순서 |
| **Account Filter** | OU 내 일부만 |

#### 사용 시나리오
- 모든 계정에 보안 Baseline 적용 (IAM Role, CloudTrail, GuardDuty)
- 신규 계정에 자동 표준 VPC
- Conformance Pack 배포 (Config 통합)
- 중앙 모니터링 도구 배포

### 4. StackSets 운영 모범 사례

#### Drift Detection
- StackSet도 drift 감지 가능 — 계정별/Stack instance 별

#### Stack Instance Operations
- 일부 Stack Instance만 업데이트/삭제 가능
- 실패한 계정만 재시도

#### Auto-deployment + Organizations
```bash
aws cloudformation create-stack-set \
  --stack-set-name "OrgBaseline" \
  --template-body file://baseline.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment 'Enabled=true,RetainStacksOnAccountRemoval=false' \
  --capabilities CAPABILITY_NAMED_IAM
```

→ 신규 계정이 OU에 추가되면 자동으로 StackSet 적용. 계정 제거 시 Stack Instance도 정리.

### 5. Template 모듈화 패턴

#### CloudFormation Modules
- AWS::CloudFormation::ModuleVersion으로 사용자 정의 리소스 패키징
- AWS Registry에 등록 후 다른 Template에서 사용

#### CDK (Cloud Development Kit)
- TypeScript/Python으로 CFn 생성
- 추상화·재사용성 ↑
- Constructs로 패턴 라이브러리화

#### SAM (Serverless Application Model)
- Lambda/API Gateway 등 서버리스 전용 단축 문법
- CFn으로 변환됨

### 6. CFn 운영 함정 모음

#### 순환 의존
```
Stack A의 Output → Stack B의 Parameter
Stack B의 Output → Stack A의 Parameter
```
→ 둘 다 생성 불가. 한쪽 의존만 가능.

#### 큰 Template
- Template 본문 한도 51,200 bytes (직접 업로드)
- S3 URL은 1MB까지
- 그 이상은 Nested Stack 또는 CDK 권장

#### Stack Instance Status
- `CURRENT`: 최신 Template 적용됨
- `OUTDATED`: 새 Template 있는데 미적용
- `INOPERABLE`: 복구 불가 (수동 정리 필요)

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **DependsOn** | 명시적 의존 관계 | Ref/GetAtt로 표현 어려울 때 |
| **Implicit dependency** | Ref/GetAtt가 자동 의존 | DependsOn 불필요 |
| **Stack Set Operation Preferences** | 동시성·실패 허용·리전 순서 | 대규모 배포 안전 |
| **Stack Set + SCP** | SCP가 막아도 StackSet 실행 가능? Role에 따라 | 시험 함정 |
| **Account Filter Numeric** | 특정 계정 ID만 또는 제외 | 부분 배포 |

> ⚠️ **함정 1**: Cross-Stack Export 사용 중인 값은 Source Stack에서 삭제·변경 불가. 운영 시 dependency 추적 필요.
>
> ⚠️ **함정 2**: StackSet의 Service-Managed permission은 Organizations Trusted Access 활성화 필요. 사전 설정.
>
> 💡 **암기 팁**: Nested(부모 관리), Cross-Stack(독립 + Export/ImportValue), StackSets(멀티 계정·리전).

### 관련 서비스 Cross-Reference

- **StackSets → Week 1 Day 4** (Organizations와 Landing Zone)
- **Nested Stack → Week 6 Day 4** (Service Catalog 제품)
- **Cross-Stack → Week 8** (네트워크 Stack을 모든 앱 Stack이 import)
- **StackSets → Week 4 Day 3** (Conformance Pack을 StackSet으로 배포)

---

## 🏗️ 아키텍처 다이어그램

```
StackSets 멀티 계정 배포
==========================================================

   [관리 계정 / Source]
        │ create-stack-set
        ▼
   ┌────────────────────────────┐
   │  StackSet                  │
   │  - Template                │
   │  - Permission Model        │
   │    (Service-Managed)       │
   │  - Auto-deployment ON      │
   └────────┬───────────────────┘
            │
   ┌────────┴──────────┬──────────┬──────────┐
   ▼                   ▼          ▼          ▼
  [Acct A]          [Acct B]   [Acct C]   [Acct D]
  Region 1,2        Region 1   Region 1,2 Region 1
   │                 │           │          │
   ▼                 ▼           ▼          ▼
  Stack Instance    Stack       Stack      Stack
  (개별 생성)

   신규 계정 추가:
   → Organizations Event → 자동 Stack Instance 생성
```

```
Nested Stack vs Cross-Stack
==========================================================

  Nested Stack (강한 결합)
  ──────────────────────
   Parent Stack
   ├── Resources:
   │   ├── NetworkStack (자식)
   │   └── WebStack (자식, NetworkStack Outputs 사용)

  → 부모 삭제 = 자식 삭제 (cascade)

  Cross-Stack (느슨한 결합)
  ────────────────────────
   Stack A (Network)
   └── Outputs.Export: shared-vpc-id
   
   Stack B (Web)
   └── !ImportValue shared-vpc-id

  → Stack A 삭제 시 Stack B가 import 중이면 거부됨
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Nested Stack = 부모가 자식 라이프사이클 관리** — cascade 삭제
2. ⭐ **Cross-Stack은 ImportValue 사용 중이면 Source 변경/삭제 불가**
3. ⭐ **StackSets로 멀티 계정·리전 일괄 배포** — Organizations 통합 시 신규 계정 자동
4. ⭐ **Service-Managed Permission Model** = Organizations 자동 권한 위임
5. ⭐ **StackSet Operation Preferences** = Concurrency + Failure Tolerance + Region Order

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Nested Stack 템플릿 사용
cat > parent.yaml <<'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  NetworkStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.ap-northeast-2.amazonaws.com/my-templates/network.yaml
      Parameters:
        VpcCidr: 10.0.0.0/16
  WebStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.ap-northeast-2.amazonaws.com/my-templates/web.yaml
      Parameters:
        VpcId: !GetAtt NetworkStack.Outputs.VpcId
        SubnetIds: !GetAtt NetworkStack.Outputs.PublicSubnetIds
EOF

aws s3 cp network.yaml s3://my-templates/
aws s3 cp web.yaml s3://my-templates/
aws cloudformation create-stack \
  --stack-name webapp-parent \
  --template-body file://parent.yaml

# 2. Cross-Stack Reference
# Stack A의 Outputs
cat > network.yaml <<'EOF'
Outputs:
  VpcId:
    Value: !Ref MyVpc
    Export:
      Name: shared-vpc-id
EOF

# Stack B에서 Import
# !ImportValue shared-vpc-id

# 모든 Export 조회
aws cloudformation list-exports

# 어떤 Stack이 import 중인지
aws cloudformation list-imports --export-name shared-vpc-id

# 3. StackSet 생성 (Service-Managed)
aws cloudformation create-stack-set \
  --stack-set-name "OrgSecurityBaseline" \
  --template-body file://baseline.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment 'Enabled=true,RetainStacksOnAccountRemoval=false' \
  --capabilities CAPABILITY_NAMED_IAM

# Stack Instance 생성 (특정 OU + 멀티 리전)
aws cloudformation create-stack-instances \
  --stack-set-name OrgSecurityBaseline \
  --deployment-targets OrganizationalUnitIds=ou-abc-12345 \
  --regions ap-northeast-2 us-east-1 us-west-2 \
  --operation-preferences 'MaxConcurrentPercentage=25,FailureTolerancePercentage=10,RegionConcurrencyType=PARALLEL'

# 4. StackSet 업데이트 (롤링)
aws cloudformation update-stack-set \
  --stack-set-name OrgSecurityBaseline \
  --template-body file://new-baseline.yaml \
  --operation-preferences 'MaxConcurrentPercentage=10,FailureTolerancePercentage=5'

# 5. StackSet Drift 감지
aws cloudformation detect-stack-set-drift \
  --stack-set-name OrgSecurityBaseline \
  --operation-preferences 'MaxConcurrentPercentage=10'

# 6. Stack Instance 상태 조회
aws cloudformation list-stack-instances \
  --stack-set-name OrgSecurityBaseline \
  --query 'Summaries[*].[Account,Region,Status,StatusReason]' \
  --output table
```

---

## 📝 연습 문제

**문제 1.** 회사가 모든 조직 계정(50개)에 보안 baseline(IAM Role, CloudTrail)을 일괄 적용하고, 신규 계정도 자동 포함하려 한다. 어떤 도구?

A) 각 계정마다 CFn 실행
B) StackSets - Service-Managed Permission + Auto-deployment 활성화
C) Lambda 트리거
D) Config Conformance Pack만

**정답: B**
해설: StackSets의 Service-Managed 모델은 Organizations 통합. Auto-deployment 켜면 신규 계정이 OU에 추가될 때 자동 Stack Instance 생성. 50개 계정에 한 번에 배포 + 미래 자동.

---

**문제 2.** Stack A의 Output Export를 Stack B가 ImportValue로 사용 중이다. Stack A의 해당 Output을 수정하려 한다. 결과는?

A) 정상 변경
B) 변경 거부 — Stack B가 사용 중이라 Output을 변경/삭제할 수 없음
C) 자동 cascade
D) Stack B가 자동 업데이트

**정답: B**
해설: Cross-Stack Export는 사용 중일 때 변경/삭제 불가. 먼저 Stack B의 import를 제거하거나 dependent stack 모두 업데이트해야.

---

**문제 3.** 회사 운영자가 큰 단일 Template(50,000줄)을 관리하기 어렵다. 어떻게 분리?

A) Template 압축
B) Nested Stack으로 컴포넌트 분리 (네트워크/웹/DB 등) 또는 CDK 사용
C) 그대로 사용
D) Lambda

**정답: B**
해설: Nested Stack은 정확히 이런 목적. 부모-자식 관계로 컴포넌트 분리. 더 발전된 방식은 CDK(코드로 인프라 작성).

---

**문제 4.** StackSet 배포 중 25% 계정에서 실패가 발생했지만 운영자는 진행하길 원했다. 결과는?

A) 자동 중단
B) Failure Tolerance 설정이 25% 이상이면 계속 진행, 미만이면 중단. 기본값 0이면 첫 실패에 중단
C) 모든 계정에 롤백
D) 무시

**정답: B**
해설: Operation Preferences의 Failure Tolerance가 핵심. 절대값 또는 % 지정. 기본 0이면 첫 실패에 중단. 운영 시 적절히 설정해야.

---

**문제 5.** Service-Managed StackSet을 사용하려면 Organizations에서 필요한 사전 설정은?

A) 없음 — 자동
B) Trusted Access 활성화 (`enable-aws-service-access --service-principal stacksets.cloudformation.amazonaws.com`)
C) SCP 추가
D) Identity Center

**정답: B**
해설: StackSets의 Service-Managed 모델은 Organizations Trusted Access 필요. 활성화 시 자동 권한 위임 + 신규 계정 자동 발견.

---

## 📌 오늘의 요약

1. Nested Stack: 부모-자식 관계. cascade 삭제. 컴포넌트화에 활용
2. Cross-Stack: 독립 Stack 간 Export/ImportValue. 사용 중인 Export는 변경 불가
3. StackSets: 멀티 계정·리전 일괄 배포. Service-Managed + Organizations로 신규 계정 자동
4. Operation Preferences: Concurrency + Failure Tolerance + Region Order로 안전 배포
5. 큰 Template은 Nested 또는 CDK로 분리. Template 본문은 51,200 bytes 한도
