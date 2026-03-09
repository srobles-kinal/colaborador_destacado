/**
 * API v6 — Sistema de Evaluación
 * New: Convocatorias (monthly events), ParametrosArea, supervisor evaluator picker
 * Sheets: Usuarios, Votos, Parametros, ParametrosArea, Areas, Sedes,
 *         Convocatorias, Sesiones, Auditoria
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
      // Convocatorias
      case 'getConvocatorias':return wA_(b,getConvocatorias_);
      case 'crearConvocatoria':return jr_(crearConvocatoria_(b));
      case 'activarConvocatoria':return jr_(activarConvocatoria_(b));
      case 'cerrarConvocatoria':return jr_(cerrarConvocatoria_(b));
      // Export
      case 'exportReport':return wA_(b,exportReport_);
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

function cv_(r,m,k,d){return m[k]!==undefined?r[m[k]]:d}
function isT_(v){return v===true||String(v).toUpperCase()==='TRUE'}
function dUrl_(u){if(!u)return'';var x=String(u).match(/\/d\/([a-zA-Z0-9-_]+)/);return x?'https://lh3.googleusercontent.com/d/'+x[1]:String(u)}

// ═══════════════════════════════════════
// USER LOOKUP
// ═══════════════════════════════════════
function findU_(email){
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
      return{
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
    }
  }
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
  var baseP={admin:['votar','dashboard','reportes','admin','usuarios'],supervisor:['votar','dashboard','reportes'],votante:['votar'],evaluado:['votar']};
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
// CONVOCATORIAS (Monthly Events)
// ═══════════════════════════════════════
// Sheet: Convocatorias [Id, Nombre, FechaInicio, FechaFin, Estado, CreadoPor, FechaCreacion]
// Estado: activa | cerrada | borrador

function getConvocatoriaActiva_(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Convocatorias');
  if(!sh||sh.getLastRow()<=1)return null;
  var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  for(var i=0;i<d.length;i++){
    if(String(d[i][4]).toLowerCase()==='activa'){
      return{id:String(d[i][0]),nombre:String(d[i][1]),inicio:d[i][2],fin:d[i][3],estado:'activa',row:i+2};
    }
  }
  return null;
}

function getConvocatorias_(ses){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Convocatorias');
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

function crearConvocatoria_(b){
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
  if(!b.nombre)return{status:'error',message:'Nombre requerido'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Convocatorias');
  if(!sh){
    sh=ss.insertSheet('Convocatorias');
    sh.appendRow(['Id','Nombre','FechaInicio','FechaFin','Estado','CreadoPor','FechaCreacion']);
  }
  var id=uuid_().substring(0,8);
  sh.appendRow([id,b.nombre,b.fechaInicio||new Date(),b.fechaFin||'','borrador',s.usuario,new Date()]);
  log_('CONV_CREATE',s.usuario,{id:id,nombre:b.nombre});
  return{status:'ok',success:true,id:id};
}

function activarConvocatoria_(b){
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Convocatorias');
  if(!sh)return{status:'error',message:'No hay convocatorias'};
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
      log_('CONV_ACTIVATE',s.usuario,{id:b.id});
      return{status:'ok',success:true};
    }
  }
  return{status:'error',message:'Convocatoria no encontrada'};
}

function cerrarConvocatoria_(b){
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Convocatorias');
  if(!sh)return{status:'error',message:'No hay convocatorias'};
  var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  for(var i=0;i<d.length;i++){
    if(String(d[i][0])===b.id){
      sh.getRange(i+2,5).setValue('cerrada');
      log_('CONV_CLOSE',s.usuario,{id:b.id});
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
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
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
// GET ALL DATA
// ═══════════════════════════════════════
function getAllData_(ses){
  var usr=findU_(ses.usuario);
  if(!usr)throw new Error('User not found');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var allCols=readColaboradores_(ss);

  // Active convocatoria
  var conv=getConvocatoriaActiva_();

  // Supervisors with evaluator config
  var supervisores=[];
  allCols.forEach(function(c){
    var u=findU_(c.email);
    if(u&&u.rol==='supervisor'){
      var evList=u.evaluadores?u.evaluadores.split(',').map(function(x){return x.trim().toLowerCase()}).filter(Boolean):[];
      supervisores.push({colab:c,evaluadoresList:evList});
    }
  });

  // Filtering
  var isAdm=usr.rol==='admin'||usr.rol==='supervisor';
  var cols;
  if(isAdm){
    cols=allCols;
  }else{
    var isMini=usr.sede&&usr.sede.toLowerCase().indexOf('mini')>=0;
    if(isMini){
      cols=allCols.filter(function(c){return c.sede.toLowerCase().trim()===usr.sede.toLowerCase().trim()});
    }else if(usr.area){
      cols=allCols.filter(function(c){return c.area.toLowerCase().trim()===usr.area.toLowerCase().trim()});
    }else{
      cols=allCols;
    }
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

  // Votes - filter by active convocatoria if exists
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
  var baseP={admin:['votar','dashboard','reportes','admin','usuarios'],supervisor:['votar','dashboard','reportes'],votante:['votar'],evaluado:['votar']};
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
    convocatoriaActiva:conv?{id:conv.id,nombre:conv.nombre}:null,
    analytics:{totalColaboradores:cols.length,votantesUnicos:nv,evaluadosUnicos:Object.keys(es).length,
      tasaParticipacion:cols.length>0?((nv/cols.length)*100).toFixed(1):'0'}
  };
}

// ═══════════════════════════════════════
// VOTES (tied to convocatoria)
// ═══════════════════════════════════════
function guardarVotos_(b){
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var conv=getConvocatoriaActiva_();
  if(!conv)return{status:'error',message:'No hay convocatoria activa. Contacta al administrador.'};
  var convId=conv.id;
  var vSh=ss.getSheetByName('Votos');
  if(!vSh){
    vSh=ss.insertSheet('Votos');
    vSh.appendRow(['Timestamp','EmailVotante','NombreVotante','ConvocatoriaId','IdEvaluado','NombreEvaluado','Parametro','Puntuacion','Sede','Comentario']);
  }
  // Check duplicate within this convocatoria
  var vD=vSh.getLastRow()>1?vSh.getRange(2,1,vSh.getLastRow()-1,10).getValues():[];
  for(var i=0;i<vD.length;i++){
    if(String(vD[i][1])===s.usuario&&String(vD[i][3])===convId&&String(vD[i][4])===String(b.evaluadoId)){
      return{status:'ok',success:false,message:'Ya evaluaste a este colaborador en esta convocatoria'};
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
  // Calc new avg for this convocatoria
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
  var conv=getConvocatoriaActiva_();
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
    convocatoria:conv?{id:conv.id,nombre:conv.nombre}:null
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
  var u=findU_(ses.usuario);if(!u||u.rol!=='admin')throw new Error('No autorizado');
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
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
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
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
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
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
  var u=findU_(b.email);if(!u)return{status:'error',message:'No encontrado'};
  u.sh.deleteRow(u.ri+1);
  log_('USER_DEL',s.usuario,{t:b.email});
  return{status:'ok',success:true};
}

function resetPwd_(b){
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
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
  var usr=findU_(ses.usuario);if(!usr||usr.rol!=='admin')throw new Error('No autorizado');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Usuarios');if(!sh)return[];
  var m=hm_(sh),d=sh.getDataRange().getValues(),out=[];
  for(var i=1;i<d.length;i++){
    var rol=String(cv_(d[i],m,'rol','')).toLowerCase().trim();
    if(rol==='supervisor'){
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
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
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
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
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
  var conv=getConvocatoriaActiva_();
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
  var rows=[['Nombre','Email','Área','Sede','Promedio','Evaluaciones','Convocatoria']];
  allCols.sort(function(a,b){return(a.area||'').localeCompare(b.area||'')});
  var convName=conv?conv.nombre:'Sin convocatoria';
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
    // New format: col 3 = ConvocatoriaId, col 4 = IdEvaluado
    // Old format: col 3 = IdVotante(unused), col 4 = IdEvaluado
    var cId=String(d[i][3]);
    var eId=String(d[i][4]);
    // If filtering by convocatoria
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
  if(!ss.getSheetByName('Votos')){var v2=ss.insertSheet('Votos');v2.appendRow(['Timestamp','EmailVotante','NombreVotante','ConvocatoriaId','IdEvaluado','NombreEvaluado','Parametro','Puntuacion','Sede','Comentario'])}
  if(!ss.getSheetByName('Convocatorias')){var c2=ss.insertSheet('Convocatorias');c2.appendRow(['Id','Nombre','FechaInicio','FechaFin','Estado','CreadoPor','FechaCreacion'])}
  if(!ss.getSheetByName('ParametrosArea')){var p2=ss.insertSheet('ParametrosArea');p2.appendRow(['Area','Parametro'])}
  Logger.log('Setup v6 OK');
}