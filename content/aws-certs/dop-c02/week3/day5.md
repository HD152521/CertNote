# Day 5 - Week 3 복습 + 시나리오 문제 10개

📅 날짜: Week 3 (Day 5)
🎯 주제: CodeBuild 통합 시나리오

---

## 🎯 학습 목표

- buildspec / 캐시 / 시크릿 / VPC / ARM 통합 시나리오 풀이
- 비용·시간·보안 트레이드오프 판단

---

## 🧩 사전 지식 (CS 기초)

- Compute Type 선택, Cache 모드, 시크릿 주입, VPC ENI, 멀티 아키텍처 — 이번 주 누적

---

## 📖 Week 3 핵심 요약

### 1줄 요약

1. buildspec v0.2 + reports/artifacts/cache + env.parameter-store/secrets-manager
2. Cache: S3(영속) vs Local Docker(빠르나 호스트 의존) — BuildKit + ECR cache가 모던 답
3. Secrets Manager(회전) vs Parameter Store(단순/저비용)
4. VPC 빌드 시 ENI 권한 + Endpoint 활용으로 NAT 비용 절감
5. ARM Graviton 빌드 ~20% 저렴, 매트릭스 + manifest로 멀티 아키텍처

### 헷갈리기 쉬운 비교표

| A | B | 시험 포인트 |
|---|---|-------------|
| Local Cache | S3 Cache | 영속성·비용 차이 |
| env.variables | env.secrets-manager | 평문 vs 자동 fetch |
| Secrets Manager | Parameter Store | 회전 vs 단순/저비용 |
| privilegedMode true | false | Docker-in-Docker 필요 여부 |
| build-list | build-graph | 단순 병렬 vs 의존 DAG |
| LINUX_CONTAINER | ARM_CONTAINER | 매트릭스 빌드 시 둘 다 |
| Service Role pull | Docker Hub auth | ECR + SERVICE_ROLE이 표준 |

---

## 🧠 실전 시나리오 문제 10개

### 시나리오 1
한 회사가 npm install이 매 빌드 4분, 전체 빌드의 50%를 차지한다. 가장 효과적인 개선은?

A) Compute Type을 2XLARGE로
B) S3 Cache로 `node_modules` + `/root/.npm` 경로 캐시 + CodeArtifact Upstream 사용
C) GitHub Actions로 이전
D) npm 대신 yarn

**정답: B**
해설: 캐시 + Upstream(외부 트래픽 단축)이 npm install 시간의 표준 해법.

---

### 시나리오 2
빌드 중 RDS Aurora에 마이그레이션을 실행해야 한다. Aurora는 Private 서브넷에 있다. 가장 적절한 구성은?

A) Aurora를 Public으로 전환
B) CodeBuild VPC 모드 + Aurora 서브넷에 접근 가능한 Security Group
C) Lambda로 우회
D) Bastion EC2로 수동 접속

**정답: B**
해설: 빌드의 프라이빗 리소스 접근 = VPC 모드.

---

### 시나리오 3
DB 비밀번호가 30일마다 회전된다. 빌드는 항상 최신 비밀번호로 마이그레이션해야 한다. 가장 적절한 구성은?

A) Secrets Manager에 비밀번호 저장 + Automatic Rotation Lambda + buildspec env.secrets-manager
B) Parameter Store에 평문 저장
C) 매번 수동 변경
D) IAM 인증으로 비밀번호 없음

**정답: A 또는 D 둘 다 합리적 — 시험에서 D가 답이면 "IAM authentication for RDS" 명시.**
해설: Secrets Manager 회전 + 자동 주입이 표준. RDS IAM 인증을 사용하면 비밀번호 자체가 불필요(고급).

---

### 시나리오 4
빌드 중 Docker Hub Rate Limit으로 자주 실패. 가장 적절한 해결은?

A) ECR Pull Through Cache 구성 + 모든 base image를 ECR에서 pull
B) 빌드 빈도 감소
C) Docker Hub 유료 플랜
D) Build Batch로 분산

**정답: A**
해설: ECR Pull Through Cache가 정답. Docker Hub 한도 우회 표준.

---

### 시나리오 5
Java + Python 두 언어를 동시 빌드하고, 모두 ARM/x86 양쪽 이미지를 만들고 싶다. 가장 효율적인 구성은?

A) 4개 빌드 프로젝트 별도 생성
B) Build Batch build-list로 4개 노드 병렬 빌드 + manifest로 묶기
C) 직렬 빌드
D) Jenkins로 분산

**정답: B**
해설: Build Batch가 매트릭스 빌드의 정답.

---

### 시나리오 6
Provisioning 시간이 평균 30초이고 빌드는 매일 200회. 매월 100시간이 Provisioning에 낭비된다. 해결은?

A) Reserved Capacity Fleet으로 워밍업된 컨테이너 유지
B) Compute Type 키우기
C) 빌드 자체 단축
D) VPC 모드 비활성화

**정답: A**
해설: Reserved Capacity가 Provisioning 시간을 거의 0으로.

---

### 시나리오 7
시크릿 100개 중 회전 필요한 건 10개. 비용 최저화는?

A) 모두 Secrets Manager $44/월
B) 100개 Parameter Store Standard $0 + 10개 Secrets Manager $4/월
C) 모두 Parameter Store Advanced
D) 모두 환경 변수 평문

**정답: B**
해설: 회전 필요한 것만 Secrets Manager.

---

### 시나리오 8
"VPC 빌드를 시작하니 ENI quota를 초과한다." 가장 적절한 대응은?

A) 더 큰 CIDR의 서브넷 추가 + Subnet Reservation 검토 + 동시 빌드 cap 조정
B) NAT Gateway 추가
C) IGW 추가
D) IAM 권한 확장

**정답: A**
해설: ENI는 서브넷 IP 풀에서 차지. 큰 서브넷 또는 동시 빌드 제한.

---

### 시나리오 9
빌드 컨테이너에 SSH로 접속해 디버깅하려 한다. 가장 적절한 방법은?

A) StartBuild 시 `--debug-session-enabled` → SSM Session Manager로 접속
B) Bastion EC2 사용
C) Docker exec 수동
D) Lambda로 우회

**정답: A**
해설: Debug Session이 표준 — SSM 통합, 7시간 한도.

---

### 시나리오 10
"빌드 결과 JUnit XML을 Pipeline에 표시하고, 실패 시 알람" 패턴은?

A) reports 블록에 JUNITXML 지정 + CloudWatch Logs Filter / EventBridge → SNS
B) S3에 수동 업로드
C) Slack에 직접 전송
D) Logs 그룹 자체 분석

**정답: A**
해설: Reports로 콘솔 시각화 + EventBridge 알람.

---

## 📌 Week 3 요약

1. buildspec의 다섯 페이즈와 reports/artifacts/cache 블록을 자유자재로 작성
2. 캐시 모드 4종 + BuildKit + ECR 캐시 조합으로 빌드 시간 단축
3. 시크릿은 env.secrets-manager / env.parameter-store + 적절한 IAM
4. VPC 모드 = ENI 권한 + Endpoint로 NAT 비용 통제
5. ARM/멀티 아키텍처 빌드는 Build Batch + buildx + manifest

---

## 🔜 다음 주 예고 (Week 4)

**CodeDeploy 심화 + 배포 전략**

- Day 1: In-place vs Blue/Green + AppSpec 구조
- Day 2: EC2/On-Prem 배포 + Auto Scaling 통합
- Day 3: Lambda 배포 - Linear/Canary/AllAtOnce
- Day 4: ECS Blue/Green + 트래픽 시프트
- Day 5: 시나리오 문제 10개

---

> 💪 Week 3 완료! 빌드 최적화 사고 틀이 갖춰졌습니다.
