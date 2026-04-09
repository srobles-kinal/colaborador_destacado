/**
 * views/elecciones.js
 */
App.elec={
  async load(){
    const ct=$('elecCont');if(!ct)return;
    try{
      const els=await api.getElecciones();
      if(!els.length){ct.innerHTML='<div class="empty"><div class="empty-t">No hay elecciones. Creá la primera.</div></div>';return}
      ct.innerHTML=els.map(c=>{
        const isA=c.estado==='activa';
        const badge=isA?'<span style="background:var(--g0);color:var(--g6);padding:2px 8px;border-radius:20px;font-size:.68rem;font-weight:700">● Activa</span>':c.estado==='cerrada'?'<span style="background:var(--s1);color:var(--s4);padding:2px 8px;border-radius:20px;font-size:.68rem">Cerrada</span>':'<span style="background:var(--b0);color:var(--b8);padding:2px 8px;border-radius:20px;font-size:.68rem">Borrador</span>';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--s2);border-radius:10px;margin-bottom:8px;background:var(--s0);flex-wrap:wrap;gap:8px"><div><strong style="font-size:.85rem">'+esc(c.nombre)+'</strong> '+badge+'</div><div style="display:flex;gap:4px">'
          +(!isA&&c.estado!=='cerrada'?'<button class="btn ba" style="padding:4px 10px;font-size:.68rem" onclick="App.elec.activar(\''+c.id+'\')">▶ Activar</button>':'')
          +(isA?'<button class="btn bd" style="padding:4px 10px;font-size:.68rem" onclick="App.elec.cerrar(\''+c.id+'\')">⏹ Cerrar</button>':'')
          +'</div></div>';
      }).join('');
    }catch(e){ct.innerHTML='<div class="empty">'+e.message+'</div>'}
  },
  async crear(){const n=prompt('Nombre de la elección (ej: Marzo 2026):');if(!n)return;try{const r=await api.crearEleccion({nombre:n});if(r.success){toast('Creada','ok');this.load()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}},
  async activar(id){if(!confirm('¿Activar? La anterior se cerrará.'))return;try{const r=await api.activarEleccion(id);if(r.success){toast('Activada','ok');this.load()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}},
  async cerrar(id){if(!confirm('¿Cerrar esta elección?'))return;try{const r=await api.cerrarEleccion(id);if(r.success){toast('Cerrada','ok');this.load()}else toast(r.message,'err')}catch(e){toast(e.message,'err')}}
};