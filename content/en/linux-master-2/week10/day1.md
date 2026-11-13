# Day 1 - The Web and Mail

## 📌 Key Takeaways

- The web runs on **HTTP (80)**, and the encrypted version is **HTTPS (443)**.
- The two leading Linux web servers are **Apache** and **Nginx**.
- There are three mail protocols — **SMTP (25) to send**, **POP3 (110) or IMAP (143) to receive**.
- **Mail servers exchanging mail with each other also use SMTP.** Exam questions test this point.
- **POP3 downloads and deletes; IMAP leaves mail on the server.** If you use multiple devices, it is IMAP.

## The Web

| Item | Description |
|------|------|
| **WWW** | World Wide Web. Devised in 1989 by **Tim Berners-Lee** (CERN) |
| **HTTP** | HyperText Transfer Protocol. **Port 80** |
| **HTTPS** | HTTP + encryption (SSL/TLS). **Port 443** |
| **HTML** | A language for describing documents |
| **URL** | An address that indicates the location of a resource |

### Reading a URL

```text
   https :// www.example.com : 443 /docs/index.html
     │            │             │        │
     │            │             │        └── Path
     │            │             └─────────── Port (default if omitted)
     │            └───────────────────────── Host name
     └────────────────────────────────────── Protocol (scheme)
```

- **If you omit the port, the scheme's default is used.** `http://` means 80 and `https://` means 443. So `https://www.example.com:443/` and `https://www.example.com/` are the same address.
- A server that uses a non-default port must have it written explicitly — `http://192.168.0.10:8080/`.
- The scheme slot is not limited to `http`. It is where you state **how to access the resource**, as in `ftp://` or `mailto:`.

### What HTTP Exchanges

HTTP has a simple structure: **the browser makes a request and the server sends a response.** One request gets one response.

```text
   [Request]   GET /docs/index.html HTTP/1.1
               Host: www.example.com

   [Response]  HTTP/1.1 200 OK
               Content-Type: text/html

               <html> … </html>
```

| Request method | What it does |
|---------------|--------|
| **GET** | **Fetches** a resource. Typing a URL into the address bar is this |
| **POST** | **Sends** data. Submitting a login or post-writing form |
| HEAD | Receives only the headers, without the body |
| PUT / DELETE | Uploads a resource / deletes it |

| Status code | Meaning | Typical |
|---------|-----|------|
| **2xx** | **Success** | **200** OK |
| **3xx** | **Redirect** to another address | 301, 302 |
| **4xx** | The **requester's (client's)** fault | 403 Forbidden, **404** Not Found |
| **5xx** | An error on the **server** side | **500** Internal Server Error, 503 Service Unavailable |

- **Just look at the first digit to know who is at fault.** If it starts with 4, the request was wrong; if it starts with 5, the server is broken. 404 means "the server is fine, but there is no such document."
- HTTP **does not remember state (it is stateless).** The server cannot tell whether the person who just made a request is the same as the one making a request now. The mechanism added to keep a login state going is the **cookie**.
- HTTPS **encrypts this whole conversation**. The format of what is exchanged is the same as HTTP, with an SSL/TLS encryption layer inserted beneath it.

### Web Servers and Browsers

| Category | Names |
|------|------|
| **Web server** | **Apache** (the oldest standard), **Nginx** (light and fast), lighttpd |
| **Graphical browser** | Firefox, Chrome, Konqueror (KDE) |
| **Text browser** | **Lynx**, w3m, links |

- **Lynx is a text-based browser**. It is used to view the web from the command line without a graphical environment. Its name shows up in the answer choices.
- To download files from the command line, use **`wget`** or **`curl`**.

```bash
wget http://www.example.com/file.tar.gz      # Saves as file.tar.gz in the current directory
wget -c http://www.example.com/file.tar.gz   # Resumes an interrupted download
curl http://www.example.com/                 # Prints the received content to the screen (standard output)
curl -O http://www.example.com/file.tar.gz   # Saves under the original file name
```

- **`wget` defaults to "save to a file", while `curl` defaults to "print to the screen"**. To save with `curl`, give it `-O` (uppercase) or `-o filename`.
- The **daemon name of the Apache web server is `httpd`** (on Debian-family systems it is `apache2`). The product name and the process name differ, which causes confusion when searching with `ps`.

A question asking you to pick "what is **not** a web browser" tests **how program names are classified**. It is mixed with the application programs we saw last week under X Window.

| Name | What it is |
|------|------|
| Firefox · Chrome · Chromium · Opera | **Graphical web browsers** |
| Konqueror | KDE's web browser and file manager |
| Epiphany | GNOME's web browser |
| **Lynx** · w3m · links | **Text web browsers** |
| Thunderbird · Evolution | Not web browsers but **mail programs** |
| Apache · Nginx | Not browsers but **web servers** |

- **Firefox and Thunderbird both come from Mozilla**, but one is a browser and the other is a mail program.
- Answer choices that **swap server and client** are also common. Apache is the side that **serves** documents, and Firefox is the side that **receives and displays** them.

## The Three Mail Protocols

```text
   [Sender]                                         [Recipient]

     Mail program                                    Mail program
          │                                              ▲
          │ SMTP                                  POP3 / IMAP
          ▼                                              │
     Outgoing mail server ──── SMTP ────► Incoming mail server ──┘
                        (server-to-server delivery is also SMTP)
```

| Protocol | Port | What it does |
|---------|-----|--------|
| **SMTP** | **25** | **Sends mail.** Also handles server-to-server delivery |
| **POP3** | **110** | **Downloads** mail |
| **IMAP** | **143** | Views mail **while keeping it on the server** |

> **"Which protocol exchanges mail between mail servers?"** → **SMTP**. Receiving is POP3 and IMAP, but the key point is that **what servers exchange with each other is SMTP**.

- Abbreviation expansions also come up — **SMTP is Simple Mail Transfer Protocol**, **POP is Post Office Protocol**, and **IMAP is Internet Message Access Protocol**.

### The Path of One Email

This is the process of `alice@example.com` sending mail to `bob@example.org`.

```text
   1  alice's mail program hands it to the example.com mail server           SMTP
   2  The example.com server asks DNS "where is example.org's mail server?"
   3  It delivers to the example.org mail server it found                    SMTP
   4  The example.org server puts it in bob's mailbox
   5  bob opens his mail program and fetches the mail from the mailbox   POP3 or IMAP
```

- A mail address is **`user@domain`**. The domain after `@` determines **which server to send to**, and the name before it determines **whose mailbox on that server**.
- **Steps 1 and 3 are both SMTP.** Whether the user hands it to a server or a server hands it to another server, all the "pushing" is done by SMTP.
- **Only step 5 goes the other way.** Mail does not arrive at bob's computer by itself. It waits in the mailbox on the server, and bob has to **go and get it**. This "fetching" is POP3 and IMAP.
- Step 4 is why you can send mail even when the recipient's computer is off. The server receives and keeps it on their behalf.

| If the sentence says | Answer |
|---------------------|-----|
| **Send** mail, outgoing, transfer or exchange **between** servers | **SMTP** |
| **Fetch** mail, delete from the server after downloading | **POP3** |
| Read while **keeping it on the server**, multiple devices, folder sync | **IMAP** |
| Attachments, non-English text, putting images in mail | **MIME** |

### POP3 and IMAP

| Item | **POP3** | **IMAP** |
|------|---------|---------|
| Where it is stored | **Downloaded to my computer** | **Stays on the server** |
| Original on the server | Usually **deleted** | **Kept** |
| Multiple devices | Not synchronized | **Same state on every device** |
| Offline | Good for reading | Needs a connection |
| Port | **110** | **143** |

- **To view the same mailbox on a phone and a PC, use IMAP**. If the PC downloads it with POP3, it disappears from the phone.
- The encrypted versions are POP3S (995) and IMAPS (993).
- POP3's "delete" is only the **default behavior**. If you turn on "leave a copy on the server" in the mail program, you can keep it. Even so, it differs from IMAP in that **read marks and folder organization remain only on that device**.
- IMAP keeps **not just the mail body but also its state on the server**. A mail read on the phone shows as read on the PC too, and deleting on one side removes it on the other.

| Protocol | Plaintext port | Encrypted port |
|---------|---------|-----------|
| HTTP | **80** | **443** (HTTPS) |
| SMTP | **25** | 465 (SMTPS) |
| POP3 | **110** | 995 (POP3S) |
| IMAP | **143** | 993 (IMAPS) |

- The **S at the end of the name is Secure**. It is the same protocol with SSL/TLS encryption layered on, so it is assigned a **separate port number**.
- Answer choices that **swap 110 and 143** are the most common. Remember the three mail ports in the order **25 → 110 → 143** together with **send → download → keep on server and view**, in one line.

## Components of a Mail System

| Abbreviation | Full name | What it does | Examples |
|-----|-------|--------|-----|
| **MUA** | Mail **User** Agent | **The program the user works with** | Thunderbird, Outlook, mutt |
| **MTA** | Mail **Transfer** Agent | **Server-to-server delivery** | **Sendmail, Postfix**, qmail, exim |
| **MDA** | Mail **Delivery** Agent | **Delivers** to the mailbox | procmail, Dovecot |

```text
   MUA ──► MTA ──── SMTP ────► MTA ──► MDA ──► Mailbox ──► MUA
   (Compose) (Send)            (Receive) (Deliver)        (Read)
```

- **U is User, T is Transfer, D is Delivery** — look at the middle word to tell them apart.
- **Sendmail and Postfix being the leading MTAs** is within the exam scope.
- **MIME** (Multipurpose Internet Mail Extensions) is a specification that lets mail carry **non-English text, images, and attachments**. Originally, mail could only send English text.
- MIME is **not a protocol but a format for writing the content of mail**. If a question puts it on a line with SMTP, POP3, and IMAP and asks "which is not a protocol that transfers mail," the answer is MIME.

### Slotting Program Names into Roles

| Role | Programs |
|------|---------|
| **MUA** — programs the user reads and writes with | Thunderbird · Evolution · KMail · mutt · the `mail` command |
| **MTA** — server-to-server transfer (SMTP) | **Sendmail · Postfix** · qmail · Exim |
| **MDA** — mailbox delivery | procmail |
| POP3·IMAP server — lets the user fetch mail | **Dovecot** |

- **Sendmail, Postfix, qmail, and Exim are all MTAs.** Questions slip Thunderbird (an MUA) or Dovecot (the fetching side) in among them and ask you to pick "what is not an MTA."
- **Pairing protocols with roles**: MTA ↔ SMTP, POP3·IMAP server ↔ POP3·IMAP. An MUA uses **both**: SMTP to send, POP3·IMAP to receive.
- Depending on the book, Dovecot is grouped under MDA, or separated out as a server that lets users fetch mail. Either way, they agree that it **is not an MTA**.
- A mailbox is a file on the server. Traditionally it accumulates in **`/var/spool/mail/username`**, and depending on the distribution the path may also appear as `/var/mail`.

| Symptom | Where to look |
|------|--------|
| Sending works but only receiving fails | **POP3·IMAP** settings (incoming server, 110·143) |
| Receiving works but only sending fails | **SMTP** settings (outgoing server, 25) |
| Mail checked on the PC disappeared from the phone | The PC downloaded it via **POP3** and deleted it from the server |
| The web works but only `https://` does not | Port **443** is blocked |

> Tomorrow we cover DNS, which converts domain names to IPs.

## 📖 Glossary

- **HTTP / HTTPS** : The web communication protocol / the web communication protocol with encryption applied. The ports are 80 and 443.
- **URL** : The address of a resource, made up of protocol, host, port, and path.
- **Apache / Nginx** : The most widely used web servers on Linux.
- **SMTP** : The protocol that sends mail and relays it between servers. The port is 25.
- **POP3** : The protocol that downloads mail. The original on the server is usually deleted. The port is 110.
- **IMAP** : The protocol that views mail while leaving it on the server. The port is 143.
- **MUA / MTA / MDA** : The components responsible for the user program / server-to-server transfer / mailbox delivery.
- **MIME** : An extension specification that lets mail carry non-English text and attachments.

## 📝 Practice Questions

**Question 1.** Which protocol is used to exchange mail between mail servers?

A) SMTP  
B) POP3  
C) IMAP  
D) HTTP  

**Answer: A**  
Explanation: SMTP is used not only when a user sends mail but also when mail servers relay mail to each other. POP3 and IMAP are used by users to fetch or view mail that has arrived on the server, so they are not used for server-to-server transfer.

---

**Question 2.** Which protocol lets you keep mail on the server and check it in the same state from multiple devices?

A) SMTP  
B) POP3  
C) IMAP  
D) MIME  

**Answer: C**  
Explanation: IMAP views mail while keeping it on the server, so read marks and the folder structure stay the same whether you connect from a phone or a PC. POP3 by default deletes mail from the server after downloading it, so devices are not synchronized.

---

**Question 3.** What is the default port number used by HTTPS?

A) 80  
B) 443  
C) 8080  
D) 25  

**Answer: B**  
Explanation: HTTPS is HTTP plus SSL/TLS encryption, and it uses port 443. Unencrypted HTTP uses port 80, and port 25 belongs to SMTP, used for sending mail.

---

**Question 4.** Which component of a mail system is responsible for server-to-server mail transfer?

A) MUA  
B) MDA  
C) MIME  
D) MTA  

**Answer: D**  
Explanation: MTA stands for Mail Transfer Agent; it handles transfer between mail servers, and Sendmail and Postfix are the leading examples. An MUA is the mail program the user works with directly, and an MDA is the component that delivers arrived mail to the mailbox.

---

**Question 5.** Which of the following is a text-based web browser?

A) Lynx  
B) Firefox  
C) Konqueror  
D) Chrome  

**Answer: A**  
Explanation: Lynx is a text-based browser that lets you view web documents in a terminal without a graphical environment. Firefox, Chrome, and Konqueror are all browsers that run in a graphical environment, and Konqueror is included in the KDE desktop environment.
