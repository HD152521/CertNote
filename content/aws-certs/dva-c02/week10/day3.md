# Day 3 - CloudTrail과 EventBridge: 감사와 반응의 두 축

모니터링이 "지금 시스템이 건강한가"를 묻는다면, 감사(audit)는 "누가 무엇을 했는가"를 묻는다. 이 둘은 비슷해 보이지만 근본적으로 다른 질문이다. CPU가 80%라는 사실은 익명의 숫자지만, "어제 새벽 3시에 누가 프로덕션 S3 버킷을 삭제했는가"는 책임의 추적이다. AWS에서 전자가 CloudWatch라면, 후자를 담당하는 게 **CloudTrail** — 계정 안의 모든 API 호출을 기록하는 감사 로그다. 그리고 그 기록된 사건에 *자동으로 반응*하게 만드는 게 **EventBridge** — AWS의 서버리스 이벤트 버스다. 이 둘이 결합하면 "root 계정 로그인을 감지해 즉시 알림" 같은 보안 자동화가 만들어진다.

DVA-C02 시험에서 CloudTrail은 "누가 했는지 추적" 시나리오의 정답으로, EventBridge는 "이벤트에 반응하는 아키텍처"의 핵심으로 나온다. Management Events와 Data Events의 차이, 90일 보존의 의미, EventBridge의 패턴 매칭, 그리고 두 서비스를 잇는 보안 자동화 패턴이 단골 출제 포인트다. 이번 글은 CloudTrail이 왜 "모든 것은 API 호출"이라는 AWS의 근본 구조 위에 설 수 있는지, EventBridge가 CloudWatch Events에서 어떻게 진화했는지, 그리고 이벤트 기반 아키텍처의 철학을 깊이 들여다본다.

## CloudTrail이 모든 것을 기록할 수 있는 이유: API가 곧 컨트롤 플레인

CloudTrail이 "계정 안 모든 행동"을 기록할 수 있는 건 AWS의 근본 설계 때문이다. AWS에서 *모든 작업은 API 호출이다*. 콘솔에서 버튼을 클릭하든, CLI로 명령을 치든, SDK로 코드를 짜든, 최종적으로는 전부 AWS의 컨트롤 플레인 API(`RunInstances`, `DeleteBucket`, `CreateUser`...)를 때린다. 콘솔조차 내부적으로는 이 API들을 호출하는 웹 프론트엔드일 뿐이다.

이 단일 진입점 구조 덕분에 CloudTrail은 API 게이트웨이 한 곳에서 모든 호출을 가로채 기록하면 된다. "누가(IAM principal), 언제(timestamp), 어디서(sourceIPAddress), 무엇을(eventName), 어떤 파라미터로, 성공했는지" — 이 모든 게 API 호출 메타데이터에 이미 들어 있다. CloudTrail은 새로운 추적 메커니즘을 발명한 게 아니라, AWS가 본래 "모든 것이 API"라는 구조라서 그 길목에 기록기를 단 것이다.

> 💡 **관련 이론**: "컨트롤 플레인(control plane)과 데이터 플레인(data plane)의 분리"는 네트워킹·분산 시스템의 핵심 개념이다. 컨트롤 플레인은 "리소스를 만들고 설정을 바꾸는" 관리 작업(EC2 생성, 보안 그룹 변경)이고, 데이터 플레인은 "실제 일을 하는" 작업(S3에서 객체를 읽고, DynamoDB에서 항목을 조회)이다. CloudTrail의 **Management Events**(컨트롤 플레인)와 **Data Events**(데이터 플레인) 구분이 정확히 이 경계를 따른다. 그리고 이 구분이 기본값의 차이를 설명한다 — 컨트롤 플레인 작업은 빈도가 낮고(하루에 인스턴스 몇 개 만드는 정도) 보안상 중요해 기본 기록되지만, 데이터 플레인 작업(S3 GetObject)은 초당 수만 건씩 일어나 전부 기록하면 로그가 폭발하므로 기본 비활성이다.

> ⚠️ **함정**: "S3에서 특정 파일을 *누가* 다운로드했는지" 또는 "Lambda가 *언제* 호출됐는지"를 추적하려면 **Data Events를 명시적으로 활성화**해야 한다. Management Events만 켜진 기본 상태에서는 이런 데이터 접근이 기록되지 않는다. 시험에서 "S3 객체 GetObject 추적"이 보이면 Data Events 활성화가 정답이고, 추가 비용이 든다는 점도 함께 출제된다. 반대로 "버킷 정책을 누가 바꿨나"(`PutBucketPolicy`)는 Management Event라 기본 기록된다.

## 90일이라는 숫자: 조회 캐시와 영구 보존의 분리

CloudTrail 시험 문제에서 가장 많이 나오는 숫자가 "기본 90일 보존"이다. 그런데 이 90일을 정확히 이해하지 못하면 함정에 빠진다. 90일은 **CloudTrail 콘솔/API로 직접 조회 가능한 이벤트 히스토리**의 보존 기간이지, "로그가 90일 후 사라진다"는 뜻이 아니다.

CloudTrail은 두 가지를 분리한다. 하나는 별도 설정 없이 항상 켜져 있는 **Event History** — 최근 90일의 Management Events를 콘솔에서 바로 검색할 수 있는 조회 캐시다. 다른 하나는 사용자가 만드는 **Trail** — 이벤트를 S3 버킷으로 *영구* 전달해 원하는 만큼 보관하는 것이다. 90일 너머의 감사나 컴플라이언스가 필요하면 Trail을 만들어 S3에 적재해야 한다.

| 저장소 | 보존 | 용도 |
|--------|------|------|
| Event History (기본) | 90일 | 최근 활동 빠른 조회 |
| Trail → S3 | 무제한 (사용자 설정) | 영구 감사, Athena 분석 |
| CloudTrail Lake | 7일~10년 | 관리형 데이터 레이크, SQL 쿼리 |

> 🔍 **더 깊이**: Trail을 만들 때 "무결성(integrity)"이 중요한 이유가 있다. 감사 로그의 핵심 가치는 "변조되지 않았음"인데, 공격자가 침입 후 자기 흔적이 담긴 CloudTrail 로그를 지우거나 고치면 감사가 무력화된다. 그래서 CloudTrail은 **log file integrity validation**을 제공한다 — 로그 파일마다 SHA-256 해시를 만들고, 그 해시들을 다시 디지털 서명(SHA-256 with RSA)으로 묶은 다이제스트 파일을 별도로 저장한다. 누군가 로그 파일을 한 글자라도 바꾸면 해시가 안 맞아 변조가 드러난다. 이는 블록체인의 해시 체이닝과 같은 원리로, "사후에 고칠 수 없는 기록"을 암호학적으로 보장하는 기법이다. 감사 로그 S3 버킷에 MFA Delete와 별도 계정 격리를 거는 것도 같은 방어 심층화의 일부다.

> 📚 **사례**: CloudTrail Lake(2022)는 S3 + Athena 조합의 운영 부담을 줄이려 나왔다. 기존엔 Trail로 S3에 로그를 쌓고, 분석하려면 Athena 테이블을 직접 정의하고 파티션을 관리해야 했다. CloudTrail Lake는 이벤트를 관리형 데이터 레이크에 ORC 형식으로 자동 적재하고 SQL 쿼리를 바로 제공해, 인프라 관리 없이 최대 10년치를 분석하게 한다. 시험에서 "장기간(수년) CloudTrail 데이터를 SQL로 분석"이 보이면 CloudTrail Lake가 깔끔한 정답이다.

## EventBridge: CloudWatch Events의 진화와 이벤트 버스라는 발상

EventBridge의 정체를 이해하는 가장 빠른 길은 그 역사다. 원래 이 기능은 **CloudWatch Events**(2016)라는 이름으로 CloudWatch의 하위 기능이었다 — "EC2 상태가 바뀌면 Lambda 실행" 같은 규칙을 거는 도구였다. 2019년 AWS는 이걸 **EventBridge**로 리브랜딩하면서 SaaS 파트너 이벤트(Datadog, Zendesk, Salesforce 등)와 사용자 정의 이벤트 버스를 추가해 독립 서비스로 격상시켰다. 그래서 시험에 "CloudWatch Events와 EventBridge의 관계"가 나오면 답은 **"같은 서비스, EventBridge가 상위 호환 업그레이드"** 다. 옛 CloudWatch Events API는 여전히 작동하지만 EventBridge가 그 상위 집합이다.

이벤트 버스(event bus)라는 발상 자체가 아키텍처 패턴이다. 전통적으로 서비스 A가 B에게 무언가를 알리려면 A가 B를 직접 호출했다(point-to-point). 서비스가 늘면 이 직접 연결이 N×N으로 폭발한다. 이벤트 버스는 가운데 "버스"를 두고, A는 "주문이 생성됨"이라는 이벤트를 버스에 *발행*만 하고 누가 받는지 모른다. B·C·D는 버스에서 그 이벤트를 *구독*한다. 발행자와 구독자가 서로를 모르는 이 **느슨한 결합(loose coupling)** 이 이벤트 기반 아키텍처의 핵심이다.

```json
{
  "source": ["aws.s3"],
  "detail-type": ["Object Created"],
  "detail": {
    "bucket": { "name": ["my-bucket"] },
    "object": { "size": [{ "numeric": [">", 1000000] }] }
  }
}
```

> 💡 **관련 이론**: 이벤트 버스는 메시징의 **발행-구독(publish-subscribe)** 패턴의 구현이다. 1980년대 분산 시스템 연구에서 나온 이 패턴의 핵심 가치는 "시간적·공간적 디커플링"이다 — 발행자와 구독자가 동시에 살아 있지 않아도 되고(시간적), 서로의 위치를 몰라도 된다(공간적). EventBridge가 SNS와 다른 결정적 지점은 **콘텐츠 기반 라우팅(content-based routing)** 이다. SNS는 주제(topic)를 구독한 모두에게 같은 메시지를 뿌리지만, EventBridge는 이벤트 *내용*을 검사해(위 JSON처럼 "버킷 이름이 X이고 객체 크기가 1MB 초과") 조건에 맞는 대상으로만 보낸다. 이 패턴 매칭이 EventBridge를 단순 알림 도구가 아니라 라우팅 엔진으로 만든다.

> 🔍 **더 깊이**: EventBridge의 패턴 매칭 연산자(`prefix`, `suffix`, `anything-but`, `numeric`, `exists`, `wildcard` 등)는 이벤트를 *받기 전에* 필터링한다는 게 핵심이다. 만약 모든 이벤트를 일단 Lambda로 보내 Lambda 안에서 "이건 내 관심사가 아니네" 하고 버린다면, 그 Lambda 호출 비용과 실행 시간이 전부 낭비다. 패턴 매칭을 버스 레벨에서 하면 관심 없는 이벤트는 Lambda를 아예 깨우지 않는다 — "필터를 가능한 한 소스 가까이 민다(push down the filter)"는 건 데이터 처리 시스템 전반의 최적화 원칙이고, SQL 쿼리 옵티마이저가 WHERE 절을 스캔 단계로 내리는 것과 같은 발상이다.

## EventBridge Pipes와 Scheduler: 점-투-점 통합과 스케줄링의 분리

EventBridge는 단순 이벤트 버스를 넘어 두 가지 기능을 더 흡수했다. **Pipes**(2022)는 소스(SQS·Kinesis·DynamoDB Streams·MQ)에서 타깃까지 점-투-점으로 잇되, 중간에 필터링과 강화(enrichment)를 끼울 수 있는 통합 파이프라인이다. 예전엔 "SQS 메시지를 변환해 Step Functions로 보내기" 위해 Lambda를 직접 짜야 했지만, Pipes는 이 배관(plumbing) 코드를 선언적 설정으로 대체한다.

```
Source (SQS/Kinesis/DDB Streams) → Filter → Enrichment(Lambda·API) → Target
```

**EventBridge Scheduler**(2022)는 cron/rate 스케줄링을 별도 기능으로 분리·강화한 것이다. 기존엔 EventBridge Rule에 `schedule` 표현식을 붙여 정기 실행을 했는데, Scheduler는 백만 개 규모의 스케줄과 일회성 일정(one-time)까지 관리한다.

```
rate(5 minutes)        # 주기 방식
cron(0 9 * * ? *)      # 매일 9시 — 특정 시각
```

> ⚠️ **함정**: cron과 rate의 차이가 시험에 나온다. `rate(...)`는 "마지막 실행으로부터 N 간격마다"라는 *주기*이고, `cron(...)`은 "매일 9시"처럼 *특정 시각*을 지정한다. "매주 월요일 오전 8시에만"처럼 캘린더 기반이면 cron, "5분마다 계속"이면 rate다. 또 EventBridge Scheduler와 일반 Rule(schedule)의 구분도 나오는데, 대규모·일회성·세밀한 재시도가 필요하면 Scheduler, 단순 정기 규칙이면 Rule로 갈린다.

> 📚 **사례**: 가장 자주 출제되는 보안 자동화 패턴이 "root 계정 로그인 즉시 알림"이다. root 계정은 모든 권한을 가져 일상 작업에 쓰면 안 되는데, 누군가 root로 로그인하면 그 자체가 보안 신호다. 흐름은 이렇다 — root 로그인 → CloudTrail이 `ConsoleLogin` 이벤트 기록 → EventBridge Rule이 `userIdentity.type = "Root"` 패턴으로 필터 → Lambda 또는 직접 SNS로 라우팅 → 운영자에게 Slack·이메일 통지. CloudTrail(감지)과 EventBridge(반응)가 결합해 "사람이 로그를 뒤지기 전에 시스템이 먼저 반응"하는 전형적 패턴이고, 거의 모든 AWS 보안 베스트프랙티스 문서의 첫 항목이다.

## 정리하며

CloudTrail은 "AWS에서 모든 것은 API 호출"이라는 근본 구조 덕에 한 길목에서 모든 행동을 기록한다. Management Events(컨트롤 플레인)와 Data Events(데이터 플레인)의 구분은 빈도와 보안 중요도의 차이를 반영하고, 90일은 "조회 캐시"이지 영구 보존이 아니라 장기 감사는 Trail → S3 또는 CloudTrail Lake로 간다. EventBridge는 CloudWatch Events의 진화형으로, 콘텐츠 기반 라우팅과 느슨한 결합으로 이벤트 기반 아키텍처를 떠받친다. 그리고 두 서비스의 결합("root 로그인 → 즉시 알림")이 "사람이 알아채기 전에 시스템이 반응"하는 보안 자동화의 원형이다.

다음 글에서는 CloudWatch의 고급 기능 — 통합 대시보드, 컨테이너 레벨 모니터링(Container Insights), 합성 모니터링(Synthetics), ML 기반 이상 탐지로 모니터링의 깊이를 더한다.

---

## 📝 연습 문제

**문제 1.** S3 버킷에서 특정 객체를 *누가, 언제* 다운로드(GetObject)했는지 추적하려 한다. CloudTrail 기본 설정으로 가능한가?

A) 가능하다 — Management Events로 자동 기록된다

B) 불가능 — Data Events를 명시적으로 활성화해야 하며 추가 비용이 든다

C) CloudWatch Logs를 켜면 된다

D) X-Ray로 추적한다

**정답: B**

해설: S3 GetObject는 **데이터 플레인** 작업(Data Event)이라 기본 비활성이다. 초당 수만 건씩 일어나는 데이터 접근을 전부 기록하면 로그가 폭발하므로 AWS가 기본 끔으로 둔다. 객체 접근 추적이 필요하면 **Data Events를 명시적으로 활성화**해야 하고 추가 비용이 발생한다. 반면 "버킷 정책을 누가 바꿨나"(`PutBucketPolicy`)는 컨트롤 플레인(Management Event)이라 기본 기록된다. 이 컨트롤/데이터 플레인 구분이 기본값 차이의 핵심이다.

---

**문제 2.** CloudTrail의 "기본 90일 보존"에 대한 가장 정확한 설명은?

A) 모든 CloudTrail 로그는 90일 후 영구 삭제된다

B) Event History(콘솔 조회 캐시)가 90일이며, 영구 보존은 Trail로 S3에 적재해야 한다

C) Data Events만 90일 보존된다

D) 90일 후 자동으로 CloudTrail Lake로 이동한다

**정답: B**

해설: 90일은 별도 설정 없이 켜져 있는 **Event History**(최근 Management Events 조회 캐시)의 보존 기간이지 "로그가 사라진다"는 뜻이 아니다. 영구 보존·컴플라이언스가 필요하면 **Trail**을 만들어 S3로 무제한 적재하거나, CloudTrail Lake(7일~10년)를 쓴다. "90일 너머의 감사"가 보이면 Trail → S3 또는 Lake가 정답이다.

---

**문제 3.** CloudWatch Events와 Amazon EventBridge의 관계로 옳은 것은?

A) 완전히 다른 별개 서비스다

B) EventBridge는 CloudWatch Events의 상위 호환 진화형(리브랜딩+확장)이다

C) CloudWatch Events가 더 신형이다

D) EventBridge는 X-Ray의 일부다

**정답: B**

해설: 2016년 CloudWatch Events로 시작한 기능이 2019년 **EventBridge**로 리브랜딩되며 SaaS 파트너 이벤트·커스텀 버스 등이 추가돼 독립 서비스로 격상됐다. 옛 CloudWatch Events API는 여전히 작동하지만 EventBridge가 그 상위 집합이다. 따라서 "같은 서비스, EventBridge가 업그레이드 버전"이 정답이다.

---

**문제 4.** EventBridge가 SNS와 구별되는 결정적 특징은?

A) EventBridge가 더 빠르다

B) EventBridge는 이벤트 내용을 검사해 조건에 맞는 대상으로만 보내는 콘텐츠 기반 라우팅을 한다

C) SNS는 Lambda를 호출할 수 없다

D) EventBridge는 무료다

**정답: B**

해설: SNS는 주제를 구독한 모두에게 같은 메시지를 뿌리는 단순 발행-구독이다. **EventBridge**는 이벤트 *내용*을 패턴(`source`, `detail-type`, `numeric` 비교 등)으로 검사해 조건에 맞는 대상으로만 라우팅하는 **콘텐츠 기반 라우팅** 엔진이다. 이 패턴 매칭을 버스 레벨에서 하므로 관심 없는 이벤트는 대상(예: Lambda)을 아예 깨우지 않아 비용도 절감된다. C) SNS도 Lambda 호출은 가능하다.

---

**문제 5.** root 계정 콘솔 로그인을 실시간 감지해 즉시 알림을 보내는 표준 패턴은?

A) IAM 정책으로 root 로그인을 차단

B) CloudTrail이 ConsoleLogin 기록 → EventBridge Rule이 root 필터 → SNS 알림

C) CloudWatch 기본 지표 알람

D) GuardDuty 단독으로 충분

**정답: B**

해설: root 로그인 → CloudTrail이 `ConsoleLogin` 이벤트 기록 → **EventBridge Rule**이 `userIdentity.type = "Root"` 패턴으로 필터 → Lambda/SNS로 통지가 표준 보안 자동화 패턴이다. CloudTrail(감지)과 EventBridge(반응)의 결합으로 "사람이 로그를 뒤지기 전에 시스템이 먼저 반응"한다. A) root 로그인 자체를 IAM으로 막을 수는 없다(root는 IAM 위에 있다). C) 로그인은 지표가 아니라 이벤트다.

---

**문제 6.** "매주 월요일 오전 8시에만" Lambda를 실행하려 한다. 적절한 스케줄 표현식 종류는?

A) `rate(...)` — 주기 방식

B) `cron(...)` — 특정 시각/캘린더 기반

C) CloudWatch 알람

D) SQS 지연 큐

**정답: B**

해설: `rate(...)`는 "마지막 실행으로부터 N 간격마다"라는 주기이고, `cron(...)`은 "매주 월요일 8시"처럼 특정 시각·캘린더 기반 일정을 표현한다. 요구가 캘린더 기반(특정 요일·시각)이므로 cron이 맞다. 대규모(백만 개)·일회성·세밀한 재시도가 필요하면 EventBridge Scheduler를, 단순 정기 규칙이면 Rule(schedule)을 쓴다.

---

**문제 7.** SQS 큐의 메시지를 필터링·변환해 Step Functions로 전달하는 통합을 Lambda 배관 코드 없이 선언적으로 구성하려 한다. 가장 적절한 것은?

A) EventBridge Pipes

B) SNS 팬아웃

C) CloudWatch Logs Subscription Filter

D) Kinesis Data Analytics

**정답: A**

해설: **EventBridge Pipes**(2022)는 소스(SQS·Kinesis·DynamoDB Streams·MQ)에서 타깃까지 점-투-점으로 잇되 중간에 필터링과 강화(enrichment)를 끼우는 통합 파이프라인이다. 예전에 직접 짜야 했던 "받기 → 필터 → 변환 → 전달" 배관 코드를 선언적 설정으로 대체한다. C) Subscription Filter는 CloudWatch Logs 전용이고, B) SNS는 콘텐츠 기반 필터링·소스 통합 범위가 다르다.
