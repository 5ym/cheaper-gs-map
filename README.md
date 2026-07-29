# cheaper-gs-map

[gogo.gs](https://gogo.gs/) の全国ガソリン価格ランキングから **各都道府県の上位10位** を収集し、
衛星写真の地図上に表示する静的サイト。GitHub Actions で定期実行し、GitHub Pages に配信する。

旧 `cu.php`（CSV 出力）を TypeScript + Bun に置き換えたもの。gogo.gs は Livewire ベースに刷新され、
旧 HTML クラス（`shop-name` / `price` など）は存在しないため、パーサは新しい DOM 構造に合わせてある。

## 構成

```text
src/scraper/   価格収集 (Bun で実行)
  config.ts      都道府県・油種・ブランドの定義
  http.ts        直列化 + リトライ付き fetch
  ranking.ts     ランキングページのパーサ
  coords.ts      店舗座標の解決
  index.ts       収集の全体制御 → data/stations.json
src/web/       地図フロントエンド (MapLibre GL)
  style.ts       タイルとレイヤの定義 (実行時コード非依存なので単体で検証できる)
  map.ts         地図の生成とコントロール
  pins.ts        価格ピンの画像生成
  main.ts        絞り込み・一覧・ポップアップ
src/shared/    双方で使う型
scripts/       ビルド + 開発サーバ + スタイル検証
```

### データの取り方

| 取得元 | 用途 |
| --- | --- |
| `https://gogo.gs/ranking/{都道府県コード}?...&mode={油種}` | 順位・価格・店名・住所・更新日時・コメント |
| `https://gogo.gs/api/shop/around?lat=&lon=&dist=&limit=` | 店舗 ID (`ss_id`) に対する **緯度経度** |

ランキングページには座標が無く、店舗詳細ページにも埋め込まれていないため、
gogo.gs のマップ画面が使っている `/api/shop/around` を都道府県ごとに 1 回叩いて ID → 座標の対応表を作り、
店舗 ID で突き合わせている（外部ジオコーディング不要）。1 回で取り切れない密集地域は自動で 4 分割して再取得する。

油種は `price_mode` = 0:レギュラー / 1:ハイオク / 2:軽油 / 3:灯油。
会員価格の行は赤いバッジで判別し、現金価格と両方を保持する。

## 使い方

```bash
bun install

bun run scrape      # 価格を収集して data/stations.json を作る
bun run build:web   # dist/ に静的サイトを書き出す
bun run dev         # ビルドして http://localhost:5173/ で確認
bun run build       # scrape + build:web
bun run typecheck   # tsc + 地図スタイルを MapLibre の検証器にかける
```

### 環境変数

| 変数 | 既定値 | 意味 |
| --- | --- | --- |
| `TOP_N` | `10` | 各都道府県で何位まで取るか |
| `SPAN` | `2` | 価格の対象期間 (1:1ヶ月 / 2:14日 / 3:7日 / 4:4日 / 5:1日 以内) |
| `FETCH_DELAY_MS` | `700` | リクエスト間隔 |
| `PREF_CODES` | 未設定 | `13,14` のように指定すると一部の県だけ収集（動作確認用） |

## 地図

描画は **MapLibre GL JS**（WebGL）。ラスタタイルもピンも GPU で描くので、
DOM 要素を動かす Leaflet と違ってドラッグがメインスレッドを塞がない。

- 背景は **衛星写真**（既定: Esri World Imagery、切替で国土地理院シームレス空中写真、淡色地図）
- 地名ラベルを重ねて表示（右下のレイヤコントロールで切替）
- ピンは価格そのものを表示し、色は安いほど緑・高いほど赤。最安店は金色の枠、会員価格は赤い印
- ピンは canvas で焼いた画像として登録するので、文字用のグリフサーバに依存しない
- 重なったピンは MapLibre が自動で間引く。`symbol-sort-key` に価格を渡してあるので安い方が残る
- 現在地ボタン（追従・精度円つき）。取得できると一覧とポップアップに距離が出る
- 油種 / 現金・会員 / 都道府県 / 更新の新しさ / ブランド / 店名・住所検索で絞り込み
- 絞り込み条件は URL のハッシュに入るので、そのまま共有できる
- WebGL2 が使えない環境では白紙にせず理由を表示する

## GitHub Pages への公開

1. リポジトリの **Settings → Pages → Source** を **GitHub Actions** にする
2. `master` への push、または 1 日 1 回（6:00 JST）の cron で
   [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) が収集・ビルド・デプロイを行う
3. 公開先: `https://<ユーザー名>.github.io/cheaper-gs-map/`

収集した JSON はリポジトリにコミットせず、ビルドのたびに作り直して Pages の成果物に載せている。

## 注意

価格情報は gogo.gs 利用者の投稿によるもので、正確性は保証されない。実際の価格は店頭で確認すること。
収集はリクエストを直列化し間隔を空けて行っているが、実行頻度を上げすぎないこと。
