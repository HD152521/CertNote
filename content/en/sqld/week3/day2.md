# Day 2 - Character and Numeric Functions

## 📌 Key Takeaways

- A **single-row function** produces one result per row. A **multi-row function** (SUM, COUNT, etc.) groups several rows into one result.
- The start position in `SUBSTR(string, start, length)` is counted **from 1**. A negative value counts from the end.
- `INSTR` returns a position and `LENGTH` returns the number of characters, both as numbers. If nothing is found, `INSTR` returns 0.
- When the digit argument of `ROUND` and `TRUNC` is **negative, they work on the integer part**. `ROUND(1250, -2)` is 1300.
- For negative numbers, `CEIL` goes toward 0 and `FLOOR` goes away from 0. `CEIL(-2.5) = -2`, `FLOOR(-2.5) = -3`.

## Functions Come in Two Kinds

SQLD function questions first split on "how many rows go in and how many come out."

| Category | Input → Output | Examples | Where used |
|------|------|------|------|
| **Single-row function** | One row → one result | `UPPER`, `SUBSTR`, `ROUND`, `NVL`, `TO_CHAR` | SELECT, WHERE, ORDER BY, etc. |
| **Multi-row function** | Many rows → one result | `SUM`, `AVG`, `COUNT`, `MAX`, `MIN` | SELECT, HAVING, ORDER BY |

- Single-row functions are further divided into character, numeric, date, conversion, and NULL-related functions. Today covers character and numeric; tomorrow covers date and conversion.
- Single-row functions can be **nested**. The inner result becomes the input of the outer function, as in `UPPER(SUBSTR(ENAME, 1, 3))`.
- Multi-row functions (aggregate functions) are covered in detail in Week 4.

Mixing the two kinds in one SELECT causes an error because the row counts don't match. You can't place a 14-row result next to a 1-row result.

```sql
SELECT UPPER(ENAME), SUM(SAL) FROM EMP;
```

```text
SELECT UPPER(ENAME), SUM(SAL) FROM EMP
             *
ERROR at line 1:
ORA-00937: not a single-group group function
```

## Changing Case

| Function | What it does | Example → Result |
|------|------|------|
| `LOWER` | All lowercase | `'SQL Expert'` → `sql expert` |
| `UPPER` | All uppercase | `'sql expert'` → `SQL EXPERT` |
| `INITCAP` | Only the first letter of each word uppercase, the rest lowercase | `'sql EXPERT dev'` → `Sql Expert Dev` |

```sql
SELECT ENAME, LOWER(ENAME) LOW, INITCAP(ENAME) CAP FROM EMP WHERE DEPTNO = 10;
```

```text
ENAME      LOW        CAP
---------- ---------- ----------
CLARK      clark      Clark
KING       king       King
MILLER     miller     Miller
```

- Value comparison is case-sensitive. `WHERE ENAME = 'king'` can't find KING. Match one side's case, as in `WHERE LOWER(ENAME) = 'king'`.

## Joining and Cutting — CONCAT, SUBSTR

`CONCAT(a, b)` is the same as `a || b`. For the exam, it takes **two** arguments. To join three, nest them.

```sql
SELECT CONCAT(CONCAT(ENAME, ' - '), JOB) AS EJ FROM EMP WHERE DEPTNO = 10;
```

```text
EJ
----------------------
CLARK - MANAGER
KING - PRESIDENT
MILLER - CLERK
```

- Oracle 23ai in the practice lab also accepts three arguments, as in `CONCAT('A', 'B', 'C')` (result `ABC`). In Oracle versions before 23ai that is an error, so in exam questions treat it as two arguments.

`SUBSTR(string, start position, length)` cuts out part of a string.

| Call | Result | How to read it |
|------|------|------|
| `SUBSTR('DATABASE', 3, 4)` | `TABA` | 4 characters starting at the 3rd |
| `SUBSTR('DATABASE', 5)` | `BASE` | Without a length, to the end |
| `SUBSTR('DATABASE', -4, 2)` | `BA` | 2 characters starting at the 4th from the end (B) |
| `SUBSTR('DATABASE', 0, 3)` | `DAT` | 0 is treated as 1 |

```sql
SELECT SUBSTR('DATABASE', 3, 4) A, SUBSTR('DATABASE', 5) B, SUBSTR('DATABASE', -4, 2) C, SUBSTR('DATABASE', 0, 3) D FROM DUAL;
```

```text
A    B    C  D
---- ---- -- ---
TABA BASE BA DAT
```

- Positions are counted **from 1**. This differs from the 0-based counting of programming languages.
- If the start position is beyond the string (`SUBSTR('SQLD', 10)`), you get NULL, not an error.

## Length and Position — LENGTH, INSTR

`LENGTH` counts characters. A space counts as one character too.

```sql
SELECT LENGTH('SQLD') A, LENGTH('SQL café') B, LENGTHB('SQL café') C, LENGTH(' ') D FROM DUAL;
```

```text
         A          B          C          D
---------- ---------- ---------- ----------
         4          8          9          1
```

- `LENGTHB` is the number of bytes. This DB uses UTF-8, so é takes 2 bytes (`7 + 2 = 9`), and a Korean character takes 3 bytes. The byte count varies with the character set setting.
- `LENGTH('')` is NULL, not 0. Oracle treats an empty string as NULL (Day 4).

`INSTR(string, search string, start position, nth occurrence)` returns the **position** where it was found.

```sql
SELECT INSTR('DATABASE', 'A') A, INSTR('DATABASE', 'A', 3) B, INSTR('DATABASE', 'A', 1, 3) C, INSTR('DATABASE', 'Z') D FROM DUAL;
```

```text
         A          B          C          D
---------- ---------- ---------- ---------- 
         2          4          6          0
```

- In `D-A-T-A-B-A-S-E`, A is at the 2nd, 4th, and 6th positions. Searching from position 3 gives 4, and the third A from the start is 6.
- If nothing is found, the result is **0**. Not NULL or -1.

## Trimming — TRIM, PAD, REPLACE

| Function | What it does |
|------|------|
| `LTRIM(s [, set])` | Keeps removing characters in the set from the left. Without a set, spaces |
| `RTRIM(s [, set])` | The same from the right |
| `TRIM([LEADING\|TRAILING\|BOTH] character FROM s)` | Removes **one character** from both sides (default) |
| `LPAD(s, n [, pad character])` | Pads on the left so the total length is n. Without a pad character, spaces |
| `RPAD(s, n [, pad character])` | Pads on the right |
| `REPLACE(s, search [, replacement])` | Without a replacement, removes the found string |

```sql
SELECT '[' || LTRIM('  SQL  ') || ']' L, '[' || RTRIM('  SQL  ') || ']' R, '[' || TRIM('  SQL  ') || ']' T FROM DUAL;
```

```text
L       R       T
------- ------- -----
[SQL  ] [  SQL] [SQL]
```

```sql
SELECT LTRIM('xxSQLxx', 'x') A, RTRIM('xxSQLxx', 'x') B, TRIM('x' FROM 'xxSQLxx') C, TRIM(LEADING 'x' FROM 'xxSQLxx') D FROM DUAL;
```

```text
A     B     C   D
----- ----- --- -----
SQLxx xxSQL SQL SQLxx
```

- The second argument of `LTRIM` and `RTRIM` is a **set of characters**, not a string. `LTRIM('ABCABCSQL', 'CBA')` keeps removing as long as the character is one of A, B, C, and becomes `SQL`.
- `TRIM` accepts only a single character to remove. Giving two characters is an error.

```sql
SELECT TRIM('xy' FROM 'xxSQLxx') FROM DUAL;
```

```text
SELECT TRIM('xy' FROM 'xxSQLxx') FROM DUAL
       *
ERROR at line 1:
ORA-30001: trim set should have only one character
```

```sql
SELECT LPAD('SQL', 6, '*') A, RPAD('SQL', 6, '-') B, LPAD('DATABASE', 4) C, LPAD('7', 3, '0') D FROM DUAL;
```

```text
A      B      C    D
------ ------ ---- ---
***SQL SQL--- DATA 007
```

- When n is shorter than the original length, as in `LPAD('DATABASE', 4)`, the string is **truncated**. Even for the left-side function, the part kept is the first 4 characters.
- `REPLACE('A-B-C', '-')` is `ABC`. Leaving out the third argument removes the found string.

`ASCII` returns the character code of the first character, and `CHR` returns the character for a code.

```sql
SELECT ASCII('A') A, ASCII('a') B, CHR(65) C, CHR(97) D, ASCII('ABC') E FROM DUAL;
```

```text
         A          B C D          E
---------- ---------- - - ----------
        65         97 A a         65
```

- `ASCII('ABC')` looks only at the first character A and returns 65.

## Numeric Functions

| Function | What it does | Example → Result |
|------|------|------|
| `ROUND(n [, d])` | **Rounds** to d decimal places (d defaults to 0) | `ROUND(1234.567, 1)` → 1234.6 |
| `TRUNC(n [, d])` | **Truncates** to d decimal places | `TRUNC(1234.567, 1)` → 1234.5 |
| `CEIL(n)` | Smallest integer greater than or equal to n | `CEIL(2.1)` → 3 |
| `FLOOR(n)` | Largest integer less than or equal to n | `FLOOR(2.9)` → 2 |
| `MOD(m, n)` | Remainder of m divided by n | `MOD(10, 3)` → 1 |
| `ABS(n)` | Absolute value | `ABS(-15)` → 15 |
| `SIGN(n)` | 1 for positive, 0 for 0, -1 for negative | `SIGN(-15)` → -1 |
| `POWER(m, n)` | m raised to the power n | `POWER(2, 10)` → 1024 |
| `SQRT(n)` | Square root | `SQRT(16)` → 4 |

### Negative Digit Values

When the digit value d is negative, it goes to the **left** of the decimal point. -1 works at the ones place and -2 at the tens place, turning everything below into 0.

```sql
SELECT ROUND(1234.567, -2) A, TRUNC(1234.567, -2) B, ROUND(1250, -2) C, TRUNC(1239, -1) D FROM DUAL;
```

```text
         A          B          C          D
---------- ---------- ---------- ----------
      1200       1200       1300       1230
```

- `ROUND(1250, -2)` looks at the 5 in the tens place and rounds up to 1300. `TRUNC(1239, -1)` drops the 9 in the ones place to get 1230.

> ⚠️ **The direction flips for negative numbers.** `CEIL` goes to the right (larger side) of the number line, and `FLOOR` goes to the left (smaller side). `TRUNC` cuts toward 0, and `ROUND(-2.5)` rounds the absolute value up to -3.

```sql
SELECT ROUND(-2.5) A, TRUNC(-2.5) B, CEIL(-2.5) C, FLOOR(-2.5) D FROM DUAL;
```

```text
         A          B          C          D
---------- ---------- ---------- ----------
        -3         -2         -2         -3
```

### MOD — Remainder

```sql
SELECT MOD(10, 3) A, MOD(-10, 3) B, MOD(10, -3) C, MOD(10, 0) D, MOD(5.5, 2) E FROM DUAL;
```

```text
         A          B          C          D          E
---------- ---------- ---------- ---------- ----------
         1         -1          1         10        1.5
```

- The sign of the `MOD` result follows the **first number (m)**. `MOD(-10, 3)` is -1 and `MOD(10, -3)` is 1.
- `MOD(10, 0)` is 10, not an error. Dividing by 0 returns m as is.
- `ABS`, `SIGN`, `POWER`, and `SQRT` behave exactly as in the examples in the table. Giving `SQRT` a negative number causes ORA-01428.

## Names That Differ from SQL Server

Some functions that do the same job have different names. If a choice mixes in a SQL Server name, it is an error in Oracle.

| What it does | Oracle | SQL Server |
|------|------|------|
| Number of characters | `LENGTH` | `LEN` |
| String concatenation | `\|\|`, `CONCAT` | `+`, `CONCAT` |
| Round up | `CEIL` | `CEILING` |
| Substring | `SUBSTR` | `SUBSTRING` |
| Remainder | `MOD(m, n)` | `m % n` |

```sql
SELECT LEN('A') FROM DUAL;
```

```text
SELECT LEN('A') FROM DUAL
       *
ERROR at line 1:
ORA-00904: "LEN": invalid identifier
```

- `CEILING(2.1)` also gives the same ORA-00904 error in Oracle. Week 8, Day 3 collects the differences between the two DBs once more.

Tomorrow covers date functions that add and subtract dates, and conversion functions that convert between characters, numbers, and dates.

## 📖 Glossary

- **Single-row function** : A function that takes one row and produces one result. It is calculated separately for each row.
- **Multi-row function** : A function that groups several rows into one result. Also called an aggregate function.
- **Nesting** : Passing a function's result as another function's input. Evaluated from the inside out.
- **Character set (TRIM argument)** : The collection of characters that `LTRIM` and `RTRIM` remove. A character is removed if it matches any one of them, regardless of order.
- **Padding** : Adding characters to reach a set length. Done by `LPAD` and `RPAD`.
- **Negative digit value** : In `ROUND` and `TRUNC`, a value that points to a place left of the decimal point. -1 is the ones place.
- **LENGTHB** : A function that counts bytes instead of characters. The value varies with the character set.

## 📝 Practice Questions

**Question 1.** Which is the correct result of the following SQL?

```sql
SELECT SUBSTR('SQL DEVELOPER', 5, 3) FROM DUAL;
```

A) SQL  
B) DEVE  
C) DEV  
D) L D  

**Answer: C**  
Explanation: `SUBSTR` counts from the 1st character. In `S-Q-L-space-D`, the 5th is D, and cutting 3 characters from there gives `DEV`. If you forget that the space counts as a character, you end up choosing `L D`.

---

**Question 2.** Which is the correct result of the following SQL?

```sql
SELECT ROUND(1250.567, -2) FROM DUAL;
```

A) 1300  
B) 1200  
C) 1250.57  
D) 1251  

**Answer: A**  
Explanation: A digit value of -2 means rounding at the tens place and keeping down to the hundreds place. The tens digit is 5, so it rounds up to 1300. 1250.57 is the result for digit value 2, 1251 for digit value 0, and 1200 is the result of `TRUNC(1250.567, -2)`.

---

**Question 3.** Which of the following is a multi-row function that takes several rows as input and returns a single result?

A) LENGTH  
B) ROUND  
C) SUBSTR  
D) COUNT  

**Answer: D**  
Explanation: `COUNT`, `SUM`, `AVG`, `MAX`, and `MIN` are multi-row (aggregate) functions that group several rows into one result. `LENGTH`, `ROUND`, and `SUBSTR` are single-row functions that produce one result per row.

---

**Question 4.** Which of the following gives -3?

A) `CEIL(-2.5)`  
B) `FLOOR(-2.5)`  
C) `TRUNC(-2.5)`  
D) `ROUND(-2.4)`  

**Answer: B**  
Explanation: `FLOOR` is the largest integer less than or equal to the given number, so for -2.5 it is -3. `CEIL(-2.5)` is the smallest integer greater than or equal, -2; `TRUNC(-2.5)` drops the fraction to get -2; and `ROUND(-2.4)` rounds to -2.

---

**Question 5.** Which is the correct result of the following SQL?

```sql
SELECT INSTR('DATABASE', 'A', 1, 3) FROM DUAL;
```

A) 6  
B) 4  
C) 2  
D) 0  

**Answer: A**  
Explanation: `INSTR(string, search character, start position, nth occurrence)` searches from the start position and returns the position of the nth occurrence. In `DATABASE`, A is at the 2nd, 4th, and 6th positions, so the position of the third A is 6. 0 is what you get when nothing is found.
