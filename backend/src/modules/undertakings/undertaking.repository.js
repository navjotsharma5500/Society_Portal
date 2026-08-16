const Undertaking=require('./undertaking.model'),Acceptance=require('./undertakingAcceptance.model')
const list=(filter={})=>Undertaking.find(filter).sort({createdAt:-1}).lean()
const get=id=>Undertaking.findById(id)
const create=data=>Undertaking.create(data)
const update=(id,data)=>Undertaking.findByIdAndUpdate(id,{$set:data},{returnDocument:'after',runValidators:true})
const accept=data=>Acceptance.findOneAndUpdate({userId:data.userId,undertakingId:data.undertakingId,undertakingVersion:data.undertakingVersion},{$setOnInsert:data},{upsert:true,returnDocument:'after'})
const acceptances=userId=>Acceptance.find({userId}).populate('undertakingId','title version scope').sort({acceptedAt:-1}).lean()
module.exports={list,get,create,update,accept,acceptances,Undertaking,Acceptance}
