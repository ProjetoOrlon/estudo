/* Núcleo da geração de matérias, IGUAL no computador (lib/gerador.js, Node)
   e no tablet (web/gerador-web.js, navegador): formatos (JSON Schema) que a IA
   preenche, instruções, limpeza das questões, integração na matéria e os
   passos de cada aula, da visão geral e do resumo. Quem chama fornece “io”:
   chamar (a IA), publico (perfil de estudo), questoesPorAula, formulasDasAulas.
   Não usa disco, rede nem Electron — só JavaScript. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./assercao-razao'));
  else raiz.NucleoGeracao = fabrica(raiz.AssercaoRazao);
})(typeof self !== 'undefined' ? self : this, function (AR) {
'use strict';

/* ── formatos (JSON Schema) ── */
const S = { type: 'string' };
const I = { type: 'integer' };
const B = { type: 'boolean' };
const arr = (items) => ({ type: 'array', items });
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const arrN = (items, min, max) => Object.assign({ type: 'array', items }, min !== undefined ? { minItems: min } : {}, max !== undefined ? { maxItems: max } : {});
const IDX = { type: 'integer', minimum: 0, maximum: 4 };
const L_MAPA = obj({ arco: S, nome: S, ramos: arrN(obj({ t: S, f: arrN(obj({ t: S, d: S }), 2, 4) }), 4, 6) });
const L_AULA = obj({ titulo: S, nucleo: S, ramos: arrN(obj({ t: S, i: arrN(S, 2, 5) }), 3, 6), prova: arrN(S, 4, 8), pegadinha: S });
const L_QUEST = (n) => obj({ questoes: arrN(obj({ e: S, o: arrN(S, 5, 5), c: IDX, x: S }), n, n) });
const L_CONF = obj({ verificacoes: arrN(obj({ id: I, ok: B, motivo: S })) });
const L_AR = obj({ assercoes: arrN(obj({ i1: S, i2: S, c: IDX, x: S }), 2, 2) });
const L_ATIV = obj({
  atividades: arrN(obj({ tipo: { type: 'string', enum: ['caso', 'sala', 'aval'] }, titulo: S, enunciado: S, sozinho: S, guia: arrN(S, 3, 6) }), 1, 4),
  formulas: arrN(obj({ k: S, v: S, n: S }), 0, 8)
});
const L_BLOCOS = obj({ blocos: arrN(obj({ nome: S, resumo: S, aulas: arrN(I, 1, 40) }), 1, 8) });
const L_DISC = (n) => obj({ discursivas: arrN(obj({ tema: S, enunciado: S, chaves: arrN(S, 3, 6), modelo: S }), n, n) });
const L_RESUMO = obj({
  titulo: S, introducao: S,
  secoes: arrN(obj({ titulo: S, pontos: arrN(S, 1, 10), destaque: S }), 1, 14),
  conceitos: arrN(obj({ termo: S, definicao: S }), 0, 16),
  lembrar: arrN(S, 2, 8)
});
const L_RESUMO_FIM = obj({ titulo: S, introducao: S, lembrar: arrN(S, 3, 8) });
const PEDIDO_RESUMO = 'Faça um RESUMO DE ESTUDO do material: só os pontos principais, sem enrolação e fiel ao material. ' +
  '"titulo": o assunto, até 10 palavras. "introducao": 1 ou 2 frases dizendo do que o material trata. ' +
  '"secoes": os tópicos na ordem do material; cada um com "titulo" curto, "pontos" (frases curtas e completas, com os números, nomes, datas, fórmulas e definições importantes) e "destaque" (a ideia mais importante do tópico, em 1 frase). ' +
  '"conceitos": os termos-chave com uma definição curta. "lembrar": os pontos que mais provavelmente caem na prova.';

/* ── instruções ── */
const SISTEMA_LOCAL = `Você prepara material de estudo para prova, em português do Brasil, para um estudante universitário com TDAH que tem dificuldade de memorização.
Regras:
- Responda SOMENTE com o JSON pedido, sem texto antes ou depois.
- Seja fiel ao MATERIAL DA AULA. Não invente números, autores ou definições que contradigam o material.
- Texto curto e direto. Nenhum item de lista passa de duas linhas.
- Escreva tudo em português do Brasil.`;
/* Material que é imagem (páginas escaneadas, fotos): a IA online “lê” cada
   página, 3 por vez, e devolve o texto no formato “### Página N”. */
const LER_IMAGENS = 'Estas imagens são páginas de um material de estudo. Transcreva FIELMENTE todo o texto de cada página, em português, sem resumir e sem inventar. ' +
  'Comece cada página com uma linha "### Página N" (o número que eu indicar). Mantenha títulos, listas, tabelas (em texto) e fórmulas. ' +
  'Se houver figura ou diagrama importante, descreva em uma linha entre colchetes. Se a página estiver em branco ou ilegível, escreva [página sem texto legível]. Responda só com a transcrição.';
const podeLerImagens = (p) => !!(p && p.tipo === 'compativel');

/* JSON “quase certo” (alguns modelos põem texto em volta): pega do primeiro { ao último } */
function lerJson(txt) {
  const limpo = String(txt || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  try { return JSON.parse(limpo); } catch (e) {
    const a = limpo.indexOf('{'), b = limpo.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(limpo.slice(a, b + 1));
    throw new SyntaxError('resposta sem JSON');
  }
}

/* ── partes de livros grandes e capítulos ── */
/* corta em partes de até `limite` caracteres, quebrando entre páginas
   (sempre igual para o mesmo texto e o mesmo limite: dá para refazer) */
const LIMITE_PADRAO = 24000;
function cortarEmPartes(texto, limite) {
  const partes = [];
  let atual = '';
  for (const pg of texto.split(/\n(?=### Página \d+)/)) {
    if (atual && atual.length + pg.length > limite) { partes.push(atual); atual = pg; } else atual += (atual ? '\n\n' : '') + pg;
  }
  if (atual) partes.push(atual);
  const finais = [];
  partes.forEach((p) => { for (let i = 0; i < p.length; i += limite) finais.push(p.slice(i, i + limite)); });
  return finais;
}
/* [primeira, última] página de um trecho; um trecho que começa no meio de uma
   página continua a página do anterior */
function paginasDoTrecho(t, anterior) {
  const ps = [...t.matchAll(/### Página (\d+)/g)].map((x) => +x[1]);
  if (!ps.length) return anterior ? [anterior[1], anterior[1]] : null;
  return [anterior && !t.startsWith('### Página') ? anterior[1] : ps[0], ps[ps.length - 1]];
}

/* ── capítulos: as partes de um livro agrupadas pelo sumário do próprio PDF ──
   Em vez de “Aula 1 … Aula 169”, os blocos da matéria viram os capítulos. */
const CAPITULO = /^(cap[ií]tulo|unidade|m[oó]dulo|aula|li[cç][aã]o|chapter|tema)\b/i;
/* até ~80 letras, cortando entre palavras */
function encurtar(t) { return t.length <= 80 ? t : t.slice(0, 80).replace(/\s+\S*$/, '') + '…'; }
function capitulosDoSumario(itens) {
  const caps = [];
  if (itens.filter((i) => CAPITULO.test(i.titulo)).length >= 2) {
    let tomo = '', parte = '';
    itens.forEach((it, k) => {
      if (/^(tomo|volume|livro)\b/i.test(it.titulo)) { tomo = it.titulo; parte = ''; return; }
      if (/^parte\b/i.test(it.titulo)) { parte = it.titulo; return; }
      if (!CAPITULO.test(it.titulo)) return;
      /* “Capítulo 1” + o título que vem logo abaixo dele no sumário */
      const sub = itens[k + 1] && itens[k + 1].nivel > it.nivel && itens[k + 1].pag === it.pag ? itens[k + 1].titulo : '';
      caps.push({ pag: it.pag, nome: encurtar(it.titulo + (sub && !CAPITULO.test(sub) ? ' — ' + sub : '')), onde: [tomo, parte].filter(Boolean).join(' · ') });
    });
  } else {
    itens.filter((i) => i.nivel === 0).forEach((i) => caps.push({ pag: i.pag, nome: encurtar(i.titulo), onde: '' }));
  }
  return caps.length >= 2 && caps.length <= 200 ? caps : [];
}
function aplicarCapitulos(m) {
  const sum = m.capitulos || {};
  const grupos = [], porChave = new Map(), soltas = [];
  for (const a of m.aulas) {
    const f = m.fontes.find((x) => x.id === a.fonte);
    const caps = f && f.paginas && sum[f.arquivo];
    if (!caps || !caps.length) { soltas.push(a); continue; }
    const meio = Math.floor((f.paginas[0] + f.paginas[1]) / 2);   /* a parte entra no capítulo onde está a maior parte dela */
    let i = -1;
    caps.forEach((c, k) => { if (c.pag <= meio) i = k; });
    const chave = f.arquivo + '#' + i;
    if (!porChave.has(chave)) { porChave.set(chave, { c: i >= 0 ? caps[i] : { nome: 'Início do livro', onde: '' }, aulas: [] }); grupos.push(porChave.get(chave)); }
    porChave.get(chave).aulas.push(a);
  }
  if (!grupos.length) return false;
  grupos.sort((x, y) => x.aulas[0].n - y.aulas[0].n);
  if (soltas.length) grupos.push({ c: { nome: 'Outras aulas', onde: '' }, aulas: soltas });
  m.blocos = grupos.map((g, i) => {
    g.aulas.forEach((a) => { a.bloco = 'c' + (i + 1); });
    return { id: 'c' + (i + 1), nome: g.c.nome, faixa: faixa(g.aulas.map((a) => a.n)), resumo: g.c.onde || '' };
  });
  return true;
}
function temCapitulos(m) { return Object.values(m.capitulos || {}).some((c) => c.length); }

/* ── validação e integração na matéria ── */
function limparQuestoes(lista) {
  const ok = [];
  for (const q of lista || []) {
    if (!q || !q.e || !Array.isArray(q.o) || !Number.isInteger(q.c) || q.c < 0 || q.c >= q.o.length) continue;
    /* sem a letra que algumas IAs põem no começo (“C. …”, “a) …”): a tela embaralha e põe a letra certa */
    let o = q.o.map((s) => String(s).trim().replace(/^\(?[A-Ea-e]\s*[\)\.\-:–]\s+/, '')).filter(Boolean);
    if (o.length !== q.o.length) continue;
    let c = q.c;
    if (o.length > 5) { /* mantém a correta e os primeiros distratores */
      const certa = o[c];
      o = [certa].concat(o.filter((_, j) => j !== c).slice(0, 4));
      c = 0;
    }
    if (o.length !== 5) continue;
    ok.push({ e: q.e, o, c, x: q.x || '', f: q.f === 'extra' ? 'extra' : 'slide', calc: !!q.calc });
  }
  return ok;
}
function limparAssercoes(lista) {
  return (lista || []).filter((q) => q && q.i1 && q.i2 && Number.isInteger(q.c) && q.c >= 0 && q.c <= 4)
    .map((q) => ({ t: 'ar', e: AR.ENUNCIADO, i1: String(q.i1).trim(), i2: String(q.i2).trim(), o: AR.OPCOES.slice(), c: q.c, x: q.x || '', f: 'slide', calc: false }));
}

function faixa(nums) {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  if (!s.length) return '';
  const contiguo = s.every((n, i) => i === 0 || n === s[i - 1] + 1);
  if (s.length === 1) return 'Aula ' + s[0];
  return contiguo ? 'Aulas ' + s[0] + '–' + s[s.length - 1] : 'Aulas ' + s.join(', ');
}

function integrarAula(m, fonte, r) {
  const n = fonte.aula;
  const antiga = m.aulas.find((a) => a.n === n);
  const aula = { n, bloco: antiga ? antiga.bloco : null, titulo: r.titulo, nucleo: r.nucleo, ramos: r.ramos, prova: r.prova, pegadinha: r.pegadinha, fonte: fonte.id };
  m.aulas = m.aulas.filter((a) => a.n !== n).concat([aula]).sort((a, b) => a.n - b.n);

  const mapa = { n, arco: String(r.mapa.arco).toUpperCase(), k: 'AULA ' + n, nome: r.mapa.nome, ramos: r.mapa.ramos };
  m.mapas = m.mapas.filter((x) => x.n !== n).concat([mapa]).sort((a, b) => a.n - b.n);

  m.questoes = m.questoes.filter((q) => q.fonte !== fonte.id)
    .concat(limparQuestoes(r.questoes).concat(limparAssercoes(r.assercoes)).map((q, i) => Object.assign({ id: fonte.id + '-q' + i, a: n, fonte: fonte.id }, q)));
  m.atividades = m.atividades.filter((t) => t.fonte !== fonte.id)
    .concat((r.atividades || []).map((t, i) => ({ id: fonte.id + '-t' + i, n, fonte: fonte.id, tipo: t.tipo, titulo: t.titulo, enunciado: t.enunciado, perguntas: t.perguntas && t.perguntas.length ? t.perguntas : undefined, sozinho: t.sozinho, guia: t.guia })));
  m.questoes.sort((a, b) => a.a - b.a);
  m.atividades.sort((a, b) => a.n - b.n);

  const arq = m.arquivos.find((x) => x.id === fonte.id);
  if (arq) arq.nome = 'Aula ' + (n < 10 ? '0' : '') + n + ' — ' + r.titulo;
  fonte.status = 'gerada';
  delete fonte.erro;
  if (temCapitulos(m)) aplicarCapitulos(m);   /* a parte nova já entra no capítulo dela */
}

function integrarGeral(m, r, incremental) {
  const nums = new Set(m.aulas.map((a) => a.n));
  const usados = new Set();
  const blocos = [];
  (r.blocos || []).forEach((b) => {
    const aulas = (b.aulas || []).filter((n) => nums.has(n) && !usados.has(n));
    if (!aulas.length) return;
    aulas.forEach((n) => usados.add(n));
    blocos.push({ id: 'b' + (blocos.length + 1), nome: b.nome, resumo: b.resumo, faixa: faixa(aulas), _aulas: aulas });
  });
  const soltas = [...nums].filter((n) => !usados.has(n));
  if (soltas.length) {
    if (blocos.length) { const ult = blocos[blocos.length - 1]; ult._aulas = ult._aulas.concat(soltas); ult.faixa = faixa(ult._aulas); }
    else blocos.push({ id: 'b1', nome: 'Conteúdo', resumo: 'Todas as aulas', faixa: faixa(soltas), _aulas: soltas });
  }
  for (const a of m.aulas) {
    const b = blocos.find((x) => x._aulas.includes(a.n));
    a.bloco = b ? b.id : null;
  }
  m.blocos = blocos.map((b) => ({ id: b.id, nome: b.nome, faixa: b.faixa, resumo: b.resumo }));
  if (temCapitulos(m)) aplicarCapitulos(m);   /* livro com sumário: os capítulos valem mais que os blocos da IA */

  const geral = { n: 0, arco: String(r.mapaGeral.arco || 'A MATÉRIA INTEIRA').toUpperCase(), k: 'MAPA GERAL', nome: r.mapaGeral.nome || m.nome, ramos: r.mapaGeral.ramos };
  m.mapas = [geral].concat(m.mapas.filter((x) => x.n !== 0));

  const novas = (r.discursivas || []).filter((d) => d.enunciado && d.modelo);
  if (incremental) {
    let n = m.discursivas.reduce((x, d) => Math.max(x, d.n), 0);
    m.discursivas = m.discursivas.concat(novas.map((d) => ({ n: ++n, tema: d.tema, enunciado: d.enunciado, chaves: d.chaves, modelo: d.modelo })));
  } else {
    m.discursivas = novas.map((d, i) => ({ n: i + 1, tema: d.tema, enunciado: d.enunciado, chaves: d.chaves, modelo: d.modelo }));
  }
  m.formulas = (r.formulas || []).filter((g) => g.its && g.its.length);
  if (!m.textos) m.textos = {};
  m.textos.rodape = m.textos.rodape || ['Conteúdo gerado por IA (Claude) a partir dos slides enviados. Em caso de dúvida, vale o que está no slide da aula.'];
}

/* ── os passos da IA ── */
/* etapas de uma aula: resumo, mapa, questões, [asserção-razão, se esse tipo de prova usa], atividades, [conferência, se a IA é online] */
function etapasDaAula(pub, online) { return 4 + (pub.ar ? 1 : 0) + (online ? 1 : 0); }

/* uma aula: texto do material → resumo, mapa, questões, asserções, atividades e (online) conferência */
async function gerarAula(io, p, m, fonte, texto, aviso, signal) {
  const pub = io.publico(m), online = p.tipo === 'compativel';
  const T = etapasDaAula(pub, online);
  let k = 0;
  const outras = m.aulas.filter((a) => a.n !== fonte.aula).map((a) => 'Aula ' + a.n + ': ' + a.titulo).join('\n');
  const material = `Matéria: ${m.nome}${m.subtitulo ? ' (' + m.subtitulo + ')' : ''}. Aula ${fonte.aula}.\n` +
    (outras ? 'Outras aulas da matéria (não repita o conteúdo delas):\n' + outras + '\n' : '') +
    '=== MATERIAL DA AULA ===\n' + texto;
  const nq = io.questoesPorAula();
  /* andamento: “lendo o material…” até a IA começar a escrever; depois, quantas palavras já escreveu */
  const pede = (passo, total, rot, o) => {
    aviso(passo, total, rot, passo === 1 ? ' — lendo o material…' : '');
    let ult = 0;
    const aoAndar = (t) => { if (Date.now() - ult > 2000) { ult = Date.now(); aviso(passo, total, rot, ' — escrevendo… ' + t.split(/\s+/).length + ' palavras'); } };
    const aoEsperar = (seg) => aviso(passo, total, rot, ' — a IA grátis pediu uma pausa; continuo em ' + seg + ' s…');
    const vai = () => io.chamar(p, Object.assign({ material, signal, aoAndar, aoEsperar }, o));
    /* uma segunda chance quando a resposta vem incompleta ou a conexão cai */
    return vai().catch((e) => {
      if (signal.aborted || !(e instanceof SyntaxError || e.code === 'ECONNRESET')) throw e;
      aviso(passo, total, rot, ' — tentando de novo…');
      return vai();
    });
  };
  const aula = await pede(++k, T, 'resumo da aula', { nome: 'aula', esquema: L_AULA, maxTokens: 1800,
    tarefa: 'Escreva o resumo de estudo desta aula: "titulo" (até 10 palavras); "nucleo" (a ideia central em 1 frase); "ramos" (3 a 6 tópicos do material, cada um com "t" = título curto e "i" = 2 a 5 itens curtos); "prova" (4 a 8 termos que provavelmente caem na prova); "pegadinha" (o erro mais provável do aluno, em 1 ou 2 frases).' });
  const resumo = '\nResumo da aula já feito: ' + JSON.stringify({ titulo: aula.titulo, nucleo: aula.nucleo, topicos: (aula.ramos || []).map((r) => r.t) });
  const mapa = await pede(++k, T, 'mapa mental', { nome: 'mapa', esquema: L_MAPA, maxTokens: 1400,
    tarefa: 'Crie o MAPA MENTAL visual desta aula. "arco": 1 ou 2 palavras em MAIÚSCULAS que nomeiam o tema; "nome": o tema central em até 4 palavras; "ramos": 4 a 6 ramos, cada um com "t" (até 4 palavras) e "f" = 2 a 4 folhas, cada folha com "t" (até 5 palavras) e "d" (explicação de até 8 palavras). Frases curtas: a memória se apoia em forma, cor e posição.' + resumo });
  const quest = await pede(++k, T, nq + ' questões', { nome: 'questoes', esquema: L_QUEST(nq), maxTokens: 400 * nq + 400,
    tarefa: `Crie ${nq} questões de múltipla escolha sobre o material. Cada uma: "e" = enunciado; "o" = exatamente 5 alternativas, uma única correta, distratores plausíveis e do mesmo tamanho; "c" = índice da correta (0 a 4) — varie a posição entre as questões; "x" = justificativa curta da resposta certa, SEM citar letras ou posições. ${pub.questoes}` + resumo });
  const ar = !pub.ar ? { assercoes: [] } : await pede(++k, T, 'asserção-razão', { nome: 'assercoes', esquema: L_AR, maxTokens: 900,
    tarefa: 'Crie 2 questões de asserção-razão (formato ENADE) sobre o material. "i1" é a asserção e "i2" a razão (frases completas, sem a palavra PORQUE). "c" é a resposta nesta lista fixa: 0 = as duas verdadeiras e a II justifica a I; 1 = as duas verdadeiras, mas a II não justifica a I; 2 = só a I é verdadeira; 3 = só a II é verdadeira; 4 = as duas são falsas. Use respostas diferentes nas duas. "x" julga cada proposição, sem citar letras.' + resumo });
  const ativ = await pede(++k, T, 'atividades e fórmulas', { nome: 'atividades', esquema: L_ATIV, maxTokens: 1600,
    tarefa: 'Liste as atividades, exercícios e estudos de caso do material ("tipo": "caso", "sala" ou "aval"; "enunciado" fiel ao material). Se o material não tiver nenhuma, crie 1 prática curta do tipo "caso". "sozinho": como fazer estudando sozinho, em 1 frase. "guia": 3 a 6 passos curtos de resposta. "formulas": fórmulas, números, listas ou classificações para decorar ("k" = nome, "v" = fórmula ou lista, "n" = nota de 1 linha); lista vazia se não houver.' + resumo });
  /* 6ª etapa (só IA online, que é rápida): confere cada questão contra o material
     e descarta as de gabarito errado, ambíguas ou que contradizem o material */
  let mcs = quest.questoes || [], ars = ar.assercoes || [], descartadas = 0;
  if (online && mcs.length + ars.length) {
    const lista = mcs.map((q, i) => ({ id: i, tipo: 'múltipla escolha', enunciado: q.e, alternativas: q.o, gabarito: q.c }))
      .concat(ars.map((q, i) => ({ id: 100 + i, tipo: 'asserção-razão', I: q.i1, II: q.i2, gabarito: q.c })));
    try {
      const conf = await pede(++k, T, 'conferindo as questões', { nome: 'conferencia', esquema: L_CONF, maxTokens: 250 * lista.length + 400,
        tarefa: 'Você é o revisor. Confira cada questão abaixo contra o MATERIAL DA AULA. Para cada uma, responda "ok": true só se o gabarito (índice, começando em 0) estiver correto, houver UMA única resposta defensável e nada contradisser o material; senão false, com "motivo" curto. ' +
          'Nas de asserção-razão, o gabarito segue esta lista: 0 = as duas verdadeiras e a II justifica a I; 1 = as duas verdadeiras, mas a II não justifica a I; 2 = só a I é verdadeira; 3 = só a II é verdadeira; 4 = as duas são falsas. ' +
          'Responda uma verificação para cada "id".\nQUESTÕES: ' + JSON.stringify(lista) });
      const ruins = new Set((conf.verificacoes || []).filter((v) => v && v.ok === false).map((v) => v.id));
      const mcOk = mcs.filter((q, i) => !ruins.has(i)), arOk = ars.filter((q, i) => !ruins.has(100 + i));
      /* nunca deixa a aula sem questões: se o revisor reprovar quase tudo, desconfia do revisor */
      if (mcOk.length >= Math.ceil(mcs.length / 2)) { descartadas += mcs.length - mcOk.length; mcs = mcOk; }
      descartadas += ars.length - arOk.length; ars = arOk;
    } catch (e) { if (signal.aborted) throw e; /* conferência é um extra: se falhar, segue com as questões como estão */ }
  }
  return {
    titulo: aula.titulo, nucleo: aula.nucleo, ramos: aula.ramos, prova: aula.prova, pegadinha: aula.pegadinha, mapa, descartadas,
    questoes: mcs.map((q) => Object.assign({ f: 'slide', calc: false }, q)),
    assercoes: ars,
    atividades: (ativ.atividades || []).map((t) => Object.assign({ perguntas: [] }, t)),
    formulas: ativ.formulas || []
  };
}

/* visão geral: blocos, mapa geral, discursivas (as fórmulas vêm das aulas) */
async function gerarGeral(io, p, m, novas, signal, aviso) {
  const aulas = m.aulas.map((a) => 'Aula ' + a.n + ' — ' + a.titulo + ': ' + (a.nucleo || '') + ' Tópicos: ' + (a.ramos || []).map((r) => r.t).join('; ')).join('\n');
  const material = 'Matéria: ' + m.nome + '.\n=== RESUMO DAS AULAS ===\n' + aulas;
  const incremental = m.discursivas.length > 0;
  /* livro com sumário: os blocos são os capítulos dele, sem gastar uma chamada da IA */
  if (!temCapitulos(m)) aviso('blocos temáticos');
  const bl = temCapitulos(m) ? { blocos: [] } : await io.chamar(p, { material, signal, nome: 'blocos', esquema: L_BLOCOS, maxTokens: 1200,
    tarefa: 'Agrupe as aulas em 1 a 8 blocos temáticos, cada um com aulas consecutivas, na ordem. Toda aula entra em exatamente um bloco. "nome" com até 4 palavras; "resumo" com até 8 palavras dizendo o que o bloco resolve; "aulas" = números das aulas.' });
  aviso('mapa geral');
  const mg = await io.chamar(p, { material, signal, nome: 'mapa_geral', esquema: L_MAPA, maxTokens: 1400,
    tarefa: 'Crie o MAPA MENTAL da matéria inteira. "arco" = "A MATÉRIA INTEIRA"; "nome" = o nome da matéria; 4 a 6 ramos com os grandes temas, cada um com 2 a 4 folhas ("t" até 5 palavras, "d" até 8 palavras).' });
  const nd = incremental ? 2 : 5;
  aviso(nd + ' discursivas');
  const ds = await io.chamar(p, { material, signal, nome: 'discursivas', esquema: L_DISC(nd), maxTokens: 900 * nd + 400,
    tarefa: `Crie ${nd} questões discursivas ${incremental ? 'NOVAS sobre as aulas ' + novas.join(', ') : 'que cruzem aulas diferentes'}, ${io.publico(m).disc}. "tema": "Aula N · Assunto"; "enunciado"; "chaves": 3 a 6 pontos que o corretor procura; "modelo": resposta modelo em 2 ou 3 parágrafos curtos, separados por uma linha em branco.` });
  const formulas = io.formulasDasAulas(m);
  return { r: { blocos: bl.blocos, mapaGeral: mg, discursivas: ds.discursivas, formulas: formulas.length ? formulas : m.formulas }, incremental };
}

/* resumo de estudo: pedir(material, tarefa, esquema, maxTokens) é a IA; material grande vai por partes e é juntado */
async function resumirTexto(pedir, m, textoTodo, limite, aviso) {
  const pedacos = textoTodo.length > limite * 1.1 ? cortarEmPartes(textoTodo, limite) : [textoTodo];
  const parciais = [];
  for (let i = 0; i < pedacos.length; i++) {
    aviso(pedacos.length > 1 ? 'resumindo a parte ' + (i + 1) + ' de ' + pedacos.length + '…' : 'a IA está resumindo os pontos principais…');
    parciais.push(await pedir('Matéria: ' + m.nome + '.\n=== MATERIAL ===\n' + pedacos[i], PEDIDO_RESUMO, L_RESUMO, 6000));
  }
  if (parciais.length === 1) return parciais[0];
  aviso('juntando as partes do resumo…');
  const topicos = parciais.map((x) => ({ titulo: x.titulo, topicos: x.secoes.map((s) => s.titulo + ': ' + s.destaque) }));
  const fim = await pedir('Matéria: ' + m.nome + '.\n=== RESUMOS DAS PARTES ===\n' + JSON.stringify(topicos), 'Estes são os resumos das partes de um mesmo material. Dê o "titulo" do material inteiro, uma "introducao" de 1 ou 2 frases e os pontos que mais caem na prova ("lembrar").', L_RESUMO_FIM, 1500);
  const vistos = new Set();
  return { titulo: fim.titulo, introducao: fim.introducao, lembrar: fim.lembrar,
    secoes: [].concat(...parciais.map((x) => x.secoes)),
    conceitos: [].concat(...parciais.map((x) => x.conceitos || [])).filter((c) => { const k = c.termo.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; }) };
}

return { S, I, B, arr, obj, arrN, IDX, L_MAPA, L_AULA, L_QUEST, L_CONF, L_AR, L_ATIV, L_BLOCOS, L_DISC, L_RESUMO, L_RESUMO_FIM, PEDIDO_RESUMO,
  SISTEMA_LOCAL, LER_IMAGENS, podeLerImagens, lerJson, LIMITE_PADRAO, cortarEmPartes, paginasDoTrecho, CAPITULO, encurtar, capitulosDoSumario, aplicarCapitulos, temCapitulos,
  limparQuestoes, limparAssercoes, faixa, integrarAula, integrarGeral, etapasDaAula, gerarAula, gerarGeral, resumirTexto };
});
