# Day 2 - Shell Variables and Environment Variables

## 📌 Key Points

- You create a variable with **`name=value`**. **There must be no spaces on either side of the equals sign.**
- **A shell variable lives only in the current shell**, while **an environment variable is passed down to child processes**. That difference is everything.
- The command that promotes a shell variable to an environment variable is **`export`**.
- To get a value out, use **`$name`**, as in `echo $PATH`.
- **`PATH` is the list of paths where commands are searched for**, and the separator is the **colon (`:`)**.

## Creating Variables

```bash
NAME=linux           # create — no spaces around the equals sign!
echo $NAME           # linux
echo ${NAME}         # wrapping in braces also works
NAME="hello world"   # use quotes when the value contains spaces
unset NAME           # delete
```

> **Spaces are an easy source of mistakes.** If you write `NAME = linux`, the shell treats `NAME` as a command and tries to run it. **Write `=` with no spaces on either side.**

- By convention, variable names use **uppercase**. It is not required, but it makes them easy to tell apart from system variables.
- **Add `$` only when retrieving the value.** Do not add it when creating the variable.

### Naming Rules and Braces

| Rule | Valid examples | Invalid examples |
|------|--------|-----------|
| Use only letters, digits, and underscores (`_`) | `MY_NAME`, `dir2` | `MY-NAME`, `my.name` |
| **Cannot start with a digit** | `v1` | `1v` |
| **Case-sensitive** | `Name` and `NAME` are different variables | — |

```bash
FILE=report
echo $FILE_backup      # (blank line)        ← looks for a variable named FILE_backup
echo ${FILE}_backup    # report_backup
```

- Braces mark **where the variable name ends**. They are needed when other characters follow immediately.
- **Reading an undefined variable gives an empty value, not an error.** A mistyped name passes silently, so typos are hard to notice.

### Values That Change Depending on Quotes

```bash
NAME=linux
echo "I use $NAME"            # I use linux           double quotes — variable is replaced by its value
echo 'I use $NAME'            # I use $NAME           single quotes — literal text
echo "Today is `date +%F`"    # Today is 2026-10-14   backticks — result of running a command
echo "Today is $(date +%F)"   # same as above
```

| Symbol | Name | `$variable` inside it |
|------|------|-----------------|
| **`" "`** | Double quotes | **Is replaced by its value** |
| **`' '`** | Single quotes | **Is not replaced** (literal text) |
| `` ` ` `` | Backticks | Replaced by the **result of running the command** inside. Same as `$( )` |
| `\` | Backslash | Removes the special meaning of the **one character** right after it — `echo \$NAME` prints `$NAME` |

> **Double quotes let it through; single quotes block it.** Both group whitespace into a single value, but they differ in whether `$` is interpreted. Backticks look like quotes, but they do something completely different: **run a command**.

## Shell Variables vs Environment Variables

```text
   Current shell
   ├── NAME=linux        (shell variable)        ─┐
   └── export AGE=30     (environment variable)  ─┼─ what gets passed to the child?
        │                                         │
        ▼ run a child process                     │
      Child shell                                 │
        NAME → empty  ◄───────────────────────────┘  not passed
        AGE  → 30                                    passed
```

| Category | **Shell variable** | **Environment variable** |
|------|-----------|-------------|
| Scope | **Current shell only** | **Down to child processes** |
| Creating | `NAME=value` | **`export NAME=value`** |
| Viewing | **`set`** | **`env`** or `printenv` |
| Examples | Variables a user created temporarily | `PATH`, `HOME`, `SHELL` |

```bash
NAME=linux              # shell variable
export NAME             # promote to environment variable
export AGE=30           # create and make it an environment variable at once
```

| Command | What it shows |
|------|------------|
| **`set`** | **Shell variables + environment variables, all of them** |
| **`env`** | **Environment variables only** |
| `printenv` | Environment variables only (similar to `env`) |
| `export` | The list of environment variables |
| `unset name` | Deletes a variable |

> **`set` shows everything, `env` shows only environment variables.** This pair is within the exam scope. In terms of output range, `set` is the wider one.

### Check It Yourself: Is It Visible in the Child Shell?

```bash
NAME=linux             # shell variable
export AGE=30          # environment variable
bash                   # enter a child shell
echo "[$NAME] [$AGE]"
# [] [30]              ← NAME is empty and only AGE came through
AGE=99                 # try changing the value in the child
exit                   # return to the parent shell
echo $AGE
# 30                   ← the parent's value is unchanged
```

- Passing goes **one way, parent → child**. The child receives a **copy** of the parent's environment, so whatever the child changes never reaches the parent.
- A script run with `bash script.sh` is also a child shell. **A variable you `export` inside a script disappears when the script ends.**
- Once a variable has been `export`ed, **it stays an environment variable even if you change its value again**. You do not need to `export` again each time you change it.

### More Commands for Working with Variables

```bash
export -p | head -3
# declare -x HOME="/home/user"
# declare -x LANG="ko_KR.UTF-8"
# declare -x LOGNAME="user"
printenv HOME          # /home/user        ← giving a name prints only that value
env | grep LANG        # LANG=ko_KR.UTF-8
export -n AGE          # turn an environment variable back into a shell variable (value remains)
unset AGE              # delete the variable itself
env LANG=C date        # run this one command with LANG changed
# Wed Oct 14 09:30:00 KST 2026
```

| Easily confused pair | Difference |
|-----------|------|
| `unset` vs `export -n` | **Deletes the variable** / keeps the value and only removes its **environment-variable status** |
| `env` vs `printenv` | Both print environment variables. `printenv` lets you **specify a name**, and `env` can **run a command in a temporary environment** |
| `set` vs `env` | The output of `set` includes not only shell variables but also **shell functions** |

- In the **`declare -x`** from `export -p` output, the `x` is the export attribute. So `declare -x NAME` is the same as `export NAME`, but a plain `declare NAME` without the option does not create an environment variable.
- To delete, use **`unset NAME`**. If you write `unset $NAME`, it tries to delete the variable whose name is the **value contained in** NAME.

## Major Environment Variables

| Variable | What it holds |
|------|--------|
| **`PATH`** | **List of directories to search for commands** |
| **`HOME`** | Home directory |
| **`SHELL`** | Login shell |
| **`USER`** | Current user name |
| **`PWD`** | Current working directory |
| **`LANG`** | Language and character encoding |
| **`TERM`** | Terminal type |
| **`PS1`** | **Prompt appearance** |
| `HISTSIZE` | Number of commands to keep in history |
| `EDITOR` | Default editor |
| `HOSTNAME` | Host name |
| `LOGNAME` | Login name |

```bash
echo $HOME       # /home/user
echo $USER       # user
echo $PWD        # current directory — same value as the pwd command
echo $LANG       # ko_KR.UTF-8
```

### Variables Often Asked Together

| Variable | What it holds |
|------|--------|
| `PS2` | The **secondary prompt** shown when a command is not finished (default `>`) |
| `HISTFILE` | The file where history is saved (default `~/.bash_history`) |
| `HISTFILESIZE` | Number of lines to keep in the history **file** |
| `TMOUT` | Automatically logs out after this many **seconds** without input |
| `MAIL` | Path to the mailbox |
| `DISPLAY` | Where X Window screens are shown |
| `OLDPWD` | The previous working directory — where `cd -` goes back to |

- **`HISTSIZE` is the number to remember in memory, and `HISTFILESIZE` is the number to keep in the file.** The names are similar, so questions swap them.
- `USER` and `LOGNAME` usually hold the same value.

### PS1 — Prompt Appearance

```bash
echo $PS1
# [\u@\h \W]\$
# On screen it looks like this →  [user@server1 ~]$
```

| Symbol | Value it becomes |
|------|----------|
| **`\u`** | User name (user) |
| **`\h`** | Host name (host) |
| **`\w`** | The **full path** of the current directory |
| **`\W`** | **Only the last name** of the current directory |
| **`\$`** | `#` if root, `$` for a regular user |
| `\d` / `\t` | Date / time (24-hour) |
| `\!` | History number |

- **`\w` and `\W` are distinguished by case.** When you are in `/usr/local/bin`, `\w` shows `/usr/local/bin` and `\W` shows `bin`.
- A prompt ending in `#` means you are working as root. `\$` is what creates this distinction.

## PATH — Where Are Commands Looked Up?

```bash
echo $PATH
# /usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin
#                └ separated by colons (:)
```

- When you type `ls`, the shell **searches the directories listed in PATH in order from the front** to find the executable.
- **The separator is the colon (`:`)**. This differs from Windows, which uses a semicolon.
- Paths earlier in the list are searched **first**. If commands with the same name exist in several places, the earlier one wins.

```bash
export PATH=$PATH:/opt/myapp/bin      # append at the end (recommended)
export PATH=/opt/myapp/bin:$PATH      # prepend (to take priority)
which ls                              # /usr/bin/ls — the location actually found
```

> ⚠️ **If you leave out `$PATH`, as in `export PATH=/opt/bin`,** all the existing paths vanish and even `ls` will not run. Always include **`$PATH:`**.

- **As a rule, the current directory (`.`) should not be put in PATH.** If a malicious file with the same name is planted, that is what would run. That is why scripts in the current location are run with a path, like **`./script.sh`**.

### What Happens When It Is Not in PATH

```bash
ls -l backup.sh
# -rwxr-xr-x 1 user user 120 Oct 14 09:00 backup.sh
backup.sh
# bash: backup.sh: command not found
./backup.sh
# backup start...
```

- The file is right in front of you and has execute permission, yet it is not found. This is because **the shell searches only the places listed in PATH, not the current directory**.

| Message | Cause |
|-------|------|
| **`command not found`** | **That name is not in any PATH directory** |
| `Permission denied` | It was found, but **has no execute permission (x)** |

- **`which` tells you the location of the executable found in PATH**, and `type` also tells you whether the name is an alias or a builtin.
- **Builtin commands** such as `cd`, `echo`, and `export` **run regardless of PATH.** So even if you have broken PATH, you can revive it by typing `export PATH=/usr/bin:/bin`.

## Special Variables

| Variable | Meaning |
|------|-----|
| **`$?`** | **Exit status of the previous command** (0 means success) |
| **`$$`** | **PID** of the current shell |
| `$0` | Name of the running shell or script |
| `$!` | PID of the last background job |

```bash
ls /nonexistent
echo $?          # 2  ← non-zero means failure
ls /etc
echo $?          # 0  ← success
```

- **If `$?` is 0, it succeeded.** A non-zero value means an error. This is the opposite of ordinary true/false, so it is easy to get confused.

| `$?` value | Meaning |
|--------|-----|
| **0** | **Success** |
| 1 | General failure — e.g., `grep` found no matching lines |
| 2 | Usage error, etc. — e.g., `ls` could not access the specified file |
| 126 | Found but cannot be executed (no permission) |
| 127 | Command not found (`command not found`) |
| 130 | Interrupted with `Ctrl+C` |

```bash
grep root /etc/passwd > /dev/null
echo $?        # 0
echo $?        # 0     ← this is the result of the echo just run. The grep value has already been overwritten
echo $$        # 2314  ← PID of the current shell
sleep 100 &
echo $!        # 2377  ← PID of the sleep just sent to the background
```

- There is only one thing to memorize — **only 0 is success; everything else is failure**. The value range is 0 to 255, and the detailed meaning of non-zero values varies by command.
- **`$?` remembers only the one previous command.** To check it, read it right away without putting another command in between.

## Variables Disappear When You Leave the Shell

```bash
export PATH=$PATH:/opt/bin     # valid only in this shell right now
```

| How it was created | How long it lives |
|-----------|--------------|
| `NAME=value command` or `env NAME=value command` | For **that one command** only |
| `NAME=value` | The current shell |
| `export NAME=value` | The current shell and the children launched from it |
| Written in a configuration file (`~/.bashrc`, etc.) | **Recreated at every login** |

- A variable created with a command **disappears when you close the terminal.**
- To keep using it, **you must write it in a configuration file** — `~/.bashrc` or `~/.bash_profile`. That is tomorrow's topic.

> Tomorrow we cover when and in what order these variables are read: the shell environment configuration files.

## 📖 Glossary

- **Shell variable** : A variable valid only inside the current shell. It is not passed to child processes.
- **Environment variable** : A variable passed down to child processes. Created with `export`.
- **`export`** : The command that promotes a shell variable to an environment variable.
- **`set`** : The command that shows both shell variables and environment variables.
- **`env`** : The command that shows only environment variables.
- **`PATH`** : The list of directories to search for executables. Separated by colons.
- **`PS1`** : The environment variable that defines the appearance of the prompt.
- **`$?`** : A special variable holding the exit status of the previous command. 0 means success.

## 📝 Practice Questions

**Question 1.** Which of the following commands turns a shell variable into an environment variable so that it is also passed to child processes?

A) set  
B) export  
C) unset  
D) declare  

**Answer: B**  
Explanation: `export` promotes a shell variable to an environment variable so that its value is also passed to child processes launched from that shell. `set` is a command that shows the list of variables, and `unset` is a command that deletes a variable.

---

**Question 2.** Which of the following environment variables holds the list of directories to search for executables?

A) PATH  
B) HOME  
C) SHELL  
D) TERM  

**Answer: A**  
Explanation: `PATH` lists, separated by colons, the directories where the shell looks for an executable when you enter a command. It searches in order starting from the paths written first. `HOME` holds the home directory, `SHELL` the login shell, and `TERM` the terminal type.

---

**Question 3.** Which of the following characters separates the directories in the `PATH` environment variable?

A) Semicolon (;)  
B) Comma (,)  
C) Space  
D) Colon (:)  

**Answer: D**  
Explanation: On Linux, the path separator in `PATH` is the colon. Be careful not to confuse it with Windows, which uses a semicolon. To add a path while keeping the existing value, write it in the form `export PATH=$PATH:/new/path`.

---

**Question 4.** Which of the following commands prints only environment variables?

A) set  
B) unset  
C) env  
D) export -n  

**Answer: C**  
Explanation: `env` and `printenv` print only environment variables. `set`, on the other hand, shows every variable the current shell has, including shell variables, so its output is much longer. `unset` is a command that deletes a variable.

---

**Question 5.** Which of the following is a correct variable declaration?

A) NAME = linux  
B) NAME=linux  
C) $NAME=linux  
D) set NAME linux  

**Answer: B**  
Explanation: When declaring a variable in the shell, you put no spaces on either side of the equals sign. If you add spaces, the shell interprets `NAME` as a command and gives an error. Also, `$` is added only when retrieving the value, so it is not used when declaring.
