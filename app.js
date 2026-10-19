/* RINS Hub — self-hosted version (GitHub Pages + Supabase).
   Stock is never typed in directly: it is calculated from the movement log. */
(() => {
const ICONS = {
  overview:'<path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/>',
  inventory:'<path d="M21 8 12 3 3 8v8l9 5 9-5zM12 5.3 18.6 9 12 12.7 5.4 9zM5 10.7l6 3.4v6.2l-6-3.4zm8 9.6v-6.2l6-3.4v6.2z"/>',
  sales:'<path d="M3 17l6-6 4 4 8-8v4h2V3h-8v2h4l-6 6-4-4-8 8z"/><path d="M3 21h18v-2H3z"/>',
  locations:'<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>',
  products:'<path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM10 5h4v2h-4z"/>',
  distributors:'<path d="M3 5h11v9H3zm11 3h4l3 3v3h-7zM6.5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
  documents:'<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7zm1 7h-4V5h4zm-8 6h8v2H7zm0-4h10v2H7z"/>',
  calendar:'<path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3zm13 8H4v10h16zM4 10h16V6H4z"/>',
  analysis:'<path d="M4 18h16v2H4zm2-4h2v4H6zm4-6h2v10h-2zm4 3h2v7h-2zm4-8h2v15h-2z"/>',
  links:'<path d="M10.6 13.4a1 1 0 0 0 1.4 0l4-4a3 3 0 1 0-4.2-4.2l-1.5 1.5 1.4 1.4 1.5-1.5a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 0 0 1.4zm2.8-2.8a1 1 0 0 0-1.4 0l-4 4a3 3 0 1 0 4.2 4.2l1.5-1.5-1.4-1.4-1.5 1.5a1 1 0 1 1-1.4-1.4l4-4a1 1 0 0 0 0-1.4z"/>',
  assistant:'<path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2zM19 15l1 2.5 2.5 1-2.5 1L19 22l-1-2.5-2.5-1 2.5-1z"/>'
};
const TABS=[['overview','Overview'],['inventory','Inventory'],['sales','Sales'],['locations','Locations'],['distributors','Distributors'],['products','Products'],['documents','Documents'],['calendar','Calendar'],['analysis','Analysis'],['links','Links'],['assistant','Assistant']];
const TYPE_LABEL={in:'Stock in',transfer:'Transfer',sale:'Sale',return:'Return',adjust:'Adjustment'};
const LOC_TYPES={warehouse:'Warehouse',retail:'Retail store',online:'Online',b2b:'B2B client'};
const FORMATS=['Supermarket','To Go','Pharmacy','Other'];
const DISPLAYS={stand:'Stand',hanger:'Hanger',none:'No display'};
const TASK_CATS=['Sales','Operations','Production','Marketing','Finance & Admin','Meetings','Other'];
const catKey=c=>({'Sales':'sales','Operations':'ops','Production':'prod','Marketing':'mkt','Finance & Admin':'fin','Admin':'fin','Meetings':'meet'}[c]||'other');
const IMPORTANCE={high:'High',medium:'Medium',low:'Low'};
const MS_STATUSES=['Planned','In progress','At risk','Done'];
const REMIND_RULES={none:'No reminder',at:'At the due time',h1:'1 hour before',d1:'1 day before',m9:'On the day, 9:00'};
const DIST_STATUSES=['Prospect','Contacted','Negotiating','Active','Paused'];
const DOC_TYPES=['Barcode','Import quotation','Certificate','Invoice','Contract','Supplier document','Other'];
const MAX_FILE_MB=20;
const S={tasks:[],milestones:[],tasksReady:true,emailStatus:null,cal:null,calTab:'calendar',editTask:null,editMs:null,levels:[],levelsReady:true,alertLog:[],alertStatus:null,editLoc:null,editProd:null,editDist:null,distributors:[],distReady:true,distFilter:'',imgUrls:{},tab:'overview',products:[],locations:[],movements:[],links:[],documents:[],docsReady:true,docFilter:{q:'',product:'',type:''},viewer:null,chat:[],armed:null,loaded:false,user:null};
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
  products:r=>({id:r.id,name:r.name,sku:r.sku||'',line:r.line||'',price:r.price===null?null:Number(r.price),reorderAt:r.reorder_at,unit:r.unit||'',barcode:r.barcode||'',imagePath:r.image_path||'',createdAt:Date.parse(r.created_at)||0}),
  locations:r=>({id:r.id,name:r.name,type:r.type,chain:r.chain||'',format:r.format||'',display:r.display||(r.stand?'stand':'none'),note:r.note||'',createdAt:Date.parse(r.created_at)||0}),
  movements:r=>({id:r.id,type:r.type,date:r.date,product:r.product_id,from:r.from_loc,to:r.to_loc,qty:r.qty,price:r.price===null?null:Number(r.price),note:r.note||'',createdAt:Date.parse(r.created_at)||0}),
  documents:r=>({id:r.id,title:r.title,docType:r.doc_type||'Other',productId:r.product_id||'',reference:r.reference||'',notes:r.notes||'',filePath:r.file_path,fileName:r.file_name||'',fileType:r.file_type||'',fileSize:Number(r.file_size)||0,createdAt:Date.parse(r.created_at)||0}),
  distributors:r=>({id:r.id,name:r.name,country:r.country||'',city:r.city||'',contact:r.contact_name||'',phone:r.phone||'',email:r.email||'',status:r.status||'Prospect',terms:r.terms||'',lastContact:r.last_contact||'',nextStep:r.next_step||'',notes:r.notes||'',createdAt:Date.parse(r.created_at)||0}),
  stock_levels:r=>({locationId:r.location_id,productId:r.product_id,keep:Number(r.keep_qty)||0,alert:Number(r.alert_qty)||0}),
  tasks:r=>({id:r.id,title:r.title,date:r.due_date,time:r.due_time?r.due_time.slice(0,5):'',category:r.category||'Other',importance:r.importance||'medium',notes:r.notes||'',done:!!r.done,milestoneId:r.milestone_id||'',remindRule:r.remind_rule||'none',remindAt:r.remind_at,remindTg:!!r.remind_telegram,remindEmail:!!r.remind_email,remindedAt:r.reminded_at,createdAt:Date.parse(r.created_at)||0}),
  milestones:r=>({id:r.id,title:r.title,date:r.target_date||'',start:r.start_date||'',category:r.category||'Operations',status:r.status||'Planned',description:r.description||'',createdAt:Date.parse(r.created_at)||0}),
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
/* Product photos live privately in the documents storage folder; show them with short-lived links */
async function signProductImages(products){
  const paths=[...new Set(products.map(p=>p.imagePath).filter(Boolean))].filter(x=>!S.imgUrls[x]||S.imgUrls[x].exp<Date.now()+300000);
  if(!paths.length)return;
  const {data,error}=await sb.storage.from('documents').createSignedUrls(paths,3600);
  if(error||!data)return;
  for(const r of data)if(r.signedUrl)S.imgUrls[r.path]={url:r.signedUrl,exp:Date.now()+3600000};
}
const initials=n=>String(n||'?').split(/\s+/).filter(w=>/^[a-z0-9]/i.test(w)).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'?';
function productThumb(p,cls='thumb'){
  const u=p.imagePath&&S.imgUrls[p.imagePath]?.url;
  return u?`<img class="${cls}" src="${esc(u)}" alt="${esc(p.name)}" loading="lazy">`
    :`<span class="${cls} thumb-ph" aria-label="No photo yet"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 5h3l2-2h6l2 2h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm8 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg><b>${esc(initials(p.name))}</b></span>`;
}
async function uploadProductPhoto(productId,file){
  if(!/^image\//.test(file.type))throw new Error('Choose an image file (JPG, PNG or WebP).');
  if(file.size>MAX_FILE_MB*1048576)throw new Error(`This photo is ${fmtSize(file.size)}. The limit is ${MAX_FILE_MB} MB.`);
  const safe=file.name.normalize('NFKD').replace(/[^\w.\-]+/g,'_').slice(-80)||'photo';
  const path=`product-photos/${productId}/${Date.now().toString(36)}-${safe}`;
  const up=await sb.storage.from('documents').upload(path,file,{contentType:file.type,upsert:false});
  if(up.error)throw new Error('Photo upload failed: '+up.error.message);
  const old=P(productId)?.imagePath;
  const {error}=await sb.from('products').update({image_path:path}).eq('id',productId);
  if(error){await sb.storage.from('documents').remove([path]);throw new Error(friendly(error))}
  if(old)await sb.storage.from('documents').remove([old]);
}
function readLevels(){
  const ins=document.querySelectorAll('[id^="lck-"]');if(!ins.length)return null;
  return [...ins].map(i=>{const pid=i.id.slice(4),a=$('#lca-'+CSS.escape(pid));
    return {productId:pid,keep:Math.max(0,Math.floor(Number(i.value)||0)),alert:Math.max(0,Math.floor(Number(a?.value)||0))}});
}
async function saveLevels(locIds,levels){
  const up=[],delP=[];
  for(const lv of levels){if(lv.keep||lv.alert)for(const loc of locIds)up.push({location_id:loc,product_id:lv.productId,keep_qty:lv.keep,alert_qty:lv.alert});else delP.push(lv.productId)}
  if(up.length){const {error}=await sb.from('stock_levels').upsert(up,{onConflict:'location_id,product_id'});if(error)throw new Error(friendly(error))}
  if(delP.length){const {error}=await sb.from('stock_levels').delete().in('location_id',locIds).in('product_id',delP);if(error)throw new Error(friendly(error))}
}
async function loadAll(){
  try{
    const [products,locations,movements,links]=await Promise.all(['products','locations','movements','links'].map(fetchAll));
    let documents=[],docsReady=true,distributors=[],distReady=true;
    try{documents=await fetchAll('documents')}catch(_){docsReady=false}
    try{distributors=await fetchAll('distributors')}catch(_){distReady=false}
    let tasks=[],milestones=[],tasksReady=true,emailStatus=null;
    try{[tasks,milestones]=await Promise.all([fetchAll('tasks'),fetchAll('milestones')]);const es=await sb.rpc('email_status');emailStatus=es.error?null:es.data}catch(_){tasksReady=false}
    let levels=[],levelsReady=true,alertLog=[],alertStatus=null;
    try{levels=await fetchAll('stock_levels')}catch(_){levelsReady=false}
    if(levelsReady){
      const [al,st]=await Promise.all([sb.from('stock_alerts').select('*').order('created_at',{ascending:false}).limit(15),sb.rpc('alert_status')]);
      alertLog=al.data||[];alertStatus=st.error?null:st.data;
    }
    await signProductImages(products);
    Object.assign(S,{products,locations,movements,links,documents,docsReady,distributors,distReady,levels,levelsReady,alertLog,alertStatus,tasks,milestones,tasksReady,emailStatus,loaded:true});render();
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

/* Stock levels: how much to keep at each branch and when to alert */
const LV=(loc,prod)=>S.levels.find(x=>x.locationId===loc&&x.productId===prod);
function levelState(q,lv){if(!lv||(!lv.keep&&!lv.alert))return'';if(lv.alert&&q<=lv.alert)return q<=0?'out':'low';if(lv.keep&&q<lv.keep)return'under';return'ok'}
function refillList(){
  const sm=stockMap(),out=[];
  for(const lv of S.levels){const l=L(lv.locationId),p=P(lv.productId);if(!l||!p)continue;
    const q=(sm[p.id]||{})[l.id]||0,st=levelState(q,lv);
    if(st==='out'||st==='low'||st==='under')out.push({l,p,q,lv,st,send:Math.max(0,lv.keep-q)})}
  const rank={out:0,low:1,under:2};
  return out.sort((a,b)=>rank[a.st]-rank[b.st]||b.send-a.send||a.l.name.localeCompare(b.l.name));
}
function viewOverview(){
  const sm=stockMap(),mth=month(),ms=sales().filter(v=>(v.date||'').startsWith(mth));
  const units=ms.reduce((a,v)=>a+(Number(v.qty)||0),0),rev=ms.reduce((a,v)=>a+saleValue(v),0);
  let total=0,inStores=0;
  for(const p in sm)for(const l in sm[p]){total+=sm[p][l];if(L(l)?.type==='retail')inStores+=sm[p][l]}
  const alerts=refillList().filter(r=>r.st!=='under').map(r=>({p:r.p,l:r.l,q:r.q,c:r.st}));
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
        :`<div class="alert"><span>${S.levels.length?'No branch is at its alert level.':'Set stock levels per branch on the Locations page to get alerts.'}</span><span class="pill p-ok">All good</span></div>`}
      </section>
      ${S.tasks.length?`<section class="panel"><div class="panel-h"><h2>Upcoming tasks</h2><button class="btn ghost sm" data-go="calendar">Calendar</button></div>
        <div class="task-list compact">${S.tasks.filter(t=>!t.done&&t.date<=isoDate(new Date(Date.now()+6*86400000))).sort((a,b)=>a.date.localeCompare(b.date)||taskSort(a,b)).slice(0,6).map(t=>taskRow(t,true)).join('')||'<div class="muted" style="font-size:13px">Nothing due in the next 7 days.</div>'}</div></section>`:''}
      <section class="panel"><div class="panel-h"><h2>Quick links</h2><button class="btn ghost sm" data-go="links">All links</button></div>
        ${quick.length?`<div class="alerts">${quick.map(k=>`<div class="alert"><a href="${esc(k.url)}" target="_blank" rel="noopener" style="color:var(--fg);font-weight:600">${esc(k.title)}</a><span class="muted" style="font-size:12px">${esc(k.category)}</span></div>`).join('')}</div>`
        :emptyBox('No pinned links','Pin your most used links on the Links page and they show up here.')}
      </section>
    </div>
  </div>`;
}

function viewRefillAndAlerts(){
  if(!S.levelsReady)return `<div class="banner" style="margin-top:16px">Stock levels and WhatsApp alerts aren't set up yet. Run <b>supabase/stock-alerts.sql</b> in the Supabase SQL Editor, then reload.</div>`;
  const list=refillList(),st=S.alertStatus;
  const pillTxt={out:'Empty',low:'Alert',under:'Below target'};
  const via=st&&st.provider==='callmebot'?`WhatsApp, number ending ${esc(st.phone_end)}`:'Telegram';
  const wa=!st?'<span class="pill p-out">Unknown</span>':st.enabled&&st.configured?`<span class="pill p-ok">On</span> <span class="muted" style="font-size:13px">via ${via}</span>`:'<span class="pill p-low">Off</span> <span class="muted" style="font-size:13px">finish the alert setup in the guide</span>';
  return `<div class="grid g-side" style="margin-top:16px">
   <section class="panel"><div class="panel-h"><h2>Refill list</h2><span class="muted" style="font-size:13px">${list.length?`${list.length} to refill`:'Branches compared with their stock levels'}</span></div>
    ${list.length?`<div class="tbl"><table><thead><tr><th>Branch</th><th>Product</th><th class="num">Have</th><th class="num">Keep</th><th class="num">Send</th><th></th></tr></thead><tbody>${list.map(r=>`<tr>
      <td><b>${esc(r.l.name)}</b><div><span class="pill p-${r.st==='under'?'transfer':r.st}">${pillTxt[r.st]}</span></div></td><td>${esc(r.p.name)}</td>
      <td class="num ${r.st==='out'?'cell-out':r.st==='low'?'cell-low':''}">${int(r.q)}</td><td class="num">${int(r.lv.keep)}</td><td class="num"><b>${int(r.send)}</b></td>
      <td class="num">${r.send?`<button class="btn ghost sm" data-refill="${esc(r.l.id)}|${esc(r.p.id)}|${r.send}">Record delivery</button>`:''}</td></tr>`).join('')}</tbody></table></div>`
    :emptyBox(S.levels.length?'Every branch is stocked':'No stock levels set yet',S.levels.length?'Nothing needs refilling right now.':'Open a branch on the Locations page, click Edit, and set how much to keep and when to alert.')}
   </section>
   <section class="panel" style="align-self:start"><div class="panel-h"><h2>Phone alerts</h2><div>${wa}</div></div>
    <p class="muted" style="font-size:13px;margin:0 0 12px">One message when a product drops to a branch's alert level. It won't repeat until the branch is refilled.</p>
    <button class="btn ghost sm" data-testwa>Send test message</button>
    <h3 class="sub">Recent alerts</h3>
    ${S.alertLog.length?`<div class="alerts">${S.alertLog.map(a=>`<div class="alert alert-log"><span><b>${esc(L(a.location_id)?.name||'Branch')}</b> · ${esc(P(a.product_id)?.name||'Product')} · ${int(a.qty)} left${a.status!=='sent'?' <span class="muted">(not sent: alerts off)</span>':''}</span><span class="muted">${esc(new Date(a.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</span></div>`).join('')}</div>`
    :'<div class="muted" style="font-size:13px">No alerts yet.</div>'}
   </section>
  </div>`;
}
function viewInventory(){
  const sm=stockMap(),locs=byName(S.locations),prods=byName(S.products);
  const locOrder=[...locs].sort((a,b)=>(a.type!=='warehouse')-(b.type!=='warehouse')||(a.chain||'').localeCompare(b.chain||'')||a.name.localeCompare(b.name));
  const matrix=prods.length&&locs.length?`<div class="tbl"><table class="stock-matrix"><thead><tr><th>Location</th>${prods.map(p=>`<th class="num">${esc(p.name)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${locOrder.map(l=>{let t=0;return `<tr><td><b>${esc(l.name)}</b>${l.chain?`<div class="muted" style="font-size:12px">${esc([l.chain,l.format].filter(Boolean).join(' · '))}</div>`:''}</td>${prods.map(p=>{const q=(sm[p.id]||{})[l.id]||0;t+=q;const st=levelState(q,LV(l.id,p.id)),c=st==='out'?'cell-out':st==='low'?'cell-low':'';return `<td class="num ${c}">${int(q)}</td>`}).join('')}<td class="num"><b>${int(t)}</b></td></tr>`}).join('')}</tbody><tfoot><tr><td><b>All locations</b></td>${prods.map(p=>`<td class="num"><b>${int(Object.values(sm[p.id]||{}).reduce((a,b)=>a+b,0))}</b></td>`).join('')}<td class="num"><b>${int(Object.values(sm).reduce((a,o)=>a+Object.values(o).reduce((x,y)=>x+y,0),0))}</b></td></tr></tfoot></table></div>`
    :emptyBox('No products or locations yet','Add them on the Products and Locations pages first.');
  const log=[...S.movements].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.createdAt-a.createdAt);
  return header('Inventory','Stock by location')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Current stock</h2><span class="muted" style="font-size:13px">Amber is at the branch's alert level, red is empty</span></div>${matrix}</section>
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
  ${viewRefillAndAlerts()}
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
        <span class="sl-name">${productThumb(p,'sl-thumb')}<b>${esc(p.name)}</b>${p.unit?`<span class="muted">${esc(p.unit)}</span>`:''}${have!==null?`<span class="${have<0?'cell-out':'muted'}">${int(have)} in stock here</span>`:''}</span>
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

function locStatus(l,sm){
  const lvs=S.levels.filter(x=>x.locationId===l.id&&(x.keep||x.alert));
  if(!lvs.length)return '<span class="muted" style="font-size:12px">No levels</span>';
  const sts=lvs.map(lv=>levelState((sm[lv.productId]||{})[l.id]||0,lv));
  if(sts.includes('out'))return '<span class="pill p-out">Empty</span>';
  if(sts.includes('low'))return '<span class="pill p-low">Alert</span>';
  if(sts.includes('under'))return '<span class="pill p-transfer">Below target</span>';
  return '<span class="pill p-ok">Stocked</span>';
}
function levelsEditor(e){
  const prods=byName(S.products);
  if(!S.levelsReady)return `<div class="muted" style="font-size:13px">Run <b>supabase/stock-alerts.sql</b> to set stock levels per branch.</div>`;
  if(!prods.length)return '';
  const same=e?S.locations.filter(x=>x.id!==e.id&&x.chain&&x.chain===e.chain&&x.format===e.format):[];
  return `<fieldset class="levels"><legend>Stock to keep here</legend>
    <div class="lv-head"><span>Product</span><span class="num">Keep</span><span class="num">Alert at</span></div>
    ${prods.map(p=>{const lv=e?LV(e.id,p.id):null;return `<div class="lv-row"><span class="lv-name">${productThumb(p,'sl-thumb')}<b>${esc(p.name)}</b></span>
      <input id="lck-${esc(p.id)}" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${lv&&lv.keep?lv.keep:''}" aria-label="Keep of ${esc(p.name)}">
      <input id="lca-${esc(p.id)}" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${lv&&lv.alert?lv.alert:''}" aria-label="Alert level of ${esc(p.name)}"></div>`}).join('')}
    <p class="muted" style="font-size:12px;margin:6px 0 0">Keep: the stock you aim to have on the shelf. Alert at: send a phone alert when stock drops to this number. Leave both empty for products you don't place here.</p>
    ${same.length?`<label class="check"><input type="checkbox" id="lcApply" name="applySame"> Also apply these levels to the other ${same.length} ${esc(e.chain)} ${esc(e.format||'')} branch${same.length===1?'':'es'}</label>`:''}
  </fieldset>`;
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
     <div class="tbl"><table><thead><tr><th>Branch</th><th>Format</th><th>Display</th><th class="num">Stock</th><th>Status</th><th></th></tr></thead><tbody>${ls.map(l=>`<tr class="${S.editLoc===l.id?'row-editing':''}">
       <td><b>${esc(l.name)}</b>${l.note?`<div class="muted" style="font-size:12px">${esc(l.note)}</div>`:''}</td>
       <td>${esc(l.format||LOC_TYPES[l.type]||l.type)}</td>
       <td><span class="pill p-disp-${esc(l.display)}">${esc(DISPLAYS[l.display]||'No display')}</span></td>
       <td class="num">${int(stockAt(l.id))}</td>
       <td>${locStatus(l,sm)}</td>
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
      ${levelsEditor(e)}
      <button class="btn" type="submit">${e?'Save changes':'Add location'}</button>
    </form>
    <p class="muted" style="font-size:13px;margin:12px 0 0">Stand: the 165 cm free-standing unit. Hanger: hanging display strip, used at To Go branches.</p>
   </section>
  </div>`;
}
function viewProducts(){
  const prods=byName(S.products),e=S.editProd?P(S.editProd):null;
  const v=k=>esc(e?(e[k]??''):'');
  return header('Products','Product list')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Products</h2><span class="muted" style="font-size:13px">${prods.length} product${prods.length===1?'':'s'}</span></div>
    ${prods.length?`<div class="prod-grid">${prods.map(p=>`<article class="prod-card${S.editProd===p.id?' editing':''}">
      <label class="prod-photo" title="${p.imagePath?'Change photo':'Add photo'}">${productThumb(p,'prod-img')}
        <span class="prod-photo-btn">${p.imagePath?'Change photo':'Add photo'}</span>
        <input type="file" accept="image/*" data-photo-for="${esc(p.id)}" hidden></label>
      <div class="prod-body">
        <b>${esc(p.name)}</b>
        ${p.unit?`<span class="muted">${esc(p.unit)}</span>`:''}
        <span class="prod-price">${p.price!==null?bhd(p.price)+' <small>BHD</small>':'<span class="muted">No price</span>'}</span>
        <span class="muted mono prod-codes">${p.sku?`SKU ${esc(p.sku)}`:''}${p.sku&&p.barcode?' · ':''}${p.barcode?`Barcode ${esc(p.barcode)}`:''}</span>
        ${p.line?`<span class="pill p-transfer" style="align-self:flex-start">${esc(p.line)}</span>`:''}
      </div>
      <div class="prod-actions"><button class="x" data-editprod="${esc(p.id)}">Edit</button>${del('products',p.id)}</div>
    </article>`).join('')}</div>`
    :emptyBox('No products yet','Add each item you sell, one row per colour or pack size.')}
   </section>
   <section class="panel" style="align-self:start"><div class="panel-h"><h2>${e?'Edit product':'Add a product'}</h2>${e?'<button class="btn ghost sm" data-canceleditprod>Cancel</button>':''}</div>
    <form class="f" id="fProd" data-id="${e?esc(e.id):''}">
      <label>Name<input id="pdName" name="name" required value="${v('name')}" placeholder="e.g. Pocket Bidet Blue"></label>
      <div class="row"><label>SKU<input id="pdSku" name="sku" value="${v('sku')}" placeholder="Optional"></label>
      <label>Line<input id="pdLine" name="line" value="${v('line')}" placeholder="Pocket Bidet / Classic Fusion"></label></div>
      <div class="row"><label>Retail price (BHD)<input id="pdPrice" type="number" name="price" min="0" step="0.001" value="${e?(e.price??''):'1.99'}"></label>
      <label>Barcode<input id="pdBarcode" name="barcode" value="${v('barcode')}" placeholder="Optional barcode"></label></div>
      <label>Pack / unit<input id="pdUnit" name="unit" value="${v('unit')}" placeholder="e.g. Pack of 4 caps"></label>
      <label>Photo<input id="pdPhoto" type="file" name="photo" accept="image/*"></label>
      <button class="btn" type="submit">${e?'Save changes':'Add product'}</button>
    </form></section>
  </div>`;
}

/* Distributors: partners who buy and resell RINS, tracked from first contact to active */
function viewDistributors(){
  if(!S.distReady)return header('Distributors','Distribution partners')+
    `<div class="banner">The distributors list isn't set up yet. Run <b>supabase/products-distributors.sql</b> in the Supabase SQL Editor, then reload this page.</div>`;
  const all=[...S.distributors].sort((a,b)=>DIST_STATUSES.indexOf(a.status)-DIST_STATUSES.indexOf(b.status)||a.name.localeCompare(b.name));
  const list=S.distFilter?all.filter(d=>d.status===S.distFilter):all;
  const e=S.editDist?S.distributors.find(d=>d.id===S.editDist):null;
  const v=k=>esc(e?(e[k]??''):'');
  const count=st=>all.filter(d=>d.status===st).length;
  return header('Distributors','Distribution partners')+
  `<div class="grid g-side">
   <section class="panel"><div class="panel-h"><h2>Partners</h2>
     <div class="chips"><button class="chip${S.distFilter?'':' on'}" data-distfilter="">All ${all.length}</button>${DIST_STATUSES.map(st=>`<button class="chip${S.distFilter===st?' on':''}" data-distfilter="${st}">${st} ${count(st)}</button>`).join('')}</div></div>
    ${list.length?`<div class="dist-list">${list.map(d=>`<article class="dist-card${S.editDist===d.id?' editing':''}">
      <div class="dist-top"><div style="min-width:0"><b>${esc(d.name)}</b><div class="muted" style="font-size:13px">${esc([d.city,d.country].filter(Boolean).join(', ')||'Location not set')}</div></div>
        <span class="pill st-${esc(d.status.toLowerCase())}">${esc(d.status)}</span></div>
      <div class="dist-info">
        ${d.contact?`<span><span class="muted">Contact</span> ${esc(d.contact)}</span>`:''}
        ${d.phone?`<span><span class="muted">Phone</span> <span class="mono">${esc(d.phone)}</span></span>`:''}
        ${d.email?`<span><span class="muted">Email</span> ${esc(d.email)}</span>`:''}
        ${d.terms?`<span><span class="muted">Terms</span> ${esc(d.terms)}</span>`:''}
        ${d.lastContact?`<span><span class="muted">Last contact</span> ${esc(new Date(d.lastContact+'T00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}))}</span>`:''}
      </div>
      ${d.nextStep?`<div class="dist-next"><b>Next step</b> ${esc(d.nextStep)}</div>`:''}
      ${d.notes?`<div class="muted" style="font-size:13px">${esc(d.notes)}</div>`:''}
      <div class="prod-actions"><button class="x" data-editdist="${esc(d.id)}">Edit</button>${del('distributors',d.id)}</div>
    </article>`).join('')}</div>`
    :emptyBox(all.length?'No partners with this status':'No distributors yet',all.length?'Choose another status above.':'Add wholesalers, importers or regional partners you are talking to, and track each one from first contact to active.')}
   </section>
   <section class="panel" style="align-self:start"><div class="panel-h"><h2>${e?'Edit distributor':'Add a distributor'}</h2>${e?'<button class="btn ghost sm" data-canceleditdist>Cancel</button>':''}</div>
    <form class="f" id="fDist" data-id="${e?esc(e.id):''}">
      <label>Company name<input id="dsName" name="name" required value="${v('name')}" placeholder="e.g. Gulf Travel Supplies"></label>
      <div class="row"><label>Country<input id="dsCountry" name="country" value="${v('country')}" placeholder="e.g. Saudi Arabia"></label>
      <label>City<input id="dsCity" name="city" value="${v('city')}" placeholder="e.g. Dammam"></label></div>
      <div class="row"><label>Contact person<input id="dsContact" name="contact" value="${v('contact')}"></label>
      <label>Status<select id="dsStatus" name="status">${DIST_STATUSES.map(st=>`<option ${(e?e.status:'Prospect')===st?'selected':''}>${st}</option>`).join('')}</select></label></div>
      <div class="row"><label>Phone<input id="dsPhone" name="phone" type="tel" value="${v('phone')}"></label>
      <label>Email<input id="dsEmail" name="email" type="email" value="${v('email')}"></label></div>
      <div class="row"><label>Terms<input id="dsTerms" name="terms" value="${v('terms')}" placeholder="e.g. 30% margin, MOQ 500"></label>
      <label>Last contact<input id="dsLast" name="lastContact" type="date" value="${v('lastContact')}"></label></div>
      <label>Next step<input id="dsNext" name="nextStep" value="${v('nextStep')}" placeholder="e.g. Send samples and price list"></label>
      <label>Notes<textarea id="dsNotes" name="notes" rows="3">${v('notes')}</textarea></label>
      <button class="btn" type="submit">${e?'Save changes':'Add distributor'}</button>
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

/* ---------- Calendar: tasks by importance and category, plus the milestone map ---------- */
const isoDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fmtDay=iso=>new Date(iso+'T00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
const IMP_RANK={high:0,medium:1,low:2};
const taskSort=(a,b)=>(a.done-b.done)||IMP_RANK[a.importance]-IMP_RANK[b.importance]||(a.time||'99').localeCompare(b.time||'99')||a.title.localeCompare(b.title);
function calState(){if(!S.cal){const t=new Date();S.cal={y:t.getFullYear(),m:t.getMonth(),sel:today()}}return S.cal}
function computeRemindAt(date,time,rule){
  if(!date||rule==='none')return null;
  const [y,mo,d]=date.split('-').map(Number);const [hh,mm]=(time||'09:00').split(':').map(Number);
  let at=new Date(y,mo-1,d,hh,mm);
  if(rule==='h1')at=new Date(at.getTime()-3600000);
  else if(rule==='d1')at=new Date(at.getTime()-86400000);
  else if(rule==='m9')at=new Date(y,mo-1,d,9,0);
  return at.toISOString();
}
const taskChip=t=>`<span class="tchip cat-${catKey(t.category)}${t.done?' done':''}" title="${esc(t.title)} · ${esc(IMPORTANCE[t.importance])} · ${esc(t.category)}">${t.importance==='high'?'<i class="imp">!</i>':''}${esc(t.title)}</span>`;
function taskRow(t,showDate){
  const ms=t.milestoneId?S.milestones.find(m=>m.id===t.milestoneId):null;
  const remind=t.remindRule!=='none'&&(t.remindTg||t.remindEmail)?`<span class="muted task-rem">Reminder${t.remindedAt?' sent':''}: ${esc(REMIND_RULES[t.remindRule].toLowerCase())}${t.remindTg?' · Telegram':''}</span>`:'';
  return `<div class="task cat-${catKey(t.category)}${t.done?' done':''}">
    <input type="checkbox" class="t-done" data-taskdone="${esc(t.id)}" ${t.done?'checked':''} aria-label="Mark ${esc(t.title)} done">
    <div class="task-main"><b>${esc(t.title)}</b>
      <span class="task-meta"><span class="catdot"></span>${esc(t.category)} <span class="pill imp-${t.importance}">${IMPORTANCE[t.importance]}</span>${showDate?` <span class="mono">${esc(fmtDay(t.date))}</span>`:''}${t.time?` <span class="mono">${esc(t.time)}</span>`:''}${ms?` <span class="muted">◆ ${esc(ms.title)}</span>`:''}</span>
      ${t.notes?`<span class="muted task-notes">${esc(t.notes)}</span>`:''}${remind}</div>
    <div class="task-actions"><button class="x" data-edittask="${esc(t.id)}">Edit</button>${del('tasks',t.id)}</div></div>`;
}
function viewCalendar(){
  const tabs=`<div class="seg" role="tablist"><button role="tab" aria-selected="${S.calTab==='calendar'}" data-caltab="calendar">Calendar</button><button role="tab" aria-selected="${S.calTab==='milestones'}" data-caltab="milestones">Milestone map</button></div>`;
  if(!S.tasksReady)return header('Calendar','Plan and track',tabs)+`<div class="banner">Tasks and milestones aren't set up yet. Run <b>supabase/tasks-milestones.sql</b> in the Supabase SQL Editor, then reload.</div>`;
  return S.calTab==='milestones'?viewMilestones(tabs):viewMonth(tabs);
}
function viewMonth(tabs){
  const c=calState(),first=new Date(c.y,c.m,1),startDay=(first.getDay()+6)%7,days=new Date(c.y,c.m+1,0).getDate(),todayIso=today();
  const byDay={};for(const t of S.tasks)(byDay[t.date]??=[]).push(t);
  const msByDay={};for(const m of S.milestones)if(m.date)(msByDay[m.date]??=[]).push(m);
  const mvByDay={};for(const v of S.movements)if(v.date)mvByDay[v.date]=(mvByDay[v.date]||0)+1;
  const cells=[];for(let i=0;i<startDay;i++)cells.push(null);for(let d=1;d<=days;d++)cells.push(isoDate(new Date(c.y,c.m,d)));while(cells.length%7)cells.push(null);
  const monthName=first.toLocaleString('en-US',{month:'long',year:'numeric'});
  const sel=c.sel,selTasks=(byDay[sel]||[]).sort(taskSort),selMs=msByDay[sel]||[];
  const open=S.tasks.filter(t=>!t.done&&t.date<=isoDate(new Date(Date.now()+13*86400000))).sort((a,b)=>a.date.localeCompare(b.date)||taskSort(a,b));
  const overdue=open.filter(t=>t.date<todayIso),upcoming=open.filter(t=>t.date>=todayIso);
  const e=S.editTask?S.tasks.find(t=>t.id===S.editTask):null;
  const fv=(k,def='')=>esc(e?(e[k]??def):def);
  return header('Calendar','Plan and track',tabs)+
  `<div class="grid g-cal">
   <section class="panel">
    <div class="panel-h"><h2>${esc(monthName)}</h2><div class="chips"><button class="btn ghost sm" data-calnav="-1" aria-label="Previous month">‹</button><button class="btn ghost sm" data-calnav="0">Today</button><button class="btn ghost sm" data-calnav="1" aria-label="Next month">›</button></div></div>
    <div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="cal-head">${d}</div>`).join('')}${cells.map(iso=>{
      if(!iso)return '<div class="cal-day empty"></div>';
      const ts=(byDay[iso]||[]).sort(taskSort),ms=msByDay[iso]||[],mv=mvByDay[iso]||0,shown=ts.slice(0,3);
      return `<button class="cal-day${iso===todayIso?' today':''}${iso===sel?' sel':''}" data-calday="${iso}" aria-label="${esc(fmtDay(iso))}: ${ts.length} task${ts.length===1?'':'s'}">
        <span class="cal-date">${Number(iso.slice(8))}${mv?`<span class="mvdot" title="${mv} stock movement${mv===1?'':'s'}"></span>`:''}</span>
        ${ms.map(m=>`<span class="mschip cat-${catKey(m.category)}">◆ ${esc(m.title)}</span>`).join('')}
        ${shown.map(taskChip).join('')}${ts.length>3?`<span class="more">+${ts.length-3} more</span>`:''}</button>`}).join('')}</div>
    <div class="legend">${TASK_CATS.map(k=>`<span class="cat-${catKey(k)}"><span class="catdot"></span>${esc(k)}</span>`).join('')}<span><i class="imp">!</i> High importance</span><span><span class="mvdot"></span> Stock activity</span></div>
   </section>
   <div class="grid" style="align-content:start">
    <section class="panel"><div class="panel-h"><h2>${esc(fmtDay(sel))}</h2><span class="muted" style="font-size:13px">${selTasks.length} task${selTasks.length===1?'':'s'}</span></div>
     ${selMs.map(m=>`<div class="ms-inline cat-${catKey(m.category)}"><b>◆ ${esc(m.title)}</b> <span class="pill ms-${m.status.toLowerCase().replace(/\s/g,'')}">${esc(m.status)}</span></div>`).join('')}
     ${selTasks.length?`<div class="task-list">${selTasks.map(t=>taskRow(t,false)).join('')}</div>`:`<div class="muted" style="font-size:13px">Nothing planned. Add a task below.</div>`}
    </section>
    <section class="panel"><div class="panel-h"><h2>${e?'Edit task':'Add a task'}</h2>${e?'<button class="btn ghost sm" data-canceledittask>Cancel</button>':''}</div>
     <form class="f" id="fTask" data-id="${e?esc(e.id):''}">
      <label>Task<input id="tkTitle" name="title" required value="${fv('title')}" placeholder="e.g. Deliver stand to Alosra Saar"></label>
      <div class="row"><label>Date<input id="tkDate" type="date" name="date" required value="${e?esc(e.date):esc(sel)}"></label>
      <label>Time<input id="tkTime" type="time" name="time" value="${fv('time')}"></label></div>
      <div class="row"><label>Importance<select id="tkImp" name="importance">${Object.entries(IMPORTANCE).map(([k,v])=>`<option value="${k}" ${(e?e.importance:'medium')===k?'selected':''}>${v}</option>`).join('')}</select></label>
      <label>Type of work<select id="tkCat" name="category">${TASK_CATS.map(k=>`<option ${(e?e.category:'Operations')===k?'selected':''}>${esc(k)}</option>`).join('')}</select></label></div>
      <label>Milestone<select id="tkMs" name="milestone"><option value="">None</option>${S.milestones.map(m=>`<option value="${esc(m.id)}" ${e&&e.milestoneId===m.id?'selected':''}>${esc(m.title)}</option>`).join('')}</select></label>
      <label>Notes<input id="tkNotes" name="notes" value="${fv('notes')}" placeholder="Details, contact, address"></label>
      <fieldset class="levels"><legend>Reminder</legend>
       <select id="tkRule" name="rule" aria-label="When to remind">${Object.entries(REMIND_RULES).map(([k,v])=>`<option value="${k}" ${(e?e.remindRule:'none')===k?'selected':''}>${v}</option>`).join('')}</select>
       <p class="muted" style="font-size:12px;margin:6px 0 0">Sent to you on Telegram.</p>
      </fieldset>
      <button class="btn" type="submit">${e?'Save changes':'Add task'}</button>
     </form>
    </section>
   </div>
  </div>
  <section class="panel" style="margin-top:16px"><div class="panel-h"><h2>Next two weeks</h2><span class="muted" style="font-size:13px">${overdue.length?`<span class="cell-out">${overdue.length} overdue</span> · `:''}${upcoming.length} open</span></div>
   ${open.length?`<div class="task-list">${[...overdue,...upcoming].map(t=>taskRow(t,true)).join('')}</div>`:emptyBox('Nothing open','Tasks for the next two weeks show here, with anything overdue first.')}
  </section>
  ${viewReminderSettings()}`;
}
function viewReminderSettings(){
  const st=S.alertStatus,es=S.emailStatus;
  const tg=st&&st.enabled&&st.configured?'<span class="pill p-ok">On</span>':'<span class="pill p-low">Off</span>';
  return `<section class="panel" style="margin-top:16px"><div class="panel-h"><h2>Reminders</h2></div>
   <div><b>Telegram</b> ${tg}<div style="margin-top:8px"><button class="btn ghost sm" data-testwa>Send test message</button></div></div>
   <p class="muted" style="font-size:13px;margin:12px 0 0">Reminders are checked every minute and sent once. Changing a task's date, time or reminder sets it to send again.</p></section>`;
}
/* Milestone map: vertical timeline (year > quarter > milestones), editable in place */
const QMONTHS=['Jan–Mar','Apr–Jun','Jul–Sep','Oct–Dec'];
const qOf=iso=>{const d=new Date(iso+'T00:00');return d.getFullYear()*4+Math.floor(d.getMonth()/3)};
const qYear=k=>Math.floor(k/4),qNum=k=>k%4;
const fmtDate=iso=>new Date(iso+'T00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
function shiftQuarters(iso,n){if(!iso)return '';const d=new Date(iso+'T00:00'),day=d.getDate(),m=d.getMonth()+3*n,y=d.getFullYear()+Math.floor(m/12),mm=((m%12)+12)%12;
  return isoDate(new Date(y,mm,Math.min(day,new Date(y,mm+1,0).getDate())))}
const quarterStart=k=>isoDate(new Date(qYear(k),qNum(k)*3,15));
function msCard(m){
  const ts=S.tasks.filter(t=>t.milestoneId===m.id),td=ts.filter(t=>t.done).length;
  return `<article class="tl-card cat-${catKey(m.category)}${m.status==='Done'?' is-done':''}${S.editMs===m.id?' editing':''}${S.flashMs===m.id?' flash':''}" draggable="true" data-msdrag="${esc(m.id)}" id="ms-${esc(m.id)}">
    <button class="tl-open" data-editms="${esc(m.id)}" aria-label="Edit ${esc(m.title)}">
      <span class="ms-top"><span class="catdot"></span><span class="muted" style="font-size:12px">${esc(m.category)}</span><span class="pill ms-${m.status.toLowerCase().replace(/\s/g,'')}">${esc(m.status)}</span></span>
      <b>${esc(m.title)}</b>
      ${m.description?`<span class="muted tl-desc">${esc(m.description)}</span>`:''}
      ${ts.length?`<span class="ms-prog"><span class="bar"><i style="width:${Math.round(td/ts.length*100)}%"></i></span><span class="muted" style="font-size:12px">${td}/${ts.length} tasks</span></span>`:''}
    </button>
    <div class="tl-dates">
      <label>Start<input type="date" data-msfield="start_date" data-msid="${esc(m.id)}" value="${esc(m.start)}"></label>
      <label>Due<input type="date" data-msfield="target_date" data-msid="${esc(m.id)}" value="${esc(m.date)}"></label>
    </div>
  </article>`;
}
function viewMilestones(tabs){
  const ms=[...S.milestones],e=S.editMs?ms.find(m=>m.id===S.editMs):null,fv=k=>esc(e?(e[k]??''):'');
  const nowK=qOf(today()),dated=ms.filter(m=>m.date),undated=ms.filter(m=>!m.date);
  const keys=dated.map(m=>qOf(m.date));
  const lo=Math.min(nowK,...keys),hi=Math.max(nowK+3,...keys);
  const byQ={};for(const m of dated)(byQ[qOf(m.date)]??=[]).push(m);
  const done=ms.filter(m=>m.status==='Done').length,pct=ms.length?Math.round(done/ms.length*100):0;
  let rows='',side=0;
  for(let k=lo;k<=hi;k++){
    if(k===lo||qNum(k)===0)rows+=`<div class="tl-year"><span>${qYear(k)}</span></div>`;
    const list=(byQ[k]||[]).sort((a,b)=>a.date.localeCompare(b.date));
    const sd=list.length?(side++%2?'left':'right'):'right';
    rows+=`<div class="tl-period ${sd}${k===nowK?' now':''}${k<nowK?' past':''}${list.length?'':' is-empty'}" data-msdrop="${k}">
      <div class="tl-node"><b>Q${qNum(k)+1}</b><small>${QMONTHS[qNum(k)]}</small>${k===nowK?'<span class="tl-now">Now</span>':''}</div>
      <div class="tl-branch">${list.map(msCard).join('')}<button class="tl-add" data-msadd="${k}">+ Add to Q${qNum(k)+1} ${qYear(k)}</button></div>
    </div>`;
  }
  return header('Calendar','Milestone map',tabs)+
  `<div class="kpis ms-kpis">
    <div class="kpi hero"><div class="l">Roadmap progress</div><div class="v">${pct}<small>%</small></div><div class="s">${done} of ${ms.length} milestones done</div></div>
    ${['In progress','At risk','Planned'].map(st=>`<div class="kpi"><div class="l">${st}</div><div class="v">${ms.filter(m=>m.status===st).length}</div><div class="s">milestone${ms.filter(m=>m.status===st).length===1?'':'s'}</div></div>`).join('')}
  </div>
  <div class="grid g-side">
   <section class="panel tl-panel"><div class="panel-h"><h2>Roadmap timeline</h2><span class="muted" style="font-size:13px">Change a date or drag a card to move it</span></div>
    <div class="tl">${rows}
     <div class="tl-period right undated" data-msdrop="none">
      <div class="tl-node"><b>?</b><small>No date</small></div>
      <div class="tl-branch">${undated.map(msCard).join('')}${undated.length?'':'<span class="muted" style="font-size:13px">Every milestone has a date.</span>'}<button class="tl-add" data-msadd="none">+ Add without a date</button></div>
     </div>
    </div>
   </section>
   <section class="panel" style="align-self:start" id="msFormPanel"><div class="panel-h"><h2>${e?'Edit milestone':'Add a milestone'}</h2>${e?'<button class="btn ghost sm" data-canceleditms>Cancel</button>':''}</div>
    <form class="f" id="fMs" data-id="${e?esc(e.id):''}">
     <label>Milestone<input id="msTitle" name="title" required value="${fv('title')}" placeholder="e.g. Alosra listing live"></label>
     <div class="row"><label>Start date<input id="msStart" type="date" name="start" value="${fv('start')}"></label>
     <label>Due date<input id="msDate" type="date" name="date" value="${e?fv('date'):esc(S.msPrefillDate||'')}"></label></div>
     <div class="row"><label>Status<select id="msStatus" name="status">${MS_STATUSES.map(st=>`<option ${(e?e.status:'Planned')===st?'selected':''}>${st}</option>`).join('')}</select></label>
     <label>Type of work<select id="msCat" name="category">${TASK_CATS.map(k=>`<option ${(e?e.category:'Operations')===k?'selected':''}>${esc(k)}</option>`).join('')}</select></label></div>
     <label>Description<textarea id="msDesc" name="description" rows="3">${fv('description')}</textarea></label>
     <button class="btn" type="submit">${e?'Save changes':'Add milestone'}</button>
     ${e?`<div style="display:flex;justify-content:flex-end">${del('milestones',e.id)}</div>`:''}
    </form>
    ${e&&S.tasks.some(t=>t.milestoneId===e.id)?`<h3 class="sub">Tasks for this milestone</h3><div class="task-list">${S.tasks.filter(t=>t.milestoneId===e.id).sort((a,b)=>a.date.localeCompare(b.date)).map(t=>taskRow(t,true)).join('')}</div>`:''}
    <div class="legend" style="margin-top:16px">${TASK_CATS.map(k=>`<span class="cat-${catKey(k)}"><span class="catdot"></span>${esc(k)}</span>`).join('')}</div>
   </section>
  </div>`;
}
async function moveMilestone(id,patch,msg){
  try{await write(sb.from('milestones').update(patch).eq('id',id));S.flashMs=id;render();
    const el=document.getElementById('ms-'+id);if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>{S.flashMs=null;document.getElementById('ms-'+id)?.classList.remove('flash')},1600);toast(msg)}
  catch(err){toast(err.message,1);render()}
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

const VIEWS={overview:viewOverview,inventory:viewInventory,sales:viewSales,locations:viewLocations,products:viewProducts,distributors:viewDistributors,documents:viewDocuments,calendar:viewCalendar,analysis:viewAnalysis,links:viewLinks,assistant:viewAssistant};
function render(){
  if($('#app').hidden)return;
  renderNav();
  const keep={};document.querySelectorAll('main input,main select,main textarea').forEach(el=>{if(el.id&&el.type!=='file')keep[el.id]=el.value});
  $('#main').innerHTML=VIEWS[S.tab]();
  const formKey=[S.editLoc,S.editProd,S.editDist,S.editTask,S.editMs,S.calTab,S.msPrefillDate].join('|'),formChanged=S._formKey!==formKey;S._formKey=formKey;
  for(const [id,v] of Object.entries(keep)){if(formChanged&&/^(lc|pd|ds|tk|ms)/.test(id))continue;const el=document.getElementById(id);if(el&&v!=='')el.value=v}
  syncMoveForm();updateSaleTotals();
  const c=$('#chat');if(c)c.scrollTop=c.scrollHeight;
}
function go(t){S.tab=t;S.armed=null;S.editLoc=null;S.editProd=null;S.editDist=null;S.editTask=null;S.editMs=null;try{localStorage.setItem('rins.tab',t)}catch(e){}render();window.scrollTo(0,0)}

/* ---------------- events ---------------- */
const TABLE_OF={tasks:'tasks',milestones:'milestones',distributors:'distributors',products:'products',locations:'locations',movements:'movements',links:'links',documents:'documents'};
document.addEventListener('click',async e=>{
  if(e.target.closest('[data-close-viewer]')||e.target.id==='viewer')return closeViewer();
  const b=e.target.closest('[data-tab],[data-go],[data-del],[data-pin],[data-ask],[data-view],[data-editloc],[data-canceledit],[data-editprod],[data-canceleditprod],[data-editdist],[data-canceleditdist],[data-distfilter],[data-refill],[data-testwa],[data-testemail],[data-caltab],[data-calnav],[data-calday],[data-edittask],[data-canceledittask],[data-editms],[data-canceleditms],[data-msadd]');if(!b)return;
  if(b.dataset.view)return openDoc(b.dataset.view);
  if(b.dataset.editloc!==undefined){S.editLoc=b.dataset.editloc;S.armed=null;render();if(innerWidth<980)$('#fLoc')?.scrollIntoView({behavior:'smooth'});$('#lcName')?.focus();return}
  if(b.dataset.canceledit!==undefined){S.editLoc=null;render();return}
  if(b.dataset.editprod!==undefined){S.editProd=b.dataset.editprod;S.armed=null;render();if(innerWidth<980)$('#fProd')?.scrollIntoView({behavior:'smooth'});$('#pdName')?.focus();return}
  if(b.dataset.canceleditprod!==undefined){S.editProd=null;render();return}
  if(b.dataset.editdist!==undefined){S.editDist=b.dataset.editdist;S.armed=null;render();if(innerWidth<980)$('#fDist')?.scrollIntoView({behavior:'smooth'});$('#dsName')?.focus();return}
  if(b.dataset.canceleditdist!==undefined){S.editDist=null;render();return}
  if(b.dataset.distfilter!==undefined){S.distFilter=b.dataset.distfilter;render();return}
  if(b.dataset.refill){const [loc,pid,n]=b.dataset.refill.split('|');const wh=S.locations.find(x=>x.type==='warehouse');
    $('#mvType').value='transfer';syncMoveForm();$('#mvProd').value=pid;$('#mvTo').value=loc;if(wh)$('#mvFrom').value=wh.id;$('#mvQty').value=n;
    $('#mvNote').value='Refill';$('#fMove').scrollIntoView({behavior:'smooth',block:'center'});$('#mvQty').focus();
    toast(wh?'Delivery filled in. Check the details and save.':'Delivery filled in. Choose where the stock comes from, then save.');return}
  if(b.dataset.caltab){S.calTab=b.dataset.caltab;S.editTask=null;S.editMs=null;render();return}
  if(b.dataset.calnav!==undefined){const c=calState(),n=Number(b.dataset.calnav);if(n===0){const t=new Date();c.y=t.getFullYear();c.m=t.getMonth();c.sel=today()}else{const d=new Date(c.y,c.m+n,1);c.y=d.getFullYear();c.m=d.getMonth()}render();return}
  if(b.dataset.calday){calState().sel=b.dataset.calday;if(!S.editTask){const el=$('#tkDate');if(el)el.value=b.dataset.calday}render();const dv=$('#tkDate');if(dv&&!S.editTask)dv.value=b.dataset.calday;if(innerWidth<980)$('.g-cal > .grid')?.scrollIntoView({behavior:'smooth'});return}
  if(b.dataset.edittask){const t=S.tasks.find(x=>x.id===b.dataset.edittask);if(!t)return;S.editTask=t.id;S.armed=null;if(S.tab!=='calendar'||S.calTab!=='calendar'){S.tab='calendar';S.calTab='calendar'}const c=calState();c.sel=t.date;const d=new Date(t.date+'T00:00');c.y=d.getFullYear();c.m=d.getMonth();render();$('#fTask')?.scrollIntoView({behavior:'smooth',block:'center'});$('#tkTitle')?.focus();return}
  if(b.dataset.canceledittask!==undefined){S.editTask=null;render();return}
  if(b.dataset.editms){S.editMs=b.dataset.editms;S.armed=null;render();if(innerWidth<980)$('#fMs')?.scrollIntoView({behavior:'smooth'});return}
  if(b.dataset.canceleditms!==undefined){S.editMs=null;render();return}
  if(b.dataset.msadd!==undefined){S.editMs=null;S.msPrefillDate=b.dataset.msadd==='none'?'':quarterStart(Number(b.dataset.msadd));render();
    const dt=$('#msDate');if(dt)dt.value=S.msPrefillDate;$('#msFormPanel')?.scrollIntoView({behavior:'smooth',block:'start'});$('#msTitle')?.focus();return}
  if(b.dataset.testemail!==undefined){b.disabled=true;const {data,error}=await sb.rpc('send_test_email');b.disabled=false;
    if(error)return toast('Could not send: '+error.message,1);
    return toast(data==='sent'?'Test email sent to '+(S.emailStatus?.to||'your inbox')+'. Check spam if it is not there in a minute.':'Email is not set up yet. Finish the setup steps first.',data!=='sent')}
  if(b.dataset.testwa!==undefined){b.disabled=true;const {data,error}=await sb.rpc('send_test_whatsapp');b.disabled=false;
    if(error)return toast('Could not send: '+error.message,1);
    return toast(data==='sent'?'Test message sent. It should arrive within a minute.':'Alerts are not set up yet. Finish the setup steps first.',data!=='sent')}
  if(b.dataset.tab)return go(b.dataset.tab);
  if(b.dataset.go)return go(b.dataset.go);
  if(b.dataset.ask){$('#askQ').value=b.dataset.ask;return ask(b.dataset.ask)}
  try{
    if(b.dataset.pin){const k=S.links.find(x=>x.id===b.dataset.pin);if(k)await write(sb.from('links').update({pinned:!k.pinned}).eq('id',k.id));return}
    if(b.dataset.del){const key=b.dataset.del;if(S.armed!==key){S.armed=key;render();return}
      S.armed=null;const i=key.indexOf('/'),coll=key.slice(0,i),id=key.slice(i+1);
      if(!TABLE_OF[coll])return;
      const doc=coll==='documents'?S.documents.find(x=>x.id===id):null,prodPhoto=coll==='products'?P(id)?.imagePath:null;
      await write(sb.from(TABLE_OF[coll]).delete().eq('id',id));
      if(doc)await sb.storage.from('documents').remove([doc.filePath]);
      if(prodPhoto)await sb.storage.from('documents').remove([prodPhoto]);
      toast('Deleted')}
  }catch(err){S.armed=null;render();toast(err.message,1)}
});
document.addEventListener('change',async e=>{
  if(e.target.dataset&&e.target.dataset.msfield){const id=e.target.dataset.msid,f=e.target.dataset.msfield,v=e.target.value||null,m=S.milestones.find(x=>x.id===id);
    if(m&&f==='start_date'&&v&&m.date&&v>m.date){toast('The start date is after the due date.',1);e.target.value=m.start;return}
    if(m&&f==='target_date'&&v&&m.start&&m.start>v){toast('The due date is before the start date.',1);e.target.value=m.date;return}
    return moveMilestone(id,{[f]:v},f==='target_date'?(v?'Moved to '+fmtDate(v):'Moved to Date to set'):'Start date saved')}
  if(e.target.dataset&&e.target.dataset.taskdone){const id=e.target.dataset.taskdone,v=e.target.checked;
    try{await write(sb.from('tasks').update({done:v}).eq('id',id));toast(v?'Task done':'Task reopened')}catch(err){toast(err.message,1)}return}
  if(e.target.dataset&&e.target.dataset.photoFor&&e.target.files[0]){
    const id=e.target.dataset.photoFor,file=e.target.files[0];toast('Uploading photo…');
    try{await uploadProductPhoto(id,file);await loadAll();toast('Photo saved')}catch(err){toast(err.message,1)}
    return}
  if(e.target.id==='mvType')syncMoveForm();
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
      let id=f.dataset.id;const levels=readLevels();
      if(id){const {error}=await sb.from('locations').update(row).eq('id',id);if(error)throw new Error(friendly(error))}
      else{const {data,error}=await sb.from('locations').insert(row).select('id').single();if(error)throw new Error(friendly(error));id=data.id}
      let targets=[id];
      if(f.dataset.id&&$('#lcApply')?.checked){const e=S.locations.find(x=>x.id===id);targets=targets.concat(S.locations.filter(x=>x.id!==id&&x.chain&&x.chain===row.chain&&x.format===row.format).map(x=>x.id))}
      if(S.levelsReady&&levels)await saveLevels(targets,levels);
      const wasEdit=!!f.dataset.id;S.editLoc=null;await loadAll();
      toast(wasEdit?(targets.length>1?`Saved for ${targets.length} branches`:'Location updated'):'Location added');
      if(!wasEdit)['lcName','lcNote'].forEach(x=>{const el=$('#'+x);if(el)el.value=''});
    }else if(f.id==='fProd'){
      const row={name:d.name.trim(),sku:(d.sku||'').trim(),line:(d.line||'').trim(),price:d.price===''?null:Number(d.price),unit:(d.unit||'').trim(),barcode:(d.barcode||'').trim()};
      const photo=$('#pdPhoto').files[0],id=f.dataset.id;
      if(id){const {error}=await sb.from('products').update(row).eq('id',id);if(error)throw new Error(friendly(error));
        if(photo)await uploadProductPhoto(id,photo);S.editProd=null;await loadAll();toast('Product updated');return}
      const {data,error}=await sb.from('products').insert(row).select('id').single();if(error)throw new Error(friendly(error));
      if(photo)try{await uploadProductPhoto(data.id,photo)}catch(err){await loadAll();throw new Error('Product added, but '+err.message.charAt(0).toLowerCase()+err.message.slice(1))}
      await loadAll();toast('Product added');['pdName','pdSku','pdBarcode','pdUnit'].forEach(id=>$('#'+id).value='');$('#pdPhoto').value='';
    }else if(f.id==='fTask'){
      const rule=d.rule||'none',remindAt=computeRemindAt(d.date,d.time,rule);
      const row={title:d.title.trim(),due_date:d.date,due_time:d.time||null,category:d.category,importance:d.importance,notes:(d.notes||'').trim(),milestone_id:d.milestone||null,
        remind_rule:rule,remind_at:remindAt,remind_telegram:rule!=='none',remind_email:false};
      const id=f.dataset.id;
      if(id){await write(sb.from('tasks').update(row).eq('id',id));S.editTask=null;render();toast('Task updated');return}
      await write(sb.from('tasks').insert(row));
      toast(remindAt&&new Date(remindAt)<new Date()?'Task added. The reminder time has already passed, so no reminder will be sent.':'Task added');
      ['tkTitle','tkTime','tkNotes'].forEach(x=>{const el=$('#'+x);if(el)el.value=''});
    }else if(f.id==='fMs'){
      if(d.start&&d.date&&d.start>d.date)throw new Error('The start date is after the due date.');
      const row={title:d.title.trim(),start_date:d.start||null,target_date:d.date||null,status:d.status,category:d.category,description:(d.description||'').trim()};
      const id=f.dataset.id;
      if(id){S.editMs=null;S.msPrefillDate='';await moveMilestone(id,row,'Milestone updated');return}
      const {data,error}=await sb.from('milestones').insert(row).select('id').single();if(error)throw new Error(friendly(error));
      S.msPrefillDate='';['msTitle','msStart','msDate','msDesc'].forEach(x=>{const el=$('#'+x);if(el)el.value=''});
      await loadAll();S.flashMs=data.id;render();document.getElementById('ms-'+data.id)?.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>{S.flashMs=null;document.getElementById('ms-'+data.id)?.classList.remove('flash')},1600);toast('Milestone added');
    }else if(f.id==='fDist'){
      const row={name:d.name.trim(),country:(d.country||'').trim(),city:(d.city||'').trim(),contact_name:(d.contact||'').trim(),phone:(d.phone||'').trim(),email:(d.email||'').trim(),status:d.status,terms:(d.terms||'').trim(),last_contact:d.lastContact||null,next_step:(d.nextStep||'').trim(),notes:(d.notes||'').trim()};
      const id=f.dataset.id;
      if(id){await write(sb.from('distributors').update(row).eq('id',id));S.editDist=null;render();toast('Distributor updated');return}
      await write(sb.from('distributors').insert(row));toast('Distributor added');
      ['dsName','dsCountry','dsCity','dsContact','dsPhone','dsEmail','dsTerms','dsLast','dsNext','dsNotes'].forEach(id=>$('#'+id).value='');$('#dsStatus').value='Prospect';
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

/* ---------------- milestone drag and drop ---------------- */
let dragMs=null;
document.addEventListener('dragstart',e=>{const c=e.target.closest&&e.target.closest('[data-msdrag]');if(!c)return;
  dragMs=c.dataset.msdrag;c.classList.add('dragging');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',dragMs)}catch(_){}});
document.addEventListener('dragend',()=>{dragMs=null;document.querySelectorAll('.dragging,.drop-over').forEach(x=>x.classList.remove('dragging','drop-over'))});
document.addEventListener('dragover',e=>{if(!dragMs)return;const z=e.target.closest('[data-msdrop]');if(!z)return;e.preventDefault();
  document.querySelectorAll('.drop-over').forEach(x=>x!==z&&x.classList.remove('drop-over'));z.classList.add('drop-over')});
document.addEventListener('drop',e=>{if(!dragMs)return;const z=e.target.closest('[data-msdrop]');if(!z)return;e.preventDefault();
  const id=dragMs,m=S.milestones.find(x=>x.id===id);dragMs=null;z.classList.remove('drop-over');if(!m)return;
  const target=z.dataset.msdrop;
  if(target==='none'){if(m.date)moveMilestone(id,{target_date:null},'Moved to Date to set');return}
  const k=Number(target);if(m.date&&qOf(m.date)===k)return;
  const n=m.date?k-qOf(m.date):0,due=m.date?shiftQuarters(m.date,n):quarterStart(k),start=m.start&&m.date?shiftQuarters(m.start,n):'';
  moveMilestone(id,{target_date:due,start_date:start||(m.date?null:m.start||null)},'Moved to '+fmtDate(due));
});

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
