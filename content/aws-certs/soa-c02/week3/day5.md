# Day 5 - Week 3 복습: CloudWatch 관측 가능성 스택 종합

Week 3에서 다룬 CloudWatch 도구들은 각각 독립적이지만, 실제 운영에서는 하나의 관측 가능성 파이프라인을 이룬다. Alarm이 "무언가 잘못됐다"를 감지하면, Dashboard가 "어느 범위에서 얼마나"를 보여주고, Agent가 "게스트 OS 내부"를 들여다보게 하고, Synthetics가 "사용자 관점"을 유지하고, X-Ray가 "어떤 서비스의 어떤 호출"이 원인인지 추적한다. 이 파이프라인이 모두 맞물려야 장애 탐지에서 원인 분석까지의 MTTD·MTTK(Mean Time To Know)가 줄어든다.

오늘은 이 다섯 도구가 실제로 어떻게 연결되는지 구조를 재조명하고, 각 도구의 내부 설계 원칙을 비교표로 정리한 뒤, 시험에서 가장 자주 나오는 시나리오 10개를 풀어본다.

## Week 3 핵심 개념 연결 지도

```
[Synthetics Canary]            [실 사용자 + RUM]
 24/7 가용성 측정                LCP/CLS/JS 에러
 트래픽 없어도 탐지               실 사용자 데이터만
       │                              │
       ▼                              ▼
[CloudWatch Alarms]  ←──── [CloudWatch Metrics]  ←──── [CloudWatch Agent]
 M of N 평가                 (Standard + Custom)         EC2 메모리/디스크
 Composite Alarm              Dashboard에 표시            procstat/StatsD
 Anomaly Detection                   │                    커스텀 네임스페이스
       │                             │
       ▼                             ▼
 [SNS/PagerDuty]            [CloudWatch Dashboard]
 [SSM Automation]            Cross-Account OAM 통합
 [Auto Scaling]              Golden Signals 설계
                                     │
                              [X-Ray + ServiceLens]
                               분산 추적 → Logs 점프
                               Service Map → Trace → Log
```

> 💡 **관련 이론**: 이 파이프라인은 제어 이론의 **관측 가능성(Observability)** 개념을 현대 분산 시스템에 적용한 것이다. Rudolf Kalman이 1960년 "On the General Theory of Control Systems"에서 처음 정형화한 개념으로, "시스템의 외부 출력만으로 내부 상태를 완전히 추정할 수 있는가"를 묻는다. Metrics(숫자), Logs(텍스트), Traces(경로)라는 세 신호가 현대 운영에서의 "외부 출력"이다. CloudWatch는 세 신호를 하나의 플랫폼으로 통합하고 X-Ray가 Trace를 담당하며, ServiceLens가 이 셋을 하나의 화면에서 연결한다.

## 헷갈리기 쉬운 핵심 비교

**M of N vs Treat Missing Data**

M of N은 "얼마나 지속돼야 알람인가"를 제어한다. Treat Missing Data는 "데이터가 없을 때 어떻게 판단하나"를 제어한다. 두 설정을 혼동하는 경우가 많다.

| 설정 | 제어 대상 | 핵심 사용 사례 |
|------|-----------|----------------|
| M of N (EvaluationPeriods + DatapointsToAlarm) | 위반 지속 기간 | 일시적 spike 무시 |
| Treat Missing Data: breaching | 데이터 없음 = 위반 | 항상 살아있어야 하는 서비스 |
| Treat Missing Data: notBreaching | 데이터 없음 = 정상 | idle 워크로드, 종료된 인스턴스 |
| Treat Missing Data: missing (기본) | 누락 무시, 다른 데이터로 평가 | 일반적 경우 |
| Treat Missing Data: ignore | 현재 상태 유지 | 유지보수 창 동안 상태 고정 |

**Synthetics vs RUM vs X-Ray**

| 항목 | Synthetics | RUM | X-Ray |
|------|-----------|-----|-------|
| 관점 | 외부 봇 | 실 사용자 브라우저 | 내부 서비스 간 |
| 트래픽 불필요 | O (합성) | X | X |
| 지연 원인 찾기 | 불가 | 부분적 (브라우저 레이어) | O (Subsegment 단위) |
| 서비스 맵 | X | X | O |
| 비용 모델 | canary당 실행 횟수 | RUM 이벤트 수 | Trace 수 |
| 새벽 무트래픽 탐지 | O | X | X |

> 💡 **관련 이론**: 이 세 도구의 구분은 소프트웨어 품질 측정 이론에서 **외부 품질(external quality)**과 **내부 품질(internal quality)**의 차이에 대응한다. Synthetics와 RUM은 사용자가 경험하는 외부 품질을 측정하고, X-Ray는 시스템 내부의 구조적 품질(어떤 컴포넌트가 어떤 레이턴시를 추가하는가)을 측정한다. Google SRE의 "Golden Signals"(지연, 트래픽, 에러, 포화)는 이 두 관점을 합친 프레임워크로, Synthetics는 가용성을 포함한 외부 지연과 에러를 측정하고 X-Ray는 내부 컴포넌트별 지연과 포화를 측정한다.

**Composite Alarm vs Metric Math Alarm**

| 항목 | Composite Alarm | Metric Math Alarm |
|------|-----------------|-------------------|
| 입력 | 다른 알람들의 상태(OK/ALARM) | 메트릭 + 수식 |
| 표현식 | `ALARM("a") AND ALARM("b")` | `e/r*100 > 5` |
| 목적 | 알람 노이즈 감소, 서비스 단위 집약 | 에러율 등 파생 지표 알람 |
| Actions Suppressor | O (자식 알람 액션 비활성화) | X |
| 비용 | Composite Alarm + 자식 알람 각각 과금 | 알람 1개 과금 |

> 💡 **관련 이론**: Composite Alarm의 Boolean 표현식 설계는 논리 회로(Logic Circuit) 이론과 동일한 구조를 가진다. AND/OR/NOT 게이트를 조합해 복합 조건을 표현하는 것이 디지털 회로 설계의 기본이듯, 알람을 논리 게이트로 조합해 "서비스 전체가 저하됐는가"를 판단한다. 이 추상화 계층은 Jens Rasmussen(1983)의 "Skills, Rules, Knowledge" 모델에서 설명하는 인지적 계층화와 일치한다: 하위 신호(자식 알람)를 상위 의미 단위(서비스 상태)로 추상화한다.

**CloudWatch Agent 수집 메트릭 종류**

| 메트릭 | 수집 방법 | 네임스페이스 | Agent 필요 여부 |
|--------|-----------|-------------|----------------|
| CPU Utilization | 하이퍼바이저 | AWS/EC2 | 불필요 |
| Network In/Out | 하이퍼바이저 | AWS/EC2 | 불필요 |
| mem_used_percent | /proc/meminfo | CWAgent (커스텀) | 필요 |
| disk_used_percent | statfs() syscall | CWAgent (커스텀) | 필요 |
| 프로세스별 CPU | /proc/[pid]/stat | CWAgent (커스텀) | 필요 (procstat) |
| 애플리케이션 커스텀 | StatsD UDP 8125 | 커스텀 지정 | 필요 (StatsD 서버) |

> 🔍 **더 깊이**: CloudWatch Agent가 Linux에서 `/proc/meminfo`를 읽는 방식과 Windows에서 WMI(Windows Management Instrumentation) Performance Counter를 읽는 방식은 근본적으로 다르다. Linux는 procfs라는 가상 파일 시스템을 통해 커널이 메모리 통계를 실시간으로 노출하는데, `MemTotal`, `MemFree`, `Buffers`, `Cached` 필드를 조합해 `mem_used_percent`를 계산한다. 계산식은 `(MemTotal - MemFree - Buffers - Cached) / MemTotal × 100`이다. `free -m` 명령의 `used` 컬럼과 일치하는 값이다. Windows에서는 `\Memory\% Committed Bytes In Use` 카운터를 사용한다.

**X-Ray Sampling: Reservoir + Fixed Rate 흐름**

```
초당 요청 2000개 → Sampling Rule 적용
                    │
          Reservoir = 10 (초당 최소 10개 보장)
                    │
          ┌─────────┴─────────┐
     첫 10개 요청           나머지 1990개
     (100% 샘플링)          Fixed Rate = 5% 적용
                               = 약 99개 추가 샘플
                    │
          총 초당 약 109개 Trace 전송
```

> 💡 **관련 이론**: X-Ray의 Reservoir + Fixed Rate 설계는 네트워크 트래픽 제어의 **토큰 버킷(Token Bucket)** 알고리즘과 구조적으로 동일하다. Reservoir가 버킷 크기(burst capacity)이고, Fixed Rate가 지속 처리율(sustained rate)이다. RFC 2697(srTCM, Single Rate Three Color Marker)과 RFC 2698(trTCM)이 이 패턴을 표준화한다. 저트래픽 구간(새벽)에는 Reservoir만으로 충분히 샘플링되고, 고트래픽 구간(점심)에는 Fixed Rate로 비용을 통제하는 자동 조절 메커니즘이다.

## 실무 운영 안티패턴 종합

Week 3에서 배운 각 도구의 안티패턴을 한 번에 정리한다.

**알람 안티패턴**
- 모든 알람 DatapointsToAlarm=1 → 모든 spike에 PagerDuty 폭격
- Treat Missing Data 기본값(missing) + 핵심 서비스 → 인스턴스 죽어도 알람 안 울림
- 자식 알람마다 PagerDuty 액션 → 한 사고에 수십 개 알림
- Cross-Region 메트릭에 직접 알람 시도 → 동작하지 않음 (동일 리전만 평가 가능)
- Anomaly Detection을 서비스 시작 당일에 신뢰 → 2주 학습 기간 동안 밴드가 불안정

**대시보드 안티패턴**
- Public Sharing으로 외부 공유 → 인스턴스 ID, 트래픽 패턴, 에러 메시지 무인증 노출
- 50개 위젯 한 대시보드 → Dashboard Fatigue (화면이 많다고 관측 가능성이 높아지지 않음)
- 단위 없는 Number 위젯 → 맥락 없는 숫자 ("1247은 좋은 건가 나쁜 건가?")
- 계층 구조 없이 모두 동일 중요도 → 장애 시 어디부터 볼지 모름

**Agent 안티패턴**
- IAM Role 없이 Agent 설치 → PutMetricData AccessDenied (Agent가 CloudWatch API 호출 권한 없음)
- State Manager 없이 User Data만으로 배포 → 설정 drift 무방비
- retention_in_days 미설정 → Log Group 영구 보관으로 비용 증가 (Never Expire)
- Custom Namespace 확인 없이 AWS/EC2에서 메모리 검색 → 없음, 알람 생성 불가

**X-Ray 안티패턴**
- 100% 샘플링 → 고트래픽 서비스에서 비용 폭발 (100M RPS × $5/1M Traces = $500/일)
- SDK captureAWS() 없이 DynamoDB 호출 → Subsegment 안 보임, Service Map에 DynamoDB 노드 없음
- Sampling Rule 우선순위 미설정 → 중요 결제 API와 헬스체크가 동일 샘플링률
- Fault vs Error 혼동 → Fault(5xx, AWS 책임 가능성)와 Error(4xx, 클라이언트 문제) 구분이 근본 원인 분석에서 중요

> 📚 **사례**: 2023년 대형 이커머스 A사(공개 사례)는 블랙프라이데이 준비 과정에서 X-Ray 100% 샘플링을 켜두다 하루 $8,000의 예상치 못한 X-Ray 청구를 받았다. 트래픽 폭증 구간에 고정된 Reservoir + 낮은 Fixed Rate(1%)로 전환하자 비용이 $40/일로 감소하면서도 에러 추적은 별도 Priority 1 Rule로 100% 유지했다. Sampling Rule 설계의 ROI가 매우 높은 최적화 포인트다.

> ⚠️ **함정**: ServiceLens는 CloudWatch, X-Ray, Synthetics Canary 데이터를 통합하는 뷰지만, 세 서비스가 각각 정상 동작 중이어야 한다. Lambda Active Tracing이 꺼져 있으면 ServiceLens Service Map에 Lambda가 나타나지 않는다. X-Ray SDK로 AWS SDK를 wrap하지 않으면 DynamoDB, SQS 등 하위 서비스가 Map에서 사라진다. ServiceLens 화면이 비어 보이면 X-Ray SDK 설정과 Active Tracing 여부를 먼저 확인한다.

## 다른 클라우드 플랫폼과의 비교

| 기능 | AWS CloudWatch | GCP Cloud Operations | Azure Monitor |
|------|---------------|---------------------|---------------|
| Metrics | CloudWatch Metrics | Cloud Monitoring | Azure Monitor Metrics |
| Logs | CloudWatch Logs | Cloud Logging | Log Analytics |
| Traces | X-Ray | Cloud Trace | Application Insights |
| Agent | CloudWatch Agent | Ops Agent | Azure Monitor Agent |
| 합성 모니터링 | Synthetics Canary | Uptime Checks | Application Insights Availability |
| 이상 탐지 | Anomaly Detection | Alerting Policy ML | Dynamic Threshold |
| 크로스 계정 | OAM Sink+Link | Workspace 기반 | Resource scope |
| 대시보드 | CloudWatch Dashboard | Cloud Monitoring Dashboard | Azure Dashboard |

> 🔍 **더 깊이**: GCP의 Ops Agent는 CloudWatch Agent와 구조적으로 유사하지만, 내부 파이프라인으로 OpenTelemetry Collector를 사용한다. CloudWatch Agent는 자체 Go 바이너리로 동작한다. Azure Monitor Agent는 DCR(Data Collection Rules)로 수집 정책을 중앙에서 정의한다는 점이 다르다. CloudWatch Agent는 SSM Parameter Store로 설정을 중앙화하는 방식이 이에 대응한다. 세 플랫폼 모두 에이전트 없이 수집 가능한 메트릭(하이퍼바이저 레이어)과 에이전트가 필요한 메트릭(OS 레이어)이 명확히 나뉜다는 점은 동일하다.

## 장애 대응 흐름: 도구 연결 순서

실제 장애 발생 시 CloudWatch 도구들을 어떤 순서로 사용하는지 시나리오별로 정리한다.

**시나리오: API 응답 시간 급증**

```
1. Composite Alarm 트리거 (ALB Latency High AND EC2 CPU High)
   → PagerDuty 알림
2. CloudWatch Dashboard에서 전체 범위 파악
   - ALB RequestCount, TargetResponseTime
   - EC2 CPUUtilization (Agent 커스텀: mem_used_percent, disk_used_percent)
3. X-Ray ServiceLens에서 Service Map 확인
   - 어떤 서비스(Lambda, DynamoDB, RDS)에서 지연 발생?
4. 문제 서비스 Trace 상세 → Subsegment 레벨에서 병목 특정
5. ServiceLens "View Logs" → CloudWatch Logs에서 해당 실행 로그 즉시 확인
6. Synthetics Canary 결과 → 사용자 엔드포인트 가용성 현황 확인
```

> 💡 **관련 이론**: 이 대응 순서는 "Breadth-First Search → Depth-First" 전략이다. 처음에는 넓게(대시보드, 전체 서비스 맵) 보다가, 범위를 좁혀(특정 서비스 Trace) 깊이 파고든다(Subsegment, 로그). 이것이 Google SRE가 권고하는 "structured troubleshooting"의 핵심: 증상에서 원인으로, 넓은 가설에서 좁은 가설로.

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스가 OOM으로 강제 종료됐다. 메모리 알람은 Treat Missing Data = missing이고 EvaluationPeriods=5다. 현재 데이터 포인트 2개가 누락됐다. 알람 상태는?

A) ALARM — 인스턴스가 OOM으로 종료돼 메트릭이 끊겼으므로 missing 설정과 무관하게 자동으로 ALARM 전이
B) INSUFFICIENT_DATA — 데이터가 충분히 누락되지 않아 판단 불가
C) OK — Treat Missing Data = missing은 누락 구간을 정상으로 간주해 마지막 상태를 OK로 유지
D) DISABLED — 데이터 소스가 사라지면 CloudWatch가 알람을 자동으로 비활성화 처리

**정답: B**
해설: Treat Missing Data = missing은 누락된 데이터 포인트를 무시하고 남은 데이터포인트(3개)로 평가한다. 마지막 3개 포인트가 정상이었다면 알람은 OK 또는 INSUFFICIENT_DATA 상태를 유지한다. "인스턴스가 죽었으니 자동 ALARM"은 틀린 가정이다. 핵심 가용성 서버는 Treat Missing Data = breaching으로 설정해야 인스턴스 소실 시 ALARM으로 전이된다.

---

**문제 2.** 운영팀이 한 사고에서 EC2/RDS/ALB/ElastiCache 알람 20개가 동시에 울려 PagerDuty가 20번 울렸다. 이를 해결하는 가장 구조적인 방법은?

A) 20개 알람의 임계값을 모두 높여 동시 발화 가능성을 낮추고, 한 번에 울리는 알람 수를 줄인다
B) 20개 알람의 EvaluationPeriods·DatapointsToAlarm을 모두 늘려 일시적 동시 spike에 의한 다중 발화를 억제한다
C) 자식 알람 20개에 Actions Suppressor 적용 + Composite Alarm으로 논리 조합 → 부모만 PagerDuty
D) 상관관계 높은 알람을 묶어 20개를 10개로 통합하고, 나머지는 SNS 대신 대시보드로만 노출한다

**정답: C**
해설: Composite Alarm의 핵심 사용 사례다. 자식 알람 20개는 각각 메트릭을 추적하되 액션을 비활성화한다. Composite Alarm이 "ALB 5xx AND (EC2 CPU OR RDS CPU)" 같은 논리 조합으로 "실제 서비스 저하" 상태를 판단하면, 그 하나만 PagerDuty에 연결한다. 임계값을 높이거나 EvaluationPeriods를 늘리면 탐지 자체가 느려지는 다른 문제가 생긴다.

---

**문제 3.** EC2 메모리 사용률 90% 알람을 만들었는데 CloudWatch에서 해당 메트릭을 찾을 수 없다. 원인과 해결책은?

A) Detailed Monitoring을 활성화하면 수집 간격이 1분으로 줄면서 메모리 메트릭이 AWS/EC2에 추가된다
B) 메모리는 EC2 기본 메트릭에 없다. CloudWatch Agent 설치 + mem 플러그인 설정 + Custom Namespace에서 알람 생성
C) 메모리는 AWS/EC2가 아니라 AWS/EC2/MemoryUtilization 같은 별도 시스템 네임스페이스에 발행되므로 그곳에서 찾는다
D) 메트릭이 인스턴스 home Region이 아닌 us-east-1에 발행되므로 콘솔 리전을 us-east-1로 바꿔 검색한다

**정답: B**
해설: EC2 메모리는 하이퍼바이저가 볼 수 없는 게스트 OS 내부 정보다. CloudWatch Agent를 설치하고 설정 파일에 `mem` 섹션을 추가하면 `CWAgent` 네임스페이스(또는 설정한 커스텀 네임스페이스)에 `mem_used_percent` 메트릭이 발행된다. 알람 생성 시 `AWS/EC2`가 아닌 그 네임스페이스를 선택해야 한다.

---

**문제 4.** 회사가 5개 AWS 계정을 운영한다. 모든 계정의 EC2 CPU를 단일 대시보드에서 보고 싶다. 올바른 구성은?

A) Organizations 관리 계정의 대시보드는 멤버 계정 메트릭을 자동 상속하므로 추가 설정 없이 모든 계정 CPU가 보인다
B) CloudWatch Cross-Account Observability: Monitoring Account에 OAM Sink + 각 계정에 Link 생성 → 대시보드 위젯에 accountId 명시
C) CloudFormation StackSet으로 동일한 대시보드를 5개 계정에 배포하고, 각 계정 콘솔에서 자기 EC2 CPU를 본다
D) 각 계정 EventBridge 룰로 CPU 메트릭 변경 이벤트를 중앙 계정 버스에 복사한 뒤 PutMetricData로 재발행해 통합한다

**정답: B**
해설: OAM(Observability Access Manager) Sink+Link 구조가 CloudWatch Cross-Account Observability의 표준이다. Monitoring Account에 Sink를 만들고 Sink 정책으로 어느 계정이 Link를 만들 수 있는지 제어한다. 각 Source Account에서 Link를 생성하면 Monitoring Account 콘솔에서 다른 계정 메트릭이 보인다. 대시보드 위젯의 메트릭 정의에 `accountId`와 `region`을 명시해야 한다.

---

**문제 5.** 새벽 2시에 API가 다운됐는데 트래픽이 없어서 RUM에도 데이터가 없고 알람도 안 울렸다. 이 문제를 예방하는 가장 적합한 도구는?

A) CloudWatch Agent의 수집 간격을 1초 해상도로 줄여 새벽 다운 구간을 더 촘촘히 포착한다
B) RUM 스니펫을 모든 페이지에 추가하고 세션 샘플링률을 100%로 올려 새벽 트래픽까지 빠짐없이 수집한다
C) Synthetics Canary로 1분 주기 Heartbeat Canary를 설정한다
D) X-Ray 샘플링률을 100%로 올려 새벽 시간대 요청까지 모두 추적해 다운을 감지한다

**정답: C**
해설: RUM은 실제 사용자가 없는 새벽엔 데이터가 없다. Synthetics Canary는 합성 사용자(봇)가 정해진 주기로 API를 호출하므로 트래픽과 무관하게 24/7 가용성을 측정한다. 실패 시 `SuccessPercent` 메트릭이 떨어지고 알람 → SNS로 즉시 통보된다. X-Ray 샘플링률은 비용과 추적 정밀도에 관한 것이며 가용성 탐지와 무관하다.

---

**문제 6.** Anomaly Detection 알람을 새로 활성화했는데 2주가 지나도 한 번도 알람이 울리지 않았다. 정상인가, 문제인가?

A) 권한 문제다. 알람 역할에 `cloudwatch:GetMetricData`·`PutAnomalyDetector` 권한이 없으면 밴드 평가가 조용히 실패한다
B) 정상이다. 서비스가 2주간 안정적으로 동작하고 있는 것이다. Anomaly Detection은 최소 2주 학습 후 밴드가 안정화된다
C) `ANOMALY_DETECTION_BAND` 수식이 알람 조건에 연결되지 않아 모델은 학습하지만 알람이 메트릭을 평가하지 못한다
D) 학습 기간 동안 소스 메트릭이 결측이라 알람이 INSUFFICIENT_DATA에 머물러 한 번도 발화하지 못한다

**정답: B**
해설: Anomaly Detection의 ML 모델은 최소 2주 데이터로 학습한다. 학습 기간 동안 밴드가 불안정하거나 넓게 잡혀 위반이 감지되지 않는 것이 정상이다. 2주 이후부터 주간 계절성(월-금 패턴)을 반영한 더 정확한 밴드가 형성된다. 2주 동안 알람이 안 울렸다면 서비스가 정상적으로 동작하고 있을 가능성이 높다.

---

**문제 7.** Lambda 함수 내 DynamoDB 쿼리의 지연 시간을 X-Ray로 추적하려 한다. 필요한 조치 두 가지는?

A) Lambda 함수의 Active Tracing 활성화 + X-Ray SDK의 captureAWS()로 AWS SDK 래핑
B) Lambda 함수의 Active Tracing만 활성화하면 런타임이 모든 AWS SDK 호출을 자동 계측해 DynamoDB Subsegment까지 보인다
C) Lambda 실행 환경에 CloudWatch Agent를 설치하고 X-Ray Daemon을 사이드카로 띄워 DynamoDB 호출 지연을 수집한다
D) EventBridge로 DynamoDB API 이벤트를 받아 CloudTrail Data Event와 조인해 쿼리 지연을 재구성한다

**정답: A**
해설: Lambda Active Tracing은 Lambda 실행 자체를 Segment로 추적한다. Lambda 내부 DynamoDB 호출을 Subsegment로 추적하려면 추가로 X-Ray SDK를 사용해 `const AWS = AWSXRay.captureAWS(require('aws-sdk'))`로 AWS SDK를 래핑해야 한다. 이 래핑이 없으면 DynamoDB 호출은 X-Ray Service Map에서 보이지 않는다. B는 Active Tracing만으로 SDK 호출이 자동 계측되지 않으므로 부족하고, C의 X-Ray Daemon은 Lambda에선 AWS가 관리해 별도 설치가 불가하며, D는 추적이 아니라 감사 로그라 Subsegment 지연을 줄 수 없다.

---

**문제 8.** 100대 EC2에 CloudWatch Agent를 배포했는데 일부 인스턴스에서 Agent 설정이 초기화됐다(다른 설정으로 덮어써짐). 이를 방지하는 방법은?

A) 설정이 틀어진 인스턴스를 모두 재시작해 User Data 부트스트랩으로 Agent 설정을 다시 적용한다
B) SSM State Manager Association으로 원하는 설정을 주기적으로 강제 적용(desired state enforcement)
C) CloudFormation으로 인스턴스를 immutable하게 재배포해 변경된 설정을 새 AMI 기준으로 초기화한다
D) IAM 정책으로 EC2 인스턴스 내 Agent 설정 파일(`amazon-cloudwatch-agent.json`) 쓰기를 Deny해 수정을 원천 차단한다

**정답: B**
해설: SSM State Manager의 핵심 기능이 "Drift 자동 교정"이다. Association을 rate(24 hours)로 설정하면 24시간마다 SSM Parameter Store의 설정으로 Agent를 재구성한다. 누군가 설정을 변경해도 다음 Association 실행 시 원래 설정으로 자동 복구된다. IAM 정책으로 파일 수정을 막는 것은 EC2 내 프로세스 수준에서 어렵다.

---

**문제 9.** ServiceLens를 사용하는 가장 큰 실무 이점은?

A) Trace와 Logs를 단일 뷰로 묶어 중복 저장을 제거하므로 X-Ray·Logs 보관 비용이 자동으로 절감된다
B) X-Ray Service Map에서 에러 Trace를 선택하면 해당 Lambda/ECS의 CloudWatch Logs로 즉시 점프할 수 있다
C) Service Map의 트래픽 패턴을 분석해 X-Ray Sampling Rule의 Reservoir·Fixed Rate를 자동으로 최적화해준다
D) Synthetics Canary의 합성 트래픽 결과가 Service Map 노드에 자동 병합돼 외부 가용성까지 한 화면에 표시된다

**정답: B**
해설: ServiceLens의 핵심 가치는 "Correlated telemetry(상관 원격 측정)"다. 에러가 있는 Trace ID에서 "View logs"를 클릭하면 해당 Lambda 함수의 CloudWatch Logs에서 그 실행의 로그가 즉시 열린다. 수동으로 Log Group에서 request_id를 검색하는 과정을 건너뛰어 장애 분석 시간(MTTD)을 크게 줄인다.

---

**문제 10.** X-Ray 비용이 급증했다. 트래픽이 초당 2000 RPS인 API에서 현재 기본 샘플링(Reservoir=1, Fixed Rate=5%)을 사용 중이다. 비용을 줄이면서 에러 발생 시에는 반드시 추적하게 하려면?

A) X-Ray를 전 구간 비활성화하고, 에러는 CloudWatch Logs의 ERROR 로그로만 사후 분석한다
B) 기본 Sampling Rule의 Fixed Rate를 1%로 낮추고, 에러/Fault가 있는 요청은 별도 Rule(Priority 1, FixedRate 1.0)로 우선 처리
C) X-Ray 추적을 끄고 모든 요청 경로를 EMF 구조화 로그 + Logs Insights로 대체해 Trace 비용을 0으로 만든다
D) X-Ray 단가가 더 낮은 리전으로 워크로드를 이전해 동일 100% 샘플링을 유지하면서 청구액만 낮춘다

**정답: B**
해설: X-Ray Sampling Rule에서 에러/Fault 조건으로 요청을 필터링하면 정상 트래픽의 샘플링률은 줄이면서 에러는 100% 추적할 수 있다. Advanced Sampling Rule에서 `errorCode`, `faultCode` 조건을 추가하면 HTTP 5xx 응답에는 Fixed Rate 1.0을 적용할 수 있다. 정상 트래픽 1% + 에러 100%로 비용과 정밀도를 모두 확보하는 표준 패턴이다.

---

## Week 4 예고 — 로깅과 감사의 핵심: CloudTrail + Config

Week 4는 "누가 무엇을 했는가"와 "지금 상태가 규정을 준수하는가"를 추적하는 감사 도구 주간이다.

- Day 1: CloudTrail — Management Event와 Data Event의 차이, Organization Trail, 로그 무결성 검증
- Day 2: CloudTrail Lake — SQL 분석 데이터 레이크, Insights 이상 감지, EventBridge 실시간 대응
- Day 3: AWS Config — Rule 평가 트리거, Conformance Pack, Auto Remediation SSM 연동
- Day 4: Audit Manager, License Manager, Resource Explorer — 감사 보고서 자동화와 리소스 가시화
- Day 5: Week 4 복습 시나리오 10문제

CloudWatch가 "무슨 일이 일어나고 있나"를 보여줬다면, CloudTrail + Config는 "무슨 일이 있었고 누가 했으며 규정을 지키고 있나"를 추적한다. 두 영역 모두 SOA-C02에서 높은 출제 비중을 가진다.
