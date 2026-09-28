import type { Goal } from "@myos/shared";
import type z from "zod";
import type { Equal, Expect, Override, RecordOf } from "../../types/type-assertions.js";
import type { goalQuerySchema } from "./goals.query.js";
import type { goalPatchSchema, goalPostSchema, goalRecordSchema } from "./goals.schemas.js";

export type GoalPost = z.infer<typeof goalPostSchema>;
export type GoalPatch = z.infer<typeof goalPatchSchema>;
export type GoalRecord = z.infer<typeof goalRecordSchema>;
export type GoalQuery = z.infer<typeof goalQuerySchema>;

export type GoalEntity = Override<Goal, { createdAt: Date; updatedAt: Date }>;

type _AssertGoalRecordSchemaMatchesRecord = Expect<Equal<GoalRecord, RecordOf<GoalEntity>>>;
