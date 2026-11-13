const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../privacy-manager.js'), 'utf8');
const NOW = Date.UTC(2026, 10, 14), TTL = 180 * 86400000;
const record = (overrides={}) => JSON.stringify({version:'2026-11-14',preferences:true,savedAt:NOW,expiresAt:NOW+TTL,...overrides});
function harness(initial={}, unavailable=false) {
 const data=new Map(Object.entries(initial)), listeners={}, writes=[];
 const storage={getItem(k){if(unavailable)throw Error('blocked');return data.get(k)??null;},setItem(k,v){if(unavailable)throw Error('blocked');writes.push(k);data.set(k,v);},removeItem(k){if(unavailable)throw Error('blocked');data.delete(k);}};
 let now=NOW;
 const window={addEventListener(name,callback){listeners[name]=callback;},dispatchEvent(){}};
 const document={readyState:'loading',hidden:false,addEventListener(){}};
 vm.runInNewContext(source,{window,document,localStorage:storage,Date:class extends Date{static now(){return now;}},Map,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
 return {api:window.HoliBuddyPrivacy,data,writes,listeners,setTime(t){now=t;}};
}
test('no choice means no optional persistence and removes legacy preference keys only',()=>{
 const h=harness({'hb-locale':'en-GB','hb-currency':'USD','hb-fx':'old','hb.account.testdata.v1':'existing-profile'});
 assert.equal(h.api.getPreference('hb-locale'),null);
 h.api.setPreference('hb-locale','tr');
 assert.equal(h.api.getPreference('hb-locale'),'tr');
 assert.equal(h.data.has('hb-locale'),false);
 assert.equal(h.data.has('hb-fx'),false);
 assert.equal(h.data.get('hb.account.testdata.v1'),'existing-profile');
 assert.equal(h.writes.length,0);
 assert.equal(h.api.allows('analytics'),false);
 assert.equal(h.api.allows('marketing'),false);
});
test('valid preference permission restores and persists allowed keys only',()=>{
 const h=harness({'hb-consent.v1':record(),'hb-locale':'en-GB'});
 assert.equal(h.api.getPreference('hb-locale'),'en-GB');
 h.api.setPreference('hb-currency','EUR');
 assert.equal(h.data.get('hb-currency'),'EUR');
 h.api.setPreference('unrelated','x');assert.equal(h.data.has('unrelated'),false);
 h.api.getChoice().preferences=false;assert.equal(h.api.allows('preferences'),true);
});
test('reject, expired, changed-version and malformed records fail closed',()=>{
 for(const value of [record({preferences:false}),record({savedAt:NOW-TTL,expiresAt:NOW}),record({version:'old'}),record({expiresAt:NOW+TTL*50}),record({preferences:'true'}),'{broken']){
  const h=harness({'hb-consent.v1':value,'hb-currency':'USD'});
  assert.equal(h.api.allows('preferences'),false);
  assert.equal(h.api.getPreference('hb-currency'),null);
  assert.equal(h.data.has('hb-currency'),false);
 }
});
test('permission expires in an open page and cross-tab revocation stops writes',()=>{
 const h=harness({'hb-consent.v1':record(),'hb-locale':'en-GB'});
 h.setTime(NOW+TTL+1);assert.equal(h.api.allows('preferences'),false);assert.equal(h.data.has('hb-locale'),false);
 const other=harness({'hb-consent.v1':record(),'hb-currency':'EUR'});
 other.data.set('hb-consent.v1',record({preferences:false}));other.listeners.storage({key:'hb-consent.v1'});
 other.api.setPreference('hb-currency','USD');assert.equal(other.data.has('hb-currency'),false);
});
test('blocked storage does not break current-page language/currency selection',()=>{
 const h=harness({},true);h.api.setPreference('hb-currency','USD');
 assert.equal(h.api.getPreference('hb-currency'),'USD');assert.equal(h.api.allows('preferences'),false);
});
test('all served pages load gating before app code, and checkout cache is session-only',()=>{
 const root=path.join(__dirname,'..');
 for(const name of fs.readdirSync(root).filter(x=>x.endsWith('.html')&&x!=='holibuddy.html')){
  const html=fs.readFileSync(path.join(root,name),'utf8');
  assert.equal((html.match(/src="\/privacy-manager.js"/g)||[]).length,1,name);
  assert.ok(html.indexOf('src="/privacy-manager.js"')<html.indexOf('</head>'),name);
  assert.doesNotMatch(html,/localStorage\.(?:getItem|setItem)\("hb-(?:locale|currency)"/,name);
 }
 const checkout=fs.readFileSync(path.join(root,'checkout-web-preview.html'),'utf8');
 assert.doesNotMatch(checkout,/localStorage\.(?:getItem|setItem)\("hb-fx"/);
 assert.match(checkout,/sessionStorage\.setItem\("hb-fx"/);
});
