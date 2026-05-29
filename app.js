const sampleState = {
  book: {
    title: "置身事内：中国政府与经济发展",
    author: "兰小欢",
    summary: "汇总成员在微信读书里的划线、想法和追问，按章节与主题整理，方便共读会复盘、写读书笔记和沉淀讨论材料。"
  },
  notes: [
    { member: "小北", chapter: "第一章 地方政府的权力与事务", theme: "地方治理", highlight: "地方政府不仅是政策执行者，也是很多经济活动的组织者。", thought: "这一点解释了为什么很多产业政策会呈现强烈的地方差异。", range: "100-148", createdAt: "2026-05-12" },
    { member: "阿林", chapter: "第一章 地方政府的权力与事务", theme: "地方治理", highlight: "理解中国经济，不能只看市场，也不能只看中央政策。", thought: "共读会可以从“中央-地方-市场”三角关系切入。", range: "160-226", createdAt: "2026-05-12" },
    { member: "Mia", chapter: "第二章 财税与政府行为", theme: "财税关系", highlight: "财税制度塑造了地方政府的激励结构。", thought: "这句是本书的钥匙之一。后面土地财政、招商引资都能接上。", range: "260-318", createdAt: "2026-05-13" },
    { member: "老周", chapter: "第二章 财税与政府行为", theme: "财税关系", highlight: "预算约束、收入来源和支出责任之间的错配，会改变地方政府行为。", thought: "想继续追问：这种错配在当下有哪些新变化？", range: "330-402", createdAt: "2026-05-13" },
    { member: "小鱼", chapter: "第三章 政府投融资与债务", theme: "债务风险", highlight: "融资平台承担了部分准财政功能。", thought: "读到这里终于理解为什么债务问题不能只看公司报表。", range: "520-577", createdAt: "2026-05-14" },
    { member: "青禾", chapter: "第三章 政府投融资与债务", theme: "债务风险", highlight: "许多基础设施投资的收益并不直接体现在项目现金流里。", thought: "可以把这条放进共读会的“收益在哪里”讨论题。", range: "612-690", createdAt: "2026-05-14" }
  ]
};

let state = structuredClone(sampleState);
let view = "chapter";
let activeMember = "";
let activeTheme = "";

const els = {
  bookTitle: document.querySelector("#book-title"),
  bookSummary: document.querySelector("#book-summary"),
  coverTitle: document.querySelector("#cover-title"),
  coverAuthor: document.querySelector("#cover-author"),
  metrics: {
    members: document.querySelector("#metric-members"),
    highlights: document.querySelector("#metric-highlights"),
    thoughts: document.querySelector("#metric-thoughts"),
    themes: document.querySelector("#metric-themes")
  },
  search: document.querySelector("#search"),
  members: document.querySelector("#member-filters"),
  themes: document.querySelector("#theme-filters"),
  groups: document.querySelector("#groups"),
  viewTitle: document.querySelector("#view-title"),
  importDialog: document.querySelector("#import-dialog"),
  importJson: document.querySelector("#import-json"),
  importMessage: document.querySelector("#import-message"),
  appendImport: document.querySelector("#append-import"),
  noteForm: document.querySelector("#note-form"),
  syncStatus: document.querySelector("#sync-status"),
  wereadKey: document.querySelector("#weread-key"),
  wereadQuery: document.querySelector("#weread-query"),
  wereadMember: document.querySelector("#weread-member"),
  notebookSelect: document.querySelector("#notebook-select"),
  appendSync: document.querySelector("#append-sync")
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function asDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (Number.isFinite(Number(value))) return new Date(Number(value) * 1000).toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeNote(note) {
  return {
    member: String(note.member || note.user || "我").trim(),
    chapter: String(note.chapter || note.chapterTitle || note.chapterName || "未分章节").trim(),
    theme: String(note.theme || inferTheme(note.highlight || note.markText || note.text || note.thought || note.review) || "未分类").trim(),
    highlight: String(note.highlight || note.markText || note.text || note.abstract || "").trim(),
    thought: String(note.thought || note.review || note.content || "").trim(),
    range: String(note.range || "").trim(),
    createdAt: asDate(note.createdAt || note.createTime)
  };
}

function inferTheme(text = "") {
  if (/财政|税|预算|收入|支出/.test(text)) return "财税关系";
  if (/土地|房价|地价|城市/.test(text)) return "土地财政";
  if (/债务|融资|平台/.test(text)) return "债务风险";
  if (/产业|招商|工业|竞争/.test(text)) return "产业政策";
  if (/中央|地方|政府|治理/.test(text)) return "地方治理";
  return "共读摘录";
}

function getFilteredNotes() {
  const query = els.search.value.trim().toLowerCase();
  return state.notes.filter((note) => {
    const haystack = [note.member, note.chapter, note.theme, note.highlight, note.thought].join(" ").toLowerCase();
    return (!query || haystack.includes(query))
      && (!activeMember || note.member === activeMember)
      && (!activeTheme || note.theme === activeTheme);
  });
}

function groupNotes(notes) {
  const key = { chapter: "chapter", theme: "theme", member: "member" }[view];
  return notes.reduce((acc, note) => {
    const groupName = note[key] || "未分类";
    acc[groupName] ||= [];
    acc[groupName].push(note);
    return acc;
  }, {});
}

function renderBook() {
  els.bookTitle.textContent = state.book.title;
  els.bookSummary.textContent = state.book.summary;
  els.coverTitle.textContent = state.book.title.replace(/[:：].*$/, "");
  els.coverAuthor.textContent = state.book.author;
}

function renderMetrics(notes = state.notes) {
  els.metrics.members.textContent = unique(notes.map((note) => note.member)).length;
  els.metrics.highlights.textContent = notes.length;
  els.metrics.thoughts.textContent = notes.filter((note) => note.thought).length;
  els.metrics.themes.textContent = unique(notes.map((note) => note.theme)).length;
}

function renderFilters() {
  renderChipList(els.members, unique(state.notes.map((note) => note.member)), activeMember, (value) => {
    activeMember = activeMember === value ? "" : value;
    render();
  });
  renderChipList(els.themes, unique(state.notes.map((note) => note.theme)), activeTheme, (value) => {
    activeTheme = activeTheme === value ? "" : value;
    render();
  });
}

function renderChipList(container, values, activeValue, onSelect) {
  container.replaceChildren();
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${value === activeValue ? " active" : ""}`;
    button.textContent = value;
    button.addEventListener("click", () => onSelect(value));
    container.append(button);
  });
}

function renderGroups() {
  const notes = getFilteredNotes();
  const groups = groupNotes(notes);
  const groupTemplate = document.querySelector("#group-template");
  const noteTemplate = document.querySelector("#note-template");

  els.viewTitle.textContent = { chapter: "按章节汇总", theme: "按主题汇总", member: "按成员汇总" }[view];
  els.groups.replaceChildren();

  Object.entries(groups).forEach(([name, groupNotes]) => {
    const groupNode = groupTemplate.content.firstElementChild.cloneNode(true);
    groupNode.querySelector(".group-title strong").textContent = name;
    groupNode.querySelector(".group-title span").textContent = `${groupNotes.length} 条`;
    const list = groupNode.querySelector(".note-list");

    groupNotes.forEach((note) => {
      const noteNode = noteTemplate.content.firstElementChild.cloneNode(true);
      noteNode.querySelector(".avatar").textContent = note.member.slice(0, 1);
      noteNode.querySelector(".note-meta strong").textContent = note.member;
      noteNode.querySelector(".note-meta small").textContent = note.createdAt;
      noteNode.querySelector("blockquote").textContent = note.highlight;
      noteNode.querySelector("p").textContent = note.thought || "暂未写下感想。";
      const tags = noteNode.querySelector(".note-tags");
      [note.chapter, note.theme, note.range && `位置 ${note.range}`].filter(Boolean).forEach((tag) => {
        const span = document.createElement("span");
        span.textContent = tag;
        tags.append(span);
      });
      list.append(noteNode);
    });

    els.groups.append(groupNode);
  });

  if (!notes.length) {
    const empty = document.createElement("p");
    empty.className = "form-message";
    empty.textContent = "没有匹配的划线或感想。";
    els.groups.append(empty);
  }

  renderMetrics(notes);
}

function render() {
  renderBook();
  renderFilters();
  renderGroups();
}

function noteKey(note) {
  return [note.member, note.chapter, note.range, note.highlight].join("|");
}

function mergeNotes(existing, incoming) {
  const merged = [...incoming, ...existing].map(normalizeNote).filter((note) => note.highlight);
  const seen = new Set();
  return merged.filter((note) => {
    const key = noteKey(note);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeWereadState(incoming, append = true) {
  state = {
    book: incoming.book || state.book,
    notes: append ? mergeNotes(state.notes, incoming.notes) : incoming.notes.map(normalizeNote)
  };
  activeMember = "";
  activeTheme = "";
  render();
}

async function api(path, options) {
  const headers = new Headers(options?.headers || {});
  const apiKey = sessionStorage.getItem("weread_api_key");
  if (apiKey && !headers.has("X-WeRead-Api-Key")) headers.set("X-WeRead-Api-Key", apiKey);
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function checkWereadStatus() {
  try {
    const status = await api("/api/weread/status");
    els.syncStatus.textContent = status.hasKey
      ? "已连接本地微信读书服务，可以同步你的笔记。"
      : "本地服务已启动，但缺少 WEREAD_API_KEY。";
  } catch {
    els.syncStatus.textContent = "请使用 server.js 启动页面，才能连接微信读书。";
  }
}

async function loadNotebooks() {
  els.syncStatus.textContent = "正在读取微信读书笔记本...";
  const data = await api("/api/weread/notebooks");
  els.notebookSelect.innerHTML = '<option value="">选择一本有笔记的书</option>';
  data.books.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.bookId;
    option.textContent = `${item.title} - ${item.author || "未知作者"}（${item.totalNoteCount} 条）`;
    option.dataset.title = item.title;
    els.notebookSelect.append(option);
  });
  els.syncStatus.textContent = `读取到 ${data.books.length} 本有笔记的书。`;
}

async function saveWereadKey() {
  const apiKey = els.wereadKey.value.trim();
  if (!apiKey) throw new Error("请先粘贴微信读书 API Key。");
  sessionStorage.setItem("weread_api_key", apiKey);
  await api("/api/weread/key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey })
  });
  els.wereadKey.value = "";
  els.syncStatus.textContent = "API Key 已保存到本次本地服务，可以同步微信读书数据。";
}

async function syncWereadBook() {
  const query = els.wereadQuery.value.trim() || els.notebookSelect.value.trim();
  if (!query) throw new Error("请输入书名、bookId，或先从笔记本列表里选择一本书。");
  const member = els.wereadMember.value.trim() || "我";
  els.syncStatus.textContent = "正在同步划线和想法...";
  const data = await api(`/api/weread/book-notes?query=${encodeURIComponent(query)}&member=${encodeURIComponent(member)}`);
  mergeWereadState(data, els.appendSync.checked);
  els.syncStatus.textContent = `已同步 ${member} 的《${data.book.title}》：${data.notes.length} 条划线/想法。`;
}

function exportMarkdown() {
  const notes = getFilteredNotes();
  const groups = groupNotes(notes);
  const lines = [`# ${state.book.title}`, "", `作者：${state.book.author}`, "", state.book.summary, ""];
  Object.entries(groups).forEach(([name, groupNotes]) => {
    lines.push(`## ${name}`, "");
    groupNotes.forEach((note) => {
      lines.push(`> ${note.highlight}`, "");
      if (note.thought) lines.push(`- ${note.member}：${note.thought}`);
      lines.push(`- 标签：${note.chapter} / ${note.theme}${note.range ? ` / ${note.range}` : ""}`, "");
    });
  });
  downloadText(`${state.book.title}-共读整理.md`, lines.join("\n"));
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;

  try {
    if (target.dataset.view) {
      view = target.dataset.view;
      document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button === target));
      renderGroups();
    }
    if (target.dataset.action === "reset-filter") {
      activeMember = "";
      activeTheme = "";
      els.search.value = "";
      render();
    }
    if (target.dataset.action === "open-import") {
      els.importJson.value = JSON.stringify(state, null, 2);
      els.importMessage.textContent = "";
      els.importDialog.showModal();
    }
    if (target.dataset.action === "load-sample") {
      els.importJson.value = JSON.stringify(sampleState, null, 2);
      els.importMessage.textContent = "已填入示例数据。";
    }
    if (target.dataset.action === "apply-import") {
      const incoming = JSON.parse(els.importJson.value);
      const notes = Array.isArray(incoming) ? incoming : incoming.notes;
      if (!Array.isArray(notes)) throw new Error("没有找到 notes 数组。");
      state = {
        book: {
          title: incoming.book?.title || state.book.title,
          author: incoming.book?.author || state.book.author,
          summary: incoming.book?.summary || state.book.summary
        },
        notes: els.appendImport.checked ? mergeNotes(state.notes, notes) : notes.map(normalizeNote).filter((note) => note.highlight)
      };
      els.importDialog.close();
      render();
    }
    if (target.dataset.action === "export") exportMarkdown();
    if (target.dataset.action === "copy-json") {
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
      target.textContent = "已复制";
      window.setTimeout(() => { target.textContent = "复制数据 JSON"; }, 1200);
    }
    if (target.dataset.action === "load-notebooks") await loadNotebooks();
    if (target.dataset.action === "save-weread-key") await saveWereadKey();
    if (target.dataset.action === "sync-weread") await syncWereadBook();
  } catch (error) {
    els.syncStatus.textContent = error.message || "操作失败。";
    els.importMessage.textContent = error.message || "";
  }
});

els.notebookSelect.addEventListener("change", () => {
  els.wereadQuery.value = els.notebookSelect.value;
});
els.search.addEventListener("input", renderGroups);
els.noteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.noteForm).entries());
  state.notes.unshift(normalizeNote(data));
  els.noteForm.reset();
  render();
});

render();
checkWereadStatus();
