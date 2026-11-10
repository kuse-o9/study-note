# 無料のGoogleログイン・CAPTCHA接続手順（2026-11-10）

現在のメール＋パスワードと管理者専用認証を維持する。Googleは公開Auth設定で無効。CAPTCHAの設定は公開項目だけでは確認できず、キー未取得のため、こちらから勝手に有効化しない。

## Google

Google側のOAuthクライアントと同意画面を作り、Supabase AuthのGoogleプロバイダーにclient IDとsecretを登録する。課金サービス・有料APIは使わない。秘密情報はGitHubに貼らない。

- GoogleからSupabaseへのコールバック：`https://zlefzpbrbvniijmohpao.supabase.co/auth/v1/callback`
- Supabaseからアプリへの許可済み戻り先：`https://kuse-o9.github.io/study-note/account.html`
- フロントは実際のAuth設定がGoogle有効の場合だけGoogleボタンを表示する。
- 確認済みの同じメールの自動関連付けはSupabase側で行う。クライアント側でユーザーIDや役割を合成しない。別メールの既存アカウントを勝手に統合しない。
- 新規のGoogleアカウントも拡張機能は未追加。管理者やオーナーには自動昇格しない。

## Turnstile

無料のCloudflare Turnstileサイトを本人が作成し、実際の公開ホスト名を登録する。サイトキーは公開用、secretはSupabase Auth側だけに設定する。

1. `auth-options.json` のcaptcha.siteKeyに公開サイトキー、enabledにtrueを設定してフロントを公開する。
2. ログイン・登録・パスワード再設定・管理者のパスワード再確認・本人削除で、確認画面とトークンの受け渡しを検証する。
3. Supabase AuthのBot and Abuse ProtectionでTurnstileのsecretを設定してCAPTCHAを有効化する。
4. 確認に通った操作の成功と、トークンなし／無効トークンでの拒否を、本番の専用テスト用アカウントで確認する。検査のために一般利用者のアカウントを削除しない。

ウィジェットを置いただけで保護完了とは扱わない。外部設定を有効化する前に、オーナーがログイン中の別タブを残して復旧手段を確保する。キーやsecretをチャットに貼らない。

参照：Supabase公式Google認証・Identity Linking・Auth CAPTCHAの説明。
