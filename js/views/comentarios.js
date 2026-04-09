/**
 * views/comentarios.js — View comments per collaborator (admin module, assignable permission)
 */
(function(){
  let _allComments=[];

  App.comentarios={
    async load(){
      const ct=$('comCont');if(!ct)return;
      try{
        _allComments=await api.getComentarios();
        this._render();
      }catch(e){ct.innerHTML='<div class="empty"><div class="empty-t">'+e.message+'</div></div>'}
    },

    search(){this._render()},

    _render(){
      const ct=$('comCont');
      const search=($('comSearch')?.value||'').toLowerCase();
      const tipo=$('comTipo')?.value||'todos';

      let filtered=_allComments;
      if(tipo!=='todos')filtered=filtered.filter(c=>c.tipo===tipo);
      if(search)filtered=filtered.filter(c=>(c.colaborador+c.evaluador+c.comentario+c.emailColab).toLowerCase().includes(search));

      if(!filtered.length){ct.innerHTML='<div class="empty"><div class="empty-i">💬</div><div class="empty-t">No hay comentarios'+(search?' para "'+esc(search)+'"':'')+'</div></div>';return}

      // Group by collaborator, sorted alphabetically
      const grouped={};
      filtered.forEach(c=>{
        const key=c.emailColab||c.colaborador;
        if(!grouped[key])grouped[key]={nombre:c.colaborador,email:c.emailColab,items:[]};
        grouped[key].items.push(c);
      });

      const sortedKeys=Object.keys(grouped).sort(function(a,b){return(grouped[a].nombre||'').localeCompare(grouped[b].nombre||'')});

      ct.innerHTML=sortedKeys.map(key=>{
        const g=grouped[key];
        return '<div style="margin-bottom:14px;border:1px solid var(--s2);border-radius:10px;overflow:hidden">'
          +'<div style="padding:10px 14px;background:var(--s0);font-weight:700;font-size:.85rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--s2)">'
          +'<span>'+esc(g.nombre)+'</span>'
          +'<span style="font-size:.68rem;color:var(--s4);font-weight:400">'+g.items.length+' comentario'+(g.items.length>1?'s':'')+'</span></div>'
          +g.items.map(c=>{
            const tipoBadge=c.tipo==='eleccion'
              ?'<span style="font-size:.6rem;background:var(--l1);color:var(--b9);padding:1px 6px;border-radius:4px;font-weight:600">Elección</span>'
              :'<span style="font-size:.6rem;background:var(--b0);color:var(--b8);padding:1px 6px;border-radius:4px;font-weight:600">Diaria</span>';
            return '<div style="padding:10px 14px;border-bottom:1px solid var(--s1)">'
              +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
              +'<span style="font-size:.72rem;color:var(--s5)">'+esc(c.fecha)+' · '+esc(c.evaluador)+'</span>'
              +tipoBadge+'</div>'
              +'<div style="font-size:.82rem;color:var(--s7);line-height:1.5">"'+esc(c.comentario)+'"</div></div>';
          }).join('')
          +'</div>';
      }).join('');
    }
  };
})();