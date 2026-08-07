import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import { parseKnowledgeProjection } from './knowledge-model';

const PATHS=[process.env.KNOWLEDGE_INDEX_FILE||'', '/workspace/mission-control/runtime/knowledge-index.json', '/workspace-data/mission-control/runtime/knowledge-index.json', '/var/www/mission-control/runtime/knowledge-index.json', '/app/runtime/knowledge-index.json'].filter(Boolean);
export const dynamic='force-dynamic';

export async function GET(req:Request){
  const authErr=requireSessionAuth(req);if(authErr)return authErr;
  for(const path of PATHS){try{const projection=parseKnowledgeProjection(JSON.parse(await readFile(path,'utf8')));return NextResponse.json({ok:true,...projection},{headers:{'Cache-Control':'no-store'}});}catch{}}
  return NextResponse.json({ok:false,error:'Knowledge projection unavailable. The private vault is never read directly by Mission Control.'},{status:503,headers:{'Cache-Control':'no-store'}});
}

