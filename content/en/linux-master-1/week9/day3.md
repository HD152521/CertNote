# Day 3 - Apache Web Server: Everything About httpd.conf and Virtual Hosts

## 📌 Key Takeaways

- Configuring a web server is the job of declaring, through directives, **"which request, to which file, shown to whom"**.
- Grasp just three axes and httpd.conf becomes readable — **`DocumentRoot` (file location) · `<Directory>` (access permissions) · `<VirtualHost>` (per-site branching)**.
- Virtual hosts divide into **name-based** (distinguished by the Host header, many sites on one IP) and **IP-based** (one IP per site). HTTP/1.1 making the Host header mandatory made name-based the standard.
- Three security items: **lower privileges with `User apache`**, **turn off `Options Indexes`** in production, and use **Apache 2.4's `Require` syntax** (2.2 uses `Order`/`Allow`).
- After changing the configuration, **always check the syntax with `httpd -t` and then restart**. The virtual host list is `httpd -S`, modules are `httpd -M`.

## Installing Apache and Its Directory Structure

- On the RHEL/CentOS family, Apache's **package and daemon names are both `httpd`** (the Debian family uses `apache2`).

```bash
# Install
yum install httpd

# Daemon control
systemctl start httpd
systemctl enable httpd          # Auto-start at boot
systemctl status httpd

# Config syntax check (a must before restarting!)
httpd -t                        # Confirm Syntax OK
apachectl configtest            # Same

# Check the list of applied virtual hosts
httpd -S
```

| Path | Role |
|------|------|
| `/etc/httpd/conf/httpd.conf` | Main configuration file |
| `/etc/httpd/conf.d/` | Directory for keeping additional config (virtual hosts, etc.) separate |
| `/etc/httpd/conf.modules.d/` | Module loading configuration |
| `/var/www/html/` | Default DocumentRoot (web document root) |
| `/var/log/httpd/` | access_log, error_log |

Thanks to `Include conf.d/*.conf` inside `httpd.conf`, virtual hosts and extra config can be split into files in `conf.d/` instead of being crammed into the main file. Keep the main config clean and put per-site config in separate files — this is the structure recommended in production. If you changed the configuration, you must check the syntax with `httpd -t` before restarting, so that a single typo does not bring down the whole server.

## Core httpd.conf Directives

- The unit of Apache configuration is the **directive**. The practical exam asks the role of each directive as a short answer.

```apache
ServerRoot "/etc/httpd"          # Base directory of the Apache installation
Listen 80                        # Listening port (443 is HTTPS)
ServerName www.example.com:80    # The server's canonical name and port
DocumentRoot "/var/www/html"     # Top-level directory where web documents are placed
DirectoryIndex index.html index.php   # Default file to show on a directory request
ServerAdmin admin@example.com    # Admin email shown on error pages

User apache                      # User the daemon runs as
Group apache                     # Group the daemon runs as

ErrorLog "logs/error_log"        # Error log path
CustomLog "logs/access_log" combined   # Access log path and format
LogLevel warn                    # Log verbosity level
```

| Directive | Role |
|--------|------|
| `Listen` | Port Apache waits on (default 80, HTTPS 443) |
| `ServerName` | The server's canonical hostname. Used for virtual host matching |
| `DocumentRoot` | Actual file path corresponding to the URL root (`/`) |
| `DirectoryIndex` | Default document to show when only a directory is requested |
| `ServerRoot` | Base path for configuration, logs, and modules |
| `User` / `Group` | Run as a dedicated non-root account for security |
| `LogLevel` | Log detail level (debug/info/warn/error, etc.) |

Apache starts with root privileges and opens port 80 (only root can bind ports below 1024), then drops down to the low-privilege `apache` account (privilege drop) to handle the actual requests. That is why the `User apache`/`Group apache` settings are the heart of security — even if the web application is breached, it only runs as a restricted non-root account, so the damage scope shrinks. Leaving `User root` is a serious security mistake.

## The Directory Block — Per-Directory Access Control

- Permissions and options for a specific directory are specified with a **`<Directory>` block**.

```apache
<Directory "/var/www/html">
    Options Indexes FollowSymLinks    # Directory feature options
    AllowOverride None                # Scope allowed for .htaccess
    Require all granted               # Allow access (2.4 syntax)
</Directory>
```

| Directive | Role |
|--------|------|
| `Options Indexes` | Automatically show a file listing when there is no index file |
| `Options FollowSymLinks` | Allow following symbolic links |
| `AllowOverride` | Scope in which `.htaccess` files may override configuration in that directory |
| `Require all granted` | Allow all access (Apache 2.4) |
| `Require all denied` | Block all access |

> ⚠️ **Trap**: Apache 2.2 and 2.4 have different access-control syntax. **2.2 uses `Order allow,deny` / `Allow from` / `Deny from`**, while **2.4 uses `Require all granted` / `Require ip ...`**. Also, leaving `Options Indexes` on creates a security problem in which the file list of a directory without index.html is exposed as-is — on production servers it is usually turned off. Another trap is that with `AllowOverride None`, .htaccess is ignored entirely.

## Virtual Hosts — Multiple Sites on One Server

- To serve `site-a.com` and `site-b.com` at the same time from a single physical server, use **virtual hosts**. There are two methods.

| Method | Distinguishing criterion | IPs needed | Use |
|------|-----------|-----------|------|
| Name-based | The request's Host header (domain name) | 1 IP for many sites | Most common |
| IP-based | The IP address connected to | 1 IP per site | Some HTTPS cases / when isolation is needed |

**Name-based virtual hosts** — distinguished by domain name on a single IP:

```apache
<VirtualHost *:80>
    ServerName www.site-a.com
    DocumentRoot "/var/www/site-a"
    ErrorLog "logs/site-a-error_log"
</VirtualHost>

<VirtualHost *:80>
    ServerName www.site-b.com
    DocumentRoot "/var/www/site-b"
    ErrorLog "logs/site-b-error_log"
</VirtualHost>
```

- Both listen on the same `*:80` (port 80 on all IPs).
- Apache separates sites by which `ServerName` the domain name in the HTTP **Host header** sent by the client matches.

**IP-based virtual hosts** — give the server several IPs and distinguish by IP:

```apache
<VirtualHost 192.168.1.10:80>
    ServerName www.site-a.com
    DocumentRoot "/var/www/site-a"
</VirtualHost>

<VirtualHost 192.168.1.20:80>
    ServerName www.site-b.com
    DocumentRoot "/var/www/site-b"
</VirtualHost>
```

Name-based virtual hosts are possible because, from HTTP/1.1, the **Host header** became mandatory in requests, so even when requests arrive on the same IP, "which domain is wanted" is carried inside the request. Thanks to this, hundreds of sites can run on one IP. If a request arrives unrelated to any domain (no matching ServerName), the **first defined VirtualHost** handles it by default.

In the early web (HTTP/1.0) there was no Host header, so running different sites on the same server meant buying a separate public IP for each site (IP-based). As IPv4 addresses began to run out, this was a big waste, and HTTP/1.1 made the Host header mandatory, making name-based virtual hosts the standard. That today's cloud can run countless sites without buying an IP per domain is a result of this change.

## Modules — Apache's Extension Structure

- Apache extends anything beyond its core features by plugging in **modules**.
- SSL, rewriting, PHP integration, and so on are all modules.

```apache
LoadModule rewrite_module modules/mod_rewrite.so   # URL rewriting
LoadModule ssl_module modules/mod_ssl.so           # HTTPS
```

```bash
# Check loaded modules
httpd -M
```

| Module | Role |
|------|------|
| `mod_ssl` | HTTPS (TLS) support |
| `mod_rewrite` | URL rewriting and redirects |
| `mod_proxy` | Reverse proxy and load balancing |
| `mod_dir` | DirectoryIndex handling |

Apache's operating model is determined by the **MPM (Multi-Processing Module)**. `prefork` spawns a process per request, which is stable but uses a lot of memory (the traditional PHP environment), while `worker`/`event` use threads and are efficient for concurrent connections. If a server has many concurrent connections and runs short of memory, choosing the MPM and tuning limits such as `MaxRequestWorkers` is the starting point of tuning.

## Logs — access_log and error_log

- Apache leaves **two core logs**.

```bash
# Access log: who requested what
tail -f /var/log/httpd/access_log
# Example: 192.168.1.5 - - [05/Jun/2026:10:00:00] "GET /index.html HTTP/1.1" 200 1024

# Error log: what went wrong
tail -f /var/log/httpd/error_log
```

- The access_log's **`combined` format** contains the client IP, time, request line, **response status code**, bytes sent, referrer, and browser info.
- The status code alone lets you tell **success (2xx), redirect (3xx), client error (4xx), and server error (5xx)** apart.

> ⚠️ **Trap**: `CustomLog` (or access_log) records every request, and `ErrorLog` records errors and diagnostic messages. A choice that mixes them up, such as "a 404 is left only in error_log, not access_log", is wrong — response codes like 404 are left in access_log as status codes, while configuration errors, module failures, and the like are left in error_log.

## Try It Yourself — Configuring and Verifying Apache

```bash
# 1. Create a default page
echo "<h1>Hello Apache</h1>" > /var/www/html/index.html

# 2. Check syntax, then start
httpd -t
systemctl restart httpd

# 3. Check the response locally
curl http://localhost/
curl -I http://localhost/         # Headers only (check the status code)

# 4. Check virtual host matching
httpd -S                          # List of defined VirtualHosts

# 5. Watch the log in real time
tail -f /var/log/httpd/access_log
```

- If you see the first line **`HTTP/1.1 200 OK`** returned by `curl -I`, it is working.
- To test virtual hosts, **specify the Host header**, as in `curl -H "Host: www.site-a.com" http://localhost/`, to see which site responds.

Tomorrow we move on to Nginx, another powerhouse web server, covering its event-driven architecture, the reverse proxy, and a comparison with Apache.

## 📖 Glossary

- **DocumentRoot** : The file system path the URL root (`/`) actually points to. The default is `/var/www/html`.
- **ServerRoot** : The base directory where configuration, logs, and modules are found. Easy to confuse with DocumentRoot.
- **DirectoryIndex** : The default document (index.html, etc.) shown instead when only a directory is requested.
- **`Include conf.d/*.conf`** : A structure that splits per-site configuration into separate files to keep the main configuration clean.
- **Privilege drop** : Opening port 80 as root and then dropping to the `apache` account to handle requests. Set by `User`/`Group`.
- **`Options Indexes`** : An option that exposes the directory listing as-is when there is no index file. Usually turned off in production.
- **`AllowOverride`** : The scope in which `.htaccess` can override configuration in that directory. With `None`, .htaccess is ignored.
- **`Require all granted` / `denied`** : Apache 2.4's allow / block access syntax. It replaced 2.2's `Order` and `Allow from`.
- **Virtual host (VirtualHost)** : A configuration block that branches and serves multiple sites from one server.
- **Host header** : A request header that became mandatory in HTTP/1.1. It carries "which domain is wanted" and makes name-based virtual hosts possible.
- **MPM (Multi-Processing Module)** : Apache's operating model. `prefork` is process-based, while `worker` and `event` are thread-based.
- **access_log vs error_log** : The log that records every request and response code / the log that records configuration errors and diagnostic messages.

## 📝 Practice Questions

**Question 1.** In Apache httpd.conf, which directive specifies the top-level directory where web documents are placed (the actual path corresponding to the URL root `/`)?

A) ServerRoot
B) DocumentRoot
C) DirectoryIndex
D) ServerName

**Answer: B**
Explanation: `DocumentRoot` specifies the actual file system path (`/var/www/html`) corresponding to the URL root. `ServerRoot` is the base directory of the Apache installation, `DirectoryIndex` is the default document, and `ServerName` is the server hostname.

---

**Question 2.** When serving several domains from a single IP address, what criterion does Apache use to decide which site to send a request to?

A) The client's MAC address
B) The HTTP request's Host header (domain name)
C) Only the port number connected to
D) DNS's SOA record

**Answer: B**
Explanation: Name-based virtual hosts separate sites by comparing the domain name in the HTTP Host header sent by the client with each VirtualHost's ServerName. This approach became possible because the Host header became mandatory in HTTP/1.1.

---

**Question 3.** Which command checks for syntax errors after modifying the Apache configuration and before restarting?

A) `httpd -S`
B) `httpd -M`
C) `httpd -t`
D) `httpd -v`

**Answer: C**
Explanation: `httpd -t` (or `apachectl configtest`) checks the syntax of the configuration files and prints `Syntax OK`. `-S` is the virtual host list, `-M` is the list of loaded modules, and `-v` is version info.

---

**Question 4.** What behavior occurs when `Options Indexes` is left on in a `<Directory>` block?

A) It follows symbolic links
B) If there is no index file, it automatically shows the directory's file listing
C) It allows .htaccess files
D) It blocks all access

**Answer: B**
Explanation: `Options Indexes` automatically exposes the directory's file listing when there is no DirectoryIndex file (index.html, etc.). For security it is usually turned off on production servers. Symbolic links are handled by `FollowSymLinks` and .htaccess by `AllowOverride`.

---

**Question 5.** Which of the following is correct about the difference between IP-based and name-based virtual hosts?

A) Name-based requires a separate IP for each site
B) IP-based distinguishes sites by the Host header
C) Name-based can serve several sites with a single IP
D) Both methods work only on HTTP/1.0

**Answer: C**
Explanation: Name-based distinguishes many sites on one IP by the Host header, so it saves IPs. IP-based needs an IP per site. Name-based works only because of HTTP/1.1's Host header.

---

**Question 6.** Which directive specifies that Apache starts as root and opens the port, then drops to a low-privilege account to handle actual requests?

A) `ServerAdmin`
B) `User` / `Group`
C) `Listen`
D) `LogLevel`

**Answer: B**
Explanation: `User apache` / `Group apache` specify the unprivileged account the daemon runs as. Root privileges are needed only while opening port 80, and after that request handling drops to low privileges, reducing the security damage scope. `ServerAdmin` is the admin email, `Listen` is the port, and `LogLevel` is the log verbosity.

---

**Question 7.** In Apache 2.4, which directive allows all access to a specific directory?

A) `Order allow,deny`
B) `Allow from all`
C) `Require all granted`
D) `Deny from none`

**Answer: C**
Explanation: Apache 2.4 uses the `Require all granted` (allow) / `Require all denied` (block) syntax. `Order allow,deny` and `Allow from` are old-version (2.2) syntax and do not work in 2.4 without the compatibility module.

---
