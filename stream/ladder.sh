#!/usr/bin/env bash
# Turns one incoming feed into an adaptive HLS ladder (1080p / 720p / 360p) plus audio.
# Run this on the origin box. vMix sends SRT to it; nginx serves the files; the CDN serves viewers.
#
#   vMix output  ->  srt://ORIGIN_IP:9000   (this script listens)
#
# Env:
#   SRT_PASSPHRASE  10 to 79 characters. Set it, and set the same one in vMix, so nobody else can send to you.
#   SRT_LATENCY_MS  SRT safety buffer. Default 1200, about 4x the round trip from the Maldives to Europe.
#                   Raise it if the picture breaks up, lower it for less delay.
#   INPUT_URL       overrides the whole input address (used for testing)
#   OUT_DIR         where playlists and segments are written (default: /var/www/hls)
set -euo pipefail

LAT_US=$(( ${SRT_LATENCY_MS:-1200} * 1000 ))   # ffmpeg wants microseconds
PASS=""
if [ -n "${SRT_PASSPHRASE:-}" ]; then PASS="&passphrase=${SRT_PASSPHRASE}&pbkeylen=16"; fi
INPUT_URL="${INPUT_URL:-srt://0.0.0.0:9000?mode=listener&latency=${LAT_US}${PASS}}"
OUT_DIR="${OUT_DIR:-/var/www/hls}"
SEG=2            # seconds per segment. Short = lower delay, more requests (the CDN absorbs them)
WINDOW=10        # segments kept on disk and in the playlist (about 20 s live window)
GOP=$((SEG * 25)) # keyframe every segment at 25 fps

mkdir -p "$OUT_DIR"

# Add extra args for testing, e.g. INPUT_ARGS="-f lavfi" INPUT_URL="testsrc2=size=1920x1080:rate=25"
# shellcheck disable=SC2086
exec ffmpeg -hide_banner -loglevel warning ${INPUT_ARGS:-} -i "$INPUT_URL" \
  -filter_complex "[0:v]fps=25,split=3[a][b][c];[a]scale=-2:1080[v1];[b]scale=-2:720[v2];[c]scale=-2:360[v3]" \
  -map "[v1]" -map "[v2]" -map "[v3]" -map 0:a:0 -map 0:a:0 -map 0:a:0 \
  -c:v libx264 -preset veryfast -profile:v high -sc_threshold 0 -g "$GOP" -keyint_min "$GOP" \
  -b:v:0 4500k -maxrate:v:0 4800k -bufsize:v:0 9000k \
  -b:v:1 2500k -maxrate:v:1 2700k -bufsize:v:1 5000k \
  -b:v:2 800k  -maxrate:v:2 900k  -bufsize:v:2 1600k \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -f hls -hls_time "$SEG" -hls_list_size "$WINDOW" \
  -hls_flags delete_segments+independent_segments+program_date_time+omit_endlist \
  -hls_segment_filename "$OUT_DIR/v%v_%09d.ts" \
  -master_pl_name live.m3u8 \
  -var_stream_map "v:0,a:0,name:1080p v:1,a:1,name:720p v:2,a:2,name:360p" \
  "$OUT_DIR/%v.m3u8"
