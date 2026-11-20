# Files

The Files page keeps every file stored in Manifold in one place: the files you upload there, in folders of your own, and the files other parts of Manifold keep, such as the images in your notes and the icons of your services. **Files** in the sidebar opens it.

## What the page shows

At the top of **Files** come the modules that keep files of their own, then your folders, then the files you uploaded outside a folder.

- **Notes**, **Services** and **API** list the files those keep: the images and attached files of your notes, service icons, and files uploaded through the REST API without a folder, whether something uses them or not. Each shows only while it holds files. Their files belong to the note, the service or the script that uploaded them, so they cannot be renamed or moved here.
- Folders can hold folders. The path above the list shows where you are; select a part of it to go back up.
- Each file shows its type, its size and when it was added. A file that a note or a service shows says **In use** with the number of places.
- A folder, a module or a filter lists at most 500 files; narrow a longer list with the filter.

## Uploading

- Choose **Upload**, or drop files from your computer onto the list or onto a folder. Each file is sent on its own, with its progress under **Uploads**. A file that fails says why, and the others go on.
- Any file except an empty one is accepted, up to `UPLOAD_MAX_BYTES`, 100 MB unless changed; see [Configuration](configuration.md). Manifold recognises images, PDF, audio and video from their content, and text from a `.txt`, `.log`, `.md`, `.markdown`, `.csv` or `.json` name with UTF-8 content. Any other file is kept as it is and can only be downloaded.
- Without JavaScript the form still works: choose the files, then **Send**. Up to 20 files go with one **Send**; any more are left out.
- At most 120 uploads a minute are accepted, copies saved by the image editor included.

## Folders and moving

- **New Folder** makes a folder in the folder you are in. A name has up to 100 characters, no slashes, and is unique within its folder whatever its case. A file name has up to 200 characters and no slashes.
- **Rename**, **Move** and **Delete** sit beside each folder and each of your files, and every file has **Download**. The files of Notes, Services and API have **Download** and **Delete** only. You can also drag a file or a folder onto another folder, or onto a part of the path, to move it there.
- A folder can be deleted once it is empty.

## Finding files

The filter above the list searches the names of all files, wherever they are. **Type** narrows them to images, PDF, audio, video, text or other files, and **Unused only** to files that nothing shows. The sort puts the newest, the oldest, the largest or the names in order first. The address keeps the filter, so a filtered list can be bookmarked. The [search and the command palette](search.md) find files by name too.

## Previewing

Select a file to open its page:

| Type                                                                                         | Preview                                                                |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Images: PNG, JPEG, WebP and GIF, and SVG of up to 1 MB without scripts or outside references | The image                                                              |
| PDF                                                                                          | Every page, drawn in the browser as you scroll down                    |
| Audio (MP3, WAV, OGG, FLAC, M4A) and video (MP4, WebM, MOV)                                  | The browser's player, which can jump to any point                      |
| Text: `.txt`, `.log`, `.md`, `.markdown` and `.json`                                         | The first megabyte as plain text; JSON indented                        |
| CSV                                                                                          | The first 500 rows as a table, separated by commas, semicolons or tabs |
| Anything else                                                                                | No preview; **Download** saves it                                      |

The page also lists the type, the size, when the file was added, and every place that shows it. Whether the browser plays a video depends on how the video was encoded.

## Editing images

**Edit image** on the page of a PNG, JPEG, WebP or GIF image opens a simple editor in the browser:

- **Turn left** and **Turn right** by a quarter, and **Flip horizontally** or **Flip vertically**.
- **Crop**: drag over the image to choose the part to keep, then **Apply crop**. **Undo crop** brings the whole image back; turning or flipping starts from the whole image again.
- **Brightness**, **Contrast** and **Saturation**, from -100 to 100, and the filters **Black and white** and **Sepia**.

**Save copy** keeps the result as a new file beside the original, named like `photo (edited).jpg`: in the same folder, or at the top of **Files** when a note or a service keeps the original. The original and every note that shows it stay as they are. A GIF is saved as a PNG of its first frame, and an edited image stays under the image limit of 10 MB, or `UPLOAD_MAX_BYTES` when that is smaller. **Start over** drops the changes, and **Cancel** leaves the editor without saving.

## In notes

**Insert from Files** in the note editor puts a stored file into a note: a PNG, JPEG, WebP or GIF image inline, any other file, SVG included, as a link with its name and size. **Attach file** uploads a new one the same way. The note then uses the file, and its page lists the note. While reading the note, the link opens the file's page here. See [Notes](notes.md#images-and-files).

## Deleting

**Delete** removes a file for good. A file in use cannot be deleted: its page lists the notes and services that show it, and once it is gone from all of them, it can be deleted. A note keeps using a file while its current text or any version in its history shows it, and a note in the trash keeps its files until it is deleted for good.

Files that the Files page does not keep and that nothing uses any more, such as an upload never saved into a note, are deleted by the daily housekeeping once they are a day old, as before.

## Through the API and MCP

The [REST API](api.md#files) lists, uploads, renames, moves and deletes files and manages folders with the `files:read` and `files:write` scopes; an upload with a `folder_id` lands in the Files module. Over [MCP](mcp.md), agents with `files:read` list files and folders, read a file's details and read text files; they cannot change files.

## Safety

Files are sent with their exact type and a policy that keeps them from running as a page. Only the types above are shown in the browser; any other file is always sent as a download and never opened by Manifold. Manifold does not scan files for viruses, so treat a downloaded file like any other from the internet. A PDF opened on its own, outside its page here, is downloaded instead of shown. Files are served only to you while signed in, to API keys with `files:read`, and to note tokens and visitors of a shared note for the files their note shows. [Security](security.md#content-and-uploads) has the details.
