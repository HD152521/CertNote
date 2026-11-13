# Day 4 - Nginx and the Reverse Proxy: The Design of an Event-Driven Web Server

## 📌 Key Takeaways

- **Nginx configuration is nested blocks that narrow from the outside in** — `http` (global) → `server` (virtual host) → `location` (URL path). Inner blocks inherit from the outer ones and override only what is needed.
- Apache equivalents: **`listen` = Listen, `server_name` = ServerName, `root` = DocumentRoot, `index` = DirectoryIndex.**
- A **reverse proxy** defines a backend group with `upstream` and forwards to it with `proxy_pass`. It hides the backends, spreads the load, and handles TLS and caching in one place.
- The processing model is the essential difference — **Apache uses a process/thread per connection, while Nginx is event-driven and asynchronous with a few workers.** Nginx has no `.htaccess` and uses central configuration only.
- `nginx -t` (syntax check) → **`nginx -s reload` (zero-downtime reapply)**. Concurrent connections are `worker_processes × worker_connections`, but **bounded by the OS fd limit.**

## Installing Nginx and Its Directory Structure

```bash
# Install
yum install nginx

# Daemon control
systemctl start nginx
systemctl enable nginx

# Config syntax check (a must before restarting!)
nginx -t

# Zero-downtime config reapply (reload without dropping connections)
nginx -s reload
systemctl reload nginx
```

| Path | Role |
|------|------|
| `/etc/nginx/nginx.conf` | Main configuration file |
| `/etc/nginx/conf.d/` | Directory for separating per-site configuration |
| `/usr/share/nginx/html/` | Default document root |
| `/var/log/nginx/` | access.log, error.log |

`nginx -s reload` is a different kind of thing from an Apache restart. In Nginx, the master process starts new workers with the new configuration, and the old workers finish the requests they are handling and then exit. That is why a **zero-downtime reload that does not drop connections** is possible even after changing the configuration. This is a big advantage when applying configuration to a live service.

## nginx.conf — The Nested Block Structure

- The core of Nginx configuration is the **hierarchy of blocks (contexts)**.

```nginx
worker_processes auto;            # Number of worker processes (usually the CPU core count)

events {
    worker_connections 1024;      # Concurrent connections one worker handles
}

http {
    include       mime.types;     # MIME type definitions
    default_type  application/octet-stream;
    sendfile      on;             # Kernel-level file transfer (more efficient)
    keepalive_timeout 65;

    access_log /var/log/nginx/access.log;

    server {
        listen 80;                # Listening port
        server_name www.example.com;   # Virtual host name
        root /usr/share/nginx/html;    # Document root (Apache's DocumentRoot)
        index index.html;              # Default document

        location / {
            try_files $uri $uri/ =404;
        }

        location /images/ {       # Matches only requests starting with /images/
            root /data;           # → serves files from /data/images/
        }
    }
}
```

| Block | Scope | Main role |
|------|------|-----------|
| (main) | Global | Process-level settings such as `worker_processes` |
| `events` | Connection handling | `worker_connections` (concurrent connection limit) |
| `http` | All of HTTP | Common settings such as logs, MIME, sendfile |
| `server` | One virtual host | `listen`, `server_name`, `root` |
| `location` | URL path | Per-path handling (files, proxy, redirect) |

| Directive | Role |
|--------|------|
| `listen` | Listening port (Apache's Listen) |
| `server_name` | Virtual host domain (Apache's ServerName) |
| `root` | Document root (Apache's DocumentRoot) |
| `index` | Default document (Apache's DirectoryIndex) |
| `location` | Handling rules per URL path |
| `try_files` | Looks for files in order and, if none exist, takes the specified action (=404, etc.) |

`worker_processes auto` starts as many workers as there are CPU cores, and each worker handles `worker_connections` connections asynchronously. In theory the number of concurrently handled connections is roughly `worker_processes × worker_connections`. Compared with Apache (prefork) using one process per connection, Nginx handles tens of thousands of connections with a few workers — this is why Nginx is strong at static content and concurrent connections.

> ⚠️ **Trap**: If `server_name` matches none of several server blocks or is empty, Nginx uses **the first server block on that port or the block marked `default_server`** as the default. Also, `location` matching has a priority order — rules apply in the order exact match (`=`), prefix match, then regex (`~`), and mixing this up makes the wrong location handle the request.

## Reverse Proxy — Nginx's Signature Use

- **Reverse proxy**: an intermediary that receives client requests, forwards them to application servers (backends) behind it, and returns their responses.
- This is **the most widely used purpose** of Nginx.

```nginx
http {
    upstream backend {            # Define the backend server group
        server 127.0.0.1:8080;
        server 127.0.0.1:8081;    # With several machines, load is distributed automatically
    }

    server {
        listen 80;
        server_name www.example.com;

        location / {
            proxy_pass http://backend;              # Forward the request to the backend
            proxy_set_header Host $host;            # Preserve the original Host header
            proxy_set_header X-Real-IP $remote_addr; # Pass the real client IP
        }
    }
}
```

| Directive | Role |
|--------|------|
| `upstream` | Defines a backend server group (unit of load balancing) |
| `proxy_pass` | Forwards the matched request to the specified backend |
| `proxy_set_header` | Adds or preserves headers when forwarding to the backend |

```text
[Client] → [Nginx :80] → [App server :8080]
           (reverse proxy)   (does the real work)
```

A forward proxy is an intermediary that goes out **on behalf of the client** (for example, a proxy that filters internet access from inside a company). A reverse proxy is the opposite: it receives external requests **in front of the servers** and distributes them internally. The client does not know the backends exist and sees only Nginx. With this structure you hide the backends (security), spread the load across several machines (scaling), and handle TLS termination, caching, and compression in one place.

Nginx (pronounced "engine-x") was created in 2004 by Igor Sysoev to solve the C10K problem — handling 10,000 concurrent connections on one server. At that time, Apache's process/thread model grabbed resources per connection, and memory exploded at 10,000 connections. Nginx, with its event-driven asynchronous architecture, sustained far more connections on the same hardware, and thanks to this efficiency it spread explosively as a static server, reverse proxy, and load balancer. That is the background to why Nginx sits in front of almost every large site today.

## Load Balancing Methods

- When you put several servers in an `upstream`, Nginx splits requests among them. You can **specify the distribution method**.

```nginx
upstream backend {
    # Default: round robin (alternating in order)
    server 10.0.0.1;
    server 10.0.0.2;

    # least_conn;          # To the server with the fewest connections
    # ip_hash;             # The same client always goes to the same server (session persistence)
}
```

| Method | Behavior |
|------|------|
| Round robin (default) | Distributes alternately in order |
| `least_conn` | To the server with the fewest current connections |
| `ip_hash` | Maps to a fixed server by hashing the client IP (keeps sessions) |

## Web Logs and Tuning

- Nginx logs are also **two kinds, access and error**.

```bash
# Access log: requests and status codes
tail -f /var/log/nginx/access.log

# Error log
tail -f /var/log/nginx/error.log
```

- The core directives for performance tuning are as follows.

```nginx
http {
    sendfile on;              # Kernel sends files directly (fewer copies)
    tcp_nopush on;            # Gather packets before sending (more efficient)
    keepalive_timeout 65;     # How long connections are kept for reuse
    gzip on;                  # Compress responses to reduce transfer volume

    worker_rlimit_nofile 65535;   # Limit of file descriptors each worker can open
}
```

| Directive | Effect |
|--------|------|
| `sendfile on` | Sends files directly at the kernel level, saving CPU and memory |
| `gzip on` | Compresses responses to save bandwidth (effective for text) |
| `keepalive_timeout` | Reuses connections to cut handshake cost |
| `worker_connections` | Concurrent connection limit per worker (determines concurrency scale) |

> ⚠️ **Trap**: If there are many concurrent connections and connections are being refused, you should not simply raise `worker_processes`; you must raise `worker_connections` and the OS's file descriptor limit (`worker_rlimit_nofile`, `ulimit -n`) together. If you only grow one side, the other becomes the bottleneck. The concurrent connection limit is `worker_processes` × `worker_connections`, and it is bounded by the OS fd limit.

## Apache vs Nginx — The Essential Comparison

| Item | Apache | Nginx |
|------|--------|-------|
| Processing model | Process/thread (one per connection) | Event-driven asynchronous (few workers) |
| Concurrency efficiency | Average (uses much memory) | Very high |
| Static file serving | Average | Very fast |
| Dynamic processing | Built in via modules (mod_php, etc.) | Delegated to external processes (proxy) |
| Configuration unit | Directory + .htaccess | location blocks (no runtime .htaccess) |
| Per-directory distributed config | `.htaccess` supported | Not supported (central config only) |
| Typical use | Traditional web hosting | Reverse proxy, static serving, load balancer |

In practice, a setup that uses the two **together** is common. Nginx sits at the very front handling static files, TLS, and load balancing, and only dynamic requests are proxied to Apache (or an application server) behind it. It is a compromise that takes both Nginx's asynchronous efficiency and Apache's rich module ecosystem. Also, Nginx has no `.htaccess`, so per-directory distributed configuration is impossible — this is not a flaw but the result of a design philosophy: **managing all configuration centrally means it does not dig through directories on every request, so it is faster**.

## Try It Yourself — Configuring and Verifying Nginx

```bash
# 1. Syntax check
nginx -t

# 2. Zero-downtime reapply
nginx -s reload

# 3. Check the response
curl -I http://localhost/         # Check the status code
curl http://localhost/

# 4. Which server block / server version responds
curl -I http://localhost/ | grep -i server

# 5. Watch the log
tail -f /var/log/nginx/access.log
```

- Reverse proxy test: start a backend (e.g. `python3 -m http.server 8080`), set `proxy_pass http://127.0.0.1:8080;`, then connect to Nginx on port 80 and check **whether the backend response is relayed**.

Tomorrow we tie this week's DNS, DHCP, NTP, Apache, and Nginx together into one comprehensive review and check ourselves with practice questions.

## 📖 Glossary

- **C10K problem** : The challenge of handling 10,000 concurrent connections on one server. The reason Nginx was born.
- **Event loop** : A method in which a small number of workers handle many connections asynchronously by taking turns. It does not start a process per connection.
- **`worker_processes` / `worker_connections`** : The number of workers to start (usually the CPU core count) / the number of concurrent connections one worker can handle.
- **`http` / `server` / `location` blocks** : HTTP-wide settings / one virtual host / handling rules per URL path.
- **`try_files`** : A directive that looks for files in the specified order and, if all are missing, takes a set action (=404, etc.).
- **`default_server`** : Marks the default server block that receives requests when no `server_name` matches.
- **location matching priority** : Exact match (`=`) → prefix match → regex (`~`). If you get it mixed up, the wrong block handles the request.
- **Reverse proxy vs forward proxy** : Receives external requests in front of the server and distributes them internally / goes out to the outside on behalf of the client.
- **`upstream`** : A block that defines the group of backend servers to split load across.
- **`proxy_set_header`** : A directive that puts information such as the original Host or the real client IP into headers when passing to the backend.
- **`ip_hash`** : A session-persistence method that hashes the client IP and always sends it to the same backend.
- **`sendfile` / `gzip`** : An optimization where the kernel sends files directly to reduce copies / an option that compresses responses to reduce bandwidth.
- **Zero-downtime reload** : A method that starts new workers with the new config while old workers finish their in-flight requests and exit.
- **File descriptor limit** : The upper bound on the number of files and sockets a process can open. Raised with `worker_rlimit_nofile` and `ulimit -n`.

## 📝 Practice Questions

**Question 1.** In Nginx configuration, which directive specifies a virtual host's document root (the equivalent of Apache's DocumentRoot)?

A) `listen`
B) `root`
C) `server_name`
D) `location`

**Answer: B**
Explanation: Nginx's `root` specifies the document root and corresponds to Apache's DocumentRoot. `listen` is the port (Listen), `server_name` is the domain (ServerName), and `location` is the handling rule per URL path.

---

**Question 2.** Which directive in Nginx forwards a request to a backend server behind it (reverse proxy)?

A) `try_files`
B) `proxy_pass`
C) `sendfile`
D) `gzip`

**Answer: B**
Explanation: `proxy_pass http://backend;` forwards the matched request to the specified backend (or upstream group). `try_files` is file lookup, `sendfile` is a file-transfer optimization, and `gzip` is response compression.

---

**Question 3.** Which lists the nesting scope of Nginx configuration blocks correctly from outside to inside?

A) location → server → http
B) server → http → location
C) http → server → location
D) http → location → server

**Answer: C**
Explanation: The scope narrows from http (HTTP-wide) → server (one virtual host) → location (URL path). Inner blocks inherit the outer configuration and override only what is needed.

---

**Question 4.** Which of the following is correct about Nginx's processing model compared with Apache?

A) It creates a separate process for each connection
B) A few workers handle many connections asynchronously and event-driven
C) It supports per-directory .htaccess distributed configuration by default
D) It handles all dynamic languages only through built-in modules

**Answer: B**
Explanation: Nginx has a few workers handle a huge number of connections asynchronously with an event loop, giving high concurrency efficiency. Creating a process per connection is the Apache (prefork) way; Nginx does not support .htaccess and proxies dynamic processing to the outside.

---

**Question 5.** Which command in Nginx applies the new configuration without dropping connections after the configuration has been changed?

A) `nginx -t`
B) `nginx -s stop`
C) `nginx -s reload`
D) `systemctl kill nginx`

**Answer: C**
Explanation: `nginx -s reload` (or `systemctl reload nginx`) has the master start new workers while old workers finish their in-flight requests and exit, giving a zero-downtime reapply. `-t` is a syntax check, and `-s stop` is a stop.

---

**Question 6.** In an Nginx upstream block, which distribution method always sends the same client to the same backend server (keeping the session)?

A) Round robin
B) `least_conn`
C) `ip_hash`
D) `proxy_pass`

**Answer: C**
Explanation: `ip_hash` hashes the client IP and always sends it to the same backend, so it is used for session persistence. Round robin distributes in order, `least_conn` picks the server with the fewest connections, and `proxy_pass` is the forwarding directive.

---

**Question 7.** Which directive in Nginx compresses responses to reduce transfer bandwidth?

A) `sendfile on`
B) `gzip on`
C) `keepalive_timeout`
D) `worker_connections`

**Answer: B**
Explanation: `gzip on` compresses text responses to reduce transfer volume. `sendfile on` is a kernel-level file-transfer optimization, `keepalive_timeout` is the connection reuse time, and `worker_connections` is the per-worker concurrent connection limit.

---
