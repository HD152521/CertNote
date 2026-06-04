# Day 4 - 전체 모의고사: 실전 75문항 페이스로 6개 도메인 종합 점검

오늘은 16주 학습의 총결산이다. DOP-C02 실전은 75문항(채점 65 + 비채점 10)을 180분에 푸는 시험이고, 합격선은 1000점 만점에 750점(약 75%)이다. 모의고사의 진짜 가치는 점수 자체가 아니라 **세 가지를 드러내는 것**이다. 첫째 페이스(문항당 약 2분 24초의 감각), 둘째 도메인별 약점(어느 영역에서 정답률이 무너지는가), 셋째 **함정 패턴 인식**(왜 매력적인 오답에 끌렸는가). 이 글의 50문항은 실전 도메인 비중을 그대로 반영하고, 각 문항의 해설을 "정답이 왜 맞는가"뿐 아니라 **"오답이 왜 매력적인 함정인가"**까지 파고들어 — 시험장에서 마지막 2개로 좁힌 뒤 단서로 결정하는 능력을 단련한다.

푸는 요령을 다시 새긴다. (1) "MOST cost-effective", "LEAST operational overhead", "MINIMUM changes", "automatically" 같은 **한정어에 동그라미**를 쳐라 — 두 보기가 다 동작할 때 이 한정어가 정답을 가른다. (2) 처음 보는 서비스명은 대개 함정 오답이다. (3) 2분 넘게 고민되면 즉시 마킹하고 넘어간 뒤 마지막에 돌아와라. (4) 빈 답은 없다 — 50% 확률이라도 무조건 찍어라.

## 시험 메커니즘 — 비채점 문항과 점수 척도의 의미

> 🔍 **더 깊이**: AWS 시험은 75문항 중 **15문항이 비채점(unscored) 파일럿 문항**이다(미래 시험을 위한 통계 수집용, 어느 것이 비채점인지 응시자는 모름). 그래서 "모든 문항이 점수에 들어간다"고 가정하고 다 진지하게 풀어야 한다. 점수는 **척도 점수(scaled score, 100~1000)**로, 원점수(맞은 개수)를 시험 버전별 난이도로 보정한 값이다 — 즉 750점은 "65문항 중 정확히 N개"가 아니라 통계적으로 보정된 합격선이라, 보통 **채점 문항의 약 72~75% 정도**를 맞히면 안전권으로 본다. 결과지에는 도메인별 "충족/미충족(competency)"이 표시되지만 도메인별 점수가 합격을 직접 결정하진 않는다(총점만 합/불 결정) — 다만 약점 도메인 파악에 쓴다. 모의고사에서 75% 미만이면 부족한 도메인을 day1~3로 보강할 시간이 아직 있다.

---

## 📝 모의고사 50문항

### 도메인 1: SDLC 자동화 (11문)

**문제 1.** 50개 마이크로서비스 팀에 표준 CI/CD 파이프라인을 셀프서비스로 제공하되 회사 표준을 강제하려 한다. 가장 적합한 것은?

A) Service Catalog Portfolio에 CDK Pipelines 템플릿을 게시 — 개발자는 셀프서비스, 템플릿은 검증·표준화

B) 각 팀이 Jenkins를 자유롭게 구성

C) GitOps만으로 모든 표준을 강제

D) Step Functions로 파이프라인 대체

**정답: A**

해설: Service Catalog는 검증된 템플릿(Product)을 Portfolio로 게시해 "셀프서비스 + 표준 강제"(Golden Path)를 동시에 만족한다. Jenkins 자유 구성(B)은 표준이 무너지고, GitOps만(C)으로는 파이프라인 생성 거버넌스를 강제하기 어렵고, Step Functions(D)는 오케스트레이션 도구이지 표준 파이프라인 카탈로그가 아니다.

---

**문제 2.** Tooling 계정의 CodePipeline이 Spoke 계정에 cross-account 배포할 때 반드시 갖춰야 하는 것은?

A) IAM User 액세스 키

B) Spoke의 Cross-Account Deploy Role + 아티팩트 S3의 Customer Managed KMS Key(키 정책에 Spoke 복호화 허용)

C) VPC Peering

D) Route 53 레코드

**정답: B**

해설: cross-account 파이프라인은 (1) Spoke가 Tooling을 신뢰하는 Deploy Role과 (2) 아티팩트 암호화 KMS CMK의 **키 정책에 Spoke의 복호화 허용**이 둘 다 필요하다. KMS를 빠뜨리는 것이 1위 함정이다. IAM 키(A)는 정적 키 안티패턴, VPC Peering(C)·Route 53(D)은 배포 권한과 무관하다.

---

**문제 3.** Lambda 함수를 "5분 동안 50%만 보낸 뒤 문제없으면 나머지 50%로" 두 단계 배포하려 한다.

A) AllAtOnce  B) `Linear10PercentEvery2Minutes`  C) `Canary50Percent5Minutes`  D) Rolling

**정답: C**

해설: "소수→전체 2단계"는 Canary의 정의다. 50%를 5분 노출 후 전환은 `Canary50Percent5Minutes`. Linear(B)는 N%씩 균등 증분이라 "두 단계"가 아니고, AllAtOnce(A)는 점진 아님, Rolling(D)은 Lambda 트래픽 시프트 방식이 아니다.

---

**문제 4.** ECS 서비스를 Blue/Green으로 배포하며 새 버전을 프로덕션 트래픽 전환 전에 테스트하려 한다.

A) ECS rolling update  B) CodeDeploy + ALB의 Test/Prod 두 Listener + 두 Target Group  C) Lambda Alias  D) Route 53 Weighted

**정답: B**

해설: ECS Blue/Green은 CodeDeploy가 새 Task Set을 띄워 ALB의 테스트 리스너로 검증한 뒤 프로덕션 리스너를 새 Target Group으로 전환하는 구조다. Rolling(A)은 Blue/Green이 아니고 별도 테스트 리스너가 없다. Lambda Alias(C)는 Lambda용, Route 53 Weighted(D)는 DNS 레벨이라 ECS 컨테이너 트래픽 시프트의 표준이 아니다.

---

**문제 5.** CodeBuild가 인터넷이 차단된 프라이빗 VPC에서 ECR·S3·Secrets Manager에 접근해야 한다. 가장 적절한 것은?

A) NAT Gateway로 인터넷 경유  B) VPC Endpoint(PrivateLink)로 각 서비스에 프라이빗 접근  C) Direct Connect  D) Internet Gateway

**정답: B**

해설: 인터넷 차단 VPC에서 AWS 서비스에 도달하려면 VPC Endpoint(Gateway형 S3/DynamoDB, Interface형 ECR/Secrets 등)가 정답이다 — 트래픽이 AWS 프라이빗 네트워크로 흐른다. NAT(A)·IGW(D)는 인터넷 경유라 "차단" 요건 위반, Direct Connect(C)는 온프레미스 연결용이다.

---

**문제 6.** PR이 열릴 때 자동으로 코드 품질·보안 취약점을 검사하려 한다.

A) Lambda 트리거만  B) CodeGuru Reviewer + CodeBuild에서 SAST(Snyk 등) 실행  C) Inspector  D) Macie

**정답: B**

해설: PR 시점 코드 리뷰는 CodeGuru Reviewer(자동 코멘트)와 빌드 내 SAST(정적 분석) 조합이다. Inspector(C)는 런타임/이미지 취약점, Macie(D)는 S3 PII로 PR 코드 검사가 아니다.

---

**문제 7.** 컨테이너 이미지가 빌드 후 위·변조되지 않았음을 배포 시 검증하려 한다.

A) S3 ACL  B) AWS Signer + ECR Image Signing + 배포 시 Notation 검증  C) IAM Policy  D) KMS 암호화

**정답: B**

해설: 무결성·출처 증명은 서명(signing)의 영역이다. KMS(D)는 암호화(기밀성)이지 무결성이 아니다 — SolarWinds 공급망 공격의 교훈. ACL(A)·IAM(C)은 접근 통제일 뿐이다.

---

**문제 8.** 프로덕션 변경 freeze 기간(연말 등)에 배포를 자동 차단하려 한다.

A) Manual Approval만  B) SSM Change Calendar를 파이프라인 게이트로 연동  C) IAM Deny  D) 파이프라인 수동 비활성화

**정답: B**

해설: SSM Change Calendar는 OPEN/CLOSED 윈도를 정의하고 파이프라인이 이를 조회해 freeze 기간에 자동 차단한다. Manual Approval(A)은 사람이 매번 막아야 하고, IAM Deny(C)·수동 비활성화(D)는 자동·재사용 가능한 freeze 메커니즘이 아니다.

---

**문제 9.** GitHub Actions가 정적 액세스 키 없이 AWS에 배포하게 하려 한다.

A) IAM User 키  B) IAM OIDC Provider + `AssumeRoleWithWebIdentity`  C) IAM Roles Anywhere  D) Cognito

**정답: B**

해설: GitHub Actions의 OIDC 토큰을 신뢰하도록 IAM OIDC Provider를 등록하고 신뢰 정책에서 특정 repo/branch만 허용하면 단기 STS 자격으로 배포한다 — 정적 키 제거. Roles Anywhere(C)는 온프레미스 머신(X.509 인증서)용이라 GitHub Actions가 아니고, Cognito(D)는 앱 사용자 인증이다.

---

**문제 10.** Lambda Canary 배포 중 에러율 알람이 울리면 자동 롤백하려 한다.

A) EventBridge로 직접 롤백  B) CodeDeploy 배포에 CloudWatch Alarm을 연동(Alarm 기반 자동 롤백 활성)  C) Lambda DLQ  D) Step Functions

**정답: B**

해설: CodeDeploy는 배포에 CloudWatch Alarm을 연결해 배포 중 알람이 ALARM 상태가 되면 이전 버전으로 자동 롤백한다. EventBridge(A)는 진입점이지 롤백 메커니즘 내장이 아니고, DLQ(C)·Step Functions(D)는 롤백 자동화의 표준 경로가 아니다.

---

**문제 11.** CodePipeline에서 monorepo의 특정 경로 변경 시에만 실행하고 동적 변수를 전달하려 한다.

A) V1 Source  B) CodePipeline V2의 Triggers(filePaths 필터) + Variables  C) Lambda Custom Action  D) EventBridge 수동 구성

**정답: B**

해설: 경로 필터와 동적 변수는 CodePipeline V2의 기능이다. V1(A)에는 없다. Lambda(C)·EventBridge 수동(D)은 V2가 네이티브로 주는 기능을 재구현하는 안티패턴이다.

---

### 도메인 2: IaC (9문)

**문제 12.** 60개 계정에 동일 보안 베이스라인을 배포하고 OU에 새로 들어오는 계정에도 자동 적용하려 한다.

A) StackSets Service-Managed + Auto-Deployment(Enabled)  B) CDK App을 계정마다 수동 실행  C) Lambda 일괄 스크립트  D) Terraform 수동 apply

**정답: A**

해설: Service-Managed StackSets는 Organizations와 통합해 OU 타깃팅과 Auto-Deployment(신규 계정 자동 포함)를 지원한다. "신규 계정 자동" 단서면 항상 이것. 수동/스크립트(B·C·D)는 누락 위험이다.

---

**문제 13.** CloudFormation 변경을 적용 전에 어떤 리소스가 생성·수정·삭제될지 미리 보려 한다.

A) Drift Detection  B) Change Set  C) Stack Policy  D) Rollback Configuration

**정답: B**

해설: Change Set이 적용 전 영향(생성/수정/삭제)을 미리 보여준다. Drift Detection(A)은 사후 외부 변경 탐지, Stack Policy(C)는 리소스 보호, Rollback Configuration(D)은 실패 시 롤백 설정이다.

---

**문제 14.** CloudFormation 스택 배포 중 외부 SaaS API를 호출해 리소스를 등록해야 한다.

A) Macro  B) Custom Resource(Lambda backed)  C) Module  D) Hook

**정답: B**

해설: Custom Resource는 Lambda로 CloudFormation 생명주기(Create/Update/Delete)에 임의 로직(외부 API 호출 등)을 끼워 넣는다. Macro(A)는 템플릿 변환, Module(C)은 재사용 단위, Hook(D)은 배포 전 검증이다.

---

**문제 15.** 파이프라인 자체가 코드 변경에 따라 스스로 업데이트되는 CI/CD를 원한다.

A) 콘솔에서 파이프라인 수동 수정  B) CDK Pipelines(Self-Mutate)  C) CodeBuild만  D) Step Functions

**정답: B**

해설: CDK Pipelines는 파이프라인 정의가 코드에 있고 첫 단계에서 자기 자신을 갱신(self-mutate)한다 — 새 스테이지 추가가 코드 머지로 반영된다. 수동(A)은 비자동, CodeBuild만(C)·Step Functions(D)는 자체 변이 파이프라인이 아니다.

---

**문제 16.** Terraform State를 여러 팀이 안전하게 공유하고 동시 수정 충돌을 막으려 한다.

A) Local State  B) S3 백엔드 + DynamoDB 상태 잠금 + KMS 암호화  C) CodeCommit에 State 커밋  D) Git LFS

**정답: B**

해설: Terraform 원격 백엔드 표준은 S3(저장) + DynamoDB(state lock으로 동시 apply 충돌 방지) + KMS(암호화)다. Local(A)은 공유 불가, State를 Git에 커밋(C·D)은 비밀 노출·잠금 부재의 안티패턴이다.

---

**문제 17.** RDS 자격 증명을 90일마다 자동 회전하되 애플리케이션 코드는 바뀌면 안 된다.

A) Parameter Store SecureString  B) Secrets Manager + Rotation Lambda  C) 환경 변수  D) S3 + KMS

**정답: B**

해설: 자동 회전 내장은 Secrets Manager뿐이다(Rotation Lambda). 앱은 시크릿 ID로 조회하므로 회전돼도 코드 불변. Parameter Store(A)는 회전이 없다(직접 구현 부담). ENV(C)·S3(D)는 회전·감사 부재다.

---

**문제 18.** 피처 플래그를 점진 롤아웃하고 잘못된 구성 값은 배포 전에 차단한다.

A) Parameter Store  B) AppConfig + Validator(JSON Schema/Lambda) + Deployment Strategy  C) Secrets Manager  D) DynamoDB

**정답: B**

해설: AppConfig만이 Validator(사전 검증)·Deployment Strategy(점진)·CloudWatch Alarm 자동 롤백을 내장한다. 단 폴링 모델임에 주의. 나머지는 검증·점진·롤백 미내장이다.

---

**문제 19.** 5,000대 온프레미스 서버를 EC2와 동일한 방식으로 패치 관리하려 한다.

A) Ansible 별도 운영  B) SSM Hybrid Activation으로 온프레 서버를 Managed Instance로 등록 + Patch Manager  C) CodeDeploy만  D) Lambda + SSH

**정답: B**

해설: SSM Hybrid Activation으로 온프레 서버에 SSM Agent를 등록하면 EC2처럼 관리되어 Patch Manager·Run Command·State Manager를 동일하게 쓴다. Ansible(A)은 AWS 통합 관리가 아니고, CodeDeploy만(C)은 패치 베이스라인 관리가 아니며, Lambda+SSH(D)는 운영 부담이 크다.

---

**문제 20.** CloudFormation으로 관리되는 리소스가 콘솔에서 외부 변경됐는지 주기적으로 자동 탐지하려 한다.

A) Config Rule만  B) Drift Detection을 EventBridge Scheduled Rule로 주기 실행 + 결과 알림  C) Lambda diff 자체 구현  D) IAM CloudTrail

**정답: B**

해설: 드리프트 자동 탐지는 EventBridge 스케줄로 Drift Detection을 주기 실행하고 결과를 알리는 패턴이다(또는 Config의 drift 규칙). Lambda 자체 구현(C)은 운영 부담, CloudTrail(D)은 API 기록이지 드리프트 판정이 아니다.

---

### 도메인 3: 복원력 (7문)

**문제 21.** RTO 1분, RPO 1초 미만의 관계형 DB 멀티 리전 DR.

A) RDS Cross-Region Read Replica  B) Aurora Global Database  C) DynamoDB Streams  D) S3 CRR

**정답: B**

해설: Aurora Global Database는 RPO 보통 1초 미만, RTO ~1분의 멀티 리전 DR을 제공한다. Cross-Region RR(A)은 RPO/RTO가 더 나쁘고, DynamoDB(C)는 키-값(SQL 아님), S3 CRR(D)은 객체 스토리지다.

---

**문제 22.** 두 리전에서 동시에 읽고 쓰는 키-값 저장소가 필요하다.

A) RDS Multi-AZ  B) DynamoDB Global Tables  C) Aurora  D) ElastiCache

**정답: B**

해설: DynamoDB Global Tables는 Active-Active 멀티 리전 키-값(LWW 충돌 해소)이다. Multi-AZ(A)는 단일 리전, Aurora(C)의 secondary는 읽기 전용, ElastiCache(D)는 캐시다.

---

**문제 23.** 글로벌 사용자에게 1초 이내 페일오버와 변하지 않는 고정 IP를 제공한다.

A) Route 53 Failover  B) AWS Global Accelerator  C) CloudFront  D) NLB

**정답: B**

해설: Global Accelerator는 고정 Anycast IP 2개와 AWS 백본 기반 ~1초 페일오버를 제공한다(DNS TTL 캐싱 우회). Route 53(A)은 DNS 캐싱으로 느리고 IP가 바뀐다.

---

**문제 24.** Pilot Light DR 전략의 핵심 특징은?

A) 양 리전 동등 인프라 상시 가동  B) 핵심 DB만 복제해 두고 앱 계층은 평소 꺼둔 채 장애 시 부팅  C) 백업만 보관  D) Active-Active

**정답: B**

해설: Pilot Light는 "불씨만 켜둠" — 핵심 데이터(DB)는 상시 복제되지만 앱은 꺼둬 비용을 낮추고, 장애 시 앱을 부팅·스케일한다(RTO 십 분대). Active-Active(A·D)는 더 비싼 핫, 백업만(C)은 Backup & Restore다.

---

**문제 25.** S3 객체를 다른 리전에 15분 SLA로 복제 보장해야 한다.

A) 기본 CRR  B) S3 Replication Time Control(RTC)  C) Lifecycle  D) Snowball

**정답: B**

해설: RTC는 CRR에 15분 복제 SLA와 복제 메트릭을 더한 기능이다. 기본 CRR(A)은 SLA 보장이 없고, Lifecycle(C)은 보관 전환, Snowball(D)은 오프라인 대량 이전이다.

---

**문제 26.** DR 페일오버를 자동화하되, 페일오버 절차가 주 리전 장애에 영향받지 않게 하려 한다.

A) Lambda를 주 리전에만 둠  B) Route 53/GA Health Check + EventBridge + Step Functions를 DR 리전에서 구동  C) 수동 페일오버  D) Global Accelerator만

**정답: B**

해설: 페일오버 자동화(탐지→오케스트레이션)는 죽을 수 있는 주 리전이 아니라 DR 리전에서 구동해야 한다(2021 us-east-1 장애의 교훈). 주 리전 Lambda(A)는 그 리전이 죽으면 무용, 수동(C)은 느리고 실수 위험이다.

---

**문제 27.** 복원력 설계가 실제 장애에서 작동하는지 통제된 방식으로 검증하려 한다.

A) Synthetics  B) AWS Fault Injection Simulator(FIS)  C) Inspector  D) GuardDuty

**정답: B**

해설: FIS는 카오스 엔지니어링으로 장애를 의도 주입하고 Stop Condition으로 안전하게 통제한다. Synthetics(A)는 정상 동작 감시, Inspector(C)는 취약점, GuardDuty(D)는 위협 탐지다.

---

### 도메인 4: 모니터링/로깅 (8문)

**문제 28.** 30개 계정의 메트릭·로그·트레이스를 단일 대시보드로 통합한다.

A) Lambda로 수집  B) CloudWatch Cross-Account Observability(OAM, Sink/Link)  C) S3 + Athena  D) Grafana만

**정답: B**

해설: OAM은 모니터링 계정(Sink)에 소스 계정(Link)을 연결해 cross-account 읽기로 통합 관찰성을 준다. Lambda 수집(A)·Grafana만(D)은 운영 부담, S3+Athena(C)는 실시간 대시보드가 아니다.

---

**문제 29.** Lambda에서 고카디널리티 커스텀 메트릭을 비용·성능 효율적으로 발행한다.

A) PutMetricData 반복  B) Embedded Metric Format(EMF)  C) X-Ray  D) Logs Insights

**정답: B**

해설: EMF는 구조화 로그에 메트릭을 포함해 CloudWatch가 자동 추출 — 동기 PutMetricData(A) 제거로 레이턴시·비용 절감. X-Ray(C)는 트레이스, Insights(D)는 쿼리다.

---

**문제 30.** 컨테이너 로그를 CloudWatch·S3·OpenSearch에 동시 분기한다.

A) CloudWatch Agent  B) FireLens(Fluent Bit) → Firehose 다중 분기  C) Logstash 자체  D) X-Ray

**정답: B**

해설: FireLens(Fluent Bit/Fluentd)는 ECS/EKS 로그를 여러 목적지로 분기하는 표준이다. CloudWatch Agent(A)는 단일 목적지 중심, X-Ray(D)는 트레이스다.

---

**문제 31.** 마이크로서비스 간 요청이 어디서 느려지는지 인과를 추적한다.

A) CloudWatch Logs  B) X-Ray(또는 ADOT)  C) Inspector  D) Detective

**정답: B**

해설: 분산 트레이싱은 X-Ray(AWS 네이티브) 또는 ADOT(OpenTelemetry, 벤더 중립)이다. Logs(A)는 개별 이벤트라 경로를 못 꿰고, Detective(D)는 보안 인과 분석이다.

---

**문제 32.** 사용자가 없어도 API/UI 동작을 주기적으로 합성 테스트해 가용성을 감시한다.

A) RUM  B) CloudWatch Synthetics Canary  C) Inspector  D) X-Ray

**정답: B**

해설: Synthetics Canary는 스크립트로 합성 요청을 보내 가용성·레이턴시를 감시한다. RUM(A)은 실제 사용자 데이터라 "사용자 없어도"에 부적합하다.

---

**문제 33.** 실제 최종 사용자의 페이지 성능·에러를 브라우저에서 수집한다.

A) Synthetics  B) CloudWatch RUM  C) X-Ray  D) Container Insights

**정답: B**

해설: RUM(Real User Monitoring)은 실제 사용자 브라우저의 성능·에러를 수집한다. Synthetics(A)는 합성(가짜) 요청이다.

---

**문제 34.** 수 TB 로그를 저비용 장기 보관하며 가끔 대용량 분석한다(Logs Insights 비용 부담).

A) Logs 영구 보존 + Insights  B) Subscription Filter → Firehose → S3 + Athena  C) Lambda export  D) Glue Crawler만

**정답: B**

해설: Logs Insights는 스캔량 과금이라 대용량 반복 쿼리가 비싸다. Subscription Filter로 S3에 저비용 보관하고 Athena로 필요 시 분석하는 계층화가 정답이다.

---

**문제 35.** Prometheus/Grafana 오픈소스 호환 매니지드 관찰성을 원한다.

A) CloudWatch만  B) Amazon Managed Prometheus + Managed Grafana  C) OpenSearch  D) Kinesis

**정답: B**

해설: AMP·AMG는 Prometheus/Grafana 호환 매니지드 서비스로 오픈소스 자산을 재사용한다. CloudWatch(A)는 호환이 아니라 네이티브, OpenSearch(C)는 로그 검색이다.

---

### 도메인 5: 인시던트 (7문)

**문제 36.** 보안·운영 신호에 대한 자동 대응의 표준 진입점은?

A) SNS  B) EventBridge  C) Lambda 직접 호출  D) CloudTrail

**정답: B**

해설: EventBridge가 이벤트 패턴 필터링·다중 대상·cross-account·재시도를 제공하는 자동 대응의 허브다. SNS(A)는 단순 알림 fan-out, CloudTrail(D)은 기록이다.

---

**문제 37.** 여러 단계·재시도·감사 추적이 필요한 복잡한 인시던트 Runbook을 구성한다.

A) Lambda 단독  B) Step Functions Standard  C) Express만  D) SSM Run Command

**정답: B**

해설: Step Functions Standard는 다단계·분기·재시도·긴 실행·실행 이력 감사를 제공한다. Lambda 단독(A)은 15분·상태 관리 한계, Express(C)는 단기 고빈도용(감사 이력 제한)이다.

---

**문제 38.** SSM Runbook 실행 중 위험한 조치 직전에 사람 승인을 받게 한다.

A) 별도 Approval Stage  B) SSM Automation의 `aws:approve` 단계  C) Lambda 승인 로직 자체 구현  D) Step Functions Choice

**정답: B**

해설: SSM Automation의 `aws:approve` 액션이 워크플로 중간에 사람 승인 게이트를 넣는다. 자체 구현(C)은 불필요한 운영 부담, Choice(D)는 분기이지 승인이 아니다.

---

**문제 39.** Slack에서 제한된 AWS CLI를 안전하게 실행하고 알림을 받는다.

A) Webhook 자체  B) AWS Chatbot + 제한된 IAM Role  C) OAuth 직접  D) SSO 직접

**정답: B**

해설: AWS Chatbot은 Slack/Teams와 통합해 제한된 IAM Role 범위 내에서만 명령을 실행하고 알림을 전달한다. 자체 Webhook/OAuth(A·C)는 보안·운영 부담이 크다.

---

**문제 40.** 인시던트 발생 시 온콜 페이징과 사후 분석(Post-Incident Analysis)을 자동화한다.

A) SNS만  B) AWS Systems Manager Incident Manager  C) Chatbot만  D) 외부 PagerDuty만

**정답: B**

해설: Incident Manager는 Response Plan·에스컬레이션·온콜 페이징·런북 연동·Post-Incident Analysis를 제공한다. SNS·Chatbot(A·C)은 알림만, 외부 PagerDuty(D)는 AWS 네이티브 통합 솔루션 대비 단서가 약하다.

---

**문제 41.** SQS DLQ 메시지를 자동 재처리(re-drive)하되 무한 루프를 방지한다.

A) TTL만  B) 메시지 수신 카운트 임계를 두고 초과 시 사람 개입/격리  C) Lambda 타임아웃  D) Express SFN

**정답: B**

해설: 자동화 폭주 방지는 재시도 카운트 임계 + 초과 시 사람 게이트가 핵심이다(runaway automation 방지). TTL(A)·타임아웃(C)만으로는 무한 재처리를 못 막는다.

---

**문제 42.** EC2 예정 유지보수 같은 AWS 측 이벤트를 받아 자동 대응을 라우팅한다.

A) CloudWatch Alarm  B) EventBridge default bus + AWS Health 이벤트  C) Config  D) GuardDuty

**정답: B**

해설: AWS 서비스 이벤트(Health 포함)는 default 이벤트 버스로 들어와 EventBridge Rule로 라우팅한다. Alarm(A)은 메트릭 임계, Config(C)는 구성 준수, GuardDuty(D)는 위협이다.

---

### 도메인 6: 보안/컴플라이언스 (8문)

**문제 43.** 60개 계정에 GuardDuty를 활성화하고 신규 계정도 자동 포함한다.

A) StackSets만  B) Delegated Administrator + Org Auto-Enable  C) Lambda 매일 활성화  D) Config Rule

**정답: B**

해설: GuardDuty 멀티 계정 표준은 Audit 계정 위임 + Auto-Enable(신규 자동)이다. StackSets(A)·Lambda(C)는 네이티브 Org 통합보다 운영 부담이 크다.

---

**문제 44.** 모든 리전의 Security Hub Finding을 단일 리전에 집계한다.

A) Lambda fan-in  B) Security Hub Region Aggregator  C) S3 export  D) EventBridge fan-in

**정답: B**

해설: Region Aggregator가 멀티 리전 Finding을 한 리전으로 모은다. Lambda/EventBridge fan-in(A·D)은 재구현 안티패턴이다.

---

**문제 45.** S3 버킷이 공개로 바뀌면 자동으로 차단한다.

A) Lambda 매일 검사  B) AWS Config Rule(`s3-bucket-public-read-prohibited`) + SSM Document Auto-Remediation  C) S3 Lifecycle  D) GuardDuty

**정답: B**

해설: Config Rule이 비준수를 탐지하고 SSM Document로 자동 수정(공개 차단)한다. Lambda 매일(A)은 지연·운영 부담, Lifecycle(C)·GuardDuty(D)는 무관하다.

---

**문제 46.** SOC 2 감사 증거를 자동 수집·보고한다(Config·CloudTrail·SH 활성).

A) CloudTrail Lake만  B) AWS Audit Manager(SOC 2 프레임워크)  C) Config + Athena  D) Macie

**정답: B**

해설: Audit Manager가 프레임워크별 증거를 자동 수집해 Assessment Report를 만든다(소스 서비스 활성 전제). CloudTrail Lake(A)는 쿼리 가능 로그 저장이지 증거 관리 프레임워크가 아니다.

---

**문제 47.** EC2·Lambda·ECR의 소프트웨어 취약점(CVE)을 자동 스캔·우선순위화한다.

A) GuardDuty  B) Amazon Inspector  C) Macie  D) Security Hub

**정답: B**

해설: Inspector는 EC2/Lambda/ECR의 패키지·OS를 CVE와 대조해 스캔·우선순위화한다. GuardDuty(A)는 행위 탐지, Macie(C)는 PII, Security Hub(D)는 집계다.

---

**문제 48.** S3에 PII가 있는지 자동 탐지·보고한다.

A) Athena 정규식  B) Amazon Macie  C) Inspector  D) GuardDuty

**정답: B**

해설: Macie는 ML로 S3 객체의 PII·민감 데이터를 분류·탐지한다. Athena 정규식(A)은 직접 구현 부담, Inspector(C)·GuardDuty(D)는 데이터 분류가 아니다.

---

**문제 49.** IAM 정책이 외부 공유 가능성을 갖는지 배포 전에 검증한다.

A) IAM Policy Simulator  B) IAM Access Analyzer(외부 접근 발견 + Custom Policy Checks)  C) Config만  D) Audit Manager

**정답: B**

해설: Access Analyzer는 리소스가 외부에 노출됐는지 발견하고, Policy Validation·Custom Policy Checks로 정책을 사전 검증한다. Simulator(A)는 권한 평가 시뮬레이션이지 외부 노출 분석이 아니다.

---

**문제 50.** 온프레미스 서버가 정적 액세스 키 없이 AWS API를 호출하게 한다.

A) IAM User 키  B) IAM Roles Anywhere(X.509 인증서 + Trust Anchor)  C) Cognito  D) STS GetSessionToken

**정답: B**

해설: Roles Anywhere는 온프레 서버의 X.509 인증서를 Trust Anchor로 신뢰해 단기 STS 자격을 발급한다 — 정적 키 제거. GitHub Actions 등 CI는 OIDC, 온프레 머신은 Roles Anywhere로 구분한다. IAM 키(A)는 안티패턴이다.

---

## 📊 약점 분석 가이드

채점 후 도메인별 정답률을 계산하고 다음 기준으로 마지막 보강 영역을 정한다.

| 정답률 | 판정 | 액션 |
|--------|------|------|
| 90%+ | 안정 | ⭐ 핵심 포인트만 가볍게 |
| 75~89% | 합격권 | 오답 노트 + 함정 패턴 재확인 |
| 60~74% | 위험 | 해당 도메인 day1~3 narrative 재독 + 박스 정독 |
| <60% | 보강 필요 | 해당 Week 본 자료 재학습(개념부터) |

> 🎯 **시나리오(약점 진단 예시)**: 도메인 6에서 "Inspector vs GuardDuty vs Macie"를 반복해 틀린다면, 이는 단순 암기 부족이 아니라 **"무엇을 보는가(신호원)"의 분류가 안 잡힌 것**이다 — day3의 탐지 서비스 분업 표(행위/CVE/PII/노출/인과)를 다시 보고, 문제의 명사 단서(CVE·PII·외부 공개·침해 징후)로 즉시 매핑하는 훈련을 한다. 도메인 1에서 Canary/Linear를 자꾸 틀린다면 day1의 "Canary=2단계, Linear=균등 증분" 구조 차이를 다시 새긴다. 약점은 "어느 도메인"이 아니라 "어느 개념 축"인지로 좁혀야 효율적이다.

---

## ⭐ 핵심 포인트

1. ⭐ 페이스(2분 24초/문항) 감각 확보가 가장 큰 수확 — 2분 초과는 즉시 마킹.
2. ⭐ 오답이 "왜 매력적인 함정인지" 분석해야 시험장에서 2개로 좁힌 뒤 이긴다.
3. ⭐ 한정어(MOST/LEAST/cost-effective/automatically)가 동률 보기를 가른다.
4. ⭐ 정답률 75% 미만 도메인은 day5 전에 day1~3 narrative로 보강.
5. ⭐ 약점은 도메인이 아니라 "개념 축"(분류·구조·비용)으로 좁혀라.

---

## 📌 오늘의 요약

1. 실전은 75문항(비채점 15 포함)·180분·합격 750점(척도)이며, 본 모의 50문항은 도메인 비중을 반영한다.
2. 각 오답의 함정 이유까지 분석해 "마지막 2개 좁히기" 능력을 단련한다.
3. 도메인별 정답률로 약점을 식별하되 "개념 축" 단위로 좁힌다.
4. 75% 미만 도메인은 day5 전에 day1~3로 집중 보강한다.
5. 다음(day5)은 D-Day 체크리스트와 짧은 최종 모의로 마무리한다.
