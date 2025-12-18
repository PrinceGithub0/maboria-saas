import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Toast({ message, show }: { message: string; show: boolean }) {
  const [visible, setVisible] = useState(show);
  useEffect(() => setVisible(show), [show]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="fixed bottom-6 right-6 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg shadow-indigo-500/20"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
