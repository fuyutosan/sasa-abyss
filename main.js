// ササノアビス モックアップ - 司令塔（担当：メイメイ）
// 状態管理・セーブ・アクション・ステータス計算・SFX・画面ルータ。
// Game.state の形：
// { sasa, floor, best, selected,
//   owned: { [charId]: { lv, xp, sp, nodes:{p,s,l}, keystone, weapon, elems:[], elem, rescued } },
//   pulls, settings:{sfx,bgm}, flags:{firstPullDone,campNewIds:[],tutorialStep,tutorialSkipped} }

(function () {
  const SAVE_KEY = 'sasaAbyssMock_v1';

  function newCharState(rescued) {
    return { lv: 1, xp: 0, sp: 0, nodes: { p: 0, s: 0, l: 0 }, keystone: null,
             weapon: 1, elems: [], elem: null, rescued: !!rescued, armorId: null, unique: null, uniqueOn: false };
  }

  function defaultState() {
    return {
      sasa: 0, floor: 1, best: 0, selected: 'tomoshibi',
      owned: { tomoshibi: newCharState(false) },
      inventory: [], nextItemId: 1,
      quests: { wakaeda: { done: false, best: 0 } },
      pulls: 0, settings: { sfx: true, bgm: true }, flags: { firstPullDone: false, campNewIds: [], tutorialStep: 0, tutorialSkipped: false, introSeen: false },
    };
  }

  const Game = { state: defaultState() };
  window.Game = Game;

  // ---------- セーブ ----------
  Game.save = function () {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.state)); } catch (e) {}
  };
  Game.load = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        Game.state = Object.assign(defaultState(), s);
        Game.state.settings = Object.assign({ sfx: true, bgm: true }, s.settings);
        Game.state.flags = Object.assign({ firstPullDone: false, campNewIds: [], tutorialStep: 0, tutorialSkipped: false }, s.flags);
        if (!Array.isArray(Game.state.flags.campNewIds)) Game.state.flags.campNewIds = [];
        // 旧セーブへの補完（防具は合格ゲート版で追加）
        if (!Array.isArray(Game.state.inventory)) Game.state.inventory = [];
        if (!Game.state.nextItemId) Game.state.nextItemId = 1;
        for (const id of Object.keys(Game.state.owned)) {
          if (Game.state.owned[id].armorId === undefined) Game.state.owned[id].armorId = null;
          if (Game.state.owned[id].unique === undefined) Game.state.owned[id].unique = null;
          if (Game.state.owned[id].uniqueOn === undefined) Game.state.owned[id].uniqueOn = false;
        }
        if (!Game.state.quests || typeof Game.state.quests !== 'object') Game.state.quests = {};
        Game.state.quests.wakaeda = Object.assign({ done: false, best: 0 }, Game.state.quests.wakaeda);
      }
    } catch (e) { Game.state = defaultState(); }
  };
  Game.reset = function () {
    Game.state = defaultState();
    Game.save();
    Game.show('title');
  };

  // ---------- 比較用スイッチ（?base=1 で今回の追加がすべてオフ）----------
  Game.isBase = function () { try { return new URLSearchParams(location.search).get('base') === '1'; } catch (e) { return false; } };

  // ---------- 自動プレイ記録（セーブとは別キー。データ初期化では消えない）----------
  const LOG_KEY = 'sasaAbyssPlayLog_v1';
  Game.logRead = function () {
    try { const a = JSON.parse(localStorage.getItem(LOG_KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  };
  Game.log = function (type, data) {
    const a = Game.logRead();
    const e = Object.assign({ t: Date.now(), type: type }, data || {});
    if (Game.isBase()) e.base = true;
    a.push(e);
    while (a.length > BALANCE.playLogMax) a.shift();
    try { localStorage.setItem(LOG_KEY, JSON.stringify(a)); } catch (err) {}
  };

  // ---------- 参照ヘルパ ----------
  Game.charDef = id => CHARS.find(c => c.id === id);
  Game.charState = id => Game.state.owned[id];
  Game.playable = id => id === 'tomoshibi' || id === 'onpu' || id === 'gorogoro';
  Game.tutorialStep = function () { return Game.state.flags.tutorialSkipped ? 8 : (Game.state.flags.tutorialStep || 0); };
  Game.advanceTutorial = function (step) {
    if (Game.state.flags.tutorialSkipped) return;
    const current = Game.state.flags.tutorialStep || 0;
    // 一度に一つだけ教える。先の操作を偶然行っても手順を飛ばさない。
    if (step === current + 1) { Game.state.flags.tutorialStep = step; Game.save(); }
  };
  Game.skipTutorial = function () { Game.state.flags.tutorialSkipped = true; Game.state.flags.tutorialStep = 8; Game.save(); };
  Game.itemById = id => Game.state.inventory.find(it => it.id === id) || null;

  // ---------- たき火の席 ----------
  // 新加入は次の入村で必ず着席。選択中→新しい順→残席ランダムの優先順位で最大5席にする。
  Game.noteCampArrival = function (id) {
    const ids = Game.state.flags.campNewIds;
    const old = ids.indexOf(id);
    if (old >= 0) ids.splice(old, 1);
    ids.push(id);
  };

  Game.prepareCampSeats = function (randomFn) {
    const S = Game.state;
    const rng = typeof randomFn === 'function' ? randomFn : Math.random;
    const ownedIds = Object.keys(S.owned);
    const newIds = S.flags.campNewIds.filter(id => !!S.owned[id]);
    const newSet = new Set(newIds);
    const seatIds = [];
    const used = new Set();
    function add(id) {
      if (!id || used.has(id) || !S.owned[id] || seatIds.length >= 5) return;
      used.add(id); seatIds.push(id);
    }
    add(S.selected);
    for (let i = newIds.length - 1; i >= 0; i--) add(newIds[i]);
    const rest = ownedIds.filter(id => !used.has(id));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = rest[i]; rest[i] = rest[j]; rest[j] = tmp;
    }
    for (const id of rest) add(id);
    return seatIds.map(charId => ({ charId, isNew: newSet.has(charId) }));
  };

  Game.ackCampArrivals = function () {
    if (!Game.state.flags.campNewIds.length) return;
    Game.state.flags.campNewIds.length = 0;
    Game.save();
  };

  // 防具を在庫に入れる（上限あり。あふれたら装備していない一番古いものを手放す）
  Game.addItem = function (raw) {
    const S = Game.state;
    const item = Object.assign({}, raw, { id: S.nextItemId++ });
    let discarded = null;
    if (S.inventory.length >= ARMOR.invMax) {
      const equippedIds = new Set(Object.values(S.owned).map(c => c.armorId).filter(Boolean));
      const idx = S.inventory.findIndex(it => !equippedIds.has(it.id));
      if (idx >= 0) discarded = S.inventory.splice(idx, 1)[0];
      else return { added: null, discarded: null };   // 全部装備中なら諦める（起きないはず）
    }
    S.inventory.push(item);
    return { added: item, discarded };
  };

  // ---------- ステータス計算（Runはこれだけを見る）----------
  Game.calcStats = function (id) {
    const def = Game.charDef(id), cs = Game.charState(id);
    const B = BALANCE.player;
    const n = cs.nodes;
    let atk = (def.atk || 10) * (1 + (n.p >= 1 ? 0.10 : 0) + (n.p >= 3 ? 0.15 : 0));
    const QD = QUESTS.wakaeda;
    const uniqueOn = id === QD.charId && cs.unique === 'wakaeda' && cs.uniqueOn && !Game.isBase();
    if (uniqueOn) atk *= QD.atkMul;               // ユニーク武器：段階の倍率の代わり
    else atk *= 1 + 0.30 * (cs.weapon - 1);       // 武器の段階
    atk *= 1 + 0.03 * (cs.lv - 1);                // レベルの底上げ
    return {
      atk, critCh: (n.p >= 2 ? 0.10 : 0) + 0.05,
      spPowerMul: 1 + (n.p >= 4 ? 0.40 : 0),
      rangeMul: (1 + (n.s >= 1 ? 0.12 : 0) + (n.s >= 3 ? 0.12 : 0)),
      intervalMul: (1 - (n.s >= 2 ? 0.08 : 0)) * (1 - (n.s >= 4 ? 0.10 : 0)),
      projBonus: n.s >= 3 ? 1 : 0,
      hp: Math.round(B.hp * (1 + (n.l >= 1 ? 0.20 : 0)) * (1 + 0.04 * (cs.lv - 1))),
      regen: n.l >= 2 ? 0.6 : 0,
      speed: B.speed * (1 + (n.l >= 3 ? 0.10 : 0)),
      dmgTakenMul: 1 - (n.l >= 4 ? 0.15 : 0),
      keystone: cs.keystone,                       // null | 'p' | 's' | 'l'
      element: cs.elem,                            // null | 'fire' | 'ice' | 'thunder' | 'sprout'
      weaponRank: cs.weapon,
      atkType: def.atkType, interval: def.interval || 0.6, projN: (def.projN || 1),
      spGainMul: 1,
      unique: uniqueOn ? 'wakaeda' : null,
    };
  };

  // 防具（お守り）の効果を上乗せする（calcStatsの結果に適用）
  const _calcBase = Game.calcStats;
  Game.calcStats = function (id) {
    const st = _calcBase(id);
    const cs = Game.charState(id);
    const item = cs && cs.armorId ? Game.itemById(cs.armorId) : null;
    if (item) {
      const m = 1 + item.val / 100;
      if (item.typeId === 'atk') st.atk *= m;
      else if (item.typeId === 'hp') st.hp = Math.round(st.hp * m);
      else if (item.typeId === 'spd') st.speed *= m;
      else if (item.typeId === 'sp') st.spGainMul = m;
    }
    return st;
  };

  // ---------- 経験値 ----------
  Game.addXp = function (id, amount) {
    const cs = Game.charState(id);
    cs.xp += amount;
    let ups = 0;
    while (cs.xp >= BALANCE.xpNeed(cs.lv)) { cs.xp -= BALANCE.xpNeed(cs.lv); cs.lv++; cs.sp++; ups++; }
    return ups;
  };

  // ---------- アクション（UIから呼ばれる）----------
  const A = Game.actions = {};
  // 押せない（笹やSPが足りない・選べない）ときの返し。音を鳴らして { err } を返す
  const deny = msg => { Game.sfx('deny'); return { err: msg }; };

  A.startRun = function (floor) {
    floor = Math.min(floor || Game.state.floor, Game.state.floor, BALANCE.maxFloorMock);
    // 今の処理全体を Book.turn で包む：切り替えはその場で一瞬、その上に今の画面の紙がめくれる（本のUI。裏には「第N階」）
    if (!Game.state.flags.introSeen) { Game.state.flags.introSeen = true; Game.save(); }   // 表紙の次の物語のページは最初の1回だけ
    Book.turn(function () {
      Game.sfx('dive');
      if (window.Village && Village.stop) { try { Village.stop(); } catch (e) {} }
      Game.show(null);
      if (Game.tutorialStep && Game.tutorialStep() >= 7) Game.advanceTutorial(8);
      const q = new URLSearchParams(location.search);
      Run.start({ charId: Game.state.selected, floor,
                  stress: q.get('stress') === '1', auto: q.get('auto') === '1', base: Game.isBase() });
    }, { backTitle: '第' + floor + '階', backSub: (FLOORS[floor] || {}).title || '' });
  };

  Game.onRunEnd = function (r) {
    const scale = BALANCE.floorScale(r.floor).reward;
    let sasa = Math.round(r.sasa * scale) + (r.win ? Math.round(BALANCE.clearBonus * scale) : 0);
    Game.state.sasa += sasa;
    const ups = Game.addXp(Game.state.selected, r.xp);
    // 拾った防具を在庫へ（勝敗にかかわらず持ち帰れる＝没収なしの方針）
    const kept = [];
    for (const raw of (r.drops || [])) {
      const res = Game.addItem(raw);
      if (res.added) kept.push(res.added);
    }
    r.drops = kept;
    // 依頼書「枯れずの若枝」（?base=1 のときは何もしない）
    const QD = QUESTS.wakaeda, qs = Game.state.quests.wakaeda;
    const base = Game.isBase();
    const charId = r.charId || Game.state.selected;
    let questDoneNow = false;
    if (!base) {
      const ek = Math.min(r.eliteKills || 0, QD.eliteTarget);
      const target = r.floor === QD.floor && charId === QD.charId;   // best は第2階・ともしびの探索だけで更新
      if (target) qs.best = Math.max(qs.best, ek);
      if (!qs.done && r.win && target && ek >= QD.eliteTarget) {
        qs.done = true; questDoneNow = true;
        const cs = Game.state.owned[QD.charId];
        if (cs) { cs.unique = 'wakaeda'; cs.uniqueOn = true; }
        Game.log('quest', { what: 'done' });
      }
      r.quest = { state: qs.done ? (questDoneNow ? 'done' : 'owned') : 'open', best: qs.best };
    }
    Game.log('runEnd', { win: !!r.win, time: Math.round((r.time || 0) * 10) / 10, kills: r.kills || 0, levelUps: r.runLevelUps || 0,
                         elites: r.eliteKills || 0, questBest: qs.best, questDone: qs.done });
    if (r.win) {
      Game.state.best = Math.max(Game.state.best, r.floor);
      if (r.floor === Game.state.floor) Game.state.floor = Math.min(Game.state.floor + 1, BALANCE.maxFloorMock);
      if (r.rescued && !Game.state.owned[r.rescued]) {
        Game.state.owned[r.rescued] = newCharState(true);
        Game.noteCampArrival(r.rescued);
      }
    }
    Game.save();
    Game.advanceTutorial(4);
    Game.sfx(r.win ? 'win' : 'lose');
    // 戦闘の終わり → 結果：切り替えはその場で、その上に戦闘の最後の画面の紙がめくれる
    Book.turn(function () { Game.show('result', Object.assign({}, r, { sasaTotal: sasa, levelUps: ups })); });
    Game.log('resultShown');
  };

  A.gachaPull = function () {
    const S = Game.state;
    if (S.sasa < BALANCE.costs.gacha) return deny('笹が足りない');
    S.sasa -= BALANCE.costs.gacha;
    S.pulls++;
    let id;
    if (S.pulls === 1) { id = 'onpu'; S.flags.firstPullDone = true; } // 初回は必ずおんぷ
    else if (S.pulls === 2) { id = 'gorogoro'; } // 2回目は必ずごろごろ
    else {
      const r = Math.random();
      const rarity = r < GACHA.UR ? 'UR' : r < GACHA.UR + GACHA.SSR ? 'SSR' : 'SR';
      const pool = CHARS.filter(c => c.rarity === rarity);
      id = pool[Math.floor(Math.random() * pool.length)].id;
    }
    const isNew = !S.owned[id];
    if (isNew) {
      S.owned[id] = newCharState(false);
      Game.noteCampArrival(id);
    }
    else S.sasa += BALANCE.dupSasa;
    Game.save(); Game.advanceTutorial(6);
    Game.sfx('gachaOpen');
    return { charId: id, rarity: Game.charDef(id).rarity, isNew, dupSasa: isNew ? 0 : BALANCE.dupSasa };
  };

  A.buyNode = function (branch) {
    const cs = Game.charState(Game.state.selected);
    const idx = cs.nodes[branch];
    const node = TREES[branch].nodes[idx];
    if (!node) return deny('この枝は極めた');
    if (idx === 4 && cs.keystone) return deny('極意はひとつだけ（振り直しで変えられる）');
    if (cs.sp < node.sp) return deny('SPが足りない');
    cs.sp -= node.sp;
    cs.nodes[branch]++;
    if (idx === 4) cs.keystone = branch;
    Game.save(); Game.sfx('click');
    Game.advanceTutorial(5);
    return { ok: true };
  };

  A.toggleUnique = function (on) {
    const cs = Game.charState(QUESTS.wakaeda.charId);
    if (!cs || cs.unique !== 'wakaeda') return deny('まだ持っていない');
    cs.uniqueOn = !!on;
    Game.save(); Game.sfx('click'); Game.log('uniqueToggle', { on: !!on });
    return { ok: true };
  };

  A.respec = function () {
    const S = Game.state, cs = Game.charState(S.selected);
    if (S.sasa < BALANCE.costs.respec) return deny('笹が足りない');
    S.sasa -= BALANCE.costs.respec;
    let refund = 0;
    for (const b of ['p', 's', 'l']) {
      for (let i = 0; i < cs.nodes[b]; i++) refund += TREES[b].nodes[i].sp;
      cs.nodes[b] = 0;
    }
    cs.keystone = null; cs.sp += refund;
    Game.save(); Game.sfx('click');
    return { ok: true };
  };

  A.upgradeWeapon = function () {
    const S = Game.state, cs = Game.charState(S.selected);
    if (cs.weapon >= BALANCE.maxWeaponMock) return deny('体験版はここまで');
    if (S.sasa < BALANCE.costs.weapon) return deny('笹が足りない');
    S.sasa -= BALANCE.costs.weapon; cs.weapon++;
    Game.save(); Game.advanceTutorial(5); Game.sfx('forge');
    return { ok: true };
  };

  A.buyElement = function (el) {
    const S = Game.state, cs = Game.charState(S.selected);
    if (cs.elems.includes(el)) { cs.elem = el; Game.save(); Game.sfx('equip'); return { ok: true }; }
    if (S.sasa < BALANCE.costs.element) return deny('笹が足りない');
    S.sasa -= BALANCE.costs.element; cs.elems.push(el); cs.elem = el;
    Game.save(); Game.sfx('forge');
    return { ok: true };
  };

  A.setElement = function (el) {
    const cs = Game.charState(Game.state.selected);
    if (el !== null && !cs.elems.includes(el)) return deny('未習得');
    cs.elem = el; Game.save(); Game.sfx('equip');
    return { ok: true };
  };

  A.train = function () {
    const S = Game.state;
    if (S.sasa < BALANCE.costs.train) return deny('笹が足りない');
    S.sasa -= BALANCE.costs.train;
    const ups = Game.addXp(S.selected, BALANCE.trainXp);
    Game.save(); Game.advanceTutorial(5); Game.sfx(ups ? 'level' : 'click');
    return { ok: true, levelUps: ups };
  };

  A.equipArmor = function (itemId) {
    const cs = Game.charState(Game.state.selected);
    if (itemId !== null && !Game.itemById(itemId)) return deny('そのお守りは見つからない');
    cs.armorId = itemId;
    Game.save(); Game.advanceTutorial(5); Game.sfx('equip');
    return { ok: true };
  };

  A.selectChar = function (id) {
    if (!Game.state.owned[id] || !Game.playable(id)) return deny('この子は加勢で力を貸してくれる');
    const changed = Game.state.selected !== id;
    Game.state.selected = id;
    if (changed) Game.advanceTutorial(7);
    Game.save(); Game.sfx('click');
    return { ok: true };
  };

  // ---------- 画面ルータ ----------
  // 'village' は歩ける村シーン（village.js）。他の画面は村の上のオーバーレイとして開く
  Game.show = function (name, params) {
    // 画面に合わせて曲と環境音を替える：戦闘＝run／結果＝そのまま（環境音だけ止める）／それ以外（表紙・村・村の中のメニュー）＝village＋たき火
    if (window.Audio3) {
      if (name === null) { Audio3.bgm('run'); Audio3.amb(null); }
      else if (name === 'result') { Audio3.amb(null); }
      else { Audio3.bgm('village'); Audio3.amb('fire'); }
    }
    const menu = document.getElementById('menu');
    const hud = document.getElementById('hud');
    if (name === null) {   // 戦闘
      if (window.Village && Village.stop) { try { Village.stop(); } catch (e) {} }
      menu.style.display = 'none'; hud.style.display = 'block'; return;
    }
    if (name === 'village' && window.Village) {
      menu.style.display = 'none'; hud.style.display = 'none';
      Village.start();
      return;
    }
    if (window.Village && Village.pause) { try { Village.pause(); } catch (e) {} }
    hud.style.display = 'none'; menu.style.display = 'block';
    UI.show(name, params);
  };

  // ---------- 音 ----------
  // 中身は audio.js（Audio3）。ここは入口だけ。ファイルが読めないときの合成音も audio.js にある
  Game.sfx = n => { if (window.Audio3) Audio3.play(n); };

  // ---------- デバッグ ----------
  window.dbg = {
    give: (n) => { Game.state.sasa += (n || 500); Game.save(); },
    sp: (n) => { Game.charState(Game.state.selected).sp += (n || 5); Game.save(); },
    startRun: () => A.startRun(),
    stats: () => window.__stats,
  };

  // ---------- 起動 ----------
  window.addEventListener('DOMContentLoaded', function () {
    Game.load();
    Sprites.init();
    UI.init();
    Game.show('title');
    // アドレスの末尾が #dive なら、すぐ第1階へ（claude.ai のページでの動作確認用。そこでは ?〜 が届かず #〜 だけ届く。2026-10-22）
    // （claude.ai では #〜 が読み込みの後から届くことがあるので、hashchange でも拾う。潜るのは1回だけ）
    let dived = false;
    const diveByHash = function () { if (!dived && location.hash === '#dive') { dived = true; setTimeout(function () { A.startRun(1); }, 300); } };
    diveByHash();
    window.addEventListener('hashchange', diveByHash);
    // 音はユーザー操作後にしか鳴らせないので、最初のタッチで起こす
    // 最初の操作で効果音を読み込み、曲を始める。iPhone では起きるまで何度か試す（起きたら外す）
    const wake = () => {
      if (!window.Audio3 || Audio3.wake()) { document.removeEventListener('pointerdown', wake); document.removeEventListener('click', wake); document.removeEventListener('keydown', wake); }
    };
    document.addEventListener('pointerdown', wake);
    document.addEventListener('click', wake);
    document.addEventListener('keydown', wake);   // キーボードだけで遊ぶ人にも音を出す
  });
})();
