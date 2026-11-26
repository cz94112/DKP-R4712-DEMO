// Manual native sync only. Local notes are never transmitted.
import {reviseEdit} from './offline-edits.js';
export async function draftPayload(d){
 d=reviseEdit(d,d.editedDue,d.note);
 if(d.baseDue===d.editedDue)throw Error('Không có thay đổi hạn đăng kiểm để gửi. Ghi chú chỉ lưu cục bộ.');
 const body={vehicle_id:d.id,base_revision:d.baseRevision,base_epoch:d.baseServerEpoch,base_due:d.baseDue,new_due:d.editedDue};
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)));
 return {...body,operation_id:Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')};
}
export async function submitDraft(client,d){
 if(!client?.authenticated)throw Error('Cần đăng nhập DEMO trước khi gửi.');
 const body=await draftPayload(d), r=await client.send('draft','POST',body);
 if(r?.ok!==true||r.operation_id!==body.operation_id||r.vehicle_id!==body.vehicle_id||r.inspectionDue!==body.new_due||!Number.isSafeInteger(r.revision)||r.revision!==body.base_revision+1||typeof r.duplicate_ack!=='boolean')throw Error('Chưa xác nhận biên nhận hợp lệ. Giữ bản nháp.');
 return r;
}
