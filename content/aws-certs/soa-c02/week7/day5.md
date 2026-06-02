# Day 5 - Week 7 복습 + 시나리오 10문제

📅 날짜: Week 7 (Day 5)
🎯 주제: 배포·프로비저닝 도구 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 Week 7 핵심 개념 한 줄 요약

1. **Beanstalk 배포 정책 5종**: All at once / Rolling / Rolling with batch / Immutable / Blue-Green
2. **Immutable = 새 ASG 검증 후 교체** (안전, 임시 비용 2배)
3. **Blue-Green via URL Swap = 즉시 트래픽 전환·롤백** (DNS TTL 고려)
4. **CodeDeploy hook 순서**: ApplicationStop → BeforeInstall → AfterInstall → ApplicationStart → ValidateService
5. **Lambda Canary = Alias 가중치 점진 조정**, ECS Blue-Green = Target Group 전환
6. **Auto Rollback Triggers**: 배포 실패 또는 CloudWatch Alarm
7. **Image Builder Pipeline → SSM Parameter → Launch Template** — Golden AMI 자동화 표준
8. **DLM = EBS Snapshot/AMI 자동 백업·정리** (태그 기반)
9. **OpsWorks Stacks는 EOL** — SSM으로 마이그레이션 권장
10. **Mixed Instances + Spot 회수 2분 알림 처리**가 비용·가용성 핵심

---

## 🔍 헷갈리기 쉬운 비교표

| 항목 | Beanstalk | CodeDeploy | CloudFormation |
|------|-----------|------------|----------------|
| 관리 범위 | 코드 + 환경 | 코드만 | 모든 리소스 |
| 인프라 | 자동 생성 | 별도 (Existing) | 자동 생성 |
| 사용 사례 | 단순 웹앱 | 기존 인프라 배포 | IaC 전체 |

| 항목 | Immutable (Beanstalk) | Blue-Green (CodeDeploy EC2) |
|------|----------------------|------------------------------|
| 동작 | 새 ASG + 검증 + 교체 | 새 ASG + ALB Target Group 전환 |
| 롤백 | 빠름 | 즉시 |
| 비용 | 일시 2배 | 일시 2배 |
| 다운타임 | X | X |

| 항목 | DLM | AWS Backup | Image Builder |
|------|-----|------------|---------------|
| 대상 | EBS/AMI | RDS/EBS/DDB/EFS/FSx/S3 | AMI/Container |
| 목적 | 자동 백업/정리 | 광범위 백업 + 컴플라이언스 | 빌드·검증 파이프라인 |

---

## 📝 시나리오 10문제

**문제 1.** 운영 환경에서 다운타임 없이, 용량 유지하며, 비용을 최소화하려 한다. 가장 적합한 Beanstalk 배포 정책은?

A) All at once
B) Rolling
C) Rolling with additional batch
D) Immutable

**정답: C**
해설: 다운타임 없음 + 용량 유지 + 임시 비용 최소 = Rolling with additional batch. Immutable은 비용 2배.

---

**문제 2.** 운영자가 새 Lambda 버전을 10% 트래픽으로 5분간 검증 후 100% 전환하길 원한다. 어떻게?

A) Lambda 환경 변수
B) CodeDeploy Lambda + Deployment Config `Canary10Percent5Minutes`
C) API Gateway Stage
D) ASG

**정답: B**
해설: CodeDeploy의 Lambda Canary 사전 정의 Config. Alias 가중치 자동 조정. BeforeAllowTraffic/AfterAllowTraffic Hook으로 검증.

---

**문제 3.** AppSpec.yml의 hook 중 파일 복사 직후 권한 설정·심볼릭 링크를 만드는 단계는?

A) BeforeInstall
B) AfterInstall (파일 복사 직후)
C) ApplicationStart
D) ValidateService

**정답: B**
해설: ApplicationStop → BeforeInstall → AfterInstall → ApplicationStart → ValidateService 순서. AfterInstall이 정확한 시점.

---

**문제 4.** 회사가 매월 새 Golden AMI를 빌드해 신규 EC2가 자동 사용하게 하려 한다. 표준 패턴은?

A) 수동 AMI + 콘솔 변경
B) Image Builder Pipeline → 새 AMI ID를 SSM Parameter Store에 저장 → Launch Template이 `{{resolve:ssm:...}}` 참조 → Auto Scaling이 새 AMI 사용
C) CloudFormation StackSet
D) Lambda

**정답: B**
해설: Golden AMI 자동화 표준 운영. Image Builder + SSM Parameter + Launch Template 조합. 가장 운영 효율적.

---

**문제 5.** Beanstalk 환경을 종료했더니 내장 RDS도 삭제됐다. 데이터 손실. 어떻게 방지?

A) DeletionPolicy
B) RDS를 Beanstalk 외부 별도 Stack으로 분리 + 환경 변수로 endpoint 주입
C) Multi-AZ만
D) Backup

**정답: B**
해설: Beanstalk 내장 RDS의 함정. 환경 라이프사이클과 데이터 라이프사이클 분리가 운영 모범 사례.

---

**문제 6.** 회사가 EC2 인스턴스에 On-demand 2대 보장 + 나머지는 Spot으로 비용 절감을 자동화하려 한다. 어떤 설정?

A) 별도 ASG 2개
B) Launch Template + ASG Mixed Instances Policy + OnDemandBaseCapacity=2 + 나머지 Spot
C) EC2 Fleet 별도
D) Spot Fleet

**정답: B**
해설: Mixed Instances Policy가 정답. capacity-optimized로 Spot 안정성 ↑. Launch Template은 표준(LC는 deprecated).

---

**문제 7.** CodeDeploy 배포 중 CloudWatch HighErrorRate 알람이 발생하면 자동 롤백되도록 하려면?

A) Lambda 모니터
B) Deployment Group의 auto-rollback-configuration에 `DEPLOYMENT_STOP_ON_ALARM` + alarm-configuration 등록
C) Manual rollback
D) CodePipeline

**정답: B**
해설: CodeDeploy 내장 기능. AutoRollback + Alarm 통합으로 배포 중 알람 발생 시 즉시 이전 버전 재배포.

---

**문제 8.** Spot 인스턴스가 회수되기 전 graceful shutdown(ALB deregister, 로그 백업)을 자동화하려면?

A) Cron job
B) EventBridge Rule (EC2 Spot Instance Interruption Warning) → Lambda 또는 ASG Lifecycle Hook
C) CloudWatch Alarm
D) IMDS 폴링

**정답: B**
해설: AWS가 2분 전 발행하는 EventBridge 이벤트 활용. Lambda나 Lifecycle Hook으로 정리 작업 자동화.

---

**문제 9.** OpsWorks Stacks가 EOL이다. 기존 Chef cookbook 자산을 AWS에서 계속 활용하려면?

A) 그대로 사용
B) AWS Systems Manager Run Command/State Manager로 마이그레이션 (또는 OpsWorks for Chef Automate 매니지드)
C) Elastic Beanstalk
D) Lambda

**정답: B**
해설: SSM이 가장 가까운 대체. Chef recipe를 SSM Document로 변환. OpsWorks for Chef Automate는 별도 매니지드 서비스(운영 중).

---

**문제 10.** 회사가 사내 개발자에게 표준 Fargate Service + ALB + RDS + CI/CD 파이프라인을 자가 서비스로 제공하려 한다. 가장 적합한 도구는?

A) Service Catalog만
B) AWS Proton — Environment Template + Service Template + CodePipeline 통합
C) OpsWorks
D) Elastic Beanstalk

**정답: B**
해설: Proton은 사내 PaaS/IDP. Service Catalog는 IaC 자가 서비스만 - CI/CD 미포함. Proton이 더 발전된 플랫폼 엔지니어링 도구.

---

## 🔮 다음 주 예고 (Week 8)

Week 8은 **네트워킹 운영** — VPC 트러블슈팅, Flow Logs, Endpoints, Transit Gateway.

- Day 1: VPC - 서브넷, 라우팅, NACL vs SG, IPv6
- Day 2: VPC Flow Logs, Traffic Mirroring, Reachability Analyzer
- Day 3: NAT Gateway, VPC Endpoint, PrivateLink
- Day 4: Transit Gateway, VPN, Direct Connect, Route 53 운영
- Day 5: Week 8 복습 + 시나리오 10문제

> 💡 네트워킹은 CloudOps 시험의 핵심 도메인 (18%). 특히 VPC 트러블슈팅 시나리오 빈출.
