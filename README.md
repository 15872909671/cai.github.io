# CAI

采用浅色学术科技风、内容门户与轻量交互线条的博客，包含技术博客、作品集合和面试经历。使用原生 HTML/CSS/JavaScript，不依赖 npm 包或第三方字体。

## 本地预览

先运行 `node build.mjs`，然后运行 `python -m http.server 8080`，访问 http://localhost:8080 。也可以直接打开 index.html。

## 内容维护

- `content/site.json`：个人信息、简历、技术帖子、作品、面试经历和随笔。
- 正文使用 `sections` 数组，每段支持 `title`、`text`、`list`、`code`。外部来源放在 `links`，跨集合链接放在 `related`。
- 所有模板都有明确标记。不要把示例当成真实面经、企业评价或已完成项目。
- 修改内容后运行 `node build.mjs`，将源文件和生成文件一起提交。

## 部署

GitHub Pages 使用 main 分支。根目录和 docs/ 均包含同一份生成站点，选择 `/(root)` 或 `/docs` 都可以；后续统一运行构建脚本同步两份产物。无需自定义域名。

## 页面与边界

哈希路由支持直接打开文章、浏览器前进后退和 GitHub Pages 子目录路径。全站搜索支持标题、标签和正文，Ctrl/Cmd K 打开、Esc 关闭。

网站使用 GitHub Pages 托管前端，写作后台使用 Supabase Auth 和数据库；数据库完成初始化后才启用在线读取。不要在仓库内提交私密档案。简历目前为待补充状态。


首页动态遵循系统减少动态偏好；离开首页或隐藏标签页时停止动画。Canvas 不可用时显示静态线条图形。

企业集已从公开页面、路由、搜索和构建数据中移除。本地 .local-private 不得上传；历史提交中的公开示例不会因此自动消失。

## 栏目层级

`content/site.json` 中的 `navigation` 控制顶栏和文件树，`children` 可递归嵌套。移动节点即可把顶栏栏目收进子目录；保留 `id` 和 `href`，原有帖子链接仍然有效。`essays` 保存随笔帖子，与技术帖子使用同样的字段。

## 文件树

顶栏鼠标悬浮展开子栏目，也支持点击和键盘。侧边树仅展示当前栏目（或当前帖子的所属栏目），仍可全部展开/收起。

可在 `content/site.json` 中添加 `folders` 数组，每项有 `id`、`name`、`collection` 和 `parent_id`（根文件夹填 null）。collection 可为 knowledge、projects、interviews、essays。帖子使用 `folder_id` 指定父文件夹，未指定则放在栏目根目录。文件夹路由为 `#/folder/<编码后的 id>`，支持嵌套。

不设置 folders 时自动把现有技术分类转换为文件夹，保留旧地址。在线写作入口为 `admin.html`。初始化方法见 `supabase/README.md`。
