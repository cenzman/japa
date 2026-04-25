// 漢字マスター - Main Application
const db = new JapaneseDB();
let fcDeck=[], fcIndex=0, fcCategory='hiragana';
let quizData=[], quizIndex=0, quizScore=0, quizAnswered=false;
let lessonChars=[], lessonStep=0, currentLesson=null;

// INIT
window.addEventListener('DOMContentLoaded', async()=>{
  await db.init();
  createSakura();
  setupNav();
  loadDashboard();
  document.getElementById('db-search').addEventListener('input', renderDbTable);
});

// NAVIGATION
function navigate(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  const nav=document.querySelector(`[data-page="${page}"]`);
  if(nav) nav.classList.add('active');
  if(page==='dashboard') loadDashboard();
  if(page==='flashcards') initFlashcards();
  if(page==='tutorial') loadTutorial();
  if(page==='database') { renderDbTable(); loadCustomVocab(); }
  if(page==='quiz') resetQuiz();
}
function setupNav(){
  document.querySelectorAll('.nav-link').forEach(btn=>{
    btn.addEventListener('click',()=>navigate(btn.dataset.page));
  });
}

// SAKURA
function createSakura(){
  for(let i=0;i<15;i++){
    const p=document.createElement('div');
    p.className='petal';
    p.style.left=Math.random()*100+'%';
    p.style.animationDuration=(8+Math.random()*12)+'s';
    p.style.animationDelay=Math.random()*10+'s';
    p.style.opacity=0.3+Math.random()*0.4;
    p.style.width=p.style.height=(6+Math.random()*10)+'px';
    document.body.appendChild(p);
  }
}

// TOAST
function toast(msg,type='success'){
  const t=document.createElement('div');
  t.className='toast '+type;
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

// DASHBOARD
async function loadDashboard(){
  const stats=await db.getStats();
  const prog=await db.getAllProgress();
  const hCount=prog.filter(p=>p.category==='hiragana'&&p.level>=2).length;
  const kCount=prog.filter(p=>p.category==='katakana'&&p.level>=2).length;
  const jCount=prog.filter(p=>p.category==='kanji'&&p.level>=2).length;
  document.getElementById('dashboard-stats').innerHTML=`
    <div class="card stat-card"><div class="stat-icon">🔥</div><div class="stat-value" style="color:var(--orange)">${stats.streak||0}</div><div class="stat-label">Denní streak</div></div>
    <div class="card stat-card"><div class="stat-icon">📝</div><div class="stat-value" style="color:var(--blue)">${stats.totalReviews||0}</div><div class="stat-label">Celkem opakování</div></div>
    <div class="card stat-card"><div class="stat-icon">🎯</div><div class="stat-value" style="color:var(--green)">${stats.totalReviews?Math.round(stats.totalCorrect/stats.totalReviews*100):0}%</div><div class="stat-label">Úspěšnost</div></div>
    <div class="card stat-card"><div class="stat-icon">🏆</div><div class="stat-value" style="color:var(--gold)">${stats.quizBestScore||0}%</div><div class="stat-label">Nejlepší kvíz</div></div>`;
  document.getElementById('dashboard-progress').innerHTML=`
    <div class="card"><h3>あ Hiragana</h3><div class="progress-bar"><div class="progress-fill pink" style="width:${hCount/46*100}%"></div></div><div class="progress-label"><span>${hCount}/46 znaků</span><span>${Math.round(hCount/46*100)}%</span></div></div>
    <div class="card"><h3>ア Katakana</h3><div class="progress-bar"><div class="progress-fill blue" style="width:${kCount/46*100}%"></div></div><div class="progress-label"><span>${kCount}/46 znaků</span><span>${Math.round(kCount/46*100)}%</span></div></div>
    <div class="card"><h3>漢 Kanji</h3><div class="progress-bar"><div class="progress-fill green" style="width:${jCount/KANJI.length*100}%"></div></div><div class="progress-label"><span>${jCount}/${KANJI.length} znaků</span><span>${Math.round(jCount/KANJI.length*100)}%</span></div></div>`;
}

// FLASHCARDS
function initFlashcards(){
  const f=document.getElementById('flashcard-filters');
  f.innerHTML=['hiragana','katakana','kanji'].map(c=>
    `<button class="btn btn-sm ${c===fcCategory?'btn-primary':'btn-secondary'}" onclick="setFcCategory('${c}')">${c==='hiragana'?'あ Hiragana':c==='katakana'?'ア Katakana':'漢 Kanji'}</button>`
  ).join('');
  loadFcDeck();
}
function setFcCategory(c){ fcCategory=c; initFlashcards(); }
function loadFcDeck(){
  if(fcCategory==='hiragana') fcDeck=[...HIRAGANA];
  else if(fcCategory==='katakana') fcDeck=[...KATAKANA];
  else fcDeck=[...KANJI];
  fcIndex=0;
  renderFlashcard();
}
function renderFlashcard(){
  if(!fcDeck.length) return;
  const c=fcDeck[fcIndex];
  document.getElementById('fc-char').textContent=c.char;
  document.getElementById('fc-romaji').textContent=c.romaji;
  document.getElementById('fc-meaning').textContent=c.meaning||'';
  document.getElementById('fc-counter').textContent=`${fcIndex+1} / ${fcDeck.length}`;
  document.getElementById('flashcard-inner').classList.remove('flipped');
}
function flashcardFlip(){ document.getElementById('flashcard-inner').classList.toggle('flipped'); }
function flashcardNext(){ fcIndex=(fcIndex+1)%fcDeck.length; renderFlashcard(); }
function flashcardPrev(){ fcIndex=(fcIndex-1+fcDeck.length)%fcDeck.length; renderFlashcard(); }
function flashcardShuffle(){ fcDeck.sort(()=>Math.random()-.5); fcIndex=0; renderFlashcard(); toast('Karty zamíchány! 🔀'); }
async function flashcardMark(correct){
  const c=fcDeck[fcIndex];
  const cat=fcCategory;
  const id=cat+'_'+c.char;
  await db.updateCharacterProgress(id, cat, correct);
  await db.updateStats(correct);
  toast(correct?'Správně! ✓':'Označeno k opakování','success');
  flashcardNext();
}

// QUIZ
function resetQuiz(){
  document.getElementById('quiz-setup').style.display='block';
  document.getElementById('quiz-active').style.display='none';
  document.getElementById('quiz-results').style.display='none';
}
function getQuizPool(cat){
  let pool=[];
  if(cat==='hiragana'||cat==='all') pool.push(...HIRAGANA.map(c=>({...c,category:'hiragana'})));
  if(cat==='katakana'||cat==='all') pool.push(...KATAKANA.map(c=>({...c,category:'katakana'})));
  if(cat==='kanji'||cat==='all') pool.push(...KANJI.map(c=>({...c,category:'kanji'})));
  return pool;
}
function startQuiz(){
  const cat=document.getElementById('quiz-category').value;
  const count=parseInt(document.getElementById('quiz-count').value);
  const pool=getQuizPool(cat);
  pool.sort(()=>Math.random()-.5);
  quizData=count?pool.slice(0,count):pool;
  quizIndex=0; quizScore=0; quizAnswered=false;
  document.getElementById('quiz-setup').style.display='none';
  document.getElementById('quiz-active').style.display='block';
  renderQuizQuestion();
}
function renderQuizQuestion(){
  if(quizIndex>=quizData.length){ showQuizResults(); return; }
  quizAnswered=false;
  document.getElementById('quiz-next-btn').style.display='none';
  const q=quizData[quizIndex];
  const type=document.getElementById('quiz-type').value;
  const pct=(quizIndex/quizData.length)*100;
  document.getElementById('quiz-progress-fill').style.width=pct+'%';
  document.getElementById('quiz-score-bar').innerHTML=`
    <div class="quiz-score-item"><div class="quiz-score-value" style="color:var(--green)">${quizScore}</div><div style="color:var(--text2);font-size:.8rem">Správně</div></div>
    <div class="quiz-score-item"><div class="quiz-score-value" style="color:var(--text2)">${quizIndex-quizScore}</div><div style="color:var(--text2);font-size:.8rem">Špatně</div></div>
    <div class="quiz-score-item"><div class="quiz-score-value" style="color:var(--blue)">${quizIndex+1}/${quizData.length}</div><div style="color:var(--text2);font-size:.8rem">Otázka</div></div>`;
  if(type==='write'){
    document.getElementById('quiz-question').innerHTML=`<div class="quiz-char">${q.char}</div><div class="quiz-prompt">Napište romaji pro tento znak:</div>`;
    document.getElementById('quiz-answer-area').innerHTML=`<div style="display:flex;gap:12px;justify-content:center"><input type="text" class="quiz-input" id="quiz-write-input" placeholder="Romaji..." autocomplete="off"><button class="btn btn-primary" onclick="checkWriteAnswer()">✓</button></div>`;
    setTimeout(()=>document.getElementById('quiz-write-input').focus(),100);
    document.getElementById('quiz-write-input').addEventListener('keydown',e=>{if(e.key==='Enter')checkWriteAnswer()});
  } else if(type==='reverse'){
    document.getElementById('quiz-question').innerHTML=`<div class="quiz-char" style="font-size:2.5rem;font-family:Inter,sans-serif">${q.romaji}</div><div class="quiz-prompt">${q.meaning?'('+q.meaning+') ':''}Vyberte správný znak:</div>`;
    renderChoiceOptions(q, true);
  } else {
    document.getElementById('quiz-question').innerHTML=`<div class="quiz-char">${q.char}</div><div class="quiz-prompt">Jaká je výslovnost tohoto znaku?</div>`;
    renderChoiceOptions(q, false);
  }
}
function renderChoiceOptions(q, showChars){
  const pool=getQuizPool(q.category==='kanji'?'kanji':q.category);
  let opts=[q];
  while(opts.length<4){
    const r=pool[Math.floor(Math.random()*pool.length)];
    if(!opts.find(o=>o.char===r.char)) opts.push(r);
  }
  opts.sort(()=>Math.random()-.5);
  document.getElementById('quiz-answer-area').innerHTML=`<div class="quiz-options">${opts.map((o,i)=>
    `<button class="quiz-option" id="qopt-${i}" onclick="checkAnswer(${i},'${o.char}','${q.char}')" data-char="${o.char}">${showChars?'<span style=\"font-family:Noto Sans JP;font-size:2rem\">'+o.char+'</span>':o.romaji+(o.meaning?' ('+o.meaning+')':'')}</button>`
  ).join('')}</div>`;
}
function checkAnswer(idx, selected, correct){
  if(quizAnswered) return;
  quizAnswered=true;
  const isCorrect=selected===correct;
  if(isCorrect) quizScore++;
  document.querySelectorAll('.quiz-option').forEach(btn=>{
    btn.classList.add('disabled');
    if(btn.dataset.char===correct) btn.classList.add('correct');
    if(btn.dataset.char===selected&&!isCorrect) btn.classList.add('wrong');
  });
  const q=quizData[quizIndex];
  db.updateCharacterProgress(q.category+'_'+q.char, q.category, isCorrect);
  db.updateStats(isCorrect);
  document.getElementById('quiz-next-btn').style.display='inline-flex';
}
function checkWriteAnswer(){
  if(quizAnswered) return;
  quizAnswered=true;
  const input=document.getElementById('quiz-write-input');
  const q=quizData[quizIndex];
  const ans=input.value.trim().toLowerCase();
  const correct=q.romaji.toLowerCase().split('/');
  const isCorrect=correct.some(c=>c.trim()===ans);
  if(isCorrect){ quizScore++; input.style.borderColor='var(--green)'; }
  else{ input.style.borderColor='var(--red)'; }
  input.disabled=true;
  const fb=document.createElement('div');
  fb.style.cssText='margin-top:12px;text-align:center;font-size:1.1rem';
  fb.innerHTML=isCorrect?`<span style="color:var(--green)">✓ Správně!</span>`:`<span style="color:var(--red)">✕ Správná odpověď: <strong>${q.romaji}</strong></span>`;
  document.getElementById('quiz-answer-area').appendChild(fb);
  db.updateCharacterProgress(q.category+'_'+q.char, q.category, isCorrect);
  db.updateStats(isCorrect);
  document.getElementById('quiz-next-btn').style.display='inline-flex';
}
function quizNext(){ quizIndex++; renderQuizQuestion(); }
async function showQuizResults(){
  document.getElementById('quiz-active').style.display='none';
  document.getElementById('quiz-results').style.display='block';
  const pct=Math.round(quizScore/quizData.length*100);
  await db.updateQuizStats(quizScore, quizData.length);
  let emoji='😅', msg='Zkuste to znovu!';
  if(pct>=90){ emoji='🌟'; msg='Vynikající!'; }
  else if(pct>=70){ emoji='😊'; msg='Skvělá práce!'; }
  else if(pct>=50){ emoji='👍'; msg='Dobrý základ!'; }
  document.getElementById('quiz-results-content').innerHTML=`
    <div style="font-size:4rem;margin:16px 0">${emoji}</div>
    <div style="font-size:2.5rem;font-weight:700;color:var(--pink)">${pct}%</div>
    <div style="color:var(--text2);margin:8px 0">${msg}</div>
    <div style="color:var(--text2)">${quizScore} z ${quizData.length} správně</div>`;
}

// TUTORIAL
async function loadTutorial(){
  const allLP=await db.getAllLessonProgress();
  const lpMap={};
  allLP.forEach(l=>lpMap[l.lessonId]=l);
  document.getElementById('tutorial-list').style.display='';
  document.getElementById('tutorial-lesson').style.display='none';
  document.getElementById('tutorial-list').innerHTML=TUTORIAL_LESSONS.map((l,i)=>{
    const lp=lpMap[l.id];
    const completed=lp&&lp.completed;
    const prev=i===0?true:lpMap[TUTORIAL_LESSONS[i-1].id]?.completed;
    const locked=!prev&&!completed;
    return `<div class="card lesson-card ${completed?'completed':''} ${locked?'locked':''}" onclick="${locked?'':'openLesson(\''+l.id+'\')'}">
      <div class="lesson-num">${completed?'✓':i+1}</div>
      <div class="lesson-info"><h3>${l.title}</h3><p>${l.desc}</p></div>
      ${completed?'<span class="badge badge-green">Hotovo</span>':locked?'<span class="badge badge-gold">🔒</span>':'<span class="badge badge-pink">Začít</span>'}
    </div>`;
  }).join('');
}
function openLesson(id){
  currentLesson=TUTORIAL_LESSONS.find(l=>l.id===id);
  if(!currentLesson) return;
  const src=currentLesson.type==='hiragana'?HIRAGANA:currentLesson.type==='katakana'?KATAKANA:KANJI;
  lessonChars=src.filter(c=>c.group===currentLesson.group);
  lessonStep=0;
  document.getElementById('tutorial-list').style.display='none';
  document.getElementById('tutorial-lesson').style.display='block';
  document.getElementById('lesson-title').textContent=currentLesson.title;
  document.getElementById('lesson-quiz-area').style.display='none';
  renderLessonStep();
}
function renderLessonStep(){
  if(lessonStep>=lessonChars.length){ showLessonQuiz(); return; }
  const c=lessonChars[lessonStep];
  document.getElementById('lesson-display').innerHTML=`
    <div class="char">${c.char}</div>
    <div class="romaji">${c.romaji}</div>
    <div class="meaning">${c.meaning||''}</div>`;
  document.getElementById('lesson-dots').innerHTML=lessonChars.map((_,i)=>
    `<div class="lesson-dot ${i===lessonStep?'active':i<lessonStep?'done':''}"></div>`
  ).join('');
  document.getElementById('lesson-prev').disabled=lessonStep===0;
  document.getElementById('lesson-next').textContent=lessonStep===lessonChars.length-1?'Mini kvíz 🎯':'Další ▶';
}
function lessonNext(){ lessonStep++; renderLessonStep(); }
function lessonPrev(){ if(lessonStep>0){lessonStep--; renderLessonStep();} }
function closeLessonView(){ loadTutorial(); }
function showLessonQuiz(){
  document.getElementById('lesson-display').innerHTML='<div style="font-size:1.2rem;color:var(--text2)">Skvěle! Nyní ověřte své znalosti v mini kvízu.</div>';
  document.getElementById('lesson-dots').innerHTML='';
  document.getElementById('lesson-quiz-area').style.display='block';
  let lqIdx=0, lqScore=0;
  const chars=[...lessonChars].sort(()=>Math.random()-.5);
  function renderLQ(){
    if(lqIdx>=chars.length){
      db.saveLessonProgress(currentLesson.id, true, lqScore);
      document.getElementById('lesson-quiz-content').innerHTML=`
        <div style="text-align:center;padding:20px">
          <div style="font-size:3rem">${lqScore>=chars.length*0.7?'🎉':'💪'}</div>
          <div style="font-size:1.3rem;font-weight:600;margin:8px 0">${lqScore}/${chars.length} správně</div>
          <button class="btn btn-primary" onclick="loadTutorial()">← Zpět na lekce</button>
        </div>`;
      return;
    }
    const q=chars[lqIdx];
    const pool=lessonChars.filter(c=>c.char!==q.char);
    let opts=[q];
    while(opts.length<Math.min(4,lessonChars.length)){
      const r=pool[Math.floor(Math.random()*pool.length)];
      if(!opts.find(o=>o.char===r.char)) opts.push(r);
    }
    opts.sort(()=>Math.random()-.5);
    document.getElementById('lesson-quiz-content').innerHTML=`
      <div style="text-align:center;margin:16px 0"><span style="font-size:4rem;font-family:'Noto Sans JP'">${q.char}</span></div>
      <div class="quiz-options">${opts.map(o=>
        `<button class="quiz-option lq-opt" data-r="${o.romaji}" onclick="this.parentElement.querySelectorAll('.lq-opt').forEach(b=>{b.classList.add('disabled');if(b.dataset.r==='${q.romaji}')b.classList.add('correct');});if('${o.romaji}'==='${q.romaji}'){this.classList.add('correct')}else{this.classList.add('wrong')};window._lqNext('${o.romaji}'==='${q.romaji}')">${o.romaji}${o.meaning?' ('+o.meaning+')':''}</button>`
      ).join('')}</div>`;
  }
  window._lqNext=function(correct){
    if(correct) lqScore++;
    const c=chars[lqIdx];
    db.updateCharacterProgress(currentLesson.type+'_'+c.char, currentLesson.type, correct);
    lqIdx++;
    setTimeout(renderLQ,800);
  };
  renderLQ();
}

// DATABASE
function renderDbTable(){
  const filter=document.getElementById('db-filter').value;
  const search=(document.getElementById('db-search').value||'').toLowerCase();
  let items=[];
  if(filter==='all'||filter==='hiragana') items.push(...HIRAGANA.map(c=>({...c,category:'hiragana'})));
  if(filter==='all'||filter==='katakana') items.push(...KATAKANA.map(c=>({...c,category:'katakana'})));
  if(filter==='all'||filter==='kanji') items.push(...KANJI.map(c=>({...c,category:'kanji'})));
  if(search) items=items.filter(c=>c.char.includes(search)||c.romaji.includes(search)||(c.meaning||'').toLowerCase().includes(search));
  const catBadge=c=>c==='hiragana'?'badge-pink':c==='katakana'?'badge-blue':'badge-green';
  document.getElementById('db-table').innerHTML=`
    <thead><tr><th>Znak</th><th>Romaji</th><th>Význam</th><th>Kategorie</th><th>Skupina</th></tr></thead>
    <tbody>${items.map(c=>`<tr><td class="vocab-char">${c.char}</td><td>${c.romaji}</td><td>${c.meaning||'—'}</td><td><span class="badge ${catBadge(c.category)}">${c.category}</span></td><td>${GROUP_NAMES[c.group]||c.group}</td></tr>`).join('')}</tbody>`;
}
async function loadCustomVocab(){
  const vocab=await db.getAllCustomVocab();
  document.getElementById('custom-table').innerHTML=`
    <thead><tr><th>Znak</th><th>Romaji</th><th>Význam</th><th>Kategorie</th><th></th></tr></thead>
    <tbody>${vocab.length?vocab.map(v=>`<tr><td class="vocab-char">${v.char}</td><td>${v.romaji}</td><td>${v.meaning||''}</td><td>${v.category||''}</td><td><button class="btn btn-danger btn-sm" onclick="deleteVocab(${v.id})">🗑️</button></td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:32px">Zatím žádná vlastní slovíčka. Přidejte první!</td></tr>'}</tbody>`;
}
function showAddVocabModal(){
  document.getElementById('modal-container').innerHTML=`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <h2>➕ Nové slovíčko</h2>
        <div class="modal-field"><label>Znak *</label><input id="mv-char" placeholder="例: 食べる"></div>
        <div class="modal-field"><label>Romaji *</label><input id="mv-romaji" placeholder="例: taberu"></div>
        <div class="modal-field"><label>Význam</label><input id="mv-meaning" placeholder="例: jíst"></div>
        <div class="modal-field"><label>Kategorie</label><input id="mv-cat" placeholder="例: slovesa"></div>
        <div class="btn-group"><button class="btn btn-primary" onclick="saveVocab()">💾 Uložit</button><button class="btn btn-secondary" onclick="closeModal()">Zrušit</button></div>
      </div>
    </div>`;
}
function closeModal(){ document.getElementById('modal-container').innerHTML=''; }
async function saveVocab(){
  const char=document.getElementById('mv-char').value.trim();
  const romaji=document.getElementById('mv-romaji').value.trim();
  if(!char||!romaji){ toast('Vyplňte znak a romaji!','error'); return; }
  await db.addCustomVocab({ char, romaji, meaning:document.getElementById('mv-meaning').value.trim(), category:document.getElementById('mv-cat').value.trim() });
  closeModal(); loadCustomVocab(); toast('Slovíčko přidáno! ✓');
}
async function deleteVocab(id){ await db.deleteCustomVocab(id); loadCustomVocab(); toast('Smazáno'); }
function switchDbTab(tab){
  ['browse','custom','settings'].forEach(t=>{
    document.getElementById('db-'+t).style.display=t===tab?'':'none';
  });
  document.querySelectorAll('#db-tabs .tab').forEach((b,i)=>{
    b.classList.toggle('active',['browse','custom','settings'][i]===tab);
  });
  if(tab==='custom') loadCustomVocab();
}
async function exportData(){
  const json=await db.exportData();
  const blob=new Blob([json],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='kanji-master-backup.json';
  a.click(); toast('Data exportována! 💾');
}
async function importData(e){
  const file=e.target.files[0]; if(!file) return;
  const text=await file.text();
  try{ await db.importData(text); toast('Data importována! ✓'); loadDashboard(); }
  catch(err){ toast('Chyba importu!','error'); }
}
async function clearData(){
  if(!confirm('Opravdu smazat veškerá data? Tuto akci nelze vrátit!')) return;
  await db.clearAllData(); toast('Data smazána'); loadDashboard();
}

// KEYBOARD
document.addEventListener('keydown',e=>{
  const active=document.querySelector('.page.active')?.id;
  if(active==='page-flashcards'){
    if(e.key==='ArrowRight') flashcardNext();
    if(e.key==='ArrowLeft') flashcardPrev();
    if(e.key===' '||e.key==='Enter'){ e.preventDefault(); flashcardFlip(); }
  }
});
