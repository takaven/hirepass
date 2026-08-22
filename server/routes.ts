import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertManagerSchema, 
  insertPassSchema,
  insertPassPositionSchema,
  insertCandidateSchema, 
  insertPassCandidateSchema,
  insertInterviewSchema,
  insertInterviewEvaluationSchema,
  insertOfferSchema,
  insertShareLinkSchema,
  insertTechnicalAssessmentSchema,
  insertOnboardingRecordSchema,
} from "@shared/schema";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============ ANALYTICS ROUTES ============
  app.get("/api/analytics/stats", async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  });

  app.get("/api/analytics/pipeline", async (req, res) => {
    try {
      const pipeline = await storage.getPipelineCounts();
      res.json(pipeline);
    } catch (error) {
      console.error("Error fetching pipeline:", error);
      res.status(500).json({ error: "Failed to fetch pipeline data" });
    }
  });

  app.get("/api/analytics/trends", async (req, res) => {
    try {
      const trends = await storage.getRecruitmentTrends();
      res.json(trends);
    } catch (error) {
      console.error("Error fetching trends:", error);
      res.status(500).json({ error: "Failed to fetch trends" });
    }
  });

  // ============ MANAGER ROUTES ============
  app.get("/api/managers", async (req, res) => {
    try {
      const managersList = await storage.getManagers();
      res.json(managersList);
    } catch (error) {
      console.error("Error fetching managers:", error);
      res.status(500).json({ error: "Failed to fetch managers" });
    }
  });

  app.get("/api/managers/:id", async (req, res) => {
    try {
      const manager = await storage.getManager(parseInt(req.params.id));
      if (!manager) {
        return res.status(404).json({ error: "Manager not found" });
      }
      res.json(manager);
    } catch (error) {
      console.error("Error fetching manager:", error);
      res.status(500).json({ error: "Failed to fetch manager" });
    }
  });

  app.post("/api/managers", async (req, res) => {
    try {
      const validated = insertManagerSchema.parse(req.body);
      const manager = await storage.createManager(validated);
      res.status(201).json(manager);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating manager:", error);
      res.status(500).json({ error: "Failed to create manager" });
    }
  });

  app.patch("/api/managers/:id", async (req, res) => {
    try {
      const manager = await storage.updateManager(parseInt(req.params.id), req.body);
      if (!manager) {
        return res.status(404).json({ error: "Manager not found" });
      }
      res.json(manager);
    } catch (error) {
      console.error("Error updating manager:", error);
      res.status(500).json({ error: "Failed to update manager" });
    }
  });

  app.delete("/api/managers/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteManager(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Manager not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting manager:", error);
      res.status(500).json({ error: "Failed to delete manager" });
    }
  });

  // ============ PASS ROUTES ============
  app.get("/api/passes", async (req, res) => {
    try {
      const passesList = await storage.getPasses();
      res.json(passesList);
    } catch (error) {
      console.error("Error fetching passes:", error);
      res.status(500).json({ error: "Failed to fetch passes" });
    }
  });

  app.get("/api/passes/:id", async (req, res) => {
    try {
      const pass = await storage.getPassWithDetails(parseInt(req.params.id));
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }
      res.json(pass);
    } catch (error) {
      console.error("Error fetching pass:", error);
      res.status(500).json({ error: "Failed to fetch pass" });
    }
  });

  // Lookup pass by readable passId (e.g., BAYN-RP-2025-001 or RP-2025-001 for legacy)
  app.get("/api/passes/lookup/:passId", async (req, res) => {
    try {
      let { passId } = req.params;
      // Validate passId format - accept both BAYN-RP-YYYY-NNN and legacy RP-YYYY-NNN
      const newFormat = /^BAYN-(RP|CP|OP)-\d{4}-\d{3}$/;
      const legacyFormat = /^(RP|CP|OP)-\d{4}-\d{3}$/;
      
      if (!newFormat.test(passId) && !legacyFormat.test(passId)) {
        return res.status(400).json({ error: "Invalid pass ID format. Expected: BAYN-RP-YYYY-NNN or RP-YYYY-NNN" });
      }
      
      // For clean URLs with BAYN prefix, strip it for database lookup (existing data uses RP-YYYY-NNN)
      const lookupId = passId.startsWith("BAYN-") ? passId.substring(5) : passId;
      
      const pass = await storage.getPassByPassId(lookupId);
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }
      // Get full details using numeric id
      const passWithDetails = await storage.getPassWithDetails(pass.id);
      res.json(passWithDetails);
    } catch (error) {
      console.error("Error fetching pass by passId:", error);
      res.status(500).json({ error: "Failed to fetch pass" });
    }
  });

  app.post("/api/passes", async (req, res) => {
    try {
      const validated = insertPassSchema.parse(req.body);
      const pass = await storage.createPass(validated);
      
      await storage.logActivity({
        passId: pass.id,
        actorType: 'admin',
        actorName: 'HR Admin',
        action: 'created_pass',
        targetType: 'pass',
        targetId: pass.id,
        details: { passId: pass.passId }
      });

      res.status(201).json(pass);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating pass:", error);
      res.status(500).json({ error: "Failed to create pass" });
    }
  });

  app.patch("/api/passes/:id", async (req, res) => {
    try {
      const pass = await storage.updatePass(parseInt(req.params.id), req.body);
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }
      res.json(pass);
    } catch (error) {
      console.error("Error updating pass:", error);
      res.status(500).json({ error: "Failed to update pass" });
    }
  });

  app.delete("/api/passes/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePass(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Pass not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting pass:", error);
      res.status(500).json({ error: "Failed to delete pass" });
    }
  });

  // ============ PASS POSITION ROUTES ============
  app.get("/api/passes/:passId/positions", async (req, res) => {
    try {
      const positions = await storage.getPassPositions(parseInt(req.params.passId));
      res.json(positions);
    } catch (error) {
      console.error("Error fetching pass positions:", error);
      res.status(500).json({ error: "Failed to fetch pass positions" });
    }
  });

  app.post("/api/passes/:passId/positions", async (req, res) => {
    try {
      const validated = insertPassPositionSchema.parse({
        ...req.body,
        passId: parseInt(req.params.passId)
      });
      const position = await storage.createPassPosition(validated);
      res.status(201).json(position);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating pass position:", error);
      res.status(500).json({ error: "Failed to create pass position" });
    }
  });

  app.patch("/api/pass-positions/:id", async (req, res) => {
    try {
      const position = await storage.updatePassPosition(parseInt(req.params.id), req.body);
      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }
      res.json(position);
    } catch (error) {
      console.error("Error updating pass position:", error);
      res.status(500).json({ error: "Failed to update pass position" });
    }
  });

  app.delete("/api/pass-positions/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePassPosition(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Position not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting pass position:", error);
      res.status(500).json({ error: "Failed to delete pass position" });
    }
  });

  // ============ CANDIDATE ROUTES ============
  app.get("/api/candidates", async (req, res) => {
    try {
      const candidatesList = await storage.getCandidates();
      // Enrich each candidate with their linked passes
      const enrichedCandidates = await Promise.all(
        candidatesList.map(async (candidate) => {
          const passCandidates = await storage.getCandidatePasses(candidate.id);
          return {
            ...candidate,
            passCandidates,
          };
        })
      );
      res.json(enrichedCandidates);
    } catch (error) {
      console.error("Error fetching candidates:", error);
      res.status(500).json({ error: "Failed to fetch candidates" });
    }
  });

  app.get("/api/candidates/:id", async (req, res) => {
    try {
      const candidate = await storage.getCandidate(parseInt(req.params.id));
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      res.json(candidate);
    } catch (error) {
      console.error("Error fetching candidate:", error);
      res.status(500).json({ error: "Failed to fetch candidate" });
    }
  });

  app.post("/api/candidates", async (req, res) => {
    try {
      const validated = insertCandidateSchema.parse(req.body);
      const candidate = await storage.createCandidate(validated);
      res.status(201).json(candidate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating candidate:", error);
      res.status(500).json({ error: "Failed to create candidate" });
    }
  });

  app.patch("/api/candidates/:id", async (req, res) => {
    try {
      const candidate = await storage.updateCandidate(parseInt(req.params.id), req.body);
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      res.json(candidate);
    } catch (error) {
      console.error("Error updating candidate:", error);
      res.status(500).json({ error: "Failed to update candidate" });
    }
  });

  app.delete("/api/candidates/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCandidate(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting candidate:", error);
      res.status(500).json({ error: "Failed to delete candidate" });
    }
  });

  // ============ PASS CANDIDATE ROUTES ============
  app.get("/api/passes/:passId/candidates", async (req, res) => {
    try {
      const passCandidates = await storage.getPassCandidates(parseInt(req.params.passId));
      res.json(passCandidates);
    } catch (error) {
      console.error("Error fetching pass candidates:", error);
      res.status(500).json({ error: "Failed to fetch pass candidates" });
    }
  });

  app.post("/api/passes/:passId/candidates", async (req, res) => {
    try {
      const validated = insertPassCandidateSchema.parse({
        ...req.body,
        passId: parseInt(req.params.passId)
      });
      const passCandidate = await storage.addCandidateToPass(validated);
      res.status(201).json(passCandidate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error adding candidate to pass:", error);
      res.status(500).json({ error: "Failed to add candidate to pass" });
    }
  });

  app.patch("/api/pass-candidates/:id", async (req, res) => {
    try {
      const passCandidate = await storage.updatePassCandidate(parseInt(req.params.id), req.body);
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      res.json(passCandidate);
    } catch (error) {
      console.error("Error updating pass candidate:", error);
      res.status(500).json({ error: "Failed to update pass candidate" });
    }
  });

  app.delete("/api/pass-candidates/:id", async (req, res) => {
    try {
      const deleted = await storage.removePassCandidate(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error removing pass candidate:", error);
      res.status(500).json({ error: "Failed to remove pass candidate" });
    }
  });

  // Pass candidates pipeline view
  app.get("/api/passes/:passId/candidates/pipeline", async (req, res) => {
    try {
      const pipeline = await storage.getPassCandidatesPipeline(parseInt(req.params.passId));
      res.json(pipeline);
    } catch (error) {
      console.error("Error fetching pipeline:", error);
      res.status(500).json({ error: "Failed to fetch pipeline data" });
    }
  });

  // Bulk update pass candidate statuses
  const bulkUpdateSchema = z.object({
    ids: z.array(z.number()).min(1, "At least one ID is required"),
    status: z.string().min(1, "Status is required")
  });

  app.post("/api/pass-candidates/bulk-update", async (req, res) => {
    try {
      const validated = bulkUpdateSchema.parse(req.body);
      const updatedCount = await storage.bulkUpdatePassCandidateStatus(validated.ids, validated.status);
      res.json({ success: true, updatedCount });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error bulk updating pass candidates:", error);
      res.status(500).json({ error: "Failed to bulk update pass candidates" });
    }
  });

  // Update pass candidate status with notes
  const updateStatusSchema = z.object({
    status: z.string().min(1, "Status is required"),
    notes: z.string().optional()
  });

  app.patch("/api/pass-candidates/:id/status", async (req, res) => {
    try {
      const validated = updateStatusSchema.parse(req.body);
      const passCandidateId = parseInt(req.params.id);
      
      // Get the pass candidate to find the pass and candidate info
      const existingPC = await storage.getPassCandidate(passCandidateId);
      if (!existingPC) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      
      const oldStatus = existingPC.status;
      
      const passCandidate = await storage.updatePassCandidateStatus(
        passCandidateId,
        validated.status,
        validated.notes
      );
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      
      // Create notification for status change
      try {
        const pass = await storage.getPass(existingPC.passId);
        const candidate = await storage.getCandidate(existingPC.candidateId);
        
        if (pass && candidate) {
          // Create a notification for the hiring manager (if exists) or use a mock user
          const notificationUserId = pass.hiringManagerId ? `manager-${pass.hiringManagerId}` : 'admin-user';
          
          const statusLabels: Record<string, string> = {
            new: 'New',
            screening: 'Screening',
            shortlisted: 'Shortlisted',
            interview: 'Interview',
            offer: 'Offer',
            hired: 'Hired',
            rejected: 'Rejected'
          };
          
          const newStatusLabel = statusLabels[validated.status] || validated.status;
          const oldStatusLabel = statusLabels[oldStatus || 'new'] || oldStatus || 'New';
          
          await storage.createNotification({
            userId: notificationUserId,
            type: 'candidate_status_change',
            title: `Candidate Status Updated`,
            message: `${candidate.name} moved from ${oldStatusLabel} to ${newStatusLabel} for ${pass.positionTitle}`,
            link: `/passes/${pass.id}/candidates`
          });
        }
      } catch (notifError) {
        console.error("Error creating notification:", notifError);
        // Don't fail the main operation if notification fails
      }
      
      res.json(passCandidate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating pass candidate status:", error);
      res.status(500).json({ error: "Failed to update pass candidate status" });
    }
  });

  // Update pass candidate AI score
  const updateAiScoreSchema = z.object({
    aiScore: z.number().min(0).max(100),
    aiScoreDetails: z.object({}).passthrough().optional()
  });

  app.patch("/api/pass-candidates/:id/ai-score", async (req, res) => {
    try {
      const validated = updateAiScoreSchema.parse(req.body);
      const passCandidate = await storage.updatePassCandidateAiScore(
        parseInt(req.params.id),
        validated.aiScore,
        validated.aiScoreDetails
      );
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      res.json(passCandidate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating pass candidate AI score:", error);
      res.status(500).json({ error: "Failed to update pass candidate AI score" });
    }
  });

  // Get all passes for a candidate
  app.get("/api/candidates/:candidateId/passes", async (req, res) => {
    try {
      const candidatePasses = await storage.getCandidatePasses(parseInt(req.params.candidateId));
      res.json(candidatePasses);
    } catch (error) {
      console.error("Error fetching candidate passes:", error);
      res.status(500).json({ error: "Failed to fetch candidate passes" });
    }
  });

  // ============ PUBLIC ROUTES ============
  // Get open passes (for public job listings)
  app.get("/api/public/passes", async (req, res) => {
    try {
      const openPasses = await storage.getOpenPasses();
      // Return only public-facing information
      const publicPasses = openPasses.map(pass => ({
        id: pass.id,
        passId: pass.passId,
        positionTitle: pass.positionTitle,
        department: pass.department,
        location: pass.location,
        employmentType: pass.employmentType,
        experienceMin: pass.experienceMin,
        experienceMax: pass.experienceMax,
        salaryRangeMin: pass.salaryRangeMin,
        salaryRangeMax: pass.salaryRangeMax,
        salaryCurrency: pass.salaryCurrency,
        jobDescriptionFinal: pass.jobDescriptionFinal,
        dateRequested: pass.dateRequested
      }));
      res.json(publicPasses);
    } catch (error) {
      console.error("Error fetching public passes:", error);
      res.status(500).json({ error: "Failed to fetch open positions" });
    }
  });

  // Public application route
  const publicApplySchema = z.object({
    passId: z.number(),
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    phone: z.string().optional(),
    currentTitle: z.string().optional(),
    currentCompany: z.string().optional(),
    experienceYears: z.number().optional(),
    currentLocation: z.string().optional(),
    linkedinUrl: z.string().url().optional().or(z.literal("")),
    cvSummary: z.string().optional(),
    source: z.string().optional(),
    skills: z.array(z.string()).optional(),
    expectedSalary: z.number().optional(),
    willingToRelocate: z.boolean().optional()
  });

  app.post("/api/public/apply", async (req, res) => {
    try {
      const validated = publicApplySchema.parse(req.body);
      
      // Check if pass exists and is open
      const pass = await storage.getPass(validated.passId);
      if (!pass) {
        return res.status(404).json({ error: "Position not found" });
      }
      
      const openStatuses = ['sourcing', 'screening', 'active'];
      if (!openStatuses.includes(pass.status || '')) {
        return res.status(400).json({ error: "This position is no longer accepting applications" });
      }

      // Check if candidate already exists by email
      const existingCandidates = await storage.getCandidates();
      let candidate = existingCandidates.find(c => c.email === validated.email);
      
      if (!candidate) {
        // Create new candidate
        candidate = await storage.createCandidate({
          name: validated.name,
          email: validated.email,
          phone: validated.phone,
          currentTitle: validated.currentTitle,
          currentCompany: validated.currentCompany,
          experienceYears: validated.experienceYears,
          currentLocation: validated.currentLocation,
          linkedinUrl: validated.linkedinUrl,
          cvSummary: validated.cvSummary,
          source: validated.source || 'public_application',
          skills: validated.skills,
          expectedSalary: validated.expectedSalary,
          willingToRelocate: validated.willingToRelocate
        });
      }

      // Check if candidate already applied to this pass
      const existingApplications = await storage.getCandidatePasses(candidate.id);
      const alreadyApplied = existingApplications.some(pc => pc.passId === validated.passId);
      
      if (alreadyApplied) {
        return res.status(409).json({ error: "You have already applied to this position" });
      }

      // Create pass-candidate link
      const passCandidate = await storage.addCandidateToPass({
        passId: validated.passId,
        candidateId: candidate.id,
        status: 'new'
      });

      // Log activity
      await storage.logActivity({
        passId: validated.passId,
        actorType: 'candidate',
        actorName: validated.name,
        action: 'applied',
        targetType: 'pass_candidate',
        targetId: passCandidate.id,
        details: { candidateEmail: validated.email }
      });

      res.status(201).json({ 
        success: true, 
        message: "Application submitted successfully",
        applicationId: passCandidate.id 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error processing public application:", error);
      res.status(500).json({ error: "Failed to submit application" });
    }
  });

  // ============ INTERVIEW ROUTES ============
  app.get("/api/interviews", async (req, res) => {
    try {
      const interviewsList = await storage.getInterviews();
      res.json(interviewsList);
    } catch (error) {
      console.error("Error fetching interviews:", error);
      res.status(500).json({ error: "Failed to fetch interviews" });
    }
  });

  app.get("/api/interviews/upcoming", async (req, res) => {
    try {
      const upcoming = await storage.getUpcomingInterviews();
      res.json(upcoming);
    } catch (error) {
      console.error("Error fetching upcoming interviews:", error);
      res.status(500).json({ error: "Failed to fetch upcoming interviews" });
    }
  });

  app.get("/api/interviews/:id", async (req, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.id));
      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
      }
      res.json(interview);
    } catch (error) {
      console.error("Error fetching interview:", error);
      res.status(500).json({ error: "Failed to fetch interview" });
    }
  });

  app.post("/api/interviews", async (req, res) => {
    try {
      const validated = insertInterviewSchema.parse(req.body);
      const interview = await storage.createInterview(validated);
      res.status(201).json(interview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating interview:", error);
      res.status(500).json({ error: "Failed to create interview" });
    }
  });

  app.patch("/api/interviews/:id", async (req, res) => {
    try {
      const interview = await storage.updateInterview(parseInt(req.params.id), req.body);
      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
      }
      res.json(interview);
    } catch (error) {
      console.error("Error updating interview:", error);
      res.status(500).json({ error: "Failed to update interview" });
    }
  });

  app.delete("/api/interviews/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteInterview(parseInt(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "Interview not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting interview:", error);
      res.status(500).json({ error: "Failed to delete interview" });
    }
  });

  // ============ EVALUATION ROUTES ============
  app.post("/api/evaluations", async (req, res) => {
    try {
      const validated = insertInterviewEvaluationSchema.parse(req.body);
      const evaluation = await storage.createEvaluation(validated);
      res.status(201).json(evaluation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating evaluation:", error);
      res.status(500).json({ error: "Failed to create evaluation" });
    }
  });

  app.get("/api/interviews/:interviewId/evaluations", async (req, res) => {
    try {
      const evaluations = await storage.getEvaluationsByInterview(parseInt(req.params.interviewId));
      res.json(evaluations);
    } catch (error) {
      console.error("Error fetching evaluations:", error);
      res.status(500).json({ error: "Failed to fetch evaluations" });
    }
  });

  // ============ SETTINGS ROUTES ============
  app.get("/api/settings", async (req, res) => {
    try {
      const settingsList = await storage.getSettings();
      res.json(settingsList);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings/:key", async (req, res) => {
    try {
      const { value, description } = req.body;
      const setting = await storage.upsertSetting(req.params.key, value, description);
      res.json(setting);
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  // ============ OFFER ROUTES ============
  app.get("/api/passes/:passId/offers", async (req, res) => {
    try {
      const offersList = await storage.getOffers(parseInt(req.params.passId));
      res.json(offersList);
    } catch (error) {
      console.error("Error fetching offers:", error);
      res.status(500).json({ error: "Failed to fetch offers" });
    }
  });

  app.post("/api/offers", async (req, res) => {
    try {
      const validated = insertOfferSchema.parse(req.body);
      const offer = await storage.createOffer(validated);
      res.status(201).json(offer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating offer:", error);
      res.status(500).json({ error: "Failed to create offer" });
    }
  });

  app.patch("/api/offers/:id", async (req, res) => {
    try {
      const offer = await storage.updateOffer(parseInt(req.params.id), req.body);
      if (!offer) {
        return res.status(404).json({ error: "Offer not found" });
      }
      res.json(offer);
    } catch (error) {
      console.error("Error updating offer:", error);
      res.status(500).json({ error: "Failed to update offer" });
    }
  });

  // Get offers for a specific pass-candidate
  app.get("/api/pass-candidates/:passCandidateId/offers", async (req, res) => {
    try {
      const offers = await storage.getOffersByPassCandidate(parseInt(req.params.passCandidateId));
      res.json(offers);
    } catch (error) {
      console.error("Error fetching offers for pass-candidate:", error);
      res.status(500).json({ error: "Failed to fetch offers" });
    }
  });

  // Get interviews for a specific pass-candidate
  app.get("/api/pass-candidates/:passCandidateId/interviews", async (req, res) => {
    try {
      const interviews = await storage.getInterviewsByPassCandidate(parseInt(req.params.passCandidateId));
      res.json(interviews);
    } catch (error) {
      console.error("Error fetching interviews for pass-candidate:", error);
      res.status(500).json({ error: "Failed to fetch interviews" });
    }
  });

  // ============ ONBOARDING ROUTES ============
  app.get("/api/onboarding/:passCandidateId", async (req, res) => {
    try {
      const record = await storage.getOnboardingRecord(parseInt(req.params.passCandidateId));
      if (!record) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      res.json(record);
    } catch (error) {
      console.error("Error fetching onboarding record:", error);
      res.status(500).json({ error: "Failed to fetch onboarding record" });
    }
  });

  app.post("/api/onboarding", async (req, res) => {
    try {
      const validated = insertOnboardingRecordSchema.parse(req.body);
      const record = await storage.createOnboardingRecord(validated);
      res.status(201).json(record);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating onboarding record:", error);
      res.status(500).json({ error: "Failed to create onboarding record" });
    }
  });

  app.patch("/api/onboarding/:id", async (req, res) => {
    try {
      const record = await storage.updateOnboardingRecord(parseInt(req.params.id), req.body);
      if (!record) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      res.json(record);
    } catch (error) {
      console.error("Error updating onboarding record:", error);
      res.status(500).json({ error: "Failed to update onboarding record" });
    }
  });

  // ============ SHARE LINK ROUTES ============
  app.post("/api/share-links", async (req, res) => {
    try {
      const { passId, managerId, linkType, expiresAt } = req.body;
      const shareLink = await storage.createShareLink({
        passId,
        managerId,
        linkType: linkType || "manager",
        expiresAt: expiresAt ? new Date(expiresAt) : undefined
      });
      res.status(201).json(shareLink);
    } catch (error) {
      console.error("Error creating share link:", error);
      res.status(500).json({ error: "Failed to create share link" });
    }
  });

  app.get("/api/share-links/:token", async (req, res) => {
    try {
      const shareLink = await storage.getShareLinkByToken(req.params.token);
      if (!shareLink) {
        return res.status(404).json({ error: "Share link not found or expired" });
      }
      
      if (shareLink.expiresAt && new Date(shareLink.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }

      const pass = await storage.getPassWithDetails(shareLink.passId);
      res.json({ shareLink, pass });
    } catch (error) {
      console.error("Error fetching share link:", error);
      res.status(500).json({ error: "Failed to fetch share link" });
    }
  });

  // ============ CANDIDATE LINK ROUTES ============
  app.post("/api/candidate-links", async (req, res) => {
    try {
      const { passCandidateId, expiresAt } = req.body;
      
      // Validate passCandidateId is provided and is a number
      if (!passCandidateId || typeof passCandidateId !== 'number') {
        return res.status(400).json({ error: "Valid passCandidateId is required" });
      }
      
      // Verify the pass candidate exists
      const passCandidate = await storage.getPassCandidateById(passCandidateId);
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      
      // Generate a unique token
      const token = `cand_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
      const candidateLink = await storage.createCandidateLink({
        token,
        passCandidateId,
        isActive: true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      
      res.status(201).json(candidateLink);
    } catch (error) {
      console.error("Error creating candidate link:", error);
      res.status(500).json({ error: "Failed to create candidate link" });
    }
  });

  // ============ MANAGER PASS ROUTES (Token-based access) ============
  
  // Get manager pass data by token
  app.get("/api/manager-pass/:token", async (req, res) => {
    try {
      const shareLink = await storage.getShareLinkByToken(req.params.token);
      if (!shareLink || !shareLink.isActive) {
        return res.status(404).json({ error: "Invalid or inactive share link" });
      }
      
      if (shareLink.expiresAt && new Date(shareLink.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      
      // Update access tracking
      await storage.updateShareLink(shareLink.id, {
        accessCount: (shareLink.accessCount || 0) + 1,
        lastAccessedAt: new Date()
      });
      
      const pass = await storage.getPassWithDetails(shareLink.passId);
      const candidates = await storage.getPassCandidatesWithDetails(shareLink.passId);
      const interviews = await storage.getInterviewsByPass(shareLink.passId);
      const manager = shareLink.managerId ? await storage.getManager(shareLink.managerId) : null;
      const interviewSlots = await storage.getInterviewSlotsByPass(shareLink.passId);
      
      res.json({
        shareLink,
        pass,
        candidates,
        interviews,
        manager,
        interviewSlots
      });
    } catch (error) {
      console.error("Error fetching manager pass:", error);
      res.status(500).json({ error: "Failed to fetch manager pass data" });
    }
  });
  
  // Manager approves JD
  app.post("/api/manager-pass/:token/approve-jd", async (req, res) => {
    try {
      const shareLink = await storage.getShareLinkByToken(req.params.token);
      if (!shareLink || !shareLink.isActive) {
        return res.status(404).json({ error: "Invalid share link" });
      }
      
      const pass = await storage.updatePass(shareLink.passId, {
        jdStatus: 'approved',
        jdApprovedAt: new Date(),
        jdApprovedBy: shareLink.managerId
      });
      
      res.json({ message: "JD approved successfully", pass });
    } catch (error) {
      console.error("Error approving JD:", error);
      res.status(500).json({ error: "Failed to approve JD" });
    }
  });
  
  // Manager requests JD changes
  app.post("/api/manager-pass/:token/request-jd-changes", async (req, res) => {
    try {
      const shareLink = await storage.getShareLinkByToken(req.params.token);
      if (!shareLink || !shareLink.isActive) {
        return res.status(404).json({ error: "Invalid share link" });
      }
      
      const { feedback } = req.body;
      
      await storage.createManagerFeedback({
        passId: shareLink.passId,
        managerId: shareLink.managerId!,
        feedbackType: 'jd_changes',
        feedback
      });
      
      const pass = await storage.updatePass(shareLink.passId, {
        jdStatus: 'changes_requested'
      });
      
      res.json({ message: "Feedback submitted successfully", pass });
    } catch (error) {
      console.error("Error submitting JD feedback:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });
  
  // Manager updates salary range
  app.patch("/api/manager-pass/:token/salary-range", async (req, res) => {
    try {
      const shareLink = await storage.getShareLinkByToken(req.params.token);
      if (!shareLink || !shareLink.isActive) {
        return res.status(404).json({ error: "Invalid share link" });
      }
      
      const { salaryRangeMin, salaryRangeMax } = req.body;
      
      const pass = await storage.updatePass(shareLink.passId, {
        salaryRangeMin,
        salaryRangeMax
      });
      
      res.json({ message: "Salary range updated", pass });
    } catch (error) {
      console.error("Error updating salary range:", error);
      res.status(500).json({ error: "Failed to update salary range" });
    }
  });
  
  // Manager sets interview availability
  app.post("/api/manager-pass/:token/interview-setup", async (req, res) => {
    try {
      const shareLink = await storage.getShareLinkByToken(req.params.token);
      if (!shareLink || !shareLink.isActive) {
        return res.status(404).json({ error: "Invalid share link" });
      }
      
      const { 
        technicalAssessmentRequired,
        interviewFormat,
        interviewRounds,
        interviewDuration,
        availableDates,
        timeSlots,
        additionalInterviewers,
        isPanelInterview
      } = req.body;
      
      // Update pass with interview setup
      await storage.updatePass(shareLink.passId, {
        technicalAssessmentRequired,
        interviewFormat,
        interviewRounds,
        interviewDuration,
        isPanelInterview,
        interviewSetupCompleted: true
      });
      
      // Create interview slots if provided
      if (availableDates && timeSlots) {
        for (const date of availableDates) {
          for (const slot of timeSlots) {
            await storage.createInterviewSlot({
              passId: shareLink.passId,
              slotDate: date,
              startTime: slot,
              endTime: slot, // End time will be calculated based on duration
              format: interviewFormat,
              interviewerId: shareLink.managerId
            });
          }
        }
      }
      
      // Add additional panel interviewers
      if (additionalInterviewers && additionalInterviewers.length > 0) {
        for (const interviewerId of additionalInterviewers) {
          await storage.createPanelInterviewer({
            passId: shareLink.passId,
            managerId: interviewerId
          });
        }
      }
      
      res.json({ message: "Interview setup completed" });
    } catch (error) {
      console.error("Error setting up interviews:", error);
      res.status(500).json({ error: "Failed to set up interviews" });
    }
  });
  
  // Manager shortlists candidate
  app.post("/api/manager-pass/:token/candidates/:candidateId/shortlist", async (req, res) => {
    try {
      const shareLink = await storage.getShareLinkByToken(req.params.token);
      if (!shareLink || !shareLink.isActive) {
        return res.status(404).json({ error: "Invalid share link" });
      }
      
      const passCandidate = await storage.updatePassCandidate(parseInt(req.params.candidateId), {
        status: 'shortlisted',
        shortlistedAt: new Date()
      });
      
      res.json({ message: "Candidate shortlisted", passCandidate });
    } catch (error) {
      console.error("Error shortlisting candidate:", error);
      res.status(500).json({ error: "Failed to shortlist candidate" });
    }
  });
  
  // Manager rejects candidate
  app.post("/api/manager-pass/:token/candidates/:candidateId/reject", async (req, res) => {
    try {
      const shareLink = await storage.getShareLinkByToken(req.params.token);
      if (!shareLink || !shareLink.isActive) {
        return res.status(404).json({ error: "Invalid share link" });
      }
      
      const { reason, notes } = req.body;
      
      const passCandidate = await storage.updatePassCandidate(parseInt(req.params.candidateId), {
        status: 'rejected',
        rejectionReason: reason,
        rejectionNotes: notes,
        rejectedAt: new Date()
      });
      
      res.json({ message: "Candidate rejected", passCandidate });
    } catch (error) {
      console.error("Error rejecting candidate:", error);
      res.status(500).json({ error: "Failed to reject candidate" });
    }
  });
  
  // Manager submits interview evaluation
  app.post("/api/manager-pass/:token/evaluations", async (req, res) => {
    try {
      const shareLink = await storage.getShareLinkByToken(req.params.token);
      if (!shareLink || !shareLink.isActive) {
        return res.status(404).json({ error: "Invalid share link" });
      }
      
      const validated = insertInterviewEvaluationSchema.parse({
        ...req.body,
        evaluatorId: shareLink.managerId
      });
      
      const evaluation = await storage.createInterviewEvaluation(validated);
      res.status(201).json(evaluation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error submitting evaluation:", error);
      res.status(500).json({ error: "Failed to submit evaluation" });
    }
  });
  
  // Manager makes final decision on candidates
  app.post("/api/manager-pass/:token/final-decisions", async (req, res) => {
    try {
      const shareLink = await storage.getShareLinkByToken(req.params.token);
      if (!shareLink || !shareLink.isActive) {
        return res.status(404).json({ error: "Invalid share link" });
      }
      
      const { decisions } = req.body; // Array of { passCandidateId, decision: 'hire' | 'reserve' | 'reject', notes }
      
      for (const { passCandidateId, decision, notes } of decisions) {
        if (decision === 'hire') {
          await storage.updatePassCandidate(passCandidateId, {
            status: 'offer',
            selectionNotes: notes
          });
        } else if (decision === 'reject') {
          await storage.updatePassCandidate(passCandidateId, {
            status: 'rejected',
            rejectionReason: 'Not selected after interview',
            rejectionNotes: notes,
            rejectedAt: new Date()
          });
        } else if (decision === 'reserve') {
          await storage.updatePassCandidate(passCandidateId, {
            status: 'shortlisted', // Keep in shortlist as reserve
            selectionNotes: `RESERVE: ${notes || ''}`
          });
        }
      }
      
      res.json({ message: "Final decisions submitted" });
    } catch (error) {
      console.error("Error submitting final decisions:", error);
      res.status(500).json({ error: "Failed to submit final decisions" });
    }
  });
  
  // ============ CANDIDATE PASS ROUTES (Token-based access) ============
  
  // Get candidate pass data by token
  app.get("/api/candidate-pass/:token", async (req, res) => {
    try {
      const candidateLink = await storage.getCandidateLinkByToken(req.params.token);
      if (!candidateLink || !candidateLink.isActive) {
        return res.status(404).json({ error: "Invalid or inactive link" });
      }
      
      if (candidateLink.expiresAt && new Date(candidateLink.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Link has expired" });
      }
      
      const passCandidate = await storage.getPassCandidateById(candidateLink.passCandidateId);
      if (!passCandidate) {
        return res.status(404).json({ error: "Candidate application not found" });
      }
      
      const candidate = await storage.getCandidate(passCandidate.candidateId);
      const pass = await storage.getPass(passCandidate.passId);
      const messages = await storage.getCandidateMessages(candidateLink.passCandidateId);
      const documents = await storage.getCandidateDocuments(candidateLink.passCandidateId);
      const timeline = await storage.getCandidateTimelineEvents(candidateLink.passCandidateId);
      const interviews = await storage.getInterviewsByPassCandidate(candidateLink.passCandidateId);
      const offer = await storage.getOfferByPassCandidate(candidateLink.passCandidateId);
      const interviewSlots = pass ? await storage.getAvailableInterviewSlots(pass.id) : [];
      
      res.json({
        candidateLink,
        candidate,
        passCandidate,
        pass,
        messages,
        documents,
        timeline,
        interviews,
        offer,
        interviewSlots
      });
    } catch (error) {
      console.error("Error fetching candidate pass:", error);
      res.status(500).json({ error: "Failed to fetch candidate pass data" });
    }
  });
  
  // Candidate selects interview slot
  app.post("/api/candidate-pass/:token/interview-slot", async (req, res) => {
    try {
      const candidateLink = await storage.getCandidateLinkByToken(req.params.token);
      if (!candidateLink || !candidateLink.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      const { slotId } = req.body;
      
      // Book the slot
      const slot = await storage.bookInterviewSlot(slotId, candidateLink.passCandidateId);
      if (!slot) {
        return res.status(400).json({ error: "Slot not available" });
      }
      
      // Create the interview
      const passCandidate = await storage.getPassCandidateById(candidateLink.passCandidateId);
      if (passCandidate) {
        await storage.createInterview({
          passId: passCandidate.passId,
          passCandidateId: candidateLink.passCandidateId,
          interviewDate: slot.slotDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          duration: 60, // Default duration
          format: slot.format,
          location: slot.location,
          meetingLink: slot.meetingLink,
          status: 'scheduled'
        });
        
        // Update candidate status
        await storage.updatePassCandidate(candidateLink.passCandidateId, {
          status: 'interview'
        });
      }
      
      res.json({ message: "Interview slot booked", slot });
    } catch (error) {
      console.error("Error booking interview slot:", error);
      res.status(500).json({ error: "Failed to book interview slot" });
    }
  });
  
  // Candidate uploads document
  app.post("/api/candidate-pass/:token/documents", async (req, res) => {
    try {
      const candidateLink = await storage.getCandidateLinkByToken(req.params.token);
      if (!candidateLink || !candidateLink.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      const { docType, label, fileName, filePath, fileSize } = req.body;
      
      const document = await storage.createCandidateDocument({
        passCandidateId: candidateLink.passCandidateId,
        docType,
        label,
        fileName,
        filePath,
        fileSize,
        status: 'uploaded',
        uploadedAt: new Date()
      });
      
      res.status(201).json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });
  
  // Candidate sends message
  app.post("/api/candidate-pass/:token/messages", async (req, res) => {
    try {
      const candidateLink = await storage.getCandidateLinkByToken(req.params.token);
      if (!candidateLink || !candidateLink.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      const passCandidate = await storage.getPassCandidateById(candidateLink.passCandidateId);
      const candidate = passCandidate ? await storage.getCandidate(passCandidate.candidateId) : null;
      
      const { message, attachments } = req.body;
      
      const msg = await storage.createCandidateMessage({
        passCandidateId: candidateLink.passCandidateId,
        senderType: 'candidate',
        senderName: candidate?.name || 'Candidate',
        message,
        attachments
      });
      
      res.status(201).json(msg);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });
  
  // Candidate marks message as read
  app.patch("/api/candidate-pass/:token/messages/:messageId/read", async (req, res) => {
    try {
      const candidateLink = await storage.getCandidateLinkByToken(req.params.token);
      if (!candidateLink || !candidateLink.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      await storage.markMessageAsRead(parseInt(req.params.messageId));
      res.json({ message: "Message marked as read" });
    } catch (error) {
      console.error("Error marking message as read:", error);
      res.status(500).json({ error: "Failed to mark message as read" });
    }
  });
  
  // Candidate responds to offer
  app.post("/api/candidate-pass/:token/offer-response", async (req, res) => {
    try {
      const candidateLink = await storage.getCandidateLinkByToken(req.params.token);
      if (!candidateLink || !candidateLink.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      const { response, reason, message: responseMessage } = req.body; // response: 'accept' | 'negotiate' | 'decline'
      
      const offer = await storage.getOfferByPassCandidate(candidateLink.passCandidateId);
      if (!offer) {
        return res.status(404).json({ error: "No offer found" });
      }
      
      let newStatus = offer.status;
      if (response === 'accept') {
        newStatus = 'accepted';
        await storage.updatePassCandidate(candidateLink.passCandidateId, { status: 'hired' });
      } else if (response === 'decline') {
        newStatus = 'declined';
        await storage.updateOffer(offer.id, { 
          status: 'declined',
          declineReason: reason,
          respondedAt: new Date()
        });
      } else if (response === 'negotiate') {
        newStatus = 'negotiating';
        await storage.updateOffer(offer.id, { 
          status: 'negotiating',
          negotiationNotes: responseMessage,
          respondedAt: new Date()
        });
      }
      
      if (response === 'accept') {
        await storage.updateOffer(offer.id, { 
          status: 'accepted',
          respondedAt: new Date()
        });
      }
      
      res.json({ message: "Offer response submitted", status: newStatus });
    } catch (error) {
      console.error("Error responding to offer:", error);
      res.status(500).json({ error: "Failed to respond to offer" });
    }
  });
  
  // Candidate confirms assessment completion
  app.post("/api/candidate-pass/:token/assessment-complete", async (req, res) => {
    try {
      const candidateLink = await storage.getCandidateLinkByToken(req.params.token);
      if (!candidateLink || !candidateLink.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      const { assessmentType } = req.body; // 'softSkills' | 'technical'
      
      if (assessmentType === 'softSkills') {
        await storage.updatePassCandidate(candidateLink.passCandidateId, {
          softSkillsCompletedAt: new Date()
        });
      } else if (assessmentType === 'technical') {
        await storage.updatePassCandidate(candidateLink.passCandidateId, {
          technicalCompletedAt: new Date()
        });
      }
      
      res.json({ message: "Assessment completion recorded" });
    } catch (error) {
      console.error("Error recording assessment completion:", error);
      res.status(500).json({ error: "Failed to record assessment completion" });
    }
  });
  
  // ============ HR ACTIONS FOR CANDIDATE PORTAL ============
  
  // HR sends message to candidate
  app.post("/api/pass-candidates/:id/messages", async (req, res) => {
    try {
      const { message, attachments, senderName, senderId } = req.body;
      
      const msg = await storage.createCandidateMessage({
        passCandidateId: parseInt(req.params.id),
        senderType: 'hr',
        senderId,
        senderName: senderName || 'HR Team',
        message,
        attachments
      });
      
      res.status(201).json(msg);
    } catch (error) {
      console.error("Error sending message to candidate:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });
  
  // HR requests document from candidate
  app.post("/api/pass-candidates/:id/document-requests", async (req, res) => {
    try {
      const { docType, label, isRequired, dueDate } = req.body;
      
      const document = await storage.createCandidateDocument({
        passCandidateId: parseInt(req.params.id),
        docType,
        label,
        isRequired: isRequired ?? true,
        status: 'pending',
        dueDate: dueDate ? new Date(dueDate) : undefined
      });
      
      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document request:", error);
      res.status(500).json({ error: "Failed to create document request" });
    }
  });
  
  // HR shares document with candidate
  app.post("/api/pass-candidates/:id/documents/from-hr", async (req, res) => {
    try {
      const { docType, label, fileName, filePath } = req.body;
      
      const document = await storage.createCandidateDocument({
        passCandidateId: parseInt(req.params.id),
        docType,
        label,
        fileName,
        filePath,
        isFromHr: true,
        status: 'uploaded',
        uploadedAt: new Date()
      });
      
      res.status(201).json(document);
    } catch (error) {
      console.error("Error sharing document with candidate:", error);
      res.status(500).json({ error: "Failed to share document" });
    }
  });
  
  // Generate candidate portal link
  app.post("/api/pass-candidates/:id/generate-link", async (req, res) => {
    try {
      const passCandidateId = parseInt(req.params.id);
      const { expiresAt } = req.body;
      
      // Generate a unique token
      const token = `cand_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      const link = await storage.createCandidateLink({
        token,
        passCandidateId,
        canFillApplication: true,
        canTakeAssessment: true,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        isActive: true
      });
      
      res.status(201).json(link);
    } catch (error) {
      console.error("Error generating candidate link:", error);
      res.status(500).json({ error: "Failed to generate link" });
    }
  });

  // ============ ONBOARDING PORTAL ROUTES ============
  
  const STAGE_NAMES: Record<number, string> = {
    1: "Document Collection",
    2: "Medical Examination",
    3: "Visa Processing",
    4: "Contract Generation",
    5: "Emirates ID Application",
    6: "Bank Account Setup",
    7: "IT Setup & Access",
    8: "Orientation & Training",
    9: "Department Onboarding"
  };
  
  const VALID_TASK_IDS = ["documents", "medical", "visa", "contract", "emirates_id", "bank", "it_setup", "training", "department"];
  
  // Get onboarding portal data by token
  app.get("/api/onboarding-portal/:token", async (req, res) => {
    try {
      const link = await storage.getOnboardingLinkByToken(req.params.token);
      if (!link || !link.isActive) {
        return res.status(404).json({ error: "Invalid or expired link" });
      }
      
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(404).json({ error: "Link has expired" });
      }
      
      // Update access count
      await storage.updateOnboardingLinkAccess(link.id);
      
      const onboardingRecord = await storage.getOnboardingRecordById(link.onboardingRecordId);
      if (!onboardingRecord) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      
      const passCandidate = await storage.getPassCandidate(onboardingRecord.passCandidateId);
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }
      
      const candidate = await storage.getCandidate(passCandidate.candidateId);
      const pass = await storage.getPass(passCandidate.passId);
      const offers = await storage.getOffersByPassCandidate(passCandidate.id);
      
      // Initialize Stage 1 if no stages exist yet
      let stageProgress = await storage.getOnboardingStageProgress(onboardingRecord.id);
      if (stageProgress.length === 0) {
        await storage.createOnboardingStageProgress({
          onboardingRecordId: onboardingRecord.id,
          stageNumber: 1,
          stageName: STAGE_NAMES[1],
          status: 'in_progress',
          startedAt: new Date()
        });
        stageProgress = await storage.getOnboardingStageProgress(onboardingRecord.id);
      }
      
      res.json({
        onboardingLink: link,
        onboardingRecord,
        stageProgress,
        candidate,
        pass,
        offer: offers[0] || null
      });
    } catch (error) {
      console.error("Error fetching onboarding portal data:", error);
      res.status(500).json({ error: "Failed to fetch onboarding data" });
    }
  });
  
  // Complete a task in a stage
  app.post("/api/onboarding-portal/:token/complete-task", async (req, res) => {
    try {
      const link = await storage.getOnboardingLinkByToken(req.params.token);
      if (!link || !link.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      // Validate request body
      const completeTaskSchema = z.object({
        stageNumber: z.number().int().min(1).max(9),
        taskId: z.enum(["documents", "medical", "visa", "contract", "emirates_id", "bank", "it_setup", "training", "department"])
      });
      
      const parseResult = completeTaskSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request data", details: parseResult.error.errors });
      }
      
      const { stageNumber, taskId } = parseResult.data;
      
      const onboardingRecord = await storage.getOnboardingRecordById(link.onboardingRecordId);
      if (!onboardingRecord) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      
      // Get or create stage progress
      const stage = await storage.getOrCreateStageProgress(
        onboardingRecord.id,
        stageNumber,
        STAGE_NAMES[stageNumber]
      );
      
      // Mark stage as completed
      await storage.updateOnboardingStageProgress(stage.id, {
        status: 'completed',
        completedAt: new Date()
      });
      
      // Unlock next stage if exists
      if (stageNumber < 9) {
        await storage.getOrCreateStageProgress(
          onboardingRecord.id,
          stageNumber + 1,
          STAGE_NAMES[stageNumber + 1]
        );
        const stages = await storage.getOnboardingStageProgress(onboardingRecord.id);
        const nextStage = stages.find(s => s.stageNumber === stageNumber + 1);
        if (nextStage && nextStage.status === 'locked') {
          await storage.updateOnboardingStageProgress(nextStage.id, {
            status: 'in_progress',
            startedAt: new Date()
          });
        }
      }
      
      // Check if all stages are completed
      const allStages = await storage.getOnboardingStageProgress(onboardingRecord.id);
      const completedCount = allStages.filter(s => s.status === 'completed').length;
      if (completedCount >= 9) {
        await storage.updateOnboardingRecord(onboardingRecord.id, {
          status: 'completed',
          completedAt: new Date()
        });
      }
      
      res.json({ message: "Task completed", stageNumber, taskId });
    } catch (error) {
      console.error("Error completing task:", error);
      res.status(500).json({ error: "Failed to complete task" });
    }
  });
  
  // Sign contract
  app.post("/api/onboarding-portal/:token/sign-contract", async (req, res) => {
    try {
      const link = await storage.getOnboardingLinkByToken(req.params.token);
      if (!link || !link.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      // Validate request body
      const signContractSchema = z.object({
        signatureName: z.string().min(2, "Signature name must be at least 2 characters")
      });
      
      const parseResult = signContractSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request data", details: parseResult.error.errors });
      }
      
      const { signatureName } = parseResult.data;
      
      const onboardingRecord = await storage.getOnboardingRecordById(link.onboardingRecordId);
      if (!onboardingRecord) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      
      // Complete stage 4 (Contract Generation)
      const stage = await storage.getOrCreateStageProgress(
        onboardingRecord.id,
        4,
        STAGE_NAMES[4]
      );
      
      await storage.updateOnboardingStageProgress(stage.id, {
        status: 'completed',
        stageData: { signedBy: signatureName, signedAt: new Date().toISOString() },
        completedAt: new Date()
      });
      
      // Unlock stage 5
      await storage.getOrCreateStageProgress(
        onboardingRecord.id,
        5,
        STAGE_NAMES[5]
      );
      const stages = await storage.getOnboardingStageProgress(onboardingRecord.id);
      const nextStage = stages.find(s => s.stageNumber === 5);
      if (nextStage && nextStage.status === 'locked') {
        await storage.updateOnboardingStageProgress(nextStage.id, {
          status: 'in_progress',
          startedAt: new Date()
        });
      }
      
      res.json({ message: "Contract signed successfully" });
    } catch (error) {
      console.error("Error signing contract:", error);
      res.status(500).json({ error: "Failed to sign contract" });
    }
  });
  
  // Upload document
  app.post("/api/onboarding-portal/:token/upload-document", async (req, res) => {
    try {
      const link = await storage.getOnboardingLinkByToken(req.params.token);
      if (!link || !link.isActive) {
        return res.status(404).json({ error: "Invalid link" });
      }
      
      // Validate request body
      const uploadDocSchema = z.object({
        stageNumber: z.number().int().min(1).max(9),
        docType: z.string().min(1),
        fileName: z.string().min(1)
      });
      
      const parseResult = uploadDocSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request data", details: parseResult.error.errors });
      }
      
      const { stageNumber, docType, fileName } = parseResult.data;
      
      const onboardingRecord = await storage.getOnboardingRecordById(link.onboardingRecordId);
      if (!onboardingRecord) {
        return res.status(404).json({ error: "Onboarding record not found" });
      }
      
      const stage = await storage.getOrCreateStageProgress(
        onboardingRecord.id,
        stageNumber,
        STAGE_NAMES[stageNumber]
      );
      
      // Update documents uploaded (just log it for now - real implementation would store files)
      const currentDocs = (stage.documentsUploaded as any[]) || [];
      currentDocs.push({
        docType,
        fileName,
        uploadedAt: new Date().toISOString()
      });
      
      await storage.updateOnboardingStageProgress(stage.id, {
        documentsUploaded: currentDocs
      });
      
      res.json({ message: "Document uploaded", docType, fileName });
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });
  
  // Generate onboarding portal link (HR action)
  app.post("/api/onboarding-records/:id/generate-link", async (req, res) => {
    try {
      const onboardingRecordId = parseInt(req.params.id);
      const { expiresAt } = req.body;
      
      const link = await storage.createOnboardingLink({
        onboardingRecordId,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        isActive: true
      });
      
      res.status(201).json(link);
    } catch (error) {
      console.error("Error generating onboarding link:", error);
      res.status(500).json({ error: "Failed to generate link" });
    }
  });

  // ============ ACTIVITY LOG ROUTES ============
  app.get("/api/passes/:passId/activities", async (req, res) => {
    try {
      const activities = await storage.getActivitiesByPass(parseInt(req.params.passId));
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  // ============ DOCUMENT/RESUME UPLOAD ROUTES ============
  app.post("/api/candidates/:id/resume", async (req, res) => {
    try {
      const candidateId = parseInt(req.params.id);
      const { resumeText, fileName } = req.body;
      
      if (!resumeText) {
        return res.status(400).json({ error: "Resume text is required" });
      }

      const candidate = await storage.updateCandidate(candidateId, {
        cvFileName: fileName || "resume.txt",
        cvFilePath: `/resumes/${candidateId}/${fileName || "resume.txt"}`
      });

      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      res.json({ message: "Resume uploaded successfully", candidate });
    } catch (error) {
      console.error("Error uploading resume:", error);
      res.status(500).json({ error: "Failed to upload resume" });
    }
  });

  // ============ AI ROUTES ============
  
  // AI Agent Tools Definition
  const aiAgentTools: any[] = [
    {
      name: "create_recruitment_pass",
      description: "Create a new recruitment pass (job requisition) in the system. Use this when the user wants to start hiring for a new position.",
      input_schema: {
        type: "object",
        properties: {
          positionTitle: { type: "string", description: "The job title for the position" },
          department: { type: "string", description: "Department name (e.g., Engineering, Sales, Marketing, Finance, Operations, HR, Executive)" },
          location: { type: "string", description: "Work location, default is 'Abu Dhabi, UAE'" },
          employmentType: { type: "string", enum: ["Full-time", "Part-time", "Contract", "Temporary"], description: "Type of employment" },
          headcount: { type: "number", description: "Number of positions to fill, default is 1" },
          experienceMin: { type: "number", description: "Minimum years of experience required" },
          experienceMax: { type: "number", description: "Maximum years of experience" },
          salaryRangeMin: { type: "number", description: "Minimum salary in AED" },
          salaryRangeMax: { type: "number", description: "Maximum salary in AED" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Hiring priority level" },
          notes: { type: "string", description: "Additional notes about the position" }
        },
        required: ["positionTitle", "department"]
      }
    },
    {
      name: "add_candidate",
      description: "Add a new candidate to the system. Use this when the user wants to add a person to the candidate database.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Full name of the candidate" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
          currentTitle: { type: "string", description: "Current job title" },
          currentCompany: { type: "string", description: "Current employer" },
          experienceYears: { type: "number", description: "Years of experience" },
          skills: { type: "array", items: { type: "string" }, description: "List of skills" },
          currentLocation: { type: "string", description: "Current location" },
          expectedSalary: { type: "number", description: "Expected salary in AED" },
          source: { type: "string", description: "How the candidate was found (e.g., LinkedIn, Referral, Direct)" }
        },
        required: ["name"]
      }
    },
    {
      name: "link_candidate_to_pass",
      description: "Link an existing candidate to a recruitment pass, adding them to the hiring pipeline for that position.",
      input_schema: {
        type: "object",
        properties: {
          candidateId: { type: "number", description: "The ID of the candidate" },
          passId: { type: "number", description: "The ID of the recruitment pass" },
          status: { type: "string", enum: ["new", "screening", "shortlisted", "interview", "offer", "hired", "rejected"], description: "Initial status in the pipeline" }
        },
        required: ["candidateId", "passId"]
      }
    },
    {
      name: "update_candidate_status",
      description: "Move a candidate to a different stage in the recruitment pipeline.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link" },
          newStatus: { type: "string", enum: ["new", "screening", "shortlisted", "interview", "offer", "hired", "rejected"], description: "The new status" },
          notes: { type: "string", description: "Optional notes about the status change" }
        },
        required: ["passCandidateId", "newStatus"]
      }
    },
    {
      name: "schedule_interview",
      description: "Schedule an interview for a candidate.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link" },
          interviewDate: { type: "string", description: "Date and time of the interview (ISO format)" },
          interviewType: { type: "string", enum: ["phone", "video", "in-person", "technical", "panel"], description: "Type of interview" },
          stage: { type: "string", enum: ["initial", "technical", "hr", "final", "cultural"], description: "Interview stage" },
          location: { type: "string", description: "Location or video call link" },
          interviewerIds: { type: "array", items: { type: "number" }, description: "IDs of interviewers (managers)" },
          notes: { type: "string", description: "Interview notes or instructions" }
        },
        required: ["passCandidateId", "interviewDate", "interviewType", "stage"]
      }
    },
    {
      name: "generate_job_description",
      description: "Generate a professional job description for a recruitment pass and save it.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The ID of the recruitment pass" }
        },
        required: ["passId"]
      }
    },
    {
      name: "list_passes",
      description: "Get a list of all recruitment passes in the system to show current openings.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "open", "on_hold", "filled", "cancelled"], description: "Filter by status (optional)" }
        }
      }
    },
    {
      name: "list_candidates",
      description: "Get a list of candidates, optionally filtered by pass or search term.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "Filter by recruitment pass ID (optional)" },
          searchTerm: { type: "string", description: "Search by name (optional)" }
        }
      }
    },
    {
      name: "get_pass_details",
      description: "Get detailed information about a specific recruitment pass including candidates.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The ID of the recruitment pass" }
        },
        required: ["passId"]
      }
    },
    {
      name: "get_analytics",
      description: "Get recruitment analytics and statistics.",
      input_schema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "create_offer",
      description: "Create a job offer for a candidate who has been selected for hire.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link" },
          positionTitle: { type: "string", description: "Job title for the offer" },
          baseSalary: { type: "number", description: "Base monthly salary in AED" },
          startDate: { type: "string", description: "Proposed start date (YYYY-MM-DD)" },
          benefits: { type: "string", description: "Benefits package description" },
          notes: { type: "string", description: "Additional offer notes" }
        },
        required: ["passCandidateId", "positionTitle", "baseSalary"]
      }
    },
    {
      name: "score_candidate",
      description: "Use AI to score a candidate against a recruitment pass requirements. Returns a score 0-100 with breakdown.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link to score" }
        },
        required: ["passCandidateId"]
      }
    },
    {
      name: "shortlist_candidate",
      description: "Move a candidate to the shortlisted stage.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link" },
          notes: { type: "string", description: "Reason for shortlisting" }
        },
        required: ["passCandidateId"]
      }
    },
    {
      name: "reject_candidate",
      description: "Reject a candidate from a recruitment pass.",
      input_schema: {
        type: "object",
        properties: {
          passCandidateId: { type: "number", description: "The ID of the pass-candidate link" },
          reason: { type: "string", description: "Reason for rejection" }
        },
        required: ["passCandidateId"]
      }
    },
    {
      name: "get_managers",
      description: "Get a list of managers who can be interviewers or hiring managers.",
      input_schema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "update_pass_status",
      description: "Update the status of a recruitment pass (e.g., open it for applications, put on hold, close it).",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The ID of the recruitment pass" },
          status: { type: "string", enum: ["draft", "open", "on_hold", "filled", "cancelled"], description: "New status" }
        },
        required: ["passId", "status"]
      }
    },
    {
      name: "compare_candidates",
      description: "Compare multiple candidates side-by-side for a specific recruitment pass. Provides detailed comparison of skills, experience, fit, and recommendation.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The recruitment pass ID to compare candidates for" },
          candidateIds: { type: "array", items: { type: "number" }, description: "Array of candidate IDs to compare (2-5 candidates)" }
        },
        required: ["passId"]
      }
    },
    {
      name: "analyze_ideal_candidate",
      description: "Analyze a job description and provide detailed profile of the ideal candidate including skills, experience, personality traits, and what to look for in interviews.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The recruitment pass ID to analyze" }
        },
        required: ["passId"]
      }
    },
    {
      name: "uae_recruitment_advice",
      description: "Get UAE-specific recruitment advice including salary benchmarks, visa requirements, labor law considerations, notice periods, and market insights for a specific role.",
      input_schema: {
        type: "object",
        properties: {
          positionTitle: { type: "string", description: "The job title to get advice for" },
          department: { type: "string", description: "Department (e.g., Engineering, Sales, HR)" },
          experienceLevel: { type: "string", enum: ["entry", "mid", "senior", "executive"], description: "Experience level" },
          topic: { type: "string", enum: ["salary", "visa", "labor_law", "market", "all"], description: "Specific topic or 'all' for comprehensive advice" }
        },
        required: ["positionTitle"]
      }
    },
    {
      name: "draft_candidate_email",
      description: "Draft professional emails to candidates: rejection letters, interview invitations, offer letters, or follow-ups.",
      input_schema: {
        type: "object",
        properties: {
          emailType: { type: "string", enum: ["rejection", "interview_invite", "offer", "followup", "onboarding"], description: "Type of email to draft" },
          candidateName: { type: "string", description: "Candidate's name" },
          positionTitle: { type: "string", description: "Position they applied for" },
          additionalDetails: { type: "string", description: "Additional context (interview date/time, salary for offer, rejection reason, etc.)" }
        },
        required: ["emailType", "candidateName", "positionTitle"]
      }
    },
    {
      name: "hiring_process_advice",
      description: "Get recommendations for hiring timeline, interview process, and best practices based on the role and urgency.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "The recruitment pass ID (optional, for context)" },
          positionTitle: { type: "string", description: "The job title" },
          urgency: { type: "string", enum: ["urgent", "normal", "flexible"], description: "How urgently the position needs to be filled" },
          question: { type: "string", description: "Specific question about the hiring process (optional)" }
        },
        required: ["positionTitle"]
      }
    },
    {
      name: "generate_interview_questions",
      description: "Generate tailored interview questions based on the role, focusing on technical skills, behavioral competencies, and cultural fit.",
      input_schema: {
        type: "object",
        properties: {
          passId: { type: "number", description: "Recruitment pass ID for context" },
          interviewType: { type: "string", enum: ["screening", "technical", "behavioral", "cultural", "final"], description: "Type of interview" },
          focusAreas: { type: "array", items: { type: "string" }, description: "Specific areas to focus on" }
        },
        required: ["passId", "interviewType"]
      }
    }
  ];

  // Tool execution handler
  async function executeAiTool(toolName: string, toolInput: any): Promise<{ success: boolean; result?: any; error?: string }> {
    try {
      switch (toolName) {
        case "create_recruitment_pass": {
          const pass = await storage.createPass({
            positionTitle: toolInput.positionTitle,
            department: toolInput.department || "General",
            location: toolInput.location || "Abu Dhabi, UAE",
            employmentType: toolInput.employmentType || "Full-time",
            headcount: toolInput.headcount || 1,
            experienceMin: toolInput.experienceMin,
            experienceMax: toolInput.experienceMax,
            salaryRangeMin: toolInput.salaryRangeMin,
            salaryRangeMax: toolInput.salaryRangeMax,
            salaryCurrency: "AED",
            priority: toolInput.priority || "medium",
            notes: toolInput.notes || "",
            status: "draft",
            currentStep: "request"
          });
          return { success: true, result: { message: `Created recruitment pass ${pass.passId} for ${toolInput.positionTitle}`, pass } };
        }

        case "add_candidate": {
          const candidate = await storage.createCandidate({
            name: toolInput.name,
            email: toolInput.email || null,
            phone: toolInput.phone || null,
            currentTitle: toolInput.currentTitle || null,
            currentCompany: toolInput.currentCompany || null,
            experienceYears: toolInput.experienceYears || null,
            skills: toolInput.skills || [],
            currentLocation: toolInput.currentLocation || null,
            expectedSalary: toolInput.expectedSalary || null,
            source: toolInput.source || "AI Assistant",
            inTalentPool: false
          });
          return { success: true, result: { message: `Added candidate ${toolInput.name} to the system`, candidate } };
        }

        case "link_candidate_to_pass": {
          const passCandidate = await storage.addCandidateToPass({
            passId: toolInput.passId,
            candidateId: toolInput.candidateId,
            status: toolInput.status || "new"
          });
          return { success: true, result: { message: `Linked candidate to recruitment pass`, passCandidate } };
        }

        case "update_candidate_status": {
          const updated = await storage.updatePassCandidate(toolInput.passCandidateId, {
            status: toolInput.newStatus
          });
          return { success: true, result: { message: `Updated candidate status to ${toolInput.newStatus}`, updated } };
        }

        case "schedule_interview": {
          // Get the pass ID from the pass-candidate link
          const passCandidate = await storage.getPassCandidate(toolInput.passCandidateId);
          if (!passCandidate) {
            return { success: false, error: "Pass-candidate link not found" };
          }
          const interview = await storage.createInterview({
            passId: passCandidate.passId,
            passCandidateId: toolInput.passCandidateId,
            interviewDate: toolInput.interviewDate,
            startTime: "09:00",
            endTime: "10:00",
            duration: 60,
            format: toolInput.interviewType,
            location: toolInput.location || "TBD",
            roundName: toolInput.stage,
            status: "scheduled"
          });
          return { success: true, result: { message: `Scheduled ${toolInput.stage} ${toolInput.interviewType} interview`, interview } };
        }

        case "generate_job_description": {
          const pass = await storage.getPass(toolInput.passId);
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          
          const jdMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Generate a professional job description for:
Position: ${pass.positionTitle}
Department: ${pass.department}
Location: ${pass.location}
Employment Type: ${pass.employmentType}
Experience: ${pass.experienceMin || 0}-${pass.experienceMax || 'open'} years
Salary Range: AED ${pass.salaryRangeMin || 'Negotiable'} - ${pass.salaryRangeMax || 'Negotiable'}

Company: HirePass Demo Company
Industry: Atmospheric Water Generation - sustainable water technology

Create a compelling JD with:
1. Brief company intro (1-2 sentences about our water-from-air technology)
2. Role summary
3. Key responsibilities (5-7 bullet points)
4. Required qualifications
5. Preferred qualifications  
6. What we offer

Make it professional and appealing to candidates in UAE market.`
            }]
          });
          
          const jdContent = jdMessage.content[0];
          if (jdContent.type === "text") {
            await storage.updatePass(toolInput.passId, {
              jobDescriptionDraft: jdContent.text,
              jdStatus: "pending_review"
            });
            return { success: true, result: { message: "Generated and saved job description", jobDescription: jdContent.text } };
          }
          return { success: false, error: "Failed to generate job description" };
        }

        case "list_passes": {
          let passes = await storage.getPasses();
          if (toolInput.status) {
            passes = passes.filter(p => p.status === toolInput.status);
          }
          return { success: true, result: { passes: passes.map(p => ({ id: p.id, passId: p.passId, title: p.positionTitle, department: p.department, status: p.status, headcount: p.headcount })) } };
        }

        case "list_candidates": {
          let candidates = await storage.getCandidates();
          if (toolInput.searchTerm) {
            const term = toolInput.searchTerm.toLowerCase();
            candidates = candidates.filter(c => c.name.toLowerCase().includes(term));
          }
          if (toolInput.passId) {
            const passCandidates = await storage.getPassCandidates(toolInput.passId);
            const candidateIds = passCandidates.map(pc => pc.candidateId);
            candidates = candidates.filter(c => candidateIds.includes(c.id));
          }
          return { success: true, result: { candidates: candidates.map(c => ({ id: c.id, name: c.name, email: c.email, currentTitle: c.currentTitle, experienceYears: c.experienceYears })) } };
        }

        case "get_pass_details": {
          const pass = await storage.getPass(toolInput.passId);
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          const passCandidates = await storage.getPassCandidates(toolInput.passId);
          const positions = await storage.getPassPositions(toolInput.passId);
          return { success: true, result: { pass, candidateCount: passCandidates.length, positions } };
        }

        case "get_analytics": {
          const passes = await storage.getPasses();
          const candidates = await storage.getCandidates();
          const interviews = await storage.getInterviews();
          return {
            success: true,
            result: {
              totalPasses: passes.length,
              activePasses: passes.filter(p => p.status === "open").length,
              totalCandidates: candidates.length,
              scheduledInterviews: interviews.filter(i => i.status === "scheduled").length,
              passBreakdown: {
                draft: passes.filter(p => p.status === "draft").length,
                open: passes.filter(p => p.status === "open").length,
                filled: passes.filter(p => p.status === "filled").length
              }
            }
          };
        }

        case "create_offer": {
          const passCandidate = await storage.getPassCandidate(Number(toolInput.passCandidateId));
          if (!passCandidate) {
            return { success: false, error: "Pass-candidate link not found" };
          }
          const candidate = await storage.getCandidate(passCandidate.candidateId);
          const offer = await storage.createOffer({
            passId: passCandidate.passId,
            passCandidateId: Number(toolInput.passCandidateId),
            salary: toolInput.baseSalary,
            salaryCurrency: "AED",
            startDate: toolInput.startDate || null,
            benefits: toolInput.benefits ? { description: toolInput.benefits } : null,
            negotiationNotes: toolInput.notes || null,
            status: "draft"
          });
          return { success: true, result: { message: `Created offer for ${candidate?.name || "candidate"} - ${toolInput.positionTitle}`, offer } };
        }

        case "score_candidate": {
          const passCandidate = await storage.getPassCandidate(Number(toolInput.passCandidateId));
          if (!passCandidate) {
            return { success: false, error: "Pass-candidate link not found" };
          }
          const candidate = await storage.getCandidate(passCandidate.candidateId);
          const pass = await storage.getPass(passCandidate.passId);
          if (!candidate || !pass) {
            return { success: false, error: "Candidate or pass not found" };
          }
          
          // Handle skills safely - could be array or empty object
          const skillsArray = Array.isArray(candidate.skills) ? candidate.skills : [];
          
          const scoreMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            messages: [{
              role: "user",
              content: `Score this candidate for the position. Return ONLY a JSON object.
              
Position: ${pass.positionTitle}
Department: ${pass.department}
Required Experience: ${pass.experienceMin || 0}-${pass.experienceMax || 'any'} years

Candidate: ${candidate.name}
Experience: ${candidate.experienceYears || 'unknown'} years
Current Title: ${candidate.currentTitle || 'unknown'}
Skills: ${skillsArray.length > 0 ? skillsArray.join(', ') : 'unknown'}
CV Summary: ${candidate.cvSummary || 'Not available'}

Return JSON: {"score": 0-100, "skillsMatch": 0-100, "experienceMatch": 0-100, "overallFit": "strong/moderate/weak", "strengths": ["..."], "gaps": ["..."]}`
            }]
          });
          
          try {
            const scoreContent = scoreMessage.content[0];
            if (scoreContent.type === "text") {
              const scoreData = JSON.parse(scoreContent.text);
              await storage.updatePassCandidate(Number(toolInput.passCandidateId), {
                aiScore: scoreData.score,
                aiBrief: `${scoreData.overallFit} fit - Strengths: ${scoreData.strengths?.join(', ')}. Gaps: ${scoreData.gaps?.join(', ')}`
              });
              return { success: true, result: { message: `Scored ${candidate.name}: ${scoreData.score}/100 (${scoreData.overallFit} fit)`, score: scoreData } };
            }
          } catch (e) {
            return { success: false, error: "Failed to parse AI scoring response" };
          }
          return { success: false, error: "Failed to score candidate" };
        }

        case "shortlist_candidate": {
          const passCandidate = await storage.getPassCandidate(Number(toolInput.passCandidateId));
          if (!passCandidate) {
            return { success: false, error: "Pass-candidate link not found" };
          }
          const candidate = await storage.getCandidate(passCandidate.candidateId);
          await storage.updatePassCandidate(Number(toolInput.passCandidateId), {
            status: "shortlisted",
            selectionNotes: toolInput.notes || "Shortlisted via AI assistant",
            shortlistedAt: new Date()
          });
          return { success: true, result: { message: `Shortlisted ${candidate?.name || "candidate"}` } };
        }

        case "reject_candidate": {
          const passCandidate = await storage.getPassCandidate(Number(toolInput.passCandidateId));
          if (!passCandidate) {
            return { success: false, error: "Pass-candidate link not found" };
          }
          const candidate = await storage.getCandidate(passCandidate.candidateId);
          await storage.updatePassCandidate(Number(toolInput.passCandidateId), {
            status: "rejected",
            rejectionReason: toolInput.reason || "Rejected via AI assistant",
            rejectedAt: new Date()
          });
          return { success: true, result: { message: `Rejected ${candidate?.name || "candidate"}: ${toolInput.reason || "No reason specified"}` } };
        }

        case "get_managers": {
          const managers = await storage.getManagers();
          return { success: true, result: { managers: managers.filter(m => m.isActive).map(m => ({ id: m.id, name: m.name, email: m.email, jobTitle: m.jobTitle })) } };
        }

        case "update_pass_status": {
          const pass = await storage.getPass(Number(toolInput.passId));
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          await storage.updatePass(Number(toolInput.passId), { status: toolInput.status });
          return { success: true, result: { message: `Updated ${pass.passId} status to ${toolInput.status}` } };
        }

        case "compare_candidates": {
          const pass = await storage.getPass(Number(toolInput.passId));
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          
          const allPassCandidates = await storage.getPassCandidates(Number(toolInput.passId));
          if (allPassCandidates.length < 2) {
            return { success: false, error: "Need at least 2 candidates to compare. This pass has fewer candidates." };
          }
          
          // Use provided candidateIds or default to top 5 candidates
          let passCandidates = allPassCandidates;
          if (toolInput.candidateIds && Array.isArray(toolInput.candidateIds) && toolInput.candidateIds.length >= 2) {
            passCandidates = allPassCandidates.filter(pc => 
              toolInput.candidateIds.includes(pc.candidateId)
            );
          }
          
          // Get candidate details (max 5)
          const candidateDetails = await Promise.all(
            passCandidates.slice(0, 5).map(async (pc) => {
              const candidate = await storage.getCandidate(pc.candidateId);
              return { passCandidate: pc, candidate };
            })
          );
          
          const compareMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Compare these candidates for the ${pass.positionTitle} position at HirePass Demo Company.

Position Requirements:
- Department: ${pass.department}
- Experience: ${pass.experienceMin || 0}-${pass.experienceMax || 'open'} years
- Job Description: ${pass.jobDescriptionDraft || 'Not available'}

Candidates:
${candidateDetails.map((cd, i) => {
  const skills = Array.isArray(cd.candidate?.skills) ? cd.candidate.skills : [];
  return `
${i + 1}. ${cd.candidate?.name || 'Unknown'}
   - Current Title: ${cd.candidate?.currentTitle || 'N/A'}
   - Experience: ${cd.candidate?.experienceYears || 'N/A'} years
   - Skills: ${skills.length > 0 ? skills.join(', ') : 'N/A'}
   - AI Score: ${cd.passCandidate.aiScore || 'Not scored'}
   - Status: ${cd.passCandidate.status}
`;
}).join('')}

Provide a detailed comparison with:
1. Side-by-side strengths/weaknesses table
2. Best fit for the role and why
3. Recommended ranking (1st, 2nd, 3rd choice)
4. Key differentiators between candidates
5. Interview focus areas for each candidate`
            }]
          });
          
          const compareContent = compareMessage.content[0];
          if (compareContent.type === "text") {
            return { success: true, result: { comparison: compareContent.text } };
          }
          return { success: false, error: "Failed to generate comparison" };
        }

        case "analyze_ideal_candidate": {
          const pass = await storage.getPass(Number(toolInput.passId));
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          
          const analyzeMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Analyze this position and describe the ideal candidate profile.

Position: ${pass.positionTitle}
Department: ${pass.department}
Location: ${pass.location}
Employment Type: ${pass.employmentType}
Experience Required: ${pass.experienceMin || 0}-${pass.experienceMax || 'open'} years
Salary Range: AED ${pass.salaryRangeMin || 'Negotiable'} - ${pass.salaryRangeMax || 'Negotiable'}
Job Description: ${pass.jobDescriptionDraft || 'Not provided yet'}

Company: HirePass Demo Company
Industry: Atmospheric Water Generation - sustainable water technology in Abu Dhabi, UAE

Provide a comprehensive ideal candidate profile including:

1. MUST-HAVE Skills & Qualifications (non-negotiable)
2. NICE-TO-HAVE Skills (differentiators)
3. Experience Background (ideal career path)
4. Personality Traits & Soft Skills
5. Cultural Fit Indicators (for UAE/GCC environment)
6. Red Flags to Watch For
7. Interview Questions to Assess Fit
8. Where to Source This Candidate (job boards, LinkedIn groups, etc.)`
            }]
          });
          
          const analyzeContent = analyzeMessage.content[0];
          if (analyzeContent.type === "text") {
            return { success: true, result: { idealCandidate: analyzeContent.text } };
          }
          return { success: false, error: "Failed to analyze ideal candidate" };
        }

        case "uae_recruitment_advice": {
          const adviceMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Provide UAE-specific recruitment advice for hiring a ${toolInput.positionTitle} (${toolInput.experienceLevel || 'mid-level'}) in ${toolInput.department || 'General'} department.

Topic Focus: ${toolInput.topic || 'all'}

Please provide expert advice on:

${toolInput.topic === 'salary' || toolInput.topic === 'all' ? `
SALARY BENCHMARKS (UAE Market 2024):
- Entry level range
- Mid-level range  
- Senior level range
- Common benefits/allowances (housing, transport, education)
- Bonus structures typical in UAE
` : ''}

${toolInput.topic === 'visa' || toolInput.topic === 'all' ? `
VISA & WORK PERMITS:
- Types of work visas available
- Sponsorship requirements
- Processing timelines
- Documents needed from candidate
- Medical fitness requirements
- Emirates ID process
` : ''}

${toolInput.topic === 'labor_law' || toolInput.topic === 'all' ? `
UAE LABOR LAW CONSIDERATIONS:
- Probation period rules (max 6 months)
- Notice period requirements
- End of service gratuity calculation
- Annual leave entitlements
- Working hours regulations
- Termination procedures
` : ''}

${toolInput.topic === 'market' || toolInput.topic === 'all' ? `
MARKET INSIGHTS:
- Talent availability in UAE
- Competition for this role
- Best sourcing channels
- Typical time-to-hire
- Candidate expectations
- Nationalization considerations (Emiratization)
` : ''}

Be specific to Abu Dhabi/UAE market. Include practical tips for a solo HR professional.`
            }]
          });
          
          const adviceContent = adviceMessage.content[0];
          if (adviceContent.type === "text") {
            return { success: true, result: { advice: adviceContent.text } };
          }
          return { success: false, error: "Failed to generate UAE advice" };
        }

        case "draft_candidate_email": {
          const emailMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [{
              role: "user",
              content: `Draft a professional ${toolInput.emailType} email for a candidate.

Candidate Name: ${toolInput.candidateName}
Position: ${toolInput.positionTitle}
Additional Details: ${toolInput.additionalDetails || 'None provided'}
Company: HirePass Demo Company
Location: Abu Dhabi, UAE

${toolInput.emailType === 'rejection' ? 
`Draft a respectful, professional rejection email that:
- Thanks them for their interest and time
- Is warm but clear about the decision
- Encourages them for future opportunities
- Maintains company reputation
- Is brief but not cold` : ''}

${toolInput.emailType === 'interview_invite' ? 
`Draft an interview invitation email that:
- Confirms the interview date/time/location from additional details
- Explains what to expect
- Provides preparation guidance
- Includes contact for questions
- Is professional and welcoming` : ''}

${toolInput.emailType === 'offer' ? 
`Draft a job offer email that:
- Congratulates the candidate
- Summarizes key offer details from additional details
- Expresses enthusiasm about them joining
- Provides next steps
- Sets deadline for response` : ''}

${toolInput.emailType === 'followup' ? 
`Draft a follow-up email that:
- Checks in professionally
- References the context from additional details
- Maintains positive relationship
- Has clear call to action` : ''}

${toolInput.emailType === 'onboarding' ? 
`Draft an onboarding welcome email that:
- Warmly welcomes to the team
- Provides first day details
- Lists documents to bring
- Shares what to expect
- Provides HR contact` : ''}

Make it professional, warm, and appropriate for UAE business culture.`
            }]
          });
          
          const emailContent = emailMessage.content[0];
          if (emailContent.type === "text") {
            return { success: true, result: { email: emailContent.text, emailType: toolInput.emailType } };
          }
          return { success: false, error: "Failed to draft email" };
        }

        case "hiring_process_advice": {
          let passContext = "";
          if (toolInput.passId) {
            const pass = await storage.getPass(Number(toolInput.passId));
            if (pass) {
              passContext = `
Current Pass Status: ${pass.status}
Current Step: ${pass.currentStep}
Headcount: ${pass.headcount}
Priority: ${pass.priority}`;
            }
          }
          
          const processMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Provide hiring process recommendations for a ${toolInput.positionTitle} position.

Urgency: ${toolInput.urgency || 'normal'}
${passContext}
${toolInput.question ? `Specific Question: ${toolInput.question}` : ''}

As a recruitment expert, provide:

1. RECOMMENDED TIMELINE
   - Realistic time-to-hire for this role in UAE
   - Key milestones and deadlines
   - Buffer time for visa processing if needed

2. INTERVIEW PROCESS DESIGN
   - Number of interview rounds
   - Who should be involved
   - What to assess at each stage
   - Technical vs behavioral balance

3. EVALUATION CRITERIA
   - Scorecard template for this role
   - Must-have vs nice-to-have checklist
   - Red flags specific to this role

4. EFFICIENCY TIPS FOR SOLO HR
   - How to manage multiple candidates efficiently
   - Tools/templates to speed up process
   - When to involve hiring manager
   - Common bottlenecks and how to avoid them

5. UAE-SPECIFIC CONSIDERATIONS
   - Notice period expectations
   - Visa timeline impact
   - Cultural interview considerations

Be practical and actionable for someone managing recruitment alone.`
            }]
          });
          
          const processContent = processMessage.content[0];
          if (processContent.type === "text") {
            return { success: true, result: { advice: processContent.text } };
          }
          return { success: false, error: "Failed to generate process advice" };
        }

        case "generate_interview_questions": {
          const pass = await storage.getPass(Number(toolInput.passId));
          if (!pass) {
            return { success: false, error: "Recruitment pass not found" };
          }
          
          const questionsMessage = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Generate ${toolInput.interviewType} interview questions for ${pass.positionTitle} position.

Position: ${pass.positionTitle}
Department: ${pass.department}
Experience Level: ${pass.experienceMin || 0}-${pass.experienceMax || 'senior'} years
Interview Type: ${toolInput.interviewType}
Focus Areas: ${toolInput.focusAreas?.join(', ') || 'General assessment'}
Job Description: ${pass.jobDescriptionDraft || 'Not available'}

Generate 10-15 tailored interview questions with:

1. The question
2. What it assesses (skill/competency)
3. What a GOOD answer looks like
4. What a RED FLAG answer looks like
5. Follow-up probing questions

${toolInput.interviewType === 'screening' ? 
'Focus on: Basic qualifications, motivation, availability, salary expectations, notice period' : ''}

${toolInput.interviewType === 'technical' ? 
'Focus on: Technical skills, problem-solving, hands-on experience, knowledge depth' : ''}

${toolInput.interviewType === 'behavioral' ? 
'Focus on: STAR method questions, past experiences, conflict resolution, teamwork' : ''}

${toolInput.interviewType === 'cultural' ? 
'Focus on: Values alignment, work style, adaptability to UAE environment, team fit' : ''}

${toolInput.interviewType === 'final' ? 
'Focus on: Leadership potential, long-term goals, strategic thinking, final concerns' : ''}

Make questions specific to the role, not generic.`
            }]
          });
          
          const questionsContent = questionsMessage.content[0];
          if (questionsContent.type === "text") {
            return { success: true, result: { questions: questionsContent.text, interviewType: toolInput.interviewType } };
          }
          return { success: false, error: "Failed to generate interview questions" };
        }

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error: any) {
      console.error(`Error executing tool ${toolName}:`, error);
      return { success: false, error: error.message || "Tool execution failed" };
    }
  }

  // General AI Chat endpoint with tool use
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt || prompt.length < 3) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      // Get current context for the AI
      const passes = await storage.getPasses();
      const candidates = await storage.getCandidates();
      const currentContext = `
Current System State:
- ${passes.length} recruitment passes (${passes.filter(p => p.status === "open").length} open)
- ${candidates.length} candidates in database
- Recent passes: ${passes.slice(0, 3).map(p => `${p.passId}: ${p.positionTitle}`).join(", ") || "None"}
`;

      const messages: any[] = [
        { role: "user", content: prompt }
      ];

      let response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: `You are an expert AI recruitment assistant for HirePass Demo Company (Abu Dhabi, UAE). You are a knowledgeable HR partner who can both PERFORM ACTIONS and provide expert UAE recruitment guidance.

${currentContext}

YOUR CAPABILITIES:

ACTIONS YOU CAN PERFORM:
1. CREATE recruitment passes for new job openings
2. ADD candidates to the system and LINK them to positions
3. SCHEDULE interviews with candidates
4. UPDATE candidate status (shortlist, reject, move through pipeline)
5. GENERATE professional job descriptions
6. CREATE job offers for selected candidates
7. SCORE candidates using AI analysis

EXPERT ADVICE YOU CAN PROVIDE:
8. COMPARE candidates side-by-side for a position
9. ANALYZE ideal candidate profile based on job requirements
10. UAE RECRUITMENT EXPERTISE: salary benchmarks, visa requirements, labor law, market insights
11. DRAFT professional emails: rejections, interview invites, offers, onboarding
12. HIRING PROCESS recommendations and timelines
13. GENERATE tailored interview questions for any stage

YOU ARE A UAE RECRUITMENT EXPERT:
- Know UAE labor law (probation periods, notice periods, gratuity, working hours)
- Understand visa/work permit processes and timelines
- Have knowledge of UAE salary benchmarks across industries
- Familiar with Emiratization requirements
- Understand cultural considerations for hiring in the GCC region

When users ask you to do something, USE THE TOOLS to actually perform the action. Don't just explain how - DO IT.

When users ask for advice (salary guidance, candidate comparison, ideal profile), use the appropriate analysis tools.

Be concise but thorough. You're supporting a solo HR professional who needs efficient, expert guidance.`,
        messages,
        tools: aiAgentTools
      });

      // Process tool calls in a loop until we get a final response
      const actionsPerformed: any[] = [];
      let maxIterations = 5;
      
      while (response.stop_reason === "tool_use" && maxIterations > 0) {
        maxIterations--;
        
        const toolUseBlocks = response.content.filter((block) => block.type === "tool_use") as Array<{
          type: "tool_use";
          id: string;
          name: string;
          input: Record<string, any>;
        }>;
        const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
        
        for (const toolUse of toolUseBlocks) {
          const result = await executeAiTool(toolUse.name, toolUse.input);
          actionsPerformed.push({ tool: toolUse.name, input: toolUse.input, result });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        }
        
        // Continue conversation with tool results - proper Anthropic API format
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults as any });
        
        response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: `You are an AI recruitment assistant for HirePass Demo Company. You just performed some actions - summarize what you did clearly and helpfully.`,
          messages,
          tools: aiAgentTools
        });
      }

      // Handle case where max iterations reached but still in tool_use mode
      if (response.stop_reason === "tool_use") {
        return res.json({
          response: "I was working on your request but it required more steps than expected. Please try a simpler request or break it into smaller parts.",
          actionsPerformed: actionsPerformed.length > 0 ? actionsPerformed : undefined
        });
      }

      // Extract final text response
      const textBlocks = response.content.filter((block: any) => block.type === "text");
      const responseText = textBlocks.map((block: any) => block.text).join("\n\n") || "I completed the requested actions.";

      res.json({ 
        response: responseText,
        actionsPerformed: actionsPerformed.length > 0 ? actionsPerformed : undefined
      });
    } catch (error: any) {
      console.error("Error in AI chat:", error);
      if (error?.status === 429) {
        return res.status(429).json({ error: "AI service rate limit reached. Please try again in a moment." });
      }
      res.status(500).json({ error: "Failed to process AI request. Please try again." });
    }
  });

  app.post("/api/ai/analyze-resume", async (req, res) => {
    try {
      const resumeText = req.body.resumeText || "";
      
      if (!resumeText || resumeText.length < 50) {
        return res.status(400).json({ error: "Resume text too short for analysis" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Analyze this resume and extract the following information in JSON format:
{
  "name": "string (full name)",
  "email": "string",
  "phone": "string", 
  "currentTitle": "string",
  "currentCompany": "string",
  "experienceYears": number,
  "skills": ["array", "of", "skills"],
  "cvSummary": "brief professional summary (2-3 sentences)"
}

Resume text:
${resumeText}

Return only valid JSON, no additional text.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const analysis = JSON.parse(content.text);
          res.json(analysis);
        } catch {
          res.json({ 
            error: "Could not parse AI response",
            raw: content.text 
          });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error analyzing resume:", error);
      res.status(500).json({ error: "Failed to analyze resume" });
    }
  });

  app.post("/api/ai/generate-jd", async (req, res) => {
    try {
      const { passId } = req.body;
      const pass = await storage.getPass(passId);
      
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Generate a professional job description for:
Position: ${pass.positionTitle}
Department: ${pass.department}
Location: ${pass.location}
Employment Type: ${pass.employmentType}
Experience: ${pass.experienceMin || 0}-${pass.experienceMax || 'open'} years
Salary Range: ${pass.salaryCurrency || 'AED'} ${pass.salaryRangeMin || 'Negotiable'} - ${pass.salaryRangeMax || 'Negotiable'}

Company: HirePass Demo Company
Industry: Atmospheric Water Generation - sustainable water technology

Create a compelling JD with:
1. Brief company intro (1-2 sentences about our water-from-air technology)
2. Role summary
3. Key responsibilities (5-7 bullet points)
4. Required qualifications
5. Preferred qualifications  
6. What we offer

Make it professional and appealing to candidates in UAE market.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        await storage.updatePass(passId, {
          jobDescriptionDraft: content.text,
          jdStatus: "pending_review"
        });
        res.json({ jobDescription: content.text });
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error generating JD:", error);
      res.status(500).json({ error: "Failed to generate job description" });
    }
  });

  app.post("/api/ai/evaluate-candidate", async (req, res) => {
    try {
      const { passId, candidateInfo } = req.body;
      const pass = await storage.getPass(passId);
      
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Evaluate this candidate against the job requirements:

JOB: ${pass.positionTitle}
Department: ${pass.department}
Experience Required: ${pass.experienceMin}-${pass.experienceMax} years
Location: ${pass.location}
JD: ${pass.jobDescriptionDraft || pass.jobDescriptionFinal || 'Not available'}

CANDIDATE PROFILE:
${candidateInfo}

Provide evaluation in JSON format:
{
  "matchScore": number (0-100),
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "recommendation": "should_interview" | "maybe" | "pass",
  "interviewFocus": ["area to explore 1", "area to explore 2"],
  "summary": "2-3 sentence summary"
}

Be direct and practical. This is for UAE market.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const evaluation = JSON.parse(content.text);
          res.json(evaluation);
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error evaluating candidate:", error);
      res.status(500).json({ error: "Failed to evaluate candidate" });
    }
  });

  // Generate Technical Assessment
  app.post("/api/ai/generate-assessment", async (req, res) => {
    try {
      const { passId, areas, difficulty } = req.body;
      const pass = await storage.getPass(passId);
      
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Generate a technical assessment for:
Position: ${pass.positionTitle}
Department: ${pass.department}
Assessment Areas: ${areas || pass.technicalAssessmentAreas || 'General technical skills'}
Difficulty: ${difficulty || 'intermediate'}

Create a practical assessment with:
1. 3-4 multiple choice questions (with answers)
2. 2 short answer/coding questions
3. 1 problem-solving scenario

Return in JSON format:
{
  "title": "Assessment title",
  "duration": number (minutes),
  "questions": [
    {
      "type": "multiple_choice" | "short_answer" | "scenario",
      "question": "string",
      "options": ["a", "b", "c", "d"] (for multiple choice),
      "correctAnswer": "string",
      "points": number,
      "rubric": "grading criteria"
    }
  ],
  "totalPoints": number
}

Make questions practical and relevant to UAE/GCC market.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const assessment = JSON.parse(content.text);
          res.json(assessment);
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error generating assessment:", error);
      res.status(500).json({ error: "Failed to generate assessment" });
    }
  });

  // Generate Interview Questions
  app.post("/api/ai/generate-interview-questions", async (req, res) => {
    try {
      const { passId, interviewType, candidateInfo } = req.body;
      const pass = await storage.getPass(passId);
      
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Generate interview questions for:
Position: ${pass.positionTitle}
Department: ${pass.department}
Interview Type: ${interviewType || 'general'}
${candidateInfo ? `Candidate Background: ${candidateInfo}` : ''}

Generate 8-10 tailored interview questions including:
- 2 behavioral/cultural fit questions
- 3 technical/competency questions
- 2 situational/problem-solving questions
- 2 career motivation questions

Return in JSON format:
{
  "questions": [
    {
      "category": "behavioral" | "technical" | "situational" | "motivation",
      "question": "string",
      "followUp": "optional follow-up question",
      "lookFor": "what a good answer should include"
    }
  ]
}

Questions should be relevant to UAE work culture.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const questions = JSON.parse(content.text);
          res.json(questions);
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error generating interview questions:", error);
      res.status(500).json({ error: "Failed to generate interview questions" });
    }
  });

  // Technical Assessment CRUD Routes
  app.get("/api/passes/:passId/assessments", async (req, res) => {
    try {
      const assessments = await storage.getAssessmentsByPass(parseInt(req.params.passId));
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ error: "Failed to fetch assessments" });
    }
  });

  app.post("/api/assessments", async (req, res) => {
    try {
      const validated = insertTechnicalAssessmentSchema.parse(req.body);
      const assessment = await storage.createAssessment(validated);
      res.status(201).json(assessment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating assessment:", error);
      res.status(500).json({ error: "Failed to create assessment" });
    }
  });

  app.post("/api/ai/rank-candidates", async (req, res) => {
    try {
      const { passId } = req.body;
      if (!passId) {
        return res.status(400).json({ error: "passId is required" });
      }

      const pass = await storage.getPass(passId);
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const passCandidates = await storage.getPassCandidates(passId);
      if (!passCandidates.length) {
        return res.json({ ranked: [], message: "No candidates to rank" });
      }

      const candidateProfiles = passCandidates.map(pc => ({
        id: pc.id,
        candidateId: pc.candidateId,
        name: pc.candidate?.name || "Unknown",
        title: pc.candidate?.currentTitle || "",
        company: pc.candidate?.currentCompany || "",
        experience: pc.candidate?.experienceYears || 0,
        skills: pc.candidate?.skills || [],
        currentStatus: pc.status,
        existingScore: pc.aiScore
      }));

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Rank and score these candidates for the position:

JOB DETAILS:
Position: ${pass.positionTitle}
Department: ${pass.department}
Experience Required: ${pass.experienceMin || 0}-${pass.experienceMax || 10} years
${pass.jobDescriptionDraft ? `Description: ${pass.jobDescriptionDraft.substring(0, 500)}` : ''}

CANDIDATES:
${candidateProfiles.map((c, i) => `
${i + 1}. ${c.name}
   - Current Title: ${c.title}
   - Company: ${c.company}
   - Experience: ${c.experience} years
   - Skills: ${Array.isArray(c.skills) ? c.skills.join(', ') : 'Not specified'}
`).join('')}

Return in JSON format:
{
  "rankings": [
    {
      "passCandidateId": number,
      "rank": number (1 being best),
      "score": number (0-100),
      "matchStrength": "excellent" | "good" | "moderate" | "weak",
      "keyStrengths": ["string"],
      "gaps": ["string"],
      "brief": "1-2 sentence summary of fit"
    }
  ]
}

Rank based on skills match, experience level, and seniority alignment with UAE market expectations.`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const rankings = JSON.parse(content.text);
          
          for (const rank of rankings.rankings) {
            await storage.updatePassCandidate(rank.passCandidateId, {
              aiScore: rank.score,
              aiRank: rank.rank,
              aiBrief: rank.brief
            });
          }
          
          const updatedCandidates = await storage.getPassCandidates(passId);
          res.json({ ranked: updatedCandidates, rankings: rankings.rankings });
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error ranking candidates:", error);
      res.status(500).json({ error: "Failed to rank candidates" });
    }
  });

  app.post("/api/ai/match-skills", async (req, res) => {
    try {
      const { passId, candidateId } = req.body;
      
      const pass = await storage.getPass(passId);
      const candidate = await storage.getCandidate(candidateId);
      
      if (!pass || !candidate) {
        return res.status(404).json({ error: "Pass or candidate not found" });
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Analyze skill match between this candidate and position:

POSITION:
${pass.positionTitle} at ${pass.department}
${pass.jobDescriptionDraft || ''}

CANDIDATE:
Name: ${candidate.name}
Current Role: ${candidate.currentTitle} at ${candidate.currentCompany}
Experience: ${candidate.experienceYears} years
Skills: ${Array.isArray(candidate.skills) ? candidate.skills.join(', ') : 'Not specified'}
${candidate.cvSummary ? `CV Summary: ${candidate.cvSummary}` : ''}

Return in JSON format:
{
  "overallMatch": number (0-100),
  "skillAnalysis": {
    "matched": ["skill that matches requirement"],
    "missing": ["required skill candidate lacks"],
    "bonus": ["candidate skill that adds value beyond requirements"]
  },
  "experienceAssessment": {
    "level": "junior" | "mid" | "senior" | "lead" | "executive",
    "meetsRequirement": boolean,
    "notes": "string"
  },
  "cultureFit": {
    "uaeMarketRelevance": "high" | "medium" | "low",
    "notes": "string"
  },
  "recommendation": {
    "action": "proceed" | "consider" | "reject",
    "priority": "high" | "medium" | "low",
    "reasoning": "string"
  }
}`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const analysis = JSON.parse(content.text);
          res.json(analysis);
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error matching skills:", error);
      res.status(500).json({ error: "Failed to match skills" });
    }
  });

  // ============ AI CANDIDATE SCORING ENDPOINTS ============
  
  // Score a single candidate with detailed AI analysis
  app.post("/api/ai/score-candidate", async (req, res) => {
    try {
      const { passId, passCandidateId } = req.body;
      
      if (!passId || !passCandidateId) {
        return res.status(400).json({ error: "passId and passCandidateId are required" });
      }

      const pass = await storage.getPass(passId);
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const passCandidates = await storage.getPassCandidates(passId);
      const passCandidate = passCandidates.find(pc => pc.id === passCandidateId);
      
      if (!passCandidate) {
        return res.status(404).json({ error: "Pass candidate not found" });
      }

      const candidate = passCandidate.candidate;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Perform a comprehensive AI scoring analysis for this candidate applying to a position.

JOB REQUIREMENTS:
Position: ${pass.positionTitle}
Department: ${pass.department}
Location: ${pass.location}
Employment Type: ${pass.employmentType}
Experience Required: ${pass.experienceMin || 0} - ${pass.experienceMax || 10} years
${pass.jobDescriptionDraft ? `Job Description: ${pass.jobDescriptionDraft.substring(0, 1000)}` : ''}
${pass.jobDescriptionFinal ? `Final JD: ${pass.jobDescriptionFinal.substring(0, 1000)}` : ''}

CANDIDATE PROFILE:
Name: ${candidate?.name || 'Unknown'}
Current Title: ${candidate?.currentTitle || 'Not specified'}
Current Company: ${candidate?.currentCompany || 'Not specified'}
Experience: ${candidate?.experienceYears || 0} years
Skills: ${Array.isArray(candidate?.skills) ? candidate.skills.join(', ') : 'Not specified'}
Location: ${candidate?.currentLocation || 'Not specified'}
Expected Salary: ${candidate?.expectedSalary || 'Not specified'} ${candidate?.expectedSalaryCurrency || 'AED'}
${candidate?.cvSummary ? `Resume Summary: ${candidate.cvSummary}` : ''}
${candidate?.linkedinUrl ? `LinkedIn: ${candidate.linkedinUrl}` : ''}

Analyze this candidate and provide a detailed scoring. Consider UAE/GCC market expectations and professional standards.

Return ONLY valid JSON in this exact format:
{
  "overallScore": <number 0-100>,
  "skillsMatch": <number 0-100>,
  "experienceMatch": <number 0-100>,
  "cultureMatch": <number 0-100>,
  "recommendation": "strong_yes" | "yes" | "maybe" | "no",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["area 1", "area 2"],
  "summary": "2-3 sentence executive summary of candidate fit",
  "matchBreakdown": {
    "technicalSkills": <number 0-100>,
    "softSkills": <number 0-100>,
    "industryExperience": <number 0-100>,
    "growthPotential": <number 0-100>
  }
}`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const scoreData = JSON.parse(content.text);
          
          // Save score to database
          await storage.updatePassCandidateAiScore(
            passCandidateId,
            scoreData.overallScore,
            scoreData
          );
          
          res.json({
            success: true,
            passCandidateId,
            ...scoreData
          });
        } catch (parseError) {
          console.error("Failed to parse AI response:", content.text);
          res.status(500).json({ error: "Failed to parse AI scoring response" });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error: any) {
      console.error("Error scoring candidate:", error);
      
      // Handle rate limiting
      if (error.status === 429) {
        return res.status(429).json({ 
          error: "Rate limit exceeded. Please try again in a moment.",
          retryAfter: error.headers?.['retry-after'] || 30
        });
      }
      
      res.status(500).json({ error: "Failed to score candidate" });
    }
  });

  // Batch score multiple candidates
  app.post("/api/ai/batch-score", async (req, res) => {
    try {
      const { passId, passCandidateIds } = req.body;
      
      if (!passId || !passCandidateIds || !Array.isArray(passCandidateIds)) {
        return res.status(400).json({ error: "passId and passCandidateIds array are required" });
      }

      const pass = await storage.getPass(passId);
      if (!pass) {
        return res.status(404).json({ error: "Pass not found" });
      }

      const passCandidates = await storage.getPassCandidates(passId);
      const results: any[] = [];
      const errors: any[] = [];

      // Process candidates sequentially to avoid rate limits
      for (const pcId of passCandidateIds) {
        const passCandidate = passCandidates.find(pc => pc.id === pcId);
        
        if (!passCandidate) {
          errors.push({ passCandidateId: pcId, error: "Not found" });
          continue;
        }

        const candidate = passCandidate.candidate;

        try {
          const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            messages: [
              {
                role: "user",
                content: `Score this candidate for the ${pass.positionTitle} position at ${pass.department}.

Job Requirements:
- Experience: ${pass.experienceMin || 0}-${pass.experienceMax || 10} years
- Location: ${pass.location}
${pass.jobDescriptionDraft ? `- Description: ${pass.jobDescriptionDraft.substring(0, 500)}` : ''}

Candidate:
- Name: ${candidate?.name || 'Unknown'}
- Title: ${candidate?.currentTitle || 'N/A'}
- Experience: ${candidate?.experienceYears || 0} years
- Skills: ${Array.isArray(candidate?.skills) ? candidate.skills.join(', ') : 'N/A'}
${candidate?.cvSummary ? `- Summary: ${candidate.cvSummary.substring(0, 300)}` : ''}

Return ONLY valid JSON:
{
  "overallScore": <0-100>,
  "skillsMatch": <0-100>,
  "experienceMatch": <0-100>,
  "cultureMatch": <0-100>,
  "recommendation": "strong_yes" | "yes" | "maybe" | "no",
  "strengths": ["str1", "str2"],
  "improvements": ["imp1"],
  "summary": "Brief 1-sentence summary"
}`
              }
            ]
          });

          const content = message.content[0];
          if (content.type === "text") {
            const scoreData = JSON.parse(content.text);
            
            await storage.updatePassCandidateAiScore(pcId, scoreData.overallScore, scoreData);
            
            results.push({
              passCandidateId: pcId,
              candidateName: candidate?.name,
              ...scoreData
            });
          }

          // Add small delay between requests to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (scoreError: any) {
          console.error(`Error scoring candidate ${pcId}:`, scoreError);
          
          if (scoreError.status === 429) {
            // If rate limited, wait and add to errors
            errors.push({ 
              passCandidateId: pcId, 
              candidateName: candidate?.name,
              error: "Rate limited - please retry later"
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            errors.push({ 
              passCandidateId: pcId, 
              candidateName: candidate?.name,
              error: scoreError.message || "Scoring failed"
            });
          }
        }
      }

      res.json({
        success: true,
        scored: results.length,
        failed: errors.length,
        results,
        errors
      });
    } catch (error) {
      console.error("Error batch scoring candidates:", error);
      res.status(500).json({ error: "Failed to batch score candidates" });
    }
  });

  app.post("/api/ai/generate-offer-letter", async (req, res) => {
    try {
      const { passId, passCandidateId, salary, startDate, benefits } = req.body;
      
      const pass = await storage.getPass(passId);
      const passCandidates = await storage.getPassCandidates(passId);
      const passCandidate = passCandidates.find(pc => pc.id === passCandidateId);
      
      if (!pass || !passCandidate) {
        return res.status(404).json({ error: "Pass or candidate not found" });
      }

      const candidate = passCandidate.candidate;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        messages: [
          {
            role: "user",
            content: `Generate a professional offer letter for a UAE-based company. Use formal business English.

COMPANY: HirePass Demo Company
LOCATION: Abu Dhabi, UAE

CANDIDATE DETAILS:
Name: ${candidate?.name}
Current Title: ${candidate?.currentTitle || 'N/A'}

OFFER DETAILS:
Position: ${pass.positionTitle}
Department: ${pass.department}
Location: ${pass.location}
Employment Type: ${pass.employmentType}
Salary: ${salary} AED per month
Start Date: ${startDate}
${benefits ? `Benefits: ${benefits}` : ''}

Generate a complete, professional offer letter that includes:
1. Warm welcome and offer statement
2. Position details and reporting structure
3. Compensation and benefits summary
4. Start date and onboarding information
5. Employment terms and conditions standard for UAE
6. Acceptance instructions
7. Professional closing

Return the letter in JSON format:
{
  "subject": "Employment Offer - [Position Title]",
  "body": "Full letter content with proper formatting using \\n for line breaks",
  "summary": "One-line summary of the offer"
}`
          }
        ]
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const letter = JSON.parse(content.text);
          res.json(letter);
        } catch {
          res.json({ raw: content.text });
        }
      } else {
        res.status(500).json({ error: "Unexpected AI response format" });
      }
    } catch (error) {
      console.error("Error generating offer letter:", error);
      res.status(500).json({ error: "Failed to generate offer letter" });
    }
  });

  // ============ NOTIFICATION ROUTES ============
  // Get notifications for current user (using mock user for now)
  app.get("/api/notifications", async (req, res) => {
    try {
      // In a real app, we'd get the user from the session
      // For now, use a mock user ID or get all notifications
      const managerId = req.query.managerId as string;
      const userId = managerId ? `manager-${managerId}` : 'admin-user';
      
      const notificationsList = await storage.getNotifications(userId);
      res.json(notificationsList);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const marked = await storage.markNotificationRead(parseInt(req.params.id));
      if (!marked) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // Mark all notifications as read for a user
  app.patch("/api/notifications/mark-all-read", async (req, res) => {
    try {
      const managerId = req.query.managerId as string;
      const userId = managerId ? `manager-${managerId}` : 'admin-user';
      
      const notificationsList = await storage.getNotifications(userId);
      let markedCount = 0;
      
      for (const notification of notificationsList) {
        if (!notification.isRead) {
          await storage.markNotificationRead(notification.id);
          markedCount++;
        }
      }
      
      res.json({ success: true, markedCount });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  return httpServer;
}

