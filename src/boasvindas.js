/* Boas-vindas (primeira vez que a pessoa abre o programa): 3 passos curtos
   com a mascote — quem é você, como funciona, qual IA vai criar as matérias.
   Pensado para quem nunca viu o app (família, futuros clientes).
   BoasVindas.abrir({ aoCriarMateria }) */
(function(){
  'use strict';
  var esc = U.esc, api = window.api;

  var ESTUDA = window.Perfis ? Perfis.ESTUDA : ['Faculdade', 'Ensino médio (escola)', 'ENEM / vestibular', 'Concurso', 'Curso técnico', 'Idiomas', 'Outro'];

  function abrir(opts){
    opts = opts || {};
    api.config().then(function(cfg){
      var u0 = cfg.usuario || {};
      var dados = { nome:u0.nome || '', estuda:u0.estuda || '', curso:u0.curso || '', focoCurto:u0.focoCurto !== false };
      var passo = 1;
      U.modal('<div class="bv" id="bv"></div>', function(el, fechar){
        var caixa = el.querySelector('#bv');
        el.classList.add('bv-modal');
        function concluir(depois){
          api.salvarConfig({ usuario:dados, boasVindas:true }).catch(function(){}).then(function(){
            if(window.Tutor && Tutor.lerPerfil) Tutor.lerPerfil();
            fechar();
            if(depois) depois();
          });
        }
        function desenhar(){
          var pontos = '<div class="bv-pontos">' + [1,2,3].map(function(n){ return '<i class="'+(n === passo ? 'on' : n < passo ? 'feito' : '')+'"></i>'; }).join('') + '</div>';
          if(passo === 1){
            caixa.innerHTML = pontos +
              '<div class="bv-topo">' + Mascote.ilustracao(150) + '<div><h2>Oi! Eu sou a '+Mascote.nome+'.</h2><p>Vou te mostrar a <b>Plataforma de Estudo</b> em 1 minuto. Aqui você transforma suas apostilas e slides em <b>mapas mentais, simulados e flashcards</b>, e estuda um passo de cada vez.</p></div></div>' +
              '<label class="campo"><span>Como você quer ser chamado(a)?</span><input type="text" id="bv-nome" maxlength="40" placeholder="Seu nome" value="'+esc(dados.nome)+'"></label>' +
              '<div class="campo"><span>O que você estuda?</span><div class="bv-chips">' + ESTUDA.map(function(e){ return '<button type="button" class="chip" data-estuda="'+esc(e)+'" aria-pressed="'+(dados.estuda === e)+'">'+esc(e)+'</button>'; }).join('') + '</div></div>' +
              /* curso/série e o jeito de estudar: a IA e a tutora se ajustam a isso (lib/publico.js) */
              '<label class="campo"><span>Qual curso ou série? <small>(opcional)</small></span><input type="text" id="bv-curso" maxlength="60" placeholder="Ex.: Nutrição · 2º ano do ensino médio" value="'+esc(dados.curso)+'"></label>' +
              '<label class="chk-linha"><input type="checkbox" id="bv-foco"'+(dados.focoCurto ? ' checked' : '')+'> Prefiro textos bem curtos, uma coisa de cada vez</label>' +
              '<div class="modal-acts"><button class="ghost" data-bv="pular">Pular</button><button class="btn" data-bv="seguir">Continuar →</button></div>';
            setTimeout(function(){ var n = caixa.querySelector('#bv-nome'); if(n) n.focus(); }, 30);
          } else if(passo === 2){
            var nome = dados.nome ? ', ' + esc(dados.nome) : '';
            caixa.innerHTML = pontos + '<h2>Como funciona' + nome + '</h2><p class="bv-sub">Quatro passos. Você não precisa decorar: a aba <b>☀ Hoje</b> sempre mostra o próximo.</p>' +
              '<div class="bv-cards">' +
                card('📚', '1. Crie uma matéria', 'Envie os PDFs ou slides das aulas. Cada arquivo vira uma aula.') +
                card('🧠', '2. A IA monta tudo', 'Mapa mental por aula, simulado em 3 níveis, flashcards, discursivas e atividades.') +
                card('☀', '3. Estude pela aba Hoje', 'Um passo de cada vez. O que você erra volta para revisão nos dias certos.') +
                card(Mascote.avatar(30), '4. Peça ajuda', 'A '+Mascote.nome+' explica, dá dicas e faz perguntas. No PDF, marque, esconda palavras e escreva.') +
              '</div>' +
              '<div class="modal-acts"><button class="ghost" data-bv="voltar">← Voltar</button><button class="btn" data-bv="seguir">Continuar →</button></div>';
          } else {
            caixa.innerHTML = pontos + '<h2>Quem vai criar suas matérias?</h2><p class="bv-sub">Uma IA lê seus arquivos e monta o material. Estou procurando uma…</p><div id="bv-ia" class="cfg-status">Procurando…</div>' +
              /* código de ativação: quem indicou o programa manda um código e a IA fica pronta */
              '<div class="bv-codigo" id="bv-codigo" hidden><b>🎟 Recebeu um código de ativação?</b><p>Cole aqui o código que te mandaram. É só isso: a IA fica pronta sozinha.</p>' +
                '<div class="linha-codigo"><input type="text" id="bv-cod" placeholder="Cole o código aqui (começa com PE1-)"><button class="btn" data-bv="ativar" type="button">Ativar</button></div><small id="bv-codmsg"></small></div>' +
              '<div class="modal-acts"><button class="ghost" data-bv="voltar">← Voltar</button><button class="ghost" data-bv="explorar">Explorar o app</button><button class="btn" data-bv="criar">Criar minha primeira matéria</button></div>';
            api.statusGeracao().then(function(s){
              var alvo = caixa.querySelector('#bv-ia'); if(!alvo) return;
              alvo.innerHTML = s.disponivel
                ? '✅ Encontrei: <b>' + esc(s.nome) + '</b> · ' + esc(s.modelo) + (s.gratis ? ' — grátis.' : '.') + ' Está tudo pronto! <button class="link-bt" data-bv="tenhocodigo" type="button">Tenho um código de ativação</button>'
                : '⚠ Ainda não há uma IA ligada. <b>Se alguém te indicou o programa, peça a essa pessoa um código de ativação</b> e cole logo abaixo.<br><small>Avançado: dá para instalar uma IA grátis no computador. <button class="link-bt" data-bv="guia" type="button">Como instalar</button></small>';
              caixa.querySelector('#bv-codigo').hidden = s.disponivel;
            }).catch(function(){});
          }
        }
        function card(ic, t, d){ return '<div class="bv-card"><span class="bv-ic">'+ic+'</span><b>'+esc(t)+'</b><p>'+esc(d)+'</p></div>'; }
        caixa.addEventListener('click', function(ev){
          var ch = ev.target.closest('[data-estuda]');
          if(ch){ dados.estuda = ch.dataset.estuda; Array.prototype.forEach.call(caixa.querySelectorAll('[data-estuda]'), function(b){ b.setAttribute('aria-pressed', b === ch ? 'true' : 'false'); }); return; }
          var b = ev.target.closest('[data-bv]'); if(!b) return;
          var n = caixa.querySelector('#bv-nome'); if(n) dados.nome = n.value.trim();
          var cu = caixa.querySelector('#bv-curso'); if(cu) dados.curso = cu.value.trim();
          var fo = caixa.querySelector('#bv-foco'); if(fo) dados.focoCurto = fo.checked;
          var a = b.dataset.bv;
          if(a === 'seguir'){ passo++; desenhar(); }
          else if(a === 'voltar'){ passo--; desenhar(); }
          else if(a === 'pular' || a === 'explorar') concluir(opts.aoTerminar);
          else if(a === 'criar') concluir(opts.aoCriarMateria);
          else if(a === 'guia' && window.Tutor) Tutor.ajuda();
          else if(a === 'tenhocodigo'){ caixa.querySelector('#bv-codigo').hidden = false; caixa.querySelector('#bv-cod').focus(); }
          else if(a === 'ativar'){
            var cm = caixa.querySelector('#bv-codmsg');
            b.disabled = true; cm.textContent = 'Ativando…';
            api.ias.usarCodigo(caixa.querySelector('#bv-cod').value).then(function(r){
              caixa.querySelector('#bv-codigo').hidden = true;
              caixa.querySelector('#bv-ia').innerHTML = '✅ Ativado: <b>' + esc(r.nome) + '</b>. Está tudo pronto: clique em <b>Criar minha primeira matéria</b>!';
              if(window.Tutor) Tutor.status(true);
            }).catch(function(e){ b.disabled = false; cm.textContent = '⚠ ' + e.message; });
          }
        });
        caixa.addEventListener('keydown', function(ev){ if(ev.key === 'Enter' && ev.target.id === 'bv-nome'){ ev.preventDefault(); dados.nome = ev.target.value.trim(); passo = 2; desenhar(); } });
        desenhar();
      });
    });
  }

  window.BoasVindas = { abrir:abrir };
})();
