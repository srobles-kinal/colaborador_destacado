/**
 * views/dashboard.js — Fix #2: sede in ranking, #4: unique evaluados, #5: auto-refresh
 */
(function(){
  let CHS={},_refreshTimer=null;

  App.dash={
    async load(){
      try{
        const dc=await api.getDashboardCombinado();
        const pesos=dc.pesos||{pesoDiaria:40,pesoEleccion:60};
        const elecNombre=dc.eleccion?dc.eleccion.nombre:'Sin elección';
        const resultados=dc.resultados||[];
        const topArea=dc.topPorArea||{};
        const total=resultados.length;
        const conScore=resultados.filter(r=>r.puntajeFinal>0).length;

        $('dSt').innerHTML=
          '<div class="st sb"><div class="st-i">👥</div><div class="st-n">'+total+'</div><div class="st-l">Colaboradores</div></div>'+
          '<div class="st sg"><div class="st-i">✅</div><div class="st-n">'+conScore+'</div><div class="st-l">Con puntaje</div></div>'+
          '<div class="st sl"><div class="st-i">🗓️</div><div class="st-n" style="font-size:1rem">'+esc(elecNombre)+'</div><div class="st-l">Elección</div></div>';

        $('topAreaCont').innerHTML=Object.values(topArea).map(t=>
          '<div class="top-card"><img src="'+(t.foto||fb(t.nombre))+'" onerror="this.src=\''+fb(t.nombre)+'\'"><div class="top-card-info"><div class="top-card-name">'+esc(t.nombre)+'</div><div class="top-card-meta">📂 '+esc(t.area||'')+'</div></div><div class="top-card-score">'+parseFloat(t.puntajeFinal).toFixed(1)+'</div></div>'
        ).join('')||'<div class="empty"><div class="empty-t">Sin datos</div></div>';

        const topSede={};
        resultados.forEach(r=>{if(r.puntajeFinal>0&&r.sede&&(!topSede[r.sede]||r.puntajeFinal>topSede[r.sede].puntajeFinal))topSede[r.sede]=r});
        $('topSedeCont').innerHTML=Object.values(topSede).map(t=>
          '<div class="top-card"><img src="'+(t.foto||fb(t.nombre))+'" onerror="this.src=\''+fb(t.nombre)+'\'"><div class="top-card-info"><div class="top-card-name">'+esc(t.nombre)+'</div><div class="top-card-meta">🏢 '+esc(t.sede||'')+'</div></div><div class="top-card-score">'+parseFloat(t.puntajeFinal).toFixed(1)+'</div></div>'
        ).join('')||'<div class="empty"><div class="empty-t">Sin datos</div></div>';

        // Fix #2: Ranking with sede column
        const ranked=resultados.filter(r=>r.puntajeFinal>0);
        $('tRank').innerHTML='<thead><tr><th>#</th><th>Colaborador</th><th>Área</th><th>Sede</th>'+
          '<th>Diaria ('+pesos.pesoDiaria+'%)</th><th>Elección ('+pesos.pesoEleccion+'%)</th><th>Final</th></tr></thead><tbody>'+
          (ranked.length?ranked.map((r,i)=>{
            const medal=i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':'';
            return '<tr'+(i<3?' style="background:var(--l1)"':'')+'>'+
              '<td style="font-weight:700">'+medal+(i+1)+'</td>'+
              '<td style="display:flex;align-items:center;gap:8px"><img src="'+(r.foto||fb(r.nombre))+'" onerror="this.src=\''+fb(r.nombre)+'\'" style="width:28px;height:28px;border-radius:7px;object-fit:cover">'+esc(r.nombre)+'</td>'+
              '<td>'+esc(r.area||'—')+'</td>'+
              '<td>'+esc(r.sede||'—')+'</td>'+
              '<td>'+(r.promDiaria>0?parseFloat(r.promDiaria).toFixed(1):'—')+'</td>'+
              '<td>'+(r.promEleccion>0?parseFloat(r.promEleccion).toFixed(1):'—')+'</td>'+
              '<td style="font-weight:800;color:var(--b8)">'+parseFloat(r.puntajeFinal).toFixed(1)+'</td></tr>';
          }).join(''):'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--s4)">Sin evaluaciones</td></tr>')+
          '</tbody>';

        // Chart
        const chartData=ranked.slice(0,20);
        const c1=$('cD')?.getContext('2d');
        if(c1){
          if(CHS.d)CHS.d.destroy();
          CHS.d=new Chart(c1,{type:'bar',data:{labels:chartData.map(r=>r.nombre.split(' ')[0]),datasets:[
            {label:'Diaria',data:chartData.map(r=>r.promDiaria||0),backgroundColor:'#10069F',borderRadius:3,barThickness:14},
            {label:'Elección',data:chartData.map(r=>r.promEleccion||0),backgroundColor:'#97D700',borderRadius:3,barThickness:14}
          ]},options:{responsive:true,plugins:{legend:{position:'bottom',labels:{font:{size:11}}}},scales:{y:{beginAtZero:true,max:10}}}});
        }

        // Fix #4: Tendencias with unique evaluados count
        try{
          const dd=await api.getDashboard();
          const tr=dd.tendencias||[];
          const c2=$('cT')?.getContext('2d');
          if(c2&&tr.length){
            if(CHS.t)CHS.t.destroy();
            CHS.t=new Chart(c2,{type:'line',data:{labels:tr.map(t=>t.fecha),datasets:[{label:'Promedio',data:tr.map(t=>t.promedio),borderColor:'#10069F',backgroundColor:'rgba(16,6,159,.05)',tension:.35,fill:true,pointRadius:3}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:10}}}});
          }
          // Fix #4: votos column now shows unique collaborators evaluated, not question count
          $('tT').innerHTML='<thead><tr><th>Fecha</th><th>Promedio</th><th>Evaluados</th></tr></thead><tbody>'+tr.map(t=>'<tr><td>'+t.fecha+'</td><td>'+t.promedio+'/10</td><td>'+t.votos+'</td></tr>').join('')+'</tbody>';
        }catch(e){}

        // Fix #5: Auto-refresh every 30 seconds when dashboard is visible
        this._startAutoRefresh();
      }catch(e){toast(e.message,'err')}
    },

    _startAutoRefresh:function(){
      if(_refreshTimer)clearInterval(_refreshTimer);
      _refreshTimer=setInterval(()=>{
        // Only refresh if dashboard tab is active
        const dashTab=document.querySelector('[data-tab="dash"].on');
        if(dashTab)this.load();
      },30000);
    },

    stopAutoRefresh:function(){
      if(_refreshTimer){clearInterval(_refreshTimer);_refreshTimer=null}
    }
  };
})();