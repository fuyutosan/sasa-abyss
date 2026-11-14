// ササノアビス モックアップ - 戦闘エンジン（担当：エージェントB）
// ループ・入力・敵・ボス・必殺・演出・HUD更新。数値は原則 BALANCE/PAL/ELEMENTS を参照する。
// このファイルの外は書き換えない。window.Run = { start, stop, dbg } を登録する。

(function () {
  'use strict';

  // ---------- BALANCEに無い「手ざわり」専用の数値（企画書§4-1a・仕様指示に明記された値） ----------
  const FEEL = {
    arcAngle: (120 * Math.PI) / 180,  // ともしびの薙ぎ：前方120°
    arcRadius: 46,                     // ×rangeMul
    noteSpeed: 150,
    noteTurn: 4,                       // 追尾旋回 rad/s
    noteLife: 2,
    critMul: 1.6,
    knockEnemy: 190,
    knockPlayer: 130,
    knockDecay: 9,
    tosshinApproachStopR: 78,
    tosshinTelegraphT: 1.0,
    tosshinChargeT: 0.5,
    tosshinRestT: 2.0,
    bossChaseT: 3.0,
    bossTelegraphT: 0.8,
    bossChargeT: 0.6,
    bossTiredT: 1.0,
    bossChaseSpeed: 46,
    bossChargeSpeed: 210,
    bossVolleyInterval: 7.0,
    sleeporbSpeed: 40,
    sleeporbDmg: 5,
    sleeporbSlowT: 1.5,
    sleeporbSlowMul: 0.7,
    hakiteOrbLife: 4,
    burnDmgPerSec: 4,
    burnDur: 2.0,
    iceSlowMul: 0.55,
    iceSlowDur: 1.5,
    thunderChainR: 40,
    thunderChainMul: 0.6,
    sproutHealMul: 0.06,
    victoryDelay: 2.0,
    loseFadeT: 1.5,
    hitstopSpecial: 0.06,
    hitstopElite: 0.05,
    shakeSpecial: 4,
    shakeHurt: 3,
    shakeMax: 6,
  };

  // ---------- DOM ----------
  // #world は表示解像度のFx合成先（worldCtx）。ドット絵そのものは
  // 論理解像度のオフスクリーン base に描き（cw）、毎フレーム Fx.compose() で拡大・合成する。
  let elWorld, elWorld3d, elFx, cf, elHud, worldCtx;
  let use3D = false;          // 3D描画（Render3D）を使っている探索か
  const tmpPt = { x: 0, y: 0 };   // worldToScreen の戻り先（使い回す）
  const base = document.createElement('canvas');
  const cw = base.getContext('2d');
  let elHpFill, elHpText, elXpFill, elLvText, elFloorText, elTimerText, elSasaText, elGuideChip, elSpecialAnnounce;
  let elBossBar, elBossFill, elBossName, elBtnSp, elBtnSpLabel, elFpsText;
  let elChoicePanel, elChoiceTitle, elChoiceSub, elChoiceCards, elQuestChip;
  let elBoxPanel, elBoxFound, elBoxRar, elBoxName, elBoxStat, elBoxSub, elBoxSasa, elBoxConf;

  function bindDom() {
    elWorld = document.getElementById('world');
    elWorld3d = document.getElementById('world3d');
    elFx = document.getElementById('fx');
    worldCtx = elWorld.getContext('2d');
    cf = elFx.getContext('2d');
    elHud = document.getElementById('hud');
    elHpFill = document.getElementById('hpFill'); elHpText = document.getElementById('hpText');
    elXpFill = document.getElementById('xpFill'); elLvText = document.getElementById('lvText');
    elFloorText = document.getElementById('floorText'); elTimerText = document.getElementById('timerText');
    elSasaText = document.getElementById('sasaText');
    elBossBar = document.getElementById('bossBar'); elBossFill = document.getElementById('bossFill'); elBossName = document.getElementById('bossName');
    elBtnSp = document.getElementById('btnSp'); elBtnSpLabel = document.getElementById('btnSpLabel');
    elFpsText = document.getElementById('fpsText');
    elChoicePanel = document.getElementById('choicePanel');
    elChoiceTitle = document.getElementById('choiceTitle'); elChoiceSub = document.getElementById('choiceSub');
    elChoiceCards = elChoicePanel.querySelectorAll('.choice-card');
    elQuestChip = document.getElementById('questChip');
    elBoxPanel = document.getElementById('boxPanel'); elBoxFound = document.getElementById('boxFound');
    elBoxRar = document.getElementById('boxRar'); elBoxName = document.getElementById('boxName'); elBoxStat = document.getElementById('boxStat');
    elBoxSub = document.getElementById('boxSub'); elBoxSasa = document.getElementById('boxSasa'); elBoxConf = document.getElementById('boxConfetti');
    if (!elBoxConf.childElementCount) buildBoxConfetti();   // 紙吹雪は起動時に1回だけ作る（毎回作らない）
    elSpecialAnnounce = document.getElementById('specialAnnounce');
    elGuideChip = document.getElementById('guideChip');
    if (!elGuideChip) { elGuideChip = document.createElement('div'); elGuideChip.id = 'guideChip'; elGuideChip.className = 'guide-chip'; elGuideChip.innerHTML = '<span></span><button type="button">skip</button>'; elHud.appendChild(elGuideChip); elGuideChip.querySelector('button').onclick = () => Game.skipTutorial && Game.skipTutorial(); }
  }

  // ---------- キャンバスの解像度 ----------
  let logW = 320, logH = 640;
  let fxScaleX = 1, fxScaleY = 1;

  function resize() {
    const rect = elWorld.parentElement.getBoundingClientRect();
    const dispW = Math.max(1, rect.width || window.innerWidth);
    const dispH = Math.max(1, rect.height || window.innerHeight);
    if (dispH >= dispW) {
      logW = 320;
      logH = Math.round(Math.max(480, Math.min(720, 320 * dispH / dispW)));
    } else {
      logH = 320;
      logW = Math.round(Math.max(320, Math.min(640, 320 * dispW / dispH)));
    }
    // ドット絵は論理解像度のオフスクリーンへ（Fx.composeの入力base）
    base.width = logW; base.height = logH;
    cw.imageSmoothingEnabled = false;

    // #world・#fx は表示解像度（DPR対応）でくっきり。#worldはCSS拡大せずFxが直接合成する
    // DPRは2で頭打ち（高DPR端末で物理解像度が爆発してスマホ性能を食うのを防ぐ＝2026-08-01 合格ゲート版）
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const physW = Math.round(dispW * dpr), physH = Math.round(dispH * dpr);
    elWorld.width = physW; elWorld.height = physH;
    Object.assign(elWorld.style, { width: '100%', height: '100%' });
    elFx.width = physW; elFx.height = physH;
    Object.assign(elFx.style, { width: '100%', height: '100%' });
    fxScaleX = physW / logW; fxScaleY = physH / logH;
    setViewFrame({ left: logW / 2, right: logW / 2, top: logH / 2, bottom: logH / 2 });
    if (use3D) Render3D.resize(dispW, dispH, logW, logH);
  }

  // 論理screen座標（toScreen()の戻り値）→ Fx/表示解像度座標
  function logicalToFx(x, y) { return { x: x * fxScaleX, y: y * fxScaleY }; }

  // ---------- Fxライト予算（上限280でカット。仕様書§エージェントR-6） ----------
  const FX_LIGHT_BUDGET = 280;
  let fxLightCount = 0;
  function fxLight(x, y, r, color, strength, reveal) {
    if (fxLightCount >= FX_LIGHT_BUDGET) return;
    fxLightCount++; Fx.light(x, y, r, color, strength, reveal);
  }
  function fxSeen(x, y, r, reveal) {
    if (fxLightCount >= FX_LIGHT_BUDGET) return;
    fxLightCount++; Fx.seen(x, y, r, reveal);
  }
  function fxEyeGlow(x, y) {
    if (fxLightCount >= FX_LIGHT_BUDGET) return;
    fxLightCount++; Fx.eyeGlow(x, y);
  }

  // ---------- 闇：レベルアップ・必殺の瞬間だけ一瞬開く ----------
  const DARK_BASE = 0.68, DARK_OPEN = 0.4, AMBIENT = '13,7,24';
  function currentDarkness() {
    const openness = Math.min(1, flashA / 0.85);
    return DARK_BASE - (DARK_BASE - DARK_OPEN) * openness;
  }

  // ---------- 決定的ハッシュ（地面の模様。座標→同じ絵）----------
  function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  // ---------- 入力 ----------
  const keys = Object.create(null);
  const stick = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0, dx: 0, dy: 0, maxR: 40 };
  let spaceHeld = false;
  let listeners = [];
  function on(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); listeners.push([target, ev, fn, opts]); }
  function offAll() { listeners.forEach(([t, ev, fn, opts]) => t.removeEventListener(ev, fn, opts)); listeners = []; }

  function setupInput() {
    on(window, 'keydown', (e) => {
      if (boxOpen) {   // 箱の札：Space／Enter で閉じる（開いてすぐは受けない）。長押しのくり返しは無視
        if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) { e.preventDefault(); tryCloseBox(); }
        return;
      }
      if (choiceOpen) {
        if (e.code === 'Digit1' || e.code === 'Numpad1') pickChoice(0);
        else if (e.code === 'Digit2' || e.code === 'Numpad2') pickChoice(1);
        else if (e.code === 'Digit3' || e.code === 'Numpad3') pickChoice(2);
        return;
      }
      keys[e.code] = true;
      if (e.code === 'Space') { if (!spaceHeld) tryTriggerSpecial(); spaceHeld = true; }
    });
    on(window, 'keyup', (e) => { keys[e.code] = false; if (e.code === 'Space') spaceHeld = false; });

    const appEl = elWorld.parentElement;
    on(appEl, 'pointerdown', (e) => {
      if (e.target && e.target.closest && e.target.closest('#btnSp')) return;
      if (stick.active) return;
      stick.active = true; stick.id = e.pointerId;
      stick.cx = e.clientX; stick.cy = e.clientY; stick.x = e.clientX; stick.y = e.clientY;
      const appRect = appEl.getBoundingClientRect();
      stick.maxR = Math.min(appRect.width, appRect.height) * 0.14;
    });
    on(appEl, 'pointermove', (e) => {
      if (!stick.active || e.pointerId !== stick.id) return;
      stick.x = e.clientX; stick.y = e.clientY;
      let dx = stick.x - stick.cx, dy = stick.y - stick.cy;
      const d = Math.hypot(dx, dy) || 1;
      const clamp = Math.min(d, stick.maxR) / d;
      stick.dx = (dx * clamp) / stick.maxR; stick.dy = (dy * clamp) / stick.maxR;
    });
    const endStick = (e) => { if (e.pointerId === stick.id) { stick.active = false; stick.id = null; stick.dx = 0; stick.dy = 0; } };
    on(appEl, 'pointerup', endStick);
    on(appEl, 'pointercancel', endStick);
    on(appEl, 'contextmenu', (e) => e.preventDefault());

    // 3択の札：押した指でスティックが始まらないよう、#btnSp と同じく伝播を止める
    on(elChoicePanel, 'pointerdown', (e) => { e.stopPropagation(); });
    on(elChoicePanel, 'click', (e) => {
      const card = e.target && e.target.closest && e.target.closest('.choice-card');
      if (!card || performance.now() < choiceLockUntil) return;
      pickChoice(Number(card.dataset.i));
    });

    // 箱の札：画面のどこをタップしても閉じる（押した指でスティックが始まらないよう伝播を止める）
    on(elBoxPanel, 'pointerdown', (e) => { e.stopPropagation(); });
    on(elBoxPanel, 'click', () => { tryCloseBox(); });

    on(elBtnSp, 'pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); tryTriggerSpecial(); });
  }

  function inputAxis() {
    if (cfg.auto) return botFight === true ? fightAxis() : botFight === 'stand' ? { x: 0, y: 0 } : botFight === 'rush' ? rushAxis() : { x: Math.cos(elapsed * 0.8), y: Math.sin(elapsed * 0.8) };
    let dx = 0, dy = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
    if (keys['ArrowUp'] || keys['KeyW']) dy -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) dy += 1;
    if (stick.active) { dx += stick.dx; dy += stick.dy; }
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { x: dx, y: dy };
  }

  // 調整用の自動プレイ（Run.dbg.bot(true)。?auto=1 のときだけ）：近い敵へ寄って止まり、弾はよけ、体力が減ったら離れる
  let botFight = false;   // true＝戦う／'stand'＝立ったまま／'rush'＝いちばん近い敵へ突っこむ／false＝円を描いて歩く
  function rushAxis() {
    const i = nearestEnemyIdx(); if (i < 0) return { x: 0, y: 0 };
    const e = enemies[i], dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }
  function fightAxis() {
    let ni = -1, nd = 1e9, fx = 0, fy = 0, crowd = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.active || e.dead) continue;
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (d < nd) { nd = d; ni = i; }
      const R0 = e.kind === 'boss' ? 130 : 80;
      if (d < R0) { const w = (R0 - d) / R0 / d; fx += dx * w; fy += dy * w; crowd++; }
    }
    for (let i = 0; i < eProj.length; i++) {
      const p = eProj[i]; if (!p.active) continue;
      const dx = P.x - p.x, dy = P.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < 46) { fx += (-p.vy) * 0.03 + dx / d; fy += p.vx * 0.03 + dy / d; }
    }
    const ranged = stats.atkType !== 'arc';
    const low = P.hp < maxHp * 0.4, fl = Math.hypot(fx, fy);
    if ((low || ranged || crowd >= 7) && fl > 0.05) return { x: fx / fl, y: fy / fl };
    if (ni < 0) return { x: Math.cos(elapsed * 0.8), y: Math.sin(elapsed * 0.8) };
    const e = enemies[ni], reach = (ranged ? 70 : arcRadiusNow() * 0.75) + e.r;
    if (nd > reach) { const dx = e.x - P.x, dy = e.y - P.y; return { x: dx / nd, y: dy / nd }; }
    return { x: 0, y: 0 };   // 届く距離なら止まる（止まると近い敵のほうを向く）
  }

  // ---------- プール ----------
  function makePool(n, factory) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = factory(); return a; }
  function findFree(pool) { for (let i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i]; return null; }

  const ENEMY_CAP_HARD = 240;
  let enemies = makePool(ENEMY_CAP_HARD, () => ({ active: false }));
  // 「seen」の間引き用スクラッチ（毎フレーム生成しない・使い回す）
  const seenOrder = new Array(ENEMY_CAP_HARD);
  const seenFlag = new Uint8Array(ENEMY_CAP_HARD);
  let cachedAliveN = 0;
  let pProj = makePool(90, () => ({ active: false }));   // 自分の弾（音符）
  let traps = makePool(20, () => ({ active: false }));
  let eProj = makePool(70, () => ({ active: false }));   // 敵の弾（orb / sleeporb）
  let parts = makePool(500, () => ({ active: false }));  // パーティクル（撃破・灯りの粒・雷線）
  let orbs = makePool(260, () => ({ active: false }));   // 経験値玉
  let chests = makePool(8, () => ({ active: false }));   // 宝箱
  let dmgNums = makePool(80, () => ({ active: false }));
  let banner = { t: 0, dur: 0, text: '' };
  let specialAnnounceT = 0;

  // ---------- 空間グリッド ----------
  const CELL = 32;
  function cellKey(x, y) {
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    return (gx << 16) ^ (gy & 0xffff);
  }
  function gridKey(gx, gy) { return (gx << 16) ^ (gy & 0xffff); }
  const grid = new Map();
  const activeGridBuckets = [];
  const gridBucketPool = [];
  const queryThunder = [], queryArc = [], queryProjectile = [];
  const queryContact = [], querySeparate = [], querySpecial = [];
  function clearGrid() {
    for (let i = 0; i < activeGridBuckets.length; i++) {
      const bucket = activeGridBuckets[i];
      bucket.length = 0;
      gridBucketPool.push(bucket);
    }
    activeGridBuckets.length = 0;
    grid.clear();
  }
  function buildGrid() {
    clearGrid();
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.active) continue;
      const k = cellKey(e.x, e.y);
      let bucket = grid.get(k);
      if (!bucket) {
        bucket = gridBucketPool.pop() || [];
        grid.set(k, bucket);
        activeGridBuckets.push(bucket);
      }
      bucket.push(i);
    }
  }
  function queryRadius(x, y, r, out) {
    out.length = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const arr = grid.get(gridKey(gx, gy)); if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
    }
    return out;
  }

  // ---------- ランタイム状態 ----------
  let running = false, rafId = null, last = 0;
  let elapsed = 0;         // 探索の経過秒
  let cfg = { charId: 'tomoshibi', floor: 1, stress: false, auto: false };
  let stats = null;        // Game.calcStats のキャッシュ
  let floorScale = { hp: 1, dmg: 1, reward: 1 };
  let cap = 160;
  let maxHp = 60;          // 通常は stats.hp と同じ。stress時のみ9999（回復のクランプ先はこちらを使う）

  const P = {
    x: 0, y: 0, r: 9, hp: 60, maxHp: 60, facing: { x: 0, y: 1 },
    attackT: 0, invulnT: 0, knockX: 0, knockY: 0, sp: 0, blinkOn: true,
  };
  const cam = { x: 0, y: 0 };
  let shakeMag = 0, shakeTime = 0, shakeTotal = 0;
  let hitstop = 0;
  let flashA = 0; // 全画面フラッシュの透明度(0-1)
  let fadeA = 0;  // 敗北時の暗転
  let ended = false;
  let outro = null; // {kind:'win'|'lose', t}

  // 局所（走行中のみ）レベル演出用シャドウ
  let localLv = 1, localXp = 0, localXpNeed = 18;
  let runXpTotal = 0, runSasa = 0, runKills = 0, drops = [];
  let eliteKills = 0;
  let swingCount = 0, bladeHits = 0;   // 若枝：振った回数・刃が当てた回数
  let questChipText = '';
  // 戦闘中の3択（その探索のあいだだけ有効。stats だけを書き換え、Game.state には書かない）
  let choiceQueue = 0;          // 予約された選択の数
  let choiceOpen = false;       // 札が出ている（＝戦闘は一時停止）
  let choiceLv = 1;             // 札の見出しに出すレベル
  let choiceLockUntil = 0;      // 開いた直後の誤タップ防止
  // エリートの紙の箱（拾うと戦闘を止めて札を出す。BOX は data.js）。物の計上は拾った瞬間に済ませる（ここは表示だけ）
  const boxQueue = [];          // 開く順番待ちの箱 { drop, sasa, unique }（reset で空にする）
  let boxOpen = false;          // 箱の札が出ている（＝戦闘は一時停止）
  let helpOpen = false;         // 操作の一覧が出ている（＝戦闘は一時停止。ui.js が開閉する）
  let boxItem = null;           // いま開いている箱
  let boxAge = 0, boxPrev = 0;  // 開いてからの経過ミリ秒（1フレームの進みは250msまで＝画面が隠れていた間は進めない）
  let boxSfxDone = false;       // 札が起き上がる音を鳴らしたか
  let boxHideTimer = 0;         // 閉じたあと、フェードが終わってからパネルを消すタイマー
  let forcedBox = null;         // テスト用：次の箱の中身を固定する { rarity, unique }
  let offered = [];             // いま出ている3つのid
  const boostCounts = Object.create(null);
  const offerPool = [];         // 抽選の作業用（使い回す）
  let questNoticed = false;     // 条件たっせいのバナーを出したか
  let resumeInvuln = 0;      // この探索で祓ったエリートの数（依頼書用）
  let rescued = null;

  // 必殺（キーストーン別）
  let special = { active: null, kind: null, t: 0, ringHitSet: null, beamHitSet: null, goroHitSet: null, ringR: 0, castX: 0, castY: 0, dir: { x: 0, y: 1 }, secondPending: 0, fieldT: 0 };

  // ボス
  let bossOn = false, bossDone = false, bossIdx = -1;
  let bossName = '';       // 上のバーに出す名前（門番・ボス）
  let FL = FLOORS[1];      // いまの階の表（data.js の FLOORS）

  // スポーン
  let spawnAccum = 0, eliteAccum = 0;
  let firstWaveLeft = 0, firstWaveAcc = 0;   // 開始直後の第一波

  // ---------- FPS計測 ----------
  let fpsFrames = 0, fpsAccum = 0, fps = 60;

  // ============================================================
  //  攻撃・被弾のユーティリティ
  // ============================================================
  function critRoll() { return Math.random() < stats.critCh; }

  function spawnDamageNumber(x, y, amount, crit, color) {
    const d = findFree(dmgNums); if (!d) return;
    d.active = true; d.x = x; d.y = y; d.vy = -34; d.life = 0.7; d.maxLife = 0.7;
    d.text = String(Math.round(amount)); d.crit = !!crit; d.color = color || null;
  }

  function spawnBurstParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const p = findFree(parts); if (!p) return;
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 70;
      p.active = true; p.kind = 'square'; p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.life = 0.35 + Math.random() * 0.25; p.maxLife = p.life; p.color = color; p.size = 2 + Math.random() * 2;
    }
  }

  function spawnEmber(x, y) {
    const p = findFree(parts); if (!p) return;
    p.active = true; p.kind = 'ember'; p.x = x; p.y = y;
    p.vx = (Math.random() - 0.5) * 8; p.vy = -8 - Math.random() * 10;
    p.life = 3 + Math.random() * 3; p.maxLife = p.life; p.color = PAL.light; p.size = 1 + Math.random() * 1.4;
    p.sway = Math.random() * Math.PI * 2;
  }

  function spawnLightning(x1, y1, x2, y2) {
    const p = findFree(parts); if (!p) return;
    p.active = true; p.kind = 'bolt'; p.x = x1; p.y = y1; p.x2 = x2; p.y2 = y2;
    p.life = 0.12; p.maxLife = 0.12; p.color = ELEMENTS.thunder.color;
  }

  function triggerHitstop(sec) { hitstop = Math.max(hitstop, sec); }
  function triggerShake(mag, sec) { shakeMag = Math.max(shakeMag, mag); shakeTime = Math.max(shakeTime, sec); shakeTotal = Math.max(shakeTotal, sec); }
  function triggerFlash(a) { flashA = Math.max(flashA, a); }

  // 敵に一発ダメージを与える共通処理（arc/homing/必殺すべてここを通す）
  function hitEnemy(idx, baseDmg, srcX, srcY, opts) {
    opts = opts || {};
    const e = enemies[idx]; if (!e || !e.active || e.dead) return null;
    const crit = opts.forceCrit || critRoll();
    const dmg = baseDmg * (crit ? FEEL.critMul : 1);
    e.hp -= dmg;
    e.flashFrames = 2;
    spawnDamageNumber(e.x, e.y - e.r - 2, dmg, crit);
    if (!opts.noKnock) {
      const dx = e.x - srcX, dy = e.y - srcY; const d = Math.hypot(dx, dy) || 1;
      e.knockX = (dx / d) * FEEL.knockEnemy; e.knockY = (dy / d) * FEEL.knockEnemy; e.knockT = 0.22;
    }
    if (!opts.silent) { sp_gain(BALANCE.special.gainOrb); }
    if (!opts.noElement && stats.element) applyElement(idx, e, dmg);
    if (e.hp <= 0 && !e.dead) killEnemy(idx);
    return { dmg, crit };
  }

  function applyElement(idx, e, dmg) {
    const el = stats.element;
    if (el === 'fire') { e.burnT = FEEL.burnDur; }
    else if (el === 'ice') { e.slowT = FEEL.iceSlowDur; e.slowMul = FEEL.iceSlowMul; }
    else if (el === 'thunder') {
      const near = queryRadius(e.x, e.y, FEEL.thunderChainR, queryThunder);
      for (let i = 0; i < near.length; i++) {
        const oi = near[i]; if (oi === idx) continue;
        const o = enemies[oi]; if (!o || !o.active || o.dead) continue;
        spawnLightning(e.x, e.y, o.x, o.y);
        hitEnemy(oi, dmg * FEEL.thunderChainMul, e.x, e.y, { noElement: true, silent: true });
        break;
      }
    } else if (el === 'sprout') {
      P.hp = Math.min(maxHp, P.hp + dmg * FEEL.sproutHealMul);
    }
  }

  function sp_gain(v) { P.sp = Math.min(100, P.sp + v * (stats.spGainMul || 1)); }

  // 依頼書：第2階・ともしび・未達成・?base=1 でない探索だけ
  function questActive() {
    const QD = QUESTS.wakaeda;
    return !cfg.base && cfg.floor === QD.floor && cfg.charId === QD.charId && !Game.state.quests.wakaeda.done;
  }

  function killEnemy(idx) {
    const e = enemies[idx]; if (e.dead) return; e.dead = true;
    Game.sfx(e.elite ? 'killElite' : 'kill');
    spawnBurstParticles(e.x, e.y, e.color || '#FFFFFF', 6);
    spawnEmber(e.x, e.y);
    runKills++;
    sp_gain(e.elite || e.kind === 'boss' ? BALANCE.special.gainElite : BALANCE.special.gainKill);
    // 経験値玉ドロップ（拾うまでは加算されない）
    const o = findFree(orbs);
    if (o) { o.active = true; o.x = e.x; o.y = e.y; o.value = e.xp * FL.xpMul; o.vx = 0; o.vy = 0; }
    // 笹（即時判定。エリート/ボスは確定）
    if (e.kind === 'boss' || e.gate) { runSasa += e.sasaFlat; }   // 門番は箱を出さない（祓うと階をぬける）
    else if (e.elite) { runSasa += e.sasaFlat; spawnChest(e.x, e.y, questActive() && eliteKills + 1 === QUESTS.wakaeda.eliteTarget); }   // 依頼の5体目（eliteKills++ はこのあと）の箱だけユニーク
    else if (Math.random() < e.sasaCh) { runSasa += 1; spawnBurstParticles(e.x, e.y, PAL.rarity.SSR, 3); }
    if (e.elite && !e.gate) {
      triggerHitstop(FEEL.hitstopElite); eliteKills++;
      if (questActive() && eliteKills === QUESTS.wakaeda.eliteTarget && !questNoticed) {
        questNoticed = true; banner.text = TEXTS.quest.banner; banner.t = 3; banner.dur = 3;   // 止めない
        Game.log('quest', { what: 'condition' });
      }
    }
    if (e.kind === 'boss' || e.gate) { onBossDown(); }
    e.active = false;
  }

  function spawnChest(x, y, unique) {
    const c = findFree(chests); if (!c) return;
    c.active = true; c.x = x; c.y = y; c.unique = !!unique;
  }

  function rollDrop(forceRarity) {
    // 本物の防具アイテムを生成する（合格ゲート版：お守り1枠。Game側が保存し次の探索へ持ち越す）。forceRarity はテスト用
    const r = Math.random();
    const rarity = forceRarity || (r < ARMOR.rarityCh.UR ? 'UR' : r < ARMOR.rarityCh.UR + ARMOR.rarityCh.SSR ? 'SSR' : 'SR');
    const type = ARMOR.types[Math.floor(Math.random() * ARMOR.types.length)];
    const [lo, hi] = ARMOR.val[rarity];
    const val = lo + Math.floor(Math.random() * (hi - lo + 1));
    return { kind: 'armor', typeId: type.id, name: type.name, rarity, val, stat: type.stat + '+' + val + '%' };
  }

  // ============================================================
  //  スポーン
  // ============================================================
  function unlockedKinds() {
    return FL.kinds;   // 階ごとに決まっている（data.js の FLOORS）
  }

  function aliveCount() { let n = 0; for (let i = 0; i < enemies.length; i++) if (enemies[i].active) n++; return n; }

  // 見えている地面の端までの距離（プレイヤーから）。描く側が知らせる。2Dは logW/logH、3Dは render3d.js が resize で計算する
  const viewFrame = { left: 160, right: 160, top: 320, bottom: 320 };
  function setViewFrame(f) { viewFrame.left = f.left; viewFrame.right = f.right; viewFrame.top = f.top; viewFrame.bottom = f.bottom; }

  // 湧く位置：見える範囲を spawnMargin だけ外へ広げた長方形の「ふち」の上のランダムな点（辺の長さに比例）。奥は上限で止める
  function ringSpawnPos() {
    const m = WORLD.spawnMargin, L = viewFrame.left + m, R = viewFrame.right + m, T = Math.min(viewFrame.top, WORLD.spawnTopMax) + m, B = viewFrame.bottom + m;
    const wTop = L + R, hSide = T + B, total = 2 * wTop + 2 * hSide;
    let x = 0, y = 0;
    for (let k = 0; k < 10; k++) {   // 通れない地形の中なら引き直す
      let u = Math.random() * total;
      if (u < wTop) { x = -L + u; y = -T; }
      else if (u < 2 * wTop) { x = -L + (u - wTop); y = B; }
      else if (u < 2 * wTop + hSide) { x = -L; y = -T + (u - 2 * wTop); }
      else { x = R; y = -T + (u - 2 * wTop - hSide); }
      if (!World.isBlocked(P.x + x, P.y + y, 12)) break;
    }
    return { x: P.x + x, y: P.y + y };
  }

  function spawnEnemy(kind, x, y, elite) {
    const slot = findFree(enemies); if (!slot) return null;
    const base = BALANCE.enemies[kind];
    const fs = floorScale;
    const sizeMul = elite ? BALANCE.enemies.elite.sizeMul : 1;
    Object.assign(slot, {
      active: true, dead: false, kind, elite: !!elite,
      x, y, vx: 0, vy: 0, born: elapsed,   // born：3Dの「ふわっと出る」描画だけが読む
      r: base.r * sizeMul,
      hp: base.hp * fs.hp * (elite ? BALANCE.enemies.elite.hpMul : 1) * (cfg.stress ? BALANCE.spawn.stressHpMul : 1),
      maxHp: base.hp * fs.hp * (elite ? BALANCE.enemies.elite.hpMul : 1) * (cfg.stress ? BALANCE.spawn.stressHpMul : 1),
      dmg: base.dmg * fs.dmg * (elite ? BALANCE.enemies.elite.dmgMul : 1),
      speed: base.speed || 0,
      xp: elite ? BALANCE.enemies.elite.xp : base.xp,
      sasaCh: base.sasaCh || 0, sasaFlat: elite ? BALANCE.enemies.elite.sasa : 0,
      color: PAL[kind] || PAL.ori,
      flashFrames: 0, knockX: 0, knockY: 0, knockT: 0,
      burnT: 0, slowT: 0, slowMul: 1,
      state: kind === 'tosshin' ? 'approach' : (kind === 'hakite' ? 'keep' : 'chase'),
      pud: false, slideT: 0, slideX: 0, slideY: 0, stateT: 0, chargeDirX: 0, chargeDirY: 0, fireT: 1 + Math.random() * 1.5,
      gate: false, bossId: null, phase2: false, volleyN: 0,
    });
    if (elite) Game.sfx('elite');
    return slot;
  }

  function spawnBoss() {
    const p = ringSpawnPos();
    const B = FL.boss, G = FL.gate;
    const slot = spawnEnemy(B ? 'boss' : G.kind, p.x, p.y, !B);
    if (!slot) return;
    if (B) {   // 堕ちたなかま
      const base = BALANCE.enemies.boss, fs = floorScale;
      slot.hp = B.hp; slot.maxHp = slot.hp; slot.dmg = base.dmg * fs.dmg;
      slot.chargeDmg = base.chargeDmg * fs.dmg;
      slot.xp = base.xp; slot.sasaFlat = base.sasa;
      slot.state = 'chase'; slot.stateT = FEEL.bossChaseT; slot.volleyT = FEEL.bossVolleyInterval;
      slot.bossId = B.id;
    } else {   // 門番：その階の澱の大きいもの（エリートの金の輪を使う）
      slot.gate = true; slot.hp = G.hp; slot.maxHp = G.hp; slot.r *= GATE.sizeMul;
      slot.dmg = BALANCE.enemies[G.kind].dmg * floorScale.dmg * GATE.dmgMul;   // 門番の一撃はエリート（2倍）より軽く
      slot.xp = GATE.xp; slot.sasaFlat = GATE.sasa;
    }
    bossIdx = enemies.indexOf(slot);
    bossName = B ? B.name : G.name;
    banner.text = B ? B.warn : GATE.warn(G.name); banner.t = 3; banner.dur = 3;
    Game.sfx('boss');
    bossOn = true;
  }
  const TEXTS_BOSS_WARN = '堕ちたなかまが目を覚ました…';

  function updateSpawn(dt) {
    if (!bossOn && !bossDone && elapsed >= FL.dur) { spawnBoss(); return; }
    // 開始直後の第一波：澱を上のふちに均等に並べ、0.15秒おきに湧かせる
    if (firstWaveLeft > 0) {
      firstWaveAcc += dt;
      const FW = WORLD.firstWave;
      while (firstWaveAcc >= FW.every && firstWaveLeft > 0) {
        firstWaveAcc -= FW.every;
        const k = FW.n - firstWaveLeft--, half = viewFrame.left * 0.9;
        spawnEnemy('ori', P.x - half + (2 * half) * (k + 0.5) / FW.n, P.y - FW.dist, false);
      }
    }
    const rateMul = bossOn ? 0.5 : 1;
    const sb = FL.base || BALANCE.spawn.base;
    const rate = (sb + (FL.peak - sb) * Math.min(1, elapsed / FL.dur)) * rateMul;   // 階の終わりに向けて増える
    spawnAccum += rate * dt;
    while (spawnAccum >= 1) {
      spawnAccum -= 1;
      if (aliveCount() < cap) {
        const kinds = unlockedKinds();
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const p = ringSpawnPos();
        spawnEnemy(kind, p.x, p.y, false);
      }
    }
    eliteAccum += dt;
    if (eliteAccum >= FL.eliteEvery) {
      eliteAccum -= FL.eliteEvery;
      if (aliveCount() < cap) {
        const kinds = unlockedKinds();
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const p = ringSpawnPos();
        spawnEnemy(kind, p.x, p.y, true);
      }
    }
  }

  // ============================================================
  //  敵AI
  // ============================================================
  function seek(e, dt, speed) {
    const dx = P.x - e.x, dy = P.y - e.y; const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * speed * dt; e.y += (dy / d) * speed * dt;
  }

  function updateEnemyAI(e, i, dt) {
    const spdMul = (e.slowT > 0 ? e.slowMul : 1) * (e.pud ? WORLD.puddleSlow : 1);   // 水たまりの中は遅い（眠り弾などの鈍足とは掛け算）
    switch (e.kind) {
      case 'ori': seek(e, dt, e.speed * spdMul); break;
      case 'kumo': {
        const dx = P.x - e.x, dy = P.y - e.y; const d = Math.hypot(dx, dy) || 1;
        const nx = -dy / d, ny = dx / d;
        const wob = Math.sin(elapsed * 3 + i) * 0.6;
        e.x += ((dx / d) * 0.7 + nx * wob) * e.speed * spdMul * dt;
        e.y += ((dy / d) * 0.7 + ny * wob) * e.speed * spdMul * dt;
        break;
      }
      case 'tosshin': {
        e.stateT -= dt;
        if (e.state === 'approach') {
          const d = Math.hypot(P.x - e.x, P.y - e.y);
          if (d <= FEEL.tosshinApproachStopR) { e.state = 'telegraph'; e.stateT = FEEL.tosshinTelegraphT; }
          else seek(e, dt, e.speed * spdMul);
        } else if (e.state === 'telegraph') {
          if (e.stateT <= 0) {
            const dx = P.x - e.x, dy = P.y - e.y; const d = Math.hypot(dx, dy) || 1;
            e.chargeDirX = dx / d; e.chargeDirY = dy / d;
            e.state = 'charge'; e.stateT = FEEL.tosshinChargeT; Game.sfx('charge');
          }
        } else if (e.state === 'charge') {
          e.x += e.chargeDirX * BALANCE.enemies.tosshin.chargeSpeed * spdMul * dt;
          e.y += e.chargeDirY * BALANCE.enemies.tosshin.chargeSpeed * spdMul * dt;
          if (e.stateT <= 0) { e.state = 'rest'; e.stateT = FEEL.tosshinRestT; }
        } else if (e.state === 'rest') {
          if (e.stateT <= 0) { e.state = 'approach'; }
        }
        break;
      }
      case 'hakite': {
        const dx = P.x - e.x, dy = P.y - e.y; const d = Math.hypot(dx, dy) || 1;
        const rangeDef = BALANCE.enemies.hakite.range;
        if (d > rangeDef + 10) seek(e, dt, e.speed * spdMul);
        else if (d < rangeDef - 10) { e.x -= (dx / d) * e.speed * spdMul * dt; e.y -= (dy / d) * e.speed * spdMul * dt; }
        e.fireT -= dt;
        if (e.fireT <= 0) {
          e.fireT = 2.5;
          fireEnemyProjectile(e.x, e.y, dx / d, dy / d, BALANCE.enemies.hakite.orbSpeed, e.dmg > 0 ? e.dmg : BALANCE.enemies.hakite.orbDmg * floorScale.dmg, 'orb', false);
        }
        break;
      }
      case 'boss': updateBoss(e, dt); break;
    }
    // 燃焼・鈍足タイマー
    if (e.burnT > 0) { e.hp -= FEEL.burnDmgPerSec * dt; e.burnT -= dt; if (e.hp <= 0 && !e.dead) killEnemy(i); }
    if (e.slowT > 0) e.slowT -= dt;
    // ノックバック減衰
    if (e.knockT > 0) {
      e.x += e.knockX * dt; e.y += e.knockY * dt;
      const decay = Math.max(0, 1 - dt * 6); e.knockX *= decay; e.knockY *= decay; e.knockT -= dt;
    }
    if (e.flashFrames > 0) e.flashFrames--;
  }

  function updateBoss(e, dt) {
    e.stateT -= dt; e.volleyT -= dt;
    const moon = e.bossId === 'otsukisama';
    if (moon && !e.phase2 && e.hp <= e.maxHp * 0.5) {
      e.phase2 = true; banner.text = FL.boss.half; banner.t = 3; banner.dur = 3; Game.sfx('boss');
    }
    if (e.volleyT <= 0) {
      e.volleyT = FEEL.bossVolleyInterval * (moon ? (e.phase2 ? 0.5 : 0.7) : 1);
      const n = moon ? 12 : 10, off = moon ? (e.volleyN++) * 0.26 : 0;
      for (let k = 0; k < n; k++) {
        const a = off + (k / n) * Math.PI * 2;
        fireEnemyProjectile(e.x, e.y, Math.cos(a), Math.sin(a), FEEL.sleeporbSpeed, FEEL.sleeporbDmg, 'sleeporb', true);
      }
    }
    if (e.state === 'chase') {
      seek(e, dt, FEEL.bossChaseSpeed * (e.pud ? WORLD.puddleSlow : 1));
      if (e.stateT <= 0) { e.state = 'telegraph'; e.stateT = FEEL.bossTelegraphT; }
    } else if (e.state === 'telegraph') {
      if (e.stateT <= 0) {
        const dx = P.x - e.x, dy = P.y - e.y; const d = Math.hypot(dx, dy) || 1;
        e.chargeDirX = dx / d; e.chargeDirY = dy / d;
        e.state = 'charge'; e.stateT = FEEL.bossChargeT; Game.sfx('charge');
      }
    } else if (e.state === 'charge') {
      e.x += e.chargeDirX * FEEL.bossChargeSpeed * dt; e.y += e.chargeDirY * FEEL.bossChargeSpeed * dt;
      if (e.stateT <= 0) { e.state = 'tired'; e.stateT = FEEL.bossTiredT; }
    } else if (e.state === 'tired') {
      if (e.stateT <= 0) { e.state = 'chase'; e.stateT = FEEL.bossChaseT * (e.phase2 ? 0.4 : 1); }
    }
  }

  function onBossDown() {
    bossOn = false; bossDone = true; rescued = FL.boss ? FL.boss.rescue : null;
    triggerHitstop(0.1); triggerFlash(0.9); triggerShake(FEEL.shakeMax, 0.15);
    const b = enemies[bossIdx];
    spawnBurstParticles(b ? b.x : P.x, b ? b.y : P.y, PAL.lightHi, 24);
    outro = { kind: 'win', t: FEEL.victoryDelay };
  }

  // ---------- 敵弾 ----------
  function fireEnemyProjectile(x, y, dx, dy, speed, dmg, kind, slow) {
    const p = findFree(eProj); if (!p) return;
    p.active = true; p.x = x; p.y = y; p.vx = dx * speed; p.vy = dy * speed;
    p.dmg = dmg; p.kind = kind; p.slow = !!slow; p.life = FEEL.hakiteOrbLife;
  }

  // ============================================================
  //  プレイヤー：移動・自動攻撃
  // ============================================================
  function updatePlayer(dt) {
    const axis = inputAxis();
    const tutorialMove = Math.hypot(axis.x, axis.y) > 0.05;
    if (tutorialMove && window.Game && Game.advanceTutorial) Game.advanceTutorial(1);
    if (Math.hypot(axis.x, axis.y) > 0.05) {
      P.facing.x = axis.x; P.facing.y = axis.y;
      // 歩きながらでも、攻撃の届く所に敵がいればそちらへ振る（逃げながらの空振りをなくす。2026-11-11）
      const near = nearestEnemyIdx();
      if (near >= 0) {
        const e = enemies[near]; const dx = e.x - P.x, dy = e.y - P.y; const d = Math.hypot(dx, dy) || 1;
        if (d <= arcRadiusNow() + e.r + BALANCE.player.aimPad) { P.facing.x = dx / d; P.facing.y = dy / d; }
      }
    } else {
      // 静止中は最寄りの敵を自動で向く
      const near = nearestEnemyIdx();
      if (near >= 0) {
        const e = enemies[near]; const dx = e.x - P.x, dy = e.y - P.y; const d = Math.hypot(dx, dy) || 1;
        P.facing.x = dx / d; P.facing.y = dy / d;
      }
    }
    let kx = 0, ky = 0;
    if (P.knockT > 0) { kx = P.knockX; ky = P.knockY; P.knockX *= Math.max(0, 1 - dt * FEEL.knockDecay); P.knockY *= Math.max(0, 1 - dt * FEEL.knockDecay); P.knockT -= dt; }
    // 眠り弾の鈍足を反映（2026-08-01 Codexレビュー指摘#3で発覚した未適用バグの修正）
    const moveSpd = stats.speed * (P.slowT > 0 ? P.slowMul : 1) * (P.pud ? WORLD.puddleSlow : 1);
    P.x += axis.x * moveSpd * dt + kx * dt;
    P.y += axis.y * moveSpd * dt + ky * dt;
    World.collide(P, WORLD.playerSolidR); P.pud = World.inPuddleLast;   // 岩・柱・壁の外へ押し出す（壁に沿って滑る）。半径は絵の幅に合わせる（P.r は敵との当たり用）

    if (P.invulnT > 0) P.invulnT -= dt;
    P.blinkOn = P.invulnT <= 0 || Math.floor(elapsed * 10) % 2 === 0;

    if (stats.regen > 0) P.hp = Math.min(maxHp, P.hp + stats.regen * dt);

    // 通常攻撃
    P.attackT -= dt;
    if (P.attackT <= 0) {
      P.attackT = stats.interval * stats.intervalMul;
      if (stats.atkType === 'arc') doArcAttack();
      else if (stats.atkType === 'homing') doHomingAttack();
      else if (stats.atkType === 'trap') doTrapAttack();
    }
    if (allies.length) updateAllies(dt);

    // auto:true はゲージ満タンで自動必殺
    if (cfg.auto && P.sp >= 100) tryTriggerSpecial();
  }

  function nearestEnemyIdx() {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.active) continue;
      const d = (e.x - P.x) * (e.x - P.x) + (e.y - P.y) * (e.y - P.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ユニーク武器『枯れずの若枝』：半径×1.25・角度+40度。刃は三振りごと
  function arcRadiusNow() { return FEEL.arcRadius * stats.rangeMul * (stats.unique ? QUESTS.wakaeda.radiusMul : 1); }
  function arcAngleNow() { return FEEL.arcAngle + (stats.unique ? (QUESTS.wakaeda.angleAddDeg * Math.PI) / 180 : 0); }
  function arcColorNow() { return stats.element ? ELEMENTS[stats.element].color : (stats.unique ? QUESTS.wakaeda.color : PAL.light); }

  function fireBlade() {
    const p = findFree(pProj); if (!p) return;
    const QD = QUESTS.wakaeda;
    const d = Math.hypot(P.facing.x, P.facing.y) || 1;
    p.active = true; p.blade = true; p.x = P.x; p.y = P.y;
    p.vx = (P.facing.x / d) * QD.bladeSpeed; p.vy = (P.facing.y / d) * QD.bladeSpeed;
    p.target = -1; p.life = QD.bladeLife; p.dmg = stats.atk * QD.bladePower; p.ally = false;
    if (!p.hits) p.hits = new Set(); else p.hits.clear();   // 当たった敵の記録（貫通用）
  }

  function doArcAttack() {
    const radius = arcRadiusNow(), arcAngle = arcAngleNow();
    if (stats.unique && ++swingCount % QUESTS.wakaeda.bladeEvery === 0) fireBlade();
    const cand = queryRadius(P.x, P.y, radius, queryArc);
    const facingAng = Math.atan2(P.facing.y, P.facing.x);
    let hitAny = false;
    for (let k = 0; k < cand.length; k++) {
      const i = cand[k]; const e = enemies[i]; if (!e.active || e.dead) continue;
      const dx = e.x - P.x, dy = e.y - P.y; const d = Math.hypot(dx, dy);
      if (d > radius + e.r) continue;
      let ang = Math.atan2(dy, dx) - facingAng;
      while (ang > Math.PI) ang -= Math.PI * 2; while (ang < -Math.PI) ang += Math.PI * 2;
      if (Math.abs(ang) > arcAngle / 2) continue;
      hitEnemy(i, stats.atk, P.x, P.y); hitAny = true;
    }
    spawnArcFx();
    if (hitAny) {
      if (window.Game && Game.advanceTutorial) Game.advanceTutorial(2);
      sfxHit();
    }
  }

  function sfxHit() { Game.sfx('hit'); }   // 最短間隔 0.05 秒は Audio3 の minGap が見る

  let arcFx = []; // {t, dur, ang}
  function spawnArcFx() {
    const ang = Math.atan2(P.facing.y, P.facing.x);
    arcFx.push({ t: 0, dur: 0.16, ang });
  }

  function doHomingAttack() {
    const n = stats.projN + (stats.projBonus || 0);
    const targetIdx = nearestEnemyIdx();
    for (let i = 0; i < n; i++) {
      const p = findFree(pProj); if (!p) break;
      let dx = P.facing.x, dy = P.facing.y;
      if (targetIdx >= 0) { const e = enemies[targetIdx]; const ddx = e.x - P.x, ddy = e.y - P.y; const d = Math.hypot(ddx, ddy) || 1; dx = ddx / d; dy = ddy / d; }
      const spread = (i - (n - 1) / 2) * 0.18;
      const ang = Math.atan2(dy, dx) + spread;
      p.active = true; p.x = P.x; p.y = P.y;
      p.vx = Math.cos(ang) * FEEL.noteSpeed; p.vy = Math.sin(ang) * FEEL.noteSpeed;
      p.target = targetIdx; p.life = FEEL.noteLife; p.blade = false; p.ally = false; p.dmg = 0;
    }
  }

  function doTrapAttack() {
    const n = 1 + stats.projBonus;
    for (let i = 0; i < n; i++) {
      const t = findFree(traps); if (!t) return;
      // 2個目以降は向きに対して直角に±14pxずつずらす（1個のときは従来と同じ位置）
      const off = i === 0 ? 0 : (i % 2 ? 1 : -1) * 14 * Math.ceil(i / 2);
      t.active = true; t.x = P.x + P.facing.x * 18 - P.facing.y * off; t.y = P.y + P.facing.y * 18 + P.facing.x * off;
      t.life = 4.5; t.r = 30 * stats.rangeMul; t.dmg = 0;
    }
  }

  function updateTraps(dt) {
    for (let i = 0; i < traps.length; i++) {
      const t = traps[i]; if (!t.active) continue;
      t.life -= dt; let det = t.life <= 0;
      for (let j = 0; j < enemies.length && !det; j++) { const e = enemies[j]; if (e.active && !e.dead && Math.hypot(e.x - t.x, e.y - t.y) < t.r + e.r) det = true; }
      if (det) {
        const cand = queryRadius(t.x, t.y, t.r, querySpecial);
        let hitAny = false;
        for (let k = 0; k < cand.length; k++) {
          const e = enemies[cand[k]];
          if (!e || !e.active || e.dead) continue;
          hitEnemy(cand[k], t.dmg || stats.atk * 1.8, t.x, t.y); hitAny = true;
        }
        if (hitAny && window.Game && Game.advanceTutorial) Game.advanceTutorial(2);
        t.active = false;
      }
    }
  }

  function updatePlayerProjectiles(dt) {
    for (let i = 0; i < pProj.length; i++) {
      const p = pProj[i]; if (!p.active) continue;
      p.life -= dt; if (p.life <= 0) { p.active = false; p.blade = false; continue; }
      if (p.blade) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        const bc = queryRadius(p.x, p.y, 16, queryProjectile);
        for (let k = 0; k < bc.length; k++) {
          const ei = bc[k]; const e = enemies[ei]; if (!e.active || e.dead || p.hits.has(ei)) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) <= e.r + 8) { p.hits.add(ei); if (!p.ally) bladeHits++; hitEnemy(ei, p.dmg, p.x, p.y); sfxHit(); }
        }
        continue;
      }
      if (p.target >= 0 && enemies[p.target] && enemies[p.target].active && !enemies[p.target].dead) {
        const e = enemies[p.target];
        const desiredAng = Math.atan2(e.y - p.y, e.x - p.x);
        const curAng = Math.atan2(p.vy, p.vx);
        let diff = desiredAng - curAng; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = FEEL.noteTurn * dt;
        const newAng = curAng + Math.max(-maxTurn, Math.min(maxTurn, diff));
        const spd = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(newAng) * spd; p.vy = Math.sin(newAng) * spd;
      } else { p.target = nearestEnemyIdx(); }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const cand = queryRadius(p.x, p.y, 6, queryProjectile);
      for (let k = 0; k < cand.length; k++) {
        const ei = cand[k]; const e = enemies[ei]; if (!e.active || e.dead) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= e.r + 4) { hitEnemy(ei, p.dmg || stats.atk, p.x, p.y); if (window.Game && Game.advanceTutorial) Game.advanceTutorial(2); sfxHit(); p.active = false; break; }
      }
    }
  }

  function updateEnemyProjectiles(dt) {
    for (let i = 0; i < eProj.length; i++) {
      const p = eProj[i]; if (!p.active) continue;
      p.life -= dt; if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.hypot(p.x - P.x, p.y - P.y) <= P.r + 3) {
        p.active = false;
        damagePlayer(p.dmg, p.x, p.y);
        if (p.slow) { P.slowT = FEEL.sleeporbSlowT; P.slowMul = FEEL.sleeporbSlowMul; }
      }
    }
  }

  function damagePlayer(dmg, srcX, srcY) {
    if (P.invulnT > 0 || (outro)) return;
    P.hp -= dmg * stats.dmgTakenMul;
    P.invulnT = Math.max(P.invulnT, BALANCE.player.iframe);
    const dx = P.x - srcX, dy = P.y - srcY; const d = Math.hypot(dx, dy) || 1;
    P.knockX = (dx / d) * FEEL.knockPlayer; P.knockY = (dy / d) * FEEL.knockPlayer; P.knockT = 0.18;
    Game.sfx('hurt'); triggerShake(FEEL.shakeHurt, 0.12);
    if (P.hp <= 0) { P.hp = 0; if (!outro) outro = { kind: 'lose', t: FEEL.loseFadeT }; }
  }

  // ---------- 敵の接触ダメージ ----------
  function updateContactDamage() {
    if (P.invulnT > 0 || outro) return;
    const cand = queryRadius(P.x, P.y, 40, queryContact);
    for (let k = 0; k < cand.length; k++) {
      const i = cand[k]; const e = enemies[i]; if (!e.active || e.dead) continue;
      const dmg = (e.kind === 'boss' && e.state === 'charge') ? e.chargeDmg : e.dmg;
      if (dmg <= 0) continue;
      if (Math.hypot(e.x - P.x, e.y - P.y) <= e.r + P.r) { damagePlayer(dmg, e.x, e.y); break; }
    }
  }

  // 敵同士のやわらかい押し合い（団子防止）
  function separateEnemies() {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.active) continue;
      const cand = queryRadius(e.x, e.y, e.r * 3, querySeparate);
      for (let k = 0; k < cand.length; k++) {
        const j = cand[k]; if (j <= i) continue;
        const o = enemies[j]; if (!o.active) continue;
        const dx = o.x - e.x, dy = o.y - e.y; const d = Math.hypot(dx, dy) || 0.01;
        const minD = (e.r + o.r) * 0.86;
        if (d < minD) { const push = (minD - d) * 0.5; const nx = dx / d, ny = dy / d; e.x -= nx * push * 0.5; e.y -= ny * push * 0.5; o.x += nx * push * 0.5; o.y += ny * push * 0.5; }
      }
    }
  }

  // 敵を岩・柱・壁の外へ押し出し、水たまりの中かを覚える。突進は壁に当たったら止まる
  function applyTerrain(dt) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.active) continue;
      const moved = World.collide(e, e.r); e.pud = World.inPuddleLast;
      if (moved && e.state === 'charge') {
        if (e.kind === 'boss') { e.state = 'tired'; e.stateT = FEEL.bossTiredT; }
        else if (e.kind === 'tosshin') { e.state = 'rest'; e.stateT = FEEL.tosshinRestT; }
      } else if (e.state === 'chase' || e.state === 'approach' || e.state === 'keep') {
        slideAround(e, moved ? World.lastHit : null, dt);
      }
    }
  }

  // プレイヤーとの間の岩・柱・壁に止められた敵を、ふちに沿って回り込ませる（2026-10-22 自己点検：石垣の裏の敵が15秒で数十pxしか動けなかった）
  // 向きは一度決めたら、ふちを離れて WORLD.slideHold 秒たつまで変えない（行ったり来たりしないため）
  function slideAround(e, it, dt) {
    if (it) {
      let nx, ny;   // 物から敵への向き
      if (it.hw !== undefined) { nx = e.x - Math.max(it.x - it.hw, Math.min(e.x, it.x + it.hw)); ny = e.y - Math.max(it.y - it.hh, Math.min(e.y, it.y + it.hh)); }
      else { nx = e.x - it.x; ny = e.y - it.y; }
      if (nx * (P.x - e.x) + ny * (P.y - e.y) < 0) {   // 物がプレイヤーとの間にある
        if (e.slideT <= 0) {
          if (it.hw !== undefined) {   // 石垣：当たった面に沿って、角を回ってプレイヤーまでの道のりが短いほうへ
            if (Math.abs(e.x - it.x) - it.hw > Math.abs(e.y - it.y) - it.hh) {   // 左右の面 → 上下どちらの角へ
              const yA = it.y - it.hh - e.r, yB = it.y + it.hh + e.r;
              const cA = Math.abs(e.y - yA) + Math.hypot(P.x - e.x, P.y - yA), cB = Math.abs(e.y - yB) + Math.hypot(P.x - e.x, P.y - yB);
              e.slideX = 0; e.slideY = cA <= cB ? -1 : 1;
            } else {   // 上下の面 → 左右どちらの角へ
              const xA = it.x - it.hw - e.r, xB = it.x + it.hw + e.r;
              const cA = Math.abs(e.x - xA) + Math.hypot(P.x - xA, P.y - e.y), cB = Math.abs(e.x - xB) + Math.hypot(P.x - xB, P.y - e.y);
              e.slideX = cA <= cB ? -1 : 1; e.slideY = 0;
            }
          } else {   // 岩・柱：まわりを、プレイヤーに近づくほうへ
            const d = Math.hypot(nx, ny) || 1;
            e.slideX = -ny / d; e.slideY = nx / d;
            if (e.slideX * (P.x - e.x) + e.slideY * (P.y - e.y) < 0) { e.slideX = -e.slideX; e.slideY = -e.slideY; }
          }
        }
        e.slideT = WORLD.slideHold;
      }
    }
    if (e.slideT <= 0) return;
    e.slideT -= dt;
    const sp = (e.kind === 'boss' ? FEEL.bossChaseSpeed : e.speed) * (e.slowT > 0 ? e.slowMul : 1) * (e.pud ? WORLD.puddleSlow : 1) * dt;
    e.x += e.slideX * sp; e.y += e.slideY * sp;
  }

  // ============================================================
  //  必殺技
  // ============================================================
  function tryTriggerSpecial() {
    if (outro || choiceOpen || boxOpen) return;
    if (P.sp < 100) return;
    const tutorialSpecial = true; if (tutorialSpecial && window.Game && Game.advanceTutorial) Game.advanceTutorial(3);
    P.sp = 0;
    Game.sfx('special'); triggerHitstop(FEEL.hitstopSpecial); triggerShake(FEEL.shakeSpecial, 0.14); triggerFlash(0.5);
    // 企画書§4-1「発動中は無敵」を全必殺に適用（2026-08-01 Codexレビュー指摘#3の修正。
    // 結界は5秒持続のため常時無敵にはせず、発動の1秒だけ＝輪と同じ扱いにする）
    P.invulnT = Math.max(P.invulnT, 1.0);
    showSpecialAnnounce();
    const ks = stats.keystone;
    if (stats.atkType === 'arc') { if (stats.keystone === 'p') { startRingBeam(); special.kind = 'tomoshibiWave'; } else startTomoshibiWave(); return; }
    if (stats.atkType === 'homing') { startOnpuChorus(); return; }
    if (stats.atkType === 'trap') { startGoroSpecial(); return; }
    if (ks === 'p') startRingBeam();
    else if (ks === 's') startRing(); // 二重の輪：1発目
    else if (ks === 'l') startField();
    else startRing();
    if (ks === 's') special.secondPending = 0.25;
  }

  function showSpecialAnnounce() {
    let name = '灯りの波';
    let kind = 'tomoshibiWave';
    if (stats.atkType === 'homing') { name = '大合唱'; kind = 'onpuChorus'; }
    else if (stats.atkType === 'trap') { name = '大まり'; kind = 'goroBall'; }
    specialAnnounceT = 1.1;
    if (elSpecialAnnounce) {
      elSpecialAnnounce.textContent = '必殺！ ' + name;
      elSpecialAnnounce.dataset.kind = kind;
      elSpecialAnnounce.style.display = 'block';
    }
  }

  function startTomoshibiWave() { special.active = 'wave'; special.kind = 'tomoshibiWave'; special.t = 0; special.castX = P.x; special.castY = P.y; special.dir = { x: P.facing.x, y: P.facing.y }; }
  function startOnpuChorus() { special.active = 'chorus'; special.kind = 'onpuChorus'; special.t = 0; special.castX = P.x; special.castY = P.y; special.ringHitSet = new Set(); }
  function startGoroSpecial() { special.active = 'goro'; special.kind = 'goroBall'; special.t = 0; special.castX = P.x; special.castY = P.y; special.goroHitSet = new Set(); }

  function startRing() {
    // 無敵はtryTriggerSpecial()で一括付与（ここで重ねると二重の輪の2発目で1.25秒に伸びる＝2026-08-01 Codex指摘で統一）
    special.active = 'ring'; special.t = 0; special.ringHitSet = new Set();
    special.castX = P.x; special.castY = P.y;
  }
  function startRingBeam() {
    special.active = 'ringBeam'; special.t = 0; special.ringR = 0;
    special.ringHitSet = new Set(); special.beamHitSet = new Set();
    special.castX = P.x; special.castY = P.y;
    const d = Math.hypot(P.facing.x, P.facing.y) || 1;
    special.dir = { x: P.facing.x / d, y: P.facing.y / d };
  }
  function startField() {
    special.active = 'field'; special.t = 0; special.fieldT = BALANCE.special.fieldT;
    special.castX = P.x; special.castY = P.y;
  }

  function updateSpecial(dt) {
    if (special.secondPending > 0) { special.secondPending -= dt; if (special.secondPending <= 0) startRing(); }
    if (!special.active) return;
    special.t += dt;
    if (special.active === 'wave') {
      const cand = queryRadius(special.castX, special.castY, BALANCE.special.beamLen, querySpecial);
      for (let k = 0; k < cand.length; k++) { const e = enemies[cand[k]]; if (!e.active || e.dead) continue; const dx=e.x-special.castX,dy=e.y-special.castY,along=dx*special.dir.x+dy*special.dir.y,perp=Math.abs(dx*(-special.dir.y)+dy*special.dir.x); if (along>=-e.r && along<=BALANCE.special.beamLen && perp<=BALANCE.special.beamW/2+e.r) { hitEnemy(cand[k], BALANCE.special.beamDmg * stats.spPowerMul, special.castX, special.castY); e.knockX=special.dir.x*420; e.knockY=special.dir.y*420; e.knockT=0.4; } }
      if (special.t > 0.45) special.active = null; return;
    }
    if (special.active === 'chorus') {
      const cand = queryRadius(P.x, P.y, 220, querySpecial);
      for (let k=0;k<cand.length;k++) { const i=cand[k],e=enemies[i]; if(!e.active||e.dead||special.ringHitSet.has(i)) continue; special.ringHitSet.add(i); hitEnemy(i, BALANCE.special.ringDmg*1.5*stats.spPowerMul, P.x,P.y,{noKnock:true}); }
      if (special.t > 0.55) special.active = null; return;
    }
    if (special.active === 'goro') {
      const cand = queryRadius(special.castX, special.castY, 150, querySpecial);
      for (let k = 0; k < cand.length; k++) { const i=cand[k],e = enemies[i]; if (!e.active || e.dead) continue; const dx = special.castX - e.x, dy = special.castY - e.y; const d = Math.hypot(dx, dy) || 1; e.x += dx / d * 90 * dt; e.y += dy / d * 90 * dt; if (d < 48 && !special.goroHitSet.has(i)) { special.goroHitSet.add(i); hitEnemy(i, BALANCE.special.ringDmg * 2 * stats.spPowerMul, special.castX, special.castY, { noKnock: true }); } }
      if (special.t > 0.65) special.active = null;
      return;
    }
    if (special.active === 'field') {
      special.fieldT -= dt;
      P.hp = Math.min(maxHp, P.hp + BALANCE.special.fieldHeal * dt);
      const cand = queryRadius(special.castX, special.castY, BALANCE.special.fieldR, querySpecial);
      for (let k = 0; k < cand.length; k++) {
        const i = cand[k]; const e = enemies[i]; if (!e.active || e.dead) continue;
        if (Math.hypot(e.x - special.castX, e.y - special.castY) <= BALANCE.special.fieldR + e.r) {
          e.hp -= BALANCE.special.fieldDmg * stats.spPowerMul * dt;
          if (e.hp <= 0 && !e.dead) killEnemy(i);
        }
      }
      if (special.fieldT <= 0) special.active = null;
      return;
    }

    const active = special.active;
    const hasRing = active === 'ring' || active === 'ringBeam';
    const hasBeam = active === 'beam' || active === 'ringBeam';
    if (hasRing) {
      const dur = 0.5;
      special.ringR = Math.min(BALANCE.special.ringR, (special.t / dur) * BALANCE.special.ringR);
      const cand = queryRadius(special.castX, special.castY, BALANCE.special.ringR + 20, querySpecial);
      for (let k = 0; k < cand.length; k++) {
        const i = cand[k]; if (special.ringHitSet.has(i)) continue;
        const e = enemies[i]; if (!e.active || e.dead) continue;
        if (Math.hypot(e.x - special.castX, e.y - special.castY) <= special.ringR + e.r) {
          special.ringHitSet.add(i);
          hitEnemy(i, BALANCE.special.ringDmg * stats.spPowerMul, special.castX, special.castY, { forceCrit: false });
          if (e.kind === 'boss') triggerHitstop(FEEL.hitstopElite);
        }
      }
    }
    if (hasBeam) {
      const dur = 0.6;
      if (special.t <= dur) {
        const cand = queryRadius(special.castX, special.castY, BALANCE.special.beamLen, querySpecial);
        for (let k = 0; k < cand.length; k++) {
          const i = cand[k]; if (special.beamHitSet.has(i)) continue;
          const e = enemies[i]; if (!e.active || e.dead) continue;
          const dx = e.x - special.castX, dy = e.y - special.castY;
          const along = dx * special.dir.x + dy * special.dir.y;
          const perp = Math.abs(dx * -special.dir.y + dy * special.dir.x);
          if (along >= -e.r && along <= BALANCE.special.beamLen && perp <= BALANCE.special.beamW / 2 + e.r) {
            special.beamHitSet.add(i);
            hitEnemy(i, BALANCE.special.beamDmg * stats.spPowerMul, special.castX, special.castY);
            if (e.kind === 'boss') triggerHitstop(FEEL.hitstopElite);
          }
        }
      }
    }
    if (active === 'ring' && special.t >= 0.5) special.active = null;
    else if ((active === 'beam' || active === 'ringBeam') && special.t >= 0.6) special.active = null;
  }

  // ============================================================
  //  経験値玉・宝箱
  // ============================================================
  function grantXp(amount) {
    runXpTotal += amount; localXp += amount;
    while (localXp >= localXpNeed) {
      localXp -= localXpNeed; localLv++; localXpNeed = BALANCE.runXpNeed(localLv);
      P.hp = Math.min(maxHp, P.hp + stats.hp * 0.3);
      Game.sfx('level'); triggerFlash(0.85);
      spawnBurstParticles(P.x, P.y, PAL.lightHi, 10);
      spawnDamageNumber(P.x, P.y - 20, '+1', false, PAL.rarity.SSR);
      levelPillar = 0.5;
      if (!cfg.base && !outro) choiceQueue++;
    }
  }

  // ============================================================
  //  戦闘中の3択
  // ============================================================
  function boostById(id) {
    for (let i = 0; i < RUN_BOOSTS.length; i++) if (RUN_BOOSTS[i].id === id) return RUN_BOOSTS[i];
    if (id.indexOf('ally:') === 0) {   // なかまの加勢の札
      const def = CHARS.find(c => c.id === id.slice(5)); if (!def) return null;
      return { id: id, name: ALLY.name(def.name), desc: ALLY.desc[ALLY.form[def.atkType] || 'note'] };
    }
    return null;
  }

  // ---------- なかまの加勢 ----------
  const allies = [];        // { id, form, atk, lv, t }
  let allyShown = false;    // この探索で加勢の札を一度でも出したか（最初の3択には必ず出す）
  function pickAllyOffer() {
    const o = Game.state.owned; let n = 0, pick = null;
    for (const id in o) {
      if (id === cfg.charId) continue;
      const lv = boostCounts['ally:' + id] || 0;
      if (lv >= ALLY.maxLv || (!lv && allies.length >= ALLY.maxAllies)) continue;
      if (Math.random() * ++n < 1) pick = id;
    }
    return pick;
  }
  function addAlly(id) {
    let a = null;
    for (let i = 0; i < allies.length; i++) if (allies[i].id === id) a = allies[i];
    if (!a) {
      const def = CHARS.find(c => c.id === id); if (!def) return;
      a = { id: id, form: ALLY.form[def.atkType] || 'note', atk: Game.calcStats(id).atk, lv: 0, t: 0.4 };
      allies.push(a);
      banner.text = ALLY.join(def.name); banner.t = 2.5; banner.dur = 2.5;
    }
    a.lv++;
  }
  function updateAllies(dt) {
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i]; a.t -= dt; if (a.t > 0) continue;
      const F = ALLY[a.form]; a.t = F.every;
      if (a.form === 'trap') {
        const t = findFree(traps); if (!t) continue;
        t.active = true; t.x = P.x; t.y = P.y; t.life = 4.5;
        t.r = F.r * (1 + 0.25 * (a.lv - 1)); t.dmg = a.atk * F.mul * (1 + 0.4 * (a.lv - 1));
        continue;
      }
      const ti = nearestEnemyIdx(); if (ti < 0) { a.t = 0.3; continue; }
      const e = enemies[ti], base = Math.atan2(e.y - P.y, e.x - P.x), QD = QUESTS.wakaeda;
      for (let k = 0; k < a.lv; k++) {
        const p = findFree(pProj); if (!p) break;
        const ang = base + (k - (a.lv - 1) / 2) * (a.form === 'blade' ? 0.32 : 0.2);
        p.active = true; p.x = P.x; p.y = P.y; p.ally = true; p.dmg = a.atk * F.mul;
        if (a.form === 'blade') {
          p.blade = true; p.vx = Math.cos(ang) * QD.bladeSpeed; p.vy = Math.sin(ang) * QD.bladeSpeed;
          p.target = -1; p.life = QD.bladeLife;
          if (!p.hits) p.hits = new Set(); else p.hits.clear();
        } else {
          p.blade = false; p.vx = Math.cos(ang) * FEEL.noteSpeed; p.vy = Math.sin(ang) * FEEL.noteSpeed;
          p.target = ti; p.life = FEEL.noteLife;
        }
      }
    }
  }

  // 出せる強化から重複なしで3つ選ぶ（out に id を詰める）
  function rollOffer(out) {
    offerPool.length = 0;
    for (let i = 0; i < RUN_BOOSTS.length; i++) {
      const b = RUN_BOOSTS[i];
      if (b.who && b.who.indexOf(stats.atkType) < 0) continue;
      if (b.max != null && (boostCounts[b.id] || 0) >= b.max) continue;
      offerPool.push(b.id);
    }
    out.length = 0;
    for (let k = 0; k < 3 && offerPool.length; k++) {
      const j = Math.floor(Math.random() * offerPool.length);
      out.push(offerPool[j]); offerPool[j] = offerPool[offerPool.length - 1]; offerPool.length--;
    }
    // なかまの加勢：出せるなかまがいれば1枚をさしかえる（その探索の最初の3択には必ず出す）
    if (!cfg.base && !cfg.stress) {
      const aid = pickAllyOffer();
      if (aid && (!allyShown || Math.random() < ALLY.offerCh)) {
        allyShown = true;
        if (out.length < 3) out.push('ally:' + aid); else out[Math.floor(Math.random() * 3)] = 'ally:' + aid;
      }
    }
    return out;
  }

  function applyBoost(id) {
    boostCounts[id] = (boostCounts[id] || 0) + 1;
    if (id.indexOf('ally:') === 0) addAlly(id.slice(5));
    else if (id === 'atk') stats.atk *= 1.15;
    else if (id === 'haste') stats.intervalMul *= 0.90;
    else if (id === 'reach') stats.rangeMul *= 1.15;
    else if (id === 'multi') stats.projBonus += 1;
    else if (id === 'swift') stats.speed *= 1.10;
    else if (id === 'vital') { maxHp = Math.round(maxHp * 1.2); stats.hp = maxHp; P.maxHp = maxHp; P.hp = maxHp; }
    else if (id === 'charge') stats.spGainMul *= 1.25;
    else if (id === 'crit') stats.critCh += 0.08;
    else if (id === 'spPow') stats.spPowerMul *= 1.25;
  }

  function clearInputForChoice() {
    stick.active = false; stick.id = null; stick.dx = 0; stick.dy = 0;
    for (const k in keys) keys[k] = false;
    spaceHeld = false;
  }

  function openChoice() {
    rollOffer(offered);
    if (!offered.length) { choiceQueue = 0; return; }
    choiceQueue--;
    choiceOpen = true; choiceLv = localLv - choiceQueue;
    clearInputForChoice();
    if (cfg.auto || cfg.stress) { pickChoice(Math.floor(Math.random() * offered.length)); return; }   // 画面は出さず、その場で1つ選ぶ
    elChoiceTitle.textContent = TEXTS.choice.title(choiceLv);
    elChoiceSub.textContent = TEXTS.choice.sub;
    for (let i = 0; i < 3; i++) {
      const card = elChoiceCards[i], b = offered[i] ? boostById(offered[i]) : null;
      if (!b) { card.style.display = 'none'; continue; }
      card.style.display = 'flex';
      card.querySelector('.cc-name').textContent = b.name;
      card.querySelector('.cc-desc').textContent = b.desc;
      const k = boostCounts[b.id] || 0;
      card.querySelector('.cc-now').textContent = k ? TEXTS.choice.now(k) : '';
    }
    elChoicePanel.style.display = 'flex';
    choiceLockUntil = performance.now() + 250;
  }

  function pickChoice(i) {
    if (!choiceOpen) return false;
    const id = offered[i]; if (!id) return false;
    Game.sfx('choose');
    applyBoost(id);
    Game.log('choice', { lv: choiceLv, offered: offered.slice(), picked: id });
    choiceOpen = false;
    elChoicePanel.style.display = 'none';
    P.invulnT = Math.max(P.invulnT, BALANCE.choiceInvuln);   // 閉じた瞬間の理不尽な被弾を防ぐ
    last = performance.now();
    return true;
  }
  let levelPillar = 0;

  function updatePickups(dt) {
    const magnet = BALANCE.player.magnet;
    const chestMagnet = BALANCE.player.chestMagnet;
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i]; if (!o.active) continue;
      const dx = P.x - o.x, dy = P.y - o.y; const d = Math.hypot(dx, dy) || 0.01;
      if (d < magnet) { const pull = 240 * (1 - d / magnet) + 60; o.x += (dx / d) * pull * dt; o.y += (dy / d) * pull * dt; }
      if (d <= P.r + 4) { grantXp(o.value); Game.sfx('orb'); o.active = false; }
    }
    for (let i = 0; i < chests.length; i++) {
      const c = chests[i]; if (!c.active) continue;
      const dx = P.x - c.x, dy = P.y - c.y; const d = Math.hypot(dx, dy) || 0.01;
      if (d < chestMagnet) { const pull = 200 * (1 - d / chestMagnet) + 40; c.x += (dx / d) * pull * dt; c.y += (dy / d) * pull * dt; }
      if (d <= P.r + 6) collectChest(c);
    }
  }

  // ---------- エリートの紙の箱 ----------
  // 触れた瞬間にお守りと笹を計上する（演出中に探索が終わっても失われない）。札を出すのは演出を切らない探索だけ
  function boxShown() {
    if (cfg.auto || cfg.stress) return false;
    return !(window.Book && Book.mode() === 'off');   // 判定は book.js と同じ（SASA_NO_ANIM・?anim=0・?auto=1・?stress=1）
  }
  function collectChest(c) {
    const f = forcedBox; forcedBox = null;
    const drop = rollDrop(f && f.rarity ? f.rarity : null);
    const unique = f ? !!f.unique : !!c.unique;
    const sasa = BOX.sasa[unique ? 'unique' : drop.rarity];
    drops.push(drop); runSasa += sasa;
    Game.sfx('chest'); spawnBurstParticles(c.x, c.y, PAL.rarity.SSR, 8); c.active = false;
    if (boxShown()) boxQueue.push({ drop: drop, sasa: sasa, unique: unique });
  }
  function buildBoxConfetti() {
    const cols = ['#E8B84A', '#C77DFF', '#FFF6E6', '#FF8FB0', '#8AC87A'];
    for (let i = 0; i < 36; i++) {
      const d = document.createElement('i'); d.className = 'bx-conf';
      d.style.setProperty('--x', (2 + hash2(i, 1) * 94).toFixed(1) + '%');
      d.style.setProperty('--dl', (hash2(i, 2) * 0.7).toFixed(2) + 's');
      d.style.setProperty('--d', (1.5 + hash2(i, 3) * 1.3).toFixed(2) + 's');
      d.style.setProperty('--dx', Math.round((hash2(i, 4) - 0.5) * 140) + 'px');
      d.style.setProperty('--r', Math.round(360 + hash2(i, 5) * 720) + 'deg');
      d.style.setProperty('--c', cols[i % cols.length]);
      d.style.display = 'none';
      elBoxConf.appendChild(d);
    }
  }
  function boxKey(it) { return it.unique ? 'unique' : it.drop.rarity; }
  function hideBoxPanel() {
    if (boxHideTimer) { clearTimeout(boxHideTimer); boxHideTimer = 0; }
    if (elBoxPanel) { elBoxPanel.style.display = 'none'; elBoxPanel.classList.remove('bx-go', 'bx-closing'); }
  }
  function openBox(now) {
    const it = boxQueue.shift(); boxItem = it;
    boxOpen = true; boxAge = 0; boxPrev = now; boxSfxDone = false;
    clearInputForChoice();
    const key = boxKey(it), T = TEXTS.box, drop = it.drop;
    if (boxHideTimer) { clearTimeout(boxHideTimer); boxHideTimer = 0; }
    elBoxPanel.className = 'bx-r-' + drop.rarity + (it.unique ? ' bx-uniq' : '');
    const s = elBoxPanel.style;
    s.setProperty('--bx-col', it.unique ? QUESTS.wakaeda.color : PAL.rarity[drop.rarity]);
    s.setProperty('--bx-flap', BOX.flapSec + 's'); s.setProperty('--bx-pop', BOX.popSec + 's'); s.setProperty('--bx-close', BOX.closeSec + 's');
    s.setProperty('--bx-start', (BOX.flapSec * 0.6) + 's');
    elBoxFound.textContent = T.found;
    elBoxRar.textContent = it.unique ? T.uniqueChip : drop.rarity;
    if (it.unique) {
      elBoxName.innerHTML = T.uniqueName; elBoxStat.innerHTML = T.uniqueDesc;
      elBoxSub.textContent = drop.name + '　' + drop.stat;
    } else {
      if (T.armorName[drop.typeId]) elBoxName.innerHTML = T.armorName[drop.typeId]; else elBoxName.textContent = drop.name;
      elBoxStat.textContent = drop.stat; elBoxSub.textContent = '';
    }
    elBoxSasa.textContent = T.sasa(it.sasa);
    const n = BOX.confetti[key], conf = elBoxConf.children;
    for (let i = 0; i < conf.length; i++) conf[i].style.display = i < n ? 'block' : 'none';
    s.display = 'flex';
    void elBoxPanel.offsetWidth;                 // 続けて開くときも、ふたと札の動きを頭からやり直す
    elBoxPanel.classList.add('bx-go');
    if (it.unique) triggerFlash(0.85);
    Game.log('box', { rarity: drop.rarity, unique: !!it.unique });
  }
  function closeBox() {
    boxOpen = false; boxItem = null;
    elBoxPanel.classList.add('bx-closing');
    boxHideTimer = setTimeout(() => { boxHideTimer = 0; elBoxPanel.style.display = 'none'; elBoxPanel.classList.remove('bx-go', 'bx-closing'); }, BOX.closeSec * 1000);
    P.invulnT = Math.max(P.invulnT, BOX.afterInvuln);   // 閉じた瞬間の理不尽な被弾を防ぐ
    last = performance.now();
  }
  function tryCloseBox() {
    if (!boxOpen || boxAge < BOX.tapLockSec * 1000) return false;
    closeBox(); return true;
  }
  // 札が起き上がる音と、自動で閉じる時刻（箱が開いて止まっているあいだ、毎フレーム呼ぶ）
  function boxTick(now) {
    boxAge += Math.min(250, Math.max(0, now - boxPrev)); boxPrev = now;
    const popAt = BOX.flapSec * 0.6 * 1000;
    if (!boxSfxDone && boxAge >= popAt) {
      boxSfxDone = true;
      Game.sfx('choose');
      if (boxItem.unique || boxItem.drop.rarity === 'SSR' || boxItem.drop.rarity === 'UR') Game.sfx('gachaRare');
      if (boxItem.unique) Game.sfx('level');
    }
    if (boxAge >= popAt + BOX.popSec * 1000 + BOX.holdSec[boxKey(boxItem)] * 1000) closeBox();
  }

  function updateParticles(dt) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; if (!p.active) continue;
      p.life -= dt; if (p.life <= 0) { p.active = false; continue; }
      if (p.kind === 'square') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
      else if (p.kind === 'ember') { p.sway += dt * 2; p.x += (p.vx + Math.sin(p.sway) * 6) * dt; p.y += p.vy * dt; }
    }
    for (let i = 0; i < dmgNums.length; i++) {
      const d = dmgNums[i]; if (!d.active) continue;
      d.life -= dt; if (d.life <= 0) { d.active = false; continue; }
      d.y += d.vy * dt; d.vy *= 0.94;
    }
    let arcWrite = 0;
    for (let i = 0; i < arcFx.length; i++) {
      const a = arcFx[i];
      a.t += dt;
      if (a.t < a.dur) arcFx[arcWrite++] = a;
    }
    arcFx.length = arcWrite;
  }

  // ============================================================
  //  カメラ・演出タイマー
  // ============================================================
  function updateCamera(dt) {
    const lerp = Math.min(1, dt * 9);
    cam.x += (P.x - cam.x) * lerp; cam.y += (P.y - cam.y) * lerp;
  }

  function updateFx(dt) {
    if (hitstop > 0) hitstop = Math.max(0, hitstop - dt);
    if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
    if (flashA > 0) flashA = Math.max(0, flashA - dt * 3);
    if (levelPillar > 0) levelPillar = Math.max(0, levelPillar - dt);
    if (banner.t > 0) banner.t -= dt;
    if (specialAnnounceT > 0) specialAnnounceT = Math.max(0, specialAnnounceT - dt);
    if (P.slowT > 0) P.slowT -= dt;
  }

  // ============================================================
  //  HUD
  // ============================================================
  function updateHud() {
    if (elGuideChip && Game.tutorialStep && !Game.state.flags.tutorialSkipped) { const labels=['移動してみよう','敵に近づき自動攻撃',P.sp < 100 ? '倒すと必殺がたまる' : isTouchDevice() ? '必殺で群れを押し返す' : '必殺で群れを押し返す（Space）','村へ帰還','装備または育成','ギルドで紹介','新しい仲間を選ぶ','再出発']; elGuideChip.style.display='block'; elGuideChip.querySelector('span').textContent=labels[Math.min(7,Game.tutorialStep())]; } else if (elGuideChip) elGuideChip.style.display='none';
    if (elSpecialAnnounce) elSpecialAnnounce.style.display = specialAnnounceT > 0 ? 'block' : 'none';
    const hpPct = Math.max(0, Math.min(100, (P.hp / maxHp) * 100));
    elHpFill.style.width = hpPct + '%'; elHpText.textContent = Math.max(0, Math.round(P.hp)) + ' / ' + Math.round(maxHp);
    const xpPct = Math.max(0, Math.min(100, (localXp / localXpNeed) * 100));
    elXpFill.style.width = xpPct + '%'; elLvText.textContent = 'Lv.' + localLv;
    elFloorText.textContent = '第' + cfg.floor + '階';
    if (elQuestChip) {
      let qt = '';
      if (questActive()) qt = eliteKills >= QUESTS.wakaeda.eliteTarget ? TEXTS.quest.hudDone : TEXTS.quest.hud(eliteKills);
      if (qt !== questChipText) { questChipText = qt; elQuestChip.textContent = qt; elQuestChip.style.display = qt ? 'block' : 'none'; }
    }
    const t = Math.max(0, elapsed);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    elTimerText.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss;
    elSasaText.textContent = '笹 ' + runSasa;
    if (bossOn && bossIdx >= 0 && enemies[bossIdx] && enemies[bossIdx].active) {
      elBossBar.style.display = 'flex';
      const b = enemies[bossIdx];
      elBossFill.style.width = Math.max(0, (b.hp / b.maxHp) * 100) + '%';
      elBossName.textContent = bossName;
    } else if (!bossOn) { elBossBar.style.display = 'none'; }
    const pct = Math.max(0, Math.min(100, P.sp));
    elBtnSp.style.background = 'linear-gradient(to top, ' + PAL.light + ' ' + pct + '%, ' + PAL.cloakShadow + ' ' + pct + '%)';
    if (P.sp >= 100) {
      const pulse = 1 + 0.05 * Math.sin(elapsed * 8);
      elBtnSp.style.transform = 'scale(' + pulse + ')';
      elBtnSpLabel.textContent = '必殺！';
    } else { elBtnSp.style.transform = ''; elBtnSpLabel.textContent = '必殺'; }
    elFpsText.textContent = Math.round(fps) + ' fps';
    window.__stats.fps = fps; window.__stats.enemies = aliveCount();
  }

  // ============================================================
  //  描画
  // ============================================================
  function toScreen(x, y) { return { x: x - cam.x + logW / 2, y: y - cam.y + logH / 2 }; }

  function drawShadow(ctx, sx, sy, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.75, r * 0.9, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawSprite(name, sx, sy, size, flip) {
    let img = null;
    try { img = window.Sprites && Sprites.get ? Sprites.get(name) : null; } catch (e) { img = null; }
    if (img) {
      const w = size, h = size;
      cw.save(); cw.translate(sx, sy);
      cw.imageSmoothingEnabled = Boolean(Sprites.isIllustrated && Sprites.isIllustrated(name));
      if (flip) cw.scale(-1, 1);
      cw.drawImage(img, -w / 2, -h / 2, w, h);
      cw.restore();
    } else {
      cw.fillStyle = PAL.cloak; cw.beginPath(); cw.arc(sx, sy, size / 2, 0, Math.PI * 2); cw.fill();
    }
  }

  function drawWorld() {
    Fx.begin(); fxLightCount = 0;
    cw.clearRect(0, 0, logW, logH);
    // 空
    const sky = cw.createLinearGradient(0, 0, 0, logH);
    sky.addColorStop(0, PAL.bgTop); sky.addColorStop(1, PAL.bgBottom);
    cw.fillStyle = sky; cw.fillRect(0, 0, logW, logH);

    cw.save();
    let sx = 0, sy = 0;
    if (shakeTime > 0) {
      const amt = shakeMag * (shakeTime / (shakeTotal || shakeTime));
      sx = (Math.random() - 0.5) * amt; sy = (Math.random() - 0.5) * amt;
    }
    cw.translate(sx, sy);

    drawGround();
    drawTerrain2D();
    drawEmbersBack();
    drawPickupsAndProjectiles();
    drawEnemies();
    drawSpecialFx();
    drawArcFx();
    drawPlayer();
    drawBurstParticles();
    drawLightning();
    cw.restore();

    registerBeamLights();
    registerRingFieldLights();
    registerCharacterSpecialLights();

    // ---- Fx合成：闇→光のマスク→追い光→霧→ビネット（fxcore.js） ----
    Fx.compose(worldCtx, base, { darkness: currentDarkness(), ambient: AMBIENT, fog: elapsed });

    // 必殺はFxが対応しないレイヤー構成のため合成後に重ね描き（静止画のレイヤ構成に準拠）
    if (special.active === 'beam' || special.active === 'ringBeam') drawBeamOverlay();
    if (special.active === 'ring' || special.active === 'ringBeam' || special.active === 'field') drawRingFieldOverlay();
    if (special.active === 'wave') drawWaveOverlay();
    else if (special.active === 'chorus') drawChorusOverlay();
    else if (special.active === 'goro') drawGoroOverlay();

    // 画面フラッシュ・暗転は最前面（表示解像度）
    const ww = worldCtx.canvas.width, wh = worldCtx.canvas.height;
    if (flashA > 0) { worldCtx.fillStyle = 'rgba(255,255,255,' + flashA.toFixed(3) + ')'; worldCtx.fillRect(0, 0, ww, wh); }
    if (fadeA > 0) { worldCtx.fillStyle = 'rgba(6,2,10,' + fadeA.toFixed(3) + ')'; worldCtx.fillRect(0, 0, ww, wh); }
  }

  function drawGround() {
    const cell = 40;
    const x0 = Math.floor((cam.x - logW / 2) / cell) - 1, x1 = Math.floor((cam.x + logW / 2) / cell) + 1;
    const y0 = Math.floor((cam.y - logH / 2) / cell) - 1, y1 = Math.floor((cam.y + logH / 2) / cell) + 1;
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const wx = gx * cell, wy = gy * cell;
      const h = hash2(gx, gy);
      const s = toScreen(wx + cell / 2, wy + cell / 2);
      if (h < 0.22) {
        cw.fillStyle = PAL.groundLit; cw.beginPath();
        cw.arc(s.x + (h - 0.11) * 30, s.y + (hash2(gx + 5, gy) - 0.5) * 20, 2 + h * 3, 0, Math.PI * 2); cw.fill();
      } else if (h < 0.32) {
        cw.strokeStyle = PAL.ground; cw.lineWidth = 1;
        cw.beginPath(); cw.moveTo(s.x - 8, s.y + 4); cw.lineTo(s.x + 8, s.y - 4); cw.stroke();
      } else if (h < 0.4) {
        cw.fillStyle = PAL.sasaShadow;
        cw.fillRect(s.x - 1, s.y - 6, 2, 10);
        cw.fillRect(s.x - 5, s.y - 3, 2, 7);
      }
    }
  }

  // 2D用の地形（当たり判定があるので、2Dでも見えるようにする。簡単な形）
  function drawTerrain2D() {
    const TS = World.tileSize, pad = 80;
    const x0 = cam.x - logW / 2 - pad, x1 = cam.x + logW / 2 + pad, y0 = cam.y - logH / 2 - pad, y1 = cam.y + logH / 2 + pad;
    const ox = logW / 2 - cam.x, oy = logH / 2 - cam.y;
    for (let tx = Math.floor(x0 / TS); tx <= Math.floor(x1 / TS); tx++) for (let ty = Math.floor(y0 / TS); ty <= Math.floor(y1 / TS); ty++) {
      const items = World.tile(tx, ty).items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const ex = it.hw !== undefined ? it.hw : it.r, ey = it.hw !== undefined ? it.hh : it.r;
        if (it.x + ex < x0 || it.x - ex > x1 || it.y + ey < y0 || it.y - ey > y1) continue;
        const sx = it.x + ox, sy = it.y + oy;
        if (it.t === World.PUDDLE) {
          cw.fillStyle = 'rgba(70,120,190,0.45)'; cw.beginPath(); cw.ellipse(sx, sy, it.r, it.r * 0.7, 0, 0, Math.PI * 2); cw.fill();
        } else if (it.t === World.WALL) {
          cw.fillStyle = '#2c2238'; cw.fillRect(sx - it.hw, sy - it.hh, it.hw * 2, it.hh * 2);
          cw.fillStyle = '#5a7a4c'; cw.fillRect(sx - it.hw, sy - it.hh, it.hw * 2, 3);
        } else {
          cw.fillStyle = it.t === World.PILLAR ? '#43385a' : '#352a46'; cw.strokeStyle = '#6a5a82'; cw.lineWidth = 1;
          cw.beginPath(); cw.arc(sx, sy, it.r, 0, Math.PI * 2); cw.fill(); cw.stroke();
        }
      }
    }
  }

  function drawEmbersBack() {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; if (!p.active || p.kind !== 'ember') continue;
      const s = toScreen(p.x, p.y);
      const a = Math.max(0, p.life / p.maxLife);
      cw.globalCompositeOperation = 'lighter';
      cw.fillStyle = p.color; cw.globalAlpha = a * 0.7;
      cw.beginPath(); cw.arc(s.x, s.y, p.size, 0, Math.PI * 2); cw.fill();
      cw.globalAlpha = 1; cw.globalCompositeOperation = 'source-over';
    }
  }

  function drawPickupsAndProjectiles() {
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i]; if (!o.active) continue;
      const s = toScreen(o.x, o.y);
      drawShadow(cw, s.x, s.y, 3);
      cw.fillStyle = ELEMENTS.sprout.color;
      cw.save(); cw.translate(s.x, s.y); cw.rotate(Math.PI / 4);
      cw.fillRect(-3, -3, 6, 6); cw.restore();
      // 経験値の笹の葉：小さな緑の光
      const fp = logicalToFx(s.x, s.y);
      fxLight(fp.x, fp.y, 15 * fxScaleX, '150,220,120', 0.6, 0.5);
    }
    for (let i = 0; i < chests.length; i++) {
      const c = chests[i]; if (!c.active) continue;
      const s = toScreen(c.x, c.y);
      drawShadow(cw, s.x, s.y, 6);
      drawSprite('chest', s.x, s.y, 14, false);
      // 場にあるあいだ金色にゆっくり明滅（エリートの光と同じ色）
      const cp = logicalToFx(s.x, s.y);
      fxLight(cp.x, cp.y, 44 * fxScaleX, '240,190,80', 0.65 + 0.25 * Math.sin(elapsed * 3 + i), 0.6);
    }
    for (let i = 0; i < pProj.length; i++) {
      const p = pProj[i]; if (!p.active) continue;
      const s = toScreen(p.x, p.y);
      if (p.blade) {   // 若葉色の三日月（新しい絵は使わず、線で描く）
        cw.save(); cw.translate(s.x, s.y); cw.rotate(Math.atan2(p.vy, p.vx));
        cw.globalCompositeOperation = 'lighter'; cw.strokeStyle = QUESTS.wakaeda.color; cw.lineWidth = 3;
        const QB = QUESTS.wakaeda, br = QB.bladeR;
        cw.lineWidth = QB.bladeLine;
        cw.beginPath(); cw.arc(-br * 0.55, 0, br, -1.1, 1.1); cw.stroke();
        cw.lineWidth = QB.bladeLineInner; cw.strokeStyle = '#E9FFD8'; cw.beginPath(); cw.arc(-br * 0.55, 0, br, -0.9, 0.9); cw.stroke();
        cw.restore();
        const bf = logicalToFx(s.x, s.y); fxLight(bf.x, bf.y, 22 * fxScaleX, '155,224,122', 0.8, 0.6);
        continue;
      }
      const col = stats.element ? ELEMENTS[stats.element].color : PAL.light;
      const img = window.Sprites && Sprites.get ? Sprites.get('note') : null;
      if (img) { cw.drawImage(img, s.x - 5, s.y - 5, 10, 10); }
      else { cw.fillStyle = col; cw.beginPath(); cw.arc(s.x, s.y, 3, 0, Math.PI * 2); cw.fill(); }
    }
    for (let i = 0; i < eProj.length; i++) {
      const p = eProj[i]; if (!p.active) continue;
      const s = toScreen(p.x, p.y);
      const name = p.kind === 'sleeporb' ? 'sleeporb' : 'orb';
      const img = window.Sprites && Sprites.get ? Sprites.get(name) : null;
      if (img) cw.drawImage(img, s.x - 5, s.y - 5, 10, 10);
      else { cw.fillStyle = PAL.hakite; cw.beginPath(); cw.arc(s.x, s.y, 4, 0, Math.PI * 2); cw.fill(); }
      // 吐き手（敵）の弾：紫の光
      const fp = logicalToFx(s.x, s.y);
      fxLight(fp.x, fp.y, 16 * fxScaleX, '170,120,255', 0.8, 0.5);
    }
  }

  // 敵が120体を超えたら「seen」は自分に近い順120体だけにする（毎フレーム配列生成しない）
  function computeSeenSelection() {
    let n = 0;
    for (let i = 0; i < enemies.length; i++) if (enemies[i].active) seenOrder[n++] = i;
    cachedAliveN = n;
    if (n > 120) {
      seenOrder.length = n;
      seenOrder.sort((a, b) => {
        const da = (enemies[a].x - P.x) * (enemies[a].x - P.x) + (enemies[a].y - P.y) * (enemies[a].y - P.y);
        const db = (enemies[b].x - P.x) * (enemies[b].x - P.x) + (enemies[b].y - P.y) * (enemies[b].y - P.y);
        return da - db;
      });
      seenFlag.fill(0);
      for (let k = 0; k < 120; k++) seenFlag[seenOrder[k]] = 1;
      seenOrder.length = ENEMY_CAP_HARD;
    }
  }

  function drawEnemies() {
    computeSeenSelection();
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.active) continue;
      const s = toScreen(e.x, e.y);
      drawShadow(cw, s.x, s.y, e.r);
      if (e.elite) {
        cw.strokeStyle = PAL.elite; cw.lineWidth = 2; cw.globalAlpha = 0.7 + 0.3 * Math.sin(elapsed * 6);
        cw.beginPath(); cw.arc(s.x, s.y, e.r + 5, 0, Math.PI * 2); cw.stroke(); cw.globalAlpha = 1;
      }
      const isTelegraph = (e.kind === 'tosshin' && e.state === 'telegraph') || (e.kind === 'boss' && e.state === 'telegraph');
      if (isTelegraph && Math.floor(elapsed * 14) % 2 === 0) { cw.fillStyle = 'rgba(255,255,255,0.35)'; cw.beginPath(); cw.arc(s.x, s.y, e.r + 3, 0, Math.PI * 2); cw.fill(); }
      const size = e.kind === 'boss' ? e.r * 2 * 2 : e.r * 2.4;
      const flip = (e.kind === 'boss' ? (e.chargeDirX < 0) : (e.x < P.x));
      const spriteName = e.kind === 'boss' ? 'boss_' + e.bossId : e.kind;
      drawSprite(spriteName, s.x, s.y, size, flip);
      if (e.flashFrames > 0) {
        cw.globalCompositeOperation = 'lighter'; cw.fillStyle = 'rgba(255,255,255,0.55)';
        cw.beginPath(); cw.arc(s.x, s.y, e.r, 0, Math.PI * 2); cw.fill(); cw.globalCompositeOperation = 'source-over';
      }
      if (e.burnT > 0) { cw.fillStyle = 'rgba(255,120,40,0.35)'; cw.beginPath(); cw.arc(s.x, s.y - e.r * 0.3, e.r * 0.6, 0, Math.PI * 2); cw.fill(); }

      // ---- 光の配役：闇の中でも読めるseen＋敵の記号eyeGlow ----
      const fp = logicalToFx(s.x, s.y);
      if (e.kind === 'boss') {
        fxSeen(fp.x, fp.y, 44 * fxScaleX, 0.2);
        const eyeDX = e.r * 0.5 * fxScaleX, eyeDY = -e.r * 0.5 * fxScaleY;
        fxEyeGlow(fp.x - eyeDX, fp.y + eyeDY);
        fxEyeGlow(fp.x + eyeDX, fp.y + eyeDY);
      } else {
        if (cachedAliveN <= 120 || seenFlag[i]) fxSeen(fp.x, fp.y, 22 * fxScaleX, 0.5);
        fxEyeGlow(fp.x, fp.y - e.r * 0.4 * fxScaleY);
        if (e.elite) fxLight(fp.x, fp.y, 48 * fxScaleX, '240,190,80', 0.8, 0.6);
      }
    }
  }

  function drawArcFx() {
    for (let i = 0; i < arcFx.length; i++) {
      const a = arcFx[i]; const s = toScreen(P.x, P.y);
      const prog = a.t / a.dur;
      const col = arcColorNow(), half = arcAngleNow() / 2;
      cw.globalCompositeOperation = 'lighter'; cw.strokeStyle = col; cw.lineWidth = stats.unique ? 3 : 2; cw.globalAlpha = 1 - prog;
      for (let j = 0; j < (stats.unique ? 3 : 2); j++) {
        const rr = arcRadiusNow() * (0.55 + j * 0.3) * (0.6 + prog * 0.4);
        cw.beginPath(); cw.arc(s.x, s.y, rr, a.ang - half, a.ang + half); cw.stroke();
      }
      cw.globalAlpha = 1; cw.globalCompositeOperation = 'source-over';
    }
  }

  function drawSpecialFx() {
    // 必殺（輪・結界・ビーム）はドット絵レイヤーには描かない。
    // 闇の合成でくすむため、Fx合成後に drawBeamOverlay / drawRingFieldOverlay で発光させる。
  }

  // 3体の必殺は色だけでなく、波／音の輪／吸引する大まりという別形状で見せる。
  function registerCharacterSpecialLights() {
    if (special.active === 'wave') {
      for (let i = 0; i < 5; i++) {
        const d = 25 + i * 30;
        const s = toScreen(special.castX + special.dir.x * d, special.castY + special.dir.y * d);
        const p = logicalToFx(s.x, s.y);
        fxLight(p.x, p.y, 48 * fxScaleX, '255,190,92', 0.95, 0.92);
      }
    } else if (special.active === 'chorus') {
      const s = toScreen(P.x, P.y), p = logicalToFx(s.x, s.y);
      fxLight(p.x, p.y, 220 * fxScaleX, '202,118,255', 0.9, 0.88);
    } else if (special.active === 'goro') {
      const s = toScreen(special.castX, special.castY), p = logicalToFx(s.x, s.y);
      fxLight(p.x, p.y, 165 * fxScaleX, '255,92,180', 1, 0.92);
    }
  }

  function drawWaveOverlay() {
    const s = toScreen(special.castX, special.castY), p = logicalToFx(s.x, s.y);
    const FS = fxScaleX, prog = Math.min(1, special.t / 0.45);
    const len = BALANCE.special.beamLen * FS, half = (38 + prog * 34) * FS;
    worldCtx.save(); worldCtx.translate(p.x, p.y); worldCtx.rotate(Math.atan2(special.dir.y, special.dir.x));
    worldCtx.globalCompositeOperation = 'lighter';
    const glow = worldCtx.createLinearGradient(0, 0, len, 0);
    glow.addColorStop(0, 'rgba(255,250,220,0.92)'); glow.addColorStop(0.45, 'rgba(255,190,92,0.65)'); glow.addColorStop(1, 'rgba(255,110,55,0)');
    worldCtx.fillStyle = glow; worldCtx.beginPath(); worldCtx.moveTo(8 * FS, 0); worldCtx.lineTo(len, -half); worldCtx.lineTo(len, half); worldCtx.closePath(); worldCtx.fill();
    for (let i = 0; i < 3; i++) {
      const x = (38 + prog * 70 + i * 26) * FS;
      worldCtx.strokeStyle = 'rgba(255,246,210,' + (0.95 - i * 0.2).toFixed(2) + ')'; worldCtx.lineWidth = (7 - i) * FS;
      worldCtx.beginPath(); worldCtx.arc(x, 0, (24 + i * 12) * FS, -1.05, 1.05); worldCtx.stroke();
    }
    worldCtx.restore();
  }

  function drawChorusOverlay() {
    const s = toScreen(P.x, P.y), p = logicalToFx(s.x, s.y);
    const FS = fxScaleX, prog = Math.min(1, special.t / 0.55), radius = (42 + prog * 178) * FS;
    worldCtx.save(); worldCtx.globalCompositeOperation = 'lighter'; worldCtx.translate(p.x, p.y);
    for (let i = 0; i < 3; i++) {
      worldCtx.strokeStyle = i === 1 ? 'rgba(245,205,255,0.92)' : 'rgba(194,105,255,0.58)';
      worldCtx.lineWidth = (8 - i * 2) * FS; worldCtx.beginPath(); worldCtx.arc(0, 0, Math.max(8, radius - i * 18 * FS), 0, Math.PI * 2); worldCtx.stroke();
    }
    worldCtx.fillStyle = '#F6D8FF'; worldCtx.font = Math.round(27 * FS) + 'px sans-serif'; worldCtx.textAlign = 'center'; worldCtx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + prog * 1.4; worldCtx.fillText(i % 2 ? '♫' : '♪', Math.cos(a) * radius * 0.78, Math.sin(a) * radius * 0.78); }
    worldCtx.restore();
  }

  function drawGoroOverlay() {
    const s = toScreen(special.castX, special.castY), p = logicalToFx(s.x, s.y);
    const FS = fxScaleX, prog = Math.min(1, special.t / 0.65), radius = (150 - prog * 88) * FS;
    worldCtx.save(); worldCtx.globalCompositeOperation = 'lighter'; worldCtx.translate(p.x, p.y); worldCtx.rotate(prog * 2.2);
    for (let i = 0; i < 4; i++) {
      worldCtx.strokeStyle = i < 2 ? 'rgba(255,105,195,0.78)' : 'rgba(180,92,255,0.55)'; worldCtx.lineWidth = (10 - i * 1.5) * FS;
      worldCtx.beginPath(); worldCtx.arc(0, 0, Math.max(20 * FS, radius - i * 20 * FS), i * 0.7, i * 0.7 + Math.PI * 1.35); worldCtx.stroke();
    }
    const coreR = (20 + prog * 35) * FS, core = worldCtx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    core.addColorStop(0, 'rgba(255,255,240,1)'); core.addColorStop(0.3, 'rgba(255,166,220,0.95)'); core.addColorStop(1, 'rgba(158,62,220,0)');
    worldCtx.fillStyle = core; worldCtx.beginPath(); worldCtx.arc(0, 0, coreR, 0, Math.PI * 2); worldCtx.fill();
    worldCtx.restore();
  }

  // 輪・結界の「通った場所が明るくなる」をFxライトで表現する
  function registerRingFieldLights() {
    if (special.active === 'ring' || special.active === 'ringBeam') {
      const s = toScreen(special.castX, special.castY);
      const c = logicalToFx(s.x, s.y);
      fxLight(c.x, c.y, Math.max(60, special.ringR * 1.15) * fxScaleX, '255,190,110', 0.7, 0.95);
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = logicalToFx(s.x + Math.cos(a) * special.ringR, s.y + Math.sin(a) * special.ringR);
        fxLight(p.x, p.y, 38 * fxScaleX, '255,220,150', 0.6, 0.8);
      }
    } else if (special.active === 'field') {
      const s = toScreen(special.castX, special.castY);
      const c = logicalToFx(s.x, s.y);
      fxLight(c.x, c.y, BALANCE.special.fieldR * 1.4 * fxScaleX, '255,220,140', 0.75, 0.95);
    }
  }

  // 輪・結界の本体（合成後・表示解像度・addivtiveの多層グロー）
  function drawRingFieldOverlay() {
    const s = toScreen(special.castX, special.castY);
    const c = logicalToFx(s.x, s.y);
    const FS = fxScaleX;
    worldCtx.save();
    worldCtx.globalCompositeOperation = 'lighter';
    if (special.active === 'ring' || special.active === 'ringBeam') {
      const r = special.ringR * FS;
      const fade = 1 - Math.min(1, special.t / 0.5) * 0.35;
      const layers = [
        [18 * FS, 'rgba(255,196,106,' + (0.16 * fade).toFixed(3) + ')'],
        [8 * FS, 'rgba(255,220,150,' + (0.5 * fade).toFixed(3) + ')'],
        [3 * FS, 'rgba(255,248,230,' + (0.95 * fade).toFixed(3) + ')'],
      ];
      for (const [w, col] of layers) {
        worldCtx.strokeStyle = col; worldCtx.lineWidth = w;
        worldCtx.beginPath(); worldCtx.arc(c.x, c.y, r, 0, Math.PI * 2); worldCtx.stroke();
      }
    } else if (special.active === 'field') {
      const r = BALANCE.special.fieldR * FS;
      const pulse = 0.75 + Math.sin(special.t * 5) * 0.25;
      worldCtx.strokeStyle = 'rgba(255,232,176,' + (0.65 * pulse).toFixed(3) + ')';
      worldCtx.lineWidth = 3 * FS;
      worldCtx.beginPath(); worldCtx.arc(c.x, c.y, r, 0, Math.PI * 2); worldCtx.stroke();
      worldCtx.strokeStyle = 'rgba(255,196,106,0.2)'; worldCtx.lineWidth = 10 * FS;
      worldCtx.beginPath(); worldCtx.arc(c.x, c.y, r, 0, Math.PI * 2); worldCtx.stroke();
    }
    worldCtx.restore();
  }

  // 必殺ビームの通り道を「見える」ようにする（Fx.lightで反映＝reveal+暖色の追い光）
  function registerBeamLights() {
    if (special.active !== 'beam' && special.active !== 'ringBeam') return;
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const bx = special.castX + special.dir.x * BALANCE.special.beamLen * t;
      const by = special.castY + special.dir.y * BALANCE.special.beamLen * t;
      const s = toScreen(bx, by);
      const fp = logicalToFx(s.x, s.y);
      fxLight(fp.x, fp.y, 46 * fxScaleX, '255,244,220', 0.9, 0.9);
    }
  }

  // 必殺ビーム本体：静止画のレイヤ構成（4層＋着弾のまぶしさ＋根本フェード）を表示解像度で描く
  function drawBeamOverlay() {
    const s = toScreen(special.castX, special.castY);
    const fp = logicalToFx(s.x, s.y);
    const ang = Math.atan2(special.dir.y, special.dir.x);
    const FS = fxScaleX;
    const bw = BALANCE.special.beamW;
    const len = BALANCE.special.beamLen * FS;
    const from = 26 * FS;   // 根本を少し空けて、本人を隠さない
    worldCtx.save();
    worldCtx.globalCompositeOperation = 'lighter';
    worldCtx.translate(fp.x, fp.y); worldCtx.rotate(ang);
    const layers = [
      [bw * 1.4 * FS, 'rgba(255,196,106,0.15)'],
      [bw * 0.74 * FS, 'rgba(255,196,106,0.4)'],
      [bw * 0.33 * FS, 'rgba(255,240,200,0.9)'],
      [bw * 0.13 * FS, 'rgba(255,255,255,1)'],
    ];
    for (let i = 0; i < layers.length; i++) {
      const w = layers[i][0], c = layers[i][1];
      const grd = worldCtx.createLinearGradient(from - 20 * FS, 0, from + 60 * FS, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, c);
      worldCtx.fillStyle = grd; worldCtx.fillRect(from - 20 * FS, -w / 2, 80 * FS, w);
      worldCtx.fillStyle = c; worldCtx.fillRect(from + 60 * FS, -w / 2, Math.max(0, len - from - 60 * FS), w);
    }
    // 着弾のまぶしさ（ビームの通り道に3か所）
    const impactR = bw * 0.91 * FS;
    for (const d of [0.4, 0.7, 0.95]) {
      const grd = worldCtx.createRadialGradient(len * d, 0, 0, len * d, 0, impactR);
      grd.addColorStop(0, 'rgba(255,244,220,0.85)'); grd.addColorStop(1, 'rgba(255,244,220,0)');
      worldCtx.fillStyle = grd; worldCtx.beginPath(); worldCtx.arc(len * d, 0, impactR, 0, Math.PI * 2); worldCtx.fill();
    }
    // 発射のまぶしさ（本人の頭上あたり・小さめ）
    const ogR = bw * 0.74 * FS;
    const og = worldCtx.createRadialGradient(from, 0, 0, from, 0, ogR);
    og.addColorStop(0, 'rgba(255,250,235,0.85)'); og.addColorStop(1, 'rgba(255,250,235,0)');
    worldCtx.fillStyle = og; worldCtx.beginPath(); worldCtx.arc(from, 0, ogR, 0, Math.PI * 2); worldCtx.fill();
    worldCtx.setTransform(1, 0, 0, 1, 0, 0);
    worldCtx.restore();
  }

  function drawLightning() {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; if (!p.active || p.kind !== 'bolt') continue;
      const s1 = toScreen(p.x, p.y), s2 = toScreen(p.x2, p.y2);
      cw.strokeStyle = p.color; cw.lineWidth = 1.5; cw.globalAlpha = p.life / p.maxLife;
      cw.beginPath(); cw.moveTo(s1.x, s1.y); cw.lineTo(s2.x, s2.y); cw.stroke(); cw.globalAlpha = 1;
    }
  }

  function drawBurstParticles() {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; if (!p.active || p.kind !== 'square') continue;
      const s = toScreen(p.x, p.y);
      cw.globalAlpha = Math.max(0, p.life / p.maxLife);
      cw.fillStyle = p.color; cw.fillRect(s.x - p.size / 2, s.y - p.size / 2, p.size, p.size);
      cw.globalAlpha = 1;
    }
    if (levelPillar > 0) {
      const s = toScreen(P.x, P.y);
      cw.globalCompositeOperation = 'lighter';
      const g = cw.createLinearGradient(s.x, s.y - 80, s.x, s.y + 10);
      g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(0.5, PAL.lightHi); g.addColorStop(1, 'rgba(255,240,200,0)');
      cw.fillStyle = g; cw.globalAlpha = levelPillar / 0.5;
      cw.fillRect(s.x - 10, s.y - 80, 20, 90);
      cw.globalAlpha = 1; cw.globalCompositeOperation = 'source-over';
    }
  }

  function drawPlayer() {
    const s = toScreen(P.x, P.y);
    const playerSize = BALANCE.characterDisplay.combatPlayerSize;
    // 足元は従来位置のまま、上方向へ大きくして顔と持ち物を読めるようにする。
    const playerCenterY = s.y + P.r * 1.3 - playerSize / 2;
    // 操作キャラクターは足元の独立した楕円影を描かない。64px絵から離れて宙に浮いて見えるため。
    if (P.blinkOn) {
      const flip = P.facing.x < 0;
      drawSprite(cfg.charId, s.x, playerCenterY, playerSize, flip);
    }
    // ランタンの光（ゆらぎ・Fx。キャッシュ済みグローを使い回すので毎フレームのグラデ生成なし）
    const flick = 0.8 + Math.sin(elapsed * 9) * 0.08;
    const fp = logicalToFx(s.x, s.y);
    fxLight(fp.x, fp.y, 130 * fxScaleX, '255,190,110', flick, 1.0);
  }

  // ---------- fxキャンバス（ジョイスティック・バナー・暗転文言） ----------
  function drawDamageNumbers() {
    // ターゲット静止画のスタイル：白・小、会心は黄・大。濃い縁取りでくっきり
    cf.textAlign = 'center'; cf.textBaseline = 'middle';
    for (let i = 0; i < dmgNums.length; i++) {
      const d = dmgNums[i]; if (!d.active) continue;
      let p;
      if (use3D) {
        p = Render3D.worldToScreen(d.x, d.y, 22, tmpPt);
        if (p.x < -40 || p.x > elFx.width + 40 || p.y < -40 || p.y > elFx.height + 40) continue;
      } else {
        const s = toScreen(d.x, d.y);
        if (s.x < -20 || s.x > logW + 20 || s.y < -20 || s.y > logH + 20) continue;
        p = logicalToFx(s.x, s.y);
      }
      const alpha = Math.min(1, d.life / (d.maxLife * 0.5));
      cf.font = 'bold ' + fontPx(d.crit ? 15 : 10) + 'px "Segoe UI", sans-serif';
      cf.globalAlpha = alpha;
      cf.lineWidth = fontPx(2.4); cf.strokeStyle = 'rgba(8,4,14,0.9)';
      cf.strokeText(d.text, p.x, p.y);
      cf.fillStyle = d.color || (d.crit ? '#FFD868' : '#F0EAF4');
      cf.fillText(d.text, p.x, p.y);
    }
    cf.globalAlpha = 1;
  }

  function drawFx() {
    cf.clearRect(0, 0, elFx.width, elFx.height);
    if (use3D) drawFlashFade();
    drawDamageNumbers();
    if (stick.active) {
      const appRect = elWorld.parentElement.getBoundingClientRect();
      const dpr = elFx.width / (appRect.width || 1);
      const cx = (stick.cx - appRect.left) * dpr, cy = (stick.cy - appRect.top) * dpr;
      const kx = cx + stick.dx * stick.maxR * dpr, ky = cy + stick.dy * stick.maxR * dpr;
      cf.strokeStyle = 'rgba(240,234,244,0.35)'; cf.lineWidth = 3 * dpr;
      cf.beginPath(); cf.arc(cx, cy, stick.maxR * dpr, 0, Math.PI * 2); cf.stroke();
      cf.fillStyle = 'rgba(255,196,106,0.55)';
      cf.beginPath(); cf.arc(kx, ky, 16 * dpr, 0, Math.PI * 2); cf.fill();
    }
    drawOffscreenMarkers();
    if (banner.t > 0) {
      const w = elFx.width, cy = h_ratio();
      const alpha = Math.min(1, banner.t / banner.dur * 3, banner.t);
      cf.fillStyle = 'rgba(10,4,16,' + (0.7 * Math.min(1, alpha + 0.3)).toFixed(3) + ')';
      cf.fillRect(0, cy - fontPx(22), w, fontPx(44));
      cf.fillStyle = PAL.whiteShadow; cf.textAlign = 'center'; cf.textBaseline = 'middle';
      cf.font = fontPx(16) + 'px sans-serif';
      cf.fillText(banner.text, w / 2, cy);
    }
    if (outro && outro.kind === 'lose') {
      cf.fillStyle = PAL.white; cf.textAlign = 'center'; cf.textBaseline = 'middle';
      cf.font = fontPx(16) + 'px sans-serif';
      cf.globalAlpha = Math.min(1, fadeA);
      cf.fillText('灯りが消えた…', elFx.width / 2, h_ratio());
      cf.globalAlpha = 1;
    }
  }
  // 3Dのときは Render3D が世界を描き、#fx に文字・白フラッシュ・暗転を重ねる。2Dのときは今までどおり
  function drawFrame() {
    if (use3D) { Render3D.draw(Run.view); drawFx(); }
    else { drawWorld(); drawFx(); }
  }
  // 3D用：画面の白フラッシュと暗転（2Dでは drawWorld の最後で描いている）
  function drawFlashFade() {
    const w = elFx.width, h = elFx.height;
    if (flashA > 0) { cf.fillStyle = 'rgba(255,255,255,' + flashA.toFixed(3) + ')'; cf.fillRect(0, 0, w, h); }
    if (fadeA > 0) { cf.fillStyle = 'rgba(6,2,10,' + fadeA.toFixed(3) + ')'; cf.fillRect(0, 0, w, h); }
  }
  // 画面外の敵の方向の印（#fx のふちの小さな三角）。画面外のエリートは金色ですべて、
  // 画面の中の敵が3体未満のときは画面外でいちばん近い3体を白で。毎フレーム配列は作らない
  const markNear = [-1, -1, -1], markDist = [Infinity, Infinity, Infinity];
  function enemyFxPos(e) {
    if (use3D) { Render3D.worldToScreen(e.x, e.y, 14, tmpPt); return tmpPt; }
    tmpPt.x = (e.x - cam.x + logW / 2) * fxScaleX; tmpPt.y = (e.y - cam.y + logH / 2) * fxScaleY; return tmpPt;
  }
  function drawMarker(px, py, W, H, inset, size, color, alpha) {
    const cx = W / 2, cy = H / 2, dx = px - cx, dy = py - cy;
    const s = Math.min((cx - inset) / (Math.abs(dx) || 1e-6), (cy - inset) / (Math.abs(dy) || 1e-6));
    const mx = cx + dx * s, my = cy + dy * s, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
    cf.globalAlpha = alpha; cf.fillStyle = color;
    cf.beginPath();
    cf.moveTo(mx + nx * size, my + ny * size);
    cf.lineTo(mx - nx * size * 0.6 - ny * size * 0.75, my - ny * size * 0.6 + nx * size * 0.75);
    cf.lineTo(mx - nx * size * 0.6 + ny * size * 0.75, my - ny * size * 0.6 - nx * size * 0.75);
    cf.closePath(); cf.fill();
    cf.globalAlpha = 1;
  }
  function drawOffscreenMarkers() {
    const W = elFx.width, H = elFx.height, dpr = W / (elFx.parentElement.getBoundingClientRect().width || W);
    const inset = WORLD.markerInset * dpr, size = 9 * dpr;
    let onscreen = 0;
    for (let i = 0; i < chests.length; i++) {   // 画面の外にある箱は、金色の印で場所を知らせる
      const c = chests[i]; if (!c.active) continue;
      const p = enemyFxPos(c);
      if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) drawMarker(p.x, p.y, W, H, inset, size * 1.15, PAL.rarity.SSR, 0.95);
    }
    markNear[0] = markNear[1] = markNear[2] = -1; markDist[0] = markDist[1] = markDist[2] = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.active) continue;
      const p = enemyFxPos(e);
      if (p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H) { onscreen++; continue; }
      if (e.elite) { drawMarker(p.x, p.y, W, H, inset, size * 1.15, PAL.elite, 0.95); continue; }
      const d = (e.x - P.x) * (e.x - P.x) + (e.y - P.y) * (e.y - P.y);
      if (d < markDist[2]) {   // いちばん近い3体を覚える（入れ替えだけ。配列は作らない）
        markDist[2] = d; markNear[2] = i;
        if (markDist[2] < markDist[1]) { const td = markDist[1], ti = markNear[1]; markDist[1] = markDist[2]; markNear[1] = markNear[2]; markDist[2] = td; markNear[2] = ti; }
        if (markDist[1] < markDist[0]) { const td = markDist[0], ti = markNear[0]; markDist[0] = markDist[1]; markNear[0] = markNear[1]; markDist[1] = td; markNear[1] = ti; }
      }
    }
    if (onscreen < 3) {
      for (let k = 0; k < 3; k++) {
        const i = markNear[k]; if (i < 0) continue;
        const p = enemyFxPos(enemies[i]); drawMarker(p.x, p.y, W, H, inset, size, '#ffffff', 0.6);
      }
    }
  }
  function h_ratio() { return elFx.height * 0.3; }
  function fontPx(logicalPt) { return Math.round(logicalPt * (fxScaleY)); }

  // ============================================================
  //  メインループ
  // ============================================================
  function frame(now) {
    if (!running) return;
    // 60fpsに上限（120Hz端末で電池と発熱を倍食うのを防ぐ。体感は「落ちない60」の方が良い）
    if (now - last < 15.5) { rafId = requestAnimationFrame(frame); return; }
    let raw = (now - last) / 1000; last = now;
    raw = Math.min(raw, 0.05);
    fpsFrames++; fpsAccum += raw;
    if (fpsAccum >= 1) { fps = fpsFrames / fpsAccum; fpsFrames = 0; fpsAccum = 0; }

    // 箱の札・3択を出す（演出中は出さず、予約も捨てる。箱の中身は拾った時点で計上済みなので失われない）。箱が先、3択が後
    if (outro) { choiceQueue = 0; boxQueue.length = 0; }
    else {
      if (!helpOpen && !boxOpen && !choiceOpen && boxQueue.length > 0) openBox(now);
      if (!helpOpen && !boxOpen && !choiceOpen && choiceQueue > 0) openChoice();
    }

    if (boxOpen || choiceOpen || helpOpen) {
      // 一時停止：時間・敵・弾・必殺・被弾はすべて止める。絵は止まったまま描き続ける
      if (boxOpen && !helpOpen) boxTick(now);
      if (flashA > 0) flashA = Math.max(0, flashA - raw * 3);   // 白いフラッシュだけは消えていく
      const keepShake = shakeTime; shakeTime = 0;
      updateHud(); drawFrame();
      shakeTime = keepShake;
      rafId = requestAnimationFrame(frame);
      return;
    }

    if (advance(raw)) return;

    updateHud();
    drawFrame();

    rafId = requestAnimationFrame(frame);
  }

  // 1コマぶんの進行（描かない）。frame と Run.dbg.sim が使う。戻り値 true＝探索が終わった
  function advance(raw) {
    updateFx(raw);
    const dt = hitstop > 0 ? 0 : raw;

    if (dt > 0 && !outro) {
      elapsed += dt;
      updateSpawn(dt);
      for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.active && !e.dead) updateEnemyAI(e, i, dt); }
      separateEnemies();
      applyTerrain(dt);
      buildGrid();
      updatePlayer(dt);
      updatePlayerProjectiles(dt);
      updateTraps(dt);
      updateEnemyProjectiles(dt);
      updateContactDamage();
      updateSpecial(dt);
      updatePickups(dt);
    } else if (dt > 0 && outro) {
      buildGrid();
    }
    updateParticles(dt);
    updateCamera(dt);

    if (outro) {
      outro.t -= raw;
      if (outro.kind === 'lose') fadeA = Math.min(1, fadeA + raw / FEEL.loseFadeT);
      if (outro.t <= 0 && !ended) { ended = true; finish(outro.kind === 'win'); return true; }
    }
    return false;
  }

  function finish(win) {
    Game.onRunEnd({
      win, kills: runKills, sasa: runSasa, xp: runXpTotal, drops,
      rescued: win ? rescued : null, time: elapsed, floor: cfg.floor,
      charId: cfg.charId, eliteKills: eliteKills, runLevelUps: localLv - 1,
    });
    stopInternal();
  }

  // ============================================================
  //  開始・終了・デバッグ
  // ============================================================
  function resetPools() {
    [enemies, pProj, traps, eProj, parts, orbs, chests, dmgNums].forEach(pool => { for (let i = 0; i < pool.length; i++) pool[i].active = false; });
    for (let i = 0; i < pProj.length; i++) pProj[i].blade = false;
    arcFx.length = 0;
    clearGrid();
  }

  function stopInternal() {
    running = false; helpOpen = false;
    boxOpen = false; boxQueue.length = 0; hideBoxPanel();   // 探索を止めたら箱の札も残さない
    if (window.Render3D) Render3D.hide();
    if (elWorld) elWorld.style.display = '';   // 村が #world を使うので戻す
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    offAll();
  }

  const Run = {};
  window.Run = Run;

  Run.start = function (opts) {
    if (running) stopInternal();
    bindDom();
    // 3Dにするか：file://・?r=2d・WebGLが使えないときは今までの2D
    use3D = !!(window.Render3D && Render3D.available() && Render3D.init(elWorld3d));
    if (use3D) { elWorld.style.display = 'none'; Render3D.show(); }
    else { elWorld.style.display = ''; if (window.Render3D) Render3D.hide(); }
    cfg = Object.assign({ charId: 'tomoshibi', floor: 1, stress: false, auto: false }, opts || {});
    stats = Game.calcStats(cfg.charId);
    floorScale = BALANCE.floorScale(cfg.floor);
    FL = FLOORS[cfg.floor] || FLOORS[1]; bossName = '';
    if (use3D && Render3D.setTone) Render3D.setTone(FL.tone);
    cap = cfg.stress ? BALANCE.spawn.stressCap : BALANCE.spawn.cap;

    resetPools();
    elapsed = 0; spawnAccum = 0; eliteAccum = 0;
    firstWaveLeft = cfg.stress ? 0 : WORLD.firstWave.n; firstWaveAcc = WORLD.firstWave.every;   // stress は最初から200体いるので第一波なし
    bossOn = false; bossDone = false; bossIdx = -1; rescued = null;
    ended = false; outro = null; fadeA = 0; flashA = 0; hitstop = 0; shakeTime = 0; shakeMag = 0;
    runXpTotal = 0; runSasa = 0; runKills = 0; drops = []; eliteKills = 0; swingCount = 0; bladeHits = 0; questChipText = '';
    localLv = 1; localXp = 0; localXpNeed = BALANCE.runXpNeed(1);
    choiceQueue = 0; choiceOpen = false; offered.length = 0; questNoticed = false;
    boxQueue.length = 0; boxOpen = false; boxItem = null; forcedBox = null;
    hideBoxPanel();
    for (const k in boostCounts) delete boostCounts[k];
    allies.length = 0; allyShown = false;
    if (elChoicePanel) elChoicePanel.style.display = 'none';
    if (elQuestChip) { elQuestChip.style.display = 'none'; elQuestChip.textContent = ''; }
    special = { active: null, kind: null, t: 0, ringHitSet: null, beamHitSet: null, goroHitSet: null, ringR: 0, castX: 0, castY: 0, dir: { x: 0, y: 1 }, secondPending: 0, fieldT: 0 };
    banner = { t: 0, dur: 0, text: '' };
    specialAnnounceT = 0;
    if (elSpecialAnnounce) elSpecialAnnounce.style.display = 'none';

    P.x = 0; P.y = 0; P.facing = { x: 0, y: 1 }; P.attackT = 0; P.invulnT = 0;
    P.pud = false; P.knockX = 0; P.knockY = 0; P.knockT = 0; P.slowT = 0; P.slowMul = 1; P.sp = 0; P.blinkOn = true;
    maxHp = cfg.stress ? 9999 : stats.hp;
    P.hp = maxHp;
    cam.x = 0; cam.y = 0;

    window.__stats = { fps: 60, enemies: 0 };
    Game.log('runStart', { char: cfg.charId, floor: cfg.floor, auto: !!cfg.auto, stress: !!cfg.stress });

    resize();
    setupInput();

    if (cfg.stress) {
      for (let i = 0; i < 200; i++) {
        const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 260;
        spawnEnemy('ori', Math.cos(a) * r, Math.sin(a) * r, false);
      }
    }

    running = true; last = performance.now(); fpsFrames = 0; fpsAccum = 0;
    rafId = requestAnimationFrame(frame);

    on(window, 'resize', resize);
  };

  Run.stop = function () { stopInternal(); };

  // 操作の一覧を開いているあいだ戦闘を止める。閉じた直後の被弾は3択と同じ無敵で防ぐ
  Run.setHelpPaused = function (on) {
    if (on === helpOpen) return;
    helpOpen = on;
    if (!running) return;
    if (on) clearInputForChoice();
    else { last = performance.now(); P.invulnT = Math.max(P.invulnT, BALANCE.choiceInvuln); }
  };

  // 3Dが読むための窓口（今の変数への参照を返すだけ。コピーはしない）
  Run.view = {
    get P() { return P; }, get cam() { return cam; },
    get enemies() { return enemies; }, get pProj() { return pProj; }, get eProj() { return eProj; },
    get traps() { return traps; }, get orbs() { return orbs; }, get chests() { return chests; },
    get parts() { return parts; }, get dmgNums() { return dmgNums; }, get arcFx() { return arcFx; },
    get special() { return special; }, get stats() { return stats; }, get cfg() { return cfg; },
    get elapsed() { return elapsed; }, get bossIdx() { return bossIdx; },
    get flashA() { return flashA; }, get fadeA() { return fadeA; },
    get shakeTime() { return shakeTime; }, get shakeMag() { return shakeMag; }, get shakeTotal() { return shakeTotal; },
    get levelPillar() { return levelPillar; }, get outro() { return outro; },
    get logW() { return logW; }, get logH() { return logH; },
    get arcRadius() { return arcRadiusNow(); }, get arcAngle() { return arcAngleNow(); }, get arcColor() { return arcColorNow(); },
  };
  Run.is3D = function () { return use3D; };
  Run.setViewFrame = setViewFrame;

  Run.dbg = {
    fillSp: function () { P.sp = 100; },
    triggerSpecial: function () { tryTriggerSpecial(); },
    spawnTestEnemy: function () { const e = spawnEnemy('ori', P.x + 24, P.y, false); return e ? true : false; },
    tutorialMove: function () { if (window.Game && Game.advanceTutorial) Game.advanceTutorial(1); },
    tutorialHit: function () { if (window.Game && Game.advanceTutorial) Game.advanceTutorial(2); },
    finishWin: function () { if (window.Game && Game.onRunEnd) Game.onRunEnd({ win: true, sasa: 100, xp: 0, kills: 0, floor: cfg.floor, time: elapsed, drops: [] }); },
    warpBoss: function () { elapsed = Math.max(0, FL.dur - 0.05); },
    bot: function (on) { botFight = (on === 'stand' || on === 'rush') ? on : !!on; },
    // 調整・テスト用：描かずに時間を進める（?auto=1 のときだけ。箱と3択は自動で片づく）
    sim: function (sec) {
      const raw = 1 / 30; let n = Math.round(sec / raw);
      while (n-- > 0 && running && !ended) {
        if (outro) { choiceQueue = 0; boxQueue.length = 0; }
        else { boxQueue.length = 0; if (choiceQueue > 0 && !choiceOpen) openChoice(); }
        if (choiceOpen) break;
        if (advance(raw)) break;
      }
      return { ended: ended, elapsed: elapsed, hp: P.hp, lv: localLv, boss: bossOn, kills: runKills };
    },
    killBoss: function () { if (bossIdx >= 0 && enemies[bossIdx] && enemies[bossIdx].active && !enemies[bossIdx].dead) killEnemy(bossIdx); },
    // ---- 自動テスト用フック（2026-08-01 合格ゲート版）----
    grantXp: function (n) { grantXp(n); },
    applyBoost: function (id) { applyBoost(id); },
    heal: function () { P.hp = maxHp; },
    nearest: function () { const i = nearestEnemyIdx(); if (i < 0) return null; const e = enemies[i]; return { dx: e.x - P.x, dy: e.y - P.y }; },
    swing: function () { doArcAttack(); },
    weaponProbe: function () {
      let blades = 0; for (let i = 0; i < pProj.length; i++) if (pProj[i].active && pProj[i].blade) blades++;
      return { radius: arcRadiusNow(), angle: (arcAngleNow() * 180) / Math.PI, blades: blades, bladeHits: bladeHits, swings: swingCount, unique: stats.unique };
    },
    rollOffer: function () { return rollOffer([]).slice(); },
    choiceState: function () { return { open: choiceOpen, offered: offered.slice(), queue: choiceQueue }; },
    pickChoice: function (i) { return pickChoice(i); },
    boosts: function () { return Object.assign({}, boostCounts); },
    spawnElite: function () { const e = spawnEnemy('ori', P.x + 40, P.y, true); return e ? true : false; },
    spawnPos: function () { return ringSpawnPos(); },
    viewFrame: function () { return { left: viewFrame.left, right: viewFrame.right, top: viewFrame.top, bottom: viewFrame.bottom }; },   // 湧く位置のテスト用
    poolCounts: function () {   // 3Dの表示数と見比べるテスト用（読むだけ）
      const c = (pool) => { let n = 0; for (let i = 0; i < pool.length; i++) if (pool[i].active) n++; return n; };
      return { enemies: c(enemies), orbs: c(orbs), chests: c(chests), traps: c(traps), proj: c(pProj) + c(eProj), parts: c(parts) };
    },
    killElites: function (n) {
      for (let k = 0; k < n; k++) {
        let idx = -1;
        for (let i = 0; i < enemies.length; i++) if (enemies[i].active && !enemies[i].dead && enemies[i].elite) { idx = i; break; }
        if (idx < 0) { const e = spawnEnemy('ori', P.x + 40, P.y, true); if (!e) break; idx = enemies.indexOf(e); }
        killEnemy(idx);
      }
      return eliteKills;
    },
    // 武器の見た目と効果の観測用
    stats: function () { return stats; },
    probe: function () { return { elapsed: elapsed, paused: choiceOpen || boxOpen || helpOpen, levelUps: localLv - 1, boostTotal: Object.keys(boostCounts).reduce((a, k) => a + boostCounts[k], 0), choicePanelVisible: !!elChoicePanel && elChoicePanel.style.display !== 'none', eliteKills: eliteKills, x: P.x, y: P.y, hp: P.hp, sp: P.sp, invulnT: P.invulnT, slowT: P.slowT, slowMul: P.slowMul, drops: drops.length, specialKind: special.kind, attackKind: stats && stats.atkType, goroHits: special.goroHitSet ? special.goroHitSet.size : 0, tutorialStep: Game.tutorialStep ? Game.tutorialStep() : 0 }; },
    applySlow: function () { P.slowT = FEEL.sleeporbSlowT; P.slowMul = FEEL.sleeporbSlowMul; },
    hurt: function (n) { damagePlayer(n || 5, P.x + 10, P.y); },
    giveChest: function () { drops.push(rollDrop()); },
    // ---- 紙の箱のテスト用（2026-11-05）----
    dropBox: function () { spawnChest(P.x, P.y, false); },
    forceBox: function (rarity, unique) { forcedBox = { rarity: rarity || null, unique: !!unique }; },
    boxState: function () {
      const flags = []; for (let i = 0; i < chests.length; i++) if (chests[i].active) flags.push(!!chests[i].unique);
      return { open: boxOpen, queue: boxQueue.length, rarity: boxItem ? boxItem.drop.rarity : null, unique: boxItem ? !!boxItem.unique : false, chests: flags };
    },
  };
})();
