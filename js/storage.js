/* =========================================================
   Don't Forget — storage.js
   Supabase-backed data layer for authenticated users.

   • All reads/writes go through the single Supabase client
     exposed by Auth.getClient() (publishable key only).
   • user_id always comes from the authenticated session —
     never from user input or localStorage.
   • An in-memory cache feeds the synchronous render code.
   • localStorage is used ONLY for device settings (theme/view).
     The keys dontforget.items / dontforget.categories are left
     untouched so the user can migrate them explicitly.
   ========================================================= */

window.Storage = (function () {
  'use strict';

  var PREFIX = 'dontforget.';
  var KEYS = {
    items: PREFIX + 'items',
    categories: PREFIX + 'categories',
    settings: PREFIX + 'settings'
  };

  var TABLE_ITEMS = 'items';
  var TABLE_CATEGORIES = 'categories';

  /* ---------- cache ---------- */

  var cache = {
    userId: null,
    categories: [],
    items: [],
    loaded: false
  };

  var loadPromise = null;
  var epoch = 0;

  /* ---------- low level helpers (settings only) ---------- */

  function loadLocal(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function saveLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable — keep working in memory */
    }
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function formatDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function daysFromNow(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return formatDate(d);
  }

  function isoDaysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  /* ---------- sample data (used by the explicit "reset" action
                and to recognise a demo-only local dataset) ---------- */

  function seedCategories() {
    return [
      { id: 'cat-work', name: 'Work', color: '#a97c50' },
      { id: 'cat-learning', name: 'Learning', color: '#7d8c6b' },
      { id: 'cat-recipes', name: 'Recipes', color: '#b4703f' },
      { id: 'cat-inspiration', name: 'Inspiration', color: '#8c7ba6' },
      { id: 'cat-travel', name: 'Travel', color: '#6b8c9b' },
      { id: 'cat-personal', name: 'Personal', color: '#c2a15e' }
    ];
  }

  function seedItems() {
    return [
      {
        id: 'itm-mdn',
        title: 'MDN Web Docs — JavaScript Guide',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        description: 'The definitive reference for JavaScript. Great for looking up methods and syntax.',
        type: 'website',
        categoryId: 'cat-learning',
        tags: ['reference', 'javascript'],
        priority: 'high',
        reviewDate: '',
        favorite: true,
        archived: false,
        lastReviewed: '',
        createdAt: isoDaysAgo(1)
      },
      {
        id: 'itm-flexbox',
        title: 'CSS-Tricks — A Complete Guide to Flexbox',
        url: 'https://css-tricks.com/snippets/css/a-guide-to-flexbox/',
        description: 'Visual guide to every Flexbox property. Keep it open while building layouts.',
        type: 'article',
        categoryId: 'cat-learning',
        tags: ['css', 'layout', 'design'],
        priority: 'normal',
        reviewDate: daysFromNow(4),
        favorite: true,
        archived: false,
        lastReviewed: '',
        createdAt: isoDaysAgo(2)
      },
      {
        id: 'itm-eggs',
        title: 'How to Make Perfect Scrambled Eggs',
        url: 'https://www.seriouseats.com/perfect-scrambled-eggs-recipe',
        description: 'Low heat, constant stirring, finish off the heat. Best breakfast method so far.',
        type: 'article',
        categoryId: 'cat-recipes',
        tags: ['breakfast', 'cooking'],
        priority: 'low',
        reviewDate: daysFromNow(-6),
        favorite: false,
        archived: false,
        lastReviewed: '',
        createdAt: isoDaysAgo(9)
      },
      {
        id: 'itm-lofi',
        title: 'Lofi Hip Hop Radio — Beats to Relax and Study',
        url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
        description: 'Background music stream for deep work sessions.',
        type: 'video',
        categoryId: 'cat-personal',
        tags: ['music', 'focus'],
        priority: 'normal',
        reviewDate: '',
        favorite: true,
        archived: false,
        lastReviewed: '',
        createdAt: isoDaysAgo(3)
      },
      {
        id: 'itm-devtools',
        title: 'Chrome DevTools Documentation',
        url: 'https://developer.chrome.com/docs/devtools',
        description: 'Everything about inspecting pages, debugging and profiling in the browser.',
        type: 'website',
        categoryId: 'cat-work',
        tags: ['debugging', 'tools'],
        priority: 'high',
        reviewDate: daysFromNow(11),
        favorite: false,
        archived: false,
        lastReviewed: '',
        createdAt: isoDaysAgo(5)
      },
      {
        id: 'itm-figma',
        title: 'Figma Community Files',
        url: 'https://www.figma.com/community',
        description: 'Free design files, kits and plugins shared by the community.',
        type: 'website',
        categoryId: 'cat-inspiration',
        tags: ['design', 'ui'],
        priority: 'normal',
        reviewDate: '',
        favorite: false,
        archived: false,
        lastReviewed: '',
        createdAt: isoDaysAgo(6)
      },
      {
        id: 'itm-minimalism',
        title: 'The Art of Minimalism — Keeping Only What Matters',
        url: 'https://www.newyorker.com/magazine/the-minimalists',
        description: 'Long read about owning less and choosing better. Worth a second pass.',
        type: 'article',
        categoryId: 'cat-inspiration',
        tags: ['minimalism', 'essay'],
        priority: 'low',
        reviewDate: daysFromNow(26),
        favorite: false,
        archived: false,
        lastReviewed: '',
        createdAt: isoDaysAgo(8)
      },
      {
        id: 'itm-python',
        title: 'Python Quick Reference Sheet',
        url: 'https://www.pythoncheatsheet.org/',
        description: 'One-page cheatsheet for syntax, data structures and common patterns.',
        type: 'website',
        categoryId: 'cat-learning',
        tags: ['python', 'reference'],
        priority: 'high',
        reviewDate: daysFromNow(-14),
        favorite: false,
        archived: false,
        lastReviewed: '',
        createdAt: isoDaysAgo(12)
      },
      {
        id: 'itm-lisbon',
        title: 'Weekend Trip to Lisbon — 48 Hour Guide',
        url: 'https://www.lonelyplanet.com/portugal/lisbon',
        description: 'Neighbourhoods, tram routes and where to eat pastéis de nata.',
        type: 'website',
        categoryId: 'cat-travel',
        tags: ['travel', 'portugal'],
        priority: 'normal',
        reviewDate: '',
        favorite: false,
        archived: false,
        lastReviewed: '',
        createdAt: isoDaysAgo(14)
      },
      {
        id: 'itm-shortcuts',
        title: 'Keyboard Shortcuts Cheat Sheet',
        url: 'https://support.microsoft.com/en-us/windows/keyboard-shortcuts-in-windows',
        description: 'Windows shortcuts worth memorising. Reviewed once already.',
        type: 'article',
        categoryId: 'cat-work',
        tags: ['productivity', 'windows'],
        priority: 'normal',
        reviewDate: daysFromNow(7),
        favorite: true,
        archived: false,
        lastReviewed: daysFromNow(-7),
        createdAt: isoDaysAgo(20)
      },
      {
        id: 'itm-portfolio',
        title: 'Old Portfolio 2019',
        url: 'https://example.com/portfolio-2019',
        description: 'Superseded portfolio site. Kept for reference only.',
        type: 'other',
        categoryId: 'cat-work',
        tags: ['archive'],
        priority: 'low',
        reviewDate: '',
        favorite: false,
        archived: true,
        lastReviewed: '',
        createdAt: isoDaysAgo(400)
      }
    ];
  }

  var SAMPLE_CATEGORY_IDS = seedCategories().map(function (c) { return c.id; });
  var SAMPLE_ITEM_IDS = seedItems().map(function (i) { return i.id; });

  /* A dataset made up ONLY of the untouched demo records. */
  function isSampleOnly(categories, items) {
    if (!Array.isArray(categories) || !Array.isArray(items)) return false;
    if (categories.length !== SAMPLE_CATEGORY_IDS.length) return false;
    if (items.length !== SAMPLE_ITEM_IDS.length) return false;
    var okCats = categories.every(function (c) {
      return c && SAMPLE_CATEGORY_IDS.indexOf(String(c.id)) >= 0;
    });
    var okItems = items.every(function (i) {
      return i && SAMPLE_ITEM_IDS.indexOf(String(i.id)) >= 0;
    });
    return okCats && okItems;
  }

  /* ---------- settings (device-local preference only) ---------- */

  var settings = loadLocal(KEYS.settings, null);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    settings = { theme: 'light', view: 'grid' };
  }

  function getSettings() {
    var copy = {};
    for (var key in settings) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) copy[key] = settings[key];
    }
    return copy;
  }

  function setSetting(key, value) {
    settings[key] = value;
    saveLocal(KEYS.settings, settings);
    return getSettings();
  }

  /* ---------- client / errors ---------- */

  function sb() {
    if (window.Auth && typeof window.Auth.getClient === 'function') {
      return window.Auth.getClient();
    }
    return null;
  }

  function makeError(message, code) {
    var err = new Error(message);
    err.code = code || '';
    return err;
  }

  function describeError(err) {
    var code = err && err.code ? String(err.code) : '';
    var msg = (err && err.message) || String(err || '');

    if (code === '23505' || /duplicate key/i.test(msg)) {
      return 'This record already exists and was not overwritten.';
    }
    if (code === '23503' || /foreign key/i.test(msg)) {
      return 'A linked category could not be found in your account.';
    }
    if (code === '23502' || /null value in column/i.test(msg)) {
      return 'A required field was missing. Please check the form and try again.';
    }
    if (code === '22P02' || /invalid input syntax/i.test(msg)) {
      return 'One of the values has an invalid format.';
    }
    if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
      return 'You do not have permission to access or change this data.';
    }
    if (code === '42P01' || /relation .* does not exist/i.test(msg)) {
      return 'The database tables are missing. Please check the Supabase setup.';
    }
    if (code === 'PGRST301' || code === '401' ||
        /jwt|session .* expired|not authenticated|refresh token/i.test(msg)) {
      return 'Your session expired. Please sign in again.';
    }
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
      return 'Network error — check your internet connection and try again.';
    }
    return msg || 'Something went wrong. Please try again.';
  }

  function toError(err) {
    return makeError(describeError(err), err && err.code ? String(err.code) : '');
  }

  function requireClient() {
    var client = sb();
    if (!client) {
      throw makeError('Cloud sync is unavailable. Reload the page and sign in again.', 'NO_CLIENT');
    }
    return client;
  }

  function getCurrentUser() {
    if (!window.Auth || typeof window.Auth.getSession !== 'function') {
      return Promise.reject(makeError('Authentication is unavailable. Reload the page.', 'NO_AUTH'));
    }
    return window.Auth.getSession().then(function (session) {
      if (!session || !session.user || !session.user.id) {
        throw makeError('Your session expired. Please sign in again.', 'NO_SESSION');
      }
      return session.user;
    });
  }

  /* ---------- row mapping ---------- */

  function toDateOnly(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  function rowToItem(row) {
    return {
      id: String(row.id),
      title: row.title || '',
      url: row.url || '',
      description: row.description || '',
      type: row.type || 'website',
      categoryId: row.category_id ? String(row.category_id) : '',
      tags: Array.isArray(row.tags) ? row.tags.slice() : [],
      priority: row.priority || 'normal',
      reviewDate: toDateOnly(row.review_date),
      favorite: !!row.favorite,
      archived: !!row.archived,
      lastReviewed: toDateOnly(row.last_reviewed),
      createdAt: row.created_at || ''
    };
  }

  function itemToRow(userId, item) {
    return {
      id: String(item.id),
      user_id: userId,
      title: item.title || '',
      url: item.url || '',
      description: item.description || null,
      type: item.type || 'website',
      category_id: item.categoryId ? String(item.categoryId) : null,
      tags: Array.isArray(item.tags) ? item.tags : [],
      priority: item.priority || 'normal',
      review_date: item.reviewDate ? String(item.reviewDate) : null,
      favorite: !!item.favorite,
      archived: !!item.archived,
      last_reviewed: item.lastReviewed ? String(item.lastReviewed) : null,
      created_at: item.createdAt || new Date().toISOString()
    };
  }

  function rowToCategory(row) {
    return {
      id: String(row.id),
      name: row.name || '',
      color: row.color || '#a97c50',
      createdAt: row.created_at || ''
    };
  }

  function categoryToRow(userId, cat) {
    return {
      id: String(cat.id),
      user_id: userId,
      name: cat.name || '',
      color: cat.color || '#a97c50',
      created_at: cat.createdAt || new Date().toISOString()
    };
  }

  /* ---------- cache management ---------- */

  function clearCache() {
    epoch++;
    loadPromise = null;
    cache.userId = null;
    cache.categories = [];
    cache.items = [];
    cache.loaded = false;
  }

  function getLoadedUserId() {
    return cache.loaded ? cache.userId : null;
  }

  function isLoadedFor(userId) {
    return !!userId && cache.loaded && cache.userId === String(userId);
  }

  /* ---------- load ---------- */

  function loadAll() {
    if (loadPromise) return loadPromise;

    var myEpoch = epoch;
    var client = requireClient();

    loadPromise = getCurrentUser().then(function (user) {
      if (cache.userId && cache.userId !== user.id) clearCache();

      return client.from(TABLE_CATEGORIES).select('*')
        .order('created_at', { ascending: true })
        .then(function (catRes) {
          if (catRes.error) throw toError(catRes.error);
          if (myEpoch !== epoch) throw makeError('Signed out.', 'STALE');

          return client.from(TABLE_ITEMS).select('*')
            .order('created_at', { ascending: false })
            .then(function (itemRes) {
              if (itemRes.error) throw toError(itemRes.error);
              if (myEpoch !== epoch) throw makeError('Signed out.', 'STALE');

              cache.categories = (catRes.data || []).map(rowToCategory);
              cache.items = (itemRes.data || []).map(rowToItem);
              cache.userId = user.id;
              cache.loaded = true;

              return {
                categories: cache.categories.slice(),
                items: cache.items.slice()
              };
            });
        });
    });

    var reset = function () { loadPromise = null; };
    loadPromise.then(reset, reset);

    return loadPromise;
  }

  /* ---------- read accessors (cache) ---------- */

  function getItems() { return cache.items.slice(); }

  function getItem(id) {
    for (var i = 0; i < cache.items.length; i++) {
      if (cache.items[i].id === id) return cache.items[i];
    }
    return null;
  }

  function getCategories() { return cache.categories.slice(); }

  function getCategory(id) {
    for (var i = 0; i < cache.categories.length; i++) {
      if (cache.categories[i].id === id) return cache.categories[i];
    }
    return null;
  }

  function hasCategory(id) { return !!id && !!getCategory(id); }

  /* ---------- items (write) ---------- */

  function createItem(data) {
    return getCurrentUser().then(function (user) {
      var client = requireClient();
      var item = {
        id: uid('itm'),
        title: data.title || '',
        url: data.url || '',
        description: data.description || '',
        type: data.type || 'website',
        categoryId: hasCategory(data.categoryId) ? data.categoryId : '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        priority: data.priority || 'normal',
        reviewDate: data.reviewDate || '',
        favorite: !!data.favorite,
        archived: false,
        lastReviewed: '',
        createdAt: new Date().toISOString()
      };

      return client.from(TABLE_ITEMS)
        .insert(itemToRow(user.id, item))
        .select()
        .single()
        .then(function (res) {
          if (res.error) throw toError(res.error);
          var saved = res.data ? rowToItem(res.data) : item;
          cache.items.unshift(saved);
          return saved;
        });
    });
  }

  function updateItem(id, patch) {
    return getCurrentUser().then(function (user) {
      var client = requireClient();
      var current = getItem(id);
      if (!current) throw makeError('Item not found. It may have been deleted elsewhere.', 'NOT_FOUND');

      var merged = {};
      for (var key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) merged[key] = current[key];
      }
      for (var p in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, p)) merged[p] = patch[p];
      }
      if (merged.categoryId && !hasCategory(merged.categoryId)) merged.categoryId = '';

      return client.from(TABLE_ITEMS)
        .update(itemToRow(user.id, merged))
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()
        .then(function (res) {
          if (res.error) throw toError(res.error);
          if (!res.data) throw makeError('Item not found. It may have been deleted elsewhere.', 'NOT_FOUND');
          var saved = rowToItem(res.data);
          for (var i = 0; i < cache.items.length; i++) {
            if (cache.items[i].id === id) { cache.items[i] = saved; break; }
          }
          return saved;
        });
    });
  }

  function removeItem(id) {
    return getCurrentUser().then(function (user) {
      var client = requireClient();
      return client.from(TABLE_ITEMS)
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .then(function (res) {
          if (res.error) throw toError(res.error);
          cache.items = cache.items.filter(function (i) { return i.id !== id; });
          return true;
        });
    });
  }

  /* ---------- categories (write) ---------- */

  function createCategory(data) {
    return getCurrentUser().then(function (user) {
      var client = requireClient();
      var cat = {
        id: uid('cat'),
        name: (data.name || '').trim(),
        color: data.color || '#a97c50',
        createdAt: new Date().toISOString()
      };

      return client.from(TABLE_CATEGORIES)
        .insert(categoryToRow(user.id, cat))
        .select()
        .single()
        .then(function (res) {
          if (res.error) throw toError(res.error);
          var saved = res.data ? rowToCategory(res.data) : cat;
          cache.categories.push(saved);
          return saved;
        });
    });
  }

  function updateCategory(id, patch) {
    return getCurrentUser().then(function (user) {
      var client = requireClient();
      var current = getCategory(id);
      if (!current) throw makeError('Category not found. It may have been deleted elsewhere.', 'NOT_FOUND');

      var merged = {
        id: current.id,
        name: Object.prototype.hasOwnProperty.call(patch, 'name') ? patch.name : current.name,
        color: Object.prototype.hasOwnProperty.call(patch, 'color') ? patch.color : current.color,
        createdAt: current.createdAt
      };

      return client.from(TABLE_CATEGORIES)
        .update(categoryToRow(user.id, merged))
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single()
        .then(function (res) {
          if (res.error) throw toError(res.error);
          if (!res.data) throw makeError('Category not found. It may have been deleted elsewhere.', 'NOT_FOUND');
          var saved = rowToCategory(res.data);
          for (var i = 0; i < cache.categories.length; i++) {
            if (cache.categories[i].id === id) { cache.categories[i] = saved; break; }
          }
          return saved;
        });
    });
  }

  /* Items are never deleted with the category: their category_id is
     set to null first (composite FK is ON DELETE RESTRICT). */
  function deleteCategory(id) {
    return getCurrentUser().then(function (user) {
      var client = requireClient();

      return client.from(TABLE_ITEMS)
        .update({ category_id: null })
        .eq('category_id', id)
        .eq('user_id', user.id)
        .then(function (itemRes) {
          if (itemRes.error) throw toError(itemRes.error);

          return client.from(TABLE_CATEGORIES)
            .delete()
            .eq('id', id)
            .eq('user_id', user.id)
            .then(function (res) {
              if (res.error) {
                // The items were already detached; resync so the UI is truthful.
                return loadAll().catch(function () {}).then(function () {
                  throw toError(res.error);
                });
              }
              cache.categories = cache.categories.filter(function (c) { return c.id !== id; });
              cache.items.forEach(function (item) {
                if (item.categoryId === id) item.categoryId = '';
              });
              return true;
            });
        });
    });
  }

  /* ---------- explicit data management actions ---------- */

  function deleteAllOwnData(user) {
    var client = requireClient();
    return client.from(TABLE_ITEMS)
      .delete()
      .eq('user_id', user.id)
      .then(function (res) {
        if (res.error) throw toError(res.error);
        return client.from(TABLE_CATEGORIES)
          .delete()
          .eq('user_id', user.id);
      })
      .then(function (res) {
        if (res.error) throw toError(res.error);
      });
  }

  function clearAllData() {
    return getCurrentUser().then(function (user) {
      return deleteAllOwnData(user).then(function () {
        cache.items = [];
        cache.categories = [];
        return true;
      });
    });
  }

  function resetSampleData() {
    return getCurrentUser().then(function (user) {
      return deleteAllOwnData(user).then(function () {
        var client = requireClient();
        var catMap = {};
        var cats = seedCategories().map(function (c) {
          var copy = {
            id: uid('cat'),
            name: c.name,
            color: c.color,
            createdAt: new Date().toISOString()
          };
          catMap[c.id] = copy.id;
          return copy;
        });
        var items = seedItems().map(function (i) {
          return {
            id: uid('itm'),
            title: i.title,
            url: i.url,
            description: i.description,
            type: i.type,
            categoryId: catMap[i.categoryId] || '',
            tags: i.tags.slice(),
            priority: i.priority,
            reviewDate: i.reviewDate,
            favorite: i.favorite,
            archived: i.archived,
            lastReviewed: i.lastReviewed,
            createdAt: i.createdAt
          };
        });

        return client.from(TABLE_CATEGORIES)
          .insert(cats.map(function (c) { return categoryToRow(user.id, c); }))
          .then(function (res) {
            if (res.error) throw toError(res.error);
            return client.from(TABLE_ITEMS)
              .insert(items.map(function (i) { return itemToRow(user.id, i); }));
          })
          .then(function (res) {
            if (res.error) throw toError(res.error);
            return loadAll();
          });
      });
    });
  }

  /* ---------- public API ---------- */

  return {
    /* settings */
    getSettings: getSettings,
    setSetting: setSetting,

    /* lifecycle */
    loadAll: loadAll,
    clearCache: clearCache,
    getLoadedUserId: getLoadedUserId,
    isLoadedFor: isLoadedFor,

    /* reads */
    getItems: getItems,
    getItem: getItem,
    getCategories: getCategories,
    getCategory: getCategory,

    /* writes */
    createItem: createItem,
    updateItem: updateItem,
    removeItem: removeItem,
    createCategory: createCategory,
    updateCategory: updateCategory,
    deleteCategory: deleteCategory,

    /* explicit destructive actions (existing UI features) */
    resetSampleData: resetSampleData,
    clearAllData: clearAllData,

    /* helpers reused by the migration module */
    uid: uid,
    isSampleOnly: isSampleOnly,
    itemToRow: itemToRow,
    categoryToRow: categoryToRow,
    describeError: describeError
  };
})();
