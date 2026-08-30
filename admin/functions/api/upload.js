/**
 * POST /api/upload - 图片上传到 GitHub 仓库 blog/source/images/
 * Body: { filename, dataUrl }  其中 dataUrl 为 base64 图片（前端已压缩为 WebP）
 * 返回: { url: '/images/xxx.webp' }
 */

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

function makeSafeName(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const safe = base.replace(/[^\w\u4e00-\u9fff-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'img';
  const ts = Date.now().toString(36);
  return `${safe}-${ts}.webp`;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!(await verifyAuth(env, request))) return json({ error: '未授权' }, 401);

  try {
    const { filename, dataUrl } = await request.json();
    if (!filename || !dataUrl) return json({ error: '参数不完整' }, 400);

    // 提取 base64 数据
    const m = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) return json({ error: '图片格式不合法' }, 400);
    const ext = m[1];
    const base64 = m[2];

    const name = makeSafeName(filename.replace(/\.[^.]+$/, '') + '.' + ext);
    const fullPath = `blog/source/images/${name}`;

    // 上传到 GitHub
    await gh(env, 'PUT', fullPath, {
      message: `[blog-admin] 上传图片: ${name}`,
      content: base64,
    });

    return json({ success: true, url: `/images/${name}`, path: fullPath });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
