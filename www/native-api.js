// R4.7.6: TEST ONLY. Native-only HTTP to one explicitly approved DEMO host.
// Do not use browser fetch for credentials: Capacitor web view has a different origin/CORS/cookie jar.
import {DEMO_URL} from './validations.js';
const BASE = DEMO_URL;
const EXPECTED = Object.freeze({'demo-001':'DEMO-001','demo-002':'DEMO-002','demo-003':'DEMO-003'});
const ROUTES = Object.freeze({health:'/healthz',login:'/api/login',page:'/api/vehicles/page?page=1&size=20&status=all&sort=plate',revision:'/api/state/revision',logout:'/api/logout',draft:'/api/test-r473/native-draft'});
export class ApiError extends Error {
  constructor(message,code='ERROR'){super(message);this.name='ApiError';this.code=code;}
}
export function ensureNativePlugin(capacitor) {
  if(!capacitor || typeof capacitor.isNativePlatform!=='function' || !capacitor.isNativePlatform() ||
     typeof capacitor.Plugins?.CapacitorHttp?.request !== 'function') {
    throw new ApiError('Chỉ cho phép đăng nhập khi ứng dụng chạy native trên iPhone có CapacitorHttp.','NATIVE_REQUIRED');
  }
  return capacitor.Plugins.CapacitorHttp;
}
function okResponse(response, original) {
  if(!response || !Number.isInteger(response.status))throw new ApiError('Phản hồi HTTP không hợp lệ.');
  // Redirect is disabled, but enforce the final URL as an additional fail-closed check.
  if(typeof response.url!=='string' || response.url!==original)throw new ApiError('Máy chủ chuyển hướng hoặc URL trả về không đúng.','BAD_REDIRECT');
  if(response.status===401)throw new ApiError('Phiên đăng nhập không có hiệu lực hoặc đã hết hạn.','UNAUTHORIZED');
  if(response.status===403)throw new ApiError('Máy chủ từ chối yêu cầu từ ứng dụng native.','FORBIDDEN');
  if(response.status===409)throw new ApiError('Dữ liệu đã thay đổi; giữ nguyên bản nháp.','CONFLICT');
  if(response.status===429)throw new ApiError('Đăng nhập bị giới hạn; thử lại sau.','RATE_LIMIT');
  if(response.status<200 || response.status>=300)throw new ApiError(`Máy chủ trả HTTP ${response.status}.`,'HTTP_ERROR');
  let parsed=response.data;
  if(typeof parsed==='string'){
    if(parsed.length>24000)throw new ApiError('Phản hồi quá lớn.','BAD_SHAPE');
    try{parsed=JSON.parse(parsed)}catch{throw new ApiError('Máy chủ không trả JSON hợp lệ.','BAD_SHAPE')}
  }
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))throw new ApiError('Dữ liệu phản hồi không đúng dạng JSON.','BAD_SHAPE');
  return parsed;
}
export function validateDemoPage(page){
  if(!page || typeof page!=='object' || Array.isArray(page) || page.total!==3 || page.filtered!==3 || page.page!==1 || page.pages!==1 ||
    !Array.isArray(page.items) || page.items.length!==3 || !Number.isSafeInteger(page.revision) || page.revision<0 ||
    typeof page.server_epoch!=='string' || page.server_epoch.length<4 || page.server_epoch.length>200) {
    throw new ApiError('Máy chủ không phải bộ dữ liệu R4.6.1 DEMO đúng 3 xe; không hiển thị.','WRONG_DATASET');
  }
  const seen=new Set();
  for(const v of page.items){
    if(!v || typeof v!=='object' || Array.isArray(v) || typeof v.id!=='string' ||
      !Object.hasOwn(EXPECTED,v.id) || v.plate!==EXPECTED[v.id] || seen.has(v.id)){
      throw new ApiError('Cặp ID nội bộ và biển số không đúng bộ 3 xe DEMO; không hiển thị.','WRONG_DATASET');
    }
    if(typeof v.name!=='string' || typeof v.inspectionDue!=='string'){
      throw new ApiError('Trường tên xe hoặc hạn đăng kiểm không đúng dạng DEMO.','BAD_SHAPE');
    }
    seen.add(v.id);
  }
  return Object.freeze({revision:page.revision,serverEpoch:page.server_epoch,
    items:page.items.map(v=>Object.freeze({id:v.id, plate:safeText(v.plate),name:safeText(v.name),inspectionDue:safeText(v.inspectionDue)}))});
}
function safeText(raw){return typeof raw==='string' ? raw.slice(0,120) : '';}
export class DemoClient {
  constructor(nativeHttp){
    if(typeof nativeHttp?.request!=='function')throw new ApiError('Thiếu HTTP native.','NATIVE_REQUIRED');
    this.http=nativeHttp;this.authenticated=false;this.snapshot=null;
  }
  async send(route,method='GET',body){
    if(!Object.hasOwn(ROUTES,route))throw new ApiError('Đường dẫn không được cho phép.','BAD_ROUTE');
    if(method!==(['login','logout','draft'].includes(route)?'POST':'GET'))throw new ApiError('Phương thức không được cho phép.','BAD_METHOD');
    if(route==='draft'&&!this.authenticated)throw new ApiError('Cần đăng nhập trước khi gửi.','UNAUTHORIZED');
    const url=BASE+ROUTES[route];
    const options={url,method,connectTimeout:8000,readTimeout:8000,disableRedirects:true,
      responseType:'json',headers:{'Accept':'application/json','Cache-Control':'no-store'}};
    if(method==='POST'){
      options.headers['Content-Type']='application/json'; options.headers['x-dkp-write']='1';
      options.data=body??{};
    }
    let response;
    try{response=await this.http.request(options)}
    catch{throw new ApiError('Không thể kết nối tới máy chủ DEMO qua HTTPS.','NETWORK')}
    return okResponse(response,url);
  }
  async login(username,password){
    this.authenticated=false;this.snapshot=null;
    if(typeof username!=='string'||!username.trim()||username.length>100||
       typeof password!=='string'||!password||password.length>500)throw new ApiError('Tài khoản hoặc mật khẩu không hợp lệ.','BAD_INPUT');
    const result=await this.send('login','POST',{username:username.trim(),password,platform:'web',label:'Capacitor DEMO R4.7.6'});
    if(result.ok!==true)throw new ApiError('Máy chủ chưa xác nhận đăng nhập.','BAD_LOGIN');
    // Login response alone cannot prove that HttpOnly session cookies are attached to subsequent requests.
    const snapshot=await this.fetchDemoPage();
    this.snapshot=snapshot;this.authenticated=true;
    return snapshot;
  }
  async resume(){
    this.clearLocal();
    const snapshot=await this.fetchDemoPage();
    this.snapshot=snapshot;this.authenticated=true;
    return snapshot;
  }
  async fetchDemoPage(){
    const raw=await this.send('page');
    return validateDemoPage(raw);
  }
  async refresh(){
    if(!this.authenticated)throw new ApiError('Cần đăng nhập lại.','UNAUTHORIZED');
    try{const snapshot=await this.fetchDemoPage();this.snapshot=snapshot;return snapshot;}
    catch(error){this.authenticated=false;this.snapshot=null;throw error}
  }
  async preflight(){
    if(!this.authenticated || !this.snapshot)throw new ApiError('Cần đăng nhập để đối chiếu.','UNAUTHORIZED');
    let rev;
    try{rev=await this.send('revision')}
    catch(error){this.authenticated=false;this.snapshot=null;throw error}
    if(!Number.isSafeInteger(rev.revision)||typeof rev.server_epoch!=='string')throw new ApiError('Không đọc được phiên bản máy chủ.','BAD_SHAPE');
    return Object.freeze({same:rev.revision===this.snapshot.revision && rev.server_epoch===this.snapshot.serverEpoch,
      revision:rev.revision,epochChanged:rev.server_epoch!==this.snapshot.serverEpoch});
  }
  async logout(){
    this.authenticated=false;this.snapshot=null;
    return this.send('logout','POST',{});
  }
  clearLocal(){this.authenticated=false;this.snapshot=null;}
}
