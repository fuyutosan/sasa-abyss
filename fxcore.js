// ササノアビス - 光の合成エンジン（担当：メイメイ）
// _visual_target.html で実証した「Eastward式」パイプラインの毎フレーム版。
//   基本は闇 → 光のマスクで元の色がよみがえる → 色つきの追い光 → 霧 → ビネット
// 性能の要：毎フレーム createRadialGradient を作らない。
//   白い放射グラデを1枚だけ事前レンダし、色ごとの染色キャッシュを使い回す。
// スマホ最適化（2026-08）：
//   ・光まわり（マスク／リビール／追い光）は出力の半解像度で処理し、最後にまとめて拡大合成する
//     （光はもともと滑らかなグラデーションなので半解像度でも見た目の差はごくわずか）
//   ・作業用キャンバスはサイズが変わったときだけ作り直す（毎フレームcreateElementしない）
//   ・画面と交差しない光（画面外ライト）は計算そのものをスキップする
//
// 使い方（毎フレーム）:
//   Fx.begin();
//   Fx.light(x, y, r, '255,180,100', strength, reveal);   // 座標は表示解像度
//   Fx.seen(x, y, r, reveal); Fx.eyeGlow(x, y);
//   Fx.compose(g, baseCanvas, { darkness: 0.62, ambient: '16,9,28', fog: t });
//
(function () {
  const GLOW_SIZE = 256;
  const HALF = 0.5; // 光レイヤーの作業解像度スケール（出力の1/2）

  // 白い放射グラデ（素）
  const glowWhite = document.createElement('canvas');
  glowWhite.width = glowWhite.height = GLOW_SIZE;
  {
    const c = glowWhite.getContext('2d');
    const grd = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.38)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grd; c.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  }

  // 色つきグロー（色文字列 'r,g,b' → 染色済みキャンバス）
  const tintCache = new Map();
  function tinted(color) {
    let t = tintCache.get(color);
    if (!t) {
      t = document.createElement('canvas');
      t.width = t.height = GLOW_SIZE;
      const c = t.getContext('2d');
      c.drawImage(glowWhite, 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = `rgb(${color})`;
      c.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
      tintCache.set(color, t);
    }
    return t;
  }

  // mask/glow = 光まわりの半解像度作業キャンバス／lit = リビール適用後（出力解像度）／vig = ビネット（作り置き）
  let mask = null, glow = null, lit = null, vig = null;
  let W = 0, H = 0, hw = 0, hh = 0;
  const lights = [];
  const visibleLights = [];
  let lightCount = 0;
  let visibleLightCount = 0;

  function addLight(x, y, r, color, strength, reveal) {
    let li = lights[lightCount];
    if (!li) {
      li = { x: 0, y: 0, r: 0, color: '', strength: 0, reveal: 0 };
      lights.push(li);
    }
    li.x = x; li.y = y; li.r = r; li.color = color; li.strength = strength; li.reveal = reveal;
    lightCount++;
  }

  function isVisible(li, w, h) {
    return li.x + li.r >= 0 && li.x - li.r <= w && li.y + li.r >= 0 && li.y - li.r <= h;
  }

  function ensure(w, h) {
    if (W === w && H === h) return;
    W = w; H = h;
    hw = Math.max(1, Math.round(w * HALF));
    hh = Math.max(1, Math.round(h * HALF));

    mask = document.createElement('canvas'); mask.width = hw; mask.height = hh;
    glow = document.createElement('canvas'); glow.width = hw; glow.height = hh;

    lit = document.createElement('canvas'); lit.width = w; lit.height = h;
    lit.getContext('2d').imageSmoothingEnabled = false;

    // ビネットは作り置き（出力解像度のまま。毎フレーム変化しないので半解像度化の対象外）
    vig = document.createElement('canvas'); vig.width = w; vig.height = h;
    const vc = vig.getContext('2d');
    const grd = vc.createRadialGradient(w / 2, h / 2, h * 0.30, w / 2, h / 2, h * 0.74);
    grd.addColorStop(0, 'rgba(5,2,9,0)');
    grd.addColorStop(1, 'rgba(5,2,9,0.58)');
    vc.fillStyle = grd; vc.fillRect(0, 0, w, h);
  }

  const Fx = {
    begin() { lightCount = 0; },

    // x,y,r は表示解像度のピクセル
    light(x, y, r, color, strength, reveal) {
      addLight(x, y, r, color, strength || 0.5, reveal === undefined ? 0.8 : reveal);
    },
    // 「闇の中でも最低限読める」ための無彩色の見え
    seen(x, y, r, reveal) {
      addLight(x, y, r || 40, '120,110,150', 0.12, reveal === undefined ? 0.5 : reveal);
    },
    // 敵の赤い目
    eyeGlow(x, y) {
      addLight(x, y, 14, '255,90,110', 0.9, 0);
    },

    // g: 表示キャンバスの2Dコンテキスト／base: ドット絵パス（論理解像度）
    compose(g, base, opts) {
      const w = g.canvas.width, h = g.canvas.height;
      ensure(w, h);

      visibleLightCount = 0;
      for (let i = 0; i < lightCount; i++) {
        const li = lights[i];
        if (isVisible(li, w, h)) visibleLights[visibleLightCount++] = li;
      }

      // 1) ドット→拡大
      g.imageSmoothingEnabled = false;
      g.drawImage(base, 0, 0, w, h);

      // 2) 闇
      g.fillStyle = `rgba(${opts.ambient || '16,9,28'},${opts.darkness === undefined ? 0.62 : opts.darkness})`;
      g.fillRect(0, 0, w, h);

      // 3) 光のマスク（半解像度で1枚に貯めて、拡大適用は最後に一度だけ）
      const mc = mask.getContext('2d');
      mc.clearRect(0, 0, hw, hh);
      for (let i = 0; i < visibleLightCount; i++) {
        const li = visibleLights[i];
        if (!li.reveal) continue;
        mc.globalAlpha = li.reveal;
        const r2 = li.r * HALF;
        mc.drawImage(glowWhite, li.x * HALF - r2, li.y * HALF - r2, r2 * 2, r2 * 2);
      }
      mc.globalAlpha = 1;

      const lc = lit.getContext('2d');
      lc.clearRect(0, 0, w, h);
      lc.imageSmoothingEnabled = false;
      lc.drawImage(base, 0, 0, w, h);
      lc.globalCompositeOperation = 'destination-in';
      lc.imageSmoothingEnabled = true; // マスクは滑らかなグラデなので拡大時は補間する
      lc.drawImage(mask, 0, 0, w, h);
      lc.globalCompositeOperation = 'source-over';
      g.drawImage(lit, 0, 0);

      // 4) 色つきの追い光（半解像度キャンバスにまとめて加算合成→最後に1回だけ拡大して重ねる）
      const gc = glow.getContext('2d');
      gc.clearRect(0, 0, hw, hh);
      gc.globalCompositeOperation = 'lighter';
      for (let i = 0; i < visibleLightCount; i++) {
        const li = visibleLights[i];
        gc.globalAlpha = 0.34 * li.strength;
        const r2 = li.r * HALF;
        gc.drawImage(tinted(li.color), li.x * HALF - r2, li.y * HALF - r2, r2 * 2, r2 * 2);
      }
      gc.globalAlpha = 1;

      g.save();
      g.globalCompositeOperation = 'lighter';
      g.imageSmoothingEnabled = true; // 加算光の拡大も補間してポン付け感・縞を抑える
      g.drawImage(glow, 0, 0, w, h);
      g.restore();

      // 5) 霧（ゆっくり漂う2枚）
      if (opts.fog !== false) {
        const t = opts.fog === true || opts.fog === undefined ? 0 : opts.fog;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.055;
        const fs = h * 0.9;
        g.drawImage(tinted('125,105,165'), w * 0.18 + Math.sin(t * 0.13) * 40 - fs / 2, h * 0.24 + Math.cos(t * 0.09) * 30 - fs / 2, fs, fs);
        g.drawImage(tinted('125,105,165'), w * 0.78 + Math.sin(t * 0.11 + 2) * 46 - fs / 2, h * 0.7 + Math.cos(t * 0.08 + 1) * 34 - fs / 2, fs, fs);
        g.globalAlpha = 1;
        g.restore();
      }

      // 6) ビネット
      g.drawImage(vig, 0, 0);
    },
  };

  window.Fx = Fx;
})();
