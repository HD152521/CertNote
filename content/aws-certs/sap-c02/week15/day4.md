# Day 4 - 미디어: 글로벌 스트리밍·CDN·실시간 — 스트리밍 프로토콜의 진화, CDN 캐싱의 물리학, DRM의 암호 체계

2007년 넷플릭스가 DVD 우편 배송에서 스트리밍으로 전환을 발표했을 때, 인터넷으로 영화를 보는 일은 버퍼링 지옥이었다. 판도를 바꾼 것은 2009년 Apple이 표준화한 **HLS(HTTP Live Streaming)**였다 — 영상을 작은 조각(segment)으로 쪼개 일반 HTTP로 전송하고, 네트워크 상태에 따라 화질을 실시간으로 바꾸는(adaptive bitrate) 방식이다. 이로써 스트리밍은 특수 프로토콜·전용 서버를 버리고 **거대한 CDN 인프라 위에 올라탈** 수 있게 됐다. 넷플릭스가 2016년 자체 데이터센터를 닫고 AWS로 완전 이전한 사건은, 미디어가 클라우드·CDN 위에서 글로벌 규모로 작동함을 증명했다.

오늘 시나리오는 글로벌 OTT다. 라이브 스포츠 + VOD 카탈로그 50PB, 동시 시청자 500만, 4K HDR, DRM 필수, 실시간 추천. 이 부하 프로파일은 다른 도메인과 완전히 다르다 — **대역폭이 곧 비용**이고, **지연이 곧 이탈**이며, 라이브는 단 한 번뿐이라 재시도가 없다. SAA라면 "CloudFront 쓰세요"지만, Pro는 **트랜스코딩·패키징·DRM·SSAI 광고·엣지 캐싱·실시간 추천**이 한 파이프라인으로 엮인 설계를 요구한다. 오늘은 스트리밍 프로토콜이 어떻게 진화했는지, CDN 캐싱이 어떤 물리학으로 비용을 줄이는지, 그리고 DRM의 암호 체계를 깊이 분해한다.

## 스트리밍 프로토콜 — 왜 HTTP 위에서 작동하나

과거 스트리밍은 RTMP·RTSP 같은 전용 프로토콜과 전용 스트리밍 서버를 썼다. 문제는 이게 방화벽·프록시·CDN과 안 맞고, 확장이 어려웠다는 것이다. **HLS와 DASH(Dynamic Adaptive Streaming over HTTP)**는 이를 뒤집었다 — 영상을 수 초 단위 세그먼트로 쪼개 **일반 HTTP 객체로 전송**한다. 그래서 CDN의 일반 캐싱 인프라를 그대로 쓸 수 있고, 무한히 확장된다.

> 💡 **관련 이론**: 핵심은 **ABR(Adaptive Bitrate Streaming)** — 같은 영상을 여러 화질(예: 240p~4K)로 미리 인코딩해 두고, 플레이어가 네트워크 대역폭을 측정해 세그먼트마다 적절한 화질을 고른다. 이것이 트랜스코딩이 여러 비트레이트를 만드는 이유다. 매니페스트 파일(.m3u8/HLS, .mpd/DASH)이 화질별 세그먼트 목록을 담고, 플레이어가 이를 읽어 동적으로 전환한다. 2018년 MPEG는 HLS·DASH의 포맷 파편화를 줄이려 **CMAF(Common Media Application Format)**를 표준화해, 하나의 세그먼트를 HLS·DASH 양쪽이 공유하게 했다 — 스토리지·캐시 비용이 절반으로 준다. 시험에서 "HLS와 DASH를 모두 지원하되 스토리지 중복 제거"가 보이면 CMAF 개념이다.

> 🔍 **더 깊이**: AWS Elemental의 미디어 서비스는 이 파이프라인을 단계별로 분담한다 — **MediaConvert**는 VOD(파일 기반) 트랜스코딩(다중 비트레이트·DRM), **MediaLive**는 라이브 인코딩, **MediaPackage**는 **패키징(just-in-time packaging)·DRM·매니페스트 생성**, **MediaTailor**는 광고 삽입, **MediaConnect**는 라이브 입력의 안전한 전송이다. 핵심 구분은 **인코딩(픽셀을 압축)과 패키징(포맷·DRM·매니페스트로 감싸기)이 분리**됐다는 것 — MediaLive가 인코딩하면 MediaPackage가 그 출력을 HLS·DASH로 패키징하고 DRM을 입힌다. 시험은 이 역할 분담을 노린다: "VOD 다중 비트레이트"=MediaConvert, "라이브 인코딩"=MediaLive, "패키징·DRM·JIT"=MediaPackage, "광고 삽입"=MediaTailor, "안전한 라이브 입력 전송(SRT/Zixi)"=MediaConnect.

## CDN 캐싱의 물리학 — 비용과 지연을 동시에

500만 동시 시청자에게 4K를 직접 origin에서 서빙하면 origin이 즉사하고 대역폭 비용이 폭발한다. **CloudFront**가 전 세계 엣지에 콘텐츠를 캐싱해 (1) 사용자에게 가까운 곳에서 서빙해 지연을 줄이고, (2) origin 요청을 막아 부하와 비용을 줄인다. 핵심 지표는 **캐시 적중률(cache hit ratio)** — 적중률이 높을수록 origin이 덜 일하고 비용이 준다.

> 💡 **관련 이론**: 미디어 캐싱이 잘 먹히는 이유는 콘텐츠 인기 분포가 **롱테일(파레토/지프 법칙)**을 따르기 때문이다 — 소수의 인기 콘텐츠가 트래픽의 대부분을 차지한다. 인기 세그먼트는 엣지 캐시에 상주해 높은 적중률을 내고, 비인기(롱테일)는 가끔만 origin을 친다. 그러나 엣지가 218곳이라 각 엣지가 개별적으로 origin을 치면 origin은 여전히 수백 번 같은 요청을 받는다. 이를 막는 것이 **Origin Shield** — 엣지와 origin 사이에 중간 캐시 계층을 둬, 모든 엣지의 miss를 한 곳으로 모아 origin엔 단 한 번만 요청이 가게 한다(request collapsing). 시험에서 "origin 부하 추가 감소·캐시 적중률 향상"이 보이면 Origin Shield다.

> 🔍 **더 깊이**: 라이브 스트리밍의 캐싱은 까다롭다 — 세그먼트는 계속 새로 생기고 매니페스트는 수 초마다 갱신된다. 그래서 세그먼트(불변)는 길게 캐싱하되 매니페스트(가변)는 짧은 TTL로 캐싱한다. 또 라이브는 **수백만 명이 같은 순간에 같은 새 세그먼트를 요청**하는 thundering herd가 발생하는데, Origin Shield의 request collapsing이 이를 단일 origin 요청으로 합쳐 origin(MediaPackage)을 보호한다. 시험에서 "라이브 동시 시청자 폭증 시 origin 보호"가 보이면 Origin Shield + 적절한 TTL 분리다.

> ⚠️ **함정**: CloudFront 비용을 줄이려 **Price Class**를 잘못 쓰면 함정이다. Price Class 200/100은 비싼 권역(남미·호주 등)의 엣지를 제외해 비용을 줄이지만, 그 권역 사용자는 더 먼 엣지로 라우팅되어 지연이 커진다. "모든 지역에 최저 지연"이 요구면 All(전체), "특정 권역만 서비스·비용 우선"이면 Price Class 200/100이다. 시험에서 "글로벌 균일 저지연"과 "비용 우선·일부 권역만"을 구분해 묻는다.

## DRM — 콘텐츠를 암호로 가두기

4K 콘텐츠는 비싸고, 불법 복제 방지가 계약상 필수다. **DRM(Digital Rights Management)**은 콘텐츠를 암호화하고, 정당한 권한이 있는 기기에만 복호화 키를 발급한다. 업계엔 플랫폼별로 3대 DRM이 있다 — **Widevine**(Google/Android·Chrome), **FairPlay**(Apple), **PlayReady**(Microsoft). 하나의 콘텐츠를 세 DRM 모두로 보호해야 모든 기기를 커버한다.

> 💡 **관련 이론**: DRM의 기반은 브라우저 표준인 **EME(Encrypted Media Extensions)**와 **CENC(Common Encryption, ISO/IEC 23001-7)**다. CENC는 하나의 암호화된 콘텐츠를 여러 DRM 시스템이 공유할 수 있게 표준화한 것 — 콘텐츠를 한 번 AES로 암호화하고, 각 DRM은 자기 방식으로 그 키를 라이선스 서버에서 기기로 전달한다. 그래서 콘텐츠를 세 번 암호화하지 않고 한 번만 암호화해 세 DRM이 공유한다(CENC 덕분). MediaPackage(또는 MediaConvert)가 이 멀티 DRM 암호화를 수행하고, 실제 키 관리·라이선스 발급은 SPEKE(Secure Packager and Encoder Key Exchange) 표준으로 외부 DRM 제공자(예: Axinom·Irdeto)와 연동한다. 시험에서 "Widevine·FairPlay·PlayReady 동시 보호"가 보이면 MediaPackage + 외부 DRM(SPEKE) 통합이다.

> 🔍 **더 깊이**: DRM이 콘텐츠 자체를 암호화한다면, **Signed URL/Cookie**는 **접근 자체를 인가**한다 — 둘은 보완 관계다. DRM은 "복호화 권한", Signed URL은 "이 URL에 접근할 권한"을 다룬다. 유료 구독자만 스트림 URL에 접근하게 하려면 CloudFront **Signed URL**(개별 파일) 또는 **Signed Cookie**(여러 파일·세션)를 쓴다. 동영상은 수백 개 세그먼트로 이뤄지므로 보통 **Signed Cookie**가 적합하다(URL마다 서명할 필요 없이 세션 단위 인가). 시험에서 "권한 있는 구독자만 시청·다수 세그먼트"가 보이면 Signed Cookie + OAC다.

> 📚 **사례**: 2022년 슈퍼볼·월드컵 같은 대형 라이브 이벤트에서 여러 스트리밍 서비스가 동시 접속 폭증으로 버퍼링·장애를 겪었다. 라이브는 VOD와 달리 **재시도·사전 캐싱이 불가능**하고 단 한 번의 순간에 모든 부하가 몰린다. 교훈은 (1) Origin Shield로 origin 보호, (2) 사전 부하 테스트(load test)로 capacity 검증, (3) MediaLive의 **입력 이중화(input redundancy)와 파이프라인 이중화**로 인코더 장애 대비다. MediaLive는 두 개의 독립 파이프라인을 동시에 돌려 하나가 죽어도 끊김 없이 전환한다. 시험에서 "라이브 인코딩 장애에도 무중단"이 보이면 MediaLive 파이프라인 이중화 + MediaConnect 입력 이중화다.

## VOD vs 라이브 — 두 파이프라인의 차이

| 측면 | VOD | 라이브 |
|------|-----|--------|
| **인코딩** | MediaConvert(배치) | MediaLive(실시간) |
| **입력** | S3 mezzanine 파일 | MediaConnect(SRT/Zixi/RIST) |
| **재시도** | 가능(파일이 영구 존재) | 불가(단 한 번) |
| **캐싱** | 길게(불변 세그먼트) | 짧게(매니페스트 가변) |
| **트리거** | EventBridge(S3 업로드) | 상시 가동 채널 |
| **핵심 리스크** | 트랜스코딩 비용·시간 | 인코더 장애·thundering herd |

> 🎯 **시나리오**: "한 OTT가 라이브 스포츠를 송출한다. 경기장 카메라에서 AWS까지 공용 인터넷으로 안전하게 전송하고, 인코더 장애에도 끊기면 안 되며, 500만 동시 시청자의 origin 부하를 막아야 한다. 파이프라인은?" — 답: **MediaConnect(SRT, 입력 이중화) → MediaLive(파이프라인 이중화) → MediaPackage(패키징·DRM) → Origin Shield → CloudFront**. MediaConnect의 **SRT**는 공용 인터넷에서 패킷 손실을 복구하며 안전하게 전송하고, MediaLive의 이중 파이프라인이 인코더 장애를 흡수하며, Origin Shield가 동시 폭증을 단일 origin 요청으로 합친다. 시험에서 "공용망 안전 라이브 전송 + 무중단 + origin 보호"의 전 구간이 보이면 이 조합이다.

## 실시간 추천 — 스트리밍 옆의 데이터 파이프라인

시청 이벤트로 실시간 개인화를 하려면 **Kinesis Data Streams**(시청 이벤트 수집) → **Amazon Personalize**(실시간 추천) + **Lambda/DDB**(최근 시청 상태)를 쓴다. 핵심은 **실시간 vs 배치 추천**의 구분이다.

> 🔍 **더 깊이**: Personalize는 배치 추천(미리 계산)과 실시간 추천(이벤트 기반 즉시 갱신) 둘 다 지원한다. 사용자가 방금 본 콘텐츠를 즉시 반영하려면 **이벤트 추적기(event tracker)**로 실시간 이벤트를 넣고 GetRecommendations를 호출한다 — Kinesis가 이벤트 스트림을 받아 Personalize로 흘린다. 배치(예: 야간 일괄 추천 이메일)는 Kinesis 없이 S3 데이터로 한다. 시험에서 "방금 본 영상을 즉시 추천에 반영"이 보이면 Kinesis + Personalize 실시간(이벤트 추적기), "야간 일괄"이면 배치다.

## 비용 최적화 — 50PB와 대역폭

50PB VOD 카탈로그의 대부분은 롱테일(거의 안 봄)이다. **S3 Intelligent-Tiering**이 접근 패턴을 모니터링해 안 보는 콘텐츠를 자동으로 저렴한 계층(Archive)으로 내려 스토리지 비용을 줄인다. 대역폭은 Origin Shield로 cache hit를 올려 origin 전송·요금을 줄이고, MediaConvert·MediaConnect는 **예약 용량(Reserved)**으로 안정적 워크로드의 단가를 낮춘다.

> ⚠️ **함정**: 50PB를 모두 S3 Standard에 두면 스토리지 비용이 막대하지만, 롱테일을 무작정 Glacier로 내리면 **인기 부활 시 복원 지연**(Glacier는 분~시간)이 시청 경험을 망친다. **Intelligent-Tiering**은 접근이 다시 늘면 자동으로 빠른 계층으로 올려, 수동 라이프사이클의 위험을 없앤다. 시험에서 "접근 패턴 예측 불가·자동 비용 최적화"가 보이면 Intelligent-Tiering이다(수동 lifecycle은 패턴이 예측 가능할 때).

## 정리하며

미디어 스트리밍은 **대역폭=비용, 지연=이탈, 라이브=일회성**이라는 제약 위에서, 인코딩(MediaConvert/MediaLive) → 패키징·DRM(MediaPackage) → 엣지 캐싱(CloudFront + Origin Shield) → 인가(Signed Cookie) → 실시간 추천(Kinesis + Personalize)을 한 파이프라인으로 엮는다. 핵심 통찰은 (1) HLS/DASH가 스트리밍을 일반 HTTP·CDN 위에 올렸고, (2) 인코딩과 패키징은 분리됐으며, (3) CENC 덕에 한 번 암호화로 멀티 DRM을 커버하고, (4) Origin Shield가 thundering herd를 단일 요청으로 합친다는 것이다.

SAP 시험 단골 매핑: (1) "VOD 다중 비트레이트 트랜스코딩" → **MediaConvert**, (2) "라이브 인코딩" → **MediaLive(파이프라인 이중화)**, (3) "패키징·DRM·JIT" → **MediaPackage**, (4) "광고 동적 삽입(SSAI)" → **MediaTailor**, (5) "공용망 안전 라이브 입력(SRT)" → **MediaConnect(입력 이중화)**, (6) "권한 구독자만·다수 세그먼트" → **Signed Cookie + OAC**, (7) "Widevine·FairPlay·PlayReady 동시" → **MediaPackage + SPEKE 외부 DRM**, (8) "origin 부하 추가 감소·thundering herd" → **Origin Shield**, (9) "방금 본 영상 즉시 추천" → **Kinesis + Personalize 실시간**, (10) "롱테일 자동 비용 최적화" → **S3 Intelligent-Tiering**, (11) "HLS·DASH 스토리지 중복 제거" → **CMAF**. 다음 day는 Week 15의 종합 — 정부·헬스케어 컴플라이언스와 전 케이스 통합 모의고사다.

---

## 📝 연습 문제

**문제 1.** 한 OTT가 업로드된 VOD 원본을 여러 화질(ABR)로 트랜스코딩하고 DRM을 입혀 HLS/DASH로 출력하려 한다. 가장 적합한 서비스는?

A) MediaLive

B) MediaConvert

C) MediaPackage

D) MediaConnect

**정답: B**

해설: **MediaConvert**는 파일 기반(VOD) 배치 트랜스코딩 서비스로, 하나의 원본을 다중 비트레이트(ABR)로 인코딩하고 HLS/DASH 패키징과 DRM을 적용한다. A의 MediaLive는 **라이브** 실시간 인코딩용이다. C의 MediaPackage는 패키징·DRM·JIT를 담당하지만 트랜스코딩 자체는 하지 않는다(인코더 출력을 패키징). D의 MediaConnect는 라이브 입력 전송이다. 함정: "VOD 다중 비트레이트 트랜스코딩"은 MediaConvert, "라이브 인코딩"은 MediaLive다.

---

**문제 2.** 경기장 카메라에서 AWS까지 공용 인터넷으로 라이브 피드를 패킷 손실 복구와 함께 안전하게 전송해야 한다. 가장 적합한 서비스·프로토콜은?

A) MediaConvert

B) MediaConnect (SRT/Zixi/RIST)

C) MediaLive

D) MediaPackage

**정답: B**

해설: **MediaConnect**는 라이브 비디오의 안전한 전송 전용 서비스로, **SRT·Zixi·RIST** 같은 프로토콜로 공용 인터넷의 패킷 손실을 복구하며 신뢰성 있게 전송한다. 입력 이중화로 전송 경로 장애도 대비한다. A는 VOD 트랜스코딩, C는 라이브 인코딩, D는 패키징으로 모두 전송이 주 역할이 아니다. 함정: "공용망 안전 라이브 전송(SRT)"은 MediaConnect다.

---

**문제 3.** 라이브 스포츠에서 인코더(파이프라인) 장애가 발생해도 시청이 끊기지 않아야 한다. 가장 적합한 구성은?

A) MediaConvert 인스턴스 2개

B) MediaLive 파이프라인 이중화(redundant pipelines)

C) CloudFront 다중 origin

D) S3 Cross-Region Replication

**정답: B**

해설: **MediaLive**는 두 개의 독립 파이프라인을 동시에 돌려, 하나가 장애가 나도 다른 파이프라인이 끊김 없이 출력을 이어가는 **파이프라인 이중화**를 제공한다. 라이브는 재시도가 불가능하므로 인코딩 단계의 이중화가 무중단의 핵심이다. A의 MediaConvert는 라이브용이 아니다. C는 origin 가용성이지 인코더 장애를 직접 해결하지 않는다. D는 VOD 스토리지 복제다. 함정: "라이브 인코딩 장애에도 무중단"은 MediaLive 파이프라인 이중화다.

---

**문제 4.** 500만 동시 시청자가 라이브의 새 세그먼트를 같은 순간에 요청해 origin(MediaPackage) 부하가 폭증한다. origin 요청을 최소화하는 가장 적합한 방법은?

A) CloudFront Price Class 100

B) CloudFront Origin Shield (request collapsing)

C) 더 큰 origin 인스턴스

D) Signed URL 추가

**정답: B**

해설: 수많은 엣지가 개별적으로 origin을 치면 같은 세그먼트 요청이 origin에 수백 번 도달한다. **Origin Shield**는 엣지와 origin 사이 중간 캐시 계층으로, 모든 엣지의 miss를 한 곳에 모아 **request collapsing**으로 origin엔 단 한 번만 요청이 가게 한다 — thundering herd로부터 origin을 보호한다. A는 권역 제외(비용)일 뿐 origin 부하를 줄이지 않는다. C는 비효율적이고 근본 해결이 아니다. D는 접근 인가이지 부하 감소가 아니다. 함정: "origin 부하 추가 감소·동시 폭증 보호"는 Origin Shield다.

---

**문제 5.** 유료 구독자만 수백 개 세그먼트로 이뤄진 스트림에 접근하게 하려 한다. URL마다 일일이 서명하지 않고 세션 단위로 인가하고 싶다. 가장 적합한 방법은?

A) CloudFront 공개 + WAF

B) CloudFront Signed Cookie + OAC

C) 각 세그먼트에 Signed URL

D) Cognito만 사용

**정답: B**

해설: 동영상은 수백 개 세그먼트로 구성되므로, 파일마다 서명하는 Signed URL보다 **Signed Cookie**가 세션 단위로 여러 파일 접근을 한 번에 인가해 적합하다. OAC로 S3/origin 직접 접근을 막아 CloudFront만 거치게 한다. C의 Signed URL은 개별 파일용이라 수백 세그먼트에 비효율적이다. A는 인가가 없고, D의 Cognito만으로는 CloudFront 콘텐츠 접근 인가를 직접 구현하지 못한다. 함정: "다수 세그먼트·세션 단위 인가"는 Signed Cookie다.

---

**문제 6.** 시청 이벤트를 실시간으로 수집해 사용자가 방금 본 콘텐츠를 즉시 추천에 반영하려 한다. 가장 적합한 조합은?

A) S3 + Athena 배치

B) Kinesis Data Streams + Amazon Personalize(실시간 이벤트 추적기)

C) DynamoDB만

D) Glue + QuickSight

**정답: B**

해설: 실시간 개인화는 **Kinesis Data Streams**로 시청 이벤트를 스트리밍 수집하고, **Personalize의 이벤트 추적기**로 실시간 이벤트를 반영해 GetRecommendations가 방금 본 콘텐츠를 즉시 추천에 녹인다. A·D는 배치 분석이라 즉시 반영이 아니다. C의 DDB만으로는 추천 모델이 없다. 함정: "방금 본 영상 즉시 추천"은 Kinesis + Personalize 실시간이다.

---

**문제 7.** 50PB VOD 카탈로그의 접근 패턴이 예측 불가하다(인기 콘텐츠가 갑자기 부활하기도 함). 스토리지 비용을 자동 최적화하되 부활 시 복원 지연이 없어야 한다. 가장 적합한 선택은?

A) 전부 S3 Standard

B) S3 Intelligent-Tiering

C) 수동 Lifecycle로 Glacier 이동

D) S3 One Zone-IA

**정답: B**

해설: **S3 Intelligent-Tiering**은 객체별 접근 패턴을 모니터링해 안 쓰는 것은 저렴한 계층으로 자동 강등하고, 접근이 다시 늘면 자동으로 빠른 계층으로 승격한다 — 예측 불가 패턴에서 복원 지연 없이 비용을 최적화한다. A는 비용이 과다하다. C의 수동 Glacier 이동은 부활 시 분~시간의 복원 지연으로 시청 경험을 해친다. D는 단일 AZ라 내구성·가용성이 낮아 카탈로그 원본에 부적합하다. 함정: "패턴 예측 불가·복원 지연 없는 자동 최적화"는 Intelligent-Tiering이다.

---

