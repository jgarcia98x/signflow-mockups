/*! SignFlow — Copyright (c) 2026 Jordan Garcia. All rights reserved.
 *  Proprietary and confidential. Public visibility of this file is for
 *  demonstration hosting only and grants no rights. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════════════════
   signflow-queue.js — Smart Queue, computed
   ───────────────────────────────────────────────────────────────────────
   Replaces eight hand-typed queue items and four invented callouts
   ("Est. 2.3 days saved") with arithmetic over things Peter controls.

   Two questions, deliberately kept apart:
     • What should I work on today?  → priority (value x likelihood,
       urgency, and whether it has gone quiet). Comes from SFConversions.
     • What can run at the same time? → capacity. A job only blocks
       another when both need the same constrained resource on the same
       day. Crew availability lives in the crew/vendor grid Peter edits;
       vendor status lives on the job.

   Deliberately NOT modelled: vendor return dates. Peter said he never
   gets a firm date, so any day-count would be invented. "It's with the
   vendor" is the whole signal, and it is enough — that job is moving
   without consuming his crew.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var RES_KEY = 'sf_resources_v1';   /* shared with signflow-engine.js */
  /* Week shape lives in SFStore so queue and engine cannot drift. Read
     lazily via days() — SFStore may not be defined when this file is
     evaluated, only when build() runs. */
  function days() {
    return (global.SFStore && global.SFStore.DAYS)
      || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  }
  function dayDefault(d) {
    return (global.SFStore && global.SFStore.defaultAvail)
      ? global.SFStore.defaultAvail(d)
      : 'free';
  }

  function resState() {
    try { return JSON.parse(localStorage.getItem(RES_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  /* Crew rows only — vendors are not Peter's capacity. */
  var CREW = ['Mike Reyes', 'Dave Kowalski', 'Sarah Mitchell', 'Install Crew A'];

  /* Days where at least one crew member is not busy. This is the honest
     basis for "these can run together": real capacity, edited by Peter. */
  function availOf(st, who, day) {
    var v = (st[who] || {})[day];
    return v || dayDefault(day);
  }

  /* 'off' is excluded as well as 'busy': a day nobody works is not free
     capacity. Without this, adding Sat/Sun would have handed the board two
     free crew-days that do not exist. */
  function freeDays() {
    var st = resState();
    return days().filter(function (d) {
      return CREW.some(function (c) {
        var v = availOf(st, c, d);
        return v !== 'busy' && v !== 'off';
      });
    });
  }

  /* A job needs Peter's crew unless it is office work or sitting at a
     vendor. That single distinction is what makes parallelism real. */
  function needsCrew(job) {
    if (job.vstatus === 'out') return false;
    if (job.needs === 'office') return false;
    return true;
  }

  function atVendor(job) {
    return job.vstatus === 'out';
  }

  function build() {
    var S = global.SFStore, C = global.SFConversions;
    var live = C.liveScores();

    /* Rank by the same score Smart Conversions uses, so the two tools
       can never disagree about which job matters — then let the install
       date override it.

       Expected value alone answers "which job is worth most?", which is
       the wrong question for a Monday morning. A $58k job installing in
       six weeks does not need attention today; an $8k job installing
       Tuesday does. A shop that misses install dates loses the customer
       regardless of how well the job was scored.

       So urgency is a tier, not a weighting. Value only breaks ties
       inside a tier. That keeps both facts legible — Peter can see it
       is first because of the date, not because of some blended number
       he cannot argue with. */
    function tier(r) {
      if (r.dueState === 'overdue')  return 0;   // already late
      if (r.dueState === 'imminent') return 1;   // installs within 3 days
      if (r.tight)                   return 2;   // not enough runway left
      if (r.dueState === 'soon')     return 3;   // installs this week
      return 4;                                  // has runway, or no date set
    }

    var ranked = live.all.slice().sort(function (a, b) {
      var ta = tier(a), tb = tier(b);
      if (ta !== tb) return ta - tb;
      /* Inside the same urgency tier, soonest install wins; a job with
         no date set cannot jump ahead of one with a real deadline. */
      if (ta <= 3 && a.daysToDue !== b.daysToDue) return a.daysToDue - b.daysToDue;
      return b.expected - a.expected;
    });

    /* ── Capacity is a different question from priority ────────────────
       These lists used to filter `ranked`, which comes from liveScores() and
       deliberately excludes won jobs. But SFStore.isWon() counts the Install
       stage as won — correct for "should I chase this?", wrong for "is my
       crew tied up?", because Install is exactly when the crew is on site.
       Result: Install jobs vanished from capacity and the board under-reported
       contention.

       So capacity reads the store directly and drops only work that consumes
       nothing (Complete / cold / lost), ordered by the ranking where known.
       "Won" and "consumes no resources" are different predicates.

       Reconciliation rule: onSite + atVendor + office must equal the live
       job count. If those three do not sum to `liveJobs`, one of them is
       lying. */
    var rankPos = {};
    ranked.forEach(function (r, i) { rankPos[r.id] = i; });

    var liveAll = S.all().filter(function (j) {
      return j.stage !== 'Complete' && j.priority !== 'cold' && j.priority !== 'lost'
        && !j.done;
    }).sort(function (a, b) {
      var ia = rankPos[a.id], ib = rankPos[b.id];
      if (ia == null && ib == null) return 0;
      if (ia == null) return 1;
      if (ib == null) return -1;
      return ia - ib;
    });

    var waitingAll = liveAll.filter(function (j) { return atVendor(j); });
    var crewAll    = liveAll.filter(function (j) { return !atVendor(j) && needsCrew(j); });
    var officeAll  = liveAll.filter(function (j) { return !atVendor(j) && !needsCrew(j); });

    /* Priority-scoped views stay ranked-derived — those answer "what should
       I do next", where excluding won work is right. */
    var waiting = ranked.filter(function (r) {
      var j = S.get(r.id) || {};
      return atVendor(j);
    });

    var crewJobs = crewAll;

    var officeJobs = ranked.filter(function (r) {
      var j = S.get(r.id) || {};
      return !atVendor(j) && !needsCrew(j);
    });

    var free = freeDays();

    /* Parallel capacity: how many crew-needing jobs could actually start
       alongside each other, bounded by real free crew. Never a guess. */
    var st = resState();
    var maxFree = 0;
    free.forEach(function (day) {
      var n = CREW.filter(function (c) {
        var v = availOf(st, c, day);
        return v !== 'busy' && v !== 'off';
      }).length;
      if (n > maxFree) maxFree = n;
    });

    /* Bounded by real free crew AND by how many jobs actually need them. */
    var parallelNow = Math.min(maxFree, crewAll.length);

    return {
      today: crewJobs.slice(0, 3),
      officeJobs: officeJobs,
      waiting: waiting,
      freeDays: free,
      maxFreeCrew: maxFree,
      parallelNow: parallelNow,
      /* Capacity-scoped counts — these reconcile against liveJobs. */
      needsOnSite: crewAll.length,
      atVendorCount: waitingAll.length,
      officeCount: officeAll.length,
      liftJobs: crewAll.filter(function (j) { return j.needs === 'lift'; }).length,
      liveJobs: liveAll.length,
      /* Office work and vendor-side jobs genuinely run alongside crew
         work — they compete for nothing. */
      trueParallel: officeAll.length + waitingAll.length,
      all: ranked,
      live: live,
      stalling: live.stalling
    };
  }

  global.SFQueue = {
    build: build,
    freeDays: freeDays,
    needsCrew: needsCrew,
    atVendor: atVendor,
    CREW: CREW,
    get DAYS() { return days(); }
  };
})(window);

/* ═══════════════════════════════════════════════════════════════════════
   Renderer — draws the computed queue into #sf-queue-computed.
   Kept in the same file as the maths so the numbers on screen and the
   numbers in the model can never drift apart.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US'); }

  /* A short, honest date chip. Renders nothing when no date is set —
     an absent deadline is not a deadline of "someday". */
  function dueTag(r) {
    if (r.daysToDue === null) return '';
    var c, t;
    /* "22d late" and "2d" must not be told apart by colour alone —
       same chip, opposite meaning is a real misread risk, and colour
       is the one channel some people do not have. Spell out tense. */
    if (r.dueState === 'overdue')       { c = '#E2726B'; t = Math.abs(r.daysToDue) + 'd late'; }
    else if (r.dueState === 'imminent') { c = '#D9A441'; t = 'in ' + r.daysToDue + 'd'; }
    else if (r.dueState === 'soon')     { c = 'rgba(255,255,255,0.5)'; t = 'in ' + r.daysToDue + 'd'; }
    else return '';
    return '<span style="color:' + c + ';font-weight:700;margin-right:6px;">' + t + '</span>';
  }

  function item(r, opts) {
    opts = opts || {};
    var reasons = (r.reasons || []).slice(0, 2).map(function (x) {
      return (x.good ? '▲ ' : '▼ ') + x.txt;
    }).join(' · ');

    return '<div class="queue-item"' + (opts.style ? ' style="' + opts.style + '"' : '') + '>'
      + '<div class="qi-row">'
      +   '<div class="qi-num"' + (opts.numColor ? ' style="color:' + opts.numColor + ';"' : '')
      +     '>' + (opts.num || '') + '</div>'
      +   '<div class="qi-info"><div class="qi-name">' + esc(r.name) + '</div>'
      +     (opts.tag ? '<div style="font-size:9px;color:' + (opts.tagColor || '#F9A825')
                      + ';font-weight:700;">' + esc(opts.tag) + '</div>' : '')
      +   '</div>'
      +   '<div class="qi-badge-wrap">' + (opts.badge || '<span class="qi-seq">—</span>') + '</div>'
      +   '<button class="qi-why" aria-expanded="false">Why?<em class="chevron">▾</em></button>'
      + '</div>'
      + '<div class="qi-explain"><div class="qi-explain-inner">'
      +   (opts.why || (r.stage + ' · ' + money(r.value) + ' · scored ' + r.score + '%'
                        + (reasons ? ' — ' + reasons : '')))
      + '</div></div>'
      + '</div>';
  }

  function callout(bg, border, color, title, body, foot) {
    return '<div style="background:' + bg + ';border:1px solid ' + border
      + ';border-radius:10px;padding:11px 12px;margin-bottom:8px;">'
      + '<div style="font-size:11px;font-weight:800;color:' + color
      + ';margin-bottom:6px;letter-spacing:0.3px;">' + title + '</div>'
      + '<div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.6;">' + body + '</div>'
      + (foot ? '<div style="margin-top:8px;padding-top:7px;border-top:1px solid '
                + border + ';font-size:10px;color:rgba(255,255,255,0.32);">' + foot + '</div>' : '')
      + '</div>';
  }

  function render() {
    var host = document.getElementById('sf-queue-computed');
    if (!host) return;

    /* Fail loudly. An earlier silent `return` here rendered an empty
       sidebar that looked like "no work today" — the worst possible
       lie for this tool. */
    if (!global.SFConversions || !global.SFStore) {
      host.innerHTML = '<div style="font-size:11px;color:#E2A0A0;padding:10px 2px;'
        + 'line-height:1.6;">Smart Queue could not load its scoring engine, so it '
        + 'has nothing trustworthy to show. (signflow-conversions.js missing.)</div>';
      return;
    }

    var q = global.SFQueue.build();
    var html = '';

    /* ── Install dates: the hardest fact in the whole tool ──────
       Peter types these himself, so they are counted, never inferred.
       Placed above capacity because a job going late matters more than
       how many crew are free. */
    var L = q.live;
    if (L.late.length || L.thisWeek.length) {
      var lines = [];
      L.late.forEach(function (r) {
        lines.push('<strong>' + esc(r.name) + '</strong> — install date passed '
          + Math.abs(r.daysToDue) + 'd ago');
      });
      L.thisWeek.forEach(function (r) {
        lines.push('<strong>' + esc(r.name) + '</strong> — installs in '
          + r.daysToDue + 'd' + (r.stage === 'Install' ? '' : ', still in ' + r.stage));
      });
      var late = L.late.length;
      html += callout(
        late ? 'rgba(194,69,63,0.09)' : 'rgba(217,164,65,0.07)',
        late ? 'rgba(194,69,63,0.28)' : 'rgba(217,164,65,0.22)',
        late ? '#E2726B' : '#D9A441',
        (late ? '🚨 ' + late + ' PAST ITS INSTALL DATE'
              : '📅 ' + L.thisWeek.length + ' INSTALLING THIS WEEK'),
        lines.slice(0, 4).join('<br>'),
        'From the due dates you set. These drive the order below.');
    }

    /* Runway warning — hedged, because the pace figures behind it are a
       prior rather than Peter's own measured history. */
    /* Only warn where it is actionable: a job already past its date is
       covered above, and a job whose runway is only slightly tight is
       within the noise of a prior-based estimate. Requires a real
       shortfall (>25% over the time available) and caps the list, so
       this stays a warning rather than wallpaper. */
    var runway = L.deadlineRisk.filter(function (r) {
      return r.needDays > r.daysToDue * 1.25 && r.daysToDue >= 0;
    });
    /* If this fires on a large share of the board, the honest reading
       is that the built-in pace figures do not match this shop — not
       that most jobs are doomed. Say that instead of crying wolf.
       Disappears on its own once real history replaces the priors. */
    var datedN = L.dated.length;
    if (datedN >= 4 && runway.length / datedN > 0.4) {
      html += callout('rgba(255,255,255,0.04)', 'rgba(255,255,255,0.12)',
        'rgba(255,255,255,0.6)',
        'ℹ️ TIMELINE ESTIMATES LOOK OFF',
        runway.length + ' of ' + datedN + ' dated jobs would miss their install '
          + 'date at the pace this tool assumes.',
        'That usually means the assumed pace is wrong, not the dates. These '
          + 'become accurate once there is enough of your own stage history.');
    } else if (runway.length) {
      html += callout('rgba(217,164,65,0.05)', 'rgba(217,164,65,0.18)', '#D9A441',
        '⏳ ' + runway.length + ' MAY NOT LEAVE ENOUGH TIME',
        runway.slice(0, 3).map(function (r) {
          return '<strong>' + esc(r.name) + '</strong> — ' + r.stagesLeft + ' stage'
            + (r.stagesLeft > 1 ? 's' : '') + ' to go, ' + r.daysToDue + 'd left';
        }).join('<br>'),
        'Based on typical pace per stage, not your measured history yet.');
    }

    /* ── Capacity, from the grid Peter edits ── */
    if (q.parallelNow > 1) {
      html += callout('rgba(249,168,37,0.08)', 'rgba(249,168,37,0.25)', '#F9A825',
        '⚡ ' + q.parallelNow + ' JOBS CAN RUN AT THE SAME TIME',
        q.maxFreeCrew + ' of ' + global.SFQueue.CREW.length + ' crew are free on '
          + (q.freeDays.length ? q.freeDays.join(', ') : 'no days this week')
          + '. That is how many crew jobs can move in parallel.',
        'From your crew availability grid — change it and this updates.');
    } else if (q.freeDays.length === 0) {
      html += callout('rgba(194,69,63,0.07)', 'rgba(194,69,63,0.22)', '#C2453F',
        '⛔ NO CREW CAPACITY THIS WEEK',
        'Every crew member is marked busy all five days. Nothing new can start '
          + 'until something frees up.', null);
    }

    /* ── Vendor-side work: real parallelism, no invented dates ── */
    if (q.waiting.length) {
      html += callout('rgba(206,147,216,0.07)', 'rgba(206,147,216,0.22)', '#CE93D8',
        '🔗 ' + q.waiting.length + ' JOB' + (q.waiting.length > 1 ? 'S' : '') + ' WITH A VENDOR',
        q.waiting.map(function (r) {
          return '<strong>' + esc(r.name) + '</strong> — out for work, no crew needed';
        }).join('<br>'),
        'These progress without using your crew, so crew work runs alongside them.');
    }

    /* ── Office work runs alongside anything ── */
    if (q.officeJobs.length) {
      html += callout('rgba(102,187,106,0.06)', 'rgba(102,187,106,0.18)', '#66BB6A',
        '🗂️ ' + q.officeJobs.length + ' CAN MOVE FROM THE OFFICE',
        q.officeJobs.slice(0, 3).map(function (r) {
          return '<strong>' + esc(r.name) + '</strong> — ' + r.stage;
        }).join('<br>'),
        'Quotes, permits and design need no crew — do these while jobs are out.');
    }

    /* ── Today's calls, ranked ── */
    if (!q.today.length && !q.officeJobs.length) {
      html += '<div style="font-size:11.5px;color:rgba(255,255,255,0.4);padding:10px 2px;">'
            + 'No open jobs need attention right now.</div>';
    }

    q.today.forEach(function (r, i) {
      html += item(r, {
        num: String(i + 1),
        badge: '<span class="qi-seq">' + dueTag(r) + money(r.expected) + '</span>',
        style: i ? 'margin-top:6px;' : ''
      });
    });

    /* ── Gone quiet: same source as Smart Conversions ── */
    /* A job already listed above must not reappear here — the same
       card twice reads as two separate pieces of work. */
    var shownIds = q.today.map(function (r) { return r.id; });
    var quiet = q.stalling.filter(function (r) { return shownIds.indexOf(r.id) === -1; });
    if (quiet.length) {
      var s0 = quiet[0];
      html += '<div style="margin-top:10px;">' + item(s0, {
        num: '❄️',
        numColor: '#4FC3F7',
        tag: s0.inStage + ' days in ' + s0.stage + ' — usually ' + s0.norm,
        tagColor: '#4FC3F7',
        badge: '<span style="font-size:9px;color:#4FC3F7;font-weight:700;">QUIET</span>',
        why: 'Sitting ' + s0.overdueBy + ' days longer than your usual pace at this '
           + 'stage. ' + money(s0.value) + ' still open.'
      }) + '</div>';
    }

    host.innerHTML = html;

    /* Re-attach the action buttons and Why? toggles the engine owns. */
    if (global.SFQueueRefresh) global.SFQueueRefresh();
  }

  global.SFQueueRender = render;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(render, 60); });
  } else {
    setTimeout(render, 60);
  }
})(window);
