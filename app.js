// =============================================
//  Nosotros - App de parejas (Fase 1)
// =============================================
const SUPABASE_URL = 'https://kupwqulxzsgupyowpsnd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8DiVJX0CTBUtmPUnu3ihvw_aOgWsjpz';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'recuerdos';
const CODIGO_ACCESO = '30082026';
const FECHA_INICIO = '2026-08-30'; // fecha fija del noviazgo (30/08/2026)
const MAX_MB = 50;

const $ = (id) => document.getElementById(id);

// =============================================
//  CONSENTIMIENTO DE COOKIES Y ALMACENAMIENTO
// =============================================
const CONSENT_KEY = 'consentimiento_v1';
const CONSENT_MESES = 12;
const TERMINOS_V = '2026-09-24';

function leerConsent() {
  try {
    const c = JSON.parse(localStorage.getItem(CONSENT_KEY));
    if (!c || !c.fecha) return null;
    const meses = (Date.now() - new Date(c.fecha).getTime()) / (30 * 864e5);
    return meses > CONSENT_MESES ? null : c;
  } catch (_) { return null; }
}
let consent = leerConsent();

const puedePreferencias = () => !!(consent && consent.prefs);
const puedeTerceros = () => !!(consent && consent.terceros);

function guardarPref(clave, valor) {
  if (!puedePreferencias()) return;
  try { localStorage.setItem(clave, valor); } catch (_) { /* sin almacenamiento */ }
}
function borrarPrefs() {
  try { localStorage.removeItem('tema'); localStorage.removeItem('anim'); } catch (_) { /* sin almacenamiento */ }
}

function guardarConsent(c) {
  consent = { prefs: !!c.prefs, terceros: !!c.terceros, fecha: new Date().toISOString(), v: 1 };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(consent)); } catch (_) { /* sin almacenamiento */ }
  if (consent.prefs) {
    guardarPref('tema', document.documentElement.dataset.tema || 'rosa');
    guardarPref('anim', document.documentElement.classList.contains('sin-anim') ? '1' : '0');
  } else {
    borrarPrefs();
  }
  $('cookies').classList.add('oculto');
  try { if (musicaCargada) pintarMusica(urlCancion()); } catch (_) { /* aún no se carga */ }
}

function mostrarCookies(personalizar) {
  $('ck-pref').checked = puedePreferencias();
  $('ck-terc').checked = puedeTerceros();
  $('ck-prefs').classList.toggle('oculto', !personalizar);
  $('ck-personalizar').textContent = personalizar ? 'Guardar mi elección' : 'Personalizar';
  $('cookies').classList.remove('oculto');
  $('ck-titulo').focus?.();
}

$('ck-aceptar').addEventListener('click', () => guardarConsent({ prefs: true, terceros: true }));
$('ck-rechazar').addEventListener('click', () => guardarConsent({ prefs: false, terceros: false }));
$('ck-personalizar').addEventListener('click', () => {
  if ($('ck-prefs').classList.contains('oculto')) mostrarCookies(true);
  else guardarConsent({ prefs: $('ck-pref').checked, terceros: $('ck-terc').checked });
});
document.querySelectorAll('[data-accion="cookies"]').forEach((b) => {
  b.addEventListener('click', () => mostrarCookies(true));
});
if (!consent) mostrarCookies(false);

// ---------- Aceptación de términos ----------
function terminosAceptados() {
  try { return localStorage.getItem('terminos_aceptados') === TERMINOS_V; } catch (_) { return false; }
}
function prepararTerminos() {
  const ya = terminosAceptados();
  $('auth-terminos-fila').classList.toggle('oculto', ya);
  $('auth-terminos').required = !ya;
}
prepararTerminos();

// ---------- Menos animaciones ----------
$('pref-anim').checked = document.documentElement.classList.contains('sin-anim');
$('pref-anim').addEventListener('change', (e) => {
  document.documentElement.classList.toggle('sin-anim', e.target.checked);
  guardarPref('anim', e.target.checked ? '1' : '0');
});

// ---------- Estado ----------
let usuario = null;
let perfil = null;
let pareja = null;
let perfiles = {};        // id -> nombre
let animos = {};          // id -> { animo, animo_en }
let fotos = {};           // id -> URL firmada de la foto de perfil
let canal = null;
let archivoSel = null;
let vistaActual = 'inicio';
let postsCache = [];      // publicaciones cargadas (para el recuerdo al azar)
let reloj = null;         // intervalo del contador en vivo
let ultimoAzar = null;
let sesionActual;         // para no cargar dos veces

// ---------- Utilidades ----------
function mostrar(nombre) {
  document.querySelectorAll('.pantalla').forEach((p) => {
    p.classList.toggle('activa', p.id === 'pantalla-' + nombre);
  });
}

function traducir(error) {
  const m = (error && error.message) || String(error);
  if (m.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('Email not confirmed')) return 'Primero confirma tu correo (revisa tu bandeja o spam).';
  if (m.includes('already registered')) return 'Ese correo ya tiene una cuenta. Usa "Entrar".';
  if (m.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.';
  if (m.includes('exceeded the maximum allowed size')) return `El archivo pesa más de ${MAX_MB} MB.`;
  return m;
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function dia(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Cada quien tiene su color: Benjamin verde, Alondra morado
const COLOR_PERSONA = {
  benjamin: { hex: '#18844a', claro: '#2fbf71', corazon: '💚' },
  alondra: { hex: '#7c4dc4', claro: '#ad86e6', corazon: '💜' },
};

function colorDe(id) {
  return COLOR_PERSONA[(perfiles[id] || '').toLowerCase()] || null;
}

function nombreDe(id) {
  return perfiles[id] || 'Tu pareja';
}

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// =============================================
//  AUTENTICACIÓN
// =============================================
// Usuarios permitidos (código de acceso, luego nombre y contraseña)
const USUARIOS = {
  benjamin: { nombre: 'Benjamin', email: 'benjamin@nosotros.app', admin: true },
  alondra: { nombre: 'Alondra', email: 'alondra@nosotros.app', admin: false },
};
let desbloqueado = false;
let esAdmin = false;
let ultimaActividad = Date.now();

$('form-codigo').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('input-acceso').value.trim() !== CODIGO_ACCESO) {
    $('codigo-msg').textContent = 'Código incorrecto.';
    $('input-acceso').value = '';
    return;
  }
  desbloqueado = true;
  ultimaActividad = Date.now();
  $('input-acceso').value = '';
  $('codigo-msg').textContent = '';
  $('codigo-sub').textContent = 'Escribe el código para entrar';
  // Si la app ya estaba cargada (solo se había bloqueado), se vuelve directo sin recargar nada
  if (usuario && pareja) {
    mostrar('app');
    return;
  }
  const { data } = await sb.auth.getSession();
  iniciar(data.session);
});

$('form-auth').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!terminosAceptados()) {
    if (!$('auth-terminos').checked) {
      $('auth-msg').textContent = 'Para entrar debes aceptar los Términos y el Aviso de privacidad.';
      return;
    }
    try { localStorage.setItem('terminos_aceptados', TERMINOS_V); } catch (_) { /* sin almacenamiento */ }
  }
  const clave = $('auth-usuario').value.trim().toLowerCase();
  const u = USUARIOS[clave];
  if (!u) {
    $('auth-msg').textContent = 'Ese usuario no tiene acceso.';
    return;
  }
  const btn = $('btn-auth');
  btn.disabled = true;
  $('auth-msg').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: u.email, password: $('auth-pass').value });
  if (error) {
    $('auth-msg').textContent = traducir(error);
  }
  btn.disabled = false;
});

sb.auth.onAuthStateChange((_evento, session) => {
  const id = session?.user?.id ?? null;
  if (id === sesionActual) return;
  sesionActual = id;
  setTimeout(() => iniciar(session), 0);
});

async function iniciar(session) {
  limpiar();
  if (!desbloqueado) {
    mostrar('codigo');
    return;
  }
  if (!session) {
    mostrar('auth');
    return;
  }
  usuario = session.user;
  const ok = await cargarPerfil();
  if (!ok) return;
  if (!perfil.pareja_id) mostrar('vincular');
  else await entrarApp();
}

async function cargarPerfil() {
  const { data, error } = await sb.from('perfiles').select('*').eq('id', usuario.id).single();
  if (error) {
    mostrar('auth');
    $('auth-msg').textContent = 'No se pudo cargar tu perfil: ' + traducir(error);
    return false;
  }
  perfil = data;
  const u = Object.values(USUARIOS).find((x) => x.email === usuario.email);
  esAdmin = !!(u && u.admin);
  if (u && perfil.nombre !== u.nombre) {
    await sb.from('perfiles').update({ nombre: u.nombre }).eq('id', usuario.id);
    perfil.nombre = u.nombre;
  }
  return true;
}

function limpiar() {
  if (canal) { sb.removeChannel(canal); canal = null; }
  if (reloj) { clearInterval(reloj); reloj = null; }
  postsCache = [];
  usuario = perfil = pareja = null;
  perfiles = {};
  animos = {};
  fotos = {};
  $('lista-publicaciones').replaceChildren();
  planes = [];
  $('lista-planes').replaceChildren();
  quitarArchivo();
  codigoCreado = false;
  $('btn-crear-codigo').textContent = 'Crear código';
  $('codigo-creado').classList.add('oculto');
  $('vincular-msg').textContent = '';
  $('input-codigo').value = '';
}

document.querySelectorAll('[data-accion="salir"]').forEach((b) => {
  b.addEventListener('click', () => sb.auth.signOut());
});

// =============================================
//  VINCULAR PAREJA
// =============================================
let codigoCreado = false;

$('btn-crear-codigo').addEventListener('click', async () => {
  if (codigoCreado) {
    await cargarPerfil();
    await entrarApp();
    return;
  }
  const btn = $('btn-crear-codigo');
  btn.disabled = true;
  const { data, error } = await sb.rpc('crear_pareja');
  btn.disabled = false;
  if (error) {
    $('vincular-msg').textContent = traducir(error);
    return;
  }
  codigoCreado = true;
  $('codigo-creado').textContent = data;
  $('codigo-creado').classList.remove('oculto');
  $('vincular-msg').textContent = 'Comparte este código con tu pareja para que lo escriba en su cuenta.';
  btn.textContent = 'Continuar →';
});

$('form-unirse').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = $('input-codigo').value.trim().toUpperCase();
  const { error } = await sb.rpc('unirse_pareja', { p_codigo: codigo });
  if (error) {
    $('vincular-msg').textContent = traducir(error);
    return;
  }
  await cargarPerfil();
  await entrarApp();
});

// =============================================
//  APP PRINCIPAL
// =============================================
async function entrarApp() {
  const { data, error } = await sb.from('parejas').select('*').eq('id', perfil.pareja_id).single();
  if (error) {
    $('vincular-msg').textContent = traducir(error);
    mostrar('vincular');
    return;
  }
  pareja = data;
  pareja.fecha_inicio = FECHA_INICIO;
  revisarRacha();
  await cargarPerfiles();
  llenarPerfil();
  mostrar('app');
  cambiarVista('inicio');
  pintarInicio();
  await Promise.all([cargarPublicaciones(), cargarPlanes()]);
  cargarStats();
  mostrarRecuerdoAzar();
  suscribir();
  alEntrarApp();
}

async function cargarPerfiles() {
  const { data } = await sb.from('perfiles').select('id, nombre, avatar_path, animo, animo_en');
  perfiles = {};
  animos = {};
  (data || []).forEach((p) => {
    perfiles[p.id] = p.nombre || 'Sin nombre';
    animos[p.id] = { animo: p.animo, animo_en: p.animo_en };
  });
  const rutas = (data || []).filter((p) => p.avatar_path).map((p) => p.avatar_path);
  const urls = await urlsFirmadas(rutas);
  fotos = {};
  (data || []).forEach((p) => { if (urls[p.avatar_path]) fotos[p.id] = urls[p.avatar_path]; });
  if (perfil) perfil.avatar_path = ((data || []).find((p) => p.id === usuario.id) || {}).avatar_path || null;
  const otro = Object.keys(perfiles).find((id) => id !== usuario.id);
  $('titulo-pareja').textContent = otro
    ? `${perfiles[usuario.id]} & ${perfiles[otro]}`
    : 'Esperando a tu pareja…';
  $('perfil-pareja').textContent = otro
    ? `Vinculado con ${perfiles[otro]} 💞`
    : 'Tu pareja aún no se une. Compártele el código de abajo.';

  // Tarjeta de la pareja en Inicio
  const yo = perfiles[usuario.id] || 'Tú';
  $('hero-av-yo').dataset.uid = usuario.id;
  $('hero-av-otro').dataset.uid = otro || '';
  $('perfil-avatar').dataset.uid = usuario.id;
  $('hero-nombre-yo').textContent = yo;
  $('hero-nombre-otro').textContent = otro ? perfiles[otro] : 'Esperando…';
  refrescarAvatares();
  const tieneFoto = !!(perfil && perfil.avatar_path);
  $('btn-quitar-foto').classList.toggle('oculto', !tieneFoto);
  $('perfil-foto-txt').textContent = tieneFoto ? 'Cambiar foto' : 'Subir foto';
  pintarAnimos();
  $('btn-corazon').querySelector('span').textContent = (colorDe(usuario.id) || {}).corazon || '❤️';
}

// ---------- Estado de ánimo (con caritas de gatitos) ----------
const ANIMOS = [
  { k: 'enamorado', img: 'animos/1.jpg', emoji: '🥰', nombre: 'Enamorado' },
  { k: 'emocionado', img: 'animos/2.jpg', emoji: '🤩', nombre: 'Emocionado' },
  { k: 'feliz', img: 'animos/3.jpg', emoji: '😄', nombre: 'Feliz' },
  { k: 'cansado', img: 'animos/4.jpg', emoji: '😴', nombre: 'Cansado' },
  { k: 'sensible', img: 'animos/5.jpg', emoji: '🥺', nombre: 'Sensible' },
  { k: 'triste', img: 'animos/6.jpg', emoji: '😢', nombre: 'Triste' },
  { k: 'molesto', img: 'animos/7.jpg', emoji: '😡', nombre: 'Molesto' },
  { k: 'enfermo', img: 'animos/8.jpg', emoji: '🤒', nombre: 'Enfermo' },
];
const animoDe = (k) => ANIMOS.find((a) => a.k === k) || null;

ANIMOS.forEach((a) => {
  const b = el('button', 'animo-op');
  b.type = 'button';
  b.title = a.nombre;
  b.dataset.animo = a.k;
  const im = document.createElement('img');
  im.src = a.img;
  im.alt = '';
  im.loading = 'lazy';
  b.append(im, el('span', '', a.nombre));
  b.addEventListener('click', () => ponerAnimo(a.k));
  $('animo-opciones').append(b);
});

function animoVigente(id) {
  const a = animos[id];
  if (!a || !animoDe(a.animo) || !a.animo_en) return null;
  return Date.now() - new Date(a.animo_en).getTime() < 24 * 3600 * 1000 ? a : null;
}

function hace(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.round(min / 60)} h`;
}

function pintarAnimos() {
  if (!usuario) return;
  const otro = Object.keys(perfiles).find((id) => id !== usuario.id);
  const mio = animoVigente(usuario.id);
  const suyo = otro ? animoVigente(otro) : null;
  const poner = (id, a) => {
    const b = $(id);
    b.classList.toggle('oculto', !a);
    if (!a) { b.replaceChildren(); return; }
    const im = document.createElement('img');
    im.src = animoDe(a.animo).img;
    im.alt = 'Ánimo: ' + animoDe(a.animo).nombre;
    b.replaceChildren(im);
  };
  poner('hero-animo-yo', mio);
  poner('hero-animo-otro', suyo);
  document.querySelectorAll('.animo-op').forEach((b) => b.classList.toggle('activa', !!mio && b.dataset.animo === mio.animo));
  const linea = $('animo-otro');
  if (!otro) { linea.replaceChildren(); return; }
  if (suyo) {
    const im = document.createElement('img');
    im.src = animoDe(suyo.animo).img;
    im.alt = '';
    linea.replaceChildren(im, document.createTextNode(` ${perfiles[otro]} se siente ${animoDe(suyo.animo).nombre.toLowerCase()} · ${hace(suyo.animo_en)}`));
  } else {
    linea.textContent = `${perfiles[otro]} aún no dice cómo se siente hoy`;
  }
}

async function ponerAnimo(k) {
  const ahora = new Date().toISOString();
  const antes = animos[usuario.id];
  animos[usuario.id] = { animo: k, animo_en: ahora };
  pintarAnimos();
  const { error } = await sb.from('perfiles').update({ animo: k, animo_en: ahora }).eq('id', usuario.id);
  if (error) {
    animos[usuario.id] = antes;
    pintarAnimos();
    alert('No se pudo guardar tu ánimo: ' + traducir(error));
  }
}

function perfilRemoto(f) {
  if (!f || !usuario || f.id === usuario.id || perfiles[f.id] === undefined) return;
  const antes = animos[f.id];
  animos[f.id] = { animo: f.animo, animo_en: f.animo_en };
  pintarAnimos();
  if (animoDe(f.animo) && (!antes || antes.animo_en !== f.animo_en)) {
    aviso(`${nombreDe(f.id)} se siente ${animoDe(f.animo).nombre.toLowerCase()} ${animoDe(f.animo).emoji}`);
    mavisReaccion();
  }
}

// Muestra la foto de perfil (o la inicial si no tiene)
function pintarAvatar(nodo) {
  const id = nodo.dataset.uid;
  const url = fotos[id];
  const color = colorDe(id);
  nodo.style.background = color ? color.hex : '';
  nodo.style.color = color ? '#fff' : '';
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Foto de perfil de ' + (perfiles[id] || 'tu pareja');
    nodo.replaceChildren(img);
  } else {
    nodo.textContent = id && perfiles[id] ? perfiles[id].charAt(0).toUpperCase() : '?';
  }
}

function refrescarAvatares() {
  document.querySelectorAll('.avatar[data-uid]').forEach(pintarAvatar);
}

function llenarPerfil() {
  $('perfil-nombre').value = perfil.nombre || '';
  $('perfil-email').textContent = usuario.email;
  $('perfil-codigo').textContent = pareja.codigo;
}

$('btn-guardar-nombre').addEventListener('click', async () => {
  const nombre = $('perfil-nombre').value.trim();
  if (!nombre) return;
  const { error } = await sb.from('perfiles').update({ nombre }).eq('id', usuario.id);
  if (error) return alert(traducir(error));
  perfil.nombre = nombre;
  await cargarPerfiles();
  $('btn-guardar-nombre').textContent = '✓';
  setTimeout(() => ($('btn-guardar-nombre').textContent = 'Guardar'), 1500);
});

// ---------- Foto de perfil ----------
async function recortarCuadrada(file, lado = 480) {
  const bmp = await createImageBitmap(file);
  const min = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = lado;
  c.getContext('2d').drawImage(bmp, (bmp.width - min) / 2, (bmp.height - min) / 2, min, min, 0, 0, lado, lado);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
}

$('perfil-foto').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f || !f.type.startsWith('image/')) return;
  const estado = $('perfil-foto-estado');
  estado.textContent = 'Subiendo…';
  try {
    const blob = await recortarCuadrada(f);
    const ruta = `${pareja.id}/avatar-${usuario.id}-${Date.now()}.jpg`;
    const { error: e1 } = await sb.storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg' });
    if (e1) throw e1;
    const anterior = perfil.avatar_path;
    const { error: e2 } = await sb.from('perfiles').update({ avatar_path: ruta }).eq('id', usuario.id);
    if (e2) {
      await sb.storage.from(BUCKET).remove([ruta]);
      throw e2;
    }
    if (anterior) await sb.storage.from(BUCKET).remove([anterior]);
    await cargarPerfiles();
    estado.textContent = '✓ Foto actualizada';
    setTimeout(() => (estado.textContent = ''), 2500);
  } catch (err) {
    estado.textContent = '';
    alert('No se pudo cambiar la foto: ' + traducir(err));
  }
});

$('btn-quitar-foto').addEventListener('click', async () => {
  const ruta = perfil && perfil.avatar_path;
  if (!ruta || !confirm('¿Quitar tu foto de perfil?')) return;
  const estado = $('perfil-foto-estado');
  estado.textContent = 'Quitando…';
  const { error } = await sb.from('perfiles').update({ avatar_path: null }).eq('id', usuario.id);
  if (error) {
    estado.textContent = '';
    alert('No se pudo quitar la foto: ' + traducir(error));
    return;
  }
  await sb.storage.from(BUCKET).remove([ruta]);
  await cargarPerfiles();
  estado.textContent = '✓ Foto quitada';
  setTimeout(() => (estado.textContent = ''), 2500);
});

// ---------- Navegación ----------
document.querySelectorAll('.nav-btn').forEach((b) => {
  b.addEventListener('click', () => cambiarVista(b.dataset.vista));
});

function cambiarVista(vista) {
  vistaActual = vista;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('activa', b.dataset.vista === vista));
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === 'vista-' + vista));
  if (vista === 'jardin') requestAnimationFrame(() => entrarAlJardin());
}

// =============================================
//  MURO DE RECUERDOS
// =============================================
async function urlsFirmadas(paths) {
  if (!paths.length) return {};
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6);
  const mapa = {};
  (data || []).forEach((d) => { if (d.signedUrl) mapa[d.path] = d.signedUrl; });
  return mapa;
}

async function cargarPublicaciones() {
  const lista = $('lista-publicaciones');
  const { data, error } = await sb
    .from('publicaciones')
    .select('*')
    .eq('pareja_id', pareja.id)
    .order('creado_en', { ascending: false })
    .limit(100);
  if (error) {
    lista.replaceChildren(el('p', 'vacio', traducir(error)));
    return;
  }
  const urls = await urlsFirmadas(data.filter((p) => p.archivo_path).map((p) => p.archivo_path));
  postsCache = data.map((p) => ({ ...p, url: urls[p.archivo_path] }));
  lista.replaceChildren(...data.map((p) => crearPost(p, urls[p.archivo_path])));
  revisarVacio();
}

function revisarVacio() {
  const lista = $('lista-publicaciones');
  const hayPosts = lista.querySelector('.post');
  const vacio = lista.querySelector('.vacio');
  if (!hayPosts && !vacio) {
    const v = el('div', 'vacio');
    v.append(el('div', '', '📸'), el('p', '', 'Aún no hay recuerdos. ¡Sube el primero!'));
    lista.append(v);
  } else if (hayPosts && vacio) {
    vacio.remove();
  }
}

function crearPost(p, url) {
  const post = el('article', 'post');
  post.dataset.id = p.id;

  const cab = el('div', 'post-cab');
  const esMio = p.autor_id === usuario.id;
  const nombre = nombreDe(p.autor_id);
  const av = el('div', 'avatar' + (esMio ? '' : ' otro'));
  av.dataset.uid = p.autor_id;
  pintarAvatar(av);
  cab.append(av);
  const info = el('div');
  info.append(el('div', 'post-autor', nombre), el('div', 'post-fecha', fechaCorta(p.creado_en)));
  cab.append(info);
  if (esMio) {
    const borrar = el('button', 'post-borrar', '🗑');
    borrar.title = 'Borrar';
    borrar.addEventListener('click', () => borrarPost(p));
    cab.append(borrar);
  }
  post.append(cab);

  if (p.texto) post.append(el('div', 'post-texto', p.texto));

  if (url) {
    const media = el('div', 'post-media');
    if (p.tipo === 'video') {
      const v = document.createElement('video');
      v.setAttribute('aria-label', `Video compartido por ${nombre}`);
      v.src = url;
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      media.append(v);
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.loading = 'lazy';
      img.alt = p.texto ? `Foto: ${p.texto.slice(0, 100)}` : `Foto compartida por ${nombre}`;
      hacerAmpliable(img, url);
      media.append(img);
    }
    post.append(media);
  }
  return post;
}

async function agregarPost(p) {
  const lista = $('lista-publicaciones');
  if (lista.querySelector(`[data-id="${p.id}"]`)) return;
  if (!perfiles[p.autor_id]) await cargarPerfiles();
  const urls = p.archivo_path ? await urlsFirmadas([p.archivo_path]) : {};
  if (lista.querySelector(`[data-id="${p.id}"]`)) return;
  lista.prepend(crearPost(p, urls[p.archivo_path]));
  revisarVacio();
  postsCache.unshift({ ...p, url: urls[p.archivo_path] });
  sumarStat('s-recuerdos', 1);
  if (postsCache.length === 1) mostrarRecuerdoAzar();
}

async function borrarPost(p) {
  if (!confirm('¿Borrar esta publicación?')) return;
  const { error } = await sb.from('publicaciones').delete().eq('id', p.id);
  if (error) return alert(traducir(error));
  if (p.archivo_path) await sb.storage.from(BUCKET).remove([p.archivo_path]);
  quitarPost(p.id);
}

function quitarPost(id) {
  const nodo = $('lista-publicaciones').querySelector(`[data-id="${id}"]`);
  if (!nodo) return;
  nodo.remove();
  revisarVacio();
  postsCache = postsCache.filter((p) => p.id !== id);
  sumarStat('s-recuerdos', -1);
  if (ultimoAzar === id) mostrarRecuerdoAzar();
}

// ---------- Publicar ----------
$('pub-archivo').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > MAX_MB * 1024 * 1024 && f.type.startsWith('video/')) {
    alert(`Ese video pesa ${(f.size / 1048576).toFixed(0)} MB. El máximo es ${MAX_MB} MB.`);
    e.target.value = '';
    return;
  }
  archivoSel = f;
  const prev = $('pub-preview');
  const url = URL.createObjectURL(f);
  const media = f.type.startsWith('video/') ? document.createElement('video') : document.createElement('img');
  media.src = url;
  if (media.tagName === 'IMG') media.alt = 'Vista previa de la foto que vas a publicar';
  else media.setAttribute('aria-label', 'Vista previa del video que vas a publicar');
  if (media.tagName === 'VIDEO') { media.muted = true; media.playsInline = true; }
  const quitar = el('button', '', '✕');
  quitar.type = 'button';
  quitar.addEventListener('click', quitarArchivo);
  prev.replaceChildren(media, quitar);
  prev.classList.remove('oculto');
});

function quitarArchivo() {
  archivoSel = null;
  $('pub-archivo').value = '';
  $('pub-preview').replaceChildren();
  $('pub-preview').classList.add('oculto');
}

async function comprimirImagen(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 1920;
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * escala);
    c.height = Math.round(bmp.height * escala);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (blob && blob.size < file.size) return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
  } catch (_) { /* si falla, se sube el original */ }
  return file;
}

$('form-publicar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = $('pub-texto').value.trim();
  if (!texto && !archivoSel) return;

  const btn = $('btn-publicar');
  const estado = $('pub-estado');
  btn.disabled = true;

  let archivo_path = null;
  let tipo = 'texto';

  try {
    if (archivoSel) {
      tipo = archivoSel.type.startsWith('video/') ? 'video' : 'foto';
      estado.textContent = tipo === 'foto' ? 'Preparando foto…' : 'Subiendo video…';
      const file = tipo === 'foto' ? await comprimirImagen(archivoSel) : archivoSel;
      if (file.size > MAX_MB * 1024 * 1024) throw new Error(`El archivo pesa más de ${MAX_MB} MB.`);
      const ext = (file.name.split('.').pop() || (tipo === 'video' ? 'mp4' : 'jpg')).toLowerCase();
      archivo_path = `${pareja.id}/${crypto.randomUUID()}.${ext}`;
      estado.textContent = 'Subiendo…';
      const { error: errSubida } = await sb.storage.from(BUCKET).upload(archivo_path, file, {
        contentType: file.type || undefined,
        cacheControl: '3600',
      });
      if (errSubida) throw errSubida;
    }

    const { data, error } = await sb
      .from('publicaciones')
      .insert({ pareja_id: pareja.id, texto: texto || null, archivo_path, tipo })
      .select()
      .single();
    if (error) {
      if (archivo_path) await sb.storage.from(BUCKET).remove([archivo_path]);
      throw error;
    }

    $('pub-texto').value = '';
    quitarArchivo();
    estado.textContent = '';
    await agregarPost(data);
  } catch (err) {
    estado.textContent = '';
    alert('No se pudo publicar: ' + traducir(err));
  } finally {
    btn.disabled = false;
  }
});

// ---------- Visor de fotos ----------
let visorOrigen = null;
function abrirVisor(url) {
  const img = document.createElement('img');
  img.src = url;
  img.alt = 'Foto ampliada';
  visorOrigen = document.activeElement;
  $('visor').replaceChildren(img);
  $('visor').classList.remove('oculto');
  $('visor').focus();
}
function cerrarVisor() {
  $('visor').classList.add('oculto');
  if (visorOrigen && visorOrigen.focus) visorOrigen.focus();
  visorOrigen = null;
}
// Las fotos se pueden abrir con teclado (Enter o Espacio)
function hacerAmpliable(img, url) {
  img.tabIndex = 0;
  img.setAttribute('role', 'button');
  img.addEventListener('click', () => abrirVisor(url));
  img.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirVisor(url); }
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('visor').classList.contains('oculto')) cerrarVisor();
  else if ($('musica-panel').classList.contains('abierta')) $('musica-panel').classList.remove('abierta');
});
$('visor').addEventListener('click', cerrarVisor);

// =============================================
//  CORAZONES (usan la tabla de mensajes; el chat ya no existe)
// =============================================
const mensajesVistos = new Set();

function primeraVez(id) {
  if (mensajesVistos.has(id)) return false;
  mensajesVistos.add(id);
  return true;
}

async function recibirMensaje(m) {
  if (m.texto !== CORAZON || !primeraVez(m.id)) return;
  if (!perfiles[m.autor_id]) await cargarPerfiles();
  sumarStat('s-corazones', 1);
  if (m.autor_id === usuario.id) return;
  lluviaCorazones(24, [(colorDe(m.autor_id) || {}).corazon]);
  aviso(`${(colorDe(m.autor_id) || {}).corazon || '💌'} ${nombreDe(m.autor_id)} te mandó un corazón`);
  mavisReaccion();
}

// =============================================
//  PLANES Y METAS JUNTOS
// =============================================
let planes = [];
let planNuevo = null;

async function cargarPlanes() {
  const { data, error } = await sb.from('planes').select('*').eq('pareja_id', pareja.id).order('creado_en', { ascending: false });
  if (error) {
    planes = [];
    $('lista-planes').replaceChildren(el('p', 'vacio', 'Aún falta crear la tabla de planes en Supabase (correr el SQL).'));
    return;
  }
  planes = data;
  pintarPlanes();
}

let planesTab = 'pendientes';

function irAPestanaPlanes(tab) {
  planesTab = tab;
  document.querySelectorAll('#planes-tabs .pestana').forEach((x) => x.classList.toggle('activa', x.dataset.tab === tab));
}

document.querySelectorAll('#planes-tabs .pestana').forEach((b) => {
  b.addEventListener('click', () => {
    irAPestanaPlanes(b.dataset.tab);
    pintarPlanes();
  });
});

function pintarPlanes() {
  const pendientes = planes.filter((x) => !x.hecho).sort((a, b) => {
    return new Date(b.creado_en) - new Date(a.creado_en);
  });
  const hechos = planes.filter((x) => x.hecho).sort((a, b) => new Date(b.hecho_en || 0) - new Date(a.hecho_en || 0));
  const total = planes.length;
  $('planes-num').textContent = total ? `${hechos.length} de ${total} cumplidos` : 'Aún no hay planes. ¡Agreguen el primero!';
  $('planes-barra').style.width = (total ? (hechos.length / total) * 100 : 0) + '%';
  $('s-planes').textContent = fmt(hechos.length);
  document.querySelector('#planes-tabs [data-tab="pendientes"]').textContent = `Por cumplir (${pendientes.length})`;
  document.querySelector('#planes-tabs [data-tab="cumplidos"]').textContent = `Cumplidos ✓ (${hechos.length})`;

  const lista = planesTab === 'pendientes' ? pendientes : hechos;
  const partes = lista.map(crearPlan);
  if (!lista.length) {
    const v = el('div', 'vacio');
    if (planesTab === 'cumplidos') {
      v.append(el('p', '', 'Aquí aparecerán los planes que vayan cumpliendo.'));
    } else if (total) {
      v.append(el('p', '', '¡No queda nada pendiente! Agreguen nuevos planes a futuro.'));
    } else {
      v.append(el('p', '', 'Viajes, comidas, sueños… lo que quieran hacer juntos.'));
    }
    partes.push(v);
  }
  $('lista-planes').replaceChildren(...partes);
  planNuevo = null;
}

function crearPlan(p) {
  const fila = el('div', 'plan' + (p.hecho ? ' hecho' : '') + (p.id === planNuevo ? ' nuevo' : ''));
  fila.dataset.id = p.id;
  const c = colorDe(p.autor_id);
  if (c) fila.style.setProperty('--c', c.hex);

  const chk = el('button', 'plan-chk', p.hecho ? '✓' : '');
  chk.type = 'button';
  chk.setAttribute('aria-label', p.hecho ? 'Marcar como pendiente' : 'Marcar como cumplido');
  chk.addEventListener('click', () => alternarPlan(p));

  const cuerpo = el('div', 'plan-cuerpo');
  cuerpo.append(
    el('div', 'plan-texto', p.texto),
    el('div', 'plan-meta', `${nombreDe(p.autor_id)} · ${fechaCorta(p.creado_en)}` + (p.hecho && p.hecho_en ? ` · ✓ ${fechaCorta(p.hecho_en)}` : '')),
  );

  const borrar = el('button', 'post-borrar', '🗑');
  borrar.type = 'button';
  borrar.title = 'Borrar';
  borrar.addEventListener('click', () => borrarPlan(p));
  fila.append(chk, cuerpo, borrar);
  return fila;
}

function celebrarPlan() {
  const mio = (colorDe(usuario.id) || {}).corazon || '❤️';
  const todos = planes.length > 0 && planes.every((x) => x.hecho);
  lluviaCorazones(todos ? 50 : 16, [mio, '🎉', '✨', '🎯']);
  aviso(todos ? '🏆 ¡Cumplieron todos sus planes!' : '🎯 ¡Plan cumplido!');
  if (navigator.vibrate) navigator.vibrate(todos ? [40, 40, 40, 40, 80] : 30);
}

async function alternarPlan(p) {
  const antes = { hecho: p.hecho, hecho_en: p.hecho_en };
  p.hecho = !p.hecho;
  p.hecho_en = p.hecho ? new Date().toISOString() : null;
  pintarPlanes();
  if (p.hecho) celebrarPlan();
  const { error } = await sb.from('planes').update({ hecho: p.hecho, hecho_en: p.hecho_en }).eq('id', p.id);
  if (error) {
    Object.assign(p, antes);
    pintarPlanes();
    alert('No se pudo actualizar: ' + traducir(error));
  }
}

async function borrarPlan(p) {
  if (!confirm('¿Borrar este plan?')) return;
  const { error } = await sb.from('planes').delete().eq('id', p.id);
  if (error) return alert(traducir(error));
  planes = planes.filter((x) => x.id !== p.id);
  pintarPlanes();
}

$('form-plan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = $('plan-texto').value.trim();
  if (!texto) return;
  const btn = $('btn-plan');
  btn.disabled = true;
  const { data, error } = await sb
    .from('planes')
    .insert({ pareja_id: pareja.id, texto })
    .select()
    .single();
  btn.disabled = false;
  if (error) return alert('No se pudo agregar: ' + traducir(error));
  $('plan-texto').value = '';
  if (!planes.some((x) => x.id === data.id)) {
    planes.unshift(data);
    planNuevo = data.id;
    irAPestanaPlanes('pendientes');
    pintarPlanes();
  }
});

function planRemoto(tipo, fila) {
  if (!fila) return;
  if (tipo === 'DELETE') {
    if (!planes.some((x) => x.id === fila.id)) return;
    planes = planes.filter((x) => x.id !== fila.id);
    pintarPlanes();
    return;
  }
  const actual = planes.find((x) => x.id === fila.id);
  if (tipo === 'INSERT') {
    if (actual) return;
    planes.unshift(fila);
    planNuevo = fila.id;
    pintarPlanes();
    if (fila.autor_id !== usuario.id) aviso(`🎯 ${nombreDe(fila.autor_id)} agregó un plan`);
  } else if (actual) {
    const avisar = fila.hecho && !actual.hecho;
    Object.assign(actual, fila);
    pintarPlanes();
    if (avisar) {
      lluviaCorazones(18, ['🎉', '✨', '🎯']);
      aviso(`🎯 ¡Plan cumplido!: ${fila.texto}`);
    }
  }
}

// =============================================
//  TIEMPO REAL
// =============================================
function suscribir() {
  if (canal) sb.removeChannel(canal);
  const filtro = `pareja_id=eq.${pareja.id}`;
  canal = sb
    .channel('pareja-' + pareja.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: filtro },
      (payload) => recibirMensaje(payload.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'publicaciones', filter: filtro },
      (payload) => agregarPost(payload.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'publicaciones' },
      (payload) => payload.old && quitarPost(payload.old.id))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'parejas', filter: `id=eq.${pareja.id}` },
      (payload) => mavisRemota(payload.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'perfiles' },
      (payload) => perfilRemoto(payload.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'planes', filter: filtro },
      (payload) => planRemoto('INSERT', payload.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'planes', filter: filtro },
      (payload) => planRemoto('UPDATE', payload.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'planes' },
      (payload) => planRemoto('DELETE', payload.old))
    .subscribe();
}

// =============================================
//  INSTALABLE (PWA)
// =============================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// =============================================
//  INICIO: contador, fechas, corazones
// =============================================
const CORAZON = '❤️';

const FRASES = [
  'Contigo, hasta lo simple se vuelve especial.',
  'Eres mi lugar favorito.',
  'Si tuviera que elegir otra vez, te elegiría a ti.',
  'Me gustas en todas tus versiones.',
  'Cada día a tu lado es mi día favorito.',
  'Contigo el tiempo pasa volando, pero cada segundo vale.',
  'Eres mi casualidad más bonita.',
  'Lo mejor de mi día eres tú.',
  'Tú y yo, siempre equipo.',
  'Te quiero hoy más que ayer, pero menos que mañana.',
  'Gracias por hacer de lo normal algo increíble.',
  'Mi persona favorita para no hacer nada.',
  'Tu risa es mi canción favorita.',
  'Contigo aprendí que el amor también es paz.',
  'Donde estés tú, ahí quiero estar.',
  'Eres mi hoy y todos mis mañanas.',
  'Somos la mejor historia que me ha pasado.',
  'A tu lado todo tiene sentido.',
  'No sé qué hice bien, pero te tengo a ti.',
  'Mi abrazo favorito tiene tu nombre.',
];

function fechaLocal(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function soloDia(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sumarMeses(fecha, n) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth() + n, 1);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(fecha.getDate(), ultimo));
  return d;
}

function desglose(inicio, hoy) {
  let a = hoy.getFullYear() - inicio.getFullYear();
  let m = hoy.getMonth() - inicio.getMonth();
  let d = hoy.getDate() - inicio.getDate();
  if (d < 0) { m--; d += new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate(); }
  if (m < 0) { a--; m += 12; }
  return { a, m, d };
}

function diasEntre(a, b) {
  return Math.round((soloDia(b) - soloDia(a)) / 86400000);
}

function fmt(n) {
  return n.toLocaleString('es-MX');
}

function pintarInicio() {
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  $('saludo').textContent = `${saludo}, ${perfiles[usuario.id] || ''} ${h < 19 ? '☀️' : '🌙'}`;

  const hoy = new Date();
  const idx = Math.floor(soloDia(hoy) / 86400000) % FRASES.length;
  $('frase-dia').textContent = `“${FRASES[idx]}”`;

  pintarContador();
  pintarCumples();
  if (reloj) clearInterval(reloj);
  reloj = setInterval(tickVivo, 1000);
}

function pintarContador() {
  const tiene = !!pareja.fecha_inicio;
  $('contador-sin-fecha').classList.toggle('oculto', tiene);
  $('contador-con-fecha').classList.toggle('oculto', !tiene);
  $('proximas').classList.toggle('oculto', !tiene);
  if (!tiene) return;

  const inicio = fechaLocal(pareja.fecha_inicio);
  const hoy = soloDia(new Date());
  const total = diasEntre(inicio, hoy);

  if (total < 0) {
    $('c-dias').textContent = Math.abs(total);
    $('contador-con-fecha').querySelector('.contador-titulo').textContent = 'Faltan para empezar';
  } else {
    $('contador-con-fecha').querySelector('.contador-titulo').textContent = 'Llevamos juntos';
    animarNumero($('c-dias'), total);
  }
  const { a, m, d } = desglose(inicio, hoy);
  const poner = (id, n, uno, varios) => {
    $(id).textContent = n;
    $(id).nextElementSibling.textContent = n === 1 ? uno : varios;
  };
  poner('c-anios', Math.max(a, 0), 'año', 'años');
  poner('c-meses', Math.max(m, 0), 'mes', 'meses');
  poner('c-resto', Math.max(d, 0), 'día', 'días');
  $('c-desde').textContent = 'Desde el ' + inicio.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  tickVivo();

  // Próximo mesario
  const mesesPasados = Math.max(0, a * 12 + m);
  let n = mesesPasados;
  let mesario = sumarMeses(inicio, n);
  if (mesario < hoy || n === 0) mesario = sumarMeses(inicio, ++n);
  const faltaMes = diasEntre(hoy, mesario);
  $('p-mes-dias').textContent = faltaMes === 0 ? '¡Hoy! 🎉' : faltaMes + (faltaMes === 1 ? ' día' : ' días');
  $('p-mes-txt').textContent = faltaMes === 0
    ? `Cumplen ${n} ${n === 1 ? 'mes' : 'meses'}`
    : `para cumplir ${n} ${n === 1 ? 'mes' : 'meses'}`;

  // Próximo aniversario
  let k = Math.max(0, a);
  let aniv = sumarMeses(inicio, k * 12);
  if (aniv < hoy || k === 0) aniv = sumarMeses(inicio, ++k * 12);
  const anterior = sumarMeses(inicio, (k - 1) * 12);
  const faltaAnio = diasEntre(hoy, aniv);
  const aniversarioHoy = total > 0 && diasEntre(hoy, sumarMeses(inicio, a * 12)) === 0 && a > 0;
  $('p-anio-dias').textContent = aniversarioHoy ? '¡Hoy! 🎉' : faltaAnio + (faltaAnio === 1 ? ' día' : ' días');
  $('p-anio-txt').textContent = aniversarioHoy
    ? `¡Cumplen ${a} ${a === 1 ? 'año' : 'años'}!`
    : `para su ${k}.º aniversario`;
  const progreso = Math.min(100, Math.max(0, (diasEntre(anterior, hoy) / diasEntre(anterior, aniv)) * 100));
  requestAnimationFrame(() => { $('p-anio-barra').style.width = (aniversarioHoy ? 100 : progreso) + '%'; });

  if (faltaMes === 0 || aniversarioHoy) {
    setTimeout(() => lluviaCorazones(40), 600);
  }
}

// ---------- Cumpleaños ----------
const CUMPLES = [
  { nombre: 'Benjamin', fecha: '2004-08-21', color: '#18844a', claro: '#2fbf71', corazon: '💚' },
  { nombre: 'Alondra', fecha: '2005-04-12', color: '#7c4dc4', claro: '#ad86e6', corazon: '💜' },
];
let cumplesDia = null;
let cumplesFiesta = false;

function pintarCumples() {
  const hoy = soloDia(new Date());
  cumplesDia = hoy.toDateString();
  const caja = $('cumples');
  const partes = [el('h2', '', '🎂 Cumpleaños')];
  let hayHoy = null;

  CUMPLES.forEach((c) => {
    const nac = fechaLocal(c.fecha);
    let prox = new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate());
    if (prox < hoy) prox = new Date(hoy.getFullYear() + 1, nac.getMonth(), nac.getDate());
    const anterior = new Date(prox.getFullYear() - 1, nac.getMonth(), nac.getDate());
    const dias = diasEntre(hoy, prox);
    const edad = prox.getFullYear() - nac.getFullYear();
    const esHoy = dias === 0;
    if (esHoy) hayHoy = c;

    const fila = el('div', 'cumple' + (esHoy ? ' hoy' : ''));
    fila.style.setProperty('--c', c.color);
    fila.style.setProperty('--ct', c.claro);
    fila.append(el('div', 'cumple-ico', esHoy ? '🎂' : c.corazon));

    const cuerpo = el('div', 'cumple-cuerpo');
    cuerpo.append(
      el('div', 'cumple-nombre', c.nombre),
      el('div', 'cumple-fecha', nac.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })),
    );
    if (esHoy) {
      cuerpo.append(el('div', 'cumple-hoy', `¡Hoy es un día muy especial! 🎉 Feliz cumpleaños, ${c.nombre}. Hoy cumple ${edad} años 💖`));
    } else {
      const d = el('div', 'cumple-dias', fmt(dias));
      d.append(el('small', '', dias === 1 ? ' día' : ' días'));
      cuerpo.append(d, el('div', 'cumple-fecha', `para que ${c.nombre} cumpla ${edad} años 🎈`));
      const barra = el('div', 'barra-prog');
      const relleno = document.createElement('i');
      barra.append(relleno);
      cuerpo.append(barra);
      const prog = Math.min(100, Math.max(0, (diasEntre(anterior, hoy) / diasEntre(anterior, prox)) * 100));
      setTimeout(() => { relleno.style.width = prog + '%'; relleno.style.background = c.color; }, 300);
      cuerpo.append(el('div', 'cumple-msg', dias <= 7
        ? '¡Ya casi! Se acerca un día muy especial 🎁'
        : 'Un día muy especial: el día en que el mundo ganó a alguien increíble 💫'));
    }
    fila.append(cuerpo);
    partes.push(fila);
  });

  caja.replaceChildren(...partes);
  if (hayHoy && !cumplesFiesta) {
    cumplesFiesta = true;
    setTimeout(() => lluviaCorazones(45, [hayHoy.corazon, '🎉', '🎂', '✨']), 700);
  }
}

function tickVivo() {
  if (new Date().toDateString() !== cumplesDia && $('cumples')) pintarCumples();
  if (!pareja || !pareja.fecha_inicio) return;
  const ms = Date.now() - fechaLocal(pareja.fecha_inicio).getTime();
  if (ms < 0) { $('c-vivo').textContent = ''; return; }
  const seg = Math.floor(ms / 1000);
  $('c-vivo').textContent =
    `⏱ ${fmt(Math.floor(seg / 3600))} horas · ${fmt(Math.floor(seg / 60))} minutos · ${fmt(seg)} segundos`;
}

function animarNumero(nodo, final) {
  const inicio = performance.now();
  const dur = 900;
  function paso(t) {
    const p = Math.min(1, (t - inicio) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    nodo.textContent = fmt(Math.round(final * eased));
    if (p < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

// ---------- Estadísticas ----------
async function cargarStats() {
  const { count: cors } = await sb.from('mensajes').select('id', { count: 'exact', head: true }).eq('pareja_id', pareja.id).eq('texto', CORAZON);
  const { count: recs } = await sb.from('publicaciones').select('id', { count: 'exact', head: true }).eq('pareja_id', pareja.id);
  animarNumero($('s-recuerdos'), recs || 0);
  animarNumero($('s-planes'), planes.filter((x) => x.hecho).length);
  animarNumero($('s-corazones'), cors || 0);
}

function sumarStat(id, n) {
  const nodo = $(id);
  const actual = parseInt(nodo.textContent.replace(/\D/g, ''), 10) || 0;
  nodo.textContent = fmt(Math.max(0, actual + n));
}

// ---------- Recuerdo al azar ----------
function mostrarRecuerdoAzar() {
  const caja = $('recuerdo-azar');
  if (!postsCache.length) {
    const v = el('div', 'vacio');
    v.append(el('p', '', 'Cuando suban recuerdos, aquí aparecerá uno al azar 💭'));
    caja.replaceChildren(v);
    ultimoAzar = null;
    return;
  }
  const conFoto = postsCache.filter((p) => p.url);
  const pool = (conFoto.length ? conFoto : postsCache).filter((p) => p.id !== ultimoAzar);
  const p = (pool.length ? pool : postsCache)[Math.floor(Math.random() * (pool.length || postsCache.length))];
  ultimoAzar = p.id;

  const cont = el('div', 'aparecer');
  if (p.url) {
    if (p.tipo === 'video') {
      const v = document.createElement('video');
      v.setAttribute('aria-label', `Video compartido por ${nombreDe(p.autor_id)}`);
      v.src = p.url; v.controls = true; v.playsInline = true; v.preload = 'metadata';
      cont.append(v);
    } else {
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = p.texto ? `Recuerdo: ${p.texto.slice(0, 100)}` : `Recuerdo compartido por ${nombreDe(p.autor_id)}`;
      hacerAmpliable(img, p.url);
      cont.append(img);
    }
  }
  if (p.texto) cont.append(el('p', 'azar-texto', p.texto));
  cont.append(el('p', 'azar-meta', `${nombreDe(p.autor_id)} · ${new Date(p.creado_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`));
  caja.replaceChildren(cont);
}

$('btn-otro-recuerdo').addEventListener('click', mostrarRecuerdoAzar);

// ---------- Mandar un corazón ----------
$('btn-corazon').addEventListener('click', async () => {
  const btn = $('btn-corazon');
  btn.classList.remove('enviado');
  void btn.offsetWidth;
  btn.classList.add('enviado');
  lluviaCorazones(18, [(colorDe(usuario.id) || {}).corazon]);
  if (navigator.vibrate) navigator.vibrate(40);
  const { data, error } = await sb.from('mensajes').insert({ pareja_id: pareja.id, texto: CORAZON }).select().single();
  if (error) return alert('No se pudo enviar: ' + traducir(error));
  if (primeraVez(data.id)) sumarStat('s-corazones', 1);
  mavisReaccion();
  aviso(((colorDe(usuario.id) || {}).corazon || '❤️') + ' Corazón enviado');
});

// ---------- Animaciones ----------
function lluviaCorazones(cantidad = 24, propios) {
  const capa = $('lluvia');
  const emojis = propios && propios.length && propios[0] ? propios : ['❤️', '💖', '💕', '💗', '💘', '💞'];
  for (let i = 0; i < cantidad; i++) {
    const s = document.createElement('span');
    s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.fontSize = 18 + Math.random() * 26 + 'px';
    s.style.animationDelay = Math.random() * 0.8 + 's';
    s.style.animationDuration = 2 + Math.random() * 1.5 + 's';
    capa.append(s);
    setTimeout(() => s.remove(), 4500);
  }
}

let avisoTimer = null;
function aviso(texto) {
  if (usuario && !desbloqueado) return; // con la pantalla bloqueada no se muestra nada
  const t = $('toast');
  t.textContent = texto;
  t.classList.remove('oculto');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => t.classList.add('oculto'), 2800);
}

// =============================================
//  MAVIS, la gatita negra que camina por la barra
// =============================================
const mavis = $('mavis');
let mvAncho = 84;
let mvX = 20;
let mvDir = 1;              // 1 = derecha, -1 = izquierda
let mvModo = 'camina';      // camina | pausa | interaccion
let mvHasta = 0;            // hora en que termina el modo actual
let mvUltimo = 0;
let mvPresion = null;
let mvTimerEstado = null;

function mvCambiarModo(modo, ms) {
  mvModo = modo;
  mvHasta = performance.now() + ms;
  mavis.classList.toggle('camina', modo === 'camina');
}

function mvPonerX() {
  mavis.style.left = mvX + 'px';
  mavis.classList.toggle('izquierda', mvDir < 0);
}

function mvBucle(t) {
  requestAnimationFrame(mvBucle);
  const oculta = vistaActual === 'chat' || !$('pantalla-app').classList.contains('activa');
  mavis.classList.toggle('oculta', oculta);
  const dt = Math.min(0.1, (t - (mvUltimo || t)) / 1000);
  mvUltimo = t;
  if (oculta) return;
  if (document.documentElement.classList.contains('sin-anim')) {
    mavis.classList.remove('camina');
    return;
  }
  mavis.classList.toggle('camina', mvModo === 'camina');

  if (mvModo === 'camina') {
    mvX += mvDir * 42 * dt;
    const max = window.innerWidth - mvAncho;
    if (mvX <= 0) { mvX = 0; mvDir = 1; }
    if (mvX >= max) { mvX = max; mvDir = -1; }
    mvPonerX();
    if (t > mvHasta) {
      // A veces se detiene un rato o da la vuelta
      if (Math.random() < 0.35) mvDir *= -1;
      mvCambiarModo('pausa', 1500 + Math.random() * 3000);
    }
  } else if (mvModo === 'pausa' && t > mvHasta) {
    if (Math.random() < 0.3) mvDir *= -1;
    mvCambiarModo('camina', 4000 + Math.random() * 6000);
  } else if (mvModo === 'interaccion' && t > mvHasta) {
    mvCambiarModo('camina', 3000 + Math.random() * 3000);
  }
}

function mvEstado(clase, ms) {
  mavis.classList.remove('feliz', 'ronronea');
  void mavis.offsetWidth;
  mavis.classList.add(clase);
  clearTimeout(mvTimerEstado);
  mvTimerEstado = setTimeout(() => mavis.classList.remove(clase), ms);
  mvCambiarModo('interaccion', ms + 300);
}

function mvNombre() {
  mavis.querySelectorAll('.mv-nombre').forEach((n) => n.remove());
  const n = el('span', 'mv-nombre', 'Mavis');
  mavis.append(n);
  setTimeout(() => n.remove(), 1900);
}

function mvCorazones(n) {
  for (let i = 0; i < n; i++) {
    const s = el('span', 'mv-corazon', ['❤️', '💕', '💗'][Math.floor(Math.random() * 3)]);
    s.style.left = 14 + Math.random() * 50 + 'px';
    s.style.animationDelay = i * 0.18 + 's';
    mavis.append(s);
    setTimeout(() => s.remove(), 1900);
  }
}

// Toque = se pone feliz y brinca; mantener presionado = ronronea
const mvSvg = $('mavis-svg');
mvSvg.addEventListener('pointerdown', () => {
  mvNombre();
  mvPresion = setTimeout(() => {
    mvPresion = 'largo';
    mvEstado('ronronea', 2800);
    cuidarMavis();
    mvCorazones(4);
    if (navigator.vibrate) navigator.vibrate([40, 30, 40, 30, 40, 30, 40, 30, 40]);
  }, 500);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => {
  mvSvg.addEventListener(ev, () => {
    if (mvPresion === null) return;
    const largo = mvPresion === 'largo';
    if (!largo) clearTimeout(mvPresion);
    mvPresion = null;
    if (!largo && ev === 'pointerup') {
      mvEstado('feliz', 900);
      cuidarMavis();
      mvCorazones(3);
      if (navigator.vibrate) navigator.vibrate(25);
    }
  });
});

// Reacciona cuando llega un corazón o cambia el ánimo del otro
function mavisReaccion() {
  if (mavis.classList.contains('oculta')) return;
  mvEstado('feliz', 900);
  mvCorazones(3);
}

// Crece si la cuidan (la tocan) todos los días
function claveDia(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function aplicarTamano(dias) {
  mvAncho = 76 + Math.min(dias, 30) * 1.5;
  mavis.style.width = mvAncho + 'px';
}
function ayerDe(d) {
  const a = new Date(d);
  a.setDate(a.getDate() - 1);
  return a;
}
// La racha es de los dos (se guarda en la pareja): si alguno la toca, cuenta para ambos
function revisarRacha() {
  const hoy = new Date();
  const ult = pareja && pareja.mavis_ultimo;
  const vigente = ult && (ult === claveDia(hoy) || ult === claveDia(ayerDe(hoy)));
  aplicarTamano(vigente ? pareja.mavis_dias || 0 : 0);
}

let cuidandoMavis = false;
async function cuidarMavis() {
  if (!pareja || cuidandoMavis) return;
  if (pareja.mavis_ultimo === claveDia(new Date())) return;
  cuidandoMavis = true;
  const { data, error } = await sb.rpc('cuidar_mavis');
  cuidandoMavis = false;
  if (error) return;
  pareja.mavis_dias = data;
  pareja.mavis_ultimo = claveDia(new Date());
  aplicarTamano(data);
  mvCorazones(8);
}

// Cuando el otro la cuida, también crece aquí
function mavisRemota(f) {
  if (!pareja || !f) return;
  const antes = pareja.mavis_dias;
  pareja.mavis_dias = f.mavis_dias;
  pareja.mavis_ultimo = f.mavis_ultimo;
  revisarRacha();
  if (f.mavis_dias !== antes) mavisReaccion();
}
revisarRacha();

mvCambiarModo('camina', 6000);
mvPonerX();
requestAnimationFrame(mvBucle);

// =============================================
//  TEMÁTICAS: rosa (predeterminada), Coraline, auroras boreales
// =============================================
const COLOR_TEMA = { rosa: '#e8537a', coraline: '#14262e', aurora: '#03131a' };
const fondoTema = $('fondo-tema');
let temaTimers = [];

function tTimeout(fn, ms) {
  const id = setTimeout(fn, ms);
  temaTimers.push(id);
  return id;
}

function azar(a, b) {
  return a + Math.random() * (b - a);
}

function limpiarTema() {
  temaTimers.forEach(clearTimeout);
  temaTimers = [];
  fondoTema.replaceChildren();
  document.querySelectorAll('.prop-coraline').forEach((n) => n.remove());
}

function crearEstrellas(cuantas, tenues) {
  for (let i = 0; i < cuantas; i++) {
    const s = el('span', 'estrella');
    const t = azar(1, 3);
    s.style.cssText = `left:${azar(0, 100)}%;top:${azar(0, 100)}%;width:${t}px;height:${t}px;` +
      `animation-duration:${azar(2, 5)}s;animation-delay:${azar(0, 4)}s;` + (tenues ? 'opacity:.5;' : '');
    fondoTema.append(s);
  }
}

const SVG_LLAVE = `
<svg viewBox="0 0 40 100" aria-hidden="true">
  <defs><linearGradient id="mv-metal" x1="0" x2="1"><stop offset="0" stop-color="#2b2b33"/><stop offset=".5" stop-color="#5a5a68"/><stop offset="1" stop-color="#1a1a20"/></linearGradient></defs>
  <circle cx="20" cy="19" r="17" fill="url(#mv-metal)" stroke="#0d0d10" stroke-width="1.5"/>
  <circle cx="20" cy="19" r="12" fill="#15151a"/>
  <g fill="#8fb0ff" opacity=".85"><circle cx="15" cy="14" r="3"/><circle cx="25" cy="14" r="3"/><circle cx="15" cy="24" r="3"/><circle cx="25" cy="24" r="3"/></g>
  <path d="M15 34 Q20 40 25 34 L26 42 Q20 46 14 42 Z" fill="url(#mv-metal)"/>
  <rect x="17" y="42" width="6" height="40" fill="url(#mv-metal)"/>
  <path d="M23 66 h11 v7 h-6 v6 h6 v9 h-11 z" fill="url(#mv-metal)" stroke="#0d0d10" stroke-width="1"/>
  <path d="M18 44 v36" stroke="#8a8a9a" stroke-width="1" opacity=".5"/>
</svg>`;

const SVG_PIEDRA = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs><radialGradient id="mv-jade" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#5cf0c0"/><stop offset=".6" stop-color="#1fb98a"/><stop offset="1" stop-color="#0a6b4d"/></radialGradient></defs>
  <path d="M22 18 Q34 6 50 12 L84 36 Q98 48 88 62 L50 90 Q32 100 22 84 L12 34 Q11 24 22 18 Z" fill="#1c1c1c"/>
  <path d="M25 22 Q35 13 48 18 L80 40 Q90 49 82 59 L48 84 Q34 92 27 80 L18 36 Q17 27 25 22 Z" fill="url(#mv-jade)"/>
  <path d="M30 30 Q46 24 62 40 M28 52 Q44 46 60 62 M34 70 Q52 66 70 54" fill="none" stroke="#0a7a52" stroke-width="3" stroke-linecap="round"/>
  <path d="M34 26 Q42 22 52 28 M30 60 Q38 58 46 66" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>
  <ellipse cx="50" cy="52" rx="11" ry="12" fill="#050505"/>
  <ellipse cx="46" cy="47" rx="3.2" ry="2" fill="#fff" opacity=".55"/>
</svg>`;

const SVG_LIBELULA = `
<svg viewBox="0 0 90 60" aria-hidden="true">
  <g class="ala"><ellipse cx="28" cy="22" rx="24" ry="9" fill="#f4a9c8" fill-opacity=".8" stroke="#c9a24d" stroke-width="1.3" transform="rotate(-24 28 22)"/></g>
  <g class="ala b"><ellipse cx="34" cy="38" rx="24" ry="8" fill="#f4a9c8" fill-opacity=".75" stroke="#c9a24d" stroke-width="1.3" transform="rotate(20 34 38)"/></g>
  <g class="ala"><ellipse cx="46" cy="20" rx="20" ry="8" fill="#f9c4da" fill-opacity=".8" stroke="#c9a24d" stroke-width="1.3" transform="rotate(-38 46 20)"/></g>
  <path d="M40 30 Q12 34 4 46" fill="none" stroke="#c9a24d" stroke-width="3" stroke-linecap="round"/>
  <circle cx="14" cy="42" r="2.2" fill="#3aa7c9"/><circle cx="22" cy="39" r="2.2" fill="#3aa7c9"/><circle cx="30" cy="36" r="2.2" fill="#3aa7c9"/>
  <ellipse cx="46" cy="31" rx="9" ry="6" fill="#c9a24d"/>
  <circle cx="46" cy="31" r="4.6" fill="#2ec1e0"/><circle cx="45" cy="29.5" r="1.4" fill="#fff" opacity=".8"/>
  <circle cx="56" cy="29" r="3" fill="#d6283a"/><circle cx="56" cy="35" r="3" fill="#d6283a"/>
</svg>`;

const SVG_CONSTELACION = `
<svg viewBox="0 0 150 60" aria-hidden="true">
  <polyline points="6,44 34,20 70,32 104,8 142,30" fill="none" stroke="#cfd9ff" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/>
  <g fill="#fff"><circle cx="6" cy="44" r="2.4"/><circle cx="34" cy="20" r="2.8"/><circle cx="70" cy="32" r="2.2"/><circle cx="104" cy="8" r="3"/><circle cx="142" cy="30" r="2.4"/></g>
</svg>`;

function cieloCoraline() {
  fondoTema.append(el('div', 'vortice'), el('div', 'vortice-centro'));
  crearEstrellas(55, false);
  for (let i = 0; i < 12; i++) {
    const s = el('span', 'estrella4');
    const t = azar(7, 15);
    s.style.cssText = `left:${azar(2, 96)}%;top:${azar(2, 92)}%;width:${t}px;height:${t}px;animation-duration:${azar(3, 6)}s;animation-delay:${azar(0, 4)}s;`;
    fondoTema.append(s);
  }
  [[8, 12], [82, 20], [70, 74]].forEach(([x, y], i) => {
    const l = el('span', 'luna-cresc');
    l.style.cssText = `left:${x}%;top:${y}%;animation-delay:${-i * 2}s;`;
    fondoTema.append(l);
  });
  [[10, 60], [62, 8]].forEach(([x, y]) => {
    const c = el('div', 'constelacion');
    c.innerHTML = SVG_CONSTELACION;
    c.style.cssText = `left:${x}%;top:${y}%;`;
    fondoTema.append(c);
  });
  for (let i = 0; i < 16; i++) {
    const grande = i < 3;
    const t = grande ? azar(70, 110) : azar(14, 40);
    const b = el('span', 'boton-flota' + (grande ? ' grande' : ''));
    b.style.cssText = `left:${azar(0, 96)}%;width:${t}px;height:${t}px;` +
      `animation-duration:${grande ? azar(40, 60) : azar(20, 38)}s;animation-delay:${-azar(0, 40)}s;`;
    fondoTema.append(b);
  }
}

// De vez en cuando cruza la llave, brilla la piedra o pasa la libélula
function eventoCoraline() {
  if (document.hidden || !$('pantalla-app').classList.contains('activa')) {
    tTimeout(eventoCoraline, 8000);
    return;
  }
  const tipo = ['llave', 'piedra', 'libelula'][Math.floor(Math.random() * 3)];
  const p = el('div', 'prop-coraline ' + tipo);
  p.innerHTML = { llave: SVG_LLAVE, piedra: SVG_PIEDRA, libelula: SVG_LIBELULA }[tipo];
  p.style.top = (tipo === 'piedra' ? azar(15, 60) : azar(8, 45)) + 'vh';
  if (tipo === 'piedra') p.style.left = azar(10, 80) + 'vw';
  p.addEventListener('pointerdown', () => {
    const svg = p.querySelector('svg');
    svg.classList.remove('destello');
    void svg.getBoundingClientRect();
    svg.classList.add('destello');
    if (navigator.vibrate) navigator.vibrate(20);
  });
  document.body.append(p);
  tTimeout(() => p.remove(), tipo === 'llave' ? 10200 : tipo === 'libelula' ? 9700 : 6600);
  tTimeout(eventoCoraline, azar(14000, 28000));
}

function aplicarTema(tema) {
  if (!COLOR_TEMA[tema]) tema = 'rosa';
  limpiarTema();
  document.documentElement.dataset.tema = tema;
  guardarPref('tema', tema);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = COLOR_TEMA[tema];
  document.querySelectorAll('.tema-op').forEach((b) => b.classList.toggle('activa', b.dataset.tema === tema));

  if (tema === 'coraline') {
    cieloCoraline();
    tTimeout(eventoCoraline, 9000);
  } else if (tema === 'aurora') {
    fondoTema.append(el('div', 'aurora-banda b1'), el('div', 'aurora-banda b2'), el('div', 'aurora-banda b3'));
    crearEstrellas(45, true);
  }
}

document.querySelectorAll('.tema-op').forEach((b) => {
  b.addEventListener('click', () => aplicarTema(b.dataset.tema));
});

let temaGuardado = 'rosa';
try { temaGuardado = localStorage.getItem('tema') || 'rosa'; } catch (_) { /* sin almacenamiento */ }
aplicarTema(temaGuardado);

// =============================================
//  PARTÍCULAS AL TOCAR LA PANTALLA
// =============================================
const PARTICULAS = {
  rosa: { arriba: ['💗', '💕', '❤️', '✨'], abajo: ['🌸', '🌹'] },
  coraline: { arriba: ['⭐', '✨', '🌙'], abajo: ['🟡'] },
  aurora: { arriba: ['✨', '💚', '💜', '⭐'], abajo: ['❄️'] },
};
let particulasVivas = 0;

document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('input, textarea, iframe')) return;
  if (document.documentElement.classList.contains('sin-anim') || vistaActual === 'jardin') return;
  const set = PARTICULAS[document.documentElement.dataset.tema] || PARTICULAS.rosa;
  for (let i = 0; i < 6 && particulasVivas < 60; i++) {
    const cae = Math.random() < 0.3;
    const lista = cae ? set.abajo : set.arriba;
    const p = el('span', 'particula', lista[Math.floor(Math.random() * lista.length)]);
    p.style.left = e.clientX - 9 + 'px';
    p.style.top = e.clientY - 9 + 'px';
    p.style.fontSize = azar(14, 26) + 'px';
    p.style.setProperty('--dx', azar(-70, 70) + 'px');
    p.style.setProperty('--dy', (cae ? azar(50, 120) : -azar(60, 150)) + 'px');
    p.style.setProperty('--rot', azar(-60, 60) + 'deg');
    p.style.animationDuration = azar(1.3, 2.2) + 's';
    document.body.append(p);
    particulasVivas++;
    setTimeout(() => { p.remove(); particulasVivas--; }, 2300);
  }
}, { passive: true });

// =============================================
//  NUESTRA CANCIÓN (Spotify)
// =============================================
const SPOTIFY_RE = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|playlist|album|episode|show)\/([A-Za-z0-9]{10,30})/;
let musicaCargada = false;

function urlCancion() {
  return (pareja && pareja.cancion_url) || '';
}

function pintarMusica(url) {
  const cont = $('musica-player');
  const abrir = $('musica-abrir');
  const m = url && SPOTIFY_RE.exec(url);
  if (!m) {
    cont.replaceChildren(el('p', 'sub', esAdmin
      ? 'Aún no hay canción. Pega abajo el enlace de Spotify de "Nuestra canción".'
      : 'Aún no hay canción. Benjamin la elegirá pronto 🎶'));
    abrir.classList.add('oculto');
    return;
  }
  const [, tipo, id] = m;
  abrir.href = `https://open.spotify.com/${tipo}/${id}`;
  abrir.classList.remove('oculto');
  if (!puedeTerceros()) {
    const aviso = el('div', 'musica-aviso');
    aviso.append(el('p', 'sub', 'Para reproducir «Nuestra canción» se carga el reproductor de Spotify, que puede usar sus propias cookies. Solo se carga si lo aceptas.'));
    const b = el('button', 'btn btn-sec', 'Cargar reproductor de Spotify');
    b.type = 'button';
    b.addEventListener('click', () => guardarConsent({ prefs: puedePreferencias(), terceros: true }));
    aviso.append(b);
    cont.replaceChildren(aviso);
    return;
  }
  const f = document.createElement('iframe');
  f.src = `https://open.spotify.com/embed/${tipo}/${id}?utm_source=generator`;
  f.width = '100%';
  f.height = tipo === 'track' || tipo === 'episode' ? '152' : '352';
  f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  f.loading = 'lazy';
  f.title = 'Nuestra canción';
  f.style.border = '0';
  f.style.borderRadius = '12px';
  cont.replaceChildren(f);
}

$('musica-btn').addEventListener('click', async () => {
  const panel = $('musica-panel');
  panel.classList.toggle('abierta');
  if (!panel.classList.contains('abierta')) return;
  // Solo Benjamin puede cambiar la canción
  $('musica-form').classList.toggle('oculto', !esAdmin);
  $('musica-msg').textContent = '';
  // Trae la canción más reciente que puso Benjamin
  const { data } = await sb.from('parejas').select('cancion_url').eq('id', pareja.id).single();
  const nueva = (data && data.cancion_url) || '';
  if (!musicaCargada || nueva !== (pareja.cancion_url || '')) {
    pareja.cancion_url = nueva;
    musicaCargada = true;
    pintarMusica(nueva);
  }
});
$('musica-cerrar').addEventListener('click', () => $('musica-panel').classList.remove('abierta'));

$('musica-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!esAdmin) return;
  const msg = $('musica-msg');
  const url = $('musica-url').value.trim();
  if (!SPOTIFY_RE.test(url)) {
    msg.textContent = 'Ese enlace no parece de Spotify.';
    return;
  }
  const { error } = await sb.rpc('actualizar_cancion', { p_url: url });
  if (error) {
    msg.textContent = 'No se pudo guardar: ' + traducir(error);
    return;
  }
  pareja.cancion_url = url;
  msg.textContent = '✓ Guardada. Alondra ya puede reproducirla';
  $('musica-url').value = '';
  musicaCargada = true;
  pintarMusica(url);
});

// Atajo del ícono de la app: "Pienso en ti"
function alEntrarApp() {
  if (new URLSearchParams(location.search).get('accion') === 'corazon') {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => $('btn-corazon').click(), 700);
  }
}

// =============================================
//  APARECER SUAVEMENTE AL BAJAR POR LA PÁGINA
// =============================================
const REVELAR = [
  '#vista-inicio > :not(.corazones-fondo):not(.grid-2):not(.stats)',
  '#vista-inicio .grid-2 > *',
  '#vista-inicio .stats > *',
  '#vista-muro > :not(#lista-publicaciones)',
  '#vista-muro .post',
  '#vista-planes > :not(#lista-planes)',
  '#vista-perfil > *',
].join(',');

const observador = 'IntersectionObserver' in window
  ? new IntersectionObserver((entradas) => {
    let n = 0;
    entradas.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.style.transitionDelay = n++ * 90 + 'ms';
      en.target.classList.add('visible');
      observador.unobserve(en.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' })
  : null;

function etiquetarBotones() {
  document.querySelectorAll('.post-borrar:not([aria-label])').forEach((b) => b.setAttribute('aria-label', b.title || 'Borrar'));
}

function prepararRevelado() {
  etiquetarBotones();
  document.querySelectorAll(REVELAR).forEach((nodo) => {
    if (nodo.dataset.rev) return;
    nodo.dataset.rev = '1';
    if (!observador) return;
    nodo.classList.add('revela');
    observador.observe(nodo);
  });
}

let revTimer = null;
new MutationObserver(() => {
  clearTimeout(revTimer);
  revTimer = setTimeout(prepararRevelado, 40);
}).observe(document.querySelector('main'), { childList: true, subtree: true });
prepararRevelado();

// =============================================
//  DESCARGAR MIS DATOS (derecho de acceso y portabilidad)
// =============================================
$('btn-descargar').addEventListener('click', async () => {
  const msg = $('datos-msg');
  msg.textContent = 'Preparando tus datos…';
  try {
    const [perfilR, posts, plns, msgs] = await Promise.all([
      sb.from('perfiles').select('id, nombre, animo, animo_en, avatar_path, creado_en').eq('id', usuario.id).single(),
      sb.from('publicaciones').select('*').eq('autor_id', usuario.id),
      sb.from('planes').select('*').eq('autor_id', usuario.id),
      sb.from('mensajes').select('*').eq('autor_id', usuario.id),
    ]);
    const datos = {
      exportado_en: new Date().toISOString(),
      cuenta: { id: usuario.id, correo_interno: usuario.email },
      perfil: perfilR.data,
      publicaciones: posts.data,
      planes: plns.data,
      corazones_y_mensajes: msgs.data,
      nota: 'Las fotos y videos se guardan como archivos; aquí aparece su ruta (archivo_path).',
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nosotros-mis-datos.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    msg.textContent = '✓ Listo: se descargó nosotros-mis-datos.json';
  } catch (err) {
    msg.textContent = 'No se pudo preparar la descarga: ' + traducir(err);
  }
});

// =============================================
//  BLOQUEO POR INACTIVIDAD: a los 15 minutos vuelve a pedir el código.
//  La sesión NO se cierra: solo se oculta la app hasta escribir el código.
// =============================================
const INACTIVIDAD_MS = 15 * 60 * 1000;

['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach((ev) => {
  document.addEventListener(ev, () => { ultimaActividad = Date.now(); }, { passive: true, capture: true });
});

function bloquearPorInactividad() {
  if (!desbloqueado || !usuario) return;
  desbloqueado = false;
  $('musica-panel').classList.remove('abierta');
  $('visor').classList.add('oculto');
  $('codigo-sub').textContent = 'Sesión bloqueada por inactividad. Escribe el código para continuar.';
  mostrar('codigo');
}

function revisarInactividad() {
  if (desbloqueado && usuario && Date.now() - ultimaActividad > INACTIVIDAD_MS) bloquearPorInactividad();
}

setInterval(revisarInactividad, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarInactividad(); });
window.addEventListener('focus', revisarInactividad);
window.addEventListener('pageshow', revisarInactividad);

// =============================================
//  JARDÍN: flores, mariposas, libélulas y Mavis
// =============================================
const jardin = $('jardin');
const capaFlores = $('j-capa');
const capaAire = $('j-aire');
let jardinListo = false;
let jardinAncho0 = 0;
const flores = [];        // { el, frio }
const voladores = [];     // mariposas y libélulas
let atraer = null;        // { x, y, hasta, id }
let atraerId = 0;
let jardinUlt = 0;
let jardinSniff = 0;
let saltoFrio = 0;

const TULIPANES = [
  ['#e63946', '#b5202d'], ['#ffd166', '#e0a800'], ['#ff8fab', '#e0587c'], ['#9b5de5', '#6d38b5'],
  ['#ff9f1c', '#d97706'], ['#ffffff', '#d3d3e6'], ['#f15bb5', '#c2298a'],
];
const ALAS = [['#ff9f1c', '#ffd166'], ['#4cc9f0', '#a0e7ff'], ['#f15bb5', '#ffb3d9'], ['#ffd60a', '#fff3a0'], ['#9b5de5', '#d4b8ff'], ['#ffffff', '#cfe8ff']];

const HOJA = '#4fa64a';
const TALLO = '#3f8f3f';

function svgTulipan([c, oscuro]) {
  return `<svg viewBox="0 0 50 120" aria-hidden="true">
  <path d="M25 118 C24 92 26 72 25 54" fill="none" stroke="${TALLO}" stroke-width="3" stroke-linecap="round"/>
  <path d="M25 112 C9 100 6 78 12 64 C21 78 24 96 25 112Z" fill="${HOJA}"/>
  <path d="M25 104 C40 94 44 76 39 62 C31 74 27 90 25 104Z" fill="#5cb85c"/>
  <path d="M11 28 C9 46 17 60 25 60 C33 60 41 46 39 28 C35 33 30 22 25 17 C20 22 15 33 11 28Z" fill="${oscuro}"/>
  <path d="M14 30 C15 48 21 60 25 60 C29 60 35 48 36 30 C32 35 28 26 25 20 C22 26 18 35 14 30Z" fill="${c}"/>
  <ellipse cx="20" cy="38" rx="2.4" ry="8" fill="#fff" opacity=".28" transform="rotate(8 20 38)"/>
</svg>`;
}

function svgPeonia() {
  const cx = 45, cy = 42;
  let p = '';
  const capa = (n, r, rx, ry, color, rot) => {
    for (let i = 0; i < n; i++) {
      p += `<ellipse cx="${cx}" cy="${cy - r}" rx="${rx}" ry="${ry}" fill="${color}" stroke="rgba(255,255,255,.35)" stroke-width=".8" transform="rotate(${(360 / n) * i + rot} ${cx} ${cy})"/>`;
    }
  };
  capa(8, 20, 15, 19, '#f8b4cf', 0);
  capa(7, 13, 12, 15, '#f18cb4', 20);
  capa(5, 6, 9, 11, '#e86a9d', 10);
  return `<svg viewBox="0 0 90 130" aria-hidden="true">
  <path d="M45 128 C44 106 46 84 45 66" fill="none" stroke="${TALLO}" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M45 118 C24 108 16 90 22 76 C34 88 42 102 45 118Z" fill="${HOJA}"/>
  <path d="M45 108 C66 100 74 82 68 70 C56 80 48 94 45 108Z" fill="#5cb85c"/>
  ${p}
  <circle cx="${cx}" cy="${cy}" r="5.5" fill="#ffd166"/>
  <g fill="#e09f00"><circle cx="43" cy="40" r="1"/><circle cx="47" cy="41" r="1"/><circle cx="45" cy="45" r="1"/></g>
</svg>`;
}

function svgNarciso() {
  let p = '';
  for (let i = 0; i < 6; i++) {
    p += `<ellipse cx="30" cy="16" rx="8" ry="15" fill="#fff7c2" stroke="#f3e08a" stroke-width=".8" transform="rotate(${i * 60} 30 32)"/>`;
  }
  return `<svg viewBox="0 0 60 110" aria-hidden="true">
  <path d="M30 108 C29 84 31 60 30 40" fill="none" stroke="${TALLO}" stroke-width="3" stroke-linecap="round"/>
  <path d="M30 104 C14 92 10 70 16 56 C24 70 28 88 30 104Z" fill="${HOJA}"/>
  ${p}
  <ellipse cx="30" cy="32" rx="8" ry="6" fill="#ffb703"/>
  <ellipse cx="30" cy="30" rx="5.5" ry="3.6" fill="#e07a00"/>
</svg>`;
}

function svgJacinto(color = '#8e6bd8') {
  let f = '';
  for (let i = 0; i < 15; i++) {
    const y = 58 - i * 3.4;
    const w = 11 - i * 0.55;
    f += `<circle cx="${25 - w * 0.45}" cy="${y}" r="${4.6 - i * .15}" fill="${color}"/><circle cx="${25 + w * 0.45}" cy="${y - 1.6}" r="${4.6 - i * .15}" fill="${color}"/>`;
  }
  return `<svg viewBox="0 0 50 120" aria-hidden="true">
  <path d="M25 118 C24 96 26 80 25 56" fill="none" stroke="${TALLO}" stroke-width="3" stroke-linecap="round"/>
  <path d="M25 116 C8 104 6 84 12 70 C20 84 24 100 25 116Z" fill="${HOJA}"/>
  <path d="M25 116 C42 104 44 84 38 70 C30 84 26 100 25 116Z" fill="#5cb85c"/>
  ${f}
</svg>`;
}

function svgBulbo() {
  return `<svg viewBox="0 0 50 64" aria-hidden="true">
  <path d="M25 44 C22 30 23 20 25 12" fill="none" stroke="${TALLO}" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M25 40 C13 36 9 26 12 18 C19 24 23 32 25 40Z" fill="${HOJA}"/>
  <path d="M25 36 C37 32 41 22 38 14 C31 20 27 28 25 36Z" fill="#5cb85c"/>
  <ellipse cx="25" cy="9" rx="4.5" ry="6" fill="#ff8fab"/>
  <path d="M25 62 C13 62 9 52 14 46 C18 42 22 42 25 40 C28 42 32 42 36 46 C41 52 37 62 25 62Z" fill="#d9b382"/>
  <path d="M25 40 C21 48 21 56 25 62 M25 40 C29 48 29 56 25 62" fill="none" stroke="#b98d5c" stroke-width="1"/>
  <path d="M21 62 l-3 3 M25 62 v4 M29 62 l3 3" stroke="#a37845" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;
}

function svgBugambilia() {
  const cols = ['#d81b60', '#ff5c8a', '#8e24aa', '#ff7043', '#e91e8c'];
  let s = '';
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    pts.push([10 + t * 120, 64 - Math.sin(t * Math.PI) * 36 + (i % 2 ? 5 : -5)]);
  }
  pts.forEach(([x, y], i) => {
    s += `<ellipse cx="${x + 3}" cy="${y + 8}" rx="4.5" ry="9" fill="${HOJA}" transform="rotate(${(i % 2 ? 30 : -30)} ${x + 3} ${y + 8})"/>`;
  });
  pts.forEach(([x, y], i) => {
    const col = cols[i % cols.length];
    for (let k = 0; k < 3; k++) {
      s += `<ellipse cx="${x}" cy="${y - 6}" rx="5.4" ry="7.4" fill="${col}" stroke="rgba(255,255,255,.3)" stroke-width=".6" transform="rotate(${k * 120 + (i * 23) % 60} ${x} ${y})"/>`;
    }
    s += `<circle cx="${x}" cy="${y}" r="1.7" fill="#fff8dc"/>`;
  });
  return `<svg viewBox="0 0 140 100" aria-hidden="true">
  <path d="M4 72 Q40 6 72 42 T138 48" fill="none" stroke="#7a5230" stroke-width="3.4" stroke-linecap="round"/>
  ${s}
</svg>`;
}

function svgMariposa([a, b]) {
  return `<svg viewBox="0 0 40 34" aria-hidden="true">
  <g class="alas">
    <path d="M20 17 C8 1 0 6 3 16 C5 23 12 24 20 17Z" fill="${a}"/>
    <path d="M20 18 C10 22 6 30 12 31 C17 32 20 25 20 18Z" fill="${b}"/>
    <path d="M20 17 C32 1 40 6 37 16 C35 23 28 24 20 17Z" fill="${a}"/>
    <path d="M20 18 C30 22 34 30 28 31 C23 32 20 25 20 18Z" fill="${b}"/>
    <circle cx="9" cy="13" r="2" fill="#fff" opacity=".7"/><circle cx="31" cy="13" r="2" fill="#fff" opacity=".7"/>
  </g>
  <ellipse cx="20" cy="18" rx="1.7" ry="8" fill="#3a2a2a"/>
  <path d="M19 10 C17 6 15 4 13 4 M21 10 C23 6 25 4 27 4" fill="none" stroke="#3a2a2a" stroke-width=".9" stroke-linecap="round"/>
</svg>`;
}

function svgLibelulaJ() {
  return `<svg viewBox="0 0 90 60" aria-hidden="true">
  <g class="ala"><ellipse cx="34" cy="21" rx="24" ry="8" fill="#bfe9ff" fill-opacity=".7" stroke="#6bb6d6" stroke-width="1" transform="rotate(-20 34 21)"/></g>
  <g class="ala b"><ellipse cx="38" cy="38" rx="24" ry="7" fill="#bfe9ff" fill-opacity=".65" stroke="#6bb6d6" stroke-width="1" transform="rotate(18 38 38)"/></g>
  <path d="M42 30 Q14 32 4 44" fill="none" stroke="#1fa6b8" stroke-width="3.2" stroke-linecap="round"/>
  <g fill="#0e7c8c"><circle cx="16" cy="38" r="1.8"/><circle cx="26" cy="34" r="1.8"/><circle cx="34" cy="32" r="1.8"/></g>
  <ellipse cx="47" cy="30" rx="8" ry="5.5" fill="#1fa6b8"/>
  <circle cx="56" cy="28" r="3.2" fill="#ff6b6b"/><circle cx="56" cy="34" r="3.2" fill="#ff6b6b"/>
</svg>`;
}

// ---------- construir el jardín ----------
function tamanoJardin() {
  const r = jardin.getBoundingClientRect();
  return { r, W: r.width, H: r.height };
}

function plantar(x, y, tipo, animar) {
  const { W, H } = tamanoJardin();
  const prof = Math.min(1, Math.max(0, (y - H * 0.6) / (H * 0.4)));   // 0 = lejos, 1 = cerca
  const esc = 0.7 + prof * 0.6;
  const elegido = tipo || ['tulipan', 'tulipan', 'tulipan', 'peonia', 'narciso', 'jacinto', 'bulbo'][Math.floor(Math.random() * 7)];
  const base = { tulipan: 44, peonia: 84, narciso: 54, jacinto: 44, bulbo: 40 }[elegido];
  const svg = {
    tulipan: () => svgTulipan(TULIPANES[Math.floor(Math.random() * TULIPANES.length)]),
    peonia: svgPeonia,
    narciso: svgNarciso,
    jacinto: () => svgJacinto(['#8e6bd8', '#5b8def', '#e070c0'][Math.floor(Math.random() * 3)]),
    bulbo: svgBulbo,
  }[elegido]();
  const w = base * esc;
  const f = el('div', 'flor' + (animar ? ' nace' : ''));
  f.style.width = w + 'px';
  f.style.left = x - w / 2 + 'px';
  f.style.bottom = Math.max(0, H - y) + 'px';
  f.style.zIndex = String(Math.round(y));
  f.style.setProperty('--dur', azar(3, 5.5) + 's');
  f.style.setProperty('--del', -azar(0, 4) + 's');
  const dentro = el('div', 'flor-i');
  dentro.innerHTML = svg;
  f.append(dentro);
  capaFlores.append(f);
  flores.push({ el: f, frio: 0 });
  if (flores.length > 44) {
    const vieja = flores.shift();
    vieja.el.classList.add('se-va');
    setTimeout(() => vieja.el.remove(), 700);
  }
  return f;
}

function nuevoDestino(v, W, H) {
  v.tx = azar(W * 0.06, W * 0.94);
  v.ty = azar(H * 0.08, v.tipo === 'libelula' ? H * 0.5 : H * 0.62);
}

function petalos(x, y, n) {
  for (let i = 0; i < n; i++) {
    const p = el('span', 'petalo-j');
    p.style.left = x + azar(-14, 14) + 'px';
    p.style.top = y + 'px';
    p.style.setProperty('--dx', azar(-40, 40) + 'px');
    p.style.setProperty('--dy', azar(50, 110) + 'px');
    p.style.background = ['#ffb3d9', '#ffffff', '#ffd6e8', '#ffe066'][Math.floor(Math.random() * 4)];
    capaAire.append(p);
    setTimeout(() => p.remove(), 2400);
  }
}

function construirJardin() {
  const { W, H } = tamanoJardin();
  if (W < 50 || H < 50) return false;
  jardinAncho0 = W;
  capaFlores.replaceChildren();
  capaAire.replaceChildren();
  flores.length = 0;
  voladores.length = 0;

  // arbustos de bugambilia sobre las colinas
  [['izq', 0.0], ['der', 1.0]].forEach(([lado]) => {
    const b = el('div', 'bugambilia ' + lado);
    b.innerHTML = svgBugambilia();
    capaFlores.append(b);
  });

  // flores iniciales repartidas por el pasto
  const n = Math.max(9, Math.min(22, Math.round(W / 55)));
  for (let i = 0; i < n; i++) {
    plantar(azar(W * 0.03, W * 0.97), azar(H * 0.66, H * 0.97), null, false);
  }

  // mariposas y libélulas
  for (let i = 0; i < 6; i++) crearVolador('mariposa', W, H);
  for (let i = 0; i < 2; i++) crearVolador('libelula', W, H);
  jardinListo = true;
  return true;
}

function crearVolador(tipo, W, H) {
  const nodo = el('div', 'volador ' + tipo);
  nodo.innerHTML = tipo === 'mariposa' ? svgMariposa(ALAS[Math.floor(Math.random() * ALAS.length)]) : svgLibelulaJ();
  const v = {
    el: nodo, tipo, x: azar(0, W), y: azar(H * 0.1, H * 0.5), tx: 0, ty: 0, dir: 1,
    vel: tipo === 'mariposa' ? azar(38, 62) : azar(90, 130), fase: azar(0, 6.28),
    estado: 'vuela', hasta: 0, turbo: 0, atr: 0,
  };
  nuevoDestino(v, W, H);
  nodo.style.width = (tipo === 'mariposa' ? azar(26, 36) : azar(54, 66)) + 'px';
  nodo.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const { W: w2, H: h2 } = tamanoJardin();
    v.estado = 'vuela';
    nodo.classList.remove('posada');
    v.turbo = performance.now() / 1000 + 2;
    v.tx = v.x < w2 / 2 ? azar(w2 * 0.6, w2 * 0.95) : azar(w2 * 0.05, w2 * 0.4);
    v.ty = azar(h2 * 0.06, h2 * 0.4);
  });
  capaAire.append(nodo);
  voladores.push(v);
}

// ---------- movimiento ----------
function moverVolador(v, dt, ts, r) {
  const W = r.width;
  const H = r.height;
  if (v.estado === 'posada') {
    if (ts > v.hasta) {
      v.estado = 'vuela';
      v.el.classList.remove('posada');
      nuevoDestino(v, W, H);
    } else {
      v.el.style.transform = `translate(${v.x}px, ${v.y}px) scaleX(${v.dir})`;
      return;
    }
  }
  if (atraer && ts < atraer.hasta && v.atr !== atraer.id) {
    v.atr = atraer.id;
    v.tx = atraer.x + azar(-50, 50);
    v.ty = atraer.y + azar(-40, 30);
  }
  const dx = v.tx - v.x;
  const dy = v.ty - v.y;
  const d = Math.hypot(dx, dy);
  if (d < 12) {
    const suerte = Math.random();
    if (v.tipo === 'mariposa' && suerte < 0.32 && flores.length) {
      // se posa en una flor
      const f = flores[Math.floor(Math.random() * flores.length)];
      const fr = f.el.getBoundingClientRect();
      v.x = fr.left - r.left + fr.width / 2 - v.el.offsetWidth / 2;
      v.y = fr.top - r.top - v.el.offsetHeight * 0.4;
      v.estado = 'posada';
      v.hasta = ts + azar(2.5, 5);
      v.el.classList.add('posada');
    } else if (v.tipo === 'libelula' && suerte < 0.4) {
      v.estado = 'posada';
      v.hasta = ts + azar(1, 2.2);
    } else {
      nuevoDestino(v, W, H);
    }
    return;
  }
  const vel = v.vel * (ts < v.turbo ? 1.9 : 1);
  v.x += (dx / d) * vel * dt;
  v.y += (dy / d) * vel * dt;
  if (Math.abs(dx) > 6) v.dir = dx >= 0 ? 1 : -1;
  const bob = Math.sin(ts * (v.tipo === 'libelula' ? 9 : 6) + v.fase) * (v.tipo === 'libelula' ? 2 : 7);
  v.el.style.transform = `translate(${v.x}px, ${v.y + bob}px) scaleX(${v.dir})`;
}

// Mavis olfatea las flores y persigue (y asusta) a las mariposas bajas
function mavisEnJardin(r) {
  if (mavis.classList.contains('oculta')) return;
  const ahora = performance.now();
  const cx = mvX + mvAncho / 2;

  if (mvModo === 'camina') {
    for (const f of flores) {
      if (ahora < f.frio) continue;
      const fr = f.el.getBoundingClientRect();
      const fcx = fr.left + fr.width / 2;
      if (Math.abs(fcx - cx) < Math.max(28, fr.width * 0.4) && fr.bottom > r.top + r.height * 0.6) {
        f.frio = ahora + 12000;
        mvCambiarModo('interaccion', 1500);
        mavis.classList.add('olfatea');
        setTimeout(() => mavis.classList.remove('olfatea'), 1400);
        f.el.classList.add('olfateada');
        setTimeout(() => f.el.classList.remove('olfateada'), 1500);
        petalos(fcx - r.left, fr.top - r.top + 8, 4);
        return;
      }
    }
  }

  let cerca = null;
  let dmin = 9999;
  let dxc = 0;
  voladores.forEach((v) => {
    if (v.tipo !== 'mariposa' || v.y < r.height * 0.4) return;
    const dx = v.x + r.left + v.el.offsetWidth / 2 - cx;
    if (Math.abs(dx) < dmin) { dmin = Math.abs(dx); cerca = v; dxc = dx; }
  });
  if (cerca && dmin < 260) {
    if (mvModo === 'pausa') mvCambiarModo('camina', 3000);
    if (mvModo === 'camina') mvDir = dxc >= 0 ? 1 : -1;
    if (dmin < 70 && ahora > saltoFrio) {
      saltoFrio = ahora + 7000;
      mvEstado('feliz', 800);
      cerca.turbo = ahora / 1000 + 1.6;
      cerca.estado = 'vuela';
      cerca.el.classList.remove('posada');
      cerca.tx = cerca.x < r.width / 2 ? azar(r.width * 0.6, r.width * 0.95) : azar(r.width * 0.05, r.width * 0.4);
      cerca.ty = azar(r.height * 0.06, r.height * 0.35);
    }
  }
}

function jardinBucle(t) {
  requestAnimationFrame(jardinBucle);
  if (vistaActual !== 'jardin' || !jardinListo || document.documentElement.classList.contains('sin-anim')) {
    jardinUlt = t;
    return;
  }
  const dt = Math.min(0.05, (t - (jardinUlt || t)) / 1000);
  jardinUlt = t;
  const r = jardin.getBoundingClientRect();
  voladores.forEach((v) => moverVolador(v, dt, t / 1000, r));
  if (t - jardinSniff > 350) {
    jardinSniff = t;
    mavisEnJardin(r);
  }
}

// ---------- interacción ----------
jardin.addEventListener('pointerdown', (e) => {
  $('j-pista').classList.add('oculto');
  const flor = e.target.closest('.flor');
  const { r, H } = tamanoJardin();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (flor) {
    flor.classList.remove('olfateada');
    void flor.offsetWidth;
    flor.classList.add('olfateada');
    setTimeout(() => flor.classList.remove('olfateada'), 1500);
    petalos(x, y, 5);
    if (navigator.vibrate) navigator.vibrate(15);
    return;
  }
  if (y > H * 0.6) {
    plantar(x, y, null, true);
    petalos(x, y - 20, 4);
    if (navigator.vibrate) navigator.vibrate(15);
  } else {
    atraer = { x, y, hasta: performance.now() / 1000 + 4, id: ++atraerId };
    petalos(x, y, 3);
  }
});

function entrarAlJardin() {
  const { W } = tamanoJardin();
  if (!jardinListo || Math.abs(W - jardinAncho0) > 80) construirJardin();
  setTimeout(() => $('j-pista').classList.add('oculto'), 9000);
}

// pétalos que caen suavemente de vez en cuando
setInterval(() => {
  if (vistaActual !== 'jardin' || !jardinListo || document.hidden || document.documentElement.classList.contains('sin-anim')) return;
  if (capaAire.querySelectorAll('.petalo-caida').length > 8) return;
  const { W } = tamanoJardin();
  const p = el('span', 'petalo-caida');
  p.style.left = azar(0, W) + 'px';
  p.style.setProperty('--dx', azar(-60, 60) + 'px');
  p.style.background = ['#ffb3d9', '#ffffff', '#ffd6e8', '#ffe066', '#e6b3ff'][Math.floor(Math.random() * 5)];
  capaAire.append(p);
  setTimeout(() => p.remove(), 9000);
}, 2200);

requestAnimationFrame(jardinBucle);
