# Day 3 - Taming the Shell: Aliases, History, and Job Control

## 📌 Key Takeaways

- `alias` applies only to the **first word** of a command. For permanent effect use `~/.bashrc`; for a temporary bypass use `\command`.
- Three ways to reuse history: `!!` (previous) · `!100` (by number) · `!$` (last argument of the previous command). Behavior is tuned with `HISTSIZE` and `HISTCONTROL`.
- `Ctrl-Z` **suspends (SIGSTOP)**, `Ctrl-C` **terminates (SIGINT)**. Revive a stopped job with `bg`/`fg`.
- Closing the terminal sends **SIGHUP** and kills jobs. Make them immune with `nohup ... &` (at start) or `disown` (midway).
- `$( )` is command substitution (output becomes the value), `$(( ))` is arithmetic expansion (the calculation result). One pair of parentheses makes a completely different meaning.

## alias: Turning Long Commands into Short Words

For an administrator who types the same commands dozens of times a day, the shell has to be more than a mere input box. The first tool for that is the alias.

- `alias` gives a **nickname** to a command or a group of commands, so you don't have to memorize frequently used option combinations.

```bash
alias                    # show all registered aliases
alias ll='ls -alF'       # typing ll runs ls -alF
alias rm='rm -i'         # always run rm in confirmation mode (safety net)
alias ..='cd ..'         # typing .. moves to the parent directory
alias grep='grep --color=auto'   # color grep results

unalias ll               # remove the ll alias
unalias -a               # remove all aliases
```

- Where you register it matters. If you register it directly on the command line, it is valid **only in the current shell and disappears at logout**.
- To make it permanent, you have to put it in `~/.bashrc` (because .bashrc is read every time a shell starts).

```bash
# Add it to ~/.bashrc for permanent effect
echo "alias ll='ls -alF'" >> ~/.bashrc
source ~/.bashrc         # apply immediately
```

An alias applies only to the **first word (the command name)** of a command. Even if you register `alias ll='ls -l'`, it is not expanded in `xll` or `echo ll`. The shell substitutes only when the first word of the command line is in the alias list.

> ⚠️ **Trap**: To run the **original command** when an alias is masking it, put a backslash (`\`) in front of the command. For example, with `alias rm='rm -i'` in effect, typing `\rm file` runs the original `rm` without confirmation. `command rm file` or the absolute path `/bin/rm file` has the same effect. This is the standard way to bypass an alias temporarily.

The alias feature first appeared in the C shell created by Bill Joy in 1978. The earlier Bourne shell had no aliases. This convenience was so popular that successor shells such as ksh and bash all adopted it. So the answer to "Which shell first introduced alias?" is csh.

## history: Remembering and Re-running Command History

- `history` shows the commands you entered earlier, with numbers.
- Command history is kept in memory and saved to the `~/.bash_history` file at logout.

```bash
history                  # full command history
history 10               # the latest 10
history -c               # clear the history in memory
!!                       # re-run the immediately preceding command
!100                     # re-run command number 100
!ls                      # re-run the most recent command starting with ls
!$                       # the last argument of the preceding command
sudo !!                  # re-run the preceding command with sudo added
```

`!$` (the last argument of the preceding command) is used especially often.

```bash
mkdir /opt/myapp/config
cd !$              # same as cd /opt/myapp/config
```

History behavior is controlled by environment variables.

| Variable | Meaning |
|------|------|
| `HISTSIZE` | Number of commands to keep in the current session's memory |
| `HISTFILE` | Path of the file to save history to (usually `~/.bash_history`) |
| `HISTFILESIZE` | Maximum number of lines to store in the history file |
| `HISTCONTROL` | Controls saving of duplicate and space-prefixed commands (`ignoredups`, `ignorespace`) |

```bash
export HISTSIZE=5000
export HISTCONTROL=ignoredups   # save consecutive duplicate commands only once
```

If you set `HISTCONTROL=ignorespace`, **commands that begin with a space are not kept in the history**. When typing a command that contains a password, putting a single space at the very start of the line keeps it out of the history file, which is good for security. `ignoreboth` applies ignoredups and ignorespace at the same time.

> ⚠️ **Trap**: `history -c` clears **only the history in memory**. The `~/.bash_history` file remains and is loaded again at the next login. To empty the file too, run `history -c && history -w` (clear memory, then overwrite the file) or empty the file directly with `> ~/.bash_history`. Also, if you use several terminals at once, the history of the last shell to exit can overwrite the file.

## Job Control: Foreground, Background, and Jobs

- When you run a command, by default it runs in the **foreground** — the shell does not accept further input until it finishes.
- Long-running tasks can be sent to the **background** so you can keep using the shell.

### & : Run in the Background from the Start

If you append `&` to the end of a command, it runs in the background and the shell returns the prompt immediately.

```bash
sleep 100 &              # run in the background
# [1] 12345  → [job number] PID is printed

tar czf backup.tar.gz /data &    # compress in the background
```

- In the output, `[1]` is the **job number** and `12345` is the **process ID (PID)**.
- The job number is valid only within the current shell, while the PID is unique across the whole system.

### Ctrl-Z, jobs, fg, bg

These are the commands for stopping a running foreground job and sending it to the background, or managing background jobs.

| Action | Behavior |
|------|------|
| `Ctrl-Z` | **Suspends (stopped)** the foreground job |
| `jobs` | Show the current shell's job list (`-l` includes PIDs) |
| `bg %1` | **Resume (running)** job 1 in the background |
| `fg %1` | Bring job 1 to the foreground |
| `kill %1` | Terminate job 1 |

```bash
# Try it yourself: stop it, then run it in the background
sleep 300              # run in the foreground (the shell is tied up)
# Press Ctrl-Z → [1]+ Stopped  sleep 300
jobs                   # [1]+ Stopped  sleep 300
bg %1                  # [1]+ sleep 300 &  (resumed in the background)
jobs                   # [1]+ Running  sleep 300 &
fg %1                  # bring it back to the foreground
```

`Ctrl-Z` **suspends (SIGSTOP) the job rather than terminating it**. A stopped job can be run again in the background with `bg` or returned to the foreground with `fg`. `Ctrl-C`, on the other hand, sends SIGINT to the job and **terminates** it. Do not mix them up — Z is suspend, C is terminate.

- `%` is the symbol that refers to a job number. `fg %1` means job 1, and `fg %%` or `fg` means the most recent job.

The `+` and `-` signs after the job number also have meaning. `+` is the **current job** — the job targeted when you use `fg` or `bg` without arguments — and `-` is the **previous job**. They are displayed as `[1]+` and `[2]-` in the `jobs` output.

## nohup and disown: Surviving a Closed Terminal

- Even a job run in the background often **dies together when the terminal (shell) is closed**.
- That is because a **SIGHUP (hangup) signal** is delivered to the jobs inside when the terminal closes.
- To run a long task safely, you have to make it ignore this signal.

### nohup: Run Ignoring SIGHUP from the Start

```bash
nohup ./long_job.sh &
# nohup: ignoring input and appending output to 'nohup.out'

nohup ./backup.sh > backup.log 2>&1 &   # output to a file of your choice
```

- `nohup` (no hangup) runs a command immune to SIGHUP.
- If you do not specify output redirection, stdout/stderr are automatically accumulated in the `nohup.out` file.

### disown: Detach an Already Running Job from the Shell

To detach a job already started with `&` from the shell after the fact, use `disown`.

```bash
./long_job.sh &
disown %1                # remove job 1 from the jobs list, immune to SIGHUP
disown -h %1             # keep the job but just ignore SIGHUP
```

| Method | When | Features |
|------|------|------|
| `nohup cmd &` | At start of execution | Records output in nohup.out, ignores SIGHUP |
| `disown %n` | Midway through execution | Detaches an already running job from the shell |
| `screen` / `tmux` | Per session | Detaches and reattaches the terminal session itself (powerful) |

The 'HUP' in SIGHUP comes from **hang up** (as in hanging up a phone). In the early days of Unix, terminals were connected through actual telephone modems, and when you hung up the phone, a signal was sent to all the connected processes to clean up — that is the origin of SIGHUP. Today the same signal is delivered when an SSH session drops, which is why jobs you were running die.

If you **forget the &** in `nohup cmd &`, the command runs in the foreground and the shell stays tied up. nohup only means "ignore SIGHUP", not "send it to the background". Background execution is strictly the job of `&`, so you need to use both together to get the "keep running in the background even if the terminal closes" behavior.

## Command Substitution: Using a Command's Output as a Value

**Command substitution** is the feature that uses the output of a command as an argument to another command or as a variable value.

```bash
# Two notations: $(...) or `...`
TODAY=$(date +%Y%m%d)
echo "Backup file: backup_$TODAY.tar.gz"
# Backup file: backup_20260605.tar.gz

# Use a command result directly as another command's argument
echo "Kernel version: $(uname -r)"
kill $(pgrep -f myapp)           # terminate all myapp processes at once
files=$(ls *.log)                # put the list of log files in a variable
cd $(dirname /opt/app/conf/x.ini)  # move to /opt/app/conf
```

Command substitution takes **only the output as the value**. It is the text printed to stdout that gets substituted, not the command's exit status (success/failure). The trailing newline is removed automatically. That is why you can get a count as a clean number with `count=$(ls | wc -l)`.

For arithmetic, use the similar-looking `$(( ... ))`. You need to distinguish it from command substitution `$( )`.

```bash
echo $((3 + 4))          # 7   (arithmetic expansion)
echo $(expr 3 + 4)       # 7   (substituting the external expr command — the old way)
n=5; echo $((n * 2))     # 10
```

`$( )` (command substitution) and `$(( ))` (arithmetic expansion) differ only in the number of parentheses but have completely different meanings. The single one means "run the command and substitute its output"; the double one means "calculate the arithmetic expression and substitute the result". In the old days arithmetic was also done by substituting the `expr` command (`$(expr ...)`), but it launches an external process and is therefore slow. The shell built-in `$(( ))` is faster and standard.

Tomorrow we move on to shell scripting basics, which automate all of this.

## 📖 Glossary

- **alias** : A nickname attached to a command. It is expanded only when it is the **first word** of the command line.
- **`\command`** : Notation that ignores the alias and runs the original command. `command cmd` and the absolute path have the same effect.
- **`~/.bash_history`** : The file where command history is saved at logout.
- **`!!` / `!n` / `!$`** : History expansions that recall the previous command / command number n / the last argument of the previous command.
- **HISTCONTROL** : Rules for saving history. `ignoredups` (exclude duplicates), `ignorespace` (exclude commands starting with a space).
- **Foreground / background** : Execution where the shell waits until it finishes, and execution that returns the prompt right away (`&`).
- **Job number** : A number like `[1]` that is meaningful only within the current shell. Different from the system-wide PID.
- **`Ctrl-Z` vs `Ctrl-C`** : Suspend (SIGSTOP) and terminate (SIGINT). Z is stop, C is end.
- **`jobs` / `fg` / `bg`** : Show the job list, pull a job to the foreground, and resume it in the background.
- **SIGHUP** : The signal sent to the processes inside a terminal when it closes. The name comes from "hang up" a phone.
- **nohup** : A command that runs ignoring SIGHUP. To send it to the background, you must use `&` together.
- **disown** : A command that detaches an already running job from the shell's job list and protects it from SIGHUP.
- **Command substitution `$( )` vs arithmetic expansion `$(( ))`** : Using a command's output as a value versus calculating an arithmetic expression and using the result.

## 📝 Practice Questions

**Question 1.** Which key combination suspends a job running in the foreground?

A) Ctrl-C
B) Ctrl-Z
C) Ctrl-D
D) Ctrl-\

**Answer: B**
Explanation: `Ctrl-Z` sends SIGSTOP to the running foreground job and puts it in the stopped state. Afterward you can resume it in the background with `bg` or bring it back to the foreground with `fg`. `Ctrl-C` terminates the job with SIGINT, `Ctrl-D` sends EOF (end of input), and `Ctrl-\` terminates with SIGQUIT and leaves a core dump. The key is distinguishing suspend from terminate.

---

**Question 2.** Which command runs a job ignoring SIGHUP so that the background job does not end even if the terminal is closed?

A) `nohup ./job.sh &`
B) `bg ./job.sh`
C) `disown ./job.sh`
D) `fg ./job.sh &`

**Answer: A**
Explanation: `nohup` (no hangup) runs a command immune to the SIGHUP signal, so the job survives even if the terminal closes. A trailing `&` is attached as well for background execution. `bg` and `fg` are commands that switch the state of an existing job and do not run new commands. `disown` is used to detach an already running job and takes a job number (%n), not a command argument.

---

**Question 3.** With `alias rm='rm -i'` set, which of the following is NOT a way to run the original rm without confirmation?

A) `\rm file`
B) `command rm file`
C) `/bin/rm file`
D) `alias rm file`

**Answer: D**
Explanation: `alias rm file` is not a command for bypassing an alias; it is a misuse of the alias registration syntax, and the intended deletion does not happen. To bypass an alias, put a backslash in front of the command (`\rm`), use the `command` builtin (`command rm`), or call it directly with the absolute path (`/bin/rm`). All three of these are standard ways to skip alias expansion and run the original command.

---

**Question 4.** Which history notation reuses the **last argument** of the command just executed?

A) `!!`
B) `!$`
C) `!^`
D) `!*`

**Answer: B**
Explanation: `!$` refers to the last argument of the previous command. For example, typing `cd !$` after `mkdir /opt/app` runs `cd /opt/app`. `!!` re-runs the entire previous command, `!^` refers to the first argument of the previous command, and `!*` refers to all the arguments of the previous command. `!$` is a notation used very often in practice because it saves you from retyping long paths.

---

**Question 5.** Which of the following is command substitution?

A) `echo $((3 + 4))`
B) `echo $(date)`
C) `echo ${NAME}`
D) `echo $[3 + 4]`

**Answer: B**
Explanation: `$(date)` is command substitution, which runs the date command and substitutes its output. `$(( ))` (double parentheses) is arithmetic expansion that calculates an expression, `${NAME}` is variable expansion, and `$[ ]` is the old (deprecated) notation for arithmetic expansion. Command substitution takes the command's stdout as the value and does the same job as the backticks `` `date` ``. The key is the distinction: one pair of parentheses (`$()`) is a command, two pairs (`$(())`) is arithmetic.

---

**Question 6.** In the output of the `jobs` command, what does the `+` sign after the job number mean?

A) A job running in the background
B) A job that is suspended
C) The current job (the target of fg/bg without arguments)
D) The job that started first

**Answer: C**
Explanation: In the `jobs` output, `+` marks the **current job**, which is the job targeted when you run `fg` or `bg` without a job number. `-` indicates the previous job. The execution state (Running/Stopped) is shown in separate status text, not by `+`/`-`. It is also unrelated to the order in which jobs started. These symbols determine the default target of job control commands without arguments.

---

**Question 7.** What should you do to keep using an alias registered on the command line even after logout?

A) Save it with `alias -p`
B) Add the alias definition to `~/.bashrc`
C) Register it in `/etc/passwd`
D) Turn the alias into an environment variable with `export`

**Answer: B**
Explanation: An alias registered directly on the command line is valid only in the current shell and disappears at logout. To use it permanently, you have to write the alias definition in `~/.bashrc`. Since .bashrc is read every time a new shell starts, the alias is registered automatically each time. `alias -p` only prints the registered aliases and does not save them, `/etc/passwd` is the account information file and is unrelated, and an alias is not a variable, so it cannot be inherited via export.

---
