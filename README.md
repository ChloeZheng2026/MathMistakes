# 数学错题本

拍照上传数学错题，用豆包（火山方舟）诊断错因、定位母题、给出解题过程，并生成 2 道同类巩固题；可保存为错题集并打印成 A4 卷子。纯静态网页，可直接部署到 GitHub Pages。

## 文件

- `index.html`：页面
- `app.js`：程序逻辑
- `mathjax/`：公式渲染库（本地自带，国内打开不依赖外部 CDN）

## 部署到 GitHub Pages

1. 登录 GitHub，右上角 **+ → New repository**，名称例如 `cuotiben`，选 **Public**，点 **Create repository**。
2. 在新仓库页面点 **uploading an existing file**，把本文件夹里的所有内容（`index.html`、`app.js`、`README.md` 和整个 `mathjax` 文件夹）拖进去，点 **Commit changes**。
3. 进入仓库的 **Settings → Pages**，Source 选 **Deploy from a branch**，Branch 选 `main`、目录 `/ (root)`，点 **Save**。
4. 等 1～2 分钟，页面顶部会显示网址：`https://<你的用户名>.github.io/cuotiben/`。

## 首次使用

1. 在[火山方舟控制台](https://console.volcengine.com/ark)：
   - **开通管理** 里开通一个支持图片理解的豆包模型（如 Doubao-Seed-1.6-vision）；
   - **API Key 管理** 里创建一个 API Key。
2. 打开网页，点右上角 **设置**，填入 API Key；模型名称按控制台里显示的 Model ID 填写（也可以填推理接入点 `ep-…`）。点 **测试连接**，成功后点 **保存**。

## 说明

- API Key 和错题都只保存在当前浏览器里（localStorage / IndexedDB），不会上传到 GitHub。换手机或电脑时，用 **设置 → 导出备份 / 导入备份** 迁移错题。
- 网页是公开的，但别人打开后看不到你的 Key 和错题，需要填自己的 Key 才能使用。
- 打印：在 **打印** 页勾选题目 → **打印 / 存为 PDF**，纸张选 A4。
