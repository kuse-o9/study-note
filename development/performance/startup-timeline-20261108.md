# 起動時接続喪失の診断強化

対象：総武線快速を含む共有Cesium起動処理。組織によりchrome://gpuが閲覧不可のため、アプリ内で取れる記録を拡充。

診断JSON version 2：longTasks.recentに開始時刻と所要時間（直近20件）、frames.historyに時刻・観測間隔・描画フレーム数・primitive/entity件数（直近20件）を追加。frames.lastRenderはCPU側preRender/postRenderの時刻、context-lostはオブジェクト数と描画コールバックが未終了かを記録。最初のpreRenderをfirst-render-startとして記録。

全記録は上限付きのページ内メモリーのみ。サーバー送信、永続保存、URL・アカウント・生エラー文の追加収集なし。画質やモデル、セーブデータを変更しない。ポーリングやGPU同期読み出しを追加しない。

CPU側コールバック終了はGPU実行完了を意味しない。フレーム数はrequestRenderMode下の描画回数であり、性能上限や実GPU時間ではない。VRAM不足やTDRを断定できるデータではない。version 1の既存ログは保持して解析可能。

scene-diagnosticsテストで時刻・描画中喪失・履歴上限20・機密情報除外を確認。gpu-blocked-start、constructor-context-ownership、scene-recoveryおよび構文検査通過。物理GPU検査未実施。これは原因確定前の観測改善であり、クラッシュ解消済みとは扱わない。
