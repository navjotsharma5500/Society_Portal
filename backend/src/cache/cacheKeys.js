const PREFIX="tiet";
module.exports=Object.freeze({
  currentSession:`${PREFIX}:portal:session:current`,
  settingsGeneral:`${PREFIX}:portal:settings:general`,
  departmentsActive:`${PREFIX}:master:departments:active`,
  buildingsActive:`${PREFIX}:master:buildings:active`,
  venuesActive:`${PREFIX}:master:venues:active`,
  societiesActive:`${PREFIX}:master:societies:active`,
  namespaces:{sessions:`${PREFIX}:portal:session:`,settings:`${PREFIX}:portal:settings:`,departments:`${PREFIX}:master:departments:`,buildings:`${PREFIX}:master:buildings:`,venues:`${PREFIX}:master:venues:`,societies:`${PREFIX}:master:societies:`,rbac:`${PREFIX}:rbac:`},
});
