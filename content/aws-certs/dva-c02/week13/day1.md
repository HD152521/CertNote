# Day 61 - 최종 복습 1: IAM, EC2, Lambda, API Gateway

📅 날짜: 2026년 8월 9일 (일요일)  
🎯 주제: 핵심 서비스 최종 복습 1  
⏱️ 학습 시간: 약 120분

---

## 🎯 학습 목표

- IAM, EC2, Lambda, API Gateway의 시험 핵심 사항을 최종 정리한다
- 자주 나오는 시험 문제 유형을 파악한다

---

## 📖 최종 핵심 정리

### IAM 핵심 암기
```
정책 평가: Explicit Deny > Implicit Deny > Allow
STS AssumeRole: 교차 계정 접근, 임시 자격 증명
IAM 역할 vs 사용자: 역할은 임시, 사용자는 영구
SCP: 조직 단위 권한 경계, Deny 정책만 가능
권한 경계: IAM 사용자/역할의 최대 권한 제한
```

### EC2 핵심 암기
```
구매 옵션: 온디맨드 > 예약(72%절감) > 스팟(90%절감)
EBS gp3: SSD, 3000 IOPS 기본
EBS io2: 최고 성능 SSD, 멀티 Attach
인스턴스 스토어: 임시, 재부팅 시 유지, 종료 시 삭제
AMI: 리전 범위, 다른 리전 복사 가능
ALB: Layer 7, URL/호스트 기반 라우팅
NLB: Layer 4, 정적 IP, 초고성능
ASG 스케일링: 타겟 추적, 단계, 단순, 예약, 예측
```

### Lambda 핵심 암기
```
메모리: 128MB ~ 10240MB
타임아웃: 최대 15분
임시 스토리지: /tmp 512MB ~ 10GB
동시성 = 초당 요청 수 × 평균 실행 시간
Cold Start: 새 실행 환경, Provisioned Concurrency로 방지
예약된 동시성 = 0: 완전 비활성화
비동기 재시도: 최대 2회, DLQ 또는 Destinations
레이어: 최대 5개, /opt 디렉터리, 250MB 합계
```

### API Gateway 핵심 암기
```
통합 유형: AWS_PROXY(Lambda Proxy), AWS, HTTP, MOCK
Lambda Proxy 응답: {statusCode, headers, body}
캐싱: 기본 TTL 300초, Cache-Control: max-age=0으로 무효화
스로틀링 초과: HTTP 429
Cognito Authorizer: JWT 자동 검증
Lambda Authorizer: 커스텀 인증, 결과 캐시 기본 300초
HTTP API: REST보다 70% 저렴, 사용 계획/캐시 미지원
WebSocket: $connect, $disconnect, $default
```

---

## 🧠 도메인 1 (개발 32%) 시험 직전 압축 정리

### 자주 출제되는 함정 - 도메인 1

| 함정 | 정답 |
|------|------|
| "Lambda 최대 메모리?" | **10,240 MB** |
| "Lambda 최대 타임아웃?" | **15분 (900초)** |
| "Lambda 컨테이너 이미지 최대?" | **10 GB** |
| "Lambda Layer 최대 개수?" | **5개** |
| "ZIP 직접 업로드 최대?" | **50 MB** |
| "/tmp 최대?" | **10 GB** |
| "Lambda 동시성 기본 한도?" | **1,000 / 리전** |
| "비동기 재시도 횟수?" | **2회** (1분, 2분) |
| "Provisioned Concurrency가 가리키는 것?" | **별칭 또는 버전** ($LATEST 불가) |
| "SnapStart 지원 런타임?" | **Java, Python, .NET** |
| "AssumeRole 최대 세션?" | **12시간** |
| "Role Chaining 최대?" | **1시간** |
| "STS GetSessionToken 최대?" | **36시간** |
| "AssumeRole 첫 호출 토큰 만료?" | **1시간 (기본)** |

### IAM 정책 평가 정확히 (시험 매우 빈출)

```
1. 명시적 Deny (어디든) → 거부
2. SCP (Organizations) → 미허용 시 거부
3. 리소스 기반 정책 (S3/SQS/Lambda 등) → 허용이면 OK
4. 자격 증명 정책 (IAM)
5. 권한 경계 → 범위 안이어야 함
6. 세션 정책 (AssumeRole 시)
→ 모두 충족 시 허용
```

### Lambda 동시성 4종 (정확히)

| 종류 | 단위 | 설정 |
|------|------|------|
| **계정 동시성 한도** | 리전 전체 | 기본 1,000 |
| **버스트 한도** | 즉시 사용 가능 | 500/1000/3000 (리전별) + 분당 +500 |
| **예약 동시성** | 함수당 상한 | 무료 |
| **프로비저닝된 동시성** | 버전/별칭 | 시간당 과금 |

### API Gateway 인증 5종 (외워두기)

1. **None** — 공개
2. **IAM (SigV4)** — AWS 자격증명
3. **Lambda Authorizer (TOKEN)** — JWT, OAuth 검증
4. **Lambda Authorizer (REQUEST)** — 다중 헤더 검증
5. **Cognito User Pool Authorizer** — JWT 자동
6. **JWT Authorizer (HTTP API 전용)** — OIDC

### EC2 빈출 함정

- AMI는 **리전 종속**
- EBS는 **AZ 종속**
- HDD(st1/sc1) 부팅 볼륨 **불가**
- 인스턴스 스토어는 **stop/terminate 시 소멸** (reboot은 유지)
- IMDSv2 토큰 방식 강제 권장
- SG = Stateful, NACL = Stateless

---

## 📝 최종 모의고사 - Part 1

**문제 1.** Lambda에서 Provisioned Concurrency가 해결하는 문제는?

A) 높은 비용  
B) Cold Start 지연  
C) 타임아웃 문제  
D) 메모리 부족  

**정답: B** - Provisioned Concurrency는 실행 환경을 미리 초기화하여 Cold Start 지연을 제거합니다.

---

**문제 2.** API Gateway에서 HTTP 429 오류의 의미는?

A) 인증 실패  
B) 요청 너무 많음 (스로틀링 초과)  
C) 서버 오류  
D) 리소스 없음  

**정답: B** - 429 Too Many Requests는 API Gateway 스로틀링 한계를 초과했을 때 반환됩니다.

---

**문제 3.** IAM 정책에서 Deny와 Allow가 충돌할 때?

A) Allow 우선  
B) Deny 우선  
C) 마지막 설정 우선  
D) 관리자 결정  

**정답: B** - IAM 정책 평가에서 명시적 Deny는 항상 Allow보다 우선합니다.

---

**문제 4.** EC2 인스턴스를 중지 후 재시작할 때 데이터가 삭제되는 스토리지는?

A) EBS gp3  
B) EBS io2  
C) 인스턴스 스토어  
D) EFS  

**정답: C** - 인스턴스 스토어는 임시 스토리지로 인스턴스 중지 또는 종료 시 데이터가 삭제됩니다.

---

**문제 5.** Lambda 함수 간 데이터를 공유하는 올바른 방법은?

A) Lambda 환경 변수에 저장  
B) /tmp에 저장  
C) DynamoDB, S3, ElastiCache 등 외부 스토리지 사용  
D) Lambda 메모리에 저장  

**정답: C** - Lambda 함수 간 데이터 공유는 DynamoDB, S3, ElastiCache 등 외부 스토리지를 사용해야 합니다. Lambda 인스턴스 간 메모리는 공유되지 않습니다.

---

**문제 6.** API Gateway에서 캐시를 즉시 무효화하는 방법은?

A) API 재배포  
B) 캐시 삭제 API 호출  
C) Cache-Control: max-age=0 헤더로 요청  
D) TTL을 0으로 설정  

**정답: C** - `Cache-Control: max-age=0` 헤더를 포함하여 요청하면 API Gateway가 백엔드에서 최신 응답을 가져옵니다.

---

**문제 7.** Lambda 레이어의 파일이 저장되는 위치는?

A) /var/runtime  
B) /opt  
C) /tmp  
D) /var/task  

**정답: B** - Lambda 레이어의 파일은 `/opt` 디렉터리에 마운트됩니다.

---

**문제 8.** 교차 계정 S3 접근을 위한 올바른 방법은?

A) IAM 사용자를 대상 계정에 생성  
B) STS AssumeRole로 대상 계정 역할 수임  
C) S3 퍼블릭 액세스 허용  
D) VPN 연결  

**정답: B** - STS AssumeRole을 사용하여 대상 계정의 역할을 수임하고 임시 자격 증명으로 S3에 접근합니다.

---

## 📌 오늘의 요약

1. IAM: Deny > Allow, STS로 임시 자격 증명, SCP로 조직 단위 제한
2. EC2: 구매 옵션, EBS 유형, 인스턴스 스토어(임시), ALB/NLB 차이
3. Lambda: 메모리/타임아웃 한계, Cold Start, 동시성, 레이어(/opt)
4. API Gateway: 통합 유형, 캐시, 스로틀링(429), Authorizer 유형
5. 공통 패턴: 서버리스 + 느슨한 결합 + 관리형 서비스 선택
