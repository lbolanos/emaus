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
 * Tap target info for an item's music track, or null when the item has no
 * playable link. The label falls back to «Música» when the song name is
 * missing.
 */
export function musicLink(item: {
  musicTrackUrl?: string | null;
  palanquitaNotes?: string | null;
}): MusicLink | null {
  const url = item.musicTrackUrl?.trim();
  if (!url || !HTTP_URL.test(url)) return null;
  const label = item.palanquitaNotes?.trim() || 'Música';
  return { url, label };
}
