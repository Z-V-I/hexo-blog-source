/**
 * POST /api/send-code - 验证密码+计算题 → 生成验证码 → 通过中继发邮件
 * GET  /api/send-code?code=xxx&email=xxx - 验证验证码
 */

// 使用 in-memory Map 存储验证码（单 Worker 实例内有效）
const codeStore = new Map();

/** 校验后端生成的验证码令牌 */
async function verifyCaptcha(captchaToken, captchaAnswer, secret) {
  try {
    if (!captchaToken || captchaAnswer === undefined) return false;

    // base64url 解码（还原 + / =）
    const normalized = captchaToken
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const decoded = atob(padded);
    const dot = decoded.lastIndexOf('.');
    if (dot < 0) return false;

    const payload = decoded.slice(0, dot);
    const signature = decoded.slice(dot + 1);

    // 重新计算 HMAC 签名
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (signature !== expected) return false;

    // 解析 {a, b}，校验答案
    const { a, b, t } = JSON.parse(payload);
    if (Date.now() - t > 5 * 60 * 1000) return false; // 5分钟过期
    return a + b === Number(captchaAnswer);
  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { email, password, captchaToken, captchaAnswer } = await request.json();

    // 校验后端计算题
    if (!(await verifyCaptcha(captchaToken, captchaAnswer, env.CAPTCHA_SECRET || 'captcha'))) {
      return json({ error: '计算题答案错误，请重新输入' }, 401);
    }

    // 验证管理员身份
    const adminEmail = env.ADMIN_EMAIL;
    const adminPass = env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPass) return json({ error: '管理员账号未配置' }, 500);
    if (email !== adminEmail || password !== adminPass) {
      return json({ error: '邮箱或密码错误' }, 401);
    }

    // 生成验证码
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 5 * 60 * 1000;
    codeStore.set(email, { code, expiresAt });

    // 通过中继发送邮件
    const relayUrl = env.RELAY_URL;
    const relayToken = env.RELAY_TOKEN;

    let relayOk = false;
    try {
      const resp = await fetch(relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-relay-token': relayToken,
        },
        body: JSON.stringify({
          to: email,
          code,
          fromName: '我的博客',
          subject: '博客后台登录验证码',
          text: '你的博客后台登录验证码是：' + code + '\n有效期 5 分钟。如非本人操作请忽略。',
        }),
      });
      relayOk = resp.ok;
      if (!resp.ok) {
        console.log('Relay returned', resp.status, await resp.text());
      }
    } catch (e) {
      console.log('Relay error:', e.message);
    }

    if (relayOk) {
      return json({ success: true, message: '验证码已发送到邮箱' });
    } else {
      // 中继不可用时，直接返回验证码
      return json({ success: true, code, message: '邮件中继暂不可用，请使用以下验证码' });
    }
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// GET - 验证验证码
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  const code = url.searchParams.get('code');

  if (!email || !code) return json({ error: '参数不完整' }, 400);

  const stored = codeStore.get(email);
  if (!stored) return json({ error: '验证码不存在或已过期，请重新获取' }, 401);
  if (Date.now() > stored.expiresAt) { codeStore.delete(email); return json({ error: '验证码已过期，请重新获取' }, 401); }
  if (stored.code !== code) return json({ error: '验证码错误' }, 401);

  codeStore.delete(email);

  // 生成登录 token
  const adminPass = env.ADMIN_PASSWORD;
  if (!adminPass) return json({ error: '管理员密码未配置' }, 500);
  const encoder = new TextEncoder();
  const data = encoder.encode(adminPass + adminPass + 'blog-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  const token = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');

  return json({ success: true, token });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
