/* ============================================================
 * 安瑞的世界 · 内容编辑程序逻辑
 * 功能：增删改资源、站点设置、链接管理、导入/导出 data.js、
 *       自动草稿、实时预览
 * ============================================================ */
(function () {
  "use strict";

  /* ==========================================================
   * 🔒 编辑口令（站长自行修改）
   * 修改下面 EDITOR_KEY 的值即可更换口令，例如改成自己的生日：
   *   var EDITOR_KEY = "你的新口令";
   * 注意：口令会明文保存在本文件里，请勿把本文件发给他人。
   * ========================================================== */
  var EDITOR_KEY = "WWWanrryyy";

  var DRAFT_KEY = "anrui-editor-draft";

  var editorData = deepClone(window.ANRUI_DATA);
  var currentId = null;
  var previewReady = false;

  /* ================= 登录验证 ================= */
  function initLogin() {
    var mask = $("login-mask");
    function tryLogin() {
      if ($("login-key").value === EDITOR_KEY) {
        mask.hidden = true;
        $("login-key").value = "";
        init();
      } else {
        $("login-err").hidden = false;
        $("login-key").value = "";
        $("login-key").focus();
      }
    }
    $("login-btn").addEventListener("click", tryLogin);
    $("login-key").addEventListener("keydown", function (e) {
      if (e.key === "Enter") tryLogin();
    });
    setTimeout(function () { $("login-key").focus(); }, 100);
  }

  /* ================= 工具函数 ================= */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function uid() {
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function $(id) { return document.getElementById(id); }

  function findResource(id) {
    return (editorData.resources || []).find(function (r) { return r.id === id; });
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ time: Date.now(), data: editorData }));
    } catch (e) { /* 忽略 */ }
  }

  function status(msg, warn) {
    var bar = $("status-bar");
    bar.textContent = msg;
    bar.className = "ed-status" + (warn ? " warn" : "");
  }

  /* ================= 列表 ================= */
  function renderList() {
    var listEl = $("res-list");
    var kw = $("side-search").value.trim().toLowerCase();
    var res = (editorData.resources || []).slice();
    if (kw) {
      res = res.filter(function (r) {
        return (r.title + " " + (r.type || "")).toLowerCase().indexOf(kw) !== -1;
      });
    }
    $("res-count").textContent = res.length;

    if (!res.length) {
      listEl.innerHTML = '<li class="res-empty">暂无资源，点击右上角「＋ 新增资源」创建</li>';
      return;
    }
    listEl.innerHTML = res.map(function (r) {
      var active = r.id === currentId ? " active" : "";
      return '<li class="res-item' + active + '" data-id="' + r.id + '" draggable="true">'
        + '<div class="ri-title">' + esc(r.icon || "🧩") + " " + esc(r.title || "（未命名）")
        + (r.featured ? ' <span class="ri-star">★</span>' : "")
        + '<span class="ri-grip" title="拖拽排序">⋮⋮</span></div>'
        + '<div class="ri-meta">' + esc(r.type || "未分类")
        + (r.date ? " · " + esc(r.date) : "") + "</div>"
        + "</li>";
    }).join("");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ================= 表单 ================= */
  function fillTypeSelect() {
    var sel = $("f-type");
    var cats = editorData.categories || [];
    if (!cats.length) cats = ["MOD", "数据包", "整合包", "其他"];
    var current = sel.value;
    sel.innerHTML = cats.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + "</option>";
    }).join("");
    if (current && cats.indexOf(current) !== -1) sel.value = current;
  }

  function loadResourceForm(r) {
    fillTypeSelect();
    $("f-title").value = r.title || "";
    $("f-type").value = r.type || (editorData.categories || [])[0] || "";
    $("f-icon").value = r.icon || "";
    $("f-version").value = r.version || "";
    $("f-author").value = r.author || "";
    $("f-date").value = r.date || "";
    $("f-desc").value = r.description || "";
    $("f-featured").checked = !!r.featured;
    renderIconList();
    renderLinks(r);
    renderImgList(r);
    $("form-title").textContent = r.title ? "编辑资源：" + r.title : "编辑资源";
  }

  /* 图标预设列表（MC 主题 emoji） */
  var ICON_PRESETS = [
    "🧩", "⚒️", "🗺️", "📦", "🗡️", "🛡️", "🏰", "🌲",
    "🔥", "💎", "⛏️", "🧱", "🌟", "🍎", "🐷", "🐉",
    "🚀", "⚙️", "📜", "🎮", "🪓", "🏹", "🌍", "💰",
    "🐲", "🦅", "🍄", "⚡", "🛠️", "🎯", "🌈", "🔮",
    "🔌", "💾", "📁", "🌐", "🧰", "🗃️"
  ];

  /* 分类 → 默认图标映射 */
  var DEFAULT_ICONS = {
    "MOD": "⚒️",
    "模组": "⚒️",
    "整合包": "📦",
    "数据包": "🌐",
    "光影": "🌟",
    "服务器插件": "🧩",
    "地图存档": "🏡",
    "存档": "🏡"
  };
  function getDefaultIcon(type) {
    if (!type) return "";
    if (DEFAULT_ICONS[type]) return DEFAULT_ICONS[type];
    for (var k in DEFAULT_ICONS) {
      if (type.indexOf(k) !== -1) return DEFAULT_ICONS[k];
    }
    return "";
  }

  function renderIconList() {
    var box = document.getElementById("f-icon-list");
    if (!box) return;
    var cur = document.getElementById("f-icon").value;
    box.innerHTML = ICON_PRESETS.map(function (e) {
      return '<button type="button" class="icon-opt' + (e === cur ? " active" : "") +
        '" data-icon="' + e + '" title="' + e + '">' + e + "</button>";
    }).join("");
  }

  function renderLinks(r) {
    var box = $("link-list");
    var links = r.links || [];
    if (!links.length) {
      box.innerHTML = '<div class="link-hint">暂无下载链接，点击「＋ 添加链接」添加（默认使用夸克网盘）。</div>';
      return;
    }
    box.innerHTML = links.map(function (l, i) {
      return '<div class="link-row">'
        + '<input type="text" class="lk-name" data-i="' + i + '" placeholder="平台名" value="' + esc(l.name) + '">'
        + '<input type="text" class="lk-url" data-i="' + i + '" placeholder="链接地址（留空=施工中）" value="' + esc(l.url) + '">'
        + '<input type="text" class="lk-code" data-i="' + i + '" placeholder="提取码" value="' + esc(l.code) + '">'
        + '<input type="text" class="lk-note" data-i="' + i + '" placeholder="备注" value="' + esc(l.note) + '">'
        + '<button type="button" class="link-del" data-i="' + i + '" title="删除该链接">✕</button>'
        + "</div>";
    }).join("");
  }

  function selectResource(id) {
    currentId = id;
    var r = findResource(id);
    renderList();
    if (r) loadResourceForm(r);
    refreshPreview();
  }

  function addLink() {
    var r = findResource(currentId);
    if (!r) return;
    if (!r.links) r.links = [];
    r.links.push({ name: "百度网盘", url: "", code: "", note: "" });
    renderLinks(r);
    onEdit();
  }

  /* ================= 图片管理 ================= */
  function renderImgList(r) {
    var box = $("img-list");
    if (!box) return;
    var imgs = r.images || [];
    if (!imgs.length) {
      box.innerHTML = '<div class="img-hint">还没有图片，点「🖼️ 上传图片」添加（JPG / PNG / WebP 均可）</div>';
      return;
    }
    box.innerHTML = imgs.map(function (src, i) {
      var sizeKB = Math.max(1, Math.round((src.length * 0.75) / 1024));
      var coverBadge = i === 0 ? '<span class="img-cover-badge">封面</span>' : "";
      return '<div class="img-item">'
        + '<a href="' + src + '" target="_blank" rel="noopener" title="点击放大查看">'
        + '<img src="' + src + '" alt="图片 ' + (i + 1) + '" loading="lazy">' + coverBadge + "</a>"
        + '<div class="img-actions">'
        + (i > 0 ? '<button type="button" class="ed-btn small" data-imgcover="' + i + '" title="设为第一张封面">设为封面</button>' : "")
        + '<button type="button" class="ed-btn small danger" data-imgdel="' + i + '" title="删除该图片">删除</button>'
        + "</div>"
        + '<div class="img-size">' + sizeKB + " KB</div>"
        + "</div>";
    }).join("");
  }

  /* 处理单张图片：≤300KB 原样保留，否则 canvas 压缩到 960px JPG */
  function processImageFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      if (file.size <= 300 * 1024) {
        reader.onload = function () { resolve({ data: reader.result, size: file.size }); };
        reader.readAsDataURL(file);
        return;
      }
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var maxSide = 960;
          var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          var out = canvas.toDataURL("image/jpeg", 0.82);
          resolve({ data: out, size: Math.round(out.length * 0.75) });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function uploadImages(files) {
    var r = findResource(currentId);
    if (!r || !files.length) return;
    if (!r.images) r.images = [];
    status("正在处理 " + files.length + " 张图片，请稍候…");
    var list = Array.prototype.slice.call(files);
    var done = 0;
    list.forEach(function (file) {
      processImageFile(file).then(function (res) {
        r.images.push(res.data);
        done++;
        if (done === list.length) {
          renderImgList(r);
          onEdit();
          status("✅ 已添加 " + list.length + " 张图片，记得「💾 导出 / 保存」");
        }
      }).catch(function () {
        done++;
        if (done === list.length) {
          renderImgList(r);
          onEdit();
          status("⚠️ 部分图片处理失败，请重试或换一张", true);
        }
      });
    });
  }

  function deleteImage(index) {
    var r = findResource(currentId);
    if (!r || !r.images) return;
    if (!window.confirm("确定删除这张图片？")) return;
    r.images.splice(index, 1);
    renderImgList(r);
    onEdit();
  }

  function setCover(index) {
    var r = findResource(currentId);
    if (!r || !r.images || index <= 0) return;
    var img = r.images.splice(index, 1)[0];
    r.images.unshift(img);
    renderImgList(r);
    onEdit();
    status("✅ 已设为封面");
  }

  function clearImages() {
    var r = findResource(currentId);
    if (!r || !r.images || !r.images.length) { status("当前资源没有图片"); return; }
    if (!window.confirm("确定删除该资源全部 " + r.images.length + " 张图片？此操作不可撤销。")) return;
    r.images = [];
    renderImgList(r);
    onEdit();
    status("已清空该资源全部图片");
  }

  /* ================= 编辑动作（统一入口：保存草稿 + 刷新预览） ================= */
  function onEdit() {
    saveDraft();
    refreshPreview();
  }

  /* ================= 站点设置表单 ================= */
  function loadSiteForm() {
    var s = editorData.site || {};
    $("s-name").value = s.name || "";
    $("s-slogan").value = s.slogan || "";
    $("s-desc").value = s.description || "";
    $("s-ann").value = s.announcement || "";
    $("s-footer").value = s.footer || "";
    $("s-cats").value = (editorData.categories || []).join("\n");
    $("s-hcolor").value = s.headerColor || "#6ab04c";
    $("s-pcolor").value = s.pageColor || "#f4f9ef";
    renderBgThumbs(s);

    var m = s.mascot || {};
    $("s-mascot-enabled").checked = !!m.enabled;
    $("s-mascot-model").value = m.model === "steve" ? "steve" : "alex";
    $("s-mascot-initial").value = m.initialText || "";
    $("s-mascot-ouch").value = m.ouchText || "";
    $("s-mascot-tips").value = (m.tips || []).join("\n");
    $("s-mascot-reactions").value = (m.reactions || []).join("\n");
    var chance = typeof m.reactionChance === "number" ? Math.round(m.reactionChance * 100) : 35;
    $("s-mascot-chance").value = chance;
    $("s-mascot-chance-val").textContent = chance + "%";
    renderMascotThumb(m.image || "");
    renderSwordThumb(m.swordImage || "");

    setMascotRange("s-mascot-figscale", m.figScale, 1.15, "×");
    setMascotRange("s-mascot-figx", m.figX, 0, "");
    setMascotRange("s-mascot-figy", m.figY, 0, "");
    setMascotRange("s-mascot-figrot", m.figRot, -18, "°");
    setMascotRange("s-mascot-swordscale", m.swordScale, 1, "×");
    setMascotRange("s-mascot-swordx", m.swordX, 0, "");
    setMascotRange("s-mascot-swordy", m.swordY, -6, "");
    setMascotRange("s-mascot-swordangle", m.swordAngle, -12, "°");
  }

  function setMascotRange(id, val, def, suffix) {
    var el = $(id);
    if (!el) return;
    var v = (typeof val === "number" && isFinite(val)) ? val : def;
    el.value = v;
    var tip = $(id + "-val");
    if (tip) tip.textContent = v + suffix;
  }

  function saveSiteForm() {
    editorData.site = editorData.site || {};
    editorData.site.name = $("s-name").value.trim();
    editorData.site.slogan = $("s-slogan").value.trim();
    editorData.site.description = $("s-desc").value.trim();
    editorData.site.announcement = $("s-ann").value.trim();
    editorData.site.footer = $("s-footer").value.trim();
    editorData.site.headerColor = $("s-hcolor").value || "#6ab04c";
    editorData.site.pageColor = $("s-pcolor").value || "#f4f9ef";
    // headerImage / pageImage 由上传时写入，这里保留已有值
    editorData.categories = $("s-cats").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);

    editorData.site.mascot = editorData.site.mascot || {};
    var m = editorData.site.mascot;
    m.enabled = $("s-mascot-enabled").checked;
    m.model = $("s-mascot-model").value === "steve" ? "steve" : "alex";
    m.initialText = $("s-mascot-initial").value.trim();
    m.ouchText = $("s-mascot-ouch").value.trim();
    m.tips = $("s-mascot-tips").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    m.reactions = $("s-mascot-reactions").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    m.reactionChance = parseInt($("s-mascot-chance").value || "35", 10) / 100;
    m.figScale = parseFloat($("s-mascot-figscale").value);
    m.figX = parseInt($("s-mascot-figx").value, 10);
    m.figY = parseInt($("s-mascot-figy").value, 10);
    m.figRot = parseInt($("s-mascot-figrot").value, 10);
    m.swordScale = parseFloat($("s-mascot-swordscale").value);
    m.swordX = parseInt($("s-mascot-swordx").value, 10);
    m.swordY = parseInt($("s-mascot-swordy").value, 10);
    m.swordAngle = parseInt($("s-mascot-swordangle").value, 10);
    // mascot.image 由上传时写入，这里保留已有值

    fillTypeSelect();
    onEdit();
  }

  /* 背景图缩略图显示 */
  function renderBgThumbs(s) {
    var h = s && s.headerImage;
    var p = s && s.pageImage;
    var hImg = $("s-himg-thumb"), hClear = $("s-himg-clear");
    var pImg = $("s-pimg-thumb"), pClear = $("s-pimg-clear");
    if (h) { hImg.src = h; hImg.hidden = false; hClear.hidden = false; }
    else { hImg.removeAttribute("src"); hImg.hidden = true; hClear.hidden = true; }
    if (p) { pImg.src = p; pImg.hidden = false; pClear.hidden = false; }
    else { pImg.removeAttribute("src"); pImg.hidden = true; pClear.hidden = true; }
  }

  /* 上传背景图（标题/页面共用） */
  function uploadBgImage(which, file) {
    if (!file) return;
    status("正在处理背景图，请稍候…");
    processImageFile(file).then(function (res) {
      editorData.site = editorData.site || {};
      editorData.site[which] = res.data;
      renderBgThumbs(editorData.site);
      onEdit();
      status("✅ 背景图已设置，记得「💾 导出 / 保存」");
    }).catch(function () {
      status("❌ 背景图处理失败，请换一张", true);
    });
  }

  function clearBgImage(which) {
    editorData.site = editorData.site || {};
    editorData.site[which] = "";
    renderBgThumbs(editorData.site);
    onEdit();
    status("已移除背景图");
  }

  /* 小人图片 */
  function renderMascotThumb(src) {
    var img = $("s-mascot-thumb"), clear = $("s-mascot-img-clear");
    if (src) { img.src = src; img.hidden = false; clear.hidden = false; }
    else { img.removeAttribute("src"); img.hidden = true; clear.hidden = true; }
  }

  function uploadMascotImage(file) {
    if (!file) return;
    status("正在处理小人图片，请稍候…");
    processImageFile(file).then(function (res) {
      editorData.site = editorData.site || {};
      editorData.site.mascot = editorData.site.mascot || {};
      editorData.site.mascot.image = res.data;
      renderMascotThumb(res.data);
      onEdit();
      status("✅ 小人图片已设置，记得「💾 导出 / 保存」");
    }).catch(function () {
      status("❌ 小人图片处理失败，请换一张", true);
    });
  }

  function clearMascotImage() {
    editorData.site = editorData.site || {};
    editorData.site.mascot = editorData.site.mascot || {};
    editorData.site.mascot.image = "";
    renderMascotThumb("");
    onEdit();
    status("已移除小人图片");
  }

  /* 剑图片 */
  function renderSwordThumb(src) {
    var img = $("s-sword-thumb"), clear = $("s-sword-img-clear");
    if (src) { img.src = src; img.hidden = false; clear.hidden = false; }
    else { img.removeAttribute("src"); img.hidden = true; clear.hidden = true; }
  }

  function uploadSwordImage(file) {
    if (!file) return;
    status("正在处理剑图片，请稍候…");
    processImageFile(file).then(function (res) {
      editorData.site = editorData.site || {};
      editorData.site.mascot = editorData.site.mascot || {};
      editorData.site.mascot.swordImage = res.data;
      renderSwordThumb(res.data);
      onEdit();
      status("✅ 剑图片已设置，记得「💾 导出 / 保存」");
    }).catch(function () {
      status("❌ 剑图片处理失败，请换一张", true);
    });
  }

  function clearSwordImage() {
    editorData.site = editorData.site || {};
    editorData.site.mascot = editorData.site.mascot || {};
    editorData.site.mascot.swordImage = "";
    renderSwordThumb("");
    onEdit();
    status("已移除剑图片");
  }

  /* ================= 预览 ================= */
  function refreshPreview() {
    var frame = $("preview-frame");
    try {
      if (!frame.contentWindow || !frame.contentWindow.renderAnruiSite) return;
      frame.contentWindow.renderAnruiSite(deepClone(editorData));
    } catch (e) { /* 跨域或未加载完成时忽略 */ }
  }

  /* ================= 导入 ================= */
  function parseDataText(text) {
    text = text.trim();
    if (text.charAt(0) === "{") {
      return JSON.parse(text);
    }
    // data.js 格式：window.ANRUI_DATA = { ... };
    var start = text.indexOf("{");
    var end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("无法识别文件内容");
    }
    return JSON.parse(text.slice(start, end + 1));
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var obj = parseDataText(e.target.result);
        if (!obj || !obj.site) throw new Error("缺少 site 站点配置");
        editorData = deepClone(obj);
        currentId = null;
        loadSiteForm();
        $("form-site").hidden = true;
        $("form-resource").hidden = false;
        fillTypeSelect();
        renderList();
        refreshPreview();
        onEdit();
        status("✅ 导入成功：共 " + ((obj.resources || []).length) + " 个资源");
      } catch (err) {
        status("❌ 导入失败：" + err.message, true);
      }
    };
    reader.readAsText(file);
  }

  /* ================= 默认导出目录（IndexedDB 记忆） ================= */
  var DB_NAME = "anrui-editor";
  var DB_STORE = "kv";
  var DIR_KEY = "defaultExportDir";
  var defaultDirHandle = null;
  var defaultDirName = "";

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(DB_STORE)) {
          req.result.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(DB_STORE, "readonly");
          var get = tx.objectStore(DB_STORE).get(key);
          get.onsuccess = function () { resolve(get.result); };
          get.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }

  function idbSet(key, val) {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(DB_STORE, "readwrite");
          tx.objectStore(DB_STORE).put(val, key);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    });
  }

  /* 启动时读取记忆的导出目录 */
  function loadDefaultDir() {
    return idbGet(DIR_KEY).then(function (rec) {
      if (rec && rec.handle) {
        defaultDirHandle = rec.handle;
        defaultDirName = rec.name || "";
      }
    });
  }

  /* 让用户选择一次默认导出目录（推荐选 data 文件夹） */
  function chooseDefaultDir() {
    if (!window.showDirectoryPicker) {
      status("当前浏览器不支持选择目录，导出时将使用浏览器默认位置", true);
      return Promise.resolve(false);
    }
    return window.showDirectoryPicker({ id: "anrui-export", mode: "readwrite" })
      .then(function (h) {
        defaultDirHandle = h;
        defaultDirName = h.name || "";
        return idbSet(DIR_KEY, { handle: h, name: h.name });
      })
      .then(function () {
        status("✅ 已记住导出目录：「" + (defaultDirName || "该文件夹") + "」，下次导出自动默认指向这里");
        return true;
      })
      .catch(function (e) {
        if (e && e.name === "AbortError") return false;
        status("选择目录失败：" + (e && e.message ? e.message : "未知错误"), true);
        return false;
      });
  }

  /* ================= 导出 ================= */
  function buildDataJs() {
    var json = JSON.stringify(editorData, null, 2);
    return "/* ============================================================\n"
      + " * 安瑞的世界 · 数据文件（由内容编辑程序生成）\n"
      + " * 替换网站 data/data.js 并重新发布即可更新内容\n"
      + " * ============================================================ */\n"
      + "window.ANRUI_DATA = " + json + ";\n";
  }

  function pickerOptions() {
    return {
      suggestedName: "data.js",
      types: [{ description: "数据文件", accept: { "text/javascript": [".js"] } }]
    };
  }

  async function tryAutoDeploy() {
    try {
      var r = await fetch("http://localhost:8765/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time: Date.now() })
      });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok && j.ok) {
        status("🚀 已保存并触发自动部署，约 1~2 分钟后 https://anrrysworld.xyz 生效");
      } else {
        status("⚠️ 已保存，但自动部署失败：" + (j.message || r.statusText), true);
      }
    } catch (e) {
      status("✅ 已保存。如需自动部署，请先运行 start-auto-deploy.bat");
    }
  }

  async function exportFile() {
    var content = buildDataJs();
    if (window.showSaveFilePicker) {
      // 优先用记忆的导出目录作为默认位置
      if (defaultDirHandle) {
        try {
          var opt1 = pickerOptions();
          opt1.startIn = defaultDirHandle;
          var h1 = await window.showSaveFilePicker(opt1);
          var w1 = await h1.createWritable();
          await w1.write(content);
          await w1.close();
          status("✅ 已保存到「" + (defaultDirName || "默认目录") + "」/ " + h1.name);
          await tryAutoDeploy();
          return;
        } catch (err) {
          if (err && err.name === "AbortError") { status("已取消保存"); return; }
          // 记忆的目录可能已失效 → 去掉 startIn 再试一次
        }
      }
      try {
        var handle = await window.showSaveFilePicker(pickerOptions());
        var writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        status("✅ 已保存到：" + handle.name);
        await tryAutoDeploy();
        return;
      } catch (err) {
        if (err && err.name === "AbortError") { status("已取消保存"); return; }
        // 其他错误降级为下载
      }
    }
    // 降级：直接下载
    var blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "data.js";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 300);
    status("✅ 已导出 data.js（请把它替换到网站的 data 目录）");
  }

  function exportJson() {
    var content = JSON.stringify(editorData, null, 2);
    var blob = new Blob([content], { type: "application/json;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "data.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 300);
    status("✅ 已导出 data.json 备份（可用「📂 导入」读回）");
  }

  /* ================= 资源增删 / 排序 ================= */
  function addResource() {
    var defaultType = (editorData.categories || ["MOD"])[0];
    var r = {
      id: uid(),
      title: "新的资源",
      type: defaultType,
      version: "",
      author: "安瑞",
      date: new Date().toISOString().slice(0, 10),
      icon: getDefaultIcon(defaultType) || "🧩",
      featured: false,
      description: "",
      links: [{ name: "夸克网盘", url: "", code: "", note: "" }]
    };
    if (!editorData.resources) editorData.resources = [];
    editorData.resources.unshift(r);
    currentId = r.id;
    renderList();
    loadResourceForm(r);
    onEdit();
    status("已新增资源，填写内容后记得导出保存");
  }

  function deleteResource() {
    if (!currentId) return;
    if (!window.confirm("确定删除该资源？此操作不可撤销。")) return;
    editorData.resources = (editorData.resources || []).filter(function (r) { return r.id !== currentId; });
    currentId = null;
    renderList();
    $("form-title").textContent = "编辑资源";
    $("f-title").value = $("f-desc").value = $("f-version").value =
      $("f-author").value = $("f-icon").value = $("f-date").value = "";
    $("f-featured").checked = false;
    renderIconList();
    $("link-list").innerHTML = "";
    $("img-list").innerHTML = "";
    onEdit();
    status("已删除资源");
  }

  function moveResource(dir) {
    var list = editorData.resources || [];
    var idx = list.findIndex(function (r) { return r.id === currentId; });
    if (idx === -1) return;
    var target = idx + dir;
    if (target < 0 || target >= list.length) return;
    var tmp = list[idx];
    list[idx] = list[target];
    list[target] = tmp;
    renderList();
    onEdit();
  }

  /* 列表拖拽排序 */
  var dragId = null;
  function initDragSort() {
    var listEl = $("res-list");
    listEl.addEventListener("dragstart", function (e) {
      var item = e.target.closest(".res-item");
      if (!item) return;
      dragId = item.dataset.id;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", dragId); } catch (err) { /* 忽略 */ }
      window.__suppressClick = true;
    });
    listEl.addEventListener("dragover", function (e) {
      if (!dragId) return;
      e.preventDefault();
      var item = e.target.closest(".res-item");
      if (!item || item.dataset.id === dragId) return;
      e.dataTransfer.dropEffect = "move";
      listEl.querySelectorAll(".res-item.drop-target").forEach(function (n) { n.classList.remove("drop-target"); });
      item.classList.add("drop-target");
    });
    listEl.addEventListener("drop", function (e) {
      e.preventDefault();
      listEl.querySelectorAll(".res-item").forEach(function (n) { n.classList.remove("dragging", "drop-target"); });
      var target = e.target.closest(".res-item");
      if (!target || !dragId || target.dataset.id === dragId) { dragId = null; return; }
      var arr = editorData.resources || [];
      var from = arr.findIndex(function (r) { return r.id === dragId; });
      var to = arr.findIndex(function (r) { return r.id === target.dataset.id; });
      if (from === -1 || to === -1) { dragId = null; return; }
      var moved = arr.splice(from, 1)[0];
      arr.splice(to, 0, moved);
      dragId = null;
      renderList();
      onEdit();
      status("已调整排序，记得「💾 导出 / 保存」");
    });
    listEl.addEventListener("dragend", function () {
      listEl.querySelectorAll(".res-item").forEach(function (n) { n.classList.remove("dragging", "drop-target"); });
      dragId = null;
      setTimeout(function () { window.__suppressClick = false; }, 0);
    });
  }

  /* ================= 表单事件（收集当前编辑中的资源） ================= */
  function bindResourceForm() {
    var fields = ["f-title", "f-icon", "f-version", "f-author", "f-date", "f-desc"];
    fields.forEach(function (id) {
      $(id).addEventListener("input", function () {
        var r = findResource(currentId);
        if (!r) return;
        r.title = $("f-title").value;
        r.icon = $("f-icon").value;
        r.version = $("f-version").value;
        r.author = $("f-author").value;
        r.date = $("f-date").value;
        r.description = $("f-desc").value;
        if (id === "f-icon") renderIconList();
        $("form-title").textContent = r.title ? "编辑资源：" + r.title : "编辑资源";
        renderList();
        onEdit();
      });
    });

    // 分类切换：自动匹配默认图标（仅当当前图标为空或为某个分类默认值时才覆盖）
    $("f-type").addEventListener("change", function () {
      var r = findResource(currentId);
      if (!r) return;
      var newType = $("f-type").value;
      r.type = newType;
      var mapped = getDefaultIcon(newType);
      if (mapped) {
        var cur = $("f-icon").value;
        var knownIcons = Object.keys(DEFAULT_ICONS).map(function (k) { return DEFAULT_ICONS[k]; });
        if (!cur || knownIcons.indexOf(cur) !== -1) {
          $("f-icon").value = mapped;
          r.icon = mapped;
          renderIconList();
        }
      }
      $("form-title").textContent = r.title ? "编辑资源：" + r.title : "编辑资源";
      renderList();
      onEdit();
    });

    // 图标列表点击：选中预设 emoji
    var iconBox = document.getElementById("f-icon-list");
    if (iconBox) {
      iconBox.addEventListener("click", function (e) {
        var btn = e.target.closest(".icon-opt");
        if (!btn) return;
        var r = findResource(currentId);
        if (!r) return;
        var emoji = btn.getAttribute("data-icon");
        $("f-icon").value = emoji;
        r.icon = emoji;
        renderIconList();
        $("form-title").textContent = r.title ? "编辑资源：" + r.title : "编辑资源";
        renderList();
        onEdit();
      });
    }

    $("f-featured").addEventListener("change", function () {
      var r = findResource(currentId);
      if (!r) return;
      r.featured = $("f-featured").checked;
      renderList();
      onEdit();
    });

    // 链接编辑（事件委托）
    $("link-list").addEventListener("input", function (e) {
      var input = e.target;
      if (!input.dataset || input.dataset.i === undefined) return;
      var r = findResource(currentId);
      if (!r || !r.links) return;
      var i = +input.dataset.i;
      var l = r.links[i];
      if (!l) return;
      if (input.classList.contains("lk-name")) l.name = input.value;
      if (input.classList.contains("lk-url")) l.url = input.value;
      if (input.classList.contains("lk-code")) l.code = input.value;
      if (input.classList.contains("lk-note")) l.note = input.value;
      onEdit();
    });

    $("link-list").addEventListener("click", function (e) {
      if (!e.target.classList || !e.target.classList.contains("link-del")) return;
      var r = findResource(currentId);
      if (!r || !r.links) return;
      r.links.splice(+e.target.dataset.i, 1);
      renderLinks(r);
      onEdit();
    });

    // 图片上传与操作
    $("add-img-btn").addEventListener("click", function () { $("img-file").click(); });
    $("clear-img-btn").addEventListener("click", clearImages);
    $("img-file").addEventListener("change", function (e) {
      if (e.target.files && e.target.files.length) uploadImages(e.target.files);
      e.target.value = "";
    });
    $("img-list").addEventListener("click", function (e) {
      var t = e.target;
      if (!t.classList) return;
      if (t.classList.contains("link-del")) return;
      if (t.dataset.imgdel !== undefined) deleteImage(+t.dataset.imgdel);
      if (t.dataset.imgcover !== undefined) setCover(+t.dataset.imgcover);
    });
  }

  /* ================= 站点设置事件 ================= */
  function bindSiteForm() {
    var ids = ["s-name", "s-slogan", "s-desc", "s-ann", "s-footer", "s-cats", "s-hcolor", "s-pcolor",
      "s-mascot-initial", "s-mascot-ouch", "s-mascot-tips", "s-mascot-reactions"];
    ids.forEach(function (id) {
      $(id).addEventListener("input", saveSiteForm);
    });

    // 小人启用/概率
    $("s-mascot-enabled").addEventListener("change", saveSiteForm);
    $("s-mascot-model").addEventListener("change", saveSiteForm);
    $("s-mascot-chance").addEventListener("input", function () {
      $("s-mascot-chance-val").textContent = $("s-mascot-chance").value + "%";
      saveSiteForm();
    });

    // 小人/剑 位置与大小 滑块（实时预览）
    var mascotRanges = [
      ["s-mascot-figscale", "×"], ["s-mascot-figx", ""], ["s-mascot-figy", ""],
      ["s-mascot-figrot", "°"], ["s-mascot-swordscale", "×"], ["s-mascot-swordx", ""],
      ["s-mascot-swordy", ""], ["s-mascot-swordangle", "°"]
    ];
    mascotRanges.forEach(function (pair) {
      var id = pair[0], suffix = pair[1];
      $(id).addEventListener("input", function () {
        var tip = $(id + "-val");
        if (tip) tip.textContent = $(id).value + suffix;
        saveSiteForm();
      });
    });

    // 小人图片
    $("s-mascot-img-btn").addEventListener("click", function () { $("s-mascot-img-file").click(); });
    $("s-mascot-img-file").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) uploadMascotImage(e.target.files[0]);
      e.target.value = "";
    });
    $("s-mascot-img-clear").addEventListener("click", clearMascotImage);

    // 剑图片
    $("s-sword-img-btn").addEventListener("click", function () { $("s-sword-img-file").click(); });
    $("s-sword-img-file").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) uploadSwordImage(e.target.files[0]);
      e.target.value = "";
    });
    $("s-sword-img-clear").addEventListener("click", clearSwordImage);

    // 标题背景图
    $("s-himg-btn").addEventListener("click", function () { $("s-himg-file").click(); });
    $("s-himg-file").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) uploadBgImage("headerImage", e.target.files[0]);
      e.target.value = "";
    });
    $("s-himg-clear").addEventListener("click", function () { clearBgImage("headerImage"); });

    // 页面背景图
    $("s-pimg-btn").addEventListener("click", function () { $("s-pimg-file").click(); });
    $("s-pimg-file").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) uploadBgImage("pageImage", e.target.files[0]);
      e.target.value = "";
    });
    $("s-pimg-clear").addEventListener("click", function () { clearBgImage("pageImage"); });

    // 恢复默认颜色
    $("s-hcolor-reset").addEventListener("click", function () {
      $("s-hcolor").value = "#6ab04c";
      saveSiteForm();
    });
    $("s-pcolor-reset").addEventListener("click", function () {
      $("s-pcolor").value = "#f4f9ef";
      saveSiteForm();
    });
  }

  /* ================= 顶层事件 ================= */
  function bindGlobal() {
    // 列表选择（拖拽排序时不触发点击）
    $("res-list").addEventListener("click", function (e) {
      if (window.__suppressClick) return;
      var item = e.target.closest(".res-item");
      if (item) selectResource(item.dataset.id);
    });
    initDragSort();
    $("side-search").addEventListener("input", renderList);

    // 工具栏
    $("add-btn").addEventListener("click", addResource);
    $("del-btn").addEventListener("click", deleteResource);
    $("move-up-btn").addEventListener("click", function () { moveResource(-1); });
    $("move-down-btn").addEventListener("click", function () { moveResource(1); });
    $("add-link-btn").addEventListener("click", addLink);
    $("export-btn").addEventListener("click", exportFile);
    $("dir-btn").addEventListener("click", chooseDefaultDir);
    $("json-btn").addEventListener("click", exportJson);

    $("import-file").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importFile(e.target.files[0]);
      e.target.value = "";
    });

    // 站点设置面板切换
    $("site-btn").addEventListener("click", function () {
      var sitePanel = $("form-site");
      var resPanel = $("form-resource");
      sitePanel.hidden = !sitePanel.hidden;
      resPanel.hidden = !sitePanel.hidden;
      if (!sitePanel.hidden) loadSiteForm();
      else if (currentId) loadResourceForm(findResource(currentId));
    });

    // 预览开关
    $("preview-toggle").addEventListener("click", function () {
      var wrap = document.querySelector(".preview-wrap");
      wrap.classList.toggle("collapsed");
      this.textContent = wrap.classList.contains("collapsed") ? "展开" : "收起";
    });

    // 帮助弹窗
    $("help-btn").addEventListener("click", function () { $("help-modal").hidden = false; });
    document.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", function () { $(btn.dataset.close).hidden = true; });
    });
    $("help-modal").addEventListener("click", function (e) {
      if (e.target === this) this.hidden = true;
    });

    // 草稿恢复
    $("draft-btn").addEventListener("click", function () {
      try {
        var raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) { status("没有找到草稿"); return; }
        var draft = JSON.parse(raw);
        if (!draft.data || !draft.data.site) { status("草稿数据无效", true); return; }
        if (!window.confirm("确定用草稿覆盖当前内容吗？（草稿时间：" + new Date(draft.time).toLocaleString() + "）")) return;
        editorData = deepClone(draft.data);
        currentId = null;
        renderList();
        loadSiteForm();
        fillTypeSelect();
        refreshPreview();
        status("✅ 已恢复草稿");
      } catch (err) {
        status("草稿恢复失败：" + err.message, true);
      }
    });

    // 预览 iframe 加载完成后再刷新
    $("preview-frame").addEventListener("load", function () {
      previewReady = true;
      refreshPreview();
    });

    // 关闭页面前自动保存
    window.addEventListener("beforeunload", saveDraft);
  }

  /* ================= 启动 ================= */
  function init() {
    renderList();
    fillTypeSelect();
    loadSiteForm();
    bindResourceForm();
    bindSiteForm();
    bindGlobal();
    loadDefaultDir();
    if (editorData.resources && editorData.resources.length) {
      selectResource(editorData.resources[0].id);
    }
  }

  // 先验证口令，成功后才初始化编辑器
  initLogin();
})();
