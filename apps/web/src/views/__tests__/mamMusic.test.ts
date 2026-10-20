import { describe, it, expect } from 'vitest';
import { musicLink, isPlayableMusicUrl } from '../mamMusic';

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

// Same D3 rule, exposed for the edit modal's inline warning: only http(s)
// counts as playable, so a song name typed in the URL field is flagged
// before save instead of silently rendering no anchor.
describe('isPlayableMusicUrl', () => {
  it('accepts http and https, case-insensitive, with surrounding whitespace', () => {
    expect(isPlayableMusicUrl('https://open.spotify.com/track/abc')).toBe(true);
    expect(isPlayableMusicUrl('http://example.com/x')).toBe(true);
    expect(isPlayableMusicUrl('HTTPS://example.com/x')).toBe(true);
    expect(isPlayableMusicUrl('  https://example.com/x  ')).toBe(true);
  });

  it('rejects non-URL values, empties and whitespace', () => {
    expect(isPlayableMusicUrl('Pretorio')).toBe(false);
    expect(isPlayableMusicUrl('')).toBe(false);
    expect(isPlayableMusicUrl('   ')).toBe(false);
    expect(isPlayableMusicUrl(null)).toBe(false);
    expect(isPlayableMusicUrl(undefined)).toBe(false);
  });
});
