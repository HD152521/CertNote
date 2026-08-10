# Day 3 - 최종 복습 3: 보안, 모니터링, CI/CD

📅 날짜: 2026년 8월 11일 (화요일)  
🎯 주제: 보안/모니터링/CI/CD 최종 복습  
⏱️ 학습 시간: 약 120분

---

## 🎯 학습 목표

- 보안, 모니터링, CI/CD의 시험 핵심을 최종 정리한다
- 시험에서 자주 나오는 보안 및 운영 문제를 풀어본다

---

## 📖 최종 핵심 정리

### 보안 핵심 암기
```
KMS 직접 암호화: 최대 4KB
Envelope Encryption: GenerateDataKey, 4KB 초과 데이터
CMK: 월 $1, 키 정책 필수
Secrets Manager: 자동 로테이션, $0.40/비밀, 65KB
Parameter Store: 표준 무료, SecureString = KMS 암호화
Cognito User Pool: JWT, API Gateway Authorizer
Cognito Identity Pool: JWT → IAM 임시 자격 증명 → AWS 리소스
WAF: Layer 7, SQL/XSS/Rate/Geo 차단
Shield Standard: 무료, L3/L4 DDoS
Shield Advanced: $3,000/월, 비용 보호, DRT
ACM CloudFront: us-east-1 필수
```

### 모니터링 핵심 암기
```
EC2 메모리/디스크: CloudWatch Agent 필요
CloudWatch 알람: OK, ALARM, INSUFFICIENT_DATA
X-Ray Annotation: 인덱싱 가능, 필터링 가능
X-Ray Metadata: 인덱싱 불가, 추가 정보
X-Ray 샘플링: 처음 1개 + 초당 5%
CloudTrail: 모든 API 감사, 기본 90일
Data Events: 기본 비활성화 (S3 GetObject, Lambda 호출)
```

### CI/CD 핵심 암기
```
CodeCommit: Git, IAM 인증
CodeBuild buildspec: install → pre_build → build → post_build
CodeDeploy: EC2(Agent필수), Lambda(Canary/Linear), appspec.yml
Lambda Canary10Percent5Minutes: 10% 5분 테스트 후 100%
CodePipeline: 오케스트레이션, S3 아티팩트
Beanstalk: .ebextensions, Immutable이 가장 안전
```

---

## 🧠 도메인 2·3·4 - 보안·배포·모니터링 시험 직전 압축

### KMS 함정 모음

| 함정 | 정답 |
|------|------|
| "Encrypt API 한도?" | **4 KB** |
| "AWS Managed Key 회전?" | **1년** (2022+ 변경) |
| "CMK 비용?" | **$1/월** + API 호출 |
| "Multi-Region Key 용도?" | CRR, DDB Global, 멀티 리전 |
| "Key Policy 없으면?" | IAM 정책으로는 접근 불가 |
| "Bucket Key 효과?" | SSE-KMS 비용 99% ↓ |
| "Grant 용도?" | 임시·일회용 권한 (Key Policy 수정 X) |
| "KMS API 한도?" | 키당 5,500~30,000 RPS |
| "FIPS 140-2 Level 3?" | **CloudHSM** |
| "DEK?" | Data Encryption Key (Envelope) |

### Secrets Manager vs Parameter Store

| 항목 | Secrets Manager | Parameter Store |
|------|-----------------|-----------------|
| 자동 회전 | ✅ | ❌ |
| 비용 | $0.40/비밀 | 표준 무료 |
| 크기 | 64KB | 4/8KB |
| RDS 통합 | ✅ | ❌ |

### Cognito 함정

| 함정 | 정답 |
|------|------|
| "User Pool vs Identity Pool?" | 인증(JWT) vs IAM 임시 자격 |
| "ID Token vs Access Token?" | 사용자 정보 vs API 접근 |
| "Refresh Token 최대?" | **10년** |
| "API GW Cognito Authorizer 기본 토큰?" | **ID Token** |
| "HTTP API JWT Authorizer 기본 토큰?" | **Access Token** |
| "Lambda 트리거 개수?" | 11개 (PreSignUp 등) |

### WAF·Shield·ACM 함정

| 함정 | 정답 |
|------|------|
| "WAF 적용 안 되는 곳?" | NLB, HTTP API (직접) |
| "Shield Advanced 비용?" | **$3,000/월** + 데이터 |
| "Shield Advanced 혜택?" | 비용 보호 + SRT(24/7) + WAF 포함 |
| "ACM CloudFront 인증서 리전?" | **us-east-1 강제** |
| "EC2에 ACM 직접 설치?" | **불가** |
| "Private CA 비용?" | $400/월 |

### CloudWatch 함정

| 함정 | 정답 |
|------|------|
| "EC2 기본 모니터링 간격?" | **5분** (Detailed = 1분) |
| "EC2 기본 지표에 없는 것?" | 메모리, 디스크 사용량 |
| "CloudWatch Logs 기본 보존?" | **무기한** |
| "Logs 단일 PutLogEvents?" | **1 MB** |
| "EMF 용도?" | Lambda에서 PutMetricData API 없이 지표 |
| "Anomaly Detection?" | ML 기반 자동 임계값 |

### X-Ray 함정

| 함정 | 정답 |
|------|------|
| "Lambda 활성화?" | Active Tracing 토글 |
| "EC2/ECS 활성화?" | X-Ray Daemon (UDP 2000) |
| "ALB X-Ray?" | **미지원** |
| "Annotation vs Metadata?" | 인덱싱·필터 가능 vs 불가 |
| "Annotation 한도?" | **50개** |
| "기본 샘플링?" | 처음 1개 + 초당 5% |
| "ServiceLens?" | X-Ray + CloudWatch 통합 |

### CloudTrail 함정

| 함정 | 정답 |
|------|------|
| "기본 보존 (콘솔 조회)?" | **90일** |
| "Data Events 기본?" | **비활성화** |
| "Multi-region vs Organization Trail?" | 리전 전체 vs 계정 전체 |
| "CloudTrail Lake?" | 7년 SQL 분석 데이터 레이크 |

### CI/CD 함정

| 함정 | 정답 |
|------|------|
| "buildspec 순서?" | install → pre_build → build → post_build |
| "appspec EC2 vs Lambda?" | YAML 10훅 vs YAML 2훅 |
| "Lambda Canary10Percent5Minutes?" | 10% → 5분 후 100% |
| "ECS 배포 전략?" | **Blue/Green만** |
| "Beanstalk 가장 안전?" | **Immutable** 또는 **Blue/Green** |
| "Manual Approval 만료?" | **7일** 응답 없으면 거부 |
| "EC2 CodeDeploy 필수?" | **Agent 설치** |

---

## 🛡️ 보안을 세 층으로 세워 보기

보안 항목이 많아 보이는 이유는 서비스별로 외우기 때문이다. **어느 층을 지키는 도구인지**로 묶으면 갑자기 단순해진다.

```
┌─ 계층 1: 신원과 권한 (누가?) ─────────────────────────────┐
│  IAM 정책 · SCP · 권한 경계 · STS(임시 자격) · ExternalId   │
│  Cognito User Pool(인증) → Identity Pool(AWS 임시 자격)     │
└──────────────────────────────────────────────────────────┘
┌─ 계층 2: 비밀과 키 (무엇으로?) ───────────────────────────┐
│  KMS(≤4KB 직접 / 그 이상은 Envelope) · CloudHSM(FIPS L3)   │
│  Secrets Manager(자동 회전·RDS 통합) · Parameter Store(무료)│
└──────────────────────────────────────────────────────────┘
┌─ 계층 3: 경로와 트래픽 (어디로?) ─────────────────────────┐
│  WAF(L7: SQLi·XSS·Rate·Geo) · Shield(L3/L4 DDoS)          │
│  ACM(TLS, CloudFront는 us-east-1) · SG/NACL · VPC 엔드포인트│
└──────────────────────────────────────────────────────────┘

문제에서 "권한이 없다" → 계층 1,  "암호화/비밀번호" → 계층 2,
        "공격 차단/인증서" → 계층 3.  섞여 보이면 층부터 가른다.
```

### Envelope Encryption을 코드로

KMS의 `Encrypt` API는 4KB까지만 받는다. 그보다 큰 데이터를 다루는 표준 방식이 봉투 암호화다 — **데이터는 로컬에서 생성한 데이터 키로 암호화하고, 그 데이터 키만 KMS로 암호화해 함께 저장한다.**

```python
import os, boto3
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

kms = boto3.client("kms")

def encrypt_large_object(plaintext: bytes, key_id: str) -> dict:
    # 1) KMS가 "평문 데이터 키"와 "암호화된 데이터 키"를 함께 준다
    resp = kms.generate_data_key(KeyId=key_id, KeySpec="AES_256")
    data_key_plain = resp["Plaintext"]        # 로컬 암호화에만 잠깐 사용
    data_key_cipher = resp["CiphertextBlob"]  # 이것만 데이터와 함께 저장

    # 2) 큰 데이터는 로컬에서 대칭키로 암호화 (KMS 4KB 한도와 무관해진다)
    nonce = os.urandom(12)
    ciphertext = AESGCM(data_key_plain).encrypt(nonce, plaintext, None)

    del data_key_plain    # 3) 평문 데이터 키는 즉시 폐기하는 것이 원칙

    return {"nonce": nonce, "ciphertext": ciphertext, "wrapped_key": data_key_cipher}

def decrypt_large_object(bundle: dict) -> bytes:
    # 복호화 시에는 KMS에 "암호화된 데이터 키"만 보내 평문 키를 되받는다
    data_key_plain = kms.decrypt(CiphertextBlob=bundle["wrapped_key"])["Plaintext"]
    return AESGCM(data_key_plain).decrypt(bundle["nonce"], bundle["ciphertext"], None)
```

이 구조의 이점은 두 가지다. 첫째, **KMS로 오가는 데이터가 항상 작다** — 네트워크 왕복이 키 하나 크기로 고정되므로 100MB든 10GB든 KMS 호출 비용은 같다. 둘째, **키 교체가 싸다** — 데이터를 다시 암호화하지 않고 감싸진 데이터 키만 다시 감싸면 된다. S3의 SSE-KMS가 내부적으로 하는 일이 정확히 이것이고, Bucket Key는 여기서 "데이터 키를 버킷 단위로 재사용해 KMS 호출을 줄인" 최적화다.

> 💡 **관련 이론**: 봉투 암호화는 암호학에서 **키 계층(key hierarchy)** 이라 부르는 오래된 패턴이다. 최상위에 좀처럼 꺼내지 않는 마스터 키(KMS의 CMK — HSM 밖으로 절대 나오지 않음)를 두고, 그 아래에 자주 쓰고 자주 버리는 데이터 키를 둔다. 노출 위험은 아래로 갈수록 크지만 폭발 반경은 작고, 위로 갈수록 노출 기회 자체가 거의 없다. "마스터 키는 절대 이동하지 않는다"는 제약이 곧 `generate_data_key`라는 API 모양을 만든 셈이다. TLS의 세션 키, 디스크 암호화의 볼륨 키도 전부 같은 계층 구조를 쓴다.

> ⚠️ **함정**: KMS에서 **키 정책(Key Policy)이 1차 관문**이라는 점을 놓치기 쉽다. IAM 정책에 `kms:Decrypt`가 있어도 키 정책이 그 주체를 허용하지 않으면 접근이 거부된다(반대 방향도 마찬가지). "IAM 관리자인데 KMS 키를 못 쓴다"는 상황의 정체가 이것이며, 임시로 권한을 주고 싶을 때 키 정책을 고치는 대신 쓰는 도구가 **Grant**다. 또 CMK 삭제는 즉시가 아니라 **7~30일 대기 기간** 뒤에 이뤄지고 그 사이 취소할 수 있다 — "실수로 키를 지웠다"에는 복구 여지가 있다는 뜻이다.

### Cognito 토큰 3종 — 어느 것을 어디에 보내는가

| 토큰 | 담긴 내용 | 주 용도 | 주의 |
|------|----------|--------|------|
| **ID 토큰** | 사용자 속성(이름·이메일 등) | 앱이 "이 사람이 누구인지" 알 때, REST API의 **Cognito Authorizer 기본값** | 사용자 정보를 담으므로 외부 노출 주의 |
| **액세스 토큰** | 스코프·권한 | API 호출 인가, HTTP API의 **JWT Authorizer 기본값** | 사용자 상세 정보는 없음 |
| **리프레시 토큰** | 재발급 자격 | 위 두 토큰 갱신 | 수명이 매우 길다(최대 10년 설정 가능) — 보관 주의 |

User Pool과 Identity Pool의 역할 분담도 한 문장으로 정리된다. **User Pool은 "너 누구냐"에 답해 JWT를 주고, Identity Pool은 그 JWT를 받아 "그럼 AWS에서 이만큼 해라"며 IAM 임시 자격 증명으로 바꿔 준다.** 모바일 앱이 S3에 직접 업로드하는 시나리오의 정답이 Identity Pool인 이유가 여기 있다 — S3는 JWT를 이해하지 못하고 SigV4 서명만 이해하기 때문이다.

---

## 🔭 관측 가능성의 세 축: 로그·지표·추적

모니터링 서비스가 헷갈리는 것도 층을 안 나눠서다. 세 축은 서로 대체재가 아니라 **답하는 질문이 다르다.**

```
지표(Metric)  "지금 얼마나 나쁜가?"   → CloudWatch Metrics/Alarms
              숫자 시계열. 싸고 빠르다. 알람의 근거.

로그(Log)     "그때 정확히 무슨 일이?" → CloudWatch Logs, Logs Insights
              사건의 전문(全文). 비싸지만 유일하게 세부를 담는다.

추적(Trace)   "어디에서 느려졌나?"     → X-Ray, ServiceLens
              한 요청이 서비스들을 지나간 경로와 구간별 소요 시간.

감사(Audit)   "누가 무엇을 호출했나?"  → CloudTrail (보안·규정 축)
```

증상 → 도구 매핑이 곧 시험 문제다. "응답이 느린데 어느 서비스 탓인지 모르겠다"는 **추적**, "특정 문자열이 로그에 몇 번 나왔는지로 알람"은 **Metric Filter**, "누가 이 보안 그룹을 열었나"는 **CloudTrail**, "EC2 메모리 사용률"은 기본 지표에 없으므로 **CloudWatch Agent**다.

```python
from aws_xray_sdk.core import xray_recorder, patch_all

patch_all()   # boto3 · requests 등의 호출을 자동으로 서브세그먼트로 기록

@xray_recorder.capture("process_order")
def process_order(order):
    # Annotation: 인덱싱된다 → 콘솔에서 필터 검색 가능 (트레이스당 50개 한도)
    xray_recorder.put_annotation("orderId", order["id"])
    xray_recorder.put_annotation("tier", order["customerTier"])

    # Metadata: 인덱싱되지 않는다 → 필터 불가, 상세 맥락 보관용
    xray_recorder.put_metadata("payload", order)

    with xray_recorder.in_subsegment("charge_payment"):
        return payment_gateway.charge(order)   # 외부 호출 구간을 따로 계측
```

**Annotation과 Metadata의 차이는 "찾을 수 있느냐"** 하나로 갈린다. 특정 주문 번호로 트레이스를 검색하려면 반드시 Annotation이어야 한다. 이 구분은 매 시험마다 나온다.

```bash
# 로그를 실시간으로 따라가며 필터링 (grep 대신 이걸 먼저 쓴다)
aws logs tail /aws/lambda/my-func --follow --since 10m --filter-pattern "ERROR"

# 로그 패턴을 지표로 승격시켜 알람 걸기
aws logs put-metric-filter \
  --log-group-name /aws/lambda/my-func \
  --filter-name PaymentFailures \
  --filter-pattern '"PAYMENT_FAILED"' \
  --metric-transformations metricName=PaymentFailures,metricNamespace=MyApp,metricValue=1

# 오류 트레이스만 뽑아 보기
aws xray get-trace-summaries \
  --start-time 2026-08-11T00:00:00Z --end-time 2026-08-11T01:00:00Z \
  --filter-expression 'service("my-func") AND error'
```

> 🔍 **더 깊이**: X-Ray의 기본 샘플링 규칙은 "**초당 처음 1개는 무조건, 그 이후는 5%**"다. 이 구조에는 이유가 있다 — 트래픽이 적을 때(초당 1건 수준)는 사실상 100% 추적되어 개발·저트래픽 환경에서 데이터가 비지 않고, 트래픽이 폭증하면 비율 부분이 지배해 비용이 선형으로 터지지 않는다. 고정 목표(fixed target)와 비율(rate)을 결합한 이 형태는 관측 시스템 설계의 정석이며, 모든 요청을 봐야 하는 특수한 디버깅 상황에서만 `fixed_target: 0, rate: 1.0`으로 바꿔 쓴다(비용 급증 주의). 반대로 ALB는 X-Ray 계측 대상이 아니라 트레이스 헤더를 전달만 한다는 점도 함께 기억해 둔다.

---

## 🚀 CI/CD를 파일 두 개로 이해하기

CodeBuild와 CodeDeploy는 각각 **파일 하나**로 요약된다. `buildspec.yml`은 "어떻게 만들 것인가", `appspec.yml`은 "어떻게 내보낼 것인가"다.

```yaml
# buildspec.yml — CodeBuild가 읽는다 (레포 루트)
version: 0.2

env:
  variables:
    NODE_ENV: production
  parameter-store:                  # SSM Parameter Store에서 주입
    API_ENDPOINT: /myapp/prod/api-endpoint
  secrets-manager:                  # Secrets Manager에서 주입 (평문 금지!)
    DB_PASSWORD: prod/myapp/db:password

phases:
  install:                          # ① 런타임·도구 준비
    runtime-versions:
      nodejs: 20
    commands:
      - npm ci
  pre_build:                        # ② 빌드 전 준비 (로그인·테스트)
    commands:
      - npm run lint && npm test
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
  build:                            # ③ 실제 빌드
    commands:
      - npm run build
      - docker build -t $ECR_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION .
  post_build:                       # ④ 산출물 마무리·푸시
    commands:
      - docker push $ECR_URI:$CODEBUILD_RESOLVED_SOURCE_VERSION

artifacts:                          # CodePipeline이 S3로 넘길 산출물
  files:
    - appspec.yml
    - dist/**/*
cache:                              # 다음 빌드 가속
  paths:
    - 'node_modules/**/*'
```

순서는 **install → pre_build → build → post_build**이며, 이 네 단어의 순서 자체가 단독 문제로 나온다. 비밀 값을 `env.variables`에 평문으로 적는 보기는 언제나 오답이고, `parameter-store` 또는 `secrets-manager` 참조가 정답이다.

```yaml
# appspec.yml — Lambda 배포용 (훅 2개)
version: 0.0
Resources:
  - MyFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: my-func
        Alias: prod
        CurrentVersion: 3
        TargetVersion: 4
Hooks:
  - BeforeAllowTraffic: LambdaPreTrafficCheck    # 트래픽 전환 전 검증
  - AfterAllowTraffic: LambdaPostTrafficCheck    # 전환 후 검증 (실패 시 롤백)
```

EC2/온프레미스 배포용 `appspec.yml`은 파일 복사 위치와 훨씬 많은 수명 주기 훅(ApplicationStop → BeforeInstall → AfterInstall → ApplicationStart → **ValidateService** 등)을 갖는다. 어느 쪽이든 **ValidateService(또는 AfterAllowTraffic)가 실패하면 자동 롤백**이 걸린다는 점이 핵심이다. 그리고 EC2 대상 배포에는 **CodeDeploy 에이전트 설치가 필수**다 — 에이전트가 없으면 배포가 아예 시작되지 않는다.

### 배포 전략 비교 — "얼마나 겁이 많은가"의 스펙트럼

| 전략 | 대상 | 다운타임 | 비용(추가 자원) | 롤백 속도 | 성격 |
|------|------|---------|---------------|----------|------|
| **AllAtOnce** | Lambda/EC2/Beanstalk | 있음 | 없음 | 재배포 필요 | 가장 빠르고 가장 위험 |
| **Rolling** | EC2/Beanstalk | 없음(용량 감소) | 없음 | 느림 | 배포 중 용량이 줄어듦 |
| **Rolling with Additional Batch** | Beanstalk | 없음 | 일시적 추가 | 느림 | 전체 용량 유지 |
| **Canary** | Lambda | 없음 | 적음 | **즉시**(별칭 가중치 되돌림) | 10%로 먼저 재보고 나머지 전환 |
| **Linear** | Lambda | 없음 | 적음 | **즉시** | 일정 비율씩 계단식 전환 |
| **Immutable** | Beanstalk | 없음 | 큼(새 ASG) | 빠름 | 새 그룹에 전부 띄우고 검증 후 교체 |
| **Blue/Green** | ECS/EC2/Beanstalk | 없음 | 큼(환경 2벌) | **가장 빠름** | 트래픽만 되돌리면 끝 |

`Canary10Percent5Minutes`라는 이름 자체가 해독 가능한 문법이라는 점이 실용적이다 — "**10%를 5분간 흘려 보고, 문제 없으면 나머지 100%**". `Linear10PercentEvery1Minute`는 "1분마다 10%씩" 이다. 이름을 읽는 법만 알면 선택지 네 개가 다 풀린다. ECS의 CodeDeploy 배포가 **Blue/Green 방식**이라는 것, Beanstalk에서 "가장 안전한 것"을 물으면 **Immutable 또는 Blue/Green**이라는 것도 함께 묶어 둔다.

### 파이프라인이 깨지는 자리

| 증상 | 원인 | 처방 |
|------|------|------|
| CodeBuild `AccessDenied`로 ECR push 실패 | 빌드 서비스 역할에 ECR 권한 없음 | 서비스 역할에 `ecr:*` 최소 집합 부여 |
| 빌드 중반부터 `authentication` 오류 | ECR 로그인 토큰 만료(**12시간**) | 푸시 직전 재로그인 |
| CodeDeploy가 EC2에서 시작조차 안 됨 | **에이전트 미설치**·중지 | 에이전트 설치/기동, 인스턴스 역할 확인 |
| 배포는 성공인데 앱은 옛 버전 | 별칭이 새 버전을 안 가리킴 | 별칭/가중치 확인 (`$LATEST` 배포 금지) |
| 승인 단계에서 파이프라인 멈춤 | 수동 승인 대기 | **7일** 내 응답 없으면 거부 처리됨 |
| Beanstalk 배포 후 설정이 사라짐 | `.ebextensions` 우선순위·경로 오류 | `.ebextensions/*.config`의 `option_settings` 확인 |

> 📚 **사례**: Secrets Manager의 자동 회전을 켜 놓고도 애플리케이션이 회전 순간마다 인증 실패로 죽는 사고가 흔하다. 원인은 앱이 **기동 시 비밀을 한 번만 읽고 캐시**하기 때문이다. 회전 Lambda는 `createSecret → setSecret → testSecret → finishSecret` 네 단계를 거치며 새 자격 증명을 만들고 라벨을 옮기는데, 앱이 예전 값을 계속 들고 있으면 라벨이 옮겨간 시점부터 실패한다. 처방은 (1) 인증 실패 시 비밀을 다시 읽고 한 번 재시도하는 로직, (2) 캐시에 짧은 TTL, (3) RDS라면 아예 **RDS Proxy + IAM 인증**으로 비밀 자체를 앱에서 걷어내는 것이다. "자동 회전을 켰는데 장애가 났다"는 시나리오의 정답은 회전을 끄는 게 아니라 앱이 회전을 견디게 만드는 쪽이다.

---

## 정리하며

보안·모니터링·CI/CD는 서로 다른 주제처럼 보이지만, 셋 다 **"코드가 아니라 시스템이 대신 보증하게 만드는 장치"** 라는 점에서 한 줄기다. 보안은 사람이 실수해도 막히도록 층(신원·키·경로)을 겹치고, 관측은 장애를 사람이 눈치채기 전에 지표·로그·추적이 먼저 말하게 하며, CI/CD는 배포의 안전을 사람의 신중함이 아니라 훅과 자동 롤백에 맡긴다. 그래서 이 영역의 정답 보기에는 공통된 냄새가 있다 — **평문 대신 참조, 수동 대신 자동, 전부 전환 대신 점진 전환, 그리고 실패 시 되돌릴 길이 있는 쪽**. 선택지가 헷갈릴 때 이 네 가지 냄새를 맡아 보면 대체로 답이 좁혀진다.

---

## 📝 최종 모의고사 - Part 3

**문제 1.** 100MB 파일을 KMS로 안전하게 암호화하려면?

A) kms:Encrypt API 직접 호출  
B) Envelope Encryption (GenerateDataKey)  
C) S3 SSE-S3 사용  
D) 불가능  

**정답: B** - KMS 직접 암호화는 4KB 제한이 있으므로 100MB 파일은 Envelope Encryption을 사용해야 합니다.

---

**문제 2.** Lambda의 실행 경로에서 어느 서비스에서 지연이 발생하는지 분석하려면?

A) CloudWatch Metrics  
B) CloudTrail  
C) X-Ray  
D) VPC Flow Logs  

**정답: C** - X-Ray 분산 추적은 각 서비스의 실행 시간을 세그먼트로 기록하여 병목 위치를 파악합니다.

---

**문제 3.** Lambda 배포에서 새 버전으로 점진적으로 전환하면서 오류 발생 시 자동 롤백하려면?

A) CodeDeploy AllAtOnce  
B) CodeDeploy Canary 또는 Linear  
C) CloudFormation 업데이트  
D) 수동 배포  

**정답: B** - CodeDeploy의 Canary나 Linear 전략은 트래픽을 점진적으로 전환하고 오류 감지 시 자동으로 이전 버전으로 롤백합니다.

---

**문제 4.** root 계정으로 로그인을 즉시 감지하는 아키텍처는?

A) CloudWatch 알람  
B) CloudTrail + EventBridge + SNS  
C) GuardDuty  
D) Config 규칙  

**정답: B** - CloudTrail에서 root 로그인 이벤트를 감지하고 EventBridge에서 SNS로 즉시 알림을 보내는 패턴입니다.

---

**문제 5.** SSM Parameter Store의 SecureString 값을 코드에서 사용하려면?

A) API 없이 환경 변수에서 자동으로 주입  
B) ssm:GetParameter API with --with-decryption 옵션  
C) KMS decrypt API 직접 호출  
D) Secrets Manager API 사용  

**정답: B** - SSM GetParameter API에 `--with-decryption` 옵션을 사용하면 KMS로 복호화된 값을 반환합니다.

---

**문제 6.** CodeBuild에서 DB 비밀번호를 buildspec.yml에 안전하게 사용하는 방법은?

A) 평문으로 buildspec.yml에 작성  
B) 환경 변수로 평문 설정  
C) Secrets Manager ARN을 secrets-manager 섹션에 참조  
D) S3에 파일로 저장 후 다운로드  

**정답: C** - buildspec.yml의 `env.secrets-manager` 섹션에 Secrets Manager ARN을 참조하면 빌드 시 안전하게 주입됩니다.

---

**문제 7.** Elastic Beanstalk에서 환경마다 다른 DB URL을 설정하는 방법은?

A) buildspec.yml 수정  
B) .ebextensions에서 option_settings으로 환경 변수 설정  
C) S3에 설정 파일 저장  
D) 코드 내 하드코딩  

**정답: B** - `.ebextensions/*.config`의 `option_settings`에서 환경별로 다른 환경 변수를 설정할 수 있습니다.

---

**문제 8.** X-Ray에서 특정 orderId로 트레이스를 필터링하려면?

A) Metadata에 orderId 저장  
B) Annotation에 orderId 저장  
C) 로그에 orderId 출력  
D) CloudWatch 대시보드 사용  

**정답: B** - X-Ray에서 Annotation은 인덱싱되어 필터링에 사용할 수 있습니다. Metadata는 인덱싱되지 않아 필터링 불가합니다.

---

## 📌 오늘의 요약

1. 보안: KMS(4KB제한/Envelope), Cognito(User Pool/Identity Pool), WAF/Shield
2. Secrets Manager: 자동 로테이션, RDS 통합 / Parameter Store: 무료, 계층 구조
3. 모니터링: CloudWatch(지표/알람), X-Ray(추적/Annotation), CloudTrail(감사)
4. CI/CD: CodeBuild(buildspec), CodeDeploy(appspec), CodePipeline(오케스트레이션)
5. 패턴: root 감지(CloudTrail→EventBridge→SNS), 점진적 배포(Canary)
