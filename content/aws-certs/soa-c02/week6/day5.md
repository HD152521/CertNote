# Day 5 - Week 6 복습 + 시나리오 10문제

📅 날짜: Week 6 (Day 5)
🎯 주제: CloudFormation·StackSets·Service Catalog·AppConfig 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 Week 6 핵심 개념 한 줄 요약

1. **CFn 필수 섹션 = Resources만**. 나머지(Parameters, Mappings, Conditions, Outputs)는 선택
2. **ROLLBACK_COMPLETE = 업데이트 불가** — 삭제 후 재생성
3. **DeletionPolicy: Retain**으로 S3/RDS 데이터 보호
4. **Change Set으로 dry-run** — Replacement: True면 데이터 손실 위험
5. **Drift Detection은 수동/주기 실행** — Config Rule 또는 cron Lambda로 자동화
6. **Rollback Trigger = CloudWatch Alarm 기반 자동 롤백** (MonitoringTime 동안)
7. **Termination Protection 운영 Stack 필수**
8. **Nested Stack(부모 관리, cascade) vs Cross-Stack(독립, Export/ImportValue)**
9. **StackSets + Service-Managed Permission**: Organizations 통합. 신규 계정 자동
10. **Service Catalog Launch Constraint**: 사용자 권한 없어도 표준 제품 프로비저닝

---

## 🔍 헷갈리기 쉬운 비교표

| 항목 | Nested Stack | Cross-Stack | StackSets |
|------|--------------|-------------|-----------|
| 관계 | 부모-자식 | 독립 + Export | 한 SourceTemplate, 멀티 대상 |
| 라이프사이클 | cascade | 각자 | 일괄 관리 |
| 사용 사례 | 컴포넌트화 | 공유 리소스 | 멀티 계정/리전 표준 |

| 항목 | Change Set | Drift Detection | Stack Policy |
|------|------------|-----------------|--------------|
| 시점 | 업데이트 전 | 사후 점검 | 업데이트 중 보호 |
| 입력 | 새 Template | 기존 Stack | JSON Policy |
| 출력 | 변경 사항 | IN_SYNC/MODIFIED | 차단 결정 |

| 항목 | Service Catalog | AppConfig | AppRegistry |
|------|-----------------|-----------|-------------|
| 목적 | IaC 자가 서비스 | 런타임 설정 | 애플리케이션 메타 |
| 입력 | CFn Template | JSON 설정 | 자산 매핑 |
| 사용자 | 권한 없어도 OK | 자동 fetch | 운영자 가시화 |

---

## 📝 시나리오 10문제

**문제 1.** RDS DB 인스턴스 타입을 db.t3.medium → db.r5.large로 변경하려 한다. 안전한지 어떻게 확인?

A) 바로 update-stack
B) Change Set 생성 → Replacement 필드 확인 (True면 새 DB 인스턴스 + 데이터 손실 위험)
C) Snapshot 만들고 변경
D) Stack 삭제 후 재생성

**정답: B**
해설: Change Set이 dry-run. RDS 인스턴스 클래스 변경은 보통 Modify(No Replacement). 하지만 일부 속성 변경은 Replacement → 사전 확인 필수.

---

**문제 2.** Stack이 `ROLLBACK_COMPLETE` 상태다. 다음 단계는?

A) update-stack
B) 삭제 후 재생성 — ROLLBACK_COMPLETE는 업데이트 불가
C) 시간 기다림
D) 권한 추가

**정답: B**
해설: ROLLBACK_COMPLETE는 초기 create 실패의 종점. 업데이트 불가. 원인 파악 후 새 Stack 생성.

---

**문제 3.** 회사가 50개 조직 계정에 보안 baseline을 일괄 배포 + 신규 계정에도 자동 적용하려 한다. 어떤 도구?

A) 각 계정 수동 CFn
B) StackSets - Service-Managed Permission + Auto-deployment 활성화
C) Lambda 트리거
D) Config

**정답: B**
해설: StackSets의 Service-Managed 모델. Organizations 통합으로 신규 계정 자동 Stack Instance 생성. Landing Zone 표준.

---

**문제 4.** 운영자가 실수로 Production Stack을 삭제할 위험을 차단하려면?

A) IAM 제한
B) Termination Protection 활성화 - delete-stack 거부
C) MFA
D) Lambda

**정답: B**
해설: Termination Protection이 정답. 활성화 시 명시적 protection 해제 전엔 삭제 불가. 운영 Stack 필수.

---

**문제 5.** 회사가 개발자에게 표준 RDS 인프라를 제공하면서, 개발자가 RDS API 권한 없어도 프로비저닝 가능하게 하려 한다. 어떤 도구?

A) IAM 권한 풀어주기
B) Service Catalog + Launch Constraint - Role이 대리 실행
C) CloudFormation 콘솔
D) Lambda

**정답: B**
해설: 정확히 Launch Constraint의 사용 사례. 개발자는 RDS 권한 없지만 카탈로그 제품을 통해 표준 RDS 프로비저닝 가능. 권한 분리 + 표준 강제.

---

**문제 6.** Lambda 함수의 Feature Flag를 코드 재배포 없이 점진 토글하려 한다. 어떤 도구?

A) Parameter Store
B) AppConfig + Feature Flag + Canary 배포 전략 + 알람 기반 자동 롤백
C) DynamoDB
D) S3

**정답: B**
해설: AppConfig는 Feature Flag + 점진 배포 + 자동 롤백 모두 지원. Parameter Store는 정적 값 저장만.

---

**문제 7.** 누군가 콘솔에서 CFn Stack의 SG에 0.0.0.0/0을 추가했다. 자동 감지 + 알림 시스템은?

A) CloudWatch
B) Drift Detection 주기 실행(cron Lambda) + Drift 발견 시 SNS 알림 (또는 Config Rule `cloudformation-stack-drift-detection-check`)
C) GuardDuty
D) Inspector

**정답: B**
해설: CFn Drift는 자동 아니므로 cron + Lambda로 주기 점검. 또는 Config Rule이 24시간 자동 점검. CloudTrail은 행위 로그지만 drift 자체 감지 X.

---

**문제 8.** Cross-Stack Reference에서 Stack A의 Export가 Stack B에서 ImportValue로 사용 중일 때 Stack A의 그 Output 변경 시도하면?

A) 정상 변경
B) 거부됨 — 사용 중인 Export는 변경/삭제 불가
C) 자동 cascade
D) Stack B 자동 업데이트

**정답: B**
해설: Cross-Stack의 함정. ImportValue 사용 중이면 source Output을 변경할 수 없음. 먼저 dependent stack 정리.

---

**문제 9.** Stack 업데이트 후 5분 안에 에러율이 spike하면 자동 롤백되도록 하려면?

A) Lambda 모니터
B) Rollback Configuration: RollbackTriggers에 CloudWatch Alarm + MonitoringTimeInMinutes 설정
C) Manual rollback
D) Auto Scaling

**정답: B**
해설: CFn Rollback Trigger가 정답. MonitoringTime 동안 알람 모니터링 → 발생 시 자동 이전 상태로.

---

**문제 10.** Template에서 항상 최신 Amazon Linux 2 AMI를 사용하려면?

A) Mapping에 매월 업데이트
B) `Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>` + Default에 AWS 공식 SSM 경로
C) Lambda Custom Resource
D) 하드코딩

**정답: B**
해설: AWS가 SSM Parameter Store에 최신 AMI를 자동 발행. Parameter Type으로 동적 참조 → 매 배포마다 최신 AMI 사용.

---

## 🔮 다음 주 예고 (Week 7)

Week 7는 **배포·프로비저닝** — Beanstalk / CodeDeploy / Image Builder / OpsWorks 등.

- Day 1: Elastic Beanstalk - 배포 정책 (All at once / Rolling / Immutable / Blue-Green)
- Day 2: CodeDeploy - In-place vs Blue-Green, AppSpec, Hooks
- Day 3: EC2 Image Builder, AMI 수명주기, Golden Image 운영
- Day 4: OpsWorks, AWS Proton, Launch Templates 운영
- Day 5: Week 7 복습 + 시나리오 10문제

> 💡 배포 정책의 trade-off (속도/비용/안정성)가 시험 빈출 주제입니다.
