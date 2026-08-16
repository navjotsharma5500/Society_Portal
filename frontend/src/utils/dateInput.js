const DATE_ONLY=/^\d{4}-\d{2}-\d{2}$/
export function toDateInputValue(value){if(value===null||value===undefined||value==='')return'';if(typeof value==='string'){const datePart=value.slice(0,10),parsed=new Date(`${datePart}T00:00:00.000Z`);if(DATE_ONLY.test(datePart)&&!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===datePart)return datePart}if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);return''}
export function fromDateInputValue(value){return DATE_ONLY.test(String(value||''))?String(value):''}
