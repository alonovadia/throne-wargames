import { Router, type IRouter } from "express";
import healthRouter from "./health";
import wargamesRouter from "./wargames";

const router: IRouter = Router();

router.use(healthRouter);
router.use(wargamesRouter);

export default router;
