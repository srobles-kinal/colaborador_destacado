/**
 * app.js v8 — Core: auth, session, nav, helpers
 * Views are in js/views/*.js
 */
let USER=null,DATA=null,ADM={p:[],ps:[],ar:[],se:[]};
const COLS=[{bg:'#eef2ff',br:'#818cf8',ic:'#4f46e5'},{bg:'#ecfdf5',br:'#34d399',ic:'#059669'},{bg:'#fffbeb',br:'#fbbf24',ic:'#d97706'},{bg:'#fef2f2',br:'#f87171',ic:'#dc2626'},{bg:'#f0f9ff',br:'#38bdf8',ic:'#0284c7'},{bg:'#fdf4ff',br:'#c084fc',ic:'#9333ea'}];
function gc(i){return COLS[i%COLS.length]}
function $(s){return document.getElementById(s)}
function toast(m,t='info'){const e=document.createElement('div');e.className='tt tt-'+t;e.textContent=m;$('toasts').appendChild(e);setTimeout(()=>{e.style.opacity='0';e.style.transition='opacity .3s';setTimeout(()=>e.remove(),300)},3500)}
function fb(n){return"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 50'><rect fill='%23e2e8f0' width='50' height='50' rx='8'/><text x='50%25' y='56%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-size='18' font-family='sans-serif'>"+(n||'?').charAt(0)+"</text></svg>"}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function stars_(p){if(!p)return'☆☆☆☆☆';const v=parseFloat(p)/2;let s='';for(let i=1;i<=5;i++)s+=i<=Math.round(v)?'★':'☆';return'<span style="color:#f59e0b;letter-spacing:2px">'+s+'</span>'}

// ── Device detection ──
const Device={
  isMobile:()=>window.innerWidth<=768,
  isTouch:()=>'ontouchstart' in window||navigator.maxTouchPoints>0,
  isSmall:()=>window.innerWidth<=480,
  type:()=>Device.isSmall()?'phone':Device.isMobile()?'tablet':'desktop'
};
window.Device=Device;

// ── Loading overlay ──
function showLoading(){const el=$('loadingOv');if(el)el.classList.add('show')}
function hideLoading(){const el=$('loadingOv');if(el)el.classList.remove('show')}

// ── Session persistence ──
const INACTIVITY_MS=30*60*1000;
let _inactivityTimer=null;
function resetInactivity(){if(_inactivityTimer)clearTimeout(_inactivityTimer);_inactivityTimer=setTimeout(()=>{toast('Sesión expirada por inactividad','info');App.logout()},INACTIVITY_MS)}
['click','keydown','mousemove','touchstart','scroll'].forEach(e=>{document.addEventListener(e,resetInactivity,{passive:true})});
function saveSession(tk,usr){localStorage.setItem('ev_token',tk);localStorage.setItem('ev_user',JSON.stringify(usr));localStorage.setItem('ev_time',Date.now().toString())}
function clearSession(){localStorage.removeItem('ev_token');localStorage.removeItem('ev_user');localStorage.removeItem('ev_time')}
function getSavedSession(){const tk=localStorage.getItem('ev_token'),usr=localStorage.getItem('ev_user'),t=parseInt(localStorage.getItem('ev_time')||'0');if(!tk||!usr)return null;if(Date.now()-t>8*3600000){clearSession();return null}try{return{token:tk,user:JSON.parse(usr)}}catch(e){clearSession();return null}}

// ── Nav ──
document.querySelectorAll('.nb').forEach(b=>{b.addEventListener('click',()=>{
  document.querySelectorAll('.nb').forEach(n=>n.classList.remove('on'));
  document.querySelectorAll('.pn').forEach(p=>p.classList.remove('on'));
  b.classList.add('on');$('p-'+b.dataset.tab).classList.add('on');
  const t=b.dataset.tab;
  if(t==='dash')App.dash.load();if(t==='rep')App.rep.load();
  if(t==='usuarios')App.usr.load();if(t==='elecciones')App.elec.load();
  if(t==='evaluadores')App.evalAsign.load();if(t==='config')App.cfg.load();
  if(t==='evaldia')App.evalDia.load();
})});
document.querySelectorAll('.pwd-toggle').forEach(btn=>{btn.addEventListener('click',()=>{const i=btn.previousElementSibling;if(i.type==='password'){i.type='text';btn.textContent='🙈'}else{i.type='password';btn.textContent='👁️'}})});
document.addEventListener('click',function(e){const btn=e.target.closest('.rb-b');if(!btn)return;const rr=btn.parentElement;if(rr.dataset.dparam)return;e.preventDefault();const p=rr.dataset.param;const v=parseInt(btn.dataset.v);if(!p||isNaN(v))return;if(window._activeRatings)window._activeRatings[p]=v;rr.querySelectorAll('.rb-b').forEach(b=>{b.classList.toggle('on',parseInt(b.dataset.v)<=v)})});

document.addEventListener('DOMContentLoaded',()=>{
  $('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')App.login()});
  $('pwdConfirm').addEventListener('keydown',e=>{if(e.key==='Enter')App.changePwd()});
  const pi=$('pwdNew');if(pi)pi.addEventListener('input',()=>{const v=pi.value,b=$('pwdBar');if(!b)return;b.className='pwd-strength '+(v.length<6?'weak':v.length<10?'medium':'strong')});
  const saved=getSavedSession();
  if(saved){api.setToken(saved.token);USER=saved.user;App.start()}
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
  async start(){$('loginScreen').style.display='none';$('appShell').classList.add('show');resetInactivity();showLoading();try{DATA=await api.getAllData();this.render();toast('Datos cargados','ok')}catch(e){if(e.message.indexOf('Sesión')>=0){clearSession();this.logout();return}toast(e.message,'err')}finally{hideLoading()}},

  render(){
    if(!DATA)return;
    const perms=DATA.usuario.permisos||[];
    $('chipU').textContent=USER.nombre||USER.email.split('@')[0];
    $('chipR').textContent=USER.rol;
    const topAv=$('topAvatar');if(topAv){topAv.src=USER.foto||fb(USER.nombre);topAv.onerror=function(){this.src=fb(USER.nombre)}}
    const cb=$('convBadge');
    if(cb){cb.textContent=DATA.eleccionActiva?DATA.eleccionActiva.nombre:'Sin elección activa';cb.style.color=DATA.eleccionActiva?'var(--l5)':'var(--r5)'}
    $('welc').textContent='¡Hola, '+(USER.nombre||USER.email.split('@')[0])+'!';
    const toggle=(id,perm)=>{const el=$(id);if(el)el.classList.toggle('hidden',perms.indexOf(perm)<0)};
    toggle('navDash','dashboard');toggle('navRep','reportes');
    toggle('navUsuarios','usuarios');toggle('navElecciones','elecciones');
    toggle('navEvaluadores','evaluadores');toggle('navConfig','parametros');
    const isSupOrAdmin=USER.rol==='supervisor'||USER.rol==='admin';
    const navED=$('navEvalDia');if(navED)navED.classList.toggle('hidden',!isSupOrAdmin);
    // Render voting view
    this.vot.render();
  },

  // Sub-modules attached by view files
  vot:{render(){}},dash:{load(){}},rep:{load(){}},
  usr:{load(){}},elec:{load(){}},evalAsign:{load(){}},
  cfg:{load(){}},evalDia:{load(){}},
};
window.App=App;