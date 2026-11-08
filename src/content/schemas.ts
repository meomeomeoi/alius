import { z } from 'zod';
import { REGISTRY_NAMES, type RegistryName } from './types';

export const ID_PATTERN = /^[a-z0-9_:.-]+$/;

/** Checked on every raw entry before `extends` is resolved (so partial entries pass). */
export const BaseEntrySchema = z
  .object({
    id: z.string().regex(ID_PATTERN, 'id must match ^[a-z0-9_:.-]+$'),
    extends: z.string().optional(),
  })
  .passthrough();

export const FlagSchema = BaseEntrySchema.extend({
  scope: z.enum(['world', 'commander', 'relation']),
  description: z.string().min(1),
  mutuallyExclusiveWith: z.array(z.string()).optional(),
  setBy: z.array(z.string()).optional(),
});

/** Checked on the resolved (merged) entry. Later packages replace the base schemas below. */
export const registrySchemas: Record<RegistryName, z.ZodTypeAny> = Object.fromEntries(
  REGISTRY_NAMES.map((n) => [n, BaseEntrySchema]),
) as unknown as Record<RegistryName, z.ZodTypeAny>;
registrySchemas.flags = FlagSchema;
