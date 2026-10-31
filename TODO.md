# TODOs

## Home
1. ~~Make a 3D model of the favicon (bust) and display it on canvas, revolving. Inspiration: Octocat in fireheart display on https://code.storage/ (uses Three.js)~~

## /~abi/

### Typography & CSS
1. ~~Ensure sidenotes go inline instead of vanishing on mobile.~~
2. ~~upstream tufte-css has no JS. The build now generates the `<label>` + `<input>` toggle markup at build time via `transformSidenotes` in `scripts/build.ts`. `public/tufte.js` is deleted.~~
3. ~~Make a typography demo page with all the typographic elements (headings, lists, blockquotes, sidenotes, etc.) to test styles.~~
4. ~~Monospace inside sidenotes looks bigger relative to surrounding text. Ironically, monospace looks smaller in the main text. Fix this.~~
5. [Optional] Maybe we need to think about a different font for monospace text.
6. ~~Take style inspirations from [Latex.css](https://latex.vercel.app): Text formatting, blockquotes, tables, images + captions and code blocks. [Tint](https://eddelbuettel.github.io/tint/) also has nice tables.~~
    - Mostly done; only Tables left.
7. Think about bg and fg colors.
8. Edge case: Blockqotes with source _and_ sidenote/marginnote: in mobile screens, the sidenote is pushed below the blockquote but very close to the blockquote, causing vertical overlap. Maybe sidenote needs top margin?

### SSG
1. ~~Removed `_partials` and inlined `<head>` into `layout.html`. Simplified `build.ts` to ~160 lines with dynamic tokens and `{{embed: ...}}` support.~~
2. ~~Output in dist/ doesn't seem to be minified?~~ The build now minifies and content-hashes the front page's CSS/JS with `Bun.build` (page scripts renamed to `.mjs`).


