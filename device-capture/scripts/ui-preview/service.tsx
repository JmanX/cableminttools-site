import { emptyBatch,type Device,type Project,type SaveAttempt } from '../../src/deviceWorkflow';
export const projects:Project[]=[{id:'demo-north',user_id:'demo-tech',name:'North Tower'},{id:'demo-service',user_id:'demo-tech',name:'Service Campus'}];
let devices:Device[]=Array.from({length:9},(_,i)=>({...emptyBatch,id:'demo-device-'+i,user_id:'demo-tech',project_id:i<7?'demo-north':'demo-service',building:i<7?'Tower A':'West',floor_area:'Level 2',unit_location:'Room '+(204+i),device_type:i%2?'Security Camera':'WAP',mac_address:'AA:BB:CC:11:22:'+String(i+10),serial_number:'DEMO-'+(i+100),verified:true,captured_at:new Date(Date.UTC(2026,9,4,14,i*4)).toISOString()}));
async function connection(){await new Promise(r=>setTimeout(r,850));if((globalThis as any).__offline)throw Error('Network unavailable. Retry when connected.');}
export const supabase={auth:{async signOut(){return {error:null};}}};
export class DuplicateDeviceError extends Error{constructor(public records:Device[]){super('Duplicate MAC or serial already captured in this project.');}}
export class SavePreflightError extends Error{}
export class ProjectCreateError extends Error{uncertain=false;}
export async function readPro(){await connection();return true;}
export async function loadProjects(){await connection();return projects;}
export async function loadHistory(){await connection();return [...devices];}
export async function loadDevices(_userId:string,id:string){await connection();return devices.filter(d=>d.project_id===id);}
export async function createProject(user_id:string,name:string,id:string){await connection();const p={id,name,user_id};projects.unshift(p);return p;}
export async function saveDevice(a:SaveAttempt){await connection();const dup=devices.filter(d=>d.project_id===a.project_id&&d.id!==a.id&&((a.draft.mac_address&&d.mac_address===a.draft.mac_address)||(a.draft.serial_number&&d.serial_number===a.draft.serial_number)));if(dup.length)throw new DuplicateDeviceError(dup);const d={...a.draft,id:a.id,user_id:a.user_id,project_id:a.project_id,captured_at:a.captured_at!,verified:true};devices=[d,...devices.filter(row=>row.id!==a.id)];return d;}
export async function deleteDevice(_user:string,_project:string,id:string){await connection();devices=devices.filter(d=>d.id!==id);}
