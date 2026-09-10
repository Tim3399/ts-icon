interface ImageRow {
  id: string;
  channelName: string;
  channelId: string | null;
  aliases: { alias: string }[];
}
interface Channel {
  cid: string;
  name: string;
}

/** Pure plan: ambiguous names, aliases and already-owned CIDs never get guessed. */
export function planBackfill(
  rows: ImageRow[],
  channels: Channel[],
  normalize: (name: string) => string,
) {
  const updates: { id: string; channelName: string; channelId: string }[] = [];
  const conflicts: { id: string; channelName: string; reason: string; candidates: string[] }[] = [];
  const unmatched: { id: string; channelName: string }[] = [];
  const aliasOwners = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const alias of [row.channelName, ...row.aliases.map((item) => item.alias)]) {
      const key = normalize(alias);
      const owners = aliasOwners.get(key) || new Set<string>();
      owners.add(row.id);
      aliasOwners.set(key, owners);
    }
  }
  for (const row of rows.filter((item) => item.channelId === null)) {
    const key = normalize(row.channelName);
    const candidates = channels.filter((channel) => normalize(channel.name) === key);
    if (candidates.length === 0) {
      unmatched.push({ id: row.id, channelName: row.channelName });
      continue;
    }
    const candidate = candidates[0];
    const reason =
      candidates.length > 1
        ? "Several TeamSpeak channels share the legacy name"
        : (aliasOwners.get(key)?.size || 0) > 1
          ? "Several images share the legacy name or alias"
          : rows.some((item) => item.channelId === candidate.cid)
            ? "Channel ID already belongs to another image"
            : undefined;
    if (reason) {
      conflicts.push({
        id: row.id,
        channelName: row.channelName,
        reason,
        candidates: candidates.map((channel) => channel.cid),
      });
    } else {
      updates.push({ id: row.id, channelName: row.channelName, channelId: candidate.cid });
    }
  }
  return { updates, conflicts, unmatched };
}
