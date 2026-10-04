# Search and the command palette

One search covers your notes, your services and the names of your vault entries. You reach it through the command palette, which also moves you between pages and runs common actions, and through a search page of its own.

## What is searched

| Module   | What is searched                                               | Where a hit leads                |
| -------- | -------------------------------------------------------------- | -------------------------------- |
| Notes    | The title and the text of every note outside the trash         | The note                         |
| Services | The alias and the address                                      | The service itself, in a new tab |
| Vault    | The name and the service address, never the value or the notes | The Vault page                   |

Pins, lines and polygons on the map have no text of their own; you find them through the notes they belong to. Notes in the trash are left out.

## How matching works

A note matches when one of these is true:

- Every word you type is the beginning of a word in its title or text. `fer` finds "ferry", and `ferry book` finds a note in which both appear, in any order.
- Its title contains what you typed, anywhere and in any case.
- Its title, or one of the words in it, looks like what you typed, which catches small typing mistakes. `gardn` finds "Weekly planning for the garden project".

Services match when their alias or address contains what you typed or looks like it, and vault entries when their name or service address contains it or their name looks like it. Here too, a single word that looks like what you typed is enough.

- Upper and lower case never matter.
- For the first rule only letters and digits count; punctuation and other signs separate words, and up to eight words are used.
- Words are not reduced to a stem, which treats Turkish and English text alike. In the text of a note, `kitap` finds "kitaplar" because it is the start of the word, but `books` does not find "book".
- Only the first 200,000 characters of a note's text are searched.

Hits of all modules are sorted together, best first. A title, alias or name that contains what you typed ranks near the top. Note hits come with a short passage of the text around the words you searched for.

## The command palette

Press `Ctrl+K`, or `Cmd+K` on a Mac, on any page while you are signed in, or choose **Search** at the top of the sidebar. The palette starts empty each time and lists everything it offers, in sections:

| Section            | Entries                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Go to**          | **Go to** each module and to **Settings**, **Security**, **API Keys** and **Data**; **New Service**, **Map Notes** and **New Note** |
| **Actions**        | **Toggle light and dark theme**, switching to the other language, and **Logout**                                                    |
| **Services**       | Every service, with its address; choosing one opens it in a new tab                                                                 |
| **Search results** | Hits of the search, from the second character you type on, and **All results for** what you typed                                   |

Typing narrows the first three sections to entries whose text contains what you typed. From the second character on, the palette also asks the search, shortly after you stop typing, and lists up to ten hits under **Search results**, each with a short passage, an address or its kind (**Note**, **Service** or **Vault**). The last entry, **All results for** what you typed, opens the [search page](#the-search-page) with every hit. **Nothing matches.** means neither found anything.

**New Service** opens the Services page with its dialog open, and **New Note** starts a new note.

### Keyboard

The cursor stays in the input while you move through the list, so you can keep typing at any time.

| Key                    | Action                                                    |
| ---------------------- | --------------------------------------------------------- |
| `Down` and `Up` arrows | Move to the next or previous entry, wrapping at the ends. |
| `Home` and `End`       | Move to the first or last entry.                          |
| `Enter`                | Run the highlighted entry.                                |
| `Escape`               | Close the palette.                                        |

Typing highlights the first entry again. With a mouse, point at an entry to highlight it and click to run it; a click outside the palette closes it.

## The search page

The page at `/search` runs the same search without the palette, and works without JavaScript. The palette's **All results for** entry opens it with what you typed. Enter your words and choose **Search**; the page lists up to 50 hits, each with its kind and its passage. The address keeps the query as `?q=`, and `types` limits the hits to some modules, for example `/search?q=ferry&types=note`. The types are `note`, `service` and `secret`.

## Filtering notes

The filters for notes use the same rules as the search. **Filter notes** in the sidebar narrows the listed notes as you type and then shows up to ten hits of the search among all notes; the filter on the Notes page shows up to 100 hits. [Notes](notes.md) describes both.

## On phones

On a phone the search button in the top bar opens the palette, which then fills the screen. Tap an entry to run it. The sidebar, with its notes filter, opens with the menu button in the top bar.

## Through the API and MCP

Scripts and agents search with `GET /api/v1/search` or the `search` tool of the MCP server. Any key may search, but the hits leave out every module the key has no read scope for: a key with only `notes:read` finds only notes. [REST API](api.md) and [MCP server](mcp.md) describe both.
