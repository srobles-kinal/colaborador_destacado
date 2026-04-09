/**
 * views/usuarios.js — empresa field, alphabetical sorting, search
 */
(function(){
  let _users=[],_editingEmail='';

  function popSelects(aId,sId){
    const areas=(DATA?.areas||ADM.ar||[]).slice().sort();
    const sedes=(DATA?.sedes||ADM.se||[]).slice().sort();
    const a=$(aId),s=$(sId);
    if(a&&a.tagName==='SELECT')a.innerHTML='<option value="">—</option>'+areas.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
    if(s&&s.tagName==='SELECT')s.innerHTML='<option value="">—</option>'+sedes.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
  }

  function renderTable(filter){
    const search=(filter||'').toLowerCase();
    // Sort alphabetically by nombre
    const sorted=_users.slice().sort(function(a,b){return(a.nombre||'').localeCompare(b.nombre||'')});
    const filtered=search?sorted.filter(u=>(u.email+u.nombre+u.area+u.sede+u.rol+(u.empresa||'')).toLowerCase().includes(search)):sorted;
    $('usrBody').innerHTML=filtered.map(u=>'<tr><td><span class="usr-status '+(u.activo?'active':'inactive')+'"></span>'+esc(u.email)+'</td><td>'+esc(u.nombre)+'</td><td><span class="ch ch-r" style="font-size:.65rem">'+esc(u.rol)+'</span></td><td>'+esc(u.area||'—')+'</td><td>'+esc(u.sede||'—')+'</td><td>'+esc(u.empresa||'—')+'</td><td style="display:flex;gap:3px;flex-wrap:wrap"><button class="btn bo" style="padding:3px 7px;font-size:.65rem" onclick="App.usr.edit(\''+esc(u.email)+'\')">✏️</button><button class="btn bo" style="padding:3px 7px;font-size:.65rem" onclick="App.usr.resetPwd(\''+esc(u.email)+'\')">🔑</button><button class="btn bd" style="padding:3px 7px;font-size:.65rem" onclick="App.usr.del(\''+esc(u.email)+'\')">🗑</button></td></tr>').join('');
    $('usrCount').textContent=filtered.length+' de '+_users.length;
  }

  App.usr={
    async load(){
      try{
        _users=await api.getUsuarios();
        renderTable();
      }catch(e){toast(e.message,'err')}
    },
    search(){renderTable($('usrSearch').value)},
    openNew(){
      $('nuEmail').value='';$('nuNombre').value='';$('nuRol').value='votante';$('nuPwd').value='';
      if($('nuFoto'))$('nuFoto').value='';if($('nuEmpresa'))$('nuEmpresa').value='';
      document.querySelectorAll('.nu-perm').forEach(c=>{c.checked=false});
      popSelects('nuArea','nuSede');$('nuOv').classList.add('open');
    },
    closeNew(){$('nuOv').classList.remove('open')},
    async saveNew(){
      const perms=Array.from(document.querySelectorAll('.nu-perm:checked')).map(c=>c.value).join(',');
      const d={email:$('nuEmail').value.trim(),nombre:$('nuNombre').value.trim(),rol:$('nuRol').value,
        area:$('nuArea').value,sede:$('nuSede').value,password:$('nuPwd').value,permisos:perms,
        foto:$('nuFoto')?$('nuFoto').value.trim():'',
        empresa:$('nuEmpresa')?$('nuEmpresa').value:''};
      if(!d.email||!d.nombre){toast('Email y nombre requeridos','err');return}
      try{const r=await api.crearUsuario(d);if(r.success){toast('Creado','ok');this.closeNew();this.load()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}
    },
    edit(email){
      const u=_users.find(x=>x.email===email);if(!u)return;
      _editingEmail=email;
      $('edEmail').textContent=email;$('edNombre').value=u.nombre||'';$('edRol').value=u.rol||'votante';
      $('edActivo').value=u.activo?'true':'false';
      if($('edFoto'))$('edFoto').value=u.foto||'';
      if($('edEmpresa'))$('edEmpresa').value=u.empresa||'';
      popSelects('edArea','edSede');
      setTimeout(()=>{$('edArea').value=u.area||'';$('edSede').value=u.sede||''},50);
      const cp=(u.permisos||'').split(',').map(p=>p.trim());
      document.querySelectorAll('.ed-perm').forEach(cb=>{cb.checked=cp.indexOf(cb.value)>=0});
      $('edOv').classList.add('open');
    },
    closeEdit(){$('edOv').classList.remove('open')},
    async saveEdit(){
      const perms=Array.from(document.querySelectorAll('.ed-perm:checked')).map(c=>c.value).join(',');
      const d={email:_editingEmail,nombre:$('edNombre').value.trim(),rol:$('edRol').value,
        area:$('edArea').value,sede:$('edSede').value,activo:$('edActivo').value==='true',permisos:perms,
        foto:$('edFoto')?$('edFoto').value.trim():undefined,
        empresa:$('edEmpresa')?$('edEmpresa').value:undefined};
      try{const r=await api.editarUsuario(d);if(r.success){toast('Actualizado','ok');this.closeEdit();this.load()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}
    },
    async resetPwd(email){if(!confirm('¿Reiniciar contraseña de '+email+'?'))return;try{const r=await api.resetPassword(email);if(r.success){toast('Reiniciada','ok');alert('Contraseña temporal: '+(r.tempPassword||'Muni2025'))}else toast(r.message,'err')}catch(e){toast(e.message,'err')}},
    del(email){if(!confirm('¿Eliminar '+email+'?'))return;api.eliminarUsuario(email).then(r=>{if(r.success){toast('Eliminado','ok');this.load()}else toast(r.message,'err')}).catch(e=>toast(e.message,'err'))}
  };
})();