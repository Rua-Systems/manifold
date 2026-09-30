# Security Policy

## Supported versions

Security fixes are made for the latest release. Please update to it before reporting an issue.

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through GitHub's private vulnerability reporting: open the **Security** tab of the repository and choose **Report a vulnerability**.

Include what you found, the steps to reproduce it, the affected version and the impact you expect. You will get an answer within a week. We will work with you on a fix and credit you in the release notes if you wish.

## Scope

In scope are the application in this repository, its container image and the documented deployment with `docker-compose.yml`. Out of scope are issues that need a compromised server or owner account, missing hardening of the reverse proxy in front of the app, denial of service by volume, and findings in outdated versions.

## Dependencies

Dependencies come only from the npm registry and are pinned by `package-lock.json` with integrity hashes. Dependabot proposes updates for npm packages, GitHub Actions and the base image every week, continuous integration fails on any known vulnerability of high or critical severity, and every image contains a CycloneDX software bill of materials at `/app/sbom.cdx.json` (`npm run --silent sbom` prints it for a checkout).

Known vulnerabilities in dependencies are fixed within these time frames after a fix or a workaround is available:

| Severity         | Time frame                        |
| ---------------- | --------------------------------- |
| Critical or high | 7 days, in a patch release        |
| Moderate         | 30 days                           |
| Low              | 90 days, or with the next release |

A vulnerability that cannot be reached in Manifold, for example one in a development tool that never runs in production, is documented in the release notes and fixed with the next regular update.

## Security model

- There is exactly one account, the owner, created from the environment on the first start. There is no sign-up. Passwords are 8 to 128 characters long and hashed by Better Auth. Sign-in attempts, emailed codes and identity confirmations are rate limited per client address.
- Two-factor authentication with TOTP codes and single-use backup codes is available, and sign-in codes by email when mail is set up.
- Sensitive actions, such as changing the email address or the password, creating API keys, managing two-factor authentication, revealing, copying or changing vault values and downloading the data export, need the password again, and an authenticator code when two-factor authentication is on. A confirmation lasts ten minutes in the current session.
- The owner sees every session and can end the others. Resetting the password from the command line signs every session out.
- API keys are shown once, stored only as SHA-256 hashes, carry scopes per module and an optional expiry date, and have their own rate limit. No API route or MCP tool returns or accepts a vault value.
- Vault values are encrypted with AES-256-GCM under `ENCRYPTION_KEY`, with a random IV per value and the secret's id as additional authenticated data. The key never appears in logs, errors or backups, and `node cli.js vault:rotate-key` replaces it.
- Uploads are accepted only as PNG, JPEG, WebP or GIF, recognized from their content, within a size limit.
- Responses carry a Content Security Policy, and form posts are checked against the configured origin.
- The audit log records sign-ins, security changes, API and MCP writes, vault actions, exports and command-line changes.
- The container runs as an unprivileged user with a read-only root filesystem, no Linux capabilities and `no-new-privileges`; only its data volume and a temporary `/tmp` are writable.

[docs/security.md](docs/security.md) describes the protections in more detail, and [docs/deployment.md](docs/deployment.md) the TLS-terminating reverse proxy that the container needs in front of it.
