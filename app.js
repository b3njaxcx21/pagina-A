// =============================================
//  Nosotros - App de parejas (Fase 1)
// =============================================
const SUPABASE_URL = 'https://kupwqulxzsgupyowpsnd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8DiVJX0CTBUtmPUnu3ihvw_aOgWsjpz';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'recuerdos';
const MAX_MB = 50;

const $ = (id) => document.getElementById(id);

// ---------- Estado ----------
let usuario = null;
let perfil = null;
let pareja = null;
let perfiles = {};        // id -> nombre
let canal = null;
let modoAuth = 'entrar';
let archivoSel = null;
let vistaActual = 'muro';
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
document.querySelectorAll('.pestana').forEach((b) => {
  b.addEventListener('click', () => {
    modoAuth = b.dataset.modo;
    document.querySelectorAll('.pestana').forEach((x) => x.classList.toggle('activa', x === b));
    const registro = modoAuth === 'registro';
    $('auth-nombre').classList.toggle('oculto', !registro);
    $('auth-nombre').required = registro;
    $('auth-pass').autocomplete = registro ? 'new-password' : 'current-password';
    $('btn-auth').textContent = registro ? 'Crear cuenta' : 'Entrar';
    $('auth-msg').textContent = '';
  });
});

$('form-auth').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-pass').value;
  const nombre = $('auth-nombre').value.trim();
  const btn = $('btn-auth');
  btn.disabled = true;
  $('auth-msg').textContent = '';

  if (modoAuth === 'registro') {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { nombre },
        emailRedirectTo: location.origin + location.pathname,
      },
    });
    if (error) $('auth-msg').textContent = traducir(error);
    else if (!data.session) {
      $('auth-msg').textContent = '📩 Te enviamos un correo. Ábrelo para confirmar tu cuenta y luego entra.';
    }
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) $('auth-msg').textContent = traducir(error);
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
  return true;
}

function limpiar() {
  if (canal) { sb.removeChannel(canal); canal = null; }
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
  cambiarVista('muro');
  await Promise.all([cargarPublicaciones(), cargarMensajes()]);
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
  if (nodo) nodo.remove();
  revisarVacio();
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
  if (vistaActual !== 'chat' && m.autor_id !== usuario.id) {
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
  pintarMensaje(data);
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
