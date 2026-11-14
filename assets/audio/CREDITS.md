# ササノアビス 効果音の出どころ（自動生成：tools/fetch_sfx.py）

- 効果音はすべて **効果音ラボ** https://soundeffect-lab.info/ の素材。規約 https://soundeffect-lab.info/agreement/ 。
  商用可・クレジット表記不要（任意）・改変可・アプリへの操作音としての同梱可。**再配布（素材そのものの配布、効果音を鳴らすことが主目的のアプリ）・直リンク・AI学習への利用は禁止。**
- 取得は各素材ページのダウンロードのリンクから行った。元ファイルは `Claude/assets/inbox/sasa-abyss-sfx/<名前>_<元の名前>.mp3`。
- 加工はすべて mono・44.1kHz・MP3、ピーク -3dB、先頭末尾の無音を切る（fire は除く）。
- 「代用」＝要件定義 §3-2 の探す言葉と違う素材で近い音を選んだもの。2026-11-05 に作者が21場面を聞き比べて選び直した。

| ファイル | 素材名 | 元のページURL | サイト | ライセンスの要点 | 代用 | 加工・長さ |
|---|---|---|---|---|---|---|
| click.mp3 | ブロックを置く（コン）（brick1.mp3） | https://soundeffect-lab.info/sound/various/various3.html | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：決定ボタン系は電子音ばかりなので、木のコンという音で代用 | 0.37秒・96kbps・5KB |
| deny.mp3 | マッチ発火失敗（しけっている）（matchstick-failure1.mp3） | https://soundeffect-lab.info/sound/various/various3.html | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：キャンセル音の代わりに、灯りがつかない音で代用 | 0.17秒・96kbps・3KB |
| turn.mp3 | ページをめくる1（page1.mp3） | https://soundeffect-lab.info/sound/various/various2.html | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | - | 0.75秒・96kbps・10KB |
| cover.mp3 | 紙を広げる1（普通に広げる）（paper-take1.mp3） | https://soundeffect-lab.info/sound/various/various2.html | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：『本を開く』が無いので、紙を広げる音で代用 | 0.88秒・96kbps・11KB |
| dive.mp3 | ダイビング（水中）（diving-underwater1.mp3） | https://soundeffect-lab.info/sound/various/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：風・洞窟の低い音の代わりに、水の中の深い音で代用 | 2.52秒・96kbps・30KB |
| choose.mp3 | 紙を広げる2（ピンと広げる）（paper-take2.mp3） | https://soundeffect-lab.info/sound/various/various2.html | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：決定音の代わりに、紙をピンと広げる音で代用 | 0.25秒・96kbps・4KB |
| forge.mp3 | 木材に釘を打つ（トントン）（wood-nail1.mp3） | https://soundeffect-lab.info/sound/various/various3.html | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：金床の代わりに、木に釘を打つ音で代用 | 1.24秒・96kbps・15KB |
| equip.mp3 | 刀を鞘にしまう2（チャイン）（katana-storage2.mp3） | https://soundeffect-lab.info/sound/battle/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：金属が軽く触れる音の代わりに、刀を鞘に収める金属音で代用 | 0.64秒・96kbps・8KB |
| gachaOpen.mp3 | 引き出しを開ける（木製）（drawer-open1.mp3） | https://soundeffect-lab.info/sound/various/various3.html | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | - | 0.59秒・96kbps・8KB |
| gachaRare.mp3 | 鈴を鳴らす（シャン）（bell1.mp3） | https://soundeffect-lab.info/sound/anime/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | - | 1.25秒・96kbps・16KB |
| hit1.mp3 | 弓矢が刺さる（ドスッ）（arrow-pierce1.mp3） | https://soundeffect-lab.info/sound/battle/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：打撃音の代わりに、矢が刺さる音で代用 | 0.31秒・96kbps・4KB |
| hit2.mp3 | 軽いキック（kick-light1.mp3） | https://soundeffect-lab.info/sound/battle/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | - | 0.50秒・96kbps・7KB |
| hit3.mp3 | 軽いパンチ（punch-light1.mp3） | https://soundeffect-lab.info/sound/battle/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | - | 0.55秒・96kbps・7KB |
| kill.mp3 | 紙を破く2（素早く破く）（paper-tear2.mp3） | https://soundeffect-lab.info/sound/various/various2.html | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | - | 0.39秒・96kbps・6KB |
| killElite.mp3 | 服が破ける（ビリーッ）（clothes-torn1.mp3） | https://soundeffect-lab.info/sound/various/various3.html | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | - | 0.63秒・96kbps・8KB |
| hurt.mp3 | 壁をドンと叩く（木の壁）（wall-hit1.mp3） | https://soundeffect-lab.info/sound/various/various3.html | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：ダメージ系は電子音なので、くぐもった木の壁を叩く音で代用 | 0.48秒・96kbps・6KB |
| orb.mp3 | 水滴1（ピッ）（water-drop1.mp3） | https://soundeffect-lab.info/sound/various/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：コイン小の代わりに、水滴ひとつの音で代用 | 0.03秒・96kbps・1KB |
| chest.mp3 | 宝箱を開ける（パカッ）（treasure-chest1.mp3） | https://soundeffect-lab.info/sound/anime/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | - | 0.61秒・96kbps・8KB |
| level.mp3 | ステータス上昇魔法2（上昇するイメージ）（magic-statusup2.mp3） | https://soundeffect-lab.info/sound/battle/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：『レベルアップ』はファンファーレ調（テッテレー）なので使わず、上昇する魔法音で代用 | 1.51秒・96kbps・18KB |
| special.mp3 | 風魔法1（かまいたち）（magic-wind1.mp3） | https://soundeffect-lab.info/sound/battle/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：衝撃波の代わりに、風の魔法で代用 | 0.96秒・96kbps・12KB |
| elite.mp3 | 怪獣の足音（ズシン）（monster-footstep1.mp3） | https://soundeffect-lab.info/sound/battle/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：和太鼓をやめて、地響きのある足音で代用 | 1.29秒・96kbps・16KB |
| charge.mp3 | 弓矢を放つ（ヒュッ）（arrow-release1.mp3） | https://soundeffect-lab.info/sound/battle/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | - | 0.49秒・96kbps・6KB |
| boss.mp3 | 地響き（earth-tremor1.mp3） | https://soundeffect-lab.info/sound/battle/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：和太鼓をやめて、地響きで代用 | 素材の5.2〜7.9秒だけ使い、頭と終わりを短くフェード。2.70秒・96kbps・32KB |
| win.mp3 | ピアノの単音（深い響き）（piano-single1.mp3） | https://soundeffect-lab.info/sound/anime/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：クリア小の代わりに、ピアノの単音で代用 | 1.61秒・96kbps・20KB |
| lose.mp3 | 落ち込む（暗いイメージ）（drop1.mp3） | https://soundeffect-lab.info/sound/anime/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | 代用：ゲームオーバー（静か）の代わりに、沈む音で代用 | 5.27秒・96kbps・62KB |
| fire.mp3 | たき火（パチパチと燃える）（fire1.mp3） | https://soundeffect-lab.info/sound/environment/ | 効果音ラボ | 効果音ラボ：商用可・クレジット不要・ゲーム同梱可・改変可（再配布・直リンク・AI学習は禁止） | - | 60秒の素材から20秒を切り出し、つなぎ目の1.5秒を重ねて、つなぎ目なく回るループにした。20.00秒・96kbps・235KB |
