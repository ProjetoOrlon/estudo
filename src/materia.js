/* Tela de uma matéria: as abas de estudo (mapa visual, aulas, simulado,
   discursivas, atividades, fórmulas, conteúdos) e a aba Gerenciar.
   O comportamento segue o protótipo (prototipo/estudo.html); o que muda é que
   o progresso vai para o disco e tudo é parametrizado pela matéria. */
(function(){
  "use strict";
  var esc = U.esc, dois = U.dois;

  var ABAS = [
    ['hoje','☀ Hoje'], ['vis','Mapa visual'], ['mapa','Aulas'], ['cards','Flashcards'], ['sim','Simulado'],
    ['disc','Discursivas'], ['ativ','Atividades'], ['form','Fórmulas'], ['arq','Conteúdos'], ['ger','⚙']
  ];
  var ROTULO_ATIV = { caso:'Estudo de caso', sala:'Atividade em sala', aval:'Avaliação' };
  var INTERVALOS = [1, 3, 7, 15, 30];   /* dias até rever uma questão, por acerto seguido */
  var CARD_INT = [0, 1, 3, 7, 15, 30, 60];   /* dias até rever um flashcard, por caixa */
  var NOVOS_POR_DIA = 15;                    /* flashcards novos apresentados por dia */
  var SESSOES = { rev:1, err:1, treino:1, prova:1 };   /* filtros do simulado com respostas próprias */
  var CACHE_PDF = {};   /* texto dos PDFs por matéria, para a busca */
  var CORES = ['#8FD0E8','#B3B1E3','#8AD0AE','#FBD24E','#F5A9C4','#F7B267','#F08A7E','#9FD8C8'];

  function Materia(opts){
    var raiz = opts.raiz;
    var M, P, qs;                 /* matéria, progresso, questões preparadas */
    var aba, gerando = opts.gerando || null, bannerFechado = false;
    var timerSalvar = null, desmontado = false;

    /* estado de tela que não precisa ir para o disco */
    var detalhe = true, aulasAbertas = {}, dAbertas = {}, guiaAberta = {};
    var sessao = null;            /* respostas das filtragens "revisar" e "erradas" */
    var provaInicio = null, provaTimer = null, historicoMarcado = {};
    var renderToken = 0, arqAberto = null, arqPagina = null, textoPaginas = {};
    var cards = [], filaCards = null, cardVirado = false, cardsAula = 'todas';

    /* ── dados ─────────────────────────────────────────── */
    function carregar(materia, progresso){
      M = materia;
      P = progresso || {};
      P.ultimo = P.ultimo || { aba:'hoje', mapa:0 };
      P.cards = P.cards || {};
      /* questões e cartões que o aluno marcou como “com erro” (a IA às vezes erra):
         'q:<id>' / 'c:<id>' → { em, t }. Somem do estudo; dá para restaurar em Gerenciar. */
      P.ocultas = P.ocultas || {};
      P.diario = P.diario || {};
      P.discAval = P.discAval || {};
      P.discIA = P.discIA || {};
      cards = montarCards().filter(function(c){ return !P.ocultas['c:' + c.id]; });
      P.simulado = P.simulado || {};
      var S = P.simulado;
      S.respostas = S.respostas || {};
      S.modo = S.modo || 'estudo';
      S.vista = S.vista || 'uma';
      S.filtro = S.filtro || 'all';
      S.pos = S.pos || 0;
      P.revisao = P.revisao || {};
      P.atividades = P.atividades || {};
      P.discursivas = P.discursivas || {};
      P.historico = P.historico || [];
      if(SESSOES[S.filtro]) S.filtro = 'all';
      if(S.filtro === 'ar') S.filtro = 'n2';
      /* os blocos mudaram (ex.: viraram capítulos do livro): o filtro antigo não existe mais */
      if(/^[bc]\d+$/.test(S.filtro) && !M.blocos.some(function(b){ return b.id === S.filtro; })) S.filtro = 'all';

      /* Rodadas: a 1ª é M.questoes; as seguintes (reformuladas) vêm de
         M.rodadas e são liberadas pelo botão “Atualizar questões” depois que
         o aluno faz os três níveis. Cada rodada tem ids próprios, então o
         progresso de uma não se mistura com o da outra. */
      M.questoesR1 = M.questoesR1 || M.questoes;
      M.rodadas = M.rodadas || [];
      P.rodada = P.rodada || 1;
      var ativa = P.rodada === 1 ? null : M.rodadas.filter(function(r){ return r.n === P.rodada; })[0];
      if(!ativa) P.rodada = 1;
      M.questoes = ativa ? ativa.questoes : M.questoesR1;
      /* questões já feitas em qualquer modo — é o que conta para completar um nível */
      P.feitas = P.feitas || {};
      Object.keys(S.respostas).forEach(function(k){ P.feitas[k] = 1; });

      /* A posição da resposta certa vem do hash do id da questão: espalha o
         gabarito por A–E e continua a mesma entre sessões. Os distratores
         mantêm a ordem original. A resposta salva é o índice ORIGINAL. */
      qs = M.questoes.filter(function(q){ return !P.ocultas['q:' + q.id]; }).map(function(q){
        /* asserção-razão: as 5 opções têm ordem fixa (padrão ENADE) */
        if(q.t === 'ar') return { q:q, id:q.id, _o:q.o.slice(), _orig:[0,1,2,3,4], _c:q.c };
        var alvo = U.hash(String(q.id)) % 5, out = new Array(5), orig = new Array(5), k = 0;
        var resto = [];
        q.o.forEach(function(_, j){ if(j !== q.c) resto.push(j); });
        out[alvo] = q.o[q.c]; orig[alvo] = q.c;
        for(var s=0; s<5; s++){ if(s !== alvo){ orig[s] = resto[k]; out[s] = q.o[resto[k]]; k++; } }
        return { q:q, id:q.id, _o:out, _orig:orig, _c:alvo };
      });
    }
    carregar(opts.materia, opts.progresso);

    function salvar(){
      clearTimeout(timerSalvar);
      timerSalvar = setTimeout(function(){ opts.aoSalvar(M.id, P); }, 350);
    }
    function salvarJa(){ clearTimeout(timerSalvar); opts.aoSalvar(M.id, P); }

    function blocoDaAula(n){
      for(var i=0;i<M.aulas.length;i++){ if(M.aulas[i].n === n) return M.aulas[i].bloco; }
      return null;
    }
    function vazio(){ return !M.aulas.length; }
    function devidas(){
      var h = U.hoje();
      return qs.filter(function(x){ var r = P.revisao[x.id]; return r && r.proxima <= h; });
    }
    function erradas(){
      return qs.filter(function(x){ var r = P.simulado.respostas[x.id]; return r !== undefined && r !== x.q.c; });
    }

    /* Atividade do dia: vai para o progresso da matéria (aba Hoje) e para o
       diário geral (sequência de dias e meta, na tela inicial). */
    function registrar(tipo, n){
      var h = U.hoje();
      var d = P.diario[h] = P.diario[h] || { min:0, q:0, cards:0, novos:0, mapas:[] };
      d[tipo] = (d[tipo] || 0) + n;
      salvar();
      if(tipo !== 'novos') window.api.diario.registrar(tipo, n).catch(function(){});
    }
    function hojeDiario(){ return P.diario[U.hoje()] || { min:0, q:0, cards:0, novos:0, mapas:[] }; }

    /* Flashcards derivados do próprio conteúdo: cada folha de mapa com
       detalhe, cada fórmula e cada pegadinha. O id é estável enquanto o
       conteúdo não muda. */
    /* Um cartão por folha do mapa. M.flashcards (escrito à mão, por id) troca a
       frente/verso por uma pergunta e uma resposta completas; null tira o
       cartão. Sem isso, a frente vira um pedido com o assunto, para não ficar
       solta (“Lamport” → “Em Relógios lógicos: explique Lamport.”). O id é o
       mesmo nos dois casos, então o progresso não se perde. */
    function montarCards(){
      var l = [], FC = M.flashcards || {};
      M.mapas.forEach(function(m){
        if(m.n === 0) return;
        (m.ramos || []).forEach(function(r, ri){
          if(/refer[êe]ncias|bibliogr/i.test(r.t)) return;   /* lista de livros não é coisa de decorar */
          (r.f || []).forEach(function(f, fi){
            if(typeof f === 'string' || !f.d) return;
            var id = 'm'+m.n+'-'+ri+'-'+fi, e = FC[id];
            if(e === null) return;
            l.push(e ? { id:id, aula:m.n, ctx:'Aula '+m.n+' · '+r.t, frente:e[0], verso:e[1] }
              : { id:id, aula:m.n, ctx:'Aula '+m.n+' · '+r.t, frente:'Em “'+r.t+'”: explique “'+f.t+'”.', verso:f.t+' — '+f.d });
          });
        });
      });
      M.aulas.forEach(function(a){
        if(a.pegadinha) l.push({ id:'p'+a.n, aula:a.n, ctx:'Aula '+a.n+' · pegadinha', frente:'Qual é a pegadinha de “'+a.titulo+'”?', verso:a.pegadinha });
      });
      M.formulas.forEach(function(g, gi){
        (g.its || []).forEach(function(it, ii){
          l.push({ id:'f'+gi+'-'+ii, aula:null, ctx:g.g, frente:it.k, verso:it.v + (it.n ? '\n' + it.n : '') });
        });
      });
      return l;
    }
    function cardsDevidos(){
      var h = U.hoje();
      return cards.filter(function(c){ var s = P.cards[c.id]; return s && s.prox <= h; });
    }
    function cardsNovosHoje(){
      var resta = Math.max(0, NOVOS_POR_DIA - (hojeDiario().novos || 0));
      return cards.filter(function(c){ return !P.cards[c.id]; }).slice(0, resta);
    }

    /* ── moldura ───────────────────────────────────────── */
    raiz.innerHTML =
      '<header class="top"><div class="wrap top-in">' +
        '<button class="voltar" id="m-voltar" title="Voltar para a lista de matérias">← Matérias</button>' +
        '<div class="troca"><button id="m-troca" aria-haspopup="true" aria-expanded="false"></button><div class="menu" id="m-menu" hidden></div></div>' +
        '<nav class="tabs" role="tablist" id="m-tabs">' +
          ABAS.map(function(a){ return '<button role="tab" data-aba="'+a[0]+'" aria-selected="false">'+a[1]+'</button>'; }).join('') +
        '</nav>' +
        '<div class="top-acts">' +
          /* “Criar resumo” bem à vista: no topo de toda matéria */
          '<button class="btn bt-resumo" id="m-resumo" title="Resumo com os pontos principais de qualquer material: PDF, slides, Word, fotos…">📝 Criar resumo</button>' +
          '<button class="icon-btn mascote-btn" id="m-tutor" title="'+Mascote.nome+', sua tutora — tire dúvidas sobre a matéria (Ctrl+Shift+A)" aria-label="'+Mascote.nome+', tutora de IA">' + Mascote.avatar(34) + '</button>' +
          '<button class="icon-btn" id="m-busca" title="Buscar em toda a matéria (Ctrl+K)" aria-label="Buscar">🔍</button>' +
          '<button class="icon-btn" id="m-foco" title="Modo foco com Pomodoro (Ctrl+Shift+F)" aria-label="Modo foco">⏱</button>' +
          '<button class="theme-btn" id="m-tema" title="Alternar tema claro/escuro" aria-label="Alternar tema">◐</button></div>' +
      '</div></header>' +
      '<main class="wrap"><div id="m-banner"></div><div id="m-painel"></div><footer class="foot" id="m-foot"></footer></main>';

    var $ = function(s){ return raiz.querySelector(s); };
    var painel = $('#m-painel');

    /* Filtro por bloco. Um livro com dezenas de capítulos vira uma lista de
       escolher, em vez de dezenas de botões. attr = o data-* que o clique já trata. */
    function capitulos(){ return M.blocos.some(function(b){ return /^c\d+$/.test(b.id); }); }
    function filtroDeBlocos(attr, atual, todos){
      if(M.blocos.length <= 8) return '<button class="chip" data-'+attr+'="all" aria-pressed="'+(atual==='all')+'">'+todos+'</button>' +
        M.blocos.map(function(b){ return '<button class="chip" data-'+attr+'="'+b.id+'" aria-pressed="'+(atual===b.id)+'">'+esc(b.nome)+'</button>'; }).join('');
      var dentro = M.blocos.some(function(b){ return b.id === atual; });
      return '<select class="sel-blocos'+(dentro ? ' on' : '')+'" data-sel="'+attr+'" title="Escolher '+(capitulos() ? 'o capítulo' : 'o bloco')+'">' +
        '<option value="all">'+(capitulos() ? 'Todos os capítulos ('+M.blocos.length+')' : todos)+'</option>' +
        M.blocos.map(function(b){ return '<option value="'+b.id+'"'+(atual===b.id?' selected':'')+'>'+esc(b.nome)+(b.resumo && capitulos() ? ' · '+esc(b.resumo) : '')+'</option>'; }).join('') + '</select>';
    }
    /* escolher na lista = clicar no botão equivalente (reaproveita o tratamento de cada aba) */
    painel.addEventListener('change', function(ev){
      var s = ev.target.closest('select.sel-blocos'); if(!s) return;
      var b = document.createElement('button');
      b.className = 'chip'; b.hidden = true; b.setAttribute('data-' + s.dataset.sel, s.value);
      painel.appendChild(b); b.click(); b.remove();
    });

    /* altura do cabeçalho fixo, para o que rola parar logo abaixo dele */
    function medirTopo(){ var t = $('.top'); if(t) document.documentElement.style.setProperty('--topo', t.offsetHeight + 'px'); }
    window.addEventListener('resize', medirTopo);

    function cabecalho(){
      $('#m-troca').innerHTML = '<b>'+esc(M.nome)+'</b><span>'+esc((M.subtitulo ? M.subtitulo + ' · ' : '') + M.aulas.length + ' aulas')+'</span><i>▼</i>';
      $('#m-foot').innerHTML = (M.textos && M.textos.rodape || []).map(function(p){ return '<p>'+esc(p)+'</p>'; }).join('');
    }
    cabecalho();

    $('#m-voltar').addEventListener('click', function(){ salvarJa(); opts.aoVoltar(); });
    $('#m-tema').addEventListener('click', U.alternarTema);
    $('#m-busca').addEventListener('click', function(){ abrirBusca(); });
    $('#m-tutor').addEventListener('click', function(){ if(window.Tutor) Tutor.abrir(contextoAtual()); });
    $('#m-resumo').addEventListener('click', criarResumo);
    function criarResumo(){
      Resumo.criar(M, function(r){ opts.aoRecarregar().then(function(){ irPara('arq'); Resumo.ver(M, r, function(){ opts.aoRecarregar().then(function(){ irPara('arq'); }); }); }); });
    }
    if(window.Tutor) Tutor.definirMateria(function(){ return contextoAtual(); });
    $('#m-foco').addEventListener('click', function(){ if(window.Foco) Foco.alternar(); });
    $('#m-tabs').addEventListener('click', function(ev){
      var b = ev.target.closest('button[data-aba]'); if(b) irPara(b.dataset.aba);
    });

    /* troca rápida de matéria */
    var menu = $('#m-menu');
    $('#m-troca').addEventListener('click', function(ev){
      ev.stopPropagation();
      if(!menu.hidden){ menu.hidden = true; return; }
      var lista = opts.lista() || [];
      menu.innerHTML = lista.map(function(x){
        return '<button data-id="'+esc(x.id)+'"'+(x.id===M.id?' aria-current="true"':'')+'><span class="dot" style="background:'+esc(x.cor)+'"></span>'+esc(x.nome)+
          (x.revisarHoje ? '<small>'+x.revisarHoje+' p/ revisar</small>' : '')+'</button>';
      }).join('') + '<hr><button data-acao="todas">Todas as matérias</button><button data-acao="nova">+ Nova matéria</button>' +
        '<button data-acao="excluir" class="perigo">🗑 Excluir esta matéria…</button>';
      menu.hidden = false;
      $('#m-troca').setAttribute('aria-expanded','true');
    });
    menu.addEventListener('click', function(ev){
      var b = ev.target.closest('button'); if(!b) return;
      menu.hidden = true;
      salvarJa();
      if(b.dataset.id && b.dataset.id !== M.id) opts.aoTrocar(b.dataset.id);
      else if(b.dataset.acao === 'todas') opts.aoVoltar();
      else if(b.dataset.acao === 'nova') opts.aoNova();
      else if(b.dataset.acao === 'excluir' && window.excluirMateriaPorId) window.excluirMateriaPorId(M.id, opts.aoVoltar);
    });
    function fecharMenu(){ if(!menu.hidden){ menu.hidden = true; $('#m-troca').setAttribute('aria-expanded','false'); } }
    document.addEventListener('click', fecharMenu);

    /* teclado: ←/→ nos mapas; A–E/1–5 e ←/→ no simulado de uma questão */
    function tecla(ev){
      if((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'k'){ ev.preventDefault(); abrirBusca(); return; }
      if(ev.target.closest('input, textarea, select') || document.querySelector('.modal-fundo')) return;
      if(ev.ctrlKey || ev.altKey || ev.metaKey) return;
      if(aba === 'cards' && filaCards && filaCards.length){
        if(ev.key === ' ' || ev.key === 'Enter'){ ev.preventDefault(); if(!cardVirado){ cardVirado = true; desenhaCard(); } }
        else if(cardVirado && '123'.indexOf(ev.key) >= 0){ ev.preventDefault(); avaliarCard(+ev.key); }
        return;
      }
      if(aba === 'arq' && arqAberto){
        var k = ev.key.toLowerCase();
        if(k === 'm'){ ev.preventDefault(); ligarCaneta(!P.caneta); return; }
        if(k === 'b'){ ev.preventDefault(); alternarMarcador(); return; }
        if(k === 'o'){ ev.preventDefault(); alternarOcultas(); return; }
        if(k === 't'){ ev.preventDefault(); escolherFerramenta(P.ferramenta === 'texto' ? null : 'texto'); return; }
      }
      if(aba === 'vis'){
        if(ev.key === 'ArrowLeft') mudaMapa(-1);
        else if(ev.key === 'ArrowRight') mudaMapa(1);
        else if(ev.key === 'e' || ev.key === 'E') setDetalhe(!detalhe);
        else if(ev.key === '+' || ev.key === '='){ ev.preventDefault(); aplicarZoom(zoomMapa * 1.25); }
        else if(ev.key === '-' || ev.key === '_'){ ev.preventDefault(); aplicarZoom(zoomMapa / 1.25); }
        else if(ev.key === '0'){ aplicarZoom(1); centralizarMapa(); }
        else if(ev.key === 'f' || ev.key === 'F') alternarCheio();
        else if(ev.key === 'Escape' && mapaCheio) alternarCheio(false);
      } else if(aba === 'sim' && P.simulado.vista === 'uma'){
        var lista = visiveis();
        if(ev.key === 'ArrowLeft'){ irQuestao(P.simulado.pos - 1); ev.preventDefault(); }
        else if(ev.key === 'ArrowRight' || ev.key === 'Enter'){ irQuestao(P.simulado.pos + 1); ev.preventDefault(); }
        else {
          var idx = 'abcde'.indexOf(ev.key.toLowerCase());
          if(idx < 0) idx = '12345'.indexOf(ev.key);
          var x = lista[P.simulado.pos];
          if(idx >= 0 && x) responder(x, idx);
        }
      }
    }
    document.addEventListener('keydown', tecla);

    function irPara(a){
      if(!ABAS.some(function(x){ return x[0] === a; })) a = 'hoje';
      if(mapaCheio) alternarCheio(false);
      aba = a;
      P.ultimo.aba = a; salvar();
      Array.prototype.forEach.call(raiz.querySelectorAll('#m-tabs button'), function(b){
        b.setAttribute('aria-selected', b.dataset.aba === a ? 'true' : 'false');
      });
      renderToken++;
      clearInterval(provaTimer);
      esconderBotaoTrecho();
      painel.onclick = null; painel.oninput = null; painel.onchange = null;
      ({ hoje:renderHoje, vis:renderVis, mapa:renderMapa, cards:renderCards, sim:renderSim, disc:renderDisc, ativ:renderAtiv, form:renderForm, arq:renderArq, ger:renderGer })[a]();
      renderBanner();
      window.scrollTo(0, 0); raiz.scrollTop = 0;   /* raiz rola sozinha na tela dividida */
    }

    function hero(eyebrow, titulo, texto, kpis){
      return '<div class="hero"><p class="eyebrow">'+eyebrow+'</p><h1>'+titulo+'</h1>' + (texto ? '<p>'+texto+'</p>' : '') +
        (kpis ? '<div class="kpis">' + kpis.map(function(k){
          return '<div class="kpi'+(k[2]?' alerta':'')+'"><b>'+k[0]+'</b><span>'+k[1]+'</span></div>';
        }).join('') + '</div>' : '') + '</div>';
    }
    function semConteudo(){
      var pend = (M.fontes || []).filter(function(f){ return f.status !== 'gerada'; }).length;
      return '<div class="empty"><b>Esta matéria ainda não tem conteúdo de estudo.</b>' +
        (pend ? pend + ' aula(s) esperando para serem geradas com IA.' : 'Adicione os slides das aulas para começar.') +
        '<br><button class="btn" data-ir="ger">Ir para Gerenciar</button></div>';
    }
    painel.addEventListener('click', function(ev){
      var b = ev.target.closest('[data-ir]'); if(b){ irPara(b.dataset.ir); }
    });

    /* ── faixa de geração ──────────────────────────────── */
    function renderBanner(){
      var el = $('#m-banner');
      if(!gerando || bannerFechado){ el.innerHTML = ''; return; }
      var g = gerando;
      var ativo = g.fase === 'aulas' || g.fase === 'geral' || g.fase === 'importando';
      var cls = g.fase === 'erro' ? ' erro' : (g.fase === 'fim' && !(g.erros && g.erros.length) ? ' ok' : '');
      var imp = g.fase === 'importando';
      var titulo = { aulas:'Gerando com IA', geral:'Montando a visão geral', importando:'Importando arquivos', fim:'Concluído', erro:'A geração parou', cancelada:'Cancelado' }[g.fase] || 'Geração';
      var feitos = g.feitos != null ? g.feitos : (g.feitas || 0);
      var pct = g.total ? Math.round(feitos / g.total * 100) : 0;
      /* gerando com IA: relógio com a mascote e o tempo que falta */
      if(ativo && !imp && g.relogio && window.RelogioIA){
        el.innerHTML = '<div class="banner banner-relogio">' + RelogioIA.html(g) + '<button class="ghost" id="b-cancelar">Cancelar</button></div>';
        RelogioIA.ligar(el);
        el.querySelector('#b-cancelar').onclick = function(){ window.api.cancelarGeracao(M.id); this.disabled = true; this.textContent = 'Cancelando…'; };
        return;
      }
      el.innerHTML = '<div class="banner'+cls+'">' + (ativo ? '<span class="spin"></span>' : '') +
        '<div class="txt"><b>'+titulo+(g.total && (g.fase === 'aulas' || imp) ? ' · '+(imp ? Math.min(feitos + 1, g.total) : feitos)+' de '+g.total+(imp ? ' arquivos' : ' aulas') : '')+'</b>'+esc(g.msg || '')+
        (g.custo ? ' <span style="color:var(--ink-3)">· custo até agora ≈ '+U.moeda(g.custo)+'</span>' : '')+'</div>' +
        (ativo && g.total ? '<div class="meter"><i style="width:'+pct+'%"></i></div>' : '') +
        (ativo ? '<button class="ghost" id="b-cancelar">'+(imp ? 'Cancelar importação' : 'Cancelar')+'</button>' : '<button class="ghost" id="b-fechar">Fechar</button>') +
      '</div>';
      var c = el.querySelector('#b-cancelar');
      if(c) c.onclick = function(){
        if(imp) window.api.cancelarImportacao(M.id); else window.api.cancelarGeracao(M.id);
        c.disabled = true; c.textContent = 'Cancelando…';
      };
      var f = el.querySelector('#b-fechar');
      if(f) f.onclick = function(){ bannerFechado = true; renderBanner(); };
    }

    /* ══════════ HOJE ══════════ */
    /* Bloco para treinar: primeiro o que ainda não foi praticado (na ordem da
       matéria), depois o de menor aproveitamento. */
    function blocoMaisFraco(){
      var stats = M.blocos.map(function(b){
        var l = qs.filter(function(x){ return blocoDaAula(x.q.a) === b.id; });
        var resp = 0, ok = 0;
        l.forEach(function(x){ var r = P.simulado.respostas[x.id]; if(r !== undefined){ resp++; if(r === x.q.c) ok++; } });
        return { b:b, total:l.length, resp:resp, pct: resp ? ok/resp : null };
      }).filter(function(s){ return s.total; });
      var novo = stats.filter(function(s){ return s.resp < 3; })[0];
      if(novo) return novo;
      return stats.sort(function(a, b){ return a.pct - b.pct; })[0] || null;
    }
    function aulaSugerida(fraco){
      var vistos = hojeDiario().mapas || [];
      var aulas = M.aulas.filter(function(a){ return !fraco || a.bloco === fraco.b.id; });
      var comMapa = aulas.filter(function(a){ return M.mapas.some(function(m){ return m.n === a.n; }); });
      var naoVista = comMapa.filter(function(a){ return vistos.indexOf(a.n) < 0; });
      /* dentro do bloco, a aula com mais erros primeiro */
      function erros(a){ return qs.filter(function(x){ var r = P.simulado.respostas[x.id]; return x.q.a === a.n && r !== undefined && r !== x.q.c; }).length; }
      var l = (naoVista.length ? naoVista : comMapa).slice().sort(function(a, b){ return erros(b) - erros(a); });
      return l[0] || null;
    }
    function listaTreino(bloco){
      var l = qs.filter(function(x){ return blocoDaAula(x.q.a) === bloco; });
      var nao = l.filter(function(x){ return P.simulado.respostas[x.id] === undefined; });
      var errou = l.filter(function(x){ var r = P.simulado.respostas[x.id]; return r !== undefined && r !== x.q.c; });
      return embaralhar(nao).concat(embaralhar(errou)).concat(embaralhar(l)).filter(function(x, i, arr){ return arr.indexOf(x) === i; }).slice(0, 10);
    }
    function embaralhar(l){
      var a = l.slice();
      for(var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    function iniciarSessao(tipo, lista, extra){
      sessao = Object.assign({ tipo:tipo, lista:lista, resp:{} }, extra || {});
      P.simulado.filtro = tipo; P.simulado.pos = 0; P.simulado.vista = 'uma';
      salvar(); irPara('sim');
    }

    function renderHoje(){
      if(vazio()){ painel.innerHTML = hero('Plano de hoje', 'Por onde começar') + semConteudo(); return; }
      var d = hojeDiario(), nd = devidas().length, ncd = cardsDevidos().length, ncn = cardsNovosHoje().length;
      var fraco = blocoMaisFraco(), aula = aulaSugerida(fraco);
      var disc = M.discursivas.filter(function(x){ return !P.discursivas[x.n]; })[0] || M.discursivas[0];
      var passos = [];
      passos.push(nd
        ? { feito:false, t:'Revisar '+nd+' questão(ões) do dia', d:'São as que você errou e que voltaram agora. Revisar no dia certo é o que fixa.', b:'Revisar agora', a:'rev' }
        : { feito:true, t:'Revisões em dia', d:'Nenhuma questão para revisar hoje.' });
      passos.push((ncd + ncn)
        ? { feito:false, t:'Flashcards: '+ncd+' para revisar'+(ncn ? ' e '+ncn+' novos' : ''), d:'Um cartão por vez: lembre, vire e avalie.', b:'Abrir flashcards', a:'cards' }
        : { feito:true, t:'Flashcards em dia', d:'Os próximos voltam nos dias certos.' });
      if(aula) passos.push({ feito:(d.mapas || []).indexOf(aula.n) >= 0, t:'Mapa mental: Aula '+aula.n, d:aula.titulo, b:'Ver o mapa', a:'mapa', n:aula.n });
      if(fraco) passos.push({ feito:(d.q || 0) >= 10, t:'10 questões de '+fraco.b.nome, d: fraco.resp < 3 ? 'Bloco ainda pouco praticado.' : 'Seu bloco com menor aproveitamento: '+Math.round(fraco.pct*100)+'%.', b:'Começar treino', a:'treino', bloco:fraco.b.id });
      if(disc) passos.push({ feito:!!d.disc, t:'Uma discursiva', d:'Questão '+disc.n+' · '+disc.tema, b:'Escrever', a:'disc', n:disc.n });
      var feitos = passos.filter(function(p){ return p.feito; }).length;
      var data = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });

      painel.innerHTML = hero('Plano de hoje · ' + esc(data), feitos === passos.length ? 'Tudo feito hoje! 🎉' : 'Um passo de cada vez',
        'Faça na ordem. Cada passo é curto — ao terminar, volte aqui e siga para o próximo. Se quiser, ligue o <strong>⏱ modo foco</strong> antes de começar.') +
        '<div class="meta-dia" id="h-meta"><p class="visor-msg">…</p></div>' +
        '<ol class="passos">' + passos.map(function(p, i){
          return '<li class="passo'+(p.feito?' feito':'')+'"><span class="passo-n">'+(p.feito?'✓':(i+1))+'</span>' +
            '<div class="passo-t"><b>'+esc(p.t)+'</b><span>'+esc(p.d)+'</span></div>' +
            (p.b && !p.feito ? '<button class="btn" data-acao="'+p.a+'"'+(p.n!=null?' data-n="'+p.n+'"':'')+(p.bloco?' data-bloco="'+p.bloco+'"':'')+'>'+p.b+'</button>' : '') +
            (p.b && p.feito ? '<button class="ghost" data-acao="'+p.a+'"'+(p.n!=null?' data-n="'+p.n+'"':'')+(p.bloco?' data-bloco="'+p.bloco+'"':'')+'>De novo</button>' : '') +
          '</li>';
        }).join('') + '</ol>' +
        '<div class="linha-acts"><button class="ghost" data-acao="foco">⏱ Começar 25 min de foco</button><button class="ghost" data-acao="prova">Fazer uma prova simulada</button></div>';

      painel.onclick = function(ev){
        var b = ev.target.closest('[data-acao]'); if(!b) return;
        var a = b.dataset.acao;
        if(a === 'rev') iniciarSessao('rev', devidas());
        else if(a === 'cards'){ filaCards = null; cardsAula = 'todas'; irPara('cards'); }
        else if(a === 'mapa'){ var i = M.mapas.findIndex(function(m){ return m.n === +b.dataset.n; }); if(i >= 0) P.ultimo.mapa = i; irPara('vis'); }
        else if(a === 'treino'){ var bl = M.blocos.find(function(x){ return x.id === b.dataset.bloco; }); iniciarSessao('treino', listaTreino(b.dataset.bloco), { rotulo:'Treino: ' + (bl ? bl.nome : '') }); }
        else if(a === 'disc'){ dAbertas = {}; irPara('disc'); rolarPara('[data-disc="'+b.dataset.n+'"]'); }
        else if(a === 'foco'){ if(window.Foco) Foco.iniciar(); }
        else if(a === 'prova'){ irPara('sim'); abrirProva(); }
      };

      window.api.diario.obter().then(function(g){
        var el = $('#h-meta'); if(!el || aba !== 'hoje') return;
        var pct = Math.min(100, Math.round(g.hoje.min / g.meta * 100));
        el.innerHTML = '<div class="meta-l"><span class="fogo">🔥</span><div><b>'+g.sequencia+' dia'+(g.sequencia===1?'':'s')+' seguido'+(g.sequencia===1?'':'s')+'</b>' +
          '<span>'+(g.sequencia ? 'Estude hoje para não quebrar a sequência.' : 'Estude hoje para começar uma sequência.')+'</span></div></div>' +
          '<div class="meta-r"><div class="meta-num"><b>'+g.hoje.min+'</b> de '+g.meta+' min de foco · <b>'+g.hoje.q+'</b> questões · <b>'+g.hoje.cards+'</b> cards</div>' +
          '<div class="meter"><i style="width:'+pct+'%"></i></div></div>';
      }).catch(function(){});
    }
    function rolarPara(sel){
      setTimeout(function(){ var el = raiz.querySelector(sel); if(el) el.scrollIntoView({ behavior:'smooth', block:'start' }); }, 60);
    }

    /* ══════════ FLASHCARDS ══════════ */
    function renderCards(){
      if(!cards.length){ painel.innerHTML = hero('Memória · flashcards','Flashcards') + (vazio() ? semConteudo() : '<div class="empty">Esta matéria ainda não tem mapas ou fórmulas para virar cartão.</div>'); return; }
      var nd = cardsDevidos().length, nn = cardsNovosHoje().length, vistos = Object.keys(P.cards).length;
      painel.innerHTML = hero('Memória · flashcards', 'Flashcards',
        'Leia a frente e tente lembrar <strong>antes</strong> de virar (<span class="kbd">espaço</span>). Depois avalie: <span class="kbd">1</span> não lembrei · <span class="kbd">2</span> lembrei com esforço · <span class="kbd">3</span> fácil. Os cartões voltam em 1, 3, 7, 15, 30 e 60 dias.',
        [[nd,'para revisar hoje', nd > 0],[nn,'novos hoje'],[vistos+' / '+cards.length,'já estudados']]) +
        '<div class="bar"><button class="chip" data-modo="hoje" aria-pressed="'+(cardsAula==='todas')+'">Revisão de hoje</button><span class="sep"></span>' +
        '<label class="sel-aula">Estudar só: <select id="c-aula"><option value="">escolha…</option>' +
          M.aulas.filter(function(a){ return cards.some(function(c){ return c.aula === a.n; }); }).map(function(a){ return '<option value="'+a.n+'"'+(String(a.n)===cardsAula?' selected':'')+'>Aula '+a.n+' — '+esc(a.titulo)+'</option>'; }).join('') +
          (cards.some(function(c){ return c.aula === null; }) ? '<option value="f"'+(cardsAula==='f'?' selected':'')+'>Fórmulas e listas</option>' : '') +
        '</select></label></div><div id="card"></div>';
      if(!filaCards) montarFila();
      painel.onclick = function(ev){
        var t = ev.target;
        if(t.closest('[data-modo="hoje"]')){ cardsAula = 'todas'; montarFila(); renderCards(); return; }
        if(t.closest('#c-virar')){ cardVirado = true; desenhaCard(); return; }
        var av = t.closest('[data-nota]'); if(av){ avaliarCard(+av.dataset.nota); return; }
        if(t.closest('#c-erro')){
          var c = filaCards[0]; if(!c) return;
          U.confirmar('Esconder este cartão?', 'A pergunta ou a resposta está errada? O cartão sai dos flashcards. Dá para trazer de volta em ⚙ Gerenciar.', 'Esconder').then(function(ok){
            if(!ok) return;
            P.ocultas['c:' + c.id] = { em: U.hoje(), t: String(c.frente).slice(0, 140) };
            cards = cards.filter(function(x){ return x.id !== c.id; });
            filaCards.shift(); cardVirado = false; salvarJa(); desenhaCard();
            U.aviso('Cartão escondido. Obrigado por avisar!', 3000);
          });
        }
      };
      $('#c-aula').onchange = function(ev){ if(!ev.target.value) return; cardsAula = ev.target.value; montarFila(); renderCards(); };
      desenhaCard();
    }
    function montarFila(){
      cardVirado = false;
      if(cardsAula === 'todas') filaCards = cardsDevidos().concat(cardsNovosHoje());
      else filaCards = cards.filter(function(c){ return cardsAula === 'f' ? c.aula === null : String(c.aula) === cardsAula; });
    }
    function desenhaCard(){
      var el = $('#card'); if(!el) return;
      if(!filaCards.length){
        el.innerHTML = '<div class="empty"><b>'+(cardsAula === 'todas' ? 'Flashcards de hoje concluídos! 🎉' : 'Você passou por todos os cartões desta aula.')+'</b>' +
          'Os cartões voltam sozinhos nos dias certos. Se quiser mais, escolha uma aula acima.</div>';
        return;
      }
      var c = filaCards[0], novo = !P.cards[c.id];
      el.innerHTML = '<div class="flash'+(cardVirado?' virado':'')+'">' +
        '<div class="flash-top"><span class="pill">'+esc(c.ctx)+'</span>'+(novo?'<span class="pill extra">novo</span>':'')+'<span class="flash-cont">'+filaCards.length+' restante'+(filaCards.length===1?'':'s')+'</span>' +
          '<button class="flash-erro" id="c-erro" title="Cartão com erro? Ele sai dos flashcards." aria-label="Cartão com erro">⚠</button></div>' +
        '<div class="flash-frente">'+esc(c.frente)+'</div>' +
        (cardVirado
          ? '<div class="flash-verso">'+String(c.verso).split('\n').map(function(l){ return '<p>'+esc(l)+'</p>'; }).join('')+'</div>' +
            '<div class="flash-acts"><button class="nota n1" data-nota="1">1 · Não lembrei</button><button class="nota n2" data-nota="2">2 · Com esforço</button><button class="nota n3" data-nota="3">3 · Fácil</button></div>'
          : '<div class="flash-acts"><button class="btn" id="c-virar">Mostrar resposta</button><span class="hint-k">ou aperte espaço</span></div>') +
        '</div>';
    }
    function avaliarCard(nota){
      var c = filaCards.shift(); if(!c) return;
      var s = P.cards[c.id];
      if(!s){ s = { cx:0 }; registrar('novos', 1); }
      if(nota === 1){ s.cx = 0; s.prox = U.hoje(); filaCards.push(c); }
      else if(nota === 2){ s.cx = Math.max(1, s.cx); s.prox = U.maisDias(CARD_INT[s.cx]); }
      else { s.cx = Math.min(CARD_INT.length - 1, s.cx + (s.cx === 0 ? 2 : 1)); s.prox = U.maisDias(CARD_INT[s.cx]); }
      P.cards[c.id] = s;
      registrar('cards', 1);
      cardVirado = false;
      desenhaCard();
    }

    /* ══════════ MAPA VISUAL ══════════ */
    function mapaIdx(){ return Math.max(0, Math.min(M.mapas.length - 1, P.ultimo.mapa || 0)); }
    function renderVis(){
      if(!M.mapas.length){ painel.innerHTML = hero('Passo 1 · Mapa mental','Um mapa por aula') + semConteudo(); return; }
      painel.innerHTML = hero('Passo 1 · Mapa mental', 'Um mapa por aula',
        'Um mapa de cada vez: a cor e a posição fazem parte da lembrança. Comece pelo <strong>Mapa geral</strong> para ver o terreno todo, depois percorra aula por aula com as setas (ou as teclas <span class="kbd">←</span> <span class="kbd">→</span>). Em <strong>Completo</strong>, cada caixa traz uma segunda linha explicando o termo; em <strong>Essencial</strong>, só as palavras-chave — bom para testar se você lembra sozinho (tecla <span class="kbd">E</span>).',
        [[M.mapas.length,'mapas visuais'],[M.questoes.length,'questões objetivas'],[M.discursivas.length,'discursivas']]) +
        '<div class="bar" id="vis-bar">' + M.mapas.map(function(m,i){
          return '<button class="chip" data-v="'+i+'" aria-pressed="false">'+(m.n === 0 ? 'Mapa geral' : 'Aula ' + m.n)+'</button>';
        }).join('') + '</div>' +
        '<div class="vis-nav"><button class="ghost" id="v-prev">◀ Anterior</button><span class="vis-pos" id="v-pos"></span>' +
          '<button class="ghost" id="v-next">Próximo ▶</button><span class="vis-grow"></span>' +
          '<button class="chip" id="v-ess" aria-pressed="false">Essencial</button><button class="chip" id="v-comp" aria-pressed="true">Completo</button></div>' +
        '<div class="paper" id="paper-box">' +
          '<div class="mapa-ferr">' +
            '<span class="mf-cheio-only"><button class="mf-bt" id="mf-prev" title="Mapa anterior (←)">◀</button><b id="mf-nome"></b>' +
              '<button class="mf-bt" id="mf-next" title="Próximo mapa (→)">▶</button><span class="mf-sep"></span>' +
              '<button class="mf-bt" id="mf-det" title="Essencial / Completo (E)"></button></span>' +
            '<span class="mf-grow"></span>' +
            '<button class="mf-bt" id="mf-menos" title="Diminuir (tecla −)">−</button><span id="mf-pct">100%</span>' +
            '<button class="mf-bt" id="mf-mais" title="Aumentar (tecla +)">+</button>' +
            '<button class="mf-bt" id="mf-ajustar" title="Mapa inteiro na tela (tecla 0)">Ajustar à tela</button>' +
            '<button class="mf-bt mf-tutor mascote-acao" id="mf-tutor" title="A '+Mascote.nome+' explica este mapa">' + Mascote.avatar(20) + Mascote.nome+' explica</button>' +
            '<button class="mf-bt mf-cheio" id="mf-cheio" title="Tela cheia (tecla F)">⛶ Tela cheia</button>' +
          '</div>' +
          '<div class="paper-scroll" id="paper" title="Arraste para mover · Ctrl + rolar ou dois cliques para aproximar"></div></div>';
      painel.onclick = function(ev){
        var c = ev.target.closest('[data-v]'); if(c){ P.ultimo.mapa = +c.dataset.v; salvar(); desenhaMapa(); return; }
        var id = (ev.target.closest('button') || {}).id;
        if(id === 'v-prev' || id === 'mf-prev') mudaMapa(-1);
        if(id === 'v-next' || id === 'mf-next') mudaMapa(1);
        if(id === 'v-ess') setDetalhe(false);
        if(id === 'v-comp') setDetalhe(true);
        if(id === 'mf-det') setDetalhe(!detalhe);
        if(id === 'mf-mais') aplicarZoom(zoomMapa * 1.25);
        if(id === 'mf-menos') aplicarZoom(zoomMapa / 1.25);
        if(id === 'mf-ajustar'){ aplicarZoom(1); centralizarMapa(); }
        if(id === 'mf-cheio') alternarCheio();
        if(id === 'mf-tutor' && window.Tutor){ if(mapaCheio) alternarCheio(false); Tutor.abrir(contextoMapa()); }
      };
      ligarMapaInterativo();
      desenhaMapa();
    }

    /* ── zoom, arrastar e tela cheia do mapa ── */
    var zoomMapa = 1, mapaCheio = false;
    function svgMapa(){ var sc = $('#paper'); return sc && sc.querySelector('svg'); }
    /* largura do mapa em 100%: em tela cheia, cabe inteiro (largura e altura);
       na página, ocupa a largura da coluna */
    function larguraBase(){
      var sc = $('#paper'), svg = svgMapa(); if(!sc || !svg) return 1300;
      var vb = svg.viewBox.baseVal, cw = sc.clientWidth, ch = sc.clientHeight;
      if(mapaCheio) return Math.max(240, Math.min(cw - 24, (ch - 24) * vb.width / vb.height));
      return document.body.classList.contains('dividido') ? cw : Math.max(cw, 940);
    }
    function aplicarZoom(novo, px, py){
      var sc = $('#paper'), svg = svgMapa(); if(!svg) return;
      novo = Math.max(0.5, Math.min(3, novo));
      var r0 = svg.getBoundingClientRect(), s0 = sc.getBoundingClientRect();
      if(px == null){ px = sc.clientWidth / 2; py = sc.clientHeight / 2; }
      /* mantém parado o ponto do mapa que está sob o cursor */
      var rx = (px + s0.left - r0.left) / (r0.width || 1), ry = (py + s0.top - r0.top) / (r0.height || 1);
      zoomMapa = novo;
      svg.style.width = Math.round(larguraBase() * zoomMapa) + 'px';
      $('#paper-box').classList.toggle('ampliado', zoomMapa > 1.001);
      var r1 = svg.getBoundingClientRect(), s1 = sc.getBoundingClientRect();
      sc.scrollLeft += (r1.left - s1.left) + rx * r1.width - px;
      sc.scrollTop += (r1.top - s1.top) + ry * r1.height - py;
      var p = $('#mf-pct'); if(p) p.textContent = Math.round(zoomMapa * 100) + '%';
    }
    function centralizarMapa(){
      var sc = $('#paper'); if(!sc) return;
      sc.scrollLeft = Math.max(0, (sc.scrollWidth - sc.clientWidth) / 2);
      sc.scrollTop = mapaCheio ? Math.max(0, (sc.scrollHeight - sc.clientHeight) / 2) : 0;
    }
    function ligarMapaInterativo(){
      var sc = $('#paper'), arr = null;
      sc.addEventListener('wheel', function(ev){
        if(!ev.ctrlKey) return;
        ev.preventDefault();
        var r = sc.getBoundingClientRect();
        aplicarZoom(zoomMapa * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), ev.clientX - r.left, ev.clientY - r.top);
      }, { passive:false });
      sc.addEventListener('dblclick', function(ev){
        var r = sc.getBoundingClientRect();
        aplicarZoom(zoomMapa * 1.5, ev.clientX - r.left, ev.clientY - r.top);
      });
      sc.addEventListener('pointerdown', function(ev){
        if(ev.button !== 0) return;
        arr = { x:ev.clientX, y:ev.clientY, sl:sc.scrollLeft, st:sc.scrollTop, moveu:false };
        sc.setPointerCapture(ev.pointerId);
      });
      sc.addEventListener('pointermove', function(ev){
        if(!arr) return;
        var dx = ev.clientX - arr.x, dy = ev.clientY - arr.y;
        if(!arr.moveu && Math.abs(dx) + Math.abs(dy) < 4) return;
        arr.moveu = true; sc.classList.add('arrastando');
        sc.scrollLeft = arr.sl - dx; sc.scrollTop = arr.st - dy;
      });
      function soltar(){ arr = null; sc.classList.remove('arrastando'); }
      sc.addEventListener('pointerup', soltar);
      sc.addEventListener('pointercancel', soltar);
    }
    function alternarCheio(v){
      var box = $('#paper-box'); if(!box) return;
      mapaCheio = v === undefined ? !mapaCheio : !!v;
      box.classList.toggle('cheio', mapaCheio);
      document.body.classList.toggle('mapa-cheio', mapaCheio);
      try{
        if(mapaCheio && box.requestFullscreen && !document.fullscreenElement) box.requestFullscreen().catch(function(){});
        else if(!mapaCheio && document.fullscreenElement) document.exitFullscreen().catch(function(){});
      }catch(e){}
      atualizarFerrMapa();
      /* espera o layout novo antes de medir */
      setTimeout(function(){ aplicarZoom(1); centralizarMapa(); }, 120);
    }
    function fsMudou(){ if(!document.fullscreenElement && mapaCheio) alternarCheio(false); else if(mapaCheio) setTimeout(function(){ aplicarZoom(zoomMapa); centralizarMapa(); }, 60); }
    document.addEventListener('fullscreenchange', fsMudou);
    function redimensionouMapa(){ if(aba === 'vis' && svgMapa()) aplicarZoom(zoomMapa); }
    window.addEventListener('resize', redimensionouMapa);
    function atualizarFerrMapa(){
      var i = mapaIdx(), m = M.mapas[i]; if(!m || !$('#mf-nome')) return;
      $('#mf-nome').textContent = (m.n === 0 ? 'Mapa geral' : 'Aula ' + m.n) + ' · ' + m.nome;
      $('#mf-prev').disabled = i === 0;
      $('#mf-next').disabled = i === M.mapas.length - 1;
      $('#mf-det').textContent = detalhe ? 'Esconder explicações (E)' : 'Mostrar explicações (E)';
      $('#mf-cheio').textContent = mapaCheio ? '✕ Sair (Esc)' : '⛶ Tela cheia';
      $('#mf-pct').textContent = Math.round(zoomMapa * 100) + '%';
    }

    function desenhaMapa(){
      var paper = $('#paper'); if(!paper) return;
      var i = mapaIdx(), m = M.mapas[i];
      paper.innerHTML = window.montaMapa(m, detalhe);
      var svg = svgMapa();
      if(svg){ svg.removeAttribute('width'); svg.style.width = Math.round(larguraBase() * zoomMapa) + 'px'; }
      atualizarFerrMapa();
      if(m.n){   /* conta como visto hoje (aba Hoje) */
        var h = U.hoje(), d = P.diario[h] = P.diario[h] || { min:0, q:0, cards:0, novos:0, mapas:[] };
        d.mapas = d.mapas || [];
        if(d.mapas.indexOf(m.n) < 0){ d.mapas.push(m.n); salvar(); }
      }
      $('#v-pos').textContent = 'Mapa ' + (i+1) + ' de ' + M.mapas.length + ' · ' + String(m.arco || '').toLowerCase();
      $('#v-prev').disabled = i === 0;
      $('#v-next').disabled = i === M.mapas.length - 1;
      $('#v-comp').setAttribute('aria-pressed', detalhe ? 'true':'false');
      $('#v-ess').setAttribute('aria-pressed', detalhe ? 'false':'true');
      Array.prototype.forEach.call(raiz.querySelectorAll('#vis-bar .chip'), function(c){
        c.setAttribute('aria-pressed', +c.dataset.v === i ? 'true' : 'false');
      });
      centralizarMapa();
    }
    function mudaMapa(d){
      var i = mapaIdx() + d;
      if(i < 0 || i >= M.mapas.length) return;
      P.ultimo.mapa = i; salvar(); desenhaMapa();
    }
    function setDetalhe(v){ detalhe = v; desenhaMapa(); }

    /* ══════════ AULAS EM DETALHE ══════════ */
    var mapaFiltro = 'all';
    function gruposDeAulas(){
      var grupos = M.blocos.map(function(b){ return { b:b, aulas:M.aulas.filter(function(a){ return a.bloco === b.id; }) }; });
      var soltas = M.aulas.filter(function(a){ return !M.blocos.some(function(b){ return b.id === a.bloco; }); });
      if(soltas.length) grupos.push({ b:{ id:'_', nome:'Outras aulas', faixa:'' }, aulas:soltas });
      return grupos;
    }
    function renderMapa(){
      if(vazio()){ painel.innerHTML = hero('Detalhe · aula por aula','Aulas em detalhe') + semConteudo(); return; }
      if(!Object.keys(aulasAbertas).length) aulasAbertas[M.aulas[0].n] = true;
      painel.innerHTML = hero('Detalhe · aula por aula', 'As '+M.aulas.length+' aulas em um mapa só',
        'Cada aula abre em núcleo, ramos, termos que caem na prova e a pegadinha mais provável.' + (M.blocos.length ? (capitulos() ? ' As aulas estão agrupadas pelos '+M.blocos.length+' capítulos do livro.' : ' Os '+M.blocos.length+' blocos abaixo são a espinha dorsal da matéria.') : ''),
        [[M.aulas.length,'aulas mapeadas'],[M.questoes.length,'questões objetivas'],[M.discursivas.length,'discursivas'],[M.blocos.length, capitulos() ? 'capítulos' : 'blocos temáticos']]) +
        /* a trilha resume poucos blocos; com dezenas de capítulos, os títulos abaixo já fazem esse papel */
        (M.blocos.length && M.blocos.length <= 12 ? '<div class="sec-head"><p class="eyebrow">Trilha da matéria</p><h2>Como os blocos se encadeiam</h2><p>Cada bloco se apoia no anterior. Estude na ordem.</p></div>' +
          '<div class="trilha">' + M.blocos.map(function(b){ return '<div class="tr-b"><em>'+esc(b.faixa)+'</em><h4>'+esc(b.nome)+'</h4><p>'+esc(b.resumo)+'</p></div>'; }).join('') + '</div>' : '') +
        '<div class="bar" id="mapa-bar"></div><div id="mapa"></div>';
      painel.onclick = function(ev){
        var c = ev.target.closest('.chip[data-b]');
        if(c){ mapaFiltro = c.dataset.b; desenhaAulas(); return; }
        if(ev.target.id === 'm-all'){ M.aulas.forEach(function(a){ aulasAbertas[a.n] = true; }); desenhaAulas(); return; }
        if(ev.target.id === 'm-none'){ aulasAbertas = {}; desenhaAulas(); return; }
        var vm = ev.target.closest('[data-vermapa]');
        if(vm){ var n = +vm.dataset.vermapa; var i = M.mapas.findIndex(function(m){ return m.n === n; }); if(i >= 0){ P.ultimo.mapa = i; irPara('vis'); } return; }
        var b = ev.target.closest('button[data-n]');
        if(b){ var k = +b.dataset.n; aulasAbertas[k] = !aulasAbertas[k]; desenhaAulas(); }
      };
      desenhaAulas();
    }
    function desenhaAulas(){
      $('#mapa-bar').innerHTML = (M.blocos.length ? filtroDeBlocos('b', mapaFiltro, 'Todos os blocos') + '<span class="sep"></span>' : '') +
        '<button class="ghost" id="m-all">Expandir tudo</button><button class="ghost" id="m-none">Recolher tudo</button>';
      var html = '';
      gruposDeAulas().forEach(function(g){
        if(mapaFiltro !== 'all' && mapaFiltro !== g.b.id) return;
        if(!g.aulas.length) return;
        html += '<div class="bloco-h"><h3>'+esc(g.b.nome)+'</h3><em>'+esc(g.b.faixa)+'</em><div class="rule"></div></div>';
        html += '<div class="aulas">' + g.aulas.map(function(a){
          var open = !!aulasAbertas[a.n];
          var temMapa = M.mapas.some(function(m){ return m.n === a.n; });
          var corpo = open ? (
            '<div class="body">' +
              (a.ramos || []).map(function(r){
                return '<div class="ramo"><h5>'+esc(r.t)+'</h5><ul>' + (r.i || []).map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('') + '</ul></div>';
              }).join('') +
              '<div class="tagrow">' + (a.prova || []).map(function(t){ return '<span class="tag">'+esc(t)+'</span>'; }).join('') + '</div>' +
              (a.pegadinha ? '<div class="trap"><b>Pegadinha</b><p>'+esc(a.pegadinha)+'</p></div>' : '') +
              (temMapa ? '<div class="aula-acts"><button class="ghost" data-vermapa="'+a.n+'">Ver o mapa visual desta aula</button></div>' : '') +
            '</div>') : '';
          return '<article class="aula" data-open="'+(open?1:0)+'">' +
            '<button data-n="'+a.n+'" aria-expanded="'+open+'"><span class="num">'+dois(a.n)+'</span>' +
            '<span class="aula-t"><h4>'+esc(a.titulo)+'</h4><p>'+esc(a.nucleo)+'</p></span><span class="caret">▶</span></button>' + corpo + '</article>';
        }).join('') + '</div>';
      });
      $('#mapa').innerHTML = html;
    }

    /* ══════════ SIMULADO ══════════ */
    /* Filtros "de sessão" (revisar, refazer erradas, treino, prova simulada)
       têm respostas próprias, que não apagam as do simulado geral. */
    function emSessao(){ return !!SESSOES[P.simulado.filtro]; }
    function emProvaSimulada(){ return P.simulado.filtro === 'prova'; }
    function visiveis(){
      var f = P.simulado.filtro;
      if(SESSOES[f]) return sessao ? sessao.lista : [];
      var nv = /^n([123])$/.exec(f);
      if(nv) return qs.filter(function(x){ return nivelQ(x.q) === +nv[1]; });
      return qs.filter(function(x){ return f === 'all' || blocoDaAula(x.q.a) === f; });
    }
    /* ── contexto para o tutor de IA ──
       Texto curto (modelos locais têm pouca memória): o essencial da aula,
       a questão e, quando já respondida, o gabarito e o que o aluno marcou. */
    function resumoAula(n){
      var a = M.aulas.filter(function(x){ return x.n === n; })[0];
      if(!a) return '';
      return 'AULA ' + a.n + ' — ' + a.titulo + '\nIdeia central: ' + (a.nucleo || '') + '\n' +
        (a.ramos || []).map(function(r){ return '• ' + r.t + ': ' + (r.i || []).join('; '); }).join('\n') +
        (a.pegadinha ? '\nPegadinha comum: ' + a.pegadinha : '');
    }
    /* sugestão de macete com os termos que caem na prova (nada genérico) */
    function sugestaoMacete(n){
      var a = M.aulas.filter(function(x){ return x.n === n; })[0];
      return a && a.prova && a.prova.length ? 'Cria um macete para lembrar: ' + a.prova.slice(0, 4).join(', ') : 'Cria um macete para a pegadinha desta aula';
    }
    function contextoGeral(){
      var fraco = blocoMaisFraco();
      var mapa = aba === 'vis' ? M.mapas[mapaIdx()] : null;
      var aulaAtual = mapa && mapa.n ? mapa.n : null;
      var alvo = aulaAtual || (fraco && M.aulas.filter(function(a){ return a.bloco === fraco.b.id; }).map(function(a){ return a.n; })[0]) || (M.aulas[0] && M.aulas[0].n);
      var texto = 'Matéria: ' + M.nome + (M.subtitulo ? ' (' + M.subtitulo + ')' : '') + '\n' +
        'Situação do aluno: ' + devidas().length + ' questão(ões) para revisar hoje; ' + erradas().length + ' errada(s) no simulado' +
        (fraco && fraco.pct !== null ? '; bloco mais fraco: ' + fraco.b.nome + ' (' + Math.round(fraco.pct * 100) + '% de acerto)' : '') + '.\n' +
        'Aulas (ideia central):\n' + M.aulas.map(function(a){ return a.n + ') ' + a.titulo + ' — ' + (a.nucleo || ''); }).join('\n').slice(0, 2200) + '\n' +
        (alvo ? '\nEm destaque:\n' + resumoAula(alvo) : '');
      return { chave:'geral:' + M.id, titulo:M.nome + (aulaAtual ? ' · Aula ' + aulaAtual : ''), texto:texto,
        sugestoes:['O que eu devo estudar agora?', 'Me faz 3 perguntas rápidas', 'Resume a matéria em 8 tópicos', sugestaoMacete(alvo)] };
    }
    /* PDF aberto na aba Conteúdos: a página que está na tela (e a seguinte) */
    /* rola o visor até o topo da página (pela posição real na tela) */
    function irParaPagina(env){
      var box = $('#visor-box'); if(!box || !env) return;
      box.scrollTop += env.getBoundingClientRect().top - box.getBoundingClientRect().top - 14;
      var v = $('#visor'); if(v && v.getBoundingClientRect().top < 0) v.scrollIntoView({ block:'start' });
    }
    function paginaVisivel(){
      var box = $('#visor-box'); if(!box) return 1;
      /* posição real na tela (offsetTop não serve: o visor não é o “pai posicionado” das páginas) */
      var b = box.getBoundingClientRect(), linha = b.top + box.clientHeight / 3, n = 1;
      Array.prototype.forEach.call(box.querySelectorAll('.pg'), function(p){ if(p.getBoundingClientRect().top <= linha) n = +p.dataset.pg; });
      return n;
    }
    function contextoArquivo(){
      var it = achaArq(arqAberto); if(!it) return contextoGeral();
      var pg = paginaVisivel();
      var trecho = [pg, pg + 1].map(function(n){ return textoPaginas[n] ? '[página ' + n + '] ' + textoPaginas[n] : ''; }).join('\n').slice(0, 2600);
      var texto = 'Matéria: ' + M.nome + '\nO aluno está lendo: ' + it.nome + ', página ' + pg + '.\nTEXTO DA PÁGINA:\n' + (trecho || '(texto ainda carregando)') + '\n' +
        (it.aula ? '\n' + resumoAula(it.aula) : '');
      return { chave:'arq:' + it.id, titulo:it.nome + ' · pág. ' + pg, texto:texto,
        sugestoes:['Explica esta página de um jeito simples', 'O que desta página cai na prova?', 'Me faz 2 perguntas sobre esta página', it.aula ? sugestaoMacete(it.aula) : 'Resume esta página em 3 tópicos'] };
    }
    /* botão da mascote no topo: fala sobre o que está na tela */
    function contextoAtual(){
      if(aba === 'vis') return contextoMapa();
      if(aba === 'arq' && arqAberto && !$('#visor').hidden) return contextoArquivo();
      if(aba === 'sim' && P.simulado.vista === 'uma' && !emProvaSimulada()){ var l = visiveis(); if(l[P.simulado.pos]) return contextoQuestao(l[P.simulado.pos]); }
      return contextoGeral();
    }
    function contextoQuestao(x){
      var q = x.q, r = respostaDe(x), revelada = mostraCorrecao(r);
      var texto = 'Matéria: ' + M.nome + '\nQUESTÃO (Aula ' + q.a + ', nível ' + nivelQ(q) + (q.t === 'ar' ? ', asserção-razão' : '') + '):\n' +
        q.e + (q.t === 'ar' ? '\nI. ' + q.i1 + '\nPORQUE\nII. ' + q.i2 : '') + '\nAlternativas:\n' +
        x._o.map(function(o, j){ return 'ABCDE'[j] + ') ' + o; }).join('\n') + '\n';
      if(revelada){
        texto += 'Resposta correta: ' + 'ABCDE'[x._c] + '\nJustificativa do material: ' + q.x + '\n' +
          (r !== undefined ? 'O aluno marcou ' + 'ABCDE'[x._orig.indexOf(r)] + (r === q.c ? ' e ACERTOU.' : ' e ERROU.') : 'O aluno deixou em branco.') + '\n';
      } else {
        texto += 'O aluno AINDA NÃO respondeu esta questão: não diga qual é a correta; ajude com dicas e perguntas.\n';
      }
      texto += '\n' + resumoAula(q.a);
      var errou = revelada && r !== undefined && r !== q.c;
      return { chave:'q:' + x.id + ':' + (revelada ? 'r' : 'n'), titulo:'Questão da Aula ' + q.a + (q.t === 'ar' ? ' (asserção-razão)' : ''), texto:texto,
        sugestoes: !revelada ? ['Me dá uma dica', 'O que essa questão está cobrando?', 'Explica os termos do enunciado']
          : (errou ? ['Por que eu errei?', 'Explica de outro jeito', 'Me dá um exemplo do dia a dia', 'Me faz uma pergunta parecida']
                   : ['Por que as outras estão erradas?', 'Me dá um exemplo do dia a dia', 'Me faz uma pergunta mais difícil']) };
    }
    function contextoMapa(){
      var m = M.mapas[mapaIdx()]; if(!m) return contextoGeral();
      if(!m.n) return Object.assign(contextoGeral(), { chave:'mapa:0:' + M.id, titulo:'Mapa geral de ' + M.nome,
        sugestoes:['Explica como as aulas se ligam', 'Qual parte cai mais em prova?', 'Me faz 3 perguntas sobre a matéria'] });
      return { chave:'mapa:' + m.n + ':' + M.id, titulo:'Mapa da Aula ' + m.n + ' · ' + m.nome, texto:'Matéria: ' + M.nome + '\n\n' + resumoAula(m.n),
        sugestoes:['Explica este mapa em 5 frases', sugestaoMacete(m.n), 'Qual é a pegadinha desta aula?', 'Me faz 3 perguntas sobre esta aula'] };
    }

    /* ── níveis e rodadas ── */
    var NIVEIS = [[1, 'Conceitos', 'Objetivas diretas'], [2, 'Asserção-razão', 'I PORQUE II'], [3, 'Na prática', 'Cenários: o que você faria']];
    function nivelQ(q){ return q.nivel || (q.t === 'ar' ? 2 : 1); }
    function statusNiveis(){
      return NIVEIS.map(function(nv){
        var l = qs.filter(function(x){ return nivelQ(x.q) === nv[0]; });
        return { n:nv[0], nome:nv[1], dica:nv[2], total:l.length,
          feitas:l.filter(function(x){ return P.feitas[x.id]; }).length,
          ok:l.filter(function(x){ return P.simulado.respostas[x.id] === x.q.c; }).length };
      });
    }
    function proximaRodada(){
      return M.rodadas.filter(function(r){ return r.n > P.rodada; }).sort(function(a, b){ return a.n - b.n; })[0] || null;
    }
    function painelNiveis(){
      var st = statusNiveis(), f = P.simulado.filtro;
      var faltam = st.reduce(function(s, x){ return s + Math.max(0, x.total - x.feitas); }, 0);
      var prox = proximaRodada();
      return '<div class="niv-topo"><span class="eyebrow">Rodada ' + P.rodada + ' · três níveis</span><span class="niv-dica">Faça na ordem: 1 → 2 → 3. Terminando os três, atualize as questões.</span></div>' +
        '<div class="niv-grade">' + st.map(function(s){
          var fim = s.total && s.feitas >= s.total;
          return '<button class="niv" data-f="n'+s.n+'" aria-pressed="'+(f === 'n'+s.n)+'"'+(s.total ? '' : ' disabled')+'>' +
            '<span class="niv-n">'+(fim ? '✓' : s.n)+'</span><span class="niv-t"><b>Nível '+s.n+' · '+esc(s.nome)+'</b><small>'+esc(s.dica)+'</small>' +
            '<small>'+(s.total ? s.feitas+' de '+s.total+' feitas'+(s.feitas ? ' · '+Math.round(s.ok / Math.max(1, s.feitas) * 100)+'% de acerto' : '') : 'sem questões nesta matéria')+'</small>' +
            '<span class="meter"><i style="width:'+(s.total ? Math.round(s.feitas / s.total * 100) : 0)+'%"></i></span></span></button>';
        }).join('') +
        '<button class="niv niv-atual" id="s-atualizar" data-livre="'+(faltam ? 0 : 1)+'" title="'+(faltam ? 'Termine os três níveis para liberar' : 'Trocar por questões reformuladas')+'">' +
          '<span class="niv-n">🔄</span><span class="niv-t"><b>Atualizar questões</b>' +
          '<small>'+(faltam ? 'Libera quando terminar os 3 níveis · faltam '+faltam : (prox ? 'Pronto! A rodada '+prox.n+' está esperando' : 'Pronto! Gerar uma rodada nova'))+'</small></span></button>' +
        '</div>';
    }
    function atualizarQuestoes(){
      var faltam = statusNiveis().reduce(function(s, x){ return s + Math.max(0, x.total - x.feitas); }, 0);
      if(faltam){ U.aviso('Termine os três níveis primeiro — faltam ' + faltam + ' questão(ões).', 3500); return; }
      var prox = proximaRodada();
      if(prox){
        U.confirmar('Começar a rodada ' + prox.n + '?', 'Entram ' + prox.questoes.length + ' questões reformuladas, nos mesmos três níveis. Os resultados desta rodada continuam no seu histórico.', 'Começar').then(function(ok){ if(ok) trocarRodada(prox.n); });
        return;
      }
      window.api.config().then(function(c){
        if(!c.temChave){
          U.modal('<h2>Você fez todas as rodadas prontas</h2><p>Esta matéria tinha ' + (M.rodadas.length + 1) + ' rodada(s) de questões e você completou todas. Para ganhar uma rodada nova, reformulada:</p>' +
            '<ul class="lista-simples"><li><b>Sem custo:</b> peça ao Claude Code “crie uma nova rodada de questões de ' + esc(M.nome) + '”. Depois de instalada, este botão libera a rodada nova.</li>' +
            '<li><b>Automático:</b> configure uma chave da API em ⚙ Configurações, na tela inicial. Aí este botão gera rodadas sozinho (custa cerca de US$ 1 a 3 por rodada).</li></ul>' +
            '<div class="modal-acts"><button class="btn" id="r-ok">Entendi</button></div>', function(el, fechar){ el.querySelector('#r-ok').onclick = fechar; });
          return;
        }
        U.confirmar('Gerar a rodada ' + (P.rodada + 1) + ' com IA?', 'A IA reformula as ' + qs.length + ' questões desta rodada, nos três níveis. Usa a internet e a sua chave da API (cerca de US$ 1 a 3) e leva alguns minutos.', 'Gerar').then(function(ok){ if(ok) gerarRodadaIA(); });
      }).catch(function(){ U.aviso('Não consegui ler as configurações.', 3000); });
    }
    function trocarRodada(n){
      P.rodada = n;
      P.simulado.filtro = 'n1'; P.simulado.pos = 0;
      sessao = null; historicoMarcado = {}; provaInicio = null;
      carregar(M, P); salvarJa();
      if(aba === 'sim') renderSim();
      U.aviso('Rodada ' + n + ' começou — comece pelo nível 1.', 3500);
    }
    function gerarRodadaIA(){
      var fechar = null;
      U.modal('<h2>Gerando a rodada nova…</h2><p>A IA está reformulando as questões dos três níveis. Pode levar alguns minutos — deixe o programa aberto.</p>', function(el, f){ fechar = f; });
      window.api.reformularQuestoes(M.id, P.rodada).then(function(r){
        return window.api.abrir(M.id).then(function(d){
          if(fechar) fechar();
          carregar(d.materia, P);
          trocarRodada(r.n);
        });
      }).catch(function(e){
        if(fechar) fechar();
        U.aviso('Não deu para gerar: ' + String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 7000);
      });
    }

    /* enunciado; na asserção-razão, as duas proposições ligadas por PORQUE */
    function enunciadoHtml(q){
      if(q.t !== 'ar') return esc(q.e);
      return esc(q.e) + '<span class="ar"><span class="ar-p"><b>I.</b> '+esc(q.i1)+'</span>' +
        '<span class="ar-porque">PORQUE</span><span class="ar-p"><b>II.</b> '+esc(q.i2)+'</span></span>' +
        '<span class="ar-pede">A respeito dessas asserções, assinale a opção correta.</span>';
    }
    function respostaDe(x){
      if(emSessao()) return sessao ? sessao.resp[x.id] : undefined;
      return P.simulado.respostas[x.id];
    }
    /* a correção aparece: na prova simulada, só depois de entregar; no modo
       prova do simulado geral, só no fim; nos demais, logo após responder */
    function mostraCorrecao(r){
      if(emProvaSimulada()) return !!(sessao && sessao.encerrada);   /* entregue: mostra até as em branco */
      if(r === undefined) return false;
      if(emSessao()) return true;
      return P.simulado.modo === 'estudo';
    }
    /* revisão espaçada (caixas de Leitner) */
    function agendarRevisao(x, orig){
      var r = P.revisao[x.id];
      if(orig !== x.q.c){
        P.revisao[x.id] = { caixa:0, proxima:U.maisDias(INTERVALOS[0]), erros:(r ? r.erros : 0) + 1 };
      } else if(r){
        var cx = r.caixa + 1;
        if(cx >= INTERVALOS.length) delete P.revisao[x.id];
        else P.revisao[x.id] = { caixa:cx, proxima:U.maisDias(INTERVALOS[cx]), erros:r.erros };
      }
    }
    function responder(x, j){
      var S = P.simulado, anterior = respostaDe(x);
      if(mostraCorrecao(anterior)) return;  /* já corrigida */
      if(emProvaSimulada() && sessao.encerrada) return;
      var orig = x._orig[j];
      if(emSessao()) sessao.resp[x.id] = orig; else S.respostas[x.id] = orig;
      if(S.modo === 'prova' && !provaInicio){ provaInicio = Date.now(); }
      /* na prova simulada dá para mudar de ideia até entregar: agenda e conta só no fim */
      if(!emProvaSimulada()){ agendarRevisao(x, orig); P.feitas[x.id] = 1; if(anterior === undefined) registrar('q', 1); }
      salvar();
      desenhaSim();
      /* traz a explicação e o botão "Próxima" para dentro da tela */
      if(S.vista === 'uma'){ var nav = $('.q-nav'); if(nav) nav.scrollIntoView({ block:'nearest', behavior:'smooth' }); }
    }
    function irQuestao(i){
      var n = visiveis().length;
      if(!n) return;
      var antes = P.simulado.pos;
      P.simulado.pos = Math.max(0, Math.min(n - 1, i)); salvar();
      desenhaSim();
      if(P.simulado.pos !== antes){ var p = $('.pontos'); if(p) p.scrollIntoView({ block:'start', behavior:'smooth' }); }
    }

    function renderSim(){
      painel.innerHTML = hero('Passo 2 · Simulado', 'Simulado objetivo',
        'Cinco alternativas por questão. Cada questão indica a aula de origem e traz a justificativa da resposta.' +
        (M.questoes.some(function(q){ return q.f === 'extra'; }) ? ' As marcadas como <span class="pill extra">extra</span> vêm da bibliografia da área' + (M.textos && M.textos.extras ? ' ('+esc(M.textos.extras)+')' : '') + ', ampliando o que está no slide.' : '') +
        ' Questão errada volta para <strong>revisão</strong> depois de 1, 3, 7, 15 e 30 dias.' +
        ' São <strong>três níveis</strong>: 1 · conceitos, 2 · asserção-razão (formato ENADE: julgue cada frase e depois pergunte “a II explica a I?”) e 3 · na prática, com cenários do dia a dia da área.') +
        (vazio() || !qs.length ? semConteudo() :
        '<div class="niveis" id="niveis"></div>' +
        '<div class="bar" id="sim-bar"></div>' +
        '<div class="score"><div class="stat"><i>Respondidas</i><span id="s-resp"></span></div><div class="stat"><i>Acertos</i><span id="s-ok"></span></div>' +
          '<div class="stat"><i>Aproveitamento</i><span id="s-pct"></span></div><div class="stat" id="s-tempo-w" hidden><i>Tempo</i><span id="s-tempo">0:00</span></div>' +
          '<div class="meter"><i id="s-meter"></i></div><button class="ghost" id="s-reset">Reiniciar</button></div>' +
        '<div id="sim"></div><div id="sim-end"></div>');
      if(vazio() || !qs.length) return;
      painel.onclick = cliqueSim;
      desenhaSim();
    }
    function barraSim(){
      var S = P.simulado, nd = devidas().length, ne = erradas().length;
      if(emProvaSimulada() || S.filtro === 'treino'){
        return '<span class="sessao-rot">'+(emProvaSimulada() ? '⏱ Prova simulada · '+sessao.lista.length+' questões' : esc(sessao.rotulo || 'Treino'))+'</span>' +
          '<button class="ghost" data-f="all">Sair e voltar ao simulado</button>';
      }
      return '<button class="chip prova-chip" id="s-prova">⏱ Prova simulada</button>' +
        '<button class="chip" id="s-imprimir" title="Monta uma prova em A4 para imprimir ou salvar em PDF">🖨 Imprimir simulado</button><span class="sep"></span>' +
        filtroDeBlocos('f', S.filtro, 'Todas') +
        '<span class="sep"></span>' +
        '<button class="chip rev" data-f="rev" aria-pressed="'+(S.filtro==='rev')+'"'+(nd||S.filtro==='rev'?'':' disabled')+'>Revisar hoje ('+nd+')</button>' +
        '<button class="chip" data-f="err" aria-pressed="'+(S.filtro==='err')+'"'+(ne||S.filtro==='err'?'':' disabled')+'>Refazer as que errei ('+ne+')</button>' +
        '<span class="sep"></span>' +
        '<button class="chip" data-modo="estudo" aria-pressed="'+(S.modo==='estudo')+'" title="Mostra a correção logo depois de responder">Modo estudo</button>' +
        '<button class="chip" data-modo="prova" aria-pressed="'+(S.modo==='prova')+'" title="Gabarito só no fim, com cronômetro">Modo prova</button>' +
        '<span class="sep"></span>' +
        '<button class="chip" data-vista="uma" aria-pressed="'+(S.vista==='uma')+'">Uma por vez</button>' +
        '<button class="chip" data-vista="lista" aria-pressed="'+(S.vista==='lista')+'">Lista</button>';
    }
    function cartaoQuestao(x, num, foco){
      var r = respostaDe(x), rev = emSessao();
      var revelar = mostraCorrecao(r);
      var marcada = r === undefined ? -1 : x._orig.indexOf(r);
      var opts = x._o.map(function(o,j){
        var st = '';
        if(revelar){ if(j === x._c) st = 'right'; else if(j === marcada) st = 'wrong'; }
        else if(r !== undefined && j === marcada) st = 'picked';
        return '<button class="opt" data-q="'+esc(x.id)+'" data-o="'+j+'"'+(revelar?' disabled':'')+(st?' data-state="'+st+'"':'')+'>' +
          '<span class="radio"></span><span class="letra">'+'ABCDE'[j]+'</span><span>'+esc(o)+'</span></button>';
      }).join('');
      var acertou = r === x.q.c;
      var agenda = P.revisao[x.id];
      var fb = revelar ? '<div class="fb'+(acertou?'':' err')+'"><b>'+(acertou?'Correto':(r === undefined ? 'Sem resposta · correta: ' : 'Resposta correta: ')+'ABCDE'[x._c])+'</b>'+esc(x.q.x) +
        (agenda ? '<small>Volta para revisão em '+agenda.proxima.split('-').reverse().join('/')+'.</small>' : (acertou && rev ? '<small>Saiu da revisão. Muito bem!</small>' : '')) + '</div>' : '';
      return '<article class="q'+(foco?' foco':'')+'">' +
        '<div class="q-head"><span class="q-n">'+num+'</span><span class="q-text">'+enunciadoHtml(x.q)+'</span>' +
          '<span class="q-meta"><span class="pill">Aula '+x.q.a+'</span>' + (nivelQ(x.q)===3?'<span class="pill niv3-pill">nível 3 · prática</span>':'') + (x.q.t==='ar'?'<span class="pill ar-pill">asserção-razão</span>':'') + (x.q.calc?'<span class="pill">cálculo</span>':'') +
          (x.q.f==='extra'?'<span class="pill extra">extra</span>':'') + (P.revisao[x.id] && !revelar ?'<span class="pill rev">revisão</span>':'') + '</span>' +
        '</div><div class="opts">'+opts+'</div>'+fb +
        '<div class="q-tutor"><button class="ghost mascote-acao" data-tutor-q="'+esc(x.id)+'">' + Mascote.avatar(22) + (revelar ? 'Perguntar à '+Mascote.nome : 'Pedir uma dica à '+Mascote.nome) + '</button>' +
          '<button class="ghost q-erro" data-erro-q="'+esc(x.id)+'" title="A pergunta, as alternativas ou a resposta estão erradas? A questão sai do simulado.">⚠ Questão com erro</button></div></article>';
    }
    function desenhaSim(){
      if(!$('#sim')) return;
      var S = P.simulado, lista = visiveis();
      $('#sim-bar').innerHTML = barraSim();
      var pn = $('#niveis');
      if(pn){ var comSessao = emProvaSimulada() || S.filtro === 'treino'; pn.hidden = comSessao; if(!comSessao) pn.innerHTML = painelNiveis(); }
      $('.score').classList.toggle('fixo', S.vista === 'lista');
      if(!lista.length){
        $('#sim').innerHTML = '<div class="empty">' + (S.filtro === 'rev' ? '<b>Nada para revisar hoje.</b>As questões que você errar voltam aqui nos dias certos.' : S.filtro === 'treino' ? '<b>Treino concluído.</b>Volte à aba Hoje para o próximo passo.' : 'Nenhuma questão neste filtro.') + '</div>';
        $('#sim-end').innerHTML = ''; placar(lista); return;
      }
      if(S.vista === 'uma'){
        if(S.pos >= lista.length) S.pos = lista.length - 1;
        var x = lista[S.pos], r = respostaDe(x);
        var respondida = r !== undefined;
        $('#sim').innerHTML =
          '<div class="pontos" aria-label="Mapa das questões">' + lista.map(function(y, i){
            var ry = respostaDe(y), s = '';
            if(ry !== undefined) s = mostraCorrecao(ry) ? (ry === y.q.c ? 'ok' : 'err') : 'resp';
            return '<button data-pos="'+i+'"'+(s?' data-s="'+s+'"':'')+(i===S.pos?' aria-current="true"':'')+' title="Questão '+(i+1)+'">'+(i+1)+'</button>';
          }).join('') + '</div>' +
          cartaoQuestao(x, S.pos + 1, true) +
          '<div class="q-nav"><button class="ghost" data-nav="-1"'+(S.pos===0?' disabled':'')+'>◀ Anterior</button>' +
          '<span class="vis-pos">Questão '+(S.pos+1)+' de '+lista.length+' · responda com <span class="kbd">A</span>–<span class="kbd">E</span></span>' +
          '<button class="'+(respondida?'btn':'ghost')+'" data-nav="1"'+(S.pos===lista.length-1?' disabled':'')+'>Próxima ▶</button></div>';
      } else {
        $('#sim').innerHTML = lista.map(function(x, i){ return cartaoQuestao(x, i+1, false); }).join('');
      }
      placar(lista);
    }
    function placar(lista){
      var S = P.simulado, resp = 0, ok = 0;
      lista.forEach(function(x){ var r = respostaDe(x); if(r !== undefined){ resp++; if(r === x.q.c) ok++; } });
      var provaSim = emProvaSimulada();
      var prova = provaSim || (S.modo === 'prova' && !emSessao());
      var fim = provaSim ? !!sessao.encerrada : (resp === lista.length && lista.length);
      $('#s-resp').textContent = resp + ' / ' + lista.length;
      $('#s-ok').textContent = prova && !fim ? '—' : ok;
      $('#s-pct').textContent = prova && !fim ? '—' : (resp ? Math.round(ok/resp*100) + '%' : '—');
      $('#s-meter').style.width = lista.length ? (resp/lista.length*100) + '%' : '0';
      $('#s-tempo-w').hidden = !prova;
      $('#s-tempo-w').querySelector('i').textContent = provaSim ? (fim ? 'Tempo usado' : 'Tempo restante') : 'Tempo';
      if(provaSim && fim && sessao.usado != null){
        var us = Math.round(sessao.usado / 1000);
        $('#s-tempo').textContent = Math.floor(us / 60) + ':' + dois(us % 60); $('#s-tempo').style.color = '';
      }
      $('#s-reset').textContent = provaSim ? (fim ? 'Nova prova' : 'Entregar prova') : 'Reiniciar';
      $('#s-reset').className = provaSim && !fim ? 'btn' : 'ghost';
      clearInterval(provaTimer);
      if(provaSim && !fim){
        var regressivo = function(){
          var s = Math.max(0, Math.ceil((sessao.fim - Date.now())/1000));
          var t = $('#s-tempo'); if(t){ t.textContent = Math.floor(s/60) + ':' + dois(s%60); t.style.color = s < 60 ? 'var(--bad)' : ''; }
          if(s <= 0){ clearInterval(provaTimer); U.aviso('Tempo esgotado — prova entregue.', 4000); encerrarProva(); }
        };
        regressivo(); provaTimer = setInterval(regressivo, 1000);
      } else if(prova && provaInicio && !fim){
        var tick = function(){ var s = Math.floor((Date.now() - provaInicio)/1000); var t = $('#s-tempo'); if(t) t.textContent = Math.floor(s/60) + ':' + dois(s%60); };
        tick(); provaTimer = setInterval(tick, 1000);
      }

      var end = $('#sim-end');
      if(!fim){ end.innerHTML = ''; return; }
      var pct = Math.round(ok/lista.length*100);
      var chave = S.filtro + ':' + lista.length + ':' + ok;
      if(!historicoMarcado[chave] && (!emSessao() || provaSim)){
        historicoMarcado[chave] = true;
        P.historico.push({ data:new Date().toISOString(), filtro:S.filtro, total:lista.length, acertos:ok, modo:provaSim ? 'prova-simulada' : S.modo });
        if(P.historico.length > 200) P.historico = P.historico.slice(-200);
        salvar();
      }
      /* desempenho por bloco: aponta onde estudar em seguida */
      var porBloco = M.blocos.map(function(b){
        var l = lista.filter(function(x){ return blocoDaAula(x.q.a) === b.id; });
        var a = l.filter(function(x){ return respostaDe(x) === x.q.c; }).length;
        return { b:b, t:l.length, a:a, p:l.length ? a/l.length : 1 };
      }).filter(function(x){ return x.t; });
      var pior = porBloco.slice().sort(function(a,b){ return a.p - b.p; })[0];
      var msg = pct >= 80 ? 'Domínio consolidado. Reveja só as pegadinhas do mapa.'
        : pct >= 60 ? 'Base firme. Volte aos blocos em que errou e refaça o filtro por bloco.'
        : 'Reabra o mapa mental dos blocos com mais erros antes de repetir o simulado.';
      var usado = provaSim && sessao.usado ? Math.round(sessao.usado / 1000) : null;
      end.innerHTML = '<div class="endbox"><div class="big">'+pct+'%</div><p>'+ok+' de '+lista.length+' — '+msg +
        (usado !== null ? ' Tempo usado: ' + Math.floor(usado/60) + ':' + dois(usado%60) + '. Role para cima para ver o gabarito comentado de cada questão.' :
          (provaInicio && prova ? ' Tempo: ' + $('#s-tempo').textContent + '.' : '')) + '</p>' +
        (porBloco.length > 1 ? '<div class="porbloco">' + porBloco.map(function(x){
          return '<div><span>'+esc(x.b.nome)+'</span><span class="meter"><i style="width:'+Math.round(x.p*100)+'%;'+(x===pior && x.p<1?'background:var(--warn)':'')+'"></i></span><b>'+Math.round(x.p*100)+'%</b></div>';
        }).join('') + '</div>' + (pior && pior.p < 1 ? '<p>Onde estudar agora: <strong>'+esc(pior.b.nome)+'</strong> ('+esc(pior.b.faixa)+').</p>' : '') : '') +
        (prova && !provaSim ? '<button class="chip" id="s-corrigir" aria-pressed="false">Ver gabarito comentado</button>' : '') + '</div>';
    }

    /* ── prova simulada: sorteio, tempo e entrega ── */
    function encerrarProva(){
      if(!sessao || sessao.encerrada) return;
      clearInterval(provaTimer);
      sessao.encerrada = true;
      sessao.usado = Math.min(Date.now(), sessao.fim) - sessao.inicio;
      var n = 0;
      sessao.lista.forEach(function(x){ var r = sessao.resp[x.id]; if(r !== undefined){ agendarRevisao(x, r); P.feitas[x.id] = 1; n++; } });
      if(n) registrar('q', n);
      salvar();
      desenhaSim();
      var e = $('#sim-end'); if(e) e.scrollIntoView({ behavior:'smooth', block:'center' });
    }
    function abrirProva(){
      var blocosComQ = M.blocos.filter(function(b){ return qs.some(function(x){ return blocoDaAula(x.q.a) === b.id; }); });
      U.modal('<h2>Prova simulada</h2><p>Questões sorteadas, cronômetro regressivo e gabarito só depois de entregar — como no dia da prova. As que você errar entram na revisão espaçada.</p>' +
        '<label class="campo"><span>Quantidade de questões</span><select id="p-qtd">' + [10, 15, 20, 30, 40].filter(function(n){ return n <= qs.length; }).map(function(n){ return '<option'+(n===20?' selected':'')+'>'+n+'</option>'; }).join('') +
          '<option value="'+qs.length+'">Todas ('+qs.length+')</option></select></label>' +
        '<label class="campo"><span>Tempo (minutos)</span><input type="text" id="p-min" value="40" inputmode="numeric"><small>Sugestão: 2 minutos por questão.</small></label>' +
        (blocosComQ.length > 1 ? '<div class="campo"><span>Conteúdo</span><div class="checks">' + blocosComQ.map(function(b){
          return '<label><input type="checkbox" value="'+b.id+'" checked> '+esc(b.nome)+' <small>('+esc(b.faixa)+')</small></label>';
        }).join('') + '</div></div>' : '') +
        '<div class="msg-erro" id="p-erro"></div><div class="modal-acts"><button class="ghost" id="p-cancelar">Cancelar</button><button class="btn" id="p-ir">Começar a prova</button></div>',
        function(el, fechar){
          var q = function(s){ return el.querySelector(s); };
          q('#p-qtd').onchange = function(){ q('#p-min').value = Math.round(+q('#p-qtd').value * 2); };
          q('#p-min').value = Math.round(+q('#p-qtd').value * 2);
          q('#p-cancelar').onclick = fechar;
          q('#p-ir').onclick = function(){
            var bl = Array.prototype.map.call(el.querySelectorAll('.checks input:checked'), function(c){ return c.value; });
            var pool = qs.filter(function(x){ return !blocosComQ.length || blocosComQ.length === 1 || bl.indexOf(blocoDaAula(x.q.a)) >= 0; });
            var qtd = Math.min(+q('#p-qtd').value, pool.length), min = Math.max(1, +q('#p-min').value || 0);
            if(!pool.length){ q('#p-erro').textContent = 'Escolha ao menos um bloco.'; return; }
            fechar();
            var agora = Date.now();
            historicoMarcado = {};
            iniciarSessao('prova', embaralhar(pool).slice(0, qtd), { inicio:agora, fim:agora + min * 60000 });
          };
        });
    }
    function cliqueSim(ev){
      var S = P.simulado, t = ev.target;
      var o = t.closest('.opt');
      if(o && !o.disabled){
        var x = qs.find(function(y){ return String(y.id) === o.dataset.q; });
        if(x) responder(x, +o.dataset.o);
        return;
      }
      var pt = t.closest('[data-pos]'); if(pt){ irQuestao(+pt.dataset.pos); return; }
      var nv = t.closest('[data-nav]'); if(nv && !nv.disabled){ irQuestao(S.pos + (+nv.dataset.nav)); return; }
      if(t.closest('#s-prova')){ abrirProva(); return; }
      if(t.closest('#s-atualizar')){ atualizarQuestoes(); return; }
      var tq = t.closest('[data-tutor-q]');
      if(tq){ var xq = qs.find(function(y){ return String(y.id) === tq.dataset.tutorQ; }); if(xq && window.Tutor) Tutor.abrir(contextoQuestao(xq)); return; }
      var eq = t.closest('[data-erro-q]');
      if(eq){
        var qe = qs.find(function(y){ return String(y.id) === eq.dataset.erroQ; }); if(!qe) return;
        U.confirmar('Esconder esta questão?', 'Ela sai do simulado, da revisão e da prova, para você não decorar uma resposta errada. Dá para trazer de volta em ⚙ Gerenciar.', 'Esconder').then(function(ok){
          if(!ok) return;
          P.ocultas['q:' + qe.id] = { em: U.hoje(), t: String(qe.q.e || qe.q.i1 || '').slice(0, 140) };
          sessao = null; carregar(M, P); salvarJa();
          if(S.pos >= qs.length) S.pos = Math.max(0, qs.length - 1);
          renderSim();
          U.aviso('Questão escondida. Obrigado por avisar!', 3000);
        });
        return;
      }
      if(t.closest('#s-imprimir')){ window.Impressao.abrir({ materia:M, questoes:qs, blocoDaAula:blocoDaAula }); return; }
      var f = t.closest('[data-f]');
      if(f && !f.disabled){
        var nf = f.dataset.f;
        var trocar = function(){
          clearInterval(provaTimer);
          if(nf === 'rev') sessao = { tipo:'rev', lista:devidas(), resp:{} };
          else if(nf === 'err') sessao = { tipo:'err', lista:erradas(), resp:{} };
          else sessao = null;
          S.filtro = nf; S.pos = 0; salvar(); desenhaSim();
        };
        if(emProvaSimulada() && !sessao.encerrada){
          U.confirmar('Sair da prova?', 'A prova ainda não foi entregue. Se sair agora, as respostas desta prova são descartadas.', 'Sair', true).then(function(ok){ if(ok) trocar(); });
        } else trocar();
        return;
      }
      var md = t.closest('[data-modo]'); if(md){ S.modo = md.dataset.modo; provaInicio = null; salvar(); desenhaSim(); return; }
      var vs = t.closest('[data-vista]'); if(vs){ S.vista = vs.dataset.vista; salvar(); desenhaSim(); return; }
      if(t.id === 's-corrigir'){ S.modo = 'estudo'; salvar(); desenhaSim(); return; }
      if(t.id === 's-reset' && emProvaSimulada()){
        if(sessao.encerrada){ abrirProva(); return; }
        var faltam = sessao.lista.filter(function(x){ return sessao.resp[x.id] === undefined; }).length;
        U.confirmar('Entregar a prova?', faltam ? 'Ainda há '+faltam+' questão(ões) sem resposta — elas contam como erradas.' : 'Todas as questões estão respondidas.', 'Entregar').then(function(ok){ if(ok) encerrarProva(); });
        return;
      }
      if(t.id === 's-reset'){
        var lista = visiveis();
        U.confirmar('Reiniciar o simulado?', 'Apaga as respostas das '+lista.length+' questões deste filtro. A agenda de revisão continua.', 'Reiniciar').then(function(ok){
          if(!ok) return;
          if(sessao) sessao.resp = {};
          else lista.forEach(function(x){ delete S.respostas[x.id]; });
          S.pos = 0; provaInicio = null; historicoMarcado = {};
          salvar(); desenhaSim();
        });
      }
    }

    /* ══════════ DISCURSIVAS ══════════ */
    function renderDisc(){
      var n = M.discursivas.length;
      painel.innerHTML = hero('Passo 3 · Discursivas', n ? n + ' questões para redigir' : 'Questões para redigir',
        'Escreva a resposta <strong>antes</strong> de abrir o gabarito — o texto fica salvo aqui. Depois compare com os <strong>pontos-chave</strong> (o que o corretor procura para pontuar) e com a <strong>resposta modelo</strong>.') +
        (!n ? semConteudo() :
        '<div class="bar"><button class="ghost" id="d-all">Abrir todos os gabaritos</button><button class="ghost" id="d-none">Fechar todos</button></div><div id="disc"></div>');
      if(!n) return;
      var timer = null;
      window.api.config().then(function(c){ temChaveIA = c.temChave; if(aba === 'disc') desenhaDisc(); }).catch(function(){});
      painel.onchange = function(ev){
        var cb = ev.target.closest('input[data-aval]'); if(!cb) return;
        var n = cb.dataset.aval;
        P.discAval[n] = Array.prototype.filter.call(raiz.querySelectorAll('input[data-aval="'+n+'"]'), function(x){ return x.checked; }).map(function(x){ return +x.dataset.i; });
        salvar();
        var el = raiz.querySelector('[data-nota-est="'+n+'"]'); if(el) el.innerHTML = notaEstimada(+n);
      };
      painel.oninput = function(ev){
        var ta = ev.target.closest('textarea[data-rasc]'); if(!ta) return;
        P.discursivas[ta.dataset.rasc] = ta.value;
        var h = U.hoje(), dd = P.diario[h] = P.diario[h] || { min:0, q:0, cards:0, novos:0, mapas:[] };
        dd.disc = true;   /* conta como “escrevi uma discursiva hoje” */
        clearTimeout(timer);
        timer = setTimeout(function(){ salvar(); var s = raiz.querySelector('[data-salvo="'+ta.dataset.rasc+'"]'); if(s) s.textContent = 'Salvo ✓'; }, 500);
      };
      painel.onclick = function(ev){
        if(ev.target.id === 'd-all'){ M.discursivas.forEach(function(d){ dAbertas[d.n] = true; }); desenhaDisc(); return; }
        if(ev.target.id === 'd-none'){ dAbertas = {}; desenhaDisc(); return; }
        var ia = ev.target.closest('button[data-ia]');
        if(ia){ corrigirComIA(+ia.dataset.ia, ia); return; }
        var b = ev.target.closest('button[data-d]'); if(!b) return;
        var k = +b.dataset.d; dAbertas[k] = !dAbertas[k]; desenhaDisc();
      };
      desenhaDisc();
    }
    var temChaveIA = false;
    function notaEstimada(n){
      var d = M.discursivas.find(function(x){ return x.n === n; });
      var total = d && d.chaves ? d.chaves.length : 0, marc = (P.discAval[n] || []).length;
      if(!total) return '';
      var nota = Math.round(marc / total * 100) / 10;
      return 'Autoavaliação: <b>'+String(nota).replace('.', ',')+'</b> / 10 · '+marc+' de '+total+' pontos cobertos' +
        (marc && marc < total ? ' — releia a resposta modelo nos pontos que faltaram.' : marc === total ? ' — ótimo! 🎉' : '');
    }
    function corrigirComIA(n, botao){
      var d = M.discursivas.find(function(x){ return x.n === n; });
      botao.disabled = true; botao.textContent = 'Corrigindo… (leva alguns segundos)';
      window.api.corrigirDiscursiva({ enunciado:d.enunciado, chaves:d.chaves || [], modelo:d.modelo || '', resposta:P.discursivas[n] || '' })
        .then(function(r){ P.discIA[n] = Object.assign({ data:U.hoje() }, r); salvar(); desenhaDisc(); })
        .catch(function(e){ botao.disabled = false; botao.textContent = 'Corrigir com IA'; U.aviso(e.message, 6000); });
    }
    function blocoIA(n){
      var r = P.discIA[n]; if(!r) return '';
      var rot = { atendido:'✓ atendido', parcial:'◐ parcial', ausente:'✗ ausente' };
      return '<div class="ia-corr"><h6>Correção por IA · nota '+String(r.nota).replace('.', ',')+' / 10</h6>' +
        '<ul class="ia-pontos">' + (r.pontos || []).map(function(p){
          return '<li class="'+esc(p.situacao)+'"><b>'+(rot[p.situacao] || esc(p.situacao))+'</b> '+esc(p.ponto)+'<span>'+esc(p.comentario)+'</span></li>';
        }).join('') + '</ul><p>'+esc(r.comentario_geral || '')+'</p>' +
        (r.como_melhorar && r.como_melhorar.length ? '<h6>Como melhorar</h6><ul>' + r.como_melhorar.map(function(m){ return '<li>'+esc(m)+'</li>'; }).join('') + '</ul>' : '') + '</div>';
    }
    function desenhaDisc(){
      $('#disc').innerHTML = M.discursivas.map(function(d){
        var open = !!dAbertas[d.n], rasc = P.discursivas[d.n] || '', marc = P.discAval[d.n] || [];
        var corpo = open ? ('<div class="d-body"><h6>Pontos-chave — marque os que a sua resposta cobriu</h6>' +
          '<ul class="chk">' + (d.chaves || []).map(function(c, i){ return '<li><label><input type="checkbox" data-aval="'+d.n+'" data-i="'+i+'"'+(marc.indexOf(i) >= 0 ? ' checked' : '')+'> <span>'+esc(c)+'</span></label></li>'; }).join('') + '</ul>' +
          '<p class="nota-est" data-nota-est="'+d.n+'">'+notaEstimada(d.n)+'</p>' +
          (temChaveIA ? '<div class="d-acts" style="padding:0"><button class="ghost" data-ia="'+d.n+'"'+(rasc.trim().length < 20 ? ' disabled title="Escreva a resposta primeiro"' : '')+'>'+(P.discIA[d.n] ? 'Corrigir de novo com IA' : 'Corrigir com IA')+'</button></div>' : '') +
          blocoIA(d.n) +
          '<div class="modelo"><h6>Resposta modelo</h6>' + String(d.modelo || '').split(/\n\s*\n/).map(function(p){ return '<p>'+esc(p)+'</p>'; }).join('') + '</div></div>') : '';
        return '<article class="d" data-disc="'+d.n+'"><div class="d-head"><em>Questão'+d.n+' · '+esc(d.tema)+'</em><h4>'+esc(d.enunciado)+'</h4></div>' +
          '<div class="d-resp"><textarea data-rasc="'+d.n+'" placeholder="Escreva sua resposta aqui antes de ver o gabarito…">'+esc(rasc)+'</textarea>' +
          '<small data-salvo="'+d.n+'">'+(rasc ? 'Salvo ✓' : 'Salva sozinho enquanto você escreve.')+'</small></div>' +
          '<div class="d-acts"><button class="chip" data-d="'+d.n+'" aria-pressed="'+open+'">'+(open ? 'Fechar gabarito' : 'Ver pontos-chave e resposta modelo')+'</button></div>' +
          corpo + '</article>';
      }).join('');
    }

    /* ══════════ ATIVIDADES ══════════ */
    var ativFiltro = 'all';
    function renderAtiv(){
      var n = M.atividades.length;
      painel.innerHTML = hero('Prática · atividades dos slides', 'Atividades dos conteúdos',
        'Todo estudo de caso e toda atividade em sala das aulas, como estão no slide. Cada uma traz uma versão <strong>para fazer sozinho</strong> e um roteiro de resposta — que só abre depois que você tenta.',
        [[n,'atividades'],['<span id="k-feitas">0</span>','marcadas como feitas'],[new Set(M.atividades.map(function(a){ return a.n; })).size,'aulas cobertas']]) +
        (!n ? semConteudo() : '<div class="bar" id="ativ-bar"></div><div id="ativ"></div>');
      if(!n) return;
      painel.onclick = function(ev){
        var c = ev.target.closest('.chip[data-t]');
        if(c){ ativFiltro = c.dataset.t; desenhaAtiv(); return; }
        if(ev.target.id === 'at-limpar'){
          U.confirmar('Desmarcar todas?', 'Todas as atividades voltam a aparecer como não feitas.', 'Desmarcar').then(function(ok){
            if(ok){ P.atividades = {}; salvar(); desenhaAtiv(); }
          });
          return;
        }
        var g = ev.target.closest('button[data-guia]');
        if(g){ guiaAberta[g.dataset.guia] = !guiaAberta[g.dataset.guia]; desenhaAtiv(); return; }
        var f = ev.target.closest('button[data-feita]');
        if(f){ var id = f.dataset.feita; if(P.atividades[id]) delete P.atividades[id]; else P.atividades[id] = U.hoje(); salvar(); desenhaAtiv(); }
      };
      desenhaAtiv();
    }
    function desenhaAtiv(){
      var feitas = P.atividades;
      $('#k-feitas').textContent = M.atividades.filter(function(a){ return feitas[a.id]; }).length;
      $('#ativ-bar').innerHTML = [['all','Todas'],['caso','Estudos de caso'],['sala','Atividades em sala'],['aval','Avaliações']].map(function(x){
        return '<button class="chip" data-t="'+x[0]+'" aria-pressed="'+(ativFiltro===x[0])+'">'+x[1]+'</button>';
      }).join('') + '<span class="sep"></span><button class="chip" data-t="pend" aria-pressed="'+(ativFiltro==='pend')+'">Só as que faltam</button>' +
        '<button class="ghost" id="at-limpar">Desmarcar todas</button>';
      var lista = M.atividades.filter(function(a){
        if(ativFiltro === 'all') return true;
        if(ativFiltro === 'pend') return !feitas[a.id];
        return a.tipo === ativFiltro;
      });
      if(!lista.length){ $('#ativ').innerHTML = '<div class="empty">'+(ativFiltro === 'pend' ? '<b>Nada por aqui — você fez todas!</b>' : 'Nenhuma atividade deste tipo.')+'</div>'; return; }
      $('#ativ').innerHTML = lista.map(function(a){
        var aberta = !!guiaAberta[a.id], feita = !!feitas[a.id];
        return '<article class="at" data-ativ="'+esc(a.id)+'" data-feita="'+(feita?1:0)+'"><div class="at-top">' +
          '<button class="at-sel" data-feita="'+esc(a.id)+'" aria-label="Marcar como feita" title="Marcar como feita">✓</button>' +
          '<div class="at-h"><div class="at-tags"><span class="tipo '+esc(a.tipo)+'">'+(ROTULO_ATIV[a.tipo] || 'Atividade')+'</span><span class="tipo aula">Aula '+a.n+'</span></div>' +
          '<h4>'+esc(a.titulo)+'</h4></div></div>' +
          '<div class="at-body"><p class="at-slide">'+esc(a.enunciado)+'</p>' +
          (a.perguntas && a.perguntas.length ? '<ul class="at-perg">' + a.perguntas.map(function(p){ return '<li>'+esc(p)+'</li>'; }).join('') + '</ul>' : '') +
          (a.sozinho ? '<div class="at-so"><b>Para fazer sozinho</b>'+esc(a.sozinho)+'</div>' : '') +
          (a.guia && a.guia.length ? '<div class="at-acts"><button class="chip" data-guia="'+esc(a.id)+'" aria-pressed="'+aberta+'">'+(aberta ? 'Fechar roteiro' : 'Ver roteiro de resposta')+'</button></div>' +
          (aberta ? '<div class="at-guia"><b>Roteiro de resposta</b><ul>' + a.guia.map(function(g){ return '<li>'+esc(g)+'</li>'; }).join('') + '</ul></div>' : '') : '') +
          '</div></article>';
      }).join('');
    }

    /* ══════════ FÓRMULAS ══════════ */
    function renderForm(){
      painel.innerHTML = hero('Consulta rápida', 'Fórmulas e números',
        'O que precisa estar na memória no dia da prova: fórmulas, regras, custos e as classificações fechadas.') +
        (!M.formulas.length ? (vazio() ? semConteudo() : '<div class="empty"><b>Esta matéria não tem fórmulas para decorar.</b>Nada foi encontrado nos slides.</div>') :
        '<div class="fgrid">' + M.formulas.map(function(g){
          return '<div class="fcard"><h4>'+esc(g.g)+'</h4>' + (g.its || []).map(function(it){
            return '<div class="frow"><div class="k">'+esc(it.k)+'</div><div class="v">'+esc(it.v)+'</div><div class="n">'+esc(it.n)+'</div></div>';
          }).join('') + '</div>';
        }).join('') + '</div>');
    }

    /* ══════════ CONTEÚDOS ══════════ */
    function urlArquivo(rel){
      return (window.BASE_MATERIAS || 'app://ui/materias/') + encodeURIComponent(M.id) + '/' + rel.split('/').map(encodeURIComponent).join('/');
    }
    function renderArq(){
      var aulas = M.arquivos.filter(function(a){ return a.grupo === 'aulas'; }).sort(function(a,b){ return a.aula - b.aula; });
      var extras = M.arquivos.filter(function(a){ return a.grupo !== 'aulas'; });
      function cartao(it){
        var ic = it.tipo === 'pdf' ? 'PDF' : it.tipo === 'pptx' ? 'PPTX' : 'IMG';
        return '<button class="arq" data-arq="'+esc(it.id)+'" aria-pressed="'+(arqAberto===it.id)+'"><span class="ic '+esc(it.tipo)+'">'+ic+'</span>' +
          '<span class="tx"><b>'+esc(it.nome)+'</b><span>'+esc(it.nota || '')+'</span></span></button>';
      }
      painel.innerHTML = hero('Arquivo · material original', 'Tudo que você enviou',
        'Os slides das aulas e os outros arquivos da matéria. Dentro do PDF, <strong>selecione um trecho</strong> para pintar com o marca-texto (6 cores) ou enviar para o bloco de notas. Clique num trecho pintado para trocar a cor ou apagar.',
        [[aulas.length,'aulas'],[extras.length,'outros arquivos'],[totalDestaques(),'trechos marcados']]) +
        '<div id="visor" class="visor" hidden><div class="visor-bar"><strong id="visor-nome"></strong>' +
          '<button class="ghost" id="visor-dest" aria-pressed="false">🖍 Destaques</button>' +
          '<button class="ghost" id="visor-imprimir" title="Imprimir este PDF (com o que você escreveu, se quiser)">🖨 Imprimir</button>' +
          '<button class="btn so-pc" id="visor-salvar" title="Gera uma cópia do PDF com o que você escreveu (nome, respostas, ✓) — para entregar ao professor">💾 PDF preenchido</button>' +
          '<button class="ghost" id="visor-fora" title="Abrir no leitor de PDF do Windows">Abrir fora</button><button class="ghost" id="visor-fechar">Fechar</button></div>' +
        '<div class="visor-ferr">' +
          '<div class="caneta" id="caneta" role="group" aria-label="Caneta marca-texto">' +
            '<button class="caneta-bt" id="caneta-bt" aria-pressed="'+(!!P.caneta)+'" title="Caneta marca-texto: ligada, é só passar o mouse no texto que ele fica pintado (tecla M)">' + iconeCaneta(corHL(P.canetaCor || 'amarelo')) + '<span>Marca-texto</span></button>' +
            CORES_HL.map(function(c){ return '<button class="caneta-cor'+((P.canetaCor || 'amarelo') === c.id ? ' atual' : '')+'" data-caneta="'+c.id+'" title="'+esc(c.nome+' — '+legenda(c.id))+'" style="background:'+c.cor+'"></button>'; }).join('') +
          '</div>' +
          '<div class="escrever" role="group" aria-label="Escrever no PDF">' +
            '<button class="ferr-bt" data-ferr="texto" aria-pressed="false" title="Clique na página e digite: nome, matrícula, respostas (tecla T)"><b>T</b> Texto</button>' +
            '<button class="ferr-bt" data-ferr="check" aria-pressed="false" title="Clique para marcar ✓ (clique de novo num ✓ para apagar)">✓</button>' +
            '<button class="ferr-bt" data-ferr="xis" aria-pressed="false" title="Clique para marcar ✗">✗</button>' +
            ['#1F3FB0', '#111111', '#C62828'].map(function(c){ return '<button class="tinta-cor'+((P.tintaPdf || '#1F3FB0') === c ? ' atual' : '')+'" data-tinta="'+c+'" style="background:'+c+'" title="Cor da letra"></button>'; }).join('') +
            '<button class="ferr-bt" data-fs="-1" title="Letra menor">A−</button><span class="fs-val" id="fs-val">'+(P.fsPdf || 11)+'</span><button class="ferr-bt" data-fs="1" title="Letra maior">A+</button>' +
          '</div>' +
          '<button class="ghost" id="visor-marcar" aria-pressed="false" title="Marcar a página que está na tela (tecla B)">🔖 Marcar pág.</button>' +
          '<button class="ghost" id="visor-ocultas" aria-pressed="false" title="Mostrar ou esconder todas as palavras ocultas (tecla O)">🙈 Mostrar palavras</button>' +
        '</div>' +
          '<div class="dest-painel" id="dest-painel" hidden></div>' +
          '<div class="visor-box" id="visor-box"></div></div>' +
        /* resumos: primeiro da lista, com o botão de criar em destaque */
        '<div class="sec-head"><p class="eyebrow">Resumos</p><h2>📝 Seus resumos</h2></div><div class="arqs">' +
          '<button class="arq arq-novo-resumo" id="arq-criar-resumo"><span class="ic resumo">＋</span><span class="tx"><b>Criar resumo</b><span>Os pontos principais de qualquer material, prontos para imprimir</span></span></button>' +
          (M.resumos || []).slice().reverse().map(function(r){ return '<button class="arq" data-resumo="'+esc(r.id)+'"><span class="ic resumo">📝</span><span class="tx"><b>'+esc(r.titulo)+'</b><span>'+esc(new Date(r.criadoEm).toLocaleDateString('pt-BR'))+' · '+esc((r.fontes || []).length)+' arquivo(s)</span></span></button>'; }).join('') + '</div>' +
        (aulas.length ? '<div class="sec-head"><p class="eyebrow">Slides</p><h2>As aulas</h2></div><div class="arqs">' + aulas.map(cartao).join('') + '</div>' : '') +
        (extras.length ? '<div class="sec-head"><p class="eyebrow">Outros arquivos</p><h2>O que você mandou junto</h2></div><div class="arqs">' + extras.map(cartao).join('') + '</div>' : '') +
        (!M.arquivos.length ? '<div class="empty"><b>Nenhum arquivo ainda.</b>Adicione slides na aba Gerenciar.<br><button class="btn" data-ir="ger">Ir para Gerenciar</button></div>' : '');
      painel.onclick = function(ev){
        if(ev.target.closest('#arq-criar-resumo')){ criarResumo(); return; }
        var rs = ev.target.closest('[data-resumo]');
        if(rs){ var rr = (M.resumos || []).find(function(x){ return x.id === rs.dataset.resumo; }); if(rr) Resumo.ver(M, rr, function(){ opts.aoRecarregar().then(function(){ irPara('arq'); }); }); return; }
        var b = ev.target.closest('.arq'); if(b){ abrirArquivo(b.dataset.arq); return; }
        if(ev.target.id === 'visor-fechar'){ renderToken++; arqAberto = null; $('#visor').hidden = true; $('#visor-box').innerHTML = ''; marcaArq(); return; }
        if(ev.target.id === 'visor-fora'){ var it = achaArq(arqAberto); if(it) abrirFora(it); }
        if(ev.target.id === 'visor-dest'){ var p = $('#dest-painel'); p.hidden = !p.hidden; ev.target.setAttribute('aria-pressed', p.hidden ? 'false' : 'true'); desenharPainelDestaques(); }
        var fb = ev.target.closest('[data-ferr]'); if(fb){ escolherFerramenta(P.ferramenta === fb.dataset.ferr ? null : fb.dataset.ferr); return; }
        var tb = ev.target.closest('[data-tinta]'); if(tb){ P.tintaPdf = tb.dataset.tinta; salvar(); aplicarFerramentaVisual(); mudarAnotacaoAtiva({ cor:P.tintaPdf }); return; }
        var sb = ev.target.closest('[data-fs]'); if(sb){ P.fsPdf = Math.max(6, Math.min(36, (P.fsPdf || 11) + (+sb.dataset.fs))); salvar(); aplicarFerramentaVisual(); mudarAnotacaoAtiva({ fs:P.fsPdf }); return; }
        if(ev.target.closest('#visor-salvar')){ salvarPdfPreenchido(); return; }
        if(ev.target.closest('#visor-imprimir')){ salvarPdfPreenchido(true); return; }
        if(ev.target.id === 'visor-marcar'){ alternarMarcador(); return; }
        if(ev.target.id === 'visor-ocultas'){ alternarOcultas(); return; }
        if(ev.target.closest('#caneta-bt')){ ligarCaneta(!P.caneta); return; }
        var cc = ev.target.closest('[data-caneta]'); if(cc){ P.canetaCor = cc.dataset.caneta; ligarCaneta(true); }
      };
      /* selecionar texto no PDF → barra do marca-texto; clicar num trecho pintado → editar */
      var box = $('#visor-box');
      /* enquanto arrasta, a camada de texto “segura” a seleção (ver endOfContent) */
      box.addEventListener('mousedown', function(ev){
        var tl = ev.target.closest && ev.target.closest('.textLayer'); if(tl) tl.classList.add('selecting');
      });
      if(!soltarLigado){ soltarLigado = true; document.addEventListener('mouseup', soltarSelecao); }
      box.addEventListener('mouseup', function(ev){ setTimeout(function(){ aoSoltarNoSlide(ev); }, 10); });
      box.addEventListener('click', function(ev){ if(!cliqueSobreposicao(ev)) cliqueEscrever(ev); });
      ligarEdicaoAnotacoes(box);
      var timerMarc = null, topoAntes = box.scrollTop;
      /* só fecha menus/balões quando a pessoa rola de verdade: enquanto o PDF
         ainda desenha as páginas, o visor dá pequenos “pulos” que não contam */
      box.addEventListener('scroll', function(){
        clearTimeout(timerMarc); timerMarc = setTimeout(atualizarBotaoMarcador, 150);
        if(Math.abs(box.scrollTop - topoAntes) < 40) return;
        topoAntes = box.scrollTop;
        fecharBolha(); esconderBarraAnot(); esconderBotaoTrecho();
      });
      box.style.overflowAnchor = 'none';
      box.addEventListener('menu-aberto', function(){ topoAntes = box.scrollTop; });   /* conta a rolagem a partir de agora */
      aplicarCanetaVisual(); aplicarFerramentaVisual();
      $('#dest-painel').addEventListener('click', cliquePainelDestaques);
      if(arqAberto) abrirArquivo(arqAberto, arqPagina);
    }

    /* ── marca-texto nos slides ─────────────────────────── */
    /* cores de caneta marca-texto (vivas; o texto continua legível por “multiply”) */
    var CORES_HL = [
      { id:'vermelho', cor:'#FF6B7A', nome:'Vermelho' }, { id:'laranja', cor:'#FFAA33', nome:'Laranja' },
      { id:'amarelo', cor:'#FFEE33', nome:'Amarelo' }, { id:'verde', cor:'#5CE65C', nome:'Verde' },
      { id:'azul', cor:'#33D6FF', nome:'Azul' }, { id:'roxo', cor:'#C58CFF', nome:'Roxo' }
    ];
    var LEGENDA_PADRAO = { vermelho:'Cai na prova', laranja:'Revisar', amarelo:'Definição', verde:'Exemplo', azul:'Não entendi', roxo:'Fórmula / número' };
    var filtroCorHL = null, trecho = null;
    function legenda(id){ return (P.legendaHL && P.legendaHL[id]) || LEGENDA_PADRAO[id]; }
    function corHL(id){ var c = CORES_HL.find(function(x){ return x.id === id; }); return c ? c.cor : '#FFE14D'; }
    function destaquesDe(arqId){ P.destaques = P.destaques || {}; return P.destaques[arqId] = P.destaques[arqId] || []; }
    /* itens do PDF: marca-texto (sem tipo), 'oculta' (palavra-chave coberta) e 'nota' (asterisco com texto) */
    function soMarcas(l){ return l.filter(function(d){ return !d.tipo; }); }
    function marcadoresDe(arqId){ P.marcadores = P.marcadores || {}; return P.marcadores[arqId] = P.marcadores[arqId] || []; }
    var revelados = {}, mostrarOcultas = false;   /* só nesta sessão: ao reabrir, tudo volta escondido */
    function novoIdHL(){ return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
    function totalDestaques(){ var t = 0; Object.keys(P.destaques || {}).forEach(function(k){ t += P.destaques[k].length; }); return t; }

    /* pinta os trechos marcados de uma página (retângulos em fração da página) */
    function desenharDestaquesPagina(env){
      if(!env || !arqAberto) return;
      var cam = env.querySelector('.hl-camada');
      if(!cam){ cam = document.createElement('div'); cam.className = 'hl-camada'; env.insertBefore(cam, env.querySelector('.textLayer')); }
      var pg = +env.dataset.pg;
      var daPagina = destaquesDe(arqAberto).filter(function(d){ return d.pg === pg; });
      var pct = function(v){ return (v * 100) + '%'; };
      /* marca-texto: uma faixa contínua por linha, um pouco mais alta que o texto (como caneta);
         trecho com nota: sublinhado pontilhado */
      cam.innerHTML = daPagina.filter(function(d){ return !d.tipo || d.tipo === 'nota'; }).map(function(d){
        return juntarLinhas(d.rects).map(function(r){
          if(d.tipo === 'nota') return '<i class="sub-nota" style="left:'+pct(r[0])+';top:'+pct(r[1] + r[3] * 0.94)+';width:'+pct(r[2])+'"></i>';
          var folga = r[3] * 0.12;
          return '<i data-hl="'+d.id+'" style="left:'+pct(r[0] - r[3] * 0.08)+';top:'+pct(r[1] - folga)+';width:'+pct(r[2] + r[3] * 0.16)+';height:'+pct(r[3] + 2 * folga)+';background:'+corHL(d.cor)+'"></i>';
        }).join('');
      }).join('');
      /* por cima do texto: palavras ocultas (caixa que revela ao clicar), asteriscos das notas e a fita do marcador */
      var sob = env.querySelector('.oc-camada');
      if(!sob){ sob = document.createElement('div'); sob.className = 'oc-camada'; env.appendChild(sob); }
      sob.innerHTML = daPagina.filter(function(d){ return d.tipo === 'oculta'; }).map(function(d){
          var aberta = mostrarOcultas || revelados[d.id];
          return juntarLinhas(d.rects).map(function(r, i){
            var f = r[3] * 0.14;
            return '<b class="oc'+(aberta ? ' aberta' : '')+'" data-oc="'+d.id+'" title="'+(aberta ? 'Clique para esconder de novo' : 'Palavra-chave escondida: tente lembrar e clique para ver')+'" style="left:'+pct(r[0] - f)+';top:'+pct(r[1] - f)+';width:'+pct(r[2] + 2 * f)+';height:'+pct(r[3] + 2 * f)+'">' +
              (i === 0 && !aberta ? '<span>?</span>' : '') + (i === 0 && aberta ? '<em class="oc-x" data-oc-del="'+d.id+'" title="Apagar esta palavra oculta">✕</em>' : '') + '</b>';
          }).join('');
        }).join('') +
        daPagina.filter(function(d){ return d.tipo === 'nota'; }).map(function(d){
          return '<button class="nota-pin" data-nota="'+d.id+'" title="Nota: clique para ler" style="left:'+pct(d.pos[0])+';top:'+pct(d.pos[1])+'">✱</button>';
        }).join('') +
        (marcadoresDe(arqAberto).some(function(m){ return m.pg === pg; }) ? '<span class="fita" title="Página marcada">🔖</span>' : '');
      desenharAnotacoes(env);
    }
    function redesenharDestaques(){ Array.prototype.forEach.call(raiz.querySelectorAll('#visor-box .pg'), desenharDestaquesPagina); }

    function aoSoltarNoSlide(ev){
      /* clique numa palavra oculta ou num ✱: quem cuida é cliqueSobreposicao */
      if(ev.target.closest && ev.target.closest('.oc-camada [data-oc], .oc-camada [data-nota], .oc-x, .an-camada > *')) return;
      if(P.ferramenta) return;   /* escrevendo no PDF: sem menu do marca-texto */
      var sel = window.getSelection(), txt = sel ? sel.toString().replace(/\s+/g, ' ').trim() : '';
      esconderBotaoTrecho();
      var it = achaArq(arqAberto);
      if(txt.length >= 2 && sel.rangeCount){
        var no = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
        var pgEl = no && no.closest('.pg'); if(!pgEl || !raiz.contains(pgEl)) return;
        var pr = pgEl.getBoundingClientRect(), vistos = {};
        /* só os retângulos da própria página, sem repetidos */
        var rects = Array.prototype.filter.call(sel.getRangeAt(0).getClientRects(), function(r){
          return r.width > 1 && r.height > 2 && r.bottom > pr.top && r.top < pr.bottom && r.right > pr.left && r.left < pr.right;
        }).map(function(r){
          return [ (r.left - pr.left) / pr.width, (r.top - pr.top) / pr.height, r.width / pr.width, r.height / pr.height ].map(function(v){ return Math.round(v * 10000) / 10000; });
        }).filter(function(r){ var k = r.join(','); if(vistos[k]) return false; vistos[k] = 1; return true; });
        if(!rects.length) return;
        rects = juntarLinhas(rects).map(function(r){ return r.map(function(v){ return Math.round(v * 10000) / 10000; }); });
        trecho = { novo:true, texto:txt, pg:+pgEl.dataset.pg, rects:rects, ref:(it ? it.nome : 'slide') + ', pág. ' + pgEl.dataset.pg };
        /* caneta ligada: pinta na hora, sem menu */
        if(P.caneta){ marcarCor(P.canetaCor || 'amarelo'); return; }
        /* posição: junto à ÚLTIMA linha selecionada que está visível (onde o
           mouse foi solto) — o começo da seleção pode já ter rolado para fora */
        var vb = $('#visor-box').getBoundingClientRect();
        var visiveis = Array.prototype.filter.call(sel.getRangeAt(0).getClientRects(), function(q){
          return q.width > 1 && q.bottom > vb.top && q.top < vb.bottom;
        });
        var ult = visiveis[visiveis.length - 1];
        if(ult) mostrarBarra(ult.right - Math.min(ult.width, 160) / 2, ult.top, ult.bottom, vb);
        else mostrarBarra(vb.left + vb.width / 2, vb.top + 60, vb.top + 60, vb);
        return;
      }
      /* clique simples: acertou um trecho pintado? */
      var env = ev.target.closest && ev.target.closest('.pg'); if(!env) return;
      var r = env.getBoundingClientRect(), fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
      var d = soMarcas(destaquesDe(arqAberto)).filter(function(x){ return x.pg === +env.dataset.pg; }).find(function(x){
        return x.rects.some(function(q){ return fx >= q[0] && fx <= q[0] + q[2] && fy >= q[1] && fy <= q[1] + q[3]; });
      });
      if(!d) return;
      trecho = { novo:false, id:d.id, texto:d.texto, ref:(it ? it.nome : 'slide') + ', pág. ' + d.pg };
      mostrarBarra(ev.clientX, ev.clientY - 6, ev.clientY + 6, $('#visor-box').getBoundingClientRect());
    }
    function mostrarBarra(x, topo, base, area){
      var bx = $('#visor-box');
      if(bx) bx.dispatchEvent(new CustomEvent('menu-aberto'));
      var b = document.createElement('div');
      b.id = 'trecho-bt'; b.className = 'hl-barra'; b.setAttribute('role', 'toolbar');
      var atual = !trecho.novo && destaquesDe(arqAberto).find(function(d){ return d.id === trecho.id; });
      b.innerHTML = CORES_HL.map(function(c){
          return '<button class="hl-cor'+(atual && atual.cor === c.id ? ' atual' : '')+'" data-cor="'+c.id+'" title="'+esc(c.nome+' — '+legenda(c.id))+'" style="background:'+c.cor+'"></button>';
        }).join('') +
        (trecho.novo ? '' : '<button class="hl-acao" data-hl-del title="Apagar o destaque">🗑</button>') +
        (trecho.novo ? '<span class="hl-sep"></span><button class="hl-acao" data-hl-oc title="Esconder esta palavra-chave: fica coberta e aparece quando você clicar">🙈 Ocultar</button>' +
          '<button class="hl-acao" data-hl-nt title="Escrever uma nota: aparece um ✱ no texto e ela abre ao clicar">✱ Nota</button>' : '') +
        '<button class="hl-acao" data-hl-nota title="Enviar para o bloco de notas">📝 Notas</button>';
      document.body.appendChild(b);
      /* acima da linha; se não couber dentro do visor (ou bater no cabeçalho), abaixo dela */
      var limiteSup = Math.max(area ? area.top : 0, (($('.top') || {}).offsetHeight || 60)) + 6;
      var y = topo - b.offsetHeight - 8;
      if(y < limiteSup) y = base + 8;
      b.style.left = Math.max(8, Math.min(window.innerWidth - b.offsetWidth - 8, x - b.offsetWidth / 2)) + 'px';
      b.style.top = Math.max(8, Math.min(window.innerHeight - b.offsetHeight - 8, y)) + 'px';
      b.onmousedown = function(e){ e.preventDefault(); };   /* não perder a seleção */
      b.onclick = function(e){
        var c = e.target.closest('[data-cor]');
        if(c) marcarCor(c.dataset.cor);
        else if(e.target.closest('[data-hl-del]')) apagarDestaque(trecho.id);
        else if(e.target.closest('[data-hl-nota]')) enviarTrecho();
        else if(e.target.closest('[data-hl-oc]')) ocultarTrecho();
        else if(e.target.closest('[data-hl-nt]')) editarNota(null);
      };
    }

    /* ── palavras-chave ocultas e notas com asterisco ── */
    function ocultarTrecho(){
      if(!trecho || !trecho.novo) return;
      destaquesDe(arqAberto).push({ id:novoIdHL(), tipo:'oculta', pg:trecho.pg, rects:trecho.rects, texto:trecho.texto, data:U.hoje() });
      salvar(); esconderBotaoTrecho(); window.getSelection().removeAllRanges();
      redesenharDestaques(); desenharPainelDestaques(); atualizarContadorDest();
      U.aviso('Escondida! Clique na caixa quando quiser ver a palavra.', 3000);
    }
    /* nova nota (sobre o trecho selecionado) ou edição de uma existente */
    function editarNota(id){
      var d = id ? destaquesDe(arqAberto).find(function(x){ return x.id === id; }) : null;
      var alvo = d ? { texto:d.texto } : trecho;
      if(!alvo) return;
      var guardado = d ? null : Object.assign({}, trecho);
      esconderBotaoTrecho();
      U.modal('<h2>✱ ' + (d ? 'Editar nota' : 'Nova nota') + '</h2><p class="nota-sobre">Sobre: “' + esc(String(alvo.texto).slice(0, 180)) + (alvo.texto.length > 180 ? '…' : '') + '”</p>' +
        '<label class="campo"><span>Sua anotação (fica escondida atrás do ✱ até você clicar)</span><textarea id="nt-txt" rows="4" maxlength="1500" placeholder="Ex.: Ou seja, verificação = processo; validação = produto.">' + esc(d ? d.nota : '') + '</textarea></label>' +
        '<div class="modal-acts">' + (d ? '<button class="ghost" id="nt-del" style="margin-right:auto;color:var(--bad)">Apagar nota</button>' : '') +
        '<button class="ghost" id="nt-cancelar">Cancelar</button><button class="btn" id="nt-ok">Salvar</button></div>',
        function(el, fechar){
          var t = el.querySelector('#nt-txt');
          t.addEventListener('keydown', function(ev){ ev.stopPropagation(); });
          el.querySelector('#nt-cancelar').onclick = fechar;
          if(d) el.querySelector('#nt-del').onclick = function(){ fechar(); apagarDestaque(d.id); };
          el.querySelector('#nt-ok').onclick = function(){
            var txt = t.value.trim();
            if(!txt){ t.focus(); return; }
            if(d) d.nota = txt;
            else {
              var ult = guardado.rects[guardado.rects.length - 1];
              destaquesDe(arqAberto).push({ id:novoIdHL(), tipo:'nota', pg:guardado.pg, rects:guardado.rects, texto:guardado.texto, nota:txt,
                pos:[Math.min(0.97, ult[0] + ult[2] + 0.002), Math.max(0, ult[1] - ult[3] * 0.35)], data:U.hoje() });
            }
            salvar(); fechar(); window.getSelection().removeAllRanges();
            redesenharDestaques(); desenharPainelDestaques(); atualizarContadorDest();
          };
          setTimeout(function(){ t.focus(); }, 30);
        });
    }
    /* clicar no ✱: a nota aparece num balão junto dele */
    function abrirNota(id, pin){
      var aberta = document.getElementById('nota-bolha');
      if(aberta && aberta.dataset.nota === id){ fecharBolha(); return; }   /* clicou de novo no ✱: fecha */
      fecharBolha();
      var d = destaquesDe(arqAberto).find(function(x){ return x.id === id; }); if(!d) return;
      var b = document.createElement('div');
      b.className = 'nota-bolha'; b.id = 'nota-bolha'; b.dataset.nota = id;
      b.title = 'Clique para fechar';
      b.innerHTML = '<p class="nb-txt">' + esc(d.nota).replace(/\n/g, '<br>') + '</p><p class="nb-sobre">“' + esc(String(d.texto).slice(0, 120)) + (d.texto.length > 120 ? '…' : '') + '”</p>' +
        '<div class="nb-acts"><button class="hl-acao" data-nb="editar">✎ Editar</button><button class="hl-acao" data-nb="notas">📝 Para o bloco</button><button class="hl-acao" data-nb="fechar">Fechar</button></div>';
      document.body.appendChild(b);
      var r = pin.getBoundingClientRect();
      b.style.left = Math.max(8, Math.min(window.innerWidth - b.offsetWidth - 8, r.left - b.offsetWidth / 2 + r.width / 2)) + 'px';
      var y = r.bottom + 8; if(y + b.offsetHeight > window.innerHeight - 8) y = r.top - b.offsetHeight - 8;
      b.style.top = Math.max(8, y) + 'px';
      /* clique fora do balão (e fora do ✱) também fecha */
      setTimeout(function(){ document.addEventListener('mousedown', foraDaBolha, true); }, 0);
      b.onclick = function(e){
        var a = e.target.closest('[data-nb]'); if(!a){ fecharBolha(); return; }   /* clique no balão: fecha */
        if(a.dataset.nb === 'editar'){ fecharBolha(); editarNota(id); }
        else if(a.dataset.nb === 'notas'){ if(window.Notas) Notas.anexar('✱ ' + d.nota + '\n❝ ' + d.texto + ' ❞\n— ' + (achaArq(arqAberto) || {}).nome + ', pág. ' + d.pg); fecharBolha(); U.aviso('Nota enviada para o bloco de notas'); }
        else fecharBolha();
      };
    }
    function fecharBolha(){ document.removeEventListener('mousedown', foraDaBolha, true); var b = document.getElementById('nota-bolha'); if(b) b.remove(); }
    function foraDaBolha(e){ if(!e.target.closest('#nota-bolha, [data-nota]')) fecharBolha(); }
    /* clique nas caixas ocultas, nos ✕ e nos asteriscos */
    function cliqueSobreposicao(ev){
      var x = ev.target.closest('[data-oc-del]');
      if(x){ ev.stopPropagation(); apagarDestaque(x.dataset.ocDel); return true; }
      var oc = ev.target.closest('[data-oc]');
      if(oc){ ev.stopPropagation(); revelados[oc.dataset.oc] = !revelados[oc.dataset.oc]; redesenharDestaques(); return true; }
      var pin = ev.target.closest('[data-nota]');
      if(pin){ ev.stopPropagation(); abrirNota(pin.dataset.nota, pin); return true; }
      return false;
    }

    /* ── escrever no PDF: caixas de texto e marcas ✓ / ✗ ──
       P.anotacoes[arq] = [{ id, tipo:'texto'|'check'|'xis', pg, x, y (fração da página),
       fs (tamanho em pontos do PDF), cor, texto }]. “💾 PDF preenchido” grava numa cópia. */
    function anotacoesDe(arqId){ P.anotacoes = P.anotacoes || {}; return P.anotacoes[arqId] = P.anotacoes[arqId] || []; }
    var anotAtiva = null;   /* id da caixa de texto em edição */
    function escolherFerramenta(f){
      P.ferramenta = f || null;
      if(P.ferramenta && P.caneta){ P.caneta = false; aplicarCanetaVisual(); }
      salvar(); aplicarFerramentaVisual();
      if(f) U.aviso(f === 'texto' ? 'Clique na página onde quer escrever (nome, resposta…).' : 'Clique onde quer marcar ' + (f === 'check' ? '✓' : '✗') + '. Clique numa marca para apagar.', 3000);
    }
    function aplicarFerramentaVisual(){
      Array.prototype.forEach.call(raiz.querySelectorAll('[data-ferr]'), function(b){ b.setAttribute('aria-pressed', P.ferramenta === b.dataset.ferr ? 'true' : 'false'); });
      Array.prototype.forEach.call(raiz.querySelectorAll('[data-tinta]'), function(b){ b.classList.toggle('atual', b.dataset.tinta === (P.tintaPdf || '#1F3FB0')); });
      var fv = $('#fs-val'); if(fv) fv.textContent = P.fsPdf || 11;
      var box = $('#visor-box'); if(box){ box.classList.toggle('modo-texto', P.ferramenta === 'texto'); box.classList.toggle('modo-marca', P.ferramenta === 'check' || P.ferramenta === 'xis'); }
    }
    /* px na tela para um tamanho em pontos, nesta página */
    function ptParaPx(env, pt){ return pt * env.clientWidth / (+env.dataset.ptw || 595); }
    function desenharAnotacoes(env){
      var pg = +env.dataset.pg;
      var cam = env.querySelector('.an-camada');
      if(!cam){ cam = document.createElement('div'); cam.className = 'an-camada'; env.appendChild(cam); }
      cam.innerHTML = anotacoesDe(arqAberto).filter(function(a){ return a.pg === pg; }).map(function(a){
        var pos = 'left:' + (a.x * 100) + '%;top:' + (a.y * 100) + '%;font-size:' + ptParaPx(env, a.fs) + 'px;color:' + esc(a.cor) + ';';
        if(a.tipo === 'texto') return '<div class="an-txt" data-an="'+a.id+'" contenteditable="true" spellcheck="true" style="'+pos+'max-width:'+((1 - a.x) * 100)+'%">'+esc(a.texto)+'</div>';
        return '<b class="an-marca" data-an="'+a.id+'" title="Clique com a ferramenta ✓/✗ ligada para apagar" style="'+pos+'">'+(a.tipo === 'check' ? '✓' : '✗')+'</b>';
      }).join('');
    }
    function acharAnot(id){ return anotacoesDe(arqAberto).find(function(a){ return a.id === id; }); }
    function mudarAnotacaoAtiva(mudanca){
      var a = anotAtiva && acharAnot(anotAtiva); if(!a) return;
      Object.assign(a, mudanca); salvar();
      var el = raiz.querySelector('.an-txt[data-an="'+a.id+'"]');
      if(el){ var env = el.closest('.pg'); el.style.color = a.cor; el.style.fontSize = ptParaPx(env, a.fs) + 'px'; el.focus(); }
    }
    /* clique na página com uma ferramenta ligada */
    function cliqueEscrever(ev){
      if(!P.ferramenta) return false;
      var env = ev.target.closest('.pg'); if(!env) return false;
      var marca = ev.target.closest('.an-marca');
      if(marca && (P.ferramenta === 'check' || P.ferramenta === 'xis')){
        P.anotacoes[arqAberto] = anotacoesDe(arqAberto).filter(function(a){ return a.id !== marca.dataset.an; });
        salvar(); desenharAnotacoes(env); return true;
      }
      if(ev.target.closest('.an-txt, .an-barra')) return true;
      var r = env.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      var fs = P.fsPdf || 11, id = 'a' + Date.now().toString(36);
      if(P.ferramenta === 'texto'){
        /* a caixa começa com o cursor onde se clicou (meia linha acima) */
        var meiaLinha = ptParaPx(env, fs) * 0.6 / r.height;
        anotacoesDe(arqAberto).push({ id:id, tipo:'texto', pg:+env.dataset.pg, x:x, y:Math.max(0, y - meiaLinha), fs:fs, cor:P.tintaPdf || '#1F3FB0', texto:'' });
        desenharAnotacoes(env);
        var el = env.querySelector('.an-txt[data-an="'+id+'"]'); if(el) el.focus();
      } else {
        var meio = ptParaPx(env, fs) * 0.55;
        anotacoesDe(arqAberto).push({ id:id, tipo:P.ferramenta, pg:+env.dataset.pg, x:Math.max(0, x - meio / r.width), y:Math.max(0, y - meio / r.height), fs:fs, cor:P.tintaPdf || '#1F3FB0' });
        salvar(); desenharAnotacoes(env);
      }
      return true;
    }
    /* edição das caixas de texto: salvar ao digitar, barra de opções, arrastar, apagar */
    var timerAnot = null;
    function ligarEdicaoAnotacoes(box){
      box.addEventListener('input', function(ev){
        var el = ev.target.closest && ev.target.closest('.an-txt'); if(!el) return;
        var a = acharAnot(el.dataset.an); if(!a) return;
        a.texto = el.innerText.replace(/\n$/, '');
        clearTimeout(timerAnot); timerAnot = setTimeout(salvar, 400);
      });
      box.addEventListener('keydown', function(ev){
        if(!ev.target.closest || !ev.target.closest('.an-txt')) return;
        ev.stopPropagation();   /* as teclas do app (A–E, B, M, O…) não disparam enquanto escreve */
        if(ev.key === 'Escape') ev.target.blur();
      });
      box.addEventListener('focusin', function(ev){
        var el = ev.target.closest && ev.target.closest('.an-txt'); if(!el) return;
        anotAtiva = el.dataset.an; mostrarBarraAnot(el);
      });
      box.addEventListener('focusout', function(ev){
        var el = ev.target.closest && ev.target.closest('.an-txt'); if(!el) return;
        setTimeout(function(){
          if(document.activeElement && document.activeElement.closest && document.activeElement.closest('.an-barra')) return;
          var a = acharAnot(el.dataset.an);
          if(a && !a.texto.trim()){ P.anotacoes[arqAberto] = anotacoesDe(arqAberto).filter(function(x){ return x !== a; }); el.remove(); }
          salvar(); esconderBarraAnot(); anotAtiva = null;
        }, 150);
      });
    }
    function esconderBarraAnot(){ var b = document.getElementById('an-barra'); if(b) b.remove(); }
    function mostrarBarraAnot(el){
      esconderBarraAnot();
      var b = document.createElement('div'); b.id = 'an-barra'; b.className = 'an-barra';
      b.innerHTML = '<button data-ab="mover" title="Arraste para mover">⠿ mover</button><button data-ab="menor" title="Letra menor">A−</button><button data-ab="maior" title="Letra maior">A+</button>' +
        ['#1F3FB0', '#111111', '#C62828'].map(function(c){ return '<button class="tinta-cor" data-ab-cor="'+c+'" style="background:'+c+'"></button>'; }).join('') +
        '<button data-ab="apagar" title="Apagar esta caixa">🗑</button>';
      document.body.appendChild(b);
      var pos = function(){ var r = el.getBoundingClientRect(); b.style.left = Math.max(8, r.left) + 'px'; b.style.top = Math.max(8, r.top - b.offsetHeight - 6) + 'px'; };
      pos();
      b.addEventListener('mousedown', function(e){
        e.preventDefault();   /* não tira o foco da caixa */
        var a = acharAnot(el.dataset.an); if(!a) return;
        var bt = e.target.closest('button'); if(!bt) return;
        if(bt.dataset.ab === 'mover'){
          var env = el.closest('.pg'), r0 = env.getBoundingClientRect(), dx = e.clientX, dy = e.clientY, x0 = a.x, y0 = a.y;
          var mv = function(m){ a.x = Math.max(0, Math.min(0.95, x0 + (m.clientX - dx) / r0.width)); a.y = Math.max(0, Math.min(0.97, y0 + (m.clientY - dy) / r0.height)); el.style.left = a.x * 100 + '%'; el.style.top = a.y * 100 + '%'; el.style.maxWidth = (1 - a.x) * 100 + '%'; pos(); };
          var up = function(){ document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); salvar(); el.focus(); };
          document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
          return;
        }
        if(bt.dataset.ab === 'menor' || bt.dataset.ab === 'maior'){ a.fs = Math.max(6, Math.min(36, a.fs + (bt.dataset.ab === 'maior' ? 1 : -1))); el.style.fontSize = ptParaPx(el.closest('.pg'), a.fs) + 'px'; salvar(); pos(); return; }
        if(bt.dataset.abCor){ a.cor = bt.dataset.abCor; el.style.color = a.cor; salvar(); return; }
        if(bt.dataset.ab === 'apagar'){ P.anotacoes[arqAberto] = anotacoesDe(arqAberto).filter(function(x){ return x !== a; }); salvar(); esconderBarraAnot(); el.remove(); anotAtiva = null; }
      });
    }
    /* grava tudo numa cópia do PDF (o original não muda) — ou imprime */
    function salvarPdfPreenchido(imprimir){
      var it = achaArq(arqAberto); if(!it || it.tipo !== 'pdf') return;
      var an = anotacoesDe(arqAberto).filter(function(a){ return a.tipo !== 'texto' || (a.texto || '').trim(); });
      var hl = soMarcas(destaquesDe(arqAberto));
      var nt = destaquesDe(arqAberto).filter(function(d){ return d.tipo === 'nota'; });
      var oc = destaquesDe(arqAberto).filter(function(d){ return d.tipo === 'oculta'; });
      /* imprimir: tudo marcado (é o seu material de estudo); entregar: só o que o professor precisa ver */
      var chk = function(id, n, marcado){ return '<input type="checkbox" id="'+id+'"' + (!n ? ' disabled' : marcado ? ' checked' : '') + '>'; };
      U.modal('<h2>' + (imprimir ? '🖨 Imprimir' : '💾 Salvar PDF preenchido') + '</h2><p>' + (imprimir
          ? 'Imprime “' + esc(it.nome) + '” com as suas alterações. Escolha o que vai para o papel:'
          : 'Cria uma <b>cópia</b> de “' + esc(it.nome) + '” com as suas alterações, pronta para entregar ou guardar. O arquivo original continua igual.') + '</p>' +
        '<label class="chk-linha">' + chk('pp-an', an.length, true) + ' O que escrevi: ' + an.filter(function(a){ return a.tipo === 'texto'; }).length + ' caixa(s) de texto e ' + an.filter(function(a){ return a.tipo !== 'texto'; }).length + ' marca(s) ✓ / ✗</label>' +
        '<label class="chk-linha">' + chk('pp-hl', hl.length, imprimir) + ' Marca-texto (' + hl.length + ' trecho(s))</label>' +
        '<label class="chk-linha">' + chk('pp-nt', nt.length, imprimir) + ' Notas ✱ (' + nt.length + ') — trecho sublinhado com número e uma folha “Minhas notas” no fim</label>' +
        '<label class="chk-linha">' + chk('pp-oc', oc.length, false) + ' Palavras ocultas cobertas por uma tarja (' + oc.length + ') — para treinar no papel</label>' +
        '<p class="nota-guia">Os marcadores 🔖 são só para navegar no app e não vão para o papel.' + (imprimir ? '' : ' Se for entregar ao professor, deixe marcado só “O que escrevi”.') + '</p>' +
        '<div class="msg-erro" id="pp-erro"></div><div class="modal-acts"><button class="ghost" id="pp-cancelar">Cancelar</button><button class="btn" id="pp-ok">' + (imprimir ? '🖨 Imprimir' : 'Salvar cópia') + '</button></div>',
        function(el, fechar){
          el.querySelector('#pp-cancelar').onclick = fechar;
          el.querySelector('#pp-ok').onclick = function(){
            var b = this, rotulo = b.textContent; b.disabled = true; b.textContent = imprimir ? 'Preparando as páginas…' : 'Gerando…';
            var dados = { materiaId:M.id, caminho:it.caminho, nome:it.nome, anotacoes: el.querySelector('#pp-an').checked ? an : [],
              destaques: el.querySelector('#pp-hl').checked ? hl.map(function(d){ return { pg:d.pg, rects:juntarLinhas(d.rects), cor:corHL(d.cor) }; }) : [],
              notas: el.querySelector('#pp-nt').checked ? nt.map(function(d){ return { pg:d.pg, rects:juntarLinhas(d.rects), pos:d.pos, texto:d.texto, nota:d.nota }; }) : [],
              ocultas: el.querySelector('#pp-oc').checked ? oc.map(function(d){ return { pg:d.pg, rects:juntarLinhas(d.rects) }; }) : [] };
            (imprimir ? window.api.imprimirPdf(dados) : window.api.pdfPreenchido(dados))
              .then(function(r){ fechar(); if(r && !imprimir) U.aviso('PDF salvo e aberto: ' + r.split(/[\\/]/).pop(), 5000); })
              .catch(function(e){ b.disabled = false; b.textContent = rotulo; el.querySelector('#pp-erro').textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); });
          };
        });
    }

    /* ── marcador de página (🔖) ── */
    function alternarMarcador(){
      if(!arqAberto) return;
      var pg = paginaVisivel(), l = marcadoresDe(arqAberto), ja = l.find(function(m){ return m.pg === pg; });
      if(ja) P.marcadores[arqAberto] = l.filter(function(m){ return m !== ja; });
      else l.push({ id:'m' + Date.now().toString(36), pg:pg, data:U.hoje() });
      salvar(); redesenharDestaques(); desenharPainelDestaques(); atualizarBotaoMarcador(); atualizarContadorDest();
      U.aviso(ja ? 'Marcador da página ' + pg + ' removido' : 'Página ' + pg + ' marcada 🔖', 2200);
    }
    function atualizarBotaoMarcador(){
      var b = $('#visor-marcar'); if(!b || !arqAberto) return;
      var pg = paginaVisivel(), marcada = marcadoresDe(arqAberto).some(function(m){ return m.pg === pg; });
      b.setAttribute('aria-pressed', marcada ? 'true' : 'false');
      b.textContent = marcada ? '🔖 Pág. ' + pg + ' marcada' : '🔖 Marcar pág. ' + pg;
    }
    function alternarOcultas(){
      mostrarOcultas = !mostrarOcultas; revelados = {};
      redesenharDestaques();
      var b = $('#visor-ocultas'); if(b){ b.setAttribute('aria-pressed', mostrarOcultas ? 'true' : 'false'); b.textContent = mostrarOcultas ? '🙉 Esconder palavras' : '🙈 Mostrar palavras'; }
    }
    function marcarCor(cor){
      if(trecho.novo){
        destaquesDe(arqAberto).push({ id:novoIdHL(), pg:trecho.pg, rects:trecho.rects, cor:cor, texto:trecho.texto, data:U.hoje() });
      } else {
        var d = destaquesDe(arqAberto).find(function(x){ return x.id === trecho.id; }); if(d) d.cor = cor;
      }
      salvar(); esconderBotaoTrecho(); window.getSelection().removeAllRanges();
      redesenharDestaques(); desenharPainelDestaques(); atualizarContadorDest();
    }
    function apagarDestaque(id){
      P.destaques[arqAberto] = destaquesDe(arqAberto).filter(function(d){ return d.id !== id; });
      salvar(); esconderBotaoTrecho(); redesenharDestaques(); desenharPainelDestaques(); atualizarContadorDest();
      U.aviso('Destaque apagado');
    }
    function atualizarContadorDest(){
      var b = $('#visor-dest'); if(b) b.textContent = '🖍 Destaques' + (arqAberto && destaquesDe(arqAberto).length ? ' (' + destaquesDe(arqAberto).length + ')' : '');
    }
    function esconderBotaoTrecho(){ var b = document.getElementById('trecho-bt'); if(b) b.remove(); }
    function soltarSelecao(){ Array.prototype.forEach.call(document.querySelectorAll('.textLayer.selecting'), function(t){ t.classList.remove('selecting'); }); }

    /* ── caneta marca-texto: ligada, a seleção vira destaque na hora ── */
    function iconeCaneta(cor){
      return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 21h7" stroke="'+cor+'" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M14.5 3.5l6 6-8.5 8.5H6v-6z" fill="'+cor+'" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6l6 6" stroke="currentColor" stroke-width="1.6"/></svg>';
    }
    var soltarLigado = false;
    function aplicarCanetaVisual(){
      var bt = $('#caneta-bt'); if(!bt) return;
      var cor = P.canetaCor || 'amarelo';
      bt.setAttribute('aria-pressed', P.caneta ? 'true' : 'false');
      bt.innerHTML = iconeCaneta(corHL(cor)) + '<span>' + (P.caneta ? 'Caneta ligada' : 'Marca-texto') + '</span>';
      Array.prototype.forEach.call(raiz.querySelectorAll('[data-caneta]'), function(b){ b.classList.toggle('atual', b.dataset.caneta === cor); });
      var box = $('#visor-box'); if(box){ box.classList.toggle('com-caneta', !!P.caneta); box.style.setProperty('--caneta', corHL(cor)); }
    }
    function ligarCaneta(on){
      P.caneta = !!on; P.canetaCor = P.canetaCor || 'amarelo';
      if(P.caneta && P.ferramenta){ P.ferramenta = null; aplicarFerramentaVisual(); }
      salvar();
      aplicarCanetaVisual();
      U.aviso(P.caneta ? 'Caneta ' + CORES_HL.find(function(c){ return c.id === P.canetaCor; }).nome.toLowerCase() + ' ligada (“' + legenda(P.canetaCor) + '”): passe o mouse no texto.' : 'Caneta desligada', 2500);
    }
    /* linhas: junta os pedaços de cada linha num retângulo só (marca contínua) */
    function juntarLinhas(rects){
      var linhas = [];
      rects.slice().sort(function(a, b){ return a[1] - b[1] || a[0] - b[0]; }).forEach(function(r){
        var cy = r[1] + r[3] / 2;
        var l = linhas.find(function(x){ var ly = x[1] + x[3] / 2; return Math.abs(ly - cy) < Math.max(x[3], r[3]) * 0.5; });
        if(!l){ linhas.push(r.slice()); return; }
        var x1 = Math.min(l[0], r[0]), y1 = Math.min(l[1], r[1]), x2 = Math.max(l[0] + l[2], r[0] + r[2]), y2 = Math.max(l[1] + l[3], r[1] + r[3]);
        l[0] = x1; l[1] = y1; l[2] = x2 - x1; l[3] = y2 - y1;
      });
      return linhas;
    }
    function enviarTrecho(){
      if(!trecho || !window.Notas) return;
      Notas.anexar('❝ ' + trecho.texto + ' ❞\n— ' + trecho.ref);
      esconderBotaoTrecho();
      window.getSelection().removeAllRanges();
      U.aviso('Trecho enviado para o bloco de notas');
    }

    /* painel "Meus destaques" do PDF aberto: legenda, filtro por cor e lista */
    function desenharPainelDestaques(){
      var p = $('#dest-painel'); if(!p || p.hidden || !arqAberto) return;
      var ordem = function(a, b){ return a.pg - b.pg || a.rects[0][1] - b.rects[0][1]; };
      var todos = soMarcas(destaquesDe(arqAberto)).sort(ordem);
      var lista = todos.filter(function(d){ return !filtroCorHL || d.cor === filtroCorHL; });
      var notas = destaquesDe(arqAberto).filter(function(d){ return d.tipo === 'nota'; }).sort(ordem);
      var ocultas = destaquesDe(arqAberto).filter(function(d){ return d.tipo === 'oculta'; }).sort(ordem);
      var marcs = marcadoresDe(arqAberto).slice().sort(function(a, b){ return a.pg - b.pg; });
      var extras = '<div class="dest-sec"><h4>🔖 Marcadores</h4>' + (marcs.length ? '<ul class="dest-lista">' + marcs.map(function(m){
          return '<li><button data-ir-pg="'+m.pg+'"><span class="dest-tx">Página '+m.pg+'</span><small>'+esc(m.data.split('-').reverse().join('/'))+'</small></button><button class="dest-del" data-del-marc="'+m.id+'" title="Remover marcador">✕</button></li>';
        }).join('') + '</ul>' : '<p class="dest-vazio">Nenhuma página marcada. Use “🔖 Marcar pág.” (ou a tecla B).</p>') + '</div>' +
        '<div class="dest-sec"><h4>✱ Notas</h4>' + (notas.length ? '<ul class="dest-lista">' + notas.map(function(d){
          return '<li><button data-ir-pg="'+d.pg+'"><span class="dest-cor nota">✱</span><span class="dest-tx">'+esc(d.nota)+'<em>“'+esc(String(d.texto).slice(0, 70))+'”</em></span><small>pág. '+d.pg+'</small></button><button class="dest-del" data-del-hl="'+d.id+'" title="Apagar">✕</button></li>';
        }).join('') + '</ul>' : '<p class="dest-vazio">Nenhuma nota. Selecione um trecho e escolha “✱ Nota”.</p>') + '</div>' +
        '<div class="dest-sec"><h4>🙈 Palavras ocultas</h4>' + (ocultas.length ? '<ul class="dest-lista">' + ocultas.map(function(d){
          return '<li><button data-ir-pg="'+d.pg+'"><span class="dest-cor oculta">?</span><span class="dest-tx">'+(mostrarOcultas ? esc(d.texto) : '•••• ('+d.texto.length+' letras) — tente lembrar')+'</span><small>pág. '+d.pg+'</small></button><button class="dest-del" data-del-hl="'+d.id+'" title="Apagar">✕</button></li>';
        }).join('') + '</ul>' : '<p class="dest-vazio">Nenhuma palavra escondida. Selecione uma palavra-chave e escolha “🙈 Ocultar”.</p>') + '</div>';
      p.innerHTML = '<div class="dest-leg">' + CORES_HL.map(function(c){
          var n = todos.filter(function(d){ return d.cor === c.id; }).length;
          return '<button class="dest-chip" data-filtro="'+c.id+'" aria-pressed="'+(filtroCorHL === c.id)+'"><span style="background:'+c.cor+'"></span>'+esc(legenda(c.id))+(n ? ' <b>'+n+'</b>' : '')+'</button>';
        }).join('') + '<button class="ghost" data-legenda>Editar legenda</button></div>' +
        (lista.length ? '<ul class="dest-lista">' + lista.map(function(d){
          return '<li><button data-ir-pg="'+d.pg+'"><span class="dest-cor" style="background:'+corHL(d.cor)+'"></span><span class="dest-tx">'+esc(d.texto)+'</span><small>pág. '+d.pg+'</small></button></li>';
        }).join('') + '</ul>' : '<p class="dest-vazio">'+(todos.length ? 'Nenhum trecho com esta cor.' : 'Nenhum trecho marcado neste arquivo ainda. Selecione um texto no slide e escolha uma cor.')+'</p>') +
        extras;
    }
    function cliquePainelDestaques(ev){
      var dm = ev.target.closest('[data-del-marc]');
      if(dm){ P.marcadores[arqAberto] = marcadoresDe(arqAberto).filter(function(m){ return m.id !== dm.dataset.delMarc; }); salvar(); redesenharDestaques(); desenharPainelDestaques(); atualizarBotaoMarcador(); atualizarContadorDest(); return; }
      var dh = ev.target.closest('[data-del-hl]'); if(dh){ apagarDestaque(dh.dataset.delHl); return; }
      var f = ev.target.closest('[data-filtro]');
      if(f){ filtroCorHL = filtroCorHL === f.dataset.filtro ? null : f.dataset.filtro; desenharPainelDestaques(); return; }
      var ir = ev.target.closest('[data-ir-pg]');
      if(ir){ var env = raiz.querySelector('#visor-box .pg[data-pg="'+ir.dataset.irPg+'"]'); if(env) irParaPagina(env); return; }
      if(ev.target.closest('[data-legenda]')) editarLegenda();
    }
    function editarLegenda(){
      U.modal('<h2>Legenda das cores</h2><p>Dê um significado a cada cor do marca-texto. Assim, só de olhar o slide, você sabe o que cada trecho é.</p>' +
        CORES_HL.map(function(c){ return '<label class="campo leg-campo"><span><i style="background:'+c.cor+'"></i>'+c.nome+'</span><input type="text" data-leg="'+c.id+'" maxlength="30" value="'+esc(legenda(c.id))+'"></label>'; }).join('') +
        '<div class="modal-acts"><button class="ghost" id="leg-padrao">Voltar ao padrão</button><button class="btn" id="leg-ok">Salvar</button></div>',
        function(el, fechar){
          el.querySelector('#leg-padrao').onclick = function(){ P.legendaHL = {}; salvar(); fechar(); desenharPainelDestaques(); };
          el.querySelector('#leg-ok').onclick = function(){
            P.legendaHL = {};
            Array.prototype.forEach.call(el.querySelectorAll('[data-leg]'), function(i){ if(i.value.trim()) P.legendaHL[i.dataset.leg] = i.value.trim(); });
            salvar(); fechar(); desenharPainelDestaques();
          };
        });
    }
    function achaArq(id){ return M.arquivos.find(function(a){ return a.id === id; }); }
    function marcaArq(){
      Array.prototype.forEach.call(raiz.querySelectorAll('.arq'), function(b){ b.setAttribute('aria-pressed', b.dataset.arq === arqAberto ? 'true':'false'); });
    }
    function abrirFora(it){
      window.api.abrirFora(M.id, it.tipo === 'pdf' || !it.original ? it.caminho : it.original).catch(function(e){ U.aviso('Não consegui abrir: ' + e.message); });
    }
    function abrirArquivo(id, pagina){
      var it = achaArq(id); if(!it) return;
      if(it.tipo === 'pptx'){ abrirFora(it); return; }
      arqAberto = id; arqPagina = null; marcaArq(); filtroCorHL = null;
      revelados = {}; mostrarOcultas = false; fecharBolha(); esconderBarraAnot(); anotAtiva = null;
      var bo = $('#visor-ocultas'); if(bo){ bo.setAttribute('aria-pressed', 'false'); bo.textContent = '🙈 Mostrar palavras'; }
      setTimeout(atualizarBotaoMarcador, 1500);
      atualizarContadorDest(); desenharPainelDestaques();
      $('#visor-nome').textContent = it.nome;
      $('#visor').hidden = false;
      var box = $('#visor-box');
      if(it.tipo === 'pdf') mostrarPdf(urlArquivo(it.caminho), box, pagina);
      else { renderToken++; box.innerHTML = '<img src="'+esc(urlArquivo(it.caminho))+'" alt="'+esc(it.nome)+'">'; }
      $('#visor').scrollIntoView({ behavior:'smooth', block:'start' });
    }
    /* Páginas desenhadas em canvas com PDF.js local (funciona offline), com
       uma camada de texto transparente por cima para permitir selecionar. */
    function mostrarPdf(url, box, pagina){
      var meu = ++renderToken;
      textoPaginas = {};
      box.innerHTML = '<p class="visor-msg">Carregando slides…</p>';
      if(!window.pdfjsLib){ box.innerHTML = '<p class="visor-msg">Visualizador indisponível. Use “Abrir fora do programa”.</p>'; return; }
      pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.min.js';
      pdfjsLib.getDocument({ url:url, isEvalSupported:false }).promise.then(function(doc){
        if(meu !== renderToken) return;
        box.innerHTML = '';
        var largura = Math.max(320, box.clientWidth - 28);
        var seq = Promise.resolve();
        for(var i = 1; i <= doc.numPages; i++){
          (function(n){
            seq = seq.then(function(){
              if(meu !== renderToken) return;
              return doc.getPage(n).then(function(page){
                if(meu !== renderToken) return;
                var base = page.getViewport({ scale:1 });
                var escCss = Math.min(2.2, largura / base.width);
                var vpCss = page.getViewport({ scale:escCss });
                var vp = page.getViewport({ scale:escCss * (window.devicePixelRatio || 1) });
                var cv = document.createElement('canvas');
                cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
                cv.style.width = Math.floor(vpCss.width) + 'px'; cv.style.height = Math.floor(vpCss.height) + 'px';
                var env = document.createElement('div'); env.className = 'pg'; env.dataset.pg = n;
                env.dataset.ptw = base.width;   /* largura da página em pontos: converte o tamanho da letra */
                env.style.width = Math.floor(vpCss.width) + 'px';
                env.appendChild(cv);
                var camada = document.createElement('div'); camada.className = 'textLayer';
                camada.style.setProperty('--scale-factor', vpCss.scale);
                env.appendChild(camada);
                var rot = document.createElement('span'); rot.className = 'pg-n'; rot.textContent = n + ' / ' + doc.numPages; env.appendChild(rot);
                box.appendChild(env);
                if(pagina === n) setTimeout(function(){ irParaPagina(env); }, 30);
                desenharDestaquesPagina(env);
                /* texto da página, para a mascote explicar “esta página” */
                page.getTextContent().then(function(tc){
                  if(meu === renderToken) textoPaginas[n] = tc.items.map(function(it){ return it.str; }).join(' ').replace(/\s+/g, ' ').trim();
                }).catch(function(){});
                return page.render({ canvasContext:cv.getContext('2d'), viewport:vp }).promise.then(function(){
                  try{
                    return pdfjsLib.renderTextLayer({ textContentSource:page.streamTextContent(), container:camada, viewport:vpCss, textDivs:[] }).promise.then(function(){
                      /* “fim do conteúdo” (como no leitor do pdf.js): sem ele, passar o
                         mouse num espaço entre linhas seleciona a página inteira */
                      var fim = document.createElement('div'); fim.className = 'endOfContent'; camada.appendChild(fim);
                    });
                  }catch(e){ /* sem camada de texto: o slide continua visível */ }
                });
              });
            });
          })(i);
        }
        return seq;
      }).catch(function(){
        if(meu !== renderToken) return;
        box.innerHTML = '<p class="visor-msg">Não consegui mostrar este PDF aqui. Use “Abrir fora do programa”.</p>';
      });
    }

    /* ══════════ BUSCA GERAL (Ctrl+K) ══════════ */
    var GRUPOS = ['Destaques', 'Aulas', 'Mapas', 'Slides', 'Questões', 'Discursivas', 'Atividades', 'Fórmulas', 'Notas'];
    function norm(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
    function itensBusca(){
      var l = [];
      M.aulas.forEach(function(a){
        l.push({ g:'Aulas', t:'Aula '+a.n+' — '+a.titulo, x:[a.nucleo, (a.ramos || []).map(function(r){ return r.t + ': ' + (r.i || []).join('; '); }).join(' · '), (a.prova || []).join(', '), a.pegadinha].join(' · '),
          ir:function(){ aulasAbertas = {}; aulasAbertas[a.n] = true; mapaFiltro = 'all'; irPara('mapa'); rolarPara('button[data-n="'+a.n+'"]'); } });
      });
      M.mapas.forEach(function(m, i){
        (m.ramos || []).forEach(function(r){
          (r.f || []).forEach(function(f){
            var t = typeof f === 'string' ? f : f.t, d = typeof f === 'string' ? '' : (f.d || '');
            l.push({ g:'Mapas', t:t, x:(m.n ? 'Aula '+m.n : 'Mapa geral')+' · '+r.t+(d ? ' · '+d : ''), ir:function(){ P.ultimo.mapa = i; irPara('vis'); } });
          });
        });
      });
      qs.forEach(function(x, i){
        l.push({ g:'Questões', t:x.q.t === 'ar' ? 'I. ' + x.q.i1 + ' PORQUE II. ' + x.q.i2 : x.q.e,x:'Aula '+x.q.a+' · '+x.q.o[x.q.c]+' · '+x.q.x,
          ir:function(){ sessao = null; P.simulado.filtro = 'all'; P.simulado.vista = 'uma'; P.simulado.pos = i; irPara('sim'); } });
      });
      M.discursivas.forEach(function(d){
        l.push({ g:'Discursivas', t:'Questão '+d.n+' · '+d.tema, x:d.enunciado+' · '+(d.chaves || []).join(' · ')+' · '+(d.modelo || ''),
          ir:function(){ irPara('disc'); rolarPara('[data-disc="'+d.n+'"]'); } });
      });
      M.atividades.forEach(function(a){
        l.push({ g:'Atividades', t:a.titulo, x:'Aula '+a.n+' · '+a.enunciado+' · '+(a.guia || []).join(' · '),
          ir:function(){ ativFiltro = 'all'; irPara('ativ'); rolarPara('[data-ativ="'+a.id+'"]'); } });
      });
      M.formulas.forEach(function(g){
        (g.its || []).forEach(function(it){ l.push({ g:'Fórmulas', t:it.k, x:g.g+' · '+it.v+' · '+(it.n || ''), ir:function(){ irPara('form'); } }); });
      });
      Object.keys(P.destaques || {}).forEach(function(arqId){
        var a = achaArq(arqId); if(!a) return;
        P.destaques[arqId].forEach(function(d){
          if(d.tipo === 'oculta') return;   /* a busca não entrega a palavra escondida */
          l.push({ g:'Destaques', t:d.tipo === 'nota' ? '✱ ' + d.nota : d.texto, x:(d.tipo === 'nota' ? 'Nota sobre “' + d.texto.slice(0, 60) + '”' : legenda(d.cor))+' · '+a.nome+' · pág. '+d.pg, ir:function(){ arqAberto = arqId; arqPagina = d.pg; irPara('arq'); } });
        });
      });
      (CACHE_PDF[M.id] || []).forEach(function(p){
        l.push({ g:'Slides', t:p.nome+' · pág. '+p.pg, x:p.texto, ir:function(){ arqAberto = p.id; arqPagina = p.pg; irPara('arq'); } });
      });
      return l;
    }
    /* texto dos PDFs, lido uma vez por sessão e guardado em memória */
    function indexarPdfs(aoProgredir){
      if(CACHE_PDF[M.id] || !window.pdfjsLib) return Promise.resolve();
      pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.min.js';
      var pdfs = M.arquivos.filter(function(a){ return a.tipo === 'pdf'; }), saida = [], feito = 0, id = M.id;
      return pdfs.reduce(function(seq, a){
        return seq.then(function(){
          return pdfjsLib.getDocument({ url:urlArquivo(a.caminho), isEvalSupported:false }).promise.then(function(doc){
            var pgs = [];
            for(var i = 1; i <= doc.numPages; i++) pgs.push(i);
            return pgs.reduce(function(s2, n){
              return s2.then(function(){ return doc.getPage(n).then(function(pg){ return pg.getTextContent(); }).then(function(tc){
                var txt = tc.items.map(function(it){ return it.str; }).join(' ').replace(/\s+/g, ' ').trim();
                if(txt) saida.push({ id:a.id, nome:a.nome, pg:n, texto:txt });
              }); });
            }, Promise.resolve()).then(function(){ doc.destroy(); });
          }).catch(function(){}).then(function(){ aoProgredir(++feito, pdfs.length); });
        });
      }, Promise.resolve()).then(function(){ CACHE_PDF[id] = saida; });
    }
    var VARIANTES = { a:'aáàâãä', e:'eéèêë', i:'iíìîï', o:'oóòôõö', u:'uúùûü', c:'cç' };
    function realce(html, termos){
      termos.forEach(function(t){
        var pad = t.split('').map(function(ch){
          return VARIANTES[ch] ? '[' + VARIANTES[ch] + VARIANTES[ch].toUpperCase() + ']' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('');
        try{ html = html.replace(new RegExp('(' + pad + ')(?![^<]*>)', 'gi'), '<mark>$1</mark>'); }catch(e){}
      });
      return html;
    }
    function trechoBusca(txt, termos){
      var n = norm(txt), i = -1;
      termos.some(function(t){ i = n.indexOf(t); return i >= 0; });
      if(i < 0) i = 0;
      var ini = Math.max(0, i - 50), fim = Math.min(txt.length, i + 110);
      return (ini ? '…' : '') + txt.slice(ini, fim) + (fim < txt.length ? '…' : '');
    }
    function abrirBusca(){
      if(document.querySelector('.busca-modal')) return;
      var notas = [], resultados = [];
      window.api.notas.listar().then(function(l){ notas = l.filter(function(n){ return n.materiaId === M.id; }); }).catch(function(){});
      U.modal('<div class="busca-modal"><input type="text" id="b-q" placeholder="Buscar em '+esc(M.nome)+'… (ex.: Lamport, cascata, RNF)" autocomplete="off">' +
        '<p class="b-status" id="b-status"></p><div id="b-res" class="b-res"></div></div>',
        function(el, fechar){
          var q = el.querySelector('#b-q'), res = el.querySelector('#b-res'), st = el.querySelector('#b-status');
          el.classList.add('modal-busca');
          var base = itensBusca(), timer = null;
          function procurar(){
            var termos = norm(q.value).split(/\s+/).filter(function(t){ return t.length > 1; });
            if(!termos.length){ res.innerHTML = '<p class="b-dica">Digite ao menos 2 letras. Acentos não importam. <span class="kbd">Enter</span> abre o primeiro resultado.</p>'; resultados = []; return; }
            var todos = base.concat(notas.map(function(n){
              return { g:'Notas', t:n.titulo || 'Sem título', x:n.texto || '', ir:function(){ if(window.Notas) Notas.abrirNota(n.id); } };
            }));
            resultados = todos.map(function(it){
              var tn = norm(it.t), xn = norm(it.x), ok = termos.every(function(t){ return tn.indexOf(t) >= 0 || xn.indexOf(t) >= 0; });
              return ok ? { it:it, s:termos.reduce(function(s, t){ return s + (tn.indexOf(t) >= 0 ? 3 : 1); }, 0) } : null;
            }).filter(Boolean).sort(function(a, b){ return b.s - a.s; }).map(function(r){ return r.it; });
            if(!resultados.length){ res.innerHTML = '<p class="b-dica">Nada encontrado para “'+esc(q.value)+'”.</p>'; return; }
            var html = '', idx = 0, ordem = [];
            GRUPOS.forEach(function(g){
              var doGrupo = resultados.filter(function(r){ return r.g === g; });
              if(!doGrupo.length) return;
              html += '<h6>'+g+' <small>'+doGrupo.length+'</small></h6>';
              doGrupo.slice(0, 6).forEach(function(r){
                ordem.push(r);
                html += '<button class="b-item" data-i="'+(idx++)+'"><b>'+realce(esc(r.t), termos)+'</b><span>'+realce(esc(trechoBusca(r.x, termos)), termos)+'</span></button>';
              });
            });
            resultados = ordem;
            res.innerHTML = html;
          }
          q.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(procurar, 120); });
          q.addEventListener('keydown', function(ev){ if(ev.key === 'Enter' && resultados[0]){ fechar(); resultados[0].ir(); } });
          res.addEventListener('click', function(ev){
            var b = ev.target.closest('.b-item'); if(!b) return;
            var r = resultados[+b.dataset.i]; fechar(); if(r) r.ir();
          });
          procurar();
          if(!CACHE_PDF[M.id]){
            st.textContent = 'Lendo o texto dos slides para incluir na busca…';
            indexarPdfs(function(f, t){ st.textContent = 'Lendo o texto dos slides… ' + f + ' de ' + t; }).then(function(){
              st.textContent = ''; base = itensBusca(); if(q.value) procurar();
            });
          }
          setTimeout(function(){ q.focus(); }, 30);
        });
    }

    /* ══════════ GERENCIAR ══════════ */
    function renderGer(){
      var fontes = (M.fontes || []).slice().sort(function(a,b){ return a.aula - b.aula; });
      var pend = fontes.filter(function(f){ return f.status !== 'gerada'; });
      var ativo = gerando && (gerando.fase === 'aulas' || gerando.fase === 'geral' || gerando.fase === 'importando');
      painel.innerHTML = hero('Gerenciar', 'Conteúdo da matéria',
        'Adicione os slides das aulas e gere mapas, simulados, discursivas e atividades com IA. A internet só é usada na geração: depois, tudo fica salvo no computador e funciona offline.') +

        '<div class="gcard"><h3>1. Aulas e geração com IA</h3>' +
        '<p>'+(fontes.length ? fontes.length + ' aula(s) cadastrada(s), ' + (fontes.length - pend.length) + ' já gerada(s).' : 'Nenhuma aula ainda. Comece adicionando os slides (.pptx ou .pdf).') +
        (pend.length ? ' <strong>'+pend.length+' esperando geração.</strong> Com o Claude: cerca de US$ 0,30 a 0,60 por aula. Com a IA grátis do computador (LM Studio): sem custo, mais lento.' : '') + '</p>' +
        '<div class="linha-acts">' +
          '<button class="btn" id="g-add"'+(ativo?' disabled':'')+'>+ Adicionar slides ou arquivos</button>' +
          (pend.length ? '<button class="btn" id="g-gerar"'+(ativo?' disabled':'')+'>Gerar '+pend.length+' aula(s) com IA</button>' : '') +
          (ativo ? '<button class="ghost" id="g-cancelar">Cancelar geração</button>' : '') +
        '</div>' +
        (fontes.length ? '<div class="fontes">' + fontes.map(function(f){
          var rot = { gerada:'gerada', pendente:'pendente', erro:'erro' }[f.status] || f.status;
          return '<div class="fonte"><span class="num">'+dois(f.aula)+'</span><span class="nm">'+esc(tituloDaFonte(f)) +
            (f.erro ? '<span class="er">'+esc(f.erro)+'</span>' : '') + '</span><span class="st '+esc(f.status)+'">'+rot+'</span>' +
            (f.status !== 'gerada' && !ativo ? '<button class="ghost" data-remover="'+esc(f.id)+'" title="Tirar esta aula da lista">Remover</button>' : '') + '</div>';
        }).join('') + '</div>' : '') +
        '</div>' +

        (M.aulas.length ? '<div class="gcard"><h3>2. Refazer a visão geral</h3><p>Gera de novo os blocos temáticos, o mapa geral, as fórmulas e um conjunto novo de discursivas a partir de todas as aulas. Útil depois de adicionar muitas aulas. As questões e o seu progresso não mudam.</p>' +
          '<div class="linha-acts"><button class="ghost" id="g-geral"'+(ativo?' disabled':'')+'>Refazer visão geral com IA</button></div></div>' : '') +

        '<div class="gcard"><h3>3. Dados da matéria</h3>' +
          '<label class="campo"><span>Nome</span><input type="text" id="g-nome" value="'+esc(M.nome)+'"></label>' +
          '<label class="campo"><span>Instituição ou professor</span><input type="text" id="g-sub" value="'+esc(M.subtitulo || '')+'"></label>' +
          '<div class="campo"><span>Cor</span><div class="cores" id="g-cores">' + CORES.map(function(c){ return '<button style="background:'+c+'" data-cor="'+c+'" aria-pressed="'+(c===M.cor)+'" aria-label="Cor '+c+'"></button>'; }).join('') + '</div></div>' +
          '<div class="linha-acts"><button class="btn" id="g-salvar">Salvar</button></div></div>' +

        (function(){
          var ks = Object.keys(P.ocultas || {});
          if(!ks.length) return '';
          return '<div class="gcard"><h3>⚠ Questões e cartões escondidos ('+ks.length+')</h3><p>Você marcou estes como “com erro”. Eles não aparecem no estudo. Se marcou sem querer, traga de volta.</p>' +
            '<ul class="ocultas">' + ks.map(function(k){ return '<li><span>'+(k[0] === 'q' ? '📝 ' : '🃏 ')+esc(P.ocultas[k].t || k)+'</span><button class="ghost" data-restaurar="'+esc(k)+'">Restaurar</button></li>'; }).join('') + '</ul>' +
            '<div class="linha-acts"><button class="ghost" id="g-restaurar-tudo">Restaurar todos</button></div></div>';
        })() +
        '<div class="gcard"><h3>4. Pasta e exclusão</h3><p>Os arquivos desta matéria ficam numa pasta do seu computador. Excluir manda a matéria para a Lixeira do Windows, então dá para recuperar.</p>' +
          '<div class="linha-acts"><button class="ghost so-pc" id="g-pasta">Abrir pasta da matéria</button><button class="ghost" id="g-excluir" style="color:var(--bad)">Excluir matéria</button></div></div>';

      var corEscolhida = M.cor;
      painel.onclick = function(ev){
        var t = ev.target;
        var cor = t.closest('[data-cor]');
        if(cor){ corEscolhida = cor.dataset.cor; Array.prototype.forEach.call(raiz.querySelectorAll('#g-cores button'), function(b){ b.setAttribute('aria-pressed', b === cor ? 'true':'false'); }); return; }
        var rm = t.closest('[data-remover]');
        if(rm){ window.api.removerPendente(M.id, rm.dataset.remover).then(opts.aoRecarregar); return; }
        var rs = t.closest('[data-restaurar]');
        if(rs || t.id === 'g-restaurar-tudo'){
          if(rs) delete P.ocultas[rs.dataset.restaurar]; else P.ocultas = {};
          sessao = null; filaCards = null; carregar(M, P); salvarJa(); renderGer();
          U.aviso(rs ? 'Restaurado' : 'Todos restaurados', 2500);
          return;
        }
        if(t.id === 'g-add') adicionar();
        if(t.id === 'g-gerar') gerar({});
        if(t.id === 'g-geral') U.confirmar('Refazer a visão geral?', 'Os blocos, o mapa geral, as fórmulas e as discursivas serão gerados de novo. Custo aproximado: US$ 0,50.', 'Refazer').then(function(ok){ if(ok) gerar({ refazerGeral:true }); });
        if(t.id === 'g-cancelar') window.api.cancelarGeracao(M.id);
        if(t.id === 'g-salvar'){
          window.api.editar(M.id, { nome:$('#g-nome').value, subtitulo:$('#g-sub').value, cor:corEscolhida })
            .then(function(){ U.aviso('Salvo'); opts.aoRecarregar(); }).catch(function(e){ U.aviso(e.message); });
        }
        if(t.id === 'g-pasta') window.api.abrirPasta(M.id);
        if(t.id === 'g-excluir'){
          U.confirmar('Excluir "'+M.nome+'"?', 'A matéria, os arquivos e o seu progresso vão para a Lixeira do Windows.', 'Excluir', true).then(function(ok){
            if(ok) window.api.excluir(M.id).then(function(){ U.aviso('Matéria enviada para a Lixeira'); opts.aoVoltar(); }).catch(function(e){ U.aviso(e.message); });
          });
        }
      };
    }
    function tituloDaFonte(f){
      var a = M.aulas.find(function(x){ return x.n === f.aula; });
      return a ? a.titulo : f.nome;
    }
    function adicionar(){
      window.api.escolherArquivos().then(function(caminhos){
        if(!caminhos.length) return;
        gerando = { fase:'importando', msg:'Copiando arquivos…', feitos:0, total:caminhos.length }; bannerFechado = false; renderBanner();
        return window.api.adicionarArquivos(M.id, caminhos).then(function(r){
          gerando = null;
          if(r.cancelado){ renderBanner(); U.aviso('Importação cancelada — nada foi adicionado.', 4000); return; }
          U.aviso(r.aulas + ' aula(s) e ' + r.anexos + ' anexo(s) adicionados' + (r.semPdf.length ? ' · ' + r.semPdf.length + ' sem PDF (abrem no PowerPoint)' : '') +
            (r.ignorados.length ? ' · ignorados (formato não aceito): ' + r.ignorados.join(', ') : ''), r.ignorados.length ? 7000 : 4000);
          return opts.aoRecarregar();
        });
      }).catch(function(e){ gerando = null; renderBanner(); U.aviso('Erro: ' + e.message, 5000); });
    }
    function gerar(o){
      /* Claude (chave), a IA grátis do computador (a da mascote) ou outra compatível */
      var limpa = function(e){ return String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); };
      var iniciar = function(op){
        return window.api.gerar(M.id, Object.assign({}, o, { provedor:op.tipo })).then(function(){
          gerando = { fase:'aulas', msg:'Começando com ' + op.nome + ' · ' + op.modelo + '…', feitas:0, total:0 }; bannerFechado = false; renderBanner(); if(aba === 'ger') renderGer();
        }).catch(function(e){ U.aviso(limpa(e), 6000); });
      };
      window.api.statusGeracao().then(function(st){
        if(!st.disponivel){ U.aviso(st.motivo, 6000); return; }
        var ops = st.opcoes || [];
        if(ops.length < 2) return iniciar(ops[0] || st);
        /* Claude e IA grátis disponíveis: a pessoa escolhe */
        U.modal('<h2>Gerar com qual IA?</h2><p>As duas montam o mesmo material (mapas, simulados, discursivas, atividades).</p>' +
          '<div class="escolha-ia">' + ops.map(function(op, i){
            return '<button class="op-ia op-bt" data-op="'+i+'"><span><b>'+esc(op.nome)+'</b><small>'+esc(op.modelo)+' · '+(op.tipo === 'claude' ? 'melhor qualidade, usa a internet (≈ US$ 0,30 a 0,60 por aula)' : op.gratis ? 'grátis e offline; mais lento e mais simples — revise as pegadinhas' : 'usa a internet')+'</small></span></button>';
          }).join('') + '</div><div class="modal-acts"><button class="ghost" id="g-cancelar">Cancelar</button></div>',
          function(el, fechar){
            el.querySelector('#g-cancelar').onclick = fechar;
            el.addEventListener('click', function(ev){ var b = ev.target.closest('[data-op]'); if(b){ fechar(); iniciar(ops[+b.dataset.op]); } });
          });
      }).catch(function(e){ U.aviso(limpa(e), 6000); });
    }

    /* ── interface pública ─────────────────────────────── */
    medirTopo();
    irPara(P.ultimo.aba || 'vis');

    return {
      id: function(){ return M.id; },
      recarregar: function(materia, progresso){
        var posAba = aba;
        carregar(materia, progresso || P);
        cabecalho();
        irPara(posAba);
      },
      geracao: function(estado){
        gerando = estado; if(estado.fase === 'aulas' && !estado.feitas) bannerFechado = false;
        renderBanner();
        if(aba === 'ger' && (estado.fase === 'fim' || estado.fase === 'erro' || estado.fase === 'cancelada')) renderGer();
      },
      salvarAgora: salvarJa,
      /* um minuto de foco concluído (o diário geral é gravado pelo módulo Foco) */
      minutoDeFoco: function(){
        var h = U.hoje(), d = P.diario[h] = P.diario[h] || { min:0, q:0, cards:0, novos:0, mapas:[] };
        d.min = (d.min || 0) + 1; salvar();
      },
      abrirBusca: function(){ abrirBusca(); },
      desmontar: function(){
        if(desmontado) return; desmontado = true;
        if(window.Tutor) Tutor.definirMateria(null);
        salvarJa(); renderToken++; clearInterval(provaTimer); esconderBotaoTrecho();
        if(mapaCheio) alternarCheio(false);
        document.removeEventListener('fullscreenchange', fsMudou);
        window.removeEventListener('resize', redimensionouMapa);
        document.removeEventListener('keydown', tecla);
        document.removeEventListener('click', fecharMenu);
        window.removeEventListener('resize', medirTopo);
      }
    };
  }

  window.Materia = Materia;
})();
