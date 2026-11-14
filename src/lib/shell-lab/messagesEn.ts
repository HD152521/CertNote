// English counterparts of the guidance messages the shell simulator itself prints (the Korean text in
// commands/*.ts, run.ts, parse.ts). Real command output and errors are already English; only these
// simulator notes need translating. Applied on display, line by line, only for the English UI.
// When a message in the engine changes, update the matching rule here (messagesEn.test.ts extracts every
// Korean string literal from the engine source and checks that each one is covered).
type Rule = readonly [RegExp, (m: RegExpMatchArray) => string];

const UNSUPPORTED_SENTENCES: Record<string, string> = {
  '따옴표가 닫히지 않았어요': 'The quote is never closed. The practice lab does not support input that continues on the next line.',
  '명령 치환($(...), `...`)': 'Command substitution ($(...), `...`) is not supported in the practice lab yet.',
  '백그라운드 실행(&)': 'Background execution (&) is not supported in the practice lab yet.',
};

const RULES: readonly Rule[] = [
  [/^useradd 다음에 만들 사용자 이름을 하나 적어 주세요\. 예: (.+)$/, (m) => `Give one user name to create after useradd. Example: ${m[1]}`],
  [/^usermod 다음에 바꿀 사용자 이름을 적어 주세요\. 예: (.+)$/, (m) => `Give the user name to modify after usermod. Example: ${m[1]}`],
  [
    /^userdel 다음에 지울 사용자 이름을 적어 주세요\. 홈까지 지우려면 (.+)$/,
    (m) => `Give the user name to delete after userdel. To delete the home directory too, use ${m[1]}`,
  ],
  [/^groupadd 다음에 만들 그룹 이름을 적어 주세요\. 예: (.+)$/, (m) => `Give the group name to create after groupadd. Example: ${m[1]}`],
  [/^groupdel 다음에 지울 그룹 이름을 적어 주세요\.$/, () => 'Give the group name to delete after groupdel.'],
  [
    /^연습장에서는 비밀번호 입력을 건너뛰고 설정된 것으로 처리했어요\. 실제로는 입력한 글자가 화면에 보이지 않아요\.$/,
    () => 'The practice lab skips the password prompt and treats the password as set. On a real system the characters you type are not shown.',
  ],
  [
    /^연습장에서는 비밀번호를 입력할 수 없어 일반 사용자에서 su 는 막아 두었어요\. root 로 돌아가려면 exit 를 입력하세요\.$/,
    () => 'The practice lab cannot take a password, so su is blocked for regular users. To go back to root, type exit.',
  ],
  [
    /^연습장의 첫 셸이라 닫지 않았어요\. 처음 상태로 돌아가려면 reset 을 입력하세요\.$/,
    () => 'This is the lab\'s first shell, so it was not closed. To return to the initial state, type reset.',
  ],
  [
    /^(\S+) --help 는 연습장에서 지원하지 않아요\. 실제 시스템에서는 사용법 전체가 나와요\.$/,
    (m) => `${m[1]} --help is not supported in the practice lab. A real system prints the full usage.`,
  ],
  [
    /^(\S+) (-\S+) 는 실제 Rocky Linux 에 있는 옵션이지만 연습장에서는 아직 지원하지 않아요\.$/,
    (m) => `${m[1]} ${m[2]} is an option that exists on real Rocky Linux, but the practice lab does not support it yet.`,
  ],
  [
    /^연습장은 확인 질문에 답할 수 없어 n\(지우지 않음\)으로 처리했어요\. 묻지 않고 지우려면 -f 를 붙이세요\.$/,
    () => 'The practice lab cannot answer confirmation prompts, so it answered n (do not delete). To delete without asking, add -f.',
  ],
  [
    /^umask 를 기호\(u=rwx,g=rx 등\)로 바꾸는 것은 연습장에서 아직 지원하지 않아요\. 숫자\(022, 027\)로 써 주세요\.$/,
    () => 'Setting umask with symbols (u=rwx,g=rx and so on) is not supported in the practice lab yet. Use a number (022, 027).',
  ],
  [
    /^find 의 (.+) 조건은 연습장에서 아직 지원하지 않아요\. (-name .+) 를 쓸 수 있어요\.$/,
    (m) => `The find condition ${m[1]} is not supported in the practice lab yet. You can use ${m[2].replace(/ (?=-)/g, ', ')}.`,
  ],
  [
    /^(\S+) 는 실행 파일이에요\. 연습장에서는 바이너리 내용을 보여 주지 않아요\.$/,
    (m) => `${m[1]} is an executable file. The practice lab does not show binary contents.`,
  ],
  [
    /^tail -f\(계속 지켜보기\)는 연습장에서 지원하지 않아요\. 지금 내용만 한 번 보여 줘요\.$/,
    () => 'tail -f (keep following) is not supported in the practice lab. It shows the current content once.',
  ],
  [
    /^연습장에서는 (\S+) 를 직접 고치지 않아요\. useradd·usermod·groupadd 같은 명령으로 바꿔 주세요\.$/,
    (m) => `The practice lab does not let you edit ${m[1]} directly. Change it with commands such as useradd, usermod and groupadd.`,
  ],
  [
    /^새 셸을 여는 것은 연습장에서 지원하지 않아요\. bash -c "명령" 은 쓸 수 있어요\.$/,
    () => 'Opening a new shell is not supported in the practice lab. bash -c "command" does work.',
  ],
  [
    /^지원하는 명령: (.+)\. 그 밖에 clear\(화면 정리\), reset\(처음 상태로\)\.$/,
    (m) => `Supported commands: ${m[1]}. Also clear (clear the screen) and reset (back to the initial state).`,
  ],
  [
    /^경로로 프로그램을 실행하는 것\((.+)\)은 연습장에서 지원하지 않아요\.$/,
    (m) => `Running a program by path (${m[1]}) is not supported in the practice lab.`,
  ],
  [
    /^(\S+) 은\(는\) 실제 Rocky Linux 에 있는 명령이지만 연습장 1단계에서는 아직 지원하지 않아요\. help 로 지원 목록을 볼 수 있어요\.$/,
    (m) => `${m[1]} is a command on real Rocky Linux, but the practice lab does not support it yet. Type help to see the supported list.`,
  ],
  [
    /^(.+) 은\(는\) 연습장에서 아직 지원하지 않아요\.$/,
    (m) => UNSUPPORTED_SENTENCES[m[1]] ?? `${m[1]} is not supported in the practice lab yet.`,
  ],
  [
    /^연습장이 이 명령을 처리하지 못했어요\. 다른 방식으로 써 보거나 reset 으로 처음부터 시작하세요\.$/,
    () => 'The practice lab could not process this command. Try writing it another way, or start over with reset.',
  ],
];

const HANGUL = /[ㄱ-ㆎ가-힣]/;
export const hasHangul = (s: string): boolean => HANGUL.test(s);

// Real bash/GNU diagnostics start with an ASCII command token and a colon (`cat: 한글: No such file or directory`).
// They only contain Hangul because the user typed it, so they must never be replaced by the fallback.
const REAL_COMMAND_LINE = /^[\w.+@/-]+: /;

const FALLBACK = 'The practice lab printed a guidance message that is only available in Korean.';

/** Translate simulator-originated text line by line. Lines without Hangul, and real `<cmd>: ...` diagnostics, pass through. */
export function translateShellMessageEn(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (!hasHangul(line) || REAL_COMMAND_LINE.test(line)) return line;
      for (const [re, fn] of RULES) {
        const m = line.match(re);
        if (m) return fn(m);
      }
      return FALLBACK;
    })
    .join('\n');
}

/** Exposed for the coverage test. */
export const SHELL_MESSAGE_RULE_COUNT = RULES.length;
