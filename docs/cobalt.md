# Download backend (cobalt)

## Why the app changed

The app used to resolve streams through `/api/download`, a Vercel serverless
function that called `loader.to`. That cannot work on a deployed site:

| Caller | Processing time | Host returned by loader.to |
| --- | --- | --- |
| Vercel function | ~1s, instant "Finished" | `lto2.affadaffa.com` (ad gateway) |
| A residential connection | 12–26s of real work | `ricky4.savenow.to` (media node) |

`loader.to` recognises datacenter IPs and hands them a sham result pointing at
its ad gateway, so the function fetched an HTML ad page instead of a video. The
error users saw was `The upstream redirected to a web page instead of a media
file.` This happens during **extraction**, so no change to how bytes are
delivered can fix it.

The browser now talks to a [cobalt](https://github.com/imputnet/cobalt)
instance directly (`src/utils/cobaltClient.ts`), keeping serverless functions
out of the path.

## The constraint that decides where you host it

**cobalt still fetches from the source platform itself.** It is a server, not a
browser extension, so whatever IP the instance runs on is the IP YouTube sees.
YouTube rejects flagged datacenter IPs at the network level with
`LOGIN_REQUIRED` ("sign in to confirm you're not a bot"), and cookies do not
help because the IP is checked before credentials are. The public
`api.cobalt.tools` instance is blocked for exactly this reason.

So:

- **A home/residential connection works.** This is the same condition that makes
  the app work on your own machine today. Run the container on a machine at
  home and expose it with a Cloudflare Tunnel (no port forwarding, free TLS).
  Trade-off: your home upload bandwidth carries every visitor's download, and
  the machine has to stay on.
- **A plain VPS (Hetzner, DigitalOcean, Railway, Fly) is a coin flip.** It may
  work at first and stop when the IP gets flagged. Recovery means getting a new
  IP, repeatedly.
- **A residential proxy in front of cobalt** works from any host but costs money
  per GB.

Non-YouTube sources (TikTok, Instagram, Twitter, Reddit, SoundCloud…) are far
less aggressive about datacenter IPs, so a VPS is usually fine for those.

## Running it

```bash
cd cobalt
# edit docker-compose.yml: set API_URL to the public URL, CORS_URL to the site origin
docker compose up -d
```

Verify it answers:

```bash
curl -X POST https://cobalt.example.com/ \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","videoQuality":"720"}'
```

A healthy reply is `{"status":"tunnel","url":"...","filename":"..."}`. A
`{"status":"error","error":{"code":"error.api.youtube.login"}}` means the host's
IP is blocked — see the section above.

### Exposing a home instance with Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create cobalt
cloudflared tunnel route dns cobalt cobalt.example.com
cloudflared tunnel run --url http://localhost:9000 cobalt
```

Then set `API_URL: "https://cobalt.example.com/"` in `docker-compose.yml` and
restart the container.

## Wiring the frontend

Set these for the Vite build (locally in `.env`, and in Vercel's project
settings for the deployed site):

```
VITE_COBALT_API_URL=https://cobalt.example.com/
# only if the instance sets API_KEY_URL
VITE_COBALT_API_KEY=<uuid>
```

`VITE_*` values are **baked into the client bundle and are publicly visible** —
anyone can read the key out of the JS. Treat it as a soft throttle, not a
secret; `CORS_URL` is what actually restricts who can use the instance.

Without `VITE_COBALT_API_URL` the app falls back to the old `/api/download`
route, which still works on localhost (residential IP) but not when deployed.

## Status mapping

`resolveViaCobalt` handles cobalt's four response statuses:

- `tunnel` — bytes stream through the cobalt instance (usual case for YouTube,
  which needs video and audio muxed). Your instance's upload bandwidth is the
  bottleneck.
- `redirect` — a direct source URL; the browser fetches it with no load on the
  instance.
- `picker` — multi-item posts; the first item is taken.
- `error` — mapped to a readable message in `describeCobaltError`.
