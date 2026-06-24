# Day 3 - 도메인 5·6 통합 복습: 데이터 보호 ↔ 관리·거버넌스

도메인 5(데이터 보호, ~18%)와 도메인 6(관리·거버넌스, ~14%)는 시험의 마지막 묶음이다. 관계는 이렇다 — **데이터 보호는 "데이터를 어떻게 암호화·격리·보존하는가"를, 거버넌스는 "그 통제를 다계정 규모로 어떻게 강제·검증·유지하는가"를** 다룬다. Specialty 답안은 *"한 계정에서 옳은 통제를, Organizations 전체에 자동으로 강제하라"*는 형태가 많다. 오늘은 KMS 중심의 데이터 보호와 Organizations 중심의 거버넌스를 하나의 통제 전파 모델로 묶는다.

## 데이터 보호: KMS가 모든 것의 중심

| 키 유형 | 키 자료 통제 | 로테이션 | 비용/용도 |
|---------|--------------|----------|-----------|
| AWS managed key | AWS | 자동(1년) | 무료, 서비스 기본 |
| Customer managed key(CMK) | 고객(정책·grant) | 선택 자동/수동 | 키 정책 제어 필요 시 |
| Imported key material | 고객 반입(BYOK) | 수동 재반입 | 키 출처 통제 필요 |
| CloudHSM-backed(custom key store) | 고객 HSM(FIPS 140-2 L3) | — | 규제·전용 HSM |

> 💡 **관련 이론**: KMS의 핵심은 *envelope encryption(봉투 암호화)*다. KMS의 마스터 키(KEK)가 데이터 키(DEK)를 암호화하고, 실제 대용량 데이터는 DEK로 로컬 암호화한다. `GenerateDataKey`가 평문 DEK(즉시 사용·메모리에서만)와 암호화된 DEK(데이터와 함께 저장)를 함께 반환한다. 덕분에 대용량을 KMS로 매번 보내지 않고도 키를 KMS가 통제한다. "왜 KMS가 대용량 파일을 직접 암호화하지 않나" → envelope encryption 때문.

### 키 정책 vs IAM vs Grant

KMS 접근은 **키 정책이 1차 권한 원천**이다(IAM과 다른 점). 핵심 규칙:
- 키 정책에 계정 root를 신뢰해야 IAM 정책으로 위임 가능(`"Enable IAM policies"`).
- **Grant**: 임시·세밀한 권한 위임(서비스가 사용자 대신 키 사용). 만료·취소 가능.
- 키 삭제는 즉시 불가 — *7~30일 대기*. 그 전엔 *disable*로 되돌릴 수 있게.

> ⚠️ **자주 틀리는 구분**: 
> - **S3 SSE-S3 vs SSE-KMS vs SSE-C vs DSSE-KMS**: S3-관리키 / KMS키(감사·정책) / 고객제공키 / 이중 KMS. 감사·접근 통제 필요 → SSE-KMS.
> - **CloudHSM vs KMS**: 전용 단일 테넌트 HSM(직접 운영, FIPS L3) vs 관리형 멀티테넌트. 규제·키 단독 소유 → CloudHSM/custom key store.
> - **전송 중 vs 저장 중**: TLS(in transit) vs SSE/KMS(at rest). 둘 다 필요.

### 데이터 보호의 추가 도구

- **S3 Object Lock(WORM)** + MFA Delete + 버전 관리 → 변조·삭제 방지(랜섬웨어·규제).
- **버킷 정책 `aws:SecureTransport`** → TLS 강제(평문 HTTP 거부).
- **ACM** → 인증서 발급·자동 갱신(CloudFront는 us-east-1).
- **Macie** → S3 민감 데이터 발견(도메인 1과 연결).
- **RDS/EBS/EFS 암호화** → 생성 시 KMS 키 지정(나중에 켜기 어려움 → 스냅샷 재암호화).

> 🎯 **통합 시나리오 A**: "규제상 키 자료를 우리가 단독 소유·통제해야 하고, S3 데이터는 그 키로 암호화하며, 누가 키를 썼는지 감사해야 한다." 답: **CloudHSM 기반 KMS custom key store**(키 자료 단독 소유·FIPS L3) → 그 CMK로 **S3 SSE-KMS**(키 정책으로 접근 통제) → **CloudTrail**로 KMS API(`Decrypt`/`GenerateDataKey`) 호출 감사. 키 소유(CloudHSM) + 통제(키 정책) + 감사(CloudTrail) 삼위일체.

## 거버넌스: 통제를 조직 규모로 강제

| 도구 | 역할 |
|------|------|
| AWS Organizations | 다계정 구조·OU·통합 결제의 토대 |
| SCP | OU/계정 권한 상한 강제(guardrail) |
| Control Tower | landing zone·가드레일·계정 팩토리 자동화 |
| AWS Config | 설정 준수 평가·이력·자동 교정 |
| Conformance Pack | Config 규칙 묶음을 조직 배포 |
| Firewall Manager | WAF/SG/Shield 정책 중앙 강제 |
| Service Catalog | 승인된 인프라 제품만 셀프서비스 |
| RAM | 리소스 교차 계정 공유 |

> 💡 **관련 이론**: 거버넌스의 정신은 *"preventive(예방) + detective(탐지) + responsive(대응)"* 가드레일의 조합이다. **SCP = 예방**(아예 못 하게), **Config 규칙 = 탐지**(어긋나면 발견), **Config 자동 교정/EventBridge = 대응**(되돌림). Control Tower는 이 셋을 landing zone에 패키징한다. 시험에서 "조직 전체에 이 통제를 강제" → SCP(권한) 또는 Firewall Manager(네트워크/WAF) 또는 Config Conformance Pack(준수)을 고른다.

### SCP의 전형적 가드레일

- 루트 사용자 사용 거부, 특정 리전 외 거부, CloudTrail 비활성화 거부, 태그 없는 리소스 생성 거부, 특정 인스턴스 타입 외 거부. SCP는 **권한 부여가 아니라 상한 제한**(Day 2 복습).

> 🎯 **통합 시나리오 B**: "조직의 모든 계정에서 (1) S3 버킷이 암호화·TLS 강제되고, (2) 누구도 CloudTrail을 끄지 못하며, (3) 위반을 자동 발견·교정하라." 답: (1) **Config Conformance Pack**으로 `s3-bucket-server-side-encryption-enabled`·`s3-bucket-ssl-requests-only` 조직 배포 + 자동 교정, (2) **SCP**로 `cloudtrail:StopLogging`·`DeleteTrail` 거부(예방), (3) Config 비준수 → EventBridge → SSM/Lambda 자동 교정(대응). 예방(SCP)·탐지(Config)·대응(자동 교정)이 조직 전체에 전파.

## 두 도메인을 잇는 정신 모델

```
[데이터 보호: 한 계정에서 옳게]        [거버넌스: 조직 전체로 강제]
KMS(envelope, 키정책) ──┐
SSE-KMS / TLS 강제      ├──► 옳은 통제  ──► SCP(예방) ─────────┐
Object Lock(WORM)       │                  Config(탐지·교정) ──┼─► 모든 계정에
RDS/EBS 암호화          ┘                  Control Tower      │   자동 전파·유지
                                           Firewall Manager ──┘
감사: CloudTrail(KMS API) + Config(설정 이력)
```

> 🔍 **더 깊이**: 데이터 보호와 거버넌스의 진짜 시험 포인트는 *drift(이탈)*다. 한 번 올바르게 암호화·잠금해도 누군가 끄거나 새 계정이 빈 상태로 생기면 통제가 무너진다. 그래서 성숙한 설계는 "설정"이 아니라 "지속 강제"다 — Control Tower가 신규 계정에 가드레일을 자동 적용하고, Config가 drift를 끊임없이 평가하며, SCP가 애초에 위반을 불가능하게 만든다. "한 번 설정"하는 답보다 "조직 차원에서 자동·지속 강제"하는 답이 Specialty의 best다.

## 한 줄 요약 체크리스트

- [ ] envelope encryption(KMS가 DEK를, DEK가 데이터를)의 원리를 설명할 수 있는가
- [ ] KMS 키 정책이 1차 권한 원천이고 Grant로 임시 위임함을 아는가
- [ ] SSE-S3/SSE-KMS/SSE-C/DSSE, CloudHSM vs KMS, custom key store를 구분하는가
- [ ] S3 Object Lock(WORM)·MFA Delete·`aws:SecureTransport`로 변조/평문을 막는가
- [ ] SCP=예방, Config=탐지·교정, Control Tower=landing zone 가드레일을 구분하는가
- [ ] Conformance Pack·Firewall Manager로 조직 전체에 통제를 강제하는가
- [ ] CloudTrail로 KMS API 사용을 감사하는가(키 삭제는 disable 후 대기)

---

## 📝 연습 문제

**문제 1.** 규제 요건상 키 자료를 조직이 단독 소유·통제하고(전용 FIPS 140-2 L3 HSM), 그 키로 S3를 암호화하며, 키 사용 내역을 감사해야 한다. 가장 적절한 조합은?

A) SSE-S3 + 기본 키 + Macie  
B) CloudHSM 기반 KMS custom key store의 CMK + S3 SSE-KMS + CloudTrail로 KMS API 감사  
C) SSE-C(고객 제공 키)만 사용  
D) AWS managed key + 자동 로테이션  

**정답: B**  
해설: 전용 단일 테넌트 FIPS 140-2 L3 HSM에서 키 자료를 단독 소유하려면 CloudHSM 기반 KMS custom key store를 쓰고, 그 CMK로 S3 SSE-KMS 암호화를 적용하며, CloudTrail로 Decrypt/GenerateDataKey 호출을 감사한다. SSE-S3는 AWS가 키를 관리해 단독 소유가 아니고, SSE-C는 키 전달·감사 통제가 약하며, AWS managed key는 키 정책 통제·전용 HSM 요건을 못 채운다.

---

**문제 2.** KMS가 대용량 S3 객체를 직접 암호화하지 않고 데이터 키를 발급하는 방식의 이름과 이유는?

A) 대칭 키 회전 — 비용 절감  
B) envelope encryption — KMS가 데이터 키(DEK)를 마스터 키로 암호화하고, 실제 데이터는 평문 DEK로 로컬 암호화해 대용량을 KMS에 보내지 않으면서도 키를 KMS가 통제  
C) client-side hashing — 무결성 확보  
D) TLS 터널링 — 전송 보호  

**정답: B**  
해설: KMS는 envelope encryption을 사용한다. GenerateDataKey가 평문 DEK와 암호화된 DEK를 반환하면, 데이터는 로컬에서 평문 DEK로 암호화하고 암호화된 DEK를 함께 저장한다. 마스터 키는 KMS를 떠나지 않으므로 대용량 전송 없이 키 통제가 가능하다. 나머지는 KMS 데이터 암호화 메커니즘과 무관하다.

---

**문제 3.** 조직의 모든 계정에서 누구도 CloudTrail을 끄지 못하게 하려 한다. 가장 효과적인 예방 통제는?

A) Config 규칙으로 사후 탐지만 한다  
B) SCP로 `cloudtrail:StopLogging`·`cloudtrail:DeleteTrail`을 Deny해 애초에 불가능하게 한다  
C) IAM 사용자마다 정책을 수동으로 붙인다  
D) GuardDuty로 모니터링한다  

**정답: B**  
해설: "애초에 못 하게" 하는 예방 통제는 SCP로 해당 API를 조직/OU 수준에서 Deny하는 것이다. Config 규칙·GuardDuty는 사후 탐지일 뿐 행위를 막지 못하고, IAM 정책 수동 부착은 다계정 규모에서 누락·드리프트가 생긴다. SCP의 명시적 Deny는 어떤 IAM Allow보다 우선해 조직 전체에 일관 강제된다.

---

**문제 4.** S3 버킷의 평문 HTTP 접근을 거부하고 TLS만 허용하려 한다. 올바른 방법은?

A) 버킷을 퍼블릭으로 설정  
B) 버킷 정책에 `aws:SecureTransport`가 false면 Deny하는 조건을 추가  
C) NACL로 80 포트를 차단  
D) SSE-KMS만 켜면 자동으로 TLS가 강제된다  

**정답: B**  
해설: 전송 중 암호화(TLS) 강제는 버킷 정책에서 `aws:SecureTransport` 조건이 false인 요청을 Deny하는 것이 표준이다. 퍼블릭 설정은 정반대이고, NACL 80 차단은 S3 엔드포인트 트래픽에 적용되지 않으며, SSE-KMS는 저장 중 암호화로 전송 중 보호(TLS)와 별개다. at-rest와 in-transit은 분리된 통제다.

---

**문제 5.** 신규로 추가되는 계정들에도 표준 가드레일(로깅·암호화·리전 제한)이 자동 적용되는 landing zone을 빠르게 구축하려 한다. 가장 적절한 서비스는?

A) 계정마다 수동으로 Config·SCP를 설정  
B) AWS Control Tower — landing zone·가드레일·계정 팩토리로 신규 계정에 통제를 자동 적용  
C) CloudFormation StackSets만 사용  
D) IAM Identity Center만 사용  

**정답: B**  
해설: Control Tower는 다계정 landing zone과 예방·탐지 가드레일, 계정 팩토리(Account Factory)를 제공해 신규 계정에 표준 통제를 자동 적용한다. 수동 설정은 드리프트·누락이 발생하고, StackSets는 배포 도구일 뿐 가드레일 프레임워크가 아니며, Identity Center는 접근 관리로 거버넌스 landing zone 전체를 대체하지 못한다.

---

**문제 6.** 실수로 KMS CMK 삭제를 요청했다가 그 키로 암호화된 데이터가 남아 있음을 알았다. 데이터 손실을 막는 올바른 조치는?

A) 즉시 새 키를 만들어 같은 ID로 교체한다  
B) 키 삭제는 7~30일 대기 기간이 있으므로, 그 기간 내에 삭제를 취소(cancel)하거나 disable로 되돌린다  
C) 데이터를 복구할 수 없으므로 포기한다  
D) IAM 정책을 수정한다  

**정답: B**  
해설: KMS 키 삭제는 즉시 일어나지 않고 7~30일의 대기 기간을 거치며, 그 안에 삭제를 취소하거나 키를 disable 상태로 두면 데이터 손실을 막을 수 있다. 키 ID는 재사용·복제할 수 없고, 대기 기간이 있으므로 즉시 포기할 필요가 없으며, IAM 정책 수정은 삭제 스케줄과 무관하다. 이 대기 기간이 실수 방지 장치다.

---
