# Day 1 - What a Shell Really Is: The Command Interpreter and the World of Variables

## 📌 Key Takeaways

- The shell is the **command interpreter** between the kernel and the user. It loops through a REPL: read, interpret, execute, wait.
- Shells split into the **Bourne family (sh→ksh→bash→zsh)** and the **C family (csh→tcsh)**. The Linux standard is bash.
- Variables are divided by whether they are `export`ed: **shell variables are not inherited by children**, **environment variables are inherited** (but never flow back up to the parent).
- The scope differences among `set` (shell + environment + functions), `env` (environment only), and `export` (promotion) are an exam favorite.
- Initialization files: a login shell reads `/etc/profile → ~/.bash_profile`; an interactive shell reads `/etc/bashrc → ~/.bashrc`. Use `source` to apply changes immediately.

## What Is a Shell: The Interpreter Between Kernel and User

From the Thompson shell in 1971, to the Bourne shell (`sh`) in 1977, to Bash in 1989 — the shell is the program Linux users meet first and most often. For the Level 1 exam, the shell is treated not as a mere "command input box" but as **an interpreter language and a user environment in one**.

- A Linux system is broadly divided into the **kernel** and the **shell**.
- The kernel is the core that controls the hardware directly, and the shell is the **command interpreter** that passes user input to the kernel in a form it understands.
- The very name "shell" means a husk — it is the outermost layer that wraps the kernel and touches the user.

```text
1. Print prompt → wait for user input
2. Read the input line (read)
3. Split into tokens + expand metacharacters/wildcards (parsing & expansion)
4. Perform variable substitution and command substitution
5. Decide whether it is a builtin or an external command
6. If external, search PATH for the executable
7. Create and run a child process via fork() → exec()
8. Wait for it to finish with wait() and collect the exit status
9. Print the prompt again
```

- The shell repeats this one cycle (REPL: Read-Eval-Print Loop) until you log out.

Shells are divided into "interactive shells" and "non-interactive shells". Typing directly in a terminal gives an interactive shell; running a script file gives a non-interactive one. They read different initialization files — that difference is the heart of today's last topic.

## Shell Types and Features: sh, csh, ksh, bash, zsh

The exam asks about each shell's **developer, family, and features**. They split broadly into the **Bourne shell family (sh → ksh → bash)** and the **C shell family (csh → tcsh)**.

| Shell | Name | Developer | Year | Family | Features |
|----|------|--------|------|------|------|
| `sh` | Bourne Shell | Stephen Bourne | 1977 | Bourne | The first standard shell, the baseline for scripts |
| `csh` | C Shell | Bill Joy | 1978 | C | Borrowed C language syntax, introduced history and alias |
| `tcsh` | TENEX C Shell | - | 1983 | C | Improved csh, command completion |
| `ksh` | Korn Shell | David Korn | 1983 | Bourne | sh compatible + csh features merged, arithmetic capabilities |
| `bash` | Bourne-Again Shell | Brian Fox | 1989 | Bourne | The GNU default shell, the Linux standard |
| `zsh` | Z Shell | Paul Falstad | 1990 | Bourne | Powerful autocompletion and plugins, macOS default |
| `dash` | Debian Almquist | - | 2002 | Bourne | Lightweight and fast POSIX sh, Debian's `/bin/sh` |

- **bash** is the **default login shell** on most Linux distributions. It is compatible with the Bourne shell while absorbing the convenience features of the C shell (history, alias, job control).
- **csh/tcsh** use C-like syntax and were the first shells to introduce **command history** and **alias**.
- **ksh** kept Bourne shell compatibility while strengthening **command-line editing and arithmetic**.
- **zsh** became more widely known when it became the default shell of macOS Catalina in 2019.

The name "Bourne-Again" in Bash is a pun on the Bourne shell being "born again". It also sounds just like the religious phrase "born-again", which shows the typical GNU wit.

### Checking Which Shells Are Available

- The list of shells installed on the system is in the `/etc/shells` file.
- Each user's default login shell is recorded in the last field of `/etc/passwd`.

```bash
cat /etc/shells          # list of installed shells
echo $SHELL              # path of the current login shell
echo $0                  # name of the currently running shell
grep "^$(whoami):" /etc/passwd   # check the login shell of my account
chsh -s /bin/zsh         # change the default login shell to zsh (change shell)
```

> ⚠️ **Trap**: `$SHELL` points to the "default shell assigned at login", not "the shell running right now". Even if you log in with bash and then run `zsh` manually, `$SHELL` still shows `/bin/bash`. To see the shell that is actually running, use `echo $0` or `ps -p $$`.

## Shell Variables vs Environment Variables: Scope Decides Everything

- **Shell variable (local variable / shell variable)**: valid only inside the current shell. It is **not inherited** by child processes.
- **Environment variable**: marked with `export`, so it **is inherited by child processes**.

```bash
# Declare a shell variable — valid only in the current shell
NAME="linux"
echo $NAME            # linux

# Promote it to an environment variable — inherited by children
export NAME

# Or declare and export in one line
export PROJECT="cert"
```

Seeing this difference for yourself is the key to understanding it.

```bash
# Try it yourself: shell variables are not inherited by children
LOCAL_VAR="only-here"
export GLOBAL_VAR="passed-down"

bash                  # enter a child shell
echo "$LOCAL_VAR"     # (blank line) — not inherited
echo "$GLOBAL_VAR"    # passed-down — inherited
exit                  # return to the parent shell
```

Variable inheritance flows in **one direction only**, parent → child. Changing an environment variable in a child shell never affects the parent shell, because the child starts with a "copy" of the parent's environment. That is why a variable changed with `export` inside a script does not remain in the parent shell that called the script.

### set, env, export — Three Commands for Handling Variables

These three commands are often confused, so you need to tell them apart precisely.

| Command | What it shows | Purpose |
|------|------------|------|
| `set` | **Shell variables + environment variables + functions**, everything | Print all variables of the current shell |
| `env` | **Environment variables only** | Print environment variables, run a command in a temporary environment |
| `export` | Only exported variables (environment variables) (`export -p`) | Promote a shell variable to an environment variable |
| `unset` | - | Delete a variable or function |

```bash
set | head             # all variables (shell+environment+functions) — the longest output
env                    # environment variables only
export -p              # list of exported variables
unset NAME             # delete a variable
declare -p NAME        # check a variable's attributes and value (bash builtin)
```

`env` is used not only for printing but also to **run a command with a temporarily modified environment**.

```bash
# Temporarily set LANG to C and run date (the current shell environment is unchanged)
env LANG=C date

# Clear all environment variables and run in a clean environment
env -i bash
```

Besides printing variables, `set` is also used to turn **shell options** on and off. `set -x` traces the commands being executed (debugging), `set -e` stops immediately on an error, and `set -u` raises an error when an undefined variable is used. The `set -euo pipefail` at the top of a script is exactly this combination of options, an idiom for safe scripts.

### Major Environment Variables

| Variable | Meaning |
|------|------|
| `PATH` | List of directories to search for command executables (separated by `:`) |
| `HOME` | The user's home directory |
| `PWD` | The current working directory |
| `SHELL` | Path of the default login shell |
| `USER` / `LOGNAME` | Login user name |
| `LANG` | Language and locale settings |
| `PS1` | The default prompt string |
| `TERM` | Terminal type |
| `HISTSIZE` | Number of history entries kept in memory |
| `MAIL` | Path of the mailbox |

```bash
echo $PATH
# /usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin

# Add a directory to PATH (putting it first makes it searched first)
export PATH=/opt/myapp/bin:$PATH
```

> ⚠️ **Trap**: When setting `PATH`, do not overwrite the existing value. Writing `export PATH=/opt/bin` leaves you unable to find even basic commands like `ls` and `cat`. You must **include the existing $PATH**, as in `export PATH=/opt/bin:$PATH`. Also, PATH is searched **from the front**, so if the same command name exists in several places, the one in the directory that appears first is executed.

## Shell Initialization Files: Who Is Read, When, and in What Order

Which configuration files bash reads at startup depends on **(1) whether it is a login shell and (2) whether it is interactive**. This is within the Level 1 exam scope.

### Global Settings vs User Settings

- **Global (system-wide)**: `/etc/profile`, `/etc/profile.d/*.sh`, `/etc/bashrc` (or `/etc/bash.bashrc`) — apply to all users. Only the administrator (root) can modify them.
- **User (personal)**: `~/.bash_profile`, `~/.bash_login`, `~/.profile`, `~/.bashrc`, `~/.bash_logout` — located in each user's home directory.

### Read Order of a Login Shell

A login shell (console login, SSH connection, etc.) reads files in the following order.

```text
1. /etc/profile          (global — all users)
     └─ /etc/profile.d/*.sh  (collection of global settings)
2. In the user's home, run only "the first one found" of:
     ~/.bash_profile  →  ~/.bash_login  →  ~/.profile
3. At logout: ~/.bash_logout
```

- The key point is that in step 2 it **does not read all three files, only the first one that exists**.
- That is why most distributions write `~/.bash_profile` so that it explicitly loads `~/.bashrc`.

```bash
# Typical contents of ~/.bash_profile
if [ -f ~/.bashrc ]; then
    . ~/.bashrc          # load .bashrc ( . is short for source)
fi
```

### Read Order of a Non-Login Interactive Shell

An **interactive shell that does not go through login**, such as opening a new tab in a terminal emulator, reads only the following.

```text
1. /etc/bashrc  (or /etc/bash.bashrc, global)
2. ~/.bashrc    (user)
```

To sum up — **`.bash_profile` is read once at login**, and **`.bashrc` is read every time a new shell is launched**. So the convention is to put "settings needed in every shell every time", like aliases and functions, in `.bashrc`, and "settings that are set once at login and inherited by children", like environment variables, in `.bash_profile`.

| File | Scope | When it runs |
|------|------|-----------|
| `/etc/profile` | Global | When a login shell starts (all users) |
| `/etc/bashrc` | Global | When an interactive shell starts (all users) |
| `~/.bash_profile` | Personal | When a login shell starts |
| `~/.bashrc` | Personal | When an interactive shell starts |
| `~/.bash_logout` | Personal | At logout |
| `~/.profile` | Personal | Fallback when `.bash_profile` is absent (sh compatible) |

`~/.profile` is not bash-specific; it is a **Bourne-shell-compatible file**. Debian/Ubuntu traditionally ship `~/.profile` instead of `~/.bash_profile`. Since bash looks for `.bash_profile` first, then `.bash_login`, and then `.profile`, on Ubuntu `.profile` effectively serves as the login script.

### Applying Configuration Changes Immediately: source

To apply a modified configuration file immediately without logging out and back in, use `source` or `.` (dot).

```bash
source ~/.bashrc       # re-read the contents of .bashrc into the current shell
. ~/.bashrc            # exactly the same as above ( . is the short form of source)
```

You must not run it like `bash ~/.bashrc`. That launches a **new child shell**, applies the settings only inside it, and then ends, so nothing changes in the current shell. You must use `source` (or `.`) to read the file **inside the current shell process** for the change to persist. This is the concept directly tied to shell variable inheritance (parent↔child).

The `source` command first appeared in the C shell, while the Bourne family did the same job with just `.` (dot). bash supports both notations. If the exam asks "Which command does the same job as `. file`?", the answer is `source`.

Tomorrow we build on this foundation and cover redirection and pipes.

## 📖 Glossary

- **Shell** : A program that interprets the commands the user types and passes them to the kernel. It gets this name because it is a "husk" wrapped around the kernel.
- **REPL** : The shell's basic cycle of Read, Eval, Print, and Loop again.
- **Interactive / non-interactive shell** : A shell where you type directly in a terminal versus a shell that runs a script. They read different configuration files.
- **Login shell** : A shell started by a console login or SSH connection. It reads `/etc/profile` and `~/.bash_profile`.
- **Shell variable** : A variable that lives only in the current shell. It is not passed on to child processes.
- **Environment variable** : A variable marked with `export` that is inherited by child processes. It never travels back up to the parent, though.
- **`export`** : The command that promotes a shell variable to an environment variable.
- **`set` vs `env`** : `set` shows shell variables, environment variables, and functions all together, while `env` shows only environment variables.
- **PATH** : The list of directories to search for command executables. It is searched from the front, and overwriting it means even basic commands cannot be found.
- **PS1** : The environment variable that determines how the prompt looks.
- **`~/.bash_profile` vs `~/.bashrc`** : The former is read once at login, the latter every time a new shell is launched.
- **`source` (`.`)** : A command that reads a file **inside the current shell** to apply settings immediately. The result differs from `bash file`.

## 📝 Practice Questions

**Question 1.** Which of the following shell family classifications is incorrectly matched?

A) bash — Bourne family
B) tcsh — C shell family
C) ksh — C shell family
D) zsh — Bourne family

**Answer: C**
Explanation: ksh (Korn Shell) was created by David Korn while maintaining compatibility with the Bourne shell (sh), so it belongs to the **Bourne family**. The C shell family is csh and its improved version tcsh. bash and zsh also follow Bourne shell syntax, so they are Bourne family. It is easy to mistake ksh for the C shell family because it has a 'k' in its name and absorbed convenience features of the C shell such as arithmetic. But its syntactic lineage is the Bourne shell.

---

**Question 2.** Which command correctly turns the shell variable `VAR` into an environment variable so that it is inherited by child processes?

A) `set VAR`
B) `export VAR`
C) `env VAR`
D) `declare VAR`

**Answer: B**
Explanation: The command that promotes a shell variable to an environment variable (inherited by children) is `export`. `set` is used to control shell options and print all variables, and `env` is used to print environment variables or run in a temporary environment; it does not export variables. `declare` is a builtin that sets variable attributes, but for child inheritance it needs the -x option, as in `declare -x VAR`. `declare VAR` alone does not export it.

---

**Question 3.** Which global configuration file does a login shell read first?

A) `~/.bashrc`
B) `/etc/bashrc`
C) `/etc/profile`
D) `~/.bash_profile`

**Answer: C**
Explanation: A login shell first reads the global file `/etc/profile` (and, from within it, `/etc/profile.d/*.sh`), and then reads `~/.bash_profile` in the user's home (or `~/.bash_login`, `~/.profile` if it is absent). `/etc/bashrc` and `~/.bashrc` are files read by a non-login interactive shell, so they do not count as "first" for a login shell. `~/.bash_profile` is a user's personal file, not a global one.

---

**Question 4.** Which command prints **only the environment variables** set in the current shell?

A) `set`
B) `env`
C) `declare`
D) `alias`

**Answer: B**
Explanation: `env` prints only environment variables (exported variables). `set` prints shell variables, environment variables, and even functions, so its scope is wider. `declare` without arguments shows all variables and functions, and `alias` prints the list of registered aliases, not variables. The one that exactly satisfies the condition "environment variables only" is `env` (or `export -p`).

---

**Question 5.** What is the correct way to apply a modified `.bashrc` to the current shell immediately, without logging out?

A) `bash ~/.bashrc`
B) `exec ~/.bashrc`
C) `source ~/.bashrc`
D) `run ~/.bashrc`

**Answer: C**
Explanation: `source ~/.bashrc` (or `. ~/.bashrc`) re-reads the file contents **inside the current shell process** and applies the changes immediately. `bash ~/.bashrc` launches a new child shell, applies the settings only there, and exits, so nothing changes in the current shell. `exec` replaces the current process with another program, so its purpose is different, and `run` is not an existing command.

---

**Question 6.** Which of the following statements about the `PATH` environment variable is incorrect?

A) It is a list of directories separated by colons (`:`)
B) If the same command name exists in several places, the directory later in PATH takes priority
C) It is the path searched for executables when running external commands
D) You can add to the front of the existing path with `export PATH=/opt/bin:$PATH`

**Answer: B**
Explanation: PATH is searched **from the front (left)**, so if the same command name exists in several directories, the one in the directory that **appears first (at the front)** is executed. Therefore the statement "the later one takes priority" is wrong. The rest are all correct. PATH is a colon-separated list of directories, it is used to search for external commands, and including `$PATH` while prepending a new path is the safe way to add one.

---

**Question 7.** Which user configuration file does a non-login interactive shell (opening a new tab in a terminal) read?

A) `~/.bash_profile`
B) `~/.bash_login`
C) `~/.bashrc`
D) `~/.bash_logout`

**Answer: C**
Explanation: A non-login interactive shell reads the user's `~/.bashrc` after the global `/etc/bashrc`. `~/.bash_profile` and `~/.bash_login` are files read by a login shell, and `~/.bash_logout` is the file executed at logout. That is why the convention is to put settings needed in every shell, such as aliases and functions, in `~/.bashrc`, and to write `.bash_profile` so that it sources `.bashrc` so the settings also apply in login shells.

---
