# Data Sources

**Data Sources** keeps where your databases, APIs, buckets and links are, and how to get in: the address, the user, the passwords and tokens, a link to the documentation and your own notes. Passwords and tokens are encrypted like vault values. Manifold can test each connection for you, and scripts and AI agents can read the sources through the REST API and the MCP server, the secrets only with a scope of their own.

**Data Sources** in the sidebar opens the list. Each source shows its type, where it points and the outcome of its last connection test. The field above the list narrows it by words in the name, the notes or the settings, and the menu beside it by type. **New Data Source** is also in the command palette.

## Types

| Type                 | Settings                                                                                                          | Secrets                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **PostgreSQL**       | Host, port, database, user name, TLS, SSH tunnel                                                                  | Password, SSH password or private key |
| **MySQL or MariaDB** | Host, port, database, user name, TLS, SSH tunnel                                                                  | Password, SSH password or private key |
| **Redis**            | Host, port, user name (Redis 6 ACL), database number, TLS, SSH tunnel                                             | Password, SSH password or private key |
| **S3 storage**       | Endpoint (empty for Amazon S3), region, bucket, access key ID, path style                                         | Secret access key                     |
| **HTTP API**         | Base address, path for the test, authentication (none, bearer token, a token in a header, user name and password) | Token or password                     |
| **Link or CDN**      | Address, authentication (none or bearer token)                                                                    | Token                                 |

Every source also has a **Name** of up to 100 characters, unique whatever its case, **Notes** of up to 5,000 characters for anything worth knowing, such as how to connect when there is no documentation, and a **Documentation** link.

## Adding and changing a source

1. Choose **New Data Source**, then the type at the top of the page.
2. Fill in the fields. Port, TLS and the other choices start with the usual values.
3. Choose **Add Data Source**. The source's page opens.

**Edit** on a source's page changes everything but the type. A stored secret shows **Stored** in its field: leave the field empty to keep it, type a new value to replace it, or tick **Remove the stored value**. Changing or removing a secret asks you to confirm your identity first, as in the vault. **Delete** removes the source with its secrets for good.

## TLS

For PostgreSQL and MySQL, **TLS** is **Off**, **Encrypted, certificate not checked**, or **Encrypted, certificate checked**, where the server's certificate must be valid for its host name. For MySQL the certificate chain is checked, but not the host name. Redis has a **TLS** switch, which always checks the certificate.

## SSH tunnels

A database that is only reachable from inside a network can be reached through an SSH server there, as in DBeaver. Tick **Connect through an SSH server** and enter the SSH host, its port, the user and how it signs in: with a **Password**, or with a **Private key** in OpenSSH or PEM form and its passphrase, if it has one. The database's host and port are then the ones the SSH server sees, often `localhost`.

The first connection test that gets through trusts the host key the SSH server showed and keeps its fingerprint, such as `SHA256:...`, with the source. Every later test refuses another key, which is what a server in the middle would show. Changing the SSH host or port forgets the fingerprint, and the next successful test trusts the new key.

## Testing a connection

**Test Connection** on a source's page, or the test button beside it in the list, has the server connect the way a client of that source would:

- PostgreSQL and MySQL: signs in and reads the server version.
- Redis: signs in, selects the database, sends `PING` and reads the version.
- S3: lists one key of the bucket with a signed request.
- HTTP API: reads the base address, or the path for the test, with the authentication.
- Link: asks for the address with `HEAD`, or for its first byte when the server refuses `HEAD`.

Nothing is written to the source. A test follows no redirects and gives up after 10 seconds, or 20 through an SSH tunnel. The outcome, **Connected** with what was found or **Failed** with the reason, stays with the source and shows in the list.

## Secrets

Secrets stay hidden on the page. **Reveal the secrets** shows them, and the **Connection URL** with the password in it, for 30 seconds; the copy buttons put one of them on the clipboard without showing it. Both ask you to confirm your identity if you have not in the last ten minutes, and every reveal and copy is recorded in the audit log as `data_source.reveal` or `data_source.copy`. An edit that sets or removes a secret is recorded as `data_source.update_secrets`, and the rest as `data_source.create`, `data_source.update`, `data_source.delete` and `data_source.test`. The connection URL takes the form your tools take, such as `postgresql://user:password@host:5432/database?sslmode=require`; S3 has none, since its clients take the keys and the bucket.

Secrets are encrypted with AES-256-GCM under `ENCRYPTION_KEY`, like vault values, so `node cli.js vault:rotate-key` encrypts them again together with the vault, see [Operations](operations.md#rotating-the-vault-key). Without `ENCRYPTION_KEY` a restored backup cannot open them. With another `ENCRYPTION_KEY` than the one that wrote them, the Data Sources pages and the API and MCP reads of sources fail; the search still finds them by name.

## Through the API and MCP

Three scopes cover data sources:

- `datasources:read` lists and reads sources with their settings, notes and documentation link, which secrets are stored and the last test, never a secret's value.
- `datasources:secrets` reads the secrets and the connection URL of a source, and nothing else. Every read is recorded in the audit log.
- `datasources:write` adds, changes, deletes and tests sources.

[REST API](api.md#data-sources) lists the routes; [MCP server](mcp.md) the tools: `list_data_sources`, `get_data_source`, `get_data_source_secrets` and `test_data_source`. Give an agent `datasources:secrets` only when it should connect by itself, and only for as long as it needs to.

The search and the command palette find sources by name.
