# ToTask

在 VS Code 中用纯文本管理待办清单（`.todo`、`.tasks` 等）。

仓库：https://github.com/datege/totask

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

## 发布到 VS Code 市场

### 1. 创建发布者（仅需一次）

1. 打开 [Visual Studio Marketplace 管理](https://marketplace.visualstudio.com/manage)
2. 用 **Microsoft 账号**登录
3. 点击 **Create publisher**，Publisher ID 填 **`totask`**（须与 `package.json` 中 `"publisher": "totask"` 一致）

### 2. 创建 Azure DevOps PAT

1. 打开 [Azure DevOps](https://dev.azure.com/) → 用户图标 → **Personal access tokens**
2. **New Token**，Scopes 勾选 **Marketplace** → **Manage**
3. 复制令牌（只显示一次）

### 3. 登录并发布

```powershell
cd d:\localsvn\project\totask
npm run compile
npx @vscode/vsce login totask
# 粘贴 Marketplace PAT（不是 GitHub Token）

npm run publish
```

或一行发布：

```powershell
npx @vscode/vsce publish -p <Marketplace_PAT>
```

成功后：https://marketplace.visualstudio.com/items?itemName=totask.totask

### 4. 后续更新

修改 `package.json` 的 `version`，更新 `CHANGELOG.md`，再执行 `npm run publish`。

## 许可

MIT
