/* RINS Hub — self-hosted version (GitHub Pages + Supabase).
   Stock is never typed in directly: it is calculated from the movement log. */
(() => {
const ICONS = {
  overview:'<path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/>',
  inventory:'<path d="M21 8 12 3 3 8v8l9 5 9-5zM12 5.3 18.6 9 12 12.7 5.4 9zM5 10.7l6 3.4v6.2l-6-3.4zm8 9.6v-6.2l6-3.4v6.2z"/>',
  sales:'<path d="M3 17l6-6 4 4 8-8v4h2V3h-8v2h4l-6 6-4-4-8 8z"/><path d="M3 21h18v-2H3z"/>',
  locations:'<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>',
  products:'<path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM10 5h4v2h-4z"/>',
  documents:'<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7zm1 7h-4V5h4zm-8 6h8v2H7zm0-4h10v2H7z"/>',
  calendar:'<path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm13 8H4v10h16zM4 10h16V6H4z"/>',
  analysis:'<path d="M4 18h16v2H4zm2-4h2v4H6zm4-6h2v10h-2zm4 3h2v7h-2zm4-8h2v15h-2z"/>',
  links:'<path d="M10.6 13.4a1 1 0 0 0 1.4 0l4-4a3 3 0 1 0-4.2-4.2l-1.5 1.5 1.4 1.4 1.5-1.5a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 0 0 1.4zm2.8-2.8a1 1 0 0 0-1.4 0l-4 4a3 3 0 1 0 4.2 4.2l1.5-1.5-1.4-1.4-1.5 1.5a1 1 0 1 1-1.4-1.4l4-4a1 1 0 0 0 0-1.4z"/>',
  assistant:'<path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2zM19 15l1 2.5 2.5 1-2.5 1L19 22l-1-2.5-2.5-1 2.5-1z"/>'
};
const TABS=[['overview','Overview'],['inventory','Inventory'],['sales','Sales'],['locations','Locations'],['products','Products'],['documents','Documents'],['calendar','Calendar'],['analysis','Analysis'],['links','Links'],['assistant','Assistant']];
const TYPE_LABEL={in:'Stock in',transfer:'Transfer',sale:'Sale',return:'Return',adjust:'Adjustment'};
const LOC_TYPES={warehouse:'Warehouse',retail:'Retail store',online:'Online',b2b:'B2B client'};
const DEFAULT_PRODUCTS=[
  {id:'pocket-bidet-blue-4',name:'Pocket Bidet Blue',sku:'PB-BLUE-4',line:'Pocket Bidet',price:1.99,reorderAt:10,unit:'Pack of 4 caps',barcode:'PB-BLUE-4'},
  {id:'pocket-bidet-black-4',name:'Pocket Bidet Black',sku:'PB-BLACK-4',line:'Pocket Bidet',price:1.99,reorderAt:10,unit:'Pack of 4 caps',barcode:'PB-BLACK-4'}
];
const DEFAULT_DOCS=[
  {id:'doc-blue-barcode',productId:'pocket-bidet-blue-4',title:'Barcode',reference:'PB-BLUE-4',notes:'Retail barcode label for the blue pack.'},
  {id:'doc-blue-quotation',productId:'pocket-bidet-blue-4',title:'Import quotation',reference:'IQ-Blue-01',notes:'Supplier import quotation / commercial invoice reference.'},
  {id:'doc-black-barcode',productId:'pocket-bidet-black-4',title:'Barcode',reference:'PB-BLACK-4',notes:'Retail barcode label for the black pack.'},
  {id:'doc-black-quotation',productId:'pocket-bidet-black-4',title:'Import quotation',reference:'IQ-Black-01',notes:'Supplier import quotation / commercial invoice reference.'}
];
function readLocalJSON(key, fallback){
  try{const raw=localStorage.getItem(key); return raw?JSON.parse(raw):fallback;}catch(_){return fallback;}
}
function saveLocalJSON(key, value){
  try{localStorage.setItem(key, JSON.stringify(value));}catch(_){}}
const S={tab:'overview',products:DEFAULT_PRODUCTS,locations:[],movements:[],links:[],documents:readLocalJSON('rins.documents', DEFAULT_DOCS),chat:[],armed:null,loaded:false,user:null};
try{const h=(location.hash||'').slice(1);if(TABS.some(t=>t[0]===h))S.tab=h;else{const t=localStorage.getItem('rins.tab');if(t&&TABS.some(x=>x[0]===t))S.tab=t}}catch(e){}

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bhd=n=>(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});
const int=n=>(Number(n)||0).toLocaleString('en-US');
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const month=()=>today().slice(0,7);
const byName=a=>[...a].sort((x,y)=>String(x.name||'').localeCompare(String(y.name||'')));
const P=id=>S.products.find(p=>p.id===id);
const L=id=>S.locations.find(l=>l.id===id);
const icon=k=>`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[k]}</svg>`;
function toast(t,err){const el=$('#toast');el.textContent=t;el.className='toast'+(err?' err':'');el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2800)}

/* ---------------- connection ---------------- */
const cfg=window.RINS_CONFIG||{};
const configured=!!(cfg.SUPABASE_URL&&cfg.SUPABASE_KEY&&!/YOUR-/.test(cfg.SUPABASE_URL+cfg.SUPABASE_KEY));
const sb=configured&&window.supabase?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY):null;

/* Database rows use snake_case; the page uses the same shape as before. */
const FROM_DB={
  products:r=>({id:r.id,name:r.name,sku:r.sku||'',line:r.line||'',price:r.price===null?null:Number(r.price),reorderAt:r.reorder_at,unit:r.unit||'',createdAt:Date.parse(r.created_at)||0}),
  locations:r=>({id:r.id,name:r.name,type:r.type,stand:!!r.stand,note:r.note||'',createdAt:Date.parse(r.created_at)||0}),
  movements:r=>({id:r.id,type:r.type,date:r.date,product:r.product_id,from:r.from_loc,to:r.to_loc,qty:r.qty,price:r.price===null?null:Number(r.price),note:r.note||'',createdAt:Date.parse(r.created_at)||0}),
  links:r=>({id:r.id,title:r.title,url:r.url,category:r.category||'Other',pinned:!!r.pinned,createdAt:Date.parse(r.created_at)||0})
};
async function fetchAll(table){
  const out=[];const step=1000;
  for(let i=0;;i+=step){
    const {data,error}=await sb.from(table).select('*').order('created_at').range(i,i+step-1);
    if(error)throw error;out.push(...data);if(data.length<step)break;
  }
  return out.map(FROM_DB[table]);
}
async function loadAll(){
  try{
    const [products,locations,movements,links]=await Promise.all(['products','locations','movements','links'].map(fetchAll));
    const seededProducts=products.length?products:DEFAULT_PRODUCTS.map(p=>({...p,price:Number(p.price ?? 1.99)}));
    const seededDocs=readLocalJSON('rins.documents', DEFAULT_DOCS);
    Object.assign(S,{products:seededProducts,locations,movements,links,documents:seededDocs,loaded:true});
    render();
  }catch(err){toast('Could not load your data: '+(err.message||'check your connection'),1)}
}
async function write(op){const {error}=await op;if(error)throw new Error(friendly(error));await loadAll()}
function friendly(e){
  const m=e.message||'';
  if(e.code==='23503'||/foreign key/i.test(m))return 'This is used in the stock log. Delete those entries first.';
  if(e.code==='42501'||/row-level security/i.test(m))return 'Your account is not allowed to change this data.';
  if(/check constraint/i.test(m))return 'Some values are not valid. Check the quantity and type.';
  return m||'Could not save. Try again.';
}

/* ---------------- stock math ---------------- */
function stockMap(){
  const m={};const add=(p,l,q)=>{if(!p||!l)return;m[p]??={};m[p][l]=(m[p][l]||0)+q};
  for(const v of S.movements){const q=Number(v.qty)||0;
    if(v.type==='in')add(v.product,v.to,q);
    else if(v.type==='transfer'||v.type==='return'){add(v.product,v.from,-q);add(v.product,v.to,q)}
    else if(v.type==='sale')add(v.product,v.from,-q);
    else if(v.type==='adjust')add(v.product,v.from,q);}
  return m;
}
const sales=()=>S.movements.filter(v=>v.type==='sale');
const saleValue=v=>(Number(v.qty)||0)*(Number(v.price)||0);

/* ---------------- gate: setup / sign in ---------------- */
function showGate(html){$('#app').hidden=true;$('#gate').hidden=false;$('#gateBody').innerHTML=html}
function gateSetup(){showGate(`<div class="grid" style="gap:12px"><h1>Almost ready</h1><p>This hub is not connected to a database yet. Open <b>config.js</b> and paste your Supabase project URL and key, as described in step 4 of the setup guide (README.md).</p></div>`)}
function gateSignIn(err,email){
  showGate(`<form class="f" id="fLogin"><h1>Sign in</h1><p>Use the account created in Supabase for this hub.</p>
    ${err?`<div class="gate-err">${esc(err)}</div>`:''}
    <label>Email<input id="liEmail" name="email" type="email" autocomplete="username" required value="${esc(email||'')}"></label>
    <label>Password<input id="liPass" name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn lime" type="submit">Sign in</button></form>`);
  (email?$('#liPass'):$('#liEmail')).focus();
}
function gateNoAccess(email){showGate(`<div class="grid" style="gap:14px"><h1>No access</h1><p><b>${esc(email)}</b> is signed in but is not on this hub's list of users. Add the address to the <b>hub_users</b> table in Supabase, then sign in again.</p><button class="btn" id="naOut" type="button">Sign out</button></div>`);
  $('#naOut').onclick=()=>sb.auth.signOut()}
async function enter(session){
  if(!session){S.user=null;return gateSignIn()}
  if(S.user&&S.user.id===session.user.id)return;
  S.user=session.user;
  const {data,error}=await sb.from('hub_users').select('email').limit(1);
  if(error||!data||!data.length)return gateNoAccess(session.user.email||'');
  $('#gate').hidden=true;$('#app').hidden=false;$('#who').textContent=session.user.email||'';
  render();loadAll();
}

/* ---------------- views ---------------- */
function renderNav(){$('#nav').innerHTML=TABS.map(([k,l])=>`<button data-tab="${k}" ${S.tab===k?'aria-current="page"':''}>${icon(k)}${l}</button>`).join('')}
const header=(eyebrow,title,right='')=>`<div class="head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>${right}</div>`;
const emptyBox=(what,how)=>`<div class="empty"><b>${what}</b><br>${how}</div>`;
const opts=(arr,sel,ph)=>(ph?`<option value="">${ph}</option>`:'')+byName(arr).map(o=>`<option value="${esc(o.id)}" ${o.id===sel?'selected':''}>${esc(o.name)}</option>`).join('');
const del=(coll,id)=>{const k=coll+'/'+id,on=S.armed===k;return `<button class="x ${on?'confirm':''}" data-del="${esc(k)}" aria-label="Delete">${on?'Confirm delete':'Delete'}</button>`};
function route(v){const f=L(v.from)?.name,t=L(v.to)?.name;
  if(v.type==='in')return esc(t||'');if(v.type==='sale'||v.type==='adjust')return esc(f||'');return `${esc(f||'?')} <span class="muted">→</span> ${esc(t||'?')}`}
const pill=v=>`<span class="pill p-${esc(v.type)}">${TYPE_LABEL[v.type]||esc(v.type)}</span>`;

function viewOverview(){
  const sm=stockMap(),mth=month(),ms=sales().filter(v=>(v.date||'').startsWith(mth));
  const units=ms.reduce((a,v)=>a+(Number(v.qty)||0),0),rev=ms.reduce((a,v)=>a+saleValue(v),0);
  let total=0,inStores=0;
  for(const p in sm)for(const l in sm[p]){total+=sm[p][l];if(L(l)?.type==='retail')inStores+=sm[p][l]}
  const alerts=[];
  for(const p of S.products)for(const l of S.locations){if(l.type!=='retail')continue;const q=(sm[p.id]||{})[l.id];if(q===undefined)continue;const lvl=Number(p.reorderAt)||10;if(q<=0)alerts.push({p,l,q,c:'out'});else if(q<lvl)alerts.push({p,l,q,c:'low'})}
  const recent=[...S.movements].sort((a,b)=>b.createdAt-a.createdAt).slice(0,6);
  const quick=S.links.filter(k=>k.pinned).slice(0,6);
  const mname=new Date().toLocaleString('en-US',{month:'long'});
  return header('RINS W.L.L','Overview',`<div class="chips"><button class="btn lime sm" data-go="sales">Record a sale</button><button class="btn ghost sm" data-go="inventory">Move stock</button></div>`)+
  `<div class="kpis">
    <div class="kpi hero"><div class="l">Revenue, ${mname}</div><div class="v">${bhd(rev)}<small>BHD</small></div><div class="s">${ms.length} sale${ms.length===1?'':'s'} recorded</div></div>
    <div class="kpi"><div class="l">Units sold, ${mname}</div><div class="v">${int(units)}</div><div class="s">All channels</div></div>
    <div class="kpi"><div class="l">Stock on hand</div><div class="v">${int(total)}</div><div class="s">Every location</div></div>
    <div class="kpi"><div class="l">On store shelves</div><div class="v">${int(inStores)}</div><div class="s">Consignment, still ours</div></div>
  </div>
  <div class="grid g-side">
    <section class="panel"><div class="panel-h"><h2>Recent activity</h2><button class="btn ghost sm" data-go="inventory">Full log</button></div>
      ${recent.length?`<div class="tbl"><table><thead><tr><th>Date</th><th>Type</th><th>Product</th><th>Where</th><th class="num">Qty</th></tr></thead><tbody>${recent.map(v=>`<tr><td class="mono">${esc(v.date)}</td><td>${pill(v)}</td><td>${esc(P(v.product)?.name||'Unknown')}</td><td>${route(v)}</td><td class="num">${int(v.qty)}</td></tr>`).join('')}</tbody></table></div>`
      :emptyBox(S.loaded?'No activity yet':'Loading…','Start by recording the stock you have now as "Stock in" at the warehouse, then each delivery to a store as a transfer.')}
    </section>
    <div class="grid" style="align-content:start">
      <section class="panel"><div class="panel-h"><h2>Needs attention</h2></div>
        ${alerts.length?`<div class="alerts">${alerts.map(a=>`<div class="alert"><span><b>${esc(a.l.name)}</b> · ${esc(a.p.name)}</span><span class="pill p-${a.c}">${a.c==='out'?'Out of stock':int(a.q)+' left'}</span></div>`).join('')}</div>`
        :`<div class="alert"><span>No store is below its reorder level.</span><span class="pill p-ok">All good</span></div>`}
      </section>
      <section class="panel"><div class="panel-h"><h2>Quick links</h2><button class="btn ghost sm" data-go="links">All links</button></div>
        ${quick.length?`<div class="alerts">${quick.map(k=>`<div class="alert"><a href="${esc(k.url)}" target="_blank" rel="noopener" style="color:var(--fg);font-weight:600">${esc(k.title)}</a><span class="muted" style="font-size:12px">${esc(k.category)}</span></div>`).join('')}</div>`
        :emptyBox('No pinned links','Pin your most used links on the Links page and they show up here.')}
      </section>
    </div>
  </div>`;
}

function viewInventory(){
  const sm=stockMap(),locs=byName(S.locations),prods=byName(S.products);
  const matrix=prods.length&&locs.length?`<div class="tbl"><table><thead><tr><th>Product</th>${locs.map(l=>`<th class="num">${esc(l.name)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${prods.map(p=>{let t=0;const lvl=Number(p.reorderAt)||10;return `<tr><td><b>${esc(p.name)}</b><div class="muted mono">${esc(p.sku)}</div></td>${locs.map(l=>{const has=(sm[p.id]||{})[l.id]!==undefined,q=has?sm[p.id][l.id]:0;t+=q;const c=l.type==='retail'&&has?(q<=0?'cell-out':q<lvl?'cell-low':''):'';return `<td class="num ${c}">${int(q)}</td>`}).join('')}<td class="num"><b>${int(t)}</b></td></tr>`}).join('')}</tbody></table></div>`
    :emptyBox('No products or locations yet','Add them on the Products and Locations pages first.');
  const log=[...S.movements].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.createdAt-a.createdAt);
  return header('Inventory','Stock by location')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Current stock</h2><span class="muted" style="font-size:13px">Amber is below reorder level, red is empty</span></div>${matrix}</section>
   <section class="panel"><div class="panel-h"><h2>Record a stock movement</h2></div>
    <form class="f" id="fMove">
      <label>Type<select id="mvType" name="type">${Object.entries(TYPE_LABEL).filter(([k])=>k!=='sale').map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
      <div class="muted" id="mvHelp" style="font-size:13px"></div>
      <div class="row"><label>Date<input id="mvDate" type="date" name="date" value="${today()}" required></label>
      <label>Product<select id="mvProd" name="product" required>${opts(S.products,'','Choose')}</select></label></div>
      <div class="row"><label id="mvFromL"><span>From</span><select id="mvFrom" name="from">${opts(S.locations,'','Choose')}</select></label>
      <label id="mvToL">To<select id="mvTo" name="to">${opts(S.locations,'','Choose')}</select></label></div>
      <div class="row"><label>Quantity<input id="mvQty" type="number" name="qty" step="1" required></label>
      <label>Note<input id="mvNote" name="note" placeholder="Batch, delivery note no."></label></div>
      <button class="btn" type="submit">Save movement</button>
    </form></section>
  </div>
  <section class="panel" style="margin-top:16px"><div class="panel-h"><h2>Movement log</h2><span class="muted" style="font-size:13px">${log.length} entries</span></div>
   ${log.length?`<div class="tbl"><table><thead><tr><th>Date</th><th>Type</th><th>Product</th><th>Where</th><th class="num">Qty</th><th>Note</th><th></th></tr></thead><tbody>${log.map(v=>`<tr><td class="mono">${esc(v.date)}</td><td>${pill(v)}</td><td>${esc(P(v.product)?.name||'Unknown')}</td><td>${route(v)}</td><td class="num">${int(v.qty)}</td><td class="muted">${esc(v.note)}</td><td class="num">${del('movements',v.id)}</td></tr>`).join('')}</tbody></table></div>`
   :emptyBox('The log is empty','Every delivery, transfer, return and sale lands here, and stock is calculated from it.')}
  </section>`;
}
const MV_HELP={in:'New stock arriving, e.g. finished packs from production. Choose where it goes.',transfer:'Stock moving between your own locations, e.g. warehouse to a store.',return:'Stock coming back from a store, e.g. damaged or unsold packs.',adjust:'Correct a count. Use a negative number for damaged or missing packs.'};
function syncMoveForm(){const t=$('#mvType')?.value;if(!t)return;$('#mvHelp').textContent=MV_HELP[t];
  $('#mvFromL').hidden=t==='in';$('#mvToL').hidden=t==='adjust';$('#mvFromL span').textContent=t==='adjust'?'Location':'From';
  $('#mvQty').min=t==='adjust'?'':'1'}

function viewSales(){
  const all=sales().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.createdAt-a.createdAt);
  const ms=all.filter(v=>(v.date||'').startsWith(month()));
  const byLoc={};for(const v of ms){const k=v.from||'?';byLoc[k]??={u:0,r:0};byLoc[k].u+=Number(v.qty)||0;byLoc[k].r+=saleValue(v)}
  const rows=Object.entries(byLoc).sort((a,b)=>b[1].r-a[1].r),max=Math.max(1,...rows.map(r=>r[1].r));
  return header('Sales','Sales tracking')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Sales this month by location</h2></div>
    ${rows.length?`<div class="tbl"><table><thead><tr><th>Location</th><th>Share</th><th class="num">Units</th><th class="num">BHD</th></tr></thead><tbody>${rows.map(([k,o])=>`<tr><td><b>${esc(L(k)?.name||'Unknown')}</b><div class="muted" style="font-size:12px">${esc(LOC_TYPES[L(k)?.type]||'')}</div></td><td style="width:30%"><div class="bar"><i style="width:${(o.r/max*100).toFixed(1)}%"></i></div></td><td class="num">${int(o.u)}</td><td class="num">${bhd(o.r)}</td></tr>`).join('')}</tbody></table></div>`
    :emptyBox('No sales this month yet','Record a sale on the right.')}
   </section>
   <section class="panel"><div class="panel-h"><h2>Record a sale</h2></div>
    <form class="f" id="fSale">
      <div class="row"><label>Date<input id="slDate" type="date" name="date" value="${today()}" required></label>
      <label>Sold at<select id="slFrom" name="from" required>${opts(S.locations,'','Choose')}</select></label></div>
      <label>Product<select id="slProd" name="product" required>${opts(S.products,'','Choose')}</select></label>
      <div class="row"><label>Quantity<input id="slQty" type="number" name="qty" min="1" step="1" required></label>
      <label>Unit price (BHD)<input id="slPrice" type="number" name="price" min="0" step="0.001" placeholder="Uses product price"></label></div>
      <label>Note<input id="slNote" name="note" placeholder="Invoice or report reference"></label>
      <button class="btn" type="submit">Save sale</button>
    </form></section>
  </div>
  <section class="panel" style="margin-top:16px"><div class="panel-h"><h2>All sales</h2><span class="muted" style="font-size:13px">${all.length} entries</span></div>
   ${all.length?`<div class="tbl"><table><thead><tr><th>Date</th><th>Location</th><th>Product</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total BHD</th><th></th></tr></thead><tbody>${all.map(v=>`<tr><td class="mono">${esc(v.date)}</td><td>${esc(L(v.from)?.name||'Unknown')}</td><td>${esc(P(v.product)?.name||'Unknown')}</td><td class="num">${int(v.qty)}</td><td class="num">${bhd(v.price)}</td><td class="num"><b>${bhd(saleValue(v))}</b></td><td class="num">${del('movements',v.id)}</td></tr>`).join('')}</tbody></table></div>`
   :emptyBox('No sales recorded','Each sale also takes the units out of that location\'s stock.')}
  </section>`;
}

function viewLocations(){
  const sm=stockMap(),locs=byName(S.locations);
  return header('Locations','Where stock lives')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Locations</h2></div>
    ${locs.length?`<div class="tbl"><table><thead><tr><th>Name</th><th>Type</th><th>Stand</th><th class="num">Stock</th><th></th></tr></thead><tbody>${locs.map(l=>{let q=0;for(const p in sm)q+=(sm[p][l.id]||0);return `<tr><td><b>${esc(l.name)}</b>${l.note?`<div class="muted" style="font-size:12px">${esc(l.note)}</div>`:''}</td><td>${esc(LOC_TYPES[l.type]||l.type)}</td><td>${l.stand?'<span class="pill p-ok">Installed</span>':'<span class="muted">None</span>'}</td><td class="num">${int(q)}</td><td class="num">${del('locations',l.id)}</td></tr>`}).join('')}</tbody></table></div>`
    :emptyBox('No locations yet','Add your warehouse and each store that holds stock.')}
   </section>
   <section class="panel"><div class="panel-h"><h2>Add a location</h2></div>
    <form class="f" id="fLoc">
      <label>Name<input id="lcName" name="name" required placeholder="e.g. Alosra Saar"></label>
      <div class="row"><label>Type<select id="lcType" name="type">${Object.entries(LOC_TYPES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Display stand<select id="lcStand" name="stand"><option value="">No</option><option value="1">Yes, installed</option></select></label></div>
      <label>Note<input id="lcNote" name="note" placeholder="Contact, branch, terms"></label>
      <button class="btn" type="submit">Add location</button>
    </form></section>
  </div>`;
}

function viewProducts(){
  const prods=byName(S.products);
  return header('Products','Product list')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Products</h2></div>
    ${prods.length?`<div class="tbl"><table><thead><tr><th>Product</th><th>SKU</th><th>Line</th><th class="num">Price BHD</th><th class="num">Reorder at</th><th></th></tr></thead><tbody>${prods.map(p=>`<tr><td><b>${esc(p.name)}</b>${p.unit?`<div class="muted" style="font-size:12px">${esc(p.unit)}</div>`:''}${p.barcode?`<div class="muted mono" style="font-size:12px">Barcode: ${esc(p.barcode)}</div>`:''}</td><td class="mono">${esc(p.sku||'—')}</td><td>${esc(p.line)}</td><td class="num">${p.price!==null?bhd(p.price):'<span class="muted">Not set</span>'}</td><td class="num">${int(p.reorderAt??10)}</td><td class="num">${del('products',p.id)}</td></tr>`).join('')}</tbody></table></div>`
    :emptyBox('No products yet','Add each item you sell, one row per colour or pack size.')}
   </section>
   <section class="panel"><div class="panel-h"><h2>Add a product</h2></div>
    <form class="f" id="fProd">
      <label>Name<input id="pdName" name="name" required placeholder="e.g. Pocket Bidet, black, 4-pack"></label>
      <div class="row"><label>SKU<input id="pdSku" name="sku" placeholder="Optional"></label>
      <label>Line<input id="pdLine" name="line" placeholder="Pocket Bidet / Classic Fusion"></label></div>
      <div class="row"><label>Retail price (BHD)<input id="pdPrice" type="number" name="price" min="0" step="0.001" value="1.99"></label>
      <label>Reorder at (units)<input id="pdReorder" type="number" name="reorderAt" min="0" step="1" value="10"></label></div>
      <div class="row"><label>Barcode<input id="pdBarcode" name="barcode" placeholder="Optional barcode"></label>
      <label>Pack / unit<input id="pdUnit" name="unit" placeholder="e.g. Pouch of 4 caps"></label></div>
      <button class="btn" type="submit">Add product</button>
    </form></section>
  </div>`;
}

function viewLinks(){
  const groups={};for(const k of [...S.links].sort((a,b)=>String(a.title).localeCompare(String(b.title))))(groups[k.category||'Other']??=[]).push(k);
  return header('Links','Everything in one place')+
  `<div class="grid" style="gap:20px">
   ${Object.keys(groups).length?Object.entries(groups).map(([g,ks])=>`<section><div class="cat" style="margin-bottom:8px">${esc(g)}</div><div class="links">${ks.map(k=>`<div class="link"><a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.title)}<span class="u">${esc(k.url)}</span></a><div style="display:flex;gap:2px;flex:none"><button class="x" data-pin="${esc(k.id)}">${k.pinned?'Pinned':'Pin'}</button>${del('links',k.id)}</div></div>`).join('')}</div></section>`).join('')
   :emptyBox('No links yet','Add Instagram, TikTok, supplier portals, your drive and anything else you open often.')}
   <section class="panel" style="max-width:640px"><div class="panel-h"><h2>Add a link</h2></div>
    <form class="f" id="fLink">
      <div class="row"><label>Title<input id="lkTitle" name="title" required placeholder="e.g. Alosra supplier portal"></label>
      <label>Category<input id="lkCat" name="category" list="cats" placeholder="Social, Retail, Admin"></label></div>
      <datalist id="cats">${[...new Set(S.links.map(k=>k.category).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
      <label>Web address<input id="lkUrl" name="url" type="url" required placeholder="https://"></label>
      <button class="btn" type="submit">Add link</button>
    </form></section>
  </div>`;
}

function viewDocuments(){
  const docs=[...S.documents].sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
  return header('Documents','Certificates and paperwork')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Saved documents</h2><span class="muted" style="font-size:13px">Barcodes, import quotations, certificates and supplier files</span></div>
    ${docs.length?`<div class="alerts">${docs.map(d=>`<div class="alert"><span><b>${esc(d.title)}</b>${d.productId?` · ${esc(P(d.productId)?.name||'General')}`:''}${d.reference?`<div class="muted" style="font-size:12px">${esc(d.reference)}</div>`:''}${d.notes?`<div class="muted" style="font-size:12px">${esc(d.notes)}</div>`:''}${d.fileName?`<div class="muted" style="font-size:12px">File: ${esc(d.fileName)}</div>`:''}</span></div>`).join('')}</div>`:emptyBox('No documents yet','Add a barcode, import quotation, invoice, or any product paperwork here.')}
   </section>
   <section class="panel"><div class="panel-h"><h2>Add a document</h2></div>
    <form class="f" id="fDoc">
      <div class="row"><label>Document title<input id="docTitle" name="title" required placeholder="Barcode / Import quotation / Certificate"></label>
      <label>Related product<select id="docProduct" name="product"><option value="">General document</option>${opts(S.products,'','General')}</select></label></div>
      <div class="row"><label>Reference / code<input id="docRef" name="reference" placeholder="e.g. PB-BLUE-4 or Q-2026-01"></label>
      <label>Notes<input id="docNote" name="notes" placeholder="Useful reminder or supplier detail"></label></div>
      <label>Upload document<input id="docFile" type="file" name="file"></label>
      <button class="btn" type="submit">Add document</button>
    </form>
   </section>
  </div>`;
}

function viewCalendar(){
  const today=new Date(); const year=today.getFullYear(); const monthIndex=today.getMonth();
  const first=new Date(year,monthIndex,1); const startDay=(first.getDay()+6)%7; const daysInMonth=new Date(year,monthIndex+1,0).getDate();
  const actionMap={};
  for(const v of S.movements){const d=(v.date||'').trim(); if(d){actionMap[d]=(actionMap[d]||0)+1;}}
  const cells=[]; for(let i=0;i<startDay;i++)cells.push(''); for(let d=1;d<=daysInMonth;d++)cells.push(String(d));
  while(cells.length%7!==0)cells.push('');
  const rows=[]; for(let i=0;i<cells.length;i+=7)rows.push(cells.slice(i,i+7));
  const monthName=new Date(year,monthIndex).toLocaleString('en-US',{month:'long',year:'numeric'});
  return header('Calendar','Main actions this month')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>${esc(monthName)}</h2></div>
    <div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="cal-head">${d}</div>`).join('')}${rows.flatMap(w=>w.map(day=>{
      if(!day){return '<div class="cal-day empty"></div>'}
      const key=`${year}-${String(monthIndex+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; const count=actionMap[key]||0;
      return `<div class="cal-day ${count?'has':''}"><span class="cal-date">${day}</span>${count?`<span class="pill p-ok">${int(count)} action${count===1?'':'s'}</span>`:''}</div>`;
    })).join('')}</div>
   </section>
   <section class="panel"><div class="panel-h"><h2>Recent actions</h2></div>
    ${S.movements.length?`<div class="alerts">${[...S.movements].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.createdAt-a.createdAt).slice(0,8).map(v=>`<div class="alert"><span><b>${esc(TYPE_LABEL[v.type]||v.type)}</b> · ${esc(P(v.product)?.name||'Unknown')}</span><span class="muted">${esc(v.date)}</span></div>`).join('')}</div>`:emptyBox('No actions yet','Record sales or stock movements and they will appear here.')}
   </section>
  </div>`;
}

function viewAnalysis(){
  return header('Analysis','Business analysis')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Analysis</h2></div>
    <div class="empty"><b>Analysis coming soon</b><br>We will add more dashboards, trends and stock insights here as the hub grows.</div>
   </section>
   <section class="panel"><div class="panel-h"><h2>Planned insight areas</h2></div>
    <ul class="roadmap" style="padding-left:18px;margin:0">
      <li>Best-selling products and product lines</li>
      <li>Low stock warnings and reorder recommendations</li>
      <li>Store-by-store sales trends</li>
      <li>Monthly revenue and movement summaries</li>
    </ul>
   </section>
  </div>`;
}

function viewAssistant(){
  const ex=['How much stock is in each store?','Which product sells best this month?','What should I restock this week?','Draft a restock message for Day2Day'];
  return header('Assistant','RINS assistant')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Ask about your business</h2><span class="muted" style="font-size:13px">Reads the hub's data. It does not change anything.</span></div>
    <div class="chat" id="chat">${S.chat.length?S.chat.map(m=>`<div class="msg ${m.r}">${esc(m.t)}</div>`).join(''):`<div class="chips">${ex.map(e=>`<button class="chip" data-ask="${esc(e)}">${esc(e)}</button>`).join('')}</div>`}</div>
    <form class="f" id="fAsk" style="margin-top:14px;grid-template-columns:1fr auto;align-items:end">
      <label style="margin:0">Your question<input id="askQ" name="q" placeholder="e.g. How many caps are at the airport?"></label>
      <button class="btn lime" type="submit">Ask</button>
    </form>
   </section>
   <section class="panel"><div class="panel-h"><h2>Automations planned</h2></div>
    <ul class="roadmap" style="padding-left:18px;margin:0">
      <li><b>Weekly summary</b>: every Sunday, what sold, what is low and what to restock</li>
      <li><b>Report reading</b>: turn a store's sales file into sale entries, once the retailers' format is agreed</li>
      <li><b>Drafts</b>: restock notes, invoices and follow-up emails for you to approve</li>
      <li><b>Problem flags</b>: a store with no sales for two weeks</li>
    </ul>
   </section>
  </div>`;
}

const VIEWS={overview:viewOverview,inventory:viewInventory,sales:viewSales,locations:viewLocations,products:viewProducts,documents:viewDocuments,calendar:viewCalendar,analysis:viewAnalysis,links:viewLinks,assistant:viewAssistant};
function render(){
  if($('#app').hidden)return;
  renderNav();
  const keep={};document.querySelectorAll('main input,main select').forEach(el=>{if(el.id)keep[el.id]=el.value});
  $('#main').innerHTML=VIEWS[S.tab]();
  for(const [id,v] of Object.entries(keep)){const el=document.getElementById(id);if(el&&v!=='')el.value=v}
  syncMoveForm();
  const c=$('#chat');if(c)c.scrollTop=c.scrollHeight;
}
function go(t){S.tab=t;S.armed=null;try{localStorage.setItem('rins.tab',t)}catch(e){}render();window.scrollTo(0,0)}

/* ---------------- events ---------------- */
const TABLE_OF={products:'products',locations:'locations',movements:'movements',links:'links'};
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-tab],[data-go],[data-del],[data-pin],[data-ask]');if(!b)return;
  if(b.dataset.tab)return go(b.dataset.tab);
  if(b.dataset.go)return go(b.dataset.go);
  if(b.dataset.ask){$('#askQ').value=b.dataset.ask;return ask(b.dataset.ask)}
  try{
    if(b.dataset.pin){const k=S.links.find(x=>x.id===b.dataset.pin);if(k)await write(sb.from('links').update({pinned:!k.pinned}).eq('id',k.id));return}
    if(b.dataset.del){const key=b.dataset.del;if(S.armed!==key){S.armed=key;render();return}
      S.armed=null;const i=key.indexOf('/'),coll=key.slice(0,i),id=key.slice(i+1);
      if(!TABLE_OF[coll])return;
      await write(sb.from(TABLE_OF[coll]).delete().eq('id',id));toast('Deleted')}
  }catch(err){S.armed=null;render();toast(err.message,1)}
});
document.addEventListener('change',e=>{if(e.target.id==='mvType')syncMoveForm()});
document.addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target,d=Object.fromEntries(new FormData(f));
  const btn=f.querySelector('button[type=submit]');
  if(f.id==='fLogin'){
    btn.disabled=true;
    const {error}=await sb.auth.signInWithPassword({email:d.email.trim(),password:d.password});
    if(error){btn.disabled=false;gateSignIn(/invalid/i.test(error.message)?'The email or password is wrong.':error.message,d.email.trim())}
    return;
  }
  if(f.id==='fAsk')return ask(d.q);
  if(btn)btn.disabled=true;
  try{
    if(f.id==='fMove'){
      const qty=Number(d.qty);if(!qty)throw new Error('Enter a quantity.');
      if(d.type!=='in'&&!d.from)throw new Error('Choose where the stock comes from.');
      if(d.type!=='adjust'&&!d.to)throw new Error('Choose where the stock goes.');
      if(d.type==='transfer'&&d.from===d.to)throw new Error('From and To are the same location.');
      if(d.type!=='adjust'&&qty<0)throw new Error('Use a positive quantity. Only adjustments can be negative.');
      await write(sb.from('movements').insert({type:d.type,date:d.date,product_id:d.product,from_loc:d.type==='in'?null:d.from,to_loc:d.type==='adjust'?null:d.to,qty,note:d.note||''}));
      toast(TYPE_LABEL[d.type]+' saved');['mvQty','mvNote'].forEach(id=>$('#'+id).value='');
    }else if(f.id==='fSale'){
      const p=P(d.product),price=d.price!==''?Number(d.price):(p?.price??0);
      await write(sb.from('movements').insert({type:'sale',date:d.date,product_id:d.product,from_loc:d.from,qty:Number(d.qty),price,note:d.note||''}));
      toast('Sale saved');['slQty','slPrice','slNote'].forEach(id=>$('#'+id).value='');
    }else if(f.id==='fLoc'){
      await write(sb.from('locations').insert({name:d.name.trim(),type:d.type,stand:!!d.stand,note:d.note||''}));
      toast('Location added');['lcName','lcNote'].forEach(id=>$('#'+id).value='');
    }else if(f.id==='fProd'){
      await write(sb.from('products').insert({name:d.name.trim(),sku:d.sku||'',line:d.line||'',price:d.price===''?null:Number(d.price),reorder_at:Number(d.reorderAt)||10,unit:d.unit||''}));
      toast('Product added');['pdName','pdSku','pdLine','pdPrice','pdUnit','pdBarcode'].forEach(id=>$('#'+id).value='');
    }else if(f.id==='fDoc'){
      const file=($('#docFile')?.files&&$('#docFile').files[0])||null;
      const item={id:`doc-${Date.now()}-${Math.random().toString(16).slice(2,6)}`,productId:d.product||'',title:d.title.trim()||'Document',reference:(d.reference||'').trim(),notes:(d.notes||'').trim(),fileName:file?file.name:''};
      S.documents=[...S.documents,item]; saveLocalJSON('rins.documents',S.documents); render(); toast('Document saved');['docTitle','docRef','docNote','docProduct'].forEach(id=>$('#'+id).value=''); if($('#docFile'))$('#docFile').value='';
    }else if(f.id==='fLink'){
      await write(sb.from('links').insert({title:d.title.trim(),url:d.url.trim(),category:(d.category||'').trim()||'Other',pinned:false}));
      toast('Link added');['lkTitle','lkUrl','lkCat'].forEach(id=>$('#'+id).value='');
    }
  }catch(err){toast(err.message||'Could not save. Try again.',1)}
  finally{const b2=document.querySelector('#'+f.id+' button[type=submit]');if(b2)b2.disabled=false}
});

/* ---------------- assistant (Supabase Edge Function "assistant") ---------------- */
let busy=false;
async function ask(q){
  q=(q||'').trim();if(!q||busy)return;busy=true;
  const history=S.chat.slice(-8).map(m=>({role:m.r==='me'?'user':'assistant',content:m.t}));
  S.chat.push({r:'me',t:q},{r:'ai',t:'Thinking…'});render();
  const ai=S.chat[S.chat.length-1];
  try{
    const {data,error}=await sb.functions.invoke('assistant',{body:{question:q,history}});
    if(error){
      let detail='';try{detail=(await error.context?.json())?.error||''}catch(_){}
      ai.t=detail||(/not found|404|Failed to send/i.test(error.message)?'The assistant is not switched on yet. Follow step 6 in the setup guide (README.md).':'The assistant could not answer: '+error.message);
    }else ai.t=data?.answer||'No answer came back.';
  }catch(err){ai.t='The assistant could not answer: '+(err.message||'unknown error')}
  busy=false;render();$('#askQ')?.focus();
}

/* ---------------- start ---------------- */
$('#signOut').onclick=async()=>{await sb.auth.signOut()};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.user&&!$('#app').hidden)loadAll()});
if(!configured||!sb){gateSetup();return}
sb.auth.onAuthStateChange((_event,session)=>{
  if(!session){S.user=null;S.chat=[];Object.assign(S,{products:[],locations:[],movements:[],links:[],loaded:false});gateSignIn();return}
  setTimeout(()=>enter(session),0);
});
sb.auth.getSession().then(({data})=>enter(data.session));
})();
