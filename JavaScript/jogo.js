import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const clock  = new THREE.Clock();
const keys   = {};

const MOVE_SPEED = 4.5;
const EYE_HEIGHT = 3.9;

let cenaJogo, camaraJogo;
let luzAmbiente = null;
let lanterna     = null;

let playerPos   = new THREE.Vector3(0, 0, 0);
let playerAngle = 0;
let targetAngle = 0;

// colisao — zonas caminhaveis carregadas do chaopaandar.glb
let mapaBBs = [];
const _pBox = new THREE.Box3();
let zonasCaminhaveis = [];

// efeito acordar
let acordarProgresso = 0;
let acordando        = true;

let tokens          = [];
let tokensApanhados = 0;
let totalTokens     = 0;
let elapsedTime     = 0;

let canvasMapa = null, ctxMapa = null;
let luzesFlicker = [];

// ─── INIMIGOS ──────────────────────────────────────────────────────
let inimigos = [];
// { nome, modelo, mixer, clipIdle, clipAndar, clipJumpscare,
//   acaoAtual, spawnPos, velocidade, ativo, emMovimento }

// posicoes de spawn (Y preenchido depois de saber o floor)
const SPAWN_FREDDY = new THREE.Vector3( 0.0, 0, -36);
const SPAWN_BONNIE = new THREE.Vector3(-4.0, 0, -36);
const SPAWN_CHICA  = new THREE.Vector3( 4.0, 0, -36);
const SPAWN_FOXY   = new THREE.Vector3(-9.0, 0, -26);

// ─── ESTADO DO JOGO ────────────────────────────────────────────────
const TOKENS_FOXY   = 10; // tokens para o Foxy sair da cove
let tempoJogo       = 0;
let jogoIniciado    = false;
const alertas       = { freddy: false, bonnie: false, chica: false, foxy: false };

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

    loader.load('./Models/mapa1.glb',
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

        // carrega spawn zones antes dos personagens
        carregarSpawnZones(box.min.y);

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

        // fade mais lento (1.2s) e só remove após a transição terminar
        loadDiv.style.transition = 'opacity 1.2s ease';
        loadDiv.style.opacity = '0';
        setTimeout(() => {
            loadDiv.remove();
            const ov = document.getElementById('fnaf-overlay');
            if (ov) { ov.style.transition = 'none'; ov.style.opacity = '0'; }
            introStart.set(playerPos.x, playerPos.y + EYE_HEIGHT * 0.6, playerPos.z + 0.8);
            introEnd.set(  playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);
            introCamera   = true;
            introProgress = 0;
            acordando        = true;
            acordarProgresso = 0;
        }, 1400);
    },
    xhr => {
        if (xhr.total) {
            const b = document.getElementById('ldBar');
            if (b) b.style.width = (xhr.loaded / xhr.total * 100).toFixed(0) + '%';
        }
    },
    err => console.error(err)
    );

    // carregar zonas caminhaveis — tokens criados após as zonas estarem prontas
    loader.load('./Models/chaopaandar.glb', gltf => {
        gltf.scene.traverse(o => {
            if (!o.isMesh) return;
            o.visible = false;
            const bb = new THREE.Box3().setFromObject(o);
            bb.expandByScalar(0.08); // cobre micro-gaps entre planes adjacentes
            zonasCaminhaveis.push(bb);
        });
        criarTokens();
    });
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
            acordarProgresso = Math.min(1, acordarProgresso + delta * 0.65);
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

        // mixers das animacoes dos personagens
        inimigos.forEach(ini => { if (ini.mixer) ini.mixer.update(delta); });

        // gestao do jogo — so depois do accordar e intro
        if (!acordando && !introCamera) {
            if (!jogoIniciado) {
                jogoIniciado = true;
                mostrarMensagemInicio();
            }
            tempoJogo += delta;
            // timers desativados enquanto ajustamos posicoes — mudar depois
            //if (tempoJogo > 30  && !alertas.freddy) ativarInimigo('freddy');
            //if (tempoJogo > 70  && !alertas.bonnie) ativarInimigo('bonnie');
            //if (tempoJogo > 110 && !alertas.chica)  ativarInimigo('chica');
            //if (tokensApanhados >= TOKENS_FOXY && !alertas.foxy) ativarInimigo('foxy');
        }

        atualizarMovimento(delta);
        atualizarCamera();
        atualizarTokens();
        atualizarInimigos(delta);
        atualizarMinimapa();

        renderer.render(cenaJogo, camaraJogo);
    }
    loop();
}

// limites do mapa carregados apos o load
let mapaMin = new THREE.Vector3(-999,-999,-999);
let mapaMax = new THREE.Vector3( 999, 999, 999);

function colide(pos) {
    if (zonasCaminhaveis.length === 0) {
        // fallback enquanto o GLB ainda nao carregou
        const m = 0.5;
        return pos.x < mapaMin.x + m || pos.x > mapaMax.x - m ||
               pos.z < mapaMin.z + m || pos.z > mapaMax.z - m;
    }
    // verifica so X e Z — colide se nao estiver dentro de nenhuma zona
    const M = 0.15; // margem do corpo do jogador
    return !zonasCaminhaveis.some(bb =>
        pos.x >= bb.min.x + M && pos.x <= bb.max.x - M &&
        pos.z >= bb.min.z + M && pos.z <= bb.max.z - M
    );
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
        const wp = t.userData.worldPos;
        if (Math.hypot(playerPos.x - wp.x, playerPos.z - wp.z) < 1.4) {
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
    // gera tokens automaticamente a partir das zonas caminhaveis
    // grelha centrada em cada zona, espaçamento minimo entre tokens
    const Y = 0.4;
    const SPACING  = 5.5;  // menos tokens por zona
    const MIN_DIST = 5.0;  // distancia minima entre tokens
    const posicoes = [];

    zonasCaminhaveis.forEach(bb => {
        const w  = bb.max.x - bb.min.x;
        const d  = bb.max.z - bb.min.z;
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        if (w < 1.0 || d < 1.0) return;

        const cols = Math.max(1, Math.round(w / SPACING));
        const rows = Math.max(1, Math.round(d / SPACING));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = cols === 1 ? cx : cx + (c - (cols-1)/2) * SPACING;
                const z = rows === 1 ? cz : cz + (r - (rows-1)/2) * SPACING;
                if (x < bb.min.x + 0.4 || x > bb.max.x - 0.4) continue;
                if (z < bb.min.z + 0.4 || z > bb.max.z - 0.4) continue;
                const perto = posicoes.some(p => Math.hypot(x-p[0], z-p[2]) < MIN_DIST);
                if (!perto) posicoes.push([x, Y, z]);
            }
        }
    });

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
    // wrapper: roda em torno do eixo Y (efeito moeda a girar)
    const wrapper = new THREE.Group();

    // inner: a pizza em si, de pé e ligeiramente na diagonal
    const g = new THREE.Group();
    g.rotation.x = Math.PI / 2; // de pé
    g.rotation.y = 0.45;        // diagonal

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

    wrapper.add(g);
    return wrapper;
}

function atualizarTokens() {
    tokens.forEach((t, i) => {
        // wrapper gira em Y — pizza de pé a girar como moeda
        t.rotation.y += 0.028;
        // leve flutuacao vertical
        t.position.y = t.userData.worldPos.y + Math.sin(elapsedTime * 2.0 + i * 1.1) * 0.08;
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
    const W = 180, H = 180, S = 4.5;
    ctxMapa.clearRect(0, 0, W, H);

    // mapa roda com o jogador — seta sempre aponta para cima (frente)
    ctxMapa.save();
    ctxMapa.translate(W/2, H/2);
    ctxMapa.rotate(playerAngle - Math.PI); // mapa roda oposto ao player

    // zonas caminhaveis centradas no jogador
    // ry usa min.z (borda mais a sul/frente) sem negaçao — zona à frente fica acima
    zonasCaminhaveis.forEach(bb => {
        const rx = (bb.min.x - playerPos.x) * S;
        const ry = (bb.min.z - playerPos.z) * S;
        const rw = (bb.max.x - bb.min.x) * S;
        const rh = (bb.max.z - bb.min.z) * S;
        ctxMapa.fillStyle = 'rgba(50,50,80,0.92)';
        ctxMapa.fillRect(rx, ry, rw, rh);
        ctxMapa.strokeStyle = 'rgba(120,80,160,0.55)';
        ctxMapa.lineWidth = 0.8;
        ctxMapa.strokeRect(rx, ry, rw, rh);
    });

    // tokens por coletar
    tokens.forEach(t => {
        const wp = t.userData.worldPos;
        const tx = (wp.x - playerPos.x) * S;
        const ty = (wp.z - playerPos.z) * S;
        ctxMapa.fillStyle = '#dd00dd';
        ctxMapa.beginPath(); ctxMapa.arc(tx, ty, 3, 0, Math.PI*2); ctxMapa.fill();
    });

    // inimigos — ponto vermelho + letra inicial
    inimigos.forEach(ini => {
        const ip = ini.modelo.position;
        const ex = (ip.x - playerPos.x) * S;
        const ey = (ip.z - playerPos.z) * S;
        ctxMapa.fillStyle = '#ff2222';
        ctxMapa.beginPath(); ctxMapa.arc(ex, ey, 5, 0, Math.PI*2); ctxMapa.fill();
        ctxMapa.fillStyle = '#ffffff';
        ctxMapa.font = 'bold 7px monospace';
        ctxMapa.textAlign = 'center';
        ctxMapa.fillText(ini.nome[0].toUpperCase(), ex, ey + 2.5);
    });

    ctxMapa.restore();

    // seta do jogador — sempre no centro a apontar para cima
    ctxMapa.fillStyle = '#ffff00';
    ctxMapa.beginPath();
    ctxMapa.moveTo(W/2, H/2-9);
    ctxMapa.lineTo(W/2+6, H/2+7);
    ctxMapa.lineTo(W/2-6, H/2+7);
    ctxMapa.closePath(); ctxMapa.fill();

    // contador
    ctxMapa.fillStyle = '#ff88ff';
    ctxMapa.font = 'bold 11px monospace';
    ctxMapa.fillText(`${tokensApanhados} / ${totalTokens}`, 6, H-6);
}

function jogoOver(nomeInimigo) {
    // evitar multiplos triggers
    inimigos.forEach(i => { i.ativo = false; });
    jogoIniciado = false;

    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', inset: '0', zIndex: '60',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0)',
        fontFamily: "'Courier New', monospace",
        color: '#ff2222', textAlign: 'center',
        transition: 'background 0.4s ease', pointerEvents: 'none'
    });
    el.innerHTML = `
        <div style="font-size:clamp(2em,5vw,3.5em);letter-spacing:10px;
             text-shadow:0 0 30px #ff0000">GAME OVER</div>
        <div style="font-size:clamp(0.8em,1.4vw,1em);letter-spacing:4px;
             color:#888;margin-top:18px">apanhado pelo ${nomeInimigo.toUpperCase()}</div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.background = 'rgba(0,0,0,0.88)'; });
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

// ─── SPAWN ZONES ──────────────────────────────────────────────────
let spawnPalco = null; // bb do plano do palco (Freddy/Bonnie/Chica)
let spawnCova  = null; // bb do circulo do Foxy

function carregarSpawnZones(floorY) {
    loader.load('./Models/spawnAnimatronics.glb', gltf => {
        const zonas = [];
        gltf.scene.traverse(o => {
            if (!o.isMesh) return;
            o.visible = false;
            const bb = new THREE.Box3().setFromObject(o);
            const sz = bb.getSize(new THREE.Vector3());
            zonas.push({ bb, centro: bb.getCenter(new THREE.Vector3()), area: sz.x * sz.z });
        });
        zonas.sort((a, b) => b.area - a.area); // maior = palco
        if (zonas.length >= 1) spawnPalco = zonas[0];
        if (zonas.length >= 2) spawnCova  = zonas[1];
        carregarPersonagens(floorY);
    }, undefined, () => {
        console.warn('spawnAnimatronics.glb nao encontrado, usando posicoes padrao');
        carregarPersonagens(floorY);
    });
}

// corrige TODAS as matrizes de bind apos escalar um modelo com SkinnedMesh:
// bindMatrix, bindMatrixInverse E boneInverses têm de estar alinhadas
function corrigirEscalaSkinnedMesh(model) {
    model.updateMatrixWorld(true);
    model.traverse(o => {
        if (!o.isSkinnedMesh) return;
        // atualiza bindMatrix para a posicao world atual (com escala)
        o.bindMatrix.copy(o.matrixWorld);
        o.bindMatrixInverse.copy(o.matrixWorld).invert();
        // atualiza boneInverses com as posicoes escaladas
        o.skeleton.boneInverses.forEach((inv, i) => {
            inv.copy(o.skeleton.bones[i].matrixWorld).invert();
        });
        o.skeleton.update();
    });
}

// calcula minY apenas de meshes VISIVEIS (ignora party-hat kids escondidos)
function calcMinY(model) {
    let minY = Infinity;
    model.updateMatrixWorld(true);
    model.traverse(o => {
        if ((!o.isMesh && !o.isSkinnedMesh) || !o.visible) return;
        const geo = o.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const wy = geo.boundingBox.min.clone().applyMatrix4(o.matrixWorld).y;
        if (wy < minY) minY = wy;
    });
    return isFinite(minY) ? minY : 0;
}

function carregarPersonagens(floorY) {
    SPAWN_FREDDY.set(-9.0, floorY + 3.5, -28);
    SPAWN_BONNIE.set(-7.0, floorY + 1.2, -25);
    SPAWN_CHICA.set(  4.0, floorY, -34); // inativo por agora
    SPAWN_FOXY.set(  -9.0, floorY, -26); // inativo por agora

    const ESC = { freddy: 2.6, bonnie: 2.65, chica: 0.018, foxy: 0.003 };

    function loadChar(path, spawn, rotY, velocidade, escala, nome, clipNome) {
        loader.load(path, gltf => {
            const modelo = gltf.scene;
            modelo.scale.setScalar(escala);
            cenaJogo.add(modelo);

            // posiciona no spawn
            modelo.position.set(spawn.x, spawn.y, spawn.z);
            console.log(`[${nome}] posicao final:`, modelo.position.x.toFixed(1), modelo.position.y.toFixed(1), modelo.position.z.toFixed(1), '| bb height:', new THREE.Box3().setFromObject(modelo).getSize(new THREE.Vector3()).y.toFixed(2));
            modelo.rotation.y = rotY;

            // emissive em TODOS os meshes (nao so SkinnedMesh) para visibilidade
            modelo.traverse(o => {
                if (!o.isMesh && !o.isSkinnedMesh) return;
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => {
                    if (m.emissive) { m.emissive.set(0x0d0808); m.emissiveIntensity = 0.35; }
                    m.needsUpdate = true;
                });
            });

            // remove scale tracks — evitam deformacoes de proporcoes
            gltf.animations.forEach(clip => {
                clip.tracks = clip.tracks.filter(t => !t.name.endsWith('.scale'));
            });

            console.log(`[${nome}] clips disponiveis:`, gltf.animations.map(c => c.name));

            // AnimationMixer — usa o clip indicado por nome (ou fallback para idle/walk)
            const mixer = new THREE.AnimationMixer(modelo);
            let clipIdle = null, clipAndar = null, clipJumpscare = null;

            // tenta encontrar o clip especifico pedido
            let clipEspecifico = clipNome
                ? gltf.animations.find(c => c.name.toLowerCase().includes(clipNome.toLowerCase()))
                : null;

            gltf.animations.forEach(c => {
                const n = c.name.toLowerCase();
                if (n.includes('walk') || n.includes('run'))                                 clipAndar     = c;
                else if (n.includes('jump') || n.includes('scare') || n.includes('attack'))  clipJumpscare = c;
                else clipIdle = clipIdle || c;
            });
            if (!clipIdle && gltf.animations.length > 0) clipIdle = gltf.animations[0];

            // usa clip especifico se existir, senao fallback
            const clipParaTocar = clipEspecifico || clipIdle;
            console.log(`[${nome}] clip escolhido: ${clipParaTocar?.name ?? 'NENHUM'}`);
            let acaoAtual = null;
            if (clipParaTocar) {
                acaoAtual = mixer.clipAction(clipParaTocar);
                acaoAtual.play();
                mixer.update(0.1); // avanca mais para sair da bind pose
            }

            inimigos.push({
                nome, modelo, mixer,
                clipIdle, clipAndar, clipJumpscare, acaoAtual,
                spawnPos: spawn.clone(), velocidade,
                ativo: false, congelado: false,
                posicionado: false  // snap para chaopaandar na 1ª frame
            });
        }, undefined, err => console.error('Erro ao carregar', nome, err));
    }

    loadChar('./Models/Personagens/rotten_freddy.glb', SPAWN_FREDDY,  0,    1.8, ESC.freddy, 'freddy', 'RottenFreddy-Idle');
    loadChar('./Models/Personagens/bonnie.glb',        SPAWN_BONNIE,  0.25, 2.0, ESC.bonnie, 'bonnie', 'walk');
    loadChar('./Models/Personagens/chica.glb',         SPAWN_CHICA,   0,    1.9, ESC.chica,  'chica',  'Trans_DiningArea_A');
    loadChar('./Models/Personagens/foxy.glb',          SPAWN_FOXY,    Math.PI/2, 3.0, ESC.foxy, 'foxy', 'Run');
}

// ─── AI DOS INIMIGOS ───────────────────────────────────────────────

function jogadorOlhaParaInimigo(ini) {
    const dirParaIni = new THREE.Vector3()
        .subVectors(ini.modelo.position, camaraJogo.position)
        .normalize();
    const camDir = new THREE.Vector3();
    camaraJogo.getWorldDirection(camDir);
    return camDir.dot(dirParaIni) > 0.55; // ~56° de campo de visao
}

function trocarClip(ini, clip) {
    if (!clip || ini.acaoAtual?.getClip() === clip) return;
    if (ini.acaoAtual) ini.acaoAtual.fadeOut(0.25);
    ini.acaoAtual = ini.mixer.clipAction(clip);
    ini.acaoAtual.reset().fadeIn(0.25).play();
}

function moverInimigo(ini, delta) {
    const dir = new THREE.Vector3()
        .subVectors(playerPos, ini.modelo.position)
        .setY(0);
    const dist = dir.length();
    if (dist < 1.2) return; // ja chegou ao jogador
    dir.normalize();

    const passo = ini.velocidade * delta;
    const nova  = ini.modelo.position.clone().addScaledVector(dir, passo);

    // so anda no chaopaandar (colisao igual ao jogador)
    const M = 0.3;
    const valido = zonasCaminhaveis.some(bb =>
        nova.x >= bb.min.x + M && nova.x <= bb.max.x - M &&
        nova.z >= bb.min.z + M && nova.z <= bb.max.z - M
    );
    if (valido) {
        ini.modelo.position.copy(nova);
        ini.modelo.rotation.y = Math.atan2(dir.x, dir.z);
        trocarClip(ini, ini.clipAndar || ini.clipIdle);
    }
}

function snapParaChaopaandar(ini) {
    // encontra o centro da zona walkable mais proxima do spawn pretendido
    let melhor = null, melhorDist = Infinity;
    zonasCaminhaveis.forEach(bb => {
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        const d = Math.hypot(ini.spawnPos.x - cx, ini.spawnPos.z - cz);
        if (d < melhorDist) { melhorDist = d; melhor = { cx, cz }; }
    });
    if (melhor) {
        ini.modelo.position.x = melhor.cx;
        ini.modelo.position.z = melhor.cz;
    }
    ini.posicionado = true;
}

function atualizarInimigos(delta) {
    if (!jogoIniciado) return;
    const camDir = new THREE.Vector3();
    camaraJogo.getWorldDirection(camDir);

    inimigos.forEach(ini => {
        // snap para zona walkable na 1a frame (chaopaandar ja carregado)
        if (!ini.posicionado && zonasCaminhaveis.length > 0) snapParaChaopaandar(ini);
        if (!ini.ativo) return;

        const olha = jogadorOlhaParaInimigo(ini);

        if (ini.nome === 'freddy') {
            // Freddy ignora o olhar — move sempre
            moverInimigo(ini, delta);
        } else {
            // Weeping Angel: congela quando o jogador olha
            if (olha) {
                ini.congelado = true;
                trocarClip(ini, ini.clipIdle);
            } else {
                ini.congelado = false;
                moverInimigo(ini, delta);
            }
        }

        // verificar captura
        const d2 = Math.hypot(
            ini.modelo.position.x - playerPos.x,
            ini.modelo.position.z - playerPos.z
        );
        if (d2 < 1.5) jogoOver(ini.nome);
    });
}

// ─── MENSAGENS / ALERTAS ───────────────────────────────────────────

function mostrarMensagemInicio() {
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', inset: '0', zIndex: '40',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)',
        fontFamily: "'Courier New', monospace",
        color: '#dddddd', textAlign: 'center',
        pointerEvents: 'none', opacity: '0',
        transition: 'opacity 1s ease'
    });
    el.innerHTML = `
        <div style="font-size:clamp(1.4em,2.8vw,2em);letter-spacing:6px;color:#ffcc00;margin-bottom:16px">
            FREDDY FAZBEAR'S PIZZA
        </div>
        <div style="font-size:clamp(0.85em,1.6vw,1.1em);letter-spacing:3px;line-height:2.2;color:#cccccc">
            APANHA TODOS OS TOKENS<br>
            <span style="color:#ff6666">mas tem muito cuidado com eles...</span>
        </div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
        el.style.transition = 'opacity 1.5s ease';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 1600);
    }, 4500);
}

const ALERTAS_CONFIG = {
    freddy: {
        titulo:   '⚠ FALHA DE SISTEMA',
        msg:      'FREDDY FAZBEAR entrou em\nmodo de entretenimento autónomo.\n\nTenha uma boa noite.',
        cor:      '#ff4444'
    },
    bonnie: {
        titulo:   '📡 SINAL PERDIDO',
        msg:      'Ligação ao BONNIE interrompida.\nÚltima localização conhecida: Palco.\nOs técnicos foram notificados.\n\n(Ninguém foi notificado.)',
        cor:      '#9955ff'
    },
    chica: {
        titulo:   '🍕 ALERTA DE COZINHA',
        msg:      'CHICA abandonou o posto sem autorização.\nMotivo reportado: em busca de pizza.\n\nFique calmo. Não faça barulho.',
        cor:      '#ffaa00'
    },
    foxy: {
        titulo:   '☠ PIRATE COVE',
        msg:      'AVARIA RESOLVIDA — Pirate Cove\nvolta a estar operacional.\n\nFOXY ESTÁ A CAMINHO.',
        cor:      '#ff3300'
    }
};

function mostrarAlerta(nome) {
    const cfg = ALERTAS_CONFIG[nome];
    if (!cfg) return;

    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: '45', minWidth: '320px', maxWidth: '480px',
        background: 'rgba(0,0,0,0.92)',
        border: `1.5px solid ${cfg.cor}`,
        boxShadow: `0 0 22px ${cfg.cor}44`,
        fontFamily: "'Courier New', monospace",
        color: cfg.cor, textAlign: 'center',
        padding: '24px 32px', borderRadius: '4px',
        opacity: '0', transition: 'opacity 0.5s ease',
        pointerEvents: 'none'
    });
    el.innerHTML = `
        <div style="font-size:1em;letter-spacing:5px;margin-bottom:14px;font-weight:bold">${cfg.titulo}</div>
        <div style="font-size:0.72em;letter-spacing:2px;line-height:1.9;color:#cccccc;white-space:pre-line">${cfg.msg}</div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 600);
    }, 4000);
}

function ativarInimigo(nome) {
    alertas[nome] = true;
    mostrarAlerta(nome);
    const ini = inimigos.find(i => i.nome === nome);
    if (!ini) return;
    ini.ativo = true;
    // troca para clip de andar se existir
    if (ini.clipAndar && ini.acaoAtual) {
        ini.acaoAtual.stop();
        ini.acaoAtual = ini.mixer.clipAction(ini.clipAndar);
        ini.acaoAtual.play();
    }
}
