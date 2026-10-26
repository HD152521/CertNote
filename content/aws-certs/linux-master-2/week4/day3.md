# Day 3 - 특수 권한: SetUID · SetGID · Sticky bit

## 📌 핵심 정리

- rwx 아홉 칸 앞에 **네 번째 자리**가 하나 더 있다. 이것이 **특수 권한**이다.
- **SetUID(4) · SetGID(2) · Sticky bit(1)** — 값과 순서를 그대로 외운다.
- 표시는 **`s`와 `t`** 로 나타난다. SetUID는 소유자의 x 자리, SetGID는 그룹의 x 자리, Sticky는 기타의 x 자리다.
- 대표 예시가 정해져 있다 — **SetUID는 `/usr/bin/passwd`, Sticky bit는 `/tmp`**.
- **Sticky bit가 걸린 디렉터리에서는 자기 파일만 지울 수 있다.**

## 네 번째 자리

지금까지 본 `755`는 사실 **뒤 세 자리**다. 앞에 한 자리가 더 있다.

```text
      4     7     5     5
      │     │     │     │
      │     │     │     └── other
      │     │     └──────── group
      │     └────────────── user
      └──────────────────── 특수 권한
```

| 특수 권한 | 값 | 붙는 자리 | 표시 |
|----------|-----|----------|------|
| **SetUID** | **4** | user 의 x | **`s`** |
| **SetGID** | **2** | group 의 x | **`s`** |
| **Sticky bit** | **1** | other 의 x | **`t`** |

- 평소에는 이 자리가 0이라 생략한다. `chmod 755`와 `chmod 0755`는 같다.
- 값이 **4-2-1 순서**로 rwx와 똑같다. 헷갈리면 "위에서부터 4, 2, 1"로 기억한다.

## SetUID — 실행하는 동안 소유자가 된다

```bash
chmod 4755 program       # 8진수 방식
chmod u+s program        # 기호 방식
```

```text
   -rwsr-xr-x  1 root root  ...  /usr/bin/passwd
      └ owner 의 x 자리가 s = SetUID
```

- **그 파일을 실행하는 동안 실행자가 아니라 파일 소유자의 권한**으로 동작한다.
- 대표 예시가 **`/usr/bin/passwd`** 다. 비밀번호는 root만 읽을 수 있는 `/etc/shadow`에 있는데, 일반 사용자도 자기 비밀번호는 바꿀 수 있어야 한다. `passwd`에 SetUID가 걸려 있어 실행하는 순간 root 권한으로 shadow를 고칠 수 있다.
- 그만큼 **보안상 위험**하다. SetUID가 걸린 프로그램에 취약점이 있으면 곧바로 root 권한 탈취로 이어진다.

### passwd 가 shadow 를 고칠 수 있는 이유

```text
$ ls -l /etc/shadow /usr/bin/passwd
----------. 1 root root  1284 Sep  3 09:00 /etc/shadow
-rwsr-xr-x. 1 root root 27856 Sep  3 09:00 /usr/bin/passwd
```

| 단계 | 일어나는 일 |
|------|-----------|
| ① | 일반 사용자 `alice`가 `passwd`를 실행한다 (other 칸에 `x`가 있어 실행 가능) |
| ② | 소유자 자리가 `s`이므로, 이 프로세스는 **alice가 아니라 파일 소유자 root의 권한**으로 돈다 |
| ③ | root 권한이므로 alice는 읽지도 못하는 `/etc/shadow`를 고칠 수 있다 |
| ④ | `passwd`가 끝나면 그 권한도 함께 끝난다. alice의 셸은 여전히 alice다 |

- **권한이 올라가는 것은 그 프로그램이 실행되는 동안, 그 프로그램 안에서만**이다. alice가 root가 되는 것이 아니다.
- **누구의 권한이 되는지는 파일의 소유자가 정한다.** SetUID가 걸려 있어도 소유자가 `bob`이면 bob의 권한으로 돌 뿐이다. "SetUID = root 권한"이 아니라 "**SetUID = 소유자 권한**"이고, 소유자가 root일 때 위험해지는 것이다.
- SetUID 프로그램은 `passwd` 외에 `su`, `sudo`처럼 **일반 사용자가 실행하지만 관리자 권한이 있어야 일할 수 있는 명령**들이다.
- SetUID는 **실행 파일에 거는 권한**이다. 디렉터리에 걸어도 리눅스에서는 효과가 없고, 셸 스크립트에 걸어도 보안상 무시된다.

## SetGID — 그룹 권한으로, 그리고 그룹을 물려준다

```bash
chmod 2755 program       # 파일에
chmod g+s /project       # 디렉터리에
```

SetGID는 **파일에 걸 때와 디렉터리에 걸 때 하는 일이 다르다.**

| 대상 | 효과 |
|------|------|
| **파일** | 실행하는 동안 **파일의 소유 그룹 권한**으로 동작 |
| **디렉터리** | 그 안에 만들어지는 파일이 **디렉터리의 그룹을 물려받는다** |

```text
   -rwxr-sr-x  1 root tty  ...  /usr/bin/wall
         └ group 의 x 자리가 s = SetGID
```

- 디렉터리에 거는 쪽이 실무에서 훨씬 자주 쓰인다. 어제 남겨둔 협업 문제 — 각자 만든 파일의 그룹이 제각각인 문제 — 를 이것으로 해결한다.

```bash
sudo chgrp dev /project
sudo chmod 2770 /project     # SetGID + rwxrwx---
# 이제 누가 /project 안에 파일을 만들어도 그룹은 항상 dev
```

걸기 전과 건 뒤를 나란히 놓으면 차이가 분명하다.

```text
$ ls -ld /project
drwxrws---. 2 root dev 6 Sep  3 09:00 /project      ← 그룹 자리가 s
$ id -gn
alice
$ touch /project/plan.txt
$ mkdir /project/docs
$ ls -l /project
drwxr-sr-x. 2 alice dev 6 Sep  3 09:06 docs
-rw-r--r--. 1 alice dev 0 Sep  3 09:05 plan.txt
```

- alice의 기본 그룹은 `alice`인데도 새 파일의 그룹이 **`dev`** 다. 어제는 여기가 `alice`였다.
- **소유자는 여전히 만든 사람(alice)** 이다. SetGID가 물려주는 것은 **그룹뿐**이다.
- 안에 만든 하위 디렉터리 `docs`에도 **SetGID가 함께 물려진다**(`drwxr-sr-x`). 그래서 더 깊은 곳에서도 그룹이 유지된다.
- 걸기 **전에 이미 있던 파일**의 그룹은 바뀌지 않는다. 그것들은 `chgrp -R dev /project`로 따로 맞춘다.
- 그룹은 맞춰지지만 **권한까지 열어 주지는 않는다.** 위 `plan.txt`는 그룹에 `w`가 없다. 구성원이 서로 고치게 하려면 umask를 002로 하거나 `chmod g+w`를 더한다.

## Sticky bit — 남의 파일은 못 지운다

```bash
chmod 1777 /shared
chmod o+t /shared
```

```text
   drwxrwxrwt  10 root root  ...  /tmp
            └ other 의 x 자리가 t = Sticky bit
```

- 디렉터리에 `w` 권한이 있으면 원래는 **남의 파일도 지울 수 있다.** 파일 자체의 권한과 무관하게, 디렉터리에 쓰기 권한이 있으면 그 안의 항목을 삭제할 수 있기 때문이다.
- Sticky bit를 걸면 **파일의 소유자와 root만 그 파일을 지울 수 있다.**
- 대표 예시가 **`/tmp`** 다. 누구나 임시 파일을 만들 수 있어야 하지만 남의 임시 파일을 지우면 안 되므로 `1777`로 설정되어 있다.

```text
$ ls -l /tmp/a.txt
-rw-r--r--. 1 alice alice 6 Sep  3 09:00 /tmp/a.txt
$ whoami
bob
$ cat /tmp/a.txt                 ← 파일의 other 칸에 r 이 있으니 읽기는 된다
hello
$ rm -f /tmp/a.txt
rm: cannot remove '/tmp/a.txt': Operation not permitted
$ mv /tmp/a.txt /tmp/b.txt
mv: cannot move '/tmp/a.txt' to '/tmp/b.txt': Operation not permitted
```

- Sticky bit가 막는 것은 **삭제와 이름 변경**이다. 파일 내용을 읽을 수 있는지는 여전히 **파일 자신의 권한**이 정한다. 위에서 bob은 읽기는 했지만 지우거나 이름을 바꾸지는 못했다.
- 지울 수 있는 사람은 **그 파일의 소유자, 그 디렉터리의 소유자, 그리고 root** 다.
- Sticky bit는 **디렉터리에 거는 권한**이다. `/tmp` 외에 `/var/tmp`도 같은 1777이다.

| 디렉터리 권한 | 누구나 파일 생성 | 남의 파일 삭제 |
|--------------|---------------|-------------|
| `777` (`rwxrwxrwx`) | O | **O — 위험** |
| `1777` (`rwxrwxrwt`) | O | **X** |
| `755` (`rwxr-xr-x`) | X (소유자만) | X |

## 세 가지 한눈에

| 구분 | 값 | 표시 | 위치 | 대표 예 | 하는 일 |
|------|-----|------|------|--------|--------|
| **SetUID** | **4** | `s` | user x | **`/usr/bin/passwd`** | 소유자 권한으로 실행 |
| **SetGID** | **2** | `s` | group x | `/usr/bin/wall` | 그룹 권한으로 실행 / **그룹 상속** |
| **Sticky** | **1** | `t` | other x | **`/tmp`** | **자기 파일만 삭제 가능** |

### 대문자로 보일 때

원래 그 자리에 **`x`가 없으면 대문자 `S`나 `T`** 로 표시된다.

| 표시 | 뜻 |
|------|-----|
| **`s`** / **`t`** | 특수 권한 있음 + **실행 권한 있음** |
| **`S`** / **`T`** | 특수 권한 있음 + **실행 권한 없음** |

- `-rwSr--r--` 는 SetUID는 걸렸는데 소유자에게 실행 권한이 없는 상태다. 대개 설정 실수다.

`s`·`t`는 **`x` 자리를 빌려 쓰는** 표시다. 한 칸에 두 정보(실행 권한 + 특수 권한)를 겹쳐 적어야 해서 대소문자로 구분한다.

| 그 자리의 글자 | 실행 권한 | 특수 권한 |
|--------------|----------|----------|
| `x` | 있음 | 없음 |
| `-` | 없음 | 없음 |
| `s` / `t` | **있음** | **있음** |
| `S` / `T` | **없음** | 있음 |

```text
$ chmod 4644 a.sh ; ls -l a.sh
-rwSr--r--. 1 user user 0 Sep  3 09:00 a.sh       ← 644 에는 x 가 없어 대문자 S
$ chmod u+x a.sh ; ls -l a.sh
-rwsr--r--. 1 user user 0 Sep  3 09:00 a.sh       ← x 가 생기자 소문자 s
```

### 표기를 숫자로, 숫자를 표기로

네 자리 값은 **맨 앞 한 자리(특수) + 뒤 세 자리(일반)** 로 나눠 읽는다. 표기를 숫자로 바꿀 때는 `s`·`t`를 일단 `x`로 보고 세 자리를 구한 뒤 앞자리를 붙인다.

| 표기 | 특수 | 일반 | 값 |
|------|------|------|-----|
| `rwsr-xr-x` | SetUID 4 | `rwxr-xr-x` 755 | **4755** |
| `rwxr-sr-x` | SetGID 2 | `rwxr-xr-x` 755 | **2755** |
| `rwxrwxrwt` | Sticky 1 | `rwxrwxrwx` 777 | **1777** |
| `rwxrws---` | SetGID 2 | `rwxrwx---` 770 | **2770** |
| `rwsr-sr-x` | SetUID 4 + SetGID 2 | `rwxr-xr-x` 755 | **6755** |
| `rwxrwsrwt` | SetGID 2 + Sticky 1 | `rwxrwxrwx` 777 | **3777** |
| `rwSr--r--` | SetUID 4 | `rw-r--r--` 644 | **4644** |

- 특수 권한도 **더해서** 쓴다. SetUID와 SetGID를 함께 걸면 4+2=6, 셋 다 걸면 7이다.
- **`s`가 어느 칸에 있는지**로 SetUID와 SetGID를 가른다 — 첫 번째 세 칸이면 SetUID, 두 번째 세 칸이면 SetGID. `t`는 언제나 마지막 칸이다.

### 걸고 푸는 명령 모음

| 하려는 일 | 기호 방식 | 8진수 방식 (755 기준) |
|----------|----------|---------------------|
| SetUID 설정 | `chmod u+s 파일` | `chmod 4755 파일` |
| SetGID 설정 | `chmod g+s 대상` | `chmod 2755 대상` |
| Sticky bit 설정 | `chmod o+t 디렉터리` (`+t`도 같다) | `chmod 1755 디렉터리` |
| SetUID 해제 | `chmod u-s 파일` | `chmod 0755 파일` |
| SetGID 해제 | `chmod g-s 대상` | — |
| Sticky bit 해제 | `chmod o-t 디렉터리` | — |

- 기호 방식에서 **`s`는 `u`나 `g`에, `t`는 `o`에** 붙인다. `chmod u+t`나 `chmod o+s`는 뜻이 통하지 않는 조합이다.
- 기호 방식은 다른 권한을 건드리지 않고 특수 권한 **하나만** 걸고 풀 수 있어, 해제할 때는 이쪽이 확실하다.

## 찾아보기

```bash
find / -perm -4000 -type f      # SetUID 가 걸린 파일 전부
find / -perm -2000 -type f      # SetGID
find / -perm -1000 -type d      # Sticky bit
ls -ld /tmp                     # drwxrwxrwt
ls -l /usr/bin/passwd           # -rwsr-xr-x
```

- **SetUID 파일 목록을 뽑아 점검하는 것은 기본적인 보안 감사 절차**다. 있어야 할 것 외에 낯선 파일이 있으면 침해를 의심한다.

`-perm` 뒤 숫자 앞의 기호에 따라 찾는 범위가 달라진다.

| 쓰는 법 | 찾는 것 |
|---------|--------|
| `-perm 4755` | 권한이 **정확히** 4755인 것 |
| `-perm -4000` | 다른 권한이 무엇이든 **SetUID 비트가 켜진** 것 |
| `-perm -6000` | SetUID와 SetGID가 **둘 다** 켜진 것 |
| `-perm /6000` | SetUID와 SetGID 중 **하나라도** 켜진 것 |

- 그냥 `-perm 4000`이라고 쓰면 "권한이 정확히 4000(`---S------`)인 파일"을 찾으므로 아무것도 나오지 않는다. **`-`를 붙여야** "그 비트를 포함한 것"이 된다.

```text
$ stat -c '%a %A %n' /tmp /usr/bin/passwd
1777 drwxrwxrwt /tmp
4755 -rwsr-xr-x /usr/bin/passwd
```

> 내일은 파일이 실제로 저장되는 공간 — 파일 시스템을 붙이고 떼고 점검하는 명령을 다룬다.

## 📖 용어

- **특수 권한** : rwx 세 부류 앞의 네 번째 자리에 놓이는 권한. SetUID·SetGID·Sticky bit.
- **SetUID** : 값 4. 실행하는 동안 파일 소유자의 권한으로 동작하게 하는 권한.
- **SetGID** : 값 2. 파일에서는 소유 그룹 권한으로 실행하게 하고, 디렉터리에서는 새 파일에 그룹을 물려준다.
- **Sticky bit** : 값 1. 디렉터리 안에서 자기 파일만 삭제할 수 있게 제한하는 권한.
- **`/tmp`** : Sticky bit가 걸린 대표적인 공유 임시 디렉터리. 권한은 1777이다.
- **`/usr/bin/passwd`** : SetUID가 걸린 대표적인 명령. 일반 사용자가 `/etc/shadow`를 고칠 수 있게 해 준다.
- **그룹 상속** : SetGID가 걸린 디렉터리에서 새 파일이 디렉터리의 그룹을 따르는 동작.

## 📝 연습 문제

**문제 1.** 다음 중 SetUID, SetGID, Sticky bit에 해당하는 8진수 값을 순서대로 바르게 나열한 것은?

A) 1, 2, 4  
B) 2, 4, 1  
C) 4, 1, 2  
D) 4, 2, 1  

**정답: D**  
해설: 특수 권한은 SetUID가 4, SetGID가 2, Sticky bit가 1이다. 일반 권한의 r=4, w=2, x=1과 같은 순서여서 함께 외우면 편하다. 이 값들은 권한 표기의 네 번째 자리, 즉 맨 앞자리에 놓인다.

---

**문제 2.** 다음 중 `/tmp` 디렉터리에 설정되어 자신이 만든 파일만 삭제할 수 있게 하는 권한으로 알맞은 것은?

A) SetUID  
B) Sticky bit  
C) SetGID  
D) umask  

**정답: B**  
해설: 디렉터리에 쓰기 권한이 있으면 원래 남의 파일도 지울 수 있다. Sticky bit를 설정하면 파일의 소유자와 root만 삭제할 수 있게 제한된다. `/tmp`는 누구나 쓰되 남의 파일은 건드리지 못해야 하므로 권한이 1777로 설정되어 있다.

---

**문제 3.** 다음 중 `-rwsr-xr-x` 권한을 가진 파일에 대한 설명으로 알맞은 것은?

A) 모든 사용자가 삭제할 수 있다  
B) 그룹 구성원만 실행할 수 있다  
C) 실행하는 동안 파일 소유자의 권한으로 동작한다  
D) 실행하는 동안 실행자의 그룹 권한으로 동작한다  

**정답: C**  
해설: 소유자 자리의 실행 권한이 `s`로 표시된 것은 SetUID가 설정되었다는 뜻이다. 이 파일을 실행하면 누가 실행하든 파일 소유자의 권한으로 동작한다. 대표적인 예가 `/usr/bin/passwd`로, 일반 사용자가 root 소유의 `/etc/shadow`를 갱신할 수 있게 해 준다.

---

**문제 4.** 다음 중 디렉터리에 SetGID를 설정했을 때 나타나는 효과로 알맞은 것은?

A) 그 안에 생성되는 파일이 디렉터리의 그룹을 물려받는다  
B) 그 안의 파일을 소유자만 삭제할 수 있다  
C) 그 디렉터리에 아무도 진입할 수 없다  
D) 그 안의 파일이 모두 root 소유가 된다  

**정답: A**  
해설: 디렉터리에 SetGID를 걸면 그 안에서 새로 만들어지는 파일의 그룹이 생성자의 기본 그룹이 아니라 디렉터리의 그룹으로 지정된다. 여러 사용자가 함께 쓰는 협업 디렉터리에서 그룹을 일관되게 유지하는 데 사용한다. 자기 파일만 삭제하게 하는 것은 Sticky bit이다.

---

**문제 5.** 다음 중 파일에 SetUID 권한을 부여하는 명령으로 알맞은 것은?

A) chmod 2755 file  
B) chmod 4755 file  
C) chmod 1755 file  
D) chmod u+t file  

**정답: B**  
해설: SetUID의 값은 4이므로 기존 권한 755 앞에 4를 붙여 `chmod 4755`로 지정한다. 기호 방식으로는 `chmod u+s`를 사용한다. 2755는 SetGID, 1755는 Sticky bit를 설정하는 명령이다.
