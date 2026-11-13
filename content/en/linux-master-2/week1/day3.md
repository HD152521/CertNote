# Day 3 - Free Software and Open Source: What a License Decides

## 📌 Key Takeaways

- **The "free" in free software means "freedom," not "no cost."** It is defined by **four freedoms**: run, study, distribute, and improve.
- The **FSF** (Free Software Foundation) emphasizes freedom, while the **OSI** (Open Source Initiative) emphasizes the practicality of the development method.
- Licenses fall broadly into **copyleft** (GPL family) and **permissive** (BSD, MIT, Apache).
- **The GPL is viral.** If you use GPL code, you must release the result under the GPL too.
- The **LGPL** softens that virality by making an exception when you only link against a library.

## The Four Freedoms of Free Software

This is the standard defined by Richard Stallman. A distinguishing feature is that the numbering **starts from 0**.

| Number | Freedom |
|------|------|
| Freedom 0 | The freedom to **run** it for any purpose |
| Freedom 1 | The freedom to **study and modify** how it works (requires access to the source code) |
| Freedom 2 | The freedom to **redistribute** copies |
| Freedom 3 | The freedom to **distribute your improved versions** |

- A common misconception: "free software = gratis" is **not** correct.
- The confusion arises because the English word "free" means both "no cost" and "freedom," so the FSF explains it as *"free as in free speech, not as in free beer."*
- **Selling it for money does not violate free software either.** However, you must guarantee the four freedoms above to the buyer.

## FSF and OSI: Same Code, Different Emphasis

| Category | Free software (FSF) | Open source (OSI) |
|------|---------------------|---------------|
| Founded | 1985, Richard Stallman | 1998 |
| Core value | **User freedom** (ethics, philosophy) | **Superiority of the development method** (pragmatism) |
| Term | Free Software | Open Source |
| Representative license | GPL | Varied (including BSD, MIT, Apache, etc.) |

- The lists of licenses recognized by the two camps **overlap almost entirely.** Only the emphasis differs.
- Together they are called **FOSS** or **FLOSS** (Free/Libre and Open Source Software).

### The Open Source Definition (OSD)

- The OSI was created in 1998 with **Eric Raymond** and **Bruce Perens** at the center. To ease the aversion the word "free" provoked in businesses, they put forward the name **open source**.
- The OSI has the **OSD (Open Source Definition)**, the criteria for judging which licenses are open source. It consists of 10 clauses based on the **Debian Free Software Guidelines**.

| Number | Clause | In plain words |
|------|------|----------|
| 1 | Free redistribution | Doesn't prevent selling or giving it away |
| 2 | Source code | Source must be included or easily obtainable |
| 3 | Derived works | Modified versions must be distributable under the same terms |
| 4 | Integrity of the author's source code | May require modified versions to carry a different name or version |
| 5 | No discrimination against persons or groups | Can't set conditions saying certain people can't use it |
| 6 | No discrimination against fields of endeavor | Can't impose limits like "no commercial use" or "research only" |
| 7 | Distribution of license | The same rights follow to everyone who receives it |
| 8 | License must not be specific to a product | It must not be valid only when included in a particular distribution |
| 9 | License must not restrict other software | Doesn't force conditions on other programs distributed alongside |
| 10 | License must be technology-neutral | Doesn't presuppose a specific technology or interface |

> ⚠️ **Trap**: Because of clauses 5 and 6, **software that is "usable for non-profit purposes only" is not open source.** The same holds even if the source is published. It is wrong to jump to "source published = open source."

## Similarly Named Software Categories

Not everything labeled "free" is the same. **Whether the source is published** and **whether you pay** are independent axes.

| Category | Source code | Price | Key point |
|------|----------|------|------|
| **Commercial (proprietary) software** | Closed | Paid | You buy only a right to use. No modification or redistribution |
| **Shareware** | Closed | Free for a limited period or limited features | Try it, and pay if you want to keep using it |
| **Freeware** | Closed | Free | Costs nothing, but **you have no right to modify or redistribute** |
| **Public domain** | No restrictions | Free | **Copyright has been waived** or has expired. No conditions at all |
| **Free / open source software** | **Published** | Can be free or paid | Copyright remains alive, and you must follow the **license terms** |

- **Freeware ≠ free software.** Freeware merely costs zero; it lacks the four freedoms.
- **Public domain ≠ open source.** Open source is permission granted by the copyright holder who keeps the rights and attaches conditions, while public domain has no conditions to attach in the first place.

## The Two Branches of Licenses

```text
                    Open source licenses
                            │
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
      Copyleft                            Permissive
   (copyleft, viral)                  (permissive, lenient)
          │                                   │
   ┌──────┴──────┐                    ┌───────┼───────┐
   ▼             ▼                    ▼       ▼       ▼
  GPL          LGPL                 BSD     MIT    Apache
 (strong       (weak
  copyleft)     copyleft)
```

### Copyleft — The GPL Family

- **Core rule**: When you **distribute** a work that uses GPL code, that work must also be released with source under the GPL.
- This property is called **viral**. It is **copyleft** in the sense that it flips copyright.
- Note: the obligation arises **only when you distribute.** If you use it only inside a company and don't distribute it, there is no obligation to release.

| License | Feature |
|---------|------|
| **GPL v2** | The license the Linux kernel uses |
| **GPL v3** | Adds a patent clause and a clause preventing **hardware locking (Tivoization)** |
| **LGPL** | If you only **link** a library, you don't have to release your own code |
| **AGPL** | The source-release obligation arises even if you only provide a service over the network |

### Permissive — BSD, MIT, Apache

- **There are almost no conditions.** As long as you keep the copyright notice, you can put it into a commercial product and keep the source closed.

| License | Feature |
|---------|------|
| **BSD** | Just keep the copyright notice. Very simple |
| **MIT** | Practically identical to BSD. The shortest and widely used |
| **Apache 2.0** | Copyright notice + a clause **explicitly granting patent rights** |
| **MPL** | File-level copyleft. You only need to release the **files** you modified |

> The exam has questions asking about "the obligations when selling a modified program distributed under the GPL." The answer is that **selling itself is allowed, but you must release the source code along with it**.

## License Comparison at a Glance

| License | Release source when distributing modifications | Combining with closed programs | Patent clause | Representative software |
|---------|--------------------------|-------------------|----------|-------------------|
| **GPL v2** | **Required** | The whole combined work becomes GPL | No explicit clause | Linux kernel |
| **GPL v3** | **Required** | The whole combined work becomes GPL | Yes | GCC, bash |
| **LGPL** | Only the parts of the library you modified | **Linking is allowed** | Depends on version | glibc (GNU C Library) |
| **AGPL** | Required + **also for network services** | The whole combined work becomes AGPL | Yes | — |
| **MPL** | **Only the modified files** | Allowed | Yes | Firefox |
| **BSD** | Not required | Allowed | No | FreeBSD |
| **MIT** | Not required | Allowed | No | X Window System |
| **Apache 2.0** | Not required | Allowed | **Yes** | Apache web server, Android (mostly) |

- Reading the table from top to bottom goes **from strongest conditions to weakest.** The GPL and AGPL are the strongest, and BSD and MIT the weakest.
- **Where Apache departs from BSD and MIT is patents.** It includes a sentence in which contributors license their patents to users, and modified files must also state **the fact that they were modified**.
- BSD originally had an **advertising clause** requiring "mention the University of California, Berkeley in ads for products that use this software" (4-clause BSD). The version without this clause is the **3-clause and 2-clause BSD** commonly used today.

### What the GPL Actually Requires

When you **hand over** a GPL program (or a modified version of it) **to others**, what you must do boils down to four things.

1. **Provide the source code along with it**, or attach in writing a promise to provide it on request.
2. Provide the **full GPL text (a copy of the license)** along with it.
3. Don't remove the original **copyright notices**.
4. **Don't impose additional restrictions** on recipients — you can't add conditions like "no redistribution."

| Version | Released | What to remember |
|------|------|----------|
| GPL v1 | 1989 | The first version |
| GPL v2 | 1991 | Adopted by the Linux kernel. Used widely for the longest time |
| GPL v3 | 2007 | Added a patent clause and anti-Tivoization |

> 🔍 **Going deeper**: **Tivoization** comes from the digital video recorder company TiVo. TiVo released the Linux kernel source as the GPL requires, but made its devices **refuse to run software lacking the manufacturer's signature**. A situation where you got the source but couldn't run your modified version — GPL v3 added a clause to prevent this, and the Linux kernel did not agree to that change, so it **stayed at v2.**

### Judging by Situation

| Situation | Source-release obligation |
|------|--------------|
| You modify a GPL program and use it **only in-house** | None — it isn't distribution |
| You modify a GPL program and **sell it to customers** | Yes — you must give the source to the buyer |
| You **embed** GPL code in your program and distribute it | Yes — your whole program becomes GPL |
| You distribute a program that **only links** an LGPL library | None for your code (but yes for the library part if you modified it) |
| You modify an AGPL program and offer it **only as a web service** | Yes — you must release to users even without distributing |
| You embed MIT/BSD code and sell a commercial product | None — just keep the copyright notice and license text |

- Companies sometimes offer **both the GPL and a commercial license** (dual licensing). Customers who find the GPL terms burdensome pay for a commercial license. MySQL is the classic example.

## Commonly Confused Pairs

| Question | Answer |
|------|-----|
| Is free software gratis? | No. Selling it for a fee is also possible |
| Can you sell a GPL program? | Yes. But you must release the source |
| If you use it only in-house, must you release it? | No. Without distribution there is no obligation |
| Can you put BSD code in a commercial product? | Yes. Just keep the copyright notice |
| What is the Linux kernel's license? | **GPL v2** |

> Tomorrow we look at the unit that bundles this kernel and these tools together for sale — the distribution.

## 📖 Glossary

- **Free software** : Software that guarantees the four freedoms of running, studying, redistributing, and improving.
- **FSF** : The Free Software Foundation. Founded by Richard Stallman in 1985.
- **OSI** : The Open Source Initiative. Founded in 1998, it emphasizes the practicality of the development method.
- **Copyleft** : A licensing approach that enforces the same freedoms on derived works. The GPL is the classic example.
- **Permissive** : A lenient license with almost no conditions. BSD and MIT are the classic examples.
- **GPL** : The GNU General Public License. The Linux kernel follows GPL v2.
- **LGPL** : The GPL for libraries. It exempts you from the source-release obligation when you only link.
- **FOSS/FLOSS** : A term covering both free software and open source.
- **Freeware** : Software that can be used for free but whose source is not published and that carries no right to modify or redistribute.
- **Public domain** : A state in which copyright has been waived or has expired and the work can be used with no conditions.

## 📝 Practice Questions

**Question 1.** Which of the following is the license adopted by the Linux kernel?

A) BSD  
B) MIT  
C) GPL v2  
D) Apache 2.0  

**Answer: C**  
Explanation: The Linux kernel follows GPL version 2. At its first release in 1991 it had its own license, but it switched to the GPL the following year, which became the trigger that drew in developers worldwide. It did not move to GPL v3.

---

**Question 2.** Which of the following correctly describes free software?

A) It must be distributed free of charge  
B) It does not need to publish its source code  
C) The freedoms to run, study, redistribute, and improve are guaranteed  
D) Commercial use is entirely prohibited  

**Answer: C**  
Explanation: The "free" in free software refers to the user's rights, not the price. It is defined by four freedoms: Freedom 0 (run), Freedom 1 (study and modify), Freedom 2 (redistribute), and Freedom 3 (distribute improved versions), and selling it for a fee or commercial use is allowed as long as these freedoms are guaranteed.

---

**Question 3.** Which of the following best describes the GPL license?

A) Derived works must also be released under the same license  
B) As long as you keep the copyright notice, you don't need to release the source  
C) It can be used only for academic purposes  
D) Modification itself is prohibited  

**Answer: A**  
Explanation: The GPL is a copyleft license: when you distribute a work that uses GPL code, that work must also be released with source under the GPL. This is called virality. Requiring only a copyright notice is a feature of permissive licenses like BSD and MIT.

---

**Question 4.** Which of the following is the license that relaxes the rules so that you don't have to release your own source code when you link and use a library?

A) AGPL  
B) LGPL  
C) GPL v3  
D) MPL  

**Answer: B**  
Explanation: The LGPL (Lesser GPL) is a license made for using libraries; a program that only links the library in question doesn't have to release its source. The AGPL, on the contrary, extends the release obligation to providing network services, and the MPL requires release only at the level of the modified files.

---

**Question 5.** Which of the following groups consists of permissive licenses?

A) GPL, LGPL, AGPL  
B) AGPL, MPL, LGPL  
C) GPL v2, GPL v3  
D) BSD, MIT, Apache  

**Answer: D**  
Explanation: Permissive licenses demand only minimal conditions such as a copyright notice, and you may include the code in a commercial product without releasing the source. BSD, MIT, and Apache are the classic examples. The GPL family (GPL, LGPL, AGPL) and the MPL all have a copyleft character, though to differing degrees.
