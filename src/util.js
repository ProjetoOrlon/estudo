/* Utilidades compartilhadas pela interface. */
(function(){
  "use strict";
  var U = {};

  U.esc = function(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
  U.dois = function(n){ return (n < 10 ? '0' : '') + n; };

  /* Paleta do mapa mental — cor forte (ramo) e clara (folha). */
  U.PAL = [
    { b:'#8FD0E8', l:'#C8E8F4' },  /* azul    */
    { b:'#B3B1E3', l:'#DCDBF3' },  /* lilás   */
    { b:'#8AD0AE', l:'#C7E9D8' },  /* verde   */
    { b:'#FBD24E', l:'#FDEAA8' },  /* amarelo */
    { b:'#F5A9C4', l:'#FBD6E2' },  /* rosa    */
    { b:'#F7B267', l:'#FCDBB6' },  /* laranja */
    { b:'#F08A7E', l:'#F8C7C1' },  /* salmão  */
    { b:'#9FD8C8', l:'#D2ECE5' }   /* água    */
  ];

  /* Datas locais no formato AAAA-MM-DD (comparáveis como texto). */
  U.hoje = function(){ return U.dataISO(new Date()); };
  U.dataISO = function(d){
    return d.getFullYear() + '-' + U.dois(d.getMonth()+1) + '-' + U.dois(d.getDate());
  };
  U.maisDias = function(n){ var d = new Date(); d.setDate(d.getDate() + n); return U.dataISO(d); };

  /* Hash estável de texto → inteiro não negativo. */
  U.hash = function(s){
    var h = 2166136261;
    for(var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  var timerAviso = null;
  U.aviso = function(msg, ms){
    var el = document.getElementById('aviso');
    el.textContent = msg; el.hidden = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function(){ el.hidden = true; }, ms || 2600);
  };

  /* Modal simples. conteudo é HTML; aoMontar recebe o elemento e uma função fechar. */
  U.modal = function(conteudo, aoMontar){
    var raiz = document.getElementById('modal-raiz');
    var fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + conteudo + '</div>';
    raiz.appendChild(fundo);
    function fechar(){ document.removeEventListener('keydown', tecla); fundo.remove(); }
    function tecla(ev){ if(ev.key === 'Escape') fechar(); }
    document.addEventListener('keydown', tecla);
    fundo.addEventListener('mousedown', function(ev){ if(ev.target === fundo) fechar(); });
    var caixa = fundo.querySelector('.modal');
    if(aoMontar) aoMontar(caixa, fechar);
    var foco = caixa.querySelector('input, select, textarea, .btn');
    if(foco) foco.focus();
    return fechar;
  };

  U.confirmar = function(titulo, texto, rotulo, perigo){
    return new Promise(function(resolve){
      U.modal('<h2>' + U.esc(titulo) + '</h2><p>' + U.esc(texto) + '</p>' +
        '<div class="modal-acts"><button class="ghost" data-r="0">Cancelar</button>' +
        '<button class="btn' + (perigo ? ' perigo' : '') + '" data-r="1">' + U.esc(rotulo) + '</button></div>',
        function(el, fechar){
          el.addEventListener('click', function(ev){
            var b = ev.target.closest('[data-r]'); if(!b) return;
            fechar(); resolve(b.dataset.r === '1');
          });
        });
    });
  };

  /* Tema claro/escuro lembrado entre sessões. */
  U.aplicarTema = function(){
    try{ var t = localStorage.getItem('tema'); if(t) document.documentElement.setAttribute('data-theme', t); }catch(e){}
  };
  U.alternarTema = function(){
    var cur = document.documentElement.getAttribute('data-theme');
    var escuro = cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var prox = escuro ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', prox);
    try{ localStorage.setItem('tema', prox); }catch(e){}
  };

  U.moeda = function(v){ return 'US$ ' + (v || 0).toFixed(2).replace('.', ','); };

  window.U = U;
})();
