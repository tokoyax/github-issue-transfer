## 使い方

```
git clone https://github.com/<your-username>/github-issue-transfer.git
cd github-issue-transfer
```

### 必要なパッケージのインストール
```
npm install
```

### 環境変数設定
```
echo 'export GITHUB_TOKEN=your_personal_access_token' > .envrc
direnv allow
echo '.envrc' >> .gitignore
```

## 設定

`transferIssues.ts` 内の変数を必要に応じて編集：
- sourceRepo: ソースリポジトリ（owner/repoの形式）。
- targetRepo: ターゲットリポジトリ（owner/repoの形式）。
- labelToAdd: 転送されたIssueに追加するラベル名。
- labelColor: 転送時に新規作成する場合のラベル色。
- projectId: 転送対象のIssueを取得するGitHubプロジェクトのID。
- statusToFilter: 転送前にフィルタリングするステータス。
- dryRun: trueに設定すると、実際の転送を行わずにシミュレーション実行。


## 実行
```
npx tsx transferIssues.ts
```
