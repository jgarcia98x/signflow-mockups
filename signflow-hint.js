/* ═══════════════════════════════════════════════════════════════════════
   signflow-hint.js — first-visit welcome sheet, every form factor

   WHY THIS IS A STANDALONE FILE
   The sheet used to live inside signflow-demo.js, which is (a) prospect-demo
   only and (b) gated on `isTouch`, so it never appeared on a laptop and never
   appeared at all in Peter's repo — which does not load signflow-demo.js.
   Two of the three ways people actually open this app therefore had no
   introduction. Pulling it out means one file, no mobile-hardening baggage,
   droppable into either repo.

   FORM FACTORS — a different shape, not a scaled one
     phone  (<700px)          bottom sheet, slides up, full width
     tablet/desktop (>=700px) centred dialog, scales in, max 520px
   The bottom sheet exists because a thumb reaches the bottom of a phone.
   That reasoning does not transfer to a mouse, where a sheet welded to the
   bottom edge of a 27" display looks like a cookie banner. Same content,
   same order, presented where the eye and the input device already are.

   HONEST COPY — the wording follows the input device
   Onboarding text is a claim about what will happen when you try it. The
   gesture differs by device, so the sentence has to:
     mouse : "Drag a job"           / "Click a job for the full story"
     touch : "Hold a job, then drag"/ "Tap a job for the full story"
   signflow-dnd.js uses a 4px threshold for mouse and a 220ms long-press for
   touch (so the page can still scroll), which is exactly why "hold" belongs
   in the touch copy and would be wrong on a laptop.

   Pipeline only, once per browser. Verified per page before shipping: the
   pipeline is the landing tab, has Smart Queue in its sidebar, and has a
   #detail-panel so "click a job for the full story" is true there. It is NOT
   true on schedule.html in Peter's build, which is why this never shows there.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var LS = 'sf_hint_v3';   /* v3: cross-device rewrite; v2 was phone-only */

  /* Input device, not screen size. An iPad is coarse-pointer at 1024px wide;
     a small laptop window is fine-pointer at 700px. The gesture copy must
     follow the pointer, and the layout must follow the width — they are
     genuinely two different questions. */
  var coarse = false;
  try { coarse = global.matchMedia('(pointer:coarse)').matches; } catch (e) {}

  function isPhone() { return global.innerWidth < 700; }

  /* ── Content ──────────────────────────────────────────────────────── */
  function rows() {
    return [
      ['\u270B',
        coarse ? 'Hold a job, then drag it' : 'Drag a job anywhere',
        'Move a card between stages and everything downstream updates \u2014 '
        + 'schedule, capacity, forecast.'],
      ['\u261D',
        coarse ? 'Tap a job for the full story' : 'Click a job for the full story',
        'Contact, value, next steps, history, and the actions you\u2019d '
        + 'actually take.']
    ];
  }

  /* Locations verified in source, not assumed:
       Queue       index.html    .sidebar-title "\u26A1 Smart Queue"
       Nudge       customers.html .sidebar-title "\u{1F3AF} Smart Nudge"
       Conversions jobs.html      .vs-tab[data-view="wins"] — a sub-tab, which
                                  is precisely why it needs directions. */
  var TOOLS = [
    ['\u26A1', 'Smart Queue', 'right here on Pipeline \u2014 what to do today, and why'],
    ['\u{1F3AF}', 'Smart Nudge', 'Customers tab \u2014 quotes going cold, worth a call'],
    ['\u26A1', 'Smart Conversions', 'Jobs &amp; Reports \u2192 Smart Conversions \u2014 what wins you work']
  ];

  /* ── Styles ───────────────────────────────────────────────────────── */
  var CSS = [
    '#sfh{position:fixed;inset:0;z-index:99998;display:flex;',
    '  justify-content:center;background:rgba(0,0,0,0);',
    '  backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);',
    '  transition:background .26s ease,backdrop-filter .26s ease;',
    '  pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,',
    '  "Segoe UI",Roboto,sans-serif}',
    '#sfh.sfh-in{background:rgba(0,0,0,0.5);backdrop-filter:blur(3px);',
    '  -webkit-backdrop-filter:blur(3px);pointer-events:auto}',

    /* Shared card surface. */
    '.sfh-card{width:100%;box-sizing:border-box;',
    '  background:rgba(32,22,26,0.94);backdrop-filter:blur(24px) saturate(160%);',
    '  -webkit-backdrop-filter:blur(24px) saturate(160%);',
    '  border:1px solid rgba(255,255,255,0.10);',
    '  box-shadow:0 -12px 40px rgba(0,0,0,0.45);',
    '  transition:transform .3s cubic-bezier(.32,.72,0,1),opacity .24s ease}',

    /* ── Phone: bottom sheet, thumb-reachable ───────────────────────── */
    '@media(max-width:699px){',
    '  #sfh{align-items:flex-end}',
    '  .sfh-card{max-width:460px;border-bottom:0;border-radius:20px 20px 0 0;',
    '    padding:9px 20px calc(20px + env(safe-area-inset-bottom));',
    '    transform:translateY(102%)}',
    '  #sfh.sfh-in .sfh-card{transform:translateY(0)}',
    '}',

    /* ── Tablet / desktop: centred dialog ───────────────────────────
       A sheet stuck to the bottom edge of a large display reads as a
       cookie notice. Centred, it reads as the app introducing itself.
       Capped height with internal scroll so a short laptop window (or
       landscape iPad) can never trap the dismiss button off-screen. */
    '@media(min-width:700px){',
    '  #sfh{align-items:center;padding:24px}',
    '  .sfh-card{max-width:520px;border-radius:18px;padding:26px 30px 24px;',
    '    max-height:calc(100vh - 48px);overflow-y:auto;',
    '    transform:scale(.96) translateY(8px);opacity:0;',
    '    box-shadow:0 24px 70px rgba(0,0,0,0.55)}',
    '  #sfh.sfh-in .sfh-card{transform:scale(1) translateY(0);opacity:1}',
    '  .sfh-grip{display:none}',          /* a grip implies a draggable sheet */
    '  .sfh-t{font-size:23px}',
    '  .sfh-lede{font-size:13px;margin-bottom:18px}',
    '}',

    '.sfh-grip{width:36px;height:4px;border-radius:2px;',
    '  background:rgba(255,255,255,0.20);margin:0 auto 14px}',
    '.sfh-t{font-size:21px;font-weight:700;color:#fff;letter-spacing:-0.35px;',
    '  margin-bottom:5px;text-align:center}',
    '.sfh-lede{font-size:12.5px;line-height:1.5;text-align:center;',
    '  color:rgba(255,255,255,0.52);margin:0 6px 16px}',
    '.sfh-row{display:flex;gap:13px;align-items:flex-start;margin-bottom:13px}',
    '.sfh-ic{flex:0 0 34px;height:34px;border-radius:10px;',
    '  background:rgba(211,47,47,0.16);border:1px solid rgba(211,47,47,0.28);',
    '  display:flex;align-items:center;justify-content:center;font-size:16px}',
    '.sfh-rt{font-size:14px;font-weight:600;color:rgba(255,255,255,0.94);',
    '  margin-bottom:2px}',
    '.sfh-rd{font-size:12.5px;line-height:1.45;color:rgba(255,255,255,0.55)}',

    '.sfh-sep{display:flex;align-items:center;gap:9px;margin:3px 0 11px}',
    '.sfh-sep:before,.sfh-sep:after{content:"";flex:1;height:1px;',
    '  background:rgba(255,255,255,0.11)}',
    '.sfh-sep span{font-size:9.5px;text-transform:uppercase;',
    '  letter-spacing:0.8px;font-weight:700;color:rgba(255,255,255,0.34)}',

    '.sfh-tools{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}',
    /* Grid, not flex: inline wrapping put the second line under the bold
       name and left a ragged edge. Columns = icon / name / where. */
    '.sfh-tool{display:grid;grid-template-columns:auto auto 1fr;',
    '  align-items:baseline;column-gap:7px;',
    '  background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.07);',
    '  border-radius:9px;padding:8px 11px;font-size:11.5px;line-height:1.45}',
    '.sfh-tic{font-size:11px}',
    '.sfh-tn{font-weight:700;color:rgba(255,255,255,0.93);white-space:nowrap}',
    '.sfh-tw{color:rgba(255,255,255,0.50);min-width:0}',
    /* Narrow phones: stack the description so neither part is squeezed. */
    '@media(max-width:400px){',
    '  .sfh-tool{grid-template-columns:auto 1fr}',
    '  .sfh-tw{grid-column:2;margin-top:2px}',
    '}',

    '.sfh-ok{width:100%;height:46px;margin-top:5px;border:0;border-radius:13px;',
    '  background:#d32f2f;color:#fff;font-size:15px;font-weight:650;',
    '  letter-spacing:0.1px;cursor:pointer;font-family:inherit;',
    '  -webkit-tap-highlight-color:transparent;transition:background .15s ease}',
    '.sfh-ok:hover{background:#e03a3a}',
    '.sfh-ok:active{background:#b52626}',
    '.sfh-ok:focus-visible{outline:2px solid #fff;outline-offset:2px}',
    /* Mouse users get an explicit escape hatch; touch users tap the backdrop
       or the button, and a tiny × is a poor touch target. */
    '.sfh-esc{display:none;text-align:center;font-size:10.5px;',
    '  color:rgba(255,255,255,0.30);margin-top:9px}',
    '@media(min-width:700px){.sfh-esc{display:block}}',

    '@media(prefers-reduced-motion:reduce){',
    '  #sfh,.sfh-card{transition:none}}'
  ].join('');

  /* ── Build ────────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function show() {
    var name = null;
    try { name = new URLSearchParams(location.search).get('demo'); } catch (e) {}

    var style = document.createElement('style');
    style.id = 'sfh-css';
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'sfh';
    wrap.innerHTML =
      '<div class="sfh-card" role="dialog" aria-modal="true"'
      + ' aria-labelledby="sfh-title">'
      + '<div class="sfh-grip"></div>'
      + '<div class="sfh-t" id="sfh-title">'
      + (name ? 'Built for ' + esc(name) : 'Welcome to SignFlow') + '</div>'
      + '<div class="sfh-lede">Every job you\u2019re running, on one board. '
      + 'Two things worth trying:</div>'
      + rows().map(function (r) {
          return '<div class="sfh-row"><div class="sfh-ic">' + r[0] + '</div>'
            + '<div><div class="sfh-rt">' + r[1] + '</div>'
            + '<div class="sfh-rd">' + r[2] + '</div></div></div>';
        }).join('')
      + '<div class="sfh-sep"><span>The three smart tools</span></div>'
      + '<div class="sfh-tools">'
      + TOOLS.map(function (t) {
          return '<div class="sfh-tool"><span class="sfh-tic">' + t[0] + '</span>'
            + '<span class="sfh-tn">' + t[1] + '</span>'
            + '<span class="sfh-tw">' + t[2] + '</span></div>';
        }).join('')
      + '</div>'
      + '<button class="sfh-ok" type="button">Start exploring</button>'
      + '<div class="sfh-esc">Press Esc or click outside to close</div>'
      + '</div>';
    document.body.appendChild(wrap);

    var card = wrap.querySelector('.sfh-card');
    var btn = wrap.querySelector('.sfh-ok');

    /* Remember what had focus so a keyboard user is not dumped at the top of
       the document on close. */
    var prevFocus = document.activeElement;

    function close() {
      if (wrap.dataset.closing) return;
      wrap.dataset.closing = '1';
      try { localStorage.setItem(LS, '1'); } catch (e) {}
      wrap.classList.remove('sfh-in');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {}
      }, 320);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      /* Keep Tab inside the dialog — it is modal, and there is exactly one
         focusable control, so Tab simply stays put. */
      if (e.key === 'Tab') { e.preventDefault(); btn.focus(); }
    }

    btn.addEventListener('click', close);
    /* Backdrop only — a click that started inside the card must not close. */
    wrap.addEventListener('click', function (e) {
      if (!card.contains(e.target)) close();
    });
    document.addEventListener('keydown', onKey, true);

    /* Double rAF: the element must be laid out in its pre-animation state
       before the class flips, or the transition is skipped entirely. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        wrap.classList.add('sfh-in');
        /* Focus the action for keyboard/screen-reader users. Not on touch —
           it can summon the on-screen keyboard region on some builds. */
        if (!coarse) { try { btn.focus({ preventScroll: true }); } catch (e) {} }
      });
    });
  }

  function init() {
    if (document.getElementById('sfh')) return;
    try { if (localStorage.getItem(LS)) return; } catch (e) {}

    /* Pipeline only. Peter's schedule.html has no detail panel, so the
       "click a job for the full story" claim would be false there. */
    var p = location.pathname;
    var onPipeline = p.indexOf('schedule') === -1
      && p.indexOf('customers') === -1 && p.indexOf('jobs') === -1
      && p.indexOf('reports') === -1 && p.indexOf('settings') === -1;
    if (!onPipeline) return;

    /* Wait for the board so the sheet never covers an empty page, and so the
       prospect demo's boot veil has cleared first. Bounded, then show
       anyway — the introduction is not worth losing to a slow render. */
    (function waitForBoard(tries) {
      /* Selector matches signflow-engine.js allCards() — .board .card /
         .col .card. An invented class name here would silently never match
         and the sheet would always fire on the timeout instead. */
      var ready = document.querySelector('.board .card, .col .card');
      var veil = document.getElementById('sf-veil');
      var veilGone = !veil || veil.style.opacity === '0'
        || getComputedStyle(veil).opacity === '0';
      if ((ready && veilGone) || tries > 60) { show(); return; }
      setTimeout(function () { waitForBoard(tries + 1); }, 60);
    })(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.SFHint = {
    /* Escape hatch for testing / re-showing after a reset. */
    reset: function () { try { localStorage.removeItem(LS); } catch (e) {} },
    show: show
  };
})(window);
