# Day 2 - Regular Expressions

## 📌 Key Takeaways

- There are five regular expression functions: `REGEXP_LIKE` (condition), `REGEXP_SUBSTR` (extract), `REGEXP_INSTR` (position), `REGEXP_REPLACE` (replace), and `REGEXP_COUNT` (count).
- LIKE is true only when the **entire** string matches the pattern. REGEXP_LIKE is true when the pattern appears **anywhere, at least once**. To match the whole string, wrap the pattern in `^…$`.
- `.` any single character, `*` 0 or more times, `+` 1 or more times, `?` 0 or 1 time, `{n,m}` n to m times, `[ ]` character set, `[^ ]` excluded set, `|` or, `( )` group.
- A part wrapped in `( )` can be referred to again as `\1`, `\2`. It is used in the replacement string of REGEXP_REPLACE to reorder pieces.
- The match options are `'i'` (ignore case), `'c'` (case-sensitive, the default), `'n'` (`.` also matches a newline), and `'m'` (multiline mode). If they conflict, the last letter wins.

## When LIKE Is Not Enough

LIKE has only two wildcards: `%` (0 or more characters) and `_` (exactly 1 character). Conditions such as "starts with A or J," "the same letter twice in a row," or "digits only, 3 to 4 of them" are hard to write with LIKE. Regular expressions write such patterns in one line.

- Oracle supports REGEXP_LIKE, REGEXP_SUBSTR, REGEXP_INSTR, and REGEXP_REPLACE from 10g, and REGEXP_COUNT from 11g.
- The pattern syntax follows POSIX regular expressions, and it also accepts Perl-style shorthands such as `\d`, `\w`, and `\s`.

## Metacharacters

| Symbol | Meaning | Example | Matching strings |
|-----|----|----|----------|
| `.` | Any 1 character | `A.E` | ABE, ACE |
| `*` | Previous character 0 or more times | `AB*` | A, AB, ABB |
| `+` | Previous character 1 or more times | `AB+` | AB, ABB |
| `?` | Previous character 0 or 1 time | `AB?C` | AC, ABC |
| `{n}` / `{n,}` / `{n,m}` | Exactly n times / n or more times / n to m times | `L{2}` | LL |
| `^` | Start of the string | `^A` | Starts with A |
| `$` | End of the string | `S$` | Ends with S |
| `[ ]` | One of the characters inside the brackets | `[AJ]` | A or J |
| `[^ ]` | One character other than those inside the brackets | `[^0-9]` | A non-digit character |
| `\|` | Or | `LL\|TT` | LL or TT |
| `( )` | Group | `(AB)+` | AB, ABAB |
| `\1` | Same string as the first group (backreference) | `(.)\1` | AA, LL |

- `^` means start when it is **outside** square brackets, and negation when it is **first inside** them. `^[AJ]` and `[^AJ]` mean completely different things.
- A repetition symbol (`*`, `+`, `?`, `{ }`) attaches only to the single character right before it, or to the parenthesized group right before it.

### Character Classes

| POSIX class | Shorthand | Meaning |
|------------|-----|----|
| `[[:digit:]]` | `\d` | Digits 0-9 |
| `[[:alpha:]]` | | Letters |
| `[[:alnum:]]` | `\w` (includes underscore) | Letters and digits |
| `[[:space:]]` | `\s` | Space, tab, newline |
| `[[:upper:]]` / `[[:lower:]]` | | Uppercase / lowercase |

- The uppercase shorthands mean the opposite. `\D` is a non-digit character and `\S` is a non-whitespace character.
- POSIX classes use double square brackets. The outer `[ ]` is the set and the inner `[:digit:]` is the class name.

## REGEXP_LIKE — A Condition in the WHERE Clause

`REGEXP_LIKE(string, pattern [, option])` is a condition that returns true or false. You cannot use it like a value in the SELECT list; it goes where a condition goes, such as WHERE or CASE WHEN.
- Oracle 23ai, the practice environment for these notes, has a BOOLEAN type, so `SELECT REGEXP_LIKE(ENAME, 'A') FROM EMP` returns TRUE or FALSE. Under the exam's baseline (earlier versions) it cannot be used in the SELECT list. The practice lab on this site also follows the exam baseline.

```sql
SELECT ENAME FROM EMP WHERE REGEXP_LIKE(ENAME, '^[AJ]') ORDER BY ENAME;
```

```text
ENAME
----------
ADAMS
ALLEN
JAMES
JONES
```

```sql
SELECT ENAME FROM EMP WHERE REGEXP_LIKE(ENAME, '(.)\1') ORDER BY ENAME;
```

```text
ENAME
----------
ALLEN
MILLER
SCOTT
```

- `(.)` captures any single character, and `\1` requires the same character that was just captured. The LL in ALLEN and MILLER and the TT in SCOTT matched.
- Writing `'LL|TT'` returned the same three people. The difference is that a backreference finds "the same character twice" without knowing which character it is.

Employees whose name is exactly four characters long.

```sql
SELECT ENAME FROM EMP WHERE REGEXP_LIKE(ENAME, '^.{4}$') ORDER BY ENAME;
```

```text
ENAME
----------
FORD
KING
WARD
```

- Using just `'.{4}'` without `^` and `$` returned all 14 employees, because even a five-letter name contains "four consecutive characters."

## Differences from LIKE

| Aspect | LIKE | REGEXP_LIKE |
|------|------|------------|
| Judgment | True only if the entire string matches the pattern | True if the pattern is anywhere in the string |
| Arbitrary characters | `_` 1 character, `%` 0 or more | `.` 1 character, `.*` 0 or more |
| Anchoring start/end | Full match by default | Anchored only if you use `^` and `$` |
| Ignoring case | Convert manually with UPPER or LOWER | `'i'` option |
| Repetition, alternation, backreferences | None | `{n,m}`, `\|`, `\1` |

Searching for and counting the same character `A` both ways shows the difference right away.

```sql
SELECT (SELECT COUNT(*) FROM EMP WHERE ENAME LIKE 'A') AS LIKE_A, (SELECT COUNT(*) FROM EMP WHERE ENAME LIKE '%A%') AS LIKE_PCT, (SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'A')) AS REGEXP_A FROM DUAL;
```

```text
    LIKE_A   LIKE_PCT   REGEXP_A
---------- ---------- ----------
         0          7          7
```

- `LIKE 'A'` is true only if the name is exactly the single character `A`, so it finds 0 employees.
- `REGEXP_LIKE(ENAME, 'A')` means the same as `LIKE '%A%'`. Both find 7 employees.

> ⚠️ **Trap**: In a regular expression, `%` and `_` are not wildcards but ordinary characters. Conversely, `.` and `*` in LIKE are also ordinary characters. A pattern in an answer choice that mixes the two syntaxes gives results different from what you expect.

## REGEXP_SUBSTR · REGEXP_INSTR · REGEXP_COUNT

| Function | Arguments | Returns | If not found |
|------|-----|----------|--------|
| `REGEXP_SUBSTR` | (string, pattern, start position, nth occurrence, option, group number) | The matched substring | NULL |
| `REGEXP_INSTR` | (string, pattern, start position, nth occurrence, return option, option) | The position of the match | 0 |
| `REGEXP_COUNT` | (string, pattern, start position, option) | The number of matches | 0 |

- The default for both start position and nth occurrence is 1.
- For REGEXP_INSTR, a return option of 0 (the default) gives the start position of the match, and 1 gives the position **after** the end of the match.

Find the vowels in the names of employees in department 30.

```sql
SELECT ENAME, REGEXP_SUBSTR(ENAME, '[AEIOU]') AS V1, REGEXP_SUBSTR(ENAME, '[AEIOU]', 1, 2) AS V2, REGEXP_INSTR(ENAME, '[AEIOU]') AS P1, REGEXP_COUNT(ENAME, '[AEIOU]') AS CNT FROM EMP WHERE DEPTNO = 30 ORDER BY ENAME;
```

```text
ENAME      V1                                       V2                                               P1        CNT
---------- ---------------------------------------- ---------------------------------------- ---------- ----------
ALLEN      A                                        E                                                 1          2
BLAKE      A                                        E                                                 3          2
JAMES      A                                        E                                                 2          2
MARTIN     A                                        I                                                 2          2
TURNER     U                                        E                                                 2          2
WARD       A                                                                                          2          1
```

- WARD has only one vowel, A, so its second vowel V2 is NULL.
- The first vowel of BLAKE, A, is its third letter, so P1 is 3.

Check the finer behavior of the functions with string literals.

```sql
SELECT REGEXP_SUBSTR('02-1234-5678', '[0-9]+', 1, 2) AS A, REGEXP_SUBSTR('02-1234-5678', '\d+$') AS B, REGEXP_COUNT('02-1234-5678', '[[:digit:]]') AS C FROM DUAL;
```

```text
A    B             C
---- ---- ----------
1234 5678         10
```

- `[0-9]+` is one run of consecutive digits. The second run is 1234.
- `\d+$` is the run of digits at the end. `[[:digit:]]` is a single digit, so it counts 10 times.

```sql
SELECT REGEXP_COUNT('banana', 'a') AS A, REGEXP_COUNT('banana', 'ana') AS B, REGEXP_INSTR('ABCABC', 'B', 1, 2) AS C, REGEXP_INSTR('ABCABC', 'B', 1, 1, 1) AS D FROM DUAL;
```

```text
         A          B          C          D
---------- ---------- ---------- ----------
         3          1          5          3
```

- In banana, `ana` overlaps at positions 2-4 and 4-6, but the count is 1. That is because the next search starts after the characters of a match.
- The second B is the 5th character. With return option 1, the position after the first B (position 2), which is 3, is returned.

If you give a group number, only the parenthesized part is extracted.

```sql
SELECT REGEXP_SUBSTR('user@mail.com', '[^@]+') AS ID, REGEXP_SUBSTR('user@mail.com', '@(.+)$', 1, 1, NULL, 1) AS DOM FROM DUAL;
```

```text
ID   DOM
---- --------
user mail.com
```

- `[^@]+` is a run of non-@ characters, so the front part, user, comes out.
- The sixth argument, 1, means the first parenthesized group. Without a group number, `@mail.com`, including the @, comes out.

## REGEXP_REPLACE and Backreferences

`REGEXP_REPLACE(string, pattern, replacement)` replaces every matching part. If you omit the replacement string, the matched parts are deleted.

```sql
SELECT ENAME, SUBSTR(REGEXP_REPLACE(ENAME, '[AEIOU]', '*'), 1, 10) AS MASKED FROM EMP WHERE DEPTNO = 10 ORDER BY ENAME;
```

```text
ENAME      MASKED
---------- ----------------------------------------
CLARK      CL*RK
KING       K*NG
MILLER     M*LL*R
```

- SUBSTR was added to narrow the column width. The replaced content is unchanged.
- Both the I and the E in MILLER were replaced. REGEXP_REPLACE replaces all matches by default.

`\1`, `\2`, `\3` in the replacement string refer to the parts captured with parentheses in the pattern. Here we reverse the order of a date and mask the middle of a phone number.

```sql
SELECT REGEXP_REPLACE('2026-11-03', '(\d{4})-(\d{2})-(\d{2})', '\3/\2/\1') AS D, REGEXP_REPLACE('010-1234-5678', '(\d{3})-(\d{4})-(\d{4})', '\1-****-\3') AS P, REGEXP_REPLACE('a1b2c3', '\D') AS N FROM DUAL;
```

```text
D          P             N
---------- ------------- ---
03/11/2026 010-****-5678 123
```

- Group numbers follow the order of the opening parentheses. The year is `\1`, the month is `\2`, and the day is `\3`.
- `\D` is a non-digit character. With no replacement string, those characters are deleted and only the digits remain. Writing `[^[:digit:]]` gave the same result.

## Match Options

| Option | Meaning |
|-----|----|
| `'i'` | Case-insensitive |
| `'c'` | Case-sensitive (default) |
| `'n'` | `.` also matches a newline character (by default it does not) |
| `'m'` | Multiline mode. `^` and `$` match the start and end of each line, not just of the whole string |
| `'x'` | Ignores whitespace characters in the pattern |

All names in EMP are uppercase, so when we search with a lowercase `a`, the option decides the result.

```sql
SELECT (SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'a')) AS C_DEFAULT, (SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'a', 'i')) AS C_I, (SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'a', 'ic')) AS C_IC FROM DUAL;
```

```text
 C_DEFAULT        C_I       C_IC
---------- ---------- ----------
         0          7          0
```

- The default is case-sensitive, so it finds 0 employees. With `'i'` it finds 7.
- If you give mutually opposite options together, as in `'ic'`, the last `c` applies, so it is 0 again. Swapping the order to `'ci'` gave 7.

`'n'` and `'m'` make a difference on strings that contain a newline. `CHR(10)` is the newline character.

```sql
SELECT REGEXP_COUNT('ab' || CHR(10) || 'ac', '^a') AS NO_M, REGEXP_COUNT('ab' || CHR(10) || 'ac', '^a', 1, 'm') AS M, CASE WHEN REGEXP_LIKE('a' || CHR(10) || 'b', 'a.b') THEN 'Y' ELSE 'N' END AS NO_N, CASE WHEN REGEXP_LIKE('a' || CHR(10) || 'b', 'a.b', 'n') THEN 'Y' ELSE 'N' END AS N FROM DUAL;
```

```text
      NO_M          M N N
---------- ---------- - -
         1          2 N Y
```

- By default `^` matches only the very start of the string, so the count is 1. With `'m'` the start of the second line also matches, giving 2.
- The third column is NO_N and the fourth column is N. SQL*Plus truncated the column headers to fit the value width (1 character).
- By default `.` does not match a newline, so `a.b` is false. With `'n'` it becomes true.

> Tomorrow we cover DML (INSERT, UPDATE, DELETE, MERGE), which inserts, modifies, and deletes the rows of a table.

## 📖 Glossary

- **Regular expression** : A pattern that describes the shape of a string with symbols. It expresses repetition, alternation, and position conditions in one line.
- **Metacharacter** : A symbol such as `.`, `*`, `^`, or `$` that is used for a special meaning rather than literally.
- **Character set** : An expression that matches one of the characters written inside `[ ]`. `[^ ]` matches everything except those characters.
- **POSIX character class** : A named group of characters such as `[[:digit:]]` or `[[:alpha:]]`.
- **Group** : A part of a pattern wrapped in parentheses. Used to apply repetition to it together or to refer back to it later.
- **Backreference** : Referring again, with `\1` or `\2`, to a string captured earlier with parentheses.
- **Match option** : An argument such as `'i'`, `'c'`, `'n'`, or `'m'` that changes how case and newlines are handled.

## 📝 Practice Questions

**Question 1.** In EMP, 7 employees have an A in their name. Choose, in order, the results of `SELECT COUNT(*) FROM EMP WHERE ENAME LIKE 'A';` and `SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'A');`.

A) 0, 0  
B) 7, 7  
C) 0, 7  
D) 7, 0  

**Answer: C**  
Explanation: LIKE requires the entire string to match the pattern, so `LIKE 'A'` finds only rows whose name is exactly A. There is no such employee, so it is 0. REGEXP_LIKE is true when the pattern is anywhere, so it is 7. A and B assume the two functions judge in the same way. D applies the two methods the other way around.

---

**Question 2.** What is the result of `SELECT REGEXP_COUNT('banana', 'ana') FROM DUAL;`?

A) 1  
B) 2  
C) 3  
D) 0  

**Answer: A**  
Explanation: REGEXP_COUNT continues the next search right after the matched part. After finding ana at characters 2-4, it looks from character 5, where only na remains, so the count is 1. 2 counts the overlapping ana at 4-6 as well. 3 is the result of counting the single character `'a'`. 0 is the value when there is no match.

---

**Question 3.** What is the result of `SELECT REGEXP_REPLACE('2026-11-03', '(\d{4})-(\d{2})-(\d{2})', '\3/\2/\1') FROM DUAL;`?

A) 2026/11/03  
B) \3/\2/\1  
C) 11/03/2026  
D) 03/11/2026  

**Answer: D**  
Explanation: Group numbers follow the order of the opening parentheses, so `\1` is 2026, `\2` is 11, and `\3` is 03. Plugging them into the replacement string `\3/\2/\1` gives 03/11/2026. A changes only the separator without reordering. B assumes the backreferences are inserted literally. C reads the group numbers of the month and day swapped.

---

**Question 4.** All names in EMP are uppercase, and 7 employees have an A. What is the result of `SELECT COUNT(*) FROM EMP WHERE REGEXP_LIKE(ENAME, 'a', 'ic');`?

A) 7  
B) 0  
C) The match options conflict and an error occurs  
D) 14  

**Answer: B**  
Explanation: If you give mutually opposite options together, the last letter applies. The last c in `'ic'` means case-sensitive, so a lowercase a does not match the uppercase names, giving 0. 7 is the result with `'i'` or `'ci'`. No error occurs even when the options conflict. 14 is the total number of employees.

---

**Question 5.** Which REGEXP_LIKE pattern finds only employees whose name is exactly four characters long (FORD, KING, WARD)?

A) `'^.{4}$'`  
B) `'.{4}'`  
C) `'^....'`  
D) `'[4]'`  

**Answer: A**  
Explanation: You must anchor the start and end with `^` and `$` and place exactly 4 arbitrary characters between them, which fixes the total length at 4. B is true if four consecutive characters exist anywhere, so all 14 employees come out. C checks only the first four characters, so names of five or more letters also match. D looks for the single character 4, so it finds 0 employees.
