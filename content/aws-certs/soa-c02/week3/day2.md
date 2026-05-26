# Day 2 - CloudWatch Dashboards: 크로스 계정 집계, 변수, 그리고 관측 가능성의 설계 철학

운영팀 회의실 벽면에 TV 한 대가 걸려 있다. 화면에는 CloudWatch 대시보드가 자동으로 돌아간다. 누군가 "저 화면 보면 서비스 상태를 한눈에 알 수 있어야 하는 거 아닌가요?" 라고 물었을 때, 솔직한 운영자라면 이렇게 대답할 것이다. "이론상 그래야 하는데, 실제로는 저 화면에서 뭔가 이상한 걸 발견해도 어디부터 봐야 할지 모르겠어요." 대시보드가 있다는 것과 대시보드가 의미 있다는 것은 다른 문제다.

오늘은 CloudWatch Dashboard의 위젯 구조, JSON 본문, 크로스 계정/리전 Observability 설정, 그리고 Variables(동적 대시보드)를 다룬다. 동시에 Google SRE가 정리한 **Golden Signals**와 Netflix가 제안한 **관측 가능성 계층 구조**를 기반으로, 실제로 "저 화면을 보면 무엇인지 알 수 있는" 대시보드를 어떻게 설계하는지까지 이야기한다.

## 관측 가능성(Observability)의 세 기둥과 CloudWatch의 위치

관측 가능성(Observability)은 제어 이론에서 온 개념이다. Kalman(1960)이 "시스템 외부 출력만으로 내부 상태를 완전히 추정할 수 있는가"를 가리키는 제어 이론 용어로 처음 사용했다. 현대 운영 공학에서는 Logs, Metrics, Traces 세 가지 신호로 시스템 내부 상태를 추정하는 능력이다.

CloudWatch는 이 세 기둥을 모두 다룬다. CloudWatch Metrics(계량 가능한 숫자), CloudWatch Logs(구조화/비구조화 텍스트), X-Ray Traces(요청 경로)가 대시보드 위젯으로 통합된다. 대시보드는 이 세 신호를 하나의 화면에서 상호 참조할 수 있는 "관측의 진입점"이다.

> 💡 **관련 이론**: Cindy Sridharan의 책 *Distributed Systems Observability* (O'Reilly, 2018)는 현대 관측 가능성을 "알 수 없는 알 수 없는 것(unknown unknowns)"을 탐색하는 능력으로 정의한다. 전통적 모니터링이 알려진 장애 패턴을 임계값으로 감지하는 것이라면, 관측 가능성은 처음 보는 장애 유형을 단서를 통해 추적하는 것이다. CloudWatch 대시보드는 이 탐색의 시각적 출발점이어야 한다.

## 위젯 타입: 언제 무엇을 쓰나

대시보드는 24열 그리드 위에 위젯을 배치한다. 위젯 타입마다 적합한 사용 시나리오가 다르다.

| 위젯 | 최적 용도 | 안티패턴 |
|------|-----------|----------|
| **Line** | 시계열 추세, 비교 | 순간 값 표시에 쓰면 가독성 낮음 |
| **Stacked Area** | 구성 요소별 합산 | 값이 크게 다를 때 작은 것이 안 보임 |
| **Number** | 현재 KPI 하나 | 여러 숫자 나열 시 맥락 없이 혼란 |
| **Gauge** | 0-100% 사용률 | 절대값 표시에 적합하지 않음 |
| **Bar** | 카테고리 비교 (리전별, 서비스별) | 시계열에 쓰면 패턴이 안 보임 |
| **Pie** | 비율 (5개 이하 항목) | 값이 비슷하면 차이를 인식하기 어려움 |
| **Logs Insights** | 실시간 쿼리 결과, 에러 샘플 | 대용량 쿼리는 위젯 로드 느림 |
| **Alarm Status** | 알람 상태 격자, 서비스 상태판 | 개수가 너무 많으면 가독성 저하 |
| **Text** | 섹션 제목, 설명, 링크 | 과도한 설명 텍스트는 공간 낭비 |
| **Custom (iframe)** | Grafana 패널, 외부 시각화 | CORS, 보안 정책 제약 주의 |

> 💡 **관련 이론**: Edward Tufte의 *The Visual Display of Quantitative Information* (1983)은 데이터 시각화의 고전이다. Tufte의 "데이터-잉크 비율(data-ink ratio)" 원칙: 잉크의 최대 비율이 실제 데이터를 나타내야 한다. 불필요한 격자선, 과도한 3D 효과, 장식은 데이터 전달을 방해한다. CloudWatch 대시보드 설계에도 동일하게 적용된다. 위젯마다 제목, 단위, Y축 범위를 명확히 표시하는 것이 기본.

## 대시보드 JSON 구조와 IaC 관리

대시보드는 JSON 본문으로 완전히 표현된다. 이 JSON을 CloudFormation `AWS::CloudWatch::Dashboard` 리소스로 관리하면 대시보드도 코드로 버전 관리된다.

```json
{
  "widgets": [
    {
      "type": "metric",
      "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "ALB 요청 수 & 5xx 에러율 (1분 집계)",
        "metrics": [
          ["AWS/ApplicationELB", "RequestCount",
           "LoadBalancer", "app/prod-alb/abc123",
           {"stat": "Sum", "label": "요청 수", "yAxis": "right"}],
          [{"expression": "errors/requests*100",
            "label": "5xx 에러율 (%)", "id": "errorRate", "yAxis": "left"}],
          ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count",
           "LoadBalancer", "app/prod-alb/abc123",
           {"id": "errors", "visible": false, "stat": "Sum"}],
          ["AWS/ApplicationELB", "RequestCount",
           "LoadBalancer", "app/prod-alb/abc123",
           {"id": "requests", "visible": false, "stat": "Sum"}]
        ],
        "period": 60,
        "view": "timeSeries",
        "yAxis": {
          "left": {"min": 0, "max": 100, "label": "에러율 (%)"},
          "right": {"min": 0, "label": "요청 수"}
        },
        "annotations": {
          "horizontal": [{"value": 5, "color": "#ff6600", "label": "에러율 5% 임계값"}]
        },
        "region": "ap-northeast-2"
      }
    },
    {
      "type": "log",
      "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "최근 에러 로그 (실시간)",
        "query": "SOURCE '/aws/lambda/order-service' | fields @timestamp, @message | filter @message like /ERROR|FATAL/ | sort @timestamp desc | limit 20",
        "region": "ap-northeast-2",
        "view": "table"
      }
    }
  ]
}
```

이중 Y축(에러율 % + 요청 수 절대값)은 서로 다른 스케일의 메트릭을 한 그래프에서 상관 관계로 볼 때 유용하다. 트래픽이 증가할 때 에러율도 같이 오르는지, 아니면 에러율은 고정인데 에러 수만 증가하는지를 구분할 수 있다.

## 크로스 계정/크로스 리전 Observability: 내부 구조

멀티 계정 환경에서 계정마다 CloudWatch 콘솔에 들어가는 것은 운영 비효율이다. AWS는 2022년 **CloudWatch Cross-Account Observability (OAM)**를 GA했다. OAM은 **Observability Access Manager**의 약자다.

아키텍처는 단순하다. Monitoring Account에 **Sink**를 만들고, Source Account들이 그 Sink를 향해 **Link**를 만든다. Link가 연결되면 Source Account의 Metrics, Logs, Traces가 Monitoring Account의 CloudWatch 콘솔에 투명하게 보인다.

```bash
# 1. Monitoring Account에서 Sink 생성
SINK_ARN=$(aws oam create-sink \
  --name "prod-observability-sink" \
  --query 'Arn' --output text)

# 2. Sink에 접근 정책 설정 (어떤 계정이 Link를 만들 수 있는지)
aws oam put-sink-policy \
  --sink-identifier "$SINK_ARN" \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {
        "AWS": ["arn:aws:iam::111122223333:root",
                "arn:aws:iam::444455556666:root",
                "arn:aws:iam::777788889999:root"]
      },
      "Action": ["oam:CreateLink", "oam:UpdateLink"],
      "Resource": "*"
    }]
  }'

# 3. 각 Source Account에서 Link 생성
aws oam create-link \
  --label-template '$AccountName-$AccountId' \
  --resource-types \
    AWS::CloudWatch::Metric \
    AWS::Logs::LogGroup \
    AWS::XRay::Trace \
  --sink-identifier "$SINK_ARN"
```

대시보드 위젯에서 다른 계정 메트릭을 참조하려면 `accountId`와 `region`을 명시한다.

```json
{
  "metrics": [
    ["AWS/EC2", "CPUUtilization", "InstanceId", "i-aaa111bbb",
     {"accountId": "111122223333", "region": "ap-northeast-2",
      "label": "Prod EC2 CPU (계정 A)"}],
    ["AWS/EC2", "CPUUtilization", "InstanceId", "i-ccc333ddd",
     {"accountId": "444455556666", "region": "us-east-1",
      "label": "DR EC2 CPU (계정 B, us-east-1)"}]
  ]
}
```

> 🔍 **더 깊이**: OAM의 내부 구현은 IAM 역할 기반 위임이다. Monitoring Account의 CloudWatch 서비스가 Source Account에 미리 생성된 서비스 연결 역할(service-linked role)을 Assume해 데이터를 읽는다. 이 때 실제 데이터 이동(replication)은 없다. 대신 Monitoring Account의 CloudWatch 콘솔이 Source Account의 CloudWatch API를 직접 호출한다. 따라서 Source Account의 데이터는 Source Account에만 저장되고, Monitoring Account는 "읽기 전용 투명 뷰"를 제공한다. 이 차이가 Metrics Stream(데이터를 물리적으로 복사)과 OAM(읽기 위임)의 근본 차이다.

> 📚 **사례**: 한국의 한 대형 커머스 플랫폼(공개 사례 아님)은 30개 이상의 AWS 계정을 운영한다. 운영팀이 각 계정에 별도로 로그인해 모니터링하다가 2021년에 통합 Monitoring Account로 마이그레이션했다. OAM 도입 후 장애 탐지 시간(MTTD)이 평균 8분에서 3분으로 줄었다고 사내 발표에서 공유했다. 단일 대시보드에서 전 계정 알람을 볼 수 있게 되면서, 한 계정에서 시작된 장애가 다른 계정으로 전파되는 패턴을 훨씬 빨리 포착하게 됐다.

## 다른 플랫폼과의 비교

| 항목 | CloudWatch Dashboard | Grafana (OSS) | Datadog |
|------|---------------------|---------------|---------|
| 데이터 소스 | CloudWatch native | 다중 소스 | Datadog native + 통합 |
| 크로스 계정 | OAM으로 지원 | IAM 역할로 구성 | 계정 통합 기능 |
| 가격 | 3개 무료, 이후 $3/월 | OSS 무료, 호스팅 유료 | 사용량 기반 |
| 코드 정의 | JSON (CloudFormation) | JSON (Grafana API) | Terraform Provider |
| 알람 오버레이 | Alarm Status 위젯 | Annotation | Monitor Alert |
| Logs 통합 | Logs Insights 위젯 | 외부 소스 연결 | Log Management 통합 |

GCP Cloud Monitoring은 MQL(Monitoring Query Language)이라는 자체 쿼리 언어를 사용하며 대시보드 구성이 CloudWatch보다 유연하지만 학습 곡선이 높다. Azure Monitor는 Workbooks라는 인터랙티브 리포트 개념을 도입해 대시보드보다 분석에 가깝다. CloudWatch는 AWS 네이티브 통합이 강점이다.

## Golden Signals와 계층적 대시보드 설계

Google SRE Book(2016)의 4장은 **Four Golden Signals**를 제안한다: Latency(지연), Traffic(처리량), Errors(에러율), Saturation(포화도). 이 네 가지만 잘 보이면 서비스 상태의 90%를 파악할 수 있다.

현실적 대시보드 설계는 세 계층 구조가 효과적이다.

**1계층 — Executive Dashboard (비즈니스 KPI)**
- 방문자 수, 결제 완료 수, 매출 (비즈니스 메트릭)
- 서비스 전체 가용성 (단일 숫자)
- 대시보드 1개, 위젯 10개 이하

**2계층 — Service Dashboard (Golden Signals)**
- 서비스별 p50/p95/p99 레이턴시
- 요청 수 & 에러율
- 주요 리소스 포화도 (CPU, 메모리, 큐 깊이)
- 서비스당 대시보드 1개

**3계층 — Operational Dashboard (드릴다운)**
- 특정 인스턴스/Lambda/RDS의 세부 메트릭
- 사고 분석 시 열어보는 대시보드

대부분의 운영팀은 2계층 대시보드를 TV에 띄운다. 1계층은 경영진 보고용, 3계층은 장애 대응 시 개별 열람용이다.

## Dashboard Variables: 하나의 대시보드, 여러 환경

Variables는 대시보드를 동적으로 만드는 기능이다. 드롭다운으로 환경(dev/stage/prod)이나 인스턴스를 선택하면 모든 위젯이 동시에 바뀐다.

```json
{
  "variables": [
    {
      "type": "property",
      "property": "InstanceId",
      "inputType": "select",
      "id": "InstanceId",
      "label": "EC2 인스턴스",
      "visible": true,
      "search": {
        "expression": "SEARCH('{AWS/EC2,InstanceId} MetricName=\"CPUUtilization\"', 'Average', 60)",
        "populateFrom": "InstanceId"
      }
    },
    {
      "type": "property",
      "property": "FunctionName",
      "inputType": "select",
      "id": "FunctionName",
      "label": "Lambda 함수",
      "visible": true,
      "values": [
        {"label": "order-service", "value": "order-service"},
        {"label": "payment-service", "value": "payment-service"},
        {"label": "notification-service", "value": "notification-service"}
      ]
    }
  ],
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/EC2", "CPUUtilization", "InstanceId", "${InstanceId}"]
        ]
      }
    }
  ]
}
```

`${InstanceId}`처럼 변수를 메트릭 Dimension 값에 삽입한다. SEARCH 표현식으로 Variables를 자동 채우면 새 인스턴스가 생겨도 대시보드 수정 없이 드롭다운에 자동 추가된다.

> 🔍 **더 깊이**: Variables의 `search` 타입은 CloudWatch SEARCH 함수를 활용해 현재 계정/리전의 메트릭 Dimension 값을 동적으로 채운다. Pattern 타입을 쓰면 메트릭 이름 자체를 변수로 만들 수도 있다. 예를 들어 `{AWS/EC2,InstanceId}` 네임스페이스에서 `MetricName`을 패턴으로 잡으면 CPUUtilization/NetworkIn/DiskReadOps 등을 드롭다운으로 선택할 수 있는 "만능 EC2 대시보드"가 만들어진다. 단, SEARCH 기반 Variables는 결과를 동적으로 가져오므로 대시보드 로드 시간이 약간 늘 수 있다.

## Automatic Dashboards와 Container Insights

서비스를 활성화하면 AWS가 자동으로 기본 대시보드를 만들어준다. EC2, Lambda, RDS, DynamoDB, API Gateway 등 주요 서비스가 대상이다. 이 자동 대시보드는 수정할 수 없지만 "시작점"으로 유용하다. 자동 대시보드에 없는 메트릭, 없는 연관성을 커스텀 대시보드에서 추가한다.

Container Insights는 ECS/EKS 환경의 자동 대시보드다. 클러스터, 서비스, Task, Pod 단위의 CPU/메모리/네트워크를 자동으로 수집하고 사전 구성된 대시보드에 보여준다. EC2 CloudWatch Agent가 필요한 것처럼, Container Insights는 클러스터에 DaemonSet(EKS)이나 사이드카(ECS) 형태로 에이전트를 실행해야 한다.

## 대시보드 공유와 보안

- **IAM 사용자 공유**: 계정 내 IAM 사용자에게 대시보드 읽기 권한 부여
- **SSO/Identity Center 공유**: 조직 내 페더레이션 사용자
- **Public Sharing**: 인증 없이 URL로 접근 가능

> ⚠️ **함정**: Public Sharing은 편리하지만 위험하다. 대시보드에 표시되는 EC2 인스턴스 ID, 트래픽 패턴, 에러 메시지, IP 주소 등이 외부에 노출된다. 인스턴스 ID 하나로도 공격자가 "어떤 인스턴스가 외부에 노출됐는지", "피크 트래픽이 언제인지" 같은 정보를 얻을 수 있다. Public Sharing은 "데모용" 또는 "완전히 비민감한 데이터만 있는 경우"에 한정해야 한다.

## 비용 구조

- 대시보드 3개까지 무료
- 4번째 대시보드부터 월 $3/개
- 계정당 대시보드 500개 한도 (기본)
- 자동 대시보드는 비용에 포함되지 않음

50개 팀이 각각 대시보드를 만들면 월 $141의 대시보드 비용이 발생한다. 무시할 수 있는 금액이지만 "대시보드 거버넌스" 없이 운영하다 보면 수백 개의 중복 대시보드가 생기는 경우가 많다. CloudFormation으로 대시보드를 코드로 관리하면 중복 방지와 비용 추적이 된다.

> 💡 **관련 이론**: Amazon의 "Two-Pizza Team" 원칙(Jeff Bezos)처럼, 대시보드도 "팀당 하나의 서비스 대시보드 + 하나의 운영 대시보드"가 적정 수준이다. Dashboard fatigue는 Alert fatigue와 같은 현상이다. 너무 많은 대시보드가 있으면 "어느 대시보드를 봐야 하는지 모르는" 상황이 된다. Netflix의 SRE 팀은 "대시보드는 질문에 답하기 위해 만들어야 한다, 그냥 만들면 안 된다"는 원칙으로 대시보드 수를 관리한다.

## 마무리

대시보드는 "관측의 도구"이지 "해결의 도구"가 아니다. 대시보드에서 이상을 발견하면 알람과 자동화가 대응하고, 대시보드는 그 맥락을 추가로 보여주는 역할이다. 운영자가 새벽에 일어나 TV 대시보드를 직접 보며 판단하는 구조는 지속 가능하지 않다. 알람이 "무언가 잘못됐다"를 탐지하고, 대시보드는 "얼마나 잘못됐고 다른 무엇과 연관됐는지"를 보여주는 분업이 올바른 설계다.

---

## 📝 연습 문제

**문제 1.** 회사가 5개 AWS 계정(Dev/Stage/Prod/DR/Log)을 운영한다. 운영팀이 단일 대시보드에서 Prod와 DR 계정의 EC2 CPU를 동시에 보고 싶다. 올바른 구성 순서는?

A) 각 계정에 별도 대시보드를 만들고 탭으로 전환한다
B) Monitoring Account에 OAM Sink 생성 → Prod/DR 계정에서 Link 생성 → Monitoring Account 대시보드 위젯에 accountId 명시
C) CloudFormation StackSet으로 각 계정에 동일 대시보드 배포
D) CloudWatch Cross-Region은 자동 지원되므로 별도 설정 불필요

**정답: B**
해설: OAM(CloudWatch Cross-Account Observability)의 표준 구성이다. Sink는 데이터를 받는 Monitoring Account에, Link는 데이터를 보내는 Source Account에 만든다. 대시보드 위젯의 메트릭 정의에 `accountId`를 명시하면 한 위젯에서 여러 계정 메트릭을 표시할 수 있다. StackSet으로 같은 대시보드를 각 계정에 배포하면 여전히 계정마다 따로 들어가야 한다.

---

**문제 2.** 운영팀이 하나의 대시보드에서 개발/스테이징/프로덕션 환경을 드롭다운으로 전환해서 보고 싶다. 어떤 기능을 써야 하나?

A) 대시보드를 3개 만들고 URL 링크를 제공한다
B) Dashboard Variables — 환경별 리소스 ID를 Values로 정의하고 위젯에 변수 참조
C) Search Expression으로 모든 환경 메트릭을 한 그래프에 표시
D) CloudFormation 파라미터로 환경별 대시보드를 배포

**정답: B**
해설: Dashboard Variables가 이 목적을 위해 설계됐다. 드롭다운 타입 변수에 dev/stage/prod 각 환경의 리소스 ID를 Values로 등록하고, 위젯 메트릭 정의에서 `${EnvironmentId}` 형태로 참조한다. 드롭다운을 바꾸면 모든 위젯이 동시에 바뀐다. 대시보드 3개를 만드는 것은 일관성 유지와 유지보수가 3배로 늘어난다.

---

**문제 3.** 100개 EC2 인스턴스의 CPU를 하나의 그래프에 표시하되, 새 인스턴스가 추가되면 자동으로 포함되게 하려면?

A) 100개 인스턴스 ID를 위젯에 수동으로 나열
B) SEARCH 표현식: `SEARCH('{AWS/EC2,InstanceId} MetricName="CPUUtilization"', 'Average', 60)`
C) Auto Scaling Group 메트릭을 대신 사용
D) Lambda로 매일 대시보드를 업데이트

**정답: B**
해설: SEARCH 표현식은 네임스페이스와 Dimension 패턴에 매칭되는 모든 메트릭을 동적으로 가져온다. 새 인스턴스가 시작되면 CPUUtilization 메트릭이 자동 발행되므로 SEARCH 결과에 자동 포함된다. 100개 ID를 수동 나열하면 새 인스턴스마다 대시보드를 수정해야 한다. ASG 메트릭은 그룹 평균만 제공해 인스턴스별 개별 추적이 불가능하다.

---

**문제 4.** Public Sharing으로 외부 파트너사에 대시보드 URL을 공유했다. 발생할 수 있는 보안 위험은?

A) AWS 요금이 외부 파트너에게 청구된다
B) 파트너사가 EC2 인스턴스를 종료할 수 있다
C) 인스턴스 ID, 트래픽 패턴, 에러 메시지 같은 운영 정보가 인증 없이 노출된다
D) IAM 정책이 자동으로 변경된다

**정답: C**
해설: Public Sharing은 URL을 아는 누구나 해당 대시보드를 볼 수 있게 한다. 대시보드에 EC2 인스턴스 ID, 에러 메시지 패턴, 트래픽 스파이크 패턴 등이 있다면 공격자에게 유용한 정보가 된다. Read-only 접근이므로 리소스를 직접 변경할 수는 없지만 정보 노출 위험이 있다. 외부 공유가 필요하다면 SSO 사용자 공유 또는 읽기 전용 IAM 사용자 계정을 별도로 만드는 것이 안전하다.

---

**문제 5.** 대시보드 JSON을 CloudFormation으로 관리하는 가장 큰 이점은?

A) 대시보드 로딩 속도가 빨라진다
B) 대시보드 변경 이력 관리, 팀 리뷰(PR), 환경별 자동 배포, 드리프트 감지가 가능하다
C) 대시보드당 비용이 절감된다
D) 대시보드를 3개 이상 무료로 만들 수 있다

**정답: B**
해설: IaC로 관리하면 코드 리뷰 프로세스에 포함되고(PR로 리뷰), Git 이력으로 "누가 언제 어떤 위젯을 추가했는지" 추적된다. 환경별(dev/prod) 파라미터로 동일 템플릿에서 환경별 대시보드를 자동 배포한다. 비용과 속도는 변하지 않는다. `AWS::CloudWatch::Dashboard` 리소스의 DashboardBody 속성에 JSON을 넣으면 된다.

---

**문제 6.** 운영팀이 대시보드 20개를 만들었는데 어느 것을 봐야 할지 모르는 "대시보드 피로(Dashboard Fatigue)"가 생겼다. 어떻게 개선하나?

A) 대시보드를 모두 삭제하고 CloudWatch 콘솔 기본 화면만 사용
B) Executive(1계층) → Service(2계층) → Operational(3계층) 계층 구조로 재설계하고 평상시에는 Service 계층 대시보드만 TV에 표시
C) 모든 메트릭을 하나의 대시보드에 통합
D) 알람 수를 줄여 대시보드와 상관관계를 끊는다

**정답: B**
해설: 계층적 대시보드 설계가 표준 해법이다. 평상시에는 Golden Signals(Latency/Traffic/Errors/Saturation)를 서비스별로 보여주는 2계층을 TV에 띄운다. 이상이 발견되면 3계층(Operational)으로 드릴다운한다. 1계층은 비즈니스 KPI용으로 경영진 보고 시 사용한다. 20개를 모두 보는 것이 아니라 "지금 상황에서 어느 계층을 봐야 하는지"가 명확해야 한다.
