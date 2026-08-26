#!/bin/bash
# Backdrop plates: Midjourney frame -> crop off the shadowbox edge -> 800x1280
# -> JPEG. macOS `sips` rather than a dependency, because this runs on the one
# machine the art is made on and adding an image library to a template whose
# whole point is "no build step, no dependencies" is a bad trade for five files.
#
# The crop matters: several of the plates came back as a photographed shadowbox
# with a visible white frame, and the plate is drawn full-bleed behind the
# playfield, so a frame inside the frame reads as a mistake.
#
#   bash tools/bakebg.sh
set -e
cd "$(dirname "$0")/.."
mkdir -p public/art/bg

bake () {
  src=$1; key=$2
  w=$(sips -g pixelWidth  "$src" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$src" | awk '/pixelHeight/{print $2}')
  sips -c $((h*88/100)) $((w*88/100)) "$src"  --out /tmp/_pobg_c.png >/dev/null
  sips -z 1280 800              /tmp/_pobg_c.png --out /tmp/_pobg_r.png >/dev/null
  sips -s format jpeg -s formatOptions 74 /tmp/_pobg_r.png --out "public/art/bg/$key.jpg" >/dev/null
  echo "  $key.jpg  $(du -h "public/art/bg/$key.jpg" | cut -f1)"
}

bake art/src/bg_cloud_3.png cloud-castle
bake art/src/bg_candy_2.png candy-meadow
bake art/src/bg_space_1.png glitter-space
bake art/src/bg_reef_3.png  bubblegum-reef
bake art/src/bg_disco_3.png disco-jungle
echo "backdrops baked"
