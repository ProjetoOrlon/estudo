/* “Quem vai estudar?”: várias pessoas no mesmo computador (lib/perfis.js).
   Com mais de um perfil, a escolha aparece ao abrir o programa; o botão com
   o nome no topo da tela inicial abre a mesma tela para trocar ou criar.
   Perfis.iniciar(depois)   ao abrir: escolhe (se precisar) e segue
   Perfis.abrir()           tela de escolha
   Perfis.ESTUDA            opções de “o que você estuda” (também nas boas-vindas) */
(function(){
  'use strict';
  var esc = U.esc, api = window.api;
  var ESTUDA = ['Faculdade', 'Ensino médio (escola)', 'ENEM / vestibular', 'Concurso', 'Curso técnico', 'Idiomas', 'Outro'];
  var EMOJIS = ['🦊', '🐼', '🦉', '🐢', '🦋', '🐙', '🐝', '🐳', '🌻', '⭐', '🚀', '🎧'];
  var CORES = ['#8FD0E8','#B7A3E6','#8AD0AE','#FBD24E','#F5A9C4','#F7B267','#F08A7E','#9FD8C8'];
  var gerenciando = false;

  function rotuloEstudo(p){ return [p.estuda, p.curso].filter(Boolean).join(' · ') || (p.principal ? 'perfil principal' : ''); }

  function abrir(obrigatorio){
    api.perfis.listar().then(function(r){
      var velho = document.getElementById('perfis-tela'); if(velho) velho.remove();
      var tela = document.createElement('div');
      tela.id = 'perfis-tela'; tela.className = 'perfis-tela';
      tela.innerHTML = '<div class="pf-caixa"><h1>Quem vai estudar?</h1><p>Cada pessoa tem as próprias matérias, o próprio progresso e a ' + esc(Mascote.nome) + ' falando do jeito certo para ela.</p>' +
        '<div class="pf-grade">' + r.perfis.map(function(p){
          return '<div class="pf-item"><button class="pf-bt' + (p.id === r.atual ? ' atual' : '') + '" data-perfil="' + esc(p.id) + '" type="button">' +
            '<span class="pf-av" style="background:' + esc(p.cor) + '">' + esc(p.emoji) + '</span><b>' + esc(p.nome) + '</b><small>' + esc(rotuloEstudo(p)) + '</small></button>' +
            (gerenciando && !p.principal && p.id !== r.atual ? '<button class="pf-x" data-excluir="' + esc(p.id) + '" type="button" title="Excluir perfil">🗑</button>' : '') + '</div>';
        }).join('') +
        '<div class="pf-item"><button class="pf-bt pf-novo" id="pf-novo" type="button"><span class="pf-av">＋</span><b>Novo perfil</b><small>para outra pessoa</small></button></div></div>' +
        '<div class="pf-rodape">' + (r.perfis.length > 1 ? '<button class="ghost" id="pf-gerenciar" type="button">' + (gerenciando ? 'Pronto' : 'Gerenciar perfis') + '</button>' : '') +
          (obrigatorio ? '' : '<button class="ghost" id="pf-fechar" type="button">Voltar</button>') + '</div></div>';
      document.body.appendChild(tela);
      tela.addEventListener('click', function(ev){
        var b = ev.target.closest('[data-perfil]');
        if(b){
          if(b.dataset.perfil === r.atual && !obrigatorio){ tela.remove(); return; }
          b.disabled = true;
          api.perfis.usar(b.dataset.perfil).catch(function(e){ b.disabled = false; U.aviso(e.message, 5000); });   /* a janela recarrega no novo perfil */
          return;
        }
        var x = ev.target.closest('[data-excluir]');
        if(x){
          var alvo = r.perfis.find(function(p){ return p.id === x.dataset.excluir; });
          U.confirmar('Excluir o perfil de ' + alvo.nome + '?', 'As matérias e o progresso desse perfil vão para a Lixeira do Windows (dá para recuperar de lá).', 'Excluir', true).then(function(ok){
            if(ok) api.perfis.excluir(alvo.id).then(function(){ abrir(obrigatorio); }).catch(function(e){ U.aviso(e.message, 5000); });
          });
          return;
        }
        if(ev.target.closest('#pf-novo')) criar();   /* closest: o clique costuma cair no texto ou no + de dentro do botão */
        else if(ev.target.closest('#pf-gerenciar')){ gerenciando = !gerenciando; abrir(obrigatorio); }
        else if(ev.target.closest('#pf-fechar')) tela.remove();
      });
    }).catch(function(e){ U.aviso('Não consegui abrir os perfis: ' + e.message, 5000); });
  }

  function criar(){
    var dados = { emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)], cor: CORES[Math.floor(Math.random() * CORES.length)], estuda: '' };
    U.modal('<h2>Novo perfil</h2><p>Para outra pessoa estudar neste computador, com as matérias e o progresso dela.</p>' +
      '<label class="campo"><span>Nome</span><input type="text" id="np-nome" maxlength="40" placeholder="Ex.: Lorena"></label>' +
      '<div class="campo"><span>Escolha um símbolo</span><div class="pf-emojis">' + EMOJIS.map(function(e){ return '<button type="button" class="chip" data-emoji="' + e + '" aria-pressed="' + (e === dados.emoji) + '">' + e + '</button>'; }).join('') + '</div></div>' +
      '<div class="campo"><span>O que vai estudar?</span><div class="bv-chips">' + ESTUDA.map(function(e){ return '<button type="button" class="chip" data-estuda="' + esc(e) + '">' + esc(e) + '</button>'; }).join('') + '</div></div>' +
      '<label class="campo"><span>Qual curso ou série? <small>(opcional)</small></span><input type="text" id="np-curso" maxlength="60" placeholder="Ex.: Nutrição · 2º ano do ensino médio"></label>' +
      '<label class="chk-linha"><input type="checkbox" id="np-foco" checked> Prefere textos bem curtos, uma coisa de cada vez</label>' +
      '<label class="chk-linha"><input type="checkbox" id="np-ia" checked> Usar a mesma IA já configurada neste computador</label>' +
      '<div class="msg-erro" id="np-erro"></div>' +
      '<div class="modal-acts"><button class="ghost" id="np-cancelar" type="button">Cancelar</button><button class="btn" id="np-criar" type="button">Criar e entrar</button></div>',
      function(el, fechar){
        var q = function(s){ return el.querySelector(s); };
        el.addEventListener('click', function(ev){
          var e = ev.target.closest('[data-emoji]');
          if(e){ dados.emoji = e.dataset.emoji; Array.prototype.forEach.call(el.querySelectorAll('[data-emoji]'), function(b){ b.setAttribute('aria-pressed', b === e ? 'true' : 'false'); }); return; }
          var s = ev.target.closest('[data-estuda]');
          if(s){ dados.estuda = s.dataset.estuda; Array.prototype.forEach.call(el.querySelectorAll('[data-estuda]'), function(b){ b.setAttribute('aria-pressed', b === s ? 'true' : 'false'); }); }
        });
        q('#np-cancelar').onclick = fechar;
        q('#np-criar').onclick = function(){
          var nome = q('#np-nome').value.trim();
          if(!nome){ q('#np-erro').textContent = 'Escreva o nome de quem vai usar.'; q('#np-nome').focus(); return; }
          if(!dados.estuda){ q('#np-erro').textContent = 'Escolha o que a pessoa vai estudar: a IA monta o material do jeito certo para isso.'; return; }
          var b = this; b.disabled = true;
          api.perfis.criar({ nome:nome, emoji:dados.emoji, cor:dados.cor, estuda:dados.estuda, curso:q('#np-curso').value, focoCurto:q('#np-foco').checked, copiarIA:q('#np-ia').checked })
            .then(function(id){ fechar(); return api.perfis.usar(id); })
            .catch(function(e){ b.disabled = false; q('#np-erro').textContent = e.message; });
        };
      });
  }

  /* ao abrir o programa: com mais de um perfil, pergunta quem é (uma vez por abertura) */
  function iniciar(depois){
    api.perfis.listar().then(function(r){
      if(r.perfis.length > 1 && !r.escolhido){ depois(); abrir(true); }
      else depois();
    }).catch(function(){ depois(); });
  }
  /* para o botão do topo: emoji e nome do perfil em uso */
  function atual(){
    return api.perfis.listar().then(function(r){ return r.perfis.find(function(p){ return p.id === r.atual; }) || null; });
  }

  window.Perfis = { iniciar:iniciar, abrir:function(){ abrir(false); }, atual:atual, ESTUDA:ESTUDA };
})();
