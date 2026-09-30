# Backups and restores

A backup contains the whole installation: the database with every note, map feature, service, vault entry, API key, setting and the audit log, and every uploaded file. You create backups with the `backup` command or download one in the browser under **Settings → Data**, and bring one back with the `restore` command. The [command line](operations.md) runs inside the app container.

## What a backup contains

A backup is one `.tar.gz` archive with:

- `manifest.json`, which names the app, the version that wrote the backup, the newest migration applied to the database and the creation time;
- `database.dump`, the whole database in `pg_dump`'s custom format, without owners and privileges;
- `uploads/`, every uploaded file, such as images in notes and service icons.

A manifest looks like this:

```json
{
  "app": "Manifold",
  "version": "0.1.0",
  "migration": "0011",
  "createdAt": "2026-09-30T03:00:00.000Z"
}
```

To look into an archive on your own computer:

```bash
tar -tzf manifold-backup-2026-09-30T03-00-00.tar.gz
```

The archive is not encrypted. It holds your notes, the password hash, the session records and the encrypted vault values. Store it with the same care as the server itself, and encrypt it before you keep it anywhere you do not fully control.

## What a backup does not contain

No environment variable is ever part of an archive. Two of them decide whether a restored backup is fully usable:

| Variable             | Needed for                              | Without the value from the time of the backup                                                                                                                            |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ENCRYPTION_KEY`     | The values in the vault.                | The vault lists its entries, but no value can be revealed or copied. Nothing can recover them.                                                                           |
| `BETTER_AUTH_SECRET` | Sessions and two factor authentication. | Every browser is signed out, and the authenticator codes and backup codes of the backup do not work. Run `owner:disable-2fa` and set two factor authentication up again. |

Keep copies of `ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` somewhere safe on their own, for example in a password manager, and not next to the archives. The rest of your configuration, such as `ORIGIN` and the SMTP settings, is not in the archive either: keep a copy of `.env`.

## Creating a backup

```bash
docker compose exec app node cli.js backup
```

The command prints where it wrote the archive:

```text
Wrote /data/backups/manifold-backup-2026-09-30T03-00-00.tar.gz (migration 0011).
The archive holds neither ENCRYPTION_KEY nor BETTER_AUTH_SECRET: keep both, or the vault and two factor sign in stop working after a restore.
```

The name holds the time of the backup in UTC. You can create a backup while the app is running: `pg_dump` reads a consistent snapshot of the database.

To choose the file yourself, pass an absolute path inside `/data`. The root filesystem of the container is read-only, and `/data` is the volume that survives a restart:

```bash
docker compose exec app node cli.js backup /data/backups/before-update.tar.gz
```

The command never overwrites a file, and it stops before doing any work when the folder is missing or the file already exists. The database dump is written to `/data/tmp` first and then packed into the archive, so the volume needs free space for both; the temporary files are removed afterwards, and a failed backup leaves no partial archive behind. Every backup is recorded in the audit log as `data.backup`.

## Downloading an export

Under **Settings → Data**, **Download Export** streams the same archive to your browser as `manifold-backup-<date>.tar.gz`. Nothing is kept on the server.

The download is a sensitive action. Unless you confirmed your identity in the last ten minutes, the app first asks for your password on **Confirm Your Identity**, and for a code from your authenticator app when two factor authentication is on; the download starts after **Confirm**. Every export is recorded in the audit log as `data.export`.

An export is restored like any other archive, with the `restore` command below.

## Copying archives off the server

A backup inside the same volume does not survive the loss of the server. List the archives:

```bash
docker compose exec app ls -l /data/backups
```

Copy one into the current folder of the host:

```bash
docker compose cp app:/data/backups/manifold-backup-2026-09-30T03-00-00.tar.gz ./
```

Archives are never deleted automatically. Once an archive is stored safely elsewhere, remove it from the volume:

```bash
docker compose exec app rm /data/backups/manifold-backup-2026-09-30T03-00-00.tar.gz
```

[Operations](operations.md) shows how to create backups every night with cron.

## Restoring a backup

A restore replaces the database and the uploaded files with those of the archive. If you might still need the current state, create a backup of it first.

1. Copy the archive into the volume:

   ```bash
   docker compose cp ./manifold-backup-2026-09-30T03-00-00.tar.gz app:/data/backups/manifold-backup-2026-09-30T03-00-00.tar.gz
   ```

2. Restore it. Once the app has started, the database always holds its tables, so the restore needs `--force`:

   ```bash
   docker compose exec app node cli.js restore /data/backups/manifold-backup-2026-09-30T03-00-00.tar.gz --force
   ```

3. Restart the app:

   ```bash
   docker compose restart app
   ```

4. Sign in with the owner account of the backup: its username, password and two factor authentication apply now.

Do not use Manifold while the restore runs. When the app container is not running, run step 2 with `docker compose run --rm app` in place of `docker compose exec app`, and start the app with `docker compose up -d` afterwards.

The command reports what it restored:

```text
Restored the backup of 2026-09-30T03:00:00.000Z (migration 0011).
Restart the app. The vault opens only with the ENCRYPTION_KEY it was written with.
```

### What the restore does

1. It unpacks the archive into a work folder in `/data/tmp`, so the volume needs free space for the unpacked archive.
2. It reads the manifest and refuses archives from a newer version of Manifold.
3. It refuses a database with tables unless `--force` is given. With `--force`, it drops every schema of the database except PostgreSQL's own, with all tables, data and extensions in them.
4. It restores the dump with `pg_restore`, which stops at the first error.
5. With `--force`, it deletes every file in the upload folder. It then copies the uploaded files of the archive into it.
6. It applies the migrations that are newer than the backup, lists them, and records `data.restore` in the audit log.

Nothing is changed until the archive has passed the checks of the first three steps, so a refused archive leaves the installation as it was. If a forced restore fails after that, the database may be incomplete: fix the cause and run the restore again with `--force`.

### Refusals

| Message                                                                                       | Meaning                                                                                 |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Name the archive to restore: restore <path> [--force].`                                      | The path of the archive is missing.                                                     |
| `The archive cannot be read.`                                                                 | The path is wrong, or the file is damaged or not a `.tar.gz` archive.                   |
| `The archive has no readable manifest.`                                                       | The manifest is damaged.                                                                |
| `This is not a Manifold backup.`                                                              | The archive was not written by Manifold.                                                |
| `The backup comes from a newer Manifold (migration 0012, this one knows 0011). Update first.` | Update this installation to at least the version that made the backup, then restore it. |
| `The database is not empty. Use --force to replace it.`                                       | Add `--force` to replace the current data.                                              |

### After a restore

- The vault opens only with the `ENCRYPTION_KEY` that was current when the backup was made. If the restored installation uses another key, set it back to that one and run `docker compose up -d`; you can move to a new key afterwards with `vault:rotate-key`, see [Operations](operations.md).
- Two factor authentication and the sessions of the backup work only with the `BETTER_AUTH_SECRET` of that time. Otherwise run `owner:disable-2fa`.
- The sessions stored in the backup are restored as well. To end them, sign in and choose **Sign Out All Other Sessions** under **Settings → Security**.
- If you do not know the password of the backup's owner account, run `owner:reset-password`.

## Moving to a new server

1. On the old server, create a backup and copy it off the server, or download an export under **Settings → Data**.
2. Install Manifold on the new server as described in [Installation](installation.md), with the same `ENCRYPTION_KEY` and, to keep two factor authentication working, the same `BETTER_AUTH_SECRET`. The first start needs `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD` as usual; the account they create is replaced by the restore.
3. Copy the archive into the new installation and restore it with `--force` as described above.
4. Sign in with the owner account of the backup. The `OWNER_*` variables can be removed now.

## Going back to an older version

A version of Manifold refuses to start on a database that a newer version has migrated, and it refuses archives from newer versions. Archives from older versions are always accepted, and the restore applies their missing migrations. To go back to an older version, restore an archive that was made with that version or an earlier one:

1. Copy the archive into the volume with `docker compose cp`, as in the first step of the restore.
2. Stop the app:

   ```bash
   docker compose stop app
   ```

3. Set `MANIFOLD_VERSION` in `.env` to the older version and pull it:

   ```bash
   docker compose pull app
   ```

4. Restore the archive in a one-off container of the older version, since the older app cannot start on the newer database:

   ```bash
   docker compose run --rm app node cli.js restore /data/backups/manifold-backup-2026-09-30T03-00-00.tar.gz --force
   ```

5. Start the app:

   ```bash
   docker compose up -d
   ```
