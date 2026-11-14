// ササノアビス モックアップ - 地形（岩・石柱・石垣・水たまり）
// 見た目（render3d.js・2Dの描画）と当たり判定（run.js）の両方が、ここの同じ一覧を読む。
// タイル（1024四方）の番号 (tx, ty) から決まった乱数で毎回同じ配置が出る。作ったタイルは覚えておく（上限あり）。
// window.World を登録する。数値は data.js の WORLD。

(function () {
  'use strict';

  const K = window.WORLD;
  const TS = K.tile, CELL = K.cell, NC = TS / CELL;
  const ROCK = 0, PILLAR = 1, WALL = 2, PUDDLE = 3;

  const World = {};
  window.World = World;
  World.ROCK = ROCK; World.PILLAR = PILLAR; World.WALL = WALL; World.PUDDLE = PUDDLE;
  World.tileSize = TS;

  // ---------- 決まった乱数 ----------
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedOf(tx, ty) { return (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663) ^ 0x5bd1e995) >>> 0; }

  // ---------- 重なりの判定（置くときだけ使う） ----------
  // 形：円 {x,y,r}（岩・柱・水たまり・原点の空き地）か、長方形 {x,y,hw,hh}（石垣）
  function overlap(a, b, m) {
    if (a.hw === undefined && b.hw === undefined) return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + m;
    if (a.hw !== undefined && b.hw !== undefined) return Math.abs(a.x - b.x) < a.hw + b.hw + m && Math.abs(a.y - b.y) < a.hh + b.hh + m;
    const c = a.hw === undefined ? a : b, r = a.hw === undefined ? b : a;
    const cx = Math.max(r.x - r.hw, Math.min(c.x, r.x + r.hw)), cy = Math.max(r.y - r.hh, Math.min(c.y, r.y + r.hh));
    return Math.hypot(c.x - cx, c.y - cy) < c.r + m;
  }
  const ORIGIN = { x: 0, y: 0, r: K.clearR };

  // 地形1つの外側の大きさ（タイルの内側に収まるかの確認用）
  function extent(it) { return it.hw !== undefined ? [it.hw, it.hh] : [it.r, it.r]; }

  function generate(tx, ty) {
    const rnd = mulberry(seedOf(tx, ty));
    const ox = tx * TS, oy = ty * TS;
    const items = [];
    const range = (lo, hi) => lo + rnd() * (hi - lo);
    const place = (build) => {
      for (let k = 0; k < 10; k++) {
        const it = build();
        const e = extent(it);
        if (it.x - e[0] < ox + K.margin || it.x + e[0] > ox + TS - K.margin || it.y - e[1] < oy + K.margin || it.y + e[1] > oy + TS - K.margin) continue;   // タイルの外へはみ出さない
        if (overlap(it, ORIGIN, K.margin)) continue;                                                                                       // 開始地点の空き地
        let ok = true;
        for (let i = 0; i < items.length && ok; i++) if (overlap(it, items[i], K.margin)) ok = false;
        if (ok) { items.push(it); return; }
      }
    };
    const count = (c) => c[0] + Math.floor(rnd() * (c[1] - c[0] + 1));

    // 大きいものから置く（石垣→水たまり→石柱→岩）
    const nw = count(K.wall.count);
    for (let i = 0; i < nw; i++) {
      place(() => {
        const len = range(K.wall.len[0], K.wall.len[1]), horiz = rnd() < 0.5, th = K.wall.thick;
        return { t: WALL, x: ox + rnd() * TS, y: oy + rnd() * TS, hw: (horiz ? len : th) / 2, hh: (horiz ? th : len) / 2, horiz, len, height: range(K.wall.height[0], K.wall.height[1]), q: 0 };
      });
    }
    const np = count(K.puddle.count);
    for (let i = 0; i < np; i++) place(() => ({ t: PUDDLE, x: ox + rnd() * TS, y: oy + rnd() * TS, r: range(K.puddle.r[0], K.puddle.r[1]), q: 0 }));
    for (let i = 0; i < K.pillar.perTile; i++) {
      place(() => {
        const th = range(K.pillar.thick[0], K.pillar.thick[1]), broken = rnd() < 0.35;
        const h = broken ? K.pillar.height[0] * (0.4 + rnd() * 0.5) : range(K.pillar.height[0], K.pillar.height[1]);
        return { t: PILLAR, x: ox + rnd() * TS, y: oy + rnd() * TS, r: th / 2, thick: th, height: h, q: 0 };
      });
    }
    for (let i = 0; i < K.rock.perTile; i++) {
      place(() => {
        const sz = range(K.rock.size[0], K.rock.size[1]);
        return { t: ROCK, x: ox + rnd() * TS, y: oy + rnd() * TS, r: sz * K.rock.rMul, size: sz, ang: rnd() * 6.283, q: 0 };
      });
    }

    // 128四方のマスごとの索引（当たり判定の検索を軽くする）
    const grid = new Array(NC * NC);
    for (let i = 0; i < grid.length; i++) grid[i] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i], e = extent(it);
      const gx0 = Math.max(0, Math.floor((it.x - e[0] - ox) / CELL)), gx1 = Math.min(NC - 1, Math.floor((it.x + e[0] - ox) / CELL));
      const gy0 = Math.max(0, Math.floor((it.y - e[1] - oy) / CELL)), gy1 = Math.min(NC - 1, Math.floor((it.y + e[1] - oy) / CELL));
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) grid[gy * NC + gx].push(it);
    }
    return { tx, ty, items, grid };
  }
  World.generate = generate;   // 覚えずに作る（テスト用：2回作って一致を見る）

  // ---------- 作ったタイルを覚える（上限あり。古いものから捨てる） ----------
  const cache = new Map();
  let lastKey = '', lastTile = null;
  function tile(tx, ty) {
    const key = tx + ',' + ty;
    if (key === lastKey && lastTile) return lastTile;
    let t = cache.get(key);
    if (t) { cache.delete(key); cache.set(key, t); }
    else {
      t = generate(tx, ty); cache.set(key, t);
      if (cache.size > K.cacheTiles) cache.delete(cache.keys().next().value);
    }
    lastKey = key; lastTile = t;
    return t;
  }
  World.tile = tile;
  World.cacheSize = function () { return cache.size; };

  // ---------- 周りの地形を探す ----------
  // out.solids（岩・柱・壁）と out.puddles に、円 (x,y) 半径 r に触れうるものを入れて返す（配列は使い回し）
  let stamp = 1;
  World.near = function (x, y, out, r) {
    r = r || 0;
    out.solids.length = 0; out.puddles.length = 0;
    stamp++;
    const tx0 = Math.floor((x - r) / TS), tx1 = Math.floor((x + r) / TS), ty0 = Math.floor((y - r) / TS), ty1 = Math.floor((y + r) / TS);
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
      const t = tile(tx, ty), ox = tx * TS, oy = ty * TS;
      const gx0 = Math.max(0, Math.floor((x - r - ox) / CELL)), gx1 = Math.min(NC - 1, Math.floor((x + r - ox) / CELL));
      const gy0 = Math.max(0, Math.floor((y - r - oy) / CELL)), gy1 = Math.min(NC - 1, Math.floor((y + r - oy) / CELL));
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
        const cellItems = t.grid[gy * NC + gx];
        for (let i = 0; i < cellItems.length; i++) {
          const it = cellItems[i]; if (it.q === stamp) continue; it.q = stamp;
          if (it.t === PUDDLE) out.puddles.push(it); else out.solids.push(it);
        }
      }
    }
    return out;
  };
  World.makeOut = function () { return { solids: [], puddles: [] }; };

  // ---------- 押し出し・水たまり ----------
  const scratch = World.makeOut();
  World.inPuddleLast = false;   // 直前の collide で水たまりの中だったか
  // p（{x,y}を持つ物）を半径 r の円として、岩・柱・壁の外へ押し出す。動いたら true
  World.lastHit = null;         // 直前の collide で押し出した物（敵の回り込み用）
  World.collide = function (p, r) {
    World.near(p.x, p.y, scratch, r + 2);
    let moved = false;
    World.lastHit = null;
    for (let pass = 0; pass < 2; pass++) {
      let again = false;
      for (let i = 0; i < scratch.solids.length; i++) {
        const it = scratch.solids[i];
        if (it.hw === undefined) {
          const dx = p.x - it.x, dy = p.y - it.y, d = Math.hypot(dx, dy), min = r + it.r;
          if (d < min) { if (d < 1e-6) { p.x = it.x + min; } else { p.x = it.x + dx / d * min; p.y = it.y + dy / d * min; } moved = again = true; World.lastHit = it; }
        } else {
          const cx = Math.max(it.x - it.hw, Math.min(p.x, it.x + it.hw)), cy = Math.max(it.y - it.hh, Math.min(p.y, it.y + it.hh));
          const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
          if (d < r) {
            if (d > 1e-6) { p.x = cx + dx / d * r; p.y = cy + dy / d * r; }
            else {   // 中心が壁の中：いちばん浅く抜けられる向きへ
              const l = p.x - (it.x - it.hw), rt = it.x + it.hw - p.x, tp = p.y - (it.y - it.hh), bt = it.y + it.hh - p.y, m = Math.min(l, rt, tp, bt);
              if (m === l) p.x = it.x - it.hw - r; else if (m === rt) p.x = it.x + it.hw + r; else if (m === tp) p.y = it.y - it.hh - r; else p.y = it.y + it.hh + r;
            }
            moved = again = true; World.lastHit = it;
          }
        }
      }
      if (!again) break;
    }
    let wet = false;
    for (let i = 0; i < scratch.puddles.length; i++) { const w = scratch.puddles[i]; if (Math.hypot(p.x - w.x, p.y - w.y) < w.r) { wet = true; break; } }
    World.inPuddleLast = wet;
    return moved;
  };
  // その位置・半径が岩・柱・壁の中か（湧く位置の引き直し用。動かさない）
  World.isBlocked = function (x, y, r) {
    World.near(x, y, scratch, r + 2);
    for (let i = 0; i < scratch.solids.length; i++) {
      const it = scratch.solids[i];
      if (it.hw === undefined) { if (Math.hypot(x - it.x, y - it.y) < r + it.r) return true; }
      else {
        const cx = Math.max(it.x - it.hw, Math.min(x, it.x + it.hw)), cy = Math.max(it.y - it.hh, Math.min(y, it.y + it.hh));
        if (Math.hypot(x - cx, y - cy) < r) return true;
      }
    }
    return false;
  };
})();
