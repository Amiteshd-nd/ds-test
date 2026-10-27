#!/usr/bin/env bash
# Stitches frames/ into out/teaser-1080p.mp4 and out/teaser-4k.mp4 (plus -silent
# versions) with the ffmpeg binary from ffmpeg-static. If assets/hero.jpg exists,
# it opens with a 3s slow zoom-in and closes with a 3s slow zoom-out, cross-
# dissolved 0.5s into and out of the UI sequence.
#
# Chromium writes some frames as rgba and others as rgb24; without -reinit_filter 0
# ffmpeg would rebuild the graph at the switch and reset the cross-fades, so the
# sequence is pinned to rgb24 on entry.
# The film is built once at 4K in a single filter graph (frames are decoded once),
# then split into the 4K encoder and a lanczos-downscaled 1080p encoder running in
# the same process. Encoding is libx264 crf 18 by default; --hw uses the Apple
# VideoToolbox encoder when the build has it (several times faster, bitrate-driven).
#
#   bash render/assemble.sh [--frames DIR] [--hw]
set -euo pipefail
cd "$(dirname "$0")/.."
FRAMES=frames; HW=0
while [ $# -gt 0 ]; do case "$1" in --frames) FRAMES="$2"; shift 2;; --hw) HW=1; shift;; *) shift;; esac; done
FFMPEG="$(node -p "require('ffmpeg-static')")"
FPS="$(node -p "require('./demo/script.json').video.fps")"
DUR="${DUR_OVERRIDE:-$(node -p "require('./out/events.json').duration")}"   # the timeline's length, written by the capture; DUR_OVERRIDE for slice tests
LUFS="$(node -p "require('./demo/script.json').audio.targetLufs")"
mkdir -p out

first="$(basename "$(ls "$FRAMES"/f00000.* )")"
ext="${first##*.}"
count="$(ls "$FRAMES" | wc -l | tr -d ' ')"
size="$("$FFMPEG" -hide_banner -i "$FRAMES/$first" 2>&1 | grep -m1 -oE '[0-9]{3,5}x[0-9]{3,5}' || true)"
echo "assemble: $count frames ($size $ext) at ${FPS}fps"

HERO=""; [ -f assets/hero.jpg ] && HERO="assets/hero.jpg"
XF="$(node -p "require('./demo/script.json').hero.dissolve")"; HD="$(node -p "require('./demo/script.json').hero.seconds")"; W=3840; H=2160

if [ "$HW" = 1 ] && "$FFMPEG" -hide_banner -encoders 2>/dev/null | grep -q h264_videotoolbox; then
  ENC4K=(-c:v h264_videotoolbox -b:v 45M -maxrate 60M -bufsize 90M -profile:v high -allow_sw 1)
  ENC1080=(-c:v h264_videotoolbox -b:v 14M -maxrate 20M -bufsize 30M -profile:v high -allow_sw 1)
  echo "assemble: VideoToolbox encoder"
else
  ENC4K=(-c:v libx264 -preset fast -crf 18)
  ENC1080=(-c:v libx264 -preset medium -crf 18)
  echo "assemble: libx264 crf 18"
fi
COMMON=(-pix_fmt yuv420p -r "$FPS" -movflags +faststart -an)

if [ -n "$HERO" ]; then
  FR=$((HD * FPS))
  OFF1="$(node -p "$HD - $XF")"; OFF2="$(node -p "$HD - $XF + $DUR - $XF")"
  # the still is decoded once; zoompan emits FR frames from it. It is pre-scaled a
  # little above 4K so the pan has room, then cropped to the frame.
  HERO_PRE="scale=4800:2700:force_original_aspect_ratio=increase,crop=4800:2700,setsar=1"
  GRAPH="\
[0:v]${HERO_PRE},zoompan=z='1+0.12*on/$FR':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$FR:s=${W}x${H}:fps=$FPS,format=yuv420p[hin];\
[1:v]format=rgb24,setsar=1,format=yuv420p[ui];\
[2:v]${HERO_PRE},zoompan=z='1.12-0.12*on/$FR':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$FR:s=${W}x${H}:fps=$FPS,format=yuv420p[hout];\
[hin][ui]xfade=transition=fade:duration=$XF:offset=$OFF1[a];\
[a][hout]xfade=transition=fade:duration=$XF:offset=$OFF2,split=2[v4k][vpre];\
[vpre]scale=1920:1080:flags=lanczos[v1080]"
  INPUTS=(-i "$HERO" -reinit_filter 0 -framerate "$FPS" -i "$FRAMES/f%05d.$ext" -i "$HERO")
else
  GRAPH="[0:v]format=rgb24,setsar=1,format=yuv420p,split=2[v4k][vpre];[vpre]scale=1920:1080:flags=lanczos[v1080]"
  INPUTS=(-reinit_filter 0 -framerate "$FPS" -i "$FRAMES/f%05d.$ext")
fi

echo "assemble: encoding 4K and 1080p"
"$FFMPEG" -y -hide_banner -loglevel error -stats "${INPUTS[@]}" -filter_complex "$GRAPH" \
  -map "[v4k]"   "${ENC4K[@]}"   "${COMMON[@]}" out/teaser-4k-silent.mp4 \
  -map "[v1080]" "${ENC1080[@]}" "${COMMON[@]}" out/teaser-1080p-silent.mp4
echo

# audio. render/audio.ts writes film-length tracks (effects already offset behind the
# hero open): out/audio.wav is effects + the synthesised bed, out/sfx.wav is effects
# only. A real track at assets/music.(mp3|wav|m4a|aac) replaces the bed: it is
# trimmed to the film, faded out, mixed under the effects at musicGainDb.
# loudnorm runs twice: a measuring pass, then a linear pass with the measured values.
if [ -f out/audio.wav ]; then
  TOTAL="$DUR"; [ -n "$HERO" ] && TOTAL="$(node -p "$DUR + 2 * ($HD - $XF)")"
  MUSIC=""; for f in assets/music.mp3 assets/music.wav assets/music.m4a assets/music.aac; do [ -f "$f" ] && MUSIC="$f" && break; done
  MG="$(node -p "require('./demo/script.json').audio.musicGainDb")"; SG="$(node -p "require('./demo/script.json').audio.sfxGainDb")"
  if [ -n "$MUSIC" ]; then
    echo "assemble: mixing $MUSIC under the effects"
    FO="$(node -p "require('./demo/script.json').audio.bed.fadeOut")"
    "$FFMPEG" -y -hide_banner -loglevel error -i out/sfx.wav -i "$MUSIC" -filter_complex \
      "[1:a]atrim=0:${TOTAL},asetpts=PTS-STARTPTS,afade=t=in:d=1,afade=t=out:st=$(node -p "$TOTAL - $FO"):d=${FO},volume=${MG}dB[m];[0:a]volume=${SG}dB[s];[s][m]amix=inputs=2:normalize=0,apad=whole_dur=${TOTAL}" \
      -t "$TOTAL" -ar 48000 out/mix.wav
  else
    "$FFMPEG" -y -hide_banner -loglevel error -i out/audio.wav -af "apad=whole_dur=${TOTAL}" -t "$TOTAL" -ar 48000 out/mix.wav
  fi
  M="$("$FFMPEG" -hide_banner -i out/mix.wav -af "loudnorm=I=${LUFS}:TP=-1.5:LRA=9:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')"
  jq_() { node -p "JSON.parse(process.argv[1]).$1" "$M"; }
  "$FFMPEG" -y -hide_banner -loglevel error -i out/mix.wav \
    -af "loudnorm=I=${LUFS}:TP=-1.5:LRA=9:measured_I=$(jq_ input_i):measured_TP=$(jq_ input_tp):measured_LRA=$(jq_ input_lra):measured_thresh=$(jq_ input_thresh):offset=$(jq_ target_offset):linear=true" \
    -t "$TOTAL" -ar 48000 -c:a aac -b:a 192k out/audio.m4a
  for res in 1080p 4k; do
    "$FFMPEG" -y -hide_banner -loglevel error -i "out/teaser-$res-silent.mp4" -i out/audio.m4a \
      -map 0:v -map 1:a -c:v copy -c:a copy -shortest -movflags +faststart "out/teaser-$res.mp4"
  done
else
  cp out/teaser-1080p-silent.mp4 out/teaser-1080p.mp4; cp out/teaser-4k-silent.mp4 out/teaser-4k.mp4
fi
ls -la out/*.mp4
