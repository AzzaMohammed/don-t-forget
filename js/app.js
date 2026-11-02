/* =========================================================
   Don't Forget — app.js
   UI logic: navigation, rendering, forms, actions.
   Depends on: storage.js (window.Storage) and lucide icons.
   ========================================================= */

(function () {
  'use strict';

  /* ==================== constants ==================== */

  var PAGES = {
    dashboard: { title: 'Dashboard', subtitle: 'Your saved links at a glance' },
    all: { title: 'All Saved', subtitle: 'Search, filter and organize everything you saved' },
    categories: { title: 'Categories', subtitle: 'Group your links the way you think' },
    favorites: { title: 'Favorites', subtitle: 'The links you want close at hand' },
    review: { title: 'To Review', subtitle: 'Items waiting for a second look' },
    archived: { title: 'Archived', subtitle: 'Stored away, but never forgotten' },
    settings: { title: 'Settings', subtitle: 'Appearance and local data' }
  };

  var TYPE_LABELS = {
    website: 'Website',
    video: 'Video',
    article: 'Article',
    other: 'Other Link'
  };

  var TYPE_ICONS = {
    website: 'globe',
    video: 'video',
    article: 'file-text',
    other: 'link'
  };

  var PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High' };

  var SWATCH_COLORS = [
    '#a97c50', '#7d8c6b', '#b4703f', '#8c7ba6',
    '#6b8c9b', '#c2a15e', '#a45f56', '#5f7b8c'
  ];

  var state = {
    page: 'dashboard',
    search: '',
    typeFilter: 'all',
    categoryFilter: 'all',
    view: Storage.getSettings().view === 'list' ? 'list' : 'grid',
    editingId: null,
    editingCategoryId: null,
    randomId: null,
    saving: false,
    pending: {}
  };

  /* ==================== small helpers ==================== */

  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>"']/g, function (c) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[c];
      });
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function dayDiff(dateStr) {
    if (!dateStr) return null;
    var parts = String(dateStr).split('-');
    var target = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000);
  }

  function friendlyDate(dateStr) {
    var diff = dayDiff(dateStr);
    if (diff === null) return '';
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    var parts = String(dateStr).split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  }

  function normalizeUrl(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  function hostOf(url) {
    try {
      var host = new URL(normalizeUrl(url)).hostname;
      return host.replace(/^www\./, '');
    } catch (e) {
      return String(url || '');
    }
  }

  function getCategory(id) { return id ? Storage.getCategory(id) : null; }

  function byNewest(a, b) {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
    }
  }

  /* ==================== toast ==================== */

  var toastTimer = null;

  function toast(message, duration) {
    var el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    // force reflow so the transition plays
    void el.offsetWidth;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () { el.hidden = true; }, 250);
    }, duration || 2400);
  }

  /* ==================== async action helpers ==================== */

  function errorToast(err) {
    var message = (err && err.message) ? err.message : 'Could not save your changes. Please try again.';
    toast(message, 4600);
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      if (!btn.hasAttribute('data-idle-html')) {
        btn.setAttribute('data-idle-html', btn.innerHTML);
      }
      btn.disabled = true;
      btn.textContent = label || 'Saving…';
    } else {
      btn.disabled = false;
      var idle = btn.getAttribute('data-idle-html');
      if (idle !== null) btn.innerHTML = idle;
    }
  }

  /* Prevents duplicate submissions for the same logical action. */
  function runAction(key, button, fn) {
    if (state.pending[key]) return Promise.resolve(false);
    state.pending[key] = true;
    if (button) setBusy(button, true, '…');

    return Promise.resolve()
      .then(fn)
      .catch(function (err) {
        errorToast(err);
        return false;
      })
      .then(function (result) {
        delete state.pending[key];
        if (button) setBusy(button, false);
        refreshIcons();
        return result;
      });
  }

  /* ==================== modals ==================== */

  function openModal(id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    refreshIcons();
  }

  function closeModal(id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = true;
    if (!document.querySelector('.modal-backdrop:not([hidden])')) {
      document.body.classList.remove('modal-open');
    }
  }

  function closeAllModals() {
    Array.prototype.forEach.call(document.querySelectorAll('.modal-backdrop'), function (m) {
      m.hidden = true;
    });
    document.body.classList.remove('modal-open');
  }

  /* ==================== theme ==================== */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    Storage.setSetting('theme', theme);
    var btn = $('#themeBtn');
    if (btn) {
      btn.innerHTML = '<i data-lucide="' + (theme === 'dark' ? 'sun' : 'moon') + '"></i>';
      btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
    refreshIcons();
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
    if (state.page === 'settings') renderSettings();
  }

  /* ==================== navigation ==================== */

  function go(page) {
    if (!PAGES[page]) page = 'dashboard';
    state.page = page;

    // nav highlight
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-nav') === page);
    });

    // page visibility
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (section) {
      var active = section.id === 'page-' + page;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });

    $('#pageTitle').textContent = PAGES[page].title;
    $('#pageSubtitle').textContent = PAGES[page].subtitle;

    document.body.classList.remove('sidebar-open');
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ==================== badges ==================== */

  function renderBadges() {
    var items = Storage.getItems();
    var fav = items.filter(function (i) { return !i.archived && i.favorite; }).length;
    var rev = items.filter(function (i) { return !i.archived && i.reviewDate; }).length;
    var arch = items.filter(function (i) { return i.archived; }).length;

    setBadge('#badgeFavorites', fav);
    setBadge('#badgeReview', rev);
    setBadge('#badgeArchived', arch);
  }

  function setBadge(selector, count) {
    var el = $(selector);
    if (!el) return;
    el.textContent = String(count);
    el.hidden = count === 0;
  }

  /* ==================== shared fragments ==================== */

  function emptyHTML(icon, title, text, actionHTML) {
    return (
      '<div class="empty">' +
        '<span class="empty-icon"><i data-lucide="' + icon + '"></i></span>' +
        '<h3>' + esc(title) + '</h3>' +
        '<p>' + esc(text) + '</p>' +
        (actionHTML || '') +
      '</div>'
    );
  }

  function typeBadge(item) {
    var type = item.type || 'website';
    return (
      '<span class="type-badge type-' + type + '">' +
        '<i data-lucide="' + (TYPE_ICONS[type] || 'link') + '"></i>' +
        esc(TYPE_LABELS[type] || 'Other Link') +
      '</span>'
    );
  }

  function categoryChip(item) {
    var cat = getCategory(item.categoryId);
    if (!cat) return '<span class="cat-chip"><span class="dot"></span>Uncategorized</span>';
    return (
      '<span class="cat-chip"><span class="dot" style="background:' + esc(cat.color) + '"></span>' +
      esc(cat.name) + '</span>'
    );
  }

  function priorityBadge(item) {
    var prio = item.priority || 'normal';
    return (
      '<span class="prio prio-' + prio + '">' +
        '<span class="dot"></span>' + esc(PRIORITY_LABELS[prio] || 'Normal') +
      '</span>'
    );
  }

  function reviewChip(item) {
    if (!item.reviewDate) return '';
    var diff = dayDiff(item.reviewDate);
    var cls = diff < 0 ? 'overdue' : (diff === 0 ? 'today' : '');
    var label = diff < 0
      ? 'Overdue · ' + friendlyDate(item.reviewDate)
      : friendlyDate(item.reviewDate);
    return (
      '<span class="review-chip ' + cls + '">' +
        '<i data-lucide="calendar"></i>' + esc(label) +
      '</span>'
    );
  }

  function tagsHTML(item) {
    if (!item.tags || !item.tags.length) return '';
    var html = '<div class="tags">';
    item.tags.forEach(function (tag) {
      html += '<span class="tag">#' + esc(tag) + '</span>';
    });
    return html + '</div>';
  }

  function iconBtn(action, id, icon, title, extraClass) {
    return (
      '<button type="button" class="icon-btn tiny ' + (extraClass || '') + '" ' +
      'data-action="' + action + '" data-id="' + esc(id) + '" title="' + esc(title) + '" ' +
      'aria-label="' + esc(title) + '"><i data-lucide="' + icon + '"></i></button>'
    );
  }

  /* action buttons per context */
  function actionsHTML(item, mode) {
    var id = esc(item.id);
    var html = '<button type="button" class="btn btn-small btn-primary" data-action="open" data-id="' + id + '">' +
      '<i data-lucide="external-link"></i> Open</button>';

    if (mode === 'all' || mode === 'favorites' || mode === 'recent') {
      html += iconBtn('favorite', id, 'star',
        item.favorite ? 'Remove from favorites' : 'Add to favorites',
        item.favorite ? 'is-on' : '');
      html += iconBtn('edit', id, 'pencil', 'Edit');
    }

    if (mode === 'all' || mode === 'recent') {
      html += iconBtn('archive', id, 'archive', 'Archive');
    }

    if (mode === 'all') {
      html += iconBtn('delete', id, 'trash-2', 'Delete', 'is-danger');
    }

    if (mode === 'review') {
      html += iconBtn('edit', id, 'pencil', 'Edit');
      html += '<button type="button" class="btn btn-small" data-action="reviewed" data-id="' + id + '">' +
        '<i data-lucide="check"></i> Mark reviewed</button>';
    }

    if (mode === 'archived') {
      html += '<button type="button" class="btn btn-small" data-action="restore" data-id="' + id + '">' +
        '<i data-lucide="rotate-ccw"></i> Restore</button>';
      html += iconBtn('delete', id, 'trash-2', 'Delete permanently', 'is-danger');
    }

    return '<div class="item-actions">' + html + '</div>';
  }

  function itemCard(item, mode) {
    return (
      '<article class="item-card">' +
        '<div class="item-top">' +
          typeBadge(item) +
          '<div class="item-top-actions">' +
            (item.favorite ? iconBtn('favorite', item.id, 'star', 'Remove from favorites', 'is-on') : '') +
          '</div>' +
        '</div>' +
        '<h3 class="item-title"><a href="' + esc(normalizeUrl(item.url)) + '" target="_blank" rel="noopener noreferrer">' +
          esc(item.title) + '</a></h3>' +
        '<p class="item-url">' + esc(hostOf(item.url)) + '</p>' +
        (item.description ? '<p class="item-desc">' + esc(item.description) + '</p>' : '') +
        '<div class="item-meta">' + categoryChip(item) + priorityBadge(item) + '</div>' +
        tagsHTML(item) +
        '<div class="item-foot">' +
          (reviewChip(item) || '<span class="review-chip"><i data-lucide="clock"></i>Added ' +
            friendlyDate((item.createdAt || '').slice(0, 10)) + '</span>') +
          actionsHTML(item, mode) +
        '</div>' +
      '</article>'
    );
  }

  function itemRow(item, mode) {
    return (
      '<div class="item-row">' +
        '<span class="row-icon"><i data-lucide="' + (TYPE_ICONS[item.type || 'website'] || 'link') + '"></i></span>' +
        '<div class="row-main">' +
          '<a class="row-title" href="' + esc(normalizeUrl(item.url)) + '" target="_blank" rel="noopener noreferrer">' +
            esc(item.title) + '</a>' +
          '<div class="row-sub">' +
            '<span>' + esc(hostOf(item.url)) + '</span>' +
            categoryChip(item) +
            priorityBadge(item) +
          '</div>' +
        '</div>' +
        (item.reviewDate
          ? '<span class="row-date ' + (dayDiff(item.reviewDate) < 0 ? 'overdue' : '') + '">' +
              esc(friendlyDate(item.reviewDate)) + '</span>'
          : '') +
        actionsHTML(item, mode) +
      '</div>'
    );
  }

  function itemsHTML(list, mode) {
    if (!list.length) return '';
    if (state.view === 'list') {
      return '<div class="rows">' + list.map(function (i) { return itemRow(i, mode); }).join('') + '</div>';
    }
    return '<div class="cards-grid">' + list.map(function (i) { return itemCard(i, mode); }).join('') + '</div>';
  }

  /* ==================== dashboard ==================== */

  function renderDashboard() {
    var items = Storage.getItems();
    var active = items.filter(function (i) { return !i.archived; });
    var archived = items.filter(function (i) { return i.archived; });
    var favorites = active.filter(function (i) { return i.favorite; });
    var toReview = active.filter(function (i) { return i.reviewDate; });
    var overdue = toReview.filter(function (i) { return dayDiff(i.reviewDate) < 0; });

    $('#statsGrid').innerHTML =
      '<div class="stat-card">' +
        '<span class="stat-icon"><i data-lucide="bookmark"></i></span>' +
        '<div><p class="stat-label">Total Saved</p><p class="stat-value">' + active.length + '</p>' +
        '<p class="stat-hint">' + archived.length + ' archived</p></div>' +
      '</div>' +
      '<div class="stat-card">' +
        '<span class="stat-icon fav"><i data-lucide="star"></i></span>' +
        '<div><p class="stat-label">Favorites</p><p class="stat-value">' + favorites.length + '</p>' +
        '<p class="stat-hint">starred links</p></div>' +
      '</div>' +
      '<div class="stat-card">' +
        '<span class="stat-icon rev"><i data-lucide="calendar-clock"></i></span>' +
        '<div><p class="stat-label">To Review</p><p class="stat-value">' + toReview.length + '</p>' +
        '<p class="stat-hint">' + (overdue.length ? overdue.length + ' overdue' : 'nothing overdue') + '</p></div>' +
      '</div>' +
      '<div class="stat-card stat-action" data-action="random" role="button" tabindex="0">' +
        '<span class="stat-icon dis"><i data-lucide="shuffle"></i></span>' +
        '<div><p class="stat-label">Random Discovery</p>' +
        '<p class="stat-hint">Surprise me with an unreviewed link</p></div>' +
      '</div>';

    // recently saved
    var recent = active.slice().sort(byNewest).slice(0, 4);
    $('#recentList').innerHTML = recent.length
      ? recent.map(function (i) { return itemCard(i, 'recent'); }).join('')
      : emptyHTML('inbox', 'Nothing saved yet', 'Use the Add New button to save your first link.',
          '<button type="button" class="btn btn-primary" data-action="add"><i data-lucide="plus"></i> Add New</button>');

    // upcoming review dates
    var upcoming = toReview.slice().sort(function (a, b) {
      return String(a.reviewDate) < String(b.reviewDate) ? -1 : 1;
    }).slice(0, 6);

    $('#upcomingList').innerHTML = upcoming.length
      ? upcoming.map(function (item) {
          var diff = dayDiff(item.reviewDate);
          return (
            '<div class="item-row">' +
              '<span class="row-icon"><i data-lucide="calendar"></i></span>' +
              '<div class="row-main">' +
                '<a class="row-title" href="' + esc(normalizeUrl(item.url)) + '" target="_blank" rel="noopener noreferrer">' +
                  esc(item.title) + '</a>' +
                '<div class="row-sub">' + categoryChip(item) + priorityBadge(item) + '</div>' +
              '</div>' +
              '<span class="row-date ' + (diff < 0 ? 'overdue' : '') + '">' +
                (diff < 0 ? 'Overdue · ' : '') + esc(friendlyDate(item.reviewDate)) + '</span>' +
              actionsHTML(item, 'review') +
            '</div>'
          );
        }).join('')
      : emptyHTML('calendar-check', 'No reviews scheduled', 'Add a review date to an item to see it here.');
  }

  /* ==================== all saved ==================== */

  function renderCategoryOptions() {
    var select = $('#categoryFilter');
    var current = state.categoryFilter;
    var cats = Storage.getCategories();
    var html = '<option value="all">All categories</option>';
    cats.forEach(function (c) {
      html += '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    });
    html += '<option value="none">Uncategorized</option>';
    select.innerHTML = html;

    var valid = current === 'all' || current === 'none' ||
      cats.some(function (c) { return c.id === current; });
    if (!valid) current = 'all';
    select.value = current;
    state.categoryFilter = current;
  }

  function renderAll() {
    renderCategoryOptions();

    var q = state.search.trim().toLowerCase();
    var list = Storage.getItems().filter(function (i) { return !i.archived; });

    if (state.typeFilter !== 'all') {
      list = list.filter(function (i) { return (i.type || 'website') === state.typeFilter; });
    }
    if (state.categoryFilter === 'none') {
      list = list.filter(function (i) { return !i.categoryId; });
    } else if (state.categoryFilter !== 'all') {
      list = list.filter(function (i) { return i.categoryId === state.categoryFilter; });
    }
    if (q) {
      list = list.filter(function (i) {
        var haystack = (i.title + ' ' + i.url + ' ' + (i.description || '') + ' ' +
          (i.tags || []).join(' ')).toLowerCase();
        return haystack.indexOf(q) >= 0;
      });
    }

    list.sort(byNewest);
    $('#allCount').textContent = list.length + (list.length === 1 ? ' item' : ' items');

    $('#allList').innerHTML = list.length
      ? itemsHTML(list, 'all')
      : emptyHTML('search-x', 'No items found',
          'Try a different search or clear your filters.',
          '<button type="button" class="btn" data-action="clear-filters">Clear filters</button>');

    $('#gridViewBtn').classList.toggle('is-active', state.view === 'grid');
    $('#listViewBtn').classList.toggle('is-active', state.view === 'list');
  }

  /* ==================== categories ==================== */

  function renderCategories() {
    var cats = Storage.getCategories();
    var items = Storage.getItems();

    if (!cats.length) {
      $('#catGrid').innerHTML =
        emptyHTML('folder-plus', 'No categories yet',
          'Create your first category to start organizing your links.') +
        '<button type="button" class="cat-card cat-new" data-action="new-category">' +
          '<i data-lucide="plus"></i><span>New Category</span></button>';
      return;
    }

    var html = cats.map(function (cat) {
      var count = items.filter(function (i) { return i.categoryId === cat.id && !i.archived; }).length;
      return (
        '<article class="cat-card">' +
          '<div class="cat-head">' +
            '<div class="cat-head-left">' +
              '<span class="cat-swatch" style="background:' + esc(cat.color) + '"></span>' +
              '<span class="cat-count">' + count + (count === 1 ? ' item' : ' items') + '</span>' +
            '</div>' +
            '<div class="cat-actions">' +
              iconBtn('edit-category', cat.id, 'pencil', 'Edit category') +
              iconBtn('delete-category', cat.id, 'trash-2', 'Delete category', 'is-danger') +
            '</div>' +
          '</div>' +
          '<h3 class="cat-name">' + esc(cat.name) + '</h3>' +
        '</article>'
      );
    }).join('');

    html +=
      '<button type="button" class="cat-card cat-new" data-action="new-category">' +
        '<i data-lucide="folder-plus"></i><span>New Category</span>' +
      '</button>';

    $('#catGrid').innerHTML = html;
  }

  /* ==================== favorites ==================== */

  function renderFavorites() {
    var list = Storage.getItems()
      .filter(function (i) { return !i.archived && i.favorite; })
      .sort(byNewest);

    $('#favCount').textContent = list.length + (list.length === 1 ? ' item' : ' items');
    $('#favList').innerHTML = list.length
      ? '<div class="cards-grid">' + list.map(function (i) { return itemCard(i, 'favorites'); }).join('') + '</div>'
      : emptyHTML('star', 'No favorites yet', 'Star an item to keep it one click away.');
  }

  /* ==================== to review ==================== */

  function renderReview() {
    var list = Storage.getItems().filter(function (i) { return !i.archived && i.reviewDate; });

    var groups = [
      { key: 'overdue', label: 'Overdue', items: [] },
      { key: 'today', label: 'Today', items: [] },
      { key: 'upcoming', label: 'Upcoming', items: [] }
    ];

    list.forEach(function (item) {
      var diff = dayDiff(item.reviewDate);
      if (diff < 0) groups[0].items.push(item);
      else if (diff === 0) groups[1].items.push(item);
      else groups[2].items.push(item);
    });

    groups.forEach(function (g) {
      g.items.sort(function (a, b) {
        return String(a.reviewDate) < String(b.reviewDate) ? -1 : 1;
      });
    });

    if (!list.length) {
      $('#reviewPage').innerHTML =
        '<div class="panel">' +
          emptyHTML('calendar-check', 'All caught up',
            'No items need review right now. Add a review date when you save a link.') +
        '</div>';
      return;
    }

    var html = '<div class="review-page" style="display:flex;flex-direction:column;gap:24px;">';
    groups.forEach(function (g) {
      if (!g.items.length) return;
      html +=
        '<div class="review-group ' + g.key + '">' +
          '<h2>' + esc(g.label) + ' <span class="group-count">' + g.items.length + '</span></h2>' +
          '<div class="rows">' +
            g.items.map(function (item) {
              var diff = dayDiff(item.reviewDate);
              return (
                '<div class="item-row">' +
                  '<span class="row-icon"><i data-lucide="calendar"></i></span>' +
                  '<div class="row-main">' +
                    '<a class="row-title" href="' + esc(normalizeUrl(item.url)) + '" target="_blank" rel="noopener noreferrer">' +
                      esc(item.title) + '</a>' +
                    '<div class="row-sub">' +
                      '<span>' + esc(hostOf(item.url)) + '</span>' +
                      categoryChip(item) +
                      priorityBadge(item) +
                    '</div>' +
                  '</div>' +
                  '<span class="row-date ' + (diff < 0 ? 'overdue' : '') + '">' +
                    esc(friendlyDate(item.reviewDate)) +
                    (diff < 0 ? ' (' + Math.abs(diff) + 'd late)' : '') +
                  '</span>' +
                  actionsHTML(item, 'review') +
                '</div>'
              );
            }).join('') +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    $('#reviewPage').innerHTML = html;
  }

  /* ==================== archived ==================== */

  function renderArchived() {
    var list = Storage.getItems()
      .filter(function (i) { return i.archived; })
      .sort(byNewest);

    $('#archCount').textContent = list.length + (list.length === 1 ? ' item' : ' items');
    $('#archList').innerHTML = list.length
      ? '<div class="cards-grid">' + list.map(function (i) { return itemCard(i, 'archived'); }).join('') + '</div>'
      : emptyHTML('archive', 'Nothing archived', 'Archive an item from All Saved to keep it out of the way.');
  }

  /* ==================== settings ==================== */

  function renderSettings() {
    var items = Storage.getItems();
    var cats = Storage.getCategories();
    $('#dataStats').textContent =
      items.length + (items.length === 1 ? ' item' : ' items') + ' · ' +
      cats.length + (cats.length === 1 ? ' category' : ' categories') + ' in your account';

    var theme = document.documentElement.getAttribute('data-theme') || 'light';
    Array.prototype.forEach.call(document.querySelectorAll('.theme-card'), function (card) {
      card.classList.toggle('is-active', card.getAttribute('data-theme-set') === theme);
    });
  }

  /* ==================== render router ==================== */

  function render() {
    renderBadges();
    switch (state.page) {
      case 'dashboard': renderDashboard(); break;
      case 'all': renderAll(); break;
      case 'categories': renderCategories(); break;
      case 'favorites': renderFavorites(); break;
      case 'review': renderReview(); break;
      case 'archived': renderArchived(); break;
      case 'settings': renderSettings(); break;
    }
    refreshIcons();
  }

  /* ==================== item form ==================== */

  function fillCategorySelect(selectedId) {
    var select = $('#fCat');
    var cats = Storage.getCategories();
    var html = '<option value="">Uncategorized</option>';
    cats.forEach(function (c) {
      html += '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    });
    select.innerHTML = html;
    select.value = selectedId || '';
  }

  function openItemModal(id) {
    state.editingId = id || null;
    var form = $('#itemForm');
    form.reset();
    fillCategorySelect('');

    if (id) {
      var item = Storage.getItem(id);
      if (!item) return;
      $('#itemModalTitle').textContent = 'Edit Item';
      $('#fTitle').value = item.title || '';
      $('#fUrl').value = item.url || '';
      $('#fDesc').value = item.description || '';
      $('#fType').value = item.type || 'website';
      fillCategorySelect(item.categoryId);
      $('#fTags').value = (item.tags || []).join(', ');
      $('#fPriority').value = item.priority || 'normal';
      $('#fReview').value = item.reviewDate || '';
      $('#fFav').checked = !!item.favorite;
    } else {
      $('#itemModalTitle').textContent = 'Add New Item';
      $('#fType').value = 'website';
      $('#fPriority').value = 'normal';
    }

    openModal('itemModal');
    setTimeout(function () { $('#fTitle').focus(); }, 60);
  }

  function submitItemForm(event) {
    event.preventDefault();
    if (state.saving) return;

    var title = $('#fTitle').value.trim();
    var url = $('#fUrl').value.trim();

    if (!title) {
      toast('Title is required');
      $('#fTitle').focus();
      return;
    }
    if (!url) {
      toast('URL is required');
      $('#fUrl').focus();
      return;
    }

    var data = {
      title: title,
      url: normalizeUrl(url),
      description: $('#fDesc').value.trim(),
      type: $('#fType').value,
      categoryId: $('#fCat').value,
      tags: $('#fTags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
      priority: $('#fPriority').value,
      reviewDate: $('#fReview').value,
      favorite: $('#fFav').checked
    };

    var editingId = state.editingId;
    var form = $('#itemForm');
    var btn = form.querySelector('button[type="submit"]');

    state.saving = true;
    setBusy(btn, true, 'Saving…');

    var request = editingId
      ? Storage.updateItem(editingId, data)
      : Storage.createItem(data);

    request.then(function () {
      toast(editingId ? 'Item updated' : 'Item saved');
      closeModal('itemModal');
      render();
    }).catch(function (err) {
      // Keep the modal open with the user's input intact so nothing is lost.
      errorToast(err);
    }).then(function () {
      state.saving = false;
      setBusy(btn, false);
    });
  }

  /* ==================== category form ==================== */

  function renderSwatches(activeColor) {
    $('#colorSwatches').innerHTML = SWATCH_COLORS.map(function (color) {
      return '<button type="button" class="swatch ' + (color === activeColor ? 'is-active' : '') +
        '" data-color="' + color + '" style="background:' + color + '" title="' + color + '"></button>';
    }).join('');
  }

  function openCategoryModal(id) {
    state.editingCategoryId = id || null;
    var nameInput = $('#fCatName');
    var colorInput = $('#fCatColor');

    if (id) {
      var cat = Storage.getCategory(id);
      if (!cat) return;
      $('#catModalTitle').textContent = 'Edit Category';
      nameInput.value = cat.name;
      colorInput.value = cat.color;
    } else {
      $('#catModalTitle').textContent = 'New Category';
      nameInput.value = '';
      colorInput.value = '#a97c50';
    }

    renderSwatches(colorInput.value);
    openModal('categoryModal');
    setTimeout(function () { nameInput.focus(); }, 60);
  }

  function submitCategoryForm(event) {
    event.preventDefault();
    if (state.saving) return;

    var name = $('#fCatName').value.trim();

    if (!name) {
      toast('Category name is required');
      $('#fCatName').focus();
      return;
    }

    var data = { name: name, color: $('#fCatColor').value };
    var editingId = state.editingCategoryId;
    var form = $('#categoryForm');
    var btn = form.querySelector('button[type="submit"]');

    state.saving = true;
    setBusy(btn, true, 'Saving…');

    var request = editingId
      ? Storage.updateCategory(editingId, data)
      : Storage.createCategory(data);

    request.then(function () {
      toast(editingId ? 'Category updated' : 'Category created');
      closeModal('categoryModal');
      render();
    }).catch(function (err) {
      // Keep the modal open so the typed name and color are not lost.
      errorToast(err);
    }).then(function () {
      state.saving = false;
      setBusy(btn, false);
    });
  }

  /* ==================== random discovery ==================== */

  function showRandom() {
    var pool = Storage.getItems().filter(function (i) {
      return !i.archived && !i.lastReviewed;
    });

    if (!pool.length) {
      toast('Every item has been reviewed already 🎉');
      return;
    }

    var pick = pool[Math.floor(Math.random() * pool.length)];
    state.randomId = pick.id;
    renderRandomBody(pick);
    openModal('randomModal');
  }

  function renderRandomBody(item) {
    $('#randomBody').innerHTML =
      '<div class="random-item">' +
        '<div class="item-meta">' + typeBadge(item) + categoryChip(item) + priorityBadge(item) + '</div>' +
        '<h3>' + esc(item.title) + '</h3>' +
        '<p class="item-url">' + esc(normalizeUrl(item.url)) + '</p>' +
        (item.description ? '<p class="item-desc" style="-webkit-line-clamp:4;">' + esc(item.description) + '</p>' : '') +
        tagsHTML(item) +
      '</div>';
    refreshIcons();
  }

  function openRandomItem() {
    var item = state.randomId ? Storage.getItem(state.randomId) : null;
    if (!item) return;
    window.open(normalizeUrl(item.url), '_blank', 'noopener,noreferrer');
  }

  /* ==================== actions ==================== */

  function handleAction(action, id, button) {
    var item = id ? Storage.getItem(id) : null;

    switch (action) {
      case 'random':
        showRandom();
        break;

      case 'add':
        openItemModal(null);
        break;

      case 'open':
        if (item) window.open(normalizeUrl(item.url), '_blank', 'noopener,noreferrer');
        break;

      case 'edit':
        openItemModal(id);
        break;

      case 'delete':
        if (item && window.confirm('Delete "' + item.title + '" permanently? This cannot be undone.')) {
          runAction('delete:' + id, button, function () {
            return Storage.removeItem(id).then(function () {
              toast('Item deleted');
              render();
            });
          });
        }
        break;

      case 'favorite':
        if (item) {
          var next = !item.favorite;
          runAction('favorite:' + id, button, function () {
            return Storage.updateItem(id, { favorite: next }).then(function () {
              toast(next ? 'Added to favorites' : 'Removed from favorites');
              render();
            });
          });
        }
        break;

      case 'archive':
        if (item) {
          runAction('archive:' + id, button, function () {
            return Storage.updateItem(id, { archived: true }).then(function () {
              toast('Item archived');
              render();
            });
          });
        }
        break;

      case 'restore':
        if (item) {
          runAction('restore:' + id, button, function () {
            return Storage.updateItem(id, { archived: false }).then(function () {
              toast('Item restored');
              render();
            });
          });
        }
        break;

      case 'reviewed':
        if (item) {
          runAction('reviewed:' + id, button, function () {
            return Storage.updateItem(id, { lastReviewed: todayStr(), reviewDate: '' }).then(function () {
              toast('Marked as reviewed');
              render();
            });
          });
        }
        break;

      case 'clear-filters':
        state.search = '';
        state.typeFilter = 'all';
        state.categoryFilter = 'all';
        $('#searchInput').value = '';
        $('#typeFilter').value = 'all';
        renderAll();
        refreshIcons();
        break;

      case 'new-category':
        openCategoryModal(null);
        break;

      case 'edit-category':
        openCategoryModal(id);
        break;

      case 'delete-category':
        var cat = Storage.getCategory(id);
        if (cat && window.confirm('Delete category "' + cat.name + '"? Its items will become uncategorized.')) {
          runAction('delete-category:' + id, button, function () {
            return Storage.deleteCategory(id).then(function () {
              toast('Category deleted');
              render();
            });
          });
        }
        break;
    }
  }

  /* ==================== migration ==================== */

  function wireMigration() {
    var migrateBtn = $('#migrateBtn');
    var previewBox = $('#migratePreview');
    var countsEl = $('#migrateCounts');
    var warningsEl = $('#migrateWarnings');
    var confirmBtn = $('#migrateConfirmBtn');
    var cancelBtn = $('#migrateCancelBtn');
    var statusEl = $('#migrateStatus');

    if (!migrateBtn) return;

    migrateBtn.addEventListener('click', function () {
      if (!window.Migrate || typeof window.Migrate.preview !== 'function') {
        toast('Migration module is unavailable.');
        return;
      }

      var preview = window.Migrate.preview();
      if (!preview.ok) {
        statusEl.className = 'migrate-status is-error';
        statusEl.textContent = preview.error || 'Failed to inspect local data.';
        statusEl.hidden = false;
        previewBox.hidden = true;
        return;
      }

      if (preview.sampleOnly) {
        statusEl.className = 'migrate-status';
        statusEl.textContent = 'Your browser only contains the built-in sample data. Sample data is not migrated. Add your own items first, then try again.';
        statusEl.hidden = false;
        previewBox.hidden = true;
        return;
      }

      if (!preview.counts.categories && !preview.counts.items) {
        statusEl.className = 'migrate-status';
        statusEl.textContent = 'No local categories or items were found in this browser.';
        statusEl.hidden = false;
        previewBox.hidden = true;
        return;
      }

      countsEl.textContent = 'Found ' + preview.counts.items +
        (preview.counts.items === 1 ? ' item' : ' items') + ' and ' +
        preview.counts.categories +
        (preview.counts.categories === 1 ? ' category' : ' categories') +
        ' ready to import into your account.';

      if (preview.warnings && preview.warnings.length) {
        warningsEl.textContent = preview.warnings.join(' · ');
        warningsEl.hidden = false;
      } else {
        warningsEl.textContent = '';
        warningsEl.hidden = true;
      }

      statusEl.hidden = true;
      previewBox.hidden = false;
      migrateBtn.hidden = true;
      refreshIcons();
    });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        previewBox.hidden = true;
        migrateBtn.hidden = false;
        statusEl.hidden = true;
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        if (!window.Migrate || typeof window.Migrate.run !== 'function') {
          toast('Migration module is unavailable.');
          return;
        }

        setBusy(confirmBtn, true, 'Importing…');
        if (cancelBtn) cancelBtn.disabled = true;
        statusEl.className = 'migrate-status';
        statusEl.hidden = false;
        statusEl.textContent = 'Starting import…';

        window.Migrate.run(function (step) {
          statusEl.textContent = step;
        }).then(function (res) {
          if (res.blocked) {
            statusEl.className = 'migrate-status is-error';
            statusEl.textContent = res.blockedMessage || 'Import stopped due to an ID conflict.';
            return;
          }

          var msg = 'Import complete: ' + res.importedItems + ' items and ' +
            res.importedCategories + ' categories added.';
          if (res.skippedItems || res.skippedCategories) {
            msg += ' (' + (res.skippedItems + res.skippedCategories) + ' already in your account were skipped)';
          }
          if (res.failedItems || res.failedCategories) {
            msg += ' · ' + (res.failedItems + res.failedCategories) + ' failed.';
          }
          statusEl.className = 'migrate-status is-success';
          statusEl.textContent = msg;
          toast('Data imported successfully');
          previewBox.hidden = true;
          migrateBtn.hidden = false;
          render();
        }).catch(function (err) {
          statusEl.className = 'migrate-status is-error';
          statusEl.textContent = (err && err.message) || 'Import failed. Please try again.';
          errorToast(err);
        }).then(function () {
          setBusy(confirmBtn, false);
          if (cancelBtn) cancelBtn.disabled = false;
          refreshIcons();
        });
      });
    }
  }

  /* ==================== events ==================== */

  function wireEvents() {

    // global click delegation
    document.addEventListener('click', function (event) {
      var target = event.target;

      // modal backdrop click
      if (target.classList && target.classList.contains('modal-backdrop')) {
        target.hidden = true;
        if (!document.querySelector('.modal-backdrop:not([hidden])')) {
          document.body.classList.remove('modal-open');
        }
        return;
      }

      var el;

      el = target.closest('[data-nav]');
      if (el) { go(el.getAttribute('data-nav')); return; }

      el = target.closest('[data-goto]');
      if (el) { go(el.getAttribute('data-goto')); return; }

      el = target.closest('[data-close]');
      if (el) { closeModal(el.getAttribute('data-close')); return; }

      el = target.closest('[data-theme-set]');
      if (el) {
        applyTheme(el.getAttribute('data-theme-set'));
        renderSettings();
        refreshIcons();
        return;
      }

      el = target.closest('[data-color]');
      if (el) {
        $('#fCatColor').value = el.getAttribute('data-color');
        renderSwatches(el.getAttribute('data-color'));
        return;
      }

      el = target.closest('[data-action]');
      if (el) {
        handleAction(el.getAttribute('data-action'), el.getAttribute('data-id'), el);
      }
    });

    // sidebar
    $('#menuBtn').addEventListener('click', function () {
      document.body.classList.toggle('sidebar-open');
    });
    $('#sidebarOverlay').addEventListener('click', function () {
      document.body.classList.remove('sidebar-open');
    });

    // topbar
    $('#addBtn').addEventListener('click', function () { openItemModal(null); });
    $('#themeBtn').addEventListener('click', toggleTheme);
    $('#randomBtn').addEventListener('click', showRandom);

    // forms
    $('#itemForm').addEventListener('submit', submitItemForm);
    $('#categoryForm').addEventListener('submit', submitCategoryForm);

    // toolbar
    $('#searchInput').addEventListener('input', function () {
      state.search = this.value;
      renderAll();
      refreshIcons();
    });

    $('#typeFilter').addEventListener('change', function () {
      state.typeFilter = this.value;
      renderAll();
      refreshIcons();
    });

    $('#categoryFilter').addEventListener('change', function () {
      state.categoryFilter = this.value;
      renderAll();
      refreshIcons();
    });

    $('#gridViewBtn').addEventListener('click', function () {
      state.view = 'grid';
      Storage.setSetting('view', 'grid');
      renderAll();
      refreshIcons();
    });

    $('#listViewBtn').addEventListener('click', function () {
      state.view = 'list';
      Storage.setSetting('view', 'list');
      renderAll();
      refreshIcons();
    });

    // random modal
    $('#randomOpen').addEventListener('click', openRandomItem);
    $('#randomAgain').addEventListener('click', showRandom);

    // settings data buttons
    $('#resetDataBtn').addEventListener('click', function () {
      var btn = this;
      if (window.confirm('Reset everything back to the sample data?')) {
        setBusy(btn, true, 'Restoring…');
        Storage.resetSampleData().then(function () {
          toast('Sample data restored');
          render();
        }).catch(function (err) {
          errorToast(err);
        }).then(function () {
          setBusy(btn, false);
        });
      }
    });

    $('#clearDataBtn').addEventListener('click', function () {
      var btn = this;
      if (window.confirm('Clear ALL saved items and categories? This cannot be undone.')) {
        setBusy(btn, true, 'Clearing…');
        Storage.clearAllData().then(function () {
          toast('All data cleared');
          render();
        }).catch(function (err) {
          errorToast(err);
        }).then(function () {
          setBusy(btn, false);
        });
      }
    });

    // migration from browser
    wireMigration();

    // keyboard: escape closes modals / sidebar
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (document.querySelector('.modal-backdrop:not([hidden])')) {
          closeAllModals();
        } else {
          document.body.classList.remove('sidebar-open');
        }
      }
    });
  }

  /* ==================== init ==================== */

  function init() {
    applyTheme(Storage.getSettings().theme === 'dark' ? 'dark' : 'light');
    wireEvents();

    // Auth gating: the app is rendered only after Supabase Auth confirms
    // a session. auth-ui.js dispatches "auth:signed-in" for both a
    // restored session and a fresh login.
    window.addEventListener('auth:signed-in', function () {
      go('dashboard');
    });
    if (document.body.classList.contains('is-authenticated')) {
      go('dashboard');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
