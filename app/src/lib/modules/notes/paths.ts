/** The `/notes/[id]` segment of a note that does not exist yet; its first save creates it. */
export const NEW_NOTE_ID = 'new';

/** Dependency of the note page's `load`, invalidated to reload the note and its history. */
export const NOTE_DEPENDENCY = 'app:note';

/** Dependency of the map page's `load`, invalidated after its geometries change. */
export const MAP_DEPENDENCY = 'app:map';
