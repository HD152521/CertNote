# Day 23 - CloudFront 심화, Origin Failover, OAC

📅 날짜: Week 5 (Day 3)
🎯 주제: CDN으로 글로벌 성능·보안·비용 모두 최적
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudFront 핵심 기능(캐싱·압축·서명)을 안다
- OAI vs OAC 차이를 안다 (OAC 권장)
- Origin Failover·Origin Shield 패턴을 안다
- Lambda@Edge vs CloudFront Functions 선택 기준을 안다

---

## 🧩 사전 지식 (CS 기초)

- **CDN (Content Delivery Network)**: 엣지 캐시로 지연·서버 부하 감소.
- **Cache Hit Ratio**: 캐시 적중률. 80% 이상이 좋음.
- **TTL (Cache TTL)**: 객체 캐시 유지 시간.

---

## 📖 이론 내용

### 1. CloudFront 핵심 기능

- 400+ 엣지 로케이션
- HTTP/2·HTTP/3·Brotli·gzip 압축
- HTTPS·TLS 1.3
- 정적·동적 콘텐츠 모두 가속
- WAF·Shield 통합

### 2. Origin 종류

| Origin | 사용처 |
|--------|--------|
| **S3 Bucket** | 정적 콘텐츠 |
| **ALB/EC2/EKS** | 동적 |
| **API Gateway** | API |
| **MediaPackage** | 비디오 스트리밍 |
| **Custom HTTP** | 외부 |

### 3. OAI vs OAC (Origin Access)

| | OAI (Origin Access Identity) | OAC (Origin Access Control) |
|---|------------------------------|-----------------------------|
| 출시 | 구식 | 2022~ 권장 |
| S3 SSE-KMS | ✅ (서명 v4 미지원) | ✅ SigV4 |
| 모든 리전 | ✅ | ✅ (신규 리전 포함) |
| 권장 | ❌ | ✅ |

> 💡 **현재는 OAC가 표준**. OAI는 호환성 유지용.

### 4. Origin Failover

```
Origin Group
   ├── Primary: ALB-A (us-east-1)
   └── Secondary: ALB-B (us-west-2)

Health Check 실패 시 자동 전환
```

### 5. Origin Shield

- 추가 캐싱 계층 (특정 리전 1곳)
- Origin 부하 감소·Cache Hit Ratio ↑
- 비용 추가

### 6. Lambda@Edge vs CloudFront Functions

| | CloudFront Functions | Lambda@Edge |
|---|----------------------|-------------|
| 런타임 | 경량 JS | Node/Python |
| 시간 제한 | 1ms 미만 | 5초 (Origin)/뷰어 1초 |
| 메모리 | 2MB | 128MB~ |
| 비용 | 매우 저렴 | 더 비쌈 |
| 이벤트 | Viewer Request/Response | 4종 (Viewer/Origin × Req/Res) |
| 사용처 | URL Rewrite, 헤더 조작, 인증 | 동적 콘텐츠·외부 호출 |

### 7. Signed URL vs Signed Cookies

- **Signed URL**: 단일 파일 보호 (다운로드 링크)
- **Signed Cookies**: 다수 파일 보호 (미디어 스트리밍 전체)

### 8. Field-Level Encryption

- 폼 데이터 특정 필드만 추가 암호화
- PCI·민감 정보 (카드 번호) 보호

### 9. Geo Restriction

- 국가 허용·차단 리스트
- 컴플라이언스·라이선스

---

## 🧠 알아두면 좋은 심화 이론

### Real-time Logs

- CloudFront 실시간 로그를 Kinesis Data Streams로
- 분 단위 분석 가능

### Cross-Reference

- **Day 24**: Global Accelerator
- **Week 11**: WAF·Shield

---

## 🏗️ 아키텍처 다이어그램 — CloudFront + S3 + OAC

```
사용자 ──► CloudFront Edge
              │
              │  Cache Miss
              ▼
        Origin Shield (us-east-1)
              │
              ▼
        S3 Bucket (Private)
              │
        Bucket Policy: 오직 CloudFront OAC만 허용
        (aws:SourceArn = Distribution ARN)
```

---

## ⭐ 핵심 포인트

1. ⭐ **OAC가 표준** (OAI는 레거시)
2. ⭐ **Origin Failover**로 다중 리전 백업
3. ⭐ **CloudFront Functions = 경량·저비용**, Lambda@Edge = 풍부한 런타임
4. ⭐ **Signed Cookies로 다수 파일**, Signed URL은 단일
5. ⭐ Field-Level Encryption으로 민감 필드 추가 보호

---

## 💻 실제 예시 - CloudFront Function (URL Rewrite)

```javascript
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }
  return request;
}
```

---

## 📝 연습 문제

**문제 1.** CloudFront에서 S3 Private 버킷 접근. 최신 권장?

A) OAI
B) OAC
C) Bucket Public
D) Signed URL

**정답: B**
해설: OAC가 표준 (SSE-KMS·SigV4·신규 리전).

---

**문제 2.** Origin 부하를 줄이고 캐시 적중률 향상. Best?

A) TTL 0
B) Origin Shield
C) Lambda@Edge
D) Signed URL

**정답: B**
해설: Origin Shield가 추가 캐싱 계층.

---

**문제 3.** URL 경로 재작성, 매우 경량·고빈도. Best?

A) Lambda@Edge
B) CloudFront Functions
C) API Gateway
D) ALB Rule

**정답: B**
해설: CFF가 경량·저비용.

---

**문제 4.** Primary Origin 장애 시 자동으로 Secondary로. Best?

A) Route 53 Failover
B) CloudFront Origin Group (Failover)
C) WAF
D) Lambda

**정답: B**
해설: Origin Failover 표준.

---

**문제 5.** 동영상 스트리밍의 다수 파일 보호. Best?

A) Signed URL 파일마다
B) Signed Cookies
C) Bucket Public
D) IAM Role

**정답: B**
해설: 다수 파일 = Signed Cookies.

---

**문제 6.** 사용자 폼의 신용카드 번호 필드만 추가 암호화. Best?

A) HTTPS만
B) Field-Level Encryption
C) WAF
D) Macie

**정답: B**
해설: 특정 필드 추가 암호화 = FLE.

---

## 📌 오늘의 요약

1. OAC가 표준, OAI는 레거시
2. Origin Failover + Origin Shield로 가용성·캐시 향상
3. CFF는 경량 1ms, Lambda@Edge는 풍부
4. Signed URL 단일·Signed Cookies 다수
5. Geo Restriction·FLE·Real-time Logs 활용
