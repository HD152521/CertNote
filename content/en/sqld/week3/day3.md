# Day 3 - Date and Conversion Functions

## 📌 Key Takeaways

- Oracle dates are calculated like **numbers in units of days**. Date ± number = date, date − date = number of days, date + date = error.
- `ADD_MONTHS` adds months, and if you start from the last day of a month, the result is also the **last day**. `MONTHS_BETWEEN(a, b)` is the number of months in a − b.
- `TRUNC(date, 'MM')` is the 1st of that month, and `ROUND(date, 'MM')` becomes the 1st of the next month **from the 16th onward**.
- There are three explicit conversions: `TO_CHAR` (→ string), `TO_DATE` (→ date), and `TO_NUMBER` (→ number).
- Implicit conversion is when the DB matches the types on its own. The result **depends on NLS settings**, so explicit conversion is safer.

## Calculating Dates Like Numbers

Oracle's DATE holds both a date and a time (hours, minutes, seconds). The unit of arithmetic is **1 day**.

| Operation | Result type | Example → Result |
|------|------|------|
| Date + number | Date | `DATE '2026-11-03' + 7` → 2026-11-10 |
| Date − number | Date | `DATE '2026-11-03' - 3` → 2026-10-31 |
| Date − date | Number (days) | `DATE '2026-12-25' - DATE '2026-11-03'` → 52 |
| Date + number/24 | Date | 1/24 of a day = 1 hour |
| Date + date | **Error** | ORA-00975 |

```sql
SELECT DATE '2026-11-03' + 7 AS A, DATE '2026-11-03' - 3 AS B, DATE '2026-12-25' - DATE '2026-11-03' AS C FROM DUAL;
```

```text
A          B                   C
---------- ---------- ----------
2026-11-10 2026-10-31         52
```

- `DATE '2026-11-03'` is a date literal. The format is always `YYYY-MM-DD` and gives the same date regardless of NLS settings.
- The current date and time come from `SYSDATE`. Its value changes every time it runs, so the examples in this note use fixed dates and HIREDATE.

Adding two dates is meaningless, so it is an error.

```sql
SELECT DATE '2026-11-03' + DATE '2026-11-04' FROM DUAL;
```

```text
SELECT DATE '2026-11-03' + DATE '2026-11-04' FROM DUAL
                         *
ERROR at line 1:
ORA-00975: date + date not allowed
```

Even if you add a time, the screen may show only the date, because the display format is `YYYY-MM-DD`. The value does contain the time.

```sql
SELECT DATE '2026-11-03' + 1/24 AS PLAIN, TO_CHAR(DATE '2026-11-03' + 1/24, 'YYYY-MM-DD HH24:MI:SS') AS FULL_TIME FROM DUAL;
```

```text
PLAIN      FULL_TIME
---------- -------------------
2026-11-03 2026-11-03 01:00:00
```

## Date Functions

| Function | What it does | Result type |
|------|------|------|
| `ADD_MONTHS(d, n)` | Date n months later (earlier if negative) | Date |
| `MONTHS_BETWEEN(d1, d2)` | Number of months in d1 − d2 | Number |
| `LAST_DAY(d)` | The last day of that month | Date |
| `NEXT_DAY(d, weekday)` | That weekday coming **after** d | Date |
| `EXTRACT(YEAR\|MONTH\|DAY FROM d)` | One part: year, month, or day | Number |

### ADD_MONTHS

```sql
SELECT ADD_MONTHS(DATE '2026-01-31', 1) A, ADD_MONTHS(DATE '2026-11-03', -3) B, ADD_MONTHS(DATE '2026-02-28', 1) C FROM DUAL;
```

```text
A          B          C
---------- ---------- ----------
2026-02-28 2026-08-03 2026-03-31
```

- Adding one month to January 31 gives a non-existent February 31, so the result is the **last day of February** (the 28th).
- February 28 is the last day of its month. Starting from a last day gives a last day, so the result is **March 31**, not March 28.

### MONTHS_BETWEEN

```sql
SELECT MONTHS_BETWEEN(DATE '2026-11-03', DATE '2026-08-03') A, MONTHS_BETWEEN(DATE '2026-08-03', DATE '2026-11-03') B, MONTHS_BETWEEN(DATE '2026-11-18', DATE '2026-11-03') C FROM DUAL;
```

```text
         A          B          C
---------- ---------- ----------
         3         -3 .483870968
```

- The second date is subtracted from the first. Swapping the order flips the sign.
- If the month count isn't a whole number, you get a decimal. A 15-day difference is `15 / 31`, about 0.48.

### LAST_DAY, NEXT_DAY, EXTRACT

```sql
SELECT LAST_DAY(DATE '2026-02-10') A, LAST_DAY(DATE '2028-02-10') B, NEXT_DAY(DATE '2026-11-03', 'FRIDAY') C FROM DUAL;
```

```text
A          B          C
---------- ---------- ----------
2026-02-28 2028-02-29 2026-11-06
```

- 2028 is a leap year, so the last day of February is the 29th.
- 2026-11-03 is a Tuesday. The next Friday is 11-06. Even if the base date is that weekday, you get that weekday in the **following week**, not the same day.
- Weekday names follow the session language (NLS_DATE_LANGUAGE). The practice lab's Oracle is AMERICAN, so a Korean-language weekday name is an ORA-01846 error and you must use `'FRIDAY'`. In a Korean-language environment it is the opposite.

```sql
SELECT ENAME, HIREDATE, EXTRACT(YEAR FROM HIREDATE) Y, EXTRACT(MONTH FROM HIREDATE) M FROM EMP WHERE DEPTNO = 10;
```

```text
ENAME      HIREDATE            Y          M
---------- ---------- ---------- ----------
CLARK      1981-06-09       1981          6
KING       1981-11-17       1981         11
MILLER     1982-01-23       1982          1
```

- The result of `EXTRACT` is a **number**. That's why the month comes out as `6`, not `06`. To get a two-digit string, use `TO_CHAR(HIREDATE, 'MM')`.

## TRUNC and ROUND on Dates

The numeric functions `TRUNC` and `ROUND` also accept dates. The second argument is a **unit** instead of a digit count.

| Call | Result | Basis |
|------|------|------|
| `TRUNC(d)` | Midnight of that day | Drops the time |
| `TRUNC(d, 'MM')` | The 1st of that month | Drops the day |
| `TRUNC(d, 'YYYY')` | January 1 of that year | Drops month and day |
| `ROUND(d, 'MM')` | Days 1–15 → the 1st of that month, **day 16 on** → the 1st of the next month | |
| `ROUND(d, 'YYYY')` | Jan–Jun → January 1 of that year, **Jul on** → January 1 of the next year | |

```sql
SELECT TRUNC(DATE '2026-11-18', 'MM') A, TRUNC(DATE '2026-11-18', 'YYYY') B, ROUND(DATE '2026-11-15', 'MM') C, ROUND(DATE '2026-11-16', 'MM') D, ROUND(DATE '2026-07-01', 'YYYY') E FROM DUAL;
```

```text
A          B          C          D          E
---------- ---------- ---------- ---------- ----------
2026-11-01 2026-01-01 2026-11-01 2026-12-01 2027-01-01
```

`TRUNC(d)` sets the time to midnight. Printing with the time visible shows the difference.

```sql
SELECT TO_CHAR(TO_DATE('2026-11-03 14:35:20', 'YYYY-MM-DD HH24:MI:SS'), 'YYYY-MM-DD HH24:MI') A, TO_CHAR(TRUNC(TO_DATE('2026-11-03 14:35:20', 'YYYY-MM-DD HH24:MI:SS')), 'YYYY-MM-DD HH24:MI') B FROM DUAL;
```

```text
A                B
---------------- ----------------
2026-11-03 14:35 2026-11-03 00:00
```

Combining functions lets you produce values like years of service, probation end date, and first pay date (the last day of the hire month).

```sql
SELECT ENAME, HIREDATE, TRUNC(MONTHS_BETWEEN(DATE '2026-11-03', HIREDATE) / 12) YEARS, ADD_MONTHS(HIREDATE, 6) PROBATION, LAST_DAY(HIREDATE) FIRST_PAY FROM EMP WHERE DEPTNO = 10;
```

```text
ENAME      HIREDATE        YEARS PROBATION  FIRST_PAY
---------- ---------- ---------- ---------- ----------
CLARK      1981-06-09         45 1981-12-09 1981-06-30
KING       1981-11-17         44 1982-05-17 1981-11-30
MILLER     1982-01-23         44 1982-07-23 1982-01-31
```

## Explicit Conversion — TO_CHAR, TO_DATE, TO_NUMBER

```text
              TO_CHAR              TO_DATE
  Number ─────────────▶ String ─────────────▶  Date
        ◀─────────────       ◀─────────────
              TO_NUMBER            TO_CHAR
```

### TO_CHAR — Date or Number into a String of the Shape You Want

| Date format | Meaning | 2026-11-03 → |
|------|------|------|
| `YYYY` / `YY` | 4-digit / 2-digit year | 2026 / 26 |
| `MM` | 2-digit month | 11 |
| `DD` | 2-digit day | 03 |
| `DAY` / `DY` | Weekday name / abbreviated | TUESDAY / TUE |
| `Q` | Quarter | 4 |
| `HH24`, `HH`, `MI`, `SS` | Hour (24-hour), hour (12-hour), minute, second | |
| `"text"` | Characters inside double quotes appear as-is | `"Year"` → Year |

```sql
SELECT TO_CHAR(DATE '2026-11-03', '"Year" YYYY, "Month" MM, "Day" DD') A, TO_CHAR(DATE '2026-11-03', 'DAY') B, TO_CHAR(DATE '2026-11-03', 'DY') C, TO_CHAR(DATE '2026-11-03', 'Q') D FROM DUAL;
```

```text
A                              B         C   D
------------------------------ --------- --- -
Year 2026, Month 11, Day 03    TUESDAY   TUE 4
```

- Minutes are `MI`. `MM` is month, so if you write a time as `HH24:MM`, the month is printed in the minutes position.

| Number format | Meaning |
|------|------|
| `9` | One digit. Leading empty places are spaces |
| `0` | One digit. Empty places are filled with 0 |
| `,` / `.` | Thousands separator / decimal point |
| `$` | Dollar sign |
| `L` | Local currency symbol (varies with NLS_TERRITORY) |

```sql
SELECT TO_CHAR(1234567.891, '9,999,999.99') A, TO_CHAR(1234567.891, '999,999') B, TO_CHAR(42, '0000') C, TO_CHAR(1234.5, '$9,999.00') D FROM DUAL;
```

```text
A             B        C     D
------------- -------- ----- ----------
 1,234,567.89 ########  0042  $1,234.50
```

- If the format doesn't have enough places, the value is filled with **`#`** instead of being cut off (B).
- The one leading space is the place for the sign (+/−).

### TO_DATE, TO_NUMBER — Strings into Dates or Numbers

`TO_DATE` uses its second argument to tell it **what shape the input string has**. Not the output shape.

```sql
SELECT TO_DATE('20261103', 'YYYYMMDD') A, TO_DATE('03/11/2026', 'DD/MM/YYYY') B, TO_NUMBER('1,234', '9,999') + 1 C FROM DUAL;
```

```text
A          B                   C
---------- ---------- ----------
2026-11-03 2026-11-03       1235
```

A value that can't be converted causes an error.

```sql
SELECT TO_DATE('2026-13-01', 'YYYY-MM-DD') FROM DUAL;
```

```text
SELECT TO_DATE('2026-13-01', 'YYYY-MM-DD') FROM DUAL
               *
ERROR at line 1:
ORA-01843: An invalid month was specified.
```

- Trying to convert a non-numeric string with `TO_NUMBER('ABC')` causes ORA-01722 (number conversion failure).

## Implicit Conversion and Its Risks

When values of different types are used in an operation or comparison, Oracle automatically converts one side. This is **implicit conversion**.

```sql
SELECT '10' + 5 A, 10 || 5 B, '3' * '4' C FROM DUAL;
```

```text
         A B            C
---------- --- ----------
        15 105         12
```

- Facing an arithmetic operator, it converts strings to numbers (`'10' + 5 = 15`). Facing `||`, it converts numbers to strings (`10 || 5 = '105'`).
- Comparing a numeric column with a string (`WHERE EMPNO = '7839'`) converts the string side to a number and works normally.

Comparing a date column with a string is risky. When converting the string to a date, it uses the **session's NLS_DATE_FORMAT** as the basis.

```sql
SELECT ENAME, HIREDATE FROM EMP WHERE HIREDATE = '1981-12-03';
```

```text
ENAME      HIREDATE
---------- ----------
JAMES      1981-12-03
FORD       1981-12-03
```

Writing the same date in a different shape fails. `03-DEC-81` is a valid value in an environment where NLS_DATE_FORMAT is `DD-MON-RR`, but in this session (`YYYY-MM-DD`) it is an error.

```sql
SELECT ENAME FROM EMP WHERE HIREDATE = '03-DEC-81';
```

```text
SELECT ENAME FROM EMP WHERE HIREDATE = '03-DEC-81'
                                       *
ERROR at line 1:
ORA-01858: A non-numeric character was found instead of a numeric character.
```

> ⚠️ **If you rely on implicit conversion, the same SQL gives different results depending on the environment.** Write dates explicitly, as in the `DATE '1981-12-03'` literal or `TO_DATE('1981-12-03', 'YYYY-MM-DD')`. If the indexed column side gets converted, there is also a performance problem: the index can't be used.

| Category | Explicit conversion | Implicit conversion |
|------|------|------|
| Who converts | The user, with a function | The DB, automatically |
| Example | `TO_DATE('1981-12-03', 'YYYY-MM-DD')` | `HIREDATE = '1981-12-03'` |
| Result | Same regardless of environment | May vary with NLS settings |
| Recommendation | Recommended | Avoid |

Tomorrow covers NULL functions that replace NULL with another value, and CASE and DECODE, which pick a value based on conditions.

## 📖 Glossary

- **DATE type** : An Oracle type that holds both a date and a time (hours, minutes, seconds). The unit of arithmetic is 1 day.
- **Date literal** : A date constant written as `DATE 'YYYY-MM-DD'`. Interpreted regardless of NLS settings.
- **SYSDATE** : A function that returns the DB server's current date and time.
- **NLS settings** : Session settings that vary by country and language, such as date display format, weekday language, and currency symbol.
- **Format model** : A string that describes the shape to convert to, such as `'YYYY-MM-DD'` or `'9,999'`.
- **Explicit conversion** : The user changing types directly with `TO_CHAR`, `TO_DATE`, or `TO_NUMBER`.
- **Implicit conversion** : The DB matching types on its own when it meets values of different types.

## 📝 Practice Questions

**Question 1.** When the session's date display format is `YYYY-MM-DD`, which is the correct result of the following SQL?

```sql
SELECT ADD_MONTHS(DATE '2026-01-31', 1) FROM DUAL;
```

A) 2026-03-02  
B) 2026-03-03  
C) An error occurs  
D) 2026-02-28  

**Answer: D**  
Explanation: When the resulting month has no such day, `ADD_MONTHS` returns the last day of that month. February 2026 has no 31st, so it becomes February 28. It does not simply add 31 days, so it doesn't spill into March, and no error occurs.

---

**Question 2.** Which of the following date operations causes an error in Oracle?

A) Date + number  
B) Date + date  
C) Date − date  
D) Date − number  

**Answer: B**  
Explanation: Date ± number gives a date that many days later or earlier, and date − date gives the number of days between the two dates. Adding dates together is meaningless, so it causes ORA-00975 (date + date not allowed).

---

**Question 3.** Which is the correct result of the following SQL?

```sql
SELECT MONTHS_BETWEEN(DATE '2026-08-03', DATE '2026-11-03') FROM DUAL;
```

A) 3  
B) 90  
C) -3  
D) -92  

**Answer: C**  
Explanation: `MONTHS_BETWEEN(d1, d2)` returns d1 − d2 in months. The first date is 3 months earlier, so it is -3. 90 and -92 are wrong answers from thinking in days; the month count is not converted to days.

---

**Question 4.** When the session's date display format is `YYYY-MM-DD`, which is the correct result of the following SQL?

```sql
SELECT ROUND(DATE '2026-11-18', 'MM') FROM DUAL;
```

A) 2026-12-01  
B) 2026-11-01  
C) 2026-11-30  
D) 2026-11-18  

**Answer: A**  
Explanation: Month-level `ROUND` goes to the 1st of that month for days 1–15 and to the 1st of the next month from the 16th. The 18th is after the 16th, so the result is 2026-12-01. 2026-11-01 is the result of `TRUNC(DATE '2026-11-18', 'MM')`, and 2026-11-30 is the result of `LAST_DAY`.

---

**Question 5.** Which of the following is the explicit conversion function that turns the string `'2026-11-03'` into a date type?

A) TO_CHAR  
B) TO_NUMBER  
C) EXTRACT  
D) TO_DATE  

**Answer: D**  
Explanation: The function that converts a string to a date is `TO_DATE`, which takes the input shape as a format, as in `TO_DATE('2026-11-03', 'YYYY-MM-DD')`. `TO_CHAR` converts dates and numbers to strings, and `TO_NUMBER` converts strings to numbers. `EXTRACT` is a date function that pulls the year, month, or day out of a date as a number.
