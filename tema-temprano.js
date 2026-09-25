// Aplica la temática y la preferencia de animaciones antes de pintar (evita parpadeos).
try {
  var d = document.documentElement;
  var t = localStorage.getItem('tema');
  if (t) d.dataset.tema = t;
  var a = localStorage.getItem('anim');
  var reducir = a === null ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : a === '1';
  if (reducir) d.classList.add('sin-anim');
} catch (e) { /* sin almacenamiento */ }
