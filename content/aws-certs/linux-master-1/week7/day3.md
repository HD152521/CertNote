# Day 3 - 커널과 모듈: 시스템의 심장과 그 확장 부품 다루기

## 📌 핵심 정리

- 리눅스 커널은 **모듈식 모놀리식(modular monolithic)** — 핵심은 한 덩어리로 상주하되, 드라이버 등은 **끼우고 뺄 수 있는 모듈(.ko)**로 분리돼 있다.
- 위치: 커널 이미지는 `/boot/vmlinuz-버전`, 모듈은 **`/lib/modules/$(uname -r)/`**. 현재 버전은 `uname -r`로 본다.
- 모듈 조회는 `lsmod`(적재 목록·Used by)와 `modinfo`(설명·의존성·파라미터).
- 적재·제거는 **저수준 `insmod`/`rmmod`(전체 경로, 의존성 수동)**와 **고수준 `modprobe`/`modprobe -r`(이름만, 의존성 자동)**. rpm vs yum과 같은 구도다.
- 커널 컴파일 순서는 **`make menuconfig`(설정·.config) → `make`(빌드) → `make modules_install`(/lib/modules) → `make install`(/boot + GRUB)**. 설정 시 `*`(내장)/`M`(모듈)/빈칸(제외).

## 커널의 구조와 위치

- **커널(kernel)**은 가장 안쪽에서 하드웨어를 직접 통제하는 핵심 코드다. CPU 시간 배분(스케줄링), 메모리 할당, 파일 시스템·네트워크·장치 관리를 맡는다.
- 셸·명령·응용 프로그램은 모두 커널 위에서 돌며, **시스템 콜**로 요청을 보내 하드웨어와 간접적으로 대화한다.
- 새 USB 장치를 꽂으면 해당 드라이버 모듈이 자동 적재되고 안 쓰면 내릴 수 있다 → 커널 전체를 다시 컴파일하지 않고 기능을 **동적으로 확장**한다.
- 커널 자체는 부팅 시 메모리로 올라오는 **압축된 단일 이미지 파일**이며 보통 `/boot` 아래에 있다.

```bash
uname -r                    # 현재 실행 중인 커널 버전(예: 5.14.0-70.el9.x86_64)
uname -a                    # 커널·호스트명·아키텍처 전체 정보
ls /boot                    # vmlinuz-*, initramfs-*, config-* 등
```

| 파일/경로 | 의미 |
|-----------|------|
| `/boot/vmlinuz-버전` | 압축된 커널 이미지(부팅 시 적재) |
| `/boot/initramfs-버전.img` | 초기 램디스크(부팅 초반 드라이버) |
| `/boot/config-버전` | 그 커널을 만들 때의 빌드 설정 |
| `/lib/modules/버전/` | 그 커널용 모듈(.ko)들이 사는 곳 |
| `/proc/sys/` | 커널 파라미터를 실시간 조회·수정 |

> 💡 **개념**: `vmlinuz`의 `z`는 압축(zipped)을 뜻한다 — 부팅 시 메모리로 풀리는 압축 커널 이미지다. 모듈은 `/lib/modules/$(uname -r)/` 아래에 커널 버전별로 분리 보관된다. 이 디렉터리 구조 때문에 여러 커널 버전을 동시에 설치해도 모듈이 섞이지 않는다. `uname -r`이 가리키는 버전이 곧 현재 모듈 디렉터리 이름이다.

> 🔍 **더 깊이**: 커널 파라미터는 `/proc/sys/`(읽기·쓰기 가능한 가상 파일)와 `sysctl` 명령으로 실시간 조정된다. 예컨대 `sysctl net.ipv4.ip_forward`로 IP 포워딩 상태를 보고 `sysctl -w net.ipv4.ip_forward=1`로 켤 수 있다. 영구 적용은 `/etc/sysctl.conf`에 적는다. 이는 "커널을 다시 빌드하지 않고 동작을 바꾸는" 또 다른 방법이다.

## 모듈 조회 — lsmod와 modinfo

- 모듈(커널 객체, **`.ko` = kernel object**)은 커널에 동적으로 끼우는 부품이다.
- 첫걸음은 **현재 적재된 모듈 목록**과 **각 모듈의 정보**를 보는 것.

```bash
lsmod                       # 현재 적재된 모든 모듈 목록(+사용 횟수, 의존 모듈)
modinfo e1000               # 특정 모듈의 상세 정보(설명, 의존성, 파라미터)
modinfo -d e1000            # 모듈 설명만
```

- `lsmod`의 출력은 세 열이다.

```
Module          Size    Used by
e1000           159744  0
bluetooth       806912  9 btusb,...
```

| 열 | 의미 |
|----|------|
| Module | 모듈 이름 |
| Size | 메모리 점유 크기 |
| Used by | 사용 횟수 + 이 모듈에 의존하는 다른 모듈 |

> 💡 **개념**: `lsmod`의 "Used by" 숫자가 0보다 크면 **다른 무언가가 그 모듈을 쓰고 있다**는 뜻이라 함부로 내릴 수 없다. 옆에 의존 모듈 이름까지 적혀 있다. `lsmod`는 사실 `/proc/modules`를 보기 좋게 정리해 보여주는 것이다. `modinfo`는 모듈 파일 자체에서 메타데이터(저자, 라이선스, 파라미터, 의존성)를 읽어온다.

> 🔍 **더 깊이**: `modinfo`로 보면 그 모듈이 받는 **파라미터**를 알 수 있다(`parm:` 줄). 모듈을 올릴 때 `modprobe 모듈 파라미터=값`으로 동작을 조정할 수 있고, 부팅 시 자동 적용하려면 `/etc/modprobe.d/*.conf`에 `options 모듈 파라미터=값`을 적는다. 또 특정 모듈이 자동 적재되지 않게 막으려면 같은 디렉터리에 `blacklist 모듈명`을 쓴다.

## 모듈 적재와 제거 — insmod·rmmod vs modprobe

- 모듈을 올리고 내리는 명령은 두 갈래다.
  - **저수준**(`insmod`/`rmmod`) — 단일 모듈을 직접 다룬다.
  - **고수준**(`modprobe`) — 의존성까지 자동 처리한다.
- 이 구조는 어제 배운 **rpm vs yum 관계와 똑같다.**

```bash
insmod /lib/modules/.../e1000.ko   # 모듈 직접 적재(전체 경로, 의존성 수동)
rmmod e1000                         # 모듈 제거
modprobe e1000                      # 의존 모듈까지 자동 적재(이름만)
modprobe -r e1000                   # 의존성 고려해 제거(remove)
```

| 작업 | 저수준 | 고수준(권장) |
|------|--------|--------------|
| 적재 | `insmod /경로/mod.ko` | `modprobe mod` |
| 제거 | `rmmod mod` | `modprobe -r mod` |
| 입력 | **전체 경로** | **모듈 이름** |
| 의존성 | 수동(미해결 시 실패) | **자동 해결** |

> 💡 **개념**: `insmod`와 `modprobe`의 가장 큰 차이는 **의존성 자동 해결**이다. `insmod`는 지정한 `.ko` 하나만 올리므로, 그 모듈이 다른 모듈을 필요로 하면 "Unknown symbol" 같은 오류로 실패한다. `modprobe`는 `/lib/modules/.../modules.dep`(의존성 지도)를 참고해 필요한 모듈을 먼저 올린 뒤 대상을 적재한다. 게다가 `insmod`는 전체 경로를 줘야 하지만 `modprobe`는 이름만 주면 된다. 그래서 실무·시험 모두 `modprobe`가 정답인 경우가 대부분이다.

> 🔍 **더 깊이**: `modprobe`가 참고하는 `modules.dep`는 `depmod` 명령이 생성한다. 새 모듈을 `/lib/modules/.../`에 넣은 뒤 `depmod -a`를 실행해야 의존성 지도가 갱신되어 `modprobe`가 그 모듈을 찾을 수 있다. 커널 모듈을 직접 빌드해 추가할 때 이 단계를 빠뜨리면 modprobe가 "module not found"를 낸다.

> ⚠️ **함정**: `rmmod`로 모듈을 내리려는데 "Module is in use"로 실패하는 일이 잦다. `lsmod`의 "Used by"가 0이 아니기 때문이다. 강제로 내리려는 `rmmod -f`는 위험해 권장되지 않는다. 정석은 그 모듈에 의존하는 상위 모듈을 먼저 내리거나, `modprobe -r`로 의존성을 고려해 한꺼번에 제거하는 것이다.

```bash
# 직접 쳐보기 — 모듈 관찰 (안전: 조회 위주)
lsmod | head                       # 적재된 모듈들
lsmod | wc -l                      # 모듈 개수
modinfo loop                       # loop 모듈 정보
cat /proc/modules | head           # lsmod의 원본
ls /lib/modules/$(uname -r)/kernel | head   # 모듈 트리
```

## 커널 컴파일 흐름

- 새 하드웨어 지원, 기능 최적화, 패치 적용 등을 위해 커널 소스를 직접 컴파일하기도 한다.
- 어제 배운 소스 컴파일과 닮았지만 **설정(config) 단계가 핵심**이라는 점이 다르다.

```bash
cd /usr/src/linux-버전               # 커널 소스 디렉터리
make menuconfig                      # 메뉴 기반 커널 설정(.config 생성)
make                                  # 커널 이미지 + 모듈 컴파일
make modules_install                 # 컴파일된 모듈을 /lib/modules/로 설치
make install                          # 커널 이미지를 /boot에 설치 + 부트로더 갱신
```

| 단계 | 명령 | 하는 일 |
|------|------|---------|
| 1. 설정 | `make menuconfig` | 어떤 기능·드라이버를 포함/모듈화/제외할지 선택 → `.config` |
| 2. 빌드 | `make` | 커널 이미지(vmlinuz)와 모듈(.ko) 컴파일 |
| 3. 모듈 설치 | `make modules_install` | 모듈을 `/lib/modules/버전/`에 복사 |
| 4. 커널 설치 | `make install` | vmlinuz·initramfs를 `/boot`에 두고 부트로더(GRUB) 갱신 |

> 💡 **개념**: 커널 설정 단계에서 각 기능은 세 상태 중 하나로 정해진다 — **`*`(내장: 커널에 포함)**, **`M`(모듈: 별도 .ko로 빌드해 필요 시 적재)**, **빈칸(제외)**. 자주 쓰는 핵심 기능은 내장(`*`)으로, 가끔 쓰는 장치 드라이버는 모듈(`M`)로 두는 것이 정석이다. 모듈로 두면 커널 이미지가 작아지고 메모리도 아낀다. 이 선택이 곧 `make modules_install`로 설치될 모듈 목록을 결정한다.

> 🔍 **더 깊이**: 설정 도구는 여러 가지다. `make config`(질문을 순서대로 묻는 원시적 방식), `make menuconfig`(텍스트 메뉴, ncurses 기반, 가장 흔함), `make xconfig`(X 윈도 GUI), `make oldconfig`(기존 `.config`를 새 커널에 맞춰 바뀐 항목만 질문). 보통 현재 커널의 `/boot/config-$(uname -r)`를 `.config`로 복사한 뒤 `make oldconfig`로 시작하면 안전하다.

> ⚠️ **함정**: 단계 순서를 바꾸면 안 된다. `make`(빌드)가 끝나야 모듈과 이미지가 생기므로 `make modules_install`·`make install`은 그 뒤에 온다. 또 `make modules_install`(모듈을 /lib/modules로)과 `make install`(커널을 /boot로 + GRUB 갱신)은 **목적지가 다른 별개 단계**다. 둘을 하나로 혼동하는 보기가 시험에 나온다. 새 커널 설치 후에는 부트로더 메뉴에서 새 커널을 선택해 부팅해야 적용된다.

> 📚 **유래/사례**: 리누스 토르발스가 1991년 처음 공개한 커널은 모듈 개념이 없는 순수 모놀리식이었다 — 새 장치를 지원하려면 커널 전체를 다시 컴파일해야 했다. 1995년경 적재 가능 커널 모듈(LKM)이 도입되면서, 부팅된 커널에 드라이버를 동적으로 끼우고 빼는 일이 가능해졌다. 오늘날 USB를 꽂으면 즉시 인식되는 것, 배포판이 수천 종의 하드웨어를 하나의 커널로 지원하는 것 모두 이 모듈 구조 덕분이다. 모놀리식의 성능과 마이크로커널의 유연성을 절충한 "모듈식 모놀리식"이 리눅스의 설계 철학이다.

## 📖 용어

- **커널(kernel)** : 하드웨어를 직접 통제하는 운영체제의 심장. 스케줄링·메모리·파일시스템·장치를 모두 맡는다.
- **모듈식 모놀리식** : 핵심은 한 덩어리로 상주하되 드라이버 등은 동적 모듈로 뺀 리눅스의 절충 설계.
- **`.ko`(kernel object)** : 커널 모듈 파일. 커널에 끼웠다 뺄 수 있는 부품이다.
- **`vmlinuz`** : 압축된(z = zipped) 커널 이미지. 부팅 시 메모리로 풀린다.
- **initramfs** : 부팅 초반에 필요한 드라이버를 담은 초기 램디스크.
- **`/lib/modules/$(uname -r)/`** : 그 커널 버전 전용 모듈이 사는 곳. 버전별로 나뉘어 있어 여러 커널을 함께 둬도 섞이지 않는다.
- **`lsmod`의 Used by** : 그 모듈을 쓰고 있는 횟수와 의존 모듈. 0이 아니면 `rmmod`가 실패한다.
- **`modules.dep`** : 모듈 간 의존성 지도. `depmod -a`가 만들고 `modprobe`가 참고한다.
- **`insmod` vs `modprobe`** : 전체 경로로 단일 모듈만 올리기 vs 이름만으로 의존 모듈까지 자동으로 올리기.
- **blacklist** : `/etc/modprobe.d/*.conf`에 적어 특정 모듈이 자동 적재되지 않게 막는 설정.
- **`sysctl` / `/proc/sys/`** : 커널을 다시 빌드하지 않고 동작 파라미터를 실시간으로 바꾸는 명령과 가상 파일. 영구 적용은 `/etc/sysctl.conf`.
- **`*` / `M` / 빈칸** : 커널 설정에서 기능을 내장 / 모듈로 분리 / 제외하는 세 가지 선택.

## 📝 연습 문제

**문제 1.** 현재 실행 중인 커널의 버전을 확인하는 명령은?

A) `uname -r`

B) `lsmod -v`

C) `modinfo kernel`

D) `cat /boot/vmlinuz`

**정답: A**

해설: `uname -r`은 현재 실행 중인 커널의 릴리스(버전) 문자열을 출력한다. B의 `lsmod`는 적재된 모듈 목록 도구이고, C의 `modinfo`는 특정 모듈 정보를 보며, D는 압축된 바이너리 커널 이미지를 그냥 출력하려는 잘못된 시도다. `uname -a`는 더 많은 정보를 함께 보여준다.

---

**문제 2.** `insmod`와 `modprobe`의 차이로 가장 정확한 것은?

A) `insmod`는 의존 모듈까지 자동 적재하고, `modprobe`는 단일 모듈만 올린다

B) `modprobe`는 의존성을 자동 해결하고 이름만으로 적재하며, `insmod`는 전체 경로를 받아 단일 모듈만 올린다

C) 둘 다 모듈을 제거하는 명령이다

D) `insmod`는 모듈 정보를 보여주고 `modprobe`는 목록을 보여준다

**정답: B**

해설: `modprobe`는 `modules.dep`를 참고해 의존 모듈을 먼저 올리고 모듈 이름만으로 동작한다. `insmod`는 지정한 `.ko` 하나만 전체 경로로 올려 의존성이 빠지면 실패한다. A는 둘을 뒤바꿨고, C는 적재 명령을 제거로 본 오답, D는 `modinfo`/`lsmod`와 혼동한 설명이다.

---

**문제 3.** `lsmod` 출력에서 어떤 모듈의 "Used by"가 0이 아닐 때의 의미는?

A) 그 모듈이 손상되었다

B) 다른 모듈이나 기능이 그 모듈을 사용 중이라 곧바로 제거하기 어렵다

C) 그 모듈의 버전이 커널과 맞지 않는다

D) 그 모듈이 자동 적재 대상에서 제외되었다

**정답: B**

해설: "Used by" 값은 그 모듈을 참조하는 사용 횟수와 의존 모듈을 나타낸다. 0이 아니면 무언가가 사용 중이므로 `rmmod`가 "Module is in use"로 실패한다. 정석은 상위 모듈을 먼저 내리거나 `modprobe -r`로 의존성을 고려해 제거하는 것이다. A·C·D는 사용 횟수와 무관한 해석이다.

---

**문제 4.** 특정 모듈의 설명·의존성·파라미터 등 상세 정보를 보는 명령은?

A) `lsmod 모듈명`

B) `modinfo 모듈명`

C) `rmmod 모듈명`

D) `depmod 모듈명`

**정답: B**

해설: `modinfo`는 모듈 파일에서 저자·라이선스·의존성·파라미터(`parm:`) 같은 메타데이터를 읽어 보여준다. A의 `lsmod`는 인자로 특정 모듈 정보를 주는 용도가 아니라 전체 목록을 보는 도구이고, C는 제거, D는 의존성 지도(`modules.dep`)를 생성하는 명령이다.

---

**문제 5.** 커널 컴파일에서 `make menuconfig` 단계의 역할로 옳은 것은?

A) 컴파일된 모듈을 `/lib/modules`에 복사한다

B) 어떤 기능을 내장(*)·모듈(M)·제외(빈칸)할지 선택해 `.config` 파일을 만든다

C) 커널 이미지를 `/boot`에 설치하고 부트로더를 갱신한다

D) 소스 아카이브의 압축을 해제한다

**정답: B**

해설: `make menuconfig`는 메뉴 방식으로 각 기능의 포함 여부(내장·모듈·제외)를 정해 `.config`를 생성하는 설정 단계다. A는 `make modules_install`, C는 `make install`, D는 `tar`의 역할이다. 설정이 끝나야 그 내용대로 `make`가 빌드한다.

---

**문제 6.** 커널 컴파일의 올바른 단계 순서는?

A) make → make menuconfig → make install → make modules_install

B) make menuconfig → make → make modules_install → make install

C) make install → make → make menuconfig → make modules_install

D) make modules_install → make menuconfig → make → make install

**정답: B**

해설: 먼저 `make menuconfig`로 설정(.config)하고, `make`로 커널 이미지와 모듈을 빌드한 뒤, `make modules_install`로 모듈을 `/lib/modules`에 설치하고, 마지막에 `make install`로 커널을 `/boot`에 두고 부트로더를 갱신한다. 설정→빌드→모듈설치→커널설치 순서가 핵심이며 나머지는 순서가 뒤섞여 있다.

---

**문제 7.** 리눅스 커널을 "모듈식 모놀리식(modular monolithic)"이라 부르는 이유로 가장 적절한 것은?

A) 모든 기능이 사용자 공간에서 독립 프로세스로 실행되기 때문이다

B) 핵심 기능은 한 덩어리로 메모리에 상주하되, 드라이버 등은 필요 시 끼우고 뺄 수 있는 모듈로 분리되어 있기 때문이다

C) 커널이 여러 개의 작은 마이크로커널로 나뉘어 있기 때문이다

D) 커널을 컴파일할 수 없도록 하나의 파일로 고정했기 때문이다

**정답: B**

해설: 리눅스는 핵심을 단일 덩어리(monolithic)로 두되, 장치 드라이버·파일 시스템 등은 동적으로 적재·제거 가능한 모듈로 분리한 절충 구조다. 그래서 커널 전체를 다시 빌드하지 않고도 기능을 확장한다. A·C는 마이크로커널 설명에 가깝고, D는 모듈 구조 자체와 모순된다.

---
