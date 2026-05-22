# Day 42 - Secrets Manager, Parameter Store

📅 날짜: 2026년 7월 13일 (월요일)  
🎯 주제: AWS Secrets Manager & SSM Parameter Store  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Secrets Manager로 DB 자격 증명을 안전하게 관리한다
- Parameter Store와 Secrets Manager의 차이를 이해한다
- 자동 비밀 로테이션을 구현한다

---

## 📖 이론 내용

### 1. AWS Secrets Manager란?

DB 자격 증명, API 키 등의 비밀 정보를 안전하게 저장하고 자동으로 로테이션하는 서비스입니다.

**주요 기능:**
- 비밀 정보 암호화 저장 (KMS)
- 자동 로테이션 (Lambda 기반)
- RDS 통합 자동 로테이션
- Cross-Account 공유
- CloudFormation 통합

### 2. Secrets Manager 사용

```python
import boto3
import json

secrets_client = boto3.client('secretsmanager')

# 비밀 값 가져오기
response = secrets_client.get_secret_value(
    SecretId='prod/myapp/db-credentials'
)

# JSON 파싱
secret = json.loads(response['SecretString'])
db_host = secret['host']
db_username = secret['username']
db_password = secret['password']
db_name = secret['dbname']

# DB 연결 (비밀번호 하드코딩 없음!)
conn = mysql.connect(
    host=db_host,
    user=db_username,
    password=db_password,
    database=db_name
)
```

### 3. RDS 자동 로테이션

```json
{
  "Description": "DB 자격 증명 자동 로테이션",
  "설정": {
    "로테이션 활성화": true,
    "로테이션 간격": "30일",
    "Lambda 함수": "자동 생성 또는 커스텀",
    "지원 DB": "RDS MySQL/PostgreSQL/Oracle/SQL Server"
  }
}
```

**로테이션 동작:**
```
30일마다:
1. Lambda가 새 비밀번호 생성
2. RDS에서 비밀번호 변경
3. Secrets Manager에 새 비밀번호 저장
4. 애플리케이션은 자동으로 새 비밀번호 사용
```

### 4. SSM Parameter Store

계층적 구성 데이터를 저장하는 서비스입니다.

**파라미터 유형:**
- **String**: 일반 텍스트
- **StringList**: 쉼표로 구분된 목록
- **SecureString**: KMS로 암호화된 값

```bash
# 파라미터 생성
aws ssm put-parameter \
    --name "/prod/myapp/db-url" \
    --value "jdbc:postgresql://mydb.rds.amazonaws.com:5432/mydb" \
    --type "String"

# 보안 파라미터 (암호화)
aws ssm put-parameter \
    --name "/prod/myapp/db-password" \
    --value "my-secure-password" \
    --type "SecureString" \
    --key-id "alias/myapp-key"

# 파라미터 가져오기 (복호화 포함)
aws ssm get-parameter \
    --name "/prod/myapp/db-password" \
    --with-decryption
```

### 5. Secrets Manager vs Parameter Store

| 특성 | Secrets Manager | Parameter Store |
|------|-----------------|-----------------|
| 비용 | 비밀당 $0.40/월 | 표준: 무료, 고급: $0.05/월 |
| 자동 로테이션 | 지원 (Lambda 기반) | 미지원 |
| 크기 제한 | 65KB | 표준: 4KB, 고급: 8KB |
| 계층적 구조 | 미지원 | 지원 (/app/env/key) |
| 용도 | DB 자격 증명, API 키 | 구성 데이터, 비밀 정보 |

---

## 🧠 알아두면 좋은 심화 이론

### Secrets Manager vs Parameter Store - 결정 트리 (시험 시나리오)

```
자동 회전 필요? ────── YES ────→ Secrets Manager
                       NO
                       ↓
크기 > 8KB?     ────── YES ────→ Secrets Manager
                       NO
                       ↓
RDS·DocDB·Redshift 통합? ──── YES ────→ Secrets Manager
                              NO
                              ↓
비용 최우선?    ────── YES ────→ Parameter Store (Standard)
                       NO
                       ↓
                둘 다 가능 (보통 Parameter Store)
```

### Secrets Manager 통합 자동 회전 (시험 빈출)

| DB | 회전 방식 |
|----|-----------|
| **RDS MySQL, PostgreSQL, MariaDB** | AWS 관리 Lambda (Single-User / Alternating-Users) |
| **RDS Oracle, SQL Server** | AWS 관리 Lambda |
| **DocumentDB** | AWS 관리 Lambda |
| **Redshift** | AWS 관리 Lambda |
| **기타** | 사용자 정의 Lambda |

### Rotation 두 가지 전략

| 전략 | 동작 | 다운타임 |
|------|------|----------|
| **Single-User** | 한 사용자의 비밀번호 교체 | 짧은 순간 가능 |
| **Alternating-Users** | 두 사용자 번갈아 (User A → User B) | **거의 없음** (권장) |

### Parameter Store 디테일

| 항목 | Standard | Advanced |
|------|----------|----------|
| 파라미터 수 | 10,000 (계정/리전당) | 100,000 |
| 크기 | **4 KB** | **8 KB** |
| 정책·기간 만료 | ❌ | ✅ |
| 가격 | 무료 | $0.05/파라미터/월 |
| API 호출 | 무료 (Throughput 옵션) | $0.005/10000 호출 |

### Parameter Store 고급 - Policy

- **Expiration**: 자동 삭제 (만료 시)
- **NoChangeNotification**: 일정 기간 변경 없으면 알림
- **ExpirationNotification**: 만료 임박 시 알림

### Parameter 계층 구조 (시험에 가끔)

```
/myapp/prod/database/password
/myapp/prod/database/host
/myapp/prod/database/port
/myapp/staging/database/password

조회: get-parameters-by-path --path /myapp/prod
```

- IAM 정책으로 경로별 권한 분리 (`arn:aws:ssm:...:parameter/myapp/prod/*`)
- AppConfig와 연계 가능

### Public Parameters (시험에 한 번씩)

```bash
# 최신 Amazon Linux 2023 AMI ID 자동 가져오기
aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64
```

AWS가 제공하는 공개 파라미터: AMI ID, ECS 이미지 등.

### AppConfig (시험에 가끔)

- 런타임 설정 점진 배포 (Feature Flag)
- Lambda Extension으로 설정 캐싱
- Parameter Store/Secrets Manager와 함께 시험에 함정 옵션

### Secrets Manager Replication (Cross-Region)

- 비밀을 다른 리전에 복제 → 멀티 리전 워크로드
- 자동 동기화 (Secrets Manager가 관리)

### Cost 비교 (실무에서 중요)

```
Parameter Store (Standard): 무료
Parameter Store (Advanced): $0.05/파라미터/월 + API 호출
Secrets Manager: $0.40/비밀/월 + $0.05/10000 API 호출

100개 비밀 1년:
  Parameter Store: $0
  Parameter Store Advanced: $60
  Secrets Manager: $480
```

### 관련 서비스 Cross-Reference

- **Lambda Extension** → 호출량 감소 + 콜드 스타트 ↓
- **RDS 통합 자동 회전** → [Week 7 Day 2]
- **CloudFormation Secrets Manager** → 동적 참조 (`{{resolve:secretsmanager:...}}`)
- **CodeBuild env.secrets-manager** → [Week 8 Day 1]

---

## 아키텍처 다이어그램

```
Secrets Manager 자동 로테이션
================================

매 30일:
[EventBridge 스케줄]
         |
         v
[Lambda 로테이션 함수]
         |
         +-- 1. RDS에서 비밀번호 변경
         |
         +-- 2. Secrets Manager 업데이트
         
[애플리케이션]
         |
         | get_secret_value() 호출
         v
[Secrets Manager]
         |
         | 항상 최신 비밀값 반환
         v
[애플리케이션 = 최신 DB 비밀번호 자동 사용]

Parameter Store 계층 구조
================================

/myapp/
  /prod/
    /db-url
    /db-password
    /api-key
  /staging/
    /db-url
    /db-password
```

---

## ⭐ 핵심 포인트

1. ⭐ **Secrets Manager**: 자동 로테이션 지원, RDS 통합
2. ⭐ **Parameter Store**: 계층적 구조, 표준 무료, 보안 문자열 지원
3. ⭐ **SecureString**: KMS로 암호화, with-decryption으로 복호화
4. ⭐ **자동 로테이션**: Lambda 함수가 DB 비밀번호 자동 변경
5. ⭐ **비용 비교**: Secrets Manager 비밀당 $0.40, Parameter Store 표준 무료

---

## 📝 연습 문제

**문제 1.** RDS DB 자격 증명의 자동 로테이션이 필요할 때 사용할 서비스는?

A) SSM Parameter Store  
B) AWS Secrets Manager  
C) AWS KMS  
D) IAM  

**정답: B** - Secrets Manager는 RDS와 통합된 자동 로테이션 기능을 제공합니다.

---

**문제 2.** SSM Parameter Store에서 암호화된 값을 저장하는 유형은?

A) String  
B) StringList  
C) SecureString  
D) EncryptedString  

**정답: C** - SecureString은 KMS를 사용하여 값을 암호화하여 저장합니다.

---

**문제 3.** Parameter Store의 표준 계층 비용은?

A) 비밀당 $0.40/월  
B) 파라미터당 $0.05/월  
C) 무료  
D) API 호출당 과금  

**정답: C** - SSM Parameter Store 표준 계층은 무료입니다.

---

**문제 4.** Secrets Manager와 Parameter Store 모두 지원하는 기능은?

A) 자동 로테이션  
B) KMS 암호화  
C) 65KB 데이터 저장  
D) 계층적 구조  

**정답: B** - 두 서비스 모두 KMS를 사용한 암호화를 지원합니다.

---

**문제 5.** Lambda 함수에서 DB 비밀번호를 코드에 하드코딩하지 않고 가져오는 방법은?

A) 환경 변수에 평문으로 저장  
B) Secrets Manager 또는 SSM Parameter Store에서 런타임에 가져오기  
C) S3에 저장  
D) 빌드 시 주입  

**정답: B** - 런타임에 Secrets Manager나 SSM Parameter Store API를 호출하여 안전하게 가져옵니다.

---

## 📌 오늘의 요약

1. Secrets Manager: DB 자격 증명 관리, 자동 로테이션(Lambda), RDS 통합
2. Parameter Store: 구성 데이터, 계층 구조(/app/env/key), 표준 무료
3. SecureString: KMS 암호화, get-parameter --with-decryption으로 복호화
4. Secrets Manager: 비밀당 $0.40, 65KB, 자동 로테이션
5. Parameter Store: 표준 무료, 고급 $0.05, 최대 8KB
