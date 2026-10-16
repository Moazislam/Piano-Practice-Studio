'use strict';

// Short, simplified arrangements of public-domain melodies. Durations are in beats.
const PianoLessons = [
  {id:'ode', level:'beginner', title:'Ode to Joy', composer:'Ludwig van Beethoven', bpm:90,
    tip:'Keep your right hand relaxed. Use one finger per note from C4 to G4.',
    notes:[[64,1],[64,1],[65,1],[67,1],[67,1],[65,1],[64,1],[62,1],[60,1],[60,1],[62,1],[64,1],[64,1.5],[62,.5],[62,2]]},
  {id:'twinkle', level:'beginner', title:'Twinkle, Twinkle, Little Star', composer:'Traditional', bpm:80,
    tip:'Listen for repeated notes. Hold the last note of each phrase for two beats.',
    notes:[[60,1],[60,1],[67,1],[67,1],[69,1],[69,1],[67,2],[65,1],[65,1],[64,1],[64,1],[62,1],[62,1],[60,2]]},
  {id:'elise', level:'intermediate', title:'Für Elise', composer:'Ludwig van Beethoven', bpm:72,
    tip:'Alternate E5 and D♯5 lightly. Move your hand down for the broken chord.',
    notes:[[76,.5],[75,.5],[76,.5],[75,.5],[76,.5],[71,.5],[74,.5],[72,.5],[69,1],[60,.5],[64,.5],[69,.5],[71,1],[64,.5],[68,.5],[71,.5],[72,1.5]]},
  {id:'canon', level:'intermediate', title:'Canon in D', composer:'Johann Pachelbel', bpm:70,
    tip:'This melody is in D major: watch the F♯ and C♯ keys. Give each long note its full value.',
    notes:[[78,2],[76,2],[74,2],[73,2],[71,2],[69,2],[71,2],[73,2],[74,1],[73,1],[71,1],[69,1],[67,1],[66,1],[67,1],[64,1]]},
  {id:'moonlight', level:'advanced', title:'Moonlight Sonata', composer:'Ludwig van Beethoven', bpm:54,
    tip:'Play the opening triplets evenly. Notes highlighted together form a chord; hold the bass gently.',
    notes:[[[49,56,61],1/3],[64,1/3],[68,1/3],[56,1/3],[61,1/3],[64,1/3],[56,1/3],[61,1/3],[64,1/3],[56,1/3],[61,1/3],[64,1/3],[[47,56,61],1/3],[64,1/3],[68,1/3],[56,1/3],[61,1/3],[64,1/3],[[45,57,61],1/3],[64,1/3],[69,1/3],[[42,57,62],1/3],[66,1/3],[69,1/3]]},
  {id:'turkish', level:'advanced', title:'Turkish March', composer:'Wolfgang Amadeus Mozart', bpm:100,
    tip:'Start slowly. Keep the short notes crisp and prepare the next hand position before the leap.',
    notes:[[71,.5],[69,.5],[68,.5],[69,.5],[72,1],[0,.5],[74,.5],[72,.5],[71,.5],[72,.5],[76,1],[0,.5],[77,.5],[76,.5],[75,.5],[76,.5],[83,.5],[81,.5],[80,.5],[81,.5],[83,.5],[81,.5],[80,.5],[81,.5],[84,1.5]]}
].map(lesson => {
  let beat=0;
  const events=lesson.notes.map(([notes,duration])=>{
    const event={notes:notes===0?[]:Array.isArray(notes)?notes:[notes],beat,duration};
    beat+=duration;return event;
  });
  return {...lesson,events,beats:beat};
});

// Audio is scheduled ahead; the view reads that same audio timeline each frame.
class PianoTutorial {
  constructor(engine, metro, onStep, onEnd, timers=globalThis) {
    Object.assign(this,{engine,metro,onStep,onEnd,timers});
    this.running=false;this.index=0;this.voices=new Set();
  }
  start(lesson,bpm,index=0) {
    this.stop();this.lesson=lesson;this.bpm=bpm;this.index=index;
    this.origin=this.engine.context.currentTime+.08;
    this.startBeat=lesson.events[index].beat;this.next=index;this.clickBeat=Math.max(0,Math.ceil(this.startBeat-1e-8));
    this.running=true;this.shown=-1;this.schedule();
    this.timer=this.timers.setInterval(()=>this.schedule(),25);
    const draw=()=>{
      if(!this.running)return;
      const ctx=this.engine.context;
      const beat=(ctx.currentTime-this.origin-(ctx.outputLatency||ctx.baseLatency||0))*this.bpm/60+this.startBeat;
      if(beat>=lesson.beats){const clicks=this.metro.running;this.stop();this.onEnd(false,this.index,clicks);return;}
      if(beat>=this.startBeat){
        while(this.index+1<lesson.events.length&&lesson.events[this.index+1].beat<=beat+1e-8)this.index++;
        const event=lesson.events[this.index];
        const active=beat<event.beat+event.duration*.9;
        const signature=this.index+':'+active;
        if(signature!==this.shown){this.shown=signature;this.onStep(this.index,active);}
      }
      this.frame=this.timers.requestAnimationFrame(draw);
    };
    this.frame=this.timers.requestAnimationFrame(draw);
  }
  schedule() {
    if(!this.running)return;
    const ctx=this.engine.context, seconds=60/this.bpm;
    // On a long stall, stop cleanly instead of bursting all missed notes.
    if(this.next<this.lesson.events.length && this.origin+(this.lesson.events[this.next].beat-this.startBeat)*seconds<ctx.currentTime-.15){
      const index=this.index;this.stop();this.onEnd(true,index);return;
    }
    while(this.next<this.lesson.events.length){
      const event=this.lesson.events[this.next], time=this.origin+(event.beat-this.startBeat)*seconds;
      if(time>ctx.currentTime+.12)break;
      for(const midi of event.notes){
        const voice=this.engine.noteOn(midi,.65,time);
        if(voice){this.voices.add(voice);this.engine.release(voice,.12,time+event.duration*seconds*.9);}
      }
      this.next++;
    }
    while(this.metro.running&&this.clickBeat<this.lesson.beats){
      const time=this.origin+(this.clickBeat-this.startBeat)*seconds;
      if(time>ctx.currentTime+.12)break;
      if(time>=ctx.currentTime)this.metro.click(time,this.clickBeat%4);
      this.clickBeat++;
    }
  }
  stop() {
    this.running=false;this.timers.clearInterval(this.timer);this.timers.cancelAnimationFrame(this.frame);
    for(const voice of this.voices)this.engine.dispose(voice);this.voices.clear();
    this.metro.stop();
  }
}
if(typeof module!=='undefined')module.exports={PianoLessons,PianoTutorial};
