const {test}=require('node:test');const assert=require('node:assert/strict');const {observation,traits}=require('../js/features/interactive/farm-context');
test('NASA observations use matching coordinates and preserve missing data',()=>{
 const raw={lat:-12,lon:-75,dias:[{fecha:'20261110',tmed:30,suelo:50},{fecha:'20261112',tmed:0,suelo:null,lluvia:0,viento:8,tmin:-999}]};
 const result=observation(raw,{lat:-12,lon:-75});assert.equal(result.date,'20261112');assert.equal(result.temperature,0);assert.equal(result.rain,0);assert.equal(result.moisture,null);assert.equal(result.min,null);
 assert.equal(observation(raw,{lat:-11,lon:-75}),null);assert.equal(observation({dias:raw.dias},{lat:-12,lon:-75}),null);
});
test('planned maize has a different form and dimensions from potato',()=>{assert.equal(traits('maiz').form,'maize');assert.equal(traits('papa').form,'low');assert.ok(traits('maiz').height>traits('papa').height);});
