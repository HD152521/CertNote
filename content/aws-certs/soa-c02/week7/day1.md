# Day 1 - Elastic Beanstalk과 다섯 가지 배포 정책, 그리고 무중단의 진짜 비용

처음 Beanstalk 콘솔에서 "Deployment policy"를 골라야 할 때 다섯 개 선택지가 동등해 보인다. All at once, Rolling, Rolling with additional batch, Immutable, Blue-Green. 이름은 비슷한데 운영자의 새벽잠과 회사 카드값을 결정하는 차이가 그 안에 들어 있다. 어떤 걸 고르냐에 따라 5분 다운타임이 생기기도 하고, 30분짜리 배포가 비용 2배로 돌기도 하고, 알람 한 번에 즉시 롤백되기도 한다.

이 글에서는 Beanstalk이라는 PaaS가 왜 EC2/ALB/ASG를 굳이 고객 계정에 만들어주는 방식으로 설계됐는지부터 시작해, 다섯 정책의 trade-off를 시간·비용·다운타임·롤백 4축으로 본다. 시험을 위한 표 암기가 아니라 "이번 릴리스에 어떤 정책이 맞는가"를 운영자처럼 결정할 수 있는 감각을 얹는 것이 목표다.

## Beanstalk이 PaaS이면서 IaaS 위에 얹힌 이유

Beanstalk을 단순히 "Heroku의 AWS 버전"으로 이해하면 절반만 본 것이다. 2011년 1월 출시 당시 AWS는 이미 EC2·RDS·ELB·SQS를 따로 팔고 있었고, 개발자들은 "이걸 일일이 콘솔에서 클릭해 묶는 게 너무 힘들다"고 불평했다. Heroku(2007)와 Google App Engine(2008)이 PaaS 시장을 휩쓸던 시기였다. AWS의 답이 Beanstalk이었는데, 흥미로운 결정은 **인프라를 AWS 계정 안에 가시화한 채로 묶었다**는 점이다.

Heroku는 Dyno라는 추상화 뒤에 EC2가 숨어 있어서 고객이 못 본다. Beanstalk은 정반대다. `aws ec2 describe-instances`로 EC2가 그대로 보이고, ALB도 ASG도 RDS도 다 고객 계정 리소스다. **PaaS 편의성 + IaaS 통제권**이라는 trade-off의 산물이다. 시험 시나리오에서 "Beanstalk과 ECS 중 무엇을 골라야 하나"가 나오면, Beanstalk은 "기존 EC2 워크로드를 그대로 두면서 자동화하고 싶을 때", ECS/Fargate는 "컨테이너 표준으로 새로 짤 때"라는 차이로 갈라진다.

> 💡 **관련 이론**: PaaS의 분류는 NIST SP 800-145에서 "고객은 애플리케이션을 배포하지만, 기반 클라우드 인프라(네트워크, 서버, 운영체제, 스토리지)는 제어하지 않는다"로 정의된다. Beanstalk은 엄밀히 말하면 이 정의를 **반쯤 깬다** — 고객이 SSH로 EC2에 접속할 수도, 보안 그룹을 직접 수정할 수도 있다. 그래서 일부 문헌은 Beanstalk을 "Managed IaaS" 또는 "Application Platform"이라고 부른다. 시험 답안으로는 PaaS가 맞지만, 실제 책임 모델은 IaaS에 가깝다는 점을 기억하면 함정 문제를 피한다.

> 🔍 **더 깊이**: Beanstalk의 내부 동작은 CloudFormation 위에 얹혀 있다. `eb create` 한 줄을 치면 Beanstalk이 내부적으로 CloudFormation 스택을 만들고(`awseb-e-xxx-stack`), 그 스택이 EC2·ALB·ASG·SG를 프로비저닝한다. 그래서 `aws cloudformation describe-stack-events`로 Beanstalk 환경의 생성 과정을 그대로 볼 수 있다. 이 사실은 두 가지 함의를 준다. ① Beanstalk 환경에 문제가 생기면 CloudFormation 이벤트가 1차 진단 소스다. ② Beanstalk이 만든 리소스를 콘솔에서 수동 수정하면 stack drift가 발생해 다음 배포 때 덮어쓰여진다.

## 다섯 가지 배포 정책의 진짜 trade-off

배포 정책 비교표는 다들 외운다. 문제는 시나리오에서 "어느 게 맞느냐"를 판단할 때 보통 두 축(다운타임·비용)만 본다는 점이다. 실제로는 **속도, 용량, 비용, 롤백 속도, 실패 시 영향 범위** 5개 축이 모두 다르다.

| 정책 | 배포 시간 | 다운타임 | 임시 용량 | 임시 비용 | 롤백 속도 | 실패 시 영향 |
|------|-----------|----------|-----------|-----------|-----------|-------------|
| **All at once** | 1-2분 | **있음** | 0% (전체 정지) | 없음 | 재배포 필요 (5분) | 100% 사용자 |
| **Rolling** | 5-10분 | 없음 | 일시 **감소** | 없음 | 재배포 필요 | 배치 비율 만큼 |
| **Rolling with batch** | 7-15분 | 없음 | 유지 | 배치만큼 +α | 재배포 필요 | 배치 비율 만큼 |
| **Immutable** | 10-20분 | 없음 | 유지 | **2배** (임시) | 빠름 (구 ASG 살아있음) | 0% (검증 통과 후 전환) |
| **Blue-Green (URL Swap)** | 15-30분 + DNS TTL | 없음 | 유지 | **2배** (병행 동안) | 즉시 (CNAME 되돌림) | 0% (검증 후 전환) |

"All at once를 운영에 쓰면 안 된다"고들 하지만, 사실 **개발/스테이징에서는 가장 합리적**이다. 트래픽 영향이 없고 배포 속도가 가장 빠르며, 실패해도 다시 deploy하면 끝이다. 운영자가 정책을 고를 때 핵심은 "환경 등급 × 실패 비용"의 곱이다.

### Rolling의 "용량 감소"가 위험한 이유

Rolling은 흔히 "다운타임 없이 비용도 없는 좋은 옵션"으로 소개되지만, **트래픽 spike와 겹치면 사실상 다운타임과 같은 효과**를 낸다. 4대 ASG에서 50% 배치 Rolling을 하면 배포 중 2대만 트래픽을 처리한다. 이 시점에 평소의 1.2배 트래픽이 들어오면 응답 시간이 폭증하고 ELB 헬스 체크가 실패하기 시작한다. 헬스 체크 실패는 ASG에게 "인스턴스 교체" 신호로 해석되고, 배포 중인 인스턴스까지 새로 만들기 시작하면서 **배포가 무한 루프**에 빠진다.

> 📚 **사례**: Atlassian이 2022년 4월 5일부터 시작된 14일 장애에서 핵심 원인 중 하나가 "스크립트 실수 + 배포 중 부분 용량"의 조합이었다. Maintenance 스크립트가 의도와 다르게 약 400개의 고객 사이트를 영구 삭제 큐에 넣었고, 복구 절차도 점진 배포 방식이라 사이트당 48시간이 걸렸다. Multi-stage 배포가 안전한 것 같지만 **재해 복구 시에는 동시 처리량이 발목을 잡는다**는 교훈을 줬다. [Atlassian 공식 사후 회고](https://www.atlassian.com/engineering/post-incident-review-april-2022-outage). 이 사건 후 Atlassian은 자동 복구 도구의 동시성을 100배로 올렸다.

> ⚠️ **함정**: Rolling 배포 중 헬스 체크 grace period를 너무 짧게 잡으면 새 인스턴스가 워밍업되기 전에 unhealthy로 판정돼 배포가 멈춘다. Beanstalk의 기본 grace period는 300초인데, JVM 기반 앱(Spring Boot 등)은 콜드 스타트가 60-90초 걸리는 게 흔하므로 600초 이상으로 늘리는 게 안전하다.

### Immutable이 "비용 2배"라는 말의 함정

Immutable 정책은 "기존 ASG는 그대로 두고, 새 ASG를 만들어 검증한 뒤 트래픽을 전환"하는 방식이다. 검증 단계에서 새 ASG에 기존과 동일한 수의 인스턴스를 만들기 때문에 "비용 2배"라고 흔히 설명된다. 하지만 이 비용 2배가 적용되는 구간은 **검증 동안만**(보통 5-15분)이고, AWS는 분 단위 과금이 아니라 **시간 단위 과금**(t/m/c 시리즈는 시간 단위, 일부 nano/micro는 초 단위)이라서 30분짜리 배포 한 번은 인스턴스 시간으로 1시간 이상 청구될 수 있다.

월 100회 배포하는 팀이라면 이 비용이 무시할 수 없는 수준이 된다(t3.medium 4대 × 1시간 × 100회 = 약 $16/월). 운영팀은 "Immutable이 비싸다"라기보다 "Immutable의 비용은 배포 빈도에 비례한다"로 이해해야 한다.

### Blue-Green URL Swap의 DNS TTL 함정

Beanstalk의 Blue-Green은 두 환경을 따로 만들고 `swap-environment-cnames` API로 CNAME을 맞바꾸는 방식이다. CloudFront 앞단이거나 Route 53 Alias라면 비교적 빠르게 전환되지만, **클라이언트와 ISP가 DNS를 캐싱**하기 때문에 모든 사용자가 새 환경으로 가는 데 TTL만큼 걸린다.

Beanstalk 기본 CNAME TTL은 60초지만, 일부 ISP는 RFC 2181을 어기고 TTL을 더 길게 잡아둔다. 실제로 일부 한국 모바일 캐리어는 5분, 일부 사내 DNS 리졸버는 30분까지 캐싱하는 사례가 보고된다. 그래서 **Blue-Green 배포는 "즉시 롤백"이 가능하지만, 실제 트래픽 전환은 점진적**이다. 이게 시험에서 "Blue-Green = 즉시 100% 전환"이라는 함정 보기로 자주 등장한다.

> 💡 **관련 이론**: DNS TTL과 일관성의 trade-off는 RFC 1035(1987)와 RFC 2181(1997)에서 정의된다. 짧은 TTL은 빠른 변경 전파를 주지만 권위 서버 부하를 늘리고, 긴 TTL은 부하는 적지만 변경 반영이 느리다. AWS Global Accelerator가 DNS 대신 BGP Anycast 정적 IP를 쓰는 이유가 정확히 이 trade-off를 우회하기 위해서다. Anycast는 BGP 라우팅 테이블 업데이트(보통 수 초)로 전환되므로 DNS TTL을 기다리지 않는다.

## CodeDeploy·Kubernetes Rolling Update와의 비교

Beanstalk의 배포 정책은 AWS만의 발명이 아니다. 다른 시스템과 비교하면 본질이 더 잘 보인다.

| 시스템 | All at once | Rolling | Blue-Green | Canary |
|--------|-------------|---------|------------|--------|
| **Beanstalk** | All at once | Rolling/RWB | Immutable, URL Swap | (직접 미지원) |
| **CodeDeploy EC2** | AllAtOnce | HalfAtATime/OneAtATime | Blue-Green via ASG | (간접) |
| **Kubernetes** | Recreate | RollingUpdate(maxSurge/maxUnavailable) | 두 Deployment + Service 전환 | Argo Rollouts, Flagger |
| **GCP App Engine** | (없음, 항상 무중단) | Traffic splitting (점진) | Version 분리 + 트래픽 100% 전환 | Traffic splitting (가중치) |
| **Azure App Service** | (재시작) | Slot 배포 | Deployment Slot Swap | Traffic Routing(%) |

GCP App Engine과 Azure Deployment Slot이 Beanstalk Blue-Green과 가장 비슷한 모델이다. 특히 Azure의 **Slot Swap**은 IP 레벨에서 라우팅 테이블을 즉시 바꾸기 때문에 DNS TTL 문제가 없다는 점이 더 우아하다. AWS는 같은 효과를 ALB Target Group 가중치로 내는데, Beanstalk이 이 메커니즘을 안 쓰는 이유는 환경 격리(완전히 다른 ASG·DB·설정)를 더 강하게 보장하기 위함이다.

Kubernetes의 `maxSurge`와 `maxUnavailable`은 Rolling with additional batch의 정확한 일반화다. `maxSurge=25%`는 임시 +25% 인스턴스를 허용한다는 뜻이고, `maxUnavailable=0%`는 용량 감소를 허용하지 않는다는 뜻이다. 즉 "K8s RollingUpdate with maxSurge=25%, maxUnavailable=0% = Beanstalk Rolling with additional batch 25%"가 정확히 같은 동작이다.

## Worker Tier: SQS Daemon이라는 작은 발명

Worker Tier는 Beanstalk의 잘 알려지지 않은 강점이다. 일반적인 Worker 패턴(EC2가 직접 SQS poll)을 쓰면 코드에 SQS SDK·재시도·DLQ 처리를 다 넣어야 한다. Beanstalk Worker는 그걸 **사이드카 데몬으로 분리**한다.

```
[SQS Queue] ──┐
              │ poll
              ▼
        [SQS Daemon] ── HTTP POST localhost:80 ──→ [Web App (어떤 언어든)]
              │                                          │
              │ ◄────────── HTTP 200 ─────────────────── │
              ▼
        DeleteMessage
```

SQS Daemon이 메시지를 받아 로컬 앱에 HTTP POST로 던지고, 앱이 200을 반환하면 자동 삭제, 4xx/5xx면 visibility timeout 후 재시도한다. **앱 코드는 HTTP 핸들러 하나만 구현하면 끝**이다. 이 디자인은 12-factor app의 "Process Type"과 정확히 맞물린다(Worker는 Web과 같은 코드, 다른 entry point).

> 🔍 **더 깊이**: SQS Daemon은 메시지를 받을 때 HTTP 헤더에 `X-Aws-Sqsd-Msgid`, `X-Aws-Sqsd-Queue`, `X-Aws-Sqsd-First-Received-At`, `X-Aws-Sqsd-Receive-Count` 등을 넣는다. 앱은 `Receive-Count`를 보고 재시도 횟수에 따라 처리 전략을 바꿀 수 있다(예: 3회 이상이면 정적 분석 → DLQ로 즉시 이동). 또 `cron.yaml`로 정기 작업을 정의하면 SQS Daemon이 내부적으로 잠금 메시지를 만들어 leader election을 한다(여러 인스턴스가 같은 cron을 동시에 돌리지 않도록).

## RDS 외부화: 한 번 데이고 나서야 배운다

Beanstalk 환경 생성 시 "DB 추가" 옵션을 누르면 RDS가 같이 만들어진다. 편리해 보이지만 **환경이 종료되면 RDS도 같이 삭제**된다. 운영에서 가장 자주 보는 사고가 "스테이징 환경 정리 중 prod DB 백업 누락" 같은 사건이다.

권장 패턴은 RDS를 별도 CloudFormation/Terraform 스택으로 빼고, Beanstalk 환경 변수(`RDS_ENDPOINT`, `RDS_PASSWORD` 등)로 endpoint만 주입하는 것이다. 더 안전하게는 **Secrets Manager에 자격증명을 두고 IAM 권한으로 가져오기**.

```bash
# 권장: 외부 RDS endpoint를 환경 변수로 주입
aws elasticbeanstalk update-environment \
  --environment-name MyApp-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DB_HOST,Value=mydb.xxx.rds.amazonaws.com \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DB_SECRET_ARN,Value=arn:aws:secretsmanager:...:secret:db-creds
```

> 📚 **사례**: 2017년 Travis CI는 운영 환경 마이그레이션 중 빌드 데이터 손실을 겪었는데, 일부 원인이 "환경별 DB 분리가 명확하지 않아 staging 정리가 prod에 영향"이었다. 이 사건 이후 많은 회사들이 **DB는 항상 환경과 별도 스택으로**라는 원칙을 채택했다. AWS Well-Architected Framework의 Reliability Pillar에서도 "데이터 라이프사이클은 컴퓨트 라이프사이클과 분리"가 명문화돼 있다.

## .ebextensions와 .platform/hooks

Beanstalk의 OS 레벨 자동화는 두 가지 메커니즘을 거쳤다.

**`.ebextensions/*.config`**는 Amazon Linux 1 시절부터 쓰던 방식으로, YAML/JSON으로 패키지·환경 변수·container_commands를 정의한다. Amazon Linux 2(Platform v3) 이후 일부 동작 방식이 바뀌었다.

**`.platform/hooks/`**는 Amazon Linux 2에서 도입된 새 메커니즘으로, 디렉터리 구조에 셸 스크립트를 놓으면 배포 단계별로 실행된다.

```
.platform/
  hooks/
    prebuild/     # 앱 빌드 전
    predeploy/    # 배포 전
    postdeploy/   # 배포 후
  confighooks/
    prebuild/
    predeploy/
    postdeploy/
```

마이그레이션 시 가장 자주 발생하는 함정이 `container_commands`다. Platform v2에서는 `container_commands`가 staging directory에서 실행됐지만, v3에서는 prebuild/predeploy로 옮겨야 한다. 단순 lift-and-shift가 안 된다.

## 정리하며

오늘 본 그림은 두 가지다. 첫째, Beanstalk은 PaaS 편의성과 IaaS 통제권을 동시에 주려는 타협의 산물이고, 그래서 EC2·ALB·RDS가 그대로 고객 계정에 보인다. 둘째, 다섯 가지 배포 정책은 단순한 "옵션"이 아니라 **속도·용량·비용·롤백·실패 영향**이라는 5축 trade-off의 좌표다.

다음 글에서는 Beanstalk이 환경까지 묶는 것과 달리 "코드만 배포"에 집중하는 CodeDeploy를 본다. AppSpec hook의 정확한 실행 순서, Lambda Canary의 가중치 변경 방식, ECS Blue-Green의 Target Group 전환까지 — 다른 compute platform에서도 같은 배포 추상화를 어떻게 구현하는지 따라가보자.

---

## 📝 연습 문제

**문제 1.** 운영 환경에서 다운타임 없이, 용량을 유지하면서, 추가 비용을 최소화하려 한다. 어떤 Beanstalk 배포 정책이 적합한가?

A) All at once
B) Rolling
C) Rolling with additional batch
D) Immutable

**정답: C**
해설: 4축 trade-off로 풀어보면 — 다운타임 없음(A 탈락), 용량 유지(B는 일시 감소이므로 탈락), 비용 최소(D는 비용 2배라 탈락). Rolling with additional batch는 배치 단위 교체 + 임시 인스턴스로 용량을 유지하면서 추가 비용은 배치 크기만큼만이다. Immutable이 더 안전하지만 "비용 최소"라는 제약이 있으면 RWB가 정답. 만약 시나리오에 "트래픽 spike가 예상된다"가 추가되면 Immutable로 답이 바뀐다(Rolling 계열은 헬스 체크 실패 위험).

---

**문제 2.** 운영자가 새 버전 배포 후 실패 알람이 뜨면 즉시 100% 이전 버전으로 되돌아가길 원한다. 어떤 정책 조합이 가장 빠른 롤백을 보장하는가?

A) All at once + 자동 롤백
B) Rolling + CloudWatch Alarm
C) Immutable 또는 Blue-Green URL Swap
D) Rolling with additional batch + DLM

**정답: C**
해설: Immutable은 구 ASG가 살아 있어 트래픽만 되돌리면 끝(수 분), Blue-Green URL Swap은 CNAME만 되돌리면 즉시(DNS TTL 한도 내). 두 방식 모두 "구 버전 인스턴스가 실제로 살아 있다"는 게 핵심. All at once나 Rolling은 구 버전 인스턴스가 이미 사라졌으므로 롤백 = 재배포(5-10분)다. 다만 Blue-Green은 DNS TTL 동안 일부 사용자는 여전히 새 환경에 머무를 수 있다는 점이 함정 — "즉시 100% 전환"이 아니라 "즉시 라우팅 변경"이다.

---

**문제 3.** Beanstalk 환경에서 RDS를 같이 만든 후 환경을 종료했더니 DB도 삭제됐다. 데이터 손실을 어떻게 방지해야 했나?

A) RDS에 DeletionPolicy: Retain 설정
B) RDS를 Beanstalk 외부 별도 스택으로 분리하고 환경 변수/Secrets Manager로 endpoint·자격증명 주입
C) RDS Multi-AZ 활성화
D) 자동 백업 활성화

**정답: B**
해설: 핵심은 "환경 라이프사이클과 데이터 라이프사이클의 분리". Beanstalk 내장 RDS는 환경 종료 = DB 삭제가 기본 동작이고, DeletionPolicy는 CloudFormation 옵션이라 Beanstalk 콘솔에서 직접 못 켠다. Multi-AZ나 자동 백업은 가용성/복구지 환경 종료 보호와 무관(스냅샷도 환경 종료 시 보존 정책에 따라 사라질 수 있음). 모범 사례는 RDS 스택 → Beanstalk 스택으로 endpoint 주입. 더 안전하게는 Secrets Manager + IAM database authentication. AWS Well-Architected Reliability Pillar의 명시 항목.

---

**문제 4.** Beanstalk Worker Tier의 메시지 처리 흐름으로 옳은 것은?

A) Lambda가 SQS 트리거로 메시지 처리
B) SQS Queue → SQS Daemon → 로컬 앱에 HTTP POST → 200 응답 시 메시지 자동 삭제
C) Kinesis Stream → KCL Worker
D) SNS Subscription으로 직접 처리

**정답: B**
해설: Worker Tier는 SQS Daemon 사이드카가 메시지를 받아 로컬 앱(보통 80포트)에 HTTP POST로 던지는 구조. 앱이 200을 반환하면 DeleteMessage 호출, 4xx/5xx면 visibility timeout 후 재시도. 이 디자인의 장점은 앱 코드에 SQS SDK가 필요 없다는 점 — 웹 핸들러 하나로 통일된다. 함정 보기로 "Lambda가 처리"가 자주 나오는데, Lambda는 별도 서비스. Beanstalk Worker는 어디까지나 EC2 위에서 도는 데몬 기반이다. `cron.yaml`로 정기 작업도 정의 가능.

---

**문제 5.** `.ebextensions/*.config`로 데이터베이스 마이그레이션을 모든 인스턴스에서 한 번만 실행하려면?

A) container_commands에 단순히 명령어 추가
B) container_commands에 `leader_only: true` 옵션 추가
C) BeforeInstall hook 사용
D) User Data에 추가

**정답: B**
해설: `container_commands`에 `leader_only: true`를 주면 Beanstalk이 ASG의 리더 인스턴스에서만 한 번 실행한다. 마이그레이션·시드 데이터 입력 같은 1회성 작업의 표준 패턴. 함정으로 자주 나오는 게 "User Data에 마이그레이션 추가" — User Data는 모든 인스턴스에서 매번 실행되므로 마이그레이션을 N번 돌리게 돼서 unique constraint 에러나 데이터 중복이 생긴다. Amazon Linux 2 Platform v3로 마이그레이션할 때는 `container_commands` 대신 `.platform/hooks/prebuild/` 또는 `predeploy/`로 옮겨야 한다는 점도 함께 기억.

---

**문제 6.** Beanstalk Blue-Green via URL Swap을 했는데 일부 사용자가 5분 이상 구 환경에 머무는 현상이 발생했다. 가장 가능성 높은 원인은?

A) Beanstalk 버그
B) ALB Target Group 설정 오류
C) 클라이언트 또는 ISP DNS 캐시가 CNAME TTL을 무시하거나 더 길게 캐싱
D) IAM 권한 부족

**정답: C**
해설: Beanstalk CNAME 기본 TTL은 60초지만 ISP나 corporate DNS resolver가 RFC 2181을 어기고 더 길게 캐싱하는 게 흔하다. 한국 일부 모바일 캐리어가 5분, 일부 사내 DNS는 30분까지 캐싱하는 사례가 보고된다. 해결책은 ① Route 53 Alias Record(60초 미만 가능)로 앞단 구성, ② CloudFront 앞단 + Origin Failover, ③ ALB Weighted Target Groups로 DNS 우회. 시험에서 "Blue-Green = 즉시 100% 전환"이라는 보기가 나오면 함정이다 — 즉시인 건 라우팅 의도지 실제 트래픽 도달이 아니다.

---

**문제 7.** ASG 기반 Rolling 배포 중 헬스 체크 실패가 반복되며 배포가 멈췄다. 가장 가능성 높은 원인과 해결은?

A) Beanstalk 버그 - 재배포
B) Health Check Grace Period가 앱 워밍업 시간보다 짧음 - Grace Period를 600초 이상으로 늘림
C) ALB 자체 문제 - NLB로 변경
D) AMI 손상 - AMI 재빌드

**정답: B**
해설: Rolling 배포 함정의 전형. JVM 기반 앱(Spring Boot, Tomcat)은 콜드 스타트가 60-90초, 큰 앱은 2-3분이 걸린다. Beanstalk 기본 Grace Period 300초가 부족할 수 있다. Grace Period 동안 ELB 헬스 체크는 무시되므로 워밍업 시간 + 여유를 줘야 한다. 추가로 ELB Health Check Path도 단순 `/`가 아니라 `/health` 같은 가벼운 엔드포인트로 두는 게 좋다(DB 연결까지 확인하는 deep health check은 그 안에서 비동기로). 시험에서 Rolling 관련 문제가 나오면 "용량 감소 + 헬스 체크"가 자주 결합돼 등장한다.

---