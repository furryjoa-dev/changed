#!/bin/sh
# Audio/**/*.wav -> web/audio/**/*.ogg (브라우저 용량 절감용; 원본 wav는 그대로 둠)
cd "$(dirname "$0")/.." || exit 1
find Audio -type f -name '*.wav' | while read -r f; do
  out="web/audio/${f#Audio/}"; out="${out%.wav}.ogg"
  mkdir -p "$(dirname "$out")"
  [ -f "$out" ] || printf '%s\0%s\0' "$f" "$out"
done | xargs -0 -n2 -P4 sh -c 'ffmpeg -loglevel error -y -i "$0" -c:a libvorbis -q:a 3 "$1"'
