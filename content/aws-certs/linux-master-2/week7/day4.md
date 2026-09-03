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

- **SANE은 스캐너, CUPS는 프린터** — 이름을 바꿔 놓은 보기가 자주 나온다.
- 스캔 결과의 기본 형식은 **PNM** 계열이며 필요하면 다른 형식으로 변환한다.

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
해설: CUPS는 631번 포트에서 웹 관리 인터페이스를 제공하며 `http://localhost:631`로 접속해 프린터를 등록하고 대기열을 관리할 수 있습니다. 631번은 IPP 프로토콜의 표준 포트이기도 합니다. 22번은 SSH, 80번은 HTTP입니다.

---

**문제 2.** 다음 중 ALSA의 풀네임으로 알맞은 것은?

A) Advanced Linux Scanner Application  
B) Advanced Linux Sound Architecture  
C) Automatic Linux Sound Adapter  
D) Applied Linux System Audio  

**정답: B**  
해설: ALSA는 Advanced Linux Sound Architecture의 줄임말로 커널 2.6부터 리눅스의 표준 사운드 시스템으로 자리 잡았습니다. 그 이전에 쓰이던 OSS는 Open Sound System이며 현재는 호환 계층으로만 남아 있습니다.

---

**문제 3.** 다음 중 리눅스에서 스캐너를 다루기 위한 표준 인터페이스로 알맞은 것은?

A) CUPS  
B) ALSA  
C) LPRng  
D) SANE  

**정답: D**  
해설: SANE은 Scanner Access Now Easy의 줄임말로 스캐너를 다루는 표준 API와 도구 모음입니다. 명령줄에서는 `scanimage`, 그래픽 환경에서는 `xsane`을 사용합니다. CUPS는 인쇄, ALSA는 사운드를 담당합니다.

---

**문제 4.** 다음 중 BSD 계열에서 인쇄 대기열의 목록을 확인하는 명령으로 알맞은 것은?

A) lpq  
B) lpr  
C) lprm  
D) cancel  

**정답: A**  
해설: `lpq`는 현재 인쇄 대기열에 어떤 작업이 있는지 보여 주는 BSD 계열 명령이며 System V 계열의 `lpstat`에 대응합니다. `lpr`은 출력 요청, `lprm`은 작업 취소이고 `cancel`은 System V 계열의 취소 명령입니다.

---

**문제 5.** 다음 중 CUPS의 주 설정 파일로 알맞은 것은?

A) /etc/printcap  
B) /etc/cups/cupsd.conf  
C) /etc/cups/printers.conf  
D) /var/spool/cups  

**정답: B**  
해설: `cupsd.conf`는 CUPS 데몬의 동작과 접근 권한을 정의하는 주 설정 파일입니다. `printers.conf`는 등록된 프린터의 정보를 담고 있으며, `/var/spool/cups`는 인쇄 작업이 대기하는 스풀 디렉터리입니다.
