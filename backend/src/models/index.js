import mongoose from 'mongoose';

const { Schema } = mongoose;
const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model });

export const REG_STATUSES = ['registered', 'pending', 'waitlisted', 'rejected', 'cancelled'];
/** Statuses that occupy one of the event's seats. */
export const SEAT_STATUSES = ['registered', 'pending'];

const coordinatorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['coordinator', 'admin'], default: 'coordinator' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const fieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, maxlength: 100 },
    type: { type: String, enum: ['text', 'textarea', 'select', 'checkbox'], default: 'text' },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
  },
  { _id: false },
);

const registrationSettings = new Schema(
  {
    open: { type: Boolean, default: true },
    capacity: { type: Number, default: null, min: 1 },
    waitlist: { type: Boolean, default: true },
    requireApproval: { type: Boolean, default: false },
    fields: { type: [fieldSchema], default: [] },
    confirmationMessage: { type: String, default: '', maxlength: 500 },
  },
  { _id: false },
);

const eventSchema = new Schema(
  {
    coordinatorId: { ...ref('Coordinator'), required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: '', maxlength: 5000 },
    venue: { type: String, default: '', maxlength: 200 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    registrationDeadline: { type: Date, default: null },
    statusOverride: { type: String, enum: ['draft', 'cancelled', null], default: null },
    attendanceOpen: { type: Boolean, default: false },
    posterUrl: { type: String, default: '' },
    whatsappGroupUrl: { type: String, default: '' },
    slug: { type: String, unique: true, sparse: true },
    registration: { type: registrationSettings, default: () => ({}) },
    seatsTaken: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

const studentSchema = new Schema(
  {
    coordinatorId: { ...ref('Coordinator'), required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    department: { type: String, default: '' },
    academicYear: { type: String, default: '' },
    rollNo: { type: String, default: '' },
  },
  { timestamps: true },
);
studentSchema.index({ coordinatorId: 1, email: 1 }, { unique: true });

const registrationSchema = new Schema(
  {
    eventId: { ...ref('Event'), required: true },
    studentId: { ...ref('Student'), required: true },
    registrationId: { type: String, required: true },
    status: { type: String, enum: REG_STATUSES, default: 'registered' },
    source: { type: String, enum: ['public', 'manual', 'import'], default: 'manual' },
    answers: { type: Map, of: String, default: {} },
    qrTokenHash: { type: String, required: true },
    qrTokenCipher: { type: String, required: true },
    qrRevoked: { type: Boolean, default: false },
    ticketCode: { type: String, required: true },
    emailStatus: { type: String, enum: ['none', 'sent', 'skipped', 'failed'], default: 'none' },
    emailSentAt: { type: Date, default: null },
    emailError: { type: String, default: '' },
  },
  { timestamps: true },
);
registrationSchema.index({ eventId: 1, studentId: 1 }, { unique: true });
registrationSchema.index({ eventId: 1, registrationId: 1 }, { unique: true });
registrationSchema.index({ qrTokenHash: 1 }, { unique: true });
registrationSchema.index({ ticketCode: 1 }, { unique: true });
registrationSchema.index({ eventId: 1, status: 1, createdAt: 1 });

const attendanceSchema = new Schema(
  {
    eventId: { ...ref('Event'), required: true, index: true },
    eventRegistrationId: { ...ref('EventRegistration'), required: true, unique: true },
    status: { type: String, enum: ['present', 'absent'], default: 'present' },
    method: { type: String, enum: ['qr', 'manual'], default: 'qr' },
    markedByName: { type: String, default: '' },
    checkInAt: { type: Date, default: Date.now },
    reason: { type: String, default: '' },
  },
  { timestamps: true },
);

const auditSchema = new Schema({
  eventId: { ...ref('Event'), index: true },
  actorId: { ...ref('Coordinator'), default: null },
  actorName: { type: String, default: '' },
  action: { type: String, required: true },
  detail: { type: String, default: '' },
  meta: { type: Schema.Types.Mixed },
  at: { type: Date, default: Date.now },
});

export const Coordinator = mongoose.model('Coordinator', coordinatorSchema);
export const Event = mongoose.model('Event', eventSchema);
export const Student = mongoose.model('Student', studentSchema);
export const EventRegistration = mongoose.model('EventRegistration', registrationSchema);
export const Attendance = mongoose.model('Attendance', attendanceSchema);
export const AuditLog = mongoose.model('AuditLog', auditSchema);
