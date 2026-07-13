# Day 2 - Startup Serverless-First Architecture — Cost-Zero Scaling, No Ops Overhead, Function Composition Limits

[WEEK 15 DAY 2 COMPREHENSIVE SCENARIO: SERVERLESS STARTUP FROM $0 TO 100X]

Extreme opposite of Day 1 enterprise: 3-person startup, $0 cloud budget, viral growth risk, zero ops team. Pro design here means **pure serverless-first**—Lambda, DynamoDB, API Gateway, S3—every choice optimized to avoid provisioning.

Core principles:
- **Consumption model**: Pay only for invocations/GB-months, autoscale to infinity
- **No cold start killers**: Provisioned concurrency, reserved capacity where needed
- **Function composition**: Lambda→SQS→Lambda pipelines, not monoliths
- **DynamoDB on-demand**: Autoscale throughput, pay-per-request

Example architecture: HTTP request → API Gateway → Lambda → DynamoDB on-demand → S3 → SNS → Lambda async processor. Every component scales from 0 to millions without operator touch.

Gotchas:
- Lambda timeout 15 min—can't run long batch
- DynamoDB on-demand costlier at scale than provisioned
- Cold starts matter under 50ms SLA (need provisioned concurrency)
- Cross-AZ DynamoDB consistency window ~1ms (eventual, not strong)

Scenarios: "SaaS landing page with no ops", "user uploads trigger batch resize", "viral spike from 0 to 1M requests/day"—all serverless-first wins.

SAP mappings: (1) "Cost $0 ramp→scale 100x" → **Serverless(Lambda+DDB)**, (2) "No ops, no capacity planning" → **Managed services**, (3) "Pay-per-request" → **DynamoDB on-demand**, (4) "Async jobs, no orchestration" → **SQS+Lambda**, (5) "Global CDN, zero origin calls" → **CloudFront+S3**.

---

## 📝 연습 문제

**문제 1.** 스타트업이 초기 $0 예산으로 시작해 바이럴 성장 시 자동 스케일하는 아키텍처.

A) EC2 Auto Scaling Group
B) Serverless: Lambda + DynamoDB On-Demand + API Gateway
C) RDS + Auto Scaling 복제본
D) 단일 인스턴스 모니터링

**정답: B**

해설: 서버리스는 consumption model로 인보케이션당 비용만 내고, 자동 스케일링이 수백만 요청까지 무운영으로 견딘다. A는 EC2 노드 보유 비용 발생, C는 RDS 프로비저닝 비용, D는 단일 실패점이다. "초기 $0 + 자동 스케일"은 서버리스의 직답이다.

---

**문제 2.** Lambda 함수가 장시간 배치 처리가 필요하다.

A) Lambda 타임아웃 1시간으로 설정
B) Step Functions로 오케스트레이션 + Lambda 15분 조각화
C) EC2 스팟으로 장시간 작업
D) RDS 저장 프로시저

**정답: B**

해설: Lambda 최대 타임아웃 15분. 장시간은 Step Functions로 Lambda를 여러 번 호출해 조각화한다. A는 Lambda 제약 무시, C는 비용 증가, D는 DB 부담이다.

---

**문제 3.** DynamoDB 요금 최소화.

A) On-Demand 기본
B) Provisioned + Auto Scaling
C) 저부하면 On-Demand, 고부하면 Provisioned
D) DynamoDB Accelerator(DAX) 필수

**정답: B**

해설: 부하가 예측 가능하면 Provisioned이 저렴, 예측 불가면 On-Demand. 초기 스타트업은 On-Demand로 시작해 패턴 본 뒤 Provisioned으로 전환하는 게 Pro다. DAX는 추가 비용이라 초기에는 불필요.

---

**문제 4.** 바이럴 영상 업로드 시 썸네일 자동 생성.

A) 동기 Lambda POST /upload 응답
B) S3 업로드 → S3 이벤트 → Lambda 비동기 처리
C) EC2 배치 크론
D) 사용자 수동 요청

**정답: B**

해설: 이벤트 기반 비동기는 사용자 경험에 영향 없고, 스파이크에 자동 확장된다. A는 timeout 15분, C는 운영 부담. "업로드 후 자동 처리"는 S3 이벤트 → Lambda다.

---

**문제 5.** 글로벌 콘텐츠 배포, origin 서버 최소 부하.

A) EC2 원본 서버 직접 사용
B) S3 + CloudFront CDN
C) RDS 복제
D) 동기 API 게이트웨이

**정답: B**

해설: CloudFront는 엣지에서 캐시하므로 S3 origin 요청이 극도로 줄어든다. "지연 최소 + 부하 최소"는 CDN의 본질이다.

---

**문제 6.** 스타트업이 초기엔 마이크로서비스 아키텍처를 피해야 하는 이유?

A) 복잡한 네트워킹
B) 운영 오버헤드, 초기 팀 부족
C) 높은 비용
D) 스케일 불가

**정답: B**

해설: 초기 3명 팀이 마이크로서비스 운영(배포, 모니터링, 로깅 각각)은 비현실적. 모놀리스로 시작해 스케일링 문제가 보이면 분해하는 게 Pro다. "YAGNI: 당장 필요 없는 걸 만들지 말라"의 구현.

---