# Day 4 - AWS CLI, SDK, CloudShell 실습

📅 날짜: 2026년 5월 20일 (수요일)  
🎯 주제: AWS 개발 도구 실습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- AWS CLI를 설치하고 구성할 수 있다
- AWS SDK를 사용하여 프로그래밍 방식으로 AWS 서비스에 접근한다
- AWS CloudShell을 활용하여 브라우저 기반 CLI 환경을 사용한다
- 프로파일 및 자격 증명 관리 방법을 이해한다

---

## 📖 이론 내용

### 1. AWS에 접근하는 방법

| 방법 | 설명 | 사용 대상 |
|------|------|-----------|
| AWS 관리 콘솔 | 웹 브라우저 기반 GUI | 시각적 관리, 초보자 |
| AWS CLI | 명령줄 인터페이스 | 자동화, 스크립팅 |
| AWS SDK | 프로그래밍 API | 애플리케이션 개발 |
| CloudShell | 브라우저 기반 CLI | 빠른 CLI 접근 |
| CloudFormation/Terraform | 인프라 코드(IaC) | 인프라 자동화 |

### 2. AWS CLI (Command Line Interface)

#### 설치
```bash
# macOS (Homebrew)
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Windows
# MSI 설치 파일 다운로드 후 설치
# https://awscli.amazonaws.com/AWSCLIV2.msi

# 버전 확인
aws --version
```

#### 초기 설정
```bash
# 기본 설정 (인터랙티브)
aws configure

# 입력 항목:
# AWS Access Key ID: AKIAXXXXXXXX
# AWS Secret Access Key: xxxxxxxx
# Default region name: ap-northeast-2
# Default output format: json  (json, yaml, text, table 중 선택)
```

#### 자격 증명 파일 구조
```ini
# ~/.aws/credentials
[default]
aws_access_key_id = AKIAXXXXXXXX
aws_secret_access_key = xxxxxxxx

[production]
aws_access_key_id = AKIAYYYYYYYY
aws_secret_access_key = yyyyyyyy

# ~/.aws/config
[default]
region = ap-northeast-2
output = json

[profile production]
region = us-east-1
output = table
```

#### 여러 프로파일 사용
```bash
# 특정 프로파일 사용
aws s3 ls --profile production

# 환경 변수로 프로파일 지정
export AWS_PROFILE=production
aws s3 ls

# 환경 변수로 자격 증명 직접 설정
export AWS_ACCESS_KEY_ID=AKIAXXXXXXXX
export AWS_SECRET_ACCESS_KEY=xxxxxxxx
export AWS_DEFAULT_REGION=ap-northeast-2
```

### 3. AWS CLI 자격 증명 우선 순위

**⭐ 시험 자주 출제!** CLI 자격 증명은 다음 순서로 확인됩니다:

1. 명령줄 옵션 (`--profile`)
2. 환경 변수 (`AWS_ACCESS_KEY_ID` 등)
3. AWS 자격 증명 파일 (`~/.aws/credentials`)
4. AWS 설정 파일 (`~/.aws/config`)
5. 컨테이너 자격 증명 (ECS 태스크 역할)
6. **EC2 인스턴스 메타데이터** (EC2에 연결된 IAM 역할)

### 4. AWS SDK

AWS SDK는 다양한 프로그래밍 언어를 지원합니다:
- Python (boto3)
- JavaScript/Node.js
- Java
- .NET (C#)
- Go
- Ruby
- PHP

#### Python boto3 예시
```python
import boto3
import json

# S3 클라이언트 생성 (기본 프로파일 사용)
s3 = boto3.client('s3', region_name='ap-northeast-2')

# 버킷 목록 조회
response = s3.list_buckets()
for bucket in response['Buckets']:
    print(f"버킷명: {bucket['Name']}, 생성일: {bucket['CreationDate']}")

# 특정 프로파일 사용
session = boto3.Session(profile_name='production')
ec2 = session.client('ec2', region_name='us-east-1')

# EC2 인스턴스 목록 조회
instances = ec2.describe_instances()
for reservation in instances['Reservations']:
    for instance in reservation['Instances']:
        print(f"인스턴스 ID: {instance['InstanceId']}, 상태: {instance['State']['Name']}")

# IAM 클라이언트 - 사용자 생성
iam = boto3.client('iam')
response = iam.create_user(
    UserName='new-developer',
    Tags=[
        {'Key': 'Department', 'Value': 'Engineering'}
    ]
)
print(json.dumps(response['User'], default=str, indent=2))
```

### 5. AWS CloudShell

- AWS 관리 콘솔에서 바로 사용 가능한 브라우저 기반 셸
- 자동으로 AWS CLI 설치 및 자격 증명 구성
- 1GB 영구 스토리지 제공
- Python, Node.js, git 등 기본 개발 도구 포함
- **무료 서비스** (EC2 인스턴스 비용 없음)

### 6. AWS CLI 출력 형식

```bash
# JSON 형식 (기본값)
aws ec2 describe-instances --output json

# 테이블 형식 (사람이 읽기 좋음)
aws ec2 describe-instances --output table

# 텍스트 형식 (스크립트 처리에 적합)
aws ec2 describe-instances --output text

# YAML 형식
aws ec2 describe-instances --output yaml
```

### 7. JMESPath 쿼리 (--query 옵션)

```bash
# EC2 인스턴스 ID와 상태만 조회
aws ec2 describe-instances \
  --query 'Reservations[*].Instances[*].[InstanceId,State.Name]' \
  --output table

# 실행 중인 인스턴스만 필터링
aws ec2 describe-instances \
  --query 'Reservations[*].Instances[?State.Name==`running`].[InstanceId,InstanceType]' \
  --output table

# S3 버킷 이름만 추출
aws s3api list-buckets \
  --query 'Buckets[*].Name' \
  --output text
```

---

## 🧠 알아두면 좋은 심화 이론

### IMDSv1 vs IMDSv2 (시험 매우 자주 출제)

| 항목 | IMDSv1 | IMDSv2 |
|------|--------|--------|
| 요청 방식 | 단순 GET | **PUT으로 토큰 발급 → GET에 토큰 헤더** |
| 보안 | SSRF 취약 | SSRF 방어 (헤더 기반) |
| 현재 권장 | ❌ 비권장 | ✅ 권장 (신규 인스턴스 기본값) |

```bash
# IMDSv2 호출 (2단계)
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/<role-name>
```

> ⚠️ **함정**: 메타데이터 호출이 컨테이너(ECS/EKS)에서 막히는 케이스 — `hop limit` 기본값이 1이라 컨테이너 네트워크에서 접근 불가. 컨테이너에서는 **`AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`** 환경변수를 통해 자동 주입됨(ECS Task Role).

### EC2 인스턴스 메타데이터 주요 경로 (자주 출제)

```
/latest/meta-data/instance-id
/latest/meta-data/instance-type
/latest/meta-data/local-ipv4
/latest/meta-data/public-ipv4
/latest/meta-data/placement/availability-zone
/latest/meta-data/placement/region          ← 현재 리전 확인
/latest/meta-data/iam/security-credentials/<role-name>  ← 임시 자격증명
/latest/user-data                            ← 부팅 스크립트
/latest/dynamic/instance-identity/document   ← 서명된 인스턴스 정보
```

### SDK 자격 증명 체인 (CLI와 거의 동일)

```
1. 명시적 자격 증명 (코드에 전달된 키)
2. 환경 변수 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
3. AWS_PROFILE 환경 변수가 가리키는 프로파일
4. ~/.aws/credentials  (default 또는 지정 프로파일)
5. ~/.aws/config의 source_profile / sso_session
6. 컨테이너 자격 증명 (ECS Task Role, AWS_CONTAINER_CREDENTIALS_*)
7. EC2 인스턴스 프로파일 (IMDS)
```

> ⚠️ **함정**: boto3가 자격 증명을 못 찾을 때 NoCredentialsError. 환경변수 오타나 프로파일 이름 불일치가 99%의 원인.

### CLI 핵심 글로벌 옵션

| 옵션 | 설명 |
|------|------|
| `--profile <name>` | 자격 증명 프로파일 지정 |
| `--region <region>` | 리전 오버라이드 |
| `--output {json,table,text,yaml}` | 출력 포맷 |
| `--query <jmespath>` | JMESPath 응답 필터 |
| `--debug` | 전체 디버그 로그 |
| `--dry-run` | 권한만 확인, 실제 실행 X (지원 시) |
| `--no-cli-pager` | less 페이저 끔 (스크립트용) |
| `--cli-binary-format raw-in-base64-out` | Lambda invoke 페이로드 처리 |

### SDK 재시도 / 백오프 (시험 출제 — Troubleshooting 도메인)

- **기본**: 표준(Standard) 재시도 모드 — 최대 3회 재시도, 지수 백오프 + jitter
- **Adaptive** 모드: 클라이언트 측 토큰 버킷으로 트래픽 조절
- 환경변수로 제어: `AWS_RETRY_MODE`, `AWS_MAX_ATTEMPTS`
- SDK 자동 처리 오류 코드: `ProvisionedThroughputExceededException`, `ThrottlingException`, `429`, `5xx`

> 💡 시험 시나리오: "DynamoDB가 throttling으로 실패해요" → 답은 보통 "SDK 재시도가 자동으로 처리하지만, 백오프/배치 크기/RCU·WCU 늘리기 검토".

### IAM Roles Anywhere (온프레미스 → AWS)

- 온프레미스 서버가 X.509 인증서로 IAM 역할 수임
- `~/.aws/credentials`의 `credential_process`로 자동 연동
- 시험에 가끔: "온프레미스 서버에서 키 없이 AWS 접근하는 법" → IAM Roles Anywhere

### AWS SDK 주요 언어별 명칭 (헷갈리기 쉬움)

| 언어 | SDK 명 |
|------|--------|
| Python | **boto3** |
| Java | AWS SDK for Java v2 |
| JavaScript | AWS SDK for JavaScript v3 (모듈식: `@aws-sdk/client-s3`) |
| Go | AWS SDK for Go v2 |
| .NET | AWS SDK for .NET |
| C++ | AWS SDK for C++ |
| Ruby | AWS SDK for Ruby v3 |

### 환경 변수 치트시트

```bash
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN              # STS 임시 자격증명 사용시 필수
AWS_DEFAULT_REGION             # CLI 기본 리전
AWS_REGION                     # SDK 기본 리전
AWS_PROFILE                    # 사용할 프로파일
AWS_CONFIG_FILE                # 기본 ~/.aws/config 오버라이드
AWS_SHARED_CREDENTIALS_FILE    # 기본 ~/.aws/credentials 오버라이드
AWS_RETRY_MODE                 # legacy|standard|adaptive
AWS_MAX_ATTEMPTS
AWS_EC2_METADATA_DISABLED      # IMDS 호출 끄기
```

### CloudShell 상세 (시험에서 디테일 묻기 좋음)

- 리전별 인스턴스 (선택한 리전에서 동작)
- **1GB 영구 홈 디렉토리** (`/home/cloudshell-user`)
- 120일 미접속 시 홈 디렉토리 삭제
- 무료 + 자동 자격 증명 (로그인 사용자의 IAM 권한 그대로)
- 사전 설치: AWS CLI v2, Python, Node.js, npm, jq, git, Docker(일부 리전)

### 관련 서비스 Cross-Reference

- **EC2 인스턴스 프로파일** → [Week 2 Day 1]
- **Lambda 환경 변수 / Secrets Manager** → [Week 3 Day 3, Week 9 Day 2]
- **CloudFormation 파라미터** → [Week 12 Day 5]
- **SDK 재시도/throttling** → [Week 6 DynamoDB, Week 10 X-Ray로 추적]

---

## 아키텍처 다이어그램

```
AWS 접근 방법 비교
================================

개발자
  |
  +--[웹 브라우저]----> AWS 관리 콘솔 (GUI)
  |
  +--[터미널]---------> AWS CLI
  |                      aws configure
  |                      ~/.aws/credentials
  |                      ~/.aws/config
  |
  +--[코드]-----------> AWS SDK
  |                      boto3 (Python)
  |                      aws-sdk (Node.js)
  |                      aws-sdk (Java)
  |
  +--[브라우저]-------> AWS CloudShell
                         (자동 자격 증명)

자격 증명 우선 순위
================================

1. 명령줄 옵션 (--profile, --region)
        |
2. 환경 변수 (AWS_ACCESS_KEY_ID)
        |
3. ~/.aws/credentials 파일
        |
4. ~/.aws/config 파일
        |
5. 컨테이너 자격 증명 (ECS)
        |
6. EC2 인스턴스 메타데이터 (IAM 역할)
        |
        v
    API 요청 실행
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **자격 증명 우선 순위**: 환경 변수 > 자격 증명 파일 > 인스턴스 메타데이터
2. ⭐ **EC2 인스턴스 메타데이터**: http://169.254.169.254/latest/meta-data/ 에서 접근
3. ⭐ **IMDSv2**: 인스턴스 메타데이터 서비스 v2 (토큰 기반, 보안 강화)
4. ⭐ **--query 옵션**: JMESPath 쿼리로 응답 필터링
5. ⭐ **CloudShell**: 무료, 자동 자격 증명, 1GB 영구 스토리지

---

## 💻 실제 예시 - 자주 사용하는 CLI 명령어

```bash
# ===== IAM =====
# 현재 자격 증명 확인
aws sts get-caller-identity

# IAM 사용자 목록
aws iam list-users

# IAM 역할 목록
aws iam list-roles

# ===== S3 =====
# 버킷 목록
aws s3 ls

# 버킷 내 파일 목록
aws s3 ls s3://my-bucket/

# 파일 업로드
aws s3 cp local-file.txt s3://my-bucket/

# 파일 다운로드
aws s3 cp s3://my-bucket/file.txt ./

# ===== EC2 =====
# 인스턴스 목록 (실행 중인 것만)
aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,PublicIpAddress]' \
  --output table

# 인스턴스 시작
aws ec2 start-instances --instance-ids i-1234567890abcdef0

# ===== EC2 인스턴스 메타데이터 (IMDSv2) =====
# 토큰 발급
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# 메타데이터 조회
curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/instance-id

curl -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRole
```

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스에서 AWS CLI를 사용할 때 가장 안전한 자격 증명 방법은?

A) ~/.aws/credentials 파일에 액세스 키 저장  
B) 환경 변수에 액세스 키 설정  
C) IAM 역할을 EC2 인스턴스에 연결  
D) 코드에 액세스 키 하드코딩  

**정답: C**  
해설: IAM 역할을 EC2에 연결하면 인스턴스 메타데이터 서비스를 통해 자동으로 임시 자격 증명이 제공되어 자격 증명을 별도로 관리할 필요가 없습니다.

---

**문제 2.** AWS CLI에서 자격 증명 우선 순위로 올바른 것은?

A) ~/.aws/credentials > 환경 변수 > 인스턴스 메타데이터  
B) 환경 변수 > ~/.aws/credentials > 인스턴스 메타데이터  
C) 인스턴스 메타데이터 > 환경 변수 > ~/.aws/credentials  
D) 환경 변수 > 인스턴스 메타데이터 > ~/.aws/credentials  

**정답: B**  
해설: AWS CLI 자격 증명은 환경 변수가 파일보다 우선하며, 인스턴스 메타데이터(IAM 역할)가 가장 낮은 우선순위를 가집니다.

---

**문제 3.** AWS CloudShell에 대한 설명으로 올바르지 않은 것은?

A) 별도의 자격 증명 설정 없이 사용 가능하다  
B) 1GB의 영구 스토리지를 제공한다  
C) EC2 인스턴스 비용이 추가로 발생한다  
D) AWS CLI가 사전 설치되어 있다  

**정답: C**  
해설: CloudShell은 AWS에서 무료로 제공하는 브라우저 기반 셸 서비스입니다. 별도의 EC2 인스턴스 비용이 발생하지 않습니다.

---

**문제 4.** 다음 CLI 명령어의 `--query` 옵션 결과는?

```bash
aws s3api list-buckets --query 'Buckets[*].Name' --output text
```

A) 버킷의 모든 속성을 JSON으로 출력  
B) 버킷 이름 목록을 텍스트로 출력  
C) 버킷의 크기를 텍스트로 출력  
D) 버킷의 위치(리전)를 텍스트로 출력  

**정답: B**  
해설: `Buckets[*].Name`은 JMESPath 쿼리로 모든 버킷의 Name 속성만 추출하며, `--output text`로 텍스트 형식으로 출력합니다.

---

**문제 5.** EC2 인스턴스 메타데이터 서비스(IMDS)에서 현재 인스턴스의 ID를 가져오는 URL은?

A) http://169.254.169.254/latest/meta-data/instance-id  
B) http://localhost/aws/instance-id  
C) https://aws.amazon.com/meta-data/instance-id  
D) http://169.254.0.1/instance-id  

**정답: A**  
해설: EC2 인스턴스 메타데이터는 항상 고정 IP 169.254.169.254의 링크-로컬 주소에서 접근합니다. /latest/meta-data/ 경로 아래에 다양한 인스턴스 정보가 있습니다.

---

## 📌 오늘의 요약

1. AWS 접근 방법: 관리 콘솔(GUI), CLI(터미널), SDK(코드), CloudShell(브라우저)
2. CLI 자격 증명 우선 순위: 환경 변수 > 자격 증명 파일 > 인스턴스 메타데이터
3. EC2에서의 AWS 접근은 IAM 역할을 연결하는 것이 가장 안전한 방법
4. --query 옵션(JMESPath)으로 CLI 응답을 필터링하고 원하는 정보만 추출 가능
5. CloudShell은 무료, 자동 자격 증명, 영구 스토리지를 제공하는 편리한 CLI 환경
