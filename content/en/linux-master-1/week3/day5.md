# Day 5 - Week 3 Comprehensive Review: The Big Picture of the Shell and Scripts

## 📌 Key Takeaways

- This week converges on a single question — "how do we hand work we used to do by hand over to the shell in a repeatable way".
- Shell families are **Bourne (sh·ksh·bash·zsh)** and **C (csh·tcsh)**. The standard is bash, and csh introduced alias and history.
- Variables are divided by whether they are `export`ed, and configuration files differ between login shells (`~/.bash_profile`) and interactive shells (`~/.bashrc`).
- FD 0·1·2 and the order of `2>&1`, the difference between glob `*` and regex `*`, and the three kinds of quotes are the heart of Day 2.
- Scripts build up in this order: shebang → positional parameters → `[ ]` conditions (string `=`, number `-eq`, spaces required) → if/case/for/while → functions.

## Day 1 Review: The Shell, Variables, and Initialization Files

- The shell is the command interpreter between the kernel and the user.
- Types split into the Bourne family (`sh` → `ksh` → `bash` → `zsh`) and the C family (`csh` → `tcsh`), and **bash is the standard Linux login shell**.
- It was csh that first introduced alias and history.
- A **shell variable** is valid only in the current shell and is not inherited by children, while an **environment variable** marked with `export` is inherited by child processes. Inheritance goes in one direction only, parent→child.

| Command | Scope shown |
|------|--------------|
| `set` | Shell variables + environment variables + functions (the widest) |
| `env` | Environment variables only |
| `export -p` | Exported variables only |

The read order of initialization files differs by shell type.

- **Login shell**: `/etc/profile` → (the first one of `~/.bash_profile` → `~/.bash_login` → `~/.profile`) → `~/.bash_logout` at logout
- **Non-login interactive shell**: `/etc/bashrc` → `~/.bashrc`
- To apply a change immediately, use `source` or `.` (dot). `bash file` applies only in a new child shell, so it has no effect.

> 💡 **Concept**: A one-line summary of the key point — **`.bash_profile` once at login, `.bashrc` every time a shell is launched.** So the convention is to put aliases and functions in `.bashrc` and environment variables in `.bash_profile`.

## Day 2 Review: Redirection, Pipes, Metacharacters

Every process has three standard channels — **stdin (0), stdout (1), stderr (2)**. Redirection changes where these FDs are connected.

| Symbol | Meaning |
|------|------|
| `>` / `>>` | Overwrite / append stdout |
| `2>` | Redirect stderr only |
| `&>` or `> f 2>&1` | stdout+stderr together |
| `<` | Take input |
| `<<` / `<<<` | Here document / here string |

- The **order** of `2>&1` decides the result. It must be `> file 2>&1` (redirect 1 to the file first, then merge 2) for both to go to the file.
- A **pipe (`|`)** connects the stdout of the preceding command to the stdin of the following command (stderr is not passed by default).
- Combine filters (grep, sort, uniq, wc, cut, tee, etc.) to turn a compound job into one line.
- **Wildcards (globbing)** are expanded by the shell into file names before the command runs: `*` (zero or more), `?` (exactly one), `[ ]` (one of the characters in brackets). The meaning differs from `*` in regular expressions (repetition of the preceding character).

The behavioral differences among **quotes** are an item the exam asks about.

| Quote | Variable expansion | Command substitution | Wildcards |
|--------|:---:|:---:|:---:|
| `' '` single | ❌ | ❌ | ❌ |
| `" "` double | ✅ | ✅ | ❌ |

> ⚠️ **Trap**: With `sort file > file`, `>` empties the file before the command runs, so the contents vanish. To write to the same file, use the tool's `-o` option or go through a temporary file.

## Day 3 Review: Aliases, History, Job Control

- **alias** gives a nickname to a long command, and to make it permanent you put it in `~/.bashrc`. Temporary bypasses are `\command`, `command cmd`, and the absolute path.
- **history** is reused with `!!` (the whole previous command), `!n` (number n), and `!$` (the last argument of the previous command). Behavior is tuned with `HISTSIZE` (number kept in memory) and `HISTCONTROL` (duplicate and space control).
- **Job control** is the most practical part of this week.

| Action | Behavior |
|------|------|
| `cmd &` | Run in the background from the start |
| `Ctrl-Z` | Suspend the foreground job |
| `Ctrl-C` | Terminate the job |
| `jobs` | Job list |
| `bg %n` / `fg %n` | Resume in the background / return to the foreground |
| `nohup cmd &` | Ignore SIGHUP (survive terminal closure) + background |
| `disown %n` | Detach a running job from the shell |

When the terminal closes, **SIGHUP** is delivered to the jobs inside and kills them. `nohup` makes them ignore this signal, but background execution is strictly `&`'s job, so you must use **both together**.

## Day 4 Review: Shell Scripting Basics

- The **shebang** (`#!/bin/bash`) on the first line of a script specifies the interpreter. `./script.sh` runs in a child shell and `source script.sh` runs in the current shell.
- **Positional parameters**: `$0` (name), `$1~$9` (arguments), `$#` (count), `$@` (all, separated), `$?` (exit status, 0=success), `$$` (PID).
- **Condition evaluation (test/[ ])**: strings use `=`, `!=`, `-z`, `-n`; numbers use `-eq`, `-ne`, `-gt`, `-lt`; files use `-f`, `-d`, `-e`. **Spaces are required** inside the brackets and around operators.
- **Control structures**: `if-elif-else-fi`, `case-esac` (patterns end with `;;`, `*)` is the default), `for-do-done`, `while-do-done`, `until`. Control loops with `break` and `continue`.
- **Functions**: `return` gives only an exit status of 0~255, and data is passed with `echo`+`$(function)`. Localize variables inside functions with `local`.

if accepts not only `[ ]` but any command as a condition and branches on its exit status, as in `if grep -q root /etc/passwd; then ...`. `[ ]` can be an if condition because it is itself a command called `test`.

## Integrated Scenario: Where What You Learned Meets in One Script

Here we summarize how this week's concepts are used together in a real script.

```bash
#!/bin/bash
# Compress today's .log files in the log directory and record the result

LOG_DIR="/var/log/myapp"
DATE=$(date +%Y%m%d)              # command substitution (Day3)
REPORT="/tmp/compress_$DATE.txt"

if [ ! -d "$LOG_DIR" ]; then      # file test + conditional (Day4)
    echo "Directory not found: $LOG_DIR" >&2   # stderr redirection (Day2)
    exit 1
fi

count=0
for file in "$LOG_DIR"/*.log; do  # wildcard + for (Day2,4)
    [ -f "$file" ] || continue    # skip when nothing matches
    gzip "$file" 2>> "$REPORT"    # append errors only (Day2)
    count=$((count + 1))          # arithmetic expansion (Day3)
done

echo "Compression complete: $count files" | tee -a "$REPORT"   # pipe + tee (Day2)
```

- This short script contains command substitution, conditionals, file tests, redirection, wildcards, loops, arithmetic expansion, pipes, and tee, all together.
- It shows that what you learned this week is not isolated knowledge but parts that mesh to automate a single task.

A "log compression and cleanup" script like this is actually handled for you by a standard tool called `logrotate`. But logrotate's inner workings and custom cleanup logic ultimately stand on the principles of shell scripts like this one. Knowing the fundamentals also helps you understand what the standard tools are doing.

## Final Checklist Right Before the Exam

- Shell family classification: ksh is the **Bourne family** (don't be fooled by the name), and csh introduced alias and history
- `$SHELL` is the default login shell; **the current shell is `echo $0`**
- The difference between shell and environment variables is **whether it is exported**, and inheritance is one-way parent→child
- Login shell: `/etc/profile` → `~/.bash_profile`; interactive: `~/.bashrc`
- FD: stdin 0, stdout 1, stderr 2 / the **order** of `2>&1` matters
- Glob `*` ≠ regex `*`
- Single quotes = block everything, double quotes = expand variables only
- `Ctrl-Z` = suspend, `Ctrl-C` = terminate / use nohup and `&` together
- test: string `=`, number `-eq`, **spaces required**
- `$?` = exit status (0=success), a function's return is an exit status only

## 📖 Glossary

- **Bourne family / C family** : The group of bash, ksh, and zsh descended from `sh`, and the tcsh group that branched from `csh`.
- **Shell variable vs environment variable** : A variable not passed to children because it is not exported, versus one that is passed.
- **`~/.bash_profile` vs `~/.bashrc`** : A file read once at login, versus a file read every time a new shell is launched.
- **`source` (`.`)** : A command that reads a file inside the current shell to apply settings immediately.
- **FD 0/1/2** : The numbers of standard input, standard output, and standard error. Redirection changes what these numbers are connected to.
- **`2>&1`** : Notation that merges errors into the output. It must be written after `> file` for both to go to the file.
- **Globbing** : The expansion in which the shell replaces `*`, `?`, and `[]` with actual file names in advance. The meaning differs from regex.
- **SIGHUP** : The signal delivered to jobs inside a terminal when it closes. It is ignored with `nohup`.
- **Job number (`%n`)** : A job identification number that is meaningful only within the current shell. Used like `fg %1`.
- **shebang** : The first line that specifies which interpreter should run the script.
- **`$?`** : The exit status of the previous command. 0 is success, and conditionals branch on this value.
- **`test`/`[ ]`** : A command that evaluates a condition and answers with an exit status. Strings use `=`, numbers use `-eq`, spaces required.
- **`local`** : The keyword that declares a local variable that lives only inside a function.

## 📝 Practice Questions

**Question 1.** Which of the following shells is NOT in the Bourne shell family?

A) bash
B) ksh
C) zsh
D) tcsh

**Answer: D**
Explanation: tcsh is an improved version of csh (the C shell) and belongs to the **C shell family**. bash, ksh, and zsh all follow Bourne shell syntax and are Bourne family. In particular, ksh is easy to mistake for the C family because of the 'k' in its name, but it is a Bourne family shell that David Korn made for Bourne shell compatibility. The C shell family is only csh and tcsh, and it is characterized by C-like syntax and being the first to introduce history and alias.

---

**Question 2.** What is the most accurate way to check the name of the currently running shell?

A) `echo $SHELL`
B) `echo $0`
C) `echo $HOME`
D) `echo $PATH`

**Answer: B**
Explanation: `echo $0` shows the name of the currently running shell. `$SHELL` is only the default shell path assigned at login; even if you log in with bash and then run zsh directly, it still points to `/bin/bash`. `$HOME` is the home directory and `$PATH` is the command search path. If you choose `$SHELL` on a question asking about "the currently running shell", you fall into the trap. You can also check with `ps -p $$`.

---

**Question 3.** Which correctly describes the difference between `command > out.txt 2>&1` and `command 2>&1 > out.txt`?

A) The two commands behave exactly the same
B) The former sends both to the file, while the latter sends only stdout to the file and stderr stays on the screen
C) The former sends only stderr and the latter only stdout to the file
D) The latter is the more standard notation

**Answer: B**
Explanation: The shell processes redirections from left to right. In the former, `> out.txt` first redirects stdout (1) to the file and then `2>&1` merges stderr into that file, so both go to the file. In the latter, `2>&1` first merges stderr into "the current 1 (the screen)" and then `> out.txt` changes only stdout to the file, so stderr stays on the screen. Therefore the two are not the same, and the correct notation is the former.

---

**Question 4.** Which is a correct statement about wildcards (globbing)?

A) Each command (ls, cp, etc.) performs file name expansion itself
B) The `*` of globbing has the same meaning as the `*` of regular expressions
C) The shell expands `*.txt` into actual file names before the command runs
D) `?` means zero or more arbitrary characters

**Answer: C**
Explanation: Wildcard expansion (globbing) is performed by **the shell**, not the command, before the command runs. When you type `ls *.txt`, the shell first replaces `*.txt` with the actual file list and then passes it to ls as arguments. The `*` of globbing (zero or more arbitrary characters) has a completely different meaning from the `*` of regular expressions (zero or more repetitions of the preceding character). `?` means **exactly one** arbitrary character, not zero or more.

---

**Question 5.** Which of the following prints with the variable expanded? (with `NAME=linux`)

A) `echo '$NAME'`
B) `echo "$NAME"`
C) `echo \$NAME`
D) `echo '${NAME}'`

**Answer: B**
Explanation: Double quotes allow variable expansion, so `"$NAME"` prints `linux`. Single quotes (A, D) block all expansion so `$NAME` and `${NAME}` are printed literally, and the backslash (C) removes the special meaning of the `$` right after it so `$NAME` comes out as is. The key point is that double quotes are "weak quoting" that allows variable and command substitution but blocks only wildcards.

---

**Question 6.** Which command resumes, in the background, a job suspended with `Ctrl-Z`?

A) `fg`
B) `bg`
C) `jobs`
D) `kill -CONT`

**Answer: B**
Explanation: A job stopped with `Ctrl-Z` can be resumed in the background with `bg %n`. `fg` brings it to the foreground, and `jobs` only shows the job list without changing any state. `kill -CONT` also resumes a stopped process, but the standard job control method is `bg`. For the flow from stopped to resumed in the background, `Ctrl-Z` → `bg %n` is the canonical way.

---

**Question 7.** You want a job not to end even when the terminal is closed. What is the most appropriate command to run?

A) `./long.sh`
B) `./long.sh &`
C) `nohup ./long.sh &`
D) `nohup ./long.sh`

**Answer: C**
Explanation: When the terminal closes, a SIGHUP signal is delivered and kills the job. `nohup` makes it ignore this signal and `&` handles background execution, so you must use **both together** to get "survive in the background even if the terminal closes". B is still vulnerable to SIGHUP, and D has no `&` so it runs in the foreground and ties up the shell. A has neither of the two protections.

---

**Question 8.** Which operator in the test command checks whether `/etc/passwd` **is a directory**?

A) `-f`
B) `-d`
C) `-e`
D) `-s`

**Answer: B**
Explanation: `-d` is true when the target is a directory. `-f` tests for a regular file, `-e` for existence (regardless of file or directory), and `-s` for whether the size is greater than 0 (not empty). `/etc/passwd` is a regular file, so a `-d` test is false. You must clearly distinguish the operators that tell file types apart (`-f` regular file, `-d` directory, `-L` symbolic link).

---

**Question 9.** Which is a correct statement about the `$?` variable?

A) It holds the PID of the current shell
B) It holds the exit status of the previous command, where 0 is success
C) It holds the PID of the last background job
D) It holds the number of arguments passed

**Answer: B**
Explanation: `$?` holds the exit status of the most recently executed command, where **0 means success** and a non-zero value means failure. Conditionals branch on this value. The PID of the current shell is `$$`, the PID of the last background job is `$!`, and the argument count is `$#`. You need to tell the meanings of these similar-looking special variables apart precisely so as not to confuse them.

---

**Question 10.** Which pair correctly matches the command that makes a shell variable inherited by child processes and the command that applies a modified `.bashrc` to the current shell immediately?

A) `set` / `bash ~/.bashrc`
B) `export` / `source ~/.bashrc`
C) `env` / `exec ~/.bashrc`
D) `declare` / `run ~/.bashrc`

**Answer: B**
Explanation: The command that promotes a shell variable to an environment variable so children inherit it is `export`, and the command that immediately re-reads a modified `.bashrc` inside the current shell process is `source` (or `.`). `set` is for printing variables and controlling options, `env` is for printing environment variables and temporary execution, and `bash ~/.bashrc` applies only in a new child shell so it has no effect on the current shell. `exec` replaces the process, and `run` is not an existing command.

---

**Question 11.** Which pair correctly matches the symbol that handles several patterns in a single block in a case statement and the symbol that ends each block?

A) Pattern separator `,` / block terminator `;`
B) Pattern separator `|` / block terminator `;;`
C) Pattern separator `||` / block terminator `break`
D) Pattern separator `;` / block terminator `fi`

**Answer: B**
Explanation: In a case statement, when grouping several patterns into one block, separate them with `|` (`restart|reload)`), and end each pattern block with `;;`. The whole case is closed with `esac`. Distinguish this from an if statement being closed with `fi`. `,` and `||` are not used to separate case patterns, and `break` is for escaping loops and has nothing to do with ending a case block. Pattern `|`, block `;;`, and the whole `esac` are the three main syntax elements of case.

---

**Question 12.** What is the result of running the following script?

```bash
#!/bin/bash
count=0
for f in a b c; do
    count=$((count + 1))
done
echo $count
```

A) 0
B) 3
C) a b c
D) Syntax error

**Answer: B**
Explanation: The for loop iterates three times over the list `a b c`, increasing count by 1 each time with `count=$((count + 1))`. `$(( ))` is arithmetic expansion that evaluates the expression, so count goes 0→1→2→3, and finally `echo $count` prints 3. It prints count rather than the variable f, so it is not "a b c". The syntax is correct, so it is not an error. This is a question you can solve only by understanding the for iteration count together with arithmetic expansion.

---
