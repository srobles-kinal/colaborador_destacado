/**
 * views/votacion.js — Voting tab + eval modal
 */
(function(){
  let EV={id:null,nombre:'',ratings:{},_params:[]};
  window._activeRatings=EV.ratings;

  App.vot={
    render(){
      if(!DATA)return;
      const a=DATA.analytics||{},mp=DATA.miPromedio?parseFloat(DATA.miPromedio).toFixed(1):'—';
      $('vSt').innerHTML=
        '<div class="st sb"><div class="st-i">⭐</div><div class="st-n">'+mp+'</div><div class="st-l">Mi Promedio</div></div>'+
        '<div class="st sl"><div class="st-i">👥</div><div class="st-n">'+(DATA.colaboradores?.length||0)+'</div><div class="st-l">Por Evaluar</div></div>'+
        '<div class="st sa"><div class="st-i">📊</div><div class="st-n">'+(a.tasaParticipacion||0)+'%</div><div class="st-l">Participación</div></div>';
      this.renderFilters();this.renderAreas();
    },
    renderFilters(){const s=$('fSede');s.innerHTML='<option value="">Todas las sedes</option>';(DATA.sedes||[]).forEach(x=>{s.innerHTML+='<option value="'+esc(x)+'">'+esc(x)+'</option>'});s.onchange=()=>this.renderAreas();$('fS').oninput=()=>this.renderAreas()},
    renderAreas(){
      const ct=$('areaCont'),search=$('fS').value.toLowerCase(),sede=$('fSede').value;
      let cl=DATA.colaboradores||[];
      if(sede)cl=cl.filter(x=>x.sede===sede);if(search)cl=cl.filter(x=>x.nombre.toLowerCase().includes(search));
      const g={};cl.forEach(x=>{const a=x.area||'Sin Área';if(!g[a])g[a]=[];g[a].push(x)});
      const nm=Object.keys(g).sort();
      if(!DATA.eleccionActiva){ct.innerHTML='<div class="empty"><div class="empty-i">🗓️</div><div class="empty-t">No hay elección activa. Contacta al administrador.</div></div>';return}
      if(!nm.length){ct.innerHTML='<div class="empty"><div class="empty-i">🔍</div><div class="empty-t">No se encontraron colaboradores</div></div>';return}
      ct.innerHTML=nm.map((area,idx)=>{
        const ls=g[area],col=gc(idx),dn=ls.filter(x=>DATA.evaluacionesUnicas?.[USER.email+'|'+x.id]).length,pn=ls.length-dn;
        return '<div class="as" style="animation-delay:'+idx*.04+'s"><div class="ah op" onclick="App.vot.tog(this)" data-a="'+esc(area)+'"><div class="ah-l"><div class="ah-ic" style="background:'+col.bg+';color:'+col.ic+';border:1.5px solid '+col.br+'">'+area.charAt(0)+'</div><div><div class="ah-nm">'+esc(area)+'</div><div class="ah-ct">'+ls.length+' colab. · '+(pn>0?pn+' pendiente'+(pn>1?'s':''):'✓ Completo')+'</div></div></div><span class="ah-ch">▼</span></div><div class="ab op" id="bd-'+area.replace(/\s/g,'_')+'">'+this.grid(ls,area)+'</div></div>';
      }).join('');
    },
    grid(ls,area){
      if(!window._cd)window._cd={};
      ls.forEach(c=>{window._cd[c.id]=c;window._cd[c.id]._area=area});
      return '<div class="cg">'+ls.map(c=>{
        const k=USER.email+'|'+c.id,done=DATA.evaluacionesUnicas?.[k],pm=DATA.promedios?.[String(c.id)],pv=pm?parseFloat(pm):0,pt=pm?pv.toFixed(1):'—',bw=pm?(pv/10*100):0;
        return '<div class="cc '+(done?'dn':'')+'"><div class="dn-b">✓ Evaluado</div><img class="av" src="'+(c.fotoUrl||fb(c.nombre))+'" onerror="this.src=\''+fb(c.nombre)+'\'"><div class="ci"><div class="cn">'+esc(c.nombre)+'</div><div class="cm">'+esc(c.sede||'')+'</div><div class="cs-r"><span class="cs">'+pt+'</span><div class="bar-bg"><div class="bar-f" style="width:'+bw+'%"></div></div></div>'+(done?'':'<button class="btn-ev" onclick="App.vot.openEval(\''+c.id+'\')">Evaluar</button>')+'</div></div>';
      }).join('')+'</div>';
    },
    tog(h){h.classList.toggle('op');const b=$('bd-'+h.dataset.a.replace(/\s/g,'_'));if(b)b.classList.toggle('op')},

    openEval(id){
      const c=window._cd?.[id];if(!c)return;
      EV={id:c.id,nombre:c.nombre,ratings:{},_params:[]};window._activeRatings=EV.ratings;
      $('evalNm').textContent=c.nombre;$('evalMt').textContent=[c.area,c.sede].filter(Boolean).join(' · ');
      $('evalFoto').src=c.fotoUrl||fb(c.nombre);$('evalFoto').onerror=function(){this.src=fb(c.nombre)};$('evalCom').value='';
      const ap=DATA.parametrosArea?.[c._area||c.area];
      const params=ap&&ap.length?ap:(DATA.parametros||[]);EV._params=params;
      $('evalBd').innerHTML=params.map(p=>'<div class="rb"><div class="rl">'+esc(p)+'</div><div class="rr" data-param="'+esc(p)+'">'+[1,2,3,4,5,6,7,8,9,10].map(n=>'<button type="button" class="rb-b" data-v="'+n+'">'+n+'</button>').join('')+'</div></div>').join('');
      $('evalOv').classList.add('open');
    },
    closeEval(){$('evalOv').classList.remove('open')},
    async submitEval(){
      const params=EV._params||[],miss=params.filter(p=>!EV.ratings[p]);
      if(miss.length){toast('Falta: '+miss.join(', '),'err');return}
      const btn=$('evalBtn');btn.disabled=true;btn.textContent='Enviando...';
      try{
        const res=await api.guardarVotos({evaluadoId:EV.id,evaluadoNombre:EV.nombre,calificaciones:params.map(p=>({parametro:p,puntuacion:EV.ratings[p]})),sede:$('fSede').value||'',comentario:$('evalCom').value});
        if(res.success){toast(res.message||'Guardado','ok');DATA.evaluacionesUnicas[USER.email+'|'+EV.id]=true;if(res.nuevoPromedio)DATA.promedios[String(EV.id)]=res.nuevoPromedio;this.renderAreas();this.closeEval()}
        else toast(res.message||'Error','err');
      }catch(e){toast(e.message,'err')}
      btn.disabled=false;btn.textContent='Enviar Evaluación';
    }
  };
})();
