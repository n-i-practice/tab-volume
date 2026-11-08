# Volume Master 2.4.0 のタブ別音量調整

Volume Master は対象タブの音声を `chrome.tabCapture` で取得し、拡張の非表示ページで Web Audio API の `GainNode` を通して再生する。タブ ID ごとに音声処理を分けているため、各タブの音量を独立して変更できる。

## 操作から音声出力まで

1. **ポップアップを開く。** `chrome.tabs.query({ active: true, currentWindow: true })` で対象タブの ID と URL を取得する。サービスワーカーへ `init-offscreen-document` を送り、非表示ページが存在しなければ `chrome.offscreen.createDocument` で `html/offscreen.html` を作る。作成理由は `USER_MEDIA`。ポップアップは非表示ページに `popup-audio-data-get` を送り、現在のゲインを表示する。処理状態がなければ 100% を表示する。この初期表示では音声キャプチャを開始しない。
2. **スライダーを動かす。** `input` イベントで、スライダーの位置を音量の百分率へ変換する。選択肢は 0〜9% が 1 ポイント刻み、10% 以上が 10 ポイント刻み。通常の上限は 600% で、サポーター設定では 800%。`popup-gain-change` に `tabId` と `volumeValue` を載せてサービスワーカーに送る。
3. **初回だけストリームを取得する。** サービスワーカーは非表示ページに対象タブの処理状態を問い合わせる。状態がなければ `chrome.tabCapture.getMediaStreamId({ targetTabId: tabId })` を呼び、取得した `mediaStreamId` を音量変更メッセージに添える。非表示ページは `getUserMedia` の音声制約に `chromeMediaSource: "tab"` と `chromeMediaSourceId: mediaStreamId` を指定してストリームを開く。
4. **ゲインを変えて再生する。** 非表示ページはタブごとに `AudioContext` を作り、`MediaStreamAudioSourceNode → GainNode → BiquadFilterNode → AudioContext.destination` の順に接続する。音量変更では `gainNode.gain.value = volumeValue / 100` を代入する。0% は無音、100% はゲイン 1、600% は信号振幅を 6 倍にする。解析用ノードを接続する分岐もあるが、この版では設定で無効になっている。

## 状態の保持と終了

- 非表示ページは `window.audioStates[tabId]` にコンテキストとノードを保持する。同じタブの以降の操作では既存のゲインを更新する。ポップアップを閉じても音声処理は非表示ページに残る。100% にリセットしても、ゲインが 1 に戻るだけでキャプチャは継続する。
- スライダーの `change` 時に、ホスト名ごとの前回音量を `chrome.storage.local` の `domains-settings` に保存する。100% の場合は保存済み音量を削除する。タブに処理状態がなく、保存済み音量がある場合は復元ボタンを出す。復元はボタン操作で行われる。
- タブが閉じると、サービスワーカーが `chrome.tabs.onRemoved` から `tab-closed` を送る。非表示ページは該当する `AudioContext` の終了後にタブの状態を削除する。この処理にはストリームのトラックを明示的に `stop()` する呼び出しはない。

## コード上の注意点

初回のイコライザー変更では、サービスワーカーが `mediaStreamId` を渡す一方、非表示ページは `getUserMedia` に渡す ID として `tabId` を使っている。音量変更側は `mediaStreamId` を使う。ここで確認したのは引数の不一致で、実際の動作はブラウザで検証していない。

## 参照したファイル

- [manifest.json](references/jghecgabfgfdldnmbfkhmffcabddioke/2.4.0_0/manifest.json) — Manifest V3、ポップアップとサービスワーカーの登録、`activeTab`・`offscreen`・`tabCapture`・`tabs`・`storage` 権限
- [popup.js](references/jghecgabfgfdldnmbfkhmffcabddioke/2.4.0_0/js/popup.js) — バンドル内のモジュール 6・7 が音量 UI と刻み幅、2・3 がリセットと復元、16・28 が初期化
- [service-worker.js](references/jghecgabfgfdldnmbfkhmffcabddioke/2.4.0_0/js/service-worker.js) — モジュール 5 が非表示ページの作成、ストリーム ID の取得、タブ終了の通知
- [offscreen.js](references/jghecgabfgfdldnmbfkhmffcabddioke/2.4.0_0/js/offscreen.js) — モジュール 2 がストリーム取得、音声処理、タブごとの状態管理
