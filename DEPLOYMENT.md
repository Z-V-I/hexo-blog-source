# 部署说明与环境变量管理

## 一、架构总览

```
用户写 txt ──► 管理后台(admin) ──► DeepSeek 转 Markdown ──► GitHub API 写入仓库
     ▲                                                          │
     │                                                          ▼
     │                                Git 集成部署 (Cloudflare Pages)
     └───────────────────► 博客上线 (my-blog) ◄─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
          Twikoo 评论    Umami/GA/Clarity   博客与后台
```

两个 Cloudflare Pages 项目：
- **my-blog**（博客）：`https://blog.zvi.onl`
- **blog-admin**（后台）：`https://admin.zvi.onl`

均通过 **GitHub 集成**部署，推送代码到 `main` 分支自动构建。

---

## 二、关键：环境变量管理（务必阅读）

> ⚠️ **重要教训**：Cloudflare Pages Functions 的环境变量，**必须通过 Dashboard 的「加密变量」管理**，通过 `wrangler.toml [vars]` 或 API 设置都可能无法正确注入到 Functions 运行时 `context.env`。

### 正确配置方式（Cloudflare Dashboard）

1. 进入 Cloudflare Dashboard → Workers & Pages → `blog-admin` → **Settings → Environment variables**
2. 点击 **添加变量**，**务必勾选「Encrypt（加密）」**
3. 添加以下变量（Production 环境）：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `ADMIN_PASSWORD` | 管理员密码 | `<YOUR_ADMIN_PASSWORD>` |
| `ADMIN_EMAIL` | 管理员邮箱 | `<YOUR_ADMIN_EMAIL>` |
| `DEEPSEEK_API_KEY` | DeepSeek 密钥 | `<YOUR_DEEPSEEK_API_KEY>` |
| `GITHUB_TOKEN` | GitHub PAT | `<YOUR_GITHUB_PAT>` |
| `GITHUB_OWNER` | GitHub 用户名 | `<YOUR_GITHUB_OWNER>` |
| `GITHUB_REPO` | 仓库名 | `<YOUR_REPO_NAME>` |
| `QQ_EMAIL` | QQ 邮箱 | `<YOUR_QQ_EMAIL>` |
| `QQ_SMTP_CODE` | QQ SMTP 授权码 | `<YOUR_QQ_SMTP_CODE>` |
| `RELAY_URL` | 邮件中继地址 | `https://.../mail-relay/send` |
| `RELAY_TOKEN` | 中继 token | `<YOUR_RELAY_TOKEN>` |
| `CAPTCHA_SECRET` | 验证码签名密钥 | 任意字符串 |

4. **保存后** Cloudflare 会自动触发一次新部署，将加密变量绑定到 Functions 运行时。

### 为什么不能用其他方式？

| 方式 | 是否注入运行时 | 说明 |
|------|:---:|------|
| Dashboard 加密变量（Encrypt） | ✅ | **唯一可靠方式** |
| Dashboard 纯文本变量 | ❌ | 无法编辑/删除，且不注入 |
| `wrangler.toml [vars]` | ❌ | 会占用变量名，且 Git 集成部署不读取 |
| Cloudflare API 设置 | ❌ | 写入配置但不触发运行时绑定 |

---

## 三、部署方法

### 1. 博客部署（my-blog）

```bash
# 推送 blog/ 目录下的改动到 main 分支
git add blog/
git commit -m "更新博客"
git push origin main
```

Git 集成自动构建部署，约 1-2 分钟生效。**页面底部版本号更新即代表部署成功。**

### 2. 后台部署（blog-admin）

```bash
# 推送 admin/ 目录下的改动
git add admin/
git commit -m "更新后台"
git push origin main
```

**注意**：后台代码改动部署后，**环境变量通过 Dashboard 加密变量管理**，不受代码部署影响。

### 3. 修改环境变量

```bash
# 在 Dashboard 修改加密变量后，需要重新部署才生效
# 推送任意 admin/ 改动，或 Dashboard 保存后自动触发
```

---

## 四、版本号机制

- **博客**：`blog/_config.yml` → `theme_config.version`，显示在页脚
- **后台**：`admin/index.html` → `admin-version`，显示在侧栏底部
- 每次部署后确认版本号已更新，即代表推送成功

---

## 五、监测代码（已配置）

| 监测 | 博客 | 后台 |
|------|:---:|:---:|
| Umami（自托管无 Cookie） | ✅ `b1.zvi.onl/script.js` | ✅ |
| Google Analytics | ✅ `<YOUR_GA_ID>` | ✅ `<YOUR_GA_ID>` |
| Microsoft Clarity | ✅ `<YOUR_CLARITY_ID>` | - |

---

## 六、常见问题

### Q：登录提示「管理员账号未配置」
- **原因**：环境变量未注入，`env.ADMIN_PASSWORD` / `env.ADMIN_EMAIL` 为空
- **解决**：在 Dashboard 添加 **加密变量**（见上表），保存后重新部署

### Q：AI 写作提示「DeepSeek 余额不足」或「Authentication Fails」
- **原因**：`DEEPSEEK_API_KEY` 未配置、无效或余额不足
- **解决**：检查加密变量 `DEEPSEEK_API_KEY`，去 DeepSeek 平台充值/更换密钥

### Q：博客不更新
- **原因**：Git 集成 webhook 未触发，或本地分支不是 main
- **解决**：确认推送到 `main` 分支，检查 Cloudflare Pages 构建日志
