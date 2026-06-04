# Day 4 - Synthetics·RUM·Evidently: 사용자 경험을 측정하는 세 가지 시선

지금까지의 관찰성은 전부 시스템 내부를 향했다 — CPU, 메모리, 에러율, 콜드 스타트. 그런데 이 모든 지표가 초록불인데도 사용자는 "사이트가 느려요"라고 불평할 수 있다. CDN의 특정 엣지가 느리거나, 자바스크립트가 특정 브라우저에서 깨지거나, DNS가 어느 지역에서 꼬이거나, 백엔드는 빠른데 프론트엔드 렌더링이 느릴 수 있기 때문이다. 시스템 메트릭은 "서버가 건강한가"를 보지만, "사용자가 실제로 좋은 경험을 하는가"는 보지 못한다. 이 간극을 메우는 것이 오늘의 주제다.

오늘은 사용자 경험을 측정하는 세 가지 도구를 깊이 본다. **Synthetics**(외부에서 시뮬레이션 트래픽으로 능동 측정), **RUM**(실사용자 브라우저에서 수동 수집), **Evidently**(두 변형을 비교하는 A/B 실험). 단순히 "이런 도구가 있다"가 아니라, 능동(active) 모니터링과 수동(passive) 모니터링이 왜 둘 다 필요한지, RUM이 어떻게 익명 사용자 브라우저에서 안전하게 데이터를 받는지, A/B 실험의 통계적 근거가 무엇인지를 파고든다. DOP 시험에서 이 셋의 구분("외부 가용성", "실사용자 LCP", "기능 A/B")은 단골 출제이고, 도구 매칭만 정확히 해도 점수를 챙긴다.

## 능동 vs 수동 — 모니터링의 두 패러다임

사용자 경험 측정에는 근본적으로 다른 두 접근이 있다. **능동 모니터링(active/synthetic monitoring)** 은 시스템이 직접 가짜 트래픽을 만들어 측정한다 — "5분마다 로봇이 우리 사이트에 접속해 응답을 확인". **수동 모니터링(passive/real user monitoring)** 은 실제 사용자가 만든 트래픽을 관찰한다 — "진짜 사용자 브라우저가 보내온 로딩 시간을 수집".

이 둘은 경쟁이 아니라 보완이다. Synthetics는 **선제적(proactive)** 이다 — 사용자가 아무도 없는 새벽에도 로봇이 돌아 장애를 먼저 발견한다. 그래서 가용성 모니터링과 알람의 일차 방어선이다. RUM은 **현실적(representative)** 이다 — 로봇이 흉내 못 내는 진짜 사용자의 다양한 기기·네트워크·지역에서의 실제 경험을 본다. 둘 다 필요하다: Synthetics로 "지금 사이트가 떠 있나"를 끊임없이 확인하고, RUM으로 "실제 사용자가 느끼는 성능이 어떤가"를 관찰한다.

> 💡 **관련 이론**: 능동/수동 모니터링의 구분은 네트워크 관리에서 수십 년 된 분류다. 능동 측정은 ICMP ping, traceroute, iperf처럼 프로브를 직접 쏘는 것이고, 수동 측정은 NetFlow, sFlow, 패킷 캡처처럼 실제 트래픽을 엿보는 것이다. 능동의 장점은 **통제된 반복성**(같은 측정을 일정 간격으로) — 트래픽이 없어도 측정 가능. 수동의 장점은 **현실 대표성** — 합성 부하가 못 잡는 실제 패턴. 신뢰성 공학의 **블랙박스 모니터링(증상, 사용자 관점) vs 화이트박스 모니터링(내부 상태)** 구분과도 겹친다. Synthetics는 블랙박스(밖에서 사용자처럼), 시스템 메트릭은 화이트박스(안에서 부품처럼)이고, RUM은 진짜 블랙박스(실제 사용자 그 자체)다. 좋은 옵저버빌리티는 셋을 모두 쓴다.

## CloudWatch Synthetics — 사용자를 흉내 내는 로봇

Synthetics는 **Canary**라는 스크립트를 정기적으로 실행해 사이트·API를 외부에서 점검한다. Canary는 Lambda 위에서 돌고, Puppeteer(Node.js) 또는 Selenium(Python)으로 실제 브라우저를 띄워 사용자처럼 행동한다.

```python
import urllib3
from aws_synthetics.common import synthetics_logger as logger

def heart():
    http = urllib3.PoolManager()
    r = http.request("GET", "https://api.example.com/health")
    if r.status != 200:
        raise Exception(f"Status {r.status}")
    if b'"status":"ok"' not in r.data:
        raise Exception("Body mismatch")
    logger.info(f"OK: {r.data}")

def handler(event, context):
    return heart()
```

Canary 종류가 시험 포인트다:

- **Heartbeat**: 단일 URL이 응답하는지
- **API**: REST API 엔드포인트 호출·검증
- **Broken Link Checker**: 사이트 내 링크를 크롤해 죽은 링크 탐지
- **Visual Monitoring**: 스크린샷을 기준 이미지와 픽셀 비교해 UI 변경/깨짐 탐지
- **GUI Workflow Builder**: 로그인→장바구니→결제 같은 멀티스텝 워크플로 시뮬레이션

Canary 실패 시 SNS로 알려 Slack/PagerDuty로 보낸다.

> 🔍 **더 깊이**: Synthetics의 **Visual Monitoring**은 컴퓨터 비전의 이미지 차이(image diffing) 기법을 쓴다. 기준 스크린샷과 현재 스크린샷을 픽셀 단위로 비교하되, 단순 픽셀 동일성이 아니라 허용 임계(예: 5% 이상 차이날 때만 실패)와 무시 영역(광고·타임스탬프처럼 매번 바뀌는 부분)을 설정한다. 이는 프론트엔드 테스트의 비주얼 회귀 테스팅(visual regression testing) — Percy, Chromatic, Playwright의 스크린샷 비교 — 과 같은 계보다. CSS 한 줄이 깨져 레이아웃이 무너졌는데 HTTP는 200을 반환하는, 기능 테스트가 못 잡는 시각적 회귀를 잡아낸다. "응답은 정상인데 화면이 깨졌다"는 정확히 Visual Monitoring의 영역이다.

> 📚 **사례**: 한 전자상거래 회사가 API 헬스체크(Heartbeat)만으로 모니터링하다 결제 단계에서만 발생하는 장애를 놓쳤다. 홈페이지·상품 페이지·로그인은 정상 응답했지만, 장바구니에서 결제로 넘어가는 멀티스텝 플로의 마지막 단계에서 서드파티 결제 위젯이 로드 실패했다. 단일 URL Heartbeat로는 이 다단계 경로를 못 잡았다. 교정은 GUI Workflow Canary로 "로그인→상품 담기→결제 진행"의 전체 여정을 5분마다 시뮬레이션하는 것이었다. 교훈: 핵심 사용자 여정(critical user journey)은 단일 엔드포인트가 아니라 끝까지 가는 멀티스텝 Canary로 검증해야 한다. 사용자는 단계의 합이 아니라 여정 전체로 경험한다.

## Synthetics 비용 — 주기의 경제학

Canary는 실행마다 Lambda 비용이 든다. 1분 주기면 한 달에 약 43,200회(60×24×30) 실행이다. Canary가 수십 개면 비용이 무시 못 할 수준이 된다.

원칙은 **주기를 중요도에 맞추는 것**이다. 결제·로그인 같은 critical path만 1분 주기로 촘촘히 보고, 일반 페이지는 5분·15분으로 늘린다. 모든 Canary를 1분으로 두는 건 과잉이다.

> 🔍 **더 깊이**: Canary 주기는 **탐지 시간(MTTD, mean time to detect)과 비용의 트레이드오프**다. 1분 주기면 장애를 최대 1분 안에 발견하지만 비용이 5분 주기의 5배다. 여기에 알람의 "M out of N"(Day 1)이 얽힌다 — 1회 실패로 알람을 울리면 일시적 네트워크 흔들림에 거짓 알람이 나므로, 보통 "3회 중 2회 실패"처럼 디바운스한다. 그러면 실제 탐지 시간은 주기 × 디바운스 횟수가 된다(1분 주기 + 3회 평가 = 최대 3분). SLO에서 허용하는 탐지 지연을 먼저 정하고, 거기서 역산해 주기와 디바운스를 정하는 게 올바른 순서다. "무조건 1분"이 아니라 "이 서비스의 MTTD 목표가 몇 분인가"가 먼저다.

## CloudWatch RUM — 실사용자의 브라우저에서

RUM(Real User Monitoring)은 정반대 방향이다. 로봇이 아니라 **진짜 사용자 브라우저**에서 텔레메트리를 수집한다. 페이지에 JS 스니펫을 심으면, 사용자가 페이지를 열 때마다 그 브라우저가 로딩 시간·JS 에러·HTTP 에러·클릭스트림을 AWS RUM 서비스로 보낸다.

```html
<script>
(function(n,i,v,r,s,c,x,z){
  x=window.AwsRumClient={q:[],n:n,i:i,v:v,r:r,c:c};
  // ...AWS RUM 클라이언트 코드...
})(
  'app-monitor-id','identity-pool-id','1.0.0','ap-northeast-2',
  'https://client.rum.us-east-1.amazonaws.com/1.x/cwr.js',
  {sessionSampleRate:1, guestRoleArn:'arn:aws:iam::...:role/RUM-Unauth',
   identityPoolId:'ap-northeast-2:abc'}
);
</script>
```

핵심이 두 가지다. 첫째, **인증**. 익명의 웹 방문자 브라우저가 어떻게 AWS에 데이터를 보낼 권한을 얻나? **Cognito Identity Pool**이 익명(guest) 자격을 발급한다. 사용자는 로그인하지 않아도, Identity Pool이 제한된 권한(RUM 데이터 전송만)의 임시 자격 증명을 내준다. 둘째, **샘플링**. `sessionSampleRate`가 수집 비율이다 — 1.0이면 100%, 0.1이면 10%. 트래픽이 많으면 비용 통제를 위해 낮춘다.

RUM이 수집하는 대표 지표는 **Web Vitals** — Google이 정의한 사용자 체감 성능 표준이다: LCP(Largest Contentful Paint, 주 콘텐츠 로딩), INP/FID(상호작용 반응성), CLS(레이아웃 안정성). 이 데이터는 CloudWatch 메트릭으로 흘러 알람을 걸 수 있다("LCP p99 > 3초 → 알림").

> 💡 **관련 이론**: RUM이 Cognito Identity Pool의 **익명 자격(unauthenticated identity)** 을 쓰는 건 "신뢰 없는 클라이언트에 최소 권한을 안전하게 위임"하는 문제의 표준 해법이다. 브라우저 JS는 본질적으로 신뢰할 수 없는 환경이라(누구나 코드를 보고 조작 가능) IAM 액세스 키를 절대 박으면 안 된다. Identity Pool은 STS(Security Token Service)를 통해 수명이 짧고 권한이 극히 제한된(RUM PutRumEvents만) 임시 자격을 발급한다. 이는 OAuth의 토큰 위임, 모바일 앱이 백엔드 키 없이 AWS 리소스에 접근하는 패턴과 같은 계보다 — 핵심은 **장기 비밀(long-lived secret)을 클라이언트에 두지 않고, 단기·최소권한 토큰으로 위임**하는 것이다. 신뢰 경계 밖의 코드에 권한을 주는 모든 문제의 정석이다.

> ⚠️ **함정**: RUM의 `sessionSampleRate`를 무조건 1.0(100%)으로 두면 고트래픽 사이트에서 비용이 폭증한다. RUM은 수집 이벤트 수로 과금되므로, 일 수백만 방문 사이트에서 100% 수집은 막대하다. 반대로 너무 낮추면(예: 1%) 드물게 발생하는 특정 브라우저·지역의 문제가 표본에 안 잡혀 통계적으로 사라진다. 표준 절충은 세그먼트별 차등 — 일반 트래픽은 10%, 신규 배포 직후나 VIP 세그먼트는 100%처럼 가치에 따라 비율을 나눈다. "전수 아니면 1%"의 양극단이 아니라 의도적 표본 설계가 필요하다.

## CloudWatch Evidently — 가설을 통계로 검증하다

Synthetics와 RUM이 "현재 경험을 측정"한다면, Evidently는 "변경이 경험을 개선하는가"를 실험으로 검증한다. 새 체크아웃 UI가 정말 전환율을 높이는지를 추측이 아니라 데이터로 판단한다.

Evidently의 구조는 **Project → Feature → Variation → Launch / Experiment**다:

- **Feature**: on/off 또는 다중 variation을 가진 기능 플래그
- **Launch**: 점진적 노출(10% → 50% → 100%) — 카나리 배포와 같은 발상
- **Experiment**: 두 variation에 트래픽을 나눠 지표를 통계적으로 비교

```bash
aws evidently create-project --name myapp
aws evidently create-feature \
  --project myapp --name new-checkout \
  --variations 'control={boolValue=false},treatment={boolValue=true}'
aws evidently start-launch \
  --project myapp --launch '...' \
  --groups 'control=10,treatment=10' \
  --metric-monitors '...'
```

Launch(점진 노출, 위험 관리)와 Experiment(통계 비교, 가설 검증)는 목적이 다르다. Launch는 "안전하게 굴려보자", Experiment는 "어느 쪽이 더 나은지 증명하자"다.

> 🔍 **더 깊이**: Evidently의 Experiment는 내부적으로 **베이지안 통계(Bayesian statistics)** 로 결과를 해석한다. 전통적 A/B 테스트는 빈도주의(frequentist) p-value와 고정 표본 크기를 쓰는데, 이는 "실험을 끝까지 돌리기 전에 들여다보면 안 된다"는 제약(peeking problem)이 있다. 베이지안 접근은 "treatment가 control보다 나을 확률"을 사후 분포로 계속 갱신하며 제공해, 실험 도중에도 "현재 treatment가 이길 확률 95%" 같은 직관적 판단을 준다. 이는 옵저버빌리티의 Anomaly Detection(Day 1)이 통계 모델을 쓰는 것과 같은 맥락 — AWS는 통계적 의사결정을 매니지드 서비스로 감싸 운영자가 통계 전문가가 아니어도 쓸 수 있게 한다. 단, A/B 실험의 함정(표본 크기 부족, 노출 편향, 다중 비교)은 도구가 자동으로 해결해주지 않으니 실험 설계 자체는 여전히 신중해야 한다.

> ⚠️ **2024 deprecation**: Evidently는 사용 중단(deprecation)이 예고되어 신규 채택은 권장되지 않고, AWS AppConfig의 Feature Flag로 통합되는 방향이다. 그러나 시험에는 여전히 출제되므로 개념(Launch=점진 노출, Experiment=통계 비교)과 위치(A/B 실험 도구)는 알아야 한다. 실무에서 새로 만든다면 AppConfig Feature Flag로 점진 롤아웃을 하고 통계 분석은 별도로 붙이는 방향이 현재 흐름이다.

## 세 도구의 구분 — 시험의 핵심

DOP 시험은 이 셋의 구분을 시나리오로 묻는다. 매칭표를 명확히:

| 시나리오 | 도구 |
|----------|------|
| 외부에서 API 가용성을 5분마다 확인 | **Synthetics** (Heartbeat/API) |
| 사용자가 페이지 로딩에 실제로 얼마나 걸리는지(LCP) | **RUM** |
| 멀티스텝 결제 플로 전체를 시뮬레이션 | **Synthetics** (GUI Workflow) |
| 페이지 내 죽은 링크 탐지 | **Synthetics** (Broken Link) |
| UI 픽셀 차이/깨짐 탐지 | **Synthetics** (Visual) |
| 새 기능을 10% 사용자에 노출 후 전환율 비교 | **Evidently** (또는 AppConfig + 분석) |
| 단순 기능 on/off + 점진 롤아웃 | **AppConfig Feature Flag** |
| 지역·ISP별 인터넷 경로 문제 | **Internet Monitor** |

추가로 2023-24에 등장한 진단 도구 둘 — **Internet Monitor**(특정 도시·ISP에서 우리 서비스 도달 문제, BGP/경로 변경 가시화)와 **Network Monitor**(VPC 내부 네트워크 헬스·도달성) — 도 알아두면 좋다.

> 🎯 **시나리오**: "글로벌 서비스인데 특정 국가 사용자들만 '느리다'고 한다. 우리 서버 메트릭(CPU·지연)은 전부 정상이다. 무엇으로 진단하나?" — 서버 메트릭이 정상인데 특정 지역만 느린 건 애플리케이션 밖, 즉 네트워크 경로/CDN/DNS 문제일 가능성이 높다. (1) RUM의 지역별 분리 데이터로 어느 지역·디바이스·브라우저가 느린지 실측하고, (2) Internet Monitor로 그 지역의 ISP·인터넷 경로 상태와 우리 서비스 도달성 문제를 확인한다. (3) 해당 지역에 Synthetics Canary를 배치(여러 리전에서 실행)해 외부 관점에서 재현한다. 핵심은 "서버는 정상인데 사용자가 느낄 때"는 시스템 메트릭이 아니라 사용자·네트워크 관점 도구(RUM/Synthetics/Internet Monitor)로 봐야 한다는 것이다.

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **능동(Synthetics)과 수동(RUM) 모니터링은 보완 관계**다 — Synthetics는 트래픽 없이도 선제적으로 가용성을 확인하는 블랙박스 프로브, RUM은 실사용자의 현실 경험을 보는 진짜 블랙박스. 둘째, **Synthetics는 Canary 5종**(Heartbeat/API/Broken Link/Visual/GUI Workflow)으로 사용자를 흉내 내며, 주기는 MTTD와 비용의 트레이드오프라 critical path만 촘촘히 본다. 셋째, **RUM은 Cognito Identity Pool 익명 자격으로 신뢰 없는 브라우저에 최소권한을 위임**하고 Web Vitals를 수집하며, 샘플링으로 비용을 통제한다. 넷째, **Evidently는 A/B 실험(베이지안 통계)** 으로 가설을 검증하지만 deprecation 예고로 AppConfig Feature Flag로 통합되는 방향이다.

다음 글에서는 Week 10 전체를 시나리오 문제로 종합한다. 메트릭·로그·워크로드 관찰성·사용자 경험 측정이 실제 인시던트 상황에서 어떻게 함께 쓰이는지를 사례로 엮는다.

---

## 📝 연습 문제

**문제 1.** "외부에서 API의 5분 단위 가용성을 트래픽 유무와 무관하게 측정"하려는 도구는?

A) CloudWatch Synthetics Canary
B) RUM
C) Evidently
D) Container Insights

**정답: A**

해설: Synthetics Canary는 시스템이 직접 시뮬레이션 트래픽을 만들어 외부에서 점검하는 능동(active) 모니터링이라, 실제 사용자가 없는 시간에도 가용성을 선제적으로 확인한다. RUM(B)은 실사용자 트래픽이 있어야 데이터가 모이는 수동 모니터링이고, Evidently(C)는 A/B 실험, Container Insights(D)는 컨테이너 자원 메트릭이다.

---

**문제 2.** 실제 사용자가 페이지 로딩에 체감하는 시간(LCP)을 지역·디바이스·브라우저별로 측정하려면?

A) Synthetics
B) RUM — 실사용자 브라우저에서 Web Vitals 수집
C) X-Ray
D) Logs Insights

**정답: B**

해설: RUM은 실사용자 브라우저에 심은 JS 스니펫으로 LCP/INP/CLS 같은 Web Vitals를 실측하고 지역·디바이스·브라우저별로 분리해 본다. 로봇이 흉내 못 내는 실제 사용자의 다양한 환경 경험을 포착하는 수동 모니터링이다. Synthetics(A)는 외부 프로브라 실사용자 체감이 아니고, X-Ray(C)는 백엔드 분산 추적, Logs Insights(D)는 로그 검색이다.

---

**문제 3.** API Heartbeat는 정상인데 "로그인→장바구니→결제" 마지막 단계에서만 장애가 난다. 이 멀티스텝 여정을 검증하려면?

A) 단일 URL Heartbeat Canary
B) Synthetics GUI Workflow Canary로 전체 여정을 시뮬레이션
C) RUM 샘플링 100%
D) Metric Filter

**정답: B**

해설: 단일 엔드포인트 Heartbeat는 각 단계가 개별적으로 응답하는지만 보고 단계 간 전이(결제 위젯 로드 등)를 못 잡는다. GUI Workflow Canary는 로그인→담기→결제의 전체 멀티스텝 플로를 실제 브라우저로 끝까지 시뮬레이션해 여정 중간의 장애를 탐지한다. critical user journey는 단계의 합이 아니라 끝까지 가는 워크플로로 검증해야 한다.

---

**문제 4.** RUM이 익명 웹 방문자 브라우저에서 안전하게 데이터를 전송받는 메커니즘은?

A) 페이지에 IAM 액세스 키 하드코딩
B) Cognito Identity Pool의 익명 자격으로 최소권한·단기 임시 자격 발급
C) API Key를 JS에 노출
D) OIDC 로그인 강제

**정답: B**

해설: 브라우저 JS는 신뢰할 수 없는 환경이라 장기 비밀(IAM 키·API Key)을 절대 박으면 안 된다. Cognito Identity Pool은 STS를 통해 수명이 짧고 권한이 RUM 이벤트 전송으로만 제한된 익명(guest) 임시 자격을 발급해, 로그인 없는 방문자도 안전하게 텔레메트리를 보낸다. IAM 키(A)·API Key(C) 노출은 심각한 보안 위험이고, OIDC 강제(D)는 익명 사용자 측정을 막는다.

---

**문제 5.** 새 체크아웃 UI가 전환율을 실제로 높이는지 10% 사용자에 노출해 통계적으로 비교하려면?

A) Synthetics
B) Evidently의 Experiment (또는 AppConfig Feature Flag + 자체 분석)
C) RUM만
D) Lambda Insights

**정답: B**

해설: Evidently Experiment는 control/treatment에 트래픽을 나눠 지표를 베이지안 통계로 비교해 "어느 쪽이 더 나은지"를 추측이 아닌 데이터로 판단한다. 단순 노출 측정인 RUM(C)이나 외부 프로브 Synthetics(A)와 달리, 변경의 효과를 가설 검증한다. Evidently가 deprecation 예고라 실무에서는 AppConfig Feature Flag + 별도 분석으로 대체하는 흐름이다.

---

**문제 6.** 서버 메트릭(CPU·지연)은 정상인데 특정 국가 사용자만 "느리다"고 한다. 진단 조합은?

A) 서버 CPU를 더 모니터링
B) RUM 지역별 분리 + Internet Monitor로 ISP·인터넷 경로 도달성 + 해당 지역 Synthetics Canary
C) Lambda 메모리 증설
D) retention 단축

**정답: B**

해설: 서버는 정상인데 특정 지역만 느린 건 애플리케이션 밖(네트워크 경로·CDN·DNS) 문제일 가능성이 높다. RUM 지역별 데이터로 어느 환경이 느린지 실측하고, Internet Monitor로 그 지역 ISP·경로 도달성 문제를 확인하며, 해당 리전에서 Synthetics Canary로 외부 재현한다. 사용자가 느낄 때는 시스템 메트릭이 아니라 사용자·네트워크 관점 도구로 봐야 한다.

---

**문제 7.** Synthetics Canary를 모든 검사에 1분 주기로 두는 것의 문제와 올바른 접근은?

A) 문제없다 — 전부 1분이 최선
B) 월 약 43,200회/Canary 실행 비용 — critical path만 1분, 일반은 5/15분으로 MTTD 목표에 맞춰 차등
C) 1분 주기는 불가능
D) 주기는 비용과 무관

**정답: B**

해설: Canary는 실행마다 Lambda 비용이 들어 1분 주기면 월 약 43,200회다. 주기는 탐지 시간(MTTD)과 비용의 트레이드오프이므로, 결제·로그인 같은 critical path만 1분으로 촘촘히 보고 일반 페이지는 5/15분으로 늘려 SLO의 탐지 지연 목표에서 역산해 정한다. "무조건 1분"은 과잉 비용이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, 능동(Synthetics)과 수동(RUM) 모니터링은 보완 관계로 — Synthetics는 트래픽 없이 선제적으로 가용성을 보는 블랙박스 프로브, RUM은 실사용자의 현실 경험을 보는 진짜 블랙박스다. 둘째, Synthetics Canary 5종(Heartbeat/API/Broken Link/Visual/GUI Workflow)은 사용자를 흉내 내며, 주기는 MTTD와 비용의 트레이드오프라 critical path만 촘촘히 본다. 셋째, RUM은 Cognito Identity Pool 익명 자격으로 신뢰 없는 브라우저에 단기·최소권한을 위임해 Web Vitals를 수집하고 샘플링으로 비용을 통제한다. 넷째, Evidently는 A/B 실험(베이지안 통계)으로 가설을 검증하지만 deprecation 예고로 AppConfig Feature Flag로 통합되는 방향이며, Internet Monitor/Network Monitor가 2023-24 추가 진단 도구다.
