'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const data = JSON.parse($('piano-sample-data').textContent);
  const engine = new PianoEngine(data);
  const held = new Map(), pointers = new Map(), keys = new Map();
  const offsets = [0,2,4,5,7,9,11,12], blacks = [1,3,6,8,10], boundaries = [1,2,4,5,6];
  const codes = ['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK'];
  const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const sequence = [0,2,4,5,7,9,11,12,11,9,7,5,4,2,0];
  let base = 60, pedalLatch = false, spacePedal = false, practicing = false, step = 0, rounds = 0;
  const name = midi => names[midi%12] + (Math.floor(midi/12)-1);
  const metro = new PianoMetronome(engine, beat => {
    document.querySelectorAll('.beat').forEach((dot,index) => dot.classList.toggle('active',beat===index));
  });

  function save() {
    const settings = {};
    for (const id of ['octave','volume','touch','room','tone','tempo']) settings[id] = $(id).value;
    try {localStorage.setItem('piano-studio-v2',JSON.stringify(settings));} catch {}
  }
  function restore() {
    let settings;
    try {settings = JSON.parse(localStorage.getItem('piano-studio-v2') || '{}');} catch {settings={};}
    const limits = {octave:[2,6],volume:[0,100],touch:[25,100],room:[0,100],tone:[0,100],tempo:[30,240]};
    for (const [id,[min,max]] of Object.entries(limits)) {
      const value=Number(settings[id]);
      if (settings[id]!==undefined && Number.isFinite(value)) $(id).value=String(Math.round(Math.max(min,Math.min(max,value))));
    }
    base=(Number($('octave').value)+1)*12;
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
    for(const [offset,key] of keys)key.classList.toggle('target',practicing&&offset===sequence[step]);
  }
  function press(offset,source,pressure) {
    if (!engine.ready || held.has(source)) return;
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
    render();
  }
  function release(source) {
    const entry=held.get(source);if(!entry)return;
    held.delete(source);engine.noteOff(entry.voice);render();
  }
  function pedal() {engine.setPedal(pedalLatch||spacePedal);render();}
  function silence() {
    held.clear();pointers.clear();pedalLatch=false;spacePedal=false;
    engine.allOff();metro.stop();$('metronome').setAttribute('aria-pressed','false');render();
  }
  function build() {
    keys.clear();$('keyboard').replaceChildren();
    const add=(offset,black,boundary)=>{
      const key=document.createElement('button');key.type='button';key.className='piano-key '+(black?'black':'white');
      key.dataset.offset=String(offset);key.disabled=!engine.ready;
      key.setAttribute('aria-label',`${name(base+offset)}, ${codes[offset].slice(3)} key`);
      if(black)key.style.left=(boundary*12.5)+'%';
      const note=document.createElement('span');note.className='key-note';note.textContent=name(base+offset);
      const shortcut=document.createElement('span');shortcut.className='key-shortcut';shortcut.textContent=codes[offset].slice(3);
      key.append(note,shortcut);keys.set(offset,key);$('keyboard').append(key);
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
    offsets.forEach(n=>add(n,false));blacks.forEach((n,i)=>add(n,true,boundaries[i]));practiceUI();render();
  }
  window.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.piano-key');
    const offset=hit&&$('keyboard').contains(hit)?Number(hit.dataset.offset):null;
    if(pointers.get(e.pointerId)!==offset){release('pointer:'+e.pointerId);pointers.set(e.pointerId,offset);if(offset!==null)press(offset,'pointer:'+e.pointerId,e.pressure);}
  });
  for(const event of ['pointerup','pointercancel'])window.addEventListener(event,e=>{release('pointer:'+e.pointerId);pointers.delete(e.pointerId);});
  function isEditing(target) {return target.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);}
  document.addEventListener('keydown',e=>{
    if(e.code==='Escape'){e.preventDefault();silence();return;}
    if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||isEditing(e.target))return;
    if(e.code==='Space'&&e.target.id!=='start') {e.preventDefault();if(!e.repeat&&engine.ready){spacePedal=true;pedal();}return;}
    const offset=codes.indexOf(e.code);
    if(offset>=0){e.preventDefault();if(!e.repeat)press(offset,'keyboard:'+e.code);}
  });
  document.addEventListener('keyup',e=>{
    if(e.code==='Space'&&spacePedal){spacePedal=false;pedal();}
    if(codes.includes(e.code))release('keyboard:'+e.code);
  });
  $('start').addEventListener('click',async()=>{
    $('start').disabled=true;$('start').textContent='Loading piano…';
    try {
      await engine.init((done,total)=>{$('sound-status').textContent=`Preparing piano · ${done}/${total}`;});
      $('start').hidden=true;$('status-dot').classList.add('ready');$('sound-status').textContent='Grand piano · ready';
      for(const id of ['sustain','stop','metronome','practice'])$(id).disabled=false;
      $('message').textContent='Play with the letters on the keys. Hold Space for sustain.';
      build();
      engine.context.onstatechange=()=>{$('sound-status').textContent=engine.context.state==='running'?'Grand piano · ready':'Audio paused · play a key to resume';};
    } catch(error) {
      $('sound-status').textContent='Could not start audio';$('message').textContent=error.message;
      $('start').textContent='Reload to retry';$('start').disabled=false;$('start').onclick=()=>location.reload();
    }
  });
  $('octave').addEventListener('change',()=>{silence();base=(Number($('octave').value)+1)*12;step=0;build();save();});
  for(const id of ['volume','touch','room','tone']){
    $(id).addEventListener('input',controls);$(id).addEventListener('change',save);
  }
  $('sustain').addEventListener('click',()=>{pedalLatch=!pedalLatch;pedal();});
  $('stop').addEventListener('click',()=>{silence();$('message').textContent='All notes stopped.';});
  $('metronome').addEventListener('click',()=>{
    if(metro.running)metro.stop();else{if(engine.context.state==='suspended')engine.context.resume().catch(()=>{});metro.start();}
    $('metronome').setAttribute('aria-pressed',String(metro.running));
  });
  $('tempo').addEventListener('change',()=>{$('tempo').value=metro.setTempo($('tempo').value);save();});
  $('practice').addEventListener('click',()=>{practicing=!practicing;step=0;rounds=0;$('message').textContent=practicing?'Play the marked note to begin.':'';practiceUI();});
  window.addEventListener('blur',silence);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)silence();});
  window.addEventListener('pagehide',silence);
  restore();controls();metro.setTempo($('tempo').value);build();
})();
