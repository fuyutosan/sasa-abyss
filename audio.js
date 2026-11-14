// 音（効果音・曲・環境音）。2026-11-03 要件定義_音。名前は Audio3（Audio は組み込みの名前なので使わない）。
// 数値は data.js の AUDIO。効果音は assets/audio/sfx/、曲は assets/audio/bgm/（曲は作者が試聴室で選んでから入れる）。
// ファイルが読めないとき（読み込み中・file:// 直開き・失敗）は、前からある小さな合成音（SYNTH）を鳴らす。
(function () {
  'use strict';
  const CFG = window.AUDIO;
  const SFX_DIR = 'assets/audio/sfx/';
  const ROOT_DIR = 'assets/audio/';
  const Audio3 = {};
  window.Audio3 = Audio3;

  let ctx = null, gMaster = null, gSfx = null, gBgm = null, gAmb = null;
  let unlocked = false, loadStarted = false;
  const bufs = {};                 // 効果音・環境音：拡張子なしの名前 → AudioBuffer
  const bgmBuf = {};               // 曲名 → AudioBuffer | 'loading' | 'missing'
  const voices = [];               // 鳴っている効果音 { endAt, kill() }（古い順）
  const lastAt = {};               // 名前 → 最後に鳴らした時刻（秒）
  const lastRate = {};             // 名前 → 最後の再生速度（同じ値が続かないように）
  const rr = {};                   // 名前 → 順番に回す番号（hit1→hit2→hit3）
  const loops = { bgm: null, amb: null };   // 鳴らしている曲・環境音 { name, src, g }

  // テスト用の口。history は play が実際に音を出したときだけ積む（合成音のときも）
  const dbg = {
    loaded: [], history: [], last: null, bgm: null, amb: null,
    get active() { prune(); return voices.length; },
    get gains() {
      return ctx ? { sfx: gSfx.gain.value, bgm: gBgm.gain.value, amb: gAmb.gain.value }
                 : { sfx: CFG.sfxVol, bgm: CFG.bgmVol, amb: CFG.ambVol };
    },
  };
  Audio3.dbg = dbg;

  function settings() { return (window.Game && Game.state && Game.state.settings) || { sfx: true, bgm: true }; }
  function now() { return performance.now() / 1000; }

  function ac() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      gMaster = ctx.createGain(); gMaster.gain.value = CFG.master; gMaster.connect(ctx.destination);
      gSfx = ctx.createGain(); gSfx.gain.value = CFG.sfxVol; gSfx.connect(gMaster);
      gBgm = ctx.createGain(); gBgm.gain.value = CFG.bgmVol; gBgm.connect(gMaster);
      gAmb = ctx.createGain(); gAmb.gain.value = CFG.ambVol; gAmb.connect(gMaster);
    }
    return ctx;
  }

  // ---------- 同時に鳴らす数（maxVoices まで。超えたら古いものを 0.02 秒で絞って止める）----------
  function prune() {
    const t = now();
    let w = 0;
    for (let i = 0; i < voices.length; i++) if (voices[i].endAt > t) voices[w++] = voices[i];
    voices.length = w;
  }
  function register(v) {
    prune();
    while (voices.length >= CFG.maxVoices) { const old = voices.shift(); try { old.kill(); } catch (e) {} }
    voices.push(v);
  }
  function killer(src, g) {
    return function () {
      const t = ctx.currentTime;
      try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.02); } catch (e) {}
      try { src.stop(t + 0.03); } catch (e) {}
    };
  }

  // ---------- 予備の合成音（前からあるもの。表に無い名前は click）----------
  let synthRate = 1;               // 再生速度のゆらぎ。合成音では高さに掛ける
  function tone(freq, dur, type, vol, slideTo) {
    if (!settings().sfx) return;
    try {
      const c = ac(), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square'; o.frequency.value = freq * synthRate;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo * synthRate, c.currentTime + dur);
      g.gain.value = vol || 0.05;
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(gSfx);
      o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
      o.start(); o.stop(c.currentTime + dur);
      register({ endAt: now() + dur, kill: killer(o, g) });
    } catch (e) {}
  }
  const SYNTH = {
    click: () => tone(660, 0.05, 'square', 0.03),
    hit: () => tone(180, 0.05, 'square', 0.025, 100),
    kill: () => tone(320, 0.08, 'square', 0.04, 90),
    hurt: () => tone(110, 0.18, 'sawtooth', 0.06, 60),
    level: () => { tone(523, 0.09, 'square', 0.05); setTimeout(() => tone(659, 0.09, 'square', 0.05), 90); setTimeout(() => tone(784, 0.14, 'square', 0.05), 180); },
    special: () => { tone(60, 0.4, 'sawtooth', 0.09, 30); tone(880, 0.25, 'sine', 0.04, 220); },
    gacha: () => { tone(784, 0.1, 'sine', 0.05); setTimeout(() => tone(1046, 0.18, 'sine', 0.05), 110); },
    boss: () => tone(70, 0.5, 'sawtooth', 0.09, 45),
    win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'square', 0.05), i * 110)); },
    lose: () => { [330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'sine', 0.05), i * 160)); },
  };

  // ---------- 効果音 ----------
  function playBuffer(buf, vol, rate) {
    const c = ac(), s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; s.playbackRate.value = rate;
    g.gain.value = vol;
    s.connect(g); g.connect(gSfx);
    s.onended = function () { try { s.disconnect(); g.disconnect(); } catch (e) {} };
    s.start();
    register({ endAt: now() + buf.duration / rate, kill: killer(s, g) });
  }

  Audio3.play = function (name) {
    try {
      if (!settings().sfx) return;
      const t = now();
      const gap = CFG.minGap[name] || 0;
      if (gap && lastAt[name] !== undefined && t - lastAt[name] < gap) return;
      lastAt[name] = t;
      let rate = 1 + (Math.random() * 2 - 1) * CFG.detune;
      if (rate === lastRate[name]) rate = 1 + (Math.random() * 2 - 1) * CFG.detune;
      lastRate[name] = rate;
      const def = CFG.sfx[name];
      let buf = null;
      if (def) {
        const files = Array.isArray(def.file) ? def.file : [def.file];
        let n = 0;
        if (files.length > 1) { n = rr[name] || 0; rr[name] = n + 1; }   // hit1→hit2→hit3 の順に回す
        const f = files[n % files.length];
        buf = bufs[f.replace(/\.mp3$/, '')];
      }
      if (buf && ctx) playBuffer(buf, def.vol, rate);
      else { synthRate = rate; (SYNTH[name] || SYNTH.click)(); synthRate = 1; }
      const rec = { name: name, rate: rate, t: t };
      dbg.last = rec;
      dbg.history.push(rec);
      if (dbg.history.length > 20) dbg.history.shift();
    } catch (e) {}
  };

  // ---------- 読み込み ----------
  function decode(ab) {
    return new Promise(function (res) {
      try {
        const p = ctx.decodeAudioData(ab, res, function () { res(null); });
        if (p && p.catch) p.catch(function () { res(null); });
      } catch (e) { res(null); }
    });
  }
  function loadOne(url) {
    return fetch(url + '?v=' + AUDIO.ver).then(function (r) { return r.ok ? r.arrayBuffer() : null; })
      .then(function (ab) { return ab ? decode(ab) : null; })
      .catch(function () { return null; });
  }
  function loadSfx() {
    if (loadStarted) return;
    loadStarted = true;
    if (location.protocol === 'file:') return;   // file:// では読めない。合成音で続ける
    const list = [];
    for (const k in CFG.sfx) { const fs = CFG.sfx[k].file; (Array.isArray(fs) ? fs : [fs]).forEach(function (f) { list.push(f); }); }
    for (const k in CFG.amb) list.push(CFG.amb[k].file);
    list.forEach(function (f) {
      loadOne(SFX_DIR + f).then(function (buf) {
        if (!buf) return;
        const stem = f.replace(/\.mp3$/, '');
        bufs[stem] = buf; dbg.loaded.push(stem);
        applyLoop('amb');
      });
    });
  }
  function loadBgm(name, spec) {
    if (location.protocol === 'file:') { bgmBuf[name] = 'missing'; return; }   // file:// では読めない
    bgmBuf[name] = 'loading';
    loadOne(ROOT_DIR + spec.file).then(function (buf) {
      bgmBuf[name] = buf || 'missing';   // 曲が無い（404）あいだは何もしない
      applyLoop('bgm');
    });
  }

  // ---------- 曲と環境音（ループ）----------
  function wantName(kind) {
    if (!unlocked || settings().bgm === false) return null;
    return kind === 'bgm' ? dbg.bgm : dbg.amb;
  }
  function fadeOut(cur) {
    const t = ctx.currentTime, e = CFG.fadeSec;
    try {
      cur.g.gain.cancelScheduledValues(t); cur.g.gain.setValueAtTime(cur.g.gain.value, t);
      cur.g.gain.linearRampToValueAtTime(0, t + e);
      cur.src.stop(t + e + 0.05);
    } catch (err) {}
  }
  function startLoop(kind, name, spec, buf) {
    const c = ac(), s = c.createBufferSource(), g = c.createGain(), t = c.currentTime;
    s.buffer = buf; s.loop = true;
    if (spec.loopEnd > 0) { s.loopStart = spec.loopStart || 0; s.loopEnd = spec.loopEnd; }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(spec.vol, t + CFG.fadeSec);
    s.connect(g); g.connect(kind === 'bgm' ? gBgm : gAmb);
    s.onended = function () { try { s.disconnect(); g.disconnect(); } catch (e) {} };
    s.start();
    loops[kind] = { name: name, src: s, g: g };
  }
  function applyLoop(kind) {
    if (!ctx) return;
    const want = wantName(kind), cur = loops[kind];
    if (cur && cur.name === want) return;
    if (cur) { fadeOut(cur); loops[kind] = null; }
    if (!want) return;
    const spec = kind === 'bgm' ? CFG.bgm[want] : CFG.amb[want];
    if (!spec) return;
    let buf;
    if (kind === 'amb') buf = bufs[spec.file.replace(/\.mp3$/, '')];
    else {
      buf = bgmBuf[want];
      if (buf === undefined) { loadBgm(want, spec); return; }   // 曲は初めて要るときに読む
    }
    if (!buf || typeof buf === 'string') return;                 // 読み込み中・曲が無い
    startLoop(kind, want, spec, buf);
  }
  Audio3.bgm = function (name) {
    name = name || null;
    if (name === dbg.bgm) return;       // 今と同じ曲なら何もしない
    dbg.bgm = name;
    try { applyLoop('bgm'); } catch (e) {}
  };
  Audio3.amb = function (name) {
    name = name || null;
    if (name === dbg.amb) return;
    dbg.amb = name;
    try { applyLoop('amb'); } catch (e) {}
  };
  Audio3.refresh = function () { try { applyLoop('bgm'); applyLoop('amb'); } catch (e) {} };

  // ---------- 最初の操作で起こす（iPhone は操作の前に音を出せない）----------
  // 戻り値：音が出せる状態か。false の間は、次の操作でもう一度呼ぶ
  Audio3.wake = function () {
    try {
      const c = ac();
      if (c.state === 'suspended') { const p = c.resume(); if (p && p.catch) p.catch(function () {}); }
      if (!unlocked) { unlocked = true; loadSfx(); Audio3.refresh(); }
      return c.state === 'running';
    } catch (e) { return true; }
  };
  document.addEventListener('visibilitychange', function () {
    if (!ctx || !unlocked) return;
    try {
      if (document.hidden) { const p = ctx.suspend(); if (p && p.catch) p.catch(function () {}); }
      else { const p2 = ctx.resume(); if (p2 && p2.catch) p2.catch(function () {}); }
    } catch (e) {}
  });

  // ---------- 音の設定（全部On → 効果音のみ → Off → 全部On）----------
  Audio3.mode = function () {
    const s = settings();
    return !s.sfx ? 'off' : (s.bgm === false ? 'sfx' : 'all');
  };
  Audio3.label = function () { return { all: '音On', sfx: '効果音のみ', off: '音Off' }[Audio3.mode()]; };
  Audio3.cycle = function () {
    const s = settings(), m = Audio3.mode();
    if (m === 'all') { s.sfx = true; s.bgm = false; }
    else if (m === 'sfx') { s.sfx = false; s.bgm = false; }
    else { s.sfx = true; s.bgm = true; }
    if (window.Game && Game.save) Game.save();
    Audio3.refresh();                    // 効果音のみ→曲をフェードで止める／Off→On→その場で再開
    if (s.sfx) Audio3.play('click');
    return Audio3.label();
  };
})();
