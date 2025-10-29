
const VOICE_ENABLED_DEFAULT = false;
const SOUND_ENABLED_DEFAULT = true;

// clack sound
const clack = new Audio("https://upload.wikimedia.org/wikipedia/commons/0/0e/Domino_tile_hit.ogg");
clack.volume = 0.45;

const personalities = {
  viejo: {
    delay: 900,
    lines: {
      play: [
        "toma, pa que aprendas.",
        "así se juega guevon",
        "otra más pa la colección.",
      ],
      draw: [
        "me cago en la puta madre.",
        "ni una ficha buena, coño.",
      "marico"
      ],
      start: [
        "échale cojones.",
        "a ver si hoy ganas, jeje.",
        "vamos a calentar la mesa.",
]
    }
  },
  node: {
    delay: 700,
    lines: {
      play: [
        "movimiento óptimo.",
        "lógica impecable.",
        "análisis completado.",
        "cpu jugando con precisión."
      ],
      draw: [
        "sin jugadas válidas, procesando...",
        "ficha no encontrada.",
        "probabilidad baja, pasando."
      ],
      start: [
        "iniciando ronda.",
        "mesa lista, sistemas en línea.",
        "preparando simulación."
      ]
    }
  },
  guevon: {
    delay: 500,
    lines: {
      play: [
        "shiii",
        "what u thought this was",
        "ole uglass lil boah",
        "stank ah jit",
        "hol up"
      ],
      draw: [
        "this shit rigged",
        "chill",
        "nah ik yall cheating.",
        "smh"
      ],
      start: [
        "oh aight",
        "this finna be my game",
        "lol",
        "mr.deez looking for you"
      ]
    }
  }
};

const pick = a => a[Math.floor(Math.random()*a.length)] || "";

// ---------- state ----------
const state = {
  stock: [],
  hand: [],
  cpuRight: [],
  cpuTop: [],
  cpuLeft: [],
  chain: [],          // [{a,b,id,x,y,rot} ...]
  turn: "player",
  round: 1,
  voices: VOICE_ENABLED_DEFAULT,
  sound: SOUND_ENABLED_DEFAULT,
  zoom: 1.0,          // manual zoom
  geom: {
    spacing: 88,      // px between tiles; recalculated on resize & chain size
    centerX: 0,
    centerY: 0,
    leftIndex: -1,
    rightIndex: 1
  },
  tapSelectId: null
};

// ---------- DOM ----------
const $ = s => document.querySelector(s);
const chainArea = $("#chain-area");
const chainScale = $("#chain-scale");
const handEl = $("#hand");
const leftDrop = $("#left-drop");
const rightDrop = $("#right-drop");

const roundNum = $("#round-num");
const turnLabel = $("#turn-label");
const handCount = $("#hand-count");
const cntTop = $("#cnt-top");
const cntLeft = $("#cnt-left");
const cntRight = $("#cnt-right");

const btnPass = $("#btn-pass");
const btnReset = $("#btn-reset");
const btnVoices = $("#btn-toggle-voices");
const voicesState = $("#voices-state");
const btnSound = $("#btn-toggle-sound");
const soundState = $("#sound-state");

const zoomInBtn = $("#zoom-in");
const zoomOutBtn = $("#zoom-out");
const zoomLabel = $("#zoom-label");

const bubbleTop = $("#bubble-top");
const bubbleLeft = $("#bubble-left");
const bubbleRight = $("#bubble-right");
const bubblePlayer = $("#bubble-player");

// ---------- layout ----------
function layoutCenter(){
  const rect = chainArea.getBoundingClientRect();
  state.geom.centerX = rect.width / 2;
  state.geom.centerY = rect.height / 2;
  // base spacing target
  let spacing = Math.max(56, Math.min(92, Math.floor(rect.width / 12)));
  // shrink spacing as chain grows
  const shrink = Math.max(0, state.chain.length - 12);
  if (shrink > 0) spacing = Math.max(40, spacing - Math.min(28, Math.floor(shrink*1.2)));
  state.geom.spacing = spacing;
  // apply manual zoom
  chainScale.style.transform = `scale(${state.zoom})`;
  if (zoomLabel) zoomLabel.textContent = `${Math.round(state.zoom*100)}%`;
}

// ---------- set / utils ----------
function createSet(){
  const out = []; let id=0;
  for(let a=0;a<=6;a++){ for(let b=a;b<=6;b++){ out.push({a,b,id:id++}); } }
  return out;
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function dealTo(arr, n=7){ for(let i=0;i<n && state.stock.length;i++){ arr.push(state.stock.pop()); } }

function updateHUD(){
  roundNum.textContent = state.round;
  turnLabel.textContent = state.turn;
  handCount.textContent = state.hand.length;
  cntTop.textContent = state.cpuTop.length;
  cntLeft.textContent = state.cpuLeft.length;
  cntRight.textContent = state.cpuRight.length;
  voicesState.textContent = state.voices ? "on" : "off";
  if (soundState) soundState.textContent = state.sound ? "on" : "off";
}

// ---------- rendering ----------
function makeBoneEl(b, draggable){
  const el = document.createElement("div");
  el.className = "bone";
  el.dataset.id = b.id;
  el.innerHTML = `<div class="text">[${b.a}|${b.b}]</div>`;
  if (draggable){
    el.setAttribute("draggable","true");
    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("dragend", onDragEnd);
    el.addEventListener("click", onClickSelectOrPlay);
    el.addEventListener("touchstart", () => onClickSelectOrPlay({currentTarget:el}), {passive:true});
  }
  return el;
}

function renderHand(){
  handEl.innerHTML = "";
  state.hand.forEach(b=>{
    const el = makeBoneEl(b, state.turn==="player");
    if (state.tapSelectId === String(b.id)) el.classList.add("selected");
    handEl.appendChild(el);
  });
}

function renderChain(){
  layoutCenter();
  chainScale.innerHTML = "";
  state.chain.forEach(item=>{
    const el = makeBoneEl(item,false);
    el.classList.add("abs");
    el.style.transform = `translate(${Math.round(item.x)}px,${Math.round(item.y)}px) rotate(${item.rot||0}deg)`;
    chainScale.appendChild(el);
  });
}

// ---------- rules ----------
const flip = b => ({a:b.b,b:b.a,id:b.id});
const leftEndVal  = () => state.chain.length ? state.chain[0].a : null;
const rightEndVal = () => state.chain.length ? state.chain[state.chain.length-1].b : null;

function canPlayOnEnd(bone, end){
  if (state.chain.length === 0) return true;
  const L = leftEndVal(), R = rightEndVal();
  if (end === "left")  return (bone.a===L || bone.b===L);
  if (end === "right") return (bone.a===R || bone.b===R);
  return false;
}

// center first, then step left/right with spacing; tiny y wiggle
function placeCoordsFor(end, bone){
  const { spacing } = state.geom;
  // NOTE: we position relative to (0,0) and rely on chainScale's center via CSS transform-origin center
  if (state.chain.length === 0){
    return { x: -spacing/2, y: 0, rot: 0 };
  }
  if (end === "right"){
    const ix = state.geom.rightIndex++;
    const y = ((ix % 4) - 1.5) * 6;
    return { x: ix*spacing - spacing/2, y, rot: 0 };
  } else {
    const ix = state.geom.leftIndex--;
    const y = ((ix % 4) + 1.5) * 6;
    return { x: ix*spacing - spacing/2, y, rot: 0 };
  }
}

function playBoneToEnd(bone, end){
  if (state.chain.length === 0){
    const pos = placeCoordsFor(end, bone);
    state.chain.push({ ...bone, ...pos });
    return true;
  }
  const need = (end==="left") ? leftEndVal() : rightEndVal();
  let piece = null;
  if (end==="left"){
    if (bone.b===need) piece = bone;
    else if (bone.a===need) piece = flip(bone);
    if (piece){
      const pos = placeCoordsFor("left", piece);
      state.chain.unshift({ ...piece, ...pos });
      return true;
    }
  } else {
    if (bone.a===need) piece = bone;
    else if (bone.b===need) piece = flip(bone);
    if (piece){
      const pos = placeCoordsFor("right", piece);
      state.chain.push({ ...piece, ...pos });
      return true;
    }
  }
  return false;
}

// ---------- helpers ----------
const findInHand = id => state.hand.find(b=>b.id===Number(id));
function removeFromHand(id){
  const i = state.hand.findIndex(b=>b.id===Number(id));
  return i>=0 ? state.hand.splice(i,1)[0] : null;
}

// ---------- DnD / tap ----------
function onDragStart(e){
  if (state.turn !== "player"){ e.preventDefault(); return; }
  const id = e.currentTarget.dataset.id;
  e.dataTransfer.setData("text/plain", id);
  e.currentTarget.classList.add("dragging");
}
function onDragEnd(e){ e.currentTarget.classList.remove("dragging"); }

[leftDrop,rightDrop].forEach(zone=>{
  zone.addEventListener("dragover", e=>{ e.preventDefault(); });
  zone.addEventListener("drop", e=>{
    e.preventDefault();
    if (state.turn !== "player") return;
    const id = e.dataTransfer.getData("text/plain");
    const bone = findInHand(id);
    const end = zone.dataset.end;
    if (bone && canPlayOnEnd(bone,end)){
      const rem = removeFromHand(id);
      if (playBoneToEnd(rem,end)){
        if (state.sound){ clack.currentTime = 0; clack.play(); }
        say("player","play");
        renderChain(); renderHand(); updateHUD();
        if (checkWin()) return;
        nextTurn();
      }
    }
  });
});

function onClickSelectOrPlay(e){
  if (state.turn !== "player") return;
  const id = e.currentTarget.dataset.id;
  const bone = findInHand(id);
  if (!bone) return;

  if (state.tapSelectId === id){
    let end = null;
    if (canPlayOnEnd(bone, "right")) end = "right";
    else if (canPlayOnEnd(bone, "left")) end = "left";
    if (end){
      const rem = removeFromHand(id);
      if (playBoneToEnd(rem,end)){
        if (state.sound){ clack.currentTime = 0; clack.play(); }
        say("player","play");
        state.tapSelectId = null;
        renderChain(); renderHand(); updateHUD();
        if (checkWin()) return;
        nextTurn();
      }
    }
  } else {
    state.tapSelectId = id;
    renderHand();
  }
}

// ---------- cpu ----------
function nextTurn(){
  const order = ["player","cpuRight","cpuTop","cpuLeft"];
  const idx = order.indexOf(state.turn);
  state.turn = order[(idx+1) % order.length];
  updateHUD(); renderHand();
  if (state.turn.startsWith("cpu")){
    setTimeout(() => cpuPlay(state.turn), 850);
  }
}

function say(who, kind){
  if (!state.voices) return;
  let bubble, persona;
  if (who==="player"){ bubble=bubblePlayer; persona=personalities.guevon; }
  else if (who==="cpuTop"){ bubble=bubbleTop; persona=personalities.node; }
  else if (who==="cpuLeft"){ bubble=bubbleLeft; persona=personalities.viejo; }
  else if (who==="cpuRight"){ bubble=bubbleRight; persona=personalities.viejo; }
  if (!bubble || !persona) return;
  bubble.textContent = pick(persona.lines[kind] || []);
  bubble.classList.add("show");
  setTimeout(()=> bubble.classList.remove("show"), 1400);
}

function cpuPlay(tag){
  const hand = tag==="cpuTop" ? state.cpuTop : tag==="cpuLeft" ? state.cpuLeft : state.cpuRight;
  let move = null;
  for (const b of hand){ if (canPlayOnEnd(b,"right")){ move={b,end:"right"}; break; } }
  if (!move) for (const b of hand){ if (canPlayOnEnd(b,"left")) { move={b,end:"left"};  break; } }

  if (move){
    const i = hand.findIndex(x=>x.id===move.b.id);
    const played = hand.splice(i,1)[0];
    playBoneToEnd(played, move.end);
    if (state.sound){ clack.currentTime = 0; clack.play(); }
    say(tag,"play");
    renderChain();
  } else {
    say(tag,"draw"); // pass
  }
  updateHUD();
  if (checkWin()) return;
  nextTurn();
}

// ---------- round / win ----------
function checkWin(){
  if (state.hand.length===0){ alert("player wins!"); state.round++; resetGame(); return true; }
  if (state.cpuRight.length===0){ alert("cpuRight wins!"); state.round++; resetGame(); return true; }
  if (state.cpuTop.length===0){ alert("cpuTop wins!"); state.round++; resetGame(); return true; }
  if (state.cpuLeft.length===0){ alert("cpuLeft wins!"); state.round++; resetGame(); return true; }
  return false;
}

function resetGame(){
  state.stock = shuffle(createSet());
  state.hand = []; state.cpuRight = []; state.cpuTop = []; state.cpuLeft = [];
  state.chain = [];
  state.geom.leftIndex = -1; state.geom.rightIndex = 1;

  layoutCenter();
  dealTo(state.hand,7);
  dealTo(state.cpuRight,7);
  dealTo(state.cpuTop,7);
  dealTo(state.cpuLeft,7);

  state.turn = "player";
  state.tapSelectId = null;

  renderHand(); renderChain(); updateHUD();

  say("player","start"); say("cpuTop","start"); say("cpuLeft","start"); say("cpuRight","start");
}

// ---------- controls ----------
window.addEventListener("resize", ()=>{ renderChain(); });
btnPass.addEventListener("click", ()=>{
  if (state.turn !== "player") return;
  say("player","draw"); // pass line
  nextTurn();
});
btnReset.addEventListener("click", ()=>{ state.round = 1; resetGame(); });
if (btnSound) btnSound.addEventListener("click", ()=>{ state.sound = !state.sound; updateHUD(); });
btnVoices.addEventListener("click", ()=>{ state.voices = !state.voices; updateHUD(); });

// zoom controls
if (zoomInBtn) zoomInBtn.addEventListener("click", ()=>{
  state.zoom = Math.min(1.6, Math.round((state.zoom+0.05)*100)/100); // allow up to 160%
  renderChain();
});
if (zoomOutBtn) zoomOutBtn.addEventListener("click", ()=>{
  state.zoom = Math.max(0.4, Math.round((state.zoom-0.05)*100)/100); // allow down to 40%
  renderChain();
});


// boot
resetGame();
