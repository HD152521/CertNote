# Day 1 - KMS Deep Dive: Mathematics of Envelope Encryption, Key Policy Authorization Model, Multi-Region Keys

There is a fundamental contradiction that engineers encounter when designing encryption for the first time. "To encrypt data, I need a key, but where do I safely store that key?" Storing the key in plaintext next to the data makes encryption meaningless, and having people memorize keys and input them manually is impractical. This "key protecting the key" problem (key management problem) has been a decades-old challenge in cryptography, and the cloud solves it using **hardware-based root keys + envelope encryption** architecture. AWS KMS (Key Management Service) is exactly this architecture provided as a managed service.

In the SAP-C02 exam, KMS appears as architectural decision questions: "Which key type should I choose?", "What happens when Key Policy and IAM permissions conflict?", "How do I design Cross-Account and Cross-Region decryption?", "If compliance requires FIPS 140-2 Level 3, what should I use?" Today we'll decompose KMS's internal operations down to the mathematics of envelope encryption, clarify the subtle pitfalls in the authorization model, and organize DR design with multi-region keys.

## Envelope Encryption — Why KMS Doesn't Encrypt Your Data Directly

The most common misconception is that "KMS encrypts my data." In fact, KMS does **not** directly encrypt large data (multi-GB S3 objects, EBS volumes). The KMS `Encrypt` API accepts a maximum of 4KB. So how is massive data encrypted? The answer is **envelope encryption**.

The flow works like this. When you call `GenerateDataKey` on KMS to encrypt data, KMS returns two things: (1) **Plaintext Data Key (plaintext DEK)** — an AES-256 key that actually encrypts the data, (2) **Encrypted Data Key (encrypted DEK)** — that DEK wrapped with your KMS master key (CMK). The application rapidly encrypts data locally using the plaintext DEK, then **immediately discards the plaintext DEK from memory**, and stores only the encrypted DEK next to the encrypted data.

```
[Encryption]
GenerateDataKey(CMK) → Plaintext DEK + Encrypted DEK
   ↓
Data ← Encrypt locally with plaintext DEK (AES-256)
   ↓
Store: [Encrypted Data] + [Encrypted DEK]   ← Plaintext DEK discarded immediately

[Decryption]
Encrypted DEK → KMS Decrypt(CMK) → Plaintext DEK
   ↓
Encrypted Data ← Decrypt locally with plaintext DEK
```

The key principle of this architecture is "the master key (CMK) never leaves the KMS hardware." The CMK exists only within the HSM, and when `Encrypt`/`Decrypt` requests arrive, computation happens only inside the HSM with no plaintext keys leaving. Only the DEK that actually encrypts data is briefly exposed in plaintext and then disappears.

> 💡 **Related Theory**: Why split it into two stages? Three reasons work across mathematics and operations. First **performance** — symmetric encryption (AES) is fast, but KMS round trips (network calls) are slow. Sending GB-sized data to KMS in 4KB chunks would require millions of round trips. Receiving the DEK once and encrypting locally reduces network round trips to one. Second **efficiency of key rotation** — even if you replace the master key, you don't need to re-encrypt the data itself; you just need to re-wrap the "encrypted DEK" (re-wrap). You can rotate keys on petabytes of data without re-encrypting. Third **isolation** — the plaintext master key is never exposed to application memory, so even memory dump attacks cannot compromise the master key. This pattern is essentially the same idea as PGP's session key structure and TLS's key exchange — slow and secure asymmetric/master keys protect fast symmetric session keys.

> 🔍 **Deeper**: DEK caching (`aws-encryption-sdk`'s data key caching) takes envelope encryption's performance one step further. Calling `GenerateDataKey` for every object incurs KMS API call costs ($0.03/10,000 calls) and latency. AWS Encryption SDK reuses a single DEK within configured limits of iterations, bytes, and time, reducing KMS calls. However, there is a security trade-off — if you reuse the same DEK too long or too much, the impact scope grows if that DEK is compromised. NIST SP 800-38D recommends capping the data volume encrypted with a single key (GCM mode's nonce reuse risk), and the cache limit is a balance point between that recommendation and cost.

## KMS Key Types — A Spectrum of Ownership and Control

| Type | Key Ownership/Generation | Auto Rotation | Policy Control | Typical Use |
|------|-------------|--------------|-----------|------------|
| **AWS Owned Key** | AWS (shared) | AWS auto | None (invisible) | Service default encryption |
| **AWS Managed Key** (`aws/service`) | AWS (per account) | 1 year auto (enforced) | Limited | Service integration default |
| **Customer Managed Key (CMK)** | Customer | 1 year when enabled | Full control | Policy, audit, rotation control |
| **Imported Key Material (BYOK)** | Customer (externally created) | **Not possible** | Full control | Key source control, compliance |
| **Custom Key Store (CloudHSM)** | Customer (dedicated HSM) | Possible | Full control | FIPS 140-2 L3, single tenant |

The difference between three key types becomes clear when viewed as a "spectrum of control." AWS Owned is invisible to you (no key ID), AWS Managed is visible but you can barely touch policies, and CMK gives you complete control over key policy, rotation, deletion, and tags. In the exam, when you see "must directly control key policy," "must control rotation frequency," or "must audit key usage with CloudTrail," the answer is almost always **CMK**.

> 🔍 **Deeper**: AWS Managed Key and Customer Managed Key have different cost structures. AWS Managed Key has no monthly maintenance fee, only API call costs. CMK costs **$1 per month per key** storage + API call costs. So building multi-tenancy with a separate CMK per tenant becomes a cost bomb. In that case, using **one CMK + per-tenant DEK** (envelope encryption) or **Encryption Context** for logical isolation is the standard pattern. When the SAP exam shows "thousands of tenant isolation + cost," "separate CMK per tenant" is a trap, and "shared CMK + context isolation" is often the correct answer.

> 📚 **Case Study**: A fintech company was required by regulations: "Key material must be generated by us, and AWS must never permanently retain it." The solution was **BYOK (Imported Key Material)** — they generated keys in their on-premises HSM and imported them into KMS. The trade-offs were clear. Advantages: complete control over key origin, and imported keys can be set with an expiration date so KMS only caches them and deletes them on expiration. Disadvantages: **automatic rotation is not possible**, so every rotation requires manually generating and importing a new key, and if KMS loses the key (region failure etc), recovery is only possible by re-importing from the on-premises HSM. Lesson: BYOK is a trade — you gain control but give up operational ease and automatic rotation. In the exam, if you see "externally generated key + expiration setting," it's Imported; if it simultaneously requires "automatic rotation," that's a contradiction so that choice is wrong.

## Authorization Model — Key Policy, IAM, and Grant's Triple Check

KMS permissions are confusing because the authorization evaluation order differs from typical AWS services. Most services grant access with just IAM Policy. However, KMS makes **Key Policy the root of all permissions**. The Key Policy attached to each key is the final authority on "who can access this key," and IAM Policy only takes effect when Key Policy explicitly delegates it.

Permissions are granted through three mechanisms:

1. **Key Policy** (mandatory, root) — a resource-based policy attached to the key itself. The default Key Policy typically includes one line granting `kms:*` to the account root (`arn:aws:iam::123456789012:root`), which means "delegate to IAM."
2. **IAM Policy** — a policy attached to the caller (role, user). **Only effective if Key Policy allows IAM delegation**.
3. **Grant** — temporary, fine-grained, revocable delegation. Automatically created when AWS services use your key on your behalf (e.g., EBS encrypting volumes), and immediately revocable via `RetireGrant`/`RevokeGrant`.

The key pitfall is the misconception that **"IAM Policy alone can grant KMS permissions."** If there is no "delegate to account root" line in Key Policy, then even if IAM allows `kms:Decrypt`, it will be denied. Conversely, if Key Policy directly permits a specific role, it works without IAM policies.

> 💡 **Related Theory**: KMS's model implements the security principle of **fail-safe defaults**. One of the eight security design principles documented by Saltzer and Schroeder in 1975, it states "access must be based on explicit permission, not explicit denial (default is deny)." KMS establishes Key Policy as a single source of authority so "no IAM administrator can bypass the key owner's intent." This design shines in Cross-Account scenarios — for another account to use your key, (1) your Key Policy must explicitly permit that account, and (2) that account's IAM must grant the role permission. **Both** must allow it, so if one account admin accidentally opens permissions, the other blocks it (defense in depth).

> ⚠️ **Trap**: In scenarios like "Lambda function should decrypt with KMS," choosing "just grant `kms:Decrypt` to Lambda's execution role IAM" is **incomplete (possibly wrong answer)**. If Key Policy has no account root delegation, IAM permission is ineffective. The correct setup is (1) Key Policy contains `Principal: {AWS: "arn:...:root"}` + `Action: kms:*` delegation, and (2) Lambda role IAM grants `kms:Decrypt`. The exam often has "IAM-only without Key Policy modification" as a trap.

> 🔍 **Deeper**: The choice between **Grant vs Key Policy modification** depends on "change frequency, granularity, and automation." Key Policy has a 32KB size limit per key, requires `PutKeyPolicy` permission to modify, and changes are audited. With hundreds of short-lived delegations in Key Policy, you'd quickly exceed limits and management becomes impossible. **Grant** is the mechanism for this — it can be created/revoked programmatically, fine-grained to specific operations (`Encrypt` only, etc.), takes immediate effect via `GrantToken` (no policy propagation delay), and automatically revoked when done via `RetireGrant`. AWS service integrations (EBS, RDS, Redshift, etc.) use Grants internally for this reason. In the exam, "service temporarily uses key then immediately revokes" or "fine-grained temporary delegation" means Grant is the answer.

## Key Rotation — Auto, Manual, and BYOK Differences

Key rotation stems from the premise that older keys accumulate exposure risk. KMS rotation has three variants:

- **Automatic Rotation**: When enabled on a symmetric CMK, KMS generates new key material every **1 year (365 days)**. Importantly — **the key ID and ARN remain the same**; only the internal backing key is replaced. So your application needs no changes, and past data automatically decrypts with past key versions (KMS keeps all versions). Starting in 2022, you can set the auto rotation period to anywhere from 90 days to 2560 days.
- **Manual Rotation**: Create a completely new key and **move the alias to the new key**. The key ID changes, so past data encrypts with the old key and new data with the new key. Used when automatic rotation is unavailable, like with BYOK or asymmetric keys.
- **Imported Key (BYOK)**: Automatic rotation **not possible**. To rotate, you must generate new key material and re-import.

> 💡 **Related Theory**: The "key ID stays the same, backing key changes" design of automatic rotation is operationally decisive because it interacts with envelope encryption. Data itself is encrypted with the DEK, and the DEK is wrapped with the CMK. Even when CMK rotates, the "encrypted DEK" from the past is decrypted with the past CMK version (KMS keeps all versions), and newly created DEK is only wrapped with the new CMK version. That is, **data is never re-encrypted**. This is why key rotation is nearly transparent and cost-free even at petabyte scale.

> ⚠️ **Trap**: "Does key deletion happen immediately?" — **No**. KMS key deletion (`ScheduleKeyDeletion`) enforces a minimum **7 days to maximum 30 days** waiting period (PendingDeletion). During this time, the key is inactive but recoverable via `CancelKeyDeletion`. The reason: deleting a key makes **all data encrypted with that key permanently unrecoverable**, so a mandatory grace period prevents mistakes. The exam frequently tests "immediate key deletion" is impossible and that the 7-30 day grace period is the correct answer.

## Multi-Region Key — A Game Changer for Cross-Region DR

By default, KMS keys are **region-specific**. If you encrypt data with a key made in us-east-1 and want to decrypt it in ap-northeast-2, you had to call us-east-1 KMS every time (Cross-Region latency and dependency) or re-encrypt the data. **Multi-Region Key (MRK)**, released in 2021, solves this.

MRK replicates the same key material across multiple regions. You create a Primary key and use `replicate-key` to create a Replica in another region; both keys share identical key material. Critically — **they share the same key ID** (`mrk-` prefix + same suffix). So ciphertext encrypted in us-east-1 can be **directly decrypted by the Replica key in ap-northeast-2 without additional calls**. In DR scenarios, you can copy RDS snapshots and S3 objects to another region and immediately decrypt without extra steps.

Each region's MRK has **independent Key Policy, Grants, and rotation state**. That is, key material is shared but permissions are managed separately per region (satisfying data sovereignty and regional access control requirements).

```
[us-east-1: MRK Primary]  ──Encrypt──▶  ciphertext
        │ replicate-key
        ▼
[ap-northeast-2: MRK Replica]  ──Direct Decryption──▶  Plaintext
   (No Cross-Region KMS call needed, same key ID)
```

> 🔍 **Deeper**: MRK tempts you to "make every key multi-region," but AWS **recommends single-region keys by default**. Reason: MRK replicates key material across regions, so the **attack surface widens**, and key synchronization across regions adds complexity. Also, once created as MRK, you cannot revert to single-region. Therefore, MRK should be selectively used only for data **truly requiring Cross-Region decryption** (DR targets, globally replicated data). In the exam, "Cross-Region DR + decrypt with same key" means MRK; simple single-region encryption means regular CMK.

> 🎯 **Scenario**: "Copy an encrypted RDS snapshot from us-east-1 to ap-northeast-2 to build a DR standby, and on failover, restore immediately without additional KMS calls or re-encrypt. Also, the two regions' key access permissions should be controlled separately." → **Multi-Region Key**. Encrypt the snapshot with Primary (us-east-1) and create Replica (ap-northeast-2), then after copying the snapshot, you can directly decrypt and restore with the Replica key. Region-specific Key Policies keep access control separated. A regular CMK is region-specific so Cross-Region decryption needs extra calls; BYOK cannot be auto-rotated and has no replication mechanism.

## CloudHSM and Custom Key Store — When FIPS 140-2 Level 3 Is Required

KMS's multi-tenant HSM satisfies **FIPS 140-2 Level 2 (some Level 3 validation)**. However, some regulations (finance, government) require **single-tenant dedicated HSM + FIPS 140-2 Level 3**. In this case, you use **CloudHSM** (dedicated HSM cluster) or KMS's **Custom Key Store** feature to connect a CloudHSM cluster as KMS's backend.

| Item | KMS (Default) | CloudHSM |
|------|-----------|----------|
| Tenancy | Multi-tenant | Single-tenant dedicated |
| FIPS 140-2 | Level 2/3 | **Level 3** |
| Key Control | AWS-managed API | Customer directly controls HSM |
| Additional Use | Encrypt/decrypt | SSL offload, Oracle TDE, custom crypto operations |
| Operational Burden | 0 (fully managed) | Cluster, user, backup management required |

Custom Key Store combines "KMS's convenient API + CloudHSM's single-tenant isolation" — you call KMS API for keys, but the actual key material exists only in your dedicated CloudHSM cluster.

> 📚 **Case Study**: A payment company was required by PCI DSS and local financial regulations: "Encryption keys must be generated and stored only in single-tenant HSM, FIPS 140-2 Level 3 certification mandatory." Pure KMS is multi-tenant so it fell short. Solution: **KMS Custom Key Store + CloudHSM cluster** — the development team could use the familiar KMS API (`Encrypt`/`Decrypt`) as usual, while the actual keys existed only in the dedicated CloudHSM. Trade-off: the operational burden of CloudHSM cluster management (hourly billing, multi-AZ HA setup, user and backup management) was added. Lesson: choose CloudHSM only when there's explicit compliance requiring "single-tenant + FIPS L3" — without that requirement, KMS's zero operational burden is almost always better.

## Summary

KMS's core is solving the "key protecting the key" problem with **envelope encryption (master key never leaves HSM, fast DEK encrypts data) + triple authorization check (Key Policy root + IAM delegation + Grant temporary) + multi-region replication (DR)**. Master keys (CMK) are never exposed in plaintext, data is rapidly encrypted locally with DEK, and key rotation happens without data re-encryption.

Common SAP exam mappings: (1) "direct control over key policy, rotation, audit" → **CMK**, (2) "externally generated key + expiration + no auto rotation" → **Imported (BYOK)**, (3) "Cross-Region same-key decryption + DR" → **MRK**, (4) "single-tenant + FIPS 140-2 L3" → **CloudHSM / Custom Key Store**, (5) "KMS permissions via IAM only" → wrong (Key Policy delegation required), (6) "service temporary revocable delegation" → **Grant**, (7) "immediate key deletion" → impossible (7-30 days PendingDeletion). Next day covers the detection trinity of Macie, GuardDuty, and Inspector.

---

## 📝 연습 문제

**문제 1.** us-east-1에서 암호화한 RDS 스냅샷을 ap-northeast-2로 복사해 DR 환경을 구성한다. 장애 시 추가 KMS 호출이나 re-encrypt 없이 즉시 복원해야 하고, 두 리전의 키 접근 권한은 각각 다르게 통제하고 싶다. 가장 적합한 것은?

A) 단일 리전 CMK + Cross-Region Snapshot Copy 시 매번 re-encrypt

B) Multi-Region Key (Primary + Replica)

C) Imported Key Material을 두 리전에 각각 import

D) AWS Managed Key

**정답: B**
해설: MRK는 같은 키 머터리얼을 여러 리전에 복제하고 키 ID가 동일해, 한 리전에서 암호화한 ciphertext를 다른 리전의 Replica로 별도 호출 없이 직접 복호화한다. 리전별 Key Policy를 따로 둬 접근 통제도 분리된다. A는 일반 CMK가 리전 종속이라 Cross-Region 복호화에 추가 호출·재암호화가 필요해 비효율적이다. C는 두 import 키가 서로 다른 키가 되어(동일 ciphertext를 양쪽에서 복호화 불가) DR에 부적합하고 자동 로테이션도 안 된다. D는 정책·회전을 통제할 수 없고 리전 종속이다. 함정: "Cross-Region 동일 키 복호화 + DR"은 MRK.

---

**문제 2.** Lambda 함수가 KMS CMK로 데이터를 복호화해야 한다. Lambda 실행 역할 IAM에 `kms:Decrypt`를 부여했는데도 AccessDenied가 발생한다. 가장 가능성 높은 원인과 해결은?

A) Lambda는 KMS를 호출할 수 없다

B) Key Policy에 계정 루트로의 IAM 위임이 없어 IAM 권한이 무효 — Key Policy에 위임을 추가

C) Grant를 반드시 먼저 생성해야 한다

D) SCP가 모든 KMS를 차단하고 있다

**정답: B**
해설: KMS는 Key Policy가 권한의 루트다. Key Policy에 `Principal: {AWS: account-root}` + `kms:*` 같은 IAM 위임 구문이 없으면, IAM에서 아무리 `kms:Decrypt`를 허용해도 효력이 없다. 해결은 Key Policy에 IAM 위임을 명시하거나 Lambda 역할을 Key Policy에서 직접 허용하는 것이다. A는 틀림(Lambda는 KMS 호출 가능). C는 Grant가 필수는 아니다(IAM 위임으로 충분). D는 일반적 원인이 아니며 단서가 없다. 함정: "IAM만 줬는데 거부"의 전형적 원인은 Key Policy 위임 누락.

---

**문제 3.** 규제상 암호화 키 머터리얼을 자사 온프레미스에서 생성하고, AWS가 키를 영구 보관하지 않으며, 키에 만료일을 설정해야 한다. 자동 로테이션은 요구되지 않는다. 가장 적합한 것은?

A) Customer Managed Key (KMS 생성) + 자동 로테이션

B) Imported Key Material (BYOK)

C) AWS Managed Key

D) Multi-Region Key

**정답: B**
해설: BYOK(Imported Key Material)는 키 머터리얼을 외부(자사 HSM)에서 생성해 KMS로 import하며, 만료일을 설정하면 KMS가 캐시만 보관하다 만료 시 삭제한다. A는 키를 KMS가 생성하므로 "자사 생성" 요건에 맞지 않고, BYOK는 자동 로테이션이 불가하다(문제에서 자동 로테이션 불요이므로 BYOK가 적합). C는 통제권이 없다. D는 키 출처·만료 요건과 무관. 함정: "외부 생성 + 만료 설정"은 Imported, 단 "자동 로테이션 필요"가 함께 나오면 모순이므로 그 선택지는 오답.

---

**문제 4.** 단일 테넌트 전용 HSM에서 FIPS 140-2 Level 3 인증된 키 관리가 필요하면서, 개발팀은 기존 KMS API(`Encrypt`/`Decrypt`)를 그대로 쓰고 싶다. 가장 적합한 것은?

A) 순수 KMS CMK (멀티 테넌트)

B) KMS Custom Key Store + CloudHSM 클러스터

C) Secrets Manager

D) Imported Key Material

**정답: B**
해설: Custom Key Store는 KMS의 익숙한 API를 유지하면서 실제 키 머터리얼은 고객 전용 CloudHSM 클러스터(단일 테넌트, FIPS 140-2 Level 3) 안에만 보관한다. A는 멀티 테넌트라 "단일 테넌트 L3" 요건 미달. C는 비밀 저장소이지 HSM 키 관리가 아니다. D는 import한 키도 KMS의 멀티 테넌트 HSM에 저장되어 단일 테넌트 요건을 충족하지 못한다. 함정: "단일 테넌트 + FIPS L3 + KMS API 유지"는 Custom Key Store + CloudHSM.

---

**문제 5.** AWS 서비스(예: EBS)가 당신의 CMK를 볼륨 암호화에 일시적으로 사용한 뒤, 작업이 끝나면 그 위임이 즉시 회수되어야 한다. 세분화된 임시 위임이 필요하다. 어떤 메커니즘인가?

A) Key Policy에 서비스 Principal 영구 추가

B) IAM Role 추가

C) KMS Grant

D) STS AssumeRole

**정답: C**
해설: Grant는 프로그래밍적으로 생성·회수 가능한 임시·세분화 위임으로, 특정 작업만 허용하고 `RetireGrant`/`RevokeGrant`로 즉시 회수된다. AWS 서비스 통합(EBS·RDS 등)이 내부적으로 Grant를 쓴다. A는 영구 위임이라 "즉시 회수" 요건에 맞지 않고 Key Policy가 비대해진다. B(IAM Role)는 KMS 권한의 임시 회수 메커니즘이 아니다. D(STS)는 자격 증명 발급이지 KMS 키 위임이 아니다. 함정: "서비스의 임시·취소 가능 세분화 위임"은 Grant.

---

**문제 6.** 보안팀이 실수로 운영 중인 CMK를 삭제 예약했다. 이 키로 수 TB의 S3 데이터가 암호화돼 있다. 어떤 일이 일어나는가?

A) 키가 즉시 삭제되고 데이터는 영구 복구 불가

B) 7~30일 PendingDeletion 대기 기간이 있어 그 안에 삭제를 취소할 수 있다

C) 키 삭제는 불가능하다

D) 데이터가 자동으로 AWS Managed Key로 재암호화된다

**정답: B**
해설: KMS 키 삭제는 최소 7일~최대 30일의 PendingDeletion 대기 기간을 강제하며, 그 안에는 `CancelKeyDeletion`으로 복구할 수 있다. 키를 삭제하면 그 키로 암호화한 모든 데이터가 영구 복구 불가능해지므로, 실수 방지를 위한 강제 유예다. A는 틀림(즉시 삭제 안 됨). C도 틀림(대기 후 삭제는 가능). D는 그런 자동 재암호화 메커니즘이 없다. 함정: KMS 키는 "즉시 삭제 불가, 7~30일 유예 후 삭제"가 핵심.

---

**문제 7.** KMS의 `Encrypt` API는 최대 4KB만 받는다. 수 GB의 S3 객체를 KMS로 효율적으로 암호화하려면 어떤 방식이 표준인가?

A) 객체를 4KB씩 쪼개 KMS Encrypt를 수백만 번 호출

B) 봉투 암호화 — GenerateDataKey로 받은 평문 DEK로 객체를 로컬 암호화하고, 암호화된 DEK만 객체와 함께 저장

C) CloudHSM에 직접 객체 전송

D) KMS는 큰 객체를 암호화할 수 없으므로 평문 저장

**정답: B**
해설: 봉투 암호화에서 GenerateDataKey는 평문 DEK와 암호화된 DEK를 돌려준다. 평문 DEK로 큰 객체를 로컬에서 빠르게(AES-256) 암호화하고 평문 DEK는 즉시 폐기하며, 암호화된 DEK만 객체와 함께 저장한다. 복호화 시 암호화된 DEK를 KMS로 풀어 평문 DEK를 얻는다. A는 네트워크 왕복이 폭증해 비효율적이고 비용이 크다(안티패턴). C는 동작 방식이 아니다. D는 보안 위반. 함정: "큰 데이터 + KMS"는 항상 봉투 암호화이며, KMS는 마스터 키로 작은 DEK만 보호한다.

---

## 📌 Today's Summary

KMS solves the "key protecting the key" challenge through envelope encryption, where the master key never leaves the hardware and small DEKs protect large data. Key Policy is the root authorization, IAM policy only works when delegated, and Grants enable temporary service integrations. Different key types (CMK, BYOK, MRK, CloudHSM) suit different compliance and operational needs. Multi-Region Keys enable seamless cross-region DR without additional KMS calls. Automatic key rotation (1 year default) keeps the key ID fixed while rotating backing material, and key deletion has a 7-30 day grace period.
