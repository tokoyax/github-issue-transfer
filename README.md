# npmの初期化
```
npm init -y
```

# 必要なパッケージのインストール
```
npm install @octokit/core typescript @types/node --save
```

# 環境変数設定
```
echo 'export GITHUB_TOKEN=your_personal_access_token' > .envrc
direnv allow
echo '.envrc' >> .gitignore
```

# tsconfig作る
```
npx tsc --init
```

# 実行
```
npx tsx transferIssues.ts
```
