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
  else salirDelJardin();
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
let mvEnJardin = false;      // dentro del jardín camina entre las plantas
let mvY = 0;                 // (jardín) posición de los pies desde arriba
let mvYObj = 0;

function mvCambiarModo(modo, ms) {
  mvModo = modo;
  mvHasta = performance.now() + ms;
  mavis.classList.toggle('camina', modo === 'camina');
}

function mvPonerX() {
  mavis.classList.toggle('izquierda', mvDir < 0);
  if (mavis.classList.contains('en-hamaca')) return;
  if (mvEnJardin) { posicionarMavisJardin(); return; }
  mavis.style.left = mvX + 'px';
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

  // se queda dormida si nadie la toca en un buen rato; despierta sola después de unos minutos
  if (gato3d && (mvModo === 'camina' || mvModo === 'pausa') && !mavis.classList.contains('en-hamaca') && t - mvUltimoToque > 45000) mvDormir(t);
  if (mvModo === 'duerme' && t - mvDormidaDesde > 180000) mvDespertar(true);

  if (mvEnJardin && mvModo !== 'descanso' && mvModo !== 'duerme') {
    // camina entre las plantas y va cambiando de profundidad
    mvY += (mvYObj - mvY) * Math.min(1, dt * 0.9);
    if (mvModo !== 'juego' && Math.abs(mvYObj - mvY) < 6 && Math.random() < dt * 0.15) mvYObj = azar(jardinH * 0.7, jardinH * 0.96);
  }
  if (mvModo === 'camina') {
    mvX += mvDir * (mvEnJardin ? 30 : 42) * dt;
    const ancho = mvEnJardin ? jardinW : window.innerWidth;
    const izqMin = mvEnJardin ? jardinLeft : 0;
    const max = izqMin + ancho - (mvEnJardin ? anchoMavisJardin() : mvAncho);
    if (mvX <= izqMin) { mvX = izqMin; mvDir = 1; }
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
  } else if (mvModo === 'juego') {
    jugarTick(dt, t);
  }
  if (mvEnJardin && mvModo !== 'camina' && mvModo !== 'juego') mvPonerX();
  if (gato3d) gato3d.tick(dt, estado3D());
}

function mvEstado(clase, ms) {
  if (clase === 'feliz' && gato3d) gato3d.salto();
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
const mvSvg = mavis.querySelector('.mv-salto');
mvSvg.addEventListener('pointerdown', () => {
  mvNombre();
  mvPresion = setTimeout(() => {
    mvPresion = 'largo';
    mvUltimoToque = performance.now();
    if (mvModo === 'duerme') mvDespertar(false);
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
    if (!largo && ev === 'pointerup') tocarMavis();
  });
});


// =============================================
//  MAVIS EN 3D, SIESTA Y BOLA DE HILO
// =============================================
const SVG_BOLA = `
<svg viewBox="-4 -4 48 48" aria-hidden="true">
  <defs>
    <radialGradient id="mvHiloG" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#ff8a9a"/><stop offset=".5" stop-color="#d8384f"/><stop offset="1" stop-color="#8a1a30"/></radialGradient>
  </defs>
  <path d="M30 34 C40 38 46 30 40 24" fill="none" stroke="#d8384f" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="20" cy="20" r="17" fill="url(#mvHiloG)"/>
  <g fill="none" stroke-linecap="round">
    <path d="M5 17 C10 5 30 4 35 17" stroke="rgba(255,205,212,.55)" stroke-width="1.3"/>
    <path d="M4 22 C12 10 30 12 36 24" stroke="rgba(255,170,182,.45)" stroke-width="1.2"/>
    <path d="M6 27 C14 16 28 20 35 30" stroke="rgba(255,205,212,.4)" stroke-width="1.2"/>
    <path d="M9 32 C16 24 26 27 31 35" stroke="rgba(120,10,30,.4)" stroke-width="1.2"/>
    <path d="M7 12 C15 20 26 18 33 9" stroke="rgba(120,10,30,.35)" stroke-width="1.1"/>
    <path d="M13 4 C11 16 14 28 22 36" stroke="rgba(255,190,200,.4)" stroke-width="1.1"/>
    <path d="M26 4 C30 14 30 26 24 37" stroke="rgba(110,8,26,.35)" stroke-width="1.1"/>
  </g>
  <ellipse cx="14" cy="12" rx="6" ry="3.6" fill="rgba(255,255,255,.4)" transform="rotate(-30 14 12)"/>
</svg>`;

let gato3d = null;
let mvUltimoToque = performance.now();
let mvDormidaDesde = 0;
let mvCorriendo = false;
let bola = null;            // { el, x, y, vx, giro }
let juegoFase = '';         // corre | agazapa | golpe
let juegoHasta = 0;
let faseHasta = 0;
let golpeado = false;

function activar3D() {
  if (gato3d) return;
  import('./gato3d.js').then((m) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'mavis-3d';
    canvas.setAttribute('aria-hidden', 'true');
    const g = m.crearGato3D(canvas);
    if (!g) return;
    mavis.querySelector('.mv-salto').prepend(canvas);
    gato3d = g;
    mavis.classList.add('en-3d');
  }).catch(() => { /* se queda el dibujo 2D */ });
}
window.addEventListener('load', () => setTimeout(activar3D, 700));

function estado3D() {
  const ancho = mvEnJardin ? anchoMavisJardin() : mvAncho;
  const vel = mvModo === 'juego' ? (mvEnJardin ? 70 : 95) : (mvEnJardin ? 30 : 42);
  return {
    camina: (mvModo === 'camina' || (mvModo === 'juego' && mvCorriendo)) && !mavis.classList.contains('en-hamaca'),
    velUnidades: vel / (ancho / 4.6),
    dormida: mvModo === 'duerme' || mavis.classList.contains('en-hamaca'),
    agazapada: mvModo === 'juego' && juegoFase === 'agazapa',
    olfatea: mavis.classList.contains('olfatea'),
    ronronea: mavis.classList.contains('ronronea'),
    feliz: mavis.classList.contains('feliz'),
  };
}

// ---------- dormir y despertar ----------
function mvDormir(ahora) {
  mvModo = 'duerme';
  mvDormidaDesde = ahora;
  mavis.classList.add('duerme');
  mavis.classList.remove('camina');
  terminarJuego(true);
}

function mvDespertar(volverACaminar) {
  if (mvModo !== 'duerme') return;
  mavis.classList.remove('duerme');
  mvUltimoToque = performance.now();
  if (gato3d) gato3d.estirar();
  mvCambiarModo(volverACaminar ? 'camina' : 'interaccion', volverACaminar ? 5000 : 1400);
}

// ---------- bola de hilo ----------
function limitesJuego() {
  return mvEnJardin
    ? [jardinLeft + 14, jardinLeft + jardinW - 14]
    : [14, window.innerWidth - 14];
}

function anchoBola() {
  if (!mvEnJardin) return 28;
  const prof = limitar((bola.y - jardinH * 0.6) / (jardinH * 0.4), 0, 1);
  return 22 + prof * 12;
}

function pintarBola() {
  if (!bola) return;
  const w = anchoBola();
  const e = bola.el;
  e.style.width = w + 'px';
  if (mvEnJardin) {
    e.style.left = bola.x - jardinLeft - w / 2 + 'px';
    e.style.top = bola.y - w * 1.02 + 'px';
    e.style.zIndex = String(Math.round(bola.y) + 1);
  } else {
    e.style.left = bola.x - w / 2 + 'px';
  }
  e.firstElementChild.style.transform = `rotate(${bola.giro}deg)`;
}

function crearBola() {
  const e = el('div', 'bola-hilo cae' + (mvEnJardin ? ' en-jardin' : ''));
  e.innerHTML = SVG_BOLA;
  e.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    patearBola(ev.clientX);
  });
  (mvEnJardin ? capaFlores : $('pantalla-app')).append(e);
  return { el: e, x: 0, y: mvEnJardin ? mvY : 0, vx: 0, giro: 0 };
}

function iniciarJuego() {
  if (!gato3d || mvModo === 'duerme' || mavis.classList.contains('en-hamaca') || mavis.classList.contains('oculta')) return;
  const ancho = mvEnJardin ? anchoMavisJardin() : mvAncho;
  const [izq, der] = limitesJuego();
  if (!bola) bola = crearBola();
  bola.y = mvEnJardin ? mvY : 0;
  bola.x = limitar(mvX + ancho / 2 + mvDir * ancho * 1.05, izq, der);
  bola.vx = mvDir * 80;
  bola.el.classList.remove('se-va');
  mvModo = 'juego';
  mavis.classList.remove('camina');
  juegoFase = 'corre';
  juegoHasta = performance.now() + 12000;
  pintarBola();
}

function patearBola(clienteX) {
  if (!bola) return;
  mvUltimoToque = performance.now();
  const dir = clienteX < bola.x ? 1 : -1;
  bola.vx = dir * (260 + Math.random() * 120);
  bola.el.classList.remove('cae');
  if (mvModo !== 'juego') {
    if (mvModo === 'duerme') { mvDespertar(false); setTimeout(iniciarJuego, 900); return; }
    mvModo = 'juego';
    juegoFase = 'corre';
  }
  juegoHasta = performance.now() + 10000;
}

function terminarJuego(inmediato) {
  if (bola) {
    const b = bola;
    bola = null;
    if (inmediato) b.el.remove();
    else { b.el.classList.add('se-va'); setTimeout(() => b.el.remove(), 700); }
  }
  juegoFase = '';
  mvCorriendo = false;
  if (mvModo === 'juego') mvCambiarModo('camina', 3000 + Math.random() * 3000);
}

function jugarTick(dt, t) {
  if (!bola) { terminarJuego(true); return; }
  const ancho = mvEnJardin ? anchoMavisJardin() : mvAncho;
  const [izq, der] = limitesJuego();

  // la bola rueda y se frena
  bola.x += bola.vx * dt;
  bola.vx *= Math.pow(0.3, dt);
  if (Math.abs(bola.vx) < 6) bola.vx = 0;
  bola.giro += bola.vx * dt * 2.4;
  if (bola.x < izq) { bola.x = izq; bola.vx = Math.abs(bola.vx) * 0.6; }
  if (bola.x > der) { bola.x = der; bola.vx = -Math.abs(bola.vx) * 0.6; }

  const dx = bola.x - (mvX + ancho / 2);
  mvCorriendo = false;
  if (mvEnJardin) mvYObj = bola.y;
  if (juegoFase === 'corre') {
    mvDir = dx >= 0 ? 1 : -1;
    if (Math.abs(dx) > ancho * 0.62) {
      mvX += mvDir * (mvEnJardin ? 70 : 95) * dt;
      mvCorriendo = true;
    } else if (Math.abs(bola.vx) < 40) {
      juegoFase = 'agazapa';
      faseHasta = t + 450 + Math.random() * 500;
    }
  } else if (juegoFase === 'agazapa') {
    mvDir = dx >= 0 ? 1 : -1;
    if (t > faseHasta) {
      juegoFase = 'golpe';
      golpeado = false;
      faseHasta = t + 340;
      if (gato3d) gato3d.zarpazo();
    }
  } else if (juegoFase === 'golpe') {
    if (!golpeado && t > faseHasta - 200) {
      golpeado = true;
      bola.vx = mvDir * (240 + Math.random() * 190);
    }
    if (t > faseHasta) juegoFase = 'corre';
  }
  mvX = limitar(mvX, izq - ancho * 0.3, der - ancho * 0.7);
  mvPonerX();
  pintarBola();
  if (t > juegoHasta) terminarJuego(false);
}

// Toque en Mavis: despierta, se emociona y juega con la bola de hilo
function tocarMavis() {
  mvUltimoToque = performance.now();
  cuidarMavis();
  mvCorazones(3);
  if (navigator.vibrate) navigator.vibrate(25);
  if (mvModo === 'duerme') {
    mvDespertar(false);
    setTimeout(iniciarJuego, 1200);
    return;
  }
  if (mavis.classList.contains('en-hamaca')) return;
  mvEstado('feliz', 900);
  setTimeout(iniciarJuego, 450);
}

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
//  JARDÍN: flores, árboles, hamaca, mariposas monarca, libélulas y Mavis
// =============================================
const jardin = $('jardin');
const capaArboles = $('j-arboles');
const capaFlores = $('j-capa');
const capaAire = $('j-aire');
let jardinListo = false;
let jardinAncho0 = 0;
let jardinW = 0;
let jardinH = 0;
let jardinLeft = 0;
const flores = [];        // { el, frio, roce, x, y }
const voladores = [];     // monarcas y libélulas
let atraer = null;        // { x, y, hasta, id }
let atraerId = 0;
let jardinUlt = 0;
let jardinSniff = 0;
let saltoFrio = 0;
let gid = 0;
let hamaca = null;        // { el, bal, slot, cx, pieY }
let irAHamaca = false;
let proximaSiesta = 0;
let descansoHasta = 0;
let mantener = null;      // { f, timer, ring, x, y }

const azarEntre = (a, b) => a + Math.random() * (b - a);
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
const elige = (lista) => lista[Math.floor(Math.random() * lista.length)];

// ---------- color ----------
function mezclar(hex, con, f) {
  const a = hex.replace('#', '');
  const b = con.replace('#', '');
  const c = (i) => Math.round(parseInt(a.substr(i, 2), 16) * (1 - f) + parseInt(b.substr(i, 2), 16) * f);
  return '#' + [0, 2, 4].map((i) => c(i).toString(16).padStart(2, '0')).join('');
}

const DEF_HOJA = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cc078"/><stop offset=".55" stop-color="#4a9a4a"/><stop offset="1" stop-color="#2a6c33"/></linearGradient>`;
const DEF_TALLO = (id) => `<linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#2f7034"/><stop offset=".5" stop-color="#58a251"/><stop offset="1" stop-color="#2a6a30"/></linearGradient>`;

// paletas: [claro, base, oscuro]
const TULIPANES = [
  { c: ['#f0606b', '#d62839', '#8f1523'] },                                   // rojo
  { c: ['#ffe98a', '#f4c430', '#b88a0a'] },                                   // amarillo
  { c: ['#f9b6cd', '#ee7ba2', '#b23a66'] },                                   // rosa
  { c: ['#c5a1ec', '#8a4fc4', '#57298c'] },                                   // morado
  { c: ['#ffc37a', '#f28c1e', '#b4560a'] },                                   // naranja
  { c: ['#ffffff', '#f1ebdf', '#c8bfa8'] },                                   // blanco
  { c: ['#ffab98', '#f2634e', '#b03323'] },                                   // coral
  { c: ['#f78ccb', '#d63a95', '#8c1660'] },                                   // fucsia
  { c: ['#c8546f', '#8f1f3d', '#4a0a1c'] },                                   // vino
  { c: ['#e6d6f8', '#bb9ce2', '#8460b8'] },                                   // lavanda
  { c: ['#ffffff', '#f1ebdf', '#c8bfa8'], borde: '#d62839' },                 // blanco con borde rojo
  { c: ['#ffe98a', '#f4c430', '#b88a0a'], borde: '#d62839' },                 // amarillo con llamas rojas
  { c: ['#ffffff', '#f4eaf2', '#cdb6cb'], borde: '#d94a9a' },                 // blanco con borde fucsia
];
const PEONIAS = [
  { a: ['#ec9dbb', '#f9d3e2'], b: ['#e07aa2', '#f4b5cd'], c: ['#cf4f82', '#ea8db1'] },   // rosa
  { a: ['#f5a08e', '#fbd0c4'], b: ['#ee7c68', '#f7b4a6'], c: ['#dc5a48', '#f09080'] },   // coral
  { a: ['#efdde0', '#fff7f7'], b: ['#e8c9ce', '#faeef0'], c: ['#dfb0ba', '#f4dadd'] },   // blanco rosado
  { a: ['#d9508f', '#f08cb8'], b: ['#c02f74', '#e46aa0'], c: ['#9c1858', '#d24a86'] },   // magenta
  { a: ['#f6d98a', '#fdf0c6'], b: ['#f0c65c', '#f9e2a0'], c: ['#e3a92f', '#f2cf72'] },   // amarillo crema
  { a: ['#b98ae0', '#e0cdf5'], b: ['#9c66cf', '#cdb0ee'], c: ['#7a44ad', '#b78ae0'] },   // lila
];
const NARCISOS = [
  { p: '#ffe066', pb: '#e6b800', copa: '#f4a300', dentro: '#c97a00' },
  { p: '#f8f4e6', pb: '#e4dcbc', copa: '#f4a300', dentro: '#d4620a' },
  { p: '#f8f4e6', pb: '#e4dcbc', copa: '#ffe066', dentro: '#e0a400' },
  { p: '#ffd24d', pb: '#dea800', copa: '#ff9a1f', dentro: '#c25a00' },
];
const JACINTOS = ['#7f5fc4', '#5079d6', '#c862ac', '#e7e0f5', '#a678d8', '#4d5fb8'];
const MARGARITAS = [
  { p: '#ffffff', c: '#f6c21c' }, { p: '#f7c4d9', c: '#f4b400' }, { p: '#ffe680', c: '#c97c10' }, { p: '#e6d4f6', c: '#f0b800' },
];
const LAVANDAS = ['#8a6cc4', '#6f7fd6', '#b58ad6', '#d8c8ee'];

// ---------- flores ----------
function svgTulipan(spec) {
  const [luz, base, osc] = spec.c;
  const g = 'g' + (++gid);
  const h = 'h' + gid;
  const t = 't' + gid;
  const b = 'b' + gid;
  const borde = spec.borde
    ? `<linearGradient id="${b}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${spec.borde}" stop-opacity="0"/><stop offset=".55" stop-color="${spec.borde}" stop-opacity=".15"/><stop offset="1" stop-color="${spec.borde}" stop-opacity=".9"/></linearGradient>`
    : '';
  const frente = 'M14 30 C15 48 21 60 25 60 C29 60 35 48 36 30 C32 35 28 26 25 20 C22 26 18 35 14 30Z';
  return `<svg viewBox="0 0 50 120" aria-hidden="true">
  <defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${luz}"/><stop offset=".5" stop-color="${base}"/><stop offset="1" stop-color="${osc}"/></linearGradient>
    <linearGradient id="${g}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${osc}"/><stop offset=".5" stop-color="${base}"/><stop offset="1" stop-color="${osc}"/></linearGradient>
    ${DEF_HOJA(h)}${DEF_TALLO(t)}${borde}
  </defs>
  <path d="M25 118 C24 92 26 72 25 54" fill="none" stroke="url(#${t})" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M25 112 C8 100 5 77 11 62 C21 77 24 96 25 112Z" fill="url(#${h})"/>
  <path d="M25 112 C14 98 12 80 12 66" fill="none" stroke="rgba(255,255,255,.35)" stroke-width=".7"/>
  <path d="M25 104 C41 94 45 75 40 60 C31 73 27 90 25 104Z" fill="url(#${h})"/>
  <path d="M25 104 C36 92 39 76 39 63" fill="none" stroke="rgba(255,255,255,.35)" stroke-width=".7"/>
  <path d="M25 58 C23 64 24 70 25 76" fill="none" stroke="#3a7d3a" stroke-width="4.2" stroke-linecap="round" opacity=".55"/>
  <path d="M11 28 C9 46 17 60 25 60 C33 60 41 46 39 28 C35 33 30 22 25 17 C20 22 15 33 11 28Z" fill="url(#${g}s)"/>
  <path d="M25 17 C27 30 30 44 25 60 C33 60 41 46 39 28 C35 33 30 22 25 17Z" fill="${osc}" opacity=".28"/>
  <path d="${frente}" fill="url(#${g})"/>
  ${spec.borde ? `<path d="${frente}" fill="url(#${b})"/>` : ''}
  <path d="M25 21 C24 34 24 48 25 59 M19 32 C20 44 23 54 25 59 M31 32 C30 44 27 54 25 59" fill="none" stroke="rgba(0,0,0,.13)" stroke-width=".7"/>
  <path d="M19 30 C18 40 20 48 22 54" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.1" stroke-linecap="round"/>
  <ellipse cx="25" cy="19.5" rx="4.5" ry="1.6" fill="${osc}" opacity=".55"/>
</svg>`;
}

function svgPeonia(pal) {
  const cx = 45;
  const cy = 42;
  const id = 'p' + (++gid);
  const h = 'h' + gid;
  const t = 't' + gid;
  let p = '';
  const capa = (n, r, rx, ry, k, rot, jit) => {
    for (let i = 0; i < n; i++) {
      const a = (360 / n) * i + rot + (Math.random() - 0.5) * jit;
      const rr = r + (Math.random() - 0.5) * 2.2;
      p += `<g transform="rotate(${a.toFixed(1)} ${cx} ${cy})"><ellipse cx="${cx}" cy="${(cy - rr).toFixed(1)}" rx="${rx}" ry="${ry}" fill="url(#${id}${k})" stroke="rgba(110,25,60,.2)" stroke-width=".7"/><path d="M${cx} ${cy - rr + ry * 0.75} C${cx - 3} ${cy - rr} ${cx - 2} ${cy - rr - ry * 0.5} ${cx} ${cy - rr - ry * 0.85} M${cx + 4} ${cy - rr + ry * 0.5} C${cx + 5} ${cy - rr} ${cx + 4} ${cy - rr - ry * 0.4} ${cx + 3} ${cy - rr - ry * 0.7}" fill="none" stroke="rgba(120,30,70,.14)" stroke-width=".6"/></g>`;
    }
  };
  capa(9, 21, 15, 19, 'a', 0, 10);
  capa(8, 15, 13, 16, 'b', 18, 12);
  capa(7, 9.5, 11, 13, 'c', 8, 14);
  capa(5, 4.5, 8, 9.5, 'c', 30, 18);
  const grad = (k, [dentro, fuera]) => `<radialGradient id="${id}${k}" cx="50%" cy="85%" r="85%"><stop offset="0" stop-color="${dentro}"/><stop offset="1" stop-color="${fuera}"/></radialGradient>`;
  let est = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    est += `<path d="M${cx} ${cy} L${(cx + Math.cos(a) * 7).toFixed(1)} ${(cy + Math.sin(a) * 7).toFixed(1)}" stroke="#d9a520" stroke-width=".8"/><circle cx="${(cx + Math.cos(a) * 7.4).toFixed(1)}" cy="${(cy + Math.sin(a) * 7.4).toFixed(1)}" r="1" fill="#f3c93e"/>`;
  }
  return `<svg viewBox="0 0 90 130" aria-hidden="true">
  <defs>${grad('a', pal.a)}${grad('b', pal.b)}${grad('c', pal.c)}${DEF_HOJA(h)}${DEF_TALLO(t)}</defs>
  <path d="M45 128 C44 106 46 84 45 66" fill="none" stroke="url(#${t})" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M45 118 C22 108 14 90 21 75 C34 87 42 102 45 118Z" fill="url(#${h})"/>
  <path d="M45 118 C31 106 25 92 24 80" fill="none" stroke="rgba(255,255,255,.3)" stroke-width=".8"/>
  <path d="M45 108 C68 100 76 82 69 69 C56 79 48 94 45 108Z" fill="url(#${h})"/>
  <path d="M45 108 C57 98 64 86 66 74" fill="none" stroke="rgba(255,255,255,.3)" stroke-width=".8"/>
  <ellipse cx="${cx}" cy="${cy + 26}" rx="13" ry="4" fill="rgba(0,0,0,.12)"/>
  ${p}
  <circle cx="${cx}" cy="${cy}" r="5.5" fill="#e6b229"/>
  ${est}
</svg>`;
}

function svgNarciso(v) {
  const h = 'h' + (++gid);
  const t = 't' + gid;
  const k = 'n' + gid;
  let p = '';
  for (let i = 0; i < 6; i++) {
    p += `<g transform="rotate(${i * 60} 30 32)"><ellipse cx="30" cy="16" rx="8.4" ry="15.5" fill="url(#${k})" stroke="${v.pb}" stroke-width=".7"/><path d="M30 30 C28.5 22 28.5 14 30 5 M27 28 C25.5 21 26 15 27.5 9 M33 28 C34.5 21 34 15 32.5 9" fill="none" stroke="rgba(0,0,0,.09)" stroke-width=".6"/></g>`;
  }
  return `<svg viewBox="0 0 60 110" aria-hidden="true">
  <defs>${DEF_HOJA(h)}${DEF_TALLO(t)}<radialGradient id="${k}" cx="50%" cy="90%" r="90%"><stop offset="0" stop-color="${mezclar(v.p, '#000000', 0.12)}"/><stop offset="1" stop-color="${v.p}"/></radialGradient>
  <linearGradient id="${k}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mezclar(v.copa, '#ffffff', 0.25)}"/><stop offset="1" stop-color="${v.copa}"/></linearGradient></defs>
  <path d="M30 108 C29 84 31 60 30 40" fill="none" stroke="url(#${t})" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M30 104 C13 92 9 69 15 55 C24 70 28 88 30 104Z" fill="url(#${h})"/>
  <path d="M30 100 C42 90 46 74 43 62 C36 73 32 88 30 100Z" fill="url(#${h})"/>
  ${p}
  <ellipse cx="30" cy="32" rx="9" ry="6.6" fill="url(#${k}c)"/>
  <path d="M21.5 31 C22 28 24 28.5 25 27.5 C26 29 27.5 27 28.5 27.6 C29.5 28.8 31 27 32 27.6 C33 28.4 34.5 27.2 35.5 27.8 C36.5 28.6 38 28.6 38.5 31" fill="none" stroke="${v.dentro}" stroke-width="1"/>
  <ellipse cx="30" cy="31" rx="6" ry="3.8" fill="${v.dentro}"/>
  <g fill="#f3d36a"><circle cx="28" cy="30.6" r=".9"/><circle cx="32" cy="30.4" r=".9"/><circle cx="30" cy="32" r=".9"/></g>
</svg>`;
}

function svgJacinto(color) {
  const h = 'h' + (++gid);
  const t = 't' + gid;
  let f = '';
  for (let i = 0; i < 22; i++) {
    const y = 60 - i * 2.4;
    const w = 11 - i * 0.38;
    const r = 3.9 - i * 0.1;
    [[-1, 0], [1, -1.6], [0, -0.8]].forEach(([lado, dy], j) => {
      const x = 25 + lado * w * 0.5;
      const col = mezclar(color, j === 0 ? '#ffffff' : '#000000', j === 0 ? 0.18 : j === 1 ? 0.12 : 0.02);
      f += `<circle cx="${x.toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="${r.toFixed(1)}" fill="${col}"/><circle cx="${(x - r * 0.25).toFixed(1)}" cy="${(y + dy - r * 0.3).toFixed(1)}" r="${(r * 0.32).toFixed(1)}" fill="rgba(255,255,255,.45)"/>`;
    });
  }
  return `<svg viewBox="0 0 50 120" aria-hidden="true">
  <defs>${DEF_HOJA(h)}${DEF_TALLO(t)}</defs>
  <path d="M25 118 C24 96 26 80 25 56" fill="none" stroke="url(#${t})" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M25 116 C7 104 5 84 11 69 C20 84 24 100 25 116Z" fill="url(#${h})"/>
  <path d="M25 116 C43 104 45 84 39 69 C30 84 26 100 25 116Z" fill="url(#${h})"/>
  ${f}
</svg>`;
}

function svgMargarita(v) {
  const h = 'h' + (++gid);
  const t = 't' + gid;
  let p = '';
  for (let i = 0; i < 16; i++) {
    p += `<g transform="rotate(${i * 22.5} 30 30)"><ellipse cx="30" cy="15" rx="3.4" ry="12" fill="${v.p}" stroke="rgba(0,0,0,.14)" stroke-width=".5"/><path d="M30 24 L30 6" stroke="rgba(0,0,0,.08)" stroke-width=".5"/></g>`;
  }
  return `<svg viewBox="0 0 60 100" aria-hidden="true">
  <defs>${DEF_HOJA(h)}${DEF_TALLO(t)}<radialGradient id="c${gid}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${mezclar(v.c, '#ffffff', .35)}"/><stop offset="1" stop-color="${mezclar(v.c, '#000000', .25)}"/></radialGradient></defs>
  <path d="M30 98 C29 76 31 58 30 42" fill="none" stroke="url(#${t})" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M30 88 C18 82 13 70 15 62 C23 68 28 78 30 88Z" fill="url(#${h})"/>
  <path d="M30 80 C42 74 46 63 44 56 C37 61 32 70 30 80Z" fill="url(#${h})"/>
  ${p}
  <circle cx="30" cy="30" r="6.4" fill="url(#c${gid})" stroke="rgba(0,0,0,.15)" stroke-width=".5"/>
  <g fill="rgba(0,0,0,.22)"><circle cx="28" cy="28" r=".6"/><circle cx="32" cy="29" r=".6"/><circle cx="30" cy="32" r=".6"/><circle cx="27" cy="31" r=".6"/><circle cx="33" cy="32" r=".6"/></g>
</svg>`;
}

function svgLavanda(color) {
  const h = 'h' + (++gid);
  let s = '';
  const tallos = [[-16, 0.86], [-7, 1], [3, 0.94], [12, 0.82], [20, 0.7]];
  tallos.forEach(([dx, esc]) => {
    const x0 = 30;
    const yTop = 104 - 66 * esc;
    s += `<path d="M${x0} 106 C${x0 + dx * 0.2} 88 ${x0 + dx * 0.7} 70 ${x0 + dx} ${yTop}" fill="none" stroke="#5f8f5a" stroke-width="1.4" stroke-linecap="round"/>`;
    for (let i = 0; i < 13; i++) {
      const tt = i / 12;
      const x = x0 + dx * (0.55 + 0.45 * tt) + (i % 2 ? 1.6 : -1.6);
      const y = yTop + 22 * (1 - tt) - 4 + (i % 3);
      s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="2.1" ry="3.1" fill="${mezclar(color, i % 2 ? '#ffffff' : '#000000', 0.12)}" transform="rotate(${(dx / 3).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
  });
  return `<svg viewBox="0 0 60 110" aria-hidden="true">
  <defs>${DEF_HOJA(h)}</defs>
  <path d="M30 108 C14 100 8 86 10 76 M30 108 C46 100 52 86 50 76 M30 108 C24 96 22 84 24 74" fill="none" stroke="#7fa38a" stroke-width="2.4" stroke-linecap="round"/>
  ${s}
</svg>`;
}

function svgBulbo() {
  const h = 'h' + (++gid);
  const t = 't' + gid;
  const flor = elige(['#e98aa8', '#f2c94c', '#8a6cc4', '#f4f1ea']);
  return `<svg viewBox="0 0 50 64" aria-hidden="true">
  <defs>${DEF_HOJA(h)}${DEF_TALLO(t)}<radialGradient id="bu${gid}" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#e2c08a"/><stop offset="1" stop-color="#a97e46"/></radialGradient></defs>
  <path d="M25 44 C22 30 23 20 25 12" fill="none" stroke="url(#${t})" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M25 40 C12 36 8 25 11 17 C19 23 23 32 25 40Z" fill="url(#${h})"/>
  <path d="M25 36 C38 32 42 21 39 13 C31 19 27 28 25 36Z" fill="url(#${h})"/>
  <path d="M25 12 C20 10 20 4 25 1 C30 4 30 10 25 12Z" fill="${flor}" stroke="rgba(0,0,0,.15)" stroke-width=".5"/>
  <path d="M25 62 C13 62 9 52 14 46 C18 42 22 42 25 40 C28 42 32 42 36 46 C41 52 37 62 25 62Z" fill="url(#bu${gid})"/>
  <path d="M25 40 C21 48 21 56 25 62 M25 40 C29 48 29 56 25 62 M25 42 C18 47 17 55 20 60 M25 42 C32 47 33 55 30 60" fill="none" stroke="#8c6a3c" stroke-width=".8" opacity=".8"/>
  <path d="M21 62 l-3 3 M23 62 l-1 4 M25 62 v4 M27 62 l1 4 M29 62 l3 3" stroke="#8c6a3c" stroke-width="1" stroke-linecap="round"/>
</svg>`;
}

function svgBugambilia() {
  const paletas = [['#c2185b', '#e0527d', '#a3164e'], ['#7b2a94', '#a54fbf', '#5b1f70'], ['#e8623a', '#f28a5a', '#c04a26'], ['#d81b7a', '#f05aa0', '#a8135c'], ['#f4f1ea', '#e6ddd0', '#c8bba8']];
  const h = 'h' + (++gid);
  let s = '';
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    pts.push([8 + t * 124, 64 - Math.sin(t * Math.PI) * 36 + (i % 2 ? 6 : -6) + Math.random() * 4]);
  }
  pts.forEach(([x, y], i) => {
    s += `<path d="M${x} ${y} C${x + 6} ${y + 2} ${x + 9} ${y + 8} ${x + 5} ${y + 12} C${x} ${y + 10} ${x - 3} ${y + 5} ${x} ${y}Z" fill="url(#${h})" stroke="rgba(0,0,0,.15)" stroke-width=".4" transform="rotate(${i % 2 ? 24 : -20} ${x} ${y})"/>`;
  });
  pts.forEach(([x, y], i) => {
    const pal = paletas[Math.floor(i / 4) % 3 === 0 ? (i % 2 ? 0 : 3) : Math.floor(i / 4) % 3 === 1 ? 0 : 2];
    for (let k = 0; k < 3; k++) {
      const a = k * 120 + (i * 23) % 60;
      s += `<g transform="rotate(${a} ${x} ${y})"><ellipse cx="${x}" cy="${y - 6}" rx="5.4" ry="7.4" fill="${pal[k % 2]}" stroke="${pal[2]}" stroke-width=".5"/><path d="M${x} ${y - 1} L${x} ${y - 11} M${x - 2} ${y - 3} L${x - 3} ${y - 9} M${x + 2} ${y - 3} L${x + 3} ${y - 9}" stroke="rgba(0,0,0,.14)" stroke-width=".4"/></g>`;
    }
    s += `<circle cx="${x}" cy="${y}" r="1.7" fill="#f6efd0"/><circle cx="${x}" cy="${y}" r=".7" fill="#e0c87a"/>`;
  });
  return `<svg viewBox="0 0 140 100" aria-hidden="true">
  <defs>${DEF_HOJA(h)}</defs>
  <path d="M4 72 Q40 6 72 42 T138 48" fill="none" stroke="#5f4126" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M30 30 Q34 20 44 16 M92 34 Q100 24 112 24" fill="none" stroke="#6b4a2b" stroke-width="1.8" stroke-linecap="round"/>
  ${s}
</svg>`;
}

function svgHierba() {
  const tonos = ['#3f7d34', '#4f9040', '#62a44c', '#356f2f', '#78b45a'];
  let b = '';
  const n = 6 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const x = 6 + i * (28 / n) + Math.random() * 3;
    const alto = 16 + Math.random() * 20;
    const curva = (Math.random() - 0.5) * 16;
    b += `<path d="M${x} 40 C${x + curva * 0.3} ${40 - alto * 0.5} ${x + curva} ${40 - alto * 0.85} ${x + curva * 1.3} ${40 - alto} C${x + curva * 0.9} ${40 - alto * 0.7} ${x + curva * 0.5} ${40 - alto * 0.4} ${x + 2.4} 40Z" fill="${elige(tonos)}"/>`;
  }
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${b}</svg>`;
}

// ---------- lirios ----------
const LIRIOS = [
  { base: '#c8367a', borde: '#fbe3ee', punto: '#7a1244', antera: '#8a4a1a' },   // oriental rosa
  { base: '#dfe9c4', borde: '#ffffff', punto: null, antera: '#e08a1a' },         // blanco
  { base: '#e2540b', borde: '#f8a23c', punto: '#3f1706', antera: '#5a2a0a' },   // naranja tigre
  { base: '#e6ad00', borde: '#fff1a8', punto: '#6b4200', antera: '#7a3f10' },   // amarillo
  { base: '#b03a8f', borde: '#f3d2e6', punto: '#5e1044', antera: '#7a4a1a' },   // fucsia
];

function svgLirio(v) {
  const id = 'l' + (++gid);
  const h = 'h' + gid;
  const t = 't' + gid;
  const cx = 50;
  const cy = 46;
  let tepalos = '';
  const tepalo = (ang, largo, ancho, ondulado) => {
    const L = largo;
    const A = ancho;
    const borde = ondulado
      ? `C${-A * 0.9} ${-L * 0.3} ${-A * 1.05} ${-L * 0.7} ${-A * 0.2} ${-L * 0.97} C${-A * 0.05} ${-L * 1.03} ${A * 0.05} ${-L * 1.03} ${A * 0.2} ${-L * 0.97} C${A * 1.05} ${-L * 0.7} ${A * 0.9} ${-L * 0.3} 0 0Z`
      : `C${-A} ${-L * 0.28} ${-A * 1.0} ${-L * 0.72} ${-A * 0.1} ${-L} C${-A * 0.02} ${-L * 1.02} ${A * 0.02} ${-L * 1.02} ${A * 0.1} ${-L} C${A} ${-L * 0.72} ${A} ${-L * 0.28} 0 0Z`;
    let manchas = '';
    if (v.punto) {
      for (let i = 0; i < 8; i++) {
        const x = (Math.random() - 0.5) * A * 0.85;
        const y = -(5 + Math.random() * L * 0.55);
        manchas += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.7 + Math.random() * 0.9).toFixed(1)}" fill="${v.punto}" opacity=".85"/>`;
      }
    }
    tepalos += `<g transform="translate(${cx} ${cy}) rotate(${ang}) scale(1 .8)">
      <path d="M0 0 ${borde}" fill="url(#${id})" stroke="rgba(90,20,60,.28)" stroke-width=".7"/>
      <path d="M0 0 C0 ${-L * 0.3} 0 ${-L * 0.65} 0 ${-L * 0.95}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/>
      <path d="M0 -2 C${-A * 0.4} ${-L * 0.3} ${-A * 0.5} ${-L * 0.6} ${-A * 0.3} ${-L * 0.85} M0 -2 C${A * 0.4} ${-L * 0.3} ${A * 0.5} ${-L * 0.6} ${A * 0.3} ${-L * 0.85}" fill="none" stroke="rgba(120,30,80,.16)" stroke-width=".6"/>
      ${manchas}
    </g>`;
  };
  [0, 120, 240].forEach((a) => tepalo(a + 2, 36, 12.5, false));
  [60, 180, 300].forEach((a) => tepalo(a, 34, 11.5, true));

  let estambres = '';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x2 = cx + Math.cos(a) * 15;
    const y2 = cy + Math.sin(a) * 9 - 6;
    estambres += `<path d="M${cx} ${cy} Q${(cx + x2) / 2} ${cy - 10} ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="#e8e2b8" stroke-width=".9"/><ellipse cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" rx="3" ry="1.2" fill="${v.antera}" transform="rotate(${(a * 57.3).toFixed(0)} ${x2.toFixed(1)} ${y2.toFixed(1)})"/>`;
  }
  const hojas = [[104, -1, 26], [92, 1, 24], [80, -1, 22], [70, 1, 20]].map(([y, s, l]) =>
    `<path d="M50 ${y + 8} C${50 + s * l} ${y - 2} ${50 + s * l * 1.1} ${y - 14} ${50 + s * l * 0.8} ${y - 22} C${50 + s * 6} ${y - 12} 50 ${y - 2} 50 ${y + 8}Z" fill="url(#${h})"/><path d="M50 ${y + 6} C${50 + s * l * 0.5} ${y - 4} ${50 + s * l * 0.7} ${y - 14} ${50 + s * l * 0.8} ${y - 22}" fill="none" stroke="rgba(255,255,255,.3)" stroke-width=".6"/>`).join('');
  const capullo = (x, y, r, esc) => `<path d="M${x} ${y} C${x + esc * 6} ${y - 4} ${x + esc * 5} ${y - 16} ${x} ${y - 24} C${x - esc * 5} ${y - 16} ${x - esc * 6} ${y - 4} ${x} ${y}Z" fill="${v.base}" opacity=".95" transform="rotate(${r} ${x} ${y})"/><path d="M${x} ${y} C${x + esc * 3} ${y - 6} ${x + esc * 3} ${y - 16} ${x} ${y - 24}" fill="none" stroke="rgba(255,255,255,.4)" stroke-width=".6" transform="rotate(${r} ${x} ${y})"/>`;
  return `<svg viewBox="0 0 100 140" aria-hidden="true">
  <defs>
    <radialGradient id="${id}" cx="50%" cy="100%" r="105%"><stop offset="0" stop-color="${v.base}"/><stop offset="1" stop-color="${v.borde}"/></radialGradient>
    ${DEF_HOJA(h)}${DEF_TALLO(t)}
  </defs>
  <path d="M50 138 C49 116 51 90 50 60" fill="none" stroke="url(#${t})" stroke-width="3.6" stroke-linecap="round"/>
  ${hojas}
  ${capullo(46, 66, -22, 1)}${capullo(56, 60, 24, 0.85)}
  ${tepalos}
  ${estambres}
  <path d="M${cx} ${cy} Q${cx + 4} ${cy - 12} ${cx + 12} ${cy - 15}" fill="none" stroke="#6f9a3c" stroke-width="1.3"/><circle cx="${cx + 12.5}" cy="${cy - 15.5}" r="1.9" fill="#8bb04a"/>
</svg>`;
}

function svgCala(color) {
  const id = 'c' + (++gid);
  const h = 'h' + gid;
  const t = 't' + gid;
  const [luz, base, sombra, espadice] = {
    blanca: ['#ffffff', '#f4f2ea', '#c9c6b6', '#f2c418'],
    amarilla: ['#fff4a8', '#f6d23a', '#c99c10', '#8a5a10'],
    rosa: ['#f6c4dc', '#d95c95', '#93245c', '#f2c418'],
  }[color];
  return `<svg viewBox="0 0 70 130" aria-hidden="true">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${luz}"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="${sombra}"/></linearGradient>
    <linearGradient id="${id}i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sombra}" stop-opacity=".55"/><stop offset="1" stop-color="${base}" stop-opacity="0"/></linearGradient>
    ${DEF_HOJA(h)}${DEF_TALLO(t)}
  </defs>
  <path d="M35 128 C34 104 37 80 35 56" fill="none" stroke="url(#${t})" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M35 122 C14 112 6 96 10 80 C22 88 32 104 35 122Z" fill="url(#${h})"/>
  <path d="M35 118 C56 108 64 92 60 76 C48 84 38 100 35 118Z" fill="url(#${h})"/>
  <path d="M35 120 C22 108 16 96 14 84 M35 116 C48 106 54 94 56 82" fill="none" stroke="rgba(255,255,255,.3)" stroke-width=".7"/>
  <path d="M35 10 C56 14 62 42 46 60 C40 66 32 66 27 58 C14 42 14 18 35 10Z" fill="url(#${id})" stroke="rgba(0,0,0,.14)" stroke-width=".6"/>
  <path d="M35 10 C46 20 44 44 46 60 C40 66 32 66 27 58 C24 40 26 22 35 10Z" fill="url(#${id}i)"/>
  <path d="M35 12 C30 30 30 46 33 62 M40 14 C44 30 44 46 42 60" fill="none" stroke="rgba(0,0,0,.09)" stroke-width=".6"/>
  <path d="M30 16 C25 30 26 46 31 56" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="1.2" stroke-linecap="round"/>
  <ellipse cx="37" cy="40" rx="3.6" ry="14" fill="${espadice}" transform="rotate(8 37 40)"/>
  <ellipse cx="36" cy="34" rx="1.6" ry="9" fill="rgba(255,255,255,.35)" transform="rotate(8 37 40)"/>
  <g fill="rgba(120,80,0,.4)"><circle cx="37" cy="30" r=".6"/><circle cx="38.4" cy="36" r=".6"/><circle cx="37" cy="42" r=".6"/><circle cx="39" cy="47" r=".6"/></g>
</svg>`;
}

// ---------- árboles y hamaca ----------
function svgArbol() {
  const id = 'a' + (++gid);
  const rnd = (a, b) => a + Math.random() * (b - a);
  let masa = '';
  let hojas = '';
  // masa de sombra para dar volumen
  for (let i = 0; i < 16; i++) {
    const ang = rnd(0, Math.PI * 2);
    const rr = Math.sqrt(Math.random());
    masa += `<circle cx="${(100 + Math.cos(ang) * rr * 66).toFixed(1)}" cy="${(88 + Math.sin(ang) * rr * 48).toFixed(1)}" r="${rnd(20, 28).toFixed(1)}" fill="#1f5230"/>`;
  }
  const pasada = (n, color, yMin, yMax, rMin, rMax) => {
    for (let i = 0; i < n; i++) {
      const ang = rnd(0, Math.PI * 2);
      const rr = Math.sqrt(Math.random());
      const x = 100 + Math.cos(ang) * rr * 78;
      const y = 86 + Math.sin(ang) * rr * 58;
      if (y < yMin || y > yMax) { i--; continue; }
      hojas += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rnd(rMin, rMax).toFixed(1)}" ry="${(rnd(rMin, rMax) * 0.55).toFixed(1)}" fill="${color}" transform="rotate(${rnd(0, 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
  };
  pasada(70, '#24593a', 26, 150, 7, 12);
  pasada(90, '#2f7340', 22, 132, 6, 11);
  pasada(100, '#3d8a48', 18, 118, 6, 10);
  pasada(90, '#54a457', 16, 100, 5, 9);
  pasada(70, '#72bb68', 14, 84, 4.5, 8);
  pasada(40, '#93d07c', 12, 66, 4, 7);
  let corteza = '';
  for (let i = 0; i < 14; i++) {
    const x = 90 + i * 1.7 + rnd(-1, 1);
    const y0 = 250 - rnd(0, 40);
    corteza += `<path d="M${x.toFixed(1)} ${y0.toFixed(1)} C${(x + rnd(-2, 2)).toFixed(1)} ${(y0 - 30).toFixed(1)} ${(x + rnd(-2, 2)).toFixed(1)} ${(y0 - 60).toFixed(1)} ${(x + rnd(-1.5, 1.5)).toFixed(1)} ${(y0 - rnd(70, 110)).toFixed(1)}" fill="none" stroke="rgba(${i % 2 ? '25,15,8' : '160,120,80'},${i % 2 ? .35 : .18})" stroke-width="${rnd(.6, 1.3).toFixed(1)}"/>`;
  }
  return `<svg viewBox="0 0 200 262" aria-hidden="true">
  <defs>
    <linearGradient id="${id}t" x1="0" x2="1"><stop offset="0" stop-color="#34210f"/><stop offset=".4" stop-color="#7d5a38"/><stop offset=".7" stop-color="#5d4128"/><stop offset="1" stop-color="#2e1c0e"/></linearGradient>
  </defs>
  <ellipse cx="100" cy="258" rx="74" ry="6" fill="rgba(0,0,0,.24)"/>
  <path d="M78 261 C86 250 90 238 91 222 C92 190 91 160 92 140 C93 128 90 118 82 104 L118 104 C110 118 107 128 108 140 C109 160 108 190 109 222 C110 238 114 250 124 261 C112 258 100 258 90 259 Z" fill="url(#${id}t)"/>
  ${corteza}
  <ellipse cx="102" cy="200" rx="2.6" ry="4.4" fill="rgba(20,10,4,.55)"/>
  <path d="M93 236 C96 230 97 224 96 216" fill="none" stroke="rgba(90,130,60,.55)" stroke-width="3" stroke-linecap="round"/>
  <path d="M94 122 C78 110 64 102 52 88 M106 120 C122 108 138 100 150 86 M100 112 C100 98 98 90 96 80" fill="none" stroke="#4d3520" stroke-width="7" stroke-linecap="round"/>
  ${masa}
  ${hojas}
</svg>`;
}

function svgHamaca(ancho, caida) {
  const id = 'm' + (++gid);
  const A = ancho;
  const alto = caida + 30;
  let flecos = '';
  for (let i = 0; i < 9; i++) {
    flecos += `<path d="M${6 + i * 1.6} 18 l${(Math.random() - 0.5) * 1.2} ${4 + Math.random() * 3} M${A - 6 - i * 1.6} 18 l${(Math.random() - 0.5) * 1.2} ${4 + Math.random() * 3}" stroke="#d9c9a4" stroke-width=".8"/>`;
  }
  return `<svg viewBox="0 0 ${A} ${alto}" width="${A}" height="${alto}" aria-hidden="true">
  <defs>
    <pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(90)"><rect width="14" height="7" fill="#ecdfc4"/><rect y="7" width="14" height="7" fill="#b5653d"/><path d="M0 3.5 H14 M0 10.5 H14" stroke="rgba(0,0,0,.12)" stroke-width=".6"/></pattern>
    <pattern id="${id}w" width="2.2" height="2.2" patternUnits="userSpaceOnUse"><path d="M0 0 L2.2 2.2 M2.2 0 L0 2.2" stroke="rgba(0,0,0,.1)" stroke-width=".4"/></pattern>
  </defs>
  <path d="M4 8 Q${A / 2} ${caida + 8} ${A - 4} 8 L${A - 4} 16 Q${A / 2} ${caida + 22} 4 16 Z" fill="url(#${id})" stroke="#75482a" stroke-width="1"/>
  <path d="M4 8 Q${A / 2} ${caida + 8} ${A - 4} 8 L${A - 4} 16 Q${A / 2} ${caida + 22} 4 16 Z" fill="url(#${id}w)"/>
  <path d="M4 8 Q${A / 2} ${caida + 8} ${A - 4} 8" fill="none" stroke="#5f3820" stroke-width="2.2"/>
  <path d="M4 16 Q${A / 2} ${caida + 22} ${A - 4} 16" fill="none" stroke="#7a4a2c" stroke-width="1.4"/>
  ${flecos}
  <path d="M0 9 L4 9 M${A} 9 L${A - 4} 9" stroke="#c9b48a" stroke-width="2.4" stroke-dasharray="1.6 1.2"/>
  <circle cx="4" cy="9" r="3.6" fill="none" stroke="#54545c" stroke-width="1.7"/>
  <circle cx="${A - 4}" cy="9" r="3.6" fill="none" stroke="#54545c" stroke-width="1.7"/>
</svg>`;
}

function construirArboles(W, H) {
  capaArboles.replaceChildren();
  const baseY = H * 0.7;
  const wA = limitar(W * 0.4, 150, 280);
  const wB = wA * 0.78;
  const hA = wA * 1.31;
  const hB = wB * 1.31;
  const span = limitar(W * 0.3, 110, 230);
  const xa = W * 0.5 - span / 2;
  const xb = xa + span;

  const crear = (cx, w, h) => {
    const t = el('div', 'arbol');
    t.style.width = w + 'px';
    t.style.left = cx - w / 2 + 'px';
    t.style.top = baseY - h + 'px';
    t.style.zIndex = String(Math.round(baseY));
    t.innerHTML = svgArbol();
    capaArboles.append(t);
  };
  crear(xa, wA, hA);
  crear(xb, wB, hB);

  // hamaca entre los dos troncos
  const troncoA = wA * 0.08;
  const troncoB = wB * 0.08;
  const izq = xa + troncoA;
  const anchoH = xb - troncoB - izq;
  const caida = limitar(anchoH * 0.16, 18, 40);
  const anclaY = baseY - hB * 0.2;
  const ham = el('div', 'hamaca');
  ham.style.left = izq + 'px';
  ham.style.top = anclaY - 8 + 'px';
  ham.style.width = anchoH + 'px';
  ham.style.zIndex = String(Math.round(baseY) + 1);
  const bal = el('div', 'hamaca-bal');
  bal.innerHTML = svgHamaca(anchoH, caida);
  const hueco = el('div', 'hamaca-hueco');
  hueco.style.left = anchoH / 2 + 'px';
  hueco.style.top = caida * 0.62 + 6 + 'px';
  bal.append(hueco);
  ham.append(bal);
  ham.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    $('j-pista').classList.add('oculto');
    ham.classList.remove('toque');
    void ham.offsetWidth;
    ham.classList.add('toque');
    setTimeout(() => ham.classList.remove('toque'), 2200);
    if (mvEnJardin && !mavis.classList.contains('en-hamaca')) irAHamaca = true;
  });
  capaArboles.append(ham);
  hamaca = { el: ham, bal, slot: hueco, cx: izq + anchoH / 2, pieY: baseY + 14 };
}

// ---------- construir el jardín ----------
function tamanoJardin() {
  const r = jardin.getBoundingClientRect();
  return { r, W: r.width, H: r.height };
}

function plantar(x, y, tipo, animar) {
  const { H } = tamanoJardin();
  const prof = limitar((y - H * 0.6) / (H * 0.4), 0, 1);
  const esc = 0.7 + prof * 0.6;
  const elegido = tipo || elige(['tulipan', 'tulipan', 'tulipan', 'peonia', 'peonia', 'narciso', 'jacinto', 'margarita', 'margarita', 'lavanda', 'lirio', 'lirio', 'lirio', 'cala', 'bulbo']);
  const base = { tulipan: 44, peonia: 84, narciso: 54, jacinto: 44, bulbo: 40, margarita: 46, lavanda: 52, lirio: 74, cala: 46 }[elegido];
  const svg = {
    tulipan: () => svgTulipan(elige(TULIPANES)),
    peonia: () => svgPeonia(elige(PEONIAS)),
    narciso: () => svgNarciso(elige(NARCISOS)),
    jacinto: () => svgJacinto(elige(JACINTOS)),
    margarita: () => svgMargarita(elige(MARGARITAS)),
    lavanda: () => svgLavanda(elige(LAVANDAS)),
    lirio: () => svgLirio(elige(LIRIOS)),
    cala: () => svgCala(elige(['blanca', 'blanca', 'amarilla', 'rosa'])),
    bulbo: svgBulbo,
  }[elegido]();
  const w = base * esc;
  const f = el('div', 'flor' + (animar ? ' nace' : ''));
  f.style.width = w + 'px';
  f.style.left = x - w / 2 + 'px';
  f.style.bottom = Math.max(0, H - y) + 'px';
  f.style.zIndex = String(Math.round(y));
  f.style.transform = `rotate(${azarEntre(-3.5, 3.5).toFixed(1)}deg) scaleX(${Math.random() < 0.5 ? -1 : 1})`;
  f.style.setProperty('--dur', azarEntre(6, 10) + 's');
  f.style.setProperty('--del', -azarEntre(0, 6) + 's');
  const dentro = el('div', 'flor-i');
  dentro.innerHTML = svg;
  f.append(dentro);
  capaFlores.append(f);
  flores.push({ el: f, frio: 0, roce: 0, x, y });
  if (flores.length > 46) quitarFlor(flores[0].el, true);
  return f;
}

function quitarFlor(f, silencioso) {
  const i = flores.findIndex((o) => o.el === f);
  if (i < 0) return;
  const o = flores[i];
  flores.splice(i, 1);
  f.classList.add('se-va');
  if (!silencioso) {
    petalos(o.x, o.y - f.offsetHeight * 0.7, 9);
    if (navigator.vibrate) navigator.vibrate([25, 40, 25]);
  }
  setTimeout(() => f.remove(), 700);
}

// ---------- monarcas y libélulas ----------
function svgMonarca() {
  const id = 'mo' + (++gid);
  const mitad = `
    <path d="M30 20 C34 8 47 1 56 4 C60 9 59 17 54 23 C48 28 38 27 30 22Z" fill="#14100a"/>
    <path d="M31 20 C35 10 46 5 53 7.5 C56 11 55 17 51 21.5 C46 25 38 24.5 31 21Z" fill="url(#${id})"/>
    <path d="M30 22 C39 24 47 28 50 34 C51 40 43 43 37 39.5 C33 36 30 29 30 22Z" fill="#14100a"/>
    <path d="M31 23 C39 25 46 29 48 34 C48.5 38 43 40 38.5 37.5 C34 34.5 31 28.5 31 23Z" fill="url(#${id})"/>
    <path d="M30.5 20.5 L52 10 M30.5 20.8 L54 15.5 M30.5 21.5 L52 21 M31 22 L47 27 M31 22.6 L44 33 M31 23 L38 37" stroke="#17110a" stroke-width=".9" fill="none"/>
    <path d="M40 15 C44 12 48 10 51 9" stroke="#17110a" stroke-width=".6" fill="none"/>
    <g fill="#ffffff"><circle cx="56.2" cy="8" r="1"/><circle cx="57.8" cy="11.5" r=".9"/><circle cx="57.6" cy="15" r=".9"/><circle cx="55.4" cy="18.6" r=".85"/><circle cx="52.4" cy="21.6" r=".8"/><circle cx="52" cy="4.2" r=".8"/><circle cx="48" cy="2.8" r=".7"/><circle cx="49.6" cy="36.4" r=".8"/><circle cx="47.6" cy="39.4" r=".7"/><circle cx="43" cy="40.6" r=".7"/><circle cx="50.6" cy="33" r=".7"/></g>`;
  return `<svg viewBox="0 0 60 44" aria-hidden="true">
  <defs><radialGradient id="${id}" cx="30%" cy="60%" r="90%"><stop offset="0" stop-color="#f6a53a"/><stop offset=".6" stop-color="#e8721a"/><stop offset="1" stop-color="#c94f0c"/></radialGradient></defs>
  <g class="alas">
    <g>${mitad}</g>
    <g transform="translate(60 0) scale(-1 1)">${mitad}</g>
  </g>
  <ellipse cx="30" cy="24" rx="1.9" ry="9.5" fill="#15110d"/>
  <circle cx="30" cy="13.6" r="2.2" fill="#15110d"/>
  <g fill="#ffffff" opacity=".85"><circle cx="29.2" cy="18" r=".5"/><circle cx="30.8" cy="20" r=".5"/><circle cx="29.2" cy="22.5" r=".5"/><circle cx="30.8" cy="25" r=".5"/><circle cx="29.4" cy="27.5" r=".5"/></g>
  <path d="M29.4 12 C27.5 7 25 4.6 22.6 4 M30.6 12 C32.5 7 35 4.6 37.4 4" fill="none" stroke="#15110d" stroke-width=".8" stroke-linecap="round"/>
  <circle cx="22.4" cy="3.9" r="1" fill="#15110d"/><circle cx="37.6" cy="3.9" r="1" fill="#15110d"/>
</svg>`;
}

function svgLibelulaJ() {
  let segmentos = '';
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = 40 - t * 34;
    const y = 30 + t * 14;
    segmentos += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4.6" ry="2.2" fill="${i % 2 ? '#1f7f92' : '#2fa0b4'}" transform="rotate(${(24 + t * 14).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  const ala = (cx, cy, rx, ry, rot, cls) => `<g class="${cls}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#e3f1f8" fill-opacity=".55" stroke="#7fa7bd" stroke-width=".7" transform="rotate(${rot} ${cx} ${cy})"/><g transform="rotate(${rot} ${cx} ${cy})" stroke="#7fa7bd" stroke-width=".4" fill="none"><path d="M${cx - rx} ${cy} L${cx + rx} ${cy} M${cx - rx * 0.6} ${cy - ry * 0.5} L${cx + rx * 0.7} ${cy - ry * 0.3} M${cx - rx * 0.6} ${cy + ry * 0.5} L${cx + rx * 0.7} ${cy + ry * 0.3}"/><path d="M${cx - rx * 0.3} ${cy - ry} L${cx - rx * 0.3} ${cy + ry} M${cx + rx * 0.2} ${cy - ry * 0.9} L${cx + rx * 0.2} ${cy + ry * 0.9}"/></g><ellipse cx="${cx + rx * 0.8}" cy="${cy - ry * 0.2}" rx="1.6" ry=".7" fill="#4a5a68" transform="rotate(${rot} ${cx} ${cy})"/></g>`;
  return `<svg viewBox="0 0 90 60" aria-hidden="true">
  ${ala(34, 21, 25, 8, -20, 'ala')}
  ${ala(38, 38, 25, 7.4, 18, 'ala b')}
  ${segmentos}
  <ellipse cx="46" cy="30" rx="8.4" ry="5.6" fill="#1f8ea3"/>
  <path d="M40 27 Q46 24 52 27" stroke="rgba(255,255,255,.35)" stroke-width="1" fill="none"/>
  <circle cx="56" cy="27.4" r="3.8" fill="#2a7fb8"/><circle cx="56" cy="34" r="3.8" fill="#2a7fb8"/>
  <circle cx="55" cy="26.4" r="1.1" fill="rgba(255,255,255,.7)"/><circle cx="55" cy="33" r="1.1" fill="rgba(255,255,255,.7)"/>
</svg>`;
}

function nuevoDestino(v, W, H) {
  v.tx = azarEntre(W * 0.06, W * 0.94);
  v.ty = azarEntre(H * 0.08, v.tipo === 'libelula' ? H * 0.5 : H * 0.62);
}

function petalos(x, y, n) {
  for (let i = 0; i < n; i++) {
    const p = el('span', 'petalo-j');
    p.style.left = x + azarEntre(-14, 14) + 'px';
    p.style.top = y + 'px';
    p.style.setProperty('--dx', azarEntre(-30, 30) + 'px');
    p.style.setProperty('--dy', azarEntre(40, 90) + 'px');
    p.style.background = elige(['#f2b6cf', '#f6efe8', '#f8d3e1', '#f0d060', '#e0a8ee', '#f4a48c']);
    capaAire.append(p);
    setTimeout(() => p.remove(), 2400);
  }
}

function construirJardin() {
  const estabaDentro = mvEnJardin;
  if (estabaDentro) salirDelJardin();
  const { r, W, H } = tamanoJardin();
  if (W < 50 || H < 50) return false;
  jardinAncho0 = W;
  jardinW = W;
  jardinH = H;
  jardinLeft = r.left;
  capaFlores.replaceChildren();
  capaAire.replaceChildren();
  flores.length = 0;
  voladores.length = 0;
  hamaca = null;
  irAHamaca = false;
  cancelarMantener();

  construirArboles(W, H);

  // arbustos de bugambilia sobre las colinas
  ['izq', 'der'].forEach((lado) => {
    const b = el('div', 'bugambilia ' + lado);
    b.innerHTML = svgBugambilia();
    capaArboles.append(b);
  });

  // matas de pasto repartidas (dan profundidad y textura)
  const matas = Math.round(W / 16);
  for (let i = 0; i < matas; i++) {
    const y = azarEntre(H * 0.64, H * 0.99);
    const prof = limitar((y - H * 0.6) / (H * 0.4), 0, 1);
    const w = (18 + Math.random() * 18) * (0.6 + prof * 0.9);
    const m = el('div', 'mata');
    m.style.width = w + 'px';
    m.style.left = azarEntre(-6, W - 10) + 'px';
    m.style.bottom = Math.max(0, H - y - 2) + 'px';
    m.style.zIndex = String(Math.round(y) - 1);
    m.innerHTML = svgHierba();
    capaArboles.append(m);
  }

  // flores iniciales repartidas por el pasto
  const n = Math.max(9, Math.min(20, Math.round(W / 58)));
  for (let i = 0; i < n; i++) {
    plantar(azarEntre(W * 0.03, W * 0.97), azarEntre(H * 0.68, H * 0.97), null, false);
  }

  // monarcas y libélulas (pocas y tranquilas)
  for (let i = 0; i < 4; i++) crearVolador('mariposa', W, H);
  crearVolador('libelula', W, H);
  jardinListo = true;
  if (estabaDentro) mavisAlJardin();
  return true;
}

function crearVolador(tipo, W, H) {
  const nodo = el('div', 'volador ' + tipo);
  nodo.innerHTML = tipo === 'mariposa' ? svgMonarca() : svgLibelulaJ();
  const v = {
    el: nodo, tipo, x: azarEntre(0, W), y: azarEntre(H * 0.1, H * 0.5), tx: 0, ty: 0, dir: 1,
    vel: tipo === 'mariposa' ? azarEntre(22, 38) : azarEntre(55, 85), fase: azarEntre(0, 6.28),
    estado: 'vuela', hasta: 0, turbo: 0, atr: 0,
  };
  nuevoDestino(v, W, H);
  nodo.style.width = (tipo === 'mariposa' ? azarEntre(30, 42) : azarEntre(48, 58)) + 'px';
  nodo.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const { W: w2, H: h2 } = tamanoJardin();
    v.estado = 'vuela';
    nodo.classList.remove('posada');
    v.turbo = performance.now() / 1000 + 2;
    v.tx = v.x < w2 / 2 ? azarEntre(w2 * 0.6, w2 * 0.95) : azarEntre(w2 * 0.05, w2 * 0.4);
    v.ty = azarEntre(h2 * 0.06, h2 * 0.4);
  });
  capaAire.append(nodo);
  voladores.push(v);
}

// ---------- movimiento de monarcas y libélulas ----------
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
    v.tx = atraer.x + azarEntre(-50, 50);
    v.ty = atraer.y + azarEntre(-40, 30);
  }
  const dx = v.tx - v.x;
  const dy = v.ty - v.y;
  const d = Math.hypot(dx, dy);
  if (d < 12) {
    const suerte = Math.random();
    if (v.tipo === 'mariposa' && suerte < 0.32 && flores.length) {
      const f = elige(flores);
      const fr = f.el.getBoundingClientRect();
      v.x = fr.left - r.left + fr.width / 2 - v.el.offsetWidth / 2;
      v.y = fr.top - r.top - v.el.offsetHeight * 0.4;
      v.estado = 'posada';
      v.hasta = ts + azarEntre(3, 6);
      v.el.classList.add('posada');
    } else if (v.tipo === 'libelula' && suerte < 0.4) {
      v.estado = 'posada';
      v.hasta = ts + azarEntre(1.5, 3);
    } else {
      nuevoDestino(v, W, H);
    }
    return;
  }
  const vel = v.vel * (ts < v.turbo ? 1.9 : 1);
  v.x += (dx / d) * vel * dt;
  v.y += (dy / d) * vel * dt;
  if (Math.abs(dx) > 6) v.dir = dx >= 0 ? 1 : -1;
  const bob = Math.sin(ts * (v.tipo === 'libelula' ? 8 : 4) + v.fase) * (v.tipo === 'libelula' ? 1.5 : 6);
  v.el.style.transform = `translate(${v.x}px, ${v.y + bob}px) scaleX(${v.dir})`;
}

// ---------- Mavis dentro del jardín ----------
function anchoMavisJardin() {
  const prof = limitar((mvY - jardinH * 0.6) / (jardinH * 0.4), 0, 1);
  return mvAncho * (0.7 + prof * 0.5);
}

function posicionarMavisJardin() {
  if (mavis.classList.contains('en-hamaca')) return;
  const w = anchoMavisJardin();
  mavis.style.width = w + 'px';
  mavis.style.left = mvX - jardinLeft + 'px';
  mavis.style.top = mvY - w * 0.71 + 'px';
  mavis.style.zIndex = String(Math.round(mvY));
}

function mavisAlJardin() {
  if (mvEnJardin || !jardinListo) return;
  terminarJuego(true);
  const { r, W, H } = tamanoJardin();
  jardinW = W;
  jardinH = H;
  jardinLeft = r.left;
  mvEnJardin = true;
  capaFlores.append(mavis);
  mavis.classList.add('en-jardin');
  mvX = limitar(mvX, r.left, r.left + W - mvAncho);
  mvY = H * 0.9;
  mvYObj = azarEntre(H * 0.72, H * 0.95);
  proximaSiesta = performance.now() + azarEntre(25000, 50000);
  mvCambiarModo('camina', 5000);
  posicionarMavisJardin();
}

function salirDelJardin() {
  if (!mvEnJardin) return;
  terminarJuego(true);
  cancelarMantener();
  if (mavis.classList.contains('en-hamaca')) bajarDeHamaca(true);
  mvEnJardin = false;
  irAHamaca = false;
  mavis.classList.remove('en-jardin');
  mavis.style.top = '';
  mavis.style.zIndex = '';
  mavis.style.width = mvAncho + 'px';
  $('pantalla-app').append(mavis);
  mvX = limitar(mvX, 0, window.innerWidth - mvAncho);
  mvCambiarModo('camina', 4000);
  mvPonerX();
}

function subirAHamaca() {
  if (!hamaca || !mvEnJardin) return;
  irAHamaca = false;
  mvModo = 'descanso';
  mavis.classList.remove('camina');
  mavis.classList.add('en-hamaca');
  ['left', 'top', 'zIndex', 'width'].forEach((k) => { mavis.style[k] = ''; });
  hamaca.slot.append(mavis);
  hamaca.el.classList.add('con-peso');
  descansoHasta = performance.now() + azarEntre(20000, 35000);
}

function bajarDeHamaca(forzar) {
  if (!hamaca || !mavis.classList.contains('en-hamaca')) return;
  mavis.classList.remove('en-hamaca');
  hamaca.el.classList.remove('con-peso');
  capaFlores.append(mavis);
  mvY = hamaca.pieY;
  mvYObj = mvY;
  mvX = jardinLeft + hamaca.cx - anchoMavisJardin() / 2;
  proximaSiesta = performance.now() + azarEntre(60000, 120000);
  if (!forzar) mvCambiarModo('camina', 4000);
  posicionarMavisJardin();
}

mavis.addEventListener('pointerdown', () => {
  if (mavis.classList.contains('en-hamaca')) bajarDeHamaca(false);
});

// Mavis olfatea y roza las flores, persigue mariposas y descansa en la hamaca
function mavisEnJardin(r) {
  if (!mvEnJardin || mavis.classList.contains('oculta') || mvModo === 'duerme' || mvModo === 'juego') return;
  const ahora = performance.now();

  if (mavis.classList.contains('en-hamaca')) {
    if (ahora > descansoHasta) bajarDeHamaca(false);
    return;
  }

  if (!irAHamaca && hamaca && ahora > proximaSiesta) irAHamaca = true;
  if (irAHamaca && hamaca) {
    const cx = mvX - jardinLeft + anchoMavisJardin() / 2;
    const dx = hamaca.cx - cx;
    mvYObj = hamaca.pieY;
    if (mvModo !== 'descanso') {
      if (mvModo === 'pausa') mvCambiarModo('camina', 4000);
      if (mvModo === 'camina') mvDir = dx >= 0 ? 1 : -1;
    }
    if (Math.abs(dx) < 16 && Math.abs(mvY - hamaca.pieY) < 12 && mvModo !== 'interaccion') {
      mvEstado('feliz', 700);
      setTimeout(subirAHamaca, 550);
      irAHamaca = false;
    }
    return;
  }

  const cx = mvX - jardinLeft + anchoMavisJardin() / 2;
  const pieY = mvY;
  if (mvModo === 'camina') {
    for (const f of flores) {
      const cerca = Math.abs(f.x - cx) < 34 && Math.abs(f.y - pieY) < 26;
      if (!cerca) continue;
      if (ahora > f.frio && mvModo === 'camina') {
        f.frio = ahora + 14000;
        mvCambiarModo('interaccion', 1500);
        mavis.classList.add('olfatea');
        setTimeout(() => mavis.classList.remove('olfatea'), 1400);
        f.el.classList.add('olfateada');
        setTimeout(() => f.el.classList.remove('olfateada'), 1500);
        petalos(f.x, f.y - f.el.offsetHeight * 0.75, 3);
        return;
      }
      if (ahora > f.roce) {
        f.roce = ahora + 3000;
        f.el.classList.add('rozada');
        setTimeout(() => f.el.classList.remove('rozada'), 900);
      }
    }
  }

  let cerca = null;
  let dmin = 9999;
  let dxc = 0;
  voladores.forEach((v) => {
    if (v.tipo !== 'mariposa' || v.y < r.height * 0.4) return;
    const dx = v.x + v.el.offsetWidth / 2 - cx;
    if (Math.abs(dx) < dmin) { dmin = Math.abs(dx); cerca = v; dxc = dx; }
  });
  if (cerca && dmin < 240) {
    if (mvModo === 'pausa') mvCambiarModo('camina', 3000);
    if (mvModo === 'camina') mvDir = dxc >= 0 ? 1 : -1;
    if (dmin < 60 && ahora > saltoFrio) {
      saltoFrio = ahora + 8000;
      mvEstado('feliz', 800);
      cerca.turbo = ahora / 1000 + 1.6;
      cerca.estado = 'vuela';
      cerca.el.classList.remove('posada');
      cerca.tx = cerca.x < r.width / 2 ? azarEntre(r.width * 0.6, r.width * 0.95) : azarEntre(r.width * 0.05, r.width * 0.4);
      cerca.ty = azarEntre(r.height * 0.06, r.height * 0.35);
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
  jardinW = r.width;
  jardinH = r.height;
  jardinLeft = r.left;
  voladores.forEach((v) => moverVolador(v, dt, t / 1000, r));
  if (t - jardinSniff > 350) {
    jardinSniff = t;
    mavisEnJardin(r);
  }
}

// ---------- mantener presionada una flor 5 segundos para quitarla ----------
function iniciarMantener(f, x, y) {
  cancelarMantener();
  const ring = el('div', 'j-hold');
  ring.style.left = x + 'px';
  ring.style.top = y + 'px';
  ring.innerHTML = '<svg viewBox="0 0 44 44"><circle class="pista" cx="22" cy="22" r="18"/><circle class="avance" cx="22" cy="22" r="18"/></svg>';
  capaAire.append(ring);
  const timer = setTimeout(() => {
    quitarFlor(f, false);
    cancelarMantener();
  }, 5000);
  mantener = { f, timer, ring, x, y };
}

function cancelarMantener() {
  if (!mantener) return;
  clearTimeout(mantener.timer);
  mantener.ring.remove();
  mantener = null;
}

['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => jardin.addEventListener(ev, cancelarMantener));
jardin.addEventListener('pointermove', (e) => {
  if (!mantener) return;
  const r = jardin.getBoundingClientRect();
  if (Math.hypot(e.clientX - r.left - mantener.x, e.clientY - r.top - mantener.y) > 16) cancelarMantener();
}, { passive: true });

// ---------- interacción ----------
jardin.addEventListener('pointerdown', (e) => {
  $('j-pista').classList.add('oculto');
  if (e.target.closest('.mavis')) return;
  const flor = e.target.closest('.flor');
  const { r, H } = tamanoJardin();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (flor) {
    flor.classList.remove('olfateada');
    void flor.offsetWidth;
    flor.classList.add('olfateada');
    setTimeout(() => flor.classList.remove('olfateada'), 1500);
    petalos(x, y, 3);
    if (navigator.vibrate) navigator.vibrate(15);
    iniciarMantener(flor, x, y);
    return;
  }
  if (y > H * 0.66) {
    plantar(x, y, null, true);
    petalos(x, y - 20, 3);
    if (navigator.vibrate) navigator.vibrate(15);
  } else {
    atraer = { x, y, hasta: performance.now() / 1000 + 4, id: ++atraerId };
  }
});

function entrarAlJardin() {
  const { W } = tamanoJardin();
  if (!jardinListo || Math.abs(W - jardinAncho0) > 80) construirJardin();
  mavisAlJardin();
  $('j-pista').classList.remove('oculto');
  setTimeout(() => $('j-pista').classList.add('oculto'), 9000);
}

// pétalos que caen muy de vez en cuando
setInterval(() => {
  if (vistaActual !== 'jardin' || !jardinListo || document.hidden || document.documentElement.classList.contains('sin-anim')) return;
  if (capaAire.querySelectorAll('.petalo-caida').length > 3) return;
  const { W } = tamanoJardin();
  const p = el('span', 'petalo-caida');
  p.style.left = azarEntre(0, W) + 'px';
  p.style.setProperty('--dx', azarEntre(-50, 50) + 'px');
  p.style.background = elige(['#f2b6cf', '#f6efe8', '#f8d3e1', '#f0d060', '#e0a8ee']);
  capaAire.append(p);
  setTimeout(() => p.remove(), 12000);
}, 5000);

requestAnimationFrame(jardinBucle);
