# Day 1 - CloudWatch: 관찰성은 왜 메트릭·로그·트레이스 세 기둥으로 갈라졌나

운영 중인 시스템에서 가장 비싼 순간은 "장애가 났는데 원인을 모르는 시간"이다. 서버가 죽은 게 아니라 응답이 느려졌을 뿐인데, 그게 DB 때문인지 네트워크 때문인지 애플리케이션 코드 때문인지 알 수 없으면 엔지니어는 추측으로 재시작을 반복하고 그 사이 매출은 빠져나간다. 관찰성(Observability)이라는 개념이 단순한 "모니터링"과 구분되어 등장한 이유가 여기 있다. 모니터링은 "내가 미리 정의한 질문(CPU가 80% 넘었나?)에 답하는 것"이고, 관찰성은 "미리 예상하지 못한 질문(왜 이 특정 사용자만 느린가?)에도 데이터로 답할 수 있는 능력"이다. 그리고 이 능력은 메트릭·로그·트레이스라는 세 종류의 데이터를 교차로 엮을 때만 나온다.

AWS가 2009년 출시한 **CloudWatch**는 처음엔 EC2 CPU 사용률을 그래프로 보여주는 단순한 메트릭 도구였다. 하지만 클라우드가 단일 서버에서 수백 개의 마이크로서비스·Lambda·컨테이너로 분화하면서, CloudWatch도 Metrics(2009) → Logs(2014) → Alarms 고도화 → Logs Insights(2018) → Container/Lambda Insights → Synthetics·RUM으로 계속 확장됐다. 이 글은 CloudWatch의 기능을 나열하는 대신, "왜 메트릭과 로그가 다른 저장 구조를 가져야 했는지", "고해상도 메트릭이 왜 비싼지", "Subscription Filter가 어떤 분산 시스템 문제를 푸는지"를 따라가며 SAA 시험에서 운영 도메인(Operational Excellence)이 묻는 본질을 짚는다.

## 메트릭과 로그는 왜 같은 저장소에 넣으면 안 되나

CloudWatch를 처음 배우면 "메트릭과 로그가 왜 따로 있지? 둘 다 시간에 따라 쌓이는 데이터 아닌가?"라는 의문이 든다. 실제로 둘은 근본적으로 다른 데이터 모델이고, 이 차이가 비용·쿼리 성능·보존 전략을 전부 가른다.

메트릭은 **시계열(time-series) 숫자**다. `AWS/EC2` 네임스페이스의 `CPUUtilization`이라는 메트릭에 `InstanceId=i-123`이라는 차원(Dimension)을 붙이면, 그건 "특정 인스턴스의 CPU가 시간축 위에서 그리는 하나의 선"이다. 시계열 데이터의 핵심 특성은 **사전 집계(pre-aggregation)가 가능**하다는 것이다. CloudWatch는 들어온 raw 데이터포인트를 그대로 저장하지 않고, 1분·5분·1시간 단위로 min/max/sum/avg/count를 미리 계산해 압축한다. 그래서 6개월 전 CPU 추이를 조회해도 빠르고, 저장 비용도 낮다. 대신 "이 정확한 1초에 무슨 일이 있었나"는 알 수 없다 — 이미 집계되어 사라졌기 때문이다.

로그는 **구조화되지 않은(또는 반구조화된) 텍스트 이벤트**다. "2026-05-29T10:23:01 ERROR user_id=4823 payment failed: gateway timeout"이라는 한 줄은 집계할 수 없다. 각 줄이 고유한 맥락을 담고 있어서 버릴 수 없고, 그래서 로그는 raw 그대로 저장된다. 저장 비용이 메트릭보다 훨씬 크고, 쿼리도 전체를 스캔해야 한다(그래서 Logs Insights가 필요하다). 대신 "그 1초에 정확히 무슨 일이 있었나"를 답할 수 있다.

> 💡 **관련 이론**: 이 분리는 시계열 데이터베이스(TSDB)와 로그 검색 엔진의 아키텍처 차이 그 자체다. Prometheus·InfluxDB 같은 TSDB는 메트릭 이름+레이블 조합마다 압축된 시계열을 저장하고 다운샘플링(downsampling)으로 오래된 데이터를 줄인다. Elasticsearch·Loki 같은 로그 엔진은 역색인(inverted index)이나 라벨 기반 청크로 텍스트를 검색 가능하게 만든다. CloudWatch는 한 콘솔 안에 이 두 엔진을 다 넣었지만 내부 저장 구조는 완전히 다르고, 그래서 메트릭은 PutMetricData, 로그는 PutLogEvents로 API조차 분리되어 있다.

> 🔍 **더 깊이**: CloudWatch 메트릭의 보존 정책은 해상도에 따라 자동으로 다운샘플링된다 — 1분 해상도 데이터는 15일, 5분 해상도는 63일, 1시간 해상도는 455일(15개월) 보관된다. 즉 6개월 전 데이터를 보면 자동으로 1시간 단위로 뭉쳐진 값만 남아 있다. 이건 버그가 아니라 의도된 다운샘플링이고, 장기 추세 분석에는 충분하지만 "3개월 전 그 사고의 1분 단위 스파이크"를 보려면 이미 늦다. 그래서 컴플라이언스나 사후 분석이 중요하면 Metric Streams로 raw 메트릭을 S3/Kinesis에 따로 빼둬야 한다.

EC2의 메모리·디스크 사용률이 기본 메트릭에 없다는 시험 단골 함정도 이 구조에서 나온다. CPU·네트워크·디스크 I/O는 **하이퍼바이저(Nitro/Xen) 레벨**에서 관측 가능하다 — AWS가 가상화 계층에서 직접 보기 때문이다. 하지만 메모리 사용률과 디스크 여유 공간은 **게스트 OS 안쪽**의 정보다. 하이퍼바이저는 게스트에 4GB를 할당했다는 것만 알지, 그 안에서 OS가 3GB를 쓰는지 1GB를 쓰는지 모른다. 그래서 메모리·디스크 메트릭을 얻으려면 게스트 안에 **CloudWatch Agent**를 설치해 OS가 직접 보고하게 해야 한다. 이건 AWS의 한계가 아니라 가상화의 격리 경계가 만드는 본질적 제약이다.

> ⚠️ **함정**: "EC2 메모리 사용률 알람을 만들고 싶다"는 시나리오의 정답은 항상 "CloudWatch Agent 설치"다. IAM Role 누락이나 리전 문제로 착각하기 쉽지만, 표준 메트릭에 메모리가 아예 존재하지 않는다는 게 핵심이다. 더 나아가 컨테이너 환경에서는 Agent 대신 Container Insights를, Lambda에서는 Lambda Insights를 쓰는 식으로 "게스트 내부 관측"의 책임 주체가 환경마다 달라진다.

## 고해상도 메트릭과 PutMetricData가 비싼 진짜 이유

CloudWatch 사용자 정의 메트릭(custom metric)은 `PutMetricData` API로 올린다. 표준 메트릭이 1분 해상도인 반면, 사용자 정의 메트릭은 1초(고해상도) 해상도까지 올릴 수 있다. 그런데 비용 구조를 보면 고해상도 메트릭은 표준보다 훨씬 비싸고, 메트릭 하나가 차원 조합마다 별개로 과금된다. 왜 이렇게 비쌀까.

핵심은 **카디널리티(cardinality) 폭발**이다. 메트릭은 "메트릭 이름 + 차원 조합" 단위로 하나씩 저장된다. `RequestLatency`라는 메트릭에 `Service`, `Region`, `Endpoint`, `UserId` 네 차원을 붙이면, 서비스 5개 × 리전 3개 × 엔드포인트 20개 × 사용자 10만 명 = 3천만 개의 개별 시계열이 생긴다. 각 시계열은 따로 저장·집계·과금된다. 그래서 "사용자 ID를 차원으로 넣는" 안티패턴은 비용을 천문학적으로 늘린다. 차원은 카디널리티가 낮은 것(서비스, 리전, 엔드포인트)만 써야 하고, 사용자 단위 추적은 메트릭이 아니라 로그/트레이스의 영역이다.

> 🔍 **더 깊이**: 이 카디널리티 문제는 모든 시계열 시스템의 근본 한계다. Prometheus 운영자가 가장 두려워하는 사고가 "high cardinality label"인데, 누군가 실수로 요청 ID나 타임스탬프를 레이블로 넣으면 시계열 수가 무한히 늘어 TSDB 메모리가 터진다. CloudWatch는 이걸 과금으로 방어한다 — 카디널리티가 폭발하면 비용이 폭발하므로 자연스럽게 억제된다. 그래서 "메트릭 차원에 무엇을 넣을 것인가"는 비용 설계이자 아키텍처 결정이다.

EMF(Embedded Metric Format)는 이 긴장을 우아하게 푼다. 로그 한 줄 안에 특수한 JSON 구조로 메트릭을 임베드하면, CloudWatch가 그 로그를 받아 자동으로 메트릭을 추출한다. 즉 애플리케이션은 PutMetricData를 호출하지 않고 로그만 한 번 쓰는데, CloudWatch가 거기서 메트릭과 로그를 동시에 뽑아낸다. 고볼륨 환경에서 PutMetricData API 호출 횟수와 비용을 줄이면서, 같은 로그 라인에서 "집계용 메트릭"과 "상세 디버깅용 로그"를 모두 얻는 패턴이다. Lambda처럼 stdout이 자동으로 CloudWatch Logs로 가는 환경과 특히 잘 맞는다.

## Alarm의 상태 기계와 INSUFFICIENT_DATA의 의미

CloudWatch Alarm은 단순한 임계값 비교처럼 보이지만, 실제로는 OK / ALARM / INSUFFICIENT_DATA 세 상태를 가진 상태 기계(state machine)다. 그리고 이 세 번째 상태 INSUFFICIENT_DATA를 제대로 이해하는 게 알람 설계의 분기점이다.

알람은 "평가 기간(evaluation period) 동안 N개 중 M개 데이터포인트가 임계값을 넘으면 ALARM"이라는 식으로 동작한다(`evaluation-periods`와 `datapoints-to-alarm`). 그런데 데이터포인트 자체가 없으면? 예를 들어 트래픽이 0이라 요청 메트릭이 보고되지 않으면, 알람은 OK도 ALARM도 아닌 INSUFFICIENT_DATA가 된다. 여기서 흔한 사고가 발생한다 — "에러율이 임계값을 넘으면 알람"으로 설정했는데, 서비스가 완전히 죽어 요청 자체가 0이 되면 에러율 메트릭이 보고되지 않아 알람이 울리지 않는다. 서비스가 완전히 다운됐는데 모니터링은 조용한 최악의 시나리오다.

> ⚠️ **함정**: "데이터 없음(missing data)" 처리 정책을 명시적으로 골라야 한다. CloudWatch는 missing data를 `notBreaching`(정상으로 간주), `breaching`(이상으로 간주), `ignore`(상태 유지), `missing`(기본, INSUFFICIENT_DATA) 중 하나로 처리한다. 가용성 알람은 보통 missing을 `breaching`으로 설정해야 "트래픽이 끊긴 것도 장애"로 잡힌다. 이걸 기본값으로 두면 죽은 서비스가 조용히 넘어간다.

Alarm의 액션이 SNS뿐 아니라 EC2 Auto Recovery, ASG Scaling, Systems Manager로 직접 연결된다는 점도 설계 사상을 보여준다. 알람은 사람에게 알리는 도구일 뿐 아니라 **자동 치유(self-healing)의 트리거**다. EC2 StatusCheckFailed_System 메트릭에 Auto Recovery 액션을 걸면, 하드웨어 장애 시 사람이 개입하지 않아도 인스턴스가 같은 ID·같은 IP로 정상 하드웨어에 재배치된다. Composite Alarm은 여러 알람을 AND/OR로 조합해 "DB 알람 AND 캐시 알람이 동시에 울릴 때만" 같은 정교한 조건을 만들어 알람 폭풍(alarm storm)을 억제한다. Anomaly Detection은 ML로 메트릭의 정상 밴드를 학습해 고정 임계값 없이 "평소와 다름"을 잡는데, 트래픽이 시간대·요일마다 크게 변하는 서비스에서 고정 임계값이 무용지물일 때 쓴다.

> 📚 **사례**: 많은 조직이 알람을 너무 많이 만들어 "알람 피로(alarm fatigue)"에 빠진다. 하루 수백 개의 알람이 울리면 엔지니어는 전부 무시하게 되고, 그러다 진짜 중요한 알람을 놓친다. Google SRE 책이 강조하는 원칙이 "모든 알람은 사람의 즉각적 행동을 요구해야 한다 — 그렇지 않으면 알람이 아니라 노이즈다"이다. CloudWatch에서 이걸 실현하려면 Composite Alarm으로 상관된 알람을 묶고, 자동 복구 가능한 것은 SNS 대신 자동화 액션으로 돌려 사람의 받은편지함에 도달하는 알람 수를 줄여야 한다.

## Subscription Filter가 푸는 분산 시스템 문제

CloudWatch Logs의 Subscription Filter는 시험에 "ERROR 로그를 실시간으로 처리하라"는 형태로 자주 나오는데, 그 뒤에는 중요한 분산 시스템 설계 원리가 있다. 로그를 실시간으로 어딘가로 보내야 할 때, "주기적으로 폴링해서 새 로그를 읽는" 방식과 "로그가 들어오는 즉시 푸시하는" 방식 중 무엇을 택할 것인가의 문제다.

폴링 방식은 단순하지만 두 가지 문제가 있다. 폴링 주기가 길면 실시간성이 떨어지고, 주기가 짧으면 대부분의 폴링이 "새 로그 없음"을 반환하는 낭비가 된다. 또 폴링 주체가 로그의 어디까지 읽었는지 커서를 직접 관리해야 하고, 그 주체가 죽으면 로그를 놓치거나 중복 처리한다. Subscription Filter는 **푸시 기반 구독 모델**로 이걸 푼다 — 로그 그룹에 필터 패턴을 등록하면, 패턴에 매칭되는 로그 이벤트가 들어오는 즉시 CloudWatch가 대상(Lambda / Kinesis Data Streams / Firehose)으로 밀어 넣는다. 폴링도, 커서 관리도 없다.

대상이 셋으로 나뉘는 것도 의도가 있다. **Lambda**는 이벤트당 즉시 함수를 호출하는 저지연·소량 처리용(루트 로그인 즉시 알림 같은 것). **Kinesis Data Streams**는 고볼륨 로그를 순서 보장하며 여러 컨슈머가 동시에 읽어야 할 때. **Firehose**는 로그를 버퍼링해 S3/OpenSearch/Redshift로 배치 적재할 때다. 즉 "실시간성 vs 처리량 vs 적재 대상"이라는 세 축으로 대상을 고르는 것이고, 시험에서 "여러 컨슈머가 같은 로그 스트림을 동시에 처리"라면 Kinesis, "S3에 모아 분석"이라면 Firehose가 정답 신호다.

> 🔍 **더 깊이**: Cross-account Subscription은 로그를 보내는 계정과 받는 계정이 다를 때 쓴다. 중앙 보안 계정이 모든 멤버 계정의 로그를 한곳에 모으는 패턴인데, 받는 쪽 Kinesis에 `Destination`을 만들고 거기에 보내는 계정을 허용하는 정책을 건다. 이게 멀티 계정 로그 집중화의 기반이고, Organizations 환경에서 보안 로그를 Log Archive 계정으로 빨아들이는 표준 설계다.

## Logs Insights, Dashboards, 그리고 외부 모니터링

CloudWatch Logs Insights는 로그를 SQL과 비슷한 쿼리 언어로 조회한다. raw 로그를 매번 풀스캔하는 대신, 쿼리 시점에 필요한 필드만 파싱하는 schema-on-read 방식이다. `fields`, `filter`, `stats`, `sort`, `limit` 같은 명령으로 "지난 1시간 ERROR 로그를 endpoint별로 집계"를 즉석에서 돌릴 수 있다. 미리 인덱스를 만들지 않아도 되는 대신 쿼리당 스캔한 데이터량으로 과금되므로, 시간 범위를 좁히는 게 비용과 속도 양쪽에 직결된다.

CloudWatch Dashboards는 여러 리전·여러 계정의 메트릭과 로그 위젯을 한 화면에 합성한다. 글로벌 서비스를 운영하면 "전 리전 통합 가시성"이 필요한데, 메트릭은 기본적으로 리전 격리이므로 cross-region·cross-account 대시보드가 이걸 한 뷰로 묶어준다. Synthetics는 헤드리스 브라우저(Canary)로 외부에서 사이트 가용성을 능동 점검하는데, 이건 "사용자가 실제로 겪기 전에 우리가 먼저 문제를 발견"하는 능동 모니터링이고, RUM(Real User Monitoring)은 반대로 실제 사용자 브라우저에 심은 JS로 진짜 사용자가 겪는 성능을 수동 수집한다. Synthetics는 "합성 트래픽으로 선제 감지", RUM은 "실사용 데이터로 사후 분석"이라는 상보 관계다.

> 💡 **관련 이론**: Synthetics와 RUM의 구분은 모니터링 이론의 "blackbox vs whitebox"와도 통한다. Synthetics는 시스템을 외부에서 사용자처럼 두드리는 blackbox 모니터링(내부를 모르고 결과만 본다)이고, CloudWatch Agent·Logs·EMF는 시스템 내부에서 보고하는 whitebox 모니터링이다. Google SRE는 "blackbox는 '지금 무언가 망가졌다'를, whitebox는 '왜 망가질 것 같은지'를 알려준다"고 정리한다. 둘 다 있어야 증상과 원인을 함께 본다.

## 다른 클라우드·도구와의 비교

CloudWatch를 상대화해 보면 그 설계 선택이 더 또렷하다. **Datadog·New Relic** 같은 SaaS APM은 메트릭·로그·트레이스를 처음부터 하나의 통합 플랫폼으로 묶어 상관 분석이 매끄럽지만, 데이터를 외부로 내보내야 하고 볼륨이 커지면 비용이 급증한다. CloudWatch는 AWS 내부에 데이터가 머무르고 IAM·KMS와 통합되지만, 통합 분석 경험은 ServiceLens 같은 별도 기능으로 메꿔야 한다. **Prometheus + Grafana** 오픈소스 스택은 메트릭에 강하고 비용을 직접 통제할 수 있지만 운영 부담이 크고 로그·트레이스는 별도 스택(Loki, Tempo)이 필요하다. AWS는 이 흐름을 의식해 **Amazon Managed Prometheus(AMP)**와 **Managed Grafana(AMG)**를 내놓았고, 표준 OpenTelemetry를 ADOT로 지원해 "AWS에 갇히지 않으면서 관리형의 편의"라는 중간 지대를 제공한다.

> 🔍 **더 깊이**: EventBridge와 옛 CloudWatch Events의 관계도 알아둘 가치가 있다. CloudWatch Events가 먼저 나왔고 EventBridge가 그 상위 호환으로 등장했다 — 같은 이벤트 버스를 공유하지만 EventBridge는 서드파티 SaaS 이벤트, 스키마 레지스트리, 여러 이벤트 버스 같은 기능을 더했다. 신규 설계는 EventBridge를 쓰는 게 맞고, 시험에서 "이벤트 기반 자동 대응"의 정답은 EventBridge다. CloudWatch Alarm → SNS는 임계값 기반, EventBridge rule → 대상은 이벤트 패턴 기반이라는 역할 분담을 기억하면 헷갈리지 않는다.

## CLI로 직접 만져보기

```bash
# Alarm 생성 (CPU > 70%, 1분 주기로 2회 연속 초과 시 ALARM)
aws cloudwatch put-metric-alarm --alarm-name HighCPU \
  --metric-name CPUUtilization --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
  --statistic Average --period 60 --threshold 70 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 --datapoints-to-alarm 2 \
  --treat-missing-data breaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111:ops-topic

# EC2 시스템 상태 장애 시 자동 복구 (같은 ID/IP로 재배치)
aws cloudwatch put-metric-alarm --alarm-name AutoRecover \
  --metric-name StatusCheckFailed_System --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
  --statistic Maximum --period 60 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:automate:ap-northeast-2:ec2:recover

# 사용자 정의 메트릭 올리기 (차원은 저카디널리티만)
aws cloudwatch put-metric-data --namespace MyApp \
  --metric-name OrderProcessed \
  --dimensions Service=checkout,Region=apne2 \
  --value 1 --unit Count

# Logs Insights 쿼리 (시간 범위를 좁혀 비용·속도 최적화)
aws logs start-query --log-group-name /aws/lambda/saa-fn \
  --start-time $(date -d '-1 hour' +%s) --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message
    | filter @message like /ERROR/
    | stats count(*) as errors by bin(5m)
    | sort errors desc'

# Subscription Filter로 ERROR 로그를 실시간 Lambda 전달
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/saa-fn \
  --filter-name error-to-lambda \
  --filter-pattern "ERROR" \
  --destination-arn arn:aws:lambda:ap-northeast-2:111:function:alert-fn

# Composite Alarm (DB와 캐시 알람이 동시에 ALARM일 때만)
aws cloudwatch put-composite-alarm \
  --alarm-name DbAndCacheDown \
  --alarm-rule "ALARM(DbAlarm) AND ALARM(CacheAlarm)" \
  --alarm-actions arn:aws:sns:ap-northeast-2:111:critical
```

## 정리하며

CloudWatch는 관찰성 세 기둥 중 메트릭과 로그를 담당하고(트레이스는 X-Ray, Day 4), 그 위에 알람·자동화·외부 모니터링을 쌓은 AWS의 표준 운영 도구다. 핵심은 다섯 가지로 압축된다. ① 메트릭은 사전 집계되는 시계열이라 싸고 빠르지만 "그 1초"는 잃어버리고, 로그는 raw라 비싸지만 정확한 맥락을 남긴다 — 그래서 두 저장 구조가 분리되어 있다. ② EC2 메모리·디스크는 게스트 OS 안쪽 정보라 하이퍼바이저가 못 보고, CloudWatch Agent가 있어야 보인다. ③ 메트릭 차원에 고카디널리티 값(사용자 ID)을 넣으면 비용이 폭발하므로 저카디널리티만 쓰고, 세밀 추적은 로그/트레이스의 일이다. ④ Alarm은 OK/ALARM/INSUFFICIENT_DATA 상태 기계이고, 가용성 알람은 missing data를 breaching으로 처리해야 죽은 서비스를 놓치지 않는다. ⑤ Subscription Filter는 폴링 없는 푸시 구독이고, Lambda/Kinesis/Firehose 중 실시간성·처리량·적재 대상으로 고른다.

다음 글에서는 "지금 무슨 일이 일어나는가"가 아니라 "누가 무엇을 했는가"를 답하는 감사 도구 — CloudTrail을 본다. CloudWatch가 시스템의 건강을 보는 도구라면, CloudTrail은 사람과 서비스의 행위를 변조 불가능하게 기록하는 도구이고, 보안 사고 분석의 출발점이다.

---

## 📝 연습 문제

**문제 1.** 한 운영팀이 EC2 인스턴스의 메모리 사용률에 알람을 걸려고 하는데, CloudWatch 콘솔의 `AWS/EC2` 네임스페이스에서 메모리 메트릭을 찾을 수 없다. 원인과 해결책으로 옳은 것은?

A) IAM Role에 cloudwatch:GetMetricData 권한이 없어서이며, 권한을 추가하면 보인다
B) 메모리·디스크 여유 공간은 게스트 OS 내부 정보라 표준 메트릭에 없으며, CloudWatch Agent를 설치해야 한다
C) 리전이 잘못 선택되어 있으며, 올바른 리전으로 바꾸면 보인다
D) 고해상도 메트릭이라 별도 활성화가 필요하다

**정답: B**

해설: CPU·네트워크·디스크 I/O는 하이퍼바이저(Nitro) 레벨에서 관측 가능해 표준 메트릭에 있지만, 메모리 사용률과 디스크 여유 공간은 게스트 OS 안쪽 정보다. 하이퍼바이저는 게스트에 할당한 총량만 알 뿐 그 안에서 OS가 얼마를 쓰는지 모른다. 따라서 게스트 안에 CloudWatch Agent를 설치해 OS가 직접 보고하게 해야 한다. A·C·D는 모두 표준 메트릭에 메모리가 존재한다는 잘못된 전제에서 출발한다.

---

**문제 2.** 한 결제 서비스가 "에러율이 5%를 넘으면 알람"으로 CloudWatch Alarm을 설정했다. 어느 날 서비스가 완전히 다운되어 요청 자체가 0이 됐는데 알람이 울리지 않았다. 가장 적절한 수정은?

A) 임계값을 5%에서 1%로 낮춘다
B) 평가 기간을 늘린다
C) missing data 처리를 breaching으로 설정한다
D) Anomaly Detection으로 전환한다

**정답: C**

해설: 요청이 0이면 에러율 메트릭 자체가 보고되지 않아 알람이 INSUFFICIENT_DATA가 되고, 기본 처리(missing)에서는 ALARM으로 전이하지 않는다. 가용성 알람은 missing data를 breaching으로 처리해야 "트래픽이 끊긴 것도 장애"로 잡힌다. A·B는 데이터가 있을 때의 민감도 조정일 뿐 데이터가 없는 문제를 풀지 못한다. D는 정상 밴드 학습에 유용하나 데이터 자체가 없으면 동일한 한계를 가진다.

---

**문제 3.** 한 팀이 모든 ERROR 로그를 실시간으로 처리하려 한다. 여러 컨슈머(알림용 Lambda, 분석용 앱, 보안 SIEM)가 같은 로그 스트림을 동시에 독립적으로 읽어야 하고 순서 보장이 필요하다. CloudWatch Logs Subscription Filter의 대상으로 가장 적합한 것은?

A) Lambda
B) Kinesis Data Streams
C) Kinesis Data Firehose
D) S3 직접 전송

**정답: B**

해설: 여러 컨슈머가 같은 스트림을 동시에 독립적으로 읽고 순서 보장이 필요하면 Kinesis Data Streams가 적합하다(샤드 단위 순서 보장 + 다중 컨슈머). Lambda는 이벤트당 즉시 호출하는 저지연·단일 처리에 맞고, Firehose는 버퍼링 후 S3/OpenSearch 배치 적재용이며 다중 독립 컨슈머에 부적합하다. Subscription Filter는 S3로 직접 전송할 수 없다.

---

**문제 4.** 한 애플리케이션이 사용자 정의 메트릭을 PutMetricData로 올리는데, 차원에 `UserId`(10만 명)를 포함시켰더니 CloudWatch 비용이 폭증했다. 비용을 가장 효과적으로 줄이는 방법은?

A) 메트릭 해상도를 1초에서 1분으로 낮춘다
B) UserId 차원을 제거하고 저카디널리티 차원(Service, Region)만 남기며, 사용자 단위 추적은 로그/트레이스로 옮긴다
C) PutMetricData 호출을 배치로 묶는다
D) 메트릭 보존 기간을 줄인다

**정답: B**

해설: CloudWatch 메트릭은 "이름 + 차원 조합"마다 별개의 시계열로 저장·과금된다. UserId처럼 카디널리티가 높은 값을 차원에 넣으면 시계열 수가 폭발해 비용이 급증한다. 차원은 저카디널리티 값만 써야 하고, 사용자 단위 세밀 추적은 메트릭이 아니라 로그(Logs Insights)나 트레이스(X-Ray)의 영역이다. A·D는 효과가 제한적이고, C는 과금 단위가 데이터포인트라 근본 해결이 아니다.

---

**문제 5.** Lambda 함수에서 고볼륨으로 메트릭을 집계하면서도 같은 라인에서 상세 디버깅 로그를 함께 남기고, PutMetricData API 호출 비용은 줄이고 싶다. 가장 적합한 기법은?

A) 고해상도 메트릭 활성화
B) EMF(Embedded Metric Format)로 로그에 메트릭을 임베드
C) Composite Alarm
D) Metric Streams

**정답: B**

해설: EMF는 로그 한 줄에 특수 JSON 구조로 메트릭을 임베드하면 CloudWatch가 그 로그에서 메트릭을 자동 추출하는 기능이다. 애플리케이션은 PutMetricData를 호출하지 않고 로그만 쓰는데 메트릭과 상세 로그를 동시에 얻는다. Lambda처럼 stdout이 자동으로 CloudWatch Logs로 가는 환경과 특히 잘 맞는다. A는 비용을 오히려 늘리고, C는 알람 조합, D는 메트릭 외부 export 기능이다.

---

**문제 6.** 글로벌 서비스를 us-east-1, ap-northeast-2, eu-west-1 세 리전에서 운영한다. SRE 팀이 세 리전의 핵심 메트릭과 ERROR 로그 추이를 하나의 화면에서 보고 싶어한다. 가장 적합한 솔루션은?

A) 각 리전마다 별도 콘솔을 띄워 수동 비교
B) Cross-region(필요 시 Cross-account) CloudWatch Dashboard로 위젯을 한 뷰에 합성
C) 모든 메트릭을 us-east-1로 PutMetricData 재전송
D) Service Health Dashboard 사용

**정답: B**

해설: CloudWatch 메트릭은 기본적으로 리전 격리이지만, Cross-region·Cross-account Dashboard는 여러 리전·계정의 위젯을 한 화면에 합성해 글로벌 통합 가시성을 제공한다. A는 운영 부담이 크고 실수가 잦으며, C는 비용·복잡도가 크고 데이터 이중화 문제가 생긴다. D는 AWS 전체 서비스 상태 페이지이지 내 메트릭 대시보드가 아니다.

---

**문제 7.** 한 팀이 "사용자가 장애를 겪기 전에 우리가 먼저 발견"하기 위해 주요 사용자 흐름(로그인 → 검색 → 결제)을 5분마다 외부에서 능동 점검하려 한다. 가장 적합한 도구는?

A) CloudWatch RUM
B) CloudWatch Synthetics Canary
C) X-Ray
D) CloudWatch Logs Insights

**정답: B**

해설: Synthetics Canary는 헤드리스 브라우저로 외부에서 사용자 흐름을 합성 트래픽으로 능동 점검하는 blackbox 모니터링이다. "실사용자가 겪기 전에 선제 감지"라는 요구에 정확히 맞는다. RUM은 반대로 실제 사용자 브라우저에 심은 JS로 진짜 사용자 성능을 수동 수집하는 도구다. X-Ray는 분산 트레이싱, Logs Insights는 로그 쿼리로 능동 외부 점검과는 다르다.

---

해설 보강: CloudWatch는 SAA 운영 도메인의 중심이고, 시험은 "어떤 데이터(메트릭/로그/트레이스)가 어떤 질문에 답하는가"와 "어떤 자동화 경로(알람 액션, Subscription Filter)가 어떤 요구를 푸는가"를 반복해서 묻는다. 메트릭과 로그의 저장 구조 차이, EC2 메모리의 Agent 의존성, 알람의 missing data 처리, Subscription Filter의 대상 선택 — 이 네 가지를 정확히 구분하면 CloudWatch 문제의 대부분이 풀린다.
