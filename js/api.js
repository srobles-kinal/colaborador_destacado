/**
 * api.js v6 — HTTP client
 */
// ══════════════════════════════════════
const API_URL = 'https://script.google.com/macros/s/AKfycbz83jnGf3XdQybe-nPJ1fLf3omMJkDXc8-PFTJWdAO1DmucVwB05fIY1Ey1PUBduA2Pcg/exec';
// ══════════════════════════════════════
let _tk=null;
const api={
  setToken(t){_tk=t},getToken(){return _tk},
  async call(action,data={}){
    const r=await fetch(API_URL,{method:'POST',body:JSON.stringify({action,token:_tk,...data})});
    const j=await r.json();
    if(j.status==='error')throw new Error(j.message||'Error');
    return j;
  },
  login(u,p){return this.call('login',{usuario:u,password:p})},
  cambiarPassword(n){return this.call('cambiarPassword',{nuevaPassword:n})},
  logout(){return this.call('logout')},
  async getAllData(){return(await this.call('getAllData')).data},
  async getDashboard(){return(await this.call('getDashboardData')).data},
  async getAdminStats(){return(await this.call('getAdminStats')).data},
  guardarVotos(d){return this.call('guardarVotos',d)},
  async getUsuarios(){return(await this.call('getUsuarios')).data},
  crearUsuario(d){return this.call('crearUsuario',d)},
  editarUsuario(d){return this.call('editarUsuario',d)},
  eliminarUsuario(e){return this.call('eliminarUsuario',{email:e})},
  resetPassword(e){return this.call('resetPassword',{email:e})},
  async exportReport(){return(await this.call('exportReport')).data},
  saveParametros(v){return this.call('saveParametros',{valores:v})},
  saveParametrosSup(v){return this.call('saveParametrosSupervisores',{valores:v})},
  saveAreas(v){return this.call('saveAreas',{valores:v})},
  saveSedes(v){return this.call('saveSedes',{valores:v})},
  // Params per area
  async getParametrosArea(){return(await this.call('getParametrosArea')).data},
  saveParametrosArea(area,params){return this.call('saveParametrosArea',{area:area,parametros:params})},
  // Supervisors
  async getEvaluadoresSup(){return(await this.call('getEvaluadoresSup')).data},
  asignarEvaluadores(supEmail,evaluadores){return this.call('asignarEvaluadores',{supervisorEmail:supEmail,evaluadores:evaluadores})},
  async getColabsByArea(areas){return(await this.call('getColabsByArea',{areas:areas})).data},
  // Convocatorias
  async getConvocatorias(){return(await this.call('getConvocatorias')).data},
  crearConvocatoria(d){return this.call('crearConvocatoria',d)},
  activarConvocatoria(id){return this.call('activarConvocatoria',{id:id})},
  cerrarConvocatoria(id){return this.call('cerrarConvocatoria',{id:id})},
};
window.api=api;