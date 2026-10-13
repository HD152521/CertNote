# Day 1 - 셸이란 무엇인가

## 📌 핵심 정리

- 셸은 **사용자의 명령을 해석해 커널에 전달하는 프로그램**이다. 껍데기(shell)라는 이름이 여기서 나왔다.
- 셸은 크게 **Bourne 계열(sh·ksh·bash·zsh)** 과 **C 계열(csh·tcsh)** 두 갈래로 나뉜다.
- **리눅스의 기본 셸은 `bash`** 다. **Bourne Again SHell** 의 줄임말이다.
- 지금 쓰는 셸은 **`echo $SHELL`**, 쓸 수 있는 셸 목록은 **`/etc/shells`**, 바꾸는 명령은 **`chsh`** 다.
- 사용자의 로그인 셸은 **`/etc/passwd`의 7번째(마지막) 필드**에 적혀 있다.

## 셸의 자리

![사용자와 하드웨어 사이에서 셸과 커널이 놓인 자리](/diagrams/shell-kernel-position.svg)

- 셸은 커널을 **감싸는 껍데기**다. 사용자는 커널을 직접 건드리지 않고 셸을 통해 요청한다.
- 셸이 하는 일은 크게 넷이다 — **명령 해석 · 프로그램 실행 · 환경 설정 · 스크립트 실행**.
- 셸은 **커널의 일부가 아니라 하나의 응용 프로그램**이다. 그래서 갈아 끼울 수 있다.

### 명령 한 줄이 실행되기까지

`ls -l /etc` 를 치고 엔터를 누르면 셸 안에서는 다음이 차례로 일어난다.

```text
   1. 읽기      입력한 한 줄을 받는다
   2. 쪼개기    공백을 기준으로 명령(ls) · 옵션(-l) · 인자(/etc) 로 나눈다
   3. 바꾸기    $변수, 와일드카드(*), 별칭을 실제 값으로 바꾼다
   4. 찾기      내부 명령인지 확인하고, 아니면 PATH 에서 실행 파일을 찾는다
   5. 실행      자식 프로세스를 만들어 그 프로그램을 실행시킨다
   6. 기다리기  끝나면 종료 상태를 받고 다시 프롬프트를 띄운다
```

- 3번 때문에 `ls *.txt` 에서 **`*`를 파일 이름들로 바꾸는 것은 `ls`가 아니라 셸**이다. `ls`는 이미 풀린 파일 이름 목록을 받는다.
- 4번에서 갈리는 것이 **내부 명령과 외부 명령**이다.

| 구분 | 무엇 | 예 | 확인 |
|------|------|-----|------|
| **내부 명령(builtin)** | 셸 **자체에 들어 있는** 명령. 새 프로세스를 만들지 않는다 | `cd`, `echo`, `export`, `alias`, `history`, `exit` | `type cd` |
| **외부 명령** | 디스크에 **별도 실행 파일**로 있는 명령 | `ls`, `cp`, `cat`, `vi` | `which cat` |

```bash
type cd
# cd is a shell builtin
type cat
# cat is /usr/bin/cat
type ls
# ls is aliased to `ls --color=auto'
```

> `cd`가 내부 명령인 데는 이유가 있다. 디렉터리 이동은 **셸 자신의 현재 위치**를 바꾸는 일이라 자식 프로세스가 대신해 줄 수 없다. 자식이 이동해 봐야 부모인 셸은 제자리다.

## 셸의 갈래

```text
                   Thompson shell (1971)
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
   Bourne shell (sh, 1977)            C shell (csh, 1978)
   Stephen Bourne                     Bill Joy
        │                                   │
   ┌────┴────┬──────────┐                  │
   │         │          │                  │
  ksh      bash       dash               tcsh
 (Korn)  (GNU, 1989)                    (개선판)
   │         │
   └────► zsh (ksh·bash·tcsh 기능 흡수)
```

| 셸 | 이름의 뜻 | 만든 사람 | 계열 | 특징 |
|----|----------|---------|------|------|
| **sh** | Bourne shell | **Stephen Bourne** | **Bourne** | 최초의 표준 셸. 기능은 적지만 어디에나 있다 |
| **csh** | C shell | **Bill Joy** | **C** | **C 언어와 비슷한 문법**. 히스토리·별칭 도입 |
| **tcsh** | TENEX C shell | — | **C** | csh 개선판. 명령 완성 기능 |
| **ksh** | **Korn** shell | **David Korn** | **Bourne** | sh 호환 + csh 기능 결합 |
| **bash** | **Bourne Again** shell | **Brian Fox** | **Bourne** | **리눅스 기본 셸**. GNU 프로젝트 |
| **zsh** | Z shell | Paul Falstad | **Bourne** | 강력한 자동완성. **macOS 기본 셸** |
| **dash** | Debian Almquist shell | — | **Bourne** | 가볍고 빠르다. 스크립트 전용으로 쓰인다 |

> **계열을 가르는 문제가 자주 나온다.** `csh`와 `tcsh`만 **C 계열**이고 나머지는 전부 **Bourne 계열**이다. 이름에 c가 들어간 둘만 따로 묶는다고 기억하면 편하다.

### 셸마다 무엇이 달랐나

셸의 역사는 **"앞선 셸에 없던 편의 기능을 누가 넣었는가"** 로 읽으면 외우기 쉽다. 등장 순서는 sh(1977) → csh(1978) → ksh(1983) → bash(1989) → zsh(1990) 이다.

| 기능 | sh | csh | tcsh | ksh | bash |
|------|----|-----|------|-----|------|
| 히스토리(명령 이력) | ✕ | **○** | ○ | ○ | ○ |
| 별칭(alias) | ✕ | **○** | ○ | ○ | ○ |
| 작업 제어(`fg`·`bg`) | ✕ | **○** | ○ | ○ | ○ |
| 명령행 편집 | ✕ | ✕ | **○** | **○** | ○ |
| sh 스크립트와 호환 | — | ✕ | ✕ | ○ | ○ |

- **히스토리·별칭·작업 제어를 처음 넣은 셸이 csh**다. "이 기능을 처음 도입한 셸"을 물으면 bash가 아니라 csh다.
- csh의 약점은 **sh와 문법이 달라 스크립트가 호환되지 않는다**는 점이다. C 계열과 Bourne 계열을 가르는 실질적인 기준이 이 문법 차이다.
- **ksh는 sh 문법을 지키면서 csh의 편의 기능을 가져왔고**, bash는 거기에 ksh의 장점까지 더했다. bash가 표준이 된 이유다.
- 기본 프롬프트도 계열을 따른다. **Bourne 계열은 `$`, C 계열은 `%`**, 어느 쪽이든 **root는 `#`** 이다.

```bash
ls -l /bin/sh
# lrwxrwxrwx. 1 root root 4 ... /bin/sh -> bash     ← 레드햇 계열
# lrwxrwxrwx  1 root root 4 ... /bin/sh -> dash     ← 데비안·우분투
```

> 요즘 리눅스에 **진짜 Bourne shell은 없다.** `/bin/sh`는 다른 셸로 가는 **심볼릭 링크**다. 레드햇 계열은 bash를, 데비안 계열은 가벼운 dash를 가리킨다. 표에서 dash가 "스크립트 전용"으로 적힌 이유가 이것이다.

### 만든 사람과 이름

2급에서는 **누가 만들었는가**를 그대로 묻는다.

| 셸 | 만든 사람 |
|----|---------|
| **sh** | **Stephen Bourne** |
| **csh** | **Bill Joy** |
| **ksh** | **David Korn** |
| **bash** | **Brian Fox** |

- **ksh는 Korn의 이름**에서, **csh는 C 언어**에서, **bash는 Bourne Again**(다시 태어난 Bourne)에서 왔다.
- bash의 이름은 "born again"(거듭난)과 발음이 같은 말장난이다.

## 지금 무슨 셸을 쓰고 있나

```bash
echo $SHELL          # /bin/bash   ← 로그인 셸
echo $0              # -bash       ← 지금 실행 중인 셸
cat /etc/shells      # 이 시스템에서 쓸 수 있는 셸 목록
which bash           # /usr/bin/bash
```

| 방법 | 알려 주는 것 |
|------|------------|
| **`echo $SHELL`** | **로그인 셸** (기본으로 지정된 셸) |
| `echo $0` | **지금 실행 중인** 셸 |
| **`/etc/shells`** | **사용 가능한 셸 목록** 파일 |
| `/etc/passwd` 7번째 필드 | 그 사용자의 **로그인 셸** |

> `$SHELL`과 `$0`이 다를 수 있다. 로그인은 bash로 했지만 그 안에서 `zsh`를 실행했다면 `$SHELL`은 여전히 `/bin/bash`, `$0`은 `zsh`가 된다.

### 직접 확인해 보기

```bash
cat /etc/shells
# /bin/sh
# /bin/bash
# /usr/bin/sh
# /usr/bin/bash
# /bin/tcsh
# /bin/zsh

grep "^user:" /etc/passwd
# user:x:1000:1000:Test User:/home/user:/bin/bash

ps -p $$
#     PID TTY          TIME CMD
#    2314 pts/0    00:00:00 bash
```

- `/etc/shells`에는 셸이 **절대 경로로 한 줄에 하나씩** 적혀 있다. 설치된 셸에 따라 목록이 달라진다.
- **`$$`는 현재 셸의 PID**다. 그래서 `ps -p $$` 가 "지금 실행 중인 셸"을 확인하는 가장 확실한 방법이다.
- `echo $0` 결과가 **`-bash`처럼 하이픈으로 시작하면 로그인 셸**이라는 표시다. 그 안에서 다시 띄운 셸은 하이픈 없이 `bash`로 나온다.
- **`$SHELL`은 로그인할 때 `/etc/passwd` 값으로 채워지는 변수일 뿐**이다. 다른 셸을 실행한다고 저절로 바뀌지 않는다.

## 셸 바꾸기

```bash
chsh -s /bin/zsh          # 내 로그인 셸을 zsh 로
chsh -s /bin/zsh alice    # alice 의 로그인 셸을 (root 권한)
chsh -l                   # 사용 가능한 셸 목록
```

- **`chsh`(change shell)** 는 `/etc/passwd`의 마지막 필드를 고친다. **다음 로그인부터** 적용된다.
- `/etc/shells`에 등록된 셸로만 바꿀 수 있다.
- 로그인시키지 않을 계정에는 **`/sbin/nologin`** 이나 `/bin/false`를 셸로 준다. 계정은 있지만 로그인은 막는 방법이다.

```text
   user:x:1000:1000:Test User:/home/user:/bin/bash
                                            └─┬─┘
                                              └── 7번째 필드 = 로그인 셸
```

### 바꾸는 세 가지 길

| 방법 | 누가 쓸 수 있나 | 비고 |
|------|---------------|------|
| **`chsh -s 셸 [사용자]`** | 본인(자기 것), root(누구 것이든) | 일반 사용자는 암호 확인을 거친다 |
| `usermod -s 셸 사용자` | root | 계정 속성을 고치는 명령의 `-s` 옵션 |
| `/etc/passwd` 직접 편집 | root | 7번째 필드를 고친다. 오타 하나로 로그인이 막힐 수 있다 |

```bash
chsh -s /bin/zsh
# Changing shell for user.
# Password:
# Shell changed.
echo $SHELL
# /bin/bash        ← 아직 그대로다. 다시 로그인해야 바뀐다
grep "^user:" /etc/passwd
# user:x:1000:1000:Test User:/home/user:/bin/zsh
```

- **파일은 바로 바뀌지만 지금 셸은 그대로**다. `chsh`는 실행 중인 셸을 건드리지 않고 다음 로그인 때 쓸 값만 고친다.
- **잠깐 써 보는 것**이라면 그냥 `zsh` 라고 실행하면 된다. `exit` 하면 원래 셸로 돌아오고 `/etc/passwd`는 바뀌지 않는다.
- `chsh -l` 은 레드햇 계열에서 지원한다. 데비안 계열의 `chsh`에는 이 옵션이 없으므로 `cat /etc/shells` 로 본다.
- 계정을 만들 때부터 셸을 정하려면 **`useradd -s /bin/zsh alice`** 처럼 쓴다.

### 로그인을 막는 셸

| 셸 | 접속을 시도하면 |
|----|---------------|
| **`/sbin/nologin`** | **"This account is currently not available."** 라는 안내를 보여 주고 끊는다 |
| `/bin/false` | 아무 말 없이 곧바로 끊는다 |

```bash
grep nologin /etc/passwd | head -3
# bin:x:1:1:bin:/bin:/sbin/nologin
# daemon:x:2:2:daemon:/sbin:/sbin/nologin
# apache:x:48:48:Apache:/usr/share/httpd:/sbin/nologin
```

- 이런 계정은 **사람이 아니라 서비스가 쓰는 시스템 계정**이다. 프로그램의 소유자로만 쓰이므로 로그인할 이유가 없다.
- **계정을 지우는 것(`userdel`)과 다르다.** 계정과 파일 소유권은 그대로 두고 **접속만** 막는다.
- 데비안 계열에서는 경로가 `/usr/sbin/nologin` 이다.

## 로그인 셸과 비로그인 셸

| 구분 | 언제 | 읽는 설정 파일 |
|------|------|--------------|
| **로그인 셸** | 로그인할 때, `su -` | `/etc/profile`, `~/.bash_profile` |
| **비로그인 셸** | 터미널 창을 새로 열 때 | `~/.bashrc` |

- 이 구분에 따라 **읽는 설정 파일이 달라진다.** 자세한 순서는 3일 뒤에 다룬다.
- `su`와 `su -`의 차이가 여기서도 나온다. **하이픈을 붙이면 로그인 셸**로 시작한다.

> 내일은 셸이 기억하는 값 — 셸 변수와 환경 변수를 다룬다.

## 📖 용어

- **셸(shell)** : 사용자의 명령을 해석해 커널에 전달하는 프로그램. 커널을 감싸는 껍데기.
- **Bourne 계열** : sh에서 갈라져 나온 셸들. ksh, bash, zsh, dash가 여기 속한다.
- **C 계열** : csh에서 갈라져 나온 셸들. csh와 tcsh 둘뿐이다.
- **bash** : Bourne Again SHell. Brian Fox가 만든 GNU 셸이며 리눅스의 기본 셸이다.
- **로그인 셸** : 로그인할 때 실행되는 셸. `/etc/passwd`의 7번째 필드에 지정된다.
- **`/etc/shells`** : 시스템에서 사용할 수 있는 셸의 경로 목록을 담은 파일.
- **`chsh`** : 로그인 셸을 변경하는 명령. 다음 로그인부터 적용된다.
- **`/sbin/nologin`** : 로그인을 막기 위해 지정하는 셸. 계정은 있지만 접속은 되지 않는다.

## 📝 연습 문제

**문제 1.** 다음 중 리눅스에서 기본 셸로 사용되며 Bourne Again SHell의 줄임말인 것으로 알맞은 것은?

A) bash  
B) csh  
C) tcsh  
D) ksh  

**정답: A**  
해설: bash는 Bourne Again SHell의 줄임말로 GNU 프로젝트에서 Brian Fox가 개발했으며 대부분의 리눅스 배포판에서 기본 셸로 채택하고 있습니다. ksh는 David Korn이 만든 Korn shell, csh는 Bill Joy가 만든 C shell이며 tcsh는 csh의 개선판입니다.

---

**문제 2.** 다음 중 C 셸 계열에 속하는 셸로 알맞은 것은?

A) bash  
B) ksh  
C) tcsh  
D) dash  

**정답: C**  
해설: 셸은 Bourne 계열과 C 계열로 나뉘며 C 계열에 속하는 것은 csh와 그 개선판인 tcsh 두 가지입니다. bash, ksh, dash, zsh는 모두 Bourne shell에서 갈라져 나온 Bourne 계열입니다.

---

**문제 3.** 다음 중 Korn shell을 개발한 사람으로 알맞은 것은?

A) Bill Joy  
B) David Korn  
C) Stephen Bourne  
D) Brian Fox  

**정답: B**  
해설: Korn shell은 이름 그대로 David Korn이 개발했으며 Bourne shell과 호환되면서 C shell의 편의 기능을 함께 담았습니다. Stephen Bourne은 sh를, Bill Joy는 csh를, Brian Fox는 bash를 만들었습니다.

---

**문제 4.** 다음 중 시스템에서 사용할 수 있는 셸의 목록을 담고 있는 파일로 알맞은 것은?

A) /etc/passwd  
B) /etc/profile  
C) /etc/bashrc  
D) /etc/shells  

**정답: D**  
해설: `/etc/shells`에는 그 시스템에서 로그인 셸로 사용할 수 있는 셸의 절대 경로가 나열되어 있습니다. `chsh` 명령은 이 목록에 등록된 셸로만 변경을 허용합니다. `/etc/passwd`는 각 사용자에게 지정된 셸을 마지막 필드에 담고 있습니다.

---

**문제 5.** 다음 중 사용자의 로그인 셸을 변경하는 명령으로 알맞은 것은?

A) chsh  
B) chmod  
C) chown  
D) chgrp  

**정답: A**  
해설: `chsh`(change shell)는 `/etc/passwd`의 마지막 필드에 기록된 로그인 셸을 변경하며 다음 로그인부터 적용됩니다. `chmod`는 권한, `chown`은 소유자, `chgrp`는 그룹을 바꾸는 명령입니다.
