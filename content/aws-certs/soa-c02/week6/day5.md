# Day 5 - Week 6 종합 복습: CloudFormation 운영 완전 정복

Week 6는 CloudFormation을 단순 "인프라 생성 도구"에서 "대규모 조직의 운영 플랫폼"으로 바라보는 주간이었다. Day 1의 Template 구조와 Stack 라이프사이클에서 시작해, Day 2의 변경 안전 관리(Change Set, Drift, Rollback Trigger), Day 3의 대규모 IaC 패턴(Nested/Cross-Stack/StackSets), Day 4의 자가 서비스와 동적 설정(Service Catalog, AppConfig, AppRegistry)까지 이어졌다.

SOA-C02에서 CloudFormation은 단순 API 암기 문제가 아니다. "어떤 상황에서 어떤 도구를 선택해야 하는가", "이 변경이 Replacement를 유발하는가", "Stack이 이 상태일 때 어떤 복구 방법이 가능한가"를 판단하는 능력을 측정한다. 이 복습은 그 판단력을 기르는 데 집중한다.

## Week 6 핵심 개념 맵

```
CloudFormation 운영 플랫폼
============================================================

[Template 구조]                    [안전한 변경 관리]
 - Resources만 필수                 - Change Set (dry-run)
 - 10개 섹션 (나머지 선택)           - Drift Detection (괴리 감지)
 - Pseudo Parameters              - Rollback Trigger (자동 복구)
 - Intrinsic Functions            - Stack Policy (수정 차단)
 - Dynamic References             - Termination Protection
        │                                   │
        ▼                                   ▼
[Stack 라이프사이클]              [대규모 IaC 패턴]
 ROLLBACK_COMPLETE                 - Nested Stack (모듈화)
   → 삭제 후 재생성                 - Cross-Stack (팀 간 공유)
 UPDATE_ROLLBACK_FAILED            - StackSets (조직 전체)
   → continue-update-rollback      - Auto-deployment (신규 계정)
 DELETE_FAILED
   → --retain-resources
        │                                   │
        ▼                                   ▼
[리소스 보호]                     [거버넌스 & 동적 설정]
 DeletionPolicy: Snapshot/Retain    - Service Catalog (자가 서비스)
 UpdateReplacePolicy: Snapshot      - Launch Constraint (대리 실행)
 cfn-signal (readiness 확인)        - AppConfig (런타임 설정)
 AutoScalingRollingUpdate           - AppRegistry (자산 그룹화)
```

## 핵심 비교표: 혼동하기 쉬운 개념들

**Stack 패턴 비교:**

| 항목 | Nested Stack | Cross-Stack | StackSets |
|------|--------------|-------------|-----------|
| 관계 | 부모-자식 (cascade 삭제) | 독립 (느슨한 결합) | 한 Template → 멀티 대상 |
| 라이프사이클 | 부모가 자식 통제 | 각자 독립 | StackSet이 일괄 관리 |
| 값 전달 | `!GetAtt Stack.Outputs.Key` | `!ImportValue 'export-name'` | Parameters |
| 주요 제약 | 부모 삭제 시 자식도 삭제 | Import 중 Export 변경 불가 | SCP/Permission 충돌 주의 |
| 사용 사례 | 단일 앱 컴포넌트 분리 | 팀 간 VPC/IAM 공유 | 조직 보안/컴플라이언스 표준 |

**변경 안전 도구 비교:**

| 항목 | Change Set | Drift Detection | Stack Policy | Rollback Trigger |
|------|------------|-----------------|--------------|------------------|
| 시점 | **업데이트 전** | **사후 상시 점검** | **업데이트 중** | **업데이트 후** |
| 목적 | 변경 내용 미리 확인 | 수동 변경 감지 | 특정 리소스 수정 차단 | 서비스 이상 시 자동 복구 |
| 핵심 출력 | Replacement: True/False/Conditional | MODIFIED/DELETED/IN_SYNC | Allow/Deny | 자동 롤백 시작 |
| 트리거 | 운영자 수동 실행 | cron/수동 | 모든 update-stack | CloudWatch Alarm |

**리소스 보호 정책 비교:**

| 정책 | 적용 시점 | 보호 대상 | 기본값 |
|------|-----------|-----------|--------|
| `DeletionPolicy: Delete` | Stack 삭제 시 | 해당 리소스 | Delete (삭제) |
| `DeletionPolicy: Retain` | Stack 삭제 시 | 해당 리소스 | 보존 (삭제 안 됨) |
| `DeletionPolicy: Snapshot` | Stack 삭제 시 | RDS/EBS/ElastiCache | 스냅샷 후 삭제 |
| `UpdateReplacePolicy: Snapshot` | 업데이트로 인한 교체 시 | RDS/EBS | 스냅샷 후 기존 삭제 |
| Stack Policy `Update:Delete Deny` | update-stack 실행 시 | 지정 리소스 | (설정 안 하면 모두 허용) |
| Termination Protection | delete-stack 실행 시 | Stack 전체 | 비활성화 |

**거버넌스 서비스 비교:**

| 항목 | Service Catalog | AppConfig | AppRegistry |
|------|-----------------|-----------|-------------|
| 목적 | IaC 자가 서비스 + 표준 강제 | 런타임 설정 동적 변경 | 애플리케이션 자산 그룹화 |
| 핵심 기능 | Launch Constraint (대리 실행) | 점진 배포 + 자동 롤백 | Application + Attribute Group |
| 트리거 | 사용자 클릭 (Provision) | 설정 변경 배포 시작 | 수동 연결 or 자동 태깅 |
| 검증 | Template Constraint | JSON Schema / Lambda Validator | - |

> 💡 **관련 이론**: CloudFormation의 전체 설계는 분산 시스템 이론의 "State Reconciliation" 패턴이다. Kubernetes 컨트롤러가 desired state와 current state를 지속적으로 비교해 수렴시키는 것처럼, CloudFormation은 Template(desired state)와 실제 AWS 리소스(current state)의 차이를 계산해 변경 작업을 수행한다. Drift Detection은 이 수렴 루프의 "역방향 검사"다. 운영자가 Template 밖에서 리소스를 변경했을 때, 현실이 desired state에서 벗어났음을 감지한다. Leslie Lamport의 "State Machine Replication"(1984) 이론이 이 패턴의 이론적 기반이다.

## 중요 실수 컬렉션: 시험에 자주 나오는 함정

**CloudFormation Template & Stack:**

| 실수 | 증상 | 올바른 이해 |
|------|------|-------------|
| `ROLLBACK_COMPLETE`에서 update-stack 시도 | "Stack is not in a valid state" 오류 | 삭제 후 재생성만 가능 |
| `UPDATE_ROLLBACK_FAILED`에 delete-stack | 실패 가능 | `continue-update-rollback --resources-to-skip` |
| cfn-signal Timeout 너무 짧게 설정 | "Failed to receive signal" | yum update만 5~10분, PT15M 이상 권장 |
| RDS MultiAZ 변경이 Replacement인 줄 모름 | 데이터 손실 | Change Set으로 사전 확인 필수 |
| S3 BucketName 변경이 Replacement인 줄 모름 | 버킷과 데이터 삭제 | DeletionPolicy: Retain 설정 후 Change Set 확인 |
| Stack Policy 없으면 "모두 거부" 착각 | 의도치 않은 수정 | Stack Policy 없으면 모두 허용이 기본 |

**Nested Stack & Cross-Stack:**

| 실수 | 증상 | 올바른 이해 |
|------|------|-------------|
| 부모 Stack 삭제 후 자식 Stack도 삭제됨 | 예상치 못한 리소스 삭제 | Nested Stack은 cascade 삭제가 기본 |
| Import 중인 Export 값 변경 시도 | "Export is in use" 오류 | list-imports로 사용 Stack 파악 후 먼저 분리 |
| `!ImportValue` 안에 `!Sub` 중첩 시도 | Template 검증 오류 | ImportValue는 단독 사용만 가능 |
| Nested Stack 자식 Template를 직접 접근 | 부모 우회 관리 어려움 | 가급적 부모 Stack을 통해 관리 |

**StackSets:**

| 실수 | 증상 | 올바른 이해 |
|------|------|-------------|
| SCP 허용 범위 밖 리전에 배포 시도 | Stack Instance 생성 실패 | IAM Policy Simulator로 사전 확인 |
| Stack Instance 없이 StackSet 삭제 시도 | "StackSet is not empty" 오류 | Stack Instance 먼저 삭제 후 StackSet 삭제 |
| FailureTolerance 너무 낮게 설정 | 일부 계정 실패로 전체 중단 | 초기 배포 시 10~15% 설정 |
| Service-Managed에서 수동 IAM Role 생성 | 불필요 + 충돌 가능 | Service-Managed는 Organizations Trusted Access만 필요 |

**AppConfig:**

| 실수 | 증상 | 올바른 이해 |
|------|------|-------------|
| Alarm `treat-missing-data: breaching` 설정 | 데이터 없음 = ALARM → 즉시 롤백 | `notBreaching` 설정 필수 |
| FinalBakeTime 없이 AllAtOnce 사용 | 즉시 100% + 감시 없음 | FinalBakeTime으로 배포 후 모니터링 추가 |
| Validator 없이 잘못된 JSON 배포 | 앱 파싱 에러 | JSON Schema Validator 반드시 추가 |

> 📚 **사례**: 2024년 물류 스타트업 L사에서 CloudFormation으로 관리하던 RDS 인스턴스의 `MultiAZ`를 `false`에서 `true`로 변경했다. 운영자는 "MultiAZ 활성화는 인플레이스 변경"이라고 알고 있었다. 그러나 해당 인스턴스의 엔진 버전이 함께 업그레이드되는 경우 Replacement가 트리거될 수 있었다. Change Set을 사용했다면 `Replacement: Conditional`을 보고 추가 확인을 했을 것이다. 결과적으로 RDS가 교체되어 새 엔드포인트가 생겼고, 애플리케이션 연결 설정을 변경하지 못한 서버들이 5분간 DB 접속 실패를 겪었다. 이후 모든 RDS 변경은 반드시 Change Set 확인 + `UpdateReplacePolicy: Snapshot` 표준이 됐다.

> 🔍 **더 깊이**: CloudFormation의 Replacement 판단 기준은 AWS 내부 리소스 핸들러(Resource Handler)가 결정한다. CloudFormation Registry에 등록된 각 리소스 타입의 스키마에 각 속성의 "createOnlyProperties", "readOnlyProperties" 등이 정의돼 있다. "createOnlyProperties"에 해당하는 속성을 변경하면 반드시 Replacement가 발생한다. AWS CLI로 `aws cloudformation describe-type --type RESOURCE --type-name AWS::RDS::DBInstance`를 실행하면 스키마를 확인할 수 있다. 이를 이해하면 "왜 이 속성 변경은 Replacement를 유발하는가"를 외우지 않고도 판단할 수 있다.

## SOA-C02 시험 핵심 판단 체계

**시나리오: "Stack이 X 상태입니다. 어떻게 해야 하는가?"**

```
Stack 상태별 대응:

ROLLBACK_COMPLETE
  → 삭제 후 재생성. update-stack, continue-update-rollback 불가

UPDATE_ROLLBACK_FAILED
  → continue-update-rollback [--resources-to-skip 문제 리소스]
  → 가장 먼저 이 명령 시도

DELETE_FAILED
  → delete-stack --retain-resources 문제리소스ID
  → 잔여 리소스 수동 정리 후 재삭제

CREATE_FAILED (--on-failure DO_NOTHING 설정 시)
  → 실패 리소스가 남아있어 직접 디버그 가능
  → 디버그 완료 후 반드시 수동 정리
```

**시나리오: "어떤 CFn 패턴을 써야 하는가?"**

```
Q: 하나의 앱을 여러 팀이 각자 배포하는 컴포넌트로 나누고 싶다
   → Nested Stack

Q: 팀 A의 VPC를 팀 B, C, D의 앱 Stack이 공유하고 싶다
   → Cross-Stack Reference (Export/ImportValue)

Q: 50개 계정 모두에 GuardDuty를 배포하고, 신규 계정도 자동 포함하고 싶다
   → StackSets + Service-Managed + AutoDeployment=true

Q: 개발자가 권한 없어도 표준 인프라를 만들 수 있게 하고 싶다
   → Service Catalog + Launch Constraint
```

**시나리오: "데이터 손실 방지"**

```
RDS/ElastiCache 삭제:
  DeletionPolicy: Snapshot (Stack 삭제 시 스냅샷)

RDS 업데이트로 인한 교체:
  UpdateReplacePolicy: Snapshot (업데이트 중 교체 시 스냅샷)

변경 전 안전 확인:
  Change Set → Replacement 필드 확인
  Replacement=True 이면 UpdateReplacePolicy 확인

Stack 실수 삭제 방지:
  Termination Protection 활성화

특정 리소스 수정 방지:
  Stack Policy + Deny Update:Replace/Delete
```

> ⚠️ **함정**: DeletionPolicy와 UpdateReplacePolicy는 "Stack 삭제"와 "업데이트 중 교체"라는 완전히 다른 상황에 적용된다. RDS를 보호하려면 **두 가지를 모두** 설정해야 한다. `DeletionPolicy: Snapshot`만 있고 `UpdateReplacePolicy`가 없으면, Stack 삭제 시에는 스냅샷이 생기지만 업데이트 중 교체가 발생할 때는 기존 RDS가 스냅샷 없이 삭제된다. 시험에서 "RDS 변경 시 데이터 손실을 방지하려면?" 문제의 완전한 답은 `UpdateReplacePolicy: Snapshot`이다.

## 📝 종합 연습 문제

**문제 1.** RDS DB 인스턴스 타입을 `db.t3.medium`에서 `db.r5.large`로 변경하려 한다. 데이터 손실 없이 안전한지 어떻게 확인하는가?

A) 바로 `update-stack`을 실행한다
B) Change Set을 생성하고 `Replacement` 필드를 확인한다. `False`이면 인플레이스 업데이트, `True`이면 RDS 교체 + 데이터 손실 위험
C) 먼저 수동 스냅샷을 만들고 `update-stack`을 실행한다
D) Stack을 삭제하고 새 인스턴스 클래스로 재생성한다

**정답: B**
해설: Change Set이 dry-run 역할을 한다. `describe-change-set`에서 RDS 리소스의 `Replacement` 필드를 확인한다. 인스턴스 클래스 변경은 보통 `False`(인플레이스)이지만, Multi-AZ 변경, 엔진 버전 업그레이드 등과 함께 수행하면 `Conditional` 또는 `True`가 될 수 있다. Change Set 확인 없이 update-stack을 실행하면(A) 예상치 못한 데이터 손실이 발생할 수 있다. C는 Change Set 확인 없이 실행하므로 Replacement 여부를 여전히 모른다.

---

**문제 2.** Stack이 `ROLLBACK_COMPLETE` 상태다. 동일한 이름으로 Template를 수정해 재배포하려 한다. 올바른 절차는?

A) `update-stack`으로 새 Template를 적용한다
B) `create-change-set`으로 변경 사항을 미리 확인한다
C) `delete-stack`으로 삭제한 후 `create-stack`으로 재생성한다
D) `continue-update-rollback`을 실행한다

**정답: C**
해설: `ROLLBACK_COMPLETE`는 최초 Stack 생성 실패 후 롤백이 완료된 최종 상태다. 이 상태에서는 `update-stack`도, `create-change-set`도 불가능하다. `continue-update-rollback`(D)은 `UPDATE_ROLLBACK_FAILED` 전용이다. 반드시 `delete-stack`으로 삭제 후 `create-stack`으로 재생성해야 한다.

---

**문제 3.** 회사가 Organizations로 50개 계정을 관리한다. 모든 계정에 보안 Baseline(CloudTrail, GuardDuty)을 일괄 배포하고, 앞으로 새로 추가되는 계정도 자동으로 포함되길 원한다. 가장 적합한 솔루션은?

A) 50개 계정 각각에 수동으로 CloudFormation Stack을 배포한다
B) StackSets with Service-Managed Permissions + `AutoDeployment=true`를 설정한다
C) EventBridge + Lambda로 신규 계정 생성 이벤트를 감지해 CloudFormation을 실행한다
D) AWS Control Tower로 전환한다

**정답: B**
해설: StackSets Service-Managed + AutoDeployment=true가 정확한 답이다. Organizations와 네이티브로 통합되어 새 계정이 OU에 추가될 때 자동으로 Stack Instance가 생성된다. C도 동작하지만 커스텀 Lambda 유지가 필요해 오버헤드가 크다. D는 Control Tower 전환이 필요해 더 큰 작업이다.

---

**문제 4.** 운영팀이 Production Stack을 실수로 삭제하는 것을 방지하려 한다. 어떤 방법이 가장 직접적인가?

A) IAM 정책에서 `cloudformation:DeleteStack` 권한을 제거한다
B) Stack에 Termination Protection을 활성화한다
C) Stack Policy로 Delete 작업을 Deny한다
D) MFA 디바이스를 필수로 요구한다

**정답: B**
해설: Termination Protection 활성화가 Stack 삭제를 직접 차단하는 가장 단순한 방법이다. 활성화 시 보호를 명시적으로 해제하지 않는 한 `delete-stack`이 오류를 반환한다. A는 IAM 레벨에서 차단하지만, 다른 권한(admin 등)으로 우회 가능하다. Stack Policy(C)는 Stack 업데이트 시 특정 리소스 수정을 차단하는 것이고 Stack 자체 삭제 방지는 아니다.

---

**문제 5.** 개발자가 IAM에서 RDS 생성 권한이 없는데, 표준 RDS 패키지를 자가 서비스로 프로비저닝하게 하려 한다. 어떻게 구성하는가?

A) 개발자에게 임시 RDS 생성 권한을 부여한다
B) Service Catalog Portfolio에 RDS 제품을 등록하고, Launch Constraint에 RDS 생성 권한이 있는 IAM Role을 지정한다
C) CloudFormation Template를 개발자에게 직접 배포하도록 허용한다
D) 개발자가 콘솔에서 직접 RDS를 만들 수 있도록 교육한다

**정답: B**
해설: Service Catalog Launch Constraint가 이 문제의 해법이다. 개발자는 Service Catalog에서 "Provision" 클릭만 한다. 실제 CloudFormation 실행은 Launch Constraint에 지정된 IAM Role(RDS 생성 권한 보유)이 수행한다. 개발자는 카탈로그 이외의 RDS를 만들 수 없다. C는 개발자가 Template를 수정하거나 다른 Template를 사용할 수 있어 표준 강제가 불가능하다.

---

**문제 6.** Lambda 함수의 Feature Flag를 코드 재배포 없이 점진적으로 토글하고 싶다. 배포 중 에러율이 급증하면 자동으로 이전 설정으로 돌아가야 한다. 가장 적합한 도구와 설정은?

A) Parameter Store - Lambda에서 값을 읽도록 구성한다
B) AppConfig + Feature Flag 타입 프로파일 + Canary 배포 전략 + CloudWatch Alarm Monitor 설정
C) DynamoDB 테이블에 Flag 값을 저장한다
D) Lambda 환경 변수를 콘솔에서 변경한다

**정답: B**
해설: AppConfig가 정확한 답이다. Feature Flag 타입 프로파일로 Flag를 정의하고, Canary(또는 Linear) 배포 전략으로 점진적으로 적용한다. Environment에 CloudWatch Alarm Monitor를 연결하면 배포 중 알람 발생 시 자동 롤백된다. Parameter Store(A)도 값 저장은 가능하지만 점진적 배포와 자동 롤백 기능이 없다. Lambda 환경 변수(D)는 변경 시 함수가 재시작되며 점진 배포 기능이 없다.

---

**문제 7.** 누군가 콘솔에서 CloudFormation으로 관리되는 보안 그룹에 `0.0.0.0/0:22` 규칙을 직접 추가했다. 이 변경을 자동으로 감지해 알림을 받으려면?

A) CloudWatch Metric Alarm으로 SG 변경을 감지한다
B) Drift Detection을 EventBridge Scheduled Rule + Lambda로 주기적으로 실행하고, MODIFIED 리소스 발견 시 SNS로 알림을 발송한다
C) GuardDuty가 이 변경을 자동으로 감지한다
D) AWS Inspector로 EC2를 스캔한다

**정답: B**
해설: Drift Detection이 CFn 관리 리소스의 Template 외부 변경을 감지한다. CFn Drift Detection은 자동으로 실행되지 않으므로, EventBridge Scheduled Rule(cron)로 Lambda를 주기적으로 트리거해 `detect-stack-drift`를 실행하고, 결과가 MODIFIED이면 SNS로 알림을 발송하는 자동화가 필요하다. CloudTrail(언급되지 않은 선택지)은 "누가 언제 추가했는가"를 알 수 있지만 현재 상태의 drift를 표시하지 않는다. GuardDuty(C)는 위협 탐지이고 SG 직접 변경은 감지 대상이 아니다.

---

**문제 8.** Cross-Stack Reference에서 Stack A가 VPC ID를 Export하고, Stack B와 Stack C가 `!ImportValue`로 사용 중이다. Stack A의 VPC ID Export를 다른 VPC로 변경하려 한다. 어떻게 해야 하는가?

A) Stack A만 업데이트하면 Stack B, C가 자동으로 새 값을 참조한다
B) 변경하면 즉시 적용되므로 Stack A를 바로 업데이트한다
C) Stack B와 Stack C에서 `!ImportValue`를 제거하고, Stack A를 업데이트한 후, Stack B와 Stack C를 새 Export 값으로 업데이트한다
D) Stack A를 삭제하고 재생성한다

**정답: C**
해설: Cross-Stack의 핵심 제약이다. Stack B, C가 해당 Export를 ImportValue로 사용 중이면, Stack A에서 그 Export 값을 변경하거나 삭제할 수 없다. 먼저 Stack B와 C를 업데이트해 ImportValue 사용을 제거해야 한다. 그 후 Stack A를 업데이트해 새 VPC ID를 Export한다. 마지막으로 Stack B, C를 다시 업데이트해 새 Export 값을 참조하게 한다. 이 과정이 "버전이 있는 Export 이름" 패턴으로 단순화된다.

---

**문제 9.** Stack 업데이트 완료 후 10분 내에 HTTP 5xx 에러율이 급증하면 자동으로 이전 상태로 되돌아가도록 설정하려 한다. 어떤 구성이 필요한가?

A) Lambda 함수로 CloudWatch Alarm을 폴링하고 `cancel-update-stack`을 호출한다
B) `update-stack` 또는 `execute-change-set` 실행 시 `--rollback-configuration`에 CloudWatch Alarm ARN과 `MonitoringTimeInMinutes: 10`을 설정한다
C) CodeDeploy와 CloudFormation을 통합한다
D) CloudFormation 콘솔에서 "Enable Auto Rollback" 옵션을 활성화한다

**정답: B**
해설: Rollback Configuration이 정확한 기능이다. `RollbackTriggers`에 CloudWatch Alarm ARN(5xx 에러 알람)을 지정하고 `MonitoringTimeInMinutes: 10`을 설정한다. 업데이트 완료(UPDATE_COMPLETE) 후 10분 동안 해당 알람을 감시하다가, ALARM 상태가 되면 자동으로 `UPDATE_ROLLBACK_IN_PROGRESS`가 시작된다. 최대 5개 알람을 트리거로 지정할 수 있다.

---

**문제 10.** Template에서 항상 최신 Amazon Linux 2 AMI를 자동으로 사용하고 싶다. 하드코딩이나 Mapping 없이 구현하는 방법은?

A) Mapping에 리전별 최신 AMI를 매월 수동 업데이트한다
B) Lambda Custom Resource로 배포 시마다 최신 AMI를 조회한다
C) Parameter 타입을 `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>`로 설정하고, Default에 AWS 공식 SSM 경로(`/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2`)를 지정한다
D) CloudFormation 콘솔에서 "Use Latest AMI" 옵션을 활성화한다

**정답: C**
해설: AWS는 `/aws/service/ami-amazon-linux-latest/...` SSM 경로에 최신 AMI ID를 자동으로 업데이트한다. Parameter 타입을 `AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>`로 설정하면 CloudFormation이 배포 시점에 자동으로 최신 AMI ID를 가져온다. 수동 업데이트 없이 항상 최신 AMI를 사용할 수 있는 운영 모범 사례다.

---

**문제 11.** AppConfig Deployment Strategy에서 `FinalBakeTimeInMinutes: 15`를 설정했다. `AllAtOnce` 전략으로 배포했을 때 정확한 동작은?

A) 15분에 걸쳐 점진적으로 설정이 적용된다
B) 설정이 즉시 100% 적용되고, 이후 15분 동안 CloudWatch Alarm을 감시한다. 알람 발생 시 자동 롤백된다
C) 15분 후에 배포가 시작된다
D) 배포가 10%씩 15분마다 적용된다

**정답: B**
해설: `AllAtOnce`는 즉시 100% 적용된다. `FinalBakeTimeInMinutes`는 100% 도달 후 추가 모니터링 시간이다. 이 15분 동안 Environment에 설정된 CloudWatch Alarm Monitor를 감시하며, 알람 발생 시 자동 롤백된다. 15분이 지나고 알람이 없으면 배포가 `COMPLETE` 상태로 확정된다. "즉시 배포 + 15분 안전 감시" 패턴이다.

---

**문제 12.** Service Catalog Launch Constraint Role에 Permission Boundary를 설정하는 이유는?

A) Launch Role의 실행 속도를 높이기 위해
B) Launch Role이 Service Catalog API를 호출하기 위해
C) 사용자가 Service Catalog를 통해 Launch Role보다 강력한 권한(예: Admin)으로 리소스를 만드는 권한 에스컬레이션을 방지하기 위해
D) 멀티 계정 배포를 활성화하기 위해

**정답: C**
해설: Permission Boundary가 없으면, Launch Role에 Admin 권한을 부여할 경우 Service Catalog를 통해 사용자가 사실상 Admin 권한으로 임의 리소스를 만들 수 있다. 이를 "권한 에스컬레이션"이라 한다. Permission Boundary는 Launch Role의 최대 유효 권한을 제한한다. 최종 권한 = Launch Role IAM Policy ∩ Permission Boundary. 아무리 IAM Policy를 강하게 줘도 Boundary가 허용하지 않으면 실행 불가다.

## 다음 주 예고 (Week 7)

Week 7은 **배포·프로비저닝** 주간이다. Elastic Beanstalk의 배포 정책(All at Once/Rolling/Immutable/Traffic Splitting), CodeDeploy의 배포 훅과 AppSpec, EC2 Image Builder로 Golden AMI 파이프라인 구축, Launch Template과 Auto Scaling 심화를 다룬다.

SOA-C02에서 배포 정책의 **속도/비용/다운타임 트레이드오프**는 빈출 주제다. 예: "다운타임 없이 최소 비용으로 배포하려면?" → Rolling. "빠르게 배포하되 문제 시 즉시 롤백 가능하려면?" → Immutable.

> 💡 **관련 이론**: 배포 전략은 마틴 파울러(Martin Fowler)가 2010년 정의한 "Deployment Pipeline" 개념의 구체화다. Blue-Green, Canary, Rolling은 트레이드오프가 다른 세 가지 근본 전략이다. AWS 서비스마다 이 전략을 다른 이름으로 구현한다: Beanstalk(Immutable=Blue-Green 유사), CodeDeploy(Blue/Green), AppConfig(Canary), CloudFormation ASG(AutoScalingRollingUpdate). 이름보다 "어떤 메커니즘인가"를 이해하면 어떤 서비스의 문제도 풀 수 있다.
