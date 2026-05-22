# Day 4 - Synthetics, RUM, Evidently

📅 날짜: Week 10 (Day 4)
🎯 주제: 사용자 경험 측정 — Canary 모니터링, 실사용자 측정, A/B 실험
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudWatch Synthetics Canary 작성
- RUM(Real User Monitoring)으로 실사용자 측정
- Evidently A/B 실험
- 세 도구의 사용 사례 구분

---

## 🧩 사전 지식 (CS 기초)

- **Synthetic Monitoring**: 시뮬레이션 트래픽으로 가용성/성능 측정.
- **RUM (Real User Monitoring)**: 실사용자 브라우저에서 텔레메트리 수집.
- **A/B Testing**: 두 변형을 무작위 사용자에게 노출 후 통계 비교.
- **Web Vitals**: LCP / FID / CLS — Google 표준 UX 지표.

---

## 📖 이론 내용

### 1. CloudWatch Synthetics

정기 시뮬레이션 트랜잭션:
- Puppeteer (Node.js) 또는 Selenium (Python)
- 1분~매일 주기
- 브라우저 + API 둘 다 가능

**Canary 종류:**
- **Heartbeat**: 단일 URL 응답
- **API**: REST API 호출
- **Broken Link Checker**: 사이트 내 링크 검증
- **Visual Monitoring**: 스크린샷 비교 (UI 변경 탐지)
- **GUI Workflow Builder**: 클릭/입력 워크플로

```python
import json
from aws_synthetics.selenium import synthetics_webdriver as syn_webdriver
from aws_synthetics.common import synthetics_logger as logger

def main():
    browser = syn_webdriver.Chrome()
    browser.get("https://api.example.com/health")
    assert browser.find_element_by_id("status").text == "OK"
    logger.info("Health check passed")

def handler(event, context):
    return main()
```

알람: 실패 시 SNS → Slack/PagerDuty.

### 2. CloudWatch RUM

실사용자 브라우저에서 데이터 수집:
- 페이지 로드 시간 (Web Vitals)
- JS 에러
- HTTP 에러
- 사용자 세션 워크플로 (clickstream)

설정:
1. AppMonitor 생성
2. JS 스니펫 페이지에 삽입
3. Cognito Identity Pool로 익명 자격 (페이지가 RUM 데이터 보낼 권한)

```html
<script>
(function(n,i,v,r,s,c,x,z){
  x=window.AwsRumClient={q:[],n:n,i:i,v:v,r:r,c:c};
  // ...AWS RUM 코드...
})(
  'us-monitor-id','identity-pool-id','1.0.0','ap-northeast-2',
  'https://client.rum.us-east-1.amazonaws.com/1.x/cwr.js',
  {sessionSampleRate:1,guestRoleArn:'arn:aws:iam::...:role/RUM-Unauth',
   identityPoolId:'ap-northeast-2:abc'}
);
</script>
```

샘플링: 비용 통제용. 1.0 = 100%, 0.1 = 10%.

### 3. CloudWatch Evidently

A/B 실험 + 점진적 롤아웃 (AppConfig와 일부 겹침):

**Project / Feature / Variation / Launch / Experiment**

- **Feature**: on/off 또는 다중 variation
- **Launch**: 점진적 노출 (Canary 같음)
- **Experiment**: 통계적 A/B 비교 + Bayesian 분석

```bash
aws evidently create-project --name myapp
aws evidently create-feature \
  --project myapp \
  --name new-checkout \
  --variations 'control={boolValue=false},treatment={boolValue=true}'

aws evidently start-launch \
  --project myapp \
  --launch '...' \
  --groups 'control=10,treatment=10' \
  --metric-monitors '...'
```

> ⚠️ **2024 deprecation 경고**: Evidently가 사용 중단 예정 — AppConfig Feature Flag로 통합 방향. 시험에는 여전히 출제.

### 4. 세 도구 사용 사례 구분

| 시나리오 | 도구 |
|----------|------|
| API 가용성을 5분마다 외부에서 확인 | Synthetics |
| 사용자가 페이지 로딩에 얼마나 걸리는지 | RUM |
| 새 기능을 10% 사용자에 노출 후 전환율 비교 | Evidently |
| 단순 기능 on/off + 점진 롤아웃 | AppConfig |
| 페이지 내 죽은 링크 찾기 | Synthetics (Broken Link) |
| 스크린샷 픽셀 차이 탐지 | Synthetics (Visual) |

### 5. Synthetics 비용

- Canary 실행 횟수 × 처리 시간 (Lambda 위에서 동작)
- 1분마다 캐너리 + 24×30 = 43200회/월 → 비용 고려
- 절대 Critical Path만 1분, 일반은 5분/15분

### 6. RUM Performance Insight

RUM 데이터 → CloudWatch Metrics → Alarms:
- `PageLoadTime` p99 > 3s → 알람
- `JsErrorCount` > 임계 → 알람
- 지역/디바이스/브라우저별 분리

---

## 🧠 알아두면 좋은 심화 이론

### Synthetics가 알람과 다른 점

- Alarm은 **사후 측정** (사용자가 영향받은 후 메트릭에 반영)
- Synthetics는 **선제적 측정** (사용자 영향 전 외부에서 확인)
- 둘 다 운영

### CloudWatch Internet Monitor

지역별 인터넷 경로 상태 모니터링 (2023+):
- 특정 도시·ISP에서 우리 서비스 도달 문제 탐지
- BGP/경로 변경 가시화
- 시험에는 잘 안 나옴

### Network Monitor (2024+)

VPC 내부 네트워크 헬스 + AWS Network 도달성. 시험에 점점 등장.

### RUM Sampling 전략

- 1.0 (100%): 작은 사이트
- 0.1 (10%): 큰 사이트, 비용 통제
- 사용자 세그먼트별 다른 비율 (VIP 100%, 일반 10%)

### 관련 서비스 Cross-Reference

- **AppConfig Feature Flag** → Week 9 Day 3
- **X-Ray** → Week 11 Day 1
- **CodeDeploy Canary** → Week 4 Day 3
- **Lambda Insights** → Week 10 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
User Experience Observability Stack
==================================================

  External Probe                   Real User
  Synthetics Canary               (browser)
   (run every 5min)                  │ RUM JS snippet
        │                            ▼
        │                       AWS RUM Service
        ▼                            │
   API/Site                          ▼
        │                       CloudWatch Metrics
        ▼                       (PageLoadTime, JsError)
   Application
        │
        ▼ logs+metrics
   CloudWatch
        │
        ▼ X-Ray traces
   X-Ray

  Experiments (A/B)
  ┌──────────────────────────┐
  │ Evidently / AppConfig    │
  │  Feature Flag → 10%      │
  │  Metrics + Treatment     │
  │  Bayesian compare        │
  └──────────────────────────┘
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Synthetics = 외부 시뮬레이션 (Canary), RUM = 실사용자, Evidently = A/B 실험
2. ⭐ Synthetics 종류 5종 — Heartbeat/API/Broken Link/Visual/GUI Workflow
3. ⭐ RUM은 Cognito Identity Pool로 익명 자격 + JS 스니펫
4. ⭐ Evidently는 deprecation 경고 — AppConfig Feature Flag 통합 방향
5. ⭐ Internet Monitor + Network Monitor가 2023-24 추가 도구

---

## 💻 실제 예시 - Synthetics API Canary

```python
import urllib3
from aws_synthetics.common import synthetics_logger as logger

def heart():
    http = urllib3.PoolManager()
    r = http.request('GET', 'https://api.example.com/health')
    if r.status != 200:
        raise Exception(f'Status {r.status}')
    if b'"status":"ok"' not in r.data:
        raise Exception('Body mismatch')
    logger.info(f'OK: {r.data}')

def handler(event, context):
    return heart()
```

```bash
aws synthetics create-canary \
  --name api-heartbeat \
  --artifact-s3-location s3://synth-artifacts/api/ \
  --execution-role-arn arn:aws:iam::...:role/SynthExecRole \
  --schedule Expression="rate(5 minutes)" \
  --code Handler=heartbeat.handler,S3Bucket=synth-code,S3Key=heartbeat.zip \
  --runtime-version syn-python-selenium-3.0 \
  --success-retention-period-in-days 2 \
  --failure-retention-period-in-days 14
```

---

## 📝 연습 문제

**문제 1.** "외부에서 API의 5분 단위 가용성 측정." 도구는?
A) CloudWatch Synthetics Canary
B) RUM
C) Evidently
D) Container Insights

**정답: A**

**문제 2.** "사용자 페이지 로딩 시간(LCP) 실측." 도구는?
A) Synthetics
B) RUM
C) X-Ray
D) Logs Insights

**정답: B**

**문제 3.** "신기능을 10% 사용자에 노출하고 통계적 A/B 비교." 도구는?
A) Synthetics
B) Evidently 또는 AppConfig + 자체 분석
C) RUM
D) Lambda Insights

**정답: B**

**문제 4.** Synthetics의 Visual Monitoring 용도는?
A) UI 변경(픽셀 차이) 자동 탐지
B) IAM 변경 감지
C) Network 변경
D) DNS 변경

**정답: A**

**문제 5.** RUM이 사용하는 인증은?
A) IAM User
B) Cognito Identity Pool 익명 자격 + JS 스니펫
C) API Key
D) OIDC

**정답: B**

**문제 6.** Evidently의 deprecation은?
A) 사실 — AppConfig Feature Flag로 통합 방향
B) 거짓
C) Region 제한
D) 비용 변경

**정답: A**

**문제 7.** Synthetics Canary 1분 주기의 트레이드오프는?
A) 자동 비용 절감
B) 빠른 탐지 vs 월 43200회 실행 비용 증가
C) IAM 복잡도
D) Region 자동

**정답: B**

---

## 📌 오늘의 요약

1. Synthetics(외부) / RUM(실사용자) / Evidently(A/B)
2. Synthetics 5종 — Heartbeat/API/Broken Link/Visual/GUI Workflow
3. RUM은 Cognito Identity Pool + JS 스니펫
4. Evidently는 deprecation, AppConfig Feature Flag로 통합
5. Internet Monitor / Network Monitor가 추가 진단 도구
