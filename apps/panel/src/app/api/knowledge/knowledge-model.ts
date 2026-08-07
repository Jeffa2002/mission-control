export type KnowledgeDocument = { id:string; path:string; area:string; title:string; type:string; status:string; updated:string|null; tags:string[]; excerpt:string; body:string };
export type KnowledgeProjection = { schemaVersion:1; generatedAt:string; source:{status:'healthy';mode:'sanitized-projection';allowedRoots:string[]}; stats:{documents:number;areas:number}; documents:KnowledgeDocument[] };

const ROOT_KEYS=new Set(['schemaVersion','generatedAt','source','stats','documents']);
const SOURCE_KEYS=new Set(['status','mode','allowedRoots']);
const STATS_KEYS=new Set(['documents','areas']);
const DOC_KEYS=new Set(['id','path','area','title','type','status','updated','tags','excerpt','body']);
const FORBIDDEN_KEY=/(?:prompt|reasoning|thinking|credential|secret|password|token|tool.?input|tool.?output|transcript|environment|command)/i;
const ID=/^[A-Za-z0-9][A-Za-z0-9 ./_&()-]{0,199}$/;
function object(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
function keys(value:Record<string,unknown>,allowed:Set<string>,path:string){for(const key of Object.keys(value)){if(FORBIDDEN_KEY.test(key)||!allowed.has(key))throw new Error(`${path}.${key} is not allowed`);}}
function string(value:unknown,path:string,max:number){if(typeof value!=='string'||value.length>max)throw new Error(`${path} is invalid`);return value;}
function timestamp(value:unknown,path:string){const result=string(value,path,40);if(!Number.isFinite(Date.parse(result)))throw new Error(`${path} is invalid`);return result;}

export function parseKnowledgeProjection(value:unknown):KnowledgeProjection{
  if(!object(value))throw new Error('projection must be an object');keys(value,ROOT_KEYS,'projection');
  if(value.schemaVersion!==1||!object(value.source)||!object(value.stats)||!Array.isArray(value.documents))throw new Error('projection contract is invalid');
  keys(value.source,SOURCE_KEYS,'projection.source');keys(value.stats,STATS_KEYS,'projection.stats');
  if(value.source.status!=='healthy'||value.source.mode!=='sanitized-projection'||!Array.isArray(value.source.allowedRoots))throw new Error('projection source is invalid');
  const allowedRoots=value.source.allowedRoots.map((item,index)=>string(item,`allowedRoots[${index}]`,60));
  const documents=value.documents.map((candidate,index):KnowledgeDocument=>{
    const at=`documents[${index}]`;if(!object(candidate))throw new Error(`${at} must be an object`);keys(candidate,DOC_KEYS,at);
    const id=string(candidate.id,`${at}.id`,200);const path=string(candidate.path,`${at}.path`,220);const area=string(candidate.area,`${at}.area`,60);
    if(!ID.test(id)||path.includes('..')||!path.endsWith('.md')||!allowedRoots.includes(area)||!path.startsWith(`${area}/`))throw new Error(`${at} identity is invalid`);
    if(!Array.isArray(candidate.tags)||candidate.tags.length>12)throw new Error(`${at}.tags is invalid`);
    return {id,path,area,title:string(candidate.title,`${at}.title`,120),type:string(candidate.type,`${at}.type`,40),status:string(candidate.status,`${at}.status`,40),updated:candidate.updated==null?null:string(candidate.updated,`${at}.updated`,40),tags:candidate.tags.map((tag,tagIndex)=>string(tag,`${at}.tags[${tagIndex}]`,40)),excerpt:string(candidate.excerpt,`${at}.excerpt`,260),body:string(candidate.body,`${at}.body`,24_000)};
  });
  const documentCount=Number(value.stats.documents),areaCount=Number(value.stats.areas);
  if(!Number.isInteger(documentCount)||documentCount!==documents.length||!Number.isInteger(areaCount)||areaCount<0)throw new Error('projection stats are invalid');
  return {schemaVersion:1,generatedAt:timestamp(value.generatedAt,'generatedAt'),source:{status:'healthy',mode:'sanitized-projection',allowedRoots},stats:{documents:documentCount,areas:areaCount},documents};
}

