// VertexTrade — simulated trading dashboard
// Data persisted to localStorage (KEY: vertex_state_v3)

const STORAGE_KEY = 'vertex_state_v3';
const API_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';

const SYMBOLS = [
  {symbol:'BTC', name:'Bitcoin', price:56000, history:[]},
  {symbol:'ETH', name:'Ethereum', price:3400, history:[]},
  {symbol:'AAPL', name:'Apple', price:175, history:[]},
  {symbol:'TSLA', name:'Tesla', price:720, history:[]}
];

const $ = id => document.getElementById(id);
const el = (t,c)=>{const e=document.createElement(t);if(c) e.className=c;return e;};
const fmt = n => Number(n).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
const now = ()=> new Date().toLocaleString();

function defaultState(){
  return {
    user:{username:'user',name:'Trader',cash:1000000},
    positions:{},
    orders:[],
    market: SYMBOLS.map(s=>({...s})),
    settings:{theme:'light'}
  };
}
function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw){const s=defaultState();saveState(s);return s;}
    return JSON.parse(raw);
  }catch(e){const s=defaultState();saveState(s);return s;}
}
function saveState(s){localStorage.setItem(STORAGE_KEY,JSON.stringify(s));}

// ===== AUTH =====
function initAuth(){
  $('btn-login').addEventListener('click',()=>{
    const u=$('login-user').value.trim()||'user';
    const s=loadState();
    s.user.username=u;
    saveState(s);
    showApp();
  });
}
function showApp(){
  $('auth').classList.add('hidden');
  $('app').classList.remove('hidden');
  renderAll();
}

// ===== MARKET =====
async function updateFromAPI(){
  try{
    const r=await fetch(API_URL);
    if(!r.ok) throw new Error('API failed');
    const j=await r.json();
    const s=loadState();
    s.market.forEach(m=>{
      if(m.symbol==='BTC') m.price=j.bitcoin.usd;
      if(m.symbol==='ETH') m.price=j.ethereum.usd;
      // push price into history (max 30 points)
      m.history.push(m.price);
      if(m.history.length>30) m.history.shift();
    });
    saveState(s); renderMarket(); renderPortfolio();
  }catch(e){ tickMarket(); }
}
function tickMarket(){
  const s=loadState();
  s.market.forEach(m=>{
    const change=(Math.random()-0.5)*(m.price*0.003);
    m.price=Math.max(0.01,+(m.price+change).toFixed(2));
    m.history.push(m.price);
    if(m.history.length>30) m.history.shift();
  });
  saveState(s);
  renderMarket(); renderPortfolio();
}

// ===== RENDER =====
function renderMarket(){
  const s=loadState();
  const list=$('market-list');
  list.innerHTML='';
  s.market.forEach(m=>{
    const row=el('div','market-row');
    const canvas=el('canvas'); canvas.width=80; canvas.height=30;
    drawSparkline(canvas,m.history);
    row.innerHTML=`<div><div class="market-symbol">${m.symbol}</div><div class="muted">${m.name}</div></div><div><div>${fmt(m.price)}</div></div>`;
    row.appendChild(canvas);
    row.addEventListener('click',()=>openQuickBuy(m.symbol));
    list.appendChild(row);
  });
}
function drawSparkline(canvas,history){
  if(!canvas.getContext) return;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!history||history.length<2) return;
  const min=Math.min(...history), max=Math.max(...history);
  ctx.beginPath();
  history.forEach((v,i)=>{
    const x=(i/(history.length-1))*canvas.width;
    const y=canvas.height-((v-min)/(max-min||1))*canvas.height;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle="#0ea5e9"; ctx.lineWidth=2; ctx.stroke();
}

function renderPortfolio(){
  const s=loadState();
  $('cash').textContent=fmt(s.user.cash);
  const positionsDiv=$('positions-list'); positionsDiv.innerHTML='';
  let total=s.user.cash;
  const marketMap=Object.fromEntries(s.market.map(m=>[m.symbol,m]));
  Object.keys(s.positions).forEach(sym=>{
    const pos=s.positions[sym];
    const market=marketMap[sym]||{price:pos.avgPrice||0};
    const sharesApprox=pos.sizeUsd/pos.avgPrice;
    const marketValue=+(sharesApprox*market.price);
    total+=marketValue;
    const p=el('div','position');
    p.innerHTML=`<div><strong>${sym}</strong><div class="muted">Avg ${fmt(pos.avgPrice)} • USD ${fmt(pos.sizeUsd)}</div></div><div>${fmt(marketValue)}</div>`;
    positionsDiv.appendChild(p);
  });
  $('total-value').textContent=fmt(total);

  const ordersList=$('orders-list'); ordersList.innerHTML='';
  if(!s.orders.length) ordersList.textContent='No orders yet';
  else s.orders.slice().reverse().forEach(o=>{
    const r=el('div','order-row');
    r.innerHTML=`<div><strong>${o.type.toUpperCase()}</strong> ${o.symbol}<div class="muted">${o.time}</div></div><div><div>${fmt(o.amount)}</div><div class="muted">${o.status}</div></div>`;
    ordersList.appendChild(r);
  });
}

// ===== BUY / SELL =====
function openQuickBuy(symbol){populateBuySymbols();$('buy-amount').value=1000;$('buy-symbol').value=symbol;openModal('modal-buy');}
function populateBuySymbols(){const sel=$('buy-symbol');sel.innerHTML='';loadState().market.forEach(m=>sel.appendChild(new Option(`${m.symbol} — ${m.name}`,m.symbol)));}
function confirmBuy(){
  const sym=$('buy-symbol').value;
  const amt=Math.max(0,parseFloat($('buy-amount').value)||0);
  if(!sym||amt<=0){alert('Enter valid amount');return;}
  const s=loadState();const m=s.market.find(x=>x.symbol===sym);
  if(amt>s.user.cash){s.orders.push({id:id(),time:now(),symbol:sym,type:'buy',amount:amt,price:m.price,status:'declined'});saveState(s);renderPortfolio();closeModal('modal-buy');alert('Declined: insufficient cash');return;}
  let status='successful';if(amt>=100000)status='pending';
  s.user.cash=+(s.user.cash-amt);
  if(!s.positions[sym])s.positions[sym]={sizeUsd:0,avgPrice:m.price};
  const pos=s.positions[sym];pos.sizeUsd+=amt;pos.avgPrice=m.price;
  s.orders.push({id:id(),time:now(),symbol:sym,type:'buy',amount:amt,price:m.price,status});
  saveState(s);renderPortfolio();closeModal('modal-buy');alert(status==='pending'?'Order pending review':'Order executed');
}
function openSell(){const sel=$('sell-position');sel.innerHTML='';const s=loadState();Object.keys(s.positions).forEach(sym=>sel.appendChild(new Option(sym,sym)));$('sell-amount').value=1000;openModal('modal-sell');}
function confirmSell(){
  const sym=$('sell-position').value;
  const amt=Math.max(0,parseFloat($('sell-amount').value)||0);
  if(!sym||amt<=0){alert('Enter valid amount');return;}
  const s=loadState();const pos=s.positions[sym];
  if(!pos||amt>pos.sizeUsd){alert('Not enough position');return;}
  const m=s.market.find(x=>x.symbol===sym);
  s.user.cash=+(s.user.cash+amt);
  pos.sizeUsd=+(pos.sizeUsd-amt);
  if(pos.sizeUsd<=0.01) delete s.positions[sym];
  s.orders.push({id:id(),time:now(),symbol:sym,type:'sell',amount:amt,price:m.price,status:'successful'});
  saveState(s);renderPortfolio();closeModal('modal-sell');alert('Sell executed');
}

// ===== SETTINGS =====
function saveSettings(){
  const s=loadState();
  s.user.name=$('profile-name').value.trim()||s.user.name;
  s.settings=s.settings||{};s.settings.theme=$('profile-theme').value||'light';
  saveState(s);applyTheme(s.settings.theme);closeModal('modal-settings');renderPortfolio();
}
function applyTheme(t){if(t==='dark')document.body.classList.add('dark');else document.body.classList.remove('dark');}
function logout(){location.reload();}

// ===== ORDERS EXPORT =====
function exportCSV(){
  const s=loadState();
  let csv="id,time,symbol,type,amount,price,status\n";
  s.orders.forEach(o=>{
    csv+=`${o.id},${o.time},${o.symbol},${o.type},${o.amount},${o.price},${o.status}\n`;
  });
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='orders.csv';a.click();URL.revokeObjectURL(url);
}

// ===== MODALS =====
function openModal(id){$(id).classList.remove('hidden');}
function closeModal(id){$(id).classList.add('hidden');}

// ===== UTILS =====
function id(){return Math.random().toString(36).slice(2,9);}

// ===== INIT =====
function initUI(){
  initAuth();
  $('btn-buy').addEventListener('click',()=>{populateBuySymbols();openModal('modal-buy');});
  $('btn-sell').addEventListener('click',()=>openSell());
  $('btn-orders').addEventListener('click',()=>$('orders-list').scrollIntoView({behavior:'smooth'}));
  $('btn-theme').addEventListener('click',()=>{document.body.classList.toggle('dark');const s=loadState();s.settings.theme=document.body.classList.contains('dark')?'dark':'light';saveState(s);});
  $('btn-settings').addEventListener('click',()=>{const s=loadState();$('profile-name').value=s.user.name||'';$('profile-theme').value=s.settings?s.settings.theme:'light';openModal('modal-settings');});
  $('btn-logout').addEventListener('click',()=>logout());
  $('confirm-buy').addEventListener('click',confirmBuy);
  $('confirm-sell').addEventListener('click',confirmSell);
  $('save-settings').addEventListener('click',saveSettings);

  // Modal background click
  document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);}));  
  // ✅ Fix: ghost buttons (Close) now close modal
  document.querySelectorAll('.modal .ghost').forEach(btn=>{
    btn.addEventListener('click',e=>{
      const modal=e.target.closest('.modal');
      if(modal) closeModal(modal.id);
    });
  });

  // CSV export (long-press orders button on mobile)
  $('btn-orders').addEventListener('contextmenu',e=>{e.preventDefault();exportCSV();});

  const s=loadState();applyTheme(s.settings.theme||'light');
  renderAll();
  // update prices every 10s
  updateFromAPI();setInterval(updateFromAPI,10000);
}

document.addEventListener('DOMContentLoaded',initUI);
