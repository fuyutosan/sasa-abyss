// ササノアビス モックアップ - 戦闘画面の3D描画
// 3Dの地面に、絵本調の2Dの絵を「板」として立てる。動きの計算は run.js のまま、ここは読むだけ。
// 要件定義_戦闘画面の3D化_2026-10-16.md に従う。window.Render3D を登録する。
// 方針：作るのは init() の1回だけ。draw() の中では new しない（位置と表示数だけ更新）。

(function () {
  'use strict';

  const C = window.RENDER3D;
  const DEG = Math.PI / 180;
  const THREE = window.THREE;

  const Render3D = {};
  window.Render3D = Render3D;

  // ---------- 状態 ----------
  let renderer = null, scene = null, camera = null;
  let ambient = null, moon = null, lantern = null;
  let canvas = null;
  let rawRender = null, lastScene = null, lastCam = null;   // 最後に描いたシーンとカメラ（本のUIの写し取り用。村と戦闘は同じ renderer を共有する）
  let ready = false, shown = false, failed = false;
  let inDraw = false, newInDraw = 0, texRebuilds = 0;
  let cssW = 1, cssH = 1, aspect = 1;
  let camDist = 1000, camNear = 100, camFar = 4000;
  let fogNear = 1000, fogFar = 1200;
  let viewLogW = 320, viewLogH = 640, spawnDist = 430;
  let viewWidthAtPlayer = 0, fogFarGround = 0;
  const sinP = Math.sin(C.pitchDeg * DEG), cosP = Math.cos(C.pitchDeg * DEG);
  const tilt = C.pitchDeg * C.tiltRatio * DEG;
  const sinT = Math.sin(tilt), cosT = Math.cos(tilt);
  // 紙人形の板の寝かせ角（飾りの板は上の tilt のまま）
  const PA = C.paper;
  const sinL = Math.sin(PA.leanDeg * DEG), cosL = Math.cos(PA.leanDeg * DEG);
  const lastCounts = { enemies: 0, orbs: 0, proj: 0, traps: 0, chests: 0, parts: 0, fx: 0 };

  // 毎フレーム使い回す入れ物
  let ground = null, groundTex = null;
  let decorKeyX = 1e9, decorKeyY = 1e9;
  const sets = {};          // 板（スプライト）の種類ごとのまとめ描き
  let setList = [];
  let shadowMesh = null, shadowN = 0;
  let glowBill = null, glowFlat = null, glowBillN = 0, glowFlatN = 0;
  let decorPebble = null, decorSasa = null, decorGrass = null;
  let sceneRock = null, scenePillar = null, sceneDead = null, decorShadow = null;
  let wallMesh = null, wallTop = null, puddleMesh = null, puddleMat = null;
  const terrainCount = { rocks: 0, pillars: 0, walls: 0, wallSegs: 0, puddles: 0 };
  let fallbackCanvas = null, expCanvas = null;
  let forceFlip = -1;       // テスト専用：-1=ふだん／0=反転なし／1=反転あり
  let poolMesh = null;
  let fxMesh = null, fxN = 0, fxAttrCol = null, fxAttrShape = null, fxMat = null, ptMat = null, emMat = null;
  let burstPts = null, emberPts = null, burstN = 0, emberN = 0;
  const rgbCache = Object.create(null);      // ランタンの足元に広がる灯りの円（加算合成）
  // 紙人形：向き・振り向き・歩きの揺れの状態（主人公は pState、敵は e.pp、村の人は village3d.js が持つ）
  const pOut = { flip: 0, wf: 1, roll: 0, back: 0 };   // paperAnim の戻り先（使い回す）
  const pState = newPaperState();
  let nowS = 0, rdt = 0, lastNowS = -1;                // 今の時刻(秒)・前のフレームからの秒数（実時間。ゲームが止まっても振り向きは進む）
  const lastPlayer = { wf: 1, flip: 0 };               // テスト用：主人公の板の直近の状態

  // ---------- 小さな道具 ----------
  function guardNew() { if (inDraw) newInDraw++; }
  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123; return s - Math.floor(s); }
  function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function rgbOf(col) {
    let c = rgbCache[col];
    if (!c) { c = rgbCache[col] = col.charAt(0) === '#' ? hexRgb(col).map(function (n) { return n / 255; }) : (function () { const m = col.match(/[\d.]+/g); return [m[0] / 255, m[1] / 255, m[2] / 255]; })(); }
    return c;
  }

  // 光の板（加算合成）は霧で「黒」へ溶かす（霧色へ溶かすと明るく浮くため）
  function fogToBlack(mat) {
    mat.onBeforeCompile = function (shader) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>',
        '#ifdef USE_FOG\n float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );\n gl_FragColor.rgb *= ( 1.0 - fogFactor );\n#endif');
    };
  }

  // ---------- 絵（キャンバス）をその場で描く ----------
  function paintGround() {
    const n = C.groundTile, c = mkCanvas(n, n), g = c.getContext('2d');
    g.fillStyle = PAL.ground; g.fillRect(0, 0, n, n);
    // ぼかした塗りむら（端でつながるよう、上下左右にずらしても描く）
    for (let i = 0; i < 26; i++) {
      const x = hash2(i, 3) * n, y = hash2(i, 7) * n, r = 24 + hash2(i, 11) * 52;
      const lit = hash2(i, 13) < 0.55;
      const col = lit ? '#4a3658' : '#140a1e';
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const gr = g.createRadialGradient(x + dx * n, y + dy * n, 0, x + dx * n, y + dy * n, r);
        gr.addColorStop(0, col + (lit ? 'dd' : 'cc')); gr.addColorStop(1, col + '00');
        g.fillStyle = gr; g.fillRect(0, 0, n, n);
      }
    }
    // ひび（細い線。端でつながるよう9方向にずらして描く）
    g.strokeStyle = 'rgba(14,6,22,0.4)'; g.lineWidth = 1; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 9; i++) {
      let x = hash2(i, 31) * n, y = hash2(i, 37) * n, a = hash2(i, 41) * 6.28;
      const pts = [[x, y]];
      for (let k = 0; k < 4; k++) { a += (hash2(i, 50 + k) - 0.5) * 1.6; x += Math.cos(a) * (14 + hash2(i, 60 + k) * 18); y += Math.sin(a) * (14 + hash2(i, 70 + k) * 18); pts.push([x, y]); }
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        g.beginPath(); g.moveTo(pts[0][0] + dx * n, pts[0][1] + dy * n);
        for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0] + dx * n, pts[k][1] + dy * n);
        g.stroke();
      }
    }
    return c;
  }
  function paintDeadSasa() {   // 枯れた笹の株（灰色がかった緑。背が高い）
    const c = mkCanvas(64, 128), g = c.getContext('2d');
    const cols = ['#4c5a48', '#5d6b57', '#3e4a3c', '#6f7a64'];
    for (let i = 0; i < 9; i++) {
      const bx = 14 + i * 4.5, tx = 8 + hash2(i, 5) * 48, ty = 6 + hash2(i, 9) * 40, w = 2.5 + hash2(i, 13) * 2;
      g.fillStyle = cols[i % 4];
      g.beginPath(); g.moveTo(bx - w, 126); g.quadraticCurveTo(bx + (tx - bx) * 0.2, (126 + ty) / 2, tx, ty); g.quadraticCurveTo(bx + (tx - bx) * 0.2 + 3, (126 + ty) / 2, bx + w, 126); g.fill();
      g.strokeStyle = cols[(i + 1) % 4]; g.lineWidth = 2; g.lineCap = 'round';
      const ly = ty + 18 + hash2(i, 21) * 30;
      g.beginPath(); g.moveTo(bx + (tx - bx) * 0.55, ly); g.quadraticCurveTo(tx + (i % 2 ? 12 : -12), ly - 6, tx + (i % 2 ? 14 : -14), ly + 12); g.stroke();
    }
    return c;
  }
  function paintStone() {   // 積んだ石の側面（暗い紫灰）
    const c = mkCanvas(128, 64), g = c.getContext('2d');
    g.fillStyle = '#2a2034'; g.fillRect(0, 0, 128, 64);
    for (let row = 0; row < 3; row++) {
      let x = row % 2 ? -14 : 0;
      for (let k = 0; k < 6 && x < 128; k++) {
        const w = 26 + hash2(row, k) * 22, shade = 0x4a + Math.floor(hash2(k, row + 9) * 0x1c);
        g.fillStyle = 'rgb(' + (shade + 8) + ',' + (shade - 4) + ',' + (shade + 22) + ')';
        g.beginPath(); g.roundRect(x + 1.5, row * 21 + 1.5, w - 3, 18, 4); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 4, row * 21 + 3, w - 9, 3);
        x += w;
      }
    }
    return c;
  }
  function paintWallTop() {  // 壁の上に生えた草
    const c = mkCanvas(64, 64), g = c.getContext('2d');
    g.fillStyle = '#3f5a38'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = hash2(i, 3) < 0.5 ? '#4f6e44' : '#2f4630';
      g.beginPath(); g.arc(hash2(i, 5) * 64, hash2(i, 7) * 64, 3 + hash2(i, 9) * 5, 0, 6.283); g.fill();
    }
    return c;
  }
  function paintPebble() {
    const c = mkCanvas(32, 32), g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    gr.addColorStop(0, PAL.groundLit); gr.addColorStop(0.7, PAL.groundLit + 'cc'); gr.addColorStop(1, PAL.groundLit + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return c;
  }
  function paintSasa() {   // 笹の小さな束（やわらかい葉の形）
    const c = mkCanvas(32, 32), g = c.getContext('2d');
    g.fillStyle = PAL.sasaShadow;
    const blades = [[8, 29, 4, 9], [16, 29, 16, 3], [24, 29, 28, 10], [12, 29, 9, 17], [20, 29, 23, 16]];
    for (const b of blades) {
      g.beginPath(); g.moveTo(b[0] - 2, b[1]); g.quadraticCurveTo(b[0], (b[1] + b[3]) / 2, b[2], b[3]); g.quadraticCurveTo(b[0] + 1, (b[1] + b[3]) / 2, b[0] + 2, b[1]); g.fill();
    }
    g.fillStyle = PAL.sasa; g.globalAlpha = 0.55;
    g.beginPath(); g.moveTo(14, 29); g.quadraticCurveTo(16, 16, 16, 3); g.quadraticCurveTo(17, 16, 18, 29); g.fill();
    return c;
  }
  function paintGrass() {
    const c = mkCanvas(32, 32), g = c.getContext('2d');
    g.strokeStyle = PAL.sasa; g.lineWidth = 2; g.lineCap = 'round';
    for (const x of [8, 14, 20, 26]) { g.beginPath(); g.moveTo(x, 30); g.quadraticCurveTo(x - 2, 20, x + (x % 3) - 1, 12); g.stroke(); }
    return c;
  }
  function paintGlow() {
    const c = mkCanvas(64, 64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }
  function paintPool() {   // 中心〜0.5までほぼ一定、そこから外へなだらかに消える
    const c = mkCanvas(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  }
  function paintShadow() {
    const c = mkCanvas(64, 64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.65, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }
  function paintExp() {    // 経験値の笹の葉（今の2Dと同じ緑のひし形）
    const c = mkCanvas(32, 32), g = c.getContext('2d');
    g.fillStyle = ELEMENTS.sprout.color;
    g.beginPath(); g.moveTo(16, 3); g.lineTo(28, 16); g.lineTo(16, 29); g.lineTo(4, 16); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.moveTo(16, 6); g.lineTo(22, 16); g.lineTo(16, 16); g.closePath(); g.fill();
    return c;
  }
  function paintFallback() {   // 絵が無いとき（2Dの丸と同じ）
    const c = mkCanvas(64, 64), g = c.getContext('2d');
    g.fillStyle = PAL.cloak; g.beginPath(); g.arc(32, 36, 22, 0, Math.PI * 2); g.fill();
    return c;
  }

  function texFromCanvas(cv, smooth, repeat) {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    if (smooth) { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; }
    else { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
    if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
    t.needsUpdate = true;
    return t;
  }

  // ---------- 材質 ----------
  // 板の材質：左右反転は「絵の読み取り位置(UV)」を逆にする（マイナスの大きさは使わない＝裏面で真っ黒になるため）
  function makeBoardMaterial(selfGlow) {
    const m = new THREE.MeshLambertMaterial({ alphaTest: 0.4 });
    const back = new THREE.Color(PA.backColor);   // 紙の裏の色（振り向きの途中で細いあいだ、絵の代わりに塗る）。組み立ては初めて画面に出たときなので、色はここで先に作っておく（戦闘中に3Dの物を作らない＝T50）
    m.onBeforeCompile = function (shader) {
      shader.uniforms.uGlow = { value: selfGlow };
      shader.uniforms.uBack = { value: back };
      shader.vertexShader = 'attribute float aFlip;\nattribute float aFade;\nattribute float aBack;\nvarying float vFade;\nvarying float vBack;\n' + shader.vertexShader.replace('#include <uv_vertex>',
        'vFade = aFade;\nvBack = aBack;\nvec2 uvF = vec2( mix( uv.x, 1.0 - uv.x, aFlip ), uv.y );\n#undef MAP_UV\n#define MAP_UV uvF\n#include <uv_vertex>');
      shader.fragmentShader = 'uniform float uGlow;\nuniform vec3 uBack;\nvarying float vFade;\nvarying float vBack;\n' + shader.fragmentShader.replace('#include <alphatest_fragment>',
        '#include <alphatest_fragment>\n if ( vFade < 0.999 && fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) > vFade ) discard;\n diffuseColor.rgb = mix( diffuseColor.rgb, uBack, vBack );').replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uGlow;');
    };
    m.customProgramCacheKey = function () { return 'board'; };
    return m;
  }

  // 板1種類ぶんのまとめ描き
  // paper が真なら紙人形（白いふち・寝かせ角・振り向き）。toScene を渡すと戦闘以外のシーン（村）に置く
  function makeSet(key, name, max, selfGlow, smoothAlways, paper, toScene, register) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);               // 足元が原点
    const flip = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    geo.setAttribute('aFlip', flip);
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(1), 1);
    geo.setAttribute('aFade', fade);
    const back = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);    // 1のとき紙の裏の色（振り向きの途中）
    geo.setAttribute('aBack', back);
    const mat = makeBoardMaterial(selfGlow);
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
    (toScene || scene).add(mesh);
    const s = { key, name, max, mesh, mat, flip, fade, back, n: 0, src: null, tex: null, smoothAlways: !!smoothAlways,
                paper: !!paper, pad: 0, padX: 0, padY: 0, cut: null };
    if (register !== false) { sets[key] = s; setList.push(s); }
    return s;
  }

  // 白いふち：絵の形（不透明な部分）を border だけ太らせて borderColor で塗り、その外周に edgeColor の1px線、その上に元の絵を重ねる。
  // 余白(pad)の分だけ大きい絵を返す。絵が変わったときだけ呼ぶ（毎フレームは呼ばない）。
  // ふちの太さは「絵の幅64pxに対して border px」。小さい仮のドット絵（16pxなど）は、先に整数倍へ拡大してから足す（ふちが細すぎて消えないように）
  function makeCutout(s, src, smooth) {
    const k = Math.max(1, Math.round(64 / src.width));
    const W = src.width * k, H = src.height * k, pad = PA.border;
    const cv = mkCanvas(W + pad * 2, H + pad * 2), g = cv.getContext('2d');
    g.imageSmoothingEnabled = !!smooth && k === 1;
    const bc = hexRgb(PA.borderColor), em = PA.edgeColor.match(/[\d.]+/g), ea = +em[3];
    const edgeRgb = 'rgb(' + [0, 1, 2].map(function (q) { return Math.round(+em[q] * ea + bc[q] * (1 - ea)); }).join(',') + ')';   // 線は白い紙の上に薄く引いた色
    const silhouette = function (color) {   // 絵の形を1色で塗った絵
      const c = mkCanvas(W, H), x = c.getContext('2d');
      x.imageSmoothingEnabled = g.imageSmoothingEnabled;
      x.drawImage(src, 0, 0, W, H); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, W, H);
      return c;
    };
    const grow = function (img, R) {   // 円の形に太らせる（円周と内側の輪に、少しずつずらして重ねる）
      g.drawImage(img, pad, pad);
      if (R <= 0) return;
      for (const f of [1, 0.66, 0.33]) for (let n = 0; n < 16; n++) {
        const a = n / 16 * Math.PI * 2;
        g.drawImage(img, pad + Math.cos(a) * R * f, pad + Math.sin(a) * R * f);
      }
    };
    grow(silhouette(edgeRgb), pad);                 // いちばん外の1pxが線
    grow(silhouette(PA.borderColor), pad - 1);      // 内側が白いふち
    const art = mkCanvas(W, H), ag = art.getContext('2d');
    ag.imageSmoothingEnabled = g.imageSmoothingEnabled; ag.drawImage(src, 0, 0, W, H);
    g.drawImage(art, pad, pad);                     // 元の絵
    s.pad = pad; s.padX = pad / W; s.padY = pad / H; s.cut = cv; s.cutK = k;
    return cv;
  }

  // 絵を板に貼る。同じ絵なら使い回す（返る絵が変わったら＝正式素材の読み込みなどで作り直す）
  function applySprite(s, src, smooth) {
    if (src === s.src) return;
    s.src = src;
    if (s.tex) s.tex.dispose();
    if (s.paper) {
      const cv = makeCutout(s, src, smooth);
      s.tex = texFromCanvas(cv, !!smooth || s.cutK > 1, false);     // 拡大した仮のドット絵は、縮んで映るときにちらつかないよう、なめらかな縮小にする
    } else s.tex = texFromCanvas(src, !!smooth, false);
    s.mat.map = s.tex; s.mat.needsUpdate = true;
    texRebuilds++;
  }
  function syncSprite(s) {
    let src = null;
    if (s.name === '_exp') src = expCanvas;
    else { try { src = window.Sprites && Sprites.get ? Sprites.get(s.name) : null; } catch (e) { src = null; } }
    if (!src) src = fallbackCanvas;
    if (src === s.src) return;
    applySprite(s, src, s.smoothAlways || (window.Sprites && Sprites.isIllustrated && Sprites.isIllustrated(s.name)));
  }

  // ---------- 紙人形の向き・振り向き・歩きの揺れ ----------
  function tick() {
    nowS = performance.now() / 1000;
    rdt = lastNowS < 0 ? 0 : Math.min(0.05, Math.max(0, nowS - lastNowS)); lastNowS = nowS;
  }
  function newPaperState() { return { dir: 0, turnT: -1, toDir: 0, swapped: false, amp: 0, lx: 0, ly: 0, lt: -1, vx: 0, vy: 0, born: -1, cfg: null }; }
  function resetPaper(st, dir) { st.dir = dir; st.turnT = -1; st.toDir = dir; st.swapped = false; st.amp = 0; st.lt = -1; st.vx = 0; st.vy = 0; }
  function paperIntent(st) { return st.turnT >= 0 ? st.toDir : st.dir; }      // 今向かっている（向き終わった）左右
  // 位置の変化から速さを測る（実時間。同じフレームに何度呼ばれても、4ミリ秒たつまでは前の値のまま）
  function sampleVel(st, x, y) {
    const dt = nowS - st.lt;
    if (st.lt < 0 || dt < 0 || dt > 0.5) { st.lx = x; st.ly = y; st.lt = nowS; st.vx = 0; st.vy = 0; return; }
    if (dt >= 0.004) { st.vx = (x - st.lx) / dt; st.vy = (y - st.ly) / dt; st.lx = x; st.ly = y; st.lt = nowS; }
  }
  // 向きの変化を受けて、今フレームの板の幅(wf)・反転(flip)・裏(back)・揺れ(roll)を pOut に入れる。
  // 向きが変わった瞬間に turnSec の振り向きを始め、細くなる真ん中で反転する。途中で向きが戻っても、終わるまで続けてから次の振り向きを始める
  function paperAnim(st, want, moving, rockOn) {
    if (st.turnT < 0) { if (want !== st.dir) { st.turnT = 0; st.toDir = want; st.swapped = false; } }
    else st.turnT += rdt;
    let wf = 1, fl = st.dir;
    if (st.turnT >= 0) {
      const T = PA.turnSec;
      if (st.turnT >= T) { st.dir = st.toDir; st.turnT = -1; fl = st.dir; }
      else if (st.turnT < T * 0.5) wf = Math.max(PA.turnMinW, Math.cos(Math.PI * st.turnT / T));
      else {
        fl = st.toDir;
        if (!st.swapped) { st.swapped = true; wf = PA.turnMinW; }      // 反転する瞬間は必ずいちばん細い幅
        else wf = Math.max(PA.turnMinW, -Math.cos(Math.PI * st.turnT / T));
      }
    }
    if (rockOn) { if (moving) st.amp = 1; else if (st.amp > 0) st.amp = Math.max(0, st.amp - rdt / PA.rockStopSec); }
    else st.amp = 0;
    pOut.flip = fl; pOut.wf = wf; pOut.back = wf < PA.backBelowW ? 1 : 0;
    pOut.roll = st.amp > 0 ? st.amp * PA.walkRockDeg * DEG * Math.sin(nowS * Math.PI * 2 * PA.walkRockHz) : 0;
  }

  // ---------- 行列を直接書く（new しない） ----------
  // 立てた板：幅 w・高さ h・足元 (x, elev, y)。板の面がカメラ側（上向き）へ向くよう、上端を奥へ tilt だけ寝かせる
  function writeBoard(arr, i, x, y, elev, w, h) {
    const o = i * 16;
    arr[o] = w; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = h * cosT; arr[o + 6] = -h * sinT; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = sinT; arr[o + 10] = cosT; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = elev; arr[o + 14] = y; arr[o + 15] = 1;
  }
  // 地面に寝かせた板：中心 (x, elev, y)、横 sx・縦 sz
  function writeFlat(arr, i, x, y, elev, sx, sz) {
    const o = i * 16;
    arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = 0; arr[o + 6] = -sz; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = 1; arr[o + 10] = 0; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = elev; arr[o + 14] = y; arr[o + 15] = 1;
  }

  // 紙人形の板：足元 (x, elev, y)・絵の幅 w と高さ h。余白(pad)の分だけ板を広げ、絵の下端が足元に来るよう余白ぶん下げる。
  // 起こした角度は leanDeg。wf は振り向きの幅の割合、roll は前後の軸の揺れ(ラジアン)。足元を軸に傾ける
  function writePaper(s, i, x, y, elev, w, h, wf, roll) {
    const a = s.mesh.instanceMatrix.array, o = i * 16;
    const bw = w * (1 + 2 * s.padX) * wf, bh = h * (1 + 2 * s.padY), sh = h * s.padY;
    let cr = 1, sr = 0;
    if (roll !== 0) { cr = Math.cos(roll); sr = Math.sin(roll); }
    const yx = -sr * cosL, yy = cr * cosL, yz = -sinL;      // 板の「上」向きの単位ベクトル（揺れを含む）
    a[o] = bw * cr; a[o + 1] = bw * sr; a[o + 2] = 0; a[o + 3] = 0;
    a[o + 4] = bh * yx; a[o + 5] = bh * yy; a[o + 6] = bh * yz; a[o + 7] = 0;
    a[o + 8] = -sr * sinL; a[o + 9] = cr * sinL; a[o + 10] = cosL; a[o + 11] = 0;
    a[o + 12] = x - yx * sh; a[o + 13] = elev - yy * sh; a[o + 14] = y - yz * sh; a[o + 15] = 1;
  }
  function addPaper(s, x, y, elev, w, h, flip, fade, wf, roll, back) {
    if (s.n >= s.max) return -1;
    const i = s.n++;
    writePaper(s, i, x, y, elev, w, h, wf, roll);
    s.flip.array[i] = flip ? 1 : 0;
    s.fade.array[i] = fade === undefined ? 1 : fade;
    s.back.array[i] = back ? 1 : 0;
    return i;
  }
  // 任意の傾き(cT, sT)で立てた板の行列（村の光の板用）
  function writeBoardTilt(arr, i, x, y, elev, w, h, cT, sT) {
    const o = i * 16;
    arr[o] = w; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = h * cT; arr[o + 6] = -h * sT; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = sT; arr[o + 10] = cT; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = elev; arr[o + 14] = y; arr[o + 15] = 1;
  }

  // ---------- 影・光の板の追加口 ----------
  function addShadow(x, y, rad, wide) {
    if (shadowN >= shadowMesh.count0) return;
    writeFlat(shadowMesh.instanceMatrix.array, shadowN++, x, y, 0.35, rad * 2 * (wide || 1), rad * 2);
  }
  // 立った光の板（板の高さ hgt の位置に中心）
  function addGlowBill(x, y, hgt, size, r, g, b, onPaper) {
    if (glowBillN >= glowBill.count0) return;
    const i = glowBillN++, o = i * 16, arr = glowBill.instanceMatrix.array;
    const hc = onPaper ? cosL : cosT, hs = onPaper ? sinL : sinT;      // 紙人形にくっつく光（目・フラッシュ）は、紙人形の起こした角度の上に置く
    arr[o] = size; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = size * cosT; arr[o + 6] = -size * sinT; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = sinT; arr[o + 10] = cosT; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = hgt * hc; arr[o + 14] = y - hgt * hs; arr[o + 15] = 1;
    const c = glowBill.instanceColor.array; c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b;
  }
  // 地面に寝かせた光の板
  function addGlowFlat(x, y, elev, size, r, g, b) {
    if (glowFlatN >= glowFlat.count0) return;
    const i = glowFlatN++;
    writeFlat(glowFlat.instanceMatrix.array, i, x, y, elev, size, size);
    const c = glowFlat.instanceColor.array; c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b;
  }

  // 演出の光の板を1枚足す（地面に寝かせる）。sx・sz は板の全幅。ang は +x 方向の向き（ゲームの座標の角度）
  function addPlate(type, x, y, elev, sx, sz, ang, r, g, b, a, p1, p2, p3) {
    if (fxN >= fxMesh.count0) return;
    const i = fxN++, o = i * 16, arr = fxMesh.instanceMatrix.array, ca = Math.cos(ang), sa = Math.sin(ang);
    arr[o] = sx * ca; arr[o + 1] = 0; arr[o + 2] = sx * sa; arr[o + 3] = 0;
    arr[o + 4] = -sz * sa; arr[o + 5] = 0; arr[o + 6] = sz * ca; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = 1; arr[o + 10] = 0; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = elev; arr[o + 14] = y; arr[o + 15] = 1;
    const c = fxAttrCol.array, q = fxAttrShape.array, k = i * 4;
    c[k] = r; c[k + 1] = g; c[k + 2] = b; c[k + 3] = a;
    q[k] = type; q[k + 1] = p1; q[k + 2] = p2; q[k + 3] = p3;
  }
  // 立てた光の板（光の柱）：足元 (x, y)、幅 w・高さ h
  function addPillar(x, y, w, h, r, g, b, a, p1) {
    if (fxN >= fxMesh.count0) return;
    const i = fxN++, o = i * 16, arr = fxMesh.instanceMatrix.array;
    arr[o] = w; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = h * cosT; arr[o + 6] = -h * sinT; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = sinT; arr[o + 10] = cosT; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = h * 0.5 * cosT; arr[o + 14] = y - h * 0.5 * sinT; arr[o + 15] = 1;
    const c = fxAttrCol.array, q = fxAttrShape.array, k = i * 4;
    c[k] = r; c[k + 1] = g; c[k + 2] = b; c[k + 3] = a;
    q[k] = 5; q[k + 1] = p1; q[k + 2] = 0; q[k + 3] = 0;
  }
  function addRingPlate(x, y, elev, R, rad, halfW, r, g, b, a) { addPlate(1, x, y, elev, R * 2, R * 2, 0, r, g, b, a, rad / R, Math.max(halfW / R, 0.012), 0); }
  function addDiscPlate(x, y, elev, R, r, g, b, a, exp) { addPlate(0, x, y, elev, R * 2, R * 2, 0, r, g, b, a, exp, 0, 0); }
  function addArcPlate(x, y, elev, R, ang, half, rad, halfW, r, g, b, a) { addPlate(3, x, y, elev, R * 2, R * 2, ang, r, g, b, a, half, rad / R, Math.max(halfW / R, 0.012)); }

  // ---------- 草・笹・小石（1024四方を3×3、カメラが1024ずれたら置き直し） ----------
  function rebuildDecor(ox, oy) {
    const cell = C.decorCell, n = Math.ceil((C.decorTile * 3) / cell);
    const gx0 = Math.floor(ox / cell), gy0 = Math.floor(oy / cell);
    const aP = decorPebble.instanceMatrix.array, aS = decorSasa.instanceMatrix.array, aG = decorGrass.instanceMatrix.array;
    let nP = 0, nS = 0, nG = 0;
    for (let ix = 0; ix < n; ix++) for (let iy = 0; iy < n; iy++) {
      const gx = gx0 + ix, gy = gy0 + iy, h = hash2(gx, gy);
      const wx = gx * cell + cell / 2, wy = gy * cell + cell / 2;
      if (h < 0.22) {
        if (nP < decorPebble.count0) { const d = (2 + h * 3) * 2.2; writeFlat(aP, nP++, wx + (h - 0.11) * 30, wy + (hash2(gx + 5, gy) - 0.5) * 20, 0.2, d, d * 0.8); }
      } else if (h < 0.32) {
        if (nG < decorGrass.count0) writeBoard(aG, nG++, wx + (h - 0.27) * 40, wy, 0, 12, 8);
      } else if (h < 0.4) {
        if (nS < decorSasa.count0) writeBoard(aS, nS++, wx, wy, 0, 10, 12);
      }
    }
    // 枯れた笹の株（見た目だけ。128四方ごとに、場所から決まる乱数で置く）
    const SC = C.scenery, cs = SC.cell, m = Math.ceil((C.decorTile * 3) / cs);
    const per = (C.decorTile / cs) * (C.decorTile / cs);
    const pDead = SC.deadSasa.perTile / per;
    const aD = sceneDead.instanceMatrix.array, aSh = decorShadow.instanceMatrix.array;
    const cx0 = Math.floor(ox / cs), cy0 = Math.floor(oy / cs), pSize = BALANCE.characterDisplay.combatPlayerSize;
    let nD = 0, nSh = 0;
    for (let ix = 0; ix < m; ix++) for (let iy = 0; iy < m; iy++) {
      const cx = cx0 + ix, cy = cy0 + iy;
      const wx = cx * cs + hash2(cx, cy + 17) * cs, wy = cy * cs + hash2(cx + 23, cy) * cs;
      if (Math.hypot(wx, wy) < SC.keepClear) continue;
      const h3 = hash2(cx * 13 + 3, cy * 17 + 8);
      if (h3 < pDead && nD < sceneDead.count0) {
        const hh = pSize * (SC.deadSasa.hMul[0] + hash2(cx + 40, cy + 41) * (SC.deadSasa.hMul[1] - SC.deadSasa.hMul[0]));
        writeBoard(aD, nD++, wx, wy, 0, SC.deadSasa.width * (hh / (pSize * 2)), hh);
        if (nSh < decorShadow.count0) writeFlat(aSh, nSh++, wx, wy, 0.3, 36, 36);
      }
    }
    sceneDead.count = nD;

    // 地形（World の一覧から。当たり判定と同じ物を描く）
    const aR = sceneRock.instanceMatrix.array, aPil = scenePillar.instanceMatrix.array, aW = wallMesh.instanceMatrix.array, aWT = wallTop.instanceMatrix.array;
    const aPd = puddleMesh.instanceMatrix.array, seedArr = puddleMesh.geometry.attributes.aSeed.array;
    let nR = 0, nPil = 0, nW = 0, nPd = 0, wallItems = 0;
    const tx0 = Math.round(ox / C.decorTile), ty0 = Math.round(oy / C.decorTile), segL = WORLD.wall.seg;
    for (let tx = tx0; tx < tx0 + 3; tx++) for (let ty = ty0; ty < ty0 + 3; ty++) {
      const its = World.tile(tx, ty).items;
      for (let k = 0; k < its.length; k++) {
        const it = its[k];
        if (it.t === World.ROCK) {
          if (nR >= sceneRock.count0) continue;
          const sz = it.size * 0.5, o = nR * 16, ca = Math.cos(it.ang), sa = Math.sin(it.ang);
          aR[o] = sz * ca; aR[o + 1] = 0; aR[o + 2] = -sz * sa; aR[o + 3] = 0; aR[o + 4] = 0; aR[o + 5] = sz * 0.6; aR[o + 6] = 0; aR[o + 7] = 0;
          aR[o + 8] = sz * sa; aR[o + 9] = 0; aR[o + 10] = sz * ca; aR[o + 11] = 0; aR[o + 12] = it.x; aR[o + 13] = sz * 0.3; aR[o + 14] = it.y; aR[o + 15] = 1;
          nR++;
          if (nSh < decorShadow.count0) writeFlat(aSh, nSh++, it.x, it.y, 0.3, it.size * 1.5, it.size * 1.5);
        } else if (it.t === World.PILLAR) {
          if (nPil >= scenePillar.count0) continue;
          const o = nPil * 16;
          aPil[o] = it.thick; aPil[o + 1] = 0; aPil[o + 2] = 0; aPil[o + 3] = 0; aPil[o + 4] = 0; aPil[o + 5] = it.height; aPil[o + 6] = 0; aPil[o + 7] = 0;
          aPil[o + 8] = 0; aPil[o + 9] = 0; aPil[o + 10] = it.thick; aPil[o + 11] = 0; aPil[o + 12] = it.x; aPil[o + 13] = 0; aPil[o + 14] = it.y; aPil[o + 15] = 1;
          nPil++;
          if (nSh < decorShadow.count0) writeFlat(aSh, nSh++, it.x, it.y, 0.3, it.thick * 3, it.thick * 3);
        } else if (it.t === World.WALL) {
          wallItems++;
          const nseg = Math.max(1, Math.round(it.len / segL)), l = it.len / nseg, th = it.horiz ? it.hh * 2 : it.hw * 2;
          for (let q = 0; q < nseg && nW < wallMesh.count0; q++) {
            const off = -it.len / 2 + l * (q + 0.5), cx = it.horiz ? it.x + off : it.x, cy = it.horiz ? it.y : it.y + off;
            const o = nW * 16;
            if (it.horiz) { aW[o] = l; aW[o + 1] = 0; aW[o + 2] = 0; aW[o + 8] = 0; aW[o + 9] = 0; aW[o + 10] = th; }
            else { aW[o] = 0; aW[o + 1] = 0; aW[o + 2] = l; aW[o + 8] = th; aW[o + 9] = 0; aW[o + 10] = 0; }
            aW[o + 3] = 0; aW[o + 4] = 0; aW[o + 5] = it.height; aW[o + 6] = 0; aW[o + 7] = 0; aW[o + 11] = 0;
            aW[o + 12] = cx; aW[o + 13] = 0; aW[o + 14] = cy; aW[o + 15] = 1;
            writeFlat(aWT, nW, cx, cy, it.height + 0.5, (it.horiz ? l : th) + 3, (it.horiz ? th : l) + 3);
            nW++;
          }
        } else if (it.t === World.PUDDLE) {
          if (nPd >= puddleMesh.count0) continue;
          writeFlat(aPd, nPd, it.x, it.y, 0.25, it.r * 2.1, it.r * 2.1);
          seedArr[nPd] = hash2(it.x, it.y) * 100; nPd++;
        }
      }
    }
    terrainCount.rocks = nR; terrainCount.pillars = nPil; terrainCount.walls = wallItems; terrainCount.wallSegs = nW; terrainCount.puddles = nPd;
    sceneRock.count = nR; scenePillar.count = nPil; wallMesh.count = nW; wallTop.count = nW; puddleMesh.count = nPd; decorShadow.count = nSh;
    sceneRock.visible = nR > 0; scenePillar.visible = nPil > 0; sceneDead.visible = nD > 0; decorShadow.visible = nSh > 0;
    wallMesh.visible = nW > 0; wallTop.visible = nW > 0; puddleMesh.visible = nPd > 0;
    sceneRock.instanceMatrix.needsUpdate = true; scenePillar.instanceMatrix.needsUpdate = true; sceneDead.instanceMatrix.needsUpdate = true; decorShadow.instanceMatrix.needsUpdate = true;
    wallMesh.instanceMatrix.needsUpdate = true; wallTop.instanceMatrix.needsUpdate = true; puddleMesh.instanceMatrix.needsUpdate = true; puddleMesh.geometry.attributes.aSeed.needsUpdate = true;
    decorPebble.count = nP; decorSasa.count = nS; decorGrass.count = nG;
    decorPebble.visible = nP > 0; decorSasa.visible = nS > 0; decorGrass.visible = nG > 0;
    decorPebble.instanceMatrix.needsUpdate = true; decorSasa.instanceMatrix.needsUpdate = true; decorGrass.instanceMatrix.needsUpdate = true;
  }

  // ============================================================
  //  初期化（1回だけ）
  // ============================================================
  Render3D.available = function () {
    if (failed || !THREE) return false;
    if (location.protocol === 'file:') return false;     // 絵のキャンバスが汚染扱いになり、テクスチャでエラーになる
    try { if (new URLSearchParams(location.search).get('r') === '2d') return false; } catch (e) {}
    return true;
  };

  Render3D.init = function (cv) {
    if (ready) return true;
    if (!THREE) { failed = true; return false; }
    try {
      canvas = cv;
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.useLegacyLights = true;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.shadowMap.enabled = false;
      renderer.setClearColor(new THREE.Color(C.bg), 1);
      // 描くたびに「最後に描いたシーンとカメラ」を覚える（村も戦闘も renderer.render を通る）。preserveDrawingBuffer は使わない
      rawRender = renderer.render.bind(renderer);
      renderer.render = function (sc, cam) { lastScene = sc; lastCam = cam; rawRender(sc, cam); };
      scene = new THREE.Scene();
      scene.background = new THREE.Color(C.bg);
      scene.fog = new THREE.Fog(C.fogColor, 1000, 2000);
      camera = new THREE.PerspectiveCamera(C.fovDeg, 1, 100, 4000);

      ambient = new THREE.AmbientLight(C.ambient.color, C.ambient.intensity); scene.add(ambient);
      moon = new THREE.DirectionalLight(C.moon.color, C.moon.intensity); moon.position.set(-0.4, 1, 0.5); scene.add(moon);
      lantern = new THREE.PointLight(C.lantern.color, C.lantern.intensity, C.lantern.distance, C.lantern.decay); scene.add(lantern);

      fallbackCanvas = paintFallback(); expCanvas = paintExp();

      // 地面
      groundTex = texFromCanvas(paintGround(), true, true);
      const gSize = 3072, gGeo = new THREE.PlaneGeometry(gSize, gSize);
      groundTex.repeat.set(gSize / C.groundTile, gSize / C.groundTile);
      ground = new THREE.Mesh(gGeo, new THREE.MeshLambertMaterial({ map: groundTex }));
      ground.rotation.x = -Math.PI / 2; scene.add(ground);

      // 草・笹・小石
      const flatGeo = new THREE.PlaneGeometry(1, 1);
      const boardGeo = new THREE.PlaneGeometry(1, 1); boardGeo.translate(0, 0.5, 0);
      const decorMat = (cv, smooth) => new THREE.MeshLambertMaterial({ map: texFromCanvas(cv, smooth, false), alphaTest: 0.3 });
      decorPebble = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: texFromCanvas(paintPebble(), true, false), transparent: true, depthWrite: false }), 1700);
      decorPebble.count0 = 1700;
      decorSasa = new THREE.InstancedMesh(boardGeo, decorMat(paintSasa(), true), 700); decorSasa.count0 = 700;
      decorGrass = new THREE.InstancedMesh(boardGeo.clone(), decorMat(paintGrass(), true), 800); decorGrass.count0 = 800;
      for (const m of [decorPebble, decorSasa, decorGrass]) { m.frustumCulled = false; m.count = 0; scene.add(m); }

      // 背の高い景色（岩・石柱・枯れ笹）。草と同じ1024四方×3×3のタイルに乗せ、まとめ描き
      const MIs = C.maxInstances, SC = C.scenery;
      const rockGeo = new THREE.IcosahedronGeometry(1, 0);
      sceneRock = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: SC.rock.color, flatShading: true }), MIs.rock); sceneRock.count0 = MIs.rock;
      const pilGeo = new THREE.CylinderGeometry(0.5, 0.58, 1, 7); pilGeo.translate(0, 0.5, 0);
      scenePillar = new THREE.InstancedMesh(pilGeo, new THREE.MeshLambertMaterial({ color: SC.pillar.color, flatShading: true }), MIs.pillar); scenePillar.count0 = MIs.pillar;
      sceneDead = new THREE.InstancedMesh(boardGeo.clone(), decorMat(paintDeadSasa(), true), MIs.deadSasa); sceneDead.count0 = MIs.deadSasa;
      for (const m of [sceneRock, scenePillar, sceneDead]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
      // 石垣（80ずつの石の箱をつなぐ）＋上に草の板
      const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);
      wallMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ map: texFromCanvas(paintStone(), true, false) }), MIs.wallSeg); wallMesh.count0 = MIs.wallSeg;
      wallTop = new THREE.InstancedMesh(flatGeo, new THREE.MeshLambertMaterial({ map: texFromCanvas(paintWallTop(), true, true) }), MIs.wallSeg); wallTop.count0 = MIs.wallSeg;
      // 水たまり：ふちをぼかし、ゆっくり模様が流れる
      const pGeo = new THREE.PlaneGeometry(1, 1);
      pGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(MIs.puddle), 1));
      puddleMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uFogNear: { value: 1000 }, uFogFar: { value: 2000 }, uFogColor: { value: new THREE.Color(C.fogColor) } },
        transparent: true, depthWrite: false,
        vertexShader: 'attribute float aSeed; varying vec2 vP; varying float vSeed; varying float vFogD;\n' +
          'void main() { vP = ( uv - 0.5 ) * 2.0; vSeed = aSeed; vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 ); vFogD = -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec2 vP; varying float vSeed; varying float vFogD; uniform float uTime; uniform float uFogNear; uniform float uFogFar; uniform vec3 uFogColor;\n' +
          'void main() { float d = length( vP ); float edge = 1.0 - smoothstep( 0.78, 0.98, d );\n' +
          ' float w = sin( vP.x * 9.0 + uTime * 0.6 + vSeed ) * sin( vP.y * 8.0 - uTime * 0.45 + vSeed * 1.7 ) + sin( ( vP.x + vP.y ) * 14.0 + uTime * 0.9 ) * 0.5;\n' +
          ' vec3 col = mix( vec3( 0.09, 0.16, 0.30 ), vec3( 0.22, 0.36, 0.56 ), 0.5 + 0.35 * w ) + vec3( 0.08, 0.10, 0.14 ) * smoothstep( 0.55, 0.95, d );\n' +
          ' float f = smoothstep( uFogNear, uFogFar, vFogD ); col = mix( col, uFogColor, f );\n' +
          ' gl_FragColor = vec4( col, 0.82 * edge ); }',
      });
      puddleMesh = new THREE.InstancedMesh(pGeo, puddleMat, MIs.puddle); puddleMesh.count0 = MIs.puddle; puddleMesh.renderOrder = 0;
      for (const m of [wallMesh, wallTop, puddleMesh]) { m.frustumCulled = false; m.count = 0; scene.add(m); }

      // 足元の影
      const shMat = new THREE.MeshBasicMaterial({ map: texFromCanvas(paintShadow(), true, false), transparent: true, depthWrite: false, color: 0x000000 });
      shadowMesh = new THREE.InstancedMesh(flatGeo, shMat, C.maxInstances.shadow);
      shadowMesh.count0 = C.maxInstances.shadow; shadowMesh.frustumCulled = false; shadowMesh.count = 0; shadowMesh.renderOrder = 1;
      scene.add(shadowMesh);

      // 板の種類
      const MI = C.maxInstances;
      makeSet('player', 'tomoshibi', 1, C.selfGlowOther, false, true);       // 紙人形（白いふち・寝かせ角・振り向き）
      for (const k of ['ori', 'kumo', 'tosshin', 'hakite']) makeSet(k, k, MI.enemy, C.selfGlowEnemy, false, true);
      makeSet('boss', 'boss_suyasuya', MI.boss, C.selfGlowEnemy, false, true);
      makeSet('boss2', 'boss_otsukisama', MI.boss, C.selfGlowEnemy, false, true);
      makeSet('chest', 'chest', MI.chest, C.selfGlowOther, false);
      makeSet('note', 'note', MI.note, 0.5, false);
      makeSet('orb', 'orb', MI.eorb, 0.5, false);
      makeSet('sleeporb', 'sleeporb', MI.eorb, 0.5, false);
      makeSet('exp', '_exp', MI.exp, 0.4, true);

      // 光の板（加算合成）：立てたもの／地面に寝かせたもの
      const glowTex = texFromCanvas(paintGlow(), true, false);
      const mkGlow = (geo) => {
        const mat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        fogToBlack(mat); mat.customProgramCacheKey = function () { return 'glow'; };
        const m = new THREE.InstancedMesh(geo, mat, MI.glow);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MI.glow * 3), 3);
        m.count0 = MI.glow; m.frustumCulled = false; m.count = 0; m.renderOrder = 2;
        scene.add(m); return m;
      };
      const billGeo = new THREE.PlaneGeometry(1, 1);
      glowBill = mkGlow(billGeo);
      glowFlat = mkGlow(flatGeo);
      decorShadow = new THREE.InstancedMesh(flatGeo, shMat, MIs.decorShadow);   // 景色の足元の丸い影（絵と材質は人物の影と共通）
      decorShadow.count0 = MIs.decorShadow; decorShadow.frustumCulled = false; decorShadow.count = 0; decorShadow.renderOrder = 1;
      scene.add(decorShadow);

      // 演出の光の板（円盤・輪・扇・弧・長方形・縦柱）。1つの材質・1回のまとめ描きで全部出す
      fxMat = new THREE.ShaderMaterial({
        uniforms: { uFogNear: { value: 1000 }, uFogFar: { value: 2000 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'attribute vec4 aCol; attribute vec4 aShape; varying vec2 vP; varying vec4 vCol; varying vec4 vShape; varying float vFogD;\n' +
          'void main() { vP = ( uv - 0.5 ) * 2.0; vCol = aCol; vShape = aShape; vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 ); vFogD = -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec2 vP; varying vec4 vCol; varying vec4 vShape; varying float vFogD; uniform float uFogNear; uniform float uFogFar;\n' +
          'float sat( float x ) { return clamp( x, 0.0, 1.0 ); }\n' +
          'void main() {\n' +
          '  vec2 p = vP; float d = length( p ); float t = vShape.x; float a = 0.0; float ang = abs( atan( p.y, p.x ) );\n' +
          '  if ( t < 0.5 ) { a = pow( sat( 1.0 - d ), vShape.y ); }\n' +                                             // 円盤（中心が明るい）
          '  else if ( t < 1.5 ) { a = 1.0 - smoothstep( 0.0, vShape.z, abs( d - vShape.y ) ); }\n' +                // 輪（半径 p1・半幅 p2）
          '  else if ( t < 2.5 ) { a = ( 1.0 - smoothstep( vShape.y - 0.1, vShape.y, ang ) ) * pow( sat( 1.0 - d ), vShape.z ); }\n' +   // 扇（半角 p1）
          '  else if ( t < 3.5 ) { a = ( 1.0 - smoothstep( vShape.y - 0.15, vShape.y, ang ) ) * ( 1.0 - smoothstep( 0.0, vShape.w, abs( d - vShape.z ) ) ); }\n' +   // 弧（半角 p1・半径 p2・半幅 p3）
          '  else if ( t < 4.5 ) { a = pow( sat( 1.0 - abs( p.y ) ), vShape.y ) * mix( 1.0, sat( 1.0 - ( p.x * 0.5 + 0.5 ) ), vShape.z ); }\n' +                      // 長方形（長手がx）
          '  else { a = pow( sat( 1.0 - abs( p.x ) ), vShape.y ) * sat( 1.0 - abs( p.y ) ); }\n' +                                                                    // 縦柱
          '  float f = smoothstep( uFogNear, uFogFar, vFogD ); a *= ( 1.0 - f );\n' +
          '  gl_FragColor = vec4( vCol.rgb * vCol.a, a ); }',
      });
      const FXN = C.maxInstances.fx;
      const fxGeo = new THREE.PlaneGeometry(1, 1);
      fxAttrCol = new THREE.InstancedBufferAttribute(new Float32Array(FXN * 4), 4);
      fxAttrShape = new THREE.InstancedBufferAttribute(new Float32Array(FXN * 4), 4);
      fxGeo.setAttribute('aCol', fxAttrCol); fxGeo.setAttribute('aShape', fxAttrShape);
      fxMesh = new THREE.InstancedMesh(fxGeo, fxMat, FXN);
      fxMesh.count0 = FXN; fxMesh.frustumCulled = false; fxMesh.count = 0; fxMesh.visible = false; fxMesh.renderOrder = 3;
      scene.add(fxMesh);

      // 粒（撃破の四角・火の粉）。位置と色と大きさを毎フレーム書き換えるだけ
      const mkPoints = (round, additive) => {
        const n = C.maxInstances.parts, g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
        g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
        const m = new THREE.ShaderMaterial({
          uniforms: { uScale: { value: 800 }, uFogNear: { value: 1000 }, uFogFar: { value: 2000 } },
          transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          vertexShader: 'attribute float aSize; attribute vec4 aColor; varying vec4 vColor; varying float vFogD; uniform float uScale;\n' +
            'void main() { vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vFogD = -mv.z; vColor = aColor; gl_PointSize = max( 1.5, aSize * uScale / -mv.z ); gl_Position = projectionMatrix * mv; }',
          fragmentShader: 'varying vec4 vColor; varying float vFogD; uniform float uFogNear; uniform float uFogFar;\n' +
            'void main() { float f = 1.0 - smoothstep( uFogNear, uFogFar, vFogD ); float a = vColor.a * f;\n' +
            (round ? ' float d = length( gl_PointCoord - 0.5 ) * 2.0; a *= clamp( 1.0 - d, 0.0, 1.0 );\n' : '') +
            (additive ? ' gl_FragColor = vec4( vColor.rgb, a ); }' : ' gl_FragColor = vec4( vColor.rgb, a ); }'),
        });
        const pts = new THREE.Points(g, m);
        pts.frustumCulled = false; pts.renderOrder = 4; g.setDrawRange(0, 0); scene.add(pts);
        pts.userData = { mat: m };
        return pts;
      };
      burstPts = mkPoints(false, false); emberPts = mkPoints(true, true);

      const poolMat = new THREE.MeshBasicMaterial({ map: texFromCanvas(paintPool(), true, false), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(C.pool.color) });
      fogToBlack(poolMat); poolMat.customProgramCacheKey = function () { return 'glow'; };
      poolMesh = new THREE.Mesh(flatGeo, poolMat);
      poolMesh.rotation.x = -Math.PI / 2; poolMesh.scale.set(C.pool.radius * 2, C.pool.radius * 2, 1);
      poolMesh.position.y = 0.45; poolMesh.renderOrder = 2; poolMesh.frustumCulled = false;
      scene.add(poolMesh);

      ready = true;
      Render3D.resize(canvas.clientWidth || 390, canvas.clientHeight || 844, 320, 640);
      return true;
    } catch (e) {
      failed = true; ready = false;
      try { console.warn('Render3D init failed', e); } catch (e2) {}
      return false;
    }
  };

  // 本のUI（book.js）用：今見えている3Dの絵を ctx（2Dキャンバス）へ w×h で写す。
  // WebGL の絵は描いた直後でないと読めないので、最後に描いたシーンとカメラでもう一度描き、同じ処理の中ですぐ drawImage する。
  // 写せたら true。まだ何も描いていない・失敗したら false（呼ぶ側は何も写さずに進む）
  Render3D.snapshotTo = function (ctx, w, h) {
    if (!ready || !rawRender || !lastScene || !lastCam) return false;
    try {
      rawRender(lastScene, lastCam);
      ctx.drawImage(renderer.domElement, 0, 0, w, h);
      return true;
    } catch (e) { return false; }
  };

  Render3D.show = function () { if (!canvas) return; canvas.style.display = 'block'; shown = true; decorKeyX = decorKeyY = 1e9; };
  Render3D.hide = function () { if (!canvas) return; canvas.style.display = 'none'; shown = false; };

  // 深さの色（体験版）。地面の色み・空・環境光・月の光だけ付け替える（新しい物は作らない）
  Render3D.setTone = function (t) {
    if (!ground || !C.tones) return;
    const T = C.tones[t] || C.tones[0];
    ground.material.color.set(T.ground); scene.background.set(T.bg);
    ambient.color.set(T.ambient); moon.color.set(T.moon);
  };

  Render3D.resize = function (w, h, logW, logH) {
    if (!ready) return;
    cssW = Math.max(1, w); cssH = Math.max(1, h); aspect = cssW / cssH;
    if (logW) { viewLogW = logW; viewLogH = logH || viewLogH; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(cssW, cssH, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = aspect;
    // プレイヤーの位置で、横幅が logW 以上になる距離
    const hw = Math.tan(C.fovDeg * 0.5 * DEG) * aspect;
    camDist = (viewLogW * C.widthMargin) / (2 * hw);
    viewWidthAtPlayer = 2 * hw * camDist;
    spawnDist = Math.hypot(viewLogW, viewLogH) / 2 + 50;
    // 霧：近い距離＝カメラ距離。遠い距離＝湧く位置より手前で地面が背景色になる値
    fogNear = camDist * C.fogNearMul;
    fogFarGround = spawnDist + C.fogFarSpawnAdd;           // 地面の上での距離（北側）
    fogFar = camDist + fogFarGround * cosP;                // 奥行きの距離
    camNear = camDist * 0.3; camFar = camDist * 2.6;
    // 見えている地面の端までの距離（プレイヤーから）を、湧く位置を決める側へ知らせる
    {
      const tv = Math.tan(C.fovDeg * 0.5 * DEG), th = tv * aspect, cy = sinP * camDist, cz = cosP * camDist;
      let left = 0, top = 0, bottom = 0;
      for (let k = 0; k < 4; k++) {
        const nx = (k & 1) ? 1 : -1, ny = (k & 2) ? 1 : -1;
        const dx = nx * th, dy = -sinP + ny * tv * cosP, dz = -cosP - ny * tv * sinP;
        if (dy >= -1e-6) { left = Math.max(left, 1e4); top = Math.max(top, 1e4); continue; }
        const t = cy / -dy, gx = Math.abs(dx * t), gz = cz + dz * t;   // gz：プレイヤーから見た前後（北が負）
        left = Math.max(left, gx);
        if (gz < 0) top = Math.max(top, -gz); else bottom = Math.max(bottom, gz);
      }
      if (window.Run && Run.setViewFrame) Run.setViewFrame({ left, right: left, top: Math.max(top, 50), bottom: Math.max(bottom, 50) });
    }
    camera.near = camNear; camera.far = camFar;
    camera.updateProjectionMatrix();
    scene.fog.near = fogNear; scene.fog.far = fogFar;
    puddleMat.uniforms.uFogNear.value = fogNear; puddleMat.uniforms.uFogFar.value = fogFar;
    fxMat.uniforms.uFogNear.value = fogNear; fxMat.uniforms.uFogFar.value = fogFar;
    const ptScale = Math.min(2, window.devicePixelRatio || 1) * cssH / (2 * Math.tan(C.fovDeg * 0.5 * DEG));
    for (const pt of [burstPts, emberPts]) { const u = pt.userData.mat.uniforms; u.uScale.value = ptScale; u.uFogNear.value = fogNear; u.uFogFar.value = fogFar; }
  };

  // ============================================================
  //  毎フレームの描画（ここでは new しない）
  // ============================================================
  Render3D.draw = function (v) {
    if (!ready || !shown) return;
    inDraw = true;
    const P = v.P, cam = v.cam;
    // 紙人形の時計は実時間（3択などでゲームが止まっても、振り向きは進む）。長く空いたら0.05秒に丸める
    tick();

    // ---- カメラ（揺れ込み） ----
    let sx = 0, sy = 0;
    if (v.shakeTime > 0) {
      const amt = v.shakeMag * (v.shakeTime / (v.shakeTotal || v.shakeTime));
      sx = (Math.random() - 0.5) * amt; sy = (Math.random() - 0.5) * amt;
    }
    const tx = cam.x + sx, tz = cam.y + sy;
    camera.position.set(tx, sinP * camDist, tz + cosP * camDist);
    camera.lookAt(tx, 0, tz);
    camera.updateMatrixWorld();

    // ---- 光（ランタンのゆらぎ・白フラッシュで一瞬ひらく） ----
    const flick = 0.8 + Math.sin(v.elapsed * 9) * 0.08;
    const lift = Math.min(1, v.flashA / 0.85) * C.flashLift;
    lantern.position.set(P.x, C.lantern.height, P.y);
    poolMesh.position.x = P.x; poolMesh.position.z = P.y;
    poolMesh.material.color.setRGB(C.pool.rgb[0] * flick * (1 + lift), C.pool.rgb[1] * flick * (1 + lift), C.pool.rgb[2] * flick * (1 + lift));
    lantern.intensity = C.lantern.intensity * (flick / 0.8) * (1 + lift);
    ambient.intensity = C.ambient.intensity * (1 + lift * 1.2);

    puddleMat.uniforms.uTime.value = v.elapsed;
    // ---- 地面・草 ----
    const gt = C.groundTile;
    ground.position.set(Math.round(tx / gt) * gt, 0, Math.round(tz / gt) * gt);
    const dt = C.decorTile;
    const kx = Math.floor(tx / dt), ky = Math.floor(tz / dt);
    if (kx !== decorKeyX || ky !== decorKeyY) { decorKeyX = kx; decorKeyY = ky; rebuildDecor((kx - 1) * dt, (ky - 1) * dt); }

    // ---- 板・影・光 ----
    shadowN = 0; glowBillN = 0; glowFlatN = 0; fxN = 0; burstN = 0; emberN = 0;
    for (let i = 0; i < setList.length; i++) { setList[i].n = 0; syncSprite(setList[i]); }
    drawActors(v);
    drawProps(v);
    drawEffects(v);
    drawParticles(v);

    for (let i = 0; i < setList.length; i++) {
      const s = setList[i];
      s.mesh.count = s.n; s.mesh.visible = s.n > 0;
      s.mesh.instanceMatrix.needsUpdate = true; s.flip.needsUpdate = true; s.fade.needsUpdate = true; s.back.needsUpdate = true;
    }
    shadowMesh.count = shadowN; shadowMesh.visible = shadowN > 0; shadowMesh.instanceMatrix.needsUpdate = true;
    glowBill.count = glowBillN; glowBill.visible = glowBillN > 0; glowBill.instanceMatrix.needsUpdate = true; glowBill.instanceColor.needsUpdate = true;
    glowFlat.count = glowFlatN; glowFlat.visible = glowFlatN > 0; glowFlat.instanceMatrix.needsUpdate = true; glowFlat.instanceColor.needsUpdate = true;

    fxMesh.count = fxN; fxMesh.visible = fxN > 0; fxMesh.instanceMatrix.needsUpdate = true; fxAttrCol.needsUpdate = true; fxAttrShape.needsUpdate = true;
    lastCounts.fx = fxN;

    renderer.render(scene, camera);
    inDraw = false;
  };

  function addBoard(s, x, y, elev, w, h, flip, fade) {
    if (s.n >= s.max) return -1;
    const i = s.n++;
    writeBoard(s.mesh.instanceMatrix.array, i, x, y, elev, w, h);
    s.flip.array[i] = flip ? 1 : 0;
    s.fade.array[i] = fade === undefined ? 1 : fade;
    return i;
  }

  // プレイヤー・敵（紙人形：白いふち・起こした角度・振り向き。歩きの揺れは主人公だけ）
  function drawActors(v) {
    const P = v.P, enemies = v.enemies;
    // プレイヤー
    const ps = sets.player;
    if (ps.name !== v.cfg.charId) { ps.name = v.cfg.charId; ps.src = null; syncSprite(ps); }
    const psize = BALANCE.characterDisplay.combatPlayerSize;
    if (pState.cfg !== v.cfg) { pState.cfg = v.cfg; resetPaper(pState, P.facing.x < 0 ? 1 : 0); }   // 新しい探索では向きを作り直す
    sampleVel(pState, P.x, P.y);
    const pFace = P.facing.x < -PA.facingDead ? 1 : (P.facing.x > PA.facingDead ? 0 : paperIntent(pState));   // 真上・真下を向いているあいだは向きを変えない
    paperAnim(pState, pFace, Math.hypot(pState.vx, pState.vy) > 6, true);
    lastPlayer.wf = pOut.wf; lastPlayer.flip = pOut.flip;
    addShadow(P.x, P.y, 13, PA.shadowWide);
    if (P.blinkOn) addPaper(ps, P.x, P.y, 0, psize, psize, pOut.flip, 1, pOut.wf, pOut.roll, pOut.back);

    // 敵
    let nEnemy = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.active) continue;
      const s = sets[e.kind === 'boss' ? (e.bossId === 'otsukisama' ? 'boss2' : 'boss') : e.kind]; if (!s) continue;
      nEnemy++;
      const size = e.kind === 'boss' ? e.r * 4 : e.r * 2.4;
      const rule = e.kind === 'boss' ? (e.chargeDirX < 0 ? 1 : 0) : (e.x < P.x ? 1 : 0);   // 今までの向きの決め方（ボス＝突進の向き／ほか＝プレイヤーのほう）
      const st = e.pp || (e.pp = newPaperState());
      if (st.born !== e.born) { st.born = e.born; resetPaper(st, rule); }                    // 湧いた敵は振り向かず、その向きで出る
      sampleVel(st, e.x, e.y);
      let want = paperIntent(st);
      if (forceFlip >= 0) { want = forceFlip; st.dir = want; st.turnT = -1; }                // テスト専用：すぐその向きにする
      else if (Math.abs(st.vx) >= PA.enemyTurnSpeed) want = rule;                            // 左右に毎秒8px以上動いているときだけ向きを変える
      paperAnim(st, want, false, false);
      const age = (v.elapsed - e.born) / C.spawnFadeT, fade = age >= 1 ? 1 : (age <= 0 ? 0.02 : age * age * (3 - 2 * age));
      addShadow(e.x, e.y, e.r * 1.35 * (0.4 + 0.6 * fade));
      addPaper(s, e.x, e.y, 0, size, size, pOut.flip, fade, pOut.wf, 0, pOut.back);
      // エリート：足元に金色の光の輪（脈打つ）＋金の光
      if (e.elite) {
        const pu = 0.7 + 0.3 * Math.sin(v.elapsed * 6), er = rgbOf(PAL.elite);
        addRingPlate(e.x, e.y, 0.7, e.r * 1.6 + 8, e.r + 5, 2.2, er[0], er[1], er[2], pu * fade);
        addGlowFlat(e.x, e.y, 0.55, 96, 0.94 * 0.8 * fade, 0.75 * 0.8 * fade, 0.31 * 0.8 * fade);
      }
      // 被弾の白フラッシュ・予兆の点滅・燃焼：敵の上に加算の板を重ねる
      if (e.flashFrames > 0) addGlowBill(e.x, e.y, size * 0.5, e.r * 3.4, 0.6, 0.6, 0.6, true);
      if (((e.kind === 'tosshin' || e.kind === 'boss') && e.state === 'telegraph') && Math.floor(v.elapsed * 14) % 2 === 0) addGlowBill(e.x, e.y, size * 0.5, (e.r + 3) * 3, 0.4, 0.4, 0.4, true);
      if (e.burnT > 0) addGlowBill(e.x, e.y, size * 0.3, e.r * 2, 0.5, 0.2, 0.06, true);
      // 目の光（赤）。ボスは2つ
      if (e.kind === 'boss') {
        const ex = e.r * 0.5, eh = size * 0.6;
        addGlowBill(e.x - ex, e.y, eh, 10, fade, 0.3 * fade, 0.3 * fade, true);
        addGlowBill(e.x + ex, e.y, eh, 10, fade, 0.3 * fade, 0.3 * fade, true);
      } else {
        addGlowBill(e.x, e.y, size * 0.58, 5 + e.r * 0.45, fade, 0.3 * fade, 0.3 * fade, true);
      }
    }
    lastCounts.enemies = nEnemy;
  }

  // 経験値・宝箱・弾・罠
  function drawProps(v) {
    const orbs = v.orbs, chests = v.chests, pProj = v.pProj, eProj = v.eProj, traps = v.traps;
    const SZ = C.sizes;
    let nOrb = 0, nChest = 0, nProj = 0, nTrap = 0;
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i]; if (!o.active) continue;
      nOrb++;
      addShadow(o.x, o.y, 4);
      addBoard(sets.exp, o.x, o.y, 2, SZ.exp, SZ.exp, false);
      addGlowBill(o.x, o.y, 2 + SZ.exp * 0.5, 22, 0.35, 0.62, 0.3);
    }
    for (let i = 0; i < chests.length; i++) {
      const c = chests[i]; if (!c.active) continue;
      nChest++;
      addShadow(c.x, c.y, 8);
      addBoard(sets.chest, c.x, c.y, 0, SZ.chest, SZ.chest, false);
      const cpu = 0.55 + 0.25 * Math.sin(v.elapsed * 3 + i);   // 場にあるあいだ金色にゆっくり明滅（エリートの光と同じ金）
      addGlowFlat(c.x, c.y, 0.55, 72, 0.94 * cpu, 0.75 * cpu, 0.31 * cpu);
    }
    const noteRgb = v.stats && v.stats.element ? hexRgb(ELEMENTS[v.stats.element].color) : hexRgb(PAL.light);
    for (let i = 0; i < pProj.length; i++) {
      const p = pProj[i]; if (!p.active) continue;
      nProj++;
      if (p.blade) continue;                       // 若枝の刃は段2（光の板）で描く
      addBoard(sets.note, p.x, p.y, 6, SZ.note, SZ.note, false);
      addGlowBill(p.x, p.y, 6 + SZ.note * 0.5, 22, noteRgb[0] / 255 * 0.6, noteRgb[1] / 255 * 0.6, noteRgb[2] / 255 * 0.6);
    }
    for (let i = 0; i < eProj.length; i++) {
      const p = eProj[i]; if (!p.active) continue;
      nProj++;
      addBoard(p.kind === 'sleeporb' ? sets.sleeporb : sets.orb, p.x, p.y, 6, SZ.orb, SZ.orb, false);
      addGlowBill(p.x, p.y, 6 + SZ.orb * 0.5, 28, 0.55, 0.38, 1);
    }
    for (let i = 0; i < traps.length; i++) {
      const t = traps[i]; if (!t.active) continue;
      nTrap++;
      const pulse = 0.75 + 0.25 * Math.sin(v.elapsed * 6 + i);
      addGlowFlat(t.x, t.y, 0.5, t.r * 2, 0.5 * pulse, 0.18 * pulse, 0.36 * pulse);     // 触れる範囲の淡い光
      addGlowFlat(t.x, t.y, 0.6, 22, 1 * pulse, 0.41 * pulse, 0.76 * pulse);            // まりの芯
    }
    lastCounts.orbs = nOrb; lastCounts.chests = nChest; lastCounts.proj = nProj; lastCounts.traps = nTrap;
  }

  // ============================================================
  //  攻撃・必殺の演出（今の2Dの描画と同じ大きさ・時間・色。形は光の板で出す）
  // ============================================================
  function drawEffects(v) {
    const P = v.P, st = v.stats, sp = v.special, elapsed = v.elapsed;
    const SB = BALANCE.special;

    // 前方薙ぎ（arcFx）：扇のうっすらした面＋弧の線
    const arcs = v.arcFx;
    if (arcs.length > 0) {
      const col = rgbOf(v.arcColor), half = v.arcAngle / 2, rad = v.arcRadius, Rq = rad * 1.1, nj = st.unique ? 3 : 2;
      for (let i = 0; i < arcs.length; i++) {
        const a = arcs[i], prog = a.t / a.dur, fade = 1 - prog;
        addPlate(2, P.x, P.y, 0.9, Rq * 2, Rq * 2, a.ang, col[0], col[1], col[2], 0.45 * fade, half, 1.1, 0);
        for (let j = 0; j < nj; j++) {
          const rr = rad * (0.55 + j * 0.3) * (0.6 + prog * 0.4);
          addArcPlate(P.x, P.y, 1.0, Rq, a.ang, half, rr, (st.unique ? 3 : 2) * 0.9, col[0], col[1], col[2], fade);
        }
      }
    }

    // 若枝の刃（若葉色の三日月）
    const pProj = v.pProj, bq = QUESTS.wakaeda, bc = rgbOf(bq.color);
    for (let i = 0; i < pProj.length; i++) {
      const p = pProj[i]; if (!p.active || !p.blade) continue;
      const ang = Math.atan2(p.vy, p.vx), br = bq.bladeR, Rb = br * 1.4;
      addArcPlate(p.x - Math.cos(ang) * br * 0.55, p.y - Math.sin(ang) * br * 0.55, 6, Rb, ang, 1.1, br, bq.bladeLine * 0.8, bc[0], bc[1], bc[2], 1);
      addArcPlate(p.x - Math.cos(ang) * br * 0.55, p.y - Math.sin(ang) * br * 0.55, 6.2, Rb, ang, 0.9, br, bq.bladeLineInner * 0.8, 0.91, 1, 0.85, 1);
      addGlowBill(p.x, p.y, 8, 44, bc[0] * 0.8, bc[1] * 0.8, bc[2] * 0.8);
    }

    // 必殺
    const kind = sp.active;
    if (kind === 'wave') {                          // ともしび：前へ広がる灯りの波
      const prog = Math.min(1, sp.t / 0.45), len = SB.beamLen, half = 38 + prog * 34, ang = Math.atan2(sp.dir.y, sp.dir.x);
      addPlate(2, sp.castX, sp.castY, 1.0, len * 2, len * 2, ang, 1, 0.75, 0.36, 0.95, Math.atan2(half, len), 0.9, 0);
      addPlate(2, sp.castX, sp.castY, 1.1, len * 2, len * 2, ang, 1, 0.98, 0.86, 0.5, Math.atan2(half, len) * 0.6, 1.6, 0);
      for (let i = 0; i < 3; i++) {
        const x = 38 + prog * 70 + i * 26, r = 24 + i * 12, al = 0.95 - i * 0.2;
        addArcPlate(sp.castX + sp.dir.x * x, sp.castY + sp.dir.y * x, 1.3, 52, ang, 1.05, r, (7 - i) * 0.5 + 1, 1, 0.96, 0.82, al);
      }
    } else if (kind === 'chorus') {                 // おんぷ：広がる輪＋音符
      const prog = Math.min(1, sp.t / 0.55), radius = 42 + prog * 178, Rq = 232;
      for (let i = 0; i < 3; i++) {
        const rr = Math.max(8, radius - i * 18), hw = (8 - i * 2) * 0.5 + 1;
        if (i === 1) addRingPlate(P.x, P.y, 1.0 + i * 0.05, Rq, rr, hw, 0.96, 0.8, 1, 0.92);
        else addRingPlate(P.x, P.y, 1.0 + i * 0.05, Rq, rr, hw, 0.76, 0.41, 1, 0.58);
      }
      addDiscPlate(P.x, P.y, 0.8, radius, 0.5, 0.25, 0.7, 0.18, 1.2);
      const ns = sets.note;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + prog * 1.4;
        addBoard(ns, P.x + Math.cos(a) * radius * 0.78, P.y + Math.sin(a) * radius * 0.78, 8, 24, 24, i % 2 === 1);
        addGlowBill(P.x + Math.cos(a) * radius * 0.78, P.y + Math.sin(a) * radius * 0.78, 20, 30, 0.6, 0.35, 0.8);
      }
    } else if (kind === 'goro') {                   // ごろごろ：渦と大きなまり
      const prog = Math.min(1, sp.t / 0.65), radius = 150 - prog * 88, rot = prog * 2.2, Rq = 160;
      addDiscPlate(sp.castX, sp.castY, 0.8, 150, 0.7, 0.2, 0.5, 0.2, 1.3);
      for (let i = 0; i < 4; i++) {
        const rr = Math.max(20, radius - i * 20), hw = (10 - i * 1.5) * 0.5 + 1, half = Math.PI * 0.675;
        const ang = i * 0.7 + rot + half;
        if (i < 2) addArcPlate(sp.castX, sp.castY, 1.0 + i * 0.05, Rq, ang, half, rr, hw, 1, 0.41, 0.76, 0.78);
        else addArcPlate(sp.castX, sp.castY, 1.0 + i * 0.05, Rq, ang, half, rr, hw, 0.71, 0.36, 1, 0.55);
      }
      const coreR = 20 + prog * 35;
      addDiscPlate(sp.castX, sp.castY, 1.4, coreR * 1.6, 1, 0.65, 0.86, 0.95, 1.2);
      addDiscPlate(sp.castX, sp.castY, 1.5, coreR * 0.9, 1, 1, 0.94, 1, 1.0);
      addGlowBill(sp.castX, sp.castY, coreR * 0.9, coreR * 2.4, 1, 0.5, 0.8);
    } else if (kind === 'ring' || kind === 'ringBeam' || kind === 'field') {
      if (kind === 'field') {                       // 結界
        const R = SB.fieldR, pulse = 0.75 + Math.sin(sp.t * 5) * 0.25;
        addDiscPlate(sp.castX, sp.castY, 0.8, R * 1.1, 1, 0.77, 0.42, 0.14, 1.0);
        addRingPlate(sp.castX, sp.castY, 1.0, R * 1.2, R, 1.6, 1, 0.91, 0.69, 0.65 * pulse);
        addRingPlate(sp.castX, sp.castY, 0.95, R * 1.2, R, 5, 1, 0.77, 0.42, 0.2);
      } else {                                      // 輪（二重の輪の2発目も同じ）
        const rr = sp.ringR, fade = 1 - Math.min(1, sp.t / 0.5) * 0.35, Rq = SB.ringR + 40;
        addDiscPlate(sp.castX, sp.castY, 0.8, Math.max(40, rr * 1.1), 1, 0.75, 0.43, 0.18, 1.2);
        addRingPlate(sp.castX, sp.castY, 1.0, Rq, rr, 9, 1, 0.77, 0.42, 0.16 * fade * 3);
        addRingPlate(sp.castX, sp.castY, 1.02, Rq, rr, 4, 1, 0.86, 0.59, 0.5 * fade);
        addRingPlate(sp.castX, sp.castY, 1.04, Rq, rr, 1.5, 1, 0.97, 0.9, 0.95 * fade);
      }
    }
    if (kind === 'beam' || kind === 'ringBeam') {   // 一条の波（極意の直線）
      const bw = SB.beamW, len = SB.beamLen, from = 26, ang = Math.atan2(sp.dir.y, sp.dir.x), half = (len - from) / 2;
      const mx = sp.castX + sp.dir.x * (from + half), my = sp.castY + sp.dir.y * (from + half);
      addPlate(4, mx, my, 1.0, half * 2, bw * 1.4, ang, 1, 0.77, 0.42, 0.45, 0.8, 0, 0);
      addPlate(4, mx, my, 1.05, half * 2, bw * 0.74, ang, 1, 0.77, 0.42, 0.7, 0.7, 0, 0);
      addPlate(4, mx, my, 1.1, half * 2, bw * 0.33, ang, 1, 0.94, 0.78, 0.9, 0.6, 0, 0);
      addPlate(4, mx, my, 1.15, half * 2, bw * 0.13, ang, 1, 1, 1, 1, 0.5, 0, 0);
      for (let i = 0; i < 3; i++) { const d = i === 0 ? 0.4 : (i === 1 ? 0.7 : 0.95); addDiscPlate(sp.castX + sp.dir.x * len * d, sp.castY + sp.dir.y * len * d, 1.2, bw * 0.91, 1, 0.96, 0.86, 0.7, 1.2); }
      addDiscPlate(sp.castX + sp.dir.x * from, sp.castY + sp.dir.y * from, 1.2, bw * 0.74, 1, 0.98, 0.92, 0.7, 1.2);
    }

    // レベルアップの光の柱
    if (v.levelPillar > 0) { const lp = rgbOf(PAL.lightHi); addPillar(P.x, P.y, 28, 130, lp[0], lp[1], lp[2], v.levelPillar / 0.5, 1.4); }
  }

  // 粒：撃破の四角・火の粉・雷の連鎖
  function drawParticles(v) {
    const parts = v.parts;
    const bp = burstPts.geometry.attributes.position.array, bs = burstPts.geometry.attributes.aSize.array, bcol = burstPts.geometry.attributes.aColor.array;
    const ep = emberPts.geometry.attributes.position.array, es = emberPts.geometry.attributes.aSize.array, ecol = emberPts.geometry.attributes.aColor.array;
    const lim = C.maxInstances.parts;
    let nb = 0, ne = 0, nv = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; if (!p.active) continue;
      const a = Math.max(0, p.life / p.maxLife);
      if (p.kind === 'square') {
        if (nb >= lim) continue;
        const c = rgbOf(p.color), k = nb * 3;
        bp[k] = p.x; bp[k + 1] = 8 + (1 - a) * 6; bp[k + 2] = p.y; bs[nb] = p.size * 1.3;
        bcol[nb * 4] = c[0]; bcol[nb * 4 + 1] = c[1]; bcol[nb * 4 + 2] = c[2]; bcol[nb * 4 + 3] = a; nb++; nv++;
      } else if (p.kind === 'ember') {
        if (ne >= lim) continue;
        const c = rgbOf(p.color), k = ne * 3;
        ep[k] = p.x; ep[k + 1] = 10 + (p.maxLife - p.life) * 5; ep[k + 2] = p.y; es[ne] = p.size * 2.2;
        ecol[ne * 4] = c[0]; ecol[ne * 4 + 1] = c[1]; ecol[ne * 4 + 2] = c[2]; ecol[ne * 4 + 3] = a * 0.8; ne++; nv++;
      } else if (p.kind === 'bolt') {                // 雷：地面から少し上の細い光の線
        const dx = p.x2 - p.x, dy = p.y2 - p.y, len = Math.hypot(dx, dy) || 1, c = rgbOf(p.color);
        addPlate(4, (p.x + p.x2) / 2, (p.y + p.y2) / 2, 8, len, 3.5, Math.atan2(dy, dx), c[0], c[1], c[2], a, 0.6, 0, 0); nv++;
      }
    }
    burstN = nb; emberN = ne;
    burstPts.geometry.setDrawRange(0, nb); emberPts.geometry.setDrawRange(0, ne);
    burstPts.geometry.attributes.position.needsUpdate = true; burstPts.geometry.attributes.aSize.needsUpdate = true; burstPts.geometry.attributes.aColor.needsUpdate = true;
    emberPts.geometry.attributes.position.needsUpdate = true; emberPts.geometry.attributes.aSize.needsUpdate = true; emberPts.geometry.attributes.aColor.needsUpdate = true;
    lastCounts.parts = nv;
  }

  // ゲームの位置(x, y)と高さ h（板に沿った高さ）→ #fx の画面座標（表示解像度）。out を使い回す
  Render3D.worldToScreen = function (x, y, h, out) {
    if (!ready) { out.x = 0; out.y = 0; return out; }
    const V = camera.matrixWorldInverse.elements, Pm = camera.projectionMatrix.elements;
    const py = h * cosL, pz = y - h * sinL;          // h は紙人形の板に沿った高さ（ダメージ数字・敵の印の位置）
    const vx = V[0] * x + V[4] * py + V[8] * pz + V[12];
    const vy = V[1] * x + V[5] * py + V[9] * pz + V[13];
    const vz = V[2] * x + V[6] * py + V[10] * pz + V[14];
    const cx = Pm[0] * vx, cy = Pm[5] * vy, cw = -vz;
    const nx = cx / (cw || 1), ny = cy / (cw || 1);
    const fw = canvas.width, fh = canvas.height;
    out.x = (nx * 0.5 + 0.5) * fw; out.y = (1 - (ny * 0.5 + 0.5)) * fh;
    return out;
  };

  // テスト用：3Dで描いている地形の位置（x, y）の一覧
  Render3D.terrainPositions = function (type) {
    const m = type === 'rock' ? sceneRock : type === 'pillar' ? scenePillar : type === 'puddle' ? puddleMesh : null;
    if (!m) return [];
    const out = [], a = m.instanceMatrix.array;
    for (let i = 0; i < m.count; i++) out.push([a[i * 16 + 12], a[i * 16 + 14]]);
    return out;
  };
  // ---------- 村の3D（village3d.js）が同じ renderer・紙人形の仕組みを使うための道具箱 ----------
  Render3D.kit = {
    THREE, C, PA, out: pOut, tick,
    get renderer() { return renderer; }, get canvas() { return canvas; },
    mkCanvas, hash2, hexRgb, rgbOf, texFromCanvas, fogToBlack,
    paintGlow, paintPool, paintShadow,
    makeSet, applySprite, newPaperState, resetPaper, paperIntent, sampleVel, paperAnim, addPaper,
    writeFlat, writeBoardTilt, tiltCos: cosT, tiltSin: sinT,
    sprite: function (name) { try { return (window.Sprites && Sprites.get ? Sprites.get(name) : null) || fallbackCanvas; } catch (e) { return fallbackCanvas; } },
    setCanvasVisible: function (on) { if (canvas) canvas.style.display = on ? 'block' : 'none'; },
  };
  Render3D.debugForceFlip = function (v) { forceFlip = v; };   // テスト専用（ふだんの描画では使わない）

  // ---------- テスト用の窓口（読むだけ） ----------
  // 板の行列から、起こした角度（度）を測る（揺れの影響を受けない）
  function leanOf(a, o) { return Math.atan2(-a[o + 6], Math.hypot(a[o + 4], a[o + 5])) / DEG; }
  function findSet(name) {
    if (sets[name]) return sets[name];
    for (let i = 0; i < setList.length; i++) if (setList[i].name === name) return setList[i];
    return null;
  }
  Render3D.dbg = {
    // 白いふち：{ pad: 余白px, white: ふちの白の割合 }。ふち＝絵の外にできた不透明な画素のうち、いちばん外の1px線を除いたもの
    paperProbe: function (name) {
      const s = findSet(name);
      if (!s || !s.paper || !s.cut) return { pad: 0, white: 0, paper: false, found: !!s };
      const cv = s.cut, W = cv.width, H = cv.height, pad = s.pad, g = cv.getContext('2d');
      const px = g.getImageData(0, 0, W, H).data;
      const tmp = mkCanvas(W - pad * 2, H - pad * 2), tg = tmp.getContext('2d'); tg.imageSmoothingEnabled = s.cutK === 1 && !!(window.Sprites && Sprites.isIllustrated && Sprites.isIllustrated(s.name)); tg.drawImage(s.src, 0, 0, tmp.width, tmp.height);
      const org = tg.getImageData(0, 0, tmp.width, tmp.height).data, ow = tmp.width;
      const bc = hexRgb(PA.borderColor);
      const solid = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && px[(y * W + x) * 4 + 3] > 200; };
      let ring = 0, white = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!solid(x, y)) continue;
        const ox = x - pad, oy = y - pad;
        if (ox >= 0 && oy >= 0 && ox < ow && oy < tmp.height && org[(oy * ow + ox) * 4 + 3] > 10) continue;   // もとの絵の中
        if (!(solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1))) continue;           // いちばん外の線
        ring++;
        const k = (y * W + x) * 4;
        if (Math.abs(px[k] - bc[0]) < 24 && Math.abs(px[k + 1] - bc[1]) < 24 && Math.abs(px[k + 2] - bc[2]) < 24) white++;
      }
      return { pad, white: ring ? white / ring : 0, ring, paper: true, found: true };
    },
    // 主人公の板の今の状態：{ w: 幅の割合, flip, lean: 起こした角度(度), foot: 絵の下端の中心の位置[x,y,z], pad }
    playerBoard: function () {
      const s = sets.player, a = s.mesh.instanceMatrix.array;
      const frac = s.padY / (1 + 2 * s.padY);
      return { w: lastPlayer.wf, flip: lastPlayer.flip, lean: leanOf(a, 0), pad: s.pad,
               foot: [a[12] + a[4] * frac, a[13] + a[5] * frac, a[14] + a[6] * frac] };
    },
    // 白いふちを足した絵（確認用の画像）
    cutImage: function (name) { const s = findSet(name); return s && s.cut ? s.cut.toDataURL('image/png') : null; },
    // 飾りの板（草）の起こした角度（度）。紙人形にしていない板の角度の見本
    decorLean: function () { return decorGrass && decorGrass.count > 0 ? leanOf(decorGrass.instanceMatrix.array, 0) : null; },
  };
  Render3D.debug = function () {
    return {
      webgl: !!(ready && renderer && renderer.getContext && renderer.getContext()),
      visible: !!(canvas && canvas.style.display !== 'none' && shown),
      drawCalls: ready ? renderer.info.render.calls : 0,
      counts: Object.assign({}, lastCounts),
      terrain: Object.assign({}, terrainCount), viewWidthAtPlayer, fogFar: fogFarGround, spawnDist, newInDraw, texRebuilds,
      camDist, fogNear, fogFarDepth: fogFar,
      bg: ready && scene && scene.background ? '#' + scene.background.getHexString() : null,
      objects: ready ? { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs ? renderer.info.programs.length : 0 } : null,
    };
  };
})();
