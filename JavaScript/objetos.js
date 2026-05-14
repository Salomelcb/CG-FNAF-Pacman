import * as THREE from 'three';

// camera de seguranca
function criarCameraSeguranca(cena, posicao, baseRotY) {
    const grupo = new THREE.Group();

    const matMetal = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.8 });
    const matLente = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2, metalness: 0.9 });
    const matVidro = new THREE.MeshStandardMaterial({ color: 0x001122, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.8 });
    const matLed   = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0 });

    // suporte ao teto
    const suporte = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), matMetal);
    suporte.position.y = 0.25;
    grupo.add(suporte);

    // corpo principal
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), matMetal);
    corpo.position.y = -0.05;
    grupo.add(corpo);

    // tubo da lente
    const lente = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 12), matLente);
    lente.rotation.x = Math.PI / 2;
    lente.position.set(0.2, -0.05, 0);
    grupo.add(lente);

    // vidro frontal da lente
    const vidro = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), matVidro);
    vidro.position.set(0.35, -0.05, 0);
    grupo.add(vidro);

    // led de estado (pisca no loop)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), matLed);
    led.position.set(-0.2, -0.05, 0.18);
    grupo.add(led);

    const luzLed = new THREE.PointLight(0xff0000, 0.3, 2);
    luzLed.position.copy(led.position);
    grupo.add(luzLed);

    grupo.position.copy(posicao);
    grupo.rotation.y = baseRotY;
    cena.add(grupo);

    return { grupo, luzLed, baseRotY };
}

// ventoinha
function criarVentoinha(cena) {
    const grupo = new THREE.Group();

    const matMetal = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.7 });
    const matAro   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.5 });
    const matBase  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.4 });

    // base de mesa
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 16), matBase);
    base.position.y = -0.82;
    grupo.add(base);

    // haste vertical
    const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), matMetal);
    haste.position.y = -0.49;
    grupo.add(haste);

    // aro exterior (fica fixo)
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 8, 32), matAro);
    grupo.add(aro);

    const pas = new THREE.Group();

    const eixo = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 12), matMetal);
    eixo.rotation.x = Math.PI / 2;
    pas.add(eixo);

    const paGeo = new THREE.BoxGeometry(0.6, 0.12, 0.04);
    for (let i = 0; i < 4; i++) {
        const angulo = (Math.PI / 2) * i;
        const pa = new THREE.Mesh(paGeo, matMetal);
        pa.rotation.z = angulo;
        pa.position.set(Math.cos(angulo) * 0.3, Math.sin(angulo) * 0.3, 0);
        pas.add(pa);
    }

    grupo.add(pas);

    grupo.position.set(-1, 6.5, 10);
    grupo.rotation.y = Math.PI / 2;
    cena.add(grupo);

    return { grupo, pas };
}

// painel de controlo
function criarPainel(cena) {
    const grupo = new THREE.Group();

    const matCaixa = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.8, metalness: 0.4 });
    const matEcra  = new THREE.MeshStandardMaterial({ color: 0x001a00, roughness: 0.3, emissive: 0x002200, emissiveIntensity: 0.5 });
    const matBotao = new THREE.MeshStandardMaterial({ color: 0x440000, roughness: 0.5, emissive: 0x220000, emissiveIntensity: 0.8 });

    // caixa principal
    const caixa = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.1), matCaixa);
    grupo.add(caixa);

    // ecrã emissivo
    const ecra = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.02), matEcra);
    ecra.position.set(0, 0.1, 0.06);
    grupo.add(ecra);

    // botões circulares em baixo
    const botaoGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10);
    [-0.35, -0.1, 0.15, 0.4].forEach(x => {
        const botao = new THREE.Mesh(botaoGeo, matBotao);
        botao.rotation.x = Math.PI / 2;
        botao.position.set(x, -0.33, 0.06);
        grupo.add(botao);
    });

    const luzEcra = new THREE.PointLight(0x00ff44, 0.4, 3);
    luzEcra.position.set(0, 0.1, 0.5);
    grupo.add(luzEcra);

    grupo.scale.setScalar(1.3);
    grupo.position.set(10, 8, 7);
    grupo.rotation.y = -Math.PI / 2;
    cena.add(grupo);

    return { grupo, luzEcra };
}

// cupcake da Chica
function criarCupcakeObj(cena) {
    const grupo = new THREE.Group();

    const texLoader = new THREE.TextureLoader();

    // textura do embrulho: pregas cilíndricas com highlight forte no centro
    // cor base laranja-castanho quente, vincos escuros, highlight creme no pico
    const cvW = document.createElement('canvas');
    cvW.width = 512; cvW.height = 512;
    const ctxW = cvW.getContext('2d');
    // base: terracotta/vermelho-tijolo (cor fiel à referência)
    ctxW.fillStyle = '#8B2E08'; ctxW.fillRect(0, 0, 512, 512);
    const nR = 14, rW = 512 / nR;
    for (let i = 0; i < nR; i++) {
        const g = ctxW.createLinearGradient(i * rW, 0, (i + 1) * rW, 0);
        g.addColorStop(0.00, 'rgba(0,0,0,0.82)');
        g.addColorStop(0.12, 'rgba(15,3,0,0.60)');
        g.addColorStop(0.32, 'rgba(180,70,20,0.45)');
        g.addColorStop(0.50, 'rgba(245,145,80,0.88)');   // highlight quente no centro
        g.addColorStop(0.68, 'rgba(170,62,15,0.45)');
        g.addColorStop(0.88, 'rgba(15,3,0,0.60)');
        g.addColorStop(1.00, 'rgba(0,0,0,0.82)');
        ctxW.fillStyle = g; ctxW.fillRect(i * rW, 0, rW, 512);
    }
    // vinheta vertical: escurece topo e fundo do embrulho
    const gv = ctxW.createLinearGradient(0, 0, 0, 512);
    gv.addColorStop(0,    'rgba(0,0,0,0.45)');
    gv.addColorStop(0.18, 'rgba(0,0,0,0.05)');
    gv.addColorStop(0.82, 'rgba(0,0,0,0.05)');
    gv.addColorStop(1,    'rgba(0,0,0,0.55)');
    ctxW.fillStyle = gv; ctxW.fillRect(0, 0, 512, 512);
    const texCorpo = new THREE.CanvasTexture(cvW);
    texCorpo.wrapS = THREE.RepeatWrapping;

    const texVela = texLoader.load('../Textures/topovela.png');
    texVela.wrapS = THREE.RepeatWrapping;
    texVela.wrapT = THREE.RepeatWrapping;

    // corpocupcake.png = embrulho (wrapper) — volta ao sítio certo
    const matWrapper = new THREE.MeshStandardMaterial({ map: texCorpo, roughness: 0.85 });

    const matFrost = new THREE.MeshStandardMaterial({
        color: 0xd0185a, roughness: 0.55, metalness: 0.02,
    });
    const matFrostDome = matFrost;

    const matSclera     = new THREE.MeshStandardMaterial({ color: 0xf4f0e4, roughness: 0.25 });
    const matLimbal     = new THREE.MeshStandardMaterial({ color: 0x080400, roughness: 0.7 });
    const matIrisOuter  = new THREE.MeshStandardMaterial({ color: 0x9a6a08, roughness: 0.30 });
    const matIrisInner  = new THREE.MeshStandardMaterial({ color: 0xe0aa10, roughness: 0.18, emissive: 0x4a3000, emissiveIntensity: 0.40 });
    const matPupil      = new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 0.5 });
    const matHL         = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 });
    const matVela     = new THREE.MeshStandardMaterial({ map: texVela, roughness: 0.75 });
    const matWick     = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 1.0 });
    const matWax      = new THREE.MeshStandardMaterial({ color: 0xf0e8c8, roughness: 0.9 });
    const matFlameOut = new THREE.MeshStandardMaterial({ color: 0xff7700, emissive: 0xff5500, emissiveIntensity: 3, transparent: true, opacity: 0.9 });
    const matFlameIn  = new THREE.MeshStandardMaterial({ color: 0xffee44, emissive: 0xffcc00, emissiveIntensity: 3, transparent: true, opacity: 0.85 });

    // involucro
    const wrapper = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.78, 0.90, 32), matWrapper);
    wrapper.position.y = 0.45;
    grupo.add(wrapper);

    // cúpula rosa — thetaLength reduzido para o dome terminar onde o tubo começa
    // dome bottom: y = 0.90 + 1.1*cos(0.53π) ≈ 0.80, onde o tubo cobre completamente
    const frostDome = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.53),
        matFrostDome
    );
    frostDome.position.y = 0.90;
    grupo.add(frostDome);

    // ondas do creme — tubo mais dentro do dome (r=1.01), projeção suave de ~0.04
    const glaceCurve = new (class extends THREE.Curve {
        getPoint(t, out = new THREE.Vector3()) {
            const a = t * Math.PI * 2;
            return out.set(
                Math.cos(a) * 1.01,
                0.82 + 0.08 * Math.sin(5 * a),
                Math.sin(a) * 1.01
            );
        }
    })();
    grupo.add(new THREE.Mesh(
        new THREE.TubeGeometry(glaceCurve, 128, 0.13, 10, true),
        matFrost
    ));

    function criarOlho(xOff) {
        const g = new THREE.Group();

        // esclerotica
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.40, 64, 64), matSclera));

        // limbal
        const limbal = new THREE.Mesh(new THREE.SphereGeometry(0.296, 64, 64), matLimbal);
        limbal.position.z = 0.14;
        g.add(limbal);

        // iris exterior
        const irisOut = new THREE.Mesh(new THREE.SphereGeometry(0.268, 64, 64), matIrisOuter);
        irisOut.position.z = 0.17;
        g.add(irisOut);

        // iris interior
        const irisIn = new THREE.Mesh(new THREE.SphereGeometry(0.220, 64, 64), matIrisInner);
        irisIn.position.z = 0.22;
        g.add(irisIn);

        // pupila
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.125, 64, 64), matPupil);
        pupil.position.z = 0.33;
        g.add(pupil);

        // brilho
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.042, 24, 24), matHL);
        hl.position.set(-0.07, 0.09, 0.38);
        g.add(hl);

        const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 16), matHL);
        hl2.position.set(0.05, -0.05, 0.39);
        g.add(hl2);

        g.scale.set(1, 0.90, 1);
        g.position.set(xOff, 1.43, 0.55);
        return g;
    }
    grupo.add(criarOlho(-0.46));
    grupo.add(criarOlho( 0.46));

    // vela
    const vela = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.92, 16), matVela);
    vela.position.set(0, 2.16, 0);
    grupo.add(vela);

    const velaTopo = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.13, 0.05, 16), matWax);
    velaTopo.position.set(0, 2.66, 0);
    grupo.add(velaTopo);

    const pavio = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), matWick);
    pavio.position.set(0, 2.78, 0);
    grupo.add(pavio);

    const chamaExt = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 12), matFlameOut);
    chamaExt.position.set(0, 2.90, 0);
    grupo.add(chamaExt);

    const chamaInt = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 12), matFlameIn);
    chamaInt.position.set(0, 3.00, 0);
    grupo.add(chamaInt);

    const flameLight = new THREE.PointLight(0xff8800, 1.5, 3);
    flameLight.position.set(0, 3.3, 0);
    grupo.add(flameLight);

    grupo.scale.setScalar(0.65);
    grupo.position.set(-5, 10.5, 15);
    cena.add(grupo);

    return { grupo, chamaExt, chamaInt, flameLight };
}

// pizza
function criarPizzaObj(cena) {
    const grupo = new THREE.Group();

    const matMassa   = new THREE.MeshStandardMaterial({ color: 0xd4882a, roughness: 0.85 });
    const matCrosta  = new THREE.MeshStandardMaterial({ color: 0xb8621a, roughness: 0.9 });
    const matMolho   = new THREE.MeshStandardMaterial({ color: 0xc41a0f, roughness: 0.7 });
    const matQueijo  = new THREE.MeshStandardMaterial({ color: 0xf2c840, roughness: 0.55, emissive: 0x221500, emissiveIntensity: 0.2 });
    const matPepper  = new THREE.MeshStandardMaterial({ color: 0x7a1208, roughness: 0.75 });
    const matPimento = new THREE.MeshStandardMaterial({ color: 0x2a7a18, roughness: 0.8 });

    const massa = new THREE.Mesh(new THREE.CylinderGeometry(1.82, 1.82, 0.2, 48), matMassa);
    massa.position.y = 0.1;
    grupo.add(massa);

    const crosta = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.17, 14, 64), matCrosta);
    crosta.rotation.x = Math.PI / 2;
    crosta.position.y = 0.2;
    grupo.add(crosta);

    const molho = new THREE.Mesh(new THREE.CylinderGeometry(1.56, 1.56, 0.05, 48), matMolho);
    molho.position.y = 0.225;
    grupo.add(molho);

    const queijo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 48), matQueijo);
    queijo.position.y = 0.27;
    grupo.add(queijo);

    const pepGeo = new THREE.CylinderGeometry(0.175, 0.175, 0.04, 20);
    [
        [ 0.0,   0.0 ], [ 0.72,  0.22], [-0.68,  0.30],
        [ 0.18,  0.78], [-0.28, -0.68],
        [ 0.78, -0.48], [-0.78, -0.22], [ 0.45, -0.72]
    ].forEach(([x, z]) => {
        const pep = new THREE.Mesh(pepGeo, matPepper);
        pep.position.set(x, 0.3, z);
        grupo.add(pep);
    });

    const pimentoGeo = new THREE.BoxGeometry(0.1, 0.04, 0.42);
    [[0.35, 0.15], [-0.45, -0.28], [0.6, -0.38]].forEach(([x, z], i) => {
        const strip = new THREE.Mesh(pimentoGeo, matPimento);
        strip.position.set(x, 0.3, z);
        strip.rotation.y = i * 1.3;
        grupo.add(strip);
    });

    grupo.scale.setScalar(0.22);
    grupo.position.set(2, 7.1, 8.5);
    cena.add(grupo);

    return { grupo };
}

export function criarObjetosComplexos(cena) {
    // camera 1
    const camSeg1 = criarCameraSeguranca(cena,
        new THREE.Vector3(-7, 12.5, 2),
        Math.PI
    );

    // camera 2
    const camSeg2 = criarCameraSeguranca(cena,
        new THREE.Vector3(4, 12.5, 10),
        Math.PI * 0.75
    );

    const ventoinha = criarVentoinha(cena);
    const painel    = criarPainel(cena);
    const cupcake   = criarCupcakeObj(cena);

    return { camSeg: [camSeg1, camSeg2], ventoinha, painel, cupcake };
}
