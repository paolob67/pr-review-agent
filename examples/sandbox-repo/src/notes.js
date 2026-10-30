// In-memory notes store. No persistence on purpose: this is a sandbox target.

const MAX_TEXT = 500;

export function createStore() {
  const notes = new Map();
  let nextId = 1;

  return {
    list() {
      return [...notes.values()];
    },
    add(text) {
      if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT) {
        throw new RangeError(`text must be a string of 1 to ${MAX_TEXT} characters`);
      }
      const note = { id: nextId++, text };
      notes.set(note.id, note);
      return note;
    },
    remove(id) {
      return notes.delete(id);
    },
  };
}
