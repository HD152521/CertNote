# Day 20 - Week 4 종합 복습: S3·CloudFront·스토리지 패턴을 하나의 판단 체계로

Week 4는 AWS 스토리지 스택의 상위 계층을 다뤘다. S3의 내부 일관성 모델과 대규모 운영 패턴(Day 16), 8가지 스토리지 클래스와 수명 주기 정책의 경제학(Day 17), 접근 제어 5계층과 암호화 키 관리(Day 18), CloudFront 3계층 캐시 구조와 하이브리드 스토리지 패턴(Day 19). 이 네 주제는 시험에서 가장 자주 나오는 "데이터 스토리지" 도메인의 핵심이다.

오늘의 목표는 이것을 단순 암기가 아닌 **판단 체계**로 정리하는 것이다. "시나리오 키워드 → 설계 패턴 → 구체적인 서비스 선택"이라는 사고 흐름이 자동화되면, 처음 보는 시나리오에서도 답이 보인다.

## Week 4 핵심 개념의 연결 지도

네 가지 주제는 독립된 섬이 아니다. 데이터가 생성되고 소비되고 보호되고 만료되는 하나의 흐름 위에 놓여 있다.

```
[ 데이터 흐름과 Week 4 서비스 매핑 ]

온프레미스 데이터              글로벌 사용자
      |                             |
Storage Gateway ←────────────── CloudFront (CDN)
(File/Volume/Tape)               PoP → REC → Origin Shield
      |                             |
      └───────────→ S3 ←───────────┘
                   |  객체 스토리지 핵심
                   |
          ┌────────┴────────┐
        보안              비용
    BPA + Bucket         Lifecycle Policy
    Policy + KMS         (Hot→Warm→Cold→Ice)
    OAC + VPC EP         Intelligent-Tiering
```

데이터는 S3를 중심으로 흐른다. 왼쪽에서는 온프레미스 Storage Gateway가 하이브리드 브리지 역할을 하고, 오른쪽에서는 CloudFront가 글로벌 배포를 담당한다. 보안과 비용은 S3를 감싸는 두 가지 핵심 관심사다.

> 💡 **관련 이론**: 이 아키텍처는 데이터 메시(Data Mesh) 원칙 중 "데이터를 프로덕트로 취급하라(Data as a Product)"와 연결된다. S3를 중앙 데이터 레이크로 두고, 접근 패턴(온프레미스 연결, CDN 배포, 직접 API)별로 다른 인터페이스를 제공하되 데이터 원본은 하나로 유지한다. 이는 분산 시스템에서 Single Source of Truth를 유지하면서 다양한 소비 패턴을 지원하는 **CQRS(Command Query Responsibility Segregation)**와 유사한 사고다.

## 스토리지 클래스: 데이터 온도와 비용의 트레이드오프 요약

시험에서 스토리지 클래스 문제는 거의 항상 트레이드오프 판단이다. 다음 프레임워크로 접근하면 2-3초 안에 답이 나온다.

```
[ 스토리지 클래스 결정 트리 ]

접근 빈도 → 즉시 접근 필요 → 재생성 가능?
  │                │              │
  │             YES (즉시)      YES → One Zone-IA (AZ 장애 허용 시)
  │             :               NO  → Standard 또는 Standard-IA
  │
  ├─ 자주 (일/주) → Standard
  ├─ 가끔 (월) → Standard-IA (30일 최소, 128KB 최소)
  ├─ 분기 1회, 즉시 필요 → Glacier Instant Retrieval (90일 최소)
  ├─ 연 1-2회, 시간 여유 → Glacier Flexible (3-5시간 or 1-5분)
  ├─ 연 1회 미만, 12시간 OK → Glacier Deep Archive (180일 최소)
  └─ 패턴 모름 → Intelligent-Tiering (128KB 이상 객체)
```

**비용 함정 3가지**: 최소 보관 기간(Standard-IA: 30일, Glacier Instant/Flexible: 90일, Deep Archive: 180일)을 채우지 못하면 남은 기간을 청구. 최소 객체 크기(Standard-IA/One Zone-IA: 128KB). 미완료 멀티파트 업로드는 완료된 객체처럼 과금.

> 💡 **관련 이론**: 스토리지 클래스 선택은 정보이론의 **엔트로피(Entropy)** 개념과 연결된다. 접근 패턴이 예측 가능할수록(엔트로피 낮음) 수동 Lifecycle 정책이 최적화된다. 예측이 불가능할수록(엔트로피 높음) Intelligent-Tiering의 자동 분류가 전체 TCO를 낮춘다. Intelligent-Tiering의 모니터링 비용은 예측 불확실성에 대한 "정보 비용"이다.

> 📚 **사례**: Netflix는 전체 콘텐츠 카탈로그를 스토리지 클래스 계층으로 관리한다. 신작과 인기작은 Standard, 6개월 이상 된 덜 인기 있는 콘텐츠는 Standard-IA, 원본 마스터 파일은 Glacier Deep Archive. Lifecycle 정책으로 자동 전환하되, 콘텐츠가 다시 인기를 얻으면(시즌2 출시, 수상 등) S3 Batch Operations로 다시 Standard로 올린다. 이 패턴 하나로 연간 수천만 달러의 스토리지 비용을 절감한다.

## S3 보안: 5계층 평가와 키워드 매핑

보안 문제의 핵심은 "어느 계층에서 어떻게 차단/허용하는가"다.

| 키워드 | 정답 메커니즘 | 이유 |
|--------|------------|------|
| Public 버킷 노출 방지 | Block Public Access (4개 모두 활성) | 최후 안전장치, 명시적 Deny |
| 감사 로그 + 키 회전 | SSE-KMS + CloudTrail | KMS 호출이 CloudTrail에 기록 |
| 키 AWS에 두기 싫음 | SSE-C (고객 제공 키) | AWS가 키 보관 안 함 |
| 초고보안 (키도 AWS 밖) | CSE (클라이언트 측 암호화) | S3도 평문 못 봄 |
| KMS 비용 절감 | S3 Bucket Keys | KMS 호출 99% 감소 |
| VPC에서만 접근 허용 | VPC Gateway Endpoint + Endpoint 정책 | 인터넷 경로 제거 |
| 데이터 유출 방지 | Endpoint 정책: 승인된 버킷만 허용 | 다른 S3로 유출 차단 |
| CloudFront에서만 접근 | OAC + BPA 활성화 | 직접 S3 접근 차단 |
| 멀티 팀 prefix 분리 | S3 Access Points | 팀별 독립 정책 |
| 법적 삭제 금지 (날짜 모름) | Object Lock Legal Hold | 무기한, 별도 권한으로 해제 |
| 법적 삭제 금지 (날짜 있음) | Object Lock Compliance Mode | root도 삭제 불가 |
| 실수 삭제 방지 | S3 Versioning + MFA Delete | Delete Marker 생성 |
| HTTPS 강제 | 버킷 정책 Deny (aws:SecureTransport=false) | HTTP 요청 차단 |

> 💡 **관련 이론**: S3 접근 제어의 5계층 구조는 OSI 모델과 같은 **계층화 원칙**을 따른다. 각 계층은 독립적으로 동작하고, 하위 계층이 거부하면 상위 계층의 허용이 무효화된다. NIST SP 800-207 "Zero Trust Architecture"에서 말하는 "모든 요청을 잠재적으로 적대적으로 간주하고 매 요청마다 인증/인가"는 이 다층 구조로 구현된다. BPA가 첫 번째 검문소, SCP가 조직 경계, VPC Endpoint Policy가 네트워크 경계, IAM/Bucket Policy가 신원 기반 제어다.

> 🔍 **더 깊이**: 봉투 암호화(Envelope Encryption)에서 SSE-KMS의 "키가 KMS 밖으로 나오지 않는다"는 보장은 어떻게 이루어지는가. KMS의 HSM(Hardware Security Module)은 FIPS 140-2 Level 3 인증을 받은 하드웨어다. 마스터 키는 물리적으로 이 HSM 안에서만 존재한다. KMS의 `GenerateDataKey` API를 호출하면 HSM 내부에서 DEK(데이터 암호화 키)를 생성해, 평문 DEK와 마스터 키로 암호화된 DEK를 반환한다. 이후 마스터 키는 HSM 밖으로 절대 나오지 않으며, 암호화된 DEK만 저장된다. 이 구조가 키 탈취를 거의 불가능하게 만드는 핵심이다.

> ⚠️ **함정**: Object Lock Governance Mode와 Compliance Mode를 혼동하지 말 것. "누구도 삭제 불가"가 요건이면 Compliance Mode. Governance Mode는 `s3:BypassGovernanceRetention` 권한을 가진 IAM 사용자(root 포함)가 잠금 해제 가능하다. 시험에서 "규제 감사관 요건", "법적 보관", "root도 삭제 불가"가 나오면 Compliance Mode다.

## CloudFront: 캐시 계층과 엣지 컴퓨팅 선택 기준

CloudFront 관련 문제는 두 가지 패턴으로 나온다. "어느 계층에서 처리할 것인가"(캐시 계층)와 "어떤 엣지 컴퓨팅을 쓸 것인가"(Functions vs Lambda@Edge).

### 캐시 계층 최적화

```
[ 오리진 부하 최소화 설계 ]

목표: Origin 요청 수 최소화

계층 1: 캐시 키 최적화
  → 불필요한 헤더/쿠키를 캐시 키에서 제거
  → 같은 콘텐츠를 같은 캐시 항목으로 처리

계층 2: TTL 최적화
  → 정적 자산: 7일 이상 (버전된 파일명 사용)
  → 동적 API: TTL=0 (캐시 안 함)
  → 이미지: 1일-7일

계층 3: Origin Shield 활성화
  → 다중 리전 사용자 + 단일 오리진 구조
  → 모든 REC 캐시 미스가 Origin Shield로 집약
```

**Invalidation(캐시 무효화)**: 파일이 업데이트됐을 때 캐시를 강제 갱신. `/images/*`처럼 와일드카드 사용 가능. 첫 1,000개 경로/월은 무료, 이후 경로당 과금. 잦은 업데이트가 있는 경우 파일명에 버전/해시를 포함해 Invalidation 없이 새 캐시를 생성하는 전략이 더 효율적이다.

> 📚 **사례**: 2021년 Facebook의 DNS 장애가 6시간 동안 서비스를 중단시켰을 때, CloudFront를 CDN으로 사용하는 사이트들은 캐시 히트율이 높은 정적 콘텐츠에 대해서 오리진 장애와 무관하게 서비스를 계속 제공했다. CloudFront의 TTL 기반 캐시가 오리진 장애의 완충재 역할을 한 사례다. 단, TTL=0인 API 경로는 오리진 장애의 영향을 그대로 받았다.

### 엣지 컴퓨팅 선택 기준

| 요구사항 | CloudFront Functions | Lambda@Edge |
|--------|---------------------|------------|
| URL 재작성/리다이렉트 | ✅ (경량, 빠름) | 가능하나 과스펙 |
| 쿼리 파라미터 정규화 | ✅ | 가능하나 과스펙 |
| 단순 헤더 추가 | ✅ | 가능하나 과스펙 |
| JWT/외부 인증 서버 호출 | ❌ (외부 호출 불가) | ✅ |
| A/B 테스트 (DB 조회) | ❌ (DB 접근 불가) | ✅ |
| 이미지 변환 (Sharp 등) | ❌ (메모리/시간 부족) | ✅ |
| 오리진 응답 변환 | ❌ (Origin 이벤트 없음) | ✅ |

> 🔍 **더 깊이**: CloudFront Functions가 "외부 호출 불가"인 이유는 네트워크 제약뿐 아니라 **실행 시간 제약(1ms)** 때문이다. HTTP 외부 호출의 RTT가 최소 수십 ms이므로, 1ms 제약 안에서 완료할 수 없다. Lambda@Edge는 30초까지 실행 가능해 외부 API 호출이 가능하다. 그러나 Lambda@Edge는 Regional Edge Cache(13개 위치)에서 실행되므로 CloudFront Functions(400+ PoP)보다 지리적으로 사용자에서 멀다. 이것이 "가볍고 빠른 로직은 Functions, 무거운 로직은 Lambda@Edge"라는 원칙의 기술적 근거다.

## 하이브리드 스토리지 도구 선택: 세 서비스의 결정적 차이

| | DataSync | Storage Gateway | Snow Family |
|--|---------|----------------|-------------|
| **핵심 목적** | 이전/동기화 | 영구 하이브리드 | 오프라인 대량 이전 |
| **키워드** | "마이그레이션", "일회성 전송", "정기 동기화" | "로컬처럼 계속 사용", "캐시 동기화", "NFS/SMB 유지" | "네트워크 불충분", "페타바이트", "인터넷 없는 환경" |
| **오프라인** | 불가 | 불가 | 핵심 기능 |
| **실시간성** | 예약/실시간 | 지속적 캐시 동기화 | 해당 없음 |
| **Storage Gateway 세부** | - | S3 File GW (NFS/SMB→S3) / FSx File GW (SMB→FSx, AD) / Volume GW (iSCSI→EBS Snap) / Tape GW (VTL→S3/Glacier) | - |

**Tape Gateway가 존재하는 이유**: 세계에는 아직도 수십만 개의 물리 테이프 라이브러리가 동작 중이다. Veeam, Veritas NetBackup, IBM Spectrum Protect 같은 백업 소프트웨어는 수십 년의 역사를 가지며, 교체 비용과 재교육 비용이 막대하다. Tape Gateway는 이 소프트웨어들이 "테이프 라이브러리가 있다"고 착각하게 하면서 실제로는 AWS S3/Glacier에 저장한다. 물리 테이프의 관리 부담(테이프 교체, 오프사이트 보관, 테이프 열화)을 제거하면서 소프트웨어 마이그레이션은 나중으로 미룰 수 있다.

> 💡 **관련 이론**: Storage Gateway의 **로컬 캐시 계층**은 컴퓨터 메모리 계층 구조(Cache → RAM → Disk)의 동일한 원리다. 자주 접근하는 데이터(Hot)는 게이트웨이 로컬 디스크 캐시에, 덜 접근하는 데이터는 AWS S3/Glacier에. 80-20 법칙(전체 액세스의 80%가 20%의 데이터에 집중)이 적용되는 환경에서 로컬 캐시 크기를 전체 데이터의 20-30%로 설정하면 캐시 히트율이 높다.

## 통합 아키텍처 패턴 5가지

시험 시나리오에서 자주 나오는 5가지 패턴을 아키텍처로 정리한다.

**패턴 A: 글로벌 정적 웹 서비스 (가장 흔한 패턴)**
```
사용자 (글로벌)
  → CloudFront (HTTPS, Signed URL/Cookie, WAF)
      ├─ /static/* → S3 버킷 (BPA ON, OAC, SSE-KMS)
      │               Lifecycle: 90일→IA, 365일→Glacier
      ├─ /api/*    → ALB → ECS/EC2 (동적 처리)
      └─ /video/*  → CloudFront Signed Cookie (프리미엄 구독자)
```

**패턴 B: 규제 데이터 장기 보관**
```
데이터 생성 → S3 버킷 (SSE-KMS, Object Lock Compliance 7년)
           → Lifecycle: 즉시 Glacier Deep Archive
           → Versioning + MFA Delete
           → S3 Access Log → 다른 버킷 (감사용)
           → CloudTrail + KMS API → 감사 로그
```

**패턴 C: ML 학습 데이터 파이프라인**
```
온프레미스 서버 → DataSync → S3 (학습 데이터)
                              ↓ Lifecycle: 학습 후 Standard-IA
                              ↓ (FSx for Lustre 연동)
                           EC2 GPU 클러스터 → S3 (체크포인트)
                                           → S3 Object Lambda (데이터 증강)
```

**패턴 D: 온프레미스 하이브리드 파일 공유**
```
본사 (Windows AD 환경)
  └─ Storage Gateway FSx File Gateway
       ├─ 로컬 캐시 (자주 쓰는 파일, 즉시 응답)
       └─ Amazon FSx for Windows File Server (AD 통합)
            └─ Lifecycle: 오래된 파일 → S3 Intelligent-Tiering
```

**패턴 E: 멀티 팀 데이터 레이크**
```
S3 데이터 레이크 버킷 (SSE-KMS, BPA ON)
  ├─ Access Point: analytics-ap (VPC-analytics 전용)
  │   정책: s3:GetObject on /analytics/*
  ├─ Access Point: ml-ap (VPC-ml 전용)
  │   정책: s3:* on /ml-data/*
  └─ Access Point: data-eng-ap
      정책: s3:* on /* (데이터 엔지니어링 풀 접근)

버킷 정책: 직접 접근 Deny, Access Points만 허용
VPC Endpoint: 각 VPC → S3 (인터넷 우회)
```

> ⚠️ **함정 종합 7가지**
> 1. **Glacier에서 Lifecycle으로 Standard로 되돌리기 불가** — CopyObject로만 가능
> 2. **S3 버전 관리는 비활성화 불가, Suspended만 가능** — 재활성화 시 기존 버전 복구
> 3. **OAI는 SSE-KMS 버킷 지원 안 함** — OAC로 마이그레이션 필요
> 4. **Lambda@Edge 함수는 us-east-1에서만 생성** — 글로벌 배포는 CloudFront가 담당
> 5. **CloudFront Functions는 Viewer Request/Response만** — Origin 이벤트는 Lambda@Edge
> 6. **Storage Gateway Tape Gateway: 물리 테이프 교체 목적** — 온프레미스 백업 SW 유지
> 7. **Transfer Acceleration: 같은 리전 내에서는 효과 없거나 느릴 수 있음** — 대륙 간에서만 유효

## 비용 최적화 종합 체크리스트

SAA 시험의 비용 최적화 도메인(20% 비중)에서 스토리지 관련 문제는 이 체크리스트로 접근한다.

```
[ S3 비용 최적화 체크리스트 ]

□ gp2 → gp3 전환 검토 (Week 3 내용, EBS도 포함)
□ S3 미완료 멀티파트 업로드 정리 (Lifecycle: AbortIncompleteMultipartUpload 7일)
□ 버전 관리 버킷의 이전 버전 만료 정책 (NoncurrentVersionExpiration)
□ 90일+ 미접근 데이터 Glacier 전환 (Lifecycle Transition)
□ Intelligent-Tiering 적용 (패턴 예측 불가 + 128KB 이상 객체)
□ S3 Inventory + S3 Analytics로 미사용 데이터 식별
□ Storage Lens로 조직 전체 스토리지 패턴 파악
□ CloudFront 캐시 히트율 높여 오리진 GET 요청 수 감소
□ SSE-KMS → Bucket Keys 활성화 (KMS 비용 99% 감소)
□ Transfer Acceleration: 불필요하면 비활성화
```

> 📚 **사례**: Dropbox는 2016년 AWS에서 자체 데이터센터로 이전("Magic Pocket" 프로젝트)하기 전까지 S3를 기반으로 수억 명의 사용자 파일을 저장했다. 이 기간 동안 Dropbox가 적용한 S3 비용 최적화 패턴은 접근 빈도 기반 스토리지 클래스 분류, 멀티파트 업로드 최적화, CloudFront 통합으로 GET 요청 비용 절감이었다. 당시 S3 비용이 연간 수천만 달러 규모였고, 최적화 작업으로 30-40%를 절감했다고 공개됐다. 이 경험이 이후 "Exabyte-scale 스토리지를 어떻게 최적화할 것인가"라는 업계 논의의 시발점이 됐다.

## 주요 숫자 암기표

시험에서 자주 나오는 숫자들을 한 곳에 모았다.

| 항목 | 값 | 의미 |
|------|----|----- |
| S3 단일 PutObject 최대 | 5GB | 초과 시 멀티파트 필수 |
| S3 최대 객체 크기 | 5TB | 멀티파트 업로드 |
| 멀티파트 파트 수 | 최대 10,000 | 파트당 최소 5MB |
| S3 강한 일관성 도입 | 2020년 12월 | 이전은 Eventually Consistent |
| Standard-IA 최소 보관 | 30일 | 미만이면 30일치 청구 |
| Standard-IA 최소 객체 | 128KB | 미만이면 128KB로 청구 |
| Glacier Instant/Flexible 최소 | 90일 | |
| Glacier Deep Archive 최소 | 180일 | |
| Deep Archive Standard 검색 | 12시간 | |
| Deep Archive Bulk 검색 | 48시간 | |
| CRR RTC SLA | 15분 이내 99.99% | Replication Time Control |
| S3 성능 한도 | 3,500 PUT/5,500 GET (prefix당) | 자동 파티셔닝 (2018~ |
| CloudFront PoP 수 | 400+ | 글로벌 엣지 |
| CloudFront Functions 실행 시간 | 1ms 이내 | |
| Lambda@Edge 최대 실행 시간 | 30초 (Origin 이벤트) | |
| Presigned URL IAM 역할 최대 | IAM 세션 만료 시간 | 역할 세션 종료 시 무효 |
| Bucket Keys KMS 절감 | 최대 99% | |

---

## 📝 연습 문제

**문제 1.** 글로벌 미디어 회사가 S3에 저장된 4K 마스터 비디오를 전 세계 사용자에게 스트리밍한다. 다음 중 옳은 설계 조합은?

A) S3 Public 버킷 + CloudFront TTL=0 + Lambda@Edge 없음
B) S3 Private 버킷 + BPA 활성화 + CloudFront OAC + Signed Cookie + Origin Shield
C) S3 Public 버킷 + CloudFront OAI + Signed URL (파일별)
D) S3 Private 버킷 + Transfer Acceleration + Signed URL

**정답: B**
해설: S3는 Private 상태 유지(BPA 완전 활성화). CloudFront OAC로 S3에 안전하게 접근. Signed Cookie로 프리미엄 구독자가 수천 개 비디오 파일에 접근 가능(Signed URL은 파일별이라 수천 개 관리 불가). Origin Shield로 글로벌 REC들의 오리진 요청을 집약해 오리진 부하 감소. A는 S3 Public으로 누구나 직접 접근 가능. C의 OAI는 레거시이고 SSE-KMS 미지원. D는 Transfer Acceleration이 업로드 가속용이고 스트리밍에 불필요하다.

---

**문제 2.** 병원이 MRI 영상 데이터를 S3에 저장한다. 진료 후 6개월간 자주 접근하고, 이후 5년간 연 1-2회 즉시 접근이 필요하며, 7년 후 삭제한다. 최적의 수명 주기 정책은?

A) 즉시 Glacier Deep Archive → 7년 후 삭제
B) 0일: Standard → 180일: Glacier Instant Retrieval → 7년(2,555일): 삭제
C) 0일: Standard → 30일: Standard-IA → 180일: Glacier Instant → 7년: 삭제
D) 즉시 Intelligent-Tiering → 7년 후 삭제

**정답: C**
해설: 진료 후 6개월(180일)까지 자주 접근 → Standard 또는 Standard-IA(30일 이후). 6개월(180일) 이후 연 1-2회, 즉시 필요 → Glacier Instant Retrieval(검색 ms, 90일 최소 보관 충족). 7년(2,555일) 후 만료. B의 180일 Glacier Instant는 최소 보관 90일을 충족하지만, Standard에서 직접 Glacier Instant로 가는 최소 전환 기간은 90일이다. C가 Standard-IA를 중간에 추가해 비용을 더 최적화한다. D의 Intelligent-Tiering은 접근 패턴이 예측 가능한 경우 수동 Lifecycle이 더 저렴하다.

---

**문제 3.** SEC 규제에 따라 금융 거래 기록을 7년간 수정·삭제 불가로 보관해야 한다. AWS root 계정을 포함한 누구도 데이터를 삭제할 수 없어야 한다. 어떻게 구성하는가?

A) S3 Versioning + MFA Delete
B) S3 Object Lock Governance Mode, Retention Period 7년
C) S3 Object Lock Compliance Mode, Retention Period 7년
D) S3 Bucket Policy: Deny s3:DeleteObject for all principals

**정답: C**
해설: Compliance Mode는 설정 기간 동안 root 계정을 포함한 누구도 객체를 삭제하거나 잠금을 수정할 수 없다. SEC Rule 17a-4의 WORM(Write Once, Read Many) 요건을 충족하며 Cohasset Associates 인증을 받았다. Governance Mode는 `s3:BypassGovernanceRetention` 권한 보유자가 삭제 가능해 "누구도 불가" 요건을 충족하지 못한다. MFA Delete는 실수 방지이지 법적 WORM이 아니다. Bucket Policy Deny는 Policy 자체를 수정하면 우회 가능하다.

---

**문제 4.** 데이터 분석팀 EC2가 S3 데이터 레이크에서 민감한 고객 데이터를 처리한다. 보안팀은 두 가지를 요구한다: (1) 인터넷을 통한 S3 데이터 유출 방지, (2) 분석팀 EC2가 승인된 데이터 레이크 버킷 외 S3에 접근 불가. 어떻게 구성하는가?

A) EC2 IAM 역할에 특정 버킷만 허용하는 정책 + NAT Gateway
B) VPC Gateway Endpoint for S3 + Endpoint 정책(승인 버킷만) + S3 버킷 정책(해당 VPC Endpoint에서만 허용)
C) S3 버킷 BPA 활성화 + CloudFront OAC
D) AWS PrivateLink for S3 + Security Group 제한

**정답: B**
해설: VPC Gateway Endpoint는 인터넷 없이 S3에 직접 접근하는 경로를 제공(비용 없음). Endpoint 정책에서 승인된 버킷만 허용하면 다른 S3 버킷(다른 계정 포함)에 접근이 차단된다. S3 버킷 정책에서 `aws:SourceVpce` 조건으로 이 Endpoint만 허용하면 인터넷을 통한 접근도 차단된다. A는 NAT Gateway를 거치므로 인터넷을 통해 S3에 접근해 데이터 유출 가능성이 남는다. IAM 정책만으로는 Endpoint 외 경로를 막지 못한다. C는 정적 콘텐츠 배포 패턴이다.

---

**문제 5.** 온프레미스 공장의 생산 데이터가 SCADA 시스템에서 생성된다. 이 데이터를 실시간으로 AWS S3에 저장하고 싶지만, SCADA 시스템이 NFS 프로토콜만 지원한다. 공장 네트워크와 AWS는 Direct Connect로 연결되어 있다. 가장 적합한 솔루션은?

A) AWS DataSync 에이전트 설치
B) AWS Storage Gateway S3 File Gateway
C) Amazon S3 Transfer Acceleration
D) AWS Snow Family

**정답: B**
해설: S3 File Gateway는 온프레미스에 설치되어 NFS(또는 SMB) 마운트 포인트를 제공한다. SCADA 시스템이 NFS로 파일을 쓰면 File Gateway가 백그라운드로 S3에 동기화한다. "실시간으로 계속 사용"이 요건이므로 영구 하이브리드 운영인 Storage Gateway가 적합하다. DataSync는 일회성 또는 예약 마이그레이션/동기화용이고 실시간 NFS 마운트를 제공하지 않는다. Transfer Acceleration은 인터넷 기반 업로드 가속용으로 Direct Connect 환경에서 불필요하다. Snow Family는 오프라인 이전용이다.

---

**문제 6.** 전자상거래 회사가 상품 이미지를 CloudFront로 전 세계에 배포한다. 이미지 URL에 `?size=medium&format=webp` 쿼리 파라미터가 붙는데, 파라미터 순서가 클라이언트마다 달라서(`?format=webp&size=medium`) 같은 이미지가 다른 캐시 항목으로 저장된다. 캐시 히트율을 높이는 가장 비용 효율적인 방법은?

A) Lambda@Edge (Origin Request)로 쿼리 파라미터를 정렬
B) CloudFront Functions (Viewer Request)로 쿼리 파라미터를 정렬
C) ALB에서 쿼리 파라미터를 정규화
D) Cache Policy에서 쿼리 파라미터를 캐시 키에서 제외

**정답: B**
해설: 쿼리 파라미터를 알파벳순으로 정렬하는 것은 단순 문자열 조작으로 CloudFront Functions(1ms 이내, 2MB 메모리)로 충분하다. Viewer Request 이벤트에서 실행되어 400+ PoP에서 동작하고, Lambda@Edge 대비 약 1/6 비용이다. Lambda@Edge는 외부 호출이나 복잡한 로직이 필요 없는 경우 과스펙이다. D처럼 쿼리 파라미터를 캐시 키에서 제외하면 `?size=medium`과 `?size=large`가 같은 캐시를 반환해 잘못된 이미지가 전달된다.

---

**문제 7.** 스타트업이 S3에 사용자 파일을 저장한다. 초기에는 데이터가 적지만 3년 후 수백 TB 규모로 성장이 예상된다. 각 파일의 접근 빈도를 예측하기 어렵고, 팀이 작아 수동 수명 주기 관리 여력이 없다. 가장 적합한 스토리지 전략은?

A) 모든 파일을 Standard에 저장하고 나중에 Lifecycle 추가
B) Intelligent-Tiering 스토리지 클래스로 모든 파일 저장 + 미완료 멀티파트 정리 Lifecycle
C) Standard-IA로 바로 저장
D) Glacier Instant Retrieval로 저장

**정답: B**
해설: 접근 패턴 예측 불가 + 수동 관리 여력 없음 = Intelligent-Tiering. 자동으로 Frequent/Infrequent Access를 오가며 비용을 최적화하고, 검색 비용 없이 되돌아온다. 단, 미완료 멀티파트 업로드는 Intelligent-Tiering도 Standard처럼 과금되므로 `AbortIncompleteMultipartUpload: 7일` Lifecycle은 필수 추가 설정이다. A는 수동 추가를 잊을 위험이 있고 그동안 비용 낭비. C는 접근이 잦은 파일에서 검색 비용 발생. D는 ms 검색이 가능하지만 저장 비용이 Standard보다 싼 대신 잦은 접근 시 비용이 높다.

---

**문제 8.** 한 회사가 S3 버킷의 데이터를 KMS 키로 암호화한다(SSE-KMS). 데이터 분석 시스템이 초당 5,000개의 S3 객체를 읽어 KMS API 호출 비용이 예상보다 5배 높다. 암호화를 유지하면서 비용을 줄이는 방법은?

A) SSE-S3로 암호화 방식 변경
B) S3 Bucket Keys 활성화
C) 데이터를 복호화 후 캐시에 저장
D) KMS 키를 다른 리전에 생성

**정답: B**
해설: Bucket Keys는 KMS에서 Bucket Key(임시 키)를 생성해 S3 레벨에서 캐시한다. 모든 객체 요청마다 KMS를 호출하는 대신 Bucket Key로 DEK를 생성해 KMS 호출 수를 최대 99% 줄인다. SSE-KMS의 감사 추적(CloudTrail)과 키 관리 기능은 그대로 유지된다. A는 CloudTrail 감사 추적을 잃어 규정 준수 요건을 충족하지 못한다. C는 평문 데이터를 캐시에 두는 보안 위험이 있다. D는 리전이 달라도 KMS 호출 수 자체는 변하지 않는다.

---

**문제 9.** 다음 시나리오와 가장 적합한 솔루션을 연결하시오.

1. 온프레미스 Veritas NetBackup이 테이프 라이브러리로 데이터를 백업함. 물리 테이프를 없애고 싶지만 소프트웨어 교체는 불가.
2. 온프레미스 10TB 데이터를 S3로 일회성 이전. 1Gbps Direct Connect 연결 있음.
3. 온프레미스 NAS 서버 데이터를 직원들이 지사에서 S3처럼 계속 접근.
4. 오지 건설 현장에서 수집한 500TB 데이터를 AWS로 이전. 인터넷 없음.

A) Tape Gateway / B) DataSync / C) S3 File Gateway / D) Snowball Edge

**정답: 1-A, 2-B, 3-C, 4-D**
해설: 1. Tape Gateway는 iSCSI VTL로 기존 백업 소프트웨어를 속인다. 소프트웨어 교체 없이 S3/Glacier에 백업 저장. 2. DataSync는 Direct Connect를 통해 병렬 전송으로 빠르게 이전. 일회성 마이그레이션에 최적. 3. S3 File Gateway는 NFS 마운트를 제공해 직원들이 기존 파일 접근 방식 유지. 로컬 캐시로 빠른 접근. 4. Snowball Edge는 물리 디바이스로 데이터를 수집해 AWS 시설로 배송. 인터넷 없는 환경의 대용량 이전에 필수.

---

**문제 10.** 다음 중 CloudFront Distribution 설정에서 오류를 찾으시오. 팀이 S3 버킷을 OAC로 보호하고 CloudFront를 통해서만 접근 가능하게 설정하려 했다.

설정 내용:
- S3 버킷: BPA 비활성화
- CloudFront 오리진: S3 정적 웹사이트 엔드포인트 사용 (`bucket.s3-website-ap-northeast-2.amazonaws.com`)
- OAC: 설정됨
- 버킷 정책: CloudFront OAC Principal 허용

A) BPA를 비활성화한 것이 문제다
B) S3 정적 웹사이트 엔드포인트를 오리진으로 사용한 것이 문제다
C) OAC는 SSE-S3에서만 동작한다
D) 버킷 정책이 잘못됐다

**정답: A, B 모두 문제 (시험에서는 가장 큰 문제 하나를 고른다면 B)**
해설: OAC는 S3 REST 엔드포인트(`bucket.s3.region.amazonaws.com`)에서만 동작한다. S3 정적 웹사이트 엔드포인트를 오리진으로 사용하면 OAC가 동작하지 않아 인증 없이 접근이 가능해진다. 또한 BPA를 비활성화하면 버킷에 직접 Public 접근이 허용될 수 있다. 올바른 설정: S3 REST 엔드포인트를 오리진으로 사용 + OAC 설정 + BPA 완전 활성화 + 버킷 정책에 OAC Principal만 허용. 정적 호스팅 기능(인덱스 문서, 에러 페이지)이 필요하면 CloudFront `CustomErrorResponse`로 처리한다.

---

**문제 11.** 한 회사가 S3 버킷의 모든 데이터에 KMS 암호화를 적용하고, 암호화되지 않은 객체 업로드를 차단하고 싶다. 어떻게 구성하는가?

A) S3 버킷 기본 암호화를 SSE-KMS로 설정하면 자동으로 모든 객체가 암호화됨
B) S3 버킷 기본 암호화 SSE-KMS + 버킷 정책에 `s3:x-amz-server-side-encryption-aws:kms` 헤더 없는 요청 Deny
C) KMS 키 정책에서 암호화 없는 요청 거부
D) SCP로 암호화 없는 S3 PutObject 차단

**정답: B**
해설: S3 기본 암호화만 설정하면 암호화 없이 업로드한 객체도 자동으로 SSE-S3로 암호화된다(KMS가 아닌 S3 관리 키로). SSE-KMS를 강제하려면 버킷 정책에서 `x-amz-server-side-encryption` 헤더가 `aws:kms`가 아닌 요청을 Deny해야 한다. 이 정책 없이는 클라이언트가 SSE-S3나 암호화 없이 업로드해도 버킷이 이를 수락한다. A만으로는 SSE-KMS 강제가 되지 않는다.

---

**문제 12.** AWS Organizations 환경에서 100개 계정의 S3 데이터를 중앙에서 분석하고 싶다. 각 계정의 버킷 접근 패턴, 비용 최적화 기회, 보안 취약점을 한눈에 볼 수 있어야 한다. 가장 적합한 서비스는?

A) AWS Config + S3 규칙
B) Amazon Macie
C) S3 Storage Lens
D) AWS Cost Explorer + S3 태그

**정답: C**
해설: S3 Storage Lens는 AWS Organizations 전체의 S3 사용 패턴을 조직 단위로 분석하고, 버킷별 비용, 접근 패턴, 보안 수준을 대시보드로 제공한다. 자동화된 권장 사항(Glacier 전환 시 절감 가능 금액, 버전 관리 없는 버킷 등)도 포함한다. AWS Config는 규정 준수 확인이지 사용 패턴 분석이 아니다. Macie는 PII(개인 식별 정보) 탐지 도구다. Cost Explorer는 비용만 보여주고 S3 특화 접근 패턴 분석은 없다.
