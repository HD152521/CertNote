# Day 5 - Week 7 종합, 시나리오로 다시 보는 배포·프로비저닝 선택의 감각

Week 7은 "어떻게 안전하게 배포할 것인가"를 다섯 면에서 봤다. Beanstalk이라는 PaaS의 트레이드오프, CodeDeploy의 코드만 배포라는 좁은 책임, EC2 Image Builder가 강제하는 immutable infrastructure, OpsWorks → SSM으로 옮겨가는 패러다임 전환, 그리고 Launch Template + Mixed Instances Policy의 비용·가용성 균형. 다섯 글이 모두 다른 도구를 다뤘지만 공통 질문은 하나다 — **"이 워크로드에 어떤 trade-off가 맞는가"**.

이 글에서는 그 다섯 글의 핵심 결정 축을 다시 모으고, SOA-C02 시험이 실제로 어떤 시나리오로 출제하는지 12개의 문제로 풀어본다. 표 암기가 아니라 "왜 A가 정답이고 B는 함정인가"를 결정하는 감각이 목표다. 시험 전날 한 번 더 훑어보면 답이 자연스럽게 떠오르는 정리가 되도록 구성했다.

## Week 7 결정 축 5개로 다시 정리

이번 주 다룬 모든 도구가 결국 다섯 개 결정 축의 조합으로 환원된다.

| 결정 축 | 질문 | Week 7 도구 매핑 |
|---------|------|------------------|
| **다운타임 허용?** | 0초여야 하나, 몇 분 OK인가 | All at once vs Rolling vs Immutable |
| **임시 용량 비용?** | 2배 OK인가, 절감 우선인가 | Rolling vs Immutable vs Blue-Green |
| **롤백 속도?** | 즉시 vs 재배포 시간 | Immutable·Blue-Green vs Rolling |
| **인프라 소유?** | 자동 생성 vs 기존 사용 | Beanstalk vs CodeDeploy vs CloudFormation |
| **변경 단위?** | 코드만 vs 환경 전체 vs AMI | CodeDeploy vs Beanstalk vs Image Builder |

이 5개 축으로 시나리오를 분해하면 정답이 거의 자동으로 좁혀진다. 예를 들어 "다운타임 0초 + 비용 최소 + 기존 EC2 인프라"라는 시나리오는 CodeDeploy + Blue-Green인지 Beanstalk + Rolling with batch인지 헷갈리지만, "기존 인프라"라는 단서가 CodeDeploy를 가리킨다.

> 💡 **관련 이론**: 이 결정 축 접근은 Architecture Decision Record(ADR)의 표준 양식과 정확히 같다. Michael Nygard가 2011년 제안한 ADR 템플릿은 Context → Decision → Consequences 구조인데, 각 결정에 대한 trade-off를 명시한다. 시험 시나리오를 ADR처럼 분해하는 습관이 클라우드 아키텍트의 핵심 사고 패턴이다.

## Beanstalk vs CodeDeploy vs CloudFormation: 책임 경계 재정리

| 결정 기준 | Beanstalk | CodeDeploy | CloudFormation |
|----------|-----------|------------|----------------|
| **인프라 생성** | 자동 (EC2/ALB/RDS) | 별도 (사용자 책임) | 자동 (모든 리소스) |
| **코드 배포** | 통합 | 핵심 기능 | 별도 (custom resource) |
| **롤백 단위** | 환경 전체 | Revision | Stack 전체 |
| **배포 hook** | .ebextensions, .platform | AppSpec hooks (13단계) | UpdatePolicy + WaitCondition |
| **언어 인식** | 있음 (Node/Python/Java/...) | 없음 (불가지론) | 없음 (불가지론) |
| **사용 사례** | 단순 웹앱 PaaS | 기존 EC2/Lambda/ECS 함대 | 전체 IaC |

실무에서는 셋을 조합해 쓴다. CloudFormation으로 VPC·ALB·ASG 기반 인프라를 만들고, CodeDeploy로 그 위에 코드를 배포하고, Beanstalk은 "인프라까지 묶고 싶은" 작은 워크로드에만 쓴다. Image Builder는 ASG가 사용할 AMI를 만든다.

## Beanstalk 배포 정책 5개 재정리

| 정책 | 다운타임 | 임시 용량 | 임시 비용 | 롤백 속도 | 권장 사용 |
|------|----------|-----------|-----------|-----------|----------|
| **All at once** | **있음** | 0% (전체 정지) | 없음 | 재배포 필요 | dev/staging |
| **Rolling** | 없음 | 일시 **감소** | 없음 | 재배포 필요 | 트래픽 spike 없는 prod |
| **Rolling with batch** | 없음 | 유지 | 배치만큼 | 재배포 필요 | 균형 잡힌 prod |
| **Immutable** | 없음 | 유지 | **2배** | 빠름 (구 ASG 살아있음) | 안정성 중요한 prod |
| **Blue-Green (URL Swap)** | 없음 | 유지 | **2배** | 즉시 (CNAME 전환) | 즉시 롤백 필수 |

핵심 함정 — "Blue-Green = 즉시 100% 전환"이 아니다. CNAME 전환은 즉시지만 DNS TTL 동안 일부 사용자는 구 환경에 머문다. Beanstalk 기본 CNAME TTL이 60초지만 일부 ISP/사내 DNS가 더 길게 캐싱하므로 실제 100% 전환까지 5-30분 걸릴 수 있다.

## CodeDeploy 핵심 정리

EC2 hook 순서:
```
ApplicationStop → DownloadBundle(auto) → BeforeInstall → Install(auto) → 
AfterInstall → ApplicationStart → ValidateService
[Blue-Green only]
→ BeforeBlockTraffic → BlockTraffic(auto) → AfterBlockTraffic →
  BeforeAllowTraffic → AllowTraffic(auto) → AfterAllowTraffic
```

Compute platform별 배포 방식:
- **EC2**: In-place 또는 Blue-Green (ALB Target Group 전환)
- **Lambda**: Alias 가중치 점진 조정 (Canary, Linear, AllAtOnce)
- **ECS**: Blue-Green (Target Group 2개 + Production Listener + Test Listener)

자동 롤백 트리거 두 가지:
- **DEPLOYMENT_FAILURE**: hook 실패·타임아웃 (즉시 감지)
- **DEPLOYMENT_STOP_ON_ALARM**: CloudWatch Alarm 발생 (최소 1-3분 지연)

## Image Builder + Golden AMI + SSM Parameter 패턴

```
[Image Builder Pipeline] (매월 cron)
        ↓
   새 AMI 생성
        ↓ (EventBridge)
[Lambda] → SSM Parameter 업데이트
        /golden-ami/al2/latest = ami-XXXX
        ↓
[Launch Template]
   ImageId: '{{resolve:ssm:/golden-ami/al2/latest}}'
        ↓
[Auto Scaling Group]
   다음 Instance Refresh 또는 scale-out 시 새 AMI 사용
```

이 패턴의 우아함은 **참조의 간접화**다. Launch Template이 AMI ID를 직접 가리키지 않고 SSM Parameter를 거쳐 가리키면, AMI가 바뀔 때마다 Launch Template 새 버전을 만들 필요가 없다. SSM Parameter만 업데이트하면 다음 인스턴스 생성 시 자동으로 새 AMI가 사용된다.

## Launch Configuration → Launch Template 마이그레이션

| 항목 | LC (deprecated) | LT (표준) |
|------|-----------------|-----------|
| 버전 관리 | 없음 | $Latest, $Default 등 alias |
| 부분 수정 | 불가 (재생성) | 가능 |
| Mixed Instances | 불가 | 지원 |
| SSM Parameter 참조 | 불가 | 가능 (`{{resolve:ssm:...}}`) |
| 신규 EC2 기능 | 미지원 (동결) | 지원 |
| Console 신규 생성 | 2022.12 이후 불가 | 표준 |

## Mixed Instances Policy + Spot 전략

```yaml
MixedInstancesPolicy:
  LaunchTemplate:
    LaunchTemplateSpecification:
      LaunchTemplateName: web-lt
      Version: $Latest
    Overrides:
      - InstanceType: m5.large
      - InstanceType: m5a.large
      - InstanceType: m6i.large
  InstancesDistribution:
    OnDemandBaseCapacity: 2           # 최소 On-demand 보장
    OnDemandPercentageAboveBaseCapacity: 30
    SpotAllocationStrategy: capacity-optimized   # 또는 price-capacity-optimized
```

Spot Allocation Strategy 권장 순위:
1. **capacity-optimized** — 회수 가능성 최소 (대부분의 워크로드)
2. **price-capacity-optimized** — 비용 + capacity 균형 (2022년 추가)
3. ~~lowest-price~~ — 회수 위험 높음 (사용 비권장)

Spot 회수 graceful shutdown:
- EventBridge Rule (`EC2 Spot Instance Interruption Warning`) → Lambda → ALB deregister + SSM Run Command로 graceful shutdown 신호
- 또는 ASG Lifecycle Hook으로 종료 전 시간 확보
- IMDS `/latest/meta-data/spot/instance-action`은 EventBridge보다 빠르게(약 10초) 감지

## OpsWorks → SSM 마이그레이션

OpsWorks Stacks는 2024년 5월 26일 EOL. AWS 권장 마이그레이션:
- **Run Command**: 일회성 명령 실행
- **State Manager**: 주기적 desired state 적용 (Chef Solo 대체)
- **Patch Manager**: 패치 자동화
- **SSM Document `aws:applyChefRecipes` 액션**: 기존 Chef cookbook 재사용 가능

장기적으로는 Image Builder 기반 immutable infrastructure가 권장 path.

## Proton vs Service Catalog 위치 정리

| 항목 | Service Catalog | AWS Proton |
|------|-----------------|------------|
| 대상 | IT 사용자 (일반 인프라 요청) | 개발자 (서비스 워크플로 전체) |
| IaC | CloudFormation | CloudFormation, Terraform |
| CI/CD 통합 | 없음 (별도) | 내장 (CodePipeline) |
| 추상화 | Product (단일 stack) | Environment + Service (분리) |
| 사용 사례 | "VPC 한 개 만들어주세요" | "내 마이크로서비스 Git push → 인프라 + CI/CD 자동" |

> 💡 **관련 이론**: Proton은 Spotify의 Backstage가 정의한 "Internal Developer Platform(IDP)" 카테고리의 AWS 네이티브 구현이다. CNCF Platform Working Group의 reference architecture와 거의 동일 — Platform Engineer가 golden path를 제공하고, Developer는 그 path 안에서 자가 서비스로 일한다.

---

## 📝 시나리오 12문제

**문제 1.** 운영 환경에서 다운타임 없이, 용량을 유지하면서, 추가 비용을 최소화하려 한다. 가장 적합한 Beanstalk 배포 정책은?

A) All at once
B) Rolling
C) Rolling with additional batch
D) Immutable

**정답: C**
해설: 4축 trade-off로 분해 — 다운타임 없음(A 탈락), 용량 유지(B는 일시 감소이므로 탈락), 비용 최소(D는 2배라 탈락). Rolling with additional batch는 배치 단위 교체 + 임시 인스턴스로 용량을 유지하면서 추가 비용은 배치 크기만큼만이다. 함정 — 시나리오에 "트래픽 spike 예상"이 추가되면 답이 Immutable로 바뀐다(Rolling 계열은 헬스 체크 실패 위험).

---

**문제 2.** 새 Lambda 버전을 10% 트래픽으로 5분간 검증 후 100%로 전환하려 한다. 운영팀이 자동 검증/롤백까지 원한다면?

A) Lambda 환경 변수에 ACTIVE_VERSION 플래그를 두고 핸들러 코드에서 분기 + 5분 후 운영자가 수동으로 값 변경 + CloudWatch 메트릭 육안 확인
B) CodeDeploy Lambda + Deployment Config `CodeDeployDefault.LambdaCanary10Percent5Minutes` + BeforeAllowTraffic/AfterAllowTraffic Hook + CloudWatch Alarm 기반 자동 롤백
C) API Gateway Stage variable로 lambdaAlias를 지정하고 Canary deployment를 Stage에 설정 + 10% 트래픽을 5분간 흘린 뒤 promote
D) ASG Lifecycle Hook으로 신규 인스턴스를 pending 상태에 두고 10% 가중치 검증 후 InService 전환

**정답: B**
해설: CodeDeploy의 사전 정의 Lambda Canary Config가 정확히 이 패턴이다. Alias 가중치가 자동으로 V1:90%/V2:10% → 5분 후 V2:100%로 조정. BeforeAllowTraffic Lambda hook으로 트래픽 받기 전 사전 검증, AfterAllowTraffic으로 사후 검증. CloudWatch Alarm을 Deployment Group에 등록하면 알람 발생 시 자동 롤백. 함정 — Linear와 Canary의 차이를 잡아야 한다. Canary는 "고정 비율 → 100%"의 2단계, Linear는 다단계 점진 증가.

---

**문제 3.** AppSpec.yml의 hook 중 새 버전 파일이 destination 디렉터리에 복사된 직후, 권한 설정·심볼릭 링크 생성·환경별 config 파일 치환을 수행할 단계는?

A) BeforeInstall
B) AfterInstall
C) ApplicationStart
D) ValidateService

**정답: B**
해설: hook 순서 ApplicationStop → DownloadBundle(auto) → BeforeInstall → Install(auto) → AfterInstall → ApplicationStart → ValidateService. AfterInstall이 정확히 "파일 복사 직후" 시점. BeforeInstall은 "파일 복사 전" — 백업, 시스템 패키지 설치. 두 hook이 분리된 이유는 "파일이 없는 상태에서 해야 할 일"과 "파일이 있어야 가능한 일"이 본질적으로 다르기 때문이다.

---

**문제 4.** 회사가 매월 새 Golden AMI를 빌드해 신규 ASG 인스턴스가 별도 작업 없이 자동 사용하길 원한다. AWS 권장 표준 패턴은?

A) 운영팀이 매월 수동으로 AMI를 생성하고 Launch Template ImageId를 직접 수정 + 새 버전 발행 후 ASG의 Default 버전을 갱신하는 절차를 런북으로 문서화
B) Image Builder Pipeline cron으로 새 AMI 생성 → EventBridge + Lambda로 SSM Parameter Store 업데이트 → Launch Template ImageId를 `{{resolve:ssm:/golden-ami/al2/latest}}`로 참조 → Instance Refresh 또는 자연 교체로 적용
C) CloudFormation StackSet으로 전체 ASG를 매월 재생성 + ChangeSet으로 새 AMI ID를 파라미터 주입 + 모든 리전에 동시 롤아웃
D) Lambda가 SSM Run Command로 운영 중인 모든 인스턴스에 `yum update`를 실행해 in-place로 패키지 최신화

**정답: B**
해설: Golden AMI 운영 표준. Image Builder + SSM Parameter + Launch Template의 간접 참조 패턴이 핵심. AMI가 바뀔 때마다 Launch Template 새 버전을 만들 필요가 없다. 함정 — D는 mutable infrastructure 안티패턴이라 configuration drift 누적, C는 over-engineering.

---

**문제 5.** Beanstalk 환경 종료 시 내장 RDS도 함께 삭제되어 데이터 손실이 발생했다. 동일 사고를 방지하려면?

A) `.ebextensions`에서 RDS 리소스에 DeletionPolicy: Retain을 추가해 환경 종료 시 DB가 보존되도록 강제 (실제로는 Beanstalk 관리 리소스라 콘솔에서 직접 제어 불가)
B) RDS를 Beanstalk 외부 별도 CloudFormation/Terraform Stack으로 분리하고, Beanstalk 환경 변수 또는 Secrets Manager로 endpoint·자격증명 주입
C) RDS Multi-AZ를 활성화해 standby 복제본을 다른 AZ에 두고 자동 페일오버로 가용성 확보
D) RDS 자동 백업 보존 기간을 35일로 늘리고 매일 스냅샷을 별도 계정으로 복사

**정답: B**
해설: 핵심 원칙은 "데이터 라이프사이클과 컴퓨트 라이프사이클의 분리"(AWS Well-Architected Reliability Pillar 명시 항목). Beanstalk 내장 RDS는 환경 종료 = DB 삭제가 기본 동작이고, DeletionPolicy는 CloudFormation 옵션이라 Beanstalk 콘솔에서 직접 설정 불가. Multi-AZ/자동 백업은 가용성·복구지 환경 종료 보호와 무관(백업도 환경 종료 시 보존 정책에 따라 사라질 수 있음).

---

**문제 6.** Auto Scaling Group에서 On-demand 2대 최소 보장 + 그 위로는 30% On-demand + 70% Spot으로 비용 절감을 자동화하려 한다. 또 Spot 회수율을 최소화하고 싶다.

A) Spot Fleet를 직접 정의해 target capacity와 On-demand base를 지정하고 diversified allocation으로 풀을 분산 + 별도 Lambda로 desired capacity를 스케일링
B) Mixed Instances Policy + InstancesDistribution.OnDemandBaseCapacity=2 + OnDemandPercentageAboveBaseCapacity=30 + SpotAllocationStrategy=capacity-optimized
C) On-demand 전용 ASG와 Spot 전용 ASG를 따로 만들고 같은 Target Group에 붙인 뒤 각 ASG의 desired capacity를 2:5 비율로 수동 조정
D) EC2 Fleet API를 단일 호출로 실행해 On-demand 2대와 Spot 인스턴스를 type=instant 모드로 한 번에 프로비저닝

**정답: B**
해설: Mixed Instances Policy의 InstancesDistribution이 정확히 이 trade-off를 위한 설정. OnDemandBaseCapacity로 최소 보장(2) + OnDemandPercentageAboveBaseCapacity로 그 위 비율(30%) + SpotAllocationStrategy=capacity-optimized로 현재 capacity가 가장 많은 풀에서 launch해 회수 위험 최소. lowest-price는 가장 싼 풀에 몰려 회수율 폭증하므로 비권장. Overrides에 여러 인스턴스 타입(m5, m5a, m6i 등)을 두어 가용성 강화.

---

**문제 7.** CodeDeploy 배포 중 CloudWatch HighErrorRate Alarm이 발생하면 자동으로 이전 버전으로 롤백되도록 구성하려 한다. 어떻게 설정하는가?

A) CloudWatch Events 규칙으로 HighErrorRate Alarm 상태 변화를 받아 별도 Lambda를 트리거하고, 그 Lambda가 StopDeployment + 직전 revision으로 CreateDeployment를 호출해 수동 롤백 구현
B) Deployment Group의 auto-rollback-configuration에 `DEPLOYMENT_STOP_ON_ALARM` events 추가 + alarm-configuration에 해당 Alarm 등록 + ignorePollAlarmFailure=false로 안전한 보수적 동작 보장
C) CloudWatch Synthetics Canary로 엔드포인트를 1분마다 모니터링하고 실패 시 Alarm을 통해 SNS로 운영팀에 통지해 수동 개입
D) IAM Identity-based 정책으로 배포 역할에 조건을 걸어 에러율이 높을 때 deploy 액션을 거부하도록 통제

**정답: B**
해설: CodeDeploy 내장 기능. AutoRollbackConfiguration.events에 `DEPLOYMENT_FAILURE`(hook 실패), `DEPLOYMENT_STOP_ON_ALARM`(외부 알람), `DEPLOYMENT_STOP_ON_REQUEST`(수동) 셋이 있다. AlarmConfiguration에는 모니터링할 Alarm ARN 등록. ignorePollAlarmFailure=false면 CloudWatch가 일시적으로 응답 안 할 때 안전하게 배포 중단. 함정 — Alarm 기반 롤백은 메트릭 평가 주기(1분 × 3 datapoint) 때문에 최소 3분 지연이 있어 1차 방어선이 아니라 안전망이다.

---

**문제 8.** Spot 인스턴스가 회수되기 2분 전 graceful shutdown(ALB Target Group deregister, 진행 중 요청 완료, 로그 백업)을 자동화하려 한다. 가장 표준적인 패턴은?

A) 인스턴스 내부 Cron job이 5초마다 Spot 상태 API를 호출해 회수 임박을 감지하고, 감지 시 스크립트로 ALB deregister와 로그 백업을 수행
B) EventBridge Rule (source=aws.ec2, detail-type="EC2 Spot Instance Interruption Warning") → Lambda 또는 ASG Lifecycle Hook → ALB deregister + SSM Run Command graceful shutdown 신호. 더 빠른 감지가 필요하면 인스턴스 내부에서 IMDS `/latest/meta-data/spot/instance-action` polling 병행
C) Spot 인스턴스의 CPU·네트워크 메트릭에 CloudWatch Alarm을 걸어 임계치 초과 시 SNS → Lambda로 graceful shutdown을 트리거
D) 인스턴스 내부 데몬이 IMDS `/latest/meta-data/spot/instance-action`만 폴링해 404가 아닌 응답이 오면 즉시 종료 절차 수행

**정답: B**
해설: 표준은 EventBridge + Lambda 또는 ASG Lifecycle Hook 조합. EventBridge는 약 10초 지연 후 알림 전달하므로 대부분 충분. 시간이 critical하면 인스턴스 내부 IMDS polling이 더 빠름(직접 메타데이터 폴링). ASG와 Mixed Instances를 함께 쓰면 Lifecycle Hook이 더 일관된 처리를 제공. 함정 — Cron 5초 polling은 IMDS rate limit 위험과 비용 낭비.

---

**문제 9.** OpsWorks Stacks가 2024.5.26 EOL이다. 기존 Chef cookbook 자산을 AWS에서 계속 활용하면서 추가 인프라 운영 부담을 줄이려면?

A) EOL 이후에도 기존 OpsWorks Stacks를 그대로 유지하며 Chef cookbook 자산을 변경 없이 계속 운영 (AWS 지원 종료는 감수)
B) AWS Systems Manager로 마이그레이션 — Run Command(일회성), State Manager(주기적 desired state, Chef Solo 대체), Patch Manager(패치). 필요 시 SSM Document 안에 `aws:applyChefRecipes` 액션으로 기존 cookbook 재사용 가능. 장기적으로는 Image Builder 기반 immutable infrastructure 전환 권장
C) Elastic Beanstalk으로 이전해 Chef cookbook을 `.ebextensions`/`.platform` 훅 스크립트로 포팅하고 환경 전체를 PaaS로 관리
D) cookbook의 프로비저닝 로직을 Lambda 함수로 재작성하고 EventBridge 스케줄로 주기 실행해 desired state를 적용

**정답: B**
해설: AWS 공식 마이그레이션 가이드. SSM은 OpsWorks의 모든 기능을 대체하면서 추가 인프라(Chef Server 노드) 없이 SSM Agent 하나로 동작. 기존 Chef cookbook도 SSM Document의 aws:applyChefRecipes 액션으로 즉시 사용 가능 — 점진적 마이그레이션 가능. 장기적으로 immutable infrastructure(Image Builder + ASG)가 더 권장되는 path. OpsWorks for Chef Automate는 별도 매니지드 서비스(운영 중)지만 추가 비용 부담.

---

**문제 10.** 회사가 사내 Platform Engineering 팀을 만들어 개발자에게 Git push만으로 표준 Fargate Service + ALB + RDS + CodePipeline이 자동 프로비저닝되는 IDP를 구축하려 한다. 가장 적합한 AWS 네이티브 도구는?

A) Service Catalog만 — 일반 인프라 자가 서비스에는 적합하지만 CI/CD 통합 없음
B) AWS Proton — Environment Template(공유 인프라) + Service Template(서비스 단위 + CodePipeline 통합) + CFN/Terraform 지원
C) Elastic Beanstalk — 단일 앱 PaaS, IDP 아님
D) OpsWorks — Chef 매니지드, 현대 IDP 아님

**정답: B**
해설: Proton의 정확한 사용 사례는 Internal Developer Platform(IDP) 또는 Platform Engineering. Platform 팀이 Environment Template과 Service Template을 작성하면 개발자는 Service만 인스턴스화하면 끝이다. CodePipeline 통합이 핵심 차별점이다 — Service Catalog는 인프라 프로비저닝만 제공하고 CI/CD는 별도 구성 필요. Spotify Backstage의 AWS 네이티브 버전이라고 이해하면 된다.

---

**문제 11.** 기존 ASG에 새 Launch Template 버전(새 Golden AMI 참조)을 적용했다. 운영 중인 모든 인스턴스를 안전하게 점진 교체하면서, 중간에 CloudWatch Alarm이 울리면 자동 롤백되도록 하려 한다.

A) ASG의 desired-capacity를 0으로 내려 모든 구 인스턴스를 종료한 뒤 다시 원래 수치로 올려 새 Launch Template 버전으로 일괄 재생성
B) EC2 Auto Scaling Instance Refresh — Rolling 전략 + MinHealthyPercentage=90 + CheckpointPercentages=[20,50,100] + CheckpointDelay=600 + 자동 롤백을 위한 CloudWatch Alarm 연동
C) CloudFormation 스택에서 ASG 리소스의 UpdatePolicy를 AutoScalingRollingUpdate로 설정하고 스택 전체를 재배포해 인스턴스를 교체
D) CodeDeploy In-place 배포로 기존 인스턴스에 새 AMI 기반 애플리케이션 번들을 순차 설치하고 ALB 헬스 체크로 검증

**정답: B**
해설: Instance Refresh가 정확히 이 시나리오를 위한 기능. CheckpointPercentages로 단계별 검증(예: 20% 교체 후 10분 대기 → 50% 후 또 대기 → 100%)으로 같은 ASG 내에서 canary-like 배포 가능. MinHealthyPercentage로 가용 인스턴스 비율 보장. 자동 롤백은 CloudWatch Alarm과 연동되어 메트릭 이상 시 이전 Launch Template 버전으로 자동 되돌림. 함정 — Instance Refresh 없이 그냥 Launch Template만 바꿔도 자연 교체로 시간 지나면 수렴하지만 강제력은 없다. desired-capacity 0은 다운타임 발생.

---

**문제 12.** ASG의 scale-out 시 콜드 스타트(AMI fetch + cloud-init + 앱 시작)가 3-5분 걸려 트래픽 spike에 늦게 대응한다. 비용을 크게 늘리지 않으면서 부팅 시간을 30-60초로 단축하려면? 또 평일 09:00 같은 일정한 패턴이 있다면 추가로 적용할 정책은?

A) min capacity를 평소 최대치로 높여 On-demand 인스턴스를 항상 충분히 띄워두고 spike 시 즉시 흡수 (대신 유휴 compute 비용 폭증)
B) ASG Warm Pool 활성화 (미리 만든 인스턴스를 Stopped 상태로 보관, scale-out 시 boot만 진행) + 일정 패턴에는 Predictive Scaling 추가 적용. Warm Pool의 stopped 인스턴스는 compute 청구 없고 EBS만 청구되어 비용 효율적
C) 워크로드를 Lambda로 재작성해 provisioned concurrency를 미리 확보하고 스케일링을 서버리스에 위임해 콜드 스타트 자체를 제거
D) Predictive Scaling만 적용해 14일 학습 기반 forecast로 spike 이전에 capacity를 선제 확보 (부팅 시간 단축 자체는 다루지 않음)

**정답: B**
해설: Warm Pool(2021년 출시)이 콜드 스타트 단축의 표준 도구. AMI fetch + cloud-init을 미리 끝낸 인스턴스를 stopped로 보관하므로 부팅이 30-60초로 단축. stopped는 compute 청구 없고 EBS만(GB·월 단위) 청구되어 비용 효율. 일정 패턴(평일 09:00 spike 등)에는 Predictive Scaling(ML 기반 14일 학습 + 48시간 forecast)이 reactive scaling보다 먼저 capacity 확보. 두 도구를 함께 쓰는 게 이상적 — Predictive로 capacity 예측 + Warm Pool로 부팅 단축. unexpected spike에는 Target Tracking이 추가 안전망.

---

## 마무리하며

Week 7은 표면적으로 다섯 가지 다른 도구(Beanstalk, CodeDeploy, Image Builder, OpsWorks/SSM, Launch Template/ASG)를 다뤘지만, 핵심 질문은 다섯 개 결정 축으로 수렴했다. 다운타임 허용도, 임시 용량 비용, 롤백 속도, 인프라 소유 모델, 변경 단위 — 시험 시나리오는 이 다섯 축 위에서 trade-off를 묻는다. 도구 이름과 hook 순서를 외우는 것보다 "이 시나리오에서 어떤 축이 결정적인가"를 빠르게 판단하는 감각이 시험과 실무 모두에서 강력하다.

다음 주(Week 8)는 네트워킹 운영으로 옮겨간다. VPC 트러블슈팅, Flow Logs, VPC Endpoints, Transit Gateway까지 — CloudOps 시험 도메인의 18%를 차지하는 핵심 영역이다. 배포 자동화가 "어떻게 안전하게 코드를 올리나"였다면, 네트워킹은 "어떻게 안전하게 트래픽을 흐르게 하나"의 영역이다.

---

## 🔮 다음 주 예고 (Week 8 - VPC 네트워킹 운영)

- **Day 1**: VPC 기초 — 서브넷, 라우팅 테이블, NACL vs Security Group의 본질적 차이, IPv6 dual-stack
- **Day 2**: VPC Flow Logs 분석, Traffic Mirroring, Reachability Analyzer로 라우팅 검증
- **Day 3**: NAT Gateway, VPC Endpoint(Interface/Gateway), PrivateLink로 서비스 간 보안 통신
- **Day 4**: Transit Gateway 허브-스포크, Site-to-Site VPN, Direct Connect, Route 53 운영 (Latency/Geolocation/Weighted Routing)
- **Day 5**: Week 8 복습 + 시나리오 12문제

> 💡 네트워킹 트러블슈팅 시나리오는 CloudOps 시험에서 가장 까다로운 영역이다. NACL과 SG의 stateless/stateful 차이, VPC Endpoint 정책, Transit Gateway route 우선순위가 핵심 빈출 주제.
