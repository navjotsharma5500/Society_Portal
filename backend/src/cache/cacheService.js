const redis=require("./redisClient");
const metrics={hits:0,misses:0,errors:0,sets:0,invalidations:0},flights=new Map();
const use=async(fn,fallback=null)=>{try{const client=await redis.getClient();return client?await fn(client):fallback;}catch(_){metrics.errors++;return fallback;}};
const get=async(key)=>{const raw=await use((client)=>client.get(key));if(raw===null){metrics.misses++;return null;}try{metrics.hits++;return JSON.parse(raw);}catch(_){metrics.errors++;await del(key);if(process.env.NODE_ENV==="development")console.warn("[cache] malformed value ignored");return null;}};
const set=async(key,value,ttl)=>{const ok=await use((client)=>client.set(key,JSON.stringify(value),{EX:ttl}),null);if(ok)metrics.sets++;return Boolean(ok);};
const del=async(...keys)=>{if(!keys.length)return false;const result=await use((client)=>client.del(keys),null);if(result!==null)metrics.invalidations++;return result!==null;};
const delPattern=async(prefix)=>{const result=await use(async(client)=>{let count=0;for await(const keys of client.scanIterator({MATCH:`${prefix}*`,COUNT:100})){const list=Array.isArray(keys)?keys:[keys];if(list.length){await client.del(list);count+=list.length;}}return count;},null);if(result!==null)metrics.invalidations++;return result;};
const getOrLoad=async(key,ttl,loader)=>{const cached=await get(key);if(cached!==null)return cached;if(flights.has(key))return flights.get(key);const promise=Promise.resolve().then(loader).then(async(value)=>{await set(key,value,ttl);return value;}).finally(()=>flights.delete(key));flights.set(key,promise);return promise;};
module.exports={get,set,del,delPattern,getOrLoad,metrics:()=>({...metrics}),_resetMetrics:()=>Object.keys(metrics).forEach(key=>metrics[key]=0)};
