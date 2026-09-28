import type { GoalAllocation } from "@myos/shared";
import type z from "zod";
import type { Equal, Expect, Override, RecordOf } from "../../types/type-assertions.js";
import type { goalAllocationQuerySchema } from "./goalAllocations.query.js";
import type {
  goalAllocationPostSchema,
  goalAllocationRecordSchema,
  goalTransferSchema,
} from "./goalAllocations.schemas.js";

export type GoalAllocationPost = z.infer<typeof goalAllocationPostSchema>;
export type GoalTransferPost = z.infer<typeof goalTransferSchema>;
export type GoalAllocationRecord = z.infer<typeof goalAllocationRecordSchema>;
export type GoalAllocationQuery = z.infer<typeof goalAllocationQuerySchema>;

export type GoalAllocationEntity = Override<GoalAllocation, { createdAt: Date }>;

type _AssertGoalAllocationRecordSchemaMatchesRecord = Expect<
  Equal<GoalAllocationRecord, RecordOf<GoalAllocationEntity>>
>;
