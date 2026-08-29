import { eq, desc, and, gte, sql, inArray, or } from "drizzle-orm";
import { db } from "./db";
import {
  managers, passes, candidates, passCandidates, interviews, 
  interviewEvaluations, offers, shareLinks, candidateLinks,
  managerFeedback, activityLog, documents, settings, technicalAssessments,
  assessmentResponses, panelInterviewers, interviewAvailability,
  users, notifications, passPositions, onboardingRecords,
  candidateMessages, candidateDocuments, interviewSlots, candidateTimelineEvents,
  onboardingLinks, onboardingStageProgress,
  type Manager, type InsertManager,
  type Pass, type InsertPass,
  type PassPosition, type InsertPassPosition,
  type Candidate, type InsertCandidate,
  type PassCandidate, type InsertPassCandidate,
  type Interview, type InsertInterview,
  type InterviewEvaluation, type InsertInterviewEvaluation,
  type Offer, type InsertOffer,
  type ShareLink, type InsertShareLink,
  type ManagerFeedback, type InsertManagerFeedback,
  type ActivityLog, type InsertActivityLog,
  type Document, type InsertDocument,
  type Setting, type InsertSetting,
  type TechnicalAssessment, type InsertTechnicalAssessment,
  type User, type InsertUser, type UpsertUser,
  type Notification, type InsertNotification,
  type OnboardingRecord, type InsertOnboardingRecord,
  type CandidateMessage, type InsertCandidateMessage,
  type CandidateDocument, type InsertCandidateDocument,
  type InterviewSlot, type InsertInterviewSlot,
  type CandidateTimelineEvent, type InsertCandidateTimelineEvent,
  type OnboardingLink, type InsertOnboardingLink,
  type OnboardingStageProgress, type InsertOnboardingStageProgress,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Managers
  getManagers(): Promise<Manager[]>;
  getManager(id: number): Promise<Manager | undefined>;
  createManager(manager: InsertManager): Promise<Manager>;
  updateManager(id: number, manager: Partial<InsertManager>): Promise<Manager | undefined>;
  deleteManager(id: number): Promise<boolean>;

  // Passes
  getPasses(): Promise<Pass[]>;
  getPass(id: number): Promise<Pass | undefined>;
  getPassByPassId(passId: string): Promise<Pass | undefined>;
  getPassWithDetails(id: number): Promise<any>;
  createPass(pass: InsertPass): Promise<Pass>;
  updatePass(id: number, pass: Partial<InsertPass>): Promise<Pass | undefined>;
  deletePass(id: number): Promise<boolean>;

  // Pass Positions
  getPassPositions(passId: number): Promise<PassPosition[]>;
  getPassPosition(id: number): Promise<PassPosition | undefined>;
  createPassPosition(data: InsertPassPosition): Promise<PassPosition>;
  updatePassPosition(id: number, data: Partial<InsertPassPosition>): Promise<PassPosition | undefined>;
  deletePassPosition(id: number): Promise<boolean>;
  incrementPositionHiredCount(positionId: number): Promise<void>;

  // Candidates
  getCandidates(): Promise<Candidate[]>;
  getCandidate(id: number): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  updateCandidate(id: number, candidate: Partial<InsertCandidate>): Promise<Candidate | undefined>;
  deleteCandidate(id: number): Promise<boolean>;

  // Pass Candidates
  getPassCandidates(passId: number): Promise<(PassCandidate & { candidate: Candidate })[]>;
  getCandidatePasses(candidateId: number): Promise<(PassCandidate & { pass: Pass })[]>;
  getPassCandidate(id: number): Promise<PassCandidate | undefined>;
  addCandidateToPass(passCandidate: InsertPassCandidate): Promise<PassCandidate>;
  updatePassCandidate(id: number, data: Partial<InsertPassCandidate>): Promise<PassCandidate | undefined>;
  updatePassCandidateStatus(id: number, status: string, notes?: string): Promise<PassCandidate | undefined>;
  updatePassCandidateAiScore(id: number, aiScore: number, aiScoreDetails?: object): Promise<PassCandidate | undefined>;
  bulkUpdatePassCandidateStatus(ids: number[], status: string): Promise<number>;
  getPassCandidatesPipeline(passId: number): Promise<Record<string, (PassCandidate & { candidate: Candidate })[]>>;
  removePassCandidate(id: number): Promise<boolean>;

  // Public Passes
  getOpenPasses(): Promise<Pass[]>;

  // Interviews
  getInterviews(): Promise<Interview[]>;
  getInterview(id: number): Promise<Interview | undefined>;
  createInterview(interview: InsertInterview): Promise<Interview>;
  updateInterview(id: number, interview: Partial<InsertInterview>): Promise<Interview | undefined>;
  deleteInterview(id: number): Promise<boolean>;
  getInterviewsByPass(passId: number): Promise<Interview[]>;
  getUpcomingInterviews(): Promise<Interview[]>;

  // Interview Evaluations
  getEvaluationsByInterview(interviewId: number): Promise<InterviewEvaluation[]>;
  createEvaluation(evaluation: InsertInterviewEvaluation): Promise<InterviewEvaluation>;

  // Offers
  getOffers(passId: number): Promise<Offer[]>;
  getOffersByPassCandidate(passCandidateId: number): Promise<Offer[]>;
  createOffer(offer: InsertOffer): Promise<Offer>;
  updateOffer(id: number, offer: Partial<InsertOffer>): Promise<Offer | undefined>;

  // Interviews by PassCandidate
  getInterviewsByPassCandidate(passCandidateId: number): Promise<Interview[]>;

  // Onboarding Records
  getOnboardingRecord(passCandidateId: number): Promise<OnboardingRecord | undefined>;
  createOnboardingRecord(record: InsertOnboardingRecord): Promise<OnboardingRecord>;
  updateOnboardingRecord(id: number, record: Partial<InsertOnboardingRecord>): Promise<OnboardingRecord | undefined>;

  // Share Links
  getShareLinkByToken(token: string): Promise<ShareLink | undefined>;
  getShareLinksByPass(passId: number): Promise<ShareLink[]>;
  createShareLink(shareLink: InsertShareLink): Promise<ShareLink>;

  // Activity Log
  logActivity(activity: InsertActivityLog): Promise<ActivityLog>;
  getActivitiesByPass(passId: number): Promise<ActivityLog[]>;

  // Settings
  getSettings(): Promise<Setting[]>;
  getSetting(key: string): Promise<Setting | undefined>;
  upsertSetting(key: string, value: string, description?: string): Promise<Setting>;

  // Technical Assessments
  getAssessmentsByPass(passId: number): Promise<TechnicalAssessment[]>;
  createAssessment(assessment: InsertTechnicalAssessment): Promise<TechnicalAssessment>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<boolean>;

  // Analytics
  getStats(): Promise<{
    totalCandidates: number;
    activePasses: number;
    scheduledInterviews: number;
    hiredThisMonth: number;
  }>;
  getPipelineCounts(): Promise<{
    new: number;
    screening: number;
    shortlisted: number;
    interview: number;
    offer: number;
    hired: number;
    rejected: number;
  }>;
  getRecruitmentTrends(): Promise<{
    passesCreatedByMonth: { month: string; count: number }[];
    candidatesAddedByMonth: { month: string; count: number }[];
    interviewsByMonth: { month: string; count: number }[];
    hiresbyMonth: { month: string; count: number }[];
    avgTimeToHire: number;
    sourceBreakdown: { source: string; count: number }[];
  }>;

  // Manager Pass / Share Link methods
  updateShareLink(id: number, data: Partial<ShareLink>): Promise<ShareLink | undefined>;
  getInterviewSlotsByPass(passId: number): Promise<InterviewSlot[]>;
  getPassCandidatesWithDetails(passId: number): Promise<any[]>;
  createInterviewSlot(slot: InsertInterviewSlot): Promise<InterviewSlot>;
  createPanelInterviewer(data: { passId: number; managerId: number }): Promise<void>;
  createManagerFeedback(data: InsertManagerFeedback): Promise<ManagerFeedback>;
  createInterviewEvaluation(data: InsertInterviewEvaluation): Promise<InterviewEvaluation>;

  // Candidate Pass methods
  getCandidateLinkByToken(token: string): Promise<any | undefined>;
  getCandidateLinksByPassCandidate(passCandidateId: number): Promise<any[]>;
  updateCandidateLink(id: number, data: Partial<typeof candidateLinks.$inferSelect>): Promise<any | undefined>;
  createCandidateLink(data: any): Promise<any>;
  getPassCandidateById(id: number): Promise<PassCandidate | undefined>;
  getCandidateMessages(passCandidateId: number): Promise<CandidateMessage[]>;
  createCandidateMessage(data: InsertCandidateMessage): Promise<CandidateMessage>;
  markMessageAsRead(messageId: number): Promise<void>;
  getCandidateDocuments(passCandidateId: number): Promise<CandidateDocument[]>;
  createCandidateDocument(data: InsertCandidateDocument): Promise<CandidateDocument>;
  updateCandidateDocument(id: number, data: Partial<InsertCandidateDocument>): Promise<CandidateDocument | undefined>;
  getCandidateTimelineEvents(passCandidateId: number): Promise<CandidateTimelineEvent[]>;
  getAvailableInterviewSlots(passId: number): Promise<InterviewSlot[]>;
  bookInterviewSlot(slotId: number, passCandidateId: number, passId: number): Promise<InterviewSlot | undefined>;
  getOfferByPassCandidate(passCandidateId: number): Promise<Offer | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Managers
  async getManagers(): Promise<Manager[]> {
    return db.select().from(managers).orderBy(desc(managers.createdAt));
  }

  async getManager(id: number): Promise<Manager | undefined> {
    const [manager] = await db.select().from(managers).where(eq(managers.id, id));
    return manager;
  }

  async createManager(manager: InsertManager): Promise<Manager> {
    const [newManager] = await db.insert(managers).values(manager).returning();
    return newManager;
  }

  async updateManager(id: number, manager: Partial<InsertManager>): Promise<Manager | undefined> {
    const [updated] = await db.update(managers)
      .set({ ...manager, updatedAt: new Date() })
      .where(eq(managers.id, id))
      .returning();
    return updated;
  }

  async deleteManager(id: number): Promise<boolean> {
    const result = await db.delete(managers).where(eq(managers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Passes
  async getPasses(): Promise<Pass[]> {
    return db.select().from(passes).orderBy(desc(passes.createdAt));
  }

  async getPass(id: number): Promise<Pass | undefined> {
    const [pass] = await db.select().from(passes).where(eq(passes.id, id));
    return pass;
  }

  async getPassByPassId(passId: string): Promise<Pass | undefined> {
    const [pass] = await db.select().from(passes).where(eq(passes.passId, passId));
    return pass;
  }

  async getPassWithDetails(id: number): Promise<any> {
    const pass = await db.query.passes.findFirst({
      where: eq(passes.id, id),
      with: {
        hiringManager: true,
        passCandidates: {
          with: { candidate: true },
          orderBy: [desc(passCandidates.aiScore)]
        },
        interviews: {
          with: { evaluations: true }
        },
        panelInterviewers: true,
        interviewAvailability: true
      }
    });
    return pass;
  }

  async createPass(pass: InsertPass): Promise<Pass> {
    const year = new Date().getFullYear();
    // Count passes from current year for sequential numbering
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(passes)
      .where(sql`EXTRACT(YEAR FROM ${passes.createdAt}) = ${year}`);
    const count = Number(countResult[0].count);
    const passNumber = String(count + 1).padStart(3, '0');
    const configuredPrefix = process.env.HIREPASS_PASS_ID_PREFIX || "HP";
    const prefix = /^[A-Z0-9]{2,8}$/.test(configuredPrefix) && configuredPrefix !== "BAYN"
      ? configuredPrefix
      : "HP";
    const passId = `${prefix}-RP-${year}-${passNumber}`;

    const [newPass] = await db.insert(passes).values({
      ...pass,
      passId
    }).returning();
    return newPass;
  }

  async updatePass(id: number, pass: Partial<InsertPass>): Promise<Pass | undefined> {
    const [updated] = await db.update(passes)
      .set({ ...pass, updatedAt: new Date() })
      .where(eq(passes.id, id))
      .returning();
    return updated;
  }

  async deletePass(id: number): Promise<boolean> {
    const result = await db.delete(passes).where(eq(passes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Pass Positions
  async getPassPositions(passId: number): Promise<PassPosition[]> {
    return db.select().from(passPositions)
      .where(eq(passPositions.passId, passId))
      .orderBy(desc(passPositions.createdAt));
  }

  async getPassPosition(id: number): Promise<PassPosition | undefined> {
    const [position] = await db.select().from(passPositions).where(eq(passPositions.id, id));
    return position;
  }

  async createPassPosition(data: InsertPassPosition): Promise<PassPosition> {
    const [newPosition] = await db.insert(passPositions).values(data).returning();
    return newPosition;
  }

  async updatePassPosition(id: number, data: Partial<InsertPassPosition>): Promise<PassPosition | undefined> {
    const [updated] = await db.update(passPositions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(passPositions.id, id))
      .returning();
    return updated;
  }

  async deletePassPosition(id: number): Promise<boolean> {
    const result = await db.delete(passPositions).where(eq(passPositions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async incrementPositionHiredCount(positionId: number): Promise<void> {
    await db.update(passPositions)
      .set({ 
        hiredCount: sql`${passPositions.hiredCount} + 1`,
        updatedAt: new Date() 
      })
      .where(eq(passPositions.id, positionId));
  }

  // Candidates
  async getCandidates(): Promise<Candidate[]> {
    return db.select().from(candidates).orderBy(desc(candidates.createdAt));
  }

  async getCandidate(id: number): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
    return candidate;
  }

  async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    const [newCandidate] = await db.insert(candidates).values(candidate).returning();
    return newCandidate;
  }

  async updateCandidate(id: number, candidate: Partial<InsertCandidate>): Promise<Candidate | undefined> {
    const [updated] = await db.update(candidates)
      .set({ ...candidate, updatedAt: new Date() })
      .where(eq(candidates.id, id))
      .returning();
    return updated;
  }

  async deleteCandidate(id: number): Promise<boolean> {
    const result = await db.delete(candidates).where(eq(candidates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Pass Candidates
  async getPassCandidates(passId: number): Promise<(PassCandidate & { candidate: Candidate })[]> {
    const result = await db.query.passCandidates.findMany({
      where: eq(passCandidates.passId, passId),
      with: { candidate: true },
      orderBy: [desc(passCandidates.aiScore)]
    });
    return result as (PassCandidate & { candidate: Candidate })[];
  }

  async addCandidateToPass(passCandidate: InsertPassCandidate): Promise<PassCandidate> {
    const [newPC] = await db.insert(passCandidates).values(passCandidate).returning();
    return newPC;
  }

  async updatePassCandidate(id: number, data: Partial<InsertPassCandidate>): Promise<PassCandidate | undefined> {
    const [updated] = await db.update(passCandidates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(passCandidates.id, id))
      .returning();
    return updated;
  }

  async getCandidatePasses(candidateId: number): Promise<(PassCandidate & { pass: Pass })[]> {
    const result = await db.query.passCandidates.findMany({
      where: eq(passCandidates.candidateId, candidateId),
      with: { pass: true },
      orderBy: [desc(passCandidates.addedAt)]
    });
    return result as (PassCandidate & { pass: Pass })[];
  }

  async getPassCandidate(id: number): Promise<PassCandidate | undefined> {
    const [pc] = await db.select().from(passCandidates).where(eq(passCandidates.id, id));
    return pc;
  }

  async updatePassCandidateStatus(id: number, status: string, notes?: string): Promise<PassCandidate | undefined> {
    const updateData: any = { 
      status, 
      updatedAt: new Date() 
    };
    
    if (status === 'shortlisted') {
      updateData.shortlistedAt = new Date();
    } else if (status === 'rejected') {
      updateData.rejectedAt = new Date();
      if (notes) {
        updateData.rejectionNotes = notes;
      }
    }
    
    if (notes && status !== 'rejected') {
      updateData.selectionNotes = notes;
    }

    const [updated] = await db.update(passCandidates)
      .set(updateData)
      .where(eq(passCandidates.id, id))
      .returning();
    return updated;
  }

  async updatePassCandidateAiScore(id: number, aiScore: number, aiScoreDetails?: object): Promise<PassCandidate | undefined> {
    const updateData: any = { 
      aiScore, 
      updatedAt: new Date() 
    };
    
    if (aiScoreDetails) {
      updateData.aiBrief = JSON.stringify(aiScoreDetails);
    }

    const [updated] = await db.update(passCandidates)
      .set(updateData)
      .where(eq(passCandidates.id, id))
      .returning();
    return updated;
  }

  async bulkUpdatePassCandidateStatus(ids: number[], status: string): Promise<number> {
    if (ids.length === 0) return 0;
    
    const updateData: any = { 
      status, 
      updatedAt: new Date() 
    };
    
    if (status === 'shortlisted') {
      updateData.shortlistedAt = new Date();
    } else if (status === 'rejected') {
      updateData.rejectedAt = new Date();
    }

    const result = await db.update(passCandidates)
      .set(updateData)
      .where(inArray(passCandidates.id, ids));
    return result.rowCount ?? 0;
  }

  async getPassCandidatesPipeline(passId: number): Promise<Record<string, (PassCandidate & { candidate: Candidate })[]>> {
    const allCandidates = await this.getPassCandidates(passId);
    
    const pipeline: Record<string, (PassCandidate & { candidate: Candidate })[]> = {
      new: [],
      screening: [],
      shortlisted: [],
      interview: [],
      offer: [],
      hired: [],
      rejected: []
    };
    
    for (const pc of allCandidates) {
      const status = pc.status || 'new';
      if (status in pipeline) {
        pipeline[status].push(pc);
      } else {
        pipeline.new.push(pc);
      }
    }
    
    return pipeline;
  }

  async removePassCandidate(id: number): Promise<boolean> {
    const result = await db.delete(passCandidates).where(eq(passCandidates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Public Passes
  async getOpenPasses(): Promise<Pass[]> {
    return db.select().from(passes)
      .where(
        or(
          eq(passes.status, 'sourcing'),
          eq(passes.status, 'screening'),
          eq(passes.status, 'active')
        )
      )
      .orderBy(desc(passes.createdAt));
  }

  // Interviews
  async getInterviews(): Promise<Interview[]> {
    return db.select().from(interviews).orderBy(desc(interviews.interviewDate));
  }

  async getInterview(id: number): Promise<Interview | undefined> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, id));
    return interview;
  }

  async createInterview(interview: InsertInterview): Promise<Interview> {
    const [newInterview] = await db.insert(interviews).values(interview).returning();
    return newInterview;
  }

  async updateInterview(id: number, interview: Partial<InsertInterview>): Promise<Interview | undefined> {
    const [updated] = await db.update(interviews)
      .set({ ...interview, updatedAt: new Date() })
      .where(eq(interviews.id, id))
      .returning();
    return updated;
  }

  async deleteInterview(id: number): Promise<boolean> {
    const result = await db.delete(interviews).where(eq(interviews.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getInterviewsByPass(passId: number): Promise<Interview[]> {
    return db.select().from(interviews).where(eq(interviews.passId, passId));
  }

  async getUpcomingInterviews(): Promise<Interview[]> {
    const today = new Date().toISOString().split('T')[0];
    return db.select().from(interviews)
      .where(and(
        gte(interviews.interviewDate, today),
        eq(interviews.status, "scheduled")
      ))
      .orderBy(interviews.interviewDate);
  }

  // Interview Evaluations
  async getEvaluationsByInterview(interviewId: number): Promise<InterviewEvaluation[]> {
    return db.select().from(interviewEvaluations).where(eq(interviewEvaluations.interviewId, interviewId));
  }

  async createEvaluation(evaluation: InsertInterviewEvaluation): Promise<InterviewEvaluation> {
    const scores = [
      evaluation.educationalBackground,
      evaluation.priorWorkExperience,
      evaluation.technicalSkills,
      evaluation.personalityTeamFit,
      evaluation.initiative,
      evaluation.timeManagement
    ].filter(s => s !== null && s !== undefined) as number[];
    
    const averageScore = scores.length > 0 
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
      : null;

    const [newEval] = await db.insert(interviewEvaluations)
      .values({ ...evaluation, averageScore: averageScore as any })
      .returning();
    return newEval;
  }

  // Offers
  async getOffers(passId: number): Promise<Offer[]> {
    return db.select().from(offers).where(eq(offers.passId, passId));
  }

  async createOffer(offer: InsertOffer): Promise<Offer> {
    const [newOffer] = await db.insert(offers).values(offer).returning();
    return newOffer;
  }

  async updateOffer(id: number, offer: Partial<InsertOffer>): Promise<Offer | undefined> {
    const [updated] = await db.update(offers)
      .set({ ...offer, updatedAt: new Date() })
      .where(eq(offers.id, id))
      .returning();
    return updated;
  }

  async getOffersByPassCandidate(passCandidateId: number): Promise<Offer[]> {
    return db.select().from(offers).where(eq(offers.passCandidateId, passCandidateId));
  }

  // Interviews by PassCandidate
  async getInterviewsByPassCandidate(passCandidateId: number): Promise<Interview[]> {
    return db.select().from(interviews)
      .where(eq(interviews.passCandidateId, passCandidateId))
      .orderBy(desc(interviews.interviewDate));
  }

  // Onboarding Records
  async getOnboardingRecord(passCandidateId: number): Promise<OnboardingRecord | undefined> {
    const [record] = await db.select().from(onboardingRecords)
      .where(eq(onboardingRecords.passCandidateId, passCandidateId));
    return record;
  }

  async createOnboardingRecord(record: InsertOnboardingRecord): Promise<OnboardingRecord> {
    const [newRecord] = await db.insert(onboardingRecords).values(record).returning();
    return newRecord;
  }

  async updateOnboardingRecord(id: number, record: Partial<InsertOnboardingRecord>): Promise<OnboardingRecord | undefined> {
    const [updated] = await db.update(onboardingRecords)
      .set({ ...record, updatedAt: new Date() })
      .where(eq(onboardingRecords.id, id))
      .returning();
    return updated;
  }

  async getOnboardingRecordById(id: number): Promise<OnboardingRecord | undefined> {
    const [record] = await db.select().from(onboardingRecords).where(eq(onboardingRecords.id, id));
    return record;
  }

  // Onboarding Links
  async getOnboardingLinkByToken(token: string): Promise<OnboardingLink | undefined> {
    const [link] = await db.select().from(onboardingLinks).where(eq(onboardingLinks.token, token));
    return link;
  }

  async createOnboardingLink(data: InsertOnboardingLink): Promise<OnboardingLink> {
    const token = `onb_${Date.now()}_${randomUUID().substring(0, 8)}`;
    const [link] = await db.insert(onboardingLinks).values({ ...data, token }).returning();
    return link;
  }

  async updateOnboardingLinkAccess(id: number): Promise<void> {
    await db.update(onboardingLinks)
      .set({ accessCount: sql`${onboardingLinks.accessCount} + 1`, lastAccessedAt: new Date() })
      .where(eq(onboardingLinks.id, id));
  }

  // Onboarding Stage Progress
  async getOnboardingStageProgress(onboardingRecordId: number): Promise<OnboardingStageProgress[]> {
    return db.select().from(onboardingStageProgress)
      .where(eq(onboardingStageProgress.onboardingRecordId, onboardingRecordId))
      .orderBy(onboardingStageProgress.stageNumber);
  }

  async createOnboardingStageProgress(data: InsertOnboardingStageProgress): Promise<OnboardingStageProgress> {
    const [stage] = await db.insert(onboardingStageProgress).values(data).returning();
    return stage;
  }

  async updateOnboardingStageProgress(id: number, data: Partial<InsertOnboardingStageProgress>): Promise<OnboardingStageProgress | undefined> {
    const [updated] = await db.update(onboardingStageProgress)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(onboardingStageProgress.id, id))
      .returning();
    return updated;
  }

  async getOrCreateStageProgress(onboardingRecordId: number, stageNumber: number, stageName: string): Promise<OnboardingStageProgress> {
    const existing = await db.select().from(onboardingStageProgress)
      .where(and(
        eq(onboardingStageProgress.onboardingRecordId, onboardingRecordId),
        eq(onboardingStageProgress.stageNumber, stageNumber)
      ));
    if (existing.length > 0) return existing[0];
    return this.createOnboardingStageProgress({
      onboardingRecordId,
      stageNumber,
      stageName,
      status: stageNumber === 1 ? 'in_progress' : 'locked'
    });
  }

  // Share Links
  async getShareLinkByToken(token: string): Promise<ShareLink | undefined> {
    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
    return link;
  }

  async getShareLinksByPass(passId: number): Promise<ShareLink[]> {
    return db.select().from(shareLinks)
      .where(eq(shareLinks.passId, passId))
      .orderBy(desc(shareLinks.createdAt));
  }

  async createShareLink(shareLink: InsertShareLink): Promise<ShareLink> {
    const token = randomUUID();
    const [newLink] = await db.insert(shareLinks).values({ ...shareLink, token }).returning();
    return newLink;
  }

  // Activity Log
  async logActivity(activity: InsertActivityLog): Promise<ActivityLog> {
    const [log] = await db.insert(activityLog).values(activity).returning();
    return log;
  }

  async getActivitiesByPass(passId: number): Promise<ActivityLog[]> {
    return db.select().from(activityLog)
      .where(eq(activityLog.passId, passId))
      .orderBy(desc(activityLog.createdAt));
  }

  // Settings
  async getSettings(): Promise<Setting[]> {
    return db.select().from(settings);
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async upsertSetting(key: string, value: string, description?: string): Promise<Setting> {
    const existing = await this.getSetting(key);
    if (existing) {
      const [updated] = await db.update(settings)
        .set({ value, description, updatedAt: new Date() })
        .where(eq(settings.key, key))
        .returning();
      return updated;
    }
    const [newSetting] = await db.insert(settings)
      .values({ key, value, description })
      .returning();
    return newSetting;
  }

  // Technical Assessments
  async getAssessmentsByPass(passId: number): Promise<TechnicalAssessment[]> {
    return db.select().from(technicalAssessments).where(eq(technicalAssessments.passId, passId));
  }

  async createAssessment(assessment: InsertTechnicalAssessment): Promise<TechnicalAssessment> {
    const [newAssessment] = await db.insert(technicalAssessments).values(assessment).returning();
    return newAssessment;
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(user: UpsertUser): Promise<User> {
    const [upserted] = await db
      .insert(users)
      .values(user)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async markNotificationRead(id: number): Promise<boolean> {
    const result = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Analytics
  async getStats(): Promise<{
    totalCandidates: number;
    activePasses: number;
    scheduledInterviews: number;
    hiredThisMonth: number;
  }> {
    const allCandidates = await db.select().from(candidates);
    const allPasses = await db.select().from(passes);
    const allInterviews = await db.select().from(interviews);
    const allPassCandidates = await db.select().from(passCandidates);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const activePasses = allPasses.filter(p => 
      !['closed_hired', 'closed_cancelled', 'on_hold'].includes(p.status || '')
    ).length;

    const scheduledInterviews = allInterviews.filter(i => 
      i.status === "scheduled"
    ).length;

    const hiredThisMonth = allPassCandidates.filter(pc => 
      pc.status === "hired" && pc.updatedAt && new Date(pc.updatedAt) >= startOfMonth
    ).length;

    return {
      totalCandidates: allCandidates.length,
      activePasses,
      scheduledInterviews,
      hiredThisMonth,
    };
  }

  async getPipelineCounts(): Promise<{
    new: number;
    screening: number;
    shortlisted: number;
    interview: number;
    offer: number;
    hired: number;
    rejected: number;
  }> {
    const allPassCandidates = await db.select().from(passCandidates);
    
    const counts = {
      new: 0,
      screening: 0,
      shortlisted: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    };

    for (const pc of allPassCandidates) {
      const status = pc.status as keyof typeof counts;
      if (status in counts) {
        counts[status]++;
      }
    }

    return counts;
  }

  async getRecruitmentTrends(): Promise<{
    passesCreatedByMonth: { month: string; count: number }[];
    candidatesAddedByMonth: { month: string; count: number }[];
    interviewsByMonth: { month: string; count: number }[];
    hiresbyMonth: { month: string; count: number }[];
    avgTimeToHire: number;
    sourceBreakdown: { source: string; count: number }[];
  }> {
    const allPasses = await db.select().from(passes);
    const allCandidates = await db.select().from(candidates);
    const allInterviews = await db.select().from(interviews);
    const allPassCandidates = await db.select().from(passCandidates);

    const now = new Date();
    const last6Months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last6Months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const getMonth = (date: Date | null | undefined) => {
      if (!date) return null;
      const d = new Date(date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const passesCreatedByMonth = last6Months.map(month => ({
      month,
      count: allPasses.filter(p => getMonth(p.createdAt) === month).length
    }));

    const candidatesAddedByMonth = last6Months.map(month => ({
      month,
      count: allCandidates.filter(c => getMonth(c.createdAt) === month).length
    }));

    const interviewsByMonth = last6Months.map(month => ({
      month,
      count: allInterviews.filter(i => getMonth(i.createdAt) === month).length
    }));

    const hiresbyMonth = last6Months.map(month => ({
      month,
      count: allPassCandidates.filter(pc => 
        pc.status === "hired" && getMonth(pc.updatedAt) === month
      ).length
    }));

    const sourceCount: Record<string, number> = {};
    for (const c of allCandidates) {
      const source = c.source || "Unknown";
      sourceCount[source] = (sourceCount[source] || 0) + 1;
    }
    const sourceBreakdown = Object.entries(sourceCount).map(([source, count]) => ({ source, count }));

    return {
      passesCreatedByMonth,
      candidatesAddedByMonth,
      interviewsByMonth,
      hiresbyMonth,
      avgTimeToHire: 0,
      sourceBreakdown,
    };
  }

  // ============ Manager Pass / Share Link Methods ============
  
  async updateShareLink(id: number, data: Partial<ShareLink>): Promise<ShareLink | undefined> {
    const [updated] = await db.update(shareLinks)
      .set(data)
      .where(eq(shareLinks.id, id))
      .returning();
    return updated;
  }

  async getInterviewSlotsByPass(passId: number): Promise<InterviewSlot[]> {
    return db.select().from(interviewSlots)
      .where(eq(interviewSlots.passId, passId))
      .orderBy(interviewSlots.slotDate, interviewSlots.startTime);
  }

  async getPassCandidatesWithDetails(passId: number): Promise<any[]> {
    const result = await db.select()
      .from(passCandidates)
      .leftJoin(candidates, eq(passCandidates.candidateId, candidates.id))
      .where(eq(passCandidates.passId, passId));
    
    return result.map(r => ({
      ...r.pass_candidates,
      candidate: r.candidates
    }));
  }

  async createInterviewSlot(slot: InsertInterviewSlot): Promise<InterviewSlot> {
    const [newSlot] = await db.insert(interviewSlots).values(slot).returning();
    return newSlot;
  }

  async createPanelInterviewer(data: { passId: number; managerId: number }): Promise<void> {
    await db.insert(panelInterviewers).values(data);
  }

  async createManagerFeedback(data: InsertManagerFeedback): Promise<ManagerFeedback> {
    const [feedback] = await db.insert(managerFeedback).values(data).returning();
    return feedback;
  }

  async createInterviewEvaluation(data: InsertInterviewEvaluation): Promise<InterviewEvaluation> {
    const [evaluation] = await db.insert(interviewEvaluations).values(data).returning();
    return evaluation;
  }

  // ============ Candidate Pass Methods ============

  async getCandidateLinkByToken(token: string): Promise<any | undefined> {
    const [link] = await db.select().from(candidateLinks).where(eq(candidateLinks.token, token));
    return link;
  }

  async getCandidateLinksByPassCandidate(passCandidateId: number): Promise<any[]> {
    return db.select().from(candidateLinks)
      .where(eq(candidateLinks.passCandidateId, passCandidateId))
      .orderBy(desc(candidateLinks.createdAt));
  }

  async updateCandidateLink(id: number, data: Partial<typeof candidateLinks.$inferSelect>): Promise<any | undefined> {
    const [updated] = await db.update(candidateLinks)
      .set(data)
      .where(eq(candidateLinks.id, id))
      .returning();
    return updated;
  }

  async createCandidateLink(data: any): Promise<any> {
    const [link] = await db.insert(candidateLinks).values(data).returning();
    return link;
  }

  async getPassCandidateById(id: number): Promise<PassCandidate | undefined> {
    const [result] = await db.select().from(passCandidates).where(eq(passCandidates.id, id));
    return result;
  }

  async getCandidateMessages(passCandidateId: number): Promise<CandidateMessage[]> {
    return db.select().from(candidateMessages)
      .where(eq(candidateMessages.passCandidateId, passCandidateId))
      .orderBy(desc(candidateMessages.createdAt));
  }

  async createCandidateMessage(data: InsertCandidateMessage): Promise<CandidateMessage> {
    const [message] = await db.insert(candidateMessages).values(data).returning();
    return message;
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    await db.update(candidateMessages)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(candidateMessages.id, messageId));
  }

  async getCandidateDocuments(passCandidateId: number): Promise<CandidateDocument[]> {
    return db.select().from(candidateDocuments)
      .where(eq(candidateDocuments.passCandidateId, passCandidateId))
      .orderBy(desc(candidateDocuments.createdAt));
  }

  async createCandidateDocument(data: InsertCandidateDocument): Promise<CandidateDocument> {
    const [doc] = await db.insert(candidateDocuments).values(data).returning();
    return doc;
  }

  async updateCandidateDocument(id: number, data: Partial<InsertCandidateDocument>): Promise<CandidateDocument | undefined> {
    const [doc] = await db.update(candidateDocuments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(candidateDocuments.id, id))
      .returning();
    return doc;
  }

  async getCandidateTimelineEvents(passCandidateId: number): Promise<CandidateTimelineEvent[]> {
    return db.select().from(candidateTimelineEvents)
      .where(eq(candidateTimelineEvents.passCandidateId, passCandidateId))
      .orderBy(desc(candidateTimelineEvents.createdAt));
  }

  async getAvailableInterviewSlots(passId: number): Promise<InterviewSlot[]> {
    return db.select().from(interviewSlots)
      .where(and(
        eq(interviewSlots.passId, passId),
        eq(interviewSlots.isBooked, false)
      ))
      .orderBy(interviewSlots.slotDate, interviewSlots.startTime);
  }

  async bookInterviewSlot(slotId: number, passCandidateId: number, passId: number): Promise<InterviewSlot | undefined> {
    const [updated] = await db.update(interviewSlots)
      .set({ isBooked: true, bookedBy: passCandidateId, bookedAt: new Date() })
      .where(and(
        eq(interviewSlots.id, slotId),
        eq(interviewSlots.passId, passId),
        eq(interviewSlots.isBooked, false),
      ))
      .returning();
    
    return updated;
  }

  async getOfferByPassCandidate(passCandidateId: number): Promise<Offer | undefined> {
    const [offer] = await db.select().from(offers)
      .where(eq(offers.passCandidateId, passCandidateId))
      .orderBy(desc(offers.createdAt))
      .limit(1);
    return offer;
  }
}

export const storage = new DatabaseStorage();
