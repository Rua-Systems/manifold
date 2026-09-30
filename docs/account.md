# Your account

Manifold has exactly one account, the owner, created on the first start from the `OWNER_*` variables. This page explains signing in, recovering access and looking after the account under **Settings**.

## Signing in

Open `/login` (`/tr/login` for Turkish), enter your **Username or Email** and your **Password**, and choose **Authenticate**.

- An entry with an `@` sign is treated as an email address, anything else as a username. Both match regardless of upper and lower case.
- A wrong password and an unknown name get the same answer, so nobody can find out which part was wrong.
- Each client address may try 5 times per minute; after that the page asks you to wait a minute. Failed attempts appear in the audit log without what was typed, since a mistyped password can end up in the name field.
- After signing in you land on **Services**, or on the page you were trying to open.

When mail is set up, Manifold also mails you a notice when you sign in from a browser it has not seen before. A session ends by itself when it has not been used for about a week.

### With a code by email

When mail is set up ([Email](email.md)), the sign in page offers **Password** and **Email Code**. To sign in without your password:

1. Choose **Email Code**, enter your **Email** and choose **Send Code**.
2. Enter the 6-digit code from the mail in **Verification Code** and choose **Verify**. The code is valid for 5 minutes.

**Start over** goes back to the beginning. Codes can be requested 3 times per minute from one client address. Without mail, the choice does not appear and only the password works.

### The second step

When two factor authentication is on, a second step follows the password or the emailed code and asks for the code from your authenticator app or one of your backup codes. Choose **Authenticator** or **Backup code**, enter the code and choose **Verify**.

- Every backup code works only once.
- After too many wrong codes the second step is locked for 15 minutes.
- If you wait too long, the page asks you to start again.

### Signing out

Open the account menu with the person icon in the top right corner and choose **Logout**, or run **Logout** from the command palette. This ends the session of the browser you are using; [Sessions](#sessions) ends the others.

## Forgot password

**Forgot Password** appears on the sign in page only when mail is set up, and resets the password with a code sent to your email address:

1. Enter your **Email** and choose **Send Code**.
2. Enter the **Verification Code** from the mail, your **New Password** and **Confirm Password**, and choose **Reset Password**. The code is valid for 5 minutes.
3. Sign in with the new password. Two factor authentication, if it is on, still applies.

**Resend code** sends a new code; it becomes available 60 seconds after the previous one. **Use a different email** starts over with another address. A reset signs out every session and, like any password change, mails you a notice.

Without mail there is no reset page. Reset the password on the server instead with `node cli.js owner:reset-password`, which also signs out every session; [Operations](operations.md) describes it, together with `owner:disable-2fa` for the case that you lost both your authenticator app and your backup codes.

## Two factor authentication

Two factor authentication adds a one-time code from an authenticator app to every sign in. Apps list the account under the name of your instance (`ORGANIZATION_NAME`). To turn it on, open **Settings → Security**; the **Two Factor Authentication** section shows **Off**.

1. Enter your **Password** and choose **Set Up**.
2. Scan the QR code with your authenticator app, or type the key shown below it into the app.
3. Enter the 6-digit code from the app in **Authenticator code** and choose **Turn On**.
4. Save the 10 backup codes that appear. They are shown only this once; **Download** saves them as `manifold-backup-codes.txt`. Keep them somewhere safe, for example in a password manager outside Manifold.

A backup code replaces the app's code once, when the app is not at hand. While two factor authentication is on, the section offers two forms, each asking for your **Password** and a current **Authenticator code**:

- **Create New Codes** under **New backup codes** replaces all backup codes with a new set of 10. The old ones stop working at once.
- **Turn Off Two Factor Authentication** removes it. Signing in then needs only your password or an emailed code again.

## Confirming your identity

Some actions ask for your password again, even though you are signed in. This protects the account if someone gets hold of an unlocked device.

| Action                                       | Where                   |
| -------------------------------------------- | ----------------------- |
| Changing your email address or your password | **Settings → Profile**  |
| Creating an API key                          | **Settings → API Keys** |
| Downloading the export                       | **Settings → Data**     |
| Revealing, copying or changing a vault value | **Vault**               |

The dialog **Confirm Your Identity** asks for your **Password**, and for an **Authenticator code** when two factor authentication is on; a backup code is not accepted here. Choose **Confirm**, and the action you started continues by itself. Closing the dialog cancels the action.

- A confirmation lasts ten minutes. During that time the actions above run without asking again.
- It belongs to the session it was given in. Another browser asks for its own, and so does the same browser after you sign in again. Changing the password or turning two factor authentication on or off starts a new session on the device you use, so the next sensitive action asks again.
- Without JavaScript, the page shows a **Confirm your identity** link to a page of its own that returns to where you were.
- Each client address may try 5 times per minute. Every confirmation, and every failed one, is recorded in the audit log.

Turning off two factor authentication and creating new backup codes ask for the password and a code in their own forms instead, and turning it on asks for the password to start.

## Sessions

**Settings → Security → Sessions** lists every browser that is signed in, most recently active first. Each entry shows the browser and operating system, the **IP** address, when it **Signed in** and when it was **Last active**; **This session** marks the browser you are using.

- **Sign Out** next to another session ends it. That browser is sent to the sign in page with its next request.
- **Sign Out All Other Sessions** ends every session but yours. It appears when there are others.

Changing your password signs out every other session, and resetting it signs out all of them. To end the session you are using, choose **Logout** in the account menu.

## Profile, email and password

**Settings → Profile** holds the details of your account. Each part has its own form and its own button.

- **Display Name** and **Username**, saved with **Save**. The display name has up to 100 characters and appears in the account menu. The username is what you sign in with: 3 to 32 lowercase letters, digits, dots, underscores or hyphens.
- **Email**, saved with **Change Email**. The address is used for signing in, for codes and for notices. The change applies at once, without a confirmation mail, and asks you to confirm your identity first.
- **Current Password**, **New Password** and **Confirm Password**, saved with **Change Password**. A password has 8 to 128 characters. The change asks you to confirm your identity, checks the current password, signs out your other sessions and, when mail is set up, mails you a notice.

## Preferences

Two preferences are stored with your account under **Settings → Profile** and saved with **Save**:

- **Language for mails**: the language of security notices, such as the new sign in notice, and of mails Manifold sends while you are not using the app. **As in the address**, the default, sets none, and notices then use the language of the page the action came from. Mails that answer something you do, such as a sign in code, always use the language of the page you are on.
- **Default theme**: the theme of a browser that has no theme of its own, once you are signed in on it. **As the device prefers** follows the light or dark setting of the device.

Other choices belong to the address or to the browser:

- The **Language** of the interface follows the address, `/tr` for Turkish; switch it in the account menu.
- The **Theme** you pick in the account menu is stored for a year.
- Whether the sidebar is collapsed, and which of its groups are closed.
- The last position and zoom of the map on **Map Notes**.

## The audit log

**Settings → Security → Audit Log** records who did what and from where. It is meant for noticing anything you did not do.

| Area        | Recorded actions                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Signing in  | Sign ins, failed sign ins, sign outs, confirmations of your identity and failed ones, password resets                      |
| Account     | Email and password changes, two factor authentication turned on or off, new backup codes, sessions signed out              |
| API keys    | Keys created and revoked                                                                                                   |
| Vault       | Entries added, changed, deleted, values changed, revealed and copied, key rotations                                        |
| API and MCP | Every write through the REST API or the MCP server, such as `note.update` or `service.create`; MCP writes carry `via: mcp` |
| Data        | The export, and backups, restores and migrations run from the command line                                                 |

Changes you make to notes, map geometries and services in the app itself are not recorded; the same changes through the API or MCP are. No event ever holds a password, a code, a key or a vault value.

The table shows the **Time** in UTC, the **Actor**, the **Action**, **Details** such as the target of the action, and the **Origin**, which is the IP address and the browser. The filters above it narrow the list:

- **Actor**: **Anyone**, **Owner**, **API key**, **Command line** or **System**. **System** marks events without a known person, such as failed sign ins.
- **Action**: the beginning of an action name, such as `auth.` for everything about signing in or `vault.` for the vault.
- **From** and **To**: a range of days in UTC, both included.

Choose **Filter** to apply them. The log shows 50 events per page, newest first; **Newer** and **Older** move between pages. Events are deleted after `AUDIT_RETENTION_DAYS`, 180 days by default.
