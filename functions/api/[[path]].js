const GATEWAY = "https://i.weread.qq.com/api/agent/gateway";
const SKILL_VERSION = "1.0.3";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8" }
  });
}

async function weread(apiName, params, apiKey) {
  if (!apiKey) throw Object.assign(new Error("缺少 WEREAD_API_KEY。请先在页面保存 API Key。"), { status: 401 });
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
    throw Object.assign(new Error(data.errmsg || data.message || `微信读书接口失败：${apiName}`), { status: response.status || 502 });
  }
  if (data.upgrade_info?.message) throw Object.assign(new Error(data.upgrade_info.message), { status: 409 });
  return data;
}

async function listNotebooks(apiKey) {
  const books = [];
  let lastSort;
  for (let page = 0; page < 20; page += 1) {
    const params = { count: 100 };
    if (lastSort) params.lastSort = lastSort;
    const data = await weread("/user/notebooks", params, apiKey);
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

async function resolveBook(query, apiKey) {
  if (/^\d+$/.test(query) || /^[0-9a-f]{8,}$/i.test(query)) {
    const info = await weread("/book/info", { bookId: query }, apiKey);
    return {
      bookId: query,
      title: info.title || query,
      author: info.author || "",
      summary: info.intro || "从微信读书同步的个人划线与想法。"
    };
  }
  const result = await weread("/store/search", { keyword: query, scope: 10, count: 5 }, apiKey);
  const firstBook = (result.results || []).flatMap((group) => group.books || [])[0]?.bookInfo;
  if (!firstBook?.bookId) throw Object.assign(new Error(`没有在微信读书中找到《${query}》。`), { status: 404 });
  return {
    bookId: firstBook.bookId,
    title: firstBook.title || query,
    author: firstBook.author || "",
    summary: firstBook.intro || "从微信读书同步的个人划线与想法。"
  };
}

async function listMineReviews(bookId, apiKey) {
  const reviews = [];
  let synckey = 0;
  for (let page = 0; page < 20; page += 1) {
    const data = await weread("/review/list/mine", { bookid: bookId, synckey, count: 100 }, apiKey);
    reviews.push(...(data.reviews || []));
    if (!data.hasMore) break;
    synckey = data.synckey;
  }
  return reviews;
}

async function getBookNotes(query, member, apiKey) {
  const book = await resolveBook(query, apiKey);
  const [bookmarkData, mineReviews] = await Promise.all([
    weread("/book/bookmarklist", { bookId: book.bookId }, apiKey),
    listMineReviews(book.bookId, apiKey)
  ]);
  const chapters = new Map((bookmarkData.chapters || []).map((chapter) => [String(chapter.chapterUid), chapter.title || `章节 ${chapter.chapterUid}`]));
  const reviewByRange = new Map();
  mineReviews.forEach((item) => {
    const review = item.review || item;
    if (review.range) reviewByRange.set(String(review.range), review.content || review.abstract || "");
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

  return { book, notes: [...bookmarkNotes, ...standaloneReviews] };
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const apiKey = request.headers.get("X-WeRead-Api-Key") || "";

  try {
    if (pathname === "/api/weread/status") return json({ hasKey: Boolean(apiKey) });
    if (pathname === "/api/weread/key" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (!/^wrk-[A-Za-z0-9_-]+/.test(String(body.apiKey || ""))) throw Object.assign(new Error("API Key 格式看起来不对，应以 wrk- 开头。"), { status: 400 });
      return json({ ok: true });
    }
    if (pathname === "/api/weread/notebooks") return json({ books: await listNotebooks(apiKey) });
    if (pathname === "/api/weread/book-notes") {
      const query = url.searchParams.get("query");
      const member = url.searchParams.get("member") || "我";
      if (!query) throw Object.assign(new Error("缺少 query 参数。"), { status: 400 });
      return json(await getBookNotes(query, member, apiKey));
    }
    if (pathname === "/api/weread/raw" && request.method === "POST") {
      const body = await request.json();
      const { api_name: apiName, ...params } = body;
      if (!apiName) throw Object.assign(new Error("缺少 api_name。"), { status: 400 });
      return json(await weread(apiName, params, apiKey));
    }
    return json({ error: "接口不存在。" }, 404);
  } catch (error) {
    return json({ error: error.message || "服务错误。" }, error.status || 500);
  }
}
