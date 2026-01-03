// Математична пригода — логіка гри (українською)
const coinsEl = document.getElementById('coins');
const levelEl = document.getElementById('level');
const progressBar = document.getElementById('progressBar');
const badgeArea = document.getElementById('badgeArea');
const problemEl = document.getElementById('problem');
const optionsEl = document.getElementById('options');
const feedbackEl = document.getElementById('feedback');
const newBtn = document.getElementById('newBtn');
// drag mode removed — tap only
const levelOverlay = document.getElementById('levelOverlay');
const overlayLevel = document.getElementById('overlayLevel');
const livesEl = document.getElementById('lives');
const gameOverModal = document.getElementById('gameOverModal');
const gameStats = document.getElementById('gameStats');
const modalClose = document.getElementById('modalClose');
const modalFinish = document.getElementById('modalFinish');
const endBtn = document.getElementById('endBtn');
const btnSettings = document.getElementById('btnSettings');
const settingsModal = document.getElementById('settingsModal');
const settingsClose = document.getElementById('settingsClose');
const settingsSave = document.getElementById('settingsSave');
const settingSound = document.getElementById('settingSound');
const settingVolume = document.getElementById('settingVolume');
// sound source removed from settings

const progressModal = document.getElementById('progressModal');
const progressClose = document.getElementById('progressClose');
const progressBody = document.getElementById('progressBody');
// export/import removed from progress modal

const parentModal = document.getElementById('parentModal');
const parentClose = document.getElementById('parentClose');
const parentUnlock = document.getElementById('parentUnlock');
const parentPin = document.getElementById('parentPin');
const parentBody = document.getElementById('parentBody');
const mainSettingsText = document.getElementById('mainSettingsText');
const ratingsBox = document.getElementById('ratingsBox');
const startRatingBtn = document.getElementById('startRatingBtn');
const startSettingsBtn = document.getElementById('startSettingsBtn');

// helper to show/hide rating box (used to hide during active play)
function setRatingsVisible(visible){
  try{ if(!ratingsBox) return; ratingsBox.style.display = visible ? '' : 'none'; }catch(e){}
}

// helper to show/hide bottom settings text (keep header icon always visible)
function setMainSettingsVisible(visible){
  try{ if(!mainSettingsText) return; mainSettingsText.style.display = visible ? '' : 'none'; }catch(e){}
}

let coins = 0;
let level = 1;
let levelProgress = 0;
let levelGoal = 5; // кількість правильних відповідей для проходження рівня
let lives = 3;
let correctCount = 0;
let wrongCount = 0;
let startTime = null; // set when player begins (first problem)
let busy = false; // block input during overlays
let current = {};
let badges = []; // collected badges (ids)
// tutorial flags — показываем подсказки один раз за сессию игры
// tutorials removed — hints disabled globally per user request
// legacy intro levels kept for reference (not used)
const INTRO_LEVELS = { missing: 3, yesno: 5 };

// Persistence: save/load to localStorage
const STORAGE_KEY = 'math_adventure_v1';
function saveState(){
  try{
    const payload = {coins, level, levelProgress, levelGoal, lives, badges};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }catch(e){/* ignore */}
}

// Settings persistence
const SETTINGS_KEY = 'math_adventure_settings_v1';
let settings = {sound:true,volume:0.8,soundSource:'synth'};
function saveSettings(){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }catch(e){} }
function loadSettings(){ try{ const raw = localStorage.getItem(SETTINGS_KEY); if(!raw) return; const obj = JSON.parse(raw); settings = Object.assign(settings,obj); }catch(e){} }
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const obj = JSON.parse(raw);
    if(typeof obj.coins === 'number') coins = obj.coins;
    if(typeof obj.level === 'number') level = obj.level;
    if(typeof obj.levelProgress === 'number') levelProgress = obj.levelProgress;
    if(typeof obj.levelGoal === 'number') levelGoal = obj.levelGoal;
    if(typeof obj.lives === 'number') lives = obj.lives;
    if(Array.isArray(obj.badges)) badges = obj.badges;
  }catch(e){/* ignore parse errors */}
}

function levelUpAnimation(){
  const scene = document.querySelector('.scene');
  const badge = document.getElementById('starBadge');
  if(scene) {
    scene.classList.add('level-up');
    setTimeout(()=>scene.classList.remove('level-up'),750);
  }
  if(badge){
    badge.classList.add('badge-glow');
    setTimeout(()=>badge.classList.remove('badge-glow'),750);
  }
}

// show a full-screen tutorial overlay for a given type ('yesno' or 'missing')
// tutorials removed: stub function (no-op)
function showTutorial(type, cb){ if(cb) cb(); }

// check which tutorials to show for a level, show sequentially, then call proceed()
// tutorials removed: stub that proceeds immediately
function showTutorialsForLevel(lv, proceed){ if(proceed) proceed(); }

// simple WebAudio generator for short effects
function playSound(type){
  try{
    if(!settings.sound) return;
    // if user prefers file sounds, try to play file from assets/sounds/<type>.mp3
    if(settings.soundSource === 'files'){
      const src = `assets/sounds/${type}.mp3`;
      const a = new Audio(src);
      a.volume = settings.volume ?? 0.8;
      a.play().catch(()=>{
        // fallback to synth
        playSynth(type);
      });
      return;
    }
    playSynth(type);
  }catch(e){/* audio disabled */}
}

function playSynth(type){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    g.gain.value = (settings.volume ?? 0.8) * 0.08;
    if(type==='correct'){ o.type='sine'; o.frequency.value=880; }
    else if(type==='wrong'){ o.type='square'; o.frequency.value=220; }
    else if(type==='level'){ o.type='sine'; o.frequency.value=520; }
    else if(type==='gameover'){ o.type='sawtooth'; o.frequency.value=120; }
    else if(type==='bonus'){ o.type='triangle'; o.frequency.value=660; }
    else if(type==='bigbonus'){ o.type='triangle'; o.frequency.value=880; }
    else if(type==='badge'){ o.type='square'; o.frequency.value=1040; }
    else if(type==='reward'){ o.type='sine'; o.frequency.value=720; }
    else { o.type='sine'; o.frequency.value=440; }
    o.start();
    g.gain.setTargetAtTime(0, ctx.currentTime+0.08, 0.05);
    setTimeout(()=>{ try{o.stop(); ctx.close();}catch(e){} },250);
  }catch(e){/* audio disabled */}
}

function randInt(a,b){return Math.floor(Math.random()*(b-a+1))+a}

// Generate a problem adapted to the current level (1st and 2nd grade styles)
function generateProblemForLevel(lv){
  // Progressive introduction of types: set intro levels and mixing delay
  const INTRO = { missing: 3, yesno: 5 };
  const MIX_DELAY = 1; // after this many levels the type may mix with others

  // very early levels: simple add/sub
  if(lv <= 2){
    const type = Math.random() < 0.6 ? 'add' : 'sub';
    let a = randInt(1,9);
    let b = randInt(1,9);
    if(type==='sub' && b> a) [a,b] = [b,a];
    const answer = type==='add' ? a+b : a-b;
    const text = type==='add' ? `${a} + ${b} = ?` : `${a} - ${b} = ?`;
    return {text, answer, type:'number'};
  }

  const max = Math.min(99, 10 + lv*12);

  // If this level is exactly the introduction level for missing addend -> only missing
  if(lv === INTRO.missing){
    const a = randInt(1, Math.max(5, Math.floor(max/3)));
    const sum = randInt(a+1, Math.min(max, a+randInt(2,20)));
    const answer = sum - a;
    return {text: `${a} + ? = ${sum}`, answer, type:'number'};
  }

  // If this level is exactly the introduction level for yes/no -> only yes/no
  if(lv === INTRO.yesno){
    const a = randInt(1, Math.max(5, Math.floor(max/4)));
    const b = randInt(1, Math.max(3, Math.floor(max/5)));
    const op = Math.random() < 0.5 ? '>' : '<';
    const text = `${a} ${op} ${b} ?`;
    const correct = (op === '>') ? (a > b) : (a < b);
    return {text, answer: correct ? 'yes' : 'no', type:'yesno'};
  }

  // Build allowed pool depending on level progress and mix delay
  const pool = [];
  // numeric problems always allowed after intro of base
  pool.push('number');
  if(lv >= INTRO.missing + MIX_DELAY) pool.push('missing');
  if(lv >= INTRO.yesno + MIX_DELAY) pool.push('yesno');

  // if pool only has number, generate numeric problem
  if(pool.length === 1){
    const type = Math.random() < 0.6 ? 'add' : 'sub';
    let a = randInt(Math.max(5, Math.floor(max/4)), max);
    let b = randInt(1, Math.max(2, Math.floor(max/4)));
    if(type==='sub' && b> a) [a,b] = [b,a];
    const answer = type==='add' ? a+b : a-b;
    const text = type==='add' ? `${a} + ${b} = ?` : `${a} - ${b} = ?`;
    return {text, answer, type:'number'};
  }

  // pick a random type from pool (weighted towards number)
  const pick = (()=>{
    const weights = pool.map(t => t==='number' ? 0.6 : 0.2);
    const sum = weights.reduce((s,n)=>s+n,0);
    let r = Math.random() * sum;
    for(let i=0;i<pool.length;i++){
      if(r < weights[i]) return pool[i];
      r -= weights[i];
    }
    return pool[0];
  })();

  if(pick === 'yesno'){
    const a = randInt(1, Math.max(5, Math.floor(max/4)));
    const b = randInt(1, Math.max(3, Math.floor(max/5)));
    const ops = ['>','<','='];
    const op = Math.random() < 0.45 ? '>' : (Math.random() < 0.9 ? '<' : '=');
    const text = `${a} ${op} ${b} ?`;
    let correct = false;
    if(op === '>') correct = a > b;
    else if(op === '<') correct = a < b;
    else correct = a === b;
    return {text, answer: correct ? 'yes' : 'no', type:'yesno'};
  }

  if(pick === 'missing'){
    if(Math.random() < 0.5){
      const a = randInt(1, Math.max(5, Math.floor(max/3)));
      const sum = randInt(a+1, Math.min(max, a+randInt(2,20)));
      const answer = sum - a;
      return {text: `${a} + ? = ${sum}`, answer, type:'number'};
    } else {
      const b = randInt(1, Math.max(5, Math.floor(max/3)));
      const sum = randInt(b+1, Math.min(max, b+randInt(2,20)));
      const answer = sum - b;
      return {text: `? + ${b} = ${sum}`, answer, type:'number'};
    }
  }

  // fallback numeric
  const type2 = Math.random() < 0.6 ? 'add' : 'sub';
  let a2 = randInt(Math.max(5, Math.floor(max/4)), max);
  let b2 = randInt(1, Math.max(2, Math.floor(max/4)));
  if(type2==='sub' && b2> a2) [a2,b2] = [b2,a2];
  const answer2 = type2==='add' ? a2+b2 : a2-b2;
  const text2 = type2==='add' ? `${a2} + ${b2} = ?` : `${a2} - ${b2} = ?`;
  return {text: text2, answer: answer2, type:'number'};
}

function makeProblem(){
  // start timer on first problem
  if(!startTime) startTime = Date.now();
  const p = generateProblemForLevel(level);
  current = {answer: p.answer, optionsType: p.type || 'number'};
  problemEl.textContent = p.text;
  renderOptions(p.answer, current.optionsType);
}


// Random animated reward toast with possible coin bonus or badge
const rewardMessages = [
  'Молодець, Алісо! ✨',
  'Супер робота! 🎉',
  'Ти — чемпіонка! 🏆',
  'Чудово! Більше зірок! ⭐',
  'Така розумниця! 💫',
  'Прекрасно! Ти ростеш! 🌱',
  'Чудова спроба! Тримай бонус! 🎁'
];

function showReward(){
  return new Promise(resolve=>{
    const idx = Math.floor(Math.random()*rewardMessages.length);
    let msg = rewardMessages[idx];
    // random extra coin bonus (0,5,10,15)
    const extras = [0,5,10,15];
    const extra = extras[Math.floor(Math.random()*extras.length)];
    if(extra>0){
      coins += extra;
      msg += ` +${extra} монет`;
      updateUI();
    }
    // small chance to award a badge (visual only for now)
    const giveBadge = Math.random() < 0.25;
    if(giveBadge){ msg += ' ⭐';
      // record badge
      const id = Date.now();
      badges.push(id);
      saveState();
    }

    const el = document.createElement('div');
    el.className = 'reward-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    // badge visual pulse
    if(giveBadge){
      const badgeEl = document.getElementById('starBadge');
      if(badgeEl){ badgeEl.classList.add('badge-glow'); setTimeout(()=>badgeEl.classList.remove('badge-glow'),1200); }
      // play special badge sound
      playSound('badge');
    } else if(extra>=10){
      playSound('bigbonus');
    } else if(extra>0){
      playSound('bonus');
    } else {
      playSound('reward');
    }
    // trigger animation
    requestAnimationFrame(()=> el.classList.add('reward-show'));
    setTimeout(()=> el.classList.remove('reward-show'), 1000);
    setTimeout(()=>{ el.remove(); resolve(); }, 1200);
  });
}

function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}

function renderOptions(correct, type){
  optionsEl.innerHTML='';
  if(type === 'yesno'){
    const yes = document.createElement('button');
    yes.className='btn-option'; yes.textContent='Так'; yes.tabIndex=0;
    yes.addEventListener('click', ()=>checkAnswer('yes', yes));
    yes.addEventListener('pointerdown', ()=>yes.classList.add('pressed'));
    yes.addEventListener('pointerup', ()=>yes.classList.remove('pressed'));
    const no = document.createElement('button');
    no.className='btn-option'; no.textContent='Ні'; no.tabIndex=0;
    no.addEventListener('click', ()=>checkAnswer('no', no));
    no.addEventListener('pointerdown', ()=>no.classList.add('pressed'));
    no.addEventListener('pointerup', ()=>no.classList.remove('pressed'));
    optionsEl.appendChild(yes);
    optionsEl.appendChild(no);
    return;
  }
  // numeric options (default)
  const options = new Set();
  options.add(correct);
  while(options.size<3){
    const delta = randInt(1,12);
    const sign = Math.random()<0.5? -1:1;
    let v = correct + sign*delta;
    if(v<0) v = Math.abs(v)+randInt(0,3);
    options.add(v);
  }
  const arr = shuffle(Array.from(options));
  arr.forEach(v=>{
    const b = document.createElement('button');
    b.className='btn-option';
    b.textContent = v;
    b.tabIndex = 0;
    b.addEventListener('click', ()=>checkAnswer(v,b));
    // pointer events for touch
    b.addEventListener('pointerdown', ()=>b.classList.add('pressed'));
    b.addEventListener('pointerup', ()=>b.classList.remove('pressed'));
    optionsEl.appendChild(b);
  })
}

function showFeedback(text,color){
  feedbackEl.textContent = text;
  feedbackEl.style.color = color;
  setTimeout(()=>{feedbackEl.textContent=''},1200);
}

function animateCorrect(){
  // simple star animation from assets
  const c = document.createElement('img');
  c.src='assets/star.svg';
  c.style.position='absolute';
  c.style.width='64px';
  c.style.left='50%';
  c.style.top='30%';
  c.style.transform='translate(-50%,-50%) scale(0.2)';
  c.style.transition='transform 700ms ease, opacity 700ms ease';
  document.body.appendChild(c);
  requestAnimationFrame(()=>{
    c.style.transform='translate(-50%,-200%) scale(1)';
    c.style.opacity='0';
  });
  setTimeout(()=>c.remove(),800);
}

function animateCoin(btnEl){
  const rectBtn = btnEl.getBoundingClientRect();
  const coin = document.createElement('img');
  coin.src = 'assets/coin.svg';
  coin.style.position = 'fixed';
  coin.style.width = '36px';
  coin.style.left = rectBtn.left + 'px';
  coin.style.top = rectBtn.top + 'px';
  coin.style.transition = 'transform 700ms cubic-bezier(.2,.9,.2,1), opacity 700ms';
  document.body.appendChild(coin);
  const target = document.querySelector('.coin-icon').getBoundingClientRect();
  const dx = target.left - rectBtn.left;
  const dy = target.top - rectBtn.top;
  requestAnimationFrame(()=>{
    coin.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
    coin.style.opacity = '0.2';
  });
  setTimeout(()=>coin.remove(),800);
}

function updateUI(){
  coinsEl.textContent = coins;
  levelEl.textContent = level;
  const pct = Math.min(100, Math.round((levelProgress/levelGoal)*100));
  progressBar.style.width = pct + '%';
  // tiny flash when progress increases
  progressBar.classList.remove('fill-flash');
  void progressBar.offsetWidth;
  progressBar.classList.add('fill-flash');
  saveState();
  // update lives indicator (hearts)
  livesEl.textContent = '❤'.repeat(Math.max(0,lives));
  // render collected badges
  const container = document.getElementById('collectedBadges');
  if(container){
    container.innerHTML = '';
    badges.forEach(id=>{
      const img = document.createElement('img');
      img.src = 'assets/badge.svg';
      img.alt = 'badge';
      container.appendChild(img);
    });
  }
}

// drag mode removed — only tap interactions are supported now

function checkAnswer(value,btnEl){
  if(busy) return;
  if(value === current.answer){
    coins += 5; // нагорода за правильну відповідь
    levelProgress += 1;
    correctCount += 1;
    showFeedback('Правильно! 🎉 +5 монет', '#2a9d8f');
    animateCoin(btnEl);
    animateCorrect();
    playSound('correct');
    // small pulse
    btnEl.animate([{transform:'scale(1)'},{transform:'scale(1.06)'},{transform:'scale(1)'}],{duration:350});
    // level complete?
    if(levelProgress >= levelGoal){
      // level up reward
      coins += 20; // бонус за рівень
      // first show reward (may add extra coins / badge), then confetti, then intro
      busy = true;
      showReward().then(()=>{
        // confetti after reward
        runConfetti();
        // then prepare next level and possibly show tutorials before the intro
        const nextLevel = level + 1;
        // advance level state first
        level = nextLevel;
        levelProgress = 0;
        levelGoal = 5 + (level-1)*2;
        // update UI and persist immediately so header shows new level
        updateUI();
        saveState();
        // add visual badge pulse
        badgeArea.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:600});
        // show tutorials (if needed) then the level intro
        showTutorialsForLevel(level, ()=>{
          overlayLevel.textContent = `Рівень ${level}`;
          levelOverlay.setAttribute('aria-hidden','false');
          playSound('level');
          levelUpAnimation();
          const t = levelOverlay.querySelector('.intro-text');
          if(t) t.classList.add('intro-show');
          setTimeout(()=>{
            if(t) t.classList.remove('intro-show');
            levelOverlay.setAttribute('aria-hidden','true'); busy=false; makeProblem();
          },1400);
        });
      });
    } else {
      setTimeout(makeProblem,800);
    }
    updateUI();
  } else {
    coins = Math.max(0, coins-1);
    wrongCount += 1;
    lives = Math.max(0, lives-1);
    showFeedback('Ні, спробуй ще 🔁 -1 монета', '#e63946');
    playSound('wrong');
    btnEl.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:500});
    updateUI();
    // check game over
    if(lives <= 0){
      playSound('gameover');
      setTimeout(()=>showGameOver(),250);
    }
  }
}

newBtn.addEventListener('click', makeProblem);

// keyboard support: цифри 1..3 вибирають варіант
window.addEventListener('keydown', (e)=>{
  if(e.key>='1' && e.key<='3'){
    const idx = Number(e.key)-1;
    const btn = optionsEl.children[idx];
    if(busy) return;
    if(btn) btn.click();
  }
});

// initial
// load saved state first (to know whether we can continue)
loadState();
updateUI();
// load settings and apply
loadSettings();
// apply settings UI defaults if elements exist
if(settingSound) settingSound.checked = !!settings.sound;
if(settingVolume) settingVolume.value = settings.volume ?? 0.8;
// hints setting removed from UI
// sound source removed from settings UI
// render ratings on load
renderRatingsBox();
// link main settings text
if(mainSettingsText){ mainSettingsText.addEventListener('click', ()=>{ if(settingsModal) settingsModal.setAttribute('aria-hidden','false'); }); }
// start screen buttons
if(startSettingsBtn){ startSettingsBtn.addEventListener('click', ()=>{ if(settingsModal) settingsModal.setAttribute('aria-hidden','false'); }); }
if(startRatingBtn){ startRatingBtn.addEventListener('click', ()=>{ renderProgress(); if(progressModal) progressModal.setAttribute('aria-hidden','false'); }); }
// start flow: show start screen first
const startScreen = document.getElementById('startScreen');
const startNewBtn = document.getElementById('startNewBtn');
// always start new game from start screen (no Continue)

function beginGame(useSaved){
  startScreen.setAttribute('aria-hidden','true');
  // hide ratings while playing
  setRatingsVisible(false);
  // hide bottom settings text during play (header icon remains)
  setMainSettingsVisible(false);
  // mark body as playing to allow CSS to collapse bottom areas
  try{ document.body.classList.add('playing'); }catch(e){}
  // if new game requested, reset state
  if(!useSaved){
    coins = 0; level = 1; levelProgress = 0; levelGoal = 5; lives = 3; correctCount=0; wrongCount=0; saveState(); updateUI();
  }
  // before showing level intro, possibly show tutorials for new task types
  showTutorialsForLevel(level, ()=>{
    // show intro for current level
    overlayLevel.textContent = `Рівень ${level}`;
    levelOverlay.setAttribute('aria-hidden','false');
    // show text with animation class
    const t = levelOverlay.querySelector('.intro-text');
    if(t){ t.classList.add('intro-show'); }
    busy = true;
    playSound('level');
    setTimeout(()=>{ 
      if(t){ t.classList.remove('intro-show'); }
      levelOverlay.setAttribute('aria-hidden','true'); busy=false; startTime = Date.now(); makeProblem(); 
    },1200);
  });
}

// --- Settings modal handlers
if(btnSettings){ btnSettings.addEventListener('click', ()=>{ if(settingsModal) settingsModal.setAttribute('aria-hidden','false'); }); }
if(settingsClose){ settingsClose.addEventListener('click', ()=>{ if(settingsModal) settingsModal.setAttribute('aria-hidden','true'); }); }
if(settingsSave){ settingsSave.addEventListener('click', ()=>{
  settings.sound = !!(settingSound && settingSound.checked);
  settings.volume = parseFloat(settingVolume && settingVolume.value) || 0.8;
  // hints setting removed; nothing to save here
  // sound source fixed to synth
  // input mode is fixed to Tap in design
  saveSettings();
  if(settingsModal) settingsModal.setAttribute('aria-hidden','true');
}); }

// --- Progress modal handlers
// header progress icon removed; use start screen and main ratings box to open progress
if(progressClose) progressClose.addEventListener('click', ()=>{ if(progressModal) progressModal.setAttribute('aria-hidden','true'); });
// also wire the modal 'Закрити' button added inside modal actions
const progressCloseBtn = document.getElementById('progressCloseBtn');
if(progressCloseBtn) progressCloseBtn.addEventListener('click', ()=>{ if(progressModal) progressModal.setAttribute('aria-hidden','true'); });
function renderProgress(){
  // show top 5 best games by coins then level
  const raw = localStorage.getItem('math_adventure_scores');
  const arr = raw ? JSON.parse(raw) : [];
  const top = arr.slice(0,5);
  if(top.length===0){
    progressBody.innerHTML = '<div class="stat">Рейтинг поки що порожній — зіграйте кілька ігор!</div>';
    return;
  }
  let html = '<div style="font-weight:900;margin-bottom:8px">Топ 5 ігор</div>';
  top.forEach((s,i)=>{
    const dt = new Date(s.date||0);
    const dateStr = isNaN(dt.getTime())? '' : dt.toLocaleDateString();
    html += `<div class="row"><div>#${i+1} Рівень ${s.level} — ${s.coins} монет</div><div>${s.time}s ${dateStr}</div></div>`;
  });
  progressBody.innerHTML = html;
}

function loadSavedPayload(){ try{ const raw = localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):{} }catch(e){return{}} }

// Export / Import handlers
// export removed from progress modal
// import removed

// Parent panel
if(parentClose) parentClose.addEventListener('click', ()=>{ if(parentModal) parentModal.setAttribute('aria-hidden','true'); });
if(parentUnlock) parentUnlock.addEventListener('click', ()=>{
  const pin = (parentPin && parentPin.value) || '';
  // simple default PIN: 0000 — in production replace with secure flow
  if(pin === '0000'){
    parentBody.innerHTML = `
      <div class="stat">Рівень: <strong>${level}</strong></div>
      <div class="stat">Монети: <strong>${coins}</strong></div>
      <div class="stat">Загальні значки: <strong>${(badges||[]).length}</strong></div>
      <div style="margin-top:10px"><button id="parentReset" class="btn">Скинути прогрес</button> <button id="parentExport" class="btn">Експорт</button></div>
    `;
    const parentReset = document.getElementById('parentReset');
    const parentExport = document.getElementById('parentExport');
    if(parentReset) parentReset.addEventListener('click', ()=>{ if(confirm('Скинути весь прогрес?')){ localStorage.removeItem(STORAGE_KEY); badges = []; saveState(); alert('Прогрес скинуто.'); } });
    if(parentExport) parentExport.addEventListener('click', ()=>{ const data = {state: loadSavedPayload(), settings: JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}; const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'math_adventure_parent_export.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
  } else { alert('Невірний PIN'); }
});


startNewBtn.addEventListener('click', ()=>beginGame(false));
// Continue button removed; always start new game

// save on unload to be safe
window.addEventListener('beforeunload', ()=>saveState());

// touch-friendly: enlarge hit area on touch
optionsEl.addEventListener('touchstart', (e)=>{
  // prevent ghost click
}, {passive:true});

// simple confetti (visual) when score multiples of 50
let lastConfetti=0;
setInterval(()=>{
  if(coins>0 && coins%50===0 && coins!==lastConfetti){
    lastConfetti = coins;
    runConfetti();
  }
},500);

function runConfetti(){
  for(let i=0;i<18;i++){
    const p = document.createElement('div');
    p.className='confetti-piece';
    p.style.position='fixed';
    p.style.left = (10 + Math.random()*80)+'%';
    p.style.top = '-10%';
    p.style.width = (8+Math.random()*10)+'px';
    p.style.height = (8+Math.random()*10)+'px';
    p.style.background = ['#ffd166','#06d6a0','#118ab2','#ef476f'][Math.floor(Math.random()*4)];
    p.style.opacity='0.95';
    p.style.borderRadius='2px';
    p.style.zIndex=9999;
    p.style.transform = 'rotate('+Math.floor(Math.random()*360)+'deg)';
    document.getElementById('confetti').appendChild(p);
    const dx = (-50 + Math.random()*100);
    p.animate([
      {transform:`translateY(0) translateX(0) rotate(0deg)`,opacity:1},
      {transform:`translateY(120vh) translateX(${dx}px) rotate(360deg)`,opacity:0}
    ],{duration:1600+Math.random()*800,easing:'cubic-bezier(.2,.7,0,1)'});
    setTimeout(()=>p.remove(),2200);
  }
}

function resetGame(){
  coins = 0; level = 1; levelProgress = 0; levelGoal = 5; lives = 3; correctCount = 0; wrongCount = 0; startTime = Date.now(); busy=false; saveState(); updateUI(); makeProblem();
}

function showGameOver(){
  // save score, show the summary modal first; reveal the start screen only when user closes it
  saveScore();
  renderRatingsBox();
  // ensure ratings are visible again when game ends
  setRatingsVisible(true);
  // show bottom settings text again when game ends
  setMainSettingsVisible(true);
  // remove playing marker so layout returns to start view
  try{ document.body.classList.remove('playing'); }catch(e){}
  const startScreen = document.getElementById('startScreen');
  if(startScreen) startScreen.setAttribute('aria-hidden','true');
  gameOverModal.setAttribute('aria-hidden','false');
  busy = false;
  const totalMs = (startTime ? (Date.now()-startTime) : 0);
  const seconds = Math.floor(totalMs/1000);
  const timeStr = seconds < 60 ? `${seconds} с` : `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} хв`;
  // Show each stat on its own line (vertical)
  const displayedLevel = level;
  gameStats.innerHTML = `
    <div>Рівень: <strong>${displayedLevel}</strong></div>
    <div>Час: <strong>${timeStr}</strong></div>
    <div>Правильних відповідей: <strong>${correctCount}</strong></div>
    <div>Набрано монет: <strong>${coins}</strong></div>
  `;
}

// Save score to localStorage (keep sorted top entries)
function saveScore(){
  try{
    const totalMs = (startTime ? (Date.now()-startTime) : 0);
    const seconds = Math.floor(totalMs/1000);
    const entry = {coins, level, correct: correctCount, time: seconds, date: Date.now()};
    const raw = localStorage.getItem('math_adventure_scores');
    const arr = raw ? JSON.parse(raw) : [];
    arr.push(entry);
    arr.sort((a,b)=> (b.coins - a.coins) || (b.level - a.level) || (a.time - b.time));
    localStorage.setItem('math_adventure_scores', JSON.stringify(arr.slice(0,50)));
  }catch(e){/* ignore */}
}

function renderRatingsBox(){
  try{
    if(!ratingsBox) return;
    const raw = localStorage.getItem('math_adventure_scores');
    const arr = raw ? JSON.parse(raw) : [];
    const top = arr.slice(0,5);
    if(top.length===0){ ratingsBox.innerHTML = '<div class="row">Рейтинг поки що порожній — зіграйте!</div>'; return; }
    let html = '<div style="font-weight:900;margin-bottom:6px">Топ 5 ігор</div>';
    top.forEach((s,i)=>{
      html += `<div class="row"><div>#${i+1} Рівень ${s.level} — ${s.coins} монет</div><div>${s.time}s</div></div>`;
    });
    ratingsBox.innerHTML = html;
  }catch(e){/* ignore */}
}

// Close (X) on the summary modal: hide modal and return to start screen
if(modalClose){
  modalClose.addEventListener('click', ()=>{
    gameOverModal.setAttribute('aria-hidden','true');
    const startScreen = document.getElementById('startScreen');
    if(startScreen) startScreen.setAttribute('aria-hidden','false');
    // show rating box on return to start
    setRatingsVisible(true);
    // show bottom settings text on return to start
    setMainSettingsVisible(true);
    // remove playing marker
    try{ document.body.classList.remove('playing'); }catch(e){}
    // tutorials removed — nothing to reset
    busy = false;
  });
}

  // Service Worker registration (try GitHub Pages path then fallback to relative)
  if('serviceWorker' in navigator){
    const tryRegister = async ()=>{
      try{
        const base = location.pathname.startsWith('/Mathematical-Adventure') ? '/Mathematical-Adventure' : '';
        await navigator.serviceWorker.register(base + '/service-worker.js');
        console.log('ServiceWorker registered at', base + '/service-worker.js');
      }catch(e){
        try{ await navigator.serviceWorker.register('./service-worker.js'); console.log('ServiceWorker registered (relative)'); }catch(err){/* ignore */}
      }
    };
    tryRegister();
  }

// 'Закінчити' button in modal: hide modal and show start screen
if(modalFinish){
  modalFinish.addEventListener('click', ()=>{
    gameOverModal.setAttribute('aria-hidden','true');
    const startScreen = document.getElementById('startScreen');
    if(startScreen) startScreen.setAttribute('aria-hidden','false');
    // show rating box on return to start
    setRatingsVisible(true);
    // show bottom settings text on return to start
    setMainSettingsVisible(true);
    // remove playing marker
    try{ document.body.classList.remove('playing'); }catch(e){}
    // tutorials removed — nothing to reset
    busy = false;
  });
}

// Early end button: show game-over stats immediately
if(endBtn){
  endBtn.addEventListener('click', ()=>{
    if(busy) return;
    busy = true;
    playSound('gameover');
    // small delay so sound can start and any animations finish
    setTimeout(()=>{
      showGameOver();
      busy = false;
    }, 220);
  });
}
