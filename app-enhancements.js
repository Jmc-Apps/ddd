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
  function matchRates(m){let sv=0,gl=0,an=0;(m.shots||[]).forEach(s=>{const o=String(s.outcome||'');if(/^goal$/i.test(o))gl++;else if(/^angle/i.test(o))an++;else sv++});return {save:(sv+gl)?Math.round(sv/(sv+gl)*100)+'% ('+sv+'/'+(sv+gl)+')':'N/C'}}
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

  // 7h. Rebounds are recorded for saves only: grey out the rebound choices for goals and Angles Closed Off.
  const rebCss=document.createElement('style');
  rebCss.textContent='.v134RebOff{opacity:.38;pointer-events:none;filter:grayscale(1)}.v134RebNote{font-size:12px;color:#587386;margin:2px 0 6px}';
  document.head.appendChild(rebCss);
  function markReb(el,off){if(!el)return;el.classList.toggle('v134RebOff',off);if(el.tagName==='SELECT')el.disabled=off;let n=el.nextElementSibling;const has=n&&n.classList&&n.classList.contains('v134RebNote');if(off&&!has){n=document.createElement('div');n.className='v134RebNote';n.textContent='Rebounds are recorded for saves only.';el.insertAdjacentElement('afterend',n)}else if(!off&&has)n.remove()}
  function updateRebounds(){
    try{markReb(byId('reboundButtons'),selectedOutcome!=='Save')}catch(e){}
    try{markReb(byId('editReboundButtons'),editOutcome!=='Save')}catch(e){}
    try{const row=document.querySelector('[data-v521-draft^="rebound|"]')?.parentElement;if(row)markReb(row,!!vrDraft&&vrDraft.outcome!=='Save')}catch(e){}
    const v459=byId('v459EditRebound'),v459o=byId('v459EditOutcome');if(v459&&v459o)markReb(v459,!/^save$/i.test(v459o.value||'Save')&&v459o.value!=='');
  }
  document.addEventListener('click',()=>setTimeout(updateRebounds,30),true);
  document.addEventListener('change',e=>{if(e.target?.id==='v459EditOutcome'){const r=byId('v459EditRebound');if(r){r.value=/^save$/i.test(e.target.value)?(r.value||'Safe'):''}}setTimeout(updateRebounds,30)},true);

  /* ---------- 8. Reports: coaching ratings and Training Focus insights (Data Driven Development Theory) ---------- */
  const repCss=document.createElement('style');
  repCss.textContent=`
  #reportOutput .v134LowRating{background:#fbebeb!important;color:#9b1c1c;font-weight:800}
  #reportOutput .v134LowRating::after{content:" low";font-size:11px;font-weight:700;margin-left:4px;text-transform:uppercase;letter-spacing:.04em}
  #reportOutput .v134Section{margin:18px 0;break-inside:avoid}
  #reportOutput .v134Insight{border:1px solid #c3d8e4;border-left:5px solid #087fa4;border-radius:10px;padding:10px 12px;margin:8px 0;background:#f7fbfd}
  #reportOutput .v134Insight.warn{border-left-color:#d97706;background:#fffaf0}
  #reportOutput .v134Insight.alert{border-left-color:#c62828;background:#fdf3f3}
  #reportOutput .v134Insight.good{border-left-color:#1c9c5b;background:#f2faf5}
  #reportOutput .v134Insight b{display:block;margin-bottom:3px}
  #reportOutput .v134Muted{color:#587386;font-size:13px}
  @media print{#reportOutput .v134LowRating{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
  document.head.appendChild(repCss);
  const pctTxt=(n,d)=>d?Math.round(n/d*100)+'%':'N/C';
  const outcomeOf=s=>{const o=String(s&&s.outcome||'');return /^goal$/i.test(o)?'Goal':/^angle/i.test(o)?'Angle Closed Off':'Save'};
  function ratingKeys(ms){const keys=[];ms.forEach(m=>Object.keys(m&&m.ratings||{}).forEach(k=>{if(!keys.includes(k))keys.push(k)}));return keys}
  function ratingVal(m,k){const v=Number(m&&m.ratings&&m.ratings[k]);return Number.isFinite(v)&&v>=1&&v<=5?v:null}
  function highlightRatings(root,keys){if(!keys.length)return;root.querySelectorAll('tr').forEach(tr=>{const cells=[...tr.children];if(cells.length<2)return;const head=(cells[0].textContent||'').trim();if(!keys.includes(head))return;cells.slice(1).forEach(td=>{const v=Number((td.textContent||'').trim());if(v===1||v===2){td.classList.add('v134LowRating');td.title='Score of 1 or 2: needs a coaching intervention'}})})}
  function reportMatchesFor(type,g){
    let ms=filterReportList(g.matches||[]).slice().sort(asc);
    if(type==='ddd')return reportMatches(g,'range');
    if(['year','situation','period','training'].includes(type)){const y=byId('v471_reportYear')?.value||byId('reportYear')?.value;if(y)ms=ms.filter(m=>dateOf(m).slice(0,4)===String(y))}
    return ms}
  function ratingsSection(ms,keys,title){
    if(!keys.length)return '';const rated=ms.filter(m=>keys.some(k=>ratingVal(m,k)!==null));if(!rated.length)return '';
    const avg=k=>{const v=rated.map(m=>ratingVal(m,k)).filter(x=>x!==null);return v.length?(v.reduce((a,b)=>a+b,0)/v.length):null};
    let h='<section class="v134Section"><h2>'+escHtml(title)+'</h2><p class="v134Muted">Scores of 1 or 2 are highlighted: they call for a coaching intervention.</p><div class="tableWrap"><table><tr><th>Match</th>'+keys.map(k=>'<th>'+escHtml(k)+'</th>').join('')+'</tr>';
    h+=rated.map(m=>'<tr><td>'+escHtml(dateOf(m)+' vs '+(m.opponentTeam||m.opponent||''))+'</td>'+keys.map(k=>{const v=ratingVal(m,k);return '<td'+(v!==null&&v<=2?' class="v134LowRating" title="Needs a coaching intervention"':'')+'>'+(v===null?'–':v)+'</td>'}).join('')+'</tr>').join('');
    h+='<tr><th>Average</th>'+keys.map(k=>{const a=avg(k);return '<th'+(a!==null&&a<=2.5?' class="v134LowRating"':'')+'>'+(a===null?'–':a.toFixed(1))+'</th>'}).join('')+'</tr></table></div></section>';
    return h}
  // Save % bands from Data Driven Development Theory: U13 65-75%, U16 70-80%, 1st Team 75-85%, Provincial 80%.
  function saveBand(g,ms){
    const levels=ms.map(m=>String(m.goalieTeamLevel||'')),tiers=ms.map(m=>String(m.goalieTeamTier||'')),ages=ms.map(m=>String(m.goalieAgeGroupAtMatch||''));
    if(levels.some(l=>/provincial|national/i.test(l)))return {name:'Provincial',low:80,high:100};
    const age=ages.find(Boolean)||'';
    if(age==='U13'||age==='U11'||age==='U10')return {name:'U13',low:65,high:75};
    if(age==='U14'||age==='U16')return {name:'U16',low:70,high:80};
    if(tiers.some(t=>/^A/.test(t)))return {name:'1st Team',low:75,high:85};
    return null}
  function zoneOfD(s){const x=Number(s.dX),y=Number(s.dY);if(!Number.isFinite(x)||!Number.isFinite(y))return null;const side=x<36?'left':x>64?'right':'centre';const dist=Math.hypot(x-50,y-51);return (dist<25?'close range, ':'top of the D, ')+side}
  function zoneOfGoal(s){const x=Number(s.gX),y=Number(s.gY);if(!Number.isFinite(x)||!Number.isFinite(y))return null;const col=x<36.33?'left':x>63.66?'right':'centre';const row=y<21.33?'top':y>34.66?'bottom':'middle';return row+' '+col}
  function worstZone(shots,zoneFn,minAttempts){const z={};shots.forEach(s=>{const k=zoneFn(s);if(!k)return;const o=outcomeOf(s);if(o==='Angle Closed Off')return;const r=z[k]||(z[k]={saves:0,goals:0});if(o==='Goal')r.goals++;else r.saves++});
    return Object.entries(z).map(([k,r])=>({zone:k,...r,att:r.saves+r.goals,rate:(r.saves+r.goals)?r.saves/(r.saves+r.goals):1})).filter(r=>r.att>=minAttempts&&r.goals>0).sort((a,b)=>b.goals-a.goals||a.rate-b.rate)[0]||null}
  function insightsSection(g,ms){
    const shots=[];ms.forEach(m=>(m.shots||[]).forEach(s=>shots.push(s)));if(!shots.length)return '';
    const saves=shots.filter(s=>outcomeOf(s)==='Save'),goals=shots.filter(s=>outcomeOf(s)==='Goal'),aco=shots.filter(s=>outcomeOf(s)==='Angle Closed Off');
    const sr=(saves.length+goals.length)?saves.length/(saves.length+goals.length)*100:null,n=Math.max(1,ms.length);
    const out=[];const add=(cls,title,text)=>out.push('<div class="v134Insight '+cls+'"><b>'+escHtml(title)+'</b>'+text+'</div>');
    const band=saveBand(g,ms);
    if(sr!==null&&band){const pos=sr<band.low?'below':sr>band.high?'above':'within';add(pos==='below'?'warn':'good','Save rate against the '+band.name+' benchmark','Save rate '+Math.round(sr)+'% ('+saves.length+'/'+(saves.length+goals.length)+') is '+pos+' the expected '+band.name+' range of '+band.low+(band.high<100?'–'+band.high:'')+'%.')}
    if(sr!==null&&band&&sr<band.low)add('alert','Low save rate: individual technique','Usually points to late reactions, poor positioning or not being set before the shot. Train set position, footwork into position and reaction saves.');
    const spm=shots.length/n,gpm=goals.length/n;
    if(spm>=12&&gpm>=3)add('warn','Many shots and many goals: team defensive structure',''+spm.toFixed(1)+' shots and '+gpm.toFixed(1)+' goals a match. This volume points to the defence allowing too many quality entries, not only the goalkeeper. Review the defensive structure with the team.');
    const reb=goals.filter(s=>/^rebound$/i.test(String(s.type||s.shotType||'')));
    if(goals.length>=3&&reb.length/goals.length>=0.25)add('warn','Frequent rebound goals',reb.length+' of '+goals.length+' goals ('+pctTxt(reb.length,goals.length)+') came from rebounds. Focus on kicking width and clearing to the sidelines.');
    const outn=s=>['2 vs 1','3 vs 1','4+ vs 1','4 vs 1','5 vs 1'].includes(String(s.outnumbered||''));
    const og=goals.filter(outn);
    if(goals.length>=3&&og.length/goals.length>=0.3)add('warn','Goals while outnumbered',og.length+' of '+goals.length+' goals ('+pctTxt(og.length,goals.length)+') were conceded while outnumbered. This may be a defensive structure problem in front of the goalkeeper rather than a technical failure.');
    const safe=saves.filter(s=>/^safe$/i.test(String(s.rebound||''))).length,danger=saves.filter(s=>/^dangerous$/i.test(String(s.rebound||''))).length;
    if(safe+danger>=5)add(danger/(safe+danger)>=0.3?'warn':'good','Rebound distribution',pctTxt(safe,safe+danger)+' of recorded rebounds went to a safe zone ('+safe+' safe, '+danger+' dangerous). '+(danger/(safe+danger)>=0.3?'Work on directing saves to an unmarked teammate or the open areas either side of the goal.':'Keep directing saves away from the strike zone.'));
    const dz=worstZone(shots,zoneOfD,4);if(dz)add('warn','Where goals come from (D heat map)','Most goals ('+dz.goals+' from '+dz.att+' attempts, '+pctTxt(dz.saves,dz.att)+' saved) came from '+dz.zone+' as shown on the D heat map. Train shots from this area.');
    const gz=worstZone(shots,zoneOfGoal,3);if(gz)add('warn','Where goals go in (goal box)','Most goals ('+gz.goals+') went into the '+gz.zone+' of the goal as shown on the goal box heat map. Train saves to this area.');
    if(ms.length>=6){const sorted=ms.slice().sort(asc),last=sorted.slice(-5),prev=sorted.slice(-10,-5);const rate=list=>{let s=0,gl=0;list.forEach(m=>(m.shots||[]).forEach(x=>{const o=outcomeOf(x);if(o==='Save')s++;else if(o==='Goal')gl++}));return (s+gl)?{v:s/(s+gl)*100,t:Math.round(s/(s+gl)*100)+'% ('+s+'/'+(s+gl)+')'}:null};const ra=rate(last),rb=rate(prev),a=ra&&ra.v,b=rb&&rb.v;if(ra&&rb)add(a>=b?'good':'warn','5-match trend','Save rate over the last 5 matches is '+ra.t+', compared with '+rb.t+' in the '+prev.length+' before.')}
    const keys=ratingKeys(ms),lows=[];keys.forEach(k=>{const n2=ms.filter(m=>{const v=ratingVal(m,k);return v!==null&&v<=2}).length;if(n2)lows.push({k,n:n2})});
    if(lows.length){let txt=lows.map(x=>escHtml(x.k)+' scored 1 or 2 in '+x.n+' match'+(x.n===1?'':'es')).join('; ')+'. A score of 1 or 2 needs a direct coaching intervention.';if(lows.some(x=>/communicat|organi/i.test(x.k)))txt+=' For communication: the goalkeeper should call out marking assignments at least 5 seconds before the ball enters the circle.';add('alert','Low coaching ratings',txt)}
    if(!out.length)return '';
    return '<section class="v134Section"><h2>Coaching Insights</h2><p class="v134Muted">Based on the Data Driven Development Theory. Look at trends over several matches rather than one match on its own.</p>'+out.join('')+'</section>'}
  function decorateReport(){
    const root=byId('reportOutput');if(!root||!root.innerHTML||root.querySelector('.v134Decorated'))return;
    const g=currentGoalie();if(!g)return;const type=byId('v471ReportType')?.value||'';const text=root.textContent||'';
    const ms=reportMatchesFor(type,g),keys=ratingKeys(g.matches||[]);
    highlightRatings(root,keys);
    if(type!=='weighted'&&type!=='benchmark'&&!root.querySelector('.v136WeightedReport')){try{addWeightedCard(root,reportMatchesNow(type,g))}catch(e){}}
    const content=root.querySelector('.reportMainContent')||root;
    const anchor=content.querySelector('.v517TimelineBlock,.v472Addendum');
    const put=html=>{if(!html)return;if(anchor)anchor.insertAdjacentHTML('beforebegin',html);else content.insertAdjacentHTML('beforeend',html)};
    if(/Training Focus Report/i.test(text)||type==='training'){put(insightsSection(g,ms));put(ratingsSection(ms,keys,'Coaching Ratings'))}
    else if(/Data Driven Development Report/i.test(text)||type==='ddd'){put(ratingsSection(ms,keys,'Coaching Ratings'))}
    const mark=document.createElement('span');mark.className='v134Decorated';mark.hidden=true;root.appendChild(mark);
  }
  let decoTimer=0;
  function watchReport(){const panel=byId('reports')||document.body;new MutationObserver(()=>{if(!decoTimer)decoTimer=setTimeout(()=>{decoTimer=0;decorateReport()},600)}).observe(panel,{childList:true,subtree:true})}watchReport();
  window.v134DecorateReport=decorateReport;

  // Keep everything current as the app re-renders.
  let pending=0;
  function refreshUi(){pending=0;try{updateRebounds()}catch(e){}try{updateLock()}catch(e){}try{updateReadiness()}catch(e){}try{explainLocks()}catch(e){}try{legendToggles()}catch(e){}try{linkLabels()}catch(e){}try{placeWeighted()}catch(e){}try{styleCounts()}catch(e){}try{if(byId('home')?.classList.contains('active'))renderStart()}catch(e){}}
  function schedule(){if(!pending)pending=setTimeout(refreshUi,120)}
  new MutationObserver(muts=>{if(muts.some(m=>!(m.target.closest&&m.target.closest('#v134Start,#v134Notice,#v134Ready,#videoReview'))))schedule()}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('change',e=>{if(e.target?.closest?.('#match'))schedule()},true);
  document.addEventListener('input',e=>{if(e.target?.closest?.('#match'))schedule()},true);
  document.addEventListener('click',e=>{if(e.target?.closest?.('[data-tab]'))setTimeout(refreshUi,50)},true);
  setTimeout(()=>{renderStart();refreshUi()},300);setTimeout(refreshUi,3200);

  /* ---------- 9. Weighted Score (Data Driven Development Theory, v1.37 calibration) ---------- */
  // Each weight is the chance of saving from that zone, set so an ordinary shot is about 70% savable. Deflection and penalty stroke convert Myers & Daly's odds ratios (2.2x, 8x) to a chance of saving.
  const WS_W={dist:{green:.60,orange:.88,red:.97},angle:{green:.85,orange:.93,red:.98},place:{green:.65,orange:.92,red:.97},deflection:.75,stroke:.25};
  // Zone boundaries measured from the diagrams in the theory document. D map: goal centre (50,51), circle radius 44. Goal map interior x 12-88, y 9-51, backboard line y 38.
  const WS_ANG=[[0.2,90,90],[0.35,59.5,85],[0.45,47.5,76.5],[0.65,36,67],[0.8,31.5,63.5],[0.9,29.5,61.5],[1.3,27,59]];
  const WS_CORNER=[[0.09,0.14],[0.12,0.135],[0.15,0.128],[0.18,0.12],[0.21,0.107],[0.24,0.09],[0.27,0.07],[0.285,0.055],[0.30,0.04],[0.315,0.035]];
  const wsLerp=(t,v,i)=>{if(v<=t[0][0])return t[0][i];for(let k=1;k<t.length;k++)if(v<=t[k][0]){const a=t[k-1],b=t[k];return a[i]+(b[i]-a[i])*(v-a[0])/(b[0]-a[0])}return t[t.length-1][i]};
  const wsNum=v=>(v===null||v===undefined||v==='')?null:(Number.isFinite(Number(v))?Number(v):null);
  const wsHasD=s=>wsNum(s.dX)!==null&&wsNum(s.dY)!==null;
  const wsHasG=s=>wsNum(s.gX)!==null&&wsNum(s.gY)!==null;
  const wsIsStroke=s=>/penalty stroke/i.test([s.shotSituation,s.situation,s.type,s.shotType].join(' '));
  const wsIsDeflection=s=>/deflect|tip/i.test(String(s.type||s.shotType||s.shotCategory||''));
  // Own goals and empty-goal events never count against the goalkeeper.
  const wsCounts=s=>{if(/own goal/i.test(String(s.type||s.shotType||'')))return false;if(/empty goal/i.test(String(s.outnumbered||'')))return false;return true};
  const wsOnTarget=s=>wsCounts(s)&&outcomeOf(s)!=='Angle Closed Off';
  function wsDistZone(s){const r=Math.hypot(wsNum(s.dX)-50,wsNum(s.dY)-51)/44;return r<0.38?'green':r<0.70?'orange':'red'}
  function wsAngleZone(s){const x=wsNum(s.dX),y=wsNum(s.dY),r=Math.hypot(x-50,y-51)/44,up=51-y;const ang=up<=0?90:Math.atan2(Math.abs(x-50),up)*180/Math.PI;const g=wsLerp(WS_ANG,r,1),rd=wsLerp(WS_ANG,r,2);if(ang<=g)return 'green';if(rd<90&&ang>=rd)return 'red';return 'orange'}
  function wsPlaceZone(s){const xx=Math.max(0,Math.min(1,(wsNum(s.gX)-12)/76)),yy=Math.max(0,Math.min(1,(wsNum(s.gY)-9)/42)),edge=Math.min(xx,1-xx);
    if(yy>=0.69)return edge<0.035?'orange':'red';
    if(yy<0.09||edge<0.035)return 'green';
    if(yy<=0.315&&edge<wsLerp(WS_CORNER,yy,1))return 'green';
    return 'orange'}
  // Adjustment = the goalkeeper's chance of stopping the attempt (close to 1 = routine, close to 0 = nearly unstoppable).
  // Saves and goals use distance x angle x placement. Angles Closed Off have no goal placement, so only distance and angle (position) count.
  function wsShot(s){
    if(!wsCounts(s))return null;
    const o=outcomeOf(s),aco=o==='Angle Closed Off',stroke=wsIsStroke(s);
    if(!aco&&!wsHasG(s))return {missing:true,aco};
    if(!stroke&&!wsHasD(s))return {missing:true,aco};
    const pz=aco?null:wsPlaceZone(s),dz=stroke?null:wsDistZone(s),az=stroke?null:wsAngleZone(s),defl=!stroke&&wsIsDeflection(s);
    let adj=stroke?WS_W.stroke:WS_W.dist[dz]*WS_W.angle[az];if(!aco)adj*=WS_W.place[pz];if(defl)adj*=WS_W.deflection;
    const ok=o!=='Goal';
    return {adj,ok,save:o==='Save',aco,score:ok?1-adj:-adj,dz,az,pz,stroke,defl}}
  // mode 'save': saves and goals only (Save Rate Weighted Score). mode 'defence': saves, goals and Angles Closed Off (Defence Rate Weighted Score).
  function wsSummary(shots,mode){
    const def=mode==='defence',r={mode:def?'defence':'save',n:0,ok:0,saves:0,goals:0,aco:0,missing:0,total:0,expected:0,sum:0,list:[]};
    (shots||[]).forEach(s=>{const w=wsShot(s);if(!w)return;if(w.aco&&!def)return;r.total++;if(w.missing){r.missing++;return}r.n++;if(w.ok)r.ok++;if(w.save)r.saves++;else if(w.aco)r.aco++;else r.goals++;r.expected+=w.adj;r.sum+=w.score;r.list.push(Object.assign({shot:s},w))});
    r.score=r.n?r.sum/r.n*100:null;r.above=r.ok-r.expected;return r}
  const wsOf=(list,mode)=>{const l=mode==='defence'?list:list.filter(x=>!x.aco);return {n:l.length,score:l.length?l.reduce((a,x)=>a+x.score,0)/l.length*100:null,ok:l.filter(x=>x.ok).length,expected:l.reduce((a,x)=>a+x.adj,0)}};
  const wsFmt=r=>r&&r.score!==null&&r.score!==undefined?(r.score>0.05?'+':r.score<-0.05?'−':'')+Math.abs(r.score).toFixed(1)+'%':'N/C';
  const wsShotsOf=ms=>{const out=[];(ms||[]).forEach(m=>(m.shots||[]).forEach(s=>out.push(s)));return out};
  const WS_LABEL={save:'Save Rate Weighted Score',defence:'Defence Rate Weighted Score'};
  const wsNoteTxt=r=>r.n?r.n+' of '+r.total+(r.mode==='defence'?' records placed':' shots placed'):'needs heat map placements';
  const wsTitle={save:'Save Rate weighted for shot difficulty (distance, angle and placement). 0% = as expected; above 0 = saved more than expected.',defence:'Defence Rate weighted for difficulty. Saves and goals use distance, angle and placement; Angles Closed Off use distance and angle only. 0% = as expected.'};
  window.v136WeightedScore=function(ms,mode){return wsSummary(wsShotsOf(ms),mode)};
  window.v136WeightedShot=wsShot;

  // Stats tab: add both weighted score cards.
  let lastStatsWs=null;
  try{if(typeof window.calcStats==='function'&&!window.calcStats.v136){const oldCalc=window.calcStats;window.calcStats=function(ms){const st=oldCalc.apply(this,arguments);if(!st||typeof st!=='object'||!('Save Rate' in st))return st;const out={};Object.keys(st).forEach(k=>{out[k]=st[k];if(k==='Save Rate'){const sh=wsShotsOf(ms),a=wsSummary(sh,'save'),b=wsSummary(sh,'defence');lastStatsWs={save:a,defence:b};out[WS_LABEL.save]=wsFmt(a);out[WS_LABEL.defence]=wsFmt(b)}});return out};window.calcStats.v136=true}}catch(e){}

  // Reports: add both weighted score cards after Save Rate / Defence Rate in the summary.
  function reportMatchesNow(type,g){try{if(typeof window.v517SelectedReportMatches==='function'){const m=window.v517SelectedReportMatches();if(Array.isArray(m)&&m.length)return m}}catch(e){}return reportMatchesFor(type,g)}
  const cardLabel=c=>((c.querySelector('span')||c.querySelector('b')||{}).textContent||'').trim();
  function addWeightedCard(root,ms){
    if(root.querySelector('[data-v136-weighted]'))return;
    const cards=[...root.querySelectorAll('.stat')];const save=cards.find(c=>/^save rate$/i.test(cardLabel(c)));if(!save)return;
    const def=cards.find(c=>/^defence rate$/i.test(cardLabel(c)));let at=def&&def.parentElement===save.parentElement?def:save;
    const sh=wsShotsOf(ms);
    ['save','defence'].forEach(mode=>{const r=wsSummary(sh,mode),card=save.cloneNode(true);card.setAttribute('data-v136-weighted',mode);card.classList.remove('v514RateStat');
      const span=card.querySelector('span'),b=card.querySelector('b');
      if(span&&b){b.textContent=wsFmt(r);span.textContent=WS_LABEL[mode]}else if(b){b.textContent=WS_LABEL[mode];[...card.childNodes].filter(n=>n.nodeType===3).forEach(n=>n.remove());card.appendChild(document.createTextNode(wsFmt(r)))}
      card.title=wsTitle[mode];const small=document.createElement('small');small.className='v136WsNote';small.textContent=wsNoteTxt(r);card.appendChild(small);
      at.insertAdjacentElement('afterend',card);at=card})}
  function placeWeighted(){const root=byId('statsOutput');if(root){const cards=[...root.querySelectorAll('.stat')],lab=c=>((c.querySelector('span')||{}).textContent||'').trim();let at=cards.find(c=>lab(c)==='Defence Rate');
      ['save','defence'].forEach(mode=>{const w=cards.find(c=>lab(c)===WS_LABEL[mode]);if(!w)return;if(at&&at.nextElementSibling!==w&&at.parentElement===w.parentElement)at.insertAdjacentElement('afterend',w);if(lastStatsWs&&!w.querySelector('.v136WsNote')){const sm=document.createElement('small');sm.className='v136WsNote';sm.textContent=wsNoteTxt(lastStatsWs[mode]);w.appendChild(sm);w.title=wsTitle[mode]}at=w})}
    const rep=byId('reportOutput'),type=byId('v471ReportType')?.value||'';if(rep&&type!=='benchmark'&&rep.querySelector('.stat')&&!rep.querySelector('[data-v136-weighted],.v136WeightedReport')){const g=currentGoalie();if(g)addWeightedCard(rep,reportMatchesNow(type,g))}}
  window.v136AddWeightedCard=addWeightedCard;

  // Smaller "(saves/shots)" counts beside percentages.
  function styleCounts(){['statsOutput','reportOutput','v134Start'].forEach(id=>{const root=byId(id);if(!root)return;const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const hits=[];let n;while((n=w.nextNode())){if(n.parentElement&&n.parentElement.closest('svg,.v136Cnt,script,style'))continue;if(/\d%\s\(\d+\/\d+\)/.test(n.textContent))hits.push(n)}
    hits.forEach(n=>{const frag=document.createDocumentFragment();let rest=n.textContent;const re=/(\d+%)\s(\(\d+\/\d+\))/;let m;while((m=re.exec(rest))){frag.appendChild(document.createTextNode(rest.slice(0,m.index)+m[1]+' '));const sp=document.createElement('span');sp.className='v136Cnt';sp.textContent=m[2];frag.appendChild(sp);rest=rest.slice(m.index+m[0].length)}if(rest)frag.appendChild(document.createTextNode(rest));n.parentNode.replaceChild(frag,n)})})}
  const wsCss=document.createElement('style');
  wsCss.textContent=`.v136Cnt{font-size:.72em;font-weight:600;opacity:.75;white-space:nowrap}
  .v136WsNote{display:block;font-size:11px;color:#587386;margin-top:2px}
  #reportOutput .v136Explain{border:1px solid #c3d8e4;border-radius:10px;padding:10px 12px;background:#f7fbfd;margin:10px 0}
  #reportOutput .v136Pos{color:#16794a;font-weight:800}#reportOutput .v136Neg{color:#b42318;font-weight:800}
  #reportOutput .v136Zone{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
  #reportOutput .v136Trend{width:100%;max-width:920px;height:auto;border:1px solid #c3d8e4;border-radius:10px;background:#fff}
  #reportOutput .v136Key{display:inline-block;width:14px;height:4px;border-radius:2px;margin:0 6px 2px 12px;vertical-align:middle}
  @media print{#reportOutput .v136Zone,#reportOutput .v136Key,#reportOutput .v136Pos,#reportOutput .v136Neg{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
  document.head.appendChild(wsCss);

  // Weighted Score report.
  const WS_ZONE_NAMES={dist:{green:'Close range',orange:'Middle distance',red:'Long range'},angle:{green:'Central',orange:'Mid angle',red:'Wide angle'},place:{green:'Corners and edges',orange:'Body height',red:'Low, below the backboard line'}};
  const WS_ZONE_COL={green:'#1aab4d',orange:'#f39321',red:'#e0262c'};
  const wsCls=r=>r&&r.score!==null&&r.score!==undefined?(r.score>0.05?'v136Pos':r.score<-0.05?'v136Neg':''):'';
  const wsCell=r=>'<td class="'+wsCls(r)+'">'+wsFmt(r)+'</td>';
  const wsRate=(s,d)=>d?Math.round(s/d*100)+'% ('+s+'/'+d+')':'N/C';
  const wsSigned=v=>Math.abs(v)<0.05?'0.0':(v>0?'+':'−')+Math.abs(v).toFixed(1);
  // Group tables use every scored record. Save columns use saves and goals; defence columns add Angles Closed Off.
  function wsRowCells(g){const sv=g.filter(x=>x.save).length,ac=g.filter(x=>x.aco).length,gl=g.length-sv-ac,p=g.filter(x=>!x.missing);return '<td>'+g.length+'</td><td>'+sv+'</td><td>'+gl+'</td><td>'+ac+'</td><td>'+wsRate(sv,sv+gl)+'</td>'+wsCell(wsOf(p,'save'))+'<td>'+wsRate(sv+ac,g.length)+'</td>'+wsCell(wsOf(p,'defence'))}
  const wsRecords=shots=>shots.filter(wsCounts).map(s=>{const w=wsShot(s);if(w&&!w.missing)return Object.assign({shot:s},w);const o=outcomeOf(s);return {shot:s,missing:true,save:o==='Save',aco:o==='Angle Closed Off',ok:o!=='Goal'}});
  const WS_HEAD='<th>Records</th><th>Saves</th><th>Goals</th><th>Angles Closed Off</th><th>Save Rate</th><th>Save Rate Weighted</th><th>Defence Rate</th><th>Defence Rate Weighted</th>';
  function wsGroupTable(title,list,keyFn,order,label){
    const groups={};list.forEach(x=>{const k=keyFn(x);if(k==null)return;(groups[k]=groups[k]||[]).push(x)});
    const keys=(order||Object.keys(groups).sort()).filter(k=>groups[k]);if(!keys.length)return '';
    return '<h2>'+escHtml(title)+'</h2><div class="tableWrap"><table><tr><th>'+escHtml(label||'Area')+'</th>'+WS_HEAD+'</tr>'+keys.map(k=>'<tr><td>'+escHtml(k)+'</td>'+wsRowCells(groups[k])+'</tr>').join('')+'</table></div>'}
  function wsZoneTable(title,list,field,names,head){
    const groups={};list.forEach(x=>{const k=x[field];if(!k)return;(groups[k]=groups[k]||[]).push(x)});
    const keys=['green','orange','red'].filter(k=>groups[k]);if(!keys.length)return '';const wkey=field==='dz'?'dist':field==='az'?'angle':'place';
    if(field==='pz')return '<h2>'+escHtml(title)+'</h2><div class="tableWrap"><table><tr><th>'+escHtml(head)+'</th><th>Weight</th><th>Shots</th><th>Save Rate</th><th>Save Rate Weighted</th></tr>'+keys.map(k=>{const g=groups[k],sv=g.filter(x=>x.save).length;return '<tr><td><span class="v136Zone" style="background:'+WS_ZONE_COL[k]+'"></span>'+escHtml(names[k])+'</td><td>'+WS_W[wkey][k]+'</td><td>'+g.length+'</td><td>'+wsRate(sv,g.length)+'</td>'+wsCell(wsOf(g,'save'))+'</tr>'}).join('')+'</table></div><p class="v134Muted">Angles Closed Off have no goal placement, so they are not in this table.</p>';
    const strokes=list.filter(x=>x.stroke);
    return '<h2>'+escHtml(title)+'</h2><div class="tableWrap"><table><tr><th>'+escHtml(head)+'</th><th>Weight</th>'+WS_HEAD+'</tr>'+keys.map(k=>'<tr><td><span class="v136Zone" style="background:'+WS_ZONE_COL[k]+'"></span>'+escHtml(names[k])+'</td><td>'+WS_W[wkey][k]+'</td>'+wsRowCells(groups[k])+'</tr>').join('')+(strokes.length?'<tr><td>Penalty stroke (fixed spot)</td><td>'+WS_W.stroke+' for distance and angle</td>'+wsRowCells(strokes)+'</tr>':'')+'</table></div>'}
  function wsTrendSvg(rows){
    const pts=rows.filter(r=>r.s.score!==null||r.d.score!==null);if(pts.length<2)return '';
    const W=920,H=300,pL=56,pR=20,pT=22,pB=58,iW=W-pL-pR,iH=H-pT-pB;const vals=[];pts.forEach(p=>{if(p.s.score!==null)vals.push(p.s.score);if(p.d.score!==null)vals.push(p.d.score)});let lo=Math.min(-10,...vals),hi=Math.max(10,...vals);lo=Math.floor(lo/10)*10;hi=Math.ceil(hi/10)*10;
    const X=i=>pL+i*iW/(pts.length-1),Y=v=>pT+(hi-v)/(hi-lo)*iH;let g='';
    for(let v=lo;v<=hi;v+=10){g+='<line x1="'+pL+'" x2="'+(W-pR)+'" y1="'+Y(v)+'" y2="'+Y(v)+'" stroke="'+(v===0?'#17374e':'#dbe7ee')+'" stroke-width="'+(v===0?1.6:1)+'"/><text x="'+(pL-8)+'" y="'+(Y(v)+4)+'" font-size="12" text-anchor="end" fill="#4b6475">'+(v>0?'+':'')+v+'%</text>'}
    const line=(key,col,dash)=>{const p=pts.map((x,i)=>x[key].score===null?null:X(i)+','+Y(x[key].score)).filter(Boolean);return p.length>1?'<polyline fill="none" stroke="'+col+'" stroke-width="3"'+(dash?' stroke-dasharray="7 5"':'')+' points="'+p.join(' ')+'"/>':''};
    g+=line('d','#d97706',true)+line('s','#087fa4',false);
    g+=pts.map((p,i)=>(p.d.score!==null?'<circle cx="'+X(i)+'" cy="'+Y(p.d.score)+'" r="4" fill="#d97706"><title>'+escHtml(p.label)+': Defence Rate Weighted '+wsFmt(p.d)+'</title></circle>':'')+(p.s.score!==null?'<circle cx="'+X(i)+'" cy="'+Y(p.s.score)+'" r="5" fill="#087fa4"><title>'+escHtml(p.label)+': Save Rate Weighted '+wsFmt(p.s)+'</title></circle>':'')+'<text x="'+X(i)+'" y="'+(H-pB+18)+'" font-size="11" text-anchor="middle" fill="#4b6475">'+escHtml(p.short)+'</text>').join('');
    return '<h2>Weighted Scores by Match</h2><p class="v134Muted"><span class="v136Key" style="background:#087fa4"></span>Save Rate Weighted Score<span class="v136Key" style="background:#d97706"></span>Defence Rate Weighted Score (dashed)</p><svg class="v136Trend" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Weighted scores by match">'+g+'<text x="'+pL+'" y="'+(H-12)+'" font-size="12" fill="#4b6475">Above the dark line = better than expected for the attempts faced.</text></svg>'}
  function wsMatchRange(g){const all=filterReportList(g.matches||[]).slice().sort(asc);if(!all.length)return [];let si=all.findIndex(m=>String(m.id)===String(byId('v136WsStart')?.value)),ei=all.findIndex(m=>String(m.id)===String(byId('v136WsEnd')?.value));if(si<0)si=0;if(ei<0)ei=all.length-1;if(si>ei){const t=si;si=ei;ei=t}return all.slice(si,ei+1)}
  function wsFields(){const w=byId('v471ReportFields'),g=currentGoalie();if(!w)return;const h=byId('v471ReportHint');if(h)h.textContent='Select the first and last match to include in the Weighted Score Report.';const ms=g?filterReportList(g.matches||[]).slice().sort(asc):[];const opts=ms.map(m=>'<option value="'+escHtml(m.id)+'">'+escHtml(dateOf(m)+' - '+(m.homeTeam||'')+' VS '+(m.opponentTeam||m.opponent||''))+'</option>').join('');
    w.innerHTML='<div class="v472RangeGrid"><div><label for="v136WsStart">First Match to Include</label><select id="v136WsStart">'+opts+'</select></div><div><label for="v136WsEnd">Last Match to Include</label><select id="v136WsEnd">'+opts+'</select></div></div>';const end=byId('v136WsEnd');if(end&&ms.length)end.value=ms[ms.length-1].id}
  function buildWeightedReport(){
    const g=currentGoalie(),root=byId('reportOutput');if(!root)return;if(!g){root.innerHTML='<p class="v134Muted">Select a goalkeeper first.</p>';return}
    const ms=wsMatchRange(g),shots=wsShotsOf(ms),rs=wsSummary(shots,'save'),rd=wsSummary(shots,'defence'),list=rd.list;
    const counted=shots.filter(wsCounts),sv=counted.filter(s=>outcomeOf(s)==='Save').length,ac=counted.filter(s=>outcomeOf(s)==='Angle Closed Off').length,on=counted.filter(wsOnTarget).length;
    const age=(()=>{try{return typeof ageGroup==='function'?ageGroup(g):(g.ageGroup||'')}catch(e){return ''}})();
    const range=ms.length?dateOf(ms[0])+' to '+dateOf(ms[ms.length-1]):'No matches selected';
    let h='<h1>Weighted Score Report</h1><p><b>'+escHtml(g.name||'')+'</b>'+(age?' • '+escHtml(age):'')+(g.gender?' • '+escHtml(g.gender):'')+'<br>'+ms.length+' match(es) · '+escHtml(range)+'<br>Generated: '+escHtml(new Date().toLocaleString())+'</p>';
    h+='<div class="v136Explain"><b>What this shows.</b> Save Rate and Defence Rate treat every attempt the same. The weighted scores give each attempt a difficulty from where it was taken (distance and angle) and, for shots on target, where it went in the goal. A save on a hard shot earns far more than a save on a routine shot, and a goal from a routine shot costs far more than a goal from a hard one. The <b>Save Rate Weighted Score</b> uses saves and goals. The <b>Defence Rate Weighted Score</b> also counts Angles Closed Off, weighted by the attacker\'s position and angle only. <b>0%</b> means exactly as expected for the attempts faced; above 0 means better. Read them with Save Rate and Defence Rate, and look at the trend over several matches.</div>';
    const card=(v,l,cls)=>'<div class="stat"><b'+(cls?' class="'+cls+'"':'')+'>'+v+'</b><span>'+l+'</span></div>';
    h+='<h2>Summary</h2><div class="statgrid">'+card(wsFmt(rs),WS_LABEL.save,wsCls(rs))+card(wsFmt(rd),WS_LABEL.defence,wsCls(rd))+card(wsRate(sv,on),'Save Rate')+card(wsRate(sv+ac,counted.length),'Defence Rate')+card(rs.n?wsSigned(rs.above):'N/C','Saves Above Expected')+card(rs.n?rs.expected.toFixed(1)+' of '+rs.n:'N/C','Expected Saves')+card(rs.n?Math.round((1-rs.expected/rs.n)*100)+'%':'N/C','Average Shot Difficulty')+card(rs.n+' of '+rs.total,'Shots on Target Scored')+card(rd.aco+' of '+ac,'Angles Closed Off Scored')+'</div>';
    if(rd.missing)h+='<p class="v134Muted">'+rd.missing+' record'+(rd.missing===1?' is':'s are')+' missing a heat map placement and left out of the weighted scores (shots on target need the D and goal box placements; Angles Closed Off need the D placement). Add placements in the Heat Map Editor to include them.</p>';
    if(!rd.n){h+='<p>No records with heat map placements in this range yet.</p>'}
    else{
      const dateCount={};ms.forEach(m=>{const d=dateOf(m);dateCount[d]=(dateCount[d]||0)+1});const dateSeen={};
      const rows=ms.filter(m=>(m.shots||[]).some(wsCounts)).map(m=>{const dt=dateOf(m);dateSeen[dt]=(dateSeen[dt]||0)+1;const short=(dt.slice(5)||'M')+(dateCount[dt]>1?' ('+dateSeen[dt]+')':'');const sh=m.shots||[],c=sh.filter(wsCounts),s2=c.filter(s=>outcomeOf(s)==='Save').length,a2=c.filter(s=>outcomeOf(s)==='Angle Closed Off').length;return {m,s:wsSummary(sh,'save'),d:wsSummary(sh,'defence'),sv:s2,ac:a2,on:c.length-a2,all:c.length,label:dt+' vs '+(m.opponentTeam||m.opponent||''),short}});
      const noShots=ms.length-rows.length;
      h+=wsTrendSvg(rows);
      h+='<h2>Match by Match</h2><div class="tableWrap"><table><tr><th>Match</th><th>Save Rate</th><th>Save Rate Weighted</th><th>Defence Rate</th><th>Defence Rate Weighted</th><th>Saves Above Expected</th></tr>'+rows.map(x=>'<tr><td>'+escHtml(x.label)+'</td><td>'+wsRate(x.sv,x.on)+'</td>'+wsCell(x.s)+'<td>'+wsRate(x.sv+x.ac,x.all)+'</td>'+wsCell(x.d)+'<td>'+(x.s.n?wsSigned(x.s.above):'–')+'</td></tr>').join('')+'</table></div>';
      if(noShots)h+='<p class="v134Muted">'+noShots+' match'+(noShots===1?' has':'es have')+' no shots recorded and '+(noShots===1?'is':'are')+' not listed.</p>';
      const band=x=>x.adj>=0.75?'Routine':x.adj>=0.5?'Moderate':'Difficult';const recs=wsRecords(shots);
      h+=wsGroupTable('Attempt Difficulty',list,band,['Difficult','Moderate','Routine'],'Difficulty');
      h+='<p class="v134Muted">Difficult: under a 50% expected chance of stopping it. Moderate: 50–75%. Routine: 75% or more. The difficulty, distance, angle and placement tables only include records with heat map placements.</p>';
      h+=wsZoneTable('Distance (D heat map)',list,'dz',WS_ZONE_NAMES.dist,'Distance zone');
      h+=wsZoneTable('Angle (D heat map)',list,'az',WS_ZONE_NAMES.angle,'Angle zone');
      h+=wsZoneTable('Placement (goal box heat map)',list.filter(x=>!x.aco),'pz',WS_ZONE_NAMES.place,'Placement zone');
      h+=wsGroupTable('Shot Situation',recs,x=>x.shot.shotSituation||x.shot.situation||'Normal Game Play',null,'Situation');
      h+=wsGroupTable('Shot Type',recs,x=>x.shot.type||x.shot.shotType||'1st Shot',null,'Shot type');
      if(rd.missing)h+='<p class="v134Muted">Shot Situation and Shot Type count every record, so their rates match the Save Rate and Defence Rate above; the weighted columns use only the records with placements.</p>';
      const soft=list.filter(x=>!x.ok&&x.adj>=0.75),great=list.filter(x=>x.save&&x.adj<0.5),acoHard=list.filter(x=>x.aco&&(x.dz==='green'||x.az==='green'||x.stroke));
      const notes=[];
      if(soft.length)notes.push('<div class="v134Insight warn"><b>Goals from routine shots</b>'+soft.length+' goal'+(soft.length===1?' was':'s were')+' conceded from routine shots (75% or better expected chance of a save). Review these on video first: they cost the most.</div>');
      if(great.length)notes.push('<div class="v134Insight good"><b>Saves on difficult shots</b>'+great.length+' save'+(great.length===1?' was':'s were')+' made on difficult shots (under 50% expected chance). These lift the weighted scores above the plain rates.</div>');
      if(acoHard.length)notes.push('<div class="v134Insight good"><b>Angles closed off from dangerous positions</b>'+acoHard.length+' angle'+(acoHard.length===1?' was':'s were')+' closed off from close or central positions. These add to the Defence Rate Weighted Score.</div>');
      const sr=on?sv/on*100:null;if(sr!==null&&rs.score!==null){if(rs.score>=5&&sr<70)notes.push('<div class="v134Insight good"><b>Save Rate understates performance</b>The Save Rate is modest, but the goalkeeper is saving more than expected for the difficulty of shots faced. Strong opposition or a defence allowing quality chances is the likely reason.</div>');else if(rs.score<=-5&&sr>=70)notes.push('<div class="v134Insight warn"><b>Save Rate flatters performance</b>The Save Rate looks good, but many of the shots faced were routine. Goals conceded from easier chances are pulling the weighted score below expected.</div>')}
      if(notes.length)h+='<section class="v134Section"><h2>Coaching Notes</h2>'+notes.join('')+'</section>';
      h+='<h2>How the weighted scores are worked out</h2><p class="v134Muted">Each attempt gets an adjustment, its chance of being stopped: distance zone (close 0.60, middle 0.88, long 0.97) × angle zone (central 0.85, mid 0.93, wide 0.98) × placement zone (corners and edges 0.65, body height 0.92, low 0.97). An ordinary shot comes out at about 0.70. Angles Closed Off have no goal placement, so they use distance × angle only. A deflection or tip-in multiplies by 0.75. A penalty stroke uses 0.25 in place of distance and angle; placement still applies. A save or an angle closed off scores 1 − adjustment and a goal scores − adjustment. Save Rate Weighted Score = the total for saves and goals ÷ the number of shots on target scored; this equals saves above expected per shot. Defence Rate Weighted Score = the total for saves, goals and Angles Closed Off ÷ the number of records scored. Own goals and empty-goal events are left out. Deflection and penalty-stroke values convert Myers and Daly (2022) odds; zone weights are the author’s estimates.</p>';
    }
    const logo=INDOOR?'assets/indoor-hockey-banner-v1-0.png':'assets/field-hockey-banner-v467.png';
    root.style.display='block';
    root.innerHTML='<table class="reportPrintTable"><thead class="reportPrintHeader"><tr><td><img class="reportHeaderLogo" src="'+logo+'" alt="Hockey Goalie Stats"></td></tr></thead><tbody class="reportPrintBody"><tr><td><div class="reportMainContent v136WeightedReport">'+h+'</div></td></tr></tbody></table>';root.dataset.v504Applied='1';
    try{root.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){}}
  window.buildWeightedScoreReportV136=buildWeightedReport;
  function installWeightedReport(){
    const sel=byId('v471ReportType');if(!sel)return;
    if(!sel.querySelector('option[value="weighted"]')){const o=document.createElement('option');o.value='weighted';o.textContent='Weighted Score Report';const after=sel.querySelector('option[value="ddd"]');if(after)after.insertAdjacentElement('afterend',o);else sel.appendChild(o)}
    if(!window.updateV471ReportFields||window.updateV471ReportFields.v136)return;
    const oldU=window.updateV471ReportFields,oldG=window.generateV471SelectedReport;
    window.updateV471ReportFields=function(){if(byId('v471ReportType')?.value==='weighted')return wsFields();return oldU.apply(this,arguments)};window.updateV471ReportFields.v136=true;
    window.generateV471SelectedReport=function(){if(byId('v471ReportType')?.value==='weighted')return buildWeightedReport();return oldG.apply(this,arguments)};
    REPORT_CONTROLS.push('v136WsStart','v136WsEnd');
    if(sel.value==='weighted')wsFields()}
  installWeightedReport();setTimeout(installWeightedReport,800);

  window.v134={INDOOR,byId,escHtml,formatOf,currentGoalie,dbRef,asc,desc,reportFilter};
})();
