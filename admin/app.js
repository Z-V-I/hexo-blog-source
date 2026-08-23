/* ============================================
   Blog Admin Panel
   邮箱+密码+计算题 → 邮箱验证码 → 登录
   ============================================ */

const state = {
  token: sessionStorage.getItem('blog_token') || null,
  currentView: 'login',
  posts: [],
  selectedFile: null,
  editSelectedFile: null,
  editFilePath: null,
  captcha: { a: 0, b: 0 },
  loginEmail: '',
  loginPassword: '',
};

// ========== API ==========
async function api(path, options = {}) {
  const headers = options.headers || {};
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...options, headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || (res.status === 401 ? '邮箱或密码错误' : '请求失败'));
  }
  return data;
}

// ========== 计算题（后端生成） ==========
async function generateCaptcha() {
  const el = document.getElementById('captcha-question');
  const ans = document.getElementById('captcha-answer');
  state.captcha = { token: '', a: 0, b: 0 };
  if (el) el.textContent = '加载中...';
  if (ans) ans.value = '';
  try {
    const data = await api('/api/captcha');
    state.captcha = { token: data.token, a: 0, b: 0 };
    if (el) el.textContent = data.question;
  } catch {
    if (el) el.textContent = '加载失败，点击刷新';
  }
}

// ========== 登录（两步验证） ==========
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const captchaAnswer = document.getElementById('captcha-answer').value.trim();
  const errEl = document.getElementById('login-error');

  if (!email || !password) { errEl.textContent = '请输入邮箱和密码'; return; }
  if (!state.captcha.token) { errEl.textContent = '计算题加载中，请稍候'; return; }
  if (!captchaAnswer) { errEl.textContent = '请回答计算题'; return; }

  errEl.textContent = '';
  const btn = document.getElementById('btn-login-send');
  btn.disabled = true; btn.textContent = '发送中...';

  try {
    const data = await api('/api/send-code', {
      method: 'POST',
      body: JSON.stringify({ email, password, captchaToken: state.captcha.token, captchaAnswer }),
    });
    state.loginEmail = email;
    state.loginPassword = password; // 暂存用于重新发送
    document.getElementById('login-email-display').textContent = email;
    document.getElementById('login-step1').classList.add('hidden');
    document.getElementById('login-step2').classList.remove('hidden');
    document.getElementById('verify-code').value = '';
    document.getElementById('verify-error').textContent = '';
    document.getElementById('verify-code').focus();
    if (data.code) {
      // SMTP 不可用时，验证码直接展示
      toast('验证码: ' + data.code, 'success');
      document.getElementById('verify-code').value = data.code;
    } else {
      toast('验证码已发送到邮箱', 'success');
      startCountdown();
    }
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = '发送验证码';
  }
}

// 验证码倒计时
function startCountdown() {
  let sec = 60;
  const btn = document.getElementById('btn-resend');
  btn.disabled = true;
  const tick = () => {
    btn.textContent = `${sec}秒后重新发送`;
    if (--sec < 0) { btn.textContent = '重新发送'; btn.disabled = false; return; }
    setTimeout(tick, 1000);
  };
  tick();
}

async function handleVerify(e) {
  e.preventDefault();
  const code = document.getElementById('verify-code').value.trim();
  const errEl = document.getElementById('verify-error');
  if (!code || code.length !== 6) { errEl.textContent = '请输入6位验证码'; return; }

  errEl.textContent = '';
  const btn = document.getElementById('btn-verify');
  btn.disabled = true; btn.textContent = '验证中...';

  try {
    const data = await api(`/api/send-code?code=${code}&email=${encodeURIComponent(state.loginEmail)}`);
    state.token = data.token;
    sessionStorage.setItem('blog_token', data.token);
    toast('登录成功', 'success');
    navigate('dashboard');
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = '验证';
  }
}

async function resendCode() {
  if (document.getElementById('btn-resend').disabled) return;
  try {
    await api('/api/send-code', {
      method: 'POST', body: JSON.stringify({ email: state.loginEmail, password: state.loginPassword }),
    });
    startCountdown();
    toast('验证码已重新发送', 'success');
  } catch (err) {
    toast('发送失败: ' + err.message, 'error');
  }
}

function logout() {
  state.token = null;
  sessionStorage.removeItem('blog_token');
  navigate('login');
}

// ========== Router ==========
function navigate(view, params) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  if (view === 'login') {
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('main').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
    document.getElementById('login-step1').classList.remove('hidden');
    document.getElementById('login-step2').classList.add('hidden');
    document.getElementById('login-error').textContent = '';
    generateCaptcha();
    window.location.hash = 'login';
    return;
  }

  document.getElementById('sidebar').classList.remove('hidden');
  document.getElementById('main').classList.remove('hidden');

  const map = { 'dashboard': ['view-dashboard', 'dashboard'], 'new': ['view-new', 'new'], 'edit': ['view-edit', 'dashboard'], 'monitor': ['view-monitor', 'monitor'] };
  const [vid, nid] = map[view] || map.dashboard;
  document.getElementById(vid).classList.remove('hidden');
  document.querySelector(`[data-nav="${nid}"]`)?.classList.add('active');

  // 设置 hash（编辑页带上文件参数）
  if (view === 'edit' && params?.file) {
    window.location.hash = 'edit?file=' + encodeURIComponent(params.file);
  } else {
    window.location.hash = view;
  }

  if (view === 'dashboard') loadPosts();
  if (view === 'new') resetNewForm();
  if (view === 'edit' && params?.file && state.editFilePath !== decodeURIComponent(params.file)) loadEditPost(params.file);

}

window.addEventListener('hashchange', () => {
  const raw = window.location.hash.slice(1);
  const [h, qs] = raw.split('?');
  if (!state.token) { navigate('login'); return; }

  if (h === 'dashboard' || h === 'new' || h === 'monitor') {
    navigate(h);
  } else if (h === 'edit') {
    const file = new URLSearchParams(qs || '').get('file');
    if (file) navigate('edit', { file });
    else navigate('dashboard');
  } else {
    navigate('dashboard');
  }
});

// ========== Init ==========
document.addEventListener('DOMContentLoaded', () => {
  // 注册 PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
  // 主题切换
  const themeSwitch = document.getElementById('admin-theme-switch');
  if (themeSwitch) {
    const saved = localStorage.getItem('admin_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    themeSwitch.value = saved;
    themeSwitch.addEventListener('change', () => {
      const v = themeSwitch.value;
      document.documentElement.setAttribute('data-theme', v);
      localStorage.setItem('admin_theme', v);
    });
  }
  generateCaptcha();
  const hash = window.location.hash.slice(1);
  if (state.token) {
    api('/api/auth', { method: 'GET' }).then(() => navigate(hash || 'dashboard')).catch(() => { logout(); navigate('login'); });
  } else { navigate('login'); }
  bindEvents();
});

// ========== Events ==========
function bindEvents() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('verify-form').addEventListener('submit', handleVerify);
  document.getElementById('btn-resend').addEventListener('click', resendCode);
  document.getElementById('captcha-refresh').addEventListener('click', generateCaptcha);

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-refresh').addEventListener('click', loadPosts);
  document.getElementById('filter-category').addEventListener('change', renderPostList);

  setupFileUpload('upload-area', 'file-input', 'btn-select-file', 'file-info', 'file-name', 'btn-remove-file', 'convert-section', true);
  setupFileUpload('edit-upload-area', 'edit-file-input', 'btn-edit-select-file', 'edit-file-info', 'edit-file-name', 'btn-edit-remove-file', 'edit-convert-section', false);

  document.getElementById('btn-convert').addEventListener('click', () => handleConvert('new'));
  document.getElementById('btn-edit-convert').addEventListener('click', () => handleConvert('edit'));
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tab.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const type = tab.dataset.tab;
      const parent = tab.parentElement.parentElement;
      const pv = parent.querySelector('.preview-box');
      const sc = parent.querySelector('.source-box');
      // 从预览切到源码时：把预览区编辑后的 HTML 转回 Markdown，避免内容丢失
      if (sc && pv && type.includes('source') && !pv.classList.contains('hidden') && pv.innerHTML) {
        sc.value = htmlToMarkdown(pv.innerHTML);
      }
      if (pv) pv.classList.toggle('hidden', !type.includes('preview'));
      if (sc) sc.classList.toggle('hidden', !type.includes('source'));
    });
  });
  document.getElementById('form-new').addEventListener('submit', handlePublish);
  document.getElementById('form-edit').addEventListener('submit', handleEditSave);
  document.getElementById('btn-delete-post').addEventListener('click', () => {
    showModal('隐藏后不会在博客显示，确定？', async () => {
      try { await api('/api/posts', { method: 'DELETE', body: JSON.stringify({ path: state.editFilePath }) }); toast('已隐藏', 'success'); navigate('dashboard'); } catch (e) { toast(e.message, 'error'); }
    });
  });
  document.getElementById('modal-cancel').addEventListener('click', hideModal);
  document.querySelectorAll('.nav-item[href^="#"]').forEach(l => l.addEventListener('click', (e) => { e.preventDefault(); navigate(l.getAttribute('href').slice(1)); }));
}

// ========== File Upload ==========
function setupFileUpload(areaId, inputId, btnId, infoId, nameId, removeId, sectionId, isNew) {
  const area = document.getElementById(areaId);
  const input = document.getElementById(inputId);
  const info = document.getElementById(infoId);
  const name = document.getElementById(nameId);
  const remove = document.getElementById(removeId);
  const section = document.getElementById(sectionId);
  area.addEventListener('click', () => input.click());
  document.getElementById(btnId).addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
  area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', (e) => { e.preventDefault(); area.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleFileSel(e.dataTransfer.files[0], isNew); });
  input.addEventListener('change', () => { if (input.files[0]) handleFileSel(input.files[0], isNew); });
  remove.addEventListener('click', () => { if (isNew) state.selectedFile = null; else state.editSelectedFile = null; input.value = ''; info.classList.add('hidden'); area.style.display = ''; section.style.display = 'none'; });
}

function handleFileSel(file, isNew) {
  if (!file.name.endsWith('.txt')) { toast('请选择 .txt 文件', 'error'); return; }
  const nameEl = document.getElementById(isNew ? 'file-name' : 'edit-file-name');
  const infoEl = document.getElementById(isNew ? 'file-info' : 'edit-file-info');
  const areaEl = document.getElementById(isNew ? 'upload-area' : 'edit-upload-area');
  const sectionEl = document.getElementById(isNew ? 'convert-section' : 'edit-convert-section');
  if (isNew) state.selectedFile = file; else state.editSelectedFile = file;
  nameEl.textContent = file.name + ` (${fmtSize(file.size)})`;
  infoEl.classList.remove('hidden'); areaEl.style.display = 'none'; sectionEl.style.display = 'block';
  if (isNew) { document.getElementById('preview-content').innerHTML = '<p style="color:#86868B">点击「AI 写文章」开始生成</p>'; document.getElementById('source-content').value = ''; document.getElementById('preview-tabs').style.display = 'none'; }
}
function fmtSize(b) { return b < 1024 ? b + ' B' : b < 1024*1024 ? (b/1024).toFixed(1)+' KB' : (b/(1024*1024)).toFixed(1)+' MB'; }

// ========== 前端 Markdown 渲染（本地预览，不依赖外部 API） ==========
function renderMarkdown(md) {
  if (!md) return '<p style="color:#86868B">（空内容）</p>';
  let html = '';
  // 先处理代码块
  const lines = md.split('\n');
  let inCode = false;
  let codeBuf = [];
  let inList = false;
  let inQuote = false;

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  function closeLists() {
    if (inList) { html += '</ul>\n'; inList = false; }
  }
  function closeQuote() {
    if (inQuote) { html += '</blockquote>\n'; inQuote = false; }
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    // 代码块
    if (line.trim().startsWith('```')) {
      if (inCode) {
        html += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>\n';
        codeBuf = []; inCode = false;
      } else {
        closeLists(); closeQuote();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeLists(); closeQuote();
      const level = h[1].length;
      html += `<h${level}>${inline(h[2])}</h${level}>\n`;
      continue;
    }
    // 分隔线
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      closeLists(); closeQuote();
      html += '<hr>\n';
      continue;
    }
    // 引用
    if (line.trim().startsWith('>')) {
      closeLists();
      if (!inQuote) { html += '<blockquote>\n'; inQuote = true; }
      html += '<p>' + inline(line.trim().replace(/^>\s?/, '')) + '</p>\n';
      continue;
    }
    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      closeQuote();
      if (!inList) { html += '<ul>\n'; inList = true; }
      html += '<li>' + inline(line.replace(/^\s*[-*+]\s+/, '')) + '</li>\n';
      continue;
    }
    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      closeQuote();
      if (!inList) { html += '<ul class="ol">\n'; inList = true; }
      html += '<li>' + inline(line.replace(/^\s*\d+\.\s+/, '')) + '</li>\n';
      continue;
    }
    // 空行
    if (!line.trim()) {
      closeLists(); closeQuote();
      continue;
    }
    // 普通段落
    closeLists(); closeQuote();
    html += '<p>' + inline(line) + '</p>\n';
  }
  closeLists(); closeQuote();
  if (inCode) html += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>\n';
  return html;
}

// 预览区编辑后的 HTML → Markdown（与 renderMarkdown 的标签一一对应）
// 行内元素（strong/em/code/a）还原为 Markdown 标记，块级元素按行输出
function inlineToMarkdown(node) {
  let out = '';
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent.replace(/\s*\n\s*/g, ' ').trim();
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const tag = child.tagName.toLowerCase();
    const inner = () => inlineToMarkdown(child);
    if (tag === 'strong' || tag === 'b') out += '**' + inner() + '**';
    else if (tag === 'em' || tag === 'i') out += '*' + inner() + '*';
    else if (tag === 'code') out += '`' + child.textContent.trim() + '`';
    else if (tag === 'a') out += '[' + inner() + '](' + (child.getAttribute('href') || '') + ')';
    else if (tag === 'br') out += '\n';
    else out += inner();
  });
  return out.replace(/\s{2,}/g, ' ');
}

function htmlToMarkdown(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const lines = [];
  const walk = (node) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.replace(/\s*\n\s*/g, ' ').trim();
        if (t) lines.push(t);
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = child.tagName.toLowerCase();
      if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
        const lv = '#'.repeat(Number(tag[1]));
        const txt = inlineToMarkdown(child).replace(/\s+/g, ' ').trim();
        if (txt) lines.push(`${lv} ${txt}`);
      } else if (tag === 'p') {
        const t = inlineToMarkdown(child).trim();
        if (t) lines.push(t);
      } else if (tag === 'ul' || tag === 'ol') {
        // renderMarkdown 的有序列表渲染为 <ul class="ol">，这里兼容
        const isOrdered = tag === 'ol' || (child.getAttribute && (child.getAttribute('class') || '').split(' ').includes('ol'));
        child.querySelectorAll(':scope > li').forEach(li => {
          const t = inlineToMarkdown(li).trim();
          if (t) lines.push(isOrdered ? `1. ${t}` : `- ${t}`);
        });
      } else if (tag === 'blockquote') {
        const t = inlineToMarkdown(child).replace(/\s*\n\s*/g, ' ').trim();
        if (t) lines.push('> ' + t);
      } else if (tag === 'pre') {
        const code = child.querySelector('code');
        const t = code ? code.textContent : child.textContent;
        lines.push('```\n' + t.replace(/\n$/, '') + '\n```');
      } else if (tag === 'hr') {
        lines.push('---');
      } else {
        // 其他未知块级：递归
        const before = lines.length;
        walk(child);
        if (lines.length === before) {
          const t = inlineToMarkdown(child).trim();
          if (t) lines.push(t);
        }
      }
    });
  };
  walk(tmp);
  return lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ========== AI 三分类 Prompt ==========
const PROMPTS = {
  '项目': `你是一位技术博客作者。请将以下笔记整理成专业的技术项目介绍。要求：1)标题清晰 2)结构：背景→功能→实现→使用→总结 3)用# ## ###层级 4)代码用反引号 5)语言简洁`,
  '生活': `你是一位冷静克制的叙事编辑。请将以下笔记整理成一篇生活记录。要求：1)整体保持冷静、陈述性的语气，叙事清晰、不拖泥带水 2)事情发展过程（时间、地点、事件经过）用简洁理性的文字概括 3)涉及情感、感受、想法的部分，尽量直接引用作者原话，不要转述或润色 4)结构可采用"事件 / 想法"分离呈现，或按时间顺序叙述、在中间插入感受 5)克制留白，不煽情不刻意温暖，保留作者真实的情绪颗粒 6)标题简洁朴素`,
  '研究': `你是一位AI技术内容专家。请整理成AEO优化问答文章。AEO结构：1)标题用「什么是XXX？」提问式 2)一句话答案 3)核心概念(##小标题) 4)至少3个Q&A(## Q: / A:) 5)总结 6)每个段落简短`,
};

async function handleConvert(mode) {
  const file = mode === 'new' ? state.selectedFile : state.editSelectedFile;
  if (!file) { toast('请先上传 TXT 文件', 'error'); return; }
  const category = mode === 'new' ? (document.querySelector('input[name="category"]:checked')?.value || '生活') : (document.querySelector('input[name="edit-category"]:checked')?.value || '生活');
  const convertMode = mode === 'new'
    ? (document.querySelector('input[name="convert-mode"]:checked')?.value || 'rewrite')
    : (document.querySelector('input[name="edit-convert-mode"]:checked')?.value || 'rewrite');
  const statusEl = document.getElementById(mode === 'new' ? 'convert-status' : 'edit-convert-status');
  statusEl.textContent = convertMode === 'light' ? '排版整理中...' : 'AI 撰写中...';
  statusEl.className = 'status-msg loading';
  try {
    const txt = await file.text();
    const prompt = convertMode === 'light'
      ? '请将以下纯文本整理为规范的 Markdown 排版，保留原文文字：\n\n' + txt
      : (PROMPTS[category] || PROMPTS['生活']) + '\n\n原始文本：\n' + txt;
    const data = await api('/api/convert', { method: 'POST', body: JSON.stringify({ prompt, mode: convertMode }) });
    if (mode === 'new') {
      document.getElementById('preview-content').innerHTML = renderMarkdown(data.markdown || '');
      document.getElementById('source-content').value = data.markdown || '';
      document.getElementById('preview-tabs').style.display = 'flex';
      document.querySelector('#preview-tabs .tab[data-tab="preview"]').classList.add('active');
      document.querySelector('#preview-tabs .tab[data-tab="source"]').classList.remove('active');
      document.getElementById('preview-content').classList.remove('hidden');
      document.getElementById('source-content').classList.add('hidden');
      if (!document.getElementById('new-title').value && data.title) document.getElementById('new-title').value = data.title;
    } else {
      // 编辑模式：显示预览 + 源码
      document.getElementById('edit-preview-content').innerHTML = renderMarkdown(data.markdown || '');
      document.getElementById('edit-source-content').value = data.markdown || '';
      document.getElementById('edit-preview-tabs').style.display = 'flex';
      document.querySelector('#edit-preview-tabs .tab[data-tab="edit-preview"]').classList.add('active');
      document.querySelector('#edit-preview-tabs .tab[data-tab="edit-source"]').classList.remove('active');
      document.getElementById('edit-preview-content').classList.remove('hidden');
      document.getElementById('edit-source-content').classList.add('hidden');
    }
    statusEl.textContent = '完成 ✓（预览可直接点击编辑文字）'; statusEl.className = 'status-msg success';
  } catch (err) { statusEl.textContent = '失败: ' + err.message; statusEl.className = 'status-msg error'; }
}

async function handlePublish(e) {
  e.preventDefault();
  const category = document.querySelector('input[name="category"]:checked')?.value || '生活';
  const title = document.getElementById('new-title').value.trim();
  // 若预览区可见（可编辑模式），先把编辑后的内容同步回源码
  const pv = document.getElementById('preview-content');
  const sc = document.getElementById('source-content');
  if (pv && sc && !pv.classList.contains('hidden') && pv.innerHTML) {
    sc.value = htmlToMarkdown(pv.innerHTML);
  }
  const md = sc.value;
  if (!md) { toast('请先上传文件并让 AI 生成', 'error'); return; }
  const btn = document.getElementById('btn-publish');
  btn.disabled = true; btn.textContent = '发布中...';
  try {
    await api('/api/posts', { method: 'POST', body: JSON.stringify({ title: title || '无标题', category, content: md }) });
    toast('发布成功！等待 Cloudflare 部署', 'success'); navigate('dashboard');
  } catch (err) { toast('发布失败: ' + err.message, 'error'); } finally { btn.disabled = false; btn.textContent = '发布文章'; }
}

async function handleEditSave(e) {
  e.preventDefault();
  const category = document.querySelector('input[name="edit-category"]:checked')?.value || '生活';
  const title = document.getElementById('edit-title').value.trim();
  const epv = document.getElementById('edit-preview-content');
  const esc = document.getElementById('edit-source-content');
  if (epv && esc && !epv.classList.contains('hidden') && epv.innerHTML) {
    esc.value = htmlToMarkdown(epv.innerHTML);
  }
  const md = esc?.value;
  if (!md) { toast('请上传文件并重新生成', 'error'); return; }
  try {
    await api('/api/posts', { method: 'PUT', body: JSON.stringify({ path: state.editFilePath, title: title || '无标题', category, content: md }) });
    toast('已更新', 'success'); navigate('dashboard');
  } catch (err) { toast(err.message, 'error'); }
}

// ========== Posts ==========
async function loadPosts() {
  try {
    const data = await api('/api/posts');
    state.posts = data.posts || [];
    const all = state.posts.filter(p => !p.hidden);
    document.getElementById('stat-total').textContent = all.length;
    document.getElementById('stat-project').textContent = all.filter(p => p.category === '项目').length;
    document.getElementById('stat-life').textContent = all.filter(p => p.category === '生活').length;
    document.getElementById('stat-research').textContent = all.filter(p => p.category === '研究').length;
    renderPostList();
  } catch (err) { document.getElementById('post-list').innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`; }
}

function renderPostList() {
  const filter = document.getElementById('filter-category').value;
  let list = state.posts;
  if (filter !== 'all') list = list.filter(p => p.category === filter);
  const catMap = {'项目':'project','生活':'life','研究':'research'};
  document.getElementById('post-list').innerHTML = list.length === 0
    ? '<div class="empty-state">暂无文章</div>'
    : list.map(p => `<div class="post-item">
      <span class="post-item-cat cat-${p.hidden?'hidden':(catMap[p.category]||'life')}">${p.hidden?'已隐藏':(p.category||'生活')}</span>
      <div class="post-item-main"><div class="post-item-title ${p.hidden?'hidden-title':''}">${p.hidden?'[已隐藏] ':''}${esc(p.title)}</div><div class="post-item-meta">${p.date||''}</div></div>
      <div class="post-item-actions">
        <button class="btn-text" onclick="editPost('${p.path}')">编辑</button>
        ${p.hidden
          ? `<button class="btn-text" style="color:#34C759" onclick="restorePost('${p.path}')">恢复</button>`
          : `<button class="btn-text" style="color:#FF3B30" onclick="hidePost('${p.path}')">隐藏</button>`}
      </div></div>`).join('');
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function editPost(fp) { navigate('edit', { file: encodeURIComponent(fp) }); }
async function loadEditPost(fp) {
  state.editFilePath = decodeURIComponent(fp);
  document.getElementById('edit-loading').style.display = '';
  document.getElementById('form-edit').classList.add('hidden');
  state.editSelectedFile = null;
  const editSrc = document.getElementById('edit-source-content');
  if (editSrc) { editSrc.classList.add('hidden'); editSrc.value = ''; }
  document.getElementById('edit-upload-area').style.display = '';
  document.getElementById('edit-file-info').classList.add('hidden');
  document.getElementById('edit-convert-section').style.display = 'none';
  try {
    const data = await api(`/api/posts?path=${encodeURIComponent(state.editFilePath)}`);
    document.getElementById('edit-loading').style.display = 'none';
    document.getElementById('form-edit').classList.remove('hidden');
    document.querySelector(`input[name="edit-category"][value="${data.category||'生活'}"]`).checked = true;
    document.getElementById('edit-title').value = data.title || '';
  } catch (err) { document.getElementById('edit-loading').innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`; }
}

async function hidePost(fp) {
  showModal('确定隐藏？', async () => {
    try { await api('/api/posts', { method: 'DELETE', body: JSON.stringify({ path: fp }) }); toast('已隐藏', 'success'); loadPosts(); } catch (err) { toast(err.message, 'error'); }
  });
}

async function restorePost(fp) {
  showModal('确定恢复这篇文章到博客？', async () => {
    try { await api('/api/posts', { method: 'POST', body: JSON.stringify({ restore: true, path: fp }) }); toast('已恢复', 'success'); loadPosts(); } catch (err) { toast(err.message, 'error'); }
  });
}

function resetNewForm() {
  document.getElementById('new-title').value = '';
  document.querySelector('input[name="category"][value="生活"]').checked = true;
  state.selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('file-info').classList.add('hidden');
  document.getElementById('upload-area').style.display = '';
  document.getElementById('convert-section').style.display = 'none';
  document.getElementById('preview-tabs').style.display = 'none';
  document.getElementById('preview-content').classList.add('hidden');
  document.getElementById('source-content').classList.add('hidden');
  document.getElementById('convert-status').textContent = '';
}

// ========== Toast & Modal ==========
let toastTimer;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

let modalCb = null;
function showModal(msg, cb) { document.getElementById('modal-msg').textContent = msg; document.getElementById('modal').classList.remove('hidden'); modalCb = cb; }
function hideModal() { document.getElementById('modal').classList.add('hidden'); modalCb = null; }
document.getElementById('modal-confirm').addEventListener('click', () => { if (modalCb) modalCb(); hideModal(); });

window.editPost = editPost;
window.hidePost = hidePost;
window.restorePost = restorePost;
