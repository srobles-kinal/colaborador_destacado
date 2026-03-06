/**
 * app.js v5.1 — All fixes applied
 * - Rating: event delegation (fixes broken onclick)
 * - Login: shows user photo after entering email
 * - Nav: permission-based visibility
 * - Dashboard: top colaborador per area/sede
 * - Password toggle (show/hide)
 */

let USER=null,DATA=null,CHS={},EV={id:null,nombre:'',ratings:{}},ADM={p:[],ps:[],ar:[],se:[]};

const COLS=[{bg:'#eef2ff',br:'#818cf8',ic:'#4f46e5'},{bg:'#ecfdf5',br:'#34d399',ic:'#059669'},{bg:'#fffbeb',br:'#fbbf24',ic:'#d97706'},{bg:'#fef2f2',br:'#f87171',ic:'#dc2626'},{bg:'#f0f9ff',br:'#38bdf8',ic:'#0284c7'},{bg:'#fdf4ff',br:'#c084fc',ic:'#9333ea'}];
function gc(i){return COLS[i%COLS.length]}
function $(s){return document.getElementById(s)}
function toast(m,t='info'){const e=document.createElement('div');e.className='tt tt-'+t;e.textContent=m;$('toasts').appendChild(e);setTimeout(()=>{e.style.opacity='0';e.style.transition='opacity .3s';setTimeout(()=>e.remove(),300)},3500)}
function fb(n){const c=(n||'?').charAt(0);return"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 50'><rect fill='%23e2e8f0' width='50' height='50' rx='8'/><text x='50%25' y='56%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-size='18' font-family='sans-serif'>"+c+"</text></svg>"}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

/* ── Nav ── */
document.querySelectorAll('.nb').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.nb').forEach(n=>n.classList.remove('on'));
    document.querySelectorAll('.pn').forEach(p=>p.classList.remove('on'));
    b.classList.add('on');$('p-'+b.dataset.tab).classList.add('on');
    if(b.dataset.tab==='dash')App.loadDash();
    if(b.dataset.tab==='rep')App.loadRep();
    if(b.dataset.tab==='adm')App.loadAdm();
  });
});

/* ── Password toggle ── */
document.querySelectorAll('.pwd-toggle').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const input=btn.previousElementSibling;
    if(input.type==='password'){input.type='text';btn.textContent='🙈'}
    else{input.type='password';btn.textContent='👁️'}
  });
});

/* ── Rating: event delegation (FIX for broken onclick) ── */
document.addEventListener('click',function(e){
  const btn=e.target.closest('.rb-b');
  if(!btn)return;
  e.preventDefault();
  const param=btn.parentElement.dataset.param;
  const val=parseInt(btn.dataset.v);
  if(!param||isNaN(val))return;
  EV.ratings[param]=val;
  btn.parentElement.querySelectorAll('.rb-b').forEach(b=>{
    b.classList.toggle('on',parseInt(b.dataset.v)<=val);
  });
});

/* ── Password strength ── */
document.addEventListener('DOMContentLoaded',()=>{
  $('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')App.login()});
  $('pwdConfirm').addEventListener('keydown',e=>{if(e.key==='Enter')App.changePwd()});
  const pwdIn=$('pwdNew');
  if(pwdIn)pwdIn.addEventListener('input',()=>{
    const v=pwdIn.value,bar=$('pwdBar');
    if(!bar)return;
    if(v.length<6)bar.className='pwd-strength weak';
    else if(v.length<10)bar.className='pwd-strength medium';
    else bar.className='pwd-strength strong';
  });
});

/* ══════════════════════════════════════ */
const App={

  /* ── Auth ── */
  async login(){
    const u=$('loginUser').value.trim(),p=$('loginPass').value;
    if(!u||!p){$('loginErr').textContent='Completá ambos campos';return}
    const btn=$('loginBtn');btn.disabled=true;btn.textContent='Ingresando...';
    try{
      const res=await api.login(u,p);
      if(res.success){
        api.setToken(res.token);USER=res.usuario;
        if(USER.primerIngreso){
          $('pwdOv').classList.add('open');
          $('pwdWelcome').textContent='¡Hola, '+(USER.nombre||USER.email.split('@')[0])+'!';
          // Show photo in pwd screen too
          const pwdAvatar=$('pwdAvatar');
          if(pwdAvatar&&USER.foto){pwdAvatar.src=USER.foto;pwdAvatar.classList.add('show')}
        }else{this.start()}
      }else{$('loginErr').textContent=res.message||'Error'}
    }catch(e){$('loginErr').textContent=e.message}
    btn.disabled=false;btn.textContent='Ingresar';
  },

  async changePwd(){
    const n=$('pwdNew').value,c=$('pwdConfirm').value;
    if(n.length<6){$('pwdErr').textContent='Mínimo 6 caracteres';return}
    if(n!==c){$('pwdErr').textContent='Las contraseñas no coinciden';return}
    const btn=$('pwdBtn');btn.disabled=true;btn.textContent='Guardando...';
    try{
      const res=await api.cambiarPassword(n);
      if(res.success){$('pwdOv').classList.remove('open');toast('Contraseña actualizada','ok');this.start()}
      else{$('pwdErr').textContent=res.message}
    }catch(e){$('pwdErr').textContent=e.message}
    btn.disabled=false;btn.textContent='Guardar Contraseña';
  },

  async logout(){
    try{await api.logout()}catch(e){}
    api.setToken(null);USER=null;DATA=null;
    $('appShell').classList.remove('show');$('loginScreen').style.display='flex';
    $('loginPass').value='';$('loginErr').textContent='';
    // Reset avatar
    const la=$('loginAvatar');if(la){la.classList.remove('show');la.src=''}
  },

  async start(){
    $('loginScreen').style.display='none';$('appShell').classList.add('show');
    try{DATA=await api.getAllData();this.render();toast('Datos cargados','ok')}catch(e){toast(e.message,'err')}
  },

  /* ── Render ── */
  render(){
    if(!DATA)return;
    const perms=DATA.usuario.permisos||[];
    $('chipU').textContent=USER.nombre||USER.email.split('@')[0];
    $('chipR').textContent=USER.rol;
    $('chipA').textContent=USER.area||'Todas';
    $('welc').textContent='¡Hola, '+(USER.nombre||USER.email.split('@')[0])+'!';

    // Top avatar in topbar
    const topAv=$('topAvatar');
    if(topAv){topAv.src=USER.foto||fb(USER.nombre);topAv.onerror=function(){this.src=fb(USER.nombre)}}

    // Permission-based nav
    const navDash=$('navDash'),navRep=$('navRep'),navAdm=$('navAdm');
    if(navDash)navDash.classList.toggle('hidden',perms.indexOf('dashboard')<0);
    if(navRep)navRep.classList.toggle('hidden',perms.indexOf('reportes')<0);
    if(navAdm)navAdm.classList.toggle('hidden',perms.indexOf('admin')<0);

    const a=DATA.analytics||{};
    $('vSt').innerHTML=
      '<div class="st sb"><div class="st-i">👥</div><div class="st-n">'+(DATA.colaboradores?.length||0)+'</div><div class="st-l">Colaboradores</div></div>'+
      '<div class="st sl"><div class="st-i">📝</div><div class="st-n">'+(a.totalVotos||0)+'</div><div class="st-l">Evaluaciones</div></div>'+
      '<div class="st sa"><div class="st-i">📊</div><div class="st-n">'+(a.tasaParticipacion||0)+'%</div><div class="st-l">Participación</div></div>';

    this.renderFilters();this.renderAreas();
  },

  renderFilters(){
    const s=$('fSede');s.innerHTML='<option value="">Todas las sedes</option>';
    (DATA.sedes||[]).forEach(x=>{s.innerHTML+='<option value="'+esc(x)+'">'+esc(x)+'</option>'});
    s.onchange=()=>this.renderAreas();$('fS').oninput=()=>this.renderAreas();
  },

  renderAreas(){
    const ct=$('areaCont'),search=$('fS').value.toLowerCase(),sede=$('fSede').value;
    let cl=DATA.colaboradores||[];
    if(sede)cl=cl.filter(x=>x.sede===sede);
    if(search)cl=cl.filter(x=>x.nombre.toLowerCase().includes(search));
    const g={};cl.forEach(x=>{const a=x.area||'Sin Área';if(!g[a])g[a]=[];g[a].push(x)});
    const nm=Object.keys(g).sort();
    if(!nm.length){ct.innerHTML='<div class="empty"><div class="empty-i">🔍</div><div class="empty-t">No se encontraron colaboradores</div></div>';return}

    ct.innerHTML=nm.map((area,idx)=>{
      const ls=g[area],col=gc(idx),dn=ls.filter(x=>DATA.evaluacionesUnicas?.[USER.email+'|'+x.id]).length,pn=ls.length-dn;
      return '<div class="as" style="animation-delay:'+idx*.04+'s">'+
        '<div class="ah op" onclick="App.tog(this)" data-a="'+esc(area)+'"><div class="ah-l">'+
          '<div class="ah-ic" style="background:'+col.bg+';color:'+col.ic+';border:1.5px solid '+col.br+'">'+area.charAt(0)+'</div>'+
          '<div><div class="ah-nm">'+esc(area)+'</div><div class="ah-ct">'+ls.length+' colab. · '+(pn>0?pn+' pendiente'+(pn>1?'s':''):'✓ Completo')+'</div></div>'+
        '</div><span class="ah-ch">▼</span></div>'+
        '<div class="ab op" id="bd-'+area.replace(/\s/g,'_')+'">'+this.grid(ls)+'</div></div>';
    }).join('');
  },

  grid(ls){
    // Store collaborator data in a lookup for openEval
    if(!window._colabData)window._colabData={};
    ls.forEach(c=>{window._colabData[c.id]=c});

    return '<div class="cg">'+ls.map(c=>{
      const k=USER.email+'|'+c.id,done=DATA.evaluacionesUnicas?.[k];
      const pm=DATA.promedios?.[String(c.id)],pv=pm?parseFloat(pm):0,pt=pm?pv.toFixed(1):'—',bw=pm?(pv/10*100):0;
      return '<div class="cc '+(done?'dn':'')+'"><div class="dn-b">✓ Evaluado</div>'+
        '<img class="av" src="'+(c.fotoUrl||fb(c.nombre))+'" onerror="this.src=\''+fb(c.nombre)+'\'">'+
        '<div class="ci"><div class="cn">'+esc(c.nombre)+'</div><div class="cm">'+esc(c.sede||'')+'</div>'+
          '<div class="cs-r"><span class="cs">'+pt+'</span><div class="bar-bg"><div class="bar-f" style="width:'+bw+'%"></div></div></div>'+
          (done?'':'<button class="btn-ev" data-cid="'+c.id+'" onclick="App.openEvalById(\''+c.id+'\')">Evaluar</button>')+
        '</div></div>';
    }).join('')+'</div>';
  },

  tog(h){h.classList.toggle('op');const b=$('bd-'+h.dataset.a.replace(/\s/g,'_'));if(b)b.classList.toggle('op')},

  /* ── Eval Modal (FIX: no inline params, use data lookup) ── */
  openEvalById(id){
    const c=window._colabData?.[id];
    if(!c)return;
    this.openEval(c);
  },

  openEval(c){
    EV={id:c.id,nombre:c.nombre,ratings:{}};
    $('evalNm').textContent=c.nombre;
    $('evalMt').textContent=[c.area,c.sede].filter(Boolean).join(' · ');
    $('evalFoto').src=c.fotoUrl||fb(c.nombre);
    $('evalFoto').onerror=function(){this.src=fb(c.nombre)};
    $('evalCom').value='';

    // Build rating blocks with data-param attribute (event delegation reads this)
    $('evalBd').innerHTML=(DATA.parametros||[]).map(p=>{
      return '<div class="rb"><div class="rl">'+esc(p)+'</div>'+
        '<div class="rr" data-param="'+esc(p)+'">'+
        [1,2,3,4,5,6,7,8,9,10].map(n=>'<button type="button" class="rb-b" data-v="'+n+'">'+n+'</button>').join('')+
        '</div></div>';
    }).join('');

    $('evalOv').classList.add('open');
  },

  closeEval(){$('evalOv').classList.remove('open')},

  async submitEval(){
    const params=DATA.parametros||[],miss=params.filter(p=>!EV.ratings[p]);
    if(miss.length){toast('Falta: '+miss.join(', '),'err');return}
    const btn=$('evalBtn');btn.disabled=true;btn.textContent='Enviando...';
    try{
      const res=await api.guardarVotos({evaluadoId:EV.id,evaluadoNombre:EV.nombre,
        calificaciones:params.map(p=>({parametro:p,puntuacion:EV.ratings[p]})),
        sede:$('fSede').value||'',comentario:$('evalCom').value});
      if(res.success){toast(res.message||'Guardado','ok');DATA.evaluacionesUnicas[USER.email+'|'+EV.id]=true;
        if(res.nuevoPromedio)DATA.promedios[String(EV.id)]=res.nuevoPromedio;this.renderAreas();this.closeEval()}
      else toast(res.message||'Error','err');
    }catch(e){toast(e.message,'err')}
    btn.disabled=false;btn.textContent='Enviar Evaluación';
  },

  /* ── Dashboard (with top per area/sede) ── */
  async loadDash(){
    try{
      const d=await api.getDashboard(),a=d.analytics||{};
      $('dSt').innerHTML=
        '<div class="st sb"><div class="st-i">👥</div><div class="st-n">'+(a.totalColaboradores||0)+'</div><div class="st-l">Colaboradores</div></div>'+
        '<div class="st sg"><div class="st-i">✅</div><div class="st-n">'+(a.evaluadosUnicos||0)+'</div><div class="st-l">Calificados</div></div>'+
        '<div class="st sl"><div class="st-i">📝</div><div class="st-n">'+(a.totalVotos||0)+'</div><div class="st-l">Total Votos</div></div>'+
        '<div class="st sa"><div class="st-i">📊</div><div class="st-n">'+(a.tasaParticipacion||0)+'%</div><div class="st-l">Participación</div></div>';

      // Top per Area
      const topA=d.topPorArea||{};
      const topAhtml=Object.values(topA).map(t=>
        '<div class="top-card"><img src="'+(t.foto||fb(t.nombre))+'" onerror="this.src=\''+fb(t.nombre)+'\'">'+
        '<div class="top-card-info"><div class="top-card-name">'+esc(t.nombre)+'</div><div class="top-card-meta">📂 '+esc(t.area||'')+'</div></div>'+
        '<div class="top-card-score">'+parseFloat(t.prom).toFixed(1)+'</div></div>'
      ).join('');

      // Top per Sede
      const topS=d.topPorSede||{};
      const topShtml=Object.values(topS).map(t=>
        '<div class="top-card"><img src="'+(t.foto||fb(t.nombre))+'" onerror="this.src=\''+fb(t.nombre)+'\'">'+
        '<div class="top-card-info"><div class="top-card-name">'+esc(t.nombre)+'</div><div class="top-card-meta">🏢 '+esc(t.sede||'')+'</div></div>'+
        '<div class="top-card-score">'+parseFloat(t.prom).toFixed(1)+'</div></div>'
      ).join('');

      $('topAreaCont').innerHTML=topAhtml||'<div class="empty"><div class="empty-t">Sin datos aún</div></div>';
      $('topSedeCont').innerHTML=topShtml||'<div class="empty"><div class="empty-t">Sin datos aún</div></div>';

      // Charts
      const pr=a.promedios||{},c1=$('cD')?.getContext('2d');
      if(c1){if(CHS.d)CHS.d.destroy();CHS.d=new Chart(c1,{type:'bar',data:{labels:Object.keys(pr),datasets:[{data:Object.values(pr),backgroundColor:'#97D700',borderColor:'#10069F',borderWidth:1.5,borderRadius:5,barThickness:22}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:10}}}})}
      const tr=d.tendencias||[],c2=$('cT')?.getContext('2d');
      if(c2&&tr.length){if(CHS.t)CHS.t.destroy();CHS.t=new Chart(c2,{type:'line',data:{labels:tr.map(t=>t.fecha),datasets:[{data:tr.map(t=>t.promedio),borderColor:'#10069F',backgroundColor:'rgba(16,6,159,.05)',tension:.35,fill:true,pointRadius:3}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:10}}}})}
      $('tT').innerHTML='<thead><tr><th>Fecha</th><th>Promedio</th><th>Votos</th></tr></thead><tbody>'+tr.map(t=>'<tr><td>'+t.fecha+'</td><td>'+t.promedio+'/10</td><td>'+t.votos+'</td></tr>').join('')+'</tbody>';
    }catch(e){toast(e.message,'err')}
  },

  /* ── Reports ── */
  async loadRep(){
    try{
      const d=await api.getAllData(),cl=d.colaboradores||[],pr=d.promedios||{},g={};
      cl.forEach(c=>{const a=c.area||'Sin Área';if(!g[a])g[a]=[];g[a].push(c)});
      let rows='';Object.keys(g).sort().forEach(a=>{
        rows+='<tr><td colspan="4" style="background:var(--s0);font-weight:700;color:var(--b8);padding:8px 12px;font-size:.74rem">📂 '+esc(a)+'</td></tr>';
        g[a].forEach(c=>{const p=pr[String(c.id)];rows+='<tr><td>'+esc(c.nombre)+'</td><td>'+esc(c.sede||'—')+'</td><td>'+(p?parseFloat(p).toFixed(1)+'/10':'—')+'</td><td>'+stars_(p)+'</td></tr>'});
      });
      $('tR').innerHTML='<thead><tr><th>Colaborador</th><th>Sede</th><th>Promedio</th><th>Rating</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" style="text-align:center;padding:20px">Sin datos</td></tr>')+'</tbody>';
    }catch(e){toast(e.message,'err')}
  },

  /* ── Admin ── */
  async loadAdm(){
    try{
      const s=await api.getAdminStats();
      $('aSt').innerHTML=
        '<div class="st sb"><div class="st-i">👥</div><div class="st-n">'+(s.totalColaboradores||0)+'</div><div class="st-l">Colaboradores</div></div>'+
        '<div class="st sl"><div class="st-i">📋</div><div class="st-n">'+(s.totalAreas||0)+'</div><div class="st-l">Áreas</div></div>';
      ADM={p:s.parametros||[],ps:s.parametrosSupervisores||[],ar:s.areas||[],se:s.sedes||[]};
      this.adm.renderAll();this.loadUsers();
    }catch(e){toast(e.message,'err')}
  },

  async loadUsers(){
    try{
      const users=await api.getUsuarios();
      $('usrBody').innerHTML=users.map(u=>'<tr>'+
        '<td><span class="usr-status '+(u.activo?'active':'inactive')+'"></span>'+esc(u.email)+'</td>'+
        '<td>'+esc(u.nombre)+'</td>'+
        '<td><span class="ch ch-r" style="font-size:.65rem">'+esc(u.rol)+'</span></td>'+
        '<td>'+esc(u.area||'—')+'</td><td>'+esc(u.sede||'—')+'</td>'+
        '<td style="display:flex;gap:4px">'+
          '<button class="btn bo" style="padding:4px 8px;font-size:.68rem" onclick="App.editUser(\''+esc(u.email)+'\')">✏️</button>'+
          '<button class="btn bd" style="padding:4px 8px;font-size:.68rem" onclick="App.delUser(\''+esc(u.email)+'\')">🗑</button>'+
        '</td></tr>').join('');
    }catch(e){toast(e.message,'err')}
  },

  openNewUser(){$('nuEmail').value='';$('nuNombre').value='';$('nuRol').value='votante';$('nuArea').value='';$('nuSede').value='';$('nuPwd').value='';$('nuPermisos').value='';$('nuOv').classList.add('open')},
  closeNewUser(){$('nuOv').classList.remove('open')},

  async saveNewUser(){
    const d={email:$('nuEmail').value.trim(),nombre:$('nuNombre').value.trim(),rol:$('nuRol').value,area:$('nuArea').value.trim(),sede:$('nuSede').value.trim(),password:$('nuPwd').value,permisos:$('nuPermisos').value.trim()};
    if(!d.email||!d.nombre){toast('Email y nombre requeridos','err');return}
    try{const r=await api.crearUsuario(d);if(r.success){toast('Usuario creado','ok');this.closeNewUser();this.loadUsers()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}
  },

  editUser(email){
    const rol=prompt('Nuevo rol para '+email+'\n(admin / supervisor / votante / evaluado):');
    if(!rol)return;
    const permisos=prompt('Permisos adicionales (separados por coma):\nOpciones: votar,dashboard,reportes,admin,usuarios\n\nDejar vacío para usar permisos por defecto del rol:','');
    api.editarUsuario({email,rol,permisos:permisos||''}).then(r=>{if(r.success){toast('Actualizado','ok');this.loadUsers()}else toast(r.message,'err')}).catch(e=>toast(e.message,'err'));
  },

  delUser(email){
    if(!confirm('¿Eliminar '+email+'?'))return;
    api.eliminarUsuario(email).then(r=>{if(r.success){toast('Eliminado','ok');this.loadUsers()}else toast(r.message,'err')}).catch(e=>toast(e.message,'err'));
  },

  adm:{
    renderAll(){this._r('adP',ADM.p,'p');this._r('adPS',ADM.ps,'ps');this._r('adAR',ADM.ar,'ar');this._r('adSE',ADM.se,'se')},
    _r(id,arr,k){$(id).innerHTML=arr.map((v,i)=>'<div class="adm-it"><input class="adm-in ai-'+k+'" value="'+esc(v)+'"><button class="bd-sm" onclick="App.adm.rm(\''+k+'\','+i+')">🗑</button></div>').join('')},
    add(k){ADM[k].push('Nuevo');this.renderAll()},
    rm(k,i){if(ADM[k].length<=1){toast('Mínimo 1','err');return}ADM[k].splice(i,1);this.renderAll()},
    _v(k){return Array.from(document.querySelectorAll('.ai-'+k)).map(e=>e.value.trim()).filter(Boolean)},
    async save(k){
      const map={p:'saveParametros',ps:'saveParametrosSup',ar:'saveAreas',se:'saveSedes'};
      try{await api[map[k]](this._v(k));ADM[k]=this._v(k);toast('Guardado','ok')}catch(e){toast(e.message,'err')}
    }
  },
  expX(){toast('Exportación Excel próximamente','info')},expP(){toast('Exportación PDF próximamente','info')},
};
function stars_(p){if(!p)return'☆☆☆☆☆';const v=parseFloat(p)/2;let s='';for(let i=1;i<=5;i++)s+=i<=Math.round(v)?'★':'☆';return'<span style="color:#f59e0b;letter-spacing:2px">'+s+'</span>'}
window.App=App;