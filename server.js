const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4174);
const ROOT = __dirname;
const GATEWAY = "https://i.weread.qq.com/api/agent/gateway";
const SKILL_VERSION = "1.0.3";
let runtimeWereadApiKey = "";

const mimeTypes = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "application/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".md": "text/markdown;charset=utf-8"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json;charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

async function weread(apiName, params = {}, requestApiKey = "") {
  const apiKey = requestApiKey || runtimeWereadApiKey || process.env.WEREAD_API_KEY;
  if (!apiKey) {
    const error = new Error("缺少 WEREAD_API_KEY。请先在启动服务的终端设置环境变量。");
    error.status = 401;
    throw error;
  }

  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ api_name: apiName, skill_version: SKILL_VERSION, ...params })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errcode) {
    const error = new Error(data.errmsg || data.message || `微信读书接口失败：${apiName}`);
    error.status = response.status || 502;
    throw error;
  }
  if (data.upgrade_info?.message) {
    const error = new Error(data.upgrade_info.message);
    error.status = 409;
    throw error;
  }
  return data;
}

async function listNotebooks(requestApiKey = "") {
  const books = [];
  let lastSort;
  for (let page = 0; page < 20; page += 1) {
    const params = { count: 100 };
    if (lastSort) params.lastSort = lastSort;
    const data = await weread("/user/notebooks", params, requestApiKey);
    const pageBooks = data.books || [];
    books.push(...pageBooks);
    if (!data.hasMore || !pageBooks.length) break;
    lastSort = pageBooks[pageBooks.length - 1].sort;
  }
  return books.map((item) => ({
    bookId: item.bookId || item.book?.bookId,
    title: item.book?.title || item.title || "未命名书籍",
    author: item.book?.author || item.author || "",
    cover: item.book?.cover || "",
    readingProgress: item.readingProgress,
    totalNoteCount: Number(item.reviewCount || 0) + Number(item.noteCount || 0) + Number(item.bookmarkCount || 0),
    reviewCount: Number(item.reviewCount || 0),
    noteCount: Number(item.noteCount || 0),
    bookmarkCount: Number(item.bookmarkCount || 0)
  })).filter((book) => book.bookId);
}

async function resolveBook(query, requestApiKey = "") {
  if (/^\d+$/.test(query) || /^[0-9a-f]{8,}$/i.test(query)) {
    const info = await weread("/book/info", { bookId: query }, requestApiKey);
    return {
      bookId: query,
      title: info.title || query,
      author: info.author || "",
      summary: info.intro || "从微信读书同步的个人划线与想法。"
    };
  }

  const result = await weread("/store/search", { keyword: query, scope: 10, count: 5 }, requestApiKey);
  const groups = result.results || [];
  const firstBook = groups.flatMap((group) => group.books || [])[0]?.bookInfo;
  if (!firstBook?.bookId) throw new Error(`没有在微信读书中找到《${query}》。`);
  return {
    bookId: firstBook.bookId,
    title: firstBook.title || query,
    author: firstBook.author || "",
    summary: firstBook.intro || "从微信读书同步的个人划线与想法。"
  };
}

function chapterMap(chapters = []) {
  return new Map(chapters.map((chapter) => [String(chapter.chapterUid), chapter.title || `章节 ${chapter.chapterUid}`]));
}

async function listMineReviews(bookId, requestApiKey = "") {
  const reviews = [];
  let synckey = 0;
  for (let page = 0; page < 20; page += 1) {
    const data = await weread("/review/list/mine", { bookid: bookId, synckey, count: 100 }, requestApiKey);
    reviews.push(...(data.reviews || []));
    if (!data.hasMore) break;
    synckey = data.synckey;
  }
  return reviews;
}

async function getBookNotes(query, member, requestApiKey = "") {
  const book = await resolveBook(query, requestApiKey);
  const [bookmarkData, mineReviews] = await Promise.all([
    weread("/book/bookmarklist", { bookId: book.bookId }, requestApiKey),
    listMineReviews(book.bookId, requestApiKey)
  ]);
  const chapters = chapterMap(bookmarkData.chapters || []);
  const reviewByRange = new Map();

  mineReviews.forEach((item) => {
    const review = item.review || item;
    const range = String(review.range || "");
    if (!range) return;
    reviewByRange.set(range, review.content || review.abstract || "");
  });

  const bookmarkNotes = (bookmarkData.updated || []).map((bookmark) => ({
    member,
    chapter: chapters.get(String(bookmark.chapterUid)) || bookmark.chapterName || "未分章节",
    theme: "",
    highlight: bookmark.markText || "",
    thought: reviewByRange.get(String(bookmark.range || "")) || "",
    range: bookmark.range || "",
    createTime: bookmark.createTime
  })).filter((note) => note.highlight);

  const standaloneReviews = mineReviews.map((item) => item.review || item).filter((review) => {
    return review.content && !review.range;
  }).map((review) => ({
    member,
    chapter: review.chapterName || "整本书想法",
    theme: "",
    highlight: review.abstract || "个人想法",
    thought: review.content || "",
    range: review.range || "",
    createTime: review.createTime
  }));

  return {
    book,
    notes: [...bookmarkNotes, ...standaloneReviews]
  };
}

async function handleApi(req, res, url) {
  try {
    const requestApiKey = String(req.headers["x-weread-api-key"] || "").trim();
    if (url.pathname === "/api/weread/status") {
      sendJson(res, 200, { hasKey: Boolean(requestApiKey || runtimeWereadApiKey || process.env.WEREAD_API_KEY) });
      return;
    }
    if (url.pathname === "/api/weread/key" && req.method === "POST") {
      const body = await readBody(req);
      const apiKey = String(body.apiKey || "").trim();
      if (!/^wrk-[A-Za-z0-9_-]+/.test(apiKey)) throw new Error("API Key 格式看起来不对，应以 wrk- 开头。");
      runtimeWereadApiKey = apiKey;
      sendJson(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/weread/notebooks") {
      sendJson(res, 200, { books: await listNotebooks(requestApiKey) });
      return;
    }
    if (url.pathname === "/api/weread/book-notes") {
      const query = url.searchParams.get("query");
      const member = url.searchParams.get("member") || "我";
      if (!query) throw new Error("缺少 query 参数。");
      sendJson(res, 200, await getBookNotes(query, member, requestApiKey));
      return;
    }
    if (url.pathname === "/api/weread/raw" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.api_name) throw new Error("缺少 api_name。");
      const { api_name: apiName, ...params } = body;
      sendJson(res, 200, await weread(apiName, params, requestApiKey));
      return;
    }
    sendJson(res, 404, { error: "接口不存在。" });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "服务错误。" });
  }
}

function serveStatic(req, res, url) {
  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requestPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`微信读书共读整理已启动：http://127.0.0.1:${PORT}/`);
});
