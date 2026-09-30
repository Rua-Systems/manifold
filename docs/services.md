# Services

Services are links to the services you run, such as a router, a monitoring dashboard or a NAS, each with an optional icon. They are kept in an order you choose and appear in three places: on the **Services** page, in the sidebar and in the command palette. **Services** is also the page you land on after signing in.

## The Services page

Open **Services** in the sidebar, or **Go to Services** in the command palette. Every service is a card with its icon, its alias and its address. The alias is a link that opens the service in a new tab, and the buttons of the card move it up or down, edit it and delete it.

## Adding a service

1. Choose **New Service**.
2. Enter an **Alias**, the name you want to see, of up to 60 characters.
3. Enter the **URL**. Only addresses that start with `http://` or `https://` are accepted; the server refuses any other scheme too.
4. Optionally choose an **Icon**.
5. Choose **Add Service**.

A new service goes to the end of the list. **New Service** in the command palette opens the page with this dialog already open.

## Icons

An icon may be a PNG, JPEG, WebP, GIF or SVG image of up to `UPLOAD_MAX_BYTES`, 10 MB by default. The format is recognised from the content of the file, never from its name, so a renamed file that is not an image is refused. The dialog shows a preview as soon as you pick a file. A service without an icon shows the first letter of its alias instead.

To change an icon, edit the service and pick a new file; **Remove the icon** takes it away. An icon file that no service uses any more is deleted by the daily housekeeping, at the earliest a day after it was uploaded.

Icons are served only to you while you are signed in, and to API keys with the `files:read` scope. SVG icons must be UTF-8 and may not contain scripts, embedded documents such as `foreignObject`, event handlers like `onload`, entity declarations or references to other addresses; such a file is refused like any unsupported one. Icons are only ever shown as images.

## Editing and deleting

- The pencil button opens **Edit Service** with the alias, the address and the icon. **Save** stores the changes.
- The trash button opens **Delete Service**; choose **Delete** to confirm. Deleting a service cannot be undone.

## Changing the order

The order of the page is the order of the sidebar and of the command palette.

- **Dragging**: on a desktop, drag a card to its new place with the mouse. The order is saved when you drop it.
- **Move buttons**: the arrow buttons on each card move a service one place up or down, and work with a keyboard and on touch screens. On phones they are the only way, and the drag handle is hidden.

A drag is refused when the list changed somewhere else in the meantime, for example through the API; reload the page and try again.

## In the sidebar and the command palette

The **Services** group of the sidebar lists every service in your order, with its icon or its first letter. Each entry opens the service in a new tab; **Manage** at the end opens the **Services** page. The arrow next to the group closes or opens it, and each browser remembers that choice.

In the command palette your services have a section of their own. Typing narrows them by alias or address, and `Enter` opens the highlighted one in a new tab. The search finds services by alias and address too; see [Search and the command palette](search.md).

## Through the API and MCP

API keys with `services:read` read the services, and keys with `services:write` add, change, reorder and delete them. The REST API works with the alias, the address and the order, and the MCP server with the alias and the address. Icons are uploaded only on the **Services** page; the API shows them as an address. Writes through the API or MCP are recorded in the audit log, changes on the page are not. [REST API](api.md) and [MCP server](mcp.md) describe the routes and tools.
