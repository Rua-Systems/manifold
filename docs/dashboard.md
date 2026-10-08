# Dashboard

The dashboard sums up Manifold on one page: your notes and the map, your services, who and what has access, and how much room the data takes. It is the page you land on after signing in. **Dashboard** at the top of the sidebar and **Go to Dashboard** in the command palette open it.

The dashboard is measured when it opens; nothing is collected in the background. Every card has a fixed place, so nothing moves when the numbers change. On a wide page **Notes** and **Security and Access** stand side by side, **Map Notes** and **Usage** share the third column, and **Services** runs along the bottom with its shortcuts in rows. A narrower page has two columns, and a phone shows the cards one under another in the same order. The vault has no card, so nothing about your secrets shows here. The arrow in each card's corner opens the page the card sums up.

## The cards

| Card                    | What it shows                                                                                                                                                                                       | The arrow opens         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Notes**               | The notes outside the trash, those changed in the last seven days and those in the trash; a chart of the note revisions written each day of the last 30 days; the five notes changed most recently  | **Notes**               |
| **Security and Access** | The browsers signed in now, the API keys and note tokens that work now, a chart of failed sign ins each day of the last seven days, and the six latest events of the audit log with who caused them | **Settings → Security** |
| **Map Notes**           | The pins, lines and polygons of notes outside the trash                                                                                                                                             | **Map Notes**           |
| **Usage**               | The size of the database and of the uploaded files, the free space of the disk that holds the uploads, and the memory of the server                                                                 | **Settings → Usage**    |
| **Services**            | How many services you have, and every service as a shortcut with its icon; a shortcut opens the service in a new tab                                                                                | **Services**            |

The history keeps about one revision per five minutes of writing in the app, and one for every change through the API, MCP or a note token, so the revisions of a day show how much the notes changed rather than every save; [Notes](notes.md#history) explains the history. Days in the charts are days in UTC.

## Reading the charts

Each chart has a line above it with the total of the period and its busiest day, or **None in this period**. The busiest day carries its number on its column.

- Point at a column to see its day and its number.
- With the keyboard, move to the chart with `Tab`, then use the `Left` and `Right` arrows to go from day to day, and `Home` and `End` for the first and the last day. Screen readers read each day's number as you go.
- Every chart also has a table with every day and its number, which screen readers find under the chart's title.

[Usage report](usage.md) measures the data in full, and [Your account](account.md) explains sessions and the audit log.
