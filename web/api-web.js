/* Versão para TABLET/CELULAR (app web instalável, PWA): o mesmo programa,
   com as mesmas telas (src/), mas o “motor” que no computador fica no
   Electron (main.js + lib/) aqui roda dentro do navegador:
     - dados no IndexedDB do próprio aparelho (matérias, progresso, arquivos, config);
     - PDFs servidos pelo service worker (web/sw.js) em ../materias/<id>/…;
     - IA online (Gemini…) chamada direto do navegador (a API aceita CORS).
   Este arquivo define window.api com os mesmos nomes do preload.js.
   Constantes do build (versão, contato, estilos de prova, serviços de IA)
   vêm de web/gerado.js (scripts/montar-web.js). */
(function(){
  'use strict';
  var G = window.WEB_GERADO || {};
  window.PLATAFORMA_WEB = true;
  window.BASE_MATERIAS = '../materias/';
  document.documentElement.classList.add('web');
  /* no tablet a tela é menor: o bloco de notas começa fechado (abre no botão 📝) */
  try { if(!localStorage.getItem('blocoNotas')) localStorage.setItem('blocoNotas', JSON.stringify({ aberto:false })); } catch(e){}

  /* ── IndexedDB ── */
  var DB_NOME = 'plataforma-estudo', LOJAS = ['kv', 'materias', 'progresso', 'arquivos'];
  var dbp = null;
  function db(){
    if(dbp) return dbp;
    dbp = new Promise(function(ok, falha){
      var r = indexedDB.open(DB_NOME, 1);
      r.onupgradeneeded = function(){ LOJAS.forEach(function(l){ if(!r.result.objectStoreNames.contains(l)) r.result.createObjectStore(l); }); };
      r.onsuccess = function(){ ok(r.result); };
      r.onerror = function(){ falha(r.error); };
    });
    return dbp;
  }
  function tx(loja, modo, fn){
    return db().then(function(d){ return new Promise(function(ok, falha){
      var t = d.transaction(loja, modo), s = t.objectStore(loja), res;
      var r = fn(s);
      if(r) r.onsuccess = function(){ res = r.result; };
      t.oncomplete = function(){ ok(res); };
      t.onerror = function(){ falha(t.error); };
    }); });
  }
  var ler = function(loja, k){ return tx(loja, 'readonly', function(s){ return s.get(k); }); };
  var gravar = function(loja, k, v){ return tx(loja, 'readwrite', function(s){ return s.put(v, k); }); };
  var apagar = function(loja, k){ return tx(loja, 'readwrite', function(s){ return s.delete(k); }); };
  var todos = function(loja){ return tx(loja, 'readonly', function(s){ return s.getAll(); }); };
  var chaves = function(loja){ return tx(loja, 'readonly', function(s){ return s.getAllKeys(); }); };
  /* o navegador pode apagar dados de sites; instalado como app, pedimos para guardar de vez */
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function(){});

  /* ── config ── */
  var PADRAO = { questoesPorAula:6, assistente:{ modo:'auto', modelo:'' }, geracao:{ provedor:'auto', url:'', modelo:'', chave:'' },
    usuario:{ nome:'', estuda:'', curso:'', focoCurto:true }, boasVindas:false, ia:{ escolhida:'auto' } };
  function lerConfig(){ return ler('kv', 'config').then(function(c){ return Object.assign({}, PADRAO, c || {}); }); }
  function gravarConfig(c){ return gravar('kv', 'config', c); }

  var ESTILOS = G.estilos || {};
  function chaveEstilo(texto){
    var t = String(texto || '').toLowerCase();
    if(/m[eé]dio|escola/.test(t)) return 'medio';
    if(/enem|vestibular/.test(t)) return 'enem';
    if(/faculdade|gradua|universi/.test(t)) return 'faculdade';
    if(/concurso/.test(t)) return 'concurso';
    if(/t[eé]cnico/.test(t)) return 'tecnico';
    if(/idioma|ingl[eê]s|espanhol/.test(t)) return 'idiomas';
    return t ? 'outro' : 'faculdade';
  }
  /* o mesmo de lib/publico.js: para quem é o material */
  function publico(cfg, materia){
    var u = cfg.usuario || {};
    var k = materia && ESTILOS[materia.estilo] ? materia.estilo : chaveEstilo(u.estuda);
    var e = ESTILOS[k] || { quem:'um estudante', prova:'as provas', linguagem:'', questoes:'', ar:true, disc:'no nível de uma prova escrita' };
    var curso = String(u.curso || '').trim();
    return Object.assign({ chave:k, curso:curso, foco:u.focoCurto !== false, quem:e.quem + (curso ? ' (' + curso + ')' : '') }, e);
  }
  function servicoDaUrl(url){
    var u = String(url || '').replace(/\/+$/, '');
    return Object.keys(G.online || {}).filter(function(k){ return G.online[k].url === u; })[0] || 'outra';
  }
  function iaOnline(cfg){
    var g = cfg.geracao || {};
    if(!g.url || !g.modelo || !g.chave) return null;
    var sv = servicoDaUrl(g.url);
    return { id:'online', tipo:'compativel', nome: sv === 'outra' ? 'IA online' : G.online[sv].nome, url:g.url.replace(/\/+$/, ''), modelo:g.modelo, chave:g.chave, gratis: sv !== 'outra' && G.online[sv].gratis };
  }
  function publicoCfg(c){
    var ia = iaOnline(c);
    return {
      temChave:false, finalChave:'', modelo:'', modelos:[], questoesPorAula:c.questoesPorAula,
      assistente:Object.assign({}, PADRAO.assistente, c.assistente),
      geracao:{ provedor:'auto', url:(c.geracao || {}).url || '', modelo:(c.geracao || {}).modelo || '', temChave:!!(c.geracao || {}).chave },
      sincronizacao:{ desligada:true, pasta:'' }, usuario:Object.assign({}, PADRAO.usuario, c.usuario), boasVindas:!!c.boasVindas,
      ia:{ escolhida: ia ? 'online' : 'auto' }, edicao:'tablet', versao:G.versao || '0', estudo:publico(c)
    };
  }

  /* ── matérias ── */
  function hojeISO(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function resumoCartao(m, p){
    p = p || {};
    var ids = {}; m.questoes.forEach(function(q){ ids[q.id] = 1; });
    var resp = (p.simulado && p.simulado.respostas) || {}, respondidas = 0, acertos = 0;
    m.questoes.forEach(function(q){ if(resp[q.id] === undefined) return; respondidas++; if(resp[q.id] === q.c) acertos++; });
    var hoje = hojeISO();
    var revisarHoje = Object.keys(p.revisao || {}).filter(function(k){ return ids[k] && p.revisao[k].proxima <= hoje; }).length;
    return { id:m.id, nome:m.nome, subtitulo:m.subtitulo || '', cor:m.cor || '#8FD0E8', nAulas:m.aulas.length, nQuestoes:m.questoes.length, nDiscursivas:m.discursivas.length,
      nAtividades:m.atividades.length, nMapas:m.mapas.length, respondidas:respondidas, acertos:acertos, revisarHoje:revisarHoje, atividadesFeitas:Object.keys(p.atividades || {}).length,
      pendentes:(m.fontes || []).filter(function(f){ return f.status !== 'gerada'; }).length, ultimo:p.ultimo || null, atualizadoEm:m.atualizadoEm };
  }
  function completar(m){
    ['aulas','mapas','questoes','discursivas','atividades','formulas','blocos','arquivos','fontes','rodadas','resumos'].forEach(function(k){ if(!Array.isArray(m[k])) m[k] = []; });
    m.textos = m.textos || {};
    return m;
  }
  function lerMateria(id){ return ler('materias', id).then(function(m){ if(!m) throw new Error('Matéria não encontrada.'); return completar(m); }); }
  function gravarMateria(m){ m.atualizadoEm = new Date().toISOString(); return gravar('materias', m.id, m); }
  function slug(nome, existentes){
    var base = String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'materia';
    var id = base, i = 2; while(existentes.indexOf(id) >= 0) id = base + '-' + i++;
    return id;
  }
  var estados = {};   /* geração em andamento (etapa 2) */

  /* ── arquivos ── */
  function mimeDe(nome){
    var e = String(nome).toLowerCase().split('.').pop();
    return { pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', md:'text/markdown', txt:'text/plain', json:'application/json',
      pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[e] || 'application/octet-stream';
  }
  function urlArquivo(id, rel){ return window.BASE_MATERIAS + encodeURIComponent(id) + '/' + rel.split('/').map(encodeURIComponent).join('/'); }
  /* escolher arquivos: o input do navegador (no tablet, abre arquivos, câmera ou galeria) */
  var escolhidos = {}, nEscolha = 0;
  function escolher(accept, multiplo){
    /* só para os testes automáticos: entregam os arquivos sem abrir o seletor */
    if(window.__escolherTeste) return Promise.resolve((window.__escolherTeste(accept) || []).map(function(f){ var k = 'web-' + (++nEscolha) + '/' + f.name; escolhidos[k] = f; return k; }));
    return new Promise(function(ok){
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.multiple = multiplo !== false;
      inp.style.display = 'none'; document.body.appendChild(inp);
      inp.onchange = function(){
        var lista = Array.prototype.slice.call(inp.files || []).map(function(f){ var k = 'web-' + (++nEscolha) + '/' + f.name; escolhidos[k] = f; return k; });
        inp.remove(); ok(lista);
      };
      /* fechou sem escolher: o navegador não avisa; o foco volta à página */
      window.addEventListener('focus', function voltou(){ window.removeEventListener('focus', voltou); setTimeout(function(){ if(document.body.contains(inp)){ inp.remove(); ok([]); } }, 800); });
      inp.click();
    });
  }
  function baixar(blob, nome){
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  /* ── pacote .estudo (o mesmo formato do PC: lib/compartilhar.js) ── */
  var ENTRA = /^(materia\.json|arquivos\/.+|fontes\/.+|gerado\/rodadas\.json)$/;
  function importarPacote(){
    return escolher('.estudo,.zip,application/zip', false).then(function(lista){
      if(!lista.length) return null;
      var arq = escolhidos[lista[0]];
      return JSZip.loadAsync(arq).catch(function(){ throw new Error('Esse arquivo não é uma matéria da Plataforma de Estudo.'); }).then(function(zip){
        var mj = zip.file('materia.json');
        if(!mj) throw new Error(zip.file('pedido.txt') ? 'Esse é um PEDIDO de matéria (os slides), não uma matéria pronta.' : 'Esse arquivo não tem uma matéria dentro.');
        return mj.async('string').then(function(txt){
          var m = completar(JSON.parse(txt));
          if(!m.nome || !/^[a-z0-9-]+$/.test(m.id || '')) throw new Error('A matéria dentro do arquivo está incompleta.');
          if(!m.aulas.length && !m.questoes.length && !m.fontes.length) throw new Error('A matéria dentro do arquivo está vazia.');
          return chaves('materias').then(function(ids){
            var atualizar = false;
            if(ids.indexOf(m.id) >= 0){
              atualizar = window.confirm('Você já tem "' + m.nome + '".\n\nOK = atualizar o conteúdo (o que você já estudou continua)\nCancelar = manter as duas');
              if(!atualizar) m.id = slug(m.nome, ids);
            }
            var nomes = Object.keys(zip.files).filter(function(n){ return !zip.files[n].dir && n !== 'materia.json' && n !== 'gerado/rodadas.json' && ENTRA.test(n) && n.split('/').indexOf('..') < 0; });
            var rodadas = zip.file('gerado/rodadas.json');
            return Promise.all(nomes.map(function(n){ return zip.files[n].async('blob').then(function(b){ return gravar('arquivos', m.id + '/' + n, new Blob([b], { type:mimeDe(n) })); }); }))
              .then(function(){ return rodadas ? rodadas.async('string').then(function(t){ try { var r = JSON.parse(t); m.rodadas = m.rodadas.concat(r.filter(function(x){ return !m.rodadas.some(function(y){ return y.n === x.n; }); })); } catch(e){} }) : null; })
              .then(function(){ return gravarMateria(m); })
              .then(function(){ return { id:m.id, nome:m.nome, atualizou:atualizar }; });
          });
        });
      });
    });
  }
  function exportarPacote(id){
    return lerMateria(id).then(function(m){
      var zip = new JSZip();
      zip.file('pacote.json', JSON.stringify({ tipo:'materia', formato:1, nome:m.nome, versaoApp:G.versao, criadoEm:new Date().toISOString() }));
      zip.file('materia.json', JSON.stringify(m));
      return chaves('arquivos').then(function(ks){
        var meus = ks.filter(function(k){ return k.indexOf(id + '/') === 0; });
        return Promise.all(meus.map(function(k){ return ler('arquivos', k).then(function(b){ zip.file(k.slice(id.length + 1), b); }); }));
      }).then(function(){ return zip.generateAsync({ type:'blob' }); }).then(function(b){
        baixar(b, m.nome.replace(/[\\/:*?"<>|]+/g, '-') + '.estudo');
        return { arquivo:m.nome + '.estudo', mb: +(b.size / 1048576).toFixed(1) };
      });
    });
  }

  /* ── diário (o mesmo de lib/diario.js, sem os outros computadores) ── */
  function lerDiario(){ return ler('kv', 'diario').then(function(d){ return Object.assign({ dias:{}, meta:30 }, d || {}); }); }
  function diaAnterior(iso){ var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function ativo(d){ return !!d && ((d.min || 0) + (d.q || 0) + (d.cards || 0)) > 0; }
  function resumoDiario(d){
    var dia = hojeISO(), n = 0;
    if(!ativo(d.dias[dia])) dia = diaAnterior(dia);
    while(ativo(d.dias[dia])){ n++; dia = diaAnterior(dia); }
    return { meta:d.meta, hoje:Object.assign({ min:0, q:0, cards:0 }, d.dias[hojeISO()]), sequencia:n, dias:d.dias };
  }

  /* ── notas ── */
  function lerNotas(){ return ler('kv', 'notas').then(function(d){ return Object.assign({ notas:[] }, d || {}); }); }

  /* ── impressão: um iframe com o documento e o diálogo do Android (imprimir ou “Salvar como PDF”) ── */
  function imprimirHtml(html){
    return new Promise(function(ok){
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(f);
      f.onload = function(){ setTimeout(function(){ try { f.contentWindow.focus(); f.contentWindow.print(); } catch(e){} ok('impresso'); setTimeout(function(){ f.remove(); }, 60000); }, 400); };
      f.srcdoc = html;
    });
  }

  /* ── tutora (o mesmo de lib/assistente.js, só IA online) ── */
  var ouvintesTutor = [], pedidos = {};
  function statusTutor(){
    return lerConfig().then(function(c){
      if((c.assistente || {}).modo === 'desligado') return { disponivel:false, motivo:'A tutora está desligada nas Configurações.' };
      var ia = iaOnline(c);
      if(!ia) return { disponivel:false, motivo:'Para a tutora conversar, ative a IA: ⚙ Configurações → cole o código de ativação.' };
      return { disponivel:true, id:'online', provedor:'compativel', servidor:ia.nome, url:ia.url, modelo:ia.modelo, modelos:[ia.modelo], gratis:!!ia.gratis };
    });
  }
  function conversar(dados){
    return lerConfig().then(function(c){
      var ia = iaOnline(c);
      if(!ia) throw new Error('A IA ainda não está ativada neste aparelho.');
      var pedido = String(dados.pedido || Date.now()), controle = new AbortController();
      pedidos[pedido] = controle;
      var msgs = (dados.mensagens || []).filter(function(m){ return m && m.content && (m.role === 'user' || m.role === 'assistant'); }).slice(-12);
      var texto = '';
      return fetch(ia.url + '/chat/completions', { method:'POST', signal:controle.signal,
        headers:{ 'content-type':'application/json', authorization:'Bearer ' + ia.chave },
        body:JSON.stringify({ model:ia.modelo, stream:true, temperature:0.4, max_tokens:4000, messages:[{ role:'system', content:dados.sistema || '' }].concat(msgs) })
      }).then(function(r){
        if(!r.ok) return r.text().then(function(t){ throw new Error('A IA online respondeu com erro (' + r.status + '). ' + t.slice(0, 160)); });
        return lerStream(r, function(parte){ texto += parte; ouvintesTutor.forEach(function(fn){ fn({ pedido:pedido, texto:parte }); }); });
      }).then(function(){ return { texto:texto, provedor:'compativel', modelo:ia.modelo }; })
        .catch(function(e){ if(controle.signal.aborted) return { texto:texto, parado:true }; throw e; })
        .finally(function(){ delete pedidos[pedido]; });
    });
  }
  /* resposta em pedaços (SSE no formato OpenAI) */
  function lerStream(r, aoParte){
    var leitor = r.body.getReader(), dec = new TextDecoder(), resto = '', fim = null;
    function passo(){
      return leitor.read().then(function(x){
        if(x.done) return fim;
        resto += dec.decode(x.value, { stream:true });
        var linhas = resto.split('\n'); resto = linhas.pop();
        linhas.forEach(function(l){
          var s = l.trim(); if(s.indexOf('data:') !== 0) return;
          var d = s.slice(5).trim(); if(d === '[DONE]') return;
          try { var ch = (JSON.parse(d).choices || [])[0] || {}; if(ch.delta && ch.delta.content) aoParte(ch.delta.content); if(ch.finish_reason) fim = ch.finish_reason; } catch(e){}
        });
        return passo();
      });
    }
    return passo();
  }

  /* ── IA: código de ativação e IA online ── */
  function modelosDe(url, chave){
    return fetch(String(url).replace(/\/+$/, '') + '/models', { headers:{ authorization:'Bearer ' + chave } }).then(function(r){
      if(!r.ok) return { erro:'respondeu ' + r.status, modelos:[] };
      return r.json().then(function(j){ return { modelos:(j.data || j.models || []).map(function(m){ return String(m.id || m.name || '').replace(/^models\//, ''); }).filter(function(id){ return id && !/embed|whisper|tts|dall-e|image|audio|moderation|realtime|transcribe/i.test(id); }) }; });
    }).catch(function(){ return { erro:'sem conexão', modelos:[] }; });
  }
  function base64urlParaTexto(s){ s = s.replace(/-/g, '+').replace(/_/g, '/'); while(s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function usarCodigo(codigo){
    var limpo = String(codigo || '').replace(/\s+/g, ''), d;
    try { if(limpo.indexOf('PE1-') !== 0) throw 0; d = JSON.parse(base64urlParaTexto(limpo.slice(4))); } catch(e){ return Promise.reject(new Error('Esse código não está certo. Confira se copiou ele inteiro.')); }
    if(!/^(https:\/\/|http:\/\/127\.0\.0\.1:)/.test(d.u || '') || !d.m || !d.k) return Promise.reject(new Error('Esse código está incompleto. Peça um novo para quem te mandou.'));
    return modelosDe(d.u, d.k).then(function(r){
      if(!r.modelos.length) throw new Error(/respondeu (400|401|403)/.test(r.erro || '') ? 'Esse código não funciona mais (a chave foi trocada). Peça um novo.' : 'Não consegui falar com a IA. Confira a internet e tente de novo.');
      return lerConfig().then(function(c){ c.geracao = { provedor:'auto', url:d.u, modelo:d.m, chave:d.k }; c.ia = { escolhida:'online' }; return gravarConfig(c); })
        .then(function(){ var sv = servicoDaUrl(d.u); return { nome: sv === 'outra' ? 'IA online' : G.online[sv].nome, modelo:d.m }; });
    });
  }

  var naoNoTablet = function(o){ return function(){ return Promise.reject(new Error(o || 'Isso ainda não está disponível no tablet; use o computador.')); }; };
  var aoGerarFns = [];

  window.api = {
    listar: function(){
      return Promise.all([todos('materias'), tx('progresso', 'readonly', function(s){ return s.getAll(); }), chaves('progresso')]).then(function(r){
        var prog = {}; r[2].forEach(function(k, i){ prog[k] = r[1][i]; });
        return r[0].map(function(m){ return Object.assign(resumoCartao(completar(m), prog[m.id]), { gerando:estados[m.id] || null }); })
          .sort(function(a, b){ return a.nome.localeCompare(b.nome, 'pt-BR'); });
      });
    },
    abrir: function(id){ return Promise.all([lerMateria(id), ler('progresso', id)]).then(function(r){ return { materia:r[0], progresso:r[1] || {}, gerando:estados[id] || null }; }); },
    criar: function(d){
      return chaves('materias').then(function(ids){
        var agora = new Date().toISOString();
        var m = completar({ formato:1, id:slug(d.nome, ids), nome:String(d.nome).trim(), subtitulo:String(d.subtitulo || '').trim(), cor:d.cor || '#8FD0E8', estilo:ESTILOS[d.estilo] ? d.estilo : undefined, criadoEm:agora });
        return gravarMateria(m).then(function(){ return m.id; });
      });
    },
    editar: function(id, d){ return lerMateria(id).then(function(m){ if(d.nome && String(d.nome).trim()) m.nome = String(d.nome).trim(); if(d.subtitulo !== undefined) m.subtitulo = String(d.subtitulo).trim(); if(d.cor) m.cor = d.cor; if(d.estilo !== undefined) m.estilo = ESTILOS[d.estilo] ? d.estilo : undefined; return gravarMateria(m); }); },
    excluir: function(id){
      if(!window.confirm('A matéria será apagada deste aparelho (no tablet não há Lixeira). Continuar?')) return Promise.reject(new Error('Exclusão cancelada.'));
      return chaves('arquivos').then(function(ks){ return Promise.all(ks.filter(function(k){ return k.indexOf(id + '/') === 0; }).map(function(k){ return apagar('arquivos', k); })); })
        .then(function(){ return Promise.all([apagar('materias', id), apagar('progresso', id)]); });
    },
    abrirPasta: function(){ return Promise.resolve(); },
    salvarProgresso: function(id, p){ return gravar('progresso', id, JSON.parse(JSON.stringify(p))).then(function(){ return false; }); },

    escolherArquivos: function(tipo){ return escolher(tipo === 'resumo' ? '.pdf,.pptx,.docx,.txt,.md,image/*' : '.pdf,.pptx,image/*'); },
    adicionarArquivos: function(id, caminhos){ return window.WebGerador ? WebGerador.adicionarArquivos(id, caminhos.map(function(k){ return escolhidos[k]; })) : naoNoTablet()(); },
    cancelarImportacao: function(){ return Promise.resolve(); },
    removerPendente: function(id, fonteId){ return lerMateria(id).then(function(m){ m.fontes = m.fontes.filter(function(f){ return f.id !== fonteId || f.status === 'gerada'; }); m.arquivos = m.arquivos.filter(function(a){ return a.id !== fonteId && a.id.indexOf(fonteId + '-f') !== 0; }); return gravarMateria(m); }); },
    abrirFora: function(id, rel){ window.open(urlArquivo(id, rel), '_blank'); return Promise.resolve(); },

    gerar: function(id, opcoes){ return window.WebGerador ? WebGerador.gerar(id, opcoes || {}) : naoNoTablet('Criar matérias no tablet chega na próxima atualização. Por enquanto, abra uma matéria pronta (.estudo).')(); },
    cancelarGeracao: function(id){ if(window.WebGerador) WebGerador.cancelar(id); return Promise.resolve(); },
    statusGeracao: function(){
      return lerConfig().then(function(c){
        var ia = iaOnline(c);
        var opcoes = ia ? [{ tipo:'online', nome:ia.nome + ' (online)', modelo:ia.modelo, gratis:!!ia.gratis }] : [];
        return ia && window.WebGerador ? { disponivel:true, tipo:'online', nome:ia.nome, modelo:ia.modelo, gratis:!!ia.gratis, opcoes:opcoes }
          : { disponivel:false, motivo: ia ? 'Criar matérias no tablet chega na próxima atualização.' : 'Ative a IA com o código de ativação (⚙ Configurações).', opcoes:opcoes };
      });
    },
    aoGerar: function(fn){ aoGerarFns.push(fn); return function(){ aoGerarFns = aoGerarFns.filter(function(x){ return x !== fn; }); }; },

    ias: {
      listar: function(){ return lerConfig().then(function(c){ var ia = iaOnline(c); return { escolhida: ia ? 'online' : 'auto', opcoes: ia ? [{ id:'online', tipo:'compativel', nome:ia.nome, modelos:[ia.modelo], gratis:!!ia.gratis, online:true }] : [] }; }); },
      testarOnline: function(d){
        var url = d.servico && G.online[d.servico] ? G.online[d.servico].url : d.url;
        return lerConfig().then(function(c){
          var chave = d.chave || ((c.geracao || {}).url === url ? (c.geracao || {}).chave : '');
          if(!chave) throw new Error('Cole a chave da API.');
          return modelosDe(url, chave).then(function(r){ if(!r.modelos.length) throw new Error(/respondeu (400|401|403)/.test(r.erro || '') ? 'A chave não foi aceita. Confira se copiou inteira.' : 'Não consegui falar com o serviço (' + (r.erro || 'sem modelos') + ').'); return { url:url, modelos:r.modelos }; });
        });
      },
      servicos: function(){ return Promise.resolve(G.online || {}); },
      gerarCodigo: function(){ return lerConfig().then(function(c){ var g = c.geracao || {}; if(!g.url || !g.modelo || !g.chave) throw new Error('Conecte uma IA online antes de gerar o código.'); return 'PE1-' + btoa(unescape(encodeURIComponent(JSON.stringify({ u:g.url, m:g.modelo, k:g.chave })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }); },
      usarCodigo: usarCodigo
    },

    notas: {
      listar: function(){
        return Promise.all([lerNotas(), todos('materias')]).then(function(r){
          var nomes = {}; r[1].forEach(function(m){ nomes[m.id] = m.nome; });
          return r[0].notas.map(function(n){ return Object.assign({}, n, { materiaNome: nomes[n.materiaId] || 'Geral' }); }).sort(function(a, b){ return b.atualizadoEm.localeCompare(a.atualizadoEm); });
        });
      },
      salvar: function(e){
        return lerNotas().then(function(d){
          var agora = new Date().toISOString(), n = d.notas.filter(function(x){ return x.id === e.id; })[0];
          if(!n){ n = { id:e.id || ('n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), materiaId:e.materiaId || null, criadoEm:agora }; d.notas.push(n); }
          var cor = function(c){ return /^#[0-9A-Fa-f]{6}$/.test(c || '') ? c : null; };
          n.titulo = String(e.titulo || '').slice(0, 200); n.texto = String(e.texto || ''); n.tinta = cor(e.tinta); n.papel = cor(e.papel); n.atualizadoEm = agora;
          return gravar('kv', 'notas', d).then(function(){ return { id:n.id, atualizadoEm:agora, nuvem:false }; });
        });
      },
      excluir: function(ids){ return lerNotas().then(function(d){ d.notas = d.notas.filter(function(x){ return ids.indexOf(x.id) < 0; }); return gravar('kv', 'notas', d); }); },
      exportar: function(ids){ return window.api.notas.listar().then(function(l){ var t = l.filter(function(n){ return ids.indexOf(n.id) >= 0; }).map(function(n){ return '■ ' + (n.titulo || 'Sem título') + '\n\n' + (n.texto || ''); }).join('\n\n────────\n\n'); baixar(new Blob([t], { type:'text/plain' }), 'Notas.txt'); return 'Downloads'; }); },
      email: function(ids){ return window.api.notas.listar().then(function(l){ var t = l.filter(function(n){ return ids.indexOf(n.id) >= 0; }).map(function(n){ return (n.titulo || '') + '\n\n' + (n.texto || ''); }).join('\n\n----\n\n').slice(0, 1800); location.href = 'mailto:?subject=' + encodeURIComponent('Notas — Plataforma de Estudo') + '&body=' + encodeURIComponent(t); return { cortado:false }; }); },
      status: function(){ return Promise.resolve({ nuvem:null }); },
      abrirNuvem: naoNoTablet()
    },

    reformularQuestoes: naoNoTablet('Gerar uma rodada nova de questões ainda é só no computador.'),
    pdfPreenchido: naoNoTablet('Salvar o PDF preenchido ainda é só no computador.'),
    imprimirPdf: function(d){ window.open(urlArquivo(d.id, d.rel || d.caminho || ''), '_blank'); return Promise.resolve(); },
    imprimir: function(html){ return imprimirHtml(html); },
    atualizacao: {
      status: function(){ return Promise.resolve({ fase:'atual', msg:'o app do tablet se atualiza sozinho quando você abre com internet (versão ' + G.versao + ').' }); },
      verificar: function(){ return (navigator.serviceWorker ? navigator.serviceWorker.getRegistration().then(function(r){ return r && r.update(); }) : Promise.resolve()).then(function(){ return { fase:'atual', msg:'procurei: se houver versão nova, ela entra quando você reabrir o app.' }; }); },
      instalar: function(){ location.reload(); return Promise.resolve(); },
      aoMudar: function(fn){ window.addEventListener('web-nova-versao', function(){ fn({ fase:'pronta', versao:'nova', notas:'' }); }); return function(){}; }
    },
    diario: {
      obter: function(){ return lerDiario().then(resumoDiario); },
      registrar: function(tipo, n){ return lerDiario().then(function(d){ var h = hojeISO(); var dia = d.dias[h] = Object.assign({ min:0, q:0, cards:0 }, d.dias[h]); dia[tipo] += Math.max(0, Math.min(1000, +n || 0)); return gravar('kv', 'diario', d).then(function(){ return resumoDiario(d); }); }); },
      meta: function(min){ return lerDiario().then(function(d){ d.meta = Math.max(10, Math.min(240, +min || 30)); return gravar('kv', 'diario', d).then(function(){ return resumoDiario(d); }); }); }
    },
    corrigirDiscursiva: naoNoTablet('A correção da discursiva pela IA ainda é só no computador (com o Claude). Compare com a resposta modelo.'),
    sinc: {
      verificar: function(){ return Promise.resolve(false); },
      agora: function(){ return Promise.resolve({ status:{ ativa:false, motivo:'No tablet, os dados ficam só neste aparelho. Para levar uma matéria, use ⋯ → Salvar para enviar.' } }); },
      status: function(){ return Promise.resolve({ ativa:false, motivo:'No tablet, os dados ficam só neste aparelho.' }); },
      aoMudar: function(){ return function(){}; }
    },
    tutor: {
      status: statusTutor,
      enviar: conversar,
      parar: function(pedido){ var c = pedidos[String(pedido)]; if(c) c.abort(); return Promise.resolve(); },
      aoReceber: function(fn){ ouvintesTutor.push(fn); return function(){ ouvintesTutor = ouvintesTutor.filter(function(x){ return x !== fn; }); }; }
    },
    suporte: {
      preparar: function(){ return Promise.resolve({ temFoto:false, temContato:!!(G.contato && (G.contato.whatsapp || G.contato.email)) }); },
      enviar: function(d){
        return lerConfig().then(function(c){
          var t = { erro:'🐞 Erro', sugestao:'💡 Sugestão', duvida:'❓ Dúvida' }[d.tipo] || 'Mensagem';
          var msg = t + ' na Plataforma de Estudo (tablet) — de ' + ((c.usuario || {}).nome || 'alguém') + '\n\n' + String(d.texto || '').trim() + (d.comDados ? '\n\n— dados técnicos —\nVersão ' + G.versao + ' · tablet · ' + navigator.userAgent.slice(0, 120) : '');
          var ct = G.contato || {};
          if(d.canal === 'whatsapp') window.open('https://wa.me/' + String(ct.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(msg.slice(0, 1800)), '_blank');
          else location.href = 'mailto:' + (ct.email || '') + '?subject=' + encodeURIComponent(t + ' — Plataforma de Estudo') + '&body=' + encodeURIComponent(msg.slice(0, 1800));
          return { foto:null };
        });
      }
    },
    pacote: {
      exportar: exportarPacote,
      importar: importarPacote,
      pedido: naoNoTablet('Pedir matéria pelo tablet chega na próxima atualização.'),
      avisarPedido: naoNoTablet()
    },
    resumo: {
      criar: function(id, d){ return window.WebGerador ? WebGerador.resumir(id, Object.assign({}, d, { externos:(d.externos || []).map(function(k){ return escolhidos[k]; }).filter(Boolean) })) :naoNoTablet('O resumo no tablet chega na próxima atualização.')(); },
      cancelar: function(id){ if(window.WebGerador) WebGerador.cancelarResumo(id); return Promise.resolve(); },
      excluir: function(id, rid){ return lerMateria(id).then(function(m){ m.resumos = m.resumos.filter(function(x){ return x.id !== rid; }); return gravarMateria(m); }); },
      aoAndar: function(fn){ var h = function(e){ fn(e.detail); }; window.addEventListener('web-resumo', h); return function(){ window.removeEventListener('web-resumo', h); }; }
    },
    perfis: {
      listar: function(){ return lerConfig().then(function(c){ var u = c.usuario || {}; return { atual:'principal', escolhido:true, perfis:[{ id:'principal', principal:true, emoji:'🦊', cor:'#8FD0E8', nome:u.nome || 'Você', estuda:u.estuda || '', curso:u.curso || '' }] }; }); },
      criar: naoNoTablet('Vários perfis no mesmo tablet chegam numa próxima atualização.'),
      usar: function(){ return Promise.resolve(true); },
      excluir: naoNoTablet()
    },
    config: function(){ return lerConfig().then(publicoCfg); },
    salvarConfig: function(d){
      return lerConfig().then(function(c){
        if(d.questoesPorAula) c.questoesPorAula = Math.max(3, Math.min(10, +d.questoesPorAula || 6));
        if(d.assistente) c.assistente = Object.assign({}, c.assistente, { modo: d.assistente.modo === 'desligado' ? 'desligado' : 'auto' });
        if(d.geracao){ var g = Object.assign({}, c.geracao); if(d.geracao.url !== undefined) g.url = /^https?:\/\/\S+$/.test(String(d.geracao.url).trim()) ? String(d.geracao.url).trim().replace(/\/+$/, '') : ''; if(d.geracao.modelo !== undefined) g.modelo = String(d.geracao.modelo || '').trim(); if(d.geracao.chave !== undefined) g.chave = String(d.geracao.chave || '').trim(); c.geracao = g; }
        if(d.usuario) c.usuario = Object.assign({}, c.usuario, { nome:String(d.usuario.nome || '').trim().slice(0, 40), estuda:String(d.usuario.estuda || '').trim().slice(0, 60) }, d.usuario.curso !== undefined ? { curso:String(d.usuario.curso || '').slice(0, 60) } : {}, d.usuario.focoCurto !== undefined ? { focoCurto:!!d.usuario.focoCurto } : {});
        if(d.boasVindas !== undefined) c.boasVindas = !!d.boasVindas;
        return gravarConfig(c).then(function(){ return publicoCfg(c); });
      });
    },
    testarChave: function(){ return Promise.resolve({ ok:false, msg:'O Claude não está disponível no tablet.' }); }
  };

  /* para o gerador do tablet (web/gerador-web.js) usar as mesmas peças */
  window.WebBase = { db:db, ler:ler, gravar:gravar, apagar:apagar, chaves:chaves, lerConfig:lerConfig, iaOnline:iaOnline, publico:publico, lerMateria:lerMateria, gravarMateria:gravarMateria,
    mimeDe:mimeDe, urlArquivo:urlArquivo, servicoDaUrl:servicoDaUrl, lerStream:lerStream, estados:estados, emitirGeracao:function(id, e){ if(e.fase === 'fim' || e.fase === 'erro' || e.fase === 'cancelada') delete estados[id]; else estados[id] = e; aoGerarFns.forEach(function(fn){ fn(Object.assign({ id:id }, e)); }); } };

  /* service worker: abre sem internet e entrega os PDFs guardados */
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('../sw.js', { scope:'../' }).then(function(reg){
      reg.addEventListener('updatefound', function(){ var w = reg.installing; if(w) w.addEventListener('statechange', function(){ if(w.state === 'installed' && navigator.serviceWorker.controller) window.dispatchEvent(new Event('web-nova-versao')); }); });
    }).catch(function(){});
  }
})();
