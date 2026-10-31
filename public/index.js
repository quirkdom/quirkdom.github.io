document.querySelectorAll('.crypt-mail').forEach(e => {
  e.addEventListener("click", event => {
    event.preventDefault();
    t = event.target;
    v = t.dataset.tld + '\u002E' + t.dataset.domain + '\u0040' + t.dataset.user;
    v = v.split("").reverse().join("");
    window.location.href = "mailto:" + v;
  })
});

/* ── portal guard ────────────────────────────────────────────
   The bg art hangs off the document bottom (body::before), at
   its natural aspect: it is never squashed or cropped. The art
   is pushed down until it clears the content with a margin:

   - wide viewports (canvas rides fixed on the right): ~100px
     between the art's top edge and the text bottom;
   - narrow viewports (canvas stacks below the text): a small
     margin below the canvas.

   The document grows to make the room; the page scrolls only
   when the art cannot otherwise fit. Measured by feedback,
   since body::before anchors to the body's (resizable) bottom
   edge — this resolves collapsed margins and the 100dvh
   minimum exactly, without modelling them. Must stay in sync
   with index.css: the strip's natural height is 37.5vw there. */
(function () {
  const content = document.querySelector(".page-content");
  const canvas = document.getElementById("aphrodite-canvas");
  const GAP_WIDE = 100;  // art top to text bottom, side-by-side layout
  const GAP_NARROW = 24; // art top to canvas bottom, stacked layout

  /* natural art height at this width: mirror of the 37.5vw
     default on body::before (image is 1200x450) */
  function natural() {
    return 0.375 * document.documentElement.clientWidth;
  }

  function docBottom() {
    // body's border box == its padding box; the art hangs there
    return document.body.getBoundingClientRect().bottom + window.scrollY;
  }

  function layout() {
    document.body.style.removeProperty("--bg-clear");

    // wide layout: the canvas is fixed, so the text is the last
    // thing in the flow. Stacked: whichever sits lower. The
    // canvas' computed position doubles as the case detector.
    const beside = canvas && getComputedStyle(canvas).position === "fixed";
    let flow = content.getBoundingClientRect().bottom + window.scrollY;
    if (!beside && canvas) {
      flow = Math.max(flow,
        canvas.getBoundingClientRect().bottom + window.scrollY);
    }

    // margin between the content bottom and the art top
    const gap = beside ? GAP_WIDE : GAP_NARROW;

    // body::before anchors to the body's (resizable) bottom edge,
    // so growing padding-bottom moves the art down 1:1. The +1
    // cushion absorbs px rounding so the edge of the art is
    // always past the margin, never grazing it. Iterations are
    // capped high because the 100dvh floor swallows early
    // increments: short viewports need a few rounds before the
    // document outgrows the viewport and feedback becomes 1:1.
    const target = flow + gap + natural() + 1;
    let spacer = 0;
    for (let i = 0; i < 8; i++) {
      document.body.style.setProperty("--bg-clear", spacer.toFixed(0) + "px");
      const err = target - docBottom();
      if (err <= 0.5) break;
      spacer += err;
    }
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      layout();
    });
  }

  layout();
  addEventListener("resize", schedule);
  if (document.fonts) document.fonts.ready.then(schedule);
})();