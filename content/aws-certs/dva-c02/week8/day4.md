# Day 39 - Elastic Beanstalk: 플랫폼 서비스

📅 날짜: 2026년 7월 8일 (수요일)  
🎯 주제: AWS Elastic Beanstalk  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Elastic Beanstalk의 구조와 배포 방식을 이해한다
- .ebextensions로 환경을 커스터마이징한다
- Beanstalk 배포 전략을 선택한다

---

## 📖 이론 내용

### 1. AWS Elastic Beanstalk란?

인프라 세부 사항 없이 애플리케이션을 쉽게 배포하는 PaaS 서비스입니다.

**지원 플랫폼:**
- Node.js, Python, Java, Ruby, Go, .NET, PHP
- Docker (단일 컨테이너, 멀티 컨테이너)
- 커스텀 플랫폼

**Beanstalk가 자동으로 관리:**
- EC2 인스턴스 프로비저닝
- 로드밸런서 구성
- Auto Scaling Group
- 모니터링 (CloudWatch)
- 배포

### 2. Beanstalk 구조

```
[Beanstalk 애플리케이션]
        |
        +-- [환경: production]
        |       |
        |       +-- [웹 서버 환경]
        |       |   EC2 + ALB + ASG
        |       |
        |       +-- [워커 환경]
        |           EC2 + SQS (백그라운드 작업)
        |
        +-- [환경: staging]
                |
                +-- [웹 서버 환경]
```

### 3. 배포 전략

**All at once (가장 빠름, 중단 발생):**
```
v1 → v2 (모든 인스턴스 동시)
다운타임 있음, 개발 환경에 적합
```

**Rolling (점진적, 중단 최소화):**
```
[v1][v1][v1][v1]
[v2][v1][v1][v1]  ← 일부씩 배포
[v2][v2][v1][v1]
[v2][v2][v2][v2]
용량 감소 발생
```

**Rolling with Additional Batch (용량 유지):**
```
[v1][v1][v1][v1]
[v2][v2][v1][v1][v1]  ← 추가 인스턴스 생성
[v2][v2][v2][v1]      ← 순차 배포
[v2][v2][v2][v2]
```

**Immutable (가장 안전):**
```
[v1][v1] + [v2][v2] (새 ASG 생성)
검증 후 전환, 롤백 용이
```

**Blue/Green (제로 다운타임):**
```
새 환경 생성 → URL 스왑
```

### 4. .ebextensions 커스터마이징

```yaml
# .ebextensions/config.yml
option_settings:
  aws:elasticbeanstalk:application:environment:
    DB_URL: "jdbc:postgresql://..."
    LOG_LEVEL: "INFO"

  aws:autoscaling:asg:
    MinSize: '2'
    MaxSize: '10'

  aws:elasticbeanstalk:environment:proxy:
    ProxyServer: nginx

commands:
  01_install_deps:
    command: "pip install -r requirements.txt"

packages:
  yum:
    git: []
    jq: []
```

### 5. Beanstalk와 CodePipeline 통합

```
[CodeCommit] → [CodeBuild] → [Beanstalk 배포]
     |                              |
     v                              v
  소스 관리                  환경 자동 업데이트
```

---

## 🧠 알아두면 좋은 심화 이론

### Beanstalk 배포 전략 6종 (시험 매우 빈출 표)

| 전략 | 다운타임 | 새 인스턴스 | 비용 | 롤백 |
|------|---------|-------------|------|------|
| **All at once** | ✅ | ❌ | 동일 | 재배포만 |
| **Rolling** | ❌ | ❌ | 동일 | 재배포 |
| **Rolling with additional batch** | ❌ | ✅ 일부 추가 | 약간 ↑ | 재배포 |
| **Immutable** | ❌ | ✅ 새 ASG | **2x** | **빠름** |
| **Blue/Green** | ❌ | ✅ 새 환경 | **2x** | **즉시** (URL swap) |
| **Traffic Splitting** (Canary) | ❌ | ✅ 새 ASG | 일시 2x | **자동** |

> 💡 **시나리오 선택**:
> - "비용 절감 + 빠름" → All at once (개발 환경)
> - "다운타임 X + 가성비" → Rolling
> - "프로덕션 + 즉시 롤백" → **Immutable** 또는 **Blue/Green**
> - "점진적 위험 분산" → Traffic Splitting

### 환경 유형 (시험 출제)

| 유형 | 구성 |
|------|------|
| **Web Server Environment** | ALB + ASG + EC2 (요청 처리) |
| **Worker Environment** | SQS + EC2 (백그라운드 처리, SQS Daemon이 메시지 폴링) |

### `cron.yaml` (Worker 환경 - 정기 작업)

```yaml
version: 1
cron:
  - name: "daily-report"
    url: "/reports/daily"
    schedule: "0 0 * * *"
```

> 💡 Worker 환경의 SQS Daemon이 자동으로 HTTP POST → 컨테이너에 전달.

### .ebextensions 구조

```
my-app/
  application.py
  .ebextensions/
    01_packages.config       # 알파벳 순으로 실행
    02_files.config
    03_commands.config
    04_options.config
  .platform/                  # AL2/AL2023 신규 방식
    nginx/
      conf.d/
        custom.conf
    hooks/
      prebuild/
      postdeploy/
```

> ⚠️ **함정**: Amazon Linux 2/2023부터 `.ebextensions` → `.platform/` 권장. nginx 설정·hook 스크립트.

### Beanstalk Saved Configurations

- 환경 설정을 템플릿으로 저장
- 다른 환경 생성 시 재사용
- S3에 저장됨

### Beanstalk와 Database (시험에 자주 출제)

> ⚠️ **함정**: Beanstalk 환경 안에 RDS를 만들면 **환경 삭제 시 DB도 같이 삭제!** 프로덕션 DB는 Beanstalk 외부에 별도 생성 권장.

### CLI 사용

```bash
eb init       # Beanstalk 앱 초기화
eb create     # 새 환경 생성
eb deploy     # 새 버전 배포
eb logs       # 로그 보기
eb ssh        # 인스턴스 SSH
eb terminate  # 환경 삭제
eb config     # 환경 설정 편집
eb swap       # URL 스왑 (Blue/Green)
```

### Beanstalk vs ECS vs Lambda 선택

| 시나리오 | 선택 |
|----------|------|
| 빠른 PoC, AWS 깊이 몰라도 됨 | **Beanstalk** |
| Docker 컨테이너 마이크로서비스 | **ECS / Fargate** |
| 이벤트 기반·짧은 실행 | **Lambda** |
| HPC·특수 인스턴스 | **EC2 직접** |
| 쿠버네티스 표준 | **EKS** |

### 관련 서비스 Cross-Reference

- **Beanstalk Worker 환경 ↔ SQS** → [Week 11 Day 1]
- **Beanstalk 환경 변수 ↔ Parameter Store/Secrets** → [Week 9 Day 2]
- **Beanstalk 배포 ↔ CodePipeline** → [Day 3]
- **Beanstalk ↔ CloudFormation** → 내부적으로 CFN 사용

---

## 아키텍처 다이어그램

```
Elastic Beanstalk 웹 환경
================================

[DNS: myapp.elasticbeanstalk.com]
                |
                v
[Application Load Balancer]
       |          |
       v          v
  [EC2: v2]  [EC2: v2]   (Auto Scaling Group)
       |
       v
[RDS] (별도 생성 권장)

워커 환경
================================

[SQS 큐]
    |
    | 메시지 처리
    v
[EC2 워커 인스턴스]
    |
    v
[백그라운드 처리 완료]
```

---

## ⭐ 핵심 포인트

1. ⭐ **Beanstalk**: 인프라 자동 관리, 코드만 배포
2. ⭐ **Immutable 배포**: 가장 안전, 새 ASG 생성 후 전환
3. ⭐ **Rolling**: 기존 인스턴스 순차 업데이트, 용량 감소
4. ⭐ **.ebextensions**: 환경 변수, AWS 리소스, 패키지 설치 커스터마이징
5. ⭐ **워커 환경**: SQS 기반 백그라운드 작업 처리

---

## 📝 연습 문제

**문제 1.** 중단 없이 가장 안전하게 배포하는 Beanstalk 전략은?

A) All at once  
B) Rolling  
C) Immutable  
D) Blue/Green  

**정답: C** - Immutable 배포는 새 ASG에 새 버전을 배포하고 검증 후 전환하므로 가장 안전합니다. Blue/Green도 안전하지만 Immutable이 더 세밀한 제어가 가능합니다.

---

**문제 2.** .ebextensions 파일의 위치는?

A) 프로젝트 루트  
B) 애플리케이션 소스 번들 내 .ebextensions/ 폴더  
C) S3 버킷  
D) Beanstalk 콘솔에서 직접 편집  

**정답: B** - .ebextensions 폴더는 애플리케이션 소스 번들 내에 위치해야 합니다.

---

**문제 3.** Beanstalk 워커 환경의 역할은?

A) 웹 요청 처리  
B) SQS 기반 백그라운드 작업 처리  
C) 데이터베이스 관리  
D) 로드밸런싱  

**정답: B** - 워커 환경은 SQS 큐에서 메시지를 꺼내 백그라운드 작업을 처리합니다.

---

**문제 4.** Rolling 배포의 단점은?

A) 배포 속도가 너무 느림  
B) 배포 중 용량이 감소할 수 있음  
C) 롤백 불가능  
D) 비용이 너무 높음  

**정답: B** - Rolling 배포는 일부 인스턴스를 업데이트하는 동안 전체 용량이 감소할 수 있습니다.

---

**문제 5.** Beanstalk에서 환경 변수를 설정하는 방법은?

A) EC2 User Data  
B) .ebextensions 파일 또는 콘솔에서 직접 설정  
C) S3에 설정 파일 저장  
D) Lambda 함수로 주입  

**정답: B** - .ebextensions 또는 Beanstalk 콘솔에서 환경 변수를 설정할 수 있습니다.

---

## 📌 오늘의 요약

1. Elastic Beanstalk: 코드만 업로드하면 인프라 자동 구성/관리
2. 배포 전략: AllAtOnce(빠름) → Rolling → Immutable(안전) → Blue/Green
3. .ebextensions: YAML로 환경 변수, 패키지, AWS 리소스 커스터마이징
4. 웹 환경: ALB + EC2 + ASG, 워커 환경: SQS + EC2
5. CodePipeline과 통합하여 완전 자동화된 CI/CD 구현 가능
