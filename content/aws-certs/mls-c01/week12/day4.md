# Day 4 - Synthesis: 4 Domains + End-to-End Scenarios

Final day: integrate all four domains through **real test scenarios** that blend them.

## Integration Map: Four Domains as One Pipeline

```
Domain 1: DATA           Domain 2: EDA           Domain 3: MODELING      Domain 4: OPS
─────────────────────────────────────────────────────────────────────────────────
Kinesis Streams   →   Clean nulls            Tabular + trees  →      Real-time endpoint
S3 lake           →   One-Hot encode        XGBoost + AMT            Auto-scale
Glue ETL          →   Correlation check     Bayesian tuning          Monitor drift
Athena SQL        →   Distribution plot     F1 (imbalance)           Canary deploy
                                            Residual plot             Model Registry
```

Each domain's output flows to next.

## Key Distinctions That Trip Tests

| Pair | When/Why | Example |
|------|------|------|
| Streams vs Firehose | Multi-consumer/replay vs managed-drop | Same IoT → Streams (many teams), then copy → Firehose (append log) |
| Glue vs EMR | Serverless vs cluster control | "Quick ETL" → Glue, "tune Spark" → EMR |
| XGBoost vs CNN | Tabular vs image | Fraud (Xgb) vs face verify (CNN) |
| Precision vs Recall | FP vs FN cost | Spam (precision), cancer (recall) |
| Real-time vs Serverless | Steady vs sparse | API (real-time), internal tool (serverless) |
| Canary vs Shadow | Risk vs zero-risk | "Production users" → canary, "lab test" → shadow |
| Model Monitor vs Debugger | Drift vs training | Post-deploy drift → Model Monitor, training issue → Debugger |

## Scenario Walkthrough: Fraud Detection

```text
1. DATA: Daily fraud reports → S3 (lake)
         Kinesis Streams: real-time fraud flags (multi-team)
         Glue ETL: daily clean → dedupe, impute

2. EDA:  Explore: 0.5% fraud (extreme imbalance)
         One-Hot encode merchant_id (high-cardinality)
         No scaling needed (XGBoost)

3. MODELING: XGBoost binary classification
             AMT Bayesian: optimize F1 (not accuracy!)
             Diagnosis: Train 85%, Val 78% (overfitting)
             → Add dropout, L1 regularization
             → Final: Train 80%, Val 79% (better)

4. OPS:   Real-time endpoint (user waits)
          Canary deploy: 5% → 25% → 100%
          Auto-alarm if recall drops below 70%
          Model Monitor: daily baseline refresh
          If drift detected → retrain pipeline
```

## Compressed Test Roadmap

**Question Type → Answer Strategy**

1. **"Which service?"** → Narrow by 3 axes (data type, scale, managed?)
2. **"Is this leakage?"** → Time? Feature generatable at predict time?
3. **"Fix overfitting?"** → Regularize, early-stop, more data, drop features
4. **"Which metric?"** → Imbalance/business cost → F1/Recall/Precision
5. **"Deploy safely?"** → Shadow (zero risk), Canary (gradual), Real-time (production)
6. **"Post-deploy fail?"** → Model Monitor (drift), Debugger (train anomaly)

## Summary

All four domains form one pipeline. Domain 1 moves data, Domain 2 preps it, Domain 3 builds models, Domain 4 ships them. Tests blend domains: pick Streams (domain 1) + F1 (domain 3) + canary (domain 4) based on scenario.

MLS-C01 is over. Weeks 1-4 (data, stats), 5-6 (alg select), 7-12 (modeling + ops).

## 📝 연습 문제

**문제 1.** 한 핀테크가 모바일 앱 클릭스트림을 밀리초 단위로 수집해, 사기 탐지 팀과 추천 팀이 같은 스트림을 각자 독립적으로 소비하고, 장애 시 과거 1일치를 재처리해야 한다. 가장 적합한 수집 서비스는?

A) Kinesis Data Firehose  
B) Amazon SQS FIFO  
C) AWS Glue 배치 잡  
D) Kinesis Data Streams  

**정답: D**  
해설: 다중 소비자가 독립적으로 읽고 보존기간 내 재처리가 필요하면 샤드·보존기간을 제어하는 Data Streams가 정답이다. Firehose(A)는 완전관리 적재 전용이고, SQS FIFO(B)는 소비 시 삭제되어 다중 독립 소비·재처리에 약하며, Glue(C)는 배치 ETL이다.

---

**문제 2.** 신용 승인 데이터는 부도(양성) 비율이 2%로 극단 불균형이다. 모델 후보들을 임계값과 무관하게 변별력으로 비교한 뒤, 운영 임계값은 FN/FP 비용에 맞춰 따로 정하려 한다. 가장 적절한 평가 접근은?

A) 임계값 0.5에서의 정확도로 모델을 비교한다  
B) RMSE로 모델을 비교한다  
C) PR 곡선의 AUC로 모델을 비교하고, 임계값은 비용 곡선상 최소 지점으로 사후 결정한다  
D) R²가 가장 높은 모델을 고른다  

**정답: C**  
해설: 극단 불균형에서는 PR-AUC가 정직한 변별력 지표이며, 운영 임계값은 비용 구조에 맞춰 사후 결정하는 2단계 분리가 정석이다. 정확도(A)는 불균형에서 과대평가되고, RMSE(B)·R²(D)는 회귀 지표라 분류에 부적합하다.

---

**문제 3.** 데이터 과학자가 S3 데이터 레이크의 로그를 클러스터 프로비저닝 없이 표준 SQL로 탐색하고, 그 결과를 대시보드로 시각화하려 한다. 가장 적합한 조합은?

A) EMR + Kibana  
B) Athena + QuickSight  
C) Redshift Spectrum + CloudWatch  
D) Glue 크롤러 + CloudTrail  

**정답: B**  
해설: Athena는 S3를 서버리스 SQL로 조회하고 QuickSight는 그 결과를 BI 대시보드로 시각화해 클러스터 없는 탐색·시각화에 최적이다. EMR(A)은 클러스터 운영이 필요하고, CloudWatch(C)·CloudTrail(D)은 모니터링·감사 도구로 분석 시각화 용도가 아니다.

---

**문제 4.** 정형 표 데이터(수치·범주 혼합, 일부 결측)로 이탈을 예측하는 모델을 적은 튜닝 예산으로 빠르게 최적화하려 한다. 알고리즘과 튜닝 전략의 조합으로 가장 적절한 것은?

A) XGBoost + 베이지안 최적화(AMT)  
B) CNN + Grid Search  
C) DeepAR + Random Search  
D) K-Means + 수동 튜닝  

**정답: A**  
해설: 정형 표 데이터에는 XGBoost가 강한 기본값이고, 적은 예산에서 효율적인 튜닝은 이전 시도를 활용하는 베이지안 최적화다. CNN(B)은 이미지용, DeepAR(C)은 시계열용, K-Means(D)는 비지도 군집으로 지도 분류 문제에 맞지 않는다.

---

**문제 5.** 이미지 1천만 장을 야간에 한 번에 분류해 결과를 S3에 저장하면 되고, 낮 동안 상시 엔드포인트는 필요 없다. 가장 비용 효율적인 추론 방식은?

A) Real-time Endpoint 상시 가동  
B) Serverless Inference  
C) Batch Transform  
D) Asynchronous Inference 상시 가동  

**정답: C**  
해설: 대량 데이터를 정해진 시점에 한 번에 처리하고 상시 엔드포인트가 불필요하면 Batch Transform이 가장 비용 효율적이다. 상시 Real-time(A)·상시 Async(D)는 불필요한 상시 비용이 들고, Serverless(B)는 건당 호출용으로 대량 일괄 처리에는 Batch가 우선이다.

---

**문제 6.** 프로덕션에 배포된 추천 모델의 클릭률이 배포 6주 후부터 점진적으로 하락했다. 입력 사용자 행동 분포가 학습 시점과 달라졌는지 자동으로 탐지하고 임계 초과 시 재학습을 트리거하려 한다. 가장 적합한 구성은?

A) CloudTrail로 API 호출을 추적한다  
B) Elastic Inference로 추론을 가속한다  
C) Multi-Model Endpoint로 모델을 추가한다  
D) Model Monitor로 드리프트를 감지하고 CloudWatch 알람으로 재학습 파이프라인을 트리거한다  

**정답: D**  
해설: Model Monitor는 베이스라인 대비 운영 입력의 드리프트를 감지하고, CloudWatch 알람으로 재학습 자동화를 트리거할 수 있다. CloudTrail(A)은 감사, Elastic Inference(B)는 추론 가속, Multi-Model(C)은 호스팅 효율로 드리프트 대응과 무관하다.

---

**문제 7.** 규제 산업의 대출 심사 모델에서 성별·인종 집단 간 예측 공정성을 정량 측정하고, 개별 거절 결정의 근거(어떤 피처가 얼마나 기여했는지)를 설명해야 한다. 가장 적합한 서비스는?

A) SageMaker Debugger  
B) SageMaker Clarify  
C) CloudWatch Logs Insights  
D) SageMaker Model Monitor 단독  

**정답: B**  
해설: 집단 간 편향(Disparate Impact 등) 측정과 SHAP 기반 개별 예측 설명은 모두 Clarify의 역할이다. Debugger(A)는 학습 과정의 텐서·기울기를 다루고, CloudWatch Logs(C)는 로그 분석, Model Monitor 단독(D)은 드리프트 감지로 공정성·설명 전용이 아니다.

---

**문제 8.** 한 팀이 데이터 처리 → 학습 → 평가 → 조건부 모델 등록까지를 코드로 표준화해, 매주 새 데이터로 자동 재학습하고 버전과 승인을 관리하려 한다. 가장 적합한 조합은?

A) SageMaker Pipelines로 DAG를 정의하고 Model Registry로 버전·승인 관리  
B) EC2에 cron 셸 스크립트로 단계를 순차 실행  
C) Lambda 하나로 전체 학습 잡을 직접 실행  
D) Glue 크롤러로 모델을 등록  

**정답: A**  
해설: SageMaker Pipelines는 ML 단계를 DAG로 정의해 재현·자동 재학습·CI/CD를 제공하고, Model Registry가 버전·승인을 관리한다. cron 스크립트(B)는 표준화·재현성이 약하고, Lambda 단독(C)은 장시간 학습에 부적합하며, Glue 크롤러(D)는 데이터 카탈로깅 용도다.

---
