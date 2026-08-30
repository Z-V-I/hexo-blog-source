# 某咸鱼的个人博客系统

一个基于 **Hexo + Cactus 主题** 构建的个人博客，配套一个功能强大的 **AI 写作管理后台**，以及完整的 **评论系统 + 数据监测** 生态。

> 本仓库为**公开源码包**，已去除所有敏感信息（API Key、密码、Token 等均替换为 `<YOUR_XXX>` 占位符）。部署时请参考下方配置说明填入你自己的密钥。

---

## 📌 一、项目全景架构

```
用户写 txt ──► 管理后台(admin) ──► DeepSeek 转 Markdown ──► GitHub API 写入仓库
     ▲                                                          │
     │                                                          ▼
     │                                      Git 集成触发 Cloudflare Pages 自动部署
     │                                                          │
     └─────────────────── Cloudflare Pages 构建上线 ◄──────────┘
                                     │
                     ┌───────────────┼───────────────┐
                     ▼               ▼               ▼
                 Twikoo 评论    Umami 统计    GA / Clarity
```

整个项目由多个开源/免费服务组合而成，核心特色是**管理后台**、**自定义配色**、**精选/加密文章**和**AI 写作**。

---

## 📦 二、项目组成

### 1. 博客前端 — `blog/`
- **框架**：Hexo（静态站点生成器）
- **主题**：Cactus（轻量、简洁、响应式）
- **特色功能**：
  - 5 套自定义配色方案（暗黑/茉莉/云端/紫霞/敦煌），右上角随时切换
  - **精选文章**：`featured` 页面展示精选文章
  - **加密文章**：支持 `locked` 标记，通过后台 API 校验密码后解锁阅读
  - **全屏浏览**：右上角「全屏/退出」按钮，全屏沉浸式阅读
  - **PWA 支持**：`manifest.json` + `sw.js`，可安装为应用
  - **分享文章结构**：`_posts/`（公开）/ `_hidden/`（隐藏，`skip_render` 排除）

### 2. 管理后台 — `admin/`
- **框架**：Cloudflare Pages Functions（无服务器）
- **功能**：
  - 多重验证登录（计算题验证码 + 密码 + 邮箱验证码）
  - txt → AI → Markdown 一键写作（AI 重写 / 轻微变动两种模式）
  - 文章列表 / 编辑 / 隐藏 / 恢复 / 精选 / 加密
  - **图片上传**：插入图片到文章
  - **编辑即预览**：点编辑直接显示 Markdown 预览（可点击编辑文字）
  - 三分类（项目/生活/研究）快捷发布
  - 监视面板（Umami / GA / Clarity 快捷入口）
  - **全屏模式**：侧边栏「全屏/退出全屏」按钮
  - 文章列表并发加载 + 缓存优化，响应更快
- **API 接口**：`functions/api/`（auth / send-code / posts / convert / captcha / upload / post-content）

### 3. 评论系统 — Twikoo
- **部署**：Cloudflare Workers + D1 + R2
- **特性**：先审后发、Cloudflare Turnstile 人机验证、IP 拉黑、Server酱/PushDeer 微信提醒

### 4. 数据监测
| 平台 | 用途 | 特点 |
|------|------|------|
| **Umami** | 访问统计 | 自托管、无 Cookie、隐私友好 |
| **Google Analytics** | 流量分析 | 深度分析报告 |
| **Microsoft Clarity** | 用户行为 | 热力图 + 录屏 |

### 5. 自动部署
- **GitHub 集成**：推送 `blog/**` / `admin/**` 自动触发 Cloudflare Pages 构建
- **Cloudflare Pages**：托管两个项目（博客 + 后台）

---

## 🎨 三、配色方案（特色）

博客和后台都内置 **5 套配色**，右上角可随时切换：

| 方案 | 中文名 | 风格 | 主色 |
|------|--------|------|------|
| `dark` | 暗黑 | 深色极简 | 绿 `#2bbc8a` |
| `classic` | 茉莉 | 茉莉奶白底 + 天蓝标题 + 粉红文章标题 | 天蓝 `#5b9bd5` |
| `cloudflare` | 云端 | 深黑 + Cloudflare 橙 | 橙 `#f6821f` |
| `reference` | 紫霞 | 深蓝紫渐变 | 紫 `#7c5ce7` |
| `dunhuang` | 敦煌 | 浅棕底 + 翡翠绿 + 朱砂红 | 翡翠绿 `#3ca081` |

- **博客**：`blog/themes/cactus/source/css/_colors/*.styl`（编译用）+ `layout/_partial/scripts.ejs`（切换用 JS 配色）
- **后台**：`admin/style.css` 的 `[data-theme="xxx"]` 块

---

## 🔐 四、配置说明（部署前必读）

### 环境变量（Cloudflare Pages 后台设置，务必勾选 Encrypt 加密）

| 变量 | 说明 | 示例 |
|------|------|------|
| `ADMIN_PASSWORD` | 管理员密码 | `<YOUR_ADMIN_PASSWORD>` |
| `ADMIN_EMAIL` | 管理员邮箱 | `<YOUR_EMAIL>` |
| `QQ_EMAIL` | QQ邮箱（发件箱） | `<YOUR_QQ>@qq.com` |
| `QQ_SMTP_CODE` | QQ邮箱SMTP授权码 | `<YOUR_SMTP_CODE>` |
| `GITHUB_TOKEN` | GitHub 令牌（Contents 读写权限） | `<YOUR_GITHUB_PAT>` |
| `GITHUB_OWNER` | GitHub 用户名 | `<YOUR_GITHUB_OWNER>` |
| `GITHUB_REPO` | 仓库名 | `<YOUR_REPO_NAME>` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | `<YOUR_DEEPSEEK_API_KEY>` |
| `RELAY_URL` / `RELAY_TOKEN` | 邮件中继 | — |
| `CAPTCHA_SECRET` | 验证码签名密钥 | 任意字符串 |
| `POST_PASSWORD` | 加密文章默认密码 | `<YOUR_POST_PASSWORD>` |

> ⚠️ **重要**：Cloudflare Pages Functions 的环境变量**必须通过 Dashboard 的「加密变量」管理**，通过 `wrangler.toml [vars]` 或 API 设置都无法正确注入到 Functions 运行时。

### 追踪 ID（`blog/_config.yml`）

- Umami：`theme_config.umami_analytics.id`
- GA：`theme_config.google_analytics.id`
- Clarity：`theme_config.clarity.id`

---

## 🚀 五、部署步骤

### 1. 博客 + 后台（Cloudflare Pages）

1. 在 Cloudflare Pages 创建两个项目：`my-blog`（博客）、`blog-admin`（后台）
2. 连接 GitHub 仓库 `<YOUR_GITHUB_OWNER>/<YOUR_REPO_NAME>`
3. 配置环境变量（见上表，勾选 Encrypt）
4. 推送 `blog/**` 或 `admin/**` 到 `main` 分支，自动构建

### 2. 评论系统（Twikoo）

- 创建 Cloudflare Worker + D1 + R2
- 部署 Twikoo（v1.6.44）
- 配置 Turnstile / 先审后发等

### 3. 自定义域名

- Cloudflare Pages → Custom domains 绑定
- 例如：博客 `blog.zvi.onl`、后台 `admin.zvi.onl`

### 4. 加密文章

- 在文章 frontmatter 加 `locked: true`（后台可切换「加密」开关）
- 博客端访客需输入密码解锁，密码通过环境变量 `POST_PASSWORD` 配置

### 5. 全屏模式

- 博客：右上角「全屏/退出」按钮
- 后台：侧边栏「全屏/退出全屏」按钮

---

## 🗂️ 六、目录结构

```
├── blog/                       # 博客源码（Hexo）
│   ├── _config.yml             # 主配置（含配色/追踪/社交）
│   ├── source/                 # 文章、页面、图片
│   │   ├── _posts/             # 公开文章
│   │   ├── _hidden/            # 隐藏文章
│   │   ├── featured/           # 精选页
│   │   ├── about/              # 关于页
│   │   └── images/             # 图片（含后台上传）
│   └── themes/cactus/          # Cactus 主题（已定制）
│       ├── layout/             # 布局模板（含精选/全屏按钮/加密文章）
│       └── source/css/_colors/ # 5 套配色
├── admin/                      # 管理后台（Pages Functions）
│   ├── functions/api/          # 后端 API
│   ├── index.html / app.js / style.css
│   └── wrangler.toml
└── .github/workflows/          # 自动部署配置
```

---

## 🖥️ 七、管理后台使用说明

### 发文章
1. 打开后台 → 输入管理密码登录（计算题 + 密码 + 邮箱验证码）
2. 点击「新建文章」→ 选择文章类型（项目/生活/研究）
3. 上传 .txt 文件 → 选择「AI 重写」或「轻微变动」→ 点击「AI 写文章」
4. 预览确认（可直接点击编辑文字）→ 点击「发布」

### 编辑文章
1. 在文章列表点击「编辑」→ **直接显示已有内容的预览**（可编辑文字）
2. 改标题 / 类型 / 内容 → 点击「保存修改」

### 精选 / 加密 / 隐藏
- **精选**：点击「精选」开关 → 文章出现在首页精选区
- **加密**：点击「加密」开关 → 文章需密码解锁
- **隐藏**：点击「隐藏」→ 文章移到 `_hidden/`，不在博客显示

### 插入图片
编辑预览时，光标点到想插图的位置 → 点击「插入图片」→ 选择图片上传

---

## 📱 八、Android APK（可选）

博客和后台可打包为 Android TWA 应用（App 外壳 + 全屏网页），对应构建仓库：

- 博客 APK：`blog-zvi-apk`（应用包名 `onl.zvi.blog.app`）
- 后台 APK：`admin-zvi-apk`（应用包名 `onl.zvi.admin.app`）

打包原理：TWA（Trusted Web Activity）+ Chrome Custom Tabs。手机需安装 Chrome 才能全屏；无 Chrome 时回退系统浏览器，可用页面上的「全屏」按钮实现全屏。

---

## ⚖️ 九、版权与致谢

- 内容版权：© 2026 Zvi，采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
- 博客系统：Hexo + [Cactus](https://github.com/prog21/hexo-theme-cactus)
- 图标：[Font Awesome](https://fontawesome.com/)
- 评论：Twikoo
- 统计：Umami / Google Analytics / Microsoft Clarity
- 开发辅助：DeepSeek + CodeBuddy

---

> **安全提示**：本仓库为脱敏源码包。部署前请勿将任何真实密钥提交到公开仓库；建议在 Cloudflare 后台用环境变量 + 加密方式管理敏感信息。
