// Online play (rooms, hall of fame) runs on Supabase. Everything else works without it.
// The publishable key is meant to be public: what it can do is limited by the policies in setup.sql.
const SUPABASE_URL = 'https://spjyuqxnxpbfofichnpi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ayafJKOzvB3L6fqehyqw1w_RiB1XJjI';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
const SUPABASE_JS_SRI = 'sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok';

// Set by Online.connect() once the server has answered
let db = null;

const Online = (() => {
  let connecting = null;

  function loadLibrary() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SUPABASE_JS;
      if (SUPABASE_JS_SRI) script.integrity = SUPABASE_JS_SRI;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load supabase-js'));
      document.head.appendChild(script);
    });
  }

  function timeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  }

  // One plain request first: supabase-js retries network errors for several seconds,
  // which is too long to keep the lobby saying "checking" when the project is down
  async function serverAnswers() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rooms?select=id&limit=1`, {
        headers: { apikey: SUPABASE_KEY },
        signal: controller.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  }

  // Resolves to a client, or null if online play is unavailable (no config, offline, project paused)
  function connect() {
    if (!connecting) {
      connecting = (async () => {
        if (!SUPABASE_URL || !SUPABASE_KEY) return null;
        try {
          if (!(await serverAnswers())) throw new Error('server did not answer');
          if (!window.supabase) await timeout(loadLibrary(), 8000);
          db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
          return db;
        } catch (e) {
          console.warn('Online play unavailable:', e.message || e);
          return null;
        }
      })();
    }
    return connecting;
  }

  return { connect };
})();

// Which seat this browser holds in a room ('host' or 'guest').
// sessionStorage keeps two tabs of the same browser apart; localStorage survives a closed tab.
// If storage is blocked, the seat travels in the game URL instead.
const Seat = {
  get(code) {
    try {
      const stored = sessionStorage.getItem(`omok_seat_${code}`) || localStorage.getItem(`omok_seat_${code}`);
      if (stored) return stored;
    } catch (e) {
      // fall through to the URL
    }
    const params = new URLSearchParams(window.location.search);
    const seat = params.get('seat');
    return params.get('room') === code && (seat === 'host' || seat === 'guest') ? seat : null;
  },
  set(code, seat) {
    try {
      sessionStorage.setItem(`omok_seat_${code}`, seat);
      localStorage.setItem(`omok_seat_${code}`, seat);
      return true;
    } catch (e) {
      return false;
    }
  },
  // Remember the seat and return the game page URL for the room
  url(code, seat) {
    return `game.html?room=${code}${this.set(code, seat) ? '' : `&seat=${seat}`}`;
  },
};

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
