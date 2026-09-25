// Mavis en 3D: gatita negra de estilo anime (sombreado por bandas), construida con formas (three.js).
import * as THREE from './vendor/three.module.min.js';

const malla = (geo, mat) => new THREE.Mesh(geo, mat);
const lerp = (a, b, k) => a + (b - a) * k;

// bandas de luz para el sombreado tipo caricatura
function gradiente() {
  const d = new Uint8Array([70, 120, 190, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// ojo grande y brillante con pestañas (dibujado en un lienzo)
function texturaOjo() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const iris = g.createRadialGradient(128, 158, 6, 128, 128, 118);
  iris.addColorStop(0, '#d9ffb8');
  iris.addColorStop(0.32, '#5fdc95');
  iris.addColorStop(0.75, '#128a66');
  iris.addColorStop(1, '#083d31');
  g.fillStyle = iris;
  g.beginPath();
  g.ellipse(128, 132, 100, 108, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = '#041511';
  g.stroke();
  // pupila
  g.fillStyle = '#02090a';
  g.beginPath();
  g.ellipse(128, 136, 34, 64, 0, 0, Math.PI * 2);
  g.fill();
  // sombra del párpado
  const sombra = g.createLinearGradient(0, 30, 0, 130);
  sombra.addColorStop(0, 'rgba(0,0,0,.62)');
  sombra.addColorStop(1, 'rgba(0,0,0,0)');
  g.save();
  g.beginPath();
  g.ellipse(128, 132, 96, 104, 0, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = sombra;
  g.fillRect(0, 0, 256, 140);
  g.restore();
  // brillos
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(90, 88, 25, 29, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(160, 172, 11, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.75;
  g.beginPath(); g.arc(152, 74, 6.5, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  // delineado y pestañas
  g.strokeStyle = '#050507';
  g.lineCap = 'round';
  g.lineWidth = 17;
  g.beginPath(); g.moveTo(16, 132); g.quadraticCurveTo(100, -14, 236, 78); g.stroke();
  g.lineWidth = 13;
  g.beginPath(); g.moveTo(224, 74); g.quadraticCurveTo(246, 64, 254, 42); g.stroke();
  g.lineWidth = 9;
  [[172, 34, 190, 12], [200, 46, 224, 30], [218, 62, 244, 52]].forEach(([x1, y1, x2, y2]) => {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(27, W / H, 0.1, 60);
  camera.position.set(4.0, 1.9, 8.3);
  camera.lookAt(0.3, 0.95, 0);

  scene.add(new THREE.HemisphereLight(0xf4f0ff, 0x554d60, 2.1));
  const clave = new THREE.DirectionalLight(0xfff5e6, 2.6);
  clave.position.set(-2.5, 5, 4.5);
  scene.add(clave);
  const borde = new THREE.DirectionalLight(0xb8c4ff, 1.4);
  borde.position.set(3.5, 2.5, -4.5);
  scene.add(borde);

  // ---------- materiales ----------
  const mapaLuz = gradiente();
  const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: mapaLuz });
  const pelo = toon(0x2b2b37);
  const peloPata = toon(0x353543);
  const interior = toon(0xf5a3bd);
  const rosa = toon(0xff7fb0);
  const rosaClaro = toon(0xffb3d1);
  const nariz = toon(0xff9db8);
  const texOjo = texturaOjo();
  const matOjo = new THREE.MeshBasicMaterial({ map: texOjo, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const matMejilla = new THREE.MeshBasicMaterial({ color: 0xff8fb5, transparent: true, opacity: 0.34, depthWrite: false });
  const linea = new THREE.LineBasicMaterial({ color: 0x1a1220 });
  const bigote = new THREE.LineBasicMaterial({ color: 0xf1f0fa, transparent: true, opacity: 0.9 });

  // ---------- modelo ----------
  const raiz = new THREE.Group();
  scene.add(raiz);
  const cuerpoG = new THREE.Group();
  raiz.add(cuerpoG);
  const torso = new THREE.Group();
  cuerpoG.add(torso);

  const elipsoide = (sx, sy, sz, mat, x, y, z, padre) => {
    const m = malla(new THREE.SphereGeometry(1, 40, 28), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    (padre || torso).add(m);
    return m;
  };

  // tronco esbelto y elegante, en una sola pieza suave
  const perfil = [[-1.5, 0], [-1.46, 0.22], [-1.3, 0.42], [-1.0, 0.52], [-0.6, 0.52], [-0.1, 0.47], [0.35, 0.49], [0.75, 0.56], [1.05, 0.54], [1.25, 0.44], [1.36, 0.3], [1.4, 0.15], [1.41, 0]]
    .map(([ax, r]) => new THREE.Vector2(r * 1.04, ax * 0.88));
  const geoT = new THREE.LatheGeometry(perfil, 56);
  geoT.rotateZ(-Math.PI / 2);
  const pos = geoT.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    if (y < 0 && x > -0.62 && x < 0.8) y *= 0.82;                     // vientre recogido
    y += Math.cos(((x + 0.18) / 2.3) * Math.PI) * 0.06;                // lomo ligeramente arqueado
    z *= 0.92;
    const s = Math.min(1, Math.max(0, (x - 0.8) / 0.44));
    y += s * s * (3 - 2 * s) * 0.26;                                   // el cuello sube
    pos.setXYZ(i, x, y, z);
  }
  geoT.computeVertexNormals();
  torso.add(malla(geoT, pelo));
  elipsoide(0.52, 0.58, 0.54, pelo, -0.8, 0.02, 0);                 // cadera
  elipsoide(0.46, 0.56, 0.5, pelo, 0.72, 0.0, 0);                     // pecho

  // cabeza grande y redondita
  const cuello = new THREE.Group();
  cuello.position.set(1.14, 0.34, 0);
  cuerpoG.add(cuello);
  const cabeza = new THREE.Group();
  cabeza.position.set(0.38, 0.3, 0);
  cuello.add(cabeza);
  elipsoide(0.66, 0.58, 0.64, pelo, 0, 0, 0, cabeza);                   // cráneo
  elipsoide(0.36, 0.3, 0.22, pelo, 0.06, -0.2, 0.4, cabeza);            // mejilla cercana
  elipsoide(0.36, 0.3, 0.22, pelo, 0.06, -0.2, -0.4, cabeza);
  elipsoide(0.24, 0.17, 0.26, peloPata, 0.52, -0.17, 0, cabeza);        // hocico pequeño
  const narizM = malla(new THREE.SphereGeometry(0.05, 16, 12), nariz);
  narizM.scale.set(0.8, 0.62, 1.1);
  narizM.position.set(0.735, -0.1, 0);
  cabeza.add(narizM);

  // boca en "w"
  const boca = [];
  [1, -1].forEach((l) => {
    boca.push(0.73, -0.13, 0, 0.71, -0.2, l * 0.02, 0.71, -0.2, l * 0.02, 0.67, -0.23, l * 0.11, 0.67, -0.23, l * 0.11, 0.62, -0.21, l * 0.16);
  });
  const geoBoca = new THREE.BufferGeometry();
  geoBoca.setAttribute('position', new THREE.Float32BufferAttribute(boca, 3));
  cabeza.add(new THREE.LineSegments(geoBoca, linea));

  const orejas = [];
  const oreja = (lado) => {
    const g = new THREE.Group();
    const geo = new THREE.ConeGeometry(0.36, 0.74, 3);
    geo.rotateY(Math.PI / 2);
    const ext = malla(geo, pelo);
    ext.scale.z = 0.55;
    const geoI = new THREE.ConeGeometry(0.23, 0.5, 3);
    geoI.rotateY(Math.PI / 2);
    const int = malla(geoI, interior);
    int.scale.z = 0.4;
    int.position.set(0.085, -0.05, 0);
    g.add(ext, int);
    g.position.set(-0.12, 0.6, lado * 0.34);
    g.rotation.set(lado * 0.42, 0, -0.08);
    g.userData.baseX = g.rotation.x;
    cabeza.add(g);
    orejas.push(g);
  };
  oreja(1);
  oreja(-1);

  // ojos grandes con pestañas
  const ojos = [];
  const ojo = (lado) => {
    const g = new THREE.Group();
    const pl = malla(new THREE.PlaneGeometry(0.44, 0.44), matOjo);
    g.add(pl);
    g.position.set(0.5, 0.07, lado * 0.4);
    g.rotation.y = Math.PI / 2 - lado * 0.72;
    g.scale.x = lado > 0 ? -1 : 1;
    cabeza.add(g);
    ojos.push(g);
  };
  ojo(1);
  ojo(-1);

  // mejillas rosadas
  [1, -1].forEach((lado) => {
    const m = malla(new THREE.CircleGeometry(0.09, 24), matMejilla);
    m.scale.set(1.5, 0.75, 1);
    m.position.set(0.3, -0.04, lado * 0.53);
    m.rotation.y = Math.PI / 2 - lado * 1.05;
    cabeza.add(m);
  });

  // bigotes
  const pts = [];
  [1, -1].forEach((lado) => {
    [[0.03, 0.2], [0, 0.03], [-0.03, -0.14]].forEach(([dy, ey]) => {
      pts.push(0.6, -0.16 + dy, lado * 0.2, 1.1, -0.16 + ey, lado * 0.66);
    });
  });
  const geoBig = new THREE.BufferGeometry();
  geoBig.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  cabeza.add(new THREE.LineSegments(geoBig, bigote));

  // moñito rosa junto a la oreja
  const mono = new THREE.Group();
  const ala = (lado) => {
    const a = malla(new THREE.SphereGeometry(0.15, 20, 14), rosa);
    a.scale.set(1.35, 0.85, 0.5);
    a.position.set(0.14 * lado, 0, 0);
    a.rotation.z = lado * 0.5;
    const brillo = malla(new THREE.SphereGeometry(0.06, 12, 8), rosaClaro);
    brillo.scale.set(1.4, 0.7, 0.4);
    brillo.position.set(0.14 * lado, 0.04, 0.05);
    brillo.rotation.z = lado * 0.5;
    mono.add(a, brillo);
  };
  ala(1);
  ala(-1);
  mono.add(malla(new THREE.SphereGeometry(0.075, 16, 12), rosa));
  mono.position.set(0.1, 0.42, 0.45);
  mono.rotation.set(0.35, 0.45, -0.35);
  mono.scale.setScalar(0.72);
  cabeza.add(mono);

  // patas delgadas
  const patas = [];
  const pata = (x, z, trasera) => {
    const piv = new THREE.Group();
    piv.position.set(x, -0.06, z);
    let inferior = null;
    if (!trasera) {
      const s = malla(new THREE.CylinderGeometry(0.13, 0.09, 0.96, 18), pelo);
      s.position.y = -0.48;
      const paw = malla(new THREE.SphereGeometry(0.15, 18, 12), peloPata);
      paw.scale.set(1.35, 0.68, 1.1);
      paw.position.set(0.07, -0.96, 0);
      piv.add(s, paw);
    } else {
      const muslo = malla(new THREE.SphereGeometry(0.29, 24, 18), pelo);
      muslo.scale.set(0.9, 1.35, 0.85);
      muslo.position.set(0, -0.26, 0);
      inferior = new THREE.Group();
      inferior.position.set(-0.05, -0.54, 0);
      const s = malla(new THREE.CylinderGeometry(0.095, 0.07, 0.56, 16), pelo);
      s.position.y = -0.28;
      const paw = malla(new THREE.SphereGeometry(0.15, 18, 12), peloPata);
      paw.scale.set(1.35, 0.68, 1.1);
      paw.position.set(0.07, -0.56, 0);
      inferior.add(s, paw);
      inferior.rotation.z = -0.5;
      piv.add(muslo, inferior);
    }
    cuerpoG.add(piv);
    patas.push({ piv, inferior, trasera, lado: z > 0 ? 1 : -1 });
    return piv;
  };
  pata(0.72, 0.28, false);
  pata(0.72, -0.28, false);
  pata(-0.8, 0.3, true);
  pata(-0.8, -0.3, true);

  // cola larga y esponjosa
  const colaRaiz = new THREE.Group();
  colaRaiz.position.set(-1.28, 0.14, 0);
  cuerpoG.add(colaRaiz);
  const colaSegs = [];
  let padre = colaRaiz;
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    g.position.y = i === 0 ? 0 : 0.24;
    const r0 = 0.085 + Math.sin((i / 9) * Math.PI) * 0.03;
    const m = malla(new THREE.CylinderGeometry(r0 * 0.96, r0, 0.27, 14), pelo);
    m.position.y = 0.125;
    g.add(m);
    if (i === 9) {
      const punta = malla(new THREE.SphereGeometry(r0 * 0.96, 14, 10), pelo);
      punta.position.y = 0.26;
      g.add(punta);
    }
    padre.add(g);
    colaSegs.push(g);
    padre = g;
  }

  // sombra en el suelo
  const sombra = malla(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }));
  sombra.rotation.x = -Math.PI / 2;
  sombra.scale.set(2.3, 0.85, 1);
  sombra.position.set(-0.05, 0.01, 0);
  scene.add(sombra);

  // ---------- estado de la animación ----------
  let t = 0;
  let fase = 0;
  let parpadeoEn = 2 + Math.random() * 3;
  let parpadeo = 0;
  let orejaEn = 3 + Math.random() * 4;
  let orejaT = 0;
  let salto = null;
  let zarpazo = null;
  let estiron = null;
  const cur = { y: 1.1, pitch: 0, cabezaPitch: 0, cabezaYaw: 0, ojo: 1, pliegue: 0, agazape: 0, enroscada: 0, mov: 0 };

  function tick(dt, e) {
    dt = Math.min(dt, 0.05);
    t += dt;

    const dormida = !!e.dormida;
    const tgt = { y: 1.1, pitch: 0, cabezaPitch: 0.02, cabezaYaw: Math.sin(t * 0.6) * 0.1, ojo: 1, pliegue: 0, agazape: 0, enroscada: 0, mov: e.camina ? 1 : 0 };
    if (dormida) {
      tgt.y = 0.66; tgt.pitch = 0.02; tgt.cabezaPitch = -0.6; tgt.cabezaYaw = 0.2; tgt.ojo = 0.03; tgt.pliegue = 1; tgt.enroscada = 1;
    } else if (e.agazapada) {
      tgt.y = 0.92; tgt.pitch = -0.22; tgt.cabezaPitch = 0.14; tgt.agazape = 1; tgt.cabezaYaw = 0;
    }
    if (e.olfatea) { tgt.cabezaPitch = -0.7; tgt.pitch = -0.1; }
    if (e.ronronea) tgt.ojo = 0.14;
    if (e.feliz && !dormida) tgt.ojo = 0.12;
    const k = 1 - Math.exp(-dt * 7);
    for (const n in tgt) cur[n] = lerp(cur[n], tgt[n], k);

    parpadeoEn -= dt;
    if (parpadeoEn <= 0 && !dormida) { parpadeo = 0.16; parpadeoEn = 2.5 + Math.random() * 3.5; }
    if (parpadeo > 0) parpadeo -= dt;
    const abre = parpadeo > 0 ? 0.08 : 1;

    // orejita que se mueve de vez en cuando
    orejaEn -= dt;
    if (orejaEn <= 0) { orejaT = 0.35; orejaEn = 3 + Math.random() * 5; }
    if (orejaT > 0) orejaT -= dt;
    const tic = orejaT > 0 ? Math.sin((1 - orejaT / 0.35) * Math.PI * 3) * 0.28 : 0;
    orejas.forEach((o, i) => { o.rotation.x = o.userData.baseX + (i === 0 ? tic : 0); o.rotation.z = -0.05 + (i === 0 ? tic * 0.4 : 0); });

    if (e.camina) fase += dt * (e.velUnidades || 2) * 5.4;
    const paso = cur.mov;
    const amp = 0.52 * paso;

    let dy = 0;
    let esc = 1;
    if (salto) {
      salto.t += dt;
      const u = Math.min(1, salto.t / salto.dur);
      dy = Math.sin(u * Math.PI) * 0.8;
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

    const rebote = Math.abs(Math.sin(fase)) * 0.04 * paso;
    raiz.position.y = dy;
    raiz.position.x = e.ronronea ? Math.sin(t * 70) * 0.012 : 0;
    raiz.scale.set(1, esc, 1);
    cuerpoG.position.y = cur.y + rebote - bow * 0.08;
    cuerpoG.rotation.z = cur.pitch - bow * 0.3 + Math.sin(fase * 2) * 0.012 * paso + swat * 0.06;
    cuerpoG.rotation.y = cur.agazape * Math.sin(t * 16) * 0.05;
    torso.scale.y = 1 + Math.sin(t * (dormida ? 1.5 : 2.2)) * (dormida ? 0.03 : 0.012);

    cuello.rotation.z = cur.cabezaPitch + Math.sin(fase * 2 + 1) * 0.03 * paso;
    cuello.rotation.y = cur.cabezaYaw;
    cabeza.rotation.x = Math.sin(t * 0.5) * 0.04;
    ojos.forEach((o) => { o.scale.y = Math.max(0.03, Math.min(cur.ojo, abre)); });

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

    const curva = lerp(-0.16, 0.08, cur.enroscada);
    colaRaiz.rotation.z = lerp(1.25, 1.7, cur.enroscada) - bow * 0.3 - cur.agazape * 0.25;
    colaRaiz.rotation.y = cur.enroscada * 0.5;
    colaSegs.forEach((s, i) => {
      if (i === 0) return;
      const onda = Math.sin(t * (e.camina ? 3.2 : 1.6) + i * 0.55) * (0.07 + i * 0.008) * (e.ronronea ? 1.5 : 1);
      s.rotation.z = curva * (i < 6 ? 1 : 1.5) - (e.feliz ? 0.05 * i : 0) + onda;
      s.rotation.y = cur.enroscada * 0.34;
    });

    sombra.scale.set(2.3 - dy * 0.5, 0.85 - dy * 0.2, 1);
    sombra.material.opacity = 0.26 - dy * 0.12;
    renderer.render(scene, camera);
  }

  return {
    tick,
    salto() { salto = { t: 0, dur: 0.7 }; },
    zarpazo() { zarpazo = { t: 0, dur: 0.34 }; },
    estirar() { estiron = { t: 0, dur: 1.3 }; },
    liberar() { renderer.dispose(); },
    _camara(x, y, z, lx, ly, lz) { camera.position.set(x, y, z); camera.lookAt(lx, ly, lz); },
  };
}
