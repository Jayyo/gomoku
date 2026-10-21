// Nav controls shared by every page: language and sound toggles
document.addEventListener('DOMContentLoaded', () => {
  I18n.init();

  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      I18n.setLang(I18n.getLang() === 'en' ? 'ko' : 'en');
    });
  }

  const soundBtn = document.getElementById('sound-toggle');
  if (soundBtn && typeof Sound !== 'undefined') {
    const render = () => {
      soundBtn.textContent = Sound.isEnabled() ? '🔊' : '🔇';
    };
    render();
    soundBtn.addEventListener('click', () => {
      Sound.toggle();
      render();
    });
  } else if (soundBtn) {
    soundBtn.remove();
  }
});
