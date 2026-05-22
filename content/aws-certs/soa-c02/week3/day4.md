# Day 4 - Synthetics Canary, RUM, ServiceLens, X-Ray

📅 날짜: Week 3 (Day 4)
🎯 주제: 사용자 관점에서 보는 모니터링 - 합성·실사용·분산 추적
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Synthetics Canary로 합성 모니터링을 구성한다
- CloudWatch RUM으로 실 사용자 경험을 측정한다
- X-Ray로 분산 추적, ServiceLens로 통합 가시화한다

---

## 🧩 사전 지식 (CS 기초)

- **Synthetic vs Real User Monitoring**: 가짜 사용자 시뮬 vs 실 사용자 데이터 수집
- **APM (Application Performance Monitoring)**: 분산 추적, 코드 레벨 성능 분석
- **Distributed Tracing**: 마이크로서비스 간 요청 경로 추적. Span/Trace/Context 개념
- **Sampling**: 모든 요청 추적은 비용·성능 부담. 일부만 샘플링
- **Service Map**: 서비스 간 의존성 그래프

---

## 📖 이론 내용

### 1. CloudWatch Synthetics Canary

#### 개념
- **합성(Synthetic) 모니터링**: 정해진 시나리오를 주기적으로 실행해 가용성 측정
- 사용자가 없는 새벽에도 사이트가 살아있는지 확인
- API/웹 페이지가 정상 응답·기대 결과 반환하는지 자동 검증

#### Canary 종류

| 종류 | 용도 |
|------|------|
| **Heartbeat** | URL이 200 응답하는지 단순 ping |
| **API Canary** | REST API 호출 + 응답 검증 |
| **Broken Link Checker** | 페이지의 모든 링크 점검 |
| **Visual Monitoring** | 스크린샷 비교 (UI 변경 감지) |
| **Canary Recorder** | 브라우저 액션 기록 → 재생 (로그인→장바구니→결제 같은 흐름) |
| **GUI Workflow Builder** | 클릭/입력 시나리오 코드 자동 생성 |

#### 동작 메커니즘
- 내부적으로 Lambda 함수가 Puppeteer (Chromium)로 실행
- S3 버킷에 스크린샷·HAR 파일 저장
- CloudWatch Logs에 실행 로그
- Custom Metric으로 `SuccessPercent`, `Duration`, `Failed` 등 발행

#### Canary 설정 예시
```javascript
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const pageLoadBlueprint = async function () {
  const page = await synthetics.getPage();
  const response = await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });

  if (response.status() !== 200) {
    throw new Error(`Failed with status ${response.status()}`);
  }

  await synthetics.takeScreenshot('loaded', 'success');

  // 특정 요소가 존재하는지 검증
  const titleEl = await page.waitForSelector('h1', { timeout: 5000 });
  const title = await titleEl.evaluate(el => el.textContent);

  if (!title.includes('Welcome')) {
    throw new Error(`Title mismatch: ${title}`);
  }
};

exports.handler = async () => {
  return await synthetics.executeStep('pageLoad', pageLoadBlueprint);
};
```

#### Canary 스케줄
- `rate(1 minute)` ~ `rate(1 hour)`
- `cron(0 8 * * ? *)` cron 표현식
- 비활성 시간 자동 정지 가능

#### 비용
- Canary 실행당 $0.0012 (1분 주기 = 월 약 $50)
- S3 저장 + CloudWatch Logs 별도

### 2. CloudWatch RUM (Real User Monitoring)

#### 개념
- 브라우저에 JS 스니펫 삽입 → 실제 사용자의 페이지 로딩·인터랙션 데이터 수집
- Core Web Vitals (LCP, FID, CLS) 자동 측정
- 지역·디바이스·브라우저별 분석

#### 수집 데이터
- 페이지 로딩 시간, 자원별 시간
- JavaScript 에러 (스택 트레이스)
- HTTP 요청 (XHR, fetch)
- 사용자 인터랙션 (클릭, 스크롤)
- 세션·사용자 식별

#### 설정 방법
1. RUM 콘솔에서 앱 등록 (도메인, 사이트 ID 발급)
2. Cognito Identity Pool 자동 생성 (인증 없이 데이터 전송용)
3. HTML에 JS 스니펫 추가
   ```html
   <script>
     (function(n,i,v,r,s,c,x,z){...})(...);
   </script>
   ```
4. 옵션: 샘플링 비율, 페이지 그룹, telemetry 종류

#### Synthetics vs RUM 비교

| 항목 | Synthetics | RUM |
|------|------------|-----|
| 측정 대상 | 가상 사용자 | 실제 사용자 |
| 시점 | 정기 (예: 1분마다) | 실시간 |
| 트래픽 없을 때 | 동작 | 동작 안 함 |
| 지역 다양성 | 제한적 | 실 사용자 지역 모두 |
| 비용 | 실행 횟수 | 이벤트 수 |
| 사용 사례 | 가용성 | UX 분석 |

→ **둘 다 함께 사용하는 게 모범 사례**.

### 3. AWS X-Ray (분산 추적)

#### 개념
- 요청이 여러 서비스 거치는 흐름을 시각화
- Lambda·API Gateway·ECS·EC2 통합
- **Trace** = 전체 요청, **Segment** = 한 서비스 처리, **Subsegment** = 세부 작업 (DB 쿼리, HTTP 호출)

#### 활성화 방법

**Lambda**: 함수 설정 → "Active tracing" 토글
```bash
aws lambda update-function-configuration \
  --function-name order-service \
  --tracing-config Mode=Active
```

**API Gateway**: Stage 설정 → "Enable X-Ray Tracing"

**EC2/온프레미스**: X-Ray daemon 설치 + SDK 통합

**ECS**: Task Definition에 X-Ray sidecar 추가

#### SDK 통합 (Node.js 예시)
```javascript
const AWSXRay = require('aws-xray-sdk-core');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));
// 이제 모든 AWS SDK 호출이 X-Ray Subsegment로 추적

const https = AWSXRay.captureHTTPs(require('https'));
// 외부 HTTPS 호출도 추적
```

#### Sampling 규칙
- 기본: 첫 1초 1건 + 이후 5% 샘플링
- 사용자 정의 규칙 가능 (URL 패턴별, 서비스별)
- 비용 절감 핵심 (모든 요청 추적은 비쌈)

#### Service Map
- 서비스 간 의존 그래프 자동 생성
- 노드 색상으로 에러율·응답시간 시각화
- 클릭으로 해당 서비스 상세 진입

### 4. CloudWatch ServiceLens

#### 개념
- X-Ray + CloudWatch Logs + CloudWatch Metrics를 한 화면에 통합
- 마이크로서비스 운영자를 위한 단일 진입점

#### 기능
- Service Map 위에 메트릭/알람/로그 오버레이
- Trace ID로 해당 요청의 로그 즉시 점프
- Anomaly Detection 결과 시각화

### 5. CloudWatch Application Signals (신규)

- APM 기능을 AWS 네이티브로 제공
- 자동 계측 (instrumentation) — 코드 수정 최소화
- SLO/SLI 추적
- Java/Python/.NET 지원

### 6. Container Insights (ECS/EKS)

- EKS Node·Pod·컨테이너 단위 메트릭 자동 수집
- ECS: Task/Service/Container 메트릭
- CloudWatch Logs로 컨테이너 로그 통합
- Performance Dashboards 자동 생성

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **X-Ray Insights** | 자동 이상 감지 (오류 spike) | 트리거 알람 |
| **X-Ray Encryption** | KMS로 trace 데이터 암호화 | 컴플라이언스 |
| **Trace Header** | `X-Amzn-Trace-Id` 헤더로 trace 전파 | 멀티 서비스 |
| **Sampling Rate Calculation** | 트래픽 폭증 시 rate 자동 조정 | 비용 안정 |
| **Canary VPC Endpoint** | Canary가 사설 자원 점검 가능 | 내부 API |
| **RUM Privacy** | PII 마스킹 설정 | GDPR 준수 |

> ⚠️ **함정 1**: Synthetics는 트래픽 없을 때도 동작 → 새벽 가용성 측정 가능. RUM은 사용자 없으면 데이터 X.
>
> ⚠️ **함정 2**: X-Ray는 기본 5% 샘플링. 모든 trace를 보려면 sampling 규칙 변경 (비용 증가).
>
> 💡 **암기 팁**: Synthetics(우리가 사용자 시뮬) ↔ RUM(실제 사용자 데이터). X-Ray(분산 추적) + ServiceLens(통합 화면).

### 관련 서비스 Cross-Reference

- **Synthetics → Week 3 Day 1** (Canary 실패 알람)
- **X-Ray → Week 7 Lambda 운영** (트레이싱 활성화)
- **RUM → Week 11** (UX 최적화 데이터)
- **ServiceLens → Week 12** (운영 통합 뷰)

---

## 🏗️ 아키텍처 다이어그램

```
Synthetics + RUM + X-Ray + ServiceLens 조합
===============================================================

  [Synthetics Canary]              [실제 사용자 브라우저]
   - 1분마다 시나리오 실행          - RUM JS 스니펫
   - 새벽에도 동작                   - 페이지 로딩 측정
        │                                │
        ▼                                ▼
   [CloudWatch Metrics]            [CloudWatch RUM]
   SuccessPercent, Duration         LCP, FID, CLS, JS Errors

  [사용자 요청] → API Gateway → Lambda → DynamoDB
                    │            │         │
                    ▼            ▼         ▼ (X-Ray Subsegment)
            [X-Ray Segments 자동 캡처]
                       │
                       ▼
              [X-Ray Service Map]
                       │
                       ▼
         ┌──────────────────────────┐
         │  CloudWatch ServiceLens  │
         │  - X-Ray Map             │
         │  - Logs Insights         │
         │  - Metric Alarms         │
         └──────────────────────────┘
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Synthetics = 합성 모니터링** (새벽에도 동작), **RUM = 실 사용자 측정**
2. ⭐ **Canary Recorder/Builder로 GUI 시나리오 자동 생성** — 코드 없이 시작 가능
3. ⭐ **X-Ray 기본 샘플링 5%** — 비용 절감, 모든 trace는 규칙 변경 필요
4. ⭐ **X-Ray Lambda 활성화**: `tracing-config Mode=Active` 한 줄
5. ⭐ **ServiceLens = X-Ray + Logs + Metrics 통합 화면**

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Synthetics Canary 생성 (Heartbeat)
aws synthetics create-canary \
  --name "homepage-heartbeat" \
  --code "Handler=index.handler,S3Bucket=my-canary-code,S3Key=heartbeat.zip" \
  --artifact-s3-location "s3://my-canary-artifacts/" \
  --execution-role-arn "arn:aws:iam::123456789012:role/CloudWatchSyntheticsRole" \
  --schedule "Expression=rate(1 minute)" \
  --runtime-version "syn-nodejs-puppeteer-7.0" \
  --run-config "TimeoutInSeconds=60,MemoryInMB=1000,ActiveTracing=true" \
  --success-retention-period-in-days 31 \
  --failure-retention-period-in-days 31

# 2. Canary 결과 메트릭 알람
aws cloudwatch put-metric-alarm \
  --alarm-name "Canary-Failure" \
  --metric-name "SuccessPercent" \
  --namespace "CloudWatchSynthetics" \
  --dimensions "Name=CanaryName,Value=homepage-heartbeat" \
  --period 300 \
  --statistic Average \
  --threshold 90 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 1

# 3. Lambda X-Ray 활성화
aws lambda update-function-configuration \
  --function-name order-service \
  --tracing-config Mode=Active

# 4. X-Ray Sampling Rule 생성 (특정 API는 100%)
aws xray create-sampling-rule \
  --sampling-rule '{
    "RuleName": "premium-api",
    "Priority": 1,
    "FixedRate": 1.0,
    "ReservoirSize": 100,
    "ServiceName": "*",
    "ServiceType": "*",
    "Host": "*",
    "HTTPMethod": "POST",
    "URLPath": "/premium/*",
    "Version": 1
  }'

# 5. X-Ray Trace 조회
aws xray get-trace-summaries \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --filter-expression "service(\"order-service\") AND duration > 1"
```

---

## 📝 연습 문제

**문제 1.** 회사가 새벽 시간대 사이트 다운타임을 자동 감지하려 한다. 가장 적합한 도구는?

A) RUM
B) Synthetics Canary
C) CloudWatch Agent
D) X-Ray

**정답: B**
해설: RUM은 실 사용자 의존 → 새벽엔 데이터 없음. Synthetics Canary는 정해진 주기로 합성 트래픽 생성 → 24시간 가용성 측정 가능.

---

**문제 2.** 사용자들이 "사이트가 느리다"고 불평한다. 실제 사용자별 페이지 로딩 시간(LCP)을 측정하려면?

A) Synthetics
B) RUM (Real User Monitoring) - 브라우저에 JS 스니펫 추가
C) CloudWatch Agent
D) Logs Insights

**정답: B**
해설: RUM은 실 사용자 브라우저에서 Core Web Vitals(LCP/FID/CLS)을 측정. 지역·디바이스·브라우저별 분석 가능. Synthetics는 가상 사용자라 실제 UX는 측정 못함.

---

**문제 3.** 마이크로서비스 5개 거치는 API의 응답 지연 원인을 찾으려 한다. 가장 적합한 도구는?

A) CloudWatch Logs
B) X-Ray (Service Map + Trace 분석)
C) Synthetics
D) RUM

**정답: B**
해설: X-Ray의 분산 추적이 정답. Service Map에서 어느 서비스가 느린지 즉시 식별, Trace로 세부 Subsegment 확인. ServiceLens로 X-Ray + Logs + Metrics 통합 뷰.

---

**문제 4.** X-Ray가 비싸진다. 모든 trace를 보지 않고 비용을 줄이려면?

A) X-Ray 끄기
B) Sampling Rule 조정 — 기본 5% 또는 더 낮게, 중요 API만 100%
C) Logs로 대체
D) 리전 변경

**정답: B**
해설: X-Ray 비용은 trace 수 비례. Sampling Rule로 정상 트래픽은 1~5%, 에러 발생 시나 중요 API만 100% 추적. 기본은 첫 1초 1건 + 5%.

---

**문제 5.** ServiceLens의 가장 큰 장점은?

A) 더 저렴
B) X-Ray, CloudWatch Logs, Metrics를 한 화면에 통합 — 트레이스에서 로그·메트릭으로 즉시 점프
C) 자동으로 코드 수정
D) 더 빠른 trace 수집

**정답: B**
해설: ServiceLens는 통합 화면. Service Map 위에 메트릭/알람 오버레이, Trace ID → Logs Insights 즉시 점프. 운영자가 컨텍스트 전환 없이 분석.

---

## 📌 오늘의 요약

1. Synthetics Canary: 합성 모니터링. 1분~1시간 주기 시나리오 실행. 새벽에도 동작
2. RUM: 실 사용자 브라우저에 JS 스니펫. Core Web Vitals + JS 에러 + 사용자 인터랙션
3. X-Ray: 분산 추적. Lambda는 `tracing Mode=Active`로 활성화. 기본 5% 샘플링
4. ServiceLens: X-Ray + Logs + Metrics 통합 뷰. 운영자의 단일 진입점
5. Container Insights: ECS/EKS 메트릭·로그 자동 통합. 컨테이너 전용
