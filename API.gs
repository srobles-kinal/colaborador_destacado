/**
 * API v9 — SOLID Refactor
 * S: Each function has ONE responsibility
 * O: Filtering strategy is extensible without modifying core
 * L: Repo functions are interchangeable (same interface)
 * I: Small, specific endpoints
 * D: Business logic depends on repo abstractions, not sheets directly
 */
var CFG={VERSION:'9.0',SESSION_H:8};

// ═══════════════════════════════════════
// UTILITIES (pure functions, no side effects)
// ═══════════════════════════════════════
function sha256_(t){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,t).map(function(b){return('0'+((b+256)%256).toString(16)).slice(-2)}).join('')}
function uuid_(){return Utilities.getUuid()}
function norm_(s){return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function jr_(d){return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON)}
function ok_(d){return jr_({status:'ok',data:d})}
function err_(m){return jr_({status:'error',message:m})}
function cv_(r,m,k,d){if(m[k]===undefined)return d;var v=r[m[k]];return(v===undefined||v===null||v==='')?d:v}
function isT_(v){return v===true||String(v).toUpperCase()==='TRUE'}
function dUrl_(u){if(!u)return'';var x=String(u).match(/\/d\/([a-zA-Z0-9-_]+)/);return x?'https://lh3.googleusercontent.com/d/'+x[1]:String(u)}

// ═══════════════════════════════════════
// COLUMN DETECTION (Single Responsibility)
// ═══════════════════════════════════════
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
    else if(/^(id|numero|no)$/.test(h))m.id=i;
    else if(/^(permisos|permissions)$/.test(h))m.permisos=i;
    else if(/^(evaluadores|evaluadores.?sup|asignados)/.test(h))m.evaluadores=i;
    else if(/^(empresa|company|entidad)$/.test(h))m.empresa=i;
  }
  _hc[n]=m;return m;
}

// ═══════════════════════════════════════
// PERMISSIONS (Single Responsibility)
// ═══════════════════════════════════════
var _basePerms={
  admin:['votar','dashboard','reportes','usuarios','elecciones','evaluadores','parametros','comentarios'],
  supervisor:['votar','dashboard','reportes'],
  evaluador:['votar'],
  votante:['votar'],
  evaluado:['votar']
};

function getPerms_(usr){
  var perms=(_basePerms[usr.rol]||['votar']).slice();
  usr.permisos.forEach(function(p){if(p&&perms.indexOf(p)===-1)perms.push(p)});
  return perms;
}

function hasPerm_(email,perm){
  var u=UserRepo.findByEmail(email);if(!u)return false;
  if(u.rol==='admin')return true;
  var rp=_basePerms[u.rol]||['votar'];
  if(rp.indexOf(perm)>=0)return true;
  return u.permisos.indexOf(perm)>=0;
}

function assertPerm_(token,perm){
  var s=SessionRepo.validate(token);
  if(!s)throw new Error('Sesión inválida');
  if(!hasPerm_(s.usuario,perm))throw new Error('No autorizado');
  return s;
}

// ═══════════════════════════════════════
// FILTERING STRATEGY (Open/Closed Principle)
// Each filter is a pure function: (allCols, usr) => filteredCols
// New roles can be added without modifying existing filters
// ═══════════════════════════════════════
var FilterStrategy={
  // Admin/Supervisor: see everyone
  all:function(allCols,usr){return allCols.slice()},

  // Evaluador: assigned areas/emails or own area
  evaluador:function(allCols,usr){
    var evList=usr.evaluadores?usr.evaluadores.split(',').map(function(x){return norm_(x)}).filter(Boolean):[];
    if(evList.length===0){
      var ua=norm_(usr.area);
      return ua?allCols.filter(function(c){return norm_(c.area)===ua}):[];
    }
    return allCols.filter(function(c){return evList.indexOf(norm_(c.email))>=0||evList.indexOf(norm_(c.area))>=0});
  },

  // Votante/Evaluado: by sede first, then area
  standard:function(allCols,usr){
    var usrSede=norm_(usr.sede);
    var usrArea=norm_(usr.area);
    // Priority 1: if has sede, filter by sede (handles mini munis and regular sedes)
    if(usrSede){
      return allCols.filter(function(c){return norm_(c.sede)===usrSede});
    }
    // Priority 2: if has area, filter by area
    if(usrArea){
      return allCols.filter(function(c){return norm_(c.area)===usrArea});
    }
    return[];
  },

  // For daily eval: supervisor sees ALL (no filter)
  daily:function(allCols,usr){return allCols.slice()},

  // Get the right filter for a user role (for election voting)
  forVoting:function(usr){
    if(usr.rol==='admin'||usr.rol==='supervisor')return this.all;
    if(usr.rol==='evaluador')return this.evaluador;
    return this.standard;
  },

  // Get filter for daily evaluation
  forDailyEval:function(usr){
    return this.daily; // Supervisors evaluate everyone daily
  },

  // Add supervisors to a filtered list (for non-admins to evaluate assigned supervisors)
  addSupervisors:function(cols,supervisores,usr){
    var colEmails={};
    cols.forEach(function(c){colEmails[norm_(c.email)]=true});
    var usrEmailN=norm_(usr.email);
    var usrAreaN=norm_(usr.area);
    supervisores.forEach(function(sup){
      if(colEmails[norm_(sup.colab.email)])return;
      if(sup.evaluadoresList.length===0){cols.push(sup.colab);return}
      var allowed=sup.evaluadoresList.some(function(e){return norm_(e)===usrEmailN||norm_(e)===usrAreaN});
      if(allowed)cols.push(sup.colab);
    });
    return cols;
  },

  // Exclude self
  excludeSelf:function(cols,email){
    var e=norm_(email);
    return cols.filter(function(c){return norm_(c.email)!==e});
  }
};

// ═══════════════════════════════════════
// REPOSITORIES (Dependency Inversion)
// Business logic calls repos, not sheets directly
// ═══════════════════════════════════════

// ── User Repository ──
var UserRepo={
  _cache:{},
  _allCache:null,

  findByEmail:function(email){
    var e=norm_(email);
    if(this._cache[e]!==undefined)return this._cache[e];
    // Read sheet once, cache ALL users
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName('Usuarios');
    if(!sh){this._cache[e]=null;return null}
    var m=hm_(sh),d=sh.getDataRange().getValues();
    if(m.email===undefined){this._cache[e]=null;return null}
    for(var i=1;i<d.length;i++){
      var rowEmail=norm_(d[i][m.email]);
      if(this._cache[rowEmail]!==undefined)continue;
      var permisos=m.permisos!==undefined?String(d[i][m.permisos]||''):'';
      this._cache[rowEmail]={
        ri:i,sh:sh,m:m,email:String(d[i][m.email]).trim(),
        nombre:String(cv_(d[i],m,'nombre','')),
        rol:norm_(cv_(d[i],m,'rol','votante')),
        area:String(cv_(d[i],m,'area','')).trim(),
        activo:m.activo!==undefined?isT_(d[i][m.activo]):true,
        pwd:String(cv_(d[i],m,'pwd','')),
        primer:m.primer!==undefined?isT_(d[i][m.primer]):false,
        sede:String(cv_(d[i],m,'sede','')).trim(),
        foto:dUrl_(cv_(d[i],m,'foto','')),
        permisos:permisos?permisos.split(',').map(function(p){return p.trim()}):[],
        evaluadores:m.evaluadores!==undefined?String(d[i][m.evaluadores]||''):'',empresa:String(cv_(d[i],m,'empresa',''))
      };
    }
    return this._cache[e]||null;
  },

  // Read ALL active users once — returns {allCols, uMap, supervisores}
  readAll:function(){
    if(this._allCache)return this._allCache;
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName('Usuarios');
    var allCols=[],uMap={},supervisores=[];
    if(sh&&sh.getLastRow()>1){
      var m=hm_(sh),d=sh.getDataRange().getValues();
      for(var i=1;i<d.length;i++){
        var r=d[i];
        var activo=m.activo!==undefined?isT_(r[m.activo]):true;
        if(!activo)continue;
        var em=m.email!==undefined?String(r[m.email]).trim():'';
        if(!em)continue;
        var emL=norm_(em);
        var rol=norm_(cv_(r,m,'rol','votante'));
        var evaluadores=m.evaluadores!==undefined?String(r[m.evaluadores]||''):'';
        var colab={id:em,nombre:String(cv_(r,m,'nombre','')),area:String(cv_(r,m,'area','')).trim(),fotoUrl:dUrl_(cv_(r,m,'foto','')),email:em,sede:String(cv_(r,m,'sede','')).trim(),empresa:String(cv_(r,m,'empresa',''))};
        allCols.push(colab);
        uMap[emL]={rol:rol,evaluadores:evaluadores};
        if(rol==='supervisor'||rol==='evaluador'){
          var evList=evaluadores?evaluadores.split(',').map(function(x){return norm_(x)}).filter(Boolean):[];
          supervisores.push({colab:colab,evaluadoresList:evList});
        }
      }
    }
    this._allCache={allCols:allCols,uMap:uMap,supervisores:supervisores};
    return this._allCache;
  },

  // CRUD operations
  getAll:function(token){
    assertPerm_(token,'usuarios');
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName('Usuarios');if(!sh)return[];
    var m=hm_(sh),d=sh.getDataRange().getValues(),out=[];
    for(var i=1;i<d.length;i++){
      var perms=m.permisos!==undefined?String(d[i][m.permisos]||''):'';
      out.push({email:cv_(d[i],m,'email',''),nombre:cv_(d[i],m,'nombre',''),rol:norm_(cv_(d[i],m,'rol','votante')),area:cv_(d[i],m,'area',''),activo:m.activo!==undefined?isT_(d[i][m.activo]):true,sede:cv_(d[i],m,'sede',''),foto:dUrl_(cv_(d[i],m,'foto','')),permisos:perms,empresa:cv_(d[i],m,'empresa','')});
    }
    return out;
  },

  create:function(b){
    var s=assertPerm_(b.token,'usuarios');
    if(!b.email||!b.nombre)throw new Error('Email y nombre requeridos');
    if(this.findByEmail(b.email))throw new Error('Ya existe');
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
    if(m.empresa!==undefined)row[m.empresa]=b.empresa||'';
    sh.appendRow(row);
    AuditRepo.log('USER_CREATE',s.usuario,{n:b.email});
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
    AuditRepo.log('USER_EDIT',s.usuario,{t:b.email});
    return{status:'ok',success:true};
  },

  remove:function(b){
    var s=assertPerm_(b.token,'usuarios');
    var u=this.findByEmail(b.email);if(!u)throw new Error('No encontrado');
    u.sh.deleteRow(u.ri+1);
    AuditRepo.log('USER_DEL',s.usuario,{t:b.email});
    return{status:'ok',success:true};
  },

  resetPassword:function(b){
    var s=assertPerm_(b.token,'usuarios');
    var u=this.findByEmail(b.email);if(!u)throw new Error('No encontrado');
    var defaultPwd='Muni2025';
    if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(sha256_(defaultPwd));
    if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(true);
    AuditRepo.log('PWD_RESET',s.usuario,{t:b.email});
    return{status:'ok',success:true,message:'Contraseña: '+defaultPwd,tempPassword:defaultPwd};
  }
};

// ── Session Repository ──
var SessionRepo={
  _sesCache:{},
  validate:function(tk){
    if(!tk)return null;
    if(this._sesCache[tk]!==undefined)return this._sesCache[tk];
    var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sesiones');
    if(!sh){this._sesCache[tk]=null;return null}
    var d=sh.getDataRange().getValues(),now=new Date();
    for(var i=1;i<d.length;i++){
      if(d[i][0]===tk){
        if(now>new Date(d[i][3])){sh.deleteRow(i+1);this._sesCache[tk]=null;return null}
        var r={usuario:d[i][1]};this._sesCache[tk]=r;return r;
      }
    }
    this._sesCache[tk]=null;return null;
  },
  create:function(email,token){
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName('Sesiones');
    if(!sh){sh=ss.insertSheet('Sesiones');sh.appendRow(['Token','Usuario','Creado','Expira'])}
    var n=new Date();
    sh.appendRow([token,email,n,new Date(n.getTime()+CFG.SESSION_H*3600000)]);
  }
};

// ── Election Repository ──
var ElectionRepo={
  _cache:null,
  getActive:function(){
    if(this._cache!==null)return this._cache===false?null:this._cache;
    var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Elecciones');
    if(!sh||sh.getLastRow()<=1){this._cache=false;return null}
    var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
    for(var i=0;i<d.length;i++){
      if(norm_(d[i][4])==='activa'){
        var r={id:String(d[i][0]),nombre:String(d[i][1]),inicio:d[i][2],fin:d[i][3],estado:'activa',row:i+2};
        this._cache=r;return r;
      }
    }
    this._cache=false;return null;
  },
  getAll:function(){
    var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Elecciones');
    if(!sh||sh.getLastRow()<=1)return[];
    var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues(),out=[];
    for(var i=0;i<d.length;i++){
      out.push({id:String(d[i][0]),nombre:String(d[i][1]),inicio:d[i][2]?new Date(d[i][2]).toISOString():'',fin:d[i][3]?new Date(d[i][3]).toISOString():'',estado:norm_(d[i][4]),creadoPor:String(d[i][5]),fecha:d[i][6]?new Date(d[i][6]).toISOString():''});
    }
    return out;
  },
  create:function(b){
    var s=assertPerm_(b.token,'elecciones');
    if(!b.nombre)throw new Error('Nombre requerido');
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName('Elecciones');
    if(!sh){sh=ss.insertSheet('Elecciones');sh.appendRow(['Id','Nombre','FechaInicio','FechaFin','Estado','CreadoPor','FechaCreacion'])}
    var id=uuid_().substring(0,8);
    sh.appendRow([id,b.nombre,b.fechaInicio||new Date(),b.fechaFin||'','borrador',s.usuario,new Date()]);
    AuditRepo.log('ELEC_CREATE',s.usuario,{id:id});
    return{status:'ok',success:true,id:id};
  },
  activate:function(b){
    var s=assertPerm_(b.token,'elecciones');
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName('Elecciones');if(!sh)throw new Error('No hay elecciones');
    var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
    for(var i=0;i<d.length;i++){if(norm_(d[i][4])==='activa')sh.getRange(i+2,5).setValue('cerrada')}
    for(var i=0;i<d.length;i++){if(String(d[i][0])===b.id){sh.getRange(i+2,5).setValue('activa');AuditRepo.log('ELEC_ACTIVATE',s.usuario,{id:b.id});return{status:'ok',success:true}}}
    throw new Error('No encontrada');
  },
  close:function(b){
    var s=assertPerm_(b.token,'elecciones');
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName('Elecciones');if(!sh)throw new Error('No hay elecciones');
    var d=sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
    for(var i=0;i<d.length;i++){if(String(d[i][0])===b.id){sh.getRange(i+2,5).setValue('cerrada');AuditRepo.log('ELEC_CLOSE',s.usuario,{id:b.id});return{status:'ok',success:true}}}
    throw new Error('No encontrada');
  }
};

// ── Vote Repository ──
var VoteRepo={
  read:function(ss,elecId){
    var sh=ss.getSheetByName('Votos');
    if(!sh||sh.getLastRow()<=1)return[];
    var d=sh.getRange(2,1,sh.getLastRow()-1,10).getValues(),o=[];
    for(var i=0;i<d.length;i++){
      var cId=String(d[i][3]),eId=String(d[i][4]);
      if(elecId&&cId!==elecId)continue;
      o.push({vt:String(d[i][1]),ei:eId,p:parseFloat(d[i][7]),conv:cId,fecha:new Date(d[i][0]).toLocaleDateString('es-GT')});
    }
    return o;
  },
  calcAverages:function(votos){
    var proms={};
    for(var i=0;i<votos.length;i++){
      var v=votos[i];
      if(v.ei&&!isNaN(v.p)&&v.p>0){
        if(!proms[v.ei])proms[v.ei]={s:0,c:0};
        proms[v.ei].s+=v.p;proms[v.ei].c++;
      }
    }
    var pf={};for(var k in proms){pf[k]=proms[k].c>0?proms[k].s/proms[k].c:0}
    return pf;
  }
};

// ── Config Repository ──
var ConfigRepo={
  getList:function(ss,name){
    var sh=ss.getSheetByName(name);
    if(!sh||sh.getLastRow()<=1)return[];
    return sh.getRange(2,1,sh.getLastRow()-1,1).getValues().map(function(r){return r[0]}).filter(Boolean);
  },
  saveList:function(b){
    var s=assertPerm_(b.token,'parametros');
    var map={saveParametros:{h:'Parametros',hd:'Parametro'},saveParametrosSupervisores:{h:'Parametros Supervisores',hd:'Parametro'},saveAreas:{h:'Areas',hd:'Area'},saveSedes:{h:'Sedes',hd:'Sede'}};
    var c=map[b.action];if(!c)throw new Error('?');
    var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName(c.h);
    if(!sh){sh=ss.insertSheet(c.h);sh.getRange(1,1).setValue(c.hd).setFontWeight('bold')}
    if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,1).clearContent();
    if(b.valores&&b.valores.length)sh.getRange(2,1,b.valores.length,1).setValues(b.valores.map(function(v){return[v]}));
    return{status:'ok',success:true};
  },
  getParamsArea:function(ss){
    var sh=ss.getSheetByName('ParametrosArea');
    if(!sh||sh.getLastRow()<=1)return{};
    var d=sh.getRange(2,1,sh.getLastRow()-1,2).getValues(),out={};
    for(var i=0;i<d.length;i++){var a=String(d[i][0]).trim(),p=String(d[i][1]).trim();if(a&&p){if(!out[a])out[a]=[];out[a].push(p)}}
    return out;
  },
  saveParamsArea:function(b){
    var s=assertPerm_(b.token,'parametros');
    if(!b.area)throw new Error('Área requerida');
    var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('ParametrosArea');
    if(!sh){sh=ss.insertSheet('ParametrosArea');sh.appendRow(['Area','Parametro'])}
    var d=sh.getDataRange().getValues();
    for(var i=d.length-1;i>=1;i--){if(norm_(d[i][0])===norm_(b.area))sh.deleteRow(i+1)}
    var params=b.parametros||[];
    for(var i=0;i<params.length;i++){sh.appendRow([b.area,params[i]])}
    AuditRepo.log('PARAMS_AREA',s.usuario,{area:b.area,count:params.length});
    return{status:'ok',success:true};
  },
  getPesos:function(){
    var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ConfigPesos');
    if(!sh)return{pesoDiaria:40,pesoEleccion:60};
    var d=sh.getDataRange().getValues(),cfg={pesoDiaria:40,pesoEleccion:60};
    for(var i=1;i<d.length;i++){
      var k=norm_(d[i][0]),v=parseFloat(d[i][1]);
      if(k==='pesodiaria'&&!isNaN(v))cfg.pesoDiaria=v;
      if(k==='pesoeleccion'&&!isNaN(v))cfg.pesoEleccion=v;
    }
    return cfg;
  },
  savePesos:function(b){
    var s=assertPerm_(b.token,'parametros');
    var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('ConfigPesos');
    if(!sh){sh=ss.insertSheet('ConfigPesos');sh.appendRow(['Clave','Valor'])}
    if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,2).clearContent();
    sh.appendRow(['PesoDiaria',b.pesoDiaria||40]);
    sh.appendRow(['PesoEleccion',b.pesoEleccion||60]);
    AuditRepo.log('PESOS_SAVE',s.usuario,{d:b.pesoDiaria,e:b.pesoEleccion});
    return{status:'ok',success:true};
  }
};

// ── Daily Eval Repository ──
var DailyEvalRepo={
  getCategories:function(){
    var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CategoriasDiarias');
    if(!sh||sh.getLastRow()<=1)return{categorias:[],porArea:{}};
    var d=sh.getRange(2,1,sh.getLastRow()-1,4).getValues();
    var cats={},porArea={};
    for(var i=0;i<d.length;i++){
      var cat=String(d[i][0]).trim(),area=String(d[i][1]).trim(),preg=String(d[i][2]).trim();
      if(!cat||!preg)continue;
      cats[cat]=true;
      var key=area||'_GLOBAL';
      if(!porArea[key])porArea[key]={};
      if(!porArea[key][cat])porArea[key][cat]=[];
      porArea[key][cat].push(preg);
    }
    return{categorias:Object.keys(cats),porArea:porArea};
  },
  saveCategories:function(b){
    var s=assertPerm_(b.token,'parametros');
    var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('CategoriasDiarias');
    if(!sh){sh=ss.insertSheet('CategoriasDiarias');sh.appendRow(['Categoria','Area','Pregunta','Orden'])}
    if(b.area){
      var d=sh.getDataRange().getValues();
      for(var i=d.length-1;i>=1;i--){if(norm_(d[i][1])===norm_(b.area))sh.deleteRow(i+1)}
    }else{
      if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,4).clearContent();
    }
    var datos=b.datos||[];
    for(var i=0;i<datos.length;i++){sh.appendRow([datos[i].categoria,datos[i].area||'',datos[i].pregunta,i+1])}
    AuditRepo.log('CAT_SAVE',s.usuario,{area:b.area||'ALL',count:datos.length});
    return{status:'ok',success:true};
  },
  getQuestions:function(area){
    var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CategoriasDiarias');
    if(!sh||sh.getLastRow()<=1)return{};
    var d=sh.getRange(2,1,sh.getLastRow()-1,4).getValues(),result={};
    for(var i=0;i<d.length;i++){
      var cat=String(d[i][0]).trim(),rowArea=String(d[i][1]).trim(),preg=String(d[i][2]).trim();
      if(!cat||!preg)continue;
      if(norm_(rowArea)===norm_(area)||rowArea===''||rowArea==='_GLOBAL'){
        if(!result[cat])result[cat]=[];
        result[cat].push(preg);
      }
    }
    return result;
  },
  save:function(b){
    var s=SessionRepo.validate(b.token);
    if(!s)return{status:'error',message:'Sesión inválida'};
    var usr=UserRepo.findByEmail(s.usuario);
    if(!usr||(usr.rol!=='supervisor'&&usr.rol!=='admin'))return{status:'error',message:'Solo supervisores'};
    var elec=ElectionRepo.getActive();
    var elecId=elec?elec.id:'SIN_ELECCION';
    var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('EvalDiaria');
    if(!sh){sh=ss.insertSheet('EvalDiaria');sh.appendRow(['Fecha','SupervisorEmail','ColaboradorEmail','EleccionId','Categoria','Pregunta','Nota','Comentario'])}
    var fecha=new Date(),comentario=b.comentario||'',rows=[];
    for(var i=0;i<b.calificaciones.length;i++){
      var c=b.calificaciones[i];
      rows.push([fecha,s.usuario,b.colaboradorEmail,elecId,c.categoria,c.pregunta,c.nota,comentario]);
    }
    if(rows.length>0)sh.getRange(sh.getLastRow()+1,1,rows.length,8).setValues(rows);
    AuditRepo.log('EVAL_DIARIA',s.usuario,{colab:b.colaboradorEmail,count:rows.length});
    return{status:'ok',success:true,message:'Evaluación diaria guardada'};
  },
  getToday:function(usr){
    var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('EvalDiaria');
    if(!sh||sh.getLastRow()<=1)return{evaluados:{},fecha:new Date().toLocaleDateString('es-GT')};
    var d=sh.getRange(2,1,sh.getLastRow()-1,8).getValues();
    var hoy=new Date().toLocaleDateString('es-GT'),evaluados={};
    for(var i=0;i<d.length;i++){
      var fecha=new Date(d[i][0]).toLocaleDateString('es-GT');
      if(fecha===hoy&&norm_(d[i][1])===norm_(usr.email)){
        var colEmail=String(d[i][2]);
        if(!evaluados[colEmail])evaluados[colEmail]=[];
        evaluados[colEmail].push({cat:String(d[i][4]),preg:String(d[i][5]),nota:parseFloat(d[i][6])});
      }
    }
    return{evaluados:evaluados,fecha:hoy};
  },
  calcAverages:function(ss,elecId){
    var sh=ss.getSheetByName('EvalDiaria');
    if(!sh||sh.getLastRow()<=1)return{};
    var d=sh.getRange(2,1,sh.getLastRow()-1,8).getValues(),proms={};
    for(var i=0;i<d.length;i++){
      if(elecId&&String(d[i][3])!==elecId)continue;
      var colEmail=norm_(d[i][2]),nota=parseFloat(d[i][6]);
      if(!isNaN(nota)&&nota>0){
        if(!proms[colEmail])proms[colEmail]={s:0,c:0};
        proms[colEmail].s+=nota;proms[colEmail].c++;
      }
    }
    var pf={};for(var k in proms){pf[k]=proms[k].c>0?proms[k].s/proms[k].c:0}
    return pf;
  }
};

// ── Audit Repository ──
var AuditRepo={
  log:function(action,user,details){
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var sh=ss.getSheetByName('Auditoria');
    if(!sh){sh=ss.insertSheet('Auditoria');sh.appendRow(['Timestamp','Usuario','Accion','Detalles'])}
    sh.appendRow([new Date(),user,action,JSON.stringify(details||{})]);
  }
};

// ═══════════════════════════════════════
// ROUTER (Single Responsibility: only routing)
// ═══════════════════════════════════════
function doGet(){return jr_({status:'ok',v:CFG.VERSION})}

function doPost(e){
  var b;
  try{b=JSON.parse(e.postData.contents)}catch(x){return err_('JSON inválido')}
  var a=b.action||'';
  try{
    switch(a){
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
      case 'saveParametros':case 'saveParametrosSupervisores':case 'saveAreas':case 'saveSedes':return jr_(ConfigRepo.saveList(b));
      case 'saveParametrosArea':return jr_(ConfigRepo.saveParamsArea(b));
      case 'getParametrosArea':return wA_(b,function(){return ConfigRepo.getParamsArea(SpreadsheetApp.getActiveSpreadsheet())});
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
      case 'exportReport':return wA_(b,DataService.exportReport);
      case 'getComentarios':return wA_(b,DataService.getComentarios);
      default:return err_('Acción: '+a);
    }
  }catch(x){return err_(x.toString())}
}

function wA_(b,fn){var s=SessionRepo.validate(b.token);if(!s)return err_('Sesión inválida');return ok_(fn(s,b))}

// ═══════════════════════════════════════
// SERVICES (Business Logic — depends on repos)
// ═══════════════════════════════════════

var AuthService={
  login:function(b){
    if(!b.usuario||!b.password)return{status:'error',message:'Credenciales requeridas'};
    var u=UserRepo.findByEmail(b.usuario);
    if(!u)return{status:'error',message:'Usuario no encontrado'};
    if(!u.activo)return{status:'error',message:'Usuario deshabilitado'};
    var h=sha256_(b.password),primer=u.primer;
    if(!u.pwd||u.pwd===''||u.pwd==='undefined'){
      if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(h);
      if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(true);
      primer=true;
    }else if(u.pwd!==h){
      AuditRepo.log('LOGIN_FAIL',b.usuario,{});
      return{status:'error',message:'Contraseña incorrecta'};
    }
    var tk=uuid_();
    SessionRepo.create(u.email,tk);
    if(u.m.acceso!==undefined)u.sh.getRange(u.ri+1,u.m.acceso+1).setValue(new Date());
    AuditRepo.log('LOGIN',u.email,{});
    return{status:'ok',success:true,token:tk,usuario:{
      email:u.email,nombre:u.nombre,rol:u.rol,area:u.area,sede:u.sede,foto:u.foto,primerIngreso:primer,permisos:getPerms_(u)
    }};
  },
  changePwd:function(b){
    if(!b.nuevaPassword||b.nuevaPassword.length<6)return{status:'error',message:'Mínimo 6 caracteres'};
    var s=SessionRepo.validate(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
    var u=UserRepo.findByEmail(s.usuario);if(!u)return{status:'error',message:'No encontrado'};
    if(u.m.pwd!==undefined)u.sh.getRange(u.ri+1,u.m.pwd+1).setValue(sha256_(b.nuevaPassword));
    if(u.m.primer!==undefined)u.sh.getRange(u.ri+1,u.m.primer+1).setValue(false);
    AuditRepo.log('PWD_CHANGE',s.usuario,{});
    return{status:'ok',success:true};
  }
};

var DataService={
  getAll:function(ses){
    var usr=UserRepo.findByEmail(ses.usuario);
    if(!usr)throw new Error('User not found');
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var data=UserRepo.readAll();
    var conv=ElectionRepo.getActive();

    // Apply filter strategy based on role
    var filterFn=FilterStrategy.forVoting(usr);
    var cols=filterFn(data.allCols,usr);

    // Add supervisors for non-admin
    if(usr.rol!=='admin'&&usr.rol!=='supervisor'){
      cols=FilterStrategy.addSupervisors(cols,data.supervisores,usr);
    }
    cols=FilterStrategy.excludeSelf(cols,usr.email);

    var params=ConfigRepo.getList(ss,'Parametros');
    var pSup=ConfigRepo.getList(ss,'Parametros Supervisores');
    var areas=ConfigRepo.getList(ss,'Areas');
    var sedes=ConfigRepo.getList(ss,'Sedes');
    var areaParams=ConfigRepo.getParamsArea(ss);

    var votos=VoteRepo.read(ss,conv?conv.id:null);
    var pf=VoteRepo.calcAverages(votos);

    var evU={};
    for(var i=0;i<votos.length;i++){evU[votos[i].vt+'|'+votos[i].ei]=true}

    var cids={};for(var j=0;j<cols.length;j++)cids[String(cols[j].id)]=true;
    var nv={};for(var i=0;i<votos.length;i++){if(cids[votos[i].ei])nv[votos[i].vt]=true}

    var topArea={},topSede={};
    for(var j=0;j<cols.length;j++){
      var c=cols[j],pm=pf[String(c.id)];
      if(pm&&pm>0){
        if(!topArea[c.area]||pm>topArea[c.area].prom)topArea[c.area]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,area:c.area};
        if(c.sede&&(!topSede[c.sede]||pm>topSede[c.sede].prom))topSede[c.sede]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,sede:c.sede};
      }
    }

    return{
      usuario:{email:usr.email,nombre:usr.nombre,rol:usr.rol,area:usr.area,sede:usr.sede,foto:usr.foto,permisos:getPerms_(usr)},
      colaboradores:cols,miPromedio:pf[usr.email]||0,
      parametros:params.length?params:['Calidad de Trabajo'],
      parametrosArea:areaParams,
      parametrosSupervisores:pSup.length?pSup:['Liderazgo'],
      areas:areas,sedes:sedes,evaluacionesUnicas:evU,promedios:pf,
      topPorArea:topArea,topPorSede:topSede,
      eleccionActiva:conv?{id:conv.id,nombre:conv.nombre}:null,
      analytics:{totalColaboradores:cols.length,votantesUnicos:Object.keys(nv).length,
        tasaParticipacion:cols.length>0?((Object.keys(nv).length/cols.length)*100).toFixed(1):'0'}
    };
  },

  getDashboard:function(ses){
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var data=UserRepo.readAll();
    var conv=ElectionRepo.getActive();
    var votos=VoteRepo.read(ss,conv?conv.id:null);
    var pf=VoteRepo.calcAverages(votos);
    var topA={},topS={};
    data.allCols.forEach(function(c){
      var pm=pf[c.email]||pf[c.id];
      if(pm&&pm>0){
        if(!topA[c.area]||pm>topA[c.area].prom)topA[c.area]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,area:c.area};
        if(c.sede&&(!topS[c.sede]||pm>topS[c.sede].prom))topS[c.sede]={nombre:c.nombre,foto:c.fotoUrl,prom:pm,sede:c.sede};
      }
    });
    var vs={},es={};
    votos.forEach(function(v){vs[v.vt]=true;es[v.ei]=true});
    // Tendencias: count unique evaluados per day (not question rows)
    var tend={};
    votos.forEach(function(v){
      if(!isNaN(v.p)){
        var f=v.fecha||new Date().toLocaleDateString('es-GT');
        if(!tend[f])tend[f]={s:0,c:0,evaluados:{}};
        tend[f].s+=v.p;tend[f].c++;
        tend[f].evaluados[v.ei]=true;
      }
    });
    var tendArr=[];for(var f in tend){tendArr.push({fecha:f,promedio:(tend[f].s/tend[f].c).toFixed(2),votos:Object.keys(tend[f].evaluados).length})}
    return{
      analytics:{totalColaboradores:data.allCols.length,votantesUnicos:Object.keys(vs).length,evaluadosUnicos:Object.keys(es).length,promedios:pf,
        tasaParticipacion:data.allCols.length>0?((Object.keys(vs).length/data.allCols.length)*100).toFixed(1):'0'},
      topPorArea:topA,topPorSede:topS,tendencias:tendArr,
      eleccion:conv?{id:conv.id,nombre:conv.nombre}:null
    };
  },

  getCombined:function(ses){
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var data=UserRepo.readAll();
    var conv=ElectionRepo.getActive();
    var elecId=conv?conv.id:null;
    var pesos=ConfigRepo.getPesos();
    var pD=pesos.pesoDiaria/100,pE=pesos.pesoEleccion/100;
    var pfElec=VoteRepo.calcAverages(VoteRepo.read(ss,elecId));
    var pfDiaria=DailyEvalRepo.calcAverages(ss,elecId);
    var resultados=[];
    data.allCols.forEach(function(c){
      var email=norm_(c.email);
      var avgElec=pfElec[email]||pfElec[c.id]||0;
      var avgDiaria=pfDiaria[email]||0;
      var final_score=0;
      if(avgElec>0&&avgDiaria>0)final_score=(avgDiaria*pD)+(avgElec*pE);
      else if(avgElec>0)final_score=avgElec;
      else if(avgDiaria>0)final_score=avgDiaria;
      resultados.push({email:c.email,nombre:c.nombre,area:c.area,sede:c.sede,foto:c.fotoUrl,promEleccion:avgElec,promDiaria:avgDiaria,puntajeFinal:final_score});
    });
    resultados.sort(function(a,b){return b.puntajeFinal-a.puntajeFinal});
    var topArea={};
    resultados.forEach(function(r){if(r.puntajeFinal>0&&(!topArea[r.area]||r.puntajeFinal>topArea[r.area].puntajeFinal))topArea[r.area]=r});
    return{resultados:resultados,topPorArea:topArea,pesos:pesos,eleccion:conv?{id:conv.id,nombre:conv.nombre}:null};
  },

  getAdminStats:function(ses){
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var data=UserRepo.readAll();
    return{totalColaboradores:data.allCols.length,totalAreas:ConfigRepo.getList(ss,'Areas').length,
      parametros:ConfigRepo.getList(ss,'Parametros'),parametrosSupervisores:ConfigRepo.getList(ss,'Parametros Supervisores'),
      areas:ConfigRepo.getList(ss,'Areas'),sedes:ConfigRepo.getList(ss,'Sedes')};
  },

  exportReport:function(ses){
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var data=UserRepo.readAll();
    var conv=ElectionRepo.getActive();
    var votos=VoteRepo.read(ss,conv?conv.id:null);
    var pf=VoteRepo.calcAverages(votos);
    var ec={};votos.forEach(function(v){if(!ec[v.ei])ec[v.ei]={};ec[v.ei][v.vt]=true});
    var rows=[['Nombre','Email','Área','Sede','Promedio','Evaluaciones','Elección']];
    var convName=conv?conv.nombre:'Sin elección';
    data.allCols.sort(function(a,b){return(a.area||'').localeCompare(b.area||'')});
    data.allCols.forEach(function(c){rows.push([c.nombre,c.email,c.area,c.sede,pf[c.email]||'0',ec[c.email]?Object.keys(ec[c.email]).length:0,convName])});
    return{rows:rows};
  },

  getComentarios:function(ses){
    if(!hasPerm_(ses.usuario,'comentarios'))throw new Error('No autorizado');
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    // Build name map ONCE from readAll
    var data=UserRepo.readAll();
    var nameMap={};
    data.allCols.forEach(function(c){nameMap[norm_(c.email)]=c.nombre});
    var comentarios=[];
    // Comments from election votes
    var vSh=ss.getSheetByName('Votos');
    if(vSh&&vSh.getLastRow()>1){
      var vD=vSh.getRange(2,1,vSh.getLastRow()-1,10).getValues();
      var seen={};
      for(var i=0;i<vD.length;i++){
        var com=String(vD[i][9]||'').trim();
        if(!com)continue;
        var key='e|'+vD[i][1]+'|'+vD[i][4]+'|'+com;
        if(seen[key])continue;seen[key]=true;
        comentarios.push({tipo:'eleccion',fecha:new Date(vD[i][0]).toLocaleDateString('es-GT'),evaluador:String(vD[i][2]||vD[i][1]),colaborador:String(vD[i][5]||vD[i][4]),emailColab:String(vD[i][4]),comentario:com});
      }
    }
    // Comments from daily eval — use nameMap instead of findByEmail
    var dSh=ss.getSheetByName('EvalDiaria');
    if(dSh&&dSh.getLastRow()>1){
      var dD=dSh.getRange(2,1,dSh.getLastRow()-1,8).getValues();
      var seen2={};
      for(var i=0;i<dD.length;i++){
        var com=String(dD[i][7]||'').trim();
        if(!com)continue;
        var key='d|'+dD[i][1]+'|'+dD[i][2]+'|'+com;
        if(seen2[key])continue;seen2[key]=true;
        var supName=nameMap[norm_(dD[i][1])]||String(dD[i][1]);
        var colName=nameMap[norm_(dD[i][2])]||String(dD[i][2]);
        comentarios.push({tipo:'diaria',fecha:new Date(dD[i][0]).toLocaleDateString('es-GT'),evaluador:supName,colaborador:colName,emailColab:String(dD[i][2]),comentario:com});
      }
    }
    comentarios.sort(function(a,b){return b.fecha.localeCompare(a.fecha)});
    return comentarios;
  }
};

var VoteService={
  save:function(b){
    var s=SessionRepo.validate(b.token);if(!s)return{status:'error',message:'Sesión inválida'};
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var conv=ElectionRepo.getActive();
    if(!conv)return{status:'error',message:'No hay elección activa'};
    var vSh=ss.getSheetByName('Votos');
    if(!vSh){vSh=ss.insertSheet('Votos');vSh.appendRow(['Timestamp','EmailVotante','NombreVotante','EleccionId','IdEvaluado','NombreEvaluado','Parametro','Puntuacion','Sede','Comentario'])}
    var vD=vSh.getLastRow()>1?vSh.getRange(2,1,vSh.getLastRow()-1,10).getValues():[];
    for(var i=0;i<vD.length;i++){
      if(String(vD[i][1])===s.usuario&&String(vD[i][3])===conv.id&&String(vD[i][4])===String(b.evaluadoId))
        return{status:'ok',success:false,message:'Ya evaluaste a este colaborador'};
    }
    var usr=UserRepo.findByEmail(s.usuario),ts=new Date(),rows=[];
    for(var c=0;c<b.calificaciones.length;c++){rows.push([ts,s.usuario,usr?usr.nombre:s.usuario,conv.id,b.evaluadoId,b.evaluadoNombre,b.calificaciones[c].parametro,b.calificaciones[c].puntuacion,b.sede||'',b.comentario||''])}
    vSh.getRange(vSh.getLastRow()+1,1,rows.length,10).setValues(rows);
    AuditRepo.log('EVAL',s.usuario,{ei:b.evaluadoId});
    var all=vSh.getRange(2,1,vSh.getLastRow()-1,10).getValues(),sum=0,cnt=0;
    for(var i=0;i<all.length;i++){if(String(all[i][3])===conv.id&&String(all[i][4])===String(b.evaluadoId)){var p=parseFloat(all[i][7]);if(!isNaN(p)&&p>0){sum+=p;cnt++}}}
    return{status:'ok',success:true,message:'Evaluación guardada',evaluadoId:String(b.evaluadoId),nuevoPromedio:cnt>0?sum/cnt:0};
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
    var s=assertPerm_(b.token,'evaluadores');
    var sup=UserRepo.findByEmail(b.supervisorEmail);if(!sup)throw new Error('No encontrado');
    if(sup.m.evaluadores!==undefined)sup.sh.getRange(sup.ri+1,sup.m.evaluadores+1).setValue(b.evaluadores||'');
    AuditRepo.log('EVAL_ASSIGN',s.usuario,{sup:b.supervisorEmail});
    return{status:'ok',success:true};
  },
  getColabsByArea:function(ses,b){
    var data=UserRepo.readAll();
    var areas=(b.areas||[]).map(function(a){return norm_(a)});
    return data.allCols.filter(function(c){return areas.indexOf(norm_(c.area))>=0}).map(function(c){return{email:c.email,nombre:c.nombre,area:c.area,sede:c.sede}});
  }
};

var DailyEvalService={
  getCollaborators:function(ses,b){
    var usr=UserRepo.findByEmail(ses.usuario);
    if(!usr)throw new Error('No encontrado');
    if(usr.rol!=='supervisor'&&usr.rol!=='admin')throw new Error('Solo supervisores');
    var data=UserRepo.readAll();
    var cols=data.allCols.slice();
    cols=FilterStrategy.excludeSelf(cols,usr.email);
    // Optional sede filter from frontend
    if(b&&b.sede){
      var sedeN=norm_(b.sede);
      cols=cols.filter(function(c){return norm_(c.sede)===sedeN});
    }
    var grouped={};
    cols.forEach(function(c){var a=c.area||'Sin Área';if(!grouped[a])grouped[a]=[];grouped[a].push(c)});
    return grouped;
  },
  getToday:function(ses){
    var usr=UserRepo.findByEmail(ses.usuario);
    if(!usr)throw new Error('NF');
    return DailyEvalRepo.getToday(usr);
  }
};

// ═══════════════════════════════════════
// SETUP
// ═══════════════════════════════════════
function setupPasswordColumns(){
  var ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName('Usuarios');
  if(!sh){Logger.log('No sheet Usuarios');return}
  var hs=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var ns=hs.map(function(h){return norm_(h)});
  var nx=hs.length+1;
  if(ns.indexOf('passwordhash')===-1){sh.getRange(1,nx).setValue('PasswordHash').setFontWeight('bold');nx++}
  if(ns.indexOf('primeringreso')===-1){sh.getRange(1,nx).setValue('PrimerIngreso').setFontWeight('bold');for(var i=2;i<=sh.getLastRow();i++)sh.getRange(i,nx).setValue(true);nx++}
  if(ns.indexOf('sede')===-1&&ns.indexOf('ubicacion')===-1){sh.getRange(1,nx).setValue('Sede').setFontWeight('bold');nx++}
  if(ns.indexOf('foto')===-1&&ns.indexOf('fotourl')===-1){sh.getRange(1,nx).setValue('Foto').setFontWeight('bold');nx++}
  if(ns.indexOf('permisos')===-1){sh.getRange(1,nx).setValue('Permisos').setFontWeight('bold');nx++}
  if(ns.indexOf('empresa')===-1){sh.getRange(1,nx).setValue('Empresa').setFontWeight('bold');nx++}
  if(ns.indexOf('evaluadores')===-1){sh.getRange(1,nx).setValue('Evaluadores').setFontWeight('bold');nx++}
  if(!ss.getSheetByName('Sesiones')){ss.insertSheet('Sesiones').appendRow(['Token','Usuario','Creado','Expira'])}
  if(!ss.getSheetByName('Votos')){ss.insertSheet('Votos').appendRow(['Timestamp','EmailVotante','NombreVotante','EleccionId','IdEvaluado','NombreEvaluado','Parametro','Puntuacion','Sede','Comentario'])}
  if(!ss.getSheetByName('Elecciones')){ss.insertSheet('Elecciones').appendRow(['Id','Nombre','FechaInicio','FechaFin','Estado','CreadoPor','FechaCreacion'])}
  if(!ss.getSheetByName('ParametrosArea')){ss.insertSheet('ParametrosArea').appendRow(['Area','Parametro'])}
  if(!ss.getSheetByName('CategoriasDiarias')){ss.insertSheet('CategoriasDiarias').appendRow(['Categoria','Area','Pregunta','Orden'])}
  if(!ss.getSheetByName('EvalDiaria')){ss.insertSheet('EvalDiaria').appendRow(['Fecha','SupervisorEmail','ColaboradorEmail','EleccionId','Categoria','Pregunta','Nota','Comentario'])}
  if(!ss.getSheetByName('ConfigPesos')){var cp=ss.insertSheet('ConfigPesos');cp.appendRow(['Clave','Valor']);cp.appendRow(['PesoDiaria',40]);cp.appendRow(['PesoEleccion',60])}
  Logger.log('Setup v9 SOLID OK');
}

function cleanupSheets(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  ['Colaboradores','Convocatorias','Parametros Supervisores'].forEach(function(n){
    var sh=ss.getSheetByName(n);
    if(sh){try{ss.deleteSheet(sh);Logger.log('Deleted: '+n)}catch(e){Logger.log('Skip: '+n)}}
  });
  Logger.log('Cleanup done');
}