'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PianoLessons,PianoTutorial}=require('../piano-lessons');

function setup() {
  const strikes=[], releases=[], disposed=[], clicks=[], frames=new Map(), intervals=new Map();let id=0;
  const engine={context:{currentTime:0,outputLatency:.02},
    noteOn(midi,velocity,time){const voice={midi,time};strikes.push(voice);return voice;},
    release(voice,duration,time){releases.push({voice,duration,time});},dispose(voice){disposed.push(voice);}};
  const metro={running:false,stop(){this.running=false;},click(time,beat){clicks.push({time,beat});}};
  const timers={setInterval(fn){intervals.set(++id,fn);return id;},clearInterval(id){intervals.delete(id);},
    requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}};
  const steps=[],ends=[];
  const player=new PianoTutorial(engine,metro,(...args)=>steps.push(args),(...args)=>ends.push(args),timers);
  function draw(time){engine.context.currentTime=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}
  return {player,engine,metro,strikes,releases,disposed,clicks,steps,ends,intervals,frames,draw};
}

test('every level has playable excerpts with contiguous beat durations',()=>{
  for(const level of ['beginner','intermediate','advanced'])assert.ok(PianoLessons.filter(lesson=>lesson.level===level).length>=2);
  for(const lesson of PianoLessons){
    let beat=0;
    for(const event of lesson.events){assert.equal(event.beat,beat);assert.ok(event.duration>0);event.notes.forEach(note=>assert.ok(note>=21&&note<=108));beat+=event.duration;}
    assert.equal(lesson.beats,beat);
  }
});

test('audio, highlights and clicks follow the same timeline, including output latency',()=>{
  const s=setup(), lesson=PianoLessons[0];s.player.start(lesson,120);
  assert.equal(s.strikes[0].time,.08);assert.equal(s.releases[0].time,.08+.5*.9);
  s.metro.running=true;s.player.schedule();assert.deepEqual(s.clicks[0],{time:.08,beat:0});
  s.draw(.09);assert.equal(s.steps.length,0);
  s.draw(.11);assert.deepEqual(s.steps.at(-1),[0,true]);
  s.engine.context.currentTime=.5;s.player.schedule();assert.equal(s.strikes[1].time,.58);assert.equal(s.clicks[1].time,.58);
  s.draw(.61);assert.deepEqual(s.steps.at(-1),[1,true]);
  s.player.stop();assert.equal(s.intervals.size,0);assert.equal(s.frames.size,0);assert.equal(s.disposed.length,2);assert.equal(s.metro.running,false);
});

test('resume begins at the selected event; stalls pause without a burst',()=>{
  const s=setup(),lesson=PianoLessons[2];s.player.start(lesson,60,4);
  assert.equal(s.strikes[0].midi,lesson.events[4].notes[0]);assert.equal(s.strikes[0].time,.08);
  s.engine.context.currentTime=3;s.player.schedule();
  assert.equal(s.strikes.length,1);assert.equal(s.player.running,false);assert.deepEqual(s.ends,[[true,4]]);
});

test('completion releases playback and reports the end once',()=>{
  const s=setup(),lesson=PianoLessons[0];s.player.start(lesson,120,lesson.events.length-1);
  s.metro.running=true;s.draw(2);assert.equal(s.player.running,false);assert.deepEqual(s.ends,[[false,lesson.events.length-1,true]]);assert.equal(s.frames.size,0);
});
