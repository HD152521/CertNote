# Day 5 - Week 8 종합: 데이터 운영 및 지원 복습

이번 주는 파이프라인이 "구축"된 뒤 "운영"되는 단계, 즉 모니터링·품질·트러블슈팅·비용을 다뤘습니다. 오늘은 네 주제를 하나의 운영 시나리오로 엮어 복습합니다. DEA-C01 시험에서 운영/지원 영역은 비중이 큰 도메인입니다.

## 1. 파이프라인 모니터링 (Day 1)

- **관측성 3기둥**: 지표(CloudWatch Metrics) + 로그(CloudWatch Logs) + 추적(X-Ray).
- **Glue**: 연속 로깅 + `--enable-metrics`, 태스크 실패·셔플 지표 관찰.
- **EMR**: YARN 메모리·`ContainerPendingRatio`·`IsIdle`로 리소스·비용 판단, 로그는 S3 보관.
- **Kinesis 지연**: `IteratorAgeMilliseconds`가 핵심, 스로틀링은 `ProvisionedThroughputExceeded`.
- **커스텀 지표**: EMF로 로그+지표 동시 기록, 복합 알람으로 알람 폭주 억제.

> 💡 **관련 이론**: 증상(지연·실패율)에 알람을 걸고 단순 리소스 수치는 대시보드로 보는 "증상 기반 알람"이 알람 피로를 줄입니다.

## 2. 데이터 품질·검증 (Day 2)

- **6차원**: 완전성·정확성·일관성·유효성·고유성·적시성.
- **Glue Data Quality**: DQDL 규칙, 추천 기능, 정적 임계값 + 동적 이상 탐지.
- **검증 게이트**: Step Functions Choice로 미달 데이터 다운스트림 차단 → 격리(quarantine).
- **재처리**: 멱등성(업서트/결정적 덮어쓰기) + raw 원본 보존 + 파티션 단위 처리.
- **shift-left**: 검증을 앞단에 둬 오염 전파·재처리 비용 최소화.

## 3. 로깅·감사·트러블슈팅 (Day 3)

- **CloudTrail** = "누가 무슨 API를 호출했나"(감사) vs **CloudWatch Logs** = 애플리케이션 출력.
- **디버깅 순서**: 오케스트레이터 → 실패 태스크 로그 → 입력 데이터 → 권한 → CloudTrail.
- **재시도**: 일시적 오류에 지수 백오프+지터, 영구 실패는 캐치로 격리. 멱등 작업에서만 안전.
- **DLQ**: `maxReceiveCount` 초과 메시지 격리, 원인 수정 후 redrive로 재투입.

## 4. 비용·성능 운영 (Day 4)

- **가시화**: 비용 할당 태그(활성화 이후만 적용) + Cost Explorer + Budgets + Cost Anomaly Detection.
- **사이징**: Glue DPU/워커(작은 잡은 Python Shell), EMR 인스턴스, Lambda 메모리.
- **자동 스케일링**: Glue Auto Scaling, EMR Managed Scaling, Kinesis On-Demand, Redshift Concurrency Scaling. 베이스라인 사이징이 먼저.
- **구매 옵션**: 코어 노드 On-Demand/약정 + 태스크 노드 Spot. 스캔량 과금은 Parquet·파티션·워크그룹 한도로 절감.

> 💡 **관련 이론**: 자동 스케일링은 "변동"을 흡수할 뿐 "잘못된 베이스라인"을 고치지 못합니다. 사이징 → 스케일링 순서가 원칙입니다.

## 통합 시나리오: 야간 주문 ETL 운영

```text
00:00 EventBridge 스케줄 → Step Functions 파이프라인 시작
  1) Glue 수집 잡 (연속 로깅 + Auto Scaling + 메트릭 활성)
  2) Glue Data Quality 평가 (DQDL + 이상 탐지)
       └─ 점수 < 0.95 → 격리 버킷 + SNS + 파이프라인 중단
  3) EMR 변환 (코어 On-Demand, 태스크 Spot, Managed Scaling)
  4) curated 적재 + Athena 검증 쿼리

장애 시:
  - CloudWatch 알람(IteratorAge/실패율) → SNS → 온콜
  - Step Functions에서 실패 태스크 식별 → 로그 → 입력/권한 점검
  - 일시 오류는 Retry(지수 백오프), 영구 실패는 Catch → 격리
  - "설정이 바뀌었나?" → CloudTrail 추적

비용 운영:
  - 모든 리소스에 Project/Environment 태그
  - Budgets 80% 알림, Cost Anomaly Detection로 급증 감지
  - 월간 Cost Explorer 리뷰로 사이징 재조정
```

## 시험 포인트 정리

- "누가 했나/감사" → **CloudTrail**, "시스템이 어떻게 동작했나" → **CloudWatch Logs/Metrics**.
- 스트리밍 지연의 핵심 지표는 **IteratorAgeMilliseconds**.
- 데이터 품질 규칙 언어는 **DQDL**, 변동 데이터엔 **이상 탐지**.
- 재시도는 **멱등 작업**에서만 안전, 반복 실패는 **DLQ**.
- 비용 가시화는 **할당 태그**, 변동은 **자동 스케일링**, 베이스라인은 **사이징/약정**.

## 📝 연습 문제

**문제 1.** 다음 중 "어제 누가 prod Glue 테이블을 삭제했는지"와 "어젯밤 Kinesis 컨슈머가 얼마나 지연됐는지"를 각각 확인하기 위한 올바른 도구 조합은?

A) 둘 다 CloudWatch Logs  
B) 삭제는 CloudTrail, 지연은 CloudWatch IteratorAgeMilliseconds  
C) 삭제는 X-Ray, 지연은 CloudTrail  
D) 둘 다 Cost Explorer  

**정답: B**  
해설: API 호출 감사("누가 삭제")는 CloudTrail, 스트리밍 지연 측정은 CloudWatch의 IteratorAgeMilliseconds 지표입니다. CloudWatch Logs만으로는 감사가 부족하고, X-Ray는 추적, Cost Explorer는 비용 분석 도구입니다.

---

**문제 2.** 야간 ETL에서 Glue Data Quality 점수가 임계값 미만일 때 권장되는 파이프라인 동작은?

A) curated에 그대로 적재하고 나중에 정정  
B) 임계값을 자동으로 낮춰 통과시킴  
C) Step Functions Choice로 다운스트림을 막고 데이터를 격리 + 통보  
D) 잡을 즉시 삭제  

**정답: C**  
해설: 검증 게이트는 미달 데이터의 다운스트림 진행을 막고 격리 버킷으로 보낸 뒤 통보해 오염 전파를 차단합니다. 그대로 적재·임계값 하향은 품질 게이트를 무력화하고, 잡 삭제는 재처리 기회를 잃습니다.

---

**문제 3.** 비용을 절감하기 위해 EMR 태스크 노드를 Spot으로 전환할 때 함께 적용해야 하는 원칙으로 가장 적절한 것은?

A) HDFS 데이터를 보유하는 코어 노드는 안정적인 옵션으로 유지  
B) 코어 노드도 모두 Spot으로 전환  
C) 자동 스케일링을 비활성화  
D) 모든 데이터를 태스크 노드 로컬에 저장  

**정답: A**  
해설: 태스크 노드는 상태가 없어 Spot 회수에 견딜 수 있지만, HDFS 데이터를 보유한 코어 노드는 On-Demand/약정으로 유지해야 회수 시 데이터 손실을 막습니다. 코어 Spot 전환·로컬 저장은 데이터 손실 위험을 키웁니다.

---

**문제 4.** 일시적 오류가 잦은 외부 API 호출 태스크를 자동 재시도하도록 구성할 때, 안전성을 위해 반드시 전제되어야 하는 조건은?

A) 태스크가 비멱등이어야 한다  
B) 재시도 간격이 항상 0이어야 한다  
C) 로그를 비활성화해야 한다  
D) 태스크가 멱등(idempotent)이어야 한다  

**정답: D**  
해설: 재시도는 같은 작업이 여러 번 실행될 수 있으므로, 멱등 작업에서만 안전합니다. 비멱등 작업은 중복 적용으로 데이터가 오염되고, 재시도 간격 0은 폭주를 유발하며, 로그 비활성화는 디버깅을 어렵게 합니다.

---

**문제 5.** 자동 스케일링을 도입했는데도 평소 비용이 여전히 과도하다면 가장 먼저 점검해야 할 것은?

A) 더 많은 알람을 추가한다  
B) 모든 태그를 제거한다  
C) 베이스라인 리소스 사이징(워커/인스턴스/메모리)이 적정한지 점검한다  
D) 자동 스케일링 상한을 무한대로 올린다  

**정답: C**  
해설: 자동 스케일링은 변동을 흡수할 뿐 잘못된 베이스라인을 고치지 못하므로, 평상시 비용이 높으면 베이스라인 사이징을 먼저 재조정해야 합니다. 알람 추가·태그 제거·스케일링 상한 상향은 근본 원인인 과대 베이스라인을 해결하지 못합니다.

---
