# Usage report

**Settings → Usage** shows what Manifold keeps and the resources it uses: how many notes, revisions, map features, services and vault entries there are and how much space they take, the uploaded files, the database and its tables, the disk that holds the uploads, and the running server. Open it from the settings tabs or with **Go to Usage** in the command palette.

The report is measured when the page loads; nothing is collected in the background or kept between visits. **Measure Again** measures once more without leaving the page, and the line above it says when the report was measured, in UTC. Scripts and agents read the same report through the REST API and MCP, see [Through the API and MCP](#through-the-api-and-mcp).

## Overview

Four readouts sum up the report:

| Readout             | What it shows                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Database**        | The size of the whole PostgreSQL database, indexes and PostGIS's own tables included.                                      |
| **Uploaded files**  | The size of the files in `UPLOAD_DIR`, counted on disk, and how many there are.                                            |
| **Free disk space** | The free space of the disk that holds `UPLOAD_DIR`, and its size. Some systems cannot tell; the readout then says so.      |
| **Memory**          | The memory the server process holds (its resident set). The [server](#server) section shows the JavaScript heap within it. |

With the standard Compose setup, `UPLOAD_DIR` lies in the `app-data` volume, where backup archives are written too, while the database has its own volume. **Free disk space** therefore speaks for the uploads and the backups, and for the database only when both volumes share a disk. [Deployment](deployment.md#scaling-and-resources) explains what needs disk space.

## Content

One table lists what each module keeps, in the order of the sidebar, followed by the system's own records:

| Group        | Rows                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| **Services** | **Services**                                                                                           |
| **Notes**    | **Notes**, **Notes in the trash**, **Note revisions**, **Note tokens**, **Map features**, **Basemaps** |
| **Vault**    | **Vault entries**                                                                                      |
| **System**   | **Audit log events**, **API keys**, **Sessions**                                                       |

**Count** is the number of records, and **Size** the space their data takes as the database stores it: long texts such as the content of a note are stored compressed and counted compressed, and indexes are left out. A bar under each size compares it with the largest row of the table. Images in notes and service icons are uploaded files, which the next section counts.

Revisions are often the largest row: each note keeps its whole history, see [Notes](notes.md). Emptying the trash removes trashed notes with their revisions, and the audit log shrinks as its retention removes old events, see [Your account](account.md).

## Uploaded files

The files table lists the uploads by the module that owns them, largest first: **Notes** for images in notes, **Services** for service icons, and **Uploaded through the API** for files uploaded with `POST /api/v1/files` that no note or service uses yet. A file nothing uses is deleted by the daily housekeeping once it is a day old, see [Operations](operations.md).

The sizes here come from the database's records of the files, the readout under [Overview](#overview) from the files on disk.

## Database

The database table lists every table of Manifold's schema, largest first, with its indexes and its out-of-line storage. **Rows** is PostgreSQL's own count of live rows, which may trail the last changes by a moment. `spatial_ref_sys`, when it is listed, belongs to PostGIS and holds the definitions of coordinate systems; its size does not grow with your data.

## Server

| Row                 | What it shows                                                                       |
| ------------------- | ----------------------------------------------------------------------------------- |
| **Version**         | The version of Manifold that is running.                                            |
| **Node.js**         | The version of Node.js that runs it.                                                |
| **Running since**   | How long ago the server process started, which is also when it last restarted.      |
| **Memory**          | The memory the process holds, as under [Overview](#overview).                       |
| **JavaScript heap** | The part of the memory that holds JavaScript objects: used, of what is reserved.    |
| **Processor time**  | The processor time the process has used since it started, user and system together. |

## Through the API and MCP

`GET /api/v1/usage` answers the same report as JSON, with sizes in bytes and times in ISO 8601. It needs the `usage:read` scope, labelled **Read the usage report** under **Settings → API Keys**. The MCP server offers it as the `get_usage` tool with the same scope.

```json
{
  "measured_at": "2026-10-06T09:30:00.000Z",
  "content": [
    {
      "id": "notes",
      "label": "Notes",
      "items": [
        { "id": "notes.notes", "label": "Notes", "count": 128, "bytes": 1048576 },
        { "id": "notes.trash", "label": "Notes in the trash", "count": 3, "bytes": 20480 }
      ]
    }
  ],
  "files": [{ "owner": "notes", "label": "Notes", "count": 42, "bytes": 8388608 }],
  "database": {
    "bytes": 41943040,
    "tables": [{ "name": "note_revision", "rows": 640, "bytes": 5242880 }]
  },
  "storage": {
    "upload_files": 48,
    "upload_bytes": 8650752,
    "disk_bytes": 42949672960,
    "disk_free_bytes": 21474836480
  },
  "process": {
    "version": "0.4.0",
    "node_version": "v24.10.0",
    "started_at": "2026-10-05T22:00:00.000Z",
    "uptime_seconds": 41400,
    "rss_bytes": 188743680,
    "heap_used_bytes": 62914560,
    "heap_total_bytes": 83886080,
    "cpu_seconds": 312.5
  }
}
```

- The example is shortened: `content` holds a group for every module and `system`, and `database.tables` every table.
- `id` of a group is a module id or `system`, and `id` of an item names the kind of record, such as `notes.trash`. Both stay the same across versions; `label` is English text for display, so scripts should go by `id`.
- `disk_bytes` and `disk_free_bytes` are `null` where the system cannot tell.
- The report contains counts and sizes only, never the content of a record or a vault value.

[REST API](api.md) and [MCP server](mcp.md) describe keys, scopes and errors.
