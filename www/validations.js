export const DEMO_HOST = 'recede-putdown-hardy.ngrok-free.dev';
export const DEMO_URL = `https://${DEMO_HOST}`;
export const VEHICLES = Object.freeze([
  {id:'DEMO-001',name:'KIA (xe giả lập)',inspectionDue:'2026-11-28'},
  {id:'DEMO-002',name:'Toyota (xe giả lập)',inspectionDue:'2026-12-27'},
  {id:'DEMO-003',name:'Ford (xe giả lập)',inspectionDue:''}
]);
export function trustedEndpoint(value) {
  try {
    const url = new URL(String(value||''));
    if(url.protocol !== 'https:' || url.hostname.toLowerCase() !== DEMO_HOST) return null;
    if(url.username || url.password || url.search || url.hash || url.port) return null;
    if(url.pathname !== '/' && url.pathname !== '') return null;
    return DEMO_URL;
  } catch { return null; }
}
export function validVehicleId(id){ return VEHICLES.some(v=>v.id===id); }
export function validDueDate(date){
  if(date==='') return true;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y,m,d]=date.split('-').map(Number);
  const check=new Date(Date.UTC(y,m-1,d));
  return check.getUTCFullYear()===y && check.getUTCMonth()+1===m && check.getUTCDate()===d;
}
