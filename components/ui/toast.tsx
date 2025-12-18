"use client";

import { motion, AnimatePresence } from "framer-motion";

export function Toast({ message, show }: { message: string; show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="fixed bottom-6 right-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-lg"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
