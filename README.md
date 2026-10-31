# quirkdom

Personal homepage of Quirkdom / Abi — <https://quirkdom.com>. Hand-written HTML
and Markdown in `pages/`, compiled by a single Bun script into `dist/`, deployed
to GitHub Pages. Static assets and webfonts live in `public/` and are served from
the document root.

```bash
bun run build    # pages/ + public/ -> dist/ (add --drafts to include drafts)
bun run dev      # build with drafts to .dev/, serve with live reload (--host <port>)
bun run preview  # build production dist/ (no drafts), serve statically (--host <port>)
bun run fonts    # rebuild the ETbb webfont subsets
```

The build has no runtime dependencies: `Bun.markdown.html` renders Markdown and
`Bun.build` minifies and hashes the front page's own CSS/JS.

See `AGENTS.md` for architecture and conventions, and `typography/TYPOGRAPHY.md`
for the font layer.
