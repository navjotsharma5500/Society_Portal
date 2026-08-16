const mongoose=require('mongoose'),{SCOPES}=require('./undertaking.constants')
const schema=new mongoose.Schema({undertakingId:{type:mongoose.Schema.Types.ObjectId,ref:'Undertaking',required:true,index:true},undertakingVersion:{type:String,required:true},userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},studentMasterId:{type:mongoose.Schema.Types.ObjectId,ref:'StudentMaster',index:true},acceptedAt:{type:Date,default:Date.now,immutable:true},scope:{type:String,enum:Object.values(SCOPES),required:true},metadata:{ipHash:String,userAgent:String,sessionId:String}},{timestamps:{createdAt:true,updatedAt:false}})
schema.index({userId:1,undertakingId:1,undertakingVersion:1},{unique:true})
module.exports=mongoose.model('UndertakingAcceptance',schema)
