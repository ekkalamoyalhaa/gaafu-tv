# Gaafu TV

A fast static SvelteKit site, plus a streaming setup for 1080p on your own Hetzner servers, with a CDN or YouTube for big events.

## How it fits together

```
Studio (Maldives)                Hetzner, Europe                         Viewers
vMix --SRT, 1080p, ~6-8 Mbps--> Server A  (ladder.sh + nginx)  --\
                                  |  makes 1080p / 720p / 360p     >--> website player picks a server
                                  v                               /     at random, moves on if it fails
                                Server B  (nginx cache only)  ---/
                                (copies from A, serves viewers)

Big events: switch page moves everyone to the CDN (or a YouTube stream).
```

- Your upload from the studio is one stream, about 6 to 8 Mbps. The qualities are made on server A, so they cost your studio line nothing.
- Server B asks A for each file once, however many viewers ask B. Tested: 200 simultaneous requests to B reached A once.
- Viewers pick a quality that fits their connection, and never one bigger than their player. Phones and small windows do not pull 1080p.
- The website is static files. It costs nothing to serve and does not slow down with more viewers.

## Capacity (1 Gbps port, planning on 70% of it)

| Average per viewer | Viewers per server |
|---|---|
| 4.5 Mbps (everyone on 1080p) | about 155 |
| 2.5 to 3 Mbps (mixed phones and big screens) | about 250 to 280 |
| 1.5 Mbps (720p) | about 470 |

Two servers carry roughly 500 viewers on a mixed audience. For 1,000 at 1080p use the CDN for the event, or add servers. These are planning numbers, load test before relying on them.

## 1. Server A (encoder and first server)

Needs a dedicated server with 8 or more cores. Three qualities of 1080p will not run on a shared VPS.

1. Install `ffmpeg` and `nginx`. Make the folder: `mkdir -p /var/www/hls && chown www-data /var/www/hls`.
2. Copy this project to `/opt/gaafu-tv`.
3. `cp stream/ladder.env.example /etc/gaafu-ladder.env`, set `SRT_PASSPHRASE` to a long secret, `chmod 600` it.
4. Install `stream/gaafu-ladder.service` with systemd and start it. It waits for vMix to connect.
5. Install `stream/nginx.conf` as an nginx site. Change `a.gaafu.tv` and `https://www.gaafu.tv` to your names and add the HTTPS certificate.
6. Firewall: open UDP 9000 only to your studio's address. Open 80 and 443 to everyone.
7. Optional but recommended: keep `/var/www/hls` on RAM disk (`tmpfs`, 1 GB) so files are not written to the SSD all day.

In vMix: Settings, Outputs, External, SRT. Caller mode, host = server A, port 9000, passphrase = the same one, latency 1200 ms, H.264 at 6 to 8 Mbps, 1080p25, AAC audio. The 1200 ms is about four times the round trip from the Maldives to Europe. Raise it if the picture breaks up, lower it for less delay. Set the keyframe interval to 2 seconds.

The ladder script re-times keyframes itself, so the qualities line up even if vMix is slightly off.

## 2. Server B (second server)

No encoder, a smaller machine is fine as long as it has the port speed.

1. Install `nginx`. Make the cache folder: `mkdir -p /var/cache/nginx/hls`.
2. Install `stream/nginx-edge.conf`. Change `b.gaafu.tv`, `a.gaafu.tv` and the website address, add the HTTPS certificate.

Add C, D and more the same way. If server A goes down, B can keep serving what it already holds for a few seconds, then the stream stops for everyone. Server A is still the single point that matters.

## 3. The website

```
npm install
PUBLIC_SWITCH_URL=https://switch.gaafu.tv/live.json npm run build
```

Upload the `build` folder to any static host or CDN. First load is about 37 kB of JavaScript (gzipped). The video library, about 180 kB, only downloads when someone presses play.

Edit the programme guide in `src/lib/config.js`.

## 4. The switch page

A small password-protected service that tells the website where to get the stream. It lives in `admin/`.

1. Copy `admin/` to a server as `/opt/gaafu-switch`. Needs Node 20 or newer, nothing to install.
2. Copy `admin/env.example` to `/etc/gaafu-switch.env` and set a long `ADMIN_PASSWORD` and a random `SESSION_SECRET`.
3. Install `admin/gaafu-switch.service` with systemd and `admin/nginx.conf` with nginx (needs HTTPS). The nginx file caches the answer for 5 seconds. Tested: 30 requests reached the service once.
4. Open `https://switch.gaafu.tv/admin` and sign in.
5. Under Own servers, put one address per line:
   ```
   https://a.gaafu.tv/hls/live.m3u8
   https://b.gaafu.tv/hls/live.m3u8
   ```
   Under CDN, put the CDN address. Press Save.

With more than one address, each viewer starts on a random server and moves to the next within about a second if it fails. Press **CDN** on the page to move everyone to the CDN. People already watching move over by themselves within about two minutes. Do this 15 to 30 minutes before the event, not when the crowd arrives.

If the switch service goes down, viewers keep playing from whatever they are on. Five wrong passwords lock that address out for 15 minutes.

## 5. Events: CDN overflow

Set up a CDN (for example Bunny) as a pull zone pointing at server A, and put its address under CDN on the switch page. A 1,000-viewer, 3-hour event at 1080p is about 6 TB: roughly $30 on Bunny Volume, $180 on Bunny Standard in Asia. Ask Bunny whether the Volume network has locations in Asia before relying on it.

## Before the first event: test it

1. Play the stream from the Maldives on a Dhiraagu line, an Ooredoo line and mobile data, in the evening, and watch for buffering.
2. Have 20 or 30 people watch at once and check the picture holds.
3. In vMix, watch the streaming statistics for dropped frames. Run a 30 minute test at your real bitrate.
4. Unplug server B, then server A, and see what viewers get. A viewer should move to the other server within a couple of seconds.
5. Read Hetzner's traffic terms in writing. "Unlimited" usually has a fair-use clause, and heavy video is what those clauses are for.

## Things to know

- Delay behind live is about 8 to 12 seconds, plus the SRT buffer (about 1 second).
- Europe to the Maldives crosses long international routes. Playback depends on them, and they can slow in the evening. Test, and keep the CDN or YouTube as the backup.
- Server A is one point of failure. For a big event, keep the CDN pointed at A and have a second machine ready that can take the SRT feed.
- If the feed drops, players show "Reconnecting" and retry with random delays so the servers are not hit all at once.
