# Day 2 - Daemons and the Process Life Cycle: From fork and exec to Zombies and Orphans

## 📌 Key Takeaways

- A **daemon** is a process that provides a service in the background without being tied to a terminal. Its name usually **ends in 'd'**, and there are two modes: **standalone**, which is always running, and **super-daemon (xinetd)**, which is launched on request.
- Job control: `&` (background) · `Ctrl+Z` (stop) · `jobs` · `bg` · `fg` · `nohup` (survive logout).
- A process is born in two steps: **fork (copy, new PID) → exec (replace, PID kept)**. Being able to slip redirection and pipes in between the two is the core of the Unix design.
- **Zombie = dead child + parent that doesn't wait.** It occupies a PID slot in Z/defunct state, `kill -9` has no effect on it, and it disappears only when you **terminate or restart the parent**.
- **Orphan = living child + dead parent.** It is adopted by PID 1 immediately, its PPID changes to 1, and it is reaped normally, so it is **harmless**.

## What Is a Daemon?

- **Daemon**: A process that provides a specific service in the background without talking to the user directly.
- Typical examples: web server (httpd), SSH access (sshd), scheduled jobs (crond), mail (postfix).
- By convention the name ends in **'d'**, so if it ends in d like sshd, httpd, or crond, it is almost certainly a daemon.
- The characteristics of a daemon are as follows.

| Characteristic | Description |
|------|------|
| No controlling terminal | Not tied to any terminal, so it keeps running after logout |
| Resident in the background | Starts at boot and stays in memory until shutdown |
| Parent is usually PID 1 | Managed directly by systemd/init, or adopted by it |
| 'd' in the name | sshd, httpd, crond, rsyslogd, etc. |

- There are two main ways a daemon provides its service.

| Mode | Behavior | Examples |
|------|------|-----|
| Standalone | The daemon is always running and handles requests itself | httpd, sshd |
| Super-daemon | xinetd/inetd waits and launches a child daemon on request | old telnet, ftp |

The standalone mode responds quickly but always occupies memory. The super-daemon (xinetd) mode saves memory normally but responds slowly because it launches a new process for every request. The trade-off that frequently used services favor standalone while rarely used services favor super-daemon shows up on exams.

The word 'daemon' comes from the "spirit that helps invisibly" in Greek mythology. It originated at MIT's Project MAC, where background helper processes were called this. Its spelling differs from demon, and it carries the meaning of working quietly out of the user's sight.

## Foreground and Background

- **Foreground**: The state where you just run a command. The shell waits until the command finishes, so you cannot type other commands.
- **Background**: The state where you put **`&`** at the end of a command. The shell gives you the prompt back immediately, so you can keep working.

```bash
sleep 100          # foreground: the prompt is stuck for 100 seconds
sleep 100 &        # background: prompt returns at once, prints [1] 12345
```

- The commands that move a running job between foreground and background are the key.

| Command/Key | Action |
|---------|------|
| `&` (after a command) | Run in the background from the start |
| `Ctrl+Z` | **Suspend** (Stopped) the foreground job |
| `jobs` | Show the current shell's job list and job numbers |
| `bg %1` | **Resume** stopped job 1 in the background |
| `fg %1` | Bring job 1 to the foreground |
| `nohup ... &` | Run so that it survives logout |

```bash
sleep 200            # running...
# (press Ctrl+Z) → [1]+ Stopped  sleep 200
jobs                 # [1]+ Stopped sleep 200
bg %1                # resume in the background → [1]+ sleep 200 &
fg %1                # back to the foreground
nohup ./long.sh &    # keeps running after logout, output saved to nohup.out
```

> ⚠️ **Trap**: `Ctrl+Z` is not termination but a **suspend (SIGSTOP, state T)**. Termination is `Ctrl+C` (SIGINT). A stopped job must be revived with `bg`/`fg`, and if you just leave it and close the shell it may disappear. Also, with `&` alone the job may die when the shell exits because it receives SIGHUP, so to keep it alive after logout you must use `nohup` together with it.

**Try it yourself**: Run `sleep 300`, stop it with `Ctrl+Z`, and check with `jobs` that the state is `Stopped`. Resume it with `bg %1` and the state changes to `Running`. Bring it back with `fg %1` and terminate it with `Ctrl+C`, and it disappears completely. That is one full cycle of job control.

## fork and exec — How a Process Is Born

- Running a new program on Linux takes two steps: **fork → exec**. This is the core model of the Unix design.

1. **fork()**: The parent **copies** itself almost exactly. A child with a new PID is created, and the child's PPID becomes the parent's PID. Right after the copy, the parent and child run the same code.
2. **exec()**: The copied child **replaces its entire memory contents with a different program**. The PID is kept, but the program being run changes completely.

```
[shell process] --fork()--> [child (shell copy)] --exec("/bin/ls")--> [ls process]
   PID 1000                    PID 1500                PID 1500 (kept)
                               PPID 1000               PPID 1000
```

- Example: when you type `ls` in the shell, the shell forks itself to make a child, that child becomes `ls` through exec, and it exits when it finishes running.
- The parent shell waits for the child to finish with `wait()` and then gives the prompt back.

| System call | Role | PID change |
|------------|------|----------|
| fork() | Copy the process (create a child) | New PID created |
| exec() | Replace the current process with another program | PID kept |
| wait() | Parent waits for the child to terminate and reaps it | — |
| exit() | Terminate the process (return an exit code) | — |

exec **does not create a new process**. It leaves the current process's shell (PID) as is and swaps out only the contents (the executing code). That is why, if you type `exec ls` directly in a shell, the shell itself transforms into ls, and when ls finishes the shell terminates as well. Separating fork (copy) from exec (replace) is the elegance of Unix.

Thanks to the fork-exec separation, the shell can set up I/O redirection (`>`, `<`) or pipes (`|`) right after forking the child and before exec. If "copy and replace" had been bundled into one step, such flexible rearrangement of I/O would have been impossible. This design is the foundation of the Unix pipeline philosophy.

## Zombie Processes — Corpses Nobody Has Collected

- When a child terminates with `exit()`, the kernel **keeps its exit code for a while so that the parent can pick it up**.
- When the parent calls `wait()` and collects the exit code, the child's traces vanish completely.
- If the parent doesn't call `wait()`, the child is already dead but its exit code remains, leaving a trace in the process table → this is a **zombie (defunct) process**.

| Item | Zombie process |
|------|--------------|
| State (STAT) | Z (or shown as `<defunct>`) |
| Memory | Almost none used (only the shell) |
| Cause | The parent doesn't collect the exit code with wait() |
| Danger | Occupies a PID slot — PIDs can be exhausted if many accumulate |
| Fix | Terminate/restart the parent process → the zombie is adopted by PID 1 and cleaned up |

```bash
ps aux | grep -w Z         # find processes in zombie state
ps -ef | grep defunct      # check zombies shown as defunct
```

- A zombie **cannot be killed with `kill -9`** (it is already dead).
- To get rid of it, terminate or restart its **parent process**.
- When the parent disappears, the zombie is adopted by PID 1 (systemd/init), and PID 1 immediately reaps and cleans it up with `wait()`.

> ⚠️ **Trap**: A zombie process uses almost no memory, but it occupies a **PID slot**. If a badly written program keeps churning out zombies, PIDs run out and the system can no longer create new processes. Trying to kill a zombie with `kill -9 zombiePID` is pointless — the target is the **parent**.

## Orphan Processes — Children That Lost Their Parent

- An **orphan process** is the opposite situation from a zombie. It's when the child is still alive and working but the **parent has terminated first**.
- Remember them by flipping the description and you won't mix them up: a zombie is "the child is dead but the parent doesn't collect it", an orphan is "the parent is dead but the child is alive".
- An orphan that lost its parent is immediately **adopted by PID 1 (systemd/init)** and its PPID changes to 1.
- Since PID 1 takes over the parent's role, when the orphan later terminates it is cleanly reaped with `wait()` → it is **not harmful to the system.**

| Category | Zombie | Orphan |
|------|--------------|--------------|
| Child state | Dead (terminated) | Alive (running) |
| Parent state | Alive but not calling wait | Terminated first |
| PPID | Original parent | Changed to 1 (adopted) |
| Danger | Occupies a PID, a problem if it accumulates | Harmless (PID 1 reaps it normally) |
| Fix | Terminate/restart the parent | Resolved by automatic adoption |

The one-line key contrast — **a zombie is a dead child + a parent that doesn't collect it (dangerous), an orphan is a living child + a dead parent (harmless, adopted by PID 1)**. Answer choices that swap the two are used as traps. Also memorize "Z state = zombie, shown as defunct".

**Try it yourself**: Run `ps -ef` and look at the processes whose PPID (third column) is `1`. Daemons started at boot and adopted orphans all have PID 1 as their parent. You can confirm from the actual list how PID 1 acts as the guardian of every lost child.

Without the orphan adoption mechanism, a process run in the background like `nohup ./job &` would be left without anyone to reap it the moment the shell (its parent) exits, and would eventually become a zombie. Thanks to adoption by PID 1, we can safely run background jobs even after logging out.

## 📖 Glossary

- **Daemon** : A process that stays resident in the background providing a service without being tied to a terminal. Its name usually ends in 'd'.
- **Standalone mode** : The daemon is always running and handles requests itself. Fast but always consumes memory (httpd, sshd).
- **Super-daemon (xinetd)** : Waits normally and launches a child daemon when a request arrives. Saves memory but responds slowly.
- **Foreground / background** : Execution where the shell waits until it finishes / execution sent to the back with `&` so you get the prompt back.
- **Job** : A unit of execution managed by the shell. List them with `jobs` and refer to them by job number such as `%1`.
- **nohup** : "no hang up". A command that makes a process ignore SIGHUP so it stays alive after logout. Output goes to nohup.out.
- **fork()** : A system call that copies itself to create a child with a new PID.
- **exec()** : A system call that does not create a new process but swaps only the current process's executing code for another program. The PID stays the same.
- **wait()** : A system call by which the parent collects the child's exit code and erases its traces. If this isn't done, a zombie appears.
- **Zombie (defunct)** : A process whose child is dead but whose parent hasn't reaped it, so it only occupies a PID slot in Z state.
- **Orphan** : A still-living child process that was adopted by PID 1 because its parent died first.

## 📝 Practice Questions

**Question 1.** Which of the following statements about daemon processes is NOT correct?

A) It is not tied to a controlling terminal, so it keeps running after logout

B) Its name usually ends in 'd' (sshd, httpd, crond, etc.)

C) It must always run in the foreground, talking to the user

D) It often starts at boot and stays resident in the background until shutdown

**Answer: C**

Explanation: A daemon is a process that provides a service in the background without talking to the user directly, so C is wrong. A, B, and D are all correct characteristics of a daemon. The 'd' suffix (sshd, crond), independence from the terminal, and background residency are the three main characteristics of a daemon.

---

**Question 2.** What is the result of pressing `Ctrl+Z` on a job running in the foreground?

A) The job is terminated immediately with SIGINT

B) The job is suspended (Stopped, state T) and can be seen with jobs

C) The job keeps running in the background

D) The job's nice value is reset to 0

**Answer: B**

Explanation: `Ctrl+Z` sends SIGSTOP to suspend the foreground job (state T); you check the list with `jobs` and revive it with `bg`/`fg`. A is the behavior of `Ctrl+C` (SIGINT). For it to "keep running" in the background as in C, you must additionally use `bg` after stopping it. D has nothing to do with signals.

---

**Question 3.** Which of the following statements about the fork-exec model for running a new program is correct?

A) fork() replaces the current process with another program and changes the PID

B) exec() creates a new process and assigns it a new PID

C) fork() copies the process to create a child with a new PID, and exec() keeps the PID and replaces only the program

D) fork() and exec() are always handled together in a single system call

**Answer: C**

Explanation: fork() copies the process to create a child with a new PID, and exec() replaces only the executing code of that child with another program while keeping its PID. A and B swap the roles of fork and exec. D misses the core of the Unix design: the two are separate, so redirection and pipes can be set up between them.

---

**Question 4.** What is the most accurate cause of a zombie process?

A) The child has terminated but the parent has not collected its exit code with wait()

B) The parent terminated first and the child was adopted by PID 1

C) The process set its nice value too high

D) The process ignored SIGKILL

**Answer: A**

Explanation: A zombie is what remains in the process table in Z state when a child terminates with exit() and the parent does not collect the exit code with wait(). B is the situation of an orphan. C and D have nothing to do with zombies. A zombie is cleaned up by terminating/restarting its parent, after which it is adopted by PID 1.

---

**Question 5.** Which of the following is correct about orphan processes?

A) The child has terminated but the parent has not reaped it, so it remains in Z state

B) The parent terminated first, the living child's PPID changes to 1, and it is harmless

C) It occupies excessive memory and paralyzes the system

D) It can only be removed with kill -9

**Answer: B**

Explanation: An orphan is a child that is still alive after its parent terminated first; it is adopted immediately by PID 1 (systemd/init), its PPID changes to 1, and it is reaped normally when it terminates (harmless). A describes a zombie. C and D are not characteristics of an orphan. Tell them apart with "zombie = dead child, orphan = living child".

---

**Question 6.** What is the most correct way to remove a zombie process?

A) Send `kill -9` to the zombie's PID

B) Lower the zombie PID's nice value to 19

C) Terminate or restart the parent process that created the zombie

D) Rebooting the entire system is the only way

**Answer: C**

Explanation: A zombie is already dead, so `kill -9` has no effect (A is wrong); you must terminate/restart its parent process. When the parent disappears, the zombie is adopted by PID 1 and reaped immediately. B is irrelevant, and D is excessive since only the parent needs to be dealt with.

---

**Question 7.** Which command keeps a background job running after logout without being killed by SIGHUP?

A) `./job.sh &`

B) `nohup ./job.sh &`

C) `Ctrl+Z` then `bg`

D) `kill -HUP ./job.sh`

**Answer: B**

Explanation: `nohup` (no hang up) makes the process ignore SIGHUP so it survives the shell exit (logout), and its output is saved to nohup.out. A (`&` alone) may die from receiving SIGHUP when the shell exits. C is merely job control within the same session, and D is a command that actually sends HUP, the opposite of the intent.

---
