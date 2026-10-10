# MCP server

Manifold includes a Model Context Protocol (MCP) server at `/mcp`. AI agents such as Claude Code use it to search your workspace, read and write notes, keep your services up to date and place notes on the map. It uses the same API keys, scopes, rate limit and audit log as the [REST API](api.md), and its tools run the same code as the REST endpoints, so they validate input and report errors the same way.

## How it works

- The server speaks the streamable HTTP transport at `https://<your host>/mcp`. Clients send JSON-RPC messages with `POST` and get JSON answers.
- It is stateless: there is no MCP session, and every request carries its key and is checked on its own. Revoking a key stops the agent with its next request.
- A request needs `Authorization: Bearer <key>` with a key from **Settings → API Keys**. Without a valid key, the answer is `401` with the error code `invalid_key`. Manifold does not offer OAuth; the key goes in the header.
- The server offers only the tools the key's scopes allow. `tools/list` shows no other tools, and calling one of them fails with a tool error saying that the tool was not found.
- Every HTTP request counts against the key's limit of `API_RATE_LIMIT_PER_MINUTE` requests per minute, together with the key's REST requests. The handshake (`initialize`) and `tools/list` count as well. Over the limit, the answer is `429` with `Retry-After`, see [Rate limits](api.md#rate-limits).
- Writes are recorded in the audit log like REST writes, with the key as the actor and `via: mcp` in the details.
- The server introduces itself with your `ORGANIZATION_NAME` and the version of Manifold.

Give clients the `https` address of the server: the key travels in every request, and over plain HTTP it would cross the network in clear text.

## Creating a key for an agent

Create a key under **Settings → API Keys** as described in [API keys](api.md#api-keys), and name it after the agent and the machine it runs on, such as "Claude Code on the laptop". Choose the scopes by what the agent should do:

- For an agent that only looks things up, choose the read scopes: `notes:read`, `map:read`, `services:read` and, if it should know which credentials exist, `vault:read`.
- Add `notes:write`, `map:write` or `services:write` only when the agent should change data.
- `vault:read` shows names, addresses and descriptions of vault entries. No tool reads or writes a vault value, whatever the scopes.
- Add `usage:read` for an agent that should keep an eye on the size of the data or the server; it adds the `get_usage` tool.
- No tool uses the `files:read` and `files:write` scopes.

An expiry date under **Expires after** limits the damage if the key leaks. Use one key per agent, so that revoking one leaves the others working.

For an agent that should work on a single note, give it a note token instead, created with **Share** on the note's page, see [Sharing a note](notes.md#sharing-a-note). It is offered `get_note`, and `update_note` with **Read and edit**, both for that note alone; any other note answers `not_found`.

## Connecting Claude Code

Add the server with its address and the key as a header:

```bash
claude mcp add --transport http manifold https://manifold.example.com/mcp --header "Authorization: Bearer mfd_your_key"
```

This adds the server for the current project on your machine only. Add `--scope user` to use it in every project. Avoid `--scope project`, which writes the server and its key into `.mcp.json`, a file meant to be committed. `claude mcp list` shows whether Claude Code reaches the server.

## Connecting other clients

Any client that supports the streamable HTTP transport and custom headers can connect. It needs three things: the address `https://<your host>/mcp`, the transport `http` (streamable HTTP), and the header `Authorization: Bearer <key>`. Many clients read a JSON configuration in this shape; the exact key names differ between clients, so check the documentation of yours:

```json
{
  "mcpServers": {
    "manifold": {
      "type": "http",
      "url": "https://manifold.example.com/mcp",
      "headers": { "Authorization": "Bearer mfd_your_key" }
    }
  }
}
```

Keep this file out of version control, since it contains the key.

## Trying it by hand

To check a key without an AI client, ask for the tool list with curl. The transport requires the `Accept` header to name both JSON and event streams:

```bash
curl -X POST "https://manifold.example.com/mcp" \
  -H "Authorization: Bearer mfd_your_key" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

The answer is a JSON-RPC result with the tools this key may use.

## Tools

| Tool                  | Scope            | What it does                                                                                              |
| --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `search`              | any key          | Searches notes, services, file names and vault entry names at once, only in the modules the key may read. |
| `list_services`       | `services:read`  | Lists the services in their sidebar order.                                                                |
| `create_service`      | `services:write` | Adds a service at the end of the list.                                                                    |
| `update_service`      | `services:write` | Changes the alias, the address or both of a service.                                                      |
| `delete_service`      | `services:write` | Removes a service. It cannot be undone.                                                                   |
| `list_notes`          | `notes:read`     | Lists notes, most recently updated first, optionally only those that match a query.                       |
| `get_note`            | `notes:read`     | Reads one note with its content as Markdown and its version.                                              |
| `create_note`         | `notes:write`    | Creates a note from a title and Markdown content.                                                         |
| `update_note`         | `notes:write`    | Changes the title, the Markdown content or both of a note, based on the version last read.                |
| `trash_note`          | `notes:write`    | Moves a note to the trash, which also hides its map features.                                             |
| `restore_note`        | `notes:write`    | Takes a note out of the trash, with its map features.                                                     |
| `list_note_revisions` | `notes:read`     | Lists a note's revisions, newest first, with who wrote each one and when.                                 |
| `list_map_features`   | `map:read`       | Lists map features as a GeoJSON FeatureCollection, optionally within a box or for one note.               |
| `create_map_feature`  | `map:write`      | Places a pin, line or polygon on the map and links it to an existing note or a new one.                   |
| `update_map_feature`  | `map:write`      | Replaces the geometry of a feature, keeping its kind.                                                     |
| `delete_map_feature`  | `map:write`      | Removes a feature from the map. Its note stays.                                                           |
| `list_vault_secrets`  | `vault:read`     | Lists vault entries by name, with address and description, never their values.                            |
| `get_usage`           | `usage:read`     | Reports what the app keeps and the resources it uses, as on **Settings → Usage**.                         |

Each tool carries a description written for AI agents, which the client shows to the model together with the tool's arguments. Tools that only read are marked with `readOnlyHint`, so clients that support the hint can tell them from tools that change data.

A few tools need more than one step or a choice between arguments:

- `update_note` needs `version`, the version the agent last read with `get_note`. If the note changed since, the call fails with the code `version_conflict` and the `current_version`, and the agent should read the note again, merge and retry.
- `create_map_feature` takes a `geometry` and either `note_id` for an existing note, or `note_title` and optionally `note_markdown` for a new note, not both. Geometries are GeoJSON in longitude, latitude order, with the limits described under [Map features](api.md#map-features). Creating the note along with the feature needs only `map:write`.
- `list_notes`, `list_note_revisions`, `list_services`, `list_map_features` and `list_vault_secrets` page like the REST lists: they answer `next_cursor`, which the agent passes back as `cursor`.

## Answers and errors

Tools answer JSON as text. Note tools work with Markdown only: their answers leave out the TipTap JSON that the REST API also returns. `search` answers each hit's type, id, title, snippet and link.

When Manifold refuses a call, for example because a note changed, a record does not exist or a geometry crosses itself, the tool result is marked as an error and its text is the same error body the REST API sends, see [Errors](api.md#errors):

```json
{
  "error": {
    "code": "version_conflict",
    "message": "The record changed since that version.",
    "current_version": 2
  }
}
```

Arguments that do not match a tool's input schema are refused with a plain-text tool error before the tool runs. A missing or invalid key and the rate limit are answered on the HTTP level, with the status codes of the REST API.

## Keeping an agent in check

- Every change an agent makes to a note adds a revision, which you can restore in the app. Notes it moves to the trash can be restored until the trash is emptied. `delete_service` and `delete_map_feature` cannot be undone.
- The audit log under **Settings → Security** shows every write the agent made, with **API key** or **Note token** as the actor. See [Your account](account.md).
- To stop an agent at once, revoke or delete its key or note token under **Settings → API Keys**.
