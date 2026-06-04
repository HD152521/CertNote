# Day 5 - Week 8 통합 시나리오: IaC 도구가 한 인시던트 안에서 만나는 자리

Week 8을 통과하면서 CloudFormation의 Nested/Cross-Stack, StackSets의 Service-managed, Custom Resource의 ResponseURL 프로토콜, Hooks의 사전 검증, CDK의 Construct Level과 Pipelines self-mutation, Terraform tfstate의 잠금까지 일곱 가지 도구를 봤다. 시험에서 어렵게 출제되는 문제는 이 도구들이 따로 등장하지 않는다. **한 시나리오 안에 셋, 넷이 동시에 얽혀 "어디서 어떤 도구로 풀어야 하는가"를 묻는다**. 오늘은 그 통합 감각을 만든다.

문제를 풀기 전에 한 번 더 정리하자. IaC 도구는 **추상화 계층**, **거버넌스 범위**, **변경 시점**의 세 축으로 구분된다. 추상화는 CFN(YAML) → SAM(매크로) → CDK(코드)로 올라가고, 거버넌스는 단일 Stack → 단일 계정 다 Stack → 멀티 계정(StackSets/Pipelines)으로 확장되며, 변경 시점은 합성 시점(Aspects/cdk-nag) → 배포 전(Hooks) → 배포 중(ChangeSet) → 배포 후(Drift/Config)의 네 단계가 있다. 시험 시나리오는 이 세 축의 어디에 답이 있는지를 묻는다.

## 통합 비교표 — Week 8 전체 도구

| 도구 | 추상화 | 거버넌스 | 변경 시점 | 한 줄 요약 |
|------|--------|----------|-----------|------------|
| **CloudFormation** | 선언적 YAML | Stack 단위 | 배포 시 | 기반 엔진, 13년 묵은 거버넌스 자산 |
| **SAM** | CFN 매크로 + 서버리스 DSL | Stack | 합성→배포 | 서버리스 보일러플레이트 축약 |
| **CDK** | 코드(TS/Py/Java) | Stack | 합성→배포 | LLVM IR 패턴, 코드 재사용성 |
| **CDK Pipelines** | 코드 | 멀티 환경 | self-mutating CI | 파이프라인도 코드, GitOps 원칙 |
| **StackSets** | CFN 동기화 | 멀티 계정 멀티 리전 | OU 단위 fan-out | 1000+ 계정의 진실 단일 원천 |
| **Custom Resource** | Lambda Provider | Stack 내부 확장 | 배포 중 호출 | CFN을 라이프사이클 엔진으로 확장 |
| **CFN Hooks** | Resource Type Provider | Stack 또는 Org | 변경 사전 차단 | K8s ValidatingAdmissionWebhook 패턴 |
| **CFN Drift** | 감지 메커니즘 | Stack/StackSet | 배포 후 비교 | 감지만, 자동 수정 X |
| **Change Set** | 변경 미리보기 | Stack | 배포 전 검토 | Replacement=True 위험 신호 |
| **Terraform** | HCL | tfstate 단위 | plan→apply | 멀티 클라우드, tfstate 자가 관리 |
| **CDKTF** | 코드 → HCL | tfstate | 합성 | CDK 구문 + Terraform Provider |

이 표를 머리에 두고 시나리오를 본다. 각 시나리오는 회사가 마주친 실제 운영 상황에 가깝게 만들었고, 정답 외 보기들도 부분적으로 맞는 답이 섞여 있어 "가장 적절한"을 골라야 한다.

---

## 📝 연습 문제

**문제 1.** 한 핀테크가 AWS Organizations 환경에서 200개 자식 계정에 동일한 GuardDuty/CloudTrail/Config 베이스라인을 배포하고, 매주 추가되는 신규 계정에는 자동으로 같은 베이스라인이 적용되어야 한다. 또 Management Account의 일상 사용을 최소화하라는 보안팀 요구가 있다. 가장 적절한 구성은?

A) Self-managed StackSets로 배포하되 신규 계정마다 운영자가 계정 ID와 사전 IAM 실행 역할을 수동 추가 — 200 계정 + 매주 신규에 비현실적이고 Management Account 사용도 줄지 않음
B) Lambda를 EventBridge 계정 생성 이벤트로 트리거해 각 계정에 boto3로 베이스라인 적용 — 멱등성·실패 재시도·동시성 제한·롤백을 전부 직접 구현해야 함
C) Tooling 계정을 Delegated Administrator로 등록 + Service-managed StackSets + AutoDeployment Enabled로 OU 타겟 지정
D) 모든 계정에 운영자가 SSH/콘솔로 GuardDuty·CloudTrail·Config를 직접 설정 — 인프라 자동화를 포기한 수동 운영으로 200 계정 규모에서 불가능

**정답: C**

해설: 세 가지 요건이 모두 다른 도구를 가리킨다. (1) 200 계정 자동 적용 = Service-managed(Self-managed의 닭과 달걀 문제), (2) 신규 계정 자동 = AutoDeployment Enabled, (3) Management Account 보호 = Delegated Administrator 위임. 셋 다 충족하는 조합이 C. Self-managed(A)는 사전 IAM 필요로 200 계정에 비현실적, Lambda 직접 호출(B)은 멱등성/실패처리/동시성 정책 자체 구현 부담, D는 인프라 자동화 무시. 시험에서 "OU 단위 + 자동" 키워드가 함께 오면 거의 항상 Service-managed + AutoDeployment 정답.

---

**문제 2.** 한 SaaS 회사가 prod CloudFormation Stack에 RDS DBInstance 변경을 배포했더니 의도치 않게 데이터베이스가 교체되면서 6시간 다운타임이 발생했다. 같은 사고가 재발하지 않도록 표준 변경 절차를 강화하려면 가장 적절한 조합은?

A) `aws cloudformation deploy` 한 줄로 모든 환경에 동일하게 배포 — Change Set의 Replacement=True 정보를 사람이 검토할 기회 없이 교체가 그대로 실행됨
B) CodePipeline에 CreateChangeSet → ManualApproval(Change Set의 Replacement 정보 검토 강제) → ExecuteChangeSet 3단 구성 + prod RDS에 DeletionPolicy=Snapshot/UpdateReplacePolicy=Snapshot + Stack Policy로 Replace/Delete Deny
B-alt) `--require-approval=any-change` 옵션만 추가 — 모든 변경에 확인을 걸 뿐 RDS 교체 시 데이터 백업(UpdateReplacePolicy)도 Replace 차단(Stack Policy)도 없어 단일 방어선
C) 배포 IAM 권한만 강화해 RDS 변경 권한 제한 — IAM은 누가 변경 가능한지만 통제하지 CFN을 통과한 정당한 변경의 교체 위험은 막지 못함
D) Drift Detection 자동화만 추가 — 배포 후 비교라 이미 교체·다운타임이 발생한 사후 시점에야 감지됨

**정답: B**

해설: 사고의 근본 원인은 (1) Change Set 검토 없이 직접 배포, (2) UpdateReplacePolicy 미설정, (3) Stack Policy 부재의 세 가지 결함이 겹친 것. 한 가지 방어선만으론 같은 사고 재발. defense in depth로 (1) Change Set + Manual Approval로 사람 검토 강제(SOC 2/PCI 거버넌스 요건), (2) UpdateReplacePolicy=Snapshot으로 교체 시 데이터 백업, (3) Stack Policy로 Replace/Delete 자체 차단. `aws cloudformation deploy`(A)는 Change Set 정보 안 보여줌, IAM(C)은 CFN 통과 변경에 약함, Drift(D)는 사후 감지로 사고 후 시점.

---

**문제 3.** 한 게임사가 운영 중인 CloudFormation 환경에서 네트워크 Stack의 `VpcId` Export가 50개 다른 Stack의 ImportValue로 사용되고 있다. VPC를 확장하기 위해 네트워크 Stack을 업데이트하려 했더니 "Cannot update Export" 오류로 전체 배포가 멈췄다. 즉시 해결과 장기 개선을 모두 만족하는 답은?

A) 즉시 네트워크 Stack을 삭제 후 재생성 — VpcId Export가 사라지는 순간 ImportValue로 묶인 의존 Stack 50개가 동시에 깨지고 VPC 삭제로 전 워크로드가 중단됨
B) 즉시: 의존 Stack 50개에서 ImportValue 일시 제거 → 네트워크 Stack 업데이트 → 의존 Stack에 ImportValue 재추가의 3단 배포. 장기: Cross-Stack Export 대신 SSM Parameter Store + 동적 참조(`{{resolve:ssm:/network/vpc-id:1}}`)로 마이그레이션
C) 51개 Stack을 하나의 Nested Stack 트리로 통합 — Export 잠금은 사라지지만 전체가 강결합되어 작은 변경의 폭발 반경이 50개 Stack 전체로 커짐
D) 전체를 Terraform으로 마이그레이션 — tfstate 참조로 잠금은 회피하나 마이그레이션 비용이 크고 당장의 "Cannot update Export" 차단을 즉시 풀어주지 못함

**정답: B**

해설: Export는 사용 중이면 잠금(2022년 게임사 12시간 prod 배포 마비 사례와 같은 패턴). 즉시 해결은 3단 배포 외 방법이 없음 — 의존 측의 ImportValue 제거가 잠금 해제 조건. 장기적으로 같은 사고 재발 방지는 AWS Best Practices의 권고대로 Parameter Store 전환. 버전 명시 동적 참조는 의도치 않은 변경 영향 통제. Stack 삭제 재생성(A)은 의존 Stack 50개도 다 깨짐, Nested 통합(C)은 50개 Stack 전체 강결합으로 폭발 반경 키움, Terraform(D)은 비용 큰데 본질 해결 아님.

---

**문제 4.** 한 회사가 신규 출시된 AWS Bedrock 모델을 CloudFormation에 코드화하려는데 일부 deep feature가 아직 CFN 지원이 안 됨을 확인했다. 그 부분만 Custom Resource Lambda로 처리하려 한다. 운영 안정성을 위해 가장 중요한 설계 요소는?

A) Lambda 메모리 크기를 넉넉히 할당 — 처리 속도에는 영향을 주지만 ResponseURL 응답 누락 시 Stack이 최대 3일 묶이는 핵심 위험과는 무관
B) Lambda가 모든 분기(Create/Update/Delete + 예외)에서 ResponseURL에 반드시 PUT 응답 + PhysicalResourceId 동일성 키 유지(Update에서 새 ID 반환 시 자동 자원 교체 발생) + 장시간 작업은 CDK Provider framework의 isComplete 패턴으로 Step Functions polling
C) Lambda 호출 비용 최적화 — 부수적 비용 항목일 뿐 Custom Resource의 응답 프로토콜·PhysicalResourceId 안정성 같은 운영 안정성 요소가 아님
D) Provider Lambda의 배포 Region 선택 — 자원 위치 결정 요소일 뿐 CFN이 Stack을 멈추거나 자원을 교체하는 실패 모드와 직접 관련이 없음

**정답: B**

해설: Custom Resource 운영의 세 가지 핵심 함정. (1) 응답 누락 시 CFN 1시간(최대 3일) 대기 → Stack 묶임, (2) PhysicalResourceId 변경 시 자동 자원 교체(2020년 핀테크 결제 API key 사고 패턴), (3) Lambda 15분 한계 회피에 CDK Provider isComplete. 셋 다 시험과 실무에서 반복 출제. AWS는 `cfn-response` Python 모듈과 CDK Provider 사용을 권장 — boilerplate가 위 세 함정을 추상화. 신규 서비스 CFN 시차를 메우는 Custom Resource는 흔한 패턴이라 운영 안정성이 곧 회사 신뢰의 지표.

---

**문제 5.** 한 SaaS가 200개 마이크로서비스에 같은 패턴(Lambda + DynamoDB + API Gateway + X-Ray + CloudWatch Alarm)을 CDK로 배포한다. 보안팀이 새 정책("모든 Lambda는 reserved concurrency 100 이하, 모든 DynamoDB는 point-in-time recovery 활성")을 적용하려 한다. 200개 서비스 코드를 수정하지 않고 일관 강제하려면?

A) 200개 서비스 코드를 팀별로 손으로 수정해 reserved concurrency·PITR를 추가 — 일관성을 사람에 의존하고 누락·드리프트가 불가피하며 정책 변경 때마다 200곳을 반복 수정
B) 자체 L3 Construct(`StandardLambdaApiPattern`)를 만들어 모든 서비스가 그걸 사용, 정책 변경을 Construct 한 곳에 적용 + 동시에 CDK Aspects로 트리 전체 검증(`Annotations.addError`) + cdk-nag 룰셋으로 합성 시점 차단 + CFN Hooks로 배포 시점 차단의 다층 방어
C) IAM 정책으로 강제 — IAM은 누가 무엇을 호출하는지만 통제하지 reserved concurrency 값이나 DynamoDB PITR 같은 리소스 속성 구성을 강제할 수 없음
D) Service Catalog에 승인 제품으로 단순 등록 — 자가 서비스 프로비저닝 카탈로그일 뿐 이미 존재하는 200개 서비스에 정책을 소급 강제하지 못함

**정답: B**

해설: 거버넌스의 다층 방어 — (1) 자체 L3 Construct로 정책을 코드 한 곳에 응집, (2) Aspects/cdk-nag로 합성(synth) 시점에 위반 차단 → CI 파이프라인의 이른 시점 피드백, (3) Hooks로 배포 시점 변경 사전 차단 → 정책 우회 변경도 막힘. 한 계층만으론 우회 가능(예: L3 안 쓰고 직접 L2 사용 → Aspects가 잡음). IAM(C)은 무관, Service Catalog(D)는 자가 서비스 등록이지 정책 강제 아님. K8s OPA Gatekeeper의 admission control + Helm chart 표준화와 같은 패턴.

---

**문제 6.** 한 게임 회사가 CDK Pipelines로 Dev/Staging/Prod 3환경 배포 중인데 Prod 계정 추가 후 빌드가 "KMS access denied" 오류로 실패한다. Pipeline은 Tooling 계정에 있고 Prod는 별도 계정이다. 가장 정확한 원인과 해결은?

A) 빌드 단계 Lambda의 IAM 권한 부족 — 오류가 "KMS access denied"로 특정되고 Prod 계정 추가 직후 발생한 점은 Lambda 권한이 아니라 교차 계정 키 공유 문제를 가리킴
B) `crossAccountKeys: true` 미설정 — CodePipeline 아티팩트 S3 객체가 AWS 관리형 KMS로 암호화되어 다른 계정 cfn-exec-role이 복호화 불가. CDK에서 `crossAccountKeys: true` 활성화로 운영자 정의 CMK 자동 생성 + Key Policy에 모든 대상 계정 권한 추가
C) Pipeline과 Prod 계정의 Region 불일치 — 리전이 어긋나면 리소스 not found류 오류가 나지 KMS 복호화 거부로 특정되지 않음
D) 배포 Lambda의 timeout 부족 — 실행 시간 한계 문제는 timeout 오류로 드러나지 KMS access denied로 나타나지 않음

**정답: B**

해설: 멀티 계정 CDK Pipelines의 가장 흔한 함정. AWS 관리형 KMS 키는 다른 계정에 공유 불가하므로 멀티 계정 아티팩트 복호화에 운영자 정의 CMK 필수. `crossAccountKeys: true`가 CDK에서 이 인프라(CMK 생성, Key Policy 자동 갱신, S3 SSE-KMS 설정)를 추상화. 부수적으로 각 대상 계정의 bootstrap에 `--trust TOOLING-ACCT` 옵션도 필요(deploy role의 trust policy에 Tooling 계정 추가). $1/월/key 추가 비용이지만 처음부터 켜고 시작이 표준.

---

**문제 7.** 한 SaaS가 CDK Aspects를 도입해 모든 S3에 암호화 강제, 모든 RDS에 multi-AZ 강제, 모든 Lambda에 dead letter queue 강제, 모든 ALB에 WAF 연결 강제 등 30개 cdk-nag 룰을 prod에 한 번에 적용했더니 빌드가 1200개 위반으로 실패해 모든 배포가 멈췄다. 적절한 도입 전략은?

A) 30개 룰을 모두 비활성화해 배포 차단을 해제 — 빌드는 통과하지만 암호화·multi-AZ·WAF 같은 보안 거버넌스를 통째로 포기하는 것이라 본래 목적과 정반대
B) 30개 룰을 한 번에 enforce로 유지한 채 1200개 위반을 일괄 수정 시도 — 모든 배포가 멈춘 상태로 광범위한 동시 수정을 강행해 회귀·다운타임 위험이 큼
C) Graceful rollout: 1단계 모든 룰을 warning으로 → 베이스라인 위반 측정 → 우선순위 룰(보안 영향 큰 것) 5개부터 enforce → 분기마다 5~10개씩 enforce 추가 → 6개월에 걸친 단계적 확장. CFN Hooks WARN→FAIL, K8s OPA Gatekeeper dryrun→warn→deny와 같은 패턴
D) 30개 룰을 prod 환경에만 enforce하고 dev/staging은 제외 — 정작 위반이 가장 많은 prod에 한 번에 강제하는 셈이라 prod 배포가 그대로 마비됨

**정답: C**

해설: 거버넌스 도구 도입의 일반 원칙 — 한 번에 모든 정책 강제는 운영 마비. 단계적 도입이 표준. (1) Warning으로 측정, (2) 우선순위 룰 점진 enforce, (3) 기존 위반 해소 시간 부여. 보안 우선순위는 데이터(암호화), 가용성(multi-AZ), 노출(public access)순. 30개 룰을 한 번에는 절대 안 됨. 2022년 SaaS의 cdk-nag NIST 800-53 Rev5 룰셋 1200개 위반 사고와 같은 패턴. Aspects/Hooks/Config Rules/OPA 모두 같은 graceful rollout 권장.

---

**문제 8.** 한 핀테크가 자회사 매각으로 5개 자식 AWS 계정을 Organizations에서 제거했더니 StackSets로 배포된 베이스라인 Stack이 자동 삭제되면서 그 안의 CloudTrail Trail이 사라졌고 매각 직전 90일치 감사 로그가 유실됐다. 재발 방지를 위한 가장 정확한 조합은?

A) AWS Organizations 사용을 중단 — 자동 정리 트리거는 사라지지만 멀티 계정 거버넌스 자체를 포기하는 과도한 대응이고 감사 로그 보존 문제도 해결하지 못함
B) StackSet 설정에 `RetainStacksOnAccountRemoval=true` + 베이스라인 템플릿의 모든 stateful/감사 리소스(CloudTrail, S3 로그 버킷)에 `DeletionPolicy: Retain` 설정 + 가능하면 로그를 별도 중앙 계정(Log Archive)으로 streaming해 멤버 계정 의존 제거
C) 계정 매각 시점에 운영자가 감사 로그를 수동 백업 — 사람이 잊거나 시점을 놓치면 그대로 유실되는 일회성 절차라 재발 방지가 되지 못함
D) 베이스라인 StackSet을 비활성화 — 자동 삭제는 피하지만 신규 계정 베이스라인 배포가 멈춰 거버넌스 공백이 생김

**정답: B**

해설: 다층 방어. (1) RetainStacksOnAccountRemoval=true: OU 이탈 시 Stack 자체 보존, (2) DeletionPolicy: Retain: 어떤 경로의 Stack 삭제에도 리소스 보존, (3) 중앙 Log Archive: 멤버 계정 사라져도 로그 보존. 셋 다 같이 해야 안전. 한 가지만으론 우회 경로 있음(RetainStacksOnAccountRemoval만 켜고 Stack 안의 리소스 DeletionPolicy 기본=Delete면 Stack 삭제 시 리소스 사라짐). Control Tower의 Log Archive 계정 패턴이 이 권고의 구현. 감사 로그는 단일 계정에 의존하면 안 됨.

---

**문제 9.** 한 회사가 매주 새 환경(고객별 sandbox 5개)을 추가하는데 그때마다 운영자가 CodePipeline 정의를 손으로 수정하고 CFN으로 파이프라인을 재배포한다. 자동화하려면 가장 적절한 도구는?

A) 일반 CodePipeline + 운영 스크립트로 정의를 갱신 — 파이프라인 정의와 실행이 분리되어 새 환경 추가 때마다 외부 스크립트로 재배포하는 수동 단계가 그대로 남음
B) CDK Pipelines `selfMutation: true` + CDK 코드에서 환경 목록을 동적 생성(JSON/YAML 설정 파일 읽기 또는 for 루프). Git에 환경 추가 commit만 하면 다음 실행에 UpdatePipeline 단계가 파이프라인 자체에 새 Stage 추가
C) Lambda로 파이프라인 정의를 자동 갱신 — 동작은 하지만 멱등성·실패 재시도·동시 변경 충돌 처리를 자체 구현해야 해 운영 부담이 큼
D) Terraform으로 파이프라인을 관리 — apply로 환경 추가는 가능하나 self-mutation처럼 파이프라인이 스스로를 갱신하는 native 흐름은 아님

**정답: B**

해설: self-mutation = 파이프라인이 첫 Stage에서 자기 자신 update. CDK 코드에서 환경 목록을 동적 처리하면 새 환경 추가가 코드 commit 한 번으로 자동 반영. 일반 CodePipeline(A)은 정의와 실행이 분리되어 파이프라인 수정에 별도 도구 필요. Lambda 자가 갱신(C)은 가능하지만 멱등성/실패처리 자체 구현 부담. Terraform(D)도 가능하지만 CDK Pipelines의 self-mutation이 가장 native. GitOps "파이프라인도 코드" 원칙의 가장 깔끔한 AWS 구현.

---

**문제 10.** 500 계정 환경에서 GuardDuty가 어떤 계정에서 비활성화되어 있는지 실시간 평가하고 자동으로 재활성화하라는 보안팀 요구가 있다. 가장 적절한 다층 구성은?

A) StackSets Drift Detection만으로 GuardDuty 비활성화를 감지 — Drift는 비주기·수동 트리거이고 자동 수정이 없어 500 계정 실시간 평가·자동 재활성화 요건을 단독으로 충족하지 못함
B) (1) StackSets Service-managed로 GuardDuty 배포(예방) + (2) AWS Config Rule `guardduty-enabled-centralized`를 Org Conformance Pack으로 모든 계정에 평가(감지) + (3) Config Remediation Action으로 SSM Automation Document를 등록해 위반 발견 시 자동 재활성화(수정) + (4) Security Hub로 결과 집계해 운영자 가시성 확보
C) Lambda 한 개로 500 계정을 직접 순회 체크 — 멱등성·교차 계정 assume-role·스케일·실패 재시도를 전부 직접 구현해야 해 운영 부담이 큼
D) 콘솔에서 매일 500 계정을 수동 점검 — 실시간 평가가 불가능하고 사람 의존이라 비활성화와 재활성화 사이 노출 구간이 길어짐

**정답: B**

해설: 세 도구의 역할 분리 — StackSets(예방, 자원 배포), Config Rules(감지, 평가), SSM Automation(수정, 자동 복원), Security Hub(가시성, 집계). StackSets Drift(A)는 비주기/수동 트리거이고 자동 수정 안 됨 → 실시간 단독 솔루션 불가. 단일 Lambda(C)는 멱등성/스케일/실패처리 자체 구현. Conformance Pack은 Org 전체에 Config Rules를 일관 배포하는 묶음으로 멀티 계정 평가의 표준. 4단 구성이 NIST SP 800-204C의 "policy-as-code with continuous monitoring and remediation" 권고의 구현.

---

**문제 11.** 한 회사가 prod CloudFormation Stack에서 `'{{resolve:secretsmanager:prod/db:SecretString:password}}'`로 RDS 비밀번호를 주입했다. 보안팀이 Secrets Manager에서 비밀번호를 회전했더니 RDS에 적용되지 않고 다음 Stack 업데이트 시점에야 반영되는 것을 확인했다. 자동 동기화하려면?

A) 동적 참조 문법을 다른 패턴으로 변경 — `{{resolve:...}}`는 배포 시점 fetch 메커니즘이라 어떤 변형을 써도 회전된 시크릿을 RDS에 자동 반영하지 못함
B) 동적 참조는 fetch 메커니즘이지 동기화가 아님. `AWS::SecretsManager::SecretTargetAttachment`로 RDS와 Secrets Manager 연결 + Secrets Manager Rotation Lambda 설정(`enable-rotation`) — Lambda가 회전 시 RDS의 MasterUserPassword API로 직접 갱신하고 새 secret version으로 전환. CloudFormation은 회전 인프라만 정의
C) 보안팀이 회전 때마다 RDS 비밀번호를 수동 동기화 — 사람이 두 시스템을 맞추는 절차라 누락·시점 지연이 불가피하고 zero-downtime도 보장되지 않음
D) 회전 시 Lambda를 임시로 호출해 RDS를 갱신 — 방향은 맞지만 SecretTargetAttachment 연결과 관리형 회전 설정 없이 일회성 호출로는 지속적 자동 동기화가 성립하지 않음

**정답: B**

해설: 동적 참조의 본질을 이해하는 문제. `{{resolve:...}}`는 Stack 배포 시점에 외부 시스템에서 fetch → 임시 주입하는 메커니즘이지 시크릿 변경 자동 추적 도구가 아님. RDS 비밀번호 자동 회전은 별도 인프라 필요: (1) SecretTargetAttachment로 시크릿-DB 연결, (2) Rotation Lambda(또는 Secrets Manager 관리형 회전)로 주기적 회전, (3) Lambda가 RDS API로 새 비밀번호 적용. Drift Detection도 시크릿 변경 안 잡으므로 EventBridge로 회전 이벤트 별도 추적. 동적 참조 자체는 평문 보호 측면에서 여전히 유효.

---

**문제 12.** 한 회사가 다음 요건을 모두 만족하는 IaC 운영 표준을 정하려 한다: (1) 모든 prod 변경에 사람 한 단계 확인, (2) 의도치 않은 RDS 교체 차단, (3) 신규 멤버 계정에 베이스라인 자동, (4) prod CFN 변경의 보안 정책 사전 차단, (5) 신규 출시 AWS 서비스 빠른 코드화, (6) 200 마이크로서비스의 공통 패턴 일관 강제. 각 요건에 가장 적절한 도구 매핑은?

A) 6개 요건을 모두 IAM 정책으로 해결 — IAM은 누가 무엇을 호출하는지만 통제하므로 RDS 교체 차단·신규 계정 자동 베이스라인·공통 패턴 강제 같은 구성·거버넌스 요건을 표현할 수 없음
B) 6개 요건을 모두 Lambda로 직접 구현 — 동작은 시킬 수 있어도 멱등성·실패 재시도·승인 흐름·다층 검증을 전부 손으로 만들어야 해 운영 부담이 폭증
C) (1) CodePipeline ManualApproval + ChangeSet 검토, (2) UpdateReplacePolicy=Snapshot + Stack Policy로 Replace Deny, (3) Service-managed StackSets + AutoDeployment, (4) CloudFormation Hooks(또는 Control Tower Proactive Guardrails), (5) Custom Resource Lambda Provider, (6) 자체 CDK L3 Construct + Aspects/cdk-nag 검증
D) 6개 요건을 모두 Terraform으로 통일 — 단일 도구 일관성은 얻지만 사전 차단(Hooks)·OU 자동 배포(StackSets) 등 AWS 네이티브 거버넌스 기능을 그대로 대체하지 못함

**정답: C**

해설: 시험 시나리오의 종합 정답. 각 요건이 다른 도구를 가리키고, 한 가지 도구로 모두 풀려는 시도(A/B/D)는 거버넌스 미숙. Week 8 전체 학습의 도구 매핑 — (1) ChangeSet+Approval = 변경 통제, (2) DeletionPolicy/UpdateReplacePolicy/StackPolicy = 다층 변경 보호, (3) StackSets Service-managed AutoDeployment = 멀티 계정 fan-out, (4) Hooks = 사전 차단(admission control), (5) Custom Resource = 라이프사이클 엔진 확장, (6) CDK L3 + Aspects = 코드 재사용 + 합성 시점 검증. 도구는 문제별로 다르고 추상화 계층 × 거버넌스 범위 × 변경 시점의 세 축에서 가장 적절한 도구 선택.

---

## 시나리오 풀이의 메타 전략

문제마다 정답을 외우기보다 다음 흐름으로 접근하면 어떤 새 시나리오도 풀린다.

**1단계: 키워드 → 축 매핑**
- "OU 단위 / 멀티 계정 자동" → StackSets 또는 Control Tower
- "사전 차단 / 위반 막기" → Hooks 또는 Aspects/cdk-nag
- "변경 미리보기 / 사람 승인" → Change Set + Manual Approval
- "CFN 미지원 / 외부 시스템" → Custom Resource
- "장시간 대기 / 폴링" → CDK Provider isComplete
- "파이프라인 자체 갱신" → CDK Pipelines self-mutation
- "교체 / 다운타임" → Replacement=True 검토, UpdateReplacePolicy 보호
- "tfstate / 멀티 클라우드" → Terraform

**2단계: 단일 도구 vs 다층 방어 판단**
- "재발 방지", "보안팀 표준", "PCI/SOC 2" 같은 키워드가 있으면 다층 방어 정답
- 한 도구만 고르는 답이 매력적이어도 다층이 더 정확하면 그쪽

**3단계: 운영 현실성 검토**
- "200 계정에 손으로", "콘솔에서 매일" 같은 답은 함정
- 실무에서 운영자가 매번 손대지 않는 답이 정답
- 한 번 설정으로 자동화되는 도구를 선호

**4단계: 시험 함정 패턴**
- "모두 ~로" 같은 단일 도구 만능형은 거의 함정
- "비용 절감" 같은 부수 효과를 메인 답으로 두는 보기 함정
- "IAM으로 모두 해결"은 IaC 거버넌스에서 거의 함정

---

## 📌 Week 8 통합 요약

오늘 다룬 통합 시나리오는 Week 8 전체 학습의 결산이다. 정리하면 다음 다섯 가지 원칙이다.

첫째, **추상화 계층의 적절한 선택**. CFN(저수준) → SAM(서버리스 매크로) → CDK(코드)는 각각의 장단이 있고, 무조건 높은 추상화가 정답은 아니다. prod의 보안 정책은 CDK L1 또는 직접 CFN으로 정밀 제어가 권장되고, 반복 표준 패턴은 자체 L3 Construct로 응집하는 게 표준.

둘째, **거버넌스 범위의 단계적 확장**. 단일 Stack에서 시작해 단일 계정 다 Stack(Cross-Stack/Nested), 멀티 계정(StackSets), 멀티 계정 멀티 환경(CDK Pipelines), Org 수준(Conformance Pack/Hooks)으로 확장. 회사 규모에 맞춰 단계 도입.

셋째, **변경 시점의 다층 검증**. 합성 시점(Aspects/cdk-nag/cfn-lint), 배포 사전(Change Set + Manual Approval, Hooks), 배포 후(Drift Detection, Config Rules)의 4단계 모두 다른 사고를 막는다. 한 계층만으론 우회 경로가 있다.

넷째, **stateful 리소스의 다층 보호**. DeletionPolicy(Stack 삭제 시), UpdateReplacePolicy(속성 변경 교체 시), Stack Policy(Update API 진입 시), Termination Protection(DeleteStack API 호출), 그리고 별도 백업(AWS Backup)까지 5단 방어. 단일 정책으론 항상 우회 가능.

다섯째, **거버넌스 도구의 graceful rollout**. Hooks WARN→FAIL, cdk-nag warning→error, Config Rule notify→remediate, OPA dryrun→warn→deny의 단계적 도입이 표준. 한 번에 모든 정책 강제는 운영 마비를 부른다.

## 🔜 Week 9 예고

다음 주는 구성 관리의 영역으로 들어간다. **SSM Parameter Store, AppConfig, Secrets Manager, EC2 Image Builder, Patch Manager**. IaC가 "인프라의 형태"를 정의했다면 구성 관리는 "그 인프라가 동작하는 데 필요한 값"을 다룬다. Week 8의 동적 참조 `{{resolve:ssm:...}}`가 Week 9의 Parameter Store 동작 원리와 만나면서 같은 메커니즘이 더 깊이 드러난다.

---

> Week 8 완료. CloudFormation 13년 묵은 거버넌스 자산부터 CDK Pipelines self-mutation까지, 모던 IaC 운영의 전 영역을 한 번 통과했다. 시험 전 마지막 점검에서 이 글의 12개 시나리오를 다시 풀어보면 어디가 약한지가 명확히 드러난다.
