# Day 2 - 도메인 3·4 통합 복습: 인프라 보안 ↔ 자격 증명·액세스 관리

도메인 3(인프라 보안, ~20%)과 도메인 4(IAM, ~16%)는 시험에서 가장 점수 비중이 큰 묶음이다. 둘의 관계는 명확하다 — **인프라 보안은 "어디로 갈 수 있는가(네트워크 경로)"를, IAM은 "무엇을 할 수 있는가(권한)"를** 통제한다. Specialty 답안은 거의 항상 *"네트워크 경계로 막고, 최소 권한 IAM으로 다시 막는다"*는 이중 통제를 요구한다. 오늘은 이 두 차원을 하나의 접근 통제 모델로 묶는다.

## 인프라 보안: 네트워크 경로 통제의 계층

| 통제 | 상태성 | 적용 단위 | 핵심 특징 |
|------|--------|-----------|-----------|
| Security Group | stateful | ENI/인스턴스 | 허용 규칙만. 응답 자동 허용 |
| NACL | stateless | 서브넷 | 허용+거부. 인/아웃 별도. 응답 포트 명시 |
| VPC Endpoint (Gateway) | — | S3/DynamoDB | 라우팅 테이블. 무료 |
| VPC Endpoint (Interface/PrivateLink) | — | 대부분 서비스 | ENI+프라이빗 IP. SG로 통제 |
| Network Firewall | stateful | inspection VPC | IPS·도메인·Suricata |

> 💡 **관련 이론**: SG는 stateful이라 인바운드를 허용하면 응답이 자동으로 나간다. NACL은 stateless라 인바운드 허용과 *아웃바운드 임시 포트(1024-65535)* 허용을 모두 명시해야 한다. 이 비대칭이 NACL 트러블슈팅 단골이다. 또한 NACL은 *명시적 거부*가 가능해 특정 IP 차단(blacklist)에 쓰이고, SG는 거부 규칙이 없어 화이트리스트만 가능하다. "특정 악성 IP를 서브넷 전체에서 차단" → NACL deny.

### 프라이빗 연결의 정석

퍼블릭 인터넷을 거치지 않고 AWS 서비스·다른 VPC에 접근하는 패턴:
- **S3/DynamoDB** → Gateway Endpoint(라우팅, 무료). 엔드포인트 정책으로 접근 버킷 제한.
- **그 외 AWS 서비스·내 SaaS** → Interface Endpoint(PrivateLink). 프라이빗 IP로 노출.
- **온프레미스 ↔ VPC** → Site-to-Site VPN(IPsec) 또는 Direct Connect(+VPN으로 암호화).
- **VPC ↔ VPC** → Peering(전이 불가) 또는 Transit Gateway(허브, 전이 가능).

핵심 함정: **VPC Endpoint를 만들어도 IAM/엔드포인트 정책이 허용해야 통신**한다. 그리고 엔드포인트 정책의 `aws:SourceVpce`·`aws:SourceVpc` 조건으로 S3 버킷이 *특정 VPC에서만* 접근되게 잠글 수 있다 — 데이터 유출(exfiltration) 방지의 핵심.

## IAM: 권한 평가의 논리

IAM 정책 평가는 시험에서 가장 정밀하게 묻는 영역이다. 평가 순서를 외워야 한다:

1. **명시적 Deny** → 어디든 하나라도 있으면 **즉시 거부**(최우선).
2. **SCP**(Organizations) → 권한의 *상한선(guardrail)*. SCP가 허용 안 하면 IAM Allow가 있어도 거부.
3. **Resource-based / Identity-based Allow** → 둘 중 하나라도 허용하면(교차 계정은 양쪽 필요) 허용.
4. **Permission Boundary** → 개별 사용자/역할의 *최대 권한* 제한.
5. 명시적 Allow 없으면 → **암묵적 거부**(기본).

> 💡 **관련 이론**: 핵심 정신 모델은 *"권한 = (Identity ∪ Resource Allow) ∩ SCP ∩ Permission Boundary − 모든 Deny"*. SCP와 Permission Boundary는 권한을 *부여하지 않는다* — 오직 상한선을 *제한*만 한다. 실제 권한은 여전히 identity/resource 정책이 부여해야 한다. "SCP를 붙였는데 왜 권한이 안 생기나" 같은 오해는 여기서 나온다.

### 교차 계정·임시 자격증명

- **AssumeRole**: 역할의 trust policy(누가 맡을 수 있나) + permission policy(맡으면 뭘 하나)를 분리. STS가 임시 키 발급.
- **External ID**: 서드파티가 내 역할을 맡을 때 *confused deputy* 방지.
- **Roles Anywhere**: 온프레미스 워크로드가 X.509 인증서로 IAM 역할 사용.
- **IAM Identity Center(SSO)**: 다계정·SAML/OIDC 페더레이션의 현행 권장. permission set으로 다계정 접근 중앙 관리.
- **Cognito**: 앱 사용자(end-user) 인증. Identity Pool로 임시 AWS 자격증명 부여.

> ⚠️ **자주 틀리는 구분**: 
> - **IAM 역할 = 직원·워크로드**(페더레이션/AssumeRole). **Cognito = 앱 사용자**. 혼동 금지.
> - **장기 액세스 키를 절대 인스턴스에 두지 말 것** → EC2는 *인스턴스 프로파일(역할)*, EKS는 *IRSA/Pod Identity*, Lambda는 *실행 역할*.
> - **SCP는 권한을 주지 않는다** — 상한만 제한.

> 🎯 **통합 시나리오 A**: "프라이빗 서브넷의 EC2가 특정 S3 버킷에만, 인터넷을 거치지 않고 접근해야 한다. 자격증명은 하드코딩 금지." 답: (1) **인프라 차원** — Gateway VPC Endpoint(S3) + 엔드포인트 정책으로 그 버킷만 허용 + 버킷 정책에 `aws:SourceVpce` 조건으로 그 엔드포인트에서만 접근. (2) **IAM 차원** — EC2 인스턴스 프로파일(역할)에 해당 버킷 GetObject만 부여. 네트워크 경로(endpoint)와 권한(역할)이 *동시에* 만족해야 통신. 두 도메인의 협력.

## 시크릿·키 관리(IAM의 연장)

자격증명·시크릿을 안전하게 다루는 것도 도메인 4의 영역:
- **Secrets Manager**: DB 자격증명 등 *자동 로테이션* 필요한 시크릿. Lambda 로테이터.
- **SSM Parameter Store**: 설정값·시크릿(SecureString). 로테이션 없음, 무료 티어.
- **인스턴스에 키 박지 말 것**: 역할 + 임시 자격증명이 정답.

> 🎯 **통합 시나리오 B**: "서드파티 모니터링 SaaS에 내 계정 읽기 권한을 주되, 그들이 내 역할을 안전하게만 맡게 하라." 답: 교차 계정 IAM 역할 생성 → trust policy에 그 SaaS 계정 Principal + **External ID** 조건. permission policy는 읽기 전용 최소 권한. 장기 키 공유 대신 AssumeRole로 임시 자격증명. External ID가 confused deputy 공격을 막는다.

## 두 도메인을 잇는 정신 모델

```
요청 도달 가능?  ──► [인프라: SG/NACL/Endpoint/라우팅]  ── 네트워크 경로 통과
       │
       ▼ (경로 OK)
요청 권한 있나?  ──► [IAM: Deny → SCP → Allow → Boundary]  ── 권한 평가 통과
       │
       ▼ (둘 다 OK)
        실제 동작 허용
```

> 🔍 **더 깊이**: 시험의 "best" 답이 항상 두 계층을 동시에 거는 이유는 *defense in depth*다. SG만으로 막으면 SG가 잘못 열렸을 때 무방비고, IAM만으로 막으면 네트워크 정찰을 허용한다. 데이터 유출 방지의 정점은 세 겹 — VPC Endpoint(경로 제한) + 엔드포인트/버킷 정책(`aws:SourceVpce` 조건) + IAM 최소 권한. 한 겹이 뚫려도 나머지가 막는다. Specialty는 "어느 하나"가 아니라 "이 조합"을 고르게 한다.

## 한 줄 요약 체크리스트

- [ ] SG=stateful/허용만, NACL=stateless/허용+거부의 차이와 NACL 임시 포트를 아는가
- [ ] 프라이빗 접근에 Gateway(S3/DDB) vs Interface(PrivateLink) Endpoint를 구분하는가
- [ ] `aws:SourceVpce`/`aws:SourceVpc` 조건으로 데이터 유출을 막는 패턴을 아는가
- [ ] IAM 평가 순서(Deny→SCP→Allow→Boundary)를 외웠는가
- [ ] SCP·Permission Boundary는 권한을 *제한*만 하고 부여하지 않음을 아는가
- [ ] 워크로드 자격증명=역할(인스턴스 프로파일/IRSA/실행 역할), 키 하드코딩 금지를 지키는가
- [ ] 교차 계정=AssumeRole+trust policy(+External ID), 앱 사용자=Cognito를 구분하는가

---

## 📝 연습 문제

**문제 1.** 프라이빗 서브넷의 EC2가 인터넷을 경유하지 않고 특정 S3 버킷에만 접근해야 하며, 자격증명 하드코딩은 금지다. 가장 적절한 설계는?

A) NAT Gateway로 인터넷 경유 후 액세스 키를 EC2에 저장  
B) S3 Gateway VPC Endpoint(엔드포인트 정책으로 해당 버킷만) + 버킷 정책 `aws:SourceVpce` 조건 + EC2 인스턴스 프로파일(역할)에 최소 권한  
C) 퍼블릭 서브넷으로 옮기고 보안 그룹만 잠근다  
D) IAM 사용자 액세스 키를 환경 변수로 주입  

**정답: B**  
해설: 인터넷 비경유 프라이빗 접근은 S3 Gateway Endpoint(라우팅 기반·무료)로 처리하고, 엔드포인트 정책으로 대상 버킷을 제한하며, 버킷 정책의 `aws:SourceVpce` 조건으로 그 엔드포인트에서만 접근하게 잠근다. 자격증명은 인스턴스 프로파일(역할)로 임시 발급해 하드코딩을 없앤다. NAT 경유·퍼블릭 이전은 인터넷을 거치고, 액세스 키 저장/주입은 하드코딩 금지 요구를 위반한다.

---

**문제 2.** Organizations에서 SCP로 특정 리전 외 모든 서비스를 거부했는데, 한 계정의 관리자가 자신에게 IAM full-admin 정책을 붙여도 그 리전에서 동작하지 못한다. 이유는?

A) IAM 정책이 손상됐다  
B) SCP는 권한 상한선(guardrail)이므로, SCP가 허용하지 않으면 IAM Allow가 있어도 거부된다  
C) Permission Boundary가 자동 적용됐다  
D) STS 토큰이 만료됐다  

**정답: B**  
해설: IAM 평가에서 SCP는 계정 내 모든 주체의 권한 상한을 정하는 guardrail이다. SCP가 해당 리전을 거부하면 IAM identity 정책이 full-admin이어도 실제 권한은 교집합으로 제한되어 거부된다. 정책 손상이나 토큰 만료가 아니며, Permission Boundary는 자동 적용되지 않는다. SCP는 권한을 부여하지 않고 제한만 한다는 원칙의 직접 사례다.

---

**문제 3.** 서드파티 SaaS가 고객 계정의 리소스를 읽도록 교차 계정 접근을 부여할 때, confused deputy 공격을 방지하는 권장 메커니즘은?

A) SaaS에 IAM 사용자 액세스 키를 발급  
B) 교차 계정 역할의 trust policy에 SaaS 계정 Principal과 함께 External ID 조건을 추가  
C) 버킷을 퍼블릭으로 공개  
D) Security Group으로 SaaS IP를 허용  

**정답: B**  
해설: 교차 계정 역할 위임 시 trust policy에 External ID 조건을 추가하면, 공격자가 다른 고객 컨텍스트로 역할을 가로채는 confused deputy를 방지한다. 장기 액세스 키 공유는 안티패턴이고, 버킷 공개는 보안을 무너뜨리며, Security Group은 네트워크 통제일 뿐 교차 계정 권한 위임 메커니즘이 아니다.

---

**문제 4.** 특정 악성 IP 대역을 서브넷 전체에서 차단해야 한다. 보안 그룹으로는 불가능했던 이유와 올바른 통제는?

A) 보안 그룹에는 명시적 거부 규칙이 없어 화이트리스트만 가능 — 서브넷 단위 명시적 deny가 가능한 NACL을 사용  
B) 보안 그룹이 stateless여서  
C) NACL은 인스턴스 단위라 부적합하므로 보안 그룹 유지  
D) 라우팅 테이블에서 IP를 차단  

**정답: A**  
해설: 보안 그룹은 허용 규칙만 가지므로 특정 IP를 거부할 수 없다(화이트리스트 모델). 서브넷 단위에서 명시적 deny가 가능한 NACL이 IP 블랙리스트에 적합하다. 보안 그룹은 stateful이고, NACL은 인스턴스가 아닌 서브넷 단위이며, 라우팅 테이블은 출발지 IP 기준 차단 도구가 아니다.

---

**문제 5.** 다음 워크로드 유형과 권장 자격증명 메커니즘의 연결 중 잘못된 것은?

A) EC2 애플리케이션 → 인스턴스 프로파일(IAM 역할)  
B) EKS 파드 → IRSA / Pod Identity(서비스 계정 ↔ IAM 역할)  
C) 모바일 앱 최종 사용자 → IAM 사용자 액세스 키를 앱에 내장  
D) 온프레미스 서버 → IAM Roles Anywhere(X.509 인증서)  

**정답: C**  
해설: 모바일 앱 최종 사용자에게 IAM 사용자 액세스 키를 내장하는 것은 심각한 안티패턴으로, Cognito Identity Pool을 통해 임시·범위 제한 AWS 자격증명을 부여해야 한다. EC2=인스턴스 프로파일, EKS=IRSA/Pod Identity, 온프레미스=Roles Anywhere는 모두 장기 키를 피하는 올바른 매핑이다.

---

**문제 6.** NACL을 새로 구성해 인바운드 HTTPS(443)를 허용했는데, 응답 트래픽이 클라이언트에 도달하지 못한다. 가장 가능성 높은 원인은?

A) 보안 그룹이 잘못됐다  
B) NACL은 stateless이므로 아웃바운드 임시 포트(1024-65535) 허용 규칙을 별도로 추가해야 한다  
C) 라우팅 테이블에 인터넷 게이트웨이가 없다  
D) DNS 해석이 실패했다  

**정답: B**  
해설: NACL은 stateless라 인바운드 허용만으로는 부족하고, 응답이 나가는 아웃바운드 임시 포트(ephemeral, 1024-65535) 범위를 명시적으로 허용해야 한다. 보안 그룹은 stateful이라 이 문제를 일으키지 않으며, 증상(응답만 막힘)은 라우팅 부재나 DNS 실패의 전형이 아니다. NACL 임시 포트 누락은 전형적인 함정이다.

---
