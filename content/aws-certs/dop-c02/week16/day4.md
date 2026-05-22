# Day 4 - 전체 모의고사 50문항 + 약점 분석

📅 날짜: Week 16 (Day 4)
🎯 주제: DOP-C02 종합 모의고사 + 도메인별 약점 식별
⏱️ 학습 시간: 약 90분 (실전 90~120분 권장)

---

## 🎯 학습 목표

- 75문항 시험의 축약형 50문항으로 페이스 확인
- 도메인별 정답률 측정으로 마지막 보강 영역 식별
- 시간 배분/마킹 전략 실전 훈련

---

## 🧩 사전 지식 (모의 응시 요령)

- 50문 × 약 110분 (실전 페이스 1문 약 2분 24초)
- 모르면 즉시 마킹, 끝나고 돌아오기
- 보기 4개 → 2개로 좁힌 뒤 단서 키워드로 결정
- "MOST", "LEAST", "MOST cost-effective" 등 한정어를 동그라미

---

## 📖 도메인 분포 (실전과 동일 비중)

- 도메인 1 (SDLC): 11문
- 도메인 2 (IaC): 9문
- 도메인 3 (복원력): 7문
- 도메인 4 (모니터링): 8문
- 도메인 5 (인시던트): 7문
- 도메인 6 (보안/컴플라이언스): 8문
- 합계 50

---

## 📝 모의고사 50문항

### 도메인 1: SDLC 자동화 (11문)

**1.** 50개 마이크로서비스의 표준 파이프라인 셀프서비스?
A) **Service Catalog + CDK Pipelines**  B) Jenkins  C) GitOps only  D) Step Functions
**정답: A**

**2.** Tooling Account가 Spoke 계정에 배포할 때 필수?
A) IAM User Key  B) **Cross-Account Role + Customer Managed KMS Key on Artifact S3**
C) VPC Peering  D) PrivateLink
**정답: B**

**3.** Lambda 5분 50% 두 단계 배포?
A) AllAtOnce  B) Linear10Every2Minute  C) **Canary50Percent5Minutes**  D) Rolling
**정답: C**

**4.** ECS Blue/Green + 트래픽 시프트?
A) ECS rolling  B) **CodeDeploy + ALB Listener Test/Prod**  C) Lambda Alias  D) Route 53 Weighted
**정답: B**

**5.** CodeBuild가 인터넷 차단 VPC에서 ECR/S3 접근?
A) NAT GW  B) **VPC Endpoint(PrivateLink)**  C) Direct Connect  D) Internet GW
**정답: B**

**6.** PR open 시 자동 보안 스캔?
A) Lambda 트리거  B) **CodeGuru Reviewer + Snyk/CodeBuild SAST**  C) Inspector  D) Macie
**정답: B**

**7.** 컨테이너 이미지 위·변조 방지?
A) S3 ACL  B) **AWS Signer + ECR Image Signing + Notation 검증**  C) IAM Policy  D) KMS
**정답: B**

**8.** 프로덕션 배포 freeze 기간 강제?
A) Manual Approval  B) **SSM Change Calendar**  C) IAM Deny  D) Pipeline 일시 중지
**정답: B**

**9.** GitHub Actions가 AWS 자격증명 정적 키 없이 사용?
A) IAM User  B) **OIDC Federation + AssumeRoleWithWebIdentity**  C) Roles Anywhere  D) Cognito
**정답: B**

**10.** Lambda Canary 중 알람 시 자동 롤백?
A) EventBridge  B) **CodeDeploy + CloudWatch Alarm 연동(Alarm Configuration)**  C) Lambda DLQ  D) Step Functions
**정답: B**

**11.** Pipeline V2의 동적 변수 + 파일 경로 필터?
A) V1 Source  B) **V2 Variables + Triggers filePaths**  C) Lambda Custom Action  D) EventBridge
**정답: B**

### 도메인 2: IaC (9문)

**12.** 60개 계정에 동일 베이스라인 자동 + 신규 계정 자동 적용?
A) **StackSets Service-Managed + Auto-Deployment**  B) CDK App  C) Lambda 일괄  D) Terraform 수동
**정답: A**

**13.** CloudFormation 변경 사항 사전 영향 미리보기?
A) Drift Detection  B) **Change Set**  C) Stack Policy  D) Rollback Configuration
**정답: B**

**14.** CloudFormation으로 외부 SaaS API 호출?
A) Macro  B) **Custom Resource (Lambda)**  C) Module  D) Hook
**정답: B**

**15.** CDK Pipelines로 자체 업데이트되는 파이프라인?
A) CodePipeline 콘솔  B) **CDK Pipelines (Self-Mutate)**  C) CodeBuild only  D) Step Functions
**정답: B**

**16.** Terraform State를 멀티 팀에서 안전 공유?
A) Local State  B) **S3 + DynamoDB Lock + KMS**  C) CodeCommit  D) Git LFS
**정답: B**

**17.** RDS 자격을 90일마다 자동 회전?
A) Parameter Store  B) **Secrets Manager + Rotation Lambda**  C) ENV  D) S3+KMS
**정답: B**

**18.** Lambda 피처 플래그 점진 롤아웃 + 검증?
A) Parameter Store  B) **AppConfig + Validator + Deployment Strategy**  C) Secrets Manager  D) DynamoDB
**정답: B**

**19.** 5,000대 온프레미스 패치를 EC2와 동일 운영?
A) Ansible  B) **SSM Hybrid Activation + Patch Manager**  C) CodeDeploy only  D) Lambda+SSH
**정답: B**

**20.** CloudFormation 리소스 외부 변경 자동 탐지?
A) Config Rule  B) **Drift Detection + EventBridge Schedule**  C) Lambda diff  D) IAM CloudTrail
**정답: B**

### 도메인 3: 복원력 (7문)

**21.** RTO 1분, RPO 1초 DB DR?
A) RDS Cross-Region RR  B) **Aurora Global Database**  C) DynamoDB Streams  D) S3 CRR
**정답: B**

**22.** Active-Active 두 리전 키-값?
A) RDS Multi-AZ  B) **DynamoDB Global Tables**  C) Aurora  D) ElastiCache
**정답: B**

**23.** 글로벌 1초 페일오버 + 고정 IP?
A) Route 53  B) **Global Accelerator**  C) CloudFront  D) NLB
**정답: B**

**24.** Pilot Light DR 핵심?
A) 동등 인프라 상시  B) **핵심 DB만 복제 + 앱은 꺼둠**  C) 백업만  D) Active-Active
**정답: B**

**25.** S3 객체 15분 SLA 복제?
A) CRR  B) **S3 Replication Time Control (RTC)**  C) Lifecycle  D) Snowball
**정답: B**

**26.** DR 페일오버 자동화 표준?
A) Lambda 단독  B) **Route 53 Health Check + Failover + EventBridge → Step Functions**  C) Manual  D) GA only
**정답: B**

**27.** Fault Injection으로 복원력 검증?
A) Synthetics  B) **AWS Fault Injection Simulator(FIS)**  C) Inspector  D) GuardDuty
**정답: B**

### 도메인 4: 모니터링/로깅 (8문)

**28.** 30개 계정 메트릭 단일 대시보드?
A) Lambda  B) **CloudWatch Cross-Account Observability (OAM)**  C) S3+Athena  D) Grafana 자체
**정답: B**

**29.** Lambda 고차원 메트릭 비용 절감?
A) PutMetricData 반복  B) **Embedded Metric Format (EMF)**  C) X-Ray  D) Insights
**정답: B**

**30.** 컨테이너 로그 다중 분기?
A) CloudWatch Agent  B) **FireLens(Fluent Bit) → Firehose**  C) Logstash  D) X-Ray
**정답: B**

**31.** 분산 서비스 인과 트레이스?
A) CloudWatch Logs  B) **AWS X-Ray (또는 ADOT)**  C) Inspector  D) Detective
**정답: B**

**32.** API/UI 합성 모니터링?
A) RUM  B) **CloudWatch Synthetics Canary**  C) Inspector  D) X-Ray
**정답: B**

**33.** 실제 사용자 페이지 성능 모니터링?
A) Synthetics  B) **CloudWatch RUM**  C) X-Ray  D) Container Insights
**정답: B**

**34.** Logs Insights 비용 큼 — 장기 보관 분석?
A) Logs 영구 보존  B) **Subscription Filter → Firehose → S3 + Athena**  C) Lambda export  D) Glue Crawler
**정답: B**

**35.** Prometheus/Grafana 오픈소스 호환 매니지드?
A) CloudWatch  B) **Amazon Managed Prometheus + Managed Grafana**  C) OpenSearch  D) Kinesis
**정답: B**

### 도메인 5: 인시던트 (7문)

**36.** 자동 대응 진입점?
A) SNS  B) **EventBridge**  C) Lambda only  D) CloudTrail
**정답: B**

**37.** 멀티 단계 Runbook 감사/재시도?
A) Lambda 단독  B) **Step Functions Standard**  C) Express only  D) SSM Run Command
**정답: B**

**38.** 사람 승인이 필요한 SSM Runbook?
A) Approval Stage  B) **SSM Automation aws:approve 단계**  C) Lambda  D) Step Functions Choice
**정답: B**

**39.** Slack에서 안전한 AWS CLI 실행?
A) Webhook  B) **AWS Chatbot + 제한된 IAM Role**  C) OAuth  D) Direct SSO
**정답: B**

**40.** 인시던트 페이저 + Post-Incident Analysis 자동?
A) SNS  B) **AWS Systems Manager Incident Manager**  C) Chatbot only  D) PagerDuty only
**정답: B**

**41.** SQS DLQ 자동 Re-drive에서 무한루프 방지?
A) TTL  B) **메시지 속성 카운트 + 임계 시 사람 개입**  C) Lambda 타임아웃  D) Express SFN
**정답: B**

**42.** AWS 서비스 이벤트(EC2 유지보수) 라우팅?
A) CloudWatch Alarm  B) **EventBridge default bus + AWS Health Event**  C) Config  D) GuardDuty
**정답: B**

### 도메인 6: 보안/컴플라이언스 (8문)

**43.** 60개 계정 GuardDuty 자동 활성?
A) StackSets  B) **Delegated Admin + Auto-Enable**  C) Lambda  D) Config
**정답: B**

**44.** Security Hub 멀티 리전 Findings 집계?
A) Lambda  B) **Region Aggregator**  C) S3 export  D) EventBridge fan-in
**정답: B**

**45.** S3 공개 자동 차단?
A) Lambda  B) **Config Rule + SSM Document Auto-Remediation**  C) GuardDuty  D) Macie
**정답: B**

**46.** SOC 2 증거 자동 수집?
A) CloudTrail Lake  B) **AWS Audit Manager**  C) Config + Athena  D) Macie
**정답: B**

**47.** EC2/Lambda/ECR 취약점 스캔?
A) GuardDuty  B) **Amazon Inspector**  C) Macie  D) Security Hub
**정답: B**

**48.** S3 PII 자동 탐지?
A) Athena 정규식  B) **Amazon Macie**  C) Inspector  D) GuardDuty
**정답: B**

**49.** IAM Policy 외부 공유 가능성 사전 검증?
A) IAM Simulator  B) **IAM Access Analyzer (Policy Validation/Custom Policy Checks)**  C) Config  D) Audit Manager
**정답: B**

**50.** 정적 키 없이 온프레미스에서 AWS 호출?
A) IAM User  B) **IAM Roles Anywhere**  C) Cognito  D) STS GetSessionToken
**정답: B**

---

## 📊 약점 분석 가이드

채점 후 도메인별 정답 수 / 총 문항으로 정답률 계산:

| 정답률 | 판정 | 액션 |
|--------|------|------|
| 90%+ | 안정 | 가벼운 복습 |
| 75~89% | 합격권 | 오답 노트만 |
| 60~74% | 위험 | day1~3 복습 + 추가 문제 |
| <60% | 보강 필요 | 해당 도메인 Week 자료 재학습 |

DOP-C02 합격 기준은 1000점 만점 750점(75%). 도메인별 부분 점수도 함께 본다.

---

## ⭐ 핵심 포인트

1. ⭐ 페이스 확인이 가장 큰 수확 — 2분 24초/문항 감각
2. ⭐ 자신 없는 문항은 즉시 마킹 후 패스
3. ⭐ 모든 오답은 도메인 표시 후 재학습 영역 식별
4. ⭐ 정답률 75% 미만 도메인은 day5 직전까지 보강
5. ⭐ 단서 키워드(매니지드/자동/최소 운영/규제) 패턴 다시 점검

---

## 📌 오늘의 요약

1. 50문항 실전 페이스 점검 완료
2. 도메인별 정답률로 약점 식별
3. 75% 미만 도메인은 day5 전에 집중 보강
4. 자주 틀리는 패턴 = 오답 노트로 별도 정리
5. 다음(day5) D-Day 체크리스트로 마무리
