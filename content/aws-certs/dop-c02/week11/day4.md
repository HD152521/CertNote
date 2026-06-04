# Day 4 - OpenSearch · AMP · AMG: 역인덱스와 시계열 DB의 두 세계

옵저버빌리티 데이터를 어디에 저장하느냐는 단순한 인프라 선택이 아니다. 그것은 데이터의 본질에 대한 질문이다. "어제 14시 23분에 user-789가 본 결제 실패 로그를 찾아라"와 "지난 5분간 API 에러율의 99분위수를 그려라"는 완전히 다른 질문이고, 완전히 다른 자료구조를 요구한다. 앞의 질문은 임의의 텍스트에서 특정 문서를 찾는 **전문 검색(full-text search)** 문제이고, 뒤의 질문은 시간축 위의 수치를 집계하는 **시계열 집계** 문제다. 전자는 **역인덱스(inverted index)**, 후자는 **시계열 데이터베이스(TSDB)**라는 근본적으로 다른 엔진이 푼다. OpenSearch와 Prometheus(AMP)가 따로 존재하는 이유가 바로 이것이다.

오늘은 이 두 세계의 차이를 판다. 역인덱스가 어떻게 텍스트 검색을 가능하게 하는지, TSDB가 왜 시계열에 특화된 별도 엔진인지, 둘의 저장·쿼리 모델이 어떻게 다른지, 그리고 그 위에 Grafana(AMG)가 어떻게 이질적 백엔드를 하나의 대시보드로 묶는지를 본다. DOP 시험에서 이 영역은 "로그 분석엔 무엇을, 메트릭엔 무엇을 골라야 하나", "EKS 메트릭의 표준 백엔드는", "여러 데이터 소스를 한 대시보드로 통합하려면" 같은 도구 선택 시나리오로 나온다.

## 역인덱스 — 텍스트 검색을 가능하게 한 자료구조

OpenSearch(Elasticsearch의 fork)의 심장은 **역인덱스**다. 일반 인덱스(forward index)는 "문서 → 그 안의 단어들"이지만, 역인덱스는 이를 뒤집어 "**단어 → 그 단어가 등장하는 문서들의 목록**"으로 저장한다. 책 맨 뒤의 "찾아보기(색인)"가 정확히 역인덱스다 — "분산 추적 → 152, 203쪽"처럼 단어에서 위치로 간다.

```
문서들:
  doc1: "payment failed for user 789"
  doc2: "payment succeeded"

역인덱스:
  payment   → [doc1, doc2]
  failed    → [doc1]
  user      → [doc1]
  succeeded → [doc2]
```

"failed가 포함된 문서"를 찾을 때, 모든 문서를 스캔하지 않고 역인덱스에서 `failed` 항목 하나만 보면 [doc1]이 즉시 나온다. 수억 개 로그에서 특정 단어를 밀리초 안에 찾는 마법이 이것이다. 이 자료구조 위에 OpenSearch는 색인 분석기(토크나이저, 형태소 분석), 관련도 점수(TF-IDF/BM25), 집계(aggregation)를 얹는다.

> 💡 **관련 이론**: 역인덱스의 검색 품질을 결정하는 핵심 알고리즘이 **BM25**(Best Matching 25)다. 단순히 단어가 있냐 없냐가 아니라, 그 단어가 문서에 얼마나 자주 나오는지(TF, term frequency)와 전체 문서 중 얼마나 희귀한지(IDF, inverse document frequency)를 결합해 관련도를 점수화한다. 흔한 단어("the", "error")는 IDF가 낮아 점수 기여가 작고, 희귀한 단어("OutOfMemoryError")는 IDF가 높아 검색의 핵심이 된다. 이는 Lucene(Elasticsearch·OpenSearch·Solr의 공통 엔진)이 구현한 정보 검색(IR, Information Retrieval)의 고전 이론이다. 로그 검색에서 BM25가 의미 있는 이유: "수억 줄 로그에서 진짜 신호가 되는 희귀 패턴"을 흔한 노이즈 위로 끌어올린다. 검색 = 단순 매칭이 아니라 관련도 순위화라는 것이 핵심이다.

## OpenSearch — Provisioned와 Serverless

Amazon OpenSearch Service는 2021년 Elasticsearch에서 라이선스 분쟁 끝에 fork된 관리형 서비스다. 두 가지 형태가 있다.

**Provisioned**: 직접 클러스터(노드 수·인스턴스 타입)를 정한다. **스토리지 계층화**가 핵심 비용 절감 수단이다 — Hot(SSD, 최근 데이터), UltraWarm(S3 기반, 덜 자주 보는 데이터), Cold(아카이브)로 데이터를 나이에 따라 내려보낸다. KMS 암호화, VPC 격리, **FGAC**(Fine-Grained Access Control, 인덱스·문서·필드 단위 RBAC)를 지원하고, Kibana(이제 OpenSearch Dashboards)로 시각화한다.

**Serverless**(2022+): 클러스터 관리가 사라진다. **OCU**(OpenSearch Compute Unit) 시간당 과금이고, indexing과 search 용량이 분리되어 독립적으로 스케일한다. Collection 단위로 운영하며, 트래픽이 들쭉날쭉하거나 작은 로그/검색 워크로드에 적합하다.

```bash
# 로그를 일별 인덱스로 적재하고 ISM으로 자동 회전
# logs-app-2026.06.02 → 7일 후 UltraWarm → 30일 후 삭제
```

> 🔍 **더 깊이**: OpenSearch 운영의 핵심 패턴이 **시간 기반 인덱스(time-based index) + ISM(Index State Management)**이다. 로그를 하나의 거대한 인덱스에 다 넣으면 오래된 데이터 삭제가 비싸다(개별 문서 삭제는 비용이 큼). 대신 `logs-app-2026.06.02`처럼 **날짜별로 인덱스를 분리**하면, 30일 지난 데이터 삭제는 그냥 그 날짜 인덱스를 통째로 drop하면 된다 — 인덱스 삭제는 파일을 지우는 수준으로 싸다. ISM은 이 생명주기를 자동화한다: "생성 후 7일 → UltraWarm 이전, 30일 → 삭제". 이는 시계열 데이터 관리의 보편 패턴인 **롤링 인덱스/파티션 by time**이고, RDBMS의 시간 파티셔닝, S3의 날짜 prefix, Day 1의 X-Ray trace 시각 파티셔닝과 같은 발상이다. "오래된 시계열 데이터는 통째로 버릴 수 있게 시간으로 분할하라"가 핵심이다.

## TSDB와 Prometheus — 시계열에 특화된 다른 엔진

메트릭은 텍스트가 아니다. `http_requests_total{status="500"} 42`처럼 (시각, 레이블 집합, 수치)의 흐름이다. 이런 데이터를 역인덱스에 넣는 건 비효율적이다 — 같은 메트릭이 1초마다 수치만 바뀌며 수백만 번 기록되는데, 텍스트 검색 엔진은 이런 고빈도 수치 시계열에 최적화되어 있지 않다. **TSDB**는 이를 위한 별도 엔진이다.

Prometheus는 사실상의 메트릭 표준이 됐다. 핵심 특징:

- **Pull 모델**: Prometheus가 각 타깃의 `/metrics` 엔드포인트를 주기적으로 **scrape**(긁어온다). 애플리케이션이 push하지 않는다(CloudWatch와 반대).
- **레이블 기반 차원 모델**: `metric{label="value"}` — Day 1(Week 10)에서 본 CloudWatch 차원과 동일한 카디널리티 구조.
- **PromQL**: 시계열 집계 전용 쿼리 언어.

```promql
# 상태별 초당 요청률
sum(rate(http_requests_total{job="api"}[5m])) by (status)
# p99 지연 (히스토그램에서 분위수 계산)
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

> 💡 **관련 이론**: TSDB가 별도 엔진인 이유는 시계열 데이터의 **압축** 특성에 있다. 시계열은 (1) 타임스탬프가 거의 등간격으로 증가하고 (2) 연속한 값이 비슷하다는 강한 규칙성이 있다. Facebook의 **Gorilla** 논문(2015)이 이를 활용한 압축을 제시했다 — 타임스탬프는 **delta-of-delta 인코딩**(간격의 변화량만 저장, 등간격이면 거의 0), 값은 **XOR 인코딩**(이전 값과의 XOR이 대부분 0비트)으로 시계열을 원본의 10분의 1 이하로 압축한다. Prometheus의 TSDB, InfluxDB, TimescaleDB가 모두 이 계열의 압축을 쓴다. 역인덱스(텍스트의 임의 검색에 최적)와 TSDB(규칙적 수치 시계열의 압축·범위 스캔에 최적)는 데이터 특성이 달라 근본적으로 다른 자료구조를 쓴다 — 이것이 OpenSearch와 Prometheus를 한 엔진으로 합칠 수 없는 이유다.

> ⚠️ **함정**: Prometheus의 pull 모델은 "**Prometheus가 타깃에 네트워크로 도달할 수 있어야 한다**"는 제약을 만든다. 짧게 살다 사라지는 배치 작업·Lambda·서버리스는 Prometheus가 scrape하러 갔을 때 이미 죽어 있어 메트릭을 놓친다. 그래서 단명 작업은 **Pushgateway**(작업이 메트릭을 push해두면 Prometheus가 거기서 scrape)로 우회한다. 또한 카디널리티 폭발이 Prometheus를 죽이는 가장 흔한 원인이다 — `user_id`처럼 고유값이 수백만인 레이블을 넣으면 시계열이 폭발해 메모리가 터진다(Day 1의 CloudWatch high-cardinality 함정과 동일). pull/push 선택과 레이블 카디널리티 관리가 Prometheus 운영의 두 핵심이다.

## AMP — 관리형 Prometheus

자체 Prometheus를 운영하면 스토리지·고가용성·스케일을 직접 책임져야 한다. **AMP**(Amazon Managed Service for Prometheus)는 이를 관리형으로 제공한다.

- Workspace를 만들면 `remote_write` 엔드포인트 URL을 받는다.
- ADOT Collector나 Prometheus Agent가 이 엔드포인트로 메트릭을 `remote_write`한다(Day 3).
- 메트릭 **보존 기간은 150일**(과거엔 더 짧았으나 확장됨 — 장기 보관이 더 필요하면 외부 export).
- PromQL로 쿼리하고, AMG에서 데이터 소스로 연결한다.
- 인증은 **SigV4**(IAM 서명) — Prometheus 생태계에 AWS 인증을 입혔다.

```bash
aws amp create-workspace --alias prod
# → workspace ID + remote_write URL
```

AMP는 "PromQL과 Prometheus 생태계는 그대로 쓰되, 클러스터 운영 부담은 AWS에 넘긴다"는 가치다. EKS에서 Prometheus 메트릭을 표준으로 쓰는 조직이 자체 Prometheus 운영의 짐을 더는 경로다.

## AMG — 이질적 백엔드를 하나의 유리창으로

여기까지 보면 옵저버빌리티 데이터가 여러 곳에 흩어진다 — trace는 X-Ray, 로그는 OpenSearch, 메트릭은 AMP/CloudWatch. 각각 별도 콘솔로 보면 "single pane of glass"(하나의 통합 화면)가 안 된다. **AMG**(Amazon Managed Grafana)가 이 조각들을 하나의 대시보드로 묶는다.

- **데이터 소스**: CloudWatch, AMP(PromQL), OpenSearch, X-Ray, Athena, Redshift, Timestream 등 다수를 한 대시보드에 동시 연결.
- **인증**: IAM Identity Center, SAML로 운영자 SSO.
- **권한**: SERVICE_MANAGED 모드로 IAM 권한을 자동 매핑, 플러그인 자동 관리.

```bash
aws grafana create-workspace --account-access-type CURRENT_ACCOUNT \
  --authentication-providers AWS_SSO \
  --permission-type SERVICE_MANAGED \
  --workspace-data-sources PROMETHEUS CLOUDWATCH XRAY OPENSEARCH
```

Grafana의 가치는 **백엔드 중립적 시각화 계층**이라는 점이다. 데이터가 어디 있든(AWS든 온프레미스 Prometheus든) 같은 대시보드 문법으로 그린다. 멀티 클라우드 조직이 단일 관찰성 화면을 갖는 핵심이고, Grafana 자체 알람(AWS에 의존하지 않는 멀티 클라우드 알람 단일화)도 제공한다.

> 📚 **사례**: 한 기업이 AWS(EKS)와 온프레미스 Kubernetes를 동시에 운영하며, 두 환경의 메트릭을 별도 도구로 봐서 인시던트 때 두 화면을 오가야 했다. AMG를 도입해 AWS 쪽은 AMP를, 온프레미스 쪽은 자체 Prometheus를 둘 다 Grafana 데이터 소스로 연결하자, 하나의 대시보드에서 두 환경을 나란히 봤다. PromQL이 양쪽 공통 쿼리 언어였기에 가능했다 — 둘 다 Prometheus 호환이라 같은 쿼리·같은 대시보드를 재사용했다. 교훈: 표준(PromQL)을 공유하면 이질적 인프라도 단일 시각화로 통합된다. Grafana의 가치는 데이터 저장이 아니라 백엔드 중립 시각화에 있다.

## 도구 조합 결정 — 무엇을 언제 고르나

| 워크로드 | 권장 조합 | 이유 |
|----------|-----------|------|
| AWS 네이티브 단순 | CloudWatch (+ X-Ray) | 통합·운영 부담 최소 |
| EKS 풍부한 메트릭 | ADOT + AMP + AMG | Prometheus 생태계 표준 |
| 로그 분석·전문 검색·BI | OpenSearch + Dashboards | 역인덱스가 텍스트 검색에 최적 |
| 멀티 클라우드 | ADOT + Prometheus/AMP + Grafana | 표준 공유로 통합 |
| 비용 최저·단순 | CloudWatch만 | 추가 백엔드 운영 없음 |

핵심 분기는 데이터의 본질이다 — **임의 텍스트를 검색**해야 하면 OpenSearch(역인덱스), **수치 시계열을 집계**해야 하면 Prometheus/AMP(TSDB), **AWS만 쓰고 단순**하면 CloudWatch, **여러 백엔드를 한 화면**으로 보려면 Grafana/AMG다.

> 🎯 **시나리오**: "EKS 클러스터에서 Pod 메트릭(Prometheus 형식)을 수집해 PromQL로 쿼리하고, 동시에 애플리케이션 로그를 전문 검색하며, 이 모두를 단일 대시보드에서 보고 운영자는 회사 SSO로 로그인하게 하라. 어떻게 설계하나?" — 답은 ADOT + AMP + OpenSearch + AMG의 조합이다. ① ADOT Collector(DaemonSet)가 Pod의 `/metrics`를 Prometheus scrape하고 trace를 OTLP로 받아 AMP에 `remote_write`(메트릭)·X-Ray(trace)로 보낸다. ② 로그는 CloudWatch Logs Subscription → Firehose → OpenSearch로 적재해 역인덱스로 전문 검색. ③ AMG를 만들어 AMP(PromQL 메트릭)·OpenSearch(로그)·X-Ray(trace)·CloudWatch를 모두 데이터 소스로 연결해 단일 대시보드. ④ AMG 인증을 IAM Identity Center(SSO)로 설정. 핵심은 "데이터 본질별로 최적 백엔드(TSDB는 메트릭, 역인덱스는 로그)를 쓰되, Grafana가 시각화를 통합"하는 것이다.

## 로그 적재 경로 — CloudWatch Logs에서 OpenSearch로

애플리케이션 로그를 OpenSearch로 실시간 적재하는 표준 경로:

```
App logs → CloudWatch Logs
   │ Subscription Filter
   ▼
 Firehose (버퍼링·변환·재시도)
   ▼
 OpenSearch 인덱스 (역인덱스로 검색 가능)
```

Subscription Filter가 로그를 실시간으로 빼내 Firehose에 흘리고, Firehose가 버퍼링·배치·재시도를 맡아 OpenSearch에 적재한다. Fluent Bit/Fluentd로 OpenSearch에 직접 보내는 경로도 있지만, Firehose 경로가 관리 부담이 적고 재시도·백프레셔를 자동 처리한다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **옵저버빌리티 저장소 선택은 데이터 본질의 문제** — 임의 텍스트 검색은 역인덱스(OpenSearch), 수치 시계열 집계는 TSDB(Prometheus/AMP)라는 근본적으로 다른 엔진이 푼다. 둘째, **역인덱스는 "단어→문서" 구조 + BM25 관련도**로 텍스트 검색을, **TSDB는 delta-of-delta·XOR 압축**으로 고빈도 시계열을 푼다 — 합칠 수 없는 이유다. 셋째, **OpenSearch는 시간 기반 인덱스 + ISM**으로 오래된 데이터를 통째로 drop해 생명주기를 관리하고, Provisioned(계층화 스토리지)/Serverless(OCU)로 나뉜다. 넷째, **AMP는 관리형 Prometheus**(remote_write·PromQL·SigV4)이고 pull 모델·카디널리티가 운영 핵심이다. 다섯째, **AMG는 백엔드 중립 시각화 계층**으로 이질적 데이터 소스를 단일 대시보드로 묶고, EKS 표준 스택은 ADOT + AMP + AMG다.

다음 글에서는 Week 11 전체를 시나리오 문제로 종합한다 — X-Ray 추적, 샘플링, ADOT, 그리고 오늘의 백엔드 선택을 실전 의사결정으로 엮는다.

---

## 📝 연습 문제

**문제 1.** "수억 줄 로그에서 특정 에러 메시지가 포함된 문서를 밀리초 안에 찾기"와 "지난 5분 API 에러율 p99 그리기"는 각각 어떤 엔진이 적합한가?

A) 둘 다 CloudWatch

B) 전자는 역인덱스(OpenSearch), 후자는 TSDB(Prometheus/AMP) — 데이터 본질이 달라 다른 엔진

C) 둘 다 OpenSearch

D) 둘 다 Prometheus

**정답: B**

해설: 임의 텍스트에서 특정 문서를 찾는 전문 검색은 "단어→문서" 역인덱스(OpenSearch)에 최적이고, 시간축 위 수치를 집계하는 시계열 쿼리는 압축·범위 스캔에 최적화된 TSDB(Prometheus/AMP)에 적합하다. 두 데이터 특성(임의 텍스트 vs 규칙적 수치 시계열)이 근본적으로 달라 다른 자료구조를 쓰며, 그래서 OpenSearch와 Prometheus가 따로 존재한다. 한 엔진으로 둘 다 최적화할 수 없다.

---

**문제 2.** OpenSearch에서 30일 지난 로그를 비용 효율적으로 삭제하는 표준 패턴은?

A) 거대한 단일 인덱스에서 오래된 문서를 개별 삭제 쿼리로 제거

B) 날짜별 인덱스(`logs-app-2026.06.02`)로 분리하고 ISM으로 오래된 인덱스를 통째로 drop — 인덱스 삭제는 파일 삭제 수준으로 싸다

C) S3로 복사 후 OpenSearch 클러스터를 재생성

D) FGAC로 접근을 막는다

**정답: B**

해설: 개별 문서 삭제는 비싸지만, 로그를 날짜별 인덱스로 분리하면 오래된 데이터 삭제가 그 날짜 인덱스를 통째로 drop하는 것으로 끝나 매우 싸다. ISM(Index State Management)이 "생성 7일 후 UltraWarm, 30일 후 삭제" 같은 생명주기를 자동화한다. 이는 시계열 데이터의 보편 패턴인 시간 파티셔닝(RDBMS 파티션, S3 날짜 prefix, X-Ray trace 시각 파티셔닝과 동일)이다. 개별 삭제(A)는 비효율적이다.

---

**문제 3.** Prometheus의 pull 모델에서 짧게 살다 사라지는 배치 작업·Lambda의 메트릭을 놓치는 문제를 푸는 표준 방법은?

A) FixedRate 샘플링

B) Pushgateway — 단명 작업이 메트릭을 push해두면 Prometheus가 거기서 scrape

C) UltraWarm

D) BM25

**정답: B**

해설: Prometheus는 타깃의 `/metrics`를 주기적으로 scrape하는 pull 모델이라, scrape하러 갔을 때 이미 죽은 단명 작업(배치·Lambda)의 메트릭을 놓친다. Pushgateway는 단명 작업이 종료 전 메트릭을 push해두는 중간 저장소로, Prometheus가 Pushgateway를 scrape해 메트릭을 회수한다. 이것이 pull 모델에서 단명 워크로드를 다루는 표준 우회다. 샘플링(A)·UltraWarm(C)·BM25(D)는 무관하다.

---

**문제 4.** Prometheus/AMP를 죽이는 가장 흔한 운영 사고는?

A) 디스크 부족

B) 카디널리티 폭발 — `user_id`처럼 고유값이 수백만인 레이블을 넣으면 시계열이 폭발해 메모리가 터진다

C) PromQL 문법 오류

D) SigV4 인증 만료

**정답: B**

해설: Prometheus는 `metric{label=value}`의 고유 레이블 조합마다 별도 시계열을 만든다. `user_id`처럼 카디널리티가 수백만인 레이블을 넣으면 시계열이 폭발해 메모리가 고갈되고 Prometheus가 죽는다. 이는 Day 1(Week 10)에서 본 CloudWatch high-cardinality 함정과 동일한 원리다 — 차원/레이블이 곧 시계열 수이자 자원 소비다. 고카디널리티 식별자는 레이블이 아니라 로그(역인덱스)로 보내야 한다. 레이블 카디널리티 관리가 Prometheus 운영의 핵심이다.

---

**문제 5.** AWS(EKS)와 온프레미스 Kubernetes의 메트릭을 하나의 대시보드에서 나란히 보려 한다. 이를 가능하게 한 핵심은?

A) 두 환경을 같은 VPC로 합친다

B) 양쪽 모두 Prometheus 호환(AWS는 AMP, 온프레미스는 자체 Prometheus)이라 AMG에 둘 다 데이터 소스로 연결하고 같은 PromQL·대시보드를 재사용

C) 온프레미스를 AWS로 마이그레이션

D) CloudWatch로 통합

**정답: B**

해설: Grafana(AMG)의 가치는 백엔드 중립 시각화 계층이라는 점이다. AWS 쪽 AMP와 온프레미스 자체 Prometheus를 둘 다 Grafana 데이터 소스로 연결하면, 둘 다 Prometheus 호환이라 같은 PromQL 쿼리·같은 대시보드를 양쪽에 재사용해 하나의 화면에서 나란히 본다. 표준(PromQL)을 공유하면 이질적 인프라도 단일 시각화로 통합된다. VPC 합병(A)·마이그레이션(C)은 불필요하게 과하다.

---

**문제 6.** OpenSearch의 BM25가 로그 검색에서 의미 있는 이유는?

A) 데이터를 압축한다

B) 단어 빈도(TF)와 희귀도(IDF)를 결합해 관련도를 점수화 — 흔한 노이즈("error", "the")보다 희귀한 신호("OutOfMemoryError")를 위로 끌어올린다

C) 시계열을 집계한다

D) 인덱스를 자동 삭제한다

**정답: B**

해설: BM25는 정보 검색의 관련도 순위 알고리즘으로, 단어가 문서에 자주 나오는지(TF)와 전체 문서 중 얼마나 희귀한지(IDF)를 결합해 점수를 매긴다. 흔한 단어는 IDF가 낮아 기여가 작고, 희귀한 단어는 IDF가 높아 검색의 핵심이 된다. 로그 검색에서 이는 수억 줄 중 진짜 신호가 되는 희귀 패턴을 노이즈 위로 끌어올린다 — 검색은 단순 매칭이 아니라 관련도 순위화다. 압축(A)·시계열 집계(C)는 TSDB의 영역이다.

---

**문제 7.** OpenSearch Serverless와 Provisioned의 핵심 차이는?

A) Serverless는 검색이 불가능

B) Provisioned는 클러스터(노드·인스턴스)를 직접 관리하고 스토리지 계층화(Hot/UltraWarm/Cold)가 가능, Serverless는 OCU 시간 과금으로 클러스터 관리가 없고 indexing/search 용량이 분리 스케일

C) Serverless가 항상 더 비싸다

D) Provisioned는 VPC를 못 쓴다

**정답: B**

해설: Provisioned는 노드 수·인스턴스 타입을 직접 정하고 Hot/UltraWarm/Cold 스토리지 계층화로 비용을 최적화한다. Serverless는 클러스터 관리가 사라지고 OCU(OpenSearch Compute Unit) 시간당 과금이며 indexing과 search 용량이 분리되어 독립 스케일한다. 트래픽이 들쭉날쭉하거나 작은 워크로드엔 Serverless, 큰 안정 워크로드와 세밀한 스토리지 제어엔 Provisioned가 맞는다. Serverless도 검색 가능(A 틀림)하다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 옵저버빌리티 저장소 선택은 데이터 본질의 문제로, 임의 텍스트 검색은 역인덱스(OpenSearch), 수치 시계열 집계는 TSDB(Prometheus/AMP)라는 근본적으로 다른 엔진이 푼다. 둘째, 역인덱스는 "단어→문서" 구조와 BM25(TF-IDF) 관련도로 텍스트 검색을, TSDB는 delta-of-delta·XOR 압축(Gorilla)으로 고빈도 시계열을 처리해 합칠 수 없다. 셋째, OpenSearch는 날짜별 인덱스 + ISM으로 오래된 데이터를 통째로 drop해 생명주기를 관리하며 Provisioned(계층 스토리지)/Serverless(OCU)로 나뉜다. 넷째, AMP는 관리형 Prometheus(remote_write·PromQL·SigV4·보존 확장)이고 pull 모델의 단명 작업은 Pushgateway로, 카디널리티 폭발이 최대 운영 사고다. 다섯째, AMG는 백엔드 중립 시각화 계층으로 이질적 데이터 소스(AMP·OpenSearch·X-Ray·CloudWatch)를 단일 대시보드로 통합하고 PromQL 표준 공유로 멀티 클라우드도 묶으며, EKS 관찰성 표준 스택은 ADOT + AMP + AMG다.
