/* Tutor de IA: painel lateral de conversa. Quem abre passa o CONTEXTO (a
   questão, a aula do mapa, ou a matéria inteira) — a IA responde sobre o
   material do aluno, curto e com exemplo, pensando em quem tem TDAH.
   A IA roda no processo principal (lib/assistente.js): LM Studio / Ollama
   grátis no computador, ou Claude com a chave da API. */
(function(){
  'use strict';
  var esc = U.esc, api = window.api.tutor;
  var st = null, stEm = 0;
  var el = null, conversa = [], ctx = null, pedido = null, buffer = '';
  var geral = null;           /* função da matéria aberta que devolve o contexto geral */

  var SISTEMA = 'Você é a '+Mascote.nome+', a tutora da Plataforma de Estudo: pequena, corajosa, animada e paciente. Você ajuda QUEM_ESTUDA.Fale em primeira pessoa, no feminino, com carinho e incentivo, sem exagerar.\n' +
    'Regras:\n' +
    '- Responda sempre em português do Brasil.\n' +
    '- Seja curto: no máximo 8 linhas ou 5 tópicos, a não ser que o aluno peça mais. Uma ideia por vez.\n' +
    '- Use exemplos do dia a dia e analogias simples. Destaque o termo-chave em **negrito**.\n' +
    '- Baseie-se no MATERIAL abaixo. Se precisar complementar com algo que não está nele, diga que é um complemento. Nunca invente números, autores ou definições.\n' +
    '- Se o aluno ainda não respondeu a questão, NÃO entregue a resposta: dê uma dica ou uma pergunta que o leve a pensar.\n' +
    '- Quando fizer sentido, termine com UMA pergunta curta para ele testar se entendeu.\n' +
    '- MACETE é uma sigla, rima, frase ou historinha que ajuda a lembrar termos ESPECÍFICOS do material (por exemplo, a ordem de uma lista, a diferença entre dois conceitos). Use as palavras exatas do material e explique como o macete se liga a cada termo. Nunca faça frases genéricas como “qualidade é como um sorriso”.\n' +
    '- Se o material tiver o TEXTO DA PÁGINA que o aluno está lendo, explique com base nele.';

  /* ── situação da IA (cache de 30 s) ── */
  function status(forcar){
    if(!forcar && st && Date.now() - stEm < 30000) return Promise.resolve(st);
    return api.status().then(function(s){ st = s; }, function(e){ st = { disponivel:false, motivo:e.message }; })
      .then(function(){ stEm = Date.now(); document.body.classList.toggle('tutor-on', !!st.disponivel); desenharTopo(); return st; });
  }

  /* ── painel ── */
  function montar(){
    if(el) return;
    el = document.createElement('aside');
    el.className = 'tutor'; el.hidden = true;
    el.setAttribute('aria-label', Mascote.nome+', a tutora de IA');
    el.innerHTML =
      '<div class="tu-topo">' + Mascote.avatar(42) + '<div><b>'+Mascote.nome+'</b><small id="tu-quem"></small></div>' +
        '<button class="bl-bt" data-a="nova" title="Nova conversa">⟲</button><button class="bl-bt" data-a="fechar" title="Fechar (Esc)">✕</button></div>' +
      '<div class="tu-ctx" id="tu-ctx"></div>' +
      '<div class="tu-msgs" id="tu-msgs" aria-live="polite"></div>' +
      '<div class="tu-sug" id="tu-sug"></div>' +
      '<form class="tu-form" id="tu-form"><textarea id="tu-txt" rows="2" placeholder="Pergunte o que quiser sobre a matéria…  (Enter envia · Shift+Enter quebra a linha)"></textarea>' +
        '<button class="btn" id="tu-env" type="submit">Enviar</button></form>';
    document.body.appendChild(el);
    var q = function(s){ return el.querySelector(s); };
    el.addEventListener('keydown', function(ev){
      if(ev.key === 'Escape'){ fechar(); return; }
      if(ev.target.id === 'tu-txt' && ev.key === 'Enter' && !ev.shiftKey){ ev.preventDefault(); enviar(q('#tu-txt').value); }
      ev.stopPropagation();   /* as teclas do simulado (A–E) não disparam enquanto escreve */
    });
    q('#tu-form').addEventListener('submit', function(ev){ ev.preventDefault(); if(pedido) parar(); else enviar(q('#tu-txt').value); });
    el.addEventListener('click', function(ev){
      var b = ev.target.closest('button'); if(!b) return;
      if(b.dataset.a === 'fechar') fechar();
      else if(b.dataset.a === 'nova'){ conversa = []; desenhar(); }
      else if(b.dataset.sug) enviar(b.dataset.sug);
      else if(b.dataset.a === 'ajuda') ajuda();
      else if(b.dataset.a === 'tentar') status(true).then(desenhar);
      else if(b.dataset.nota !== undefined){
        var m = conversa[+b.dataset.nota];
        if(m && window.Notas){ Notas.anexar(limpar(m.content)); U.aviso('Resposta guardada no bloco de notas.', 2500); }
      }
    });
    api.aoReceber(function(d){
      if(d.pedido !== pedido) return;
      buffer += d.texto;
      var ult = conversa[conversa.length - 1];
      if(ult && ult.role === 'assistant'){ ult.content = buffer; desenharUltima(); }
    });
  }

  /* modelos que “pensam em voz alta” (<think>…</think>) — só a resposta aparece */
  function limpar(t){ return String(t || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim(); }
  /* markdown mínimo e seguro: negrito, código, listas e parágrafos */
  function formatar(t){
    var linhas = esc(limpar(t)).split('\n'), html = '', lista = null;
    linhas.forEach(function(l){
      var m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
      var fmt = function(s){
        return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s.,;:!?)]|$)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
      };
      if(m){ if(!lista){ html += '<ul>'; lista = true; } html += '<li>' + fmt(m[1]) + '</li>'; return; }
      if(lista){ html += '</ul>'; lista = null; }
      if(l.trim()) html += '<p>' + fmt(l.replace(/^#+\s*/, '')) + '</p>';
    });
    if(lista) html += '</ul>';
    return html;
  }

  function desenharTopo(){
    if(!el) return;
    el.querySelector('#tu-quem').textContent = st && st.disponivel
      ? st.servidor + ' · ' + st.modelo + (st.gratis ? ' · grátis' : ' · pago') : 'sem IA disponível';
  }
  function desenhar(){
    if(!el) return;
    desenharTopo();
    el.querySelector('#tu-ctx').innerHTML = ctx ? '<span>Sobre:</span> ' + esc(ctx.titulo) : '';
    var msgs = el.querySelector('#tu-msgs');
    if(st && !st.disponivel){
      msgs.innerHTML = '<div class="tu-vazio tu-boas">' + Mascote.ilustracao(150) + '<b>Oi! Eu sou a '+Mascote.nome+', sua tutora.</b><p>Para eu conseguir conversar, preciso de uma IA ligada neste computador. ' + esc(st.motivo || '') + '</p>' +
        '<p>Dá para usar uma IA <b>grátis</b> que roda no próprio PC (LM Studio ou Ollama). No PC de casa, com a RX 9060 XT, eu respondo rapidinho.</p>' +
        '<div class="tu-acts"><button class="btn" data-a="ajuda">Como instalar (passo a passo)</button><button class="ghost" data-a="tentar">Tentar de novo</button></div></div>';
      el.querySelector('#tu-sug').innerHTML = '';
      return;
    }
    msgs.innerHTML = conversa.length ? conversa.map(function(m, i){
      if(m.role === 'user') return '<div class="tu-m eu">' + esc(m.content) + '</div>';
      var pensando = !limpar(m.content) && pedido;
      return '<div class="tu-linha">' + Mascote.avatar(30) + '<div class="tu-m ia" data-i="'+i+'">' + (pensando ? '<p class="tu-pensando">'+Mascote.nome+' está pensando…</p>' : formatar(m.content)) +
        (m.erro ? '<p class="tu-erro">' + esc(m.erro) + '</p>' : '') +
        (!pedido || i < conversa.length - 1 ? '<button class="tu-nota" data-nota="'+i+'" title="Guardar no bloco de notas">📝 Guardar nas notas</button>' : '') + '</div></div>';
    }).join('') : '<div class="tu-vazio tu-boas">' + Mascote.ilustracao(130) + '<b>Oi! Eu sou a '+Mascote.nome+'.</b><p>Me pergunte qualquer coisa' + (ctx ? ' sobre <b>' + esc(ctx.titulo) + '</b>' : ' sobre a matéria') + ', ou escolha uma sugestão aqui embaixo. Vamos juntos, uma coisa de cada vez!</p></div>';
    msgs.scrollTop = msgs.scrollHeight;
    el.querySelector('#tu-sug').innerHTML = pedido ? '' : ((ctx && ctx.sugestoes) || []).map(function(s){ return '<button class="chip" data-sug="'+esc(s)+'">'+esc(s)+'</button>'; }).join('');
    var b = el.querySelector('#tu-env'); b.textContent = pedido ? '■ Parar' : 'Enviar'; b.className = pedido ? 'ghost' : 'btn';
  }
  function desenharUltima(){
    var msgs = el.querySelector('#tu-msgs'), linhas = msgs.querySelectorAll('.tu-m.ia'), bl = linhas[linhas.length - 1];
    if(!bl){ desenhar(); return; }
    var t = limpar(buffer);
    bl.innerHTML = t ? formatar(buffer) : '<p class="tu-pensando">'+Mascote.nome+' está pensando…</p>';
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* nome e o que a pessoa estuda (da tela de boas-vindas), para a mascote falar com ela */
  var usuario = {}, estudo = null;
  /* quem estuda (perfil de estudo): o jeito de falar muda para ensino médio, faculdade, concurso… */
  function lerPerfil(){ window.api.config().then(function(c){ usuario = c.usuario || {}; estudo = c.estudo || null; }).catch(function(){}); }
  lerPerfil();
  function sistema(){
    var material = ctx && ctx.texto ? ctx.texto : (geral ? (geral() || {}).texto || '' : '');
    var quem = usuario.nome ? '\nO aluno se chama ' + usuario.nome + (usuario.estuda ? ' e estuda: ' + usuario.estuda : '') + '. Chame-o pelo nome de vez em quando.' : '';
    var e = estudo || { quem:'um estudante', prova:'as provas', foco:true, chave:'outro' };
    var jovem = e.chave === 'medio' || e.chave === 'enem';
    var base = SISTEMA.replace('QUEM_ESTUDA', e.quem + ' brasileiro que estuda para ' + e.prova + (e.foco ? ' e aprende melhor com explicações curtas, uma coisa de cada vez' : ''));
    var idade = jovem ? '\n- Você fala com um adolescente: linguagem simples e acolhedora, exemplos do dia a dia da escola. Conteúdo sempre adequado para menores de idade. Não peça dados pessoais (endereço, telefone, fotos).' : '';
    return base + idade + quem + '\n\n=== MATERIAL DE ESTUDO ===\n' + String(material).slice(0, 4500);
  }
  function enviar(texto){
    texto = String(texto || '').trim();
    if(!texto || pedido) return;
    if(st && !st.disponivel){ desenhar(); return; }
    el.querySelector('#tu-txt').value = '';
    conversa.push({ role:'user', content:texto });
    conversa.push({ role:'assistant', content:'' });
    pedido = 'p' + Date.now(); buffer = '';
    var meu = pedido;
    desenhar();
    api.enviar({ pedido:meu, sistema:sistema(), mensagens:conversa.slice(0, -1).map(function(m){ return { role:m.role, content:limpar(m.content) }; }) })
      .then(function(r){ var u = conversa[conversa.length - 1]; if(u){ u.content = r.texto || buffer; } })
      .catch(function(e){ var u = conversa[conversa.length - 1]; if(u) u.erro = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); stEm = 0; })
      .then(function(){ if(pedido === meu) pedido = null; desenhar(); var t = el.querySelector('#tu-txt'); if(t) t.focus(); });
  }
  function parar(){ if(pedido) api.parar(pedido); }

  function abrir(novo){
    montar();
    window.Tutor.ultimoContexto = novo;
    if(!novo && geral) novo = geral();          /* atalho: o que está na tela */
    var chave = novo && novo.chave;
    if(!ctx || chave !== ctx.chave) conversa = [];
    ctx = novo || null;                          /* mesma conversa, contexto atualizado (ex.: outra página) */
    el.hidden = false;
    document.body.classList.add('tutor-aberto');
    /* o bloco de notas, se estiver aberto em cima do painel, vai para a esquerda dele */
    var bl = document.querySelector('.bloco:not([hidden])');
    if(bl && !document.body.classList.contains('dividido')){
      var r = bl.getBoundingClientRect(), limite = window.innerWidth - el.offsetWidth - 12;
      if(r.right > limite) bl.style.left = Math.max(8, limite - r.width) + 'px';
    }
    desenhar();
    status().then(function(){
      desenhar();
      if(novo && novo.enviar && st.disponivel && !conversa.length) enviar(novo.enviar);
      var t = el.querySelector('#tu-txt'); if(t) t.focus();
    });
  }
  function fechar(){ if(!el) return; parar(); el.hidden = true; document.body.classList.remove('tutor-aberto'); }

  /* ── passo a passo para instalar a IA grátis ── */
  function ajuda(){
    U.modal('<div class="guia-topo">' + Mascote.avatar(56) + '<h2>Ligar a '+Mascote.nome+': IA grátis no seu computador</h2></div>' +
      '<p>A '+Mascote.nome+' funciona com uma IA que roda <b>no próprio PC</b>, sem internet e sem pagar. Precisa de um computador razoável: no seu PC de casa (RX 9060 XT 8 GB + 16 GB de RAM) ela fica rápida; no do trabalho (8 GB, sem placa de vídeo) fica lenta.</p>' +
      '<ol class="passos-guia">' +
        '<li><b>Baixe o LM Studio</b> em <a href="https://lmstudio.ai" target="_blank">lmstudio.ai</a> (versão para Windows) e instale. É gratuito.</li>' +
        '<li><b>Baixe um modelo.</b> No LM Studio, clique na <b>lupa (Discover)</b>, busque <code>qwen2.5-7b-instruct</code> e baixe a versão <b>Q4_K_M</b> (≈ 4,7 GB). Depois, se quiser respostas melhores, teste <code>gemma-3-12b</code> (≈ 8 GB).</li>' +
        '<li><b>Placa de vídeo AMD:</b> nas configurações de <b>Runtime</b> (Ctrl+Shift+R), escolha o motor <b>Vulkan</b> e confira se a RX 9060 XT aparece. Assim a IA usa a placa e fica rápida.</li>' +
        '<li><b>Ligue o servidor.</b> Vá na aba <b>Developer</b> (ícone <code>&gt;_</code>) e ligue a chave <b>Status: Running</b>. A porta deve ser <b>1234</b>. Carregue o modelo no topo (“Select a model to load”) e, se aparecer, coloque <b>Context Length</b> em 8192.</li>' +
        '<li><b>Pronto:</b> volte aqui e clique no rostinho da '+Mascote.nome+', no topo da matéria. Ela encontra o LM Studio sozinha. Deixe o LM Studio aberto enquanto estuda.</li>' +
      '</ol>' +
      '<p class="nota-guia"><b>Alternativa:</b> o <b>Ollama</b> (<a href="https://ollama.com" target="_blank">ollama.com</a>) também funciona: instale e rode no Prompt de Comando <code>ollama pull qwen2.5:7b</code>. Ele fica ligado sozinho em segundo plano.<br>Os nomes dos menus podem mudar um pouco conforme a versão do LM Studio.</p>' +
      '<div class="modal-acts"><button class="ghost" id="g-testar">Testar agora</button><button class="btn" id="g-ok">Entendi</button></div>',
      function(m, fecharModal){
        m.querySelector('#g-ok').onclick = fecharModal;
        m.querySelector('#g-testar').onclick = function(){
          var b = this; b.disabled = true; b.textContent = 'Procurando…';
          status(true).then(function(s){
            b.disabled = false; b.textContent = 'Testar agora';
            U.aviso(s.disponivel ? 'A '+Mascote.nome+' está pronta! (' + s.servidor + ' · ' + s.modelo + ')' : 'Ainda não encontrei a IA. ' + (s.motivo || ''), 5000);
            desenhar();
          });
        };
      });
  }

  window.Tutor = {
    abrir: abrir, fechar: fechar, ajuda: ajuda, status: status, lerPerfil: lerPerfil,
    aberto: function(){ return !!el && !el.hidden; },
    /* a matéria aberta informa como montar o contexto geral (null ao sair) */
    definirMateria: function(fn){ geral = fn; if(!fn){ ctx = null; conversa = []; fechar(); } }
  };
  status();
  /* Ctrl+Shift+A abre/fecha a mascote de qualquer lugar */
  document.addEventListener('keydown', function(ev){
    if(ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'a'){ ev.preventDefault(); if(Tutor.aberto()) fechar(); else abrir(null); }
  });
})();
