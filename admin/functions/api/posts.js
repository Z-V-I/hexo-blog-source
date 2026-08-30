/**
 * /api/posts - 文章 CRUD（通过 GitHub API 操作仓库文件）
 * GET     列出文章  |  GET ?path=xxx 获取单篇
 * POST    创建文章
 * PUT     更新文章
 * DELETE  软删除（移到 _hidden 目录）
 */

const POSTS_DIR = 'blog/source/_posts';
const HIDDEN_DIR = 'blog/source/_hidden';

// ========== 工具函数 ==========

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function verifyAuth(env, request) {
  try {
    const adminPass = env.ADMIN_PASSWORD;
    if (!adminPass) return false;
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
    const encoder = new TextEncoder();
    const data = encoder.encode(adminPass + adminPass + 'blog-salt');
    const hash = await crypto.subtle.digest('SHA-256', data);
    const expected = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return token === expected;
  } catch { return false; }
}

async function gh(env, method, path, body) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const ghToken = env.GITHUB_TOKEN;
  if (!ghToken || !owner || !repo) throw new Error('GitHub 配置缺失，请设置环境变量');
  // 对路径逐段 URL 编码（支持中文文件名）
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
  const headers = {
    'Authorization': `Bearer ${ghToken}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'blog-admin',
  };
  const opts = { method, headers };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub API ${res.status}`);
  return data;
}

function b64(str) { return btoa(unescape(encodeURIComponent(str))); }
function fromB64(str) { return decodeURIComponent(escape(atob(str.replace(/\n/g, '')))); }

function parseFrontmatter(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)/);
  if (!m) return { meta: {}, content: md };
  const meta = {};
  m[1].split('\n').forEach(line => {
    const kv = line.match(/^(\w[\w_-]*):\s*(.+?)\s*$/);
    if (!kv) return;
    let [, k, v] = kv;
    v = v.replace(/^["']|["']$/g, '');
    if (v.startsWith('[') && v.endsWith(']')) {
      meta[k] = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    } else if (/^(true|false)$/i.test(v)) {
      meta[k] = v.toLowerCase() === 'true';
    } else {
      meta[k] = v;
    }
  });
  return { meta, content: m[2].trim() };
}

function buildFrontmatter({ title, date, category, featured, locked }) {
  const now = date ? new Date(date) : new Date();
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const d = chinaTime.toISOString().replace('T', ' ').slice(0, 19);
  const lines = [`---`, `title: "${title || '无标题'}"`, `date: ${d}`, `categories: ${category || '生活'}`];
  if (featured) lines.push('featured: true');
  if (locked) lines.push('locked: true');
  lines.push('---', '');
  return lines.join('\n') + '\n';
}

function makeFilename(title, date) {
  const now = date ? new Date(date) : new Date();
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const ds = chinaTime.toISOString().slice(0, 10);
  const slug = (title || 'untitled').replace(/[^\w\u4e00-\u9fff]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'post';
  return `${ds}-${slug}.md`;
}

// ========== 列表文件 ==========
async function listDir(env, dir) {
  try {
    const data = await gh(env, 'GET', dir);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (e.message.includes('404')) return [];
    throw e;
  }
}

// ========== 主处理 ==========
export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (!(await verifyAuth(env, request))) return json({ error: '未授权' }, 401);

    const method = request.method;

    if (method === 'GET') {
      const url = new URL(request.url);
      const filePath = url.searchParams.get('path');
      if (filePath) return await getSingle(env, filePath);
      return await listAll(env, request);
    }
    if (method === 'POST') return await create(env, request);
    if (method === 'PUT') return await update(env, request);
    if (method === 'DELETE') return await softDelete(env, request);
    return new Response('Method not allowed', { status: 405 });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ========== GET 列表 ==========
// 并发获取文件内容（限制并发数，避免串行逐个请求导致慢）
async function fetchAllConcurrent(env, dir, files, hidden) {
  const CONCURRENCY = 5;
  const result = [];
  const mdFiles = files.filter(f => f.name.endsWith('.md'));
  let idx = 0;

  async function worker() {
    while (idx < mdFiles.length) {
      const i = idx++;
      const f = mdFiles[i];
      try {
        const data = await gh(env, 'GET', `${dir}/${f.name}`);
        const md = fromB64(data.content);
        const { meta } = parseFrontmatter(md);
        result.push({
          path: `${dir}/${f.name}`,
          title: meta.title || f.name.replace('.md', ''),
          category: meta.categories || '生活',
          date: meta.date || '',
          hidden,
          featured: !!meta.featured,
          locked: !!meta.locked,
        });
      } catch {}
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, mdFiles.length) }, () => worker());
  await Promise.all(workers);
  return result;
}

// 缓存键（与 listAll 一致）
const LIST_CACHE_KEY = 'https://admin.zvi.onl/api/posts-list-v2';

async function invalidateCache() {
  try {
    const cache = caches.default;
    await cache.delete(LIST_CACHE_KEY);
  } catch {}
}

async function listAll(env, request) {
  // 使用 Cloudflare Cache API 缓存列表 60 秒，避免每次刷新都慢
  const cacheKey = LIST_CACHE_KEY;
  try {
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      return json({ posts: JSON.parse(await cached.text()) });
    }
  } catch {}

  const [posts, hidden] = await Promise.allSettled([
    listDir(env, POSTS_DIR),
    listDir(env, HIDDEN_DIR),
  ]);

  const result = [];

  // 并发获取文件内容（避免串行逐个请求导致慢）
  if (posts.status === 'fulfilled') {
    result.push(...await fetchAllConcurrent(env, POSTS_DIR, posts.value, false));
  }

  if (hidden.status === 'fulfilled') {
    result.push(...await fetchAllConcurrent(env, HIDDEN_DIR, hidden.value, true));
  }

  result.sort((a, b) => b.date.localeCompare(a.date));

  // 写入缓存 60 秒
  try {
    const cache = caches.default;
    await cache.put(cacheKey, new Response(JSON.stringify(result), { headers: { 'Cache-Control': 'max-age=60' } }));
  } catch {}

  return json({ posts: result });
}

// ========== GET 单篇 ==========
async function getSingle(env, filePath) {
  const data = await gh(env, 'GET', filePath);
  const md = fromB64(data.content);
  const { meta, content } = parseFrontmatter(md);
  return json({
    title: meta.title || '',
    category: meta.categories || '生活',
    tags: meta.tags || [],
    date: meta.date || '',
    featured: !!meta.featured,
    locked: !!meta.locked,
    content,
  });
}

// ========== POST 创建 / 恢复 ==========
async function create(env, request) {
  const body = await request.json();

  // 恢复隐藏文章（从 _hidden 移回 _posts）
  if (body.restore) {
    const filename = body.path.split('/').pop();
    const hiddenPath = `${HIDDEN_DIR}/${filename}`;
    const postsPath = `${POSTS_DIR}/${filename}`;

    // 获取隐藏文件
    const current = await gh(env, 'GET', hiddenPath);

    // 创建到 _posts
    await gh(env, 'PUT', postsPath, {
      message: `[blog-admin] 恢复文章: ${filename}`,
      content: current.content,
    });

    // 删除隐藏文件
    await gh(env, 'DELETE', hiddenPath, {
      message: `[blog-admin] 恢复文章（已移出 _hidden）`,
      sha: current.sha,
    });

    await invalidateCache();
    return json({ success: true, path: postsPath });
  }

  // 正常创建新文章
  const { title, category, content, featured, locked } = body;
  const filename = makeFilename(title);
  const fullPath = `${POSTS_DIR}/${filename}`;
  const fileContent = buildFrontmatter({ title, category, featured, locked }) + (content || '');

  await gh(env, 'PUT', fullPath, {
    message: `[blog-admin] 新建文章: ${title}`,
    content: b64(fileContent),
  });

  await invalidateCache();
  return json({ success: true, path: fullPath });
}

// ========== PUT 更新 ==========
async function update(env, request) {
  const body = await request.json();
  const { path: filePath } = body;

  // 获取当前文件 SHA 和 frontmatter
  const current = await gh(env, 'GET', filePath);
  const md = fromB64(current.content);
  const { meta, content: rawContent } = parseFrontmatter(md);

  // toggle 模式：只切换 featured / locked 开关，不改内容
  if (body.toggle) {
    const field = body.field; // 'featured' | 'locked'
    if (field !== 'featured' && field !== 'locked') return json({ error: '无效的 toggle 字段' }, 400);
    const currentVal = !!meta[field];
    const fileContent = buildFrontmatter({
      title: meta.title,
      date: meta.date,
      category: meta.categories,
      featured: field === 'featured' ? !currentVal : meta.featured,
      locked: field === 'locked' ? !currentVal : meta.locked,
    }) + (rawContent || '');

    await gh(env, 'PUT', filePath, {
      message: `[blog-admin] ${field === 'featured' ? '切换精选' : '切换加密'}: ${meta.title || filePath}`,
      content: b64(fileContent),
      sha: current.sha,
    });
    await invalidateCache();
    return json({ success: true, featured: field === 'featured' ? !currentVal : !!meta.featured, locked: field === 'locked' ? !currentVal : !!meta.locked });
  }

  // 常规更新（保留原有 featured/locked 状态）
  const { title, category, content, featured, locked } = body;
  const fileContent = buildFrontmatter({
    title,
    category,
    featured: featured !== undefined ? featured : meta.featured,
    locked: locked !== undefined ? locked : meta.locked,
  }) + (content || '');

  await gh(env, 'PUT', filePath, {
    message: `[blog-admin] 更新文章: ${title}`,
    content: b64(fileContent),
    sha: current.sha,
  });

  await invalidateCache();
  return json({ success: true });
}

// ========== DELETE 软删除（移到 _hidden） ==========
async function softDelete(env, request) {
  const { path: filePath } = await request.json();
  const filename = filePath.split('/').pop();

  // 获取原文件
  const current = await gh(env, 'GET', filePath);

  // 创建隐藏文件
  const hiddenPath = `${HIDDEN_DIR}/${filename}`;
  await gh(env, 'PUT', hiddenPath, {
    message: `[blog-admin] 隐藏文章: ${filename}`,
    content: current.content,
  });

  // 删除原文件
  await gh(env, 'DELETE', filePath, {
    message: `[blog-admin] 隐藏文章（已移至 _hidden）`,
    sha: current.sha,
  });

  await invalidateCache();
  return json({ success: true });
}
