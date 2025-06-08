export function normalizeChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äÄ]/g, 'a')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/\s+/g, '-')              // Leerzeichen → Bindestrich
    .replace(/[^a-z0-9\-]/g, '');      // Entfernt alles außer Kleinbuchstaben, Zahlen und Bindestrich
}