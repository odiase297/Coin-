/* VertexTrade — full-featured client-side trading demo
   - CoinGecko used for crypto prices (no API key)
   - Stocks simulated (can add API later)
   - Sparklines drawn in SVG
   - PWA (manifest + service worker) supported
   - CSV export for orders
   - Data stored in localStorage (vertex_state_v3)
*/

const STORAGE_KEY = 'vertex_state_v3';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// default universe (crypto tickers + some stocks)
const DEFAULT_SYMBOLS = [
  { symbol:'bitcoin', display:'BTC', name:'Bitcoin', type:'crypto', coingeckoId:'bitcoin' },
  { symbol:'ethereum', display:'ETH', name:'Ethereum', type:'crypto', coingeckoId:'ethereum' },
  { symbol:'aapl', display:'AAPL', name:'Apple', type:'stock' },
  { symbol:'tsla', display:'TSLA', name:'Tesla', type:'stock' }
];

// helpers
const $ = id => document.getElementById(id);
const el = (t,c)=>{ const e=document.createElement(t); if(c) e.className=c; return e; };
const fmt = n => Number(n).toLocaleString('en-US', {style:'currency',currency:'USD',maximumFractionDigits:2});
const now = ()=> new Date().toLocaleString();

function defaultState(){
  return {
    user: { username:'user', name:'Trader', cash: 1000000 },
    positions: {}, // symbol -> { sizeUsd, avgPrice }
    orders: [],    // {id,time,symbol,type,amount,price,status}
    market: DEFAULT_SYMBOLS.slice(),
    settings: { theme: 'light' }
  };
}

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw){ const s = defaultState(); saveState(s); return s; }
    return JSON.parse(raw);
  } catch(e){
    const s = defaultState(); saveState(s); return s;
  }
}
function saveState(s){ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

// -------------- market / coingecko --------------
async function fetchCryptoPrices(ids){
  // ids: array of coingecko ids
  try {
    const url = `${COINGECKO_API}/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('CG failed');
    const data = await res.json();
    return data; // e.g. { bitcoin: { usd: 56000 }, ... }
  } catch(e) {
    return null;
  }
}

async function fetchCoinHistory(id, days=1){
  // small sparkline data: market_chart endpoint (prices)
  try {
    const url = `${COINGECKO_API}/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=hourly`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('chart fail');
    const j = await res.json();
    // j.prices = [[ts,price],...]
    return j.prices.map(p => p[1]);
  } catch(e){
    return null;
  }
}

// update market state: attempt to fetch crypto prices; simulate others
async function updateMarketData(){
  const st = loadState();
  const crypto = st.market.filter(m => m.type==='crypto' && m.coingeckoId).map(m=>m.coingeckoId);
  let prices = null;
  if(crypto.length){
    prices = await fetchCryptoPrices(crypto);
  }
  // apply prices
  st.market = st.market.map(m => {
    const copy = Object.assign({}, m);
    if(m.type === 'crypto' && m.coingeckoId && prices && prices[m.coingeckoId] && prices[m.coingeckoId].usd){
      copy.price = +prices[m.coingeckoId].usd;
    } else {
      // simulated price evolution
      const prev = (m.price || (m.type==='crypto' ? 50000 : 100));
      const change = (Math.random()-0.5)*(prev*0.01);
      copy.price = Math.max(0.01, +(prev + change).toFixed(2));
    }
    return copy;
  });
  saveState(st);
  renderMarket();
  renderPortfolio();
}

// -------------- UI render --------------
function renderMarket(){
  const s = loadState();
  const list = document.querySelector('#market-list');
  list.innerHTML = '';
  s.market.forEach(async m => {
    const row = el('div','market-row');
    // left: symbol + sparkline
    const left = el('div','market-left');
    const sym = el('div','market-symbol'); sym.textContent = m.display;
    const name = el('div','muted'); name.textContent = m.name;
    const spark = el('div','spark');
    // generate sparkline: fetch history for crypto, else simulated array
    const sparkSvg = await makeSparkline(m);
    spark.innerHTML = sparkSvg;
    left.appendChild(sym); left.appendChild(name);
    row.appendChild(left);
    // right: price & change placeholder
    const right = el('div');
    const price = el('div','market-price'); price.textContent = fmt(m.price || 0);
    const change = el('div','market-change muted');
    // small random change indicator (visual only)
    const changeVal = ((Math.random()-0.48)*2).toFixed(2);
    change.textContent = (changeVal>0?'+':'') + changeVal + '%';
    change.className = 'market-change ' + (parseFloat(changeVal)>=0 ? 'pos' : 'neg');
    right.appendChild(price);
    right.appendChild(change);
    // append spark under price for compact layout
    row.appendChild(right);
    // insert sparkline as a small element on the left side
    left.appendChild(spark);
    row.addEventListener('click', ()=> openQuickBuy(m.symbol));
    list.appendChild(row);
  });
}

// generate sparkline SVG string
async function makeSparkline(m){
  let points = [];
  if(m.type==='crypto' && m.coingeckoId){
    const hist = await fetchCoinHistory(m.coingeckoId, 1).catch(()=>null);
    if(hist && hist.length) points = hist;
  }
  if(!points.length){
    // fallback: synthesize small series around price
    const base = m.price || 100;
    for(let i=0;i<16;i++){
      points.push(+(base + (Math.random()-0.5)*(base*0.02)).toFixed(2));
    }
  }
  // normalize to SVG polyline
  const w = 90, h = 28, pad = 2;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const stepX = (w - pad*2) / (points.length-1);
  const coords = points.map((p,i)=> {
    const x = pad + i*stepX;
    const y = pad + (1 - (p - min)/range) * (h - pad*2);
    return `${x},${y}`;
  }).join(' ');
  const color = points[points.length-1] >= points[0] ? '#16a34a' : '#dc2626';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><polyline points="${coords}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderPortfolio(){
  const s = loadState();
  $('cash').textContent = fmt(s.user.cash);
  const positionsDiv = $('positions-list'); positionsDiv.innerHTML = '';
  let total = s.user.cash;
  const marketMap = Object.fromEntries(s.market.map(m=>[m.symbol,m]));
  Object.keys(s.positions).forEach(sym=>{
    const pos = s.positions[sym];
    const market = marketMap[sym] || { price: pos.avgPrice || 0 };
    const sharesApprox = pos.sizeUsd / pos.avgPrice;
    const marketValue = +(sharesApprox * market.price);
    total += marketValue;
    const p = el('div','position');
    p.innerHTML = `<div><strong>${sym}</strong><div class="muted">Avg ${fmt(pos.avgPrice)} • USD ${fmt(pos.sizeUsd)}</div></div><div>${fmt(marketValue)}</div>`;
    positionsDiv.appendChild(p);
  });
  $('total-value').textContent = fmt(total);

  // orders
  const ordersList = $('orders-list'); ordersList.innerHTML = '';
  if(!s.orders.length) ordersList.textContent = 'No orders yet';
  else s.orders.slice().reverse().forEach(o=>{
    const r = el('div','order-row');
    r.innerHTML = `<div><strong>${o.type.toUpperCase()}</strong> ${o.symbol}<div class="muted">${o.time}</div></div><div><div>${fmt(o.amount)}</div><div class="muted">${o.status}</div></div>`;
    ordersList.appendChild(r);
  });
}

// -------------- trading flows --------------
function openQuickBuy(symbol){
  populateBuySymbols();
  $('buy-amount').value = 1000;
  $('buy-symbol').value = symbol;
  openModal('modal-buy');
}
function populateBuySymbols(){
  const sel = $('buy-symbol'); sel.innerHTML = '';
  const s = loadState();
  s.market.forEach(m => sel.appendChild(new Option(`${m.display} — ${m.name}`, m.symbol)));
}
function confirmBuy(){
  const sym = $('buy-symbol').value;
  const amt = Math.max(0, parseFloat($('buy-amount').value)||0);
  if(!sym || amt <= 0) { alert('Enter a valid amount'); return; }
  const s = loadState();
  const market = s.market.find(x=>x.symbol===sym) || { price: (s.positions[sym] && s.positions[sym].avgPrice) || 0 };
  if(amt > s.user.cash){
    s.orders.push({ id:id(), time:now(), symbol:sym, type:'buy', amount:amt, price:market.price, status:'declined' });
    saveState(s); renderPortfolio(); closeModal('modal-buy'); alert('Declined: insufficient cash'); return;
  }
  let status = 'successful';
  if(amt >= 100000) status = 'pending';
  s.user.cash = +(s.user.cash - amt);
  if(!s.positions[sym]) s.positions[sym] = { sizeUsd:0, avgPrice: market.price };
  const pos = s.positions[sym];
  const totalUsd = pos.sizeUsd + amt;
  pos.avgPrice = totalUsd ? ((pos.avgPrice * pos.sizeUsd) + (market.price * (amt/market.price) * market.price)) / totalUsd : market.price;
  pos.sizeUsd = +(pos.sizeUsd + amt);
  s.orders.push({ id:id(), time:now(), symbol:sym, type:'buy', amount:amt, price:market.price, status });
  saveState(s); renderPortfolio(); closeModal('modal-buy');
  if(status==='pending') alert('Order submitted. Dear customer, we are reviewing the transaction and will get back to you.');
  else alert('Order executed.');
}

function openSell(){
  const sel = $('sell-position'); sel.innerHTML = '';
  const s = loadState();
  Object.keys(s.positions).forEach(sym => sel.appendChild(new Option(sym, sym)));
  $('sell-amount').value = 1000;
  openModal('modal-sell');
}
function confirmSell(){
  const sym = $('sell-position').value;
  const amt = Math.max(0, parseFloat($('sell-amount').value)||0);
  if(!sym || amt <= 0){ alert('Enter valid amount'); return; }
  const s = loadState();
  const pos = s.positions[sym];
  if(!pos || amt > pos.sizeUsd){ alert('Not enough position'); return; }
  const market = s.market.find(x=>x.symbol===sym);
  s.user.cash = +(s.user.cash + amt);
  pos.sizeUsd = +(pos.sizeUsd - amt);
  if(pos.sizeUsd <= 0.01) delete s.positions[sym];
  s.orders.push({ id:id(), time:now(), symbol:sym, type:'sell', amount:amt, price: market.price, status:'successful' });
  saveState(s); renderPortfolio(); closeModal('modal-sell'); alert('Sell executed.');
}

// -------------- CSV export --------------
function exportCSV(){
  const s = loadState();
  const rows = [['id','time','symbol','type','amount','price','status']];
  s.orders.forEach(o => rows.push([o.id, `"${o.time}"`, o.symbol, o.type, o.amount, o.price, o.status]));
  const csv = rows.map(r => r.join(',')).join('\\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'vertex_orders.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// -------------- helpers & UI wiring --------------
function id(){ return Math.random().toString(36).slice(2,9); }
function openModal(id){ $(id).classList.remove('hidden'); }
function closeModal(id){ $(id).classList.add('hidden'); }

function applyTheme(t){ if(t==='dark') document.body.classList.add('dark'); else document.body.classList.remove('dark'); }

// market tick + periodic updates: fetch crypto prices then render
async function tickAndRender(){
  await updateMarketData();
}

// init UI & bindings
function initUI(){
  // auth
  $('btn-login').addEventListener('click', ()=> {
    const u = $('login-user').value.trim() || 'user';
    const p = $('login-pass').value || 'pass';
    const st = loadState();
    st.user.username = u; saveState(st);
    $('auth').classList.add('hidden'); $('app').classList.remove('hidden');
    renderMarket(); renderPortfolio();
  });

  // buttons
  $('btn-buy').addEventListener('click', ()=> { populateBuySymbols(); openModal('modal-buy'); });
  $('btn-sell').addEventListener('click', ()=> openSell());
  $('btn-orders').addEventListener('click', ()=> $('orders-list').scrollIntoView({behavior:'smooth'}));
  $('btn-theme').addEventListener('click', ()=> {
    document.body.classList.toggle('dark');
    const s = loadState(); s.settings = s.settings || {}; s.settings.theme = document.body.classList.contains('dark') ? 'dark':'light'; saveState(s);
  });
  $('btn-settings').addEventListener('click', ()=> {
    const s = loadState(); $('profile-name').value = s.user.name || ''; $('profile-theme').value = s.settings ? s.settings.theme:'light'; openModal('modal-settings');
  });
  $('btn-logout').addEventListener('click', ()=> location.reload());
  $('confirm-buy').addEventListener('click', confirmBuy);
  $('confirm-sell').addEventListener('click', confirmSell);
  $('save-settings').addEventListener('click', ()=> {
    const s = loadState(); s.user.name = $('profile-name').value.trim() || s.user.name; s.settings = s.settings || {}; s.settings.theme = $('profile-theme').value || 'light'; saveState(s); applyTheme(s.settings.theme); closeModal('modal-settings'); renderPortfolio();
  });
  $('btn-export').addEventListener('click', exportCSV);

  // click backdrop to close
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if(e.target === m) closeModal(m.id); }));

  // initial
  const st = loadState(); applyTheme(st.settings.theme||'light'); renderMarket(); renderPortfolio();
  // tick market every 3s
  setInterval(tickAndRender, 3000);
  // first fetch attempt
  tickAndRender();
}

// DOM ready
document.addEventListener('DOMContentLoaded', initUI);

// expose some functions for onclick in HTML (fallback)
window.openQuickBuy = openQuickBuy;
window.closeModal = closeModal;
window.confirmBuy = confirmBuy;
window.openSell = openSell;
window.confirmSell = confirmSell;
window.exportCSV = exportCSV;
