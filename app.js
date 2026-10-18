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
const FORMATS=['Supermarket','To Go','Pharmacy','Other'];
const DISPLAYS={stand:'Stand',hanger:'Hanger',none:'No display'};
const DOC_TYPES=['Barcode','Import quotation','Certificate','Invoice','Contract','Supplier document','Other'];
const MAX_FILE_MB=20;
const S={editLoc:null,tab:'overview',products:[],locations:[],movements:[],links:[],documents:[],docsReady:true,docFilter:{q:'',product:'',type:''},viewer:null,chat:[],armed:null,loaded:false,user:null};
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
  products:r=>({id:r.id,name:r.name,sku:r.sku||'',line:r.line||'',price:r.price===null?null:Number(r.price),reorderAt:r.reorder_at,unit:r.unit||'',barcode:r.barcode||'',createdAt:Date.parse(r.created_at)||0}),
  locations:r=>({id:r.id,name:r.name,type:r.type,chain:r.chain||'',format:r.format||'',display:r.display||(r.stand?'stand':'none'),note:r.note||'',createdAt:Date.parse(r.created_at)||0}),
  movements:r=>({id:r.id,type:r.type,date:r.date,product:r.product_id,from:r.from_loc,to:r.to_loc,qty:r.qty,price:r.price===null?null:Number(r.price),note:r.note||'',createdAt:Date.parse(r.created_at)||0}),
  documents:r=>({id:r.id,title:r.title,docType:r.doc_type||'Other',productId:r.product_id||'',reference:r.reference||'',notes:r.notes||'',filePath:r.file_path,fileName:r.file_name||'',fileType:r.file_type||'',fileSize:Number(r.file_size)||0,createdAt:Date.parse(r.created_at)||0}),
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
    let documents=[],docsReady=true;
    try{documents=await fetchAll('documents')}catch(_){docsReady=false}
    Object.assign(S,{products,locations,movements,links,documents,docsReady,loaded:true});render();
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

/* One quantity box per product; prices come from the product list */
function saleLines(){
  const prods=byName(S.products);
  if(!prods.length)return emptyBox('No products yet','Add products on the Products page and they appear here automatically.');
  const sm=stockMap(),loc=$('#slFrom')?.value||'';
  return `<div class="sale-lines"><div class="sale-head"><span>Product</span><span class="num">Price</span><span class="num">Qty</span><span class="num">Total</span></div>
    ${prods.map(p=>{const priced=p.price!==null&&p.price!==undefined;const have=loc?((sm[p.id]||{})[loc]||0):null;
      return `<div class="sale-line${priced?'':' unpriced'}">
        <span class="sl-name"><b>${esc(p.name)}</b>${p.unit?`<span class="muted">${esc(p.unit)}</span>`:''}${have!==null?`<span class="${have<0?'cell-out':'muted'}">${int(have)} in stock here</span>`:''}</span>
        <span class="num">${priced?bhd(p.price):'<span class="muted">No price</span>'}</span>
        ${priced?`<input id="slq-${esc(p.id)}" class="sl-qty" data-price="${p.price}" type="number" min="0" step="1" inputmode="numeric" placeholder="0" aria-label="Quantity of ${esc(p.name)}">`
          :`<button type="button" class="x" data-go="products" title="Set a price on the Products page">Set price</button>`}
        <span class="num sl-total" data-for="slq-${esc(p.id)}">–</span></div>`}).join('')}
    <div class="sale-sum"><span>Total</span><span class="num" id="slSum">0 units · 0.000 BHD</span></div></div>`;
}
function updateSaleTotals(){
  let u=0,t=0;
  document.querySelectorAll('.sl-qty').forEach(i=>{const q=Math.max(0,Math.floor(Number(i.value)||0)),line=q*Number(i.dataset.price);
    const cell=document.querySelector(`.sl-total[data-for="${i.id}"]`);if(cell)cell.textContent=q?bhd(line):'–';u+=q;t+=line});
  const sum=$('#slSum');if(sum)sum.textContent=`${int(u)} unit${u===1?'':'s'} · ${bhd(t)} BHD`;
}
function viewSales(){
  const all=sales().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.createdAt-a.createdAt);
  const ms=all.filter(v=>(v.date||'').startsWith(month()));
  const byLoc={};for(const v of ms){const k=v.from||'?';byLoc[k]??={u:0,r:0};byLoc[k].u+=Number(v.qty)||0;byLoc[k].r+=saleValue(v)}
  const rows=Object.entries(byLoc).sort((a,b)=>b[1].r-a[1].r),max=Math.max(1,...rows.map(r=>r[1].r));
  return header('Sales','Sales tracking')+
  `<div class="grid g-sale">
   <section class="panel"><div class="panel-h"><h2>Sales this month by location</h2></div>
    ${rows.length?`<div class="tbl"><table><thead><tr><th>Location</th><th>Share</th><th class="num">Units</th><th class="num">BHD</th></tr></thead><tbody>${rows.map(([k,o])=>`<tr><td><b>${esc(L(k)?.name||'Unknown')}</b><div class="muted" style="font-size:12px">${esc(LOC_TYPES[L(k)?.type]||'')}</div></td><td style="width:30%"><div class="bar"><i style="width:${(o.r/max*100).toFixed(1)}%"></i></div></td><td class="num">${int(o.u)}</td><td class="num">${bhd(o.r)}</td></tr>`).join('')}</tbody></table></div>`
    :emptyBox('No sales this month yet','Record a sale on the right.')}
   </section>
   <section class="panel"><div class="panel-h"><h2>Record a sale</h2></div>
    <form class="f" id="fSale">
      <div class="row"><label>Date<input id="slDate" type="date" name="date" value="${today()}" required></label>
      <label>Sold at<select id="slFrom" name="from" required>${opts(S.locations,'','Choose')}</select></label></div>
      ${saleLines()}
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
  const sm=stockMap();
  const stockAt=id=>{let q=0;for(const p in sm)q+=(sm[p][id]||0);return q};
  const groups={};
  for(const l of S.locations)(groups[l.chain||(l.type==='warehouse'?'Our stock':'Other locations')]??=[]).push(l);
  const order=Object.keys(groups).sort((a,b)=>(a==='Our stock')-(b==='Our stock')||a.localeCompare(b));
  const fmtRank=f=>{const i=FORMATS.indexOf(f);return i<0?99:i};
  const nStand=S.locations.filter(l=>l.display==='stand').length,nHanger=S.locations.filter(l=>l.display==='hanger').length;
  const e=S.editLoc?S.locations.find(l=>l.id===S.editLoc):null;
  const chains=[...new Set(S.locations.map(l=>l.chain).filter(Boolean))];
  const v=(k,def='')=>esc(e?(e[k]??def):def);
  return header('Locations','Where stock lives',`<div class="chips"><span class="pill p-disp-stand">${nStand} stand${nStand===1?'':'s'}</span><span class="pill p-disp-hanger">${nHanger} hanger${nHanger===1?'':'s'}</span></div>`)+
  `<div class="grid g-side">
   <div class="grid" style="align-content:start">
   ${S.locations.length?order.map(g=>{const ls=groups[g].sort((a,b)=>fmtRank(a.format)-fmtRank(b.format)||a.name.localeCompare(b.name));
     return `<section class="panel"><div class="panel-h"><h2>${esc(g)}</h2><span class="muted" style="font-size:13px">${ls.length} location${ls.length===1?'':'s'}</span></div>
     <div class="tbl"><table><thead><tr><th>Branch</th><th>Format</th><th>Display</th><th class="num">Stock</th><th></th></tr></thead><tbody>${ls.map(l=>`<tr class="${S.editLoc===l.id?'row-editing':''}">
       <td><b>${esc(l.name)}</b>${l.note?`<div class="muted" style="font-size:12px">${esc(l.note)}</div>`:''}</td>
       <td>${esc(l.format||LOC_TYPES[l.type]||l.type)}</td>
       <td><span class="pill p-disp-${esc(l.display)}">${esc(DISPLAYS[l.display]||'No display')}</span></td>
       <td class="num">${int(stockAt(l.id))}</td>
       <td class="num" style="white-space:nowrap"><button class="x" data-editloc="${esc(l.id)}">Edit</button>${del('locations',l.id)}</td></tr>`).join('')}</tbody></table></div></section>`}).join('')
   :`<section class="panel">${emptyBox('No locations yet','Add your warehouse and each store that holds stock.')}</section>`}
   </div>
   <section class="panel" style="align-self:start"><div class="panel-h"><h2>${e?'Edit location':'Add a location'}</h2>${e?'<button class="btn ghost sm" data-canceledit>Cancel</button>':''}</div>
    <form class="f" id="fLoc" data-id="${e?esc(e.id):''}">
      <label>Branch name<input id="lcName" name="name" required value="${v('name')}" placeholder="e.g. Alosra Saar"></label>
      <div class="row"><label>Retailer / chain<input id="lcChain" name="chain" list="chainList" value="${v('chain')}" placeholder="e.g. Alosra"></label>
      <label>Type<select id="lcType" name="type">${Object.entries(LOC_TYPES).map(([k,t])=>`<option value="${k}" ${(e?e.type:'retail')===k?'selected':''}>${t}</option>`).join('')}</select></label></div>
      <datalist id="chainList">${chains.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
      <div class="row"><label>Format<select id="lcFormat" name="format"><option value="">Not set</option>${FORMATS.map(f=>`<option ${e&&e.format===f?'selected':''}>${f}</option>`).join('')}</select></label>
      <label>Display<select id="lcDisplay" name="display">${Object.entries(DISPLAYS).map(([k,t])=>`<option value="${k}" ${(e?e.display:'none')===k?'selected':''}>${t}</option>`).join('')}</select></label></div>
      <label>Note<input id="lcNote" name="note" value="${v('note')}" placeholder="Contact, opening date, terms"></label>
      <button class="btn" type="submit">${e?'Save changes':'Add location'}</button>
    </form>
    <p class="muted" style="font-size:13px;margin:12px 0 0">Stand: the 165 cm free-standing unit. Hanger: hanging display strip, used at To Go branches.</p>
   </section>
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

const fmtSize=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const fileKind=d=>/^image\//.test(d.fileType)?'image':(d.fileType==='application/pdf'||/\.pdf$/i.test(d.fileName))?'pdf':'other';
const extOf=d=>((d.fileName.match(/\.([a-z0-9]{1,5})$/i)||[])[1]||'file').toUpperCase();
function viewDocuments(){
  if(!S.docsReady)return header('Documents','Certificates and paperwork')+
    `<div class="banner">Document storage isn't set up yet. Run <b>supabase/documents.sql</b> in the Supabase SQL Editor, then reload this page.</div>`;
  const f=S.docFilter,q=f.q.trim().toLowerCase();
  const docs=[...S.documents].sort((a,b)=>b.createdAt-a.createdAt).filter(d=>
    (!f.product||(f.product==='general'?!d.productId:d.productId===f.product))&&(!f.type||d.docType===f.type)&&
    (!q||[d.title,d.reference,d.notes,d.fileName,d.docType,P(d.productId)?.name].join(' ').toLowerCase().includes(q)));
  return header('Documents','Certificates and paperwork')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Your documents</h2><span class="muted" style="font-size:13px">${S.documents.length} saved</span></div>
    ${S.documents.length?`<div class="doc-filters">
      <input id="dfQ" type="search" placeholder="Search title, reference, notes" value="${esc(f.q)}" aria-label="Search documents">
      <select id="dfProduct" aria-label="Filter by product"><option value="">All products</option><option value="general" ${f.product==='general'?'selected':''}>General documents</option>${opts(S.products,f.product)}</select>
      <select id="dfType" aria-label="Filter by type"><option value="">All types</option>${DOC_TYPES.map(t=>`<option ${f.type===t?'selected':''}>${t}</option>`).join('')}</select>
    </div>
    ${docs.length?`<div class="doc-list">${docs.map(d=>`<div class="doc-row">
      <button class="doc-open" data-view="${esc(d.id)}" aria-label="Open ${esc(d.title)}">
        <span class="doc-ext doc-${fileKind(d)}">${esc(extOf(d))}</span>
        <span class="doc-main"><b>${esc(d.title)}</b><span class="muted">${esc(d.docType)} · ${esc(P(d.productId)?.name||'General')}${d.reference?` · <span class="mono">${esc(d.reference)}</span>`:''}</span>
        ${d.notes?`<span class="muted doc-notes">${esc(d.notes)}</span>`:''}</span>
        <span class="muted doc-meta">${esc(new Date(d.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}))}<br>${fmtSize(d.fileSize)}</span>
      </button>${del('documents',d.id)}</div>`).join('')}</div>`
      :emptyBox('No matches','Clear the search or filters to see all documents.')}`
    :emptyBox('No documents yet','Upload a barcode, import quotation, certificate or invoice using the form. Click any saved document to open it.')}
   </section>
   <section class="panel"><div class="panel-h"><h2>Add a document</h2></div>
    <form class="f" id="fDoc">
      <label>File<input id="docFile" type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt"></label>
      <div class="muted" style="font-size:13px;margin-top:-6px">PDF, image, Word or Excel, up to ${MAX_FILE_MB} MB</div>
      <div class="row"><label>Type<select id="docType" name="docType">${DOC_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></label>
      <label>Related product<select id="docProduct" name="product"><option value="">General document</option>${opts(S.products,'')}</select></label></div>
      <label>Title<input id="docTitle" name="title" required placeholder="e.g. Blue pack barcode label"></label>
      <div class="row"><label>Reference / code<input id="docRef" name="reference" placeholder="e.g. PB-BLUE-4 or IQ-2026-01"></label>
      <label>Notes<input id="docNote" name="notes" placeholder="Supplier, expiry date, reminder"></label></div>
      <button class="btn" type="submit">Upload document</button>
    </form>
   </section>
  </div>`;
}

/* Viewer: opens a stored document with a short-lived private link */
async function openDoc(id){
  const d=S.documents.find(x=>x.id===id);if(!d)return;
  S.viewer={d,url:null,dl:null,err:null};renderViewer();
  const [v,w]=await Promise.all([
    sb.storage.from('documents').createSignedUrl(d.filePath,3600),
    sb.storage.from('documents').createSignedUrl(d.filePath,3600,{download:d.fileName||true})]);
  if(!S.viewer||S.viewer.d!==d)return;
  if(v.error){S.viewer.err='Could not open this file: '+v.error.message}else{S.viewer.url=v.data.signedUrl;S.viewer.dl=w.data?.signedUrl||v.data.signedUrl}
  renderViewer();
}
function closeViewer(){S.viewer=null;renderViewer()}
function renderViewer(){
  let el=$('#viewer');
  if(!S.viewer){if(el)el.remove();document.body.style.overflow='';return}
  if(!el){el=document.createElement('div');el.id='viewer';el.className='viewer';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');document.body.appendChild(el)}
  document.body.style.overflow='hidden';
  const {d,url,dl,err}=S.viewer,k=fileKind(d);
  el.innerHTML=`<div class="viewer-box">
    <div class="viewer-h"><div style="min-width:0"><b>${esc(d.title)}</b><div class="muted" style="font-size:13px;overflow-wrap:anywhere">${esc(d.docType)} · ${esc(P(d.productId)?.name||'General')} · ${esc(d.fileName)}</div></div>
      <div class="chips">${url?`<a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener">Open in new tab</a><a class="btn sm" href="${esc(dl)}">Download</a>`:''}<button class="btn ghost sm" data-close-viewer>Close</button></div></div>
    <div class="viewer-body">${err?`<div class="gate-err">${esc(err)}</div>`:!url?'<div class="muted">Opening…</div>':
      k==='image'?`<img src="${esc(url)}" alt="${esc(d.title)}">`:
      k==='pdf'?`<iframe src="${esc(url)}" title="${esc(d.title)}"></iframe>`:
      `<div class="empty"><b>${esc(extOf(d))} files can't be previewed in the browser</b><br>Use Download to open it in Word, Excel or another app.</div>`}</div></div>`;
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
  const keep={};document.querySelectorAll('main input,main select').forEach(el=>{if(el.id&&el.type!=='file')keep[el.id]=el.value});
  $('#main').innerHTML=VIEWS[S.tab]();
  const locFormChanged=S._locFormFor!==S.editLoc;S._locFormFor=S.editLoc;
  for(const [id,v] of Object.entries(keep)){if(locFormChanged&&/^lc/.test(id))continue;const el=document.getElementById(id);if(el&&v!=='')el.value=v}
  syncMoveForm();updateSaleTotals();
  const c=$('#chat');if(c)c.scrollTop=c.scrollHeight;
}
function go(t){S.tab=t;S.armed=null;S.editLoc=null;try{localStorage.setItem('rins.tab',t)}catch(e){}render();window.scrollTo(0,0)}

/* ---------------- events ---------------- */
const TABLE_OF={products:'products',locations:'locations',movements:'movements',links:'links',documents:'documents'};
document.addEventListener('click',async e=>{
  if(e.target.closest('[data-close-viewer]')||e.target.id==='viewer')return closeViewer();
  const b=e.target.closest('[data-tab],[data-go],[data-del],[data-pin],[data-ask],[data-view],[data-editloc],[data-canceledit]');if(!b)return;
  if(b.dataset.view)return openDoc(b.dataset.view);
  if(b.dataset.editloc!==undefined){S.editLoc=b.dataset.editloc;S.armed=null;render();if(innerWidth<980)$('#fLoc')?.scrollIntoView({behavior:'smooth'});$('#lcName')?.focus();return}
  if(b.dataset.canceledit!==undefined){S.editLoc=null;render();return}
  if(b.dataset.tab)return go(b.dataset.tab);
  if(b.dataset.go)return go(b.dataset.go);
  if(b.dataset.ask){$('#askQ').value=b.dataset.ask;return ask(b.dataset.ask)}
  try{
    if(b.dataset.pin){const k=S.links.find(x=>x.id===b.dataset.pin);if(k)await write(sb.from('links').update({pinned:!k.pinned}).eq('id',k.id));return}
    if(b.dataset.del){const key=b.dataset.del;if(S.armed!==key){S.armed=key;render();return}
      S.armed=null;const i=key.indexOf('/'),coll=key.slice(0,i),id=key.slice(i+1);
      if(!TABLE_OF[coll])return;
      const doc=coll==='documents'?S.documents.find(x=>x.id===id):null;
      await write(sb.from(TABLE_OF[coll]).delete().eq('id',id));
      if(doc)await sb.storage.from('documents').remove([doc.filePath]);
      toast('Deleted')}
  }catch(err){S.armed=null;render();toast(err.message,1)}
});
document.addEventListener('change',e=>{if(e.target.id==='mvType')syncMoveForm();
  if(e.target.id==='slFrom')render();
  if(e.target.id==='dfProduct'){S.docFilter.product=e.target.value;render()}
  if(e.target.id==='dfType'){S.docFilter.type=e.target.value;render()}});
document.addEventListener('input',e=>{if(e.target.classList.contains('sl-qty'))updateSaleTotals();if(e.target.id==='dfQ'){S.docFilter.q=e.target.value;const pos=e.target.selectionStart;render();const q=$('#dfQ');if(q){q.focus();q.setSelectionRange(pos,pos)}}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.viewer)closeViewer()});
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
      const rows=[...document.querySelectorAll('.sl-qty')].map(i=>({id:i.id.slice(4),q:Math.floor(Number(i.value)||0)})).filter(x=>x.q>0)
        .map(x=>({type:'sale',date:d.date,product_id:x.id,from_loc:d.from,qty:x.q,price:P(x.id)?.price??0,note:(d.note||'').trim()}));
      if(!rows.length)throw new Error('Enter a quantity for at least one product.');
      await write(sb.from('movements').insert(rows));
      const units=rows.reduce((a,r)=>a+r.qty,0),total=rows.reduce((a,r)=>a+r.qty*r.price,0);
      document.querySelectorAll('.sl-qty').forEach(i=>i.value='');$('#slNote').value='';render();
      toast(`Sale saved: ${int(units)} unit${units===1?'':'s'}, ${bhd(total)} BHD`);
    }else if(f.id==='fLoc'){
      const row={name:d.name.trim(),chain:(d.chain||'').trim(),type:d.type,format:d.format||'',display:d.display||'none',stand:d.display==='stand',note:(d.note||'').trim()};
      const id=f.dataset.id;
      if(id){await write(sb.from('locations').update(row).eq('id',id));S.editLoc=null;render();toast('Location updated');return}
      await write(sb.from('locations').insert(row));
      toast('Location added');['lcName','lcNote'].forEach(id=>$('#'+id).value='');
    }else if(f.id==='fProd'){
      await write(sb.from('products').insert({name:d.name.trim(),sku:d.sku||'',line:d.line||'',price:d.price===''?null:Number(d.price),reorder_at:Number(d.reorderAt)||10,unit:d.unit||'',barcode:(d.barcode||'').trim()}));
      toast('Product added');['pdName','pdSku','pdLine','pdPrice','pdUnit','pdBarcode'].forEach(id=>$('#'+id).value='');
    }else if(f.id==='fDoc'){
      const file=$('#docFile').files[0];
      if(!file)throw new Error('Choose a file to upload.');
      if(file.size>MAX_FILE_MB*1048576)throw new Error(`This file is ${fmtSize(file.size)}. The limit is ${MAX_FILE_MB} MB.`);
      const safe=file.name.normalize('NFKD').replace(/[^\w.\-]+/g,'_').slice(-120)||'file';
      const path=`${(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2))}/${safe}`;
      const up=await sb.storage.from('documents').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
      if(up.error)throw new Error('Upload failed: '+up.error.message);
      const ins=await sb.from('documents').insert({title:d.title.trim(),doc_type:d.docType,product_id:d.product||null,reference:(d.reference||'').trim(),notes:(d.notes||'').trim(),file_path:path,file_name:file.name,file_type:file.type||'',file_size:file.size});
      if(ins.error){await sb.storage.from('documents').remove([path]);throw new Error(friendly(ins.error))}
      await loadAll();toast('Document uploaded');
      ['docTitle','docRef','docNote'].forEach(id=>$('#'+id).value='');$('#docFile').value='';
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
  if(!session){S.user=null;S.chat=[];Object.assign(S,{products:[],locations:[],movements:[],links:[],documents:[],viewer:null,loaded:false});renderViewer();gateSignIn();return}
  setTimeout(()=>enter(session),0);
});
sb.auth.getSession().then(({data})=>enter(data.session));
})();
