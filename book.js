// ササノアビス モックアップ - 本のUI：ページめくり（飛び出す絵本・第2段）
// 要件定義_本のUI_2026-10-24.md §3。window.Book を登録する。
// 考え方：切り替えの瞬間に「今の画面」を写し取って1枚の紙に貼る。画面の切り替え（switchFn）はその場で一瞬で済ませ、
// その上で紙が左のふちを軸にめくれて、下から新しい画面が見える。紙は指を受けない（新しい画面はすぐ操作できる）。
// 紙の要素・写し取り用のキャンバスは最初に1つだけ作って使い回す（毎回作らない）。数値は data.js の BOOK。

(function () {
  'use strict';

  const B = window.BOOK;
  const Book = {};
  window.Book = Book;

  let root = null, shade = null, leaf = null, front = null, canvas = null, ctx = null;
  let cloneHost = null, fshade = null, back = null, backText = null;
  let anim = null, timer = 0, busy = false;
  const extra = [];                                  // 紙といっしょに動かす影のアニメーション（使い回す配列）
  const st = { turning: false, kind: '', backTitle: '', count: 0, playAt: 0, lastMs: -1 };   // lastMs＝めくり始め（play）から片付けるまでの時間（テスト用）

  // ---------- 演出を切る条件（3-5） ----------
  // 'off'＝めくらない（switchFn だけ）／'reduced'＝動きを減らす設定（回らずに透明になって消える）／'full'＝めくる
  Book.mode = function () {
    if (window.SASA_NO_ANIM === true) return 'off';
    try {
      const q = new URLSearchParams(location.search);
      if (q.get('anim') === '0' || q.get('auto') === '1' || q.get('stress') === '1') return 'off';
    } catch (e) {}
    try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced'; } catch (e) {}
    return 'full';
  };

  // ---------- 紙の部品（最初に1回だけ作る） ----------
  function div(cls) { const d = document.createElement('div'); d.className = cls; return d; }

  function ensureDom() {
    if (root) return;
    const app = document.getElementById('app');
    root = div('book-turn'); root.id = 'bookTurn'; root.setAttribute('aria-hidden', 'true');
    shade = div('book-shade');                                   // 下の新しい画面に落とす紙の影（左が濃い）
    const m = B.shadowMax;
    shade.style.background = 'linear-gradient(90deg, rgba(0,0,0,' + m + ') 0, rgba(0,0,0,' + (m * 0.55).toFixed(3) + ') 45%, rgba(0,0,0,0) 85%)';
    leaf = div('book-leaf');
    front = div('book-face book-front');                         // 表＝写し取った今の画面（キャンバス）＋複製した #menu
    canvas = document.createElement('canvas'); canvas.className = 'book-snap';
    ctx = canvas.getContext('2d');
    cloneHost = div('book-clone');
    fshade = div('book-fshade');                                 // めくれるほど表が暗くなる
    front.appendChild(canvas); front.appendChild(cloneHost); front.appendChild(fshade);
    back = div('book-face book-back');                           // 裏＝紙の裏（紙の色＋繊維）。章の文字が入る
    backText = div('book-back-title');
    back.appendChild(backText);
    leaf.appendChild(front); leaf.appendChild(back);
    root.appendChild(shade); root.appendChild(leaf);
    root.style.perspective = B.perspective + 'px';
    app.appendChild(root);
  }

  // ---------- 今の画面を写し取る（3-2） ----------
  function capture(opts) {
    const app = root.parentNode, r = app.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }   // 大きさが変わったときだけ（作り直さず使い回す）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 下地：#app と同じ縦のグラデーション（まだ何も描いていない画面でも真っ黒にしない）
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#100818'); g.addColorStop(1, '#221230');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    // 1. 3Dのとき #world3d（WebGL は描いた直後でないと写せないので、Render3D が同じ処理の中で描き直して写す）。2Dのとき #world
    let drew = false;
    const c3 = document.getElementById('world3d');
    if (c3 && c3.style.display !== 'none' && window.Render3D && Render3D.snapshotTo) drew = Render3D.snapshotTo(ctx, cw, ch);
    if (!drew) {
      const c2 = document.getElementById('world');
      if (c2 && c2.style.display !== 'none') { try { ctx.drawImage(c2, 0, 0, cw, ch); } catch (e) {} }
    }
    // 3. #fx（村の看板・ふきだし・戦闘の光）
    const cf = document.getElementById('fx');
    if (cf) { try { ctx.drawImage(cf, 0, 0, cw, ch); } catch (e) {} }
    // 4. #menu が見えているとき：中身を複製した HTML をキャンバスの上に重ねる（背景の半透明・ぼかしは .book-menu が #menu と同じに再現する）
    const menu = document.getElementById('menu');
    if (menu && window.getComputedStyle(menu).display !== 'none') {
      const c = menu.cloneNode(true);
      c.removeAttribute('id');
      const ids = c.querySelectorAll('[id]');
      for (let i = 0; i < ids.length; i++) ids[i].removeAttribute('id');   // id が二重にならないように
      c.classList.add('book-menu'); c.setAttribute('inert', '');
      cloneHost.appendChild(c);
      c.scrollTop = menu.scrollTop;                                         // スクロールの位置も同じに
    }
  }

  // ---------- 片付ける（めくり終わり・次のめくりが来たとき） ----------
  function finishNow() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (anim) { const a = anim; anim = null; try { a.cancel(); } catch (e) {} }
    for (let i = 0; i < extra.length; i++) { try { extra[i].cancel(); } catch (e) {} }
    extra.length = 0;
    if (root) {
      root.style.display = 'none';
      cloneHost.textContent = '';                        // 複製した HTML を片付ける
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);  // 写し取った絵を消す（キャンバスそのものは残して使い回す）
      backText.textContent = '';
    }
    if (st.turning && st.playAt) st.lastMs = Math.round(performance.now() - st.playAt);
    st.playAt = 0;
    st.turning = false;
  }

  // ---------- めくる ----------
  Book.isTurning = function () { return st.turning; };

  Book.turn = function (switchFn, opts) {
    opts = opts || {};
    if (busy) { switchFn(); return; }                    // switchFn の中からもう一度呼ばれたときは、めくらずに切り替えるだけ
    finishNow();                                         // めくっている途中なら、前のめくりをすぐ終わらせる
    const mode = Book.mode();
    if (mode === 'off' || !B || typeof document.createElement('div').animate !== 'function') { switchFn(); return; }
    let ok = false;
    try {
      ensureDom();
      root.style.display = 'block';
      capture(opts);
      backText.textContent = opts.backTitle || ''; backText.setAttribute('data-sub', opts.backSub || '');
      st.turning = true; st.kind = mode === 'reduced' ? 'fade' : (opts.cover ? 'cover' : 'page');
      st.backTitle = opts.backTitle || ''; st.count++;
      ok = true;
    } catch (e) { try { console.warn('Book capture failed', e); } catch (e2) {} finishNow(); }
    if (ok && window.Audio3) Audio3.play(opts.cover ? 'cover' : 'turn');   // 写し取ったあと・切り替えの前に1回（reduced のフェードでも鳴らす）
    busy = true;
    try { switchFn(); }                                  // 切り替えはその場で（遅らせない）
    finally {
      busy = false;
      if (ok) { try { play(mode, !!opts.cover); } catch (e) { finishNow(); } }
    }
  };

  function play(mode, cover) {
    let ms;
    st.playAt = performance.now();
    if (mode === 'reduced') {                            // 動きを減らす設定：回らずに、写し取った紙を透明にして消す
      ms = Math.max(1, B.reducedFadeSec * 1000);
      shade.style.display = 'none';
      anim = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'linear', fill: 'forwards' });
    } else {
      ms = Math.max(1, (cover ? B.coverSec : B.turnSec) * 1000);
      shade.style.display = '';
      anim = leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }],
        { duration: ms, easing: 'cubic-bezier(0.45, 0.05, 0.35, 1)', fill: 'forwards' });
      extra.push(shade.animate([{ opacity: 0.7, offset: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0, offset: 1 }],
        { duration: ms, easing: 'linear', fill: 'forwards' }));
      extra.push(fshade.animate([{ opacity: 0 }, { opacity: 0.6 }], { duration: ms, easing: 'ease-in', fill: 'forwards' }));
    }
    anim.onfinish = finishNow;
    timer = setTimeout(finishNow, ms);                   // 片付けは時計で（画面が重くてアニメーションの終わりの知らせが遅れても、紙が居座らない）
  }

  // ---------- テスト用の窓口（読むだけ。freeze/release は写真用） ----------
  Book.dbg = {
    state: function () {
      let angle = 0;
      if (root && st.turning) {
        const t = window.getComputedStyle(leaf).transform;
        if (t && t.indexOf('matrix3d') === 0) {
          const v = t.slice(9, -1).split(',').map(Number);
          angle = Math.round(Math.atan2(-v[2], v[0]) * 18000 / Math.PI) / 100;
        }
      }
      return { turning: st.turning, angle: angle, kind: st.kind, backTitle: st.backTitle, nodes: root ? root.querySelectorAll('*').length : 0, count: st.count, lastMs: st.lastMs };
    },
    // 写し取った絵の中の明るい画素（真っ黒でないかを見る）。めくっている間だけ意味がある
    snapshotInfo: function () {
      if (!canvas || !st.turning) return { w: 0, h: 0, lit: 0, sampled: 0 };
      const w = canvas.width, h = canvas.height, d = ctx.getImageData(0, 0, w, h).data;
      let lit = 0, sampled = 0;
      for (let i = 0; i < d.length; i += 4 * 9) { sampled++; if (Math.max(d[i], d[i + 1], d[i + 2]) > 48) lit++; }
      return { w: w, h: h, lit: lit, sampled: sampled };
    },
    root: function () { return root; },
    leaf: function () { return leaf; },
    // めくりを途中（0〜1）で止める。release で終わらせる
    freeze: function (p) {
      if (!st.turning || !anim) return false;
      if (timer) { clearTimeout(timer); timer = 0; }
      anim.onfinish = null;
      const all = [anim].concat(extra);
      for (let i = 0; i < all.length; i++) { const a = all[i]; a.pause(); a.currentTime = p * a.effect.getTiming().duration; }
      return true;
    },
    release: function () { finishNow(); },
  };
})();
