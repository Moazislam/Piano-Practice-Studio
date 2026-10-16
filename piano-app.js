'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const data = JSON.parse($('piano-sample-data').textContent);
  const engine = new PianoEngine(data);
  const held = new Map(), pointers = new Map(), keys = new Map();
  const blackNotes = new Set([1,3,6,8,10]);
  const codes = ['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK',
    'Digit2','KeyX','Digit3','KeyC','KeyV','Digit5','KeyB','Digit6','KeyN','Digit7','KeyM','Comma'];
  const keyOffset = code => code==='KeyZ'?12:codes.indexOf(code);
  const shortcut = offset => offset===12?'K / Z':codes[offset]==='Comma'?',':codes[offset]?.replace(/^(Key|Digit)/,'')||'';
  const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const sequence = [0,2,4,5,7,9,11,12,11,9,7,5,4,2,0];
  let lesson = PianoLessons[0], lessonMode = 'idle', lessonStep = 0, chordPlayed = new Set(), demoNotes = new Set();
  let base = 60, pedalLatch = false, spacePedal = false, practicing = false, step = 0, rounds = 0;
  const name = midi => names[midi%12] + (Math.floor(midi/12)-1);
  const metro = new PianoMetronome(engine, beat => {
    document.querySelectorAll('.beat').forEach((dot,index) => dot.classList.toggle('active',beat===index));
  });
  const tutorial = new PianoTutorial(engine,metro,(index,active)=>{
    lessonStep=index;demoNotes=new Set(active?lesson.events[index].notes:[]);lessonUI();render();
  },(stalled,index,clicks)=>{
    demoNotes.clear();$('metronome').setAttribute('aria-pressed','false');
    if(stalled){lessonStep=index;lessonMode='paused';$('message').textContent='Playback paused after an interruption. Select Resume to continue.';}
    else if($('lesson-loop').checked){lessonMode='idle';lessonStep=0;playLesson();if(clicks){metro.running=true;$('metronome').setAttribute('aria-pressed','true');}return;}
    else {lessonMode='complete';lessonStep=lesson.events.length;}
    lessonUI();render();
  });
  function populateSongs(preferred) {
    $('song').replaceChildren();
    for(const item of PianoLessons.filter(item=>item.level===$('level').value)){
      const option=document.createElement('option');option.value=item.id;option.textContent=item.title;$('song').append(option);
    }
    if([...$('song').options].some(option=>option.value===preferred))$('song').value=preferred;
    lesson=PianoLessons.find(item=>item.id===$('song').value);
  }
  function updateTargets() {
    const target=new Set(lessonMode==='practice'?(lesson.events[lessonStep]?.notes||[]).filter(midi=>!chordPlayed.has(midi)):[]);
    for(const [offset,key] of keys)key.classList.toggle('target',practicing&&offset===sequence[step]||target.has(base+offset));
  }
  function lessonUI() {
    $('lesson-composer').textContent=lesson.composer+' · '+lesson.events.length+' steps · suggested '+lesson.bpm+' BPM';
    $('lesson-tip').textContent=lesson.tip;
    $('listen').textContent=lessonMode==='playing'?'Pause':lessonMode==='paused'?'Resume':'Listen & follow';
    $('learn').textContent=lessonMode==='practice'?'End tutorial':'Practice step by step';
    $('learn').setAttribute('aria-pressed',String(lessonMode==='practice'));
    const event=lesson.events[lessonStep];
    $('lesson-status').textContent=lessonMode==='complete'?'Excerpt complete! Restart or choose another piece.':
      lessonMode==='idle'?'Listen to the excerpt or practice at your own pace.':
      `${lessonMode==='playing'?'Playing':lessonMode==='paused'?'Paused':'Play'} · Step ${lessonStep+1} of ${lesson.events.length} · ${event?.notes.length?event.notes.map(name).join(' + '):'Rest'}`;
    const percent=lessonStep/lesson.events.length*100;
    $('lesson-fill').style.width=percent+'%';document.querySelector('.lesson-progress').setAttribute('aria-valuenow',String(Math.round(percent)));
    const strip=$('lesson-notes');
    if(strip.dataset.lesson!==lesson.id){
      strip.dataset.lesson=lesson.id;strip.replaceChildren();
      for(const event of lesson.events){
        const chip=document.createElement('span');chip.className='lesson-note';
        const label=document.createElement('span');label.textContent=event.notes.map(name).join(' + ')||'Rest';
        const duration=document.createElement('small');duration.textContent=(Math.abs(event.duration-1/3)<.001?'⅓':event.duration)+' beats';
        chip.append(label,duration);strip.append(chip);
      }
    }
    [...strip.children].forEach((chip,index)=>{chip.classList.toggle('current',index===lessonStep&&lessonMode!=='idle');chip.classList.toggle('done',index<lessonStep);});
    const chip=strip.children[lessonStep];
    if(chip&&lessonMode!=='idle'&&(chip.offsetLeft-strip.offsetLeft<strip.scrollLeft||chip.offsetLeft-strip.offsetLeft+chip.offsetWidth>strip.scrollLeft+strip.clientWidth))strip.scrollLeft=chip.offsetLeft-strip.offsetLeft-strip.clientWidth/2;
    updateTargets();
    const midi=lessonMode==='playing'?[...demoNotes][0]:lessonMode==='practice'?event?.notes.find(note=>!chordPlayed.has(note)):null;
    const key=keys.get(midi-base), viewport=$('keyboard').parentElement;
    if(key&&(key.offsetLeft<viewport.scrollLeft||key.offsetLeft+key.offsetWidth>viewport.scrollLeft+viewport.clientWidth))viewport.scrollLeft=Math.max(0,key.offsetLeft-viewport.clientWidth/2);
  }
  function endLesson() {
    tutorial.stop();lessonMode='idle';lessonStep=0;chordPlayed.clear();demoNotes.clear();
    $('metronome').setAttribute('aria-pressed','false');lessonUI();render();
  }
  function prepareLesson() {
    silence();practicing=false;practiceUI();
    const notes=lesson.events.flatMap(event=>event.notes), low=Math.min(...notes), high=Math.max(...notes);
    base=Math.floor(low/12)*12;$('octave').value=String(base/12-1);
    $('range').value=high-base>24?'88':'24';build();
    const key=keys.get(low-base), viewport=$('keyboard').parentElement;
    if(key)viewport.scrollLeft=Math.max(0,key.offsetLeft-60);
  }
  function playLesson() {
    if(!engine.ready)return;
    if(lessonMode==='complete'||lessonMode==='idle')lessonStep=0;
    const clicks=metro.running;
    prepareLesson();lessonMode='playing';chordPlayed.clear();
    tutorial.start(lesson,metro.bpm,lessonStep);
    if(clicks){metro.running=true;$('metronome').setAttribute('aria-pressed','true');}
    lessonUI();
  }
  function pauseLesson() {
    lessonStep=tutorial.index;tutorial.stop();lessonMode='paused';demoNotes.clear();
    $('metronome').setAttribute('aria-pressed','false');lessonUI();render();
  }
  function advanceLesson(midi) {
    const event=lesson.events[lessonStep];
    if(!event.notes.includes(midi)){$('message').textContent='Try the gold marked '+event.notes.map(name).join(' + ')+' keys.';return;}
    chordPlayed.add(midi);
    if(event.notes.every(note=>chordPlayed.has(note))){
      chordPlayed.clear();lessonStep++;
      while(lesson.events[lessonStep]?.notes.length===0)lessonStep++;
      if(lessonStep===lesson.events.length){
        if($('lesson-loop').checked)lessonStep=0;else lessonMode='complete';
        $('message').textContent='Well played! You completed the excerpt.';
      }else $('message').textContent='';
    }
    lessonUI();
  }
  $('level').addEventListener('change',()=>{endLesson();populateSongs();$('tempo').value=metro.setTempo(lesson.bpm);lessonUI();save();});
  $('song').addEventListener('change',()=>{endLesson();lesson=PianoLessons.find(item=>item.id===$('song').value);$('tempo').value=metro.setTempo(lesson.bpm);lessonUI();save();});
  $('listen').addEventListener('click',()=>{if(lessonMode==='playing')pauseLesson();else playLesson();});
  $('learn').addEventListener('click',()=>{
    if(lessonMode==='practice'){endLesson();return;}
    endLesson();prepareLesson();lessonMode='practice';lessonUI();
  });
  $('lesson-restart').addEventListener('click',()=>{
    const mode=lessonMode;endLesson();
    if(mode==='playing'||mode==='paused')playLesson();
    else{prepareLesson();lessonMode='practice';lessonUI();}
  });

  function save() {
    const settings = {};
    for (const id of ['octave','range','level','song','volume','touch','room','tone','tempo']) settings[id] = $(id).value;
    try {localStorage.setItem('piano-studio-v2',JSON.stringify(settings));} catch {}
  }
  function restore() {
    let settings;
    try {settings = JSON.parse(localStorage.getItem('piano-studio-v2') || '{}');} catch {settings={};}
    const limits = {octave:[0,7],volume:[0,100],touch:[25,100],room:[0,100],tone:[0,100],tempo:[30,240]};
    for (const [id,[min,max]] of Object.entries(limits)) {
      const value=Number(settings[id]);
      if (settings[id]!==undefined && Number.isFinite(value)) $(id).value=String(Math.round(Math.max(min,Math.min(max,value))));
    }
    base=(Number($('octave').value)+1)*12;
    if(['12','24','88'].includes(settings.range))$('range').value=settings.range;
    if(['beginner','intermediate','advanced'].includes(settings.level))$('level').value=settings.level;
    populateSongs(settings.song);
  }
  function controls() {
    for(const id of ['volume','room','tone']) $(id+'-value').textContent=$(id).value+'%';
    const touch=Number($('touch').value);
    $('touch-value').textContent=touch<45?'Soft':touch<80?'Medium':'Firm';
    engine.setVolume(Number($('volume').value)/100);
    engine.setRoom(Number($('room').value)/100);
    engine.setTone(Number($('tone').value)/100);
  }
  function render() {
    const pressed = new Set([...held.values()].map(entry=>entry.midi));
    const sustained = new Set([...engine.voices].filter(v=>!v.releasing&&!v.ended).map(v=>v.midi));
    for(const [offset,key] of keys) {
      key.classList.toggle('down',pressed.has(base+offset));
      key.classList.toggle('demo',demoNotes.has(base+offset));
      key.classList.toggle('ringing',!pressed.has(base+offset)&&sustained.has(base+offset));
    }
    const sounding=[...new Set([...pressed,...sustained])].sort((a,b)=>a-b);
    $('notes').textContent=sounding.length?sounding.map(name).join(' · '):engine.ready?'Ready to play':'Your piano is ready';
    $('sustain').setAttribute('aria-pressed',String(engine.pedal));
    $('pedal-status').textContent=engine.pedal?'Sustain held':'Sustain off';
  }
  engine.onVoicesChanged = render;
  function practiceUI() {
    $('practice').setAttribute('aria-pressed',String(practicing));
    $('practice').textContent=practicing?'End practice':'Practice C major';
    $('practice-title').textContent=practicing?'Next note: '+name(base+sequence[step]):'One scale, one small step';
    $('practice-detail').textContent=practicing?`Note ${step+1} of 15 · ${step<8?'Ascending':'Descending'}${rounds?' · '+rounds+' complete':''}`:'Follow C major up and down at your own pace.';
    $('progress-fill').style.width=(practicing?step/15*100:0)+'%';
    document.querySelector('.progress').setAttribute('aria-valuenow',String(practicing?step:0));
    updateTargets();
  }
  function press(offset,source,pressure) {
    if (!engine.ready || held.has(source) || !keys.has(offset)) return;
    let velocity=Number($('touch').value)/100;
    if(Number.isFinite(pressure)&&pressure>0&&pressure!==.5)velocity=Math.max(.25,Math.min(1,velocity*(.7+.6*pressure)));
    const midi=base+offset,voice=engine.noteOn(midi,velocity);
    if(!voice)return;
    held.set(source,{midi,voice});
    if(practicing) {
      if(offset===sequence[step]) {
        step++;
        if(step===sequence.length){step=0;rounds++;$('message').textContent='Scale complete! Take a breath, then start again.';}
        else $('message').textContent='';
        practiceUI();
      } else $('message').textContent='Try the marked '+name(base+sequence[step])+' key.';
    }
    if(lessonMode==='practice')advanceLesson(midi);
    render();
  }
  function release(source) {
    const entry=held.get(source);if(!entry)return;
    held.delete(source);engine.noteOff(entry.voice);render();
  }
  function pedal() {engine.setPedal(pedalLatch||spacePedal);render();}
  function silence() {
    if(lessonMode==='playing')pauseLesson();
    held.clear();pointers.clear();pedalLatch=false;spacePedal=false;
    engine.allOff();metro.stop();$('metronome').setAttribute('aria-pressed','false');render();
  }
  function build(bounds) {
    keys.clear();$('keyboard').replaceChildren();
    const full=$('range').value==='88', span=Number($('range').value);
    const first=bounds?.first??(full?21:Math.max(21,Math.min(108-span,base))), last=bounds?.last??(full?108:Math.min(108,first+span));
    $('keyboard').dataset.first=first;$('keyboard').dataset.last=last;
    const whiteCount=Array.from({length:last-first+1},(_,i)=>first+i).filter(midi=>!blackNotes.has(midi%12)).length;
    $('keyboard').style.setProperty('--white-count',whiteCount);
    $('keyboard').style.minWidth=(whiteCount*46)+'px';
    $('range-label').textContent=name(first)+' \u2013 '+name(last);
    const add=(offset,black,boundary)=>{
      const key=document.createElement('button');key.type='button';key.className='piano-key '+(black?'black':'white');
      key.dataset.offset=String(offset);key.disabled=!engine.ready;
      key.setAttribute('aria-label',name(base+offset)+(shortcut(offset)?', keyboard '+shortcut(offset):''));
      if(codes[offset])key.setAttribute('aria-keyshortcuts',offset===12?'K Z':shortcut(offset));
      if(black)key.style.left=(boundary/whiteCount*100)+'%';
      const note=document.createElement('span');note.className='key-note';note.textContent=name(base+offset);
      const hint=document.createElement('span');hint.className='key-shortcut';hint.textContent=shortcut(offset);
      key.append(note,hint);keys.set(offset,key);$('keyboard').append(key);
      key.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse'&&e.button!==0)return;
        e.preventDefault();key.setPointerCapture(e.pointerId);pointers.set(e.pointerId,offset);press(offset,'pointer:'+e.pointerId,e.pressure);
      });
      key.addEventListener('lostpointercapture',e=>{release('pointer:'+e.pointerId);pointers.delete(e.pointerId);});
      // Native keyboard activation is handled explicitly to preserve note duration.
      key.addEventListener('keydown',e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();if(!e.repeat)press(offset,'button:'+offset);}});
      key.addEventListener('keyup',e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();release('button:'+offset);}});
      key.addEventListener('blur',()=>release('button:'+offset));
      // Assistive technologies can activate a button with a click without a key event.
      key.addEventListener('click',e=>{if(e.detail===0&&!held.has('button:'+offset)){const source='assist:'+offset;press(offset,source);setTimeout(()=>release(source),250);}});
    };
    let boundary=0;
    for(let midi=first;midi<=last;midi++){
      const black=blackNotes.has(midi%12);add(midi-base,black,boundary);if(!black)boundary++;
    }
    practiceUI();render();
  }
  window.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.piano-key');
    const offset=hit&&$('keyboard').contains(hit)?Number(hit.dataset.offset):null;
    if(pointers.get(e.pointerId)!==offset){release('pointer:'+e.pointerId);pointers.set(e.pointerId,offset);if(offset!==null)press(offset,'pointer:'+e.pointerId,e.pressure);}
  });
  for(const event of ['pointerup','pointercancel'])window.addEventListener(event,e=>{release('pointer:'+e.pointerId);pointers.delete(e.pointerId);});
  function isEditing(target) {return target.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);}
  function eventCode(e) {
    if(e.code)return e.code;
    if(/^[a-z]$/i.test(e.key))return 'Key'+e.key.toUpperCase();
    if(/^\d$/.test(e.key))return 'Digit'+e.key;
    return {' ':'Space',',':'Comma'}[e.key]||e.key;
  }
  document.addEventListener('keydown',e=>{
    if(e.isComposing)return;
    const code=eventCode(e);
    if(code==='Escape'){e.preventDefault();silence();return;}
    if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||isEditing(e.target))return;
    if(code==='Enter'&&!engine.ready&&!e.target.closest('button,a,summary')){e.preventDefault();if(!e.repeat&&!$('start').disabled)$('start').click();return;}
    if(code==='Space') {
      if(e.target.closest('button,a,summary'))return;
      e.preventDefault();if(!e.repeat&&engine.ready){spacePedal=true;pedal();}return;
    }
    const action={KeyR:'listen',KeyP:'learn',Backspace:'lesson-restart'}[code];
    if(action){e.preventDefault();if(!e.repeat&&!$(action).disabled)$(action).click();return;}
    if(code==='ArrowLeft'||code==='ArrowRight'){
      e.preventDefault();if(e.repeat)return;
      $('octave').value=String(Math.max(0,Math.min(7,Number($('octave').value)+(code==='ArrowRight'?1:-1))));
      $('octave').dispatchEvent(new Event('change'));return;
    }
    const offset=keyOffset(code);
    if(offset>=0){e.preventDefault();if(!e.repeat){press(offset,'keyboard:'+code);const key=keys.get(offset);if(key){const viewport=$('keyboard').parentElement;if(key.offsetLeft<viewport.scrollLeft||key.offsetLeft+key.offsetWidth>viewport.scrollLeft+viewport.clientWidth)viewport.scrollLeft=Math.max(0,key.offsetLeft-viewport.clientWidth/2);}}}
  });
  document.addEventListener('keyup',e=>{
    const code=eventCode(e);
    if(code==='Space'&&spacePedal){spacePedal=false;pedal();}
    if(keyOffset(code)>=0)release('keyboard:'+code);
  });
  $('start').addEventListener('click',async()=>{
    $('start').disabled=true;$('start').textContent='Loading piano…';
    try {
      await engine.init((done,total)=>{$('sound-status').textContent=`Preparing piano · ${done}/${total}`;});
      $('start').hidden=true;$('status-dot').classList.add('ready');$('sound-status').textContent='Grand piano · ready';
      for(const id of ['sustain','stop','metronome','practice','listen','learn','lesson-restart'])$(id).disabled=false;
      $('message').textContent='Play with the letters on the keys. Hold Space for sustain.';
      build();
      engine.context.onstatechange=()=>{$('sound-status').textContent=engine.context.state==='running'?'Grand piano · ready':'Audio paused · play a key to resume';};
    } catch(error) {
      $('sound-status').textContent='Could not start audio';$('message').textContent=error.message;
      $('start').textContent='Reload to retry';$('start').disabled=false;$('start').onclick=()=>location.reload();
    }
  });
  $('octave').addEventListener('change',()=>{
    // Remap physical keys without resetting a tutorial or its playback clock.
    const keepLesson=lessonMode!=='idle', bounds=keepLesson?{first:Number($('keyboard').dataset.first),last:Number($('keyboard').dataset.last)}:undefined;
    for(const source of [...held.keys()])release(source);
    pointers.clear();pedalLatch=false;spacePedal=false;pedal();
    base=(Number($('octave').value)+1)*12;step=0;build(bounds);lessonUI();save();
    if(!keepLesson){const key=keys.get(0)||keys.values().next().value;if(key)$('keyboard').parentElement.scrollLeft=Math.max(0,key.offsetLeft-60);}
  });
  $('keyboard-focus').addEventListener('click',()=>$('keyboard').focus());
  for(const id of ['volume','touch','room','tone']){
    $(id).addEventListener('input',controls);$(id).addEventListener('change',save);
  }
  $('sustain').addEventListener('click',()=>{pedalLatch=!pedalLatch;pedal();});
  $('stop').addEventListener('click',()=>{silence();$('message').textContent='All notes stopped.';});
  $('range').addEventListener('change',()=>{silence();endLesson();build();save();});
  $('metronome').addEventListener('click',()=>{
    if(lessonMode==='playing'){
      if(metro.running)metro.stop();else metro.running=true;
      $('metronome').setAttribute('aria-pressed',String(metro.running));return;
    }
    if(metro.running)metro.stop();else{if(engine.context.state==='suspended')engine.context.resume().catch(()=>{});metro.start();}
    $('metronome').setAttribute('aria-pressed',String(metro.running));
  });
  $('tempo').addEventListener('change',()=>{const playing=lessonMode==='playing', clicks=metro.running;
    if(playing)pauseLesson();
    $('tempo').value=metro.setTempo($('tempo').value);
    if(playing){playLesson();if(clicks){metro.running=true;$('metronome').setAttribute('aria-pressed','true');}}
    save();});
  $('practice').addEventListener('click',()=>{endLesson();if(base<24){base=24;$('octave').value='1';build();}practicing=!practicing;step=0;rounds=0;$('message').textContent=practicing?'Play the marked note to begin.':'';practiceUI();});
  window.addEventListener('blur',silence);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)silence();});
  window.addEventListener('pagehide',silence);
  restore();controls();metro.setTempo($('tempo').value);build();lessonUI();
})();
