# 碑间 · 寻字完全体

本目录是可单独部署的寻字体验，含寻字、四种字形选择、六项拓印材质、16 型结果、个人拓片 PNG 下载、字体和授权文本。无需安装前端依赖或连接后端。

## 本地预览

在本目录运行 `node preview-server.cjs`，打开 `http://127.0.0.1:4180/`。请通过 HTTP/HTTPS 打开；浏览器通常不允许 `file://` 页面加载模块和字体。

## 接入正式网站

将整个目录放到网站静态资源下，例如 `/xunzi/`，让 `/xunzi/index.html` 可访问，再从正式网站链接到 `/xunzi/`。若需要嵌入现有页面，也可用同源 iframe 指向该路径：

```html
<iframe title="碑间寻字" src="/xunzi/" style="display:block;width:100%;height:100vh;border:0"></iframe>
```

若要把界面直接并入现有页面，可使用本目录的 `name-experience.css`、`typography.css`、`name-loader.js`、`name-experience.js`、`name-core.js`、`name-finish.js` 和 `assets/`。页面需要一个带 `data-page="name"`、`page--active`、`name-page` 类的容器，以及内部的 `#name-app`；`index.html` 是最小示例。字库、字体和材质 URL 相对**页面地址**解析，请保持本目录结构，或在接入时统一改成部署路径。页面切换到寻字时发送 `site:page` 事件，`detail.route` 设为 `name`，便可恢复同一浏览器会话的进度。

## 内容与文件

- `assets/name/profiles.json`：四组 16 型叙事。
- `assets/name/coverage.json`：四款字体的汉字覆盖表。
- `assets/name/materials/`：11 张石材与纸张材质图。
- `assets/name/fonts/`：运行用 WOFF2 字体与相应 OFL 授权文本。
- `assets/name/README.md`：字形、材质到结果的完整判定表。
- `manifest.json`：运行文件的 SHA-256 校验值。

姓名与选择只保存在浏览器 `sessionStorage`，页面不向服务端提交姓名。出结果前的制拓预览不绘制人格印章；正式结果和下载 PNG 才显示。拓片及解读属于数字艺术演绎，不是文物原拓或心理测评。
