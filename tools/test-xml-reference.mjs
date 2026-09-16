import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {xml_document} from '../web/engine.mjs';
const vectors=JSON.parse(await readFile(new URL('../evidence/xml-reference-vectors.json',import.meta.url)));
function normalize(root){
  const content=[];
  for(const item of root.content){
    if(typeof item==='string'){if(!item)continue;if(typeof content.at(-1)==='string')content[content.length-1]+=item;else content.push(item);}
    else content.push(normalize(item));
  }
  return {...root,attributes:root.attributes.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),content};
}
for(const test of vectors.cases){
  const result=xml_document(test.source);
  if(test.rejected)assert.match(result,/^ERROR:/,test.source);
  else {
    assert(!result.startsWith('ERROR:'),result+' '+test.source);
    const parsed=JSON.parse(result);assert.deepEqual(normalize(parsed.root),normalize(test.root),test.source);
    assert.deepEqual(normalize(JSON.parse(xml_document(parsed.xml)).root),normalize(test.root),'serialized infoset roundtrip');
  }
}
for(const source of ['<!DOCTYPE r><r/>','<!DOCTYPE r [<!ENTITY e "value">]><r>&e;</r>','<?xml version="1.1"?><r/>','<r>'.repeat(34)+'</r>'.repeat(34),'<r>'+'<a/>'.repeat(10001)+'</r>','<r>'+'x'.repeat(1048576)+'</r>'])assert.match(xml_document(source),/^ERROR:/);
const sha=file=>readFile(new URL('../'+file,import.meta.url)).then(x=>createHash('sha256').update(x).digest('hex'));
const sourceSha256={};for(const file of ['xml.mbt','cmd/web/authoring.mbt','web/engine.mjs','tools/test-xml-reference.mjs','tools/xml-reference.py','evidence/xml-reference-vectors.json'])sourceSha256[file]=await sha(file);
await writeFile(new URL('../evidence/xml-reference-validation.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),oracle:vectors.oracle,python:vectors.python,passed:vectors.cases.length,additionalPolicyAndBoundsCases:6,sourceSha256},null,2)+'\n');
console.log(`${vectors.cases.length} independent ElementTree XML vectors + 6 policy/bound cases passed`);
