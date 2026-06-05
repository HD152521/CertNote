# Day 4 - 특수 권한과 ACL: SetUID · SetGID · Sticky bit · getfacl/setfacl

Day 3에서 우리는 9비트(rwx × 3부류)로 권한을 정확히 계산했다. 그런데 그 9비트만으로는 풀 수 없는 문제가 있다. 일반 사용자가 자기 암호를 바꾸려면 `/etc/shadow`(root만 쓰기 가능)를 수정해야 하는데, 어떻게 가능할까? `/tmp`는 모두가 쓸 수 있는데 왜 남의 파일은 못 지울까? "alice와 bob 두 사람에게만" 권한을 주려면 owner·group·other 세 칸으로 어떻게 표현할까?

이 세 질문의 답이 오늘의 주제다. 앞쪽은 **특수 권한 3종**(SetUID·SetGID·Sticky bit)으로, 9비트 위에 얹는 네 번째 8진수 자리(4·2·1)다. 뒤쪽은 **ACL**(Access Control List)로, owner-group-other의 3칸 한계를 넘어 "특정 사용자/그룹마다 개별 권한"을 부여하는 확장 메커니즘이다. 둘 다 실기 단답과 보안 함정으로 빈출이다.

## 특수 권한 — 네 번째 8진수 자리

`chmod`에 8진수를 4자리로 쓰면 맨 앞 자리가 특수 권한이다. 가중치는 **SetUID=4, SetGID=2, Sticky=1**.

```bash
chmod 4755 program     # SetUID + rwxr-xr-x
chmod 2755 shareddir   # SetGID + rwxr-xr-x
chmod 1777 /tmp        # Sticky + rwxrwxrwx
chmod 6755 program     # SetUID+SetGID(4+2)
```

| 특수권한 | 8진수 | ls 표시 위치 | 효과 요약 |
|----------|-------|-------------|-----------|
| SetUID | 4 | owner의 x 자리 → `s` | 실행 시 **소유자 권한**으로 동작 |
| SetGID | 2 | group의 x 자리 → `s` | 실행 시 소유 그룹 권한 / 디렉터리 그룹 상속 |
| Sticky | 1 | other의 x 자리 → `t` | 디렉터리에서 **소유자만 자기 파일 삭제** |

> 💡 **개념**: 특수 권한은 9비트 권한 표시의 **x 자리에 겹쳐서** 나타난다. SetUID는 owner의 x 자리에, SetGID는 group의 x 자리에, Sticky는 other의 x 자리에 표시된다. 원래 x가 있으면 소문자(`s`/`t`), x가 없으면 대문자(`S`/`T`)로 나온다. 대문자는 "특수 권한은 켜졌지만 실행 권한이 없어 사실상 무의미"한 경고 신호다.

### SetUID — 소유자 권한으로 실행

SetUID가 걸린 실행 파일은, **누가 실행하든 그 파일 소유자의 권한**으로 동작한다. 대표 예가 `/usr/bin/passwd`다.

```bash
ls -l /usr/bin/passwd
# -rwsr-xr-x 1 root root ... /usr/bin/passwd
#    └ owner의 x 자리에 s = SetUID
```

> 🔍 **더 깊이**: `passwd` 명령은 `/etc/shadow`를 수정해야 하는데, 이 파일은 root만 쓸 수 있다(권한 000 또는 400). 일반 사용자 alice가 자기 암호를 바꾸려면? `passwd`에 SetUID가 걸려 있어 소유자(root) 권한으로 실행되기 때문에, alice가 실행하는 순간 그 프로세스는 root 권한으로 shadow를 수정할 수 있다. SetUID가 없으면 일반 사용자는 자기 암호조차 바꿀 수 없다. 이것이 SetUID의 존재 이유다.

> ⚠️ **함정**: SetUID는 **최대의 보안 위협 지점**이다. SetUID가 걸린 프로그램에 취약점이 있으면 공격자가 root 권한을 탈취(권한 상승)할 수 있다. 특히 셸 스크립트나 `vi`, `cp` 같은 범용 도구에 SetUID를 거는 것은 절대 금물이다(`cp`에 root SetUID가 있으면 누구나 임의 파일을 덮어쓸 수 있음). 그래서 리눅스 커널은 **셸 스크립트의 SetUID를 아예 무시**한다. 시스템에 의도치 않은 SetUID 파일이 있는지 정기 점검하는 명령이 시험에 나온다:

```bash
# SetUID 파일 전체 탐색(보안 감사 표준)
find / -perm -4000 -type f 2>/dev/null
# SetGID 파일 탐색
find / -perm -2000 -type f 2>/dev/null
# SetUID + SetGID 모두
find / -perm /6000 -type f 2>/dev/null
```

### SetGID — 그룹 권한 실행 + 디렉터리 그룹 상속

SetGID는 두 가지 다른 맥락에서 작동한다.

**실행 파일에 걸면**: 실행 시 소유 그룹의 권한으로 동작(SetUID의 그룹 버전).

**디렉터리에 걸면**(이쪽이 시험 핵심): 그 디렉터리 안에 새로 만드는 파일·하위 디렉터리의 **소유 그룹이 자동으로 그 디렉터리의 그룹**이 된다. 보통은 파일 생성자의 기본 그룹이 소유 그룹이 되는데, SetGID 디렉터리에서는 디렉터리의 그룹을 물려받는다.

```bash
mkdir /project && chgrp dev /project && chmod 2775 /project
# 이제 누가 /project 안에 파일을 만들어도 그룹은 항상 dev
```

> 💡 **개념**: SetGID 디렉터리는 **그룹 협업의 핵심 도구**다. 여러 사람이 한 디렉터리에서 협업할 때, 각자 만든 파일의 그룹이 제각각이면 서로 접근이 막힌다. SetGID를 걸면 모든 파일이 공통 그룹을 갖게 되어, 그 그룹에 그룹-쓰기(g+w)를 부여하면 팀 전체가 서로의 파일을 자유롭게 편집할 수 있다. Day 3에서 "새 파일의 그룹은 생성자의 기본 그룹"이라 했는데, SetGID 디렉터리가 바로 그 예외다.

### Sticky bit — 공유 디렉터리의 삭제 보호

Day 3에서 "디렉터리에 w 권한이 있으면 그 안의 파일을 (소유자가 아니어도) 삭제할 수 있다"고 했다. `/tmp`처럼 모두가 쓰는 디렉터리에서 이건 재앙이다 — 아무나 남의 임시 파일을 지울 수 있다. Sticky bit가 이를 막는다.

```bash
ls -ld /tmp
# drwxrwxrwt 10 root root ... /tmp
#         └ other의 x 자리에 t = Sticky
```

> 💡 **개념**: Sticky bit가 걸린 디렉터리에서는, 디렉터리에 w 권한이 있어도 **파일의 소유자(또는 디렉터리 소유자, 또는 root)만 그 파일을 삭제·이름 변경**할 수 있다. `/tmp`가 `1777`(rwxrwxrwt)인 이유가 이것이다. 모두가 파일을 만들 수는 있지만(공용), 남의 파일은 못 지운다(보호). Sticky bit가 없으면 `/tmp`에서 누구나 남의 파일을 지울 수 있어 보안·안정성 문제가 생긴다.

> ⚠️ **함정**: Sticky bit는 오늘날 **디렉터리에만 의미**가 있다. 과거(초기 유닉스)에는 실행 파일에 걸어 "프로그램을 메모리/스왑에 상주"시키는 용도였으나(이름 "sticky"의 유래), 현대 커널은 파일에 대한 sticky를 무시한다. 시험에서 "Sticky bit는 파일의 메모리 상주를 위해 쓴다"는 현대 기준 오답이다.

```bash
# 직접 쳐보기 — 특수 권한 관찰과 실험
ls -l /usr/bin/passwd /usr/bin/sudo      # SetUID(s) 확인
ls -ld /tmp /var/tmp                      # Sticky(t) 확인
mkdir testdir && chmod 2775 testdir && ls -ld testdir   # SetGID(s) 확인
touch testdir/a && ls -l testdir/a        # 그룹 상속 관찰
```

> 📚 **유래/사례**: 1990년대 한 대학 서버에서 `/tmp`에 Sticky bit가 빠진 적이 있었다. 한 학생이 다른 학생의 컴파일 임시 파일을 장난삼아 지우자 빌드가 줄줄이 실패했고, 더 심각하게는 일부 프로그램이 `/tmp`에 만든 lock 파일을 누군가 지우거나 심볼릭 링크로 바꿔치기하는 "심링크 공격(symlink attack)"이 가능했다. Sticky bit 도입 후 이런 공격 표면이 닫혔다. 그래서 모든 공유 쓰기 디렉터리(`/tmp`, `/var/tmp`)는 반드시 Sticky가 걸려 있어야 한다.

## ACL — owner/group/other의 3칸을 넘어서

표준 권한의 근본 한계: 한 파일에 대해 **단 하나의 소유자, 단 하나의 그룹**만 지정할 수 있다. "alice에게는 rw, bob에게는 r, dev 그룹에게는 rw, 그 외엔 차단"처럼 세분화된 요구는 3칸으로 표현 불가능하다. **ACL**(Access Control List)이 이 한계를 푼다.

ACL은 파일마다 "사용자별·그룹별 권한 항목 목록"을 추가로 붙인다.

```bash
getfacl file.txt          # ACL 조회
setfacl -m u:bob:r file.txt        # bob에게 읽기 부여(-m = modify)
setfacl -m g:dev:rw file.txt       # dev 그룹에 읽기/쓰기
setfacl -x u:bob file.txt          # bob의 ACL 항목 제거(-x)
setfacl -b file.txt                # 모든 ACL 제거(-b = remove all)
setfacl -m d:u:bob:rw dir          # 기본(default) ACL — 하위에 상속
setfacl -R -m u:bob:rw dir         # 재귀 적용
```

`getfacl`의 출력 구조:

```bash
# file: file.txt
# owner: alice
# group: dev
user::rw-          ← 소유자(표준 owner)
user:bob:r--       ← bob 개별 ACL
group::rw-         ← 소유 그룹(표준 group)
group:audit:r--    ← audit 그룹 개별 ACL
mask::rw-          ← 마스크(ACL 권한의 상한)
other::r--         ← 기타(표준 other)
```

> 💡 **개념**: ACL이 설정된 파일은 `ls -l`에서 권한 끝에 **`+` 기호**가 붙는다(`-rw-rwxr--+`). 이 `+`를 보면 "이 파일엔 표준 권한 외에 ACL이 있다"는 신호다. 시험에서 "권한 표시 끝의 `+`는 무엇?"의 정답은 ACL 존재 표시다.

> 🔍 **더 깊이**: ACL의 **mask**가 까다로운 포인트다. mask는 "named user/group(이름이 붙은 ACL 항목)과 소유 그룹이 가질 수 있는 권한의 상한선"이다. `setfacl -m u:bob:rwx`로 bob에게 rwx를 줬어도 mask가 `r--`이면 bob의 유효 권한은 r에 그친다. `getfacl`은 마스크에 의해 깎인 항목에 `#effective:` 주석을 달아 실제 권한을 보여준다. `chmod`로 그룹 권한을 바꾸면 사실 mask가 바뀌는 것이라, ACL이 있는 파일에 chmod를 걸 때 주의해야 한다.

> ⚠️ **함정**: ACL이 있어도 표준 owner/group/other 권한은 그대로 존재하며, 접근 판정 순서가 있다. ① 사용자가 소유자면 owner 권한 적용 → ② named user ACL에 있으면 그 항목 적용 → ③ 소유 그룹이거나 named group ACL에 있으면 그 중 적용(mask로 제한) → ④ 아무에도 안 맞으면 other 적용. "ACL을 줬는데 권한이 안 먹는다" 류 문제는 대개 mask가 깎고 있거나, 소유자라서 owner 권한이 먼저 적용되는 경우다.

> 📚 **유래/사례**: 한 회사의 감사팀(audit 그룹)이 특정 로그 디렉터리를 "읽기만" 할 수 있어야 했다. 그런데 그 디렉터리는 이미 ops 그룹 소유였고 표준 권한의 group 칸은 ops가 차지하고 있었다. 두 번째 그룹을 표준 권한으로는 넣을 수 없어, `setfacl -m g:audit:rX -R /var/log/app`으로 audit 그룹에 읽기+디렉터리진입 ACL을 추가했다. 표준 권한 모델로는 불가능했던 "두 그룹에 서로 다른 권한"을 ACL이 해결한 전형적 사례다. (`X` 대문자는 Day 3에서 본 대로 디렉터리/실행파일에만 x 부여.)

```bash
# 직접 쳐보기 — ACL 실험
touch acltest.txt
setfacl -m u:nobody:rw acltest.txt
ls -l acltest.txt                  # 끝에 + 확인
getfacl acltest.txt                # ACL 항목과 mask 확인
setfacl -b acltest.txt && ls -l acltest.txt   # 제거 후 + 사라짐
```

## 한 장 요약 — 특수 권한과 ACL 치트시트

| 항목 | 8진수/명령 | 핵심 |
|------|-----------|------|
| SetUID | 4xxx, `s`(owner x) | 소유자 권한으로 실행. passwd 예. 보안 위험 |
| SetGID | 2xxx, `s`(group x) | 그룹 실행 / 디렉터리 그룹 상속 |
| Sticky | 1xxx, `t`(other x) | 공유 디렉터리 삭제 보호. /tmp=1777 |
| SetUID 탐색 | `find / -perm -4000` | 보안 감사 |
| ACL 조회/설정 | `getfacl` / `setfacl -m` | owner-group-other 한계 돌파 |
| ACL 표시 | `ls -l` 끝의 `+` | ACL 존재 신호 |

`/tmp = 1777`, `passwd = 4755(rwsr-xr-x)`, SetGID 디렉터리 = 그룹 상속 — 이 세 가지를 즉답할 수 있으면 핵심은 잡은 것이다.

## 📝 연습 문제

**문제 1.** `/usr/bin/passwd`의 권한이 `-rwsr-xr-x`로 표시될 때, owner의 x 자리에 있는 `s`가 의미하는 것은?

A) Sticky bit가 설정되어 메모리에 상주한다

B) SetUID가 설정되어 실행 시 파일 소유자(root)의 권한으로 동작한다

C) SetGID가 설정되어 실행 시 소유 그룹 권한으로 동작한다

D) 심볼릭 링크임을 나타낸다

**정답: B**

해설: owner의 x 자리에 나타나는 `s`는 SetUID다. 일반 사용자가 `passwd`를 실행해도 소유자인 root 권한으로 동작하여 root만 쓸 수 있는 `/etc/shadow`를 수정할 수 있다. A의 Sticky는 other 자리의 `t`, C의 SetGID는 group 자리의 `s`로 표시되며, D의 링크는 맨 앞 글자 `l`로 표시된다.

---

**문제 2.** `/tmp` 디렉터리에 설정된 Sticky bit(`drwxrwxrwt`)의 효과로 옳은 것은?

A) 누구나 디렉터리 안의 모든 파일을 삭제할 수 있다

B) 파일의 소유자(또는 디렉터리 소유자, root)만 자기 파일을 삭제할 수 있다

C) 디렉터리 안에 새 파일을 만들 수 없다

D) 디렉터리 내용을 메모리에 영구 상주시킨다

**정답: B**

해설: Sticky bit가 걸린 디렉터리에서는 디렉터리에 쓰기 권한이 있어도 파일 소유자(또는 디렉터리 소유자, root)만 해당 파일을 삭제/이름변경할 수 있다. 이 때문에 모두가 쓰는 `/tmp`에서 남의 파일을 함부로 지울 수 없다. A는 Sticky가 없을 때의 동작, C는 사실이 아니며, D는 현대 커널이 무시하는 과거의 파일 sticky 동작이다.

---

**문제 3.** 시스템 전체에서 SetUID가 설정된 실행 파일을 찾는 명령으로 옳은 것은?

A) `find / -perm -4000 -type f 2>/dev/null`

B) `find / -perm -2000 -type f 2>/dev/null`

C) `find / -perm -1000 -type f 2>/dev/null`

D) `find / -name "*.suid" 2>/dev/null`

**정답: A**

해설: SetUID의 8진수 가중치는 4이므로 `-perm -4000`으로 탐색한다. B의 2000은 SetGID, C의 1000은 Sticky bit를 찾는다. D는 SetUID와 무관한 파일명 패턴 검색으로 의미가 없다. SetUID 파일 점검은 권한 상승 취약점을 막는 보안 감사의 표준 절차다.

---

**문제 4.** 디렉터리에 SetGID(`chmod 2775 dir`)를 설정했을 때의 효과로 옳은 것은?

A) 디렉터리 안에 만드는 파일의 소유자가 항상 root가 된다

B) 디렉터리 안에 만드는 파일의 소유 그룹이 그 디렉터리의 그룹을 상속한다

C) 디렉터리 안의 파일을 소유자만 삭제할 수 있다

D) 디렉터리에 아무도 진입할 수 없게 된다

**정답: B**

해설: 디렉터리에 SetGID를 걸면 그 안에서 생성되는 파일·하위 디렉터리의 소유 그룹이 생성자의 기본 그룹이 아니라 디렉터리의 그룹을 상속한다. 그룹 협업 디렉터리의 핵심 기능이다. A(소유자 상속)는 존재하지 않는 동작, C는 Sticky bit, D는 사실이 아니다.

---

**문제 5.** `ls -l`로 본 파일 권한이 `-rw-rwxr--+`처럼 끝에 `+`가 붙어 있을 때 의미하는 것은?

A) 파일이 압축되어 있다

B) 파일에 표준 권한 외에 ACL이 설정되어 있다

C) 파일이 심볼릭 링크다

D) 파일에 SetUID가 설정되어 있다

**정답: B**

해설: 권한 표시 끝의 `+`는 그 파일에 표준 owner-group-other 권한 외에 ACL이 추가로 설정되어 있음을 나타낸다. `getfacl`로 상세 항목을 볼 수 있다. A는 무관, C의 링크는 맨 앞 `l`, D의 SetUID는 owner x 자리의 `s`로 표시되므로 모두 틀렸다.

---

**문제 6.** 사용자 bob에게만 파일 `report.txt`에 대한 읽기 권한을 추가로 부여하는 ACL 명령으로 옳은 것은?

A) `chmod u+r:bob report.txt`

B) `setfacl -m u:bob:r report.txt`

C) `setfacl -x u:bob:r report.txt`

D) `chown bob:r report.txt`

**정답: B**

해설: `setfacl -m`(modify)으로 `u:bob:r` 항목을 추가하면 bob에게만 개별 읽기 권한을 부여할 수 있다. A는 chmod에 존재하지 않는 문법이고, C의 `-x`는 ACL 항목을 제거하는 옵션이며, D는 소유권 변경 명령으로 형식도 잘못됐다. ACL은 표준 권한 3칸으로 표현 못 하는 개별 사용자 권한을 가능하게 한다.

---

**문제 7.** 리눅스 커널이 셸 스크립트에 대한 SetUID를 무시하는 이유로 가장 적절한 것은?

A) 셸 스크립트는 실행 속도가 느리기 때문

B) 스크립트 실행 중 변수 조작·경로 변조 등으로 root 권한이 탈취될 위험이 크기 때문

C) 셸 스크립트는 디렉터리에만 SetUID를 걸 수 있기 때문

D) SetUID는 본래 그룹 권한 전용이기 때문

**정답: B**

해설: 셸 스크립트에 SetUID를 허용하면 PATH 변조, IFS 조작, 인터프리터 실행 시점의 경쟁 조건 등으로 공격자가 root 권한을 탈취할 수 있어 매우 위험하다. 그래서 커널이 스크립트의 SetUID를 무시한다. A는 무관, C·D는 SetUID 동작에 대한 잘못된 설명이다.

---
