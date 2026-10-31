---
title: One font, six files
date: 2026-10-05
description: How the pages under ~abi/ get set in ET Bembo without shipping a third of a megabyte of typeface.
draft: true
---

Every page under `~abi/` is set in ET Bembo — the Bembo revival from CTAN's
ETbb package. The typeface is not the interesting part. The interesting part is
how little of it gets shipped.

Six files cover the whole thing: Regular, Bold and Italic, each split in two.

Upstream tufte-css lists `eot`, `woff`, `ttf` and `svg` for every face. That is
a lot of formats for a font nobody on the modern web will ask for, so this
copy keeps `woff2` only.

| File | Bytes | Fetched when |
|---|---:|---|
| `ETbb-Regular-core.woff2` | 35,460 | always (body text) |
| `ETbb-Bold-core.woff2` | 37,488 | a `<strong>`, `<b>` or `<h1>` is in view |
| `ETbb-Italic-core.woff2` | 31,812 | an `<em>` or `<i>` is in view |
| `ETbb-Regular-ext.woff2` | 20,760 | a character outside Latin-1 appears |
| `ETbb-Bold-ext.woff2` | 19,536 | as above, plus extended Latin |
| `ETbb-Italic-ext.woff2` | 17,884 | as above, plus extended Latin |

## The split is by character set, not by weight

`ETbb-Regular-core.woff2` declares `U+0020-007E`, the Latin-1 block, a handful
of dashes and quotes, the euro sign, and the `fi` and `fl` ligatures. Everything
else — Latin Extended, Vietnamese, the medieval Latin in `U+A720` — lives in
`ETbb-Regular-ext.woff2`.

An English post downloads the `-core` file and stops. The `-ext` file is fetched
if and only if a character outside that range actually appears on the page.

Those range lists are duplicated: once as `unicode-range` in `formose.css`, and
once as the `core` and `ext` variables in `scripts/build-webfonts.sh`. Change one,
change both.<span class="sidenote">They have no shared source of truth. The
build script does not read the stylesheet and the stylesheet is not generated,
so nothing catches a drift — `git status` on `public/fonts/` is the check.</span>

## Oldstyle figures have to be asked for

In the source font the cmap maps digits to `zero`, `one`, `two` and so on, and
`lnum` maps to nothing at all. It is `onum` that maps to the `.taboldstyle`
glyphs, so a page has to request it explicitly:

```html
<span class="numeral">1973</span>
```

Which is why the four-digit numbers on this site — <span class="numeral">1973</span>
— sit below the cap height. Upstream tufte-css loads a whole second family,
`et-book-roman-old-style`, purely to get that effect. ET Bembo carries `onum` in
all four faces, so that family is gone.

## The fallback is doing real work

Swapping to ET Bembo mid-load reflows the page, because the two faces do not
agree on line box metrics. The fix is a `@font-face` block with no `src` at all
except `local()` references, overriding the ascent, descent, line gap and size
to match Georgia:

```css
@font-face {
    font-family: "ET Bembo Fallback";
    src: local("Georgia"), local("Times New Roman");
    size-adjust: 89.94%;
    ascent-override: 87.68%;
    descent-override: 28.28%;
    line-gap-override: 8.81%;
}
```

That block earns its keep on macOS and Windows, where `local("Georgia")`
resolves.<span class="sidenote">On Linux, Android and most CI images neither
Georgia nor Times New Roman is installed, `local()` misses, and the family
contributes nothing. Shipping a subset fallback as a webfont would fix that and
cost the 35 KB the exercise was trying to save.</span>

The order in the stack is load-bearing, incidentally:

```css
font-family: "ET Bembo", "ET Bembo Fallback", Palatino, serif;
```

`"ET Bembo Fallback"` declares regular, bold *and* italic faces. Put it first
and it wins every style, and the page renders in Georgia forever — which looks
plausible, because Georgia has oldstyle figures too. 
