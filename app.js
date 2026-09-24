// =============================================
//  Nosotros - App de parejas (Fase 1)
// =============================================
const SUPABASE_URL = 'https://kupwqulxzsgupyowpsnd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8DiVJX0CTBUtmPUnu3ihvw_aOgWsjpz';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'recuerdos';
const CODIGO_ACCESO = '30082026';
const MAX_MB = 50;

const $ = (id) => document.getElementById(id);

// ---------- Estado ----------
let usuario = null;
let perfil = null;
let pareja = null;
let perfiles = {};        // id -> nombre
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

$('form-codigo').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('input-acceso').value.trim() !== CODIGO_ACCESO) {
    $('codigo-msg').textContent = 'Código incorrecto.';
    $('input-acceso').value = '';
    return;
  }
  desbloqueado = true;
  $('input-acceso').value = '';
  $('codigo-msg').textContent = '';
  const { data } = await sb.auth.getSession();
  iniciar(data.session);
});

$('form-auth').addEventListener('submit', async (e) => {
  e.preventDefault();
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
  $('lista-publicaciones').replaceChildren();
  $('lista-mensajes').replaceChildren();
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
  await cargarPerfiles();
  llenarPerfil();
  mostrar('app');
  cambiarVista('inicio');
  pintarInicio();
  await Promise.all([cargarPublicaciones(), cargarMensajes()]);
  cargarStats();
  mostrarRecuerdoAzar();
  suscribir();
}

async function cargarPerfiles() {
  const { data } = await sb.from('perfiles').select('id, nombre');
  perfiles = {};
  (data || []).forEach((p) => { perfiles[p.id] = p.nombre || 'Sin nombre'; });
  const otro = Object.keys(perfiles).find((id) => id !== usuario.id);
  $('titulo-pareja').textContent = otro
    ? `${perfiles[usuario.id]} & ${perfiles[otro]}`
    : 'Esperando a tu pareja…';
  $('perfil-pareja').textContent = otro
    ? `Vinculado con ${perfiles[otro]} 💞`
    : 'Tu pareja aún no se une. Compártele el código de abajo.';

  // Tarjeta de la pareja en Inicio
  const yo = perfiles[usuario.id] || 'Tú';
  $('hero-av-yo').textContent = yo.charAt(0).toUpperCase();
  $('hero-nombre-yo').textContent = yo;
  $('hero-av-otro').textContent = otro ? perfiles[otro].charAt(0).toUpperCase() : '?';
  $('hero-nombre-otro').textContent = otro ? perfiles[otro] : 'Esperando…';
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

// ---------- Navegación ----------
document.querySelectorAll('.nav-btn').forEach((b) => {
  b.addEventListener('click', () => cambiarVista(b.dataset.vista));
});

function cambiarVista(vista) {
  vistaActual = vista;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('activa', b.dataset.vista === vista));
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === 'vista-' + vista));
  if (vista === 'chat') {
    $('badge-chat').classList.add('oculto');
    bajarChat();
  }
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
  cab.append(el('div', 'avatar' + (esMio ? '' : ' otro'), nombre.charAt(0).toUpperCase()));
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
      v.src = url;
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      media.append(v);
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.loading = 'lazy';
      img.alt = 'Foto';
      img.addEventListener('click', () => abrirVisor(url));
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
function abrirVisor(url) {
  const img = document.createElement('img');
  img.src = url;
  $('visor').replaceChildren(img);
  $('visor').classList.remove('oculto');
}
$('visor').addEventListener('click', () => $('visor').classList.add('oculto'));

// =============================================
//  CHAT
// =============================================
let ultimoDia = null;

async function cargarMensajes() {
  const { data, error } = await sb
    .from('mensajes')
    .select('*')
    .eq('pareja_id', pareja.id)
    .order('creado_en', { ascending: false })
    .limit(200);
  const lista = $('lista-mensajes');
  lista.replaceChildren();
  ultimoDia = null;
  if (error) {
    lista.append(el('p', 'vacio', traducir(error)));
    return;
  }
  data.reverse().forEach(pintarMensaje);
  bajarChat();
}

function pintarMensaje(m) {
  const lista = $('lista-mensajes');
  if (lista.querySelector(`[data-id="${m.id}"]`)) return false;
  const d = dia(m.creado_en);
  if (d !== ultimoDia) {
    lista.append(el('div', 'dia', d));
    ultimoDia = d;
  }
  const b = el('div', 'burbuja ' + (m.autor_id === usuario.id ? 'mio' : 'suyo'), m.texto);
  b.dataset.id = m.id;
  b.append(el('small', '', hora(m.creado_en)));
  lista.append(b);
  return true;
}

function bajarChat() {
  const lista = $('lista-mensajes');
  requestAnimationFrame(() => { lista.scrollTop = lista.scrollHeight; });
}

async function recibirMensaje(m) {
  if (!perfiles[m.autor_id]) await cargarPerfiles();
  if (!pintarMensaje(m)) return;
  bajarChat();
  contarMensaje(m);
  if (m.autor_id === usuario.id) return;
  if (m.texto === CORAZON) {
    lluviaCorazones();
    aviso(`💌 ${nombreDe(m.autor_id)} te mandó un corazón`);
  } else if (vistaActual !== 'chat') {
    $('badge-chat').classList.remove('oculto');
  }
}

$('form-chat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('chat-texto');
  const texto = input.value.trim();
  if (!texto) return;
  input.value = '';
  const { data, error } = await sb
    .from('mensajes')
    .insert({ pareja_id: pareja.id, texto })
    .select()
    .single();
  if (error) {
    input.value = texto;
    alert('No se pudo enviar: ' + traducir(error));
    return;
  }
  if (pintarMensaje(data)) contarMensaje(data);
  bajarChat();
});

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
  if (reloj) clearInterval(reloj);
  reloj = setInterval(tickVivo, 1000);
}

function pintarContador() {
  const tiene = !!pareja.fecha_inicio;
  $('contador-sin-fecha').classList.toggle('oculto', tiene);
  $('contador-con-fecha').classList.toggle('oculto', !tiene);
  $('form-fecha').classList.toggle('oculto', tiene);
  $('btn-editar-fecha').classList.toggle('oculto', !tiene);
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

function tickVivo() {
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

// Cambiar / poner fecha
$('btn-editar-fecha').addEventListener('click', () => {
  $('form-fecha').classList.toggle('oculto');
  if (pareja.fecha_inicio) $('input-fecha').value = pareja.fecha_inicio;
});

$('form-fecha').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fecha = $('input-fecha').value;
  if (!fecha) return;
  const { error } = await sb.rpc('actualizar_fecha_inicio', { p_fecha: fecha });
  if (error) return alert(traducir(error));
  pareja.fecha_inicio = fecha;
  pintarContador();
  $('contador').classList.remove('pop');
  void $('contador').offsetWidth;
  $('contador').classList.add('pop');
  lluviaCorazones(25);
});

// ---------- Estadísticas ----------
async function cargarStats() {
  const base = () => sb.from('mensajes').select('id', { count: 'exact', head: true }).eq('pareja_id', pareja.id);
  const [msgs, cors] = await Promise.all([base(), base().eq('texto', CORAZON)]);
  const { count: recs } = await sb.from('publicaciones').select('id', { count: 'exact', head: true }).eq('pareja_id', pareja.id);
  animarNumero($('s-recuerdos'), recs || 0);
  animarNumero($('s-mensajes'), msgs.count || 0);
  animarNumero($('s-corazones'), cors.count || 0);
}

function sumarStat(id, n) {
  const nodo = $(id);
  const actual = parseInt(nodo.textContent.replace(/\D/g, ''), 10) || 0;
  nodo.textContent = fmt(Math.max(0, actual + n));
}

function contarMensaje(m) {
  sumarStat('s-mensajes', 1);
  if (m.texto === CORAZON) sumarStat('s-corazones', 1);
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
      v.src = p.url; v.controls = true; v.playsInline = true; v.preload = 'metadata';
      cont.append(v);
    } else {
      const img = document.createElement('img');
      img.src = p.url; img.alt = 'Recuerdo';
      img.addEventListener('click', () => abrirVisor(p.url));
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
  lluviaCorazones(18);
  if (navigator.vibrate) navigator.vibrate(40);
  const { data, error } = await sb.from('mensajes').insert({ pareja_id: pareja.id, texto: CORAZON }).select().single();
  if (error) return alert('No se pudo enviar: ' + traducir(error));
  if (pintarMensaje(data)) contarMensaje(data);
  aviso('❤️ Corazón enviado');
});

// ---------- Animaciones ----------
function lluviaCorazones(cantidad = 24) {
  const capa = $('lluvia');
  const emojis = ['❤️', '💖', '💕', '💗', '💘', '💞'];
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
  const t = $('toast');
  t.textContent = texto;
  t.classList.remove('oculto');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => t.classList.add('oculto'), 2800);
}
