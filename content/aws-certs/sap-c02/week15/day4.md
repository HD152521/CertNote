# Day 74 - 미디어: 글로벌 스트리밍·CDN·실시간

📅 Week 15 (Day 4)
🎯 주제: 대용량 트래픽·라이브·VOD
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- 라이브·VOD 스트리밍 아키텍처
- 글로벌 CDN·DRM·트랜스코딩
- 비용·지연 최적화

---

## 📖 시나리오

> 글로벌 OTT. 라이브 스포츠 + VOD 카탈로그 50PB.
> 동시 시청자 500만. 4K HDR. DRM 필수.

### 요구사항

- 글로벌 사용자 지연 ↓
- 비용 ↓·트래픽 변동 큼
- DRM (Widevine·FairPlay·PlayReady)
- 실시간 추천

---

## 📖 솔루션

### 1. VOD 워크플로우

```
[원본 S3 (mezzanine)]
   │ EventBridge
   ▼
[MediaConvert] (HLS/DASH·다중 비트레이트·DRM)
   │
[S3 (출력)] → [CloudFront] → 시청자
```

- **MediaConvert** = 배치 트랜스코딩
- **MediaTailor** = 광고 삽입·SSAI
- **MediaPackage** = Packaging·DRM·Just-in-Time

### 2. 라이브 워크플로우

```
[Contributor Encoder] → [MediaLive] → [MediaPackage]
                                          │
                                  [CloudFront]
                                          ▼
                                    [Viewer]
```

- **MediaLive** = 라이브 인코딩
- **MediaPackage Live** = 패키징·DRM
- **MediaConnect** = 안전한 라이브 전송 (SRT·Zixi·RIST)

### 3. CDN

- **CloudFront**: 다중 Origin·Origin Shield·SignedURL/Cookie
- **Lambda@Edge / CloudFront Functions**: 인증·헤더 가공
- **Origin Failover** (S3 ↔ MediaStore)

### 4. DRM

- **AWS Elemental MediaPackage** + 외부 DRM Provider 통합

### 5. 실시간 추천

- **Kinesis Data Streams** (시청 이벤트)
- **Personalize** (실시간 개인화)
- **Lambda + DDB** (최근 시청)

### 6. 비용

- **S3 Intelligent-Tiering** (롱테일 콘텐츠 자동 Archive)
- **CloudFront Origin Shield** + Cache Hit ↑
- **Reserved Capacity** (MediaConvert·MediaConnect)
- **CloudFront 권역별 가격** + Price Class 200 (적절한 권역만)

---

## 🧠 함정 회피

- "라이브" = MediaLive + MediaPackage
- "VOD 트랜스코딩" = MediaConvert
- "광고 삽입" = MediaTailor (SSAI)
- "안전 라이브 입력" = MediaConnect
- "Signed URL" = CloudFront Signed URL/Cookie

---

## 🏗️ 라이브 아키텍처

```
[Stadium Camera]
   │ SRT/RTP
[MediaConnect] ─▶ [MediaLive] ─▶ [MediaPackage]
                                       │
                          [Origin Shield → CloudFront]
                                       │
                          [Lambda@Edge: Geo·Auth]
                                       ▼
                                  [Viewers Global]

[Kinesis Streams - 시청 이벤트] → [Personalize] → DDB
```

---

## ⭐ 핵심 포인트

1. ⭐ Live: MediaConnect → MediaLive → MediaPackage
2. ⭐ VOD: MediaConvert → S3 → CloudFront
3. ⭐ MediaTailor SSAI 광고
4. ⭐ CloudFront Origin Shield + Signed URL
5. ⭐ Personalize 실시간 추천
6. ⭐ S3 Intelligent-Tiering 롱테일

---

## 📝 연습 문제

**문제 1.** VOD 다중 비트레이트 트랜스코딩.

A) MediaLive
B) MediaConvert
C) MediaPackage
D) MediaConnect

**정답: B**

---

**문제 2.** 라이브 스포츠 인코딩.

A) MediaConvert
B) MediaLive
C) MediaTailor
D) MediaStore

**정답: B**

---

**문제 3.** 광고 동적 삽입.

A) Lambda@Edge
B) MediaTailor (SSAI)
C) MediaPackage
D) CloudFront

**정답: B**

---

**문제 4.** 권한 있는 사용자만 시청.

A) CloudFront Public
B) Signed URL/Cookie + OAC
C) WAF
D) Cognito만

**정답: B**

---

**문제 5.** 라이브 입력의 안전한 전송 (SRT).

A) MediaConvert
B) MediaConnect
C) MediaLive
D) MediaPackage

**정답: B**

---

**문제 6.** 시청 이벤트 → 실시간 추천.

A) DDB만
B) Kinesis Streams + Personalize (실시간)
C) Athena
D) Glue

**정답: B**

---

## 📌 오늘의 요약

1. Live = MediaConnect → MediaLive → MediaPackage
2. VOD = MediaConvert
3. MediaTailor = 광고
4. CloudFront + Signed + Origin Shield
5. Personalize 실시간 추천
