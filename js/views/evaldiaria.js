/**
 * views/evaldiaria.js — Fix #1: sede filter for mini munis
 */
(function(){
  let _colabs={},_hoyData={},_currentColab=null,_ratings={};

  document.addEventListener('click',function(e){
    const btn=e.target.closest('.rb-b');
    if(!btn)return;const rr=btn.parentElement;
    if(!rr.dataset.dparam)return;
    e.preventDefault();
    const key=rr.dataset.dparam,val=parseInt(btn.dataset.v);
    if(!key||isNaN(val))return;
    _ratings[key]=val;
    rr.querySelectorAll('.rb-b').forEach(b=>{b.classList.toggle('on',parseInt(b.dataset.v)<=val)});
  });

  document.addEventListener('click',function(e){
    const btn=e.target.closest('[data-eval-email]');
    if(!btn)return;
    App.evalDia.openModal(btn.dataset.evalEmail,btn.dataset.evalArea);
  });

  App.evalDia={
    async load(){
      try{
        const grouped=await api.getColabsParaEvalDiaria('');
        const hoy=await api.getEvalDiariaHoy();
        _colabs=grouped;_hoyData=hoy;
        // Populate area selector
        const sel=$('edAreaSel');
        const areas=Object.keys(grouped).sort();
        sel.innerHTML='<option value="">— Seleccionar área —</option>'+areas.map(a=>'<option value="'+esc(a)+'">'+esc(a)+'</option>').join('');
        // Hide sede until area is selected
        $('edSedeSel').innerHTML='<option value="">— Primero elegí un área —</option>';
        $('edSedeSel').disabled=true;
        let total=0,evHoy=0;
        areas.forEach(a=>{grouped[a].forEach(c=>{total++;if(hoy.evaluados&&hoy.evaluados[c.email])evHoy++})});
        $('edSt').innerHTML='<div class="st sb"><div class="st-i">📋</div><div class="st-n">'+(hoy.fecha||'—')+'</div><div class="st-l">Hoy</div></div>'
          +'<div class="st sg"><div class="st-i">✅</div><div class="st-n">'+evHoy+'/'+total+'</div><div class="st-l">Evaluados hoy</div></div>'
          +'<div class="st sl"><div class="st-i">📂</div><div class="st-n">'+areas.length+'</div><div class="st-l">Áreas</div></div>';
        $('edColabsCont').innerHTML='<div class="empty"><div class="empty-i">📂</div><div class="empty-t">Seleccioná un área para comenzar</div></div>';
      }catch(e){toast(e.message,'err')}
    },

    selArea(){
      const area=$('edAreaSel').value;
      const ct=$('edColabsCont');
      const sedeSel=$('edSedeSel');
      if(!area){
        ct.innerHTML='<div class="empty"><div class="empty-i">📂</div><div class="empty-t">Seleccioná un área</div></div>';
        sedeSel.innerHTML='<option value="">— Primero elegí un área —</option>';
        sedeSel.disabled=true;
        return;
      }
      const colabs=_colabs[area]||[];
      // Extract unique sedes from this area's collaborators
      const sedesSet={};
      colabs.forEach(c=>{if(c.sede)sedesSet[c.sede]=true});
      const sedes=Object.keys(sedesSet).sort();
      // Show sede filter only if area has multiple sedes
      if(sedes.length>1){
        sedeSel.innerHTML='<option value="">Todas las sedes ('+sedes.length+')</option>'+sedes.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
        sedeSel.disabled=false;
      }else{
        sedeSel.innerHTML='<option value="">'+(sedes.length===1?sedes[0]:'Sin sedes')+'</option>';
        sedeSel.disabled=true;
      }
      this._renderColabs(area);
    },

    filterBySede(){
      const area=$('edAreaSel').value;
      if(!area)return;
      this._renderColabs(area);
    },

    _renderColabs(area){
      const ct=$('edColabsCont');
      let colabs=(_colabs[area]||[]).slice();
      const sedeFilter=$('edSedeSel').value;
      if(sedeFilter){colabs=colabs.filter(c=>c.sede===sedeFilter)}
      colabs.sort(function(a,b){return(a.nombre||'').localeCompare(b.nombre||'')});
      if(!colabs.length){ct.innerHTML='<div class="empty"><div class="empty-t">No hay colaboradores'+(sedeFilter?' en '+sedeFilter:'')+'</div></div>';return}
      const hoy=_hoyData?.evaluados||{};
      ct.innerHTML='<div class="cg">'+colabs.map(c=>{
        const done=hoy[c.email];
        const avgHoy=done?done.reduce((s,x)=>s+x.nota,0)/done.length:0;
        const empTag=c.empresa?'<span style="font-size:.62rem;background:var(--b0);color:var(--b8);padding:1px 6px;border-radius:4px;font-weight:600">'+esc(c.empresa)+'</span>':'';
        return '<div class="cc"><img class="av" src="'+(c.fotoUrl||fb(c.nombre))+'" onerror="this.src=\''+fb(c.nombre)+'\'">'
          +'<div class="ci"><div class="cn">'+esc(c.nombre)+'</div><div class="cm">'+esc(c.sede||'')+' '+empTag+'</div>'
          +(done?'<div style="font-size:.72rem;color:var(--g6);font-weight:600;margin-bottom:4px">✓ Evaluado hoy ('+avgHoy.toFixed(1)+')</div>':'')
          +'<button class="btn-ev" data-eval-email="'+esc(c.email)+'" data-eval-area="'+esc(area)+'">'+(done?'Re-evaluar':'Evaluar')+'</button>'
          +'</div></div>';
      }).join('')+'</div>';
    },

    async openModal(email,area){
      const areaColabs=_colabs[area]||[];
      const c=areaColabs.find(x=>x.email===email);
      if(!c)return;
      _currentColab=c;_ratings={};
      $('edEvalNm').textContent=c.nombre;
      $('edEvalMt').textContent=area+' · '+c.sede+' · Evaluación diaria';
      $('edEvalFoto').src=c.fotoUrl||fb(c.nombre);$('edEvalFoto').onerror=function(){this.src=fb(c.nombre)};
      $('edEvalCom').value='';
      try{
        const pregs=await api.getPreguntasDiarias(area);
        const cats=Object.keys(pregs);
        if(!cats.length){toast('No hay preguntas configuradas para '+area,'err');return}
        $('edEvalBd').innerHTML=cats.map(cat=>{
          const qs=pregs[cat]||[];
          return '<div style="margin-bottom:16px">'
            +'<div style="font-weight:700;font-size:.88rem;color:var(--b8);margin-bottom:10px;padding:6px 12px;background:var(--b0);border-radius:8px;border-left:3px solid var(--b8)">'+esc(cat)+' <span style="font-weight:400;font-size:.72rem;color:var(--s4)">('+qs.length+')</span></div>'
            +qs.map(q=>{
              const key=cat+'|||'+q;
              return '<div class="rb"><div class="rl">'+esc(q)+'</div><div class="rr" data-dparam="'+esc(key)+'">'
                +[1,2,3,4,5,6,7,8,9,10].map(n=>'<button type="button" class="rb-b" data-v="'+n+'">'+n+'</button>').join('')
                +'</div></div>';
            }).join('')+'</div>';
        }).join('');
        $('edEvalOv').classList.add('open');
      }catch(e){toast(e.message,'err')}
    },

    closeModal(){$('edEvalOv').classList.remove('open')},

    async submit(){
      const allRR=$('edEvalBd').querySelectorAll('.rr[data-dparam]');
      const missing=[];
      allRR.forEach(rr=>{if(!_ratings[rr.dataset.dparam])missing.push(rr.dataset.dparam.split('|||')[1])});
      if(missing.length>0){toast('Faltan '+missing.length+' preguntas','err');return}
      const keys=Object.keys(_ratings);
      const calificaciones=keys.map(k=>{const parts=k.split('|||');return{categoria:parts[0],pregunta:parts[1],nota:_ratings[k]}});
      const comentario=$('edEvalCom').value.trim();
      const btn=$('edEvalBtn');btn.disabled=true;btn.textContent='Guardando...';
      try{
        const r=await api.guardarEvalDiaria({colaboradorEmail:_currentColab.email,calificaciones:calificaciones,comentario:comentario});
        if(r.success){toast('Evaluación guardada','ok');this.closeModal();this.load()}
        else toast(r.message,'err');
      }catch(e){toast(e.message,'err')}
      btn.disabled=false;btn.textContent='Guardar Evaluación Diaria';
    }
  };
})();