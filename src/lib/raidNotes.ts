export function raidNotes(notes: string[] = []): string[] {
  return notes
    .filter((note) => !note.startsWith('GO Hub default Mega benchmark uses Super Max Level'))
    .map((note) =>
      note.startsWith('Special + moves require the applicable Mega Level and move unlocks')
        ? '+ moves are available while Mega Evolved and get stronger with Mega Level.'
        : note,
    );
}
