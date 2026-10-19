// Pure helpers for the music link of a MAM schedule item (MinuteByMinuteView,
// MyScheduleView). Kept out of the views so the rule lives once and both
// screens render it the same way (same idea as mamTime.ts).
//
// The URL gate mirrors the API side: `importSongsFromMam` (retreatMemoryService)
// only treats ^https?:// as a real link, so anything else typed in the
// "URL de música" field (e.g. a song name) renders no anchor here either.

export interface MusicLink {
  url: string;
  label: string;
}

const HTTP_URL = /^https?:\/\//i;

/**
 * True when the value would render a playable anchor. The edit modal warns
 * inline with this: a non-http(s) value is saved as-is but renders no link
 * anywhere, and that used to fail silently at the retreat.
 */
export function isPlayableMusicUrl(value: string | null | undefined): value is string {
  const url = value?.trim();
  return !!url && HTTP_URL.test(url);
}

/**
 * Tap target info for an item's music track, or null when the item has no
 * playable link. The label falls back to «Música» when the song name is
 * missing.
 */
export function musicLink(item: {
  musicTrackUrl?: string | null;
  palanquitaNotes?: string | null;
}): MusicLink | null {
  const url = item.musicTrackUrl?.trim();
  if (!isPlayableMusicUrl(url)) return null;
  const label = item.palanquitaNotes?.trim() || 'Música';
  return { url, label };
}
