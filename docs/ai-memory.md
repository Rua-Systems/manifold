# AI Memory

AI Memory is what you and your AI agents keep for each other: decisions, preferences, facts about projects, how things are done. Agents with an API key read it at the start of their work and write to it as they learn, through the [MCP server](mcp.md) or the [REST API](api.md#ai-memory). You read and change everything they write, and every change to a memory's text keeps the earlier text in its history.

AI Memory also keeps your **Prompts**: ready instructions that you and your agents use again, which MCP clients such as Claude Code offer as commands.

The **AI Memory** group in the sidebar lists **New Memory**, **Prompts**, a filter, your categories with their subcategories and newest memories, the memories without a category, and **Show all**.

## Memories

A memory is a title and a text, written in the same editor as [notes](notes.md), with headings, lists, tables, links and code. Memories hold text only: images stay in notes or files, and a memory links to them.

- **New Memory**, in the sidebar, on the AI Memory page or in the command palette, opens an empty memory at `/memory/new`. It is saved the first time you choose **Save** or press `Ctrl+S` (`Cmd+S` on a Mac), and then has an address of its own. A title is required.
- A memory has a **Category**, up to 20 **Tags** and a **Pinned** switch, chosen above the text.
- **Save** writes your changes. Until then the page shows **Unsaved changes**, and leaving it asks first.
- **Last changed by** under the text names who wrote the current version: you, or the API key by its name.

The AI Memory page at `/memory` lists the memories, pinned ones first, then by their last change, each with its category, tags and the beginning of its text. The filter above the list finds memories by words in their title and text, by category (with its subcategories, or **No category**), by tag, or only pinned ones; the address keeps the filter, so a filtered list can be bookmarked. Without a filter, the categories sit above the list with the number of memories in each.

## Categories

Categories are how memories are kept apart, such as **Work** with **Atlas**, **MEB** and **OFT** inside. There are exactly two levels: categories, and subcategories inside them.

- **Categories**, on the AI Memory page, lists them as a tree. **New Category** makes one at the top, and **Add subcategory** one inside a category. A name has up to 60 characters without slashes and differs from its neighbours whatever its case.
- The buttons of a category rename it and delete it. Only an empty category can be deleted: one without subcategories and without memories outside the trash. Memories in the trash lose their category when it goes.
- A category that an API key is limited to cannot be deleted either, since that would change what the key reaches; delete the key first.

Only you make categories. Agents file memories in the existing ones.

## Tags

Tags are global: you make them under **Settings → Tags**, with a name and a color, and AI Memory uses them. Agents choose from your tags by name and cannot make new ones, so the list stays yours. Deleting a tag takes it off every memory that had it.

## Pinned memories

A pinned memory is what every agent should know before it starts: who you are, how you like to work, the rules of a project. Agents read the pinned memories in full with their first call, and find the others through the search when they need them. Pin a few short memories rather than many long ones; at most 50 are handed out at once.

## History

Every save of a new title or text is a version. **History**, in the bar of a memory, lists them, newest first, with who wrote each and when. Your own saves within five minutes of an entry's first save share that entry; restoring a version and every write by an agent get an entry of their own.

Choose a version to read it; **Restore This Version** writes it back as a new version, so nothing is lost. Changing the category, the tags or the pin is not a new version.

If an agent changed the memory while you were editing it, saving shows a notice. **Reload** shows the memory as it is now, and your changes are dropped; **Keep Mine** saves your text over it, and the agent's version stays in the history.

## Trash

**Move to trash**, in the bar of a memory, moves it to the trash. **Trash** on the AI Memory page lists what is there; **Restore** brings a memory back, and **Delete Forever** deletes it with its history. Memories in the trash are deleted for good after `TRASH_RETENTION_DAYS` days, 30 unless configured otherwise. Agents can move memories to the trash and restore them, never delete them for good.

## Prompts

A prompt is an instruction you give again and again, such as a code review checklist or the way you want a meeting summed up. **Prompts**, in the sidebar or in the command palette, lists them at `/memory/prompts`, with a filter by words, category and tag.

- **New Prompt** opens an empty one. A prompt has a **Title**, a **Handle**, a **Description**, a **Category**, **Tags** and its **Text**.
- The handle, such as `code-review`, is how agents and MCP clients call it: lower case letters and digits, with single hyphens between words, up to 60 characters, and unique. A new prompt's handle follows its title until you change it.
- In the text, `{{name}}` marks a place that changes between uses, such as `{{file}}` or `{{ goal }}`: a letter or an underscore, then letters, digits or underscores, up to 40 characters in all, and at most 20 different places. Everything else is handed over exactly as written.
- **Try it**, beside the form, asks for each place and shows the filled text, which **Copy** puts on the clipboard.
- **Save** writes the prompt over the last one, without a history of earlier texts; a prompt changed elsewhere since you opened it is not overwritten. **Delete** removes a prompt for good; prompts have no trash.

Prompts sit in the categories of memories, so a category with prompts in it cannot be deleted, and a key limited to some categories reaches only the prompts in them.

The MCP server offers every prompt a key reaches as an MCP prompt, under its handle, with each place as an argument. Claude Code, for example, lists them as commands such as `/mcp__manifold__code-review` and asks for the places. Agents also get the tools `list_prompts`, `get_prompt`, which fills a prompt in, `save_prompt` and `update_prompt`. Prompts need the scopes `prompts:read` and `prompts:write`.

## Giving agents access

An agent needs an API key with `memory:read` to read memories, and also `memory:write` to write them; `prompts:read` and `prompts:write` do the same for prompts. Create it under **Settings → API Keys**, see [MCP server](mcp.md).

With `memory:read` or `memory:write` chosen, the form also lists your categories under **Memory categories**; a key with prompt scopes alone cannot be limited and reaches every prompt. Leave them all unchecked for a key that reaches every memory. Check some, and the key reads and writes only the memories in those categories and their subcategories:

- it does not see other memories or prompts in lists, the search, the context, the MCP prompts or by their id;
- it must file every memory and prompt it writes in one of its categories, never without one;
- it sees only its categories in the list of categories.

The list of keys shows such a key with **Memory limited to** and its categories. A limit is set when the key is created; for another limit, create another key.

## Through the API and MCP

The MCP server gives agents these tools, described in [MCP server](mcp.md#ai-memory):

- `get_memory_context`, the first call of a task: the pinned memories, the categories and the tags;
- `search_memories`, `get_memory` and `list_memory_categories` to read;
- `remember`, `update_memory`, `trash_memory` and `restore_memory` to write;
- `list_memory_revisions` for the history;
- `list_prompts`, `get_prompt`, `save_prompt` and `update_prompt` for prompts, which are MCP prompts as well.

The REST API has the same under `/api/v1/memories`, `/api/v1/memory-categories`, `/api/v1/memory/context` and `/api/v1/prompts`, with the text as Markdown and tags by name; see [REST API](api.md#ai-memory). Writes by agents are recorded in the audit log as `memory.create`, `memory.update`, `memory.trash` and `memory.restore`, and `prompt.create`, `prompt.update` and `prompt.delete`.
