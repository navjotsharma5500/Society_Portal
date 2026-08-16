import { useEffect, useState } from "react";
import { listAvailableVenues } from "../services/venueApi";
const Field = ({ label, children }) => (
  <label className="event-field">
    <span>{label}</span>
    {children}
  </label>
);
const Input = ({ value, onChange, ...props }) => (
  <input
    value={value || ""}
    onChange={(event) => onChange(event.target.value)}
    {...props}
  />
);
const add = (list, item) => [...(list || []), item];

export function EventDetailsSection({ form, set }) {
  const schedule = form.dailySchedule || [], [venues, setVenues] = useState([]);
  useEffect(() => { listAvailableVenues().then(setVenues).catch(() => setVenues([])); }, []);
  return (
    <section className="event-card">
      <h2>Event details & schedule</h2>
      <div className="event-grid">
        <Field label="Event title">
          <Input value={form.title} onChange={(value) => set("title", value)} />
        </Field>
        <Field label="Start date">
          <Input
            type="date"
            value={form.startDate}
            onChange={(value) => set("startDate", value)}
          />
        </Field>
        <Field label="End date">
          <Input
            type="date"
            value={form.endDate}
            onChange={(value) => set("endDate", value)}
          />
        </Field>
        <Field label="Venue preference (not a booking)">
          <select value={form.venueRequirement?.preferredVenueId || ""} onChange={(event) => { const selected = venues.find((x) => x._id === event.target.value); set("venueRequirement", { ...form.venueRequirement, required: Boolean(selected), preferredVenueId: selected?._id || "", preferredVenueName: selected?.name || "" }); }}><option value="">No venue preference</option>{venues.map((x) => <option key={x._id} value={x._id}>{x.name} · {x.buildingId?.name} · {x.venueType.replaceAll("_", " ")}</option>)}</select>
        </Field>
      </div>
      <Field label="Objective">
        <textarea
          value={form.objective || ""}
          onChange={(event) => set("objective", event.target.value)}
        />
      </Field>
      <h3>Daily schedule</h3>
      {schedule.map((row, index) => (
        <div className="event-row" key={index}>
          <Input
            type="date"
            value={row.date}
            onChange={(value) =>
              set(
                "dailySchedule",
                schedule.map((item, i) =>
                  i === index ? { ...item, date: value } : item
                )
              )
            }
          />
          <Input
            type="time"
            value={row.startTime}
            onChange={(value) =>
              set(
                "dailySchedule",
                schedule.map((item, i) =>
                  i === index ? { ...item, startTime: value } : item
                )
              )
            }
          />
          <Input
            type="time"
            value={row.endTime}
            onChange={(value) =>
              set(
                "dailySchedule",
                schedule.map((item, i) =>
                  i === index ? { ...item, endTime: value } : item
                )
              )
            }
          />
          <button
            type="button"
            onClick={() =>
              set(
                "dailySchedule",
                schedule.filter((_, i) => i !== index)
              )
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="event-secondary"
        onClick={() =>
          set(
            "dailySchedule",
            add(schedule, {
              date: form.startDate || "",
              startTime: "",
              endTime: "",
            })
          )
        }
      >
        Add day
      </button>
    </section>
  );
}

export function EventAnnexureSection({ form, set }) {
  const annexure = form.annexure || {},
    patch = (value) => set("annexure", { ...annexure, ...value }),
    speakers = annexure.speakers || [],
    flow = annexure.eventFlow || [];
  return (
    <section className="event-card">
      <h2>AE1 · Event concept</h2>
      <Field label="Concept">
        <textarea
          value={annexure.concept || ""}
          onChange={(e) => patch({ concept: e.target.value })}
        />
      </Field>
      <div className="event-grid">
        <Field label="Mode">
          <select
            value={annexure.mode || ""}
            onChange={(e) => patch({ mode: e.target.value })}
          >
            <option value="">Select</option>
            <option>ONLINE</option>
            <option>OFFLINE</option>
            <option>HYBRID</option>
          </select>
        </Field>
        <Field label="Target audience">
          <Input
            value={annexure.targetAudience}
            onChange={(value) => patch({ targetAudience: value })}
          />
        </Field>
      </div>
      <Field label="Expected outcomes">
        <textarea
          value={annexure.expectedOutcomes || ""}
          onChange={(e) => patch({ expectedOutcomes: e.target.value })}
        />
      </Field>
      <h3>Speakers</h3>
      {speakers.map((speaker, index) => (
        <div className="event-row" key={index}>
          <Input
            placeholder="Name"
            value={speaker.name}
            onChange={(value) =>
              patch({
                speakers: speakers.map((item, i) =>
                  i === index ? { ...item, name: value } : item
                ),
              })
            }
          />
          <Input
            placeholder="Profile / affiliation"
            value={speaker.affiliation}
            onChange={(value) =>
              patch({
                speakers: speakers.map((item, i) =>
                  i === index ? { ...item, affiliation: value } : item
                ),
              })
            }
          />
          <select
            value={speaker.approvalStatus || "PENDING"}
            onChange={(e) =>
              patch({
                speakers: speakers.map((item, i) =>
                  i === index
                    ? { ...item, approvalStatus: e.target.value }
                    : item
                ),
              })
            }
          >
            <option>PENDING</option>
            <option>APPROVED</option>
          </select>
          <button
            type="button"
            onClick={() =>
              patch({ speakers: speakers.filter((_, i) => i !== index) })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="event-secondary"
        onClick={() =>
          patch({
            speakers: add(speakers, {
              name: "",
              affiliation: "",
              approvalStatus: "PENDING",
            }),
          })
        }
      >
        Add speaker
      </button>
      <h3>Event flow</h3>
      {flow.map((row, index) => (
        <div className="event-row" key={index}>
          <Input
            placeholder="Component"
            value={row.component}
            onChange={(value) =>
              patch({
                eventFlow: flow.map((item, i) =>
                  i === index ? { ...item, component: value } : item
                ),
              })
            }
          />
          <Input
            placeholder="Description"
            value={row.description}
            onChange={(value) =>
              patch({
                eventFlow: flow.map((item, i) =>
                  i === index ? { ...item, description: value } : item
                ),
              })
            }
          />
          <button
            type="button"
            onClick={() =>
              patch({ eventFlow: flow.filter((_, i) => i !== index) })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="event-secondary"
        onClick={() =>
          patch({ eventFlow: add(flow, { component: "", description: "" }) })
        }
      >
        Add flow item
      </button>
    </section>
  );
}

export function EventPlanningSection({ form, set }) {
  const previous = form.previousEvents || [],
    budget = form.budget || { items: [] },
    items = budget.items || [];
  return (
    <section className="event-card">
      <h2>References, budget & contacts</h2>
      <h3>Previous events</h3>
      {previous.map((row, index) => (
        <div className="event-row" key={index}>
          <select
            value={row.source || "MANUAL"}
            onChange={(e) =>
              set(
                "previousEvents",
                previous.map((item, i) =>
                  i === index ? { ...item, source: e.target.value } : item
                )
              )
            }
          >
            <option>MANUAL</option>
            <option>SYSTEM</option>
          </select>
          <Input
            placeholder="Event title / reference"
            value={row.title}
            onChange={(value) =>
              set(
                "previousEvents",
                previous.map((item, i) =>
                  i === index ? { ...item, title: value } : item
                )
              )
            }
          />
          <Input
            type="number"
            placeholder="Budget used"
            value={row.budgetUsed}
            onChange={(value) =>
              set(
                "previousEvents",
                previous.map((item, i) =>
                  i === index ? { ...item, budgetUsed: Number(value) } : item
                )
              )
            }
          />
          <button
            type="button"
            onClick={() =>
              set(
                "previousEvents",
                previous.filter((_, i) => i !== index)
              )
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="event-secondary"
        onClick={() =>
          set("previousEvents", add(previous, { source: "MANUAL", title: "" }))
        }
      >
        Add previous event
      </button>
      <h3>Estimated budget</h3>
      {items.map((row, index) => (
        <div className="event-row" key={index}>
          <Input
            placeholder="Budget head"
            value={row.head}
            onChange={(value) =>
              set("budget", {
                ...budget,
                items: items.map((item, i) =>
                  i === index ? { ...item, head: value } : item
                ),
              })
            }
          />
          <Input
            type="number"
            placeholder="Quantity"
            value={row.quantity}
            onChange={(value) =>
              set("budget", {
                ...budget,
                items: items.map((item, i) =>
                  i === index ? { ...item, quantity: Number(value) } : item
                ),
              })
            }
          />
          <Input
            type="number"
            placeholder="Unit cost"
            value={row.estimatedUnitCost}
            onChange={(value) =>
              set("budget", {
                ...budget,
                items: items.map((item, i) =>
                  i === index
                    ? { ...item, estimatedUnitCost: Number(value) }
                    : item
                ),
              })
            }
          />
          <b>
            ₹
            {(Number(row.quantity) || 0) * (Number(row.estimatedUnitCost) || 0)}
          </b>
          <button
            type="button"
            onClick={() =>
              set("budget", {
                ...budget,
                items: items.filter((_, i) => i !== index),
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="event-secondary"
        onClick={() =>
          set("budget", {
            ...budget,
            items: add(items, { head: "", quantity: 1, estimatedUnitCost: 0 }),
          })
        }
      >
        Add budget item
      </button>
      <p className="event-total">
        Total estimate: ₹
        {items.reduce(
          (sum, row) =>
            sum +
            (Number(row.quantity) || 0) * (Number(row.estimatedUnitCost) || 0),
          0
        )}
      </p>
      <Field label="Point of contact">
        <select
          value={form.poc?.label || "GENERAL_SECRETARY"}
          onChange={(event) =>
            set("poc", { ...form.poc, label: event.target.value })
          }
        >
          <option value="GENERAL_SECRETARY">General Secretary</option>
          <option value="EVENT_HEAD">Event Head</option>
        </select>
      </Field>
    </section>
  );
}

export function EventGovernanceSection({ event }) {
  const review = event?.facultyReviewContext || {};
  const names = review.presidentNames || [];
  const stages = [
    ["FACULTY_REVIEW", "Faculty President Review"],
    ["ASSISTANT_REVIEW", "Assistant Review"],
    ["DOSA_STAFF_REVIEW", "DoSA Staff Review"],
    ["ADOSA_REVIEW", "ADoSA Review"],
    ["ADMIN_REVIEW", "Admin Review"],
    ["DOSA_REVIEW", "DoSA Final Approval"],
  ];
  return (
    <section className="event-card">
      <h2>Faculty Presidents</h2>
      {names.length ? (
        <div className="event-grid">
          {names.map((name) => (
            <div key={name}>
              <strong>{name}</strong>
              <small>Faculty President</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="event-warning">
          No active Faculty President is currently assigned to this society.
        </p>
      )}
      {event && event.status !== "DRAFT" && (
        <div className="event-journey">
          <span className="active">Event Submitted</span>
          {stages.map(([stage, label]) => {
            const item = [...(event?.reviewHistory || [])]
              .reverse()
              .find((x) => x.stage === stage);
            const state =
              item?.status ||
              (event?.currentStage === stage ? "PENDING" : "WAITING");
            return (
              <span className={state === "PENDING" ? "active" : ""} key={stage}>
                {label} · {state.replaceAll("_", " ")}
                {item?.decidedAt &&
                  ` · ${new Date(item.decidedAt).toLocaleDateString()}`}
              </span>
            );
          })}
          <span className={event?.status === "APPROVED" ? "active" : ""}>
            Approved
          </span>
        </div>
      )}
    </section>
  );
}
