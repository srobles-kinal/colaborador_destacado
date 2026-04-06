/**
 * API v6 — Sistema de Evaluación
 * New: Elecciones (monthly events), ParametrosArea, supervisor evaluator picker
 * Sheets: Usuarios, Votos, Parametros, ParametrosArea, Areas, Sedes,
 *         Elecciones, Sesiones, Auditoria
 */
var CFG={VERSION:'6.0',SESSION_H:8};

function sha256_(t){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,t).map(function(b){return('0'+((b+256)%256).toString(16)).slice(-2)}).join('')}
function uuid_(){return Utilities.getUuid()}
function jr_(d){return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON)}
function ok_(d){return jr_({status:'ok',data:d})}
function err_(m){return jr_({status:'error',message:m})}

function doGet(){return jr_({status:'ok',v:CFG.VERSION})}

function doPost(e){
  var b;
  try{b=JSON.parse(e.postData.contents)}catch(x){return err_('JSON inválido')}
  var a=b.action||'';
  try{
    switch(a){
      // Auth
      case 'login':return jr_(login_(b));
      case 'cambiarPassword':return jr_(cambiarPwd_(b));
      case 'logout':return jr_({status:'ok',success:true});
      // Data
      case 'getAllData':return wA_(b,getAllData_);
      case 'getDashboardData':return wA_(b,getDash_);
      case 'getAdminStats':return wA_(b,getAdminStats_);
      // Votes
      case 'guardarVotos':return jr_(guardarVotos_(b));
      // Users CRUD
      case 'getUsuarios':return wA_(b,getUsuarios_);
      case 'crearUsuario':return jr_(crearUsuario_(b));
      case 'editarUsuario':return jr_(editarUsuario_(b));
      case 'eliminarUsuario':return jr_(eliminarUsuario_(b));
      case 'resetPassword':return jr_(resetPwd_(b));
      // Config
      case 'saveParametros':case 'saveParametrosSupervisores':case 'saveAreas':case 'saveSedes':return jr_(saveList_(b));
      case 'saveParametrosArea':return jr_(saveParamsArea_(b));
      case 'getParametrosArea':return wA_(b,getParamsArea_);
      // Supervisors
      case 'getEvaluadoresSup':return wA_(b,getEvalSup_);
      case 'asignarEvaluadores':return jr_(asignarEval_(b));
      case 'getColabsByArea':return wA_(b,getColabsByArea_);
      // Elecciones
      case 'getElecciones':return wA_(b,getElecciones_);
      case 'crearEleccion':return jr_(crearEleccion_(b));
      case 'activarEleccion':return jr_(activarEleccion_(b));
      case 'cerrarEleccion':return jr_(cerrarEleccion_(b));
      // Export
      case 'exportReport':return wA_(b,exportReport_);
      // Evaluación Diaria
      case 'getCategoriasDiarias':return wA_(b,getCatDiarias_);
      case 'saveCategoriasDiarias':return jr_(saveCatDiarias_(b));
      case 'getPreguntasDiarias':return wA_(b,getPregDiarias_);
      case 'guardarEvalDiaria':return jr_(guardarEvalDiaria_(b));
      case 'getEvalDiariaHoy':return wA_(b,getEvalDiariaHoy_);
      case 'getColabsParaEvalDiaria':return wA_(b,getColabsEvalDiaria_);
      case 'getPesos':return wA_(b,getPesos_);
      case 'savePesos':return jr_(savePesos_(b));
      case 'getDashboardCombinado':return wA_(b,getDashCombinado_);
      default:return err_('Acción: '+a);
    }
  }catch(x){return err_(x.toString())}
}

function wA_(b,fn){var s=sesOk_(b.token);if(!s)return err_('Sesión inválida');return ok_(fn(s,b))}

// ═══════════════════════════════════════
// COLUMN DETECTION
// ═══════════════════════════════════════
var _hc={};
function hm_(sh){
  var n=sh.getName();
  if(_hc[n])return _hc[n];
  var hs=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var m={};
  for(var i=0;i<hs.length;i++){
    var h=String(hs[i]).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(/^(email|correo|usuario)$/.test(h))m.email=i;
    else if(/^(nombre|name)/.test(h))m.nombre=i;
    else if(/^(rol|role|perfil)$/.test(h))m.rol=i;
    else if(/^(area|equipo|departamento)$/.test(h))m.area=i;
    else if(/^(activo|active|habilitado)$/.test(h))m.activo=i;
    else if(/^(fecha.?creacion|creado)/.test(h))m.fcreacion=i;
    else if(/^(ultimo.?acceso|last.?access)/.test(h))m.acceso=i;
    else if(/^(passwordhash|password|hash|contrasena|clave)$/.test(h))m.pwd=i;
    else if(/^(primer.?ingreso|cambiar.?password)/.test(h))m.primer=i;
    else if(/^(sede|ubicacion|location)$/.test(h))m.sede=i;
    else if(/^(foto|fotourl|photo|imagen)/.test(h))m.foto=i;
    else if(/^(id|numero|no)$/.test(h))m.id=i;
    else if(/^(permisos|permissions)$/.test(h))m.permisos=i;
    else if(/^(evaluadores|evaluadores.?sup|asignados)/.test(h))m.evaluadores=i;
  }
  _hc[n]=m;
  return m;
}

function cv_(r,m,k,d){if(m[k]===undefined)return d;var v=r[m[k]];return(v===undefined||v===null||v==='')?d:v}
function isT_(v){return v===true||String(v).toUpperCase()==='TRUE'}
function dUrl_(u){if(!u)return'';var x=String(u).match(/\/d\/([a-zA-Z0-9-_]+)/);return x?'https://lh3.googleusercontent.com/d/'+x[1]:String(u)}

// ═══════════════════════════════════════
// USER LOOKUP + PERMISSION CHECK
// ═══════════════════════════════════════
var _basePerms={
  admin:['votar','dashboard','reportes','usuarios','elecciones','evaluadores','parametros'],
  supervisor:['votar','dashboard','reportes'],
  evaluador:['votar'],
  votante:['votar'],
  evaluado:['votar']
};

function hasPerm_(email,perm){
  var u=findU_(email);if(!u)return false;
  // Admin always has all permissions
  if(u.rol==='admin')return true;
  // Check base role perms
  var rp=_basePerms[u.rol]||['votar'];
  if(rp.indexOf(perm)>=0)return true;
  // Check custom perms from sheet
  if(u.permisos.indexOf(perm)>=0)return true;
  return false;
}

function assertPerm_(token,perm){
  var s=sesOk_(token);
  if(!s)throw new Error('Sesión inválida');
  if(!hasPerm_(s.usuario,perm))throw new Error('No autorizado');
  return s;
}

function findU_(email){
  var e=String(email).trim().toLowerCase();
  // In-request cache
  if(!findU_._cache)findU_._cache={};
  if(findU_._cache[e]!==undefined)return findU_._cache[e];
  
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Usuarios');
  if(!sh)return null;
  var m=hm_(sh);
  var d=sh.getDataRange().getValues();
  if(m.email===undefined)return null;
  var e=String(email).trim().toLowerCase();
  for(var i=1;i<d.length;i++){
    if(String(d[i][m.email]).trim().toLowerCase()===e){
      var permisos=m.permisos!==undefined?String(d[i][m.permisos]):'';
      var result={
        ri:i,sh:sh,m:m,
        email:String(d[i][m.email]).trim(),
        nombre:cv_(d[i],m,'nombre',''),
        rol:String(cv_(d[i],m,'rol','votante')).toLowerCase().trim(),
        area:String(cv_(d[i],m,'area','')),
        activo:m.activo!==undefined?isT_(d[i][m.activo]):true,
        pwd:String(cv_(d[i],m,'pwd','')),
        primer:m.primer!==undefined?isT_(d[i][m.primer]):false,
        sede:String(cv_(d[i],m,'sede','')),
        foto:dUrl_(cv_(d[i],m,'foto','')),
        permisos:permisos?permisos.split(',').map(function(p){return p.trim()}):[],
        evaluadores:m.evaluadores!==undefined?String(d[i][m.evaluadores]):''
      };
      findU_._cache[e]=result;
      return result;
    }
  }
  findU_._cache[e]=null;
  return null;
}

// ═══════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════
function sesOk_(tk){
  if(!tk)return null;
  var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sesiones');
  if(!sh)return null;
  var d=sh.getDataRange().getValues();
  var now=new Date();
  for(var i=1;i<d.length;i++){
    if(d[i][0]===tk){
      if(now>new Date(d[i][3])){sh.deleteRow(i+1);return null}
      return{usuario:d[i][1]};
    }
  }
  return null;
}

function mkSes_(e,tk){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Sesiones');
  if(!sh){sh=ss.insertSheet('Sesiones');sh.appendRow(['Token','Usuario','Creado','Expira'])}
  var n=new Date();
  sh.appendRow([tk,e,n,new Date(n.getTime()+CFG.SESSION_H*3600000)]);
}

function log_(a,u,d){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Auditoria');
  if(!sh){sh=ss.insertSheet('Auditoria');sh.appendRow(['Timestamp','Usuario','Accion','Detalles'])}
  sh.appendRow([new Date(),u,a,JSON.stringify(d||{})]);
}

// ═══════════════════════════════════════
// AUTH
// ═══════════════════════════════════════
function login_(b){
  if(!b.usuario||!b.password)return{status:'error',message:'Credenciales requeridas'};
  var u=findU_(b.usuario);
  if(!u)return{status:'error',message:'Usuario no encontrado'};
  if(!u.activo)return{status:'error',message:'Usuario deshabilitado'};
  var h=sha256_(b.password);
  var primer=u.primer;
  if(!u.pwd||u.pwd===''||u.pwd==='undefined'){
    if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(h);
    if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(true);
    primer=true;
  }else if(u.pwd!==h){
    log_('LOGIN_FAIL',b.usuario,{});
    return{status:'error',message:'Contraseña incorrecta'};
  }
  var tk=uuid_();
  mkSes_(u.email,tk);
  if(u.m.acceso!==undefined)u.sh.getRange(u.ri+1,u.m.acceso+1).setValue(new Date());
  log_('LOGIN',u.email,{});
  var baseP=_basePerms;
  var perms=(baseP[u.rol]||['votar']).slice();
  u.permisos.forEach(function(p){if(p&&perms.indexOf(p)===-1)perms.push(p)});
  return{status:'ok',success:true,token:tk,usuario:{
    email:u.email,nombre:u.nombre,rol:u.rol,area:u.area,sede:u.sede,foto:u.foto,primerIngreso:primer,permisos:perms
  }};
}

function cambiarPwd_(b){
  if(!b.nuevaPassword||b.nuevaPassword.length<6)return{status:'error',message:'Mínimo 6 caracteres'};
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var u=findU_(s.usuario);if(!u)return{status:'error',message:'No encontrado'};
  if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(sha256_(b.nuevaPassword));
  if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(false);
  log_('PWD_CHANGE',s.usuario,{});
  return{status:'ok',success:true};
}

// ═══════════════════════════════════════
// eleccionS (Monthly Events)
// ═══════════════════════════════════════
// Sheet: Elecciones [Id, Nombre, FechaInicio, FechaFin, Estado, CreadoPor, FechaCreacion]
// Estado: activa | cerrada | borrador

var _eleccionCache=null;
function getEleccionActiva_(){
  if(_eleccionCache!==null)return _eleccionCache===false?null:_eleccionCache;
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Elecciones');
  if(!sh||sh.getLastRow()<=1){_eleccionCache=false;return null}
  var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  for(var i=0;i<d.length;i++){
    if(String(d[i][4]).toLowerCase()==='activa'){
      var r={id:String(d[i][0]),nombre:String(d[i][1]),inicio:d[i][2],fin:d[i][3],estado:'activa',row:i+2};
      _eleccionCache=r;return r;
    }
  }
  _eleccionCache=false;return null;
}

function getElecciones_(ses){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Elecciones');
  if(!sh||sh.getLastRow()<=1)return[];
  var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  var out=[];
  for(var i=0;i<d.length;i++){
    out.push({
      id:String(d[i][0]),nombre:String(d[i][1]),
      inicio:d[i][2]?new Date(d[i][2]).toISOString():'',
      fin:d[i][3]?new Date(d[i][3]).toISOString():'',
      estado:String(d[i][4]).toLowerCase(),
      creadoPor:String(d[i][5]),
      fecha:d[i][6]?new Date(d[i][6]).toISOString():''
    });
  }
  return out;
}

function crearEleccion_(b){
  var s=assertPerm_(b.token,'elecciones');
  if(!b.nombre)return{status:'error',message:'Nombre requerido'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Elecciones');
  if(!sh){
    sh=ss.insertSheet('Elecciones');
    sh.appendRow(['Id','Nombre','FechaInicio','FechaFin','Estado','CreadoPor','FechaCreacion']);
  }
  var id=uuid_().substring(0,8);
  sh.appendRow([id,b.nombre,b.fechaInicio||new Date(),b.fechaFin||'','borrador',s.usuario,new Date()]);
  log_('ELEC_CREATE',s.usuario,{id:id,nombre:b.nombre});
  return{status:'ok',success:true,id:id};
}

function activarEleccion_(b){
  var s=assertPerm_(b.token,'elecciones');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Elecciones');
  if(!sh)return{status:'error',message:'No hay Elecciones'};
  var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  // First close any active
  for(var i=0;i<d.length;i++){
    if(String(d[i][4]).toLowerCase()==='activa'){
      sh.getRange(i+2,5).setValue('cerrada');
    }
  }
  // Activate the requested one
  for(var i=0;i<d.length;i++){
    if(String(d[i][0])===b.id){
      sh.getRange(i+2,5).setValue('activa');
      log_('ELEC_ACTIVATE',s.usuario,{id:b.id});
      return{status:'ok',success:true};
    }
  }
  return{status:'error',message:'eleccion no encontrada'};
}

function cerrarEleccion_(b){
  var s=assertPerm_(b.token,'elecciones');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Elecciones');
  if(!sh)return{status:'error',message:'No hay Elecciones'};
  var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  for(var i=0;i<d.length;i++){
    if(String(d[i][0])===b.id){
      sh.getRange(i+2,5).setValue('cerrada');
      log_('ELEC_CLOSE',s.usuario,{id:b.id});
      return{status:'ok',success:true};
    }
  }
  return{status:'error',message:'No encontrada'};
}

// ═══════════════════════════════════════
// PARAMETROS POR AREA
// ═══════════════════════════════════════
// Sheet: ParametrosArea [Area, Parametro]

function getParamsArea_(ses){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('ParametrosArea');
  if(!sh||sh.getLastRow()<=1)return{};
  var d=sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  var out={};
  for(var i=0;i<d.length;i++){
    var area=String(d[i][0]);
    var param=String(d[i][1]);
    if(!area||!param)continue;
    if(!out[area])out[area]=[];
    out[area].push(param);
  }
  return out;
}

function saveParamsArea_(b){
  var s=assertPerm_(b.token,'parametros');
  // b.area, b.parametros = array of strings
  if(!b.area)return{status:'error',message:'Área requerida'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('ParametrosArea');
  if(!sh){
    sh=ss.insertSheet('ParametrosArea');
    sh.appendRow(['Area','Parametro']);
  }
  // Remove existing params for this area
  var d=sh.getDataRange().getValues();
  for(var i=d.length-1;i>=1;i--){
    if(String(d[i][0]).toLowerCase()===b.area.toLowerCase()){
      sh.deleteRow(i+1);
    }
  }
  // Add new ones
  var params=b.parametros||[];
  for(var i=0;i<params.length;i++){
    sh.appendRow([b.area,params[i]]);
  }
  log_('PARAMS_AREA',s.usuario,{area:b.area,count:params.length});
  return{status:'ok',success:true};
}

// ═══════════════════════════════════════
// GET ALL DATA (OPTIMIZED - single sheet read)
// ═══════════════════════════════════════
function getAllData_(ses){
  var usr=findU_(ses.usuario);
  if(!usr)throw new Error('User not found');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  
  // Read Usuarios sheet ONCE — build both collaborators list AND role map
  var uSh=ss.getSheetByName('Usuarios');
  var allCols=[],uMap={},supervisores=[];
  if(uSh&&uSh.getLastRow()>1){
    var um=hm_(uSh),ud=uSh.getDataRange().getValues();
    for(var i=1;i<ud.length;i++){
      var r=ud[i];
      var activo=um.activo!==undefined?isT_(r[um.activo]):true;
      if(!activo)continue;
      var em=um.email!==undefined?String(r[um.email]).trim():'';
      if(!em)continue;
      var emL=em.toLowerCase();
      var rol=String(cv_(r,um,'rol','votante')).toLowerCase().trim();
      var evaluadores=um.evaluadores!==undefined?String(r[um.evaluadores]):'';
      var colab={id:em,nombre:String(cv_(r,um,'nombre','')),area:String(cv_(r,um,'area','')),fotoUrl:dUrl_(cv_(r,um,'foto','')),email:em,sede:String(cv_(r,um,'sede',''))};
      allCols.push(colab);
      uMap[emL]={rol:rol,evaluadores:evaluadores};
      if(rol==='supervisor'||rol==='evaluador'){
        var evList=evaluadores?evaluadores.split(',').map(function(x){return x.trim().toLowerCase()}).filter(Boolean):[];
        supervisores.push({colab:colab,evaluadoresList:evList});
      }
    }
  }
  
  var conv=getEleccionActiva_();

  // Filtering
  var isAdm=usr.rol==='admin'||usr.rol==='supervisor';
  var isEvaluador=usr.rol==='evaluador';
  var cols;
  if(isAdm){
    cols=allCols;
  }else if(isEvaluador){
    // Evaluador sees people from assigned areas + specific emails
    var evList=usr.evaluadores?usr.evaluadores.split(',').map(function(x){return x.trim().toLowerCase()}).filter(Boolean):[];
    if(evList.length===0){
      // No assignments = see own area only
      cols=allCols.filter(function(c){return c.area.toLowerCase().trim()===usr.area.toLowerCase().trim()});
    }else{
      cols=allCols.filter(function(c){
        var cEmail=c.email.toLowerCase().trim();
        var cArea=c.area.toLowerCase().trim();
        return evList.indexOf(cEmail)>=0||evList.indexOf(cArea)>=0;
      });
    }
  }else{
    var usrArea=(usr.area||'').trim();
    var usrSede=(usr.sede||'').trim();
    var isMini=usrSede.toLowerCase().indexOf('mini')>=0;
    if(isMini&&usrSede){
      cols=allCols.filter(function(c){return c.sede.toLowerCase().trim()===usrSede.toLowerCase()});
    }else if(usrArea&&usrArea!=='undefined'){
      cols=allCols.filter(function(c){return c.area.toLowerCase().trim()===usrArea.toLowerCase()});
    }else{
      // No area assigned — only see self (will be excluded later), effectively empty
      cols=[];
    }
  }
  // Add supervisors for non-admin/non-supervisor users
  if(!isAdm){
    var colEmails={};
    cols.forEach(function(c){colEmails[c.email.toLowerCase()]=true});
    var usrEmail=usr.email.toLowerCase();
    var usrArea=(usr.area||'').toLowerCase().trim();
    supervisores.forEach(function(sup){
      if(colEmails[sup.colab.email.toLowerCase()])return;
      if(sup.evaluadoresList.length===0){
        cols.push(sup.colab);
        return;
      }
      var allowed=sup.evaluadoresList.some(function(e){return e===usrEmail||e===usrArea});
      if(allowed)cols.push(sup.colab);
    });
  }

  // Exclude self
  cols=cols.filter(function(c){return c.email.toLowerCase()!==usr.email.toLowerCase()});

  // Params - check area-specific first, fallback to global
  var globalParams=lst_(ss,'Parametros');
  var areaParams=getParamsArea_({});
  var usrAreaParams=areaParams[usr.area]||null;

  var params=lst_(ss,'Parametros');
  var pSup=lst_(ss,'Parametros Supervisores');
  var areas=lst_(ss,'Areas');
  var sedes=lst_(ss,'Sedes');

  // Votes - filter by active eleccion if exists
  var votos=readVotos_(ss,conv?conv.id:null);
  var evU={},proms={};
  for(var i=0;i<votos.length;i++){
    var v=votos[i];
    evU[v.vt+'|'+v.ei]=true;
    if(v.ei&&!isNaN(v.p)&&v.p>0){
      if(!proms[v.ei])proms[v.ei]={s:0,c:0};
      proms[v.ei].s+=v.p;proms[v.ei].c++;
    }
  }
  var pf={};
  for(var k in proms){pf[k]=proms[k].c>0?proms[k].s/proms[k].c:0}

  var cids={};
  for(var j=0;j<cols.length;j++)cids[String(cols[j].id)]=true;
  var tv=0,vs={},es={};
  for(var i=0;i<votos.length;i++){
    if(cids[votos[i].ei]){tv++;vs[votos[i].vt]=true;es[votos[i].ei]=true}
  }
  var nv=Object.keys(vs).length;

  var topArea={},topSede={};
  for(var j=0;j<cols.length;j++){
    var c=cols[j],pm=pf[String(c.id)];
    if(pm&&pm>0){
      if(!topArea[c.area]||pm>topArea[c.area].prom)topArea[c.area]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,area:c.area};
      if(c.sede&&(!topSede[c.sede]||pm>topSede[c.sede].prom))topSede[c.sede]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,sede:c.sede};
    }
  }

  var miProm=pf[usr.email]||0;
  var baseP=_basePerms;
  var perms=(baseP[usr.rol]||['votar']).slice();
  usr.permisos.forEach(function(p){if(p&&perms.indexOf(p)===-1)perms.push(p)});

  return{
    usuario:{email:usr.email,nombre:usr.nombre,rol:usr.rol,area:usr.area,sede:usr.sede,foto:usr.foto,permisos:perms},
    colaboradores:cols,miPromedio:miProm,
    parametros:globalParams.length?globalParams:['Calidad de Trabajo'],
    parametrosArea:areaParams,
    parametrosSupervisores:pSup.length?pSup:['Liderazgo'],
    areas:areas,sedes:sedes,evaluacionesUnicas:evU,promedios:pf,
    topPorArea:topArea,topPorSede:topSede,
    eleccionActiva:conv?{id:conv.id,nombre:conv.nombre}:null,
    analytics:{totalColaboradores:cols.length,votantesUnicos:nv,evaluadosUnicos:Object.keys(es).length,
      tasaParticipacion:cols.length>0?((nv/cols.length)*100).toFixed(1):'0'}
  };
}

// ═══════════════════════════════════════
// VOTES (tied to eleccion)
// ═══════════════════════════════════════
function guardarVotos_(b){
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var conv=getEleccionActiva_();
  if(!conv)return{status:'error',message:'No hay eleccion activa. Contacta al administrador.'};
  var convId=conv.id;
  var vSh=ss.getSheetByName('Votos');
  if(!vSh){
    vSh=ss.insertSheet('Votos');
    vSh.appendRow(['Timestamp','EmailVotante','NombreVotante','eleccionId','IdEvaluado','NombreEvaluado','Parametro','Puntuacion','Sede','Comentario']);
  }
  // Check duplicate within this eleccion
  var vD=vSh.getLastRow()>1?vSh.getRange(2,1,vSh.getLastRow()-1,10).getValues():[];
  for(var i=0;i<vD.length;i++){
    if(String(vD[i][1])===s.usuario&&String(vD[i][3])===convId&&String(vD[i][4])===String(b.evaluadoId)){
      return{status:'ok',success:false,message:'Ya evaluaste a este colaborador en esta eleccion'};
    }
  }
  var usr=findU_(s.usuario);
  var ts=new Date();
  var rows=[];
  for(var c=0;c<b.calificaciones.length;c++){
    rows.push([ts,s.usuario,usr?usr.nombre:s.usuario,convId,b.evaluadoId,b.evaluadoNombre,b.calificaciones[c].parametro,b.calificaciones[c].puntuacion,b.sede||'',b.comentario||'']);
  }
  vSh.getRange(vSh.getLastRow()+1,1,rows.length,10).setValues(rows);
  log_('EVAL',s.usuario,{ei:b.evaluadoId,conv:convId});
  // Calc new avg for this eleccion
  var all=vSh.getRange(2,1,vSh.getLastRow()-1,10).getValues();
  var sum=0,cnt=0;
  for(var i=0;i<all.length;i++){
    if(String(all[i][3])===convId&&String(all[i][4])===String(b.evaluadoId)){
      var p=parseFloat(all[i][7]);
      if(!isNaN(p)&&p>0){sum+=p;cnt++}
    }
  }
  return{status:'ok',success:true,message:'Evaluación guardada',evaluadoId:String(b.evaluadoId),nuevoPromedio:cnt>0?sum/cnt:0};
}

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════
function getDash_(ses){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var allCols=readColaboradores_(ss);
  var conv=getEleccionActiva_();
  var votos=readVotos_(ss,conv?conv.id:null);
  var proms={};
  for(var i=0;i<votos.length;i++){
    var v=votos[i];
    if(v.ei&&!isNaN(v.p)&&v.p>0){
      if(!proms[v.ei])proms[v.ei]={s:0,c:0};
      proms[v.ei].s+=v.p;proms[v.ei].c++;
    }
  }
  var pf={};for(var k in proms){pf[k]=(proms[k].s/proms[k].c).toFixed(2)}
  var topA={},topS={};
  for(var j=0;j<allCols.length;j++){
    var c=allCols[j],pm=pf[c.email];
    if(pm){
      var pmN=parseFloat(pm);
      if(!topA[c.area]||pmN>topA[c.area].prom)topA[c.area]={nombre:c.nombre,foto:c.fotoUrl,prom:pmN,area:c.area};
      if(c.sede&&(!topS[c.sede]||pmN>topS[c.sede].prom))topS[c.sede]={nombre:c.nombre,foto:c.fotoUrl,prom:pmN,sede:c.sede};
    }
  }
  var vs={},es={};
  for(var i=0;i<votos.length;i++){vs[votos[i].vt]=true;es[votos[i].ei]=true}
  return{
    analytics:{totalColaboradores:allCols.length,votantesUnicos:Object.keys(vs).length,evaluadosUnicos:Object.keys(es).length,promedios:pf,
      tasaParticipacion:allCols.length>0?((Object.keys(vs).length/allCols.length)*100).toFixed(1):'0'},
    topPorArea:topA,topPorSede:topS,tendencias:tend_(ss,conv?conv.id:null),
    eleccion:conv?{id:conv.id,nombre:conv.nombre}:null
  };
}

function getAdminStats_(ses){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var allU=readColaboradores_(ss);
  return{
    totalColaboradores:allU.length,totalAreas:lst_(ss,'Areas').length,
    parametros:lst_(ss,'Parametros'),parametrosSupervisores:lst_(ss,'Parametros Supervisores'),
    areas:lst_(ss,'Areas'),sedes:lst_(ss,'Sedes')
  };
}

// ═══════════════════════════════════════
// USERS CRUD
// ═══════════════════════════════════════
function getUsuarios_(ses){
  if(!hasPerm_(ses.usuario,'usuarios'))throw new Error('No autorizado');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Usuarios');if(!sh)return[];
  var m=hm_(sh),d=sh.getDataRange().getValues(),out=[];
  for(var i=1;i<d.length;i++){
    var perms=m.permisos!==undefined?String(d[i][m.permisos]):'';
    out.push({
      email:cv_(d[i],m,'email',''),nombre:cv_(d[i],m,'nombre',''),
      rol:String(cv_(d[i],m,'rol','votante')).toLowerCase(),
      area:cv_(d[i],m,'area',''),activo:m.activo!==undefined?isT_(d[i][m.activo]):true,
      sede:cv_(d[i],m,'sede',''),foto:dUrl_(cv_(d[i],m,'foto','')),permisos:perms
    });
  }
  return out;
}

function crearUsuario_(b){
  var s=assertPerm_(b.token,'usuarios');
  if(!b.email||!b.nombre)return{status:'error',message:'Email y nombre requeridos'};
  if(findU_(b.email))return{status:'error',message:'Ya existe'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Usuarios');
  var m=hm_(sh);
  var hs=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var row=[];
  for(var c=0;c<hs.length;c++)row.push('');
  if(m.email!==undefined)row[m.email]=b.email;
  if(m.nombre!==undefined)row[m.nombre]=b.nombre;
  if(m.rol!==undefined)row[m.rol]=b.rol||'votante';
  if(m.area!==undefined)row[m.area]=b.area||'';
  if(m.activo!==undefined)row[m.activo]=true;
  if(m.fcreacion!==undefined)row[m.fcreacion]=new Date();
  if(m.pwd!==undefined)row[m.pwd]=b.password?sha256_(b.password):'';
  if(m.primer!==undefined)row[m.primer]=true;
  if(m.sede!==undefined)row[m.sede]=b.sede||'';
  if(m.foto!==undefined)row[m.foto]=b.foto||'';
  if(m.permisos!==undefined)row[m.permisos]=b.permisos||'';
  sh.appendRow(row);
  log_('USER_CREATE',s.usuario,{n:b.email});
  return{status:'ok',success:true};
}

function editarUsuario_(b){
  var s=assertPerm_(b.token,'usuarios');
  var u=findU_(b.email);if(!u)return{status:'error',message:'No encontrado'};
  if(b.nombre!==undefined&&u.m.nombre!==undefined)u.sh.getRange(u.ri+1,u.m.nombre+1).setValue(b.nombre);
  if(b.rol!==undefined&&u.m.rol!==undefined)u.sh.getRange(u.ri+1,u.m.rol+1).setValue(b.rol);
  if(b.area!==undefined&&u.m.area!==undefined)u.sh.getRange(u.ri+1,u.m.area+1).setValue(b.area);
  if(b.sede!==undefined&&u.m.sede!==undefined)u.sh.getRange(u.ri+1,u.m.sede+1).setValue(b.sede);
  if(b.activo!==undefined&&u.m.activo!==undefined)u.sh.getRange(u.ri+1,u.m.activo+1).setValue(b.activo);
  if(b.foto!==undefined&&u.m.foto!==undefined)u.sh.getRange(u.ri+1,u.m.foto+1).setValue(b.foto);
  if(b.permisos!==undefined&&u.m.permisos!==undefined)u.sh.getRange(u.ri+1,u.m.permisos+1).setValue(b.permisos);
  log_('USER_EDIT',s.usuario,{t:b.email});
  return{status:'ok',success:true};
}

function eliminarUsuario_(b){
  var s=assertPerm_(b.token,'usuarios');
  var u=findU_(b.email);if(!u)return{status:'error',message:'No encontrado'};
  u.sh.deleteRow(u.ri+1);
  log_('USER_DEL',s.usuario,{t:b.email});
  return{status:'ok',success:true};
}

function resetPwd_(b){
  var s=assertPerm_(b.token,'usuarios');
  var u=findU_(b.email);if(!u)return{status:'error',message:'No encontrado'};
  var defaultPwd='Muni2025';
  if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(sha256_(defaultPwd));
  if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(true);
  log_('PWD_RESET',s.usuario,{t:b.email});
  return{status:'ok',success:true,message:'Contraseña: '+defaultPwd,tempPassword:defaultPwd};
}

// ═══════════════════════════════════════
// SUPERVISORS
// ═══════════════════════════════════════
function getColabsByArea_(ses,b){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var allCols=readColaboradores_(ss);
  var areas=b.areas||[];
  if(!areas.length)return[];
  var areasLow=areas.map(function(a){return a.toLowerCase().trim()});
  var filtered=allCols.filter(function(c){
    return areasLow.indexOf(c.area.toLowerCase().trim())>=0;
  });
  return filtered.map(function(c){return{email:c.email,nombre:c.nombre,area:c.area,sede:c.sede}});
}

function getEvalSup_(ses){
  if(!hasPerm_(ses.usuario,'evaluadores'))throw new Error('No autorizado');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Usuarios');if(!sh)return[];
  var m=hm_(sh),d=sh.getDataRange().getValues(),out=[];
  for(var i=1;i<d.length;i++){
    var rol=String(cv_(d[i],m,'rol','')).toLowerCase().trim();
    if(rol==='supervisor'||rol==='evaluador'){
      out.push({
        email:String(cv_(d[i],m,'email','')),
        nombre:String(cv_(d[i],m,'nombre','')),
        evaluadores:m.evaluadores!==undefined?String(d[i][m.evaluadores]):''
      });
    }
  }
  return out;
}

function asignarEval_(b){
  var s=assertPerm_(b.token,'evaluadores');
  var sup=findU_(b.supervisorEmail);if(!sup)return{status:'error',message:'No encontrado'};
  if(sup.m.evaluadores!==undefined){
    sup.sh.getRange(sup.ri+1,sup.m.evaluadores+1).setValue(b.evaluadores||'');
  }
  log_('EVAL_ASSIGN',s.usuario,{sup:b.supervisorEmail});
  return{status:'ok',success:true};
}

// ═══════════════════════════════════════
// SAVE LISTS & EXPORT
// ═══════════════════════════════════════
function saveList_(b){
  var s=assertPerm_(b.token,'parametros');
  var map={saveParametros:{h:'Parametros',hd:'Parametro'},saveParametrosSupervisores:{h:'Parametros Supervisores',hd:'Parametro'},saveAreas:{h:'Areas',hd:'Area'},saveSedes:{h:'Sedes',hd:'Sede'}};
  var c=map[b.action];if(!c)return{status:'error',message:'?'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(c.h);
  if(!sh){sh=ss.insertSheet(c.h);sh.getRange(1,1).setValue(c.hd).setFontWeight('bold')}
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,1).clearContent();
  if(b.valores&&b.valores.length)sh.getRange(2,1,b.valores.length,1).setValues(b.valores.map(function(v){return[v]}));
  return{status:'ok',success:true};
}

function exportReport_(ses){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var allCols=readColaboradores_(ss);
  var conv=getEleccionActiva_();
  var votos=readVotos_(ss,conv?conv.id:null);
  var proms={};
  for(var i=0;i<votos.length;i++){
    var v=votos[i];
    if(v.ei&&!isNaN(v.p)&&v.p>0){
      if(!proms[v.ei])proms[v.ei]={s:0,c:0};
      proms[v.ei].s+=v.p;proms[v.ei].c++;
    }
  }
  var pf={};for(var k in proms){pf[k]=(proms[k].s/proms[k].c).toFixed(2)}
  var ec={};
  for(var i=0;i<votos.length;i++){
    if(!ec[votos[i].ei])ec[votos[i].ei]={};
    ec[votos[i].ei][votos[i].vt]=true;
  }
  var rows=[['Nombre','Email','Área','Sede','Promedio','Evaluaciones','eleccion']];
  allCols.sort(function(a,b){return(a.area||'').localeCompare(b.area||'')});
  var convName=conv?conv.nombre:'Sin eleccion';
  for(var i=0;i<allCols.length;i++){
    var c=allCols[i];
    rows.push([c.nombre,c.email,c.area,c.sede,pf[c.email]||'0',ec[c.email]?Object.keys(ec[c.email]).length:0,convName]);
  }
  return{rows:rows};
}

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
function readColaboradores_(ss){
  var sh=ss.getSheetByName('Usuarios');
  if(!sh||sh.getLastRow()<=1)return[];
  var m=hm_(sh);
  var d=sh.getDataRange().getValues();
  if(m.email===undefined)return[];
  var out=[];
  for(var i=1;i<d.length;i++){
    var r=d[i];
    var activo=m.activo!==undefined?isT_(r[m.activo]):true;
    if(!activo)continue;
    var email=String(r[m.email]||'').trim();
    if(!email)continue;
    out.push({
      id:email,nombre:String(cv_(r,m,'nombre','')),area:String(cv_(r,m,'area','')),
      fotoUrl:dUrl_(cv_(r,m,'foto','')),email:email,sede:String(cv_(r,m,'sede',''))
    });
  }
  return out;
}

function readVotos_(ss,convId){
  var sh=ss.getSheetByName('Votos');
  if(!sh||sh.getLastRow()<=1)return[];
  var d=sh.getRange(2,1,sh.getLastRow()-1,10).getValues();
  var o=[];
  for(var i=0;i<d.length;i++){
    // New format: col 3 = eleccionId, col 4 = IdEvaluado
    // Old format: col 3 = IdVotante(unused), col 4 = IdEvaluado
    var cId=String(d[i][3]);
    var eId=String(d[i][4]);
    // If filtering by eleccion
    if(convId&&cId!==convId)continue;
    o.push({vt:String(d[i][1]),ei:eId,p:parseFloat(d[i][7]),conv:cId});
  }
  return o;
}

function lst_(ss,n){
  var sh=ss.getSheetByName(n);
  if(!sh||sh.getLastRow()<=1)return[];
  return sh.getRange(2,1,sh.getLastRow()-1,1).getValues().map(function(r){return r[0]}).filter(Boolean);
}

function tend_(ss,convId){
  var sh=ss.getSheetByName('Votos');
  if(!sh||sh.getLastRow()<=1)return[];
  var d=sh.getRange(2,1,sh.getLastRow()-1,10).getValues();
  var t={};
  for(var i=0;i<d.length;i++){
    if(convId&&String(d[i][3])!==convId)continue;
    var f=new Date(d[i][0]).toLocaleDateString('es-GT');
    var p=parseFloat(d[i][7]);
    if(!isNaN(p)){
      if(!t[f])t[f]={s:0,c:0};
      t[f].s+=p;t[f].c++;
    }
  }
  var r=[];
  for(var f in t){r.push({fecha:f,promedio:(t[f].s/t[f].c).toFixed(2),votos:t[f].c})}
  return r;
}

// ═══════════════════════════════════════
// EVALUACIÓN DIARIA
// ═══════════════════════════════════════
// Hojas:
//   CategoriasDiarias [Categoria, Area, Pregunta, Orden]
//   EvalDiaria [Fecha, SupervisorEmail, ColaboradorEmail, EleccionId, Categoria, Pregunta, Nota]
//   ConfigPesos [Clave, Valor]  (PesoDiaria, PesoEleccion)

/* Get categories with their questions grouped by area */
function getCatDiarias_(ses){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('CategoriasDiarias');
  if(!sh||sh.getLastRow()<=1)return{categorias:[],porArea:{}};
  var d=sh.getRange(2,1,sh.getLastRow()-1,4).getValues();
  var cats={},porArea={};
  for(var i=0;i<d.length;i++){
    var cat=String(d[i][0]).trim(),area=String(d[i][1]).trim(),preg=String(d[i][2]).trim();
    if(!cat||!preg)continue;
    // Global list of categories
    if(!cats[cat])cats[cat]=true;
    // By area
    var key=area||'_GLOBAL';
    if(!porArea[key])porArea[key]={};
    if(!porArea[key][cat])porArea[key][cat]=[];
    porArea[key][cat].push(preg);
  }
  return{categorias:Object.keys(cats),porArea:porArea};
}

/* Save categories/questions (admin) */
function saveCatDiarias_(b){
  var s=assertPerm_(b.token,'parametros');
  // b.datos = [{categoria, area, pregunta}]
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('CategoriasDiarias');
  if(!sh){sh=ss.insertSheet('CategoriasDiarias');sh.appendRow(['Categoria','Area','Pregunta','Orden'])}
  // If area specified, only delete rows for that area; otherwise clear all
  if(b.area){
    var d=sh.getDataRange().getValues();
    for(var i=d.length-1;i>=1;i--){
      if(String(d[i][1]).trim().toLowerCase()===b.area.toLowerCase()){sh.deleteRow(i+1)}
    }
  }else{
    if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,4).clearContent();
  }
  var datos=b.datos||[];
  for(var i=0;i<datos.length;i++){
    sh.appendRow([datos[i].categoria,datos[i].area||'',datos[i].pregunta,i+1]);
  }
  log_('CAT_DIARIAS_SAVE',s.usuario,{area:b.area||'ALL',count:datos.length});
  return{status:'ok',success:true};
}

/* Get questions for a specific area (for supervisor eval screen) */
function getPregDiarias_(ses,b){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('CategoriasDiarias');
  if(!sh||sh.getLastRow()<=1)return{};
  var d=sh.getRange(2,1,sh.getLastRow()-1,4).getValues();
  var area=b.area||'';
  var result={};
  for(var i=0;i<d.length;i++){
    var cat=String(d[i][0]).trim(),rowArea=String(d[i][1]).trim(),preg=String(d[i][2]).trim();
    if(!cat||!preg)continue;
    // Match: exact area match, or global (empty area), or _GLOBAL
    if(rowArea.toLowerCase()===area.toLowerCase()||rowArea===''||rowArea==='_GLOBAL'){
      if(!result[cat])result[cat]=[];
      result[cat].push(preg);
    }
  }
  return result;
}

/* Get collaborators the supervisor can evaluate daily (based on assigned areas) */
function getColabsEvalDiaria_(ses,b){
  var usr=findU_(ses.usuario);
  if(!usr)throw new Error('No encontrado');
  if(usr.rol!=='supervisor'&&usr.rol!=='admin')throw new Error('Solo supervisores');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var allCols=readColaboradores_(ss);
  // Supervisors can evaluate ALL collaborators daily (not restricted by evaluadores field)
  // The evaluadores field is only for election evaluator assignment
  // Exclude self
  allCols=allCols.filter(function(c){return c.email.toLowerCase()!==usr.email.toLowerCase()});
  // Group by area
  var grouped={};
  allCols.forEach(function(c){
    var a=c.area||'Sin Área';
    if(!grouped[a])grouped[a]=[];
    grouped[a].push(c);
  });
  return grouped;
}

/* Check what's already evaluated today for this supervisor */
function getEvalDiariaHoy_(ses,b){
  var usr=findU_(ses.usuario);
  if(!usr)throw new Error('NF');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('EvalDiaria');
  if(!sh||sh.getLastRow()<=1)return{evaluados:{}};
  var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  var hoy=new Date().toLocaleDateString('es-GT');
  var evaluados={};
  for(var i=0;i<d.length;i++){
    var fecha=new Date(d[i][0]).toLocaleDateString('es-GT');
    var supEmail=String(d[i][1]).toLowerCase();
    if(fecha===hoy&&supEmail===usr.email.toLowerCase()){
      var colEmail=String(d[i][2]);
      if(!evaluados[colEmail])evaluados[colEmail]=[];
      evaluados[colEmail].push({cat:String(d[i][4]),preg:String(d[i][5]),nota:parseFloat(d[i][6])});
    }
  }
  return{evaluados:evaluados,fecha:hoy};
}

/* Save daily evaluation */
function guardarEvalDiaria_(b){
  var s=sesOk_(b.token);
  if(!s)return{status:'error',message:'Sesión inválida'};
  var usr=findU_(s.usuario);
  if(!usr||(usr.rol!=='supervisor'&&usr.rol!=='admin'))return{status:'error',message:'Solo supervisores'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var conv=getEleccionActiva_();
  var elecId=conv?conv.id:'SIN_ELECCION';
  var sh=ss.getSheetByName('EvalDiaria');
  if(!sh){
    sh=ss.insertSheet('EvalDiaria');
    sh.appendRow(['Fecha','SupervisorEmail','ColaboradorEmail','EleccionId','Categoria','Pregunta','Nota','Comentario']);
  }
  // b.colaboradorEmail, b.calificaciones = [{categoria, pregunta, nota}], b.comentario
  var fecha=new Date();
  var comentario=b.comentario||'';
  var rows=[];
  for(var i=0;i<b.calificaciones.length;i++){
    var c=b.calificaciones[i];
    rows.push([fecha,s.usuario,b.colaboradorEmail,elecId,c.categoria,c.pregunta,c.nota,comentario]);
  }
  if(rows.length>0){
    sh.getRange(sh.getLastRow()+1,1,rows.length,8).setValues(rows);
  }
  log_('EVAL_DIARIA',s.usuario,{colab:b.colaboradorEmail,count:rows.length});
  return{status:'ok',success:true,message:'Evaluación diaria guardada'};
}

/* Get/Save weight config */
function getPesos_(ses){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('ConfigPesos');
  if(!sh)return{pesoDiaria:40,pesoEleccion:60};
  var d=sh.getDataRange().getValues();
  var cfg={pesoDiaria:40,pesoEleccion:60};
  for(var i=1;i<d.length;i++){
    var k=String(d[i][0]).toLowerCase().trim();
    var v=parseFloat(d[i][1]);
    if(k==='pesodiaria'&&!isNaN(v))cfg.pesoDiaria=v;
    if(k==='pesoeleccion'&&!isNaN(v))cfg.pesoEleccion=v;
  }
  return cfg;
}

function savePesos_(b){
  var s=assertPerm_(b.token,'parametros');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('ConfigPesos');
  if(!sh){sh=ss.insertSheet('ConfigPesos');sh.appendRow(['Clave','Valor'])}
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,2).clearContent();
  sh.appendRow(['PesoDiaria',b.pesoDiaria||40]);
  sh.appendRow(['PesoEleccion',b.pesoEleccion||60]);
  log_('PESOS_SAVE',s.usuario,{d:b.pesoDiaria,e:b.pesoEleccion});
  return{status:'ok',success:true};
}

/* Combined dashboard: daily avg + election avg = final score */
function getDashCombinado_(ses){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var conv=getEleccionActiva_();
  var elecId=conv?conv.id:null;
  var allCols=readColaboradores_(ss);
  
  // Get weights
  var pesos=getPesos_({});
  var pD=pesos.pesoDiaria/100;
  var pE=pesos.pesoEleccion/100;
  
  // Election votes
  var votosElec=readVotos_(ss,elecId);
  var promsElec={};
  for(var i=0;i<votosElec.length;i++){
    var v=votosElec[i];
    if(v.ei&&!isNaN(v.p)&&v.p>0){
      if(!promsElec[v.ei])promsElec[v.ei]={s:0,c:0};
      promsElec[v.ei].s+=v.p;promsElec[v.ei].c++;
    }
  }
  var pfElec={};
  for(var k in promsElec){pfElec[k]=promsElec[k].c>0?promsElec[k].s/promsElec[k].c:0}
  
  // Daily evaluations for this election period
  var shD=ss.getSheetByName('EvalDiaria');
  var promsDiaria={};
  if(shD&&shD.getLastRow()>1){
    var dD=shD.getRange(2,1,shD.getLastRow()-1,7).getValues();
    for(var i=0;i<dD.length;i++){
      var eId=String(dD[i][3]);
      if(elecId&&eId!==elecId)continue;
      var colEmail=String(dD[i][2]).toLowerCase();
      var nota=parseFloat(dD[i][6]);
      if(!isNaN(nota)&&nota>0){
        if(!promsDiaria[colEmail])promsDiaria[colEmail]={s:0,c:0};
        promsDiaria[colEmail].s+=nota;promsDiaria[colEmail].c++;
      }
    }
  }
  var pfDiaria={};
  for(var k in promsDiaria){pfDiaria[k]=promsDiaria[k].c>0?promsDiaria[k].s/promsDiaria[k].c:0}
  
  // Combine scores
  var resultados=[];
  for(var i=0;i<allCols.length;i++){
    var c=allCols[i];
    var email=c.email.toLowerCase();
    var avgElec=pfElec[email]||pfElec[c.id]||0;
    var avgDiaria=pfDiaria[email]||0;
    var final_score=0;
    if(avgElec>0&&avgDiaria>0){
      final_score=(avgDiaria*pD)+(avgElec*pE);
    }else if(avgElec>0){
      final_score=avgElec;
    }else if(avgDiaria>0){
      final_score=avgDiaria;
    }
    resultados.push({
      email:c.email,nombre:c.nombre,area:c.area,sede:c.sede,foto:c.fotoUrl,
      promEleccion:avgElec,promDiaria:avgDiaria,puntajeFinal:final_score,
      evalsDiarias:promsDiaria[email]?promsDiaria[email].c:0
    });
  }
  // Sort by final score desc
  resultados.sort(function(a,b){return b.puntajeFinal-a.puntajeFinal});
  
  // Top by area
  var topArea={};
  resultados.forEach(function(r){
    if(r.puntajeFinal>0&&(!topArea[r.area]||r.puntajeFinal>topArea[r.area].puntajeFinal)){
      topArea[r.area]=r;
    }
  });
  
  return{
    resultados:resultados,
    topPorArea:topArea,
    pesos:pesos,
    eleccion:conv?{id:conv.id,nombre:conv.nombre}:null
  };
}

// ═══════════════════════════════════════
// SETUP - Run ONCE
// ═══════════════════════════════════════
function setupPasswordColumns(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Usuarios');
  if(!sh){Logger.log('No sheet Usuarios');return}
  var hs=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var ns=hs.map(function(h){return String(h).toLowerCase().trim()});
  var nx=hs.length+1;
  if(ns.indexOf('passwordhash')===-1){sh.getRange(1,nx).setValue('PasswordHash').setFontWeight('bold');nx++}
  if(ns.indexOf('primeringreso')===-1){sh.getRange(1,nx).setValue('PrimerIngreso').setFontWeight('bold');for(var i=2;i<=sh.getLastRow();i++)sh.getRange(i,nx).setValue(true);nx++}
  if(ns.indexOf('sede')===-1&&ns.indexOf('ubicacion')===-1){sh.getRange(1,nx).setValue('Sede').setFontWeight('bold');nx++}
  if(ns.indexOf('foto')===-1&&ns.indexOf('fotourl')===-1){sh.getRange(1,nx).setValue('Foto').setFontWeight('bold');nx++}
  if(ns.indexOf('permisos')===-1){sh.getRange(1,nx).setValue('Permisos').setFontWeight('bold');nx++}
  if(ns.indexOf('evaluadores')===-1){sh.getRange(1,nx).setValue('Evaluadores').setFontWeight('bold');nx++}
  // Ensure sheets
  if(!ss.getSheetByName('Sesiones')){var s2=ss.insertSheet('Sesiones');s2.appendRow(['Token','Usuario','Creado','Expira'])}
  if(!ss.getSheetByName('Votos')){var v2=ss.insertSheet('Votos');v2.appendRow(['Timestamp','EmailVotante','NombreVotante','eleccionId','IdEvaluado','NombreEvaluado','Parametro','Puntuacion','Sede','Comentario'])}
  if(!ss.getSheetByName('Elecciones')){var c2=ss.insertSheet('Elecciones');c2.appendRow(['Id','Nombre','FechaInicio','FechaFin','Estado','CreadoPor','FechaCreacion'])}
  if(!ss.getSheetByName('ParametrosArea')){var p2=ss.insertSheet('ParametrosArea');p2.appendRow(['Area','Parametro'])}
  // Daily evaluation sheets
  if(!ss.getSheetByName('CategoriasDiarias')){var cd=ss.insertSheet('CategoriasDiarias');cd.appendRow(['Categoria','Area','Pregunta','Orden'])}
  if(!ss.getSheetByName('EvalDiaria')){var ed=ss.insertSheet('EvalDiaria');ed.appendRow(['Fecha','SupervisorEmail','ColaboradorEmail','EleccionId','Categoria','Pregunta','Nota','Comentario'])}
  if(!ss.getSheetByName('ConfigPesos')){var cp=ss.insertSheet('ConfigPesos');cp.appendRow(['Clave','Valor']);cp.appendRow(['PesoDiaria',40]);cp.appendRow(['PesoEleccion',60])}
  Logger.log('Setup v8 OK');
}

/* Remove sheets that are no longer needed */
function cleanupSheets(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var remove=['Colaboradores','Convocatorias','Parametros Supervisores'];
  remove.forEach(function(n){
    var sh=ss.getSheetByName(n);
    if(sh){
      try{ss.deleteSheet(sh);Logger.log('Deleted: '+n)}catch(e){Logger.log('Cannot delete '+n+': '+e)}
    }
  });
  Logger.log('Cleanup done. Required sheets: Usuarios, Votos, Elecciones, Parametros, ParametrosArea, Areas, Sedes, CategoriasDiarias, EvalDiaria, ConfigPesos, Sesiones, Auditoria');
}