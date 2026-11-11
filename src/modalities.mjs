// Multi-select modality matching for `kloudy bots`.
// `--modality <m>` may be repeated. Default match is ANY (OR). `--all-modalities` switches to AND.
// `primary` / modality_primary is a sort hint only; it never filters.
export const KNOWN_MODALITIES=['text','code','code_execution','embedding','image','image_generation','audio','voice_generation','video','multimodal','translation','search','database_access','file_system','browser_automation','api_calls','scheduling','notifications','auth_encryption','data_analysis','document_processing','robotics','agent_tools','web','data','cloud','finance','productivity','comms','security','maps'];

export function modalityWant(value){
  if(value==null||value==='')return [];
  const raw=Array.isArray(value)?value:[value];
  const out=[];
  for(const v of raw){
    for(const part of String(v).split(',')){
      const s=part.trim();
      if(s&&!out.includes(s))out.push(s);
    }
  }
  return out;
}

export function rowMatchesModalities(have,want,{all=false}={}){
  if(!want.length)return true;
  const set=Array.isArray(have)?have:[];
  return all?want.every(m=>set.includes(m)):want.some(m=>set.includes(m));
}

export function primarySortHint(primary,want){
  return primary&&want.includes(primary)?1:0;
}
