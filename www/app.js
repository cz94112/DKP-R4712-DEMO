import {DEMO_URL,trustedEndpoint} from './validations.js';
const $=s=>document.querySelector(s);
const say=s=>{$('#networkResult').textContent=String(s)};
$('#probe').addEventListener('click',async()=>{
  if(!trustedEndpoint($('#endpoint').value)){say('Chỉ cho phép tên miền DEMO đã cấu hình, HTTPS hợp lệ.');return;}
  const button=$('#probe');button.disabled=true;say('Đang kiểm tra máy chủ DEMO qua HTTPS...');
  try {const url=DEMO_URL+'/healthz';let result;
    const native=window.Capacitor?.Plugins?.CapacitorHttp;
    if(native?.get){result=await native.get({url,connectTimeout:7000,readTimeout:7000,headers:{'Cache-Control':'no-store'}});}
    else {const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),7000);
      try{const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',signal:ctrl.signal});result={status:response.status}}finally{clearTimeout(t)}}
    say(result.status===200?'Máy chủ phản hồi HTTP 200. Chưa chứng minh đã đăng nhập.':`Máy chủ phản hồi HTTP ${result.status}; kiểm tra lại.`);
  } catch {say('Không kiểm tra được. Kiểm tra ngrok/HTTPS; trình duyệt Windows có thể giới hạn CORS, hãy thử bản iOS.');}
  finally{button.disabled=false;}
});
$('#openServer').addEventListener('click',async()=>{
  if(!trustedEndpoint($('#endpoint').value)){say('Tên miền DEMO không hợp lệ.');return;}
  const browser=window.Capacitor?.Plugins?.Browser;
  try{if(browser?.open)await browser.open({url:DEMO_URL});else window.open(DEMO_URL,'_blank','noopener,noreferrer');}
  catch{say('Không mở được trình duyệt; dùng Safari và nhập địa chỉ DEMO.');}
});
