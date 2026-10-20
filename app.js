(() => {
const $ = s => document.querySelector(s);
const ERR_TYPES = ['概念不清','审题偏差','计算失误','方法不当','知识遗漏','步骤不严谨'];
const DEFAULTS = {
  url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  model: 'doubao-seed-1-6-vision-250815',
  key: '',
  think: 'disabled'
};

const SAMPLE = {
  title:'由“和”求“平方和”', grade:'初二', topic:'整式乘法与因式分解', knowledgePoints:['完全平方公式','整体代入'],
  question:'已知 $x+\\dfrac{1}{x}=3$，求 $x^2+\\dfrac{1}{x^2}$ 的值。',
  studentAnswer:'$x^2+\\dfrac{1}{x^2}=3^2=9$',
  errorType:'概念不清',
  errorAnalysis:'把 $(a+b)^2$ 当成了 $a^2+b^2$，漏掉了中间项 $2ab$。这里 $a=x,\\ b=\\dfrac1x$，$2ab=2$，所以多算了 2。',
  motherProblem:{ name:'完全平方公式的变形求值', statement:'已知 $a+b$ 与 $ab$（或 $a-b$）的值，求 $a^2+b^2$ 的值。',
    method:'$a^2+b^2=(a+b)^2-2ab=(a-b)^2+2ab$；当 $b=\\dfrac1a$ 时 $ab=1$，于是 $x^2+\\dfrac1{x^2}=\\left(x+\\dfrac1x\\right)^2-2$。',
    keyIdea:'看到“和”与“平方和”，立刻想到完全平方公式，并补上 $2ab$。' },
  solution:[
    {step:'找关系', detail:'$\\left(x+\\dfrac1x\\right)^2=x^2+2\\cdot x\\cdot\\dfrac1x+\\dfrac1{x^2}=x^2+2+\\dfrac1{x^2}$'},
    {step:'移项变形', detail:'$x^2+\\dfrac1{x^2}=\\left(x+\\dfrac1x\\right)^2-2$'},
    {step:'整体代入', detail:'$=3^2-2=7$'}],
  answer:'$7$',
  pitfalls:['$(a+b)^2\\neq a^2+b^2$，中间项 $2ab$ 不能丢','$x\\cdot\\dfrac1x=1$，所以中间项是常数 $2$'],
  summary:'已知“和”求“平方和”：先平方，再减去 2 倍积。',
  practice:[
    {question:'已知 $x-\\dfrac1x=2$，求 $x^2+\\dfrac1{x^2}$ 的值。', answer:'$6$', solution:'$x^2+\\dfrac1{x^2}=\\left(x-\\dfrac1x\\right)^2+2=4+2=6$'},
    {question:'已知 $x+\\dfrac1x=3$，求 $x^4+\\dfrac1{x^4}$ 的值。', answer:'$47$', solution:'先求 $x^2+\\dfrac1{x^2}=3^2-2=7$，再平方一次：$x^4+\\dfrac1{x^4}=7^2-2=47$'}]
};

const state = { items:[], view:'analyze', current:null, currentImg:null, saved:false, img:null, loading:false,
  filter:{topic:'全部', type:'全部', status:'全部'}, open:new Set(), confirmDel:null, busy:new Set(), printSel:null };
let ctrl = null;

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tx = s => esc(s).replace(/\n/g,'<br>');
const fmtDate = t => { const d=new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function typeset(el){
  const MJ = window.MathJax;
  if (MJ && MJ.typesetPromise) {
    return (MJ.startup && MJ.startup.promise ? MJ.startup.promise : Promise.resolve())
      .then(() => { MJ.typesetClear && MJ.typesetClear([el]); return MJ.typesetPromise([el]); }).catch(()=>{});
  }
  return Promise.resolve();
}
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,v); return true; } catch { return false; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

/* ---------- settings ---------- */
function getSettings(){ let s = {}; try { s = JSON.parse(lsGet('cuoti-settings') || '{}'); } catch {} return { ...DEFAULTS, ...s }; }
function saveSettings(s){ lsSet('cuoti-settings', JSON.stringify(s)); refreshKeyBar(); }
function refreshKeyBar(){ $('#needKey').hidden = !!getSettings().key; }
const dlg = $('#setDlg');
function openSettings(){
  const s = getSettings(); $('#sUrl').value = s.url; $('#sKey').value = s.key; $('#sModel').value = s.model; $('#sThink').value = s.think;
  $('#sStatus').textContent = ''; $('#bStatus').textContent = '';
  dlg.showModal ? dlg.showModal() : dlg.setAttribute('open','');
}
const formSettings = () => ({ url: $('#sUrl').value.trim() || DEFAULTS.url, key: $('#sKey').value.trim(), model: $('#sModel').value.trim() || DEFAULTS.model, think: $('#sThink').value });
$('#openSet').addEventListener('click', openSettings);
$('#needKeyBtn').addEventListener('click', openSettings);
$('#setForm').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'save') saveSettings(formSettings()); });
$('#sTest').addEventListener('click', async () => {
  const st = $('#sStatus'); st.classList.remove('err'); st.textContent = '正在连接…';
  try {
    const t = await callLLM('请只回复两个字：正常', null, { settings: formSettings(), stream: false });
    st.textContent = '连接成功，模型回复：' + t.trim().slice(0, 30);
  } catch (err) { st.textContent = errText(err); st.classList.add('err'); }
});

/* ---------- storage (IndexedDB) ---------- */
const idb = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('cuotiben', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath:'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => {
    const t = db.transaction('items', mode); const req = fn(t.objectStore('items'));
    t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return { all: () => run('readonly', s => s.getAll()), put: o => run('readwrite', s => s.put(o)), del: id => run('readwrite', s => s.delete(id)) };
})();
let idbOK = true;
const sortItems = () => state.items.sort((a,b) => b.createdAt - a.createdAt);
const store = {
  async load(){ try { state.items = await idb.all() || []; } catch { idbOK = false; state.items = []; } sortItems(); },
  async add(obj){ obj.id = obj.id || uid(); if (idbOK) await idb.put(obj); state.items.push(obj); sortItems(); afterChange(); },
  async update(id, patch){ const it = state.items.find(i => i.id === id); if (!it) return; Object.assign(it, patch); if (idbOK) await idb.put(it); afterChange(); },
  async remove(id){ if (idbOK) await idb.del(id); state.items = state.items.filter(i => i.id !== id); afterChange(); }
};
function afterChange(){ renderBook(); if (state.view === 'print') renderPrint(); }

/* backup */
$('#exp').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app:'cuotiben', version:1, exportedAt: Date.now(), items: state.items })], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `错题本备份_${fmtDate(Date.now())}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  $('#bStatus').textContent = `已导出 ${state.items.length} 道错题。`;
});
$('#imp').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return; const bs = $('#bStatus'); bs.classList.remove('err');
  try {
    const data = JSON.parse(await f.text()); const items = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(items)) throw new Error('文件格式不对');
    let n = 0; for (const it of items) { if (!it || !it.question) continue; it.id = it.id || uid();
      if (!state.items.some(x => x.id === it.id)) { if (idbOK) await idb.put(it); state.items.push(it); n++; } }
    sortItems(); afterChange(); bs.textContent = `导入了 ${n} 道新错题（重复的已跳过）。`;
  } catch (err) { bs.textContent = '导入失败：' + (err.message || err); bs.classList.add('err'); }
  e.target.value = '';
});

/* ---------- views ---------- */
function setView(v){
  state.view = v;
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.view === v));
  $('#v-analyze').hidden = v !== 'analyze'; $('#v-book').hidden = v !== 'book'; $('#v-print').hidden = v !== 'print';
  if (v === 'print') renderPrint();
  if (v === 'book') renderBook();
  try { history.replaceState(null,'','#'+v); } catch {}
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

/* ---------- analysis card ---------- */
const tabSel = {};
const TABS = [['diag','错因'],['mother','母题'],['sol','解法'],['prac','巩固']];
function sheetHTML(a, o = {}){
  const key = o.key || 'cur', cur = tabSel[key] || 'diag';
  const kp = (a.knowledgePoints || []).map(k => `<span class="chip">${esc(k)}</span>`).join('');
  const steps = (a.solution || []).map(s => `<li><div><b>${tx(s.step)}</b>${tx(s.detail)}</div></li>`).join('');
  const pits = (a.pitfalls || []).map(p => `<li>${tx(p)}</li>`).join('');
  let prac;
  if (a.practice == null) prac = `<div class="pwait"><span class="pen sm"></span>正在出 2 道同类题，可以先看错因和解法…</div>`;
  else if (!a.practice.length) prac = `<p class="status err">${esc(a.practiceErr || '还没有巩固题')}</p>${key === 'cur' ? '<button class="btn sm" data-act="retryprac">重新出题</button>' : ''}`;
  else prac = `<div class="prac">${a.practice.map((p,i) => `
    <div class="pq"><div class="t">巩固 ${i+1}${i ? ' · 提高' : ' · 同难度'}</div><div>${tx(p.question)}</div>
      <details><summary>看答案与解析</summary><div class="sol"><p>答案：<span class="ans">${tx(p.answer)}</span></p><p>${tx(p.solution)}</p></div></details></div>`).join('')}</div>`;
  const m = a.motherProblem || {};
  const status = o.item ? (o.item.mastered ? '<span class="chip ok">已掌握</span>' : '<span class="chip todo">未掌握</span>') : '';
  const panels = {
    diag: `<span class="stamp">${esc(a.errorType || '待定')}</span>
      ${a.studentAnswer ? `<p>原作答：<span class="wrong">${tx(a.studentAnswer)}</span></p>` : ''}
      <p>${tx(a.errorAnalysis)}</p>
      ${pits ? `<p class="plabel">易错点</p><ul class="pit">${pits}</ul>` : ''}`,
    mother: `<div class="mbox"><div class="name">${esc(m.name || '')}</div>
      <dl><dt>母题</dt><dd>${tx(m.statement)}</dd><dt>通法</dt><dd>${tx(m.method)}</dd><dt>突破口</dt><dd>${tx(m.keyIdea)}</dd></dl></div>`,
    sol: `<ol class="steps">${steps}</ol><p class="mt">答案：<span class="ans">${tx(a.answer)}</span></p>`,
    prac
  };
  return `<article class="sheet" data-key="${esc(key)}">
    ${o.banner ? `<div class="banner">${o.banner}</div>` : ''}
    <div class="sheet-head"><h3>${esc(a.title || '错题分析')}</h3>
      <div class="meta">${status}<span>${esc(a.grade || '')}</span><span>·</span><span>${esc(a.topic || '')}</span>${kp}</div></div>
    <div class="qline"><span class="qlabel">原题</span><div class="body"><p>${tx(a.question)}</p>
      ${o.image ? `<details class="pic"><summary>看原图</summary><img class="qimg" src="${o.image}" alt="错题原图"></details>` : ''}</div></div>
    <div class="sumline"><span class="qlabel">归纳</span><div class="body">${tx(a.summary)}</div></div>
    <div class="stabs" role="tablist">${TABS.map(([k,l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === cur}">${l}${k === 'prac' && a.practice == null ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>
    ${TABS.map(([k]) => `<div class="tpanel body" data-panel="${k}" ${k === cur ? '' : 'hidden'}>${panels[k]}</div>`).join('')}
    ${o.foot ? `<div class="sheet-foot">${o.foot}</div>` : ''}
  </article>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('.stabs [data-tab]'); if (!t) return;
  const sh = t.closest('.sheet'); tabSel[sh.dataset.key] = t.dataset.tab;
  sh.querySelectorAll('.stabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b === t)));
  sh.querySelectorAll('.tpanel').forEach(p => p.hidden = p.dataset.panel !== t.dataset.tab);
});

function renderResult(){
  const el = $('#result');
  if (state.loading) {
    el.innerHTML = `<div class="sheet"><div class="loading"><div class="pen"></div><b>正在批改…</b><div id="prog">识别题目、诊断错因、查找母题、生成巩固题</div></div></div>`;
    return;
  }
  if (!state.current) {
    el.innerHTML = sheetHTML(SAMPLE, { key:'sample', banner:'示例：上传你的错题后，这里会显示同样结构的分析结果。' });
  } else {
    const foot = state.saved
      ? `<span class="chip ok">已加入错题集</span><button class="btn sm" data-act="gobook">去错题集</button>`
      : `<span class="hint" style="margin:0">确认无误后保存，之后可在“打印”里整理成卷</span><button class="btn primary" data-act="save">加入错题集</button>`;
    el.innerHTML = sheetHTML(state.current, { image: state.currentImg, foot });
  }
  typeset(el);
}
$('#result').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'gobook') setView('book');
  if (b.dataset.act === 'retryprac' && state.current) { state.current.practice = null; renderResult(); fillPractice(state.current); }
  if (b.dataset.act === 'save') {
    b.disabled = true; b.textContent = '保存中…';
    try {
      const obj = { ...state.current, image: state.currentImg || null, createdAt: Date.now(), mastered: false };
      delete obj.practiceErr; if (!obj.practice) obj.practice = [];
      await store.add(obj); state.savedId = obj.id;
      state.saved = true; renderResult();
    } catch (err) { b.disabled = false; b.textContent = '加入错题集'; setStatus('保存失败：' + (err?.message || err), true); }
  }
});

/* ---------- input ---------- */
function setStatus(msg, err){ const s=$('#status'); s.textContent = msg || ''; s.classList.toggle('err', !!err); }
async function takeFile(file){
  if (!file || !file.type.startsWith('image/')) { setStatus('请选择图片文件（JPG / PNG）', true); return; }
  try {
    const img = await loadImg(file);
    state.img = img;
    $('#dropInner').innerHTML = `<img src="${scale(img, 900).toDataURL('image/jpeg', .8)}" alt="已选错题"><div class="hint">点击更换图片</div>`;
    setStatus('');
  } catch { setStatus('这张图片打不开，换一张 JPG 或 PNG 试试', true); }
}
function loadImg(file){ return new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; }); }
function scale(img, max){
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth*k); c.height = Math.round(img.naturalHeight*k);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,c.width,c.height); g.drawImage(img,0,0,c.width,c.height); return c;
}
$('#file').addEventListener('change', e => takeFile(e.target.files[0]));
const drop = $('#drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); takeFile(e.dataTransfer.files[0]); });
document.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (f) { setView('analyze'); takeFile(f); } });
$('#clear').addEventListener('click', () => {
  state.img = null; $('#file').value = ''; $('#note').value = ''; $('#qtext').value = '';
  $('#dropInner').innerHTML = '<b>拍照或选择图片</b>支持拖入、粘贴截图<br>一次一道题效果最好'; setStatus('');
});
const g0 = lsGet('cuoti-grade'); if (g0) $('#grade').value = g0;
$('#grade').addEventListener('change', e => lsSet('cuoti-grade', e.target.value));

/* ---------- 豆包 API ---------- */
async function callLLM(prompt, imageDataUrl, opt = {}){
  const s = opt.settings || getSettings();
  if (!s.key) throw { code:'nokey' };
  const content = imageDataUrl
    ? [{ type:'image_url', image_url:{ url: imageDataUrl } }, { type:'text', text: prompt }]
    : prompt;
  const stream = opt.stream !== false;
  const body = { model: s.model, stream, temperature: 0.2,
    messages: [{ role:'system', content:'你是严谨、耐心的中国中小学数学老师。严格按用户要求的格式输出。' }, { role:'user', content }] };
  if (s.think && s.think !== 'none' && !opt.noThink) body.thinking = { type: s.think };
  let r;
  try {
    r = await fetch(s.url, { method:'POST', signal: opt.signal,
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + s.key }, body: JSON.stringify(body) });
  } catch (err) {
    if (err.name === 'AbortError') throw { code:'aborted' };
    throw { code:'network', message: err.message };
  }
  if (!r.ok) {
    const t = await r.text().catch(() => ''); let m = '';
    try { const j = JSON.parse(t); m = j.error?.message || j.message || ''; } catch {}
    if (r.status === 400 && body.thinking && /thinking/i.test(m + t)) return callLLM(prompt, imageDataUrl, { ...opt, noThink: true });
    throw { code:'http', status: r.status, message: m || t.slice(0, 200) };
  }
  if (!stream) { const j = await r.json(); return j.choices?.[0]?.message?.content || ''; }
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', text = '', think = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream:true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
        try {
          const j = JSON.parse(d); const dl = j.choices?.[0]?.delta || {};
          if (dl.content) text += dl.content;
          if (dl.reasoning_content) think += dl.reasoning_content.length;
          opt.onText && opt.onText(text, think);
        } catch {}
      }
    }
  } catch (err) { if (err.name === 'AbortError') throw { code:'aborted' }; throw err; }
  return text;
}
/* LaTeX in JSON: fix single backslashes that the model forgot to double */
function parseJSON(raw){
  let t = String(raw || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) t = fence[1].trim();
  const a = t.search(/[{[]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a > 0 || (b >= 0 && b < t.length - 1)) t = t.slice(Math.max(a, 0), b + 1);
  t = t.replace(/(^|[^\\])((?:\\\\)*)\\(?=[a-zA-Z]{2,}|[()[\]{},;:!%| ])/g, '$1$2\\\\');
  try { return JSON.parse(t); } catch { throw { code:'invalid_json' }; }
}
function errText(err){
  const c = err?.code;
  if (c === 'nokey') return '还没填写 API Key，请先打开“设置”。';
  if (c === 'aborted') return '已取消。';
  if (c === 'invalid_json') return '模型返回的内容格式不完整，请再点一次“开始分析”。';
  if (c === 'unreadable') return '没认出题目：' + err.message + '。可以拍得更清楚些，或直接输入题目文字。';
  if (c === 'network') return '连不上接口（' + (err.message || '网络错误') + '）。请检查网络和“设置”里的接口地址；如果地址正确，可能是该接口不允许网页直接调用。';
  if (c === 'http') {
    if (err.status === 401) return 'API Key 无效或已过期（401），请在“设置”里重新填写。';
    if (err.status === 404) return '找不到这个模型（404），请检查“设置”里的模型名称，并确认已在方舟控制台开通。';
    if (err.status === 429) return '请求太频繁或额度不足（429），请稍后再试。';
    return `接口报错 ${err.status}：${err.message}`;
  }
  return '出错了：' + (err?.message || c || err);
}

const FORMAT = `只输出一个 JSON 对象，不要其他文字，不要代码块。结构：
{
 "title": "不超过12字的题目名",
 "grade": "年级",
 "topic": "所属章节，如 一元二次方程",
 "knowledgePoints": ["考查的知识点，2-4个"],
 "question": "完整誊写原题（含小问），数学式用 $...$ 包裹的 LaTeX",
 "studentAnswer": "识别出的学生错误作答或错误结果，看不到则为空字符串",
 "errorType": "从 概念不清/审题偏差/计算失误/方法不当/知识遗漏/步骤不严谨 中选最主要的一个",
 "errorAnalysis": "具体指出错在哪一步、为什么会错（2-4句）",
 "motherProblem": {"name":"母题名称（经典题型名）","statement":"母题的标准题干，用字母表示一般情形","method":"该类题的通用解法或模型","keyIdea":"一句话解题突破口"},
 "solution": [{"step":"步骤标题（4-6字）","detail":"这一步的推理与计算"}],
 "answer": "最终答案",
 "pitfalls": ["这类题的易错点，2-3条"],
 "summary": "一句话归纳：遇到什么特征，就用什么方法"
}
要求：
- 用简体中文，面向学生，语气清楚直接。
- 解题过程简洁规范，步骤 2-5 步，每步一两句话。
- 所有数学式都写成 LaTeX 并用 $ 包裹；JSON 字符串里的反斜杠必须写成两个（例如 "\\\\frac{1}{2}"）。
- 如果图片里有多道题，只分析被批改为错误的那一道（或第一道）。
- 如果无法识别出数学题，只输出 {"error":"原因"}。`;

async function analyze(){
  const qtext = $('#qtext').value.trim();
  if (!state.img && !qtext) { setStatus('先上传错题照片，或输入题目文字', true); return; }
  if (!getSettings().key) { setStatus(errText({ code:'nokey' }), true); openSettings(); return; }
  const grade = $('#grade').value, note = $('#note').value.trim();
  let prompt = `你正在帮学生整理数学错题本。\n学生年级：${grade}。\n`;
  if (state.img) prompt += `附图是学生拍下的一道数学错题，可能包含学生的错误作答和老师批改痕迹。\n`;
  if (qtext) prompt += `题目文字：${qtext}\n`;
  if (note) prompt += `学生补充说明：${note}\n`;
  prompt += `\n请：识别题目 → 诊断错因 → 归纳出这道题背后的母题与通法 → 给出规范完整的解题过程 → 一句话总结。\n\n` + FORMAT;
  const imgUrl = state.img ? scale(state.img, 1280).toDataURL('image/jpeg', .82) : null;
  ctrl = new AbortController();
  state.loading = true; state.saved = false; state.savedId = null; renderResult(); setStatus('');
  $('#go').disabled = true; $('#stop').hidden = false;
  try {
    const raw = await callLLM(prompt, imgUrl, { signal: ctrl.signal, onText: (t, think) => {
      const p = document.getElementById('prog'); if (!p) return;
      p.textContent = t ? `已写出 ${t.length} 字…` : think ? `正在思考（${think} 字）…` : '正在识别题目…';
    }});
    const a = parseJSON(raw);
    if (!a || a.error) throw { code:'unreadable', message: a?.error || '没有识别到数学题' };
    if (!Array.isArray(a.solution)) a.solution = [];
    a.practice = null;
    if (!Array.isArray(a.knowledgePoints)) a.knowledgePoints = [];
    a.grade = a.grade || grade;
    state.current = a;
    state.currentImg = state.img ? scale(state.img, 1100).toDataURL('image/jpeg', .75) : null;
    tabSel.cur = 'diag';
    fillPractice(a);
  } catch (err) {
    setStatus(errText(err), true);
  } finally {
    state.loading = false; ctrl = null; $('#go').disabled = false; $('#stop').hidden = true; renderResult();
    if (state.current && matchMedia('(max-width:820px)').matches) $('#result').scrollIntoView({ behavior:'smooth', block:'start' });
  }
}
/* stage 2: practice questions, generated while the student reads the analysis */
async function fillPractice(a){
  a.practiceErr = null;
  try {
    const p = await regenPractice(a);
    if (state.current !== a) return;
    a.practice = p;
    if (state.savedId) await store.update(state.savedId, { practice: p });
  } catch (err) {
    if (state.current !== a) return;
    a.practice = []; a.practiceErr = errText(err);
  }
  renderResult();
}
$('#go').addEventListener('click', analyze);
$('#stop').addEventListener('click', () => ctrl && ctrl.abort());

async function regenPractice(item){
  const prompt = `根据下面这道错题和它的母题，重新出 2 道新的同类巩固题（与已有的题不同），第1道难度与原题相当，第2道略提高。每道题自己验算，保证答案正确。
年级：${item.grade}
原题：${item.question}
母题：${item.motherProblem?.name}——${item.motherProblem?.statement}
通法：${item.motherProblem?.method}
${(item.practice||[]).length ? '已有巩固题（不要重复）：' + item.practice.map(p => p.question).join(' | ') : ''}
易错原因：${item.errorType}——${item.errorAnalysis}
只输出 JSON 数组，不要其他文字：[{"question":"","answer":"","solution":""},{"question":"","answer":"","solution":""}]。数学式用 $ 包裹的 LaTeX，JSON 中反斜杠写成两个。`;
  const arr = parseJSON(await callLLM(prompt, null));
  if (!Array.isArray(arr) || arr.length < 1) throw new Error('没有生成新题');
  return arr.slice(0,2);
}

/* ---------- book ---------- */
function renderBook(){
  $('#count').textContent = state.items.length;
  const items = state.items;
  const todo = items.filter(i => !i.mastered).length;
  const typeCount = {}; items.forEach(i => typeCount[i.errorType] = (typeCount[i.errorType]||0) + 1);
  const top = Object.entries(typeCount).sort((a,b) => b[1]-a[1])[0];
  const topics = [...new Set(items.map(i => i.topic).filter(Boolean))];
  $('#stats').innerHTML = `
    <div class="stat"><div class="k">错题总数</div><div class="v">${items.length}</div></div>
    <div class="stat"><div class="k">待巩固</div><div class="v">${todo}<small> 道</small></div></div>
    <div class="stat"><div class="k">已掌握</div><div class="v">${items.length - todo}<small> 道</small></div></div>
    <div class="stat"><div class="k">最常见错因</div><div class="v" style="font-family:var(--f-display);font-size:18px;padding-top:4px">${top ? esc(top[0]) + `<small> ×${top[1]}</small>` : '—'}</div></div>`;
  const f = state.filter;
  const chips = (key, vals) => ['全部', ...vals].map(v => `<button class="fchip" data-f="${key}" data-v="${esc(v)}" aria-pressed="${f[key] === v}">${esc(v)}</button>`).join('');
  $('#filters').innerHTML = items.length ? `
    <div class="filters"><span class="k">状态</span>${chips('status', ['未掌握','已掌握'])}</div>
    <div class="filters"><span class="k">错因</span>${chips('type', ERR_TYPES.filter(t => typeCount[t]))}</div>
    ${topics.length > 1 ? `<div class="filters"><span class="k">章节</span>${chips('topic', topics)}</div>` : ''}` : '';
  const shown = items.filter(i => (f.status === '全部' || (f.status === '已掌握') === !!i.mastered)
    && (f.type === '全部' || i.errorType === f.type) && (f.topic === '全部' || i.topic === f.topic));
  const list = $('#list');
  if (!items.length) {
    list.innerHTML = `<div class="empty"><b>错题集还是空的</b>在“拍照分析”上传一道错题，分析完点“加入错题集”，就会出现在这里。<div class="mt"><button class="btn primary" data-act="toanalyze">去拍第一道</button></div></div>`;
    return;
  }
  if (!shown.length) { list.innerHTML = `<div class="empty"><b>没有符合筛选的错题</b>换个筛选条件试试。</div>`; return; }
  list.innerHTML = shown.map(i => {
    const open = state.open.has(i.id);
    const foot = `
      <button class="btn sm ${i.mastered ? '' : 'blue'}" data-act="toggle" data-id="${i.id}">${i.mastered ? '改回未掌握' : '标记已掌握'}</button>
      <button class="btn sm" data-act="regen" data-id="${i.id}" ${state.busy.has(i.id) ? 'disabled' : ''}>${state.busy.has(i.id) ? '出题中…' : '换 2 道巩固题'}</button>
      ${state.confirmDel === i.id
        ? `<span class="confirm">确定删除这道错题？<button class="btn sm primary" data-act="del" data-id="${i.id}">删除</button><button class="btn sm" data-act="nodel">保留</button></span>`
        : `<button class="btn sm ghost" data-act="askdel" data-id="${i.id}">删除</button>`}`;
    return `<div class="item ${i.mastered ? 'mastered' : ''}">
      <button class="ihead" data-act="open" data-id="${i.id}" aria-expanded="${open}">
        ${i.image ? `<img src="${i.image}" alt="">` : `<span class="ph">题</span>`}
        <span style="min-width:0"><span class="tt" style="display:block">${esc(i.title)}</span>
          <span class="meta"><span class="date">${fmtDate(i.createdAt)}</span><span>${esc(i.topic || '')}</span><span class="chip err">${esc(i.errorType || '')}</span></span></span>
        <span class="chip ${i.mastered ? 'ok' : 'todo'}">${i.mastered ? '已掌握' : '未掌握'}</span>
      </button>
      ${open ? sheetHTML(i, { key: i.id, image: i.image, item: i, foot }) : ''}
    </div>`;
  }).join('');
  typeset(list);
}
$('#filters').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; state.filter[b.dataset.f] = b.dataset.v; renderBook(); });
$('#list').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id, it = state.items.find(i => i.id === id), act = b.dataset.act;
  if (act === 'toanalyze') return setView('analyze');
  if (act === 'open') { state.open.has(id) ? state.open.delete(id) : state.open.add(id); return renderBook(); }
  if (act === 'askdel') { state.confirmDel = id; return renderBook(); }
  if (act === 'nodel') { state.confirmDel = null; return renderBook(); }
  try {
    if (act === 'del') { state.confirmDel = null; state.open.delete(id); await store.remove(id); }
    if (act === 'toggle') await store.update(id, { mastered: !it.mastered });
    if (act === 'regen') {
      state.busy.add(id); renderBook();
      try { const p = await regenPractice(it); state.busy.delete(id); await store.update(id, { practice: p }); }
      finally { state.busy.delete(id); renderBook(); }
    }
  } catch (err) {
    const s = document.createElement('div'); s.className = 'status err'; s.style.padding = '0 14px 10px'; s.textContent = errText(err);
    document.querySelector(`[data-act="open"][data-id="${id}"]`)?.closest('.item')?.append(s);
  }
});

/* ---------- print ---------- */
function printItems(){ return state.items.filter(i => state.printSel.has(i.id)).slice().sort((a,b) => a.createdAt - b.createdAt); }
function buildPrint(items, o){
  const today = fmtDate(Date.now());
  if (!items.length) return `<h1>数学错题集</h1><div class="pinfo">还没有选中错题。先在“错题集”里保存错题，再回到这里勾选。</div>`;
  let h = `<h1>数学错题集</h1><div class="pinfo">整理日期 ${today}　·　共 ${items.length} 题　·　姓名 ________　班级 ________</div>`;
  items.forEach((a, n) => {
    const m = a.motherProblem || {};
    h += `<div class="pi"><h2><span class="no">${n+1}</span>${esc(a.title)}<span class="tag">${esc(a.topic || '')}</span><span class="tag e">${esc(a.errorType || '')}</span><span class="tag">${fmtDate(a.createdAt)}</span></h2>
      <div class="blk"><b>原题</b><div><p>${tx(a.question)}</p>${o.photo && a.image ? `<img src="${a.image}" alt="">` : ''}</div></div>`;
    if (o.sol) {
      h += `<div class="blk"><b>错因</b><div><p>【${esc(a.errorType)}】${a.studentAnswer ? `原作答 <span class="wr">${tx(a.studentAnswer)}</span>；` : ''}${tx(a.errorAnalysis)}</p></div></div>
      <div class="blk"><b>母题</b><div><p><strong>${esc(m.name)}</strong>：${tx(m.statement)}</p><p>通法：${tx(m.method)}</p><p>突破口：${tx(m.keyIdea)}</p></div></div>
      <div class="blk"><b>正解</b><div><ol>${(a.solution||[]).map(s => `<li><strong>${tx(s.step)}</strong>　${tx(s.detail)}</li>`).join('')}</ol><p>答案：${tx(a.answer)}</p></div></div>
      <div class="blk"><b>归纳</b><div><p><strong>${tx(a.summary)}</strong></p>${(a.pitfalls||[]).length ? `<p>易错：${(a.pitfalls||[]).map(tx).join('；')}</p>` : ''}</div></div>`;
    }
    h += `<div class="blk"><b>巩固</b><div>${(a.practice||[]).map((p,k) => `<p>（${k+1}）${tx(p.question)}</p>${o.space ? '<div class="lines"></div>' : ''}${!o.ans ? `<p>答案：${tx(p.answer)}　${tx(p.solution)}</p>` : ''}`).join('')}</div></div></div>`;
  });
  if (o.ans) {
    h += `<div class="anssec"><h2>参考答案</h2>${items.map((a,n) => `<div class="blk"><b>第 ${n+1} 题</b><div>${(a.practice||[]).map((p,k) => `<p>（${k+1}）答案：${tx(p.answer)}。${tx(p.solution)}</p>`).join('')}</div></div>`).join('')}</div>`;
  }
  return h;
}
const popts = () => ({ photo: $('#optPhoto').checked, sol: $('#optSol').checked, space: $('#optSpace').checked, ans: $('#optAns').checked });
function renderPrint(){
  if (!state.printSel) state.printSel = new Set(state.items.filter(i => !i.mastered).map(i => i.id));
  for (const id of [...state.printSel]) if (!state.items.some(i => i.id === id)) state.printSel.delete(id);
  $('#plist').innerHTML = state.items.length ? state.items.map(i => `<label><input type="checkbox" data-id="${i.id}" ${state.printSel.has(i.id) ? 'checked' : ''}><span>${esc(i.title)} <span class="chip ${i.mastered ? 'ok' : 'todo'}">${i.mastered ? '已掌握' : '未掌握'}</span></span></label>`).join('')
    : '<p class="hint">错题集里还没有题目。</p>';
  $('#doPrint').disabled = !state.printSel.size;
  const pv = $('#preview'); pv.innerHTML = buildPrint(printItems(), popts()); return typeset(pv);
}
$('#plist').addEventListener('change', e => { const id = e.target.dataset.id; if (!id) return; e.target.checked ? state.printSel.add(id) : state.printSel.delete(id); renderPrint(); });
['#optPhoto','#optSol','#optSpace','#optAns'].forEach(s => $(s).addEventListener('change', renderPrint));
$('#selAll').addEventListener('click', () => { state.printSel = new Set(state.items.map(i => i.id)); renderPrint(); });
$('#selNone').addEventListener('click', () => { state.printSel = new Set(); renderPrint(); });
$('#selTodo').addEventListener('click', () => { state.printSel = new Set(state.items.filter(i => !i.mastered).map(i => i.id)); renderPrint(); });
$('#doPrint').addEventListener('click', async () => {
  await renderPrint();
  $('#printRoot').innerHTML = $('#preview').innerHTML;
  window.print();
});

/* ---------- boot ---------- */
(async () => {
  refreshKeyBar();
  renderResult();
  await store.load();
  renderBook();
  const h = (location.hash || '').slice(1); if (['book','print'].includes(h)) setView(h);
})();
})();
