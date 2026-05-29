# 微信读书共读整理

一个本地静态页面，用来把多人共读同一本书时产生的微信读书划线、想法和讨论结论整理到一起。

## 使用方式

如果只想使用示例数据，直接打开 `index.html` 即可使用。页面支持：

- 按章节、主题、成员汇总划线和感想
- 搜索、筛选成员、筛选主题
- 手动补充共读笔记
- 导入 JSON 数据
- 导出 Markdown 共读整理稿

## 连接微信读书

连接微信读书需要用本地 Node 服务启动页面，避免把 API Key 暴露给浏览器。

PowerShell：

```powershell
$env:WEREAD_API_KEY="wrk-你的apikey"
node server.js
```

然后打开：

```text
http://127.0.0.1:4174/
```

如果 `4174` 被占用，可以换端口：

```powershell
$env:PORT="4175"
$env:WEREAD_API_KEY="wrk-你的apikey"
node server.js
```

页面侧栏的“微信读书同步”支持：

- 读取 `/user/notebooks`，列出有笔记的书
- 按书名或 bookId 搜索书籍
- 同步 `/book/bookmarklist` 的划线
- 同步 `/review/list/mine` 的个人想法，并尽量合并到对应划线下

也可以不设置环境变量：启动 `node server.js` 后，在页面侧栏粘贴 API Key 并点“保存 API Key”。这种方式只把 Key 保存在当前本机 Node 进程内存里，重启服务后需要重新输入。

## 导入数据格式

可以导入完整对象：

```json
{
  "book": {
    "title": "书名",
    "author": "作者",
    "summary": "共读说明"
  },
  "notes": [
    {
      "member": "成员名",
      "chapter": "章节名",
      "theme": "主题",
      "highlight": "划线原文",
      "thought": "感想",
      "range": "100-148",
      "createdAt": "2026-05-21"
    }
  ]
}
```

也可以只导入数组。字段兼容 `user`、`chapterTitle`、`markText`、`text`、`review`、`abstract` 等常见整理字段。

## 多人共读

微信读书 API Key 绑定的是单个用户身份。多人共读时，可以让每个成员在自己的电脑同步后导出 JSON，再由组织者导入到同一个页面；也可以为服务端增加多成员 Key 管理，但不建议在前端保存任何 API Key。
