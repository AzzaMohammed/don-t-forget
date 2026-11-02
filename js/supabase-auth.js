/* =========================================================
   Don't Forget — supabase-auth.js
   Supabase Auth layer: client init + auth calls + friendly
   error messages. Uses ONLY the Publishable (anon) key.
   Data (items/categories) stays in localStorage for now.
   ========================================================= */

window.Auth = (function () {
  'use strict';

  /* ---------- configuration (frontend-safe keys only) ---------- */

  var SUPABASE_URL = 'https://vmrxtelmkdbukfohhuhp.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_78s3527J0P1cQZjiT_o3JQ_ad2j7iae';

  var client = null;
  var currentSession = null;

  if (window.supabase && typeof window.supabase.createClient === 'function') {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,   // keep the user signed in after refresh
        autoRefreshToken: true, // refresh expiring tokens silently
        detectSessionInUrl: true // pick up password-recovery links
      }
    });

    client.auth.getSession().then(function (res) {
      if (res && res.data && res.data.session) {
        currentSession = res.data.session;
      }
    }).catch(function () {});

    client.auth.onAuthStateChange(function (event, session) {
      currentSession = session || null;
    });
  }

  /* ---------- helpers ---------- */

  function redirectUrl() {
    // Only send a redirect for real http(s) hosts (works on localhost).
    if (/^https?:\/\//i.test(window.location.origin)) {
      return window.location.origin;
    }
    return undefined;
  }

  /* Turn Supabase auth errors into clear, user-friendly messages. */
  function friendlyError(err) {
    var msg = (err && err.message) || String(err || '');

    if (/invalid login credentials/i.test(msg)) {
      return 'Incorrect email or password. Please try again.';
    }
    if (/email not confirmed/i.test(msg)) {
      return 'Please confirm your email address first, then sign in.';
    }
    if (/already (been )?registered|already exists/i.test(msg)) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (/password should be at least/i.test(msg)) {
      return 'Password must be at least 6 characters long.';
    }
    if (/valid email/i.test(msg)) {
      return 'Please enter a valid email address.';
    }
    if (/rate limit|too many/i.test(msg)) {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    if (/user .* not found/i.test(msg)) {
      return 'No account found with this email address.';
    }
    if (/same password/i.test(msg)) {
      return 'New password must be different from your current password.';
    }
    if (/session .* missing|not authenticated|refresh token|invalid claim/i.test(msg)) {
      return 'Your reset link has expired or is invalid. Please request a new one.';
    }
    if (/fetch|network|load failed/i.test(msg)) {
      return 'Network error — check your internet connection and try again.';
    }
    return msg || 'Something went wrong. Please try again.';
  }

  /* ---------- public API ---------- */

  function isReady() { return !!client; }

  function getSession() {
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(function (res) {
      if (res && res.data && res.data.session) {
        currentSession = res.data.session;
      }
      return res && res.data ? res.data.session : null;
    }).catch(function () { return null; });
  }

  function getUser() {
    if (!client) return Promise.resolve(null);
    return client.auth.getUser().then(function (res) {
      return res && res.data ? res.data.user : null;
    }).catch(function () { return null; });
  }

  /* returns { error } — error is a friendly string (or null on success) */
  function signIn(email, password) {
    if (!client) return Promise.resolve({ error: 'Auth library failed to load.' });
    return client.auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        return { error: res.error ? friendlyError(res.error) : null };
      })
      .catch(function (e) { return { error: friendlyError(e) }; });
  }

  /* returns { error, needsEmailConfirm } */
  function signUp(email, password) {
    if (!client) return Promise.resolve({ error: 'Auth library failed to load.', needsEmailConfirm: false });
    return client.auth.signUp({ email: email, password: password })
      .then(function (res) {
        if (res.error) return { error: friendlyError(res.error), needsEmailConfirm: false };
        // If email confirmation is ON, Supabase returns no session.
        var needsConfirm = !res.data || !res.data.session;
        return { error: null, needsEmailConfirm: needsConfirm };
      })
      .catch(function (e) { return { error: friendlyError(e), needsEmailConfirm: false }; });
  }

  /* returns { error } */
  function sendReset(email) {
    if (!client) return Promise.resolve({ error: 'Auth library failed to load.' });
    return client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() })
      .then(function (res) {
        return { error: res.error ? friendlyError(res.error) : null };
      })
      .catch(function (e) { return { error: friendlyError(e) }; });
  }

  /* returns { error } — used after clicking a password-recovery link */
  function updatePassword(newPassword) {
    if (!client) return Promise.resolve({ error: 'Auth library failed to load.' });
    return client.auth.updateUser({ password: newPassword })
      .then(function (res) {
        return { error: res.error ? friendlyError(res.error) : null };
      })
      .catch(function (e) { return { error: friendlyError(e) }; });
  }

  /* returns { error } */
  function signOut() {
    if (!client) return Promise.resolve({ error: 'Auth library failed to load.' });
    return client.auth.signOut()
      .then(function (res) {
        return { error: res.error ? friendlyError(res.error) : null };
      })
      .catch(function (e) { return { error: friendlyError(e) }; });
  }

  /* subscribe(cb) — cb(event, session); events: SIGNED_IN, SIGNED_OUT,
     PASSWORD_RECOVERY, TOKEN_REFRESHED, USER_UPDATED */
  function subscribe(cb) {
    if (!client) return;
    client.auth.onAuthStateChange(function (event, session) {
      cb(event, session);
    });
  }

  function getUserEmail() {
    if (currentSession && currentSession.user && currentSession.user.email) {
      return currentSession.user.email;
    }
    return '';
  }

  /* getClient() — exposes the single existing client so the data layer
     can use it. Never creates a second client. */
  function getClient() {
    return client;
  }

  return {
    isReady: isReady,
    getClient: getClient,
    getSession: getSession,
    getUser: getUser,
    signIn: signIn,
    signUp: signUp,
    sendReset: sendReset,
    updatePassword: updatePassword,
    signOut: signOut,
    subscribe: subscribe,
    getUserEmail: getUserEmail
  };
})();
