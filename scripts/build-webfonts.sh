#!/usr/bin/env bash
# Subset the ETbb OpenType faces in etbb/opentype/ down to webfonts in public/fonts/.
#
# Source of truth: etbb/opentype/*.otf (MIT, see etbb/doc/LICENSE).
# Only ever run this from the repo root:  tools/build-webfonts.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/etbb/opentype"
out="$root/public/fonts"

pyftsubset="${PYFTSUBSET:-}"
if [ -z "$pyftsubset" ]; then
    venv="${FONT_VENV:-$root/.venv-fonts}"
    if [ ! -x "$venv/bin/pyftsubset" ]; then
        echo "creating $venv"
        python3 -m venv "$venv"
        "$venv/bin/pip" install --quiet fonttools brotli
    fi
    pyftsubset="$venv/bin/pyftsubset"
fi

# Latin core: what an English post actually uses. Downloads on every page load.
core='U+0020-007E,U+00A0-00FF,U+2010-2015,U+2018-201D,U+2020-2026,U+2030,U+2032-2033,U+2039,U+2044,U+20AC,U+FB00-FB01'
# Latin Extended-A/B + Vietnamese + IPA. Fetched by the browser only when a
# character from these ranges actually appears on the page.
ext='U+0100-017F,U+0180-024F,U+1E00-1EFF,U+2C60-2C7F,U+A720-A7FF'

# kern (GPOS)        -- kerning pairs. On by default; listed so it survives subsetting
# liga               -- the f-ligatures fi fl ff ffi ffl. On by default
# onum, lnum, pnum   -- oldstyle / lining / proportional figures. Tufte sets body
#                       numerals oldstyle, code and tables lining
# smcp, c2sc         -- small caps, and caps to small caps
# swsh               -- swash Q; 100 bytes, so it stays
#
# Deliberately not requested:
#   calt, ccmp        -- ETbb has neither feature; asking for them does nothing
#   tnum              -- present in the font but maps nothing; 132 bytes a face
#   dnom, sinf, sups  -- TeX math only, meaningless in a browser
#   ss02, ss09        -- TeX-specific alternates (question.alt sidebearing)
features='kern,liga,onum,lnum,pnum,smcp,c2sc,swsh'

faces=(ETbb-Regular ETbb-Bold ETbb-Italic)

mkdir -p "$out"
total=0
for face in "${faces[@]}"; do
    for part in core ext; do
        unicodes="$core"
        [ "$part" = ext ] && unicodes="$ext"
        "$pyftsubset" "$src/$face.otf" \
            --output-file="$out/$face-$part.woff2" \
            --flavor=woff2 \
            --unicodes="$unicodes" \
            --layout-features="$features" \
            --name-IDs='*' --name-legacy \
            --notdef-outline --recommended-glyphs \
            --drop-tables+=DSIG \
            2>/dev/null
    done
done

# MIT requires the notice to travel with the font, and a subset is a copy.
cp "$root/etbb/doc/LICENSE" "$out/LICENSE-ETbb.txt"

printf '%-28s %8s\n' file bytes
for face in "${faces[@]}"; do
    for part in core ext; do
        f="$out/$face-$part.woff2"
        printf '%-28s %8s\n' "$(basename "$f")" "$(wc -c <"$f" | tr -d ' ')"
    done
    total=$((total + $(wc -c <"$out/$face-core.woff2" | tr -d ' ')))
done
printf '\n%s\n' "always-downloaded payload (3 core faces): $total bytes"
