import * as THREE from 'three';

function gerarTexturaHorror(lines, corBase, corGlow, corInner, W, H, fs) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const glowHex  = '#' + corGlow.toString(16).padStart(6, '0');
    const innerHex = '#' + corInner.toString(16).padStart(6, '0');
    const lineH = H / lines.length;

    lines.forEach((txt, li) => {
        const cy = lineH * li + lineH / 2;
        const font = `700 ${fs}px Impact, Arial Black, sans-serif`;

        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.globalAlpha = 0.5;
        ctx.shadowBlur = 80;
        ctx.shadowColor = glowHex;
        ctx.fillStyle = glowHex;
        ctx.fillText(txt, W / 2, cy);

        ctx.globalAlpha = 0.7;
        ctx.shadowBlur = 40;
        ctx.fillText(txt, W / 2, cy);

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        ctx.fillStyle = innerHex;
        ctx.shadowBlur = 15;
        ctx.shadowColor = glowHex;
        ctx.fillText(txt, W / 2, cy);
        ctx.shadowBlur = 0;

        ctx.strokeStyle = glowHex;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 20;
        ctx.shadowColor = glowHex;
        ctx.strokeText(txt, W / 2, cy);
        ctx.shadowBlur = 0;
    });

    return cv;
}

function criarSprite(cena, canvas, posicao, scaleX, scaleY, clicavel, corLuz, intensidadeLuz) {
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, sizeAttenuation: true });
    const sprite = new THREE.Sprite(material);

    sprite.position.set(posicao.x, posicao.y, posicao.z);
    sprite.scale.set(scaleX, scaleY, 1);
    cena.add(sprite);

    if (corLuz) {
        const luz = new THREE.PointLight(corLuz, intensidadeLuz, 6);
        luz.position.set(posicao.x, posicao.y, posicao.z);
        cena.add(luz);
        sprite.userData.luz = luz;
        sprite.userData.intensidadeBase = intensidadeLuz;
    }

    sprite.userData.clicavel = clicavel;
    return sprite;
}

export function criarMenuNeon(cena) {
    const spritesPacman = [];
    const botoesClicaveis = [];

    // titulo
    const cvPacman = gerarTexturaHorror(['PACMAN'], 0, 0x7700cc, 0xaa44ff, 700, 150, 118);
    const spPacman = criarSprite(cena, cvPacman, { x: 4, y: 16, z: 7.5 }, 8, 1.6, false, 0x4400aa, 0.5);
    spritesPacman.push(spPacman);

    const cvSub = gerarTexturaHorror(["Five Nights at Freddy's"], 0, 0x5500aa, 0x8833dd, 700, 75, 46);
    const spSub = criarSprite(cena, cvSub, { x: 1.5, y: 14, z: 6.7 }, 10, 1.2, false, null, 0);
    spritesPacman.push(spSub);

    // botoes
    const cvStart = gerarTexturaHorror(['COMECAR', 'JOGO'], 0, 0xcc0000, 0xff4400, 512, 220, 84);
    const btnStart = criarSprite(cena, cvStart, { x: 2, y: 9, z: -0.7 }, 5.5, 2.0, true, 0x880000, 1.5);
    botoesClicaveis.push(btnStart);

    const cvOpcoes = gerarTexturaHorror(['OPCOES'], 0, 0xaa6600, 0xffcc00, 700, 150, 88);
    const btnOptions = criarSprite(cena, cvOpcoes, { x: 2, y: 10.5, z: 12 }, 5.5, 1.3, true, 0xaa6600, 0.8);
    botoesClicaveis.push(btnOptions);

    const cvSair = gerarTexturaHorror(['SAIR'], 0, 0x00cc00, 0x66ff44, 700, 150, 96);
    const btnExit = criarSprite(cena, cvSair, { x: 2, y: 8.5, z: 12 }, 5.5, 1.3, true, 0x00aa00, 0.8);
    botoesClicaveis.push(btnExit);

    return { btnStart, btnOptions, btnExit, botoesClicaveis, spritesPacman };
}
