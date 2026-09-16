export function portalData(data,email,role){
 const records=role==='customer'?data.approvals.filter(r=>r.email.toLowerCase()===email):data.tasks.filter(r=>r.owner.toLowerCase()===email);
 const ids=new Set(records.map(r=>r.event));
 return {events:data.events.filter(r=>ids.has(r.id)).map(({id,name,date,venue,client})=>({id,name,date,venue,client})),...(role==='customer'?{approvals:records}:{tasks:records,invoiceSubmissions:(data.invoiceSubmissions||[]).filter(r=>r.owner===email),fieldReports:data.fieldReports.filter(r=>r.owner.toLowerCase()===email&&ids.has(r.event))})};
}
