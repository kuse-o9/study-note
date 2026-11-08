# Gemini提案の実コード照合・追加修正

2026-11-08。Gemini側はGitHubを読めなかったため、提出された文章は一般的な仮説として扱った。実コードと公式資料を照合し、機能・画質・乗客数・保存形式を維持して修正した。課金サービス・AI APIの追加はない。

## 採用と訂正

1. 鉄道はCesium 1.117、こもれび島はThree.jsを使用。CesiumのPrimitiveCollection.removeは既定でdestroyする。Three.jsのmaterial.disposeを鉄道に一律適用しない。
2. こもれび島のチャンクは共有パレットを使うため、従来のgeometry解放を維持。利用者が建物を解体した場合には、専用geometry・material・textureを解放する。場面内または共有パレットで使用中の資源は解放しない。renderer所有の影バッファを各建物の解放対象にしない。
3. あずさ・かいじの生成模型を協調的なgeneratorで構築。約6msの処理区切りを目安にsetTimeoutで制御を戻す。非表示タブでもrequestAnimationFrame待ちで永遠に止まらない。従来の同期build APIも残す。
4. 古い場面の構築は世代番号で中止し、破棄した場面へ模型を追加しない。GPU停止時には生成処理と一時キャッシュを破棄する。
5. 共通のcontextlost処理は既にpreventDefaultしていた。今回は描画ループの即時停止と重複保存防止、復旧通知を追加。復旧イベントだけで壊れたViewerを自動再開しない。保存後、利用者が再読み込みで作り直す。特急の既存の新規Viewer再構築経路も維持。
6. preventDefaultは復旧可能性を残す処理であり、GPUブロック回避や復旧成功を保証しない。Disabledという文字だけでGPUドライバーのクラッシュやVRAM枯渇を断定しない。CPUの50ms超処理も、それだけでOSのGPUタイムアウト発動を示さない。

## 診断機能

3Dエラー画面に「診断情報をコピー」を追加。最新40件の開始失敗・喪失・復旧イベント、長いタスクの回数・時間、描画済みフレーム数と模型オブジェクト数、生成模型の構築統計を取得する。

集計はそのページのメモリー内だけで保持し、サーバーへ自動送信・永続保存しない。利用者がボタンを押したときだけJSONをコピー。クリップボードが許可されない環境では読み取り専用のコピー欄を表示する。URL、トークン、メール、アカウント情報、保存データ、エラー本文をJSONへ入れない。オブジェクト数はVRAMのバイト数ではない。要求時描画なので、毎秒描画回数の低さだけで処理落ちと断定しない。

## 検査と限界

- 変更元18ファイルをGitHubの公開元blobと照合。
- model-timeslicing.test.cjs：あずさ・かいじ各4模型（線路・一般駅・終端配線）のハッシュが修正前の固定値と一致。頂点、色、索引、乗客データを含む。各20回の小模型の構築・破棄、構築中止、同じ模型の重複要求共有を確認。
- 模擬CPU検査では、あずさ166回、かいじ150回ブラウザー相当のホスト処理へ制御を返した。一方、最長区切りは約377ms／194msで、全Long Taskをなくしたわけではない。単一の重い操作・GC等の追加調査が必要。実機FPSやTDR改善量ではない。
- island-owned-release.test.cjs：20回の模擬解放で、専用資源を解放し、表示中・共有パレットの資源を維持。
- island-chunk-release.test.cjs：既存チャンク解放と7×7表示範囲を維持。
- recovery-lifecycle.test.cjs：20回の重複喪失／描画エラーで一度だけ保存、描画停止、手動復旧、破棄済みViewer無視。
- scene-diagnostics.test.cjs：診断件数上限、コピー、機密値・URL等を含めないこと。
- gpu-blocked-start.test.cjs・scene-recovery.test.cjs：ブロック時の無駄な再試行防止、正しいViewerの一度だけ解放、保存順序を確認。
- 既存scene-start.test.cjsはjsdom依存がこの環境にないため未実行。上記検査を全テスト・実機検査の完了とは扱わない。
- 確認ブラウザーはGPU無効のため、実機のGPU復旧、VRAM推移、長時間走行での再発防止は未確認。診断を根拠に次を絞り込む。

公式資料：
https://cesium.com/learn/cesiumjs/ref-doc/PrimitiveCollection.html
https://threejs.org/manual/pages/how-to-dispose-of-objects.html
https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/
