# Day 3 - Shell Script Writing Tasks: Automate Real Work with Conditions, Loops, and Functions

## 📌 Key Takeaways

- Writing tasks test **syntactic accuracy**. A single misplaced space is a wrong answer.
- **No spaces are allowed on either side of the `=`** in a variable assignment. Conversely, in `if [ condition ]` there **must be spaces inside the square brackets**.
- Comparison operators split into **numeric `-eq`/`-gt`/`-lt`**, **string `=`/`!=`/`-z`/`-n`**, and **file `-e`/`-f`/`-d`**.
- Closing keywords: `if`→`fi`, `for`/`while`→`done`, `case`→**`esac`**. Functions are called **without parentheses**, as `funcname args`.
- `$(...)` is command substitution, `$((...))` is arithmetic, and `$?` is the exit status of the previous command (0 = success).
- Memorize the three practical patterns whole: backup (`tar czf` + `$(date)`), reading a file (`while read ...; done < file`), and frequency counting (`sort | uniq -c | sort -rn`).

## Script Skeleton: Shebang, Variables, Running

```bash
#!/bin/bash                 # shebang: specifies the shell to interpret (required first line)

name="linux"                # Variable assignment (no spaces around =!)
count=10
echo "$name $count"         # Using variables: $ prefix, protect with "double quotes"

# Grant execute permission, then run
# chmod +x script.sh
# ./script.sh
```

| Rule | Correct | Wrong |
|------|------|------|
| Variable assignment | `name="x"` | `name = "x"` (no spaces) |
| Variable reference | `$name`, `${name}` | `name` |
| Command substitution | `$(date)` | (backticks work but are not recommended) |
| First line | `#!/bin/bash` | Without it, runs with the default shell |

> ⚠️ **Trap**: **No spaces are allowed** around the `=` of a variable assignment. `name = "x"` is interpreted as a command named `name` and produces an error.

### Positional Parameters and Special Variables

```bash
$0      # Script name
$1 $2   # First and second arguments
$#      # Number of arguments
$@      # All arguments (individually)
$?      # Exit status of the previous command (0 = success)
$$      # Current process PID
```

**Exit status `$?`**: 0 if the previous command succeeded, non-zero if it failed. It is the variable used most in conditional branching.

## The if Statement: Spaces Inside Brackets Are Vital

```bash
if [ "$count" -gt 5 ]; then
    echo "Greater than 5"
elif [ "$count" -eq 5 ]; then
    echo "Equal to 5"
else
    echo "Less than 5"
fi
```

- There **must be a space** after `[` and before `]` (because `[` is actually the `test` command).
- Comparison operators also differ for numbers and strings.

| Numeric comparison | Meaning | String comparison | Meaning |
|----------|------|------------|------|
| `-eq` | Equal | `=` / `==` | Equal |
| `-ne` | Not equal | `!=` | Not equal |
| `-gt` | Greater than | `-z str` | Length 0 (is it empty?) |
| `-lt` | Less than | `-n str` | Length > 0 (is it non-empty?) |
| `-ge` | Greater than or equal | | |
| `-le` | Less than or equal | | |

- File test operators are also essential.

| Operator | True when |
|--------|--------|
| `-e file` | It exists |
| `-f file` | It is a regular file |
| `-d file` | It is a directory |
| `-r`/`-w`/`-x` | Readable/writable/executable |

> ⚠️ **Blank trap**: Use `-gt`/`-lt`/`-eq` for numbers and `=`/`!=` for strings. Using `>` on numbers is interpreted as redirection and does not do what you intend.

## Loops: for, while, case

```bash
# for: iterate over a list
for i in 1 2 3 4 5; do
    echo "Number $i"
done

# for: C style
for ((i=1; i<=5; i++)); do
    echo "$i"
done

# for: iterate over files (a practical favorite)
for file in /var/log/*.log; do
    echo "Processing: $file"
done

# while: repeat while the condition holds
count=1
while [ "$count" -le 5 ]; do
    echo "$count"
    count=$((count + 1))        # Arithmetic $(( ))
done

# case: multi-way branch
case "$1" in
    start) echo "Starting" ;;
    stop)  echo "Stopping" ;;
    *)     echo "Usage: $0 {start|stop}" ;;
esac
```

| Structure | Closing keyword | Purpose |
|------|------------|------|
| `for ... do ... done` | done | Iterate over a list or range |
| `while ... do ... done` | done | Repeat while a condition holds |
| `case ... esac` | **esac** | Multi-way branch by value |

**Arithmetic**: `count=$((count + 1))` or `let count++`. Inside `$(( ))` you may write just the variable name without `$`.

**The closing word of case is esac** (case reversed), and for `if` it is `fi`. You need to know these reversed closing keywords exactly.

## Defining and Calling Functions

```bash
# Define functions (two syntaxes)
backup() {
    echo "Starting backup: $1"        # Function arguments are also $1, $2
    return 0                           # Return exit status (0-255)
}

function greet {
    echo "Hello $1"
}

# Call (list arguments without parentheses)
backup /etc
greet alice
```

- Function arguments are received as `$1`, `$2`, just like in a script.
- `return` only returns an **exit status** from 0 to 255.
- To hand back a value, print it with `echo` and capture it with `$(function call)`.

**Call syntax**: A function is called by listing arguments **without parentheses**, like `backup /etc`. `backup(/etc)` is wrong syntax.

## Practical Example 1: Backup Script

- This is the classic pattern of bundling a directory with tar and a date in the file name.

```bash
#!/bin/bash
# Usage: ./backup.sh <directory_to_back_up>

SRC="$1"
DATE=$(date +%Y%m%d)                 # Date via command substitution
DEST="/backup/backup_${DATE}.tar.gz"

# Validate the argument
if [ -z "$SRC" ]; then
    echo "Usage: $0 <directory>"
    exit 1
fi

# Check that the directory exists
if [ ! -d "$SRC" ]; then
    echo "Error: directory $SRC does not exist"
    exit 1
fi

# Prepare the backup directory
[ -d /backup ] || mkdir -p /backup

# Compressed backup
tar czf "$DEST" "$SRC"

# Check the result
if [ $? -eq 0 ]; then
    echo "Backup succeeded: $DEST"
else
    echo "Backup failed"
    exit 1
fi
```

- The key here is getting the following combination exactly right.
- `-z` (empty argument check), `! -d` (directory does not exist), `$(date +%Y%m%d)` (command substitution), `$?` (confirm tar succeeded), `tar czf` (c create, z gzip, f file).

In `[ -z "$SRC" ]`, if you do not wrap the variable in `"double quotes"`, an empty argument turns it into `[ -z ]` and causes a syntax error. Always protect variables with quotes.

## Practical Example 2: Creating Users in Bulk

- This is the pattern of reading a user list from a file and creating accounts.
- `while read` is the key.

```bash
#!/bin/bash
# userlist.txt has one username per line

USERLIST="userlist.txt"

while read username; do
    # Skip accounts that already exist
    if id "$username" &>/dev/null; then
        echo "$username already exists - skipping"
    else
        useradd "$username"
        echo "$username:initpass" | chpasswd   # Set the initial password
        echo "$username created"
    fi
done < "$USERLIST"                              # File as input
```

- `while read variable; do ... done < file` is the **standard idiom for reading a file line by line**.
- You must remember exactly **where** the input redirection `done < file` goes.
- `id "$user" &>/dev/null` quietly checks whether the account exists.

**Reading a file line by line**: `while read line; do ... done < file`. The redirection `< file` attaches after `done`, which is easy to make a blank on the exam.

## Practical Example 3: Log Parsing

- This is the pattern of counting specific patterns in a log.
- Combining with text processing tools is the key.

```bash
#!/bin/bash
# Count failed-login IPs from the log, ordered by frequency

LOG="/var/log/secure"

if [ ! -f "$LOG" ]; then
    echo "Log file not found: $LOG"
    exit 1
fi

echo "=== Top IPs by failed authentication ==="
grep "Failed password" "$LOG" \
    | awk '{print $(NF-3)}' \
    | sort | uniq -c | sort -rn | head -5
```

| Tool | Role |
|------|------|
| `grep "pattern"` | Extract only lines matching the pattern |
| `awk '{print $N}'` | Print the Nth field |
| `sort` | Sort |
| `uniq -c` | Remove duplicates + count occurrences |
| `sort -rn` | Numeric descending sort |
| `head -5` | Top 5 |

- `sort | uniq -c | sort -rn` is the **golden combination for frequency counting**.
- `uniq` only works properly on sorted input, so `sort` must come before it.

**Counting idiom**: `sort | uniq -c | sort -rn` = "group and count identical values, most frequent first." Always put `sort` before `uniq`.

## Reading Input and Logical Operators

- User input and logical combinations also often show up in writing tasks.

```bash
read -p "Enter your name: " name        # -p shows a prompt, then reads input
read -sp "Password: " pw                # -s hides the input (echo off)

# Logical combinations
if [ "$a" -gt 0 ] && [ "$b" -gt 0 ]; then echo "Both positive"; fi
if [ "$a" -eq 0 ] || [ "$b" -eq 0 ]; then echo "At least one is 0"; fi
[ -f "$f" ] && echo "exists" || echo "missing"   # Short-circuit evaluation
```

| Operator | Meaning |
|------|------|
| `&&` | Run the right side if the left succeeded (true) |
| `\|\|` | Run the right side if the left failed (false) |
| `!` | Negation |

**Short-circuit idiom**: `command && on-success-command || on-failure-command`. For preparation work like `mkdir -p /backup`, `[ -d /backup ] || mkdir /backup` is used often.

## Running Scripts Automatically with cron

- Running the script you wrote on a schedule is the practical finishing touch.
- The crontab fields are in the order **minute hour day month weekday**.

```bash
crontab -e        # Edit the current user's crontab
crontab -l        # List registered cron jobs
```

```text
# min hour day month weekday  command
0   2   *  *  *    /root/backup.sh /etc    # Back up daily at 02:00
30  3   *  *  0    /root/weekly.sh         # Every Sunday at 03:30
*/10 *  *  *  *    /root/check.sh          # Every 10 minutes
```

| Field | Range | Special characters |
|------|------|---------|
| Minute | 0-59 | `*` (every) |
| Hour | 0-23 | `,` (list) |
| Day | 1-31 | `-` (range) |
| Month | 1-12 | `*/N` (every N) |
| Weekday | 0-7 (0 and 7 = Sunday) | |

**Weekday 0 and 7**: Both mean Sunday. `*/10 * * * *` is every 10 minutes, and `0 2 * * *` is every day at 2 AM. Backup scripts are usually scheduled with cron during the quiet early-morning hours.

## Script Debugging and Exiting

```bash
bash -x script.sh        # Execution trace (prints each line) - the key to debugging
bash -n script.sh        # Syntax check only (does not run)
set -e                   # Stop immediately on error
set -u                   # Error when an undefined variable is used

exit 0                   # Exit with success (convention: 0 = success)
exit 1                   # Exit with failure (non-zero = failure)
```

**Debugging**: `bash -x` shows every executed command with a `+` prefix so you can trace where it went wrong. `set -e` stops immediately if even one line fails.

## Arrays and String Handling

- Beyond the basic syntax, here is a summary of array and string handling that writing tasks sometimes require.

```bash
# Arrays
arr=(apple banana cherry)
echo "${arr[0]}"          # First element: apple
echo "${arr[@]}"          # All elements
echo "${#arr[@]}"         # Number of elements: 3
for x in "${arr[@]}"; do echo "$x"; done

# String length and slicing
str="linuxmaster"
echo "${#str}"            # Length: 11
echo "${str:0:5}"         # Substring: linux (start:length)
echo "${str/master/king}"  # Replacement: linuxking
```

| Notation | Meaning |
|------|------|
| `${arr[i]}` | The i-th element |
| `${arr[@]}` | All elements |
| `${#arr[@]}` | Number of elements |
| `${#str}` | String length |
| `${str:n:m}` | m characters starting at n |

**The two faces of `${#...}`**: Used on an array it gives the element count, used on a regular variable it gives the string length. Tell `${#arr[@]}` (count) from `${#str}` (length).

## Try It Yourself

- Build small scripts yourself to develop a feel for the syntax.

```bash
# 1) Check the argument count and exit status
cat > t.sh <<'EOF'
#!/bin/bash
echo "Argument count: $#"
echo "First argument: $1"
[ -f "$1" ] && echo "File exists" || echo "File missing"
EOF
chmod +x t.sh
./t.sh /etc/hostname

# 2) Syntax check and traced run
bash -n t.sh
bash -x t.sh /etc/passwd
```

Tracing with `bash -x` until it is second nature is the shortcut to passing.

## 📖 Glossary

- **shebang (`#!/bin/bash`)** : The marker on the first line of a script that says which shell should interpret it.
- **Command substitution `$(...)`** : Syntax that replaces a command with its output as a value. Example: `DATE=$(date +%Y%m%d)`.
- **Arithmetic `$((...))`** : Syntax that evaluates what is inside the parentheses and replaces it with the value. Inside, variables do not need a `$`.
- **`$?` (exit status)** : Whether the previous command succeeded. **0 is success**; anything else is failure.
- **Positional parameters** : Arguments passed to a script or function. Received as `$1`, `$2`, with `$#` as the count.
- **test / `[ ]`** : The command that evaluates conditions. Because the bracket is a command, spaces inside are required.
- **`-z` / `-n`** : Operators that test whether a string is empty / non-empty.
- **`-f` / `-d` / `-e`** : Operators that test whether something is a regular file / a directory / existing.
- **esac** : The keyword that closes a `case` block. It is `case` written backwards (same idea as `if`↔`fi`).
- **`while read ... done < file`** : The standard idiom for reading a file line by line. The redirection attaches after `done`.
- **`sort | uniq -c | sort -rn`** : A counting idiom that tallies frequency per value and sorts most frequent first. `uniq` must always be preceded by `sort`.
- **Short-circuit `&&` / `||`** : Logical combinations that run the right side if the left succeeded / if it failed.
- **`bash -x` / `bash -n`** : Debug mode that prints the lines being executed / mode that checks only syntax without running.
- **`set -e` / `set -u`** : Stop immediately if any command fails / treat use of an undefined variable as an error.

## 📝 Practice Questions

**Question 1.** Which of the following is a correct shell variable assignment?

A) name = "linux"
B) name="linux"
C) $name = "linux"
D) set name "linux"

**Answer: B**

Explanation: In the shell, a variable assignment is written `name="linux"` with no spaces around `=`. With spaces as in A, it is interpreted as a command named `name` and causes an error. You do not put `$` on the left when assigning (C is wrong), and `set` is for shell options and positional parameters.

---

**Question 2.** In `if [ "$x" -gt 10 ]`, what does `-gt` mean?

A) x is less than 10
B) x is equal to 10
C) x is greater than 10
D) x is 10 or more

**Answer: C**

Explanation: `-gt` is "greater than," a numeric comparison operator meaning strictly greater. "Less than" is `-lt`, "equal" is `-eq`, and "greater than or equal (10 or more)" is `-ge`. For string comparison, use `=` and `!=`.

---

**Question 3.** Which test operator checks whether a directory exists?

A) -f
B) -d
C) -e
D) -r

**Answer: B**

Explanation: `-d` checks whether the target is a directory. `-f` is a regular file, `-e` is existence regardless of type, and `-r` is whether it is readable. So the directory-only check is `-d`.

---

**Question 4.** What goes in the blank of the following statement that reads a file line by line?
`while read line; do echo "$line"; done ____ data.txt`

A) > 
B) < 
C) |
D) <<

**Answer: B**

Explanation: You must redirect input with `done < file` so the file contents go into `read` one line at a time. `>` is output redirection (overwrite), `|` is a pipe, and `<<` is a here-document, so their purposes differ. The standard idiom for reading a file is `while read ... done < file`.

---

**Question 5.** Which keyword terminates a `case` statement?

A) done
B) fi
C) esac
D) end

**Answer: C**

Explanation: The closing keyword of `case` is `esac`, which is case written backwards. `if` closes with `fi`, and `for`/`while` close with `done`. `end` is not a block terminator in shell scripts.

---

**Question 6.** Which special variable holds the success/failure exit status of the command just executed?

A) $0
B) $#
C) $?
D) $$

**Answer: C**

Explanation: `$?` is the exit status of the previous command; 0 means success and non-zero means failure. `$0` is the script name, `$#` is the number of arguments, and `$$` is the current process PID. `$?` is what you use most to check whether a command succeeded in a conditional branch.

---

**Question 7.** In the `sort | uniq -c | sort -rn` combination for frequency counting, why must `sort` come before `uniq`?

A) Because uniq removes adjacent duplicates only on sorted input
B) Because sort is case-sensitive
C) Because uniq only handles numbers
D) Because the -c option cannot be used without sort

**Answer: A**

Explanation: `uniq` only removes and counts **adjacent** duplicate lines, so to make all identical values adjacent you must first sort with `sort`. Using uniq without sorting counts separated identical values separately. The trailing `sort -rn` sorts the counts in numeric descending order.

---
