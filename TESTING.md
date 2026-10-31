# 検証記録

## 自動検証

- `npm run typecheck`: 成功
- `npm test`: 13件成功（11レイアウト＋余白なし面積＋パン制限）
- `npm run build`: 成功
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`: 3件成功。390×844px・タッチ有効のChromiumで写真編集〜2000×2000 JPEG生成/ダウンロード、オフライン再読込、外部リクエストなし、枚数超過/破損画像の拒否、2点タッチによる拡大を確認。
- `git diff --check`: 成功

## 未実施

次は自動テストと区別して、公開後の実機で確認が必要です。実機で成功したとは報告していません。

- iPhone Safari / ホーム画面PWAでの1本指移動、2本指拡大縮小、指を離す順序の変更
- iPhone共有シートから写真アプリへの保存、共有キャンセル、画像長押し保存
- Android Chromeの共有・ダウンロード・PWAインストール
- EXIF回転付きJPEG、iPhone HEIC、広色域画像、大容量写真5枚のメモリ動作
- GitHub Pages本番URL、リポジトリ配下の起動・更新・オフライン動作
- VoiceOverと実機の文字サイズ設定

WebKit検証用ブラウザの取得は環境のネットワーク制限により実施できず、Safari互換性の自動検証は未実施です。
