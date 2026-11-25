import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { fromInput, toInput } from '../format.js';
import { Button, Field, Input, Select, Textarea, Toggle } from './ui.jsx';

const slugKey = (label, taken) => {
  let base = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(base)) base = `f_${base}`;
  base = base.slice(0, 26) || 'field';
  let key = base;
  let i = 2;
  while (taken.has(key)) key = `${base}_${i++}`;
  taken.add(key);
  return key;
};

function defaultTimes() {
  const s = new Date();
  s.setDate(s.getDate() + 7);
  s.setHours(10, 0, 0, 0);
  const e = new Date(s.getTime() + 2 * 3600000);
  return [s, e];
}

export default function EventForm({ event, onSubmit, onCancel, submitLabel = 'Save event' }) {
  const [ds, de] = defaultTimes();
  const reg = event?.registration || {};
  const [f, setF] = useState({
    name: event?.name || '',
    description: event?.description || '',
    venue: event?.venue || '',
    startAt: toInput(event?.startAt || ds),
    endAt: toInput(event?.endAt || de),
    deadline: toInput(event?.registrationDeadline),
    status: ['draft', 'cancelled'].includes(event?.status) ? event.status : 'auto',
    posterUrl: event?.posterUrl || '',
    whatsappGroupUrl: event?.whatsappGroupUrl || '',
    open: reg.open !== false,
    capacity: reg.capacity ?? '',
    waitlist: reg.waitlist !== false,
    requireApproval: Boolean(reg.requireApproval),
    confirmationMessage: reg.confirmationMessage || '',
  });
  const [fields, setFields] = useState((reg.fields || []).map((x) => ({ ...x, options: (x.options || []).join(', ') })));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const flip = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const setField = (i, patch) => setFields((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function validate() {
    const e = {};
    if (f.name.trim().length < 3) e.name = 'Give the event a name (at least 3 characters)';
    if (!f.startAt) e.startAt = 'Choose a start time';
    if (!f.endAt) e.endAt = 'Choose an end time';
    if (f.startAt && f.endAt && new Date(f.endAt) <= new Date(f.startAt)) e.endAt = 'End must be after the start';
    if (f.deadline && f.endAt && new Date(f.deadline) > new Date(f.endAt)) e.deadline = 'Deadline must be before the event ends';
    if (f.capacity !== '' && !(Number(f.capacity) >= 1)) e.capacity = 'Enter a number, or leave empty for no limit';
    for (const u of ['posterUrl', 'whatsappGroupUrl']) {
      if (f[u] && !/^https?:\/\//i.test(f[u].trim())) e[u] = 'Must start with http:// or https://';
    }
    fields.forEach((x, i) => {
      if (!x.label.trim()) e[`field${i}`] = 'Label is required';
      else if (x.type === 'select' && x.options.split(',').map((s) => s.trim()).filter(Boolean).length < 2) e[`field${i}`] = 'Add at least two options, separated by commas';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    setFormError('');
    if (!validate()) return;
    const taken = new Set(fields.filter((x) => x.key).map((x) => x.key));
    const payload = {
      name: f.name.trim(),
      description: f.description.trim(),
      venue: f.venue.trim(),
      startAt: fromInput(f.startAt),
      endAt: fromInput(f.endAt),
      registrationDeadline: fromInput(f.deadline),
      status: f.status,
      posterUrl: f.posterUrl.trim(),
      whatsappGroupUrl: f.whatsappGroupUrl.trim(),
      registration: {
        open: f.open,
        capacity: f.capacity === '' ? null : Number(f.capacity),
        waitlist: f.waitlist,
        requireApproval: f.requireApproval,
        confirmationMessage: f.confirmationMessage.trim(),
        fields: fields.map((x) => ({
          key: x.key || slugKey(x.label, taken),
          label: x.label.trim(),
          type: x.type,
          required: Boolean(x.required),
          options: x.type === 'select' ? x.options.split(',').map((s) => s.trim()).filter(Boolean) : [],
        })),
      },
    };
    setBusy(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setFormError(err.message || 'Could not save the event.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Event details</h3>
        <Field label="Event name" required error={errors.name}>
          <Input value={f.name} onChange={set('name')} placeholder="e.g. Robotics Workshop" invalid={!!errors.name} />
        </Field>
        <Field label="Description" hint="Shown on the public registration page.">
          <Textarea value={f.description} onChange={set('description')} rows={4} maxLength={5000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" required error={errors.startAt}>
            <Input type="datetime-local" value={f.startAt} onChange={set('startAt')} invalid={!!errors.startAt} />
          </Field>
          <Field label="Ends" required error={errors.endAt}>
            <Input type="datetime-local" value={f.endAt} onChange={set('endAt')} invalid={!!errors.endAt} />
          </Field>
        </div>
        <Field label="Venue">
          <Input value={f.venue} onChange={set('venue')} placeholder="Main Auditorium" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Poster image URL" error={errors.posterUrl} hint="Optional. A link to an image.">
            <Input value={f.posterUrl} onChange={set('posterUrl')} placeholder="https://…" invalid={!!errors.posterUrl} />
          </Field>
          <Field label="WhatsApp group link" error={errors.whatsappGroupUrl} hint="Shown to confirmed participants only.">
            <Input value={f.whatsappGroupUrl} onChange={set('whatsappGroupUrl')} placeholder="https://chat.whatsapp.com/…" invalid={!!errors.whatsappGroupUrl} />
          </Field>
        </div>
        <Field label="Visibility" hint="“Draft” hides the registration page. “Cancelled” closes it and tells visitors.">
          <Select value={f.status} onChange={set('status')}>
            <option value="auto">Published (status follows the dates)</option>
            <option value="draft">Draft (not public)</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Online registration</h3>
        <Toggle checked={f.open} onChange={flip('open')} label="Accept registrations" description="Students sign up themselves from the public link and receive their QR ticket by e-mail." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registration deadline" error={errors.deadline} hint="Empty = open until the event ends.">
            <Input type="datetime-local" value={f.deadline} onChange={set('deadline')} invalid={!!errors.deadline} />
          </Field>
          <Field label="Seat limit" error={errors.capacity} hint="Empty = unlimited.">
            <Input type="number" min="1" inputMode="numeric" value={f.capacity} onChange={set('capacity')} placeholder="Unlimited" invalid={!!errors.capacity} />
          </Field>
        </div>
        <Toggle checked={f.waitlist} onChange={flip('waitlist')} label="Waiting list when full" description="Extra sign-ups join a queue and are confirmed automatically when a seat frees up." />
        <Toggle checked={f.requireApproval} onChange={flip('requireApproval')} label="Approve each registration" description="New sign-ups wait for you to approve them. The QR ticket is sent once approved." />
        <Field label="Message on the ticket e-mail" hint="e.g. “Bring your college ID card.”">
          <Input value={f.confirmationMessage} onChange={set('confirmationMessage')} maxLength={500} />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Extra questions</p>
            {fields.length < 10 && (
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => setFields((l) => [...l, { key: '', label: '', type: 'text', required: false, options: '' }])}>
                Add question
              </Button>
            )}
          </div>
          {fields.length === 0 && <p className="text-xs text-slate-500">Name, e-mail, phone, department and year are always asked. Add more here (T-shirt size, food preference…).</p>}
          <div className="space-y-3">
            {fields.map((x, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                  <Field label="Question" error={errors[`field${i}`]}>
                    <Input value={x.label} onChange={(e) => setField(i, { label: e.target.value })} maxLength={100} invalid={!!errors[`field${i}`]} />
                  </Field>
                  <Field label="Type">
                    <Select value={x.type} onChange={(e) => setField(i, { type: e.target.value })}>
                      <option value="text">Short text</option>
                      <option value="textarea">Long text</option>
                      <option value="select">Choice</option>
                      <option value="checkbox">Checkbox</option>
                    </Select>
                  </Field>
                </div>
                {x.type === 'select' && (
                  <Field label="Options" className="mt-3" hint="Separate with commas">
                    <Input value={x.options} onChange={(e) => setField(i, { options: e.target.value })} placeholder="S, M, L, XL" />
                  </Field>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={x.required} onChange={(e) => setField(i, { required: e.target.checked })} className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    Required
                  </label>
                  <Button size="sm" variant="dangerSoft" icon={Trash2} onClick={() => setFields((l) => l.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
      <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-slate-100 bg-white py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
