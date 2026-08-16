import {Plus} from 'lucide-react'
import {Button} from '../../../design-system'
import {blankEvent} from '../utils/onboardingFormatters'
import EventParticipationForm from './EventParticipationForm'
export default function EventParticipationList({events,onChange,errors=[]}){const update=(index,patch)=>onChange(events.map((event,i)=>i===index?{...event,...patch}:event)),remove=index=>onChange(events.filter((_,i)=>i!==index));return <section className="events-list"><div className="section-heading"><div><h4>Add an Event (Optional)</h4><p>This information is optional and is used only for your certification record.</p></div></div>{events.map((event,index)=><EventParticipationForm key={event.localId} event={event} errors={errors[index]} onChange={patch=>update(index,patch)} onRemove={()=>remove(index)}/>)}<Button type="button" variant="outline" icon={Plus} onClick={()=>onChange([...events,blankEvent()])}>Add Another Event</Button></section>}
