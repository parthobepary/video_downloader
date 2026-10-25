// Browser-side client for a cobalt instance (https://github.com/imputnet/cobalt).
//
// Why this runs in the browser rather than through /api: the previous extractor
// (loader.to) answers requests from datacenter IPs with a sham "Finished" result
// pointing at its ad gateway instead of a media node, so every Vercel-side
// extraction came back as an HTML ad page. Talking to cobalt straight from the
// page keeps our serverless functions out of the path entirely.
//
// NOTE: cobalt itself still fetches from the source platform, so the instance
// you point this at needs an IP the platform will serve. See docs/cobalt.md.

export type CobaltDownloadMode = 'auto' | 'audio' | 'mute';
export type CobaltAudioFormat = 'best' | 'mp3' | 'ogg' | 'wav' | 'opus';

export interface CobaltRequest {
  url: string;
  videoQuality?: string;
  downloadMode?: CobaltDownloadMode;
  audioFormat?: CobaltAudioFormat;
  filenameStyle?: 'classic' | 'pretty' | 'basic' | 'nerdy';
  youtubeVideoCodec?: 'h264' | 'av1' | 'vp9';
}

export interface CobaltResolved {
  url: string;
  filename?: string;
}

const API_URL: string = (import.meta.env.VITE_COBALT_API_URL || '').trim().replace(/\/+$/, '');
const API_KEY: string = (import.meta.env.VITE_COBALT_API_KEY || '').trim();

export function isCobaltConfigured(): boolean {
  return API_URL.length > 0;
}

// cobalt returns machine-readable codes like "error.api.youtube.login"; turn the
// ones users can actually act on into plain language.
function describeCobaltError(code: string): string {
  if (code.includes('youtube.login') || code.includes('bot_detection')) {
    return 'The download server was blocked by YouTube (it needs an IP YouTube will serve). See docs/cobalt.md.';
  }
  if (code.includes('rate_exceeded')) return 'The download server is rate limited. Please wait a moment and try again.';
  if (code.includes('unsupported') || code.includes('service.unsupported')) {
    return 'This link is not supported by the download server.';
  }
  if (code.includes('auth')) return 'The download server requires authentication. Set VITE_COBALT_API_KEY.';
  if (code.includes('content.video.unavailable') || code.includes('fetch.empty')) {
    return 'This video is unavailable or private.';
  }
  return `Download server error: ${code}`;
}

export async function resolveViaCobalt(
  req: CobaltRequest,
  signal?: AbortSignal
): Promise<CobaltResolved> {
  if (!isCobaltConfigured()) {
    throw new Error('No download server configured. Set VITE_COBALT_API_URL.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (API_KEY) headers.Authorization = `Api-Key ${API_KEY}`;

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filenameStyle: 'basic', ...req }),
      signal,
    });
  } catch {
    // A CORS rejection or a down instance both surface here as a TypeError.
    throw new Error('Could not reach the download server. Check VITE_COBALT_API_URL and its CORS settings.');
  }

  let data: {
    status?: string;
    url?: string;
    filename?: string;
    error?: { code?: string };
    picker?: Array<{ type?: string; url?: string }>;
  };
  try {
    data = await res.json();
  } catch {
    throw new Error(`Download server returned a non-JSON response (HTTP ${res.status}).`);
  }

  if (data.status === 'error') {
    throw new Error(describeCobaltError(data.error?.code || 'unknown'));
  }

  // "tunnel" streams through the cobalt instance, "redirect" points straight at
  // the source. Both are a plain URL the browser can download.
  if ((data.status === 'tunnel' || data.status === 'redirect') && data.url) {
    return { url: data.url, filename: data.filename };
  }

  if (data.status === 'picker' && data.picker?.length) {
    const first = data.picker.find((p) => p.url);
    if (first?.url) return { url: first.url, filename: data.filename };
  }

  throw new Error(`Download server returned an unexpected status: ${data.status || 'none'}`);
}

// Maps this app's format ids onto cobalt's request shape.
export function buildCobaltRequest(
  originalUrl: string,
  type: 'video' | 'audio',
  formatId: string
): CobaltRequest {
  if (type === 'audio') {
    const audioFormat: CobaltAudioFormat = formatId.includes('wav')
      ? 'wav'
      : formatId.includes('m4a') || formatId.includes('flac')
      ? 'best'
      : 'mp3';
    return { url: originalUrl, downloadMode: 'audio', audioFormat };
  }

  const videoQuality = formatId.includes('4k')
    ? '2160'
    : formatId.includes('1440')
    ? '1440'
    : formatId.includes('1080')
    ? '1080'
    : formatId.includes('720')
    ? '720'
    : formatId.includes('480')
    ? '480'
    : '360';

  return { url: originalUrl, downloadMode: 'auto', videoQuality, youtubeVideoCodec: 'h264' };
}
