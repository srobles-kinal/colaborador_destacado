/**
 * app.js v7 — Separated admin, evaluador role, elecciones, user edit modal
 */
let USER=null,DATA=null,CHS={},EV={id:null,nombre:'',ratings:{},_params:[]},ADM={p:[],ps:[],ar:[],se:[]};
const COLS=[{bg:'#eef2ff',br:'#818cf8',ic:'#4f46e5'},{bg:'#ecfdf5',br:'#34d399',ic:'#059669'},{bg:'#fffbeb',br:'#fbbf24',ic:'#d97706'},{bg:'#fef2f2',br:'#f87171',ic:'#dc2626'},{bg:'#f0f9ff',br:'#38bdf8',ic:'#0284c7'},{bg:'#fdf4ff',br:'#c084fc',ic:'#9333ea'}];
function gc(i){return COLS[i%COLS.length]}
function $(s){return document.getElementById(s)}
function toast(m,t='info'){const e=document.createElement('div');e.className='tt tt-'+t;e.textContent=m;$('toasts').appendChild(e);setTimeout(()=>{e.style.opacity='0';e.style.transition='opacity .3s';setTimeout(()=>e.remove(),300)},3500)}
function fb(n){return"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 50'><rect fill='%23e2e8f0' width='50' height='50' rx='8'/><text x='50%25' y='56%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-size='18' font-family='sans-serif'>"+(n||'?').charAt(0)+"</text></svg>"}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

// Nav
document.querySelectorAll('.nb').forEach(b=>{b.addEventListener('click',()=>{
  document.querySelectorAll('.nb').forEach(n=>n.classList.remove('on'));
  document.querySelectorAll('.pn').forEach(p=>p.classList.remove('on'));
  b.classList.add('on');$('p-'+b.dataset.tab).classList.add('on');
  const t=b.dataset.tab;
  if(t==='dash')App.loadDash();if(t==='rep')App.loadRep();
  if(t==='usuarios')App.loadUsers();if(t==='elecciones')App.loadElecciones();
  if(t==='evaluadores')App.loadSupEvals();if(t==='config')App.loadConfig();
})});
document.querySelectorAll('.pwd-toggle').forEach(btn=>{btn.addEventListener('click',()=>{const i=btn.previousElementSibling;if(i.type==='password'){i.type='text';btn.textContent='🙈'}else{i.type='password';btn.textContent='👁️'}})});
document.addEventListener('click',function(e){const btn=e.target.closest('.rb-b');if(!btn)return;e.preventDefault();const p=btn.parentElement.dataset.param;const v=parseInt(btn.dataset.v);if(!p||isNaN(v))return;EV.ratings[p]=v;btn.parentElement.querySelectorAll('.rb-b').forEach(b=>{b.classList.toggle('on',parseInt(b.dataset.v)<=v)})});
// ── Session persistence & inactivity timer ──
const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
let _inactivityTimer = null;

function resetInactivity() {
  if (_inactivityTimer) clearTimeout(_inactivityTimer);
  _inactivityTimer = setTimeout(() => {
    toast('Sesión expirada por inactividad', 'info');
    App.logout();
  }, INACTIVITY_MS);
}
// Track user activity
['click','keydown','mousemove','touchstart','scroll'].forEach(evt => {
  document.addEventListener(evt, resetInactivity, { passive: true });
});

function saveSession(token, user) {
  localStorage.setItem('ev_token', token);
  localStorage.setItem('ev_user', JSON.stringify(user));
  localStorage.setItem('ev_time', Date.now().toString());
}
function clearSession() {
  localStorage.removeItem('ev_token');
  localStorage.removeItem('ev_user');
  localStorage.removeItem('ev_time');
}
function getSavedSession() {
  const tk = localStorage.getItem('ev_token');
  const usr = localStorage.getItem('ev_user');
  const time = parseInt(localStorage.getItem('ev_time') || '0');
  if (!tk || !usr) return null;
  // Expire after 8 hours (server also expires, this is just client-side cleanup)
  if (Date.now() - time > 8 * 60 * 60 * 1000) { clearSession(); return null; }
  try { return { token: tk, user: JSON.parse(usr) }; } catch (e) { clearSession(); return null; }
}

document.addEventListener('DOMContentLoaded', () => {
  $('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') App.login() });
  $('pwdConfirm').addEventListener('keydown', e => { if (e.key === 'Enter') App.changePwd() });
  const pi = $('pwdNew');
  if (pi) pi.addEventListener('input', () => { const v = pi.value, b = $('pwdBar'); if (!b) return; b.className = 'pwd-strength ' + (v.length < 6 ? 'weak' : v.length < 10 ? 'medium' : 'strong') });
  // Auto-login from saved session
  const saved = getSavedSession();
  if (saved) {
    api.setToken(saved.token);
    USER = saved.user;
    App.start();
  }
});

const App={
  // ── Auth ──
  async login(){
    const u=$('loginUser').value.trim(),p=$('loginPass').value;
    if(!u||!p){$('loginErr').textContent='Completá ambos campos';return}
    const btn=$('loginBtn');btn.disabled=true;btn.textContent='Ingresando...';
    try{
      const res=await api.login(u,p);
      if(res.success){api.setToken(res.token);USER=res.usuario;saveSession(res.token,res.usuario);
        if(USER.primerIngreso){$('pwdOv').classList.add('open');$('pwdWelcome').textContent='¡Hola, '+(USER.nombre||USER.email.split('@')[0])+'!';const pa=$('pwdAvatar');if(pa&&USER.foto){pa.src=USER.foto;pa.classList.add('show')}}
        else this.start();
      }else $('loginErr').textContent=res.message||'Error';
    }catch(e){$('loginErr').textContent=e.message}
    btn.disabled=false;btn.textContent='Ingresar';
  },
  async changePwd(){
    const n=$('pwdNew').value,c=$('pwdConfirm').value;
    if(n.length<6){$('pwdErr').textContent='Mínimo 6 caracteres';return}
    if(n!==c){$('pwdErr').textContent='No coinciden';return}
    const btn=$('pwdBtn');btn.disabled=true;btn.textContent='Guardando...';
    try{const r=await api.cambiarPassword(n);if(r.success){$('pwdOv').classList.remove('open');toast('Contraseña actualizada','ok');this.start()}else $('pwdErr').textContent=r.message}catch(e){$('pwdErr').textContent=e.message}
    btn.disabled=false;btn.textContent='Guardar Contraseña';
  },
  async logout(){try{await api.logout()}catch(e){}api.setToken(null);USER=null;DATA=null;clearSession();if(_inactivityTimer)clearTimeout(_inactivityTimer);$('appShell').classList.remove('show');$('loginScreen').style.display='flex';$('loginPass').value='';$('loginErr').textContent=''},
  async start(){$('loginScreen').style.display='none';$('appShell').classList.add('show');resetInactivity();try{DATA=await api.getAllData();this.render();toast('Datos cargados','ok')}catch(e){if(e.message.indexOf('Sesión')>=0||e.message.indexOf('invalid')>=0){clearSession();this.logout();return}toast(e.message,'err')}},

  // ── Render ──
  render(){
    if(!DATA)return;
    const perms=DATA.usuario.permisos||[];
    $('chipU').textContent=USER.nombre||USER.email.split('@')[0];
    $('chipR').textContent=USER.rol;
    const topAv=$('topAvatar');if(topAv){topAv.src=USER.foto||fb(USER.nombre);topAv.onerror=function(){this.src=fb(USER.nombre)}}
    const cb=$('convBadge');
    if(cb){cb.textContent=DATA.eleccionActiva?DATA.eleccionActiva.nombre:'Sin elección activa';cb.style.color=DATA.eleccionActiva?'var(--l5)':'var(--r5)'}
    $('welc').textContent='¡Hola, '+(USER.nombre||USER.email.split('@')[0])+'!';

    // Permission-based nav — each module is independent
    const toggle=(id,perm)=>{const el=$(id);if(el)el.classList.toggle('hidden',perms.indexOf(perm)<0)};
    toggle('navDash','dashboard');toggle('navRep','reportes');
    toggle('navUsuarios','usuarios');toggle('navElecciones','elecciones');
    toggle('navEvaluadores','evaluadores');toggle('navConfig','parametros');

    const a=DATA.analytics||{},mp=DATA.miPromedio?parseFloat(DATA.miPromedio).toFixed(1):'—';
    $('vSt').innerHTML=
      '<div class="st sb"><div class="st-i">⭐</div><div class="st-n">'+mp+'</div><div class="st-l">Mi Promedio</div></div>'+
      '<div class="st sl"><div class="st-i">👥</div><div class="st-n">'+(DATA.colaboradores?.length||0)+'</div><div class="st-l">Por Evaluar</div></div>'+
      '<div class="st sa"><div class="st-i">📊</div><div class="st-n">'+(a.tasaParticipacion||0)+'%</div><div class="st-l">Participación</div></div>';
    this.renderFilters();this.renderAreas();
  },
  renderFilters(){const s=$('fSede');s.innerHTML='<option value="">Todas las sedes</option>';(DATA.sedes||[]).forEach(x=>{s.innerHTML+='<option value="'+esc(x)+'">'+esc(x)+'</option>'});s.onchange=()=>this.renderAreas();$('fS').oninput=()=>this.renderAreas()},
  renderAreas(){
    const ct=$('areaCont'),search=$('fS').value.toLowerCase(),sede=$('fSede').value;
    let cl=DATA.colaboradores||[];
    if(sede)cl=cl.filter(x=>x.sede===sede);if(search)cl=cl.filter(x=>x.nombre.toLowerCase().includes(search));
    const g={};cl.forEach(x=>{const a=x.area||'Sin Área';if(!g[a])g[a]=[];g[a].push(x)});
    const nm=Object.keys(g).sort();
    if(!nm.length){ct.innerHTML='<div class="empty"><div class="empty-i">🔍</div><div class="empty-t">No se encontraron colaboradores</div></div>';return}
    if(!DATA.eleccionActiva){ct.innerHTML='<div class="empty"><div class="empty-i">🗓️</div><div class="empty-t">No hay elección activa. Contacta al administrador.</div></div>';return}
    ct.innerHTML=nm.map((area,idx)=>{
      const ls=g[area],col=gc(idx),dn=ls.filter(x=>DATA.evaluacionesUnicas?.[USER.email+'|'+x.id]).length,pn=ls.length-dn;
      return '<div class="as" style="animation-delay:'+idx*.04+'s"><div class="ah op" onclick="App.tog(this)" data-a="'+esc(area)+'"><div class="ah-l"><div class="ah-ic" style="background:'+col.bg+';color:'+col.ic+';border:1.5px solid '+col.br+'">'+area.charAt(0)+'</div><div><div class="ah-nm">'+esc(area)+'</div><div class="ah-ct">'+ls.length+' colab. · '+(pn>0?pn+' pendiente'+(pn>1?'s':''):'✓ Completo')+'</div></div></div><span class="ah-ch">▼</span></div><div class="ab op" id="bd-'+area.replace(/\s/g,'_')+'">'+this.grid(ls,area)+'</div></div>';
    }).join('');
  },
  grid(ls,area){
    if(!window._cd)window._cd={};
    ls.forEach(c=>{window._cd[c.id]=c;window._cd[c.id]._area=area});
    return '<div class="cg">'+ls.map(c=>{
      const k=USER.email+'|'+c.id,done=DATA.evaluacionesUnicas?.[k],pm=DATA.promedios?.[String(c.id)],pv=pm?parseFloat(pm):0,pt=pm?pv.toFixed(1):'—',bw=pm?(pv/10*100):0;
      return '<div class="cc '+(done?'dn':'')+'"><div class="dn-b">✓ Evaluado</div><img class="av" src="'+(c.fotoUrl||fb(c.nombre))+'" onerror="this.src=\''+fb(c.nombre)+'\'"><div class="ci"><div class="cn">'+esc(c.nombre)+'</div><div class="cm">'+esc(c.sede||'')+'</div><div class="cs-r"><span class="cs">'+pt+'</span><div class="bar-bg"><div class="bar-f" style="width:'+bw+'%"></div></div></div>'+(done?'':'<button class="btn-ev" onclick="App.openEvalById(\''+c.id+'\')">Evaluar</button>')+'</div></div>';
    }).join('')+'</div>';
  },
  tog(h){h.classList.toggle('op');const b=$('bd-'+h.dataset.a.replace(/\s/g,'_'));if(b)b.classList.toggle('op')},

  // ── Eval Modal ──
  openEvalById(id){const c=window._cd?.[id];if(!c)return;this.openEval(c)},
  openEval(c){
    EV={id:c.id,nombre:c.nombre,ratings:{},_params:[]};
    $('evalNm').textContent=c.nombre;$('evalMt').textContent=[c.area,c.sede].filter(Boolean).join(' · ');
    $('evalFoto').src=c.fotoUrl||fb(c.nombre);$('evalFoto').onerror=function(){this.src=fb(c.nombre)};$('evalCom').value='';
    const ap=DATA.parametrosArea?.[c._area||c.area];
    const params=ap&&ap.length?ap:(DATA.parametros||[]);EV._params=params;
    $('evalBd').innerHTML=params.map(p=>'<div class="rb"><div class="rl">'+esc(p)+'</div><div class="rr" data-param="'+esc(p)+'">'+[1,2,3,4,5,6,7,8,9,10].map(n=>'<button type="button" class="rb-b" data-v="'+n+'">'+n+'</button>').join('')+'</div></div>').join('');
    $('evalOv').classList.add('open');
  },
  closeEval(){$('evalOv').classList.remove('open')},
  async submitEval(){
    const params=EV._params||[],miss=params.filter(p=>!EV.ratings[p]);
    if(miss.length){toast('Falta: '+miss.join(', '),'err');return}
    const btn=$('evalBtn');btn.disabled=true;btn.textContent='Enviando...';
    try{
      const res=await api.guardarVotos({evaluadoId:EV.id,evaluadoNombre:EV.nombre,calificaciones:params.map(p=>({parametro:p,puntuacion:EV.ratings[p]})),sede:$('fSede').value||'',comentario:$('evalCom').value});
      if(res.success){toast(res.message||'Guardado','ok');DATA.evaluacionesUnicas[USER.email+'|'+EV.id]=true;if(res.nuevoPromedio)DATA.promedios[String(EV.id)]=res.nuevoPromedio;this.renderAreas();this.closeEval()}
      else toast(res.message||'Error','err');
    }catch(e){toast(e.message,'err')}
    btn.disabled=false;btn.textContent='Enviar Evaluación';
  },

  // ── Dashboard ──
  async loadDash(){
    try{
      const d=await api.getDashboard(),a=d.analytics||{};
      const ct=d.eleccion?d.eleccion.nombre:'Sin elección';
      $('dSt').innerHTML='<div class="st sb"><div class="st-i">👥</div><div class="st-n">'+(a.totalColaboradores||0)+'</div><div class="st-l">Colaboradores</div></div><div class="st sg"><div class="st-i">✅</div><div class="st-n">'+(a.evaluadosUnicos||0)+'</div><div class="st-l">Calificados</div></div><div class="st sa"><div class="st-i">📊</div><div class="st-n">'+(a.tasaParticipacion||0)+'%</div><div class="st-l">Participación</div></div><div class="st sl"><div class="st-i">🗓️</div><div class="st-n" style="font-size:1rem">'+esc(ct)+'</div><div class="st-l">Elección</div></div>';
      const topA=d.topPorArea||{},topS=d.topPorSede||{};
      $('topAreaCont').innerHTML=Object.values(topA).map(t=>'<div class="top-card"><img src="'+(t.foto||fb(t.nombre))+'" onerror="this.src=\''+fb(t.nombre)+'\'"><div class="top-card-info"><div class="top-card-name">'+esc(t.nombre)+'</div><div class="top-card-meta">📂 '+esc(t.area||'')+'</div></div><div class="top-card-score">'+parseFloat(t.prom).toFixed(1)+'</div></div>').join('')||'<div class="empty"><div class="empty-t">Sin datos</div></div>';
      $('topSedeCont').innerHTML=Object.values(topS).map(t=>'<div class="top-card"><img src="'+(t.foto||fb(t.nombre))+'" onerror="this.src=\''+fb(t.nombre)+'\'"><div class="top-card-info"><div class="top-card-name">'+esc(t.nombre)+'</div><div class="top-card-meta">🏢 '+esc(t.sede||'')+'</div></div><div class="top-card-score">'+parseFloat(t.prom).toFixed(1)+'</div></div>').join('')||'<div class="empty"><div class="empty-t">Sin datos</div></div>';
      const pr=a.promedios||{},c1=$('cD')?.getContext('2d');
      if(c1){if(CHS.d)CHS.d.destroy();CHS.d=new Chart(c1,{type:'bar',data:{labels:Object.keys(pr),datasets:[{data:Object.values(pr),backgroundColor:'#97D700',borderColor:'#10069F',borderWidth:1.5,borderRadius:5,barThickness:22}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:10}}}})}
      const tr=d.tendencias||[],c2=$('cT')?.getContext('2d');
      if(c2&&tr.length){if(CHS.t)CHS.t.destroy();CHS.t=new Chart(c2,{type:'line',data:{labels:tr.map(t=>t.fecha),datasets:[{data:tr.map(t=>t.promedio),borderColor:'#10069F',backgroundColor:'rgba(16,6,159,.05)',tension:.35,fill:true,pointRadius:3}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:10}}}})}
      $('tT').innerHTML='<thead><tr><th>Fecha</th><th>Promedio</th><th>Votos</th></tr></thead><tbody>'+tr.map(t=>'<tr><td>'+t.fecha+'</td><td>'+t.promedio+'/10</td><td>'+t.votos+'</td></tr>').join('')+'</tbody>';
    }catch(e){toast(e.message,'err')}
  },

  // ── Reports ──
  async loadRep(){
    try{
      const d=await api.getAllData(),cl=d.colaboradores||[],pr=d.promedios||{},g={};
      cl.forEach(c=>{const a=c.area||'Sin Área';if(!g[a])g[a]=[];g[a].push(c)});
      let rows='';Object.keys(g).sort().forEach(a=>{rows+='<tr><td colspan="4" style="background:var(--s0);font-weight:700;color:var(--b8);padding:8px 12px;font-size:.74rem">📂 '+esc(a)+'</td></tr>';g[a].forEach(c=>{const p=pr[String(c.id)];rows+='<tr><td>'+esc(c.nombre)+'</td><td>'+esc(c.sede||'—')+'</td><td>'+(p?parseFloat(p).toFixed(1)+'/10':'—')+'</td><td>'+stars_(p)+'</td></tr>'})});
      $('tR').innerHTML='<thead><tr><th>Colaborador</th><th>Sede</th><th>Promedio</th><th>Rating</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" style="text-align:center;padding:20px">Sin datos</td></tr>')+'</tbody>';
    }catch(e){toast(e.message,'err')}
  },
  async expX(){
    toast('Generando...','info');
    try{const d=await api.exportReport();if(!d?.rows)return;const csv=d.rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='reporte_'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();document.body.removeChild(a);toast('Descargado','ok')}catch(e){toast(e.message,'err')}
  },

  // ══════════════════════════════════════
  // TAB: USUARIOS (permiso: usuarios)
  // ══════════════════════════════════════
  _users:[],
  async loadUsers(){
    try{
      this._users=await api.getUsuarios();
      $('usrBody').innerHTML=this._users.map(u=>'<tr><td><span class="usr-status '+(u.activo?'active':'inactive')+'"></span>'+esc(u.email)+'</td><td>'+esc(u.nombre)+'</td><td><span class="ch ch-r" style="font-size:.65rem">'+esc(u.rol)+'</span></td><td>'+esc(u.area||'—')+'</td><td>'+esc(u.sede||'—')+'</td><td style="display:flex;gap:3px;flex-wrap:wrap"><button class="btn bo" style="padding:3px 7px;font-size:.65rem" onclick="App.openEditUser(\''+esc(u.email)+'\')">✏️</button><button class="btn bo" style="padding:3px 7px;font-size:.65rem" onclick="App.resetPwd(\''+esc(u.email)+'\')">🔑</button><button class="btn bd" style="padding:3px 7px;font-size:.65rem" onclick="App.delUser(\''+esc(u.email)+'\')">🗑</button></td></tr>').join('');
    }catch(e){toast(e.message,'err')}
  },
  _popSelects(areaId,sedeId){
    const areas=DATA?.areas||ADM.ar||[];const sedes=DATA?.sedes||ADM.se||[];
    const a=$(areaId),s=$(sedeId);
    if(a&&a.tagName==='SELECT'){a.innerHTML='<option value="">—</option>'+areas.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('')}
    if(s&&s.tagName==='SELECT'){s.innerHTML='<option value="">—</option>'+sedes.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('')}
  },
  openNewUser(){$('nuEmail').value='';$('nuNombre').value='';$('nuRol').value='votante';$('nuPwd').value='';if($('nuFoto'))$('nuFoto').value='';document.querySelectorAll('.nu-perm').forEach(c=>{c.checked=false});this._popSelects('nuArea','nuSede');$('nuOv').classList.add('open')},
  closeNewUser(){$('nuOv').classList.remove('open')},
  async saveNewUser(){
    const perms=Array.from(document.querySelectorAll('.nu-perm:checked')).map(c=>c.value).join(',');
    const d={email:$('nuEmail').value.trim(),nombre:$('nuNombre').value.trim(),rol:$('nuRol').value,area:$('nuArea').value,sede:$('nuSede').value,password:$('nuPwd').value,permisos:perms,foto:$('nuFoto')?$('nuFoto').value.trim():''};
    if(!d.email||!d.nombre){toast('Email y nombre requeridos','err');return}
    try{const r=await api.crearUsuario(d);if(r.success){toast('Creado','ok');this.closeNewUser();this.loadUsers()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}
  },
  // ── Edit User Modal ──
  _editingEmail:'',
  openEditUser(email){
    const u=this._users.find(x=>x.email===email);if(!u)return;
    this._editingEmail=email;
    $('edEmail').textContent=email;
    $('edNombre').value=u.nombre||'';
    $('edRol').value=u.rol||'votante';
    $('edActivo').value=u.activo?'true':'false';
    if($('edFoto'))$('edFoto').value=u.foto||'';
    this._popSelects('edArea','edSede');
    // Set current values after populating selects
    setTimeout(()=>{$('edArea').value=u.area||'';$('edSede').value=u.sede||''},50);
    // Set permisos checkboxes
    const currentPerms=(u.permisos||'').split(',').map(p=>p.trim());
    document.querySelectorAll('.ed-perm').forEach(cb=>{cb.checked=currentPerms.indexOf(cb.value)>=0});
    $('edOv').classList.add('open');
  },
  closeEditUser(){$('edOv').classList.remove('open')},
  async saveEditUser(){
    const perms=Array.from(document.querySelectorAll('.ed-perm:checked')).map(c=>c.value).join(',');
    const d={email:this._editingEmail,nombre:$('edNombre').value.trim(),rol:$('edRol').value,area:$('edArea').value,sede:$('edSede').value,activo:$('edActivo').value==='true',permisos:perms,foto:$('edFoto')?$('edFoto').value.trim():undefined};
    try{const r=await api.editarUsuario(d);if(r.success){toast('Actualizado','ok');this.closeEditUser();this.loadUsers()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}
  },
  async resetPwd(email){if(!confirm('¿Reiniciar contraseña de '+email+'?'))return;try{const r=await api.resetPassword(email);if(r.success){toast('Reiniciada','ok');alert('Contraseña temporal: '+(r.tempPassword||'Muni2025'))}else toast(r.message,'err')}catch(e){toast(e.message,'err')}},
  delUser(email){if(!confirm('¿Eliminar '+email+'?'))return;api.eliminarUsuario(email).then(r=>{if(r.success){toast('Eliminado','ok');this.loadUsers()}else toast(r.message,'err')}).catch(e=>toast(e.message,'err'))},

  // ══════════════════════════════════════
  // TAB: ELECCIONES (permiso: elecciones)
  // ══════════════════════════════════════
  async loadElecciones(){
    const ct=$('elecCont');if(!ct)return;
    try{
      const els=await api.getElecciones();
      if(!els.length){ct.innerHTML='<div class="empty"><div class="empty-t">No hay elecciones. Creá la primera.</div></div>';return}
      ct.innerHTML=els.map(c=>{
        const isA=c.estado==='activa';
        const badge=isA?'<span style="background:var(--g0);color:var(--g6);padding:2px 8px;border-radius:20px;font-size:.68rem;font-weight:700">● Activa</span>':c.estado==='cerrada'?'<span style="background:var(--s1);color:var(--s4);padding:2px 8px;border-radius:20px;font-size:.68rem">Cerrada</span>':'<span style="background:var(--b0);color:var(--b8);padding:2px 8px;border-radius:20px;font-size:.68rem">Borrador</span>';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--s2);border-radius:10px;margin-bottom:8px;background:var(--s0);flex-wrap:wrap;gap:8px"><div><strong style="font-size:.85rem">'+esc(c.nombre)+'</strong> '+badge+'</div><div style="display:flex;gap:4px">'
          +(!isA&&c.estado!=='cerrada'?'<button class="btn ba" style="padding:4px 10px;font-size:.68rem" onclick="App.activarElec(\''+c.id+'\')">▶ Activar</button>':'')
          +(isA?'<button class="btn bd" style="padding:4px 10px;font-size:.68rem" onclick="App.cerrarElec(\''+c.id+'\')">⏹ Cerrar</button>':'')
          +'</div></div>';
      }).join('');
    }catch(e){ct.innerHTML='<div class="empty">'+e.message+'</div>'}
  },
  async crearElec(){const n=prompt('Nombre de la elección (ej: Marzo 2026):');if(!n)return;try{const r=await api.crearEleccion({nombre:n});if(r.success){toast('Elección creada','ok');this.loadElecciones()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}},
  async activarElec(id){if(!confirm('¿Activar esta elección? La anterior se cerrará.'))return;try{const r=await api.activarEleccion(id);if(r.success){toast('Activada','ok');this.loadElecciones()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}},
  async cerrarElec(id){if(!confirm('¿Cerrar esta elección?'))return;try{const r=await api.cerrarEleccion(id);if(r.success){toast('Cerrada','ok');this.loadElecciones()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}},

  // ══════════════════════════════════════
  // TAB: EVALUADORES (permiso: evaluadores)
  // ══════════════════════════════════════
  async loadSupEvals(){
    const ct=$('supEvalCont');if(!ct)return;
    try{
      const sups=await api.getEvaluadoresSup();
      const areas=DATA?.areas||ADM.ar||[];
      if(!sups.length){ct.innerHTML='<div class="empty"><div class="empty-t">No hay supervisores ni evaluadores registrados</div></div>';return}
      ct.innerHTML=sups.map(s=>{
        const cur=(s.evaluadores||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
        const safeId=s.email.replace(/[@.]/g,'_');
        return '<div style="margin-bottom:16px;padding:14px;border:1px solid var(--s2);border-radius:10px;background:var(--s0)">'
          +'<div style="font-weight:700;font-size:.85rem;margin-bottom:8px">'+esc(s.nombre)+' <span style="color:var(--s4);font-weight:400;font-size:.75rem">('+esc(s.email)+')</span></div>'
          +'<div class="fl" style="margin-bottom:4px">1. Seleccioná áreas:</div>'
          +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'+areas.map(a=>'<label style="font-size:.74rem;display:flex;align-items:center;gap:3px;cursor:pointer;background:var(--w);padding:4px 10px;border-radius:6px;border:1px solid var(--s2)"><input type="checkbox" class="sup-area-cb" data-sup="'+esc(s.email)+'" value="'+esc(a)+'"'+(cur.indexOf(a.toLowerCase())>=0?' checked':'')+'>'+esc(a)+'</label>').join('')+'</div>'
          +'<div class="fl" style="margin-bottom:4px">2. Colaboradores:</div>'
          +'<div id="sup-c-'+safeId+'" style="margin-bottom:8px"><div style="font-size:.75rem;color:var(--s4)">Presioná "Cargar" para ver la lista</div></div>'
          +'<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn bo" style="font-size:.72rem;padding:6px 12px" onclick="App.loadSupColabs(\''+esc(s.email)+'\')">🔄 Cargar colaboradores</button><button class="btn bp" style="font-size:.72rem;padding:6px 12px" onclick="App.saveSupEvals(\''+esc(s.email)+'\')">💾 Guardar</button></div></div>';
      }).join('');
    }catch(e){ct.innerHTML='<div class="empty">'+e.message+'</div>'}
  },
  async loadSupColabs(supEmail){
    const safeId=supEmail.replace(/[@.]/g,'_');const ct=$('sup-c-'+safeId);if(!ct)return;
    const areas=[];document.querySelectorAll('.sup-area-cb[data-sup="'+supEmail+'"]').forEach(cb=>{if(cb.checked)areas.push(cb.value)});
    if(!areas.length){ct.innerHTML='<div style="font-size:.75rem;color:var(--s4)">Seleccioná al menos un área</div>';return}
    try{
      const colabs=await api.getColabsByArea(areas);
      const sups=await api.getEvaluadoresSup();
      const thisSup=sups.find(s=>s.email===supEmail);
      const cur=(thisSup?.evaluadores||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
      ct.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:6px"><label style="font-size:.74rem;display:flex;align-items:center;gap:3px;cursor:pointer;background:var(--b0);padding:4px 10px;border-radius:6px;border:1px solid var(--b8);font-weight:600"><input type="checkbox" class="sup-all-cb" data-sup="'+esc(supEmail)+'" onchange="App.togAllColabs(\''+esc(supEmail)+'\',this.checked)"> Todos</label>'
        +colabs.map(c=>'<label style="font-size:.74rem;display:flex;align-items:center;gap:3px;cursor:pointer;background:var(--w);padding:4px 10px;border-radius:6px;border:1px solid var(--s2)"><input type="checkbox" class="sup-colab-cb" data-sup="'+esc(supEmail)+'" value="'+esc(c.email)+'"'+(cur.indexOf(c.email.toLowerCase())>=0?' checked':'')+'>'+esc(c.nombre)+'</label>').join('')+'</div>';
    }catch(e){ct.innerHTML='<div style="font-size:.75rem;color:var(--r5)">'+e.message+'</div>'}
  },
  togAllColabs(sup,chk){document.querySelectorAll('.sup-colab-cb[data-sup="'+sup+'"]').forEach(cb=>{cb.checked=chk})},
  async saveSupEvals(supEmail){
    const colabs=[];document.querySelectorAll('.sup-colab-cb[data-sup="'+supEmail+'"]').forEach(cb=>{if(cb.checked)colabs.push(cb.value)});
    try{const r=await api.asignarEvaluadores(supEmail,colabs.join(','));if(r.success)toast('Asignados','ok');else toast(r.message,'err')}catch(e){toast(e.message,'err')}
  },

  // ══════════════════════════════════════
  // TAB: CONFIG (permiso: parametros)
  // ══════════════════════════════════════
  async loadConfig(){
    try{
      const s=await api.getAdminStats();
      $('cfgSt').innerHTML='<div class="st sb"><div class="st-i">👥</div><div class="st-n">'+(s.totalColaboradores||0)+'</div><div class="st-l">Colaboradores</div></div><div class="st sl"><div class="st-i">📋</div><div class="st-n">'+(s.totalAreas||0)+'</div><div class="st-l">Áreas</div></div>';
      ADM={p:s.parametros||[],ps:s.parametrosSupervisores||[],ar:s.areas||[],se:s.sedes||[]};
      this.adm.renderAll();this.loadParamsArea();
    }catch(e){toast(e.message,'err')}
  },
  async loadParamsArea(){
    const ct=$('paramsAreaCont');if(!ct)return;
    try{
      const pa=await api.getParametrosArea();const areas=ADM.ar||[];const gp=ADM.p||[];
      ct.innerHTML=areas.map(a=>{
        const ap=pa[a]||[];const has=ap.length>0;
        return '<div style="margin-bottom:12px;padding:12px;border:1px solid var(--s2);border-radius:10px;background:var(--s0)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong style="font-size:.85rem">'+esc(a)+'</strong><span style="font-size:.68rem;color:var(--s4)">'+(has?ap.length+' personalizados':'Globales ('+gp.length+')')+'</span></div>'
          +'<div id="pa-'+a.replace(/\s/g,'_')+'">'+(has?ap:gp).map(p=>'<div class="adm-it"><input class="adm-in pa-in" data-area="'+esc(a)+'" value="'+esc(p)+'"><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button></div>').join('')+'</div>'
          +'<div style="display:flex;gap:6px;margin-top:6px"><button class="btn ba" style="font-size:.7rem;padding:4px 10px" onclick="App.addPA(\''+esc(a)+'\')">+</button><button class="btn bp" style="font-size:.7rem;padding:4px 10px" onclick="App.savePA(\''+esc(a)+'\')">💾</button><button class="btn bo" style="font-size:.7rem;padding:4px 10px" onclick="App.resetPA(\''+esc(a)+'\')">↺ Globales</button></div></div>';
      }).join('')||'<div class="empty"><div class="empty-t">No hay áreas</div></div>';
    }catch(e){toast(e.message,'err')}
  },
  addPA(a){const ct=$('pa-'+a.replace(/\s/g,'_'));if(!ct)return;const d=document.createElement('div');d.className='adm-it';d.innerHTML='<input class="adm-in pa-in" data-area="'+esc(a)+'" value="Nuevo"><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button>';ct.appendChild(d)},
  async savePA(a){const v=Array.from(document.querySelectorAll('.pa-in[data-area="'+a+'"]')).map(i=>i.value.trim()).filter(Boolean);try{const r=await api.saveParametrosArea(a,v);if(r.success)toast(a+' guardado','ok');else toast(r.message,'err')}catch(e){toast(e.message,'err')}},
  async resetPA(a){if(!confirm('¿Restaurar globales para '+a+'?'))return;try{const r=await api.saveParametrosArea(a,[]);if(r.success){toast('Restaurado','ok');this.loadParamsArea()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}},

  adm:{
    renderAll(){this._r('adP',ADM.p,'p');this._r('adPS',ADM.ps,'ps');this._r('adAR',ADM.ar,'ar');this._r('adSE',ADM.se,'se')},
    _r(id,arr,k){$(id).innerHTML=arr.map((v,i)=>'<div class="adm-it"><input class="adm-in ai-'+k+'" value="'+esc(v)+'"><button class="bd-sm" onclick="App.adm.rm(\''+k+'\','+i+')">🗑</button></div>').join('')},
    add(k){ADM[k].push('Nuevo');this.renderAll()},rm(k,i){if(ADM[k].length<=1){toast('Mínimo 1','err');return}ADM[k].splice(i,1);this.renderAll()},
    _v(k){return Array.from(document.querySelectorAll('.ai-'+k)).map(e=>e.value.trim()).filter(Boolean)},
    async save(k){const map={p:'saveParametros',ps:'saveParametrosSup',ar:'saveAreas',se:'saveSedes'};try{await api[map[k]](this._v(k));ADM[k]=this._v(k);toast('Guardado','ok')}catch(e){toast(e.message,'err')}}
  },
};
function stars_(p){if(!p)return'☆☆☆☆☆';const v=parseFloat(p)/2;let s='';for(let i=1;i<=5;i++)s+=i<=Math.round(v)?'★':'☆';return'<span style="color:#f59e0b;letter-spacing:2px">'+s+'</span>'}
window.App=App;