import {Card} from '../../../design-system'
import {valueOrNA} from '../utils/onboardingFormatters'
const fields=[['Name','name'],['Email','email'],['Roll Number','rollNumber'],['Contact Number','contactNumber'],['Course','course'],['Branch','branch'],['Year','year'],['Hostel','hostel'],['Room Number','roomNumber']]
export default function InstitutionalDetailsCard({student}){return <Card title="Institutional details" description="Review the information maintained in your student record."><dl className="institutional-grid">{fields.map(([label,key])=><div key={key}><dt>{label}</dt><dd>{valueOrNA(student?.[key])}</dd></div>)}</dl><p className="institutional-note">These details are maintained by the administrator. You may request a correction after onboarding.</p></Card>}
