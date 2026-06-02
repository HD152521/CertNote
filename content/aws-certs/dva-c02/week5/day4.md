# Day 24 - S3 성능, 멀티파트 업로드, 전송 가속화

📅 날짜: 2026년 6월 17일 (수요일)  
🎯 주제: S3 성능 최적화  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- S3 멀티파트 업로드의 동작 방식과 이점을 이해한다
- S3 전송 가속화(Transfer Acceleration)를 설명할 수 있다
- S3 Select로 데이터를 효율적으로 조회한다

---

## 📖 이론 내용

### 1. S3 성능 기본

**S3 요청 성능:**
- 접두사(prefix)당 초당 3,500 PUT/COPY/POST/DELETE
- 접두사당 초당 5,500 GET/HEAD
- 접두사가 다르면 성능 한도 별도 적용

**성능 최적화**: 다양한 접두사 사용
```
s3://bucket/2026/01/file.jpg    접두사 1
s3://bucket/2026/02/file.jpg    접두사 2
s3://bucket/images/file.jpg     접두사 3
```
각 접두사별로 3,500 PUT + 5,500 GET = 전체 처리량 증가

### 2. 멀티파트 업로드 (Multipart Upload)

대용량 파일을 여러 파트로 분할하여 병렬 업로드합니다.

**사용 기준:**
- **권장**: 100MB 이상
- **필수**: 5GB 이상 (단일 업로드 최대 5GB)

**동작 방식:**
```
1. CreateMultipartUpload → 업로드 ID 발급
2. UploadPart x N → 병렬 파트 업로드 (5MB~5GB/파트)
3. CompleteMultipartUpload → 합치기
```

**이점:**
- 실패 시 해당 파트만 재업로드
- 병렬 업로드로 속도 향상
- 네트워크 오류 내성

### 3. S3 전송 가속화 (Transfer Acceleration)

가장 가까운 엣지 로케이션으로 업로드 후 AWS 내부 네트워크로 S3 전달:

**URL 형식:**
```
일반: https://bucket.s3.amazonaws.com
가속: https://bucket.s3-accelerate.amazonaws.com
```

**사용 사례**: 전 세계 클라이언트 → 중앙 S3 버킷  
**비용**: 엣지 → S3 구간 추가 비용 발생

### 4. 바이트 범위 가져오기 (Byte-Range Fetches)

특정 바이트 범위만 요청:
- 큰 파일 병렬 다운로드
- 파일 헤더만 조회 (첫 수백 바이트)

### 5. S3 Select & Glacier Select

SQL로 객체 내 데이터 필터링:
- CSV, JSON, Parquet 지원
- **최대 400% 빠른 속도, 80% 비용 절감**

```sql
SELECT s.name FROM s3object s WHERE s.age > 20
```

---

## 🧠 알아두면 좋은 심화 이론

### 멀티파트 업로드 세부 규칙 (시험 빈출)

| 항목 | 값 |
|------|-----|
| 최소 파트 크기 | **5 MB** (마지막 파트는 예외) |
| 최대 파트 크기 | **5 GB** |
| 최대 파트 수 | **10,000개** |
| 최대 객체 크기 | **5 TB** |
| 멀티파트 권장 | 100 MB 이상 |
| 멀티파트 필수 | 5 GB 이상 (단일 PUT 한도) |

> ⚠️ **함정**: 완료 못 한 멀티파트는 **계속 저장됨 + 비용 발생**. 수명 주기 규칙으로 `AbortIncompleteMultipartUpload` 설정 필수.

### Multipart Upload 권한 (시험 가끔)

- `s3:PutObject` — 일반 업로드
- `s3:AbortMultipartUpload` — 미완료 정리
- `s3:ListBucketMultipartUploads` — 진행중 멀티파트 확인
- `s3:ListMultipartUploadParts` — 파트 확인

### Transfer Acceleration vs CloudFront vs Multi-Region Access Point

| 기능 | Transfer Acceleration | CloudFront | MRAP |
|------|----------------------|-----------|------|
| 가속 대상 | S3 업로드·다운로드 | 다운로드 캐싱 | 다중 리전 라우팅 |
| 작동 | 엣지 → AWS 내부망 → S3 | 엣지에 캐시 | 가장 가까운 리전 |
| 비용 | 추가 요금 | 캐시 비용 + 데이터 전송 | 리전 간 데이터 전송 |
| 사용 | 글로벌 사용자 → 단일 버킷 | 정적 콘텐츠 배포 | 글로벌 분산 데이터 |

### S3 처리량 상세

```
접두사당 한도:
  PUT/COPY/POST/DELETE: 3,500 RPS
  GET/HEAD: 5,500 RPS
  
접두사 분산 효과:
  10개 접두사 사용 → 35,000 PUT + 55,000 GET/s 가능
```

- 접두사는 **객체 키의 앞 부분**, 폴더 개념 아님
- 자동 파티셔닝: S3가 알아서 핫 파티션 분할 (수 분~수 시간 소요)

### S3 Select & Glacier Select 디테일

- **CSV, JSON, Parquet** 지원 (압축: GZIP, BZIP2)
- **간단한 SQL만** 지원 (JOIN, 집계 X — Athena 사용)
- 비용: 스캔한 GB + 반환한 GB
- 시험: "S3 객체에서 일부 컬럼만 빠르게 조회" → S3 Select

### Athena vs S3 Select - 비교 (시험 가끔)

| 항목 | S3 Select | Athena |
|------|-----------|--------|
| 범위 | 단일 객체 | 다중 객체·테이블 |
| SQL | 제한적 (WHERE만) | 완전 SQL (JOIN, GROUP BY) |
| 성능 | 빠름 (단일 객체) | Presto 기반 분산 |
| 비용 | 스캔량 | 스캔량 |

### CloudFront + S3 Origin Access Control (OAC) - 시험 빈출 변경 사항

| 항목 | Origin Access Identity (OAI - 레거시) | **Origin Access Control (OAC - 권장)** |
|------|--------------------------------------|----------------------------------------|
| 출시 | 2020 이전 | 2022 |
| SigV4 지원 | ❌ | ✅ |
| SSE-KMS 지원 | ❌ | ✅ |
| 도쿄·서울 등 모든 리전 | 부분 | ✅ |
| 권장 | ⚠️ 마이그레이션 | ✅ |

> 시험에 "CloudFront로 S3를 비공개 호스팅" → **OAC** 정답 (예전 자료는 OAI라 답함).

### 바이트 범위 가져오기 활용 패턴

```
1. 병렬 다운로드: 10GB 파일을 1GB씩 10개 스레드로
2. 헤더만 조회: Range: bytes=0-1023 (메타데이터·파일 타입 판별)
3. 부분 재다운로드: 중단된 다운로드 이어받기
```

### S3 Object Lambda (성능 관점)

- 클라이언트 GET 요청 → Object Lambda Access Point → Lambda 변환 → S3 GET → 응답
- 사용: 다양한 클라이언트에 다른 포맷 (압축/마스킹/형식 변환)
- 시험에 가끔: "원본은 한 번만 저장하고 다양한 뷰 제공" → Object Lambda

### 관련 서비스 Cross-Reference

- **CloudFront** → 정적 콘텐츠 캐시, OAC로 S3 비공개
- **Athena** → S3에 SQL 쿼리
- **Glue/Lake Formation** → 데이터 카탈로그
- **DataSync** → 대용량 데이터 이동 (온프레미스 ↔ S3)

---

## 아키텍처 다이어그램

```
멀티파트 업로드
================================

[10GB 파일]
    |
    | 분할 (각 파트 최소 5MB)
    v
[파트1][파트2][파트3]...[파트N]
    |       |       |
    v       v       v
   병렬 업로드 (여러 스레드)
    |
    v
[AWS S3 - CompleteMultipartUpload]
    |
    v
[단일 객체 완성]

전송 가속화
================================

[전 세계 클라이언트]
    |
    | 가장 가까운 엣지로
    v
[CloudFront 엣지 - 서울]
    |
    | AWS 내부 고속 네트워크
    v
[S3 버킷 - 버지니아]

vs 일반 업로드:
[클라이언트] --인터넷--> [S3 버지니아]
(지연 시간 높음)
```

---

## ⭐ 핵심 포인트

1. ⭐ **멀티파트 필수**: 5GB 이상, 권장 100MB 이상
2. ⭐ **접두사 성능**: 접두사당 PUT 3,500/s, GET 5,500/s
3. ⭐ **가속 URL**: .s3-accelerate.amazonaws.com
4. ⭐ **S3 Select**: SQL 필터링, 80% 비용 절감, 400% 빠름
5. ⭐ **바이트 범위**: 병렬 다운로드 또는 파일 일부만 조회

---

## 📝 연습 문제

**문제 1.** 단일 PUT으로 업로드 가능한 최대 S3 객체 크기는?

A) 100MB  
B) 1GB  
C) 5GB  
D) 5TB  

**정답: C** - 단일 PUT의 최대 크기는 5GB입니다. 초과 시 멀티파트 업로드가 필수입니다.

---

**문제 2.** 전 세계 클라이언트가 특정 리전 S3에 빠르게 업로드하려면?

A) 멀티파트 업로드  
B) S3 Transfer Acceleration  
C) CloudFront 배포  
D) 리전별 버킷  

**정답: B** - Transfer Acceleration은 엣지 로케이션 경유로 전 세계에서 S3로의 업로드를 가속합니다.

---

**문제 3.** S3 Select의 장점은?

A) 객체 암호화  
B) SQL로 필요한 데이터만 다운로드  
C) 멀티파트 자동화  
D) 버전 관리 자동화  

**정답: B** - S3 Select는 SQL 쿼리로 필요한 데이터만 추출하여 비용과 처리 시간을 절감합니다.

---

**문제 4.** 멀티파트 업로드에서 각 파트의 최소 크기는?

A) 1MB  
B) 5MB  
C) 10MB  
D) 100MB  

**정답: B** - 마지막 파트 제외 각 파트의 최소 크기는 5MB입니다.

---

**문제 5.** S3 접두사를 분산시키는 이유는?

A) 버전 관리를 쉽게 하기 위해  
B) 접두사당 한도가 있어 분산 시 처리량 향상  
C) 암호화 적용을 위해  
D) 수명 주기 정책 적용을 위해  

**정답: B** - S3는 접두사당 PUT 3,500/s, GET 5,500/s 한도가 있어 다양한 접두사를 사용하면 전체 처리량이 증가합니다.

---

## 📌 오늘의 요약

1. 멀티파트 업로드: 100MB+ 권장, 5GB+ 필수, 병렬 처리로 속도 향상
2. 전송 가속화: 엣지 경유 → AWS 내부망으로 전 세계 업로드 가속
3. 접두사 분산: 접두사당 PUT 3,500/s, GET 5,500/s 한도 독립 적용
4. S3 Select: SQL 필터링으로 80% 비용 절감, 400% 처리 속도 향상
5. 바이트 범위: 병렬 다운로드 또는 파일 헤더만 조회에 활용
