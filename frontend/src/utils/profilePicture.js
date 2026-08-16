const valid=value=>typeof value==='string'&&/^https?:\/\/\S+$/i.test(value.trim())
export const resolveProfilePicture=(user,student)=>[user?.profilePhotoUrl,student?.profilePictureUrl,user?.profilePictureUrl].find(valid)||undefined
