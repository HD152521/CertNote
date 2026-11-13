# Day 4 - Redirection · Aliases · History

## 📌 Key Points

- Every command has three channels: **standard input (0), standard output (1), and standard error (2)**.
- **`>` overwrites, `>>` appends.** If you mix these two up, the file is gone.
- **Redirect errors separately with `2>`.** `>` alone does not put error messages in the file.
- **Create an alias with `alias`, remove it with `unalias`.** To keep it, write it in `~/.bashrc`.
- View history with **`history`**, and re-run commands with **`!!` (the previous one) and `!number`**.

## Three Channels

```text
                  ┌─────────────┐
 Std input (0) ──►│   Command   │─► Std output (1)   results
    keyboard      │             │─► Std error (2)    error messages
                  └─────────────┘        screen
```

| Name | Number | Default connection |
|------|-----|----------|
| **Standard input (stdin)** | **0** | Keyboard |
| **Standard output (stdout)** | **1** | Screen |
| **Standard error (stderr)** | **2** | Screen |

- **Expect questions that ask for the numbers 0, 1, 2 directly.** Input is 0, output is 1, error is 2.
- Output and error **both come out on the screen, but they are different channels**. That is why they can be redirected separately.

## Redirecting Output

```bash
ls > list.txt         # result to a file (overwrite)
ls >> list.txt        # result to the end of a file (append)
```

| Symbol | What it does |
|------|--------|
| **`>`** | Standard output to a file — **erasing the existing contents** |
| **`>>`** | Standard output to a file — **appended at the end** |
| **`2>`** | **Standard error** to a file (overwrite) |
| `2>>` | Standard error to a file (append) |
| **`&>`** | **Output and error together** |
| `<` | A file as standard input |

> ⚠️ **`>` empties the file first.** A command like `cat a.txt > a.txt` wipes the file entirely. For logs that keep a record, use **`>>`**.

### Errors Only, Separately

```bash
find / -name "*.conf" > result.txt          # only results to a file, errors on screen
find / -name "*.conf" 2> error.txt          # only errors to a file
find / -name "*.conf" > out.txt 2> err.txt  # each separately
find / -name "*.conf" &> all.txt            # both into one file
find / -name "*.conf" 2> /dev/null          # discard errors
```

- **`/dev/null` is where you throw things away.** Anything sent there disappears. It is useful when lots of permission-error messages come out.
- `> out.txt 2>&1` is also a notation for merging the two. **`2>&1` means "send errors to the same place output goes."**

### The Order of `2>&1` Matters

```bash
ls /etc /nodir > out.txt 2>&1     # both output and error go to out.txt
ls /etc /nodir 2>&1 > out.txt     # only output goes to out.txt, error still on screen
# ls: cannot access '/nodir': No such file or directory
```

- The shell processes redirections **from left to right**. `2>&1` means "send 2 to **wherever 1 points right now**."
- In the second line, at the time of `2>&1`, 1 still points at the screen. Only afterward does 1 change to the file, so the error stays on the screen.
- **If you drop the `&` and write `2>1`,** the error is saved in a **file** named `1`.

| Notation | Where standard output goes | Where standard error goes |
|------|-----------------|-----------------|
| `command > a` | a | Screen |
| `command 2> a` | Screen | a |
| `command > a 2> b` | a | b |
| **`command > a 2>&1`** | a | a |
| **`command &> a`** | a | a |
| `command 2>&1 > a` | a | **Screen** |
| `command > /dev/null 2>&1` | Discarded | Discarded |

- `>` is shorthand for `1>`. If you omit the number, it is **1 (standard output)**.

### noclobber to Prevent Overwrite Accidents

```bash
set -o noclobber      # turn on
ls > list.txt
# bash: list.txt: cannot overwrite existing file
ls >| list.txt        # force overwrite just this once
set +o noclobber      # turn off
```

- With this option on, **`>` cannot overwrite an existing file.** `>>` (append) is not affected.
- **`-o` turns it on and `+o` turns it off.** The signs are the opposite of what intuition suggests.
- If you write only **`> file`** with no command, an empty file is created. If the file already exists, **its contents are emptied.**

### Redirecting Input

```bash
wc -l < list.txt        # file as input
sort < names.txt
```

- `<` takes **input from a file** instead of the keyboard.

```bash
wc -l list.txt       # 12 list.txt   ← the file name is printed too
wc -l < list.txt     # 12            ← no name, because only the contents were passed in
```

| Symbol | Where input comes from |
|------|--------------|
| **`<`** | **A file** |
| `<<` | **Content typed directly until an end marker appears** (Here Document) |

```bash
cat << EOF > hello.txt
first line
second line
EOF
```

- Input is taken **until the word written after `<<` (`EOF`) appears again**. You can choose any word.
- If you redirect only the output without input, as in `cat > memo.txt`, **whatever you type on the keyboard is saved to the file.** When you are done typing, finish with `Ctrl+D`.

## Connecting with Pipes

```bash
ps -ef | grep httpd | wc -l      # you can chain several
cat /etc/passwd | sort | head -5
ls -l | grep "^d"                # directories only
```

- **`|` (pipe)** passes the **standard output of the earlier command as the standard input of the later command**.
- It differs from redirection in that it passes **to a command**, not to a file.

| Category | Redirection `>` | Pipe |
|------|-----|-----|
| Passes to | **A file** | **The next command** |
| Example | `ls > a.txt` | `ls \| grep txt` |

```bash
find / -name "*.conf" | wc -l                 # error messages do not travel through the pipe and appear on screen as is
find / -name "*.conf" 2> /dev/null | wc -l    # discard errors and count only the results
find / -name "*.conf" 2>&1 | grep denied      # pass errors through the pipe too
```

- **A pipe passes only standard output (1).** To pass errors too, merge them first with `2>&1`.
- **Both sides** of a pipe must be commands. If you write `ls | list.txt`, it tries to run `list.txt` as a command and fails.

### Other Symbols That Connect Commands

| Symbol | Condition for the following command to run | Example |
|------|--------------------|-----|
| **`;`** | In sequence, **regardless** of whether the previous one succeeded | `cd /tmp ; ls` |
| **`&&`** | **Only if** the previous one **succeeded** | `mkdir work && cd work` |
| **`\|\|`** | **Only if** the previous one **failed** | `cd work \|\| echo "no dir"` |
| `\|` | Always — takes the previous one's **output as input** | `ls \| wc -l` |
| `&` | Sends the preceding command **to the background** | `sleep 100 &` |

- **`|` and `||`, and `&` and `&&`, are completely different symbols.** One character changes the meaning.
- The criterion for success or failure is the **exit status `$?`** we saw yesterday. 0 means success.

### Filters Often Used Together

| Command | What it does |
|------|--------|
| `sort` | Sort (`-r` reverse, `-n` numeric) |
| `uniq` | Removes **consecutive** duplicate lines (usually after `sort`) |
| `wc` | Counts of lines, words, characters |
| `head` / `tail` | The first / last part |
| `grep` | Lines that match a condition |
| `cut` | Cut out columns (`-d` delimiter, `-f` field) |
| `tee` | Shows on screen while **also saving to a file** |

```bash
cut -d: -f1 /etc/passwd | sort        # extract only user names and sort
ls -l | tee list.txt                  # watch and save at the same time
```

```bash
cut -d: -f7 /etc/passwd | sort | uniq -c | sort -rn
#      24 /sbin/nologin
#       3 /bin/bash
#       1 /sbin/shutdown
#       1 /sbin/halt
#       1 /bin/sync
```

- It extracts only the login shell (7th field) → sorts → counts identical ones → sorts again from most to least. This is the typical form of **doing a big job by chaining small commands with pipes**.
- **`uniq` compares only adjacent lines.** It cannot catch duplicates that are apart, so run `sort` first. `-c` also shows the counts.
- For `wc`, **`-l` is lines, `-w` is words, `-c` is bytes**.
- `tee` overwrites by default. To append, use **`tee -a`**.

## Wildcards

| Symbol | Meaning |
|------|-----|
| **`*`** | **Any number of characters** (including zero) |
| **`?`** | **Exactly one character** |
| `[abc]` | **One character** from inside the brackets |
| `[a-z]` | One character within the range |
| `[!abc]` | One character that is **not** inside the brackets |

```bash
ls *.txt          # everything ending in txt
ls a?.txt         # a1.txt, ab.txt — one character after a
ls [ab]*.txt      # txt files starting with a or b
```

- **The difference between `*` and `?`** is an exam point. `*` has no limit on count, while `?` is exactly one character.

```bash
ls
# a.txt  a1.txt  a12.txt  b1.txt  note.md
ls a?.txt         # a1.txt                  ← a.txt (0 characters) and a12.txt (2 characters) are left out
ls a*.txt         # a.txt  a1.txt  a12.txt
ls [!a]*          # b1.txt  note.md
ls *.xyz
# ls: cannot access '*.xyz': No such file or directory
```

- **It is the shell that replaces wildcards with file names.** If no file matches, the literal text `*.xyz` is passed to the command, producing the error above.
- **`*` does not match hidden files that start with a dot (`.`).** For hidden files, write the dot yourself, as in `ls .*`.
- To stop the shell from expanding it, **wrap it in quotes.** This is why `find . -name "*.txt"` has quotes — `find`, not the shell, must interpret the `*`.

> ⚠️ **Wildcards and regular expressions are different.** The `*` used in file names means "any number of any characters," but in `grep` regular expressions `*` means "**the character just before it** repeated zero or more times." In regular expressions, "any single character" is `.`.

## Aliases — alias

```bash
alias                       # list of currently defined aliases
alias ll='ls -alh'          # create
alias rm='rm -i'            # ask before deleting
unalias ll                  # remove
\ls                         # ignore the alias and run the original command
```

- **`unalias` is the delete command.** Remember it by the name.
- **Do not put spaces** on either side of the equals sign. It is the same rule as for variables.
- An alias created on the command line **disappears when you close the shell.** To keep using it, write it in **`~/.bashrc`**.

```bash
alias
# alias cp='cp -i'
# alias ll='ls -l --color=auto'
# alias ls='ls --color=auto'
# alias mv='mv -i'
# alias rm='rm -i'
alias ll
# alias ll='ls -l --color=auto'
type ll
# ll is aliased to `ls -l --color=auto'
```

- **An alias takes effect before the real command of the same name.** In the environment above, typing `rm` runs `rm -i`, which asks before deleting.

| Ways to bypass an alias | Example |
|------------------|-----|
| A **backslash** in front | `\rm file` |
| Run with an **absolute path** | `/usr/bin/rm file` |
| `command` in front | `command rm file` |

- If the value contains spaces or options, **wrap it in quotes.** `alias ll=ls -l` is an error.
- **`unalias -a`** removes **all** defined aliases.
- Aliases cannot be passed with `export`. **They are not passed to child shells or scripts**, so write them in `~/.bashrc`, which is read every time a shell is launched.

## History

```bash
history               # list of executed commands (with numbers)
history 10            # the last 10
!!                    # re-run the previous command
!25                   # re-run command number 25
!ls                   # the most recent command starting with ls
history -c            # clear the list
```

| Notation | What it does |
|------|--------|
| **`!!`** | Re-runs the **previous command** |
| **`!number`** | Re-runs the command with that number |
| `!string` | The most recent command starting with that string |
| `Ctrl+R` | **Reverse search** as you type |

- History is saved in **`~/.bash_history`**, and its size is set by the environment variable **`HISTSIZE`**.
- `sudo !!` is a common idiom meaning "run the last command again with sudo."

| Notation | What it does |
|------|--------|
| **`!$`** | The **last argument** of the previous command |
| `!-2` | Re-runs the command **two back** (`!-1` is the same as `!!`) |
| `!?string?` | The most recent command that **contains** that string |
| `^old^new` | Re-runs the previous command with text replaced |

```bash
mkdir /var/www/project
cd !$                   # runs as cd /var/www/project
history | tail -3
#   101  mkdir /var/www/project
#   102  cd /var/www/project
#   103  history | tail -3
```

- **`!!` is the whole command, and `!$` is one last argument.** Notations starting with `!` are replaced with the actual command before execution, shown once on screen, and then run.

| Variable / file | Role |
|---------|------|
| **`HISTSIZE`** | Number of commands the shell remembers **in memory** |
| `HISTFILESIZE` | Number of lines kept **in the file** |
| `HISTFILE` | Location of the history file (default `~/.bash_history`) |

- History is not written to the file the moment you type it. It is **recorded in `~/.bash_history` when the shell exits**. That is why, if you keep two terminals open, you cannot see each other's latest commands.
- The value of `HISTSIZE` varies with distribution settings. The Red Hat family sets it to 1000 in `/etc/profile`.

### Keys That Help with Input

| Key | What it does |
|----|--------|
| **`Tab`** | **Autocompletes** command and file names (press twice for a list of candidates) |
| `↑` / `↓` | Recall previous / next command |
| `Ctrl+A` / `Ctrl+E` | Go to the start / end of the line |
| `Ctrl+U` | Delete everything before the cursor |
| `Ctrl+L` | Clear the screen (same as `clear`) |
| `Ctrl+C` | Cancel the line being typed or the running command |
| `Ctrl+D` | End of input. Pressed at an empty prompt, it **logs out** |

> Writing commands chained like this into a file and running them all at once is a **shell script**. How to write them is within the Level 1 scope, so just know the name here.

> Tomorrow we wrap up this week's shell content on a single page.

## 📖 Glossary

- **Standard input (stdin, 0)** : The channel through which a command receives input. The default is the keyboard.
- **Standard output (stdout, 1)** : The channel through which a command sends its results. The default is the screen.
- **Standard error (stderr, 2)** : The channel through which error messages go out. Separate from output.
- **Redirection** : Changing the direction of input/output to a file, etc. `>`, `>>`, `2>`, `<`.
- **`/dev/null`** : A special device file that discards whatever is sent to it.
- **Pipe (`|`)** : A symbol that passes the output of the earlier command as the input of the later command.
- **Alias** : A feature that gives a short name to a long command. Removed with `unalias`.
- **History** : The record of executed commands. Saved in `~/.bash_history`.

## 📝 Practice Questions

**Question 1.** Which of the following symbols saves a command's result at the end of an existing file without erasing its contents?

A) >>  
B) >  
C) <  
D) |  

**Answer: A**  
Explanation: `>` empties the file first and then writes the result, so the existing contents disappear. To append, you must use `>>`, which is used when data must keep accumulating, as with logs. `<` is input redirection and `|` is a pipe.

---

**Question 2.** Which of the following symbols saves only the error messages produced while a command runs to a file?

A) >  
B) 1>  
C) &>  
D) 2>  

**Answer: D**  
Explanation: Since the file descriptor number of standard error is 2, using `2>` sends only the error messages to a file. `>` and `1>` send standard output, and `&>` sends standard output and standard error together. To discard errors entirely, use `2> /dev/null`.

---

**Question 3.** Which of the following lists the file descriptor numbers of standard input, standard output, and standard error, in that order?

A) 1, 2, 3  
B) 1, 0, 2  
C) 0, 1, 2  
D) 2, 1, 0  

**Answer: C**  
Explanation: The file descriptors are 0 for standard input, 1 for standard output, and 2 for standard error. Standard output and standard error both appear on the screen by default, but they are different channels, so each can be sent to a different file.

---

**Question 4.** Which of the following commands removes a defined alias?

A) alias -d  
B) unalias  
C) unset alias  
D) alias -r  

**Answer: B**  
Explanation: Use `alias` to create an alias and `unalias` to remove it. `unset` is a command that deletes variables, so it does not apply to aliases. To keep an alias permanently, you must record it in `~/.bashrc`.

---

**Question 5.** Which of the following notations re-runs the command executed immediately before?

A) !!  
B) !?  
C) !1  
D) !$  

**Answer: A**  
Explanation: `!!` re-runs the most recently executed command in history exactly as it was. A common approach is retrying with `sudo !!` after a failure due to insufficient privileges. `!1` is the notation that runs history command number 1.
