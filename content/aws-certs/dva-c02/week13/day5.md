# Day 65 - 최종 모의고사 + 시험 준비 완료

📅 날짜: 2026년 8월 13일 (목요일)  
🎯 주제: DVA-C02 최종 모의고사 & 시험 준비  
⏱️ 학습 시간: 약 130분 (시험 시간과 동일)

---

## 🎯 학습 목표

- DVA-C02 시험 형식과 동일한 모의고사를 풀어본다
- 취약 영역을 파악하고 마지막 정리를 한다
- 시험 당일 전략을 수립한다

---

## 📖 시험 정보 최종 확인

```
시험명: AWS Certified Developer - Associate (DVA-C02)
시간: 130분
문제 수: 65문제 (채점 문제 50개 + 미채점 15개)
합격 점수: 720/1000
비용: $150 USD
언어: 한국어 포함 다국어 지원
문제 유형: 단일 선택 (4개 보기), 다중 선택 (5-6개 중 2-3개)
```

---

## 📝 최종 모의고사 (30문제)

**1.** Lambda에서 초당 100개 요청을 처리하고 평균 실행 시간이 2초라면 필요한 동시성은?

A) 50  
B) 100  
C) 200  
D) 300  

**정답: C** - 동시성 = 초당 요청 수(100) × 평균 실행 시간(2) = 200

---

**2.** DynamoDB에서 7KB 항목을 트랜잭션으로 쓸 때 소비 WCU는?

A) 7 WCU  
B) 14 WCU  
C) 4 WCU  
D) 2 WCU  

**정답: B** - ceil(7/1) × 2 = 7 × 2 = 14 WCU (트랜잭션은 2배)

---

**3.** S3에서 SSE-KMS를 사용할 때 발생할 수 있는 문제는?

A) 데이터 손실 위험  
B) KMS API 호출 한도 초과 (스로틀링)  
C) 암호화 성능 저하  
D) 버킷 크기 제한  

**정답: B** - 대용량 트래픽에서 SSE-KMS는 모든 객체 접근 시 KMS API를 호출하므로 KMS 호출 한도에 도달할 수 있습니다.

---

**4.** API Gateway에서 Lambda로 요청을 전달할 때 원래 HTTP 요청의 헤더, 쿼리 파라미터, 바디를 모두 전달받으려면?

A) AWS 통합 타입  
B) HTTP 통합 타입  
C) AWS_PROXY (Lambda Proxy) 통합  
D) MOCK 통합  

**정답: C** - Lambda Proxy는 원래 HTTP 요청의 모든 정보(메서드, 헤더, 쿼리, 바디)를 Lambda event 객체로 전달합니다.

---

**5.** 다음 중 Kinesis Data Streams와 SQS의 공통점은?

A) 여러 Consumer가 동시에 읽을 수 있음  
B) 순서 보장  
C) 메시지 보존 기간이 있음  
D) 처리량 무제한  

**정답: C** - 두 서비스 모두 메시지/레코드 보존 기간이 있습니다 (SQS 최대 14일, Kinesis 최대 365일).

---

**6.** CodeDeploy에서 배포 후 ValidateService 단계가 실패하면?

A) 배포 성공 처리  
B) 자동 롤백  
C) 수동 롤백 필요  
D) 알람 발생  

**정답: B** - ValidateService 단계 실패 시 CodeDeploy는 자동으로 이전 버전으로 롤백합니다.

---

**7.** CloudWatch Logs에서 특정 로그 패턴의 수를 지표로 변환하여 알람을 설정하려면?

A) CloudWatch Insights  
B) Metric Filter  
C) CloudTrail  
D) EventBridge  

**정답: B** - Metric Filter를 사용하면 로그 패턴을 CloudWatch 지표로 변환하고 알람을 설정할 수 있습니다.

---

**8.** SQS에서 메시지를 처리하는 데 10분이 걸릴 때 Visibility Timeout의 적절한 값은?

A) 30초 (기본값)  
B) 5분  
C) 15분 (처리 시간보다 길게)  
D) 12시간  

**정답: C** - Visibility Timeout은 처리 시간보다 길게 설정해야 합니다. 10분 처리라면 15분 이상으로 설정합니다.

---

**9.** Cognito에서 Facebook으로 소셜 로그인을 구현할 때 사용하는 기능은?

A) Identity Pool 단독  
B) User Pool (소셜 제공자 통합)  
C) SAML 연동  
D) OpenID Connect  

**정답: B** - Cognito User Pool은 Facebook, Google, Apple 등 소셜 로그인을 직접 통합할 수 있습니다.

---

**10.** Aurora Global Database를 사용할 때 재해 복구(DR) 목표는?

A) RPO < 5분, RTO < 1시간  
B) RPO < 1초, RTO < 1분  
C) RPO < 1시간, RTO < 4시간  
D) RPO = 0, RTO = 0  

**정답: B** - Aurora 글로벌 데이터베이스는 1초 미만의 복제 지연(RPO)과 1분 미만의 Failover 시간(RTO)을 제공합니다.

---

**11.** Lambda 함수가 VPC 내 RDS에 접근하기 위한 필수 조건은?

A) Lambda를 퍼블릭 서브넷에 배치  
B) Lambda를 VPC에 구성, RDS와 같은 VPC 또는 피어링된 VPC  
C) NAT 게이트웨이 필수  
D) VPN 연결 필요  

**정답: B** - Lambda를 VPC에 구성하고 RDS와 통신할 수 있는 보안 그룹과 서브넷을 설정해야 합니다.

---

**12.** 클라이언트가 서버 통하지 않고 S3에 직접 파일을 업로드하려면?

A) S3 Transfer Acceleration  
B) 멀티파트 업로드  
C) PUT 프리사인 URL  
D) S3 게이트웨이 엔드포인트  

**정답: C** - PUT 프리사인 URL을 Lambda에서 생성하여 클라이언트에 전달하면, 클라이언트가 서버 없이 S3에 직접 업로드할 수 있습니다.

---

**13.** DynamoDB에서 핫 파티션을 방지하기 위한 파티션 키 선택 기준은?

A) 날짜/시간  
B) 상태 코드  
C) 높은 카디널리티 (UserId, UUID 등)  
D) 국가 코드  

**정답: C** - 파티션 키는 높은 카디널리티를 가져야 데이터와 트래픽이 고르게 분산되어 핫 파티션을 방지합니다.

---

**14.** CloudFormation 스택 삭제 시 S3 버킷이 삭제되지 않으려면?

A) 버킷 이름에 특수 문자 포함  
B) DeletionPolicy: Retain 설정  
C) S3 버전 관리 활성화  
D) 버킷 정책으로 삭제 거부  

**정답: B** - `DeletionPolicy: Retain`을 리소스에 설정하면 스택 삭제 시 해당 리소스는 삭제되지 않고 유지됩니다.

---

**15.** Step Functions에서 여러 Lambda를 병렬로 실행한 후 모두 완료되면 다음 단계로 진행하려면?

A) Choice 상태  
B) Wait 상태  
C) Parallel 상태  
D) Map 상태  

**정답: C** - Parallel 상태는 여러 브랜치를 동시에 실행하고 모든 브랜치가 완료된 후 다음 상태로 이동합니다.

---

**16.** X-Ray 샘플링에서 모든 요청을 추적하는 설정은?

A) rate: 1.0, fixed_target: 0  
B) rate: 0.05, fixed_target: 1  
C) SamplingRate: 100%  
D) X-Ray에서 불가능  

**정답: A** - `fixed_target: 0, rate: 1.0`으로 설정하면 모든 요청을 추적합니다 (비용 주의).

---

**17.** API Gateway에서 Lambda 함수가 응답할 때 반드시 반환해야 하는 형식은 (Lambda Proxy 통합 시)?

A) 응답 바디만 반환  
B) {"statusCode": ..., "headers": ..., "body": ...}  
C) HTTP 응답 객체 직접 반환  
D) JSON 바디만 반환  

**정답: B** - Lambda Proxy 통합 시 Lambda는 `{statusCode, headers, body}` 형식의 응답 객체를 반환해야 합니다.

---

**18.** ElastiCache를 세션 스토어로 사용할 때 적합한 엔진과 이유는?

A) Memcached - 단순하고 빠름  
B) Redis - 영속성, 만약 세션 데이터 손실을 방지해야 할 경우  
C) 둘 다 동일  
D) RDS를 대신 사용  

**정답: B** - 세션 데이터 손실을 방지하고 영속성이 필요하다면 Redis를 선택합니다. 단순 캐시면 Memcached도 가능합니다.

---

**19.** CodePipeline에서 GitHub 소스를 사용할 때 코드 변경 감지 방법은?

A) 주기적 폴링  
B) GitHub webhook을 통한 이벤트 기반  
C) 수동 트리거  
D) S3 이벤트  

**정답: B** - CodePipeline은 GitHub webhook을 통해 push 이벤트가 발생하면 즉시 파이프라인을 시작합니다.

---

**20.** Lambda 함수가 DynamoDB를 읽을 때 `ProvisionedThroughputExceededException`이 발생하면?

A) Lambda 메모리 증가  
B) DynamoDB 읽기 용량 단위(RCU) 증가 또는 온디맨드 모드로 전환  
C) Lambda 동시성 증가  
D) API Gateway 캐시 활성화  

**정답: B** - 이 오류는 DynamoDB의 읽기 처리량 한계 초과이므로 RCU를 증가시키거나 온디맨드 모드로 전환해야 합니다.

---

**21.** KMS에서 Customer Managed Key를 삭제하면 어떻게 되는가?

A) 즉시 삭제  
B) 7-30일의 대기 기간 후 삭제  
C) 영구 삭제 불가  
D) AWS 승인 필요  

**정답: B** - CMK 삭제는 7-30일의 예약 삭제 기간이 있으며, 이 기간 동안 취소가 가능합니다.

---

**22.** SQS FIFO 큐에서 동일한 메시지가 2번 전송되는 것을 방지하려면?

A) MessageGroupId 사용  
B) MessageDeduplicationId 사용  
C) VisibilityTimeout 설정  
D) DLQ 설정  

**정답: B** - FIFO 큐의 MessageDeduplicationId는 5분 내에 동일한 ID를 가진 메시지를 중복 처리하지 않습니다.

---

**23.** CloudFormation에서 리소스 생성 순서를 제어하려면?

A) 알파벳 순서로 자동 결정  
B) DependsOn 속성 사용  
C) 별도 스택으로 분리  
D) 순서 제어 불가  

**정답: B** - `DependsOn` 속성을 사용하면 특정 리소스가 먼저 생성된 후에 현재 리소스를 생성하도록 순서를 제어할 수 있습니다.

---

**24.** Lambda 함수가 실행 중 외부 API 호출 타임아웃이 자주 발생할 때 X-Ray로 확인하는 방법은?

A) CloudWatch 로그 확인  
B) X-Ray 서비스 맵과 트레이스에서 외부 HTTP 서브세그먼트 시간 확인  
C) API Gateway 로그 확인  
D) Lambda 환경 변수 확인  

**정답: B** - X-Ray SDK는 외부 HTTP 호출을 자동으로 세그먼트로 기록하여 서비스 맵에서 지연 시간을 시각화합니다.

---

**25.** Elastic Beanstalk Rolling with Additional Batch 배포의 장점은?

A) 가장 빠른 배포  
B) 배포 중 전체 용량 유지  
C) 롤백 가장 쉬움  
D) 비용 가장 적음  

**정답: B** - Rolling with Additional Batch는 배포 중 추가 인스턴스를 생성하여 전체 용량을 유지하면서 롤링 배포합니다.

---

**26.** Kinesis Data Firehose와 Kinesis Data Streams의 주요 차이점은?

A) 비용 차이만 있음  
B) Firehose는 완전 관리형 전달(Near RT), Streams는 직접 처리(실시간)  
C) Streams가 더 비쌈  
D) Firehose만 여러 Consumer 지원  

**정답: B** - Firehose는 서버리스로 S3/Redshift 등에 자동 전달하고, Streams는 여러 Consumer가 직접 실시간으로 처리합니다.

---

**27.** IAM 역할에 신뢰 정책(Trust Policy)이 필요한 이유는?

A) 역할 생성에 필수  
B) 어느 엔티티가 이 역할을 수임할 수 있는지 정의  
C) 역할의 권한 범위 정의  
D) 역할 비용 제어  

**정답: B** - 신뢰 정책(Trust Policy)은 이 역할을 수임(AssumeRole)할 수 있는 엔티티(서비스, 사용자, 계정)를 정의합니다.

---

**28.** API Gateway Stage Variable을 사용하는 목적은?

A) API 성능 향상  
B) 환경(dev/staging/prod)별로 다른 Lambda 함수나 엔드포인트 지정  
C) 캐싱 설정  
D) 인증 설정  

**정답: B** - Stage Variable은 각 스테이지(dev, staging, prod)마다 다른 Lambda 별칭이나 엔드포인트를 지정하여 동일 API 구조로 다른 환경에 배포합니다.

---

**29.** Lambda 함수에서 타임아웃이 발생했을 때 SQS 메시지는 어떻게 되는가?

A) 즉시 DLQ로 이동  
B) VisibilityTimeout 후 큐에 다시 나타남  
C) 삭제됨  
D) 처리 중으로 영원히 유지  

**정답: B** - Lambda가 SQS 메시지 처리에 실패(타임아웃 포함)하면 VisibilityTimeout이 지난 후 메시지가 큐에 다시 나타납니다.

---

**30.** DVA-C02 시험에서 "느슨한 결합(Loose Coupling)" 아키텍처를 구현하려면?

A) 서비스 간 직접 API 호출  
B) SQS, SNS, EventBridge 등 메시징 서비스 활용  
C) 모든 서비스를 하나의 Lambda에 통합  
D) RDS로 서비스 간 데이터 공유  

**정답: B** - SQS, SNS, EventBridge와 같은 메시징 서비스를 통해 서비스 간 직접 의존성을 줄이고 느슨한 결합을 구현합니다.

---

## 🎯 시험 당일 전략

```
1. 시험 전날:
   - 핵심 암기 사항 최종 검토
   - 충분한 수면
   
2. 시험 중:
   - 확실한 문제 먼저 해결
   - 헷갈리는 문제는 플래그 표시 후 나중에
   - 남은 시간에 플래그된 문제 재검토
   - 첫 번째 답이 보통 맞음 (신중히 변경)
   
3. 틀리기 쉬운 포인트:
   - Multi-AZ는 성능 향상이 아님 (고가용성)
   - GSI는 최종적 일관성만
   - S3 정적 웹사이트는 HTTP만
   - CloudFront ACM은 us-east-1만
   - EC2 메모리/디스크는 CloudWatch 기본 지표 아님
   - DLQ는 SNS/SQS에서 설정, Lambda Destinations 활용
```

---

## 🧠 시험 직전 30초 체크리스트 - 절대 잊지 말 것

### 숫자 외우기 (시험에서 매우 자주)

```
Lambda     메모리 10240MB · 타임아웃 15분 · /tmp 10GB · Layer 5개 · ZIP 250MB · 컨테이너 10GB
           동시성 1000 (기본) · 비동기 재시도 2회 · 동기 payload 6MB · 비동기 256KB · 스트리밍 20MB
DynamoDB   항목 400KB · 트랜잭션 100개·4MB · LSI 5개·생성시만 · GSI 20개·언제든
           Streams 24h · Burst 5분 · 파티션당 3000 RCU + 1000 WCU
S3         객체 5TB · 단일 PUT 5GB · 멀티파트 파트 5MB~5GB · 파트수 10000
           Glacier 최소 90일 · Deep Archive 180일 · IA 30일 · IA 객체 최소 128KB
SQS        메시지 256KB · 보존 1m~14d · VT 0~12h · FIFO 300/s (고처리량 70k)
Kinesis    샤드 쓰기 1MB/s·1000 RPS · 읽기 2MB/s · 보존 24h~365d · On-Demand 200MB/s
EC2        UserData 16KB · Spot 2분 알림 · SG 60 규칙 · 1 인스턴스 5 SG
STS        AssumeRole 1h~12h · 체인 1h · GetSessionToken 36h
RDS        IAM 토큰 15분 · 자동 백업 35일 · Read Replica 5 (Aurora 15)
Aurora     3 AZ × 6 사본 · Backtrack 72시간 · Global RTO 1분/RPO 1초
API GW     캐시 0.5~237GB · TTL 300초 · 429 스로틀 · WebSocket idle 10분·max 2h
KMS        Encrypt 4KB · CMK $1/월 · 자동 회전 1년 (2022~)
DVA-C02    65문제 · 130분 · 720/1000 · $150
```

### 자주 헷갈리는 짝 (한 줄 정리)

```
Multi-AZ ≠ Read Replica          → HA(동기) vs 읽기 확장(비동기)
LSI ≠ GSI                        → 생성 시만·Strong vs 언제든·Eventually
SQS Standard ≠ FIFO              → 무제한·순서X vs 300/s·순서·dedup
SNS ≠ EventBridge                → Pub/Sub vs 이벤트 필터·라우팅
Kinesis ≠ SQS                    → 다중 Consumer·재처리 vs 단일·소비후사라짐
Lambda Reserved ≠ Provisioned    → 상한 설정·무료 vs 미리 켜둠·유료
$LATEST ≠ Version                → 변경 가능 vs 불변
Cognito User Pool ≠ Identity Pool → 인증·JWT vs IAM 임시 자격
WAF ≠ Shield                     → Layer 7·앱 공격 vs Layer 3-4·DDoS
KMS Encrypt ≠ GenerateDataKey    → ≤4KB vs Envelope
Secrets Manager ≠ Parameter Store → 회전·$0.40 vs 무료·계층
SSE-S3 ≠ SSE-KMS ≠ SSE-C         → AWS 키 vs KMS·감사 vs 고객키·HTTPS
ECR Basic ≠ Enhanced 스캔        → 무료 CVE vs Inspector·유료
ECS taskRole ≠ executionRole     → 앱이 사용 vs 에이전트가 사용
SAM ≠ CDK                        → YAML 매크로 vs 코드
CFN Stack Policy ≠ Termination Protection → 업데이트 보호 vs 삭제 방지
DeletionPolicy: Retain ≠ Snapshot → 그대로 vs 스냅샷 생성
ALB ≠ NLB                        → L7·HTTP·DNS vs L4·TCP·EIP
EC2 stop ≠ terminate ≠ hibernate → EBS 보존 vs 삭제 vs RAM 보존
OAI (구) ≠ OAC (신)              → CloudFront → S3 비공개 접근
```

### 보안 시나리오 정답 6개 (시험 자주)

```
DDoS L7 방어                      → Shield Advanced
SQL Injection 방어                → WAF
DB 비밀번호 자동 교체             → Secrets Manager
모바일 앱 → S3 직접 접근          → Cognito Identity Pool
대용량 KMS 암호화                 → Envelope Encryption
3rd-party AssumeRole 보안         → ExternalId (Confused Deputy)
```

### 안티 패턴 = 오답

```
❌ Lambda → Lambda 동기 호출 (직접)
❌ Lambda /tmp에 민감 데이터 영구 저장
❌ S3 같은 버킷에 처리 결과 저장 (무한 루프)
❌ EC2에 액세스 키 하드코딩 (IAM 역할 써야)
❌ Lambda 환경 변수에 비밀번호 평문
❌ root 계정으로 일상 작업
❌ DDB 파티션 키에 date/status (핫 파티션)
❌ Kinesis 한 레코드 실패 후 무한 재시도 (샤드 블록)
❌ CloudFormation Prod DB에 DeletionPolicy 없음
❌ 0.0.0.0/0 SSH 인바운드 허용
```

---

## 🎉 최종 합격 응원 메시지

3개월 동안 13주 × 5일 × 90분 = **약 100시간**의 학습을 마쳤습니다.

- **이론 학습 ✅** — 모든 주요 서비스 커버
- **함정 정리 ✅** — 도메인별 빈출 패턴 익힘
- **모의고사 ✅** — 시험 형식 익숙
- **시험 직전 압축본 ✅** — 마지막 점검 완료

**합격하시면 다음 단계:**
- AWS Solutions Architect Associate (SAA-C03)
- AWS DevOps Engineer Professional (DOP-C02)
- AWS Security Specialty (SCS-C02)

**Good luck! 화이팅!** 🚀

---

## 📌 3개월 학습 완료 요약

**완료한 주제:**
- Week 1-2: AWS 기초, IAM, EC2, EBS, 로드밸런서
- Week 3-4: Lambda, API Gateway, 서버리스
- Week 5-6: S3, DynamoDB
- Week 7: RDS, ElastiCache, Aurora
- Week 8: CI/CD (CodeCommit, CodeBuild, CodeDeploy, CodePipeline, Beanstalk)
- Week 9: 보안 (KMS, Secrets Manager, Cognito, WAF, Shield)
- Week 10: 모니터링 (CloudWatch, X-Ray, CloudTrail, EventBridge)
- Week 11: 메시징 (SQS, SNS, Kinesis, Step Functions, AppSync)
- Week 12: 컨테이너/IaC (ECS, Fargate, ECR, CloudFormation, SAM, CDK)
- Week 13: 최종 복습 및 모의고사

**합격을 응원합니다! AWS Certified Developer - Associate 취득에 성공하세요!**
