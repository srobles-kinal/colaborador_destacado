/**
 * views/reportes.js
 */
App.rep={
  async load(){
    try{
      const d=await api.getAllData(),cl=d.colaboradores||[],pr=d.promedios||{},g={};
      cl.forEach(c=>{const a=c.area||'Sin Área';if(!g[a])g[a]=[];g[a].push(c)});
      let rows='';Object.keys(g).sort().forEach(a=>{rows+='<tr><td colspan="4" style="background:var(--s0);font-weight:700;color:var(--b8);padding:8px 12px;font-size:.74rem">📂 '+esc(a)+'</td></tr>';g[a].forEach(c=>{const p=pr[String(c.id)];rows+='<tr><td>'+esc(c.nombre)+'</td><td>'+esc(c.sede||'—')+'</td><td>'+(p?parseFloat(p).toFixed(1)+'/10':'—')+'</td><td>'+stars_(p)+'</td></tr>'})});
      $('tR').innerHTML='<thead><tr><th>Colaborador</th><th>Sede</th><th>Promedio</th><th>Rating</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" style="text-align:center;padding:20px">Sin datos</td></tr>')+'</tbody>';
    }catch(e){toast(e.message,'err')}
  },
  async expX(){
    toast('Generando...','info');
    try{const d=await api.exportReport();if(!d?.rows)return;const csv=d.rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='reporte_'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();document.body.removeChild(a);toast('Descargado','ok')}catch(e){toast(e.message,'err')}
  }
};