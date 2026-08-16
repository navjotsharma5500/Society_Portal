export const initials=name=>(name||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()
export const display=value=>value===null||value===undefined||String(value).trim()===''?'Not available':value
export const formatDate=value=>value?new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'Not available'
export const cleanPayload=data=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='string'?v.trim():v]).filter(([,v])=>v!==''&&v!==undefined))
export const friendlyStudentError=error=>({STUDENT_EMAIL_EXISTS:'A student with this email already exists.',USER_EMAIL_EXISTS:'A linked user with this email already exists.',STUDENT_ROLL_NUMBER_EXISTS:'A student with this roll number already exists.',STUDENT_IMPORT_SESSION_ALREADY_USED:'This import session has already been confirmed.'}[error?.errorCode]||'Unable to complete this student action. Please try again.')
