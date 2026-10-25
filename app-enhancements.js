/* Data Driven Development: shared fixes and usability layer for Field Hockey and Indoor Hockey Goalie Stats.
   Loaded last by field-hockey.html and indoor-hockey.html. Reads and writes only the existing data model. */
(function(){
  'use strict';
  const INDOOR=/indoor/i.test(location.pathname)||/Indoor Hockey/i.test(document.title);
  const byId=id=>document.getElementById(id);
  const escHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatOf=m=>m&&m.matchFormat==='7-a-side'?'7-a-side':'11-a-side';
  const dateOf=m=>String(m&&(m.date||m.matchDate)||'');
  const asc=(a,b)=>dateOf(a).localeCompare(dateOf(b))||String(a.id||'').localeCompare(String(b.id||''));
  const desc=(a,b)=>asc(b,a);
  function currentGoalie(){try{if(typeof goalie==='function'){const g=goalie();if(g)return g}}catch(e){}
    const id=byId('reportGoalie')?.value||byId('statsGoalie')?.value||byId('matchGoalie')?.value||'';
    try{return (db.goalies||[]).find(g=>String(g.id)===String(id))||null}catch(e){return null}}
  function dbRef(){try{return db}catch(e){return null}}

  /* ---------- 1. One source of truth for the matches a report uses ---------- */
  function reportFilter(){
    const team=(INDOOR?byId('reportTeamFilter')?.value:byId('reportHomeTeamFilter')?.value)||'all';
    const format=INDOOR?'all':(byId('reportMatchFormat')?.value||'all');
    return {team:/^all$/i.test(team)?'all':team,format};
  }
  function filterReportList(list){
    const f=reportFilter();
    return (Array.isArray(list)?list:[]).filter(m=>m&&(f.team==='all'||String(m.homeTeam||'')===String(f.team))&&(f.format==='all'||formatOf(m)===f.format));
  }
  function reportMatches(g,mode){
    const all=filterReportList(Array.isArray(g&&g.matches)?g.matches:[]).slice().sort(asc);
    if(mode!=='range')return all;
    if(!all.length)return [];
    const sid=byId('v472DDDStart')?.value,eid=byId('v472DDDEnd')?.value;
    let si=all.findIndex(m=>String(m.id)===String(sid)),ei=all.findIndex(m=>String(m.id)===String(eid));
    if(si<0)si=0;if(ei<0)ei=all.length-1;if(si>ei){const t=si;si=ei;ei=t}
    return all.slice(si,ei+1);
  }
  window.v134ReportMatches=reportMatches;
  window.v134FilterReportList=filterReportList;

  /* ---------- 2. Never leave a report on screen that no longer matches the chosen options ---------- */
  const REPORT_CONTROLS=['v471ReportType','reportGoalie','reportHomeTeamFilter','reportMatchFormat','reportTeamFilter','reportYear','reportMatch','v471_reportMatch','v471_reportYear','v470ReportOpponent','v471_v470ReportOpponent','v470ReportHomeTeam','v471_v470ReportHomeTeam','v472DDDStart','v472DDDEnd'];
  function clearReport(){const out=byId('reportOutput');if(out&&out.innerHTML)out.innerHTML=''}
  document.addEventListener('change',e=>{if(REPORT_CONTROLS.includes(e.target?.id)){clearReport();setTimeout(refreshOpponentOptions,0)}},true);
  const hintCss=document.createElement('style');
  hintCss.textContent='#reportOutput:empty::before{content:"Choose the report options above, then press Generate Report.";display:block;padding:18px;border:1px dashed #91b4c8;border-radius:12px;color:#4b6475;text-align:center}';
  document.head.appendChild(hintCss);

  /* ---------- 3. Opponent choices follow the team (and format) filter ---------- */
  function refreshOpponentOptions(){
    const g=currentGoalie();if(!g)return;
    const opps=[...new Set(filterReportList(g.matches||[]).map(m=>String(m.opponentTeam||m.opponent||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    for(const sel of [byId('v470ReportOpponent'),byId('v471_v470ReportOpponent')]){
      if(!sel)continue;const old=sel.value;
      const now=[...sel.options].map(o=>o.value);
      if(now.length===opps.length&&now.every((v,i)=>v===opps[i]))continue;
      sel.innerHTML=opps.length?opps.map(o=>'<option value="'+escHtml(o)+'">'+escHtml(o)+'</option>').join(''):'<option value="">No opponents for these filters</option>';
      sel.value=opps.includes(old)?old:(opps[0]||'');
    }
  }
  const wrapAfter=(name,fn)=>{const old=window[name];if(typeof old!=='function'||old.v134)return;const w=function(){const r=old.apply(this,arguments);try{fn()}catch(e){}return r};w.v134=true;window[name]=w};
  setTimeout(()=>wrapAfter('updateV471ReportFields',refreshOpponentOptions),3500);

  /* ---------- 4. Indoor: every report type follows the Home Team Filter (Field already does this in v1.32) ---------- */
  if(INDOOR&&typeof window.allMatches==='function'&&!window.allMatches.v134){
    const baseAll=window.allMatches;
    const filtered=function(){const list=baseAll.apply(this,arguments);return window.__v134ReportActive?filterReportList(list):list};
    filtered.v134=true;window.allMatches=filtered;
  }
  function wrapGenerate(){
    const old=window.generateV471SelectedReport;if(!INDOOR||typeof old!=='function'||old.v134Gen)return;
    const fn=function(){window.__v134ReportActive=true;try{return old.apply(this,arguments)}finally{window.__v134ReportActive=false}};
    fn.v134Gen=true;window.generateV471SelectedReport=fn;
  }
  wrapGenerate();

  /* ---------- 5. Recorder imports keep their match format and 1v1 situation ---------- */
  function fieldSituationFix(m){let changed=false;(m&&m.shots||[]).forEach(s=>['shotSituation','situation'].forEach(k=>{if(/^\s*6\s*second/i.test(String(s[k]||''))){s[k]='8 Second 1v1';changed=true}}));return changed}
  function repairFieldData(){
    if(INDOOR)return;const d=dbRef();if(!d)return;let changed=false;
    (d.goalies||[]).forEach(g=>(g.matches||[]).forEach(m=>{if(fieldSituationFix(m))changed=true}));
    if(changed){try{saveDB()}catch(e){}}
  }
  setTimeout(repairFieldData,0);
  function wrapImport(){
    const old=window.importRecorderMatch;if(typeof old!=='function'||old.v134)return;
    const fn=function(){
      const file=byId('matchImportFile')?.files?.[0];
      const result=old.apply(this,arguments);
      if(file){const r=new FileReader();r.onload=()=>{let payload;try{payload=JSON.parse(r.result)}catch(e){return}
        const src=payload.match||payload;
        setTimeout(()=>{const g=currentGoalie();if(!g)return;
          const m=(g.matches||[]).slice().reverse().find(x=>String(x.date||'')===String(src.date||'')&&String(x.homeTeam||'')===String(src.homeTeam||'')&&String(x.opponentTeam||x.opponent||'')===String(src.opponentTeam||src.opponent||''));
          if(!m)return;
          if(!INDOOR)m.matchFormat=src.matchFormat==='7-a-side'?'7-a-side':'11-a-side';
          if(!INDOOR)fieldSituationFix(m);
          try{saveDB()}catch(e){}try{renderAll()}catch(e){}
        },700)};r.readAsText(file)}
      return result};
    fn.v134=true;window.importRecorderMatch=fn;
  }
  [0,3500].forEach(ms=>setTimeout(wrapImport,ms));

  /* ---------- 6. Long videos: read audio by playing the file silently instead of loading it all into memory ---------- */
  window.v134AudioDecodeLimit=200*1024*1024;
  window.v134StreamedEnvelope=async function(url,name){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error('Audio analysis is not supported by this browser.');
    const media=document.createElement('video'),ctx=new AC(),source=ctx.createMediaElementSource(media),analyser=ctx.createAnalyser(),silent=ctx.createGain();
    analyser.fftSize=2048;silent.gain.value=0;source.connect(analyser);analyser.connect(silent);silent.connect(ctx.destination);
    media.preload='auto';media.playsInline=true;media.src=url;media.playbackRate=4;media.defaultPlaybackRate=4;media.preservesPitch=false;
    const hz=10,buf=new Float32Array(analyser.fftSize);let timer=0;
    const status=document.getElementById('v530AutoPanel')||document.getElementById('v530WavePanel');
    try{
      await ctx.resume();
      await new Promise((ok,bad)=>{if(media.readyState>=1)return ok();media.addEventListener('loadedmetadata',ok,{once:true});media.addEventListener('error',()=>bad(new Error((name||'This video')+' could not be opened for audio analysis.')),{once:true})});
      const duration=Number(media.duration)||0;if(!(duration>0))throw new Error((name||'This video')+' has no readable duration.');
      const values=new Float32Array(Math.ceil(duration*hz));values.fill(NaN);
      await media.play().catch(()=>{throw new Error('Chrome blocked audio analysis for '+(name||'this video')+'. Press the button again.')});
      await new Promise((ok,bad)=>{
        const started=performance.now(),limit=duration/4*1000*2.5+60000;
        timer=setInterval(()=>{
          analyser.getFloatTimeDomainData(buf);let sum=0;for(let i=0;i<buf.length;i++)sum+=buf[i]*buf[i];
          const bin=Math.min(values.length-1,Math.floor(media.currentTime*hz));if(bin>=0)values[bin]=Math.sqrt(sum/buf.length);
          if(status&&status.isConnected){let p=status.querySelector('.v134Progress');if(!p){p=document.createElement('div');p.className='v134Progress v521Small';status.appendChild(p)}p.textContent='Reading audio from '+(name||'video')+': '+Math.round(media.currentTime/duration*100)+'% (keep this tab open)'}
          if(media.ended||media.currentTime>=duration-0.05){clearInterval(timer);timer=0;ok()}
          else if(performance.now()-started>limit){clearInterval(timer);timer=0;bad(new Error('Audio analysis of '+(name||'this video')+' took too long. Keep the tab open and try again.'))}
        },25);
        media.addEventListener('error',()=>{clearInterval(timer);timer=0;bad(new Error((name||'This video')+' stopped playing during analysis.'))},{once:true});
      });
      let last=0;for(let i=0;i<values.length;i++){if(Number.isNaN(values[i]))values[i]=last;else last=values[i]}
      let mean=0;for(const v of values)mean+=v;mean/=Math.max(1,values.length);let variance=0;for(const v of values)variance+=(v-mean)*(v-mean);const sd=Math.sqrt(variance/Math.max(1,values.length))||1;
      for(let i=0;i<values.length;i++)values[i]=(values[i]-mean)/sd;
      return {env:values,hz,duration,streamed:true};
    }finally{if(timer)clearInterval(timer);try{media.pause();media.removeAttribute('src');media.load()}catch(e){}try{source.disconnect();analyser.disconnect();silent.disconnect()}catch(e){}try{await ctx.close()}catch(e){}const p=document.querySelector('.v134Progress');if(p)p.remove()}
  };

  /* ---------- 7. Usability ---------- */
  const SPORT=INDOOR?'indoor_hockey':'field_hockey',SPORT_NAME=INDOOR?'Indoor Hockey':'Field Hockey';
  const css=document.createElement('style');
  css.textContent=`
  .v134Notice{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(20px);max-width:min(560px,calc(100vw - 32px));background:#12344a;color:#fff;padding:13px 18px;border-radius:14px;box-shadow:0 14px 40px rgba(6,20,35,.35);font-weight:700;line-height:1.35;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:100000}
  .v134Notice.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}
  .v134Start{margin-bottom:14px}.v134Start h2{margin:0 0 6px}.v134Start .v134Row{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:10px 0}
  .v134Start label{display:block;font-size:13px;font-weight:700;color:#35566c;margin-bottom:4px}.v134Start select{min-width:220px}
  .v134Start .btn{width:auto;margin:0}.v134Start .v134Big{font-size:17px;padding:14px 22px}
  .v134Recent{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:6px}.v134Recent li{display:flex;justify-content:space-between;gap:10px;padding:9px 12px;border:1px solid #c3d8e4;border-radius:10px;background:#fff;font-size:14px}
  .v134Recent li span:last-child{white-space:nowrap;font-weight:700;color:#35566c}
  .v134Warn{padding:10px 12px;border-radius:10px;background:#fff6e0;border:1px solid #f0c66b;color:#5d4300;font-weight:600;margin:8px 0}
  .v134Warn a{color:#7a4d00;font-weight:800}
  #home .homeLogo{max-height:170px;width:auto}
  .v134Locked{position:relative}.v134Locked>*{opacity:.35;pointer-events:none}
  .v134Locked::after{content:attr(data-lock);position:absolute;inset:auto 12px 12px 12px;top:50%;transform:translateY(-50%);background:#12344a;color:#fff;padding:14px 16px;border-radius:12px;font-weight:700;text-align:center;line-height:1.35;box-shadow:0 10px 30px rgba(6,20,35,.25)}
  .v134Ready{margin:8px 0;padding:9px 12px;border-radius:10px;font-weight:700;font-size:14px}.v134Ready.ok{background:#e5f4e4;color:#1c6b3c;border:1px solid #a8d5b3}.v134Ready.no{background:#fff6e0;color:#6b4a00;border:1px solid #f0c66b}
  .v134LockHint{font-size:13px;color:#4b6475;margin-top:6px}
  .v134LegendToggle{display:none}
  @media(max-width:700px){
    #match .grid2,#heat .grid2,#editor .grid2,#matchEditor .grid2{grid-template-columns:1fr}
    #match .grid3{grid-template-columns:1fr 1fr}
    #match .heatMapLegend,#heat .heatMapLegend,#matchEditor .heatMapLegend{display:none}
    body.v134ShowLegend #match .heatMapLegend,body.v134ShowLegend #heat .heatMapLegend,body.v134ShowLegend #matchEditor .heatMapLegend{display:block}
    .v134LegendToggle{display:inline-block;width:auto;margin:6px 0}
    #match .mapBox svg,#heat .mapBox svg{width:100%;height:auto}
  }`;
  document.head.appendChild(css);

  // 7a. Messages: non-blocking notices instead of browser pop-ups (confirm and prompt are unchanged).
  let noticeTimer=0;
  function notice(message){let el=byId('v134Notice');if(!el){el=document.createElement('div');el.id='v134Notice';el.className='v134Notice';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.addEventListener('click',()=>el.classList.remove('show'));document.body.appendChild(el)}
    el.textContent=String(message??'');el.classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.classList.remove('show'),Math.min(9000,3500+String(message||'').length*35))}
  window.v134Notice=notice;
  window.alert=function(message){notice(message)};

  // 7b. Start screen: choose goalkeeper, start or resume a match, see recent matches.
  function goalies(){try{return db.goalies||[]}catch(e){return []}}
  function setGoalie(id){try{currentGoalieId=id;db.currentGoalieId=id;saveDB()}catch(e){}try{renderAll()}catch(e){}renderStart()}
  function matchRates(m){let sv=0,gl=0,an=0;(m.shots||[]).forEach(s=>{const o=String(s.outcome||'');if(/^goal$/i.test(o))gl++;else if(/^angle/i.test(o))an++;else sv++});return {save:(sv+gl)?Math.round(sv/(sv+gl)*100)+'%':'N/C'}}
  function teamsForSport(g){return (Array.isArray(g&&g.teamProfiles)?g.teamProfiles:[]).filter(p=>p&&String(p.name||'').trim()&&(INDOOR?true:(p.sportType||'field_hockey')==='field_hockey'))}
  function renderStart(){
    const home=byId('home');if(!home)return;let box=byId('v134Start');
    if(!box){box=document.createElement('div');box.id='v134Start';box.className='card v134Start';home.insertBefore(box,home.firstElementChild)}
    const list=goalies(),g=currentGoalie();
    if(!list.length){box.innerHTML='<h2>Get started</h2><p>No goalkeepers yet. Goalkeepers and their teams are added once, on the Data Driven Development platform, and then appear here.</p><div class="v134Row"><a class="btn good v134Big" href="index.html#goalies">Enrol a goalkeeper</a></div>';return}
    const opts=list.map(x=>'<option value="'+escHtml(x.id)+'"'+(g&&String(g.id)===String(x.id)?' selected':'')+'>'+escHtml(x.name||'Unnamed goalie')+'</option>').join('');
    const ms=(g&&g.matches||[]).slice().sort(desc),draft=(()=>{try{const a=activeMatch();if(a&&g.matches.includes(a))return a}catch(e){}return ms.find(m=>m.matchStatus==='draft')})();
    const teams=g?teamsForSport(g):[];
    let html='<h2>'+escHtml(SPORT_NAME)+' Goalie Stats</h2><div class="v134Row"><div><label for="v134StartGoalie">Goalkeeper</label><select id="v134StartGoalie">'+opts+'</select></div></div>';
    if(g&&!teams.length)html+='<div class="v134Warn">'+escHtml(g.name||'This goalkeeper')+' has no '+escHtml(SPORT_NAME)+' team yet. <a href="index.html#goalies">Add a team on the platform</a> so matches can be recorded against it.</div>';
    html+='<div class="v134Row">'+(draft?'<button type="button" class="btn good v134Big" data-v134-resume="'+escHtml(draft.id)+'">Resume match: '+escHtml(draft.name||((draft.homeTeam||'')+' vs '+(draft.opponentTeam||'')))+'</button>':'')+'<button type="button" class="btn '+(draft?'':'good v134Big')+'" data-v134-go="match">New Match</button><button type="button" class="btn" data-v134-go="stats">Stats</button><button type="button" class="btn" data-v134-go="reports">Reports</button></div>';
    const recent=ms.filter(m=>m!==draft).slice(0,3);
    html+=recent.length?'<b>Recent matches</b><ul class="v134Recent">'+recent.map(m=>'<li><span>'+escHtml(m.date||'')+' · '+escHtml((m.homeTeam||'')+' vs '+(m.opponentTeam||m.opponent||''))+'</span><span>Save rate '+matchRates(m).save+'</span></li>').join('')+'</ul>':'<p class="small">No matches recorded yet for this goalkeeper. Press New Match to record the first one.</p>';
    box.innerHTML=html;
    byId('v134StartGoalie')?.addEventListener('change',e=>setGoalie(e.target.value));
    box.querySelectorAll('[data-v134-go]').forEach(b=>b.addEventListener('click',()=>{try{showTab(b.dataset.v134Go)}catch(e){}}));
    box.querySelector('[data-v134-resume]')?.addEventListener('click',e=>{try{activeMatchId=e.currentTarget.dataset.v134Resume;db.activeMatchId=activeMatchId;saveDB();renderAll()}catch(x){}try{showTab('match')}catch(x){}});
  }

  // 7c. Recording controls stay locked until the match has been started.
  const LOCK_MSG='Fill in Match Details above and press Start / Save Match Details to begin recording.';
  function hasActive(){try{return !!activeMatch()}catch(e){return false}}
  function updateLock(){const panel=byId('match');if(!panel)return;const locked=!hasActive();
    panel.querySelectorAll(':scope .card').forEach(card=>{const h=card.querySelector('h2')?.textContent||'';if(/^(Record Shot|Match Timeline|Match Outcomes)/.test(h.trim())){card.classList.toggle('v134Locked',locked);card.setAttribute('data-lock',LOCK_MSG)}})}

  // 7d. Benchmark readiness shown while setting up the match.
  const READY_FIELDS=[['matchType','Match Type'],['matchParticipation','Goalkeeper Participation'],['matchGoalieAgeGroup','Age Group'],['matchGoalieLevel','Team Level'],['matchGoalieTier','Team Tier'],['matchOpponentAgeGroup','Opponent Age Group'],['matchOpponentLevel','Opponent Level'],['matchOpponentTier','Opponent Tier']];
  function updateReadiness(){const start=[...document.querySelectorAll('#match button')].find(b=>/Start \/ Save Match Details/.test(b.textContent));if(!start)return;
    let el=byId('v134Ready');if(!el){el=document.createElement('div');el.id='v134Ready';el.className='v134Ready';start.insertAdjacentElement('beforebegin',el)}
    const missing=READY_FIELDS.filter(([id])=>{const v=String(byId(id)?.value||'').trim();return byId(id)&&(!v||/^not specified$/i.test(v))}).map(x=>x[1]);
    const partial=byId('matchParticipation')?.value==='Partial match'&&!(Number(byId('matchMinutesPlayed')?.value)>0);if(partial)missing.push('Minutes Played');
    el.className='v134Ready '+(missing.length?'no':'ok');
    el.textContent=missing.length?'Not benchmark-ready yet. Missing: '+missing.join(', ')+'.':'Benchmark-ready once finished.';
    const teamHint=(missing.includes('Team Level')||missing.includes('Team Tier'))?' Team Level and Tier are set on the team profile.':'';if(teamHint)el.textContent+=teamHint}

  // 7e. Explain locked benchmark buttons.
  function explainLocks(){document.querySelectorAll('button').forEach(b=>{if(!/^Benchmarks Locked$/.test(b.textContent.trim()))return;let n=b.nextElementSibling;if(n&&n.classList.contains('v134LockHint'))return;n=document.createElement('div');n.className='v134LockHint';n.innerHTML='Benchmarks unlock once this goalkeeper is opted in and a finished, benchmark-ready match has uploaded. <a href="index.html#benchmarking">Manage benchmarking</a>.';b.insertAdjacentElement('afterend',n)})}

  // 7f. Phone legend toggle for the heat maps.
  function legendToggles(){['match','heat'].forEach(id=>{const panel=byId(id);if(!panel)return;const grid=panel.querySelector('.grid2 .mapBox')?.closest('.grid2');if(!grid||grid.previousElementSibling?.classList?.contains('v134LegendToggle'))return;const b=document.createElement('button');b.type='button';b.className='btn v134LegendToggle';b.textContent='Show heat map legend';b.addEventListener('click',()=>{const on=document.body.classList.toggle('v134ShowLegend');document.querySelectorAll('.v134LegendToggle').forEach(x=>x.textContent=on?'Hide heat map legend':'Show heat map legend')});grid.insertAdjacentElement('beforebegin',b)})}

  // 7g. Connect each visible label to its field, so tapping the label focuses it and screen readers can name it.
  let labelSeq=0;
  function linkLabels(){document.querySelectorAll('label:not([for])').forEach(l=>{if(l.querySelector('input,select,textarea'))return;let n=l.nextElementSibling;if(n&&!/^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName))n=n.querySelector?.('input,select,textarea')&&n.children.length<=2?n.querySelector('input,select,textarea'):null;if(!n||!/^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName)||n.type==='hidden')return;if(!n.id)n.id='v134f'+(++labelSeq);l.htmlFor=n.id})}

  // Keep everything current as the app re-renders.
  let pending=0;
  function refreshUi(){pending=0;try{updateLock()}catch(e){}try{updateReadiness()}catch(e){}try{explainLocks()}catch(e){}try{legendToggles()}catch(e){}try{linkLabels()}catch(e){}try{if(byId('home')?.classList.contains('active'))renderStart()}catch(e){}}
  function schedule(){if(!pending)pending=setTimeout(refreshUi,120)}
  new MutationObserver(muts=>{if(muts.some(m=>!(m.target.closest&&m.target.closest('#v134Start,#v134Notice,#v134Ready,#videoReview'))))schedule()}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('change',e=>{if(e.target?.closest?.('#match'))schedule()},true);
  document.addEventListener('input',e=>{if(e.target?.closest?.('#match'))schedule()},true);
  document.addEventListener('click',e=>{if(e.target?.closest?.('[data-tab]'))setTimeout(refreshUi,50)},true);
  setTimeout(()=>{renderStart();refreshUi()},300);setTimeout(refreshUi,3200);

  window.v134={INDOOR,byId,escHtml,formatOf,currentGoalie,dbRef,asc,desc,reportFilter};
})();
