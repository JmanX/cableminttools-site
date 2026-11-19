// Browser preview only: synthetic evidence and cloud responses. Never shipped.
import { randomUUID } from './crypto';
import { evidencePath,type Gap,type Evidence,type ProjectFile } from '../../src/gapWorkflow';
const user='10000000-0000-4000-8000-000000000001',project='20000000-0000-4000-8000-000000000001';
let gaps:Gap[]=[],files:ProjectFile[]=[],deletions:any[]=[];
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#edf3f5"/><rect x="70" y="70" width="460" height="260" rx="20" fill="#20313b"/><path d="M120 170h360M120 210h360M120 250h360" stroke="#2fba85" stroke-width="12"/><text x="105" y="120" fill="white" font-family="sans-serif" font-size="23">Synthetic field photo</text></svg>');
async function connection(){await new Promise(r=>setTimeout(r,600));if((globalThis as any).__offline)throw Error('Network unavailable. Saved locally.');}
export async function loadGapCloud(){await connection();return {gaps:[...gaps],files:[...files],deletions:[...deletions]};}
export async function loadCalculationCounts(){await connection();return {[project]:2};}
export async function gapPhotoUrl(){return image;}
export const localEvidenceExists=()=>false;
export async function removeEvidence(){}
export async function addGapPhoto(_source:string,u:string,p:string,g:string){await new Promise(r=>setTimeout(r,350));const id=randomUUID();return {metadata:{id,user_id:u,project_id:p,entity_type:'gap',entity_id:g,storage_path:evidencePath(u,p,g,id),file_name:'synthetic.jpg',mime_type:'image/jpeg',file_size:140000,created_at:new Date().toISOString()},local_uri:'file:///documents/gap-evidence/'+u+'/'+g+'/'+id+'.jpg',state:'pending',error:'',retries:0} as Evidence;}
export const gapTransport={
 async saveGap(g:Gap){await connection();if(deletions.some(d=>d.gap_id===g.id))throw Error('Gap was deleted');gaps=[g,...gaps.filter(x=>x.id!==g.id)];return g;},
 async saveFile(f:Evidence){await connection();files=[f.metadata,...files.filter(x=>x.id!==f.metadata.id)];return f.metadata;},
 async deleteGap(g:Gap){await connection();deletions=[{user_id:g.user_id,project_id:g.project_id,gap_id:g.id,created_at:new Date().toISOString()},...deletions.filter(d=>d.gap_id!==g.id)];files=files.filter(f=>f.entity_id!==g.id);gaps=gaps.filter(x=>x.id!==g.id);},
 removeLocal:removeEvidence,
};
