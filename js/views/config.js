/**
 * views/config.js
 */
App.cfg={
  async load(){
    try{
      const s=await api.getAdminStats();
      $('cfgSt').innerHTML='<div class="st sb"><div class="st-i">👥</div><div class="st-n">'+(s.totalColaboradores||0)+'</div><div class="st-l">Colaboradores</div></div><div class="st sl"><div class="st-i">📋</div><div class="st-n">'+(s.totalAreas||0)+'</div><div class="st-l">Áreas</div></div>';
      ADM={p:s.parametros||[],ps:s.parametrosSupervisores||[],ar:s.areas||[],se:s.sedes||[]};
      this.lists.renderAll();this.loadParamsArea();this.loadPesos();
      const catSel=$('catAreaSel');
      if(catSel)catSel.innerHTML='<option value="">— Seleccionar área —</option>'+ADM.ar.map(a=>'<option value="'+esc(a)+'">'+esc(a)+'</option>').join('');
    }catch(e){toast(e.message,'err')}
  },
  async loadPesos(){try{const p=await api.getPesos();$('pesoDiaria').value=p.pesoDiaria||40;$('pesoEleccion').value=p.pesoEleccion||60}catch(e){}},
  async savePesos(){
    const d=parseInt($('pesoDiaria').value)||0,e=parseInt($('pesoEleccion').value)||0;
    if(d+e!==100){toast('Los pesos deben sumar 100','err');return}
    try{const r=await api.savePesos(d,e);if(r.success)toast('Pesos guardados','ok');else toast(r.message,'err')}catch(ex){toast(ex.message,'err')}
  },
  _catData:{},
  async loadCatArea(){
    const area=$('catAreaSel').value,ct=$('catAreaCont');
    if(!area){ct.innerHTML='<div class="empty"><div class="empty-t">Seleccioná un área</div></div>';return}
    try{
      const data=await api.getCategoriasDiarias();this._catData=data;
      const areaCats=(data.porArea||{})[area]||{};
      const defaultCats={"5's":[],"Lineamientos":[],"Generales":[]};
      const catsToRender=Object.keys(areaCats).length>0?areaCats:defaultCats;
      ct.innerHTML=Object.keys(catsToRender).map(cat=>{
        const pregs=catsToRender[cat]||[];const safeId='cq-'+cat.replace(/[^a-zA-Z0-9]/g,'_');
        return '<div style="margin-bottom:14px;padding:12px;border:1px solid var(--s2);border-radius:10px;background:var(--s0)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong style="font-size:.85rem">'+esc(cat)+'</strong><span style="font-size:.68rem;color:var(--s4)">'+pregs.length+' preguntas</span></div><div id="'+safeId+'">'+pregs.map(p=>'<div class="adm-it"><input class="adm-in cq-in" data-cat="'+esc(cat)+'" value="'+esc(p)+'"><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button></div>').join('')+'</div><button class="btn ba" style="font-size:.7rem;padding:4px 10px;margin-top:6px" onclick="App.cfg.addQuestion(\''+safeId+'\',\''+esc(cat)+'\')">+ Pregunta</button></div>';
      }).join('')+'<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn ba" onclick="App.cfg.addCategory()">+ Nueva categoría</button><button class="btn bp" onclick="App.cfg.saveCatArea()">💾 Guardar</button></div>';
    }catch(e){ct.innerHTML='<div class="empty">'+e.message+'</div>'}
  },
  addQuestion(cId,cat){const ct=$(cId);if(!ct)return;const d=document.createElement('div');d.className='adm-it';d.innerHTML='<input class="adm-in cq-in" data-cat="'+esc(cat)+'" value=""><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button>';ct.appendChild(d);d.querySelector('input').focus()},
  addCategory(){const cat=prompt('Nombre:');if(!cat)return;const ct=$('catAreaCont');const safeId='cq-'+cat.replace(/[^a-zA-Z0-9]/g,'_');const div=document.createElement('div');div.style='margin-bottom:14px;padding:12px;border:1px solid var(--s2);border-radius:10px;background:var(--s0)';div.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong style="font-size:.85rem">'+esc(cat)+'</strong></div><div id="'+safeId+'"><div class="adm-it"><input class="adm-in cq-in" data-cat="'+esc(cat)+'" value=""><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button></div></div><button class="btn ba" style="font-size:.7rem;padding:4px 10px;margin-top:6px" onclick="App.cfg.addQuestion(\''+safeId+'\',\''+esc(cat)+'\')">+ Pregunta</button>';const btns=ct.querySelector('div:last-child');ct.insertBefore(div,btns)},
  async saveCatArea(){
    const area=$('catAreaSel').value;if(!area){toast('Seleccioná un área','err');return}
    const datos=[];document.querySelectorAll('.cq-in').forEach(inp=>{const cat=inp.dataset.cat,preg=inp.value.trim();if(cat&&preg)datos.push({categoria:cat,area:area,pregunta:preg})});
    if(!datos.length){toast('Agregá al menos una pregunta','err');return}
    try{const r=await api.saveCategoriasDiarias(area,datos);if(r.success){toast(area+': '+datos.length+' preguntas guardadas','ok');this.loadCatArea()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}
  },
  async loadParamsArea(){
    const ct=$('paramsAreaCont');if(!ct)return;
    try{
      const pa=await api.getParametrosArea();const areas=ADM.ar||[];const gp=ADM.p||[];
      ct.innerHTML=areas.map(a=>{const ap=pa[a]||[];const has=ap.length>0;return '<div style="margin-bottom:12px;padding:12px;border:1px solid var(--s2);border-radius:10px;background:var(--s0)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong style="font-size:.85rem">'+esc(a)+'</strong><span style="font-size:.68rem;color:var(--s4)">'+(has?ap.length+' personalizados':'Globales')+'</span></div><div id="pa-'+a.replace(/\s/g,'_')+'">'+(has?ap:gp).map(p=>'<div class="adm-it"><input class="adm-in pa-in" data-area="'+esc(a)+'" value="'+esc(p)+'"><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button></div>').join('')+'</div><div style="display:flex;gap:6px;margin-top:6px"><button class="btn ba" style="font-size:.7rem;padding:4px 10px" onclick="App.cfg.addPA(\''+esc(a)+'\')">+</button><button class="btn bp" style="font-size:.7rem;padding:4px 10px" onclick="App.cfg.savePA(\''+esc(a)+'\')">💾</button><button class="btn bo" style="font-size:.7rem;padding:4px 10px" onclick="App.cfg.resetPA(\''+esc(a)+'\')">↺</button></div></div>'}).join('')||'<div class="empty"><div class="empty-t">No hay áreas</div></div>';
    }catch(e){toast(e.message,'err')}
  },
  addPA(a){const ct=$('pa-'+a.replace(/\s/g,'_'));if(!ct)return;const d=document.createElement('div');d.className='adm-it';d.innerHTML='<input class="adm-in pa-in" data-area="'+esc(a)+'" value=""><button class="bd-sm" onclick="this.parentElement.remove()">🗑</button>';ct.appendChild(d);d.querySelector('input').focus()},
  async savePA(a){const v=Array.from(document.querySelectorAll('.pa-in[data-area="'+a+'"]')).map(i=>i.value.trim()).filter(Boolean);try{const r=await api.saveParametrosArea(a,v);if(r.success)toast(a+' guardado','ok');else toast(r.message,'err')}catch(e){toast(e.message,'err')}},
  async resetPA(a){if(!confirm('¿Restaurar globales?'))return;try{const r=await api.saveParametrosArea(a,[]);if(r.success){toast('Restaurado','ok');this.loadParamsArea()}}catch(e){toast(e.message,'err')}},
  lists:{
    renderAll(){this._r('adP',ADM.p,'p');this._r('adPS',ADM.ps,'ps');this._r('adAR',ADM.ar,'ar');this._r('adSE',ADM.se,'se')},
    _r(id,arr,k){$(id).innerHTML=arr.map((v,i)=>'<div class="adm-it"><input class="adm-in ai-'+k+'" value="'+esc(v)+'"><button class="bd-sm" onclick="App.cfg.lists.rm(\''+k+'\','+i+')">🗑</button></div>').join('')},
    add(k){ADM[k].push('');this.renderAll();const inputs=document.querySelectorAll('.ai-'+k);if(inputs.length)inputs[inputs.length-1].focus()},
    rm(k,i){if(ADM[k].length<=1){toast('Mínimo 1','err');return}ADM[k].splice(i,1);this.renderAll()},
    _v(k){return Array.from(document.querySelectorAll('.ai-'+k)).map(e=>e.value.trim()).filter(Boolean)},
    async save(k){const map={p:'saveParametros',ps:'saveParametrosSup',ar:'saveAreas',se:'saveSedes'};try{await api[map[k]](this._v(k));ADM[k]=this._v(k);toast('Guardado','ok')}catch(e){toast(e.message,'err')}}
  }
};