# WebGL 再レビュー対応（2026-11-08）

- contextlost では preventDefault・停止フラグ・描画停止のみを即時実行し、保存とダイアログは次のタスクへ分離。重複通知は一度に集約。
- Cesium 1.117 の Context が使用する getWebGLStub フックで、実際に作成されたネイティブ接続を記録。コンストラクター途中失敗時も所有接続だけを解放。任意キャンバスを getContext で走査しない。このフックはテスト用途として文書化されているため、Cesium 更新時には互換性再検査が必要。
- 島の一時停止ではレンダラーを破棄せず復旧操作を維持。ページを完全に離れる場合だけ LightShadow.dispose、renderer.dispose、所有GL接続の解放を一度行う。BFCache は除外。

## 検証
constructor-context-ownership: 20回の途中失敗×3試行、模擬接続60個すべて解放、同時残存最大1。成功・カスタムfactory・二重解放も検査。
recovery-lifecycle: 20回の重複イベント、同期停止、次タスクで保存一度、復旧イベントが先に来る場合、破棄済みViewerを検査。
island-renderer-lifetime: 一時停止と終端破棄の分離、BFCache、二重破棄を検査。
既存の gpu-blocked-start、scene-recovery、scene-diagnostics、island-gpu-recovery、island-chunk-release、island-owned-release も通過。

## レビューの評価と限界
preventDefault後のDOM操作でキャンセルが無視される、CPUの長いタスクだけでGPU TDRが必ず起こる、固定の接続上限でDisabledになる、という因果関係は今回の資料では証明されていない。潜在的な所有接続の残留を対策したが、実VRAM漏れを測定したという意味ではない。
preventDefaultは復旧を許容する操作であり、ドライバー障害やブラウザー側ブロックを必ず防ぐものではない。すべてのコンテキスト喪失の完全防止は保証しない。
テストは模擬イベント・模擬接続であり、Windows実機GPUでの復元、VRAM推移、長時間運転は未検証。機能・解像度・保存データの仕様は変更していない。有料サービス利用なし。
