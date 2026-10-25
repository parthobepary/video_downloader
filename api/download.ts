import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { extractMedia } from './extract.js';

export const config = {
  maxDuration: 60,
};

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string> },
  res: ServerResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const targetUrl = parsedUrl.searchParams.get('url') || '';
  const format = parsedUrl.searchParams.get('format') || '1080';
  const customTitle = parsedUrl.searchParams.get('title') || 'download';
  // Opt-in byte proxying. Off by default: a serverless function cannot relay a
  // multi-MB media file within its execution limit (see note below).
  const proxyBytes = parsedUrl.searchParams.get('proxy') === '1';

  if (!targetUrl) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Missing "url" parameter');
    return;
  }

  const isAudio = format === 'mp3' || format === 'm4a' || format === 'wav';
  const ext = isAudio ? (format === 'wav' ? 'wav' : 'mp3') : 'mp4';
  const safeTitle = customTitle.replace(/[^a-zA-Z0-9_\-ঀ-৿\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'media';
  const fileName = `${safeTitle}.${ext}`;
  const asciiFileName = `${safeTitle.replace(/[^\x20-\x7E]/g, '_') || 'media'}.${ext}`;

  try {
    const extracted = await extractMedia(targetUrl, format);
    if (!extracted.success || !extracted.downloadUrl) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`Failed to extract media: ${extracted.error || 'Stream not found'}`);
      return;
    }

    // Hand the browser straight to the upstream CDN instead of relaying the
    // bytes ourselves. Relaying costs the whole file's transfer time inside one
    // invocation (~77 KB/s observed through the function vs ~2.4 MB/s direct),
    // so any real video overruns maxDuration and the download dies mid-stream.
    // The CDN already sends `Content-Disposition: attachment` with the real
    // title, so the save dialog still behaves.
    if (!proxyBytes) {
      res.statusCode = 302;
      res.setHeader('Location', extracted.downloadUrl);
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }

    const vidRes = await fetch(extracted.downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    if (!vidRes.ok || !vidRes.body) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Failed to fetch extracted stream from upstream server');
      return;
    }

    if (vidRes.headers.get('content-type')?.toLowerCase().includes('text/html')) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('The upstream redirected to a web page instead of a media file. Please try again.');
      return;
    }

    const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';
    const contentLength = vidRes.headers.get('content-length');

    res.statusCode = 200;
    res.setHeader('Content-Type', isAudio && format === 'wav' ? 'audio/wav' : contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // @ts-expect-error fromWeb supports standard Web Streams
    await pipeline(Readable.fromWeb(vidRes.body), res);
  } catch (err: unknown) {
    if (res.headersSent) {
      res.destroy(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
