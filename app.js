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

// ---------- Estado ----------
let usuario = null;
let perfil = null;
let pareja = null;
let perfiles = {};        // id -> nombre
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
  benjamin: { hex: '#2fbf71', corazon: '💚' },
  alondra: { hex: '#9b6bd6', corazon: '💜' },
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
  const { data } = await sb.from('perfiles').select('id, nombre, avatar_path');
  perfiles = {};
  (data || []).forEach((p) => { perfiles[p.id] = p.nombre || 'Sin nombre'; });
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
  $('btn-corazon').querySelector('span').textContent = (colorDe(usuario.id) || {}).corazon || '❤️';
}

// Muestra la foto de perfil (o la inicial si no tiene)
function pintarAvatar(nodo) {
  const id = nodo.dataset.uid;
  const url = fotos[id];
  const color = colorDe(id);
  nodo.style.background = color ? color.hex : '';
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
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

// ---------- Navegación ----------
document.querySelectorAll('.nav-btn').forEach((b) => {
  b.addEventListener('click', () => cambiarVista(b.dataset.vista));
});

function cambiarVista(vista) {
  vistaActual = vista;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('activa', b.dataset.vista === vista));
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === 'vista-' + vista));
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
}

// =============================================
//  PLANES Y METAS JUNTOS
// =============================================
const CATEGORIAS = { viaje: '✈️', comida: '🍽️', plan: '🎬', sueno: '🌟', casa: '🏠', otro: '💫' };
let planes = [];
let catSel = 'plan';
let planNuevo = null;

Object.entries(CATEGORIAS).forEach(([clave, emoji]) => {
  const chip = el('button', 'chip' + (clave === catSel ? ' activa' : ''), emoji);
  chip.type = 'button';
  chip.dataset.cat = clave;
  chip.addEventListener('click', () => {
    catSel = clave;
    document.querySelectorAll('#plan-cats .chip').forEach((c) => c.classList.toggle('activa', c === chip));
  });
  $('plan-cats').append(chip);
});

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

function pintarPlanes() {
  const pendientes = planes.filter((x) => !x.hecho);
  const hechos = planes.filter((x) => x.hecho).sort((a, b) => new Date(b.hecho_en || 0) - new Date(a.hecho_en || 0));
  const total = planes.length;
  $('planes-num').textContent = total ? `${hechos.length} de ${total} cumplidos` : 'Aún no hay planes. ¡Agreguen el primero!';
  $('planes-barra').style.width = (total ? (hechos.length / total) * 100 : 0) + '%';
  $('s-planes').textContent = fmt(hechos.length);

  const partes = [];
  if (!total) {
    const v = el('div', 'vacio');
    v.append(el('div', '', '🗺️'), el('p', '', 'Viajes, comidas, sueños… lo que quieran hacer juntos.'));
    partes.push(v);
  }
  if (pendientes.length) partes.push(el('h3', 'planes-tit', 'Por cumplir'), ...pendientes.map(crearPlan));
  if (hechos.length) partes.push(el('h3', 'planes-tit', '¡Cumplidos! 🎉'), ...hechos.map(crearPlan));
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
    el('div', 'plan-texto', `${CATEGORIAS[p.categoria] || '💫'} ${p.texto}`),
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
    .insert({ pareja_id: pareja.id, texto, categoria: catSel })
    .select()
    .single();
  btn.disabled = false;
  if (error) return alert('No se pudo agregar: ' + traducir(error));
  $('plan-texto').value = '';
  if (!planes.some((x) => x.id === data.id)) {
    planes.unshift(data);
    planNuevo = data.id;
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
  { nombre: 'Benjamin', fecha: '2004-08-21', color: '#2fbf71', corazon: '💚' },
  { nombre: 'Alondra', fecha: '2005-04-12', color: '#9b6bd6', corazon: '💜' },
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
  lluviaCorazones(18, [(colorDe(usuario.id) || {}).corazon]);
  if (navigator.vibrate) navigator.vibrate(40);
  const { data, error } = await sb.from('mensajes').insert({ pareja_id: pareja.id, texto: CORAZON }).select().single();
  if (error) return alert('No se pudo enviar: ' + traducir(error));
  if (primeraVez(data.id)) sumarStat('s-corazones', 1);
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
const mvAncho = 84;
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
      mvCorazones(3);
      if (navigator.vibrate) navigator.vibrate(25);
    }
  });
});

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
  document.querySelectorAll('.muneca, .prop-coraline').forEach((n) => n.remove());
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

const SVG_MUNECA = `
<svg viewBox="0 0 100 210" aria-hidden="true">
  <defs>
    <pattern id="mv-rayas" width="9" height="8" patternUnits="userSpaceOnUse"><rect width="9" height="4" fill="#9a9aa6"/><rect y="4" width="9" height="4" fill="#5b2636"/></pattern>
    <radialGradient id="mv-piel" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="#fce9d8"/><stop offset=".7" stop-color="#f0cfb0"/><stop offset="1" stop-color="#dcae88"/></radialGradient>
    <linearGradient id="mv-pelo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4dc8"/><stop offset="1" stop-color="#121a63"/></linearGradient>
    <linearGradient id="mv-abrigo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fce052"/><stop offset=".55" stop-color="#f2c21b"/><stop offset="1" stop-color="#d59a06"/></linearGradient>
    <linearGradient id="mv-bota" x1="0" x2="1"><stop offset="0" stop-color="#f7d43a"/><stop offset="1" stop-color="#d9a30c"/></linearGradient>
  </defs>
  <!-- botas -->
  <rect x="35" y="176" width="13" height="24" rx="3" fill="url(#mv-bota)"/>
  <rect x="29" y="195" width="22" height="11" rx="5.5" fill="url(#mv-bota)"/>
  <rect x="29" y="203" width="22" height="3.5" rx="1.7" fill="#2f2f38"/>
  <rect x="52" y="176" width="13" height="24" rx="3" fill="url(#mv-bota)"/>
  <rect x="49" y="195" width="22" height="11" rx="5.5" fill="url(#mv-bota)"/>
  <rect x="49" y="203" width="22" height="3.5" rx="1.7" fill="#2f2f38"/>
  <path d="M36 180 v14 M62 180 v14" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".35"/>
  <!-- medias de rayas -->
  <rect x="37" y="138" width="10" height="40" rx="3" fill="url(#mv-rayas)"/>
  <rect x="53" y="138" width="10" height="40" rx="3" fill="url(#mv-rayas)"/>
  <!-- falda tejida -->
  <path d="M28 120 L72 120 L77 142 Q50 148 23 142 Z" fill="#8a2a3a"/>
  <path d="M30 128 h40 M28 135 h44" stroke="#b04a62" stroke-width="1" stroke-dasharray="1.5 2.5"/>
  <!-- bolsa -->
  <rect x="67" y="104" width="20" height="25" rx="3" fill="#7a1f3a"/>
  <path d="M67 107 Q77 116 87 107 L87 104 L67 104 Z" fill="#561230"/>
  <path d="M69 118 h16" stroke="#9c3556" stroke-width="1" stroke-dasharray="2 2"/>
  <!-- impermeable -->
  <path d="M30 62 Q34 56 45 58 L55 58 Q66 56 70 62 L76 124 Q50 131 24 124 Z" fill="url(#mv-abrigo)"/>
  <path d="M58 60 Q66 58 70 64 L76 124 Q68 127 60 128 Z" fill="#b98005" opacity=".35"/>
  <path d="M34 78 Q38 96 34 122 M66 84 Q62 100 66 124 M42 100 Q44 112 40 124" fill="none" stroke="#c48a05" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>
  <path d="M50 66 L50 126" stroke="#a87806" stroke-width="1.3"/>
  <path d="M38 56 Q50 68 62 56 Q67 63 60 68 L40 68 Q33 63 38 56 Z" fill="#e8b310"/>
  <path d="M40 60 Q50 68 60 60" fill="none" stroke="#fce052" stroke-width="1.2" opacity=".6"/>
  <circle cx="46" cy="66" r="1.5" fill="#8a6205"/><circle cx="54" cy="66" r="1.5" fill="#8a6205"/>
  <path d="M46 67 q-1 7 1 10 M54 67 q1 7 -1 10" stroke="#8a6205" stroke-width=".9" fill="none"/>
  <!-- correa -->
  <path d="M37 60 L74 110" stroke="#7a1f3a" stroke-width="4" stroke-linecap="round"/>
  <path d="M38 59 L75 109" stroke="#a03052" stroke-width="1" stroke-linecap="round" opacity=".6"/>
  <!-- brazo en la cadera -->
  <path d="M68 66 Q88 78 77 104" fill="none" stroke="url(#mv-abrigo)" stroke-width="12" stroke-linecap="round"/>
  <path d="M74 70 Q86 82 79 100" fill="none" stroke="#b98005" stroke-width="2.4" stroke-linecap="round" opacity=".4"/>
  <circle cx="76" cy="107" r="4.6" fill="url(#mv-piel)"/>
  <!-- brazo que saluda -->
  <g class="brazo-saluda">
    <path d="M33 68 Q17 62 14 44" fill="none" stroke="url(#mv-abrigo)" stroke-width="12" stroke-linecap="round"/>
    <path d="M22 60 Q17 54 16 48" fill="none" stroke="#b98005" stroke-width="2.4" stroke-linecap="round" opacity=".4"/>
    <circle cx="13.5" cy="39.5" r="4.8" fill="url(#mv-piel)"/>
    <path d="M11 36 v-3 M13.5 35 v-3.5 M16 36 v-3" stroke="#dcae88" stroke-width="1.4" stroke-linecap="round"/>
  </g>
  <!-- cuello -->
  <rect x="45" y="53" width="10" height="9" rx="3" fill="#e2b892"/>
  <!-- pelo atrás -->
  <path d="M27 40 Q23 10 50 9 Q77 10 73 40 L73 61 Q64 66 60 58 L40 58 Q36 66 27 61 Z" fill="url(#mv-pelo)"/>
  <!-- orejas -->
  <ellipse cx="33" cy="41" rx="3.4" ry="4.6" fill="#e8bd98"/>
  <ellipse cx="67" cy="41" rx="3.4" ry="4.6" fill="#e8bd98"/>
  <!-- cara de muñeca de porcelana -->
  <ellipse cx="50" cy="38" rx="17.5" ry="19.5" fill="url(#mv-piel)"/>
  <circle cx="39" cy="46" r="4.2" fill="#f0a89a" opacity=".3"/>
  <circle cx="61" cy="46" r="4.2" fill="#f0a89a" opacity=".3"/>
  <!-- ojos -->
  <ellipse cx="43" cy="38" rx="4.5" ry="5" fill="#fff"/>
  <ellipse cx="58" cy="38" rx="4.5" ry="5" fill="#fff"/>
  <circle cx="43.6" cy="38.7" r="3.3" fill="#8a4a35"/>
  <circle cx="58.6" cy="38.7" r="3.3" fill="#8a4a35"/>
  <circle cx="43.6" cy="38.7" r="2" fill="#4a2417"/>
  <circle cx="58.6" cy="38.7" r="2" fill="#4a2417"/>
  <circle cx="43.8" cy="38.9" r="1.1" fill="#0f0806"/>
  <circle cx="58.8" cy="38.9" r="1.1" fill="#0f0806"/>
  <circle cx="42.4" cy="36.8" r="1.1" fill="#fff"/>
  <circle cx="57.4" cy="36.8" r="1.1" fill="#fff"/>
  <path d="M38 33 Q43 30 48 32.5 M53 32.5 Q58 30 63 33" fill="none" stroke="#5a3a2a" stroke-width="1.5" stroke-linecap="round"/>
  <!-- nariz, boca, pecas -->
  <path d="M50 40 Q48.5 45.5 51 46.5" fill="none" stroke="#c99878" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M45 50.5 Q50.5 55 57 49.5 Q51 52 45 50.5 Z" fill="#c4566a" stroke="#a63f52" stroke-width=".8" stroke-linejoin="round"/>
  <g fill="#c99570"><circle cx="40" cy="43" r=".75"/><circle cx="43" cy="44.6" r=".75"/><circle cx="37.6" cy="45" r=".7"/><circle cx="60" cy="43" r=".75"/><circle cx="57" cy="44.6" r=".75"/><circle cx="62.4" cy="45" r=".7"/></g>
  <!-- flequillo -->
  <path d="M31 36 Q28 12 52 10 Q72 11 69 36 Q63 21 47 24 Q36 26 31 36 Z" fill="url(#mv-pelo)"/>
  <path d="M35 20 Q46 13 62 16 M33 27 Q40 20 50 20" fill="none" stroke="#6b7df0" stroke-width="1.4" stroke-linecap="round" opacity=".65"/>
  <path d="M30 38 Q27 50 33 61 Q27 59 26 52 Z M70 38 Q73 50 67 61 Q73 59 74 52 Z" fill="#141c69"/>
  <path d="M31 40 Q29 52 32 58 M69 40 Q71 52 68 58" fill="none" stroke="#5062d8" stroke-width="1" opacity=".55"/>
  <!-- broche de libélula -->
  <g transform="translate(31 27) rotate(-30)">
    <ellipse cx="-3" cy="-2.6" rx="3.6" ry="1.6" fill="#f4a9c8" stroke="#c9a24d" stroke-width=".5"/>
    <ellipse cx="3" cy="-2.6" rx="3.6" ry="1.6" fill="#f4a9c8" stroke="#c9a24d" stroke-width=".5"/>
    <ellipse cx="-2.6" cy="1.8" rx="3.2" ry="1.4" fill="#f4a9c8" stroke="#c9a24d" stroke-width=".5"/>
    <ellipse cx="2.6" cy="1.8" rx="3.2" ry="1.4" fill="#f4a9c8" stroke="#c9a24d" stroke-width=".5"/>
    <circle r="1.6" fill="#2ec1e0"/>
  </g>
</svg>
`;

function asomarMuneca() {
  if (document.hidden || !$('pantalla-app').classList.contains('activa')) {
    tTimeout(asomarMuneca, 8000);
    return;
  }
  const m = el('div', 'muneca ' + (Math.random() < 0.5 ? 'izq' : 'der'));
  m.innerHTML = SVG_MUNECA;
  m.style.top = azar(6, 36) + 'vh';
  m.addEventListener('pointerdown', () => {
    const svg = m.querySelector('svg');
    svg.classList.remove('risa');
    void svg.getBoundingClientRect();
    svg.classList.add('risa');
    if (navigator.vibrate) navigator.vibrate(30);
  });
  document.body.append(m);
  tTimeout(() => m.classList.add('asoma'), 60);
  tTimeout(() => m.classList.remove('asoma'), 4600);
  tTimeout(() => m.remove(), 5600);
  tTimeout(asomarMuneca, azar(22000, 45000));
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
  try { localStorage.setItem('tema', tema); } catch (_) { /* sin almacenamiento */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = COLOR_TEMA[tema];
  document.querySelectorAll('.tema-op').forEach((b) => b.classList.toggle('activa', b.dataset.tema === tema));

  if (tema === 'coraline') {
    cieloCoraline();
    tTimeout(asomarMuneca, 4000);
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
  abrir.href = `https://open.spotify.com/${tipo}/${id}`;
  abrir.classList.remove('oculto');
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

function prepararRevelado() {
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
