// ササノアビス モックアップ - 手続き生成ピクセルアート（担当：エージェントA）
// 全スプライトをオフスクリーンcanvasに1pxずつ焼き込む。アンチエイリアス禁止・PALの色のみ使用。
// window.Sprites にAPIを登録するだけで、読み込み時に自動実行はしない。

(function () {
  'use strict';

  // ============================================================
  // 基礎ヘルパー：キャンバス生成・1px描画・図形塗り・色の加工
  // ============================================================

  function makeCanvas(w, h) {
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { cvs, ctx };
  }

  function px(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  // 軸並行の楕円塗り（yMaxを渡すとその行までしか描かない＝フードの下端クリップ用）
  function ellipse(ctx, cx, cy, rx, ry, color, yMax) {
    ctx.fillStyle = color;
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    let y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    if (yMax !== undefined) y1 = Math.min(y1, yMax);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // 斜め楕円（アイパッチ用）：行ごとにslant分だけ中心をずらして傾きを出す
  function diagEllipse(ctx, cx, cy, rx, ry, slant, color) {
    ctx.fillStyle = color;
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      const t = (y + 0.5 - cy) / ry;
      if (Math.abs(t) > 1) continue;
      const rowShift = slant * t;
      const halfW = rx * Math.sqrt(Math.max(0, 1 - t * t));
      const xa = Math.round(cx + rowShift - halfW), xb = Math.round(cx + rowShift + halfW);
      for (let x = xa; x <= xb; x++) ctx.fillRect(x, y, 1, 1);
    }
  }

  // ひし形塗り（笹の葉・経験値玉用）
  function diamond(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = Math.abs(x + 0.5 - cx) / rx, ny = Math.abs(y + 0.5 - cy) / ry;
        if (nx + ny <= 1) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // 先端が細く根元が広い三角（角・尖った頭頂部用）。tiltで先端の傾きを出す
  function triangleUp(ctx, apexX, apexY, baseY, halfWidthAtBase, color, tilt) {
    ctx.fillStyle = color;
    tilt = tilt || 0;
    const h = baseY - apexY;
    for (let y = apexY; y <= baseY; y++) {
      const t = (y - apexY) / h;
      const halfW = halfWidthAtBase * t;
      const cx = apexX + tilt * t;
      const xa = Math.round(cx - halfW), xb = Math.round(cx + halfW);
      ctx.fillRect(xa, y, Math.max(1, xb - xa + 1), 1);
    }
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // 任意のhex色を明るく/暗くする（cloakColorが可変のため、PAL固定値に頼らずその場で作る）
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
    return '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // 外周を後処理で1px囲む（透明→不透明の境界だけを塗るので内側の色の継ぎ目には影響しない）
  function outline(ctx, w, h, color) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    const targets = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (filled(x, y)) continue;
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) targets.push(x, y);
      }
    }
    ctx.fillStyle = color;
    for (let i = 0; i < targets.length; i += 2) ctx.fillRect(targets[i], targets[i + 1], 1, 1);
  }

  // ガチャの伏せ札用：不透明部分を全部1色に塗りつぶす単色の影絵
  function silhouette(ctx, w, h, color) {
    const [cr, cg, cb] = hexToRgb(color);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) { d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ============================================================
  // パンダさん共通土台（Sprites.panda）
  // ============================================================

  // 目：normal=斜めアイパッチ＋白ハイライト／red=落ちくぼんだ目もと＋赤い1pxの光／closed=閉じた線
  function drawEyes(ctx, mode, bodyShadow) {
    if (mode === 'red') {
      ellipse(ctx, 12, 10.3, 1.6, 1.1, shade(bodyShadow, -0.25));
      ellipse(ctx, 20, 10.3, 1.6, 1.1, shade(bodyShadow, -0.25));
      px(ctx, 12, 10, PAL.oriEye); // 赤い1pxの光（不気味すぎないよう、これ以外は光らせない）
      px(ctx, 20, 10, PAL.oriEye);
      return;
    }
    if (mode === 'closed') {
      rect(ctx, 10.5, 10.5, 3, 1, PAL.inkSoft);
      rect(ctx, 18.5, 10.5, 3, 1, PAL.inkSoft);
      return;
    }
    // 小さめの斜め楕円（大きくすると虚ろになるので控えめに）
    diagEllipse(ctx, 11.8, 10.5, 2.1, 1.5, -1, PAL.ink);
    diagEllipse(ctx, 20.2, 10.5, 2.1, 1.5, 1, PAL.ink);
    px(ctx, 11, 9, PAL.white); // 各目の上側に白1pxハイライト＝生き生きさせる
    px(ctx, 20, 9, PAL.white);
  }

  // 頭巾：style=true で通常フード／'cap' でナイトキャップ（片側に垂れてぽんぽん玉つき）
  // 目より下には絶対にかからないよう yMax=8 でクリップする
  function drawHeadwear(ctx, style, color) {
    const shadow = shade(color, -0.3);
    if (style === 'cap') {
      ellipse(ctx, 16, 6, 7.6, 5, shadow, 8);
      ellipse(ctx, 16, 5.4, 7, 4.4, color, 8);
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = (i % 2 === 0) ? color : shadow;
        ctx.fillRect(20 + i, 3 - Math.floor(i / 2), 1, 1); // 片側に垂れる先端
      }
      ellipse(ctx, 27, 1.5, 1.6, 1.6, PAL.whiteShadow); // 先端のぽんぽん玉
    } else {
      ellipse(ctx, 16, 6.3, 7.8, 5.2, shadow, 8);
      ellipse(ctx, 16, 5.7, 7.2, 4.6, color, 8);
    }
  }

  // マント：左右対称の三角にしない。肩から羽織って裾が片側（右）へ風で流れる＋ぼろ布のギザギザ
  function drawMantle(ctx, color) {
    const shadow = shade(color, -0.3);
    const edgeColor = shade(color, 0.3);
    const hem = [2, 3, 3, 4, 5, 5, 6, 7, 8, 9, 9, 10, 11, 12, 12, 13]; // 左→右で徐々に長く流れる裾
    const startX = 6, topY = 16;
    for (let i = 0; i < hem.length; i++) {
      ctx.fillStyle = (i % 3 === 1) ? shadow : color; // 縦縞でひだの質感
      ctx.fillRect(startX + i, topY, 1, hem[i]);
    }
    ctx.fillStyle = edgeColor;
    for (let i = 9; i < hem.length; i++) ctx.fillRect(startX + i, topY + hem[i] - 1, 1, 1); // 流れる側の裾の光の縁
    ctx.fillRect(startX, topY, hem.length, 1); // 襟元を軽く明るく
  }

  // 持ち物：lantern(右手・暖色に光る)／flute(口元に横向き)／pillow(抱える枕)
  function drawItem(ctx, item) {
    if (item === 'lantern') {
      rect(ctx, 24, 19, 4, 5, PAL.leatherShadow);
      rect(ctx, 25, 20, 2, 3, PAL.light);
      px(ctx, 25, 20, PAL.lightHi);
      rect(ctx, 25, 17, 1, 2, PAL.leather);
    } else if (item === 'flute') {
      rect(ctx, 19, 14, 7, 2, PAL.leather);
      rect(ctx, 19, 14, 7, 1, shade(PAL.leather, 0.25));
      px(ctx, 21, 15, PAL.inkSoft);
      px(ctx, 23, 15, PAL.inkSoft);
      px(ctx, 25, 15, PAL.inkSoft);
    } else if (item === 'moon') {   // 欠けた月の輪（堕ちおつきさま）
      ellipse(ctx, 25.5, 19.5, 4, 4, '#E8D48A');
      ellipse(ctx, 27, 18.4, 3.2, 3.2, '#2A2440');
      px(ctx, 23, 18, '#FFF3C0');
    } else if (item === 'pillow') {
      rect(ctx, 11, 21, 10, 7, PAL.whiteShadow);
      rect(ctx, 12, 20, 8, 6, PAL.white);
      rect(ctx, 13, 22, 6, 1, PAL.whiteShadow);
      rect(ctx, 13, 25, 6, 1, PAL.whiteShadow);
    }
  }

  // 汎用パンダさん描画（32x32）。ガチャカード用にも使う共通土台。
  // opts: { cloak, scarf, hood:false|true|'cap', hoodColor, eyes, item, bodyColor:{main,shadow}, silhouette }
  function buildPanda(opts) {
    opts = opts || {};
    const cloak = opts.cloak || null;
    const scarf = opts.scarf || null;
    const hood = opts.hood || false;
    const eyesMode = opts.eyes || 'normal';
    const item = opts.item || null;
    const bodyMain = (opts.bodyColor && opts.bodyColor.main) || PAL.white;
    const bodyShadow = (opts.bodyColor && opts.bodyColor.shadow) || PAL.whiteShadow;

    const { cvs, ctx } = makeCanvas(32, 32);

    // 体（頭:体 ≒ 5:4。頭だけの生き物にしない＝ベルト・足まで見せる）
    ellipse(ctx, 16, 22.2, 7.6, 5.6, bodyShadow);
    ellipse(ctx, 16, 21.6, 7, 5, bodyMain);
    ellipse(ctx, 12, 28.6, 2.6, 1.8, bodyShadow); // 足
    ellipse(ctx, 20, 28.6, 2.6, 1.8, bodyShadow);
    ellipse(ctx, 7.2, 21, 2.2, 4, bodyMain); // 腕
    ellipse(ctx, 24.8, 21, 2.2, 4, bodyMain);

    // 頭
    ellipse(ctx, 16, 10, 7.6, 6.6, bodyShadow);
    ellipse(ctx, 16, 9.3, 7, 6, bodyMain);

    // ほっぺ（丸さ・かわいさを残す）
    ellipse(ctx, 10.4, 13, 1.6, 1.1, PAL.cheek);
    ellipse(ctx, 21.6, 13, 1.6, 1.1, PAL.cheek);

    drawEyes(ctx, eyesMode, bodyShadow);
    rect(ctx, 15, 15, 2, 1, PAL.inkSoft); // 口

    // 頭巾／ナイトキャップ（顔より上だけ。目にはかからない）
    if (hood) {
      const hc = opts.hoodColor || cloak || shade(PAL.cloak, 0.15);
      drawHeadwear(ctx, hood, hc);
    }

    // マント（肩から羽織り、片側へ流れる）
    if (cloak) drawMantle(ctx, cloak);

    // スカーフ
    if (scarf) {
      rect(ctx, 10, 16, 12, 2, scarf);
      rect(ctx, 10, 16, 12, 1, shade(scarf, 0.25));
    }

    // 耳：最後に描いてフード／キャップの上からはっきり突き出させる（パンダさんの最重要記号）
    ellipse(ctx, 8, 4, 3, 3, PAL.ink);
    ellipse(ctx, 24, 4, 3, 3, PAL.ink);
    ellipse(ctx, 8, 3.2, 1.4, 1.4, PAL.inkSoft);
    ellipse(ctx, 24, 3.2, 1.4, 1.4, PAL.inkSoft);

    if (item) drawItem(ctx, item);

    if (opts.silhouette) silhouette(ctx, cvs.width, cvs.height, PAL.ink);
    else outline(ctx, cvs.width, cvs.height, PAL.ink);

    return cvs;
  }

  // ============================================================
  // 4体の合成（ともしび・おんぷ・めいめい・堕ちすやすや）
  // ============================================================

  function addSasaBranch(ctx) {
    // 左手に笹の枝（茎＋葉2枚）。ランタンと反対側に構える
    rect(ctx, 4, 21, 1, 6, PAL.sasaShadow);
    diamond(ctx, 3, 20, 1.8, 2.4, PAL.sasa);
    diamond(ctx, 6, 23, 1.8, 2.4, PAL.sasa);
  }

  function buildTomoshibi() {
    const cvs = buildPanda({ cloak: PAL.cloak, hood: true, eyes: 'normal', item: 'lantern' });
    const ctx = cvs.getContext('2d');
    addSasaBranch(ctx);
    outline(ctx, cvs.width, cvs.height, PAL.ink); // 追加した枝の外周も締める
    return cvs;
  }

  function buildOnpu() {
    const ONPU_CLOAK = '#3A5A82'; // ともしびの紫と対になる寒色の青系マント
    return buildPanda({ cloak: ONPU_CLOAK, hood: true, eyes: 'normal', item: 'flute' });
  }

  function buildMeimei() {
    return buildPanda({ cloak: null, scarf: PAL.sasa, hood: false, eyes: 'normal', item: null });
  }

  // 第10階のボス：澱に呑まれたおつきさま。夜の色の体に、欠けた月の輪を持つ
  function buildBossOtsukisama() {
    return buildPanda({
      cloak: '#2B2F5E',
      hood: true,
      hoodColor: '#1E2148',
      eyes: 'red',
      item: 'moon',
      bodyColor: { main: '#565A80', shadow: '#33365A' },
    });
  }

  function buildBossSuyasuya() {
    const BODY_MAIN = '#6A6078', BODY_SHADOW = '#463C54'; // 澱に呑まれた、暗い灰紫の体
    const CAP_COLOR = shade(PAL.cloak, 0.2); // 落ち着いた紫のナイトキャップ
    return buildPanda({
      cloak: null,
      hood: 'cap',
      hoodColor: CAP_COLOR,
      eyes: 'red',
      item: 'pillow',
      bodyColor: { main: BODY_MAIN, shadow: BODY_SHADOW },
    });
  }

  // ============================================================
  // 敵4種（澱）：背景の補色側＝青緑〜白で浮かせる（企画書§6-4）
  // ============================================================

  function buildOri() {
    // しずく型：下が丸く、上は細く尖ってゆらっと傾く／垂れた目
    const { cvs, ctx } = makeCanvas(16, 16);
    ellipse(ctx, 8, 10, 5.5, 4.5, PAL.oriShadow);
    ellipse(ctx, 8, 9.3, 5, 4, PAL.ori);
    triangleUp(ctx, 8, 1, 6, 4, PAL.ori, 1.5);
    rect(ctx, 5, 10, 2, 1, PAL.oriEye);
    rect(ctx, 9, 11, 2, 1, PAL.oriEye); // 片方を下げて非対称の垂れ目にする
    outline(ctx, 16, 16, PAL.ink);
    return cvs;
  }

  function buildKumo() {
    // もやもや雲：丸を重ねてでこぼこの輪郭にする／困り顔（への字口）
    const { cvs, ctx } = makeCanvas(18, 18);
    ellipse(ctx, 9, 10, 7, 5, PAL.kumoShadow);
    ellipse(ctx, 6, 8, 4, 3.5, PAL.kumo);
    ellipse(ctx, 12, 8, 4, 3.5, PAL.kumo);
    ellipse(ctx, 9, 6.5, 4.5, 3.5, PAL.kumo);
    ellipse(ctx, 9, 10.5, 6, 4, PAL.kumo);
    px(ctx, 6, 9, PAL.inkSoft);
    px(ctx, 12, 9, PAL.inkSoft);
    px(ctx, 7, 13, PAL.inkSoft);
    rect(ctx, 8, 12, 2, 1, PAL.inkSoft);
    px(ctx, 10, 13, PAL.inkSoft);
    outline(ctx, 18, 18, PAL.ink);
    return cvs;
  }

  function buildTosshin() {
    // 緑の澱、前方に角が1本
    const { cvs, ctx } = makeCanvas(16, 16);
    ellipse(ctx, 8, 9, 5.5, 5, PAL.tosshinShadow);
    ellipse(ctx, 8, 8.3, 5, 4.5, PAL.tosshin);
    triangleUp(ctx, 13, 3, 8, 2, PAL.tosshin, 3);
    px(ctx, 6, 8, PAL.oriEye);
    px(ctx, 10, 8, PAL.oriEye);
    outline(ctx, 16, 16, PAL.ink);
    return cvs;
  }

  function buildHakite() {
    // 縦長の澱、口が開いている
    const { cvs, ctx } = makeCanvas(16, 20);
    ellipse(ctx, 8, 11, 5, 9, PAL.hakiteShadow);
    ellipse(ctx, 8, 10.3, 4.5, 8.5, PAL.hakite);
    ellipse(ctx, 8, 12, 2, 2.5, PAL.ink);
    ellipse(ctx, 8, 11.5, 1.3, 1.8, PAL.inkSoft);
    px(ctx, 5, 6, PAL.oriEye);
    px(ctx, 11, 6, PAL.oriEye);
    outline(ctx, 16, 20, PAL.ink);
    return cvs;
  }

  // ============================================================
  // アイテム・弾・小物
  // ============================================================

  function buildOrb() {
    // 笹の葉の経験値玉（緑のひし形＋茎）
    const { cvs, ctx } = makeCanvas(7, 7);
    diamond(ctx, 3.5, 4, 2.8, 2.8, PAL.sasaShadow);
    diamond(ctx, 3.5, 3.5, 2.3, 2.3, PAL.sasa);
    px(ctx, 3, 1, PAL.sasaShadow);
    px(ctx, 3, 0, PAL.sasaShadow);
    outline(ctx, 7, 7, PAL.ink);
    return cvs;
  }

  function buildChest() {
    // 紙の箱（生成り色の紙・金の帯・白いふち。エリートが落とす報酬の箱）
    const { cvs, ctx } = makeCanvas(12, 10);
    rect(ctx, 1, 3, 10, 6, '#E8DCC8');        // 箱の正面（紙）
    rect(ctx, 1, 3, 10, 2, '#C9B896');        // ふたの影
    rect(ctx, 0, 2, 12, 2, '#FFF6E6');        // ふたの白いふち
    rect(ctx, 1, 7, 10, 1, '#C9B896');        // 下の折り目
    rect(ctx, 5, 2, 2, 7, PAL.elite);         // 金の帯（縦）
    rect(ctx, 1, 5, 4, 1, PAL.elite);         // 金の帯（横）
    rect(ctx, 7, 5, 4, 1, PAL.elite);
    outline(ctx, 12, 10, PAL.ink);
    return cvs;
  }

  function buildNote() {
    // 音符弾（おんぷの追尾弾）：はっきり見える寒色の水色
    const { cvs, ctx } = makeCanvas(6, 8);
    const c = shade(PAL.hakite, 0.55);
    ellipse(ctx, 2, 6, 2, 1.6, c);
    rect(ctx, 3, 1, 1, 5, c);
    rect(ctx, 3, 1, 3, 1, c);
    rect(ctx, 5, 1, 1, 2, c);
    outline(ctx, 6, 8, PAL.ink);
    return cvs;
  }

  function buildSleeporb() {
    // 眠りの弾（紫の玉にZ）
    const { cvs, ctx } = makeCanvas(7, 7);
    ellipse(ctx, 3.5, 3.5, 3, 3, shade(PAL.rarity.UR, -0.35));
    ellipse(ctx, 2.8, 2.8, 1.2, 1.2, PAL.rarity.UR);
    px(ctx, 2, 1, PAL.white); px(ctx, 3, 1, PAL.white); px(ctx, 4, 1, PAL.white);
    px(ctx, 3, 2, PAL.white);
    px(ctx, 2, 3, PAL.white); px(ctx, 3, 3, PAL.white); px(ctx, 4, 3, PAL.white);
    outline(ctx, 7, 7, PAL.ink);
    return cvs;
  }

  function buildStaff(stage) {
    // 笹の枝の杖。段階2は葉が増え灯りの飾りつき
    const { cvs, ctx } = makeCanvas(16, 16);
    rect(ctx, 7, 3, 2, 12, PAL.sasaShadow);
    rect(ctx, 7, 3, 1, 12, PAL.sasa);
    diamond(ctx, 5, 5, 2.4, 3, PAL.sasa);
    diamond(ctx, 11, 7, 2.4, 3, PAL.sasa);
    if (stage >= 2) {
      diamond(ctx, 4, 9, 2, 2.6, PAL.sasa);
      diamond(ctx, 12, 11, 2, 2.6, PAL.sasa);
      ellipse(ctx, 8, 2, 1.6, 1.6, PAL.light);
      px(ctx, 8, 1, PAL.lightHi);
    }
    outline(ctx, 16, 16, PAL.ink);
    return cvs;
  }

  function buildFlute(stage) {
    // 笛。段階2は装飾のリボンと小さな宝石つき
    const { cvs, ctx } = makeCanvas(16, 16);
    rect(ctx, 2, 7, 12, 2, PAL.leather);
    rect(ctx, 2, 7, 12, 1, shade(PAL.leather, 0.25));
    px(ctx, 5, 8, PAL.inkSoft);
    px(ctx, 8, 8, PAL.inkSoft);
    px(ctx, 11, 8, PAL.inkSoft);
    if (stage >= 2) {
      rect(ctx, 3, 6, 2, 1, '#3A5A82');
      rect(ctx, 3, 9, 2, 1, '#3A5A82');
      ellipse(ctx, 13, 8, 1.4, 1.4, PAL.rarity.UR);
    }
    outline(ctx, 16, 16, PAL.ink);
    return cvs;
  }

  // ============================================================
  // 登録
  // ============================================================

  const _cache = {};

  function init() {
    _cache.tomoshibi = buildTomoshibi();
    _cache.onpu = buildOnpu();
    _cache.meimei = buildMeimei();
    _cache.villager_tea = buildPanda({ cloak: null, scarf: '#6E9E8A', hood: false, eyes: 'normal', item: null });
    _cache.villager_broom = buildPanda({ cloak: null, scarf: '#8A6A4A', hood: false, eyes: 'closed', item: null });
    _cache.villager_flower = buildPanda({ cloak: null, scarf: '#B06A88', hood: false, eyes: 'normal', item: null });
    _cache.villager_smith_rest = buildPanda({ cloak: null, scarf: '#8A4A34', hood: false, eyes: 'closed', item: null });
    _cache.boss_suyasuya = buildBossSuyasuya();
    _cache.boss_otsukisama = buildBossOtsukisama();
    _cache.ori = buildOri();
    _cache.kumo = buildKumo();
    _cache.tosshin = buildTosshin();
    _cache.hakite = buildHakite();
    _cache.orb = buildOrb();
    _cache.chest = buildChest();
    _cache.note = buildNote();
    _cache.sleeporb = buildSleeporb();
    _cache.weapon_staff_1 = buildStaff(1);
    _cache.weapon_staff_2 = buildStaff(2);
    _cache.weapon_flute_1 = buildFlute(1);
    _cache.weapon_flute_2 = buildFlute(2);
    loadOfficialArt();
  }

  // 正式素材（Codex生成・検品合格分）があれば手続き生成から差し替える。
  // 非同期ロード：読めるまでは手続き版が出る。file://等で読めなくても壊れない。
  const OFFICIAL = {
    tomoshibi: 'assets/chars/tomoshibi_illustrated_64.png',
    onpu: 'assets/chars/onpu_illustrated_note_64.png',
    meimei: 'assets/chars/meimei_reception_illustrated_64.png',
    villager_tea: 'assets/chars/villager_tea_illustrated_64.png',
    villager_broom: 'assets/chars/villager_broom_illustrated_64.png',
    villager_flower: 'assets/chars/villager_flower_illustrated_64.png',
    villager_smith_rest: 'assets/chars/villager_smith_rest_illustrated_64.png',
  };
  function loadOfficialArt() {
    for (const name of Object.keys(OFFICIAL)) {
      const img = new Image();
      img.onload = function () {
        const cvs = document.createElement('canvas');
        cvs.width = img.naturalWidth; cvs.height = img.naturalHeight;
        const ctx = cvs.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        _cache[name] = cvs;
      };
      img.onerror = function () {};
      img.src = OFFICIAL[name];
    }
  }

  function get(name) {
    return _cache[name] || null;
  }

  function isIllustrated(name) {
    return Boolean(OFFICIAL[name] && OFFICIAL[name].indexOf('_illustrated_') >= 0);
  }

  // NEAREST拡大PNGのdataURL（UIのカード表示用）
  function dataURL(name, scale) {
    scale = scale || 4;
    const src = get(name);
    if (!src) return '';
    const w = src.width * scale, h = src.height * scale;
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = isIllustrated(name);
    ctx.drawImage(src, 0, 0, w, h);
    return cvs.toDataURL('image/png');
  }

  window.Sprites = {
    init: init,
    get: get,
    isIllustrated: isIllustrated,
    panda: buildPanda,
    dataURL: dataURL,
  };
})();
