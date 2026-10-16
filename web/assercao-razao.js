/* Questões de asserção-razão (formato ENADE / provas FAMETRO): duas
   proposições — I (asserção) PORQUE II (razão) — e as cinco opções padrão,
   sempre nesta ordem (a tela NÃO embaralha quando t === 'ar').
   Usado pelo gerador (IA) e pelos arquivos de conteúdo em ../conteudo. */
'use strict';

const OPCOES = [
  'As asserções I e II são proposições verdadeiras, e a II é uma justificativa correta da I.',
  'As asserções I e II são proposições verdadeiras, mas a II não é uma justificativa correta da I.',
  'A asserção I é uma proposição verdadeira, e a II é uma proposição falsa.',
  'A asserção I é uma proposição falsa, e a II é uma proposição verdadeira.',
  'As asserções I e II são proposições falsas.'
];
const ENUNCIADO = 'Avalie as asserções a seguir e a relação proposta entre elas.';

/* chaves legíveis para escrever conteúdo sem decorar índices */
const V_JUSTIFICA = 0, V_NAO_JUSTIFICA = 1, SO_I = 2, SO_II = 3, AMBAS_FALSAS = 4;

const AR = (a, i1, i2, c, x, f) => ({ a, t: 'ar', f: f || 'slide', e: ENUNCIADO, i1, i2, o: OPCOES.slice(), c, x });

/* Níveis do simulado: 1 = conceitos (objetivas), 2 = asserção-razão,
   3 = na prática (cenários: o que fazer, que técnica usar). Sem o campo,
   vale 2 para asserção-razão e 1 para as demais. */
const nivelDe = (q) => q.nivel || (q.t === 'ar' ? 2 : 1);
const comNivel = (n, q) => Object.assign(q, { nivel: n });

const EXPORTA = { OPCOES, ENUNCIADO, AR, V_JUSTIFICA, V_NAO_JUSTIFICA, SO_I, SO_II, AMBAS_FALSAS, nivelDe, comNivel };
/* no PC (Node) e no tablet (navegador, web/gerador-web.js) */
if (typeof module === 'object' && module.exports) module.exports = EXPORTA;
else self.AssercaoRazao = EXPORTA;
