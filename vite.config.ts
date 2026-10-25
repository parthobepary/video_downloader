import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { defineConfig, Plugin } from 'vite';

function apiDevPlugin(): Plugin {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      // Endpoint 1: Fast decoupled JSON extractor (<1s per call, no timeouts)
      server.middlewares.use('/api/extract', async (req, res) => {
        const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const action = parsedUrl.searchParams.get('action') || 'start';
        const targetUrl = parsedUrl.searchParams.get('url') || '';
        const format = parsedUrl.searchParams.get('format') || '720';
        const progressUrl = parsedUrl.searchParams.get('progressUrl') || '';

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (action === 'progress' && progressUrl) {
          try {
            const progRes = await fetch(progressUrl, { signal: AbortSignal.timeout(4000) });
            if (!progRes.ok) {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, progress: 50, text: 'Processing stream chunks...' }));
              return;
            }
            const progData = await progRes.json();
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                success: true,
                progress: progData.progress || 0,
                text: progData.text || 'Processing stream...',
                downloadUrl: progData.download_url || null,
                title: progData.title || null,
              })
            );
            return;
          } catch {
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, progress: 40, text: 'Connecting to stream...' }));
            return;
          }
        }

        if (!targetUrl) {
          res.statusCode = 400;
          res.end(JSON.stringify({ success: false, error: 'Missing url parameter' }));
          return;
        }

        try {
          const initRes = await fetch(
            `https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(targetUrl)}`,
            { signal: AbortSignal.timeout(6000) }
          );
          if (!initRes.ok) {
            res.statusCode = 502;
            res.end(JSON.stringify({ success: false, error: 'Extractor init failed' }));
            return;
          }
          const initData = await initRes.json();
          if (!initData.success || !initData.progress_url) {
            res.statusCode = 502;
            res.end(JSON.stringify({ success: false, error: initData.message || 'Stream not found' }));
            return;
          }

          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              progressUrl: initData.progress_url,
              title: initData.title || 'video',
            })
          );
        } catch (err: unknown) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: (err as Error).message }));
        }
      });

      // Endpoint 2: Resolve the stream, then redirect the browser to the CDN.
      // Mirrors api/download.ts so local and Vercel behave identically.
      server.middlewares.use('/api/download', async (req, res) => {
        const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const targetUrl = parsedUrl.searchParams.get('url') || '';
        const format = parsedUrl.searchParams.get('format') || '1080';
        const customTitle = parsedUrl.searchParams.get('title') || 'video';
        // Mirrors api/download.ts: relay the bytes, because the upstream token
        // is bound to the IP that created it. ?redirect=1 opts into a CDN 302.
        const redirectToCdn = parsedUrl.searchParams.get('redirect') === '1';

        if (!targetUrl) {
          res.statusCode = 400;
          res.end('Missing url parameter');
          return;
        }

        const isAudio = format === 'mp3' || format === 'm4a' || format === 'wav';
        const ext = isAudio ? (format === 'wav' ? 'wav' : 'mp3') : 'mp4';
        const safeTitle = customTitle.replace(/[^a-zA-Z0-9_\-ঀ-৿\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'media';
        const fileName = `${safeTitle}.${ext}`;

        try {
          const initRes = await fetch(
            `https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(targetUrl)}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (!initRes.ok) {
            res.statusCode = 502;
            res.end('Extractor init failed');
            return;
          }
          const initData = await initRes.json();
          if (!initData.success || !initData.progress_url) {
            res.statusCode = 502;
            res.end('No progress URL');
            return;
          }

          let downloadUrl = '';
          for (let i = 0; i < 28; i++) {
            await new Promise((r) => setTimeout(r, 700));
            const progRes = await fetch(initData.progress_url, { signal: AbortSignal.timeout(5000) });
            if (!progRes.ok) continue;
            const progData = await progRes.json();
            if (progData.download_url) {
              downloadUrl = progData.download_url;
              break;
            }
          }

          if (!downloadUrl) {
            res.statusCode = 504;
            res.end('Extraction timeout');
            return;
          }

          if (redirectToCdn) {
            res.statusCode = 302;
            res.setHeader('Location', downloadUrl);
            res.setHeader('Cache-Control', 'no-store');
            res.end();
            return;
          }

          const vidRes = await fetch(downloadUrl);
          if (!vidRes.ok || !vidRes.body) {
            res.statusCode = 502;
            res.end('Failed to stream media');
            return;
          }

          const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';
          const contentLength = vidRes.headers.get('content-length');

          res.statusCode = 200;
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
          if (contentLength) res.setHeader('Content-Length', contentLength);

          const { Readable } = await import('stream');
          // @ts-expect-error fromWeb supports standard Web Streams
          Readable.fromWeb(vidRes.body).pipe(res);
        } catch (err: unknown) {
          res.statusCode = 500;
          res.end(`Error: ${(err as Error).message}`);
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiDevPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('.', import.meta.url)),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
