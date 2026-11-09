# tab-volume リリース TODO

Chrome ウェブストアでの初回公開を対象とする。現行のリリース候補は `1.0.0`。提出用 ZIP と掲載素材は作成済み。検証結果と ZIP の照合情報は [提出候補の確認結果](release/QA.md) にまとめた。

## 1. 公開前の動作確認

- [x] **対応下限を Chrome 116 とする。** Windows の Chrome for Testing 116.0.5845.96 に提出用 ZIP を展開して読み込み、Chrome の拡張機能ショートカットから音量変更・保存・別タブでの適用を確認した。
- [x] **通常再生と拡張経由の 100% を Windows で計測する。** Chrome 116 と 157 で切り替え直後に約 110〜120 ms の音切れがあった。安定後の音量差は 0.03 dB 未満で、ステレオは維持された。Chrome 157 では音声が映像に対して通常再生より約 75〜85 ms 遅れた。 [音声の計測結果](release/QA.md#通常再生と拡張経由の-100-の比較)
- [ ] **実際の動画と出力機器で聴き比べる。** Windows の Chrome 157 では低遅延指定でも一貫した改善はなく、取り込みを停止して通常経路へ戻すと同期が元に戻った。会話や音楽で音質と映像同期を確認し、計測したずれが視聴に支障を来すか判定する。公開対象のほかの OS でも確認する。 [遅延の切り分け](release/QA.md#遅延の切り分け)
- [x] **提出候補の基本操作を新規プロファイルで通し確認する。** Windows の Chrome 157 で、起動直後は 100%、音量変更、ミュート解除、3種類の条件の保存と手動適用、URL の変更時の照合を確認した。別オリジンへの移動やキャプチャ競合からの再試行は本番実装時に同バージョンで確認済み。
- [x] **「100% に戻す」ボタンの再生経路を確認する。** Chrome 116 と 157 で、スライダーの 100% はキャプチャを維持し、ボタンで通常経路に戻ることを確認した。Chrome 157 では更新版 ZIP で音声も計測した。 [ボタンの検証](release/QA.md#100-に戻すボタンの確認)
- [x] **ブラウザー再起動後の保持を確認する。** 保存したルール、言語、目盛り、ダークモードが残り、音量を手動適用できることを確認した。
- [x] **既存インストールからの更新を確認する。** 旧版から提出候補へ更新し、音量設定と手動選択した言語が残ること、旧版の「自動」が日本語または英語に移ることを確認した。 [更新検証](release/QA.md#既存インストールからの更新)
- [x] **4言語の最終表示とキーボード操作を確認する。** 日本語、英語、ヒンディー語、簡体字中国語で、スライダー、数値ラベル、ミュート、保存・適用・削除をキーボードで操作できた。設定一覧の翻訳、ダークモード、長い URL の折り返し、未対応言語での英語選択も確認した。 [4言語の検証](release/QA.md#4言語の表示とキーボード操作)

詳細は [仕様書の受け入れ基準](SPEC.md#受け入れ基準) を参照する。結果には拡張バージョン、Chrome バージョン、OS、再現手順を残す。

## 2. ストア掲載素材とアカウント

- [ ] **公開アカウントを確認する。** 必要なら開発者アカウントを登録して登録料を支払い、公開する開発者名と確認済みメールアドレスを用意する。 [開発者登録](https://developer.chrome.com/docs/webstore/register) · [アカウント設定](https://developer.chrome.com/docs/webstore/set-up-account)
- [x] **4言語の掲載文を用意する。** [掲載文案](release/STORE-LISTING.md)
- [x] **掲載画像を用意する。** [アイコン](extension/icons/icon-128.png)、実際の拡張から撮った [4言語のスクリーンショット](release/images/)、[小型プロモ画像](release/images/promo-small.png) を作成した。 [掲載画像のガイド](https://developer.chrome.com/docs/webstore/images)
- [x] **問い合わせ窓口の方針を決める。** 初回公開では、プライバシーポリシーの案内に合わせて Chrome ウェブストア標準のサポートハブを使う。 [ユーザーサポートの設定方法](https://developer.chrome.com/docs/webstore/support-users#the-support-hub)
- [ ] **サポートハブの公開設定を確認する。** 開発者アカウントの項目サポートを有効にし、公開後に掲載ページから開けることを確認する。

## 3. プライバシーと審査資料

- [x] **プライバシーポリシー案を作成する。** [日本語と英語の文案](release/PRIVACY.md)
- [ ] **プライバシーポリシーを公開し、URL を登録する。** 公開 URL がログインなしで閲覧できることを確認する。 [Chrome ウェブストアのプライバシーポリシー要件](https://developer.chrome.com/docs/webstore/program-policies/policies#privacy_policy)
- [ ] **ダッシュボードのプライバシー欄を記入する。** 単一の目的はタブごとの音量調整とその設定管理。実装、掲載文、ポリシーと一致するよう、各権限の用途、ローカル保存、外部送信の有無、リモートコードの利用有無を申告する。 [プライバシー欄の入力](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
  - `activeTab` は拡張を開いた対象タブの URL を読み、保存条件を照合する。
  - `tabCapture` は操作されたタブの音声を取り込む。
  - `offscreen` はポップアップを閉じた後も音声処理を続ける。
  - `storage` は表示設定と保存した音量条件を保持する。
- [x] **審査用の操作手順と入力案を用意する。** 提出候補のコードと公式ガイドに照らして、端末内で扱うデータとリモートコードの有無を入力案に整理した。 [審査用入力案](release/REVIEW.md)
- [x] **更新版 ZIP で審査手順を通す。** Chrome 157 で W3C の公開動画を使い、音量調整から別タブでの適用、通常再生への復帰、保存条件の削除まで確認した。 [更新版の再確認](release/QA.md#更新版-zip-の再確認)

## 4. パッケージ化と公開

- [x] **提出用 ZIP を作る。** `tab-volume-1.0.0.zip` の構成を検査し、展開した ZIP を Chrome に読み込んで基本操作を確認した。 [ZIP の照合情報](release/QA.md#zip) · [提出パッケージの要件](https://developer.chrome.com/docs/webstore/prepare)
- [x] **通常のブラウザーで Ko-fi の表示を確認する。** 利用者のブラウザーでリンク先が正常に開くことを確認済み。
- [ ] **審査に提出する。** ZIP をアップロードし、カテゴリ、公開範囲、配布地域、掲載文と画像、プライバシー情報を最終確認する。審査通過後に公開時期を決められるよう、初回は手動公開を選ぶ。 [公開と審査の手順](https://developer.chrome.com/docs/webstore/publish/)
- [ ] **公開する。** 審査承認後、公開ページのプレビューと連絡先を確認し、公開操作を行う。公開 URL、バージョン、提出 ZIP に対応するコミットを記録する。
- [ ] **公開直後に確認する。** 別プロファイルからストア経由でインストールし、初期言語、音量調整、保存と手動適用を確認する。

## 公開アカウントで行う手順

1. **ログイン。** Image Extractor と同じ公開名義を使う場合は、その開発者アカウントでダッシュボードにログインする。アカウント画面で公開名と連絡用メールを確認する。登録・支払いは、新しい開発者アカウントを使う場合に行う。 [開発者ダッシュボード](https://chrome.google.com/webstore/devconsole/) · [アカウント設定](https://developer.chrome.com/docs/webstore/set-up-account)
2. **ポリシーを公開。** [プライバシーポリシー](release/PRIVACY.md) をログイン不要の HTTPS ページに置く。GitHub を使う場合は、公開の文書用リポジトリを作り、この Markdown ファイルを追加する。ファイルのページ URL をシークレットウィンドウで開き、本文を読めることを確認する。 [GitHub のリポジトリ作成手順](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
3. **ストアの下書きを作成。** ダッシュボードで「新しいアイテムを追加」から `tab-volume-1.0.0.zip` をアップロードする。「ストアの掲載情報」に [4言語の説明](release/STORE-LISTING.md) と [画像](release/images/) を登録する。「プライバシー」には [申告案](release/REVIEW.md#privacy-practices) と公開したポリシー URL を入力し、データ利用の確認項目を確認する。「配布」では無料・一般公開と対象地域を設定する。「テスト手順」には [審査用手順](release/REVIEW.md#test-instructions) を入れる。標準サポートハブを使う場合は、アカウントの項目サポートで公開設定を確認する。 [ストア提出手順](https://developer.chrome.com/docs/webstore/publish/#fill-out-information-about-your-item) · [サポート設定](https://developer.chrome.com/docs/webstore/support-users#the-support-hub)
4. **審査に提出して手動で公開。** 「審査に提出」で自動公開のチェックを外す。承認されたら掲載情報と連絡先を確認し、ステータス画面に表示された期限までに「公開」を押す。公開ページでインストールとサポート・ポリシーへのリンクを確認する。 [手動公開の手順](https://developer.chrome.com/docs/webstore/publish/#deferred-publishing-option)

追加の収益化は、公開後の地域別・言語別の利用実績と問い合わせを見て検討する。 [ストアの利用指標](https://developer.chrome.com/docs/webstore/metrics)
