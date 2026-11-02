/* =========================================================
   Don't Forget — migrate.js
   User-triggered, non-destructive migration of the legacy
   localStorage data (dontforget.items / dontforget.categories)
   into the signed-in user's Supabase account.

   Rules enforced here:
   • Never runs automatically.
   • Reads ONLY the two legacy data keys (never settings/tokens).
   • Never writes to, deletes or clears localStorage.
   • Preserves ids and category relationships; skips ids that
     already exist in the user's account (no overwrite).
   • Stops if an id belongs to another account (23505), without
     revealing anything about that account.
   • Re-runnable: already-imported records are skipped.
   • Reads the imported records back to verify the result.
   ========================================================= */

window.Migrate = (function () {
  'use strict';

  var CAT_KEY = 'dontforget.categories';
  var ITEM_KEY = 'dontforget.items';

  var TYPES = ['website', 'video', 'article', 'other'];
  var PRIORITIES = ['low', 'normal', 'high'];

  /* ---------- helpers ---------- */

  function sb() {
    return window.Auth && typeof window.Auth.getClient === 'function'
      ? window.Auth.getClient()
      : null;
  }

  function requireUser() {
    if (!window.Auth || typeof window.Auth.getSession !== 'function') {
      return Promise.reject(new Error('Authentication is unavailable. Reload the page.'));
    }
    return window.Auth.getSession().then(function (session) {
      if (!session || !session.user || !session.user.id) {
        throw new Error('Your session expired. Please sign in again.');
      }
      return session.user;
    });
  }

  function describe(err) {
    if (window.Storage && typeof window.Storage.describeError === 'function') {
      return window.Storage.describeError(err);
    }
    return (err && err.message) || 'Something went wrong.';
  }

  function readArray(key, label) {
    var raw;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      return { error: 'Browser storage is unavailable, so your local data cannot be read.' };
    }
    if (raw === null || raw === undefined || raw === '') {
      return { present: false, value: [] };
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { error: 'Your saved ' + label + ' in this browser are not valid JSON, so nothing was changed.' };
    }
    if (!Array.isArray(parsed)) {
      return { error: 'Your saved ' + label + ' in this browser have an unexpected format, so nothing was changed.' };
    }
    return { present: true, value: parsed };
  }

  function asString(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function normalizeTags(value) {
    var list;
    if (Array.isArray(value)) list = value;
    else if (typeof value === 'string') list = value.split(',');
    else list = [];
    return list.map(function (t) { return asString(t).trim(); }).filter(Boolean);
  }

  function normalizeDate(value) {
    var str = asString(value).trim();
    if (!str) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    return '';
  }

  function normalizeIso(value) {
    var str = asString(value).trim();
    if (!str) return new Date().toISOString();
    var time = Date.parse(str);
    if (isNaN(time)) return new Date().toISOString();
    return new Date(time).toISOString();
  }

  /* ---------- validation / preview ---------- */

  function preview() {
    var catRead = readArray(CAT_KEY, 'categories');
    if (catRead.error) return { ok: false, error: catRead.error };

    var itemRead = readArray(ITEM_KEY, 'items');
    if (itemRead.error) return { ok: false, error: itemRead.error };

    var warnings = [];
    var errors = [];
    var catIds = {};
    var categories = [];

    catRead.value.forEach(function (raw, index) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push('Category #' + (index + 1) + ' is not a valid record.');
        return;
      }
      var id = asString(raw.id).trim();
      if (!id) {
        errors.push('Category #' + (index + 1) + ' has no id.');
        return;
      }
      if (catIds[id]) {
        errors.push('Category id "' + id + '" appears more than once in your browser data.');
        return;
      }
      var name = asString(raw.name).trim();
      if (!name) {
        warnings.push('Category "' + id + '" has no name and will be skipped.');
        return;
      }
      catIds[id] = true;
      categories.push({
        id: id,
        name: name,
        color: /^#[0-9a-fA-F]{3,8}$/.test(asString(raw.color)) ? asString(raw.color) : '#a97c50',
        createdAt: ''
      });
    });

    var itemIds = {};
    var items = [];

    itemRead.value.forEach(function (raw, index) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push('Item #' + (index + 1) + ' is not a valid record.');
        return;
      }
      var id = asString(raw.id).trim();
      if (!id) {
        errors.push('Item #' + (index + 1) + ' has no id.');
        return;
      }
      if (itemIds[id]) {
        errors.push('Item id "' + id + '" appears more than once in your browser data.');
        return;
      }
      var title = asString(raw.title).trim();
      if (!title) {
        warnings.push('Item "' + id + '" has no title and will be skipped.');
        return;
      }
      itemIds[id] = true;

      var type = asString(raw.type);
      if (TYPES.indexOf(type) < 0) type = 'website';
      var priority = asString(raw.priority);
      if (PRIORITIES.indexOf(priority) < 0) priority = 'normal';

      var categoryId = asString(raw.categoryId).trim();
      if (categoryId && !catIds[categoryId]) {
        warnings.push('Item "' + title + '" points to a category that is not in your browser data.');
        categoryId = '';
      }

      items.push({
        id: id,
        title: title,
        url: asString(raw.url),
        description: asString(raw.description),
        type: type,
        categoryId: categoryId,
        tags: normalizeTags(raw.tags),
        priority: priority,
        reviewDate: normalizeDate(raw.reviewDate),
        favorite: !!raw.favorite,
        archived: !!raw.archived,
        lastReviewed: normalizeDate(raw.lastReviewed),
        createdAt: normalizeIso(raw.createdAt)
      });
    });

    if (errors.length) {
      return { ok: false, error: errors[0], errors: errors };
    }

    var sampleOnly = window.Storage && typeof window.Storage.isSampleOnly === 'function'
      ? window.Storage.isSampleOnly(categories, items)
      : false;

    return {
      ok: true,
      categories: categories,
      items: items,
      counts: { categories: categories.length, items: items.length },
      warnings: warnings,
      sampleOnly: sampleOnly,
      hasLocalData: catRead.present || itemRead.present
    };
  }

  /* ---------- database helpers ---------- */

  function isDuplicateId(err) {
    if (!err) return false;
    var code = String(err.code || '');
    var msg = String(err.message || '');
    return code === '23505' || /duplicate key|already exists/i.test(msg);
  }

  function selectOwnIds(client, table, userId) {
    return client.from(table).select('id').eq('user_id', userId).then(function (res) {
      if (res.error) throw res.error;
      var set = {};
      (res.data || []).forEach(function (row) { set[String(row.id)] = true; });
      return set;
    });
  }

  function insertRow(client, table, row) {
    return client.from(table).insert(row).then(function (res) {
      return res.error ? { error: res.error } : { ok: true };
    });
  }

  function chunk(list, size) {
    var out = [];
    for (var i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  function verifyIds(client, table, userId, ids) {
    if (!ids.length) return Promise.resolve(0);
    var groups = chunk(ids, 100);
    var found = {};

    return groups.reduce(function (chain, group) {
      return chain.then(function () {
        return client.from(table)
          .select('id')
          .eq('user_id', userId)
          .in('id', group)
          .then(function (res) {
            if (res.error) throw res.error;
            (res.data || []).forEach(function (row) { found[String(row.id)] = true; });
          });
      });
    }, Promise.resolve()).then(function () {
      return ids.filter(function (id) { return found[id]; }).length;
    });
  }

  /* ---------- run ---------- */

  function run(onProgress) {
    var report = function (message) {
      if (typeof onProgress === 'function') {
        try { onProgress(message); } catch (e) { /* ignore UI errors */ }
      }
    };

    var checked = preview();
    if (!checked.ok) {
      return Promise.reject(new Error(checked.error));
    }
    if (checked.sampleOnly) {
      return Promise.reject(new Error(
        'Your browser only contains the built-in sample data. Sample data is not migrated. ' +
        'Add your own items first, then try again.'));
    }
    if (!checked.counts.categories && !checked.counts.items) {
      return Promise.reject(new Error('No local categories or items were found in this browser.'));
    }

    var client = sb();
    if (!client) {
      return Promise.reject(new Error('Cloud sync is unavailable. Reload the page and sign in again.'));
    }

    var user = null;
    var ownCategoryIds = {};
    var ownItemIds = {};
    var importedCategoryIds = [];
    var importedItemIds = [];

    var result = {
      blocked: false,
      blockedMessage: '',
      importedCategories: 0,
      importedItems: 0,
      skippedCategories: 0,
      skippedItems: 0,
      failedCategories: 0,
      failedItems: 0,
      verifiedCategories: 0,
      verifiedItems: 0,
      warnings: checked.warnings.slice(),
      errors: [],
      totalCategories: checked.counts.categories,
      totalItems: checked.counts.items
    };

    report('Checking your account…');

    return requireUser()
      .then(function (sessionUser) {
        user = sessionUser;
        return selectOwnIds(client, 'categories', user.id);
      })
      .then(function (catIds) {
        ownCategoryIds = catIds;
        return selectOwnIds(client, 'items', user.id);
      })
      .then(function (itemIds) {
        ownItemIds = itemIds;

        /* --- categories first --- */
        report('Importing categories…');
        return checked.categories.reduce(function (chain, cat) {
          return chain.then(function () {
            if (result.blocked) return;

            if (ownCategoryIds[cat.id]) {
              result.skippedCategories++;
              return;
            }

            return insertRow(client, 'categories',
              window.Storage.categoryToRow(user.id, cat)
            ).then(function (res) {
              if (!res.error) {
                result.importedCategories++;
                importedCategoryIds.push(cat.id);
                ownCategoryIds[cat.id] = true;
                return;
              }
              if (isDuplicateId(res.error)) {
                result.blocked = true;
                result.blockedMessage =
                  'An id conflict was found: one of your local categories already belongs to a different account. ' +
                  'Nothing else was imported. No data from the other account was read or changed.';
                return;
              }
              result.failedCategories++;
              result.errors.push('Category "' + cat.name + '": ' + describe(res.error));
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        if (result.blocked) return;

        /* --- then items --- */
        report('Importing items…');
        return checked.items.reduce(function (chain, item) {
          return chain.then(function () {
            if (result.blocked) return;

            if (ownItemIds[item.id]) {
              result.skippedItems++;
              return;
            }

            var categoryId = item.categoryId;
            if (categoryId && !ownCategoryIds[categoryId]) {
              categoryId = '';
              result.warnings.push('Item "' + item.title + '" was imported without a category.');
            }

            var row = window.Storage.itemToRow(user.id, {
              id: item.id,
              title: item.title,
              url: item.url,
              description: item.description,
              type: item.type,
              categoryId: categoryId,
              tags: item.tags,
              priority: item.priority,
              reviewDate: item.reviewDate,
              favorite: item.favorite,
              archived: item.archived,
              lastReviewed: item.lastReviewed,
              createdAt: item.createdAt
            });

            return insertRow(client, 'items', row).then(function (res) {
              if (!res.error) {
                result.importedItems++;
                importedItemIds.push(item.id);
                ownItemIds[item.id] = true;
                return;
              }
              if (isDuplicateId(res.error)) {
                result.blocked = true;
                result.blockedMessage =
                  'An id conflict was found: one of your local items already belongs to a different account. ' +
                  'Nothing else was imported. No data from the other account was read or changed.';
                return;
              }
              result.failedItems++;
              result.errors.push('Item "' + item.title + '": ' + describe(res.error));
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        if (result.blocked) return;

        /* --- read back to verify --- */
        report('Verifying imported records…');
        return verifyIds(client, 'categories', user.id, importedCategoryIds)
          .then(function (count) {
            result.verifiedCategories = count;
            return verifyIds(client, 'items', user.id, importedItemIds);
          })
          .then(function (count) {
            result.verifiedItems = count;
          })
          .catch(function (err) {
            result.warnings.push('Could not verify the import: ' + describe(err));
          });
      })
      .then(function () {
        if (window.Storage && typeof window.Storage.loadAll === 'function') {
          return window.Storage.loadAll().catch(function () { /* keep the report */ });
        }
        return null;
      })
      .then(function () {
        return result;
      });
  }

  return {
    preview: preview,
    run: run
  };
})();
