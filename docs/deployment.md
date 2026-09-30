# Deployment

In production, Manifold runs as two containers, the app and its PostgreSQL database, behind a reverse proxy that terminates TLS. This page explains how to connect the proxy, how to run Manifold on Coolify, how client addresses reach the app, and how to update, monitor and size an installation.

## Overview

```text
Browsers, API clients and MCP clients
        |
        | HTTPS
        v
Reverse proxy (ports 80 and 443)
        |
        | HTTP
        v
app container (127.0.0.1:3000) -> app-data volume at /data
        |
        | PostgreSQL (db:5432)
        v
db container -> db-data volume
```

- The proxy owns the certificate and the public ports 80 and 443.
- The app listens on port 3000, published only on `127.0.0.1` by `docker-compose.yml`.
- The database is not published at all; only the app reaches it, over the network Compose creates.
- All state lives in two volumes: `db-data` holds the database, and `app-data`, mounted at `/data`, holds the uploaded files, the backup archives and the work files of backups.

The app container runs as an unprivileged user with a read-only root filesystem, no Linux capabilities and `no-new-privileges`; only `/data` and a temporary `/tmp` are writable. The database container runs with `no-new-privileges` too. Keep these settings when you adapt the Compose file.

## Before you go live

1. `ORIGIN` is the public `https` address.
2. `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` are fresh random values, and copies of `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` are kept outside the server, for example in a password manager.
3. `MANIFOLD_VERSION` names a release or a minor line, not `latest`.
4. The proxy serves only TLS 1.2 and 1.3 with a publicly trusted certificate.
5. `ADDRESS_HEADER` and `XFF_DEPTH` match your proxy, and port 3000 is not reachable from the internet.
6. The proxy accepts request bodies of at least `UPLOAD_MAX_BYTES` plus 256 KB, for example 11 MB with the default limit.
7. `OWNER_PASSWORD` is removed from the environment after the first sign-in.
8. The owner has turned on two-factor authentication under **Settings → Security**.
9. Backups run regularly and are copied off the server, see [Backups and restores](backups.md).

## Reverse proxy

### Caddy

Caddy obtains and renews certificates automatically. The first block serves the app; the second replaces Caddy's automatic redirect so that pages are redirected to `https` while plain `http` calls to the REST API and the MCP server fail instead of being redirected:

```text
manifold.example.com {
    reverse_proxy 127.0.0.1:3000
}

http://manifold.example.com {
    @keys path /api/* /mcp
    handle @keys {
        respond "Use https." 403
    }
    handle {
        redir https://{host}{uri} permanent
    }
}
```

Caddy sends `X-Forwarded-For` by default, so the defaults of `docker-compose.yml`, `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1`, fit. Caddy has no request body limit by default.

### Nginx

```nginx
server {
    listen 80;
    server_name manifold.example.com;

    location /api/ {
        return 403;
    }

    location = /mcp {
        return 403;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name manifold.example.com;

    ssl_certificate /etc/letsencrypt/live/manifold.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/manifold.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 11m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Nginx accepts only 1 MB request bodies by default. Manifold accepts uploads of `UPLOAD_MAX_BYTES` plus 256 KB for the other form fields, and other request bodies of up to 5 MB, so `client_max_body_size 11m` fits the default limit of 10 MB. Raise it together with `UPLOAD_MAX_BYTES`.

### Coolify

Coolify runs Manifold behind its own proxy, which obtains the certificate for your domain. Create the service from a Compose file that you paste into Coolify, not from this repository: the repository's `docker-compose.yml` also contains `build: .`, so Coolify would build the image from the source on your server instead of pulling the published one, and it publishes port 3000 on the host, which Coolify does not need.

1. Point your domain to the server with an `A` record, and an `AAAA` record for IPv6, so that Coolify can obtain the certificate.
2. In your project, choose **+ New → Docker Compose Empty** and paste this file:

   ```yaml
   services:
     db:
       image: postgis/postgis:17-3.5
       environment:
         POSTGRES_USER: ${POSTGRES_USER:?}
         POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}
         POSTGRES_DB: ${POSTGRES_DB:?}
       volumes:
         - db-data:/var/lib/postgresql/data
       restart: unless-stopped
       security_opt:
         - no-new-privileges:true
       healthcheck:
         test: ['CMD-SHELL', 'pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"']
         interval: 5s
         timeout: 5s
         retries: 20

     app:
       image: ghcr.io/justhasanuknow/manifold:0.1.0
       depends_on:
         db:
           condition: service_healthy
       environment:
         ORIGIN: ${ORIGIN:?}
         ADDRESS_HEADER: ${ADDRESS_HEADER:-x-forwarded-for}
         XFF_DEPTH: ${XFF_DEPTH:-1}
         DATABASE_URL: postgres://${POSTGRES_USER:?}:${POSTGRES_PASSWORD:?}@db:5432/${POSTGRES_DB:?}
         ORGANIZATION_NAME: ${ORGANIZATION_NAME:-Manifold}
         BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?}
         ENCRYPTION_KEY: ${ENCRYPTION_KEY:?}
         OWNER_USERNAME: ${OWNER_USERNAME}
         OWNER_EMAIL: ${OWNER_EMAIL}
         OWNER_PASSWORD: ${OWNER_PASSWORD}
         SMTP_HOST: ${SMTP_HOST}
         SMTP_PORT: ${SMTP_PORT:-587}
         SMTP_SECURE: ${SMTP_SECURE:-false}
         SMTP_USER: ${SMTP_USER}
         SMTP_PASSWORD: ${SMTP_PASSWORD}
         MAIL_FROM: ${MAIL_FROM}
         MAP_TILE_URL: ${MAP_TILE_URL}
         MAP_TILE_ATTRIBUTION: ${MAP_TILE_ATTRIBUTION}
         MAP_DEFAULT_CENTER: ${MAP_DEFAULT_CENTER}
         MAP_DEFAULT_ZOOM: ${MAP_DEFAULT_ZOOM}
         UPLOAD_MAX_BYTES: ${UPLOAD_MAX_BYTES}
         TRASH_RETENTION_DAYS: ${TRASH_RETENTION_DAYS}
         AUDIT_RETENTION_DAYS: ${AUDIT_RETENTION_DAYS}
         API_RATE_LIMIT_PER_MINUTE: ${API_RATE_LIMIT_PER_MINUTE}
       volumes:
         - app-data:/data
       restart: unless-stopped
       read_only: true
       tmpfs:
         - /tmp
       security_opt:
         - no-new-privileges:true
       cap_drop:
         - ALL
       healthcheck:
         test: ['CMD', 'node', 'healthcheck.mjs']
         interval: 30s
         timeout: 5s
         retries: 3
         start_period: 30s

   volumes:
     db-data:
     app-data:
   ```

3. Enter `https://manifold.example.com:3000` in the **Domains** field of the `app` service. The port tells Coolify's proxy where the container listens; visitors still open `https://manifold.example.com`.
4. Fill in the variables that Coolify lists under **Environment Variables**. It does not deploy until the required ones have values.
   - `ORIGIN` is the domain without the port: `https://manifold.example.com`.
   - `POSTGRES_USER` and `POSTGRES_DB` can both be `manifold`. `POSTGRES_PASSWORD` is a new value from `openssl rand -hex 32`.
   - `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` are two new values from `openssl rand -base64 32`. Keep copies outside Coolify, especially of `ENCRYPTION_KEY`: backups never contain it, and without it the vault cannot be read after a restore.
   - The `OWNER_*` variables are read on the first start only. Clear `OWNER_PASSWORD` once you have signed in.
   - Leave `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` empty until you set up [email](email.md), and the other optional variables empty for their defaults, see [Configuration](configuration.md).
5. Deploy. The `app` service turns healthy once `/healthz` answers, and you can sign in at `https://manifold.example.com/login`.

The file keeps the protections of the shipped Compose file and leaves out `ports:`, because Coolify's proxy reaches the container over Coolify's own network. `UPLOAD_DIR`, `BODY_SIZE_LIMIT` and `TMPDIR` come from the image. Coolify's proxy is a single hop, so `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1` fit. Give API and MCP clients `https` addresses.

To run a command of the command line, open a terminal in the `app` container from Coolify and run `node cli.js <command>`, for example `node cli.js backup`; [Operations](operations.md) lists the commands.

To update, take a backup, read the release notes, compare the new release's `docker-compose.yml` and `.env.example` with your pasted file, change the image tag to the new version and deploy again. Coolify keeps the `db-data` and `app-data` volumes across deployments; if you delete the resource, keep its volumes unless you want to delete all data. Backups are written to the `app-data` volume, so copy them off the server as described in [Backups and restores](backups.md).

## TLS and plain HTTP

Serve only TLS 1.2 and 1.3 with a publicly trusted certificate; Caddy and Coolify do this by default. With an `https` origin, Manifold marks its session cookies `Secure` and sends `Strict-Transport-Security` with a lifetime of one year including subdomains, so browsers never fall back to plain HTTP once they have seen the site.

Redirect plain `http` requests for pages to `https`, but do not redirect `/api/` and `/mcp`. An API or MCP client configured with an `http` address would otherwise send its key in clear text before being redirected; answering with an error makes the mistake visible.

## Client addresses

Sign-in rate limits, the audit log, the notices about new sign-ins and the last used address of each API key rely on the real client address. Behind a proxy every request comes from the proxy, so the proxy passes the original address in `X-Forwarded-For` and Manifold reads it:

- `ADDRESS_HEADER=x-forwarded-for` tells Manifold which header to read.
- `XFF_DEPTH` is the number of proxies you run in front of the app. Manifold takes the address that many positions from the end of the header, which is the one your outermost proxy added. Entries further left come from the client and are ignored.

`docker-compose.yml` uses these two values when the variables are not set, which fits one proxy. If two proxies are chained, for example a CDN in front of Nginx, set `XFF_DEPTH=2`.

The app must be reachable only through the proxy. Otherwise a client could choose its own address by sending an `X-Forwarded-For` header, and a request without the header, or with fewer addresses in it than `XFF_DEPTH`, fails wherever the app needs the address, for example when signing in. The Compose file binds the port to `127.0.0.1` for this reason. To reach the app without any proxy, as when you try it on your own computer, set both variables to nothing, see [Installation](installation.md#2-create-the-configuration).

## Security headers

Manifold sets its own security headers on the responses it renders, which are its pages, API responses and file downloads:

- `Content-Security-Policy` on pages: scripts, fonts and connections only from Manifold itself, styles from Manifold itself and inline, images also from `data:`, `blob:` and any `https` address for the map tiles, no framing, no plugins, and forms that submit only to Manifold.
- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy`, which allows geolocation for Manifold itself, for the map's location button, and turns off the camera, the microphone, payments and USB.
- `X-Robots-Tag: noindex, nofollow`, which asks search engines not to index the instance.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`, when `ORIGIN` is an `https` address.

The proxy does not need to add these headers and should not remove or replace them.

## Updating

New versions are published as releases on GitHub, and `CHANGELOG.md` lists what each one changes. Read the notes of every version between yours and the new one before you update; before 1.0.0, a minor version may change the configuration, the API or the data in incompatible ways.

Manifold applies database migrations automatically on start. Migrations only move forward, and an older version refuses to start on a database that a newer version has migrated, so take a backup first:

```bash
docker compose exec app node cli.js backup
```

The command writes `/data/backups/manifold-backup-<time>.tar.gz` into the `app-data` volume. Then check out the tag of the new version, so that `docker-compose.yml` and `.env.example` match it, for example for a version 0.2.0:

```bash
git fetch --tags
```

```bash
git checkout v0.2.0
```

Compare `.env.example` with your `.env`, set `MANIFOLD_VERSION` to the new version, and pull and start the image:

```bash
docker compose pull
```

```bash
docker compose up -d
```

If you set a minor line such as `0.1`, these two commands alone pick up its newest patch release. Check `/healthz` and sign in afterwards. If a migration fails, the app does not start, and its log names the failing migration.

To go back to the previous version, check out its tag, set `MANIFOLD_VERSION` back and restore the backup you took. The older version cannot start while the database holds the newer migrations, so stop the app and run the restore in a one-off container:

```bash
docker compose stop app
```

```bash
docker compose run --rm app node cli.js restore /data/backups/manifold-backup-<time>.tar.gz --force
```

```bash
docker compose up -d
```

`--force` replaces the database that holds data. [Backups and restores](backups.md) explains restoring in detail.

## Health and monitoring

- `GET /healthz` answers `{"status":"ok"}` when the database is reachable, and status `503` with `{"status":"unavailable"}` otherwise. Its answers are never cached.
- The Compose health check calls it every 30 seconds, after a start period of 30 seconds, and marks the container unhealthy after three failures in a row.
- Point an external uptime monitor at `https://manifold.example.com/healthz`.
- The log on standard output shows applied migrations, the creation of the owner, failed housekeeping tasks and emails that could not be sent. Read it with `docker compose logs -f app`, see [Operations](operations.md).

Limit the size of Docker's log files. A `docker-compose.override.yml` next to `docker-compose.yml` is merged automatically by Compose, is ignored by Git and keeps the shipped file unchanged for updates:

```yaml
services:
  db:
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: '5'
  app:
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: '5'
```

## Scaling and resources

Manifold runs as a single app instance per database, because the sign-in and API rate limits, the cached user settings and the daily housekeeping live inside the process. Scale up with more CPU and memory rather than more app containers.

Plan disk space for three things: the database in `db-data`, the uploaded files in `app-data`, and the backup archives, which are written to `app-data` as well. While a backup is written, the database dump also takes temporary room in `/data/tmp`, so keep free space for at least one more archive. Copy archives off the server and delete old ones there, see [Backups and restores](backups.md).
