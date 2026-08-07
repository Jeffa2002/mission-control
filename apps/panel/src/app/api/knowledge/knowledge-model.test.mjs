import assert from 'node:assert/strict';
import test from 'node:test';
import { parseKnowledgeProjection } from './knowledge-model.ts';

const valid=()=>({schemaVersion:1,generatedAt:'2026-08-08T00:00:00Z',source:{status:'healthy',mode:'sanitized-projection',allowedRoots:['01-Projects']},stats:{documents:1,areas:1},documents:[{id:'01-Projects/Mission Control',path:'01-Projects/Mission Control.md',area:'01-Projects',title:'Mission Control',type:'project',status:'active',updated:'2026-08-08',tags:['project'],excerpt:'Private operations console.',body:'# Mission Control'}]});
test('accepts the bounded sanitized projection',()=>assert.equal(parseKnowledgeProjection(valid()).documents[0].title,'Mission Control'));
test('rejects forbidden and unknown fields',()=>assert.throws(()=>parseKnowledgeProjection({...valid(),transcript:'private'}),/not allowed/));
test('rejects traversal and mismatched counts',()=>{const traversal=valid();traversal.documents[0].path='../secret.md';assert.throws(()=>parseKnowledgeProjection(traversal),/identity/);const count=valid();count.stats.documents=2;assert.throws(()=>parseKnowledgeProjection(count),/stats/);});

