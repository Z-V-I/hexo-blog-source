export async function onRequest(context) {
  const { env } = context;
  const keys = Object.keys(env || {});
  return new Response(JSON.stringify({
    hasAdminPassword: !!env.ADMIN_PASSWORD,
    hasAdminEmail: !!env.ADMIN_EMAIL,
    hasDeepSeek: !!env.DEEPSEEK_API_KEY,
    hasGithubToken: !!env.GITHUB_TOKEN,
    envKeys: keys,
    envSample: {
      ADMIN_EMAIL: env.ADMIN_EMAIL || null,
      GITHUB_OWNER: env.GITHUB_OWNER || null
    }
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
