import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const clock  = new THREE.Clock();
const keys   = {};

const MOVE_SPEED = 4.5;
const EYE_HEIGHT = 2.7;

let cenaJogo, camaraJogo;
let luzAmbiente = null;
let lanterna     = null;

let playerPos   = new THREE.Vector3(0, 0, 0);
let playerAngle = 0;
let targetAngle = 0;

// colisao
let mapaBBs = [];
const _pBox = new THREE.Box3();

// efeito acordar
let acordarProgresso = 0;
let acordando        = true;

let tokens          = [];
let tokensApanhados = 0;
let totalTokens     = 0;
let elapsedTime     = 0;

let canvasMapa = null, ctxMapa = null;
let luzesFlicker = [];

// intro camera (sair do duto para o escritorio)
let introCamera   = false;
let introProgress = 0;
const introStart  = new THREE.Vector3();
const introEnd    = new THREE.Vector3();

// mouse para a lanterna
let mouseOffX = 0, mouseOffY = 0; // offset suave do pescoco
let smoothX   = 0, smoothY   = 0;
let rawMX     = 0, rawMY     = 0; // coordenadas -1..1 para unproject
let luzAlvo   = null;

export function iniciarJogo(renderer) {
    window.addEventListener('mousemove', e => {
        // -1 a 1 normalizado, Y invertido (topo do ecra = olhar para cima)
        rawMX     =  (e.clientX / window.innerWidth)  * 2 - 1;
        rawMY     = -(e.clientY / window.innerHeight) * 2 + 1;
        mouseOffX = rawMX * 0.34;
        mouseOffY = rawMY * 0.26;
    });

    document.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (e.code === 'KeyA') targetAngle += Math.PI / 2;
        if (e.code === 'KeyD') targetAngle -= Math.PI / 2;
        // setas tambem funcionam
        if (e.code === 'ArrowLeft')  targetAngle += Math.PI / 2;
        if (e.code === 'ArrowRight') targetAngle -= Math.PI / 2;
        e.preventDefault();
    });
    document.addEventListener('keyup', e => { keys[e.code] = false; });

    cenaJogo = new THREE.Scene();
    cenaJogo.background = new THREE.Color(0x111111);

    camaraJogo = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 60);

    renderer.toneMapping         = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled   = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    luzAmbiente = new THREE.AmbientLight(0xffeedd, 0);
    cenaJogo.add(luzAmbiente);

    // lanterna presa à camara — segue o mouse
    lanterna = new THREE.SpotLight(0xfff5dd, 60);
    lanterna.angle    = 0.44;
    lanterna.penumbra = 0.75;
    lanterna.decay    = 1.8;
    lanterna.distance = 24;
    luzAlvo = new THREE.Object3D();
    camaraJogo.add(lanterna);
    cenaJogo.add(luzAlvo);
    lanterna.target = luzAlvo;
    cenaJogo.add(camaraJogo);

    // loading screen
    const loadDiv = criarLoadingScreen();

    loader.load('./Models/fnaf_1_hw_map.glb',
    gltf => {
        gltf.scene.traverse(o => {
            if (!o.isMesh) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => {
                m.emissive          = new THREE.Color(0x060404);
                m.emissiveIntensity = 0.30;
                m.needsUpdate       = true;
            });
            const bb   = new THREE.Box3().setFromObject(o);
            const bbSz = bb.getSize(new THREE.Vector3());
            if (bbSz.y > 1.2 && bbSz.x < 25 && bbSz.z < 25) {
                mapaBBs.push(bb);
            }
        });

        cenaJogo.add(gltf.scene);

        const box    = new THREE.Box3().setFromObject(gltf.scene);
        const size   = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // escritorio: X:0, Z:2 — virado para o computador (sul, angulo PI)
        playerPos.set(0.0, box.min.y, 2.0);
        playerAngle = Math.PI;
        targetAngle = Math.PI;

        mapaMin.copy(box.min);
        mapaMax.copy(box.max);

        // luzes do teto — mais estragadas, mais dramaticas
        const ceilY = box.max.y - 0.3;
        [
            [0,   2.0, false], [0,  -8.0, true ],  [5,  -10.0, true ],
            [-3, -12.0, true],  [2, -18.0, false],  [0,  -25.0, true ],
            [-5, -20.0, true],  [4,   -6.0, false], [0,  -15.0, true ],
            [6,  -18.0, false], [-4,  -8.0, true ],
        ].forEach(([lx, lz, estragada]) => {
            const luz = new THREE.PointLight(0xffeedd, 0, 16);
            luz.position.set(lx, ceilY, lz);
            cenaJogo.add(luz);
            luzesFlicker.push({ luz, fase: Math.random() * Math.PI * 2, estragada });
        });

        loadDiv.style.opacity = '0';
        setTimeout(() => {
            loadDiv.remove();
            const ov = document.getElementById('fnaf-overlay');
            if (ov) { ov.style.transition = 'none'; ov.style.opacity = '0'; }
            // sai do duto a avancar: comeca atras (norte/cacifos, Z+), olha para sul (desk), avanca
            introStart.set(playerPos.x, playerPos.y + EYE_HEIGHT * 0.6, playerPos.z + 0.8);
            introEnd.set(  playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);
            introCamera   = true;
            introProgress = 0;
            // flicker de luzes simultaneo
            acordando        = true;
            acordarProgresso = 0;
        }, 820);
    },
    xhr => {
        if (xhr.total) {
            const b = document.getElementById('ldBar');
            if (b) b.style.width = (xhr.loaded / xhr.total * 100).toFixed(0) + '%';
        }
    },
    err => console.error(err)
    );

    criarTokens();
    criarMinimapa();
    criarHUD();

    window.addEventListener('resize', () => {
        camaraJogo.aspect = window.innerWidth / window.innerHeight;
        camaraJogo.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function loop() {
        requestAnimationFrame(loop);
        const delta = Math.min(clock.getDelta(), 0.05);
        elapsedTime += delta;

        if (acordando) {
            acordarProgresso = Math.min(1, acordarProgresso + delta * 0.28);
            const t = acordarProgresso;
            luzAmbiente.intensity = 0.03;
            if (t < 0.82) {
                // produto de senos — quando negativo a lanterna apaga (flash escuro)
                const flick = Math.sin(t * 20) * Math.sin(t * 11.3 + 1.1);
                lanterna.intensity = flick > 0 ? 55 + flick * 5 : 0;
            } else {
                const fade = (t - 0.82) / 0.18;
                lanterna.intensity = fade * 60;
            }
            if (acordarProgresso >= 1) {
                lanterna.intensity    = 60;
                luzAmbiente.intensity = 0.03;
                acordando = false;
            }
        }
        // luzes de cena sempre a actualizar
        atualizarLuzesFlicker(elapsedTime);

        // animacao de entrada — curta e suave (1.5s)
        if (introCamera) {
            introProgress = Math.min(1, introProgress + delta / 1.5);
            const ease = 1 - Math.pow(1 - introProgress, 2);
            camaraJogo.position.lerpVectors(introStart, introEnd, ease);
            // olha para o desk/computador durante toda a animacao
            // olha para o computador (sul, -Z) durante a animacao
            camaraJogo.lookAt(playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z - 6);
            if (introProgress >= 1) introCamera = false;
        }

        atualizarMovimento(delta);
        atualizarCamera();
        atualizarTokens();
        atualizarMinimapa();

        renderer.render(cenaJogo, camaraJogo);
    }
    loop();
}

// limites do mapa carregados apos o load
let mapaMin = new THREE.Vector3(-999,-999,-999);
let mapaMax = new THREE.Vector3( 999, 999, 999);

function colide(pos) {
    // por agora: so impede sair dos limites do mapa
    const margem = 0.5;
    if (pos.x < mapaMin.x + margem || pos.x > mapaMax.x - margem) return true;
    if (pos.z < mapaMin.z + margem || pos.z > mapaMax.z - margem) return true;
    return false;
}

function tentarMover(dir, step) {
    const futuro = playerPos.clone().addScaledVector(dir, step);
    if (!colide(futuro)) { playerPos.copy(futuro); return; }
    // wall slide: tenta so X depois so Z
    const fX = new THREE.Vector3(futuro.x, playerPos.y, playerPos.z);
    if (!colide(fX)) { playerPos.copy(fX); return; }
    const fZ = new THREE.Vector3(playerPos.x, playerPos.y, futuro.z);
    if (!colide(fZ)) { playerPos.copy(fZ); return; }
}

function atualizarMovimento(delta) {
    if (introCamera) return;
    let da = targetAngle - playerAngle;
    while (da >  Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    playerAngle += da * Math.min(1, delta * 6);

    const dir = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle));
    if (keys['KeyW'] || keys['ArrowUp']) tentarMover(dir, MOVE_SPEED * delta);

    tokens = tokens.filter(t => {
        if (playerPos.distanceTo(t.userData.worldPos) < 0.7) {
            cenaJogo.remove(t);
            tokensApanhados++;
            return false;
        }
        return true;
    });
}

function atualizarCamera() {
    if (introCamera) return;
    camaraJogo.position.set(playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);

    smoothX += (mouseOffX - smoothX) * 0.10;
    smoothY += (mouseOffY - smoothY) * 0.10;

    const fwdX = Math.sin(playerAngle), fwdZ = Math.cos(playerAngle);
    const rgtX = -Math.cos(playerAngle), rgtZ = Math.sin(playerAngle);

    // camara: pescoco suave com pequeno offset
    const dx = fwdX + rgtX * smoothX, dy = smoothY, dz = fwdZ + rgtZ * smoothX;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    camaraJogo.lookAt(
        camaraJogo.position.x + (dx/len) * 10,
        camaraJogo.position.y + (dy/len) * 10,
        camaraJogo.position.z + (dz/len) * 10
    );

    // lanterna: unproject exacto do mouse — igual ao menu
    const vec = new THREE.Vector3(rawMX, rawMY, 0.5).unproject(camaraJogo);
    const dir = vec.sub(camaraJogo.position).normalize();
    if (luzAlvo) luzAlvo.position.copy(camaraJogo.position).addScaledVector(dir, 20);
}

function atualizarLuzesFlicker(tempo) {
    luzesFlicker.forEach(item => {
        if (item.estragada) {
            // luz estragada: pisca irregularmente
            const n = Math.sin(tempo * 11.3 + item.fase) * Math.sin(tempo * 17.7 + item.fase * 1.3);
            item.luz.intensity = n > 0.2 ? 1.6 + n * 0.4 : (n > -0.1 ? 0.2 : 0);
        } else {
            // luz estavel com raros glitches
            const base = 1.1 + Math.sin(tempo * 1.2 + item.fase) * 0.08;
            const glitch = Math.random() > 0.996 ? -0.8 : 0;
            item.luz.intensity = Math.max(0, base + glitch);
        }
    });
}

function criarTokens() {
    // posicoes baseadas na exploracao real do mapa
    // corredor principal: X~0..5, Z~-7..-14
    // corredor sul (escritorio): X~-2..2, Z~-15..-22
    const Y = 0.4;
    const posicoes = [
        // corredor central
        [ 1,Y, -8], [ 3,Y, -8], [ 1,Y,-10], [ 3,Y,-10],
        [ 1,Y,-12], [ 3,Y,-12], [ 1,Y,-14], [ 3,Y,-14],
        // corredor esq
        [-2,Y, -8], [-2,Y,-10], [-2,Y,-12],
        // corredor sul (escritorio)
        [ 0,Y,-16], [ 2,Y,-16], [-2,Y,-16],
        [ 0,Y,-18], [ 2,Y,-18], [-2,Y,-18],
        [ 0,Y,-20], [ 1,Y,-20],
        // sala principal (norte)
        [ 0,Y, -5], [ 3,Y, -5], [-2,Y, -5],
        [ 0,Y, -3], [ 4,Y, -6], [-3,Y, -6],
        [ 5,Y,-10], [ 5,Y,-12],
        [-4,Y,-10], [-4,Y,-12],
        [ 0,Y,-22],
    ];
    totalTokens = posicoes.length;
    posicoes.forEach(([x, y, z]) => {
        const t = criarPizzaToken();
        t.position.set(x, y, z);
        t.userData.worldPos = new THREE.Vector3(x, y, z);
        cenaJogo.add(t);
        tokens.push(t);
    });
}

function criarPizzaToken() {
    const g = new THREE.Group();
    const matBase   = new THREE.MeshStandardMaterial({ color: 0xd4882a, roughness: 0.85 });
    const matCrosta = new THREE.MeshStandardMaterial({ color: 0xb8621a, roughness: 0.9  });
    const matMolho  = new THREE.MeshStandardMaterial({ color: 0xc41a0f, roughness: 0.7  });
    const matQueijo = new THREE.MeshStandardMaterial({ color: 0xf2c840, roughness: 0.4,
        emissive: 0x663300, emissiveIntensity: 0.9 });
    const matPepper = new THREE.MeshStandardMaterial({ color: 0x7a1208, roughness: 0.75 });

    const base   = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.05, 20), matBase);
    const crosta = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 7, 20), matCrosta);
    const molho  = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 20), matMolho);
    const queijo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20), matQueijo);
    crosta.rotation.x = Math.PI / 2; crosta.position.y = 0.02;
    molho.position.y = 0.04; queijo.position.y = 0.07;
    g.add(base); g.add(crosta); g.add(molho); g.add(queijo);
    const pepGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 8);
    [[0.07, 0.03], [-0.06, 0.08], [0.02, -0.09]].forEach(([px, pz]) => {
        const pep = new THREE.Mesh(pepGeo, matPepper);
        pep.position.set(px, 0.09, pz); g.add(pep);
    });
    return g;
}

function atualizarTokens() {
    tokens.forEach((t, i) => {
        t.position.y = t.userData.worldPos.y + Math.sin(elapsedTime * 2.2 + i * 0.9) * 0.10;
        t.rotation.y += 0.015;
    });
}

function criarLoadingScreen() {
    const s = document.createElement('style');
    s.textContent = `
        @keyframes ldFlicker{
            0%,100%{opacity:1} 5%{opacity:.06} 6%{opacity:.88} 20%{opacity:1}
            46%{opacity:.04} 47%{opacity:.82} 70%{opacity:1}
            89%{opacity:.05} 90%{opacity:.8} 95%{opacity:1}
        }
        @keyframes ldPulse{
            0%,100%{text-shadow:0 0 10px #8b0000}
            50%{text-shadow:0 0 28px #cc0000,0 0 50px #660000}
        }
        @keyframes ldScan{0%{background-position:0 0}100%{background-position:0 120px}}
        @keyframes ldMsg{0%,12%{opacity:0}18%,82%{opacity:1}88%,100%{opacity:0}}
    `;
    document.head.appendChild(s);

    const div = document.createElement('div');
    Object.assign(div.style, {
        position: 'fixed', inset: '0', background: '#000',
        zIndex: '50', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '22px', transition: 'opacity 0.9s ease', overflow: 'hidden'
    });

    // scanlines
    const scan = document.createElement('div');
    Object.assign(scan.style, {
        position: 'absolute', inset: '0', pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.15) 3px,rgba(0,0,0,0.15) 4px)',
        animation: 'ldScan 3s linear infinite', opacity: '0.55'
    });
    div.appendChild(scan);

    // noise canvas
    const noise = document.createElement('canvas');
    noise.width = 320; noise.height = 240;
    Object.assign(noise.style, {
        position: 'absolute', inset: '0', width: '100%', height: '100%',
        opacity: '0.05', pointerEvents: 'none', imageRendering: 'pixelated'
    });
    div.appendChild(noise);
    const nCtx = noise.getContext('2d');
    (function animNoise() {
        if (!document.body.contains(div)) return;
        const img = nCtx.createImageData(320, 240);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.random() * 255 | 0;
            img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255;
        }
        nCtx.putImageData(img, 0, 0);
        requestAnimationFrame(animNoise);
    })();

    // "IT'S ME" — pisca em posicoes aleatorias como o Golden Freddy
    const itsMe = document.createElement('div');
    Object.assign(itsMe.style, {
        position: 'absolute', zIndex: '3', pointerEvents: 'none',
        fontFamily: "'Courier New',monospace",
        fontSize: 'clamp(2em,5vw,3.5em)',
        color: '#ffffff', letterSpacing: '14px', fontWeight: 'bold',
        opacity: '0', transform: 'translate(-50%,-50%)'
    });
    itsMe.textContent = "IT'S ME";
    div.appendChild(itsMe);

    function flashItsMe() {
        if (!document.body.contains(div)) return;
        itsMe.style.left  = (15 + Math.random() * 70) + '%';
        itsMe.style.top   = (20 + Math.random() * 60) + '%';
        itsMe.style.opacity = (0.55 + Math.random() * 0.35).toFixed(2);
        const dur = 60 + Math.random() * 100;
        setTimeout(() => {
            itsMe.style.opacity = '0';
            // segunda aparicao rapida noutro lugar
            if (Math.random() > 0.45) setTimeout(flashItsMe, 120 + Math.random() * 180);
        }, dur);
    }
    const itsMeTimer = setInterval(() => {
        if (!document.body.contains(div)) { clearInterval(itsMeTimer); return; }
        if (Math.random() > 0.55) flashItsMe();
    }, 800);

    // conteudo central
    const inner = document.createElement('div');
    Object.assign(inner.style, {
        position: 'relative', zIndex: '2',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '18px', textAlign: 'center'
    });

    const msgs = ['CHECKING DOORS...', 'SYSTEMS ONLINE', 'WATCH THE CAMERAS.', "DON'T LET THEM IN.", 'NIGHT SHIFT STARTING...'];
    let msgIdx = 0;
    const msgEl = document.createElement('div');
    Object.assign(msgEl.style, {
        fontFamily: "'Courier New',monospace",
        fontSize: 'clamp(0.9em,1.5vw,1.1em)',
        color: '#bb5555', letterSpacing: '5px',
        textShadow: '0 0 6px rgba(180,40,40,0.5)',
        animation: 'ldMsg 3.2s ease infinite', minHeight: '1.4em'
    });
    msgEl.textContent = msgs[0];
    setInterval(() => {
        if (!document.body.contains(div)) return;
        msgIdx = (msgIdx + 1) % msgs.length;
        msgEl.textContent = msgs[msgIdx];
        msgEl.style.animation = 'none';
        void msgEl.offsetWidth;
        msgEl.style.animation = 'ldMsg 3.2s ease infinite';
    }, 3200);

    inner.innerHTML = `
        <div style="font-family:'Courier New',monospace;font-size:clamp(0.9em,1.5vw,1.15em);
             color:#cc6060;letter-spacing:7px;margin-bottom:4px;
             text-shadow:0 0 8px rgba(180,40,40,0.6)">FREDDY FAZBEAR'S PIZZA</div>
        <div style="font-family:'Courier New',monospace;font-size:clamp(1.8em,3.5vw,2.8em);
             color:#ff4444;letter-spacing:12px;
             animation:ldFlicker 2.5s infinite,ldPulse 3s ease infinite">LOADING</div>
        <div style="width:280px;height:7px;background:#2a0505;border:1px solid #660a0a;overflow:hidden">
            <div id="ldBar" style="height:100%;width:0%;background:#cc1010;
                 box-shadow:0 0 12px #ff2222;transition:width 0.3s ease"></div>
        </div>`;
    inner.appendChild(msgEl);
    div.appendChild(inner);
    document.body.appendChild(div);
    return div;
}

function criarMinimapa() {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { position: 'fixed', bottom: '14px', left: '14px', zIndex: '30' });
    canvasMapa = document.createElement('canvas');
    canvasMapa.width = canvasMapa.height = 180;
    Object.assign(canvasMapa.style, {
        border: '1.5px solid #cc00cc', borderRadius: '4px',
        background: 'rgba(0,0,0,0.82)', display: 'block'
    });
    ctxMapa = canvasMapa.getContext('2d');
    wrap.appendChild(canvasMapa);
    document.body.appendChild(wrap);
}

function atualizarMinimapa() {
    if (!ctxMapa) return;
    const W = 180, H = 180, S = 4.0;
    ctxMapa.clearRect(0, 0, W, H);
    const cx = W/2 - playerPos.x * S, cy = H/2 + playerPos.z * S;
    tokens.forEach(t => {
        const wp = t.userData.worldPos;
        const tx = cx + wp.x*S, ty = cy - wp.z*S;
        if (tx<0||tx>W||ty<0||ty>H) return;
        ctxMapa.fillStyle = '#dd00dd';
        ctxMapa.beginPath(); ctxMapa.arc(tx,ty,3,0,Math.PI*2); ctxMapa.fill();
    });
    ctxMapa.save();
    ctxMapa.translate(W/2, H/2);
    ctxMapa.rotate(-playerAngle + Math.PI);
    ctxMapa.fillStyle = '#ffff00';
    ctxMapa.beginPath(); ctxMapa.moveTo(0,-9); ctxMapa.lineTo(6,7); ctxMapa.lineTo(-6,7);
    ctxMapa.closePath(); ctxMapa.fill();
    ctxMapa.restore();
    ctxMapa.fillStyle = '#ff88ff';
    ctxMapa.font = 'bold 11px monospace';
    ctxMapa.fillText(`${tokensApanhados} / ${totalTokens}`, 6, H-6);
}

function criarHUD() {
    const hud = document.createElement('div');
    Object.assign(hud.style, {
        position: 'fixed', bottom: '14px', right: '14px', zIndex: '30',
        color: '#886688', fontFamily: 'monospace', fontSize: '11px',
        textAlign: 'right', pointerEvents: 'none', lineHeight: '1.8'
    });
    hud.innerHTML = 'W / ↑ — andar<br>A / ← — virar esq<br>D / → — virar dir';
    document.body.appendChild(hud);

    // display de coordenadas para debug de spawn
    const coords = document.createElement('div');
    coords.id = 'debugCoords';
    Object.assign(coords.style, {
        position: 'fixed', top: '14px', right: '14px', zIndex: '30',
        color: '#ffaa00', fontFamily: 'monospace', fontSize: '12px',
        textAlign: 'right', pointerEvents: 'none', background: 'rgba(0,0,0,0.55)',
        padding: '4px 8px', borderRadius: '3px'
    });
    document.body.appendChild(coords);

    // atualiza coords a cada frame
    setInterval(() => {
        coords.textContent = `X:${playerPos.x.toFixed(1)}  Z:${playerPos.z.toFixed(1)}`;
    }, 100);
}
