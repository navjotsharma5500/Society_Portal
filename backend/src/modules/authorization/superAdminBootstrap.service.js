const AppError=require('../../common/errors/AppError'),environment=require('../../config/environment'),User=require('../users/user.model'),Role=require('../roles/role.model'),Assignment=require('../userRoleAssignments/userRoleAssignment.model');
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const allowed=email=>environment.superAdminEmails.includes(normalizeEmail(email));
const bootstrapSuperAdmins=async()=>{
  if(!environment.superAdminEmails.length)throw new AppError('SUPER_ADMIN_EMAILS is not configured',500,'SUPER_ADMIN_ALLOWLIST_MISSING');
  const roles=await Role.find({code:'SUPER_ADMIN'});
  if(roles.length!==1)throw new AppError('Exactly one SUPER_ADMIN system role must exist',500,'SUPER_ADMIN_ROLE_INVALID');
  const role=roles[0];
  const existing=await User.find({email:{$in:environment.superAdminEmails}});
  const conflicts=existing.filter(user=>user.accountType==='STUDENT');
  if(conflicts.length)throw new AppError(`SUPER_ADMIN identity conflict: ${conflicts.map(user=>user.email).join(', ')}`,409,'SUPER_ADMIN_IDENTITY_CONFLICT');
  await Role.updateOne({_id:role._id},{$set:{name:'Super Admin',code:'SUPER_ADMIN',category:'SYSTEM',scopeType:'GLOBAL',rank:1000,dashboardKey:'SUPER_ADMIN_DASHBOARD',isSystemRole:true,isAssignable:false,status:'ACTIVE'}});
  const results=[];
  for(const email of environment.superAdminEmails){
    let user=existing.find(item=>normalizeEmail(item.email)===email),userCreated=false;
    if(!user){user=await User.create({email,displayName:email.split('@')[0].replace(/[._]/g,' '),accountType:'SUPER_ADMIN',status:'ACTIVE',isLoginAllowed:true});userCreated=true}
    else{user.status='ACTIVE';user.isLoginAllowed=true;await user.save()}
    const assignmentResult=await Assignment.updateOne({userId:user._id,roleId:role._id,scopeType:'GLOBAL',societyId:null,status:'ACTIVE',isOngoing:true},{$setOnInsert:{academicSession:null,isPrimary:true,assignmentSource:'SUPER_ADMIN',remarks:'Protected SUPER_ADMIN bootstrap assignment'}},{upsert:true});
    results.push({email,userId:user._id,userCreated,assignmentCreated:Boolean(assignmentResult.upsertedCount)});
  }
  return{role:{id:role._id,code:role.code},identities:results};
};
module.exports={bootstrapSuperAdmins,normalizeEmail,allowed};
