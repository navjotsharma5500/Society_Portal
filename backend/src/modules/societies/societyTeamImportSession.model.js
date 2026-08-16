const mongoose=require("mongoose");
const schema=new mongoose.Schema({societyId:{type:mongoose.Schema.Types.ObjectId,ref:"Society",required:true,index:true},status:{type:String,enum:["PREVIEWED","IMPORTED"],default:"PREVIEWED"},rows:{type:[mongoose.Schema.Types.Mixed],default:[]},summary:mongoose.Schema.Types.Mixed,createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"},expiresAt:{type:Date,required:true},importedAt:Date},{timestamps:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports=mongoose.model("SocietyTeamImportSession",schema);
