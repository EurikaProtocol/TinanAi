import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tinanaiRouter from "./tinanai";
import tinanaiBuilderRouter from "./tinanai-builder";
import tinanaiProjectsRouter from "./tinanai-projects";
import tinanaiAgentRunsRouter from "./tinanai-agent-runs";
import tinanaiResearchRouter from "./tinanai-research";
import knowledgeRouter from "./knowledge";
import eurikaRouter from "./eurika";
import tinanPaymentsRouter from "./tinan-payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tinanPaymentsRouter);
router.use(tinanaiRouter);
router.use(tinanaiBuilderRouter);
router.use(tinanaiProjectsRouter);
router.use(tinanaiAgentRunsRouter);
router.use(tinanaiResearchRouter);
router.use(knowledgeRouter);
router.use(eurikaRouter);

export default router;
