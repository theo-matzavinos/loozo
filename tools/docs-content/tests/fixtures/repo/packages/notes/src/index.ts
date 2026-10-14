/**
 * Returns the title of a note.
 *
 * @param note - The note.
 */
export function noteTitle(note: { readonly title: string }): string {
  return note.title;
}
