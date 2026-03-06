/**
 * API v5.1 — Sistema de Evaluación
 * Changes: sede filtering for mini-munis, top colaborador per area/sede, role-based perms
 */
var CFG={VERSION:'5.1',SESSION_H:8};
function sha256_(t){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,t).map(function(b){return('0'+((b+256)%256).toString(16)).slice(-2)}).join('')}
function uuid_(){return Utilities.getUuid()}
function jr_(d){return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON)}
function ok_(d){return jr_({status:'ok',data:d})}
function err_(m){return jr_({status:'error',message:m})}

function doGet(){return jr_({status:'ok',v:CFG.VERSION})}
function doPost(e){
  var b;try{b=JSON.parse(e.postData.contents)}catch(x){return err_('JSON inválido')}
  var a=b.action||'';
  try{
    switch(a){
      case 'login':return jr_(login_(b));
      case 'cambiarPassword':return jr_(cambiarPwd_(b));
      case 'logout':return jr_(logout_(b));
      case 'getAllData':return wA_(b,getAllData_);
      case 'getDashboardData':return wA_(b,getDash_);
      case 'getAdminStats':return wA_(b,getAdminStats_);
      case 'guardarVotos':return jr_(guardarVotos_(b));
      case 'getUsuarios':return wA_(b,getUsuarios_);
      case 'crearUsuario':return jr_(crearUsuario_(b));
      case 'editarUsuario':return jr_(editarUsuario_(b));
      case 'eliminarUsuario':return jr_(eliminarUsuario_(b));
      case 'saveParametros':case 'saveParametrosSupervisores':case 'saveAreas':case 'saveSedes':return jr_(saveList_(b));
      default:return err_('Acción: '+a)
    }
  }catch(x){return err_(x.toString())}
}
function wA_(b,fn){var s=sesOk_(b.token);if(!s)return err_('Sesión inválida');return ok_(fn(s,b))}

/* Column detection */
var _hc={};
function hm_(sh){
  var n=sh.getName();if(_hc[n])return _hc[n];
  var hs=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0],m={};
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
    else if(/^(colaborador)$/.test(h)){if(m.nombre===undefined)m.nombre=i;}
    // permisos field
    else if(/^(permisos|permissions)$/.test(h))m.permisos=i;
  }
  _hc[n]=m;return m;
}
function cv_(r,m,k,d){return m[k]!==undefined?r[m[k]]:d}
function isT_(v){return v===true||String(v).toUpperCase()==='TRUE'}
function dUrl_(u){if(!u)return'';var x=String(u).match(/\/d\/([a-zA-Z0-9-_]+)/);return x?'https://lh3.googleusercontent.com/d/'+x[1]:String(u)}

function findU_(email){
  var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Usuarios');
  if(!sh)return null;var m=hm_(sh),d=sh.getDataRange().getValues();if(m.email===undefined)return null;
  var e=String(email).trim().toLowerCase();
  for(var i=1;i<d.length;i++){
    if(String(d[i][m.email]).trim().toLowerCase()===e){
      var permisos=m.permisos!==undefined?String(d[i][m.permisos]):'';
      return{ri:i,sh:sh,m:m,email:String(d[i][m.email]).trim(),nombre:cv_(d[i],m,'nombre',''),
        rol:String(cv_(d[i],m,'rol','votante')).toLowerCase().trim(),
        area:String(cv_(d[i],m,'area','')),
        activo:m.activo!==undefined?isT_(d[i][m.activo]):true,
        pwd:String(cv_(d[i],m,'pwd','')),primer:m.primer!==undefined?isT_(d[i][m.primer]):false,
        sede:String(cv_(d[i],m,'sede','')),foto:dUrl_(cv_(d[i],m,'foto','')),
        permisos:permisos?permisos.split(',').map(function(p){return p.trim()}):[]}
    }
  }
  return null;
}

/* Sessions */
function sesOk_(tk){
  if(!tk)return null;var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sesiones');
  if(!sh)return null;var d=sh.getDataRange().getValues(),now=new Date();
  for(var i=1;i<d.length;i++){if(d[i][0]===tk){if(now>new Date(d[i][3])){sh.deleteRow(i+1);return null}return{usuario:d[i][1]}}}
  return null;
}
function mkSes_(e,tk){var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Sesiones');if(!sh){sh=ss.insertSheet('Sesiones');sh.appendRow(['Token','Usuario','Creado','Expira'])}var n=new Date();sh.appendRow([tk,e,n,new Date(n.getTime()+CFG.SESSION_H*3600000)])}
function rmSes_(tk){var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sesiones');if(!sh)return;var d=sh.getDataRange().getValues();for(var i=d.length-1;i>=1;i--){if(d[i][0]===tk){sh.deleteRow(i+1);return}}}
function log_(a,u,d){var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Auditoria');if(!sh){sh=ss.insertSheet('Auditoria');sh.appendRow(['Timestamp','Usuario','Accion','Detalles'])}sh.appendRow([new Date(),u,a,JSON.stringify(d||{})])}

/* Auth */
function login_(b){
  if(!b.usuario||!b.password)return{status:'error',message:'Credenciales requeridas'};
  var u=findU_(b.usuario);if(!u)return{status:'error',message:'Usuario no encontrado'};
  if(!u.activo)return{status:'error',message:'Usuario deshabilitado'};
  var h=sha256_(b.password),primer=u.primer;
  if(!u.pwd||u.pwd===''||u.pwd==='undefined'){
    if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(h);
    if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(true);
    primer=true;
  }else if(u.pwd!==h){log_('LOGIN_FAIL',b.usuario,{});return{status:'error',message:'Contraseña incorrecta'}}
  var tk=uuid_();mkSes_(u.email,tk);
  if(u.m.acceso!==undefined)u.sh.getRange(u.ri+1,u.m.acceso+1).setValue(new Date());
  log_('LOGIN',u.email,{});
  
  // Build permissions based on role + custom permisos
  var basePerms={admin:['votar','dashboard','reportes','admin','usuarios'],supervisor:['votar','dashboard','reportes'],votante:['votar'],evaluado:['votar']};
  var rolePerms=basePerms[u.rol]||['votar'];
  // Merge custom perms from sheet
  var allPerms=rolePerms.slice();
  u.permisos.forEach(function(p){if(p&&allPerms.indexOf(p)===-1)allPerms.push(p)});
  
  return{status:'ok',success:true,token:tk,usuario:{
    email:u.email,nombre:u.nombre,rol:u.rol,area:u.area,sede:u.sede,foto:u.foto,primerIngreso:primer,permisos:allPerms
  }};
}
function cambiarPwd_(b){
  if(!b.nuevaPassword||b.nuevaPassword.length<6)return{status:'error',message:'Mínimo 6 caracteres'};
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var u=findU_(s.usuario);if(!u)return{status:'error',message:'No encontrado'};
  if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(sha256_(b.nuevaPassword));
  if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(false);
  log_('PWD_CHANGE',s.usuario,{});return{status:'ok',success:true};
}
function logout_(b){rmSes_(b.token);return{status:'ok',success:true}}

/* Data */
function getAllData_(ses){
  var usr=findU_(ses.usuario);if(!usr)throw new Error('User not found');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var cols=readColaboradores_(ss);
  
  // FILTERING LOGIC:
  // admin/supervisor: see all
  // others with "mini muni" in sede: filter by sede only
  // others: filter by area
  var isAdm=usr.rol==='admin'||usr.rol==='supervisor';
  if(!isAdm){
    var isMini=usr.sede&&usr.sede.toLowerCase().indexOf('mini')>=0;
    if(isMini){
      cols=cols.filter(function(c){return c.sede.toLowerCase().trim()===usr.sede.toLowerCase().trim()});
    }else if(usr.area){
      cols=cols.filter(function(c){return c.area.toLowerCase().trim()===usr.area.toLowerCase().trim()});
    }
  }

  var params=lst_(ss,'Parametros'),pSup=lst_(ss,'Parametros Supervisores'),areas=lst_(ss,'Areas'),sedes=lst_(ss,'Sedes');
  var votos=readVotos_(ss);
  var evU={},proms={};
  for(var i=0;i<votos.length;i++){var v=votos[i];evU[v.vt+'|'+v.ei]=true;if(v.ei&&!isNaN(v.p)&&v.p>0){if(!proms[v.ei])proms[v.ei]={s:0,c:0};proms[v.ei].s+=v.p;proms[v.ei].c++}}
  var pf={};for(var k in proms){pf[k]=proms[k].c>0?proms[k].s/proms[k].c:0}
  var cids={};for(var j=0;j<cols.length;j++)cids[String(cols[j].id)]=true;
  var tv=0,vs={},es={};
  for(var i=0;i<votos.length;i++){if(cids[votos[i].ei]){tv++;vs[votos[i].vt]=true;es[votos[i].ei]=true}}
  var nv=Object.keys(vs).length;

  // Top por area y sede
  var topArea={},topSede={};
  for(var j=0;j<cols.length;j++){
    var c=cols[j],pm=pf[String(c.id)];
    if(pm&&pm>0){
      if(!topArea[c.area]||pm>topArea[c.area].prom)topArea[c.area]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,area:c.area};
      if(c.sede){if(!topSede[c.sede]||pm>topSede[c.sede].prom)topSede[c.sede]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,sede:c.sede}}
    }
  }

  // Build permissions
  var basePerms={admin:['votar','dashboard','reportes','admin','usuarios'],supervisor:['votar','dashboard','reportes'],votante:['votar'],evaluado:['votar']};
  var perms=basePerms[usr.rol]||['votar'];
  usr.permisos.forEach(function(p){if(p&&perms.indexOf(p)===-1)perms.push(p)});

  return{
    usuario:{email:usr.email,nombre:usr.nombre,rol:usr.rol,area:usr.area,sede:usr.sede,foto:usr.foto,permisos:perms},
    colaboradores:cols,
    parametros:params.length?params:['Calidad de Trabajo'],
    parametrosSupervisores:pSup.length?pSup:['Liderazgo'],
    areas:areas,sedes:sedes,evaluacionesUnicas:evU,promedios:pf,
    topPorArea:topArea,topPorSede:topSede,
    analytics:{totalVotos:tv,totalColaboradores:cols.length,votantesUnicos:nv,evaluadosUnicos:Object.keys(es).length,
      tasaParticipacion:cols.length>0?((nv/cols.length)*100).toFixed(1):'0',
      totalCalificados:Object.keys(es).length}
  };
}

function getDash_(ses){
  var usr=findU_(ses.usuario);if(!usr)throw new Error('NF');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var allCols=readColaboradores_(ss);
  var votos=readVotos_(ss);
  // Global analytics
  var proms={};
  for(var i=0;i<votos.length;i++){var v=votos[i];if(v.ei&&!isNaN(v.p)&&v.p>0){if(!proms[v.ei])proms[v.ei]={s:0,c:0};proms[v.ei].s+=v.p;proms[v.ei].c++}}
  var pf={};for(var k in proms){pf[k]=(proms[k].s/proms[k].c).toFixed(2)}
  // Top per area
  var topA={},topS={};
  for(var j=0;j<allCols.length;j++){
    var c=allCols[j],pm=pf[String(c.id)];
    if(pm){var pmN=parseFloat(pm);
      if(!topA[c.area]||pmN>topA[c.area].prom)topA[c.area]={nombre:c.nombre,foto:c.fotoUrl,prom:pmN,area:c.area};
      if(c.sede&&(!topS[c.sede]||pmN>topS[c.sede].prom))topS[c.sede]={nombre:c.nombre,foto:c.fotoUrl,prom:pmN,sede:c.sede};
    }
  }
  var vs={},es={};for(var i=0;i<votos.length;i++){vs[votos[i].vt]=true;es[votos[i].ei]=true}
  return{
    analytics:{totalVotos:votos.length,totalColaboradores:allCols.length,votantesUnicos:Object.keys(vs).length,evaluadosUnicos:Object.keys(es).length,promedios:pf,
      tasaParticipacion:allCols.length>0?((Object.keys(vs).length/allCols.length)*100).toFixed(1):'0'},
    topPorArea:topA,topPorSede:topS,tendencias:tend_(ss)
  };
}

function getAdminStats_(ses){
  var ss=SpreadsheetApp.getActiveSpreadsheet();var allU=readColaboradores_(ss);
  return{totalColaboradores:allU.length,totalAreas:lst_(ss,'Areas').length,
    parametros:lst_(ss,'Parametros'),parametrosSupervisores:lst_(ss,'Parametros Supervisores'),
    areas:lst_(ss,'Areas'),sedes:lst_(ss,'Sedes')};
}

/* Users CRUD */
function getUsuarios_(ses){
  var u=findU_(ses.usuario);if(!u||u.rol!=='admin')throw new Error('No autorizado');
  var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Usuarios');if(!sh)return[];
  var m=hm_(sh),d=sh.getDataRange().getValues(),out=[];
  for(var i=1;i<d.length;i++){
    var perms=m.permisos!==undefined?String(d[i][m.permisos]):'';
    out.push({email:cv_(d[i],m,'email',''),nombre:cv_(d[i],m,'nombre',''),rol:String(cv_(d[i],m,'rol','votante')).toLowerCase(),
      area:cv_(d[i],m,'area',''),activo:m.activo!==undefined?isT_(d[i][m.activo]):true,sede:cv_(d[i],m,'sede',''),
      foto:dUrl_(cv_(d[i],m,'foto','')),permisos:perms})
  }
  return out;
}
function crearUsuario_(b){
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
  if(!b.email||!b.nombre)return{status:'error',message:'Email y nombre requeridos'};
  if(findU_(b.email))return{status:'error',message:'Ya existe'};
  var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Usuarios'),m=hm_(sh);
  var hs=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0],row=[];
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
  sh.appendRow(row);log_('USER_CREATE',s.usuario,{n:b.email});
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
  if(b.resetPassword&&u.m.pwd!==undefined){u.sh.getRange(u.ri+1,u.m.pwd+1).setValue('');if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(true)}
  log_('USER_EDIT',s.usuario,{t:b.email});return{status:'ok',success:true};
}
function eliminarUsuario_(b){
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var adm=findU_(s.usuario);if(!adm||adm.rol!=='admin')return{status:'error',message:'No autorizado'};
  var u=findU_(b.email);if(!u)return{status:'error',message:'No encontrado'};
  u.sh.deleteRow(u.ri+1);log_('USER_DEL',s.usuario,{t:b.email});return{status:'ok',success:true};
}

/* Votes */
function guardarVotos_(b){
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var ss=SpreadsheetApp.getActiveSpreadsheet(),vSh=ss.getSheetByName('Votos');
  if(!vSh){vSh=ss.insertSheet('Votos');vSh.appendRow(['Timestamp','EmailVotante','IdVotante','NombreVotante','IdEvaluado','NombreEvaluado','Parametro','Puntuacion','Sede','Comentario'])}
  var vD=vSh.getLastRow()>1?vSh.getRange(2,1,vSh.getLastRow()-1,10).getValues():[];
  for(var i=0;i<vD.length;i++){if(String(vD[i][1])===s.usuario&&String(vD[i][4])===String(b.evaluadoId))return{status:'ok',success:false,message:'Ya evaluaste a este colaborador',evaluadoId:String(b.evaluadoId)}}
  var usr=findU_(s.usuario),ts=new Date(),rows=[];
  for(var c=0;c<b.calificaciones.length;c++){rows.push([ts,s.usuario,'',usr?usr.nombre:s.usuario,b.evaluadoId,b.evaluadoNombre,b.calificaciones[c].parametro,b.calificaciones[c].puntuacion,b.sede||'',b.comentario||''])}
  vSh.getRange(vSh.getLastRow()+1,1,rows.length,10).setValues(rows);
  log_('EVAL',s.usuario,{ei:b.evaluadoId});
  var all=vSh.getRange(2,1,vSh.getLastRow()-1,10).getValues(),sum=0,cnt=0;
  for(var i=0;i<all.length;i++){if(String(all[i][4])===String(b.evaluadoId)){var p=parseFloat(all[i][7]);if(!isNaN(p)&&p>0){sum+=p;cnt++}}}
  return{status:'ok',success:true,message:'Evaluación guardada',evaluadoId:String(b.evaluadoId),nuevoPromedio:cnt>0?sum/cnt:0};
}
function saveList_(b){
  var s=sesOk_(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
  var map={saveParametros:{h:'Parametros',hd:'Parametro'},saveParametrosSupervisores:{h:'Parametros Supervisores',hd:'Parametro'},saveAreas:{h:'Areas',hd:'Area'},saveSedes:{h:'Sedes',hd:'Sede'}};
  var c=map[b.action];if(!c)return{status:'error',message:'?'};
  var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName(c.h);
  if(!sh){sh=ss.insertSheet(c.h);sh.getRange(1,1).setValue(c.hd).setFontWeight('bold')}
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,1).clearContent();
  if(b.valores&&b.valores.length)sh.getRange(2,1,b.valores.length,1).setValues(b.valores.map(function(v){return[v]}));
  return{status:'ok',success:true};
}

/* Helpers */
/**
 * readColaboradores_: Lee de hoja USUARIOS (ya no de Colaboradores).
 * Cada usuario activo es automáticamente un colaborador evaluable.
 * Usa el email como ID único.
 */
function readColaboradores_(ss){
  var sh=ss.getSheetByName('Usuarios');
  if(!sh||sh.getLastRow()<=1)return[];
  var m=hm_(sh),d=sh.getDataRange().getValues();
  if(m.email===undefined)return[];
  var out=[];
  for(var i=1;i<d.length;i++){
    var r=d[i];
    var activo=m.activo!==undefined?isT_(r[m.activo]):true;
    if(!activo)continue;
    var email=String(r[m.email]||'').trim();
    if(!email)continue;
    out.push({
      id:email,
      nombre:String(cv_(r,m,'nombre','')),
      area:String(cv_(r,m,'area','')),
      fotoUrl:dUrl_(cv_(r,m,'foto','')),
      email:email,
      sede:String(cv_(r,m,'sede',''))
    });
  }
  return out;
}
function readVotos_(ss){
  var sh=ss.getSheetByName('Votos');if(!sh||sh.getLastRow()<=1)return[];
  var d=sh.getRange(2,1,sh.getLastRow()-1,10).getValues(),o=[];
  for(var i=0;i<d.length;i++){o.push({vt:String(d[i][1]),ei:String(d[i][4]),p:parseFloat(d[i][7])})}return o;
}
function lst_(ss,n){var sh=ss.getSheetByName(n);if(!sh||sh.getLastRow()<=1)return[];return sh.getRange(2,1,sh.getLastRow()-1,1).getValues().map(function(r){return r[0]}).filter(Boolean)}
function tend_(ss){
  var sh=ss.getSheetByName('Votos');if(!sh||sh.getLastRow()<=1)return[];
  var d=sh.getRange(2,1,sh.getLastRow()-1,10).getValues(),t={};
  for(var i=0;i<d.length;i++){var f=new Date(d[i][0]).toLocaleDateString('es-GT'),p=parseFloat(d[i][7]);if(!isNaN(p)){if(!t[f])t[f]={s:0,c:0};t[f].s+=p;t[f].c++}}
  var r=[];for(var f in t){r.push({fecha:f,promedio:(t[f].s/t[f].c).toFixed(2),votos:t[f].c})}return r;
}

/* Setup */
function setupPasswordColumns(){
  var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Usuarios');
  if(!sh){Logger.log('No sheet');return}
  var hs=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var ns=hs.map(function(h){return String(h).toLowerCase().trim()});
  var nx=hs.length+1;
  if(ns.indexOf('passwordhash')===-1){sh.getRange(1,nx).setValue('PasswordHash').setFontWeight('bold');nx++}
  if(ns.indexOf('primeringreso')===-1){sh.getRange(1,nx).setValue('PrimerIngreso').setFontWeight('bold');for(var i=2;i<=sh.getLastRow();i++)sh.getRange(i,nx).setValue(true);nx++}
  if(ns.indexOf('sede')===-1&&ns.indexOf('ubicacion')===-1){sh.getRange(1,nx).setValue('Sede').setFontWeight('bold');nx++}
  if(ns.indexOf('foto')===-1&&ns.indexOf('fotourl')===-1){sh.getRange(1,nx).setValue('Foto').setFontWeight('bold');nx++}
  if(ns.indexOf('permisos')===-1){sh.getRange(1,nx).setValue('Permisos').setFontWeight('bold');nx++}
  if(!ss.getSheetByName('Sesiones')){var s=ss.insertSheet('Sesiones');s.appendRow(['Token','Usuario','Creado','Expira'])}
  if(!ss.getSheetByName('Votos')){var v=ss.insertSheet('Votos');v.appendRow(['Timestamp','EmailVotante','IdVotante','NombreVotante','IdEvaluado','NombreEvaluado','Parametro','Puntuacion','Sede','Comentario'])}
  Logger.log('Setup OK');
}