# Day 2 - 텍스트 처리: 유닉스의 진짜 힘, 파이프라인으로 데이터를 다듬다

## 📌 핵심 정리

- 리눅스에서 설정·로그·명령 출력은 모두 텍스트 스트림이다. 파이프 `|`가 이들을 컨베이어처럼 잇는다.
- 역할 분담: **grep**(행 필터) · **sed**(치환/삭제) · **awk**(필드 처리) · **cut/tr**(열·문자) · **sort/uniq**(정렬·중복).
- `sed 's/패턴/대체/g'`가 최다 출제. `-i`는 원본을 덮어쓰므로 `-i.bak`으로 사본을 남긴다.
- `uniq`는 **연속된** 중복만 지운다. 그래서 항상 `sort | uniq`(또는 `sort -u`)로 짝지어 쓴다.
- BRE는 `+ ? | ( ) {`에 백슬래시가 필요하고, ERE(`grep -E`)는 그냥 쓴다. 셸 와일드카드 `*`와 정규식 `*`는 다르다.

## 파일 내용 보기: cat, head, tail

"모든 것은 파일"만큼 중요한 것이 "모든 것은 텍스트"라는 사고방식입니다. 그 출발점은 파일 내용을 화면에 출력하는 일입니다.

> 💡 **개념: 파이프와 표준 스트림**
> 모든 명령은 표준 입력(stdin), 표준 출력(stdout), 표준 에러(stderr) 세 통로를 가집니다. 파이프 `|`는 한 명령의 stdout을 다음 명령의 stdin으로 연결합니다. `cat log | grep error | sort`처럼 데이터가 흐르는 컨베이어 벨트를 만드는 것입니다. 이 단순한 연결이 텍스트 처리의 거의 모든 마법을 가능하게 합니다.

```bash
cat file.txt            # 파일 전체 내용 출력
cat -n file.txt         # 행 번호와 함께 출력
cat f1.txt f2.txt       # 여러 파일을 이어붙여 출력(concatenate)
cat -A file.txt         # 비출력 문자(탭, 줄끝)까지 표시
head file.txt           # 처음 10행 출력 (기본값)
head -n 5 file.txt      # 처음 5행 출력
head -c 100 file.txt    # 처음 100바이트 출력
tail file.txt           # 마지막 10행 출력
tail -n 20 file.txt     # 마지막 20행 출력
tail -f /var/log/syslog # 파일에 추가되는 내용을 실시간으로 따라가기(follow)
```

- `cat`은 본래 concatenate(이어붙이기)의 약자입니다.
- 작은 파일을 빠르게 확인할 때 좋지만, 거대한 파일을 `cat`으로 출력하면 화면이 폭주합니다.
- 그럴 때는 처음 일부만 보는 `head`나 끝부분만 보는 `tail`을 씁니다.

> 🔍 **더 깊이: tail -f의 마법**
> `tail -f`(follow)는 로그 모니터링의 필수 도구입니다. 파일을 열어둔 채 새로운 줄이 추가될 때마다 자동으로 화면에 표시합니다. 서버 로그를 실시간으로 지켜볼 때 끝없이 활용됩니다. 비슷하게 `tail -F`(대문자)는 파일이 로테이션(삭제 후 재생성)되어도 다시 추적을 이어가므로 운영 환경에서 더 안전합니다.

## 패턴 검색의 왕: grep

`grep`(global regular expression print)은 텍스트에서 패턴과 일치하는 행을 찾아 출력합니다. 리눅스에서 가장 많이 쓰이는 명령 중 하나입니다.

```bash
grep "error" log.txt        # error를 포함한 행 출력
grep -i "error" log.txt     # 대소문자 무시(ignore case)
grep -v "debug" log.txt     # debug를 포함하지 않는 행(invert) 출력
grep -n "error" log.txt     # 행 번호와 함께 출력
grep -c "error" log.txt     # 일치하는 행의 개수만 출력(count)
grep -r "TODO" ./src        # 디렉터리 내 모든 파일 재귀 검색(recursive)
grep -l "error" *.log       # 일치하는 내용을 가진 파일 이름만 출력
grep -w "is" text.txt       # 단어 단위로 정확히 일치(word)
grep -A 2 "error" log.txt   # 일치 행과 그 뒤(After) 2행 함께 출력
grep -B 2 "error" log.txt   # 일치 행과 그 앞(Before) 2행 함께 출력
grep -E "cat|dog" pets.txt  # 확장 정규식(egrep 동등)으로 OR 검색
```

- `grep -E`는 확장 정규표현식(ERE)을 사용하며, 별도의 명령 `egrep`과 동일합니다.
- `grep -F`는 정규식을 무시하고 고정 문자열로 검색하며 `fgrep`과 같습니다.

> 📚 **유래/사례: grep이라는 이상한 이름**
> `grep`은 원조 텍스트 에디터 `ed`의 명령 `g/re/p`에서 유래했습니다. 이는 "global - regular expression - print"의 약자로, "파일 전체에서 정규식과 일치하는 행을 출력하라"는 뜻입니다. 너무 자주 쓰이다 보니 영어권에서는 "grep"이 "검색하다"라는 동사로 쓰일 정도입니다.

## 스트림 편집기: sed

`sed`(stream editor)는 텍스트 스트림을 한 줄씩 읽으면서 편집 명령을 적용합니다. 가장 흔한 용도는 문자열 치환입니다.

```bash
sed 's/old/new/' file.txt       # 각 행의 첫 번째 old를 new로 치환
sed 's/old/new/g' file.txt      # 각 행의 모든 old를 new로 치환(global)
sed 's/old/new/2' file.txt      # 각 행의 두 번째 old만 치환
sed -n '5p' file.txt            # 5번째 행만 출력 (-n은 자동 출력 끔)
sed -n '2,5p' file.txt          # 2~5행 출력
sed '3d' file.txt               # 3번째 행 삭제
sed '/error/d' file.txt         # error를 포함한 행 삭제
sed -i 's/old/new/g' file.txt   # 파일을 직접 수정(in-place)
sed 's/^/> /' file.txt          # 각 행 맨 앞에 "> " 추가
```

- 치환 문법 `s/패턴/대체/플래그`가 가장 자주 출제됩니다.
- `s`는 substitute(치환), `/`는 구분자, 마지막 `g`(global) 플래그는 행 내 모든 일치를 치환하라는 의미입니다.

> ⚠️ **함정: sed -i는 되돌릴 수 없다**
> 기본적으로 `sed`는 결과를 화면에만 출력하고 원본 파일은 건드리지 않습니다. 하지만 `-i`(in-place) 옵션을 붙이면 원본 파일을 직접 덮어씁니다. 실수하면 복구가 어려우므로, 중요한 파일은 `sed -i.bak`처럼 백업 확장자를 지정해 원본 사본을 남기는 습관이 안전합니다.

## 필드 처리의 강자: awk

`awk`는 단순한 명령이 아니라 작은 프로그래밍 언어입니다. 텍스트를 **필드(열) 단위**로 처리하는 데 특화되어 있으며, 기본 형식은 `awk '패턴 {동작}'`입니다.

```bash
awk '{print $1}' file.txt           # 각 행의 첫 번째 필드 출력
awk '{print $1, $3}' file.txt       # 1번째와 3번째 필드 출력
awk '{print $NF}' file.txt          # 마지막 필드 출력(NF=필드 개수)
awk -F: '{print $1}' /etc/passwd    # 구분자를 :로 지정(-F)
awk '{print NR, $0}' file.txt       # 행 번호(NR)와 전체 행($0) 출력
awk '$3 > 100 {print $1}' data.txt  # 3번째 필드가 100 초과인 행의 1열
awk '/error/ {print $2}' log.txt    # error 패턴 일치 행의 2번째 필드
awk 'END {print NR}' file.txt       # 전체 행 수 출력
awk '{sum += $1} END {print sum}' n.txt  # 1열 합계 계산
```

- `$0`은 행 전체, `$1`, `$2`...는 각 필드를 의미합니다.
- 기본 구분자는 공백(스페이스, 탭)이며 `-F` 옵션으로 바꿀 수 있습니다.
- 특별 변수 `NR`(Number of Record)은 현재 행 번호, `NF`(Number of Field)는 현재 행의 필드 개수입니다.

> 🔍 **더 깊이: awk의 BEGIN과 END 블록**
> `awk`에는 특별한 두 패턴이 있습니다. `BEGIN { }`은 입력을 읽기 전에 한 번 실행되고, `END { }`은 모든 입력을 처리한 후 한 번 실행됩니다. 그래서 `awk 'BEGIN{print "시작"} {print} END{print "끝"}'`처럼 헤더/푸터를 붙이거나, `END` 블록에서 누적된 합계를 출력하는 통계 처리에 활용됩니다.

## 정렬과 중복 제거: sort, uniq

```bash
sort file.txt           # 알파벳 순(사전식) 정렬
sort -r file.txt        # 역순 정렬(reverse)
sort -n numbers.txt     # 숫자 순 정렬(numeric)
sort -k 2 data.txt      # 2번째 필드(키) 기준 정렬
sort -t: -k 3 -n /etc/passwd  # 구분자 :, 3번째 필드 숫자 정렬
sort -u file.txt        # 정렬하면서 중복 제거(unique)
uniq file.txt           # 연속된 중복 행 제거
uniq -c file.txt        # 중복 개수와 함께 출력(count)
uniq -d file.txt        # 중복된 행만 출력(duplicated)
uniq -u file.txt        # 중복 없는 유일한 행만 출력
```

> ⚠️ **함정: uniq는 sort와 짝꿍이다**
> `uniq`는 **연속된** 중복 행만 제거합니다. 떨어져 있는 중복은 인식하지 못합니다. 그래서 거의 항상 `sort | uniq` 형태로 함께 씁니다. 먼저 정렬해 같은 행을 모은 뒤 `uniq`로 중복을 제거하는 것입니다. 단순히 정렬 후 중복 제거만 하려면 `sort -u` 한 번이면 충분합니다.

## 열 잘라내기와 문자 변환: cut, tr

```bash
cut -c 1-5 file.txt         # 각 행의 1~5번째 문자 추출
cut -d: -f 1 /etc/passwd    # 구분자 :, 1번째 필드 추출
cut -d, -f 2,4 data.csv     # CSV에서 2,4번째 필드 추출
tr 'a-z' 'A-Z' < file.txt   # 소문자를 대문자로 변환
tr -d ' ' < file.txt        # 공백 문자 삭제(delete)
tr -s ' ' < file.txt        # 연속된 공백을 하나로 압축(squeeze)
echo "hello" | tr 'l' 'L'   # l을 L로 변환 → heLLo
```

- `cut`은 각 행에서 특정 위치나 필드를 잘라냅니다. `-c`는 문자 위치, `-f`는 필드(구분자 기준), `-d`는 구분자를 지정합니다.
- `tr`(translate)은 문자 단위 치환/삭제/압축 도구로, 표준 입력을 받기 때문에 보통 파이프나 리다이렉션(`<`)과 함께 씁니다.

> 💡 **개념: cut의 -d와 -f는 한 쌍**
> `cut -f`로 필드를 추출할 때는 `-d`로 구분자를 함께 지정해야 의미가 있습니다. `-d`를 생략하면 기본 구분자가 **탭**이라서, 공백이나 쉼표로 구분된 데이터는 제대로 잘리지 않습니다. CSV 파일이라면 `-d,`, `/etc/passwd`라면 `-d:`를 반드시 함께 줘야 합니다.

## 단어 세기: wc

```bash
wc file.txt         # 행 수, 단어 수, 바이트 수 순서로 출력
wc -l file.txt      # 행(line) 수만 출력
wc -w file.txt      # 단어(word) 수만 출력
wc -c file.txt      # 바이트(byte) 수
wc -m file.txt      # 문자(character) 수
```

- `wc`(word count)에서 가장 자주 쓰는 옵션은 `-l`(행 수 세기)입니다.
- `grep "error" log | wc -l`은 "error가 몇 번 나오는지"를 세는 단골 패턴입니다.

## 정규표현식 기초

- 정규표현식(regular expression, regex)은 텍스트 패턴을 표현하는 형식 언어입니다.
- `grep`, `sed`, `awk` 모두 정규식을 지원하므로, 정규식을 알면 텍스트 처리 능력이 비약적으로 향상됩니다.

기본 정규식(BRE, Basic Regular Expression)의 메타문자는 다음과 같습니다.

| 메타문자 | 의미 |
|----------|------|
| `.` | 임의의 한 문자 |
| `*` | 바로 앞 문자의 0회 이상 반복 |
| `^` | 행의 시작 |
| `$` | 행의 끝 |
| `[abc]` | a, b, c 중 한 문자 |
| `[^abc]` | a, b, c가 아닌 문자 |
| `[a-z]` | a부터 z 사이 한 문자 |
| `\` | 메타문자를 일반 문자로(이스케이프) |

확장 정규식(ERE, Extended Regular Expression)에서는 추가로 다음을 쓸 수 있습니다.

| 메타문자 | 의미 |
|----------|------|
| `+` | 앞 문자의 1회 이상 반복 |
| `?` | 앞 문자의 0회 또는 1회 |
| `\|` | OR (둘 중 하나) |
| `()` | 그룹화 |
| `{n,m}` | n회 이상 m회 이하 반복 |

```bash
grep "^root" /etc/passwd        # root로 시작하는 행
grep "bash$" /etc/passwd        # bash로 끝나는 행
grep "^$" file.txt              # 빈 행 (시작과 끝이 붙음)
grep "a.c" file.txt             # a, 아무 문자, c (예: abc, axc)
grep "ab*c" file.txt            # ac, abc, abbc... (b가 0회 이상)
grep -E "ab+c" file.txt         # abc, abbc... (b가 1회 이상, ERE)
grep -E "(cat|dog)" pets.txt    # cat 또는 dog
```

> 🔍 **더 깊이: BRE와 ERE의 결정적 차이**
> 기본 정규식(BRE)에서는 `+`, `?`, `|`, `(`, `)`, `{`가 일반 문자로 취급되어, 메타 기능을 쓰려면 백슬래시를 붙여 `\+`, `\?`, `\|`처럼 써야 합니다. 반면 확장 정규식(ERE, `grep -E` 또는 `egrep`)에서는 이들이 백슬래시 없이 메타문자로 동작합니다. 즉 BRE의 `\(\)`가 ERE에서는 `()`입니다. 이 반전이 시험의 함정으로 자주 등장합니다.

> ⚠️ **함정: 셸 와일드카드와 정규식은 다르다**
> 파일 이름에 쓰는 와일드카드(`*.txt`)와 정규식의 `*`는 완전히 다릅니다. 셸 와일드카드에서 `*`는 "임의의 문자열"이지만, 정규식에서 `*`는 "앞 문자의 0회 이상 반복"입니다. 정규식에서 "임의의 문자열"을 표현하려면 `.*`(임의 문자의 0회 이상)를 써야 합니다. 이 둘을 혼동하면 패턴이 전혀 다르게 동작합니다.

## 직접 쳐보기

다음 실습으로 텍스트 처리 파이프라인을 직접 만들어 보세요.

```bash
# 1. 실습용 데이터 만들기
cat > scores.txt << 'EOF'
alice 85 math
bob 92 science
carol 78 math
dave 92 science
alice 88 english
EOF

# 2. grep으로 필터링
grep "math" scores.txt
grep -c "92" scores.txt

# 3. awk로 필드 추출과 계산
awk '{print $1, $2}' scores.txt
awk '{sum += $2} END {print "평균:", sum/NR}' scores.txt

# 4. sort와 uniq 조합
awk '{print $1}' scores.txt | sort | uniq -c

# 5. sed 치환
sed 's/math/수학/g' scores.txt

# 6. 파이프라인 종합: 점수 기준 정렬 후 상위 2명
sort -k2 -nr scores.txt | head -n 2

# 7. 정리
rm scores.txt
```

- 이 파이프라인들을 직접 변형해 보세요. `sort`의 키를 바꾸거나, `awk`의 조건을 추가하거나, `grep -v`로 특정 행을 제외해 보면 각 도구가 어떻게 맞물려 동작하는지 감이 잡힙니다.

## 📖 용어

- **파이프(`|`)** : 앞 명령의 표준 출력을 뒤 명령의 표준 입력으로 이어붙이는 연결자.
- **표준 스트림** : 모든 명령이 갖는 세 통로 — 입력(stdin), 출력(stdout), 에러(stderr).
- **grep** : 패턴과 일치하는 **행**을 골라내는 필터. 이름은 `ed`의 `g/re/p` 명령에서 왔다.
- **sed** : 한 줄씩 읽으며 편집하는 스트림 편집기. 대표 문법은 `s/패턴/대체/g`.
- **`sed -i`** : 결과를 화면이 아니라 원본 파일에 직접 덮어쓰는 옵션. `-i.bak`으로 사본을 남기자.
- **awk** : 텍스트를 필드(열) 단위로 다루는 작은 프로그래밍 언어. `$0`은 행 전체, `$1`은 첫 필드.
- **NR / NF** : awk의 특별 변수. 현재 행 번호(Number of Record)와 현재 행의 필드 개수(Number of Field).
- **BEGIN / END 블록** : awk가 입력을 읽기 전과 다 읽은 후 딱 한 번씩 실행하는 구역. 합계·헤더 처리에 쓴다.
- **uniq** : **연속된** 중복 행만 제거하는 도구. 그래서 `sort`와 짝지어 쓴다.
- **tr** : 문자 단위로 바꾸고(`'a-z' 'A-Z'`), 지우고(`-d`), 연속을 압축(`-s`)하는 변환기.
- **BRE / ERE** : 기본 정규식과 확장 정규식. `+ ? | ( ) {`에 백슬래시가 필요한지가 갈림길이다.
- **와일드카드 vs 정규식** : 셸의 `*`는 "임의 문자열", 정규식의 `*`는 "앞 문자 0회 이상 반복".

## 📝 연습 문제

**문제 1.** `grep`에서 대소문자를 무시하고 검색하는 옵션은?

A) `-v`
B) `-i`
C) `-c`
D) `-n`

**정답: B**
해설: `-i`(ignore case)는 대소문자를 구분하지 않고 검색합니다. `-v`는 일치하지 않는 행 출력(invert), `-c`는 일치 행 개수(count), `-n`은 행 번호 표시입니다.

---

**문제 2.** `sed 's/apple/orange/g' file.txt` 명령의 동작으로 옳은 것은?

A) 각 행의 첫 번째 apple만 orange로 바꾼다
B) 각 행의 모든 apple을 orange로 바꾸고 파일을 직접 수정한다
C) 각 행의 모든 apple을 orange로 바꾼 결과를 화면에 출력한다
D) apple을 포함한 행을 삭제한다

**정답: C**
해설: `g`(global) 플래그는 각 행의 모든 일치를 치환합니다. `-i` 옵션이 없으므로 원본 파일은 수정되지 않고 결과만 화면에 출력됩니다. A는 `g`가 없을 때의 동작이고, B는 `-i`가 있어야 하며, D는 `d` 명령에 대한 설명입니다.

---

**문제 3.** `/etc/passwd`에서 콜론(`:`)을 구분자로 1번째 필드만 추출하려고 한다. 올바른 명령은?

A) `cut -f 1 /etc/passwd`
B) `cut -c 1 /etc/passwd`
C) `cut -d: -f 1 /etc/passwd`
D) `cut -d, -f 1 /etc/passwd`

**정답: C**
해설: `-d:`로 구분자를 콜론으로 지정하고 `-f 1`로 첫 필드를 추출합니다. A는 구분자를 지정하지 않아 기본 구분자인 탭으로 처리되어 실패하고, B는 첫 번째 문자만 추출하며, D는 구분자를 쉼표로 잘못 지정했습니다.

---

**문제 4.** `awk`에서 현재 행의 마지막 필드를 출력하는 표현은?

A) `$0`
B) `$NR`
C) `$NF`
D) `$last`

**정답: C**
해설: `NF`는 현재 행의 필드 개수를 담는 변수이고, `$NF`는 그 번호의 필드 즉 마지막 필드를 의미합니다. `$0`은 행 전체, `NR`은 행 번호(필드 아님), `$last`는 존재하지 않는 표현입니다.

---

**문제 5.** `uniq` 명령이 떨어져 있는 중복을 제대로 제거하지 못하는 이유와 해결책으로 옳은 것은?

A) `uniq`는 연속된 중복만 제거하므로 `sort`로 먼저 정렬해야 한다
B) `uniq`는 숫자만 처리하므로 `-n` 옵션을 붙여야 한다
C) `uniq`는 대소문자를 구분하므로 `-i`를 붙여야 한다
D) `uniq`는 파일을 직접 수정하므로 `-i`가 필요하다

**정답: A**
해설: `uniq`는 인접한(연속된) 중복 행만 제거하므로, 흩어진 중복을 모으기 위해 보통 `sort | uniq`로 정렬을 먼저 합니다. B의 `-n`은 uniq에서 다른 의미이고, C의 `-i`는 대소문자 무시 옵션이지만 핵심 원인이 아니며, D는 잘못된 설명입니다.

---

**문제 6.** 확장 정규식(ERE)에서만 백슬래시 없이 메타문자로 동작하는 것은?

A) `.`
B) `*`
C) `+`
D) `^`

**정답: C**
해설: `+`(1회 이상 반복)는 확장 정규식에서만 메타문자로 동작합니다. 기본 정규식(BRE)에서는 `\+`로 써야 합니다. `.`, `*`, `^`는 BRE와 ERE 모두에서 백슬래시 없이 메타문자로 동작합니다.

---

**문제 7.** 파일의 행 수만 세려고 한다. 올바른 명령은?

A) `wc -w file.txt`
B) `wc -c file.txt`
C) `wc -l file.txt`
D) `wc -m file.txt`

**정답: C**
해설: `-l`(line)은 행 수를 셉니다. `-w`는 단어 수, `-c`는 바이트 수, `-m`은 문자 수를 셉니다.

---
