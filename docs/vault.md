# Vault

The vault keeps passwords, tokens and keys. Values are encrypted before they reach the database, stay masked on the page, and are revealed or copied only after you confirm your identity. Nothing outside the page, not the API, not the MCP server and not the search, can ever read a value.

## The Vault page

Open **Vault** in the sidebar, or **Go to Vault** in the command palette. Entries are sorted by name. Each one shows its name, its service address as a link that opens in a new tab, its notes, and its value as a row of dots. Four icon buttons sit next to it: **Reveal**, **Copy**, **Edit Secret** and **Delete**.

## Adding a secret

1. Choose **New Secret**.
2. Enter a **Name** of up to 100 characters.
3. Optionally enter the **Service address**, which must start with `http://` or `https://`, and **Notes** of up to 500 characters.
4. Enter the **Value**, up to 10,000 characters. The field hides what you type.
5. Choose **Add Secret**.

Adding a secret reveals nothing, so it does not ask you to confirm your identity.

## Revealing and copying

- **Reveal** shows the value in place of the dots for 30 seconds, then hides it again. Choose the button again, now **Hide**, to hide it sooner.
- **Copy** puts the value on the clipboard without showing it and confirms with **Copied to the clipboard.**

Both ask you to confirm your identity first: your password, and a code from your authenticator app when two factor authentication is on. After that, both work without asking again for ten minutes; [Your account](account.md) explains the confirmation. A revealed value is kept only in the open page, never in the address, the browser's storage or a cookie; reloading the page or leaving it forgets it.

Every reveal and every copy is recorded in the audit log as `vault.reveal` or `vault.copy`, without the value.

Without JavaScript, **Reveal** shows the value on the page that comes back, where it stays until you leave the page. **Copy** does the same, since only a script can write to the clipboard. A link to the confirmation page appears when a confirmation is due.

## Editing

**Edit Secret** opens the name, the service address and the notes, and an empty **New value** field.

- Changing only the name, the address or the notes needs no confirmation.
- A **New value** replaces the stored value and asks you to confirm your identity. Leave the field empty to keep the current value.

Choose **Save**. The audit log records `vault.update` for the details and `vault.update_value` when the value changed.

## Deleting

**Delete** opens **Delete Secret**, which names the entry and warns that its value is gone for good. Choose **Delete** to remove it; this needs no confirmation of your identity and is recorded as `vault.delete`. There is no trash: the value can only come back by restoring a backup made before.

## What the API and MCP can see

The vault has a single API scope, `vault:read`, labelled **Read vault names (never values)**. There is no scope to write to the vault.

- The REST API lists entries and reads single entries: the id, the name, the service address, the notes and when the entry was created and last changed. No route returns or accepts a value.
- The MCP server offers one vault tool, which lists the same details so that an agent can tell whether a credential for a service exists.
- The search, in the command palette, on the search page and through the API or MCP, finds entries by name and service address. A hit leads to the Vault page, where the value still needs a confirmation.

[REST API](api.md) and [MCP server](mcp.md) describe the routes and the tool.

## The encryption key

Values are encrypted with AES-256-GCM under `ENCRYPTION_KEY`, 32 random bytes in base64, for example the output of `openssl rand -base64 32`. Each value is tied to its own entry, so an encrypted value copied onto another entry cannot be decrypted. The app does not start without a well-formed key.

- The key never leaves the environment. It is not in the database, not in backups and not in the export.
- Keep a copy of the key somewhere safe outside the server. Without the key that wrote them, the values cannot be decrypted, not even from a backup. [Backups and restores](backups.md) explains what to store with your archives.

## Rotating the key

`node cli.js vault:rotate-key` encrypts every value again with a new key. It takes the new key from `NEW_ENCRYPTION_KEY`, or asks for it without showing what you type.

1. Run the command. It decrypts every value with the current key and encrypts it with the new one in a single transaction: if the current key cannot open every value, nothing changes.
2. Set `ENCRYPTION_KEY` to the new key where the app reads it.
3. Restart the app. Until the restart, the running app holds the old key and cannot read the vault.
4. Discard the old key once the restart is done.

The rotation is recorded in the audit log as `vault.rotate_key` by **Command line**. [Operations](operations.md) describes the command line in full.
