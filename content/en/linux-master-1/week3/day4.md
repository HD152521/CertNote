# Day 4 - Shell Scripts: The First Step in Weaving Commands into Code

## 📌 Key Takeaways

- The **shebang (`#!/bin/bash`)** is valid only on line 1, column 1 of the file. `./script.sh` runs in a child shell, while `source` runs in the current shell.
- Positional parameters — `$0` (name) `$1~$9` (arguments) `$#` (count) `"$@"` (each separated) `$?` (exit status, **0=success**).
- Conditions are evaluated with `test` = `[ ]`. **Use `=` for strings and `-eq` for numbers**, and **spaces are required** around the brackets and operators.
- Branching uses `if ... fi` and `case ... esac` (each block ends with `;;`, and `*)` is the default). Loops use `for`/`while`/`until`.
- A function's `return` gives **only an exit status of 0~255**. Pass data with `echo` + `$(function)`, and isolate internal variables with `local`.

## shebang: Who Will Interpret This File

If you do daily backups and log cleanup by hand every time, people get tired and make mistakes. A shell script is an interpreted program that the shell reads and executes one line at a time, with no separate compilation. This area is **the center of the Level 1 practical exam**.

- The line at the **very top** of a script file that begins with `#!` is called the **shebang** (also hashbang).
- It tells the kernel which interpreter to use to run this file.
- Without a shebang, the file runs in the current shell, and the syntax may break in a different shell. It is best to always state it explicitly.

```bash
#!/bin/bash
# The line above is the shebang — it means this script should be run with /bin/bash

echo "Hello, Shell Script"
```

```bash
#!/bin/bash          # run with bash
#!/bin/sh            # run with POSIX sh
#!/usr/bin/env python3   # find python3 in PATH and run it (more portable)
```

There are three ways to run a script.

```bash
chmod +x script.sh   # grant execute permission
./script.sh          # ① run directly after granting permission (uses the shebang)

bash script.sh       # ② pass it to bash as an argument (no permission needed)
source script.sh     # ③ run in the current shell (variables remain in the current shell)
```

`./script.sh` (direct execution) and `source script.sh` (sourcing) are decisively different. Direct execution launches a **new child shell** and runs inside it, so variables changed inside the script disappear when it ends. `source`, on the other hand, runs **inside the current shell**, so the variables and functions the script defines remain as they are. That is why you use source when applying environment setup scripts (the same principle as sourcing .bashrc on Day 1).

> ⚠️ **Trap**: The shebang's `#!` must come at **the very first line of the file, at the very start** (line 1, column 1). If there is a blank line or space before it, it is treated as an ordinary comment and becomes invalid. Also, the interpreter path after `#!` must be an absolute path.

## Variables and Positional Parameters

Variables in a script are the same as the shell variables you learned on Day 1. However, when assigning, there must be **no spaces** on either side of `=`.

```bash
#!/bin/bash
NAME="linux"            # correct
COUNT=10
# NAME = "linux"        # wrong! with spaces it is interpreted as a command named NAME

echo "$NAME version $COUNT"
```

When you pass **arguments** to a script, they are received as **positional parameters**. This is the key to making scripts flexible.

| Variable | Meaning |
|------|------|
| `$0` | Script name |
| `$1` ~ `$9` | The first ~ ninth arguments |
| `${10}` | The tenth and later arguments (braces required) |
| `$#` | The **number** of arguments passed |
| `$*` | All arguments as **one string** |
| `$@` | All arguments, **each separated** |
| `$?` | The **exit status** of the previous command (0=success) |
| `$$` | The **PID** of the current script |
| `$!` | The PID of the last background job |

```bash
#!/bin/bash
echo "Script name: $0"
echo "First argument: $1, second argument: $2"
echo "Number of arguments: $#"
echo "All arguments: $@"

# Run: ./test.sh apple banana
# First argument: apple, second argument: banana / Number of arguments: 2
```

Without quotes, `$*` and `$@` seem to behave the same, but **they differ decisively when wrapped in double quotes**. `"$*"` becomes **one string** with all arguments joined by spaces ("apple banana"), while `"$@"` keeps each argument as an **independent word** ("apple" "banana"). When passing arguments on to another command as they are, you should almost always use `"$@"` so that arguments containing spaces don't break.

`$?` (exit status) is the core of a script's flow control. Every command leaves an exit status of 0~255 when it finishes, where **0 is success and anything other than 0 is failure**. Conditionals branch by looking at this exit status. You can check the success or failure of the previous command immediately, as in `grep "root" /etc/passwd; echo $?`.

## test and [ ]: Tools for Evaluating Conditions

To decide "does the file exist", "are the numbers equal", or "is the string empty" in a conditional, use the `test` command or its alias `[ ]`. The two are exactly the same.

```bash
test -f /etc/passwd      # exit status 0 if the file exists
[ -f /etc/passwd ]       # exactly the same as above
echo $?                  # 0 (true) or 1 (false)
```

### File Tests

| Operator | Condition for true |
|--------|---------------|
| `-e file` | The file exists (exists) |
| `-f file` | It is a regular file |
| `-d file` | It is a directory |
| `-r` / `-w` / `-x` | Has read/write/execute permission |
| `-s file` | Size is greater than 0 (not empty) |
| `-L file` | It is a symbolic link |

### String Comparison

| Operator | Condition for true |
|--------|---------------|
| `-z str` | String length is 0 (empty) |
| `-n str` | String length is not 0 |
| `str1 = str2` | The two strings are equal |
| `str1 != str2` | The two strings differ |

### Numeric Comparison

| Operator | Meaning | Explanation |
|--------|------|------|
| `-eq` | equal | Equal |
| `-ne` | not equal | Not equal |
| `-gt` | greater than | Greater than |
| `-ge` | greater or equal | Greater than or equal |
| `-lt` | less than | Less than |
| `-le` | less or equal | Less than or equal |

> ⚠️ **Trap**: Use **`=` and `!=` for string comparison, and `-eq` and `-ne` for numeric comparison**. Do not mix them. `[ "$a" = "$b" ]` compares as strings, and `[ "$a" -eq "$b" ]` compares as numbers. One more thing — inside `[ ]` there must **always be spaces on both sides of the brackets and of every operator**. `[$a=$b]` and `[ $a=$b ]` are syntax errors. Also, it is safe to wrap variables in double quotes like `"$a"` so the syntax does not break when the value is empty.

bash also has `[[ ]]` (double brackets), which is more powerful than `[ ]`. `[[ ]]` is a bash-specific extension; inside it you can use `&&`, `||`, pattern matching (`==` with wildcards), and regular expressions (`=~`), and word splitting and globbing of variables are suppressed automatically, making it safer. However, if POSIX sh compatibility is required, you must use `[ ]`. For Level 1, it is good to know both notations.

## Conditionals: if and case

### if-elif-else

```bash
#!/bin/bash
score=$1

if [ "$score" -ge 90 ]; then
    echo "Grade A"
elif [ "$score" -ge 80 ]; then
    echo "Grade B"
elif [ "$score" -ge 70 ]; then
    echo "Grade C"
else
    echo "Retake"
fi
```

- The skeleton of the syntax is `if condition; then ... elif condition; then ... else ... fi`.
- `fi` is "if" written backward and marks the end of the block (in the same way, case is closed with `esac`).

```bash
# A practical example branching on whether a file exists
if [ -f /etc/nginx/nginx.conf ]; then
    echo "The configuration file exists"
else
    echo "The configuration file does not exist" >&2   # errors go to stderr
    exit 1
fi
```

if actually does not accept only `[ ]`; it accepts **any command** and branches on its **exit status**. You can use a command directly as the condition, as in `if grep -q "root" /etc/passwd; then ...`. If the exit status is 0 it goes to then, otherwise to else. This is possible because `[ ]` itself is a command called test.

### case: Branching on Several Values by Pattern

When a value is one of several cases, `case` is cleaner than stringing together a long if-elif.

```bash
#!/bin/bash
case "$1" in
    start)
        echo "Starting service"
        ;;
    stop)
        echo "Stopping service"
        ;;
    restart|reload)         # match several patterns with |
        echo "Restarting service"
        ;;
    *)                      # every other case (default)
        echo "Usage: $0 {start|stop|restart}"
        exit 1
        ;;
esac
```

- Each pattern block ends with `;;`, and `*)` is the default that catches all remaining cases.
- Case patterns can use wildcards (`*`, `?`, `[ ]`).

Linux init scripts (the service control scripts in `/etc/init.d/`) are almost all written with the structure `case "$1" in start|stop|restart` as above. That is why commands like `service nginx start` and `/etc/init.d/nginx restart` work. The case statement is the standard pattern for building such a "command dispatcher".

## Loops: for and while

### for: Iterate over a List

```bash
#!/bin/bash
# Iterate over a list
for fruit in apple banana cherry; do
    echo "Fruit: $fruit"
done

# Iterate over files with a wildcard
for file in *.log; do
    echo "Processing: $file"
    gzip "$file"
done

# Iterate over a sequence
for i in $(seq 1 5); do
    echo "Iteration $i"
done

# C style (bash extension)
for ((i=1; i<=5; i++)); do
    echo "Count $i"
done
```

### while: Repeat While the Condition Is True

```bash
#!/bin/bash
count=1
while [ "$count" -le 5 ]; do
    echo "Round: $count"
    count=$((count + 1))    # increment with arithmetic expansion
done

# Read a file line by line (a very frequently used idiom)
while read line; do
    echo "Line: $line"
done < /etc/hosts
```

`until` is the opposite of while: it repeats **while the condition is false** and stops when it becomes true.

```bash
count=1
until [ "$count" -gt 5 ]; do    # until count becomes greater than 5
    echo "$count"
    count=$((count + 1))
done
```

Also learn the loop control keywords.

| Keyword | Behavior |
|--------|------|
| `break` | Exit the loop immediately |
| `continue` | Skip the current iteration and go to the next |
| `exit n` | Terminate the entire script (exit status n) |

In `while read line; do ...; done < file`, it is easy to get confused about the position where the input is connected with `<` after `done`. Also, if you feed the while through a pipe, as in `cat file | while read line`, the right side of the pipe runs in a **subshell**, so variables changed inside the loop are not reflected outside the loop (subshell variable isolation). So when reading a file, it is safer to use the `done < file` redirection instead of a pipe.

## Functions: Bundling Code into Reusable Units

Repeated blocks of code are bundled into **functions** for reuse.

```bash
#!/bin/bash
# Function definition (two syntaxes)
greet() {
    echo "Hello, $1"     # $1 is the function's first argument
}

function backup() {            # function keyword style (bash)
    cp "$1" "$1.bak"
    return 0                    # return an exit status
}

# Call the functions — arguments separated by spaces, no parentheses
greet "admin"
backup /etc/hosts
echo "Backup result code: $?"        # check the function's return value with $?
```

- A function's arguments are also received as `$1`, `$2`, `$#`, just like a script's.
- `$1` inside a function is not the script's `$1`, but **the argument passed to the function**.

When a shell function gives back a value with `return`, it can return **only an exit status of 0~255** (it cannot return ordinary data). To return a string or a calculation result, print it with `echo` inside the function and capture it on the calling side with command substitution: `result=$(my_func)`. Remember the division of roles: `return` is for success/failure signals, and `echo`+`$()` is for passing data.

Variables declared inside a function are also **global** by default, so they affect the whole script. To make a local variable valid only inside the function, add the `local` keyword, as in `local var=value`. To prevent bugs where a function unintentionally overwrites a global variable in a large script, the habit of using `local` for variables inside functions is important.

The key to preparing for the practical exam is to write and run scripts yourself and run into errors. Tomorrow we do a comprehensive review of all of Week 3.

## 📖 Glossary

- **shebang (`#!`)** : The first line that tells which interpreter should run this file. It is invalid unless on line 1, column 1.
- **Positional parameters** : Variables like `$1`, `$2`... that receive the arguments passed to a script or function.
- **`$#` / `$@` / `$*`** : Number of arguments / arguments each separated / arguments as one string. When passing them on, `"$@"` is safe.
- **Exit status `$?`** : The 0~255 success/failure signal left by the previous command. **0 is success**, and conditionals branch on it.
- **`test` / `[ ]`** : A command that evaluates a condition and answers with an exit status. They are the same thing, and spaces on both sides are required.
- **`[[ ]]`** : The bash-only enhanced conditional expression. It allows `&&`, `||`, pattern matching, and regex (`=~`), and is safer.
- **`fi` / `esac`** : Keywords that close if and case blocks. They are if and case written backward.
- **`;;`** : The marker that ends each pattern block in a case. `*)` is the default that catches everything else.
- **`until`** : The opposite of while. It runs **while the condition is false** and stops when it becomes true.
- **`break` / `continue`** : Exit the loop immediately / skip only this iteration.
- **Subshell isolation** : The phenomenon where the right side of a pipe runs in a separate shell so variable changes inside it do not remain outside.
- **`local`** : The keyword that declares a local variable valid only inside a function. Without it, the variable becomes global.

## 📝 Practice Questions

**Question 1.** What does `#!/bin/bash` on the first line of a shell script do?

A) Specifies the title of the script
B) Specifies the interpreter to run this script
C) Comments out the bash command
D) Grants execute permission to the script

**Answer: B**
Explanation: The first line that begins with `#!` (the shebang) tells the kernel which interpreter to use to run this script file. `#!/bin/bash` means run it with bash. The shebang is effective only if it is at the very start of the very first line of the file. Granting execute permission is the job of `chmod +x` and is separate from the shebang. On an ordinary line `#` is a comment, but `#!` on the first line is specially interpreted as an interpreter specification.

---

**Question 2.** Which positional parameter holds the **number** of arguments passed to the script?

A) `$0`
B) `$#`
C) `$@`
D) `$?`

**Answer: B**
Explanation: `$#` holds the number of arguments passed to a script or function. `$0` is the script name, `$@` is the list with all arguments separated, and `$?` is the exit status of the previous command. For example, if you run `./s.sh a b c`, `$#` is 3. It is often used in patterns like `if [ $# -lt 2 ]; then ...` that validate the argument count and show usage.

---

**Question 3.** Which operator in the test command compares whether **two numbers are equal**?

A) `=`
B) `-eq`
C) `==`
D) `-is`

**Answer: B**
Explanation: For numeric comparison, "equal" uses `-eq` (equal). `=` (and bash's `==`) is for string comparison. The numeric comparison operators are `-eq`, `-ne`, `-gt`, `-ge`, `-lt`, and `-le`, while string comparison uses `=`, `!=`, `-z`, and `-n`. Mixing them up causes a comparison different from what you intended. The operator `-is` does not exist. You must be clear on the distinction: `-eq` for numbers, `=` for strings.

---

**Question 4.** In the following case statement, which pattern handles all remaining cases (default)?

```bash
case "$1" in
    start) echo "Start";;
    stop)  echo "Stop";;
    ???)   echo "Other";;
esac
```

A) `default)`
B) `else)`
C) `*)`
D) `???)`

**Answer: C**
Explanation: In a case statement, the default pattern that handles every case matching no other pattern is `*)`. This is because the wildcard `*` matches "any string at all". `default` and `else` are keywords that do not exist in case syntax. The `???)` in the code above matches only "exactly three characters", so it is not a true default. Usually `*)` is placed last to show usage for invalid input and exit with `exit 1`.

---

**Question 5.** Which variable holds the success status (exit status) of the previous command, and which value means "success"?

A) `$?` — 0 is success
B) `$?` — 1 is success
C) `$!` — 0 is success
D) `$$` — 1 is success

**Answer: A**
Explanation: `$?` holds the exit status of the most recently executed command, where **0 means success** and a non-zero value (1~255) means failure. This is a Unix convention in which 0 means "no error". `$!` is the PID of the last background job and `$$` is the PID of the current shell/script. The if conditional branches on this exit status, so knowing exactly what `$?` means is the starting point of flow control.

---

**Question 6.** Which is the correct cause of a syntax error when using `[ ]` (test)?

A) `[ $a -eq $b ]` — because there are spaces on both sides of the operator
B) `[$a -eq $b]` — because there are no spaces inside the brackets
C) `[ $a = $b ]` — because `=` was used for string comparison
D) `[ -f /etc/passwd ]` — because a file test operator was used

**Answer: B**
Explanation: `[ ]` is actually a command called `test`, so there must be spaces after the opening bracket, before the closing bracket, and on both sides of every operator. If you attach them to the brackets, as in `[$a -eq $b]`, the shell treats `[$a` as a single command and an error occurs. A is correct syntax (the spaces are required), C is also the correct use of `=` for string comparison, and D is also a normal file test. Spaces are an absolute rule of test syntax.

---

**Question 7.** What is the correct way to pass a calculated result string from a shell function to the caller?

A) Return it with `return "result string"` and receive it with `$?`
B) `echo result` inside the function and receive it with `result=$(function_name)`
C) `exit result` inside the function and read it on the next line
D) Without relying on a global variable, print it with `print result`

**Answer: B**
Explanation: A shell function's `return` can only return an exit status of 0~255, so it cannot give back a string or calculation result. To pass data, print it with `echo` inside the function and, on the calling side, capture that output in a variable with command substitution `result=$(function_name)`. The key is the division of roles: `return` is for success/failure signals, and `echo`+`$()` is for passing data. `exit` terminates the entire script, and `print` is not bash's standard output command.

---
