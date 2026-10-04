# Map Notes

Map Notes places your notes on a map. You draw pins, lines and polygons, and every one of them belongs to a note, which you read and edit in a panel next to the map. Map Notes is part of the Notes module: the notes are the same ones you see under **Notes**, described in [Notes](notes.md).

## The map page

Open **Map Notes** in the **Notes** group of the sidebar, or run **Map Notes** in the command palette; the address is `/notes/map`. The map shows every geometry of every note outside the trash. Drag to move the map and scroll or pinch to zoom; the zoom buttons sit in the bottom left corner, and the credits of the map tiles are folded behind a small button on the map.

Each browser remembers where you left the map and opens there next time. A browser that has no saved view yet, or whose storage is blocked, starts from the default view of the instance; see [Tiles and the default view](#tiles-and-the-default-view).

## The map tools

The toolbar, **Map tools**, sits in the top left corner of the map on a desktop and in a row below the map on a phone.

| Tool                  | What it does                                                                        |
| --------------------- | ----------------------------------------------------------------------------------- |
| **Select**            | Click a geometry to open its note in the panel. Click empty map to close the panel. |
| **Drop a pin**        | Places a pin where you click.                                                       |
| **Draw a line**       | Draws a line through the points you click.                                          |
| **Draw a polygon**    | Draws an area from the corners you click.                                           |
| **Move points**       | Drag a pin, or any point of a line or polygon, to a new place.                      |
| **Delete a geometry** | Click a geometry to delete it, after a confirmation.                                |
| **Undo last point**   | Removes the last point of the drawing in progress.                                  |
| **Cancel drawing**    | Drops the drawing in progress. `Escape` does the same on a keyboard.                |
| **My location**       | Moves the map to where your device is, after your browser asks for permission.      |

**Undo last point** and **Cancel drawing** work only while you draw. If the browser cannot tell your location, or you refuse it, **My location** reports **Your location is not available.**

## Drawing

1. Choose **Drop a pin**, **Draw a line** or **Draw a polygon**.
2. Click or tap the map for each point. A pin needs one, a line at least two and a polygon at least three.
3. Finish a line by clicking its last point again, which a double click does. Finish a polygon by clicking its first point, or its last point again.

While you draw, and while you move points, a point near an existing geometry snaps onto it, which makes shapes meet exactly. When a drawing is finished, the tool goes back to **Select** and the panel **New Location** asks what the geometry belongs to:

- **New Note** creates an untitled note with this geometry and opens it in the panel, ready for a title and text.
- **Link to Existing Note** lists your notes, most recently changed first, with **Find a note** to narrow them by title. The list shows up to 50 notes; type part of the title to find others. Choose a note to link the geometry to it.

Closing the panel with the close button drops the drawing without saving it.

## The note panel

Selecting a geometry, or linking a new one, opens the panel **Location**. On a desktop it sits to the right of the map; on a phone it is a sheet above the toolbar.

- The top of the panel names the kind of the geometry, **Pin**, **Line** or **Polygon**, and offers **Unlink and Delete This Geometry**. The note itself stays.
- **Other locations of this note** lists the note's other geometries, with **Zoom to** for each.
- Below, the note opens in the same editor as on its own page, with automatic saving, **History** and **Move to trash**. Moving the note to the trash closes the panel and hides its geometries.
- **Open as Page** opens the note at its own address, and the close button closes the panel.

Closing the panel, or selecting a geometry of another note, saves any pending changes first.

On a phone the sheet starts at half the height of the screen. Tap its handle, or drag it up, for the full height, and tap or drag down again to shrink it; dragging down from half height closes it.

## Linking geometries and notes

Every geometry belongs to exactly one note, and a note can have any number of geometries. Besides drawing on the map page, two links on a note's own page connect it with the map. Below the text, **Location** shows a small, still map of the note's geometries, or **This note has no location yet.**

- **Add Location** opens the map ready to draw for this note: **Draw a location for** and the note's title appear on the map, with **Cancel**. The next geometry you finish belongs to that note right away, and its panel opens.
- **Show on Map** opens the map zoomed to the note's geometries, with the panel open on the first one.

To move a geometry to another note, delete it and draw it again for the other note.

## Changing and deleting geometries

- **Move points** saves every change as soon as you let go. If the result is not a valid geometry, it returns to its previous shape and a message says why.
- **Delete a geometry**, and **Unlink and Delete This Geometry** in the panel, ask **Delete Geometry** for confirmation: **Delete this geometry? Its note stays.** Choose **Delete**. This cannot be undone.

Every geometry must follow these rules; a drawing that breaks one is refused with a message:

- Only pins, lines and polygons can be stored.
- A geometry can have at most 10,000 points.
- A geometry must be valid; for example, the edges of a polygon may not cross each other.

## Notes in the trash

Moving a note to the trash hides its geometries from the map. Restoring the note brings them back, and deleting the note for good deletes them too. [Notes](notes.md) explains the trash.

## Basemaps

The map beneath the geometries is the basemap. **Standard**, the instance's own, comes from `MAP_TILE_URL` and is always there; more can be added under **Settings → Map**.

- **New Basemap** asks for a **Name**, the **Tile address**, an **Attribution** and a **Maximum zoom**. The tile address is an XYZ template over `https` with `{z}`, `{x}` and `{y}`, such as `https://tile.example.com/{z}/{x}/{y}.png`. `{-y}` counts rows from the bottom, `{a-c}` or `{1-4}` spreads the requests over subdomains, and Leaflet's `{s}` is read as `{a-c}`. The attribution is plain text shown in the corner of the map. The maximum zoom, 19 unless you change it, is the deepest level the tiles exist for; the map does not zoom further.
- One basemap is in use at a time, on the map page and on the small map of every note page. **Use** on the settings page or **Basemap** in the map tools switches it; the choice is stored with the account, so every browser shows the same basemap.
- The settings page orders, edits and deletes the added basemaps. Deleting the basemap in use brings back **Standard**.
- A tile address with a key in it, such as `?access_token=`, is visible to every API key with `map:read` and in the browser, which requests the tiles itself.

## Tiles and the default view

Four environment variables shape the map; [Configuration](configuration.md) lists them with every other variable.

| Variable               | Default                                                    | Purpose                                                                        |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `MAP_TILE_URL`         | `https://tile.openstreetmap.org/{z}/{x}/{y}.png`           | The address template of the **Standard** basemap, with `{z}`, `{x}` and `{y}`. |
| `MAP_TILE_ATTRIBUTION` | OpenStreetMap contributors, linked to their copyright page | The credits shown on the map. HTML, such as a link, is allowed.                |
| `MAP_DEFAULT_CENTER`   | `0,20`                                                     | The centre of the default view as `longitude,latitude` in degrees.             |
| `MAP_DEFAULT_ZOOM`     | `2`                                                        | The zoom level of the default view, from 0 to 22.                              |

- Manifold's pages load images only from Manifold itself and from `https` addresses, so the tile server must use `https`.
- The default view applies only to browsers without a saved view of their own. A browser that has used the map keeps its last view.
- With **Standard**, the map zooms in up to level 19; other basemaps set their own maximum.

## Through the API and MCP

API keys with `map:read` read the geometries and the basemaps, and keys with `map:write` add, change and delete them and put a basemap in use. Basemaps have REST routes only, no MCP tools. Geometries travel as GeoJSON in longitude and latitude, rounded to seven decimals, which is about a centimetre. [REST API](api.md) and [MCP server](mcp.md) describe the routes and tools.
