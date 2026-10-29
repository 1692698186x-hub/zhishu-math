# 华为云部署准备

这里是已实现的部署入口。实际华为云资源尚未创建，也未宣称完成参赛云部署。

## 业务链路

浏览器通过受保护的 HTTPS 演示入口访问 Node 服务；模型选择 MaaS 或 DeepSeek；学习会话、作答证据和教学决策保存到 DCS Redis。每次写入比较当前记录版本，避免跨进程重复提交。未配置 Redis 的本机版继续使用原有 JSON 文件。

DCS 是业务存储，不是只在展示架构图里出现。配置 `REDIS_URL` 后读写失败会明确报错，浏览器保留草稿；不会把未保存的答案显示为已保存。原本机 JSON 不会被自动上传到新的 Redis 实例。

## 资源条件

- 一个可运行 Docker 的 ECS；一个已设置访问密码的 DCS Redis 实例。
- ECS 与 DCS 选择同一区域及 VPC，按实例要求设置安全组或 IP 白名单。Redis 端口只供应用所在网络使用。
- 实际支持 TLS 的实例使用 `rediss://`，保持证书验证；如实例使用专用 CA，挂载证书并设置 `REDIS_CA_FILE`。
- 公网演示需要可解析的域名、HTTPS 和演示访问账号。默认 Compose 只绑定本机地址，先通过 SSH 隧道验收。

区域、资源规格、计费方式和代金券覆盖范围需要结合用户账号的实际报价确认；当前文件不会创建或购买资源。

## 配置和检查

在部署主机复制 `deploy/cloud.env.example` 为 `deploy/.env.cloud`，填写模型配置与 DCS 私网连接串。密码应按 URL 编码，密钥及连接串只留在部署主机。

```sh
node deploy/preflight.cjs
docker compose -f deploy/compose.yaml up --build -d app
```

`preflight` 只检查配置形状，不输出配置值，也不冒充实际连通性测试。先确认容器健康，再在页面完成一轮学习，重启应用后恢复原题和实际作答，核对 Redis 中的业务记录。

完成私网验收后，填写域名和演示账号。`ZHISHU_DEMO_PASSWORD_HASH` 使用 Caddy 支持的 bcrypt 哈希，在环境文件里用单引号包住含 `$` 的哈希。不要把明文密码写进 Caddyfile。

```sh
node deploy/preflight.cjs --public
docker compose -f deploy/compose.yaml --profile public up -d
```

公网入口屏蔽本机配置页，模型与 Redis 配置由部署主机的环境文件注入。Caddy 负责 HTTPS 和演示访问保护；应用的 8877 端口维持本机绑定。

## 竞赛过程证据

按用户提供的规则截图，后续须实际借助已有智能体和 Skills 创建关联云服务并部署。应保留：获准使用的资源方案与费用、CodeArts/Skills 实际调用记录、资源创建结果、DCS 业务写入、部署日志、在线演示和重启恢复结果。

截图里的部署案例参考：[Skills 一键部署案例](https://gitcode.com/weixin_43883336/auto-deploy/blob/main/auto-deploy-case-study.md)。当前工具未能读取该页面，尚未声称复用或执行其中的 Skill。

已完成的 CodeArts 代码审查记录见 `docs/development/2026-10-28-v0.5.1-codearts.md`。这不能替代后续资源创建和部署的真实记录。

## 验证范围与官方资料

本机验证使用存储接口检查；GitHub 工作流另外运行真实 Redis 服务的跨客户端保存、恢复和版本冲突检查，以及 Docker 镜像构建和启动检查。成功结果以对应提交的 Actions 为准，不等于连接了华为云 DCS。

- [华为云 DCS 连接网络要求](https://support.huaweicloud.com/usermanual-dcs/dcs-ug-0312007.html)
- [Redis 官方 Node.js 连接与 TLS 文档](https://redis.io/docs/latest/develop/clients/nodejs/connect/)

DCS 中的证据可能被保留很久，正式试用前还需要确定备份、保留和清理规则。当前每个存储空间最多500轮会话，主要用于原型和受控演示。
