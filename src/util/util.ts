export function normalizeChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äÄ]/g, 'a')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/\s+/g, '-') // Whitespace → hyphen
    .replace(/[^a-z0-9-]/g, ''); // Removes everything except lowercase letters, digits and hyphens
}
