# Day 4 - 비용·성능 운영: 모니터링, 사이징, 자동 스케일링

데이터 파이프라인은 잘 돌아가도 비용이 통제되지 않으면 지속 불가능합니다. 오늘은 비용을 가시화하고(할당 태그), 리소스를 적정 크기로 맞추고(사이징), 부하에 맞춰 자동 스케일링하며, 운영 중 최적화하는 방법을 다룹니다.

## 비용 가시화: 할당 태그와 Cost Explorer

비용을 줄이려면 먼저 "무엇이 얼마를 쓰는가"를 봐야 합니다.

- **Cost Allocation Tags(비용 할당 태그)**: 리소스에 `Project`, `Environment`, `Team`, `Pipeline` 같은 태그를 달고 청구서 콘솔에서 활성화하면, 태그별로 비용을 분해할 수 있습니다.
- **Cost Explorer**: 서비스·태그·기간별 비용 추세를 시각화하고 예측.
- **AWS Budgets**: 예산 임계값(예: 월 $5,000의 80%)에 도달하면 알림하거나 액션 실행.
- **Cost Anomaly Detection**: ML로 비정상 비용 급증을 자동 탐지·통보.

```text
태그 전략 예:
  Project=orders-pipeline
  Environment=prod
  CostCenter=data-eng
→ Cost Explorer에서 "data-eng가 prod에서 orders-pipeline에 쓴 비용" 분해
```

> 💡 **관련 이론**: 사용자 정의 태그는 활성화한 시점 **이후**의 비용에만 적용되며 소급되지 않습니다. 태그 정책을 초기에 정해 일관되게 다는 것이 중요합니다.

## 리소스 사이징

서비스마다 비용을 좌우하는 핵심 노브가 다릅니다.

- **Glue**: DPU(Data Processing Unit) 수와 워커 타입(Standard / G.1X / G.2X). 데이터가 작으면 워커를 줄이고, Spark가 필요 없는 작은 잡은 **Python Shell(0.0625 DPU)** 이 훨씬 저렴.
- **EMR**: 인스턴스 타입·수. 코어/태스크 노드 분리, 워크로드 특성(메모리 vs CPU)에 맞는 패밀리 선택.
- **Lambda**: 메모리 설정이 CPU도 함께 결정. 메모리를 늘려 실행 시간을 줄이면 오히려 총비용이 낮아지는 구간이 있음(Power Tuning).
- **Redshift**: 노드 타입·수 또는 Serverless RPU.

```text
과소 프로비저닝: OOM·스로틀·지연 → SLA 위반
과대 프로비저닝: 유휴 리소스 → 낭비
목표: 워크로드 프로파일에 맞춰 "딱 맞게" + 자동 스케일링으로 변동 흡수
```

## 자동 스케일링

고정 용량은 피크에 맞추면 평소 낭비, 평소에 맞추면 피크에 장애입니다. 자동 스케일링으로 부하를 따라갑니다.

- **Glue Auto Scaling**: 잡 실행 중 스테이지별 필요량에 따라 워커를 동적으로 늘리고 줄임(`--enable-auto-scaling`). 최대 워커 수만 상한으로 지정.
- **EMR Managed Scaling**: 클러스터가 YARN 대기량·메모리를 보고 코어/태스크 노드를 자동 조절. 최소·최대 단위만 설정.
- **Kinesis On-Demand**: 샤드를 수동 관리하지 않고 처리량에 따라 자동 확장(샤드 사이징 고민 제거).
- **Redshift Concurrency Scaling**: 동시 쿼리 폭증 시 임시 클러스터를 붙여 대기열을 흡수.

> 💡 **관련 이론**: 자동 스케일링은 "변동"을 흡수하는 것이지 "잘못된 베이스라인"을 고치지 못합니다. 베이스라인 사이징을 먼저 맞춘 뒤 변동분을 스케일링으로 처리하세요.

## 구매 옵션으로 비용 절감

- **Spot 인스턴스**: EMR 태스크 노드처럼 중단에 견디는 워크로드에 적합. 최대 ~90% 절감하지만 회수(reclaim) 가능 → 중요 데이터는 코어 노드에 두지 않음.
- **Savings Plans / Reserved**: 예측 가능한 베이스라인 사용량에 약정으로 할인.
- **On-Demand**: 예측 불가·단기 워크로드.

전형적 패턴: EMR 코어 노드는 On-Demand/약정으로 안정성 확보, 태스크 노드는 Spot으로 비용 절감.

## 스토리지·쿼리 운영 최적화

- **S3 라이프사이클**: 오래된 raw 데이터를 Standard-IA → Glacier로 전환, 미완료 멀티파트 업로드 정리.
- **컬럼 포맷·압축·파티셔닝**: Athena/Spectrum은 스캔한 바이트로 과금되므로 Parquet+압축+파티션 프루닝이 곧 비용 절감.
- **작은 파일 compaction**: 파일 폭증으로 인한 요청 비용·메타데이터 오버헤드 제거.
- **Athena 워크그룹**: 쿼리당 스캔량 상한(per-query data limit)으로 폭주 비용 방지, 워크그룹별 비용 추적.

## 핵심 정리

- 비용 가시화: 할당 태그(활성화 이후만 적용) + Cost Explorer + Budgets + Cost Anomaly Detection.
- 사이징은 서비스별 노브(Glue DPU/워커, EMR 인스턴스, Lambda 메모리)를 워크로드에 맞춤.
- 자동 스케일링(Glue Auto Scaling, EMR Managed Scaling, Kinesis On-Demand)으로 변동 흡수, 베이스라인은 먼저 사이징.
- Spot(태스크 노드)·약정(베이스라인) 혼합, 스캔량 과금 서비스는 Parquet·파티션·워크그룹 한도로 절감.

## 📝 연습 문제

**문제 1.** 데이터 팀이 프로젝트별·환경별 AWS 비용을 분해해서 보고 싶을 때 가장 먼저 해야 할 일은?

A) 모든 리소스를 한 계정으로 통합  
B) 모든 인스턴스를 Spot으로 전환  
C) Cost Allocation Tags를 일관되게 달고 청구 콘솔에서 활성화  
D) CloudTrail 데이터 이벤트 활성화  

**정답: C**  
해설: 비용 할당 태그(Project, Environment 등)를 일관되게 달고 활성화하면 Cost Explorer에서 태그별로 비용을 분해할 수 있습니다. 계정 통합·Spot 전환은 분해 가시화와 무관하고, CloudTrail 데이터 이벤트는 비용 분석이 아니라 API 감사 용도입니다.

---

**문제 2.** Glue 잡 실행 중 스테이지별 필요량에 따라 워커 수를 동적으로 늘리고 줄여 비용과 성능을 모두 잡는 기능은?

A) Glue Auto Scaling  
B) Job Bookmark  
C) Partition Projection  
D) DynamicFrame  

**정답: A**  
해설: Glue Auto Scaling(`--enable-auto-scaling`)은 잡 실행 중 워크로드에 맞춰 워커를 동적으로 조절하고 최대 워커 수만 상한으로 지정합니다. Job Bookmark는 증분 처리 상태, Partition Projection은 Athena 파티션 계산, DynamicFrame은 데이터 추상화입니다.

---

**문제 3.** EMR 클러스터에서 비용을 크게 절감하면서도 중단 가능성에 견디도록 구성하는 전형적 패턴은?

A) 모든 노드를 Spot으로 구성  
B) 모든 노드를 On-Demand로 구성  
C) 코어 노드를 Spot, 태스크 노드를 On-Demand  
D) 코어 노드는 On-Demand/약정, 태스크 노드는 Spot  

**정답: D**  
해설: HDFS 데이터를 보유하는 코어 노드는 안정적인 On-Demand/약정으로 두고, 상태가 없는 태스크 노드를 Spot으로 구성하면 회수되어도 데이터 손실 없이 비용을 절감합니다. 코어를 Spot으로 두면 회수 시 데이터 손실 위험이 큽니다.

---

**문제 4.** Athena와 Redshift Spectrum의 쿼리 비용을 직접적으로 줄이는 가장 효과적인 방법은?

A) 모든 데이터를 CSV로 저장  
B) Parquet 컬럼 포맷 + 압축 + 파티션 프루닝으로 스캔 바이트 감소  
C) 쿼리를 더 자주 실행  
D) 결과를 항상 JSON으로 출력  

**정답: B**  
해설: Athena/Spectrum은 스캔한 바이트로 과금되므로, 컬럼 포맷(Parquet)·압축·파티션 프루닝으로 읽는 데이터양을 줄이면 비용이 직접 감소합니다. CSV/JSON은 스캔량을 늘리고, 쿼리를 자주 실행하면 비용이 증가합니다.

---

**문제 5.** AWS 비용에서 평소와 다른 비정상적인 급증을 머신러닝으로 자동 탐지하고 통보하는 서비스는?

A) AWS Budgets  
B) Trusted Advisor  
C) Compute Optimizer  
D) Cost Anomaly Detection  

**정답: D**  
해설: Cost Anomaly Detection은 ML로 비용 패턴을 학습해 비정상적 급증을 자동 탐지·통보합니다. Budgets는 사전 설정한 임계값 기반 알림, Trusted Advisor는 모범사례 점검, Compute Optimizer는 리소스 사이징 권고로 동적 이상 탐지와는 다릅니다.

---
