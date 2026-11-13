// Multi-select modality matching for `kloudy bots`.
// `--modality <m>` may be repeated. Default match is ANY (OR). `--all-modalities` switches to AND.
// `primary` / modality_primary is a sort hint only; it never filters.
// These 44 tags are the kloudy 1.0 bundled catalog modalities.
export const KNOWN_MODALITIES=['agent_tools','api_calls','audio','auth_encryption','browser_automation','chat_platforms','chat_ui','cli','cloud','code','code_execution','comms','data','data_analysis','database_access','document_processing','embedding','evaluation','file_system','finance','gpu_compute','image','image_generation','inference','maps','math','memory','multimodal','notifications','observability','orchestration','productivity','queues','rag','robotics','scheduling','search','security','simulation','text','translation','video','voice_generation','web'];

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
