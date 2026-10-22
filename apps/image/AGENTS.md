# SUNPB 图片模块

本目录是自习室仓库中的独立应用，只拥有 sunpb.com.cn/ai 和 /ai/* 路由、sunpb-image Worker 与独立 D1。不得覆盖根域名、自习室 Worker、学习数据库或 Cookie。父项目的数据保护规则继续适用于原站。

本模块的生产发布入口为在本目录执行 npm run deploy，由 scripts/deploy.mjs 完成测试、完整私有 SQL 备份、SQLite 恢复验证、增量迁移及发布后校验。不得绕过备份。未配置持久私有备份前不启用 CI 自动部署。正式图片销售须同时具备模型、私有图片存储与任务队列，并明确开启 SALES_ENABLED。

支付测试独立使用 payment_test_orders；每个私有测试链接只允许一笔 1 分钱真实订单。不向账户发放合成次数。PAYMENT_TEST_TOKEN、微信商户私钥、API v3 密钥、.dev.vars、.data 和证书文件不得上传 GitHub。付款由用户在微信内操作，不能模拟付款成功。

2026-10-22 服务端记录中有一笔 1 分钱订单，经微信签名查单返回成功并收到回调；用户随后反馈支付尚未成功并要求找到测试页面，因此恢复私有测试入口，换用新的随机 token，等待用户本人确认。旧订单及回调记录不得删除，也不能把旧记录等同于用户完成验收。当前 PAYMENT_TEST_ENABLED 为 1，正式 SALES_ENABLED 仍为 0；没有用户明确确认结束，不得再次自动关闭测试。测试 token、商户配置仍须保持私有。
