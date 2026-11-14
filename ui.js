// ササノアビス モックアップ - メニューUI（担当：エージェントC）
// window.UI = { init, show }。#menu に画面を再構築する。イベントは委譲で1本化。
// バニラJS・モジュール構文禁止・自動実行禁止（UI.init/UI.show が呼ばれるまで何もしない）。

(function () {
  'use strict';
  var UI = {};
  // combat guideChip is created by Run HUD so it remains visible without leaving the scene.

  // ---------- 定数（表示用ラベル） ----------
  var ATK_LABEL = {
    arc: '前方薙ぎ', homing: '追尾弾', pierce: '貫通', allround: '全周波',
    summon: '召喚', trap: '設置', spread: '拡散', clone: '分身',
  };
  var MOCK_ATK_TYPES = ['arc', 'homing', 'trap'];
  var WEAPON_SPRITE_PREFIX = { tomoshibi: 'weapon_staff', onpu: 'weapon_flute' };
  var ELEMENT_ORDER = ['fire', 'ice', 'thunder', 'sprout'];
  var TREE_BRANCH_ORDER = ['p', 's', 'l'];

  // ---------- 画面をまたぐ一時状態（セーブ対象ではない） ----------
  var currentScreen = null;
  var currentParams = null;
  var prevScreen = 'village';   // 「このモックについて」を閉じたときの戻り先
  var guildLine = '';           // ギルド画面のメイメイのセリフ（画面に入った時だけ抽選）
  var gachaResult = null;       // ガチャ演出中の結果 {charId,rarity,isNew,dupSasa}
  var smithTab = 'weapon';      // かじ屋の現在タブ：weapon / element / armor
  var villageFloorSel = null;   // 村で選択中の階層（+/-で変える）
  var trainFlash = false;       // 修練場のレベルアップ演出フラグ
  var inputLocked = false;      // 連打多重発火防止
  var toastTimer = null;

  // ---------- 動的スタイル（お守りUI用。style.cssは既存クラス優先・不足分のみここで補う） ----------
  function ensureArmorStyles() {
    if (document.getElementById('armorDynStyles')) return;
    var css = '' +
      '.armor-card { display: flex; flex-direction: column; gap: 10px; }' +
      '.armor-current { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }' +
      '.armor-current-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }' +
      '.armor-current-name { font-size: 13px; font-weight: 700; }' +
      '.armor-current-stat { font-size: 12px; color: #C8BED4; }' +
      '.armor-current-empty { font-size: 13px; color: #7C7488; }' +
      '.armor-unequip-btn { min-height: 36px; padding: 6px 14px; font-size: 12px; flex-shrink: 0; }' +
      '.armor-inv-list { display: flex; flex-direction: column; gap: 8px; }' +
      '.armor-item { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; }' +
      '.armor-item.armor-item-equipped { border-color: #FFC46A; }' +
      '.armor-item-head { display: flex; align-items: center; gap: 6px; }' +
      '.armor-item-name { font-size: 13px; font-weight: 700; }' +
      '.armor-item-stat { font-size: 12px; color: #C8BED4; }' +
      '.armor-item-compare { font-size: 11px; color: #9E92AE; }' +
      '.armor-item-owner { font-size: 11px; color: #7AC8E8; }' +
      '.armor-item-action { align-self: flex-end; min-height: 36px; padding: 6px 14px; font-size: 12px; }' +
      '.armor-empty-note { font-size: 12.5px; color: #7C7488; font-style: italic; }' +
      '.party-armor-summary { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }' +
      '.party-armor-line { display: flex; align-items: center; gap: 8px; min-height: 28px; flex-wrap: wrap; }' +
      '.party-armor-owner { font-size: 13px; font-weight: 700; color: #F0EAF4; }' +
      '.party-armor-empty { font-size: 12.5px; color: #7C7488; }' +
      '.result-drops-note { font-size: 11.5px; color: #9E92AE; margin-top: 6px; }' +
      '.drop-chip { white-space: normal; text-align: left; line-height: 1.5; padding: 4px 10px; }';
    css += '' +
      '.smith-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }' +
      '.smith-tab { min-height: 42px; padding: 8px 4px; font-size: 13px; }' +
      '.smith-tab.smith-tab-active { color: #1A1220; background: #FFC46A; border-color: #FFF0C8; }' +
      '.smith-tab-panel { display: flex; flex-direction: column; gap: 12px; }';
    var el = document.createElement('style');
    el.id = 'armorDynStyles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ---------- 小さなユーティリティ ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 固有名詞（若枝・ともしび）は途中で改行させない
  function nbText(str) {
    return esc(str).replace(/枯れずの若枝|ともしび/g, function (m) { return '<span class="nb">' + m + '</span>'; });
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function safeSpriteDataURL(name, scale) {
    try {
      if (window.Sprites && typeof Sprites.get === 'function' && typeof Sprites.dataURL === 'function' && Sprites.get(name)) {
        return Sprites.dataURL(name, scale || 3);
      }
    } catch (e) {}
    return '';
  }

  function scaleCanvasToDataURL(canvas, scale) {
    try {
      var c = document.createElement('canvas');
      c.width = canvas.width * scale; c.height = canvas.height * scale;
      var ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, c.width, c.height);
      return c.toDataURL();
    } catch (e) { return ''; }
  }

  // ガチャ・パーティ表示用：専用スプライトがあればそれを、無ければ Sprites.panda() で汎用パンダさん絵を作る
  function pandaPortraitURL(charId, scale, opts) {
    scale = scale || 4;
    var direct = safeSpriteDataURL(charId, scale);
    if (direct) return direct;
    try {
      if (window.Sprites && typeof Sprites.panda === 'function') {
        var def = Game.charDef(charId);
        var rarity = def ? def.rarity : 'SR';
        var color = (window.PAL && PAL.rarity && PAL.rarity[rarity]) || (window.PAL && PAL.cloak) || '#563C6A';
        var cv = Sprites.panda(Object.assign({
          cloakColor: color, scarfColor: (window.PAL && PAL.light) || '#FFC46A',
          eyes: 'normal', hood: true,
        }, opts || {}));
        if (cv) return scaleCanvasToDataURL(cv, scale);
      }
    } catch (e) {}
    return '';
  }

  function portraitImg(url, alt) {
    return url ? '<img src="' + url + '" alt="' + esc(alt || '') + '" draggable="false">' : '';
  }

  function toast(msg, ms) {
    var el = document.getElementById('uiToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 1500);
  }

  // 取り消せない操作の確認：1回目は知らせるだけ、3秒以内にもう一度押したら true
  // （window.confirm は claude.ai のページの中では出ずに false が返るため。2026-10-22）
  var armedKey = '', armedUntil = 0;
  function confirmTwice(key, msg) {
    var now = Date.now();
    if (armedKey === key && now < armedUntil) { armedKey = ''; armedUntil = 0; return true; }
    armedKey = key; armedUntil = now + 3000;
    toast(msg, 3000);
    return false;
  }

  function backBar(title) {
    return '' +
      '<div class="topbar">' +
        '<button class="btn btn-ghost btn-back" data-action="nav" data-to="village" type="button">← 村へ</button>' +
        '<div class="topbar-title">' + esc(title) + '</div>' +
        '<div class="sasa-tag">笹 ' + Game.state.sasa + '</div>' +
      '</div>';
  }

  function navCard(to, title, sub) {
    return '' +
      '<button class="card nav-card" data-action="nav" data-to="' + to + '" type="button">' +
        '<div class="nav-card-title">' + esc(title) + '</div>' +
        '<div class="nav-card-sub">' + esc(sub) + '</div>' +
      '</button>';
  }

  // ---------- 画面：タイトル ----------
  // タイトル＝本の表紙（見た目は design/paper_ui_samples.html の「表紙」。ランタンの絵はその SVG）。
  // 「淵に潜る」を押すと表紙が開いて村が見える（navTo → Book.turn）。補助の3つは表紙の下のほうに小さく（押せる高さは44px以上）
  var LANTERN_SVG = '<svg class="cover-lantern" viewBox="0 0 64 84" aria-hidden="true" focusable="false">' +
    '<path d="M26 6h12v6H26z" fill="#C9A25A"/><path d="M32 0v6" stroke="#C9A25A" stroke-width="2"/><path d="M18 14h28l-3 6H21z" fill="#C9A25A"/>' +
    '<path d="M21 20h22c4 10 4 34 0 44H21c-4-10-4-34 0-44z" fill="#FFC46A" opacity=".9"/>' +
    '<path d="M26 22c-2 10-2 30 0 40M38 22c2 10 2 30 0 40" stroke="#8E6424" stroke-width="1.5" fill="none"/><path d="M18 64h28l3 7H15z" fill="#C9A25A"/></svg>';

  // 初めての人か（まだ一度も潜っていない）。初めての人は 表紙 → 物語の1ページ → 第1階 と進む（村は1回目の結果のあと）
  function firstTime() {
    var S = Game.state;
    return !S.flags.introSeen && !S.flags.tutorialSkipped && S.best === 0 && S.pulls === 0;
  }

  function renderIntro() {
    var I = TEXTS.intro;
    var lines = I.lines.map(function (t) { return '<p class="intro-line"><budoux-ja>' + esc(t) + '</budoux-ja></p>'; }).join('');
    return '' +
      '<div class="screen screen-intro">' +
        '<div class="intro-story">' + lines + '</div>' +
        '<p class="intro-how"><budoux-ja>' + esc(window.isTouchDevice() ? I.howTouch : I.howKey) + '</budoux-ja></p>' +
        '<button class="btn btn-primary btn-block" data-action="startRun" data-floor="1" type="button">' + esc(I.go) + '</button>' +
        '<button class="btn btn-ghost btn-block" data-action="nav" data-to="village" type="button">' + esc(I.skip) + '</button>' +
      '</div>';
  }

  // 第10階を踏破したあとのページ（体験版の終わり）
  function renderEnding() {
    var E = TEXTS.ending, S = Game.state;
    var lines = E.lines.map(function (t) { return '<p class="about-line"><budoux-ja>' + esc(t) + '</budoux-ja></p>'; }).join('');
    var friends = CHARS.filter(function (c) { return !!S.owned[c.id]; }).map(function (c) {
      return '<span class="ending-friend"><span class="char-portrait rarity-' + c.rarity + '">' + portraitImg(pandaPortraitURL(c.id, 2), c.name) + '</span>' +
        '<span class="ending-friend-name">' + esc(c.name) + '</span></span>';
    }).join('');
    return '' +
      '<div class="screen screen-ending">' +
        '<div class="result-title result-win">' + esc(E.title) + '</div>' +
        '<div class="card about-card">' + lines + '</div>' +
        '<div class="card"><div class="section-title">' + esc(E.friends) + '</div><div class="ending-friends">' + friends + '</div></div>' +
        '<button class="btn btn-primary btn-block" data-action="postX" type="button">' + esc(E.post) + '</button>' +
        '<button class="btn btn-ghost btn-block" data-action="nav" data-to="village" type="button">' + esc(E.back) + '</button>' +
      '</div>';
  }

  function renderTitle() {
    return '' +
      '<div class="screen screen-title cover">' +
        '<div class="cover-book">' +
          '<div class="cover-ribbon"></div>' +
          '<div class="cover-frame">' +
            LANTERN_SVG +
            '<div class="title-wrap">' +
              '<div class="title-logo">' + esc(TEXTS.title) + '</div>' +
              '<div class="title-subtitle">' + esc(TEXTS.subtitle) + '</div>' +
            '</div>' +
            '<div class="title-buttons">' +
              '<button class="btn btn-primary btn-block" data-action="nav" data-to="' + (firstTime() ? 'intro' : 'village') + '" type="button">淵に潜る</button>' +
            '</div>' +
            '<div class="cover-links">' +
              '<button class="cover-link" data-action="nav" data-to="guide" type="button">あそびかた</button>' +
              '<button class="cover-link" data-action="nav" data-to="about" type="button">このゲームについて</button>' +
            '</div>' +
            '<div class="title-footer">' + esc(TEXTS.version) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderGuide() {
    var step = Game.tutorialStep ? Game.tutorialStep() : 0;
    var labels = ['画面をなぞって移動', '敵に近づくと自動攻撃', '必殺ボタンで群れを押し返す', '笹と装備を持って村へ帰る', '装備または育成で強くする', 'ギルドで仲間を紹介', '新しい仲間へ交代', 'もう一度潜る'];
    var chars = CHARS.filter(function (c) { return ['tomoshibi','onpu','gorogoro'].indexOf(c.id) >= 0; }).map(function (c) {
      return '<div class="card guide-char"><b>' + esc(c.name) + '</b><span>通常：' + esc(c.normalAttack) + '</span><span>必殺：' + esc(c.special) + '</span><span>得意：' + esc(c.favorable) + '</span><span>操作感：' + esc(c.feel) + '</span></div>';
    }).join('');
    return '<div class="screen screen-guide"><div class="card"><div class="section-title">あそびかた</div><p><budoux-ja>なぞって歩き、澱を祓って笹を集める。村で強くなって、もう一段深くへ。なかまが増えると、探索中に加勢してくれる。</budoux-ja></p><p class="guide-current">現在：' + esc(labels[Math.min(step, labels.length - 1)]) + '</p><button class="btn btn-ghost btn-block" data-action="skipTutorial" type="button">チュートリアルをスキップ</button></div><div class="guide-chars">' + chars + '</div><button class="btn btn-primary btn-block" data-action="nav" data-to="village" type="button">村へ</button></div>';
  }

  // ---------- 画面：村（拠点ハブ） ----------
  function renderVillage() {
    var S = Game.state;
    if (villageFloorSel == null) villageFloorSel = S.floor;
    villageFloorSel = Math.max(1, Math.min(villageFloorSel, S.floor));
    var def = Game.charDef(S.selected);
    var cs = Game.charState(S.selected);
    var portrait = portraitImg(pandaPortraitURL(S.selected, 3), def.name);

    return '' +
      '<div class="screen screen-village">' +
        '<div class="card village-status">' +
          '<div class="village-char">' +
            '<div class="char-portrait">' + portrait + '</div>' +
            '<div>' +
              '<div class="village-char-name">' + esc(def.name) + '</div>' +
              '<div class="village-char-sub">Lv' + cs.lv + '　SP' + cs.sp + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="sasa-tag sasa-tag-lg">笹 ' + S.sasa + '</div>' +
        '</div>' +

        '<div class="card floor-card">' +
          '<div class="floor-label">潜る階層を選ぶ</div>' +
          '<div class="floor-picker">' +
            '<button class="btn btn-ghost floor-btn" data-action="floorAdj" data-d="-1" type="button">−</button>' +
            '<div class="floor-num">第 ' + villageFloorSel + ' 階<span class="floor-sub">' + esc((FLOORS[villageFloorSel] || {}).title || '') + '</span></div>' +
            '<button class="btn btn-ghost floor-btn" data-action="floorAdj" data-d="1" type="button">＋</button>' +
          '</div>' +
          '<button class="btn btn-primary btn-block" data-action="startRun" data-floor="' + villageFloorSel + '" type="button">' +
            '第 ' + villageFloorSel + ' 階へ潜る' +
          '</button>' +
        '</div>' +

        '<div class="village-menu">' +
          navCard('guild', 'ギルド', 'メイメイに会う・なかまを紹介してもらう') +
          navCard('smith', 'かじ屋', '武器・属性・お守りを整える') +
          navCard('train', '修練場', '経験値を積んでレベルを上げる') +
          navCard('tree', 'スキルの木', 'SPを振って必殺を育てる') +
          navCard('party', 'なかま', '連れていく子を選ぶ') +
        '</div>' +

        '<div class="village-footer">' +
          '<button class="btn btn-ghost" data-action="toggleSfx" type="button">' + (window.Audio3 ? Audio3.label() : (S.settings.sfx ? '音On' : '音Off')) + '</button>' +
          '<button class="btn btn-ghost" data-action="resetData" type="button">データ初期化</button>' +
          '<button class="btn btn-ghost" data-action="nav" data-to="about" type="button">このゲームについて</button>' +
        '</div>' +
      '</div>';
  }

  // ---------- 画面：ギルド ----------
  function renderGuild() {
    var meimeiImg = portraitImg(pandaPortraitURL('meimei', 3), 'メイメイ');
    var requests = (TEXTS.requests || []).map(function (r) {
      return '' +
        '<div class="request-card">' +
          '<span class="req-name">' + esc(r.name) + '</span>' +
          '<span class="req-body">' + esc(r.body) + '</span>' +
          '<span class="badge badge-soon">つづきの章</span>' +
        '</div>';
    }).join('');

    var QD = QUESTS.wakaeda, qs = Game.state.quests.wakaeda;
    var wakaeda = Game.isBase() ? '' :
      '<div class="request-card">' +
        '<span class="req-name">' + nbText(QD.name) + '</span>' +
        '<span class="req-body"><budoux-ja>' + nbText(TEXTS.quest.resultBody + TEXTS.quest.guildTail) + '</budoux-ja></span>' +
        (qs.done ? '<span class="badge badge-done">' + TEXTS.quest.badgeDone + '</span>'
                 : '<span class="badge badge-open">' + TEXTS.quest.badgeOpen + '</span>' +
                   '<span class="req-body">' + esc(TEXTS.quest.resultBest(qs.best)) + '</span>') +
      '</div>';
    return '' +
      '<div class="screen screen-guild">' +
        backBar('ギルド') +
        '<div class="card guild-meimei">' +
          '<div class="char-portrait guild-meimei-portrait">' + meimeiImg + '</div>' +
          '<div class="speech-bubble">' + esc(guildLine) + '</div>' +
        '</div>' +
        '<button class="btn btn-primary btn-block" data-action="gachaPull" type="button">' +
          'なかまを紹介してもらう（笹' + BALANCE.costs.gacha + '）' +
        '</button>' +
        '<div class="card requests-card">' +
          '<div class="section-title">依頼書</div>' +
          wakaeda + requests +
        '</div>' +
      '</div>' +
      (gachaResult ? renderGachaModal(gachaResult) : '');
  }

  function renderGachaModal(res) {
    var def = Game.charDef(res.charId);
    var isFirstEver = Game.state.pulls === 1 && res.isNew;
    var portrait = portraitImg(pandaPortraitURL(res.charId, 5), def.name);
    var note = '';
    if (isFirstEver) note = esc(TEXTS.meimeiFirstPull + ' ' + TEXTS.meimeiCampWait);
    else if (res.isNew) note = esc(TEXTS.meimeiCampWait);
    else if (!res.isNew) note = '絆のおみやげ　笹+' + res.dupSasa;

    return '' +
      '<div class="gacha-modal">' +
        '<div class="gacha-door left"></div>' +
        '<div class="gacha-door right"></div>' +
        '<div class="gacha-card">' +
          '<div class="char-portrait rarity-' + res.rarity + '">' + portrait + '</div>' +
          '<div class="gacha-rarity rarity-' + res.rarity + '">' + res.rarity + '</div>' +
          '<div class="gacha-name">' + esc(def.name) + '</div>' +
          (note ? '<div class="gacha-note">' + note + '</div>' : '') +
          '<button class="btn btn-primary" data-action="closeGacha" type="button">とじる</button>' +
        '</div>' +
      '</div>';
  }

  // ---------- 画面：鍛冶屋 ----------
  function renderSmith() {
    var S = Game.state, id = S.selected, def = Game.charDef(id), cs = Game.charState(id);
    var prefix = WEAPON_SPRITE_PREFIX[id];
    var weaponSprite = prefix ? safeSpriteDataURL(prefix + '_' + cs.weapon, 4) : '';
    var atMax = cs.weapon >= BALANCE.maxWeaponMock;

    var elemHtml = ELEMENT_ORDER.map(function (key) {
      var el = ELEMENTS[key];
      var learned = cs.elems.indexOf(key) !== -1;
      var equipped = cs.elem === key;
      var label = learned ? (equipped ? '装着中' : '装着する') : ('習得（笹' + BALANCE.costs.element + '）');
      return '' +
        '<button class="btn elem-btn' + (equipped ? ' elem-equipped' : '') + '" style="--elem-color:' + el.color + '" data-action="elemToggle" data-el="' + key + '" type="button">' +
          '<span class="elem-name">' + esc(el.name) + '</span>' +
          '<span class="elem-desc">' + esc(el.d) + '</span>' +
          '<span class="elem-label">' + label + '</span>' +
        '</button>';
    }).join('');

    var QD2 = QUESTS.wakaeda;
    var uniqueHtml = '';
    if (id === QD2.charId && cs.unique === 'wakaeda' && !Game.isBase()) {
      uniqueHtml = '' +
        '<div class="card unique-card">' +
          '<div class="section-title">' + nbText(TEXTS.quest.smithTitle) + '</div>' +
          '<div class="req-body"><budoux-ja>' + nbText(TEXTS.quest.smithBody) + '</budoux-ja></div>' +
          (cs.uniqueOn ? '<span class="badge badge-selected">' + TEXTS.quest.inUse + '</span>' : '') +
          '<button class="btn ' + (cs.uniqueOn ? 'btn-ghost' : 'btn-primary') + ' btn-block" data-action="toggleUnique" data-on="' + (cs.uniqueOn ? '0' : '1') + '" type="button">' +
            (cs.uniqueOn ? TEXTS.quest.normalBtn : TEXTS.quest.useBtn) + '</button>' +
        '</div>';
    }
    var uniqueUsing = id === QD2.charId && cs.unique === 'wakaeda' && cs.uniqueOn && !Game.isBase();
    var weaponHtml = '' +
      '<div class="card smith-weapon">' +
        '<div class="char-portrait weapon-portrait">' + portraitImg(weaponSprite, def.weapon) + '</div>' +
        '<div>' +
          (uniqueUsing
            ? '<div class="smith-weapon-name">' + esc(QD2.weaponName) + '</div><div class="smith-weapon-stage">ユニーク武器</div>'
            : '<div class="smith-weapon-name">' + esc(def.weapon) + '</div>' +
              '<div class="smith-weapon-stage">段階 ' + cs.weapon + ' / ' + BALANCE.maxWeaponMock + '</div>') +
        '</div>' +
      '</div>' +
      '<button class="btn btn-primary btn-block" data-action="upgradeWeapon" type="button">' +
        (atMax ? '鍛える（体験版はここまで）' : '鍛える（笹' + BALANCE.costs.weapon + '）') +
      '</button>' + uniqueHtml;
    var elementHtml = '' +
      '<div class="card smith-elements">' +
        '<div class="section-title">属性　現在：' + (cs.elem ? esc(ELEMENTS[cs.elem].name) : 'なし') + '</div>' +
        '<div class="elem-list">' + elemHtml + '</div>' +
      '</div>';
    var panelHtml = smithTab === 'armor' ? renderArmor() : (smithTab === 'element' ? elementHtml : weaponHtml);

    function tabButton(tab, label) {
      var active = smithTab === tab;
      return '<button class="btn btn-ghost smith-tab' + (active ? ' smith-tab-active' : '') + '" data-action="smithTab" data-tab="' + tab + '" aria-selected="' + active + '" type="button">' + label + '</button>';
    }

    return '' +
      '<div class="screen screen-smith">' +
        backBar('かじ屋') +
        '<div class="smith-tabs" role="tablist" aria-label="かじ屋の品ぞろえ">' +
          tabButton('weapon', '武器') + tabButton('element', '属性') + tabButton('armor', 'お守り') +
        '</div>' +
        '<div class="smith-tab-panel">' + panelHtml + '</div>' +
      '</div>';
  }

  // ---------- 画面：修練場 ----------
  function renderTrain() {
    var S = Game.state, id = S.selected, def = Game.charDef(id), cs = Game.charState(id);
    var need = BALANCE.xpNeed(cs.lv);
    var pct = Math.max(0, Math.min(100, Math.round((cs.xp / need) * 100)));

    return '' +
      '<div class="screen screen-train">' +
        backBar('修練場') +
        '<div class="card train-status' + (trainFlash ? ' level-flash' : '') + '">' +
          '<div class="train-char">' + esc(def.name) + '　Lv' + cs.lv + '　SP' + cs.sp + '</div>' +
          '<div class="xp-bar"><div class="xp-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="xp-bar-text">' + cs.xp + ' / ' + need + '</div>' +
        '</div>' +
        '<button class="btn btn-primary btn-block" data-action="train" type="button">' +
          '特訓する（笹' + BALANCE.costs.train + '→経験値' + BALANCE.trainXp + '）' +
        '</button>' +
      '</div>';
  }

  // ---------- 画面：スキルの木 ----------
  function renderTree() {
    var cs = Game.charState(Game.state.selected);

    var cols = TREE_BRANCH_ORDER.map(function (b) {
      var tree = TREES[b];
      var nodesHtml = tree.nodes.map(function (node, idx) {
        var done = idx < cs.nodes[b];
        var prereqMet = idx === cs.nodes[b];
        var blockedByKeystone = prereqMet && idx === 4 && !!cs.keystone;
        var ready = prereqMet && !blockedByKeystone;
        var locked = !done && !prereqMet;
        var cls = 'tree-node' +
          (done ? ' done' : '') +
          (ready ? ' ready' : '') +
          (blockedByKeystone ? ' blocked' : '') +
          (locked ? ' locked' : '') +
          (idx === 4 ? ' keystone' : '');
        var attrs = prereqMet ? ' data-action="buyNode" data-branch="' + b + '"' : '';
        return '' +
          '<div class="' + cls + '"' + attrs + '>' +
            '<div class="tree-node-name">' + esc(node.n) + '</div>' +
            '<div class="tree-node-desc"><budoux-ja>' + esc(node.d) + '</budoux-ja></div>' +
            '<div class="tree-node-cost">SP' + node.sp + '</div>' +
          '</div>';
      }).join('');
      return '' +
        '<div class="tree-col">' +
          '<div class="tree-col-head">' + esc(tree.icon) + ' ' + esc(tree.name) + '</div>' +
          nodesHtml +
        '</div>';
    }).join('');

    return '' +
      '<div class="screen screen-tree">' +
        backBar('スキルの木') +
        '<div class="card tree-sp">SP残り：' + cs.sp + '</div>' +
        '<div class="tree-cols">' + cols + '</div>' +
        '<button class="btn btn-ghost btn-block" data-action="respec" type="button">振り直し（笹' + BALANCE.costs.respec + '）</button>' +
      '</div>';
  }

  // ---------- お守り（かじ屋のタブ） ----------
  function renderArmor() {
    var S = Game.state, selId = S.selected, def = Game.charDef(selId), cs = Game.charState(selId);
    var current = cs.armorId ? Game.itemById(cs.armorId) : null;

    var currentHtml = current
      ? (
          '<div class="armor-current-info">' +
            '<span class="badge rarity-' + current.rarity + '">' + current.rarity + '</span>' +
            '<span class="armor-current-name">' + esc(current.name) + '</span>' +
            '<span class="armor-current-stat">' + esc(current.stat) + '</span>' +
          '</div>' +
          '<button class="btn btn-ghost armor-unequip-btn" data-action="unequipArmor" type="button">はずす</button>'
        )
      : '<div class="armor-current-empty">なし</div>';

    var invHtml = S.inventory.map(function (item) {
      var equippedBySelf = cs.armorId === item.id;
      var ownerId = null;
      for (var k in S.owned) {
        if (S.owned[k].armorId === item.id) { ownerId = k; break; }
      }
      var ownerOther = (ownerId && ownerId !== selId) ? Game.charDef(ownerId) : null;

      var compareHtml = equippedBySelf ? '' :
        '<div class="armor-item-compare">' + esc(item.stat) + ' ← いま：' + (current ? esc(current.stat) : 'なし') + '</div>';

      var actionHtml = equippedBySelf
        ? '<span class="badge badge-selected armor-item-action">装備中</span>'
        : '<button class="btn btn-ghost armor-item-action" data-action="equipArmor" data-item="' + item.id + '" type="button">装備</button>';

      return '' +
        '<div class="card armor-item' + (equippedBySelf ? ' armor-item-equipped' : '') + '">' +
          '<div class="armor-item-head">' +
            '<span class="badge rarity-' + item.rarity + '">' + item.rarity + '</span>' +
            '<span class="armor-item-name">' + esc(item.name) + '</span>' +
          '</div>' +
          '<div class="armor-item-stat">' + esc(item.stat) + '</div>' +
          compareHtml +
          (ownerOther ? '<div class="armor-item-owner">（' + esc(ownerOther.name) + 'が装備中）</div>' : '') +
          actionHtml +
        '</div>';
    }).join('');

    return '' +
      '<div class="card armor-card">' +
        '<div class="section-title">お守り　' + esc(def.name) + '（在庫' + S.inventory.length + '/' + ARMOR.invMax + '）</div>' +
        '<div class="armor-current">' + currentHtml + '</div>' +
        '<div class="armor-inv-list">' + (invHtml || '<div class="armor-empty-note">まだ持っていない。エリートの宝箱を探そう。</div>') + '</div>' +
      '</div>';
  }

  // ---------- 画面：なかま編成 ----------
  function renderParty() {
    var S = Game.state;
    var selectedDef = Game.charDef(S.selected);
    var selectedCs = Game.charState(S.selected);
    var selectedArmor = selectedCs.armorId ? Game.itemById(selectedCs.armorId) : null;
    var armorLineHtml = selectedArmor
      ? (
          '<span class="party-armor-owner">' + esc(selectedDef.name) + '</span>' +
          '<span class="badge rarity-' + selectedArmor.rarity + '">' + selectedArmor.rarity + '</span>' +
          '<span class="armor-current-name">' + esc(selectedArmor.name) + '</span>' +
          '<span class="armor-current-stat">' + esc(selectedArmor.stat) + '</span>'
        )
      : (
          '<span class="party-armor-owner">' + esc(selectedDef.name) + '</span>' +
          '<span class="party-armor-empty">装備なし</span>'
        );
    var armorSummaryHtml = '' +
      '<div class="card party-armor-summary">' +
        '<div class="section-title">防具（お守り）</div>' +
        '<div class="party-armor-line">' + armorLineHtml + '</div>' +
        '<button class="btn btn-primary btn-block" data-action="openPartyArmor" type="button">お守りを装備する</button>' +
      '</div>';
    var cardsHtml = CHARS.filter(function (c) { return !!S.owned[c.id]; }).map(function (def) {
      var cs = Game.charState(def.id);
      var playable = Game.playable(def.id);
      var selected = S.selected === def.id;
      var mockReady = MOCK_ATK_TYPES.indexOf(def.atkType) !== -1;
      var atkLabel = (ATK_LABEL[def.atkType] || def.atkType) + (mockReady ? '' : '（加勢のみ）');

      return '' +
        '<div class="card party-card' + (selected ? ' party-selected' : '') + '">' +
          '<div class="char-portrait rarity-' + def.rarity + '">' + portraitImg(pandaPortraitURL(def.id, 3), def.name) + '</div>' +
          '<div class="party-info">' +
            '<div class="party-name-row">' +
              '<span class="party-name">' + esc(def.name) + '</span>' +
              '<span class="badge rarity-' + def.rarity + '">' + def.rarity + '</span>' +
              (selected ? '<span class="badge badge-selected">選択中</span>' : '') +
              (cs.rescued ? '<span class="badge badge-rescued">夢から醒めた</span>' : '') +
            '</div>' +
            '<div class="party-sub">Lv' + cs.lv + '　' + esc(def.weapon) + '　段階' + cs.weapon + '</div>' +
            '<div class="party-atk">' + esc(atkLabel) + '</div>' +
            '<div class="party-combat-copy">通常：' + esc(def.normalAttack || '') + '<br>必殺：' + esc(def.special || '') + '<br>得意：' + esc(def.favorable || '') + '<br>操作感：' + esc(def.feel || '') + '</div>' +
            '<div class="party-desc">' + esc(def.desc) + '</div>' +
          '</div>' +
          (playable
            ? '<button class="btn btn-ghost party-select-btn" data-action="selectChar" data-char="' + def.id + '" type="button">' + (selected ? '選択中' : '選ぶ') + '</button>'
            : '<span class="badge badge-soon party-select-btn">加勢で参戦</span>') +
        '</div>';
    }).join('');

    return '' +
      '<div class="screen screen-party">' +
        backBar('なかま') +
        armorSummaryHtml +
        '<p class="party-ally-note"><budoux-ja>' + esc(TEXTS.allyNote) + '</budoux-ja></p>' +
        '<div class="party-list">' + cardsHtml + '</div>' +
      '</div>';
  }

  function questCardHtml(r) {
    var q = r && r.quest; if (!q || q.state === 'owned') return '';
    if (q.state === 'done') {
      return '<div class="card quest-card quest-done"><div class="quest-head">' + esc(TEXTS.quest.doneTitle) + '</div>' +
        '<p class="quest-line"><budoux-ja>' + nbText(TEXTS.quest.doneLine1) + '</budoux-ja></p>' +
        '<p class="quest-line"><budoux-ja>' + nbText(TEXTS.quest.doneLine2) + '</budoux-ja></p></div>';
    }
    return '<div class="card quest-card"><div class="quest-head">' + nbText(TEXTS.quest.resultTitle) + '</div>' +
      '<p class="quest-line"><budoux-ja>' + nbText(TEXTS.quest.resultBody) + '</budoux-ja></p>' +
      '<div class="quest-best">' + esc(TEXTS.quest.resultBest(q.best)) + '</div></div>';
  }

  // ---------- 画面：結果 ----------
  function renderResult(r) {
    r = r || {};
    var win = !!r.win;
    var dropsHtml = (r.drops || []).map(function (d) {
      return '<span class="badge drop-chip rarity-' + d.rarity + '">' + esc(d.name) + '　' + esc(d.stat) + '</span>';
    }).join('');
    var rescuedDef = r.rescued ? Game.charDef(r.rescued) : null;
    var sasaGain = (r.sasaTotal != null ? r.sasaTotal : r.sasa) || 0;

    return '' +
      '<div class="screen screen-result">' +
        '<div class="result-title ' + (win ? 'result-win' : 'result-lose') + '">' +
          (win ? '淵を踏破した' : '灯りは消えない——持ち帰ったもの') +
        '</div>' +
        (rescuedDef ? (
          '<div class="card rescued-card">' +
            '<div class="char-portrait">' + portraitImg(pandaPortraitURL(r.rescued, 4, { eyes: 'closed' }), rescuedDef.name) + '</div>' +
            '<div class="rescued-text"><budoux-ja>' + esc(TEXTS.rescued(rescuedDef.name)) + '</budoux-ja></div>' +
          '</div>'
        ) : '') +
        questCardHtml(r) +
        '<div class="card result-stats">' +
          '<div class="result-row"><span>笹</span><span>+' + sasaGain + '</span></div>' +
          '<div class="result-row"><span>経験値</span><span>+' + (r.xp || 0) + (r.levelUps ? '（レベルアップ ×' + r.levelUps + '）' : '') + '</span></div>' +
          '<div class="result-row"><span>撃破数</span><span>' + (r.kills || 0) + '</span></div>' +
          '<div class="result-row"><span>時間</span><span>' + Math.floor(r.time || 0) + '秒</span></div>' +
        '</div>' +
        (dropsHtml ? (
          '<div class="card result-drops">' +
            '<div class="section-title">ドロップ</div>' +
            '<div class="drop-list">' + dropsHtml + '</div>' +
            '<div class="result-drops-note">持ち帰った（かじ屋のお守りタブで装備できる）</div>' +
          '</div>'
        ) : '') +
        '<div class="result-buttons">' +
          '<button class="btn btn-ghost btn-block" data-action="nav" data-to="village" type="button">村へ戻る</button>' +
          (win && r.floor >= BALANCE.maxFloorMock
            ? '<button class="btn btn-primary btn-block" data-action="nav" data-to="ending" type="button">' + esc(TEXTS.ending.resultBtn) + '</button>'
            : win
            ? '<button class="btn btn-primary btn-block" data-action="startRun" data-floor="' + (r.floor + 1) + '" type="button">' + esc(TEXTS.ending.next) + '</button>'
            : '<button class="btn btn-primary btn-block" data-action="startRun" data-floor="' + r.floor + '" type="button">もう一度潜る</button>') +
        '</div>' +
      '</div>';
  }

  // ---------- 画面：このモックについて ----------
  function renderAbout() {
    var lines = (TEXTS.about || []).map(function (t) { return '<p class="about-line">' + esc(t) + '</p>'; }).join('');
    var closeTo = prevScreen || 'village';
    return '' +
      '<div class="screen screen-about">' +
        '<div class="card about-card">' + lines + '</div>' +
        '<button class="btn btn-ghost btn-block" data-action="nav" data-to="playlog" type="button">' + esc(TEXTS.playLog.title) + '</button>' +
        '<button class="btn btn-primary btn-block" data-action="nav" data-to="' + closeTo + '" type="button">閉じる</button>' +
      '</div>';
  }

  // ---------- 画面：試遊の記録 ----------
  function boostName(id) {
    for (var i = 0; i < RUN_BOOSTS.length; i++) if (RUN_BOOSTS[i].id === id) return RUN_BOOSTS[i].name;
    return id;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function buildLogRows() {
    var a = Game.logRead(), rows = [], cur = null;
    for (var i = 0; i < a.length; i++) {
      var e = a[i];
      if (e.type === 'runStart') {
        if (cur && cur.shownT && !cur.gap) cur.gap = Math.round((e.t - cur.shownT) / 1000) + '秒';
        var d = new Date(e.t);
        var def = Game.charDef(e.char);
        cur = { start: (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()),
                charName: def ? def.name : e.char, floor: e.floor, result: '—', battle: '—', gap: '—', picks: [], base: !!e.base, shownT: 0 };
        rows.push(cur);
      } else if (!cur) { continue; }
      else if (e.type === 'choice') { cur.picks.push(boostName(e.picked)); }
      else if (e.type === 'runEnd') { cur.result = e.win ? '勝ち' : '負け'; cur.battle = Math.round(e.time) + '秒'; }
      else if (e.type === 'resultShown') { cur.shownT = e.t; }
    }
    return rows;
  }
  function renderPlayLog() {
    var rows = buildLogRows().reverse();
    var html = rows.map(function (r) {
      return '<div class="log-row">' +
        '<b>開始</b><span>' + esc(r.start) + (r.base ? '（比較用）' : '') + '</span>' +
        '<b>キャラ</b><span>' + esc(r.charName) + '</span>' +
        '<b>階</b><span>第' + esc(r.floor) + '階</span>' +
        '<b>結果</b><span>' + esc(r.result) + '</span>' +
        '<b>戦闘</b><span>' + esc(r.battle) + '</span>' +
        '<b>結果→次の出発</b><span>' + esc(r.gap) + '</span>' +
        '<b>選んだ強化</b><span>' + (r.picks.length ? esc(r.picks.join('、')) : '—') + '</span>' +
      '</div>';
    }).join('');
    return '' +
      '<div class="screen screen-playlog">' +
        '<div class="topbar"><button class="btn btn-ghost btn-back" data-action="logBack" type="button">← もどる</button>' +
          '<div class="topbar-title">' + esc(TEXTS.playLog.title) + '</div><div class="sasa-tag"></div></div>' +
        '<div class="card">' + (html || '<p class="about-line">' + esc(TEXTS.playLog.empty) + '</p>') + '</div>' +
        '<button class="btn btn-primary btn-block" data-action="copyLog" type="button">' + esc(TEXTS.playLog.copy) + '</button>' +
        '<textarea id="logText" class="log-text" readonly></textarea>' +
        '<p class="about-line"><budoux-ja>' + esc(TEXTS.playLog.note) + '</budoux-ja></p>' +
      '</div>';
  }

  var RENDERERS = {
    playlog: renderPlayLog,
    title: renderTitle, guide: renderGuide, village: renderVillage, guild: renderGuild, smith: renderSmith,
    train: renderTrain, tree: renderTree, party: renderParty, result: renderResult, about: renderAbout, intro: renderIntro, ending: renderEnding,
  };

  // ---------- 描画 ----------
  function pickGuildLine() {
    var arr = TEXTS.meimeiGuild || [''];
    return pick(arr);
  }

  function draw(name, params) {
    var fresh = name !== currentScreen;
    if (fresh) {
      prevScreen = currentScreen;
      if (name === 'guild') { guildLine = pickGuildLine(); gachaResult = null; }
      if (name === 'smith') {
        smithTab = params && (params.tab === 'weapon' || params.tab === 'element' || params.tab === 'armor')
          ? params.tab
          : 'weapon';
      }
      if (name === 'train') { trainFlash = false; }
      if (name === 'party' && typeof Game.ackCampArrivals === 'function') { Game.ackCampArrivals(); }
    }
    currentScreen = name;
    currentParams = params;
    var menu = document.getElementById('menu');
    if (!menu) return;
    var fn = RENDERERS[name];
    var keep = fresh ? null : focusMemo();
    menu.innerHTML = (fn ? fn(params) : '') + '<div id="uiToast" class="ui-toast"></div>';
    var hintHtml = kbdHint(name);   // 紙のページ（.screen）の中の下に置く。外に出すと紙のふちに重なる
    if (hintHtml) (menu.querySelector('.screen') || menu).insertAdjacentHTML('beforeend', hintHtml);
    menu.querySelectorAll('[data-action]:not(button)').forEach(function (el) { el.tabIndex = 0; el.setAttribute('role', 'button'); });
    if (fresh) kbdGuardUntil = performance.now() + 250;   // 入ったときのキーがそのまま決定にならないように
    if (kbdUsed) focusItem(focusFromMemo(keep) || defaultItem());
  }

  function redraw() { draw(currentScreen, currentParams); }

  // ---------- アクション処理 ----------
  function withLock(fn) {
    if (inputLocked) return;
    inputLocked = true;
    try { fn(); } finally { setTimeout(function () { inputLocked = false; }, 220); }
  }

  // 画面の移動。表紙（タイトル）→ 村 と 結果 → 村 だけは、今の画面の紙がめくれる（表紙は開く）。
  // 村へ入るこの2つのときだけ、村の建物が起き上がる（施設のメニューを閉じて村へ戻るときは起き上がらない）。ほかは今までどおり
  function navTo(to) {
    var cover = currentScreen === 'title' && (to === 'village' || to === 'intro');
    if (currentScreen === 'intro') { Game.state.flags.introSeen = true; Game.save(); }
    if (cover || currentScreen === 'result' || currentScreen === 'intro' || currentScreen === 'ending') {
      Book.turn(function () {
        Game.show(to);
        if (to === 'village' && window.Village3D && Village3D.popUp) Village3D.popUp();
      }, { cover: cover });
    } else {
      Game.show(to);
    }
  }

  function handleAction(action, ds) {
    switch (action) {
      case 'nav':
        if (currentScreen === 'result') Game.log('resultClosed', { to: ds.to });
        navTo(ds.to);
        break;

      case 'toggleUnique': {
        var ru = Game.actions.toggleUnique(ds.on === '1');
        if (ru && ru.err) toast(ru.err);
        redraw();
        break;
      }

      case 'logBack':
        Game.show(prevScreen && prevScreen !== 'playlog' ? prevScreen : 'title');
        break;

      case 'copyLog': {
        var json = JSON.stringify(Game.logRead());
        var ta = document.getElementById('logText');
        var showText = function () { if (ta) { ta.value = json; ta.style.display = 'block'; ta.focus(); ta.select(); } };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(json).then(function () { toast('コピーしました'); }, showText);
          } else showText();
        } catch (err) { showText(); }
        break;
      }

      case 'postX': {
        var E = TEXTS.ending, here = /github\.io$/.test(location.hostname) ? '\n' + location.origin + location.pathname : '';
        var w = null;
        try { w = window.open('https://x.com/intent/post?text=' + encodeURIComponent(E.postText + here), '_blank'); if (w) w.opener = null; } catch (err) {}
        if (!w) toast(E.blocked);
        break;
      }

      case 'skipTutorial':
        if (Game.skipTutorial) Game.skipTutorial();
        toast('あそびかたはいつでも見られます');
        redraw();
        break;

      case 'startRun': {
        if (currentScreen === 'result') Game.log('resultClosed', { to: 'again' });
        var r1 = Game.actions.startRun(Number(ds.floor));
        if (r1 && r1.err) toast(r1.err);
        break;
      }

      case 'floorAdj': {
        var base = villageFloorSel == null ? Game.state.floor : villageFloorSel;
        villageFloorSel = Math.max(1, Math.min(base + Number(ds.d), Game.state.floor));
        redraw();
        break;
      }

      case 'toggleSfx': {
        Audio3.cycle();   // 全部On → 効果音のみ → Off → 全部On
        redraw();
        break;
      }

      case 'resetData': {
        if (confirmTwice('resetData', 'もう一度押すとデータを初期化します（元に戻せません）')) {
          Game.reset();
        }
        break;
      }

      case 'gachaPull': {
        var rg = Game.actions.gachaPull();
        if (rg && rg.err) { toast(rg.err); break; }
        gachaResult = rg;
        redraw();
        // 扉が開いてカードが見える瞬間（CSS: 扉0.5秒・カード0.45秒から0.4秒で出る）に、SR以上だけ澄んだ音
        if (rg && (rg.rarity === 'SR' || rg.rarity === 'SSR' || rg.rarity === 'UR')) setTimeout(function () { Game.sfx('gachaRare'); }, 600);
        break;
      }

      case 'closeGacha': {
        gachaResult = null;
        redraw();
        break;
      }

      case 'upgradeWeapon': {
        var rw = Game.actions.upgradeWeapon();
        if (rw && rw.err) toast(rw.err);
        redraw();
        break;
      }

      case 'smithTab': {
        if (ds.tab === 'weapon' || ds.tab === 'element' || ds.tab === 'armor') smithTab = ds.tab;
        redraw();
        break;
      }

      case 'openPartyArmor': {
        Game.show('smith', { tab: 'armor' });
        break;
      }

      case 'elemToggle': {
        var cs = Game.charState(Game.state.selected);
        var el = ds.el;
        var re;
        if (cs.elems.indexOf(el) !== -1) {
          re = Game.actions.setElement(cs.elem === el ? null : el);
        } else {
          re = Game.actions.buyElement(el);
        }
        if (re && re.err) toast(re.err);
        redraw();
        break;
      }

      case 'train': {
        var rt = Game.actions.train();
        if (rt && rt.err) { toast(rt.err); break; }
        trainFlash = !!(rt && rt.levelUps);
        redraw();
        break;
      }

      case 'buyNode': {
        var rn = Game.actions.buyNode(ds.branch);
        if (rn && rn.err) toast(rn.err);
        redraw();
        break;
      }

      case 'respec': {
        if (confirmTwice('respec', 'もう一度押すとスキルの振りをリセットします（笹' + BALANCE.costs.respec + '）')) {
          var rr = Game.actions.respec();
          if (rr && rr.err) toast(rr.err);
          redraw();
        }
        break;
      }

      case 'selectChar': {
        var rs = Game.actions.selectChar(ds.char);
        if (rs && rs.err) toast(rs.err);
        redraw();
        break;
      }

      case 'equipArmor': {
        var itemId = Number(ds.item);
        var ownerId = null;
        for (var k2 in Game.state.owned) {
          if (Game.state.owned[k2].armorId === itemId) { ownerId = k2; break; }
        }
        if (ownerId && ownerId !== Game.state.selected) {
          Game.charState(ownerId).armorId = null;   // 横取り：元の持ち主から先に外す
        }
        var rEq = Game.actions.equipArmor(itemId);
        if (rEq && rEq.err) toast(rEq.err); else toast('お守りを装備した');
        redraw();
        break;
      }

      case 'unequipArmor': {
        Game.actions.equipArmor(null);
        toast('お守りを外した');
        redraw();
        break;
      }

      default:
        break;
    }
  }

  function onMenuClick(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    e.preventDefault();
    var action = el.dataset.action;
    var ds = el.dataset;
    withLock(function () { handleAction(action, ds); });
  }

  // ---------- キーボード操作 ----------
  // メニューは毎回 innerHTML で描き直すのでフォーカスが消える。「どのボタンか」を覚えて描き直しのあとに戻す。
  // kbdUsed：最後の操作がキーか。タッチの人には選択の枠を出さない。
  var kbdUsed = false, kbdGuardUntil = 0;

  function menuVisible() {
    var menu = document.getElementById('menu');
    return !!menu && menu.style.display !== 'none';
  }
  function menuItems() {
    var menu = document.getElementById('menu');
    if (!menu) return [];
    return Array.prototype.filter.call(menu.querySelectorAll('[data-action]'), function (el) {
      return !el.disabled && el.getClientRects().length > 0;
    });
  }
  function defaultItem() {
    var items = menuItems();
    return items.filter(function (el) { return el.classList.contains('btn-primary'); })[0]
      || items.filter(function (el) { return !el.classList.contains('btn-back'); })[0]
      || items[0] || null;
  }
  function focusItem(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }
  function itemKey(el) { return JSON.stringify(el.dataset); }
  // 同じ data を持つボタン（スキルの木の同じ枝など）があるので、何番目かも覚える
  function focusMemo() {
    var cur = document.activeElement, items = menuItems();
    if (!cur || items.indexOf(cur) < 0) return null;
    var key = itemKey(cur);
    return { key: key, nth: items.filter(function (el) { return itemKey(el) === key; }).indexOf(cur) };
  }
  function focusFromMemo(memo) {
    if (!memo) return null;
    var same = menuItems().filter(function (el) { return itemKey(el) === memo.key; });
    return same[memo.nth] || same[0] || null;
  }
  // 矢印の向きにある、いちばん近いボタンへ。横のずれは縦の2倍に数えて、まっすぐ先を優先する
  function moveFocus(dx, dy) {
    var items = menuItems(), cur = document.activeElement;
    if (items.indexOf(cur) < 0) { focusItem(defaultItem()); return; }
    var a = cur.getBoundingClientRect(), best = null, bestScore = Infinity;
    items.forEach(function (el) {
      if (el === cur) return;
      var b = el.getBoundingClientRect();
      var ox = (b.left + b.width / 2) - (a.left + a.width / 2), oy = (b.top + b.height / 2) - (a.top + a.height / 2);
      var along = ox * dx + oy * dy, side = Math.abs(ox * dy) + Math.abs(oy * dx);
      if (along <= 4) return;
      var score = along + side * 2;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) focusItem(best);
  }
  function backItem() {
    var menu = document.getElementById('menu');
    return menu.querySelector('[data-action="closeGacha"]') || menu.querySelector('.btn-back')
      || menu.querySelector('[data-action="nav"][data-to="village"]');
  }
  var MOVE_KEYS = {
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  };
  function onMenuKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    kbdUsed = true;
    if (!menuVisible()) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    var move = MOVE_KEYS[e.code], c = e.code;
    var isOk = c === 'Enter' || c === 'NumpadEnter' || c === 'Space' || c === 'KeyE';
    var isBack = c === 'Escape' || c === 'KeyQ' || c === 'Backspace';
    if (!move && !isOk && !isBack && c !== 'KeyM') return;
    e.preventDefault();
    if (window.Book && Book.isTurning && Book.isTurning()) return;
    if (move) { moveFocus(move[0], move[1]); return; }
    if (e.repeat || performance.now() < kbdGuardUntil) return;
    if (c === 'KeyM') { if (window.Audio3) { Audio3.cycle(); redraw(); } return; }
    if (isBack) { var back = backItem(); if (back) back.click(); return; }
    // 戦闘の最後に必殺の Space を連打していても、結果の画面を勝手に閉じない
    if (currentScreen === 'result' && c === 'Space') return;
    var items = menuItems(), cur = document.activeElement;
    var target = items.indexOf(cur) >= 0 ? cur : defaultItem();
    if (target) target.click();
  }
  function kbdHint(name) {
    if (name === 'title' || window.isTouchDevice()) return '';
    return '<p class="kbd-hint">矢印：<wbr>選ぶ　Enter：<wbr>決定　Esc：<wbr>もどる　H：<wbr>操作</p>';
  }

  // ---------- 操作の一覧（H／F1・PCの「？」ボタン） ----------
  // 村・メニュー・戦闘はそれぞれ別のキー受付を持つので、一覧が開いているあいだは先に受けて下へ通さない（capture）
  var helpEl = null;
  function helpVisible() { return !!helpEl && helpEl.style.display !== 'none'; }
  function setHelp(on) {
    if (!helpEl) return;
    helpEl.style.display = on ? 'flex' : 'none';
    if (window.Run && Run.setHelpPaused) Run.setHelpPaused(on);
  }
  function onHelpKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    var c = e.code, isHelp = c === 'KeyH' || c === 'F1';
    if (helpVisible()) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat && (isHelp || c === 'Escape' || c === 'Enter' || c === 'NumpadEnter' || c === 'Space' || c === 'KeyE')) setHelp(false);
      return;
    }
    if (!isHelp || e.repeat) return;
    e.preventDefault();                               // F1 でブラウザのヘルプが開かないように
    if (window.Book && Book.isTurning && Book.isTurning()) return;
    e.stopImmediatePropagation();
    setHelp(true);
  }
  function setupHelp() {
    var app = document.getElementById('app');
    var body = (window.KEY_HELP || []).map(function (sec) {
      return '<section class="kh-sec"><h3>' + esc(sec.title) + '</h3><dl>' + sec.rows.map(function (r) {
        return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
      }).join('') + '</dl></section>';
    }).join('');
    helpEl = document.createElement('div');
    helpEl.id = 'keyHelp'; helpEl.style.display = 'none';
    helpEl.setAttribute('role', 'dialog'); helpEl.setAttribute('aria-label', '操作の一覧');
    helpEl.innerHTML = '<div class="kh-box"><h2>操作の一覧</h2>' + body + '<button class="kh-close" type="button">閉じる（H）</button></div>';
    app.appendChild(helpEl);
    // 押した指で村や戦闘のスティックが始まらないように止める
    helpEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    helpEl.querySelector('.kh-close').addEventListener('click', function () { setHelp(false); });
    window.addEventListener('keydown', onHelpKey, true);
    if (window.isTouchDevice()) return;               // スマホにはキーが無いのでボタンを出さない
    var btn = document.createElement('button');
    btn.id = 'btnHelp'; btn.type = 'button'; btn.textContent = '操作 H'; btn.tabIndex = -1;
    btn.title = '操作の一覧（H）'; btn.setAttribute('aria-label', '操作の一覧');
    btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function () { setHelp(!helpVisible()); });
    var info = document.getElementById('hudInfo');   // 戦闘の上の行の右端。村は村の札、メニューは下の案内から開く
    if (info) info.appendChild(btn);
  }

  // ---------- 公開API ----------
  // 紙のメニューの色：'a' 夜の紙／'b' 灯りに照らされた紙。BOOK.skin が既定、URL の skin=a|b で切り替えて比べられる（CSS は #app[data-skin] で見る）
  function applySkin() {
    var skin = (window.BOOK && BOOK.skin) || 'b';
    try { var q = new URLSearchParams(location.search).get('skin'); if (q === 'a' || q === 'b') skin = q; } catch (e) {}
    if (skin !== 'a' && skin !== 'b') skin = 'b';
    var app = document.getElementById('app');
    if (app) app.setAttribute('data-skin', skin);
  }

  UI.toggleHelp = function () { setHelp(!helpVisible()); };   // 村の「操作 H」の札から呼ぶ

  UI.init = function () {
    var menu = document.getElementById('menu');
    if (!menu) return;
    applySkin();
    ensureArmorStyles();
    menu.addEventListener('click', onMenuClick);
    window.addEventListener('keydown', onMenuKey);
    window.addEventListener('pointerdown', function () { kbdUsed = false; });
    setupHelp();
  };

  UI.show = function (name, params) { draw(name, params); };

  window.UI = UI;
})();
