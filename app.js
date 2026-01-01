const $ = (s) => document.querySelector(s);

const state = {
  settings: { lang: "id" },
  data: { classes: {}, enemies: {}, items: {}, skills: {}, magic: {} },
  episode: null,
  player: null,
  story: { episodeId: "ep1", nodeId: "intro" },
  mode: "title",
  combat: null,
};

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function hint(msg){ $("#hint").textContent = msg || ""; }

function loadSettings(){
  try {
    const raw = localStorage.getItem("ea_settings");
    if (raw) state.settings = JSON.parse(raw);
  } catch {}
  document.documentElement.lang = state.settings.lang || "id";
  $("#selLanguage").value = state.settings.lang || "id";
}

function saveSettings(){
  localStorage.setItem("ea_settings", JSON.stringify(state.settings));
}

function hasSave(){ return !!localStorage.getItem("ea_save"); }

function saveGame(){
  const payload = {
    settings: state.settings,
    player: state.player,
    story: state.story,
  };
  localStorage.setItem("ea_save", JSON.stringify(payload));
}

function loadGame(){
  try {
    const raw = localStorage.getItem("ea_save");
    if (!raw) return false;
    const s = JSON.parse(raw);
    state.settings = s.settings || state.settings;
    state.player = s.player || null;
    state.story = s.story || state.story;
    return true;
  } catch (e){
    hint("Save rusak / tidak bisa dibaca.");
    return false;
  }
}

function deleteSave(){
  localStorage.removeItem("ea_save");
}

async function loadJSON(path){
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return await res.json();
}

async function loadStaticData(){
  const [classes, enemies, items, skills, magic] = await Promise.all([
    loadJSON("./data/classes.json"),
    loadJSON("./data/enemies.json"),
    loadJSON("./data/items.json"),
    loadJSON("./data/skills.json"),
    loadJSON("./data/magic.json"),
  ]);
  state.data.classes = classes;
  state.data.enemies = enemies;
  state.data.items = items;
  state.data.skills = skills;
  state.data.magic = magic;
}

async function loadEpisode(epId){
  const lang = state.settings.lang || "id";
  const path = `./data/episodes/${epId}.${lang}.json`;
  state.episode = await loadJSON(path);
}

function t(x){ return x; } // episode JSON sudah per-bahasa

function newPlayer(){
  return {
    name: "Hero",
    classId: "",
    stats: { level:1, exp:0, gold:0, hp:1, maxHp:1, mp:0, maxMp:0, atk:1, def:0 },
    inventory: {},
    skills: [],
    magics: []
  };
}

function applyClass(classId){
  const cls = state.data.classes[classId];
  state.player.classId = classId;
  state.player.stats.maxHp = cls.max_hp|0;
  state.player.stats.hp = cls.max_hp|0;
  state.player.stats.maxMp = cls.max_mp|0;
  state.player.stats.mp = cls.max_mp|0;
  state.player.stats.atk = cls.atk|0;
  state.player.stats.def = cls.def|0;
  state.player.skills = (cls.skills||[]).slice();
  state.player.magics = (cls.magics||[]).slice();
  state.player.inventory = {};
  for (const it of (cls.start_items||[])){
    state.player.inventory[it.id] = (state.player.inventory[it.id]||0) + (it.qty|0);
  }
}

function renderHud(){
  if (!state.player){
    $("#hudStats").innerHTML = "";
    $("#hudMeta").innerHTML = "";
    return;
  }
  const s = state.player.stats;
  $("#hudStats").innerHTML = `
    <span><b>HP</b> ${s.hp}/${s.maxHp}</span>
    <span><b>MP</b> ${s.mp}/${s.maxMp}</span>
    <span><b>ATK</b> ${s.atk}</span>
    <span><b>DEF</b> ${s.def}</span>
  `;
  $("#hudMeta").innerHTML = `
    <span><b>LV</b> ${s.level}</span>
    <span><b>EXP</b> ${s.exp}</span>
    <span><b>GOLD</b> ${s.gold}</span>
  `;
}

function setPanel(title, text, sub=""){
  $("#panelTitle").textContent = title || "";
  $("#panelText").textContent = text || "";
  $("#uiSub").textContent = sub || "";
}

function setChoices(btns){
  const el = $("#choices");
  el.innerHTML = "";
  for (const b of btns) el.appendChild(b);
}

function mkBtn(label, {primary=false, danger=false, onClick}){
  const b = document.createElement("button");
  b.textContent = label;
  if (primary) b.classList.add("primary");
  if (danger) b.classList.add("danger");
  b.addEventListener("click", onClick);
  return b;
}

function nodeById(id){
  return state.episode?.nodes?.[id] || null;
}

function gotoNode(id){
  state.story.nodeId = id;
  saveGame();
  render();
}

function renderTitle(){
  setPanel("Endless Advanture",
    state.settings.lang === "id"
      ? "Text-based RPG (PWA). Offline setelah dibuka via HTTPS.\n\nKlik New Game untuk mulai."
      : "Text-based RPG (PWA). Works offline after opened via HTTPS.\n\nTap New Game to start.",
    "");
  setChoices([
    mkBtn("New Game", { primary:true, onClick: async () => {
      state.player = newPlayer();
      state.mode = "story";
      state.story = { episodeId:"ep1", nodeId:"intro" };
      await loadEpisode(state.story.episodeId);
      saveGame();
      render();
    }}),
    mkBtn("Continue", { primary:true, onClick: async () => {
      if (!hasSave() || !loadGame() || !state.player){
        hint(state.settings.lang === "id" ? "Belum ada save." : "No save found.");
        return;
      }
      await loadEpisode(state.story.episodeId);
      state.mode = "story";
      render();
    }}),
    mkBtn("Settings", { onClick: () => $("#dlgSettings").showModal() }),
  ]);
}

function renderClassSelect(){
  setPanel(
    state.settings.lang === "id" ? "Pilih Kelas" : "Choose Class",
    state.settings.lang === "id"
      ? "Kelas menentukan stat awal dan kemampuanmu."
      : "Your class determines starting stats and abilities.",
    "Episode 1"
  );

  const btns = [];
  for (const classId of ["warrior","mage","rogue"]){
    const cls = state.data.classes[classId];
    const title = (state.settings.lang === "id")
      ? (classId === "warrior" ? "Warrior" : classId === "mage" ? "Mage" : "Rogue")
      : (classId === "warrior" ? "Warrior" : classId === "mage" ? "Mage" : "Rogue");
    const desc = state.settings.lang === "id"
      ? (classId === "warrior" ? "Tangguh & DEF tinggi." : classId === "mage" ? "MP tinggi & magic." : "Cepat & seimbang.")
      : (classId === "warrior" ? "Tanky & high DEF." : classId === "mage" ? "High MP & magic." : "Fast & balanced.");
    btns.push(mkBtn(`${title} — ${desc}`, {
      primary:true,
      onClick: () => { applyClass(classId); gotoNode("intro_after_class"); }
    }));
  }
  setChoices(btns);
}

function renderStory(){
  const node = nodeById(state.story.nodeId);
  if (!node){
    setPanel("Error", `Node not found: ${state.story.nodeId}`);
    setChoices([mkBtn("Back", {onClick: () => { state.mode="title"; state.player=null; render(); }})]);
    return;
  }

  if (node.ui?.type === "class_select") {
    renderClassSelect();
    return;
  }

  setPanel(node.title, node.text, `${state.story.episodeId.toUpperCase()} • ${node.title}`);

  const btns = [];
  if (node.choices?.length){
    for (const c of node.choices){
      btns.push(mkBtn(c.label, { primary:true, onClick: () => gotoNode(c.next) }));
    }
  } else {
    btns.push(mkBtn(state.settings.lang === "id" ? "Selesai" : "Finish", {
      primary:true, onClick: () => { state.mode="title"; state.player=null; render(); }
    }));
  }
  setChoices(btns);
}

function render(){
  $("#uiTitle").textContent = "Endless Advanture";
  renderHud();
  hint("");

  if (state.mode === "title") return renderTitle();
  if (state.mode === "story") return renderStory();
}

async function main(){
  loadSettings();

  $("#btnSettings").addEventListener("click", () => $("#dlgSettings").showModal());
  $("#selLanguage").addEventListener("change", async (e) => {
    state.settings.lang = e.target.value;
    saveSettings();
    if (state.mode !== "title") {
      await loadEpisode(state.story.episodeId);
    }
    render();
  });
  $("#btnDeleteSave").addEventListener("click", () => {
    deleteSave();
    hint(state.settings.lang === "id" ? "Save dihapus." : "Save deleted.");
  });

  try {
    await loadStaticData();
  } catch (e) {
    hint(
      "Gagal load data JSON. Kemungkinan kamu buka via file:// atau path data salah.\n" +
      "Solusi: jalankan via GitHub Pages/HTTPS.\n" +
      String(e)
    );
    state.mode = "title";
    render();
    return;
  }

  if (hasSave() && loadGame() && state.player) {
    try { await loadEpisode(state.story.episodeId); } catch {}
    state.mode = "story";
  } else {
    state.mode = "title";
  }
  render();

  // PWA offline cache
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }
}

main();
    
