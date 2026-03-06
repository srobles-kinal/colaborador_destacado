/**
 * api.js — HTTP client (CORS-safe, no preflight)
 */
// ══════════════════════════════════════════════
//  CONFIGURAR TU URL DE DEPLOY AQUÍ:
const API_URL = 'https://script.google.com/macros/s/AKfycbyenO3RkiQVnz6gREWZGxXZ1CYnDQixZvosWHZM71CIRR9iTVvodMls2TJxrMzru5Df1g/exec';
// ══════════════════════════════════════════════

let _tk = null;
const api = {
  setToken(t){_tk=t}, getToken(){return _tk},
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
  saveParametros(v){return this.call('saveParametros',{valores:v})},
  saveParametrosSup(v){return this.call('saveParametrosSupervisores',{valores:v})},
  saveAreas(v){return this.call('saveAreas',{valores:v})},
  saveSedes(v){return this.call('saveSedes',{valores:v})},
};
window.api=api;