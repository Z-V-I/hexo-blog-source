/**
 * POST /api/convert - TXT → Markdown (DeepSeek)
 * Body: { prompt }
 */

// IP 级简单频率限制（每分钟最多 5 次）
const RATE_LIMITS = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const window = 60 * 1000;
  const max = 5;
  if (!RATE_LIMITS.has(ip)) { RATE_LIMITS.set(ip, []); }
  const times = RATE_LIMITS.get(ip).filter(t => now - t < window);
  if (times.length >= max) return false;
  times.push(now);
  RATE_LIMITS.set(ip, times);
  return true;
}

// 校验管理员 token（与 auth.js 相同的 SHA-256 逻辑）
async function verifyToken(request, env) {
  const adminPass = env.ADMIN_PASSWORD;
  if (!adminPass) return false;
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  const encoder = new TextEncoder();
  const data = encoder.encode(adminPass + adminPass + 'blog-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  const expected = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return token === expected;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // 身份验证（前端已登录才带有效 token）
  if (!await verifyToken(request, env)) {
    return json({ error: '未授权，请先登录' }, 401);
  }

  // IP 频率限制
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return json({ error: '请求太频繁，请 1 分钟后重试' }, 429);
  }

  try {
    const { prompt, mode = 'rewrite' } = await request.json();
    if (!prompt?.trim()) return json({ error: '内容为空' }, 400);

    const deepseekKey = env.DEEPSEEK_API_KEY;
    if (!deepseekKey) return json({ error: 'API 密钥未配置，请联系管理员设置 DEEPSEEK_API_KEY' }, 500);

    // mode: rewrite=AI 重写（完全重写）；light=轻微变动（只改排版，文字几乎不变）
    const isLight = mode === 'light';
    const systemPrompt = isLight
      ? '你是一个排版助手。请将用户提供的纯文本内容整理为规范的 Markdown 格式：正确使用标题层级、段落、列表、引用、加粗等 Markdown 语法。要求：1) 保留原文的所有文字内容，几乎不做增删改写 2) 只调整排版和格式，不改变事实、数字、专有名词 3) 不要添加原文没有的内容 4) 直接输出 Markdown，不要任何解释。'
      : '你是一个专业的博客写作助手。只输出 Markdown 格式的文章，不要任何解释。';

    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: isLight ? 0.1 : 0.4,
        max_tokens: 8000,
      }),
    });

    const data = await res.json();
    if (!res.ok) return json({ error: 'DeepSeek API 错误: ' + (data.error?.message || '未知') }, 500);

    const markdown = data.choices?.[0]?.message?.content || '';
    if (!markdown) return json({ error: 'AI 返回空内容' }, 500);

    let title = '';
    const m = markdown.match(/^#\s+(.+)$/m);
    if (m) title = m[1].trim();

    let html = '';
    if (env.GITHUB_TOKEN) {
      try {
        const mdRes = await fetch('https://api.github.com/markdown', {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: markdown, mode: 'gfm' }),
        });
        if (mdRes.ok) html = await mdRes.text();
      } catch {}
    }

    return json({ markdown, html, title });
  } catch (err) {
    return json({ error: '转换失败: ' + err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
