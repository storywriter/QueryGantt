# Query Gantt 社内版の識別・Releaseビルド・VSIX作成手順

この手順書は、統合ブランチ `internal/integrated-querygantt` から、公式版と見分けられる非公開の社内用拡張を作り、Visual Studio MarketplaceへアップロードできるVSIXを得るまでを対象とします。

Marketplaceへのアップロード、対象Azure DevOps組織との共有、インストールは最後に概要だけ記載します。この手順を実行しても、自動的にMarketplaceやAzure DevOpsへ送信されることはありません。

## 完成時の状態

| 項目 | 社内版で使用する値 |
| --- | --- |
| ソース | `storywriter/QueryGantt` の `internal/integrated-querygantt` |
| 拡張の完全な識別子 | `YOUR_COMPANY_PUBLISHER_ID.querygantt-internal` |
| Marketplace上の表示名 | `Query Gantt (Internal)` |
| Queries画面のタブ名 | `Gantt (Internal)` |
| 公開範囲 | 非公開（`public: false`） |
| 今回の推奨バージョン | `1.5.2.7` |
| 出力例 | `dist/YOUR_COMPANY_PUBLISHER_ID.querygantt-internal-1.5.2.7.vsix` |

元のMarketplace版は `emait.querygantt` です。以前の社内版 `YOUR_COMPANY_PUBLISHER_ID.querygantt` は削除済みとして再利用せず、新しいMarketplace識別子 `YOUR_COMPANY_PUBLISHER_ID.querygantt-internal` を使用します。

> **重要:** Marketplace上の拡張IDは `querygantt-internal` ですが、HTML、CSS、JavaScriptのアセット名とContribution IDの接頭辞は互換性のため `querygantt` のままです。`gruntfile.internal.js` がこの2つを分離して生成するため、通常の `gruntfile.js` や `package.json` を直接変更しないでください。

## 1. 作業前に決める値

次の値を社内の管理者と決め、作業記録へ控えます。

| 値 | 説明 |
| --- | --- |
| `YOUR_COMPANY_PUBLISHER_ID` | Visual Studio Marketplaceで会社またはチームが管理するpublisher ID。表示名ではなくIDそのものを使います。 |
| `YOUR_AZDO_ORGANIZATION` | `https://dev.azure.com/YOUR_AZDO_ORGANIZATION` の組織名。VSIX作成時には使いませんが、後の共有で必要です。 |
| `querygantt-internal` | 新しいMarketplace extension ID。削除済みの `querygantt` は再利用しません。 |
| `1.5.2.7` | 今回の社内版の推奨バージョン。既に同じ版をアップロード済みなら第4要素を増やします。 |
| 社内サポートURL | 社内の問い合わせ先。外部公開できない情報なら、会社管理のリポジトリや社内ヘルプデスクを指定します。 |

publisherをまだ作成していない場合は、[Visual Studio Marketplace Publishing Portal](https://marketplace.visualstudio.com/manage/publishers/)で作成します。publisher IDは後から使うmanifestの値と完全一致する必要があります。個人用ではなく、可能なら会社またはチームで継続管理できるpublisherを使ってください。

## 2. 必要なもの

- Git
- Node.jsとnpm
- npmパッケージを取得できるネットワークまたは社内npmミラー
- Marketplace publisherを管理できるアカウント
- 後でインストールする場合は、対象Azure DevOps組織のOrganization OwnerまたはProject Collection Administrators相当の権限

この環境ではNode.js `20.14.0`、npm `10.7.0`、リポジトリに固定された `tfx-cli 0.22.2` で確認しています。勤務先では会社が承認したNode.js LTSを使用し、以下のテストとビルドがすべて通ることを優先してください。

このリポジトリには `package-lock.json` が追跡されていないため、初回は `npm ci` ではなく `npm install` を使います。

## 3. ビルド専用の作業コピーを用意する

社内用のpublisherや表示名を上流向けブランチへ誤ってcommitしないよう、通常の開発ディレクトリとは別にビルド専用コピーを作ります。

```bash
git clone --branch internal/integrated-querygantt --single-branch https://github.com/storywriter/QueryGantt.git QueryGantt-internal-build
cd QueryGantt-internal-build
git status --short
git rev-parse HEAD
node --version
npm --version
npm install
```

確認事項:

- 最初の `git status --short` は何も表示されないこと。
- `git rev-parse HEAD` の値をビルド記録へ残すこと。
- Node.jsは会社が承認したサポート中のLTSを使うこと。Node.js 12／npm 6では、このリポジトリの依存関係とビルド用versionトークンを正しく扱えません。
- `npm install` がエラーなく完了すること。
- リポジトリ直下に `gruntfile.internal.js` があること。

既に同名のディレクトリがある場合は上書きせず、`QueryGantt-internal-build-2` など別名を使います。

## 4. 社内用拡張として識別できるようにする

ここからの編集はビルド専用コピーだけで行います。`internal/integrated-querygantt` へcommitまたはpushしません。

### 4.1 `package.json`は編集しない

`package.json` のversionはビルド用トークンになっているため、そのままにします。Azure DevOps manifestは `1.5.2.7` のような数字4要素を使用できますが、その値を `package.json` へ直接書くとnpmのSemantic Versioning規則に合わず、`npm test` が `Invalid version` で失敗します。

この手順では、リポジトリにある `gruntfile.internal.js` にコマンドラインからpublisher、Marketplace extension ID、versionの3値を渡し、Release成果物だけへ反映します。アセット/Contribution IDの接頭辞はビルド構成内で固定されています。

- publisher: 実際の会社publisher ID
- Marketplace extension ID: `querygantt-internal`
- asset/Contribution ID prefix: `querygantt`（ビルド内で固定）
- extension version: `1.5.2.7`

Marketplaceへ同じ拡張の更新版をアップロードするときは、必ず以前より大きいversionにします。`internal` などの文字は入れません。

### 4.2 `extension.json`を編集する

次の項目を変更します。その他のcontribution ID、URI、scopeは変更しません。

1. トップレベルの表示情報:

```json
"name": "Query Gantt (Internal)",
"description": "Internal Query Gantt build integrating upstream PRs #31, #33, #35, and #37.",
"public": false,
```

2. `links.support.uri` を会社が承認した社内サポートURLまたはメールアドレスへ変更します。外部公開が許可されている場合に限り、forkのIssuesを指定しても構いません。

```json
"links": {
    "support": {
        "uri": "https://support.example.com/querygantt"
    }
},
```

`support.example.com` は例です。実在する社内URLへ必ず置き換えてください。サポートリンクを掲載しない方針の場合は、JSONのカンマに注意して `links` ブロック全体を削除します。

3. `repository.uri` を今回の統合ブランチがあるforkへ変更します。社内ミラーがある場合は、そのURLを使います。

```json
"repository": {
    "type": "git",
    "uri": "https://github.com/storywriter/QueryGantt"
},
```

4. `ms.vss-web.feature` contributionの `properties.name`:

```json
"name": "Query Gantt (Internal)",
```

5. `ms.vss-web.tab` contributionの表示情報:

```json
"title": "Query Gantt Internal Tab",
"name": "Gantt (Internal)"
```

次の値は変更しません。

```json
"id": "#{Extension.Id}#",
"publisher": "#{Extension.Publisher}#"
```

これらはReleaseビルド時に、`gruntfile.internal.js` へ渡したMarketplace extension IDとpublisher IDから置き換えられます。アセット名とContribution IDは引き続き `querygantt` で生成されます。

### 4.3 `Overview.md`の先頭に社内版の注意書きを加える

Marketplaceの詳細画面でも公式版と誤認されないよう、ロゴの直後など目立つ位置に次を加えます。

```markdown
> **Internal build:** This package is an internally distributed build based on
> `storywriter/QueryGantt:internal/integrated-querygantt`. It is not the official
> Marketplace release published by EmaIT. Contact the internal support team for help.
```

### 4.4 仮の値が残っていないことを確認する

PowerShell:

```powershell
Get-ChildItem extension.json,Overview.md | Select-String -Pattern 'YOUR_|example\.com'
```

macOS/Linux/Git Bash:

```bash
grep -n -E 'YOUR_|example\.com' extension.json Overview.md
```

何も表示されないことを確認します。表示された場合は、VSIXを作る前に実際の値へ置き換えます。

## 5. テストとReleaseビルドを行う

### 5.1 自動テスト

```bash
npm test
```

次の9メッセージがすべて `passed` になることを確認します。

- `querygantt startup integration tests passed`
- `browser settings tests passed`
- `backlog-order tests passed`
- `querygantt backlog integration tests passed`
- `date granularity tests passed`
- `querygantt date granularity integration tests passed`
- `timeline zoom tests passed`
- `querygantt zoom integration tests passed`
- `timeline interaction tests passed`

日付境界の追加確認も行います。

PowerShell:

```powershell
$env:TZ = "America/New_York"
node tests/date-granularity.test.js
node tests/querygantt-date-granularity-integration.test.js
Remove-Item Env:TZ
```

macOS/Linux/Git Bash:

```bash
TZ=America/New_York node tests/date-granularity.test.js
TZ=America/New_York node tests/querygantt-date-granularity-integration.test.js
```

### 5.2 Releaseビルド

`YOUR_COMPANY_PUBLISHER_ID` を実際のpublisher IDへ置き換えて実行します。

```bash
npx grunt --gruntfile gruntfile.internal.js --base . app-build:Release --publisher=YOUR_COMPANY_PUBLISHER_ID --extension-id=querygantt-internal --extension-version=1.5.2.7
```

PowerShellの実行ポリシーにより `npx.ps1` が拒否された場合は、会社のポリシーを変更せず、次を試します。

```powershell
npx.cmd grunt --gruntfile gruntfile.internal.js --base . app-build:Release --publisher=YOUR_COMPANY_PUBLISHER_ID --extension-id=querygantt-internal --extension-version=1.5.2.7
```

成功時は最後に `Done.` と表示され、その前に少なくとも次が確認できます。

- `jshint:src`: 37 files lint free
- `cssmin:build`: 成功
- `uglify:release`: 成功
- `wwwroot/` にRelease成果物が生成される

## 6. 生成manifestを検査する

次のコマンドは、VSIXに入る主要な識別情報を表示します。

```bash
node -e "const m=require('./wwwroot/vss-extension.json');const t=m.contributions.find(x=>x.type==='ms.vss-web.tab');console.log(JSON.stringify({publisher:m.publisher,id:m.id,version:m.version,name:m.name,public:m.public,tab:t.properties.name,tabId:t.id,featureId:t.constraints[0].properties.featureId,uri:t.properties.uri},null,2))"
```

期待する形:

```json
{
  "publisher": "YOUR_COMPANY_PUBLISHER_ID",
  "id": "querygantt-internal",
  "version": "1.5.2.7",
  "name": "Query Gantt (Internal)",
  "public": false,
  "tab": "Gantt (Internal)",
  "tabId": "querygantt-tab",
  "featureId": "YOUR_COMPANY_PUBLISHER_ID.querygantt-internal.querygantt-feature",
  "uri": "html/querygantt-tab.html?v=1.5.2.7"
}
```

さらに、参照先のアセットが実在することを確認します。

```bash
test -f wwwroot/html/querygantt-tab.html
test -f wwwroot/js/querygantt-tab.js
test -f wwwroot/css/querygantt-tab.css
```

さらに未置換のビルド用トークンがないことを確認します。

PowerShell:

```powershell
Get-ChildItem wwwroot -Recurse -File -Include *.json,*.html,*.js,*.css,*.md | Select-String -SimpleMatch '#{'
```

macOS/Linux/Git Bash:

```bash
grep -R -I -n -F '#{' wwwroot
```

どちらも何も表示されないことが正常です。

ここで `publisher` が `emait`、`version` に `#{...}#` が残る、または `public` が `true` の場合は、VSIX作成へ進まず、手順4からやり直します。

## 7. VSIXを作成する

出力先を作ります。

```bash
node -e "require('fs').mkdirSync('dist',{recursive:true})"
```

`YOUR_COMPANY_PUBLISHER_ID` を実際のpublisher IDへ置き換えて実行します。

```bash
npx tfx-cli extension create --root wwwroot --manifest-globs vss-extension.json --output-path dist/YOUR_COMPANY_PUBLISHER_ID.querygantt-internal-1.5.2.7.vsix --no-color --no-prompt
```

PowerShellで `npx.ps1` が拒否される場合:

```powershell
npx.cmd tfx-cli extension create --root wwwroot --manifest-globs vss-extension.json --output-path dist/YOUR_COMPANY_PUBLISHER_ID.querygantt-internal-1.5.2.7.vsix --no-color --no-prompt
```

成功時の出力で次を確認します。

- `Publisher`: 実際の会社publisher ID
- `Extension ID`: `querygantt-internal`
- `Extension Version`: `1.5.2.7`
- `VSIX`: 指定した `dist/...vsix`

## 8. VSIXを検査して記録を残す

### 8.1 アーカイブを検査する

macOS/Linux/Git Bash:

```bash
unzip -t dist/YOUR_COMPANY_PUBLISHER_ID.querygantt-internal-1.5.2.7.vsix
unzip -p dist/YOUR_COMPANY_PUBLISHER_ID.querygantt-internal-1.5.2.7.vsix extension.vsixmanifest | grep -E 'Identity|DisplayName'
```

Windows PowerShell（Windows標準の `tar` が利用できる場合）:

```powershell
tar -tf .\dist\YOUR_COMPANY_PUBLISHER_ID.querygantt-internal-1.5.2.7.vsix
tar -xOf .\dist\YOUR_COMPANY_PUBLISHER_ID.querygantt-internal-1.5.2.7.vsix extension.vsixmanifest | Select-String -Pattern 'Identity|DisplayName'
```

少なくとも次の内容が表示されることを確認します。

```text
Id="querygantt-internal" Version="1.5.2.7" Publisher="YOUR_COMPANY_PUBLISHER_ID"
<DisplayName>Query Gantt (Internal)</DisplayName>
```

### 8.2 SHA-256を記録する

PowerShell:

```powershell
Get-FileHash .\dist\YOUR_COMPANY_PUBLISHER_ID.querygantt-internal-1.5.2.7.vsix -Algorithm SHA256
```

macOS:

```bash
shasum -a 256 dist/YOUR_COMPANY_PUBLISHER_ID.querygantt-internal-1.5.2.7.vsix
```

Linux:

```bash
sha256sum dist/YOUR_COMPANY_PUBLISHER_ID.querygantt-internal-1.5.2.7.vsix
```

次を一緒にビルド記録へ残します。

- ビルド日時
- `git rev-parse HEAD` のcommit SHA
- publisher ID
- Marketplace extension ID `querygantt-internal`
- asset/Contribution ID prefix `querygantt`
- version
- VSIXファイル名
- SHA-256
- `npm test` とReleaseビルドの結果

## 9. 完了判定チェックリスト

- [ ] ソースが `internal/integrated-querygantt` である
- [ ] 作業開始時のcommit SHAを記録した
- [ ] `publisher` が会社管理のpublisher IDである
- [ ] Marketplaceの `id` は `querygantt-internal` である
- [ ] URI、アセット名、Contribution IDの接頭辞は `querygantt` のままである
- [ ] `name` は `Query Gantt (Internal)` である
- [ ] タブ名は `Gantt (Internal)` である
- [ ] `public` は `false` である
- [ ] `Overview.md` に社内版の注意書きがある
- [ ] `support.example.com` や `YOUR_...` が残っていない
- [ ] 9つの自動テストが成功した
- [ ] タイムゾーン追加テストが成功した
- [ ] ReleaseビルドとJSHintが成功した
- [ ] `wwwroot` に `#{...}#` が残っていない
- [ ] tfx-cliによるVSIX作成が成功した
- [ ] VSIX内のpublisher、ID、version、DisplayNameを確認した
- [ ] VSIXのSHA-256を記録した

## 10. VSIX作成後の流れ

Azure DevOps Servicesでは、通常、手元のVSIXを組織へ直接インストールするのではなく、Marketplaceのpublisher管理画面へ非公開拡張としてアップロードします。

1. [Publishing Portal](https://marketplace.visualstudio.com/manage/publishers/)で、manifestと同じpublisher IDを選ぶ。
2. `New extension` → `Azure DevOps` からVSIXをアップロードする。
3. 拡張が非公開であることを確認する。
4. `Share/Unshare` から `YOUR_AZDO_ORGANIZATION` と共有する。
5. 対象組織の管理者が拡張をインストールする。
6. Azure DevOpsを再読み込みし、Organization settings → Extensionsで導入を確認する。
7. プロジェクトのManage featuresで `Query Gantt (Internal)` を有効にする。
8. Queries画面で `Gantt (Internal)` タブを開き、社内データでスモークテストする。

更新版をアップロードするときは、拡張を削除して新規登録するのではなく、同じ `publisher.querygantt-internal` のversionを増やして更新します。

## 11. 社内導入前の注意事項

- この拡張は現在 `vso.work`、`vso.work_write`、`vso.work_full` scopeを要求します。特に書き込み権限は、Backlog順のドラッグ更新で使用します。会社の拡張審査担当者にmanifestとソースを提示してください。
- `public: false` のままにします。社外公開はこの手順の対象外です。
- 元のEmaIT版を装わないよう、publisher、表示名、タブ名、Overview、サポート先を社内版として明示します。
- `internal/integrated-querygantt` にはPR統合確認用の履歴があります。会社固有のpublisher ID、社内URL、VSIXはこのブランチへpushしません。
- `License.md` と同梱される第三者ライブラリのライセンスを残し、会社のOSS利用・配布ルールに従います。
- VSIXは実行コードを含む配布物です。社内の承認済み保管場所に置き、SHA-256と作成元commitを一緒に管理します。

## 12. よくあるエラー

### `Publisher ... does not match`

Releaseビルドの `--publisher` と、Publishing Portalで選んだpublisher IDが一致していません。大文字小文字を含め完全一致させ、Releaseビルドからやり直します。

### `Version ... already exists`

同じversionは再アップロードできません。たとえば `1.5.2.7` を使った後は、Releaseビルドの `--extension-version` とVSIXファイル名を `1.5.2.8` へ増やし、ReleaseビルドとVSIX作成をやり直します。

### `The extension already exists`

新規アップロードするVSIXの完全な識別子が、削除済みまたは既存の拡張と重複しています。生成manifestの `publisher` と `id` を確認し、今回の新規登録では `YOUR_COMPANY_PUBLISHER_ID.querygantt-internal` になっていることを確認します。削除済みの `YOUR_COMPANY_PUBLISHER_ID.querygantt` は使用しません。

### タブを開くと404または空白になる

生成manifestのMarketplace IDが `querygantt-internal` である一方、`properties.uri`、HTML内のCSS/JavaScript参照、Contribution IDの接頭辞が `querygantt` のままか確認します。また、`wwwroot` に `#{...}#` が残っていないか確認します。

### PowerShellで `npx.ps1` を実行できない

会社の実行ポリシーを独断で変更せず、`npx.cmd` を使用します。それでも実行できない場合は社内IT管理者へ相談します。

### 社内版がMarketplaceまたはAzure DevOpsで見つからない

次を順に確認します。

1. VSIXのpublisherが、アップロード先publisherと一致している。
2. Marketplace上で拡張が正常に検証済みになっている。
3. 対象Azure DevOps組織名と共有済みである。
4. 操作ユーザーが対象組織のインストール権限を持つ。
5. インストール後、ブラウザを再読み込みしている。

## 13. 公式参考資料

- [Package and publish extensions - Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview?view=azure-devops)
- [Extension manifest reference - Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/extend/develop/manifest?view=azure-devops)
- [Install extensions - Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/marketplace/install-extension?view=azure-devops)
