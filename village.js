// ササノアビス モックアップ - 歩ける村（担当：エージェントV）
// window.Village = { start, stop, pause } を登録する。
// 絵作りは _visual_target.html の paintVillage() をそのまま移植（構図・色・光の値は発明しない）。
// 静的な背景（地形・建物の外殻・小物）は一度だけ描いてキャッシュし、
// 毎フレームは「背景コピー→動くもの（呼吸・炎・ほたる）→Fx.compose」の順で描く。
// このファイルの外（fxcore.js/main.js/run.js/data.js/sprites.js）は読むだけ・書き換えない。

(function () {
  'use strict';

  // ============================================================
  //  レイアウト定数（_visual_target.html の paintVillage() の座標そのまま）
  //  デザインは高さ568pxを想定。実機の高さがそれより高い場合は
  //  SPLIT_Y より下の要素だけを下へ伸ばして隙間を埋める（拡大縮小で歪ませない）。
  // ============================================================
  const DESIGN_W = 320, DESIGN_H = 568;
  const SPLIT_Y = 400;
  const WALK_SPEED = BALANCE.village.walkSpeed; // 論理px/秒
  const BREATH_PERIOD = 0.8;   // 呼吸アニメの周期(秒)
  const PLAYER_R = 10;

  // 施設の位置（すべて「デザイン座標」。SPLIT_Y以上はY()で実行時に押し下げる）
  const GUILD = { x: 18, y: 118, w: 148, h: 96 };
  const GUILD_WIN = { x: 48, y: 140, w: 74, h: 50 };
  const SMITH = { x: 200, y: 158, w: 106, h: 88 };
  const SMITH_FORGE = { x: 216, y: 200, w: 34, h: 46 };
  const CAMP = { x: 156, y: 336 };
  const LAMP1 = { x: 120, y: 452 };   // 下寄り→shift対象
  const LAMP2 = { x: 206, y: 292 };
  const GATE = { x: 116, y: 512, w: 88, h: 56 };
  const STRAW = { x: 250, y: 300 };   // わらの的（修練場）＝かじ屋の下あたり・新設
  const SAPLING = { x: 50, y: 350 };  // 淡く光る若木（スキルの木）＝左中ほど・新設
  const TENT = { x: 100, y: 435 };    // テントは風景。なかま編成の導線はたき火へ移設

  const FIREFLIES_RAW = [
    { x: 58, y: 300 }, { x: 268, y: 340 }, { x: 80, y: 455 },
    { x: 252, y: 420 }, { x: 186, y: 250 }, { x: 40, y: 380 },
  ];

  const FACILITIES_RAW = [
    // 判定は寛容に：道なりに歩いてきた立ち位置が自然に圏内へ入る広さ（2026-08-01 実測+1pxアウト問題の修正）
    { id: 'guild', x: 95, y: 236, r: 58, label: 'はなす', screen: 'guild' },
    { id: 'smith', x: 233, y: 278, r: 54, label: 'はなす', screen: 'smith' },
    { id: 'train', x: STRAW.x, y: STRAW.y + 44, r: 44, label: 'はなす', screen: 'train' },
    { id: 'tree', x: SAPLING.x, y: SAPLING.y + 46, r: 44, label: 'はなす', screen: 'tree' },
    { id: 'party', x: CAMP.x, y: CAMP.y + 24, r: 54, label: 'はなす', screen: 'party' },
    { id: 'gate', x: 160, y: 496, r: 40, label: '潜る', action: 'gate' },
  ];

  // ============================================================
  //  小さなユーティリティ
  // ============================================================
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function hexToRgbStr(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) ^ 1274126177;
    h = (h ^ (h >> 13)) * 1103515245;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }
  function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
  function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function shadowEllipse(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(8,4,14,0.5)';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 呼吸：0.8秒周期で0/-1pxをトグルする「かくかく」ブレス（ドット絵らしさを保つ）
  function bob(t, phase) { return (((t + phase) % BREATH_PERIOD) / BREATH_PERIOD) < 0.5 ? 0 : -1; }

  // ============================================================
  //  DOM・キャンバス
  // ============================================================
  let elWorld, elFx, elApp, wctx, fctx;
  let use3D = false;       // 3Dの村（village3d.js）で描いているか。3Dが使えないとき（?r=2d・file://・WebGLなし）は今までの2Dの村
  let logW = DESIGN_W, logH = DESIGN_H, GAP = 0;
  let SX = 1, SY = 1;      // 論理→表示解像度px（Fxの光・#fx描画用）
  let CX = 1, CY = 1;      // 論理→CSS px（タップ判定用）
  let bgCanvas = null, bgCtx = null;
  let workCanvas = null, workCtx = null;

  function Y(y) { return y >= SPLIT_Y ? y + GAP : y; }

  function bindDom() {
    elWorld = document.getElementById('world');
    elFx = document.getElementById('fx');
    elApp = elWorld.parentElement;
    wctx = elWorld.getContext('2d');
    fctx = elFx.getContext('2d');
  }

  function resize() {
    const rectB = elApp.getBoundingClientRect();
    const dispW = Math.max(1, rectB.width || window.innerWidth);
    const dispH = Math.max(1, rectB.height || window.innerHeight);
    logW = DESIGN_W;
    logH = Math.round(clamp(320 * dispH / dispW, 480, 720));
    GAP = Math.max(0, logH - DESIGN_H);

    // DPRは2で頭打ち（高DPR端末で物理解像度が爆発してスマホ性能を食うのを防ぐ。run.jsと同じ方針）
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const dW = Math.round(dispW * dpr), dH = Math.round(dispH * dpr);
    elWorld.width = dW; elWorld.height = dH;
    elFx.width = dW; elFx.height = dH;
    Object.assign(elWorld.style, { width: '100%', height: '100%' });
    Object.assign(elFx.style, { width: '100%', height: '100%' });
    SX = dW / logW; SY = dH / logH;
    CX = dispW / logW; CY = dispH / logH;

    if (use3D) {
      Village3D.resize(dispW, dispH, logW, logH, dW, dH);   // 3Dの村：地面の絵と建物は village3d.js が持つ（2Dの背景は作らない）
    } else {
      bgCanvas = document.createElement('canvas'); bgCanvas.width = logW; bgCanvas.height = logH;
      bgCtx = bgCanvas.getContext('2d'); bgCtx.imageSmoothingEnabled = false;
      workCanvas = document.createElement('canvas'); workCanvas.width = logW; workCanvas.height = logH;
      workCtx = workCanvas.getContext('2d'); workCtx.imageSmoothingEnabled = false;

      paintBackground(bgCtx, logW, logH);
    }
    rebuildColliders();

    // プレイヤー・カメラの範囲を新しい高さに合わせて再クランプ
    P.x = clamp(P.x, 14, logW - 14);
    P.y = clamp(P.y, 90, logH - 6);
  }

  // ============================================================
  //  静的背景（_visual_target.html paintVillage() を移植。生き物は含まない）
  // ============================================================
  function paintGround(ctx, W, H, opts) {
    rect(ctx, 0, 0, W, H, opts.soil);
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
      const h = hash(x, y);
      if (h < 0.10) rect(ctx, x, y, 2, 1, opts.soilDark);
      else if (h > 0.93) rect(ctx, x, y, 1, 1, opts.soilLight);
    }
    for (let i = 0; i < (opts.cracks || 0); i++) {
      let x = 20 + hash(i, 7) * (W - 40), y = 60 + hash(i, 13) * (H - 100);
      for (let k = 0; k < 8; k++) { px(ctx, x | 0, y | 0, opts.soilDark); x += hash(i, k) * 3 - 1; y += 1 + hash(k, i) * 1.5; }
    }
  }

  function paintCliffTop(ctx, W) {
    rect(ctx, 0, 0, W, 78, '#1A1226');
    for (let x = 0; x < W; x += 6) {
      const hgt = 66 + Math.sin(x * 0.12) * 6 + hash(x, 1) * 8;
      rect(ctx, x, hgt, 6, 4, '#241A32');
      rect(ctx, x, hgt + 4, 6, 2, '#150E20');
      if (hash(x, 3) > 0.75) rect(ctx, x + 2, 20 + hash(x, 5) * 30, 1, 10, '#241A32');
    }
    for (const rx of [30, 96, 210, 286]) {
      for (let k = 0; k < 12; k++) px(ctx, rx + Math.sin(k * 0.8) * 2, 70 + k, '#2E2440');
    }
  }

  function paintStonePath(ctx, pts) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(1, Math.floor(d / 13));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = x0 + (x1 - x0) * t + (hash(i, k) * 6 - 3);
        const y = y0 + (y1 - y0) * t;
        rect(ctx, x - 5, y - 3, 10, 7, '#463856');
        rect(ctx, x - 5, y - 3, 10, 1, '#564668');
        rect(ctx, x - 5, y + 3, 10, 1, '#362A46');
      }
    }
  }

  function paintSasaClump(ctx, x, y, col, colDark, tall) {
    const h = tall ? 16 : 10;
    for (let i = -1; i <= 1; i++) {
      rect(ctx, x + i * 3, y - h + Math.abs(i) * 3, 1, h - Math.abs(i) * 3, colDark);
      px(ctx, x + i * 3 - 1, y - h + Math.abs(i) * 3 + 2, col);
      px(ctx, x + i * 3 + 1, y - h + Math.abs(i) * 3 + 4, col);
    }
  }

  function paintBarrel(ctx, x, y) {
    rect(ctx, x, y, 10, 12, '#4E3A2A'); rect(ctx, x + 1, y, 8, 12, '#5E4632');
    rect(ctx, x, y + 2, 10, 1, '#3A2C20'); rect(ctx, x, y + 8, 10, 1, '#3A2C20');
    shadowEllipse(ctx, x + 5, y + 13, 6, 2);
  }

  function paintLampShell(ctx, x, y) {
    rect(ctx, x, y - 26, 2, 26, '#3A2C48');
    rect(ctx, x - 3, y - 28, 8, 2, '#3A2C48');
    rect(ctx, x + 3, y - 26, 1, 3, '#2A2038');
    rect(ctx, x + 1, y - 23, 5, 6, '#FFB868'); rect(ctx, x + 2, y - 22, 3, 4, '#FFE8B0');
    shadowEllipse(ctx, x + 1, y + 1, 4, 2);
  }

  function paintGuildShell(ctx, o) {
    const GX = GUILD.x, GY = GUILD.y, GW = GUILD.w, GH = GUILD.h;
    rect(ctx, GX - 2, GY + GH, GW + 4, 3, '#160E20');
    rect(ctx, GX, GY, GW, GH, '#463252');
    for (let i = 0; i < GW; i += 8) rect(ctx, GX + i, GY, 1, GH, '#3A2A46');
    rect(ctx, GX, GY + GH - 6, GW, 6, '#3A2A46');
    for (let r = 0; r < 6; r++) rect(ctx, GX - 8 + r, GY - 30 + r * 5, GW + 16 - r * 2, 5, r % 2 ? '#2A1C34' : '#31213E');
    rect(ctx, GX - 8, GY - 2, GW + 16, 3, '#221730');
    const WX = GUILD_WIN.x, WY = GUILD_WIN.y, WW = GUILD_WIN.w, WH = GUILD_WIN.h;
    rect(ctx, WX - 4, WY - 4, WW + 8, WH + 8, '#2A1C34');
    rect(ctx, WX - 2, WY - 2, WW + 4, WH + 4, '#1A1226');
    rect(ctx, WX, WY, WW, WH, '#FFCB86');
    rect(ctx, WX, WY, WW, 8, '#FFE0AC');
    rect(ctx, WX + 6, WY + 8, 16, 2, '#B07840'); rect(ctx, WX + 52, WY + 10, 14, 2, '#B07840');
    rect(ctx, WX + 8, WY + 4, 2, 3, '#D89858'); rect(ctx, WX + 58, WY + 6, 2, 3, '#D89858');
    rect(ctx, WX - 4, WY + WH - 7, WW + 8, 9, '#6A4A34');
    rect(ctx, WX - 4, WY + WH - 7, WW + 8, 2, '#82593E');
    for (const lx of [GX + 12, GX + GW - 18]) {
      rect(ctx, lx, GY + 4, 7, 9, '#E89050'); rect(ctx, lx + 1, GY + 5, 5, 6, '#FFCB86');
      rect(ctx, lx + 2, GY + 1, 3, 3, '#4A3424');
    }
    rect(ctx, GX + GW + 8, GY + 62, 3, 22, '#4A3424'); rect(ctx, GX + GW + 2, GY + 52, 16, 12, '#66503A');
    rect(ctx, GX + GW + 4, GY + 54, 5, 4, '#F0DCC0'); rect(ctx, GX + GW + 10, GY + 55, 5, 6, '#E8CCA8');
    if (!(o && o.noBarrel)) paintBarrel(ctx, GX + 6, GY + GH - 12);   // 3Dの村では樽を円柱で別に置く
  }

  function paintSmithShell(ctx) {
    const SXx = SMITH.x, SYy = SMITH.y, SW = SMITH.w, SH = SMITH.h;
    rect(ctx, SXx - 2, SYy + SH, SW + 4, 3, '#160E20');
    rect(ctx, SXx, SYy, SW, SH, '#3A3444');
    for (let y = 0; y < SH; y += 8) for (let x = 0; x < SW; x += 12) {
      rect(ctx, SXx + x + ((y / 8) % 2) * 6, SYy + y, 10, 6, hash(x, y) > 0.5 ? '#423A4E' : '#363040');
    }
    for (let r = 0; r < 5; r++) rect(ctx, SXx - 7 + r, SYy - 25 + r * 5, SW + 14 - r * 2, 5, r % 2 ? '#241E2E' : '#2B2436');
    rect(ctx, SXx - 7, SYy - 2, SW + 14, 3, '#1D1826');
    rect(ctx, SXx + 14, SYy - 40, 10, 16, '#2E2838'); rect(ctx, SXx + 13, SYy - 42, 12, 3, '#241E2E');
    px(ctx, SXx + 18, SYy - 50, '#FFB868'); px(ctx, SXx + 22, SYy - 58, '#FF8A3A'); px(ctx, SXx + 15, SYy - 64, '#FFD898');
    const FX = SMITH_FORGE.x, FY = SMITH_FORGE.y, FW = SMITH_FORGE.w, FH = SMITH_FORGE.h;
    rect(ctx, FX - 3, FY - 6, FW + 6, FH + 6, '#241A28');
    ctx.beginPath(); ctx.moveTo(FX, FY + FH); ctx.lineTo(FX, FY + 8); ctx.arc(FX + FW / 2, FY + 8, FW / 2, Math.PI, 0); ctx.lineTo(FX + FW, FY + FH); ctx.closePath();
    ctx.fillStyle = '#FF8A3A'; ctx.fill();
    rect(ctx, FX + 5, FY + 12, FW - 10, FH - 12, '#FFB868');
    rect(ctx, FX + 10, FY + 20, FW - 20, FH - 20, '#FFE8B0');
    rect(ctx, SXx + 62, SYy + 66, 18, 7, '#2A2532'); rect(ctx, SXx + 66, SYy + 73, 10, 8, '#221D2C');
    rect(ctx, SXx + SW - 14, SYy + 20, 2, 40, '#4A3424');
    for (let y = 0; y < 8; y += 2) rect(ctx, SXx + SW - 16, SYy + 56 + y, 6, 2, y % 4 ? '#688660' : '#46603F');
    // クレート
    rect(ctx, SXx + 2, SYy + SH - 10, 12, 10, '#54402E'); rect(ctx, SXx + 3, SYy + SH - 9, 10, 8, '#66503A');
    rect(ctx, SXx + 3, SYy + SH - 6, 10, 1, '#54402E'); rect(ctx, SXx + 7, SYy + SH - 9, 1, 8, '#54402E');
  }

  function paintCampfireShell(ctx) {
    const CXx = CAMP.x, CYy = CAMP.y;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      rect(ctx, CXx + Math.cos(a) * 16 - 2, CYy + Math.sin(a) * 9 - 1, 5, 4, '#3E3450');
    }
    rect(ctx, CXx - 12, CYy + 2, 24, 4, '#4A3424'); rect(ctx, CXx - 8, CYy + 5, 16, 3, '#3A2A1C');
    rect(ctx, CXx - 7, CYy - 10, 14, 13, '#FF8A3A');
    rect(ctx, CXx - 4, CYy - 16, 9, 10, '#FFB868');
    rect(ctx, CXx - 2, CYy - 22, 5, 9, '#FFE8B0');
    px(ctx, CXx + 6, CYy - 18, '#FFB868'); px(ctx, CXx - 7, CYy - 16, '#FF8A3A');
    px(ctx, CXx + 10, CYy - 30, '#FFD898'); px(ctx, CXx - 9, CYy - 38, '#FF9A54'); px(ctx, CXx + 2, CYy - 46, '#FFE8B0');
    // ベンチ
    rect(ctx, CXx - 52, CYy + 16, 30, 5, '#4A3424'); rect(ctx, CXx - 52, CYy + 15, 30, 1, '#5E432E');
  }

  function paintGateShell(ctx, H) {
    const gx = GATE.x, gy = Y(GATE.y), gw = GATE.w, gh = GATE.h;
    rect(ctx, gx, gy, gw, gh, '#0E0818');
    for (let i = 0; i < 4; i++) rect(ctx, gx + 8 + i * 3, gy + 8 + i * 11, 72 - i * 6, 6, '#171022');
    rect(ctx, gx - 8, gy - 4, 7, 26, '#3A2C48'); rect(ctx, gx + 89, gy - 4, 7, 26, '#3A2C48');
    rect(ctx, gx - 10, gy - 8, gw + 22, 5, '#463656');
    rect(ctx, gx - 4, gy, gw + 8, 2, '#2E2440');
  }

  function paintStrawTargetShell(ctx) {
    const x = STRAW.x, y = STRAW.y;
    rect(ctx, x - 1, y - 6, 3, 30, '#4A3424');   // 支柱
    shadowEllipse(ctx, x, y + 25, 8, 3);
    // わらの的（同心円）
    const rings = [[9, '#8A6A3E'], [7, '#B0864C'], [5, '#8A6A3E'], [3, '#DCC088']];
    for (const [r, c] of rings) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y - 8, r, 0, Math.PI * 2); ctx.fill(); }
    px(ctx, x, y - 8, '#4A3424');
  }

  function paintSaplingShell(ctx) {
    const x = SAPLING.x, y = SAPLING.y;
    rect(ctx, x - 1, y - 2, 2, 14, '#3E5540');
    shadowEllipse(ctx, x, y + 12, 6, 2);
    // 淡く光る葉冠（ふんわり）
    ctx.fillStyle = '#5A7A56';
    ctx.beginPath(); ctx.ellipse(x, y - 10, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8AC87A';
    ctx.beginPath(); ctx.ellipse(x, y - 12, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
  }

  function paintTentShell(ctx) {
    const x = TENT.x, y = Y(TENT.y);
    shadowEllipse(ctx, x, y + 20, 18, 4);
    rect(ctx, x - 18, y - 2, 36, 20, '#4E3626');
    ctx.fillStyle = '#5E4632';
    ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x, y - 26); ctx.lineTo(x + 18, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#76543A';
    ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x, y - 22); ctx.lineTo(x + 4, y); ctx.closePath(); ctx.fill();
    rect(ctx, x - 3, y - 4, 6, 20, '#221730');   // 入口の暗がり
    rect(ctx, x + 16, y - 30, 1, 8, '#4A3424'); px(ctx, x + 16, y - 31, '#9E7A5A');
  }

  // 地面・崖の上のふち・石畳の道だけ（3Dの村は、これを地面の板に貼る）
  function paintTerrain(ctx, W, H) {
    paintGround(ctx, W, H, { soil: '#241A30', soilDark: '#1C1426', soilLight: '#302440', cracks: 5 });
    paintCliffTop(ctx, W);
    paintStonePath(ctx, [[160, Y(556)], [160, Y(470)], [158, 380], [150, 330], [128, 262]]);
    paintStonePath(ctx, [[160, 380], [216, 320], [242, 268]]);
  }

  function paintBackground(ctx, W, H) {
    paintTerrain(ctx, W, H);

    paintSasaClump(ctx, 16, 320, '#5A7A56', '#3E5540', true);
    paintSasaClump(ctx, 30, Y(460), '#68865E', '#46603F', false);
    paintSasaClump(ctx, 298, 300, '#5A7A56', '#3E5540', false);
    paintSasaClump(ctx, 288, Y(470), '#68865E', '#46603F', true);
    paintSasaClump(ctx, 60, 240, '#5A7A56', '#3E5540', false);

    paintGuildShell(ctx);
    paintSmithShell(ctx);
    paintCampfireShell(ctx);
    paintLampShell(ctx, LAMP1.x, Y(LAMP1.y));
    paintLampShell(ctx, LAMP2.x, LAMP2.y);
    paintGateShell(ctx, H);
    paintStrawTargetShell(ctx);
    paintSaplingShell(ctx);
    paintTentShell(ctx);
  }

  // ============================================================
  //  生き物（動くもの）
  // ============================================================
  let assetsReady = false;
  const VILLAGE_NPCS = [
    { key: 'villager_smith_rest', x: SMITH.x + 86, y: SMITH.y + 96, phase: 0.3 },
    { key: 'villager_tea', x: 34, y: 290, phase: 0.15 },
    { key: 'villager_broom', x: 282, y: 352, phase: 0.5 },
    { key: 'villager_flower', x: 50, y: 410, phase: 0.7 },
  ];
  let campSeats = [];
  const campSeatImgs = Object.create(null);
  function ensureAssets() {
    if (assetsReady) return;
    assetsReady = true;
  }

  function drawVillageNpc(npc, size, t) {
    shadowEllipse(workCtx, npc.x, npc.y, size * 0.28, 4);
    const wasSmoothing = workCtx.imageSmoothingEnabled;
    workCtx.imageSmoothingEnabled = Boolean(Sprites.isIllustrated && Sprites.isIllustrated(npc.key));
    workCtx.drawImage(Sprites.get(npc.key), npc.x - size / 2, npc.y - size + bob(t, npc.phase), size, size);
    workCtx.imageSmoothingEnabled = wasSmoothing;
  }

  function campSeatSprite(charId) {
    if (campSeatImgs[charId]) return campSeatImgs[charId];
    const direct = Sprites.get(charId);
    if (direct) { campSeatImgs[charId] = direct; return direct; }
    const def = Game.charDef(charId);
    const color = (def && PAL.rarity[def.rarity]) || PAL.cloak;
    const item = def && def.atkType === 'homing' ? 'flute' : null;
    campSeatImgs[charId] = Sprites.panda({ cloak: color, scarf: PAL.light, hood: true, eyes: 'normal', item });
    return campSeatImgs[charId];
  }

  function refreshCampSeats() {
    ensureAssets();
    campSeats = typeof Game.prepareCampSeats === 'function' ? Game.prepareCampSeats() : [];
    for (const seat of campSeats) campSeatSprite(seat.charId);
  }

  function drawCampSeat(t, i, size) {
    const member = campSeats[i], pos = CAMP_SEATS[i];
    if (!member || !pos) return;
    const img = campSeatSprite(member.charId);
    const by = bob(t, pos.phase || 0);
    shadowEllipse(workCtx, pos.x, pos.y + 1, size * 0.28, 3);
    const wasSmoothing = workCtx.imageSmoothingEnabled;
    workCtx.imageSmoothingEnabled = Boolean(Sprites.isIllustrated && Sprites.isIllustrated(member.charId));
    workCtx.drawImage(img, pos.x - size / 2, pos.y - size + by, size, size);
    workCtx.imageSmoothingEnabled = wasSmoothing;
  }

  const P = { x: 126, y: 252, facing: { x: 0, y: 1 } };
  let walking = false;

  // GAPが変わる（=resize）ときだけ作り直す。毎フレームは既存配列を読むだけ（配列生成禁止のため）。
  let CACHED_COLLIDERS = [];
  function rebuildColliders() {
    CACHED_COLLIDERS = [
      { x: GUILD.x, y: GUILD.y, w: GUILD.w, h: GUILD.h },
      { x: SMITH.x, y: SMITH.y, w: SMITH.w, h: SMITH.h },
      { x: CAMP.x - 15, y: CAMP.y - 22, w: 30, h: 30 },
      { x: LAMP1.x - 3, y: Y(LAMP1.y) - 26, w: 6, h: 28 },
      { x: LAMP2.x - 3, y: LAMP2.y - 26, w: 6, h: 28 },
      { x: GATE.x - 8, y: Y(GATE.y) - 8, w: 7, h: 26 },
      { x: GATE.x + GATE.w + 1, y: Y(GATE.y) - 8, w: 7, h: 26 },
      { x: GATE.x - 10, y: Y(GATE.y) - 8, w: GATE.w + 22, h: 5 },
      { x: STRAW.x - 3, y: STRAW.y - 8, w: 6, h: 28 },
      { x: SAPLING.x - 3, y: SAPLING.y - 12, w: 6, h: 24 },
      { x: TENT.x - 18, y: Y(TENT.y) - 2, w: 36, h: 20 },
    ];
  }

  function resolveCollisions() {
    for (const c of CACHED_COLLIDERS) {
      const cx = clamp(P.x, c.x, c.x + c.w), cy = clamp(P.y, c.y, c.y + c.h);
      const dx = P.x - cx, dy = P.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < PLAYER_R * PLAYER_R) {
        const d = Math.sqrt(d2) || 0.0001;
        P.x = cx + (dx / d) * PLAYER_R;
        P.y = cy + (dy / d) * PLAYER_R;
      }
    }
    P.x = clamp(P.x, 14, logW - 14);
    P.y = clamp(P.y, 90, logH - 6);
  }

  // ============================================================
  //  ほたる・かがり火の粒
  // ============================================================
  const fireflies = FIREFLIES_RAW.map((f, i) => ({ bx: f.x, by: f.y, phase: i * 1.7, x: f.x, y: f.y }));
  function updateFireflies(t) {
    for (const f of fireflies) {
      f.x = f.bx + Math.sin(t * 0.5 + f.phase) * 10;
      f.y = Y(f.by) + Math.cos(t * 0.37 + f.phase * 1.3) * 7;
    }
  }

  const EMBER_N = 14;
  const embers = Array.from({ length: EMBER_N }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, sway: 0, life: 0, maxLife: 1 }));
  let emberAccum = 0;
  function updateEmbers(dt) {
    emberAccum += dt;
    if (emberAccum >= 0.35) {
      emberAccum -= 0.35;
      const e = embers.find(e => !e.active);
      if (e) {
        e.active = true; e.x = CAMP.x + (Math.random() - 0.5) * 6; e.y = CAMP.y - 14;
        e.vx = (Math.random() - 0.5) * 6; e.vy = -8 - Math.random() * 8;
        e.sway = Math.random() * Math.PI * 2; e.life = 2 + Math.random() * 1.5; e.maxLife = e.life;
      }
    }
    for (const e of embers) {
      if (!e.active) continue;
      e.life -= dt; if (e.life <= 0) { e.active = false; continue; }
      e.sway += dt * 2;
      e.x += (e.vx + Math.sin(e.sway) * 5) * dt; e.y += e.vy * dt;
    }
  }

  // ゲートの紫のもや（4点・ゆっくり明滅して漂う）
  const GATE_DOTS = [
    { x: 140, y: 532, c: '#8A6ACF' }, { x: 174, y: 542, c: '#7A5CBF' },
    { x: 158, y: 554, c: '#9A7ADF' }, { x: 130, y: 548, c: '#6A4CAF' },
  ];

  // ============================================================
  //  入力（run.js と同じ操作感：どこでもタッチ＋WASD/矢印＋Eキー）
  // ============================================================
  const keys = Object.create(null);
  const stick = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0, maxR: 40 };
  let listeners = [];
  function on(t, ev, fn, opts) { t.addEventListener(ev, fn, opts); listeners.push([t, ev, fn, opts]); }
  function offAll() { listeners.forEach(([t, ev, fn, opts]) => t.removeEventListener(ev, fn, opts)); listeners = []; }

  // タップ判定用のヒット矩形（毎フレーム更新。座標は論理px）
  let hit = { sound: null, chip: null, modal: null, minus: null, plus: null, dive: null, close: null };
  let gateModalOpen = false;
  let floorSel = 1;

  function toLogical(clientX, clientY) {
    const r = elApp.getBoundingClientRect();
    return { x: (clientX - r.left) / CX, y: (clientY - r.top) / CY };
  }
  function inCircle(p, c) { return c && Math.hypot(p.x - c.x, p.y - c.y) <= c.r; }
  function inRect(p, r) { return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

  function toggleSfx() {
    Audio3.cycle();   // 全部On → 効果音のみ → Off → 全部On
  }

  function clearKeys() { for (const k in keys) keys[k] = false; }

  function openGateModal() {
    floorSel = clamp(floorSel || Game.state.floor, 1, Game.state.floor);
    gateModalOpen = true;
    clearKeys();   // 歩いたまま開いても、窓の裏で歩き続けない
  }

  function changeFloor(d) {
    const next = clamp(floorSel + d, 1, Game.state.floor);
    if (next === floorSel) { Game.sfx('deny'); return; }
    floorSel = next; Game.sfx('click');
  }
  function diveFromModal() { gateModalOpen = false; Game.actions.startRun(floorSel); }

  // 階層の窓のキー操作。長押しのくり返しで「開いた瞬間に潜る」ことがないよう、決定は押し直しだけ受ける
  function handleModalKey(e) {
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA' || c === 'ArrowDown' || c === 'KeyS') { e.preventDefault(); changeFloor(-1); }
    else if (c === 'ArrowRight' || c === 'KeyD' || c === 'ArrowUp' || c === 'KeyW') { e.preventDefault(); changeFloor(1); }
    else if (e.repeat) return;
    else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space' || c === 'KeyE') { e.preventDefault(); diveFromModal(); }
    else if (c === 'Escape' || c === 'KeyQ' || c === 'Backspace') { e.preventDefault(); gateModalOpen = false; }
  }

  function triggerInteract() {
    if (gateModalOpen) return;
    const f = nearFacility;
    if (!f) return;
    if (f.action === 'gate') openGateModal();
    else Game.show(f.screen);
  }

  function handleModalTap(p) {
    if (inRect(p, hit.minus)) { changeFloor(-1); return; }
    if (inRect(p, hit.plus)) { changeFloor(1); return; }
    if (inRect(p, hit.dive)) { diveFromModal(); return; }
    if (!inRect(p, hit.modal)) { gateModalOpen = false; return; }
  }

  function onPointerDown(e) {
    const p = toLogical(e.clientX, e.clientY);
    if (gateModalOpen) { handleModalTap(p); return; }
    if (inRect(p, hit.sound)) { toggleSfx(); return; }
    if (inRect(p, hit.help)) { if (window.UI && UI.toggleHelp) UI.toggleHelp(); return; }
    if (nearFacility && inCircle(p, hit.chip)) { triggerInteract(); return; }
    if (stick.active) return;
    stick.active = true; stick.id = e.pointerId;
    stick.cx = e.clientX; stick.cy = e.clientY;
    stick.dx = 0; stick.dy = 0;
    const appRect = elApp.getBoundingClientRect();
    stick.maxR = Math.min(appRect.width, appRect.height) * 0.14;
  }
  function onPointerMove(e) {
    if (!stick.active || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    const d = Math.hypot(dx, dy) || 1;
    const clampR = Math.min(d, stick.maxR) / d;
    stick.dx = (dx * clampR) / stick.maxR; stick.dy = (dy * clampR) / stick.maxR;
  }
  function endStick(e) { if (e.pointerId === stick.id) { stick.active = false; stick.id = null; stick.dx = 0; stick.dy = 0; } }

  function setupInput() {
    offAll(); // 再入時に二重登録しないよう、まず既存のリスナーを外す
    on(window, 'keydown', (e) => {
      if (!running) return;   // 施設のメニューを開いているあいだは村は止まっている（ここで受けると施設に入り直す）
      if (gateModalOpen) { handleModalKey(e); return; }
      keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        if (e.code === 'Space') e.preventDefault();
        triggerInteract();
      } else if (e.code === 'KeyM') toggleSfx();
    });
    on(window, 'keyup', (e) => { keys[e.code] = false; });
    on(elApp, 'pointerdown', onPointerDown);
    on(elApp, 'pointermove', onPointerMove);
    on(elApp, 'pointerup', endStick);
    on(elApp, 'pointercancel', endStick);
    on(elApp, 'contextmenu', (e) => e.preventDefault());
    on(window, 'resize', resize);
  }

  function inputAxis() {
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

  // ============================================================
  //  更新・描画
  // ============================================================
  let nearFacility = null;
  // 看板の見え方（0=非表示/1=表示）。施設ごとの接近距離で0.3秒フェードイン、離れたらフェードアウト
  const SIGN_FADE_SEC = 0.3;
  const SIGN_APPROACH_PAD = BALANCE.village.signApproachPad;
  const signAlpha = Object.create(null);
  for (const raw of FACILITIES_RAW) signAlpha[raw.id] = 0;

  function update(dt, t) {
    const axis = inputAxis();
    const mag = Math.hypot(axis.x, axis.y);
    walking = mag > 0.05;
    if (walking) {
      P.facing.x = axis.x; P.facing.y = axis.y;
      P.x += axis.x * WALK_SPEED * dt;
      P.y += axis.y * WALK_SPEED * dt;
    }
    resolveCollisions();

    let best = null, bestD = Infinity;
    const fadeRate = dt / SIGN_FADE_SEC;
    for (const raw of FACILITIES_RAW) {
      const fy = Y(raw.y);
      const d = Math.hypot(P.x - raw.x, P.y - fy);
      if (d <= raw.r && d < bestD) { bestD = d; best = raw; }
      // スキルの木は見落とされないよう、たき火付近から名前が見える。
      const approachPad = raw.id === 'tree' ? BALANCE.village.treeSignApproachPad : SIGN_APPROACH_PAD;
      const target = d <= raw.r + approachPad ? 1 : 0;
      const cur = signAlpha[raw.id] || 0;
      signAlpha[raw.id] = target > cur ? Math.min(1, cur + fadeRate) : Math.max(0, cur - fadeRate);
    }
    nearFacility = best;

    updateFireflies(t);
    updateEmbers(dt);
  }

  function drawDynamic(t) {
    workCtx.clearRect(0, 0, logW, logH);
    workCtx.drawImage(bgCanvas, 0, 0);

    ensureAssets();
    const npcSize = BALANCE.characterDisplay.villageNpcSize;
    const playerSize = BALANCE.characterDisplay.villagePlayerSize;

    // メイメイ（ギルド窓）
    shadowEllipse(workCtx, GUILD_WIN.x + GUILD_WIN.w / 2, GUILD_WIN.y + GUILD_WIN.h + 2, npcSize * 0.28, 4);
    const meimeiSmoothing = workCtx.imageSmoothingEnabled;
    workCtx.imageSmoothingEnabled = Boolean(Sprites.isIllustrated && Sprites.isIllustrated('meimei'));
    workCtx.drawImage(Sprites.get('meimei'), GUILD_WIN.x + GUILD_WIN.w / 2 - npcSize / 2, GUILD_WIN.y + GUILD_WIN.h + 1 - npcSize + bob(t, 0), npcSize, npcSize);
    workCtx.imageSmoothingEnabled = meimeiSmoothing;

    // 役割が見える正式村人4体（ロード前はSpritesの手続きfallback）
    for (const npc of VILLAGE_NPCS) drawVillageNpc(npc, npcSize, t);

    // たき火のなかま。奥の2席→火を重ね直す→手前3席の順で前後関係を作る
    const campSize = Math.min(38, npcSize);
    drawCampSeat(t, 2, campSize); drawCampSeat(t, 3, campSize);
    if (campSeats[2] || campSeats[3]) paintCampfireShell(workCtx);
    drawCampSeat(t, 0, campSize); drawCampSeat(t, 1, campSize); drawCampSeat(t, 4, campSize);

    // ほたる
    for (const f of fireflies) px(workCtx, Math.round(f.x), Math.round(f.y), '#D8E8A0');

    // かがり火の粒（上へ流れる残り火）
    for (const e of embers) {
      if (!e.active) continue;
      const a = Math.max(0, e.life / e.maxLife);
      workCtx.globalCompositeOperation = 'lighter';
      workCtx.globalAlpha = a * 0.8; workCtx.fillStyle = '#FFC46A';
      workCtx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1);
      workCtx.globalAlpha = 1; workCtx.globalCompositeOperation = 'source-over';
    }

    // 淵の門のもや（ゆっくり明滅して漂う）
    for (let i = 0; i < GATE_DOTS.length; i++) {
      const g = GATE_DOTS[i];
      const dx = Math.sin(t * 0.6 + i * 1.4) * 2, dy = Math.cos(t * 0.5 + i) * 2;
      px(workCtx, Math.round(g.x + dx), Math.round(Y(g.y) + dy), g.c);
    }

    // プレイヤー（ともしび）
    const pb = walking ? 0 : bob(t, 0.6);
    // 操作中の主役は楕円影を描かず、絵の足をそのまま地面位置へ合わせる。
    workCtx.save();
    workCtx.translate(Math.round(P.x), Math.round(P.y + pb));
    workCtx.imageSmoothingEnabled = Boolean(Sprites.isIllustrated && Sprites.isIllustrated('tomoshibi'));
    if (P.facing.x < -0.05) workCtx.scale(-1, 1);
    workCtx.drawImage(Sprites.get('tomoshibi'), -playerSize / 2, 16 - playerSize, playerSize, playerSize);
    workCtx.restore();
  }

  function pushLights(t) {
    Fx.begin();
    // ギルド：受付窓＋提灯2つ＋建物の見え
    Fx.light((GUILD_WIN.x + GUILD_WIN.w / 2) * SX, (GUILD_WIN.y + GUILD_WIN.h / 2) * SY, 130 * SX, '255,185,105', 0.85, 1.0);
    for (const lx of [GUILD.x + 12, GUILD.x + GUILD.w - 18]) {
      Fx.light((lx + 3) * SX, (GUILD.y + 8) * SY, 42 * SX, '255,170,90', 0.5 * (0.9 + 0.1 * Math.sin(t * 4)), 0.7);
    }
    Fx.seen((GUILD.x + GUILD.w / 2) * SX, (GUILD.y + 40) * SY, 110 * SX, 0.42);
    // かじ屋：炉の光＋建物の見え
    const FX_ = SMITH_FORGE.x + SMITH_FORGE.w / 2, FY_ = SMITH_FORGE.y + SMITH_FORGE.h / 2;
    Fx.light(FX_ * SX, FY_ * SY, 130 * SX, '255,130,55', 1.0 * (0.92 + 0.08 * Math.sin(t * 6.1)), 1.0);
    Fx.seen((SMITH.x + SMITH.w / 2) * SX, (SMITH.y + 44) * SY, 100 * SX, 0.4);
    // たき火
    Fx.light(CAMP.x * SX, (CAMP.y - 8) * SY, 195 * SX, '255,175,95', 1.0 * (0.85 + 0.15 * Math.sin(t * 5.3)), 1.0);
    for (let i = 0; i < campSeats.length && i < CAMP_SEATS.length; i++) {
      Fx.seen(CAMP_SEATS[i].x * SX, CAMP_SEATS[i].y * SY, 34 * SX, 0.5);
    }
    // ランプ2本
    Fx.light(LAMP1.x * SX, (Y(LAMP1.y) - 20) * SY, 60 * SX, '255,180,100', 0.55 * (0.9 + 0.1 * Math.sin(t * 3.7)), 0.8);
    Fx.light(LAMP2.x * SX, (LAMP2.y - 20) * SY, 60 * SX, '255,180,100', 0.55 * (0.9 + 0.1 * Math.sin(t * 3.7 + 2)), 0.8);
    // 淵の門
    Fx.light(160 * SX, Y(546) * SY, 95 * SX, '150,110,235', 0.6 * (0.9 + 0.1 * Math.sin(t * 2.2)), 0.4);
    // ほたる
    for (const f of fireflies) Fx.light(f.x * SX, f.y * SY, 20 * SX, '200,230,140', 0.55, 0.3);
    // 若木のやわらかい光
    Fx.light(SAPLING.x * SX, (SAPLING.y - 11) * SY, 34 * SX, hexToRgbStr(ELEMENTS.sprout.color), 0.5 * (0.85 + 0.15 * Math.sin(t * 1.6)), 0.4);
    Fx.seen(SAPLING.x * SX, SAPLING.y * SY, 36 * SX, 0.32);
    // わらの的・テントも薄く見えるように
    Fx.seen(STRAW.x * SX, STRAW.y * SY, 42 * SX, 0.3);
    Fx.seen(TENT.x * SX, Y(TENT.y) * SY, 46 * SX, 0.32);
    // プレイヤーのランタン
    const flick = 0.65 * (0.9 + 0.1 * Math.sin(t * 9));
    Fx.light(P.x * SX, (P.y - 6) * SY, 105 * SX, '255,190,110', flick, 0.95);
  }

  // ---------- #fx オーバーレイ（HUD・チップ・プロンプト・ゲートの小オーバーレイ） ----------
  function chip(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  function fpx(pt) { return Math.round(pt * SY); }

  // #fx のpx。2Dは論理座標に SX・SY を掛け、3Dは3Dの位置 (x, z, 高さ) を画面へ変換する（見えている場所と押せる場所をずらさないため、押せる範囲もこの位置から作る）
  const _fp = { x: 0, y: 0 };
  function fxAt(x2, y2, x3, z3, e3) {
    if (use3D) { const q = Village3D.project(x3, z3, e3); _fp.x = q.sx; _fp.y = q.sy; }
    else { _fp.x = x2 * SX; _fp.y = y2 * SY; }
    return _fp;
  }
  const LEAN = ((window.RENDER3D && RENDER3D.paper) ? RENDER3D.paper.leanDeg : 12) * Math.PI / 180;   // 紙人形の板の起こした角度（頭の位置を測る）

  // 常時ではなく「近づいたときだけ」フェードイン表示する看板（alpha: 0〜1）
  function drawSign(ctx, p, text, alpha) {
    if (!alpha || alpha <= 0) return;
    const dx = p.x, dy = p.y;
    ctx.font = 'bold ' + fpx(15) + 'px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + fpx(24);
    ctx.globalAlpha = alpha;
    chip(ctx, dx - w / 2, dy - fpx(14), w, fpx(27), fpx(5), 'rgba(56,38,26,0.93)', 'rgba(165,132,92,0.75)');
    ctx.fillStyle = '#F0DCC0'; ctx.fillText(text, dx, dy + fpx(1));
    ctx.globalAlpha = 1;
  }

  function drawOverlay(t) {
    fctx.clearRect(0, 0, elFx.width, elFx.height);
    fctx.textAlign = 'center'; fctx.textBaseline = 'middle';

    // 新加入の印。編成画面を開くまで、たき火の子の頭上に小さく表示する
    for (let i = 0; i < campSeats.length && i < CAMP_SEATS.length; i++) {
      if (!campSeats[i].isNew) continue;
      const pos = CAMP_SEATS[i];
      const nw = fpx(30), nh = fpx(15), np = fxAt(pos.x, pos.y - 48, pos.x, pos.y, 46);
      const nx = np.x - nw / 2, ny = use3D ? np.y - nh : np.y;   // 3Dは頭の上に置く
      chip(fctx, nx, ny, nw, nh, fpx(7), 'rgba(255,196,106,0.96)', 'rgba(255,240,200,0.9)');
      fctx.fillStyle = '#241A30'; fctx.font = 'bold ' + fpx(9) + 'px "Segoe UI", sans-serif';
      fctx.fillText('NEW', nx + nw / 2, ny + nh / 2 + 1);
    }

    // 看板：近づいたときだけフェードイン。スキルの木だけ発見距離を広くする
    // （3Dの位置：建物は屋根の上、小物は上のほう。2Dの位置は今までどおり）
    const RG = RENDER3D.village;
    drawSign(fctx, fxAt(GUILD.x + GUILD.w / 2 - 6, GUILD.y - 40, GUILD.x + GUILD.w / 2 - 6, GUILD.y + GUILD.h - RG.guild.depth / 2, GUILD.h + RG.guild.roofH + 16), 'ギルド', signAlpha.guild);
    drawSign(fctx, fxAt(SMITH.x + SMITH.w / 2, SMITH.y - 34, SMITH.x + SMITH.w / 2, SMITH.y + SMITH.h - RG.smith.depth / 2, SMITH.h + RG.smith.roofRise + 16), 'かじ屋', signAlpha.smith);
    drawSign(fctx, fxAt(STRAW.x, STRAW.y - 26, STRAW.x, STRAW.y + 24, 56), '修練場', signAlpha.train);
    drawSign(fctx, fxAt(SAPLING.x, SAPLING.y - 34, SAPLING.x, SAPLING.y + 12, 46), 'スキルの木', signAlpha.tree);
    drawSign(fctx, fxAt(CAMP.x, CAMP.y - 58, CAMP.x, CAMP.y, 60), 'なかま', signAlpha.party);
    drawSign(fctx, fxAt(160, Y(496) - 24, 160, Y(GATE.y) + GATE.h, 30), '淵へ', signAlpha.gate);   // 3D：門の暗い穴の上（主人公の体に重ならない低い位置）

    // メイメイ頭上の「！」
    const qp = fxAt(GUILD_WIN.x + GUILD_WIN.w + 12, GUILD_WIN.y - 8, GUILD_WIN.x + GUILD_WIN.w + 12, GUILD.y + GUILD.h + 4, GUILD.y + GUILD.h - (GUILD_WIN.y - 8));
    const qx = qp.x, qy = qp.y;
    fctx.font = 'bold ' + fpx(20) + 'px "Segoe UI", sans-serif';
    fctx.shadowColor = 'rgba(255,220,120,0.95)'; fctx.shadowBlur = fpx(12);
    fctx.fillStyle = '#FFD868'; fctx.fillText('!', qx, qy);
    fctx.shadowBlur = 0;

    // 接近時UIは「はなす」チップ1つだけ（頭上チップ＋画面下ボタン＋吹き出しの三重表示をやめて統合）
    hit.chip = null;
    if (nearFacility) {
      // 64pxの主役の顔が隠れないよう、チップ全体をキャラクターの上端より外へ出す。
      // 画面上端に余裕がない場合だけ、足元より下へ逃がす。
      const chipH = fpx(30);
      const playerTop = P.y + 16 - BALANCE.characterDisplay.villagePlayerSize;
      const playerBottom = P.y + 16;
      fctx.font = 'bold ' + fpx(14) + 'px "Segoe UI", sans-serif';
      const cw = fctx.measureText(nearFacility.label).width + fpx(34);
      const cMargin = fpx(8);
      let chipCx = P.x * SX, aboveY = (playerTop - 6) * SY - chipH, belowY = (playerBottom + 6) * SY;
      if (use3D) {
        const ps = BALANCE.characterDisplay.villagePlayerSize;
        const head = fxAt(0, 0, P.x, playerBottom - ps * Math.sin(LEAN), ps * Math.cos(LEAN));   // 頭のてっぺん
        chipCx = head.x; aboveY = head.y - fpx(6) - chipH;
        belowY = fxAt(0, 0, P.x, playerBottom, 0).y + fpx(6);                                       // 足元の下
      }
      const cx0 = clamp(chipCx - cw / 2, cMargin, elFx.width - cw - cMargin);
      const cy0 = aboveY >= cMargin ? aboveY : Math.min(belowY, elFx.height - chipH - cMargin);
      const chipCenterY = cy0 + chipH / 2;
      chip(fctx, cx0, cy0, cw, chipH, fpx(15), 'rgba(242,236,246,0.96)');
      fctx.fillStyle = '#241A30'; fctx.fillText(nearFacility.label, cx0 + cw / 2 + fpx(6), chipCenterY + fpx(1));
      fctx.fillStyle = '#FFC46A'; fctx.beginPath(); fctx.arc(cx0 + fpx(15), chipCenterY, fpx(7), 0, Math.PI * 2); fctx.fill();
      fctx.fillStyle = '#241A30'; fctx.font = 'bold ' + fpx(10) + 'px "Segoe UI", sans-serif'; if (!isTouchDevice()) fctx.fillText('E', cx0 + fpx(15), chipCenterY + fpx(1));   // PCはキーボードのE。タッチは文字なし
      // ヒット矩形は論理座標で保持する（タップ判定はtoLogical()で論理座標化するため）
      hit.chip = {
        x: (cx0 + cw / 2) / SX,
        y: chipCenterY / SY,
        r: (cw / 2) / SX,
        left: cx0 / SX,
        top: cy0 / SY,
        right: (cx0 + cw) / SX,
        bottom: (cy0 + chipH) / SY,
      };
    }

    // 左上：笹チップ
    chip(fctx, fpx(12), fpx(12), fpx(100), fpx(32), fpx(16), 'rgba(14,9,24,0.75)', 'rgba(122,92,146,0.55)');
    fctx.textAlign = 'left';
    fctx.font = 'bold ' + fpx(14) + 'px "Segoe UI", sans-serif';
    fctx.fillStyle = '#8AC87A'; fctx.fillText('笹', fpx(28), fpx(29));
    fctx.fillStyle = '#F0EAF4'; fctx.fillText(String(Game.state.sasa), fpx(52), fpx(29));

    // 右上：設定（音）ボタン
    // 3段階：音On／効果音のみ／音Off。「効果音のみ」は字が長いので、札を横に広げて字を1段小さくする
    const sbLabel = window.Audio3 ? Audio3.label() : (Game.state.settings.sfx ? '音On' : '音Off');
    const sbLong = sbLabel === '効果音のみ';
    const sbKey = window.isTouchDevice() ? '' : ' M';   // キーボードの人には切り替えのキーを見せる
    const sbW = fpx((sbLong ? 74 : 44) + (sbKey ? 14 : 0)), sbH = fpx(32), sbX = elFx.width - sbW - fpx(12), sbY = fpx(12);
    chip(fctx, sbX, sbY, sbW, sbH, fpx(16), 'rgba(14,9,24,0.75)', 'rgba(122,92,146,0.55)');
    fctx.textAlign = 'center';
    fctx.font = 'bold ' + fpx(sbLong ? 11 : 12) + 'px "Segoe UI", sans-serif';
    fctx.fillStyle = sbLabel === '音Off' ? '#7C7488' : (sbLong ? '#E6C98A' : '#FFC46A');
    fctx.fillText(sbLabel + sbKey, sbX + sbW / 2, sbY + sbH / 2 + 1);
    hit.sound = { x: sbX / SX, y: sbY / SY, w: sbW / SX, h: sbH / SY };
    // 操作の一覧の札（キーボードの人だけ）。音の札の左に同じ形で並べる
    if (sbKey) {
      const hbW = fpx(58), hbX = sbX - hbW - fpx(8);
      chip(fctx, hbX, sbY, hbW, sbH, fpx(16), 'rgba(14,9,24,0.75)', 'rgba(122,92,146,0.55)');
      fctx.font = 'bold ' + fpx(12) + 'px "Segoe UI", sans-serif';
      fctx.fillStyle = '#EFE8F5';
      fctx.fillText('操作 H', hbX + hbW / 2, sbY + sbH / 2 + 1);
      hit.help = { x: hbX / SX, y: sbY / SY, w: hbW / SX, h: sbH / SY };
    } else hit.help = null;

    if (gateModalOpen) drawGateModal();
  }

  function drawGateModal() {
    const w = elFx.width, h = elFx.height;
    fctx.fillStyle = 'rgba(6,3,10,0.62)'; fctx.fillRect(0, 0, w, h);
    const pw = fpx(220), ph = fpx(150);
    const px0 = w / 2 - pw / 2, py0 = h / 2 - ph / 2;
    chip(fctx, px0, py0, pw, ph, fpx(10), 'rgba(26,18,32,0.96)', 'rgba(122,92,146,0.7)');
    fctx.textAlign = 'center'; fctx.textBaseline = 'middle';
    fctx.fillStyle = '#F0EAF4'; fctx.font = 'bold ' + fpx(14) + 'px "Segoe UI", sans-serif';
    fctx.fillText('潜る階層を選ぶ', px0 + pw / 2, py0 + fpx(26));

    const minusX = px0 + fpx(30), plusX = px0 + pw - fpx(30), midY = py0 + fpx(70);
    fctx.font = 'bold ' + fpx(20) + 'px "Segoe UI", sans-serif';
    chip(fctx, minusX - fpx(20), midY - fpx(20), fpx(40), fpx(40), fpx(20), 'rgba(58,40,72,0.9)', '#7A5C92');
    fctx.fillStyle = '#F0EAF4'; fctx.fillText('−', minusX, midY + fpx(1));
    chip(fctx, plusX - fpx(20), midY - fpx(20), fpx(40), fpx(40), fpx(20), 'rgba(58,40,72,0.9)', '#7A5C92');
    fctx.fillStyle = '#F0EAF4'; fctx.fillText('＋', plusX, midY + fpx(1));
    fctx.font = 'bold ' + fpx(17) + 'px "Segoe UI", sans-serif';
    fctx.fillStyle = '#F0EAF4'; fctx.fillText('第 ' + floorSel + ' 階', px0 + pw / 2, midY + fpx(1));

    const dw = pw - fpx(40), dh = fpx(40), dx = px0 + fpx(20), dy = py0 + ph - fpx(56);
    chip(fctx, dx, dy, dw, dh, fpx(8), '#C47C3A', '#FFC46A');
    fctx.fillStyle = '#1A1220'; fctx.font = 'bold ' + fpx(15) + 'px "Segoe UI", sans-serif';
    fctx.fillText('潜る', dx + dw / 2, dy + dh / 2 + 1);

    hit.modal = { x: px0 / SX, y: py0 / SY, w: pw / SX, h: ph / SY };
    hit.minus = { x: (minusX - fpx(20)) / SX, y: (midY - fpx(20)) / SY, w: fpx(40) / SX, h: fpx(40) / SY };
    hit.plus = { x: (plusX - fpx(20)) / SX, y: (midY - fpx(20)) / SY, w: fpx(40) / SX, h: fpx(40) / SY };
    hit.dive = { x: dx / SX, y: dy / SY, w: dw / SX, h: dh / SY };

    if (!window.isTouchDevice()) {   // キーボードの案内は窓の下に
      fctx.fillStyle = '#C9BDD8'; fctx.font = fpx(11) + 'px "Segoe UI", sans-serif';
      fctx.fillText('← → 階を選ぶ　Enter 潜る　Esc もどる', px0 + pw / 2, py0 + ph + fpx(16));
    }
  }

  // ============================================================
  //  メインループ
  // ============================================================
  let running = false, rafId = null, last = 0, elapsed = 0, initialized = false;

  function frame(now) {
    if (!running) return;
    // 60fpsに上限（120Hz端末で電池と発熱を倍食うのを防ぐ。run.jsと同じ方針）
    if (now - last < 15.5) { rafId = requestAnimationFrame(frame); return; }
    let raw = (now - last) / 1000; last = now;
    raw = Math.min(raw, 0.05);
    elapsed += raw;

    update(raw, elapsed);
    if (use3D) {
      Village3D.draw(Village.view, elapsed);   // 3Dの村（光は点光源2つ＋光の板）
    } else {
      drawDynamic(elapsed);
      pushLights(elapsed);
      Fx.compose(wctx, workCanvas, { darkness: 0.62, ambient: '16,9,28', fog: elapsed });
    }
    drawOverlay(elapsed);

    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    running = true; last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function haltLoop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    offAll();
  }

  const Village = {};
  window.Village = Village;

  // 3D側（village3d.js）が読むための窓口。今の変数への参照を返すだけ（コピーしない）。Run.view と同じく getter
  const SASA_CLUMPS = [{ x: 16, y: 320, tall: true }, { x: 30, y: 460, tall: false }, { x: 298, y: 300, tall: false }, { x: 288, y: 470, tall: true }, { x: 60, y: 240, tall: false }];
  const LAYOUT = { GUILD, GUILD_WIN, SMITH, SMITH_FORGE, CAMP, LAMP1, LAMP2, LAMPS: [LAMP1, LAMP2], GATE, GATE_DOTS, STRAW, SAPLING, TENT, SASA: SASA_CLUMPS, SPLIT_Y };
  const PAINT = {
    terrain: paintTerrain,
    guild: function (ctx) { paintGuildShell(ctx, { noBarrel: true }); },
    smith: paintSmithShell,
    gate: function (ctx) { paintGateShell(ctx, logH); },
    straw: paintStrawTargetShell,
    sapling: paintSaplingShell,
    sasa: function (ctx, x, y) { paintSasaClump(ctx, x, y, '#5A7A56', '#3E5540', true); },
  };
  Village.view = {
    get P() { return P; }, get facing() { return P.facing; }, get walking() { return walking; },
    get npcs() { return VILLAGE_NPCS; }, get campSeats() { return campSeats; }, get seatCount() { return CAMP_SEATS.length; },
    get fireflies() { return fireflies; }, get embers() { return embers; },
    get GAP() { return GAP; }, get logW() { return logW; }, get logH() { return logH; }, get nearFacility() { return nearFacility; },
    layout: LAYOUT, paint: PAINT, Y: Y, bob: bob,
    seatSprite: function (i) { return campSeats[i] ? campSeatSprite(campSeats[i].charId) : null; },
  };
  Village.is3D = function () { return use3D; };

  Village.dbg = {
    setPlayer: function (x, y) { P.x = x; P.y = y; },
    helpClient: function () { const r = elApp.getBoundingClientRect(), h = hit.help; return h ? { x: r.left + (h.x + h.w / 2) * CX, y: r.top + (h.y + h.h / 2) * CY } : null; },
    nearFacility: function () { return nearFacility ? nearFacility.id : null; },
    campSeats: function () { return campSeats.map(s => ({ charId: s.charId, isNew: s.isNew })); },
    interactionChipRect: function () {
      if (!hit.chip) return null;
      return { left: hit.chip.left, top: hit.chip.top, right: hit.chip.right, bottom: hit.chip.bottom };
    },
    // 階層の窓（潜り口）の状態と、押せる範囲・論理→CSS pxの倍率（テスト用。位置は論理px）
    gateModalOpen: function () { return gateModalOpen; },
    modalRects: function () { return { modal: hit.modal, dive: hit.dive, minus: hit.minus, plus: hit.plus }; },
    scale: function () { return { cx: CX, cy: CY }; },
    toggleSound: function () { toggleSfx(); },   // 看板の「音」を押したのと同じ（テスト用）
  };

  Village.start = function () {
    bindDom();
    // 3Dが使えるとき（?r=2d・file://・WebGLなし以外）は3Dの村。使えなければ今までの2Dの村
    use3D = !!(window.Village3D && Village3D.enter(Village.view));
    elWorld.style.display = use3D ? 'none' : '';
    if (!initialized) {
      resize();
      floorSel = Game.state.floor;
      initialized = true;
    } else {
      resize();
    }
    setupInput();
    clearKeys();   // メニューのあいだに離したキーで歩き続けないように
    refreshCampSeats();
    if (!running) startLoop();
  };

  Village.pause = function () {
    haltLoop();
  };

  Village.stop = function () {
    haltLoop();
    if (use3D && window.Village3D) Village3D.leave();   // 戦闘が #world3d を使う
  };
})();
