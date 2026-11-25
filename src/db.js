export const STORES=['programmes','days','exercises','sessions','sets','measurements','settings'];
let database;
export function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('workout-tracker',1);request.onupgradeneeded=()=>STORES.forEach(name=>{if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'})});request.onsuccess=()=>{database=request.result;resolve(database)};request.onerror=()=>reject(request.error)})}
export function all(name){return new Promise((resolve,reject)=>{const request=database.transaction(name).objectStore(name).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
export function get(name,id){return new Promise((resolve,reject)=>{const request=database.transaction(name).objectStore(name).get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
export function put(name,value){return new Promise((resolve,reject)=>{const tx=database.transaction(name,'readwrite');tx.objectStore(name).put(value);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Database transaction was aborted.'))})}
export function del(name,id){return new Promise((resolve,reject)=>{const tx=database.transaction(name,'readwrite');tx.objectStore(name).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Database transaction was aborted.'))})}
export function replaceAll(data){
 return new Promise((resolve,reject)=>{
  let tx,settled=false;
  const fail=error=>{if(!settled){settled=true;reject(error instanceof Error?error:new Error(String(error||'Database restore failed.')))}};
  try{
   for(const name of STORES){
    if(!Array.isArray(data[name]))throw new Error('Restore data is missing the "'+name+'" collection.');
    const ids=new Set();
    for(let i=0;i<data[name].length;i++){
     const row=data[name][i];
     if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id.trim())throw new Error('Invalid record in "'+name+'" at item '+(i+1)+': every record must have a non-empty ID.');
     if(ids.has(row.id))throw new Error('Duplicate ID "'+row.id+'" in "'+name+'".');
     ids.add(row.id);
    }
   }
   tx=database.transaction(STORES,'readwrite');
   tx.oncomplete=()=>{if(!settled){settled=true;resolve()}};
   tx.onerror=()=>fail(tx.error||new Error('The database rejected the restore.'));
   tx.onabort=()=>fail(tx.error||new Error('The database aborted the restore. Existing data was not replaced.'));
   for(const name of STORES){
    const store=tx.objectStore(name);
    store.clear();
    for(const row of data[name])store.put(row);
   }
  }catch(error){
   if(tx&&tx.readyState!=='done'){try{tx.abort()}catch{}}
   fail(error);
  }
 });
}
