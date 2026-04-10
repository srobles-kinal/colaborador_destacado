/**
 * views/config.js — Tabbed config, sync after every save
 */
App.cfg={
  async load(){
    try{
      const s=await api.getAdminStats();
      $('cfgSt').innerHTML='<div class="st sb"><div class="st-i">👥</div><div class="st-n">'+(s.totalColaboradores||0)+'</div><div class="st-l">Colaboradores</div></div><div class="st sl"><div class="st-i">📋</div><div class="st-n">'+(s.totalAreas||0)+'</div><div class="st-l">Áreas</div></div><div class="st sa"><div class="st-i">🏛️</div><div class="st-n">'+(s.empresas||[]).length+'</div><div class="st-l">Empresas</div></div>';
      ADM={p:s.parametros||[],ps:s.parametrosSupervisores||[],ar:s.areas||[],se:s.sedes||[],em:s.empresas||[]};
      this.lists.renderAll();this.loadParamsArea();this.loadPesos();
      const catSel=$('catAreaSel');
      if(catSel)catSel.innerHTML='<option value="">— Seleccionar área —</option>'+ADM.ar.slice().sort().map(a=>'<option value="'+esc(a)+'">'+esc(a)+'</option>').join('');
      ['nuEmpresa','edEmpresa'].forEach(function(id){
        var el=document.getElementById(id);
        if(el)el.innerHTML='<option value="">— Ninguna —</option>'+ADM.em.slice().sort().map(function(e){return'<option value="'+esc(e)+'">'+esc(e)+'</option>'}).join('');
      });
    }catch(e){toast(e.message,'err')}
  },

  // ── Tab switching ──
  tab(name){
    document.querySelectorAll('.cfg-tab').forEach(t=>t.classList.toggle('on',t.dataset.cfg===name));
    document.querySelectorAll('.cfg-pn').forEach(p=>p.classList.remove('on'));
    const pn=$('cfg-'+name);if(pn)pn.classList.add('on');
  },

  // ── Pesos ──
  async loadPesos(){try{const p=await api.getPesos();$('pesoDiaria').value=p.pesoDiaria||40;$('pesoEleccion').value=p.pesoEleccion||60}catch(e){}},
  async savePesos(){
    const d=parseInt($('pesoDiaria').value)||0,e=parseInt($('pesoEleccion').value)||0;
    if(d+e!==100){toast('Deben sumar 100','err');return}
    try{const r=await api.savePesos(d,e);if(r.success){toast('Pesos guardados','ok');syncData()}}catch(ex){toast(ex.message,'err')}
  },

  // ── Categorías Diarias ──
  async loadCatArea(){
    const area=$('catAreaSel').value,ct=$('catAreaCont');
    if(!area){ct.innerHTML='<div class="empty"><div class="empty-i">📂</div><div class="empty-t">Seleccioná un área arriba para configurar</div></div>';return}
    try{
      const data=await api.getCategoriasDiarias();
      const areaCats=(data.porArea||{})[area]||{};
      const defaultCats={"5's":[],"Lineamientos":[],"Generales":[]};
      const cats=Object.keys(areaCats).length>0?areaCats:defaultCats;
      ct.innerHTML='<div style="display:grid;gap:14px">'+Object.keys(cats).map(cat=>{
        const pregs=cats[cat]||[];const safeId='cq-'+cat.replace(/[^a-zA-Z0-9]/g,'_');
        return '<div style="padding:14px;border:1px solid var(--s2);border-radius:var(--r);background:var(--w)">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
          +'<strong style="font-size:.88rem;color:var(--b8)">'+esc(cat)+'</strong>'
          +'<span class="ch ch-r" style="font-size:.65rem">'+pregs.length+' preguntas</span></div>'
          +'<div id="'+safeId+'">'+pregs.map(p=>'<div class="adm-it"><input class="adm-in cq-in" data-cat="'+esc(cat)+'" value="'+esc(p)+'" placeholder="Escribí la pregunta..."><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button></div>').join('')+'</div>'
          +'<button class="btn ba" style="font-size:.72rem;padding:5px 12px;margin-top:8px" onclick="App.cfg.addQuestion(\''+safeId+'\',\''+esc(cat)+'\')">+ Agregar pregunta</button></div>';
      }).join('')+'</div>'
      +'<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">'
      +'<button class="btn bo" onclick="App.cfg.addCategory()">+ Nueva categoría</button>'
      +'<button class="btn bp" onclick="App.cfg.saveCatArea()">💾 Guardar todo</button></div>';
    }catch(e){ct.innerHTML='<div class="empty">'+e.message+'</div>'}
  },
  addQuestion(cId,cat){const ct=$(cId);if(!ct)return;const d=document.createElement('div');d.className='adm-it';d.innerHTML='<input class="adm-in cq-in" data-cat="'+esc(cat)+'" value="" placeholder="Escribí la pregunta..."><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button>';ct.appendChild(d);d.querySelector('input').focus()},
  addCategory(){const cat=prompt('Nombre de la categoría:');if(!cat||!cat.trim())return;const ct=$('catAreaCont');const safeId='cq-'+cat.replace(/[^a-zA-Z0-9]/g,'_');const div=document.createElement('div');div.style='padding:14px;border:1px solid var(--s2);border-radius:var(--r);background:var(--w)';div.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong style="font-size:.88rem;color:var(--b8)">'+esc(cat)+'</strong></div><div id="'+safeId+'"><div class="adm-it"><input class="adm-in cq-in" data-cat="'+esc(cat)+'" value="" placeholder="Primera pregunta..."><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button></div></div><button class="btn ba" style="font-size:.72rem;padding:5px 12px;margin-top:8px" onclick="App.cfg.addQuestion(\''+safeId+'\',\''+esc(cat)+'\')">+ Agregar pregunta</button>';const grid=ct.querySelector('div');if(grid)grid.appendChild(div)},
  async saveCatArea(){
    const area=$('catAreaSel').value;if(!area){toast('Seleccioná un área','err');return}
    const datos=[];document.querySelectorAll('.cq-in').forEach(inp=>{const cat=inp.dataset.cat,preg=inp.value.trim();if(cat&&preg)datos.push({categoria:cat,area:area,pregunta:preg})});
    if(!datos.length){toast('Agregá al menos una pregunta','err');return}
    try{const r=await api.saveCategoriasDiarias(area,datos);if(r.success){toast(datos.length+' preguntas guardadas para '+area,'ok');this.loadCatArea();syncData()}}catch(e){toast(e.message,'err')}
  },

  // ── Parámetros por Área ──
  async loadParamsArea(){
    const ct=$('paramsAreaCont');if(!ct)return;
    try{
      const pa=await api.getParametrosArea();const areas=ADM.ar||[];const gp=ADM.p||[];
      ct.innerHTML=areas.slice().sort().map(a=>{
        const ap=pa[a]||[];const has=ap.length>0;
        return '<div style="margin-bottom:14px;padding:14px;border:1px solid var(--s2);border-radius:var(--r);background:var(--w)">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
          +'<strong style="font-size:.88rem">'+esc(a)+'</strong>'
          +'<span class="ch '+(has?'ch-u':'ch-r')+'" style="font-size:.62rem">'+(has?ap.length+' propios':'Globales')+'</span></div>'
          +'<div id="pa-'+a.replace(/\s/g,'_')+'">'+(has?ap:gp).map(p=>'<div class="adm-it"><input class="adm-in pa-in" data-area="'+esc(a)+'" value="'+esc(p)+'"><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button></div>').join('')+'</div>'
          +'<div style="display:flex;gap:8px;margin-top:8px">'
          +'<button class="btn ba" style="font-size:.72rem;padding:5px 12px" onclick="App.cfg.addPA(\''+esc(a)+'\')">+ Agregar</button>'
          +'<button class="btn bp" style="font-size:.72rem;padding:5px 12px" onclick="App.cfg.savePA(\''+esc(a)+'\')">💾 Guardar</button>'
          +(has?'<button class="btn bo" style="font-size:.72rem;padding:5px 12px" onclick="App.cfg.resetPA(\''+esc(a)+'\')">↺ Usar globales</button>':'')
          +'</div></div>';
      }).join('')||'<div class="empty"><div class="empty-t">No hay áreas configuradas. Agregalas en la pestaña "Áreas, Sedes y Empresas".</div></div>';
    }catch(e){toast(e.message,'err')}
  },
  addPA(a){const ct=$('pa-'+a.replace(/\s/g,'_'));if(!ct)return;const d=document.createElement('div');d.className='adm-it';d.innerHTML='<input class="adm-in pa-in" data-area="'+esc(a)+'" value="" placeholder="Nuevo parámetro..."><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button>';ct.appendChild(d);d.querySelector('input').focus()},
  async savePA(a){const v=Array.from(document.querySelectorAll('.pa-in[data-area="'+a+'"]')).map(i=>i.value.trim()).filter(Boolean);try{const r=await api.saveParametrosArea(a,v);if(r.success){toast(a+': '+v.length+' parámetros','ok');this.loadParamsArea();syncData()}}catch(e){toast(e.message,'err')}},
  async resetPA(a){if(!confirm('¿Restaurar parámetros globales para '+a+'?'))return;try{const r=await api.saveParametrosArea(a,[]);if(r.success){toast('Restaurado','ok');this.loadParamsArea();syncData()}}catch(e){toast(e.message,'err')}},

  // ── Admin lists ──
  lists:{
    renderAll(){this._r('adP',ADM.p,'p');this._r('adPS',ADM.ps,'ps');this._r('adAR',ADM.ar,'ar');this._r('adSE',ADM.se,'se');this._r('adEM',ADM.em,'em')},
    _r(id,arr,k){var el=document.getElementById(id);if(!el)return;el.innerHTML=(arr||[]).slice().sort().map((v,i)=>'<div class="adm-it"><input class="adm-in ai-'+k+'" value="'+esc(v)+'" placeholder="Nuevo valor..."><button class="bd-sm" onclick="App.cfg.lists.rm(\''+k+'\','+i+')">🗑</button></div>').join('');if(!arr||!arr.length)el.innerHTML='<div style="padding:10px;color:var(--s4);font-size:.8rem">Sin elementos. Usá el botón + para agregar.</div>'},
    add(k){if(!ADM[k])ADM[k]=[];ADM[k].push('');this.renderAll();const inputs=document.querySelectorAll('.ai-'+k);if(inputs.length)inputs[inputs.length-1].focus()},
    rm(k,i){ADM[k].splice(i,1);this.renderAll()},
    _v(k){return Array.from(document.querySelectorAll('.ai-'+k)).map(e=>e.value.trim()).filter(Boolean)},
    async save(k){
      const map={p:'saveParametros',ps:'saveParametrosSup',ar:'saveAreas',se:'saveSedes',em:'saveEmpresas'};
      const names={p:'Parámetros',ps:'Parámetros Supervisores',ar:'Áreas',se:'Sedes',em:'Empresas'};
      var fn=map[k];if(!fn)return;
      const vals=this._v(k);
      try{await api[fn](vals);ADM[k]=vals;toast(names[k]+' guardado ('+vals.length+')','ok');syncData();this.renderAll()}catch(e){toast(e.message,'err')}
    }
  }
};
