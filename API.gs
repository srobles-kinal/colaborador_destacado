/**
 * API v10 — Performance Optimized + Assignable Permissions
 * KEY: SheetCache reads each sheet MAX ONCE per HTTP request
 * All modules are assignable via permissions
 */
var CFG={VERSION:'10.0',SESSION_H:8};

// ═══ UTILITIES ═══
function sha256_(t){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,t).map(function(b){return('0'+((b+256)%256).toString(16)).slice(-2)}).join('')}
function uuid_(){return Utilities.getUuid()}
function norm_(s){return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function jr_(d){return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON)}
function ok_(d){return jr_({status:'ok',data:d})}
function err_(m){return jr_({status:'error',message:m})}
function cv_(r,m,k,d){if(m[k]===undefined)return d;var v=r[m[k]];return(v===undefined||v===null||v==='')?d:v}
function isT_(v){return v===true||String(v).toUpperCase()==='TRUE'}
function dUrl_(u){if(!u)return'';var x=String(u).match(/\/d\/([a-zA-Z0-9-_]+)/);return x?'https://lh3.googleusercontent.com/d/'+x[1]:String(u)}

// ═══ SHEET CACHE — reads each sheet MAX ONCE per request ═══
var _sc={};
function SC_(){
  if(!_sc.ss)_sc.ss=SpreadsheetApp.getActiveSpreadsheet();
  return _sc.ss;
}
function SR_(name){
  if(_sc[name]!==undefined)return _sc[name];
  var sh=SC_().getSheetByName(name);
  if(!sh||sh.getLastRow()<=1){_sc[name]={sh:sh,d:[],m:{}};return _sc[name]}
  var d=sh.getDataRange().getValues();
  _sc[name]={sh:sh,d:d,m:hm_(sh)};
  return _sc[name];
}

// ═══ COLUMN DETECTION ═══
var _hc={};
function hm_(sh){
  var n=sh.getName();if(_hc[n])return _hc[n];
  var hs=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0],m={};
  for(var i=0;i<hs.length;i++){
    var h=norm_(hs[i]);
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
    else if(/^(permisos|permissions)$/.test(h))m.permisos=i;
    else if(/^(evaluadores|evaluadores.?sup|asignados)/.test(h))m.evaluadores=i;
    else if(/^(empresa|company|entidad|dependencia)$/.test(h))m.empresa=i;
  }
  _hc[n]=m;return m;
}

// ═══ PERMISSIONS (all modules assignable) ═══
var _basePerms={
  admin:['votar','dashboard','reportes','usuarios','elecciones','evaluadores','parametros','comentarios'],
  supervisor:['votar','dashboard','reportes'],
  evaluador:['votar'],votante:['votar'],evaluado:['votar']
};
function getPerms_(usr){var p=(_basePerms[usr.rol]||['votar']).slice();usr.permisos.forEach(function(x){if(x&&p.indexOf(x)===-1)p.push(x)});return p}
function hasPerm_(email,perm){var u=UserRepo.findByEmail(email);if(!u)return false;if(u.rol==='admin')return true;var rp=_basePerms[u.rol]||['votar'];if(rp.indexOf(perm)>=0)return true;return u.permisos.indexOf(perm)>=0}
function assertPerm_(token,perm){var s=SessionRepo.validate(token);if(!s)throw new Error('Sesión inválida');if(!hasPerm_(s.usuario,perm))throw new Error('No autorizado');return s}

// ═══ FILTER STRATEGY ═══
var Filter={
  all:function(cols){return cols.slice()},
  bySede:function(cols,sede){var s=norm_(sede);return s?cols.filter(function(c){return norm_(c.sede)===s}):cols},
  byArea:function(cols,area){var a=norm_(area);return a?cols.filter(function(c){return norm_(c.area)===a}):cols},
  forVoting:function(cols,usr){
    if(usr.rol==='admin'||usr.rol==='supervisor')return cols.slice();
    if(usr.rol==='evaluador'){
      var ev=usr.evaluadores?usr.evaluadores.split(',').map(function(x){return norm_(x)}).filter(Boolean):[];
      if(!ev.length){var ua=norm_(usr.area);return ua?cols.filter(function(c){return norm_(c.area)===ua}):[]}
      return cols.filter(function(c){return ev.indexOf(norm_(c.email))>=0||ev.indexOf(norm_(c.area))>=0});
    }
    var us=norm_(usr.sede),ua=norm_(usr.area);
    if(us)return cols.filter(function(c){return norm_(c.sede)===us});
    if(ua)return cols.filter(function(c){return norm_(c.area)===ua});
    return[];
  },
  excludeSelf:function(cols,email){var e=norm_(email);return cols.filter(function(c){return norm_(c.email)!==e})},
  addSupervisors:function(cols,sups,usr){
    var ce={};cols.forEach(function(c){ce[norm_(c.email)]=true});
    var ue=norm_(usr.email),ua=norm_(usr.area);
    sups.forEach(function(s){
      if(ce[norm_(s.colab.email)])return;
      if(!s.evaluadoresList.length){cols.push(s.colab);return}
      if(s.evaluadoresList.some(function(e){return norm_(e)===ue||norm_(e)===ua}))cols.push(s.colab);
    });return cols;
  }
};

// ═══ REPOSITORIES ═══
var UserRepo={
  _cache:{},_allCache:null,
  findByEmail:function(email){
    var e=norm_(email);
    if(this._cache[e]!==undefined)return this._cache[e];
    var r=SR_('Usuarios'),m=r.m,d=r.d;
    if(m.email===undefined){this._cache[e]=null;return null}
    for(var i=1;i<d.length;i++){
      var re=norm_(d[i][m.email]);
      if(this._cache[re]!==undefined)continue;
      var permisos=m.permisos!==undefined?String(d[i][m.permisos]||''):'';
      this._cache[re]={ri:i,sh:r.sh,m:m,email:String(d[i][m.email]).trim(),
        nombre:String(cv_(d[i],m,'nombre','')),rol:norm_(cv_(d[i],m,'rol','votante')),
        area:String(cv_(d[i],m,'area','')).trim(),activo:m.activo!==undefined?isT_(d[i][m.activo]):true,
        pwd:String(cv_(d[i],m,'pwd','')),primer:m.primer!==undefined?isT_(d[i][m.primer]):false,
        sede:String(cv_(d[i],m,'sede','')).trim(),foto:dUrl_(cv_(d[i],m,'foto','')),
        permisos:permisos?permisos.split(',').map(function(p){return p.trim()}):[],
        evaluadores:m.evaluadores!==undefined?String(d[i][m.evaluadores]||''):'',
        empresa:String(cv_(d[i],m,'empresa',''))};
    }
    return this._cache[e]||null;
  },
  readAll:function(){
    if(this._allCache)return this._allCache;
    var r=SR_('Usuarios'),m=r.m,d=r.d;
    var allCols=[],uMap={},sups=[];
    for(var i=1;i<d.length;i++){
      var row=d[i];
      if(m.activo!==undefined&&!isT_(row[m.activo]))continue;
      var em=m.email!==undefined?String(row[m.email]).trim():'';if(!em)continue;
      var emL=norm_(em),rol=norm_(cv_(row,m,'rol','votante'));
      var evaluadores=m.evaluadores!==undefined?String(row[m.evaluadores]||''):'';
      var colab={id:em,nombre:String(cv_(row,m,'nombre','')),area:String(cv_(row,m,'area','')).trim(),
        fotoUrl:dUrl_(cv_(row,m,'foto','')),email:em,sede:String(cv_(row,m,'sede','')).trim(),
        empresa:String(cv_(row,m,'empresa',''))};
      allCols.push(colab);uMap[emL]={rol:rol,evaluadores:evaluadores};
      if(rol==='supervisor'||rol==='evaluador'){
        var evList=evaluadores?evaluadores.split(',').map(function(x){return norm_(x)}).filter(Boolean):[];
        sups.push({colab:colab,evaluadoresList:evList});
      }
    }
    this._allCache={allCols:allCols,uMap:uMap,supervisores:sups};return this._allCache;
  },
  getAll:function(token){
    assertPerm_(token,'usuarios');
    var r=SR_('Usuarios'),m=r.m,d=r.d,out=[];
    for(var i=1;i<d.length;i++){
      var perms=m.permisos!==undefined?String(d[i][m.permisos]||''):'';
      out.push({email:cv_(d[i],m,'email',''),nombre:cv_(d[i],m,'nombre',''),rol:norm_(cv_(d[i],m,'rol','votante')),
        area:cv_(d[i],m,'area',''),activo:m.activo!==undefined?isT_(d[i][m.activo]):true,
        sede:cv_(d[i],m,'sede',''),foto:dUrl_(cv_(d[i],m,'foto','')),permisos:perms,empresa:cv_(d[i],m,'empresa','')});
    }
    return out;
  },
  create:function(b){
    var s=assertPerm_(b.token,'usuarios');
    if(!b.email||!b.nombre)throw new Error('Email y nombre requeridos');
    if(this.findByEmail(b.email))throw new Error('Ya existe');
    var r=SR_('Usuarios'),m=r.m,hs=r.sh.getRange(1,1,1,r.sh.getLastColumn()).getValues()[0],row=[];
    for(var c=0;c<hs.length;c++)row.push('');
    if(m.email!==undefined)row[m.email]=b.email;if(m.nombre!==undefined)row[m.nombre]=b.nombre;
    if(m.rol!==undefined)row[m.rol]=b.rol||'votante';if(m.area!==undefined)row[m.area]=b.area||'';
    if(m.activo!==undefined)row[m.activo]=true;if(m.fcreacion!==undefined)row[m.fcreacion]=new Date();
    if(m.pwd!==undefined)row[m.pwd]=b.password?sha256_(b.password):'';
    if(m.primer!==undefined)row[m.primer]=true;if(m.sede!==undefined)row[m.sede]=b.sede||'';
    if(m.foto!==undefined)row[m.foto]=b.foto||'';if(m.permisos!==undefined)row[m.permisos]=b.permisos||'';
    if(m.empresa!==undefined)row[m.empresa]=b.empresa||'';
    r.sh.appendRow(row);AuditRepo.log('USER_CREATE',s.usuario,{n:b.email});
    return{status:'ok',success:true};
  },
  update:function(b){
    var s=assertPerm_(b.token,'usuarios');
    var u=this.findByEmail(b.email);if(!u)throw new Error('No encontrado');
    if(b.nombre!==undefined&&u.m.nombre!==undefined)u.sh.getRange(u.ri+1,u.m.nombre+1).setValue(b.nombre);
    if(b.rol!==undefined&&u.m.rol!==undefined)u.sh.getRange(u.ri+1,u.m.rol+1).setValue(b.rol);
    if(b.area!==undefined&&u.m.area!==undefined)u.sh.getRange(u.ri+1,u.m.area+1).setValue(b.area);
    if(b.sede!==undefined&&u.m.sede!==undefined)u.sh.getRange(u.ri+1,u.m.sede+1).setValue(b.sede);
    if(b.activo!==undefined&&u.m.activo!==undefined)u.sh.getRange(u.ri+1,u.m.activo+1).setValue(b.activo);
    if(b.foto!==undefined&&u.m.foto!==undefined)u.sh.getRange(u.ri+1,u.m.foto+1).setValue(b.foto);
    if(b.permisos!==undefined&&u.m.permisos!==undefined)u.sh.getRange(u.ri+1,u.m.permisos+1).setValue(b.permisos);
    if(b.empresa!==undefined&&u.m.empresa!==undefined)u.sh.getRange(u.ri+1,u.m.empresa+1).setValue(b.empresa);
    AuditRepo.log('USER_EDIT',s.usuario,{t:b.email});return{status:'ok',success:true};
  },
  remove:function(b){var s=assertPerm_(b.token,'usuarios');var u=this.findByEmail(b.email);if(!u)throw new Error('NF');u.sh.deleteRow(u.ri+1);AuditRepo.log('USER_DEL',s.usuario,{t:b.email});return{status:'ok',success:true}},
  resetPassword:function(b){
    var s=assertPerm_(b.token,'usuarios');var u=this.findByEmail(b.email);if(!u)throw new Error('NF');
    var pw='Muni2025';if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(sha256_(pw));
    if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(true);
    AuditRepo.log('PWD_RESET',s.usuario,{t:b.email});return{status:'ok',success:true,tempPassword:pw};
  }
};

var SessionRepo={
  _c:null,
  validate:function(tk){
    if(!tk)return null;if(this._c)return this._c;
    var r=SR_('Sesiones'),d=r.d,now=new Date();
    for(var i=1;i<d.length;i++){
      if(d[i][0]===tk){
        if(now>new Date(d[i][3])){r.sh.deleteRow(i+1);return null}
        this._c={usuario:d[i][1]};return this._c;
      }
    }
    return null;
  },
  create:function(email,token){
    var sh=SR_('Sesiones').sh;
    if(!sh){sh=SC_().insertSheet('Sesiones');sh.appendRow(['Token','Usuario','Creado','Expira'])}
    var n=new Date();sh.appendRow([token,email,n,new Date(n.getTime()+CFG.SESSION_H*3600000)]);
  }
};

var ElectionRepo={
  _c:null,
  getActive:function(){
    if(this._c!==null)return this._c===false?null:this._c;
    var r=SR_('Elecciones'),d=r.d;
    for(var i=1;i<d.length;i++){
      if(norm_(d[i][4])==='activa'){var o={id:String(d[i][0]),nombre:String(d[i][1]),estado:'activa',row:i+2};this._c=o;return o}
    }
    this._c=false;return null;
  },
  getAll:function(){
    var d=SR_('Elecciones').d,out=[];
    for(var i=1;i<d.length;i++){out.push({id:String(d[i][0]),nombre:String(d[i][1]),estado:norm_(d[i][4]),creadoPor:String(d[i][5])})}
    return out;
  },
  create:function(b){
    var s=assertPerm_(b.token,'elecciones');if(!b.nombre)throw new Error('Nombre requerido');
    var sh=SR_('Elecciones').sh;if(!sh){sh=SC_().insertSheet('Elecciones');sh.appendRow(['Id','Nombre','FechaInicio','FechaFin','Estado','CreadoPor','FechaCreacion'])}
    var id=uuid_().substring(0,8);sh.appendRow([id,b.nombre,new Date(),'','borrador',s.usuario,new Date()]);return{status:'ok',success:true,id:id};
  },
  activate:function(b){
    var s=assertPerm_(b.token,'elecciones');var r=SR_('Elecciones'),d=r.d;
    for(var i=1;i<d.length;i++){if(norm_(d[i][4])==='activa')r.sh.getRange(i+1,5).setValue('cerrada')}
    for(var i=1;i<d.length;i++){if(String(d[i][0])===b.id){r.sh.getRange(i+1,5).setValue('activa');return{status:'ok',success:true}}}
    throw new Error('No encontrada');
  },
  close:function(b){
    var s=assertPerm_(b.token,'elecciones');var r=SR_('Elecciones'),d=r.d;
    for(var i=1;i<d.length;i++){if(String(d[i][0])===b.id){r.sh.getRange(i+1,5).setValue('cerrada');return{status:'ok',success:true}}}
    throw new Error('No encontrada');
  }
};

var VoteRepo={
  read:function(elecId){
    var d=SR_('Votos').d,o=[];
    for(var i=1;i<d.length;i++){
      var cId=String(d[i][3]),eId=String(d[i][4]);
      if(elecId&&cId!==elecId)continue;
      o.push({vt:String(d[i][1]),ei:eId,p:parseFloat(d[i][7]),conv:cId,fecha:new Date(d[i][0]).toLocaleDateString('es-GT')});
    }
    return o;
  },
  calcAvg:function(votos){
    var pr={};for(var i=0;i<votos.length;i++){var v=votos[i];if(v.ei&&!isNaN(v.p)&&v.p>0){if(!pr[v.ei])pr[v.ei]={s:0,c:0};pr[v.ei].s+=v.p;pr[v.ei].c++}}
    var pf={};for(var k in pr){pf[k]=pr[k].s/pr[k].c}return pf;
  }
};

var ConfigRepo={
  getList:function(name){var d=SR_(name).d;var o=[];for(var i=1;i<d.length;i++){if(d[i][0])o.push(d[i][0])}return o},
  saveList:function(b){
    var s=assertPerm_(b.token,'parametros');
    var map={saveParametros:'Parametros',saveParametrosSupervisores:'Parametros Supervisores',saveAreas:'Areas',saveSedes:'Sedes',saveEmpresas:'Empresas'};
    var name=map[b.action];if(!name)throw new Error('?');
    var sh=SC_().getSheetByName(name);
    if(!sh){sh=SC_().insertSheet(name);sh.getRange(1,1).setValue(name).setFontWeight('bold')}
    if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,1).clearContent();
    if(b.valores&&b.valores.length)sh.getRange(2,1,b.valores.length,1).setValues(b.valores.map(function(v){return[v]}));
    return{status:'ok',success:true};
  },
  getParamsArea:function(){
    var d=SR_('ParametrosArea').d,out={};
    for(var i=1;i<d.length;i++){var a=String(d[i][0]).trim(),p=String(d[i][1]).trim();if(a&&p){if(!out[a])out[a]=[];out[a].push(p)}}
    return out;
  },
  saveParamsArea:function(b){
    var s=assertPerm_(b.token,'parametros');if(!b.area)throw new Error('Área requerida');
    var sh=SC_().getSheetByName('ParametrosArea');
    if(!sh){sh=SC_().insertSheet('ParametrosArea');sh.appendRow(['Area','Parametro'])}
    var d=sh.getDataRange().getValues();
    for(var i=d.length-1;i>=1;i--){if(norm_(d[i][0])===norm_(b.area))sh.deleteRow(i+1)}
    (b.parametros||[]).forEach(function(p){sh.appendRow([b.area,p])});
    return{status:'ok',success:true};
  },
  getPesos:function(){
    var d=SR_('ConfigPesos').d,cfg={pesoDiaria:40,pesoEleccion:60};
    for(var i=1;i<d.length;i++){var k=norm_(d[i][0]),v=parseFloat(d[i][1]);if(k==='pesodiaria'&&!isNaN(v))cfg.pesoDiaria=v;if(k==='pesoeleccion'&&!isNaN(v))cfg.pesoEleccion=v}
    return cfg;
  },
  savePesos:function(b){
    var s=assertPerm_(b.token,'parametros');
    var sh=SC_().getSheetByName('ConfigPesos');
    if(!sh){sh=SC_().insertSheet('ConfigPesos');sh.appendRow(['Clave','Valor'])}
    if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,2).clearContent();
    sh.appendRow(['PesoDiaria',b.pesoDiaria||40]);sh.appendRow(['PesoEleccion',b.pesoEleccion||60]);
    return{status:'ok',success:true};
  }
};

var DailyEvalRepo={
  getCategories:function(){
    var d=SR_('CategoriasDiarias').d,cats={},porArea={};
    for(var i=1;i<d.length;i++){var cat=String(d[i][0]).trim(),area=String(d[i][1]).trim(),preg=String(d[i][2]).trim();if(!cat||!preg)continue;cats[cat]=true;var key=area||'_GLOBAL';if(!porArea[key])porArea[key]={};if(!porArea[key][cat])porArea[key][cat]=[];porArea[key][cat].push(preg)}
    return{categorias:Object.keys(cats),porArea:porArea};
  },
  saveCategories:function(b){
    var s=assertPerm_(b.token,'parametros');
    var sh=SC_().getSheetByName('CategoriasDiarias');
    if(!sh){sh=SC_().insertSheet('CategoriasDiarias');sh.appendRow(['Categoria','Area','Pregunta','Orden'])}
    if(b.area){var d=sh.getDataRange().getValues();for(var i=d.length-1;i>=1;i--){if(norm_(d[i][1])===norm_(b.area))sh.deleteRow(i+1)}}
    else{if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,4).clearContent()}
    var datos=b.datos||[];for(var i=0;i<datos.length;i++){sh.appendRow([datos[i].categoria,datos[i].area||'',datos[i].pregunta,i+1])}
    return{status:'ok',success:true};
  },
  getQuestions:function(area){
    var d=SR_('CategoriasDiarias').d,result={};
    for(var i=1;i<d.length;i++){var cat=String(d[i][0]).trim(),ra=String(d[i][1]).trim(),preg=String(d[i][2]).trim();if(!cat||!preg)continue;if(norm_(ra)===norm_(area)||ra===''||ra==='_GLOBAL'){if(!result[cat])result[cat]=[];result[cat].push(preg)}}
    return result;
  },
  save:function(b){
    var s=SessionRepo.validate(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
    var usr=UserRepo.findByEmail(s.usuario);if(!usr||(usr.rol!=='supervisor'&&usr.rol!=='admin'))return{status:'error',message:'Solo supervisores'};
    var elec=ElectionRepo.getActive();var elecId=elec?elec.id:'SIN_ELECCION';
    var sh=SC_().getSheetByName('EvalDiaria');
    if(!sh){sh=SC_().insertSheet('EvalDiaria');sh.appendRow(['Fecha','SupervisorEmail','ColaboradorEmail','EleccionId','Categoria','Pregunta','Nota','Comentario'])}
    var fecha=new Date(),com=b.comentario||'',rows=[];
    for(var i=0;i<b.calificaciones.length;i++){var c=b.calificaciones[i];rows.push([fecha,s.usuario,b.colaboradorEmail,elecId,c.categoria,c.pregunta,c.nota,com])}
    if(rows.length>0)sh.getRange(sh.getLastRow()+1,1,rows.length,8).setValues(rows);
    return{status:'ok',success:true,message:'Evaluación guardada'};
  },
  getToday:function(usr){
    var d=SR_('EvalDiaria').d,hoy=new Date().toLocaleDateString('es-GT'),evaluados={};
    for(var i=1;i<d.length;i++){
      var fecha=new Date(d[i][0]).toLocaleDateString('es-GT');
      if(fecha===hoy&&norm_(d[i][1])===norm_(usr.email)){
        var colEmail=String(d[i][2]);if(!evaluados[colEmail])evaluados[colEmail]=[];
        evaluados[colEmail].push({cat:String(d[i][4]),preg:String(d[i][5]),nota:parseFloat(d[i][6])});
      }
    }
    return{evaluados:evaluados,fecha:hoy};
  },
  calcAvg:function(elecId){
    var d=SR_('EvalDiaria').d,pr={};
    for(var i=1;i<d.length;i++){
      if(elecId&&String(d[i][3])!==elecId)continue;
      var col=norm_(d[i][2]),nota=parseFloat(d[i][6]);
      if(!isNaN(nota)&&nota>0){if(!pr[col])pr[col]={s:0,c:0};pr[col].s+=nota;pr[col].c++}
    }
    var pf={};for(var k in pr){pf[k]=pr[k].s/pr[k].c}return pf;
  }
};

var AuditRepo={
  log:function(action,user,details){
    var sh=SC_().getSheetByName('Auditoria');
    if(!sh){sh=SC_().insertSheet('Auditoria');sh.appendRow(['Timestamp','Usuario','Accion','Detalles'])}
    sh.appendRow([new Date(),user,action,JSON.stringify(details||{})]);
  }
};

// ═══ ROUTER ═══
function doGet(){return jr_({status:'ok',v:CFG.VERSION})}
function doPost(e){
  var b;try{b=JSON.parse(e.postData.contents)}catch(x){return err_('JSON inválido')}
  try{
    switch(b.action||''){
      case 'login':return jr_(AuthService.login(b));
      case 'cambiarPassword':return jr_(AuthService.changePwd(b));
      case 'logout':return jr_({status:'ok',success:true});
      case 'getAllData':return wA_(b,DataService.getAll);
      case 'getDashboardData':return wA_(b,DataService.getDashboard);
      case 'getDashboardCombinado':return wA_(b,DataService.getCombined);
      case 'getAdminStats':return wA_(b,DataService.getAdminStats);
      case 'guardarVotos':return jr_(VoteService.save(b));
      case 'getUsuarios':return ok_(UserRepo.getAll(b.token));
      case 'crearUsuario':return jr_(UserRepo.create(b));
      case 'editarUsuario':return jr_(UserRepo.update(b));
      case 'eliminarUsuario':return jr_(UserRepo.remove(b));
      case 'resetPassword':return jr_(UserRepo.resetPassword(b));
      case 'saveParametros':case 'saveParametrosSupervisores':case 'saveAreas':case 'saveSedes':case 'saveEmpresas':return jr_(ConfigRepo.saveList(b));
      case 'saveParametrosArea':return jr_(ConfigRepo.saveParamsArea(b));
      case 'getParametrosArea':return wA_(b,function(){return ConfigRepo.getParamsArea()});
      case 'getPesos':return wA_(b,function(){return ConfigRepo.getPesos()});
      case 'savePesos':return jr_(ConfigRepo.savePesos(b));
      case 'getEvaluadoresSup':return wA_(b,EvaluatorService.getSupervisors);
      case 'asignarEvaluadores':return jr_(EvaluatorService.assign(b));
      case 'getColabsByArea':return wA_(b,EvaluatorService.getColabsByArea);
      case 'getElecciones':return wA_(b,function(){return ElectionRepo.getAll()});
      case 'crearEleccion':return jr_(ElectionRepo.create(b));
      case 'activarEleccion':return jr_(ElectionRepo.activate(b));
      case 'cerrarEleccion':return jr_(ElectionRepo.close(b));
      case 'getCategoriasDiarias':return wA_(b,function(){return DailyEvalRepo.getCategories()});
      case 'saveCategoriasDiarias':return jr_(DailyEvalRepo.saveCategories(b));
      case 'getPreguntasDiarias':return wA_(b,function(s,b2){return DailyEvalRepo.getQuestions(b2.area||'')});
      case 'guardarEvalDiaria':return jr_(DailyEvalRepo.save(b));
      case 'getEvalDiariaHoy':return wA_(b,DailyEvalService.getToday);
      case 'getColabsParaEvalDiaria':return wA_(b,DailyEvalService.getCollaborators);
      case 'getComentarios':return wA_(b,DataService.getComentarios);
      case 'getEmpresas':return wA_(b,function(){return ConfigRepo.getList('Empresas')});
      case 'exportReport':return wA_(b,DataService.exportReport);
      default:return err_('Acción: '+(b.action||''));
    }
  }catch(x){return err_(x.toString())}
}
function wA_(b,fn){var s=SessionRepo.validate(b.token);if(!s)return err_('Sesión inválida');return ok_(fn(s,b))}

// ═══ SERVICES ═══
var AuthService={
  login:function(b){
    if(!b.usuario||!b.password)return{status:'error',message:'Credenciales requeridas'};
    var u=UserRepo.findByEmail(b.usuario);if(!u)return{status:'error',message:'Usuario no encontrado'};
    if(!u.activo)return{status:'error',message:'Usuario deshabilitado'};
    var h=sha256_(b.password),primer=u.primer;
    if(!u.pwd||u.pwd===''||u.pwd==='undefined'){
      if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(h);
      if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(true);primer=true;
    }else if(u.pwd!==h){AuditRepo.log('LOGIN_FAIL',b.usuario,{});return{status:'error',message:'Contraseña incorrecta'}}
    var tk=uuid_();SessionRepo.create(u.email,tk);
    if(u.m.acceso!==undefined)u.sh.getRange(u.ri+1,u.m.acceso+1).setValue(new Date());
    return{status:'ok',success:true,token:tk,usuario:{email:u.email,nombre:u.nombre,rol:u.rol,area:u.area,sede:u.sede,foto:u.foto,empresa:u.empresa,primerIngreso:primer,permisos:getPerms_(u)}};
  },
  changePwd:function(b){
    if(!b.nuevaPassword||b.nuevaPassword.length<6)return{status:'error',message:'Mínimo 6 caracteres'};
    var s=SessionRepo.validate(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
    var u=UserRepo.findByEmail(s.usuario);if(!u)return{status:'error',message:'NF'};
    if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(sha256_(b.nuevaPassword));
    if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(false);
    return{status:'ok',success:true};
  }
};

var DataService={
  getAll:function(ses){
    var usr=UserRepo.findByEmail(ses.usuario);if(!usr)throw new Error('NF');
    var data=UserRepo.readAll();var conv=ElectionRepo.getActive();
    var cols=Filter.forVoting(data.allCols,usr);
    if(usr.rol!=='admin'&&usr.rol!=='supervisor')cols=Filter.addSupervisors(cols,data.supervisores,usr);
    cols=Filter.excludeSelf(cols,usr.email);
    var votos=VoteRepo.read(conv?conv.id:null);var pf=VoteRepo.calcAvg(votos);
    var evU={};for(var i=0;i<votos.length;i++){evU[votos[i].vt+'|'+votos[i].ei]=true}
    var nv={};var cids={};for(var j=0;j<cols.length;j++)cids[String(cols[j].id)]=true;
    for(var i=0;i<votos.length;i++){if(cids[votos[i].ei])nv[votos[i].vt]=true}
    var topA={},topS={};
    for(var j=0;j<cols.length;j++){var c=cols[j],pm=pf[String(c.id)];if(pm&&pm>0){if(!topA[c.area]||pm>topA[c.area].prom)topA[c.area]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,area:c.area};if(c.sede&&(!topS[c.sede]||pm>topS[c.sede].prom))topS[c.sede]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,sede:c.sede}}}
    return{usuario:{email:usr.email,nombre:usr.nombre,rol:usr.rol,area:usr.area,sede:usr.sede,foto:usr.foto,empresa:usr.empresa,permisos:getPerms_(usr)},
      colaboradores:cols,miPromedio:pf[usr.email]||0,
      parametros:ConfigRepo.getList('Parametros'),parametrosArea:ConfigRepo.getParamsArea(),
      parametrosSupervisores:ConfigRepo.getList('Parametros Supervisores'),
      areas:ConfigRepo.getList('Areas'),sedes:ConfigRepo.getList('Sedes'),
      evaluacionesUnicas:evU,promedios:pf,topPorArea:topA,topPorSede:topS,
      eleccionActiva:conv?{id:conv.id,nombre:conv.nombre}:null,
      analytics:{totalColaboradores:cols.length,votantesUnicos:Object.keys(nv).length,
        tasaParticipacion:cols.length>0?((Object.keys(nv).length/cols.length)*100).toFixed(1):'0'}};
  },
  getDashboard:function(ses){
    var data=UserRepo.readAll();var conv=ElectionRepo.getActive();
    var votos=VoteRepo.read(conv?conv.id:null);var pf=VoteRepo.calcAvg(votos);
    var topA={},topS={};
    data.allCols.forEach(function(c){var pm=pf[c.email]||pf[c.id];if(pm&&pm>0){if(!topA[c.area]||pm>topA[c.area].prom)topA[c.area]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,area:c.area};if(c.sede&&(!topS[c.sede]||pm>topS[c.sede].prom))topS[c.sede]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,sede:c.sede}}});
    var tend={};votos.forEach(function(v){if(!isNaN(v.p)){var f=v.fecha;if(!tend[f])tend[f]={s:0,c:0,ev:{}};tend[f].s+=v.p;tend[f].c++;tend[f].ev[v.ei]=true}});
    var tendArr=[];for(var f in tend){tendArr.push({fecha:f,promedio:(tend[f].s/tend[f].c).toFixed(2),votos:Object.keys(tend[f].ev).length})}
    return{analytics:{totalColaboradores:data.allCols.length,promedios:pf},topPorArea:topA,topPorSede:topS,tendencias:tendArr,eleccion:conv?{id:conv.id,nombre:conv.nombre}:null};
  },
  getCombined:function(ses){
    var data=UserRepo.readAll();var conv=ElectionRepo.getActive();var elecId=conv?conv.id:null;
    var pesos=ConfigRepo.getPesos();var pD=pesos.pesoDiaria/100,pE=pesos.pesoEleccion/100;
    var pfElec=VoteRepo.calcAvg(VoteRepo.read(elecId));var pfDiaria=DailyEvalRepo.calcAvg(elecId);
    var resultados=[];
    data.allCols.forEach(function(c){
      var email=norm_(c.email);var avgE=pfElec[email]||pfElec[c.id]||0;var avgD=pfDiaria[email]||0;
      var fs=0;if(avgE>0&&avgD>0)fs=(avgD*pD)+(avgE*pE);else if(avgE>0)fs=avgE;else if(avgD>0)fs=avgD;
      resultados.push({email:c.email,nombre:c.nombre,area:c.area,sede:c.sede,foto:c.fotoUrl,empresa:c.empresa,promEleccion:avgE,promDiaria:avgD,puntajeFinal:fs});
    });
    resultados.sort(function(a,b){return b.puntajeFinal-a.puntajeFinal});
    var topArea={};resultados.forEach(function(r){if(r.puntajeFinal>0&&(!topArea[r.area]||r.puntajeFinal>topArea[r.area].puntajeFinal))topArea[r.area]=r});
    return{resultados:resultados,topPorArea:topArea,pesos:pesos,eleccion:conv?{id:conv.id,nombre:conv.nombre}:null};
  },
  getAdminStats:function(ses){
    var data=UserRepo.readAll();
    return{totalColaboradores:data.allCols.length,totalAreas:ConfigRepo.getList('Areas').length,
      parametros:ConfigRepo.getList('Parametros'),parametrosSupervisores:ConfigRepo.getList('Parametros Supervisores'),
      areas:ConfigRepo.getList('Areas'),sedes:ConfigRepo.getList('Sedes'),empresas:ConfigRepo.getList('Empresas')};
  },
  getComentarios:function(ses){
    if(!hasPerm_(ses.usuario,'comentarios'))throw new Error('No autorizado');
    var nameMap={};UserRepo.readAll().allCols.forEach(function(c){
      nameMap[norm_(c.email)]={nombre:c.nombre,empresa:c.empresa};
    });
    var comentarios=[];
    var vD=SR_('Votos').d;
    var seen={};
    for(var i=1;i<vD.length;i++){
      var com=String(vD[i][9]||'').trim();if(!com)continue;
      var key='e|'+vD[i][1]+'|'+vD[i][4]+'|'+com;if(seen[key])continue;seen[key]=true;
      var ci=nameMap[norm_(vD[i][4])];
      comentarios.push({tipo:'eleccion',fecha:new Date(vD[i][0]).toLocaleDateString('es-GT'),evaluador:String(vD[i][2]||vD[i][1]),colaborador:String(vD[i][5]||vD[i][4]),emailColab:String(vD[i][4]),empresa:ci?ci.empresa:'',comentario:com});
    }
    var dD=SR_('EvalDiaria').d;var seen2={};
    for(var i=1;i<dD.length;i++){
      var com=String(dD[i][7]||'').trim();if(!com)continue;
      var key='d|'+dD[i][1]+'|'+dD[i][2]+'|'+com;if(seen2[key])continue;seen2[key]=true;
      var si=nameMap[norm_(dD[i][1])],ci=nameMap[norm_(dD[i][2])];
      comentarios.push({tipo:'diaria',fecha:new Date(dD[i][0]).toLocaleDateString('es-GT'),evaluador:si?si.nombre:String(dD[i][1]),colaborador:ci?ci.nombre:String(dD[i][2]),emailColab:String(dD[i][2]),empresa:ci?ci.empresa:'',comentario:com});
    }
    comentarios.sort(function(a,b){return b.fecha.localeCompare(a.fecha)});return comentarios;
  },
  exportReport:function(ses){
    var data=UserRepo.readAll();var conv=ElectionRepo.getActive();
    var votos=VoteRepo.read(conv?conv.id:null);var pf=VoteRepo.calcAvg(votos);
    var rows=[['Nombre','Email','Área','Sede','Empresa','Promedio','Elección']];
    var cn=conv?conv.nombre:'Sin elección';
    data.allCols.sort(function(a,b){return(a.nombre||'').localeCompare(b.nombre||'')});
    data.allCols.forEach(function(c){rows.push([c.nombre,c.email,c.area,c.sede,c.empresa,pf[c.email]||'0',cn])});
    return{rows:rows};
  }
};

var VoteService={
  save:function(b){
    var s=SessionRepo.validate(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
    var conv=ElectionRepo.getActive();if(!conv)return{status:'error',message:'No hay elección activa'};
    var vD=SR_('Votos').d;
    for(var i=1;i<vD.length;i++){if(String(vD[i][1])===s.usuario&&String(vD[i][3])===conv.id&&String(vD[i][4])===String(b.evaluadoId))return{status:'ok',success:false,message:'Ya evaluaste a este colaborador'}}
    var usr=UserRepo.findByEmail(s.usuario);
    var sh=SR_('Votos').sh;if(!sh){sh=SC_().insertSheet('Votos');sh.appendRow(['Timestamp','EmailVotante','NombreVotante','EleccionId','IdEvaluado','NombreEvaluado','Parametro','Puntuacion','Sede','Comentario'])}
    var ts=new Date(),rows=[];
    for(var c=0;c<b.calificaciones.length;c++){rows.push([ts,s.usuario,usr?usr.nombre:s.usuario,conv.id,b.evaluadoId,b.evaluadoNombre,b.calificaciones[c].parametro,b.calificaciones[c].puntuacion,b.sede||'',b.comentario||''])}
    sh.getRange(sh.getLastRow()+1,1,rows.length,10).setValues(rows);
    var all=sh.getRange(2,1,sh.getLastRow()-1,10).getValues(),sum=0,cnt=0;
    for(var i=0;i<all.length;i++){if(String(all[i][3])===conv.id&&String(all[i][4])===String(b.evaluadoId)){var p=parseFloat(all[i][7]);if(!isNaN(p)&&p>0){sum+=p;cnt++}}}
    return{status:'ok',success:true,message:'Evaluación guardada',nuevoPromedio:cnt>0?sum/cnt:0};
  }
};

var EvaluatorService={
  getSupervisors:function(ses){
    if(!hasPerm_(ses.usuario,'evaluadores'))throw new Error('No autorizado');
    var data=UserRepo.readAll();
    return data.supervisores.map(function(s){
      var u=data.uMap[norm_(s.colab.email)];
      return{email:s.colab.email,nombre:s.colab.nombre,evaluadores:u?u.evaluadores||'':''};
    });
  },
  assign:function(b){
    var s=assertPerm_(b.token,'evaluadores');var u=UserRepo.findByEmail(b.supervisorEmail);if(!u)throw new Error('NF');
    if(u.m.evaluadores!==undefined)u.sh.getRange(u.ri+1,u.m.evaluadores+1).setValue(b.evaluadores||'');
    return{status:'ok',success:true};
  },
  getColabsByArea:function(ses,b){
    var data=UserRepo.readAll();var areas=(b.areas||[]).map(function(a){return norm_(a)});
    return data.allCols.filter(function(c){return areas.indexOf(norm_(c.area))>=0}).map(function(c){return{email:c.email,nombre:c.nombre,area:c.area,sede:c.sede}});
  }
};

var DailyEvalService={
  getCollaborators:function(ses,b){
    var usr=UserRepo.findByEmail(ses.usuario);if(!usr)throw new Error('NF');
    if(usr.rol!=='supervisor'&&usr.rol!=='admin')throw new Error('Solo supervisores');
    var cols=UserRepo.readAll().allCols.slice();
    cols=Filter.excludeSelf(cols,usr.email);
    if(b&&b.sede){var sn=norm_(b.sede);cols=cols.filter(function(c){return norm_(c.sede)===sn})}
    var grouped={};cols.forEach(function(c){var a=c.area||'Sin Área';if(!grouped[a])grouped[a]=[];grouped[a].push(c)});
    return grouped;
  },
  getToday:function(ses){var usr=UserRepo.findByEmail(ses.usuario);if(!usr)throw new Error('NF');return DailyEvalRepo.getToday(usr)}
};

// ═══ SETUP ═══
function setupPasswordColumns(){
  var ss=SC_(),sh=ss.getSheetByName('Usuarios');if(!sh){Logger.log('No Usuarios');return}
  var hs=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];var ns=hs.map(function(h){return norm_(h)});var nx=hs.length+1;
  if(ns.indexOf('passwordhash')===-1){sh.getRange(1,nx).setValue('PasswordHash').setFontWeight('bold');nx++}
  if(ns.indexOf('primeringreso')===-1){sh.getRange(1,nx).setValue('PrimerIngreso').setFontWeight('bold');for(var i=2;i<=sh.getLastRow();i++)sh.getRange(i,nx).setValue(true);nx++}
  if(ns.indexOf('sede')===-1){sh.getRange(1,nx).setValue('Sede').setFontWeight('bold');nx++}
  if(ns.indexOf('foto')===-1){sh.getRange(1,nx).setValue('Foto').setFontWeight('bold');nx++}
  if(ns.indexOf('permisos')===-1){sh.getRange(1,nx).setValue('Permisos').setFontWeight('bold');nx++}
  if(ns.indexOf('evaluadores')===-1){sh.getRange(1,nx).setValue('Evaluadores').setFontWeight('bold');nx++}
  if(ns.indexOf('empresa')===-1){sh.getRange(1,nx).setValue('Empresa').setFontWeight('bold');nx++}
  ['Sesiones','Votos','Elecciones','ParametrosArea','CategoriasDiarias','EvalDiaria','ConfigPesos','Auditoria','Empresas'].forEach(function(n){
    if(!ss.getSheetByName(n)){var s=ss.insertSheet(n);
      if(n==='Sesiones')s.appendRow(['Token','Usuario','Creado','Expira']);
      if(n==='Votos')s.appendRow(['Timestamp','EmailVotante','NombreVotante','EleccionId','IdEvaluado','NombreEvaluado','Parametro','Puntuacion','Sede','Comentario']);
      if(n==='Elecciones')s.appendRow(['Id','Nombre','FechaInicio','FechaFin','Estado','CreadoPor','FechaCreacion']);
      if(n==='EvalDiaria')s.appendRow(['Fecha','SupervisorEmail','ColaboradorEmail','EleccionId','Categoria','Pregunta','Nota','Comentario']);
      if(n==='ConfigPesos'){s.appendRow(['Clave','Valor']);s.appendRow(['PesoDiaria',40]);s.appendRow(['PesoEleccion',60])}
    }
  });
  Logger.log('Setup v10 OK');
}
function cleanupSheets(){['Colaboradores','Convocatorias','Parametros Supervisores'].forEach(function(n){var sh=SC_().getSheetByName(n);if(sh)try{SC_().deleteSheet(sh)}catch(e){}})}
