# Day 2 - Text Processing: Shaping Data with Pipelines, the Real Power of Unix

## 📌 Key Takeaways

- In Linux, configuration, logs, and command output are all text streams. The pipe `|` connects them like a conveyor belt.
- Division of roles: **grep** (line filtering) · **sed** (substitute/delete) · **awk** (field processing) · **cut/tr** (columns/characters) · **sort/uniq** (sorting/duplicates).
- `sed 's/pattern/replacement/g'` is the most frequently tested. `-i` overwrites the original, so use `-i.bak` to keep a copy.
- `uniq` removes only **consecutive** duplicates. That is why it is always paired as `sort | uniq` (or `sort -u`).
- BRE needs a backslash for `+ ? | ( ) {`, while ERE (`grep -E`) uses them as-is. The shell wildcard `*` and the regex `*` are different.

## Viewing File Contents: cat, head, tail

Just as important as "everything is a file" is the mindset that "everything is text." The starting point is printing file contents to the screen.

**Pipes and standard streams.** Every command has three channels: standard input (stdin), standard output (stdout), and standard error (stderr). The pipe `|` connects the stdout of one command to the stdin of the next. As in `cat log | grep error | sort`, you build a conveyor belt that data flows along. This simple connection makes almost all the magic of text processing possible.

```bash
cat file.txt            # Print the entire contents of a file
cat -n file.txt         # Print with line numbers
cat f1.txt f2.txt       # Print several files joined together (concatenate)
cat -A file.txt         # Also show non-printing characters (tabs, line ends)
head file.txt           # Print the first 10 lines (default)
head -n 5 file.txt      # Print the first 5 lines
head -c 100 file.txt    # Print the first 100 bytes
tail file.txt           # Print the last 10 lines
tail -n 20 file.txt     # Print the last 20 lines
tail -f /var/log/syslog # Follow content appended to the file in real time (follow)
```

- `cat` is originally short for concatenate (joining together).
- It is good for quickly checking a small file, but printing a huge file with `cat` floods the screen.
- In that case, use `head` to see only the beginning or `tail` to see only the end.

**The magic of tail -f.** `tail -f` (follow) is an essential tool for log monitoring. It keeps the file open and automatically displays each new line as it is appended. It is used endlessly when watching server logs in real time. Similarly, `tail -F` (uppercase) keeps tracking even if the file is rotated (deleted and recreated), so it is safer in production environments.

## The King of Pattern Searching: grep

`grep` (global regular expression print) finds and prints lines in text that match a pattern. It is one of the most widely used commands in Linux.

```bash
grep "error" log.txt        # Print lines containing error
grep -i "error" log.txt     # Ignore case (ignore case)
grep -v "debug" log.txt     # Print lines that do not contain debug (invert)
grep -n "error" log.txt     # Print with line numbers
grep -c "error" log.txt     # Print only the number of matching lines (count)
grep -r "TODO" ./src        # Search all files in a directory recursively (recursive)
grep -l "error" *.log       # Print only the names of files with matching content
grep -w "is" text.txt       # Match exactly as a whole word (word)
grep -A 2 "error" log.txt   # Print the matching line and the 2 lines After it
grep -B 2 "error" log.txt   # Print the matching line and the 2 lines Before it
grep -E "cat|dog" pets.txt  # OR search with extended regex (same as egrep)
```

- `grep -E` uses extended regular expressions (ERE) and is identical to the separate command `egrep`.
- `grep -F` ignores regular expressions and searches for a fixed string; it is the same as `fgrep`.

**The odd name grep.** `grep` comes from the command `g/re/p` of `ed`, the original text editor. It stands for "global - regular expression - print", meaning "print the lines in the whole file that match the regular expression." It is used so often that in the English-speaking world "grep" is even used as a verb meaning "to search."

## The Stream Editor: sed

`sed` (stream editor) reads a text stream line by line and applies editing commands. The most common use is string substitution.

```bash
sed 's/old/new/' file.txt       # Replace the first old in each line with new
sed 's/old/new/g' file.txt      # Replace all old in each line with new (global)
sed 's/old/new/2' file.txt      # Replace only the second old in each line
sed -n '5p' file.txt            # Print only line 5 (-n turns off automatic printing)
sed -n '2,5p' file.txt          # Print lines 2 to 5
sed '3d' file.txt               # Delete line 3
sed '/error/d' file.txt         # Delete lines containing error
sed -i 's/old/new/g' file.txt   # Modify the file directly (in-place)
sed 's/^/> /' file.txt          # Add "> " at the start of each line
```

- The substitution syntax `s/pattern/replacement/flag` is the core syntax.
- `s` is substitute, `/` is the delimiter, and the final `g` (global) flag means to replace every match within a line.

> ⚠️ **Pitfall: sed -i can't be undone**
> By default, `sed` only prints the result to the screen and doesn't touch the original file. But if you add the `-i` (in-place) option, it overwrites the original file directly. A mistake is hard to recover from, so for important files it is a safe habit to specify a backup extension like `sed -i.bak` to keep a copy of the original.

## The Field-Processing Powerhouse: awk

`awk` is not just a command but a small programming language. It specializes in processing text by **field (column)**, and its basic form is `awk 'pattern {action}'`.

```bash
awk '{print $1}' file.txt           # Print the first field of each line
awk '{print $1, $3}' file.txt       # Print the 1st and 3rd fields
awk '{print $NF}' file.txt          # Print the last field (NF = number of fields)
awk -F: '{print $1}' /etc/passwd    # Specify the delimiter as : (-F)
awk '{print NR, $0}' file.txt       # Print the line number (NR) and the whole line ($0)
awk '$3 > 100 {print $1}' data.txt  # Column 1 of lines whose 3rd field is greater than 100
awk '/error/ {print $2}' log.txt    # 2nd field of lines matching the error pattern
awk 'END {print NR}' file.txt       # Print the total number of lines
awk '{sum += $1} END {print sum}' n.txt  # Compute the total of column 1
```

- `$0` means the whole line, and `$1`, `$2`... mean each field.
- The default delimiter is whitespace (spaces, tabs), and you can change it with the `-F` option.
- The special variable `NR` (Number of Record) is the current line number, and `NF` (Number of Field) is the number of fields in the current line.

**awk's BEGIN and END blocks.** `awk` has two special patterns. `BEGIN { }` runs once before reading input, and `END { }` runs once after all input has been processed. That is why it is used to attach a header/footer, as in `awk 'BEGIN{print "start"} {print} END{print "end"}'`, or for statistics processing that prints an accumulated total in the `END` block.

## Sorting and Removing Duplicates: sort, uniq

```bash
sort file.txt           # Sort in alphabetical (lexicographic) order
sort -r file.txt        # Sort in reverse order (reverse)
sort -n numbers.txt     # Sort in numeric order (numeric)
sort -k 2 data.txt      # Sort by the 2nd field (key)
sort -t: -k 3 -n /etc/passwd  # Delimiter :, numeric sort on the 3rd field
sort -u file.txt        # Remove duplicates while sorting (unique)
uniq file.txt           # Remove consecutive duplicate lines
uniq -c file.txt        # Print with the duplicate count (count)
uniq -d file.txt        # Print only the duplicated lines (duplicated)
uniq -u file.txt        # Print only the unique lines with no duplicates
```

> ⚠️ **Pitfall: uniq is partners with sort**
> `uniq` removes only **consecutive** duplicate lines. It doesn't recognize duplicates that are far apart. That is why it is almost always used together as `sort | uniq`. You first sort to gather identical lines, then remove duplicates with `uniq`. If you simply want to sort and then remove duplicates, a single `sort -u` is enough.

## Cutting Columns and Converting Characters: cut, tr

```bash
cut -c 1-5 file.txt         # Extract characters 1 to 5 of each line
cut -d: -f 1 /etc/passwd    # Delimiter :, extract the 1st field
cut -d, -f 2,4 data.csv     # Extract the 2nd and 4th fields from a CSV
tr 'a-z' 'A-Z' < file.txt   # Convert lowercase to uppercase
tr -d ' ' < file.txt        # Delete space characters (delete)
tr -s ' ' < file.txt        # Squeeze consecutive spaces into one (squeeze)
echo "hello" | tr 'l' 'L'   # Convert l to L → heLLo
```

- `cut` cuts out a specific position or field from each line. `-c` specifies character positions, `-f` the fields (based on the delimiter), and `-d` the delimiter.
- `tr` (translate) is a character-level substitute/delete/squeeze tool; because it takes standard input, it is usually used with a pipe or redirection (`<`).

**cut's -d and -f are a pair.** When you extract fields with `cut -f`, it only makes sense to also specify the delimiter with `-d`. If you omit `-d`, the default delimiter is the **tab**, so data separated by spaces or commas won't be cut properly. For a CSV file you must give `-d,`, and for `/etc/passwd` you must give `-d:`.

## Counting: wc

```bash
wc file.txt         # Print line count, word count, byte count in that order
wc -l file.txt      # Print only the line count
wc -w file.txt      # Print only the word count
wc -c file.txt      # Byte count
wc -m file.txt      # Character count
```

- The option used most often with `wc` (word count) is `-l` (count lines).
- `grep "error" log | wc -l` is the classic pattern for counting "how many times error appears."

## Regular Expression Basics

- A regular expression (regex) is a formal language for expressing text patterns.
- `grep`, `sed`, and `awk` all support regular expressions, so knowing regex dramatically improves your text-processing ability.

The metacharacters of Basic Regular Expressions (BRE) are as follows.

| Metacharacter | Meaning |
|----------|------|
| `.` | Any single character |
| `*` | Zero or more repetitions of the preceding character |
| `^` | Start of a line |
| `$` | End of a line |
| `[abc]` | One character out of a, b, c |
| `[^abc]` | A character that is not a, b, or c |
| `[a-z]` | One character between a and z |
| `\` | Treat a metacharacter as an ordinary character (escape) |

Extended Regular Expressions (ERE) additionally allow the following.

| Metacharacter | Meaning |
|----------|------|
| `+` | One or more repetitions of the preceding character |
| `?` | Zero or one of the preceding character |
| `\|` | OR (either one) |
| `()` | Grouping |
| `{n,m}` | Repeat at least n and at most m times |

```bash
grep "^root" /etc/passwd        # Lines starting with root
grep "bash$" /etc/passwd        # Lines ending with bash
grep "^$" file.txt              # Empty lines (start and end are adjacent)
grep "a.c" file.txt             # a, any character, c (e.g. abc, axc)
grep "ab*c" file.txt            # ac, abc, abbc... (b zero or more times)
grep -E "ab+c" file.txt         # abc, abbc... (b one or more times, ERE)
grep -E "(cat|dog)" pets.txt    # cat or dog
```

**The decisive difference between BRE and ERE.** In Basic Regular Expressions (BRE), `+`, `?`, `|`, `(`, `)`, and `{` are treated as ordinary characters, so to use their meta function you must add a backslash and write `\+`, `\?`, `\|`. In Extended Regular Expressions (ERE, `grep -E` or `egrep`), on the other hand, they work as metacharacters without a backslash. In other words, BRE's `\(\)` is `()` in ERE. This reversal can be an exam trap.

**Shell wildcards and regular expressions are different.** The wildcard used in file names (`*.txt`) and the `*` of a regex are completely different. In a shell wildcard `*` means "any string," but in a regex `*` means "zero or more repetitions of the preceding character." To express "any string" in a regex, you must use `.*` (any character, zero or more times). If you confuse the two, the pattern behaves completely differently.

## Try It Yourself

Build a text-processing pipeline yourself with the following exercise.

```bash
# 1. Create practice data
cat > scores.txt << 'EOF'
alice 85 math
bob 92 science
carol 78 math
dave 92 science
alice 88 english
EOF

# 2. Filter with grep
grep "math" scores.txt
grep -c "92" scores.txt

# 3. Extract fields and calculate with awk
awk '{print $1, $2}' scores.txt
awk '{sum += $2} END {print "Average:", sum/NR}' scores.txt

# 4. Combine sort and uniq
awk '{print $1}' scores.txt | sort | uniq -c

# 5. sed substitution
sed 's/math/mathematics/g' scores.txt

# 6. Pipeline wrap-up: sort by score, then the top 2
sort -k2 -nr scores.txt | head -n 2

# 7. Clean up
rm scores.txt
```

- Try modifying these pipelines yourself. If you change the `sort` key, add a condition to `awk`, or exclude certain lines with `grep -v`, you will get a feel for how each tool meshes together.

## 📖 Glossary

- **Pipe (`|`)** : A connector that joins the standard output of the preceding command to the standard input of the following command.
- **Standard streams** : The three channels every command has — input (stdin), output (stdout), error (stderr).
- **grep** : A filter that picks out the **lines** matching a pattern. The name comes from the `g/re/p` command of `ed`.
- **sed** : A stream editor that reads and edits one line at a time. The typical syntax is `s/pattern/replacement/g`.
- **`sed -i`** : An option that overwrites the original file directly instead of printing the result to the screen. Keep a copy with `-i.bak`.
- **awk** : A small programming language that handles text by field (column). `$0` is the whole line, `$1` is the first field.
- **NR / NF** : awk's special variables. The current line number (Number of Record) and the number of fields in the current line (Number of Field).
- **BEGIN / END blocks** : Sections that awk runs exactly once, before reading the input and after reading it all. Used for totals and headers.
- **uniq** : A tool that removes only **consecutive** duplicate lines. That is why it is paired with `sort`.
- **tr** : A converter that replaces (`'a-z' 'A-Z'`), deletes (`-d`), and squeezes repeats (`-s`) at the character level.
- **BRE / ERE** : Basic and extended regular expressions. Whether `+ ? | ( ) {` need a backslash is the dividing line.
- **Wildcard vs regex** : The shell's `*` means "any string," while the regex `*` means "zero or more repetitions of the preceding character."

## 📝 Practice Questions

**Question 1.** Which `grep` option searches while ignoring case?

A) `-v`
B) `-i`
C) `-c`
D) `-n`

**Answer: B**
Explanation: `-i` (ignore case) searches without distinguishing upper and lower case. `-v` prints non-matching lines (invert), `-c` gives the number of matching lines (count), and `-n` shows line numbers.

---

**Question 2.** Which is correct about the behavior of the command `sed 's/apple/orange/g' file.txt`?

A) It replaces only the first apple in each line with orange
B) It replaces every apple in each line with orange and modifies the file directly
C) It prints the result of replacing every apple in each line with orange to the screen
D) It deletes the lines containing apple

**Answer: C**
Explanation: The `g` (global) flag replaces every match in each line. Since there is no `-i` option, the original file is not modified and only the result is printed to the screen. A is the behavior without `g`, B would require `-i`, and D describes the `d` command.

---

**Question 3.** You want to extract only the 1st field of `/etc/passwd` using a colon (`:`) as the delimiter. What is the correct command?

A) `cut -f 1 /etc/passwd`
B) `cut -c 1 /etc/passwd`
C) `cut -d: -f 1 /etc/passwd`
D) `cut -d, -f 1 /etc/passwd`

**Answer: C**
Explanation: `-d:` sets the delimiter to a colon and `-f 1` extracts the first field. A fails because it doesn't specify a delimiter and so uses the default delimiter, the tab; B extracts only the first character; and D wrongly specifies the delimiter as a comma.

---

**Question 4.** In `awk`, which expression prints the last field of the current line?

A) `$0`
B) `$NR`
C) `$NF`
D) `$last`

**Answer: C**
Explanation: `NF` is a variable holding the number of fields in the current line, and `$NF` means the field with that number, i.e. the last field. `$0` is the whole line, `NR` is the line number (not a field), and `$last` is not a valid expression.

---

**Question 5.** Which is correct about why the `uniq` command fails to remove duplicates that are far apart, and the fix?

A) `uniq` removes only consecutive duplicates, so you must sort first with `sort`
B) `uniq` handles only numbers, so you must add the `-n` option
C) `uniq` is case-sensitive, so you must add `-i`
D) `uniq` modifies the file directly, so `-i` is needed

**Answer: A**
Explanation: `uniq` removes only adjacent (consecutive) duplicate lines, so to gather scattered duplicates you usually sort first with `sort | uniq`. B's `-n` means something else in uniq, C's `-i` is the ignore-case option but is not the core cause, and D is an incorrect explanation.

---

**Question 6.** Which one works as a metacharacter without a backslash only in extended regular expressions (ERE)?

A) `.`
B) `*`
C) `+`
D) `^`

**Answer: C**
Explanation: `+` (one or more repetitions) works as a metacharacter only in extended regular expressions. In basic regular expressions (BRE) you must write it as `\+`. `.`, `*`, and `^` work as metacharacters without a backslash in both BRE and ERE.

---

**Question 7.** You want to count only the number of lines in a file. What is the correct command?

A) `wc -w file.txt`
B) `wc -c file.txt`
C) `wc -l file.txt`
D) `wc -m file.txt`

**Answer: C**
Explanation: `-l` (line) counts lines. `-w` counts words, `-c` counts bytes, and `-m` counts characters.

---
