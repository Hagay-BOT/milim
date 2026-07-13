'use strict';
/* ===== helpers ===== */
const $ = s => document.querySelector(s);
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');
const esc = s => (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
let toastT;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),1900); }

/* ===== persistence (all local) ===== */
const LS = {
  get(k,d){ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } },
  set(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
};
let assoc   = LS.get('hw_assoc', {});
let stats   = (function(){ const s=LS.get('hw_stats',{}); return {words:s.words||{}, sessions:s.sessions||[]}; })();
let deleted = new Set(LS.get('hw_deleted', []));
let added   = LS.get('hw_added', []); // [[term,meaning],...]
let direction = LS.get('hw_dir', 'm2w'); // m2w = פירוש→מילה, w2m = מילה→פירוש, mixed
const DIRS = [['m2w','פירוש → מילה'],['w2m','מילה → פירוש'],['mixed','מעורב']];
function renderDirSegs(){
  ['#dirSegHome','#dirSegScope'].forEach(sel=>{
    const el=document.querySelector(sel); if(!el) return;
    el.innerHTML=DIRS.map(([d,l])=>`<button data-dir="${d}" class="${direction===d?'active':''}">${l}</button>`).join('');
    el.querySelectorAll('button').forEach(b=>b.onclick=()=>{ direction=b.dataset.dir; LS.set('hw_dir',direction); renderDirSegs(); });
  });
}
const saveAssoc   = () => LS.set('hw_assoc', assoc);
const saveStats   = () => LS.set('hw_stats', stats);
const saveDeleted = () => LS.set('hw_deleted', [...deleted]);
const saveAdded   = () => LS.set('hw_added', added);

/* ===== word bank ===== */
let BANK = [];
const UNIT_IDS = ['1','2','3','4','5','6','7','8','9','10'];
function buildBank(){
  BANK = [];
  const data = window.UNIT_DATA || {};
  for(const uid of Object.keys(data)){
    const byTerm = new Map();  // merge duplicate terms within a unit (same word, several senses)
    data[uid].forEach(pair=>{
      const term=pair[0], meaning=pair[1];
      if(deleted.has(term)) return;
      if(byTerm.has(term)){
        const w=byTerm.get(term);
        if(meaning && !w.meaning.split('; ').includes(meaning)) w.meaning += '; ' + meaning;
      }else{
        const w={term, meaning, unit:uid, id:uid+':'+term};
        byTerm.set(term, w); BANK.push(w);
      }
    });
  }
  added.forEach((pair,i)=>{
    if(deleted.has(pair[0])) return;
    BANK.push({term:pair[0], meaning:pair[1], unit:'custom', id:'add:'+i});
  });
}

/* ===== stats model ===== */
function rec(term){ return stats.words[term] || (stats.words[term]={seen:0,first:0,ever:0,wrong:0,level:0,last:0}); }
function scopeWords(scope){
  if(scope==='global'||scope==='random') return BANK;
  if(scope.startsWith('unit:')) { const u=scope.slice(5); return BANK.filter(w=>w.unit===u); }
  return BANK;
}
// classification (per the learning model):
//   חדשה  = seen==0 (never practiced)
//   חלשה  = seen>0 && level==0 (practiced but not yet gotten right on a first try)
//   יודע  = level>=1 (got it right first-try at least once, net) — stays only in "תרגל הכל"
// counter (level): +1 per correct-first-try, -1 per wrong; a clean first sight jumps to 3.
//   חדשות = counter 0 (never-seen, or got it wrong and not yet re-learned)
//   חלשות = counter 1-2 (knew it 1-2 times, on the way to mastery)
//   שלמדתי = counter >=3 (mastered / knew it on first sight)
const lvl = term => (stats.words[term]||{}).level || 0;
function classify(scope){
  const seen=new Set(); let strong=0,weak=0,fresh=0;
  for(const w of scopeWords(scope)){
    if(seen.has(w.term)) continue; seen.add(w.term);
    const v=lvl(w.term);
    if(v>=3) strong++; else if(v>=1) weak++; else fresh++;
  }
  return {total:seen.size, strong, weak, fresh};
}
function uniqScope(scope){ const seen=new Set(),out=[]; for(const w of scopeWords(scope)){ if(!seen.has(w.term)){seen.add(w.term);out.push(w);} } return out; }
function newCards(scope){ return uniqScope(scope).filter(w=>lvl(w.term)<1); }
function weakCards(scope){
  const arr=uniqScope(scope).filter(w=>{const v=lvl(w.term);return v>=1&&v<3;});
  arr.sort((a,b)=>((stats.words[a.term]||{}).last||0)-((stats.words[b.term]||{}).last||0));
  return arr;
}
function learnedCards(scope){ return uniqScope(scope).filter(w=>lvl(w.term)>=3); }
function allCards(scope){
  const w=scopeWords(scope).slice();
  shuffle(w);
  if(scope==='global'||scope==='random') return w.slice(0,30);
  return w;
}

/* ===== answer normalization ===== */
const NIQ=/[֑-ׇ]/g;
function norm(s){
  return (s||'').replace(NIQ,'').replace(/[‎‏]/g,'')
    .replace(/["'`׳״.,;:!?()\[\]{}\-–—/|]/g,'').replace(/\s+/g,' ').trim()
    .replace(/ך/g,'כ').replace(/ם/g,'מ').replace(/ן/g,'נ').replace(/ף/g,'פ').replace(/ץ/g,'צ');
}
function isCorrect(input, term){
  const a=norm(input); if(!a) return false;
  if(a===norm(term)) return true;
  // accept any single word of a multi-word term, or slash-alternatives
  const alts=term.split(/[\/|]/).map(x=>norm(x)).filter(Boolean);
  return alts.includes(a);
}

/* ===== screens ===== */
const SCREENS=['home','scope','quiz','results','stats','manage','add'];
function goto(id){ SCREENS.forEach(s=>hide($('#'+s))); show($('#'+id)); window.scrollTo(0,0); }

/* ===== HOME ===== */
function renderHome(){
  const total=BANK.length;
  const uniqTerms=new Set(BANK.map(w=>w.term)).size;
  $('#totalPill').textContent = `${total} מילים · ${uniqTerms} ייחודיות`;
  renderDirSegs();
  const grid=$('#unitGrid'); grid.innerHTML='';
  UNIT_IDS.forEach(uid=>{
    const c=classify('unit:'+uid);
    if(c.total===0) return;
    const pct=n=>c.total?(100*n/c.total):0;
    const el=document.createElement('button');
    el.className='tile';
    el.innerHTML=`<div class="num">${uid}</div><div class="lbl">${c.total} מילים</div>
      <div class="mini"><i class="s" style="width:${pct(c.strong)}%"></i><i class="w" style="width:${pct(c.weak)}%"></i><i class="n" style="width:${pct(c.fresh)}%"></i></div>`;
    el.onclick=()=>openScope('unit:'+uid);
    grid.appendChild(el);
  });
}

/* ===== SCOPE ===== */
let curScope='global';
const scopeTitle = s => s==='global'?'כל המאגר' : s==='random'?'אקראי' : 'יחידה '+s.slice(5);
function openScope(scope){
  curScope=scope;
  $('#scopeBrand').textContent = scope==='global'?'📚':scope==='random'?'🎲':'יחידה '+scope.slice(5);
  $('#scopeTitle').textContent = scopeTitle(scope);
  const c=classify(scope);
  $('#donutTotal').textContent=c.total;
  const done=c.total||1;
  const gs=100*c.strong/done, gw=100*c.weak/done;
  $('#donut').style.background=`conic-gradient(var(--green) 0 ${gs}%, var(--accent) ${gs}% ${gs+gw}%, var(--gold) ${gs+gw}% 100%)`;
  $('#legend').innerHTML=
    `<div><i class="s"></i> שלמדתי <b>${c.strong}</b></div>
     <div><i class="w"></i> לחיזוק <b>${c.weak}</b></div>
     <div><i class="n"></i> חדשות <b>${c.fresh}</b></div>`;
  const nc=newCards(scope).length, wc=weakCards(scope).length, lc=learnedCards(scope).length;
  $('#cntNew').textContent=nc; $('#cntWeak').textContent=wc; $('#cntLearned').textContent=lc;
  $('#pbNew').disabled = nc===0;
  $('#pbWeak').disabled = wc===0;
  $('#pbLearned').disabled = lc===0;
  const allN = (scope==='global'||scope==='random')?Math.min(30,c.total):scopeWords(scope).length;
  $('#cntAll').textContent=allN;
  $('#pbAllSub').textContent = (scope==='global'||scope==='random')?'מדגם אקראי לתרגול מהיר':'כל מילות היחידה בערבוב';
  $('#pbAll').disabled = c.total===0;
  renderDirSegs();
  goto('scope');
}
$('#pbAll').onclick     = ()=> startRound(allCards(curScope), curScope, 'all');
$('#pbWeak').onclick    = ()=> startRound(cap(weakCards(curScope),20), curScope, 'weak');
$('#pbNew').onclick     = ()=> startRound(cap(newCards(curScope),20), curScope, 'new');
$('#pbLearned').onclick = ()=> startRound(cap(learnedCards(curScope),30), curScope, 'learned');
$('#pbStats').onclick   = ()=> openStats(curScope);
function cap(list,n){ if(list.length>n){ toast(`מתרגל ${n} מתוך ${list.length}`); return list.slice(0,n);} return list; }

/* ===== QUIZ ENGINE ===== */
let deck=[], idx=0, correct=0, missed=[], answered=false;
let session=new Map(), sessionScope='global', sessionMode='all', committed=false;

function sess(w){ if(!session.has(w.term)) session.set(w.term,{w,attempts:0,mastered:false,firstTry:false}); return session.get(w.term); }

function startRound(cards, scope, mode){
  if(!cards || cards.length===0){ toast('אין מילים לתרגול כאן'); return; }
  if(!committed && session.size>0) commitSession();
  session=new Map(); committed=false;
  sessionScope=scope; sessionMode=mode;
  deck=shuffle(cards.slice()).map(c=>({...c, _dir: direction==='mixed' ? (Math.random()<0.5?'m2w':'w2m') : direction}));
  idx=0; correct=0; missed=[];
  $('#quizScope').textContent = scopeTitle(scope);
  goto('quiz'); renderCard();
}
function renderCard(){
  answered=false;
  const w=deck[idx];
  $('#progBar').style.width = (100*idx/deck.length)+'%';
  $('#qCount').textContent = `מילה ${idx+1} מתוך ${deck.length}`;
  $('#qLive').textContent = `✓ ${correct}`;
  $('#hintBtn').classList.remove('hidden'); $('#hintBox').classList.add('hidden'); $('#hintBox').textContent='';
  $('#feedback').classList.add('hidden'); $('#feedback').innerHTML='';
  const inp=$('#answerInput');
  inp.classList.remove('hidden'); inp.value=''; inp.disabled=false;
  show($('#answerActions'));
  if(w._dir==='w2m'){
    $('#qKind').textContent='כתוב את הפירוש של המילה';
    $('#qText').textContent=w.term;
    inp.placeholder='הפירוש…';
  }else{
    $('#qKind').textContent='כתוב את המילה לפי הפירוש';
    $('#qText').textContent=w.meaning;
    inp.placeholder='המילה…';
  }
  setTimeout(()=>inp.focus(),30);
}
function meaningMatch(input, meaning){
  const a=norm(input); if(!a) return false;
  if(a===norm(meaning)) return true;
  const segs=meaning.split(/[,;/|()]|\s-\s/).map(norm).filter(Boolean);
  if(segs.includes(a)) return true;
  if(!a.includes(' ') && a.length>=2) return norm(meaning).split(' ').includes(a);
  return false;
}
function check(){ if(answered) return; const w=deck[idx]; const ok = w._dir==='w2m' ? meaningMatch($('#answerInput').value, w.meaning) : isCorrect($('#answerInput').value, w.term); finishCard(ok, false); }
function skip(){ if(answered) return; finishCard(false, true); }
function finishCard(ok, skipped){
  answered=true;
  const w=deck[idx];
  const w2m = w._dir==='w2m';
  $('#answerInput').disabled=true; hide($('#answerActions'));
  $('#hintBtn').classList.add('hidden'); $('#hintBox').classList.add('hidden');
  const e=sess(w); e.attempts++;
  if(ok){ correct++; e.mastered=true; if(e.attempts===1)e.firstTry=true; }
  else { missed.push(w); }
  $('#qLive').textContent=`✓ ${correct}`;
  const fb=$('#feedback');
  const answer = w2m ? w.meaning : w.term;    // the correct answer for this direction
  const label  = w2m ? 'הפירוש' : 'המילה';
  const verdict = ok?'נכון! ✓':(skipped?'התשובה:':'לא מדויק');
  fb.innerHTML =
    `<div class="verdict ${ok?'ok':'no'}">${verdict}</div>`+
    (!ok?`<div class="reveal">${label}: <b>${esc(answer)}</b></div>`:'')+
    (!ok?`<button class="was-right" id="wasRight">בעצם ידעתי — סמן כנכון</button>`:'')+
    `<div class="assoc">
       <label>💡 האסוציאציה שלי ל"${esc(w.term)}"</label>
       <textarea id="assocInput" rows="2" placeholder="קישור/תמונה שיעזרו לזכור…">${esc(assoc[w.term]||'')}</textarea>
       <div class="assoc-bar"><button id="assocSave">שמירה</button><span class="st" id="assocSt"></span></div>
     </div>
     <button class="del-live" id="delLive">🗑 אני מכיר את המילה — מחק מהמאגר</button>
     <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="nextBtn">${idx+1<deck.length?'הבא ←':'לסיכום'}</button></div>`;
  fb.classList.remove('hidden');
  function persist(){ const v=$('#assocInput').value.trim(); if(v)assoc[w.term]=v; else delete assoc[w.term]; saveAssoc(); }
  $('#assocSave').onclick=()=>{ persist(); $('#assocSt').textContent='נשמר ✓'; };
  $('#assocInput').oninput=()=>$('#assocSt').textContent='';
  $('#nextBtn').onclick=()=>{ persist(); next(); };
  const wr=$('#wasRight'); if(wr) wr.onclick=()=>{ correct++; const i=missed.indexOf(w); if(i>=0)missed.splice(i,1); e.mastered=true; e.firstTry=(e.attempts===1); $('#qLive').textContent=`✓ ${correct}`; wr.remove(); document.querySelector('.verdict').textContent='סומן כנכון ✓'; document.querySelector('.verdict').className='verdict ok'; };
  $('#delLive').onclick=()=>{ deleteWord(w.term); toast(`"${w.term}" נמחקה`); deck=deck.filter(c=>c.term!==w.term); missed=missed.filter(c=>c.term!==w.term); session.delete(w.term); if(deck.length===0){ finishRound(); return; } if(idx>=deck.length) idx=deck.length-1; next(true); };
}
function next(stay){
  if(!stay) idx++;
  if(idx>=deck.length) finishRound(); else renderCard();
}
// NOTE: stats are committed when LEAVING the results screen, so per-word corrections apply.
function finishRound(){
  $('#finalOf').textContent=`מתוך ${deck.length}`;
  $('#resScope').textContent='→ '+scopeTitle(sessionScope);
  renderReview();
  goto('results');
}
const verdictOf = term => { const e=session.get(term); return !!(e && e.mastered); };
function refreshResultCounts(){
  correct = deck.filter(w=>verdictOf(w.term)).length;
  missed  = deck.filter(w=>!verdictOf(w.term));
  $('#finalScore').textContent=correct;
  $('#missCount').textContent=missed.length;
  $('#allGood').classList.toggle('hidden', missed.length!==0);
  $('#retryMissedBtn').classList.toggle('hidden', missed.length===0);
}
function renderReview(){
  refreshResultCounts();
  const list=$('#reviewList');
  list.innerHTML=deck.map(w=>{
    const ok=verdictOf(w.term);
    return `<div class="rev-row ${ok?'':'wrong'}" data-t="${esc(w.term)}">
      <div class="rev-w"><b>${esc(w.term)}</b><span>${esc(w.meaning)}</span></div>
      <button class="rev-chip ${ok?'ok':'no'}">${ok?'✓ ידעתי':'✗ לא ידעתי'}</button></div>`;
  }).join('');
  list.querySelectorAll('.rev-chip').forEach(chip=>{
    chip.onclick=()=>{
      const row=chip.closest('.rev-row'); const term=row.dataset.t;
      const e=session.get(term); if(!e) return;
      const nowOk=!e.mastered;
      e.mastered=nowOk; e.firstTry=nowOk; if(nowOk && e.attempts<1) e.attempts=1;
      row.classList.toggle('wrong', !nowOk);
      chip.className='rev-chip '+(nowOk?'ok':'no');
      chip.textContent=nowOk?'✓ ידעתי':'✗ לא ידעתי';
      refreshResultCounts();
    };
  });
}
function commitSession(){
  if(committed) return;
  const entries=[...session.values()]; if(!entries.length) return;
  const now=Date.now(); let c=0,ft=0,st=0,nw=0;
  entries.forEach(e=>{
    const r=rec(e.w.term);
    const wasNew = r.seen===0;
    if(wasNew) nw++;
    r.seen++;
    if(e.mastered && e.firstTry){                       // knew it (correct on first attempt of the round)
      r.first++; r.ever++;
      r.level = wasNew ? 3 : Math.min(3, r.level+1);     // knew on very first sight → straight to "שלמדתי"; else climb toward 3
      ft++; c++;
    }
    else if(e.mastered){ r.ever++; r.wrong+=Math.max(0,e.attempts-1); r.level=Math.max(0,r.level-1); st++; c++; }
    else { r.wrong++; r.level=Math.max(0,r.level-1); }
    r.last=now;
  });
  stats.sessions.push({t:now, scope:sessionScope, mode:sessionMode, total:entries.length, correct:c, firstTry:ft, struggled:st, newCount:nw});
  if(stats.sessions.length>300) stats.sessions=stats.sessions.slice(-300);
  saveStats(); committed=true;
}

$('#checkBtn').onclick=check;
$('#skipBtn').onclick=skip;
$('#answerInput').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!answered){ e.preventDefault(); check(); } });
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter'||!answered) return;
  if($('#quiz').classList.contains('hidden')) return;
  if(e.target && e.target.id==='assocInput') return;
  e.preventDefault(); const n=$('#nextBtn'); if(n) n.click();
});
$('#hintBtn').onclick=()=>{ const a=assoc[deck[idx].term]; const b=$('#hintBox'); b.textContent=a?('💡 '+a):'עדיין לא כתבת אסוציאציה למילה הזו — תוכל להוסיף אחרי שתענה.'; b.classList.remove('hidden'); };
$('#quitQuiz').onclick=()=>{ if(!committed&&session.size>0) commitSession(); openScope(sessionScope); };
$('#retryMissedBtn').onclick=()=>startRound(missed.slice(), sessionScope, sessionMode); // startRound commits the (corrected) session first
$('#resBackBtn').onclick=()=>{ commitSession(); openScope(sessionScope); };
$('#resScope').onclick=()=>{ commitSession(); openScope(sessionScope); };
// safety net: if the app is closed/backgrounded on the results screen, still record the round
window.addEventListener('pagehide', ()=>{ if(!committed && session.size>0) commitSession(); });
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && !committed && session.size>0) commitSession(); });

/* ===== STATS screen ===== */
function fmt(t){ const d=new Date(t); return d.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})+' · '+d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}); }
function dots(l){ let s='<span class="dots">'; for(let i=1;i<=5;i++)s+=`<i class="${i<=l?'on':''}"></i>`; return s+'</span>'; }
function openStats(scope){
  $('#statsBrand').textContent=scopeTitle(scope);
  const body=$('#statsBody');
  const words=scopeWords(scope);
  const byTerm=new Map(); for(const w of words){ if(!byTerm.has(w.term)) byTerm.set(w.term,w); }
  const arr=[...byTerm.values()].sort((a,b)=>{
    const ra=stats.words[a.term], rb=stats.words[b.term];
    const la=(!ra||ra.seen===0)?-1:ra.level, lb=(!rb||rb.seen===0)?-1:rb.level;
    return la-lb;
  });
  const sess=stats.sessions.filter(s=>s.scope===scope).slice(-8);
  let html='';
  if(sess.length){
    const last=sess[sess.length-1], prev=sess.length>1?sess[sess.length-2]:null;
    const pct=x=>x.total?Math.round(100*x.correct/x.total):0;
    let cmp='';
    if(prev){ const d=pct(last)-pct(prev); cmp = d>0?`<span style="color:var(--green);font-weight:700">▲ ${d}%</span>`:d<0?`<span style="color:var(--accent);font-weight:700">▼ ${-d}%</span>`:'ללא שינוי'; }
    html+=`<div class="section-t">היסטוריית משחקים</div>
      <div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px">
      <div><b style="font-family:'Frank Ruhl Libre';font-size:1.2rem;color:var(--accent)">${last.correct}/${last.total}</b> נכונות · ${last.firstTry} בפעם הראשונה</div>
      <div style="font-size:.8rem;color:var(--ink-soft);margin-top:3px">${fmt(last.t)}${cmp?' · השוואה: '+cmp:''}</div></div>
      <div class="trend">`+sess.map(x=>{const p=pct(x);return `<div class="tbar" title="${fmt(x.t)} — ${x.correct}/${x.total}"><i style="height:${Math.max(5,p)}%"></i><em>${p}%</em></div>`;}).join('')+`</div>`;
  }else{
    html+=`<div class="section-t">היסטוריית משחקים</div><p class="msg" style="color:var(--ink-soft)">עדיין לא סיימת סבב מלא בתחום הזה.</p>`;
  }
  html+=`<div class="section-t">חוזק מילים · מהחלש לחזק</div><div class="strength-list">`+arr.map(w=>{
    const r=stats.words[w.term]; const isNew=(!r||r.seen===0); const lvl=isNew?0:r.level;
    const meta=isNew?'טרם תורגלה':`נראתה ${r.seen}× · ${r.first} ראשונה · ${r.wrong} טעויות`;
    return `<div class="str-row${isNew?' is-new':''}"><div class="str-w"><b>${esc(w.term)}</b><span>${esc(w.meaning)}</span></div><div class="str-meter">${dots(lvl)}<em>${meta}</em></div></div>`;
  }).join('')+`</div>`;
  body.innerHTML=html;
  goto('stats');
}
$('#statsBack').onclick=()=>openScope(curScope);

/* ===== MANAGE ===== */
function deleteWord(term){ deleted.add(term); saveDeleted(); delete assoc[term]; saveAssoc(); delete stats.words[term]; saveStats(); buildBank(); }
let mSel=new Set();
function renderManage(filter){
  const list=$('#manageList'); const f=norm(filter||'');
  const items=BANK.filter(w=>!f || norm(w.term).includes(f) || (w.meaning&&w.meaning.replace(NIQ,'').includes(filter)));
  list.innerHTML=items.slice(0,400).map(w=>{
    const u=w.unit==='custom'?'שלי':w.unit;
    return `<label class="m-row"><input type="checkbox" data-term="${esc(w.term)}" ${mSel.has(w.term)?'checked':''}><b>${esc(w.term)}</b><span>${esc(w.meaning)}</span><span class="u">${u}</span></label>`;
  }).join('') || '<p class="msg" style="color:var(--ink-soft)">לא נמצאו מילים</p>';
  list.querySelectorAll('input').forEach(c=>c.onchange=()=>{ c.checked?mSel.add(c.dataset.term):mSel.delete(c.dataset.term); $('#mCount').textContent=`${mSel.size} נבחרו`; });
  $('#mCount').textContent=`${mSel.size} נבחרו`;
}
$('#manageBtn').onclick=()=>{ mSel=new Set(); $('#mSearch').value=''; $('#mMsg').classList.add('hidden'); renderManage(''); goto('manage'); };
$('#mSearch').oninput=e=>renderManage(e.target.value);
$('#mDelete').onclick=()=>{
  const m=$('#mMsg'); m.classList.remove('hidden'); m.className='msg';
  if(mSel.size===0){ m.textContent='לא נבחרו מילים.'; return; }
  if(!confirm(`למחוק ${mSel.size} מילים? (ניתן לשחזר)`)){ m.classList.add('hidden'); return; }
  mSel.forEach(t=>{ deleted.add(t); delete assoc[t]; delete stats.words[t]; });
  saveDeleted(); saveAssoc(); saveStats(); buildBank();
  m.className='msg ok'; m.textContent=`נמחקו ${mSel.size} מילים.`; mSel=new Set(); renderManage($('#mSearch').value); renderHome();
};
$('#mRestore').onclick=()=>{
  if(deleted.size===0){ toast('אין מחיקות לשחזר'); return; }
  if(!confirm(`לשחזר ${deleted.size} מילים שנמחקו?`)) return;
  deleted=new Set(); saveDeleted(); buildBank(); renderManage($('#mSearch').value); renderHome(); toast('המחיקות שוחזרו');
};

/* ===== ADD ===== */
$('#addBtn').onclick=()=>{ $('#addTerm').value=''; $('#addMeaning').value=''; $('#addMsg').classList.add('hidden'); goto('add'); };
$('#addSave').onclick=()=>{
  const t=$('#addTerm').value.trim(), mn=$('#addMeaning').value.trim();
  const m=$('#addMsg'); m.classList.remove('hidden');
  if(!t||!mn){ m.className='msg err'; m.textContent='צריך גם מילה וגם פירוש.'; return; }
  added.push([t,mn]); saveAdded(); deleted.delete(t); saveDeleted(); buildBank(); renderHome();
  m.className='msg ok'; m.textContent=`"${t}" נוספה למאגר ✓`; $('#addTerm').value=''; $('#addMeaning').value=''; $('#addTerm').focus();
};

/* ===== EXPORT ===== */
$('#exportBtn').onclick=()=>{
  const keys=Object.keys(assoc).filter(t=>assoc[t]);
  if(!keys.length){ toast('אין עדיין אסוציאציות לגיבוי'); return; }
  const lines=['# גיבוי אסוציאציות','# מילה - אסוציאציה',''].concat(keys.map(t=>`${t} - ${assoc[t]}`));
  const blob=new Blob([lines.join('\r\n')],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='associations.txt'; document.body.appendChild(a); a.click(); a.remove();
};

/* ===== nav ===== */
document.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>{ if(!committed && session.size>0) commitSession(); renderHome(); goto('home'); });
document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>openScope(b.dataset.scope));

/* ===== PWA ===== */
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }
(function installHint(){
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if(!standalone){
    const iOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
    $('#installHint').textContent = iOS ? 'טיפ: שתף → "הוסף למסך הבית" כדי להשתמש כאפליקציה אופליין' : 'טיפ: תפריט הדפדפן → "התקן אפליקציה" לשימוש אופליין';
  }
})();

/* ===== boot ===== */
buildBank();
renderHome();
goto('home');
