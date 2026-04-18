function setLang(l) {
  document.body.classList.toggle('fr', l === 'fr');
  document.querySelectorAll('#tg-lang button').forEach((b, i) => {
    b.classList.toggle('on', i === (l === 'fr' ? 1 : 0));
  });
  localStorage.setItem('s-lang', l);
}

function setMode(m) {
  document.body.classList.toggle('simple', m === 'simple');
  document.querySelectorAll('#tg-mode button').forEach((b, i) => {
    b.classList.toggle('on', i === (m === 'simple' ? 1 : 0));
  });
  localStorage.setItem('s-mode', m);
}

// Restore saved preferences
if (localStorage.getItem('s-lang') === 'fr') setLang('fr');
if (localStorage.getItem('s-mode') === 'simple') setMode('simple');

// Initialize Lucide icons
lucide.createIcons();
