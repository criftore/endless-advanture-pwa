const STORAGE_KEY = "endless_advanture_save_v1";
const SETTINGS_KEY = "endless_advanture_settings_v1";

const $ = (sel) => document.querySelector(sel);

const state = {
  settings: { lang: "id" },
  data: {
    classes: null,
    skills: null,
    magic: null,
    items: null,
    enemies: null,
    episode: null
  },
  story: { episodeId: "ep1", nodeId: "intro" },
  player: null,
  mode: "story", // "story" | "combat"
  combat: null
};

function t(obj) {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  return obj[state.settings.lang] ?? obj.id ?? obj.en ?? "";
}

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

function baseDamage(attackerAtk, defenderDef) {
  const raw = attackerAtk - Math.floor(defenderDef * 0.6);
  return Math.max(1, raw);
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (s.lang === "id" || s.lang === "en") state.settings.lang = s.lang;
  } catch {}
  $("#selLanguage").value = state.settings.lang;
  document.documentElement.lang = state.settings.lang;
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function saveGame() {
  const payload = {
    settings: state.settings,
    story: state.story,
    player: state.player
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  $("#hint").textContent = state.settings.lang === "id" ? "Tersimpan." : "Saved.";
}

function hasSave() {
  return !!localStorage.getItem(STORAGE_KEY);
}

function loadGame() {
  try {
    const payload = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!payload) return false;
    if (payload.settings?.lang) state.settings.lang = payload.settings.lang;
    if (payload.story?.episodeId && payload.story?.nodeId) state.story = payload.story;
    if (payload.player) state.player = payload.player;
    return true;
  } catch {
    return false;
  }
}

function deleteSave() {
  localStorage.removeItem(STORAGE_KEY);
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed ${path}`);
  return await res.json();
}

async function loadStaticData() {
  const [classes, skills, magic, items, enemies] = await Promise.all([
    fetchJson("./data/classes.json"),
    fetchJson("./data/skills.json"),
    fetchJson("./data/magic.json"),
    fetchJson("./data/items.json"),
    fetchJson("./data/enemies.json")
  ]);
  state.data.classes = classes;
  state.data.skills = skills;
  state.data.magic = magic;
  state.data.items = items;
  state.data.enemies = enemies;
}

async function loadEpisode(episodeId) {
  const path = `./data/episodes/${episodeId}.${state.settings.lang}.json`;
  state.data.episode = await fetchJson(path);
}

function newPlayer() {
  return {
    name: "Hero",
    classId: "",
    level: 1,
    exp: 0,
    gold: 0,
    stats: { maxHp: 1, hp: 1, maxMp: 0, mp: 0, atk: 1, def: 0 },
    skills: [],
    magics: [],
    inventory: {}
  };
}

function applyClass(classId) {
  const cls = state.data.classes[classId];
  if (!cls) return;

  state.player.classId = classId;
  state.player.stats.maxHp = cls.stats.maxHp;
  state.player.stats.maxMp = cls.stats.maxMp;
  state.player.stats.atk = cls.stats.atk;
  state.player.stats.def = cls.stats.def;
  state.player.stats.hp = cls.stats.maxHp;
  state.player.stats.mp = cls.stats.maxMp;
  state.player.skills = [...(cls.skills || [])];
  state.player.magics = [...(cls.magics || [])];
  state.player.inventory = {};
  for (const it of (cls.startItems || [])) {
    state.player.inventory[it.id] = (state.player.inventory[it.id] || 0) + (it.qty || 1);
  }
}

function addItem(itemId, qty) {
  state.player.inventory[itemId] = (state.player.inventory[itemId] || 0) + qty;
  if (state.player.inventory[itemId] <= 0) delete state.player.inventory[itemId];
}

function renderHud() {
  if (!state.player) { $("#hud").innerHTML = ""; return; }
  const cls = state.data.classes[state.player.classId];
  const className = cls ? t(cls.name) : "—";
  const s = state.player.stats;
  $("#hud").innerHTML = `
    <div><div><strong>${state.player.name}</strong></div><div>${className}</div></div>
    <div>
      <div>HP: <strong>${s.hp}</strong>/<strong>${s.maxHp}</strong></div>
      <div>MP: <strong>${s.mp}</strong>/<strong>${s.maxMp}</strong></div>
      <div>ATK: <strong>${s.atk}</strong> DEF: <strong>${s.def}</strong></div>
      <div>GOLD: <strong>${state.player.gold}</strong> EXP: <strong>${state.player.exp}</strong></div>
    </div>
  `;
}

function setPanel(title, body) {
  $("#panelTitle").textContent = title ?? "—";
  $("#panelBody").textContent = body ?? "";
}

function setChoices(buttons) {
  const el = $("#choices");
  el.innerHTML = "";
  for (const b of buttons) el.appendChild(b);
}

function mkBtn(label, { primary=false, danger=false, onClick }) {
  const btn = document.createElement("button");
  btn.className = `btn${primary ? " primary" : ""}${danger ? " danger" : ""}`;
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function nodeById(nodeId) {
  return state.data.episode.nodes[nodeId];
}

function gotoNode(nodeId) {
  state.story.nodeId = nodeId;
  saveGame();
  render();
}
async function goNextEpisode(episodeId) {
  state.story.episodeId = episodeId;
  state.story.nodeId = "intro"; // masuk ke start ep berikutnya
  await loadEpisode(state.story.episodeId);
  saveGame();
  render();
}


function applyEffects(effects = []) {
  for (const ef of effects) {
    if (ef.type === "addGold") state.player.gold += (ef.value|0);
    if (ef.type === "addExp") state.player.exp += (ef.value|0);
    if (ef.type === "setHp") state.player.stats.hp = clamp((ef.value|0), 0, state.player.stats.maxHp);
    if (ef.type === "addItem") addItem(ef.itemId, ef.qty|0);
  }
}

function startCombat(enemyId, winNext, loseNext) {
  const enemy = state.data.enemies[enemyId];
  state.mode = "combat";
  state.combat = {
    enemyId,
    winNext,
    loseNext,
    enemy: {
      name: t(enemy.name),
      stats: {
        maxHp: enemy.stats.maxHp, hp: enemy.stats.maxHp,
        maxMp: enemy.stats.maxMp, mp: enemy.stats.maxMp,
        atk: enemy.stats.atk, def: enemy.stats.def
      }
    },
    log: []
  };
  render();
}

function combatLog(line) {
  state.combat.log.push(line);
  if (state.combat.log.length > 6) state.combat.log.shift();
}

function endCombat(didWin) {
  state.mode = "story";
  const next = didWin ? state.combat.winNext : state.combat.loseNext;
  state.combat = null;
  gotoNode(next);
}

function useItem(itemId) {
  const item = state.data.items[itemId];
  if (!item) return false;
  const inv = state.player.inventory[itemId] || 0;
  if (inv <= 0) return false;

  if (item.type === "heal_hp") {
    state.player.stats.hp = clamp(state.player.stats.hp + item.value, 0, state.player.stats.maxHp);
  } else if (item.type === "heal_mp") {
    state.player.stats.mp = clamp(state.player.stats.mp + item.value, 0, state.player.stats.maxMp);
  } else if (item.type === "escape_boost") {
    state.combat.escapeBoost = (state.combat.escapeBoost || 0) + item.value;
  }

  addItem(itemId, -1);
  return true;
}

function enemyTurn() {
  const p = state.player.stats;
  const e = state.combat.enemy.stats;
  const dmg = baseDamage(e.atk, p.def);
  p.hp = clamp(p.hp - dmg, 0, p.maxHp);
  combatLog(`${state.combat.enemy.name} hits you for ${dmg}.`);
  if (p.hp <= 0) endCombat(false);
}

function doAttack() {
  const p = state.player.stats;
  const e = state.combat.enemy.stats;
  const dmg = baseDamage(p.atk, e.def);
  e.hp = clamp(e.hp - dmg, 0, e.maxHp);
  combatLog(`You attack for ${dmg}.`);
  if (e.hp <= 0) return endCombat(true);
  enemyTurn();
  saveGame();
  render();
}

function doSkill(skillId) {
  const sk = state.data.skills[skillId];
  if (!sk) return;
  const p = state.player.stats;
  const e = state.combat.enemy.stats;

  const cost = sk.mpCost|0;
  if (p.mp < cost) { combatLog("Not enough MP."); render(); return; }
  p.mp -= cost;

  const dmg = Math.max(1, Math.floor(baseDamage(p.atk, e.def) * (sk.mult || 1)));
  e.hp = clamp(e.hp - dmg, 0, e.maxHp);
  combatLog(`Skill: ${t(sk.name)} for ${dmg}.`);
  if (e.hp <= 0) return endCombat(true);
  enemyTurn();
  saveGame();
  render();
}

function doMagic(magicId) {
  const mg = state.data.magic[magicId];
  if (!mg) return;
  const p = state.player.stats;
  const e = state.combat.enemy.stats;

  const cost = mg.mpCost|0;
  if (p.mp < cost) { combatLog("Not enough MP."); render(); return; }
  p.mp -= cost;

  const dmg = Math.max(1, (mg.power|0) + Math.floor(p.atk * 0.3));
  e.hp = clamp(e.hp - dmg, 0, e.maxHp);
  combatLog(`Magic: ${t(mg.name)} for ${dmg}.`);
  if (e.hp <= 0) return endCombat(true);
  enemyTurn();
  saveGame();
  render();
}

function tryRun() {
  const base = 35;
  const boost = state.combat.escapeBoost || 0;
  const chance = clamp(base + boost, 5, 90);
  const roll = Math.floor(Math.random() * 100) + 1;
  if (roll <= chance) {
    combatLog(`You escaped. (${roll} <= ${chance})`);
    endCombat(false);
  } else {
    combatLog(`Failed to escape. (${roll} > ${chance})`);
    enemyTurn();
    saveGame();
    render();
  }
}

function renderStory(node) {
  setPanel(node.title, node.text);
  const buttons = [];
    // Jika node ini adalah penghubung ke episode lain
  if (node.next_episode) {
    $("#uiSub").textContent = `${state.data.episode.episodeId.toUpperCase()} • ${node.title}`;
    setChoices([
      mkBtn(state.settings.lang === "id" ? "Lanjut ke episode berikutnya" : "Continue to next episode", {
        primary: true,
        onClick: () => goNextEpisode(node.next_episode)
      })
    ]);
    return;
  }
  

  if (node.ui?.type === "class_select") {
    $("#uiSub").textContent = state.settings.lang === "id" ? "Pilih kelas" : "Choose a class";
    setPanel(node.title, node.text);

    for (const classId of ["warrior","mage","rogue"]) {
      const cls = state.data.classes[classId];
      const label = `${t(cls.name)} — ${t(cls.desc)}`;
      buttons.push(mkBtn(label, {
        primary: true,
        onClick: () => {
          applyClass(classId);
          gotoNode("after_class");
        }
      }));
    }
    buttons.push(mkBtn(state.settings.lang === "id" ? "Kembali ke judul" : "Back to title", {
      onClick: () => {
        state.story.nodeId = "intro";
        render();
      }
    }));
    setChoices(buttons);
    return;
  }

  $("#uiSub").textContent = `${state.data.episode.episodeId.toUpperCase()} • ${node.title}`;

  if (node.effects) applyEffects(node.effects);

  if (node.combat) {
    buttons.push(mkBtn(state.settings.lang === "id" ? "Mulai pertarungan" : "Start combat", {
      primary: true,
      onClick: () => startCombat(node.combat.enemyId, node.combat.winNext, node.combat.loseNext)
    }));
    setChoices(buttons);
    return;
  }

  const choices = node.choices || [];
  if (choices.length === 0) {
    buttons.push(mkBtn(state.settings.lang === "id" ? "Lanjut" : "Continue", { primary:true, onClick: () => gotoNode("__END__") }));
  } else {
    for (const c of choices) {
      buttons.push(mkBtn(c.label, { primary:true, onClick: () => gotoNode(c.next) }));
    }
  }
  setChoices(buttons);
}

function renderCombat() {
  const p = state.player.stats;
  const e = state.combat.enemy.stats;

  const title = state.settings.lang === "id" ? "Pertarungan" : "Combat";
  const body = [
    `${state.combat.enemy.name}`,
    `HP ${e.hp}/${e.maxHp}  ATK ${e.atk} DEF ${e.def}`,
    "",
    ...state.combat.log
  ].join("\n");

  setPanel(title, body);
  $("#uiSub").textContent = `${state.combat.enemy.name} • HP ${e.hp}/${e.maxHp}`;

  const buttons = [];

  buttons.push(mkBtn(state.settings.lang === "id" ? "Serang" : "Attack", { primary:true, onClick: doAttack }));

  // Skills
  if (state.player.skills.length > 0) {
    for (const id of state.player.skills) {
      const sk = state.data.skills[id];
      if (!sk) continue;
      buttons.push(mkBtn(`${state.settings.lang === "id" ? "Skill" : "Skill"}: ${t(sk.name)}`, {
        onClick: () => doSkill(id)
      }));
    }
  }

  // Magic
  if (state.player.magics.length > 0) {
    for (const id of state.player.magics) {
      const mg = state.data.magic[id];
      if (!mg) continue;
      buttons.push(mkBtn(`${state.settings.lang === "id" ? "Magic" : "Magic"}: ${t(mg.name)} (MP ${mg.mpCost})`, {
        onClick: () => doMagic(id)
      }));
    }
  }

  // Items
  const inv = state.player.inventory || {};
  const itemIds = Object.keys(inv);
  if (itemIds.length > 0) {
    for (const itemId of itemIds) {
      const item = state.data.items[itemId];
      if (!item) continue;
      buttons.push(mkBtn(`${state.settings.lang === "id" ? "Item" : "Item"}: ${t(item.name)} x${inv[itemId]}`, {
        onClick: () => {
          const ok = useItem(itemId);
          if (ok) {
            combatLog(`${t(item.name)} used.`);
            enemyTurn();
            saveGame();
            render();
          }
        }
      }));
    }
  }

  buttons.push(mkBtn(state.settings.lang === "id" ? "Kabur" : "Run", { danger:true, onClick: tryRun }));
  setChoices(buttons);
}

function renderTitleMenu() {
  $("#uiSub").textContent = state.settings.lang === "id"
    ? "Text-based RPG • Offline • PWA"
    : "Text-based RPG • Offline • PWA";

  setPanel(
    state.settings.lang === "id" ? "Menu" : "Menu",
    state.settings.lang === "id"
      ? "Pilih aksi.\n\nTips: buka via HTTPS/host supaya offline cache aktif."
      : "Choose an action.\n\nTip: use HTTPS/hosting so offline cache works."
  );

  const buttons = [];
  buttons.push(mkBtn(state.settings.lang === "id" ? "New Game" : "New Game", {
    primary:true,
    onClick: async () => {
      state.player = newPlayer();
      state.story = { episodeId: "ep1", nodeId: "intro" };
      await loadEpisode(state.story.episodeId);
      saveGame();
      render();
    }
  }));

  buttons.push(mkBtn(state.settings.lang === "id" ? "Continue" : "Continue", {
    primary:true,
    onClick: async () => {
      if (!hasSave()) return;
      loadGame();
      await loadEpisode(state.story.episodeId);
      render();
    }
  }));

  buttons.push(mkBtn(state.settings.lang === "id" ? "Settings" : "Settings", {
    onClick: () => $("#dlgSettings").showModal()
  }));

  setChoices(buttons);
}

function render() {
  document.title = "Endless Advanture";
  $("#uiTitle").textContent = "Endless Advanture";
  renderHud();

  if (!state.player) {
    renderTitleMenu();
    return;
  }

  if (state.mode === "combat") {
    renderCombat();
    renderHud();
    return;
  }

  const nodeId = state.story.nodeId;
  if (nodeId === "__END__") {
    setPanel(
      state.settings.lang === "id" ? "Selesai" : "Finished",
      state.settings.lang === "id" ? "Episode selesai (MVP)." : "Episode complete (MVP)."
    );
    setChoices([
      mkBtn(state.settings.lang === "id" ? "Kembali ke menu" : "Back to menu", {
        primary:true,
        onClick: () => { state.player = null; state.mode = "story"; state.combat=null; render(); }
      })
    ]);
    return;
  }

  const node = nodeById(nodeId);
  if (!node) {
    setPanel("Error", `Node not found: ${nodeId}`);
    setChoices([mkBtn("Back", { onClick: () => { state.player=null; render(); } })]);
    return;
  }

  renderStory(node);
  renderHud();
}

async function main() {
  loadSettings();

  $("#btnSettings").addEventListener("click", () => $("#dlgSettings").showModal());
  $("#selLanguage").addEventListener("change", async (e) => {
    state.settings.lang = e.target.value;
    saveSettings();
    document.documentElement.lang = state.settings.lang;
    await loadEpisode(state.story.episodeId);
    render();
  });

  $("#btnDeleteSave").addEventListener("click", () => {
    deleteSave();
    $("#hint").textContent = state.settings.lang === "id" ? "Save dihapus." : "Save deleted.";
  });

  // PWA register
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }

  await loadStaticData();

  if (hasSave() && loadGame()) {
    $("#selLanguage").value = state.settings.lang;
    await loadEpisode(state.story.episodeId);
    render();
  } else {
    state.player = null;
    render();
  }
}

main();
