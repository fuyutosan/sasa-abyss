// ササノアビス モックアップ - データ定義（担当：メイメイ）
// パレット・バランス・キャラ・スキルツリー・テキストの正本。ロジックは書かない。

window.PAL = {
  bgTop: '#100818', bgBottom: '#221230', ground: '#30203A', groundLit: '#3A2A46',
  cloak: '#563C6A', cloakShadow: '#3A2848', cloakEdge: '#7A5C92',
  light: '#FFC46A', lightHi: '#FFF0C8', lightShadow: '#C47C3A',
  white: '#F0EAF4', whiteShadow: '#C8BED4', whiteDark: '#9E92AE',
  ink: '#1A1220', inkSoft: '#302436',
  cheek: '#DA8C96',
  leather: '#76543A', leatherShadow: '#4E3626',
  sasa: '#688660', sasaShadow: '#445C42',
  // 澱（敵）は背景の補色側＝青緑〜白で浮かせる（企画書§6-4）
  ori: '#4E8E86', oriShadow: '#35625D', oriEye: '#FF6060',
  kumo: '#B8B4C8', kumoShadow: '#8E8AA2',
  tosshin: '#5A9E7A', tosshinShadow: '#3E6E54',
  hakite: '#6A7EA8', hakiteShadow: '#485878',
  elite: '#E8B84A',
  rarity: { N: '#7FA86A', R: '#5A8ED0', SR: '#C0C4D4', SSR: '#E8B84A', UR: '#C77DFF' },
};

window.BALANCE = {
  player: { hp: 60, speed: 78, radius: 9, iframe: 0.75, magnet: 90, chestMagnet: 60, aimPad: 14 },   // aimPad＝歩いていても、攻撃の届く広さ＋この値の中に敵がいればそちらへ振る
  village: { walkSpeed: 110, signApproachPad: 40, treeSignApproachPad: 82 },
  characterDisplay: { combatPlayerSize: 64, villagePlayerSize: 64, villageNpcSize: 44 },
  xpNeed: lv => 200 + 160 * (lv - 1),   // 永続レベル（2026-10-16 作者試遊：4回の探索でLv28→スキルの木が埋まった。クリア8回前後で埋まる重さに）。既存セーブのレベルは下げない
  runXpNeed: lv => 18 + 14 * (lv - 1) + 2 * (lv - 1) * (lv - 1),   // 探索中だけの必要経験値。序盤は元のxpNeedと同じ速さ、後半だけ重くする（2026-10-16 作者試遊：40×(2lv−1)では85秒・約150xpで1回しか上がらず、回復も減って倒れた）。永続レベルの xpNeed とは別
  spawn: { base: 0.8, ramp: 0.028, cap: 160, stressCap: 220, stressHpMul: 8 },   // stressHpMul：?stress=1 のときだけ敵を倒れにくくし、同時160体以上を保つ（性能の測定用）
  bossAt: 210,            // 通常プレイは約3〜4分。?auto=1/stress=1 はRun側で短縮
  // 2026-10-16 作者試遊：2回とも約80秒で押し切られた → 澱・はぐれ雲をともしびの一振り（攻撃12）で倒せるHPに（刈る快感の主役）
  enemies: {
    ori:     { hp: 12, speed: 24, dmg: 6,  r: 7,  xp: 2, sasaCh: 0.35 },
    kumo:    { hp: 12, speed: 18, dmg: 5,  r: 8,  xp: 3, sasaCh: 0.35 },
    tosshin: { hp: 30, speed: 20, dmg: 10, r: 8,  xp: 4, sasaCh: 0.5, chargeSpeed: 160 },
    hakite:  { hp: 22, speed: 16, dmg: 0,  r: 8,  xp: 5, sasaCh: 0.5, range: 90, orbSpeed: 55, orbDmg: 7 },
    elite:   { hpMul: 3.5, dmgMul: 2, sizeMul: 1.6, xp: 12, sasa: 15 },
    boss:    { hp: 900, dmg: 12, chargeDmg: 16, r: 22, xp: 60, sasa: 150 },
  },
  // 1〜5階は easeIn の値（序盤は一振りで倒れる・当たっても痛くない）、6階からは式（2026-11-11 作者「1層クリアにやり込みが要る。序盤はサクサク・爽快感重視で」）
  floorScale: f => { const E = BALANCE.easeIn[f]; return { hp: E ? E.hp : 1 + 0.35 * (f - 1), dmg: E ? E.dmg : 1 + 0.14 * (f - 1), reward: 1 + 0.15 * (f - 1) }; },
  easeIn: [null, { hp: 1, dmg: 0.3 }, { hp: 1, dmg: 0.45 }, { hp: 0.8, dmg: 0.6 }, { hp: 1.3, dmg: 0.8 }, { hp: 1.8, dmg: 1.0 }],
  unlockAt: { kumo: 20, tosshin: 40, hakite: 55, eliteEvery: 30 },
  special: { ringDmg: 45, ringR: 140, beamDmg: 110, beamW: 46, beamLen: 150, fieldDmg: 8, fieldHeal: 2, fieldR: 70, fieldT: 5,
             gainKill: 6, gainElite: 15, gainOrb: 1 },
  costs: { gacha: 50, weapon: 100, element: 30, train: 50, respec: 20 },
  trainXp: 150,   // 修練場（必要経験値が増えたので 40→150）
  clearBonus: 100,
  dupSasa: 30,
  maxFloorMock: 10,
  maxWeaponMock: 4,
  choiceInvuln: 0.4,       // 3択を閉じた直後の無敵（秒）
  playLogMax: 200,
};

// 戦闘中の3択（その探索のあいだだけ有効）。数値はここだけに置く。
// who: 出る相手（null=全員）／max: 上限回数（null=なし）
window.RUN_BOOSTS = [
  { id: 'atk',    name: 'ちから',     desc: '攻撃+15%',               who: null, max: null },
  { id: 'haste',  name: 'はやわざ',   desc: '攻撃の間隔-10%',         who: null, max: null },
  { id: 'reach',  name: 'ひろがり',   desc: '攻撃の範囲+15%',         who: ['arc', 'trap'], max: null },
  { id: 'multi',  name: 'かず',       desc: '攻撃の数+1',             who: ['homing', 'trap'], max: 2 },
  { id: 'swift',  name: 'かるあし',   desc: '移動の速さ+10%',         who: null, max: null },
  { id: 'vital',  name: 'いのち',     desc: '最大HP+20%・全回復',     who: null, max: null },
  { id: 'charge', name: 'ためる',     desc: '必殺ゲージのたまり+25%', who: null, max: null },
  { id: 'crit',   name: 'するどさ',   desc: '会心の出やすさ+8%',      who: null, max: 3 },
  { id: 'spPow',  name: 'おおわざ',   desc: '必殺の威力+25%',         who: null, max: null },
];

// 依頼書「枯れずの若枝」とユニーク武器
// ---- 体験版の10階（絵本の章）。階ごとに新しいものを1つ（2026-11-11）----
// dur＝門番・ボスが出るまでの秒／kinds＝出る澱（多く書くほど出やすい）／peak＝dur の時点の湧き（体/秒）
// base＝開始時の湧き（体/秒。書かない階は BALANCE.spawn.base）／eliteEvery＝エリートの間隔（秒）／xpMul＝経験値の玉の倍率／tone＝深さの色（0 枯れ紫・1 深い藍・2 黒赤）
// gate＝門番（その階の澱の大きいもの。祓うと階をぬける）／boss＝堕ちたなかま（祓うと村へ帰る）
window.FLOORS = [null,
  { title: '淵のふち',         dur: 70,  kinds: ['ori'],                              base: 1.4, peak: 3.0, eliteEvery: 22, xpMul: 2.0, tone: 0, gate: { kind: 'ori',     name: '大きな澱',       hp: 180 } },
  { title: 'はぐれ雲の道',     dur: 100, kinds: ['ori', 'ori', 'kumo'],               base: 1.2, peak: 3.6, eliteEvery: 16, xpMul: 1.6, tone: 0, gate: { kind: 'kumo',    name: '大はぐれ雲',     hp: 320 } },
  { title: '突き進むもの',     dur: 100, kinds: ['ori', 'ori', 'kumo', 'tosshin'],    base: 1.0, peak: 3.6, eliteEvery: 20, xpMul: 1.4, tone: 0, gate: { kind: 'tosshin', name: 'あばれ突進体',   hp: 400 } },
  { title: '遠くから撃つもの', dur: 110, kinds: ['ori', 'kumo', 'tosshin', 'hakite'], peak: 4.0, eliteEvery: 20, xpMul: 1.3, tone: 0, gate: { kind: 'hakite',  name: '大吐き手',       hp: 600 } },
  { title: '眠りの底',         dur: 110, kinds: ['ori', 'kumo', 'tosshin', 'hakite'], peak: 3.6, eliteEvery: 24, xpMul: 1.3, tone: 0, boss: { id: 'suyasuya',   name: '堕ちすやすや',   hp: 2200, rescue: 'suyasuya',   warn: '堕ちたなかまが目を覚ました…' } },
  { title: '澱の群れ',         dur: 110, kinds: ['ori', 'ori', 'ori', 'kumo'],        peak: 6.5, eliteEvery: 22, xpMul: 1.0, tone: 1, gate: { kind: 'ori',     name: '澱のかたまり',   hp: 1500 } },
  { title: '雲と吐き手の谷',   dur: 120, kinds: ['kumo', 'kumo', 'hakite', 'ori'],    peak: 5.0, eliteEvery: 14, xpMul: 1.0, tone: 1, gate: { kind: 'hakite',  name: '谷の吐き手',     hp: 1700 } },
  { title: 'あばれ谷',         dur: 120, kinds: ['tosshin', 'tosshin', 'ori', 'kumo'], peak: 5.0, eliteEvery: 18, xpMul: 1.0, tone: 1, gate: { kind: 'tosshin', name: '谷のあばれもの', hp: 2000 } },
  { title: '底の手前',         dur: 130, kinds: ['ori', 'kumo', 'tosshin', 'hakite'], peak: 6.5, eliteEvery: 15, xpMul: 1.0, tone: 1, gate: { kind: 'kumo',    name: '底の番人',       hp: 2600 } },
  { title: '月の沈む淵',       dur: 120, kinds: ['ori', 'kumo', 'tosshin', 'hakite'], peak: 5.0, eliteEvery: 24, xpMul: 1.0, tone: 2, boss: { id: 'otsukisama', name: '堕ちおつきさま', hp: 6500, rescue: 'otsukisama', warn: '月が、淵の底から昇ってくる…', half: '月が、欠けていく…' } },
];
window.GATE = { sizeMul: 1.35, dmgMul: 1.3, sasa: 40, xp: 20, warn: name => name + 'が道をふさいだ' };

// ---- なかまの加勢（体験版・2026-11-11）----
// 持っているなかま（いま操作している子いがい）が、探索中の3択に「〇〇の加勢」として出る。
// えらぶと、その子の攻撃が自動で加わる。もう一度えらぶと段が上がる（3段まで・同時に3人まで）。
// 強さはその子自身の攻撃力（村での育成と武器）で決まる
window.ALLY = {
  maxLv: 3, maxAllies: 3, offerCh: 0.45,
  form: { homing: 'note', spread: 'note', summon: 'note', clone: 'note', pierce: 'blade', arc: 'blade', trap: 'trap', allround: 'trap' },
  note:  { every: 1.5, mul: 0.7 },            // 敵を追う弾（段の数だけ）
  blade: { every: 1.7, mul: 1.0 },            // 貫く刃（段の数だけ）
  trap:  { every: 2.4, mul: 1.6, r: 34 },     // 足もとの罠（段で広く・強く）
  name: n => n + 'の加勢',
  desc: { note: '敵を追う弾を放ってくれる', blade: '近い敵へ、貫く刃を放ってくれる', trap: '足もとに、祓いの罠を置いてくれる' },
  join: n => n + 'が加勢にきた！',
};

window.QUESTS = {
  wakaeda: { name: '依頼書：枯れずの若枝', eliteTarget: 5, floor: 2, charId: 'tomoshibi',
             weaponName: '枯れずの若枝', color: '#9BE07A',
             atkMul: 1.6, radiusMul: 1.25, angleAddDeg: 40,
             bladeEvery: 3, bladeR: 14, bladeLine: 5, bladeLineInner: 2, bladeSpeed: 260, bladeLife: 0.6, bladePower: 1.2 },
};

// たき火を囲む最大5席（村の論理座標・足元位置）。描画順は village.js が管理する。
window.CAMP_SEATS = [
  { x: 112, y: 354, phase: 0.10 },
  { x: 200, y: 354, phase: 0.45 },
  { x: 121, y: 310, phase: 0.70 },
  { x: 191, y: 310, phase: 0.25 },
  { x: 156, y: 382, phase: 0.90 },
];

// モック再検証の3体。各項目はUIで観察できる短い説明を持つ。
window.CHARS = [
  { id: 'tomoshibi', name: 'ともしび', rarity: '主人公', weapon: '笹の枝', atkType: 'arc',
    atk: 12, interval: 0.55, desc: '淵に最初に降りたパンダさん。右手に灯り、左手に笹。',
    normalAttack: '前方薙ぎ（近距離）', special: '灯りの波：前方へ大きく押し返す', favorable: '群れへ踏み込み、向きを合わせた時', feel: '接近・方向重視' },
  { id: 'onpu', name: 'おんぷ', rarity: 'SSR', weapon: '笛', atkType: 'homing',
    atk: 7, interval: 0.8, projN: 3, desc: '笛の音が澱をたどって飛んでいく。ながら歩きに強い。',
    normalAttack: '追尾音符（遠距離）', special: '大合唱：複数の敵を追尾・連鎖', favorable: '敵が散らばった時、移動しながら', feel: '安全・機動重視' },
  { id: 'nagareboshi', name: 'ながれぼし', rarity: 'UR', weapon: '弓', atkType: 'pierce', desc: '一直線に貫く流星の一矢。' },
  { id: 'otsukisama', name: 'おつきさま', rarity: 'UR', weapon: '満月の輪', atkType: 'allround', desc: '囲まれてからが本番。' },
  { id: 'hatsuhinode', name: 'はつひので', rarity: 'UR', weapon: '日輪', atkType: 'summon', desc: '小さな朝日が自動で戦う。' },
  { id: 'gorogoro', name: 'ごろごろ', rarity: 'SSR', weapon: 'まり', atkType: 'trap', atk: 10, interval: 1.1,
    normalAttack: 'まり罠：足元へ置き、時限／接近で起爆', special: '大まり：敵を中央へ引き寄せ大爆発', favorable: '敵をまとめて誘導した時', feel: '先読み・設置重視', desc: '置いて転がして誘い込む。' },
  { id: 'pikapika', name: 'ぴかぴか', rarity: 'SSR', weapon: '灯籠', atkType: 'spread', desc: '扇状に光をまき散らす。' },
  { id: 'hanamaru', name: 'はなまる', rarity: 'SSR', weapon: '筆', atkType: 'spread', desc: '塗った床が澱を祓う。' },
  { id: 'mikazuki', name: 'みかづき', rarity: 'SSR', weapon: '鎌', atkType: 'clone', desc: '影がひとつ、同じ軌跡をなぞる。' },
  { id: 'chacha', name: 'ちゃちゃ', rarity: 'SR', weapon: 'おたま', atkType: 'arc', desc: '世話焼きの一撃は手数が多い。' },
  { id: 'tekuteku', name: 'てくてく', rarity: 'SR', weapon: '杖', atkType: 'pierce', desc: '歩いた分だけ強くなる。' },
  { id: 'kirari', name: 'きらり', rarity: 'SR', weapon: '手鏡', atkType: 'homing', desc: '光は壁でも敵でも跳ね返る。' },
  { id: 'suyasuya', name: 'すやすや', rarity: 'SR', weapon: '枕', atkType: 'trap', desc: '眠らせてから、ゆっくり祓う。' },
  { id: 'nonbiri', name: 'のんびり', rarity: 'SR', weapon: '座布団', atkType: 'allround', desc: '慌てない。範囲は広い。' },
  { id: 'shakishaki', name: 'しゃきしゃき', rarity: 'SR', weapon: 'ほうき', atkType: 'arc', desc: '朝のひと掃きで澱まで掃く。' },
];

// ギルド紹介（ガチャ）排出率
window.GACHA = { SR: 0.72, SSR: 0.24, UR: 0.04 };

// スキルの木：3本の枝×各5ノード（5番目=極意・コスト2）
window.TREES = {
  p: { name: '力の枝', icon: '🔥', nodes: [
    { n: '腕力', d: '攻撃+10%', sp: 1 }, { n: '会心', d: '会心率+10%', sp: 1 },
    { n: '剛力', d: '攻撃+15%', sp: 1 }, { n: '闘志', d: '必殺の威力+40%', sp: 1 },
    { n: '極意・一条の波', d: '円形衝撃波に加えて、前方へ極太の波を放つ', sp: 2 } ] },
  s: { name: '拡がりの枝', icon: '🌊', nodes: [
    { n: '広がり', d: '攻撃範囲+12%', sp: 1 }, { n: '手数', d: '攻撃間隔-8%', sp: 1 },
    { n: '重ね', d: '範囲+12%・弾+1', sp: 1 }, { n: '疾さ', d: '攻撃間隔-10%', sp: 1 },
    { n: '極意・二重の輪', d: '必殺が二重の輪になる', sp: 2 } ] },
  l: { name: '灯りの枝', icon: '🕯', nodes: [
    { n: '体力', d: '最大HP+20%', sp: 1 }, { n: '灯心', d: '毎秒HP0.6回復', sp: 1 },
    { n: '軽足', d: '移動速度+10%', sp: 1 }, { n: '護り', d: '被ダメージ-15%', sp: 1 },
    { n: '極意・結界', d: '必殺がその場に残る結界になる（祓い＋回復）', sp: 2 } ] },
};

// 防具（お守り・合格ゲート版は1枠のみ）。エリートの宝箱から出る
window.ARMOR = {
  types: [
    { id: 'atk', name: 'ちからのお守り', stat: '攻撃' },
    { id: 'hp', name: 'いのちのお守り', stat: '最大HP' },
    { id: 'sp', name: 'ともしびのお守り', stat: '必殺ゲージ増加' },
    { id: 'spd', name: 'かぜのお守り', stat: '移動速度' },
  ],
  val: { SR: [8, 12], SSR: [13, 18], UR: [20, 25] },
  rarityCh: { SR: 0.7, SSR: 0.26, UR: 0.04 },
  invMax: 8,
};

window.ELEMENTS = {
  fire: { name: '灯', color: '#FF9A54', d: '当てた澱がしばらく燃え続ける' },
  ice: { name: '氷', color: '#7AC8E8', d: '当てた澱が遅くなる' },
  thunder: { name: '雷', color: '#F0E060', d: '近くの澱へ連鎖する' },
  sprout: { name: '芽', color: '#8AC87A', d: '与えたダメージの一部だけHPが戻る' },
};

window.TEXTS = {
  title: 'ササノアビス', subtitle: '淵に、灯りを。',
  meimeiGuild: [
    'おかえりなさい！ ギルド受付のメイメイだよ🐼 今日はどこまで潜る？',
    'へへへ、いい顔してるね。灯り、ちゃんと消えずに持ってる？',
    '深いところには、呑まれたなかまがいるの。……連れて帰ってあげてね。',
    '紹介できるなかま、増えてるよ！ 笹がたまったら声をかけてね。',
  ],
  meimeiFirstPull: 'この子は「おんぷ」。笛の音が澱を追いかけるの。連れていってあげてね🐼',
  meimeiCampWait: 'たき火のところで待ってるね🐼',
  requests: [
    { name: '依頼書：しずかなうた', body: '深層15階のボスを、必殺を使わずに祓うこと。——おんぷの最終武器の在り処' },
    { name: '依頼書：よあけのほうき', body: '浅層10階を3分以内に踏破すること。——しゃきしゃきの最終武器の在り処' },
  ],
  about: [
    'ササノアビスの体験版です。第10階まで遊べます。',
    '枯れた世界の淵へ、灯りをひとつ持って降りていく。澱を祓い、呑まれたなかまを連れて帰り、村で力をたくわえて、もう一段深くへ。',
    '入っているもの：第1階から第10階・門番と2体のボス・操作できるなかま3体・なかまの加勢・ギルドの紹介・かじ屋・修練場・スキルの木・依頼書とユニーク武器。',
    '絵と音は制作中のものです。つづきの章（残りのなかま・もっと深い階層・新しい武器）は、遊んでくれた人の声を聞いて作っていきます。',
    'データはこの端末のブラウザに保存されます。',
  ],
  version: '体験版 v17',
  // 初めての人が表紙の次に読む1ページ（ここから村を通らず第1階へ）
  intro: {
    lines: ['大地に、大きな淵がひらいた。', '笹は灰色に枯れ、町の灯は消えた。', '淵の底には、枯れる前の最初の笹があるという。', '灯りをひとつ持って、降りていく。'],
    howTouch: '画面をなぞって歩く。攻撃は自動。', howKey: '矢印キーかWASDで歩く。攻撃は自動。',
    go: '第1階へ潜る', skip: '先に村を見る',
  },
  // 第10階を踏破したあとのページ
  ending: {
    title: '体験版はここまで',
    lines: ['第10階まで潜ってくれて、ありがとう。', '淵はまだ深く、呑まれたなかまも、最初の笹も、この先にいる。', 'つづきを作るかどうかは、遊んでくれた人の声で決めます。ひとことでも感想をもらえると、とても助かります。'],
    friends: 'いっしょに帰ってきたなかま',
    post: '感想をXでつたえる', postText: 'ササノアビス体験版、第10階まで潜った！ #ササノアビス',
    blocked: '「#ササノアビス」をつけて感想をもらえるとうれしいです',
    back: '村へ戻る', resultBtn: 'つづきを読む', next: '次の階へ潜る',
  },
  allyNote: '選んでいない子も、探索中の3択から加勢してくれる',
  quest: {
    hud: k => '依頼　エリート ' + k + '/5',
    hudDone: '依頼　条件たっせい！門番を祓おう',
    banner: '依頼の条件を満たした——門番を祓えば若枝が手に入る',
    resultTitle: '依頼書：枯れずの若枝',
    resultBody: '第2階で、ともしびでエリート澱を5体祓い、門番まで祓うこと。',
    guildTail: '——ともしびのユニーク武器',
    resultBest: b => 'これまでの最高：' + b + '/5',
    doneTitle: '依頼達成！',
    doneLine1: 'ユニーク武器『枯れずの若枝』を手に入れた',
    doneLine2: '三振りごとに笹の刃が飛ぶ。かじ屋で持ちかえられる。',
    badgeOpen: '受付中', badgeDone: '達成',
    smithTitle: 'ユニーク武器　枯れずの若枝',
    smithBody: '根元から芽吹いた、枯れない笹の若枝。三振りごとに笹の刃が飛ぶ。',
    useBtn: '若枝を使う', normalBtn: '笹の枝に持ちかえる', inUse: '使用中',
  },
  choice: {
    title: n => 'レベル' + n + '　強化をひとつえらぶ',
    sub: 'この探索のあいだだけ有効',
    now: k => 'いま' + k + '回',
  },
  playLog: {
    title: '試遊の記録', copy: '記録をコピー', note: 'この記録はデータ初期化では消えません', empty: 'まだ記録がありません',
  },
  rescued: n => n + 'は夢から醒めた。村へ帰っていく——なかまが増えた！',
  // エリートの紙の箱（戦闘中の札）。<wbr> は手で入れた改行の候補
  box: {
    found: '出た！',
    sasa: n => '笹 +' + n,
    uniqueChip: 'ユニーク',
    uniqueName: '枯れずの<wbr>若枝の芽',
    uniqueDesc: '門番を祓えば<wbr>手に入る',
    armorName: { atk: 'ちからの<wbr>お守り', hp: 'いのちの<wbr>お守り', sp: 'ともしびの<wbr>お守り', spd: 'かぜの<wbr>お守り' },
  },
};

// 地形（world.js）。岩・石柱・石垣・水たまりの数・大きさ・当たり判定。見た目も当たり判定もここと world.js が元。
window.WORLD = {
  tile: 1024, cell: 128, clearR: 160, margin: 6, cacheTiles: 16,
  rock: { perTile: 25, size: [18, 40], rMul: 0.45 },             // 判定の半径＝見た目の大きさ×0.45
  pillar: { perTile: 4, thick: [20, 30], height: [60, 120] },    // 判定の半径＝太さの半分
  wall: { count: [1, 2], len: [160, 320], thick: 28, height: [40, 70], seg: 80 },
  puddle: { count: [1, 2], r: [50, 110] },
  puddleSlow: 0.6,                                                // 水たまりの中の移動の速さ（プレイヤーも敵も）
  slideHold: 0.5,                                                // 岩・柱・壁に止められた敵が、ふちに沿って回り込む向きを保つ秒数（2026-10-22）
  playerSolidR: 16,                                               // 主人公が岩・柱・壁にぶつかる半径。敵との当たり（P.r＝9）より広く、絵の体の幅に合わせる（2026-10-22 作者：石柱の判定が中心すぎてほぼ貫通）
  spawnMargin: 40,                                                // 画面の端から湧くときの外への余白
  spawnTopMax: 320,                                               // 奥（画面の上）から湧く距離の上限（届くまで長くなりすぎないように）
  firstWave: { n: 12, every: 0.15, dist: 260 },                   // 開始直後の第一波：澱12体を0.15秒おき、上のふち（8秒以内に会えるよう近め）
  markerInset: 18,                                                // 画面外の敵の印を置く、画面のふちからの内側
};

// 戦闘画面の3D描画（render3d.js）の数値。動きの計算には使わない。
window.RENDER3D = {
  fovDeg: 30, pitchDeg: 50,          // 視野角と見下ろし角（固定）
  // 深さの色（FLOORS の tone）：0＝枯れ紫（今まで）／1＝深い藍／2＝黒赤。地面の色み・空・環境光・月の光を付け替える
  tones: [
    { ground: '#ffffff', bg: '#100818', ambient: '#6a5a92', moon: '#9fb0ff' },
    { ground: '#8fa8ee', bg: '#060a1a', ambient: '#4f68b0', moon: '#8fb8ff' },
    { ground: '#e0908a', bg: '#140507', ambient: '#8e4a56', moon: '#ff9c8c' },
  ],
  widthMargin: 1.02,                 // プレイヤー位置で見える横幅 = logW × この値
  bg: PAL.bgTop, fogColor: '#1a0e28',
  fogNearMul: 1.0,                   // 霧の近い距離 = カメラ距離 × この値
  fogFarSpawnAdd: 60,                // 霧で地面が消える距離 = 湧き距離 + この値（地面の距離）。奥へ続く地面を見せる。湧いた敵は描画だけふわっと出す
  spawnFadeT: 0.4,                   // 湧いた敵の描画のふわっと出る時間（秒。動きの計算は変えない）
  ambient: { color: '#6a5a92', intensity: 0.55 },
  moon: { color: '#9fb0ff', intensity: 0.25 },
  lantern: { color: PAL.light, intensity: 2.2, distance: 300, decay: 1.5, height: 70 },
  pool: { radius: 125, color: '#ffffff', rgb: [0.13, 0.085, 0.052] },   // 足元の灯りの円（半径約110がはっきり明るい）
  flashLift: 0.9,                    // 白フラッシュのとき全体の光を持ち上げる量
  groundTile: 256, decorTile: 1024, decorCell: 40,
  tiltRatio: 0.5,                    // 板の傾き = 見下ろし角 × この値
  selfGlowEnemy: 0.4, selfGlowOther: 0.12,
  scenery: { rock: { perTile: 25, size: [18, 40], color: '#5c4860' }, pillar: { perTile: 4, thick: [20, 30], height: [60, 120], color: '#625670' },
             deadSasa: { perTile: 8, hMul: [0.7, 1.1], width: 44 }, keepClear: 50, cell: 128 },   // 枯れ笹は通れる飾り。背が高いと障害物に見えるので、自分の背たけ以下にする（2026-10-22 自己点検：岩・柱・壁＝ぶつかる、低いもの＝通れる）
  sizes: { chest: 16, note: 12, orb: 12, exp: 9 },
  maxInstances: { wallSeg: 110, puddle: 24, fx: 170, parts: 500, rock: 300, pillar: 60, deadSasa: 110, decorShadow: 520, enemy: 240, boss: 4, chest: 8, note: 90, eorb: 70, exp: 260, glow: 1400, shadow: 700 },
  // 紙人形のキャラ（2026-10-22 要件定義_村の3Dと紙人形）。主人公・なかま・敵・エリート・ボス・村の人が対象。笹の飾り・経験値の玉・光・弾・地形は対象外
  paper: {
    border: 3,            // 白いふちの太さ（元の絵64pxに対するpx）
    borderColor: '#FFF6E6',
    edgeColor: 'rgba(90,70,60,0.55)',  // ふちの外側の細い線（1px）
    leanDeg: 12,          // 板をカメラ側へ寝かせる角度（今は見下ろし角の半分＝25°。紙が立って見えるよう起こす）
    turnSec: 0.18,        // 振り向き（左右反転）にかける秒数
    turnMinW: 0.08,       // 振り向きの途中で一番細くなったときの幅（元の幅に対して。0にすると消えて見える）
    walkRockDeg: 5,       // 歩いているときの左右の揺れ
    walkRockHz: 3.2,      // 揺れの速さ（1秒あたり）
    backColor: '#E8DCC8', // 板の裏（振り向きの途中で見える紙の色）
    backBelowW: 0.35,     // この幅より細いあいだは、絵を backColor で塗った「紙の裏」に見せる
    enemyTurnSpeed: 8,    // 敵は左右の速さが毎秒この値(px)以上のときだけ向きを変える（細かい揺れで向きが変わらないように）
    rockStopSec: 0.15,    // 止まってから揺れが0に戻るまでの秒数
    shadowWide: 1.3,      // 主人公と村の人の足元の影を横長にする倍率
    facingDead: 0.05,     // 主人公の左右の向きは、これより小さい向きの変化では変えない
  },
  // 村の3D（village3d.js）の数値。村の論理座標（横320・縦568＋GAP）をそのまま3Dの x・z に使う（1論理px＝3Dの1）
  village: {
    pitchDeg: 52, fovDeg: 30,        // 見下ろし角と視野角（固定）。注視点は村の中心
    fitMargin: 0.96,                 // 村全体が画面のこの割合に収まる距離を、画面の縦横比から計算する
    bg: PAL.bgTop, fogColor: '#1a0e28',
    ambient: { color: '#b4aadc', intensity: 1.7 },
    moon: { color: '#a9b8ff', intensity: 0.55 },
    groundGlow: 0.7,                 // 地面の絵が自分で光る量（暗い夜でも地面の模様と石畳が見えるように）
    camp: { color: '#ffaf5f', intensity: 2.6, distance: 250, decay: 1.4, height: 26, flicker: 0.15 },   // 点光源1つ目（たき火）
    forge: { color: '#ff8237', intensity: 1.7, distance: 150, decay: 1.5, flicker: 0.08 },             // 点光源2つ目（かじ屋の炉の前）
    pool: { radius: 105, rgb: [0.12, 0.08, 0.05] },                                                    // 主人公の足元の灯り（光の板）
    guild: { depth: 48, roofH: 28, eave: 8 },
    smith: { depth: 44, roofRise: 24, eave: 7, chimneyR: 5, chimneyH: 30 },
    gate: { pillar: 12, beamH: 12 },
    campFire: { radius: 14, logR: 2.4, logLen: 26, stones: 10 },
    tent: { w: 40, d: 36, h: 30 },
    sideDarken: 0.7,                 // 建物の側面は正面の平均色をこの倍率で暗くする
    peopleGlow: 0.3,                 // 村の紙人形が自分で光る量（夜でも読めるように）
  },
};

// 本のUI（book.js・village3d.js・style.css）の数値。2026-10-24 要件定義_本のUI。ページめくり・村が起き上がる・紙のメニュー
window.BOOK = {
  turnSec: 1.5,          // ページがめくれる時間（2026-10-24 作者「1.5はページめくる速度」で 0.5→0.75→1.5）
  coverSec: 1.5,         // 表紙が開く時間（ページより速いと不自然なので、ページと同じ 1.5）
  reducedFadeSec: 0.15,  // 動きを減らす設定のときのフェード
  perspective: 1100,     // 3D 回転の奥行き（px）
  shadowMax: 0.55,       // 下の画面に落とす影の一番濃いところ
  popSec: 0.6,           // 村の建物が起き上がる全体の時間
  popStagger: 0.06,      // 建物ごとのずれ
  popPeopleDelay: 0.15,  // 人が起き上がり始めるまでの遅れ
  popAfter: 0.5,         // 切り替えてから起き上がり始めるまでの待ち。めくる紙が真横（-90°）になるのは turnSec の約42%後。そのとき起き上がりが2割ほど進んでいる値（めくり0.5秒・待ち0.08秒だったときと同じ見え方）
  skin: 'b',             // 紙のメニューの色（'a' 夜の紙／'b' 灯りに照らされた紙）。作者の選択で決める。URL の skin=a／skin=b で切り替えて比べられる
  // 村の「本のページ」（village3d.js）。村の地面の下に敷く板
  page: {
    margin: 14,                     // 村の外側の余白（論理px。上下左右とも）
    thickStep: 2.4,                 // 右と下のふちの紙の厚み（ずらした薄い板3枚の、1枚あたりのずれ）
    bindPx: 24,                     // 左のふちの綴じ目の影の幅
    colorA: '#2E2238',              // A 夜の紙：暗い紫
    colorB: '#E6D8BC',              // B 灯りに照らされた紙：クリーム色
    edgesA: ['#251B2E', '#1D1525', '#150F1C'],   // 厚みの3枚の色（だんだん暗く）
    edgesB: ['#CDBB9C', '#B7A585', '#8E7A5E'],
    glow: 0.18,                     // ページが自分で光る量（ページの色の 0.18 倍を足す。夜の光でもクリーム色の紙と分かるように）
    tintA: '#FFFFFF', tintB: '#BCBF8C',   // 夜の紫の光の当たり方を整える色（B は紫の光でくすまないよう、青を抑えて暖かく。メニューのページより暗く）
    bindAlpha: 0.9,                 // 綴じ目の影の一番濃いところ（左のふち）
  },
};

// エリートの紙の箱（run.js・style.css）の数値。2026-11-05 要件定義_報酬の山場。拾うと時間が止まり、箱のふたが開いて札が起き上がる
window.BOX = {
  flapSec: 0.35,        // ふたが開く秒
  popSec: 0.30,         // 札が起き上がる秒（ふたが開き始めて flapSec * 0.6 後に始める）
  closeSec: 0.15,       // 閉じるときの消える秒
  holdSec: { SR: 1.2, SSR: 1.6, UR: 2.0, unique: 3.0 },  // 札が起き上がってから自動で閉じるまで
  tapLockSec: 0.30,     // 開いてからこの秒はタップを受けない（誤タップで見逃さない）
  sasa: { SR: 3, SSR: 6, UR: 12, unique: 12 },           // 箱の笹。お守りとは別に増える
  afterInvuln: 0.6,     // 閉じた直後の無敵（秒）
  confetti: { SR: 0, SSR: 12, UR: 20, unique: 36 },      // 紙吹雪の枚数
};

// 音（audio.js が読む）。2026-11-03 要件定義_音。効果音は assets/audio/sfx/、曲は assets/audio/bgm/（曲は作者が試聴室で選んでから入れる。無いあいだは鳴らさない）
window.AUDIO = {
  ver: '20261105a',      // 音を差し替えたら上げる（ブラウザに残った古い音を読まないように）
  master: 1.0, sfxVol: 0.8, bgmVol: 0.45, ambVol: 0.22,
  maxVoices: 8,          // 同時に鳴らす効果音の上限
  detune: 0.04,          // 再生速度のゆらぎ（±4%）
  fadeSec: 0.8,          // BGM の入れ替わり
  minGap: { hit: 0.05, orb: 0.12, click: 0.04 },   // 同じ名前の最短間隔（秒）
  sfx: {                 // file は assets/audio/sfx/ からの相対。vol は 0〜1
    click: { file: 'click.mp3', vol: 0.5 }, deny: { file: 'deny.mp3', vol: 0.5 },
    turn: { file: 'turn.mp3', vol: 0.6 }, cover: { file: 'cover.mp3', vol: 0.7 }, dive: { file: 'dive.mp3', vol: 0.6 },
    choose: { file: 'choose.mp3', vol: 0.6 }, forge: { file: 'forge.mp3', vol: 0.7 }, equip: { file: 'equip.mp3', vol: 0.5 },
    gachaOpen: { file: 'gachaOpen.mp3', vol: 0.6 }, gachaRare: { file: 'gachaRare.mp3', vol: 0.7 },
    hit: { file: ['hit1.mp3', 'hit2.mp3', 'hit3.mp3'], vol: 0.45 },
    kill: { file: 'kill.mp3', vol: 0.55 }, killElite: { file: 'killElite.mp3', vol: 0.7 }, hurt: { file: 'hurt.mp3', vol: 0.7 },
    orb: { file: 'orb.mp3', vol: 0.4 }, chest: { file: 'chest.mp3', vol: 0.6 }, level: { file: 'level.mp3', vol: 0.7 },
    special: { file: 'special.mp3', vol: 0.8 }, elite: { file: 'elite.mp3', vol: 0.7 }, charge: { file: 'charge.mp3', vol: 0.6 },
    boss: { file: 'boss.mp3', vol: 0.9 }, win: { file: 'win.mp3', vol: 0.7 }, lose: { file: 'lose.mp3', vol: 0.7 },
  },
  bgm: {                 // 曲は §6 で決めてから入れる。無いあいだは鳴らさない（loopStart/loopEnd は秒。0 なら全体）
    village: { file: 'bgm/village.mp3', vol: 1.0, loopStart: 0, loopEnd: 0 },
    run:     { file: 'bgm/run.mp3',     vol: 1.0, loopStart: 0, loopEnd: 0 },
  },
  amb: { fire: { file: 'fire.mp3', vol: 1.0 } },   // sfx/ の下に置く
};

// キー操作の一覧（H／F1 で開く）。キーを増やしたらここも直す
window.KEY_HELP = [
  { title: '村', rows: [['矢印／WASD', '歩く'], ['E／Enter／Space', '施設に入る'], ['M', '音の切り替え']] },
  { title: '門の窓', rows: [['矢印', '階を選ぶ'], ['Enter', '潜る'], ['Esc', '閉じる']] },
  { title: 'メニュー', rows: [['矢印／WASD', '選ぶ'], ['Enter／E', '決める'], ['Esc／Q', 'もどる'], ['M', '音の切り替え']] },
  { title: '戦闘', rows: [['矢印／WASD', '歩く（攻撃は自動）'], ['Space', '必殺'], ['1・2・3', '強化を選ぶ'], ['Space／Enter', '紙の箱を閉じる']] },
  { title: 'どこでも', rows: [['H／F1', 'この一覧（戦闘は止まる）']] },
];

// タッチ端末か（指で触る画面か）。キー表示（村のE・必殺のSpace）の出し分けに、ここ1か所の関数を使い回す。
window.isTouchDevice = function () { try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
