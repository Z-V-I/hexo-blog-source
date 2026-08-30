/**
 * GET /api/captcha - 后端生成随机数学题验证码
 * 返回签名令牌，登录时由后端校验答案
 */

async function hmacSign(payload, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = env.CAPTCHA_SECRET || 'captcha';

  // 生成随机数学题
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  const payload = JSON.stringify({ a, b, t: Date.now() });

  // 签名
  const signature = await hmacSign(payload, secret);

  // 返回题目 + 签名令牌（base64url 编码）
  const token = btoa(payload + '.' + signature)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return new Response(JSON.stringify({
    question: `${a} + ${b} = ?`,
    token,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
