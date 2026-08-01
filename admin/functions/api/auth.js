/**
 * GET /api/auth - 验证 token 是否有效
 * Token 验证统一由 send-code.js 中的 GET 方法生成和验证
 */
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const adminPass = env.ADMIN_PASSWORD;
  if (!adminPass) return json({ error: '管理员密码未配置' }, 500);
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '');
  const encoder = new TextEncoder();
  const data = encoder.encode(adminPass + adminPass + 'blog-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  const expected = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (token === expected) {
    return json({ valid: true });
  }
  return json({ error: '无效 token' }, 401);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
