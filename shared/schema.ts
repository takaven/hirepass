import { pgTable, serial, varchar, text, integer, boolean, timestamp, date, decimal, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ============ SESSIONS (for Replit Auth) ============
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// ============ USERS (for Replit Auth) ============
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 50 }).default("user"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============ NOTIFICATIONS ============
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  link: varchar("link", { length: 500 }),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// User and notifications relations
export const usersRelations = relations(users, ({ many }) => ({
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// ============ MANAGERS ============
export const managers = pgTable('managers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  jobTitle: varchar('job_title', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  department: varchar('department', { length: 100 }),
  phone: varchar('phone', { length: 50 }),
  isActive: boolean('is_active').default(true),
  canBeInterviewer: boolean('can_be_interviewer').default(true),
  canBeHiringManager: boolean('can_be_hiring_manager').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ PASSES (Recruitment Requisitions) ============
export const passes = pgTable('passes', {
  id: serial('id').primaryKey(),
  passId: varchar('pass_id', { length: 50 }).notNull().unique(),
  positionTitle: varchar('position_title', { length: 255 }).notNull(),
  headcount: integer('headcount').default(1).notNull(),
  department: varchar('department', { length: 100 }).notNull(),
  location: varchar('location', { length: 255 }).notNull(),
  employmentType: varchar('employment_type', { length: 50 }).notNull(),
  experienceMin: integer('experience_min'),
  experienceMax: integer('experience_max'),
  salaryRangeMin: integer('salary_range_min'),
  salaryRangeMax: integer('salary_range_max'),
  salaryCurrency: varchar('salary_currency', { length: 10 }).default('AED'),
  
  status: varchar('status', { length: 50 }).default('draft'),
  currentStep: varchar('current_step', { length: 50 }).default('request'),
  
  jobDescriptionDraft: text('job_description_draft'),
  jobDescriptionFinal: text('job_description_final'),
  jdStatus: varchar('jd_status', { length: 50 }).default('pending'),
  jdApprovedAt: timestamp('jd_approved_at'),
  jdApprovedBy: integer('jd_approved_by'),
  
  requisitionStatus: varchar('requisition_status', { length: 50 }).default('pending'),
  requisitionFilePath: varchar('requisition_file_path', { length: 500 }),
  requisitionApprovedAt: timestamp('requisition_approved_at'),
  
  interviewFormat: varchar('interview_format', { length: 50 }),
  interviewDuration: integer('interview_duration'),
  interviewRounds: integer('interview_rounds').default(1),
  isPanelInterview: boolean('is_panel_interview').default(false),
  technicalAssessmentRequired: boolean('technical_assessment_required').default(false),
  technicalAssessmentAreas: text('technical_assessment_areas'),
  interviewSetupCompleted: boolean('interview_setup_completed').default(false),
  
  // Assessment URLs (MS Forms or external links)
  softSkillsAssessmentUrl: varchar('soft_skills_assessment_url', { length: 500 }),
  technicalAssessmentUrl: varchar('technical_assessment_url', { length: 500 }),
  
  hiringManagerId: integer('hiring_manager_id'),
  
  priority: varchar('priority', { length: 20 }).default('medium'),
  dateRequested: timestamp('date_requested').defaultNow(),
  targetHireDate: timestamp('target_hire_date'),
  dateClosed: timestamp('date_closed'),
  statusChangedAt: timestamp('status_changed_at').defaultNow(),
  
  notes: text('notes'),
  managerNotes: text('manager_notes'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ PASS POSITIONS (Multiple positions per pass) ============
export const passPositions = pgTable('pass_positions', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id').notNull().references(() => passes.id, { onDelete: 'cascade' }),
  
  positionTitle: varchar('position_title', { length: 255 }).notNull(),
  headcount: integer('headcount').default(1).notNull(),
  
  experienceMin: integer('experience_min'),
  experienceMax: integer('experience_max'),
  salaryRangeMin: integer('salary_range_min'),
  salaryRangeMax: integer('salary_range_max'),
  salaryCurrency: varchar('salary_currency', { length: 10 }).default('AED'),
  
  requirements: text('requirements'),
  responsibilities: text('responsibilities'),
  qualifications: text('qualifications'),
  
  jobDescriptionDraft: text('job_description_draft'),
  jobDescriptionFinal: text('job_description_final'),
  
  hiredCount: integer('hired_count').default(0),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ PANEL INTERVIEWERS ============
export const panelInterviewers = pgTable('panel_interviewers', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id').notNull(),
  managerId: integer('manager_id').notNull(),
  createdAt: timestamp('created_at').defaultNow()
});

// ============ INTERVIEW AVAILABILITY ============
export const interviewAvailability = pgTable('interview_availability', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id').notNull(),
  availableDate: date('available_date').notNull(),
  timeSlots: jsonb('time_slots').notNull(),
  createdAt: timestamp('created_at').defaultNow()
});

// ============ CANDIDATES ============
export const candidates = pgTable('candidates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  currentTitle: varchar('current_title', { length: 255 }),
  currentCompany: varchar('current_company', { length: 255 }),
  experienceYears: integer('experience_years'),
  skills: jsonb('skills'),
  
  currentLocation: varchar('current_location', { length: 255 }),
  willingToRelocate: boolean('willing_to_relocate'),
  noticePeriod: varchar('notice_period', { length: 50 }),
  expectedSalary: integer('expected_salary'),
  expectedSalaryCurrency: varchar('expected_salary_currency', { length: 10 }).default('AED'),
  
  linkedinUrl: varchar('linkedin_url', { length: 500 }),
  cvFilePath: varchar('cv_file_path', { length: 500 }),
  cvFileName: varchar('cv_file_name', { length: 255 }),
  
  cvSummary: text('cv_summary'),
  
  inTalentPool: boolean('in_talent_pool').default(false),
  talentPoolTags: jsonb('talent_pool_tags'),
  talentPoolNotes: text('talent_pool_notes'),
  
  source: varchar('source', { length: 100 }),
  sourceDetails: varchar('source_details', { length: 255 }),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ PASS CANDIDATES (Junction) ============
export const passCandidates = pgTable('pass_candidates', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id').notNull(),
  candidateId: integer('candidate_id').notNull(),
  positionId: integer('position_id').references(() => passPositions.id, { onDelete: 'set null' }),
  
  status: varchar('status', { length: 50 }).default('new'),
  
  aiRank: integer('ai_rank'),
  aiScore: integer('ai_score'),
  aiBrief: text('ai_brief'),
  
  softSkillsScore: integer('soft_skills_score'),
  softSkillsCompletedAt: timestamp('soft_skills_completed_at'),
  technicalScore: integer('technical_score'),
  technicalCompletedAt: timestamp('technical_completed_at'),
  technicalAssessmentId: integer('technical_assessment_id'),
  
  interviewScore: decimal('interview_score', { precision: 3, scale: 1 }),
  interviewRecommendation: varchar('interview_recommendation', { length: 50 }),
  
  selectedForPosition: integer('selected_for_position'),
  selectionNotes: text('selection_notes'),
  
  rejectionReason: varchar('rejection_reason', { length: 255 }),
  rejectionNotes: text('rejection_notes'),
  rejectedAt: timestamp('rejected_at'),
  
  addedAt: timestamp('added_at').defaultNow(),
  shortlistedAt: timestamp('shortlisted_at'),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ TECHNICAL ASSESSMENTS ============
export const technicalAssessments = pgTable('technical_assessments', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id').notNull(),
  
  title: varchar('title', { length: 255 }).notNull(),
  instructions: text('instructions'),
  questions: jsonb('questions').notNull(),
  totalPoints: integer('total_points'),
  timeLimit: integer('time_limit'),
  
  generatedFromJd: boolean('generated_from_jd').default(true),
  specificAreas: text('specific_areas'),
  
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow()
});

// ============ ASSESSMENT RESPONSES ============
export const assessmentResponses = pgTable('assessment_responses', {
  id: serial('id').primaryKey(),
  assessmentId: integer('assessment_id').notNull(),
  passCandidateId: integer('pass_candidate_id').notNull(),
  
  responses: jsonb('responses').notNull(),
  totalScore: integer('total_score'),
  percentage: integer('percentage'),
  timeTaken: integer('time_taken'),
  
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow()
});

// ============ INTERVIEWS ============
export const interviews = pgTable('interviews', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id').notNull(),
  passCandidateId: integer('pass_candidate_id').notNull(),
  
  interviewDate: date('interview_date').notNull(),
  startTime: varchar('start_time', { length: 10 }).notNull(),
  endTime: varchar('end_time', { length: 10 }).notNull(),
  duration: integer('duration').notNull(),
  
  format: varchar('format', { length: 50 }).notNull(),
  location: varchar('location', { length: 255 }),
  meetingLink: varchar('meeting_link', { length: 500 }),
  
  roundNumber: integer('round_number').default(1),
  roundName: varchar('round_name', { length: 100 }),
  
  status: varchar('status', { length: 50 }).default('scheduled'),
  
  interviewNotes: text('interview_notes'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ INTERVIEW EVALUATIONS ============
export const interviewEvaluations = pgTable('interview_evaluations', {
  id: serial('id').primaryKey(),
  interviewId: integer('interview_id').notNull(),
  evaluatorId: integer('evaluator_id').notNull(),
  
  educationalBackground: integer('educational_background'),
  priorWorkExperience: integer('prior_work_experience'),
  technicalSkills: integer('technical_skills'),
  personalityTeamFit: integer('personality_team_fit'),
  initiative: integer('initiative'),
  timeManagement: integer('time_management'),
  
  averageScore: decimal('average_score', { precision: 3, scale: 2 }),
  
  notesObservations: text('notes_observations'),
  
  recommendation: varchar('recommendation', { length: 50 }).notNull(),
  finalComments: text('final_comments'),
  
  submittedAt: timestamp('submitted_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow()
});

// ============ OFFERS ============
export const offers = pgTable('offers', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id').notNull(),
  passCandidateId: integer('pass_candidate_id').notNull(),
  positionNumber: integer('position_number').default(1),
  
  salary: integer('salary').notNull(),
  salaryCurrency: varchar('salary_currency', { length: 10 }).default('AED'),
  startDate: date('start_date'),
  contractType: varchar('contract_type', { length: 50 }),
  probationPeriod: integer('probation_period'),
  benefits: jsonb('benefits'),
  
  status: varchar('status', { length: 50 }).default('draft'),
  
  approvedBy: integer('approved_by'),
  approvedAt: timestamp('approved_at'),
  
  sentAt: timestamp('sent_at'),
  respondedAt: timestamp('responded_at'),
  declineReason: text('decline_reason'),
  
  negotiationNotes: text('negotiation_notes'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ SHARE LINKS ============
export const shareLinks = pgTable('share_links', {
  id: serial('id').primaryKey(),
  token: varchar('token', { length: 100 }).notNull().unique(),
  passId: integer('pass_id').notNull(),
  managerId: integer('manager_id'),
  
  linkType: varchar('link_type', { length: 50 }).default('manager'),
  expiresAt: timestamp('expires_at'),
  
  accessCount: integer('access_count').default(0),
  lastAccessedAt: timestamp('last_accessed_at'),
  isActive: boolean('is_active').default(true),
  
  createdAt: timestamp('created_at').defaultNow()
});

// ============ CANDIDATE APPLICATION LINKS ============
export const candidateLinks = pgTable('candidate_links', {
  id: serial('id').primaryKey(),
  token: varchar('token', { length: 100 }).notNull().unique(),
  passCandidateId: integer('pass_candidate_id').notNull(),
  
  canFillApplication: boolean('can_fill_application').default(true),
  canTakeAssessment: boolean('can_take_assessment').default(false),
  
  applicationCompletedAt: timestamp('application_completed_at'),
  assessmentCompletedAt: timestamp('assessment_completed_at'),
  
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true),
  
  createdAt: timestamp('created_at').defaultNow()
});

// ============ MANAGER FEEDBACK ============
export const managerFeedback = pgTable('manager_feedback', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id').notNull(),
  managerId: integer('manager_id').notNull(),
  
  feedbackType: varchar('feedback_type', { length: 50 }).notNull(),
  feedback: text('feedback').notNull(),
  
  status: varchar('status', { length: 50 }).default('pending'),
  response: text('response'),
  respondedAt: timestamp('responded_at'),
  
  createdAt: timestamp('created_at').defaultNow()
});

// ============ ACTIVITY LOG ============
export const activityLog = pgTable('activity_log', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id'),
  
  actorType: varchar('actor_type', { length: 50 }).notNull(),
  actorId: integer('actor_id'),
  actorName: varchar('actor_name', { length: 255 }),
  
  action: varchar('action', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 50 }),
  targetId: integer('target_id'),
  
  details: jsonb('details'),
  
  createdAt: timestamp('created_at').defaultNow()
});

// ============ DOCUMENTS ============
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id'),
  candidateId: integer('candidate_id'),
  
  docType: varchar('doc_type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  filePath: varchar('file_path', { length: 500 }),
  fileName: varchar('file_name', { length: 255 }),
  
  version: integer('version').default(1),
  isAiGenerated: boolean('is_ai_generated').default(false),
  
  status: varchar('status', { length: 50 }).default('draft'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ SETTINGS ============
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ AI CONVERSATIONS ============
export const aiConversations = pgTable('ai_conversations', {
  id: serial('id').primaryKey(),
  sessionId: varchar('session_id', { length: 100 }).notNull(),
  
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  
  passId: integer('pass_id'),
  candidateId: integer('candidate_id'),
  
  toolCalls: jsonb('tool_calls'),
  
  createdAt: timestamp('created_at').defaultNow()
});

// ============ ONBOARDING RECORDS ============
export const onboardingRecords = pgTable('onboarding_records', {
  id: serial('id').primaryKey(),
  passCandidateId: integer('pass_candidate_id').notNull().references(() => passCandidates.id, { onDelete: 'cascade' }),
  offerId: integer('offer_id').references(() => offers.id, { onDelete: 'set null' }),
  
  // Employee Details
  employeeId: varchar('employee_id', { length: 50 }),
  startDate: date('start_date'),
  department: varchar('department', { length: 100 }),
  reportingTo: varchar('reporting_to', { length: 255 }),
  workLocation: varchar('work_location', { length: 255 }),
  
  // Onboarding Status
  status: varchar('status', { length: 50 }).default('pending'),
  
  // Checklist Items (JSONB array of {item: string, completed: boolean, completedAt: timestamp})
  checklistItems: jsonb('checklist_items').default([
    { item: "Employment contract signed", completed: false },
    { item: "ID documents collected", completed: false },
    { item: "Bank details provided", completed: false },
    { item: "Emergency contact information", completed: false },
    { item: "IT equipment issued", completed: false },
    { item: "Access cards/badges issued", completed: false },
    { item: "Email account created", completed: false },
    { item: "System access granted", completed: false },
    { item: "Orientation session completed", completed: false },
    { item: "Department introduction completed", completed: false },
    { item: "Safety training completed", completed: false },
    { item: "Company policies reviewed", completed: false }
  ]),
  
  // Required Documents
  requiredDocuments: jsonb('required_documents').default([
    { name: "Passport copy", received: false },
    { name: "Emirates ID copy", received: false },
    { name: "Visa copy", received: false },
    { name: "Educational certificates", received: false },
    { name: "Experience certificates", received: false },
    { name: "Passport photos", received: false }
  ]),
  
  // Notes
  notes: text('notes'),
  hrNotes: text('hr_notes'),
  
  // Timestamps
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ RELATIONS ============
export const passesRelations = relations(passes, ({ one, many }) => ({
  hiringManager: one(managers, { fields: [passes.hiringManagerId], references: [managers.id] }),
  jdApprover: one(managers, { fields: [passes.jdApprovedBy], references: [managers.id] }),
  panelInterviewers: many(panelInterviewers),
  interviewAvailability: many(interviewAvailability),
  passCandidates: many(passCandidates),
  interviews: many(interviews),
  offers: many(offers),
  shareLinks: many(shareLinks),
  feedback: many(managerFeedback),
  documents: many(documents),
  activities: many(activityLog),
  technicalAssessments: many(technicalAssessments)
}));

export const candidatesRelations = relations(candidates, ({ many }) => ({
  passCandidates: many(passCandidates),
  documents: many(documents)
}));

export const passCandidatesRelations = relations(passCandidates, ({ one, many }) => ({
  pass: one(passes, { fields: [passCandidates.passId], references: [passes.id] }),
  candidate: one(candidates, { fields: [passCandidates.candidateId], references: [candidates.id] }),
  technicalAssessment: one(technicalAssessments, { fields: [passCandidates.technicalAssessmentId], references: [technicalAssessments.id] }),
  interviews: many(interviews),
  assessmentResponses: many(assessmentResponses),
  candidateLinks: many(candidateLinks)
}));

export const interviewsRelations = relations(interviews, ({ one, many }) => ({
  pass: one(passes, { fields: [interviews.passId], references: [passes.id] }),
  passCandidate: one(passCandidates, { fields: [interviews.passCandidateId], references: [passCandidates.id] }),
  evaluations: many(interviewEvaluations)
}));

export const managersRelations = relations(managers, ({ many }) => ({
  passesAsHiringManager: many(passes),
  panelInterviewers: many(panelInterviewers),
  evaluations: many(interviewEvaluations),
  feedback: many(managerFeedback)
}));

export const panelInterviewersRelations = relations(panelInterviewers, ({ one }) => ({
  pass: one(passes, { fields: [panelInterviewers.passId], references: [passes.id] }),
  manager: one(managers, { fields: [panelInterviewers.managerId], references: [managers.id] })
}));

export const interviewEvaluationsRelations = relations(interviewEvaluations, ({ one }) => ({
  interview: one(interviews, { fields: [interviewEvaluations.interviewId], references: [interviews.id] }),
  evaluator: one(managers, { fields: [interviewEvaluations.evaluatorId], references: [managers.id] })
}));

export const technicalAssessmentsRelations = relations(technicalAssessments, ({ one }) => ({
  pass: one(passes, { fields: [technicalAssessments.passId], references: [passes.id] })
}));

export const assessmentResponsesRelations = relations(assessmentResponses, ({ one }) => ({
  assessment: one(technicalAssessments, { fields: [assessmentResponses.assessmentId], references: [technicalAssessments.id] }),
  passCandidate: one(passCandidates, { fields: [assessmentResponses.passCandidateId], references: [passCandidates.id] })
}));

export const offersRelations = relations(offers, ({ one }) => ({
  pass: one(passes, { fields: [offers.passId], references: [passes.id] }),
  passCandidate: one(passCandidates, { fields: [offers.passCandidateId], references: [passCandidates.id] }),
  approver: one(managers, { fields: [offers.approvedBy], references: [managers.id] })
}));

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  pass: one(passes, { fields: [shareLinks.passId], references: [passes.id] }),
  manager: one(managers, { fields: [shareLinks.managerId], references: [managers.id] })
}));

export const candidateLinksRelations = relations(candidateLinks, ({ one }) => ({
  passCandidate: one(passCandidates, { fields: [candidateLinks.passCandidateId], references: [passCandidates.id] })
}));

export const managerFeedbackRelations = relations(managerFeedback, ({ one }) => ({
  pass: one(passes, { fields: [managerFeedback.passId], references: [passes.id] }),
  manager: one(managers, { fields: [managerFeedback.managerId], references: [managers.id] })
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  pass: one(passes, { fields: [activityLog.passId], references: [passes.id] })
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  pass: one(passes, { fields: [documents.passId], references: [passes.id] }),
  candidate: one(candidates, { fields: [documents.candidateId], references: [candidates.id] })
}));

export const interviewAvailabilityRelations = relations(interviewAvailability, ({ one }) => ({
  pass: one(passes, { fields: [interviewAvailability.passId], references: [passes.id] })
}));

export const onboardingRecordsRelations = relations(onboardingRecords, ({ one }) => ({
  passCandidate: one(passCandidates, { fields: [onboardingRecords.passCandidateId], references: [passCandidates.id] }),
  offer: one(offers, { fields: [onboardingRecords.offerId], references: [offers.id] })
}));

// ============ CANDIDATE MESSAGES ============
export const candidateMessages = pgTable('candidate_messages', {
  id: serial('id').primaryKey(),
  passCandidateId: integer('pass_candidate_id').notNull().references(() => passCandidates.id, { onDelete: 'cascade' }),
  
  senderType: varchar('sender_type', { length: 20 }).notNull(), // 'hr' | 'candidate'
  senderId: integer('sender_id'), // Manager ID if HR
  senderName: varchar('sender_name', { length: 255 }),
  
  message: text('message').notNull(),
  attachments: jsonb('attachments'), // Array of {fileName, filePath, fileType}
  
  isRead: boolean('is_read').default(false),
  readAt: timestamp('read_at'),
  
  createdAt: timestamp('created_at').defaultNow()
});

// ============ CANDIDATE DOCUMENTS (Required/Uploaded) ============
export const candidateDocuments = pgTable('candidate_documents', {
  id: serial('id').primaryKey(),
  passCandidateId: integer('pass_candidate_id').notNull().references(() => passCandidates.id, { onDelete: 'cascade' }),
  
  docType: varchar('doc_type', { length: 50 }).notNull(), // cv, passport, photo, certificates, etc.
  label: varchar('label', { length: 255 }).notNull(),
  
  isRequired: boolean('is_required').default(false),
  isFromHr: boolean('is_from_hr').default(false), // true if document is shared by HR to candidate
  
  filePath: varchar('file_path', { length: 500 }),
  fileName: varchar('file_name', { length: 255 }),
  fileSize: integer('file_size'),
  
  status: varchar('status', { length: 50 }).default('pending'), // pending, uploaded, approved, rejected
  rejectionReason: text('rejection_reason'),
  
  dueDate: timestamp('due_date'),
  uploadedAt: timestamp('uploaded_at'),
  reviewedAt: timestamp('reviewed_at'),
  reviewedBy: integer('reviewed_by'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ INTERVIEW SLOTS (For Candidate Selection) ============
export const interviewSlots = pgTable('interview_slots', {
  id: serial('id').primaryKey(),
  passId: integer('pass_id').notNull().references(() => passes.id, { onDelete: 'cascade' }),
  
  slotDate: date('slot_date').notNull(),
  startTime: varchar('start_time', { length: 10 }).notNull(),
  endTime: varchar('end_time', { length: 10 }).notNull(),
  
  format: varchar('format', { length: 50 }).notNull(), // online, in-person, hybrid
  location: varchar('location', { length: 255 }),
  meetingLink: varchar('meeting_link', { length: 500 }),
  
  interviewerId: integer('interviewer_id').references(() => managers.id),
  
  isBooked: boolean('is_booked').default(false),
  bookedBy: integer('booked_by'), // passCandidateId
  bookedAt: timestamp('booked_at'),
  
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow()
});

// ============ ONBOARDING LINKS (Token-based access) ============
export const onboardingLinks = pgTable('onboarding_links', {
  id: serial('id').primaryKey(),
  token: varchar('token', { length: 100 }).notNull().unique(),
  onboardingRecordId: integer('onboarding_record_id').notNull().references(() => onboardingRecords.id, { onDelete: 'cascade' }),
  
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').default(true),
  accessCount: integer('access_count').default(0),
  lastAccessedAt: timestamp('last_accessed_at'),
  
  createdAt: timestamp('created_at').defaultNow()
});

// ============ ONBOARDING STAGE PROGRESS ============
export const onboardingStageProgress = pgTable('onboarding_stage_progress', {
  id: serial('id').primaryKey(),
  onboardingRecordId: integer('onboarding_record_id').notNull().references(() => onboardingRecords.id, { onDelete: 'cascade' }),
  
  stageNumber: integer('stage_number').notNull(), // 1-9
  stageName: varchar('stage_name', { length: 100 }).notNull(),
  
  status: varchar('status', { length: 50 }).default('locked'), // locked, in_progress, completed
  
  // Stage-specific data stored as JSONB
  stageData: jsonb('stage_data'),
  
  // Document uploads for this stage
  documentsRequired: jsonb('documents_required'),
  documentsUploaded: jsonb('documents_uploaded'),
  
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  
  notes: text('notes'),
  hrNotes: text('hr_notes'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// ============ CANDIDATE TIMELINE EVENTS ============
export const candidateTimelineEvents = pgTable('candidate_timeline_events', {
  id: serial('id').primaryKey(),
  passCandidateId: integer('pass_candidate_id').notNull().references(() => passCandidates.id, { onDelete: 'cascade' }),
  
  stage: varchar('stage', { length: 50 }).notNull(), // application, screening, assessment, interview, offer, onboarding
  status: varchar('status', { length: 50 }).notNull(), // pending, in_progress, completed
  
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow()
});

// Relations for new tables
export const candidateMessagesRelations = relations(candidateMessages, ({ one }) => ({
  passCandidate: one(passCandidates, { fields: [candidateMessages.passCandidateId], references: [passCandidates.id] }),
  sender: one(managers, { fields: [candidateMessages.senderId], references: [managers.id] })
}));

export const candidateDocumentsRelations = relations(candidateDocuments, ({ one }) => ({
  passCandidate: one(passCandidates, { fields: [candidateDocuments.passCandidateId], references: [passCandidates.id] }),
  reviewer: one(managers, { fields: [candidateDocuments.reviewedBy], references: [managers.id] })
}));

export const interviewSlotsRelations = relations(interviewSlots, ({ one }) => ({
  pass: one(passes, { fields: [interviewSlots.passId], references: [passes.id] }),
  interviewer: one(managers, { fields: [interviewSlots.interviewerId], references: [managers.id] }),
  bookedCandidate: one(passCandidates, { fields: [interviewSlots.bookedBy], references: [passCandidates.id] })
}));

export const candidateTimelineEventsRelations = relations(candidateTimelineEvents, ({ one }) => ({
  passCandidate: one(passCandidates, { fields: [candidateTimelineEvents.passCandidateId], references: [passCandidates.id] })
}));

export const onboardingLinksRelations = relations(onboardingLinks, ({ one }) => ({
  onboardingRecord: one(onboardingRecords, { fields: [onboardingLinks.onboardingRecordId], references: [onboardingRecords.id] })
}));

export const onboardingStageProgressRelations = relations(onboardingStageProgress, ({ one }) => ({
  onboardingRecord: one(onboardingRecords, { fields: [onboardingStageProgress.onboardingRecordId], references: [onboardingRecords.id] })
}));

// ============ INSERT SCHEMAS ============
export const insertManagerSchema = createInsertSchema(managers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPassSchema = createInsertSchema(passes).omit({ id: true, passId: true, createdAt: true, updatedAt: true });
export const insertPassPositionSchema = createInsertSchema(passPositions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCandidateSchema = createInsertSchema(candidates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPassCandidateSchema = createInsertSchema(passCandidates).omit({ id: true, addedAt: true, updatedAt: true });
export const insertInterviewSchema = createInsertSchema(interviews).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInterviewEvaluationSchema = createInsertSchema(interviewEvaluations).omit({ id: true, createdAt: true, submittedAt: true });
export const insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShareLinkSchema = createInsertSchema(shareLinks).omit({ id: true, token: true, createdAt: true });
export const insertCandidateLinkSchema = createInsertSchema(candidateLinks).omit({ id: true, createdAt: true });
export const insertManagerFeedbackSchema = createInsertSchema(managerFeedback).omit({ id: true, createdAt: true });
export const insertActivityLogSchema = createInsertSchema(activityLog).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTechnicalAssessmentSchema = createInsertSchema(technicalAssessments).omit({ id: true, createdAt: true });
export const insertAssessmentResponseSchema = createInsertSchema(assessmentResponses).omit({ id: true, createdAt: true });
export const insertSettingSchema = createInsertSchema(settings).omit({ id: true, updatedAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ createdAt: true, updatedAt: true });
export const insertSessionSchema = createInsertSchema(sessions);
export const insertOnboardingRecordSchema = createInsertSchema(onboardingRecords).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCandidateMessageSchema = createInsertSchema(candidateMessages).omit({ id: true, createdAt: true });
export const insertCandidateDocumentSchema = createInsertSchema(candidateDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInterviewSlotSchema = createInsertSchema(interviewSlots).omit({ id: true, createdAt: true });
export const insertCandidateTimelineEventSchema = createInsertSchema(candidateTimelineEvents).omit({ id: true, createdAt: true });
export const insertOnboardingLinkSchema = createInsertSchema(onboardingLinks).omit({ id: true, token: true, createdAt: true });
export const insertOnboardingStageProgressSchema = createInsertSchema(onboardingStageProgress).omit({ id: true, createdAt: true, updatedAt: true });

// ============ TYPES ============
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Manager = typeof managers.$inferSelect;
export type InsertManager = z.infer<typeof insertManagerSchema>;
export type Pass = typeof passes.$inferSelect;
export type InsertPass = z.infer<typeof insertPassSchema>;
export type PassPosition = typeof passPositions.$inferSelect;
export type InsertPassPosition = z.infer<typeof insertPassPositionSchema>;
export type Candidate = typeof candidates.$inferSelect;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type PassCandidate = typeof passCandidates.$inferSelect;
export type InsertPassCandidate = z.infer<typeof insertPassCandidateSchema>;
export type Interview = typeof interviews.$inferSelect;
export type InsertInterview = z.infer<typeof insertInterviewSchema>;
export type InterviewEvaluation = typeof interviewEvaluations.$inferSelect;
export type InsertInterviewEvaluation = z.infer<typeof insertInterviewEvaluationSchema>;
export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type ShareLink = typeof shareLinks.$inferSelect;
export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;
export type CandidateLink = typeof candidateLinks.$inferSelect;
export type InsertCandidateLink = z.infer<typeof insertCandidateLinkSchema>;
export type ManagerFeedback = typeof managerFeedback.$inferSelect;
export type InsertManagerFeedback = z.infer<typeof insertManagerFeedbackSchema>;
export type ActivityLog = typeof activityLog.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type TechnicalAssessment = typeof technicalAssessments.$inferSelect;
export type InsertTechnicalAssessment = z.infer<typeof insertTechnicalAssessmentSchema>;
export type AssessmentResponse = typeof assessmentResponses.$inferSelect;
export type InsertAssessmentResponse = z.infer<typeof insertAssessmentResponseSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type OnboardingRecord = typeof onboardingRecords.$inferSelect;
export type InsertOnboardingRecord = z.infer<typeof insertOnboardingRecordSchema>;
export type CandidateMessage = typeof candidateMessages.$inferSelect;
export type InsertCandidateMessage = z.infer<typeof insertCandidateMessageSchema>;
export type CandidateDocument = typeof candidateDocuments.$inferSelect;
export type InsertCandidateDocument = z.infer<typeof insertCandidateDocumentSchema>;
export type InterviewSlot = typeof interviewSlots.$inferSelect;
export type InsertInterviewSlot = z.infer<typeof insertInterviewSlotSchema>;
export type CandidateTimelineEvent = typeof candidateTimelineEvents.$inferSelect;
export type InsertCandidateTimelineEvent = z.infer<typeof insertCandidateTimelineEventSchema>;
export type OnboardingLink = typeof onboardingLinks.$inferSelect;
export type InsertOnboardingLink = z.infer<typeof insertOnboardingLinkSchema>;
export type OnboardingStageProgress = typeof onboardingStageProgress.$inferSelect;
export type InsertOnboardingStageProgress = z.infer<typeof insertOnboardingStageProgressSchema>;
