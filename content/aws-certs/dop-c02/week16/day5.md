# Day 5 - D-Day 체크리스트 + 짧은 모의 20문항 + 시험 팁

📅 날짜: Week 16 (Day 5)
🎯 주제: 시험 직전 마무리, 컨디션, 운영 팁
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 시험 D-Day 체크리스트로 누락 방지
- 20문항 마지막 모의로 감 유지
- 시험 중 시간/마킹/언어 설정 팁 숙지

---

## 🧩 사전 지식 (시험 환경)

- 시험 시간 180분 (75문항), ESL +30분 신청 가능(영문 시험 시)
- Pearson VUE 센터 또는 OnVUE 온라인 감독
- 한국어 응시 가능 — 단, 일부 문항 영문 동시 표기 권장
- 합격 750점, 도메인별 점수도 결과지에 표기

---

## 📖 이론 내용

### 1. D-2일 체크리스트

- [ ] 시험 시간/장소 재확인(또는 OnVUE 시스템 점검)
- [ ] 신분증 2개(여권 + 신용카드/주민증)
- [ ] OnVUE: 카메라/마이크/책상 정돈/네트워크 점검
- [ ] 약점 도메인 1~2개만 가벼운 재훑기
- [ ] 새로운 자료 시작 금지 — 본 자료만 반복

### 2. D-1일 체크리스트

- [ ] 7시간 이상 수면
- [ ] 카페인 과다 금지
- [ ] 모의 풀이 금지 (자신감 손상 방지)
- [ ] week16 day1~3 ⭐ 핵심 포인트만 한 번 훑기
- [ ] 시험 출발 동선/주차 확인

### 3. D-Day 당일

- [ ] 시험 30분 전 도착 (OnVUE는 30분 전 체크인)
- [ ] 첫 10문항은 무조건 침착, 페이스 만들기
- [ ] 30문항 지점에서 시계 확인 → 75분 안쪽이면 여유
- [ ] 60문항 지점에서 마킹 문항 확인
- [ ] 마지막 30분: 마킹 문항 + 길이 매우 긴 시나리오 재검토

### 4. 시험 중 마음가짐

- 보기 2개로 좁히면 정답률 70%+ — 50% 확률이라도 무조건 답함
- 답이 2개 다 동작한다면 단서(MOST/LEAST/cost-effective/least operational overhead)에 한 번 더 집중
- "All of the above", "None of the above"가 보이면 의심
- 새로 보는 서비스명은 보통 함정 (오답 키워드)

### 5. 자주 출제 빈출 30선 빠른 카드

1. CodePipeline Cross-Account = KMS CMK + Cross-Account Role
2. Lambda Canary = Alias + CodeDeploy
3. ECS Blue/Green = CodeDeploy + ALB Listener
4. CodeBuild VPC + 인터넷 차단 = VPC Endpoint
5. StackSets Service-Managed + Auto-Deployment = 신규 계정 자동
6. Secrets Manager 자동 회전 = Rotation Lambda
7. AppConfig = Validator + Deployment Strategy
8. SSM Hybrid Activation = 온프레 = EC2
9. IAM Roles Anywhere = 정적 키 제거 (온프레)
10. CodeDeploy On-Prem = AppSpec 양쪽 배포
11. Karpenter = 빠른 노드 스케일
12. EKS Pod Identity = IRSA 후속
13. GitOps(Argo/Flux) = Git revert 롤백
14. Container Insights + FireLens + ADOT = 컨테이너 관찰성
15. Aurora Global = 빠른 DB DR
16. DynamoDB Global Tables = Active-Active
17. Global Accelerator = 1초 페일오버 + 고정 IP
18. Route 53 Failover + Health Check = 표준
19. CloudWatch OAM = 멀티 계정 통합
20. EMF = Lambda 메트릭 비용
21. EventBridge = 자동 대응 진입점
22. Step Functions Standard = Runbook
23. Incident Manager = 페이저 + Post-Incident
24. Chatbot = Slack 제한 CLI
25. GuardDuty Delegated Admin + Auto-Enable
26. Security Hub Region Aggregator
27. Config Rule + SSM Document = 자동 수정
28. Audit Manager = 컴플라이언스 증거
29. Macie = S3 PII
30. Inspector = EC2/Lambda/ECR CVE

### 6. 한국어/영어 표기 팁

- "운영 부담" = operational overhead
- "비용 효율" = cost-effective
- "최소 변경" = minimum changes / least disruptive
- "자동으로" = automatically
- "전사적으로" = across all accounts
- 의심 가는 한국어 문장은 영문 토글로 한 번 확인

---

## 🧠 심화: 마지막 20분 시험장 전략

1. 마킹된 시나리오 문항부터 검토 (2분 이상 봤던 것)
2. 답이 바뀔 정도의 새 단서 없으면 첫 답 유지
3. 빈 칸 답 없음 — 무조건 어느 하나 선택
4. 제출 후엔 즉시 결과 확인 가능

---

## 🏗️ 시험 흐름 다이어그램

```
당일 흐름
==================================================

  도착(30분 전)
        │
        ▼
  체크인(신분증/사진/방 점검)
        │
        ▼
  시험 시작 (3시간)
   ├─ 0~30문: 페이스 만들기 (목표 70분)
   ├─ 30~60문: 본격 풀이 (목표 70분)
   ├─ 60~75문: 마무리 + 마킹 (목표 30분)
   └─ 마지막 10분: 마킹 검토
        │
        ▼
  제출 → 즉시 합격/불합격 + 도메인별 점수
        │
        ▼
  공식 결과 이메일 (~5일)
```

---

## ⭐ 핵심 포인트

1. ⭐ 새로운 자료 시작 금지 — 본 자료 반복
2. ⭐ 첫 10문항으로 페이스 만들기, 마지막 30분으로 마킹 검토
3. ⭐ 답이 2개 동작 시 단서(MOST/LEAST/cost-effective)에 집중
4. ⭐ 한국어 의심 시 영문 토글 활용
5. ⭐ 빈 답 금지 — 무조건 선택

---

## 💻 마지막 점검 CLI 명령어

```bash
# 모든 핵심 명령은 시험 출제와 직접 매칭되지 않지만 개념 환기
aws cloudformation create-stack-set ... --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true
aws deploy create-deployment-config --compute-platform Lambda \
  --traffic-routing-config type=TimeBasedCanary
aws guardduty enable-organization-admin-account --admin-account-id ...
aws securityhub create-finding-aggregator --region-linking-mode ALL_REGIONS
aws ssm create-activation --iam-role SSMServiceRole
aws rolesanywhere create-trust-anchor --source sourceType=CERTIFICATE_BUNDLE,...
```

---

## 📝 마지막 모의 20문항

**1.** Cross-Account Pipeline 누락 빈도 1위?  A) **Customer Managed KMS Key + Key Policy**  **정답: A**

**2.** Lambda Canary 5분 10%/20분 50%?  A) **Canary 단계 2개만 → Linear가 더 맞음**  ※ 시험에선 Linear/Canary 차이 묻는 패턴이 많다. 5분 두 단계 = Canary, N분 N% = Linear  **정답: Linear**

**3.** ECS Blue/Green 핵심 구성?  A) **CodeDeploy + ALB Test/Prod Listener**  **정답: A**

**4.** 60 계정 신규 자동 베이스라인?  A) **StackSets Service-Managed + Auto-Deployment**  **정답: A**

**5.** RDS 90일 자동 회전?  A) **Secrets Manager + Rotation Lambda**  **정답: A**

**6.** 점진 피처 플래그 + 검증?  A) **AppConfig + Validator + Deployment Strategy**  **정답: A**

**7.** 온프레 5,000대 패치?  A) **SSM Hybrid Activation + Patch Manager**  **정답: A**

**8.** EKS 빠른 노드 스케일 + 다양한 타입?  A) **Karpenter**  **정답: A**

**9.** RTO 1분/RPO 1초?  A) **Aurora Global Database**  **정답: A**

**10.** 1초 페일오버 + 고정 IP?  A) **Global Accelerator**  **정답: A**

**11.** 멀티 계정 메트릭 단일 대시?  A) **CloudWatch OAM**  **정답: A**

**12.** Lambda 고차원 메트릭 비용?  A) **EMF**  **정답: A**

**13.** 자동 대응 진입점?  A) **EventBridge**  **정답: A**

**14.** Runbook 다단계?  A) **Step Functions Standard**  **정답: A**

**15.** 페이저 + Post-Incident?  A) **Incident Manager**  **정답: A**

**16.** 60 계정 GuardDuty 자동?  A) **Delegated Admin + Auto-Enable**  **정답: A**

**17.** S3 공개 자동 차단?  A) **Config Rule + SSM Document Auto-Remediation**  **정답: A**

**18.** SOC 2 증거 자동 수집?  A) **Audit Manager**  **정답: A**

**19.** EC2 CVE 스캔?  A) **Inspector**  **정답: A**

**20.** 온프레 정적 키 제거?  A) **IAM Roles Anywhere**  **정답: A**

---

## 📌 오늘의 요약

1. D-2/D-1/D-Day 체크리스트 그대로 따르기
2. 새로운 자료 금지 — 본 자료 반복
3. 페이스: 첫 10문 침착, 마지막 30분 마킹 검토
4. 빈 답 금지 + 단서 키워드 집중
5. 16주 끝. 합격을 기원합니다. Fighting!
