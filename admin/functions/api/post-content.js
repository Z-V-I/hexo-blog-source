/**
 * 加密文章解锁接口（方案C：服务端校验密码，前端不暴露密码）
 *
 * POST /api/post-content  { path, password } -> 校验密码，签发一次性 HMAC token
 * GET  /api/post-content?path=xxx&token=xxx  -> 验证 token，仅当文章确实加密时返回正文 HTML
 *
 * 安全设计：
 * - 密码存于环境变量 POST_PASSWORD（不存在时默认 062524），绝不出现在前端
 * - token 用 HMAC-SHA256 签名，绑定 path + 5 分钟过期
 * - 只对 frontmatter 含 locked: true 的文章返回正文，防止读取其他文章
 * - 接口无需登录，任何人可发起，但无密码/无效 token 无法获取内容
 */

const TOKEN_TTL = 5 * 60 * 1000; // 5 分钟

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
}

function parseFrontmatter(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)/);
  if (!m) return { meta: {}, content: md };
  const meta = {};
  m[1].split('\n').forEach(line => {
    const kv = line.match(/^(\w[\w_-]*):\s*(.+?)\s*$/);
    if (!kv) return;
    let [, k, v] = kv;
    v = v.replace(/^["']|["']$/g, '');
    if (/^(true|false)$/i.test(v)) meta[k] = v.toLowerCase() === 'true';
    else meta[k] = v;
  });
  return { meta, content: m[2].trim() };
}

// ========== 轻量 Markdown → HTML 渲染（不依赖外部 API） ==========
function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(s) {
  // 先处理图片，再处理其他行内元素
  return escHtml(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px">')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderMarkdown(md) {
  if (!md) return '';
  let html = '';
  const lines = md.split('\n');
  let inCode = false, codeBuf = [], inList = false, inQuote = false;
  function closeLists() { if (inList) { html += '</ul>\n'; inList = false; } }
  function closeQuote() { if (inQuote) { html += '</blockquote>\n'; inQuote = false; } }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim().startsWith('```')) {
      if (inCode) {
        html += '<pre><code>' + escHtml(codeBuf.join('\n')) + '</code></pre>\n';
        codeBuf = []; inCode = false;
      } else { closeLists(); closeQuote(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeLists(); closeQuote(); const lv = h[1].length; html += `<h${lv}>${renderInline(h[2])}</h${lv}>\n`; continue; }
    if (/^[-*_]{3,}\s*$/.test(line.trim())) { closeLists(); closeQuote(); html += '<hr>\n'; continue; }
    if (line.trim().startsWith('>')) { closeLists(); if (!inQuote) { html += '<blockquote>\n'; inQuote = true; } html += '<p>' + renderInline(line.trim().replace(/^>\s?/, '')) + '</p>\n'; continue; }
    if (/^\s*[-*+]\s+/.test(line)) { closeQuote(); if (!inList) { html += '<ul>\n'; inList = true; } html += '<li>' + renderInline(line.replace(/^\s*[-*+]\s+/, '')) + '</li>\n'; continue; }
    if (/^\s*\d+\.\s+/.test(line)) { closeQuote(); if (!inList) { html += '<ul class="ol">\n'; inList = true; } html += '<li>' + renderInline(line.replace(/^\s*\d+\.\s+/, '')) + '</li>\n'; continue; }
    if (!line.trim()) { closeLists(); closeQuote(); continue; }
    closeLists(); closeQuote(); html += '<p>' + renderInline(line) + '</p>\n';
  }
  closeLists(); closeQuote();
  if (inCode) html += '<pre><code>' + escHtml(codeBuf.join('\n')) + '</code></pre>\n';
  return html;
}

async function gh(env, method, path, body) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const ghToken = env.GITHUB_TOKEN;
  if (!ghToken || !owner || !repo) throw new Error('GitHub 配置缺失');
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
  const headers = { 'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'blog-admin' };
  const opts = { method, headers };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub API ${res.status}`);
  return data;
}

function fromB64(str) { return decodeURIComponent(escape(atob(str.replace(/\n/g, '')))); }

async function sign(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// UTF-8 安全的 base64（支持中文路径）
function b64u(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64d(str) { return decodeURIComponent(escape(atob(str))); }

async function makeToken(env, path) {
  const secret = env.CAPTCHA_SECRET || 'captcha';
  const payload = `${path}|${Date.now()}`;
  const sig = await sign(secret, payload);
  return `${b64u(payload)}.${sig}`;
}

async function verifyToken(env, token, path) {
  try {
    const secret = env.CAPTCHA_SECRET || 'captcha';
    const dot = token.lastIndexOf('.');
    if (dot < 0) return false;
    const payload = b64d(token.slice(0, dot));
    const signature = token.slice(dot + 1);
    const expected = await sign(secret, payload);
    if (signature !== expected) return false;
    const [p, ts] = payload.split('|');
    if (p !== path) return false;
    if (Date.now() - Number(ts) > TOKEN_TTL) return false;
    return true;
  } catch { return false; }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);

  try {
    if (request.method === 'POST') {
      const { path, password } = await request.json();
      if (!path || !password) return json({ error: '参数不完整' }, 400);
      // 仅允许 _posts 下的文章
      if (!path.startsWith('blog/source/_posts/')) return json({ error: '路径不合法' }, 400);
      const expected = env.POST_PASSWORD || '<YOUR_POST_PASSWORD>';
      if (password !== expected) return json({ error: '密码错误' }, 403);
      const token = await makeToken(env, path);
      return json({ success: true, token });
    }

    if (request.method === 'GET') {
      const path = url.searchParams.get('path');
      const token = url.searchParams.get('token');
      if (!path || !token) return json({ error: '参数不完整' }, 400);
      if (!path.startsWith('blog/source/_posts/')) return json({ error: '路径不合法' }, 400);

      const ok = await verifyToken(env, token, path);
      if (!ok) return json({ error: 'token 无效或已过期' }, 403);

      // 读取文章并确认确实加密
      const data = await gh(env, 'GET', path);
      const md = fromB64(data.content);
      const { meta, content } = parseFrontmatter(md);
      if (!meta.locked) return json({ error: '该文章未加密' }, 403);

      // 本地渲染 Markdown（剥离 frontmatter，输出结构化 HTML）
      const html = renderMarkdown(content);

      return json({ success: true, html, title: meta.title || '' });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
