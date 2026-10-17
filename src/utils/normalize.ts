export function normalizeId(raw: string): string {
  const trimmed = raw.trim();
  if (!/^[a-zA-Z0-9 -]{1,64}$/.test(trimmed))
    throw new Error('Use 1–64 letters, digits, spaces or hyphens for the student ID.');
  const id = trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!id) throw new Error('Student ID is required.');
  return id;
}
export function sectionKey(section: string): string {
  return section.trim().toUpperCase();
}
