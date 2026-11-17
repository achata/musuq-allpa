/* Original, procedural ambient/lofi music. Nothing streams or downloads. */
window.NeugracRadio = (() => {
  const mascot = document.getElementById('ma-ng');
  const root = document.getElementById('musuq-parcela');
  const tracks = [ { key:'orbit', bpm:66, base:48, notes:[0,3,7,10,14] }, { key:'moon', bpm:60, base:45, notes:[0,4,7,11,14] }, { key:'soil', bpm:72, base:50, notes:[0,3,7,10,12] }, { key:'stars', bpm:64, base:43, notes:[0,5,7,10,14] } ];
  let context, master, bus, scheduler, nextBeat=0, beat=0, track=0, playing=false, holding, origin, activated=false, generation=0, lastSkip=0;
  const active = new Set();
  const hz = midi => 440 * 2 ** ((midi-69)/12);
  async function unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw Error('AUDIO_UNAVAILABLE');
    if (!context) {
      context = new Audio(); master=context.createGain(); master.gain.value=.32;
      const filter=context.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=4200;
      const compressor=context.createDynamicsCompressor();
      master.connect(filter); filter.connect(compressor); compressor.connect(context.destination);
    }
    await context.resume();
  }
  function note(midi, start, duration, volume, type='sine', pan=0) {
    const oscillator=context.createOscillator(), gain=context.createGain();
    oscillator.type=type; oscillator.frequency.value=hz(midi);
    gain.gain.setValueAtTime(.0001,start); gain.gain.exponentialRampToValueAtTime(volume,start+.06);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    oscillator.connect(gain);
    if (context.createStereoPanner) { const p=context.createStereoPanner(); p.pan.value=pan; gain.connect(p); p.connect(bus); oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();p.disconnect();active.delete(oscillator);}; }
    else { gain.connect(bus); oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();active.delete(oscillator);}; }
    active.add(oscillator); oscillator.start(start); oscillator.stop(start+duration+.1);
  }
  function schedule() {
    if (!playing || context.state !== 'running') return;
    const score=tracks[track], step=60/score.bpm/2;
    while(nextBeat < context.currentTime+.25) {
      const i=beat%32, chord=[0,5,3,7][Math.floor(i/8)];
      if(i%8===0) [0,score.notes[1],7,10].forEach((n,k)=>note(score.base+chord+n,nextBeat,step*9,.032,'triangle',(k-1.5)*.35));
      if(i%4===0) note(score.base-12+chord,nextBeat,step*3.3,.11,'sine');
      if(i%2===1) note(score.base+12+score.notes[(beat*3+track)%score.notes.length],nextBeat+.025,step*2.4,.035,'sine',Math.sin(beat)*.65);
      // Soft pitched percussion stays below the pads.
      if(i%4===0) note(24,nextBeat,.16,.055,'sine');
      if(i%4===2) note(78,nextBeat,.075,.012,'triangle');
      beat++; nextBeat+=step;
    }
  }
  function render(message) {
    if (!window.CampoI18n?.catalog) return;
    const t=key=>CampoI18n.t('radio.'+key);
    const status=document.getElementById('ma-radio-status');
    if(status) status.textContent=message || (playing ? t('playing')+' · '+t('tracks.'+tracks[track].key) : t('hint'));
    mascot.setAttribute('aria-label',t(playing?'stopHint':'startHint'));
    mascot.setAttribute('aria-pressed',String(playing));
    root.dataset.radio=playing?'on':'off'; root.dataset.radioTrack=String(track);
  }
  function stop() {
    generation++;
    playing=false;clearInterval(scheduler);
    if(bus && context) { const fading=bus; fading.gain.cancelScheduledValues(context.currentTime);fading.gain.setTargetAtTime(.0001,context.currentTime,.15);setTimeout(()=>fading.disconnect(),1000); }
    for(const node of active) { try{node.stop(context.currentTime+.8);}catch{} }
    render();
  }
  async function start() {
    const attempt=++generation;
    try { await unlock(); if(attempt!==generation)return; playing=true; bus=context.createGain();bus.gain.value=.0001;bus.gain.setTargetAtTime(1,context.currentTime,.3);bus.connect(master);beat=0;nextBeat=context.currentTime+.05;schedule();scheduler=setInterval(schedule,100);render(); }
    catch { playing=false;render(CampoI18n.t('radio.unavailable')); }
  }
  function next() { if(!playing || Date.now()-lastSkip<700)return;lastSkip=Date.now();stop();track=(track+1)%tracks.length;start(); }
  function clearHold() {clearTimeout(holding);mascot.classList.remove('radio-holding');}
  function begin(event) {
    if(event.button>0)return;
    origin={x:event.clientX||0,y:event.clientY||0}; activated=false;
    unlock().catch(()=>{}); clearHold(); mascot.classList.add('radio-holding');
    holding=setTimeout(()=>{activated=true;mascot.classList.remove('radio-holding');if(playing)stop();else start();navigator.vibrate?.(30);},3000);
  }
  mascot.tabIndex=0;mascot.setAttribute('role','button');
  mascot.addEventListener('pointerdown',begin);
  mascot.addEventListener('pointermove',e=>{if(origin && Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>14)clearHold();});
  mascot.addEventListener('pointerup',event=>{const thrown=origin && Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>55;clearHold();if(thrown && !activated)next();origin=null;});
  mascot.addEventListener('pointercancel',()=>{clearHold();origin=null;});
  mascot.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();begin(e);}});
  mascot.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();clearHold();}});
  document.addEventListener('neugrac:throw',()=>{if(!activated)next();});
  document.addEventListener('campo:language',()=>render());
  document.addEventListener('campo:interactive-ready',()=>render());
  window.addEventListener('pagehide',()=>{clearHold();stop();context?.close();},{once:true});
  return { start, stop, next, get playing(){return playing;}, get track(){return track;} };
})();
