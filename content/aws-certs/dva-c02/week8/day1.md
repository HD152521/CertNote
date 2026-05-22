# Day 36 - CI/CD: CodeCommit, CodeBuild

📅 날짜: 2026년 7월 5일 (일요일)  
🎯 주제: AWS CI/CD 파이프라인 - 소스 및 빌드  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS CodeCommit의 특성과 보안을 이해한다
- CodeBuild의 빌드 프로세스와 buildspec.yml을 작성한다
- CI/CD 파이프라인의 전체 흐름을 파악한다

---

## 📖 이론 내용

### 1. AWS CodeCommit

AWS가 관리하는 Git 기반 소스 제어 서비스입니다.

**특징:**
- 완전 관리형 Git 저장소
- AWS 계정 내 프라이빗 저장소
- IAM 기반 접근 제어
- 전송 암호화 (HTTPS/SSH)
- 저장 암호화 (KMS)

**인증 방법:**
```bash
# SSH 인증
git remote add origin ssh://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/my-repo

# HTTPS (Git 자격 증명)
git remote add origin https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/my-repo

# HTTPS (Git 자격 증명 도우미)
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true
```

### 2. CodeCommit 알림 및 트리거

```json
{
  "규칙": "pull request 생성 시 Slack 알림",
  "이벤트": "pullRequestCreated",
  "대상": "SNS Topic → Lambda → Slack Webhook"
}
```

**트리거 vs 알림:**
- **트리거**: 코드 변경 시 Lambda 또는 SNS 직접 호출
- **알림**: CodeStar Notifications를 통해 더 세밀한 이벤트 필터링

### 3. AWS CodeBuild

소스 코드를 빌드, 테스트, 아티팩트 생성하는 완전 관리형 CI 서비스입니다.

**빌드 프로세스:**
```
소스 코드 (CodeCommit/S3/GitHub)
          |
          v
[CodeBuild 빌드 환경]
   buildspec.yml 실행
          |
          v
[빌드 아티팩트] → S3
```

**buildspec.yml:**
```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      python: 3.9
    commands:
      - pip install -r requirements.txt
  
  pre_build:
    commands:
      - echo "테스트 시작..."
      - python -m pytest tests/ -v
  
  build:
    commands:
      - echo "빌드 시작..."
      - zip -r function.zip .
  
  post_build:
    commands:
      - echo "빌드 완료"
      - aws s3 cp function.zip s3://my-bucket/function.zip

artifacts:
  files:
    - function.zip
  discard-paths: yes

cache:
  paths:
    - '/root/.cache/pip/**/*'
```

### 4. CodeBuild 환경 변수

```yaml
# 일반 환경 변수
env:
  variables:
    ENV: production
    REGION: ap-northeast-2
  
  # SSM Parameter Store에서 가져오기
  parameter-store:
    DB_PASSWORD: /myapp/db/password
  
  # Secrets Manager에서 가져오기
  secrets-manager:
    API_KEY: prod/myapp/api-key
```

---

## 🧠 알아두면 좋은 심화 이론

### CodeCommit 알아두면 좋은 점

> ⚠️ **함정**: 2024년 7월 이후 **신규 고객 CodeCommit 사용 불가** (기존 고객만 유지). 시험엔 여전히 출제됨 — 동작 원리는 알아둘 것.

### Git 자격증명 도우미 vs SSH vs Git 자격증명 (시험 자주)

| 방법 | 토큰 갱신 | 사용 사례 |
|------|----------|-----------|
| **SSH 키** | 영구 | 일반 개인용 |
| **Git Credentials** (HTTPS) | 영구 (사용자별 2쌍 한도) | 간단한 클라이언트 |
| **Credential Helper** (HTTPS) | 매번 SigV4 서명 | EC2/Lambda 인스턴스 자동 인증 |

### CodeBuild 빌드 환경 (시험 가끔)

| 항목 | 값 |
|------|-----|
| 컴퓨팅 유형 | small / medium / large / 2xlarge / Lambda |
| 메모리 | 3GB ~ 145GB |
| vCPU | 2 ~ 72 |
| 환경 | Ubuntu, Amazon Linux, Windows |
| Docker 지원 | privileged mode 활성화 필요 |
| VPC | 사설 리소스(RDS 등) 접근 시 VPC 연결 |

### buildspec.yml 핵심 섹션 (시험 매우 빈출)

```yaml
version: 0.2

env:
  variables: { KEY: VALUE }
  parameter-store: { KEY: /path }
  secrets-manager: { KEY: secret-name }
  exported-variables: [ KEY ]    # 다음 단계로 전달

phases:
  install:      # 의존성 설치, 런타임 버전
  pre_build:    # 빌드 전 (로그인, 검증)
  build:        # 실제 빌드
  post_build:   # 빌드 후 (푸시, 알림)

artifacts:
  files: [ "**/*" ]
  base-directory: dist
  discard-paths: yes
  
reports:                          # 테스트 리포트
  TestReport:
    files: ['**/*']
    base-directory: 'test-results'
    file-format: 'JUNITXML'

cache:                            # 빌드 캐시
  paths:
    - 'node_modules/**/*'
```

### CodeBuild Local 모드 (실무 + 시험 가끔)

- `codebuild_build.sh` 스크립트로 로컬에서 빌드 환경 재현
- 빌드 비용 ↓, 빠른 디버깅
- 시험에 "buildspec.yml 디버깅 빠르게" → Local Mode

### 빌드 캐시 종류

| 유형 | 위치 | 특징 |
|------|------|------|
| **Amazon S3** | S3 버킷 | 영구, 다중 빌드 공유 |
| **Local Cache** | 빌드 호스트 | 같은 호스트 재사용 시만 |
| **No Cache** | - | 매번 새로 |

### CodeBuild Reports (테스트 결과)

- JUnitXML, Cucumber JSON, TestNG, NUnit, Visual Studio TRX 지원
- 콘솔에서 시각화
- 보존: 30일 (기본)

### Build Badges

- 마크다운 README에 빌드 상태 표시
- `https://aws-codesuite-readme-region.s3.region.amazonaws.com/...`

### CodeBuild Triggers

- Webhook (GitHub/Bitbucket): push, PR, tag 이벤트
- EventBridge 스케줄: cron으로 정기 빌드
- 수동: 콘솔/CLI

### CodeCommit Triggers vs Notifications (시험에 한 번씩)

| 구분 | Triggers | Notifications |
|------|----------|---------------|
| 대상 | SNS, Lambda | SNS, AWS Chatbot (Slack) |
| 필터 | 분기·경로 매칭 | 이벤트 유형 |
| 횟수 한도 | 저장소당 10개 | 무제한 |

### 관련 서비스 Cross-Reference

- **CodeArtifact** → npm/maven/PyPI 호환 패키지 저장소 (사설 패키지)
- **ECR** → Docker 이미지 → [Week 12 Day 3]
- **CodeGuru** → 코드 리뷰·성능 자동 분석
- **CodeWhisperer** → AI 코드 자동 완성

---

## 아키텍처 다이어그램

```
CI/CD 소스 및 빌드 파이프라인
================================

[개발자]
    |
    | git push
    v
[CodeCommit]
    |
    | 코드 변경 감지
    v
[CodeBuild]
    |
    +-- install → pre_build → build → post_build
    |
    +-- 단위 테스트 실행
    |
    +-- 아티팩트 생성
    v
[S3 아티팩트 버킷]
    |
    v
[배포 단계 (CodeDeploy)]
```

---

## ⭐ 핵심 포인트

1. ⭐ **CodeCommit**: 완전 관리형 Git, IAM 기반 접근 제어
2. ⭐ **buildspec.yml**: 빌드 명령 정의, install/pre_build/build/post_build
3. ⭐ **CodeBuild 환경 변수**: 평문, SSM Parameter Store, Secrets Manager 지원
4. ⭐ **빌드 캐시**: S3 또는 로컬 캐시로 빌드 속도 향상
5. ⭐ **아티팩트**: S3에 저장, 다음 배포 단계에서 사용

---

## 📝 연습 문제

**문제 1.** CodeCommit의 인증에 사용할 수 없는 방법은?

A) SSH 키  
B) HTTPS Git 자격 증명  
C) IAM 사용자/역할  
D) 사용자 이름/비밀번호 직접 입력  

**정답: D** - CodeCommit은 SSH, HTTPS Git 자격 증명, AWS 자격 증명 도우미를 지원합니다. 단순 사용자명/비밀번호는 지원하지 않습니다.

---

**문제 2.** buildspec.yml에서 의존성 설치는 어느 단계에서?

A) pre_build  
B) install  
C) build  
D) post_build  

**정답: B** - 런타임 및 의존성 설치는 install 단계에서 수행합니다.

---

**문제 3.** CodeBuild에서 DB 비밀번호를 안전하게 주입하는 방법은?

A) buildspec.yml에 평문으로 저장  
B) 환경 변수로 직접 설정  
C) SSM Parameter Store 또는 Secrets Manager 참조  
D) S3에서 파일로 가져오기  

**정답: C** - 민감한 정보는 SSM Parameter Store나 Secrets Manager에 저장하고 참조합니다.

---

**문제 4.** CodeBuild 빌드 속도를 높이는 방법은?

A) 더 큰 인스턴스 사용  
B) 의존성 캐시 활용  
C) 멀티스레드 빌드  
D) 병렬 빌드만 가능  

**정답: B** - 의존성 캐시(S3 또는 로컬)를 활용하면 의존성 재설치를 건너뛰어 빌드 속도를 높일 수 있습니다.

---

**문제 5.** CodeCommit과 GitHub의 가장 큰 차이점은?

A) 성능 차이  
B) CodeCommit은 AWS 계정 내 완전 프라이빗, IAM 통합  
C) 비용 차이  
D) 지원 언어 차이  

**정답: B** - CodeCommit은 AWS 계정 내에서 완전히 격리된 프라이빗 저장소를 제공하고 IAM으로 세밀하게 접근을 제어할 수 있습니다.

---

## 📌 오늘의 요약

1. CodeCommit: 완전 관리형 Git, 프라이빗, IAM/SSH/HTTPS 인증
2. CodeBuild: 소스 빌드/테스트/아티팩트 생성, buildspec.yml로 정의
3. buildspec.yml: install → pre_build → build → post_build 단계
4. 환경 변수: 평문, SSM Parameter Store, Secrets Manager 지원
5. 빌드 캐시: S3/로컬 캐시로 빌드 속도 향상
