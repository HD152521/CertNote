# Day 32 - RDS: 보안, 백업, 모니터링

📅 날짜: 2026년 6월 29일 (월요일)  
🎯 주제: RDS 운영 및 보안 관리  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- RDS 암호화 및 IAM 인증 방법을 이해한다
- RDS 백업 전략을 수립한다
- RDS 모니터링 지표를 파악한다

---

## 📖 이론 내용

### 1. RDS 암호화

**저장 데이터 암호화 (At-Rest Encryption):**
- AWS KMS로 AES-256 암호화
- 생성 시 설정 필요 (후에 변경 불가)
- 암호화된 DB의 스냅샷도 암호화

**암호화 변경 방법:**
```
비암호화 RDS → 스냅샷 생성 → 암호화된 스냅샷으로 복사 → 새 RDS 생성
```

**전송 암호화 (In-Transit):**
- SSL/TLS 강제 적용 가능
- rds.force_ssl 파라미터 설정

### 2. RDS IAM 인증

비밀번호 없이 IAM 토큰으로 인증:

```python
import boto3
import mysql.connector

# IAM 토큰 생성
client = boto3.client('rds')
token = client.generate_db_auth_token(
    DBHostname='mydb.cluster.ap-northeast-2.rds.amazonaws.com',
    Port=3306,
    DBUsername='db_user',
    Region='ap-northeast-2'
)

# 토큰으로 연결 (토큰 유효시간: 15분)
conn = mysql.connector.connect(
    host='mydb.cluster.ap-northeast-2.rds.amazonaws.com',
    user='db_user',
    password=token,
    ssl_ca='rds-ca-2019-root.pem'
)
```

**IAM 인증 특징:**
- 토큰 유효 시간: 15분
- IAM 정책으로 DB 접근 제어 가능
- SSL 필수

### 3. RDS 백업

**자동 백업 (Automated Backup):**
- 매일 백업 윈도우 동안 자동 실행
- 트랜잭션 로그: 5분마다 S3 저장
- 보존 기간: 1-35일 (기본 7일)
- Point-in-Time Recovery 지원

**수동 스냅샷 (Manual Snapshot):**
- 원할 때 수동으로 생성
- 보존 기간 무제한
- DB 삭제 후에도 유지

**백업 비교:**

| 특성 | 자동 백업 | 수동 스냅샷 |
|------|-----------|-------------|
| 보존 기간 | 최대 35일 | 무제한 |
| DB 삭제 후 | 삭제됨 | 유지됨 |
| 복구 방법 | Point-in-Time | 특정 시점으로 복구 |

### 4. RDS 모니터링

**CloudWatch 주요 지표:**
- `CPUUtilization`: CPU 사용률
- `DatabaseConnections`: 데이터베이스 연결 수
- `FreeStorageSpace`: 남은 스토리지
- `ReadIOPS / WriteIOPS`: I/O 작업 수
- `ReadLatency / WriteLatency`: I/O 지연 시간

**RDS Enhanced Monitoring:**
- OS 수준 지표 제공 (1초 간격)
- 프로세스 및 스레드 정보
- CloudWatch Logs에 저장

---

## 🧠 알아두면 좋은 심화 이론

### CloudWatch vs Enhanced Monitoring vs Performance Insights (시험 빈출 3종)

| 도구 | 데이터 출처 | 간격 | 용도 |
|------|-------------|------|------|
| **CloudWatch** | 하이퍼바이저 외부 | 60초 (1분) | 인스턴스 수준 |
| **Enhanced Monitoring** | OS 내부 에이전트 | 1초 ~ 60초 | OS·프로세스 수준 |
| **Performance Insights** | DB 엔진 내부 | 1초 | 쿼리·대기 이벤트 |

> 💡 시험 시나리오:
> - "쿼리가 느린 이유" → **Performance Insights**
> - "OS 메모리·프로세스 보기" → **Enhanced Monitoring**
> - "기본 알람·메트릭" → **CloudWatch**

### RDS 백업 디테일 (시험 함정)

| 항목 | 자동 백업 | 수동 스냅샷 |
|------|-----------|-------------|
| 보존 | 0~35일 (0=비활성) | 무제한 (단 비용↑) |
| DB 삭제 후 | 자동 삭제 | 유지 |
| 비용 | RDS 스토리지 100%까지 무료 | 별도 과금 |
| 복원 | PITR (Point-in-Time) | 특정 스냅샷 시점 |
| 다른 계정 공유 | ❌ | ✅ (KMS 키 공유 필요) |
| 다른 리전 복사 | ❌ | ✅ |

> ⚠️ **함정**: "0일로 설정"하면 자동 백업 OFF — 일부 기능(PITR, Read Replica 생성) 사용 불가. 시험에 "Read Replica 만들었는데 안 됨" → 자동 백업 활성화 확인.

### RDS Storage 종류 (시험 출제)

| 유형 | 사용 |
|------|------|
| **gp3** (범용 SSD) | 기본 권장, 독립 IOPS 설정 |
| **gp2** (범용 SSD) | 이전 세대 |
| **io1** (프로비저닝 IOPS SSD) | 고성능 OLTP |
| **io2 Block Express** | 최고 성능, Oracle/SQL Server 일부 |
| **magnetic** | 레거시, 비권장 |

### RDS Storage Auto Scaling

- 사용량 90% 도달 시 자동 확장
- 최대 한도 설정 필요
- 시험: "스토리지 부족으로 DB 다운" → Storage Auto Scaling 활성화

### IAM DB Authentication 디테일

- MySQL, PostgreSQL, Aurora만 지원
- 비밀번호 대신 IAM 자격증명 → SigV4 토큰 → 15분 유효
- 동시 연결 200/초로 제한 (MySQL)
- 시나리오: Lambda → RDS 비밀번호 관리 회피
- **Aurora DSQL** (2024 신규)도 IAM 인증 표준

### 매개변수·옵션 그룹 (시험 가끔)

| 그룹 | 역할 |
|------|------|
| **DB Parameter Group** | 엔진 파라미터 (memory, query cache 등) |
| **DB Option Group** | 엔진 추가 기능 (Oracle TDE, SQL Server Audit) |
| **DB Cluster Parameter Group** | Aurora 클러스터 수준 |

기본 그룹은 수정 불가 → 커스텀 그룹 생성 후 적용.

### 유지보수 윈도우

- 주 1회 30분 윈도우 (지정 가능)
- 마이너 버전 자동 업그레이드 옵션
- 패치는 종료 시 페일오버(다운타임) 발생할 수 있음
- Multi-AZ면 다운타임 최소화 (standby부터 패치)

### Secrets Manager + RDS 통합 (시험 출제)

- 비밀번호 자동 회전 (lambda 사용 안 함, AWS 관리)
- 회전 주기 설정 (기본 30일)
- 시나리오: "DB 비밀번호 정기 교체 + 무중단" → Secrets Manager 회전

### CloudWatch Logs 통합

- RDS 로그를 CloudWatch Logs로 전송 (Error/Audit/Slow Query/General)
- 자동 활성화 X — 명시적 설정 필요
- KMS 암호화 가능

### 관련 서비스 Cross-Reference

- **Secrets Manager 회전** → [Week 9 Day 2]
- **CloudWatch Logs Insights** → [Week 10 Day 1]
- **AWS Backup** → 통합 백업 관리
- **KMS** → [Week 9 Day 1] RDS 암호화 키

---

## 아키텍처 다이어그램

```
RDS 보안 아키텍처
================================

[애플리케이션 서버]
      |
      | IAM 토큰 (15분 유효)
      | SSL/TLS 연결
      v
[RDS 인스턴스]
      |
      | KMS 암호화 (AES-256)
      v
[암호화된 스토리지]

RDS 백업 전략
================================

[RDS Primary]
      |
      +---> [자동 백업] (매일)
      |          |
      |          v
      |     [S3 스냅샷] (35일 보존)
      |          |
      |          v
      |     [트랜잭션 로그] (5분 단위)
      |
      +---> [수동 스냅샷] (원할 때)
                 |
                 v
           [S3] (무기한 보존)
```

---

## ⭐ 핵심 포인트

1. ⭐ **RDS 암호화 변경**: 비암호화 → 스냅샷 → 암호화 스냅샷 복사 → 새 DB
2. ⭐ **IAM 인증 토큰**: 유효 시간 15분, SSL 필수
3. ⭐ **자동 백업 보존**: 최대 35일, DB 삭제 시 함께 삭제
4. ⭐ **수동 스냅샷**: 무제한 보존, DB 삭제 후에도 유지
5. ⭐ **Point-in-Time Recovery**: 자동 백업 + 트랜잭션 로그로 5분 단위 복구

---

## 📝 연습 문제

**문제 1.** 암호화되지 않은 RDS를 암호화하는 방법은?

A) RDS 설정에서 직접 암호화 활성화  
B) 스냅샷 생성 → 암호화 스냅샷 복사 → 새 RDS 생성  
C) AWS Support에 요청  
D) 불가능  

**정답: B** - 기존 RDS를 직접 암호화할 수 없습니다. 스냅샷을 생성하고 암호화된 스냅샷으로 복사한 후 새 DB를 생성해야 합니다.

---

**문제 2.** RDS IAM 인증 토큰의 유효 시간은?

A) 5분  
B) 15분  
C) 1시간  
D) 24시간  

**정답: B** - RDS IAM 인증 토큰은 15분간 유효합니다.

---

**문제 3.** RDS 자동 백업의 최대 보존 기간은?

A) 7일  
B) 14일  
C) 35일  
D) 90일  

**정답: C** - RDS 자동 백업은 최대 35일까지 보존 가능합니다 (기본 7일).

---

**문제 4.** RDS DB 삭제 후에도 백업을 유지하려면?

A) 자동 백업 보존 기간을 최대로 설정  
B) 수동 스냅샷 생성  
C) S3에 직접 복사  
D) Multi-AZ 활성화  

**정답: B** - 수동 스냅샷은 DB 삭제 후에도 유지됩니다. 자동 백업은 DB 삭제 시 함께 삭제됩니다.

---

**문제 5.** RDS에서 5분 단위 특정 시점으로 복구하려면?

A) 수동 스냅샷에서 복원  
B) Point-in-Time Recovery 사용  
C) Multi-AZ Failover  
D) Read Replica 승격  

**정답: B** - Point-in-Time Recovery는 자동 백업과 트랜잭션 로그를 사용하여 특정 시점으로 DB를 복구합니다.

---

## 📌 오늘의 요약

1. RDS 암호화: KMS 사용, 생성 시 설정, 변경 시 스냅샷 → 복사 → 신규 DB 필요
2. IAM 인증: 비밀번호 없이 IAM 토큰(15분) 사용, SSL 필수
3. 자동 백업: 최대 35일, Point-in-Time Recovery 지원, DB 삭제 시 함께 삭제
4. 수동 스냅샷: 무제한 보존, DB 삭제 후에도 유지
5. 모니터링: CloudWatch 지표 + Enhanced Monitoring (OS 수준, 1초 간격)
