# Day 3 - 도메인 4 + 전체 종합: ML 구현·운영 복습 + 4도메인 교차

## 📌 핵심 정리

- **도메인 4(ML 구현·운영)는 비중 20%**. 학습된 모델을 배포·감시·최적화하는 마지막 단계다.
- 배포 형태는 **지연 × 트래픽 패턴 × 페이로드 크기**의 3차원으로 고른다. 실시간 / 서버리스 / 비동기 / 배치.
- 안전한 출시는 **Canary(점진 전환, 사용자 영향 있음)**와 **Shadow(복제 검증, 사용자 영향 없음)**의 구분이 핵심이다.
- 운영 감시는 **Model Monitor(드리프트) / CloudWatch(인프라 지표) / CloudTrail(API 감사)**로 역할이 갈린다.
- 시험 후반 시나리오는 **4도메인이 한 지문에 섞여** 나온다. "지금 묻는 단계가 어디인가"부터 짚어라.

## 한 장 요약: 학습된 모델에서 운영까지

도메인 4는 학습이 끝난 모델을 실제로 배포하고, 안전하게 운영하고, 모니터링하며, 비용·성능을 최적화하는 단계다.

```text
[학습된 모델 아티팩트 (S3)]
   │
   ├─ 1) 배포 형태 선택
   │     실시간 낮은 지연  → Real-time Endpoint
   │     간헐적/콜드 OK    → Serverless Inference
   │     대용량 오프라인   → Batch Transform
   │     초대형/긴 처리    → Asynchronous Inference
   │
   ├─ 2) 안전한 출시
   │     Blue/Green, Canary, Shadow 트래픽 전환
   │
   ├─ 3) 모니터링
   │     데이터/모델 드리프트 → Model Monitor
   │     편향·설명 지속 감시   → Clarify
   │     인프라 지표·로그      → CloudWatch
   │
   ├─ 4) 비용·성능 최적화
   │     오토스케일링, Multi-Model Endpoint, Spot 학습
   │
   └─ 5) 자동화/거버넌스
         Pipelines(MLOps), Model Registry, IAM/KMS
```

## 도메인 4: 추론(배포) 형태 4종

| 형태 | 지연 | 트래픽 패턴 | 페이로드 | 유휴 비용 | 엔드포인트 | 대표 단서 |
|---|---|---|---|---|---|---|
| **Real-time Endpoint** | 밀리초 | 꾸준·상시 | 수 MB 수준(6 MB) | 상시 발생 | 필요(상시) | "낮은 지연", "초당 요청", "온라인 서비스" |
| **Serverless Inference** | 콜드스타트 있음 | 간헐·예측 불가 | 작음 | 없음(0으로 축소) | 필요(관리형) | "가끔 호출", "운영 부담 최소", "유휴 비용 없이" |
| **Asynchronous Inference** | 초~분 | 산발·버스트 | 매우 큼(최대 1 GB) | 0까지 축소 가능 | 필요 | "큰 페이로드", "긴 처리 시간", "큐에 넣고 나중에" |
| **Batch Transform** | 잡 단위 | 정해진 일괄 처리 | 데이터셋 전체 | 없음(잡 종료 시) | **불필요** | "매일 밤", "S3에 저장하면 됨", "실시간 불필요" |

```text
추론을 어떻게 배포할까?
│
├─ 요청이 오면 즉시 응답해야 하나?
│   ├─ 아니오 → 정해진 데이터셋을 한 번에 처리?
│   │            ├─ 예 → Batch Transform (엔드포인트 불필요)
│   │            └─ 아니오(요청 단위지만 오래 걸림)
│   │                  └─ 페이로드 크거나 처리 김 → Asynchronous Inference
│   └─ 예 ↓
├─ 트래픽이 꾸준한가?
│   ├─ 아니오(띄엄띄엄) + 콜드스타트 허용 → Serverless Inference
│   └─ 예 ↓
└─ Real-time Endpoint (+ 오토스케일링)
     └─ 모델이 수십~수백 개이고 각각 트래픽이 적다 → Multi-Model Endpoint
```

> 💡 **관련 이론**: 배포 형태 선택은 "지연 요구 × 트래픽 패턴 × 페이로드 크기"의 3차원 판단이다. 실시간 낮은 지연이면 Real-time, 트래픽이 띄엄띄엄하고 콜드스타트를 견디면 Serverless(비용 절감), 정해진 데이터셋을 한 번에 처리하면 엔드포인트가 필요 없는 Batch Transform, 페이로드가 크고(GB) 처리가 길면 Async가 정답이다. "엔드포인트를 상시 켤 필요 없다"가 보이면 Real-time은 오답으로 기운다.

## 도메인 4: 안전한 배포 전략

| 전략 | 트래픽 처리 | 사용자 영향 | 롤백 속도 | 검증 목적 |
|---|---|---|---|---|
| **Blue/Green** | 신·구 환경 병행 후 한 번에 전환 | 전환 시점부터 100% | 매우 빠름(구 환경 유지) | 전환 자체의 안전성 |
| **Canary** | 소수 비율부터 점진 전환 | 소수 사용자부터 노출 | 빠름(비율 되돌림) | 실사용 지표로 조기 이상 감지 |
| **Linear** | 일정 비율씩 단계적 증가 | 단계마다 비율만큼 | 빠름 | 부하·지연의 점진 검증 |
| **Shadow** | 트래픽 복제, 응답은 버림 | **없음** | 불필요(전환 아님) | 무위험 성능·안정성 비교 |
| **A/B Testing** | 트래픽을 변형별로 분기 | 그룹별로 다른 응답 | 빠름 | 비즈니스 지표 통계 비교 |

- SageMaker 배포 가드레일은 Blue/Green 위에서 all-at-once·canary·linear 트래픽 전환을 지원하고, CloudWatch 알람으로 **자동 롤백**을 건다
- Production Variant의 가중치를 조정하면 한 엔드포인트 안에서 A/B 트래픽 분배가 가능하다

> 💡 **관련 이론**: Canary와 Shadow는 자주 혼동된다. Canary는 실제 트래픽의 일부를 신모델로 보내 사용자가 새 결과를 받는다(점진 전환). Shadow는 트래픽을 복제해 신모델에도 흘리지만 그 응답은 사용자에게 반환하지 않고 비교·검증에만 쓴다(무위험 평가). "사용자 영향 없이 프로덕션 트래픽으로 신모델을 검증"이면 Shadow다.

## 도메인 4: 모니터링과 거버넌스

| 요구사항 | 서비스·기능 |
|------|------|
| 입력 데이터 분포·스키마 이상(데이터 드리프트) | Model Monitor — **Data Quality** |
| 실제 정답 대비 정확도·F1 하락 감시 | Model Monitor — **Model Quality**(정답 라벨 필요) |
| 집단 간 예측 편향이 시간에 따라 커지는지 | Model Monitor — **Bias Drift**(+ Clarify) |
| 어떤 특성이 예측을 끌고 가는지가 변했는지 | Model Monitor — **Feature Attribution Drift**(SHAP) |
| 학습 시점의 편향·설명 가능성 분석 | SageMaker Clarify |
| 학습 과정의 텐서·기울기·수렴 이상 | SageMaker Debugger |
| 엔드포인트 지연·호출수·에러율, 로그 | CloudWatch (+ Logs) |
| 누가 언제 어떤 API를 호출했는지 감사 | CloudTrail |
| 종단간 ML 워크플로 자동화(CI/CD) | SageMaker Pipelines |
| 모델 버전 관리·승인 게이트 | Model Registry |
| 데이터·모델 계보(어떤 데이터로 학습했나) | SageMaker Lineage / Experiments |

> 💡 **관련 이론**: 드리프트는 두 종류다. 데이터 드리프트(입력 분포가 변함)와 컨셉 드리프트(입력-출력 관계가 변함)다. Model Monitor는 베이스라인(학습 시 분포)과 운영 데이터를 비교해 드리프트를 탐지하고, 임계 초과 시 CloudWatch 알람으로 재학습 트리거를 건다. "모델이 배포 후 점점 나빠진다"는 시나리오의 정답은 거의 항상 Model Monitor(+ 재학습 자동화)다.

## 도메인 4: 비용·성능·보안 최적화

| 목표 | 기법 |
|------|------|
| 트래픽 변동 대응 | 엔드포인트 오토스케일링 |
| 여러 모델을 적은 비용으로 호스팅 | Multi-Model Endpoint |
| 학습 비용 절감 | Managed Spot Training (최대 90%↓) |
| 추론 가속·저비용 | Inferentia/Elastic Inference, 모델 컴파일(Neo) |
| 저장·전송 데이터 보호 | KMS 암호화, S3 SSE, VPC 엔드포인트 |
| 최소 권한 접근 | IAM 역할, 리소스 정책 |

> 💡 **관련 이론**: Managed Spot Training은 중단 가능한 스팟 인스턴스를 써서 학습 비용을 크게 줄이되, 체크포인팅으로 중단 시 이어서 재개한다. 학습은 재시도가 가능하므로 스팟에 적합하지만, 낮은 지연이 필요한 실시간 추론은 스팟에 부적합하다. "비용 절감 + 학습 + 중단 허용"이면 Spot, "실시간 추론 비용 절감"이면 Serverless/오토스케일링/Inferentia로 분기한다.

## 시험 단서 키워드 → 정답 서비스 번역표

| 지문 단서 | 고를 답 |
|---|---|
| "매일 밤 한 번에 채점해 S3에 저장" | Batch Transform |
| "엔드포인트를 상시 켤 필요가 없다" | Batch Transform 또는 Serverless |
| "트래픽이 하루 몇 번뿐, 운영 부담 최소" | Serverless Inference |
| "1 GB 동영상, 처리에 수 분" | Asynchronous Inference |
| "밀리초 단위 응답, 상시 온라인" | Real-time Endpoint |
| "고객사마다 모델이 있고 각각 호출이 드물다" | Multi-Model Endpoint |
| "사용자 영향 없이 신모델 검증" | Shadow 테스트 |
| "일부 사용자에게만 먼저 노출" | Canary 배포 |
| "지표 악화 시 자동으로 되돌린다" | 배포 가드레일 + CloudWatch 알람 자동 롤백 |
| "배포 후 입력 분포가 달라졌는지" | Model Monitor(Data Quality) |
| "실제 정답과 비교해 정확도 하락 감시" | Model Monitor(Model Quality) |
| "지연·에러율 그래프와 알람" | CloudWatch |
| "누가 엔드포인트를 삭제했는지" | CloudTrail |
| "학습 손실이 발산하는지 자동 탐지" | SageMaker Debugger |
| "예측 근거를 특성별로 설명" | SageMaker Clarify(SHAP) |
| "단계를 DAG로 정의해 재현·자동화" | SageMaker Pipelines |
| "모델 승인 후에만 배포" | Model Registry(승인 상태) |
| "학습 비용 절감, 중단 허용" | Managed Spot Training |
| "엣지·특정 하드웨어에 맞게 최적화" | SageMaker Neo |
| "데이터를 인터넷 경유 없이 전송" | VPC 엔드포인트(PrivateLink) |
| "저장·전송 데이터 암호화" | KMS + S3 SSE + TLS |

## 헷갈리는 짝 대조표

| 비교 | 핵심 차이 |
|------|------|
| **Real-time vs Serverless** | 상시 켜짐·밀리초 지연 vs 0까지 축소·콜드스타트 감수 |
| **Real-time vs Async** | 즉시 응답 vs 큐잉 후 결과 통지, 큰 페이로드·긴 처리 |
| **Async vs Batch Transform** | 요청 단위 비동기(엔드포인트 필요) vs 데이터셋 일괄(엔드포인트 불필요) |
| **Real-time vs Batch Transform** | 상시 온라인 저지연 vs 오프라인 대량, 상시 비용 없음 |
| **Canary vs Linear** | 소수 → 확대(조기 이상 감지) vs 일정 비율씩 균등 증가 |
| **Canary vs Shadow** | 점진 전환(사용자 영향 있음) vs 복제 검증(사용자 영향 없음) |
| **Shadow vs A/B** | 응답 버리고 성능만 비교 vs 그룹별 응답 제공해 비즈니스 지표 비교 |
| **Model Monitor vs CloudWatch vs CloudTrail** | 데이터·모델 드리프트 vs 인프라 지표·로그 vs API 호출 감사 |
| **Debugger vs Clarify** | 학습 **과정**(텐서·기울기·수렴) vs 데이터·예측의 **편향과 설명** |
| **Model Monitor Data vs Model Quality** | 입력 분포만 비교(라벨 불필요) vs 실제 정답 대비 성능(라벨 필요) |
| **MME vs 다중 엔드포인트** | 한 엔드포인트에 다수 모델(비용↓, 콜드로드 있음) vs 모델당 전용 엔드포인트(격리·성능 보장) |
| **Spot vs On-Demand** | 최대 90% 저렴·중단 가능(체크포인트 필수) vs 안정, 중단 없음 |
| **Neo vs Inferentia vs Elastic Inference** | 대상 하드웨어용 모델 컴파일 vs 추론 전용 칩 인스턴스 vs CPU 인스턴스에 가속 자원 부착 |
| **Pipelines vs Model Registry** | 단계를 DAG로 실행·자동화 vs 모델 버전·승인 상태 관리 |

## 4도메인 교차: 엔드투엔드 시나리오 매핑

| 단계 | 도메인 | 대표 선택 |
|------|------|------|
| 스트리밍 수집 | 1 | Kinesis Streams/Firehose |
| 레이크 저장·ETL | 1 | S3 + Glue, Athena |
| 정제·인코딩·EDA | 2 | 결측 처리, One-Hot, 표준화, QuickSight |
| 알고리즘·튜닝·평가 | 3 | XGBoost/CNN/DeepAR, AMT, F1/AUC/RMSE |
| 배포·모니터링·최적화 | 4 | Endpoint/Batch, Model Monitor, Spot |

### 사례 A — 실시간 사기 탐지

| 요구사항 문장 | 도메인 | 선택 |
|---|---|---|
| "결제 이벤트가 초당 수천 건 들어온다" | 1 | Kinesis Data Streams → Firehose로 S3 적재 |
| "원장 테이블과 조인해 특성을 만든다" | 1 | Glue ETL + Athena 검증 |
| "사기 라벨이 0.2%뿐이다" | 2 | 클래스 불균형 처리, 층화 분할 |
| "표 형태 특성으로 사기 여부 예측" | 3 | XGBoost(`scale_pos_weight` 등으로 불균형 보정) |
| "놓친 사기 비용이 크다" | 3 | Recall·PR-AUC 중심 평가, 임계값 조정 |
| "결제 중 100 ms 안에 판정" | 4 | Real-time Endpoint + 오토스케일링 |
| "사기 수법이 바뀌면 성능이 떨어진다" | 4 | Model Monitor → CloudWatch 알람 → 재학습 |

### 사례 B — 야간 배치 수요 예측

| 요구사항 문장 | 도메인 | 선택 |
|---|---|---|
| "POS 판매 이력이 매일 S3로 적재된다" | 1 | S3 + Glue 카탈로그 |
| "결측 주간과 이상치가 섞여 있다" | 2 | 결측 대치, 이상치 처리, 시계열 시각화 |
| "수백 개 매장의 4주 수요를 예측" | 3 | DeepAR(다수 시계열 동시 학습) |
| "오차가 큰 날의 벌점을 크게" | 3 | RMSE를 목적 지표로 Minimize 튜닝 |
| "새벽에 한 번에 예측하면 된다" | 4 | Batch Transform(엔드포인트 불필요) |
| "학습 비용을 줄이고 싶다" | 4 | Managed Spot Training + 체크포인트 |
| "전 과정을 매주 자동 실행" | 4 | SageMaker Pipelines + Model Registry |

> 💡 **관련 이론**: SageMaker Pipelines는 이 다섯 단계를 하나의 DAG로 엮어 자동화하는 MLOps 핵심이다. 데이터 처리(Processing) → 학습(Training) → 평가(Evaluation) → 조건부 등록(RegisterModel) → 배포까지를 코드로 정의해 재현 가능·버전 관리·자동 재학습이 가능해진다. "수동 단계를 자동화/표준화/CI-CD"라는 단서가 보이면 Pipelines + Model Registry 조합이 정답으로 향한다.

## 도메인별 출제 비중과 대표 문항 형태

| 도메인 | 비중 | 대표 문항 형태 |
|---|---|---|
| **1. 데이터 엔지니어링** | 20% | 수집·저장·변환 서비스 선택(Kinesis 4종, S3/Glue/Athena, EMR) |
| **2. 탐색적 데이터 분석** | 24% | 결측·이상치·인코딩·스케일링·불균형 처리, 시각화 선택 |
| **3. 모델링** | 36% | 알고리즘 선택, 활성화·손실 매칭, 과적합 진단, 지표·튜닝 |
| **4. ML 구현 및 운영** | 20% | 배포 형태, 안전 출시, 모니터링, 비용·보안 최적화 |

- 시험 후반 시나리오 문항은 도메인 경계를 넘나든다. **지문에서 "지금 묻는 단계"를 먼저 표시**하고 그 단계의 선택지만 비교하라
- 보기 4개 중 2개는 대개 "다른 단계의 정답"이다. 단계가 다르면 내용이 맞아도 오답이다

## 자가 점검 질문

1. 큰 데이터셋을 한 번에 오프라인 채점, 엔드포인트 불필요면? → **Batch Transform**
2. 트래픽이 띄엄띄엄하고 콜드스타트를 견디면? → **Serverless Inference**
3. 사용자에게 영향 없이 프로덕션 트래픽으로 신모델 검증은? → **Shadow 테스트**
4. 배포 후 입력 분포가 학습 때와 달라지는지 감지는? → **Model Monitor**
5. 엔드포인트 지연·에러율·호출수 지표는 어디서? → **CloudWatch**
6. 학습 비용을 최대 90% 줄이되 중단을 견디는 방법은? → **Managed Spot Training**
7. 한 엔드포인트에 수백 개 모델을 저비용 호스팅은? → **Multi-Model Endpoint**
8. ML 워크플로를 DAG로 자동화·재현하는 서비스는? → **SageMaker Pipelines**
9. 1 GB 페이로드에 처리 시간이 긴 추론은? → **Asynchronous Inference**
10. 정확도 하락을 실제 정답과 비교해 감시하려면? → **Model Monitor의 Model Quality(라벨 필요)**
11. 누가 엔드포인트를 지웠는지 확인하려면? → **CloudTrail**
12. 승인된 모델만 배포되게 하려면? → **Model Registry 승인 상태 + Pipelines 조건 단계**
13. 엣지 디바이스용으로 모델을 최적화하려면? → **SageMaker Neo**
14. 시험 비중이 가장 큰 도메인은? → **도메인 3 모델링(36%)**

## 📖 용어

- **추론 엔드포인트(inference endpoint)** : 학습된 모델을 HTTPS로 호출할 수 있게 띄워 둔 서버. 켜져 있는 동안 비용이 든다.
- **콜드스타트(cold start)** : 유휴 상태에서 첫 요청이 올 때 자원을 새로 띄우느라 응답이 늦어지는 현상. 서버리스의 대가다.
- **데이터 드리프트 / 컨셉 드리프트** : 입력 분포가 변하는 것 / 입력과 정답의 관계 자체가 변하는 것. 둘 다 성능을 갉아먹는다.
- **베이스라인(baseline)** : Model Monitor가 "정상"으로 삼는 학습 시점의 통계·스키마. 운영 데이터를 이것과 비교한다.
- **Shadow 테스트** : 실제 트래픽을 복제해 신모델에도 흘리되 응답은 버리는 검증 방식. 사용자에게는 아무 영향이 없다.
- **배포 가드레일(deployment guardrail)** : 트래픽을 단계적으로 옮기며 지표를 보고, 나빠지면 자동으로 되돌리는 안전장치.
- **Multi-Model Endpoint** : 한 엔드포인트 뒤에 여러 모델을 두고 호출 시점에 필요한 모델을 올려 쓰는 방식. 모델 수가 많고 각각 트래픽이 적을 때 유리하다.
- **Managed Spot Training** : 남는 여유 용량(스팟)으로 학습해 비용을 크게 줄이는 옵션. 중단될 수 있으므로 체크포인트가 필수다.
- **SageMaker Neo** : 모델을 배포 대상 하드웨어에 맞게 컴파일해 추론 속도·크기를 최적화하는 기능.
- **Model Registry** : 모델 버전을 등록하고 "승인/거부" 상태를 붙여 관리하는 저장소. 승인된 버전만 배포하도록 게이트를 건다.

---

## 📝 연습 문제

**문제 1.** 매일 밤 수백만 건의 거래 기록을 한 번에 점수화해 S3에 저장하면 되고, 실시간 응답은 필요 없다. 가장 비용 효율적인 추론 방식은?

A) Real-time Endpoint를 24시간 가동  
B) Asynchronous Inference 엔드포인트 상시 가동  
C) Batch Transform  
D) Multi-Model Endpoint  

**정답: C**  
해설: 정해진 대량 데이터를 오프라인으로 한 번에 처리하고 상시 엔드포인트가 필요 없으면 Batch Transform이 가장 비용 효율적이다. 상시 Real-time(A)·상시 Async(B)는 불필요한 상시 비용이 들고, Multi-Model(D)은 여러 모델 호스팅용이다.

---

**문제 2.** 새 모델을 프로덕션에 올리기 전, 실제 트래픽으로 성능을 검증하되 사용자에게는 기존 모델 응답만 반환하고 싶다. 가장 적합한 전략은?

A) Canary 배포  
B) 즉시 전체 전환  
C) Blue/Green 후 즉시 100% 전환  
D) Shadow(섀도) 테스트  

**정답: D**  
해설: Shadow 테스트는 프로덕션 트래픽을 신모델에 복제해 흘리되 응답은 사용자에게 반환하지 않아 무위험으로 검증한다. Canary(A)는 실제 사용자에게 일부 신모델 응답이 가고, 즉시 전환(B)·즉시 100%(C)는 검증 없이 위험을 키운다.

---

**문제 3.** 배포된 모델의 예측 품질이 몇 주에 걸쳐 서서히 저하되고 있다. 입력 데이터 분포가 학습 시점과 달라졌는지 자동으로 감지하려면 무엇을 사용해야 하는가?

A) CloudTrail  
B) SageMaker Model Monitor  
C) AWS Config  
D) Elastic Inference  

**정답: B**  
해설: Model Monitor는 학습 시 베이스라인과 운영 입력을 비교해 데이터/모델 드리프트를 감지하고 임계 초과 시 알람을 보낸다. CloudTrail(A)은 API 감사, Config(C)는 리소스 구성 추적, Elastic Inference(D)는 추론 가속으로 드리프트 감지와 무관하다.

---

**문제 4.** 학습 잡의 비용을 크게 줄이고 싶고, 잡이 중간에 중단되어도 체크포인트에서 재개할 수 있도록 설계했다. 가장 적합한 옵션은?

A) Managed Spot Training  
B) On-Demand 인스턴스만 사용  
C) Serverless Inference  
D) Multi-Model Endpoint  

**정답: A**  
해설: Managed Spot Training은 중단 가능한 스팟 인스턴스로 학습 비용을 최대 90%까지 줄이며 체크포인팅으로 중단 시 재개한다. On-Demand(B)는 비용 절감이 없고, Serverless Inference(C)·Multi-Model(D)은 추론 측 기능이라 학습 비용과 무관하다.

---

**문제 5.** 데이터 처리 → 학습 → 평가 → 조건부 모델 등록 → 배포로 이어지는 ML 워크플로를 코드로 정의해 재현 가능하게 자동화하려 한다. 핵심 서비스 조합으로 가장 적절한 것은?

A) Lambda 단독으로 모든 단계 호출  
B) EC2 인스턴스에 cron 스크립트  
C) SageMaker Pipelines + Model Registry  
D) Glue 크롤러만 사용  

**정답: C**  
해설: SageMaker Pipelines는 ML 단계를 DAG로 정의해 재현·버전 관리·CI/CD를 제공하고, Model Registry로 모델 버전·승인을 관리한다. Lambda 단독(A)·cron 스크립트(B)는 표준화·재현성이 약하고, Glue 크롤러(D)는 메타데이터 카탈로깅 용도다.

---
