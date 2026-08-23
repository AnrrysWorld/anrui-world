/* ============================================================
 * 安瑞的世界 · 前端渲染逻辑
 * 数据来源：data/data.js 中的 window.ANRUI_DATA
 * 暴露 window.renderAnruiSite(data) 供编辑器实时刷新预览
 * 功能：站点信息 / 分类筛选 / 搜索 / 资源卡片（封面图+灯箱）
 * ============================================================ */
(function () {
  "use strict";

  var currentData = window.ANRUI_DATA;
  var PAGE_SIZE = 3;       // 每页显示资源数
  var state = { category: "全部", keyword: "", page: 1 };
  var eventsBound = false;
  var lastRendered = [];   // 最近一次渲染的（当前页）资源数组
  var lightbox = { images: [], index: 0, open: false };
  var mascotState = { hitting: false, hitCount: 0, timer: null };

  /* ---------- 工具函数 ---------- */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* 颜色加深/变浅（percent 负数=加深） */
  function shade(hex, percent) {
    var c = String(hex || "").replace("#", "");
    if (c.length !== 6) return hex || "#6ab04c";
    var n = parseInt(c, 16);
    var r = Math.max(0, Math.min(255, ((n >> 16) & 255) + percent));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + percent));
    var b = Math.max(0, Math.min(255, (n & 255) + percent));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function typeClass(type) {
    var map = {
      "MOD": "t-datapack",
      "数据包": "t-datapack",
      "整合包": "t-pack",
      "光影": "t-shader",
      "服务器插件": "t-plugin",
      "地图存档": "t-map"
    };
    return map[type] || "t-other";
  }

  /* ---------- 渲染站点信息 ---------- */
  function renderSite() {
    var site = currentData.site || {};
    var el;
    if ((el = document.getElementById("site-name"))) el.textContent = site.name || "安瑞的世界";
    document.title = (site.name || "安瑞的世界") + " · 我的世界资源分享站";
    if ((el = document.getElementById("site-slogan"))) el.textContent = site.slogan || "";
    if ((el = document.getElementById("site-description"))) el.textContent = site.description || "";
    if ((el = document.getElementById("site-stats"))) {
      el.innerHTML = '<span class="stat-pill">🧩 资源 ' + (currentData.resources || []).length + ' 个</span>'
        + '<span class="stat-pill">🗂️ 分类 ' + (currentData.categories || []).length + ' 种</span>'
        + '<span class="stat-pill">💚 全部免费下载</span>';
    }
    if ((el = document.getElementById("site-announcement"))) {
      if (site.announcement) {
        el.style.display = "";
        el.innerHTML = escapeHtml(site.announcement);
      } else {
        el.style.display = "none";
      }
    }
    if ((el = document.getElementById("site-footer"))) el.textContent = site.footer || "";

    /* 标题背景（横幅） */
    var headerEl = document.querySelector(".site-header");
    if (headerEl) {
      var hImg = site.headerImage;
      var hCol = site.headerColor;
      if (hImg) {
        headerEl.style.backgroundImage = "linear-gradient(180deg, rgba(20,40,15,0.42), rgba(20,40,15,0.1) 60%, rgba(20,40,15,0.34)), url(\"" + hImg + "\")";
        headerEl.style.backgroundSize = "cover";
        headerEl.style.backgroundPosition = "center";
        headerEl.style.backgroundRepeat = "no-repeat";
      } else {
        var col = hCol || "#6ab04c";
        headerEl.style.backgroundImage = "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0)), linear-gradient(135deg, "
          + col + " 0%, " + shade(col, -30) + " 55%, " + shade(col, -60) + " 100%)";
        headerEl.style.backgroundSize = "";
        headerEl.style.backgroundPosition = "";
        headerEl.style.backgroundRepeat = "";
      }
    }

    /* 页面整体背景 */
    var pImg = site.pageImage;
    var pCol = site.pageColor;
    if (pImg) {
      document.body.style.background = "";
      document.body.style.backgroundImage = "linear-gradient(rgba(244,249,239,0.93), rgba(244,249,239,0.93)), url(\"" + pImg + "\")";
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundAttachment = "fixed";
      document.body.style.backgroundPosition = "center";
    } else {
      document.body.style.background = pCol || "var(--bg)";
      document.body.style.backgroundImage = "none";
      document.body.style.backgroundAttachment = "";
    }

    renderMascot();
  }

  /* ---------- 左侧 MC 互动小人 ---------- */
  function renderMascot() {
    var site = currentData.site || {};
    var cfg = site.mascot || {};
    var wrap = document.getElementById("mascot-wrap");
    if (!wrap) return;
    if (!cfg.enabled || !cfg.image) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    var fig = document.getElementById("mascot-3d");
    if (fig) {
      var su = 3; // 每个皮肤像素对应的显示像素
      buildMascotFigure(fig, cfg.image, su, cfg.model || "alex");
    }

    var sword = document.getElementById("mascot-sword");
    if (sword) {
      sword.style.backgroundImage = 'url("' + (cfg.swordImage || "") + '")';
    }

    // 位置/大小变量统一设在 wrap 上，气泡、3D 小人、剑都能继承使用
    if (wrap) {
      wrap.style.setProperty("--fig-scale", num(cfg.figScale, 1.15));
      wrap.style.setProperty("--fig-x", num(cfg.figX, 0) + "px");
      wrap.style.setProperty("--fig-y", num(cfg.figY, 0) + "px");
      wrap.style.setProperty("--fig-rot", num(cfg.figRot, -18) + "deg");
      wrap.style.setProperty("--sword-scale", num(cfg.swordScale, 1));
      wrap.style.setProperty("--sword-x", num(cfg.swordX, 0) + "px");
      wrap.style.setProperty("--sword-y", num(cfg.swordY, -6) + "px");
      wrap.style.setProperty("--sword-angle", num(cfg.swordAngle, -12) + "deg");
    }

    showMascotText(cfg.initialText || "我什么都不会告诉你的", true);
  }

  function num(v, d) {
    return (typeof v === "number" && isFinite(v)) ? v : d;
  }

  /* 用标准 64x64 皮肤坐标构建 3D 方块人（含外层皮肤 overlay）
     model: "steve"(4px 粗臂) 或 "alex"(3px 细臂) */
  function buildMascotFigure(container, skinUrl, su, model) {
    container.innerHTML = "";
    var skin = 'url("' + skinUrl + '")';
    var bg = (64 * su) + "px " + (64 * su) + "px";
    var slim = model === "alex";
    var armW = slim ? 3 : 4;

    // 标准 Steve 64x64 皮肤坐标 [x,y,w,h]
    var uv = {
      headMain: { top:[8,0,8,8], bottom:[16,0,8,8], right:[0,8,8,8], front:[8,8,8,8], left:[16,8,8,8], back:[24,8,8,8] },
      headOverlay: { top:[40,0,8,8], bottom:[48,0,8,8], right:[32,8,8,8], front:[40,8,8,8], left:[48,8,8,8], back:[56,8,8,8] },
      bodyMain: { top:[20,16,8,4], bottom:[28,16,8,4], right:[16,20,4,12], front:[20,20,8,12], left:[28,20,4,12], back:[32,20,8,12] },
      bodyOverlay: { top:[20,32,8,4], bottom:[28,32,8,4], right:[16,36,4,12], front:[20,36,8,12], left:[28,36,4,12], back:[32,36,8,12] },
      rArmMain: { top:[44,16,4,4], bottom:[48,16,4,4], right:[40,20,4,12], front:[44,20,4,12], left:[48,20,4,12], back:[52,20,4,12] },
      rArmOverlay: { top:[44,32,4,4], bottom:[48,32,4,4], right:[40,36,4,12], front:[44,36,4,12], left:[48,36,4,12], back:[52,36,4,12] },
      lArmMain: { top:[36,48,4,4], bottom:[40,48,4,4], right:[32,52,4,12], front:[36,52,4,12], left:[40,52,4,12], back:[44,52,4,12] },
      lArmOverlay: { top:[52,48,4,4], bottom:[56,48,4,4], right:[48,52,4,12], front:[52,52,4,12], left:[56,52,4,12], back:[60,52,4,12] },
      rLegMain: { top:[4,16,4,4], bottom:[8,16,4,4], right:[0,20,4,12], front:[4,20,4,12], left:[8,20,4,12], back:[12,20,4,12] },
      rLegOverlay: { top:[4,32,4,4], bottom:[8,32,4,4], right:[0,36,4,12], front:[4,36,4,12], left:[8,36,4,12], back:[12,36,4,12] },
      lLegMain: { top:[20,48,4,4], bottom:[24,48,4,4], right:[16,52,4,12], front:[20,52,4,12], left:[24,52,4,12], back:[28,52,4,12] },
      lLegOverlay: { top:[4,48,4,4], bottom:[8,48,4,4], right:[0,52,4,12], front:[4,52,4,12], left:[8,52,4,12], back:[12,52,4,12] }
    };

    // Alex 细臂时，把手臂正面/背面宽度改成 3px，侧面深度保持 4px；
    // 这里用 Steve 皮肤坐标但 face 宽度为 3，CSS 会居中裁切（由 makeFace 处理）
    var parts = [
      { cx:0, cy:4, cz:0, w:8, h:8, d:8, main:uv.headMain, ovl:uv.headOverlay },
      { cx:0, cy:14, cz:0, w:8, h:12, d:4, main:uv.bodyMain, ovl:uv.bodyOverlay },
      // 手臂紧贴身体两侧（身体半宽 4 + 手臂半宽 armW/2），不再压在身体里
      { cx:-(4+armW/2), cy:14, cz:0, w:armW, h:12, d:4, main:uv.rArmMain, ovl:uv.rArmOverlay },
      { cx:(4+armW/2), cy:14, cz:0, w:armW, h:12, d:4, main:uv.lArmMain, ovl:uv.lArmOverlay },
      { cx:-2, cy:26, cz:0, w:4, h:12, d:4, main:uv.rLegMain, ovl:uv.rLegOverlay },
      { cx:2, cy:26, cz:0, w:4, h:12, d:4, main:uv.lLegMain, ovl:uv.lLegOverlay }
    ];

    parts.forEach(function (p) {
      container.appendChild(makeMascotBox(skin, bg, p, su, false, slim));
      container.appendChild(makeMascotBox(skin, bg, p, su, true, slim));
    });
  }

  function makeMascotBox(skin, bg, p, su, overlay, slim) {
    var box = document.createElement("div");
    var isHead = p.w === 8 && p.h === 8 && p.d === 8;
    var armClass = "";
    if (p.h === 12 && p.cy === 14) {
      if (p.cx < 0) armClass = " mc-arm-r";
      else if (p.cx > 0) armClass = " mc-arm-l";
    }
    box.className = "mc-box" + (overlay ? " mc-overlay" : "") + armClass;
    var tx = p.cx * su;
    var ty = (p.cy - 16) * su;
    var tz = p.cz * su;
    box.style.transform = "translate3d(" + tx + "px," + ty + "px," + tz + "px)"
      + (overlay ? " scale3d(1.08,1.08,1.08)" : "");
    var reg = overlay ? p.ovl : p.main;
    var hw = (p.w / 2) * su, hh = (p.h / 2) * su, hd = (p.d / 2) * su;

    var shake = document.createElement("div");
    shake.className = "mc-shake";
    // 旋转轴设在「肩部」（手臂顶端，即本地 y = -hh 处），让手臂绕肩上下摆
    shake.style.transformOrigin = "center " + (-hh) + "px";
    box.appendChild(shake);

    function makeFace(name, u, fw, fh, rot, dist) {
      var div = document.createElement("div");
      div.className = "mc-face mc-" + name;
      div.style.width = (fw * su) + "px";
      div.style.height = (fh * su) + "px";
      div.style.backgroundImage = skin;
      div.style.backgroundSize = bg;
      // Alex 细臂的正面/背面：纹理 4px 宽，脸 3px 宽，向右移动 0.5px 裁出中间 3px
      var offsetX = (slim && (name === "front" || name === "back") && fw === 3 && u[2] === 4) ? 0.5 : 0;
      div.style.backgroundPosition = "calc(" + (-u[0] * su) + "px - " + (offsetX * su) + "px) " + (-u[1] * su) + "px";
      var tf = (name === "front")
        ? "translate(-50%,-50%) translateZ(" + dist + "px)"
        : "translate(-50%,-50%) " + rot + " translateZ(" + dist + "px)";
      div.style.transform = tf;

      // 在头部外层正面加上眨眼层
      if (isHead && overlay && name === "front") {
        var blink = document.createElement("div");
        blink.className = "mc-blink";
        div.appendChild(blink);
      }
      return div;
    }

    shake.appendChild(makeFace("top", reg.top, p.w, p.d, "rotateX(90deg)", hh));
    shake.appendChild(makeFace("bottom", reg.bottom, p.w, p.d, "rotateX(-90deg)", hh));
    shake.appendChild(makeFace("right", reg.right, p.d, p.h, "rotateY(90deg)", hw));
    shake.appendChild(makeFace("left", reg.left, p.d, p.h, "rotateY(-90deg)", hw));
    shake.appendChild(makeFace("front", reg.front, p.w, p.h, "translateZ", hd));
    shake.appendChild(makeFace("back", reg.back, p.w, p.h, "rotateY(180deg)", hd));
    return box;
  }

  function showMascotText(text, autoHide) {
    var bubble = document.getElementById("mascot-bubble");
    var txt = document.getElementById("mascot-text");
    if (!bubble || !txt) return;
    txt.textContent = text;
    bubble.classList.add("show");
    clearTimeout(mascotState.timer);
    if (autoHide) {
      mascotState.timer = setTimeout(function () {
        bubble.classList.remove("show");
      }, 2600);
    }
  }

  function onMascotClick() {
    var site = currentData.site || {};
    var cfg = site.mascot || {};
    if (mascotState.hitting) return;
    mascotState.hitting = true;
    mascotState.hitCount++;
    var wrap = document.getElementById("mascot-wrap");
    if (wrap) wrap.classList.add("hit");

    showMascotText(cfg.ouchText || "哎哟", false);

    setTimeout(function () {
      if (wrap) wrap.classList.remove("hit");
      mascotState.hitting = false;
      var tips = cfg.tips || [];
      var reactions = cfg.reactions || [];
      var chance = typeof cfg.reactionChance === "number" ? cfg.reactionChance : 0.35;
      var useReaction = Math.random() < chance && reactions.length > 0;
      var pool = useReaction ? reactions : tips;
      var fallback = useReaction ? tips : reactions;
      var text = "";
      if (pool.length) {
        text = pool[Math.floor(Math.random() * pool.length)];
      } else if (fallback.length) {
        text = fallback[Math.floor(Math.random() * fallback.length)];
      }
      if (text) showMascotText(text, true);
    }, 420);
  }

  /* ---------- 渲染筛选标签 ---------- */
  function renderFilters() {
    var container = document.getElementById("filter-tabs");
    if (!container) return;
    var cats = ["全部"].concat(currentData.categories || []);
    if (cats.indexOf(state.category) === -1) state.category = "全部";
    var html = "";
    cats.forEach(function (cat) {
      var count = cat === "全部" ? (currentData.resources || []).length
        : (currentData.resources || []).filter(function (r) { return r.type === cat; }).length;
      var active = state.category === cat ? " active" : "";
      html += '<button class="filter-tab' + active + '" data-cat="' + escapeHtml(cat) + '">'
        + escapeHtml(cat) + '<span class="count">' + count + "</span></button>";
    });
    container.innerHTML = html;
  }

  /* ---------- 渲染单张封面图 ---------- */
  function renderCover(r, idx) {
    var imgs = r.images || [];
    if (!imgs.length) return "";
    var countBadge = imgs.length > 1
      ? '<span class="img-count">' + imgs.length + ' 张</span>' : "";
    return '<div class="card-cover" data-i="' + idx + '" title="点击查看大图">'
      + '<img src="' + escapeHtml(imgs[0]) + '" alt="' + escapeHtml(r.title) + '" loading="lazy" onerror="this.parentNode.style.display=\'none\'">'
      + countBadge + "</div>";
  }

  /* ---------- 渲染资源列表 ---------- */
  function renderList() {
    var listEl = document.getElementById("resource-list");
    var emptyEl = document.getElementById("empty-state");
    if (!listEl) return;
    var resources = (currentData.resources || []).slice();
    var kw = state.keyword.trim().toLowerCase();

    if (state.category !== "全部") {
      resources = resources.filter(function (r) { return r.type === state.category; });
    }
    if (kw) {
      resources = resources.filter(function (r) {
        var hay = [r.title, r.description, r.version, r.author, r.type].join(" ").toLowerCase();
        return hay.indexOf(kw) !== -1;
      });
    }
    resources.sort(function (a, b) {
      if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
      return String(b.date || "").localeCompare(String(a.date || ""));
    });

    // 分页
    var total = resources.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.max(1, Math.min(state.page, totalPages));
    var start = (state.page - 1) * PAGE_SIZE;
    var pageItems = resources.slice(start, start + PAGE_SIZE);
    lastRendered = pageItems;

    if (!total) {
      listEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      renderPagination(0, 0);
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = pageItems.map(function (r, i) {
      var links = (r.links || []).map(function (l) {
        var isDisabled = !l.url;
        var cls = isDisabled ? "link-btn disabled" : "link-btn";
        var url = isDisabled ? "javascript:void(0)" : escapeHtml(l.url);
        var code = l.code ? '<span class="code">提取码 ' + escapeHtml(l.code) + "</span>" : "";
        var note = l.note ? '<span class="note">' + escapeHtml(l.note) + "</span>" : "";
        return '<a class="' + cls + '" href="' + url + '" target="_blank" rel="noopener noreferrer">'
          + "⬇️ " + escapeHtml(l.name) + " " + note + " " + code + "</a>";
      }).join("");

      var meta = [];
      if (r.type) meta.push('<span>🏷️ ' + escapeHtml(r.type) + "</span>");
      if (r.version) meta.push("<span>🧩 " + escapeHtml(r.version) + "</span>");
      if (r.author) meta.push("<span>👤 " + escapeHtml(r.author) + "</span>");
      if (r.date) meta.push("<span>📅 " + escapeHtml(r.date) + "</span>");

      return '<article class="card' + (r.featured ? " featured" : "") + '">'
        + renderCover(r, i)
        + '<div class="card-head">'
        + '<div class="card-icon">' + escapeHtml(r.icon || "🧩") + "</div>"
        + '<div class="card-title-row">'
        + '<div class="card-title">' + escapeHtml(r.title)
        + (r.type ? '<span class="type-badge ' + typeClass(r.type) + '">' + escapeHtml(r.type) + "</span>" : "")
        + "</div>"
        + '<div class="card-meta">' + meta.join("") + "</div>"
        + "</div></div>"
        + (r.description ? '<p class="card-desc">' + escapeHtml(r.description) + "</p>" : "")
        + (links ? '<div class="card-links"><div class="links-label">📥 下载链接</div><div class="links-row">' + links + "</div></div>" : "")
        + "</article>";
    }).join("");

    renderPagination(total, totalPages);
  }

  /* ---------- 分页 ---------- */
  function renderPagination(total, totalPages) {
    var pgEl = document.getElementById("pagination");
    if (!pgEl) return;
    if (totalPages <= 1) {
      pgEl.hidden = true;
      return;
    }
    pgEl.hidden = false;

    var html = '<button class="pg-btn" data-page="prev"' + (state.page === 1 ? " disabled" : "") + ">上一页</button>";
    for (var p = 1; p <= totalPages; p++) {
      html += '<button class="pg-btn' + (p === state.page ? " active" : "") + '" data-page="' + p + '">' + p + "</button>";
    }
    html += '<button class="pg-btn" data-page="next"' + (state.page === totalPages ? " disabled" : "") + ">下一页</button>";
    html += '<span class="pg-info">第 ' + state.page + " / " + totalPages + " 页（共 " + total + " 条）</span>";
    pgEl.innerHTML = html;
  }

  function goPage(p) {
    if (p === "prev") state.page--;
    else if (p === "next") state.page++;
    else state.page = +p;
    renderList();
    var listEl = document.getElementById("resource-list");
    if (listEl) listEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- 灯箱（图片放大查看） ---------- */
  function openLightbox(resIdx) {
    var r = lastRendered[resIdx];
    if (!r || !(r.images || []).length) return;
    lightbox.images = r.images.slice();
    lightbox.index = 0;
    lightbox.open = true;
    renderLightbox();
    $lb("lightbox").hidden = false;
  }

  function renderLightbox() {
    var imgEl = $lb("lb-img");
    imgEl.src = lightbox.images[lightbox.index];
    imgEl.alt = "";
    $lb("lb-count").textContent = (lightbox.index + 1) + " / " + lightbox.images.length;
    $lb("lb-prev").style.visibility = lightbox.images.length > 1 ? "visible" : "hidden";
    $lb("lb-next").style.visibility = lightbox.images.length > 1 ? "visible" : "hidden";
  }

  function lbStep(dir) {
    if (!lightbox.open || !lightbox.images.length) return;
    lightbox.index = (lightbox.index + dir + lightbox.images.length) % lightbox.images.length;
    renderLightbox();
  }

  function closeLightbox() {
    lightbox.open = false;
    $lb("lightbox").hidden = true;
  }

  function $lb(id) { return document.getElementById(id); }

  function buildLightboxDom() {
    var div = document.createElement("div");
    div.id = "lightbox";
    div.className = "lightbox";
    div.hidden = true;
    div.innerHTML =
      '<button class="lb-btn lb-close" id="lb-close" title="关闭 (Esc)">✕</button>'
      + '<button class="lb-btn lb-prev" id="lb-prev" title="上一张 (←)">‹</button>'
      + '<img id="lb-img" alt="资源图片">'
      + '<button class="lb-btn lb-next" id="lb-next" title="下一张 (→)">›</button>'
      + '<div class="lb-count" id="lb-count"></div>';
    document.body.appendChild(div);

    $lb("lb-close").addEventListener("click", closeLightbox);
    $lb("lb-prev").addEventListener("click", function () { lbStep(-1); });
    $lb("lb-next").addEventListener("click", function () { lbStep(1); });
    div.addEventListener("click", function (e) {
      if (e.target === div) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (!lightbox.open) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lbStep(-1);
      if (e.key === "ArrowRight") lbStep(1);
    });
  }

  /* ---------- 事件绑定（只执行一次） ---------- */
  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    var filterTabs = document.getElementById("filter-tabs");
    if (filterTabs) {
      filterTabs.addEventListener("click", function (e) {
        var btn = e.target.closest(".filter-tab");
        if (!btn) return;
        state.category = btn.getAttribute("data-cat");
        state.page = 1;
        filterTabs.querySelectorAll(".filter-tab").forEach(function (t) {
          t.classList.toggle("active", t === btn);
        });
        renderList();
      });
    }

    var searchInput = document.getElementById("search-input");
    if (searchInput) {
      var timer = null;
      searchInput.addEventListener("input", function () {
        clearTimeout(timer);
        var val = searchInput.value;
        timer = setTimeout(function () {
          state.keyword = val;
          state.page = 1;
          renderList();
        }, 200);
      });
    }

    var pgEl = document.getElementById("pagination");
    if (pgEl) {
      pgEl.addEventListener("click", function (e) {
        var btn = e.target.closest(".pg-btn");
        if (!btn || btn.disabled) return;
        goPage(btn.getAttribute("data-page"));
      });
    }

    // 封面图 → 打开灯箱
    var listEl = document.getElementById("resource-list");
    if (listEl) {
      listEl.addEventListener("click", function (e) {
        var cover = e.target.closest(".card-cover");
        if (cover) openLightbox(+cover.dataset.i);
      });
    }

    // MC 小人点击
    var mascotWrap = document.getElementById("mascot-wrap");
    if (mascotWrap) {
      mascotWrap.addEventListener("click", onMascotClick);
    }

    buildLightboxDom();
  }

  /* ---------- 外部可调用：重新渲染 ---------- */
  function renderAnruiSite(newData) {
    if (!newData || !newData.site) return false;
    currentData = newData;
    state.page = 1;
    renderSite();
    renderFilters();
    renderList();
    bindEvents();
    return true;
  }

  window.renderAnruiSite = renderAnruiSite;

  /* ---------- 启动 ---------- */
  function init() {
    if (!currentData || !currentData.site) {
      var listEl = document.getElementById("resource-list");
      if (listEl) {
        listEl.innerHTML =
          '<div class="empty-state"><div class="big">⚠️</div><p>数据文件加载失败，请确认 data/data.js 存在。</p></div>';
      }
      return;
    }
    renderAnruiSite(currentData);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
