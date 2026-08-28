# Query Gantt 公開版・社内版のenvビルドとVSIX作成手順

この手順書は、`internal/integrated-querygantt` から公開用または社内用のQuery GanttをReleaseビルドし、Visual Studio MarketplaceへアップロードできるVSIXを作成するまでを対象とします。

公開版と社内版で異なる値は、Git管理対象外の `.env` へ集約します。ソースの `extension.json`、`Overview.md`、`package.json`、Gruntファイルをプロファイルごとに手編集しません。

> **重要:** `.env` はビルド設定用です。PAT、パスワード、秘密鍵などの認証情報は記載しないでください。VSIXにはpublisher、repository、supportなどの設定値が格納されるため、社内版VSIX自体も社内ルールに従って管理します。

## 1. この構成で切り替わる値

| env変数 | 用途 | 公開版の考え方 | 社内版の考え方 |
| --- | --- | --- | --- |
| `EXTENSION_PUBLISHER` | Marketplace publisher ID | 公開用publisher | 会社またはチーム管理のpublisher |
| `EXTENSION_MARKETPLACE_ID` | Marketplace extension ID | 公開版のID | 削除済みIDと重複しない社内用ID |
| `EXTENSION_VERSION` | manifest version | 前回より大きい数字3～4要素 | 前回より大きい数字3～4要素 |
| `EXTENSION_NAME` | Marketplace表示名 | 公開版の名称 | `Query Gantt (Internal)`など |
| `EXTENSION_DESCRIPTION` | Marketplace説明 | 公開向け説明 | 社内版であることが分かる説明 |
| `EXTENSION_PUBLIC` | 公開範囲 | `true` | `false` |
| `EXTENSION_SUPPORT_URI` | manifestのsupport URI | `https://...`または`mailto:...` | 不要なら空欄 |
| `EXTENSION_REPOSITORY_URI` | manifestのrepository URI | 公開リポジトリのHTTPS URL | 会社が掲載を許可したHTTPS URL |
| `EXTENSION_FEATURE_NAME` | Azure DevOps feature名 | 公開版の名称 | 社内版の名称 |
| `EXTENSION_TAB_TITLE` | タブcontributionのtitle | 公開版のtitle | 社内版のtitle |
| `EXTENSION_TAB_NAME` | Queries画面のタブ名 | `Gantt`など | `Gantt (Internal)`など |
| `EXTENSION_OVERVIEW_NOTICE` | Overview先頭の注意書き | 不要なら空欄 | 社内版であることを示すMarkdown |
| `EXTENSION_OVERVIEW_SUPPORT_TEXT` | OverviewのSupport本文 | 公開問い合わせ先のMarkdown | 不要なら空欄 |

`EXTENSION_SUPPORT_URI` が空の場合、生成manifestから `links.support` を削除します。ほかのlinkがなく `links` が空になる場合は、`links` 自体も削除します。

`EXTENSION_OVERVIEW_SUPPORT_TEXT` が空の場合、生成される `Overview.md` から `# Support` セクションを削除します。

HTML、CSS、JavaScriptのファイル名とContribution IDの接頭辞は、互換性のため常に `querygantt` です。これはenvへ切り出さず、ビルド構成内で固定しています。

## 2. 必要なもの

- Git
- Node.jsとnpm
- npmパッケージを取得できるネットワークまたは社内npmミラー
- Marketplace publisherを管理できるアカウント
- 社内導入では、対象Azure DevOps組織へ拡張を共有・インストールできる権限

この構成はNode.js `20.14.0`、npm `10.7.0`、リポジトリに固定された `tfx-cli 0.22.2` で確認しています。勤務先では会社が承認したNode.js LTSを使用してください。

このリポジトリでは `package-lock.json` を追跡していないため、初回は `npm ci` ではなく `npm install` を使います。

## 3. ビルド専用の作業コピーを用意する

```bash
git clone --branch internal/integrated-querygantt --single-branch https://github.com/storywriter/QueryGantt.git QueryGantt-build
cd QueryGantt-build
git status --short
git rev-parse HEAD
node --version
npm --version
npm install
```

確認事項:

- 最初の `git status --short` は何も表示されないこと。
- `git rev-parse HEAD` の値をビルド記録へ残すこと。
- リポジトリ直下に `.env.example` と `gruntfile.env.js` があること。
- `npm install` がエラーなく完了すること。

## 4. `.env`を準備する

macOS、Linux、Git Bash:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

作成した `.env` だけをテキストエディターで開き、すべての `YOUR_...` を実際の値へ置き換えます。空白、`#`、Markdownを含む値はダブルクォートで囲みます。改行が必要ならダブルクォート内で `\n` を使用できます。

repositoryは `https://` で始まるURL、supportは空欄、`https://` URL、または `mailto:` URIを指定します。不正な形式はビルド開始前にエラーになります。

社内版の代表例:

```dotenv
EXTENSION_PUBLISHER=YOUR_PUBLISHER_ID
EXTENSION_MARKETPLACE_ID=querygantt-internal
EXTENSION_VERSION=1.5.2.7
EXTENSION_NAME="Query Gantt (Internal)"
EXTENSION_DESCRIPTION="Internal Query Gantt build."
EXTENSION_PUBLIC=false
EXTENSION_SUPPORT_URI=
EXTENSION_REPOSITORY_URI=YOUR_APPROVED_REPOSITORY_URL
EXTENSION_FEATURE_NAME="Query Gantt (Internal)"
EXTENSION_TAB_TITLE="Query Gantt Internal Tab"
EXTENSION_TAB_NAME="Gantt (Internal)"
EXTENSION_OVERVIEW_NOTICE="> **Internal build:** This package is for authorized internal use."
EXTENSION_OVERVIEW_SUPPORT_TEXT=""
```

上の値は例です。`YOUR_...` を残したままビルドすると安全のためエラーになります。

### `.env`がGit管理から除外されていることを確認する

```bash
git check-ignore .env
git status --short
```

期待結果:

- `git check-ignore .env` に `.env` が表示される。
- `git status --short` に `.env` が表示されない。
- `.env.example` には実在する会社名、組織名、非公開URL、連絡先を記載しない。

公開用と社内用を保存して切り替えたい場合は、`.env.public` と `.env.internal` のような名前でも構いません。`.env.*` もGit管理対象外です。

## 5. 自動テストを実行する

```bash
npm test
```

次の10メッセージがすべて `passed` になることを確認します。

- `querygantt startup integration tests passed`
- `browser settings tests passed`
- `backlog-order tests passed`
- `querygantt backlog integration tests passed`
- `date granularity tests passed`
- `querygantt date granularity integration tests passed`
- `timeline zoom tests passed`
- `querygantt zoom integration tests passed`
- `timeline interaction tests passed`
- `extension build config tests passed`

日付境界の追加確認も行います。

macOS、Linux、Git Bash:

```bash
TZ=America/New_York node tests/date-granularity.test.js
TZ=America/New_York node tests/querygantt-date-granularity-integration.test.js
```

PowerShell:

```powershell
$env:TZ = "America/New_York"
node tests/date-granularity.test.js
node tests/querygantt-date-granularity-integration.test.js
Remove-Item Env:TZ
```

## 6. Releaseビルドを行う

既定の `.env` を使う場合、公開版・社内版とも同じコマンドです。

```bash
npx grunt --gruntfile gruntfile.env.js --base . app-build:Release
```

PowerShellで `npx.ps1` が拒否された場合:

```powershell
npx.cmd grunt --gruntfile gruntfile.env.js --base . app-build:Release
```

別名のenvファイルを使う場合は、Node.js組み込みオプションとの衝突を避けるため `--env-file` ではなく `--build-env` を使います。

```bash
npx grunt --gruntfile gruntfile.env.js --base . --build-env=.env.internal app-build:Release
```

成功時は `wwwroot/` にRelease成果物が生成され、少なくとも次を確認できます。

- `jshint:src`: すべてlint free
- `cssmin:build`: 成功
- `uglify:release`: 成功
- 最後に `Done.` と表示される

## 7. 生成結果を検査する

manifestの主要値を表示します。

```bash
node -e "const m=require('./wwwroot/vss-extension.json');const f=m.contributions.find(x=>x.type==='ms.vss-web.feature');const t=m.contributions.find(x=>x.type==='ms.vss-web.tab');console.log(JSON.stringify({publisher:m.publisher,id:m.id,version:m.version,name:m.name,description:m.description,public:m.public,support:m.links&&m.links.support?m.links.support.uri:null,repository:m.repository&&m.repository.uri,feature:f.properties.name,tabTitle:t.properties.title,tabName:t.properties.name,tabId:t.id,featureId:t.constraints[0].properties.featureId,uri:t.properties.uri},null,2))"
```

表示された値が `.env` と一致することを確認します。加えて、次を確認します。

```bash
test -f wwwroot/html/querygantt-tab.html
test -f wwwroot/js/querygantt-tab.js
test -f wwwroot/css/querygantt-tab.css
grep -R -n -F '#{' wwwroot --include='*.json' --include='*.html' --include='*.js' --include='*.css' --include='*.md'
grep -R -n -E 'YOUR_[A-Z0-9_]+' wwwroot
```

最後の2つの `grep` は何も表示されないことが正常です。

`wwwroot/Overview.md` も開き、noticeとSupport本文が `.env` の指定どおりになっていることを確認します。

## 8. VSIXを作成する

出力ファイル名を固定すると、publisherや社内IDをコマンドへ再入力する必要がありません。VSIX内部の識別情報は生成manifestから取得されます。

```bash
node -e "require('fs').mkdirSync('dist',{recursive:true})"
npx tfx-cli extension create --root wwwroot --manifest-globs vss-extension.json --output-path dist/querygantt.vsix --no-color --no-prompt
```

PowerShell:

```powershell
node -e "require('fs').mkdirSync('dist',{recursive:true})"
npx.cmd tfx-cli extension create --root wwwroot --manifest-globs vss-extension.json --output-path dist/querygantt.vsix --no-color --no-prompt
```

## 9. VSIXを検査して記録する

macOS、Linux、Git Bash:

```bash
unzip -t dist/querygantt.vsix
unzip -p dist/querygantt.vsix extension.vsixmanifest | grep -E 'Identity|DisplayName'
shasum -a 256 dist/querygantt.vsix
```

Linuxで `shasum` がない場合:

```bash
sha256sum dist/querygantt.vsix
```

PowerShell:

```powershell
tar -tf .\dist\querygantt.vsix
tar -xOf .\dist\querygantt.vsix extension.vsixmanifest | Select-String -Pattern 'Identity|DisplayName'
Get-FileHash .\dist\querygantt.vsix -Algorithm SHA256
```

次をビルド記録へ残します。

- ビルド日時
- `git rev-parse HEAD` のcommit SHA
- 使用したenvファイル名（内容そのものは記録へ貼らない）
- publisher、Marketplace extension ID、version
- VSIXのSHA-256
- `npm test` とReleaseビルドの結果

## 10. 完了判定チェックリスト

- [ ] ビルド元commit SHAを記録した
- [ ] `.env` がGitに無視されている
- [ ] `.env.example` に実在する社内情報がない
- [ ] `.env` にPAT、パスワード、秘密鍵がない
- [ ] publisher、Marketplace ID、versionが意図した値である
- [ ] `EXTENSION_PUBLIC` が公開方針と一致する
- [ ] name、description、feature名、タブ名が意図した値である
- [ ] support、repository、Overviewが意図した値である
- [ ] URI、アセット名、Contribution IDの接頭辞は `querygantt` のままである
- [ ] 10個の自動テストが成功した
- [ ] タイムゾーン追加テストが成功した
- [ ] ReleaseビルドとJSHintが成功した
- [ ] `wwwroot` に `#{...}#` や `YOUR_...` がない
- [ ] VSIX作成とアーカイブ検査が成功した
- [ ] VSIXのSHA-256を記録した

## 11. MarketplaceとAzure DevOpsへ反映する

1. Publishing Portalで、manifestと同じpublisher IDを選ぶ。
2. 新規IDなら `New extension` → `Azure DevOps`、既存IDの更新なら既存拡張の更新機能からVSIXをアップロードする。
3. `EXTENSION_PUBLIC=false` の社内版は非公開であることを確認する。
4. 社内版は `Share/Unshare` から対象Azure DevOps組織と共有する。
5. 対象組織の管理者が拡張をインストールする。
6. Azure DevOpsを再読み込みし、Organization settings → Extensionsで導入を確認する。
7. プロジェクトのManage featuresで対象featureを有効にする。
8. Queries画面で対象タブを開き、スモークテストする。

更新時は拡張を削除して新規登録せず、同じpublisherとMarketplace IDのまま `EXTENSION_VERSION` を増やします。

## 12. セキュリティ上の注意

- `.env`、`.env.public`、`.env.internal` はcommit、Issue、PR、チャット、ビルドログへ貼り付けない。
- `.env.example` にはプレースホルダーだけを置く。
- PATやMarketplace認証情報はこのビルドに不要なので、envへ入れない。
- `wwwroot/vss-extension.json`、`wwwroot/Overview.md`、VSIXにはenvから反映した値が含まれる。社内値を含む成果物はGitHubへcommitしない。
- `wwwroot/`、`dist/`、`*.vsix`、`.env`、`.env.*` はGit除外されていることを毎回確認する。ただし、プレースホルダーだけの `.env.example` は追跡対象とする。
- VSIXは実行コードを含む配布物として、社内の承認済み保管場所で管理する。

## 13. よくあるエラー

### `Environment file not found: .env`

`.env.example` を `.env` へコピーしてから再実行します。別名を使う場合は `--build-env=.env.internal` のように指定します。

### `... still contains a placeholder`

envファイルに `YOUR_...` が残っています。実際の値へ置き換えます。プレースホルダーを含むVSIXは生成しません。

### `Unterminated quoted value`

ダブルクォートまたはシングルクォートの閉じ忘れです。対象行の引用符を確認します。

### `Publisher ... does not match`

`.env` の `EXTENSION_PUBLISHER` と、Publishing Portalで選んだpublisher IDを大文字小文字まで一致させ、Releaseビルドからやり直します。

### `Version ... already exists`

同じversionは再アップロードできません。`.env` の `EXTENSION_VERSION` を増やし、ReleaseビルドとVSIX作成をやり直します。

### `The extension already exists`

生成manifestのpublisherとMarketplace IDが、削除済みまたは既存の拡張と重複しています。新規登録する場合は `.env` の `EXTENSION_MARKETPLACE_ID` を未使用のIDへ変更します。

### タブを開くと404または空白になる

生成manifestのMarketplace IDとは別に、`properties.uri`、HTML内のCSS／JavaScript参照、Contribution IDの接頭辞が `querygantt` のままか確認します。また、`wwwroot` に未置換トークンがないか確認します。

### PowerShellで `npx.ps1` を実行できない

会社の実行ポリシーは変更せず、`npx.cmd` を使用します。

## 14. 公式参考資料

- [Package and publish extensions - Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview?view=azure-devops)
- [Extension manifest reference - Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/extend/develop/manifest?view=azure-devops)
- [Install extensions - Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/marketplace/install-extension?view=azure-devops)
