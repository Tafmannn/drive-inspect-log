// Offline catalogue fingerprint comparison. Never connects to a database.
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
function compare(expected,actual){
 const key=x=>x.kind+":"+x.object;
 const a=new Map(),b=new Map();
 for(const [rows,map] of [[expected,a],[actual,b]]){if(!Array.isArray(rows)||!rows.length)throw Error("Empty catalogue");for(const row of rows){if(!row.kind||!row.object||!Number.isInteger(row.entries)||row.entries<1||!/^[a-f0-9]{32}$/.test(row.hash)||map.has(key(row)))throw Error("Invalid or duplicate catalogue entry");map.set(key(row),row)}}
 return {missing:[...a.keys()].filter(k=>!b.has(k)).sort(),different:[...a.keys()].filter(k=>b.has(k)&&(a.get(k).hash!==b.get(k).hash||a.get(k).entries!==b.get(k).entries)).sort(),extra:[...b.keys()].filter(k=>!a.has(k)).sort()};
}
if(process.argv.includes("--self-test")){
 const z={kind:"columns",object:"test",entries:1,hash:"0".repeat(32)},y={...z,hash:"1".repeat(32)},v={...z,object:"extra"};
 assert.deepEqual(compare([z],[z]),{missing:[],different:[],extra:[]});
 assert.equal(compare([z],[y]).different.length,1);
 assert.deepEqual(compare([z],[v]),{missing:["columns:test"],different:[],extra:["columns:extra"]});
 assert.throws(()=>compare([z,z],[z]));assert.throws(()=>compare([], [z]));
 console.log("PASS: catalogue comparison");process.exit(0);
}
try {
 if(process.argv.length!==4)throw Error("Usage: node scripts/staging/phase00-catalogue-compare.mjs <baseline.json> <staging.json>");
 const expected=JSON.parse(readFileSync(process.argv[2],"utf8")),actual=JSON.parse(readFileSync(process.argv[3],"utf8"));
 const result=compare(expected,actual);
 console.log(JSON.stringify(result,null,2));
 if(Object.values(result).some(v=>v.length)){console.error("BLOCKED: catalogue differences require reconciliation or reviewed exception");process.exitCode=2;}
 else console.log("Catalogue fingerprints match; backup, runtime and provider isolation gates still required.");
}catch{console.error("BLOCKED: invalid or unavailable catalogue");process.exitCode=2;}
