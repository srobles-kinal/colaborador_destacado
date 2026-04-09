/**
 * api.js v9
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbyBOV7Qjva15nzqHCrkGnieL6uzYQJ0Ujy1yeHEhQ8wNYc20wIiuw3CWcrabqfL1ucUlA/exec';
let _tk=null;
const api={
  setToken(t){_tk=t},getToken(){return _tk},
  async call(action,data={}){
    const r=await fetch(API_URL,{method:'POST',body:JSON.stringify({action,token:_tk,...data})});
    const j=await r.json();if(j.status==='error')throw new Error(j.message||'Error');return j;
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
  async getParametrosArea(){return(await this.call('getParametrosArea')).data},
  saveParametrosArea(area,params){return this.call('saveParametrosArea',{area:area,parametros:params})},
  async getEvaluadoresSup(){return(await this.call('getEvaluadoresSup')).data},
  asignarEvaluadores(supEmail,evaluadores){return this.call('asignarEvaluadores',{supervisorEmail:supEmail,evaluadores:evaluadores})},
  async getColabsByArea(areas){return(await this.call('getColabsByArea',{areas:areas})).data},
  async getElecciones(){return(await this.call('getElecciones')).data},
  crearEleccion(d){return this.call('crearEleccion',d)},
  activarEleccion(id){return this.call('activarEleccion',{id:id})},
  cerrarEleccion(id){return this.call('cerrarEleccion',{id:id})},
  async getCategoriasDiarias(){return(await this.call('getCategoriasDiarias')).data},
  saveCategoriasDiarias(area,datos){return this.call('saveCategoriasDiarias',{area:area,datos:datos})},
  async getPreguntasDiarias(area){return(await this.call('getPreguntasDiarias',{area:area})).data},
  guardarEvalDiaria(d){return this.call('guardarEvalDiaria',d)},
  async getEvalDiariaHoy(){return(await this.call('getEvalDiariaHoy')).data},
  async getColabsParaEvalDiaria(sede){return(await this.call('getColabsParaEvalDiaria',{sede:sede||''})).data},
  async getPesos(){return(await this.call('getPesos')).data},
  savePesos(d,e){return this.call('savePesos',{pesoDiaria:d,pesoEleccion:e})},
  async getDashboardCombinado(){return(await this.call('getDashboardCombinado')).data},
  async getComentarios(){return(await this.call('getComentarios')).data},
};
window.api=api;