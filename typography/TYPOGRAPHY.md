# Typography

How this site sets text, what `public/formose.css` changed relative to upstream
`tufte-css`, how to reach the features of the ET Bembo subsets, and what lives
in the `typography/etbb/` tree.

---

## 1. The short version

The page is set in **ET Bembo** — the typeface of Edward Tufte's own books,
taken from the CTAN [`ETbb`](https://ctan.org/pkg/etbb) package rather than from
his `edwardtufte/et-book` webfont, because the CTAN OpenType files carry the full
feature set and a 497-codepoint Latin coverage.

`public/formose.css` is a stylesheet **adapted from upstream `tufte-css`**, with
style inputs from `latex-css`, whose font layer has been replaced.
The measure, leading, sidenote gutter, `counter-reset: sidenote-counter` and
dark mode still follow Tufte; the type scale below the `@font-face` block is
locally authored, and the mobile sidenote rules are our own. The file is named
`formose` because it has diverged from upstream enough to be its own thing.

The font, the local additions, and the mobile sidenote treatment are ours.

---

## 2. What changed, and what did not

### Changed

| Upstream | Here | Why |
|---|---|---|
| `et-book` × 3 faces, each with `eot` + `woff` + `ttf` + `svg` sources | `"ET Bembo"` × 3 faces, `woff2` only | Every browser that can run this page parses `woff2`. The other three formats are dead weight. |
| One file per face | Two files per face, split by `unicode-range` (`-core` / `-ext`) | An English post downloads `-core` only. `-ext` is fetched **only if** a character outside Latin-1 actually appears. |
| A 4th family, `et-book-roman-old-style`, loaded purely to get oldstyle numerals | Deleted; `font-variant-numeric: oldstyle-nums` instead | ET Bembo carries `onum` in all four source faces, so the extra family was 44 KB of redundancy. |
| `font-family: et-book, Palatino, …` | `"ET Bembo", "ET Bembo Fallback", Palatino, …` | See §7 — the order is load-bearing. |
| No fallback metrics | 3 metric-overridden `@font-face` rules using `local()` | Stops the page reflowing when the woff2 lands. |
| — | `@font-face { font-display: swap }` retained from upstream | Same intent as upstream. |
| `html { font-size: 15px }` | `html { font-size: 12px }` | 21px body copy (1.4rem × 15px) is large on screen; lowering the root to 12px makes 1.4rem render at ~16.8px — close to 16px, with sidenotes staying legible at 13.2px — while every rem ratio stays the same. |
| Mobile sidenotes hidden behind a `:checked` toggle | Shown inline, always | Upstream reveals `.sidenote` / `.marginnote` only through the toggle below 760px; on a phone that hid the note unless you found the marker. Ours read inline. |
| Only `sup { line-height: 0 }` | `sub, sup` zero line-height with baseline offsets; `<small>`, `<ins>`, `<del>`, `<s>` | Prevents chemical formulas (`H2O`) or mathematical subscripts from blowing out the 2rem line leading; harmonizes semantic text markup with Tufte measure. |
| No `<kbd>` or `<samp>` styling | Monospace keycap badges for `<kbd>` and monospace `<samp>` | LaTeX.css input: readable keyboard shortcut badges with keycap bevel depth and high-contrast dark mode. |
| Browser default `<mark>` | Realistic multi-line highlighter pen effect | Paper-yellow gradient in light mode, bright neon pink gradient in dark mode, with `box-decoration-break: clone`. |
| Default link focus | `a:focus-visible` with offset outline; `text-decoration-skip-ink: auto` | Accessible keyboard navigation without distracting mouse clicks; cleaner descender ink skipping. |
| No text flow utilities | `.text-justify`, `.break-all`, `.whitespace-nowrap` | LaTeX document justification, wrapping long URLs/tokens without breaking layout, and keeping compound words unbroken. |

### Deliberately unchanged

Everything else. Specifically: the `87.5%` body
width with `12.5%` left padding, `section > p { width: 55% }`, `.sidenote`
`margin-right: -60%` / `width: 50%`, `line-height: 2rem`, the italic `h2`/`h3`,
`#fffff8` on `#111`, the `prefers-color-scheme: dark` pair, and
`span.newthought { font-variant: small-caps }`.

If you change any of those, you are departing from Tufte on purpose. That is
fine — just know that they are his, not inherited from a template by accident.

---

## 3. The fonts on disk

`public/fonts/` — built by `scripts/build-webfonts.sh`. They are still committed
even though the site now builds: CI runs `bun run build`, which *copies*
`public/` into `dist/`, so an untracked `.woff2` deploys as a 404. The font
build is not re-run in CI.

| File | Bytes | Fetched when |
|---|---:|---|
| `ETbb-Regular-core.woff2` | 35,460 | always (body text) |
| `ETbb-Regular-ext.woff2` | 20,760 | a character outside Latin-1 appears |
| `ETbb-Italic-core.woff2` | 31,812 | an `<em>` or `<i>` is in view |
| `ETbb-Italic-ext.woff2` | 17,884 | as above, plus extended Latin |
| `ETbb-Bold-core.woff2` | 37,488 | a `<strong>`, `<b>` or `<h1>` is in view |
| `ETbb-Bold-ext.woff2` | 19,536 | as above, plus extended Latin |
| `LICENSE-ETbb.txt` | 1,215 | — |

A typical English post with bold and italic text pulls **104,760 bytes** of
`-core`. The `-ext` files cost nothing unless used. For reference the three
source `.otf` files total 313,456 bytes, so the always-needed path is 3×
smaller than shipping a single unsubsetted face.

The `src` paths in `formose.css` are relative to the **stylesheet**, not the
document. The build copies `public/**` to the **document root**, so
`url("fonts/…")` resolves to `/fonts/…` — *not* `/public/fonts/…` — from any
page depth.

Preload the one file that blocks first paint, in the page `<head>`:

```html
<link rel="preload" href="/fonts/ETbb-Regular-core.woff2"
      as="font" type="font/woff2" crossorigin>
```

`crossorigin` is required — font fetches are always CORS-mode even same-origin,
and without it the preload is discarded and the file downloaded twice.

---

## 4. Using the font features in HTML

The subsets keep exactly eight features. Verified present in the built files:

```
GSUB: c2sc  liga  lnum  onum  pnum  smcp  swsh
GPOS: kern
```

### Figures

**ET Bembo's default figures are lining.** In the source font the cmap maps
digits to `zero`, `one`, `two`… and `lnum` maps to nothing at all — `onum` is
what maps to the `.taboldstyle` glyphs. So oldstyle must be asked for.

```html
<span class="numeral">1973</span>
```

`formose.css` already wires that class:

```css
.numeral { font-variant-numeric: oldstyle-nums; }
```

and applies the same property to the sidenote counters, so note numbers are
oldstyle too. Upstream did this with a separate font family; we do it with a
property, which is why the fourth family is gone.

| Want | CSS | In the subset |
|---|---|---|
| Oldstyle | `font-variant-numeric: oldstyle-nums` | ✅ `onum` |
| Lining | `font-variant-numeric: lining-nums` | ✅ `lnum` |
| Proportional (default) | `font-variant-numeric: proportional-nums` | ✅ `pnum` |
| **Tabular** | `font-variant-numeric: tabular-nums` | ❌ **no-op** |

`tnum` exists in ETbb but maps nothing, so `tabular-nums` silently does
nothing. **Do not use it** — code and tables will look unchanged and you will
waste an afternoon. Use `font-variant-numeric: lining-nums` for those instead.

### Small caps

All four source faces carry `smcp` and `c2sc`, so bold and italic small caps come
free — no extra file and no synthetic bolding.

```html
<span style="font-variant-caps: small-caps">a new thought</span>
```

or, matching upstream, use the class that is already there:

```html
<span class="newthought">The</span> opening words of a paragraph.
```

| Want | CSS |
|---|---|
| Lowercase → small caps | `font-variant-caps: small-caps` (`smcp`) |
| Uppercase → small caps | `font-variant-caps: all-small-caps` (`c2sc`) |

Upstream writes `font-variant: small-caps`, the legacy shorthand. It still
works in every browser; `font-variant-caps` is the modern spelling and composes
correctly with the other `font-variant-*` properties.

### Swash Q

`swsh` maps `Q` to `Q.swsh`. There is no `font-variant` keyword for it, so it
needs `font-feature-settings`:

```html
<span style="font-feature-settings: 'swsh' 1">Quirkdom</span>
```

This is the one place to reach for the low-level property. It costs 100 bytes
in the subset and is not exposed by upstream `tufte-css` at all — you are
adding to the system here, not preserving it.

### What happens on its own

`kern` (kerning pairs) and `liga` (the `fi`, `fl`, `ff`, `ffi`, `ffl`
ligatures) are on by default. You do not need to request them, and you should
not try to disable them. Note that `ﬁ` and `ﬀ` also exist as literal codepoints
U+FB00–U+FB01, which the core subset includes; typed `fi` gets you the ligature,
pasted `ﬁ` gets you the precomposed glyph, and they are not identical.

### What the font does not have

No Greek, no mathematical operators, no emoji, no symbols. Verified absent from
both subsets.

- **Emoji** fall through to the system emoji font. Fine — that is what you want.
  Just do not expect the emoji to sit on ET Bembo's baseline; it will not.
- **Mathematics** needs a separate stack — see *Mathematics, when you get
  there* below.
- **Greek** — if a post needs it, it falls back to Palatino/Georgia or whatever
  the system offers. If that matters, say so and the subset ranges can be
  widened.

### Mathematics, when you get there

ET Bembo has no math glyphs, so this is a pairing problem rather than a subset
problem — **nothing above needs to change** when you add one.

The ETbb package says so itself. From `typography/etbb/doc/ETbb-doc.tex`, in a section
titled *"A suggested math companion"*:

> This text package works well with `newtxmath` with the `libertine` option,
> because the latter has italics of the same italic angle as ETbb and of very
> similar xheight and weight.

and from the changelog at the top of the same file:

> The scale has been increased by 3.36% so that the x-height of the upright
> regular face is 431, very close to Computer Modern and Libertine.

That second quote is the useful one for the web. ETbb's x-height was
**deliberately scaled to match Libertine** — the OTFs measure `sxHeight` at
0.433 em. Most font pairings need a `scaled=` correction to stop inline maths
jumping out of the line; Libertinus should not, because it was drawn to the
same height in the first place. Same italic angle too.

Three ways to deliver it, and they are not equivalent for this site:

- **Client-side maths with a Libertinus Math webfont.** The pairing above works
  as documented. Costs one more font download — Libre Math web builds are
  large — and it can be subset the same way `scripts/build-webfonts.sh` subsets
  ETbb.
- **Client-side maths with KaTeX.** KaTeX does not offer Libertinus; it ships a
  Computer Modern derivative. That is more acceptable than it sounds, because
  ETbb's x-height was matched to Computer Modern as well as to Libertine. The
  italic angle will not match, and KaTeX will not obey ETbb's oldstyle figures.
- **Server-rendered images.** If by "MathTEX" you mean the classic TeX-to-PNG
  service rather than MathJax or KaTeX, then the browser never sees a math font
  at all and the whole pairing question disappears — at the cost of live text,
  accessibility, and a rendering dependency.

Whichever you pick, check the rendered size against body text. Upstream
`tufte-css` sets `html { font-size: 15px }`, but body text is `1.4rem` — not
`1rem` — so it renders at 21px, not 15px. This site lowers the root to 12px so
that 1.4rem renders at ~16.8px (close to the 16px target); `line-height: 2rem`
gives 24px leading at that root. Expect to nudge inline maths with a `scale`
or a `font-size` on the maths container rather than on the body: the LaTeX
recommendation was made at 10–11pt, and an optical size that works in a book
does not automatically work at 16.8px on a screen.

---

## 5. Rebuilding the subsets

```bash
scripts/build-webfonts.sh
```

Run it from the repo root. It reads the source faces from
`typography/etbb/opentype/` and writes `public/fonts/`. The script creates
`.venv-fonts/` and installs `fonttools` and `brotli` on first run (git-ignored).
Override with `PYFTSUBSET=/path/to/pyftsubset` if you want to use an existing
install.

### What it includes

- **Three faces:** Regular, Bold, Italic. Not BoldItalic — nothing in the
  stylesheet sets `font-style: italic` together with `font-weight: 700`, so it
  would be ~40 KB nobody downloads. Add it to the `faces=(…)` array if you
  start nesting `<em>` inside `<strong>`.
- **Two unicode ranges per face.** `core` is `U+0020-007E`, `U+00A0-00FF` and
  the punctuation, dashes, quotes, currency and `ﬀ`/`ﬁ` you actually type.
  `ext` is `U+0100-017F`, `U+0180-024F`, `U+1E00-1EFF`, `U+2C60-2C7F` and
  `U+A720-A7FF` — Latin Extended-A/B, Vietnamese, IPA.
- **Eight features:** `kern`, `liga`, `onum`, `lnum`, `pnum`, `smcp`, `c2sc`,
  `swsh`.
- **Metadata:** `--name-IDs='*' --name-legacy`, so the licence and copyright
  survive into the woff2 and devtools shows a real name.

### What it excludes, and why

| Excluded | Reason |
|---|---|
| `calt`, `ccmp` | ETbb has neither feature. Requesting them does nothing. |
| `tnum` | Present in the font but maps nothing. 132 bytes a face. |
| `dnom`, `sinf`, `sups` | TeX math fraction and script features. Meaningless in a browser. |
| `ss02`, `ss09` | TeX-specific alternates, including the `question.alt` sidebearing tweak that only exists for LaTeX line breaking. |
| BoldItalic | Not referenced by the stylesheet. |
| Everything outside the two ranges | Including the whole `U+2000-206F` general punctuation block beyond the specific dashes, quotes and ellipsis actually used. |

The last one is a judgement call. If a post needs, say, `U+2026` in a context
the current list misses, widen `core` in the script and rebuild — the ranges
are declared at the top of the file in one place.

### The licence

`typography/etbb/doc/LICENSE` is copied to `public/fonts/LICENSE-ETbb.txt` on
every run.
MIT requires the notice to travel with the font, and a subset is a copy. Keep
that file. Do not strip the name table.

---

## 6. The `typography/etbb/` tree

The CTAN package is **already pruned** — what remains is ~800 KB:

```
typography/etbb/README                          3,701   provenance, version, changes
typography/etbb/doc/LICENSE                     1,215   MIT; copied into public/fonts/ on build
typography/etbb/doc/ETbb-doc.tex               31,577   the manual's source
typography/etbb/doc/ETbb-doc.pdf              350,901   the 30-page manual
typography/etbb/opentype/ETbb-Regular.otf     117,208   build input
typography/etbb/opentype/ETbb-Bold.otf        103,624   build input
typography/etbb/opentype/ETbb-Italic.otf       92,624   build input
typography/etbb/opentype/ETbb-BoldItalic.otf   99,920   present, but not in the subset
```

The three `.otf` faces the script reads are the build's source of truth. Keep
them or the subsets become unreproducible — you would be shipping binaries with
no way to regenerate them after a package bump. `ETbb-BoldItalic.otf` is unused
(see §5): keep or drop it, but nothing reads it.

Everything else the CTAN tarball shipped — `afm/`, `tfm/`, `vf/`, `type1/`,
`enc/`, `tex/`, `map/`, the `.sty` and `.fd` files — is for `\usepackage{ETbb}`
and has been removed. This site has no TeX in it; `tfm/` alone was 5.3 MB of
bitmap metrics.

**Checklist before you commit:**

- [ ] `public/fonts/*.woff2` are committed — CI copies `public/` into `dist/` but never re-runs the font build, so an untracked subset deploys as a 404.
- [ ] `public/fonts/LICENSE-ETbb.txt` is committed alongside them.
- [ ] `typography/etbb/opentype/ETbb-{Regular,Bold,Italic}.otf` are committed.
- [ ] `typography/etbb/doc/LICENSE` is committed — the build copies it.
- [ ] `.venv-fonts/` is ignored (see `.gitignore`).
- [ ] `scripts/build-webfonts.sh` still runs from a clean clone.

If you drop the `.otf` sources, also drop the build script and treat
`public/fonts/` as hand-maintained binaries. That is a legitimate choice, but
then a future `ETbb` version bump becomes a manual re-subsetting job.

---

## 7. Two gotchas worth knowing

### The font stack order is load-bearing

```css
font-family: "ET Bembo", "ET Bembo Fallback", Palatino, …;
```

**ET Bembo must come first.** If you put `"ET Bembo Fallback"` first, the page
renders in **Georgia and nothing else** — the fallback family declares regular,
bold *and* italic faces, so it matches every style and wins every time. It looks
plausible, because Georgia is Bembo-like and has oldstyle figures by default,
which is exactly how this mistake survived one round of testing here.

`font-display: swap` already renders the next family while the first is loading,
which is what makes the fallback useful in second position.

### The metric fallback is partial

`"ET Bembo Fallback"` is three `@font-face` rules pointing at `local("Georgia")`
and friends with `size-adjust`, `ascent-override`, `descent-override` and
`line-gap-override` set from ET Bembo's real hhea metrics. It exists so the
first paint has the right line boxes.

Measured result on the check page: **every block-level box is identical to
0.00 px, and total page height is identical** (956 px either way). Inline runs
still move by 1–3 px, because Georgia and ET Bembo have different advance
widths and no vertical metric tuning touches those.

It also only helps where Georgia or Times New Roman exists — macOS and Windows.
On Linux, Android and most Linux CI neither is installed, `local()` misses, and
the family contributes nothing. Fixing that means shipping a subset fallback as
a webfont, which costs the 35 KB the whole exercise was trying to save.
