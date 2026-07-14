# Day 4 - Secrets Manager and Parameter Store: Lifecycle and Rotation

Secrets — database passwords, API keys, TLS certificates — are the highest-stakes configuration. Wrong rotation loses audit compliance (SOC 2, PCI). Unrotated secrets lingering after employee departure. API key from GitHub public repo. AWS Secrets Manager and Parameter Store together solve secret lifecycle: **storage + versioning + rotation + audit**.

## Parameter Store vs Secrets Manager

| Aspect | Parameter Store | Secrets Manager |
|---|---|---|
| **Purpose** | Configuration values (app settings, flags) | Secrets (passwords, keys, tokens) |
| **Versioning** | Implicit, unlimited | Explicit versions, CURRENT/PREVIOUS/STAGING/AWSPENDING |
| **Rotation** | Manual or Lambda | Built-in scheduler + lambda-backed rotation |
| **Encryption** | KMS optional | KMS mandatory |
| **Pricing** | Free tier (100), then cheap | ~$0.4/secret/month + rotation call |
| **CloudTrail** | All GetParameter calls logged | All calls logged + rotation events |
| **Cost at 10k secrets** | ~$40/month | ~$4000/month + rotation |

**Operational split**: AppConfig/Parameter Store = app configuration (feature flags, endpoints, timeouts). Secrets Manager = passwords/keys (MySQL root, Datadog API key, TLS cert).

## Secrets Manager Rotation Mechanics

Rotation is **Lambda-driven state machine**. Secrets Manager doesn't directly change database password; it calls your Lambda with instructions.

1. **createSecret** → Secrets Manager creates version, labels it AWSPENDING, calls Lambda with `"Step": "create"`
2. Lambda connects to database with **old password** (AWSCURRENT), changes database password
3. Lambda updates secret's AWSPENDING version to new password
4. Secrets Manager calls Lambda again with `"Step": "finish"`, moves AWSPENDING → AWSCURRENT

Throughout, **old applications still working**: they read AWSCURRENT (old password), database accepts it. New password already in database but not yet live in secret. One application crashes during rotation = doesn't matter; old password still valid on database.

```json
{
  "ClientRequestToken": "ab123-xyz",
  "SecretId": "prod/mysql/root",
  "ClientSecret": "...(encrypted)...",
  "Step": "create",
  "SecretVersionStage": ["AWSPENDING"]
}
```

The Lambda receives the secret already decrypted (IAM + KMS permission). It decrypts, connects to target system (RDS, API service), performs rotation.

```python
def lambda_handler(event, context):
    secret_id = event['SecretId']
    client = secretsmanager_client
    
    if event['Step'] == 'create':
        # Get old secret
        old_secret = client.get_secret_value(
            SecretId=secret_id,
            VersionId=event['ClientRequestToken'],
            VersionStage='AWSCURRENT'
        )['SecretString']
        
        # Generate new password
        new_password = generate_password()
        
        # Connect to RDS with old password, change to new
        conn = mysql.connect(..., password=old_secret)
        conn.execute(f"ALTER USER 'root'@'localhost' IDENTIFIED BY '{new_password}'")
        conn.close()
        
        # Store new password in AWSPENDING version
        client.put_secret_value(
            ClientRequestToken=event['ClientRequestToken'],
            SecretId=secret_id,
            ClientSecret=new_password,
            VersionStages=['AWSPENDING']
        )
    
    elif event['Step'] == 'finish':
        # Move AWSPENDING → AWSCURRENT (Lambda just signals completion)
        client.update_secret_version_stage(
            SecretId=secret_id,
            VersionStage='AWSCURRENT',
            MoveToVersionId=event['ClientRequestToken']
        )
```

**Critical detail**: Between steps, old password is AWSCURRENT (all apps read it), new password is AWSPENDING (only new apps know it). If old app crashes mid-rotation, it reconnects, reads AWSCURRENT (old password), succeeds. Zero downtime rotation.

## Rotation Timing and Failures

```bash
aws secretsmanager rotate-secret \
  --secret-id prod/mysql/root \
  --rotation-lambda-arn arn:aws:lambda:...:rotation-function \
  --rotation-rules '{"AutomaticallyAfterDays": 30, "Duration": "2h", "ScheduleExpression": "rate(30 days)"}'
```

`AutomaticallyAfterDays: 30` = rotate every 30 days. `Duration: 2h` = complete rotation within 2 hours. If Lambda hangs > 2 hours, rotation marked FAILED, human must investigate.

Failures are common: target system unreachable, validation failed, human deleted the database user. When rotation fails, **secret remains in old state** — applications still work, but rotation is broken. CloudWatch alarm fires. On-call must fix Lambda code or target system, then re-run rotation.

> 💡 **Related Theory**: Rotation is **"backward-compatible change"** pattern. Database password rotation is hard precisely because **old apps can't instantly know new password**. Solution: label-based versioning (AWSCURRENT/AWSPENDING) + gradual cutover. Similar to DNS TTL (old TTL, new record, queries gradual migrate), or Kubernetes rolling deployment (old pods, new pods, services cut over gradually).

> 🔍 **Deeper**: Secrets Rotation at scale (10k secrets, 30-day cycle) = 333 rotations/day. If each rotation takes 30 seconds, that's 166 minutes/day (2.75 hours) of Lambda invocations, purely for rotation. Lambda pricing ≈ $400/month at scale, plus network I/O to target systems. Team must ask: "Is monthly rotation **operational value** worth the infrastructure cost?" For passwords: yes (breach risk, compliance). For API keys: maybe (less sensitive). For TLS certs: auto-rotation via ACM or external tools, not Secrets Manager (cert management is different lifecycle).

## Dynamic References and Cross-Account Rotation

CloudFormation dynamic references:

```yaml
DBInstance:
  Type: AWS::RDS::DBInstance
  Properties:
    MasterUserPassword: !Sub '{{resolve:secretsmanager:${DBSecret}:SecretString:password}}'
```

RDS consumes password from Secrets Manager. When password rotates, RDS is unaware — CloudFormation doesn't re-apply. RDS must be able to read the latest secret itself at runtime (not typical). **Better pattern**: Applications read secret, connect to RDS with secret. RDS doesn't change, but app connection credentials rotate.

Cross-account rotation: Secrets Manager in account A, RDS in account B. Rotation Lambda in A must assume role in B to access RDS. Role trust policy must allow Lambda principal from A.

## Summary

**Parameter Store** = app config (feature flags, endpoints, timeouts), cheap, optional encryption. **Secrets Manager** = passwords/keys/tokens, mandatory encryption, rotation automation, expensive. Rotation is **Lambda-driven state machine** with AWSCURRENT/AWSPENDING labels enabling zero-downtime cutover. Failures are common; human must fix and rerun. Costs scale with secret count and rotation frequency.

---

## 📝 연습 문제

**문제 1.** MySQL root 비밀번호를 30일마다 자동 교체해야 한다. 교체 중 기존 애플리케이션은 연결이 유지되어야 한다. Secrets Manager 회전 메커니즘의 핵심은?

A) 새 비밀번호로 즉시 모든 애플리케이션 업데이트 → 순간 연결 끊김
B) AWSCURRENT/AWSPENDING 라벨 기반 단계적 전환 — 회전 중에도 앱은 AWSCURRENT(구 비밀번호)로 연결, 회전 완료 후 AWSCURRENT 라벨 이동
C) 회전 중 모든 연결 일시 차단
D) 새 비밀번호 설정 후 애플리케이션이 주기적으로 재연결

**정답: B**

해설: Secrets Manager 회전의 핵심은 라벨. 회전 중 AWSCURRENT는 구 비밀번호, AWSPENDING은 신 비밀번호를 가리킨다. 애플리케이션은 AWSCURRENT만 읽으므로 회전 도중에도 구 비밀번호로 계속 연결된다. 회전 완료(Lambda finish 단계) 후 AWSCURRENT 라벨이 신 비밀번호 버전으로 이동하면, 다음 애플리케이션 재시작 시 신 비밀번호를 읽는다. 무중단 교체의 핵심.

---

**문제 2.** Secrets Manager 회전 Lambda가 2시간 이내에 완료되지 않으면?

A) 자동으로 이전 비밀번호로 롤백
B) 회전 상태가 FAILED로 표시, 시크릿은 구 상태 유지, 운영자 수동 개입 필요
C) 애플리케이션 자동 차단
D) 신 비밀번호 강제 적용

**정답: B**

해설: Duration 제한 초과 시 회전은 FAILED 상태. 시크릿은 원래대로 유지되므로 애플리케이션은 계속 동작하지만 회전이 깨진 상태. 운영자는 Lambda 로그를 확인해 실패 원인(DB 접근 불가, 검증 실패 등)을 파악하고 수정 후 재시도해야 한다. 롤백(A)은 이미 DB 시스템 측에서 변경된 상태 가능하므로 자동 롤백 불가, 강제 적용(D)은 없음.

---

**문제 3.** 10,000개의 애플리케이션 설정 값(데이터베이스 엔드포인트, 타임아웃, 피쳐 플래그)을 관리하고 1년에 한두 번만 변경된다. 비용 최적화 방안은?

A) 모두 Secrets Manager 사용 (월 $4,000)
B) Parameter Store 사용 (월 ~$40)
C) 모두 환경 변수로 컨테이너에 굽기
D) DynamoDB에 저장

**정답: B**

해설: 이들은 암호가 아니라 설정 값이므로 Parameter Store가 적합. 무료 티어 100개까지 포함되고 초과 시에도 매우 저렴. 회전 불필요하므로 Secrets Manager 비용의 100배 절감. 환경 변수 굽기(C)는 변경 시 컨테이너 재배포 필요, 동적 변경 불가능. 대규모에서 Parameter Store는 필수 패턴.

---

**문제 4.** CloudFormation RDS 리소스가 Secrets Manager의 비밀번호 동적 참조를 사용 중이고, 회전이 발생했다. RDS 마스터 사용자 비밀번호는 자동 업데이트되나?

A) 동적 참조 덕분에 자동으로 최신 비밀번호 적용
B) 아니다. CloudFormation은 배포 시점에만 참조를 해석하고, 회전 후 RDS를 직접 업데이트하지 않음. RDS는 여전히 회전 전 비밀번호를 가짐
C) RDS 자체가 Secrets Manager 폴링해 자동 동기화
D) 매일 스택 업데이트 실행 필요

**정답: B**

해설: 동적 참조는 CloudFormation **배포 시점**에만 해석된다. 스택 생성 시 AWSCURRENT 비밀번호를 읽어 RDS MasterUserPassword에 넣는다. 회전이 발생해도 CloudFormation은 다시 실행되지 않으므로 RDS의 저장된 비밀번호는 그대로다. 올바른 패턴: 애플리케이션이 런타임에 Secrets Manager를 폴링해 최신 비밀번호를 읽고 연결한다. RDS 마스터 비밀번호는 회전 불가능 — 데이터베이스 자체는 원래 비밀번호를 유지하고, 앱 연결 비밀번호만 회전 가능.

---

**문제 5.** Secrets Manager 비밀번호 회전 Lambda가 교차 계정으로 계정 B의 RDS에 접근해야 한다. 필수 권한 설정은?

A) Lambda 실행 역할에 계정 B의 RDS 권한을 직접 부여
B) Lambda 실행 역할이 계정 B의 크로스 계정 역할을 assume하고, 그 역할이 RDS 권한 보유. 계정 B의 역할 신뢰 정책이 계정 A Lambda 주체를 명시적으로 허용
C) 근본적으로 불가능 (같은 계정만 가능)
D) API 키로 인증

**정답: B**

해설: 크로스 계정 접근의 표준 패턴. Lambda 역할(A)이 B 계정의 역할을 AssumeRole하려면 B의 신뢰 정책이 A를 명시해야 한다. 디버깅 팁: 403 Access Denied 나오면 assume role 중 실패한 경우가 대부분. 신뢰 정책에 Lambda 주체가 빠졌는지 확인.

---

**문제 6.** 새 TLS 인증서를 Secrets Manager에 저장하고 ALB가 매달 자동 갱신된 인증서를 사용하도록 구현하려면?

A) Secrets Manager 회전 Lambda 작성 → ALB는 동적 참조 사용
B) AWS Certificate Manager(ACM)를 사용, 자동 갱신 및 ALB 직접 연결 (Secrets Manager 불필요)
C) 매달 ALB 수동 업데이트
D) ALB에 여러 인증서 업로드

**정답: B**

해설: TLS 인증서 관리는 ACM이 전문가. ACM은 자동 갱신 + 만료 추적 + ALB 직접 바인딩을 제공한다. Secrets Manager는 민감 데이터(비밀번호·API 키) 관리 목적. 인증서 관리를 ACM에 맡기는 게 운영 단순. ACM 외부 인증서는 AWS 외에서 갱신하고 수동 업로드 필요 (D의 복잡성).

---

**문제 7.** 30일마다 API 키 회전을 자동화해야 한다. Parameter Store와 Secrets Manager 중 어느 것이 더 적합하고 왜?

A) Parameter Store, 비용 절감
B) Secrets Manager, API 키는 민감 정보 + 자동 회전 기능 내장 + CloudTrail 상세 감사 로깅
C) 둘 다 같음
D) 수동 관리

**정답: B**

해설: API 키는 민감 정보로 Secrets Manager 범주. 회전은 1회성이 아니라 주기적 요구사항이므로 자동 회전 기능이 있는 Secrets Manager가 표준. 비용($0.4/월)은 회전의 운영 가치 대비 저렴. Parameter Store로 구현하려면 Lambda를 직접 작성해야 하고 감사 기능도 약하다.

---

## 📌 오늘의 요약

Secrets Manager는 회전(rotation) 능력과 라벨 기반 버전 관리로 설계되었다. AWSCURRENT/AWSPENDING 이원성이 **무중단 교체**를 가능하게 한다. Parameter Store는 싸고 간단하지만 회전이 없고 암호 관리 기능이 약하다. 1000+ 시크릿 규모에서 Secrets Manager의 자동 회전이 감사 준수(SOC 2, PCI) 비용 대비 효과를 발휘한다.
