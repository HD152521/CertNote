# Day 4 - Synthetics Canary, X-Ray Sampling, ServiceLens: 사용자 관점 모니터링의 설계

장애는 항상 "사용자가 먼저 안다"는 말이 있다. 내부 메트릭이 정상인데 사용자 경험은 망가져 있는 경우가 실제로 많다. 반대도 있다. 메트릭이 빨간데 사용자는 아무 문제 없이 사용 중인 경우. 운영자가 시스템 내부만 본다면 이 두 상황을 제대로 처리하기 어렵다. 오늘 다루는 Synthetics Canary, RUM, X-Ray, ServiceLens는 "시스템 안"이 아닌 "사용자 관점"에서 모니터링을 구성하는 도구들이다.

## Synthetics Canary: 합성 모니터링의 역사와 설계 철학

"합성(Synthetic)" 모니터링은 실제 사용자가 없어도 가상 사용자(봇)가 정해진 시나리오를 실행해 가용성과 성능을 측정하는 방식이다. 개념 자체는 2000년대 초 Gomez, Keynote 같은 회사들이 "인터넷 측정" 사업으로 시작했다. 브라우저를 프로그래밍으로 제어하는 Puppeteer(Google, 2017)의 등장으로 현실적인 브라우저 자동화 합성 모니터링이 가능해졌다.

CloudWatch Synthetics Canary는 내부적으로 **Lambda 함수**가 **Chromium(Puppeteer 기반)** 또는 Python 스크립트를 실행한다. 사용자가 작성한 canary 스크립트는 Lambda 실행 환경에서 동작하며, 실행 결과(스크린샷, HAR 파일, 로그)를 S3에 저장하고, 성공/실패 메트릭을 `CloudWatchSynthetics` 네임스페이스에 발행한다.

```
[EventBridge Scheduler] → (rate 또는 cron으로)
      │
      ▼
[Lambda 실행 환경]
  canary script 실행
  Chromium/Python으로 URL 접근
  응답 검증
      │
      ├─→ [S3] 스크린샷, HAR 파일, 실행 로그
      ├─→ [CloudWatch Logs] 상세 실행 로그
      └─→ [CloudWatch Metrics] SuccessPercent, Duration, Failed
```

## Canary 런타임과 Blueprint

Canary 런타임은 Node.js(Puppeteer 기반)와 Python 두 계열이 있다. 실무에서 선택 기준은 팀의 언어 친숙도가 주된 요소다.

| 런타임 | 현재 버전 | 특징 |
|--------|-----------|------|
| `syn-nodejs-puppeteer-7.0` | 최신 Node.js | Chromium, Puppeteer, @aws-sdk/client-* |
| `syn-python-selenium-4.1` | Python 3.x | Selenium WebDriver, Chromium |

AWS가 제공하는 Blueprint로 빠르게 시작할 수 있다.

| Blueprint | 용도 | 내부 동작 |
|-----------|------|-----------|
| **Heartbeat** | URL이 200 응답하는지 단순 ping | HTTP GET + 상태코드 체크 |
| **API Canary** | REST API 호출 + 응답 body 검증 | HTTP 메서드 + JSON 파싱 |
| **Broken Link Checker** | 페이지의 모든 링크 점검 | 재귀 크롤링 |
| **Visual Monitoring** | 스크린샷 비교 (UI 변경 감지) | 픽셀 diff |
| **Canary Recorder** | 실제 브라우저 액션 기록 후 재생 | HAR 파일 재생 |
| **GUI Workflow Builder** | 클릭/입력 시나리오 코드 자동 생성 | Puppeteer script 생성 |

Visual Monitoring Blueprint는 베이스라인 스크린샷과 현재 스크린샷을 비교해 픽셀 차이율이 임계값을 넘으면 실패로 처리한다. UI 배포 후 레이아웃 깨짐을 자동 탐지하는 데 유용하다.

```javascript
// Heartbeat Canary 기본 구조
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const heartbeat = async function () {
  const page = await synthetics.getPage();

  // 1. 페이지 로드
  const response = await page.goto(
    'https://api.example.com/health',
    { waitUntil: 'networkidle0', timeout: 30000 }
  );

  // 2. HTTP 상태 코드 검증
  if (response.status() !== 200) {
    throw new Error(`Expected 200, got ${response.status()}`);
  }

  // 3. 응답 body 검증
  const body = await response.json();
  if (body.status !== 'healthy') {
    throw new Error(`Unhealthy: ${JSON.stringify(body)}`);
  }

  // 4. 스크린샷 저장
  await synthetics.takeScreenshot('health-check', 'pass');
  log.info('Health check passed');
};

exports.handler = async () => {
  return await synthetics.executeStep('heartbeat', heartbeat);
};
```

## Synthetics와 RUM의 비교: 두 관점의 상호 보완

| 항목 | Synthetics Canary | CloudWatch RUM |
|------|------------------|----------------|
| 측정 대상 | 가상 사용자 (봇) | 실제 사용자 브라우저 |
| 트래픽 없을 때 | 동작 (24/7 측정 가능) | 데이터 없음 |
| 지역 다양성 | 고정 AWS 리전에서 실행 | 실제 사용자 위치 전체 |
| Core Web Vitals | 측정 어려움 | 자동 측정 (LCP, FID, CLS) |
| JavaScript 에러 | 스크립트 에러만 | 실제 사용자 JS 에러 |
| 비용 | 실행 횟수 ($0.0012/실행) | 이벤트 수 |
| 주 사용 사례 | 가용성 24/7, 회귀 탐지 | UX 분석, 성능 최적화 |

RUM의 Core Web Vitals는 Google이 2020년 제안한 사용자 경험 메트릭이다. LCP(Largest Contentful Paint, 최대 콘텐츠 렌더링 시간), FID(First Input Delay, 첫 입력 지연), CLS(Cumulative Layout Shift, 누적 레이아웃 이동)가 핵심 세 가지다. Google 검색 순위에도 영향을 주므로 SEO와 직결된다.

> 📚 **사례**: 2019년 Amazon 연구에 따르면 페이지 로딩이 100ms 늘어날 때 매출이 1% 감소한다고 알려졌다. Walmart는 페이지 속도를 1초 개선할 때 전환율이 2% 향상됐다고 공개했다. RUM은 이런 비즈니스 지표와 기술 지표를 연결하는 데이터 소스다. Synthetics만으로는 "평균적인 봇의 경험"을 측정하지만, RUM은 "서울에서 LTE로 접속한 모바일 사용자"의 실제 경험을 측정한다.

## X-Ray: 분산 추적의 내부 구조와 Sampling 알고리즘

AWS X-Ray는 분산 시스템에서 요청이 여러 서비스를 거치는 흐름을 추적한다. 기반이 되는 개념은 Google의 Dapper 논문(Sigelman et al., 2010)이다. Dapper는 `trace_id`와 `span_id`로 계층적 요청 추적 구조를 처음 제안했고, 이후 Zipkin(Twitter), Jaeger(Uber), OpenTelemetry의 근간이 됐다. X-Ray도 동일한 개념을 AWS 환경에 맞게 구현한다.

**Trace**: 하나의 요청이 생성부터 완료까지의 전체 경로. `X-Amzn-Trace-Id` HTTP 헤더로 서비스 간 전파된다.

**Segment**: 한 서비스(Lambda, EC2, ECS)가 처리한 구간. 시작 시각, 종료 시각, 에러 여부, HTTP 메타데이터가 포함된다.

**Subsegment**: Segment 내의 세부 작업. DynamoDB 쿼리, S3 업로드, 외부 API 호출 등 SDK 호출이 자동으로 Subsegment로 캡처된다.

```
Trace (전체 요청)
  └─ Segment: API Gateway
      └─ Segment: Lambda order-service
          ├─ Subsegment: DynamoDB GetItem (3ms)
          ├─ Subsegment: SQS SendMessage (8ms)
          └─ Subsegment: HTTPS call to payment-api (245ms)  ← 병목!
              └─ Segment: Lambda payment-service
                  └─ Subsegment: RDS Query (230ms)  ← 근본 원인
```

이 트리 구조를 Service Map으로 시각화하면 어느 서비스에서 지연이 발생하는지 즉각 파악된다.

## X-Ray Sampling Rule: 비용과 정밀도의 균형

X-Ray가 모든 요청을 추적하면 대용량 트래픽에서 비용이 폭발한다. 100만 trace당 $5이므로, 초당 1000 RPS 서비스에서 100% 샘플링하면 하루 4,320만 trace = 월 $6,480 X-Ray 비용만 발생한다. 실용적이지 않다.

X-Ray Sampling은 **Reservoir + Fixed Rate** 모델로 작동한다. Reservoir는 "초당 최소 N개 trace는 반드시 수집"하는 버킷이다. Fixed Rate는 Reservoir가 채워진 후 추가 요청에 적용하는 백분율이다.

```
기본 샘플링 규칙:
  Reservoir = 1 (초당 최소 1개)
  Fixed Rate = 5% (나머지의 5%)

예시 (초당 100 RPS):
  - 첫 1개: 반드시 추적
  - 나머지 99개의 5% = 4.95개 ≈ 5개
  → 총 초당 약 6개 trace = 6% 실효 샘플링률
```

사용자 정의 Sampling Rule은 우선순위(Priority), 서비스 이름, HTTP 메서드, URL 경로별로 다른 샘플링률을 지정할 수 있다.

```bash
# 중요 결제 API는 100%, 일반 헬스체크는 0% 샘플링
aws xray create-sampling-rule \
  --sampling-rule '{
    "RuleName": "payment-api-full",
    "Priority": 1,
    "FixedRate": 1.0,
    "ReservoirSize": 50,
    "ServiceName": "payment-service",
    "ServiceType": "*",
    "Host": "*",
    "HTTPMethod": "POST",
    "URLPath": "/api/v*/payments/*",
    "ResourceARN": "*",
    "Version": 1
  }'

aws xray create-sampling-rule \
  --sampling-rule '{
    "RuleName": "health-check-exclude",
    "Priority": 2,
    "FixedRate": 0.0,
    "ReservoirSize": 0,
    "ServiceName": "*",
    "ServiceType": "*",
    "Host": "*",
    "HTTPMethod": "GET",
    "URLPath": "/health",
    "ResourceARN": "*",
    "Version": 1
  }'
```

Priority 1이 먼저 매칭된다. `/health` 엔드포인트는 Priority 2 룰로 0% 샘플링(전혀 추적하지 않음)이 된다. 기본 룰은 Priority 10000으로 모든 사용자 정의 룰보다 낮다.

> 🔍 **더 깊이**: Reservoir 크기는 X-Ray 중앙 샘플링 서비스가 관리한다. 하나의 서비스가 여러 인스턴스로 실행될 때, 각 인스턴스가 독립적으로 "초당 1개"를 수집하면 전체적으로 과잉 수집이 된다. X-Ray SDK는 중앙 샘플링 서비스와 통신해 Reservoir를 분배한다. 인스턴스가 10개면 각각 Reservoir의 1/10씩 배정받는다. 네트워크 분리 등으로 중앙 서비스에 접근 불가한 경우 "fallback 샘플링(고정 5%)"이 적용된다.

## X-Ray 활성화 방법별 차이

| 환경 | 활성화 방법 | 비고 |
|------|-------------|------|
| Lambda | `tracing-config Mode=Active` | 자동 계측, SDK로 세부 추적 추가 가능 |
| API Gateway | Stage 설정 > X-Ray Tracing | API→Lambda trace 연결 |
| EC2 | X-Ray Daemon + SDK | Daemon이 trace를 X-Ray 서비스로 전송 |
| ECS | Task Definition에 X-Ray Daemon sidecar | 컨테이너 간 trace 전파 |
| EKS | X-Ray Daemon DaemonSet | Pod trace 수집 |
| App Mesh | 자동 계측 | Envoy 프록시 통합 |

Lambda에서 `Mode=Active`로 설정하면 Lambda 자체 실행 시간은 자동 추적된다. 그러나 Lambda 안에서 DynamoDB를 호출할 때 Subsegment로 추적하려면 SDK 통합이 필요하다.

```javascript
const AWSXRay = require('aws-xray-sdk-core');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));  // 모든 AWS SDK 호출 자동 캡처

const ddb = new AWS.DynamoDB.DocumentClient();
// 이제 ddb.get(), ddb.put() 등이 X-Ray Subsegment로 자동 추적됨

// 외부 HTTP 호출도 추적
const https = AWSXRay.captureHTTPs(require('https'));

// 커스텀 Subsegment
const segment = AWSXRay.getSegment();
const sub = segment.addNewSubsegment('custom-calculation');
try {
  doComplexCalculation();
  sub.close();
} catch (e) {
  sub.addError(e);
  sub.close();
  throw e;
}
```

## ServiceLens: 세 신호의 통합 뷰

ServiceLens는 X-Ray Service Map 위에 CloudWatch Metrics와 Logs를 오버레이하는 통합 운영 화면이다. 독립적인 서비스가 아니라 CloudWatch 콘솔 내의 뷰다.

ServiceLens에서 가능한 작업:
- Service Map 노드 클릭 → 해당 서비스의 p50/p95/p99 레이턴시 및 에러율
- 노드의 "View traces" → 해당 서비스를 거친 실제 trace 목록
- Trace 클릭 → trace의 모든 Segment/Subsegment + 소요 시간 waterfall
- "View logs" → trace_id로 해당 Lambda 실행의 CloudWatch Logs 즉시 점프
- 알람 오버레이 → 어느 서비스에 ALARM 상태가 있는지 시각화

이 "Trace ID → Logs 점프" 기능이 가장 강력하다. 5xx 에러가 발생한 특정 요청의 trace를 찾아, 해당 Lambda 함수의 실행 로그를 1초 안에 열 수 있다. 없으면 CloudWatch Logs에서 request_id로 수동 검색해야 하는 과정이다.

> 💡 **관련 이론**: ServiceLens가 구현하는 개념은 **Correlated telemetry(상관 원격 측정)**다. 각 신호(Metrics, Logs, Traces)를 독립적으로 보는 것이 아니라, 같은 요청/사건을 서로 다른 신호로 바라보며 상호 참조하는 방식이다. OpenTelemetry(CNCF, 2019)는 이 상관을 표준화하기 위해 탄생했다. Trace에 log_group_name과 request_id를 correlation attribute로 삽입하면 서로 다른 저장소의 데이터를 하나의 사건으로 연결할 수 있다. AWS는 X-Ray와 CloudWatch Logs를 자체 통합으로 이 상관을 제공한다.

## Container Insights: ECS/EKS 전용 모니터링

Container Insights는 컨테이너 환경 전용 자동 모니터링이다. EKS는 DaemonSet 형태의 CloudWatch Agent + Fluent Bit으로, ECS는 awslogs 드라이버 또는 Fluent Bit 사이드카로 구성된다.

```bash
# EKS: Container Insights 활성화
aws eks update-addon \
  --cluster-name my-cluster \
  --addon-name amazon-cloudwatch-observability \
  --addon-version v1.7.0-eksbuild.1
```

수집 메트릭:
- 클러스터 레벨: 전체 CPU/메모리 사용률, Pod 수
- 노드 레벨: 노드별 CPU/메모리/네트워크
- Pod 레벨: Pod별 CPU/메모리 사용률, 재시작 수
- 컨테이너 레벨: 컨테이너별 CPU/메모리

자동 생성되는 Performance Dashboards는 클러스터 → 노드 → Pod → 컨테이너를 계층적으로 드릴다운해서 볼 수 있다.

> ⚠️ **함정**: Container Insights는 추가 비용이 발생한다. 수집되는 메트릭 수와 로그 양에 따라 청구된다. EKS 클러스터 규모에 따라 월 수십~수백 달러가 추가될 수 있다. 모든 컨테이너 메트릭이 필요한지 검토하고, 필요한 네임스페이스만 수집하도록 설정을 최적화하는 것이 권장된다.

## 실무 아키텍처: Synthetics + X-Ray + ServiceLens 조합

```
[Synthetics Canary]         [실 사용자]
 1분 주기 heartbeat          RUM JS 스니펫
 API canary 5분 주기          │
       │                     │
       ▼                     ▼
 [CloudWatch Metrics]    [CloudWatch RUM]
 SuccessPercent<90% → ALARM  LCP/CLS/JS 에러

       사용자 요청
          │
     API Gateway (X-Ray Active)
          │
     Lambda order-service (X-Ray Active)
     ├─ DynamoDB (Subsegment 자동)
     └─ SQS (Subsegment 자동)
          │
     Lambda payment-service (X-Ray Active)
     └─ RDS (Subsegment 자동)
          │
     [X-Ray Service Map → ServiceLens]
     에러 노드 발견 → Trace → Logs 즉시 점프
```

## 마무리

Synthetics는 "서비스가 살아있는가"를 24시간 검증한다. RUM은 "실제 사용자가 경험하는 성능이 어떤가"를 측정한다. X-Ray는 "어떤 서비스가 느리게 만드는가"를 분산 추적으로 찾는다. ServiceLens는 이 세 신호를 통합해 "이 에러 trace의 Lambda 로그"를 한 번에 열어준다. 네 도구는 각자의 영역이 있고, 함께 쓸 때 가장 강력하다.

---

## 📝 연습 문제

**문제 1.** 새벽 3시에 API가 다운됐는데 트래픽이 없어서 알람이 안 울렸다. 24시간 가용성을 보장하려면?

A) CloudWatch Agent로 메트릭 수집 강화
B) Synthetics Canary로 1분 주기 Heartbeat Canary 구성
C) RUM 스니펫을 더 많은 페이지에 삽입
D) X-Ray 샘플링률을 100%로 올린다

**정답: B**
해설: RUM은 실제 사용자가 없는 새벽엔 데이터가 없다. Synthetics Canary는 합성 사용자가 정해진 주기로 API를 호출하므로 트래픽과 무관하게 24시간 가용성을 측정한다. 1분 주기 Heartbeat Canary가 API 200 응답을 확인하고, 실패 시 `SuccessPercent` 메트릭 알람 → SNS로 즉시 통보한다.

---

**문제 2.** X-Ray Sampling Rule에서 Priority, Reservoir, Fixed Rate의 의미를 올바르게 설명한 것은?

A) Priority가 높을수록 먼저 매칭된다
B) Reservoir는 초당 최소 N개 trace를 보장하는 버킷이고, Fixed Rate는 Reservoir 소진 후 추가 요청에 적용되는 백분율이다. Priority 숫자가 작을수록 먼저 매칭된다
C) Fixed Rate 1.0은 모든 요청의 1% 샘플링이다
D) Reservoir는 분당 최소 N개 trace를 보장한다

**정답: B**
해설: Priority는 낮은 숫자가 높은 우선순위다(Priority 1이 10000보다 먼저 매칭). Reservoir는 초당 최소 N개 trace를 반드시 수집하는 버킷이다. Fixed Rate는 Reservoir가 채워진 후 나머지 요청에 적용되는 비율이다. Fixed Rate 1.0은 100%(전체 샘플링)를 의미한다.

---

**문제 3.** Lambda 함수 내 DynamoDB 쿼리가 X-Ray에서 Subsegment로 보이지 않는다. 이유는?

A) Lambda의 X-Ray Active Tracing이 비활성화됨
B) X-Ray SDK의 `captureAWS()`로 AWS SDK를 감싸지 않았기 때문
C) DynamoDB는 X-Ray 통합을 지원하지 않는다
D) Sampling Rule에서 DynamoDB를 제외했다

**정답: B**
해설: Lambda의 Active Tracing을 켜면 Lambda 실행 자체는 Segment로 추적된다. 그러나 Lambda 내부에서 AWS SDK를 호출할 때 Subsegment로 자동 추적되려면 `const AWS = AWSXRay.captureAWS(require('aws-sdk'))` 또는 v3용 미들웨어를 적용해야 한다. 이 설정 없이는 DynamoDB 호출이 X-Ray에 보이지 않는다.

---

**문제 4.** ServiceLens에서 특정 Lambda의 5xx 에러 trace를 찾았다. CloudWatch Logs에서 해당 실행 로그를 가장 빠르게 보는 방법은?

A) CloudWatch Logs에서 Log Group을 찾아 시간대로 필터링
B) ServiceLens의 Trace 상세에서 "View logs" 링크 클릭 → trace_id로 해당 Lambda 실행 로그로 즉시 점프
C) X-Ray CLI로 trace 상세 조회 후 request_id를 수동으로 찾음
D) CloudTrail에서 Lambda Invoke 이벤트 검색

**정답: B**
해설: ServiceLens의 핵심 기능이 바로 이 "Trace → Logs 점프"다. X-Ray trace에 Lambda request_id가 포함되어 있고, ServiceLens가 이를 활용해 해당 Log Group에서 request_id로 필터링된 로그를 즉시 보여준다. 수동으로 Log Group에서 검색하는 것보다 수십 배 빠르다.

---

**문제 5.** Synthetics Canary가 로그인 → 장바구니 추가 → 결제 완료의 전체 사용자 플로우를 테스트하려 한다. 어떤 Blueprint를 사용하나?

A) Heartbeat
B) API Canary
C) Canary Recorder (실제 브라우저 액션을 기록해 재생)
D) Broken Link Checker

**정답: C**
해설: Canary Recorder는 크롬 확장 프로그램으로 실제 브라우저에서 사용자 액션(클릭, 입력, 이동)을 기록하고, 이를 Puppeteer 스크립트로 변환한다. 복잡한 사용자 플로우를 코드 없이 자동화할 수 있다. Heartbeat는 단순 URL ping, API Canary는 HTTP API 호출, Broken Link Checker는 링크 유효성 검사 전용이다.

---

**문제 6.** X-Ray 비용을 절감하면서도 결제 API는 100% 추적하고 싶다. 가장 적합한 구성은?

A) 모든 서비스의 X-Ray를 비활성화하고 결제만 활성화
B) 기본 샘플링 룰 유지(5%) + 결제 API URL 패턴으로 Priority 1, FixedRate 1.0 Sampling Rule 추가
C) Sampling률을 1%로 낮추고 결제 API만 따로 모니터링 계정에 복사
D) 결제 Lambda에만 CloudWatch 상세 모니터링 활성화

**정답: B**
해설: X-Ray Sampling Rule의 우선순위 매칭을 활용한다. Priority 1로 결제 API URL 패턴(`/api/*/payments/*`)에 FixedRate 1.0(100%)을 설정한다. 다른 요청은 기본 룰(Priority 10000, 5%)이 적용된다. 전체 비용은 줄이면서 중요 트랜잭션은 완전히 추적하는 표준 패턴이다.
