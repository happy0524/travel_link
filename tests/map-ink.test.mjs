import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inkSeed,inkRoute,inkNode} from '../src/map-ink.js';
test('ink uses stable visit/segment identities and exact route endpoints',()=>{
 const points=[{x:0,y:0},{x:100,y:60},{x:150,y:200}];
 assert.equal(inkSeed('a>b'),inkSeed('a>b'));
 const first=inkRoute(points,'a>b');assert.equal(first,inkRoute(points,'a>b'));
 assert.notEqual(first,inkRoute(points,'b>a'));assert.notEqual(first,inkRoute(points,'a>b',1,true));
 assert.ok(first.startsWith('M0,0'));assert.ok(first.endsWith('150,200'));
 assert.ok(!first.includes('NaN'));assert.equal(inkRoute([],'a'), '');
 assert.equal(inkRoute([{x:1,y:1},{x:1,y:1}],'a'),'M1,1');
 assert.deepEqual(points,[{x:0,y:0},{x:100,y:60},{x:150,y:200}]);
});
test('node outline is closed, stable and only subtly irregular',()=>{
 const path=inkNode('visit-a',17);assert.equal(path,inkNode('visit-a',17));
 assert.notEqual(path,inkNode('visit-b',17));assert.ok(path.endsWith(' Z'));
 assert.equal((path.match(/ Q/g)||[]).length,16);assert.ok(!path.includes('NaN'));
});
