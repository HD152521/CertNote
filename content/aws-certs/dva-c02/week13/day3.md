# Day 63 - 최종 복습 3: 보안, 모니터링, CI/CD

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
