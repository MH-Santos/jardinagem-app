/* Gestão de Jardinagem — MVP funcional local */
const KEY="jardinagem-v1-data";
const defaultData={
  settings:{companyName:"",legalName:"",nif:"",address:"",postal:"",phone:"",email:"",hourlyRate:25,minPrice:50,weeklyCapacity:40,backupInterval:"monthly",lastBackup:null},
  clients:[],jobs:[],sessions:[],costs:[],payments:[],quotes:[],equipment:[],maintenance:[],photos:[]
};
let data=load(); let route="home"; let selectedJob=null; let calDate=new Date();

function load(){try{return {...structuredClone(defaultData),...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return structuredClone(defaultData)}}
function save(){localStorage.setItem(KEY,JSON.stringify(data));}
function uid(p){return p+"_"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmtDate(d){return new Intl.DateTimeFormat("pt-PT",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(d))}
function fmtTime(d){return new Intl.DateTimeFormat("pt-PT",{hour:"2-digit",minute:"2-digit"}).format(new Date(d))}
function hours(ms){return ms/3600000}
function money(v){return new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"}).format(v||0)}
function clientName(id){return data.clients.find(c=>c.id===id)?.name||"Cliente"}
function jobSessions(jid){return data.sessions.filter(s=>s.jobId===jid)}
function workedHours(jid){return jobSessions(jid).reduce((a,s)=>a+(s.duration||0),0)}
function activeSession(){return data.sessions.find(s=>s.active)}
function statusClass(s){return s.replaceAll(" ","-")}
function titleFor(){return {home:"Hoje",calendar:"Calendário",jobs:"Trabalhos",clients:"Clientes",more:"Mais"}[route]||"Jardinagem"}

function render(){
 document.querySelector("#page-title").textContent=titleFor();
 document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.route===route));
 const m=document.querySelector("#main");
 ({home:renderHome,calendar:renderCalendar,jobs:renderJobs,clients:renderClients,more:renderMore}[route]||renderHome)(m);
}
function toast(t){const x=document.createElement("div");x.className="toast";x.textContent=t;document.body.append(x);setTimeout(()=>x.remove(),2200)}
function modal(title,body,buttons=""){
 document.querySelector("#modal-root").innerHTML=`<div class="modal-backdrop" id="backdrop"><section class="modal"><div class="modal-head"><h2>${title}</h2><button class="close" onclick="closeModal()">×</button></div>${body}${buttons?`<div class="actions" style="margin-top:14px">${buttons}</div>`:""}</section></div>`;
}
function closeModal(){document.querySelector("#modal-root").innerHTML=""}

function renderHome(m){
 const today=new Date(); const ds=today.toISOString().slice(0,10);
 const todays=data.jobs.filter(j=>j.start?.slice(0,10)===ds).sort((a,b)=>new Date(a.start)-new Date(b.start));
 const weekStart=new Date(today); weekStart.setDate(today.getDate()-((today.getDay()+6)%7)); weekStart.setHours(0,0,0,0);
 const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+7);
 const scheduled=data.jobs.filter(j=>new Date(j.start)>=weekStart&&new Date(j.start)<weekEnd&&j.status!=="Cancelado").reduce((a,j)=>a+(j.estimatedHours||0),0);
 const free=Math.max(0,(data.settings.weeklyCapacity||40)-scheduled);
 const open=data.jobs.filter(j=>!["Concluído","Cancelado"].includes(j.status)).length;
 const unpaid=data.jobs.reduce((a,j)=>a+(j.price||0)-data.payments.filter(p=>p.jobId===j.id).reduce((x,p)=>x+p.amount,0),0);
 const costs=data.costs.reduce((a,c)=>a+c.amount,0), revenue=data.jobs.filter(j=>j.status==="Concluído").reduce((a,j)=>a+(j.price||0),0);
 m.innerHTML=`<div class="grid grid3">
 <div class="card kpi"><div class="muted small">Agendado esta semana</div><div class="big">${scheduled.toFixed(1)} h</div><div class="progress"><i style="width:${Math.min(100,scheduled/(data.settings.weeklyCapacity||40)*100)}%"></i></div></div>
 <div class="card kpi"><div class="muted small">Livre</div><div class="big">${free.toFixed(1)} h</div><div class="muted small">${data.settings.weeklyCapacity||40} h capacidade</div></div>
 <div class="card kpi"><div class="muted small">Por receber</div><div class="big">${money(unpaid)}</div><div class="muted small">${open} trabalhos abertos</div></div></div>
 <div class="section-title"><h2>Hoje</h2><button class="secondary" onclick="route='calendar';render()">Ver calendário</button></div>
 <div class="stack">${todays.length?todays.map(jobHTML).join(""):`<div class="card empty">Não há trabalhos agendados para hoje.</div>`}</div>
 <div class="section-title"><h2>Resumo financeiro</h2></div>
 <div class="grid grid3"><div class="card"><div class="muted small">Receita concluída</div><div class="big">${money(revenue)}</div></div><div class="card"><div class="muted small">Custos</div><div class="big">${money(costs)}</div></div><div class="card"><div class="muted small">Resultado</div><div class="big">${money(revenue-costs)}</div></div></div>`;
}
function jobHTML(j){
 const wh=workedHours(j.id), remaining=Math.max(0,(j.estimatedHours||0)-wh);
 return `<div class="card job-card ${statusClass(j.status)}"><div class="row"><div><strong>${esc(clientName(j.clientId))}</strong><div>${esc(j.description)}</div></div><span class="status s-${statusClass(j.status)}">${esc(j.status)}</span></div><div class="muted small" style="margin-top:7px">${fmtDate(j.start)} · ${fmtTime(j.start)}–${fmtTime(j.end)} · ${wh.toFixed(1)} h realizadas${j.estimatedHours?` · ${remaining.toFixed(1)} h restantes`:""}</div><div class="actions" style="margin-top:10px">${j.status==="Agendado"||j.status==="Em pausa"?`<button class="primary" onclick="startJob('${j.id}')">${j.status==="Em pausa"?"Retomar":"Iniciar"}</button>`:""}${j.status==="Em curso"?`<button class="secondary" onclick="pauseJob('${j.id}')">Pausar</button><button class="secondary" onclick="endSession('${j.id}')">Terminar</button>`:""}${!["Concluído","Cancelado"].includes(j.status)?`<button class="secondary" onclick="jobDetail('${j.id}')">Detalhes</button>`:""}${j.status==="Em pausa"?`<button class="secondary" onclick="reschedule('${j.id}',true)">Reagendar continuação</button>`:""}</div></div>`;
}

function renderJobs(m){
 m.innerHTML=`<div class="actions"><button class="primary" onclick="newJob()">+ Novo trabalho</button><button class="secondary" onclick="newQuote()">+ Orçamento</button></div><input class="search" id="job-search" placeholder="Pesquisar trabalhos..." oninput="renderJobList()" style="margin-top:12px"><div id="job-list"></div>`;
 renderJobList();
}
function renderJobList(){
 const q=(document.querySelector("#job-search")?.value||"").toLowerCase();
 const arr=data.jobs.filter(j=>`${clientName(j.clientId)} ${j.description}`.toLowerCase().includes(q)).sort((a,b)=>new Date(a.start)-new Date(b.start));
 document.querySelector("#job-list").innerHTML=arr.length?`<div class="stack">${arr.map(jobHTML).join("")}</div>`:`<div class="card empty">Ainda não existem trabalhos.</div>`;
}

function renderClients(m){
 m.innerHTML=`<div class="actions"><button class="primary" onclick="newClient()">+ Novo cliente</button></div><input class="search" id="client-search" placeholder="Pesquisar clientes..." oninput="renderClientList()" style="margin-top:12px"><div id="client-list"></div>`;
 renderClientList();
}
function renderClientList(){
 const q=(document.querySelector("#client-search")?.value||"").toLowerCase();
 const arr=data.clients.filter(c=>`${c.name} ${c.company||""} ${c.phone||""}`.toLowerCase().includes(q));
 document.querySelector("#client-list").innerHTML=arr.length?`<div class="stack">${arr.map(c=>`<div class="card"><div class="row"><div><h3>${esc(c.name)}</h3><div class="muted">${esc(c.company||"")}</div></div><button class="secondary" onclick="clientDetail('${c.id}')">Abrir</button></div><div class="small muted">${esc(c.phone||"")} ${c.email?`· ${esc(c.email)}`:""}</div></div>`).join("")}</div>`:`<div class="card empty">Ainda não existem clientes.</div>`;
}

function renderCalendar(m){
 const monday=new Date(calDate); monday.setDate(calDate.getDate()-((calDate.getDay()+6)%7)); monday.setHours(0,0,0,0);
 const days=[...Array(7)].map((_,i)=>{let d=new Date(monday);d.setDate(monday.getDate()+i);return d});
 const names=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
 const labels=[...Array(17)].map((_,i)=>`${String(i+6).padStart(2,"0")}:00`);
 const cols=days.map((d,i)=>{
   const dayJobs=data.jobs.filter(j=>j.start?.slice(0,10)===d.toISOString().slice(0,10));
   return `<div class="day"><div class="day-head">${names[i]}<br>${d.getDate()}/${d.getMonth()+1}</div><div class="time-grid">${dayJobs.map(j=>{
      const st=new Date(j.start), en=new Date(j.end); const top=Math.max(0,(st.getHours()+st.getMinutes()/60-6)*60), h=Math.max(30,(en-st)/3600000*60);
      return `<div class="event ${statusClass(j.status)}" style="top:${top}px;height:${h}px" onclick="jobDetail('${j.id}')"><strong>${esc(clientName(j.clientId))}</strong><br>${esc(j.description)}<br>${fmtTime(st)}–${fmtTime(en)}</div>`;
   }).join("")}</div></div>`;
 }).join("");
 m.innerHTML=`<div class="calendar-head"><button onclick="shiftCal(-7)">‹</button><strong>${fmtDate(monday)} – ${fmtDate(new Date(monday.getTime()+6*86400000))}</strong><button onclick="shiftCal(7)">›</button></div>
 <div class="week"><div>${labels.map(x=>`<div class="time-label">${x}</div>`).join("")}</div>${cols}</div>
 <div class="actions" style="margin-top:12px"><button class="primary" onclick="newJob()">+ Novo trabalho</button></div>`;
}
function shiftCal(n){calDate.setDate(calDate.getDate()+n);renderCalendar(document.querySelector("#main"))}

function renderMore(m){
 m.innerHTML=`<div class="grid">
 <button class="card row" onclick="renderSection('quotes')"><span><strong>Orçamentos</strong><br><span class="muted">Criar, consultar e converter em trabalho</span></span><b>›</b></button>
 <button class="card row" onclick="renderSection('finance')"><span><strong>Finanças</strong><br><span class="muted">Custos, pagamentos e rentabilidade</span></span><b>›</b></button>
 <button class="card row" onclick="renderSection('equipment')"><span><strong>Equipamentos</strong><br><span class="muted">Garantias e manutenção</span></span><b>›</b></button>
 <button class="card row" onclick="renderSection('settings')"><span><strong>Definições</strong><br><span class="muted">Empresa, preços, capacidade e backup</span></span><b>›</b></button></div>`;
}
function renderSection(s){
 const m=document.querySelector("#main");
 if(s==="quotes") renderQuotes(m); if(s==="finance") renderFinance(m); if(s==="equipment") renderEquipment(m); if(s==="settings") renderSettings(m);
}
function renderQuotes(m){m.innerHTML=`<div class="actions"><button class="primary" onclick="newQuote()">+ Novo orçamento</button></div><div class="section-title"><h2>Orçamentos</h2></div><div class="stack">${data.quotes.length?data.quotes.map(q=>`<div class="card"><div class="row"><div><strong>${esc(clientName(q.clientId))}</strong><div>${esc(q.description)}</div></div><span class="status">${esc(q.status||"Rascunho")}</span></div><div class="muted small">${fmtDate(q.date)} · ${money(q.total||0)}</div><div class="actions" style="margin-top:8px"><button class="secondary" onclick="quotePDF('${q.id}')">Gerar PDF</button></div></div>`).join(""):`<div class="card empty">Ainda não existem orçamentos.</div>`}</div>`}
function renderFinance(m){
 const revenue=data.jobs.filter(j=>j.status==="Concluído").reduce((a,j)=>a+(j.price||0),0), costs=data.costs.reduce((a,c)=>a+c.amount,0);
 m.innerHTML=`<div class="grid grid3"><div class="card"><div class="muted small">Receita concluída</div><div class="big">${money(revenue)}</div></div><div class="card"><div class="muted small">Custos</div><div class="big">${money(costs)}</div></div><div class="card"><div class="muted small">Resultado</div><div class="big">${money(revenue-costs)}</div></div></div><div class="section-title"><h2>Custos</h2><button class="primary" onclick="newCost()">+ Custo</button></div><div class="stack">${data.costs.length?data.costs.map(c=>`<div class="card row"><span>${esc(c.category)}${c.jobId?` · ${esc(data.jobs.find(j=>j.id===c.jobId)?.description||"")}`:""}</span><strong>${money(c.amount)}</strong></div>`).join(""):`<div class="card empty">Sem custos registados.</div>`}</div>`}
function renderEquipment(m){m.innerHTML=`<div class="actions"><button class="primary" onclick="newEquipment()">+ Equipamento</button></div><div class="stack" style="margin-top:12px">${data.equipment.length?data.equipment.map(e=>`<div class="card"><div class="row"><div><strong>${esc(e.type)}</strong><div>${esc(e.brand||"")} ${esc(e.model||"")}</div></div><span class="status">${e.warrantyEnd&&new Date(e.warrantyEnd)<new Date()?"Garantia expirada":"Garantia válida"}</span></div><div class="muted small">Manutenção: ${e.maintenanceHours?`cada ${e.maintenanceHours} h`:"—"} ${e.maintenanceMonths?`/ ${e.maintenanceMonths} meses`:""}</div></div>`).join(""):`<div class="card empty">Ainda não existem equipamentos.</div>`}</div>`}
function renderSettings(m){
 const s=data.settings;
 m.innerHTML=`<div class="card"><h2>Empresa</h2><div class="form-grid">
 ${field("Nome comercial","set-company",s.companyName)}${field("Nome legal","set-legal",s.legalName)}${field("NIF","set-nif",s.nif)}${field("Telefone","set-phone",s.phone)}${field("Email","set-email",s.email)}${field("Código postal","set-postal",s.postal)}${field("Morada","set-address",s.address,"full")}</div><div class="actions" style="margin-top:12px"><button class="primary" onclick="saveSettings()">Guardar</button></div></div>
 <div class="card" style="margin-top:12px"><h2>Preços e capacidade</h2><div class="form-grid">${field("Preço/hora (€)","set-rate",s.hourlyRate,"","number")}${field("Preço mínimo (€)","set-min",s.minPrice,"","number")}${field("Capacidade semanal (h)","set-cap",s.weeklyCapacity,"","number")}</div><div class="actions" style="margin-top:12px"><button class="primary" onclick="saveSettings()">Guardar</button></div></div>
 <div class="card" style="margin-top:12px"><h2>Cópia de segurança</h2><p class="muted">Último backup: ${s.lastBackup?new Date(s.lastBackup).toLocaleString("pt-PT"):"Nunca"}</p><div class="actions"><button class="primary" onclick="exportBackup()">Fazer backup</button><button class="secondary" onclick="importBackup()">Restaurar backup</button><button class="secondary" onclick="exportCSV()">Exportar CSV</button></div></div>`;
}
function field(label,id,value="",cls="",type="text"){return `<div class="${cls}"><label>${label}</label><input id="${id}" type="${type}" value="${esc(value??"")}"></div>`}

function newClient(){
 modal("Novo cliente",`<div class="form-grid">${field("Nome *","c-name")}${field("Empresa","c-company")}${field("NIF","c-nif")}${field("Telefone","c-phone")}${field("Email","c-email")}${field("Código postal","c-postal")}${field("Morada","c-address","full")}${field("Localidade","c-local")}</div>`,
 `<button class="primary" onclick="saveClient()">Guardar</button>`);
}
function saveClient(){const name=document.querySelector("#c-name").value.trim();if(!name)return toast("Indica o nome do cliente.");const c={id:uid("c"),name,company:val("c-company"),nif:val("c-nif"),phone:val("c-phone"),email:val("c-email"),postal:val("c-postal"),address:val("c-address"),local:val("c-local")};data.clients.push(c);save();closeModal();render();toast("Cliente criado.")}
function clientDetail(id){const c=data.clients.find(x=>x.id===id);const jobs=data.jobs.filter(j=>j.clientId===id);modal(c.name,`<p>${esc(c.address||"")} ${esc(c.postal||"")} ${esc(c.local||"")}</p><p>${esc(c.phone||"")} ${esc(c.email||"")}</p><h3>Histórico</h3><div class="stack">${jobs.length?jobs.map(jobHTML).join(""):`<div class="empty">Sem trabalhos.</div>`}</div>`)}

function newJob(){
 if(!data.clients.length){return modal("Primeiro cliente",`<p>É necessário criar um cliente antes de criar um trabalho.</p>`,`<button class="primary" onclick="closeModal();newClient()">Criar cliente</button>`)}
 const opts=data.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
 const now=new Date();now.setMinutes(0,0,0); const end=new Date(now.getTime()+2*3600000);
 modal("Novo trabalho",`<div class="form-grid"><div class="full"><label>Cliente *</label><select id="j-client">${opts}</select></div>${field("Descrição *","j-desc")}${field("Tipo de serviço","j-type")}${field("Início","j-start",now.toISOString().slice(0,16),"","datetime-local")}${field("Fim","j-end",end.toISOString().slice(0,16),"","datetime-local")}${field("Duração estimada (h)","j-est","2","","number")}<div><label>Preço</label><select id="j-priceType"><option value="hourly">À hora</option><option value="fixed">Preço fixo</option></select></div>${field("Valor (€)","j-price","0","","number")}${field("Notas","j-notes","full")}</div>`,`<button class="primary" onclick="saveJob()">Guardar</button>`);
}
function saveJob(){
 const start=new Date(val("j-start")),end=new Date(val("j-end")), est=Number(val("j-est"))||0, type=val("j-priceType");let price=Number(val("j-price"))||0;
 if(type==="hourly")price=est*(data.settings.hourlyRate||25);
 if(price<(data.settings.minPrice||0)&&!confirm(`O valor calculado é inferior ao preço mínimo (${money(data.settings.minPrice)}). Continuar?`))return;
 const j={id:uid("j"),clientId:val("j-client"),description:val("j-desc"),type:val("j-type")||"Outro",status:"Agendado",start:start.toISOString(),end:end.toISOString(),estimatedHours:est,priceType:type,hourlyRate:data.settings.hourlyRate,price,notes:val("j-notes"),createdAt:new Date().toISOString(),reschedules:[]};
 if(!j.description)return toast("Indica a descrição.");
 data.jobs.push(j);save();closeModal();route="calendar";render();toast("Trabalho agendado.")}
function jobDetail(id){
 const j=data.jobs.find(x=>x.id===id);selectedJob=id;const wh=workedHours(id),paid=data.payments.filter(p=>p.jobId===id).reduce((a,p)=>a+p.amount,0),cost=data.costs.filter(c=>c.jobId===id).reduce((a,c)=>a+c.amount,0);
 const photos=data.photos.filter(p=>p.jobId===id);
 modal("Detalhe do trabalho",`<div class="card"><div class="row"><div><strong>${esc(clientName(j.clientId))}</strong><div>${esc(j.description)}</div></div><span class="status s-${statusClass(j.status)}">${esc(j.status)}</span></div><p class="muted">${fmtDate(j.start)} · ${fmtTime(j.start)}–${fmtTime(j.end)}</p><div class="grid grid3"><div><div class="muted small">Estimado</div><strong>${j.estimatedHours||0} h</strong></div><div><div class="muted small">Realizado</div><strong>${wh.toFixed(1)} h</strong></div><div><div class="muted small">€/h efetivo</div><strong>${wh?money(j.price/wh):"—"}</strong></div></div></div>
 <div class="section-title"><h3>Valor e custos</h3></div><p>Valor: <strong>${money(j.price)}</strong><br>Custos: <strong>${money(cost)}</strong><br>Resultado: <strong>${money(j.price-cost)}</strong><br>Pago: <strong>${money(paid)}</strong> · Em falta: <strong>${money(j.price-paid)}</strong></p>
 <div class="section-title"><h3>Sessões</h3></div><div class="stack">${jobSessions(id).length?jobSessions(id).map(s=>`<div class="card row"><span>${fmtDate(s.start)} · ${fmtTime(s.start)}–${s.end?fmtTime(s.end):"ativa"}</span><strong>${(s.duration||hours(Date.now()-new Date(s.start))).toFixed(2)} h</strong></div>`).join(""):`<div class="empty">Sem sessões.</div>`}</div>
 <div class="section-title"><h3>Fotografias</h3><button class="secondary" onclick="addPhotos('${id}')">+ Fotos</button></div><div class="photo-grid">${photos.map(p=>`<img src="${p.data}" alt="">`).join("")}</div>
 <div class="actions" style="margin-top:14px">${j.status==="Agendado"||j.status==="Em pausa"?`<button class="primary" onclick="closeModal();startJob('${id}')">${j.status==="Em pausa"?"Retomar":"Iniciar"}</button>`:""}${j.status==="Em curso"?`<button class="secondary" onclick="closeModal();pauseJob('${id}')">Pausar</button><button class="secondary" onclick="closeModal();endSession('${id}')">Terminar</button>`:""}${!["Concluído","Cancelado"].includes(j.status)?`<button class="secondary" onclick="reschedule('${id}',false)">Reagendar</button>`:""}${!["Concluído","Cancelado"].includes(j.status)?`<button class="secondary" onclick="completeJob('${id}')">Concluir</button>`:""}</div>`);
}
function startJob(id){
 const active=activeSession(); if(active&&active.jobId!==id){if(!confirm("Existe outro trabalho em curso. Pretende terminar a sessão atual e iniciar este trabalho?"))return;endSession(active.jobId,false)}
 const j=data.jobs.find(x=>x.id===id);j.status="Em curso";data.sessions.push({id:uid("s"),jobId:id,start:new Date().toISOString(),end:null,duration:0,active:true});save();render();toast("Trabalho iniciado.")}
function pauseJob(id){const s=activeSession();if(s?.jobId===id)finishSession(s);const j=data.jobs.find(x=>x.id===id);j.status="Em pausa";save();render();toast("Trabalho pausado.")}
function endSession(id,rerender=true){const s=activeSession();if(s?.jobId===id)finishSession(s);const j=data.jobs.find(x=>x.id===id);if(j.status==="Em curso")j.status="Em pausa";save();if(rerender){render();toast("Sessão terminada.")}}
function finishSession(s){s.end=new Date().toISOString();s.duration=hours(new Date(s.end)-new Date(s.start));s.active=false}
function completeJob(id){const s=activeSession();if(s?.jobId===id)finishSession(s);const j=data.jobs.find(x=>x.id===id);j.status="Concluído";save();closeModal();render();toast("Trabalho concluído.")}

function reschedule(id,continuation){
 const j=data.jobs.find(x=>x.id===id);const start=new Date(j.start);const end=new Date(j.end);
 modal(continuation?"Reagendar continuação":"Reagendar",`<div class="form-grid">${field("Nova data/hora","r-start",start.toISOString().slice(0,16),"","datetime-local")}${field("Nova duração (h)","r-dur",((end-start)/3600000).toFixed(2),"","number")}${field("Motivo","r-reason")}</div>`,`<button class="primary" onclick="saveReschedule('${id}')">Guardar</button>`);
}
function saveReschedule(id){const j=data.jobs.find(x=>x.id===id), old={start:j.start,end:j.end};const ns=new Date(val("r-start"));const dur=Number(val("r-dur"))||1;const ne=new Date(ns.getTime()+dur*3600000);j.start=ns.toISOString();j.end=ne.toISOString();j.reschedules.push({date:new Date().toISOString(),from:old,to:{start:j.start,end:j.end},reason:val("r-reason")});save();closeModal();route="calendar";render();toast("Trabalho reagendado.")}

function newQuote(){if(!data.clients.length)return modal("Primeiro cliente","Cria um cliente antes de criar um orçamento.",`<button class="primary" onclick="closeModal();newClient()">Criar cliente</button>`);const opts=data.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");modal("Novo orçamento",`<div class="form-grid"><div class="full"><label>Cliente</label><select id="q-client">${opts}</select></div>${field("Descrição","q-desc")}${field("Total (€)","q-total","0","","number")}${field("Validade (dias)","q-valid","30","","number")}${field("Período do acordo","q-period")}${field("Notas","q-notes","full")}</div>`,`<button class="primary" onclick="saveQuote()">Guardar</button>`)}
function saveQuote(){data.quotes.push({id:uid("q"),clientId:val("q-client"),description:val("q-desc"),total:Number(val("q-total"))||0,valid:Number(val("q-valid"))||30,period:val("q-period"),notes:val("q-notes"),date:new Date().toISOString(),status:"Rascunho"});save();closeModal();renderSection("quotes");toast("Orçamento criado.")}

function newCost(){const opts=data.jobs.map(j=>`<option value="${j.id}">${esc(j.description)} — ${esc(clientName(j.clientId))}</option>`).join("");modal("Novo custo",`<div class="form-grid">${field("Categoria","cost-cat")}${field("Valor (€)","cost-amount","0","","number")}<div class="full"><label>Trabalho (opcional)</label><select id="cost-job"><option value="">Geral</option>${opts}</select></div>${field("Descrição","cost-desc","full")}</div>`,`<button class="primary" onclick="saveCost()">Guardar</button>`)}
function saveCost(){data.costs.push({id:uid("cst"),category:val("cost-cat")||"Outro",amount:Number(val("cost-amount"))||0,jobId:val("cost-job"),description:val("cost-desc"),date:new Date().toISOString()});save();closeModal();renderSection("finance");toast("Custo registado.")}

function newEquipment(){modal("Novo equipamento",`<div class="form-grid">${field("Tipo *","e-type")}${field("Marca","e-brand")}${field("Modelo","e-model")}${field("N.º de série","e-serial")}${field("Data de aquisição","e-date","","","date")}${field("Fornecedor","e-supplier")}${field("Preço (€)","e-price","0","","number")}${field("Fim da garantia","e-warranty","","","date")}${field("Manutenção a cada (h)","e-mh","","","number")}${field("Manutenção a cada (meses)","e-mm","","","number")}${field("Notas","e-notes","full")}</div>`,`<button class="primary" onclick="saveEquipment()">Guardar</button>`)}
function saveEquipment(){data.equipment.push({id:uid("e"),type:val("e-type"),brand:val("e-brand"),model:val("e-model"),serial:val("e-serial"),date:val("e-date"),supplier:val("e-supplier"),price:Number(val("e-price"))||0,warrantyEnd:val("e-warranty"),maintenanceHours:Number(val("e-mh"))||0,maintenanceMonths:Number(val("e-mm"))||0,notes:val("e-notes")});save();closeModal();renderSection("equipment");toast("Equipamento registado.")}

function addPhotos(jobId){document.querySelector("#photo-input").dataset.job=jobId;document.querySelector("#photo-input").click()}
document.querySelector("#photo-input").addEventListener("change",async e=>{const jid=e.target.dataset.job;for(const file of e.target.files){const dataUrl=await compressImage(file);data.photos.push({id:uid("p"),jobId:jid,data:dataUrl,type:"outro",date:new Date().toISOString()})}save();e.target.value="";toast("Fotografias adicionadas.");if(document.querySelector("#modal-root").innerHTML)jobDetail(jid)})
function compressImage(file){return new Promise(res=>{const im=new Image(),r=new FileReader();r.onload=()=>{im.onload=()=>{const max=1400,scale=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*scale);c.height=Math.round(im.height*scale);c.getContext("2d").drawImage(im,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",.72))};im.src=r.result};r.readAsDataURL(file)})}

function saveSettings(){const s=data.settings;s.companyName=val("set-company");s.legalName=val("set-legal");s.nif=val("set-nif");s.phone=val("set-phone");s.email=val("set-email");s.postal=val("set-postal");s.address=val("set-address");s.hourlyRate=Number(val("set-rate"))||25;s.minPrice=Number(val("set-min"))||0;s.weeklyCapacity=Number(val("set-cap"))||40;save();toast("Definições guardadas.")}
function val(id){return document.getElementById(id)?.value||""}

function exportBackup(){data.settings.lastBackup=new Date().toISOString();save();const blob=new Blob([JSON.stringify(data)],{type:"application/json"});downloadBlob(blob,`backup_jardinagem_${new Date().toISOString().slice(0,10)}.json`);toast("Backup criado.")}
function importBackup(){const input=document.createElement("input");input.type="file";input.accept=".json,application/json";input.onchange=()=>{const f=input.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const incoming=JSON.parse(r.result);if(!incoming.clients||!incoming.jobs)throw Error();if(confirm(`Backup válido. Substituir os dados atuais pelo backup?`)){data=incoming;save();render();toast("Backup restaurado.")}}catch{toast("Ficheiro de backup inválido.")}};r.readAsText(f)};input.click()}
function exportCSV(){const rows=[["Cliente","Descrição","Estado","Início","Horas estimadas","Horas realizadas","Preço","Custos"]];data.jobs.forEach(j=>rows.push([clientName(j.clientId),j.description,j.status,j.start,j.estimatedHours,workedHours(j.id),j.price,data.costs.filter(c=>c.jobId===j.id).reduce((a,c)=>a+c.amount,0)]));const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\n");downloadBlob(new Blob([csv],{type:"text/csv;charset=utf-8"}),"trabalhos_jardinagem.csv");toast("CSV exportado.")}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

function quotePDF(id){
 const q=data.quotes.find(x=>x.id===id),c=data.clients.find(x=>x.id===q.clientId),s=data.settings;
 const html=`<!doctype html><html><head><meta charset="utf-8"><title>Orçamento</title><style>body{font-family:Arial;padding:40px;max-width:800px;margin:auto}h1{color:#1f6f4a}hr{border:0;border-top:1px solid #ddd}</style></head><body><h1>ORÇAMENTO</h1><p><b>${esc(s.companyName||"")}</b><br>${esc(s.address||"")}<br>${esc(s.phone||"")} · ${esc(s.email||"")}</p><hr><h2>Cliente</h2><p>${esc(c?.name||"")}<br>${esc(c?.address||"")} ${esc(c?.postal||"")} ${esc(c?.local||"")}</p><h2>Trabalho</h2><p>${esc(q.description)}</p><p><b>Total: ${money(q.total)}</b></p><p>Validade: ${q.valid} dias</p><p>${esc(q.notes||"")}</p><script>window.print()</script></body></html>`;
 const w=window.open("","_blank");if(w){w.document.write(html);w.document.close()}else toast("Permite janelas para gerar o documento.")}
document.querySelectorAll(".bottom-nav button").forEach(b=>b.addEventListener("click",()=>{route=b.dataset.route;render()}));
document.querySelector("#backup-reminder-btn").addEventListener("click",()=>renderSection("settings"));
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
render();
