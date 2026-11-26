// Explicitly approved retry, foreground only; never persists credentials or drafts.
export function createAutoSync({now=()=>Date.now(),ready,send,onStatus=()=>{},ttl=120000,maxAttempts=3,delay=15000}){
 let pending=null,running=false;
 function cancel(reason='Đã hủy tự gửi. Bản nháp vẫn lưu trên iPhone.'){
  if(pending){pending=null;onStatus(running?reason+' Yêu cầu đã bắt đầu có thể vẫn hoàn tất; kiểm tra biên nhận trước khi gửi lại.':reason);}
 }
 function arm(action){
  if(running||pending)throw Error('Đã có hàng đợi tự gửi. Hủy trước khi chọn bản khác.');
  if(typeof action!=='function')throw Error('Thiếu thao tác đã xác nhận.');
  pending={action,expires:now()+ttl,attempts:0,next:now()};onStatus('Đã cho phép tự gửi các bản nháp đã chọn khi có mạng; tối đa 2 phút, chỉ khi ứng dụng đang mở.');
 }
 async function tick(){
  if(!pending||running)return;
  if(now()>=pending.expires){cancel('Hết thời gian chờ; bản nháp vẫn lưu. Cần xác nhận lại.');return;}
  if(!ready()||now()<pending.next)return;
  const job=pending;running=true;job.attempts++;
  try{const result=await send(job.action);if(pending===job){pending=null;onStatus(typeof result==='string'?result:'Windows đã xác nhận; bản nháp mã hóa vẫn được giữ.');}}
  catch(e){if(pending===job){if(e?.code==='NETWORK'&&job.attempts<maxAttempts&&now()<job.expires){job.next=now()+delay;onStatus('Mất kết nối; sẽ thử lại trong phiên này. Bản nháp vẫn lưu.');}else{pending=null;onStatus(e?.code==='CONFLICT'?'Windows đã thay đổi; cần đối chiếu thủ công.':(e?.message||'Chưa xác nhận lưu Windows.')+' Bản nháp vẫn lưu; cần kiểm tra lại.');}}}
  finally{running=false;}
 }
 return {arm,cancel,tick,get pending(){return !!pending},get running(){return running}};
}
