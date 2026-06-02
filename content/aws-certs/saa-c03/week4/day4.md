# Day 19 - CloudFront, OAC, Storage Gateway

📅 날짜: Week 4 (Day 4)
🎯 주제: CDN과 하이브리드 스토리지
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudFront 작동 원리(엣지 → 오리진)를 안다
- OAI / OAC 차이와 S3 보호 모범을 이해한다
- Storage Gateway 4가지 모드를 시나리오로 매핑한다

---

## 🧩 사전 지식 (CS 기초)

- **CDN(Content Delivery Network)**: 콘텐츠를 사용자 근처 엣지에 캐시 → 지연·대역 ↓.
- **TTL(Time To Live)**: 캐시 유효 시간.
- **오리진 실드(Origin Shield)**: 엣지 ↔ 오리진 사이에 추가 캐시 레이어.
- **하이브리드 스토리지**: 온프레미스 ↔ 클라우드를 캐시·게이트웨이로 잇기.

---

## 📖 이론 내용

### 1. CloudFront 핵심

- 엣지 로케이션(400+)에서 콘텐츠 캐시.
- 오리진: **S3 / ALB / NLB / EC2 / API GW / Lambda Function URL / On-prem(Custom)**.
- **HTTPS 강제, TLS 종료, SNI 지원**.
- **HTTP/2, HTTP/3(QUIC), gRPC** 지원.

### 2. 캐시 동작 (Cache Behavior)

- 패턴 매치(`/api/*`, `/static/*`)로 동작 분리.
- **Cache Policy**: TTL, 헤더/쿠키/쿼리 캐시 키.
- **Origin Request Policy**: 오리진에 어떤 헤더/쿠키 전달.
- **Response Headers Policy**: 보안 헤더(HSTS 등) 자동 부여.

### 3. OAI vs OAC (S3 보호)

- **OAI (Origin Access Identity)** — 레거시. CloudFront 전용 IAM 신원으로 S3 접근.
- **OAC (Origin Access Control)** — 신규 권장. SigV4, 모든 리전·KMS 지원.
- 둘 다 **S3 버킷은 사설**, CloudFront만 접근하게 한다.

### 4. 엣지 컴퓨팅

- **Lambda@Edge**: 4개 이벤트(viewer/origin request·response)에서 코드 실행. Node/Python.
- **CloudFront Functions**: 더 빠르고 더 싼 경량 JS. URL 재작성·헤더 조작.

### 5. 보안 부가 기능

- **WAF 통합** (글로벌).
- **Field-Level Encryption**: 카드 번호 같은 필드만 추가 암호화.
- **Signed URL / Signed Cookie**: 시간·IP·도메인 제한 콘텐츠 배포.
- **Geo Restriction**: 국가 차단.

### 6. Storage Gateway 4종

| 모드 | 프로토콜 | 사용 사례 |
|------|----------|-----------|
| **S3 File Gateway** | NFS/SMB → S3 | 온프레 백업/공유 |
| **FSx File Gateway** | SMB → FSx Windows | 분기 사무소 캐시 |
| **Volume Gateway** | iSCSI → S3 + EBS 스냅샷 | 블록 백업 |
| **Tape Gateway** | iSCSI VTL → S3/Glacier | 기존 백업 SW 호환 |

### 7. 비교: DataSync / DataSync Discovery / Storage Gateway / Snow

- **DataSync**: 일회·정기 마이그레이션·복제.
- **Storage Gateway**: 영구 하이브리드 액세스(캐시·NAS).
- **Snow Family**: 페타바이트급 오프라인 마이그레이션.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Origin Shield** | 한 리전을 추가 캐시 → cache hit ↑ + 오리진 부하 ↓ | 글로벌 트래픽 |
| **Origin Failover** | 1차 오리진 5xx → 2차로 자동 | DR |
| **Real-Time Logs** | Kinesis Data Streams로 즉시 로그 | 실시간 분석 |
| **Continuous Deployment** | 배포 비교(canary) | 새 기능 안전 배포 |
| **Functions URL + Lambda@Edge** | 가벼운 변환은 CF Functions | 비용/지연 ↓ |

> ⚠️ **함정**: "CloudFront + S3 정적 사이트"에서 S3 정적 호스팅 엔드포인트 사용 시 OAC 보호 효과가 약함 → REST 엔드포인트 사용 권장.

> 💡 **암기 팁**: 영상·정적 자산·HTTPS API 가속은 **CloudFront**. TCP/UDP 비-HTTP 가속은 **Global Accelerator**.

### 관련 서비스 Cross-Reference

- WAF·Shield → Week 8
- Route 53 → Week 11
- DataSync / Snow → Week 11

---

## 🏗️ 아키텍처 다이어그램

```
[ CloudFront + S3 + OAC ]

  Viewer → 가까운 Edge
                │
            (캐시 미스)
                ▼
         (선택) Origin Shield
                ▼
            Origin S3 (사설)
                ▲
            OAC + Bucket Policy
            (Principal: cloudfront.amazonaws.com,
             Condition: aws:SourceArn = distribution)

[ Storage Gateway ]

  온프레미스 → File Gateway (NFS/SMB 캐시)
              → S3 또는 FSx
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **OAC가 OAI를 대체** — 신규 권장. KMS·SigV4·모든 리전 지원.
2. ⭐ CloudFront는 **HTTP/HTTPS·gRPC** / Global Accelerator는 TCP/UDP.
3. ⭐ Storage Gateway는 영구 하이브리드, DataSync는 마이그레이션·복제, Snow는 오프라인 페타바이트.
4. ⭐ **Signed URL/Cookie**로 시간 제한 콘텐츠.
5. ⭐ **CloudFront Functions(가벼움) < Lambda@Edge(무거움)**.

---

## 💻 실제 예시 - AWS CLI

```bash
# CloudFront 배포 생성 (S3 + OAC)
aws cloudfront create-origin-access-control \
  --origin-access-control-config Name=site-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3

aws cloudfront create-distribution --distribution-config file://cf-config.json

# 버킷 정책 (OAC만 허용)
cat > bp.json <<EOF
{"Version":"2012-10-17","Statement":[{
  "Effect":"Allow",
  "Principal":{"Service":"cloudfront.amazonaws.com"},
  "Action":"s3:GetObject",
  "Resource":"arn:aws:s3:::site-bucket/*",
  "Condition":{"StringEquals":{"AWS:SourceArn":"arn:aws:cloudfront::111122223333:distribution/E123"}}
}]}
EOF
```

---

## 📝 연습 문제

**문제 1.** S3 정적 사이트를 외부에 노출할 때 가장 안전한 패턴:

A) S3 public + 정적 호스팅 B) CloudFront + OAC + 사설 S3 C) ALB + EC2 D) Direct S3 + Signed URL

**정답: B**.

---

**문제 2.** CloudFront에서 URL 리라이트만 빠르게 (JS):

A) Lambda@Edge B) CloudFront Functions C) API Gateway D) ALB Listener Rule

**정답: B**.

---

**문제 3.** 본사에서 자주 액세스하는 데이터를 S3에 백업하면서 NFS로 접근:

A) DataSync B) S3 File Gateway C) Snowball D) FSx Lustre

**정답: B**.

---

**문제 4.** 글로벌 트래픽 캐시 히트율을 더 높이고 오리진 부하를 줄이려면:

A) Origin Shield 활성 B) TTL을 0으로 C) WAF 켜기 D) Geo Restriction

**정답: A**.

---

**문제 5.** 100TB 오프라인 마이그레이션:

A) DataSync B) Storage Gateway C) Snowball Edge D) Direct Connect

**정답: C**.

---

## 📌 오늘의 요약

1. CloudFront는 HTTP/HTTPS·gRPC, GA는 TCP/UDP.
2. S3 보호는 OAC + 사설 버킷.
3. Functions(가벼움) vs Lambda@Edge(무거움).
4. Storage Gateway는 영구 하이브리드, DataSync는 마이그/복제, Snow는 오프라인 페타.
5. Signed URL/Cookie로 시간 제한 + IP 제한 콘텐츠.
