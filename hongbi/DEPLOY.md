# 红笔 HONGBI · 生产部署指南

域名：`rbaihu.com`
服务器公网 IP：`36.142.108.126`
本机局域网 IP：`192.168.1.5`

---

## 第一步：DNS 解析（手动操作 ✅）

登录你的域名提供商（阿里云/腾讯云/Cloudflare 等）控制台：

1. 添加 **A 记录**：
   - 主机记录：`@`
   - 记录值：`36.142.108.126`
   - TTL：600

2. 添加 A 记录（可选）：
   - 主机记录：`www`
   - 记录值：`36.142.108.126`

> DNS 生效可能需要几分钟到几小时。

---

## 第二步：路由器端口转发（手动操作 ✅）

登录路由器管理页（通常 `192.168.1.1`）：

| 外部端口 | 内部 IP | 内部端口 | 协议 |
| ------ | --- | --- | --- |
| 80 | 192.168.1.5 | 8712 | TCP |
| 443 | 192.168.1.5 | 8712 | TCP |

---

## 第三步：启动 Caddy（自动 HTTPS + 反向代理）

### 3.1 下载 Caddy

从 https://caddyserver.com/download 下载 Windows 版，解压 `caddy.exe` 到 `E:\Software\caddy\`

### 3.2 创建 Caddyfile

在 `E:\Software\caddy\` 下创建文件 `Caddyfile`（无后缀）：

```caddy
rbaihu.com {
  reverse_proxy localhost:8712
}

www.rbaihu.com {
  redir https://rbaihu.com{uri}
}
```

### 3.3 启动

```bash
cd E:\Software\caddy
./caddy run
```

Caddy 自动从 Let's Encrypt 申请免费 SSL 证书。
访问 `https://rbaihu.com` 即可。

### 3.4 后台运行（可选）

```bash
./caddy start           # 后台启动
./caddy stop            # 停止
```

---

## 第四步：启动红笔服务

```bash
cd C:\Users\34940\lobsterai\project\hongbi
node server/server.js
```

---

## 快速验证

```bash
# 本地测试
curl http://localhost:8712/api/health

# 外网测试（DNS + 端口转发完成后）
curl http://rbaihu.com/api/health
```

---

## 不使用 HTTPS 的简化方案

如果暂时不需要 SSL，可以：

1. 完成 DNS 解析 + 端口转发
2. 直接启动红笔服务
3. 通过 `http://rbaihu.com:8712` 访问

> 不推荐生产环境用 HTTP，但可以快速测试。
