// The app's folders are one list for the buildings, the props and the mods (backend/internal/store/folders.go): the ones that were made, and the ones something is in.
/** The names of several lists of folders as one: no empty name, none twice, in order. */
export const folderNames = (...lists) => [...new Set(lists.flatMap(l => l ?? []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
