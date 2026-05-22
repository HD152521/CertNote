# Day 1 - Elastic Beanstalk (배포 정책 5가지)

📅 날짜: Week 7 (Day 1)
🎯 주제: PaaS Beanstalk과 5가지 배포 정책의 trade-off
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Elastic Beanstalk의 환경 구조와 동작을 이해한다
- 5가지 배포 정책의 시간·비용·다운타임 trade-off를 안다
- Blue-Green via URL Swap 패턴과 운영 시나리오를 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **PaaS (Platform as a Service)**: 인프라+런타임을 묶어 제공. 코드만 올리면 실행
- **Zero-downtime deployment**: 무중단 배포. 부분 교체 또는 트래픽 전환
- **Canary vs Blue-Green**: 일부 사용자만 새 버전(Canary) vs 두 환경 병행 후 전환(Blue-Green)
- **Rolling update**: 점진적 교체. 비용 ↓ 시간 ↑
- **Immutable infrastructure**: 변경 대신 새로 만들고 교체

---

## 📖 이론 내용

### 1. Elastic Beanstalk 개요

#### 개념
- AWS 관리형 PaaS — 코드만 올리면 EC2 + ALB + ASG + RDS 자동 구성
- 지원 플랫폼: Java, .NET, Node.js, Python, PHP, Ruby, Go, Docker
- **EC2/ALB/ASG/RDS는 고객 계정에 직접 생성** (SaaS 아님 — IaaS 위의 자동화)

#### 구성 요소

| 요소 | 의미 |
|------|------|
| **Application** | 최상위 컨테이너 |
| **Application Version** | 배포 가능한 코드 패키지 (S3에 저장) |
| **Environment** | 실행 인프라 (Web tier 또는 Worker tier) |
| **Environment Configuration** | EC2 타입, 스케일링, 로드밸런서 등 |
| **Saved Configuration** | 환경 설정 템플릿 |

#### Environment Tier
- **Web Server Tier**: ALB + EC2 (HTTP 요청 처리)
- **Worker Tier**: SQS Queue + EC2 (비동기 작업)

### 2. 5가지 배포 정책 (⭐⭐⭐ 시험 핵심)

| 정책 | 동작 | 다운타임 | 추가 비용 | 롤백 |
|------|------|----------|-----------|------|
| **All at once** | 전체 동시 교체 | 있음 | X | 어려움(재배포) |
| **Rolling** | 배치 단위 교체 | 없음 (용량↓) | X | 어려움 |
| **Rolling with additional batch** | 배치 단위 + 임시 인스턴스 | 없음 (용량 유지) | 일부 | 어려움 |
| **Immutable** | 새 ASG 만들고 교체 | 없음 | 100%(임시) | 빠름 |
| **Blue-Green (URL swap)** | 두 환경 병행 후 URL 전환 | 없음 (DNS TTL) | 100%(병행 동안) | 즉시 |

#### 시각화

**All at once**
```
초기: [v1][v1][v1][v1]   ← 4대
중간: [..][..][..][..]   ← 다운타임!
최종: [v2][v2][v2][v2]
```

**Rolling (배치 50%)**
```
초기: [v1][v1][v1][v1]
중간: [v2][v2][v1][v1]   ← 50% 용량 감소
최종: [v2][v2][v2][v2]
```

**Rolling with additional batch (배치 50%)**
```
초기: [v1][v1][v1][v1]
중간: [v2][v2][v1][v1][v2][v2]  ← 임시 +2대
최종: [v2][v2][v2][v2]
```

**Immutable**
```
초기 ASG: [v1][v1][v1][v1]
+ 새 ASG: [v2][v2][v2][v2]      ← 신규 ASG 검증
교체 후 : [v2][v2][v2][v2]
구 ASG 종료
```

**Blue-Green (URL swap)**
```
Blue 환경:  [v1][v1][v1][v1]   ← user → DNS → Blue
Green 환경: [v2][v2][v2][v2]   ← 검증

DNS Swap:
user → DNS → Green
```

### 3. 배포 정책 선택 기준 (시험 시나리오)

| 시나리오 | 추천 정책 |
|----------|-----------|
| **개발 환경** | All at once (빠르고 비용 X) |
| **운영, 비용 절감** | Rolling (다운타임 X, 임시 용량 감소 허용) |
| **운영, 용량 유지** | Rolling with additional batch |
| **운영, 안전 최우선** | Immutable (롤백 빠름) |
| **운영, 즉시 롤백 + 무중단** | Blue-Green (URL Swap) |

### 4. Beanstalk Worker Tier

#### 동작 메커니즘
- SQS Queue에서 메시지 수신
- 환경 내 SQS Daemon이 HTTP POST로 로컬 앱에 전달
- 앱 처리 후 200 응답 → 메시지 삭제

#### 사용 사례
- 이미지 처리, 비디오 인코딩
- 백그라운드 작업
- 주기적 작업 (cron.yaml로 정의)

### 5. 설정 관리

#### .ebextensions
- 프로젝트 루트의 `.ebextensions/` 디렉토리에 `*.config` 파일
- 환경 변수, 패키지 설치, 사용자 데이터 등

```yaml
# .ebextensions/01-install-packages.config
packages:
  yum:
    git: []
    htop: []

option_settings:
  aws:elasticbeanstalk:application:environment:
    NODE_ENV: production
    LOG_LEVEL: info

container_commands:
  01_migrate_db:
    command: "npm run migrate"
    leader_only: true
```

#### Saved Configuration
- 환경 설정을 템플릿으로 저장 → 새 환경 만들 때 재사용

### 6. RDS 관리 분리 (운영 모범 사례)

#### Beanstalk 내장 RDS의 한계
- 환경 종료 시 RDS도 삭제 (재해 위험)
- 환경 복제 시 RDS 분리 어려움

#### 권장 패턴
- RDS는 별도 Stack으로 만들어 Beanstalk 외부
- Beanstalk 환경 변수로 DB endpoint 주입
- 환경 라이프사이클과 데이터 라이프사이클 분리

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Environment Health** | OK/Info/Warning/Degraded/Severe/No Data | 운영 점검 |
| **Enhanced Health Reporting** | 더 자세한 헬스체크 | 활성화 권장 |
| **Application Load Balancer** | 기본. Classic LB는 레거시 | ALB 사용 |
| **EFS 마운트** | 다중 인스턴스 공유 파일 | 미디어 등 |
| **Custom Platform** | 자사 AMI를 Beanstalk 플랫폼으로 | 특수 OS |
| **Linux Platform v3 vs v2** | v3는 Amazon Linux 2 기반, 명령어 다름 | 마이그레이션 주의 |

> ⚠️ **함정 1**: Rolling은 일시적으로 용량 감소. 트래픽 spike와 겹치면 위험.
>
> ⚠️ **함정 2**: Immutable은 새 ASG 만들어 검증 → 안전하지만 일시적으로 비용 2배.
>
> 💡 **암기 팁**: 속도 = All at once, 비용 효율 = Rolling, 안전 = Immutable, 즉시 롤백 = Blue-Green.

### 관련 서비스 Cross-Reference

- **Beanstalk → Week 7 Day 2** (CodeDeploy와 비교)
- **Beanstalk → Week 8** (ALB Target Group)
- **Beanstalk → Week 10** (Multi-AZ 자동)
- **Beanstalk → Week 11** (RI/Savings Plans 적용 가능)

---

## 🏗️ 아키텍처 다이어그램

```
Beanstalk Web Tier 구조
==========================================================

   [사용자]
       │ DNS
       ▼
   ┌─────────────────┐
   │  Route 53       │
   │  myapp.com      │
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │   ALB           │ ← Beanstalk가 자동 생성
   └────────┬────────┘
            │
   ┌────────┼────────┐
   ▼        ▼        ▼
  [EC2]   [EC2]    [EC2]  ← Auto Scaling Group
   v1      v1       v1
   │        │        │
   └────────┼────────┘
            ▼
       [RDS - 권장: Beanstalk 외부]
```

```
배포 정책 시간선
==========================================================

  All at once       ████  → ▓▓▓▓        (다운타임 발생)
                    1분 (동시 교체)

  Rolling           ████  → █▓██  → ▓▓██ → ▓▓▓▓
                    배치 단위, 5~10분

  Immutable         ████ + ▒▒▒▒(신규 ASG 빌드/검증)
                    검증 후 trade → ▓▓▓▓
                    10~15분

  Blue-Green        Blue: ████     Green: ▒▒▒▒
                    DNS Swap → Blue: 정지, Green: ▓▓▓▓
                    15~30분 + DNS TTL
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **5가지 배포 정책의 trade-off 표 암기** — 시간/비용/다운타임/롤백
2. ⭐ **Rolling = 임시 용량 감소**, **Rolling with batch = 용량 유지**
3. ⭐ **Immutable = 새 ASG → 안전 + 빠른 롤백** (비용 일시 2배)
4. ⭐ **Blue-Green = URL Swap으로 즉시 전환·롤백** (DNS TTL 고려)
5. ⭐ **RDS는 Beanstalk 외부로 분리** — 환경 종료 시 데이터 손실 방지

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Application + Version 생성
aws elasticbeanstalk create-application \
  --application-name MyWebApp

aws s3 cp myapp-v1.zip s3://my-eb-source/

aws elasticbeanstalk create-application-version \
  --application-name MyWebApp \
  --version-label v1 \
  --source-bundle S3Bucket=my-eb-source,S3Key=myapp-v1.zip

# 2. Environment 생성 (Immutable 배포)
aws elasticbeanstalk create-environment \
  --application-name MyWebApp \
  --environment-name MyWebApp-prod \
  --version-label v1 \
  --solution-stack-name "64bit Amazon Linux 2 v5.8.0 running Node.js 18" \
  --option-settings \
    Namespace=aws:elasticbeanstalk:command,OptionName=DeploymentPolicy,Value=Immutable \
    Namespace=aws:autoscaling:asg,OptionName=MinSize,Value=4 \
    Namespace=aws:autoscaling:asg,OptionName=MaxSize,Value=10 \
    Namespace=aws:elasticbeanstalk:environment,OptionName=EnvironmentType,Value=LoadBalanced \
    Namespace=aws:elasticbeanstalk:application,OptionName=Application_Healthcheck_URL,Value=/health

# 3. 새 버전 배포
aws elasticbeanstalk create-application-version \
  --application-name MyWebApp \
  --version-label v2 \
  --source-bundle S3Bucket=my-eb-source,S3Key=myapp-v2.zip

aws elasticbeanstalk update-environment \
  --environment-name MyWebApp-prod \
  --version-label v2

# 4. Blue-Green via URL Swap
# Green 환경 생성
aws elasticbeanstalk create-environment \
  --application-name MyWebApp \
  --environment-name MyWebApp-prod-green \
  --version-label v2 \
  --solution-stack-name "64bit Amazon Linux 2 v5.8.0 running Node.js 18" \
  --tier Name=WebServer,Type=Standard

# 검증 후 URL Swap
aws elasticbeanstalk swap-environment-cnames \
  --source-environment-name MyWebApp-prod \
  --destination-environment-name MyWebApp-prod-green

# 구 환경 정리
aws elasticbeanstalk terminate-environment \
  --environment-name MyWebApp-prod

# 5. Worker Tier 환경 생성
aws elasticbeanstalk create-environment \
  --application-name MyWebApp \
  --environment-name MyWebApp-worker \
  --version-label v1 \
  --solution-stack-name "64bit Amazon Linux 2 v3.5.0 running Python 3.9" \
  --tier Name=Worker,Type=SQS/HTTP \
  --option-settings \
    Namespace=aws:elasticbeanstalk:sqsd,OptionName=WorkerQueueURL,Value=https://sqs.ap-northeast-2.amazonaws.com/123/MyQueue
```

---

## 📝 연습 문제

**문제 1.** 운영 환경에서 다운타임 없이, 용량 유지하며, 추가 비용을 최소화하려 한다. 어떤 배포 정책?

A) All at once
B) Rolling (다운타임 X but 일시적 용량 감소)
C) Rolling with additional batch (다운타임 X, 용량 유지, 임시 비용 일부)
D) Immutable

**정답: C**
해설: Rolling with additional batch는 배치 단위 교체 + 임시 인스턴스로 용량 유지. 추가 비용은 임시 배치만큼. Immutable은 전체 ASG 복제라 비용 2배.

---

**문제 2.** 운영자가 새 버전이 실패하면 즉시 100% 롤백하길 원한다. 어떤 정책?

A) All at once
B) Rolling
C) Immutable (빠른 롤백) 또는 Blue-Green (즉시 URL Swap)
D) Rolling with batch

**정답: C**
해설: Immutable은 구 ASG가 살아 있어 빠른 롤백 가능. Blue-Green은 DNS Swap만 되돌리면 즉시 롤백. 두 가지 모두 안전·즉시 롤백에 적합.

---

**문제 3.** Beanstalk 환경에서 RDS를 같이 만든 후 환경을 종료했더니 DB도 삭제됐다. 어떻게 방지해야 했나?

A) DeletionPolicy: Retain
B) RDS를 Beanstalk 외부 별도 Stack으로 분리하고 환경 변수로 endpoint 주입
C) RDS Multi-AZ
D) Backup

**정답: B**
해설: Beanstalk 내장 RDS는 환경 종료 시 함께 삭제. 데이터·환경 라이프사이클 분리가 운영 모범 사례. Beanstalk 외부 RDS Stack을 만들어 endpoint만 환경에 주입.

---

**문제 4.** Beanstalk Worker Tier의 메시지 처리 흐름은?

A) Lambda 호출
B) SQS Queue → SQS Daemon → 로컬 앱 HTTP POST → 200 응답 시 메시지 삭제
C) Kinesis Stream
D) SNS

**정답: B**
해설: Worker Tier는 SQS 기반. SQS Daemon이 메시지 수신 후 로컬 앱(보통 80포트)에 HTTP POST. 앱이 200 응답하면 메시지 자동 삭제, 4xx/5xx면 가시성 타임아웃 후 재시도.

---

**문제 5.** 운영자가 .ebextensions로 환경 변수와 패키지 설치를 자동화하려 한다. 파일 위치는?

A) 프로젝트 루트의 .ebextensions/*.config YAML/JSON
B) S3 별도 업로드
C) EC2 User Data
D) AMI에 포함

**정답: A**
해설: `.ebextensions/01-*.config` 같이 프로젝트 루트에 배치하면 배포 시 자동 적용. packages, option_settings, container_commands 등 정의.

---

## 📌 오늘의 요약

1. Beanstalk: AWS 관리형 PaaS. EC2/ALB/ASG/RDS를 자동 생성, 고객 계정에 직접
2. 5가지 배포 정책: All at once / Rolling / Rolling with batch / Immutable / Blue-Green
3. Immutable = 새 ASG 검증 후 교체 (안전 + 빠른 롤백, 임시 비용 2배)
4. Blue-Green via URL Swap = 즉시 트래픽 전환·롤백 (DNS TTL 고려)
5. RDS는 Beanstalk 외부로 분리 — 환경 종료 시 데이터 보호. 운영 모범 사례
