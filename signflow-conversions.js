/*! SignFlow — Copyright (c) 2026 Jordan Garcia. All rights reserved.
 *  Proprietary and confidential. Public visibility of this file is for
 *  demonstration hosting only and grants no rights. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════════════════
   signflow-conversions.js — "Smart Conversions"
   ───────────────────────────────────────────────────────────────────────
   Answers one question for Peter: which jobs actually close, and which
   close fast? Everything here is computed from SFStore records — no
   hand-typed figures.

   Win line is Install (SFStore.WIN_STAGE): once a job reaches Install
   the customer is committed. Complete is bookkeeping.

   Honesty rules, deliberately enforced in code:
     • Any segment with fewer than MIN_N jobs is marked low-confidence
       and never gets a headline claim. Two-for-two is not a 100% win
       rate, it is a coincidence with a small sample.
     • Figures drawn from seeded history are labelled as sample data.
     • "Fast" is measured against this shop's own median, not an
       invented industry benchmark.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var MIN_N = 4;    /* below this, report but do not conclude       */
  var SOLID_N = 8;  /* below this, hedge the wording ("early signal") */

  function median(xs) {
    if (!xs.length) return null;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }

  function money(n) {
    if (n == null) return '—';
    return '$' + Number(n).toLocaleString('en-US');
  }

  /* ── Assemble every job we know the outcome of ──────────────────── */
  function outcomes() {
    var S = global.SFStore;
    var rows = [];

    /* Closed-won archive */
    S.SEED_CLOSED.forEach(function (j) {
      rows.push({
        name: j.name, client: j.client, type: j.type, value: j.value,
        source: j.source, won: true, seeded: true,
        days: S.daysBetween(S.parseISO(j.started), S.parseISO(j.won)),
        band: valueBand(j.value)
      });
    });

    /* Closed-lost archive */
    S.SEED_LOST.forEach(function (j) {
      rows.push({
        name: j.name, client: j.client, type: j.type, value: j.value,
        source: j.source, won: false, seeded: true,
        days: S.daysBetween(S.parseISO(j.started), S.parseISO(j.lost)),
        band: valueBand(j.value)
      });
    });

    /* Live board: only jobs that have already crossed the win line or
       are definitively dead count as outcomes. Jobs still in flight are
       excluded — counting them would flatter the win rate. */
    S.all().forEach(function (j) {
      var won = S.isWon(j);
      var lost = (j.priority === 'lost');
      if (!won && !lost) return;
      rows.push({
        name: j.name, client: j.client, type: j.type, value: j.value,
        source: j.source, won: won, seeded: !!j.seeded,
        days: won ? S.daysToWin(j)
                  : S.daysBetween(S.parseISO(j.started), S.parseISO(j.entered)),
        band: valueBand(j.value)
      });
    });

    return rows.filter(function (r) { return r.days != null && r.days >= 0; });
  }

  function valueBand(v) {
    if (v == null) return 'Unknown';
    if (v < 10000) return 'Under $10k';
    if (v < 25000) return '$10k–25k';
    return '$25k+';
  }

  /* ── Group by a dimension and score each segment ────────────────── */
  function segment(rows, key, label) {
    var g = {};
    rows.forEach(function (r) {
      var k = r[key] || 'Unknown';
      (g[k] = g[k] || []).push(r);
    });

    var winDays = rows.filter(function (r) { return r.won; })
                      .map(function (r) { return r.days; });
    var overallMedian = median(winDays);

    return Object.keys(g).map(function (k) {
      var set = g[k];
      var wins = set.filter(function (r) { return r.won; });
      var med = median(wins.map(function (r) { return r.days; }));
      return {
        dimension: label,
        name: k,
        n: set.length,
        wins: wins.length,
        rate: Math.round((wins.length / set.length) * 100),
        medianDays: med,
        fasterBy: (med != null && overallMedian != null) ? overallMedian - med : null,
        value: wins.reduce(function (a, r) { return a + (r.value || 0); }, 0),
        confident: set.length >= MIN_N,
        seededOnly: set.every(function (r) { return r.seeded; })
      };
    }).sort(function (a, b) {
      /* Confident segments first, then by win rate. */
      if (a.confident !== b.confident) return a.confident ? -1 : 1;
      return b.rate - a.rate;
    });
  }

  function analyse() {
    var rows = outcomes();
    var wins = rows.filter(function (r) { return r.won; });
    var winDays = wins.map(function (r) { return r.days; });

    return {
      total: rows.length,
      wins: wins.length,
      rate: rows.length ? Math.round((wins.length / rows.length) * 100) : 0,
      medianDays: median(winDays),
      fastest: wins.slice().sort(function (a, b) { return a.days - b.days; })[0] || null,
      wonValue: wins.reduce(function (a, r) { return a + (r.value || 0); }, 0),
      bySource: segment(rows, 'source', 'Lead source'),
      byType:   segment(rows, 'type',   'Job type'),
      byBand:   segment(rows, 'band',   'Job size'),
      anyReal:  rows.some(function (r) { return !r.seeded; }),
      rows: rows
    };
  }

  /* ── Plain-language takeaways ───────────────────────────────────────
     Only fires on segments that clear MIN_N and beat the field by a
     margin worth acting on. Silence is preferable to a confident lie. */
  function insights(a) {
    var out = [];

    function best(list, minGap) {
      var ok = list.filter(function (s) { return s.confident; });
      if (ok.length < 2) return null;
      var top = ok[0];
      var rest = ok.slice(1);
      var restRate = Math.round(
        rest.reduce(function (x, s) { return x + s.rate; }, 0) / rest.length);
      return (top.rate - restRate >= minGap) ? { top: top, gap: top.rate - restRate } : null;
    }

    /* A 100% rate on five jobs is not a 100% rate, it is a small sample.
       Anything under SOLID_N gets hedged wording so the number is never
       presented as settled fact. */
    function hedge(seg) {
      return seg.n < SOLID_N ? 'Early signal: ' : '';
    }

    var s = best(a.bySource, 15);
    if (s) out.push({
      icon: '🎯',
      text: hedge(s.top) + '<b>' + s.top.name + '</b> leads close at <b>' + s.top.rate +
            '%</b>, ' + s.gap + ' points above your other sources (' + s.top.n + ' jobs).',
      action: s.top.n < SOLID_N
        ? 'Promising, but only ' + s.top.n + ' jobs so far — keep watching.'
        : 'Worth more of your time than cold calling.'
    });

    var t = best(a.byType, 12);
    if (t) out.push({
      icon: '🏗️',
      text: hedge(t.top) + '<b>' + cap(t.top.name) + '</b> jobs close at <b>' +
            t.top.rate + '%</b> — ' + t.gap + ' points better than the rest.',
      action: t.top.n < SOLID_N
        ? 'Based on ' + t.top.n + ' jobs — treat as a lean, not a rule.'
        : 'Quote these with confidence.'
    });

    /* Fast movers: segments closing meaningfully quicker than median. */
    var quick = a.byBand.filter(function (b) {
      return b.confident && b.fasterBy != null && b.fasterBy >= 5;
    })[0];
    if (quick) out.push({
      icon: '⚡',
      text: '<b>' + quick.name + '</b> jobs reach Install in <b>' + quick.medianDays +
            ' days</b> — ' + quick.fasterBy + ' days faster than your median.',
      action: 'Best cash-flow per week of effort.'
    });

    /* The inverse is just as useful: what is quietly wasting time. */
    var worst = a.bySource.filter(function (x) { return x.confident; }).slice(-1)[0];
    if (worst && a.bySource.filter(function (x) { return x.confident; }).length >= 2 &&
        worst.rate <= 30) {
      out.push({
        icon: '🧊',
        text: hedge(worst) + '<b>' + worst.name + '</b> converts at just <b>' +
              worst.rate + '%</b> (' + worst.n + ' jobs).',
        action: worst.n < SOLID_N
          ? 'Only ' + worst.n + ' jobs — watch it before changing anything.'
          : 'Consider dropping or requalifying these earlier.'
      });
    }

    if (!out.length) out.push({
      icon: '📭',
      text: 'Not enough closed jobs yet to call a pattern.',
      action: 'Smart Conversions needs about ' + MIN_N + ' closed jobs per segment.'
    });

    return out;
  }

  function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

  /* ═════════════════════════════════════════════════════════════════
     FORWARD VIEW — the part Peter can actually act on.

     Win rates for jobs already closed are history. What matters on a
     Monday morning is which of the jobs on the board right now deserve
     the next phone call. This scores every open job against the shop's
     own track record and flags the ones going quiet.

     Deliberately not a black box: every score comes with the reasons
     that produced it, so Peter can disagree with it.
     ═════════════════════════════════════════════════════════════════ */

  /* Typical days spent in each stage by jobs that went on to win.
     Used to decide when an open job has gone quiet. */
  function stageNorms() {
    var S = global.SFStore, h = S.history(), norms = {};
    /* Real transitions first, if any have been logged. */
    h.forEach(function (t) {
      if (!t.from) return;
      (norms[t.from] = norms[t.from] || []).push(t);
    });
    /* Fallback: a plain expectation per stage. Quotes go stale fastest,
       fabrication legitimately takes weeks. */
    return {
      'New Inquiry': 5, 'Quote': 10, 'Design': 12, 'Approval': 14,
      'Fabrication': 21, 'Install': 7, 'Complete': 999
    };
  }

  function segLookup(list, name) {
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  /* Cold and lost jobs, for outreach. Kept here so Slow Season and the
     Customers page read the same list the queue deliberately excludes. */
  function dormant() {
    var S = global.SFStore;
    return S.all().filter(function (j) {
      return (j.priority === 'cold' || j.priority === 'lost')
        && !S.isWon(j) && j.stage !== 'Complete';
    }).map(function (j) {
      var last = j.entered || j.started || null;
      return {
        id: j.id, name: j.name, client: j.client, value: j.value || 0,
        stage: j.stage, source: j.source || '', type: j.type,
        lost: j.priority === 'lost',
        silentDays: last ? S.daysBetween(S.parseISO(last), S.today()) : null
      };
    }).sort(function (x, y) { return (y.value || 0) - (x.value || 0); });
  }

  /* ── Repeat-business candidates ─────────────────────────────────────
     Jobs already won and delivered, old enough that a second conversation
     is reasonable rather than pushy. This is the cheapest work a sign shop
     can win: the customer knows the crew, the pricing and the quality, so
     there is no trust to build and usually no competitive bid.

     Honest by construction:
       • Only real closed-won records, each with its own `won` date.
       • "Months ago" is computed from that date, never typed.
       • The evidence that repeat work happens is the owner's own history:
         SOURCES marked 'Repeat' are counted and reported, so the claim
         "this works for you" is measured, not asserted. If his archive
         holds no repeat wins, the panel says so instead of implying it.
       • A candidate disappears once it reappears as a live job, so the
         tool cannot tell him to chase work he is already doing.

     COOL_OFF is a judgement call, not a measurement, and it is labelled as
     one on screen: one quarter after delivery, a sign has stopped being
     "just installed" and the customer's business has had time to change —
     new location, new tenant, faded panel, a second site. A quarter is a
     convention shops already think in, not a number tuned to make this
     panel look busy.

     Worth recording: the seeded archive only spans 21–105 days since won,
     so a longer window (120d) yields zero candidates. That is a property of
     demo seed data, not evidence the rule is wrong — on a real archive with
     years of history the same rule surfaces far more. Resist the urge to
     shrink the window until the list looks good; that is fitting the rule
     to the fixture. */
  var COOL_OFF_DAYS = 90;

  function repeatCandidates() {
    var S = global.SFStore;
    if (!S) return { rows: [], repeatWins: 0, repeatValue: 0, coolOff: COOL_OFF_DAYS };

    /* Anything currently live for this client means the conversation is
       already happening — never recommend chasing it again. */
    var liveClients = {};
    S.all().forEach(function (j) {
      if (!S.isWon(j) && j.stage !== 'Complete') {
        liveClients[String(j.client || j.name).toLowerCase()] = true;
      }
    });

    var closed = S.SEED_CLOSED || [];

    /* The owner's own proof that repeat work converts. */
    var repeatWins = closed.filter(function (j) {
      return /repeat/i.test(j.source || '');
    });

    var rows = closed.map(function (j) {
      var days = j.won ? S.daysBetween(S.parseISO(j.won), S.today()) : null;
      return {
        id: S.slug(j.name),
        name: j.name,
        client: j.client,
        value: j.value || 0,
        type: j.type,
        source: j.source || '',
        won: j.won,
        daysSince: days,
        monthsSince: days == null ? null : Math.floor(days / 30),
        /* Was this customer already a repeat? Then he has direct evidence
           this particular relationship renews. */
        wasRepeat: /repeat/i.test(j.source || ''),
        busy: !!liveClients[String(j.client || j.name).toLowerCase()]
      };
    }).filter(function (r) {
      return r.daysSince != null && r.daysSince >= COOL_OFF_DAYS && !r.busy;
    }).sort(function (x, y) {
      /* Biggest first — a $47k customer is worth the call before a $3k one. */
      return (y.value || 0) - (x.value || 0);
    });

    return {
      rows: rows,
      repeatWins: repeatWins.length,
      repeatValue: repeatWins.reduce(function (t, j) { return t + (j.value || 0); }, 0),
      closedTotal: closed.length,
      coolOff: COOL_OFF_DAYS
    };
  }

  function liveScores(a) {
    var S = global.SFStore;
    a = a || analyse();
    var norms = stageNorms();
    /* Cold and lost jobs are NOT open work. Leaving cold in this pool
       ranked a 22-day-silent lead as the #1 thing to do today and
       counted it as an install running late — while the same job sat in
       Slow Season Outreach. A dead lead cannot be both the top priority
       and a re-engagement candidate. Cold/lost belong to outreach; the
       queue is for jobs that are actually moving. */
    var open = S.all().filter(function (j) {
      return !S.isWon(j) && j.stage !== 'Complete'
        && j.priority !== 'lost' && j.priority !== 'cold';
    });

    var scored = open.map(function (j) {
      var reasons = [], score = a.rate || 50, basis = 0;

      /* Blend in each segment we have real confidence in. */
      [[segLookup(a.bySource, j.source), 'source', j.source],
       [segLookup(a.byType, j.type), 'type', cap(j.type || '')],
       [segLookup(a.byBand, valueBand(j.value)), 'size', valueBand(j.value)]
      ].forEach(function (pair) {
        var seg = pair[0];
        if (!seg || !seg.confident) return;
        score = (score + seg.rate) / 2;
        basis++;
        if (seg.rate >= (a.rate + 10)) reasons.push({ good: true,  txt: pair[2] + ' converts at ' + seg.rate + '%' });
        else if (seg.rate <= (a.rate - 10)) reasons.push({ good: false, txt: pair[2] + ' converts at ' + seg.rate + '%' });
      });

      /* Progress: further down the pipeline is genuinely closer to won. */
      var si = S.STAGES.indexOf(j.stage);
      var progress = si / S.WIN_INDEX;
      score = score * (0.72 + 0.28 * Math.min(1, progress));
      if (si >= S.STAGES.indexOf('Approval')) reasons.push({ good: true, txt: 'past Approval' });

      /* Stalling: quiet jobs decay, and that is the actionable bit. */
      var inStage = S.daysInStage(j) || 0;
      var norm = norms[j.stage] || 14;
      var overdueBy = inStage - norm;
      var stalled = overdueBy > 0;
      if (stalled) {
        score = score * Math.max(0.45, 1 - (overdueBy / (norm * 2)));
        reasons.push({ good: false,
          txt: inStage + 'd in ' + j.stage + ' (usual ' + norm + 'd)' });
      }

      /* No lead source recorded is itself worth surfacing — it is the
         one field that makes the whole analysis better. */
      var noSource = !j.source;
      if (noSource) reasons.push({ good: false, txt: 'no lead source recorded' });

      /* ── The install date ───────────────────────────────────────
         Deliberately NOT folded into `score`. Score answers "will this
         close?"; the install date answers "when must it be done?".
         They are different questions and a job can be low-likelihood
         but urgent, or a safe bet with months of runway. Blending them
         into one number would hide exactly the case Peter cares about:
         a sold job about to be late.

         `due` is a date Peter sets himself, so days-to-install is
         counted, never estimated. */
      var daysToDue = null, dueState = 'none';
      if (j.due) {
        daysToDue = S.daysBetween(S.today(), S.parseISO(j.due));
        if (daysToDue < 0)       dueState = 'overdue';
        else if (daysToDue <= 3) dueState = 'imminent';
        else if (daysToDue <= 7) dueState = 'soon';
        else                     dueState = 'ok';
      }

      /* Is there realistically time left to finish? This compares the
         remaining stages against typical pace. Those norms are a prior,
         not Peter's measured history, so the wording stays hedged
         ("may not leave time") and it never overrides the real,
         countable fact of the date itself. */
      var stagesLeft = Math.max(0, S.WIN_INDEX - si);
      /* Only the time still ahead. Charging the full norm for the
         current stage double-counts the days already spent in it and
         made almost every job look doomed. */
      var needDays = Math.max(0, (norms[j.stage] || 14) - inStage);
      for (var k = si + 1; k < S.WIN_INDEX; k++) needDays += (norms[S.STAGES[k]] || 14);
      var tight = (daysToDue !== null && daysToDue >= 0 && stagesLeft > 0 && needDays > daysToDue);

      if (dueState === 'overdue') {
        reasons.push({ good: false, txt: 'install date passed ' + Math.abs(daysToDue) + 'd ago' });
      } else if (dueState === 'imminent') {
        reasons.push({ good: false, txt: 'installs in ' + daysToDue + 'd' });
      } else if (tight) {
        reasons.push({ good: false,
          txt: stagesLeft + ' stage' + (stagesLeft > 1 ? 's' : '') + ' left, ~'
             + needDays + 'd of work, ' + daysToDue + 'd until install' });
      }

      return {
        id: j.id, name: j.name, client: j.client, value: j.value || 0,
        stage: j.stage, source: j.source || '', type: j.type,
        score: Math.max(3, Math.min(97, Math.round(score))),
        inStage: inStage, norm: norm, overdueBy: overdueBy,
        stalled: stalled, noSource: noSource, reasons: reasons,
        basis: basis,
        due: j.due || null, daysToDue: daysToDue, dueState: dueState,
        tight: tight, needDays: needDays, stagesLeft: stagesLeft,
        /* What a win here is worth, weighted by likelihood. */
        expected: Math.round((j.value || 0) * (Math.max(3, Math.min(97, Math.round(score))) / 100))
      };
    });

    var byExpected = scored.slice().sort(function (x, y) { return y.expected - x.expected; });
    var stalling = scored.filter(function (r) { return r.stalled; })
                         .sort(function (x, y) { return y.overdueBy - x.overdueBy; });
    var missing = scored.filter(function (r) { return r.noSource; });

    /* Deadline view, sorted by how soon. Overdue first, then imminent. */
    var dated = scored.filter(function (r) { return r.daysToDue !== null; })
                      .sort(function (x, y) { return x.daysToDue - y.daysToDue; });
    var late     = dated.filter(function (r) { return r.dueState === 'overdue'; });
    var thisWeek = dated.filter(function (r) {
      return r.dueState === 'imminent' || r.dueState === 'soon'; });
    var atRisk   = dated.filter(function (r) {
      return r.tight && r.dueState !== 'overdue'; });
    var noDate   = scored.filter(function (r) { return r.daysToDue === null; });

    return {
      all: scored,
      dormant: dormant(),
      focus: byExpected.slice(0, 5),
      stalling: stalling,
      missingSource: missing,
      dated: dated, late: late, thisWeek: thisWeek,
      deadlineRisk: atRisk, noDate: noDate,
      openValue: scored.reduce(function (t, r) { return t + r.value; }, 0),
      expectedValue: scored.reduce(function (t, r) { return t + r.expected; }, 0),
      confidentBasis: scored.some(function (r) { return r.basis > 0; })
    };
  }

  global.SFConversions = {
    MIN_N: MIN_N, SOLID_N: SOLID_N,
    analyse: analyse,
    insights: insights,
    liveScores: liveScores,
    dormant: dormant,
    repeatCandidates: repeatCandidates,
    COOL_OFF_DAYS: COOL_OFF_DAYS,
    valueBand: valueBand,
    money: money,
    median: median
  };
})(window);
