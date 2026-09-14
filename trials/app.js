(() => {
  'use strict';

  const STORAGE_KEY = 'hgt-data-driven-selection-v1';
  const SHARED_GOALIE_KEY = 'hockeyGoalieStatsV3';
  const CATEGORIES = ['Technical', 'Physical', 'Tactical', 'Discipline', 'Communication'];
  const SMOCKS = ['White', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Pink', 'Black'];
  const SMOCK_COLOURS = {White:'#f4f6f8',Red:'#d83a48',Blue:'#2389dc',Green:'#16a36b',Yellow:'#f0c93d',Orange:'#ef8d2f',Pink:'#e56aa4',Black:'#17232e'};
  const SHOT_TYPES = ['1st Shot','Rebound','Deflection/Tip in','In Game 1v1','Own Goal','Other'];
  const SITUATIONS = ['Normal Game Play','Penalty Corner','Penalty Stroke','8 Second 1v1'];
  const OUTNUMBERED = ['Not Out Numbered','2 vs 1','3 vs 1','4+ vs 1'];
  const REBOUND_RESULTS = ['No rebound','Safe','Dangerous'];
  const SESSION_FIELDS = ['trial','days','drills','goalies','events','ratings','timers','timerSources','stationSelections','shotSelections','ratingsInfluence','ratingWeights','reportNotes','feedbackNotes','finalDecision','progressions'];

  const defaultState = () => ({
    trial: {name:'', team:'', gender:'Male', ageGroup:'U16', level:'School', tier:'A/1st'},
    days: [],
    drills: [],
    goalies: [],
    events: [],
    ratings: [],
    timers: {},
    timerSources: {},
    stationSelections: {},
    shotSelections: {},
    progressions: {},
    trialSessions: {},
    trialEventTemplates: [],
    trialDayTemplates: [],
    activeTrialId: '',
    ratingsInfluence: 50,
    ratingWeights: {Technical:20,Physical:20,Tactical:20,Discipline:20,Communication:20},
    reportNotes: '',
    feedbackNotes: {},
    finalDecision: 'Pending'
  });

  let state = loadState();
  let currentPage = 'dashboard';
  let activeTimers = {};
  let pendingGoalieStarts = {};
  let activeVideoTimers = {};
  let timerTicker = null;
  let deferredInstall = null;
  let currentRatingContext = null;
  let editingDrillId = '';
  let editingEventContext = '';
  let pendingLateEntry = null;
  let toastTimer = null;
  const videoReviewSessions = new Map();
  const videoWaveCache = new Map();
  const VIDEO_HANDLE_DB = 'hgt-trial-video-handles-v1';
  const VIDEO_HANDLE_STORE = 'handles';
  let videoHandleDbPromise = null;
  let videoTrialDirectoryHandle = null;
  let loadedVideoDirectoryTrialId = '';
  let videoAnimationFrame = 0;
  let videoClockStarted = 0;
  let videoClockMaster = 0;
  let videoControllerBusy = false;
  let videoSeekDragging = false;
  let videoTimelineDragging = false;
  let videoPanDrag = null;
  let pendingVideoTimeConflict = null;
  const videoTimeConflictQueue = [];

  const $ = id => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const dayLabel = date => date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : 'No date';
  const formatTime = ms => { const total = Math.floor(ms / 1000); const h = Math.floor(total/3600); const m = Math.floor((total%3600)/60); const s = total%60; return h ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };
  const pct = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : 'N/C';
  const average = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;

  function videoHandleDb(){if(!('indexedDB' in window))return Promise.reject(new Error('IndexedDB is unavailable.'));if(videoHandleDbPromise)return videoHandleDbPromise;videoHandleDbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open(VIDEO_HANDLE_DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(VIDEO_HANDLE_STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return videoHandleDbPromise;}
  async function videoHandleGet(key){const db=await videoHandleDb();return new Promise((resolve,reject)=>{const request=db.transaction(VIDEO_HANDLE_STORE).objectStore(VIDEO_HANDLE_STORE).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async function videoHandlePut(key,value){const db=await videoHandleDb();return new Promise((resolve,reject)=>{const request=db.transaction(VIDEO_HANDLE_STORE,'readwrite').objectStore(VIDEO_HANDLE_STORE).put(value,key);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);});}
  function activeTrialVideoId(){return state.activeTrialId||'current-trial'}
  function trialVideoDirectoryKey(){return `trial|${activeTrialVideoId()}|directory`}
  function trialVideoFilesKey(index){return `trial|${activeTrialVideoId()}|${$('videoDay')?.value||''}|${$('videoDrill')?.value||''}|angle-${index?'B':'A'}`}
  function trialVideoViewKey(index){return `${trialVideoFilesKey(index)}|view`}
  async function handlePermission(handle,request=false){if(!handle)return false;if(typeof handle.queryPermission!=='function')return true;try{if(await handle.queryPermission({mode:'read'})==='granted')return true;return request&&await handle.requestPermission({mode:'read'})==='granted';}catch{return false;}}

  function validDob(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
    const date=new Date(`${value}T12:00:00`),year=Number(value.slice(0,4));
    return year>=1900&&year<=new Date().getFullYear()&&!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
  }

  function captureSession(source){
    return Object.fromEntries(SESSION_FIELDS.map(key=>[key,structuredClone(source[key] ?? defaultState()[key])]));
  }

  function loadState(){
    try {
      const parsed={...defaultState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')};
      parsed.trial={...defaultState().trial,...(parsed.trial||{})};parsed.shotSelections=parsed.shotSelections||{};parsed.progressions=parsed.progressions||{};parsed.feedbackNotes=parsed.feedbackNotes||{};parsed.trialSessions=parsed.trialSessions||{};parsed.trialEventTemplates=Array.isArray(parsed.trialEventTemplates)?parsed.trialEventTemplates:[];parsed.trialDayTemplates=Array.isArray(parsed.trialDayTemplates)?parsed.trialDayTemplates:[];
      const legacyWeights=parsed.weights||{};
      parsed.ratingsInfluence=Number.isFinite(Number(parsed.ratingsInfluence))?Math.min(100,Math.max(0,Number(parsed.ratingsInfluence))):50;
      parsed.ratingWeights={...defaultState().ratingWeights,...Object.fromEntries(CATEGORIES.map(cat=>[cat,Number(parsed.ratingWeights?.[cat]??legacyWeights[cat]??20)]))};
      Object.values(parsed.trialSessions).forEach(session=>{const old=session.weights||{};session.trial={...defaultState().trial,...(session.trial||{})};session.feedbackNotes=session.feedbackNotes||{};session.ratingsInfluence=Number.isFinite(Number(session.ratingsInfluence))?Math.min(100,Math.max(0,Number(session.ratingsInfluence))):50;session.ratingWeights={...defaultState().ratingWeights,...Object.fromEntries(CATEGORIES.map(cat=>[cat,Number(session.ratingWeights?.[cat]??old[cat]??20)]))};});
      if(!parsed.activeTrialId){parsed.activeTrialId=`trial-${Date.now()}-${Math.random().toString(16).slice(2)}`;parsed.trialSessions[parsed.activeTrialId]=captureSession(parsed);}
      if(!parsed.trialSessions[parsed.activeTrialId]) parsed.trialSessions[parsed.activeTrialId]=captureSession(parsed);
      return parsed;
    }
    catch { const fresh=defaultState();fresh.activeTrialId=`trial-${Date.now()}`;fresh.trialSessions[fresh.activeTrialId]=captureSession(fresh);return fresh; }
  }

  function syncActiveSession(){
    if(state.activeTrialId) state.trialSessions[state.activeTrialId]=captureSession(state);
  }

  function applySession(session){
    SESSION_FIELDS.forEach(key=>{state[key]=structuredClone(session?.[key] ?? defaultState()[key]);});
  }

  function saveState(message='Saved locally'){
    try {
      syncActiveSession();
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
    const late=pendingLateEntry;
    const level=source.teamProfiles?.find(t=>t.level&&t.level!=='Not specified')?.level||'School';
    const goalie={id:source.id,sharedGoalieId:source.id,source:'shared',name:source.name||'Unnamed Goalie',dob:source.dob||'',gender:source.gender||'Male',experience:'',preferredLevel:level,photo:'',smocks:{},legGuards:{},entryDayId:pendingLateEntry?.dayId||'',lateEntryReason:pendingLateEntry?.reason||''};
    if(!confirmAgeEligibility(goalie))return;
    state.goalies.push(goalie);
    pendingLateEntry=null;
    saveState();$('sharedGoalieDialog').close();late?renderPromotion():renderRoster();showToast(`${source.name} added from the shared directory.`);
  }

  function showToast(message){
    const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>toast.classList.remove('show'),2600);
  }

  function switchPage(page){
    stopAllRunningTimers();
    if(currentPage==='video'&&page!=='video'){stopAllVideoGoalieTimers(false);pauseAllVideoPlayback();}
    const opening=page!==currentPage;
    if(opening&&page==='roster')$('rosterDayFilter').value=preferredWorkingDayId();
    if(opening&&page==='recording')$('recordingDay').value=preferredWorkingDayId();
    if(opening&&page==='video')$('videoDay').value=preferredWorkingDayId();
    if(page==='promotion'&&currentPage!=='promotion')$('promotionDay').value='';
    currentPage = page;
    document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
    document.querySelectorAll('.nav-button').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    $('mainContent').scrollTop = 0;
    renderPage(page);
  }

  function renderPage(page){
    if(page==='dashboard') renderDashboard();
    if(page==='events') renderTrialEvents();
    if(page==='setup') renderSetup();
    if(page==='roster') renderRoster();
    if(page==='recording') renderRecording();
    if(page==='video') renderVideoReview();
    if(page==='promotion') renderPromotion();
    if(page==='comparison') renderComparison();
    if(page==='reports') renderReport();
  }

  function optionList(items, selected, allLabel){
    const head = allLabel !== undefined ? `<option value="all">${esc(allLabel)}</option>` : '';
    return head + items.map(item => `<option value="${esc(item.value ?? item.id ?? item)}" ${(item.value ?? item.id ?? item)===selected?'selected':''}>${esc(item.label ?? item.name ?? item)}</option>`).join('');
  }

  function trialSessionEntries(){
    syncActiveSession();
    return Object.entries(state.trialSessions).map(([id,session])=>({id,session,trial:session.trial||{}}));
  }

  function addDateDays(date,days){const value=new Date(`${date}T12:00:00`);value.setDate(value.getDate()+days);return value.toISOString().slice(0,10)}
  function eventTemplateFromState(name,id){
    const dated=state.days.filter(d=>d.date).map(d=>d.date).sort(),base=dated[0]||'';
    return {id:id||uid(),name,trial:structuredClone(state.trial),days:state.days.map((day,index)=>({offset:base&&day.date?Math.round((new Date(`${day.date}T12:00:00`)-new Date(`${base}T12:00:00`))/86400000):index})),drills:state.drills.map(drill=>({dayIndex:state.days.findIndex(day=>day.id===drill.dayId),name:drill.name,target:drill.target})),updatedAt:new Date().toISOString()};
  }
  function renderEventTemplates(){
    $('eventTemplateList').innerHTML=state.trialEventTemplates.length?state.trialEventTemplates.map(template=>`<div class="template-item"><div><strong>${esc(template.name)}</strong><span>${template.days?.length||0} days · ${template.drills?.length||0} sections · ${esc(template.trial?.gender||'Male')} ${esc(template.trial?.ageGroup||'')}</span></div><div class="table-actions"><button class="mini-button" data-use-event-template="${template.id}">Use</button><button class="mini-button danger" data-delete-event-template="${template.id}">Delete</button></div></div>`).join(''):'<div class="empty-state">No event templates saved yet.</div>';
    document.querySelectorAll('[data-use-event-template]').forEach(button=>button.addEventListener('click',()=>openTrialEventDialog(button.dataset.useEventTemplate)));
    document.querySelectorAll('[data-delete-event-template]').forEach(button=>button.addEventListener('click',()=>deleteEventTemplate(button.dataset.deleteEventTemplate)));
  }
  function saveCurrentEventTemplate(){
    const name=prompt('Name this Trial Event Template:',state.trial.name||'Trial Event Template')?.trim();if(!name)return;
    const existing=state.trialEventTemplates.find(template=>template.name.toLowerCase()===name.toLowerCase());if(existing&&!confirm(`Replace the existing “${existing.name}” template?`))return;
    const template=eventTemplateFromState(name,existing?.id);state.trialEventTemplates=state.trialEventTemplates.filter(item=>item.id!==template.id);state.trialEventTemplates.push(template);saveState();renderEventTemplates();showToast('Trial Event Template saved.');
  }
  function deleteEventTemplate(id){const template=state.trialEventTemplates.find(item=>item.id===id);if(!template||!confirm(`Delete the “${template.name}” template?`))return;state.trialEventTemplates=state.trialEventTemplates.filter(item=>item.id!==id);saveState();renderEventTemplates();showToast('Trial Event Template deleted.');}
  function openTrialEventDialog(templateId=''){
    $('trialEventForm').reset();$('newTrialTemplate').innerHTML='<option value="">Blank trial</option>'+optionList(state.trialEventTemplates,'');$('newTrialTemplate').value=templateId;applyNewTrialTemplate();$('trialEventDialog').showModal();
  }
  function applyNewTrialTemplate(){
    const template=state.trialEventTemplates.find(item=>item.id===$('newTrialTemplate').value),hasDays=Boolean(template?.days?.length);$('newTrialStartWrap').classList.toggle('hidden',!hasDays);$('newTrialStartDate').required=hasDays;
    if(!template){$('newTrialName').value='';$('newTrialTeam').value='';$('newTrialGender').value='Male';$('newTrialAge').value='U16';$('newTrialLevel').value='School';$('newTrialStartDate').value='';return;}
    $('newTrialName').value=template.trial?.name||template.name;$('newTrialTeam').value=template.trial?.team||'';$('newTrialGender').value=template.trial?.gender||'Male';$('newTrialAge').value=template.trial?.ageGroup||'U16';$('newTrialLevel').value=template.trial?.level||'School';
  }

  function renderTrialEvents(){
    const entries=trialSessionEntries();
    $('trialEventGrid').innerHTML=entries.length?entries.map(({id,session,trial})=>{
      const all=session.events||[],days=session.days||[];
      return `<article class="event-card ${id===state.activeTrialId?'active':''}"><div><span class="pill ${id===state.activeTrialId?'success':''}">${id===state.activeTrialId?'Active trial':'Available'}</span><h2>${esc(trial.name||'Unnamed trial')}</h2><p>${esc(trial.team||'Team not set')} · ${esc(trial.gender||'Male')} · ${esc(trial.ageGroup||'')} · ${esc(trial.level||'')}</p></div><div class="event-summary"><span><strong>${days.length}</strong> days</span><span><strong>${(session.goalies||[]).length}</strong> goalies</span><span><strong>${all.length}</strong> attempts</span></div><div class="event-actions"><button class="button ${id===state.activeTrialId?'ghost':'primary'}" data-open-trial="${id}" ${id===state.activeTrialId?'disabled':''}>${id===state.activeTrialId?'Currently open':'Open Trial'}</button><button class="button danger" data-delete-trial="${id}">Delete Trial</button></div></article>`;
    }).join(''):'<div class="empty-state">Create a trial event to begin.</div>';
    document.querySelectorAll('[data-open-trial]').forEach(button=>button.addEventListener('click',()=>activateTrial(button.dataset.openTrial)));
    document.querySelectorAll('[data-delete-trial]').forEach(button=>button.addEventListener('click',()=>deleteTrialEvent(button.dataset.deleteTrial)));
    renderEventTemplates();
  }

  function activateTrial(id){
    if(!state.trialSessions[id]||id===state.activeTrialId)return;
    stopAllRunningTimers();syncActiveSession();state.activeTrialId=id;applySession(state.trialSessions[id]);saveState();renderTrialEvents();showToast(`${state.trial.name||'Trial'} opened.`);
  }

  function createTrialEvent(event){
    event.preventDefault();syncActiveSession();
    const blank=defaultState(),id=uid(),template=state.trialEventTemplates.find(item=>item.id===$('newTrialTemplate').value);
    blank.trial={name:$('newTrialName').value.trim(),team:$('newTrialTeam').value.trim(),gender:$('newTrialGender').value,ageGroup:$('newTrialAge').value,level:$('newTrialLevel').value,tier:template?.trial?.tier||'A/1st'};
    if(template?.days?.length){const start=$('newTrialStartDate').value;if(!start){showToast('Choose the first trial day date.');return;}blank.days=template.days.map(day=>({id:uid(),date:addDateDays(start,Number(day.offset)||0),status:'planned'}));blank.drills=(template.drills||[]).filter(drill=>blank.days[drill.dayIndex]).map(drill=>({id:uid(),dayId:blank.days[drill.dayIndex].id,name:drill.name,target:drill.target}));}
    state.activeTrialId=id;applySession(blank);state.trialSessions[id]=captureSession(state);saveState();$('trialEventDialog').close();$('trialEventForm').reset();switchPage('setup');showToast('New trial event created.');
  }

  function deleteTrialEvent(id){
    syncActiveSession();const session=state.trialSessions[id];if(!session)return;
    const name=session.trial?.name||'Unnamed trial';
    if(!confirmationCode(`Delete ${name} and its days, roster, recordings, ratings, timers, selections and reports?`))return;
    stopAllRunningTimers();delete state.trialSessions[id];
    if(id===state.activeTrialId){
      const nextId=Object.keys(state.trialSessions)[0];
      if(nextId){state.activeTrialId=nextId;applySession(state.trialSessions[nextId]);}
      else {state.activeTrialId='';applySession(defaultState());}
    }
    saveState();renderTrialEvents();showToast(`${name} deleted.`);
  }

  function trialReady(){ return Boolean(state.trial.name && state.trial.team && state.days.length && state.drills.length); }

  function trialYear(){return Number((state.days[0]?.date||'').slice(0,4))||new Date().getFullYear()}
  function ageOnJanFirst(dob){
    if(!dob)return null;const born=new Date(`${dob}T12:00:00`);if(Number.isNaN(born.getTime()))return null;
    const ref=new Date(trialYear(),0,1,12);let age=ref.getFullYear()-born.getFullYear();
    if(ref.getMonth()<born.getMonth()||(ref.getMonth()===born.getMonth()&&ref.getDate()<born.getDate()))age--;
    return age;
  }
  function eligibility(goalie){
    const limit=Number(String(state.trial.ageGroup||'').match(/^U(\d+)$/)?.[1]),age=ageOnJanFirst(goalie.dob);
    return limit&&age!==null&&age>=limit?{eligible:false,age,limit,year:trialYear()}:{eligible:true,age,limit,year:trialYear()};
  }
  function confirmAgeEligibility(goalie){
    const check=eligibility(goalie);if(check.eligible)return true;
    return confirm(`${goalie.name} is ${check.age} on 1 January ${check.year} and is older than the ${state.trial.ageGroup} age limit. This goalkeeper is ineligible for this age group.\n\nAdd them to the Trials Roster anyway?`);
  }

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
    if (!goalieId) return {events:[],saves:0,goals:0,aco:0,attempts:0,rebounds:0,dangerous:0,saveRate:0,defenceRate:0,category:Object.fromEntries(CATEGORIES.map(cat=>[cat,0])),categoryCounts:Object.fromEntries(CATEGORIES.map(cat=>[cat,0])),ratingCount:0};
    const events = getEvents({...filters,goalieId});
    const saves = events.filter(e=>e.outcome==='Save').length;
    const goals = events.filter(e=>e.outcome==='Goal').length;
    const aco = events.filter(e=>e.outcome==='Angle Closed Off').length;
    const rebounds = events.filter(e=>e.rebound).length;
    const dangerous = events.filter(e=>e.dangerousRebound).length;
    const ratingMap=new Map();state.ratings.filter(r => r.goalieId===goalieId && (!filters.dayId || filters.dayId==='all' || r.dayId===filters.dayId) && (!filters.drillId || filters.drillId==='all' || r.drillId===filters.drillId)).forEach(r=>ratingMap.set(`${r.goalieId}|${r.dayId}|${r.drillId}`,r));const ratings=[...ratingMap.values()];
    const categoryValues=Object.fromEntries(CATEGORIES.map(cat=>[cat,ratings.map(r=>Number(r.values?.[cat])||0).filter(Boolean)]));
    const category = Object.fromEntries(CATEGORIES.map(cat => [cat, average(categoryValues[cat])]));
    const categoryCounts=Object.fromEntries(CATEGORIES.map(cat=>[cat,categoryValues[cat].length]));
    return {events,saves,goals,aco,attempts:events.length,rebounds,dangerous,
      saveRate:(saves+goals)?saves/(saves+goals)*100:0,
      defenceRate:events.length?(saves+aco)/events.length*100:0,
      category,categoryCounts,ratingCount:ratings.length};
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
      ['Team',state.trial.team||'—'],['Classification',`${state.trial.gender} · ${state.trial.ageGroup} · ${state.trial.level} · ${state.trial.tier}`],['Trial days',state.days.length],['Total goalkeeper time',formatTime(state.goalies.reduce((sum,g)=>sum+totalTimeFor(g.id),0))]
    ].map(([label,value])=>`<div class="detail-item"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('');
    $('dashboardDrills').innerHTML = state.drills.length ? state.drills.map(drill=>{
      const day=state.days.find(d=>d.id===drill.dayId); const count=state.events.filter(e=>e.drillId===drill.id).length; const total=drill.target*Math.max(1,state.goalies.length); const progress=Math.min(100,total?count/total*100:0);
      return `<div class="stack-item"><div class="stack-item-main"><strong>${esc(drill.name)}</strong><span>${esc(dayLabel(day?.date))} · ${count}/${total} recorded</span></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div></div>`;
    }).join('') : '<div class="empty-state">No drills have been scheduled yet.</div>';
    $('dashboardRoster').innerHTML = state.goalies.length ? state.goalies.map(goalie=>goalieCard(goalie,false)).join('') : '<div class="empty-state">Add candidates to create the Trials Roster.</div>';
  }

  function renderSetup(preferredDayId){
    $('trialName').value=state.trial.name; $('teamName').value=state.trial.team; $('teamGender').value=state.trial.gender||'Male'; $('ageGroup').value=state.trial.ageGroup; $('teamLevel').value=state.trial.level; $('teamTier').value=state.trial.tier;
    const retainedDay=preferredDayId||$('drillDay').value||state.days[0]?.id||'';
    const dayOptions = optionList(state.days.map((d,i)=>({id:d.id,name:`Day ${i+1} · ${dayLabel(d.date)}`})),retainedDay);
    $('drillDay').innerHTML = dayOptions || '<option value="">Add a trial day first</option>';
    if(state.days.some(d=>d.id===retainedDay))$('drillDay').value=retainedDay;
    $('trialDaysList').innerHTML = state.days.length ? state.days.map((day,index)=>`<div class="stack-item"><div class="stack-item-main"><strong>Trial Day ${index+1}</strong><span>${esc(dayLabel(day.date))} · ${day.status==='completed'?'Completed':'Planned'}</span></div><button class="mini-button danger" data-delete-day="${day.id}">Remove</button></div>`).join('') : '<div class="empty-state">No trial days added.</div>';
    $('scheduledDrills').innerHTML = state.drills.length ? `<table class="data-table"><thead><tr><th>Day</th><th>Drill / section</th><th>Target per goalie</th><th>Recorded</th><th></th></tr></thead><tbody>${state.drills.map(drill=>{const day=state.days.find(d=>d.id===drill.dayId);const count=state.events.filter(e=>e.drillId===drill.id).length;return `<tr><td>${esc(dayLabel(day?.date))}</td><td><strong>${esc(drill.name)}</strong></td><td>${drill.target}</td><td>${count}</td><td><div class="table-actions"><button class="mini-button" data-edit-drill="${drill.id}">Edit</button><button class="mini-button danger" data-delete-drill="${drill.id}">Remove</button></div></td></tr>`}).join('')}</tbody></table>` : '<div class="empty-state">Choose a trial day, drill and equal attempt target to build the programme.</div>';
    document.querySelectorAll('[data-delete-day]').forEach(button=>button.addEventListener('click',()=>deleteDay(button.dataset.deleteDay)));
    document.querySelectorAll('[data-delete-drill]').forEach(button=>button.addEventListener('click',()=>deleteDrill(button.dataset.deleteDrill)));
    document.querySelectorAll('[data-edit-drill]').forEach(button=>button.addEventListener('click',()=>editDrill(button.dataset.editDrill)));
    renderDayTemplates();
  }

  function renderDayTemplates(){
    const days=state.days.map((day,index)=>({id:day.id,name:`Day ${index+1} · ${dayLabel(day.date)}`})),selectedTemplate=$('dayTemplateSelect').value;
    $('dayTemplateSource').innerHTML=days.length?optionList(days,$('dayTemplateSource').value):'<option value="">Add a trial day first</option>';$('dayTemplateTarget').innerHTML=days.length?optionList(days,$('dayTemplateTarget').value):'<option value="">Add a trial day first</option>';
    $('dayTemplateSelect').innerHTML=state.trialDayTemplates.length?optionList(state.trialDayTemplates,selectedTemplate):'<option value="">No saved templates</option>';
    const template=state.trialDayTemplates.find(item=>item.id===$('dayTemplateSelect').value);$('dayTemplateSummary').innerHTML=template?`<strong>${esc(template.name)}</strong><span>${template.drills.map(drill=>`${esc(drill.name)} · ${drill.target} attempts`).join('<br>')}</span>`:'';
    $('saveDayTemplate').disabled=!days.length;$('applyDayTemplate').disabled=!days.length||!template;$('deleteDayTemplate').disabled=!template;
  }
  function saveCurrentDayTemplate(){
    const dayId=$('dayTemplateSource').value,name=$('dayTemplateName').value.trim(),drills=state.drills.filter(drill=>drill.dayId===dayId).map(drill=>({name:drill.name,target:drill.target}));if(!name){showToast('Enter a template name.');return;}if(!drills.length){showToast('The selected day has no sections to save.');return;}
    const existing=state.trialDayTemplates.find(template=>template.name.toLowerCase()===name.toLowerCase());if(existing&&!confirm(`Replace the existing “${existing.name}” template?`))return;
    const template={id:existing?.id||uid(),name,drills,updatedAt:new Date().toISOString()};state.trialDayTemplates=state.trialDayTemplates.filter(item=>item.id!==template.id);state.trialDayTemplates.push(template);saveState();$('dayTemplateName').value='';renderDayTemplates();$('dayTemplateSelect').value=template.id;renderDayTemplates();showToast('Trial Day Template saved.');
  }
  function applyDayTemplate(){
    const template=state.trialDayTemplates.find(item=>item.id===$('dayTemplateSelect').value),dayId=$('dayTemplateTarget').value;if(!template||!dayId)return;
    const oldIds=state.drills.filter(drill=>drill.dayId===dayId).map(drill=>drill.id),hasData=state.events.some(event=>oldIds.includes(event.drillId))||state.ratings.some(rating=>oldIds.includes(rating.drillId));if(hasData){showToast('This day already has recorded data and cannot be replaced by a template.');return;}
    if(oldIds.length&&!confirm('Replace the existing scheduled sections on this trial day?'))return;
    state.drills=state.drills.filter(drill=>drill.dayId!==dayId);Object.keys(state.timers).filter(key=>oldIds.some(id=>key.includes(`|${id}|`))).forEach(key=>delete state.timers[key]);template.drills.forEach(drill=>state.drills.push({id:uid(),dayId,name:drill.name,target:drill.target}));saveState();renderSetup(dayId);showToast('Trial Day Template applied.');
  }
  function deleteDayTemplate(){const id=$('dayTemplateSelect').value,template=state.trialDayTemplates.find(item=>item.id===id);if(!template||!confirm(`Delete the “${template.name}” template?`))return;state.trialDayTemplates=state.trialDayTemplates.filter(item=>item.id!==id);saveState();renderDayTemplates();showToast('Trial Day Template deleted.');}

  function saveSetup(){
    state.trial={name:$('trialName').value.trim(),team:$('teamName').value.trim(),gender:$('teamGender').value,ageGroup:$('ageGroup').value,level:$('teamLevel').value,tier:$('teamTier').value};
    saveState(); renderSetup(); showToast('Trial setup saved.');
  }

  function addDay(event){
    event.preventDefault(); const date=$('trialDayDate').value; if(!date){showToast('Choose a date first.');return;}
    if(state.days.some(d=>d.date===date)){showToast('That trial day is already scheduled.');return;}
    state.days.push({id:uid(),date,status:'planned'}); state.days.sort((a,b)=>a.date.localeCompare(b.date)); saveState(); renderSetup();
  }

  function addDrill(event){
    event.preventDefault(); if(!state.days.length){showToast('Add a trial day first.');return;}
    const target=Math.max(1,Number($('drillTarget').value)||1),dayId=$('drillDay').value;
    if(editingDrillId){const drill=state.drills.find(d=>d.id===editingDrillId);if(drill)Object.assign(drill,{dayId,name:$('drillType').value,target});editingDrillId='';$('drillSubmit').textContent='Add to trial';$('cancelDrillEdit').classList.add('hidden');saveState();renderSetup(dayId);showToast('Trial line updated.');return;}
    state.drills.push({id:uid(),dayId,name:$('drillType').value,target}); saveState(); renderSetup(dayId); showToast('Trial section scheduled.');
  }

  function editDrill(id){
    const drill=state.drills.find(d=>d.id===id);if(!drill)return;editingDrillId=id;$('drillDay').value=drill.dayId;$('drillType').value=drill.name;$('drillTarget').value=drill.target;$('drillSubmit').textContent='Save changes';$('cancelDrillEdit').classList.remove('hidden');$('drillForm').scrollIntoView({behavior:'smooth',block:'center'});
  }

  function cancelDrillEdit(){editingDrillId='';$('drillSubmit').textContent='Add to trial';$('cancelDrillEdit').classList.add('hidden');}

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
    const drill=state.drills.find(d=>d.id===id); if(!drill || !confirm(`Remove ${drill.name} and its recorded data?`)) return;
    state.drills=state.drills.filter(d=>d.id!==id); state.events=state.events.filter(e=>e.drillId!==id); state.ratings=state.ratings.filter(r=>r.drillId!==id); Object.keys(state.timers).filter(k=>k.includes(`|${id}|`)).forEach(k=>delete state.timers[k]); saveState(); renderSetup();
  }

  async function photoData(file){
    if(!file) return '';
    const source=await createImageBitmap(file); const max=320; const scale=Math.min(1,max/Math.max(source.width,source.height)); const canvas=document.createElement('canvas'); canvas.width=Math.round(source.width*scale); canvas.height=Math.round(source.height*scale); canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height); return canvas.toDataURL('image/jpeg',.78);
  }

  async function addGoalie(event){
    event.preventDefault();
    const name=$('goalieName').value.trim(); if(!name) return;
    const dob=$('goalieDob').value;if(!validDob(dob)){$('goalieDob').setCustomValidity('Enter a valid date with a four-digit year (1900 to the current year).');$('goalieDob').reportValidity();return;}$('goalieDob').setCustomValidity('');
    const photo=await photoData($('goaliePhoto').files[0]);
    const late=pendingLateEntry,goalie={id:uid(),source:'trial_only',name,dob:$('goalieDob').value,gender:$('goalieGender').value,experience:$('goalieExperience').value.trim(),preferredLevel:$('goaliePreferredLevel').value,photo,smocks:{},legGuards:{},entryDayId:late?.dayId||'',lateEntryReason:late?.reason||''};
    if(!confirmAgeEligibility(goalie))return;
    state.goalies.push(goalie);
    pendingLateEntry=null;
    saveState(); $('goalieDialog').close(); $('goalieForm').reset(); late?renderPromotion():renderRoster(); showToast(`${name} added to the Trials Roster.`);
  }

  function initials(name){return name.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'GK';}
  function goalieKitIcon(goalie,dayId){
    const smock=SMOCK_COLOURS[goalie?.smocks?.[dayId]||'White'],pads=SMOCK_COLOURS[goalie?.legGuards?.[dayId]||'White'];
    return `<svg class="goalie-kit-icon" viewBox="0 0 48 58" role="img" aria-label="${esc(goalie?.name||'Goalkeeper')} kit colours"><circle cx="24" cy="8" r="6" fill="#dce4ea" stroke="#15384f" stroke-width="2"/><path d="M18 6h12v5H18z" fill="#18384f"/><path d="M15 16l9-4 9 4 3 17H12z" fill="${smock}" stroke="#15384f" stroke-width="2"/><path d="M12 20L6 32l6 3 7-12M36 20l6 12-6 3-7-12" fill="${pads}" stroke="#15384f" stroke-width="2" stroke-linejoin="round"/><rect x="9" y="31" width="8" height="7" rx="2" fill="${pads}" stroke="#15384f" stroke-width="2"/><rect x="31" y="31" width="8" height="7" rx="2" fill="${pads}" stroke="#15384f" stroke-width="2"/><path d="M14 32h20l-2 10H16z" fill="${pads}" stroke="#15384f" stroke-width="2"/><rect x="13" y="40" width="9" height="15" rx="3" fill="${pads}" stroke="#15384f" stroke-width="2"/><rect x="26" y="40" width="9" height="15" rx="3" fill="${pads}" stroke="#15384f" stroke-width="2"/><path d="M12 54h11v3H11zM25 54h11l1 3H25z" fill="${pads}" stroke="#15384f" stroke-width="1.5"/></svg>`;
  }
  function goalieCard(goalie,editable=true){
    const dayId=$('rosterDayFilter')?.value||state.days[0]?.id||'',smock=goalie.smocks?.[dayId]||'White',guards=goalie.legGuards?.[dayId]||'White',check=eligibility(goalie);
    return `<article class="goalie-card"><div class="goalie-card-head">${goalie.photo?`<img class="goalie-photo" src="${goalie.photo}" alt="">`:`<div class="goalie-initials">${esc(initials(goalie.name))}</div>`}<div><h3 class="goalie-name-with-kit">${goalieKitIcon(goalie,dayId)}<span>${esc(goalie.name)}</span></h3><p>${esc(goalie.gender)} · ${esc(goalie.preferredLevel)} · ${goalie.sharedGoalieId?'Shared goalie':'Trial only'}</p></div></div><div class="goalie-card-body"><p><strong>DOB:</strong> ${esc(dayLabel(goalie.dob))}</p><p><strong>Experience:</strong> ${esc(goalie.experience||'Not recorded')}</p>${!check.eligible?`<div class="ineligible-warning"><strong>Ineligible for ${esc(state.trial.ageGroup)}</strong><span>Age ${check.age} on 1 January ${check.year}</span></div>`:''}${editable?`<div class="kit-colour-grid"><label class="field"><span>Smock colour this day</span><div class="smock-control"><i class="smock-dot" style="background:${SMOCK_COLOURS[smock]}"></i><select data-smock-goalie="${goalie.id}" data-day="${dayId}">${optionList(SMOCKS.map(x=>({value:x,label:x})),smock)}</select></div></label><label class="field"><span>Leg-guards colour this day</span><div class="smock-control"><i class="smock-dot" style="background:${SMOCK_COLOURS[guards]}"></i><select data-guards-goalie="${goalie.id}" data-day="${dayId}">${optionList(SMOCKS.map(x=>({value:x,label:x})),guards)}</select></div></label></div>`:''}</div>${editable?`<div class="goalie-actions"><button class="button ghost" data-open-rating="${goalie.id}">Add review</button><button class="button danger" data-delete-goalie="${goalie.id}">Remove</button></div>`:''}</article>`;
  }

  function renderRoster(){
    const selected=$('rosterDayFilter').value||preferredWorkingDayId();
    $('rosterDayFilter').innerHTML=state.days.length?optionList(state.days.map((d,i)=>({id:d.id,name:`Day ${i+1} · ${dayLabel(d.date)}`})),selected):'<option value="">Add a trial day first</option>';
    const readOnly=completedDay($('rosterDayFilter').value);$('rosterReadOnlyNotice').classList.toggle('hidden',!readOnly);
    $('rosterGrid').innerHTML=state.goalies.length?state.goalies.map(g=>goalieCard(g,!readOnly)).join(''):'<div class="empty-state">No goalkeepers are on the Trials Roster yet.</div>';
    document.querySelectorAll('[data-smock-goalie]').forEach(select=>select.addEventListener('change',()=>{const goalie=state.goalies.find(g=>g.id===select.dataset.smockGoalie); if(!goalie||!select.dataset.day)return;goalie.smocks=goalie.smocks||{};goalie.smocks[select.dataset.day]=select.value;saveState();renderRoster();}));
    document.querySelectorAll('[data-guards-goalie]').forEach(select=>select.addEventListener('change',()=>{const goalie=state.goalies.find(g=>g.id===select.dataset.guardsGoalie);if(!goalie||!select.dataset.day)return;goalie.legGuards=goalie.legGuards||{};goalie.legGuards[select.dataset.day]=select.value;saveState();renderRoster();}));
    document.querySelectorAll('[data-delete-goalie]').forEach(button=>button.addEventListener('click',()=>deleteGoalie(button.dataset.deleteGoalie)));
    document.querySelectorAll('[data-open-rating]').forEach(button=>button.addEventListener('click',()=>{const dayId=$('rosterDayFilter').value;const drill=state.drills.find(d=>d.dayId===dayId);openRating(button.dataset.openRating,dayId,drill?.id);}));
  }

  function deleteGoalie(id){
    const goalie=state.goalies.find(g=>g.id===id); if(!goalie||!confirmationCode(`Remove ${goalie.name} and all of this goalkeeper’s trial data?`))return;
    state.goalies=state.goalies.filter(g=>g.id!==id); state.events=state.events.filter(e=>e.goalieId!==id); state.ratings=state.ratings.filter(r=>r.goalieId!==id);delete state.feedbackNotes?.[id]; Object.keys(state.timers).filter(k=>k.endsWith(`|${id}`)).forEach(k=>delete state.timers[k]); saveState();renderRoster();
  }

  function drillOptionsForDay(dayId){return state.drills.filter(d=>d.dayId===dayId)}
  function dayIndex(dayId){return state.days.findIndex(d=>d.id===dayId)}
  function preferredWorkingDayId(){return state.days.find(day=>day.status!=='completed')?.id||state.days.at(-1)?.id||''}
  function completedDay(dayId){return state.days.find(day=>day.id===dayId)?.status==='completed'}
  function dayCanStart(dayId){
    const index=dayIndex(dayId);if(index<=0)return true;
    const previous=state.days[index-1],progress=state.progressions[previous.id];
    return previous.status==='completed'&&Boolean(progress?.confirmed);
  }
  function eligibleGoaliesForDay(dayId){
    const index=dayIndex(dayId);if(index<=0)return state.goalies.filter(g=>!g.entryDayId||g.entryDayId===dayId);
    const previous=state.days[index-1],advanced=new Set(state.progressions[previous.id]?.goalieIds||[]);
    return state.goalies.filter(g=>advanced.has(g.id)||g.entryDayId===dayId);
  }
  function ensureSelect(select,items,emptyLabel,preferred){
    const current=preferred||select.value; select.innerHTML=items.length?optionList(items,current):`<option value="">${emptyLabel}</option>`; if(items.length&&!items.some(i=>(i.id??i.value)===select.value))select.value=items[0].id??items[0].value;
  }

  function renderRecording(){
    const daySel=$('recordingDay'); ensureSelect(daySel,state.days.map((d,i)=>({id:d.id,name:`Day ${i+1} · ${dayLabel(d.date)}`})),'Add a trial day first',daySel.value||preferredWorkingDayId());
    const drills=drillOptionsForDay(daySel.value); ensureSelect($('recordingDrill'),drills,'Schedule a section first');
    const drill=state.drills.find(d=>d.id===$('recordingDrill').value); const lanes=drill?.name==='Match Situation'?2:1;
    const readOnly=completedDay(daySel.value);$('recordingReadOnlyNotice').classList.toggle('hidden',!readOnly);
    $('recordingModePill').textContent=drill?`${drill.name} · ${drill.target} each${readOnly?' · Read only':''}`:'Select a section';
    $('swapGoalies').classList.toggle('hidden',!drill||lanes!==2);
    const blocked=daySel.value&&!dayCanStart(daySel.value);
    $('recordingStations').innerHTML=blocked?'<div class="notice">This round cannot start until the previous day is completed and its Promotion / Selection decision is confirmed.</div>':drill?Array.from({length:lanes},(_,i)=>stationMarkup(i,daySel.value,drill.id,true)).join(''):'<div class="empty-state">Schedule a trial day and section before recording.</div>';
    if(readOnly)$('recordingStations').querySelectorAll('button,input,textarea,select').forEach(control=>control.disabled=true);else bindStationControls($('recordingStations'),daySel.value,drill?.id,true);
    $('swapGoalies').disabled=readOnly;$('undoLastEvent').disabled=readOnly;
    renderRotationOverview(daySel.value,drill?.id);
    renderEventTimeline('eventTimeline',daySel.value,drill?.id,'recording');
  }

  function renderRotationOverview(dayId,drillId){
    const drill=state.drills.find(item=>item.id===drillId),goalies=dayId?eligibleGoaliesForDay(dayId):[],assignments=new Map();[0,1].forEach(lane=>{const id=state.stationSelections[stationKey(dayId,drillId,lane)];if(id)assignments.set(id,lane?'Goal B':'Goal A')});
    $('recordingRotationOverview').innerHTML=goalies.length?goalies.map(goalie=>{const sectionStats=goalieStats(goalie.id,{dayId,drillId}),dayStats=goalieStats(goalie.id,{dayId}),time=dayTimeFor(goalie.id,dayId),position=assignments.get(goalie.id),targetMet=Boolean(drill&&sectionStats.attempts>=drill.target);return `<article class="rotation-card ${position?'in-goal':''} ${targetMet?'target-met':''}"><div class="rotation-name">${goalieKitIcon(goalie,dayId)}<div><strong>${esc(goalie.name)}</strong><span>${position||'Waiting'}</span></div></div><div class="rotation-metrics"><span><strong>${dayStats.attempts}</strong>Shots faced today${drill?` · ${sectionStats.attempts} / ${drill.target} this section`:''}</span><span><strong data-rotation-day-time="${goalie.id}" data-day="${dayId}">${formatTime(time)}</strong>Time in goal today</span></div></article>`}).join(''):'<div class="empty-state">Add eligible goalkeepers to see the rotation overview.</div>';
  }

  function dayTimeFor(goalieId,dayId){
    const suffix=`|${goalieId}`,prefix=`${dayId}|`;let total=Object.entries(state.timers).filter(([key])=>key.startsWith(prefix)&&key.endsWith(suffix)).reduce((sum,[,value])=>sum+Number(value||0),0);
    Object.values(activeTimers).forEach(timer=>{if(timer.key.startsWith(prefix)&&timer.key.endsWith(suffix))total+=Date.now()-timer.startedAt;});return total;
  }

  function liveTimeFor(goalieId,dayId,drillId){const saved=filteredTimeFor(goalieId,{dayId,drillId}),key=timerKey(dayId,drillId,goalieId),timer=Object.values(activeTimers).find(item=>item.key===key);return saved+(timer?Date.now()-timer.startedAt:0)}

  function stationKey(dayId,drillId,lane){return `${dayId}|${drillId}|${lane}`}
  function timerKey(dayId,drillId,goalieId){return `${dayId}|${drillId}|${goalieId}`}
  function selectedGoalie(dayId,drillId,lane){
    const key=stationKey(dayId,drillId,lane),other=state.stationSelections[stationKey(dayId,drillId,lane?0:1)],eligible=eligibleGoaliesForDay(dayId).filter(g=>g.id!==other);
    if(!eligible.some(g=>g.id===state.stationSelections[key]))state.stationSelections[key]=eligible[0]?.id||'';
    return state.stationSelections[key];
  }

  function choiceButtons(group,values,selected){return `<div class="choice-row" data-choice-group="${group}">${values.map(value=>`<button type="button" class="choice-button ${value===selected?'selected':''}" data-choice-value="${esc(value)}">${esc(value)}</button>`).join('')}</div>`}
  function sectionSituation(drill){return ({'Penalty Corners':'Penalty Corner','Penalty Strokes':'Penalty Stroke','8Sec 1v1':'8 Second 1v1'})[drill?.name]||''}
  function shotSelection(dayId,drillId,lane){
    const key=stationKey(dayId,drillId,lane),drill=state.drills.find(d=>d.id===drillId);state.shotSelections[key]=state.shotSelections[key]||{outcome:'Save',situation:'Normal Game Play',shotType:'1st Shot',outnumbered:'Not Out Numbered',rebound:'No rebound',note:''};const locked=sectionSituation(drill);if(locked)state.shotSelections[key].situation=locked;return state.shotSelections[key];
  }
  function ratingCategories(drill){return drill?.name==='Match Situation'?CATEGORIES:CATEGORIES.filter(cat=>cat!=='Communication')}
  function latestRating(goalieId,dayId,drillId){return [...state.ratings].reverse().find(r=>r.goalieId===goalieId&&r.dayId===dayId&&r.drillId===drillId)}
  function ensureSectionRating(goalieId,dayId,drill){
    let existing=latestRating(goalieId,dayId,drill.id);if(existing)return existing;
    existing={id:uid(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),goalieId,dayId,drillId:drill.id,values:Object.fromEntries(ratingCategories(drill).map(cat=>[cat,3])),notes:''};state.ratings.push(existing);saveState('Standard rating saved');return existing;
  }
  function inlineRatingMarkup(goalieId,dayId,drill){
    const existing=ensureSectionRating(goalieId,dayId,drill),categories=ratingCategories(drill);
    return `<div class="inline-review"><h3>Trial section rating</h3><p class="muted">Starts at 3 / 5 and saves automatically. Changes overwrite this goalkeeper’s single rating for the section.</p><div class="inline-rating-grid">${categories.map(cat=>{const selected=Number(existing?.values?.[cat]||3);return `<div class="inline-rating"><span>${cat}</span><div>${[1,2,3,4,5].map(n=>`<button type="button" class="rating-choice ${n===selected?'selected':''}" data-rating-cat="${cat}" data-rating-value="${n}">${n}</button>`).join('')}</div></div>`}).join('')}</div><label class="field"><span>Coach notes</span><textarea class="inline-rating-notes" rows="3" placeholder="Observations and development points">${esc(existing?.notes||'')}</textarea></label><span class="auto-save-note" aria-live="polite">Saved automatically</span></div>`;
  }

  function stationMarkup(lane,dayId,drillId,live){
    const goalieId=selectedGoalie(dayId,drillId,lane),goalies=eligibleGoaliesForDay(dayId).filter(g=>g.id===goalieId||g.id!==state.stationSelections[stationKey(dayId,drillId,lane?0:1)]),goalie=state.goalies.find(g=>g.id===goalieId),stats=goalie?goalieStats(goalieId,{dayId,drillId}):goalieStats('',{dayId,drillId}),key=timerKey(dayId,drillId,goalieId),videoTimer=activeVideoTimers[lane],videoRunning=videoTimer?.key===key,elapsed=(state.timers[key]||0)+(activeTimers[lane]?.key===key?Date.now()-activeTimers[lane].startedAt:0)+(videoRunning?Math.max(0,currentVideoSession().masterTime*1000-videoTimer.startedAtVideo):0),smock=goalie?.smocks?.[dayId]||'White',guards=goalie?.legGuards?.[dayId]||'White',drill=state.drills.find(d=>d.id===drillId),selection=shotSelection(dayId,drillId,lane),locked=sectionSituation(drill),targetMet=Boolean(drill&&stats.attempts>=drill.target);
    const timerMarkup=live?`<div class="timer-panel"><div><span class="metric-label">Time in goal</span><strong class="timer-value" data-timer-lane="${lane}">${formatTime(elapsed)}</strong></div><button class="timer-button ${activeTimers[lane]?'running':''}" data-toggle-timer="${lane}" ${goalie?'':'disabled'}>${activeTimers[lane]?'Pause':'Start'}</button></div>`:`<div class="timer-panel"><div><span class="metric-label">Time in goal from video</span><strong class="timer-value" data-video-timer-lane="${lane}">${formatTime(elapsed)}</strong></div><button class="timer-button ${videoRunning?'running':''}" data-toggle-video-timer="${lane}" ${goalie?'':'disabled'}>${videoRunning?'Pause at video time':'Start at video time'}</button></div>`;
    return `<article class="station-card ${targetMet?'target-met':''}" data-lane="${lane}"><div class="station-top"><span class="eyebrow">${live?'Recording':'Video recording'} · ${lane?'Goal B':'Goal A'}${targetMet?' · Target reached':''}</span><select class="station-goalie" aria-label="Goalkeeper for ${lane?'Goal B':'Goal A'}">${goalies.length?optionList(goalies,goalieId):'<option value="">No eligible goalkeeper</option>'}</select>${goalie?`<div class="station-goalie-name">${goalieKitIcon(goalie,dayId)}<strong>${esc(goalie.name)}</strong></div><div class="station-smock"><span><i class="smock-dot" style="background:${SMOCK_COLOURS[smock]}"></i>${esc(smock)} smock</span><span><i class="smock-dot" style="background:${SMOCK_COLOURS[guards]}"></i>${esc(guards)} pads</span></div>`:''}</div><div class="station-summary"><div><strong>${stats.attempts}</strong><span>Attempts</span></div><div><strong>${stats.saves}</strong><span>Saves</span></div><div><strong>${stats.goals}</strong><span>Goals</span></div><div><strong>${pct(stats.defenceRate)}</strong><span>Defence</span></div></div>${timerMarkup}<div class="shot-form"><label>Shot Outcome</label>${choiceButtons('outcome',['Save','Goal','Angle Closed Off'],selection.outcome)}<label>Shot Situation</label>${locked?`<div class="locked-situation" aria-label="Locked shot situation">🔒 ${esc(locked)} · set by trial section</div>`:choiceButtons('situation',SITUATIONS,selection.situation)}<label>Shot Type</label>${choiceButtons('shotType',SHOT_TYPES,selection.shotType)}<label>Out Numbered</label>${choiceButtons('outnumbered',OUTNUMBERED,selection.outnumbered)}<label>Rebound Result</label>${choiceButtons('rebound',REBOUND_RESULTS,selection.rebound)}<label class="field"><span>Notes</span><input class="shot-note" value="${esc(selection.note||'')}"></label><button type="button" class="button primary save-trial-shot">Save Trial Shot</button></div>${goalie&&drill?inlineRatingMarkup(goalieId,dayId,drill):''}</article>`;
  }

  function bindStationControls(container,dayId,drillId,live){
    if(!drillId)return;
    container.querySelectorAll('.station-card').forEach(card=>{
      const lane=Number(card.dataset.lane); const goalieSelect=card.querySelector('.station-goalie');
      goalieSelect.addEventListener('change',()=>{const shouldAutoStart=Boolean(live&&(activeTimers[lane]||pendingGoalieStarts[lane]));if(live){cancelPendingGoalieStart(lane);stopTimer(lane);}else if(activeVideoTimers[lane])stopVideoGoalieTimer(lane,false);const other=state.stationSelections[stationKey(dayId,drillId,lane?0:1)];if(goalieSelect.value===other){showToast('The same goalkeeper cannot be placed in Goal A and Goal B.');live?renderRecording():renderVideoReview();return;}state.stationSelections[stationKey(dayId,drillId,lane)]=goalieSelect.value;saveState();if(shouldAutoStart&&goalieSelect.value)scheduleGoalieStart(lane,dayId,drillId,goalieSelect.value);live?renderRecording():renderVideoReview();});
      card.querySelectorAll('[data-choice-group]').forEach(group=>group.querySelectorAll('[data-choice-value]').forEach(button=>button.addEventListener('click',()=>{const selection=shotSelection(dayId,drillId,lane);selection[group.dataset.choiceGroup]=button.dataset.choiceValue;group.querySelectorAll('.choice-button').forEach(item=>item.classList.toggle('selected',item===button));saveState();})));
      card.querySelector('.shot-note')?.addEventListener('input',event=>{shotSelection(dayId,drillId,lane).note=event.target.value;});
      card.querySelector('.save-trial-shot')?.addEventListener('click',()=>recordOutcome(card,lane,dayId,drillId,live));
      card.querySelectorAll('[data-rating-cat]').forEach(button=>button.addEventListener('click',()=>{card.querySelectorAll(`[data-rating-cat="${button.dataset.ratingCat}"]`).forEach(item=>item.classList.toggle('selected',item===button));persistInlineRating(card,goalieSelect.value,dayId,drillId,false);}));
      let notesTimer;card.querySelector('.inline-rating-notes')?.addEventListener('input',()=>{clearTimeout(notesTimer);const status=card.querySelector('.auto-save-note');if(status)status.textContent='Saving…';notesTimer=setTimeout(()=>persistInlineRating(card,goalieSelect.value,dayId,drillId,false),350);});
      const timerButton=card.querySelector('[data-toggle-timer]'); if(timerButton)timerButton.addEventListener('click',()=>toggleTimer(lane,dayId,drillId,goalieSelect.value));
      const videoTimerButton=card.querySelector('[data-toggle-video-timer]');if(videoTimerButton)videoTimerButton.addEventListener('click',()=>toggleVideoGoalieTimer(lane,dayId,drillId,goalieSelect.value));
    });
  }

  function recordOutcome(card,lane,dayId,drillId,live){
    if(completedDay(dayId)){showToast('Reopen this trial day before changing its recordings.');return;}
    const goalieId=card.querySelector('.station-goalie').value; if(!goalieId){showToast('Add and select a goalkeeper first.');return;}
    if(live){const key=timerKey(dayId,drillId,goalieId);if(!activeTimers[lane]&&!Number(state.timers[key]||0)){cancelPendingGoalieStart(lane);startTimer(lane,dayId,drillId,goalieId);}}
    const selection=shotSelection(dayId,drillId,lane),drill=state.drills.find(d=>d.id===drillId),locked=sectionSituation(drill);if(locked)selection.situation=locked;const rebound=selection.rebound==='No rebound'?'':selection.rebound;
    const event={id:uid(),createdAt:new Date().toISOString(),dayId,drillId,goalieId,lane,outcome:selection.outcome,shotType:selection.shotType,situation:selection.situation,outnumbered:selection.outnumbered,rebound,dangerousRebound:rebound==='Dangerous',note:selection.note||'',source:live?'live':'video',...(live?{}:{videoReview:{masterTime:currentVideoSession().masterTime,syncOffset:currentVideoSession().syncOffset}})};
    state.events.push(event);selection.note='';saveState('Event saved');live?renderRecording():renderVideoReview();showToast(`${selection.outcome} recorded.`);
  }

  function persistInlineRating(card,goalieId,dayId,drillId,notify){
    if(!goalieId||completedDay(dayId))return;const drill=state.drills.find(d=>d.id===drillId),values={};ratingCategories(drill).forEach(cat=>{values[cat]=Number(card.querySelector(`[data-rating-cat="${cat}"].selected`)?.dataset.ratingValue||3);});
    const previous=latestRating(goalieId,dayId,drillId),now=new Date().toISOString();state.ratings=state.ratings.filter(r=>!(r.goalieId===goalieId&&r.dayId===dayId&&r.drillId===drillId));state.ratings.push({id:previous?.id||uid(),createdAt:previous?.createdAt||now,updatedAt:now,goalieId,dayId,drillId,values,notes:card.querySelector('.inline-rating-notes')?.value.trim()||''});saveState();const status=card.querySelector('.auto-save-note');if(status)status.textContent='Saved automatically';if(notify)showToast('Trial section review saved.');
  }

  function toggleTimer(lane,dayId,drillId,goalieId){
    if(completedDay(dayId)){showToast('Reopen this trial day before changing its timer.');return;}cancelPendingGoalieStart(lane);if(activeTimers[lane]) stopTimer(lane); else startTimer(lane,dayId,drillId,goalieId);renderRecording();
  }
  function startTimer(lane,dayId,drillId,goalieId){
    if(!goalieId)return false;const key=timerKey(dayId,drillId,goalieId);if(Object.entries(activeTimers).some(([otherLane,timer])=>Number(otherLane)!==lane&&timer.key===key)){showToast('The same goalkeeper cannot run at both goals at once.');return false;}activeTimers[lane]={key,startedAt:Date.now()};startTicker();return true;
  }
  function cancelPendingGoalieStart(lane){const pending=pendingGoalieStarts[lane];if(pending){clearTimeout(pending.timeout);delete pendingGoalieStarts[lane];}}
  function scheduleGoalieStart(lane,dayId,drillId,goalieId){cancelPendingGoalieStart(lane);pendingGoalieStarts[lane]={goalieId,timeout:setTimeout(()=>{delete pendingGoalieStarts[lane];if(currentPage!=='recording'||activeTimers[lane]||selectedGoalie(dayId,drillId,lane)!==goalieId)return;if(startTimer(lane,dayId,drillId,goalieId)){renderRecording();showToast('Goalkeeper timer started automatically after 30 seconds.');}},30000)};}
  function timerSourceFor(key){state.timerSources=state.timerSources||{};if(!state.timerSources[key])state.timerSources[key]={manual:Number(state.timers[key]||0),video:0,mode:'add'};return state.timerSources[key];}
  function combinedTimerValue(source){return source.mode==='replace'?Number(source.video||0):Number(source.manual||0)+Number(source.video||0)}
  function updateCombinedTimer(key){state.timers[key]=combinedTimerValue(timerSourceFor(key));}
  function stopTimer(lane){const timer=activeTimers[lane];if(!timer)return;const source=timerSourceFor(timer.key),increment=Date.now()-timer.startedAt;if(source.mode==='replace')source.manual=0;source.manual=Number(source.manual||0)+increment;source.mode='add';updateCombinedTimer(timer.key);delete activeTimers[lane];saveState();if(!Object.keys(activeTimers).length){clearInterval(timerTicker);timerTicker=null;}}
  function stopAllRunningTimers(){Object.keys(pendingGoalieStarts).forEach(lane=>cancelPendingGoalieStart(Number(lane)));Object.keys(activeTimers).forEach(lane=>stopTimer(Number(lane)));}
  function startTicker(){if(timerTicker)return;timerTicker=setInterval(()=>{document.querySelectorAll('[data-timer-lane]').forEach(el=>{const lane=Number(el.dataset.timerLane);const timer=activeTimers[lane];if(timer)el.textContent=formatTime((state.timers[timer.key]||0)+(Date.now()-timer.startedAt));});document.querySelectorAll('[data-rotation-day-time]').forEach(el=>{el.textContent=formatTime(dayTimeFor(el.dataset.rotationDayTime,el.dataset.day));});},500)}

  function commitVideoGoalieTime(key,increment,mode){const source=timerSourceFor(key);source.video=Number(source.video||0)+increment;source.mode=mode;updateCombinedTimer(key);saveState();renderVideoReview();showToast(mode==='replace'?'Manual time replaced with video-calculated time.':'Video-calculated time added.');}
  function showNextVideoTimeConflict(){if(pendingVideoTimeConflict||!videoTimeConflictQueue.length)return;pendingVideoTimeConflict=videoTimeConflictQueue.shift();const source=timerSourceFor(pendingVideoTimeConflict.key);$('videoTimeConflictText').textContent=`This section already has ${formatTime(source.manual)} recorded by the manual timer. The video timestamps calculate ${formatTime(Number(source.video||0)+pendingVideoTimeConflict.increment)}.`;$('videoTimeConflictDialog').showModal();}
  function resolveVideoTimeConflict(mode){const pending=pendingVideoTimeConflict;if(!pending)return;$('videoTimeConflictDialog').close();pendingVideoTimeConflict=null;if(mode)commitVideoGoalieTime(pending.key,pending.increment,mode);else showToast('Existing goalkeeper time was left unchanged.');showNextVideoTimeConflict();}
  function stopVideoGoalieTimer(lane,render=true){const timer=activeVideoTimers[lane];if(!timer)return;const timerSession=videoReviewSessions.get(timer.sessionKey),endTime=Number(timerSession?.masterTime??currentVideoSession().masterTime)*1000,increment=Math.max(0,endTime-timer.startedAtVideo);delete activeVideoTimers[lane];if(render)renderVideoReview();if(increment<1){showToast('Move to a later video timestamp before pausing the timer.');return;}const source=timerSourceFor(timer.key);if(Number(source.manual||0)>0){videoTimeConflictQueue.push({key:timer.key,increment});showNextVideoTimeConflict();}else commitVideoGoalieTime(timer.key,increment,'add');}
  function stopAllVideoGoalieTimers(render=false){Object.keys(activeVideoTimers).forEach(lane=>stopVideoGoalieTimer(Number(lane),render));}
  function toggleVideoGoalieTimer(lane,dayId,drillId,goalieId){if(completedDay(dayId)){showToast('Reopen this trial day before changing its timer.');return;}if(activeVideoTimers[lane]){stopVideoGoalieTimer(lane);return;}if(!goalieId)return;const key=timerKey(dayId,drillId,goalieId);if(Object.entries(activeVideoTimers).some(([otherLane,timer])=>Number(otherLane)!==lane&&timer.key===key)){showToast('The same goalkeeper cannot run at both goals at once.');return;}activeVideoTimers[lane]={key,sessionKey:videoSessionKey(),startedAtVideo:currentVideoSession().masterTime*1000};renderVideoReview();showToast(`Video timer started at ${formatTime(currentVideoSession().masterTime*1000)}.`);}
  function updateVideoGoalieTimerDisplays(){document.querySelectorAll('[data-video-timer-lane]').forEach(el=>{const lane=Number(el.dataset.videoTimerLane),timer=activeVideoTimers[lane],timerSession=timer&&videoReviewSessions.get(timer.sessionKey);if(timer)el.textContent=formatTime(Number(state.timers[timer.key]||0)+Math.max(0,Number(timerSession?.masterTime??currentVideoSession().masterTime)*1000-timer.startedAtVideo));});}

  function renderEventTimeline(targetId,dayId,drillId,context){
    const events=getEvents({dayId,drillId}).slice().reverse();
    $(targetId).innerHTML=events.length?events.map(event=>{const goalie=state.goalies.find(g=>g.id===event.goalieId),videoAction=context==='video'?`<button type="button" class="mini-button" data-link-video-shot="${event.id}" ${completedDay(event.dayId)?'disabled':''}>${Number.isFinite(Number(event.videoReview?.masterTime))?'Move time':'Set time'}</button>`:'';return `<div class="timeline-event editable ${context==='video'?'video-linked-actions':''}"><span>${new Date(event.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span><div><strong class="timeline-goalie-name">${goalie?goalieKitIcon(goalie,event.dayId):''}<span>${esc(goalie?.name||'Unknown goalkeeper')}</span></strong><br><span class="muted">${esc(event.shotType)} · ${esc(event.situation)}${event.rebound?` · ${esc(event.rebound)} rebound`:''}${Number.isFinite(Number(event.videoReview?.masterTime))?` · Video ${formatTime(Number(event.videoReview.masterTime)*1000)}`:''}</span></div><span class="event-outcome ${event.outcome.split(' ')[0]}">${esc(event.outcome)}</span>${videoAction}<button type="button" class="mini-button" data-edit-shot="${event.id}" ${completedDay(event.dayId)?'disabled':''}>Edit</button></div>`}).join(''):'<div class="empty-state">Recorded events will appear here.</div>';
    $(targetId).querySelectorAll('[data-edit-shot]').forEach(button=>button.addEventListener('click',()=>openShotEditor(button.dataset.editShot,context)));
    $(targetId).querySelectorAll('[data-link-video-shot]').forEach(button=>button.addEventListener('click',()=>{const event=state.events.find(item=>item.id===button.dataset.linkVideoShot);if(!event||completedDay(event.dayId))return;event.videoReview={masterTime:currentVideoSession().masterTime,syncOffset:currentVideoSession().syncOffset};saveState('Shot linked to video time');renderVideoReview();showToast('Shot placed on the video timeline.');}));
  }

  function openShotEditor(eventId,context){
    const event=state.events.find(item=>item.id===eventId);if(!event)return;if(completedDay(event.dayId)){showToast('Reopen this trial day before editing its shots.');return;}
    const day=state.days.find(item=>item.id===event.dayId),drill=state.drills.find(item=>item.id===event.drillId),currentGoalie=state.goalies.find(item=>item.id===event.goalieId),goalies=eligibleGoaliesForDay(event.dayId);if(currentGoalie&&!goalies.some(item=>item.id===currentGoalie.id))goalies.push(currentGoalie);
    editingEventContext=context;$('editShotId').value=event.id;$('editShotDay').textContent=`${dayLabel(day?.date)}`;$('editShotSection').textContent=drill?.name||'Removed section';$('editShotGoalie').innerHTML=optionList(goalies,event.goalieId);$('editShotOutcome').innerHTML=optionList(['Save','Goal','Angle Closed Off'],event.outcome);$('editShotType').innerHTML=optionList(SHOT_TYPES,event.shotType);$('editShotSituation').innerHTML=optionList(SITUATIONS,event.situation);$('editShotOutnumbered').innerHTML=optionList(OUTNUMBERED,event.outnumbered||'Not Out Numbered');$('editShotRebound').innerHTML=optionList(REBOUND_RESULTS,event.rebound||'No rebound');$('editShotNote').value=event.note||'';
    const locked=sectionSituation(drill);$('editShotSituation').disabled=Boolean(locked);if(locked)$('editShotSituation').value=locked;$('editShotSituationHelp').textContent=locked?`${locked} is locked by this trial section.`:'';$('shotEditorDialog').showModal();
  }

  function saveShotEdit(formEvent){
    formEvent.preventDefault();const event=state.events.find(item=>item.id===$('editShotId').value);if(!event)return;if(completedDay(event.dayId)){showToast('Reopen this trial day before editing its shots.');$('shotEditorDialog').close();return;}
    const drill=state.drills.find(item=>item.id===event.drillId),locked=sectionSituation(drill),rebound=$('editShotRebound').value;Object.assign(event,{goalieId:$('editShotGoalie').value,outcome:$('editShotOutcome').value,shotType:$('editShotType').value,situation:locked||$('editShotSituation').value,outnumbered:$('editShotOutnumbered').value,rebound:rebound==='No rebound'?'':rebound,dangerousRebound:rebound==='Dangerous',note:$('editShotNote').value.trim(),updatedAt:new Date().toISOString()});saveState('Shot updated');$('shotEditorDialog').close();editingEventContext==='video'?renderVideoReview():renderRecording();showToast('Recorded shot updated.');
  }

  function openRating(goalieId,dayId,drillId){
    if(!goalieId||!dayId||!drillId){showToast('Select a trial day, section and goalkeeper first.');return;}
    const drill=state.drills.find(d=>d.id===drillId),categories=ratingCategories(drill);currentRatingContext={goalieId,dayId,drillId,categories}; const existing=ensureSectionRating(goalieId,dayId,drill);
    $('ratingInputs').innerHTML=categories.map(cat=>`<div class="rating-field"><label for="rating${cat}">${cat}</label><select id="rating${cat}">${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(existing?.values?.[cat]||3)===n?'selected':''}>${n} / 5</option>`).join('')}</select></div>`).join('');
    $('ratingNotes').value=existing?.notes||''; $('ratingDialog').showModal();
    categories.forEach(cat=>$(`rating${cat}`).addEventListener('change',persistModalRating));let notesTimer;$('ratingNotes').oninput=()=>{clearTimeout(notesTimer);notesTimer=setTimeout(persistModalRating,350);};
  }

  function persistModalRating(){
    if(!currentRatingContext||completedDay(currentRatingContext.dayId))return;const {categories,...context}=currentRatingContext,previous=latestRating(context.goalieId,context.dayId,context.drillId),now=new Date().toISOString();state.ratings=state.ratings.filter(r=>!(r.goalieId===context.goalieId&&r.dayId===context.dayId&&r.drillId===context.drillId));state.ratings.push({id:previous?.id||uid(),createdAt:previous?.createdAt||now,updatedAt:now,...context,values:Object.fromEntries(categories.map(cat=>[cat,Number($(`rating${cat}`).value)])),notes:$('ratingNotes').value.trim()});saveState('Rating saved automatically');
  }

  function saveRating(event){
    event.preventDefault(); if(!currentRatingContext)return;
    persistModalRating();$('ratingDialog').close();showToast('Station review saved.');if(currentPage==='recording')renderRecording();
  }

  function videoSessionKey(){return `${activeTrialVideoId()}|${$('videoDay').value}|${$('videoDrill').value}`;}
  function newVideoAngle(){return {clips:[],activeClipIndex:0,view:{zoom:1,x:0,y:0}};}
  function currentVideoSession(){
    const key=videoSessionKey();if(!videoReviewSessions.has(key))videoReviewSessions.set(key,{angles:[newVideoAngle(),newVideoAngle()],masterTime:0,syncOffset:0,speed:1,playing:false,autoSuggestion:null,syncMarkers:{A:null,B:null},waveformsVisible:false,loop:null,restoreAttempted:false});const session=videoReviewSessions.get(key);session.syncMarkers=session.syncMarkers||{A:null,B:null};session.loop=session.loop||null;session.angles.forEach(angle=>angle.view=angle.view||{zoom:1,x:0,y:0});return session;
  }
  function applyVideoView(index){const angle=currentVideoSession().angles[index],video=$(index?'videoB':'videoA'),view=angle.view||{zoom:1,x:0,y:0};video.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.zoom})`;const label=$(index?'videoZoomLabelB':'videoZoomLabelA');if(label)label.textContent=`${Math.round(view.zoom*100)}%`;}
  async function saveVideoView(index){try{await videoHandlePut(trialVideoViewKey(index),structuredClone(currentVideoSession().angles[index].view));}catch{}}
  function adjustVideoZoom(index,delta){const angle=currentVideoSession().angles[index];angle.view=angle.view||{zoom:1,x:0,y:0};angle.view.zoom=Math.max(.25,Math.min(5,Number(angle.view.zoom||1)+Number(delta||0)));applyVideoView(index);saveVideoView(index);}
  function resetVideoView(index){currentVideoSession().angles[index].view={zoom:1,x:0,y:0};applyVideoView(index);saveVideoView(index);showToast(`Angle ${index?'B':'A'} framing reset.`);}
  function playlistDuration(angle){return angle.clips.reduce((sum,clip)=>sum+Number(clip.duration||0),0);}
  function clipStart(angle,index){return angle.clips.slice(0,index).reduce((sum,clip)=>sum+Number(clip.duration||0),0);}
  function locateVideoTime(angle,time){
    if(!angle.clips.length)return null;let remaining=Math.max(0,Number(time)||0);for(let index=0;index<angle.clips.length;index++){const duration=Number(angle.clips[index].duration||0);if(remaining<=duration||index===angle.clips.length-1)return {index,time:Math.min(remaining,Math.max(0,duration-.001))};remaining-=duration;}return null;
  }
  function masterDuration(session){
    const a=playlistDuration(session.angles[0]),b=playlistDuration(session.angles[1]);if(a&&b)return Math.max(0,Math.min(a,b-session.syncOffset));return a||Math.max(0,b-session.syncOffset)||0;
  }
  function currentAnglePlaylistTime(index){
    const session=currentVideoSession(),angle=session.angles[index],video=$(index?'videoB':'videoA');if(!angle.clips.length)return 0;return clipStart(angle,angle.activeClipIndex)+(Number(video.currentTime)||0);
  }
  function angleTargetTime(session,index){return Math.max(0,session.masterTime+(index?session.syncOffset:0));}
  function stopVideoPlayback(){
    const session=currentVideoSession();session.playing=false;cancelAnimationFrame(videoAnimationFrame);videoAnimationFrame=0;['videoA','videoB'].forEach(id=>$(id).pause());updateVideoTransport();
  }
  function pauseAllVideoPlayback(){videoReviewSessions.forEach(session=>session.playing=false);cancelAnimationFrame(videoAnimationFrame);videoAnimationFrame=0;['videoA','videoB'].forEach(id=>$(id)?.pause());}
  function loadVideoAngle(index,targetTime,shouldPlay){
    const session=currentVideoSession(),angle=session.angles[index],video=$(index?'videoB':'videoA'),located=locateVideoTime(angle,targetTime);if(!located){video.pause();video.removeAttribute('src');video.dataset.clipId='';return;}
    angle.activeClipIndex=located.index;const clip=angle.clips[located.index],apply=()=>{const safe=Math.min(located.time,Math.max(0,(Number(video.duration)||Number(clip.duration)||0)-.001));if(Math.abs((Number(video.currentTime)||0)-safe)>.045)video.currentTime=safe;video.playbackRate=session.speed;applyVideoView(index);if(shouldPlay)video.play().catch(()=>{});};
    if(video.dataset.clipId!==clip.id){video.pause();video.dataset.clipId=clip.id;video.src=clip.url;video.load();video.addEventListener('loadedmetadata',()=>{clip.duration=Number(video.duration)||clip.duration||0;apply();renderVideoPlaylists();updateVideoTransport();renderVideoShotTimeline();},{once:true});}else apply();
  }
  function syncBothVideos(force=false){
    if(videoControllerBusy)return;videoControllerBusy=true;const session=currentVideoSession();[0,1].forEach(index=>{const video=$(index?'videoB':'videoA'),target=angleTargetTime(session,index),actual=currentAnglePlaylistTime(index);if(force||Math.abs(actual-target)>.12)loadVideoAngle(index,target,session.playing);else{video.playbackRate=session.speed;if(session.playing&&video.paused)video.play().catch(()=>{});}});videoControllerBusy=false;
  }
  function setVideoMasterTime(value,force=true){const session=currentVideoSession(),duration=masterDuration(session);session.masterTime=Math.max(0,Math.min(Number(value)||0,duration));syncBothVideos(force);updateVideoTransport();renderVideoShotTimeline();}
  function tickVideoPlayback(now){
    const session=currentVideoSession();if(!session.playing)return;session.masterTime=videoClockMaster+((now-videoClockStarted)/1000)*session.speed;const duration=masterDuration(session);if(session.loop&&session.masterTime>=session.loop.end){session.masterTime=session.loop.start;videoClockMaster=session.loop.start;videoClockStarted=now;syncBothVideos(true);}else if(session.masterTime>=duration){session.masterTime=duration;stopVideoPlayback();syncBothVideos(true);return;}else syncBothVideos(false);updateVideoTransport();updateVideoShotPlayhead();videoAnimationFrame=requestAnimationFrame(tickVideoPlayback);
  }
  function toggleVideoPlayback(){
    const session=currentVideoSession();if(session.playing){stopVideoPlayback();return;}if(!masterDuration(session)){showToast('Add videos to an angle first.');return;}session.playing=true;videoClockStarted=performance.now();videoClockMaster=session.masterTime;syncBothVideos(true);videoAnimationFrame=requestAnimationFrame(tickVideoPlayback);updateVideoTransport();
  }
  function stepVideoFrame(direction){stopVideoPlayback();setVideoMasterTime(currentVideoSession().masterTime+direction/30,true);}
  function jumpVideo(seconds){const session=currentVideoSession(),wasPlaying=session.playing;setVideoMasterTime(session.masterTime+Number(seconds||0),true);if(wasPlaying){videoClockMaster=session.masterTime;videoClockStarted=performance.now();}}
  function toggleVideoLoop(){const session=currentVideoSession(),duration=masterDuration(session);if(!duration)return;if(session.loop){session.loop=null;showToast('10-second loop stopped.');}else{session.loop={start:Math.max(0,session.masterTime-5),end:Math.min(duration,session.masterTime+5)};if(session.loop.end-session.loop.start<.05)return;showToast(`Looping ${formatTime(session.loop.start*1000)} to ${formatTime(session.loop.end*1000)}.`);}updateVideoTransport();}
  function updateVideoTransport(){
    const session=currentVideoSession(),duration=masterDuration(session),seek=$('videoSeek');seek.max=String(duration);seek.value=String(Math.min(session.masterTime,duration));$('videoPlayPause').textContent=session.playing?'❚❚ Pause both':'▶ Play both';document.querySelectorAll('[data-video-speed]').forEach(button=>button.classList.toggle('active',Number(button.dataset.videoSpeed)===Number(session.speed)));['videoPlayPause','videoFrameBack','videoFrameForward','videoBackFive','videoForwardFive','videoLoopTen'].forEach(id=>$(id).disabled=!duration);$('videoLoopTen').classList.toggle('active',Boolean(session.loop));$('videoLoopTen').textContent=session.loop?'Stop −5s ↔ +5s loop':'Loop −5s ↔ +5s';$('videoPlaceMarkerA').disabled=!session.angles[0].clips.length;$('videoPlaceMarkerB').disabled=!session.angles[1].clips.length;$('videoApplyMarkers').disabled=![session.syncMarkers.A,session.syncMarkers.B].every(Number.isFinite);$('videoTimeLabel').textContent=`${formatTime(session.masterTime*1000)} / ${formatTime(duration*1000)}`;updateVideoGoalieTimerDisplays();
  }
  function updateVideoShotPlayhead(){const duration=masterDuration(currentVideoSession()),left=duration?currentVideoSession().masterTime/duration*100:0;$('videoShotPlayhead').style.left=`${Math.max(0,Math.min(100,left))}%`;}
  function renderVideoPlaylists(){
    const session=currentVideoSession();session.angles.forEach((angle,index)=>{const root=$(index?'videoPlaylistB':'videoPlaylistA');root.innerHTML=angle.clips.length?angle.clips.map((clip,clipIndex)=>`<div class="video-clip ${clipIndex===angle.activeClipIndex?'active':''}"><span class="video-clip-index">${clipIndex+1}</span><span class="video-clip-name" title="${esc(clip.name)}">${esc(clip.name)}</span><span class="video-clip-duration">${clip.duration?formatTime(clip.duration*1000):'Loading…'}</span><span class="video-clip-actions"><button type="button" data-video-move="${index}|${clipIndex}|-1" ${clipIndex?'':'disabled'} aria-label="Move earlier">↑</button><button type="button" data-video-move="${index}|${clipIndex}|1" ${clipIndex<angle.clips.length-1?'':'disabled'} aria-label="Move later">↓</button><button type="button" class="danger" data-video-remove="${index}|${clip.id}" aria-label="Remove video">×</button></span></div>`).join(''):'<div class="empty-state">No videos in this playlist.</div>';});
  }
  async function loadRememberedTrialDirectory(){const trialId=activeTrialVideoId();if(loadedVideoDirectoryTrialId===trialId)return videoTrialDirectoryHandle;loadedVideoDirectoryTrialId=trialId;videoTrialDirectoryHandle=null;try{videoTrialDirectoryHandle=await videoHandleGet(trialVideoDirectoryKey())||null;}catch{}const status=$('videoFolderStatus');if(status)status.textContent=videoTrialDirectoryHandle?`Remembered trial folder: ${videoTrialDirectoryHandle.name}`:'No video folder remembered for this trial.';return videoTrialDirectoryHandle;}
  async function chooseTrialVideoFolder(){if(!('showDirectoryPicker' in window)){showToast('Folder remembering requires Chrome over HTTPS, localhost, or an installed PWA.');return;}try{const handle=await window.showDirectoryPicker({mode:'read'});await videoHandlePut(trialVideoDirectoryKey(),handle);videoTrialDirectoryHandle=handle;loadedVideoDirectoryTrialId=activeTrialVideoId();$('videoFolderStatus').textContent=`Remembered trial folder: ${handle.name}`;showToast('This video folder is now remembered for the current trial.');}catch(error){if(error?.name!=='AbortError')showToast(`The trial video folder could not be remembered: ${error.message||error}`);}}
  async function rememberAngleHandles(index){const handles=currentVideoSession().angles[index].clips.map(clip=>clip.fileHandle).filter(Boolean);try{await videoHandlePut(trialVideoFilesKey(index),handles);}catch{showToast('Chrome could not save the remembered video file links.');}}
  async function chooseVideoFiles(index){if(!('showOpenFilePicker' in window)){$(index?'videoFileB':'videoFileA').click();return;}try{const options={multiple:true};if(videoTrialDirectoryHandle)options.startIn=videoTrialDirectoryHandle;const handles=await window.showOpenFilePicker(options),files=[];for(const handle of handles)files.push(await handle.getFile());await addVideoFiles(index,files,handles);await rememberAngleHandles(index);$('videoFolderStatus').textContent=`Remembered ${currentVideoSession().angles[0].clips.filter(clip=>clip.fileHandle).length} Angle A and ${currentVideoSession().angles[1].clips.filter(clip=>clip.fileHandle).length} Angle B video file link(s) for this section.`;}catch(error){if(error?.name!=='AbortError')showToast(`The video files could not be opened: ${error.message||error}`);}}
  async function restoreRememberedVideoFiles(requestPermission=false){const session=currentVideoSession();if(session.restoreAttempted&&!requestPermission)return;session.restoreAttempted=true;let needsPermission=false,restored=0,remembered=0;for(let index=0;index<2;index++){try{const savedView=await videoHandleGet(trialVideoViewKey(index));if(savedView&&Number.isFinite(Number(savedView.zoom)))session.angles[index].view={zoom:Number(savedView.zoom),x:Number(savedView.x)||0,y:Number(savedView.y)||0};}catch{}applyVideoView(index);if(session.angles[index].clips.length)continue;let handles=[];try{handles=await videoHandleGet(trialVideoFilesKey(index))||[];}catch{}remembered+=handles.length;if(!handles.length)continue;const available=[];for(const handle of handles){if(await handlePermission(handle,requestPermission))available.push(handle);else needsPermission=true;}if(!available.length)continue;const files=[],usableHandles=[];for(const handle of available){try{files.push(await handle.getFile());usableHandles.push(handle);}catch{needsPermission=true;}}if(files.length){await addVideoFiles(index,files,usableHandles);restored+=files.length;}}
    $('videoReconnectFiles').classList.toggle('hidden',!needsPermission);if(needsPermission)$('videoFolderStatus').textContent='Chrome needs permission to reconnect remembered videos for this trial section.';else if(restored)$('videoFolderStatus').textContent=`Reconnected ${restored} remembered video${restored===1?'':'s'} for this trial section.`;else if(remembered)$('videoFolderStatus').textContent='The remembered videos are already loaded.';}
  function probeVideoClip(clip){return new Promise(resolve=>{const probe=document.createElement('video');let finished=false;const done=()=>{if(finished)return;finished=true;clip.duration=Number(probe.duration)||0;probe.removeAttribute('src');resolve();};probe.preload='metadata';probe.src=clip.url;probe.onloadedmetadata=done;probe.onerror=done;});}
  async function addVideoFiles(index,files,fileHandles=[]){
    const session=currentVideoSession(),angle=session.angles[index],clips=Array.from(files||[]).map((file,fileIndex)=>({id:uid(),name:file.name,url:URL.createObjectURL(file),sourceFile:file,fileHandle:fileHandles[fileIndex]||null,duration:0}));if(!clips.length)return;invalidateAutoSync();angle.clips.push(...clips);renderVideoPlaylists();await Promise.all(clips.map(probeVideoClip));if(angle.clips.length===clips.length)loadVideoAngle(index,angleTargetTime(session,index),false);renderVideoPlaylists();updateVideoTransport();renderVideoShotTimeline();
  }
  function moveVideoClip(index,clipIndex,direction){
    stopVideoPlayback();const session=currentVideoSession(),angle=session.angles[index],target=clipIndex+direction;if(target<0||target>=angle.clips.length)return;invalidateAutoSync();[angle.clips[clipIndex],angle.clips[target]]=[angle.clips[target],angle.clips[clipIndex]];angle.activeClipIndex=0;setVideoMasterTime(session.masterTime,true);renderVideoPlaylists();rememberAngleHandles(index);
  }
  function removeVideoClip(index,clipId){
    stopVideoPlayback();const session=currentVideoSession(),angle=session.angles[index],clip=angle.clips.find(item=>item.id===clipId);if(!clip)return;invalidateAutoSync();videoWaveCache.delete(clip.id);URL.revokeObjectURL(clip.url);angle.clips=angle.clips.filter(item=>item.id!==clipId);angle.activeClipIndex=0;setVideoMasterTime(session.masterTime,true);renderVideoPlaylists();updateVideoTransport();renderVideoShotTimeline();rememberAngleHandles(index);
  }
  function syncCurrentVideoFrames(){
    const session=currentVideoSession();if(!session.angles.every(angle=>angle.clips.length)){showToast('Add videos to both angles before syncing.');return;}stopVideoPlayback();const a=currentAnglePlaylistTime(0),b=currentAnglePlaylistTime(1);session.syncOffset=b-a;session.masterTime=a;session.syncMarkers={A:a,B:b};session.autoSuggestion=null;renderAutoSyncPanel();renderVideoWaveforms();$('videoSyncStatus').textContent=`Angles synced at A ${formatTime(a*1000)} and B ${formatTime(b*1000)} · offset ${session.syncOffset>=0?'+':''}${session.syncOffset.toFixed(2)}s`;setVideoMasterTime(a,true);showToast('Both video angles are synced.');
  }
  function clearVideoSync(){const session=currentVideoSession();stopVideoPlayback();session.syncOffset=0;session.autoSuggestion=null;session.syncMarkers={A:null,B:null};session.loop=null;renderAutoSyncPanel();renderVideoWaveforms();$('videoSyncStatus').textContent='Angles start together. Set both to the same visible moment and choose Sync current frames for a precise offset.';setVideoMasterTime(session.masterTime,true);}
  function nudgeVideoAngleB(seconds){const session=currentVideoSession(),angle=session.angles[1];if(!angle.clips.length){showToast('Add videos to Angle B first.');return;}stopVideoPlayback();loadVideoAngle(1,currentAnglePlaylistTime(1)+Number(seconds||0),false);}

  function invalidateAutoSync(){const session=currentVideoSession();session.autoSuggestion=null;session.syncMarkers={A:null,B:null};renderAutoSyncPanel();updateVideoTransport();Promise.resolve().then(()=>renderVideoWaveforms());}
  function placeVideoSyncMarker(index){const session=currentVideoSession(),key=index?'B':'A',angle=session.angles[index];if(!angle.clips.length){showToast(`Add videos to Angle ${key} first.`);return;}stopVideoPlayback();session.syncMarkers[key]=currentAnglePlaylistTime(index);updateVideoTransport();renderVideoWaveforms();$('videoSyncStatus').textContent=`Marker ${key} placed at ${formatTime(session.syncMarkers[key]*1000)}${[session.syncMarkers.A,session.syncMarkers.B].every(Number.isFinite)?' · Sync Markers is ready.':''}`;}
  function applyVideoSyncMarkers(){const session=currentVideoSession(),a=session.syncMarkers.A,b=session.syncMarkers.B;if(!Number.isFinite(a)||!Number.isFinite(b)){showToast('Place a marker on both angle waveforms first.');return;}session.syncOffset=b-a;session.masterTime=a;session.autoSuggestion=null;renderAutoSyncPanel();setVideoMasterTime(a,true);$('videoSyncStatus').textContent=`Markers synced · A ${formatTime(a*1000)} · B ${formatTime(b*1000)} · offset ${session.syncOffset>=0?'+':''}${session.syncOffset.toFixed(2)}s`;showToast('Both playlists synced to the manual markers.');}
  async function toggleVideoWaveforms(){const session=currentVideoSession();session.waveformsVisible=!session.waveformsVisible;$('videoToggleWaveforms').textContent=session.waveformsVisible?'Hide Waveforms':'Show Waveforms';await renderVideoWaveforms();}
  function drawVideoWaveform(canvas,envelope,index){const context=canvas.getContext('2d'),width=canvas.width=1200,height=canvas.height=76,mid=height/2;context.fillStyle='#06111a';context.fillRect(0,0,width,height);context.fillStyle=index?'#ef8d2f':'#36b7d9';for(let x=0;x<width;x++){const sample=Math.min(envelope.env.length-1,Math.floor(x/width*envelope.env.length)),amplitude=Math.min(mid-4,Math.abs(envelope.env[sample])*(mid*.36)+2);context.fillRect(x,mid-amplitude,1,amplitude*2);}const marker=currentVideoSession().syncMarkers[index?'B':'A'];if(Number.isFinite(marker)){const duration=playlistDuration(currentVideoSession().angles[index]),x=Math.max(0,Math.min(width,marker/Math.max(.01,duration)*width));context.strokeStyle='#fff';context.lineWidth=3;context.beginPath();context.moveTo(x,0);context.lineTo(x,height);context.stroke();context.fillStyle='#fff';context.beginPath();context.arc(x,8,6,0,Math.PI*2);context.fill();}}
  async function renderVideoWaveforms(){const session=currentVideoSession(),panel=$('videoWaveformPanel');if(!session.waveformsVisible){panel.classList.add('hidden');panel.innerHTML='';return;}panel.classList.remove('hidden');const key=videoSessionKey();panel.innerHTML='<div class="video-waveform-intro"><strong>Manual sync waveforms</strong><br>Click the matching sound on each waveform to place Marker A and Marker B, then choose Sync Markers.</div><div class="video-waveform-loading">Generating audio waveforms locally… Longer files may take a few minutes.</div>';try{const results=[];for(const angle of session.angles)results.push(angle.clips.length?await playlistAudioEnvelope(angle):null);if(key!==videoSessionKey())return;panel.innerHTML=results.map((result,index)=>{const marker=session.syncMarkers[index?'B':'A'];return `<div class="video-waveform-row"><div class="video-waveform-label"><strong>Angle ${index?'B':'A'}</strong><span>${Number.isFinite(marker)?`Marker ${formatTime(marker*1000)}`:'No marker placed'}</span></div>${result?`<canvas id="videoWaveform${index}" aria-label="Angle ${index?'B':'A'} audio waveform"></canvas>`:'<div class="muted">Add videos to this angle.</div>'}</div>`}).join('');results.forEach((result,index)=>{if(!result)return;const canvas=$(`videoWaveform${index}`);drawVideoWaveform(canvas,result,index);canvas.addEventListener('pointerdown',event=>{const active=currentVideoSession(),keyName=index?'B':'A',rect=canvas.getBoundingClientRect(),time=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*playlistDuration(active.angles[index]);stopVideoPlayback();active.syncMarkers[keyName]=time;loadVideoAngle(index,time,false);updateVideoTransport();renderVideoWaveforms();$('videoSyncStatus').textContent=`Marker ${keyName} placed at ${formatTime(time*1000)}${[active.syncMarkers.A,active.syncMarkers.B].every(Number.isFinite)?' · Sync Markers is ready.':''}`;});});}catch(error){if(key!==videoSessionKey())return;panel.innerHTML=`<strong>Waveforms could not be generated.</strong><div class="video-waveform-intro">${esc(error.message||String(error))} Videos without usable audio can still be aligned with the frame and one-second controls.</div>`;}}
  function normalizeAudioEnvelope(values){const mean=values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length),variance=values.reduce((sum,value)=>sum+(value-mean)*(value-mean),0)/Math.max(1,values.length),sd=Math.sqrt(variance)||1;return Float32Array.from(values,value=>(value-mean)/sd);}
  const VIDEO_AUDIO_HZ=10,VIDEO_STREAM_AUDIO_HZ=4,VIDEO_AUDIO_BUFFER_LIMIT=256*1024*1024;
  function setVideoAudioProgress(clip,progress){const percent=Math.max(0,Math.min(100,Math.round(progress*100))),message=`Streaming audio from ${clip.name} · ${percent}%`;const loading=$('videoWaveformPanel')?.querySelector('.video-waveform-loading');if(loading)loading.textContent=message;const auto=$('videoAutoSyncPanel');if(auto&&!auto.classList.contains('hidden')&&currentVideoSession().autoSuggestion?.status==='analysing')auto.innerHTML=`<strong>Analysing both playlist audio tracks…</strong><span>${esc(message)} · the full MP4 is not loaded into memory.</span>`;}
  async function streamedAudioEnvelopeForClip(clip){
    if(!clip.url)throw new Error(`Reload ${clip.name} first.`);const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)throw new Error('Audio analysis is not supported by this browser.');const media=document.createElement('video'),context=new AudioContextClass(),analyser=context.createAnalyser(),silent=context.createGain(),source=context.createMediaElementSource(media);let timer=0,lastProgress=-1;media.preload='auto';media.playsInline=true;media.src=clip.url;media.playbackRate=4;media.defaultPlaybackRate=4;media.preservesPitch=false;analyser.fftSize=2048;analyser.smoothingTimeConstant=.15;silent.gain.value=0;source.connect(analyser);analyser.connect(silent);silent.connect(context.destination);const samples=new Float32Array(analyser.fftSize);try{
      await context.resume();const metadata=new Promise((resolve,reject)=>{if(Number.isFinite(media.duration)&&media.duration>0){resolve();return;}media.addEventListener('loadedmetadata',resolve,{once:true});media.addEventListener('error',()=>reject(new Error(`${clip.name} could not be opened for streaming audio analysis.`)),{once:true});});const playing=media.play().catch(error=>{throw new Error(`Chrome blocked streamed audio analysis for ${clip.name}. Click Auto Sync or Show Waveforms again.`)});await metadata;await playing;const duration=Number(media.duration)||Number(clip.duration)||0;if(!(duration>0))throw new Error(`${clip.name} has no readable duration.`);clip.duration=duration;const values=new Float32Array(Math.max(1,Math.ceil(duration*VIDEO_STREAM_AUDIO_HZ)));let lastBin=-1,lastValue=0,variationMin=Infinity,variationMax=-Infinity;await new Promise((resolve,reject)=>{const started=performance.now(),maximum=Math.max(45000,duration/Math.max(1,media.playbackRate)*2200+30000);const finish=()=>{clearInterval(timer);timer=0;resolve();};media.addEventListener('ended',finish,{once:true});media.addEventListener('error',()=>{clearInterval(timer);timer=0;reject(new Error(`${clip.name} stopped while its audio was being streamed.`));},{once:true});timer=setInterval(()=>{if(performance.now()-started>maximum){clearInterval(timer);timer=0;reject(new Error(`${clip.name} took too long to analyse. Keep this tab visible and try again.`));return;}analyser.getFloatTimeDomainData(samples);let sum=0;for(let index=0;index<samples.length;index++)sum+=samples[index]*samples[index];const rms=Math.sqrt(sum/samples.length),bin=Math.max(0,Math.min(values.length-1,Math.floor((Number(media.currentTime)||0)*VIDEO_STREAM_AUDIO_HZ)));if(bin>lastBin){for(let fill=lastBin+1;fill<=bin;fill++)values[fill]=rms;lastBin=bin;lastValue=rms;variationMin=Math.min(variationMin,rms);variationMax=Math.max(variationMax,rms);}else if(bin>=0){values[bin]=Math.max(values[bin],rms);lastValue=values[bin];variationMin=Math.min(variationMin,lastValue);variationMax=Math.max(variationMax,lastValue);}const progress=(Number(media.currentTime)||0)/duration,step=Math.floor(progress*100);if(step>=lastProgress+2){lastProgress=step;setVideoAudioProgress(clip,progress);}},25);});for(let index=Math.max(0,lastBin+1);index<values.length;index++)values[index]=lastValue;if(!(variationMax-variationMin>1e-7))throw new Error(`${clip.name} contains no usable audio variation.`);setVideoAudioProgress(clip,1);return {values:Array.from(values),hz:VIDEO_STREAM_AUDIO_HZ,duration,streamed:true};
    }finally{if(timer)clearInterval(timer);media.pause();media.removeAttribute('src');media.load();try{source.disconnect();analyser.disconnect();silent.disconnect();}catch{}try{await context.close();}catch{}}
  }
  async function audioEnvelopeForClip(clip){
    if(videoWaveCache.has(clip.id))return videoWaveCache.get(clip.id);const task=(async()=>{if(!clip.sourceFile&&!clip.url)throw new Error(`Reload ${clip.name} first.`);const size=Number(clip.sourceFile?.size)||0;if(size>VIDEO_AUDIO_BUFFER_LIMIT)return streamedAudioEnvelopeForClip(clip);const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)throw new Error('Audio analysis is not supported by this browser.');let data;try{data=clip.sourceFile?await clip.sourceFile.arrayBuffer():await fetch(clip.url).then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.arrayBuffer();});}catch{return streamedAudioEnvelopeForClip(clip);}const context=new AudioContextClass();try{let buffer;try{buffer=await context.decodeAudioData(data);}catch{data=null;try{await context.close();}catch{}return streamedAudioEnvelopeForClip(clip);}const channel=buffer.getChannelData(0),hz=VIDEO_AUDIO_HZ,step=Math.max(1,Math.floor(buffer.sampleRate/hz)),values=[];for(let start=0;start<channel.length;start+=step){const end=Math.min(channel.length,start+step);let sum=0;for(let index=start;index<end;index++)sum+=channel[index]*channel[index];values.push(Math.sqrt(sum/Math.max(1,end-start)));}return {values,hz,duration:buffer.duration};}finally{data=null;try{await context.close();}catch{}}})();videoWaveCache.set(clip.id,task);try{return await task;}catch(error){videoWaveCache.delete(clip.id);throw error;}
  }
  function audioValuesAtCommonRate(part){const source=part.values||[],sourceHz=Number(part.hz)||VIDEO_AUDIO_HZ;if(sourceHz===VIDEO_AUDIO_HZ)return Array.from(source);const duration=Number(part.duration)||source.length/sourceHz,length=Math.max(1,Math.ceil(duration*VIDEO_AUDIO_HZ)),values=new Array(length);for(let index=0;index<length;index++){const sourcePosition=index/VIDEO_AUDIO_HZ*sourceHz,left=Math.max(0,Math.min(source.length-1,Math.floor(sourcePosition))),right=Math.min(source.length-1,left+1),mix=sourcePosition-left;values[index]=(Number(source[left])||0)*(1-mix)+(Number(source[right])||0)*mix;}return values;}
  async function playlistAudioEnvelope(angle){const parts=[];for(const clip of angle.clips)parts.push(await audioEnvelopeForClip(clip));const values=parts.flatMap(audioValuesAtCommonRate);if(values.length<100)throw new Error('At least ten seconds of audio is needed in each angle.');const range=values.reduce((result,value)=>({min:Math.min(result.min,value),max:Math.max(result.max,value)}),{min:Infinity,max:-Infinity});if(range.max-range.min<1e-7)throw new Error('The selected videos contain no usable audio variation.');return {env:normalizeAudioEnvelope(values),hz:VIDEO_AUDIO_HZ};}
  function audioCorrelation(a,b,lag){const start=Math.max(0,-lag),end=Math.min(a.length,b.length-lag);if(end-start<100)return -2;const stride=Math.max(1,Math.ceil((end-start)/8000));let sum=0,aa=0,bb=0,count=0;for(let index=start;index<end;index+=stride){const x=a[index],y=b[index+lag];sum+=x*y;aa+=x*x;bb+=y*y;count++;}return count<100?-2:sum/Math.sqrt(aa*bb||1);}
  function findAutoSyncOffset(angleA,angleB,hz=10){const maxLag=Math.min(Math.floor(Math.max(angleA.length,angleB.length)*.8),hz*900),coarseStep=Math.max(1,Math.ceil(maxLag/600));let best={score:-2,lag:0};for(let lag=-maxLag;lag<=maxLag;lag+=coarseStep){const score=audioCorrelation(angleB,angleA,lag);if(score>best.score)best={score,lag};}const start=Math.max(-maxLag,best.lag-coarseStep),end=Math.min(maxLag,best.lag+coarseStep);for(let lag=start;lag<=end;lag++){const score=audioCorrelation(angleB,angleA,lag);if(score>best.score)best={score,lag};}return {offset:-best.lag/hz,score:best.score,confidence:Math.max(0,Math.min(99,Math.round((best.score+.15)/1.15*100)))};}
  function renderAutoSyncPanel(){const session=currentVideoSession(),panel=$('videoAutoSyncPanel'),suggestion=session.autoSuggestion;if(!suggestion){panel.classList.add('hidden');panel.innerHTML='';return;}panel.classList.remove('hidden');if(suggestion.status==='analysing'){panel.innerHTML='<strong>Analysing both playlist audio tracks…</strong><span>This stays on this device and may take a moment.</span>';return;}if(suggestion.status==='applied'){panel.innerHTML=`<strong>Auto Sync applied</strong><span>Angle B offset ${suggestion.offset>=0?'+':''}${suggestion.offset.toFixed(2)}s. Play both angles to verify the result.</span>`;return;}const low=suggestion.confidence<60;panel.innerHTML=`<strong>Auto Sync suggestion</strong><span>Audio waveform correlation compared the complete Angle A and Angle B playlists.</span><div class="auto-sync-result"><div><span class="auto-sync-value">Angle B ${suggestion.offset>=0?'+':''}${suggestion.offset.toFixed(2)}s</span><span class="auto-sync-confidence ${low?'low':''}">${suggestion.confidence}% confidence</span></div><span>${low?'Low confidence — review carefully or use manual alignment.':'Review the proposed offset before accepting it.'}</span></div><button type="button" class="button primary" data-accept-auto-sync>Accept Auto Sync</button>`;}
  async function suggestAutoSync(){const session=currentVideoSession();if(!session.angles.every(angle=>angle.clips.length)){showToast('Add videos to both angle playlists first.');return;}stopVideoPlayback();session.autoSuggestion={status:'analysing'};renderAutoSyncPanel();$('videoSuggestAutoSync').disabled=true;try{const a=await playlistAudioEnvelope(session.angles[0]),b=await playlistAudioEnvelope(session.angles[1]),suggestion=findAutoSyncOffset(a.env,b.env,a.hz);if(suggestion.score<=-1)throw new Error('The audio tracks did not have enough overlap to compare.');session.autoSuggestion={...suggestion,status:'suggested'};renderAutoSyncPanel();}catch(error){session.autoSuggestion=null;const panel=$('videoAutoSyncPanel');panel.classList.remove('hidden');panel.innerHTML=`<strong>Auto Sync could not analyse these videos.</strong><span>${esc(error.message||String(error))} Use the manual Angle B alignment controls instead.</span>`;}finally{$('videoSuggestAutoSync').disabled=false;}}
  function acceptAutoSync(){const session=currentVideoSession(),suggestion=session.autoSuggestion;if(!suggestion||suggestion.status!=='suggested')return;session.syncOffset=suggestion.offset;session.autoSuggestion={...suggestion,status:'applied'};$('videoSyncStatus').textContent=`Auto synced · Angle B offset ${session.syncOffset>=0?'+':''}${session.syncOffset.toFixed(2)}s`;setVideoMasterTime(session.masterTime,true);renderAutoSyncPanel();showToast('Auto Sync applied to both playlists.');}
  function renderVideoShotTimeline(){
    const dayId=$('videoDay').value,drillId=$('videoDrill').value,duration=masterDuration(currentVideoSession()),events=getEvents({dayId,drillId}),linked=events.filter(event=>Number.isFinite(Number(event.videoReview?.masterTime))),unlinked=events.length-linked.length;$('videoShotMarkers').innerHTML=duration?linked.map((event,index)=>{const left=Math.max(0,Math.min(100,Number(event.videoReview.masterTime)/duration*100));return `<button type="button" class="video-shot-marker ${esc(event.outcome.split(' ')[0])}" style="left:${left}%" data-video-shot-time="${Number(event.videoReview.masterTime)}" title="Shot ${index+1} · ${esc(event.outcome)} · ${formatTime(Number(event.videoReview.masterTime)*1000)}">${index+1}</button>`}).join(''):'';$('videoUnlinkedShots').textContent=unlinked?`${unlinked} earlier shot${unlinked===1?' is':'s are'} not linked to a video time.`:'';updateVideoShotPlayhead();
  }

  function renderVideoReview(){
    const daySel=$('videoDay');ensureSelect(daySel,state.days.map((d,i)=>({id:d.id,name:`Day ${i+1} · ${dayLabel(d.date)}`})),'Add a trial day first',daySel.value||preferredWorkingDayId());const drills=drillOptionsForDay(daySel.value);ensureSelect($('videoDrill'),drills,'Schedule a section first');const drill=state.drills.find(d=>d.id===$('videoDrill').value),lanes=drill?.name==='Match Situation'?2:1,readOnly=completedDay(daySel.value);$('videoReadOnlyNotice').classList.toggle('hidden',!readOnly);
    $('swapVideoGoalies').classList.toggle('hidden',!drill||lanes!==2);$('swapVideoGoalies').disabled=readOnly;
    ['A','B'].forEach((name,i)=>{const wrap=$(`videoStation${name}`);wrap.innerHTML=drill&&i<lanes?stationMarkup(i,daySel.value,drill.id,false):'';if(drill&&i<lanes){if(readOnly)wrap.querySelectorAll('button,input,textarea,select').forEach(control=>control.disabled=true);else bindStationControls(wrap,daySel.value,drill.id,false);}});
    renderEventTimeline('videoEventTimeline',daySel.value,drill?.id,'video');
    const videoSession=currentVideoSession();$('videoSyncStatus').textContent=videoSession.syncOffset?`Angles synced · offset ${videoSession.syncOffset>=0?'+':''}${videoSession.syncOffset.toFixed(2)}s`:'Angles start together. Use the Angle B alignment buttons, then sync the current frames.';
    renderVideoPlaylists();updateVideoTransport();renderVideoShotTimeline();renderAutoSyncPanel();$('videoToggleWaveforms').textContent=currentVideoSession().waveformsVisible?'Hide Waveforms':'Show Waveforms';renderVideoWaveforms();syncBothVideos(true);applyVideoView(0);applyVideoView(1);loadRememberedTrialDirectory().then(()=>restoreRememberedVideoFiles(false));
  }

  function compareFilters(){return {dayId:$('compareDay').value,drillId:$('compareDrill').value,shotType:$('compareShot').value,situation:$('compareSituation').value}}
  function comparableCategories(stats){
    const entries=[];if(stats.attempts)entries.push(['Performance',stats.defenceRate]);CATEGORIES.forEach(cat=>{if(stats.categoryCounts?.[cat])entries.push([cat,(stats.category[cat]||0)*20]);});return entries;
  }
  function strengthDevelopment(stats){
    const entries=comparableCategories(stats);if(!entries.length)return{strength:'More data needed',development:'More data needed'};
    const high=Math.max(...entries.map(([,value])=>value)),low=Math.min(...entries.map(([,value])=>value));
    return{strength:entries.filter(([,value])=>Math.abs(value-high)<.001).map(([name])=>name).join(', '),development:entries.filter(([,value])=>Math.abs(value-low)<.001).map(([name])=>name).join(', ')};
  }
  function goalieScore(stats){
    const influence=Math.min(100,Math.max(0,Number(state.ratingsInfluence||0)))/100;
    return (stats.defenceRate+ratingsScore(stats)*influence)/(1+influence);
  }
  function ratingsScore(stats){
    const available=CATEGORIES.filter(key=>stats.categoryCounts?.[key]),total=available.reduce((sum,key)=>sum+Math.max(0,Number(state.ratingWeights[key]||0)),0)||1;
    return available.reduce((sum,key)=>sum+(stats.category[key]||0)*20*Math.max(0,Number(state.ratingWeights[key]||0)),0)/total;
  }
  function rankingRound(dayFilter='all'){
    const dayId=dayFilter!=='all'?dayFilter:state.days.filter(day=>dayCanStart(day.id)).at(-1)?.id,index=dayIndex(dayId),previous=index>0?state.days[index-1]:null,decided=index<=0||Boolean(previous&&state.progressions[previous.id]?.confirmed),ids=new Set(dayId?eligibleGoaliesForDay(dayId).map(goalie=>goalie.id):state.goalies.map(goalie=>goalie.id));return {dayId,index,decided,ids};
  }

  function renderComparison(){
    const keep=compareFilters();
    $('compareDay').innerHTML=optionList(state.days.map((d,i)=>({id:d.id,name:`Day ${i+1} · ${dayLabel(d.date)}`})),keep.dayId,'All days');
    $('compareDrill').innerHTML=optionList(state.drills.map(d=>({id:d.id,name:d.name})),keep.drillId,'All drills');
    $('compareShot').innerHTML=optionList(SHOT_TYPES.map(x=>({value:x,label:x})),keep.shotType,'All shot types');
    $('compareSituation').innerHTML=optionList(SITUATIONS.map(x=>({value:x,label:x})),keep.situation,'All situations');
    const filters=compareFilters();
    const total=CATEGORIES.reduce((sum,key)=>sum+Number(state.ratingWeights[key]||0),0);
    $('weightControls').innerHTML=`<div class="influence-control"><div><strong>Ratings influence</strong><span>At 100%, the complete ratings score has the same influence as Defence Rate. Ratings can never outweigh actual performance statistics.</span></div><div class="weight-row"><label>Overall ratings</label><input type="range" min="0" max="100" value="${state.ratingsInfluence}" data-ratings-influence><output>${state.ratingsInfluence}%</output></div></div><div class="rating-weight-heading"><strong>Individual ratings within the ratings score</strong><span class="pill ${total===100?'success':'warning'}">${total}%</span></div>${CATEGORIES.map(key=>`<div class="weight-row"><label>${key}</label><input type="range" min="0" max="100" value="${state.ratingWeights[key]}" data-rating-weight="${key}"><output>${state.ratingWeights[key]}%</output></div>`).join('')}`;
    $('weightTotal').textContent=`Ratings ${state.ratingsInfluence}%`;$('weightTotal').className='pill success';
    document.querySelector('[data-ratings-influence]').addEventListener('input',event=>{state.ratingsInfluence=Number(event.target.value);saveState();renderComparison();});
    document.querySelectorAll('[data-rating-weight]').forEach(input=>input.addEventListener('input',()=>{state.ratingWeights[input.dataset.ratingWeight]=Number(input.value);saveState();renderComparison();}));
    const results=state.goalies.map(goalie=>({goalie,stats:goalieStats(goalie.id,filters)})).map(x=>({...x,score:goalieScore(x.stats)})).sort((a,b)=>b.score-a.score);
    const round=rankingRound(filters.dayId);
    $('rankingList').innerHTML=results.length?results.map((item,index)=>{const didNotProgress=round.index>0&&round.decided&&!round.ids.has(item.goalie.id);return `<div class="rank-row ${didNotProgress?'not-current-round':''}"><span class="rank-number">${index+1}</span><div><strong>${esc(item.goalie.name)}</strong><div class="muted">${item.stats.attempts} attempts · ${pct(item.stats.defenceRate)} defence${didNotProgress?' · Did not progress to current round':''}</div></div><strong class="rank-score">${item.score.toFixed(1)}</strong></div>`}).join(''):'<div class="empty-state">Add goalkeepers to create the ranking.</div>';
    $('comparisonWarnings').innerHTML=comparisonWarnings(results,filters);
    $('comparisonCards').innerHTML=results.map(item=>comparisonCard(item)).join('')||'<div class="empty-state">Comparison cards will appear after goalkeepers are added.</div>';
  }

  function comparisonWarnings(results,filters){
    const active=results.filter(r=>r.stats.attempts);if(active.length<2)return '<div class="warning-card">Record at least two goalkeepers under the same conditions before relying on the comparison.</div>';
    const warnings=[],sessions=filters.dayId&&filters.dayId!=='all'?state.days.filter(d=>d.id===filters.dayId):state.days;
    sessions.forEach(day=>{const sessionStats=eligibleGoaliesForDay(day.id).map(goalie=>goalieStats(goalie.id,{...filters,dayId:day.id})).filter(s=>s.attempts);if(sessionStats.length<2)return;const counts=sessionStats.map(s=>s.attempts),min=Math.min(...counts),max=Math.max(...counts);if(max-min>Math.max(2,Math.round(max*.15)))warnings.push(`Unequal attempts in Trial Day ${state.days.indexOf(day)+1} (${dayLabel(day.date)}): goalkeepers faced between ${min} and ${max} recorded attempts.`);});
    const signatures=active.map(r=>new Set(r.stats.events.map(e=>`${e.shotType}|${e.situation}`)).size);if(Math.max(...signatures)!==Math.min(...signatures))warnings.push('Different shot types or situations are represented for different goalkeepers.');
    if(filters.drillId!=='all'){const drill=state.drills.find(d=>d.id===filters.drillId);active.forEach(r=>{if(drill&&r.stats.attempts<drill.target)warnings.push(`${r.goalie.name} has ${r.stats.attempts} of ${drill.target} target attempts.`);});}
    return warnings.map(w=>`<div class="warning-card">${esc(w)}</div>`).join('');
  }

  function comparisonCard(item){
    const cats={Performance:item.stats.attempts?item.stats.defenceRate:null,...item.stats.category},insight=strengthDevelopment(item.stats);
    return `<article class="comparison-card"><div class="comparison-head"><h2>${esc(item.goalie.name)}</h2><p>${esc(state.trial.gender)} · ${esc(state.trial.ageGroup)} · Overall score ${item.score.toFixed(1)} · ${formatTime(totalTimeFor(item.goalie.id))} in goal</p></div><div class="comparison-stats"><div class="comparison-stat"><strong>${item.stats.attempts}</strong><span>Attempts</span></div><div class="comparison-stat"><strong>${pct(item.stats.saveRate)}</strong><span>Save rate</span></div><div class="comparison-stat"><strong>${pct(item.stats.defenceRate)}</strong><span>Defence rate</span></div><div class="comparison-stat"><strong>${item.stats.rebounds}</strong><span>Rebounds</span></div><div class="comparison-stat"><strong>${item.stats.dangerous}</strong><span>Dangerous</span></div><div class="comparison-stat"><strong>${item.stats.aco}</strong><span>Angles closed</span></div></div><div class="category-bars">${Object.entries(cats).map(([cat,val])=>{const hasValue=cat==='Performance'?val!==null:Boolean(item.stats.categoryCounts?.[cat]);const scaled=cat==='Performance'?(val||0):(val||0)*20;return `<div class="category-bar"><span>${cat}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,scaled)}%"></div></div><strong>${hasValue?(cat==='Performance'?val.toFixed(0):(val||0).toFixed(1)):'N/C'}</strong></div>`}).join('')}</div><div class="insight-grid"><div class="insight-box"><strong>Strength</strong><span>${esc(insight.strength)}</span></div><div class="insight-box"><strong>Development</strong><span>${esc(insight.development)}</span></div></div></article>`;
  }

  function summaryMetrics(stats){return `${stats.attempts} attempts · ${pct(stats.saveRate)} save · ${pct(stats.defenceRate)} defence · ${stats.aco} angles closed`}
  function promotionCard(goalie,dayId,selected){
    const round=goalieStats(goalie.id,{dayId}),all=goalieStats(goalie.id),roundInsight=strengthDevelopment(round),allInsight=strengthDevelopment(all);
    const final=dayIndex(dayId)===state.days.length-1,progress=state.progressions[dayId]||{},status=final?(progress.finalStatuses?.[goalie.id]||'not_selected'):(progress.roundStatuses?.[goalie.id]||(selected?'progress':'not_progressing')),reason=progress.excusedReasons?.[goalie.id]||'';
    const control=final?`<label class="promotion-select"><span>Final outcome</span><select data-round-status="${goalie.id}"><option value="selected" ${status==='selected'?'selected':''}>Selected</option><option value="reserve" ${status==='reserve'?'selected':''}>Reserve</option><option value="non_travelling_reserve" ${status==='non_travelling_reserve'?'selected':''}>Non travelling reserve</option><option value="not_selected" ${status==='not_selected'?'selected':''}>Not selected</option><option value="excused" ${status==='excused'?'selected':''}>Excused from this round</option></select></label>`:`<label class="promotion-select"><span>Round outcome</span><select data-round-status="${goalie.id}"><option value="progress" ${status==='progress'?'selected':''}>Progress to next round</option><option value="excused" ${status==='excused'?'selected':''}>Excused from this round</option><option value="not_progressing" ${status==='not_progressing'?'selected':''}>Do not progress</option></select></label>`;
    const reasonField=`<label class="field excused-reason-field ${status==='excused'?'':'hidden'}"><span>Required reason</span><input data-excused-reason="${goalie.id}" value="${esc(reason)}" placeholder="Explain why this goalkeeper is excused"></label>`;
    return `<article class="promotion-card">${control}${reasonField}<h2>${esc(goalie.name)}</h2>${goalie.entryDayId===dayId&&dayIndex(dayId)>0?`<p class="late-entry-note"><strong>Late entry:</strong> ${esc(goalie.lateEntryReason||'Reason not recorded')}</p>`:''}<div class="round-summary"><section><h3>This round</h3><p>${summaryMetrics(round)}</p><p><strong>Score:</strong> ${goalieScore(round).toFixed(1)}</p><p><strong>Strength:</strong> ${esc(roundInsight.strength)}<br><strong>Development:</strong> ${esc(roundInsight.development)}</p></section><section><h3>All rounds</h3><p>${summaryMetrics(all)}</p><p><strong>Score:</strong> ${goalieScore(all).toFixed(1)}</p><p><strong>Strength:</strong> ${esc(allInsight.strength)}<br><strong>Development:</strong> ${esc(allInsight.development)}</p></section></div></article>`;
  }

  function renderPromotion(){
    const selector=$('promotionDay'),retained=selector.value||state.days.find(day=>day.status!=='completed')?.id||state.days.at(-1)?.id||'';ensureSelect(selector,state.days.map((d,i)=>({id:d.id,name:`Day ${i+1} · ${dayLabel(d.date)}`})),'Add a trial day first',retained);
    const day=state.days.find(d=>d.id===selector.value),index=dayIndex(selector.value),progress=day?(state.progressions[day.id]||{}):{},goalies=day?eligibleGoaliesForDay(day.id):[],decisionLocked=Boolean(progress.confirmed);
    $('promotionState').textContent=!day?'Select a day':day.status==='completed'?(progress.confirmed?'Decision confirmed':'Awaiting selection'):'Day in progress';$('promotionState').className=`pill ${progress.confirmed?'success':day?.status==='completed'?'warning':''}`;
    $('markDayComplete').disabled=!day||day.status==='completed';$('markDayComplete').textContent=day?.status==='completed'?'Day Completed':'Mark Day Completed';$('reopenDay').classList.toggle('hidden',!day||day.status!=='completed');
    const finalDay=index===state.days.length-1;
    $('promotionGuidance').textContent=!day?'Add a trial day first.':day.status!=='completed'?'Complete the recording day before confirming who progresses.':finalDay?'Choose the goalkeeper or goalkeepers who must appear in the final Selection Report.':'Choose the goalkeepers progressing to the next round. The next day remains locked until this decision is confirmed.';
    $('promotionGoalies').innerHTML=goalies.length?goalies.map(g=>promotionCard(g,day.id,(progress.goalieIds||[]).includes(g.id))).join(''):'<div class="empty-state">No eligible goalkeepers are available for this round.</div>';
    if(decisionLocked)$('promotionGoalies').querySelectorAll('select,input').forEach(control=>control.disabled=true);
    document.querySelectorAll('[data-round-status]').forEach(select=>{const goalie=state.goalies.find(item=>item.id===select.dataset.roundStatus),reasonInput=document.querySelector(`[data-excused-reason="${select.dataset.roundStatus}"]`),toggleReason=()=>{reasonInput?.closest('.excused-reason-field')?.classList.toggle('hidden',select.value!=='excused');};let acceptedValue=select.value;toggleReason();select.addEventListener('change',()=>{if(finalDay&&selectionOutcomeNeedsEligibilityWarning(goalie,select.value)&&!confirm(`${goalie.name} is ineligible for ${state.trial.ageGroup}.\n\nConfirm that you still want to mark this goalkeeper as ${outcomeLabel(select.value).toLowerCase()}?`)){select.value=acceptedValue;toggleReason();return;}acceptedValue=select.value;const target=state.progressions[day.id]||{};state.progressions[day.id]=target;if(finalDay)target.finalStatuses={...(target.finalStatuses||{}),[select.dataset.roundStatus]:select.value};else target.roundStatuses={...(target.roundStatuses||{}),[select.dataset.roundStatus]:select.value};toggleReason();saveState();});reasonInput?.addEventListener('input',()=>{state.progressions[day.id]=state.progressions[day.id]||{};state.progressions[day.id].excusedReasons={...(state.progressions[day.id].excusedReasons||{}),[select.dataset.roundStatus]:reasonInput.value};saveState();});});
    $('confirmPromotion').disabled=!day||day.status!=='completed'||!goalies.length||decisionLocked;$('confirmPromotion').textContent=decisionLocked?'Decision Confirmed':finalDay?'Confirm Final Selection':'Confirm Progressing Goalies';
    $('lateEntryPanel').classList.toggle('hidden',!day||index<=0||decisionLocked);
    const excluded=new Set(goalies.map(g=>g.id)),available=state.goalies.filter(g=>!excluded.has(g.id));$('lateExistingGoalie').innerHTML=available.length?optionList(available):'<option value="">No existing goalkeeper available</option>';$('addExistingLateEntry').disabled=!available.length;
  }

  function markPromotionDayComplete(){const day=state.days.find(d=>d.id===$('promotionDay').value);if(!day)return;day.status='completed';saveState();renderPromotion();showToast('Trial day marked completed.');}
  function reopenPromotionDay(){const day=state.days.find(d=>d.id===$('promotionDay').value),index=dayIndex(day?.id);if(!day||index<0)return;if(!confirm(`Reopen Day ${index+1}? Recorded results will be kept, but promotion or selection decisions from this day onward must be confirmed again.`))return;state.days.slice(index).forEach(item=>{item.status='planned';delete state.progressions[item.id];});saveState();renderPromotion();showToast(`Day ${index+1} reopened for editing.`);}
  function confirmPromotion(){
    const day=state.days.find(d=>d.id===$('promotionDay').value);if(!day||day.status!=='completed')return;const final=dayIndex(day.id)===state.days.length-1,statuses=Object.fromEntries([...document.querySelectorAll('[data-round-status]')].map(select=>[select.dataset.roundStatus,select.value])),reasons=Object.fromEntries([...document.querySelectorAll('[data-excused-reason]')].map(input=>[input.dataset.excusedReason,input.value.trim()]));if(Object.entries(statuses).some(([id,status])=>status==='excused'&&!reasons[id])){showToast('A required reason must be entered for every excused goalkeeper.');return;}if(!final&&!Object.values(statuses).some(status=>status==='progress'||status==='excused')&&!confirm('Confirm that no goalkeepers progress from this round?'))return;const finalStatuses=final?statuses:undefined,stateProgress={confirmed:true,goalieIds:final?Object.entries(statuses).filter(([,status])=>status==='selected').map(([id])=>id):Object.entries(statuses).filter(([,status])=>status==='progress'||status==='excused').map(([id])=>id),excusedGoalieIds:Object.entries(statuses).filter(([,status])=>status==='excused').map(([id])=>id),excusedReasons:reasons,final,finalStatuses,roundStatuses:final?undefined:statuses,confirmedAt:new Date().toISOString()};state.progressions[day.id]=stateProgress;saveState();renderPromotion();showToast(final?'Final selection outcomes confirmed.':'Progressing goalkeepers confirmed.');
  }
  function lateEntryReason(){const reason=$('lateEntryReason').value.trim();if(!reason)showToast('Enter the required reason for missing the previous round.');return reason;}
  function allReportResults(){return state.goalies.map(goalie=>{const stats=goalieStats(goalie.id);return{goalie,stats,score:goalieScore(stats)}}).sort((a,b)=>b.score-a.score)}
  function outcomeLabel(status){return ({selected:'Selected',reserve:'Reserve',non_travelling_reserve:'Non travelling reserve',not_selected:'Not selected',excused:'Excused from this round'})[status]||status||'Not selected'}
  function selectionOutcomeNeedsEligibilityWarning(goalie,status){return Boolean(goalie&&!eligibility(goalie).eligible&&['selected','reserve','non_travelling_reserve'].includes(status))}
  function eligibilityLabel(goalie){const check=eligibility(goalie);return check.eligible?'Eligible':`Ineligible for ${state.trial.ageGroup}`}
  function finalStatusMap(progress){const statuses={...(progress?.finalStatuses||{})};if(progress?.confirmed&&!Object.keys(statuses).length)state.goalies.forEach(goalie=>{statuses[goalie.id]=(progress.goalieIds||[]).includes(goalie.id)?'selected':'not_selected'});return statuses}
  function reportResults(){const finalDay=state.days.at(-1),progress=finalDay&&state.progressions[finalDay.id],finalConfirmed=Boolean(progress?.final&&progress?.confirmed);if(!finalConfirmed)return allReportResults();const statuses=finalStatusMap(progress);return allReportResults().filter(item=>['selected','reserve','non_travelling_reserve','excused'].includes(statuses[item.goalie.id]))}
  function reportHeader(title){return `<div class="report-brand"><img src="assets/trials-banner-v1-19.png" alt=""><span>${esc(state.trial.name||'Goalkeeper Trial')}<br>${esc(state.trial.team||'Team not set')}<br>${new Date().toLocaleDateString()}</span></div><h2 class="report-title">${esc(title)}</h2><p class="report-subtitle">${esc(state.trial.gender)} · ${esc(state.trial.ageGroup)} · ${esc(state.trial.level)} · ${esc(state.trial.tier)}</p>`}

  function renderReport(){
    const results=reportResults(),allResults=allReportResults(),selected=$('reportGoalie').value||allResults[0]?.goalie.id||'',individual=$('reportType').value==='feedback';$('reportGoalie').innerHTML=optionList(state.goalies,selected);$('reportGoalieWrap').classList.toggle('hidden',!individual);$('reportNotesLabel').textContent=individual?'Selectors’ feedback':'Selector notes and decision evidence';$('reportNotes').placeholder=individual?'Add feedback for this goalkeeper...':'Add the selectors’ observations, context and final reasoning...';$('reportNotes').value=individual?(state.feedbackNotes?.[$('reportGoalie').value]||''):state.reportNotes;
    $('reportCanvas').innerHTML=$('reportType').value==='feedback'?feedbackReport(allResults.find(r=>r.goalie.id===$('reportGoalie').value)||allResults[0]):selectionReport(results);
  }

  function selectionReport(results){
    const allResults=allReportResults(),finalDay=state.days.at(-1),finalProgress=finalDay&&state.progressions[finalDay.id],finalConfirmed=Boolean(finalProgress?.final&&finalProgress?.confirmed),statuses=finalStatusMap(finalProgress),otherResults=finalConfirmed?allResults.filter(item=>!['selected','reserve','non_travelling_reserve','excused'].includes(statuses[item.goalie.id])):[];
    const days=state.days.map((day,index)=>`<section class="report-section report-day"><h3>Trial Day ${index+1} · ${esc(dayLabel(day.date))}</h3>${statsTable(state.goalies.map(goalie=>{const stats=goalieStats(goalie.id,{dayId:day.id});return{goalie,stats,score:goalieScore(stats)}}),{dayId:day.id})}${state.drills.filter(d=>d.dayId===day.id).map(drill=>`<h4>${esc(drill.name)} · Target ${drill.target} per goalkeeper</h4>${statsTable(state.goalies.map(goalie=>{const stats=goalieStats(goalie.id,{dayId:day.id,drillId:drill.id});return{goalie,stats,score:goalieScore(stats)}}),{dayId:day.id,drillId:drill.id})}`).join('')}</section>`).join('');
    const outcomeCell=r=>{const check=eligibility(r.goalie);return `<td><strong>${esc(outcomeLabel(statuses[r.goalie.id]))}</strong>${check.eligible?'':`<span class="report-ineligible">Ineligible for ${esc(state.trial.ageGroup)}</span>`}</td>`};
    const primaryTable=results.length?`<table class="report-table"><thead><tr><th>Rank</th><th>Goalkeeper</th>${finalConfirmed?'<th>Selection status</th>':''}<th>Defence</th><th>Ratings score</th><th>Overall score</th></tr></thead><tbody>${results.map((r,i)=>`<tr><td>${i+1}</td><td><strong>${esc(r.goalie.name)}</strong></td>${finalConfirmed?outcomeCell(r):''}<td>${pct(r.stats.defenceRate)}</td><td>${pct(ratingsScore(r.stats))}</td><td>${r.score.toFixed(1)}</td></tr>`).join('')}</tbody></table>`:'<p>No roster data available.</p>';
    const otherTable=otherResults.length?`<section class="report-section report-secondary-results"><h3>Other trial participants</h3><p>These goalkeepers trialled but were not selected for the final travelling group.</p><table class="report-table"><thead><tr><th>Rank</th><th>Goalkeeper</th><th>Selection status</th><th>Defence</th><th>Overall score</th></tr></thead><tbody>${otherResults.map((r,i)=>`<tr><td>${i+1}</td><td><strong>${esc(r.goalie.name)}</strong></td>${outcomeCell(r)}<td>${pct(r.stats.defenceRate)}</td><td>${r.score.toFixed(1)}</td></tr>`).join('')}</tbody></table></section>`:'';
    return `${reportHeader('Goalkeeper Selection Report')}<section class="report-section"><h3>${finalConfirmed?'Selected, reserve, non-travelling reserve and excused':'Provisional ranking'}</h3>${primaryTable}</section>${otherTable}<section class="report-section"><h3>All goalkeepers · All trial days</h3>${statsTable(allResults)}</section>${days}<section class="report-section report-day"><h3>Shot-type and situation breakdown</h3>${breakdownTable()}</section><section class="report-section report-day"><h3>Every trial-section rating and note</h3>${ratingAuditTable()}</section>${state.reportNotes?`<section class="report-section"><h3>Selector notes</h3><div class="report-notes">${esc(state.reportNotes)}</div></section>`:''}`;
  }

  function filteredTimeFor(goalieId,filters={}){return Object.entries(state.timers).filter(([key])=>{const [dayId,drillId,id]=key.split('|');return id===goalieId&&(!filters.dayId||filters.dayId==='all'||dayId===filters.dayId)&&(!filters.drillId||filters.drillId==='all'||drillId===filters.drillId)}).reduce((sum,[,value])=>sum+Number(value||0),0)}
  function statsTable(rows,filters={}){return `<div class="report-table-scroll"><table class="report-table full-stats"><thead><tr><th>Goalkeeper</th><th>Attempts</th><th>Saves</th><th>Goals</th><th>Angles</th><th>Save rate</th><th>Defence</th><th>Rebounds</th><th>Dangerous</th><th>Time</th>${CATEGORIES.map(cat=>`<th>${cat}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.goalie.name)}</strong></td><td>${r.stats.attempts}</td><td>${r.stats.saves}</td><td>${r.stats.goals}</td><td>${r.stats.aco}</td><td>${pct(r.stats.saveRate)}</td><td>${pct(r.stats.defenceRate)}</td><td>${r.stats.rebounds}</td><td>${r.stats.dangerous}</td><td>${formatTime(filteredTimeFor(r.goalie.id,filters))}</td>${CATEGORIES.map(cat=>`<td>${r.stats.categoryCounts?.[cat]?(r.stats.category[cat]||0).toFixed(1):'N/C'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
  function breakdownTable(){const rows=[];state.days.forEach((day,index)=>state.goalies.forEach(goalie=>[...SHOT_TYPES.map(value=>['Shot type',value]),...SITUATIONS.map(value=>['Situation',value])].forEach(([group,value])=>{const stats=goalieStats(goalie.id,{dayId:day.id,...(group==='Shot type'?{shotType:value}:{situation:value})});if(stats.attempts)rows.push({day:`Day ${index+1} · ${dayLabel(day.date)}`,goalie:goalie.name,group,value,stats})})));return rows.length?`<div class="report-table-scroll"><table class="report-table"><thead><tr><th>Trial day</th><th>Goalkeeper</th><th>Breakdown</th><th>Value</th><th>Attempts</th><th>Saves</th><th>Goals</th><th>Angles</th><th>Save rate</th><th>Defence</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.day)}</td><td>${esc(r.goalie)}</td><td>${r.group}</td><td>${esc(r.value)}</td><td>${r.stats.attempts}</td><td>${r.stats.saves}</td><td>${r.stats.goals}</td><td>${r.stats.aco}</td><td>${pct(r.stats.saveRate)}</td><td>${pct(r.stats.defenceRate)}</td></tr>`).join('')}</tbody></table></div>`:'<p>No recorded attempts are available for breakdown.</p>'}
  function ratingAuditTable(){const latest=new Map();state.ratings.forEach(r=>latest.set(`${r.goalieId}|${r.dayId}|${r.drillId}`,r));const rows=[...latest.values()];return rows.length?`<div class="report-table-scroll"><table class="report-table"><thead><tr><th>Trial day</th><th>Section</th><th>Goalkeeper</th>${CATEGORIES.map(cat=>`<th>${cat}</th>`).join('')}<th>Notes</th></tr></thead><tbody>${rows.map(r=>{const day=state.days.find(d=>d.id===r.dayId),drill=state.drills.find(d=>d.id===r.drillId),goalie=state.goalies.find(g=>g.id===r.goalieId);return `<tr><td>${esc(dayLabel(day?.date))}</td><td>${esc(drill?.name||'Removed section')}</td><td>${esc(goalie?.name||'Removed goalkeeper')}</td>${CATEGORIES.map(cat=>`<td>${r.values?.[cat]?Number(r.values[cat]).toFixed(1):'N/C'}</td>`).join('')}<td>${esc(r.notes||'—')}</td></tr>`}).join('')}</tbody></table></div>`:'<p>No trial-section ratings have been recorded.</p>'}

  function feedbackReport(item){
    if(!item)return `${reportHeader('Individual Goalkeeper Feedback')}<p>No goalkeeper selected.</p>`;
    const cats={Performance:item.stats.defenceRate,...item.stats.category},insight=strengthDevelopment(item.stats),notes=[...state.ratings.filter(r=>r.goalieId===item.goalie.id&&r.notes?.trim()).map(r=>r.notes.trim()),state.feedbackNotes?.[item.goalie.id]?.trim()].filter(Boolean),finalDay=state.days.at(-1),finalProgress=finalDay&&state.progressions[finalDay.id],finalConfirmed=Boolean(finalProgress?.final&&finalProgress?.confirmed),status=finalConfirmed?outcomeLabel(finalStatusMap(finalProgress)[item.goalie.id]):'Outcome pending',check=eligibility(item.goalie),statusBlock=`<div class="recommendation selection-status"><span>Selection outcome</span><strong>${esc(status)}</strong>${check.eligible?'':`<em>Ineligible for ${esc(state.trial.ageGroup)}</em>`}</div>`,feedback=notes.length?`<section class="report-section"><h3>Selectors’ feedback</h3><div class="report-notes">${esc(notes.join('\n\n'))}</div></section>`:'';
    return `${reportHeader('Individual Goalkeeper Feedback')}<h3>${esc(item.goalie.name)}</h3>${statusBlock}<div class="metric-grid"><article class="metric-card"><span class="metric-label">Attempts</span><strong class="metric-value">${item.stats.attempts}</strong></article><article class="metric-card"><span class="metric-label">Save rate</span><strong class="metric-value">${pct(item.stats.saveRate)}</strong></article><article class="metric-card"><span class="metric-label">Defence rate</span><strong class="metric-value">${pct(item.stats.defenceRate)}</strong></article><article class="metric-card"><span class="metric-label">Time in goal</span><strong class="metric-value">${formatTime(totalTimeFor(item.goalie.id))}</strong></article></div><section class="report-section"><h3>Category ratings</h3><table class="report-table"><tbody>${Object.entries(cats).map(([cat,val])=>`<tr><td><strong>${cat}</strong></td><td>${cat==='Performance'?pct(val):item.stats.categoryCounts?.[cat]?`${(val||0).toFixed(1)} / 5`:'N/C'}</td></tr>`).join('')}</tbody></table></section><section class="report-section"><h3>Strengths and development areas</h3><p><strong>Leading area:</strong> ${esc(insight.strength)}</p><p><strong>Development focus:</strong> ${esc(insight.development)}</p></section>${feedback}`;
  }

  function swapGoalkeepers(){
    const dayId=$('recordingDay').value,drillId=$('recordingDrill').value,a=stationKey(dayId,drillId,0),b=stationKey(dayId,drillId,1);if(!state.stationSelections[a]||!state.stationSelections[b]){showToast('Select two different goalkeepers first.');return;}stopAllRunningTimers();[state.stationSelections[a],state.stationSelections[b]]=[state.stationSelections[b],state.stationSelections[a]];saveState();renderRecording();showToast('Goal A and Goal B swapped.');
  }
  function swapVideoGoalkeepers(){
    const dayId=$('videoDay').value,drillId=$('videoDrill').value,a=stationKey(dayId,drillId,0),b=stationKey(dayId,drillId,1);if(completedDay(dayId)){showToast('Reopen this trial day before changing the goalkeepers.');return;}if(!state.stationSelections[a]||!state.stationSelections[b]){showToast('Select two different goalkeepers first.');return;}stopAllVideoGoalieTimers(false);[state.stationSelections[a],state.stationSelections[b]]=[state.stationSelections[b],state.stationSelections[a]];saveState();renderVideoReview();showToast('Goal A and Goal B swapped.');
  }

  function addExistingLateEntry(){
    const dayId=$('promotionDay').value,goalie=state.goalies.find(g=>g.id===$('lateExistingGoalie').value),reason=lateEntryReason();if(!goalie||!reason)return;goalie.entryDayId=dayId;goalie.lateEntryReason=reason;saveState();$('lateEntryReason').value='';renderPromotion();showToast(`${goalie.name} added to this round.`);
  }
  function openTrialGoalieDialog(){
    $('goalieForm').reset();$('goalieGender').value=['Male','Female'].includes(state.trial.gender)?state.trial.gender:'';$('goalieDialog').showModal();
  }
  function beginLateEntry(kind){const reason=lateEntryReason(),dayId=$('promotionDay').value;if(!reason||!dayId)return;pendingLateEntry={reason,dayId};if(kind==='shared')openSharedGoalieDialog();else openTrialGoalieDialog();}

  function bindEvents(){
    document.querySelectorAll('.nav-button').forEach(button=>button.addEventListener('click',()=>switchPage(button.dataset.page)));
    document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>switchPage(button.dataset.go)));
    $('newTrialEvent').addEventListener('click',()=>openTrialEventDialog());$('trialEventForm').addEventListener('submit',createTrialEvent);$('newTrialTemplate').addEventListener('change',applyNewTrialTemplate);$('saveEventTemplate').addEventListener('click',saveCurrentEventTemplate);
    $('saveSetup').addEventListener('click',saveSetup);$('dayForm').addEventListener('submit',addDay);$('drillForm').addEventListener('submit',addDrill);$('cancelDrillEdit').addEventListener('click',cancelDrillEdit);
    $('openGoalieDialog').addEventListener('click',()=>{pendingLateEntry=null;openTrialGoalieDialog();});$('addSharedGoalie').addEventListener('click',()=>{pendingLateEntry=null;openSharedGoalieDialog();});$('sharedGoalieForm').addEventListener('submit',addSharedGoalieToRoster);$('goalieForm').addEventListener('submit',addGoalie);$('ratingForm').addEventListener('submit',saveRating);$('shotEditorForm').addEventListener('submit',saveShotEdit);
    $('saveDayTemplate').addEventListener('click',saveCurrentDayTemplate);$('applyDayTemplate').addEventListener('click',applyDayTemplate);$('deleteDayTemplate').addEventListener('click',deleteDayTemplate);$('dayTemplateSelect').addEventListener('change',renderDayTemplates);
    document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>{pendingLateEntry=null;button.closest('dialog').close();}));
    $('rosterDayFilter').addEventListener('change',renderRoster);
    $('recordingDay').addEventListener('change',()=>{stopAllRunningTimers();renderRecording();});$('recordingDrill').addEventListener('change',()=>{stopAllRunningTimers();renderRecording();});
    $('swapGoalies').addEventListener('click',swapGoalkeepers);$('swapVideoGoalies').addEventListener('click',swapVideoGoalkeepers);
    $('videoDay').addEventListener('change',()=>{stopAllVideoGoalieTimers(false);pauseAllVideoPlayback();renderVideoReview();});$('videoDrill').addEventListener('change',()=>{stopAllVideoGoalieTimers(false);pauseAllVideoPlayback();renderVideoReview();});
    $('promotionDay').addEventListener('change',renderPromotion);$('markDayComplete').addEventListener('click',markPromotionDayComplete);$('reopenDay').addEventListener('click',reopenPromotionDay);$('confirmPromotion').addEventListener('click',confirmPromotion);$('addExistingLateEntry').addEventListener('click',addExistingLateEntry);$('addLateTrialGoalie').addEventListener('click',()=>beginLateEntry('trial'));$('addLateSharedGoalie').addEventListener('click',()=>beginLateEntry('shared'));
    $('videoChooseFolder').addEventListener('click',chooseTrialVideoFolder);$('videoReconnectFiles').addEventListener('click',()=>restoreRememberedVideoFiles(true));$('chooseVideoFilesA').addEventListener('click',()=>chooseVideoFiles(0));$('chooseVideoFilesB').addEventListener('click',()=>chooseVideoFiles(1));
    $('videoFileA').addEventListener('change',event=>{addVideoFiles(0,event.target.files);event.target.value='';$('videoFolderStatus').textContent='These videos are loaded for this session only. Use Chrome file access to remember them.';});$('videoFileB').addEventListener('change',event=>{addVideoFiles(1,event.target.files);event.target.value='';$('videoFolderStatus').textContent='These videos are loaded for this session only. Use Chrome file access to remember them.';});
    $('videoPlayPause').addEventListener('click',toggleVideoPlayback);$('videoFrameBack').addEventListener('click',()=>stepVideoFrame(-1));$('videoFrameForward').addEventListener('click',()=>stepVideoFrame(1));$('videoBackFive').addEventListener('click',()=>jumpVideo(-5));$('videoForwardFive').addEventListener('click',()=>jumpVideo(5));$('videoLoopTen').addEventListener('click',toggleVideoLoop);$('videoSetSync').addEventListener('click',syncCurrentVideoFrames);$('videoPlaceMarkerA').addEventListener('click',()=>placeVideoSyncMarker(0));$('videoPlaceMarkerB').addEventListener('click',()=>placeVideoSyncMarker(1));$('videoApplyMarkers').addEventListener('click',applyVideoSyncMarkers);$('videoToggleWaveforms').addEventListener('click',toggleVideoWaveforms);$('videoSuggestAutoSync').addEventListener('click',suggestAutoSync);$('videoClearSync').addEventListener('click',clearVideoSync);
    $('addVideoTime').addEventListener('click',()=>resolveVideoTimeConflict('add'));$('replaceVideoTime').addEventListener('click',()=>resolveVideoTimeConflict('replace'));$('cancelVideoTime').addEventListener('click',()=>resolveVideoTimeConflict(''));$('videoTimeConflictDialog').addEventListener('cancel',event=>{event.preventDefault();resolveVideoTimeConflict('');});
    const videoSeek=$('videoSeek'),seekFromPointer=event=>{const rect=videoSeek.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));stopVideoPlayback();setVideoMasterTime(ratio*masterDuration(currentVideoSession()),true);};
    videoSeek.addEventListener('input',event=>{stopVideoPlayback();setVideoMasterTime(event.target.value,true);});
    videoSeek.addEventListener('pointerdown',event=>{videoSeekDragging=true;videoSeek.setPointerCapture?.(event.pointerId);seekFromPointer(event);});
    videoSeek.addEventListener('pointermove',event=>{if(videoSeekDragging)seekFromPointer(event);});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>videoSeek.addEventListener(type,()=>{videoSeekDragging=false;}));
    $('page-video').addEventListener('click',event=>{const move=event.target.closest('[data-video-move]'),remove=event.target.closest('[data-video-remove]'),shot=event.target.closest('[data-video-shot-time]'),nudge=event.target.closest('[data-video-nudge]'),speed=event.target.closest('[data-video-speed]'),accept=event.target.closest('[data-accept-auto-sync]'),zoom=event.target.closest('[data-video-zoom]'),resetView=event.target.closest('[data-video-reset-view]');if(move){const [angle,index,direction]=move.dataset.videoMove.split('|').map(Number);moveVideoClip(angle,index,direction);}else if(remove){const [angle,id]=remove.dataset.videoRemove.split('|');removeVideoClip(Number(angle),id);}else if(shot){stopVideoPlayback();setVideoMasterTime(Number(shot.dataset.videoShotTime),true);}else if(nudge)nudgeVideoAngleB(Number(nudge.dataset.videoNudge));else if(speed){const session=currentVideoSession();session.speed=Number(speed.dataset.videoSpeed)||1;['videoA','videoB'].forEach(id=>$(id).playbackRate=session.speed);if(session.playing){videoClockMaster=session.masterTime;videoClockStarted=performance.now();}updateVideoTransport();}else if(accept)acceptAutoSync();else if(zoom){const [index,delta]=zoom.dataset.videoZoom.split('|').map(Number);adjustVideoZoom(index,delta);}else if(resetView)resetVideoView(Number(resetView.dataset.videoResetView));});
    const draggableTimeline=$('videoShotTimeline'),dragTimeline=event=>{const rect=draggableTimeline.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));stopVideoPlayback();setVideoMasterTime(ratio*masterDuration(currentVideoSession()),true);};draggableTimeline.addEventListener('pointerdown',event=>{if(event.target.closest('[data-video-shot-time]'))return;videoTimelineDragging=true;draggableTimeline.setPointerCapture?.(event.pointerId);dragTimeline(event);});draggableTimeline.addEventListener('pointermove',event=>{if(videoTimelineDragging)dragTimeline(event);});['pointerup','pointercancel'].forEach(type=>draggableTimeline.addEventListener(type,()=>{videoTimelineDragging=false;}));
    ['videoA','videoB'].forEach((id,index)=>{const video=$(id);video.addEventListener('pointerdown',event=>{if(!video.getAttribute('src'))return;const view=currentVideoSession().angles[index].view;videoPanDrag={index,pointerId:event.pointerId,startClientX:event.clientX,startClientY:event.clientY,startX:view.x,startY:view.y};video.setPointerCapture?.(event.pointerId);event.preventDefault();});video.addEventListener('pointermove',event=>{if(!videoPanDrag||videoPanDrag.index!==index)return;const view=currentVideoSession().angles[index].view;view.x=videoPanDrag.startX+(event.clientX-videoPanDrag.startClientX);view.y=videoPanDrag.startY+(event.clientY-videoPanDrag.startClientY);applyVideoView(index);});['pointerup','pointercancel','lostpointercapture'].forEach(type=>video.addEventListener(type,()=>{if(!videoPanDrag||videoPanDrag.index!==index)return;videoPanDrag=null;saveVideoView(index);}));});
    $('undoLastEvent').addEventListener('click',()=>{const dayId=$('recordingDay').value,drillId=$('recordingDrill').value;if(completedDay(dayId)){showToast('Reopen this trial day before changing its recordings.');return;}const index=state.events.map(e=>e.dayId===dayId&&e.drillId===drillId).lastIndexOf(true);if(index<0){showToast('There is no event to undo.');return;}state.events.splice(index,1);saveState();renderRecording();showToast('Last event removed.');});
    ['compareDay','compareDrill','compareShot','compareSituation'].forEach(id=>$(id).addEventListener('change',renderComparison));
    $('reportType').addEventListener('change',renderReport);$('reportGoalie').addEventListener('change',renderReport);
    $('reportNotes').addEventListener('input',()=>{if($('reportType').value==='feedback'){const goalieId=$('reportGoalie').value;if(goalieId){state.feedbackNotes=state.feedbackNotes||{};state.feedbackNotes[goalieId]=$('reportNotes').value;}}else state.reportNotes=$('reportNotes').value;saveState();$('reportCanvas').innerHTML=$('reportType').value==='feedback'?feedbackReport(allReportResults().find(r=>r.goalie.id===$('reportGoalie').value)):selectionReport(reportResults());});
    $('printReport').addEventListener('click',()=>window.print());
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;$('installButton').classList.remove('hidden');});
    $('installButton').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('installButton').classList.add('hidden');});
    window.addEventListener('beforeunload',stopAllRunningTimers);
  }

  function init(){
    const params=new URLSearchParams(location.search),requestedPage=params.get('page'),requestedGoalie=params.get('goalie'),requestedTrial=params.get('trial');
    if(requestedTrial&&state.trialSessions[requestedTrial]&&requestedTrial!==state.activeTrialId){syncActiveSession();state.activeTrialId=requestedTrial;applySession(state.trialSessions[requestedTrial]);saveState();}
    refreshLinkedGoalies();bindEvents();renderDashboard();
    if(requestedPage==='reports'){
      switchPage('reports');
      if(requestedGoalie&&state.goalies.some(g=>String(g.sharedGoalieId||g.id)===String(requestedGoalie))){
        $('reportType').value='feedback';renderReport();$('reportGoalie').value=state.goalies.find(g=>String(g.sharedGoalieId||g.id)===String(requestedGoalie)).id;renderReport();
      }
    }
    if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
  }
  window.__trialsV119Test={
    comparableCategories,strengthDevelopment,ratingsScore,goalieScore,dayCanStart,eligibleGoaliesForDay,selectedGoalie,ratingCategories,captureSession,eligibility,comparisonWarnings,selectionReport,feedbackReport,reportResults,outcomeLabel,eligibilityLabel,finalStatusMap,validDob,sectionSituation,goalieKitIcon,ensureSectionRating,persistInlineRating,deleteTrialEvent,rankingRound,eventTemplateFromState,addDateDays,preferredWorkingDayId,completedDay,selectionOutcomeNeedsEligibilityWarning,reopenPromotionDay,renderRotationOverview,openShotEditor,saveShotEdit,dayTimeFor,playlistDuration,locateVideoTime,masterDuration,audioCorrelation,findAutoSyncOffset,normalizeAudioEnvelope,currentVideoSession,jumpVideo,toggleVideoLoop,placeVideoSyncMarker,applyVideoSyncMarkers,
    timerSourceFor,combinedTimerValue,updateCombinedTimer,
    setState(patch){Object.assign(state,defaultState(),patch);state.shotSelections=state.shotSelections||{};state.progressions=state.progressions||{};state.timerSources=state.timerSources||{};},
    getState(){return state;}
  };
  init();
})();
