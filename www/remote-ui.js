import {readVaultEntries} from './vault-storage.js';
import {decodeEntry} from './legacy-migration.js';
import {rememberedSession} from './remember-session.js';
import {deviceVault} from './device-vault.js';
// R4.7.5 UI; approved foreground DEMO draft send.
import {DemoClient, ensureNativePlugin} from './native-api.js';
import {setEditSnapshot,editButton,initEditUI,configureDraftSend,configureConflictRead,configureAutoReady,cancelAutoSync,refreshVaultUI} from './offline-edit-ui.js';
import {submitDraft} from './native-sync.js';
import {createSnapshotCache} from './snapshot-cache.js';
const $=s=>document.querySelector(s);
const set=(s,v)=>{$(s).textContent=String(v)};
const status=s=>set('#authResult',s);
let client=null;let busy=false;let nativeReady=false;let rememberedUntil=0;let restoreAllowed=true;let forgetFailed=false;
const cache=createSnapshotCache();let cacheBusy=false, cacheOpen=false, cacheExists=false, cacheGeneration=0;
function cacheStatus(msg){set('#cacheStatus',msg)}
function clearMigrationInputs(){for(const field of $('#migrationPasswords').querySelectorAll('input'))field.value='';}
function lockCache(){$('#legacyRows').replaceChildren();clearMigrationInputs();setEditSnapshot(null);cacheGeneration++;cacheOpen=false;set('#cacheMeta','');$('#cacheVehicles').replaceChildren();showState()}
function renderCache(data){
 const {snapshot,savedAt}=data;setEditSnapshot(snapshot);$('#cacheVehicles').replaceChildren();
 set('#cacheMeta',`BẢN SAO NGOẠI TUYẾN · revision ${snapshot.revision} · lưu ${new Date(savedAt).toLocaleString('vi-VN')} (giờ thiết bị) · có thể đã cũ`);
 for(const v of snapshot.items){const row=document.createElement('div');row.className='vehicle';const meta=document.createElement('div');const strong=document.createElement('strong');strong.textContent=v.plate;const small=document.createElement('small');small.textContent=[v.name,v.inspectionDue||'Chưa có hạn'].join(' · ');meta.append(strong,small);row.append(meta,editButton(v.id));$('#cacheVehicles').append(row)}cacheOpen=true;
}
async function cacheTask(fn){if(cacheBusy||busy||!nativeReady||!deviceVault.ready())return;cacheBusy=true;showState();try{await fn()}catch(e){cacheStatus(e.message||'Không xử lý được kho.')}finally{try{cacheExists=await cache.exists()}catch{cacheStatus('Không đọc được kho ngoại tuyến.')}cacheBusy=false;showState()}}
const buttons=['#nativeLogin','#nativeRefresh','#nativePreflight','#nativeLogout'];
function showState(){
  const active=Boolean(client?.authenticated);
  $('#loginFields').hidden=active;
  $('#loginUsername').disabled=$('#loginPassword').disabled=active;
  $('#nativeLogin').disabled=busy||cacheBusy||active||!nativeReady;
  $('#nativeRefresh').disabled=busy||cacheBusy||!active;
  $('#nativePreflight').disabled=busy||cacheBusy||!active;
  $('#nativeLogout').disabled=busy||(!active&&!deviceVault.ready()&&!rememberedUntil&&!forgetFailed)||cacheBusy;
  $('#resumeLogin').disabled=busy||cacheBusy||active||!nativeReady||!restoreAllowed;
  $('#cacheSave').disabled=!nativeReady||!deviceVault.ready()||busy||cacheBusy||!active||!client?.snapshot;
  $('#cacheOpen').disabled=!nativeReady||!deviceVault.ready()||busy||cacheBusy||!cacheExists;
  $('#cacheLock').disabled=!cacheOpen&&!cacheBusy;
  const migration=active&&deviceVault.needsMigration();$('#migrationForm').hidden=!migration;
  for(const field of $('#migrationPasswords').querySelectorAll('input'))field.disabled=!migration||busy||cacheBusy;
  $('#migrationRun').disabled=$('#migrationAdd').disabled=!migration||busy||cacheBusy;
  $('#legacyPreview').hidden=!deviceVault.ready();if(!deviceVault.ready())$('#legacyRows').replaceChildren();
  $('#legacyView').disabled=!deviceVault.ready()||busy||cacheBusy;
  $('#cacheDelete').disabled=!nativeReady||!deviceVault.ready()||busy||cacheBusy||!cacheExists;
}
function render(snapshot){
  $('#serverVehicles').replaceChildren();
  set('#serverRevision',`DEMO R4.7.12 · revision ${snapshot.revision} · 3 xe (chỉ đọc)`);
  for(const vehicle of snapshot.items){
    const row=document.createElement('div');row.className='vehicle';
    const meta=document.createElement('div');const strong=document.createElement('strong');strong.textContent=vehicle.plate;
    const small=document.createElement('small');small.textContent=[vehicle.name,vehicle.inspectionDue||'Chưa có hạn'].join(' · ');
    meta.append(strong,small);row.append(meta);$('#serverVehicles').append(row);
  }
}
function clear(){set('#serverRevision','');$('#serverVehicles').replaceChildren()}
function requireClient(){
  const plugin=ensureNativePlugin(window.Capacitor);
  if(!client)client=new DemoClient(plugin);
  return client;
}
async function perform(task){
  if(busy||cacheBusy)return;busy=true;showState();
  try{await task()}
  catch(error){
    status(error?.message || 'Có lỗi trong thử nghiệm native. Không gửi bản nháp.');
    if(!client?.authenticated){cancelAutoSync();clear();if(['UNAUTHORIZED','FORBIDDEN','WRONG_DATASET','BAD_REDIRECT','BAD_SHAPE'].includes(error?.code))await invalidateRemembered();}
  }
  finally{busy=false;showState()}
}
$('#nativeLoginForm').addEventListener('submit',event=>{
  event.preventDefault();
  const user=$('#loginUsername').value;
  const secret=$('#loginPassword').value;
  $('#loginPassword').value=''; // Never save the password in the DOM or storage.
  perform(async()=>{
    const api=requireClient();status('Đang xác nhận phiên trên máy chủ DEMO...');
    if(rememberedUntil||deviceVault.ready()||forgetFailed){await invalidateRemembered();if(forgetFailed)throw Error('Chưa khóa được phiên cũ; thử đăng xuất lại.');}
    const snapshot=await api.login(user,secret);
    render(snapshot);status('Đã đăng nhập DEMO.');restoreAllowed=true;
    try{rememberedUntil=await rememberedSession.remember();}catch{rememberedUntil=0;status('Đã đăng nhập, nhưng không lưu được phiên ghi nhớ.');}
    try{await deviceVault.unlock();await refreshVaultUI();cacheStatus('Kho mã hóa tự động sẵn sàng.');}catch(e){cacheStatus(e.message);status('Đã đăng nhập, nhưng kho ngoại tuyến bị khóa để bảo toàn dữ liệu.');}
  });
});
$('#nativeRefresh').addEventListener('click',()=>perform(async()=>{
  const snapshot=await requireClient().refresh();render(snapshot);status('Đã tải lại đúng 3 xe DEMO.');
}));
$('#nativePreflight').addEventListener('click',()=>perform(async()=>{
  const result=await requireClient().preflight();
  status(result.same ? 'Phiên bản máy chủ chưa đổi so với lần tải. Đây chỉ là kiểm tra sơ bộ; không tự gửi bản nháp.' :
    'Phát hiện phiên bản máy chủ hoặc phiên chạy đã thay đổi. Cần tải lại hồ sơ để đối chiếu; bản nháp vẫn được giữ.');
}));
$('#nativeLogout').addEventListener('click',()=>{cancelAutoSync();return perform(async()=>{
  const api=requireClient();restoreAllowed=false;
  try{await rememberedSession.forget();rememberedUntil=0;forgetFailed=false;}catch{forgetFailed=true;status('Chưa xóa được phiên ghi nhớ; hãy thử Đăng xuất lại.');deviceVault.lock();api.clearLocal();lockCache();clear();await refreshVaultUI();return;}
  try{await api.logout();status('Máy chủ xác nhận đăng xuất.');}
  catch{status('Không xác nhận được đăng xuất phía máy chủ; đã khóa giao diện tại đây. Khi có mạng, cần đăng xuất lại trong PWA hoặc quản lý phiên trên Windows.');}
  finally{deviceVault.lock();clear();lockCache();await refreshVaultUI();cacheStatus('Đã khóa bản sao ngoại tuyến. Đăng nhập để mở lại.');}
});});
$('#migrationAdd').addEventListener('click',()=>{
 const host=$('#migrationPasswords'),n=host.querySelectorAll('input').length;if(n>=7)return;
 const label=document.createElement('label'),input=document.createElement('input');input.id='legacyPassword'+n;label.htmlFor=input.id;label.textContent='Mật khẩu cũ khác '+n;input.type='password';input.maxLength=256;input.autocomplete='off';host.append(label,input);
});
$('#migrationForm').addEventListener('submit',event=>{
 event.preventDefault();if(busy||cacheBusy||!client?.authenticated||!deviceVault.needsMigration())return;
 const passwords=[...$('#migrationPasswords').querySelectorAll('input')].map(x=>x.value).filter(Boolean);clearMigrationInputs();
 if(!passwords.length){set('#migrationStatus','Nhập mật khẩu cũ cần chuyển đổi.');return;}
 perform(async()=>{try{set('#migrationStatus','Đang kiểm tra và chuyển đổi; không đóng ứng dụng.');
 const count=await deviceVault.migrate(passwords,()=>!!client?.authenticated&&!document.hidden&&(!rememberedUntil||Date.now()<rememberedUntil));
 cacheExists=await cache.exists();await refreshVaultUI();cacheStatus(`Đã chuyển đổi ${count} mục mã hóa. Không cần mật khẩu phụ nữa.`);set('#migrationStatus','');
 }catch(e){set('#migrationStatus',e.message);cacheStatus('Chưa hoàn tất chuyển đổi. Không xóa kho cũ.');}finally{passwords.fill('');}});
});
$('#legacyView').addEventListener('click',()=>cacheTask(async()=>{
 const host=$('#legacyRows'),g=cacheGeneration;host.replaceChildren();const secret=deviceVault.secret();const rows=[];
 for(const [k,r] of await readVaultEntries()){if(!/^DEMO-00[123]$/.test(k))continue;const d=(await decodeEntry(k,r,[secret])).value;rows.push(d);}
 if(g!==cacheGeneration||!deviceVault.ready()||document.hidden)return;
 for(const d of rows){const p=document.createElement('p');p.textContent=`${d.vehicleId} · ${d.inspectionDue||'Chưa có hạn'} · ${d.notes}`;host.append(p);}if(!rows.length)host.textContent='Không có bản nháp minh họa cũ.';
}));
$('#cacheSave').addEventListener('click',()=>cacheTask(async()=>{
 if(!client?.authenticated||!client.snapshot)throw Error('Cần đăng nhập và tải hồ sơ trước.');
 const p=deviceVault.secret();
 const snapshot=client.snapshot;await cache.save(p,snapshot);lockCache();cacheStatus('Đã lưu bản sao mã hóa. Có thể mở ngoại tuyến không cần mật khẩu phụ.');
}));
$('#cacheOpen').addEventListener('click',()=>cacheTask(async()=>{
 const p=deviceVault.secret();lockCache();const generation=cacheGeneration;
 const data=await cache.open(p);if(generation!==cacheGeneration)return;renderCache(data);cacheStatus('Đã mở bản sao cũ; không xác nhận phiên máy chủ.');
}));
$('#cacheLock').addEventListener('click',()=>{lockCache();cacheStatus('Đã khóa bản sao ngoại tuyến.');});
$('#cacheDelete').addEventListener('click',()=>{if(confirm('Xóa bản sao hồ sơ Windows trên iPhone? Không xóa bản nháp hay dữ liệu Windows.'))cacheTask(async()=>{await cache.open(deviceVault.secret());await cache.remove();lockCache();cacheStatus('Đã xóa bản sao.');});});
document.addEventListener('visibilitychange',()=>{if(document.hidden)lockCache()});
for(const sel of buttons)$(sel).disabled=true;
try{ensureNativePlugin(window.Capacitor);nativeReady=true;status('Native HTTP sẵn sàng. Nhập tài khoản DEMO, chỉ gửi khi đã xác nhận.');}
catch{status('Đang xem trên trình duyệt/Windows: đăng nhập API bị khóa để tránh gửi mật khẩu sai nguồn. Chỉ thử bằng IPA trên iPhone.');}
showState();
initEditUI(nativeReady);
configureAutoReady(()=>nativeReady&&!busy&&!cacheBusy&&!!client?.authenticated&&(!rememberedUntil||Date.now()<rememberedUntil));
configureDraftSend(async d=>{
 if(busy||cacheBusy||!client?.authenticated)throw Error('Cần đăng nhập DEMO và không có thao tác khác đang chạy.');
 busy=true;showState();
 try{const receipt=await submitDraft(client,d);client.snapshot=null;clear();status('Windows xác nhận. Phiên bản mới sẽ được đọc trước lần gửi tiếp theo.');return receipt;}
 catch(e){if(['UNAUTHORIZED','FORBIDDEN','WRONG_DATASET','BAD_REDIRECT','BAD_SHAPE'].includes(e.code)){cancelAutoSync();client.clearLocal();clear();await invalidateRemembered();}throw e;}
 finally{busy=false;showState();}
});

configureConflictRead(async()=>{
 if(busy||cacheBusy||!client?.authenticated)throw Error('Cần đăng nhập DEMO và không có thao tác khác đang chạy.');
 busy=true;showState();try{const fresh=await client.refresh();render(fresh);status('Đã tải phiên bản Windows mới để đối chiếu. Chưa ghi dữ liệu.');return fresh;}
 catch(e){if(!client?.authenticated){cancelAutoSync();clear();if(['UNAUTHORIZED','FORBIDDEN','WRONG_DATASET','BAD_REDIRECT','BAD_SHAPE'].includes(e.code))await invalidateRemembered();}throw e;}finally{busy=false;showState();}
});
async function invalidateRemembered(){
 restoreAllowed=false;cancelAutoSync();client?.clearLocal();clear();deviceVault.lock();lockCache();
 try{await rememberedSession.forget();rememberedUntil=0;forgetFailed=false;}catch{forgetFailed=true;status('Phiên không hợp lệ; chưa xóa được phiên ghi nhớ. Hãy đăng xuất lại.');}
 await refreshVaultUI();
}
async function restoreLogin(){
 if(!nativeReady||!restoreAllowed||busy||cacheBusy||client?.authenticated||document.hidden)return;
 await perform(async()=>{
  let result;
  try{result=await rememberedSession.restore(requireClient(),{online:navigator.onLine!==false});}
  catch(e){await invalidateRemembered();throw e;}
  if(result.kind==='login'){if(deviceVault.ready())await invalidateRemembered();rememberedUntil=0;status('Cần đăng nhập tài khoản DEMO.');return;}
  rememberedUntil=result.expiresAt;
  if(result.kind==='online')render(result.snapshot);
  status(result.kind==='online'?'Đã khôi phục phiên Windows, không cần nhập mật khẩu.':'Đang ngoại tuyến: chỉ mở dữ liệu cục bộ, chưa xác thực Windows.');
  try{if(!deviceVault.ready())await deviceVault.unlock();await refreshVaultUI();cacheExists=await cache.exists();cacheStatus('Kho mã hóa đã sẵn sàng.');}catch(e){cacheStatus(e.message);}
 });
}
$('#resumeLogin').addEventListener('click',()=>void restoreLogin());
window.addEventListener('online',()=>void restoreLogin());
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(rememberedUntil&&Date.now()>=rememberedUntil)void expireLocal();else void restoreLogin();}});
async function expireLocal(){if(busy||cacheBusy)return;await perform(async()=>{await invalidateRemembered();status('Phiên ghi nhớ đã hết hạn. Đăng nhập lại để mở kho.');});}
setInterval(()=>{if(!forgetFailed&&rememberedUntil&&Date.now()>=rememberedUntil)void expireLocal();},1000);
if(nativeReady)cache.exists().then(v=>{cacheExists=v;cacheStatus(v?'Có bản sao mã hóa. Đăng nhập hoặc khôi phục phiên để mở.':'Chưa có bản sao. Đăng nhập rồi lưu hồ sơ.');showState();return restoreLogin();}).catch(()=>cacheStatus('Không đọc được kho ngoại tuyến.'));
