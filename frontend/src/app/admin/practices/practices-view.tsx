"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { createPracticeAction } from "@/actions/admin";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { PracticeTable, type Practice } from "./practice-table";

export function PracticesView({ initialPractices }: { initialPractices: Practice[] }) {
  const [practices, setPractices] = useState(initialPractices);
  const [state, action, pending] = useActionState(createPracticeAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success && state.practice) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- append on useActionState success
      setPractices((prev) => [...prev, state.practice]);
      toast.success(`Cabinet "${state.practice.name}" créé`);
      formRef.current?.reset();
    }
    if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <div>
      <div className="mb-8 bg-white/70 backdrop-blur-xl border border-white/50 rounded-lg p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-4">Ajouter un cabinet</h2>
        <form ref={formRef} action={action} className="flex flex-col sm:flex-row gap-3">
          <input
            name="name"
            type="text"
            placeholder="Nom du cabinet"
            required
            className="flex-1 border border-ardoise-200/50 bg-white/50 px-4 py-2.5 text-sm rounded-md backdrop-blur-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <input
            name="finess"
            type="text"
            placeholder="FINESS"
            required
            maxLength={9}
            className="sm:w-48 border border-ardoise-200/50 bg-white/50 px-4 py-2.5 text-sm rounded-md backdrop-blur-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <Button
            variant="cta"
            type="submit"
            disabled={pending}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {pending ? "Création..." : "Ajouter"}
          </Button>
        </form>
      </div>
      <PracticeTable
        practices={practices}
        onUpdate={(updated) => setPractices((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
        onDelete={(id) => setPractices((prev) => prev.filter((p) => p.id !== id))}
      />
    </div>
  );
}
