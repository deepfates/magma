import {describe, expect, it} from 'vitest';
import {parseYouTubeSource, TREASURE_ISLAND, youtubeEmbedUrl} from './youtube';

describe('YouTube backdrop sources', () => {
  it('accepts regular, short, shorts, and embed video URLs', () => {
    for (const input of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?t=5',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ]) expect(parseYouTubeSource(input)).toMatchObject({kind: 'video', id: 'dQw4w9WgXcQ'});
  });

  it('prefers a playlist when a watch URL contains a list', () => {
    expect(parseYouTubeSource('https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abc'))
      .toMatchObject({kind: 'playlist', id: 'PL1234567890abc'});
  });

  it('rejects non-YouTube and malformed input', () => {
    expect(parseYouTubeSource('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeSource('not a video')).toBeNull();
  });

  it('builds a privacy-enhanced muted Treasure Island live embed', () => {
    const url = youtubeEmbedUrl(TREASURE_ISLAND, true, 'https://magma.test');
    expect(url).toContain(`youtube-nocookie.com/embed/${TREASURE_ISLAND.id}`);
    expect(url).toContain('mute=1');
  });
});
