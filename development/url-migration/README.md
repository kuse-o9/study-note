# Study Noteの無料URL移行

2026-11-08（日本時間）に公開URLを変更。

新URL：https://kuse-o9.github.io/study-note/
旧URL：https://kuse-o9.github.io/knowledge-construction/
アプリ本体：https://github.com/kuse-o9/study-note
旧リンク専用：https://github.com/kuse-o9/knowledge-construction

## 実施したこと

- 元リポジトリをstudy-noteへ変更。履歴と既存設定を維持。Pagesのmain／root公開を引き継ぎ、公開処理42426436345の成功を確認。
- 旧名のリポジトリを新規に作り、案内だけのindex.html／404.html／manifestを公開（Pages処理42426594335成功）。アプリ本体を転送ファイルで上書きしていない。
- 旧リンクのパス・クエリー・フラグメントを同じホストの新パスに渡す。旧ホームに戻った認証パラメーターはaccount.htmlへ渡す。相談内容や認証値を保存・送信・ログ出力しない。
- PWAのidは移行前と同じ/knowledge-construction/を維持。旧manifestの起動先とscopeは/study-note/へ更新。
- 固定されたゲーム内リンクと制作計画リンクを新しい基点に変更。git remoteも新しい本体へ変更。今後の本体の更新はstudy-noteへ行う。旧名には転送以外のアプリコードを公開しない。
- 有料ドメイン、課金機能、外部AIは使用していない。

## 確認

- 新公開URLの主要20ファイルをHTTP取得し、ローカルの公開対象と全件バイト一致。
- ブラウザーで新ホームとメニュー、旧ホームから新ホーム、旧ゲームの部屋から新ゲームの部屋への転送を確認。単独ゲーム画面から新ホームへ戻れることも確認。旧管理者デッキURLから新URLへ移動し、未ログイン時に本人確認で止まること、本人確認へのリンクが新URLを指すことも確認。
- 隔離テストで旧ルート／深いリンク／クエリー／フラグメント／認証戻り先／同一オリジン制約／PWA idを検査。認証値は架空のfixtureのみ使用。

## 確認範囲の限界

既存のSupabase Auth設定は変更していない。新旧でホストは同じで、旧戻り先も転送で残した。実際の確認メール・パスワード再設定メールによる往復と、実アカウントの管理者操作は今回実行していない。実機の既存インストールアプリの自動更新も未確認。起動先が変わらない場合は新URLから再インストールするが、ブラウザーの保存データは消さない。

データベースや利用者の記録は変更していない。物理GPU、実スマホ、3Dの完全復旧を確認したものではない。

公式資料：https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository
