const cache=require("./cacheService"),keys=require("./cacheKeys");
const namespace=(name)=>cache.delPattern(keys.namespaces[name]);
module.exports={sessions:()=>namespace("sessions"),settings:()=>namespace("settings"),departments:()=>namespace("departments"),buildings:()=>Promise.all([namespace("buildings"),namespace("venues")]),venues:()=>namespace("venues"),societies:()=>namespace("societies"),rbac:()=>namespace("rbac")};
