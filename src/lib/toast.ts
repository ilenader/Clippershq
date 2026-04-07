import { toast as sonnerToast } from "sonner";

function getDuration(message: string): number {
  if (message.length > 100) return 7000;
  if (message.length > 50) return 5000;
  return 3000;
}

export const toast = {
  success(message: string, opts?: any) {
    return sonnerToast.success(message, { duration: getDuration(message), ...opts });
  },
  error(message: string, opts?: any) {
    return sonnerToast.error(message, { duration: getDuration(message), ...opts });
  },
  info(message: string, opts?: any) {
    return sonnerToast.info(message, { duration: getDuration(message), ...opts });
  },
  warning(message: string, opts?: any) {
    return sonnerToast.warning(message, { duration: getDuration(message), ...opts });
  },
};
