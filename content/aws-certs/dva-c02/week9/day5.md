# Day 45 - Week 9 복습 + 연습문제 (보안)

📅 날짜: 2026년 7월 16일 (목요일)  
🎯 주제: AWS 보안 서비스 종합 복습  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- KMS, Secrets Manager, Cognito, WAF/Shield의 핵심을 종합 정리한다
- 실전 시험 유형의 보안 문제를 풀어 실력을 점검한다

---

## 📖 Week 9 핵심 정리

### 보안 서비스 역할 요약
```
KMS: 암호화 키 관리, Envelope Encryption
Secrets Manager: DB 자격 증명, 자동 로테이션
Parameter Store: 구성 데이터, 계층 구조, 무료
Cognito User Pool: 사용자 인증, JWT 토큰
Cognito Identity Pool: JWT → IAM 자격 증명
WAF: Layer 7 방화벽, SQL/XSS/Rate 제한
Shield Standard: 무료 DDoS 방어
Shield Advanced: $3,000/월, 비용 보호, DRT
ACM: 무료 SSL/TLS, 관리형 서비스만 사용 가능
```

### 핵심 암기
```
KMS 직접 암호화: 최대 4KB
Envelope Encryption: GenerateDataKey → 로컬 암호화
Secrets Manager: 비밀당 $0.40, 자동 로테이션 지원
Parameter Store: 표준 무료, SecureString = KMS 암호화
Cognito User Pool: JWT (ID/Access/Refresh Token)
ACM CloudFront: us-east-1 리전 필수
Shield Advanced: DDoS 비용 크레딧 제공
```

---

## 아키텍처 다이어그램

```
보안 계층 아키텍처
================================

[인터넷 트래픽]
     |
     | DDoS → [Shield Advanced]
     |
     v
[CloudFront]
     |
     | ACM 인증서 (us-east-1)
     | WAF (SQL/XSS/Rate 제한)
     v
[ALB]
     |
     | ACM 인증서 (리전)
     | WAF
     v
[애플리케이션]
     |
     +-- 인증: [Cognito User Pool] → JWT
     |         [Cognito Identity Pool] → IAM 자격 증명
     |
     +-- 비밀: [Secrets Manager] → DB 자격 증명
     |         [Parameter Store] → 구성 데이터
     |
     +-- 암호화: [KMS] → S3/RDS/DynamoDB 암호화
```

---

## 🧠 Week 9 시험 함정 & 약어

### 헷갈리는 비교

| A | B | 핵심 |
|---|---|------|
| AWS Managed Key | Customer Managed Key | 무료·자동 vs $1·완전 제어 |
| Encrypt | GenerateDataKey | 4KB까지 vs 데이터 키 받아 로컬 |
| KMS | CloudHSM | 멀티테넌트·관리형 vs 전용 HW·고객 관리 |
| Multi-Region Key | 일반 Key | 리전 간 복호화 vs 리전 종속 |
| Secrets Manager | Parameter Store | $0.40·자동회전 vs 무료·계층 |
| Standard Param | Advanced Param | 4KB·무료 vs 8KB·$0.05 |
| User Pool | Identity Pool | 인증·JWT vs IAM 임시 자격 |
| ID Token | Access Token | 사용자 정보 vs API 접근 |
| USER_SRP_AUTH | USER_PASSWORD_AUTH | SRP 보안 vs 비밀번호 전송 |
| Cognito Authorizer | JWT Authorizer (HTTP API) | ID Token·REST vs Access Token·HTTP |
| WAF Block | WAF Count | 차단 vs 카운트만 |
| Shield Standard | Advanced | 무료·자동 vs $3000·비용보호·SRT |
| ACM Public | Private CA | 무료·외부 vs $400/월·내부 |
| ACM CloudFront 인증서 | ACM Regional 인증서 | us-east-1만 vs 같은 리전 |
| Macie | GuardDuty | S3 PII vs 계정 활동 이상 |
| WAF Single-User | Alternating-Users | 잠깐 다운타임 vs 무중단 |

### Week 9 시험 함정 15가지

1. **AWS Managed Key 자동 회전 = 1년** (이전 자료의 3년은 옛 정보)
2. **KMS 4KB 한도 → 그 이상은 Envelope**
3. **Key Policy + IAM Policy 둘 다 필요**
4. **Multi-Region Key**는 같은 키 ID가 여러 리전
5. **Secrets Manager 자동 회전 Single vs Alternating**
6. **Parameter Store SecureString = KMS 암호화**
7. **Parameter Store 표준 4KB, 고급 8KB**
8. **Cognito Identity Pool**은 IAM 임시 자격
9. **Cognito Authorizer 기본 ID Token** (REST), HTTP API는 Access
10. **JWT Refresh Token 최대 10년**
11. **PreSignUp·PreTokenGeneration 등 Lambda 트리거 11종**
12. **WAF HTTP API 직접 지원 X**
13. **WAF Rate-based** → 5분 단위 IP 카운트
14. **Shield Advanced만 DDoS 비용 크레딧**
15. **ACM은 EC2에 직접 설치 불가** + CloudFront는 **us-east-1**

### Week 9 약어 정리

| 약어 | 풀네임 |
|------|--------|
| **KMS** | Key Management Service |
| **CMK** | Customer Master/Managed Key |
| **DEK** | Data Encryption Key (봉투 암호화) |
| **HSM** | Hardware Security Module |
| **FIPS** | Federal Information Processing Standard |
| **PII** | Personally Identifiable Information |
| **JWT** | JSON Web Token |
| **OIDC** | OpenID Connect |
| **SAML** | Security Assertion Markup Language |
| **SRP** | Secure Remote Password |
| **MFA / TOTP** | Multi-Factor / Time-based OTP |
| **WAF** | Web Application Firewall |
| **DDoS** | Distributed Denial of Service |
| **SRT** | Shield Response Team |
| **DRT** | DDoS Response Team (구 명칭) |
| **ACM** | AWS Certificate Manager |
| **mTLS** | Mutual TLS |
| **SSE / CSE** | Server / Client-Side Encryption |
| **TDE** | Transparent Data Encryption (RDS) |
| **IDP** | Identity Provider |

---

## 📝 Week 9 종합 연습문제

**문제 1.** 대용량 파일을 KMS로 암호화하는 올바른 방법은?

A) kms:Encrypt API 직접 사용  
B) Envelope Encryption (GenerateDataKey)  
C) S3 SSE만 사용  
D) 불가능  

**정답: B** - 4KB를 초과하는 데이터는 GenerateDataKey로 데이터 키를 생성하고 로컬에서 암호화합니다.

---

**문제 2.** 프로덕션 DB 비밀번호를 30일마다 자동 변경하려면?

A) Lambda로 직접 구현  
B) Secrets Manager 자동 로테이션  
C) Parameter Store 스케줄  
D) EventBridge + SSM  

**정답: B** - Secrets Manager는 RDS와 통합된 자동 로테이션 기능을 기본 제공합니다.

---

**문제 3.** 모바일 앱에서 Cognito 인증 후 S3에 직접 접근하려면?

A) User Pool JWT로 S3 직접 접근  
B) User Pool → Identity Pool → IAM 임시 자격 증명 → S3  
C) Lambda를 통한 중간 접근  
D) API Gateway를 통해서만 가능  

**정답: B** - User Pool에서 받은 JWT를 Identity Pool에서 IAM 임시 자격 증명으로 교환하여 S3에 직접 접근합니다.

---

**문제 4.** CloudFront에 HTTPS를 적용하려면 ACM 인증서를 어느 리전에서 생성해야 하는가?

A) ap-northeast-2  
B) us-west-2  
C) us-east-1  
D) 아무 리전이나 가능  

**정답: C** - CloudFront에 사용하는 ACM 인증서는 반드시 us-east-1 리전에서 생성해야 합니다.

---

**문제 5.** SQL 인젝션 공격을 탐지하고 차단하는 서비스는?

A) Shield Standard  
B) Shield Advanced  
C) AWS WAF  
D) NACL  

**정답: C** - WAF는 HTTP 요청을 분석하여 SQL 인젝션 패턴을 감지하고 차단합니다.

---

**문제 6.** Parameter Store의 SecureString 파라미터를 CLI로 복호화하여 가져오는 명령은?

A) aws ssm get-parameter --name /key  
B) aws ssm get-parameter --name /key --with-decryption  
C) aws ssm get-secure-parameter --name /key  
D) aws kms decrypt --name /key  

**정답: B** - SecureString은 --with-decryption 옵션을 추가해야 복호화된 값을 반환합니다.

---

**문제 7.** DDoS 공격으로 인해 AWS 비용이 급증했을 때 비용을 보호받으려면?

A) Shield Standard  
B) Shield Advanced  
C) WAF Rate Limiting  
D) CloudFront  

**정답: B** - Shield Advanced만 DDoS 공격으로 인한 AWS 비용에 대해 크레딧을 제공합니다.

---

**문제 8.** Cognito User Pool Lambda 트리거 중 회원가입 전 실행되는 트리거는?

A) PostConfirmation  
B) PreAuthentication  
C) PreSignUp  
D) CustomMessage  

**정답: C** - PreSignUp 트리거는 사용자가 회원가입을 완료하기 전에 실행됩니다.

---

## 📌 오늘의 요약

1. KMS: 키 관리, 4KB 초과 시 Envelope Encryption 사용
2. Secrets Manager: 자동 로테이션 ($0.40/비밀), Parameter Store는 무료
3. Cognito: User Pool(인증/JWT), Identity Pool(AWS 리소스 접근)
4. WAF: Layer 7 방화벽, SQL/XSS/Rate/Geo 차단 규칙
5. Shield: Standard(무료/기본), Advanced($3,000/비용보호/DRT)
