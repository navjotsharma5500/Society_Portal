import {Trash2} from 'lucide-react'
import {Badge,Card,IconButton} from '../../../design-system'
import {claimTitle} from '../utils/onboardingFormatters'
import SocietyClaimForm from './SocietyClaimForm'
export default function SocietyClaimCard({index,claim,claims,societies,roles,onChange,onSave,onDelete,eventsOnly=false}){const canDelete=(!claim._id||claim.status==='DRAFT')&&!eventsOnly;return <Card className="society-claim-card" title={`Society ${index+1} · ${claimTitle(claim,societies)}`} description={eventsOnly?'Optional events and contributions':claim._id?'Saved draft claim':'New unsaved claim'} actions={<div className="claim-card-actions"><Badge tone={claim.dirty?'warning':'success'}>{claim.dirty?'Unsaved':'Draft saved'}</Badge>{canDelete&&<IconButton label={`Delete society claim ${index+1}`} onClick={onDelete}><Trash2 size={16}/></IconButton>}</div>}><SocietyClaimForm {...{claim,claims,societies,roles,onChange,onSave,eventsOnly}}/></Card>}
