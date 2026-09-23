# 知序自习室

初中数学、英语、语文自学网页。包含七、八、九年级共 9 个入门主题、45 道选择题、知识讲解、逐题解析、学习进度和真实积分排行榜。内容为原创入门示例，不代表某个教材版本的完整课程。

## 1.1 更新

- 首页新增错题本入口，支持按学科筛选、单题复习和跨主题连续复习；再次答对后自动移出。
- 曾经答对的题再次答错，也会重新进入错题本；历史积分保留，重新巩固不重复加分。
- 新增当前年级的三科学习进度，优先推荐最近未完成的主题。
- 手机答题窗口增加进度条、可触及的底部答题按钮和固定关闭按钮。
- 保存失败时在题目内显示错误，保留选择以便重试；昵称校验错误直接显示在修改窗口内。
- 答题反馈不再等待排行榜刷新，成果页不会被迟到的请求覆盖。
- 本地 JSON 写入和 D1 事务内计算奖励，避免同时提交重复领取积分。

已有 JSON 文件可以直接使用，不需要清空或手动迁移。Cloudflare D1 需应用新增的 `0002_review.sql` 迁移，`pnpm run deploy` 会自动应用尚未执行的迁移。升级前建议备份学习数据。

## 本地启动：用 JSON 保存数据

需要 Node.js 22 或更新版本。无需安装依赖即可启动：

```sh
node src/server.mjs
```

访问 `http://127.0.0.1:4173`。学习信息保存在 `.data/students.json`。每次写入串行执行并通过临时文件原子替换，防止同一个服务进程中的并发请求丢数据。运行期间不要手动编辑此文件；不要多个进程共用同一个文件。备份时先停止服务。

`PORT` 可以更换端口；`STUDY_DATA_FILE` 可以指定 JSON 文件的绝对路径。服务器默认只监听本机。

## 跑崩值规则

- 每题首次答对 +10。
- 同一主题的 5 道题全部答对，额外 +20；每个主题最多 70。
- 重复答对不加分；答错不扣分，可阅读解析后重试。
- 9 个主题合计最高 630 分。分数由服务端根据答题记录计算，前端不能直接提交分数。
- 排行榜只包含获得过积分的同学，按总分降序、加入时间升序排列，展示前 50 名；可显示自己的名次。

## 用户信息

仅保存随机用户编号、昵称、创建时间、答题进度以及登录凭据的哈希值。不要求真实姓名、手机号、年龄或邮箱。浏览器持有 HttpOnly / SameSite Cookie，线上 HTTPS 下使用 Secure。

这是浏览器身份制的首版，没有账号注册、跨设备同步或找回功能。清理 Cookie 后会产生新身份，原记录无法认领。昵称公开显示在榜单中，建议使用化名。当前也不包含针对恶意批量创建身份的完整反滥用系统，因此排行榜适合小范围学习，不宜直接作为正式竞赛成绩。

## 提交到 GitHub

创建一个空仓库，然后在项目目录执行（将 URL 换成你的仓库）：

```sh
git init -b main
git add .
git commit -m "Build junior self-study platform"
git remote add origin https://github.com/YOUR_NAME/junior-study.git
git push -u origin main
```

`.gitignore` 排除了实际用户 JSON、依赖目录和环境变量。不要提交 `.data/`、Cookie 或任何云服务密钥。

## 推荐上线方式：Cloudflare Workers + D1

Cloudflare 的运行环境不能使用本地 JSON 文件来持久保存多人数据，因此线上使用 D1；页面和接口共用本地版代码，只有存储适配器不同。

1. 安装 pnpm 11.19.0 后，运行 `pnpm install --frozen-lockfile` 安装部署依赖。保留仓库中的锁文件。
2. 登录：`pnpm exec wrangler login`。
3. 创建数据库：`pnpm exec wrangler d1 create junior-study`。
4. 将返回的数据库 ID 填入 `wrangler.jsonc` 的 `database_id`。该 ID 是资源编号，不是密钥。
5. 在 Cloudflare 的 **Workers & Pages → Create application → Import a repository** 中连接 GitHub 仓库。
6. Worker 名称设置为 `junior-study`，与 `wrangler.jsonc` 保持一致。
7. 构建命令设置为 `pnpm run check && pnpm test`，部署命令设置为 `pnpm run deploy`。本项目是静态文件加 Worker，不需要额外打包网页。
8. 首次部署会执行数据库迁移，再发布 Worker。以后推送 GitHub 会自动更新。

也可本地首次部署：`pnpm run deploy`。这会应用 D1 迁移并发布，必须先完成登录和数据库配置。

官方文档：[GitHub 自动部署](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/) · [D1](https://developers.cloudflare.com/d1/)

## Vercel

目前完整后端面向 Cloudflare D1。本项目的静态页面可以部署到 Vercel，但答题、昵称和排行接口需要同时移植并连接持久化数据库；不能直接在 Vercel 函数里改写 JSON 文件保存数据。建议当前版本优先用 Cloudflare。

## 验证

```sh
node --test tests/*.test.mjs
npm run check
```

测试覆盖 JSON 持久化、并发首次答题奖励、主题完成奖励、错题进入/移出、再次答错重新进入、历史数据兼容、身份隔离、昵称校验、跨来源写入拒绝、答案隐藏，以及 D1 SQL 与 JSON 行为一致性。

## 扩展课程

编辑 `src/curriculum.mjs`。每个主题应提供独立编号、学科、年级、讲解、示例和题目。正确答案与解析只通过判题接口返回，初次加载不发送给网页。

已经上线的题目编号应保持稳定；更改题目或正确答案时需要考虑已有进度迁移，避免错误继承成绩。

## 当前交付状态

- 本地版已通过真实浏览器交互检查，包括答题、解析、重试、刷新恢复、改名与排行榜。
- 已检查 320、360、390、430、768、1440 像素宽度，无横向溢出；移动端使用底部导航与单列课程卡片。新增错题复习、网络中断重试、慢排行榜和弹窗内错误提示均通过浏览器检查。
- JSON 与 D1 SQL 的积分、持久化、隔离测试通过。D1 SQL 在本地 SQLite 中验证，尚未连接真实云数据库。
- Cloudflare 部署配置已提供，数据库 ID 需要填写。当前机器的 Worker 打包预检受到目录访问限制，尚未完成云端打包或部署验证。
- 当前浏览器未提供 WebMCP 原生接口，相关增强功能采用能力检测，不影响普通学习流程；未验证原生 WebMCP 调用。
