// Cotação de frete no Melhor Envio (Cloudflare Pages Function em /api/frete).
// A chave fica só na variável secreta MELHOR_ENVIO_TOKEN do Cloudflare.
// Sempre cota com a caixa padrão (M). Pedido que precisa de mais caixas: preço de 1 caixa × quantidade.
const CAIXA = { length: 20, width: 16, height: 7 };   // cm, medida de fora
const SERVICOS = '1,2,3,4,17';                         // PAC, SEDEX, Jadlog .Package, Jadlog .Com, PAC Mini
const ORIGENS_OK = /^https:\/\/((www\.)?3dmaxrm\.com\.br|([a-z0-9-]+\.)?site-3dmaxrm\.pages\.dev)$/;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('origin') || '';
  if (origem && !ORIGENS_OK.test(origem)) return json({ erro: 'origem' }, 403);

  const token = env.MELHOR_ENVIO_TOKEN, de = String(env.ORIGEM_CEP || '').replace(/\D/g, '');
  if (!token || de.length !== 8) return json({ erro: 'nao_configurado' }, 503);

  let b; try { b = await request.json(); } catch { return json({ erro: 'dados' }, 400); }
  const cep = String(b.cep || '').replace(/\D/g, '');
  const caixas = Math.min(10, Math.max(1, Math.round(+b.caixas || 1)));
  const pesoKg = Math.min(30, Math.max(0.1, +b.pesoKg || 0.3));
  const valor = Math.min(20000, Math.max(0, +b.valor || 0)) / caixas;
  if (cep.length !== 8) return json({ erro: 'cep' }, 400);

  let r;
  try {
    r = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'User-Agent': '3D Max (biomodelos_3dmax@outlook.com)' },
      body: JSON.stringify({ from: { postal_code: de }, to: { postal_code: cep }, package: { ...CAIXA, weight: +pesoKg.toFixed(3) }, options: { insurance_value: +valor.toFixed(2), receipt: false, own_hand: false }, services: SERVICOS }),
    });
  } catch { return json({ erro: 'rede' }, 502); }
  if (!r.ok) return json({ erro: 'melhor_envio', status: r.status }, 502);

  const lista = await r.json().catch(() => []);
  const opcoes = (Array.isArray(lista) ? lista : [])
    .filter(s => !s.error && (s.custom_price || s.price))
    .map(s => ({
      nome: `${s.name} (${(s.company && s.company.name) || ''})`.replace(' ()', ''),
      preco: Math.round(parseFloat(s.custom_price || s.price) * caixas * 100) / 100,
      prazo: +(s.custom_delivery_time || s.delivery_time) || null,
    }))
    .sort((a, c) => a.preco - c.preco)
    .slice(0, 4);
  if (!opcoes.length) return json({ erro: 'sem_opcoes' }, 404);
  return json({ caixas, opcoes });
}

export async function onRequest() { return json({ erro: 'método' }, 405); }
