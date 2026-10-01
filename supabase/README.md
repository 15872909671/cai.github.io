# Supabase 初始化

1. 项目 SQL Editor 中执行 `setup.sql`（建表、权限、现有公开帖子导入）。重复执行不会覆盖已有帖子。
2. Authentication → Users → Add user 中手动创建作者的邮箱密码账号并确认邮箱。密码由作者本人设置。Supabase 控制台账号和博客作者账号相互独立。
3. 把 `authorize-author.example.sql` 的 YOUR_AUTHOR_EMAIL 替换为作者邮箱后运行；查询结果必须包含正确账号。不要将填入真实邮箱的脚本提交到公开仓库。
4. 在 `admin.html` 登录，验证新建文件夹、保存草稿、发布和撤回。其他登录账号仍无写权限。
5. 验证匿名请求读不到草稿、不能写入后，将 `cloud-config.js` 的 enabled 改为 true，运行 `node build.mjs` 并发布。

前端只使用公开的 Publishable Key，绝不能填 service_role 或 Secret Key。作者名单只能通过数据库管理操作修改；公开 API 不允许自行授权。

## 行为

- 栏目下可创建嵌套文件夹，文件夹名称公开。草稿只有作者能读。当前未提供移动/删除文件夹和永久删除帖子，避免级联删除；可撤回帖子为草稿。
- 点击保存草稿才保存到数据库，不做浏览器持久化草稿。离开页面会提示未保存内容；可下载 Markdown 备份。
- 已发布帖子的“撤回并保存草稿”会从公开列表移除。新建帖子默认草稿，须主动发布。
- 会话仅保留在当前页面内存，刷新编辑页后需重新登录；不保存密码或长期令牌到 localStorage。
- 帖子用版本号防止旧窗口覆盖新修改。冲突时请下载内容，再重新打开编辑页。
- 启用在线读取后数据库是唯一公开内容源，故障时显示错误，不回退展示已撤回的旧帖子。
- 正文支持基础 Markdown：标题、段落、列表、粗体、HTTP(S) 链接、代码块；HTML 以文本显示，不支持上传附件和复杂 Markdown 扩展。
- 当前是作者管理一个博客，不是开放注册的多租户博客平台。

## 验证

`node build.mjs`、`node test.mjs`、`node scene-test.mjs`。

`cloud-test.mjs` 使用测试目录内的 `@electric-sql/pglite` 运行实际 PostgreSQL 权限与发布测试；先用包管理器在 `.test-runtime` 内安装它，再运行 `node cloud-test.mjs`。测试不会访问线上数据库。

官方参考：[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[公开 API Key](https://supabase.com/docs/guides/getting-started/api-keys)。
