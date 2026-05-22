# Day 34 - Aurora: 기초, 글로벌 데이터베이스

📅 날짜: 2026년 7월 1일 (수요일)  
🎯 주제: Amazon Aurora  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Aurora의 핵심 특성과 RDS와의 차이를 이해한다
- Aurora 글로벌 데이터베이스 아키텍처를 파악한다
- Aurora Serverless 사용 케이스를 이해한다

---

## 📖 이론 내용

### 1. Amazon Aurora란?

AWS가 독자 개발한 완전 관리형 관계형 데이터베이스로 MySQL과 PostgreSQL과 호환됩니다.

**Aurora 핵심 특성:**
- MySQL의 5배, PostgreSQL의 3배 성능
- 스토리지 자동 확장: 10GB ~ 128TB
- 최대 15개 Read Replica (RDS는 5개)
- 3개 AZ에 6개 복사본 자동 저장
- 자가 복구 (Self-Healing)

### 2. Aurora 스토리지 아키텍처

```
Aurora 스토리지 (분산 스토리지)
================================

[Aurora Primary]
      |
      v
[분산 스토리지 클러스터]
  AZ-A: [사본1] [사본2]
  AZ-B: [사본3] [사본4]
  AZ-C: [사본5] [사본6]
  
  총 6개 사본, 3개 AZ에 분산
  4개 사본에 쓰기 성공 시 확인 응답
  3개 사본에서 읽기 가능
  스토리지 자동 확장 (10GB ~ 128TB)
```

**⭐ 쿼럼 기반**: 6개 중 4개에 쓰기 = 높은 내구성

### 3. Aurora 엔드포인트

```python
import pymysql

# Writer 엔드포인트 (쓰기)
write_conn = pymysql.connect(
    host='mydb.cluster.ap-northeast-2.rds.amazonaws.com',
    user='admin',
    password='secret'
)

# Reader 엔드포인트 (읽기 - 여러 Read Replica에 로드밸런싱)
read_conn = pymysql.connect(
    host='mydb.cluster-ro.ap-northeast-2.rds.amazonaws.com',
    user='admin',
    password='secret'
)
```

**엔드포인트 종류:**
- **Writer Endpoint**: Primary에 연결
- **Reader Endpoint**: 모든 Read Replica에 로드밸런싱
- **Custom Endpoint**: 특정 인스턴스 그룹 지정

### 4. Aurora Serverless

예측 불가능한 트래픽에 자동 확장/축소:

```yaml
# Aurora Serverless v2 설정
Type: AWS::RDS::DBCluster
Properties:
  Engine: aurora-mysql
  ServerlessV2ScalingConfiguration:
    MinCapacity: 0.5   # 최소 0.5 ACU
    MaxCapacity: 128   # 최대 128 ACU
```

**사용 케이스:**
- 간헐적인 트래픽 (개발/테스트 환경)
- 트래픽 예측 불가능한 서비스
- 사용하지 않을 때 자동으로 0으로 스케일 다운

### 5. Aurora 글로벌 데이터베이스

```
Aurora 글로벌 데이터베이스
================================

[Primary Region: ap-northeast-2]
  [Aurora Primary Cluster]
        |
        | < 1초 복제 지연
        v
[Secondary Region 1: us-east-1]
  [Aurora Read Replica Cluster]
  
[Secondary Region 2: eu-west-1]
  [Aurora Read Replica Cluster]

재해 복구:
  - Secondary를 Primary로 승격 (< 1분)
  - RTO < 1분
```

---

## 🧠 알아두면 좋은 심화 이론

### Aurora 스토리지 - Quorum 기반 일관성 (시험 빈출)

```
6개 사본 = 3 AZ × 2 사본
쓰기 정족수: 4/6 (V_w = 4)
읽기 정족수: 3/6 (V_r = 3)
V_w + V_r > V (4+3 > 6) → 강력한 일관성 보장

장애 허용:
  AZ 1개 + 노드 1개 손실 = 읽기 가능
  AZ 1개 손실 = 쓰기 가능
```

### Aurora Replica 특징 (시험 매우 자주)

- **공유 스토리지** → Replica는 자체 사본 없음, Primary와 동일한 스토리지 읽기
- 복제 지연: **10~20ms** (RDS Read Replica의 수 초보다 훨씬 빠름)
- 최대 15개 Replica
- Failover 시 30초 이내 (Replica가 Primary 승격)

### Aurora Serverless v1 vs v2 (시험 신규)

| 항목 | v1 (레거시) | v2 (권장) |
|------|------------|-----------|
| 확장 단위 | ACU (Aurora Capacity Unit) | ACU |
| 확장 속도 | 분 단위 | **초 단위** |
| Min Capacity | 1 ACU | **0.5 ACU** (또는 0) |
| Max Capacity | 256 | 128 |
| 콜드 스타트 | 있음 | **거의 없음** |
| 멀티 AZ | 옵션 | 기본 |

> 💡 v2가 거의 모든 면에서 우월. 신규는 v2 권장. v1은 사실상 단종 절차.

### Aurora Global Database 디테일

- **Primary 리전 1개 + Secondary 리전 최대 5개**
- 복제 지연: 일반적으로 **1초 미만**
- 전용 복제 인프라 (스토리지 수준)
- Secondary는 읽기 전용
- **Cross-Region Failover**: RTO < 1분, RPO < 1초

### Aurora Backtrack (MySQL만)

- DB를 과거 시점으로 되돌리기 (스냅샷 복원 X)
- 최대 72시간 전까지
- 빠름 (수 분 → 수 초)
- 시나리오: "잘못 DROP TABLE 했어요" → Backtrack 가능

### Aurora Database Cloning

- 매우 빠른 클론 생성 (스토리지 공유 + COW)
- 사용: 개발·테스트 환경 빠르게 생성

### Aurora 엔드포인트 5종

| 엔드포인트 | 역할 |
|-----------|------|
| **Cluster Endpoint** (Writer) | Primary로만 |
| **Reader Endpoint** | 모든 Replica로 로드 분산 |
| **Custom Endpoint** | 지정한 Replica 그룹 (분석 워크로드 격리) |
| **Instance Endpoint** | 특정 인스턴스 직접 |
| **Aurora Global DB Writer** | 글로벌 DB Primary 리전 자동 라우팅 |

### Aurora Auto Scaling (Replica)

- CPU 또는 connection 기반
- 최대 15개까지 자동 추가
- ASG와 유사

### Aurora 비용 vs 성능

| 항목 | RDS MySQL | Aurora MySQL |
|------|-----------|--------------|
| 가격 | 표준 | **20% 더 비쌈** |
| 성능 | 1x | **최대 5x** |
| Replica | 5개 | **15개** |
| 스토리지 | 명시적 할당 | **자동 확장** |
| Failover | 1~2분 | **< 30초** |

### Backtrack vs PITR (시험 함정)

| 항목 | Backtrack | PITR |
|------|-----------|------|
| 새 DB 생성? | ❌ (in-place) | ✅ |
| 속도 | 매우 빠름 | 수 분 |
| 지원 | Aurora MySQL only | RDS + Aurora |
| 최대 기간 | 72시간 | 35일 |

### 관련 서비스 Cross-Reference

- **Aurora Global Database ↔ DynamoDB Global Tables** → 멀티 리전 비교
- **Aurora Serverless v2 ↔ Lambda** → 둘 다 자동 확장
- **Aurora Cluster Cloning ↔ S3 Same Account Replication** → 빠른 복제 패턴
- **Aurora MySQL ↔ DMS** → 마이그레이션

---

## 아키텍처 다이어그램

```
Aurora 전체 아키텍처
================================

[클라이언트]
      |
      +-- 쓰기 --> [Writer Endpoint]
      |                  |
      |            [Aurora Primary]
      |                  |
      +-- 읽기 --> [Reader Endpoint]
                        |
                 +------+------+
                 |      |      |
            [Read  [Read  [Read
           Replica] Replica] Replica]
                 
공유 분산 스토리지 (자동 확장)
[사본1][사본2][사본3][사본4][사본5][사본6]
 AZ-A   AZ-A   AZ-B   AZ-B   AZ-C   AZ-C
```

---

## ⭐ 핵심 포인트

1. ⭐ **Aurora 성능**: MySQL 5배, PostgreSQL 3배
2. ⭐ **6개 사본**: 3개 AZ, 4개 쓰기 확인, 3개 읽기 가능
3. ⭐ **스토리지**: 10GB ~ 128TB 자동 확장
4. ⭐ **Aurora Serverless**: 트래픽에 따라 자동 확장/축소
5. ⭐ **글로벌 DB**: 1초 미만 복제 지연, 재해 시 1분 내 Failover

---

## 📝 연습 문제

**문제 1.** Aurora가 데이터를 저장하는 방식은?

A) 단일 AZ에 1개 사본  
B) 3개 AZ에 6개 사본  
C) 2개 AZ에 2개 사본  
D) 단일 AZ에 3개 사본  

**정답: B** - Aurora는 3개 AZ에 6개의 사본을 자동으로 저장합니다.

---

**문제 2.** Aurora의 최대 Read Replica 수는?

A) 5개  
B) 10개  
C) 15개  
D) 20개  

**정답: C** - Aurora는 최대 15개의 Read Replica를 지원합니다.

---

**문제 3.** Aurora Serverless의 주요 사용 케이스는?

A) 항상 높은 트래픽이 예상될 때  
B) 간헐적이고 예측 불가능한 트래픽일 때  
C) 비용 절감이 필요할 때  
D) 다중 리전 서비스 구현 시  

**정답: B** - Aurora Serverless는 트래픽이 불규칙하거나 간헐적일 때 자동으로 확장/축소합니다.

---

**문제 4.** Aurora 글로벌 데이터베이스의 복제 지연은?

A) 수 초  
B) 수 분  
C) 1초 미만  
D) 실시간  

**정답: C** - Aurora 글로벌 데이터베이스는 1초 미만의 복제 지연을 제공합니다.

---

**문제 5.** Aurora Reader Endpoint의 역할은?

A) Primary 인스턴스에 연결  
B) 모든 Read Replica에 로드밸런싱  
C) 특정 인스턴스 그룹 지정  
D) 관리 작업 수행  

**정답: B** - Reader Endpoint는 모든 Read Replica에 자동으로 로드밸런싱합니다.

---

## 📌 오늘의 요약

1. Aurora: MySQL/PostgreSQL 호환, 5배/3배 성능, AWS 독자 개발
2. 스토리지: 3개 AZ에 6개 사본, 10GB~128TB 자동 확장
3. 엔드포인트: Writer(Primary), Reader(로드밸런싱), Custom 지원
4. Aurora Serverless: 트래픽에 따라 자동 확장, 간헐적 트래픽에 최적
5. 글로벌 DB: 1초 미만 복제, 재해 복구 시 1분 내 Secondary 승격
