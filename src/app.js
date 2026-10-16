/* Casca do programa: tela inicial (escolher a matéria), nova matéria,
   configurações e a troca entre matérias. */
(function(){
  "use strict";
  var esc = U.esc, api = window.api;
  var raiz = document.getElementById('raiz');
  var CORES = ['#8FD0E8','#B3B1E3','#8AD0AE','#FBD24E','#F5A9C4','#F7B267','#F08A7E','#9FD8C8'];
  var TIPOS_PROVA = [['faculdade','Faculdade (e ENADE)'],['medio','Ensino médio (prova da escola)'],['enem','ENEM / vestibular'],['concurso','Concurso'],['tecnico','Curso técnico'],['idiomas','Idiomas'],['outro','Outro']];
  var NOME_ABA = { hoje:'Plano de hoje', cards:'Flashcards', vis:'Mapa visual', mapa:'Aulas em detalhe', sim:'Simulado', disc:'Discursivas', ativ:'Atividades', form:'Fórmulas', arq:'Conteúdos', ger:'Gerenciar' };

  var lista = [];          /* resumo das matérias (cartões) */
  var atual = null;        /* controlador da matéria aberta */
  var geracoes = {};       /* id → último estado de geração */
  var boasVindasMostradas = false;

  U.aplicarTema();

  /* cada minuto de foco vai para o diário geral e para a matéria aberta */
  window.Foco.aoMinuto = function(){
    api.diario.registrar('min', 1).catch(function(){});
    if(atual) atual.minutoDeFoco();
  };

  function salvarProgresso(id, p){
    api.salvarProgresso(id, p).catch(function(e){ U.aviso('Não consegui salvar o progresso: ' + e.message, 5000); });
  }

  /* ── tela inicial ──────────────────────────────────── */
  function inicio(){
    if(atual){ atual.desmontar(); atual = null; }
    return api.listar().then(function(l){
      lista = l;
      l.forEach(function(x){ if(x.gerando) geracoes[x.id] = x.gerando; });
      var revisar = l.reduce(function(s,x){ return s + x.revisarHoje; }, 0);
      raiz.innerHTML =
        '<header class="top"><div class="wrap top-in"><div class="brand"><b>Plataforma de Estudo</b><span>'+l.length+' matéria(s)</span></div>' +
        '<div class="top-acts"><button class="ghost perfil-bt so-pc" id="i-perfil" title="Trocar de perfil ou criar um para outra pessoa">👤 Perfil</button><button class="ghost" id="i-falar" title="Avisar um erro, dar uma ideia ou tirar uma dúvida">💬 Sugestão ou erro</button><button class="ghost" id="i-config">⚙ Configurações</button><button class="theme-btn" id="i-tema" title="Alternar tema" aria-label="Alternar tema">◐</button></div></div></header>' +
        '<main class="wrap"><div class="hero"><p class="eyebrow">Suas matérias</p><h1>O que vamos estudar hoje?</h1>' +
        '<p>' + (revisar ? 'Você tem <strong>'+revisar+' questão(ões) para revisar hoje</strong>. Revisar no dia certo é o que faz a matéria não sumir da memória.' :
          'Escolha uma matéria para continuar de onde parou. Cada uma tem mapa mental, simulado, discursivas e atividades.') + '</p></div>' +
        '<div class="meta-dia" id="i-meta"></div>' +
        '<div class="cards">' + l.map(cartao).join('') +
          '<button class="card-novo" id="i-nova"><span class="mais">+</span><b>Nova matéria</b><span>Envie os slides e gere o material com IA</span></button>' +
        '</div>' +
        '<div class="acoes-inicio"><button class="ghost" id="i-importar" title="Abrir um arquivo .estudo que alguém te mandou">📥 Abrir matéria recebida</button>' +
          '<button class="ghost" id="i-pedido" title="Juntar os slides num arquivo para alguém montar a matéria para você">📦 Pedir uma matéria pronta</button></div>' +
        '<p class="dica">Tudo fica salvo neste ' + (window.PLATAFORMA_WEB ? 'aparelho' : 'computador') + ' e funciona sem internet. A internet só é usada quando você gera o conteúdo de uma matéria nova com IA.</p>' +
        '</main>';
      if(window.Notas) Notas.definirMateria(null, 'Geral');
      if(window.RelogioIA) RelogioIA.ligar(raiz);   /* “faltam” contando nos cartões que estão gerando */
      desenharMeta();
      /* primeira vez: boas-vindas (na edição da família, ou quando ainda não há matéria) */
      api.config().then(function(cfg){
        var nome = (cfg.usuario || {}).nome;
        if(nome){ var h = raiz.querySelector('.hero h1'); if(h) h.textContent = 'Olá, ' + nome + '! O que vamos estudar hoje?'; }
        if(!boasVindasMostradas && !cfg.boasVindas && (cfg.edicao === 'familia' || !l.length) && window.BoasVindas){
          boasVindasMostradas = true;
          BoasVindas.abrir({ aoCriarMateria:novaMateria, aoTerminar:function(){ inicio(); } });
        }
      }).catch(function(){});
      document.getElementById('i-tema').onclick = U.alternarTema;
      document.getElementById('i-config').onclick = configuracoes;
      document.getElementById('i-nova').onclick = novaMateria;
      document.getElementById('i-falar').onclick = function(){ Compartilhar.sugestao(); };
      document.getElementById('i-perfil').onclick = function(){ Perfis.abrir(); };
      Perfis.atual().then(function(p){ var b = document.getElementById('i-perfil'); if(b && p) b.textContent = p.emoji + ' ' + p.nome; }).catch(function(){});
      document.getElementById('i-importar').onclick = function(){ Compartilhar.importar(function(){ inicio(); }); };
      document.getElementById('i-pedido').onclick = function(){ Compartilhar.pedido(); };
      raiz.querySelector('.cards').addEventListener('click', function(ev){
        var m = ev.target.closest('[data-menu]'); if(m){ ev.stopPropagation(); menuCartao(m.dataset.menu, m); return; }
        var c = ev.target.closest('.card[data-id]'); if(c) abrir(c.dataset.id);
      });
      raiz.querySelector('.cards').addEventListener('keydown', function(ev){
        if(ev.target.closest('[data-menu]')) return;
        var c = ev.target.closest('.card[data-id]'); if(c && (ev.key === 'Enter' || ev.key === ' ')){ ev.preventDefault(); abrir(c.dataset.id); }
      });
    });
  }

  /* sequência de dias e meta diária, somando todas as matérias */
  function desenharMeta(){
    api.diario.obter().then(function(g){
      var el = document.getElementById('i-meta'); if(!el) return;
      var pct = Math.min(100, Math.round(g.hoje.min / g.meta * 100));
      var semana = [];
      for(var i = 6; i >= 0; i--){
        var d = new Date(); d.setDate(d.getDate() - i);
        var iso = U.dataISO(d), dia = g.dias[iso] || {};
        var ativo = (dia.min || 0) + (dia.q || 0) + (dia.cards || 0) > 0;
        semana.push('<span class="dia'+(ativo?' on':'')+(i===0?' hoje':'')+'" title="'+d.toLocaleDateString('pt-BR')+'">'+'DSTQQSS'[d.getDay()]+'</span>');
      }
      el.innerHTML = '<div class="meta-l"><span class="fogo">🔥</span><div><b>'+g.sequencia+' dia'+(g.sequencia===1?'':'s')+' seguido'+(g.sequencia===1?'':'s')+'</b>' +
        '<div class="semana">'+semana.join('')+'</div></div></div>' +
        '<div class="meta-r"><div class="meta-num"><b>'+g.hoje.min+'</b> de <select id="i-meta-sel" title="Meta diária de foco">' +
          [15, 30, 45, 60, 90, 120].map(function(m){ return '<option value="'+m+'"'+(m===g.meta?' selected':'')+'>'+m+'</option>'; }).join('') +
        '</select> min de foco hoje · <b>'+g.hoje.q+'</b> questões · <b>'+g.hoje.cards+'</b> flashcards</div>' +
        '<div class="meter"><i style="width:'+pct+'%"></i></div>' +
        (pct >= 100 ? '<small class="meta-ok">Meta de hoje cumprida! 🎉</small>' : '<small>Dica: abra uma matéria e siga a aba <b>☀ Hoje</b>, ou ligue o <b>⏱ modo foco</b>.</small>') + '</div>';
      document.getElementById('i-meta-sel').onchange = function(ev){ api.diario.meta(+ev.target.value).then(desenharMeta); };
    }).catch(function(){});
  }

  /* ── menu ⋯ do cartão: renomear, abrir pasta, excluir ── */
  function fecharMenuCartao(){ var m = document.getElementById('menu-cartao'); if(m) m.remove(); }
  document.addEventListener('mousedown', function(ev){ if(!ev.target.closest('#menu-cartao, [data-menu]')) fecharMenuCartao(); });
  function menuCartao(id, botao){
    var aberto = document.getElementById('menu-cartao');
    fecharMenuCartao();
    if(aberto && aberto.dataset.id === id) return;
    var x = lista.find(function(y){ return y.id === id; }); if(!x) return;
    var r = botao.getBoundingClientRect();
    var m = document.createElement('div');
    m.id = 'menu-cartao'; m.className = 'menu menu-cartao'; m.dataset.id = id;
    m.innerHTML = '<button data-op="editar">✏️ Renomear / trocar cor</button><button data-op="pasta">📂 Abrir pasta da matéria</button>' +
      '<button data-op="exportar">📤 Salvar para enviar a alguém</button><hr>' +
      '<button data-op="excluir" class="perigo">🗑 Excluir matéria…</button>';
    document.body.appendChild(m);
    m.style.top = (r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
    m.addEventListener('click', function(ev){
      var b = ev.target.closest('[data-op]'); if(!b) return;
      fecharMenuCartao();
      if(b.dataset.op === 'pasta') api.abrirPasta(id);
      else if(b.dataset.op === 'exportar') Compartilhar.exportar(id);
      else if(b.dataset.op === 'editar') editarMateria(x);
      else if(b.dataset.op === 'excluir') excluirMateria(x);
    });
  }
  function excluirMateria(x, depois){
    U.confirmar('Excluir "' + x.nome + '"?',
      'A matéria, os slides e o seu progresso vão para a Lixeira do Windows — dá para recuperar de lá se precisar. As notas do bloco de notas continuam guardadas.',
      'Excluir', true).then(function(ok){
      if(!ok) return;
      api.excluir(x.id).then(function(){
        delete geracoes[x.id];
        U.aviso('"' + x.nome + '" foi para a Lixeira');
        (depois || inicio)();
      }).catch(function(e){ U.aviso('Não consegui excluir: ' + e.message, 5000); });
    });
  }
  function editarMateria(x){
    var cor = x.cor;
    U.modal('<h2>Renomear matéria</h2>' +
      '<label class="campo"><span>Nome</span><input type="text" id="e-nome" value="'+esc(x.nome)+'"></label>' +
      '<label class="campo"><span>Instituição ou professor</span><input type="text" id="e-sub" value="'+esc(x.subtitulo || '')+'"></label>' +
      '<div class="campo"><span>Cor</span><div class="cores">' + CORES.map(function(c){ return '<button type="button" style="background:'+c+'" data-cor="'+c+'" aria-pressed="'+(c===cor)+'" aria-label="Cor"></button>'; }).join('') + '</div></div>' +
      '<div class="modal-acts"><button class="ghost" id="e-cancelar">Cancelar</button><button class="btn" id="e-ok">Salvar</button></div>',
      function(el, fechar){
        el.addEventListener('click', function(ev){
          var b = ev.target.closest('[data-cor]');
          if(b){ cor = b.dataset.cor; Array.prototype.forEach.call(el.querySelectorAll('[data-cor]'), function(z){ z.setAttribute('aria-pressed', z === b ? 'true':'false'); }); }
        });
        el.querySelector('#e-cancelar').onclick = fechar;
        el.querySelector('#e-ok').onclick = function(){
          var nome = el.querySelector('#e-nome').value.trim();
          if(!nome){ el.querySelector('#e-nome').focus(); return; }
          api.editar(x.id, { nome:nome, subtitulo:el.querySelector('#e-sub').value, cor:cor }).then(function(){ fechar(); U.aviso('Salvo'); inicio(); });
        };
      });
  }
  window.excluirMateriaPorId = function(id, depois){
    var x = lista.find(function(y){ return y.id === id; });
    if(x) excluirMateria(x, depois);
  };

  function iniciais(nome){
    var p = String(nome).split(/\s+/).filter(function(w){ return w.length > 2 || /^[A-Z]/.test(w); });
    return ((p[0] || nome)[0] + ((p[1] || '')[0] || '')).toUpperCase();
  }

  function cartao(x){
    var pct = x.nQuestoes ? Math.round(x.respondidas / x.nQuestoes * 100) : 0;
    var acerto = x.respondidas ? Math.round(x.acertos / x.respondidas * 100) : null;
    var g = geracoes[x.id], gerandoAgora = g && (g.fase === 'aulas' || g.fase === 'geral' || g.fase === 'importando');
    return '<div class="card" role="button" tabindex="0" data-id="'+esc(x.id)+'">' +
      '<span class="faixa-cor" style="background:'+esc(x.cor)+'"></span>' +
      '<button class="card-mais" data-menu="'+esc(x.id)+'" title="Opções: renomear, abrir pasta, excluir" aria-label="Opções da matéria">⋯</button>' +
      '<div class="card-top"><span class="bola" style="background:'+esc(x.cor)+'">'+esc(iniciais(x.nome))+'</span>' +
        '<div><h3>'+esc(x.nome)+'</h3><div class="sub">'+esc(x.subtitulo || '—')+'</div></div></div>' +
      /* gerando com IA: o relógio com a mascote no meio do cartão */
      (gerandoAgora && g.relogio && window.RelogioIA ? '<div class="card-relogio">' + RelogioIA.html(g, true) + '</div>' : '') +
      '<div class="nums"><span><b>'+x.nAulas+'</b> aulas</span><span><b>'+x.nMapas+'</b> mapas</span><span><b>'+x.nQuestoes+'</b> questões</span><span><b>'+x.nDiscursivas+'</b> discursivas</span></div>' +
      '<div><div class="barra"><i style="width:'+pct+'%;background:'+esc(x.cor)+'"></i></div>' +
        '<div class="nums" style="margin-top:6px"><span>Simulado: <b>'+x.respondidas+'/'+x.nQuestoes+'</b></span>' + (acerto !== null ? '<span>Acerto: <b>'+acerto+'%</b></span>' : '') +
        '<span>Atividades: <b>'+x.atividadesFeitas+'/'+x.nAtividades+'</b></span></div></div>' +
      '<div class="rodape">' +
        (gerandoAgora ? '<span class="selo gen">' + (g.fase === 'importando'
          ? 'Importando ' + (g.total ? Math.min((g.feitos || 0) + 1, g.total) + '/' + g.total : '…')
          : 'Gerando ' + (g.total ? (g.feitas || 0) + '/' + g.total : '…') + (g.relogio && window.RelogioIA ? ' · ⏳ faltam ' + RelogioIA.tempo(g.relogio.restante) : '')) + '</span>' : '') +
        (x.revisarHoje ? '<span class="selo rev">'+x.revisarHoje+' para revisar hoje</span>' : '') +
        (x.pendentes && !gerandoAgora ? '<span class="selo pend">'+x.pendentes+' aula(s) sem gerar</span>' : '') +
        '<span class="continuar">'+(x.ultimo && x.ultimo.aba ? 'Continuar: '+(NOME_ABA[x.ultimo.aba] || 'estudo') : 'Começar')+' →</span>' +
      '</div></div>';
  }

  /* ── abrir uma matéria ─────────────────────────────── */
  function abrir(id){
    return api.abrir(id).then(function(r){
      if(atual){ atual.desmontar(); atual = null; }
      if(r.gerando) geracoes[id] = r.gerando;
      atual = window.Materia({
        raiz: raiz, materia: r.materia, progresso: r.progresso, gerando: geracoes[id] || null,
        aoSalvar: salvarProgresso,
        aoVoltar: function(){ inicio(); },
        aoTrocar: function(outro){ abrir(outro); },
        aoNova: novaMateria,
        aoConfig: configuracoes,
        aoRecarregar: recarregarAtual,
        lista: function(){ return lista; }
      });
      /* depois de montar: o bloco de notas se posiciona abaixo do cabeçalho já desenhado */
      if(window.Notas) Notas.definirMateria(id, r.materia.nome);
      if(!lista.length) api.listar().then(function(l){ lista = l; });
    }).catch(function(e){ U.aviso('Não consegui abrir a matéria: ' + e.message, 5000); return inicio(); });
  }

  function recarregarAtual(){
    if(!atual) return Promise.resolve();
    var id = atual.id();
    atual.salvarAgora();
    return api.abrir(id).then(function(r){
      if(atual && atual.id() === id) atual.recarregar(r.materia, r.progresso);
      return api.listar().then(function(l){ lista = l; });
    });
  }

  /* ── atualização automática: versão nova baixada → convite para reiniciar ── */
  api.atualizacao.aoMudar(function(e){
    var faixa = document.getElementById('faixa-atualizacao');
    if(e.fase !== 'pronta'){ if(faixa && e.fase !== 'pronta') faixa.remove(); return; }
    if(faixa) return;
    faixa = document.createElement('div');
    faixa.id = 'faixa-atualizacao'; faixa.className = 'faixa-atualizacao';
    faixa.innerHTML = '<span>✨ <b>Nova versão ' + esc(e.versao || '') + ' pronta.</b> ' + (e.notas ? esc(e.notas) + ' ' : '') + 'Reinicie para usar (leva poucos segundos; nada do seu estudo se perde).</span>' +
      '<button class="btn" id="fa-agora">Reiniciar agora</button><button class="ghost" id="fa-depois">Depois</button>';
    document.body.appendChild(faixa);
    faixa.querySelector('#fa-agora').onclick = function(){ if(atual) atual.salvarAgora(); api.atualizacao.instalar(); };
    faixa.querySelector('#fa-depois').onclick = function(){ faixa.remove(); U.aviso('Tudo bem: ela instala sozinha quando você fechar o programa.', 4000); };
  });

  /* ── sincronização com o outro computador (OneDrive) ── */
  function recarregarDoDisco(){
    if(!atual) return;
    var id = atual.id();
    api.abrir(id).then(function(r){ if(atual && atual.id() === id) atual.recarregar(r.materia, r.progresso); }).catch(function(){});
  }
  api.sinc.aoMudar(function(tipo, d){
    if(tipo === 'progresso'){ if(atual && d && atual.id() === d.id){ U.aviso('Juntei o que você estudou no outro computador.', 3500); recarregarDoDisco(); } }
    else if(!atual) inicio();
    else {
      api.listar().then(function(l){ lista = l; });
      if(d && d.organizadas && d.organizadas.indexOf(atual.id()) >= 0) recarregarDoDisco();   /* livro organizado em capítulos */
    }
  });
  /* voltou para a janela (ex.: estudou no outro PC enquanto este ficou aberto) */
  var ultimaVerificacao = 0;
  window.addEventListener('focus', function(){
    if(Date.now() - ultimaVerificacao < 15000) return;
    ultimaVerificacao = Date.now();
    if(atual){
      var id = atual.id();
      api.sinc.verificar(id).then(function(mudou){ if(mudou){ U.aviso('Juntei o que você estudou no outro computador.', 3500); recarregarDoDisco(); } }).catch(function(){});
    } else {
      api.sinc.agora().then(function(r){ if(!atual){ if(r && r.trazidas) inicio(); else desenharMeta(); } }).catch(function(){});
    }
  });

  /* ── progresso da geração com IA ───────────────────── */
  var timerRecarga = null;
  api.aoGerar(function(ev){
    geracoes[ev.id] = ev;
    if(atual && atual.id() === ev.id){
      atual.geracao(ev);
      /* uma aula ficou pronta: recarrega o conteúdo (com calma, no máximo a cada 1,5 s) */
      if(ev.atualizou){ clearTimeout(timerRecarga); timerRecarga = setTimeout(recarregarAtual, 1500); }
    } else if(!atual){
      var c = raiz.querySelector('.card[data-id="'+ev.id+'"]');
      /* só o relógio mudou: troca o relógio do cartão, sem recarregar a lista */
      var rel = c && c.querySelector('.card-relogio');
      if(rel && ev.relogio && !ev.atualizou && (ev.fase === 'aulas' || ev.fase === 'geral')){
        rel.innerHTML = RelogioIA.html(ev, true); RelogioIA.ligar(raiz);
        var selo = c.querySelector('.selo.gen'); if(selo) selo.textContent = 'Gerando ' + (ev.total ? (ev.feitas || 0) + '/' + ev.total : '…') + ' · ⏳ faltam ' + RelogioIA.tempo(ev.relogio.restante);
      } else if(c && (ev.fase === 'fim' || ev.atualizou || ev.fase === 'aulas' || ev.fase === 'geral' || ev.fase === 'erro' || ev.fase === 'cancelada')) {
        api.listar().then(function(l){
          lista = l;
          var x = l.find(function(y){ return y.id === ev.id; });
          var c2 = raiz.querySelector('.card[data-id="'+ev.id+'"]');
          if(x && c2){ c2.outerHTML = cartao(x); if(window.RelogioIA) RelogioIA.ligar(raiz); }
        });
      }
    }
    if(ev.fase === 'fim') U.aviso('Geração concluída: ' + (lista.find(function(x){ return x.id === ev.id; }) || { nome:'matéria' }).nome, 4000);
  });

  /* ── nova matéria ──────────────────────────────────── */
  function novaMateria(){
    var arquivos = [], cor = CORES[Math.floor(Math.random() * CORES.length)];
    /* qual IA vai gerar: Claude (chave), a IA grátis do computador (a da mascote) ou outra compatível */
    var estiloPadrao = 'faculdade';
    api.config().then(function(c){ if(c.estudo) estiloPadrao = c.estudo.chave; }).catch(function(){})
    .then(function(){ return api.statusGeracao(); }).catch(function(e){ return { disponivel:false, motivo:e.message }; }).then(function(st){
      var cfg = { temChave: st.disponivel };
      var opcoesIA = st.opcoes || [];
      var infoIA = !st.disponivel
        ? '<p class="msg-erro" style="color:var(--warn)">Nenhuma IA disponível agora: ' + esc(st.motivo) + ' Você já pode criar a matéria e gerar depois.</p>'
        : '<div class="campo"><span>Gerar com</span><div class="escolha-ia">' + opcoesIA.map(function(o){
            return '<label class="op-ia"><input type="radio" name="n-ia" value="'+o.tipo+'"'+(o.tipo === st.tipo ? ' checked' : '')+'>' +
              '<span><b>' + esc(o.nome) + '</b><small>' + esc(o.modelo) + ' · ' + (o.tipo === 'claude' ? 'melhor qualidade, usa a internet (≈ US$ 0,30 a 0,60 por aula)' : o.gratis ? 'grátis e offline; mais lento e mais simples — revise as pegadinhas' : 'usa a internet') + '</small></span></label>';
          }).join('') + '</div></div>';
      U.modal(
        '<h2>Nova matéria</h2><p>Dê um nome, escolha uma cor e envie os slides das aulas (.pptx ou .pdf). Cada arquivo vira uma aula, na ordem dos nomes.</p>' +
        '<div class="cfg-links"><button class="ghost" id="n-importar" type="button">📥 Já recebi uma matéria pronta (.estudo)</button>' +
          (st.disponivel ? '' : '<button class="ghost" id="n-pedido" type="button">📦 Pedir para alguém montar</button>') + '</div>' +
        '<label class="campo"><span>Nome da matéria</span><input type="text" id="n-nome" placeholder="Ex.: Banco de Dados II"></label>' +
        '<label class="campo"><span>Instituição ou professor <small>(opcional)</small></span><input type="text" id="n-sub" placeholder="Ex.: CEUNI FAMETRO · Prof. Fulano"></label>' +
        /* tipo de prova: muda a linguagem e o estilo das questões (vem marcado pelo perfil de quem estuda) */
        '<label class="campo"><span>Para que tipo de prova?</span><select id="n-estilo">' + TIPOS_PROVA.map(function(o){ return '<option value="'+o[0]+'"'+(o[0] === estiloPadrao ? ' selected' : '')+'>'+esc(o[1])+'</option>'; }).join('') + '</select></label>' +
        '<div class="campo"><span>Cor</span><div class="cores" id="n-cores">' + CORES.map(function(c){ return '<button type="button" style="background:'+c+'" data-cor="'+c+'" aria-pressed="'+(c===cor)+'" aria-label="Cor"></button>'; }).join('') + '</div></div>' +
        '<div class="campo"><span>Slides e arquivos</span><div><button class="ghost" id="n-escolher" type="button">Escolher arquivos…</button></div><div class="lista-arq" id="n-lista"></div></div>' +
        infoIA +
        '<div class="msg-erro" id="n-erro"></div>' +
        '<div class="modal-acts"><button class="ghost" id="n-cancelar" type="button">Cancelar</button>' +
          '<button class="ghost" id="n-criar" type="button">Criar sem gerar</button>' +
          '<button class="btn" id="n-gerar" type="button"'+(cfg.temChave?'':' disabled title="Ligue a IA (LM Studio) ou configure a chave primeiro"')+'>Criar e gerar com IA</button></div>',
        function(el, fechar){
          var q = function(s){ return el.querySelector(s); };
          function mostrar(){
            /* .zip e outros formatos não entram: avisa na hora, em vez de ignorar calado */
            q('#n-lista').innerHTML = arquivos.map(function(c){
              var ok = /\.(pptx|pdf|png|jpe?g|webp|gif)$/i.test(c);
              return '<div title="'+esc(c)+'"'+(ok ? '' : ' style="color:var(--bad)"')+'>'+esc(c.split(/[\\/]/).pop()) +
                (ok ? '' : ' — não aceito' + (/\.zip$/i.test(c) ? ': extraia o .zip e escolha os PDFs/PPTX de dentro' : ' (use .pptx, .pdf ou imagem)')) + '</div>';
            }).join('');
          }
          el.addEventListener('click', function(ev){
            var b = ev.target.closest('[data-cor]');
            if(b){ cor = b.dataset.cor; Array.prototype.forEach.call(el.querySelectorAll('[data-cor]'), function(x){ x.setAttribute('aria-pressed', x === b ? 'true':'false'); }); }
          });
          q('#n-cancelar').onclick = fechar;
          q('#n-importar').onclick = function(){ fechar(); Compartilhar.importar(function(id){ abrir(id); }); };
          if(q('#n-pedido')) q('#n-pedido').onclick = function(){ fechar(); Compartilhar.pedido(); };
          q('#n-escolher').onclick = function(){
            api.escolherArquivos().then(function(c){ c.forEach(function(x){ if(arquivos.indexOf(x) < 0) arquivos.push(x); }); mostrar(); });
          };
          function criar(gerar){
            var nome = q('#n-nome').value.trim();
            if(!nome){ q('#n-erro').textContent = 'Dê um nome para a matéria.'; q('#n-nome').focus(); return; }
            if(gerar && !arquivos.length){ q('#n-erro').textContent = 'Escolha os slides para a IA ler.'; return; }
            var marcada = el.querySelector('input[name="n-ia"]:checked');
            var iaEscolhida = marcada ? marcada.value : undefined;
            q('#n-gerar').disabled = q('#n-criar').disabled = true;
            q('#n-erro').textContent = '';
            api.criar({ nome:nome, subtitulo:q('#n-sub').value, cor:cor, estilo:q('#n-estilo').value }).then(function(id){
              fechar();
              return abrir(id).then(function(){
                if(!arquivos.length) return;
                if(atual) atual.geracao({ fase:'importando', msg:'Copiando e convertendo os slides… (os .pptx passam pelo PowerPoint)', feitos:0, total:arquivos.length });
                return api.adicionarArquivos(id, arquivos).then(function(r){
                  if(r && r.cancelado){
                    if(atual) atual.geracao({ fase:'cancelada', msg:'Importação cancelada — nada foi adicionado. Você pode excluir esta matéria no menu ⋯ da tela inicial.' });
                    return 'cancelado';
                  }
                  return recarregarAtual();
                }).then(function(x){
                  if(x === 'cancelado') return;
                  if(gerar) return api.gerar(id, { provedor:iaEscolhida }).then(function(){ if(atual) atual.geracao({ fase:'aulas', msg:'Começando…', feitas:0, total:arquivos.length }); })
                    .catch(function(e){ if(atual) atual.geracao({ fase:'erro', msg:e.message }); });
                  if(atual) atual.geracao({ fase:'fim', msg:'Arquivos adicionados. Gere o conteúdo na aba Gerenciar quando quiser.' });
                });
              });
            }).catch(function(e){ U.aviso('Erro: ' + e.message, 5000); });
          }
          q('#n-criar').onclick = function(){ criar(false); };
          q('#n-gerar').onclick = function(){ criar(true); };
        });
    });
  }

  /* código de ativação pronto para mandar: copiar ou WhatsApp, com o link do programa */
  function mostrarCodigo(cod){
    var link = 'github.com/ProjetoOrlon/plataforma-estudo-atualizacoes/releases/latest';
    var texto = 'Oi! Para testar a Plataforma de Estudo:\n1) Baixe e instale: ' + link + '\n2) Quando a ' + Mascote.nome + ' perguntar, cole este código de ativação:\n' + cod;
    U.modal('<h2>📤 Código para outra pessoa</h2><p>Mande este código para quem vai testar. Ela instala o programa e, nas boas-vindas (ou em ⚙ Configurações), cola o código: a IA fica pronta sozinha.</p>' +
      '<textarea class="codigo-ativacao" readonly rows="3">' + esc(cod) + '</textarea>' +
      '<p class="cfg-ajuda">⚠ O código leva a sua chave da IA. Mande só para pessoas de confiança. Se vazar, apague a chave no site do serviço e gere outra.</p>' +
      '<div class="modal-acts"><button class="ghost" id="cc-fechar" type="button">Fechar</button><button class="ghost" id="cc-wpp" type="button">Enviar pelo WhatsApp</button><button class="btn" id="cc-copiar" type="button">Copiar mensagem</button></div>',
      function(el, fechar){
        el.querySelector('#cc-fechar').onclick = fechar;
        el.querySelector('#cc-copiar').onclick = function(){ navigator.clipboard.writeText(texto).then(function(){ U.aviso('Mensagem copiada: cole no WhatsApp ou e-mail.', 3500); }); };
        el.querySelector('#cc-wpp').onclick = function(){ window.open('https://wa.me/?text=' + encodeURIComponent(texto)); };
      });
  }

  /* ── configurações ─────────────────────────────────── */
  function configuracoes(){
    api.config().then(function(cfg){
      U.modal(
        '<h2>Configurações</h2><p class="so-pc">A chave da API da Anthropic é usada só para gerar o conteúdo das matérias. Ela fica guardada neste computador, criptografada pelo Windows. Crie a sua em <strong>console.anthropic.com</strong> → API Keys.</p>' +
        '<label class="campo so-pc"><span>Chave da API</span><input type="password" id="c-chave" autocomplete="off" placeholder="'+(cfg.temChave ? 'Chave salva (termina em …'+esc(cfg.finalChave)+'). Cole outra para trocar.' : 'sk-ant-…')+'">' +
          '<small>Uso pago por consumo. Gerar uma matéria de 20 aulas custa em torno de US$ 6 a 12 com o Claude Opus 5.</small></label>' +
        '<label class="campo so-pc"><span>Modelo</span><select id="c-modelo">' + cfg.modelos.map(function(m){ return '<option value="'+m.id+'"'+(m.id===cfg.modelo?' selected':'')+'>'+esc(m.nome)+'</option>'; }).join('') + '</select></label>' +
        '<label class="campo"><span>Questões de múltipla escolha por aula</span><select id="c-qpa">' + [4,6,8,10].map(function(n){ return '<option'+(n===cfg.questoesPorAula?' selected':'')+'>'+n+'</option>'; }).join('') + '</select></label>' +
        /* a IA do programa: o catálogo (lib/ias.js) acha as do computador; a online e o Claude entram com chave */
        '<h3 class="cfg-sec">🧠 Inteligência artificial</h3>' +
        '<p class="cfg-ajuda">O programa procura as IAs que consegue usar. Escolha qual vai <b>criar as matérias</b> e conversar como a <b>'+esc(Mascote.nome)+'</b>. Se não escolher, ele usa uma sozinho.</p>' +
        '<div class="ias-lista" id="c-ias">Procurando IAs…</div>' +
        '<div class="cfg-links"><button class="ghost" id="c-ttestar" type="button">🔍 Procurar de novo</button><button class="ghost so-pc" id="c-tajuda" type="button">Como instalar uma IA grátis</button></div>' +
        '<details class="ia-online" id="c-online"'+(cfg.geracao.url ? ' open' : '')+'><summary>🌐 Conectar uma IA online (ChatGPT, Gemini, Groq…)</summary>' +
          '<p class="cfg-ajuda">⚠ O <b>aplicativo</b> do ChatGPT (ou do Gemini) instalado no computador não pode ser usado por outro programa. Para usar a IA deles aqui, crie uma <b>chave da API</b> no site do serviço e cole abaixo. O <b>Gemini</b> e o <b>Groq</b> têm plano grátis; no ChatGPT a API é paga à parte da assinatura.</p>' +
          '<label class="campo"><span>Serviço</span><select id="c-gserv"></select></label>' +
          '<label class="campo" id="c-gurl-w" hidden><span>Endereço da API (formato OpenAI)</span><input type="text" id="c-gurl" value="'+esc(cfg.geracao.url)+'" placeholder="https://…/v1"></label>' +
          '<label class="campo"><span>Chave da API <small id="c-gsite"></small></span><input type="password" id="c-gchave" autocomplete="off" placeholder="'+(cfg.geracao.temChave ? 'Chave salva. Cole outra para trocar.' : 'Cole a chave aqui')+'"></label>' +
          '<div class="cfg-links"><button class="ghost" id="c-gtestar" type="button">Testar e ver os modelos</button>' + (cfg.geracao.url ? '<button class="ghost" id="c-gdesligar" type="button" style="color:var(--bad)">Desconectar</button>' : '') + '</div>' +
          '<label class="campo"><span>Modelo</span><input type="text" id="c-gmod" list="c-gmods" value="'+esc(cfg.geracao.modelo)+'" placeholder="teste a chave para ver a lista"><datalist id="c-gmods"></datalist></label>' +
          '<div class="cfg-status" id="c-gstatus" hidden></div>' +
          (cfg.geracao.url ? '<div class="cfg-links" style="margin-top:8px"><button class="ghost" id="c-gcodigo" type="button">📤 Gerar código para outra pessoa</button></div>' : '') +
        '</details>' +
        '<label class="campo" style="margin-top:8px"><span>🎟 Recebeu um código de ativação?</span><div class="linha-codigo"><input type="text" id="c-codigo" placeholder="Cole aqui o código (começa com PE1-)"><button class="ghost" id="c-usarcod" type="button">Ativar</button></div></label>' +
        '<h3 class="cfg-sec cfg-mascote">' + Mascote.avatar(30) + Mascote.nome+' — tutora de IA</h3>' +
        '<label class="chk-linha"><input type="checkbox" id="c-tligada"'+(cfg.assistente.modo === 'desligado' ? '' : ' checked')+'> Ligar a tutora</label>' +
        '<div class="cfg-status" id="c-tstatus">Procurando a IA…</div>' +
        '<div class="so-pc"><h3 class="cfg-sec">🔄 Sincronização entre computadores</h3>' +
        '<label class="chk-linha"><input type="checkbox" id="c-sinc"'+(cfg.sincronizacao.desligada ? '' : ' checked')+'> Juntar progresso, notas e matérias de casa e do trabalho pelo OneDrive</label>' +
        '<div class="cfg-status" id="c-sstatus">Verificando…</div>' +
        '<div class="cfg-links" style="margin-top:8px"><button class="ghost" id="c-sagora" type="button">Sincronizar agora</button></div></div>' +
        '<h3 class="cfg-sec">ℹ Sobre</h3>' +
        '<div class="cfg-status">Plataforma de Estudo · versão <b>' + esc(cfg.versao) + '</b> · edição ' + (cfg.edicao === 'familia' ? 'família' : 'pessoal') + (cfg.usuario && cfg.usuario.nome ? ' · olá, ' + esc(cfg.usuario.nome) + '!' : '') + '</div>' +
        '<div class="cfg-status" id="c-atual" style="margin-top:8px">Atualizações: verificando…</div>' +
        '<div class="cfg-links" style="margin-top:8px"><button class="ghost" id="c-procurar" type="button">Procurar atualização</button><button class="ghost" id="c-boasvindas" type="button">Rever as boas-vindas</button><button class="ghost" id="c-falar" type="button">💬 Enviar sugestão ou erro</button></div>' +
        '<div id="c-msg"></div>' +
        '<div class="modal-acts">' + (cfg.temChave ? '<button class="ghost" id="c-remover" type="button" style="margin-right:auto;color:var(--bad)">Apagar chave</button><button class="ghost" id="c-testar" type="button">Testar chave</button>' : '') +
          '<button class="ghost" id="c-cancelar" type="button">Fechar</button><button class="btn" id="c-salvar" type="button">Salvar</button></div>',
        function(el, fechar){
          var q = function(s){ return el.querySelector(s); };
          var msg = function(t, ok){ q('#c-msg').innerHTML = '<p class="'+(ok?'msg-ok':'msg-erro')+'">'+esc(t)+'</p>'; };
          q('#c-cancelar').onclick = fechar;

          /* lista das IAs: automático + cada uma encontrada; a do computador com
             vários modelos mostra a escolha do modelo */
          var iaSel = (cfg.ia || {}).escolhida || 'auto', iaLista = [], modeloLocal = cfg.assistente.modelo || '';
          function rotuloIa(o){
            return o.tipo === 'local' ? 'grátis · roda neste computador' : o.tipo === 'claude' ? 'online · pago (chave da Anthropic)' : 'online · ' + (o.gratis ? 'tem plano grátis' : 'pago pelo uso');
          }
          function desenharIas(){
            var faltando = iaSel !== 'auto' && !iaLista.some(function(o){ return o.id === iaSel; });
            var linha = function(id, titulo, sub, extra){
              return '<label class="ia-op'+(iaSel === id ? ' on' : '')+'"><input type="radio" name="c-ia" value="'+esc(id)+'"'+(iaSel === id ? ' checked' : '')+'><span><b>'+titulo+'</b><small>'+sub+'</small>'+(extra || '')+'</span></label>';
            };
            q('#c-ias').innerHTML = !iaLista.length
              ? '<div class="cfg-status">⚠ Nenhuma IA encontrada agora. Abra uma IA do computador (LM Studio, Ollama, Jan…) e clique em <b>Procurar de novo</b>, ou conecte uma IA online logo abaixo.</div>'
              : linha('auto', '⚙ Automático', iaLista.length === 1 ? 'só encontrei uma IA: ela será usada' : 'o programa escolhe: a do computador para a tutora; para criar matérias, o Claude se houver chave') +
                iaLista.map(function(o){
                  var mods = o.tipo === 'local' && o.modelos.length > 1 && iaSel === o.id
                    ? '<select class="ia-mod" id="c-imod">' + o.modelos.map(function(m){ return '<option'+(m === modeloLocal ? ' selected' : '')+'>'+esc(m)+'</option>'; }).join('') + '</select>' : '';
                  return linha(o.id, esc(o.nome), rotuloIa(o) + (o.tipo === 'local' ? ' · ' + o.modelos.length + ' modelo' + (o.modelos.length === 1 ? '' : 's') : ''), mods);
                }).join('') +
                (faltando ? '<div class="cfg-status">⚠ A IA que você escolheu não está ligada agora; enquanto isso, o programa usa outra.</div>' : '');
            var sm = q('#c-imod'); if(sm){ if(!modeloLocal || sm.value !== modeloLocal) modeloLocal = sm.value; sm.onchange = function(){ modeloLocal = this.value; }; }
          }
          q('#c-ias').addEventListener('change', function(ev){
            if(ev.target.name === 'c-ia'){ iaSel = ev.target.value; desenharIas(); }
          });
          function situacaoTutor(forcar){
            q('#c-tstatus').textContent = 'Procurando a IA…';
            api.ias.listar(forcar).then(function(r){ iaLista = r.opcoes; desenharIas(); return window.Tutor.status(forcar); }).then(function(s){
              q('#c-tstatus').innerHTML = !q('#c-tligada').checked ? 'A tutora está desligada.' : s.disponivel
                ? '✅ A '+esc(Mascote.nome)+' conversa usando <b>' + esc(s.servidor) + '</b> · ' + esc(s.modelo)
                : '⚠ ' + esc(s.motivo || 'Nenhuma IA disponível.');
            }).catch(function(e){ q('#c-ias').textContent = e.message; });
          }
          situacaoTutor(false);
          q('#c-tligada').onchange = function(){ situacaoTutor(false); };

          /* IA online: serviço, chave, teste e modelos */
          var servicos = {};
          function servicoAtual(){
            var url = (q('#c-gurl').value || '').trim().replace(/\/+$/, '');
            return Object.keys(servicos).filter(function(k){ return servicos[k].url === url; })[0] || (url ? 'outra' : 'gemini');
          }
          function mostrarServico(){
            var s = q('#c-gserv').value, sv = servicos[s];
            q('#c-gurl-w').hidden = s !== 'outra';
            if(sv) q('#c-gurl').value = sv.url;
            q('#c-gsite').innerHTML = sv ? '— crie em <b>' + esc(sv.site) + '</b>' + (sv.gratis ? ' (tem plano grátis)' : '') : '';
          }
          api.ias.servicos().then(function(sv){
            servicos = sv;
            var atual = servicoAtual();
            q('#c-gserv').innerHTML = Object.keys(sv).map(function(k){ return '<option value="'+k+'"'+(k === atual ? ' selected' : '')+'>'+esc(sv[k].nome)+'</option>'; }).join('') +
              '<option value="outra"'+(atual === 'outra' ? ' selected' : '')+'>Outra (endereço próprio)</option>';
            mostrarServico();
          }).catch(function(){});
          q('#c-gserv').onchange = function(){ q('#c-gmod').value = ''; q('#c-gmods').innerHTML = ''; mostrarServico(); };
          q('#c-gtestar').onclick = function(){
            var b = this, st = q('#c-gstatus');
            b.disabled = true; st.hidden = false; st.textContent = 'Testando…';
            api.ias.testarOnline({ servico:q('#c-gserv').value, url:q('#c-gurl').value, chave:q('#c-gchave').value.trim() }).then(function(r){
              b.disabled = false;
              q('#c-gmods').innerHTML = r.modelos.map(function(m){ return '<option value="'+esc(m)+'">'; }).join('');
              if(!q('#c-gmod').value || r.modelos.indexOf(q('#c-gmod').value) < 0){
                /* rápido e grátis: o “flash-lite-latest” do Gemini (não fica “pensando”: ~1 s por resposta e
                   quase nunca congestionado; testado com as aulas de Auditoria); senão um flash/mini estável */
                var bom = r.modelos.filter(function(m){ return /^gemini-flash-lite-latest$/.test(m); })[0] ||
                  r.modelos.filter(function(m){ return /^gemini-flash-latest$/.test(m); })[0] ||
                  r.modelos.filter(function(m){ return /flash|mini|llama-3\.3-70b|instant/i.test(m) && !/thinking|preview|exp|lite|nano/i.test(m); })[0];
                q('#c-gmod').value = bom || r.modelos[0];
              }
              st.innerHTML = '✅ A chave funciona. ' + r.modelos.length + ' modelos disponíveis; escolhi <b>' + esc(q('#c-gmod').value) + '</b> (pode trocar). Clique em <b>Salvar</b> para conectar.';
            }).catch(function(e){ b.disabled = false; st.innerHTML = '⚠ ' + esc(e.message); });
          };
          /* código de ativação: leva a IA online daqui para outra pessoa (testadores de confiança) */
          if(q('#c-gcodigo')) q('#c-gcodigo').onclick = function(){
            api.ias.gerarCodigo().then(function(cod){ fechar(); mostrarCodigo(cod); }).catch(function(e){ msg(e.message, false); });
          };
          q('#c-usarcod').onclick = function(){
            var b = this; b.disabled = true; b.textContent = 'Ativando…';
            api.ias.usarCodigo(q('#c-codigo').value).then(function(r){
              fechar(); U.aviso('Pronto! A IA ' + r.nome + ' está ativada. Já dá para criar matérias.', 5000); window.Tutor.status(true); if(!atual) inicio();
            }).catch(function(e){ b.disabled = false; b.textContent = 'Ativar'; msg(e.message, false); });
          };
          if(q('#c-gdesligar')) q('#c-gdesligar').onclick = function(){
            api.salvarConfig({ geracao:{ url:'', modelo:'', chave:'' }, ia:{ escolhida: iaSel === 'online' ? 'auto' : iaSel } })
              .then(function(){ fechar(); U.aviso('IA online desconectada'); window.Tutor.status(true); });
          };
          var mostraAtual = function(s){ q('#c-atual').textContent = 'Atualizações: ' + (s.msg || (s.fase === 'parado' ? 'ainda não verifiquei hoje.' : s.fase)); };
          api.atualizacao.status().then(mostraAtual).catch(function(){});
          q('#c-procurar').onclick = function(){ q('#c-atual').textContent = 'Atualizações: procurando…'; api.atualizacao.verificar().then(mostraAtual).catch(function(e){ q('#c-atual').textContent = e.message; }); };
          q('#c-falar').onclick = function(){ fechar(); Compartilhar.sugestao(); };
          q('#c-boasvindas').onclick = function(){ fechar(); BoasVindas.abrir({ aoCriarMateria:novaMateria, aoTerminar:function(){ if(!atual) inicio(); } }); };

          q('#c-ttestar').onclick = function(){ situacaoTutor(true); };
          q('#c-tajuda').onclick = function(){ window.Tutor.ajuda(); };

          /* sincronização: pasta, este computador e os outros já vistos */
          function situacaoSinc(s){
            if(!s.ativa){ q('#c-sstatus').innerHTML = '⚠ ' + esc(s.motivo); return; }
            var quando = function(iso){ return iso ? new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'; };
            q('#c-sstatus').innerHTML = '✅ Este computador: <b>' + esc(s.maquina) + '</b><br>Pasta: ' + esc(s.pasta) + '<br>' +
              (s.outros.length ? 'Outros computadores: ' + s.outros.map(function(o){ return '<b>' + esc(o.maquina) + '</b> (último envio ' + quando(o.em) + ')'; }).join(', ')
                : 'Ainda não vi outro computador. Instale o programa no outro PC, entre no <b>mesmo OneDrive</b> e abra o programa lá uma vez.');
          }
          api.sinc.status().then(situacaoSinc).catch(function(){});
          q('#c-sagora').onclick = function(){
            var b = this; b.disabled = true; b.textContent = 'Sincronizando…';
            api.sinc.agora().then(function(r){
              b.disabled = false; b.textContent = 'Sincronizar agora';
              situacaoSinc(r.status);
              U.aviso('Sincronizado' + (r.trazidas ? ' — ' + r.trazidas + ' matéria(s) trazida(s)' : '') + (r.enviadas ? ' — ' + r.enviadas + ' enviada(s)' : '') + '.', 3500);
            }).catch(function(e){ b.disabled = false; b.textContent = 'Sincronizar agora'; U.aviso(e.message, 4000); });
          };

          if(q('#c-testar')) q('#c-testar').onclick = function(){
            msg('Testando…', true);
            api.testarChave().then(function(r){ msg(r.ok ? 'A chave funciona.' : r.msg, r.ok); });
          };
          if(q('#c-remover')) q('#c-remover').onclick = function(){
            api.salvarConfig({ chave:'' }).then(function(){ fechar(); U.aviso('Chave apagada'); });
          };
          q('#c-salvar').onclick = function(){
            var dados = { modelo:q('#c-modelo').value, questoesPorAula:+q('#c-qpa').value,
              assistente:{ modo:q('#c-tligada').checked ? 'auto' : 'desligado', modelo:modeloLocal },
              sincronizacao:{ desligada:!q('#c-sinc').checked },
              ia:{ escolhida:iaSel } };
            /* IA online: só conecta se já estava conectada ou se colou uma chave agora */
            var gchave = q('#c-gchave').value.trim();
            if(gchave || cfg.geracao.url){
              if(!q('#c-gmod').value.trim()){ msg('Para conectar a IA online, clique em “Testar e ver os modelos” e escolha um modelo.', false); return; }
              dados.geracao = { provedor:'auto', url:q('#c-gurl').value, modelo:q('#c-gmod').value.trim() };
              if(gchave) dados.geracao.chave = gchave;
            }
            var chave = q('#c-chave').value.trim();
            if(chave) dados.chave = chave;
            q('#c-salvar').disabled = true;
            msg(chave ? 'Verificando a chave…' : 'Salvando…', true);
            api.salvarConfig(dados).then(function(){ fechar(); U.aviso('Configurações salvas'); window.Tutor.status(true); if(!atual) inicio(); })
              .catch(function(e){ q('#c-salvar').disabled = false; msg(e.message, false); });
          };
        });
    });
  }

  /* Sempre começa pela escolha da matéria; cada cartão mostra onde parou.
     Com mais de um perfil no computador, antes pergunta quem vai estudar. */
  Perfis.iniciar(inicio);

  window.addEventListener('beforeunload', function(){ if(atual) atual.salvarAgora(); });
})();
