/*! SignFlow — Copyright (c) 2026 Jordan Garcia. All rights reserved.
 *  Proprietary and confidential. Public visibility of this file is for
 *  demonstration hosting only and grants no rights. See LICENSE.
 */
/* ══════════════════════════════════════════════════════════════════
   SignFlow v3 Engine — activity log, actionable Smart Queue,
   notifications+digest, resource availability, impact metrics.
   Attaches window.SFLog + window.SFImpact. DOM-driven. All guarded.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function T(msg, icon){ try { if (window.toast) toast(msg, icon||''); } catch(e){} }
  function esc(s){ s=(s==null?'':String(s)); return s.replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function slug(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48); }
  function txt(el, sel){ var n=el&&el.querySelector(sel); return n?(n.textContent||'').trim():''; }
  function relTime(ts){
    var d=Math.floor((Date.now()-ts)/1000);
    if(d<60) return 'just now';
    if(d<3600) return Math.floor(d/60)+'m ago';
    if(d<86400) return Math.floor(d/3600)+'h ago';
    var days=Math.floor(d/86400);
    if(days<7) return days+'d ago';
    var dt=new Date(ts), M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return M[dt.getMonth()]+' '+dt.getDate();
  }

  /* ── F1: Activity log ─────────────────────────────────────────── */
  var LOG_KEY='sf_activity_v1';
  var store={};
  try { store=JSON.parse(localStorage.getItem(LOG_KEY)||'{}'); } catch(e){ store={}; }
  function persist(){ try { localStorage.setItem(LOG_KEY, JSON.stringify(store)); } catch(e){} }

  var SFLog={
    jobId:function(card){
      var name=txt(card,'.card-name')||'';
      var id=slug(name);
      if(!id){ var cards=[].slice.call(document.querySelectorAll('.card')); id='job-'+cards.indexOf(card); }
      return id;
    },
    get:function(card){
      var id=this.jobId(card);
      if(!store[id]){
        var when=txt(card,'.card-notified')||'';
        store[id]=[{type:'stage', text:'Job created', ts:Date.now()-86400000*2, actor:'Peter G.', seed:true}];
        persist();
      }
      return store[id];
    },
    add:function(card, type, text){
      var id=this.jobId(card);
      if(!store[id]) this.get(card);
      store[id].push({type:type, text:text, ts:Date.now(), actor:'Peter G.'});
      persist();
      return store[id];
    },
    renderFeed:function(card){
      var feed=document.getElementById('dp-feed'); if(!feed) return;
      var items=this.get(card).slice().sort(function(a,b){ return b.ts-a.ts; });
      feed.innerHTML=items.map(function(it){
        var cls=(['stage','note','action','impact'].indexOf(it.type)>=0)?it.type:'';
        return '<div class="dp-fitem"><div class="dp-fdot '+cls+'"></div>'
          +'<div class="dp-ftext">'+esc(it.text)
          +'<div class="dp-fmeta">'+esc(relTime(it.ts))+' · '+esc(it.actor||'Peter G.')+'</div>'
          +'</div></div>';
      }).join('') || '<div style="font-size:11px;color:rgba(255,255,255,0.3);">No activity yet</div>';
    }
  };
  window.SFLog=SFLog;

  /* ── helpers to find cards by fuzzy name ──────────────────────── */
  function allCards(){ return [].slice.call(document.querySelectorAll('.board .card, .col .card')); }
  function findCard(name){
    name=(name||'').toLowerCase().trim(); if(!name) return null;
    var cards=allCards(), i, cn;
    for(i=0;i<cards.length;i++){ cn=txt(cards[i],'.card-name').toLowerCase(); if(cn&&(cn.indexOf(name)>=0||name.indexOf(cn)>=0)) return cards[i]; }
    var first=name.split(/\s+/)[0];
    for(i=0;i<cards.length;i++){ cn=txt(cards[i],'.card-name').toLowerCase(); if(cn&&first&&cn.indexOf(first)>=0) return cards[i]; }
    return null;
  }
  function stageOf(card){ var col=card&&card.closest('.col'); return col?txt(col,'.col-title'):''; }
  var STAGE_ORDER=['New Inquiry','Quote','Design','Approval','Fabrication','Install','Complete'];
  function advanceCard(card){
    var st=stageOf(card), idx=STAGE_ORDER.indexOf(st);
    if(idx<0||idx>=STAGE_ORDER.length-1) return null;
    var next=STAGE_ORDER[idx+1];
    var cols=[].slice.call(document.querySelectorAll('.col'));
    var target=cols.filter(function(c){ return txt(c,'.col-title')===next; })[0];
    var list=target&&(target.querySelector('.col-list')||target);
    if(list){ list.appendChild(card); try{updateColBadges();}catch(e){} try{updateJobCount();}catch(e){} return next; }
    return null;
  }

  /* ── F2: Actionable Smart Queue ───────────────────────────────── */
  function actionFor(card){
    if(!card) return {label:'Start now', kind:'start'};
    if(card.classList.contains('cold')) return {label:'Follow up', kind:'revive'};
    var st=stageOf(card);
    if(st==='Quote') return {label:'Send quote today', kind:'quote'};
    if(st==='Approval') return {label:'Chase approval', kind:'chase'};
    if(st==='New Inquiry') return {label:'Start now', kind:'start'};
    return {label:'Advance →', kind:'advance'};
  }
  function markQueueDone(item){
    item.style.opacity='0.5';
    if(!item.querySelector('.qi-done-chip')){
      var chip=document.createElement('span');
      chip.className='qi-done-chip';
      chip.textContent='✓ Done';
      chip.style.cssText='display:inline-block;margin-top:6px;font-size:10px;font-weight:700;color:#5FA97A;background:rgba(95,169,122,0.12);border:1px solid rgba(95,169,122,0.3);border-radius:6px;padding:2px 8px;';
      var row=item.querySelector('.sfq-actions')||item; row.appendChild(chip);
    }
  }
  /* The queue is now rendered from data (signflow-queue.js). Whenever it
     redraws, the action buttons and Why? toggles must be re-attached to
     the new nodes — otherwise the buttons silently stop working. */
  window.SFQueueRefresh = function(){
    try { initSmartQueue(); } catch(e){}
    try { initWhyToggles(); } catch(e){}
  };

  function initSmartQueue(){
    var items=[].slice.call(document.querySelectorAll('.ai-sidebar .queue-item'));
    items.forEach(function(item){
      if(item.querySelector('.sfq-actions')) return;
      var nameEl=item.querySelector('.qi-name'); if(!nameEl) return;
      var name=(nameEl.textContent||'').trim();
      var card=findCard(name);
      var act=actionFor(card);
      var wrap=document.createElement('div');
      wrap.className='sfq-actions';
      wrap.style.cssText='display:flex;gap:6px;margin:2px 11px 11px;';
      var btn=document.createElement('button');
      btn.className='sfq-btn';
      btn.textContent=act.label;
      btn.style.cssText='flex:1;background:rgba(194,69,63,0.95);border:none;color:#fff;font-weight:700;font-size:12px;padding:9px 12px;border-radius:8px;cursor:pointer;font-family:inherit;';
      btn.onmouseover=function(){ btn.style.background='#C2453F'; };
      btn.onmouseout=function(){ btn.style.background='rgba(194,69,63,0.9)'; };
      btn.onclick=function(e){
        e.stopPropagation();
        var c=findCard(name);
        if(!c){ T('Logged: '+act.label+' — '+name,'✓'); markQueueDone(item); return; }
        if(act.kind==='revive'){
          c.classList.remove('cold'); c.classList.add('high'); c.setAttribute('data-revived','1');
          SFLog.add(c,'impact','❄️ Revived from cold — followed up'); T('Revived '+name+' ✓','❄️');
        } else if(act.kind==='quote'){
          SFLog.add(c,'action','Quote sent to client'); T('Quote sent for '+name+' ✓','📄');
        } else if(act.kind==='chase'){
          SFLog.add(c,'action','Chased approval'); T('Chasing approval on '+name,'⏳');
        } else {
          var nx=advanceCard(c);
          if(nx){ SFLog.add(c,'stage','Stage → '+nx); if(c.classList.contains('urgent')){ c.setAttribute('data-early','1'); SFLog.add(c,'impact','⏱️ Started ahead of schedule'); } T('Advanced '+name+' → '+nx+' ✓','→'); }
          else { SFLog.add(c,'action','Marked started'); T('Started '+name,'▶'); }
        }
        markQueueDone(item);
        SFImpact.refresh();
      };
      wrap.appendChild(btn);
      /* single clean row: action on the RIGHT of the item's main row (pushed right by CSS margin-left:auto) */
      var row=item.querySelector('.qi-row');
      if(row){ row.appendChild(wrap); }
      else item.appendChild(wrap);
    });
  }

  /* ── F4: Resource availability ────────────────────────────────── */
  var RES_KEY='sf_resources_v1';
  var CREW=['Mike Reyes','Dave Kowalski','Sarah Mitchell','Install Crew A'];
  var CREW_ROLE={'Mike Reyes':'Lead Installer','Dave Kowalski':'Electrician / Installer','Sarah Mitchell':'Project Manager','Install Crew A':'Install Team'};
  var VENDORS=['Midwest Steel Fab','Precision Wide-Format','Joliet Permits Office'];
  /* Week shape comes from SFStore (single source of truth); these fallbacks
     only apply if the store failed to load. */
  function DAYS_(){ return (window.SFStore&&SFStore.DAYS)||['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; }
  function dayLabel(d){ return ((window.SFStore&&SFStore.DAY_LABEL)||{})[d]||d[0]; }
  function isWknd(d){ return window.SFStore&&SFStore.isWeekend?SFStore.isWeekend(d):(d==='Sat'||d==='Sun'); }
  function availDefault(d){ return window.SFStore&&SFStore.defaultAvail?SFStore.defaultAvail(d):'free'; }
  var CYCLE=['free','partial','busy'];
  /* Weekends cycle through 'off' too, so a Saturday install can be opened up
     and then closed again. Weekdays never become 'off'. */
  var CYCLE_WKND=['off','free','partial','busy'];
  /* Dot colour is owned by signflow-calm.css via [data-state] !important
     rules — deliberately: "A wall of identical green = zero information.
     Free days go faint; only partial/busy carry colour." Nothing here sets
     colour; 'off' is styled in that stylesheet alongside the other states. */
  var resState={};
  try { resState=JSON.parse(localStorage.getItem(RES_KEY)||'{}'); } catch(e){ resState={}; }
  function resGet(who,day){ return (resState[who]&&resState[who][day])||availDefault(day); }
  function resSet(who,day,val){ if(!resState[who])resState[who]={}; resState[who][day]=val; try{localStorage.setItem(RES_KEY,JSON.stringify(resState));}catch(e){} }
  function crewBusyCount(){ var n=0; CREW.forEach(function(c){ DAYS_().forEach(function(d){ if(resGet(c,d)==='busy')n++; }); }); return n; }

  function resRow(who, role){
    var dots=DAYS_().map(function(d){
      var v=resGet(who,d);
      return '<span class="sf-res-dot'+(isWknd(d)?' sf-res-wknd':'')+'" data-who="'+esc(who)+'" data-day="'+d+'" data-state="'+v+'" title="'+d+': '+v+'" '
        +'style="width:15px;height:15px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:8px;font-weight:700;">'+dayLabel(d)+'</span>';
    }).join('');
    return '<div class="sf-res-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05);">'
      +'<div style="min-width:0;"><div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(who)+'</div>'
      +(role?'<div style="font-size:10px;color:rgba(255,255,255,0.4);">'+esc(role)+'</div>':'')+'</div>'
      +'<div style="display:flex;gap:4px;flex-shrink:0;">'+dots+'</div></div>';
  }
  function initResources(){
    var sidebar=document.querySelector('.ai-sidebar'); if(!sidebar||document.getElementById('sf-resources')) return;
    var box=document.createElement('div');
    box.id='sf-resources';
    box.style.cssText='background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;margin-bottom:12px;';
    box.innerHTML=
      '<div id="sf-res-head" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">'
      +'<div style="font-size:11px;font-weight:700;letter-spacing:0.4px;color:rgba(255,255,255,0.7);">👷 CREW & VENDOR AVAILABILITY</div>'
      +'<span id="sf-res-caret" style="font-size:11px;color:rgba(255,255,255,0.4);">▾</span></div>'
      +'<div id="sf-res-body" style="margin-top:10px;">'
      +'<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:rgba(255,255,255,0.32);font-weight:700;margin:2px 0 4px;">Crew</div>'
      +CREW.map(function(c){ return resRow(c, CREW_ROLE[c]); }).join('')
      +'<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.6px;color:rgba(255,255,255,0.32);font-weight:700;margin:10px 0 4px;">Vendors</div>'
      +VENDORS.map(function(v){ return resRow(v, ''); }).join('')
      +'<div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:9px;line-height:1.5;">Click a day to cycle <span style="color:rgba(255,255,255,0.55);">free</span> → <span style="color:rgba(240,200,120,0.95);">partial</span> → <span style="color:rgba(255,150,140,0.95);">busy</span>. Sa/Su start as <span style="color:rgba(255,255,255,0.45);">off</span> (not a working day) and add no capacity until you click them. Feeds Smart Queue.</div>'
      +'</div>';
    sidebar.insertBefore(box, sidebar.firstChild);

    document.getElementById('sf-res-head').onclick=function(){
      var b=document.getElementById('sf-res-body'), c=document.getElementById('sf-res-caret');
      var hidden=b.style.display==='none'; b.style.display=hidden?'block':'none'; c.textContent=hidden?'▾':'▸';
    };
    box.addEventListener('click', function(e){
      var dot=e.target.closest('.sf-res-dot'); if(!dot) return;
      var who=dot.getAttribute('data-who'), day=dot.getAttribute('data-day');
      var cyc=isWknd(day)?CYCLE_WKND:CYCLE;
      var cur=resGet(who,day);
      var i=cyc.indexOf(cur);
      var nv=cyc[(i<0?0:i+1)%cyc.length];
      resSet(who,day,nv); dot.setAttribute('data-state',nv); dot.title=day+': '+nv;
      reRankQueue();
      T(who+' · '+day+': '+nv,'👷');
    });
  }
  function reRankQueue(){
    var busy=crewBusyCount();
    var items=[].slice.call(document.querySelectorAll('.ai-sidebar .queue-item'));
    items.forEach(function(item){
      var note=item.querySelector('.sfq-crew-note');
      if(busy>=3){
        if(!note){
          note=document.createElement('div'); note.className='sfq-crew-note';
          note.textContent='⚠ crew tight this week';
          note.style.cssText='font-size:10px;color:#D9A441;margin-top:5px;font-weight:600;';
          (item.querySelector('.sfq-actions')||item).appendChild(note);
        }
      } else if(note){ note.remove(); }
    });
  }

  /* ── F5: Impact metrics ───────────────────────────────────────── */
  function money(n){ return '$'+n.toLocaleString('en-US'); }
  function parseVal(card){ var v=txt(card,'.card-value'); var n=parseInt(v.replace(/[^0-9]/g,''),10); return isNaN(n)?0:n; }
  var SFImpact={
    refresh:function(){
      var revived=0;
      allCards().forEach(function(c){
        if(c.getAttribute('data-revived')) revived++;
      });
      set('sfimp-revived', String(revived));
      /* Closed value and parallel capacity are rendered by the page from
         SFStore/SFQueue — see updateStatsBar() in index.html. Duplicating
         them here from DOM scraping is what produced two "Closed This
         Month" figures that disagreed. */
      if (window.SFStatsRefresh) { try { window.SFStatsRefresh(); } catch(e){} }
    }
  };
  window.SFImpact=SFImpact;
  function set(id,val){ var el=document.getElementById(id); if(el) el.textContent=val; }

  function initImpact(){
    var bar=document.querySelector('.stats-bar'); if(!bar||document.getElementById('sfimp-closed')) return;
    function stat(id,label,cls,filter){
      var sep=document.createElement('div'); sep.className='stat-sep'; bar.appendChild(sep);
      var s=document.createElement('div'); s.className='stat'; s.style.cursor='pointer';
      s.innerHTML='<div class="stat-val '+(cls||'')+'" id="'+id+'">–</div><div class="stat-label">'+label+'</div>';
      s.onclick=filter; bar.appendChild(s);
    }
    /* "Closed This Month" and "⚡ Parallel Executed" are gone from here.
       Both duplicated a stat the page already renders — the bar showed
       "Closed This Month" twice with two different numbers ($106,900 and
       $34,100), and two parallel figures from two different definitions.
       One question, one number, one owner: the page owns those two now.

       "Est. Days Saved" is gone outright. It was seeded at a constant 2.3
       and grew by 0.4 per click — arithmetic over UI events, not over any
       work Peter did. It failed the standing rule that a number shown to
       the user must be computed from data the user can edit. */
    stat('sfimp-revived','Revived from Cold','', function(){ highlight(function(c){return c.getAttribute('data-revived');},'revived jobs'); });
    SFImpact.refresh();
  }
  function highlight(pred, label){
    var cards=allCards(), n=0;
    cards.forEach(function(c){
      var hit=false; try{ hit=pred(c); }catch(e){}
      c.style.transition='opacity .2s,box-shadow .2s';
      if(hit){ c.style.opacity='1'; c.style.boxShadow='0 0 0 2px rgba(194,69,63,0.6)'; n++; }
      else { c.style.opacity='0.28'; c.style.boxShadow='none'; }
    });
    T('Showing '+n+' '+label+' — click board to clear','🔎');
    var clear=function(){ cards.forEach(function(c){ c.style.opacity=''; c.style.boxShadow=''; }); document.removeEventListener('click',clear,true); };
    setTimeout(function(){ document.addEventListener('click',clear,true); },50);
  }

  /* ── F3: Notifications + digest ───────────────────────────────── */
  function urgentCount(){ return document.querySelectorAll('.card.urgent, .card.overdue').length; }
  function coldCount(){ return document.querySelectorAll('.card.cold').length; }
  /* Parallel capacity from the crew grid, or null when the engine is
     unavailable — the digest then omits the line rather than asserting a
     number nothing computed. Replaces a hardcoded "4 jobs can run
     together (~2.3 days saved)" that never once changed. */
  function parallelNow(){
    try {
      if (window.SFQueue && window.SFQueue.build) {
        var q = window.SFQueue.build();
        if (q && typeof q.parallelNow === 'number') return q;
      }
    } catch (e) {}
    return null;
  }
  function buildDigestText(){
    var urg=[].slice.call(document.querySelectorAll('.card.urgent, .card.overdue')).map(function(c){return txt(c,'.card-name');}).filter(Boolean);
    var cold=[].slice.call(document.querySelectorAll('.card.cold')).map(function(c){return txt(c,'.card-name');}).filter(Boolean);
    var q=parallelNow();
    var L=[];
    L.push('SignFlow — Daily Digest');
    L.push('');
    L.push('🔴 Urgent / overdue ('+urg.length+'): '+(urg.slice(0,6).join(', ')||'none'));
    if (q) {
      L.push('⚡ '+q.parallelNow+' job'+(q.parallelNow===1?'':'s')+' can run at once ('
        +q.maxFreeCrew+' of '+window.SFQueue.CREW.length+' crew free)');
      if (q.live && q.live.late.length)
        L.push('🚨 Past install date ('+q.live.late.length+'): '
          +q.live.late.slice(0,4).map(function(r){return r.name;}).join(', '));
    }
    L.push('❄️ Cold quotes to revive ('+cold.length+'): '+(cold.slice(0,6).join(', ')||'none'));
    return L.join('\n');
  }
  function initNotifications(){
    var right=document.querySelector('.header-right'); if(!right||document.getElementById('sf-bell')) return;
    var bell=document.createElement('button');
    bell.id='sf-bell';
    bell.style.cssText='position:relative;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:9px;width:34px;height:34px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;color:#fff;';
    bell.innerHTML='🔔';
    var count=urgentCount()+coldCount();
    var badge=document.createElement('span');
    badge.id='sf-bell-badge';
    badge.textContent=count;
    badge.style.cssText='position:absolute;top:-5px;right:-5px;background:#C2453F;color:#fff;font-size:10px;font-weight:700;min-width:17px;height:17px;border-radius:9px;display:'+(count?'flex':'none')+';align-items:center;justify-content:center;padding:0 4px;';
    bell.appendChild(badge);
    var newBtn=right.querySelector('.btn-new');
    if(newBtn) right.insertBefore(bell, newBtn); else right.appendChild(bell);

    var panel=document.createElement('div');
    panel.id='sf-notif-panel';
    panel.style.cssText='position:fixed;top:56px;right:16px;width:320px;max-width:92vw;background:rgba(20,20,30,0.97);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.12);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.6);padding:14px;z-index:6000;display:none;';
    document.body.appendChild(panel);
    function render(){
      var urg=urgentCount(), cold=coldCount(), q=parallelNow();
      panel.innerHTML=
        '<div style="font-size:14px;font-weight:700;margin-bottom:10px;">Notifications</div>'
        +'<div class="sf-notif-item" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);font-size:12px;">🔴 <strong>'+urg+'</strong> urgent / overdue jobs</div>'
        +(q?'<div class="sf-notif-item" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);font-size:12px;">⚡ <strong>'+q.parallelNow+'</strong> job'+(q.parallelNow===1?'':'s')+' can run at once · '+q.maxFreeCrew+' of '+window.SFQueue.CREW.length+' crew free</div>':'')
        +'<div class="sf-notif-item" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);font-size:12px;">❄️ <strong>'+cold+'</strong> cold quotes to revive</div>'
        +'<div class="sf-notif-item" style="padding:8px 0;font-size:12px;">📅 Daily digest scheduled 7:00 AM → Discord</div>'
        +'<div style="display:flex;gap:7px;margin-top:12px;">'
        +'<button id="sf-digest-copy" style="flex:1;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;font-weight:600;font-size:11px;padding:8px;border-radius:8px;cursor:pointer;">Copy digest text</button>'
        +'<button id="sf-digest-send" style="flex:1;background:rgba(194,69,63,0.9);border:none;color:#fff;font-weight:600;font-size:11px;padding:8px;border-radius:8px;cursor:pointer;">Send to Discord now</button>'
        +'</div>';
      document.getElementById('sf-digest-copy').onclick=function(){
        var t=buildDigestText();
        try{ navigator.clipboard.writeText(t); T('Digest copied to clipboard ✓','📋'); }
        catch(e){ T('Copy not available in this browser','📋'); }
      };
      document.getElementById('sf-digest-send').onclick=function(){ T('Digest queued for Discord ✓ (7am cron handles daily send)','📨'); };
    }
    bell.onclick=function(e){ e.stopPropagation(); var open=panel.style.display==='block'; if(!open) render(); panel.style.display=open?'none':'block'; };
    document.addEventListener('click',function(e){ if(panel.style.display==='block' && !panel.contains(e.target) && e.target!==bell && !bell.contains(e.target)) panel.style.display='none'; });
  }
  window.SFRefreshBell=function(){
    var b=document.getElementById('sf-bell-badge'); if(!b) return;
    var c=urgentCount()+coldCount(); b.textContent=c; b.style.display=c?'flex':'none';
  };

  /* ── boot ─────────────────────────────────────────────────────── */
  function initDensity(){
    var t=document.getElementById('sf-density-toggle'); if(!t) return;
    var label=t.querySelector('.sfd-label');
    function sync(){
      var compact=document.documentElement.classList.contains('density-compact');
      t.setAttribute('aria-pressed', compact?'true':'false');
      if(label) label.textContent = compact?'Compact':'Expanded';
    }
    sync();
    t.addEventListener('click', function(){
      var compact=document.documentElement.classList.toggle('density-compact');
      try{ localStorage.setItem('sf_density', compact?'compact':'expanded'); }catch(e){}
      sync();
    });
  }

  /* Collapse/expand the Smart Queue so the board can use the full width */
  function initQueueToggle(){
    var wrap=document.querySelector('.board-wrap'); if(!wrap) return;
    if(document.getElementById('sf-queue-toggle')) return;
    var b=document.createElement('button');
    b.id='sf-queue-toggle'; b.type='button';
    function sync(){
      var col=document.documentElement.classList.contains('queue-collapsed');
      b.textContent = col ? '\u2039' : '\u203A';
      b.title = col ? 'Show Smart Queue' : 'Hide Smart Queue (full-width board)';
      b.setAttribute('aria-label', b.title);
    }
    try{ if(localStorage.getItem('sf_queue')==='collapsed') document.documentElement.classList.add('queue-collapsed'); }catch(e){}
    sync();
    b.addEventListener('click', function(){
      var col=document.documentElement.classList.toggle('queue-collapsed');
      try{ localStorage.setItem('sf_queue', col?'collapsed':'open'); }catch(e){}
      sync();
    });
    wrap.appendChild(b);
  }

  /* Fill the leftover run at the bottom of sparse columns with a quiet
     "+ Add job" slot, so the space reads as intentional rather than empty.
     Cards stay content-sized (stretching them looked hollow). */
  function initColumnSlots(){
    var cols=document.querySelectorAll('.board .col');
    Array.prototype.forEach.call(cols, function(col){
      if(col.querySelector('.sf-slot')) return;
      var b=document.createElement('button');
      b.type='button'; b.className='sf-slot';
      b.textContent='+ Add job';
      b.title='Add a job to this stage';
      b.addEventListener('click', function(){
        var nb=document.querySelector('.btn-new');
        if(nb) nb.click();
        else if(typeof window.toast==='function') window.toast('New job','\uD83D\uDCCB');
      });
      col.appendChild(b);
    });
  }

  function boot(){
    try{ initDensity(); }catch(e){ console.warn('DENS',e); }
    try{ initQueueToggle(); }catch(e){ console.warn('QT',e); }
    try{ initColumnSlots(); }catch(e){ console.warn('SLOT',e); }
    try{ initSmartQueue(); }catch(e){ console.warn('SFQ',e); }
    try{ initResources(); }catch(e){ console.warn('RES',e); }
    try{ initImpact(); }catch(e){ console.warn('IMP',e); }
    try{ initNotifications(); }catch(e){ console.warn('NOTIF',e); }
    try{ reRankQueue(); }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();

/* ── Customers: every recency chip shipped as class "old" (red), so the
   fresh/stale tiers never rendered and red lost all signal value.
   Re-grade from the actual day count: <14d neutral, 14-29d amber, 30d+ red. */
(function(){
  function gradeRecency(){
    var chips=document.querySelectorAll('.cust-days');
    if(!chips.length) return;
    Array.prototype.forEach.call(chips, function(el){
      var m=/(\d+)\s*d/i.exec(el.textContent||'');
      if(!m) return;
      var days=parseInt(m[1],10);
      el.classList.remove('fresh','stale','old');
      el.classList.add(days>=30 ? 'old' : days>=14 ? 'stale' : 'fresh');
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',gradeRecency);
  else gradeRecency();
})();
