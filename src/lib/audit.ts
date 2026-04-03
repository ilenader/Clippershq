/**
 * Audit logging helper.
 * Records all critical admin/owner actions for traceability.
 */
import { db } from "@/lib/db";

export async function logAudit(params: {
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, any>;
}): Promise<void> {
  if (!db) return;
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        details: params.details ? JSON.stringify(params.details) : null,
      },
    });
  } catch (err) {
    // Non-critical — don't let audit logging failure break the operation
    console.warn("Audit log failed:", err);
  }
}
