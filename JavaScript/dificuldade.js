let _ruidoAnimId = null;

export function criarTelaDificuldade(onSelecionada) {

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
    svg.innerHTML = `<defs><filter id="duto-distort">
        <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="5"/>
        <feDisplacementMap in="SourceGraphic" scale="2.5"/>
    </filter></defs>`;
    document.body.appendChild(svg);

    const estilo = document.createElement('style');
    estilo.textContent = `
        #telaDificuldade {
            display: none; position: fixed; top: 0; left: 0;
            width: 100%; height: 100%;
            background: radial-gradient(ellipse 70% 80% at 48% 52%,
                #030907 0%, #010403 35%, #000 60%);
            flex-direction: column; align-items: flex-start;
            justify-content: center; z-index: 20; overflow: hidden;
        }
        #noiseCanvas {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            opacity: 0.04; pointer-events: none; z-index: 0;
            image-rendering: pixelated;
        }
        .duto-vinheta {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            /* vinheta nas bordas */
            background:
                linear-gradient(to bottom, rgba(0,0,0,0.93) 0%, transparent 20%, transparent 75%, rgba(0,0,0,0.93) 100%),
                linear-gradient(to right,  rgba(0,0,0,0.88) 0%, transparent 16%, transparent 84%, rgba(0,0,0,0.88) 100%);
            pointer-events: none; z-index: 1;
        }
        .duto-scanlines {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: repeating-linear-gradient(
                0deg, transparent, transparent 3px,
                rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 4px);
            pointer-events: none; z-index: 2;
        }
        .duto-conteudo {
            position: relative; z-index: 3;
            padding-left: 12vw; padding-bottom: 4vh;
        }
        .duto-titulo {
            font-family: 'Courier New', Courier, monospace;
            font-size: clamp(0.85em, 1.8vw, 1.5em);
            color: #7a9a96; letter-spacing: 4px;
            margin-bottom: 52px; line-height: 1.6;
            filter: url(#duto-distort);
            animation: txtPisca 7s infinite;
        }
        .duto-opcao {
            font-family: 'Courier New', Courier, monospace;
            font-size: clamp(1.1em, 2.2vw, 1.85em);
            color: #4a6460; letter-spacing: 5px;
            margin: 14px 0; cursor: pointer;
            background: transparent; border: none;
            display: flex; align-items: center; text-align: left;
            animation: txtPisca 9s infinite;
            transition: color 0.35s ease, text-shadow 0.35s ease,
                        transform 0.25s ease, letter-spacing 0.25s ease;
        }
        .duto-opcao .seta {
            display: inline-block; width: 2.2ch;
            opacity: 0; color: #9abfba;
            transition: opacity 0.3s ease, transform 0.3s ease;
            transform: translateX(-6px);
        }
        .duto-opcao:hover {
            color: #c8dbd8;
            text-shadow: 0 0 6px rgba(180,220,215,0.45),
                         0 0 18px rgba(100,180,170,0.2);
            transform: translateX(6px);
            letter-spacing: 7px;
        }
        .duto-opcao:hover .seta {
            opacity: 1; transform: translateX(0);
        }
        @keyframes txtPisca {
            0%,93%,100% { opacity:1; }
            94% { opacity:0.04; } 95% { opacity:0.9; }
            96% { opacity:0.08; } 97% { opacity:1; }
            98% { opacity:0.06; } 99% { opacity:0.95; }
        }
        /* jornal */
        .duto-jornal {
            position: absolute; bottom: -4%; right: 8%;
            transform: perspective(420px) rotateX(50deg) rotate(-3deg);
            width: 34vw; min-width: 240px; max-width: 440px;
            background:
                radial-gradient(ellipse 35% 25% at 22% 65%, rgba(60,40,10,0.55) 0%, transparent 60%),
                radial-gradient(ellipse 25% 35% at 78% 28%, rgba(45,30,5,0.45) 0%, transparent 55%),
                radial-gradient(ellipse 45% 20% at 50% 90%, rgba(70,50,15,0.4) 0%, transparent 50%),
                linear-gradient(140deg, #c4ae90 0%, #aa9472 45%, #c2aa84 100%);
            padding: 14px 18px 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,1), inset 0 0 30px rgba(0,0,0,0.35);
            z-index: 2; position: absolute;
            opacity: 0.48;
            filter: grayscale(1) brightness(0.36) contrast(1.1) blur(0.2px);
            border: 1px solid #666;
        }
        .jornal-topo {
            font-family: 'Times New Roman', Times, serif;
            font-size: clamp(0.5em, 0.9vw, 0.7em);
            text-align: center; color: #555; letter-spacing: 2px;
            border-bottom: 1px solid #888; padding-bottom: 3px; margin-bottom: 6px;
        }
        .jornal-hw {
            font-family: 'Times New Roman', Times, serif;
            font-size: clamp(1.1em, 2.1vw, 1.7em);
            font-weight: 900; text-align: center;
            background: #111; color: #ddd;
            padding: 4px 6px; margin-bottom: 7px;
            letter-spacing: 4px; text-transform: uppercase;
        }
        .jornal-empresa {
            font-family: 'Times New Roman', Times, serif;
            font-size: clamp(0.7em, 1.3vw, 1.05em);
            font-weight: bold; font-style: italic;
            text-align: center; color: #111; margin-bottom: 8px;
        }
        .jornal-corpo {
            font-family: 'Courier New', Courier, monospace;
            font-size: clamp(0.4em, 0.7vw, 0.58em);
            color: #111; line-height: 1.6; text-align: justify;
        }
        .jornal-linha { border: none; border-top: 1px solid #777; margin: 6px 0; }
    `;
    document.head.appendChild(estilo);

    const telaDificuldade = document.createElement('div');
    telaDificuldade.id = 'telaDificuldade';
    telaDificuldade.innerHTML = `
        <canvas id="noiseCanvas"></canvas>
        <div class="duto-vinheta"></div>
        <div class="duto-scanlines"></div>
        <div class="duto-jornal">
            <div class="jornal-topo">THE LOCAL GAZETTE &nbsp;·&nbsp; June 13, 2007</div>
            <div class="jornal-hw">HELP WANTED</div>
            <div class="jornal-empresa">Freddy Fazbear's Pizza</div>
            <hr class="jornal-linha">
            <div class="jornal-corpo">
                Family pizzeria looking for security guard to work
                the nightshift. 12 am to 6 am.<br><br>
                Monitor cameras, ensure safety of equipment and
                animatronic characters.<br><br>
                <i>Not responsible for injury/dismemberment.</i><br><br>
                $120 a week. &nbsp;To apply call:<br>
                <b>1-888-FAZ-FAZBEAR</b>
            </div>
        </div>
        <div class="duto-conteudo">
            <div class="duto-titulo">Five Nights at Freddy's<br>—  seleciona a dificuldade  —</div>
            <button class="duto-opcao" id="btnFacil"><span class="seta">&gt;&gt;&nbsp;</span>FÁCIL</button>
            <button class="duto-opcao" id="btnNormal"><span class="seta">&gt;&gt;&nbsp;</span>NORMAL</button>
            <button class="duto-opcao" id="btnDificil"><span class="seta">&gt;&gt;&nbsp;</span>DIFÍCIL</button>
        </div>
    `;
    document.body.appendChild(telaDificuldade);

    document.getElementById('btnFacil').addEventListener('click',  () => selecionarDificuldade('facil',   onSelecionada));
    document.getElementById('btnNormal').addEventListener('click', () => selecionarDificuldade('normal',  onSelecionada));
    document.getElementById('btnDificil').addEventListener('click',() => selecionarDificuldade('dificil', onSelecionada));

    return { telaDificuldade, iniciarRuidoDuto };
}

function iniciarRuidoDuto() {
    const cv = document.getElementById('noiseCanvas');
    if (!cv) return;
    cv.width  = Math.floor(window.innerWidth  / 3);
    cv.height = Math.floor(window.innerHeight / 3);
    const ctx = cv.getContext('2d');
    function frame() {
        const img = ctx.createImageData(cv.width, cv.height);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = Math.random() * 255 | 0;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        _ruidoAnimId = requestAnimationFrame(frame);
    }
    frame();
}

function selecionarDificuldade(nivel, onSelecionada) {
    if (_ruidoAnimId) { cancelAnimationFrame(_ruidoAnimId); _ruidoAnimId = null; }
    // esconde imediatamente — loading screen do jogo trata do visual
    document.getElementById('telaDificuldade').style.display = 'none';
    if (onSelecionada) onSelecionada(nivel);
}
