# Email

Email is optional. Without it, you sign in with your password and recover a lost password on the [command line](operations.md). With it, you can also sign in with a code sent by email, reset a forgotten password on the login page, and receive security notices.

## Turning email on

Set the SMTP variables in `.env`:

```ini
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=no-reply@example.com
SMTP_PASSWORD=your-smtp-password
MAIL_FROM=Manifold <no-reply@example.com>
```

Then recreate the app container so it reads them:

```bash
docker compose up -d
```

On Coolify, set the same variables in the environment settings of the service and restart it.

- `SMTP_HOST` turns email on. Without it, every email feature is off in production.
- `SMTP_PORT` defaults to `587` and `SMTP_SECURE` to `false`: the connection starts in plain text and is upgraded with STARTTLS when the server offers it. For port `465`, set `SMTP_SECURE=true` to use TLS from the start. `SMTP_SECURE` accepts only `true` or `false`; any other value stops the app at start.
- `SMTP_USER` and `SMTP_PASSWORD` are the login at the server. Without `SMTP_USER`, Manifold sends without logging in, for example through a relay that trusts your server.
- `MAIL_FROM` is the sender. A value with a display name, such as `Manifold <no-reply@example.com>`, is used as it is. A plain address gets `ORGANIZATION_NAME` as its display name. Set `MAIL_FROM` whenever `SMTP_HOST` is set: Manifold does not make up a sender of its own. Most providers accept only a sender address that belongs to the account in `SMTP_USER`.

To make sure your messages arrive, publish SPF, DKIM and DMARC records for the sender's domain as your provider describes. [Configuration](configuration.md) lists every variable.

## What Manifold sends

Every mail goes to the owner's email address:

| Mail                | Subject                              | Sent when                                                                                             |
| ------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Sign in code        | `Your Manifold sign in code`         | You choose **Email Code** on the login page and request a code.                                       |
| Password reset code | `Your Manifold password reset code`  | You request a code on the **Reset Password** page, which **Forgot Password** on the login page opens. |
| Password changed    | `Your Manifold password was changed` | The password was changed under **Settings**, or reset with a code.                                    |
| New sign in         | `New sign in to Manifold`            | A sign in succeeded from a browser that the account has not signed in with before.                    |

The subjects use `ORGANIZATION_NAME` in place of `Manifold`. The command line sends no mail, so `owner:reset-password` changes the password without a notice. Each mail has an HTML part and a plain text part. Codes are written in the language of the page on which you asked for them. The two notices use the **Language for mails** preference under **Settings** when one is chosen, because someone else may have caused them from a page in another language, and the language of the page from which the action came otherwise.

### Codes

Codes have six digits and expire after 5 minutes. A code stops working after three wrong attempts; request a new one then. On the **Reset Password** page, **Resend code** becomes available 60 seconds after a code was sent.

Codes are only ever sent to the owner's address. When someone enters another address, the page answers exactly as it would for the owner, but nothing is sent, so the form does not reveal which address belongs to the account. Each client address may request 3 codes per minute.

When two factor authentication is on, a sign in with an emailed code still asks for a code from your authenticator app or a backup code, just like a sign in with the password.

### Notices

The password changed notice and the new sign in notice show the time in UTC, the IP address and the device, such as `Chrome on Windows`. If you did not cause one of them, change or reset your password right away and sign out the other sessions under **Settings → Security**.

Manifold recognizes a browser by its user agent string. A browser update that changes that string counts as a new browser, so a new sign in notice after an update is expected.

## With and without email

| Situation                  | With email                                                                             | Without email                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Signing in                 | With the password, or with **Email Code**: a code is mailed to the owner's address.    | With the password only. The **Login method** choice is not shown.                                                                    |
| Forgotten password         | **Forgot Password** on the login page leads to **Reset Password**, which mails a code. | There is no **Forgot Password** link, and the reset page answers `404`. Use `owner:reset-password`, see [Operations](operations.md). |
| Password changed           | The owner gets a notice.                                                               | No notice.                                                                                                                           |
| Sign in from a new browser | The owner gets a notice.                                                               | No notice.                                                                                                                           |

The audit log under **Settings → Security → Audit Log** records every sign in and every password change either way.

## When sending fails

Mails are sent in the background, and a failure never blocks or changes the action that triggered it: the login page says that a code was sent even when the mail server refused it. The failure is written to the log as `Sending a mail failed.` with the error, never with the content of the mail:

```bash
docker compose logs --tail 100 app
```

[Troubleshooting](troubleshooting.md) lists the usual causes.

## Email in development

With `npm run dev` and no `SMTP_HOST`, every email feature is on, and mails are printed to the terminal instead of being sent:

```text
[mail] To: owner@example.com
[mail] Your Manifold sign in code
```

The text part of the mail follows, including the code. To send real mails in development, point the SMTP variables at a mail server or a local mail catcher.

The development server also shows every template with sample values, in every language, with both the HTML and the text part, at `/dev/mail/<template>`:

| Template              | Mail                |
| --------------------- | ------------------- |
| `sign-in-code`        | Sign in code        |
| `password-reset-code` | Password reset code |
| `password-changed`    | Password changed    |
| `new-sign-in`         | New sign in         |

For example, open `http://localhost:5173/dev/mail/sign-in-code`. The preview exists only in development; a production build answers `404`.
