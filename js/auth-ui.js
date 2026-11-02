/* =========================================================
   Don't Forget — auth-ui.js
   Login / Sign Up / Forgot password screens + session gating.
   Shows the app shell only for signed-in users, keeps the
   session after refresh, and dispatches auth:* events that
   app.js listens to for the first render.
   ========================================================= */

window.AuthUI = (function () {
  'use strict';

  var VIEWS = {
    signin: '#signInForm',
    signup: '#signUpForm',
    forgot: '#forgotForm',
    reset: '#resetForm'
  };

  var currentView = 'signin';
  var toastTimer = null;

  /* ---------- tiny helpers ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
    }
  }

  function toast(message) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () { el.hidden = true; }, 250);
    }, 2400);
  }

  /* ---------- alerts & buttons ---------- */

  function showAlert(sel, message, isSuccess) {
    var el = $(sel);
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.textContent = message;
    el.classList.toggle('auth-alert-success', !!isSuccess);
    el.hidden = false;
  }

  function clearAlerts() {
    ['#signInAlert', '#signUpAlert', '#signUpSuccess',
      '#forgotAlert', '#forgotSuccess', '#resetAlert'
    ].forEach(function (sel) { showAlert(sel, ''); });
  }

  function setBusy(btn, busy, busyLabel) {
    if (!btn) return;
    if (busy) {
      btn.setAttribute('data-label', btn.textContent);
      btn.disabled = true;
      btn.textContent = busyLabel;
    } else {
      btn.disabled = false;
      var label = btn.getAttribute('data-label');
      if (label) btn.textContent = label;
    }
  }

  /* ---------- views ---------- */

  function showView(name) {
    if (!VIEWS[name]) name = 'signin';
    currentView = name;

    Object.keys(VIEWS).forEach(function (key) {
      var form = $(VIEWS[key]);
      if (form) form.hidden = key !== name;
    });

    $$('.auth-tab').forEach(function (tab) {
      tab.classList.toggle('is-active', tab.getAttribute('data-auth-view') === name);
    });

    clearAlerts();
    refreshIcons();

    var form = $(VIEWS[name]);
    if (form) {
      var input = form.querySelector('input');
      if (input) setTimeout(function () { input.focus(); }, 60);
    }
  }

  /* ---------- screen switching ---------- */

  function hideAppShell() {
    var shell = $('.app-shell');
    if (shell) shell.hidden = true;
    $$('.modal-backdrop').forEach(function (m) { m.hidden = true; });
    document.body.classList.remove('modal-open', 'sidebar-open');
  }

  function showAuth(view) {
    document.body.classList.remove('is-authenticated');
    setLoading(false);
    var screen = $('#authScreen');
    if (screen) screen.hidden = false;
    hideAppShell();
    showView(view || 'signin');
    refreshIcons();
  }

  /* ---------- cloud loading overlay ---------- */

  function setLoading(state, message) {
    var el = $('#appLoading');
    if (!el) return;

    if (!state) {
      el.hidden = true;
      return;
    }

    var text = $('#appLoadingText');
    var actions = $('#appLoadingActions');
    var spinner = $('#appSpinner');

    el.hidden = false;
    if (state === 'error') {
      if (spinner) spinner.classList.add('is-hidden');
      if (actions) actions.hidden = false;
      if (text) text.textContent = message || 'Could not load your library.';
    } else {
      if (spinner) spinner.classList.remove('is-hidden');
      if (actions) actions.hidden = true;
      if (text) text.textContent = message || 'Loading your library…';
    }
    refreshIcons();
  }

  function enterApp(session) {
    var wasAuth = document.body.classList.contains('is-authenticated');

    document.body.classList.add('is-authenticated');
    setLoading(false);
    var screen = $('#authScreen');
    if (screen) screen.hidden = true;
    var shell = $('.app-shell');
    if (shell) shell.hidden = false;

    var email = (session && session.user && session.user.email) || '';
    var emailEl = $('#userEmail');
    if (emailEl) emailEl.textContent = email || 'Signed in';

    refreshIcons();

    // Only signal app.js on real transitions (not on duplicate events).
    if (!wasAuth) {
      window.dispatchEvent(new CustomEvent('auth:signed-in', { detail: { email: email } }));
    }
  }

  /* Load the signed-in user's cloud data BEFORE showing the dashboard.
     The app shell is only revealed (and auth:signed-in dispatched) once
     the data is in memory, so the dashboard never flashes empty or with
     another account's data. */
  function openApp(session) {
    if (!session || !session.user || !session.user.id) {
      showAuth('signin');
      return Promise.resolve(false);
    }

    var userId = session.user.id;

    if (window.Storage && typeof window.Storage.isLoadedFor === 'function' &&
        window.Storage.isLoadedFor(userId)) {
      enterApp(session);
      return Promise.resolve(true);
    }

    if (window.Storage && typeof window.Storage.clearCache === 'function') {
      var previous = typeof window.Storage.getLoadedUserId === 'function'
        ? window.Storage.getLoadedUserId()
        : null;
      if (previous && previous !== userId) window.Storage.clearCache();
    }

    setLoading('loading');

    if (!window.Storage || typeof window.Storage.loadAll !== 'function') {
      setLoading('error', 'The data layer failed to load. Reload the page and try again.');
      return Promise.resolve(false);
    }

    return window.Storage.loadAll().then(function () {
      enterApp(session);
      return true;
    }).catch(function (err) {
      // Never fall back to sample data: show the error and offer a retry.
      setLoading('error', (err && err.message) || 'Could not load your library.');
      return false;
    });
  }

  function retryLoad() {
    Auth.getSession().then(function (session) {
      if (session) openApp(session);
      else showAuth('signin');
    });
  }

  /* ---------- helpers ---------- */

  function isRecoveryUrl() {
    var hash = window.location.hash || '';
    return hash.indexOf('type=recovery') >= 0 || hash.indexOf('access_token') >= 0;
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  /* ---------- form handlers ---------- */

  function onSubmitSignIn(event) {
    event.preventDefault();
    clearAlerts();

    var email = $('#siEmail').value.trim();
    var password = $('#siPassword').value;

    if (!validEmail(email)) {
      showAlert('#signInAlert', 'Please enter a valid email address.');
      return;
    }
    if (!password) {
      showAlert('#signInAlert', 'Please enter your password.');
      return;
    }

    var btn = $('#signInBtn');
    setBusy(btn, true, 'Signing in…');

    Auth.signIn(email, password).then(function (res) {
      setBusy(btn, false);
      if (res.error) {
        showAlert('#signInAlert', res.error);
        return;
      }
      return Auth.getSession().then(function (session) {
        if (session) openApp(session);
      });
    });
  }

  function onSubmitSignUp(event) {
    event.preventDefault();
    clearAlerts();

    var email = $('#suEmail').value.trim();
    var password = $('#suPassword').value;
    var confirm = $('#suPassword2').value;

    if (!validEmail(email)) {
      showAlert('#signUpAlert', 'Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      showAlert('#signUpAlert', 'Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirm) {
      showAlert('#signUpAlert', 'Passwords do not match.');
      return;
    }

    var btn = $('#signUpBtn');
    setBusy(btn, true, 'Creating account…');

    Auth.signUp(email, password).then(function (res) {
      setBusy(btn, false);
      if (res.error) {
        showAlert('#signUpAlert', res.error);
        return;
      }

      // Email confirmation ON -> no session yet; tell the user to confirm.
      if (res.needsEmailConfirm) {
        showAlert('#signUpSuccess',
          'Account created! Check your email to confirm your address, then sign in.', true);
        return;
      }

      return Auth.getSession().then(function (session) {
        if (session) {
          openApp(session);
        } else {
          showAlert('#signUpSuccess', 'Account created! You can sign in now.', true);
        }
      });
    });
  }

  function onSubmitForgot(event) {
    event.preventDefault();
    clearAlerts();

    var email = $('#fpEmail').value.trim();
    if (!validEmail(email)) {
      showAlert('#forgotAlert', 'Please enter a valid email address.');
      return;
    }

    var btn = $('#forgotBtn');
    setBusy(btn, true, 'Sending…');

    Auth.sendReset(email).then(function (res) {
      setBusy(btn, false);
      if (res.error) {
        showAlert('#forgotAlert', res.error);
        return;
      }
      showAlert('#forgotSuccess',
        'Reset link sent to ' + email + '. Check your inbox.', true);
    });
  }

  function onSubmitReset(event) {
    event.preventDefault();
    clearAlerts();

    var password = $('#npPassword').value;
    var confirm = $('#npPassword2').value;

    if (password.length < 6) {
      showAlert('#resetAlert', 'Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirm) {
      showAlert('#resetAlert', 'Passwords do not match.');
      return;
    }

    var btn = $('#resetBtn');
    setBusy(btn, true, 'Updating…');

    Auth.updatePassword(password).then(function (res) {
      setBusy(btn, false);
      if (res.error) {
        showAlert('#resetAlert', res.error);
        return;
      }
      $('#npPassword').value = '';
      $('#npPassword2').value = '';
      return Auth.getSession().then(function (session) {
        openApp(session);
        toast('Password updated successfully');
      });
    });
  }

  /* ---------- sign out ---------- */

  function doSignOut() {
    // Drop the previous user's data immediately, before the network call.
    if (window.Storage && typeof window.Storage.clearCache === 'function') {
      window.Storage.clearCache();
    }
    setLoading(false);

    Auth.signOut().then(function (res) {
      if (res.error) {
        toast(res.error);
        return;
      }
      showAuth('signin');
      toast('Signed out');
    });
  }

  /* ---------- auth state events ---------- */

  function onAuthEvent(event, session) {
    if (event === 'PASSWORD_RECOVERY') {
      showAuth('reset');
      return;
    }

    if (event === 'SIGNED_OUT') {
      if (window.Storage && typeof window.Storage.clearCache === 'function') {
        window.Storage.clearCache();
      }
      setLoading(false);
      showAuth('signin');
      return;
    }

    if (!session) return;

    // While the user is setting a new password, don't jump into the app.
    if (currentView === 'reset' &&
        (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
      return;
    }

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED') {
      openApp(session);
    }
  }

  /* ---------- init ---------- */

  function init() {
    if (!Auth.isReady()) {
      showAuth('signin');
      showAlert('#signInAlert',
        'Authentication failed to load. Check your connection and reload the page.');
      refreshIcons();
      return;
    }

    Auth.subscribe(onAuthEvent);

    // forms
    $('#signInForm').addEventListener('submit', onSubmitSignIn);
    $('#signUpForm').addEventListener('submit', onSubmitSignUp);
    $('#forgotForm').addEventListener('submit', onSubmitForgot);
    $('#resetForm').addEventListener('submit', onSubmitReset);

    // sign out
    $('#signOutBtn').addEventListener('click', doSignOut);

    // loading overlay recovery actions
    var retryBtn = $('#appRetryBtn');
    if (retryBtn) retryBtn.addEventListener('click', retryLoad);
    var overlaySignOut = $('#appSignOutBtn');
    if (overlaySignOut) overlaySignOut.addEventListener('click', doSignOut);

    // view switcher: tabs and "Forgot password?" / "Back to sign in" links
    document.addEventListener('click', function (event) {
      var el = event.target && event.target.closest
        ? event.target.closest('[data-auth-view]')
        : null;
      if (el) showView(el.getAttribute('data-auth-view'));
    });

    // restore persisted session (keeps the user signed in after refresh)
    Auth.getSession().then(function (session) {
      if (session && isRecoveryUrl()) {
        showAuth('reset');
        return;
      }
      if (session) {
        openApp(session);
      } else {
        showAuth('signin');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    showAuth: showAuth,
    enterApp: enterApp,
    showView: showView
  };
})();
