// Tiny i18n helper: t(key) lookups plus data-i18n / data-lang DOM updates
const I18n = (() => {
  let currentLang = localStorage.getItem('omok_lang') || 'en';
  const translations = {};

  function register(lang, data) {
    translations[lang] = data;
  }

  function t(key) {
    return (translations[currentLang] && translations[currentLang][key]) || key;
  }

  function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('omok_lang', lang);
    // Update all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translated = t(key);
      if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
        el.placeholder = translated;
      } else {
        el.textContent = translated;
      }
    });
    // Toggle content page lang divs
    document.querySelectorAll('[data-lang]').forEach(el => {
      el.style.display = el.getAttribute('data-lang') === lang ? '' : 'none';
    });
    // Update lang toggle button
    const btn = document.getElementById('lang-toggle');
    if (btn) btn.textContent = lang === 'en' ? '\uD55C\uAD6D\uC5B4' : 'English';
    // Update html lang attribute
    document.documentElement.lang = lang === 'ko' ? 'ko' : 'en';
  }

  function getLang() { return currentLang; }

  function init() {
    setLang(currentLang);
  }

  return { register, t, setLang, getLang, init };
})();
