# Day 4 - 주변장치 활용: 프린터 · 사운드 · 스캐너

## 📌 핵심 정리

- 세 이름의 **풀네임을 그대로 묻는다** — **CUPS**(프린터) · **ALSA**(사운드) · **SANE**(스캐너).
- **CUPS**는 Common Unix Printing System. **IPP** 프로토콜을 쓰고 **웹 관리 화면이 631 포트**에 있다.
- 프린터 명령은 두 계열이다 — **BSD(`lpr` `lpq` `lprm`)** 와 **System V(`lp` `lpstat` `cancel`)**.
- 사운드는 **OSS에서 ALSA로** 넘어왔다. 지금 리눅스의 표준은 **ALSA** 다.
- 스캐너는 **SANE**, 명령은 **`scanimage`**, 그래픽 도구는 **`xsane`** 이다.

## 프린터 — CUPS

| 시스템 | 뜻 |
|-------|-----|
| **LPD / LPRng** | 예전의 유닉스 인쇄 시스템 |
| **CUPS** | **Common Unix Printing System** — **현재 표준** |

- 애플이 개발에 참여했고 macOS의 인쇄 시스템이기도 하다.
- **IPP(Internet Printing Protocol)** 를 기본 프로토콜로 쓴다. 네트워크 프린터를 표준 방식으로 다루기 위해서다.

| 항목 | 값 |
|------|-----|
| **웹 관리 화면** | **`http://localhost:631`** |
| **설정 파일** | **`/etc/cups/cupsd.conf`** |
| 프린터 목록 | `/etc/cups/printers.conf` |
| 데몬 | `cupsd` |
| 스풀 디렉터리 | `/var/spool/cups` |

> **631 포트**와 **`/etc/cups/cupsd.conf`** 는 값 그대로 출제된다.

### 인쇄 한 건이 지나가는 길

```text
   lpr report.txt
        │  인쇄 요청
        ▼
   cupsd (스케줄러)  ──►  /var/spool/cups 에 작업 저장, 번호 부여
        │
        ▼
   필터              ──►  문서를 그 프린터가 알아듣는 형식으로 변환 (PPD 참고)
        │
        ▼
   백엔드            ──►  usb · ipp · lpd · socket 중 맞는 길로 전송
        │
        ▼
   프린터
```

- `lpr`은 **작업을 맡기고 바로 끝난다.** 실제 인쇄는 데몬 `cupsd`가 순서대로 처리한다. 프린터가 꺼져 있어도 명령이 성공하고 작업이 대기열에 남는 이유다.
- **PPD(PostScript Printer Description)** 는 그 프린터의 용지·해상도·기능을 적어 둔 파일로 `/etc/cups/ppd/`에 놓인다. 프린터를 등록할 때 모델을 고르는 것이 곧 PPD를 고르는 일이다.
- 기록은 **`/var/log/cups/`** 아래 `access_log`·`error_log`에 남는다.

| 파일 | 담는 것 | 누가 고치나 |
|------|--------|-----------|
| **`cupsd.conf`** | **데몬의 동작** — 어느 주소·포트에서 받을지, 누가 접근할 수 있는지 | 관리자가 직접 |
| `printers.conf` | **등록된 프린터 목록**과 각 프린터의 장치 주소 | 웹 화면·`lpadmin`이 대신 쓴다 |
| `/etc/printcap` | 예전 **LPD 방식의 프린터 목록**. CUPS는 옛 프로그램과의 호환용으로만 만들어 둔다 | — |

- 기본 설정의 `cupsd.conf`는 **`localhost:631`만** 연다. 그래서 웹 관리 화면도 그 컴퓨터에서 `http://localhost:631`로 들어간다.
- 프린터 등록은 웹 화면 말고 명령으로도 한다.

```bash
lpadmin -p printer1 -E -v ipp://192.168.0.50/ipp/print -m everywhere   # 등록
lpadmin -d printer1                                                    # 기본 프린터로 지정
lpadmin -x printer1                                                    # 삭제
```

| `lpadmin` 옵션 | 뜻 |
|--------------|-----|
| **`-p`** | 다룰 **프린터 이름** |
| `-E` | 등록하면서 바로 **사용 가능** 상태로 |
| `-v` | 프린터가 있는 곳 — **장치 주소(URI)** |
| `-m` | 모델(드라이버·PPD) |
| **`-d`** | **기본 프린터** 지정 |
| **`-x`** | 프린터 **삭제** |

### 인쇄 명령 두 계열

| 하는 일 | **BSD 계열** | **System V 계열** |
|--------|------------|------------------|
| **출력** | **`lpr`** | **`lp`** |
| **대기열 확인** | **`lpq`** | **`lpstat`** |
| **취소** | **`lprm`** | **`cancel`** |
| 제어 | `lpc` | — |

```bash
lpr -P printer1 report.txt     # 지정한 프린터로 출력
lpr -# 3 report.txt            # 3부 출력
lpq                            # 대기열 확인
lpq -P printer1
lprm 12                        # 12번 작업 취소
lprm -                         # 내 작업 전부 취소
lpstat -p                      # 프린터 상태 (System V)
cancel 12                      # 취소 (System V)
```

- **`lpr`은 출력, `lpq`는 큐 조회, `lprm`은 취소** — 세 개가 한 묶음이다.
- 두 계열의 **대응 관계**를 묻는 문제가 나온다. `lpr`↔`lp`, `lpq`↔`lpstat`, `lprm`↔`cancel`.
- 대기 중인 인쇄 작업을 **스풀(spool)** 이라 하고 `/var/spool/cups`에 쌓인다.

### 대기열을 보고 취소하기

```text
$ lpr -P printer1 report.txt
$ lpq -P printer1
printer1 is ready and printing
Rank    Owner   Job     File(s)                         Total Size
active  alice   12      report.txt                      2048 bytes
1st     bob     13      memo.txt                        1024 bytes
$ lprm 12
$ lpq -P printer1
printer1 is ready and printing
Rank    Owner   Job     File(s)                         Total Size
active  bob     13      memo.txt                        1024 bytes
```

| 열 | 뜻 |
|----|-----|
| `Rank` | 순서. **`active`가 지금 인쇄 중**, `1st`·`2nd`가 그 뒤 차례 |
| `Owner` | 작업을 맡긴 사용자 |
| **`Job`** | **작업 번호** — `lprm`과 `cancel`에 주는 값 |

- **`lprm`에 주는 숫자는 작업 번호(Job)** 다. 파일 이름이나 프린터 이름이 아니다.
- 일반 사용자는 **자기 작업만** 취소할 수 있다. 위에서 alice는 12번은 지울 수 있지만 bob의 13번은 못 지운다. root는 모두 가능하다.

### 같은 일, 다른 옵션 글자

| 하는 일 | BSD | System V |
|--------|-----|----------|
| 프린터 지정 | `lpr` **`-P`** `printer1` | `lp` **`-d`** `printer1` |
| 여러 부 출력 | `lpr` **`-#`** `3` | `lp` **`-n`** `3` |
| 한 작업 취소 | `lprm 12` | `cancel 12` 또는 `cancel printer1-12` |
| 내 작업 전부 취소 | `lprm -` | `cancel -a` |

| `lpstat` 옵션 | 보여 주는 것 |
|-------------|------------|
| `-p` | **프린터**의 상태 (사용 가능한지, 인쇄 중인지) |
| `-o` | 대기 중인 **작업** 목록 |
| `-d` | **기본 프린터** |
| `-a` | 대기열이 작업을 **받고 있는지** |
| `-t` | 위 정보를 **전부** |

- **`lpr -P`의 `P`는 대문자**다. System V에서는 같은 일을 `-d`(destination)가 한다. 두 계열의 옵션을 섞은 `lpr -d`·`lp -P` 같은 보기는 틀린 것이다.
- System V 쪽은 작업을 **`프린터이름-번호`**(`printer1-12`)로 부른다.
- `lpc`는 프린터와 대기열을 **제어**하는 BSD 명령이다. CUPS에서는 `lpc status`로 상태를 보는 정도만 쓴다.

| 인쇄가 안 될 때 | 볼 곳 |
|--------------|------|
| 작업이 대기열에 들어갔는지 | `lpq` · `lpstat -o` |
| 프린터가 멈춤 상태인지 | `lpstat -p` |
| 데몬이 떠 있는지 | `systemctl status cups` |
| 무슨 오류였는지 | `/var/log/cups/error_log` |

| 구분 | **LPD · LPRng** | **CUPS** |
|------|---------------|---------|
| 데몬 | `lpd` | `cupsd` |
| 프로토콜 · 포트 | LPD · **515** | **IPP · 631** |
| 프린터 목록 파일 | **`/etc/printcap`** | `/etc/cups/printers.conf` |
| 관리 방법 | 설정 파일을 직접 편집 | **웹 화면**, `lpadmin` |

- LPRng는 **LPR Next Generation**, 곧 옛 LPD를 고쳐 만든 것이다. CUPS는 이 둘의 명령(`lpr`·`lpq`·`lprm`)을 **그대로 쓸 수 있게 흉내 내** 주기 때문에 시스템이 바뀌었어도 명령은 그대로다.

## 사운드 — ALSA

| 시스템 | 뜻 |
|-------|-----|
| **OSS** | **Open Sound System** — 예전 방식 |
| **ALSA** | **Advanced Linux Sound Architecture** — **현재 표준** |

- 커널 2.6부터 **ALSA가 기본**이 되었고 OSS는 호환 계층으로 남았다.
- ALSA는 **여러 프로그램이 동시에 소리를 내는 것**, **여러 사운드 카드**를 다루는 것을 지원한다.

| 명령 · 파일 | 하는 일 |
|-----------|--------|
| **`alsamixer`** | **텍스트 화면 볼륨 조절기** |
| `amixer` | 명령줄 볼륨 조절 |
| `aplay` / `arecord` | 재생 / 녹음 |
| `alsactl` | 설정 저장·복원 |
| `/proc/asound/` | 인식된 **사운드 카드 정보** |
| `/dev/dsp`, `/dev/mixer` | **OSS** 시절의 장치 파일 |

```bash
alsamixer            # 볼륨 조절 (M 키로 음소거 해제)
aplay test.wav       # 재생
cat /proc/asound/cards   # 인식된 사운드 카드
lspci | grep -i audio    # 사운드 카드 하드웨어 확인
```

- 소리가 안 날 때는 **음소거(mute)부터 확인**한다. `alsamixer`에서 **`MM`** 표시가 음소거 상태이며 `M` 키로 푼다.
- 그 위에 **PulseAudio**(그리고 최근의 PipeWire)가 얹혀 프로그램별 볼륨을 관리한다.

### 소리가 나기까지의 층

```text
   응용 프로그램 (음악 재생기 · 브라우저)
        │
   사운드 서버     PulseAudio · PipeWire     여러 프로그램의 소리를 섞고 프로그램별로 조절
        │
   ALSA           커널의 사운드 드라이버 + 라이브러리 + 도구(alsamixer · aplay)
        │
   사운드 카드
```

- **ALSA는 커널에 들어 있는 드라이버 층**이다. CUPS의 `cupsd` 같은 **데몬이 따로 없다.** 그래서 포트 번호도 없다.
- PulseAudio는 ALSA를 **대체한 것이 아니라 그 위에 얹힌 것**이다. "현재 리눅스의 표준 사운드 시스템"을 물으면 답은 여전히 **ALSA** 다.

| 구분 | **OSS** | **ALSA** |
|------|--------|---------|
| 풀네임 | Open Sound System | Advanced Linux Sound Architecture |
| 대상 | 여러 유닉스 계열 | **리눅스 전용** |
| 장치 파일 | `/dev/dsp`, `/dev/mixer`, `/dev/audio` | `/dev/snd/` 아래 |
| 설정 파일 | — | `/etc/asound.conf`(전체), `~/.asoundrc`(개인) |
| 옛 프로그램 지원 | — | OSS **호환 계층**을 제공해 옛 프로그램도 돌린다 |

### ALSA 도구 넷

| 도구 | 성격 | 예 |
|------|------|-----|
| **`alsamixer`** | **화면을 띄워** 방향키로 조절 | `alsamixer` |
| `amixer` | **명령 한 줄**로 조절 — 스크립트에 넣기 좋다 | `amixer set Master 80%`, `amixer set Master unmute` |
| `aplay` · `arecord` | 재생 · 녹음 | `aplay -l` (재생 장치 목록), `arecord -d 5 test.wav` (5초 녹음) |
| `alsactl` | 지금의 볼륨 설정을 **저장·복원** | `alsactl store`, `alsactl restore` |

| `alsamixer` 키 | 하는 일 |
|--------------|--------|
| `←` `→` | 조절할 채널(Master, PCM, Mic …) 고르기 |
| `↑` `↓` | 볼륨 올리기 · 내리기 |
| **`M`** | **음소거 켜기·끄기** — 아래 표시가 `MM`이면 음소거, `OO`이면 켜진 상태 |
| `Esc` | 종료 |

- `alsamixer`와 `amixer`는 **하는 일이 같고 화면이 있느냐**만 다르다. `aplay`는 WAV 같은 **압축하지 않은 소리 파일**을 재생한다.
- `alsactl store`를 하지 않으면 조절한 볼륨이 재부팅 뒤에 유지되지 않을 수 있다.

| 소리가 안 날 때 | 확인 |
|--------------|------|
| 카드가 인식됐나 | `cat /proc/asound/cards`, `aplay -l`, `lspci`에서 audio 찾기 |
| 음소거인가 | `alsamixer`에서 `MM` 표시 |
| 볼륨이 0인가 | `alsamixer`의 Master·PCM 막대 |
| 드라이버 모듈이 올라왔나 | `lsmod`에서 `snd`로 시작하는 모듈 |

## 스캐너 — SANE

| 항목 | 값 |
|------|-----|
| **SANE** | **Scanner Access Now Easy** |
| 성격 | 스캐너를 다루는 **표준 API와 도구 모음** |
| 명령 | **`scanimage`** |
| 그래픽 도구 | **`xsane`** |
| 장치 검색 | `sane-find-scanner`, `scanimage -L` |
| 네트워크 공유 | `saned` (데몬) |

```bash
sane-find-scanner        # 연결된 스캐너 찾기
scanimage -L             # 인식된 스캐너 목록
scanimage > out.pnm      # 스캔해서 파일로
xsane                    # 그래픽 스캔 프로그램
```

- **SANE은 스캐너, CUPS는 프린터** — 이름을 바꿔 놓은 보기가 오답으로 쓰이기 쉽다.
- 스캔 결과의 기본 형식은 **PNM** 계열이며 필요하면 다른 형식으로 변환한다.

### 프런트엔드와 백엔드

```text
   프런트엔드   scanimage(명령줄) · xsane(그래픽)     사용자가 다루는 프로그램
        │
      SANE API
        │
   백엔드       스캐너 제조사·모델별 드라이버           장치와 직접 대화
        │
   스캐너
```

- SANE은 **화면(프런트엔드)과 드라이버(백엔드)를 떼어 놓은** 구조다. 그래서 프런트엔드 하나로 여러 회사의 스캐너를 다루고, **`saned` 데몬을 거쳐 다른 컴퓨터에 달린 스캐너**도 쓸 수 있다.
- 백엔드 설정은 **`/etc/sane.d/`** 에 모여 있다. 그 안의 `dll.conf`가 어떤 백엔드를 불러올지 정한다.

| 명령 | 무엇을 찾나 |
|------|-----------|
| `sane-find-scanner` | USB·SCSI에 **스캐너로 보이는 장치가 연결됐는지** — 지원 여부와 무관하게 찾는다 |
| `scanimage -L` | SANE 백엔드가 **실제로 쓸 수 있는** 스캐너 목록 |

```text
$ scanimage -L
device `epson2:libusb:001:004' is a Epson GT-1500 flatbed scanner
$ scanimage -d epson2:libusb:001:004 --resolution 300 > page1.pnm
```

- 앞의 명령에서는 보이는데 뒤의 명령에서 안 보이면 **연결은 됐지만 맞는 백엔드가 없다**는 뜻이다.
- **`scanimage`는 결과를 화면(표준 출력)으로 내보낸다.** 그래서 `>`로 파일에 받는다. `-d`로 장치를 고르며, 해상도 같은 세부 옵션은 스캐너마다 다르다.
- `xsane`은 미리보기를 보며 영역을 잡는 그래픽 프런트엔드로, 이미지 편집기 GIMP 안에서 불러 쓸 수도 있다.

## 세 가지 한눈에

| 장치 | **시스템** | 풀네임 | 대표 명령 |
|------|----------|-------|----------|
| **프린터** | **CUPS** | **Common Unix Printing System** | `lpr` `lpq` `lprm` |
| **사운드** | **ALSA** | **Advanced Linux Sound Architecture** | `alsamixer` `aplay` |
| **스캐너** | **SANE** | **Scanner Access Now Easy** | `scanimage` `xsane` |

| 옛것 | 새것 |
|------|------|
| LPD / LPRng | **CUPS** |
| **OSS** | **ALSA** |

| 구분 | **CUPS** | **ALSA** | **SANE** |
|------|---------|---------|---------|
| 정체 | 인쇄 **서버(데몬)** | 커널 **드라이버 층** | 스캐너 **API와 도구** |
| 데몬 | `cupsd` | 없음 | `saned` (네트워크 공유할 때만) |
| 설정 위치 | `/etc/cups/` | `/etc/asound.conf` | `/etc/sane.d/` |
| 그래픽·화면 도구 | 웹 화면(631) | `alsamixer` | `xsane` |
| 명령줄 도구 | `lpr` `lpq` `lprm` | `amixer` `aplay` `arecord` | `scanimage` |
| 인식 확인 | `lpstat -p` | `/proc/asound/cards` | `scanimage -L` |

- 이름의 **머리글자가 대상을 알려 준다** — CU**P**S의 P는 Printing, AL**S**A의 S는 Sound, **S**ANE의 S는 Scanner다. ALSA와 SANE이 둘 다 S라 헷갈리면 **ALSA에는 Linux Sound가, SANE에는 Scanner가 통째로 들어 있다**고 풀어서 본다.

> 내일은 이번 주의 패키지와 장치를 한 장으로 묶어 정리한다.

## 📖 용어

- **CUPS** : Common Unix Printing System. 현재 리눅스의 표준 인쇄 시스템.
- **IPP** : Internet Printing Protocol. CUPS가 사용하는 네트워크 인쇄 프로토콜.
- **스풀(spool)** : 인쇄 대기열에 쌓인 작업. `/var/spool/cups`에 저장된다.
- **`lpr` / `lpq` / `lprm`** : BSD 계열의 출력 / 대기열 확인 / 취소 명령.
- **OSS** : Open Sound System. ALSA 이전에 쓰이던 사운드 시스템.
- **ALSA** : Advanced Linux Sound Architecture. 현재 리눅스의 표준 사운드 시스템.
- **`alsamixer`** : 텍스트 화면에서 볼륨을 조절하는 ALSA 도구.
- **SANE** : Scanner Access Now Easy. 리눅스의 표준 스캐너 인터페이스.

## 📝 연습 문제

**문제 1.** 다음 중 CUPS의 웹 기반 관리 화면에 접속할 때 사용하는 포트 번호로 알맞은 것은?

A) 22  
B) 80  
C) 631  
D) 8080  

**정답: C**  
해설: CUPS는 631번 포트에서 웹 관리 인터페이스를 제공하며 `http://localhost:631`로 접속해 프린터를 등록하고 대기열을 관리할 수 있다. 631번은 IPP 프로토콜의 표준 포트이기도 한다. 22번은 SSH, 80번은 HTTP이다.

---

**문제 2.** 다음 중 ALSA의 풀네임으로 알맞은 것은?

A) Advanced Linux Scanner Application  
B) Advanced Linux Sound Architecture  
C) Automatic Linux Sound Adapter  
D) Applied Linux System Audio  

**정답: B**  
해설: ALSA는 Advanced Linux Sound Architecture의 줄임말로 커널 2.6부터 리눅스의 표준 사운드 시스템으로 자리 잡았다. 그 이전에 쓰이던 OSS는 Open Sound System이며 현재는 호환 계층으로만 남아 있다.

---

**문제 3.** 다음 중 리눅스에서 스캐너를 다루기 위한 표준 인터페이스로 알맞은 것은?

A) CUPS  
B) ALSA  
C) LPRng  
D) SANE  

**정답: D**  
해설: SANE은 Scanner Access Now Easy의 줄임말로 스캐너를 다루는 표준 API와 도구 모음이다. 명령줄에서는 `scanimage`, 그래픽 환경에서는 `xsane`을 사용한다. CUPS는 인쇄, ALSA는 사운드를 담당한다.

---

**문제 4.** 다음 중 BSD 계열에서 인쇄 대기열의 목록을 확인하는 명령으로 알맞은 것은?

A) lpq  
B) lpr  
C) lprm  
D) cancel  

**정답: A**  
해설: `lpq`는 현재 인쇄 대기열에 어떤 작업이 있는지 보여 주는 BSD 계열 명령이며 System V 계열의 `lpstat`에 대응한다. `lpr`은 출력 요청, `lprm`은 작업 취소이고 `cancel`은 System V 계열의 취소 명령이다.

---

**문제 5.** 다음 중 CUPS의 주 설정 파일로 알맞은 것은?

A) /etc/printcap  
B) /etc/cups/cupsd.conf  
C) /etc/cups/printers.conf  
D) /var/spool/cups  

**정답: B**  
해설: `cupsd.conf`는 CUPS 데몬의 동작과 접근 권한을 정의하는 주 설정 파일이다. `printers.conf`는 등록된 프린터의 정보를 담고 있으며, `/var/spool/cups`는 인쇄 작업이 대기하는 스풀 디렉터리이다.
