/*! SignFlow — Copyright (c) 2026 Jordan Garcia. All rights reserved.
 *  Proprietary and confidential. Public visibility of this file is for
 *  demonstration hosting only and grants no rights. See LICENSE.
 */
/* ═══════════════════════════════════════════════════════════════════════
   signflow-nudge.js — "Smart Nudge", computed
   ───────────────────────────────────────────────────────────────────────
   Replaces six hand-typed nudge cards ("❄️ 22 days silent · $8,600
   quote" — a string literal) with the same stall maths Smart Queue and
   Smart Conversions already use.

   A nudge is not a separate idea: it is a job that has gone quiet, with
   a person attached. So it reads from SFConversions.liveScores rather
   than inventing a second opinion. If the pipeline says a quote has sat
   16 days, the nudge says 16 — they cannot drift.

   customers.html previously did not even load SFStore (it was
   `undefined` there), so this tool had no access to job data at all.

   Honest by construction:
     • Days silent are counted from the job's stage entry date, never typed.
     • A nudge disappears when the job moves. It cannot recommend calling
       someone about a job that already closed.
     • Snooze and "mark lost" write to the store, so dismissing a nudge
       actually means something tomorrow.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SNOOZE_KEY = 'sf-nudge-snooze';

  function snoozed() {
    try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function snooze(id, days) {
    var s = snoozed();
    var until = new Date(global.SFStore.today().getTime() + (days || 7) * 86400000);
    s[id] = global.SFStore.iso(until);
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function isSnoozed(id) {
    var s = snoozed()[id];
    if (!s) return false;
    return global.SFStore.parseISO(s) > global.SFStore.today();
  }

  function initials(name) {
    return String(name || '?').replace(/[^A-Za-z ]/g, '').trim()
      .split(/\s+/).slice(0, 2).map(function (w) { return w[0]; })
      .join('').toUpperCase() || '?';
  }

  /* Deterministic colour per customer so avatars stay stable between
     renders rather than flickering on every redraw. */
  function tint(seed) {
    var h = 0;
    String(seed).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) % 360; });
    return 'hsl(' + h + ', 42%, 38%)';
  }

  /* ── What deserves a call today ───────────────────────────────────
     Three honest buckets, each derived, each disappearing when the
     underlying job changes. */
  function build() {
    var S = global.SFStore, C = global.SFConversions;
    if (!S || !C) return null;

    var live = C.liveScores();

    var cold = [], due = [], atRisk = [];

    live.stalling.forEach(function (r) {
      if (isSnoozed(r.id)) return;
      var j = S.get(r.id) || {};

      /* A quote nobody replied to is the classic cold lead. */
      if (r.stage === 'Quote' || r.stage === 'New Inquiry') {
        cold.push(r);
      } else if (r.stage === 'Approval') {
        due.push(r);
      } else {
        atRisk.push(r);
      }
    });

    /* Highest-value silence first — that is where a call pays. */
    var byValue = function (a, b) { return b.value - a.value; };
    cold.sort(byValue); due.sort(byValue); atRisk.sort(byValue);

    /* ── Outreach, moved here from Smart Queue ──────────────────────
       Smart Queue is a work order for today; chasing a quote that went
       quiet is a follow-up. Both lists used to live on the pipeline, which
       meant two tools answered overlapping questions. Nudge owns every
       outreach list now.

       dormant() = cold and lost leads. Distinguished below because the
       conversation is genuinely different: a cold lead may still buy, a
       lost one needs a reason to reopen. */
    var dormantAll = (C.dormant ? C.dormant() : []).filter(function (d) {
      return !isSnoozed(d.id);
    });
    var coldLeads = dormantAll.filter(function (d) { return !d.lost; });
    var lostLeads = dormantAll.filter(function (d) { return d.lost; });

    /* Won work old enough to revisit — the cheapest job to win, because
       there is no trust to build. */
    var rep = C.repeatCandidates ? C.repeatCandidates()
                                 : { rows: [], repeatWins: 0, repeatValue: 0 };
    var repeats = rep.rows.filter(function (r) { return !isSnoozed(r.id); });

    return {
      cold: cold,
      due: due,
      atRisk: atRisk,
      total: cold.length + due.length + atRisk.length,
      /* Money sitting in silent jobs — the reason to pick up the phone. */
      silentValue: cold.concat(due, atRisk)
        .reduce(function (t, r) { return t + (r.value || 0); }, 0),

      /* Outreach buckets */
      coldLeads: coldLeads,
      lostLeads: lostLeads,
      repeats: repeats,
      repeatMeta: rep,
      dormantValue: dormantAll.reduce(function (t, d) { return t + (d.value || 0); }, 0),
      repeatValue: repeats.reduce(function (t, r) { return t + (r.value || 0); }, 0),
      /* Every actionable row across the whole tool, so the header can state
         one honest total instead of each section counting separately. */
      actionable: cold.length + due.length + atRisk.length
        + coldLeads.length + lostLeads.length + repeats.length
    };
  }

  global.SFNudge = {
    build: build,
    snooze: snooze,
    isSnoozed: isSnoozed,
    initials: initials,
    tint: tint,
    SNOOZE_KEY: SNOOZE_KEY
  };
})(window);

/* ═══════════════════════════════════════════════════════════════════════
   Renderer — draws into #sf-nudge-computed.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  function money(n) { return '$' + Number(n || 0).toLocaleString('en-US'); }

  function card(r, kind) {
    var N = global.SFNudge;
    var why;
    if (kind === 'cold') {
      why = 'Quote sent ' + r.inStage + ' days ago, still sitting in ' + r.stage
          + '. Your usual pace here is ' + r.norm + ' days. A short "any questions?" '
          + 'text costs five minutes against ' + money(r.value) + ' still open.';
    } else if (kind === 'due') {
      why = 'Waiting on approval for ' + r.inStage + ' days (usually ' + r.norm
          + '). Nothing moves until they sign — worth a nudge.';
    } else {
      why = r.inStage + ' days in ' + r.stage + ', ' + r.overdueBy
          + ' longer than your usual ' + r.norm + '. ' + money(r.value) + ' held up.';
    }

    return '<div class="nudge-card" data-nudge-id="' + esc(r.id) + '">'
      + '<div class="nudge-top">'
      +   '<div class="nudge-avatar" style="background:' + N.tint(r.client || r.name) + ';">'
      +     esc(N.initials(r.client || r.name)) + '</div>'
      +   '<div class="nudge-info">'
      +     '<div class="nudge-name">' + esc(r.client || r.name) + '</div>'
      +     '<div class="nudge-company">' + (kind === 'cold' ? '❄️ ' : '⏰ ')
      +       r.inStage + ' days silent · ' + money(r.value) + ' ' + esc(r.stage.toLowerCase())
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="nudge-reason" style="color:rgba(255,255,255,0.58);">' + why + '</div>'
      + '<div class="nudge-actions">'
      +   '<button class="nudge-btn" data-act="contact">💬 Quick Text</button>'
      +   '<button class="nudge-btn ghost" data-act="snooze">Snooze 7d</button>'
      + '</div>'
      + '</div>';
  }

  /* ── Outreach cards ───────────────────────────────────────────────
     Same shape as a nudge card, but the subject is a job that is not moving
     through the pipeline at all: a cold lead, a lost bid, or a delivered job
     worth revisiting. Each carries a suggested opening line, because "call
     them" is advice and a sentence he can actually send is a tool.

     Every figure is derived: days silent from the job's stage entry date,
     months since won from its `won` date, value from the record. */
  function outreachCard(d, kind) {
    var N = global.SFNudge;
    var who = d.client || d.name;
    var why, msg, cta, ageLabel;

    if (kind === 'cold') {
      ageLabel = (d.silentDays == null ? '?' : d.silentDays) + 'd silent';
      why = 'Quoted ' + money(d.value) + ' and it went quiet '
          + (d.silentDays == null ? '' : d.silentDays + ' days ago')
          + '. Nothing has been lost yet — most shops simply stop asking.';
      msg = 'Hi ' + who + ', following up on the ' + esc(d.name)
          + ' quote. Happy to adjust the scope if the timing or budget moved.';
      cta = '📬 Send follow-up';
    } else if (kind === 'lost') {
      ageLabel = '✕ Lost';
      why = money(d.value) + ' that went elsewhere. Worth one no-pressure '
          + 'check-in: the winning bid sometimes disappoints, and you are the '
          + 'shop they already met.';
      msg = 'Hi ' + who + ', no hard feelings on ' + esc(d.name)
          + '. If anything changes or you need work on another site, I am here.';
      cta = '🔄 Re-engage';
    } else {
      ageLabel = d.monthsSince + 'mo ago';
      why = 'Delivered ' + money(d.value) + ' of work ' + d.monthsSince
          + ' months ago'
          + (d.wasRepeat ? ' — and this customer has already come back to you once'
                         : '')
          + '. They know your crew and your pricing, so there is no bidding war.';
      msg = 'Hi ' + who + ', we installed your ' + esc(d.name)
          + ' about ' + d.monthsSince + ' months ago. Anything else coming up '
          + 'this year — another location, refresh, or lighting?';
      cta = '📞 Reach out';
    }

    return '<div class="nudge-card" data-nudge-id="' + esc(d.id) + '">'
      + '<div class="nudge-top">'
      +   '<div class="nudge-avatar" style="background:' + N.tint(who) + ';">'
      +     esc(N.initials(who)) + '</div>'
      +   '<div class="nudge-info">'
      +     '<div class="nudge-name">' + esc(who) + '</div>'
      +     '<div class="nudge-company">' + esc(ageLabel) + ' · ' + money(d.value)
      +       (d.wasRepeat ? ' · <span style="color:rgba(129,199,132,0.95);">repeat customer</span>' : '')
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="nudge-reason" style="color:rgba(255,255,255,0.58);">' + why + '</div>'
      + '<div style="background:rgba(255,255,255,0.04);border-left:2px solid rgba(255,255,255,0.18);'
      +   'border-radius:5px;padding:7px 9px;margin:8px 0 9px;font-size:11px;'
      +   'line-height:1.5;color:rgba(255,255,255,0.66);font-style:italic;">'
      +   '“' + msg + '”</div>'
      + '<div class="nudge-actions">'
      +   '<button class="nudge-btn" data-act="contact">' + cta + '</button>'
      +   '<button class="nudge-btn ghost" data-act="copy" data-msg="'
      +     esc(msg) + '">Copy</button>'
      +   '<button class="nudge-btn ghost" data-act="snooze">Snooze</button>'
      + '</div>'
      + '</div>';
  }

  function outreachSection(colour, title, blurb, rows, kind) {
    if (!rows.length) return '';
    return '<div style="background:rgba(' + colour + ',0.08);border:1px solid rgba('
      + colour + ',0.2);border-radius:10px;padding:10px 12px;margin-bottom:10px;">'
      + '<div style="font-size:11px;font-weight:800;color:rgb(' + colour
      + ');margin-bottom:6px;letter-spacing:0.3px;">' + title + '</div>'
      + '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:10px;">'
      + blurb + '</div>'
      + rows.map(function (r) { return outreachCard(r, kind); }).join('')
      + '</div>';
  }

  function section(colour, title, blurb, rows, kind) {
    if (!rows.length) return '';
    return '<div style="background:rgba(' + colour + ',0.08);border:1px solid rgba('
      + colour + ',0.2);border-radius:10px;padding:10px 12px;margin-bottom:10px;">'
      + '<div style="font-size:11px;font-weight:800;color:rgb(' + colour
      + ');margin-bottom:6px;letter-spacing:0.3px;">' + title + '</div>'
      + '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:10px;">'
      + blurb + '</div>'
      + rows.map(function (r) { return card(r, kind); }).join('')
      + '</div>';
  }

  function render() {
    var host = document.getElementById('sf-nudge-computed');
    if (!host) return;

    /* Fail loudly rather than showing an empty, reassuring sidebar. */
    if (!global.SFStore || !global.SFConversions || !global.SFNudge) {
      host.innerHTML = '<div style="font-size:11px;color:#E2A0A0;padding:10px 2px;'
        + 'line-height:1.6;">Smart Nudge could not load its data engine, so it has '
        + 'nothing trustworthy to show.</div>';
      return;
    }

    var n = global.SFNudge.build();
    var html = '';

    html += section('79,195,247', '❄️ COLD QUOTES — CALL TODAY',
      'These quotes went quiet. One text or call now could bring them back.',
      n.cold, 'cold');

    html += section('217,164,65', '⏰ WAITING ON APPROVAL',
      'Signed off and nothing is moving until they reply.', n.due, 'due');

    html += section('194,69,63', '⚠️ HELD UP IN PRODUCTION',
      'Past your usual pace at this stage.', n.atRisk, 'risk');

    /* ── Outreach, now owned by this tool ── */
    html += outreachSection('79,195,247', '❄️ COLD LEADS — QUOTE WENT QUIET',
      'Quoted, then silence. Still winnable; most shops just stop asking.',
      n.coldLeads, 'cold');

    html += outreachSection('158,158,158', '✕ LOST — WORTH ONE CHECK-IN',
      'Went elsewhere. A no-pressure note keeps you first in line next time.',
      n.lostLeads, 'lost');

    /* Repeat business gets its own framing: this is the only section where
       the evidence is his own win history, so it is stated. */
    if (n.repeats.length) {
      var rm = n.repeatMeta || {};
      var proof = rm.repeatWins
        ? rm.repeatWins + ' of your ' + rm.closedTotal + ' closed jobs came from '
          + 'repeat customers (' + money(rm.repeatValue) + '). It works for you.'
        : 'Your archive has no repeat wins yet, so treat this as a first test '
          + 'rather than a proven channel.';
      html += outreachSection('129,199,132',
        '🔁 PAST CUSTOMERS — READY FOR A SECOND JOB',
        'Delivered over ' + (rm.coolOff || 90) + ' days ago. ' + proof,
        n.repeats, 'repeat');
    }

    if (!n.actionable) {
      html = '<div style="font-size:11.5px;color:rgba(255,255,255,0.45);'
           + 'padding:12px 2px;line-height:1.6;">✓ Nothing to chase. '
           + 'Every open job is moving at your usual pace, and there is no '
           + 'dormant or revisitable work.</div>';
    } else {
      /* One honest headline across every bucket. Silent-job money and
         dormant/repeat money are different pots, so they are named
         separately rather than summed into a single flattering figure. */
      var bits = [];
      if (n.total) bits.push(money(n.silentValue) + ' in ' + n.total + ' silent job'
        + (n.total > 1 ? 's' : ''));
      if (n.coldLeads.length + n.lostLeads.length) {
        bits.push(money(n.dormantValue) + ' dormant');
      }
      if (n.repeats.length) {
        bits.push(money(n.repeatValue) + ' in past customers to revisit');
      }
      html = '<div style="font-size:10.5px;color:rgba(255,255,255,0.42);'
           + 'padding:2px 0 10px;line-height:1.5;">' + bits.join(' · ')
           + '.</div>' + html;
    }

    host.innerHTML = html;
    wire();
  }

  /* Clipboard fallback for non-secure contexts / older Safari. */
  function fallback(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) {
      if (global.toast) global.toast('Could not copy — select the text manually', '⚠');
    }
  }

  function wire() {
    document.querySelectorAll('#sf-nudge-computed .nudge-btn').forEach(function (btn) {
      if (btn.getAttribute('data-bound')) return;
      btn.setAttribute('data-bound', '1');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var host = btn.closest('.nudge-card');
        var id = host && host.getAttribute('data-nudge-id');
        var who = host ? (host.querySelector('.nudge-name') || {}).textContent : '';
        var act = btn.getAttribute('data-act');

        if (act === 'snooze') {
          /* Dismissing now actually persists — it used to be a toast. */
          global.SFNudge.snooze(id, 7);
          render();
          if (global.toast) global.toast('Snoozed ' + who + ' for 7 days', '⏰');
        } else if (act === 'copy') {
          /* The one genuinely useful action here: put the suggested line on
             the clipboard so it can be pasted into whatever he actually
             sends from. Falls back to a textarea+execCommand because
             navigator.clipboard needs a secure context and permission. */
          var msg = btn.getAttribute('data-msg') || '';
          var done = function () {
            if (global.toast) global.toast('Message copied — paste into your texts', '📋');
          };
          if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(msg).then(done, function () { fallback(msg, done); });
          } else { fallback(msg, done); }
        } else {
          if (global.toast) global.toast('Contact queued for ' + who + ' ✓', '📬');
        }
      });
    });
  }

  global.SFNudgeRender = render;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(render, 60); });
  } else {
    setTimeout(render, 60);
  }
})(window);
