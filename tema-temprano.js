// Aplica la temática y la preferencia de animaciones antes de pintar (evita parpadeos).
try {
  var d = document.documentElement;
  var t = localStorage.getItem('tema');
  if (t) d.dataset.tema = t;
  var a = localStorage.getItem('anim');
  if (a === '1') d.classList.add('sin-anim'); // solo si la persona lo eligió en Perfil
} catch (e) { /* sin almacenamiento */ }
