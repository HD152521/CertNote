# Day 22 - S3: 버전 관리, 수명 주기 정책

📅 날짜: 2026년 6월 15일 (월요일)  
🎯 주제: S3 버전 관리 및 수명 주기  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- S3 버전 관리(Versioning)의 개념과 동작 방식을 이해한다
- 수명 주기 정책으로 스토리지 비용을 자동 최적화한다
- S3 복제(CRR/SRR)의 유형과 요구 사항을 이해한다

---

## 📖 이론 내용

### 1. S3 버전 관리 (Versioning)

버전 관리 활성화 시 객체의 모든 버전을 보존합니다.

**버전 관리 상태:**
- **미활성화**: 버전 없음 (기본)
- **활성화**: 모든 버전 보존
- **일시 중지**: 새 버전 생성 안 함, 기존 버전 유지

**⭐ 중요 동작:**
- 버전 관리 활성화 전 객체: 버전 ID = **null**
- 객체 삭제 시: **삭제 마커(Delete Marker) 추가** (실제 삭제 아님)
- 삭제 마커 삭제 시: 이전 버전 복원됨
- **버전 관리는 비활성화 불가, 일시 중지만 가능**

**삭제 마커 동작:**
```
PUT my-file.txt    → 버전 abc123 생성
PUT my-file.txt    → 버전 def456 생성 (최신)
DELETE my-file.txt → 삭제 마커 ghi789 추가 (최신)
GET my-file.txt    → 404 오류 (마커가 최신)
DELETE 마커(ghi789)→ def456 버전 복원
```

### 2. MFA 삭제 (MFA Delete)

- 버전 영구 삭제나 버전 관리 변경 시 MFA 필요
- **⭐ 루트 계정만 활성화/비활성화 가능**

### 3. S3 수명 주기 정책 (Lifecycle Policy)

시간이 지남에 따라 자동으로 스토리지 클래스 변경이나 삭제 수행합니다.

**전환 규칙 예시:**
```
생성 후 0일   → Standard
생성 후 30일  → Standard-IA
생성 후 90일  → Glacier Instant Retrieval
생성 후 365일 → Glacier Deep Archive
생성 후 730일 → 삭제
```

**만료 규칙:**
- 현재/이전 버전 삭제
- 완료되지 않은 멀티파트 업로드 정리
- 만료된 삭제 마커 삭제

### 4. S3 복제 (Replication)

**교차 리전 복제 (CRR)**: 재해 복구, 지연 시간 감소  
**동일 리전 복제 (SRR)**: 로그 집계, 환경 분리

**⭐ 복제 요구 사항:**
- 소스/대상 버킷 **모두 버전 관리 활성화** 필수
- 새 객체만 복제됨 (기존 객체는 S3 Batch Replication)
- 삭제 마커 복제는 선택 사항

---

## 🧠 알아두면 좋은 심화 이론

### 버전 관리 비용 함정 (실무 빈출)

- 모든 버전이 **각각 저장 비용** 발생
- 자주 변경되는 버킷은 비용 폭증 → 수명 주기 규칙으로 **이전 버전 자동 삭제** 필수
- 삭제 마커 자체도 객체로 카운트됨

```json
"NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
"AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
```

### 수명 주기 전환 규칙 (시험 함정 다수)

```
가능한 전환:
Standard → S-IA / Intelligent-Tiering / Glacier 계열
S-IA → Intelligent-Tiering / Glacier 계열
Intelligent-Tiering → Glacier 계열
Glacier IR / Flexible → Deep Archive

불가능한 전환:
S-IA → One Zone-IA (S-IA에서 One Zone-IA로만 직접 전환 가능 30일 후)
Glacier → Standard (역방향 전환은 복원만 가능)
Deep Archive → 그 외 (역방향 일체 불가, 복원만)
```

> ⚠️ **함정**: "Standard-IA → Intelligent-Tiering"은 가능. "Intelligent-Tiering → Standard"는 불가.

### Storage Class Analysis

- S3가 객체 접근 패턴 분석 → 어떤 객체를 IA로 옮길지 추천
- Standard / Standard-IA만 지원 (Glacier 분석 X)

### 복제 디테일 - 시험에 자주 출제

| 항목 | 내용 |
|------|------|
| 복제 트리거 | PUT (기본). 메타데이터/태그 변경도 옵션 |
| 복제 미대상 | SSE-C 암호화 객체, 일부 기존 객체 |
| 삭제 마커 복제 | 옵션 (기본 OFF, 활성화 시 양방향 위험) |
| 삭제 자체 복제 | ❌ — 데이터 보존 목적 |
| 양방향 복제 | 2019부터 지원 (활성/활성 시나리오) |
| 비용 | 데이터 복제·요청·교차 리전 데이터 전송 |
| 권한 | IAM 역할 + 소스에 GetObject, 대상에 ReplicateObject |

### Replication Time Control (RTC) - 보장 SLA

- 99.99%의 객체를 **15분 이내** 복제 보장
- 추가 비용 + Replication Metrics 자동 활성화
- 시험에 가끔: "복제 SLA가 필요한 시나리오" → RTC

### Cross-Account Replication

- 대상 버킷이 다른 계정에 있을 때 객체 소유권 변경 옵션 (대상 계정으로 이전)
- Object Ownership 설정 변경 → bucket-owner-full-control

### Object Lock - 규정 준수

- WORM (Write Once Read Many): 객체 보존 → 삭제·수정 불가
- 모드:
  - **Governance Mode**: IAM 권한 있으면 변경 가능
  - **Compliance Mode**: 누구도(root조차) 변경 불가, 지정 기간 종료까지
- **Legal Hold**: 기간 무관 보존 ↔ 명시적 해제 필요
- 활성화: **버킷 생성 시에만** 활성화 가능 (이후 추가 불가)

### S3 Inventory

- S3 객체 목록을 CSV/Parquet 형식으로 정기적으로 출력
- 빌링·감사·암호화 상태 확인용
- 시험 시나리오: "수십억 객체 메타데이터를 효율적으로 조사" → S3 Inventory + Athena

### S3 Batch Operations - 대량 작업

- 수십억 객체에 일괄 작업: 복사, 태그, ACL, 객체 잠금, Lambda 호출
- 입력: S3 Inventory 결과 또는 manifest
- 시험에 가끔: "기존 객체 1억 개 암호화 적용" → Batch Operations

### 관련 서비스 Cross-Reference

- **CRR + KMS Multi-Region Keys** → [Week 9 Day 1]
- **Object Lock + 컴플라이언스** → SEC, 금융
- **S3 Inventory + Athena** → 분석 워크플로
- **Batch Operations + Lambda** → 대량 마이그레이션

---

## 아키텍처 다이어그램

```
S3 버전 관리 동작
================================

PUT v1 → [파일, 버전: abc]
PUT v2 → [파일, 버전: def] ← 최신
DELETE → [마커, 버전: ghi] ← 최신 (파일 안 보임)
         [파일, 버전: def]
         [파일, 버전: abc]
마커 삭제 → [파일, 버전: def] ← 복원!

수명 주기 자동화
================================

Day 0     Standard
  |
  30일
  v
Day 30    Standard-IA      (비용 절감)
  |
  60일
  v
Day 90    Glacier           (장기 보존)
  |
  275일
  v
Day 365   Deep Archive      (최저 비용)
  |
  365일
  v
Day 730   삭제              (자동 정리)

CRR 구조
================================

[서울 버킷]
  업로드
    |
    | 자동 비동기 복제
    v
[버지니아 버킷]
  재해 복구용 복제본
```

---

## ⭐ 핵심 포인트

1. ⭐ **버전 관리 비활성화 불가**: 일시 중지만 가능
2. ⭐ **삭제 = 삭제 마커**: 실제 삭제가 아님, 이전 버전 보존
3. ⭐ **복제 요구사항**: 양쪽 버킷 모두 버전 관리 필수
4. ⭐ **기존 객체 복제**: S3 Batch Replication 사용
5. ⭐ **MFA Delete**: 루트 계정만 설정 가능

---

## 📝 연습 문제

**문제 1.** 버전 관리 활성화 시 객체 삭제하면?

A) 객체가 영구 삭제된다  
B) 삭제 마커가 추가되고 이전 버전 보존  
C) 최신 버전만 삭제된다  
D) 버킷이 잠긴다  

**정답: B** - 버전 관리 활성화 시 삭제는 삭제 마커를 추가하고 이전 버전들을 모두 보존합니다.

---

**문제 2.** S3 복제 필수 조건은?

A) 같은 리전에 있어야 함  
B) 소스/대상 버킷 모두 버전 관리 활성화  
C) 두 버킷의 이름이 같아야 함  
D) 같은 계정에 있어야 함  

**정답: B** - S3 복제는 소스/대상 버킷 모두 버전 관리 활성화가 필수입니다.

---

**문제 3.** MFA Delete를 설정할 수 있는 계정은?

A) 모든 IAM 사용자  
B) 관리자 IAM 사용자  
C) 루트 계정  
D) MFA가 활성화된 사용자  

**정답: C** - MFA Delete는 루트 계정만 활성화/비활성화 가능합니다.

---

**문제 4.** 기존 S3 객체를 복제하려면?

A) 버전 관리를 재활성화  
B) S3 Batch Replication  
C) 수명 주기 정책  
D) 수동으로 복사  

**정답: B** - 일반 복제는 새 객체만 적용됩니다. 기존 객체는 S3 Batch Replication을 사용해야 합니다.

---

**문제 5.** 버전 관리 일시 중지 상태에서 새 객체 업로드 시?

A) 버전 ID null로 저장  
B) 오류 발생  
C) 버전 ID 자동 생성  
D) 이전 버전에 덮어쓰임  

**정답: A** - 버전 관리 일시 중지 상태에서는 새 객체가 버전 ID null로 저장됩니다.

---

## 📌 오늘의 요약

1. 버전 관리: 모든 버전 보존, 삭제=삭제 마커, 비활성화 불가 (일시 중지만)
2. MFA Delete: 영구 삭제 방지, 루트 계정만 설정 가능
3. 수명 주기: 시간 기반 자동 스토리지 클래스 전환 및 삭제
4. CRR: 교차 리전 복제 (재해 복구), SRR: 동일 리전 복제 (로그 집계)
5. 복제 조건: 양쪽 버전 관리 필수, 기존 객체는 Batch Replication
