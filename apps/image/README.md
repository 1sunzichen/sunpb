# SUNPB 合图与微信支付

自习室 GitHub 仓库中的独立应用，访问入口 `https://sunpb.com.cn/ai/`。新 Worker 仅接管 `/ai`、`/ai/*`，自习室根页面、旧 API、登录 Cookie 和学习数据库保持原样。图片账户与自习室昵称账户暂不互通。

## 当前阶段：微信支付待用户确认

2026-10-22 服务端留存一笔 ¥0.01 订单及合法回调，再次向微信签名查单仍返回支付成功。但用户随后反馈支付尚未成功，需要重新打开页面验证，因此不视为用户验收完成。详细范围和后续接续见 [交付记录](docs/handoff.md)。

临时联调入口已恢复（`PAYMENT_TEST_ENABLED=1`），使用新的私有 token；此前关闭时撤销的 token 不再使用。原订单和通知地址保留，晚到或重复的合法通知仍会核验处理。正式图片合成与充值尚未开放。

## 本版范围

- 图片合成界面：上传 1–3 张 JPG/PNG/WebP，编辑要求、比例，查看作品和购买记录。
- 微信 Native 支付：商户签名、平台证书验签、API v3 通知解密、查单、幂等入账。兼容现有小程序所用商户的证书模式。
- 支付测试代码：独立的 ¥0.01 测试账本，不发放图片合成次数；`/ai/payment-test/` 需私有链接访问，由用户亲自扫码确认。
- 正式销售默认关闭。图片模型、R2 和 Queue 尚未配置，不能用本版完成真实图片合成，也不允许正式充值。
- 支付由用户在微信内完成。生成二维码不代表付款或回调成功。

## GitHub 与 Cloudflare

本目录可以作为同一仓库内的独立项目，Cloudflare 根目录选 `apps/image`，Worker 名称 `sunpb-image`。`wrangler.jsonc` 已包含独立 D1 资源编号及严格限定的 `/ai` 路由。不要将本目录的配置覆盖到仓库根配置，也不要把项目名称改成 `junior-study`。

GitHub Actions 只运行检查、自动测试和构建；目前不自动部署。自动部署前需为包含用户与支付记录的 SQL 备份配置私有持久存储，不能依赖会销毁的 CI 临时文件。代码保存在 `codex/image-payment-integration` 分支，尚未合并到 `main`；根项目存在其他尚未提交的旧功能，不应一并提交或重新部署。

首次部署与后续更新在此目录执行：

```sh
npm ci
npm run deploy
```

发布脚本依次做语法检查、测试、构建、线上完整 SQL 导出、本地 SQLite 恢复验证、增量迁移、Worker 发布及已有账户/订单/账本保留校验。备份失败会停止发布，不会回灌旧数据。私有备份保存在 `.data/backups/`。

需要导入已准备的微信配置时：

```sh
npm run deploy -- --secrets .data/deploy-secrets.json
```

私有文件只能包含 `WECHAT_*`、`PAYMENT_TEST_TOKEN` 与 `DASHSCOPE_API_KEY`。实际密钥进入 Cloudflare Secrets，不写前端、不上传 Git。不要把 `.data`、`.dev.vars` 或商户证书发送到公开仓库。

## 本地开发

```sh
npm ci
npm run db:local
npm run dev
```

打开 `http://localhost:8788/ai/`。原先独立原型在 `/Users/iss/sunpb-image`，后续集成开发以本目录为准。若 8788 已被原型占用，可使用 `npx wrangler dev --port 8789`。本地支付回调仍需要可达的公网 HTTPS 地址。

后续若有新的测试请求，需要显式开启 `PAYMENT_TEST_ENABLED=1`、生成新的随机私有 token，并经安全发布入口更新。每个 token 只有一笔 30 分钟测试订单；不能恢复已经撤销的测试链接。结束时将开关设回 `0`，运行 `npm run deploy -- --close-payment-test`，该流程备份并验证数据、发布关闭状态、撤销临时 token 并再次核验。收到晚到的合法付款通知仍会记录，不能因关闭测试或二维码过期丢弃真实付款。

微信通知地址：`https://sunpb.com.cn/ai/api/payments/wechat/notify`。回调必须验证签名、商户、AppID、币种、金额、交易类型及订单号。测试订单与正式余额账本隔离。

## 正式开通合成

1. 准备可用的 DashScope 模型 API key，并验证真实多图合成。
2. 在账户中开通 R2，绑定私有图片桶与图片任务 Queue。存储、模型调用的费用由对应平台计费。
3. 在真实流程验证失败返还次数、私有图片访问和下载后，才开启 `SALES_ENABLED=1`。
4. 默认单价配置 `PRICE_CENTS=100`，正式销售前确认价格与服务规则。

完整测试覆盖注册和会话隔离、服务端计价、签名与金额校验、重复回调、平台证书轮换、队列失败返还、图片下载来源限制，以及 `/ai` 挂载与独立测试账本。测试中模型和付款结果使用隔离构造数据，不能代替用户的真实扫码确认。
