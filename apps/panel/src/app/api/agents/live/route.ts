import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../../_session-auth';
import { loadLiveTelemetry } from './live-model';
export const dynamic='force-dynamic';
export async function GET(req:Request){const authErr=requireSessionAuth(req);if(authErr)return authErr;const telemetry=await loadLiveTelemetry();return NextResponse.json(telemetry??{schemaVersion:1,generatedAt:new Date().toISOString(),collector:{status:'unknown',startedAt:null,heartbeatAt:null,lastEventAt:null,rejectedEvents:0},events:[],work:[]},{headers:{'Cache-Control':'no-store'}});}
