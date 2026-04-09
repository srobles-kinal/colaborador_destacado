/**
 * views/evaluadores.js — cached, no redundant API calls
 */
(function(){
  let _sups=[];

  App.evalAsign={
    async load(){
      const ct=$('supEvalCont');if(!ct)return;
      try{
        _sups=await api.getEvaluadoresSup();
        const areas=(DATA?.areas||ADM.ar||[]).slice().sort();
        if(!_sups.length){ct.innerHTML='<div class="empty"><div class="empty-t">No hay supervisores ni evaluadores</div></div>';return}
        ct.innerHTML=_sups.map(s=>{
          const cur=(s.evaluadores||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
          const safeId=s.email.replace(/[@.]/g,'_');
          return '<div style="margin-bottom:16px;padding:14px;border:1px solid var(--s2);border-radius:10px;background:var(--s0)">'
            +'<div style="font-weight:700;font-size:.85rem;margin-bottom:8px">'+esc(s.nombre)+' <span style="color:var(--s4);font-weight:400;font-size:.75rem">('+esc(s.email)+')</span></div>'
            +'<div class="fl" style="margin-bottom:4px">1. Áreas:</div>'
            +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">'+areas.map(a=>'<label style="font-size:.74rem;display:flex;align-items:center;gap:3px;cursor:pointer;background:var(--w);padding:4px 10px;border-radius:6px;border:1px solid var(--s2)"><input type="checkbox" class="sup-area-cb" data-sup="'+esc(s.email)+'" value="'+esc(a)+'"'+(cur.indexOf(a.toLowerCase())>=0?' checked':'')+'>'+esc(a)+'</label>').join('')+'</div>'
            +'<div class="fl" style="margin-bottom:4px">2. Colaboradores:</div>'
            +'<div id="sup-c-'+safeId+'" style="margin-bottom:8px"><div style="font-size:.75rem;color:var(--s4)">Presioná "Cargar"</div></div>'
            +'<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn bo" style="font-size:.72rem;padding:6px 12px" onclick="App.evalAsign.loadColabs(\''+esc(s.email)+'\')">🔄 Cargar</button><button class="btn bp" style="font-size:.72rem;padding:6px 12px" onclick="App.evalAsign.save(\''+esc(s.email)+'\')">💾 Guardar</button></div></div>';
        }).join('');
      }catch(e){ct.innerHTML='<div class="empty">'+e.message+'</div>'}
    },
    async loadColabs(supEmail){
      const safeId=supEmail.replace(/[@.]/g,'_');const ct=$('sup-c-'+safeId);if(!ct)return;
      const areas=[];document.querySelectorAll('.sup-area-cb[data-sup="'+supEmail+'"]').forEach(cb=>{if(cb.checked)areas.push(cb.value)});
      if(!areas.length){ct.innerHTML='<div style="font-size:.75rem;color:var(--s4)">Seleccioná al menos un área</div>';return}
      try{
        const colabs=await api.getColabsByArea(areas);
        // Use cached _sups instead of another API call
        const thisSup=_sups.find(s=>s.email===supEmail);
        const cur=(thisSup?thisSup.evaluadores||'':'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
        ct.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:6px"><label style="font-size:.74rem;display:flex;align-items:center;gap:3px;cursor:pointer;background:var(--b0);padding:4px 10px;border-radius:6px;border:1px solid var(--b8);font-weight:600"><input type="checkbox" onchange="App.evalAsign.togAll(\''+esc(supEmail)+'\',this.checked)"> Todos</label>'
          +colabs.map(c=>'<label style="font-size:.74rem;display:flex;align-items:center;gap:3px;cursor:pointer;background:var(--w);padding:4px 10px;border-radius:6px;border:1px solid var(--s2)"><input type="checkbox" class="sup-colab-cb" data-sup="'+esc(supEmail)+'" value="'+esc(c.email)+'"'+(cur.indexOf(c.email.toLowerCase())>=0?' checked':'')+'>'+esc(c.nombre)+'</label>').join('')+'</div>';
      }catch(e){ct.innerHTML='<div style="font-size:.75rem;color:var(--r5)">'+e.message+'</div>'}
    },
    togAll(sup,chk){document.querySelectorAll('.sup-colab-cb[data-sup="'+sup+'"]').forEach(cb=>{cb.checked=chk})},
    async save(supEmail){
      const colabs=[];document.querySelectorAll('.sup-colab-cb[data-sup="'+supEmail+'"]').forEach(cb=>{if(cb.checked)colabs.push(cb.value)});
      try{const r=await api.asignarEvaluadores(supEmail,colabs.join(','));if(r.success){toast('Asignados','ok');this.load()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}
    }
  };
})();