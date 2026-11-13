# Day 2 - The Art of Connecting and Bending Streams: Redirection, Pipes, Metacharacters

## 📌 Key Takeaways

- Every process has three FDs — **0 stdin · 1 stdout · 2 stderr**. Redirection means changing where these are connected.
- `>` overwrites (it empties the file before execution), `>>` appends. `2>` handles errors only, `&>` handles both.
- **With `2>&1`, order is everything.** `> out 2>&1` is correct; with `2>&1 > out`, stderr stays on the screen.
- A pipe passes **only stdout**. To pass stderr too, use `2>&1 |` or `|&`.
- Wildcards are **expanded into filenames by the shell first**. Their meaning differs from `*` in regular expressions. Quotes: single (protect everything), double (expand variables only), backtick (execute a command).

## File Descriptors: 0, 1, and 2 Are the Basis of Everything

Pipes and redirection are what turned the Unix philosophy — "write programs that do one thing well, and make them work together" — into reality. Their foundation is the file descriptor.

- On Linux, every process is given three standard I/O channels when it starts.

| FD number | Name | Abbreviation | Default connection |
|---------|------|------|----------------|
| 0 | Standard input | stdin | Keyboard |
| 1 | Standard output | stdout | Screen (terminal) |
| 2 | Standard error | stderr | Screen (terminal) |

- The key point is that **stdout (1) and stderr (2) both head to the screen by default but are separate channels**.
- Normal results go out through 1 and error messages through 2. They look mixed on the screen, but you can handle them separately when redirecting.

Redirection means **changing the "destination" an FD points to** from the keyboard or screen to **a file or another FD**. So `>` is shorthand for "redirect 1 (stdout) to a file", and `2>` means "redirect 2 (stderr) to a file".

## Output Redirection: > and >>

```bash
ls -l > filelist.txt       # stdout to a file (overwrite)
ls -l >> filelist.txt      # stdout to a file (append)
```

- `>` : **creates the file or overwrites it**. Existing contents are lost.
- `>>` : **appends** to the end of the file. Existing contents are preserved.
- `>` is really shorthand for `1>`. So `ls > out.txt` and `ls 1> out.txt` are exactly the same.

> ⚠️ **Trap**: `>` **empties the file first, before the command runs (truncate)**. So when input and output are the same file, as in `sort file.txt > file.txt`, the file is emptied before sort can even read it and **the contents are wiped out entirely**. To write the result to the same file, go through a temporary file or use the tool's own option, as in `sort -o file.txt file.txt`.

## Error Redirection: 2> and Separating stdout/stderr

- Error messages (stderr, FD 2) can be sent separately with `2>`.
- `/dev/null` is a **special device where anything written simply disappears**, used to mean "discard the output".

```bash
find / -name "*.conf" 2> errors.txt    # only errors (permission denied, etc.) to a file
find / -name "*.conf" 2> /dev/null     # discard errors (into the black hole)
```

You can also separate normal output and errors into **different files**.

```bash
make 1> build.log 2> error.log
# stdout → build.log, stderr → error.log
```

### Merging stdout and stderr into One File

To collect both into the same file, use the **FD duplication** notation `2>&1`. It means "make 2 point to the same place 1 points to".

```bash
command > output.txt 2>&1     # both stdout and stderr to output.txt
command &> output.txt         # same as above (bash shorthand)
command >> output.txt 2>&1    # both, appending
```

> ⚠️ **Trap**: The **position (order)** of `2>&1` is decisive. `command 2>&1 > out.txt` does not behave as intended. The shell processes left to right, so first `2>&1` makes "2 the same as the current 1 (the screen)", and **then** `> out.txt` redirects only 1 to the file. As a result, stderr stays on the screen and only stdout goes to the file. You must write it in the order `> out.txt 2>&1`, redirecting 1 to the file first and then merging 2 into 1.

## Input Redirection: < and Here Documents

`<` makes a command take **input from a file** instead of the keyboard (stdin).

```bash
sort < names.txt          # use the contents of names.txt as sort's input
wc -l < access.log        # count lines with a file as input
mail user@host < body.txt # use the file contents as the mail body
```

There is also the **here document (`<<`)**, which passes several lines on the spot as input.

```bash
cat << END
First line
Second line
END
# Passes the text up to END as cat's input
```

There is also `<<<` (here string), similar to `<<` (here document). `<<<` passes a one-line string as-is to stdin. For example, `grep "root" <<< "$line"` gives the contents of the variable `$line` to grep as input. It is useful in scripts because you can feed a string to a command without a temporary file or an `echo | grep` pipe.

| Symbol | Meaning | FD |
|------|------|-----|
| `>` | Overwrite output | 1 |
| `>>` | Append output | 1 |
| `<` | Take input | 0 |
| `2>` | Overwrite errors | 2 |
| `2>>` | Append errors | 2 |
| `&>` | Overwrite output+errors | 1,2 |
| `2>&1` | Merge errors into output | 2→1 |
| `<<` | Here document | 0 |
| `<<<` | Here string | 0 |

## Pipes: One Command's Output as the Next Command's Input

- A pipe (`|`) **connects the stdout of the preceding command directly to the stdin of the following command**.
- If redirection is "FD ↔ file", a pipe is "FD ↔ FD" (between processes).
- Commands connected by pipes **run simultaneously (in parallel)**, and data flows through a pipe buffer managed by the kernel.

```bash
ls -l | grep ".txt"                  # filter the listing down to .txt only
cat access.log | grep "404" | wc -l  # count lines with a 404 response
ps aux | grep nginx                  # find running nginx processes
du -h | sort -rh | head -5           # top 5 largest items
```

A pipe passes **only stdout** to the next command. stderr (2) does not travel through the pipe and stays on the screen. To pass stderr through the pipe too, use `command 2>&1 | next` or bash's `command |& next` notation.

### Filters: Commands That Sit Between Pipes and Process Data

A **filter** is a command that takes stdin, processes it, and sends it to stdout, and is used in the middle stages of a pipeline.

| Filter | Role |
|------|------|
| `grep` | Keep only lines matching a pattern |
| `sort` | Sort (`-r` reverse, `-n` numeric, `-k` field) |
| `uniq` | Remove adjacent duplicate lines (`-c` count) |
| `wc` | Count lines, words, bytes (`-l`, `-w`, `-c`) |
| `head` / `tail` | First/last N lines (`tail -f` for real time) |
| `cut` | Cut by field or character (`-d`, `-f`) |
| `tr` | Translate or delete characters |
| `sed` | Stream editing (substitute, delete) |
| `awk` | Field-based text processing |
| `tee` | Screen output and file save at the same time |

`tee` is especially useful — in the middle of a pipe it **forks the flow to both the screen and a file at once**.

```bash
ls -l | tee filelist.txt | grep ".sh"
# Save the full listing to filelist.txt while showing only .sh on the screen
make 2>&1 | tee build.log    # watch the build log while also recording it to a file
```

The name `tee` comes from the plumbing **T-shaped pipe (tee fitting)** that splits a stream of water in two. Sending one input out in two directions (file and screen) resembles the letter T. Many Unix command names are borrowed from everyday objects like this.

## Metacharacters and Wildcards: Special Symbols the Shell Intercepts First

- Before running a command, the shell first processes the **characters with special meaning (metacharacters)** in the input line.
- Among them, the ones used to match file names are called **wildcards** or **globbing**.

| Wildcard | Meaning | Example |
|------------|------|------|
| `*` | Zero or more arbitrary characters | `*.txt` → all .txt files |
| `?` | Exactly one arbitrary character | `file?.log` → file1.log, fileA.log |
| `[ ]` | One of the characters in the brackets | `file[123].txt` |
| `[a-z]` | One character within a range | `[a-c]*` → starts with a, b, or c |
| `[!abc]` | One character **excluding** those in the brackets | `[!0-9]*` → does not start with a digit |
| `{ }` | Brace expansion | `file{1,2,3}.txt` |

```bash
ls *.txt              # all files with the .txt extension
rm temp?.log          # temp followed by one character + .log
ls [a-c]*             # all files starting with a, b, or c
cp file{1,2,3}.txt /backup/   # copy file1.txt file2.txt file3.txt
ls *[!0-9]            # files whose last character is not a digit
```

The one that performs wildcard expansion (globbing) is **the shell, not the command**. When you type `ls *.txt`, the shell first replaces `*.txt` with the actual file names (`a.txt b.txt c.txt`) and then passes that result to `ls` as arguments. So if no file matches, bash's default behavior passes `*.txt` to ls literally. This "the shell expands first" point leads to the decisive difference between regular expressions and wildcards.

Do not confuse wildcards (globbing) with regular expressions (regex). Both use `*`, but the meaning differs. In globbing, `*` means "zero or more arbitrary characters", but in a regular expression `*` means "zero or more repetitions of **the preceding character**". For example, globbing `a*` is everything that starts with a, but regex `a*` means a zero or more times (that is, including the empty string). The pattern for `grep` is a regular expression, while file name matching is globbing.

## Quotes: Three Kinds of Quoting That Control Shell Expansion

Use quotes when you want to use metacharacters **literally** or control variable expansion. The three kinds all behave differently.

| Quote | Name | Variable ($) expansion | Command substitution (`` ` ``) | Wildcards |
|--------|------|:---:|:---:|:---:|
| `' '` | Single quote (strong) | ❌ | ❌ | ❌ |
| `" "` | Double quote (weak) | ✅ | ✅ | ❌ |
| `` ` ` `` | Backtick | — | Executes command | — |

```bash
NAME="linux"

echo '$NAME'      # $NAME      (single quotes: no expansion at all)
echo "$NAME"      # linux      (double quotes: expands variables only)
echo `date`       # current date  (backticks: replaced by the command's output)
```

- **Single quotes (`'`)**: treat everything inside **literally**. `$`, `*`, and spaces are all just characters.
- **Double quotes (`"`)**: expand variables (`$VAR`) and command substitution (`` `cmd` ``), but block wildcards. Essential for safely handling values that contain spaces.
- **Backticks (`` ` ``)**: run the command inside and **substitute its output** (command substitution). In modern bash the `$(...)` notation is recommended instead.

```bash
# Command substitution — the two notations are identical, $() is safe for nesting
echo "Today is `date +%Y-%m-%d`"
echo "Today is $(date +%Y-%m-%d)"

# Why double quotes matter when a variable value has a space
FILE="my report.txt"
rm "$FILE"        # correct: deletes the one file 'my report.txt'
rm $FILE          # dangerous: split into two arguments, 'my' and 'report.txt'
```

The reason to wrap variables in double quotes is **word splitting**. If you use a variable without quotes, the shell splits it into several arguments at the spaces inside the value. So in scripts, wrapping in double quotes like `"$VAR"` is almost always the safe idiom.

The biggest weakness of backtick command substitution is **nesting**. If you nest backticks like `` `cmd1 `cmd2` ` ``, the shell gets confused about where each one ends. The biggest reason POSIX introduced the `$(...)` syntax in the 1990s was to solve this nesting problem. Since nesting is unambiguous with parentheses, as in `$(cmd1 $(cmd2))`, `$()` is the standard in scripts today.

### Escaping: Protecting Just One Character with a Backslash

Instead of quotes, a **backslash (`\`)** can remove the special meaning of just the one character right after it.

```bash
echo \$NAME       # $NAME (dollar sign as a literal character)
echo file\ name   # 'file name' (space as a literal character)
touch a\*b        # create a file named 'a*b'
```

Tomorrow we cover alias, history, and job control.

## 📖 Glossary

- **File descriptor (FD)** : The number tag a process attaches to an I/O channel. 0=input, 1=output, 2=error.
- **stdout / stderr** : Channel 1 where normal results go and channel 2 where errors go. They look mixed on the screen but are separate.
- **Redirection** : Changing where an FD points from the screen or keyboard to a file or another FD.
- **`>` vs `>>`** : Overwrite versus append. `>` empties the file **before** the command runs.
- **`2>&1`** : "Make 2 go where 1 goes." It must be written **after** `> file` to work as intended.
- **`/dev/null`** : A special device where anything written disappears. Used to discard output.
- **Here document (`<<`)** : Syntax that passes the lines up to a terminator marker as-is to a command's input.
- **Pipe (`|`)** : Connects the stdout of the preceding command directly to the stdin of the next. stderr does not ride along.
- **Filter** : A command that takes stdin, processes it, and outputs to stdout. A middle component of a pipeline.
- **`tee`** : A command that splits the flow into two branches, a file and the screen. The name comes from the T-shaped plumbing pipe.
- **Globbing** : The expansion in which the shell replaces `*`, `?`, and `[]` with actual file names in advance. Different from regex.
- **Word splitting** : The phenomenon where an unquoted variable value is split into several arguments at spaces. Prevented with `"$VAR"`.
- **Command substitution** : Inserting a command's output in place with `` `cmd` `` or `$(cmd)`. `$()` is safe for nesting.

## 📝 Practice Questions

**Question 1.** What is the file descriptor number for standard error (stderr)?

A) 0
B) 1
C) 2
D) 3

**Answer: C**
Explanation: Standard input (stdin) is 0, standard output (stdout) is 1, and standard error (stderr) is 2. That is why `2>` is used to redirect only error messages separately. Number 3 and above are generally assigned to files that a program opens additionally and are not part of the standard I/O. This 0/1/2 numbering is the basis for interpreting every redirection symbol.

---

**Question 2.** Which correctly describes the behavior of `command > output.txt 2>&1`?

A) Saves only standard output to output.txt and shows errors on the screen
B) Saves both standard output and standard error to output.txt
C) Saves only standard error to output.txt and shows output on the screen
D) Uses the contents of output.txt as the input of command

**Answer: B**
Explanation: `> output.txt` first redirects stdout (1) to the file, and then `2>&1` merges stderr (2) into "where 1 currently points", that is, output.txt. As a result, both normal output and errors are saved in one file. Order matters: if `2>&1` comes before `> output.txt`, stderr stays on the screen. D describes input redirection (`<`), so it is unrelated.

---

**Question 3.** Which filter shows a command's output on the screen and saves it to a file at the same time?

A) `cat`
B) `tee`
C) `split`
D) `dd`

**Answer: B**
Explanation: `tee` sends the data received on stdin to stdout (the screen) unchanged while also writing it to the specified file. As its name suggests, it forks the flow in a T shape. `cat` only prints file contents, `split` divides a large file into several pieces, and `dd` is a block-level copy and conversion tool. To send the flow to both the screen and a file in the middle of a pipe, use `command | tee file`.

---

**Question 4.** Which is the correct meaning of the wildcard `?`

A) Zero or more arbitrary characters
B) Exactly one arbitrary character
C) One of the characters in brackets
D) Zero or more repetitions of the preceding character

**Answer: B**
Explanation: In globbing, `?` means **exactly one character**. For example, `file?.txt` matches file1.txt, fileA.txt, and so on, where one character follows file, but it does not match file.txt or file10.txt. "Zero or more arbitrary characters" is `*`, "one of the characters in brackets" is `[ ]`, and "zero or more repetitions of the preceding character" is the meaning of `*` in regular expressions. Be careful not to confuse the `*` of globbing with that of regular expressions.

---

**Question 5.** Which of the following prints the variable `$NAME` literally **without** expanding it?

A) `echo "$NAME"`
B) `echo '$NAME'`
C) `echo $NAME`
D) `echo "${NAME}"`

**Answer: B**
Explanation: Single quotes (`' '`) treat everything inside literally, so `$NAME` is not expanded and the text `$NAME` is printed as-is. Double quotes (A, D) expand the variable, and C, written without quotes, also expands the variable. Remember the difference: double quotes are "weak quoting" that allows variable and command substitution but blocks only wildcards, while single quotes are "strong quoting" that blocks all expansion.

---

**Question 6.** What is the result of running `sort file.txt > file.txt`?

A) file.txt is sorted and saved
B) All the contents of file.txt disappear
C) The sorted result is printed on the screen
D) An error occurs and the file is left unchanged

**Answer: B**
Explanation: `>` empties the output target file first, **before** the command runs (truncate). So by the time sort tries to read file.txt, the file is already empty, there is nothing to sort, and as a result the file contents disappear entirely. To write the sorted result to the same file, use sort's own option as in `sort -o file.txt file.txt` or go through a temporary file. This is a classic trap showing the order of redirection processing.

---

**Question 7.** Which pair correctly lists notations that perform command substitution?

A) `'cmd'` and `${cmd}`
B) `` `cmd` `` and `$(cmd)`
C) `"cmd"` and `<(cmd)`
D) `[cmd]` and `{cmd}`

**Answer: B**
Explanation: Command substitution is the feature that runs a command and substitutes its output; the two notations, backticks `` `cmd` `` and `$(cmd)`, do the same job. In modern bash, `$(cmd)` is recommended because nesting is clear and it reads better. Single quotes block expansion, `${...}` is variable expansion, and `<(cmd)` is process substitution, which differs from command substitution. `[ ]` and `{ }` are globbing and brace expansion respectively.

---
