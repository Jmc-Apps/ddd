(() => {
  'use strict';

  const STORAGE_KEY = 'hgt-data-driven-selection-v1';
  const SHARED_GOALIE_KEY = 'hockeyGoalieStatsV3';
  const CATEGORIES = ['Technical', 'Physical', 'Tactical', 'Communication'];
  const WEIGHT_KEYS = ['Performance', ...CATEGORIES];
  const SMOCKS = ['White', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Pink', 'Black'];
  const SMOCK_COLOURS = {White:'#f4f6f8',Red:'#d83a48',Blue:'#2389dc',Green:'#16a36b',Yellow:'#f0c93d',Orange:'#ef8d2f',Pink:'#e56aa4',Black:'#17232e'};
  const SHOT_TYPES = ['First Shot','Rebound Shot','Deflection','Tip','Other'];
  const SITUATIONS = ['Open Play','Penalty Corner','Penalty Stroke','1v1','8Sec 1v1','Outnumbered'];

  const defaultState = () => ({
    trial: {name:'', team:'', ageGroup:'U16', level:'School', tier:'A/1st'},
    days: [],
    drills: [],
    goalies: [],
    events: [],
    ratings: [],
    timers: {},
    stationSelections: {},
    weights: {Performance:20,Technical:20,Physical:20,Tactical:20,Communication:20},
    reportNotes: '',
    finalDecision: 'Pending'
  });

  let state = loadState();
  let currentPage = 'dashboard';
  let activeTimers = {};
  let timerTicker = null;
  let deferredInstall = null;
  let currentRatingContext = null;
  let toastTimer = null;

  const $ = id => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const dayLabel = date => date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : 'No date';
  const formatTime = ms => { const total = Math.floor(ms / 1000); const h = Math.floor(total/3600); const m = Math.floor((total%3600)/60); const s = total%60; return h ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
  const pct = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : 'N/C';
  const average = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;

  function loadState(){
    try { return {...defaultState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')}; }
    catch { return defaultState(); }
  }

  function saveState(message='Saved locally'){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      $('saveStatus').textContent = message;
      setTimeout(() => $('saveStatus').textContent = 'Saved locally', 1300);
    } catch {
      showToast('This device could not save the latest change. Remove large photos and try again.');
    }
  }

  function sharedGoalies(){
    try { const data=JSON.parse(localStorage.getItem(SHARED_GOALIE_KEY)||'{}'); return Array.isArray(data.goalies)?data.goalies:[]; }
    catch { return []; }
  }

  function refreshLinkedGoalies(){
    const shared=new Map(sharedGoalies().map(g=>[g.id,g]));let changed=false;
    state.goalies.forEach(g=>{if(!g.sharedGoalieId)return;const source=shared.get(g.sharedGoalieId);if(!source)return;['name','dob','gender'].forEach(key=>{if(g[key]!==source[key]){g[key]=source[key];changed=true}})});
    if(changed)saveState();
  }

  function openSharedGoalieDialog(){
    const available=sharedGoalies().filter(g=>!state.goalies.some(existing=>existing.sharedGoalieId===g.id||existing.id===g.id));
    $('sharedGoalieSelect').innerHTML=available.length?optionList(available,''):'<option value="">No unused shared goalkeepers</option>';
    $('sharedGoalieForm').querySelector('[type="submit"]').disabled=!available.length;
    $('sharedGoalieDialog').showModal();
  }

  function addSharedGoalieToRoster(event){
    event.preventDefault();const source=sharedGoalies().find(g=>g.id===$('sharedGoalieSelect').value);if(!source)return;
    const level=source.teamProfiles?.find(t=>t.level&&t.level!=='Not specified')?.level||'School';
    state.goalies.push({id:source.id,sharedGoalieId:source.id,source:'shared',name:source.name||'Unnamed Goalie',dob:source.dob||'',gender:source.gender||'Male',experience:'',preferredLevel:level,photo:'',smocks:{}});
    saveState();$('sharedGoalieDialog').close();renderRoster();showToast(`${source.name} added from the shared directory.`);
  }

  function showToast(message){
    const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>toast.classList.remove('show'),2600);
  }

  function switchPage(page){
    stopAllRunningTimers();
    currentPage = page;
    document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
    document.querySelectorAll('.nav-button').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    $('mainContent').scrollTop = 0;
    renderPage(page);
  }

  function renderPage(page){
    if(page==='dashboard') renderDashboard();
    if(page==='setup') renderSetup();
    if(page==='roster') renderRoster();
    if(page==='recording') renderRecording();
    if(page==='video') renderVideoReview();
    if(page==='comparison') renderComparison();
    if(page==='reports') renderReport();
  }

  function optionList(items, selected, allLabel){
    const head = allLabel !== undefined ? `<option value="all">${esc(allLabel)}</option>` : '';
    return head + items.map(item => `<option value="${esc(item.value ?? item.id ?? item)}" ${(item.value ?? item.id ?? item)===selected?'selected':''}>${esc(item.label ?? item.name ?? item)}</option>`).join('');
  }

  function trialReady(){ return Boolean(state.trial.name && state.trial.team && state.days.length && state.drills.length); }

  function getEvents(filters={}){
    return state.events.filter(event =>
      (!filters.dayId || filters.dayId==='all' || event.dayId===filters.dayId) &&
      (!filters.drillId || filters.drillId==='all' || event.drillId===filters.drillId) &&
      (!filters.shotType || filters.shotType==='all' || event.shotType===filters.shotType) &&
      (!filters.situation || filters.situation==='all' || event.situation===filters.situation) &&
      (!filters.goalieId || event.goalieId===filters.goalieId)
    );
  }

  function goalieStats(goalieId, filters={}){
    if (!goalieId) return {events:[],saves:0,goals:0,aco:0,attempts:0,rebounds:0,dangerous:0,saveRate:0,defenceRate:0,category:Object.fromEntries(CATEGORIES.map(cat=>[cat,0])),ratingCount:0};
    const events = getEvents({...filters,goalieId});
    const saves = events.filter(e=>e.outcome==='Save').length;
    const goals = events.filter(e=>e.outcome==='Goal').length;
    const aco = events.filter(e=>e.outcome==='Angle Closed Off').length;
    const rebounds = events.filter(e=>e.rebound).length;
    const dangerous = events.filter(e=>e.dangerousRebound).length;
    const ratings = state.ratings.filter(r => r.goalieId===goalieId && (!filters.dayId || filters.dayId==='all' || r.dayId===filters.dayId) && (!filters.drillId || filters.drillId==='all' || r.drillId===filters.drillId));
    const category = Object.fromEntries(CATEGORIES.map(cat => [cat, average(ratings.map(r=>Number(r.values[cat])||0).filter(Boolean))]));
    return {events,saves,goals,aco,attempts:events.length,rebounds,dangerous,
      saveRate:(saves+goals)?saves/(saves+goals)*100:0,
      defenceRate:events.length?(saves+aco)/events.length*100:0,
      category, ratingCount:ratings.length};
  }

  function totalTimeFor(goalieId){
    return Object.entries(state.timers).filter(([key])=>key.endsWith(`|${goalieId}`)).reduce((sum,[,value])=>sum+Number(value||0),0);
  }

  function renderDashboard(){
    const all = getEvents();
    const saves = all.filter(e=>e.outcome==='Save').length, goals=all.filter(e=>e.outcome==='Goal').length, aco=all.filter(e=>e.outcome==='Angle Closed Off').length;
    const metrics = [
      ['Roster',state.goalies.length,'goalkeepers'],['Scheduled',state.drills.length,'trial sections'],['Recorded',all.length,'total attempts'],['Defence rate',all.length?pct((saves+aco)/all.length*100):'N/C','combined trial']
    ];
    $('dashboardMetrics').innerHTML = metrics.map(m=>`<article class="metric-card"><span class="metric-label">${m[0]}</span><strong class="metric-value">${m[1]}</strong><span class="metric-sub">${m[2]}</span></article>`).join('');
    $('setupNotice').classList.toggle('hidden',trialReady());
    $('dashboardTrialName').textContent = state.trial.name || 'No trial configured';
    $('trialStatePill').textContent = trialReady() ? 'Ready' : 'Setup required';
    $('trialStatePill').className = `pill ${trialReady()?'success':'warning'}`;
    $('dashboardTrialDetails').innerHTML = [
      ['Team',state.trial.team||'—'],['Classification',`${state.trial.ageGroup} · ${state.trial.level} · ${state.trial.tier}`],['Trial days',state.days.length],['Total goalkeeper time',formatTime(state.goalies.reduce((sum,g)=>sum+totalTimeFor(g.id),0))]
    ].map(([label,value])=>`<div class="detail-item"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('');
    $('dashboardDrills').innerHTML = state.drills.length ? state.drills.map(drill=>{
      const day=state.days.find(d=>d.id===drill.dayId); const count=state.events.filter(e=>e.drillId===drill.id).length; const total=drill.target*Math.max(1,state.goalies.length); const progress=Math.min(100,total?count/total*100:0);
      return `<div class="stack-item"><div class="stack-item-main"><strong>${esc(drill.name)}</strong><span>${esc(dayLabel(day?.date))} · ${count}/${total} recorded</span></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div></div>`;
    }).join('') : '<div class="empty-state">No drills have been scheduled yet.</div>';
    $('dashboardRoster').innerHTML = state.goalies.length ? state.goalies.map(goalie=>goalieCard(goalie,false)).join('') : '<div class="empty-state">Add candidates to create the Trials Roster.</div>';
  }

  function renderSetup(){
    $('trialName').value=state.trial.name; $('teamName').value=state.trial.team; $('ageGroup').value=state.trial.ageGroup; $('teamLevel').value=state.trial.level; $('teamTier').value=state.trial.tier;
    const dayOptions = optionList(state.days.map(d=>({id:d.id,name:dayLabel(d.date)})));
    $('drillDay').innerHTML = dayOptions || '<option value="">Add a trial day first</option>';
    $('trialDaysList').innerHTML = state.days.length ? state.days.map((day,index)=>`<div class="stack-item"><div class="stack-item-main"><strong>Trial Day ${index+1}</strong><span>${esc(dayLabel(day.date))}</span></div><button class="mini-button danger" data-delete-day="${day.id}">Remove</button></div>`).join('') : '<div class="empty-state">No trial days added.</div>';
    $('scheduledDrills').innerHTML = state.drills.length ? `<table class="data-table"><thead><tr><th>Day</th><th>Drill / section</th><th>Target per goalie</th><th>Recorded</th><th></th></tr></thead><tbody>${state.drills.map(drill=>{const day=state.days.find(d=>d.id===drill.dayId);const count=state.events.filter(e=>e.drillId===drill.id).length;return `<tr><td>${esc(dayLabel(day?.date))}</td><td><strong>${esc(drill.name)}</strong></td><td>${drill.target}</td><td>${count}</td><td><div class="table-actions"><button class="mini-button danger" data-delete-drill="${drill.id}">Remove</button></div></td></tr>`}).join('')}</tbody></table>` : '<div class="empty-state">Choose a trial day, drill and equal attempt target to build the programme.</div>';
    document.querySelectorAll('[data-delete-day]').forEach(button=>button.addEventListener('click',()=>deleteDay(button.dataset.deleteDay)));
    document.querySelectorAll('[data-delete-drill]').forEach(button=>button.addEventListener('click',()=>deleteDrill(button.dataset.deleteDrill)));
  }

  function saveSetup(){
    state.trial={name:$('trialName').value.trim(),team:$('teamName').value.trim(),ageGroup:$('ageGroup').value,level:$('teamLevel').value,tier:$('teamTier').value};
    saveState(); renderSetup(); showToast('Trial setup saved.');
  }

  function addDay(event){
    event.preventDefault(); const date=$('trialDayDate').value; if(!date){showToast('Choose a date first.');return;}
    if(state.days.some(d=>d.date===date)){showToast('That trial day is already scheduled.');return;}
    state.days.push({id:uid(),date}); state.days.sort((a,b)=>a.date.localeCompare(b.date)); saveState(); renderSetup();
  }

  function addDrill(event){
    event.preventDefault(); if(!state.days.length){showToast('Add a trial day first.');return;}
    const target=Math.max(1,Number($('drillTarget').value)||1);
    state.drills.push({id:uid(),dayId:$('drillDay').value,name:$('drillType').value,target}); saveState(); renderSetup(); showToast('Trial section scheduled.');
  }

  function confirmationCode(action){
    const code=String(Math.floor(100000+Math.random()*900000));
    const entered=prompt(`${action}\n\nEnter this six-digit confirmation code: ${code}`);
    return entered===code;
  }

  function deleteDay(id){
    const day=state.days.find(d=>d.id===id); if(!day || !confirmationCode(`Remove ${dayLabel(day.date)} and its scheduled sections and recorded data?`)) return;
    const drills=state.drills.filter(d=>d.dayId===id).map(d=>d.id); state.days=state.days.filter(d=>d.id!==id); state.drills=state.drills.filter(d=>d.dayId!==id); state.events=state.events.filter(e=>e.dayId!==id); state.ratings=state.ratings.filter(r=>r.dayId!==id); Object.keys(state.timers).filter(k=>k.startsWith(`${id}|`)).forEach(k=>delete state.timers[k]); saveState(); renderSetup();
  }

  function deleteDrill(id){
    const drill=state.drills.find(d=>d.id===id); if(!drill || !confirmationCode(`Remove ${drill.name} and its recorded data?`)) return;
    state.drills=state.drills.filter(d=>d.id!==id); state.events=state.events.filter(e=>e.drillId!==id); state.ratings=state.ratings.filter(r=>r.drillId!==id); Object.keys(state.timers).filter(k=>k.includes(`|${id}|`)).forEach(k=>delete state.timers[k]); saveState(); renderSetup();
  }

  async function photoData(file){
    if(!file) return '';
    const source=await createImageBitmap(file); const max=320; const scale=Math.min(1,max/Math.max(source.width,source.height)); const canvas=document.createElement('canvas'); canvas.width=Math.round(source.width*scale); canvas.height=Math.round(source.height*scale); canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height); return canvas.toDataURL('image/jpeg',.78);
  }

  async function addGoalie(event){
    event.preventDefault();
    const name=$('goalieName').value.trim(); if(!name) return;
    const photo=await photoData($('goaliePhoto').files[0]);
    state.goalies.push({id:uid(),source:'trial_only',name,dob:$('goalieDob').value,gender:$('goalieGender').value,experience:$('goalieExperience').value.trim(),preferredLevel:$('goaliePreferredLevel').value,photo,smocks:{}});
    saveState(); $('goalieDialog').close(); $('goalieForm').reset(); renderRoster(); showToast(`${name} added to the Trials Roster.`);
  }

  function initials(name){return name.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'GK';}
  function goalieCard(goalie,editable=true){
    const dayId=$('rosterDayFilter')?.value||state.days[0]?.id||''; const smock=goalie.smocks?.[dayId]||'White';
    return `<article class="goalie-card"><div class="goalie-card-head">${goalie.photo?`<img class="goalie-photo" src="${goalie.photo}" alt="">`:`<div class="goalie-initials">${esc(initials(goalie.name))}</div>`}<div><h3>${esc(goalie.name)}</h3><p>${esc(goalie.gender)} · ${esc(goalie.preferredLevel)} · ${goalie.sharedGoalieId?'Shared goalie':'Trial only'}</p></div></div><div class="goalie-card-body"><p><strong>DOB:</strong> ${esc(dayLabel(goalie.dob))}</p><p><strong>Experience:</strong> ${esc(goalie.experience||'Not recorded')}</p>${editable?`<label class="field"><span>Smock colour this day</span><div class="smock-control"><i class="smock-dot" style="background:${SMOCK_COLOURS[smock]}"></i><select data-smock-goalie="${goalie.id}" data-day="${dayId}">${optionList(SMOCKS.map(x=>({value:x,label:x})),smock)}</select></div></label>`:''}</div>${editable?`<div class="goalie-actions"><button class="button ghost" data-open-rating="${goalie.id}">Add review</button><button class="button danger" data-delete-goalie="${goalie.id}">Remove</button></div>`:''}</article>`;
  }

  function renderRoster(){
    const selected=$('rosterDayFilter').value||state.days[0]?.id||'';
    $('rosterDayFilter').innerHTML=state.days.length?optionList(state.days.map((d,i)=>({id:d.id,name:`Day ${i+1} · ${dayLabel(d.date)}`})),selected):'<option value="">Add a trial day first</option>';
    $('rosterGrid').innerHTML=state.goalies.length?state.goalies.map(g=>goalieCard(g,true)).join(''):'<div class="empty-state">No goalkeepers are on the Trials Roster yet.</div>';
    document.querySelectorAll('[data-smock-goalie]').forEach(select=>select.addEventListener('change',()=>{const goalie=state.goalies.find(g=>g.id===select.dataset.smockGoalie); if(!goalie||!select.dataset.day)return;goalie.smocks=goalie.smocks||{};goalie.smocks[select.dataset.day]=select.value;saveState();renderRoster();}));
    document.querySelectorAll('[data-delete-goalie]').forEach(button=>button.addEventListener('click',()=>deleteGoalie(button.dataset.deleteGoalie)));
    document.querySelectorAll('[data-open-rating]').forEach(button=>button.addEventListener('click',()=>{const dayId=$('rosterDayFilter').value;const drill=state.drills.find(d=>d.dayId===dayId);openRating(button.dataset.openRating,dayId,drill?.id);}));
  }

  function deleteGoalie(id){
    const goalie=state.goalies.find(g=>g.id===id); if(!goalie||!confirmationCode(`Remove ${goalie.name} and all of this goalkeeper’s trial data?`))return;
    state.goalies=state.goalies.filter(g=>g.id!==id); state.events=state.events.filter(e=>e.goalieId!==id); state.ratings=state.ratings.filter(r=>r.goalieId!==id); Object.keys(state.timers).filter(k=>k.endsWith(`|${id}`)).forEach(k=>delete state.timers[k]); saveState();renderRoster();
  }

  function drillOptionsForDay(dayId){return state.drills.filter(d=>d.dayId===dayId)}
  function ensureSelect(select,items,emptyLabel,preferred){
    const current=preferred||select.value; select.innerHTML=items.length?optionList(items,current):`<option value="">${emptyLabel}</option>`; if(items.length&&!items.some(i=>(i.id??i.value)===select.value))select.value=items[0].id??items[0].value;
  }

  function renderRecording(){
    const daySel=$('recordingDay'); ensureSelect(daySel,state.days.map((d,i)=>({id:d.id,name:`Day ${i+1} · ${dayLabel(d.date)}`})),'Add a trial day first');
    const drills=drillOptionsForDay(daySel.value); ensureSelect($('recordingDrill'),drills,'Schedule a section first');
    const drill=state.drills.find(d=>d.id===$('recordingDrill').value); const lanes=drill?.name==='Match Situation'?2:1;
    $('recordingModePill').textContent=drill?`${drill.name} · ${drill.target} each`:'Select a section';
    $('recordingStations').innerHTML=drill?Array.from({length:lanes},(_,i)=>stationMarkup(i,daySel.value,drill.id,true)).join(''):'<div class="empty-state">Schedule a trial day and section before recording.</div>';
    bindStationControls($('recordingStations'),daySel.value,drill?.id,true);
    renderTimeline(daySel.value,drill?.id);
  }

  function stationKey(dayId,drillId,lane){return `${dayId}|${drillId}|${lane}`}
  function timerKey(dayId,drillId,goalieId){return `${dayId}|${drillId}|${goalieId}`}
  function selectedGoalie(dayId,drillId,lane){
    const key=stationKey(dayId,drillId,lane); if(!state.stationSelections[key]||!state.goalies.some(g=>g.id===state.stationSelections[key])) state.stationSelections[key]=state.goalies[lane]?.id||state.goalies[0]?.id||''; return state.stationSelections[key];
  }

  function stationMarkup(lane,dayId,drillId,live){
    const goalieId=selectedGoalie(dayId,drillId,lane); const goalie=state.goalies.find(g=>g.id===goalieId); const stats=goalie?goalieStats(goalieId,{dayId,drillId}):goalieStats('',{dayId,drillId}); const key=timerKey(dayId,drillId,goalieId); const elapsed=(state.timers[key]||0)+(activeTimers[lane]?.key===key?Date.now()-activeTimers[lane].startedAt:0);
    const smock=goalie?.smocks?.[dayId]||'White';
    return `<article class="station-card" data-lane="${lane}"><div class="station-top"><span class="eyebrow">${live?'Recording':'Video recording'} · ${lane?'Goal B':'Goal A'}</span><select class="station-goalie" aria-label="Goalkeeper for ${lane?'Goal B':'Goal A'}">${state.goalies.length?optionList(state.goalies,goalieId):'<option value="">Add goalkeepers first</option>'}</select>${goalie?`<div class="station-smock"><i class="smock-dot" style="background:${SMOCK_COLOURS[smock]}"></i>${esc(smock)} smock</div>`:''}</div><div class="station-summary"><div><strong>${stats.attempts}</strong><span>Attempts</span></div><div><strong>${stats.saves}</strong><span>Saves</span></div><div><strong>${stats.goals}</strong><span>Goals</span></div><div><strong>${pct(stats.defenceRate)}</strong><span>Defence</span></div></div>${live?`<div class="timer-panel"><div><span class="metric-label">Time in goal</span><strong class="timer-value" data-timer-lane="${lane}">${formatTime(elapsed)}</strong></div><button class="timer-button ${activeTimers[lane]?'running':''}" data-toggle-timer="${lane}" ${goalie?'':'disabled'}>${activeTimers[lane]?'Pause':'Start'}</button></div>`:''}<div class="outcome-buttons"><button class="outcome-button save" data-outcome="Save">Save</button><button class="outcome-button goal" data-outcome="Goal">Goal</button><button class="outcome-button aco" data-outcome="Angle Closed Off">Angle Closed Off</button></div><div class="classification-row"><label class="check-chip"><input type="checkbox" class="flag-rebound">Rebound</label><label class="check-chip"><input type="checkbox" class="flag-dangerous">Dangerous rebound</label><label class="check-chip"><input type="checkbox" class="flag-position">Positioning concern</label></div><div class="station-actions"><button class="button ghost" data-station-rating="${lane}">Ratings and notes</button></div></article>`;
  }

  function bindStationControls(container,dayId,drillId,live){
    if(!drillId)return;
    container.querySelectorAll('.station-card').forEach(card=>{
      const lane=Number(card.dataset.lane); const goalieSelect=card.querySelector('.station-goalie');
      goalieSelect.addEventListener('change',()=>{if(live)stopTimer(lane);state.stationSelections[stationKey(dayId,drillId,lane)]=goalieSelect.value;saveState(); live?renderRecording():renderVideoReview();});
      card.querySelectorAll('[data-outcome]').forEach(button=>button.addEventListener('click',()=>recordOutcome(card,lane,dayId,drillId,button.dataset.outcome,live)));
      card.querySelector('[data-station-rating]').addEventListener('click',()=>openRating(goalieSelect.value,dayId,drillId));
      const timerButton=card.querySelector('[data-toggle-timer]'); if(timerButton)timerButton.addEventListener('click',()=>toggleTimer(lane,dayId,drillId,goalieSelect.value));
    });
  }

  function recordOutcome(card,lane,dayId,drillId,outcome,live){
    const goalieId=card.querySelector('.station-goalie').value; if(!goalieId){showToast('Add and select a goalkeeper first.');return;}
    const event={id:uid(),createdAt:new Date().toISOString(),dayId,drillId,goalieId,lane,outcome,shotType:live?$('shotType').value:$('videoShotType')?.value||'First Shot',situation:live?$('shotSituation').value:$('videoSituation')?.value||'Open Play',rebound:card.querySelector('.flag-rebound').checked,dangerousRebound:card.querySelector('.flag-dangerous').checked,positioningConcern:card.querySelector('.flag-position').checked,source:live?'live':'video'};
    state.events.push(event); saveState('Event saved'); live?renderRecording():renderVideoReview(); showToast(`${outcome} recorded.`);
  }

  function toggleTimer(lane,dayId,drillId,goalieId){
    if(activeTimers[lane]) stopTimer(lane); else {const key=timerKey(dayId,drillId,goalieId);if(Object.entries(activeTimers).some(([otherLane,timer])=>Number(otherLane)!==lane&&timer.key===key)){showToast('The same goalkeeper cannot run at both goals at once.');return;}activeTimers[lane]={key,startedAt:Date.now()};startTicker();renderRecording();}
  }
  function stopTimer(lane){const timer=activeTimers[lane];if(!timer)return;state.timers[timer.key]=(state.timers[timer.key]||0)+(Date.now()-timer.startedAt);delete activeTimers[lane];saveState();if(!Object.keys(activeTimers).length){clearInterval(timerTicker);timerTicker=null;}}
  function stopAllRunningTimers(){Object.keys(activeTimers).forEach(lane=>stopTimer(Number(lane)));}
  function startTicker(){if(timerTicker)return;timerTicker=setInterval(()=>{document.querySelectorAll('[data-timer-lane]').forEach(el=>{const lane=Number(el.dataset.timerLane);const timer=activeTimers[lane];if(timer)el.textContent=formatTime((state.timers[timer.key]||0)+(Date.now()-timer.startedAt));});},500)}

  function renderTimeline(dayId,drillId){
    const events=getEvents({dayId,drillId}).slice(-12).reverse();
    $('eventTimeline').innerHTML=events.length?events.map(event=>{const goalie=state.goalies.find(g=>g.id===event.goalieId);return `<div class="timeline-event"><span>${new Date(event.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span><div><strong>${esc(goalie?.name||'Unknown goalkeeper')}</strong><br><span class="muted">${esc(event.shotType)} · ${esc(event.situation)}${event.rebound?' · rebound':''}</span></div><span class="event-outcome ${event.outcome.split(' ')[0]}">${esc(event.outcome)}</span></div>`}).join(''):'<div class="empty-state">Recorded events will appear here.</div>';
  }

  function openRating(goalieId,dayId,drillId){
    if(!goalieId||!dayId||!drillId){showToast('Select a trial day, section and goalkeeper first.');return;}
    currentRatingContext={goalieId,dayId,drillId}; const existing=[...state.ratings].reverse().find(r=>r.goalieId===goalieId&&r.dayId===dayId&&r.drillId===drillId);
    $('ratingInputs').innerHTML=CATEGORIES.map(cat=>`<div class="rating-field"><label for="rating${cat}">${cat}</label><select id="rating${cat}">${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(existing?.values?.[cat]||3)===n?'selected':''}>${n} / 5</option>`).join('')}</select></div>`).join('');
    $('ratingNotes').value=existing?.notes||''; $('ratingDialog').showModal();
  }

  function saveRating(event){
    event.preventDefault(); if(!currentRatingContext)return;
    state.ratings.push({id:uid(),createdAt:new Date().toISOString(),...currentRatingContext,values:Object.fromEntries(CATEGORIES.map(cat=>[cat,Number($(`rating${cat}`).value)])),notes:$('ratingNotes').value.trim()});
    saveState(); $('ratingDialog').close(); showToast('Station review saved.'); if(currentPage==='recording')renderRecording();
  }

  function renderVideoReview(){
    const daySel=$('videoDay');ensureSelect(daySel,state.days.map((d,i)=>({id:d.id,name:`Day ${i+1} · ${dayLabel(d.date)}`})),'Add a trial day first');const drills=drillOptionsForDay(daySel.value);ensureSelect($('videoDrill'),drills,'Schedule a section first');const drill=state.drills.find(d=>d.id===$('videoDrill').value);const lanes=drill?.name==='Match Situation'?2:1;
    ['A','B'].forEach((name,i)=>{const wrap=$(`videoStation${name}`);wrap.innerHTML=drill&&i<lanes?`${stationMarkup(i,daySel.value,drill.id,false)}<div class="panel"><div class="recording-selectors"><label class="field"><span>Shot type</span><select id="videoShotType${i}">${optionList(SHOT_TYPES)}</select></label><label class="field"><span>Situation</span><select id="videoSituation${i}">${optionList(SITUATIONS)}</select></label></div></div>`:'';if(drill&&i<lanes)bindVideoStation(wrap,daySel.value,drill.id,i);});
    $('videoB').closest('.video-lane').classList.toggle('hidden',lanes<2);
  }

  function bindVideoStation(container,dayId,drillId,lane){
    const card=container.querySelector('.station-card'); const goalieSelect=card.querySelector('.station-goalie');
    goalieSelect.addEventListener('change',()=>{state.stationSelections[stationKey(dayId,drillId,lane)]=goalieSelect.value;saveState();renderVideoReview();});
    card.querySelectorAll('[data-outcome]').forEach(button=>button.addEventListener('click',()=>{const goalieId=goalieSelect.value;if(!goalieId){showToast('Select a goalkeeper first.');return;}state.events.push({id:uid(),createdAt:new Date().toISOString(),dayId,drillId,goalieId,lane,outcome:button.dataset.outcome,shotType:$(`videoShotType${lane}`).value,situation:$(`videoSituation${lane}`).value,rebound:card.querySelector('.flag-rebound').checked,dangerousRebound:card.querySelector('.flag-dangerous').checked,positioningConcern:card.querySelector('.flag-position').checked,source:'video'});saveState('Event saved');renderVideoReview();showToast(`${button.dataset.outcome} recorded from video.`);}));
    card.querySelector('[data-station-rating]').addEventListener('click',()=>openRating(goalieSelect.value,dayId,drillId));
  }

  function setVideo(input,video){input.addEventListener('change',()=>{if(video.src)URL.revokeObjectURL(video.src);const file=input.files[0];if(file){video.src=URL.createObjectURL(file);video.load();}})}

  function compareFilters(){return {dayId:$('compareDay').value,drillId:$('compareDrill').value,shotType:$('compareShot').value,situation:$('compareSituation').value}}
  function goalieScore(stats){
    const total=WEIGHT_KEYS.reduce((sum,key)=>sum+Number(state.weights[key]||0),0)||1;
    return WEIGHT_KEYS.reduce((sum,key)=>{const value=key==='Performance'?stats.defenceRate:(stats.category[key]||0)*20;return sum+value*Number(state.weights[key]||0);},0)/total;
  }

  function renderComparison(){
    const keep=compareFilters();
    $('compareDay').innerHTML=optionList(state.days.map((d,i)=>({id:d.id,name:`Day ${i+1} · ${dayLabel(d.date)}`})),keep.dayId,'All days');
    $('compareDrill').innerHTML=optionList(state.drills.map(d=>({id:d.id,name:d.name})),keep.drillId,'All drills');
    $('compareShot').innerHTML=optionList(SHOT_TYPES.map(x=>({value:x,label:x})),keep.shotType,'All shot types');
    $('compareSituation').innerHTML=optionList(SITUATIONS.map(x=>({value:x,label:x})),keep.situation,'All situations');
    const filters=compareFilters();
    $('weightControls').innerHTML=WEIGHT_KEYS.map(key=>`<div class="weight-row"><label>${key}</label><input type="range" min="0" max="100" value="${state.weights[key]}" data-weight="${key}"><output>${state.weights[key]}%</output></div>`).join('');
    const total=WEIGHT_KEYS.reduce((sum,key)=>sum+Number(state.weights[key]),0);$('weightTotal').textContent=`${total}%`;$('weightTotal').className=`pill ${total===100?'success':'warning'}`;
    document.querySelectorAll('[data-weight]').forEach(input=>input.addEventListener('input',()=>{state.weights[input.dataset.weight]=Number(input.value);saveState();renderComparison();}));
    const results=state.goalies.map(goalie=>({goalie,stats:goalieStats(goalie.id,filters)})).map(x=>({...x,score:goalieScore(x.stats)})).sort((a,b)=>b.score-a.score);
    $('rankingList').innerHTML=results.length?results.map((item,index)=>`<div class="rank-row"><span class="rank-number">${index+1}</span><div><strong>${esc(item.goalie.name)}</strong><div class="muted">${item.stats.attempts} attempts · ${pct(item.stats.defenceRate)} defence</div></div><strong class="rank-score">${item.score.toFixed(1)}</strong></div>`).join(''):'<div class="empty-state">Add goalkeepers to create the ranking.</div>';
    $('comparisonWarnings').innerHTML=comparisonWarnings(results,filters);
    $('comparisonCards').innerHTML=results.map(item=>comparisonCard(item)).join('')||'<div class="empty-state">Comparison cards will appear after goalkeepers are added.</div>';
  }

  function comparisonWarnings(results,filters){
    const active=results.filter(r=>r.stats.attempts);if(active.length<2)return '<div class="warning-card">Record at least two goalkeepers under the same conditions before relying on the comparison.</div>';
    const counts=active.map(r=>r.stats.attempts),min=Math.min(...counts),max=Math.max(...counts);const warnings=[];
    if(max-min>Math.max(2,Math.round(max*.15)))warnings.push(`Unequal attempts: goalkeepers have faced between ${min} and ${max} recorded attempts.`);
    const signatures=active.map(r=>new Set(r.stats.events.map(e=>`${e.shotType}|${e.situation}`)).size);if(Math.max(...signatures)!==Math.min(...signatures))warnings.push('Different shot types or situations are represented for different goalkeepers.');
    if(filters.drillId!=='all'){const drill=state.drills.find(d=>d.id===filters.drillId);active.forEach(r=>{if(drill&&r.stats.attempts<drill.target)warnings.push(`${r.goalie.name} has ${r.stats.attempts} of ${drill.target} target attempts.`);});}
    return warnings.map(w=>`<div class="warning-card">${esc(w)}</div>`).join('');
  }

  function comparisonCard(item){
    const cats={Performance:item.stats.defenceRate,...item.stats.category};const sorted=Object.entries(cats).sort((a,b)=>b[1]-a[1]);const strength=sorted[0]?.[1]?sorted[0][0]:'More data needed';const development=sorted.at(-1)?.[1]?sorted.at(-1)[0]:'More data needed';
    return `<article class="comparison-card"><div class="comparison-head"><h2>${esc(item.goalie.name)}</h2><p>Overall score ${item.score.toFixed(1)} · ${formatTime(totalTimeFor(item.goalie.id))} in goal</p></div><div class="comparison-stats"><div class="comparison-stat"><strong>${item.stats.attempts}</strong><span>Attempts</span></div><div class="comparison-stat"><strong>${pct(item.stats.saveRate)}</strong><span>Save rate</span></div><div class="comparison-stat"><strong>${pct(item.stats.defenceRate)}</strong><span>Defence rate</span></div><div class="comparison-stat"><strong>${item.stats.rebounds}</strong><span>Rebounds</span></div><div class="comparison-stat"><strong>${item.stats.dangerous}</strong><span>Dangerous</span></div><div class="comparison-stat"><strong>${item.stats.aco}</strong><span>Angles closed</span></div></div><div class="category-bars">${Object.entries(cats).map(([cat,val])=>`<div class="category-bar"><span>${cat}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,cat==='Performance'?val:val*20)}%"></div></div><strong>${cat==='Performance'?val.toFixed(0):(val||0).toFixed(1)}</strong></div>`).join('')}</div><div class="insight-grid"><div class="insight-box"><strong>Strength</strong><span>${esc(strength)}</span></div><div class="insight-box"><strong>Development</strong><span>${esc(development)}</span></div></div></article>`;
  }

  function reportResults(){return state.goalies.map(goalie=>{const stats=goalieStats(goalie.id);return{goalie,stats,score:goalieScore(stats)}}).sort((a,b)=>b.score-a.score)}
  function reportHeader(title){return `<div class="report-brand"><img src="assets/trials-banner-v1-5.png" alt=""><span>${esc(state.trial.name||'Goalkeeper Trial')}<br>${esc(state.trial.team||'Team not set')}<br>${new Date().toLocaleDateString()}</span></div><h2 class="report-title">${esc(title)}</h2><p class="report-subtitle">${esc(state.trial.ageGroup)} · ${esc(state.trial.level)} · ${esc(state.trial.tier)}</p>`}

  function renderReport(){
    const results=reportResults();const selected=$('reportGoalie').value||results[0]?.goalie.id||'';$('reportGoalie').innerHTML=optionList(state.goalies,selected);$('reportNotes').value=state.reportNotes;$('finalDecision').value=state.finalDecision;$('reportGoalieWrap').classList.toggle('hidden',$('reportType').value==='selection');
    $('reportCanvas').innerHTML=$('reportType').value==='feedback'?feedbackReport(results.find(r=>r.goalie.id===$('reportGoalie').value)||results[0]):selectionReport(results);
  }

  function selectionReport(results){
    const winner=results[0];return `${reportHeader('Goalkeeper Selection Report')}<div class="recommendation"><strong>Current data-led recommendation</strong><div>${winner?`${esc(winner.goalie.name)} leads the weighted ranking with ${winner.score.toFixed(1)} points.`:'No recommendation is available until candidates are added.'}</div></div><section class="report-section"><h3>Ranked shortlist</h3>${results.length?`<table class="report-table"><thead><tr><th>Rank</th><th>Goalkeeper</th><th>Attempts</th><th>Save rate</th><th>Defence rate</th><th>Score</th></tr></thead><tbody>${results.map((r,i)=>`<tr><td>${i+1}</td><td><strong>${esc(r.goalie.name)}</strong></td><td>${r.stats.attempts}</td><td>${pct(r.stats.saveRate)}</td><td>${pct(r.stats.defenceRate)}</td><td>${r.score.toFixed(1)}</td></tr>`).join('')}</tbody></table>`:'<p>No roster data available.</p>'}</section><section class="report-section"><h3>Category comparison</h3>${results.length?`<table class="report-table"><thead><tr><th>Goalkeeper</th><th>Technical</th><th>Physical</th><th>Tactical</th><th>Communication</th><th>Time in goal</th></tr></thead><tbody>${results.map(r=>`<tr><td>${esc(r.goalie.name)}</td>${CATEGORIES.map(cat=>`<td>${(r.stats.category[cat]||0).toFixed(1)} / 5</td>`).join('')}<td>${formatTime(totalTimeFor(r.goalie.id))}</td></tr>`).join('')}</tbody></table>`:'<p>No category ratings available.</p>'}</section><section class="report-section"><h3>Final decision</h3><p><strong>${esc(state.finalDecision)}</strong></p><div class="report-notes">${esc(state.reportNotes||'No selector notes added.')}</div></section>`;
  }

  function feedbackReport(item){
    if(!item)return `${reportHeader('Individual Goalkeeper Feedback')}<p>No goalkeeper selected.</p>`;
    const cats={Performance:item.stats.defenceRate,...item.stats.category};const sorted=Object.entries(cats).sort((a,b)=>b[1]-a[1]);const notes=state.ratings.filter(r=>r.goalieId===item.goalie.id&&r.notes).map(r=>r.notes);
    return `${reportHeader('Individual Goalkeeper Feedback')}<h3>${esc(item.goalie.name)}</h3><div class="metric-grid"><article class="metric-card"><span class="metric-label">Attempts</span><strong class="metric-value">${item.stats.attempts}</strong></article><article class="metric-card"><span class="metric-label">Save rate</span><strong class="metric-value">${pct(item.stats.saveRate)}</strong></article><article class="metric-card"><span class="metric-label">Defence rate</span><strong class="metric-value">${pct(item.stats.defenceRate)}</strong></article><article class="metric-card"><span class="metric-label">Time in goal</span><strong class="metric-value">${formatTime(totalTimeFor(item.goalie.id))}</strong></article></div><section class="report-section"><h3>Category ratings</h3><table class="report-table"><tbody>${Object.entries(cats).map(([cat,val])=>`<tr><td><strong>${cat}</strong></td><td>${cat==='Performance'?pct(val):`${(val||0).toFixed(1)} / 5`}</td></tr>`).join('')}</tbody></table></section><section class="report-section"><h3>Strengths and development areas</h3><p><strong>Leading area:</strong> ${esc(sorted[0]?.[1]?sorted[0][0]:'More data needed')}</p><p><strong>Development focus:</strong> ${esc(sorted.at(-1)?.[1]?sorted.at(-1)[0]:'More data needed')}</p></section><section class="report-section"><h3>Coach feedback</h3><div class="report-notes">${esc(notes.join('\n\n')||'No individual coaching notes added.')}</div></section>`;
  }

  function bindEvents(){
    document.querySelectorAll('.nav-button').forEach(button=>button.addEventListener('click',()=>switchPage(button.dataset.page)));
    document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>switchPage(button.dataset.go)));
    $('saveSetup').addEventListener('click',saveSetup);$('dayForm').addEventListener('submit',addDay);$('drillForm').addEventListener('submit',addDrill);
    $('openGoalieDialog').addEventListener('click',()=>$('goalieDialog').showModal());$('addSharedGoalie').addEventListener('click',openSharedGoalieDialog);$('sharedGoalieForm').addEventListener('submit',addSharedGoalieToRoster);$('goalieForm').addEventListener('submit',addGoalie);$('ratingForm').addEventListener('submit',saveRating);
    document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
    $('rosterDayFilter').addEventListener('change',renderRoster);
    $('recordingDay').addEventListener('change',renderRecording);$('recordingDrill').addEventListener('change',renderRecording);
    $('videoDay').addEventListener('change',renderVideoReview);$('videoDrill').addEventListener('change',renderVideoReview);
    setVideo($('videoFileA'),$('videoA'));setVideo($('videoFileB'),$('videoB'));
    $('undoLastEvent').addEventListener('click',()=>{const dayId=$('recordingDay').value,drillId=$('recordingDrill').value;const index=state.events.map(e=>e.dayId===dayId&&e.drillId===drillId).lastIndexOf(true);if(index<0){showToast('There is no event to undo.');return;}state.events.splice(index,1);saveState();renderRecording();showToast('Last event removed.');});
    ['compareDay','compareDrill','compareShot','compareSituation'].forEach(id=>$(id).addEventListener('change',renderComparison));
    $('reportType').addEventListener('change',renderReport);$('reportGoalie').addEventListener('change',renderReport);
    $('reportNotes').addEventListener('input',()=>{state.reportNotes=$('reportNotes').value;saveState();renderReport();});
    $('finalDecision').addEventListener('change',()=>{state.finalDecision=$('finalDecision').value;saveState();renderReport();});
    $('printReport').addEventListener('click',()=>window.print());
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;$('installButton').classList.remove('hidden');});
    $('installButton').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('installButton').classList.add('hidden');});
    window.addEventListener('beforeunload',stopAllRunningTimers);
  }

  function init(){
    refreshLinkedGoalies();bindEvents();renderDashboard();
    const params=new URLSearchParams(location.search),requestedPage=params.get('page'),requestedGoalie=params.get('goalie');
    if(requestedPage==='reports'){
      switchPage('reports');
      if(requestedGoalie&&state.goalies.some(g=>String(g.sharedGoalieId||g.id)===String(requestedGoalie))){
        $('reportType').value='feedback';renderReport();$('reportGoalie').value=state.goalies.find(g=>String(g.sharedGoalieId||g.id)===String(requestedGoalie)).id;renderReport();
      }
    }
    if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
  }
  init();
})();
