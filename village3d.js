// ササノアビス モックアップ - 村の3D描画（飛び出す絵本）
// 要件定義_村の3Dと紙人形_2026-10-22.md §4。window.Village3D を登録する。
// 戦闘と同じ #world3d キャンバス・renderer を共有し、村のシーンを別に持つ（村→戦闘→村で作り直さない。村のシーンは最初に入ったとき一度だけ作る）。
// 動き・当たり判定・施設の判定・ふきだし・ボタンは village.js のまま。ここは Village.view を読んで描くだけ。
// 建物・木・テントは「建物ごとに1つの THREE.Group」。原点は正面の足元の中央で、あとから寝た状態から起き上がる動きを付けられる。

(function () {
  'use strict';

  const R3 = window.Render3D;
  const C = window.RENDER3D;
  const V = C.village;
  const DEG = Math.PI / 180;
  const THREE = window.THREE;

  const Village3D = {};
  window.Village3D = Village3D;

  let K = null;                                   // Render3D.kit（戦闘と共有する道具箱）
  let built = false, active = false, failed = false;
  let renderer = null, canvas = null, scene = null, camera = null;
  let view = null;
  let cssW = 390, cssH = 844, fxW = 390, fxH = 844, logW = 320, logH = 568, curGap = -1;
  let camDist = 800, sinP = 0, cosP = 0;
  const GPS = 3;                                  // 地面の絵だけ細かくする（石畳の石がつぶれないよう、論理1pxを3×3画素で）
  const PS = 2;                                   // 絵を貼る板の解像度（論理1pxを2×2画素で）

  // 建物（あとで1つずつ動かせるよう、1つずつ Group）
  const bld = {};
  let groundMesh = null, groundTex = null;
  let ambient = null, moon = null, campLight = null, forgeLight = null;
  let shadowMesh = null, shadowN = 0;
  let gb = null, gf = null, gbN = 0, gfN = 0;     // 光の板（立てたもの／地面に寝かせたもの）
  let lampPole = null, lampGlass = null, sasaMesh = null, barrelMesh = null, stoneMesh = null;
  const people = [];                              // 紙人形の板（1枚ずつ）
  let pSet = null, mSet = null;
  const npcSets = [], seatSets = [];
  const pst = { s: null };                        // 主人公の向きの状態（Render3D.kit.newPaperState）
  let fireflyN = 0;
  // 本のページ（村の地面の下に敷く紙）と、村の起き上がり（要件定義_本のUI §4）。数値は data.js の BOOK
  const BK = window.BOOK, PG = BK.page;
  let pageMesh = null, pageTex = null;
  const pageR = { x0: 0, z0: 0, x1: 0, z1: 0 };   // ページ全体（右と下の厚みを含む）の論理座標
  const PAGE_Y = -0.2;                            // ページの面の高さ（地面 0 のすぐ下。厚みの色はページの絵に描き込む）
  const pop = { running: false, frozen: false, t0: 0, tFrozen: 0, lean: null, list: [], minRotX: 0, maxRotX: 0 };
  let glowK = 1;                                  // 起き上がりの途中だけ光を弱める倍率（普段は 1）
  let popProps = null;                            // まとめ描きの小物（街灯・樽・笹の株）

  // ============================================================
  //  小さな道具
  // ============================================================
  function avgColor(cv) {   // 絵の平均色（0〜1）
    const c = K.mkCanvas(1, 1), g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.drawImage(cv, 0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  }
  // 村の絵を描く関数 fn(ctx) を、論理座標 (x, y, w, h) の範囲だけ切り出して板用の絵にする
  function paintRegion(fn, x, y, w, h, ps) {
    ps = ps || PS;
    const c = K.mkCanvas(Math.round(w * ps), Math.round(h * ps)), g = c.getContext('2d');
    g.imageSmoothingEnabled = false; g.scale(ps, ps); g.translate(-x, -y);
    fn(g);
    return c;
  }
  function lam(opts) { return new THREE.MeshLambertMaterial(opts); }
  function colorOf(hex) { return new THREE.Color(hex); }

  // 輪郭（u, v）を押し出した柱。axis 'x'＝x方向に長い（uがz）／'z'＝z方向に長い（uがx）。vは高さ。両端のふたつき
  function prismGeo(profile, len, axis) {
    const pos = [], h = len / 2, n = profile.length;
    const pt = function (i, t) { const u = profile[i][0], v = profile[i][1]; return axis === 'x' ? [t, v, u] : [u, v, t]; };
    const tri = function (a, b, c) { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(pt(i, -h), pt(j, -h), pt(j, h)); tri(pt(i, -h), pt(j, h), pt(i, h));
    }
    for (let i = 1; i < n - 1; i++) { tri(pt(0, -h), pt(i, -h), pt(i + 1, -h)); tri(pt(0, h), pt(i + 1, h), pt(i, h)); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  // 光の板（加算合成）のまとめ描き。立てたもの（gb）と地面に寝かせたもの（gf）
  function mkGlow(geo, tex, max) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    K.fogToBlack(mat); mat.customProgramCacheKey = function () { return 'glow'; };
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    m.frustumCulled = false; m.count = 0; m.renderOrder = 2; m.userData.max = max;
    scene.add(m);
    return m;
  }
  function addBill(x, z, elev, size, r, g, b) {   // 立てた光の板。中心の高さ elev
    if (gbN >= gb.userData.max) return;
    const i = gbN++;
    K.writeBoardTilt(gb.instanceMatrix.array, i, x, z, elev, size, size, K.tiltCos, K.tiltSin);   // 板の中心が (x, elev, z)
    const c = gb.instanceColor.array; c[i * 3] = r * glowK; c[i * 3 + 1] = g * glowK; c[i * 3 + 2] = b * glowK;
  }
  function addPool(x, z, size, r, g, b) {         // 地面に寝かせた光の板
    if (gfN >= gf.userData.max) return;
    const i = gfN++;
    K.writeFlat(gf.instanceMatrix.array, i, x, z, 0.5, size, size);
    const c = gf.instanceColor.array; c[i * 3] = r * glowK; c[i * 3 + 1] = g * glowK; c[i * 3 + 2] = b * glowK;
  }
  function addShadowAt(x, z, sx, sz) {            // 足元・建物の下の丸い影
    if (shadowN >= shadowMesh.userData.max) return;
    K.writeFlat(shadowMesh.instanceMatrix.array, shadowN++, x, z, 0.35, sx, sz);
  }

  // 箱の側面・上面の材質（正面だけ絵。側面は正面の平均色を暗くする）
  function boxMats(frontMat, sideColor) {
    const side = lam({ color: sideColor });
    return [side, side, side, side, frontMat, side];   // +x, -x, +y, -y, +z, -z
  }

  // ============================================================
  //  建物（Group 1つずつ。原点＝正面の足元の中央）
  // ============================================================
  function buildGuild() {
    const L = view.layout.GUILD, W = view.layout.GUILD_WIN, G = V.guild;
    const grp = new THREE.Group(); grp.name = 'guild';
    const front = paintRegion(view.paint.guild, L.x, L.y, L.w, L.h);
    const frontTex = K.texFromCanvas(front, true, false);
    // 窓（と提灯）は自分で光る
    const em = K.mkCanvas(front.width, front.height), eg = em.getContext('2d');
    eg.fillStyle = '#000'; eg.fillRect(0, 0, em.width, em.height);
    const cut = function (x, y, w, h) { eg.drawImage(front, x * PS, y * PS, w * PS, h * PS, x * PS, y * PS, w * PS, h * PS); };
    cut(W.x - L.x - 4, W.y - L.y - 4, W.w + 8, W.h + 8);
    for (const lx of [12, L.w - 18]) cut(lx, 4, 7, 9);
    const emTex = K.texFromCanvas(em, true, false);
    const frontMat = lam({ map: frontTex, emissive: 0xffffff, emissiveMap: emTex, emissiveIntensity: 0.95 });
    const sc = avgColor(front), side = new THREE.Color().setRGB(sc[0] * V.sideDarken, sc[1] * V.sideDarken, sc[2] * V.sideDarken, THREE.SRGBColorSpace);
    const box = new THREE.Mesh(new THREE.BoxGeometry(L.w, L.h, G.depth), boxMats(frontMat, side));
    box.position.set(0, L.h / 2, -G.depth / 2); grp.add(box);
    // 切妻屋根（三角柱）。ひさしを少し出す
    const roofGeo = prismGeo([[G.eave, L.h], [-G.depth / 2, L.h + G.roofH], [-G.depth - G.eave, L.h]], L.w + G.eave * 2, 'x');
    const roof = new THREE.Mesh(roofGeo, lam({ color: colorOf('#34233f'), side: THREE.DoubleSide, flatShading: true }));
    grp.add(roof);
    grp.userData = { w: L.w, h: L.h, depth: G.depth, roofH: G.roofH };
    grp.position.set(L.x + L.w / 2, 0, L.y + L.h);
    scene.add(grp); bld.guild = grp;
  }

  function buildSmith() {
    const L = view.layout.SMITH, F = view.layout.SMITH_FORGE, S = V.smith;
    const grp = new THREE.Group(); grp.name = 'smith';
    const front = paintRegion(view.paint.smith, L.x, L.y, L.w, L.h);
    const frontTex = K.texFromCanvas(front, true, false);
    const em = K.mkCanvas(front.width, front.height), eg = em.getContext('2d');   // 炉（橙）が自分で光る
    eg.fillStyle = '#000'; eg.fillRect(0, 0, em.width, em.height);
    eg.drawImage(front, (F.x - L.x) * PS, (F.y - L.y) * PS, F.w * PS, F.h * PS, (F.x - L.x) * PS, (F.y - L.y) * PS, F.w * PS, F.h * PS);
    const frontMat = lam({ map: frontTex, emissive: 0xffffff, emissiveMap: K.texFromCanvas(em, true, false), emissiveIntensity: 1.1 });
    const sc = avgColor(front), side = new THREE.Color().setRGB(sc[0] * V.sideDarken, sc[1] * V.sideDarken, sc[2] * V.sideDarken, THREE.SRGBColorSpace);
    const box = new THREE.Mesh(new THREE.BoxGeometry(L.w, L.h, S.depth), boxMats(frontMat, side));
    box.position.set(0, L.h / 2, -S.depth / 2); grp.add(box);
    // 片流れ屋根（手前が低く、奥が高い）
    const roofGeo = prismGeo([[S.eave, L.h], [S.eave, L.h + 5], [-S.depth - S.eave, L.h + S.roofRise + 5], [-S.depth - S.eave, L.h]], L.w + S.eave * 2, 'x');
    grp.add(new THREE.Mesh(roofGeo, lam({ color: colorOf('#2b2436'), side: THREE.DoubleSide, flatShading: true })));
    // 煙突（円柱）
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(S.chimneyR, S.chimneyR * 1.15, S.chimneyH, 10), lam({ color: colorOf('#2e2838') }));
    chim.position.set(19 - L.w / 2, L.h + S.roofRise * 0.55 + S.chimneyH / 2, -S.depth * 0.62); grp.add(chim);
    grp.userData = { w: L.w, h: L.h, depth: S.depth, chimneyX: grp.position.x + 19 - L.w / 2, chimneyTop: L.h + S.roofRise * 0.55 + S.chimneyH };
    grp.position.set(L.x + L.w / 2, 0, L.y + L.h);
    scene.add(grp); bld.smith = grp;
  }

  function buildGate() {
    const L = view.layout.GATE, G = V.gate;
    const grp = new THREE.Group(); grp.name = 'gate';
    const stone = lam({ color: colorOf('#3a2c48'), flatShading: true }), beamMat = lam({ color: colorOf('#463656'), flatShading: true });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(G.pillar, L.h, G.pillar), stone);
      p.position.set(sx * (L.w / 2 + G.pillar / 2), L.h / 2, -G.pillar / 2); grp.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(L.w + G.pillar * 2 + 4, G.beamH, G.pillar + 2), beamMat);
    beam.position.set(0, L.h + G.beamH / 2, -G.pillar / 2); grp.add(beam);
    // 奥の暗い穴（今の門の絵を貼る）
    const holeTex = K.texFromCanvas(paintRegion(view.paint.gate, L.x, view.Y(L.y), L.w, L.h), true, false);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h), new THREE.MeshBasicMaterial({ map: holeTex, color: 0xb0b0b0 }));
    hole.position.set(0, L.h / 2, -G.pillar + 2); grp.add(hole);
    grp.userData = { w: L.w, h: L.h };
    scene.add(grp); bld.gate = grp;
  }

  function buildCamp() {
    const L = view.layout.CAMP, F = V.campFire;
    const grp = new THREE.Group(); grp.name = 'camp';
    const wood = lam({ color: colorOf('#4a3424') });
    for (let i = 0; i < 3; i++) {   // 薪（細い円柱3本を交差）
      const log = new THREE.Mesh(new THREE.CylinderGeometry(F.logR, F.logR, F.logLen, 8), wood);
      log.rotation.z = Math.PI / 2; log.rotation.y = (i / 3) * Math.PI; log.position.y = F.logR; grp.add(log);
    }
    // 石のかこい
    const stones = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 4, 5), lam({ color: colorOf('#4a4060'), flatShading: true }), F.stones);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < F.stones; i++) {
      const a = (i / F.stones) * Math.PI * 2;
      p.set(Math.cos(a) * F.radius, 2, Math.sin(a) * F.radius); e.set(0, -a, 0); q.setFromEuler(e);
      m.compose(p, q, s1); stones.setMatrixAt(i, m);
    }
    grp.add(stones); stoneMesh = stones;
    // ベンチ
    const bench = new THREE.Mesh(new THREE.BoxGeometry(30, 5, 8), lam({ color: colorOf('#5a4030') }));
    bench.position.set(-37, 5, 19); grp.add(bench);
    for (const bx of [-48, -26]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 6), wood); leg.position.set(bx, 2.5, 19); grp.add(leg); }
    grp.position.set(L.x, 0, L.y);
    scene.add(grp); bld.camp = grp;
  }

  function buildTent() {
    const L = view.layout.TENT, T = V.tent;
    const grp = new THREE.Group(); grp.name = 'tent';
    const cloth = new THREE.Mesh(prismGeo([[-T.w / 2, 0], [T.w / 2, 0], [0, T.h]], T.d, 'z'), lam({ color: colorOf('#5e4632'), side: THREE.DoubleSide, flatShading: true }));
    grp.add(cloth);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(7, 17), new THREE.MeshBasicMaterial({ color: colorOf('#221730') }));
    door.position.set(0, 8.5, T.d / 2 + 0.2); grp.add(door);
    grp.userData = { w: T.w, d: T.d, h: T.h };
    scene.add(grp); bld.tent = grp;
  }

  function buildStraw() {
    const L = view.layout.STRAW;
    const grp = new THREE.Group(); grp.name = 'straw';
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 30, 8), lam({ color: colorOf('#4a3424') }));
    post.position.y = 15; grp.add(post);
    const tex = K.texFromCanvas(paintRegion(view.paint.straw, L.x - 10, L.y - 18, 20, 20), true, false);
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), lam({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide }));
    disc.position.set(0, 33, 1); disc.rotation.x = -Math.atan2(K.tiltSin, K.tiltCos); grp.add(disc);
    grp.position.set(L.x, 0, L.y + 24);
    scene.add(grp); bld.straw = grp;
  }

  function buildSapling() {
    const L = view.layout.SAPLING;
    const grp = new THREE.Group(); grp.name = 'sapling';
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.7, 16, 7), lam({ color: colorOf('#3e5540') }));
    trunk.position.y = 8; grp.add(trunk);
    const tex = K.texFromCanvas(paintRegion(view.paint.sapling, L.x - 11, L.y - 20, 22, 18), true, false);
    const mat = lam({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.75 });   // 葉は淡く光る
    for (let i = 0; i < 3; i++) {   // 光る紙の板3枚を交差
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(24, 20), mat);
      leaf.position.y = 22; leaf.rotation.y = (i / 3) * Math.PI; grp.add(leaf);
    }
    grp.position.set(L.x, 0, L.y + 12);
    scene.add(grp); bld.sapling = grp;
  }

  // 街灯・樽・笹の株（同じ物はまとめ描き）
  function buildSmallProps() {
    const lamps = view.layout.LAMPS;
    lampPole = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 28, 2), lam({ color: colorOf('#3a2c48') }), lamps.length);
    lampGlass = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 7, 6), new THREE.MeshBasicMaterial({ color: colorOf('#ffb868') }), lamps.length);
    scene.add(lampPole); scene.add(lampGlass);
    barrelMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(5.2, 4.8, 12, 10), lam({ color: colorOf('#5e4632') }), 1);
    scene.add(barrelMesh);
    const clumps = view.layout.SASA;
    const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0);
    const tex = K.texFromCanvas(paintRegion(function (ctx) { view.paint.sasa(ctx, 0, 0); }, -7, -17, 14, 18), true, false);
    sasaMesh = new THREE.InstancedMesh(g, lam({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }), clumps.length);
    scene.add(sasaMesh);
  }

  // ============================================================
  //  本のページ（紙の繊維の質感・右と下のふちの紙の厚み・左の綴じ目の影を、1枚の絵にして1枚の板に貼る）
  // ============================================================
  function pageSkin() {
    const app = document.getElementById('app'), s = app && app.getAttribute('data-skin');
    return s === 'a' || s === 'b' ? s : (BK.skin === 'a' ? 'a' : 'b');
  }
  function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123; return s - Math.floor(s); }
  // 紙の繊維：細かい粒＋短い筋＋大きなむら。ページの絵に1度だけ描く（村の地面の絵と同じ。画面の縦横比が変わったときだけ描き直す）
  function paintPage(pw, ph) {
    const k = PG.thickStep, th = k * 3, sk = pageSkin(), base = sk === 'a' ? PG.colorA : PG.colorB, edges = sk === 'a' ? PG.edgesA : PG.edgesB;
    const c = K.mkCanvas(Math.round((pw + th) * PS), Math.round((ph + th) * PS)), g = c.getContext('2d');
    g.imageSmoothingEnabled = false; g.scale(PS, PS);
    // 紙の厚み：下の板ほど右下へずれて暗い（先に奥の板から描く）
    for (let i = 3; i >= 1; i--) { g.fillStyle = edges[i - 1]; g.fillRect(i * k, i * k, pw, ph); }
    // 紙の面
    g.fillStyle = base; g.fillRect(0, 0, pw, ph);
    const dark = sk === 'a';
    for (let i = 0; i < 9; i++) {   // 大きなむら（光が当たる／当たらない）
      const x = hash2(i, 3) * pw, y = hash2(i, 7) * ph, r = 70 + hash2(i, 11) * 110;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, dark ? 'rgba(120,96,150,0.16)' : 'rgba(255,248,226,0.30)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, pw, ph);
    }
    for (let i = 0; i < Math.round(pw * ph / 55); i++) {   // 粒
      const x = hash2(i, 1.3) * pw, y = hash2(i, 5.7) * ph, h = hash2(i, 9.1);
      g.fillStyle = h < 0.5 ? (dark ? 'rgba(10,6,18,0.20)' : 'rgba(110,84,52,0.13)') : (dark ? 'rgba(170,150,205,0.10)' : 'rgba(255,252,238,0.35)');
      g.fillRect(x, y, 0.8 + h, 0.8 + h * 0.6);
    }
    g.lineWidth = 0.5;
    for (let i = 0; i < Math.round(pw * ph / 700); i++) {   // 短い繊維の筋
      const x = hash2(i, 2.2) * pw, y = hash2(i, 4.4) * ph, a = hash2(i, 6.6) * Math.PI, l = 3 + hash2(i, 8.8) * 7;
      g.strokeStyle = hash2(i, 12.1) < 0.5 ? (dark ? 'rgba(14,8,24,0.28)' : 'rgba(120,92,58,0.22)') : (dark ? 'rgba(180,160,215,0.14)' : 'rgba(255,255,244,0.5)');
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.5); g.stroke();
    }
    // 左のふち：綴じ目の影（左が濃い）
    const bg = g.createLinearGradient(0, 0, PG.bindPx, 0);
    const sh = dark ? '0,0,0' : '34,18,6', ba = PG.bindAlpha;
    bg.addColorStop(0, 'rgba(' + sh + ',' + ba + ')'); bg.addColorStop(0.45, 'rgba(' + sh + ',' + (ba * 0.42).toFixed(3) + ')'); bg.addColorStop(1, 'rgba(' + sh + ',0)');
    g.fillStyle = bg; g.fillRect(0, 0, PG.bindPx, ph);
    // ふちの細い線（紙の端がくっきり見える）
    g.strokeStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(60,40,22,0.35)'; g.lineWidth = 0.6; g.strokeRect(0.3, 0.3, pw - 0.6, ph - 0.6);
    return c;
  }
  // ページの板を置く（地面の絵と同じく、縦の長さ logH が変わったときに描き直す）
  function placePage() {
    const m = PG.margin, th = PG.thickStep * 3, pw = 320 + 2 * m, ph = logH + 2 * m;
    const cv = paintPage(pw, ph);
    if (!pageTex) pageTex = K.texFromCanvas(cv, true, false);
    else { pageTex.dispose(); pageTex.image = cv; pageTex.needsUpdate = true; }
    pageR.x0 = -m; pageR.z0 = -m; pageR.x1 = -m + pw + th; pageR.z1 = -m + ph + th;
    if (pageMesh) fillPageGeo(pageMesh.geometry);
  }
  // ページの板：村の地面（0〜320 × 0〜logH）の外側だけの4枚の長方形（上・下・左・右）。内側は地面が覆うので描かない（画素を減らす）。地面の下に 0.5 だけもぐらせて継ぎ目を隠す
  function mkPageGeo() {
    const g = new THREE.BufferGeometry(), n = 24;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const nm = new Float32Array(n * 3); for (let i = 0; i < n; i++) nm[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nm, 3));
    return g;
  }
  function fillPageGeo(g) {
    const P = g.attributes.position.array, U = g.attributes.uv.array, e = 0.5;
    const x0 = pageR.x0, z0 = pageR.z0, x1 = pageR.x1, z1 = pageR.z1, W = x1 - x0, H = z1 - z0;
    const R = [x0, z0, x1, e,   x0, logH - e, x1, z1,   x0, e, e, logH - e,   320 - e, e, x1, logH - e];
    let v = 0;
    for (let q = 0; q < 4; q++) {
      const xa = R[q * 4], za = R[q * 4 + 1], xb = R[q * 4 + 2], zb = R[q * 4 + 3];
      const xs = [xa, xa, xb, xa, xb, xb], zs = [za, zb, zb, za, zb, za];   // 上から見て反時計回り（面が上を向く）
      for (let k = 0; k < 6; k++, v++) {
        P[v * 3] = xs[k]; P[v * 3 + 1] = PAGE_Y; P[v * 3 + 2] = zs[k];
        U[v * 2] = (xs[k] - x0) / W; U[v * 2 + 1] = 1 - (zs[k] - z0) / H;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true;
  }

  // GAP（画面の縦の長さ）で位置が変わる物と、地面の絵を置き直す（画面の縦横比が変わったときだけ）
  function applyLayout() {
    const gap = view.GAP;
    const Y = view.Y, lay = view.layout;
    // 地面
    const gcv = paintRegion(function (ctx) { view.paint.terrain(ctx, 320, logH); }, 0, 0, 320, logH, GPS);
    if (!groundTex) groundTex = K.texFromCanvas(gcv, true, false);
    else { groundTex.dispose(); groundTex.image = gcv; groundTex.needsUpdate = true; }
    if (groundMesh) { groundMesh.scale.set(320, logH, 1); groundMesh.position.set(160, 0, logH / 2); }
    placePage();
    // 位置が GAP で変わる物
    const g = lay.GATE;
    bld.gate.position.set(g.x + g.w / 2, 0, Y(g.y) + g.h);
    bld.tent.position.set(lay.TENT.x, 0, Y(lay.TENT.y) + 8);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < lay.LAMPS.length; i++) {
      const l = lay.LAMPS[i], z = Y(l.y);
      p.set(l.x + 1, 14, z); m.compose(p, q, s1); lampPole.setMatrixAt(i, m);
      p.set(l.x + 1, 20.5, z); m.compose(p, q, s1); lampGlass.setMatrixAt(i, m);
    }
    lampPole.instanceMatrix.needsUpdate = true; lampGlass.instanceMatrix.needsUpdate = true;
    const gl = lay.GUILD;
    p.set(gl.x + 11, 6, gl.y + gl.h + 8); m.compose(p, q, s1); barrelMesh.setMatrixAt(0, m); barrelMesh.instanceMatrix.needsUpdate = true;
    const sm = new THREE.Matrix4();
    for (let i = 0; i < lay.SASA.length; i++) {
      const c = lay.SASA[i], h = c.tall ? 18 : 11;
      p.set(c.x, 0, Y(c.y)); sm.compose(p, q, new THREE.Vector3(14, h, 1)); sasaMesh.setMatrixAt(i, sm);
    }
    sasaMesh.instanceMatrix.needsUpdate = true;
    curGap = gap;
  }

  // 静的な影（建物・小物。GAP が変わったときだけ書く）
  function writeStaticShadows() {
    const lay = view.layout, Y = view.Y;
    shadowN = 0;
    const G = lay.GUILD, S = lay.SMITH, T = V.tent, g = lay.GATE;
    addShadowAt(G.x + G.w / 2, G.y + G.h - V.guild.depth / 2 + 4, G.w + 30, V.guild.depth + 34);
    addShadowAt(S.x + S.w / 2, S.y + S.h - V.smith.depth / 2 + 4, S.w + 26, V.smith.depth + 30);
    addShadowAt(lay.TENT.x, Y(lay.TENT.y) + 8, T.w + 20, T.d + 24);
    addShadowAt(g.x + g.w / 2, Y(g.y) + g.h - 6, g.w + 40, 34);
    addShadowAt(lay.STRAW.x, lay.STRAW.y + 24, 22, 10);
    addShadowAt(lay.SAPLING.x, lay.SAPLING.y + 12, 20, 9);
    addShadowAt(G.x + 11, G.y + G.h + 8, 16, 9);
    for (const l of lay.LAMPS) addShadowAt(l.x + 1, Y(l.y), 10, 6);
    addShadowAt(lay.CAMP.x - 37, lay.CAMP.y + 19, 38, 14);
    shadowMesh.userData.staticN = shadowN;
  }

  // ============================================================
  //  シーンを作る（村に初めて入ったとき一度だけ）
  // ============================================================
  function build() {
    renderer = K.renderer; canvas = K.canvas;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(V.bg);
    scene.fog = new THREE.Fog(V.fogColor, 900, 1800);
    camera = new THREE.PerspectiveCamera(V.fovDeg, 1, 50, 4000);
    sinP = Math.sin(V.pitchDeg * DEG); cosP = Math.cos(V.pitchDeg * DEG);

    // 光：点光源はたき火とかじ屋の2つだけ。ほかは自分で光る材質と光の板
    ambient = new THREE.AmbientLight(V.ambient.color, V.ambient.intensity); scene.add(ambient);
    moon = new THREE.DirectionalLight(V.moon.color, V.moon.intensity); moon.position.set(-0.4, 1, 0.5); scene.add(moon);
    const cl = V.camp; campLight = new THREE.PointLight(cl.color, cl.intensity, cl.distance, cl.decay); scene.add(campLight);
    const fl = V.forge; forgeLight = new THREE.PointLight(fl.color, fl.intensity, fl.distance, fl.decay); scene.add(forgeLight);
    const L = view.layout;
    campLight.position.set(L.CAMP.x, cl.height, L.CAMP.y + 4);
    forgeLight.position.set(L.SMITH_FORGE.x + L.SMITH_FORGE.w / 2, 26, L.SMITH.y + L.SMITH.h + 14);

    // 地面（今の絵の地面・石畳・崖の上のふちだけ）と、その外の暗い地面（遠くは霧で消える）
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), lam({ color: colorOf('#1c1428') }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(160, -0.6, 300); scene.add(outer);
    groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), null);
    groundMesh.rotation.x = -Math.PI / 2;
    scene.add(groundMesh);
    // 本のページ：地面のすぐ下、村より一回り大きい紙。外側は上の暗い地面と霧のまま
    pageMesh = new THREE.Mesh(mkPageGeo(), null);
    pageMesh.frustumCulled = false;                 // 大きさが変わる（画面の縦横比）ので、見える範囲の判定は使わない
    scene.add(pageMesh);

    // 影・光の板
    const flatGeo = new THREE.PlaneGeometry(1, 1);
    shadowMesh = new THREE.InstancedMesh(flatGeo, new THREE.MeshBasicMaterial({ map: K.texFromCanvas(K.paintShadow(), true, false), transparent: true, depthWrite: false, color: 0x000000 }), 24);
    shadowMesh.userData.max = 24; shadowMesh.frustumCulled = false; shadowMesh.count = 0; shadowMesh.renderOrder = 1;
    scene.add(shadowMesh);
    const glowTex = K.texFromCanvas(K.paintGlow(), true, false), poolTex = K.texFromCanvas(K.paintPool(), true, false);
    gb = mkGlow(new THREE.PlaneGeometry(1, 1), glowTex, 90);
    gf = mkGlow(flatGeo, poolTex, 20);

    // 建物と小物
    buildGuild(); buildSmith(); buildGate(); buildCamp(); buildTent(); buildStraw(); buildSapling(); buildSmallProps();

    // 地面の材質（絵は applyLayout で貼る）
    applyLayout();
    groundMesh.material = lam({ map: groundTex, emissive: 0xffffff, emissiveMap: groundTex, emissiveIntensity: V.groundGlow });   // 地面の絵は少し自分で光る
    pageMesh.material = lam({ map: pageTex, color: colorOf(pageSkin() === 'a' ? PG.tintA : PG.tintB), emissive: 0xffffff, emissiveMap: pageTex, emissiveIntensity: PG.glow, alphaTest: 0.5 });   // ページも少し自分で光る（夜の光でもふちが見える）。厚みの外の透明な角は切り抜く
    writeStaticShadows();

    // 紙人形（主人公・受付・村人4・たき火のなかま5）
    const mk = function (key, name) { const s = K.makeSet(key, name, 1, V.peopleGlow, false, true, scene, false); people.push(s); return s; };
    pSet = mk('v_player', 'tomoshibi');
    mSet = mk('v_meimei', 'meimei');
    for (let i = 0; i < view.npcs.length; i++) npcSets.push(mk('v_npc' + i, view.npcs[i].key));
    for (let i = 0; i < view.seatCount; i++) seatSets.push(mk('v_seat' + i, ''));
    pst.s = K.newPaperState();
    popProps = [lampPole, lampGlass, barrelMesh, sasaMesh];
  }

  // ============================================================
  //  入る・出る・大きさ・カメラ
  // ============================================================
  Village3D.available = function () { return !failed && !!R3 && !!THREE && R3.available(); };

  Village3D.enter = function (v) {
    if (!Village3D.available()) return false;
    const cv = document.getElementById('world3d');
    if (!cv) return false;
    cv.style.display = 'block';                     // 先に表示（大きさを測れるように）
    if (!R3.init(cv)) { cv.style.display = 'none'; failed = true; return false; }
    K = R3.kit; view = v;
    if (!built) {
      try { build(); built = true; }
      catch (e) { try { console.warn('Village3D build failed', e); } catch (e2) {} failed = true; cv.style.display = 'none'; return false; }
    }
    endPop();                                       // 前の起き上がりが途中なら立った状態に戻す
    active = true;
    return true;
  };

  Village3D.leave = function () {
    if (!active) return;
    endPop();
    active = false;
    if (K) K.setCanvasVisible(false);
  };

  // 村全体が画面に収まる距離を求める（見下ろし角 pitchDeg・視野角 fovDeg 固定、注視点は村の中心）
  function fit() {
    const aspect = cssW / cssH, tv = Math.tan(V.fovDeg * DEG / 2), th = tv * aspect;
    const cx = (pageR.x0 + pageR.x1) / 2, cz = (pageR.z0 + pageR.z1) / 2;   // ページ全体（右と下の厚みを含む）が収まるように
    const pts = [[pageR.x0, 0, pageR.z0], [pageR.x1, 0, pageR.z0], [pageR.x0, 0, pageR.z1], [pageR.x1, 0, pageR.z1]];
    const ok = function (d) {
      const px = cx, py = sinP * d, pz = cz + cosP * d;
      for (let i = 0; i < pts.length; i++) {
        const rx = pts[i][0] - px, ry = pts[i][1] - py, rz = pts[i][2] - pz;
        const dep = -sinP * ry - cosP * rz;                  // 画面の奥行き（カメラの向き (0,-sinP,-cosP) への距離）
        const up = cosP * ry - sinP * rz;                    // 画面の上向き
        if (dep <= 1) return false;
        if (Math.abs(rx / (dep * th)) > V.fitMargin || Math.abs(up / (dep * tv)) > V.fitMargin) return false;
      }
      return true;
    };
    let lo = 50, hi = 6000;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
    camDist = hi;
    camera.aspect = aspect;
    camera.position.set(cx, sinP * camDist, cz + cosP * camDist);
    camera.lookAt(cx, 0, cz);
    camera.near = camDist * 0.2; camera.far = camDist * 3;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    // 霧：村の外の暗い地面だけ遠くへ消える
    const far = camDist + ((pageR.z1 - pageR.z0) / 2) * cosP + 40;
    scene.fog.near = far; scene.fog.far = far + 520;
  }

  Village3D.resize = function (w, h, lw, lh, fw, fh) {
    if (!built || !renderer) return;
    cssW = Math.max(1, w); cssH = Math.max(1, h); logW = lw; fxW = fw || w; fxH = fh || h;
    const gapChanged = lh !== logH || curGap !== view.GAP;
    logH = lh;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(cssW, cssH, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    if (gapChanged) { applyLayout(); writeStaticShadows(); }
    fit();
  };

  // 村の位置 (x, z, 高さ elev) → #fx の画面座標。戻り値は使い回す
  const _pt = { sx: 0, sy: 0 };
  Village3D.project = function (x, y, elev) {
    if (!built) { _pt.sx = 0; _pt.sy = 0; return _pt; }
    const Vm = camera.matrixWorldInverse.elements, Pm = camera.projectionMatrix.elements;
    const vx = Vm[0] * x + Vm[4] * elev + Vm[8] * y + Vm[12];
    const vy = Vm[1] * x + Vm[5] * elev + Vm[9] * y + Vm[13];
    const vz = Vm[2] * x + Vm[6] * elev + Vm[10] * y + Vm[14];
    const w = -vz || 1;
    _pt.sx = (Pm[0] * vx / w * 0.5 + 0.5) * fxW;
    _pt.sy = (1 - (Pm[5] * vy / w * 0.5 + 0.5)) * fxH;
    return _pt;
  };

  // ============================================================
  //  起き上がり（表紙→村、結果→村のときだけ ui.js が呼ぶ。要件定義_本のUI §4-1）
  //  建物は寝た状態（正面の足元を軸に rotation.x = -90°）から 0° へ。奥の建物から順に、少し行き過ぎて戻る。
  //  街灯・樽・笹・たき火は高さの倍率 0→1。人は板の寝かせ角 90°→いつもの角度。終わったら毎フレームの書き直しをやめる
  // ============================================================
  function easeOutBack(u) { const c1 = 1.70158, w = u - 1; return 1 + (c1 + 1) * w * w * w + c1 * w * w; }
  function clamp01(u) { return u < 0 ? 0 : (u > 1 ? 1 : u); }
  function applyPop(el) {
    const T = BK.popSec, n = pop.list.length;
    const stag = Math.min(BK.popStagger, n > 1 ? (T * 0.3) / (n - 1) : 0);   // 全体が popSec に収まるよう、ずれは合わせて 3 割まで（1つあたりの時間を確保する）
    const dur = T - stag * (n - 1);
    let mn = 0, mx = -1e9;
    for (let i = 0; i < n; i++) {
      const e = easeOutBack(clamp01((el - i * stag) / dur)), it = pop.list[i];
      if (it.rot) {
        const a = -(Math.PI / 2) * (1 - e);
        it.g.rotation.x = a;
        const d = a / DEG; if (d < mn) mn = d; if (d > mx) mx = d;
      } else it.g.scale.y = Math.max(0.001, e);
    }
    const ep = easeOutBack(clamp01((el - stag * (n - 1) * 0.5) / dur));
    for (let i = 0; i < popProps.length; i++) popProps[i].scale.y = Math.max(0.001, ep);
    const pe = easeOutBack(clamp01((el - BK.popPeopleDelay) / (T - BK.popPeopleDelay)));
    const l0 = C.paper.leanDeg * DEG;
    pop.lean = l0 + (Math.PI / 2 - l0) * (1 - pe);
    glowK = clamp01((el - 0.1) / (T * 0.7));
    pop.minRotX = mn; pop.maxRotX = mx > -1e8 ? mx : 0;
  }
  function endPop() {
    if (!pop.running && pop.lean === null) return;
    for (let i = 0; i < pop.list.length; i++) { const it = pop.list[i]; if (it.rot) it.g.rotation.x = 0; else it.g.scale.y = 1; }
    if (popProps) for (let i = 0; i < popProps.length; i++) popProps[i].scale.y = 1;
    pop.running = false; pop.frozen = false; pop.lean = null; pop.minRotX = 0; pop.maxRotX = 0;
    glowK = 1;
  }
  function stepPop() {
    const el = pop.frozen ? pop.tFrozen : (performance.now() - pop.t0) / 1000;
    if (el >= BK.popSec && !pop.frozen) endPop(); else applyPop(el);
  }
  Village3D.popUp = function () {
    if (!built || !active) return false;
    if (!window.Book || Book.mode() !== 'full') return false;   // 演出を切る条件・動きを減らす設定では、最初から立っている
    endPop();
    const names = ['gate', 'guild', 'smith', 'camp', 'tent', 'straw', 'sapling'], order = [];
    for (let i = 0; i < names.length; i++) { const g = bld[names[i]]; if (g) order.push({ g: g, rot: names[i] !== 'camp', z: g.position.z }); }
    order.sort(function (a, b) { return a.z - b.z; });          // 奥（画面の上）から順に
    pop.list = order;
    pop.running = true; pop.frozen = false; pop.t0 = performance.now() + (BK.popAfter || 0) * 1000;   // popAfter 秒たってから起き上がり始める（それまでは寝たまま）
    applyPop(0);                                                // 最初の1コマから寝た状態にする
    return true;
  };
  // 人の板を、いつもの角度（K.addPaper）でなく指定の寝かせ角 L で書き直す（Render3D の writePaper と同じ式。起き上がりの間だけ）
  function writeLean(s, i, x, y, elev, w, h, wf, roll, L) {
    const a = s.mesh.instanceMatrix.array, o = i * 16, sinL = Math.sin(L), cosL = Math.cos(L);
    const bw = w * (1 + 2 * s.padX) * wf, bh = h * (1 + 2 * s.padY), sh = h * s.padY;
    let cr = 1, sr = 0;
    if (roll !== 0) { cr = Math.cos(roll); sr = Math.sin(roll); }
    const yx = -sr * cosL, yy = cr * cosL, yz = -sinL;
    a[o] = bw * cr; a[o + 1] = bw * sr; a[o + 2] = 0; a[o + 3] = 0;
    a[o + 4] = bh * yx; a[o + 5] = bh * yy; a[o + 6] = bh * yz; a[o + 7] = 0;
    a[o + 8] = -sr * sinL; a[o + 9] = cr * sinL; a[o + 10] = cosL; a[o + 11] = 0;
    a[o + 12] = x - yx * sh; a[o + 13] = elev - yy * sh; a[o + 14] = y - yz * sh; a[o + 15] = 1;
  }

  // ============================================================
  //  毎フレームの描画（ここでは new しない：位置と光だけ書き換える）
  // ============================================================
  function putPaper(s, src, smooth, x, z, elev, size, flip, wf, roll, back) {
    s.n = 0;
    K.applySprite(s, src, smooth);
    const pi = K.addPaper(s, x, z, elev, size, size, flip, 1, wf, roll, back);
    if (pop.lean !== null && pi >= 0) writeLean(s, pi, x, z, elev, size, size, wf, roll, pop.lean);   // 起き上がりの途中だけ
    s.mesh.count = s.n; s.mesh.visible = s.n > 0;
    s.mesh.instanceMatrix.needsUpdate = true; s.flip.needsUpdate = true; s.fade.needsUpdate = true; s.back.needsUpdate = true;
  }
  function illu(name) { return !!(window.Sprites && Sprites.isIllustrated && Sprites.isIllustrated(name)); }
  function hexRgb01(hex) { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

  Village3D.draw = function (v, t) {
    if (!active || !built) return;
    K.tick();
    if (pop.running) stepPop();
    const lay = v.layout, P = v.P, PW = K.PA.shadowWide;
    const npcSize = BALANCE.characterDisplay.villageNpcSize, playerSize = BALANCE.characterDisplay.villagePlayerSize;

    // 点光源のゆらぎ
    const campF = 1 - V.camp.flicker + V.camp.flicker * Math.sin(t * 5.3), forgeF = 1 - V.forge.flicker + V.forge.flicker * Math.sin(t * 6.1);
    campLight.intensity = V.camp.intensity * campF * glowK; forgeLight.intensity = V.forge.intensity * forgeF * glowK;

    // ---- 人（紙人形）と足元の影 ----
    shadowN = shadowMesh.userData.staticN;
    // 主人公：足元は村の位置より16下（今の絵の置き方）
    const footZ = P.y + 16, st = pst.s;
    const want = P.facing.x < -K.PA.facingDead ? 1 : (P.facing.x > K.PA.facingDead ? 0 : K.paperIntent(st));
    K.paperAnim(st, want, v.walking, true);
    const out = K.out;
    addShadowAt(P.x, footZ, playerSize * 0.28 * 2 * PW, playerSize * 0.28 * 2);
    putPaper(pSet, K.sprite('tomoshibi'), illu('tomoshibi'), P.x, footZ, v.walking ? 0 : -v.bob(t, 0.6), playerSize, out.flip, out.wf, out.roll, out.back);
    // 受付メイメイ（ギルドの窓の前）
    const gl = lay.GUILD, gw = lay.GUILD_WIN, frontZ = gl.y + gl.h;
    const mx = gw.x + gw.w / 2;
    putPaper(mSet, K.sprite('meimei'), illu('meimei'), mx, frontZ + 10, frontZ - (gw.y + gw.h + 1) - v.bob(t, 0), npcSize, 0, 1, 0, 0);   // 板は後ろへ12度傾くので、壁にめり込まないよう壁の少し手前
    // 村人
    for (let i = 0; i < v.npcs.length; i++) {
      const n = v.npcs[i];
      addShadowAt(n.x, n.y, npcSize * 0.28 * 2 * PW, npcSize * 0.28 * 2);
      putPaper(npcSets[i], K.sprite(n.key), illu(n.key), n.x, n.y, -v.bob(t, n.phase), npcSize, 0, 1, 0, 0);
    }
    // たき火のなかま
    const campSize = Math.min(38, npcSize), seats = v.campSeats;
    for (let i = 0; i < seatSets.length; i++) {
      const s = seatSets[i], m = seats[i], pos = window.CAMP_SEATS[i];
      if (!m || !pos) { s.mesh.count = 0; s.mesh.visible = false; continue; }
      addShadowAt(pos.x, pos.y + 1, campSize * 0.28 * 2 * PW, campSize * 0.28 * 2);
      putPaper(s, v.seatSprite(i), illu(m.charId), pos.x, pos.y, -v.bob(t, pos.phase || 0), campSize, 0, 1, 0, 0);
    }
    shadowMesh.count = shadowN; shadowMesh.visible = shadowN > 0; shadowMesh.instanceMatrix.needsUpdate = true;

    // ---- 光の板 ----
    gbN = 0; gfN = 0;
    const CP = lay.CAMP, SF = lay.SMITH_FORGE, SM = lay.SMITH;
    // たき火の火（ゆらぐ）
    addBill(CP.x, CP.y, 16, 36 + 4 * Math.sin(t * 9), 0.7, 0.35, 0.12);
    addBill(CP.x + Math.sin(t * 7) * 1.5, CP.y, 26, 24 + 3 * Math.sin(t * 11 + 1), 0.8, 0.5, 0.22);
    addBill(CP.x + Math.sin(t * 5 + 2) * 2, CP.y, 36, 13 + 2 * Math.sin(t * 13), 0.8, 0.66, 0.42);
    addPool(CP.x, CP.y + 6, 230, 0.26 * campF, 0.15 * campF, 0.06 * campF);
    // かじ屋の炉・ギルドの窓と提灯
    addBill(SF.x + SF.w / 2, SM.y + SM.h + 2, SF.h * 0.5, 78, 0.9 * forgeF, 0.42 * forgeF, 0.16 * forgeF);
    addPool(SF.x + SF.w / 2, SM.y + SM.h + 22, 130, 0.30 * forgeF, 0.12 * forgeF, 0.04 * forgeF);
    addBill(mx, frontZ + 3, frontZ - (gw.y + gw.h / 2), 110, 0.55, 0.36, 0.16);
    addPool(mx, frontZ + 26, 120, 0.2, 0.12, 0.05);
    for (const lx of [gl.x + 12, gl.x + gl.w - 18]) addBill(lx + 3, frontZ + 3, gl.h - 8, 34, 0.6 * (0.9 + 0.1 * Math.sin(t * 4)), 0.36, 0.16);
    // 街灯
    for (let i = 0; i < lay.LAMPS.length; i++) {
      const l = lay.LAMPS[i], z = v.Y(l.y), f = 0.9 + 0.1 * Math.sin(t * 3.7 + i * 2);
      addBill(l.x + 1, z, 20.5, 46, 0.62 * f, 0.4 * f, 0.2 * f);
      addPool(l.x + 1, z + 4, 120, 0.15 * f, 0.1 * f, 0.045 * f);
    }
    // 主人公のランタン（光の板）
    const pf = 0.9 + 0.1 * Math.sin(t * 9);
    addPool(P.x, footZ - 6, V.pool.radius * 2, V.pool.rgb[0] * pf, V.pool.rgb[1] * pf, V.pool.rgb[2] * pf);
    // 淵の門：紫のもや
    const gt = lay.GATE, gz = bld.gate.position.z, gdots = lay.GATE_DOTS;
    for (let i = 0; i < gdots.length; i++) {
      const d = gdots[i], rgb = hexRgb01(d.c), dx = Math.sin(t * 0.6 + i * 1.4) * 2, dy = Math.cos(t * 0.5 + i) * 2;
      addBill(d.x + dx, gz - V.gate.pillar + 3, gt.h - (d.y - gt.y) + dy, 26, rgb[0] * 0.8, rgb[1] * 0.8, rgb[2] * 0.8);
    }
    addPool(160, gz - 4, 190, 0.1 * (0.9 + 0.1 * Math.sin(t * 2.2)), 0.06, 0.2);
    // 若木のやわらかい光
    const sp = lay.SAPLING, sf = 0.85 + 0.15 * Math.sin(t * 1.6);
    addBill(sp.x, sp.y + 12, 24, 46, 0.2 * sf, 0.4 * sf, 0.18 * sf);
    addPool(sp.x, sp.y + 14, 80, 0.05 * sf, 0.12 * sf, 0.05 * sf);
    // ほたる・火の粉
    const ff = v.fireflies;
    for (let i = 0; i < ff.length; i++) addBill(ff[i].x, ff[i].y, 14 + Math.sin(t * 0.9 + ff[i].phase) * 4, 7, 0.78, 0.9, 0.55);
    const em = v.embers;
    for (let i = 0; i < em.length; i++) {
      const e = em[i]; if (!e.active) continue;
      const a = Math.max(0, e.life / e.maxLife);
      addBill(e.x, CP.y, CP.y - e.y + 4, 6, 1 * a, 0.77 * a, 0.42 * a);
    }
    // かじ屋の煙突の火の粉
    addBill(bld.smith.userData.chimneyX, SM.y + SM.h - V.smith.depth * 0.62, bld.smith.userData.chimneyTop + 6 + Math.sin(t * 3) * 2, 12, 0.7, 0.4, 0.16);

    gb.count = gbN; gb.visible = gbN > 0; gb.instanceMatrix.needsUpdate = true; gb.instanceColor.needsUpdate = true;
    gf.count = gfN; gf.visible = gfN > 0; gf.instanceMatrix.needsUpdate = true; gf.instanceColor.needsUpdate = true;

    renderer.render(scene, camera);
  };

  // テスト用：村の3Dの中身を数える（読むだけ）
  Village3D.dbg = {
    info: function () {
      if (!built) return { active: false, built: false, meshes: 0, lights: 0, textures: 0, geometries: 0 };
      let meshes = 0, lights = 0;
      scene.traverse(function (o) { if (o.isMesh) meshes++; if (o.isPointLight) lights++; });
      const mem = renderer.info.memory;
      return { active, built, meshes, lights, textures: mem.textures, geometries: mem.geometries, drawCalls: renderer.info.render.calls, camDist, buildings: Object.keys(bld), page: !!pageMesh && !!pageMesh.material && pageMesh.visible };
    },
    // 起き上がりの状態：建物の rotation.x の一番低い／高い値（度）
    pop: function () { return { running: pop.running, minRotX: pop.minRotX, maxRotX: pop.maxRotX }; },
    freezePop: function (sec) { if (!pop.running) return false; pop.frozen = true; pop.tFrozen = sec; return true; },   // 写真用：指定の秒数の姿で止める
    releasePop: function () { if (!pop.running) return; pop.t0 = performance.now() - pop.tFrozen * 1000; pop.frozen = false; },
    // ページ全体の四隅の画面座標（CSS px。厚みを含む）
    pageRect: function () {
      if (!built) return null;
      const xs = [pageR.x0, pageR.x1], zs = [pageR.z0, pageR.z1], pts = [];
      let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const q = Village3D.project(xs[i], zs[j], 0); pts.push([q.sx, q.sy]);
        l = Math.min(l, q.sx); r = Math.max(r, q.sx); t = Math.min(t, q.sy); b = Math.max(b, q.sy);
      }
      return { left: l, top: t, right: r, bottom: b, corners: pts, w: fxW, h: fxH };
    },
    buildings: function () { return bld; },
    parts: function () { return { scene, camera, ambient, moon, campLight, forgeLight, groundMesh, renderer }; },   // 明るさの調整・確認用
  };
})();
