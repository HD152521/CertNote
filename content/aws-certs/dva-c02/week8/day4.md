# Day 4 - Elastic Beanstalk: AWS가 만든 가장 친절한 PaaS

스타트업이 AWS를 처음 도입할 때 가장 자주 만나는 풍경이 있다. 개발자 두 명, 코드는 Flask 또는 Express, "일단 띄우긴 해야 하는데 ALB는 뭐고 ASG는 뭐고 IAM Role은 또 뭐야". 이런 상황을 해결하기 위해 AWS는 2011년 1월 **Elastic Beanstalk**를 출시했다. "코드만 zip으로 올리면 EC2·ELB·ASG·CloudWatch까지 알아서 만들어주는 PaaS"라는 약속이었다.

DVA-C02 시험에서 Beanstalk는 ECS, Lambda, App Runner와 함께 "**언제 어떤 컴퓨트를 선택할지**" 시나리오의 한 축으로 꾸준히 출제된다. 특히 6가지 배포 전략의 차이, .ebextensions와 .platform의 구분, 그리고 RDS를 환경 안에 둘 때의 함정이 단골 출제 포인트다. 이번 글은 Beanstalk의 내부 구조 — 사실은 CloudFormation 위에 얹은 추상화 — 부터 시작해, 각 배포 전략이 실제로 어떻게 동작하는지를 정리한다.

## Beanstalk가 풀려는 문제: Heroku식 경험을 AWS 위에

Beanstalk가 등장한 2011년은 Heroku(2007 창업, 2010 Salesforce 인수)가 PaaS 시장의 표준을 만들던 시기였다. `git push heroku main` 한 줄로 코드가 production에 배포되는 경험은 당시로서는 혁명적이었다. AWS는 그 경험을 자기 플랫폼 위에 가져오면서 동시에 "Heroku보다 AWS 인프라에 깊이 접근 가능하다"는 차별점을 내세웠다.

Beanstalk의 약속을 한 줄로 요약하면 "당신의 코드만 신경 쓰세요, EC2·ALB·ASG·CloudWatch·VPC는 우리가 알아서". 그러나 그 약속의 trade-off가 핵심이다 — 추상화가 잘못 새는 순간(예: 특수한 nginx 튜닝, 특정 OS 패키지 필요) Beanstalk는 갑자기 답답해진다.

> 💡 **관련 이론**: PaaS의 추상화가 실제로 잘 동작하는지는 "Joel Spolsky의 Law of Leaky Abstractions"(2002)와 직접 닿아 있다. "모든 비자명한 추상화는 어느 정도 새기 마련"이라는 명제다. Beanstalk는 EC2/ALB의 복잡성을 숨기지만, 운영 중 특수한 요구가 생기면 그 아래 layer를 직접 만져야 하고 그 순간 추상화가 깨진다. .ebextensions와 .platform이 정확히 그 "추상화의 균열"을 메우는 escape hatch다.

> 🔍 **더 깊이**: Beanstalk는 내부적으로 **CloudFormation 스택**을 생성한다. `eb create` 한 번이면 EC2, ALB, ASG, Security Group, IAM Role, CloudWatch Alarm 등이 정의된 CFN 템플릿이 자동 생성되고 그게 deploy된다. 즉 Beanstalk 환경 = CloudFormation 스택의 friendly UI다. 이 사실을 알면 ① 환경 삭제 시 무엇이 같이 삭제되는지 ② drift detection이 왜 가능한지 ③ Beanstalk가 만든 리소스를 CFN으로 import 가능한지를 모두 설명할 수 있다.

## 두 가지 환경 유형: Web vs Worker

Beanstalk 환경은 두 종류다. 같은 application 안에 둘 다 존재할 수 있고, 보통 함께 쓴다.

### Web Server Environment

```
[Route 53 또는 Beanstalk DNS]
       │
       ▼
[Application Load Balancer]
       │
       ├── [EC2-1 (web)] ┐
       ├── [EC2-2 (web)] ├── Auto Scaling Group
       └── [EC2-N (web)] ┘
                │
                ▼
        [RDS (별도 권장)]
```

### Worker Environment

```
[SQS Queue]
   │ (메시지 도착)
   ▼
[EC2 인스턴스의 SQS Daemon]
   │ (메시지를 HTTP POST로 변환)
   ▼
[애플리케이션 컨테이너 (포트 80)]
```

> 🔍 **더 깊이**: Worker 환경의 마법은 **SQS Daemon**이라는 별도 프로세스다. 이 daemon은 EC2 인스턴스에 미리 설치돼 있고, SQS 큐를 polling해 메시지가 오면 그것을 application의 HTTP endpoint(기본 `/`)에 POST로 변환해 보낸다. 즉 application은 그냥 HTTP 서버로 짜면 되고 SQS SDK를 직접 호출할 필요 없다. 이 패턴은 Heroku의 worker dyno와 같은 사상이고, "이벤트 처리와 HTTP 처리를 동일한 코드 베이스로 통일"한다는 장점이 있다.

```yaml
# cron.yaml (Worker 환경에서 정기 작업)
version: 1
cron:
  - name: "daily-report"
    url: "/jobs/daily-report"
    schedule: "0 0 * * *"
  - name: "hourly-cleanup"
    url: "/jobs/cleanup"
    schedule: "0 * * * *"
```

SQS Daemon이 cron.yaml을 읽어 자동으로 schedule을 만들고, 시간이 되면 자기 자신의 큐에 메시지를 넣는다. 그 메시지가 다시 application HTTP로 흘러가 처리된다. 외부 cron 서비스 없이 정기 작업을 풀 수 있는 깔끔한 패턴.

> ⚠️ **함정**: Worker 환경은 ALB가 없다. SQS Daemon → EC2 local의 application으로 직접 HTTP 호출. 외부 HTTP 노출이 필요하면 Web Server Environment를 별도로 만들어야 한다. 시험에서 "Worker 환경에 public endpoint가 필요"가 나오면 거의 항상 함정 — Web Server 환경과 혼동시키는 보기다.

## 배포 전략 6종: 시험의 단골 표

Beanstalk의 배포 전략 표는 시험에 거의 매번 나오는 핵심이다. 각 전략의 "다운타임 / 배포 속도 / 비용 / 롤백 속도"를 외워두면 시나리오 문제의 70%를 잡을 수 있다.

| 전략 | 다운타임 | 새 인스턴스 | 추가 비용 | 롤백 시간 | 적합 환경 |
|------|---------|-------------|----------|----------|----------|
| **All at once** | 있음 (수 분) | 없음 | 없음 | 재배포 (느림) | 개발/저비용 |
| **Rolling** | 없음 | 없음 | 없음 | 재배포 | 일반 production |
| **Rolling with additional batch** | 없음 | 일부 추가 | 약간 ↑ | 재배포 | 용량 유지 필요 |
| **Immutable** | 없음 | 새 ASG 통째 | 2배 (일시) | 빠름 (ASG 삭제만) | 안전한 production |
| **Traffic Splitting** (Canary) | 없음 | 새 ASG | 2배 (일시) | 자동 (CloudWatch alarm) | 점진적 검증 |
| **Blue/Green** (수동) | 없음 | 새 환경 | 2배 | 즉시 (URL swap) | 완전 분리 |

> 💡 **시나리오 빠른 매핑**:
> - "비용 최소 + 단순" → All at once
> - "일반 production" → Rolling
> - "용량 절대 안 떨어져야" → Rolling with additional batch
> - "production + 즉시 롤백" → Immutable
> - "10%만 먼저, 자동 검증" → Traffic Splitting
> - "완전히 분리된 두 환경 + 한 번에 swap" → Blue/Green

### Immutable의 동작 흐름

```
초기:    [기존 ASG]
         [EC2 v1] [EC2 v1] [EC2 v1]   ← traffic 100%

단계 1:  [기존 ASG]              [새 임시 ASG]
         [EC2 v1] [EC2 v1] [EC2 v1]   [EC2 v2] (1개)  ← Health check 통과 대기

단계 2:                          [새 임시 ASG로 확장]
         [EC2 v1]…                    [EC2 v2] [EC2 v2] [EC2 v2]

단계 3:                          [임시 → 영구 ASG로 swap]
                                      [EC2 v2] [EC2 v2] [EC2 v2]   ← traffic 100%

단계 4:  기존 ASG 종료
                                      [EC2 v2] [EC2 v2] [EC2 v2]
```

> 🔍 **더 깊이**: Immutable의 핵심은 "단계 1에서 v2 인스턴스 1개를 먼저 띄워 health check를 통과해야 다음 단계로 진행"이라는 안전 게이트다. 만약 v2가 시작 자체가 실패하면 새 ASG가 즉시 삭제되고 기존 ASG는 그대로 — 즉 production에 영향 없음. Rolling과 결정적 차이가 여기 있다. Rolling은 기존 인스턴스를 먼저 죽이고 새 버전을 그 자리에 띄우기 때문에, 새 버전이 실패하면 그 슬롯의 용량이 사라진다.

### Traffic Splitting (Canary) 동작

```
초기:    [ASG v1: 3대]                     트래픽 100%
         (가중치 라우팅: v1 = 100%)

단계 1:  [ASG v1: 3대] [ASG v2: 3대]      트래픽 v1 = 90%, v2 = 10%
         (지정 시간 동안 메트릭 모니터링)

성공:    [ASG v1: 0대 → 종료]
         [ASG v2: 3대]                     트래픽 100%

실패:    [ASG v2: 0대 → 종료]              자동 롤백
         [ASG v1: 3대]                     트래픽 100%
```

> ⚠️ **함정**: Traffic Splitting은 Application Load Balancer의 **weighted target group** 기능을 활용한다. 이 기능이 없는 Classic Load Balancer로 구성된 환경에서는 동작하지 않는다. 또 Network Load Balancer로 구성된 환경도 불가. 시험에서 "Beanstalk + Traffic Splitting" 시나리오가 나오면 ALB 전제가 깔려 있어야 한다.

## .ebextensions vs .platform: 추상화 균열을 메우는 두 가지 방식

Beanstalk 환경 안의 EC2를 커스터마이징하려면 두 가지 방식이 있다. 시기에 따라 권장 방식이 바뀌었다.

### .ebextensions (전통적, Amazon Linux 1 기반)

```yaml
# .ebextensions/01_packages.config
packages:
  yum:
    git: []
    jq: []
    htop: []

files:
  "/etc/nginx/conf.d/custom.conf":
    mode: "000644"
    owner: root
    group: root
    content: |
      client_max_body_size 50M;

commands:
  01_npm_install:
    command: "npm install -g pm2"

container_commands:
  01_migrate:
    command: "python manage.py migrate"
    leader_only: true   # ASG 중 한 대에서만 실행 (DB 마이그레이션 등)

option_settings:
  aws:elasticbeanstalk:application:environment:
    DJANGO_SETTINGS: production
  aws:autoscaling:asg:
    MinSize: '2'
    MaxSize: '10'
  aws:elasticbeanstalk:environment:proxy:
    ProxyServer: nginx
```

> 🔍 **더 깊이**: `.ebextensions` 파일은 **알파벳 순서**로 실행된다. 그래서 보통 `01_xxx.config`, `02_xxx.config`처럼 prefix로 순서를 강제한다. `commands`는 application 코드 압축 풀기 **전**에, `container_commands`는 압축 풀기 **후**에 실행된다는 차이가 있다. DB 마이그레이션처럼 application 코드가 풀려 있어야 가능한 작업은 container_commands에 두는 게 정답.

> ⚠️ **함정**: `leader_only: true`는 Auto Scaling Group의 인스턴스 중 정확히 한 대에서만 실행되도록 보장한다. DB 마이그레이션을 모든 인스턴스에서 동시에 실행하면 race condition이 나므로 반드시 leader_only를 써야 한다. 단, 이 옵션은 **초기 배포 시점에만 leader가 결정**되고 그 후 새로 추가되는 인스턴스(스케일 아웃)에서는 동작하지 않는다.

### .platform (Amazon Linux 2/2023, 권장)

```
my-app/
  .platform/
    nginx/
      conf.d/
        custom.conf           # nginx 설정 추가 (덮어쓰지 않고 추가)
    hooks/
      prebuild/
        01_install_pkg.sh     # 코드 다운로드 후, 빌드 전
      predeploy/
        01_run_migration.sh   # 빌드 후, 배포 전
      postdeploy/
        01_warm_cache.sh      # 배포 후
```

> 💡 **관련 이론**: Amazon Linux 2 출시(2017) 이후 AWS는 `.ebextensions`의 일부 기능을 폐기하고 `.platform/` 디렉토리 기반으로 재설계했다. 이유는 ① 더 명확한 hook 시점 분리 ② 표준 shell script로 작성 가능 ③ nginx 설정을 통째로 덮어쓰지 않고 일부만 추가 가능. .ebextensions는 여전히 동작하지만 신규 프로젝트는 .platform이 권장. AL2 환경에서는 둘 다 같이 쓸 수도 있다.

## RDS 함정: 환경 안에 두면 같이 죽는다

Beanstalk 콘솔에서 "환경 만들 때 RDS도 같이 만들기" 옵션이 있다. 편리해 보이지만 production에서는 거의 항상 안티패턴이다.

```
[Beanstalk Environment]
  ├── EC2 (web)
  ├── ALB
  ├── ASG
  └── RDS    ← 환경 삭제 시 같이 삭제!
```

이유는 Beanstalk가 RDS를 환경의 CloudFormation 스택에 포함시키기 때문이다. `eb terminate` 또는 콘솔에서 환경 삭제 시 RDS도 함께 삭제된다. 데이터가 날아간다.

> ⚠️ **함정**: 시험에서 "Beanstalk 환경을 삭제했더니 production 데이터가 사라졌다"는 시나리오의 단골 답이 이것이다. 올바른 패턴은 **RDS를 Beanstalk 외부에 별도로 생성**하고, 환경 변수(DB endpoint, credentials)로만 연결하는 것. 그러면 환경을 몇 번 재생성해도 DB는 안전하다.

```yaml
# .ebextensions에서 외부 RDS 연결
option_settings:
  aws:elasticbeanstalk:application:environment:
    RDS_HOSTNAME: my-prod-db.cxxxx.ap-northeast-2.rds.amazonaws.com
    RDS_PORT: '5432'
    RDS_DB_NAME: myapp
    # 비밀번호는 Secrets Manager 참조
```

> 📚 **사례**: AWS re:Invent의 한 customer talk에서 한 SaaS 회사는 Beanstalk 환경을 staging/prod 분리하면서 staging 환경의 RDS를 같이 만든 적이 있었다. 어느 날 staging 환경을 재생성하는 과정에서 RDS가 삭제됐고, 다행히 자동 백업이 있어 복구는 됐지만 2시간 다운타임이 발생했다. 이후 모든 RDS는 Beanstalk 외부에 두는 정책으로 전환.

## CLI 기반 운영: eb 명령어

```bash
# 프로젝트 초기화
eb init --platform "Python 3.11 running on 64bit Amazon Linux 2023" --region ap-northeast-2

# 환경 생성
eb create production-env --instance-type t3.medium --elb-type application

# 새 버전 배포 (현재 디렉토리의 코드를 zip으로 묶어 업로드)
eb deploy

# 환경 변수 설정
eb setenv DB_HOST=mydb.com LOG_LEVEL=INFO

# 로그 보기 (CloudWatch에서 마지막 100줄)
eb logs --all

# SSH 접속
eb ssh

# Blue/Green을 위한 URL swap
eb swap production-env --destination_name staging-env

# 환경 삭제 (RDS 등 모든 리소스 함께)
eb terminate production-env
```

## 다른 PaaS와의 비교

| 차원 | Beanstalk | Heroku | Google App Engine | Azure App Service |
|------|-----------|--------|---------------------|---------------------|
| 호스팅 모델 | 사용자 AWS 계정의 EC2 | Heroku 멀티테넌트 | GCP 멀티테넌트 (Standard) 또는 GCE (Flexible) | Azure 멀티테넌트 |
| 가격 모델 | EC2/ALB/RDS 표준 가격 | Dyno 시간당 | Instance 시간당 | Plan 시간당 |
| 인프라 접근성 | 풀 액세스 (EC2 SSH 가능) | 제한적 | 제한적 (Standard), 풀 (Flexible) | 제한적 |
| Auto-scaling | ASG 통합 | Heroku autoscaler | 자동 | 자동 |
| 데이터베이스 | RDS 외부 권장 | Heroku Postgres add-on | Cloud SQL 분리 | Azure SQL 분리 |
| Custom runtime | 가능 (.platform) | Buildpack | 가능 (Flexible) | 가능 (Custom Container) |

> 💡 **관련 이론**: Heroku와 Beanstalk의 가장 큰 차이는 **인프라 접근성**이다. Heroku는 "어떻게 인스턴스가 동작하는지는 보지 마라"는 완전 추상화고, Beanstalk는 "원하면 SSH로 들어가서 nginx 설정 직접 만져라"는 escape hatch가 있다. 이 차이가 production에서 디버깅할 때 결정적이 된다 — Heroku에서 "왜 OOM이 나는지" 알기 어렵지만 Beanstalk에서는 `eb ssh`로 들어가 `top`을 칠 수 있다.

## Beanstalk를 언제 선택해야 하는가

| 시나리오 | 선택 |
|----------|------|
| 빠른 PoC, AWS 깊이 학습 시간 없음 | **Beanstalk** |
| 표준 웹 앱 (Django, Express, Rails) + 풀 인프라 액세스 | **Beanstalk** |
| Docker 컨테이너 + 마이크로서비스 | **ECS Fargate / EKS** |
| 이벤트 기반 짧은 실행, idle 시 비용 0 | **Lambda** |
| 컨테이너지만 Kubernetes 없이 자동 스케일 + 자동 HTTPS | **App Runner** |
| HPC, GPU, 특수 인스턴스 | **EC2 직접** |

> 🔍 **더 깊이**: 2021년 출시된 AWS App Runner는 Beanstalk의 후계자 성격이 있다. "컨테이너 이미지나 소스 코드를 주면 자동으로 build + deploy + autoscale + HTTPS까지"가 App Runner의 약속인데, Beanstalk보다 더 단순하고 컨테이너 친화적이다. AWS 내부에서는 Beanstalk를 "deprecated는 아니지만 적극 권장도 아닌" 단계로 두고, 신규 워크로드는 App Runner나 ECS Fargate로 유도하는 분위기.

## 정리하며

Beanstalk는 "AWS의 모든 인프라 복잡성을 한 명령어로 추상화"하려는 가장 야심 찬 시도였다. 그 약속은 대체로 잘 지켜졌지만, 추상화의 균열을 메우는 .ebextensions/.platform이 결국 필요했고, RDS 같은 stateful 리소스의 라이프사이클 관리는 여전히 사용자 책임이다.

DVA-C02 시험 대비로는 6가지 배포 전략의 trade-off, Web vs Worker 환경의 차이, 그리고 "환경 안에 RDS 두면 안 된다"는 단 한 가지 함정만 정확히 외워두면 출제 범위의 80%를 잡는다. 다음 글에서는 이번 주의 마지막 — **CloudFormation의 내부 동작과 SAM/CDK** — 을 본다.

---

## 📝 연습 문제

**문제 1.** Production 환경에서 다운타임 없이 가장 빠르게 롤백 가능한 Beanstalk 배포 전략은?

A) All at once
B) Rolling
C) Immutable
D) Blue/Green (URL swap)

**정답: D**

해설: Blue/Green은 두 개의 독립 환경을 운영하고 URL(CNAME) swap으로 트래픽을 전환한다. 롤백은 단순히 swap을 되돌리는 것이라 **수 초 안에 완료**된다. C) Immutable도 안전하지만 롤백은 새 ASG를 삭제하고 기존 ASG를 다시 활성화하는 과정이 필요해 조금 더 걸린다. A) All at once는 다운타임 있음. B) Rolling은 롤백 시 다시 배포해야 함. 시험에서 "즉시 롤백 + 최대 안전성"이 보이면 Blue/Green이 가장 일반적 답이지만, 일부 시나리오에서는 Immutable이 정답일 수 있다.

---

**문제 2.** Beanstalk 환경에서 DB 마이그레이션을 **인스턴스 중 한 대에서만 실행**하려 한다. .ebextensions 파일에서 어떤 옵션을 써야 하는가?

A) `commands:` + `singleton: true`
B) `container_commands:` + `leader_only: true`
C) `option_settings:` + `aws:autoscaling:asg:MinSize:1`
D) `packages:` + `once: true`

**정답: B**

해설: `container_commands`는 application 코드가 압축 해제된 후 실행되는 명령들이고, `leader_only: true`를 추가하면 ASG의 여러 인스턴스 중 leader 1대에서만 실행. DB 마이그레이션은 ① application 코드(`manage.py` 등)가 있어야 동작 ② 모든 인스턴스에서 동시에 돌리면 race condition. 따라서 `container_commands` + `leader_only`가 정답. A) `singleton`은 존재하지 않는 옵션. C) MinSize는 인스턴스 수 제한이지 실행 통제 아님. D) `packages`는 패키지 설치 섹션. 시험에서 "DB 마이그레이션 한 번만"이 보이면 leader_only가 단골 답.

---

**문제 3.** Beanstalk Web Server Environment와 Worker Environment의 차이로 옳은 것은?

A) Worker는 ALB가 없고 SQS Daemon이 메시지를 HTTP로 application에 전달한다
B) Web Server는 SQS 기반, Worker는 HTTP 기반이다
C) Worker는 Auto Scaling Group이 없다
D) Web Server에는 RDS 통합이 필수다

**정답: A**

해설: Worker 환경의 핵심은 EC2에 설치된 **SQS Daemon**이 SQS 큐를 polling해 메시지를 application의 HTTP endpoint(기본 `/`)로 POST 변환해 보낸다는 점. application은 SQS SDK를 직접 호출할 필요 없이 HTTP 서버처럼 짜면 된다. B) 정반대 — Web Server가 HTTP, Worker가 SQS 기반. C) Worker도 ASG가 있다(트래픽 대신 큐 길이 기반 스케일링). D) Web Server에도 RDS는 선택사항이고 외부에 두는 게 권장. 시험에서 Worker 환경 = SQS + Daemon 패턴이 핵심.

---

**문제 4.** Beanstalk 환경을 생성하면서 콘솔에서 "Create new RDS DB"를 체크해 같이 만들었다. 이 환경을 `eb terminate`로 삭제하면 어떤 일이 일어나는가?

A) RDS는 별도로 유지된다
B) RDS도 함께 삭제되어 데이터가 영구 손실될 수 있다
C) RDS는 자동으로 스냅샷 후 삭제된다
D) Beanstalk가 자동으로 삭제 차단 경고를 띄우고 진행하지 않는다

**정답: B**

해설: Beanstalk 환경 내부의 RDS는 환경의 CloudFormation 스택에 포함되므로 환경 삭제 시 함께 삭제된다. 자동 백업이 활성화돼 있다면 보존 기간 동안 스냅샷에서 복구는 가능하지만, 백업 비활성화 시 데이터 영구 손실. 따라서 production RDS는 **반드시 Beanstalk 외부**에 만들고 환경 변수로 endpoint만 주입하는 게 표준 패턴. C) 자동 스냅샷 후 삭제 옵션은 별도 명시 필요. D) 콘솔에서 경고는 뜨지만 막지는 않음. 시험에서 단골 함정.

---

**문제 5.** Amazon Linux 2 기반 Beanstalk 환경에서 nginx의 `client_max_body_size`를 50MB로 늘리려 한다. 권장 방식은?

A) `.ebextensions/nginx.config`로 nginx.conf 전체 덮어쓰기
B) `.platform/nginx/conf.d/custom.conf`에 추가 설정만 작성
C) `eb ssh`로 들어가서 직접 nginx.conf 수정
D) Beanstalk 콘솔에서 nginx 설정 옵션 변경

**정답: B**

해설: Amazon Linux 2/2023부터는 `.platform/` 디렉토리 기반이 권장. nginx 설정 변경은 `.platform/nginx/conf.d/`에 새 파일을 두면 기본 nginx.conf의 `include /etc/nginx/conf.d/*.conf;`에 의해 자동 포함된다. 전체 덮어쓰기가 아니라 추가 방식이라 AWS 기본 nginx 설정을 깨지 않는다. A) 덮어쓰기는 AWS 기본 설정 손실 위험. C) SSH 수정은 인스턴스 재생성 시 사라짐(비영구). D) 콘솔에 nginx 옵션 따로 없음. 시험에서 AL2 + 커스텀 nginx 보이면 .platform이 답.

---

**문제 6.** Beanstalk Traffic Splitting 배포 전략을 사용하려고 한다. 어떤 사전 조건이 필요한가?

A) Worker Environment여야 한다
B) Application Load Balancer를 사용하는 Web Server Environment여야 한다
C) Classic Load Balancer를 사용해야 한다
D) RDS가 환경에 포함돼 있어야 한다

**정답: B**

해설: Traffic Splitting은 ALB의 weighted target group 기능을 활용하므로 ALB 기반 Web Server Environment에서만 동작. CLB나 NLB로는 불가. A) Worker에는 ALB가 없으므로 불가. C) Classic LB는 가중치 라우팅이 없음. D) RDS와 무관. 시험에서 "Traffic Splitting + Beanstalk"가 보이면 ALB 전제가 있어야 한다는 점이 함정으로 자주 등장.

---

**문제 7.** Beanstalk Immutable 배포 중 새 ASG의 첫 인스턴스가 헬스 체크 통과에 실패하면?

A) 기존 production 인스턴스에 영향 없이 새 ASG가 자동 삭제되고 배포 실패로 마킹된다
B) 기존 ASG도 함께 종료된다
C) 자동으로 Rolling 배포로 전환된다
D) Beanstalk 환경이 통째로 삭제된다

**정답: A**

해설: Immutable 배포의 핵심 안전성이 여기 있다 — 새 ASG는 기존 production과 완전히 분리된 채로 띄워지고, 첫 인스턴스가 헬스 체크 실패 시 그 임시 ASG만 자동 삭제. 기존 production은 그대로 트래픽을 받는다. 이게 Rolling과 결정적 차이로, Rolling은 기존 인스턴스를 먼저 죽이므로 새 버전 실패 시 production 용량이 줄어든다. B/C/D는 모두 틀린 동작. 시험에서 "Immutable의 안전성"이 키워드면 A가 답.
