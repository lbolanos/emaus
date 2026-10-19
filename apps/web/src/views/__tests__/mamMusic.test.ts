import { describe, it, expect } from 'vitest';
import { musicLink } from '../mamMusic';

// Rule D3 of specs/mam-canciones: only http(s) URLs render an anchor, with the
// same regex the API applies in importSongsFromMam. Rule D2: the label is the
// song name (palanquitaNotes) or «Música» when missing.
describe('musicLink', () => {
  it('returns url and song name for a valid link with a name', () => {
    expect(
      musicLink({ musicTrackUrl: 'https://open.spotify.com/track/abc', palanquitaNotes: 'Huracán' }),
    ).toEqual({ url: 'https://open.spotify.com/track/abc', label: 'Huracán' });
  });

  it('falls back to the «Música» label when the song name is missing', () => {
    expect(musicLink({ musicTrackUrl: 'https://open.spotify.com/track/abc' })).toEqual({
      url: 'https://open.spotify.com/track/abc',
      label: 'Música',
    });
  });

  it('treats a whitespace-only song name as missing', () => {
    expect(musicLink({ musicTrackUrl: 'https://example.com/x', palanquitaNotes: '   ' })?.label).toBe('Música');
  });

  it('trims the url before using it', () => {
    expect(musicLink({ musicTrackUrl: '  https://example.com/x  ' })?.url).toBe('https://example.com/x');
  });

  it('accepts uppercase HTTP(S)', () => {
    expect(musicLink({ musicTrackUrl: 'HTTPS://example.com/x' })).not.toBeNull();
  });

  it('returns null for a non-URL value (song name typed in the wrong field)', () => {
    expect(musicLink({ musicTrackUrl: 'Pretorio', palanquitaNotes: 'Pretorio' })).toBeNull();
  });

  it('returns null when the field is empty, null or missing', () => {
    expect(musicLink({ musicTrackUrl: '' })).toBeNull();
    expect(musicLink({ musicTrackUrl: null })).toBeNull();
    expect(musicLink({})).toBeNull();
  });
});
