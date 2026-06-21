# Gemini 参考图上传方案

## 问题背景

OpsV pipeline 使用 Gemini 生成图片时，需要上传参考图（如 `yunli_1.png`）到 Gemini composer，
让 Gemini 基于参考图进行编辑。但 Gemini 的图片上传机制无法通过标准 Web API 自动化。

## 已失败的尝试

| 尝试 | 方法 | 结果 |
|------|------|------|
| `showOpenFilePicker` override | 劫持 File System Access API | Gemini 从未调用此 API |
| Drag-and-drop via DragEvent | 在 xap-uploader-dropzone 上派发拖拽事件 | 事件被派发但无预览 |
| ClipboardEvent paste | 在 composer 上派发粘贴事件（含 DataTransfer） | Composer 保持 `<p><br></p>` 不变 |
| DOM.setFileInputFiles | CDP 直接设值 | 页面上无 `<input type="file">` 元素 |
| Page.setInterceptFileChooserDialog | CDP 拦截原生文件对话框 | 被 OpenCLI 扩展的 CDP_ALLOWLIST 阻止 |
| MutationObserver | 监控页面是否有 input 元素被创建 | 整个生命周期内从未出现 |

**根因**：Gemini 使用 Chrome 原生对话框机制，不走 `<input type="file">` 或
`showOpenFilePicker` 等标准 Web API。对话框由 Chromium 内部触发，JavaScript 层无法拦截。

## 解决方案

### 核心思路

利用 Chrome 扩展的 `chrome.debugger` API + CDP 
`Page.addScriptToEvaluateOnNewDocument` 在 Gemini 加载**之前**注入脚本，
覆盖文件选择 API，使 Gemini 的对话框调用被我们拦截。

### 架构图

```
┌────────────────────────────────────────────────────────┐
│  gemini-daemon.ts                                      │
│  1. cdp: Page.addScriptToEvaluateOnNewDocument(inject) │
│  2. navigate → gemini.google.com (脚本已就绪)          │
│  3. exec: chunk 传文件数据 → 设置 window.__pendingFile  │
│  4. exec: 点击上传按钮                                   │
│  5. 注入的脚本拦截 showOpenFilePicker → 返回文件         │
└────────────────────────────────────────────────────────┘
        │ HTTP POST /command
        ▼
┌────────────────────────────────────────────────────────┐
│  OpenCLI Daemon (port 19825)                           │
│  转发命令到扩展 WebSocket                                │
└────────────────────────────────────────────────────────┘
        │ WebSocket
        ▼
┌────────────────────────────────────────────────────────┐
│  OpenCLI Extension Service Worker                      │
│  background.ts → chrome.debugger → CDP                 │
│  CDP_ALLOWLIST 包含新增方法                              │
└────────────────────────────────────────────────────────┘
```

### 注入脚本内容

在 `document_start` 阶段（早于 Gemini 的任何 JS），覆盖以下 API：

```javascript
// 1. showOpenFilePicker — File System Access API
const origShowOpenFilePicker = window.showOpenFilePicker;
window.showOpenFilePicker = async function(options) {
  const pending = window.__geminiPendingUpload;
  if (pending) {
    window.__geminiPendingUpload = null;
    // 构造 FileSystemFileHandle 兼容对象
    return [{
      kind: 'file',
      name: pending.file.name,
      getFile: () => Promise.resolve(pending.file),
    }];
  }
  return origShowOpenFilePicker.call(this, options);
};

// 2. HTMLInputElement.prototype.click — 拦截隐藏 file input
const origInputClick = HTMLInputElement.prototype.click;
HTMLInputElement.prototype.click = function() {
  if (this.type === 'file') {
    window.__lastFileInput = this;
    const pending = window.__geminiPendingUpload;
    if (pending) {
      window.__geminiPendingUpload = null;
      // 通过 DataTransfer 设值
      const dt = new DataTransfer();
      dt.items.add(pending.file);
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'files'
      ).set.call(this, dt.files);
      this.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }
  return origInputClick.apply(this, arguments);
};
```

### 修改点

| 文件 | 修改 |
|------|------|
| `vendor/opencli/extension/src/background.ts` | 添加 `Page.addScriptToEvaluateOnNewDocument` 到 CDP_ALLOWLIST |
| `src/webapp-runner/runners/gemini-daemon.ts` | 添加 `injectFileUploadScript()` 和新的 `uploadReferenceImage()` 逻辑 |

### 无需修改

- `manifest.json` — 不需要 content_scripts，通过 CDP 动态注入
- `protocol.ts` — 现有 `cdp` action 已足够
- 扩展无需重载（运行时修改 background.js 后需重载一次使 ALLOWLIST 生效）
