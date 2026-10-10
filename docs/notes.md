# Notes

Notes are rich text documents with headings, lists, tables, code and images. They save themselves while you type, keep a history of versions and go to a trash before they are deleted. A note can also have places on a map; [Map Notes](map-notes.md) covers that side.

## Finding your notes

- **The sidebar**: the **Notes** group lists **Map Notes**, **New Note**, a filter, your 100 most recently changed notes and **Show all**.
- **The Notes page**: **Show all**, or **Go to Notes** in the command palette, opens `/notes` with every note, most recently changed first, each with the beginning of its text and when it was last updated. **Trash** and **New Note** sit at the top.
- **The search**: the command palette and the search page find notes by words in their title and text; see [Search and the command palette](search.md).

Both filters, **Filter notes** in the sidebar and on the Notes page, use the rules of the search, so they find words inside notes and not only in titles. The sidebar filter narrows the listed notes as you type and then shows up to ten matches from the search, which also finds notes beyond the hundred it lists. The filter on the Notes page updates the list shortly after you stop typing and shows up to 100 matches, best first; the address keeps the filter as `?q=`, so a filtered list can be bookmarked.

## Writing a note

Choose **New Note**. Type a title in the field at the top, which says **Untitled** while it is empty, and write below it. The note is created with its first save, and the address then changes to the note's own; if you leave without typing anything, nothing is created.

A title has up to 200 characters. Notes without a title appear as **Untitled** in lists. Editing a note needs JavaScript; the Notes page, its filter and the trash work without it.

## Reading and writing

A saved note opens for reading: the title and the text without the toolbar, and links open with a click. **Edit**, the pencil at the top, switches to writing: the title becomes a field, the toolbar appears and the text can be changed. **Edit** again goes back to reading and saves what is still pending. A new note opens for writing, and so does a note without a title or text, such as one just created on the map.

## Focus mode

**Focus mode** at the top shows the note alone over the whole screen, with the rest of the app blurred behind it, whether you read or write. While reading it shows the title and the text; while writing, the title field, the toolbar and the text. The save status and **Edit** stay at the top, so you can switch between reading and writing without leaving it. **Focus mode** again, or `Escape`, leaves it. The note panel of the map has no focus mode.

## The editor

The toolbar above the text holds every kind of content a note can have. Hover over a button to see its name and, where there is one, its keyboard shortcut. `Ctrl` in the shortcuts is `Cmd` on a Mac.

| Group         | Buttons                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Undo and redo | **Undo** (`Ctrl+Z`) and **Redo** (`Ctrl+Y`)                                                                   |
| Text style    | **Paragraph**, **Heading 1**, **Heading 2** and **Heading 3** (`Ctrl+Alt+1` to `Ctrl+Alt+3`)                  |
| Formatting    | **Bold** (`Ctrl+B`), **Italic** (`Ctrl+I`), **Strikethrough** (`Ctrl+Shift+S`) and **Inline code** (`Ctrl+E`) |
| Lists         | **Bulleted list**, **Numbered list** and **Task list**                                                        |
| Blocks        | **Quote**, **Code block**, **Divider** and **Insert table**                                                   |
| Insert        | **Link** and **Insert image**                                                                                 |

- **Task lists** have a checkbox per item, and items can be nested.
- **Code blocks** are highlighted. The **Code language** menu above a block sets its language from a list of common ones; while it shows **Plain text**, the language is guessed from the code. **Copy code** copies the block.
- **Tables** start with three columns and three rows, the first of them a header row. While the cursor is in a table, a small menu offers **Add row**, **Delete row**, **Add column**, **Delete column**, **Toggle header row** and **Delete table**.
- **Links**: select the text, choose **Link**, enter the **Link address** and choose **Apply**. Links must start with `http://`, `https://` or `mailto:`. Addresses you type become links by themselves, and pasting an address over selected text links it. While the cursor is in a link, a small menu offers **Open link**, which opens it in a new tab, **Copy link** and **Remove link**.

The toolbar is a single row. Where it does not fit, as in the note panel of the map or on phones, it scrolls sideways.

## Images

Add an image with **Insert image**, by pasting it, or by dragging the file into the text. The image is uploaded right away and appears where you inserted it.

- PNG, JPEG, WebP and GIF images of up to 10 MB, or `UPLOAD_MAX_BYTES` when it is smaller, are accepted. The format is recognised from the content of the file, never from its name. SVG is not accepted in notes.
- Every image must be uploaded to Manifold. A note that shows an image from another site cannot be saved and reports **Images must be uploaded to this instance.**
- Images are served only to you while you are signed in, and to API keys with the `files:read` scope.
- An image stays stored as long as the note or any version in its history shows it, so restoring an old version brings its images back. Once nothing shows it any more, the daily housekeeping deletes it, at the earliest a day after it was uploaded.

A whole note, with its structure, may be up to 2 MB.

## Saving

The note saves itself: 1.5 seconds after your last change, when you leave the title or the text, when you go back to reading, before you move to another page and when you switch to another tab. `Ctrl+S`, or `Cmd+S` on a Mac, saves at once. Only one save runs at a time. The status next to the buttons at the top shows what happened:

| Status              | Meaning                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Saved**           | Everything you wrote is stored.                                                                                                             |
| **Unsaved changes** | A save follows shortly.                                                                                                                     |
| **Saving**          | A save is running.                                                                                                                          |
| **Not saved**       | The last save failed. The message says why; your text stays in the editor, and the next change, leaving the editor or `Ctrl+S` tries again. |
| **Conflict**        | The note was changed somewhere else; see below.                                                                                             |

### Changes in another tab or on another device

Every save names the version it was based on. When the note was saved somewhere else in the meantime, in another tab, on another device or through the API, the editor stops saving and shows **This note was changed somewhere else. Your edit is not saved yet.** at the bottom of the screen, so neither version is overwritten silently. Choose one:

- **Reload** drops your unsaved edit and loads the note as it is now.
- **Keep Mine** saves your version on top of the other one.

## History

**History**, the clock button at the top of a note, lists the versions of the note, newest first, each with who made it (**Owner**, **API key**, **Note token** or **System**) and when.

Manifold does not keep every autosave. While you edit in the app, a save within five minutes of the start of the newest entry updates that entry instead of adding one, as long as you made that entry yourself; the history therefore holds about one entry per five minutes of editing. Writing on a shared note's page works the same way for each token. Changes through the API or MCP and restores always add an entry of their own. Version numbers count every save, so the history may skip numbers. Entries are kept as long as the note exists.

Choose an entry to see it: **Viewing version N, read only.** appears above the text. **Restore This Version** writes it back as a new version on top of the current one, so nothing is lost; **Back to Current** returns to the editor without changing anything.

## Trash

**Move to trash**, the trash button at the top of a note, takes it out of the lists, the sidebar and the search, hides its places on the map and returns you to the Notes page. Nothing is deleted yet.

The **Trash** page at `/notes/trash` lists the trashed notes, most recently trashed first:

- **Restore** brings a note back with its history and its places on the map.
- **Delete Forever** asks for confirmation and deletes the note with its history and its map geometries. This cannot be undone. Images no longer used by any note are removed by the housekeeping afterwards.

Notes stay in the trash for `TRASH_RETENTION_DAYS`, 30 days by default, and are then deleted for good by the daily housekeeping. The Trash page shows the number of days that applies.

## Location

Below the text of a saved note, **Location** shows a small map of the note's pins, lines and polygons, or **This note has no location yet.** **Show on Map** opens the map at these places, and **Add Location** opens the map ready to draw one for this note. [Map Notes](map-notes.md) explains both.

## Sharing a note

A note token opens one note for someone who has no account, or for a script or an agent that should see this note and nothing else. **Share**, in the bar of a saved note, opens **Share This Note**:

1. Enter a **Name** that tells who or what the token is for, up to 100 characters.
2. Choose the **Access**: **Read only**, or **Read and edit**.
3. Choose the day under **Works until**. It starts a week from today, and every token needs one: it works until the end of that day in UTC.
4. Choose **Create Token**. If you have not confirmed your identity in the last ten minutes, **Confirm Your Identity** asks for your password first, as for an API key.
5. Copy the **Share link** with **Copy Link**, or the token itself with **Copy Token**. Both are shown only once.

The dialog also lists the tokens of this note with their access, their last day and their status. **Settings → API Keys** lists every note token under **Note Tokens**, with its note, when and from where it was last used, **Revoke**, which stops it at once, and **Delete**, which also removes it from the list. Deleting a note for good deletes its tokens, and a note in the trash opens for none of them until you restore it.

### Opening a shared note

The share link has the form `https://manifold.example.com/shared#mfn_...`. Opening it shows the note on its own page, without the sidebar and without signing in:

- With **Read only**, the title and the text, with images and links, and nothing to change.
- With **Read and edit**, the title field and the editor with its toolbar, saving by itself like the note page, and with `Ctrl+S`. Images cannot be added through a link, and the history and the trash are not offered. A save that meets a newer version written elsewhere shows the same conflict notice as the note page.

The token sits after the `#` of the link, a part browsers never send to a server; the page takes it out of the address at once and keeps it in a cookie of this browser until the token's last day. **Close Note** forgets it. A revoked, expired or deleted token shows **Open Note** instead, where a token can also be pasted by hand. Changes made with a token are recorded in the history and in the audit log with **Note token** as the author.

## Through the API and MCP

API keys with `notes:read` read notes and their history; keys with `notes:write` create and change notes, move them to the trash and back, and restore versions. Neither can delete a note for good. A note token works as a key for its own note alone: it reads the note, and with **Read and edit** it changes it, see [Note tokens](api.md#note-tokens). Scripts and agents can send and receive notes as Markdown; [REST API](api.md) and [MCP server](mcp.md) describe how.
