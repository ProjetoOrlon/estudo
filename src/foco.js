/* Modo foco (Pomodoro): 25 min de foco, 5 de pausa, 15 de pausa longa a cada
   4 ciclos. Durante o foco a tela fica limpa (textos de introdução, números e
   rodapés somem) e cada minuto conta para a meta do dia. */
(function(){
  "use strict";
  var FOCO = 25 * 60, PAUSA = 5 * 60, LONGA = 15 * 60;
  var fase = null, fimEm = 0, restantePausado = 0, rodando = false, ciclos = 0, seg = 0, timer = null;

  var pill = document.createElement('div');
  pill.className = 'foco-pill';
  pill.hidden = true;
  pill.setAttribute('role', 'status');
  pill.innerHTML = '<span class="fp-fase"></span><b class="fp-tempo">25:00</b>' +
    '<button class="fp-bt" data-f="pausar" title="Pausar / continuar">⏸</button>' +
    '<button class="fp-bt" data-f="pular" title="Pular para a próxima fase">⏭</button>' +
    '<button class="fp-bt" data-f="parar" title="Encerrar o modo foco">✕</button>';
  document.body.appendChild(pill);

  function mmss(s){ s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + U.dois(s % 60); }
  function restante(){ return rodando ? Math.max(0, (fimEm - Date.now()) / 1000) : restantePausado; }

  function desenhar(){
    pill.hidden = !fase;
    document.body.classList.toggle('foco-ativo', fase === 'foco');
    if(!fase) return;
    pill.dataset.fase = fase;
    pill.querySelector('.fp-fase').textContent = fase === 'foco' ? '● Foco · ciclo ' + (ciclos + 1) : fase === 'espera' ? 'Pausa acabou' : '☕ Pausa';
    pill.querySelector('.fp-tempo').textContent = fase === 'espera' ? 'pronto?' : mmss(restante());
    var bp = pill.querySelector('[data-f="pausar"]');
    bp.textContent = fase === 'espera' ? '▶ Mais 25 min' : (rodando ? '⏸' : '▶');
    bp.classList.toggle('fp-largo', fase === 'espera');
    pill.querySelector('[data-f="pular"]').hidden = fase === 'espera';
    var bt = document.getElementById('m-foco'); if(bt) bt.setAttribute('aria-pressed', fase ? 'true' : 'false');
  }

  function comecarFase(f, duracao){
    fase = f; rodando = true; fimEm = Date.now() + duracao * 1000; seg = 0;
    clearInterval(timer); timer = setInterval(tique, 1000);
    desenhar();
  }
  function tique(){
    if(!rodando) return;
    if(fase === 'foco'){
      seg++;
      if(seg >= 60){ seg = 0; Foco.aoMinuto && Foco.aoMinuto(); }
    }
    if(restante() <= 0) terminarFase();
    else desenhar();
  }
  function terminarFase(){
    bip();
    if(fase === 'foco'){
      ciclos++;
      var longa = ciclos % 4 === 0;
      avisar(longa ? 'Ciclo completo! Pausa longa de 15 minutos.' : 'Foco concluído! Pausa de 5 minutos — levante, beba água.');
      comecarFase('pausa', longa ? LONGA : PAUSA);
    } else {
      avisar('A pausa acabou. Quando quiser, comece mais 25 minutos.');
      rodando = false; clearInterval(timer); fase = 'espera'; desenhar();
    }
  }
  function avisar(msg){
    U.aviso(msg, 6000);
    try{ if(document.hidden && window.Notification) new Notification('Plataforma de Estudo', { body:msg, silent:true }); }catch(e){}
  }
  function bip(){
    try{
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach(function(t){
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
      });
      setTimeout(function(){ ctx.close(); }, 1200);
    }catch(e){}
  }

  pill.addEventListener('click', function(ev){
    var b = ev.target.closest('[data-f]'); if(!b) return;
    var f = b.dataset.f;
    if(f === 'pausar'){
      if(fase === 'espera'){ comecarFase('foco', FOCO); return; }
      if(rodando){ restantePausado = restante(); rodando = false; }
      else { rodando = true; fimEm = Date.now() + restantePausado * 1000; }
      desenhar();
    } else if(f === 'pular'){ terminarFase(); }
    else if(f === 'parar'){ Foco.parar(); }
  });
  document.addEventListener('keydown', function(ev){
    if(ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'f'){ ev.preventDefault(); Foco.alternar(); }
  });

  window.Foco = {
    aoMinuto: null,
    iniciar: function(){
      if(fase === 'foco' || fase === 'pausa') return;
      try{ if(window.Notification && Notification.permission === 'default') Notification.requestPermission(); }catch(e){}
      comecarFase('foco', FOCO);
      U.aviso('Modo foco: 25 minutos. A tela fica mais limpa até a pausa.', 4000);
    },
    parar: function(){ fase = null; rodando = false; clearInterval(timer); desenhar(); },
    alternar: function(){ if(fase) Foco.parar(); else Foco.iniciar(); },
    ativo: function(){ return !!fase; },
    redesenhar: desenhar
  };
})();
