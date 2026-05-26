# Day 1 - CloudWatch Alarms: M of N 평가 모델과 Composite Alarm의 설계 철학

새벽 2시 43분, 온콜 엔지니어의 폰이 세 번 연속 울린다. PagerDuty 알림 15개. EC2 CPU High, RDS Connections High, ALB 5xx High, ElastiCache CPU High, SQS Queue Depth High... 전부 같은 사고에서 파생됐다. 실제 근본 원인은 하나였는데, 엔지니어는 15개 알림에 압도돼 어디부터 봐야 할지 모른다. 이 상황이 **alert fatigue**의 교과서적 형태다.

CloudWatch Alarm은 AWS 운영의 가장 기본적인 자동화 트리거다. 그러나 "임계값 넘으면 알림"이라는 단순한 이해로 설계하면 새벽 온콜 엔지니어를 지치게 만드는 시스템이 된다. 오늘은 알람의 상태 머신, M of N 평가 알고리즘, Treat Missing Data, Composite Alarm, 그리고 Anomaly Detection 알람이 어떻게 설계됐는지 내부까지 들어간다.

## CloudWatch Alarm의 3가지 상태와 유한 상태 머신 구조

CloudWatch Alarm은 정확히 세 가지 상태만 가진다. **OK**: 메트릭이 임계값 안에 있다. **ALARM**: 임계값을 위반했다. **INSUFFICIENT_DATA**: 데이터가 부족해 판단을 내릴 수 없다. 이 세 상태 사이의 전이는 컴퓨터 과학의 유한 상태 머신(FSM, Finite State Machine) 개념의 직접 구현이다.

> 💡 **관련 이론**: FSM은 1950년대 Mealy(1955)와 Moore(1956)가 각각 정형화한 이론이다. 상태의 집합 Q, 입력의 집합 Σ, 전이 함수 δ: Q×Σ→Q, 초기 상태 q₀, 수락 상태의 집합 F로 정의된다. CloudWatch Alarm의 경우 Q={OK, ALARM, INSUFFICIENT_DATA}, 입력은 각 평가 주기의 메트릭 값, 전이 함수는 M of N 평가 알고리즘이다. 상태 전이가 발생할 때마다 EventBridge 이벤트가 발행되는 구조는 Mealy 머신(출력이 상태 전이에 의존)에 가깝다.

상태 전이가 일어나는 순간 EventBridge는 자동으로 `CloudWatch Alarm State Change` 이벤트를 발행한다. 이 이벤트를 통해 Lambda, SNS, SSM Automation, Auto Scaling Policy, EC2 Action(Stop/Terminate/Reboot/Recover)이 연쇄 트리거된다. 알람 자체는 "판단기"이고, 실제 대응 로직은 전이 이벤트에 연결된 타겟들이 담당한다는 분리 원칙이 핵심이다.

초기 상태는 INSUFFICIENT_DATA다. 알람을 생성한 직후 첫 번째 평가 주기가 지나야 OK 또는 ALARM으로 전이된다. 이 점을 모르고 알람을 만들자마자 "동작 안 한다"고 판단하는 신입 운영자가 많다.

## M of N 평가 알고리즘: 왜 이렇게 설계됐나

"최근 N개 데이터 포인트 중 M개가 임계값을 위반하면 ALARM"이라는 규칙이 M of N 평가다. 파라미터는 세 개다.

- `Period`: 한 데이터 포인트가 표현하는 시간(초). 60이면 1분
- `EvaluationPeriods`: 관찰할 데이터 포인트 수 (= N)
- `DatapointsToAlarm`: 그 중 몇 개가 위반해야 ALARM (= M)

Period=60, EvaluationPeriods=5, DatapointsToAlarm=3이면 "최근 5분 중 3분이 임계값을 위반하면 ALARM"이다. M=N이면 연속 N회 위반이 필요하다. M=1이면 첫 번째 위반에 즉시 트리거된다.

이 설계의 배경에는 **hysteresis**(히스테리시스) 원칙이 있다. 전기공학에서 히스테리시스는 시스템의 이전 상태가 현재 출력에 영향을 미치는 현상이다. 온도 조절기가 설정 온도 정확히 20도에서 켜고 끄면 짧은 주기로 계속 토글된다. 그래서 실제 온도 조절기는 "19도 이하면 켜고, 21도 이상이면 끄는" 이중 임계값을 쓴다. M of N의 M<N 설계가 정확히 같은 목적이다. 일시적 spike는 무시하고 지속적인 위반만 알람으로 만든다.

> 💡 **관련 이론**: 시계열 이상 탐지 분야에서 M of N과 유사한 개념을 "windowed threshold"라고 한다. 슬라이딩 윈도우(sliding window) 위에서 임계값 위반 비율을 계산한다. Holt-Winters 예측 모델(CloudWatch Anomaly Detection의 기반)이나 CUSUM(Cumulative Sum) 알고리즘은 더 정교하지만 해석이 어렵다. M of N은 단순하지만 운영자가 직관적으로 이해하고 튜닝할 수 있어 CloudWatch가 선택한 방식이다. 참고: Chandola et al., "Anomaly Detection: A Survey", ACM Computing Surveys (2009).

시험에서 M of N 패턴은 세 가지 형태로 자주 나온다. "일시적 spike에 알람이 자주 울린다" → M<N으로 설정한다. "알람 반응이 느리다, 사고 발생 후 몇 분 뒤에야 알람이 울린다" → N(EvaluationPeriods)이 너무 크거나 Period가 너무 길다. "5분에 한 번씩 spike가 있는 워크로드에서 정상 트래픽인데도 알람이 울린다" → M of N으로 그 spike를 포용하도록 설계한다.

## Treat Missing Data: 데이터가 없을 때 알람은 무엇을 해야 하나

메트릭 데이터가 오지 않을 때 어떻게 처리할지 결정하는 옵션이다. 네 가지가 있다.

| 옵션 | 동작 | 언제 쓰나 |
|------|------|-----------|
| **missing** (기본) | 누락 데이터 무시, 다른 데이터로만 평가 | 일반적 워크로드 |
| **notBreaching** | 누락 = 임계값 이내로 간주 | idle 워크로드, 종료된 인스턴스 |
| **breaching** | 누락 = 임계값 위반으로 간주 | 핵심 가용성 모니터링, "데이터 없으면 문제" |
| **ignore** | 현재 알람 상태 그대로 유지 | 짧은 유지보수 중 상태 보존 |

> ⚠️ **함정**: 기본값 `missing`은 생각보다 위험하다. EC2 인스턴스가 종료되면 CloudWatch 메트릭 스트림이 끊긴다. 이 경우 알람은 INSUFFICIENT_DATA로 전이되고 영원히 그 상태에 머문다. 종료된 인스턴스에 대한 알람이 ALARM이나 OK가 아닌 INSUFFICIENT_DATA인 것이 맞는가? 설계 의도에 따라 다르다. "인스턴스가 살아 있는 동안 모니터링"이 목적이라면 `notBreaching`이 낫다. "항상 살아 있어야 하는 인스턴스"라면 `breaching`이 맞다.

> 📚 **사례**: 2022년 한 한국 핀테크 스타트업(공개되지 않음)에서 결제 서버 EC2가 OOM으로 강제 종료됐다. 알람의 Treat Missing Data가 기본값 `missing`이었고 EvaluationPeriods=5 중 아직 3개만 누락이었기 때문에 ALARM으로 전이되지 않았다. 결제 서버는 15분 동안 죽어 있었는데 알람은 INSUFFICIENT_DATA로 조용히 있었다. 사고를 발견한 건 알람이 아니라 사용자 민원이었다. 이후 팀은 해당 인스턴스의 알람을 `breaching`으로 변경했다.

## EC2 Auto Recovery: StatusCheckFailed_System vs Instance

EC2의 상태 점검은 두 종류다. `StatusCheckFailed_System`은 AWS 인프라(호스트 머신, 네트워크, 전원) 문제다. `StatusCheckFailed_Instance`는 게스트 OS, 커널 패닉, 네트워크 설정 등 소프트웨어 문제다.

Auto Recovery 알람 액션은 `StatusCheckFailed_System`에만 의미가 있다. AWS가 새 물리 호스트로 인스턴스를 마이그레이션한다. Private IP, Elastic IP, EBS 볼륨, 인스턴스 ID는 보존된다. 단, 인스턴스 스토어(ephemeral storage) 데이터는 소실된다.

`StatusCheckFailed_Instance` 알람에는 Auto Recovery 대신 `reboot` 액션이 적합하다. OS 레벨 문제는 재부팅으로 해결되는 경우가 많다. 더 복잡한 대응(SSM Run Command로 메모리 덤프 수집 → 재부팅 → 분석)은 EventBridge → Lambda → SSM 패턴으로 구성한다.

```bash
# StatusCheckFailed_System → Auto Recovery
aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-SystemCheck-Recover" \
  --metric-name StatusCheckFailed_System \
  --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0123456789abcdef0 \
  --period 60 \
  --statistic Maximum \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --datapoints-to-alarm 2 \
  --alarm-actions "arn:aws:automate:ap-northeast-2:ec2:recover"

# StatusCheckFailed_Instance → Reboot
aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-InstanceCheck-Reboot" \
  --metric-name StatusCheckFailed_Instance \
  --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0123456789abcdef0 \
  --period 60 \
  --statistic Maximum \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --datapoints-to-alarm 3 \
  --alarm-actions "arn:aws:automate:ap-northeast-2:ec2:reboot"
```

## Composite Alarm: 알람 노이즈 감소의 구조적 해법

Composite Alarm은 여러 자식 알람의 상태를 Boolean 표현식으로 조합해 상위 알람을 만든다. 표현식에서 사용할 수 있는 연산자는 `ALARM()`, `OK()`, `INSUFFICIENT_DATA()`, `AND`, `OR`, `NOT`이다.

```
ALARM("EC2-CPU-High") AND ALARM("ALB-5xx-High")
ALARM("RDS-CPU-High") OR ALARM("RDS-Connections-High")
(ALARM("a") OR ALARM("b")) AND NOT ALARM("maintenance-window")
```

가장 중요한 기능은 **Actions Suppressor**다. 자식 알람의 액션(SNS, PagerDuty 등)을 비활성화하고 Composite Alarm의 액션만 발화하게 한다. 이 기능 덕분에 "15개 자식 알람이 동시에 울릴 때 PagerDuty 알림 1개"가 가능하다.

> 💡 **관련 이론**: Composite Alarm의 설계는 시스템 공학의 **정보 추상화 계층(abstraction hierarchy)** 원칙을 따른다. Jens Rasmussen의 1983년 논문 "Skills, Rules, and Knowledge"에서 제안한 인지 구조 모델처럼, 하위 세부 신호(자식 알람)를 상위 의미 단위(Composite Alarm)로 추상화한다. 운영자는 "어떤 메트릭이 위반됐나"가 아니라 "서비스 X가 저하됐다"는 단일 신호를 받는다. Netflix의 SRE 팀이 사용하는 "Symptom-based alerting" 철학과 동일하다: 원인(cause)이 아닌 증상(symptom) 기준으로 사람을 깨운다.

> 📚 **사례**: Shopify는 2021년 블랙프라이데이 준비 과정에서 수천 개 알람의 노이즈 문제를 Composite Alarm과 유사한 구조로 해결했다고 SRECon 2022에서 발표했다. 핵심은 "사람을 깨우는 알람(paging alert)"과 "로그에만 남기는 알람(logging alert)"을 명확히 분리하는 것이었다. Composite Alarm이 paging 계층, 자식 알람이 logging 계층을 담당했다.

## Metric Math Alarm: 비율 기반 알람의 표준 패턴

단일 메트릭이 아닌 수식으로 알람을 만들 수 있다. 에러율 알람이 대표적 사례다.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "ALB-ErrorRate-High" \
  --metrics '[
    {"Id":"e","MetricStat":{"Metric":{"Namespace":"AWS/ApplicationELB",
      "MetricName":"HTTPCode_Target_5XX_Count",
      "Dimensions":[{"Name":"LoadBalancer","Value":"app/my-alb/abc"}]},
      "Period":60,"Stat":"Sum"},"ReturnData":false},
    {"Id":"r","MetricStat":{"Metric":{"Namespace":"AWS/ApplicationELB",
      "MetricName":"RequestCount",
      "Dimensions":[{"Name":"LoadBalancer","Value":"app/my-alb/abc"}]},
      "Period":60,"Stat":"Sum"},"ReturnData":false},
    {"Id":"er","Expression":"e/r*100","Label":"Error Rate %","ReturnData":true}
  ]' \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --treat-missing-data notBreaching
```

`e/r*100`은 5xx 에러 수를 전체 요청 수로 나눠 백분율로 만든다. 이 방식은 절대 수치 알람보다 훨씬 강건하다. 트래픽이 100배 증가해도 에러율 5%는 여전히 5%다. 절대 수치로 "5xx 100개 이상이면 알람"이면 트래픽 폭증 시 정상 상태에서도 알람이 울린다.

> 🔍 **더 깊이**: Metric Math에서 사용 가능한 함수는 AWS 문서 기준 40개 이상이다. `SEARCH()` 함수로 특정 패턴의 모든 메트릭을 가져와 `SUM()`할 수 있다. 예를 들어 `SUM(SEARCH('{AWS/EC2,InstanceId} MetricName="CPUUtilization"', 'Average', 60))`는 계정 내 모든 EC2의 평균 CPU를 합산한다. 알람 하나로 전체 함대의 CPU 부하를 모니터링하는 패턴이다. 단, SEARCH 결과는 알람 메트릭으로 직접 사용할 수 없고 (ReturnData:false 강제) 반드시 다른 표현식이 소비해야 한다.

## Anomaly Detection Alarm: ML 기반 동적 임계값

`ANOMALY_DETECTION_BAND()` 함수는 CloudWatch가 내부 ML 모델로 해당 메트릭의 "정상 범위 밴드"를 자동 산출한다. 고정 임계값 대신 "이 시간대, 이 요일의 정상 범위"를 동적으로 계산한다.

내부 알고리즘은 AWS가 공개하지 않지만, 발표된 아키텍처에 따르면 **STL 분해(Seasonal-Trend decomposition using LOESS)**와 유사한 접근으로 시계열을 추세(trend) + 계절성(seasonality) + 잔차(residual)로 분리한 뒤, 잔차의 분포를 기반으로 신뢰 밴드를 구성한다.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "API-Latency-Anomaly-High" \
  --metrics '[
    {"Id":"m1","MetricStat":{"Metric":{"Namespace":"AWS/ApiGateway",
      "MetricName":"Latency"},"Period":300,"Stat":"p99"}},
    {"Id":"ad1","Expression":"ANOMALY_DETECTION_BAND(m1, 2)"}
  ]' \
  --threshold-metric-id ad1 \
  --comparison-operator GreaterThanUpperThreshold \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --treat-missing-data notBreaching
```

두 번째 파라미터 `2`는 표준편차 배수다. 2면 정상 데이터의 약 95%가 밴드 안에 들어온다(가우시안 분포 가정 시). 1로 좁히면 더 민감, 3으로 넓히면 더 둔감하다. 새벽 트래픽이 낮은 시간대에 낮은 밴드, 점심 피크에 높은 밴드로 자동 조정된다.

> 💡 **관련 이론**: Anomaly Detection의 ML 모델은 최소 2주, 권장 6주 이상의 데이터로 학습한다. 신규 서비스에 즉시 켜면 2주간은 밴드가 불안정하다. 이 학습 기간은 시험 단골 문제다. "Anomaly Detection 알람을 켰는데 첫 주에 알람이 안 울렸다. 문제인가?" → 정상이다. 학습 중이다. 주간 계절성(월-금 패턴)을 캡처하려면 최소 2주가 필요하고, 월간 패턴까지 잡으려면 6주가 필요하다.

> 🔍 **더 깊이**: `GreaterThanUpperThreshold`는 밴드 상단을 초과했을 때만 알람이다. "응답 시간이 평소보다 빠른 건 문제가 아니므로" 단방향 체크가 적합하다. 반면 `LessThanLowerOrGreaterThanUpperThreshold`는 양방향이다. Lambda 호출 수가 갑자기 줄어든 것도 이상(배포 후 트래픽이 안 들어오는 경우)이라면 양방향을 쓴다. `GreaterThanUpperThreshold`, `LessThanLowerThreshold`, `LessThanLowerOrGreaterThanUpperThreshold` 세 가지 연산자를 혼동하지 않는 것이 시험 포인트다.

## 다른 모니터링 플랫폼과의 비교

CloudWatch Alarm 설계 철학을 다른 플랫폼과 비교하면 선택의 배경이 명확해진다.

| 항목 | CloudWatch | GCP Cloud Monitoring | Azure Monitor |
|------|-----------|---------------------|---------------|
| 알람 단위 | 메트릭 알람 | Alerting Policy | Alert Rule |
| M of N 평가 | 네이티브 지원 | 조건 창 기반 | 동적 임계값 |
| 복합 알람 | Composite Alarm | 여러 조건 AND/OR | Action Groups |
| 이상 탐지 | Anomaly Detection Band | 자동 예측 임계값 | Dynamic Threshold |
| 알람 상태 | 3가지(OK/ALARM/INSUFFICIENT) | 2가지(OK/ALERTING) | 3가지(OK/Fired/Resolved) |
| 메트릭 저장 | 기본 15개월 | 기본 6주 | 기본 93일 |

GCP의 Alerting Policy는 조건 창(condition window)에서 집계 후 임계값과 비교하는 방식으로 M of N과 유사하지만 직관성이 떨어진다. Azure의 Dynamic Threshold는 CloudWatch Anomaly Detection과 가장 유사하며 동일하게 ML 기반이다.

> 📚 **사례**: 2023년 Datadog State of DevOps 보고서에 따르면, 고성숙도 SRE 팀의 90%가 Composite Alarm 또는 이에 상응하는 "상위 레벨 집약 알람"을 사용한다. 반면 알람 노이즈가 심한 팀의 78%가 단일 메트릭 알람만 사용한다. 알람 설계 성숙도와 MTTR(Mean Time To Recovery) 사이에 강한 상관관계가 있다는 분석이 포함됐다.

## High Resolution Alarm과 비용 모델

표준 알람은 최소 Period=60초다. 10초 또는 30초 주기의 High Resolution 메트릭을 사용하면 High Resolution Alarm이 가능하다. 단 비용이 다르다.

- 표준 알람(60초 이상 Period): 알람당 월 $0.10
- High Resolution 알람(10초, 30초): 알람당 월 $0.30

High Resolution이 필요한 경우는 "5분 안에 치명적 장애가 확산되는" 시나리오다. 결제 처리 서버, 실시간 경매, 게임 매칭 서버 같은 곳이다. 일반 웹 서비스에서 60초 해상도로 충분한 경우가 대부분이다.

```bash
# High Resolution Alarm: 10초 주기 CPU 알람
aws cloudwatch put-metric-alarm \
  --alarm-name "EC2-HighCPU-Fast" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0123456789abcdef0 \
  --period 10 \
  --statistic Maximum \
  --threshold 90 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --datapoints-to-alarm 3 \
  --alarm-actions arn:aws:sns:ap-northeast-2:123456789012:critical-alerts
```

## 운영자 안티패턴 목록

SOA-C02 시험과 실무에서 자주 보이는 잘못된 설계 패턴이다.

**안티패턴 1: M=1, N=1 (즉각 트리거)** — 모든 알람을 "한 번이라도 위반하면 즉시"로 설정. 일시적 spike에 모두 반응한다. 수정: 워크로드 특성에 맞게 M of N 조정.

**안티패턴 2: 자식 알람마다 PagerDuty 액션** — 한 사고에 수십 개 알림. 수정: 자식 알람은 Actions Suppressor, Composite Alarm만 PagerDuty.

**안티패턴 3: 모든 알람 Treat Missing Data = breaching** — 잠깐의 CloudWatch 수집 지연에도 ALARM 전이. 수정: 서비스 성격에 따라 선택적으로 적용.

**안티패턴 4: Period가 짧고 EvaluationPeriods가 적은 알람** — 반응은 빠르지만 노이즈가 많다. 수정: 반응 속도(Period×EvaluationPeriods)와 노이즈 허용(M/N 비율) 사이 트레이드오프 인식.

**안티패턴 5: Cross-Region 메트릭에 직접 알람** — CloudWatch 알람은 같은 리전 메트릭만 평가 가능. 다른 리전 메트릭을 보려면 Metric Stream으로 중앙 계정에 복사 후 알람. 이 제약을 모르고 설계하면 멀티 리전 모니터링에 구멍이 생긴다.

## 마무리

CloudWatch Alarm은 단순해 보이지만 M of N, Treat Missing Data, Composite Alarm, Anomaly Detection의 조합이 설계의 품질을 결정한다. 새벽 온콜 엔지니어가 15개 알림에 압도되는 시스템과 1개의 의미 있는 알림을 받는 시스템의 차이는 바로 이 설계 철학의 차이다. 시험에서는 각 파라미터의 의미와 시나리오별 올바른 설정을 묻는다.

---

## 📝 연습 문제

**문제 1.** 한 운영팀의 EC2는 정상 운영 중에도 매 시간 30초간 CPU spike가 발생한다(예약된 배치 작업). 이 spike마다 PagerDuty 알림이 울린다. 어떻게 조정해야 하나?

A) Threshold를 90%로 높인다
B) EvaluationPeriods=5, DatapointsToAlarm=4로 설정해 일시적 spike는 무시하도록 한다
C) Period를 10초로 줄인다
D) Treat Missing Data를 breaching으로 변경한다

**정답: B**
해설: 30초 spike는 1분 Period 데이터 포인트 하나에서만 위반이다. M of N으로 N=5, M=4이면 "5분 중 4분이 위반"해야 알람이 울려 일회성 spike는 통과된다. Threshold를 높이면 진짜 과부하도 놓칠 수 있다. Period를 줄이면 더 자주 위반을 감지해 오히려 악화된다.

---

**문제 2.** 결제 처리 EC2가 OOM으로 강제 종료됐다. 알람의 Treat Missing Data가 기본값 missing, EvaluationPeriods=5이고 현재 3개 데이터 포인트만 누락됐다. 알람 상태는?

A) ALARM — 인스턴스가 죽었으므로
B) INSUFFICIENT_DATA — 데이터 포인트가 충분히 누락되지 않았음
C) OK — missing은 정상으로 간주
D) 알람이 비활성화됨

**정답: B**
해설: missing 옵션은 누락 데이터를 무시하고 다른 데이터포인트로만 평가한다. 5개 중 3개가 누락되면 나머지 2개의 데이터로 판단하는데, 마지막 정상 데이터 2개가 OK였다면 알람은 OK 또는 INSUFFICIENT_DATA를 유지한다. 진짜 가용성 모니터링이 목적이면 Treat Missing Data를 breaching으로 설정해야 한다.

---

**문제 3.** 한 사고에서 EC2, RDS, ALB, ElastiCache 총 20개 알람이 동시에 울려 PagerDuty에 알림이 쏟아졌다. 이를 해결하는 가장 적합한 방법은?

A) 알람 임계값을 모두 높인다
B) 모든 알람의 EvaluationPeriods를 늘린다
C) Composite Alarm으로 자식 알람들을 묶고 Actions Suppressor를 적용해 부모 알람만 PagerDuty로 전송
D) Period를 모두 5분으로 통일한다

**정답: C**
해설: 이것이 Composite Alarm의 핵심 설계 목적이다. 자식 알람들은 Actions Suppressor로 액션을 비활성화하고, AND/OR 표현식으로 "진짜 서비스 저하" 상태를 나타내는 Composite Alarm 하나만 PagerDuty로 연결한다. 임계값을 높이거나 Period를 늘리면 탐지 자체가 느려지는 다른 문제가 생긴다.

---

**문제 4.** EC2 Auto Recovery를 설정했는데 게스트 OS 커널 패닉 시 Recovery가 동작하지 않는다. 이유는?

A) Auto Recovery는 비활성화 상태
B) StatusCheckFailed_Instance 알람으로는 Auto Recovery가 작동하지 않는다. System Check 실패만 Recovery 가능
C) Recovery는 EBS 볼륨이 없을 때만 동작
D) 리전 제한

**정답: B**
해설: EC2 Auto Recovery는 `StatusCheckFailed_System` — AWS 인프라(호스트 하드웨어, 전원, 네트워크) 문제에만 동작한다. 게스트 OS 커널 패닉은 `StatusCheckFailed_Instance`이며 AWS가 제어할 수 없는 소프트웨어 레이어 문제다. 이 경우엔 Reboot 액션 또는 SSM Automation을 통한 더 정교한 대응이 필요하다.

---

**문제 5.** API Gateway 응답 시간을 Anomaly Detection으로 모니터링하려 한다. "평소보다 느린 경우"에만 알람이 울리게 설정하는 올바른 ComparisonOperator는?

A) LessThanLowerOrGreaterThanUpperThreshold
B) GreaterThanUpperThreshold
C) LessThanLowerThreshold
D) GreaterThanThreshold

**정답: B**
해설: 응답 시간이 "평소보다 빠른" 것은 문제가 아니다. 밴드 상단을 초과한, 즉 평소보다 느린 경우에만 알람이 필요하다. `GreaterThanUpperThreshold`는 밴드 위쪽만 감지한다. 양방향 감지(너무 빠르거나 너무 느린 것 모두)가 필요하면 `LessThanLowerOrGreaterThanUpperThreshold`를 쓴다. Lambda 호출 수처럼 갑자기 0이 되는 것도 이상인 경우에는 양방향이 맞다.

---

**문제 6.** CloudWatch 알람의 Cross-Region 제약으로 인해 발생하는 운영 문제는?

A) 알람이 다른 리전 SNS에 메시지를 보낼 수 없다
B) 알람은 동일 리전 메트릭만 평가 가능해 다른 리전 메트릭을 직접 알람 소스로 쓸 수 없다
C) 알람이 다른 리전의 EC2를 복구할 수 없다
D) Composite Alarm은 한 리전에서만 자식을 가질 수 있다

**정답: B**
해설: CloudWatch Alarm은 동일 리전의 메트릭만 평가 가능하다는 근본 제약이 있다. us-east-1 메트릭으로 ap-northeast-2에서 알람을 만들 수 없다. 멀티 리전 모니터링을 위해서는 Metric Stream으로 중앙 계정의 단일 리전에 메트릭을 복사한 후 그 리전에서 알람을 만드는 패턴, 또는 각 리전에 알람을 두고 EventBridge cross-region 규칙으로 집약하는 패턴을 쓴다.

---

**문제 7.** M of N 파라미터에서 EvaluationPeriods=10, DatapointsToAlarm=1로 설정하면 어떤 동작을 하나?

A) 10번 연속 위반해야 알람이 울린다
B) 최근 10개 데이터 포인트 중 1개라도 위반하면 즉시 알람이 울린다
C) 10번 중 절반인 5번 위반해야 알람이 울린다
D) INSUFFICIENT_DATA 상태가 된다

**정답: B**
해설: DatapointsToAlarm=1은 N개 관찰 창에서 단 1개만 위반해도 알람이 트리거되는 가장 민감한 설정이다. 이 설정은 EvaluationPeriods를 늘려 반응 시간을 조절하되 한 번의 위반만으로도 알람을 울려야 하는 시나리오에 적합하다. 예를 들어 "10분 관찰 창 내 어느 시점이든 5xx 에러가 발생하면"이 이 패턴이다.
