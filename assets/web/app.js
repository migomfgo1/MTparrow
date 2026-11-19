'use strict';
const page = document.querySelector('#page');
const nav = document.querySelector('nav');
const dialog = document.querySelector('dialog');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const categories = ['Everyday', 'Fitness', 'Sound Practice'];
const starters = [
  {id:'perch', title:'Tidy Your Perch', note:'Put away five things from your desk.', category:'Everyday', method:'check'},
  {id:'branch', title:'Fly to the Next Branch', note:'Take a five-minute walk.', category:'Fitness', method:'timer', target:300},
  {id:'flock', title:'Follow the Flock', note:'Take two steps left, two steps right, then clap. Repeat three times.', category:'Fitness', method:'check'},
  {id:'echo', title:'Echo the Call', note:'Listen and imitate the call three times.', category:'Sound Practice', method:'sound', sound:'call', target:3},
];
const builtins = [
  {id:'call', name:'Macaw Call', notes:[880,1175,990]},
  {id:'whistle', name:'Three-note Whistle', notes:[523,659,784]},
  {id:'rhythm', name:'Tap Rhythm', notes:[300,0,300,300]},
];
const key = 'parrot-state-v1';
let state = JSON.parse(localStorage.getItem(key) || 'null') || {
  tasks: starters, sounds: [], events: [], name:'Blue Macaw', effects:true, haptics:true,
};
let tab = 'Tasks';
let days = 7;
let active = null;
let soundContext;
let toastTimer;
let storage;
const icons = {Tasks:'☷', Flights:'✈', Sounds:'♫', Analytics:'▥', Profile:'◉'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayKey = (date = new Date()) => [date.getFullYear(), date.getMonth()+1, date.getDate()].join('-');
const eventDay = item => dayKey(new Date(item.time));
const selectedSound = id => [...builtins,...state.sounds].find(sound => sound.id === id);
const todayEvents = () => state.events.filter(item => eventDay(item) === dayKey());
const points = events => events.reduce((sum,item) => sum + (item.points || 0),0);
const fmt = value => value.toLocaleString('en-US');
const done = task => todayEvents().some(item => item.type === 'complete' && item.task === task.id);
const reps = task => (state.flight?.steps.some(step=>step.id===task.id) ? state.events : todayEvents())
  .filter(item => item.type === 'repeat' && item.task === task.id && item.sound === task.sound).length;
const freshId = () => crypto.randomUUID();
function save() { localStorage.setItem(key, JSON.stringify(state)); }
function notify(message) {
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 2400);
}
function feedback() {
  if (state.haptics) window.flutter_inappwebview?.callHandler('practiceHaptic')?.catch(() => {});
  if (state.effects) {
    try {
      const context = soundContext ||= new AudioContext();
      context.resume().then(() => tone(context, 1046, context.currentTime, .08)).catch(() => {});
    } catch (_) {}
  }
}
function completion(task) {
  if (!done(task)) state.events.push({type:'complete', task:task.id, category:task.category, time:Date.now()});
}
function complete(task) {
  completion(task); advanceFlight(task); save(); render(); feedback(); notify('Task complete');
}
function heading(title, subtitle) {
  return `<header class="row spread"><div><small>${esc(subtitle)}</small><h1>${title}</h1></div><span class="badge">✦ ${fmt(points(state.events))}</span></header>`;
}
function taskCard(task) {
  const finished = done(task);
  const detail = task.method === 'sound' ? ` · ${reps(task)} of ${task.target} repeats` : '';
  return `<article class="card row"><span class="tile" aria-hidden="true">${['⌂','◷','♫'][categories.indexOf(task.category)]}</span>
    <div class="grow"><h2>${esc(task.title)}</h2><small>${esc(task.note)}${detail}</small></div>
    <button data-action="task" data-id="${esc(task.id)}" ${finished?'disabled class="done"':''}>${finished?'Done':task.method==='check'?'Complete':'Start'}</button>
    <button data-action="edit" data-id="${esc(task.id)}" aria-label="Edit ${esc(task.title)}">⋯</button></article>`;
}
function tasksPage() {
  const total = state.tasks.length;
  const finished = state.tasks.filter(done).length;
  const date = new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
  return `${heading('Today',date)}<section class="card hero"><img src="macaw-new.png" alt=""><p class="eyebrow">TODAY’S FLIGHT</p>
    <h2><strong>${finished}/${total}</strong> tasks done</h2><p>+${fmt(points(todayEvents()))} pts today</p></section>
    <button class="primary full" data-action="add">＋ Add Task</button><div class="columns">
    ${categories.map(category => {
      const tasks = state.tasks.filter(task => task.category === category);
      return tasks.length ? `<section><h2 class="eyebrow">${category.toUpperCase()}</h2>${tasks.map(taskCard).join('')}</section>` : '';
    }).join('')}</div>`;
}
function soundsPage() {
  return `${heading('Sounds','Sound library')}<button class="primary full" data-action="record">● Record Sound</button>
    <div class="columns">${[...builtins,...state.sounds].map(sound => `<article class="card row"><span class="tile" aria-hidden="true">♫</span>
    <div class="grow"><h2>${esc(sound.name)}</h2><small>${sound.notes?'Built-in sound':sound.duration+' sec · Your recording'}</small></div>
    <button data-action="play" data-id="${sound.id}">Play</button><button data-action="practice" data-id="${sound.id}">Echo Lab</button>
    ${sound.notes?'':`<button data-action="soundEdit" data-id="${sound.id}" aria-label="Manage ${esc(sound.name)}">⋯</button>`}</article>`).join('')}</div>`;
}
function analyticsPage() {
  const dates = Array.from({length:days},(_,index) => {const date = new Date(); date.setDate(date.getDate()-days+1+index); return date;});
  const keys = new Set(dates.map(dayKey));
  const events = state.events.filter(item => keys.has(eventDay(item)));
  const finished = events.filter(item => item.type === 'complete');
  const repeated = events.filter(item => item.type === 'repeat');
  const counts = dates.map(date => events.filter(item => eventDay(item) === dayKey(date)).length);
  const peak = Math.max(1,...counts);
  return `${heading('Analytics','Your activity')}<div class="actions card">${[7,30].map(n=>`<button class="${days===n?'primary':''}" data-action="range" data-id="${n}" aria-pressed="${days===n}">${n} Days</button>`).join('')}</div>
    <div class="stats">${[['Points',points(events)],['Tasks',finished.length],['Repetitions',repeated.length],['Active days',new Set(events.map(eventDay)).size]].map(([label,count])=>`<div class="card stat"><strong>${fmt(count)}</strong><small>${label}</small></div>`).join('')}</div>
    <section class="card"><h2>Daily activity</h2>${events.length?`<div class="chart">${dates.map((date,i)=>`<meter class="bar" aria-label="${date.toLocaleDateString('en-US')}" min="0" max="${peak}" value="${counts[i]}" title="${counts[i]} activity events"></meter>`).join('')}</div><div class="row spread"><small>${dates[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})}</small><small>Today</small></div>`:'<p class="muted">Complete a task or practice a sound to see your activity here.</p>'}</section>
    <section class="card row spread"><h2>Flights completed</h2><strong>${events.filter(item => item.type === "flight").length}</strong></section><section class="card stack"><h2>Completed by category</h2>${categories.map(category=>`<div class="row spread"><span>${category}</span><strong>${finished.filter(item=>item.category===category).length}</strong></div>`).join('')}</section>`;
}
function streak() {
  const activeDays = new Set(state.events.map(eventDay));
  const date = new Date();
  if (!activeDays.has(dayKey(date))) date.setDate(date.getDate()-1);
  let count = 0;
  while (activeDays.has(dayKey(date))) {count++; date.setDate(date.getDate()-1);}
  return count;
}
function profilePage() {
  return `${heading('Profile','Your macaw')}<section class="card row"><img class="avatar" src="macaw-new.png" alt="Blue macaw"><div class="grow"><h2>${esc(state.name)}</h2><p class="muted">${streak()}-day streak</p></div><button data-action="name">Edit Name</button></section>
    <section class="card stat"><strong>${fmt(points(state.events))}</strong><small>Lifetime points</small></section>
    <section class="card stack"><h2>Notifications</h2><button data-action="enablePush">Enable Push Notifications</button></section><section class="card stack"><h2>Preferences</h2><label class="row spread">Sound effects <input type="checkbox" data-setting="effects" ${state.effects?'checked':''}></label>
    <label class="row spread">Haptics <input type="checkbox" data-setting="haptics" ${state.haptics?'checked':''}></label></section>`;
}
function render() {
  nav.innerHTML = Object.entries(icons).map(([label,icon])=>`<button data-action="tab" data-id="${label}" ${tab===label?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${label}</button>`).join('');
  page.innerHTML = ({Tasks:tasksPage,Flights:flightsPage,Sounds:soundsPage,Analytics:analyticsPage,Profile:profilePage}[tab])();
}
function show(title, contents) {
  modal.innerHTML = `<div class="row spread"><h2>${title}</h2><button data-action="close" aria-label="Close">✕</button></div>${contents}`;
  if (!dialog.open) dialog.showModal();
}
function taskEditor(task) {
  const current = task || {};
  const options = [...builtins,...state.sounds];
  show(task?'Edit Task':'Add Task', `<form id="taskForm" class="stack" data-id="${current.id||''}">
    <label>Title<input name="title" required maxlength="80" value="${esc(current.title)}"></label>
    <label>Category<select name="category">${categories.map(category=>`<option ${current.category===category?'selected':''}>${category}</option>`).join('')}</select></label>
    <label>Instructions<textarea name="note" maxlength="300">${esc(current.note)}</textarea></label>
    <label>Completion method<select name="method"><option value="check">Manual check-off</option><option value="timer" ${current.method==='timer'?'selected':''}>Timer</option><option value="sound" ${current.method==='sound'?'selected':''}>Sound repetitions</option></select></label>
    <label id="soundField">Sound<select name="sound">${options.map(sound=>`<option value="${sound.id}" ${current.sound===sound.id?'selected':''}>${esc(sound.name)}</option>`).join('')}</select></label>
    <label id="targetField"><span id="targetLabel"></span><input name="target" type="number" min="1" max="120" value="${current.method==='timer'?current.target/60:current.target||3}"></label>
    <button class="primary" type="submit">Save Task</button>${task?`<button type="button" data-action="deleteTask" data-id="${task.id}">Delete Task</button>`:''}</form>`);
  updateTaskFields();
}
function updateTaskFields() {
  const method = document.querySelector('#taskForm').elements.method.value;
  document.querySelector('#soundField').hidden = method !== 'sound';
  document.querySelector('#targetField').hidden = method === 'check';
  document.querySelector('#targetLabel').textContent = method === 'timer' ? 'Minutes' : 'Repetition target';
}
function startTimer(task) {
  const deadline = Date.now() + task.target*1000;
  show(esc(task.title), `<div class="stack"><p>${esc(task.note)}</p><strong id="clock" role="timer"></strong><progress class="progress" id="remaining" max="${task.target}"></progress></div>`);
  const tick = () => {
    const remaining = Math.max(0,Math.ceil((deadline-Date.now())/1000));
    document.querySelector('#clock').textContent = `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
    document.querySelector('#remaining').value = remaining;
    if (!remaining) { closeModal(); complete(task); if (state.flight?.steps.some(step=>step.id===task.id)) flightDetails(); }
  };
  const timer = setInterval(tick,250);
  active = {dispose:()=>clearInterval(timer)};
  tick();
}
function audioStore() {
  return storage ||= new Promise((resolve,reject)=>{
    const request = indexedDB.open('parrot-audio',1);
    request.onupgradeneeded = () => request.result.createObjectStore('recordings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {storage = null; reject(request.error);};
  });
}
async function useAudioStore(mode, action) {
  const db = await audioStore();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('recordings',mode);
    const request = action(tx.objectStore('recordings'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
function tone(context, frequency, start, duration) {
  if (!frequency) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(.0001,start);
  gain.gain.exponentialRampToValueAtTime(.15,start+.02);
  gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start+duration);
  return oscillator;
}
let playing;
function stopAudio() { playing?.(); }
async function play(sound) {
  stopAudio();
  if (sound.notes) {
    const context = soundContext ||= new AudioContext();
    await context.resume();
    return new Promise(resolve=>{
      const start = context.currentTime+.03;
      const nodes = sound.notes.map((frequency,i)=>tone(context,frequency,start+i*.27,.21)).filter(Boolean);
      const finish = result => {clearTimeout(timer); playing = null; resolve(result);};
      const timer = setTimeout(()=>finish(true),sound.notes.length*270+30);
      playing = () => {nodes.forEach(node=>node.stop()); finish(false);};
    });
  }
  const blob = await useAudioStore('readonly', store=>store.get(sound.id));
  if (!blob) throw new Error('Missing audio');
  stopAudio();
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const finish = (result,error) => {
      audio.pause(); URL.revokeObjectURL(url); playing = null;
      if (error) reject(error); else resolve(result);
    };
    playing = () => finish(false);
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false,new Error('Audio playback failed'));
    audio.play().catch(error=>finish(false,error));
  });
}
function practice(sound,task) {
  stopAudio();
  const session = {sound,task,count:0,ready:false,dispose:stopAudio};
  active = session;
  show(esc(sound.name), `<div class="stack"><p>Play the sound, then imitate what you hear.</p><p id="practiceCount"></p>
    <button class="primary" data-action="practicePlay">Play Sound</button>
    <button data-action="repeat" disabled>I Repeated It</button><hr><button data-action="echoRecord">Record My Attempt</button><div id="echoAttempts" class="stack"></div></div>`);
  updatePractice();
  renderEchoAttempts();
}
function updatePractice() {
  const {task,count,ready} = active;
  document.querySelector('#practiceCount').textContent = task
    ? `${reps(task)} of ${task.target} repeats · +${count*100} pts this session`
    : `${count} repeats · +${count*100} pts this session`;
  modal.querySelector('[data-action=repeat]').disabled = !ready;
}
async function practicePlay(button) {
  const session = active;
  session.ready = false;
  updatePractice();
  button.disabled = true;
  try {
    const finished = await play(session.sound);
    if (active === session) session.ready = finished;
  } catch (_) {notify('Could not play this sound.');}
  finally {
    if (active === session) {button.disabled = false; updatePractice();}
    
  }
}
function confirmRepeat() {
  const session = active;
  if (!session?.ready) return;
  session.ready = false;
  const {task,sound} = session;
  state.events.push({type:'repeat', task:task?.id, sound:sound.id, points:100, time:Date.now()});
  session.count++;
  const finished = task && reps(task)>=task.target;
  if (finished) { completion(task); advanceFlight(task); }
  save(); render(); feedback();
  if (finished) {
    closeModal();
    if (state.flight?.steps.some(step=>step.id===task.id)) flightDetails();
  } else updatePractice();
  notify(finished?'Task complete · +100 pts':'+100 pts');
}
function closeModal() {
  const previous = active;
  active = null;
  previous?.dispose?.();
  if (dialog.open) dialog.close();
}
function recordSound() {
  const session = {dispose() {
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.stream?.getTracks().forEach(track => track.stop());
  }};
  active = session;
  show('Record Sound', '<p class="muted">Requesting microphone access…</p>');
  beginRecording(session);
}
async function beginRecording(session) {
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error('Microphone recording requires a supported browser and a secure page.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    session.stream = stream;
    if (active !== session) {session.dispose(); return;}
    const recorder = new MediaRecorder(stream);
    session.recorder = recorder;
    const chunks = [];
    const start = Date.now();
    recorder.ondataavailable = event => {if (event.data.size) chunks.push(event.data);};
    recorder.onstop = () => {
      clearTimeout(session.limit);
      stream.getTracks().forEach(track => track.stop());
      if (active !== session) return;
      const blob = new Blob(chunks,{type:recorder.mimeType || chunks[0]?.type});
      if (!blob.size) {show('Record Sound','<p>No audio was captured. Close this window and try again.</p>'); return;}
      const url = URL.createObjectURL(blob);
      session.blob = blob;
      session.duration = Math.max(1,Math.round((Date.now()-start)/1000));
      session.dispose = () => URL.revokeObjectURL(url);
      show('Save Recording', `<form id="recordForm" class="stack"><audio controls src="${esc(url)}"></audio>
        <label>Sound name<input name="name" required maxlength="80" placeholder="My whistle"></label><button class="primary">Save Sound</button></form>`);
    };
    recorder.onerror = () => {
      closeModal(); notify('Recording failed. Please try again.');
    };
    recorder.start();
    session.limit = setTimeout(()=>{if (recorder.state==='recording') recorder.stop();},60000);
    show('Recording', '<div class="stack"><p>Microphone is on. Record up to 60 seconds.</p><button class="primary" data-action="stopRecord">Stop Recording</button></div>');
  } catch (error) {
    session.dispose();
    if (active !== session) return;
    const message = error.name === 'NotAllowedError'
      ? 'Microphone access is off. Allow access in your device or browser settings and try again.'
      : 'Could not start recording. Check that your microphone is available and try again.';
    show('Microphone Unavailable',`<p>${message}</p>`);
  }
}
function editSound(sound) {
  const linked = [...state.tasks, ...(state.flight?.steps || []), ...state.plans.flatMap(plan=>plan.steps)].filter(task=>task.sound===sound.id);
  show('Manage Recording', `<form class="stack" id="soundForm" data-id="${sound.id}">
    <label>Sound name<input name="name" required maxlength="80" value="${esc(sound.name)}"></label>
    <button class="primary">Save Name</button>
    ${linked.length ? '<p class="muted">Remove this sound from linked tasks or flights before deleting it.</p>' :
      `<button type="button" data-action="deleteSound" data-id="${sound.id}">Delete Recording</button>`}</form>`);
}
const actions = {
  async enablePush(_, button) {
    button.disabled = true;
    try {
      const message = await window.flutter_inappwebview?.callHandler('enablePush');
      notify(message || 'Push notifications are available in the iOS app.');
    } catch (_) { notify('Could not enable notifications. Please try again.'); }
    finally { button.disabled = false; }
  },
  tab(id) {stopAudio(); tab=id; render(); window.scrollTo(0,0);},
  range(id) {days=Number(id); render();},
  add() {taskEditor();},
  edit(id) {taskEditor(state.tasks.find(task=>task.id===id));},
  close() {closeModal();},
  task(id) {
    const task = state.tasks.find(item=>item.id===id);
    if (!task || done(task)) return;
    if (task.method==='timer') startTimer(task);
    else if (task.method==='sound') practice(selectedSound(task.sound),task);
    else complete(task);
  },
  deleteTask(id) {
    show('Delete Task?',`<div class="stack"><p>Past activity will remain in Analytics.</p><button data-action="confirmTaskDelete" data-id="${id}">Delete Task</button></div>`);
  },
  confirmTaskDelete(id) {state.tasks=state.tasks.filter(task=>task.id!==id); save(); closeModal(); render();},
  async play(id,button) {
    button.disabled=true;
    try {await play(selectedSound(id));} catch (_) {notify('Could not play this sound.');}
    finally {button.disabled=false;}
  },
  practice(id) {practice(selectedSound(id));},
  practicePlay(_,button) {return practicePlay(button);},
  repeat() {confirmRepeat();},
  record() {recordSound();},
  stopRecord() {if (active?.recorder?.state==='recording') active.recorder.stop();},
  soundEdit(id) {editSound(selectedSound(id));},
  deleteSound(id) {
    show('Delete Recording?',`<div class="stack"><p>This removes the saved audio from this device.</p><button data-action="confirmSoundDelete" data-id="${id}">Delete Recording</button></div>`);
  },
  async confirmSoundDelete(id,button) {
    button.disabled=true;
    stopAudio();
    try {
      await useAudioStore('readwrite',store=>store.delete(id));
      state.sounds=state.sounds.filter(sound=>sound.id!==id);
      save(); closeModal(); render();
    } catch (_) {button.disabled=false; notify('Could not delete the recording.');}
  },
  name() {
    show('Edit Name',`<form class="stack" id="nameForm"><label>Display name<input name="name" required maxlength="40" value="${esc(state.name)}"></label><button class="primary">Save Name</button></form>`);
  },
};
document.addEventListener('click',event=>{
  const button = event.target.closest('[data-action]');
  if (button && !button.disabled) actions[button.dataset.action](button.dataset.id,button);
});
document.addEventListener('change',event=>{
  const input = event.target;
  if (input.dataset.setting) {state[input.dataset.setting]=input.checked; save();}
  if (input.name==='method' && input.form?.id==='taskForm') updateTaskFields();
});
dialog.addEventListener('cancel',event=>{event.preventDefault(); closeModal();});
document.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.target;
  if (form.id==='planForm') {
    readPlanDraft();
    if (!planDraft.name || !planDraft.steps.length) {notify('Enter a name and add at least one step.'); return;}
    const scheduledDays = state.plans.filter(item=>item.id!==planDraft.id).reduce((total,item)=>total+item.days.length,0);
    if (scheduledDays + planDraft.days.length > 64) {notify('Remove a reminder day from another flight first.'); return;}
    const plan=planDraft;
    state.plans=state.plans.filter(item=>item.id!==plan.id);
    state.plans.push(plan); save(); planLibrary();
    const result=await syncReminder(plan);
    notify(result==='ok'?'Flight saved':result==='preview'?'Schedule saved. Notifications are available in the iOS app.':'Flight saved. Check notification permissions.');
    return;
  }
  const fields=new FormData(form);
  const title=String(fields.get('title')||'').trim();
  const name=String(fields.get('name')||'').trim();
  if (!(form.id==='taskForm'?title:name)) {notify('Enter a name or title.'); return;}
  if (form.id==='taskForm') {
    const method=fields.get('method');
    const id=form.dataset.id || freshId();
    const task={id,title,category:fields.get('category'),note:fields.get('note').trim(),method};
    if (method==='timer') task.target=Number(fields.get('target'))*60;
    if (method==='sound') {
      task.target=Number(fields.get('target'));
      task.sound=fields.get('sound');
      if (reps(task)>=task.target) completion(task);
    }
    const index=state.tasks.findIndex(item=>item.id===id);
    if (index===-1) state.tasks.push(task); else state.tasks[index]=task;
  } else if (form.id==='nameForm') {
    state.name=name;
  } else if (form.id==='soundForm') {
    selectedSound(form.dataset.id).name=name;
  } else if (form.id==='recordForm') {
    const session=active;
    const id=freshId();
    const button=form.querySelector('button');
    button.disabled=true;
    try {
      await useAudioStore('readwrite',store=>store.put(session.blob,id));
      state.sounds.push({id,name,duration:session.duration});
    } catch (_) {button.disabled=false; notify('Could not save the recording.'); return;}
  }
  save(); closeModal(); render();
});
state.flight ??= null;
state.plans ??= [];
state.attempts ??= [];
const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function flightsPage() {
  const flight = state.flight;
  return `${heading('Flights','Your daily practice')}
    <section class="card hero"><img src="macaw-new.png" alt=""><h2>Ready for takeoff?</h2><p>Move, practice, and build your routine.</p></section>
    <section class="card stack"><h2>Daily Flight</h2>
      <p class="muted">${flight ? esc(flight.name)+' · '+flight.index+' of '+flight.steps.length+' steps' : 'Choose 3, 5, or 10 minutes. Replace a task before you start.'}</p>
      <button class="primary" data-action="${flight?'flightContinue':'flightSetup'}">${flight?'Continue Flight':'Plan Flight'}</button></section>
    <section class="card stack"><h2>Echo Lab</h2><p class="muted">Listen, record your attempt, and compare. Earn 100 points for each confirmed repeat.</p>
      <button data-action="echoLibrary">Open Echo Lab</button></section>
    <section class="card stack"><h2>Build a Flight</h2><p class="muted">Combine tasks and recordings. Choose your reminder days and time.</p>
      <button data-action="flightLibrary">My Flights · ${state.plans.length}</button></section>`;
}
function echoLibrary() {
  show('Echo Lab', `<div class="stack">${[...builtins,...state.sounds].map(sound=>`
    <article class="row"><div class="grow"><h3>${esc(sound.name)}</h3><small>${state.attempts.filter(item=>item.sample===sound.id).length} saved attempts</small></div>
      <button class="primary" data-action="practice" data-id="${esc(sound.id)}">Practice</button></article>`).join('')}</div>`);
}
function dailyStep(category, minutes, alternate = false) {
  const index = categories.indexOf(category);
  const defaults = [
    ['Tidy Your Perch','Put away five things around you.','Refresh Your Nest','Clear a small surface and put one thing back where it belongs.'],
    ['Fly to the Next Branch','Walk at a comfortable pace.','Follow the Flock','Alternate gentle side steps and arm movements.'],
    ['Echo the Call','Listen and repeat the macaw call.','Whistle with the Flock','Listen and repeat the three-note whistle.'],
  ][index];
  const slot = alternate ? 2 : 0;
  return {id:freshId(),category,title:defaults[slot],note:defaults[slot+1],
    method:['check','timer','sound'][index],target:index===1 ? (minutes-2)*60 : index===2 ? minutes===10?5:3 : undefined,
    sound:index===2 ? (alternate?'whistle':'call') : undefined, alternate};
}
let dailyDraft;
function dailySetup(minutes = 3) {
  if (!dailyDraft || dailyDraft.minutes !== minutes) {
    dailyDraft = {minutes,steps:categories.map(category=>dailyStep(category,minutes))};
  }
  show('Plan Daily Flight', `<div class="stack"><div class="actions">${[3,5,10].map(n=>`<button class="${n===minutes?'primary':''}" data-action="flightDuration" data-id="${n}" aria-pressed="${n===minutes}">${n} min</button>`).join('')}</div>
    ${dailyDraft.steps.map((step,i)=>`<div class="row spread"><div class="grow"><small>${step.category}</small><h3>${step.title}</h3></div><button data-action="flightSwap" data-id="${i}">Replace</button></div>`).join('')}
    <small>Estimated session length</small><button class="primary" data-action="flightStart">Start Daily Flight</button></div>`);
}
function makeFlight(name, steps) {
  state.flight = {name,index:0,steps:steps.map(step=>({...step,id:freshId()}))};
  save(); render(); flightDetails();
}
function advanceFlight(task) {
  const flight = state.flight;
  if (!flight || flight.steps[flight.index]?.id !== task.id) return;
  flight.index++;
  if (flight.index === flight.steps.length) {
    state.events.push({type:'flight',name:flight.name,time:Date.now()});
    state.flight = null;
  }
}
function flightDetails() {
  const flight = state.flight;
  if (!flight) return dailySetup();
  const step = flight.steps[flight.index];
  show(esc(flight.name), `<div class="stack"><small>Step ${flight.index+1} of ${flight.steps.length}</small>
    <progress class="progress" value="${flight.index}" max="${flight.steps.length}"></progress>
    <h3>${esc(step.title)}</h3><p>${esc(step.note)}</p>
    <button class="primary" data-action="flightStep">${step.method==='check'?'Mark Complete':'Start Step'}</button>
    <button data-action="flightEnd">End Flight</button></div>`);
}
function planLibrary() {
  show('Build a Flight',`<div class="stack"><button class="primary" data-action="planAdd">New Flight</button>
    ${state.plans.map(plan=>`<article class="card row spread"><div class="grow"><h3>${esc(plan.name)}</h3><small>${plan.steps.length} steps${plan.days.length ? ' · '+plan.days.map(day=>weekdays[day]).join(', ')+' at '+esc(plan.time) : ''}</small></div>
    <button data-action="planStart" data-id="${plan.id}" ${state.flight?'disabled':''}>Start</button>
    <button data-action="planEdit" data-id="${plan.id}">Edit</button></article>`).join('') || '<p class="muted">Save a routine you can repeat on your own schedule.</p>'}</div>`);
}
let planDraft;
function planEditor(plan) {
  planDraft = plan ? {...plan,steps:[...plan.steps]} : {id:freshId(),name:'',steps:[],days:[],time:'08:00'};
  drawPlanEditor();
}
function drawPlanEditor() {
  const plan = planDraft;
  show('Build a Flight',`<form id="planForm" class="stack">
    <label>Flight name<input name="name" maxlength="60" required value="${esc(plan.name)}"></label>
    <div class="stack">${plan.steps.map((step,i)=>`<div class="row spread"><strong class="grow">${i+1}. ${esc(step.title)}</strong><button type="button" data-action="planMove" data-id="${i}" ${i===0?'disabled':''} aria-label="Move step up">↑</button><button type="button" data-action="planRemove" data-id="${i}" aria-label="Remove step">✕</button></div>`).join('')}</div>
    <label>Add a step<select name="candidate"><option value="">Choose a task or recording</option>
    ${state.tasks.map(task=>`<option value="task:${task.id}">${esc(task.title)}</option>`).join('')}
    ${[...builtins,...state.sounds].map(sound=>`<option value="sound:${sound.id}">Echo: ${esc(sound.name)}</option>`).join('')}</select></label>
    <button type="button" data-action="planAppend">Add Step</button>
    <fieldset><legend>Reminder days</legend><div class="actions">${weekdays.map((day,i)=>`<label><input type="checkbox" name="day" value="${i}" ${plan.days.includes(i)?'checked':''}> ${day}</label>`).join('')}</div></fieldset>
    <label>Reminder time<input type="time" name="time" value="${esc(plan.time)}" required></label>
    <button class="primary">Save Flight</button>${state.plans.some(item=>item.id===plan.id)?'<button type="button" data-action="planDelete">Delete Flight</button>':''}</form>`);
}
function readPlanDraft() {
  const form = modal.querySelector('#planForm');
  const fields = new FormData(form);
  planDraft.name = String(fields.get('name')||'').trim();
  planDraft.days = fields.getAll('day').map(Number);
  planDraft.time = fields.get('time') || '08:00';
  return fields;
}
async function syncReminder(plan, remove = false) {
  const webview = window.flutter_inappwebview;
  if (!webview?.callHandler) return remove || !plan.days.length ? 'ok' : 'preview';
  try {
    return await webview.callHandler('flightReminder',{id:plan.id,name:plan.name,time:plan.time,days:remove?[]:plan.days});
  } catch (_) { return 'unavailable'; }
}
function renderEchoAttempts() {
  const session = active;
  if (!session?.sound) return;
  const target = modal.querySelector('#echoAttempts');
  if (!target) return;
  const saved = state.attempts.filter(item=>item.sample===session.sound.id).slice().reverse();
  const rhythm = session.sound.id==='rhythm' && session.rhythm;
  const rhythmBars = values => values.map(level=>`<span class="rhythm-level level-${level}"></span>`).join('');
  const comparison = rhythm ? `<div class="stack"><small>Reference rhythm</small><div class="rhythm-row" role="img" aria-label="Three reference beats with a pause after the first">${rhythmBars([5,0,5,5,0,0,0,0,0,0,0,0,0,0,0,0])}</div><small>Your rhythm</small><div class="rhythm-row" role="img" aria-label="Recorded sound levels over time">${rhythmBars(rhythm)}</div></div>` : '';
  target.innerHTML = `${comparison}${session.attempt ? '<div class="actions"><button data-action="echoPlayAttempt">Play My Attempt</button><button data-action="echoSave">Save Attempt</button></div>' : ''}
    ${saved.map(item=>`<article class="row spread"><small>${new Date(item.time).toLocaleString('en-US')}</small><button data-action="echoSavedPlay" data-id="${item.id}">Play Saved</button><button data-action="echoDelete" data-id="${item.id}" aria-label="Delete saved attempt">✕</button></article>`).join('')}`;
}
async function captureEcho(button) {
  const session = active;
  if (!session?.sound || session.recording) return;
  button.disabled = true;
  stopAudio();
  const canConfirm = session.ready;
  session.ready = false;
  updatePractice();
  const sampleButton = modal.querySelector('[data-action=practicePlay]');
  sampleButton.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    if (active !== session) {stream.getTracks().forEach(track=>track.stop()); return;}
    let recorder;
    try {recorder = new MediaRecorder(stream);}
    catch (error) {stream.getTracks().forEach(track=>track.stop()); throw error;}
    const chunks = [];
    const originalDispose = session.dispose;
    let limit;
    session.dispose = () => {
      clearTimeout(limit); stream.getTracks().forEach(track=>track.stop()); originalDispose?.();
    };
    session.recording = recorder;
    function reset() {
      session.dispose();
      session.dispose = originalDispose;
      session.recording = null;
      if (active === session) {
        button.textContent = 'Record My Attempt';
        button.dataset.action = 'echoRecord';
        button.disabled = false;
        sampleButton.disabled = false;
        session.ready = canConfirm;
        updatePractice();
      }
    }
    recorder.ondataavailable = event=>{if(event.data.size) chunks.push(event.data);};
    recorder.onstop = () => {
      reset();
      if (active !== session || !chunks.length) return;
      session.attempt = new Blob(chunks,{type:recorder.mimeType || chunks[0].type});
      session.rhythm = null;
      renderEchoAttempts();
      if (session.sound.id==='rhythm') compareRhythm(session,session.attempt);
    };
    recorder.onerror = () => {reset(); notify('Could not record this attempt.');};
    try {recorder.start();} catch (error) {reset(); throw error;}
    button.textContent = 'Stop Recording';
    button.dataset.action = 'echoStop';
    button.disabled = false;
    limit = setTimeout(()=>{if(recorder.state==='recording') recorder.stop();},30000);
  } catch (_) {
    if (active === session) {button.disabled = false; sampleButton.disabled = false; session.ready=canConfirm; updatePractice(); notify('Microphone unavailable. Check app permissions.');}
  }
}
async function compareRhythm(session, blob) {
  try {
    const context = soundContext ||= new AudioContext();
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = buffer.getChannelData(0);
    let start = samples.findIndex(sample=>Math.abs(sample)>.035);
    if (start<0) start=0;
    const width = Math.max(1,Math.floor(buffer.sampleRate*.27));
    const energy = Array.from({length:16},(_,index)=>{
      const offset = start+index*width;
      let peak=0;
      for(let i=offset;i<Math.min(offset+width,samples.length);i++) peak=Math.max(peak,Math.abs(samples[i]));
      return peak;
    });
    const max=Math.max(.035,...energy);
    if(active===session && session.attempt===blob) {
      session.rhythm=energy.map(level=>Math.round(level/max*5));
      renderEchoAttempts();
    }
  } catch (_) { /* Playback comparison is still available if decoding fails. */ }
}
function playAttempt(blob) {
  stopAudio();
  if (!blob) {notify('This recording is unavailable.'); return;}
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const cleanup = () => {audio.pause(); URL.revokeObjectURL(url); if(playing===cleanup) playing=null;};
  playing = cleanup;
  audio.onended = cleanup;
  audio.play().catch(()=>{cleanup(); notify('Could not play this attempt.');});
}
Object.assign(actions,{
  echoLibrary(){echoLibrary();},
  flightSetup(){dailyDraft=null; dailySetup();},
  flightDuration(id){dailySetup(Number(id));},
  flightSwap(id){const i=Number(id); const draft=dailyDraft; draft.steps[i]=dailyStep(categories[i],draft.minutes,!draft.steps[i].alternate); dailySetup(draft.minutes);},
  flightStart(){makeFlight('Daily Flight',dailyDraft.steps);},
  flightContinue(){flightDetails();},
  flightStep(){
    const step=state.flight.steps[state.flight.index];
    if(step.method==='timer') startTimer(step);
    else if(step.method==='sound') practice(selectedSound(step.sound),step);
    else {complete(step); if(state.flight) flightDetails(); else {closeModal(); notify('Flight complete');}}
  },
  flightEnd(){show('End Flight?', '<div class="stack"><p>Completed activity is saved.</p><button data-action="flightEndConfirm">End Flight</button><button data-action="flightContinue">Keep Flight</button></div>');},
  flightEndConfirm(){state.flight=null; save(); closeModal(); render();},
  flightLibrary(){planLibrary();},
  planAdd(){planEditor();},
  planEdit(id){planEditor(state.plans.find(plan=>plan.id===id));},
  planStart(id){
    if (state.flight) return;
    const plan=state.plans.find(item=>item.id===id);
    if(plan.steps.some(step=>step.method==='sound'&&!selectedSound(step.sound))) {notify('Edit this flight to replace a deleted sound.'); return;}
    makeFlight(plan.name,plan.steps);
  },
  planAppend(){
    const candidate=readPlanDraft().get('candidate');
    if (!candidate) {notify('Choose a task or recording.'); return;}
    const [type,id]=candidate.split(':');
    const step=type==='task'?state.tasks.find(task=>task.id===id):{category:'Sound Practice',method:'sound',title:selectedSound(id).name,sound:id,target:3,note:'Listen and imitate the recording.'};
    planDraft.steps.push({...step}); drawPlanEditor();
  },
  planRemove(id){readPlanDraft(); planDraft.steps.splice(Number(id),1); drawPlanEditor();},
  planMove(id){readPlanDraft(); const i=Number(id); [planDraft.steps[i-1],planDraft.steps[i]]=[planDraft.steps[i],planDraft.steps[i-1]]; drawPlanEditor();},
  async planDelete(){
    const plan=planDraft;
    state.plans=state.plans.filter(item=>item.id!==plan.id); save(); planLibrary();
    const result=await syncReminder(plan,true);
    if(result!=='ok') notify('Could not remove the system reminder.');
  },
  echoRecord(_,button){return captureEcho(button);},
  echoStop(){if(active?.recording?.state==='recording') active.recording.stop();},
  echoPlayAttempt(){if(active?.attempt && !active.recording) playAttempt(active.attempt);},
  async echoSave(_,button){
    const session=active;
    if (!session?.attempt || session.recording) return;
    const id=freshId();
    button.disabled=true;
    try {
      await useAudioStore('readwrite',store=>store.put(session.attempt,id));
      state.attempts.push({id,sample:session.sound.id,time:Date.now()}); save();
      if(active===session) {session.attempt=null; session.rhythm=null; renderEchoAttempts();}
      notify('Attempt saved');
    } catch (_) {button.disabled=false; notify('Could not save the attempt.');}
  },
  async echoSavedPlay(id){
    const session=active;
    if(session?.recording) return;
    try {
      const blob=await useAudioStore('readonly',store=>store.get(id));
      if(active===session) playAttempt(blob);
    } catch (_) {notify('Could not play this attempt.');}
  },
  async echoDelete(id){
    try {
      await useAudioStore('readwrite',store=>store.delete(id));
      state.attempts=state.attempts.filter(item=>item.id!==id); save(); renderEchoAttempts();
    } catch (_) {notify('Could not delete this attempt.');}
  },
});

render();
if (!sessionStorage.getItem('parrot-loaded') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  sessionStorage.setItem('parrot-loaded','1');
  const splash=document.createElement('div');
  splash.className='splash';
  splash.innerHTML='<img class="loader" src="parrot-loader-new.webp" alt=""><p>MT Par</p>';
  document.body.append(splash);
  setTimeout(()=>splash.remove(),850);
}
