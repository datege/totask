# ToTask

在 VS Code 中用纯文本管理待办清单（`.todo`、`.tasks` 等）。

## 功能

- **语法高亮**：项目标题、任务符号、@标签、优先级
- **任务状态**：☐ 待办、✔ 完成、✘ 取消（完成/取消时若有 `@started` 自动追加 `@lasted` 耗时）
- **按 @标签 过滤折叠**：光标放在标签上，执行命令或右键菜单，折叠不含该标签的行
- **实时预览**：侧边 Webview 预览（类似 Markdown），编辑时自动刷新
- **HTML 导出**：浏览器预览或另存为 `.html`
- **计时**：`@started` / `@toggle`，完成时计算 `@lasted`
- **Org-Mode 归档**：子树移到 `{文件名}_archive.todo`
- **排序**：当前项目下按 `@due` 与 `@critical` / `@high` / `@low` 排序

## 快捷键

| 操作 | 快捷键 |
|------|--------|
| 标记完成/未完成 | `Ctrl+D` |
| 标记取消/恢复 | `Alt+C` |
| 新建任务 | `Ctrl+Enter` |
| 新建任务（含 @created） | `Ctrl+Shift+Enter` |
| 归档已完成 | `Ctrl+Shift+A` |
| Org-Mode 归档子树 | `Ctrl+Shift+O` |
| 插入 @due | `F4` |
| 排序 / 倒序 | `F5` / `F7` |
| 填充标签日期 / 重算耗时 | `Ctrl+Shift+T` |
| 侧边预览（同 Markdown） | `Ctrl+Shift+V` |
| 打开预览 | `Ctrl+K` 然后 `V` |

## 命令面板（Tasks:）

- 打开预览 / 侧边打开预览（编辑器标题栏也有预览按钮）
- 按光标下标签过滤折叠 / 清除标签过滤
- 折叠到含 @due 的任务
- 在浏览器中预览 HTML / 另存为 HTML…
- 插入 @started / @toggle
- 按截止日期与优先级排序

## 开发

```bash
npm install
npm run compile
```

按 `F5` 运行扩展，打开 `examples/sample.todo` 试用。

## 上传到 GitHub

本地已完成 `git init` 与首次提交（分支 `main`）。推送前需登录 GitHub：

```powershell
# 1. 安装 Git / GitHub CLI 后登录（浏览器授权）
gh auth login

# 2. 在项目目录创建远程仓库并推送（将 YOUR_USER 换成你的 GitHub 用户名）
cd d:\localsvn\project\totask
gh repo create YOUR_USER/totask --public --source=. --remote=origin --push
```

若仓库已在网页上建好，可手动添加远程并推送：

```powershell
git remote add origin https://github.com/YOUR_USER/totask.git
git push -u origin main
```

首次提交前请在本机配置 Git 身份（仅需一次）：

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

## 发布到 VS Code 市场

1. 在 [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage) 创建发布者（Publisher ID 须与 `package.json` 里 `publisher` 一致，默认 `totask`）。
2. 在 [Azure DevOps](https://dev.azure.com/) → User settings → Personal access tokens 创建令牌，范围勾选 **Marketplace** → **Manage**。
3. 在项目目录执行：
   ```powershell
   cd d:\localsvn\project\totask
   npx @vscode/vsce login totask
   npm run publish
   ```
   或一行：`npx @vscode/vsce publish -p <你的PAT> --allow-missing-repository`

## 许可

MIT
