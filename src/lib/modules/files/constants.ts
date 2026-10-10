// No imports, so the server manifest, the registry and the pages can all use these without a cycle.

/** The module id, and the owner of the files uploaded on the Files page. */
export const FILES_MODULE = 'files';

/** The most files a folder, a source or a filter lists at once. */
export const FILES_LIST_LIMIT = 500;

/** The most files one request to the Files page may upload; the page sends one per request. */
export const FILES_PER_REQUEST = 20;
