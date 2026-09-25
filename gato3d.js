// Mavis en 3D: gato negro construido con formas (three.js). Se carga solo si el dispositivo soporta WebGL.
import * as THREE from './vendor/three.module.min.js';

const malla = (geo, mat) => new THREE.Mesh(geo, mat);
const lerp = (a, b, k) => a + (b - a) * k;
const suave = (u) => u * u * (3 - 2 * u);

function texturaPelo() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const l = 5 + Math.random() * 11;
    const a = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    const v = Math.random() < 0.5 ? 150 + Math.random() * 90 : 30 + Math.random() * 60;
    g.strokeStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
    g.lineWidth = 0.6 + Math.random() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

export function crearGato3D(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) {
    return null;
  }
  if (!renderer.getContext()) return null;
  const W = 360;
  const H = 254;
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(27, W / H, 0.1, 60);
  camera.position.set(4.3, 2.1, 8.6);
  camera.lookAt(0.4, 1.0, 0);

  scene.add(new THREE.HemisphereLight(0xe8eaf2, 0x3a3a34, 1.35));
  const clave = new THREE.DirectionalLight(0xfff1de, 3.6);
  clave.position.set(-2.5, 5, 4.5);
  scene.add(clave);
  const borde = new THREE.DirectionalLight(0xaab4cf, 1.7);
  borde.position.set(3.5, 2.5, -4.5);
  scene.add(borde);
  const relleno = new THREE.DirectionalLight(0xd0d6e6, 0.8);
  relleno.position.set(4, 1, 3);
  scene.add(relleno);

  // ---------- materiales ----------
  const bump = texturaPelo();
  const pelo = new THREE.MeshPhysicalMaterial({
    color: 0x1a1a1f, roughness: 0.8, metalness: 0, sheen: 0.8, sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0x8c8f9c), bumpMap: bump, bumpScale: 1.1,
  });
  const peloPata = pelo.clone();
  peloPata.color = new THREE.Color(0x232328);
  const nariz = new THREE.MeshStandardMaterial({ color: 0xc07a88, roughness: 0.4 });
  const ojoBase = new THREE.MeshStandardMaterial({ color: 0x070709, roughness: 0.3 });
  const iris = new THREE.MeshStandardMaterial({ color: 0xcfd94a, emissive: 0x516600, emissiveIntensity: 0.55, roughness: 0.25 });
  const pupila = new THREE.MeshStandardMaterial({ color: 0x010102, roughness: 0.2 });
  const brillo = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const interior = new THREE.MeshStandardMaterial({ color: 0x6a4655, roughness: 0.7 });
  const bigote = new THREE.LineBasicMaterial({ color: 0xe9ebf6, transparent: true, opacity: 0.85 });

  // ---------- modelo ----------
  const raiz = new THREE.Group();
  scene.add(raiz);
  const cuerpoG = new THREE.Group();          // se levanta / inclina
  raiz.add(cuerpoG);
  const torso = new THREE.Group();            // respira (escala)
  cuerpoG.add(torso);

  const elipsoide = (sx, sy, sz, mat, x, y, z, padre) => {
    const m = malla(new THREE.SphereGeometry(1, 36, 26), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    (padre || torso).add(m);
    return m;
  };
  // tronco + cuello en una sola pieza suave (perfil revolucionado)
  const perfil = [[-1.75, 0.0], [-1.7, 0.27], [-1.5, 0.52], [-1.2, 0.64], [-0.8, 0.67], [-0.3, 0.6], [0.2, 0.58], [0.7, 0.65], [1.1, 0.68], [1.4, 0.56], [1.62, 0.4], [1.72, 0.22], [1.74, 0.0]]
    .map(([ax, r]) => new THREE.Vector2(r, ax));
  const geoT = new THREE.LatheGeometry(perfil, 56);
  geoT.rotateZ(-Math.PI / 2);
  const pos = geoT.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    if (y < 0 && x > -0.7 && x < 0.9) y *= 0.8;                    // vientre recogido
    z *= 0.94;
    const s = Math.min(1, Math.max(0, (x - 0.85) / 0.8));
    y += s * s * (3 - 2 * s) * 0.42;                                  // el cuello sube
    pos.setXYZ(i, x, y, z);
  }
  geoT.computeVertexNormals();
  torso.add(malla(geoT, pelo));
  elipsoide(0.62, 0.66, 0.6, pelo, -1.02, 0.02, 0);                // cadera
  elipsoide(0.6, 0.62, 0.58, pelo, 0.9, 0.0, 0);                   // pecho

  // cabeza (con pivote en el cuello)
  const cuello = new THREE.Group();
  cuello.position.set(1.62, 0.44, 0);
  cuerpoG.add(cuello);
  const cabeza = new THREE.Group();
  cabeza.position.set(0.44, 0.28, 0);
  cuello.add(cabeza);
  elipsoide(0.6, 0.52, 0.55, pelo, 0, 0, 0, cabeza);                    // cráneo
  elipsoide(0.33, 0.28, 0.19, pelo, 0.1, -0.17, 0.35, cabeza);           // mejilla cercana
  elipsoide(0.33, 0.28, 0.19, pelo, 0.1, -0.17, -0.35, cabeza);
  elipsoide(0.28, 0.21, 0.29, peloPata, 0.5, -0.15, 0, cabeza);        // hocico
  elipsoide(0.14, 0.1, 0.18, peloPata, 0.56, -0.3, 0, cabeza);         // barbilla
  const narizM = malla(new THREE.SphereGeometry(0.058, 16, 12), nariz);
  narizM.scale.set(0.9, 0.75, 1.15);
  narizM.position.set(0.745, -0.05, 0);
  cabeza.add(narizM);

  const oreja = (lado) => {
    const g = new THREE.Group();
    const ext = malla(new THREE.ConeGeometry(0.27, 0.6, 24), pelo);
    ext.scale.z = 0.62;
    const int = malla(new THREE.ConeGeometry(0.17, 0.44, 18), interior);
    int.scale.z = 0.5;
    int.position.set(0.055, -0.03, 0);
    g.add(ext, int);
    g.position.set(-0.06, 0.5, lado * 0.36);
    g.rotation.set(lado * 0.42, 0, -0.06);
    return g;
  };
  cabeza.add(oreja(1), oreja(-1));

  const ojos = [];
  const ojo = (lado) => {
    const g = new THREE.Group();
    const base = malla(new THREE.SphereGeometry(0.118, 22, 16), ojoBase);
    base.scale.set(0.55, 1, 1);
    const ir = malla(new THREE.SphereGeometry(0.104, 22, 16), iris);
    ir.scale.set(0.55, 0.96, 0.96);
    ir.position.x = 0.024;
    const pu = malla(new THREE.SphereGeometry(0.1, 16, 12), pupila);
    pu.scale.set(0.3, 0.96, 0.2);
    pu.position.x = 0.05;
    const br = malla(new THREE.SphereGeometry(0.03, 10, 8), brillo);
    br.position.set(0.064, 0.05, -0.035 * lado);
    g.add(base, ir, pu, br);
    g.position.set(0.46, 0.11, lado * 0.235);
    g.rotation.y = -lado * 0.42;
    cabeza.add(g);
    ojos.push(g);
  };
  ojo(1);
  ojo(-1);

  // bigotes
  const pts = [];
  [1, -1].forEach((lado) => {
    [[0.03, 0.2], [0, 0.02], [-0.03, -0.16]].forEach(([dy, ey]) => {
      pts.push(0.56, -0.1 + dy, lado * 0.17, 1.14, -0.1 + ey, lado * 0.68);
    });
  });
  const geoBig = new THREE.BufferGeometry();
  geoBig.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  cabeza.add(new THREE.LineSegments(geoBig, bigote));

  // patas: [pivote, segmentoInferior?]
  const patas = [];
  const pata = (x, z, trasera) => {
    const piv = new THREE.Group();
    piv.position.set(x, -0.08, z);
    let inferior = null;
    if (!trasera) {
      const s = malla(new THREE.CylinderGeometry(0.2, 0.13, 1.05, 18), pelo);
      s.position.y = -0.52;
      const paw = malla(new THREE.SphereGeometry(0.165, 18, 12), peloPata);
      paw.scale.set(1.5, 0.66, 1.15);
      paw.position.set(0.09, -1.05, 0);
      piv.add(s, paw);
    } else {
      const muslo = malla(new THREE.SphereGeometry(0.36, 24, 18), pelo);
      muslo.scale.set(0.95, 1.42, 0.9);
      muslo.position.set(0, -0.3, 0);
      inferior = new THREE.Group();
      inferior.position.set(-0.05, -0.58, 0);
      const s = malla(new THREE.CylinderGeometry(0.135, 0.095, 0.62, 18), pelo);
      s.position.y = -0.3;
      const paw = malla(new THREE.SphereGeometry(0.165, 18, 12), peloPata);
      paw.scale.set(1.5, 0.66, 1.15);
      paw.position.set(0.09, -0.62, 0);
      inferior.add(s, paw);
      inferior.rotation.z = -0.5;
      piv.add(muslo, inferior);
    }
    cuerpoG.add(piv);
    patas.push({ piv, inferior, trasera, lado: z > 0 ? 1 : -1 });
    return piv;
  };
  pata(0.95, 0.34, false);    // 0 delantera cercana
  pata(0.95, -0.34, false);   // 1 delantera lejana
  pata(-1.05, 0.36, true);    // 2 trasera cercana
  pata(-1.05, -0.36, true);   // 3 trasera lejana

  // cola articulada
  const colaRaiz = new THREE.Group();
  colaRaiz.position.set(-1.62, 0.16, 0);
  cuerpoG.add(colaRaiz);
  const colaSegs = [];
  let padre = colaRaiz;
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    g.position.y = i === 0 ? 0 : 0.235;
    const r0 = 0.125 - i * 0.0068;
    const m = malla(new THREE.CylinderGeometry(r0 * 0.93, r0, 0.26, 14), pelo);
    m.position.y = 0.12;
    g.add(m);
    if (i === 9) {
      const punta = malla(new THREE.SphereGeometry(r0 * 0.93, 14, 10), pelo);
      punta.position.y = 0.25;
      g.add(punta);
    }
    padre.add(g);
    colaSegs.push(g);
    padre = g;
  }

  // sombra en el suelo
  const sombra = malla(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  sombra.rotation.x = -Math.PI / 2;
  sombra.scale.set(2.6, 0.95, 1);
  sombra.position.set(0.0, 0.01, 0);
  scene.add(sombra);

  // ---------- estado de la animación ----------
  let t = 0;
  let fase = 0;
  let parpadeoEn = 2 + Math.random() * 3;
  let parpadeo = 0;
  let salto = null;
  let zarpazo = null;
  let estiron = null;
  const cur = { y: 1.22, pitch: 0, cabezaPitch: 0, cabezaYaw: 0, ojo: 1, pliegue: 0, agazape: 0, enroscada: 0, mov: 0 };

  function tick(dt, e) {
    dt = Math.min(dt, 0.05);
    t += dt;

    const dormida = !!e.dormida;
    const tgt = { y: 1.22, pitch: 0, cabezaPitch: 0, cabezaYaw: Math.sin(t * 0.6) * 0.1, ojo: 1, pliegue: 0, agazape: 0, enroscada: 0, mov: e.camina ? 1 : 0 };
    if (dormida) {
      tgt.y = 0.66; tgt.pitch = 0.02; tgt.cabezaPitch = -0.62; tgt.cabezaYaw = 0.18; tgt.ojo = 0.03; tgt.pliegue = 1; tgt.enroscada = 1;
    } else if (e.agazapada) {
      tgt.y = 0.96; tgt.pitch = -0.22; tgt.cabezaPitch = 0.12; tgt.agazape = 1; tgt.cabezaYaw = 0;
    }
    if (e.olfatea) { tgt.cabezaPitch = -0.75; tgt.pitch = -0.1; }
    if (e.ronronea) tgt.ojo = 0.12;
    if (e.feliz && !dormida) tgt.ojo = 0.1;
    const k = 1 - Math.exp(-dt * 7);
    for (const n in tgt) cur[n] = lerp(cur[n], tgt[n], k);

    // parpadeo
    parpadeoEn -= dt;
    if (parpadeoEn <= 0 && !dormida) { parpadeo = 0.16; parpadeoEn = 2.5 + Math.random() * 3.5; }
    if (parpadeo > 0) parpadeo -= dt;
    const abre = parpadeo > 0 ? 0.08 : 1;

    // ciclo de marcha
    if (e.camina) fase += dt * (e.velUnidades || 2) * 5.6;
    const paso = cur.mov;
    const amp = 0.55 * paso;

    // saltos y estiramientos
    let dy = 0;
    let esc = 1;
    if (salto) {
      salto.t += dt;
      const u = Math.min(1, salto.t / salto.dur);
      dy = Math.sin(u * Math.PI) * 0.85;
      esc = 1 + (u < 0.15 || u > 0.85 ? -0.07 : 0.05);
      if (u >= 1) salto = null;
    }
    let bow = 0;
    if (estiron) {
      estiron.t += dt;
      const u = Math.min(1, estiron.t / estiron.dur);
      bow = Math.sin(u * Math.PI);
      if (u >= 1) estiron = null;
    }
    let swat = 0;
    if (zarpazo) {
      zarpazo.t += dt;
      const u = Math.min(1, zarpazo.t / zarpazo.dur);
      swat = Math.sin(u * Math.PI);
      if (u >= 1) zarpazo = null;
    }

    const rebote = Math.abs(Math.sin(fase)) * 0.045 * paso;
    raiz.position.y = dy;
    raiz.position.x = e.ronronea ? Math.sin(t * 70) * 0.012 : 0;
    raiz.scale.set(1, esc, 1);
    cuerpoG.position.y = cur.y + rebote - bow * 0.08;
    cuerpoG.rotation.z = cur.pitch - bow * 0.3 + Math.sin(fase * 2) * 0.012 * paso + swat * 0.06;
    cuerpoG.rotation.y = cur.agazape * Math.sin(t * 16) * 0.05;
    torso.scale.y = 1 + Math.sin(t * (dormida ? 1.5 : 2.2)) * (dormida ? 0.03 : 0.012);

    cuello.rotation.z = cur.cabezaPitch + Math.sin(fase * 2 + 1) * 0.03 * paso;
    cuello.rotation.y = cur.cabezaYaw;
    ojos.forEach((o) => { o.scale.y = Math.max(0.03, Math.min(cur.ojo, abre)); });

    // patas
    const fases = [0, Math.PI, Math.PI, 0];
    patas.forEach((p, i) => {
      let ang = Math.sin(fase + fases[i]) * amp;
      let baseA = 0;
      let escY = 1;
      if (!p.trasera) {
        baseA += cur.pliegue * 1.45 + bow * 0.5 + cur.agazape * 0.3;
        escY = 1 - cur.pliegue * 0.42;
        if (i === 0) ang -= swat * 1.5;
      } else {
        baseA += -cur.pliegue * 1.25 - cur.agazape * 0.1;
        escY = 1 - cur.pliegue * 0.4;
        if (p.inferior) p.inferior.rotation.z = -0.5 - cur.pliegue * 0.9 + Math.max(0, -ang) * 0.9;
      }
      p.piv.rotation.z = baseA + ang;
      p.piv.scale.y = escY;
    });

    // cola
    const curva = lerp(-0.17, 0.08, cur.enroscada);
    colaRaiz.rotation.z = lerp(1.3, 1.7, cur.enroscada) - bow * 0.3 - cur.agazape * 0.25;
    colaRaiz.rotation.y = cur.enroscada * 0.5;
    colaSegs.forEach((s, i) => {
      if (i === 0) return;
      const onda = Math.sin(t * (e.camina ? 3.2 : 1.6) + i * 0.55) * (0.07 + i * 0.008) * (e.ronronea ? 1.5 : 1);
      s.rotation.z = curva * (i < 6 ? 1 : 1.5) - (e.feliz ? 0.05 * i : 0) + onda;
      s.rotation.y = cur.enroscada * 0.34;
    });

    sombra.scale.set(2.6 - dy * 0.5, 0.95 - dy * 0.2, 1);
    sombra.material.opacity = 0.28 - dy * 0.12;
    renderer.render(scene, camera);
  }

  return {
    tick,
    salto() { salto = { t: 0, dur: 0.7 }; },
    zarpazo() { zarpazo = { t: 0, dur: 0.34 }; },
    estirar() { estiron = { t: 0, dur: 1.3 }; },
    liberar() { renderer.dispose(); },
  };
}
