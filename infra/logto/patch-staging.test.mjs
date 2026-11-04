import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { patchGoogle, patchExperience } from './patch-staging.mjs';
test('native create-account link navigates to the chooser for both browser layouts',()=>{
 const patched=patchExperience('<TextLink replace to="/register" text="action.create_account" />','https://staging.campushomes.co.ug','consumer_app_id');
 assert(patched.includes('get("app_id") === "consumer_app_id"'));
 assert(patched.includes('href="https://staging.campushomes.co.ug/create-account"'));
 assert(patched.includes(': <TextLink replace to="/register"'));
 assert.throws(()=>patchExperience('unknown','https://staging.campushomes.co.ug','consumer_app_id'));
 assert.throws(()=>patchExperience('unknown','https://campushomes.co.ug','consumer_app_id'));
 assert.throws(()=>patchExperience('unknown','https://staging.campushomes.co.ug','invalid"id'));

});
test('provider timeouts get a recoverable connector error without leaking request data',()=>{
 const patched=patchGoogle('var defaultTimeout = 5e3; var getUserInfoErrorHandler = (error) => { throw error; };');
 class ConnectorError extends Error {constructor(code,data){super(data.errorDescription);this.code=code;}}
 const ctx={ConnectorError,ConnectorErrorCodes:{General:'general'}};vm.createContext(ctx);vm.runInContext(patched+'; this.handler=getUserInfoErrorHandler;this.timeout=defaultTimeout;',ctx);
 assert.equal(ctx.timeout,15000);
 assert.throws(()=>ctx.handler({name:'TimeoutError',code:'ETIMEDOUT',secret:'never reveal'}),e=>e.code==='general'&&e.message.includes('use email')&&!e.message.includes('never reveal'));
 const other=new Error('Other error');assert.throws(()=>ctx.handler(other),e=>e===other);
 assert.throws(()=>patchGoogle('different version'));
});
