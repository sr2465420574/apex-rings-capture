# 上传 GitHub 操作说明

本说明只针对清理后的扩展源码目录。不要上传外层工作区、浏览器配置、历史排查报告或实际采集数据。

## 1. 检查账号公开信息

公开仓库会显示发布账号、提交记录和账号自行公开的资料。清理源码不能隐藏这些平台信息。

如果不希望提交显示私人邮箱，在 GitHub 的头像菜单进入 **Settings → Emails**，开启 **Keep my email addresses private**。网页操作将使用 GitHub 提供的 no-reply 地址；同时检查个人资料中的公开姓名、简介和邮箱。不要把任何验证码或登录凭证发给他人。

官方说明：[提交邮箱与隐私设置](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)。

## 2. 解压并检查发布文件

使用清理后的 `apex-browser-extension.zip`，解压后进入直接包含下列文件的文件夹：

```text
apex-browser-extension/
├── manifest.json
├── background.js
├── panel.html
├── panel.js
├── adapter.mjs
├── core.mjs
├── flow.mjs
├── queue.mjs
├── runtime.mjs
├── watchdog.mjs
├── tests.mjs
├── package.json
├── README.md
├── README.en.md
├── LICENSE
├── SECURITY.md
├── DISCLAIMER.md
├── PUBLISHING.md
├── .gitignore
└── scripts/
    └── check-release.mjs
```

这里没有图片、CSV、真实诊断、日志、浏览器缓存或 Git 提交历史。不要在上传前把个人采集结果复制进去。

若安装了 Node.js，可在该目录运行：

```sh
node scripts/check-release.mjs
node --test tests.mjs
```

仅发布和安装扩展时不必安装 Node.js。检查通过不代表完整安全审计。

## 3. 创建仓库

1. 登录 GitHub，打开 <https://github.com/new>。
2. Repository name 可填 `apex-rings-capture`。
3. Description 可填：`A local browser extension for Apex Legends ring-learning screenshots. Codex-generated code; non-commercial learning project.`
4. 选择 **Public**，或先选择 **Private** 检查后再公开。
5. 不额外生成 README、`.gitignore` 或许可证，因为发布包已经提供。
6. 点击 **Create repository**。

官方说明：[创建新仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)。

### 创建页面各项怎么填

| 页面字段 | 填写或选择 |
| --- | --- |
| Repository name | `apex-rings-capture` |
| Description | `A local browser extension for Apex Legends ring-learning screenshots. Codex-generated code; non-commercial learning project.` |
| Choose visibility | `Public`；需要先检查时也可以先选 `Private` |
| Add README | **Off**；发布包已有中文 `README.md` 和英文 `README.en.md`，顶部可切换语言 |
| Add .gitignore | `No .gitignore`；稍后上传发布包自带的 `.gitignore` |
| Add license | `No license`；稍后上传发布包自带的 MIT `LICENSE`，并不是项目最终不设许可证 |
| Jumpstart your project with Copilot → Prompt | 留空，无需另行生成项目 |

若页面上 Add README 已是 On，先关掉。核对这些选项后点击 **Create repository**，再上传完整源码。

## 4. 上传源码

1. 空仓库页面点击 **uploading an existing file**；已有仓库使用 **Add file → Upload files**。
2. 将解压文件夹**里面的文件和 `scripts` 子目录**拖入上传区，使 `README.md`、`LICENSE` 和 `manifest.json` 位于仓库根目录。
3. 核对上传列表中包含 `.gitignore`；如果文件选择器未显示点开头的文件，可在仓库通过 **Add file → Create new file** 新建 `.gitignore`，复制发布包中的相同内容。
4. 核对没有 `ApexRings`、图片、CSV、诊断、日志、账号凭证及本机配置。
5. Commit message 可填 `Publish v0.5.1 source and documentation`。
6. 根据页面提示选择提交到默认分支，并点击 **Commit changes** 或相应的提交按钮。若仓库规则要求分支或拉取请求，按提示提交。

不要仅把 ZIP 作为唯一文件上传，否则仓库主页不能直接展示源码和 README。`.gitignore` 不会阻止网页手动上传，也不会清除过去已经提交的文件。

官方说明：[通过网页上传文件](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)。

## 5. 发布后检查

1. 仓库首页能直接显示 README，许可证应显示为 MIT。
2. 可以打开 `SECURITY.md`、`DISCLAIMER.md` 和 `manifest.json`。
3. 通过 **Code → Download ZIP** 下载一次，解压后确认扩展根目录包含 `manifest.json`，再按 README 安装并检查一场样例。
4. 检查最新提交的作者信息及账号公开资料是否符合预期。若泄露了真实凭证，仅删除文件不够，应先撤销或轮换凭证，再清理历史。

本次无需上传任何实际比赛截图。地图、截图和第三方数据不属于 MIT 代码许可证的授权范围；确认相应许可后，才能决定是否另行发布，并标注来源和许可范围。
