# Day 3 - EC2 Image Builder, Golden AMI라는 운영 미덕

운영팀이 한 번쯤 겪는 사건이 있다. 새벽에 보안팀이 "log4shell 패치를 모든 EC2에 즉시 적용하라"는 요청을 보낸다. SSM Patch Manager로 돌리려고 보니 일부 인스턴스는 Patch Manager Agent가 없고, 일부는 패치 후 부팅 안 되는 의존성이 있고, 일부는 패치 도중 워크로드가 멈춘다. 운영자는 "다음에는 새 AMI를 만들어 ASG에 통째로 갈아끼우자"고 다짐한다. 그게 Golden AMI 패턴이고, 그 다짐을 자동화한 게 **EC2 Image Builder**다.

이 글에서는 Image Builder가 왜 단순한 Packer 대체품이 아니라 "AWS 네이티브 immutable infrastructure 파이프라인"으로 설계됐는지, Recipe·Component·Pipeline이라는 세 레이어가 어떤 책임 분리를 따르는지, 그리고 Golden AMI를 운영 ASG에 흘려보내는 정석 패턴(SSM Parameter Store + Launch Template `{{resolve:ssm:...}}`)이 어떻게 동작하는지 본다. 시험 표 암기가 아니라 "왜 Image Builder가 EC2 콘솔이 아닌 별도 서비스로 분리됐는가"라는 설계 의도를 따라가는 게 목표다.

## Mutable vs Immutable: 인프라가 데이터인가 코드인가

전통적 서버 운영은 **mutable infrastructure**다. 한 번 만든 서버에 SSH로 들어가 패치하고, 설정을 바꾸고, 새 라이브러리를 설치한다. 시간이 지나면 같은 역할인 서버들이 미묘하게 다른 상태가 된다 — 누군가는 6개월 전 패치를 깜빡했고, 누군가는 디버깅 중 임시로 켰던 디버그 플래그를 끄지 않았다. 이 현상이 "snowflake server" 또는 "configuration drift"다.

**Immutable infrastructure**는 이 문제를 정반대 접근으로 푼다. 서버를 절대 수정하지 않는다. 패치가 필요하면 새 AMI를 만들고, 그 AMI로 새 인스턴스를 띄우고, 구 인스턴스를 종료한다. 서버는 데이터(state)가 아니라 코드(artifact)다.

이 철학을 산업화한 사람이 Mitchell Hashimoto이고, 그게 2013년 출시된 Packer다. Packer는 다양한 클라우드의 이미지(AMI, GCP Image, VHD)를 같은 HCL 정의로 빌드한다. AWS Image Builder(2019년 12월 출시)는 Packer와 비슷한 자리에 있지만 **AWS 네이티브 통합**에 강점이 있다 — VPC·IAM·KMS·SSM Parameter·CloudWatch Logs·Inspector가 모두 native로 연결된다.

> 💡 **관련 이론**: Immutable infrastructure는 함수형 프로그래밍의 immutable data structure와 정확히 같은 개념이다. Clojure의 persistent vector, Rust의 ownership system, React의 immutable state 업데이트가 모두 같은 원리다 — "수정하지 말고 새로 만들어라". 분산 시스템에서는 이 원칙이 더 강력하다. 같은 AMI ID에서 만들어진 100대의 EC2가 (User Data를 제외하면) 비트 단위로 동일하다는 보장은 운영 사고 추적을 극단적으로 단순화한다.

> 🔍 **더 깊이**: Image Builder는 내부적으로 SSM Automation Document와 SSM Run Command를 활용한다. 빌드 인스턴스에 SSM Agent가 미리 설치돼 있어서, Image Builder는 빌드 인스턴스에 SSH 키를 심지 않고 SSM Session으로 명령을 실행한다. 그래서 빌드 인스턴스는 **인터넷 in-bound가 전혀 필요 없다** — SSM endpoint만 도달 가능하면 된다. Packer가 빌드 인스턴스에 SSH로 접속하는 모델보다 보안적으로 우수한 이유가 여기 있다. CloudTrail에 모든 빌드 명령이 SSM 호출로 기록되는 부가 효과도 있다.

## Recipe·Component·Pipeline: 세 레이어의 책임 분리

Image Builder의 추상화는 단순해 보이지만 의도적인 분리다.

| 레이어 | 책임 | 변경 빈도 |
|--------|------|-----------|
| **Component** | "한 가지 일"의 빌드 스크립트 (yum install nginx 등) | 거의 안 변함 |
| **Recipe** | Components + Parent Image의 조합 | 가끔 (구성 변경 시) |
| **Infrastructure Configuration** | 빌드용 임시 인스턴스 스펙 (VPC·SG·IAM) | 거의 안 변함 |
| **Distribution Configuration** | 결과 AMI를 어느 리전·계정에 복제할지 | 거의 안 변함 |
| **Pipeline** | 위 넷 + 실행 스케줄 | 가끔 |
| **Image** | 빌드 결과물 (불변 artifact) | 매 실행 |

이 분리가 왜 중요한지는 "여러 OS용 Golden AMI를 운영한다"는 시나리오에서 드러난다. Amazon Linux 2, RHEL 8, Ubuntu 22.04 세 종류의 Golden AMI를 만들 때, 같은 "사내 CloudWatch Agent 설치" Component는 셋 모두에서 재사용된다. Recipe만 셋이고 Component는 공유된다. 만약 Image Builder가 Recipe와 Component를 합쳤다면 같은 코드를 세 번 복사해야 했다.

Component YAML의 phase 구조도 의도가 있다.

```yaml
phases:
  - name: build     # 패키지 설치, 파일 복사
  - name: validate  # 빌드 직후 인스턴스에서 검증
  - name: test      # AMI로 새 인스턴스 띄운 후 검증
```

`validate`와 `test`가 분리된 이유는 **빌드 인스턴스와 실제 사용 인스턴스의 상태가 다를 수 있기 때문**이다. 빌드 인스턴스에서는 정상이지만 새 인스턴스로 띄울 때 cloud-init 단계에서 깨지는 경우가 있다. 예를 들어 빌드 중 hostname을 하드코딩했다면 새 인스턴스도 같은 hostname을 가져 ARP 충돌이 난다. test phase는 AMI를 실제로 띄워 같은 시나리오를 검증한다.

> ⚠️ **함정**: Component YAML의 `action: ExecuteBash`는 SSM Run Command로 실행되는데, 기본 타임아웃이 7200초(2시간)다. 긴 패키지 빌드(예: GCC 컴파일)가 이 한도를 넘으면 조용히 timeout으로 실패한다. `timeoutSeconds`를 명시적으로 설정하지 않으면 디버깅이 어렵다. 또 ExecuteBash는 비대화형(non-interactive) bash라 `.bashrc`의 alias나 함수를 못 쓴다 — 명시적 PATH와 full path command 사용이 안전.

## SSM Parameter Store + Launch Template의 우아함

Golden AMI를 만들고 끝이 아니다. 만들어진 AMI를 운영 ASG가 사용하게 만드는 메커니즘이 필요하다. AWS 권장 패턴은 다음과 같다.

```
[Image Builder Pipeline] → 새 AMI 생성
        ↓ (EventBridge rule)
[Lambda] → SSM Parameter 업데이트
        SSM /golden-ami/al2/latest = ami-XXXXXX
        ↓
[Launch Template]
   ImageId: '{{resolve:ssm:/golden-ami/al2/latest}}'
        ↓
[Auto Scaling Group]
   다음 Instance Refresh 또는 scale-out 시 자동으로 새 AMI 사용
```

이 패턴의 우아함은 **참조의 간접화**에 있다. Launch Template이 AMI ID를 직접 지정했다면 새 AMI가 나올 때마다 Launch Template 새 버전을 만들고 ASG를 업데이트해야 한다. SSM Parameter를 거쳐 가리키면 Launch Template은 그대로 둔 채 SSM Parameter만 바꾸면 끝이다.

`{{resolve:ssm:...}}` 구문은 CloudFormation 동적 참조 문법인데, Launch Template에도 적용된다. 또 다른 형태로 `{{resolve:ssm:/golden-ami/al2/latest:label}}` 같이 SSM Parameter의 특정 label을 가리킬 수도 있어 "production에 prod label, canary에 canary label" 같은 패턴이 가능하다.

> 💡 **관련 이론**: 이 간접화 패턴은 OS의 동적 링킹(dynamic linking)과 정확히 같다. 실행 파일이 라이브러리 함수를 직접 참조하지 않고 PLT/GOT를 거쳐 참조하면 라이브러리 버전 업그레이드가 가능하다. SSM Parameter가 AMI에 대한 PLT 역할을 한다. Kubernetes의 Service → Pod 간 간접 참조도 같은 원리다. 분산 시스템에서 "이름을 통한 참조"가 거의 항상 "주소를 통한 참조"를 이긴다.

> 📚 **사례**: Netflix는 자체 도구 Aminator로 매일 수천 개의 AMI를 빌드했다. 한 사건에서 새 AMI에 버그가 포함된 채 ASG에 흘러 들어가 약 30분 동안 서비스 일부가 죽었다. 사후 조치로 "AMI promotion gate"를 도입했다 — Image Builder가 만든 AMI는 먼저 `staging-latest` SSM Parameter로만 들어가고, 24시간 staging 환경에서 검증된 후에야 별도 Lambda가 `prod-latest`로 promote한다. 이 패턴은 이제 Spinnaker의 표준 워크플로다.

## EC2 Instance Refresh: ASG가 AMI를 교체하는 방식

Launch Template이 새 AMI를 가리키게 됐다고 기존 ASG 인스턴스가 자동으로 갈아끼워지지 않는다. 두 가지 방법이 있다.

**자연 교체**: ASG가 scale-out 할 때, scale-in 할 때, 또는 헬스 체크 실패로 인스턴스를 교체할 때 새 인스턴스는 최신 Launch Template으로 만들어진다. 시간이 지나면 자연스럽게 새 AMI로 수렴하지만 강제할 수 없다.

**Instance Refresh**: ASG의 `start-instance-refresh` API를 호출하면 모든 인스턴스를 점진적으로 새 Launch Template으로 교체한다. `MinHealthyPercentage`로 최소 가용 비율을, `InstanceWarmup`으로 새 인스턴스 워밍업 시간을 지정한다.

```bash
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name web-asg \
  --strategy Rolling \
  --preferences '{"MinHealthyPercentage":90,"InstanceWarmup":300,"CheckpointPercentages":[20,50,100],"CheckpointDelay":600}'
```

`CheckpointPercentages`가 흥미로운 기능이다. 20% 교체 후 10분 대기, 50%까지 교체 후 10분 대기, 마지막으로 100%까지 — 같은 ASG 안에서 자체 canary 배포가 된다. 검증 단계에서 CloudWatch Alarm이 울리면 자동 롤백된다(이전 Launch Template 버전으로 되돌림).

> 🔍 **더 깊이**: Instance Refresh는 내부적으로 Lifecycle Hook을 활용한다. 기존 인스턴스를 종료할 때 `Terminating:Wait` 상태로 잠시 멈추고, 새 인스턴스를 띄울 때 `Pending:Wait`로 멈춘다. 이 hook 동안 운영팀이 CodeDeploy로 코드 배포를 동시에 진행하거나, ALB Target Group 전환을 정확히 동기화할 수 있다. AWS re:Invent 2020 COM301 세션에서 자세히 다루는 패턴이다.

## DLM: 백업이 아니라 EBS Snapshot 라이프사이클

Data Lifecycle Manager(DLM)는 이름이 모호해서 "AWS Backup의 옛날 버전"으로 오해된다. 사실은 **EBS Snapshot과 EBS-backed AMI 전용 자동 생성·정리 도구**다. AWS Backup이 RDS·DynamoDB·EFS·FSx·S3·Storage Gateway까지 폭넓게 다루는 반면, DLM은 좁고 가벼우며 EBS에 특화돼 있다.

DLM의 핵심 동작은 두 가지다.

**Snapshot Lifecycle Policy**: 태그가 일치하는 EBS Volume에서 정기적으로 스냅샷을 만들고, retention 정책에 따라 오래된 스냅샷을 자동 삭제한다.

**Image Lifecycle Policy** (EBS-backed AMI): 태그가 일치하는 EC2 Instance에서 AMI를 만들고, 정책에 따라 오래된 AMI를 deregister + 연관된 스냅샷도 삭제한다.

```bash
aws dlm create-lifecycle-policy \
  --description "Daily EBS snapshot, 7-day retention" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::123:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType":"EBS_SNAPSHOT_MANAGEMENT",
    "ResourceTypes":["VOLUME"],
    "TargetTags":[{"Key":"Backup","Value":"daily"}],
    "Schedules":[{
      "Name":"DailySnapshot",
      "CreateRule":{"CronExpression":"cron(0 17 ? * * *)"},
      "RetainRule":{"Count":7},
      "CopyTags":true,
      "FastRestoreRule":{"Count":2,"AvailabilityZones":["ap-northeast-2a","ap-northeast-2c"]}
    }]
  }'
```

`FastRestoreRule`이 잘 알려지지 않은 옵션이다. 일반적인 EBS Snapshot은 lazy load 방식이라 새 볼륨으로 복원 후 첫 read에서 S3에서 블록을 가져오는 시간이 추가된다. Fast Snapshot Restore(FSR)는 미리 데이터를 EBS 백엔드에 pre-warm해두는 옵션으로, 복원 즉시 full performance를 낸다. 단 시간당 추가 비용이 발생한다(스냅샷 GB당).

> ⚠️ **함정**: DLM의 `RetainRule` 개수는 "성공한 스냅샷"만 센다. 스냅샷 생성이 실패하면 카운트되지 않으므로 retention=7이라도 실제 보관 스냅샷이 4-5개일 수 있다. 운영 알람으로 `dlm-policy-execution-failed` 메트릭을 모니터링하는 게 필수다.

## AMI 공유: 같은 EBS Snapshot을 가리키는 포인터

다중 계정 환경에서 표준 Golden AMI를 공유하는 두 가지 방법이 있다.

**Account-level AMI Sharing** (`modify-image-attribute`): AMI에 다른 계정 ID를 launch permission으로 추가한다. 공유된 계정에서는 콘솔에 "Private images" 탭의 "Shared with me"로 보인다.

**AWS Resource Access Manager (RAM)**: AMI를 Resource Share로 묶어 OU 또는 Organization 전체와 공유한다. 새 계정이 OU에 추가되면 자동으로 공유된다.

여기서 자주 발생하는 함정은 **AMI 공유 = 데이터 복사가 아니다**라는 점이다. AMI는 EBS Snapshot에 대한 메타데이터 포인터이고, 공유는 그 포인터에 대한 launch permission만 부여한다. **EBS Snapshot 자체는 원본 계정에 그대로 있다**. 만약 원본 계정에서 AMI를 deregister하고 스냅샷도 삭제하면, 공유된 계정에서도 launch 불가능해진다.

암호화된 AMI 공유는 추가 단계가 필요하다. EBS Snapshot이 KMS 키로 암호화돼 있다면, 그 KMS 키의 Key Policy에 대상 계정의 사용 권한도 부여해야 한다. AWS-managed KMS 키(`aws/ebs`)는 cross-account 공유 불가능하므로 반드시 customer-managed KMS 키를 써야 한다.

```bash
# 1. AMI 공유
aws ec2 modify-image-attribute \
  --image-id ami-XXXX \
  --launch-permission "Add=[{UserId=111122223333}]"

# 2. EBS Snapshot도 공유
aws ec2 modify-snapshot-attribute \
  --snapshot-id snap-XXXX \
  --create-volume-permission "Add=[{UserId=111122223333}]"

# 3. KMS Key Policy에 대상 계정 추가 (Customer Managed Key only)
aws kms put-key-policy \
  --key-id arn:aws:kms:ap-northeast-2:444455556666:key/abcd-... \
  --policy-name default \
  --policy file://key-policy-with-cross-account.json
```

> 📚 **사례**: 한 핀테크 회사가 PCI-DSS 컴플라이언스를 위해 운영 AMI를 분기마다 deprecate하는 정책을 도입했다. 자동화 스크립트가 90일 지난 AMI를 일괄 deregister하기 시작하자, 다른 계정에서 사용 중이던 ASG가 갑자기 scale-out 실패를 일으켰다 — Launch Template이 deprecated AMI를 참조하고 있었던 것. 사후 조치로 `aws ec2 enable-image-deprecation`을 먼저 적용하고(이건 새 launch는 막지만 기존 참조는 유지), 30일 grace period 후 deregister하는 단계를 추가했다. AWS는 2022년 EC2 Image Deprecation 기능을 정식 지원하기 시작했다.

## Image Builder vs Packer: 언제 무엇을 쓸까

| 항목 | EC2 Image Builder | HashiCorp Packer |
|------|-------------------|------------------|
| **멀티 클라우드** | AWS only | AWS/GCP/Azure/VMware/... |
| **빌드 인스턴스 접근** | SSM Session (인터넷 in-bound 불필요) | SSH/WinRM (포트 개방 필요) |
| **AWS 서비스 통합** | 강함 (KMS, SSM, EventBridge, Inspector) | 외부 도구 (Terraform 등) |
| **컴포넌트 재사용** | Component 단위 명시적 재사용 | builder/provisioner 조합 |
| **스케줄링** | 내장 cron | 외부 cron/CI 필요 |
| **비용** | 빌드 인스턴스 시간 + S3 (저렴) | 동일 + Packer 자체 무료 |
| **러닝 커브** | YAML + Console | HCL (Terraform 사용자에 친숙) |

AWS 단일 클라우드 환경이라면 Image Builder가 더 매끄럽다. 멀티 클라우드라면 Packer가 강제 선택이다. 흥미로운 패턴은 **둘을 조합**하는 것 — Packer로 베이스 AMI를 만들어 멀티 클라우드 호환성을 확보하고, Image Builder로 그 위에 AWS 전용 에이전트(SSM, CloudWatch, Inspector)를 얹는 2단계 빌드. 실제로 Lyft·HashiCorp 자체가 이 패턴을 쓴다.

> 💡 **관련 이론**: 이 2단계 빌드는 Docker의 multi-stage build와 정확히 같은 패턴이다. base stage(공통 의존성) → application stage(앱 특화)의 layering으로 캐시 재사용과 보안 격리를 동시에 얻는다. Image Builder의 Recipe도 Parent Image + Components의 layered 구조로 같은 효과를 낸다.

## Image Builder + Inspector 통합: 빌드 시 취약점 스캔

Image Builder는 빌드 파이프라인에 Amazon Inspector 스캔을 통합할 수 있다. Component yaml에 `aws-inspector` 액션이 있어 빌드 단계에서 자동으로 취약점 평가를 돌린다.

이 통합이 가져오는 효과는 **shift-left security**다. 운영에 배포된 후 Inspector가 취약점을 찾으면 이미 영향 범위가 크지만, 빌드 단계에서 찾으면 그 AMI는 distribute 안 된다. CVSS 점수 임계값을 정해 "Critical 또는 High 취약점 발견 시 파이프라인 실패"로 강제할 수 있다.

```yaml
phases:
  - name: test
    steps:
      - name: InspectorScan
        action: aws-inspector-scan
        inputs:
          severity-threshold: HIGH
          fail-on-finding: true
```

이 단계가 통과해야만 Distribution Configuration이 실행돼 다른 리전·계정에 AMI가 복제된다. 컴플라이언스 감사 관점에서도 강력하다 — "운영 환경의 모든 AMI는 빌드 시 Inspector 통과"라는 attestation을 자동으로 만들 수 있다.

## 정리하며

오늘 본 그림은 두 가지다. 첫째, Image Builder는 단순한 AMI 자동화가 아니라 immutable infrastructure 철학의 AWS 네이티브 구현이다. Recipe·Component·Pipeline의 분리는 재사용성과 변경 빈도 차이를 반영한 의도적 설계다. 둘째, SSM Parameter + Launch Template의 `{{resolve:ssm:...}}` 간접 참조는 "AMI를 만들었다"와 "운영 ASG가 사용한다" 사이의 시간 간격을 자연스럽게 풀어준다.

다음 글에서는 인프라 자체를 코드로 다루는 또 다른 도구, OpsWorks와 그 후속인 Systems Manager Application Manager를 본다. Chef/Puppet 기반 OpsWorks가 왜 deprecate됐는지, 그리고 SSM이 어떻게 그 자리를 다르게 채우는지 — "configuration management"라는 카테고리 자체가 어떻게 진화했는지 따라가보자.

---

## 📝 연습 문제

**문제 1.** 회사가 매월 1일 새 Golden AMI를 만들고, 신규 ASG 인스턴스가 별도 작업 없이 새 AMI를 자동 사용하길 원한다. 가장 적합한 패턴은?

A) 운영팀이 매월 수동으로 AMI 생성 → Launch Template ImageId 업데이트
B) Image Builder Pipeline cron으로 새 AMI 생성 → EventBridge + Lambda로 SSM Parameter 업데이트 → Launch Template의 ImageId를 `{{resolve:ssm:...}}`로 참조
C) Lambda가 주기적으로 모든 ASG 인스턴스에 yum update를 SSH로 실행
D) Beanstalk Custom Platform으로 환경 재생성

**정답: B**
해설: AWS 권장 표준 패턴이다. Launch Template이 SSM Parameter를 간접 참조하면, AMI가 바뀔 때마다 Launch Template 새 버전을 만들 필요가 없다. ASG가 다음에 인스턴스를 띄울 때(scale-out, 헬스 체크 교체, 또는 Instance Refresh) 자동으로 최신 AMI를 사용한다. C는 mutable infrastructure 안티패턴이라 configuration drift 누적. D는 Beanstalk을 잘못 쓴 케이스.

---

**문제 2.** Image Builder Pipeline이 만든 AMI 중 보안 표준 미달인 것은 다른 리전/계정에 배포되지 않게 막으려 한다. 어떤 메커니즘이 적합한가?

A) 수동으로 AMI를 매번 검토
B) Recipe의 Component test phase에 SCAP/CIS Benchmark 검증 또는 `aws-inspector-scan` 액션 추가 — 실패 시 파이프라인 중단으로 Distribution이 실행되지 않음
C) GuardDuty가 자동 차단
D) IAM SCP

**정답: B**
해설: Image Builder Component는 build → validate → test의 3단계 phase 구조. test phase가 실패하면 파이프라인 자체가 중단되어 Distribution Configuration이 실행되지 않는다. SCAP, CIS Benchmark, Inspector 스캔 등을 test phase에 넣으면 "shift-left security"가 가능. GuardDuty는 런타임 위협 탐지지 빌드 단계가 아님.

---

**문제 3.** 1년치 누적된 EBS Snapshot의 비용이 폭증해 자동 정리 메커니즘이 필요하다. 가장 가벼우면서 EBS에 특화된 도구는?

A) AWS Backup
B) Data Lifecycle Manager (DLM) — 태그 기반 자동 생성 + retention 정책
C) S3 Lifecycle Policy
D) CloudWatch Logs Retention

**정답: B**
해설: DLM은 EBS Snapshot과 EBS-backed AMI 전용으로 가볍고 비용도 정책당 매우 저렴(거의 무료). AWS Backup도 EBS를 다룰 수 있지만 RDS/DynamoDB/EFS까지 폭넓게 다루는 더 무거운 도구. 단순 EBS 정리에는 DLM이 정답. 함정 — DLM의 RetainRule Count는 "성공한 스냅샷"만 세므로 실패 시 카운트되지 않는다는 점도 운영상 주의.

---

**문제 4.** 다른 AWS 계정에 customer-managed KMS 키로 암호화된 AMI를 공유하려 한다. 추가로 필요한 단계는?

A) AMI launch permission만 추가하면 충분
B) AMI launch permission + EBS Snapshot create-volume permission + KMS Key Policy에 대상 계정의 Decrypt 권한 부여
C) IAM Role 추가
D) S3 bucket policy 변경

**정답: B**
해설: AMI는 EBS Snapshot 메타데이터 포인터일 뿐이라 데이터 자체는 EBS Snapshot에 있다. AMI 공유 + Snapshot 공유 + KMS 키 권한 셋이 모두 필요. AWS-managed key(`aws/ebs`)는 cross-account 공유 불가능이므로 반드시 customer-managed key 사용. 대상 계정도 자기 IAM Role에서 해당 KMS 키 사용 권한을 가져야 함(Key Policy의 ARN으로 명시되어 있어야 활성화됨).

---

**문제 5.** Image Builder Pipeline의 빌드 인스턴스는 어디서 실행되며, 인터넷 in-bound 접근이 필요한가?

A) AWS 관리 환경에서 실행되며 사용자 VPC와 무관
B) Infrastructure Configuration에 지정한 사용자 VPC의 임시 EC2에서 실행되며, SSM Session을 사용하므로 in-bound 인터넷이 필요 없음 (out-bound 또는 VPC Endpoint로 SSM/S3 도달만 필요)
C) Lambda 컨테이너에서 실행
D) Fargate Task로 실행

**정답: B**
해설: Image Builder는 사용자 계정의 임시 EC2 인스턴스를 생성해 빌드한다. 빌드 인스턴스 스펙(타입, VPC, SG, IAM)은 Infrastructure Configuration에 지정. 핵심 보안 특징은 빌드 인스턴스에 SSM Agent로 명령을 전달하므로 SSH 키 심을 필요가 없고 in-bound 22/3389 포트가 닫혀 있어도 동작. Out-bound는 SSM/S3/CloudWatch Logs endpoint만 도달 가능하면 되므로 private subnet + VPC Endpoint 조합으로 완전 격리 가능.

---

**문제 6.** 기존 ASG에 새 Launch Template 버전(새 AMI 참조)을 적용했는데 기존 인스턴스는 그대로 있다. 모든 인스턴스를 안전하게 점진 교체하면서, 중간에 문제 발견 시 자동 롤백되려 한다. 가장 적합한 도구는?

A) ASG의 desired-capacity를 0으로 설정 후 다시 증가
B) EC2 Auto Scaling Instance Refresh — Rolling 전략, MinHealthyPercentage·CheckpointPercentages·자동 롤백 옵션 활용
C) CloudFormation 스택 전체 재배포
D) CodeDeploy In-place 배포

**정답: B**
해설: Instance Refresh가 정확히 이 시나리오를 위한 기능. CheckpointPercentages로 단계별 검증(예: 20% → 50% → 100%), MinHealthyPercentage로 가용 인스턴스 비율 보장, CheckpointDelay로 각 단계 후 안정화 대기. 자동 롤백은 CloudWatch Alarm과 연동되어 메트릭 이상 시 이전 Launch Template으로 자동 되돌림. 함정 — Instance Refresh 없이 그냥 Launch Template을 바꿔도 자연 교체로 시간 지나면 수렴하지만 강제력은 없다.

---

**문제 7.** 운영 중인 AMI를 deprecate해서 새 launch는 막되, 이미 그 AMI를 참조 중인 Launch Template은 계속 동작하도록 하고 싶다. 어떤 메커니즘이 적합한가?

A) `aws ec2 deregister-image`로 AMI 삭제
B) `aws ec2 enable-image-deprecation`으로 AMI를 deprecated 상태로 표시 — 콘솔/API에서 새 launch는 경고/필터링되지만 기존 ID 참조는 계속 동작, 추후 일정에 따라 deregister
C) AMI 태그에 `status=deprecated` 추가
D) IAM 정책으로 차단

**정답: B**
해설: 2022년 AWS가 정식 지원한 EC2 Image Deprecation 기능. `deprecation-time`을 미래 시점으로 지정하면 그 시간 이후 콘솔의 AMI 목록에서 기본 필터링되고 일부 API는 경고를 반환하지만, 실제 launch는 가능하다. 단순 deregister는 즉시 launch 불가능해져 기존 Launch Template 참조가 깨질 수 있다. 안전한 deprecation 워크플로 — ① `enable-image-deprecation`으로 표시 → ② 30일 grace period 동안 운영팀 마이그레이션 → ③ 그 후 deregister + snapshot 삭제. 컴플라이언스 환경(PCI-DSS 등)에서 필수 패턴.

---
